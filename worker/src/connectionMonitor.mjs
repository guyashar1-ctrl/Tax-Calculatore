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
} from './browserSession.mjs';
import { reportStatus } from './apiClient.mjs';

const LOCAL_CHECK_MS = 30_000;
const SERVER_PROBE_MS = 4 * 60_000;
const GMF_RECHECK_MS = 60_000;

let lastCheck = 0;
let lastProbe = 0;
let lastGmfNav = 0;
let shaamReported = null;
let gmfReported = null;

export async function tickConnectionMonitor(userId, workerId, log) {
  const now = Date.now();
  if (now - lastCheck < LOCAL_CHECK_MS) return;
  lastCheck = now;

  let shaam = false;
  let gmf = gmfReported ?? false;

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

      // ── שכבה 2 ──
      if (!shaam) {
        // בלי הפורטל אין מה לבדוק, ובוודאי לא לנווט.
        gmf = false;
      } else {
        const onPage = await readGmfOnCurrentPage(conn.page);
        if (onPage.onGmf) {
          gmf = onPage.ready;           // חינם: כבר שם
        } else if (!gmf && now - lastGmfNav >= GMF_RECHECK_MS) {
          lastGmfNav = now;
          const checked = await openGmfAndCheck(conn.page);
          gmf = checked.ready;
          log(`בדיקת GMF: ${checked.ready ? 'מוכנה' : `דרושה התחברות (${checked.reason})`}`);
        }
      }
    } finally {
      await detach(conn.browser);
    }
  } else {
    gmf = false;
  }

  if (shaam !== shaamReported || gmf !== gmfReported) {
    log(`מצב: פורטל=${shaam ? 'מחובר' : 'מנותק'} · GMF=${gmf ? 'מוכנה' : 'לא מוכנה'}`);
  }
  shaamReported = shaam;
  gmfReported = gmf;

  await reportStatus(userId, workerId, {
    shaam: { connected: shaam, checkedAt: new Date(now).toISOString() },
    gmf: { ready: gmf, checkedAt: new Date(now).toISOString() },
  }).catch(() => { /* דיווח מצב שנכשל לא מפיל את העובד */ });
}

/** אחרי connect/disconnect — מאלץ בדיקה מיידית במקום להמתין. */
export function invalidateConnectionCache() {
  lastCheck = 0;
  lastProbe = 0;
  lastGmfNav = 0;
}
