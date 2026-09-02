// connectionMonitor.mjs — מה שמדליק את הנורית בכותרת של PIVO, ומה ששומר
// על הסשן ער.
//
// ‼ שתי רשויות בלתי תלויות, כל אחת עם חלון Chrome משלה: שע״ם (פורט 9222)
// וביטוח לאומי (פורט 9223). נורית אחת לכל אחת, ואף אחת לא מדברת על השנייה.
//
// ── שע״ם ──
// ‼ ארבע שכבות, ו"ירוק" פירושו שכולן מוכנות:
//   1. פורטל שע״ם — כרטיס חכם + PIN.
//   2. מערכת גביית מס הכנסה (GMF).
//   3. מע״מ.
//   4. מגן — ניכויים.
// ירוק שמסתמך רק על הראשונה היה שולח כל אוטומציה היישר לקיר סיסמה.
//
// ‼ המסלול הרגיל, כפי שנצפה ושוחזר פעמיים על סביבת אמת: אחרי אישור דיגיטלי
// ו-PIN בלבד — שלוש שכבות ה-Tier-B עולות מוכנות בלי סיסמה. ההסבר המשוער
// (לא מוכח) הוא סשן שער מתמשך; מה שכן מוכח הוא ההתנהגות. הזנת סיסמה היא
// מסלול נפילה-לאחור, לא ברירת המחדל.
//
// שלושה קצבים:
//   · LOCAL_CHECK_MS  — זול, מקומי. יש חלון, והדף עומד על שע״ם?
//   · SERVER_PROBE_MS — בקשה אחת לפורטל. מאמתת **וגם** מחזיקה ער. מקור האמת
//     לשכבה 1.
//   · SUB_RECHECK_MS  — כמה זמן להמתין לפני ניווט לשכבת Tier-B לבדיקתה.
//
// ‼ לשכבות Tier-B אין בדיקה שקטה. נבדק בפועל: כל מסלול מחזיר ב-fetch את
// אותו שלד SPA באורך זהה בין מחובר ללא־מחובר — השרת לא מפנה, ההכרעה בצד
// הלקוח. לכן בדיקה = ניווט. כדי לא לקפוץ לרו"ח מהמסך, מנווטים רק לשכבה
// שעוד לא אושרה, אחת בכל סבב, ולא יותר מפעם ב-SUB_RECHECK_MS. כשהדף כבר
// עומד על אחת מהן — קוראים את מצבה בחינם.
//
// ‼ זו גם ההתקדמות האוטומטית: אחרי שהרו"ח מקליד PIN (ובמסלול הנפילה גם
// סיסמה), הסבב הבא רואה את השכבה מוכנה וממשיך לבאה — בלי ללחוץ שוב ב-PIVO.
//
// ‼ אין AI כאן. כתובות קבועות, בדיקת מחרוזת קבועה, שדה סיסמה קבוע.
// ‼ שום דבר מהסשן לא נשמר: רק דגלים בוליאניים וחותמות זמן עולים ל-Supabase.

import {
  attach, detach, classifyShaamAuth, probeServerSession,
  readGmfOnCurrentPage, openGmfAndCheck,
  readVatOnCurrentPage, openVatAndCheck,
  readNikuiOnCurrentPage, openNikuiAndCheck,
  isOnWorkScreen,
} from './browserSession.mjs';
import {
  attachBtl, detachBtl, classifyBtlAuth, probeBtlSession, pickBtlPage,
} from './btlSession.mjs';
import { reportStatus } from './apiClient.mjs';

const LOCAL_CHECK_MS = 30_000;
const SERVER_PROBE_MS = 4 * 60_000;
const SUB_RECHECK_MS = 60_000;

let lastCheck = 0;
let lastProbe = 0;
let lastSubNav = 0;
let lastBtlProbe = 0;
let shaamReported = null;
let gmfReported = null;
let vatReported = null;
let nikuiReported = null;
let btlReported = null;

/**
 * הנורית של ביטוח לאומי — חלון נפרד, פורט נפרד, סשן נפרד משע״ם.
 *
 * ‼ שכבה אחת בלבד: «מערכת ייצוג לקוחות» היא יעד אחד מאחורי שער אימות אחד.
 * אין כאן ניווט בין מערכות ולכן גם אין את כל מנגנון ה-Tier-B של שע״ם.
 *
 * ‼ אותה אסימטריה שנלמדה בשע״ם: הקריאה המקומית יכולה רק **להעלות**
 * ל«מחובר». הורדה ל«מנותק» שמורה לבדיקת השרת — אחרת לשונית שנשארה על מסך
 * הכניסה הייתה מכבה נורית שמעליה סשן חי לגמרי.
 */
async function checkBtl(now, log) {
  const conn = await attachBtl();
  if (!conn.ok) return false;
  try {
    const page = await pickBtlPage(conn.context, conn.page);
    const local = await classifyBtlAuth(page);
    let btl = local.connected ? true : (btlReported ?? false);

    if (now - lastBtlProbe >= SERVER_PROBE_MS) {
      lastBtlProbe = now;
      const probe = await probeBtlSession(page);
      if (probe.ok) {
        btl = probe.connected;
        log(`בדיקת סשן ביטוח לאומי: ${probe.connected ? 'חי' : 'פג'} · ${probe.detail}`);
      } else {
        log(`בדיקת סשן ביטוח לאומי נכשלה: ${probe.detail}`);
      }
    }
    return btl;
  } finally {
    await detachBtl(conn.browser);
  }
}

export async function tickConnectionMonitor(userId, workerId, log) {
  const now = Date.now();
  if (now - lastCheck < LOCAL_CHECK_MS) return;
  lastCheck = now;

  let shaam = false;
  let gmf = gmfReported ?? false;
  let vat = vatReported ?? false;
  let nikui = nikuiReported ?? false;

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

      // ── שכבות 2–4, ברצף ובאותה לשונית ──
      // ‼ הסדר הוא גם ההתקדמות האוטומטית: אחרי שהרו"ח מזין סיסמה לשכבה
      // אחת, הסבב הבא רואה אותה מוכנה ועובר מעצמו לבאה. בלי לחיצה נוספת.
      // ‼ אף פעם לא שתי מערכות בו-זמנית: שע״ם חוסם פתיחה כפולה של אותו
      // יישום ומחזיר מסך שגיאה במקום תוכן.
      if (!shaam) {
        gmf = false;
        vat = false;
        nikui = false;
      } else {
        const onGmf = await readGmfOnCurrentPage(conn.page);
        const onVat = await readVatOnCurrentPage(conn.page);
        const onNikui = await readNikuiOnCurrentPage(conn.page);

        // ‼ רק "מוכנה" נקראת בחינם. עמידה על מסך ההתחברות **אינה** עדות
        // ל"לא מוכנה": ייתכן שהסשן חי לגמרי והדף פשוט נשאר שם אחרי ניווט.
        // כשקראנו גם את זה כאמת, הנורית נתקעה כתומה לצמיתות — הקריאה
        // ה"חינמית" גם סתמה את הניווט שהיה מתקן אותה. קרה בפועל.
        if (onGmf.onGmf && onGmf.ready) gmf = true;
        if (onVat.onVat && onVat.ready) vat = true;
        if (onNikui.onNikui && onNikui.ready) nikui = true;

        // שכבה אחת בכל סבב, לפי הסדר, ורק כשהיא עוד לא אושרה כמוכנה.
        if (now - lastSubNav >= SUB_RECHECK_MS) {
          if (await isOnWorkScreen(conn.page)) {
            // בדיקת מוכנות לא שווה את זה שהמסך שהרו"ח פתח ייעלם מתחת לידיו.
            lastSubNav = now;
            log('דילוג על בדיקת שכבה: הדפדפן עומד על מסך שנפתח עבור הרו"ח');
          } else if (!gmf) {
            lastSubNav = now;
            const checked = await openGmfAndCheck(conn.page);
            gmf = checked.ready;
            log(`בדיקת GMF: ${checked.ready ? 'מוכנה' : `לא מוכנה (${checked.reason})`}`);
          } else if (!vat) {
            lastSubNav = now;
            const checked = await openVatAndCheck(conn.page);
            vat = checked.ready;
            log(`בדיקת מע״מ: ${checked.ready ? 'מוכנה' : `לא מוכנה (${checked.reason})`}`);
          } else if (!nikui) {
            lastSubNav = now;
            const checked = await openNikuiAndCheck(conn.page);
            nikui = checked.ready;
            log(`בדיקת מגן: ${checked.ready ? 'מוכנה' : `לא מוכנה (${checked.reason})`}`);
          }
        }
      }
    } finally {
      await detach(conn.browser);
    }
  } else {
    gmf = false;
    vat = false;
    nikui = false;
  }

  // ‼ רשות נפרדת לגמרי: כישלון בבדיקת ב״ל לא נוגע בנורית של שע״ם ולהפך.
  // חלון ב״ל סגור אינו תקלה — הוא פשוט «לא מחובר».
  const btl = await checkBtl(now, log).catch(() => false);

  if (shaam !== shaamReported || gmf !== gmfReported || vat !== vatReported
    || nikui !== nikuiReported || btl !== btlReported) {
    log(`מצב: פורטל=${shaam ? 'מחובר' : 'מנותק'} · GMF=${gmf ? 'מוכנה' : 'לא מוכנה'} · מע״מ=${vat ? 'מוכנה' : 'לא מוכנה'} · מגן=${nikui ? 'מוכנה' : 'לא מוכנה'} · ב״ל=${btl ? 'מחובר' : 'מנותק'}`);
  }
  shaamReported = shaam;
  gmfReported = gmf;
  vatReported = vat;
  nikuiReported = nikui;
  btlReported = btl;

  const at = new Date(now).toISOString();
  await reportStatus(userId, workerId, {
    shaam: { connected: shaam, checkedAt: at },
    gmf: { ready: gmf, checkedAt: at },
    vat: { ready: vat, checkedAt: at },
    nikui: { ready: nikui, checkedAt: at },
    btl: { connected: btl, checkedAt: at },
  }).catch(() => { /* דיווח מצב שנכשל לא מפיל את העובד */ });
}

/** אחרי connect/disconnect — מאלץ בדיקה מיידית במקום להמתין. */
export function invalidateConnectionCache() {
  lastCheck = 0;
  lastProbe = 0;
  lastSubNav = 0;
  lastBtlProbe = 0;
}
