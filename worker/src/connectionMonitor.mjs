// connectionMonitor.mjs — מה שמדליק את הנורית בכותרת של PIVO, ומה ששומר
// על הסשן ער.
//
// ‼ שתי רשויות בלתי תלויות, כל אחת עם חלון Chrome משלה: שע״ם (פורט 9222)
// וביטוח לאומי (פורט 9223). נורית אחת לכל אחת, ואף אחת לא מדברת על השנייה.
//
// ── שע״ם ──
// ‼ חמש שכבות נמדדות; "ירוק" (הנורית בכותרת) = **1 + 2 בלבד**, באותו
// מחזור חיים של חלון (תיקון מוצר 16.09.2026 — ראה resetShaamLifecycle):
//   1. פורטל שע״ם — כרטיס חכם + PIN. דרכו נולד סשן השער (NS_ID, ~12 שעות).
//   2. מערכת גביית מס הכנסה (GMF) — ה-bootstrap: הסיסמה המשנית שלה משותפת
//      עם מע״מ, ומעבר השער הזה הוא ההוכחה שהחיבור שמיש.
//   3. מע״מ · 4. מגן · 5. ייצוג — יכולות עצמאיות, מתגלות ברקע ומובטחות
//      נקודתית כשפעולה זקוקה להן. אינן תנאי לירוק.
// ירוק שמסתמך רק על הראשונה היה שולח כל אוטומציה היישר לקיר סיסמה; ירוק
// שדורש את כל החמש המתין לניווט מיותר בארבע מערכות.
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
  readGmfOnCurrentPage, openGmfAndCheck, readGmfLoginForm, attemptGmfLoginConfirm,
  readVatOnCurrentPage,
  readNikuiOnCurrentPage,
  readRepresentationOnCurrentPage,
  isOnWorkScreen, peekShaamProgress,
} from './browserSession.mjs';
import {
  attachBtl, detachBtl, classifyBtlAuth, probeBtlSession, pickBtlPage, peekBtlConnected,
} from './btlSession.mjs';
// ‼ אותו כלל המתנה משמש גם את שע״ם (27.09.2026) — הפונקציות טהורות וכלליות;
// רק השמות נולדו בב״ל.
import {
  initialBtlWatch, afterBtlCheck, btlPeekDue, afterBtlPeek, loopSleepMs,
} from './btlLoginWatch.mjs';
import { reportStatus } from './apiClient.mjs';
import { hostIdleSeconds } from './hostActivity.mjs';
import {
  tryGmfAutoLogin, resetGmfAutoLogin, presentGmfLoginToHuman,
  beginShaamLoginCycle, completeShaamLogin, gmfAutoAllowed,
} from './gmfAutoLogin.mjs';

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
let representationReported = null;
let btlReported = null;
/** ההמתנה להתחברות לב״ל — ראה btlLoginWatch.mjs. */
let btlWatch = initialBtlWatch();
/**
 * ההמתנה להתחברות לשע״ם — אותו כלל (27.09.2026). נצפה בהקלטה של גיא: מהרגע
 * שהפורטל נפתח (אחרי כרטיס, PIN, קוד ומספר מעסיק) עברו 11 שניות עד המעבר
 * למסך הסיסמה השנייה, כי החלון נבדק פעם ב-30 שניות. חלון פתוח ולא «ירוק»
 * (פורטל + GMF) ⇒ הצצה כל 2 שניות, עד 10 דקות.
 */
let shaamWatch = initialBtlWatch();
/** מתי GMF נמדדה פתוחה לאחרונה אחרי שהייתה סגורה — לאבחון ניתוקים מהירים. */
let gmfOpenSinceMs = 0;

/** זמן (ms) המדידה הישירה האחרונה של כל שכבת Tier-B. 0 = מעולם לא נמדדה. */
let gmfCheckedAtMs = 0;
let vatCheckedAtMs = 0;
let nikuiCheckedAtMs = 0;
let representationCheckedAtMs = 0;

/**
 * ‼ תיקון מוצר (16.09.2026): "מחובר" ירוק = חיבור **טרי** שעבר את שער GMF
 * (bootstrapped = פורטל חי **וגם** GMF נמדדה מאומתת באותו מחזור חיים).
 * מחזור חיים נגמר כשהחלון הייעודי נסגר (attach⇒not_running) או כשהשרת
 * אישר שסשן הפורטל פג — ואז כל עדות על תת-המערכות נמחקת, כדי ש"GMF מוכנה"
 * מהבוקר לא תדליק ירוק על חיבור חדש שעוד לא הוכיח את עצמו. בלי האיפוס
 * הזה הדגלים כאן שרדו סגירת חלון (נבדק בקוד: אין else שמאפס אותם), ושער
 * `if (!gmf)` למטה גם לא היה בודק את GMF מחדש בחלון החדש.
 */
export function resetShaamLifecycle(log, why) {
  const hadEvidence = gmfReported || vatReported || nikuiReported || representationReported;
  gmfReported = null; vatReported = null; nikuiReported = null; representationReported = null;
  gmfCheckedAtMs = 0; vatCheckedAtMs = 0; nikuiCheckedAtMs = 0; representationCheckedAtMs = 0;
  gmfOpenSinceMs = 0;
  resetGmfAutoLogin();
  // חלון שנסגר / פורטל שפג ⇒ ההתחברות הבאה מתחילה מהסיסמה הראשונה ⇒ ידני.
  beginShaamLoginCycle(why);
  if (hadEvidence) log(`מחזור חיים חדש של שע״ם (${why}) — עדות תת-המערכות אופסה, GMF תוכח מחדש`);
}

/** שע״ם ביקשה את הסיסמה הראשונה — שורה ביומן רק במעבר. */
function noteFirstPassword(log, why) {
  if (beginShaamLoginCycle(why)) log(`שע״ם ביקשה את הסיסמה הראשונה (${why}) — מחזור התחברות חדש: הסיסמה השנייה ידנית עד שנכנסים`);
}

/**
 * ‼ שער מחזור-החיים לאישור אוטומטי של טפסי-משנה (ייצוג, ובעתיד מע״מ/מגן):
 * Chrome רשאי למלא ו-PIVO רשאית ללחוץ «כניסה» **רק** אחרי ש-GMF אומתה
 * חיובית במחזור החיים הנוכחי — כלומר אחרי שהרו"ח עצמו הקים את החיבור
 * (כרטיס+PIN, ובמידת הצורך הקלדת הסיסמה המשנית). במחזור חיים חדש (חלון
 * נסגר, סשן פג בשרת, הפעלה מחדש של העובד) השער סגור עד שהאימות הזה קורה
 * שוב — סיסמה שמורה ישנה לא עוקפת את ההקמה הידנית. מצב בזיכרון בלבד;
 * אותו מקור בדיוק שמדליק את הנורית (bootstrapped).
 */
export function isShaamLifecycleEstablished() {
  return !!(shaamReported && gmfReported);
}

/**
 * ה-job של ההתחברות אימת GMF חיובית — לא ממתינים לסבב המדידה הבא.
 * @returns {boolean} true ⇒ זה עתה הושלמה התחברות מלאה (מעבר ממחזור ידני).
 */
export function markGmfVerified() {
  shaamReported = true;
  gmfReported = true;
  gmfCheckedAtMs = Date.now();
  if (!gmfOpenSinceMs) gmfOpenSinceMs = gmfCheckedAtMs;
  // כניסה מוצלחת ⇒ מותר שוב ניסיון אוטומטי אחד בפעם הבאה ש-GMF תבקש סיסמה,
  // והתחברות מלאה הושלמה ⇒ מכאן סיסמה שנייה לבדה היא אוטומטית.
  resetGmfAutoLogin();
  return completeShaamLogin();
}

export const FULL_LOGIN_DONE_LOG =
  'התחברות מלאה לשע״ם הושלמה — מעכשיו, אם GMF תבקש רק את הסיסמה השנייה, PIVO תיכנס עם השמורה';

/** כמה שניות GMF הייתה פתוחה לפני ש(שוב) ביקשה סיסמה. null ⇒ לא ידוע. */
export function gmfOpenForSeconds(now = Date.now()) {
  return gmfOpenSinceMs ? Math.round((now - gmfOpenSinceMs) / 1000) : null;
}

/** GMF ביקשה סיסמה שוב — מאפסים את השעון (הפתיחה הבאה תימדד מחדש). */
export function noteGmfClosed() {
  gmfOpenSinceMs = 0;
}

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
  if (!conn.ok) return { connected: false, windowOpen: false };
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
    return { connected: btl, windowOpen: true };
  } finally {
    await detachBtl(conn.browser);
  }
}

/**
 * הצצה בחלון ב״ל בין שני סבבים רגילים, רק בזמן שממתינים להתחברות.
 * true ⇒ הרו"ח התחבר עכשיו, והסבב המלא צריך לרוץ ולדווח מיד.
 */
async function peekBtlLogin(now, log) {
  if (!btlPeekDue(btlWatch, now)) return false;
  const conn = await attachBtl();
  if (!conn.ok) {
    // ‼ רק חלון שנסגר מפסיק את ההמתנה; 'blocked' (דיאלוג פתוח) הוא עדיין חלון.
    btlWatch = afterBtlPeek(btlWatch, now, { connected: false, windowOpen: conn.reason !== 'not_running' });
    return false;
  }
  try {
    const connected = await peekBtlConnected(conn.context);
    btlWatch = afterBtlPeek(btlWatch, now, { connected, windowOpen: true });
    if (connected) log('ביטוח לאומי: זוהתה התחברות — מדווח מיד');
    return connected;
  } finally {
    await detachBtl(conn.browser);
  }
}

/**
 * הצצה בחלון שע״ם בין שני סבבים רגילים, רק בזמן שממתינים להתחברות. בלי
 * ניווט. true ⇒ הפורטל נפתח עכשיו (או GMF), והסבב המלא צריך לרוץ מיד — הוא
 * זה שמעביר למסך הסיסמה השנייה.
 */
async function peekShaamLogin(now, log) {
  if (!btlPeekDue(shaamWatch, now)) return false;
  const conn = await attach();
  if (!conn.ok) {
    // 'blocked' = דיאלוג האישור הדיגיטלי / PIN פתוח — הסיסמה הראשונה.
    if (conn.reason === 'blocked') noteFirstPassword(log, 'אישור דיגיטלי / PIN');
    shaamWatch = afterBtlPeek(shaamWatch, now, { connected: false, windowOpen: conn.reason !== 'not_running' });
    return false;
  }
  try {
    const seen = await peekShaamProgress(conn.page.context());
    if (seen.firstPassword) noteFirstPassword(log, 'מסך כניסה של הפורטל');
    // ‼ ממשיכים להמתין — רק הסבב המלא מכריע «ירוק» (פורטל + GMF).
    shaamWatch = afterBtlPeek(shaamWatch, now, { connected: false, windowOpen: true });
    const moved = (seen.portalUp && !shaamReported) || (seen.gmfOpen && !gmfReported);
    if (moved) log('שע״ם: זוהתה התקדמות בהתחברות — ממשיך מיד');
    return moved;
  } finally {
    await detach(conn.browser);
  }
}

/** כמה הלולאה הראשית ישנה כשאין משימה: 2 שניות סביב התחברות לב״ל או לשע״ם. */
export function monitorSleepMs(pollMs) {
  const now = Date.now();
  return Math.min(loopSleepMs(btlWatch, now, pollMs), loopSleepMs(shaamWatch, now, pollMs));
}

export async function tickConnectionMonitor(userId, workerId, log, { scope = 'all' } = {}) {
  const now = Date.now();
  if (now - lastCheck < LOCAL_CHECK_MS) {
    const btlMoved = await peekBtlLogin(now, log).catch(() => false);
    const shaamMoved = scope === 'btl' ? false : await peekShaamLogin(now, log).catch(() => false);
    if (!btlMoved && !shaamMoved) return;
  }
  lastCheck = now;

  let shaam = false;

  const conn = scope === 'btl' ? { ok: false, reason: 'out_of_scope' } : await attach();
  // ‼ חלון סגור = סוף מחזור החיים. 'blocked' (דיאלוג אישור פתוח) אינו סגירה.
  if (!conn.ok && conn.reason === 'not_running') resetShaamLifecycle(log, 'החלון הייעודי סגור');
  if (!conn.ok && conn.reason === 'blocked') noteFirstPassword(log, 'אישור דיגיטלי / PIN');

  let gmf = gmfReported ?? false;
  let vat = vatReported ?? false;
  let nikui = nikuiReported ?? false;
  let representation = representationReported ?? false;
  let firstPasswordNow = false;

  if (conn.ok) {
    try {
      firstPasswordNow = (await peekShaamProgress(conn.page.context())).firstPassword;
      if (firstPasswordNow) noteFirstPassword(log, 'מסך כניסה של הפורטל');
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
          // ‼ רק אישור **מהשרת** שהסשן פג פותח מחזור חיים חדש — לא כשל רשת.
          if (!probe.authenticated && shaamReported) {
            resetShaamLifecycle(log, 'סשן הפורטל פג בצד השרת');
            gmf = false; vat = false; nikui = false; representation = false;
          }
          if (!probe.authenticated) { firstPasswordNow = true; noteFirstPassword(log, 'סשן הפורטל פג'); }
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
      let onGmf = await readGmfOnCurrentPage(conn.page);
      // ‼ הלשונית עומדת על מסך הכניסה של GMF והשדה כבר מולא (הרו"ח בחר את
      // ההצעה של Chrome או הקליד) — PIVO משלימה את הלחיצה על «כניסה» פעם
      // אחת. זה מה שהופך "בחרתי בחלונית" ל-ירוק גם אחרי שה-job כבר עבר
      // ל-needs_human. בוליאני בלבד; מודאל (החלפת סיסמה/OTP) = לא נוגעים.
      // ‼ רק שדה ש-Chrome מילא (autofilled). שדה שמוקלד ביד נראה «מלא» כבר
      // אחרי התו הראשון — לחיצה אז שולחת סיסמה חלקית.
      // ‼ ורק כשהאוטומטי מותר: במחזור התחברות חדש הרו"ח לוחץ «כניסה» בעצמו.
      if (gmfAutoAllowed() && onGmf.onGmf && onGmf.ready === false && onGmf.reason === 'login_required') {
        const form = await readGmfLoginForm(conn.page);
        if (form.onLogin && form.hasValue && form.autofilled && !form.humanOnlyModal) {
          const confirm = await attemptGmfLoginConfirm(conn.page);
          log(`אישור כניסה ל-GMF אחרי שהשדה מולא: ${confirm.ok ? 'הצליח' : `לא אושר (${confirm.reason})`}`);
          onGmf = await readGmfOnCurrentPage(conn.page);
        }
      }
      const onVat = await readVatOnCurrentPage(conn.page);
      const onNikui = await readNikuiOnCurrentPage(conn.page);
      const onRepresentation = await readRepresentationOnCurrentPage(conn.page);

      if (onGmf.ready !== null) { gmf = onGmf.ready; gmfCheckedAtMs = now; }
      // ‼ «התחברות מלאה» נקבעת רק על GMF שנמדדה פתוחה **בסבב הזה** — לא על
      // ערך שמור. נמצא בסימולציה (27.09.2026): הפורטל פג בזמן שהלשונית עמדה
      // על תפריט GMF, ה-true הישן שרד את הכניסה מחדש, ו-PIVO דילגה על מסך
      // הסיסמה השנייה והכריזה «מחובר» בלי ראיה.
      let gmfSeenNow = onGmf.ready === true;
      if (onVat.ready !== null) { vat = onVat.ready; vatCheckedAtMs = now; }
      if (onNikui.ready !== null) { nikui = onNikui.ready; nikuiCheckedAtMs = now; }
      if (onRepresentation.ready !== null) { representation = onRepresentation.ready; representationCheckedAtMs = now; }

      // ── בוטסטרפ יזום, GMF בלבד — החלטת מוצר מאושרת 23.09.2026 ──
      // ‼ מודל האימות המאושר: התחברות ראשית פעם אחת → הכנת אמצעי המשנה
      // **פעם אחת** → מוכן. GMF היא תת-המערכת היחידה שניווט אליה יזום כדי
      // להשיג את הכנת אמצעי המשנה (bootstrapped = shaam && gmf, למטה) —
      // כי "מוכן" כבר נגזר ממנה, לא מכל תת-מערכת.
      // ‼ מע״מ/מגן/ייצוג הוסרו מהניווט היזום בכוונה. תת-מערכות הן
      // **עצלות**: נבדקות רק דרך הקריאה החינמית שלמעלה (אם הלשונית כבר
      // שם) או כשעבודה אמיתית פותחת אותן (openXAndCheck שכל handler קורא
      // בעצמו, כבר קיים). לפני זה: "מחובר" היה מחכה לסיור בארבע מערכות
      // ומנווט את הלשונית שוב ושוב ברקע — גם כשהרו"ח לא ביקש שום דבר מהן.
      // ‼ 27.09.2026 (גיא): «ברגע שנכנסנו לשע״ם — ישר למסך הסיסמה השנייה».
      // פורטל שנפתח עכשיו (דווח מנותק בסבב הקודם של התהליך הזה — לא null של
      // עובד שרק עלה) עוקף את ההמתנה של דקה. במחזור התחברות חדש (הסיסמה
      // הראשונה נדרשה) — השדה בפוקוס והרו"ח ממשיך בעצמו; רק כשהאוטומטי מותר
      // — הסיסמה השמורה. הרו"ח בדיוק עבד בחלון הזה, ולכן אין כאן חטיפת פוקוס.
      const portalJustUp = shaam && shaamReported === false;
      // אחרי סיסמה ראשונה GMF מוכחת מחדש: «מוכנה» שנשמרה מלפני כן אינה ראיה.
      if (portalJustUp && !gmfSeenNow) gmf = false;
      if (shaam && !gmf && (portalJustUp || now - lastSubNav >= SUB_RECHECK_MS)) {
        if (await isOnWorkScreen(conn.page)) {
          // בדיקת מוכנות לא שווה את זה שהמסך שהרו"ח פתח ייעלם מתחת לידיו.
          lastSubNav = now;
          log('דילוג על בוטסטרפ GMF: הדפדפן עומד על מסך שנפתח עבור הרו"ח');
        } else {
          lastSubNav = now;
          const checked = await openGmfAndCheck(conn.page);
          gmf = checked.ready;
          gmfSeenNow = checked.ready;
          gmfCheckedAtMs = now;
          log(`בוטסטרפ GMF: ${checked.ready ? 'מוכנה' : `לא מוכנה (${checked.reason})`}`);
          if (!gmf && portalJustUp && checked.reason === 'login_required') {
            if (gmfAutoAllowed()) {
              const auto = await tryGmfAutoLogin(conn.page, { log });
              log(`כניסה ל-GMF עם הסיסמה השמורה: ${auto.ok ? 'הצליחה' : `לא בוצעה (${auto.reason})`}`);
              if (auto.ok) { gmf = true; gmfSeenNow = true; gmfCheckedAtMs = Date.now(); resetGmfAutoLogin(); }
            } else {
              const shown = await presentGmfLoginToHuman(conn.page);
              log(`מסך הסיסמה השנייה מוכן לרו"ח${shown ? ' (השדה בפוקוס)' : ''} — PIVO לא בוחרת ולא לוחצת במחזור התחברות חדש`);
            }
          }
        }
      }

      // ‼ התחברות מלאה = הפורטל מחובר ו-GMF פתוחה, בלי שום מסך של הסיסמה
      // הראשונה ברקע. מכאן — סיסמה שנייה לבדה היא אוטומטית.
      if (shaam && gmfSeenNow && !firstPasswordNow && completeShaamLogin()) log(FULL_LOGIN_DONE_LOG);
    } finally {
      await detach(conn.browser);
    }
  }
  // ‼ אין else שמאפס gmf/vat/nikui ל-false כשלא ניתן לתפוס דפדפן בכלל
  // (עובד שרק עלה, Chrome סגור). זו גם "לא ניתן למדוד עכשיו" — לא "מת" —
  // ומטופלת באותה צורה: נשאר הערך האחרון, וההתיישנות לפי checkedAt (בצד
  // הלקוח) קובעת אם עדיין אפשר לסמוך עליו. הפורטל עצמו נשאר false כברירת
  // המחדל הקיימת של תחילת הפונקציה — לא שונה כאן.

  if (scope !== 'btl') {
    shaamWatch = afterBtlCheck(shaamWatch, now, {
      connected: shaam && gmf,
      windowOpen: conn.ok || conn.reason === 'blocked',
      wasConnected: !!(shaamReported && gmfReported),
    });
    // ‼ אבחון (27.09.2026): GMF ביקשה את הסיסמה שוב 2.5 דקות אחרי כניסה,
    // בלי ניווט שלנו באמצע, והסיבה לא ידועה. שורה ביומן בכל פעם, עם משך.
    if (gmfReported === true && gmf === false && shaam) {
      const s = gmfOpenForSeconds(now);
      log(`GMF ביקשה שוב את הסיסמה השנייה${s != null ? ` — ${s} שנ׳ אחרי שנפתחה` : ''}`);
      noteGmfClosed();
    }
    if (gmf && !gmfOpenSinceMs) gmfOpenSinceMs = now;
  }

  // ‼ רשות נפרדת לגמרי: כישלון בבדיקת ב״ל לא נוגע בנורית של שע״ם ולהפך.
  // חלון ב״ל סגור אינו תקלה — הוא פשוט «לא מחובר».
  const btlCheck = await checkBtl(now, log).catch(() => ({ connected: false, windowOpen: false }));
  const btl = btlCheck.connected;
  btlWatch = afterBtlCheck(btlWatch, now, { ...btlCheck, wasConnected: !!btlReported });

  if (shaam !== shaamReported || gmf !== gmfReported || vat !== vatReported
    || nikui !== nikuiReported || representation !== representationReported || btl !== btlReported) {
    log(`מצב: פורטל=${shaam ? 'מחובר' : 'מנותק'} · GMF=${gmf ? 'מוכנה' : 'לא מוכנה'} · מע״מ=${vat ? 'מוכנה' : 'לא מוכנה'} · מגן=${nikui ? 'מוכנה' : 'לא מוכנה'} · ייצוג=${representation ? 'מוכנה' : 'לא מוכנה'} · ב״ל=${btl ? 'מחובר' : 'מנותק'}`);
  }
  shaamReported = shaam;
  gmfReported = gmf;
  vatReported = vat;
  nikuiReported = nikui;
  representationReported = representation;
  btlReported = btl;

  const at = new Date(now).toISOString();
  // ‼ 0 = מעולם לא נמדדה ישירות ⇒ מדווחים epoch, לא "עכשיו". "לא נמדד"
  // חייב להיראות ישן מהרגע הראשון, אחרת ה-fallback הראשוני (false) היה
  // מוצג כאילו הוא תוצאה של מדידה טרייה.
  const stamp = (ms) => new Date(ms || 0).toISOString();
  // ‼ 170: חידוש needs_human עמיד — report_worker_status עצמה סורקת, אחרי
  // שהיא כותבת את הסטטוס הטרי הזה, את ה-needs_human jobs ששייכים לאותו
  // worker_id ומחדשת את מה שהתפנה. אין כאן זיכרון תוך-תהליכי: worker_id
  // קבוע להתקנה, ולכן זהות "אותו worker" שורדת הפעלה מחדש. ראה 170.
  // ‼ bootstrapped = הנורית בכותרת. דגל מחזור-חיים, לא מדידה עם שעון: נשאר
  // true גם כשהלשונית עברה למע״מ/מגן, ומתאפס רק ב-resetShaamLifecycle.
  // 203 · לבחירת מחשב להתחברות (אדם ליד המחשב) — מספר בלבד.
  const idleSeconds = await hostIdleSeconds().catch(() => null);
  const statusResult = await reportStatus(userId, workerId, {
    host: { idleSeconds, reportedAt: at },
    shaam: { connected: shaam, bootstrapped: shaam && gmf, checkedAt: at },
    gmf: { ready: gmf, checkedAt: stamp(gmfCheckedAtMs) },
    vat: { ready: vat, checkedAt: stamp(vatCheckedAtMs) },
    nikui: { ready: nikui, checkedAt: stamp(nikuiCheckedAtMs) },
    representation: { ready: representation, checkedAt: stamp(representationCheckedAtMs) },
    btl: { connected: btl, checkedAt: at },
  }).catch(() => null);
  if (statusResult?.resumed?.length) {
    log(`חידשתי jobs שממתינים ל-capability שהתפנתה: ${statusResult.resumed.join(', ')}`);
  }
}

/** אחרי connect/disconnect — מאלץ בדיקה מיידית במקום להמתין. */
export function invalidateConnectionCache() {
  lastCheck = 0;
  lastProbe = 0;
  lastSubNav = 0;
  lastBtlProbe = 0;
}

/**
 * אחרי משימת ב״ל — סבב מיידי, בלי לגעת בקצבים של שע״ם. ‼ לא
 * invalidateConnectionCache: זו הייתה מאלצת בדיקת שרת וניווט בלשונית של שע״ם
 * אחרי כל פעולה בב״ל. כאן רק רוצים לראות מיד שחלון ב״ל נפתח וממתין.
 */
export function checkBtlSoon() {
  lastCheck = 0;
}
