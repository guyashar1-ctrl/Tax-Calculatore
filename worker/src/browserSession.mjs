// browserSession.mjs — the one shared browser primitive every SHAAM handler
// builds on. No LLM, no visual AI, no agentic decisions here or anywhere in
// this file — fixed URLs, fixed timeouts, fixed string/title checks only.
//
// ─── למה פרופיל ייעודי, ולא ה-Chrome הרגיל ─────────────────────────────────
// ‼ זו אינה העדפה — זו מגבלה של Chrome עצמו, שאומתה מול הגרסה המותקנת
// (151.0.7922.175) ומול התיעוד הרשמי:
// https://developer.chrome.com/blog/remote-debugging-port
//
// מ-Chrome 136 ואילך, ‎--remote-debugging-port‎ **אינו מכובד** כשהוא מופנה
// לתיקיית הנתונים הרגילה של Chrome. חובה ‎--user-data-dir‎ לתיקייה שאינה
// ברירת המחדל. הנימוק של Google: תוקפים ניצלו ניפוי-שגיאות מרחוק כדי לחלץ
// עוגיות, ולכן פרופיל לא-סטנדרטי מוצפן במפתח אחר — והנתונים של הפרופיל
// הרגיל מוגנים ממנו.
//
// המשמעות המעשית, ולטובה: הפורט הזה לעולם לא יכול לחשוף את הגלישה הרגילה
// של הרו"ח. הוא רואה אך ורק את פרופיל האוטומציה הייעודי.
//
// ─── מי אחראי על מחזור החיים של החלון ───────────────────────────────────────
// ‼ העובד **פותח** את החלון הייעודי כשהרו"ח לוחץ "שע״ם" בכותרת — זו פעולת
// מוצר, לא כלי פיתוח. הקובץ launch-shaam-chrome.bat נשאר ככלי שחזור בלבד.
//
// ‼ אבל העובד לעולם לא **סוגר** חלון מאומת, ולא משגר שני חלונות: חלון פתוח
// מנוצל מחדש (bringToFront), וסשן מאומת לא מופרע כלל. סגירה/שיגור מחדש
// היו מוחקים את האימות שהרו"ח ביצע ידנית — וזה הדבר היחיד כאן שאי אפשר
// לשחזר אוטומטית.

import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

const CDP_URL = 'http://localhost:9222';
const SHAAM_ROOT = 'https://shaam.taxes.gov.il/';
const SHAAM_ORIGIN = 'https://shaam.taxes.gov.il';

// ‼ מחוץ לריפו בכוונה: הפרופיל מחזיק סשן מחובר חי. בתוך הריפו הוא היה נצפה
// על ידי שרת הפיתוח (קרס ב-EBUSY על קובץ Cookies נעול — קרה בפועל), נראה
// ל-git, ונגרר עם עותקי קוד.
const PROFILE_DIR = resolve(
  process.env.LOCALAPPDATA || process.env.HOME || '.',
  'PIVO', 'shaam-chrome-profile',
);
// ‼ נתיב Chrome אינו קבוע בין מחשבים: 64-bit, 32-bit, והתקנה למשתמש יחיד
// יושבות בשלושה מקומות שונים. נתיב אחד קשיח היה עובד כאן ונשבר אצל מישהו
// אחר, עם הודעת שגיאה שלא מסבירה כלום.
const CHROME_CANDIDATES = [
  process.env.PIVO_CHROME_EXE,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA
    ? resolve(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
    : null,
].filter(Boolean);

export function findChromeExe() {
  return CHROME_CANDIDATES.find((p) => existsSync(p)) ?? null;
}

/**
 * פותח את חלון Chrome הייעודי. **לא מתחבר** — רק פותח חלון גלוי שבו הרו"ח
 * יבצע את האימות בעצמו. נקרא מלחיצת "התחברות" בכותרת.
 *
 * מחזיר { ok } או { ok:false, reason:'chrome_not_found' } — כדי שההודעה
 * לרו"ח תהיה "לא נמצא Chrome" ולא כשל גנרי.
 */
export function launchDedicatedChrome() {
  const exe = findChromeExe();
  if (!exe) return { ok: false, reason: 'chrome_not_found' };
  if (!existsSync(PROFILE_DIR)) mkdirSync(PROFILE_DIR, { recursive: true });
  const child = spawn(exe, [
    '--remote-debugging-port=9222',
    `--user-data-dir=${PROFILE_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    SHAAM_ROOT,
  ], { detached: true, stdio: 'ignore' });
  child.unref();
  return { ok: true };
}

/**
 * מביא את החלון הייעודי לחזית ומוודא שהוא עומד על שע״ם — בלי לפתוח חלון
 * שני ובלי לגעת בסשן מאומת.
 */
export async function focusShaamWindow(page) {
  try { await page.bringToFront(); } catch { /* לא קריטי — החלון עדיין נפתח */ }
  if (!page.url().startsWith(SHAAM_ORIGIN)) {
    // ניווט רק כשהחלון עומד במקום אחר לגמרי (למשל about:blank אחרי פתיחה).
    await page.goto(SHAAM_ROOT, { waitUntil: 'domcontentloaded', timeout: 12000 })
      .catch(() => { /* דיאלוג אישור חוסם — זה בדיוק המצב שמחכים לו */ });
  }
}

/**
 * סוגר את חלון Chrome הייעודי — פעולת "התנתקות" מפורשת.
 * ‼ מזוהה לפי נתיב הפרופיל, כדי שלעולם לא ייסגר Chrome הרגיל של הרו"ח.
 */
export function closeDedicatedChrome() {
  const ps =
    `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | ` +
    `Where-Object { $_.CommandLine -like '*shaam-chrome-profile*' } | ` +
    `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  try {
    execFileSync('powershell', ['-NoProfile', '-Command', ps], { timeout: 15000, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * מתחבר לחלון Chrome הייעודי. כשל חיבור אינו שגיאת מערכת — הוא אומר
 * "החלון הייעודי לא פתוח", ומטופל ב-handlers כ-needs_human.
 *
 * ‼ מחזיר גם את `browser`, כדי שאפשר יהיה להתנתק בסוף כל משימה. חיבור
 * שנשאר פתוח בין משימות היה מחזיק socket ל-Chrome לנצח.
 */
export async function attach() {
  // ‼ שני שלבים, ולא אחד — אומת בפועל: כשדיאלוג בחירת האישור פתוח, נקודת
  // הקצה ה-HTTP של CDP עדיין עונה כרגיל, אבל חיבור ה-WebSocket נתקע עד
  // timeout. בלי ההפרדה הזו, "Chrome לא פתוח" ו"Chrome פתוח וממתין
  // לאישור" נראים זהים — ואז היינו שולחים את הרו"ח לפתוח חלון שכבר פתוח.
  const running = await isDebugEndpointUp();
  try {
    const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 5000 });
    const context = browser.contexts()[0];
    if (!context) {
      await detach(browser);
      return { ok: false, reason: 'no_context', detail: 'no_browser_context' };
    }
    const page = context.pages()[0] ?? await context.newPage();
    return { ok: true, browser, page };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      reason: running ? 'blocked' : 'not_running',
      detail: detail.slice(0, 200),
    };
  }
}

/** האם תהליך Chrome עם פורט ניפוי חי בכלל. HTTP בלבד — לא נתקע מול דיאלוג. */
async function isDebugEndpointUp() {
  try {
    const res = await fetch(`${CDP_URL}/json/version`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * מנתק את החיבור בלבד. ‼ עבור דפדפן שחובר ב-connectOverCDP, close() מנתק
 * את הלקוח ואינו הורג את תהליך Chrome — זה מה שמאפשר "התחבר, בצע, התנתק"
 * שוב ושוב מול אותו חלון מאומת. אומת בבדיקה חוזרת מול תהליך חי.
 */
export async function detach(browser) {
  try { await browser?.close(); } catch { /* החיבור כבר נסגר — לא מעניין */ }
}

/**
 * שלב 1 — "מצא את שע״ם". לא שופט אימות.
 *
 * ‼ אם הדף כבר נמצא בשע״ם — לא מנווטים מחדש. ניווט מיותר מפריע לרו"ח
 * שעומד באמצע מסך, ובמקרה הגרוע מפיל אותו חזרה לדף הבית. עצם היותו שם
 * הוא כבר הראייה שהדומיין מגיב.
 */
export async function detectShaam(page, { timeoutMs = 12000 } = {}) {
  if (page.url().startsWith(SHAAM_ORIGIN)) {
    return { reachable: true, detail: 'already_on_shaam', title: await safeTitle(page), url: page.url() };
  }
  try {
    await page.goto(SHAAM_ROOT, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    return { reachable: true, detail: 'navigated', title: await safeTitle(page), url: page.url() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (NETWORK_FAILURE.test(msg)) {
      return { reachable: false, detail: msg.slice(0, 200), title: null, url: null };
    }
    // ‼ כל דבר אחר — כולל Timeout וכולל net::ERR_ABORTED — נחשב "חסום",
    // לא "לא קיים". אומת בפועל: הקריאה הראשונה בזמן שדיאלוג בחירת האישור
    // פתוח מחזירה Timeout; קריאה שנייה על אותו דף בזמן שהדיאלוג עדיין פתוח
    // מחזירה net::ERR_ABORTED — שתי חתימות שונות לאותה סיבה בדיוק
    // (screens.md: "דיאלוג בחירת אישור חוסם את ה-renderer").
    return { reachable: true, detail: 'navigation_blocked_likely_dialog', title: null, url: null };
  }
}

// כשלים ברורים של רשת/DNS בלבד — לא קשורים לדיאלוג אימות שממתין ללחיצה.
const NETWORK_FAILURE = /net::ERR_NAME_NOT_RESOLVED|net::ERR_CONNECTION_REFUSED|net::ERR_INTERNET_DISCONNECTED|net::ERR_CONNECTION_RESET|net::ERR_NETWORK_CHANGED/i;

/**
 * שלב 2 — "בדוק התחברות לשע״ם". כותרת הטאב 'HomePage' היא סימן ההצלחה
 * המתועד (shaam-login skill · screens.md · מסך E). כל דבר אחר נחשב
 * "לא מאומת", בלי לנחש למה.
 */
export async function classifyShaamAuth(page, { timeoutMs = 12000 } = {}) {
  const probe = await detectShaam(page, { timeoutMs });
  if (!probe.reachable) return { authenticated: false, state: 'unreachable', detail: probe.detail };
  if (probe.detail === 'navigation_blocked_likely_dialog') {
    return { authenticated: false, state: 'auth_required', detail: 'navigation_blocked' };
  }
  if (probe.title === 'HomePage') return { authenticated: true, state: 'authenticated' };
  if (probe.title && /Error_nocard/i.test(probe.title)) {
    return { authenticated: false, state: 'card_not_recognized', detail: probe.title };
  }
  return { authenticated: false, state: 'unknown', detail: probe.title ?? 'no_title' };
}

/**
 * בדיקת אמת מול השרת — **ולא** קריאה של הדף שכבר טעון.
 *
 * ‼ למה זה קיים, וזה חשוב: `classifyShaamAuth` קורא את כותרת הטאב של דף
 * שכבר נטען. אם שע״ם מנתק את הסשן בצד השרת, הדף הטעון ממשיך להציג
 * "HomePage" — והעובד היה ממשיך לדווח "מחובר" מעל סשן מת. הנורית הייתה
 * ירוקה ושקרית. לכן מצב החיבור חייב להישען על תשובה טרייה מהשרת.
 *
 * ‼ שתי מטרות בבקשה אחת: היא גם מאמתת שהסשן חי וגם **מחזיקה אותו ער**.
 * שתי מכניקות נפרדות היו נותנות שני מקורות אמת שיכולים לסתור זה את זה.
 *
 * ‼ בקשה מתוך הדף (fetch) ולא ניווט: ניווט היה קופץ לרו"ח מהמסך שהוא עומד
 * בו באמצע עבודה. כאן שום דבר גלוי לא זז.
 *
 * ‼ קוד 200 **אינו** סימן לחיים. נמדד בפועל מול הפורטל: אותה בקשה בדיוק,
 * פעם עם הסשן ופעם בלעדיו, החזירה 200 בשני המקרים —
 *   עם סשן : 94,622 בייט, נשאר ב-homepage.aspx, ויש "יציאה"
 *   בלי סשן:  3,341 בייט, מופנה ל-/taxes-login/login/otpCts, אין "יציאה"
 * לכן ההכרעה היא לפי **לאן הבקשה נחתה**, ולא לפי הסטטוס.
 *
 * שני סימנים, והחזק שבהם ראשון:
 *   1. הפניה ל-/taxes-login/ ⇒ מנותק. מבני, לא תלוי בשפה או בניסוח.
 *   2. קישור "יציאה" בגוף העמוד ⇒ מחובר (screens.md · מסך E).
 */
const LOGIN_REDIRECT = '/taxes-login/';
export async function probeServerSession(page) {
  if (!page.url().startsWith(SHAAM_ORIGIN)) return { ok: false, authenticated: false, detail: 'not_on_shaam' };
  try {
    const r = await page.evaluate(async () => {
      try {
        const res = await fetch('/myz/pages/homepage.aspx', {
          method: 'GET', cache: 'no-store', credentials: 'include', redirect: 'follow',
        });
        const body = await res.text();
        return { status: res.status, finalUrl: res.url, len: body.length, hasLogout: body.includes('יציאה') };
      } catch (e) { return { status: 0, err: String(e).slice(0, 120) }; }
    });
    if (!r.status) return { ok: false, authenticated: false, detail: r.err ?? 'fetch_failed' };
    const redirectedToLogin = (r.finalUrl ?? '').includes(LOGIN_REDIRECT);
    return {
      ok: true,
      status: r.status,
      finalUrl: r.finalUrl,
      authenticated: r.status === 200 && !redirectedToLogin && !!r.hasLogout,
      detail: `status=${r.status} login_redirect=${redirectedToLogin} logout=${!!r.hasLogout} len=${r.len}`,
    };
  } catch (e) {
    return { ok: false, authenticated: false, detail: e instanceof Error ? e.message.slice(0, 120) : String(e) };
  }
}

// ─── שכבה שנייה: מערכת גביית מס הכנסה (GMF) ────────────────────────────────
// ‼ שתי שכבות אימות נפרדות, וזו לא בחירה שלנו: לפורטל יש כרטיס חכם + PIN,
// ול-GMF יש שם משתמש וסיסמה משלה. "מחובר לשע״ם" מבחינת הרו"ח פירושו ששתיהן
// מוכנות — אחרת כל אוטומציה תיתקל בקיר סיסמה באמצע.
//
// ‼ אין דרך לבדוק את GMF בלי לנווט אליה. נבדק בפועל: בקשת fetch לכל מסלול
// של GMF מחזירה את אותו שלד SPA באורך זהה (5,238 בייט) בין אם יש סשן ובין
// אם לא — השרת אינו מפנה, וההכרעה נעשית בצד הלקוח. לכן הבדיקה היא ניווט
// והתייצבות, ולא בקשה שקטה ברקע.
export const GMF_URL = 'https://shaam.taxes.gov.il/gmf-main-menu?browser=Chrome';
export const GMF_PATH = '/gmf-main-menu';

// ─── שכבה שלישית: מע״מ — מערכת גבייה ───────────────────────────────────────
// ‼ אותו origin כמו GMF (shaam.taxes.gov.il), ולכן סיסמה שנשמרה במנהל
// הסיסמאות של Chrome עבור האתר הזה משרתת את שתיהן. זה מה שהופך "התחברות
// אחת בבוקר" למציאותי בלי שנגע בסיסמה בעצמנו.
//
// ‼ שם המשתמש בטופס הזה הוא readOnly ומגיע מהכרטיס החכם — נצפה בפועל.
// כלומר הסיסמה לבדה אינה ניתנת לשימוש עם זהות אחרת כאן.
export const VAT_URL = 'https://shaam.taxes.gov.il/emhanmainmenu';
export const VAT_PATH = '/emhanmainmenu';

/** קריאה זולה, בלי ניווט: רק אם הדף כבר עומד על מע״מ. */
export async function readVatOnCurrentPage(page) {
  const s = await snapPage(page);
  if (!s.pathname.startsWith(VAT_PATH)) return { onVat: false, ready: null };
  return { onVat: true, ready: !s.hasPasswordField, pathname: s.pathname };
}

/** מנווט למע״מ ומחזיר את מצבה אחרי התייצבות. משאיר את הדפדפן שם. */
export async function openVatAndCheck(page) {
  await page.goto(VAT_URL, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
  const s = await settlePage(page);
  if (!s.pathname.startsWith(VAT_PATH)) {
    return { ready: false, reason: 'unexpected_destination', pathname: s.pathname };
  }
  // ‼ במע״מ הכתובת אינה משתנה בין מחובר ללא־מחובר (WebForms, action="./"),
  // ולכן שדה הסיסמה הוא הסימן היחיד. נצפה בפועל.
  if (s.hasPasswordField) return { ready: false, reason: 'login_required', pathname: s.pathname };
  return { ready: true, pathname: s.pathname };
}

// ─── שכבה רביעית: מגן — מערכת גביית ניכויים ────────────────────────────────
// ‼ אותו origin, ולכן אותה סשן-שער. נצפה בפועל: אחרי אישור דיגיטלי + PIN
// בלבד היא נחתה על frmMainMenu.aspx עם אפס שדות סיסמה — בלי שהוזנה לה
// סיסמה מעולם בפרופיל הזה.
//
// ‼ המערכת הזאת מסרבת להיפתח פעמיים במקביל ("למניעת שיבוש הנתונים לא ניתן
// לפתוח את אותו הישום") ואז מחזירה frmTabErr.aspx. לכן היא נבדקת לבדה,
// ברצף, ולעולם לא במקביל לשכבה אחרת.
export const NIKUI_URL = 'https://shaam.taxes.gov.il/nikmainmenu';
export const NIKUI_PATH = '/nikmainmenu';
const NIKUI_TAB_CONFLICT = /frmTabErr/i;

// ‼ "היישום כבר פתוח" (frmTabErr) נחשב **מוכן**, וזו מסקנה מראיות ולא נוחות:
//   מנותק           ⇒ frmLogin.aspx     (נצפה לפני שהוזנה סיסמה כלשהי)
//   מחובר, פתיחה 1  ⇒ frmMainMenu.aspx  (נצפה בבדיקת השחזור)
//   מחובר, פתיחה 2  ⇒ frmTabErr.aspx    (נצפה בבדיקה חוזרת)
// כלומר אי אפשר להגיע ל-frmTabErr בלי סשן. השאלה שהמצב הזה עונה עליה —
// "האם אוטומציה תיתקל בקיר סיסמה?" — נענית בשלילה, ולכן זו לא סיבה לעצור
// את הרו"ח. בלי זה נוצרה לולאה: כל בדיקה השאירה את מגן "פתוחה", הבדיקה
// הבאה קיבלה frmTabErr, והנורית נתקעה כתומה לנצח. קרה בפועל.
const nikuiState = (s) => {
  if (!s.pathname.startsWith(NIKUI_PATH)) return { ready: false, reason: 'unexpected_destination' };
  if (NIKUI_TAB_CONFLICT.test(s.pathname)) return { ready: true, reason: 'already_open' };
  if (s.hasPasswordField) return { ready: false, reason: 'login_required' };
  return { ready: true, reason: 'menu' };
};

/** קריאה זולה, בלי ניווט: רק אם הדף כבר עומד על מגן. */
export async function readNikuiOnCurrentPage(page) {
  const s = await snapPage(page);
  if (!s.pathname.startsWith(NIKUI_PATH)) return { onNikui: false, ready: null };
  return { onNikui: true, ...nikuiState(s), pathname: s.pathname };
}

/** מנווט למגן ומחזיר את מצבה אחרי התייצבות. משאיר את הדפדפן שם. */
export async function openNikuiAndCheck(page) {
  await page.goto(NIKUI_URL, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
  const s = await settlePage(page);
  return { ...nikuiState(s), pathname: s.pathname };
}

/** קריאה זולה, בלי ניווט: רק אם הדף כבר עומד על GMF. */
export async function readGmfOnCurrentPage(page) {
  const s = await snapPage(page);
  if (!s.pathname.startsWith(GMF_PATH)) return { onGmf: false, ready: null };
  return { onGmf: true, ready: !s.hasPasswordField && !s.pathname.includes('/login'), pathname: s.pathname };
}

/** מנווט ל-GMF ומחזיר את מצבה אחרי התייצבות. משאיר את הדפדפן שם. */
export async function openGmfAndCheck(page) {
  await page.goto(GMF_URL, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
  const s = await settlePage(page);
  if (!s.pathname.startsWith(GMF_PATH)) {
    return { ready: false, reason: 'unexpected_destination', pathname: s.pathname };
  }
  if (s.hasPasswordField || s.pathname.includes('/login')) {
    return { ready: false, reason: 'login_required', pathname: s.pathname };
  }
  return { ready: true, pathname: s.pathname };
}

/**
 * ממתין שאפליקציית העמוד היחיד תסיים, ואז מחזיר את המצב האמיתי.
 *
 * ‼ "הכתובת לא השתנתה בין שתי דגימות" נוסה ונכשל: ההפניה למסך ההתחברות
 * מגיעה אחרי יותר משנייה, והבדיקה הכריזה הצלחה מעל מסך סיסמה. אומת מול
 * הדפדפן. לכן: קודם המתנה לשקט ברשת, ואז דגימה עד סוף החלון — יציאה
 * מוקדמת רק כששדה הסיסמה הופיע, כי זו הכרעה ודאית.
 */
export async function settlePage(page, { idleMs = 15000, watchMs = 6000, stepMs = 500 } = {}) {
  await page.waitForLoadState('networkidle', { timeout: idleMs }).catch(() => {});
  const deadline = Date.now() + watchMs;
  let s = await snapPage(page);
  while (Date.now() < deadline) {
    if (s.hasPasswordField) return s;
    await page.waitForTimeout(stepMs);
    s = await snapPage(page);
  }
  return s;
}

export async function snapPage(page) {
  const href = page.url();
  let hasPasswordField = false;
  try {
    hasPasswordField = await page.evaluate(() => !!document.querySelector('input[type=password]'));
  } catch { /* ניווט באמצע — ננסה בדגימה הבאה */ }
  let pathname = '/';
  try { pathname = new URL(href).pathname; } catch { /* about:blank וכדומה */ }
  return { href, pathname, hasPasswordField };
}

async function safeTitle(page) {
  try { return await page.title(); } catch { return null; }
}
