// connectionMonitor.mjs — מה שמדליק את הנורית בכותרת של PIVO, ומה ששומר
// על הסשן ער.
//
// ‼ שתי רשויות בלתי תלויות, כל אחת עם חלון Chrome משלה: שע״ם (פורט 9222)
// וביטוח לאומי (פורט 9223). נורית אחת לכל אחת, ואף אחת לא מדברת על השנייה.
//
// ── שע״ם ──
// ‼ ארבע שכבות, ו"ירוק" (מוכנות **גלובלית**, זו שבכותרת) פירושו שכולן
// מוכנות בו-זמנית:
//   1. פורטל שע״ם — כרטיס חכם + PIN. גם ה-bootstrap: דרכו נולד סשן השער
//      (NS_ID, ~12 שעות) שממנו נולדים סשני שאר המערכות.
//   2. מערכת גביית מס הכנסה (GMF).
//   3. מע״מ.
//   4. מגן — ניכויים.
// ירוק שמסתמך רק על הראשונה היה שולח כל אוטומציה היישר לקיר סיסמה.
//
// ‼ **מוכנות גלובלית ≠ מוכנות ליכולת בודדת.** לכל תת-מערכת (myz/gmf/
// emhan/nik) יש סשן אפליקציה משלה, והם יכולים להתפצל בשני הכיוונים —
// נצפה בפועל: פורטל מחובר ו-GMF דורשת סיסמה, וגם ההפך — GMF פתוחה וחיה
// (כולל מסך שאילתה עובד) בזמן שהפורטל מציג חומת קוד חד-פעמי. לכן שכבות
// Tier-B **נמדדות בעצמן**, ולא נגזרות ממצב הפורטל. גזירה כזאת (ששררה כאן
// קודם: "פורטל=מנותק ⇒ שלוש השכבות=false") מדדה את ההנחה שלה ולא את
// שע״ם — היא מנעה בדיוק את המדידה שהייתה סותרת אותה, ויצרה שליליים-שגויים
// חוזרים בכפתורי הסנכרון בכרטיס. ראה docs/PIVO-AUTOMATION-FOUNDATION.html
// לניתוח המלא.
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
// ‼ לשכבות Tier-B אין בדיקה שקטה (fetch): כל מסלול מחזיר את אותו שלד SPA
// באורך זהה בין מחובר ללא־מחובר — השרת לא מפנה, ההכרעה בצד הלקוח. לכן
// בדיקה יזומה = ניווט, ומותרת **רק כשהפורטל עצמו מוכן**: בלי סשן שער חי
// כל ניווט ינחת על מסך ההתחברות של הפורטל, לא מלמד כלום על תת-המערכת,
// ורק מבזבז לשונית. כשהפורטל למטה — נשארת רק הקריאה החינמית: אם הדף
// כבר עומד על תת-המערכת, מצבה נמדד; אם לא, נשמר הערך שנמדד לאחרונה (ראה
// ה-checkedAt של כל שכבה למטה). כדי לא לקפוץ לרו"ח מהמסך, ניווט יזום
// קורה לשכבה אחת בכל סבב, ולא יותר מפעם ב-SUB_RECHECK_MS.
//
// ‼ זו גם ההתקדמות האוטומטית: אחרי שהרו"ח מקליד PIN (ובמסלול הנפילה גם
// סיסמה), הסבב הבא רואה את השכבה מוכנה וממשיך לבאה — בלי ללחוץ שוב ב-PIVO.
//
// ‼ אין AI כאן. כתובות קבועות, בדיקת מחרוזת קבועה, שדה סיסמה קבוע.
// ‼ שום דבר מהסשן לא נשמר: רק דגלים בוליאניים וחותמות זמן עולים ל-Supabase.
// ‼ חותמת הזמן של כל שכבת Tier-B היא זמן ה**מדידה הישירה** האחרונה שלה —
// לא זמן הדיווח. בלעדי זה, ערך שנשמר בלי מדידה טרייה היה נראה טרי לנצח,
// וזה בדיוק מה שאפשר לכפתור להישאר "מוכן" הרבה אחרי שהמצב האמיתי השתנה.
// ההכרעה "כמה זמן ערך שמור עדיין נחשב אמין" נעשית בצד הלקוח
// (SUBSYSTEM_STALE_AFTER_MS, src/types/automation.ts) — כאן רק מדווחים
// אמת: מתי זה נמדד בפועל.

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

/** זמן (ms) המדידה הישירה האחרונה של כל שכבת Tier-B. 0 = מעולם לא נמדדה. */
let gmfCheckedAtMs = 0;
let vatCheckedAtMs = 0;
let nikuiCheckedAtMs = 0;

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

      // ── שכבות 2–4: קריאה חינמית, תמיד — בלי תלות במצב הפורטל ──
      // ‼ עדות ישירה על תת-מערכת גוברת על מצב הפורטל. אם הלשונית כבר
      // עומדת על GMF/מע״מ/מגן — למשל כי הרו"ח באמצע עבודה שם — מצבה
      // נמדד עכשיו, גם כשהפורטל דיווח "מנותק" (חומת OTP, סשן שער שפג).
      // רק "לא על המערכת בכלל" (ready===null) אינו מדידה, ואז נשאר הערך
      // האחרון שנמדד בפועל.
      const onGmf = await readGmfOnCurrentPage(conn.page);
      const onVat = await readVatOnCurrentPage(conn.page);
      const onNikui = await readNikuiOnCurrentPage(conn.page);

      if (onGmf.ready !== null) { gmf = onGmf.ready; gmfCheckedAtMs = now; }
      if (onVat.ready !== null) { vat = onVat.ready; vatCheckedAtMs = now; }
      if (onNikui.ready !== null) { nikui = onNikui.ready; nikuiCheckedAtMs = now; }

      // ── ניווט יזום לשכבה שעוד לא אושרה, שכבה אחת בכל סבב ──
      // ‼ מותר **רק כשהפורטל מוכן**: בלי סשן שער חי כל ניווט ינחת על
      // מסך ההתחברות של הפורטל עצמו ולא מלמד כלום על תת-המערכת. כשהפורטל
      // למטה, המדידה היחידה האפשרית היא הקריאה החינמית שלמעלה.
      // ‼ הסדר הוא גם ההתקדמות האוטומטית: אחרי שהרו"ח מזין סיסמה לשכבה
      // אחת, הסבב הבא רואה אותה מוכנה ועובר מעצמו לבאה. בלי לחיצה נוספת.
      // ‼ אף פעם לא שתי מערכות בו-זמנית: שע״ם חוסם פתיחה כפולה של אותו
      // יישום ומחזיר מסך שגיאה במקום תוכן.
      if (shaam && now - lastSubNav >= SUB_RECHECK_MS) {
        if (await isOnWorkScreen(conn.page)) {
          // בדיקת מוכנות לא שווה את זה שהמסך שהרו"ח פתח ייעלם מתחת לידיו.
          lastSubNav = now;
          log('דילוג על בדיקת שכבה: הדפדפן עומד על מסך שנפתח עבור הרו"ח');
        } else if (!gmf) {
          lastSubNav = now;
          const checked = await openGmfAndCheck(conn.page);
          gmf = checked.ready;
          gmfCheckedAtMs = now;
          log(`בדיקת GMF: ${checked.ready ? 'מוכנה' : `לא מוכנה (${checked.reason})`}`);
        } else if (!vat) {
          lastSubNav = now;
          const checked = await openVatAndCheck(conn.page);
          vat = checked.ready;
          vatCheckedAtMs = now;
          log(`בדיקת מע״מ: ${checked.ready ? 'מוכנה' : `לא מוכנה (${checked.reason})`}`);
        } else if (!nikui) {
          lastSubNav = now;
          const checked = await openNikuiAndCheck(conn.page);
          nikui = checked.ready;
          nikuiCheckedAtMs = now;
          log(`בדיקת מגן: ${checked.ready ? 'מוכנה' : `לא מוכנה (${checked.reason})`}`);
        }
      }
    } finally {
      await detach(conn.browser);
    }
  }
  // ‼ אין else שמאפס gmf/vat/nikui ל-false כשלא ניתן לתפוס דפדפן בכלל
  // (עובד שרק עלה, Chrome סגור). זו גם "לא ניתן למדוד עכשיו" — לא "מת" —
  // ומטופלת באותה צורה: נשאר הערך האחרון, וההתיישנות לפי checkedAt (בצד
  // הלקוח) קובעת אם עדיין אפשר לסמוך עליו. הפורטל עצמו נשאר false כברירת
  // המחדל הקיימת של תחילת הפונקציה — לא שונה כאן.

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
  // ‼ 0 = מעולם לא נמדדה ישירות ⇒ מדווחים epoch, לא "עכשיו". "לא נמדד"
  // חייב להיראות ישן מהרגע הראשון, אחרת ה-fallback הראשוני (false) היה
  // מוצג כאילו הוא תוצאה של מדידה טרייה.
  const stamp = (ms) => new Date(ms || 0).toISOString();
  await reportStatus(userId, workerId, {
    shaam: { connected: shaam, checkedAt: at },
    gmf: { ready: gmf, checkedAt: stamp(gmfCheckedAtMs) },
    vat: { ready: vat, checkedAt: stamp(vatCheckedAtMs) },
    nikui: { ready: nikui, checkedAt: stamp(nikuiCheckedAtMs) },
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
