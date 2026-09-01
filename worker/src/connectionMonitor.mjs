// connectionMonitor.mjs — מה שמדליק את הנורית בכותרת של PIVO, ומה ששומר
// על הסשן ער.
//
// ‼ שתי שכבות, ו"ירוק" פירושו ששתיהן מוכנות:
//   1. פורטל שע״ם — כרטיס חכם + PIN.
//   2. מערכת גביית מס הכנסה (GMF) — שם משתמש וסיסמה משלה.
// ירוק שמסתמך רק על הראשונה היה שולח כל אוטומציה היישר לקיר סיסמה.
//
// שלושה קצבים:
//   · LOCAL_CHECK_MS  — זול, מקומי. יש חלון, והדף עומד על שע״ם?
//   · SERVER_PROBE_MS — בקשה אחת לפורטל. מאמתת **וגם** מחזיקה ער. מקור האמת
//     לשכבה 1.
//   · GMF_RECHECK_MS  — כמה זמן לחכות לפני ניווט ל-GMF כדי לבדוק אותה.
//
// ‼ ל-GMF אין בדיקה שקטה. נבדק בפועל: כל מסלול שלה מחזיר ב-fetch את אותו
// שלד SPA באורך זהה בין מחובר ללא־מחובר — השרת לא מפנה, ההכרעה בצד הלקוח.
// לכן בדיקת GMF = ניווט אליה. כדי לא לקפוץ לרו"ח מהמסך, מנווטים רק כשעוד
// לא ידוע ש-GMF מוכנה, ולא יותר מפעם ב-GMF_RECHECK_MS. כשהדף כבר עומד על
// GMF — קוראים את המצב בחינם, בלי לנווט.
//
// ‼ זו גם ההתקדמות האוטומטית: אחרי שהרו"ח מקליד PIN, הסבב הבא רואה פורטל
// מאומת ו-GMF לא מוכנה, מנווט לשם לבד, והרו"ח פשוט ממשיך להזין סיסמה —
// בלי ללחוץ שוב ב-PIVO.
//
// ‼ אין AI כאן. כתובות קבועות, בדיקת מחרוזת קבועה, שדה סיסמה קבוע.
// ‼ שום דבר מהסשן לא נשמר: רק דגלים בוליאניים וחותמות זמן עולים ל-Supabase.

import {
  attach, detach, classifyShaamAuth, probeServerSession,
  readGmfOnCurrentPage, openGmfAndCheck,
  readVatOnCurrentPage, openVatAndCheck,
} from './browserSession.mjs';
import { reportStatus } from './apiClient.mjs';

const LOCAL_CHECK_MS = 30_000;
const SERVER_PROBE_MS = 4 * 60_000;
const SUB_RECHECK_MS = 60_000;

let lastCheck = 0;
let lastProbe = 0;
let lastSubNav = 0;
let shaamReported = null;
let gmfReported = null;
let vatReported = null;

export async function tickConnectionMonitor(userId, workerId, log) {
  const now = Date.now();
  if (now - lastCheck < LOCAL_CHECK_MS) return;
  lastCheck = now;

  let shaam = false;
  let gmf = gmfReported ?? false;
  let vat = vatReported ?? false;

  const conn = await attach();
  if (conn.ok) {
    try {
      // ‼ הבדיקה המקומית יכולה רק **להעלות** ל"מחובר", לעולם לא להוריד:
      // היא נשענת על כותרת הטאב, וברגע שמנווטים למסך אחר בשע״ם (למשל GMF)
      // הכותרת כבר אינה HomePage — והנורית קפצה לאפור אף שהסשן חי. קרה
      // בפועל. הורדה ל"מנותק" שמורה לבדיקת השרת.
      const local = await classifyShaamAuth(conn.page);
      shaam = local.authenticated ? true : (shaamReported ?? false);

      if (now - lastProbe >= SERVER_PROBE_MS) {
        lastProbe = now;
        const probe = await probeServerSession(conn.page);
        if (probe.ok) {
          shaam = probe.authenticated;
          log(`בדיקת סשן פורטל: ${probe.authenticated ? 'חי' : 'פג'} · ${probe.detail}`);
        } else {
          log(`בדיקת סשן פורטל נכשלה: ${probe.detail}`);
        }
      }

      // ── שכבות 2 ו-3, ברצף ובאותה לשונית ──
      // ‼ הסדר הוא גם ההתקדמות האוטומטית: אחרי שהרו"ח מזין סיסמה ל-GMF,
      // הסבב הבא רואה GMF מוכנה ועובר מעצמו למע״מ. בלי לחיצה נוספת ב-PIVO.
      // ‼ אף פעם לא שתי מערכות בו-זמנית: הן מסרבות להיפתח פעמיים במקביל.
      if (!shaam) {
        gmf = false;
        vat = false;
      } else {
        const onGmf = await readGmfOnCurrentPage(conn.page);
        const onVat = await readVatOnCurrentPage(conn.page);

        // ‼ רק "מוכנה" נקראת בחינם. עמידה על מסך ההתחברות **אינה** עדות
        // ל"לא מוכנה": ייתכן שהסשן חי לגמרי והדף פשוט נשאר שם אחרי ניווט.
        // כשקראנו גם את זה כאמת, הנורית נתקעה כתומה לצמיתות — הקריאה
        // ה"חינמית" גם סתמה את הניווט שהיה מתקן אותה. קרה בפועל.
        if (onGmf.onGmf && onGmf.ready) gmf = true;
        if (onVat.onVat && onVat.ready) vat = true;

        // שכבה אחת בכל סבב, לפי הסדר, ורק כשהיא עוד לא אושרה כמוכנה.
        if (now - lastSubNav >= SUB_RECHECK_MS) {
          if (!gmf) {
            lastSubNav = now;
            const checked = await openGmfAndCheck(conn.page);
            gmf = checked.ready;
            log(`בדיקת GMF: ${checked.ready ? 'מוכנה' : `דרושה התחברות (${checked.reason})`}`);
          } else if (!vat) {
            lastSubNav = now;
            const checked = await openVatAndCheck(conn.page);
            vat = checked.ready;
            log(`בדיקת מע״מ: ${checked.ready ? 'מוכנה' : `דרושה התחברות (${checked.reason})`}`);
          }
        }
      }
    } finally {
      await detach(conn.browser);
    }
  } else {
    gmf = false;
    vat = false;
  }

  if (shaam !== shaamReported || gmf !== gmfReported || vat !== vatReported) {
    log(`מצב: פורטל=${shaam ? 'מחובר' : 'מנותק'} · GMF=${gmf ? 'מוכנה' : 'לא מוכנה'} · מע״מ=${vat ? 'מוכנה' : 'לא מוכנה'}`);
  }
  shaamReported = shaam;
  gmfReported = gmf;
  vatReported = vat;

  const at = new Date(now).toISOString();
  await reportStatus(userId, workerId, {
    shaam: { connected: shaam, checkedAt: at },
    gmf: { ready: gmf, checkedAt: at },
    vat: { ready: vat, checkedAt: at },
  }).catch(() => { /* דיווח מצב שנכשל לא מפיל את העובד */ });
}

/** אחרי connect/disconnect — מאלץ בדיקה מיידית במקום להמתין. */
export function invalidateConnectionCache() {
  lastCheck = 0;
  lastProbe = 0;
  lastSubNav = 0;
}
