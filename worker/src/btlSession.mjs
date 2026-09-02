// btlSession.mjs — החלון הייעודי של «מערכת ייצוג לקוחות» בביטוח לאומי.
// אותו דפוס בדיוק כמו browserSession.mjs לשע״ם, ובכוונה **קובץ נפרד**.
//
// ─── למה חלון ופרופיל נפרדים משע״ם ──────────────────────────────────────────
// ‼ אלה שתי רשויות עם שני סוגי אימות שאין ביניהם דבר: שע״ם עובדת בכרטיס
// חכם + PIN, וב״ל עובדת בת.ז. + קוד משתמש + סיסמה + קוד חד-פעמי לנייד.
// חלון משותף היה קושר את מחזור החיים שלהן: «התנתקות» מאחת הייתה סוגרת את
// השנייה, ובדיקת המוכנות של שע״ם (שמנווטת את הלשונית בין GMF/מע״מ/מגן)
// הייתה יכולה לדרוס את הלשונית של ב״ל. שתי נוריות עצמאיות = שני חלונות.
//
// ‼ פורט ניפוי נפרד (9223) מאותה סיבה: חיבור CDP אחד לחלון אחד.
//
// ‼ פרופיל ייעודי אינו העדפה אלא מגבלה של Chrome: מגרסה 136 ואילך
// ‎--remote-debugging-port‎ אינו מכובד על תיקיית הנתונים הרגילה.
// https://developer.chrome.com/blog/remote-debugging-port
// המשמעות לטובה: הפורט הזה לעולם לא רואה את הגלישה הרגילה של הרו"ח.
//
// ‼ העובד לא מקליד כאן דבר. לא ת.ז., לא קוד משתמש, לא סיסמה, ובוודאי לא
// את הקוד החד-פעמי שמגיע לנייד. הוא פותח את החלון על מסך הכניסה, ומזהה
// מתי הרו"ח סיים. זהו.

import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
import { findChromeExe, snapPage } from './browserSession.mjs';

const CDP_URL = 'http://localhost:9223';
const BTL_ORIGIN = 'https://meyazegs.btl.gov.il';
const BTL_ROOT = 'https://meyazegs.btl.gov.il/';

// ‼ מסך הכניסה הוא שער F5 (‎/my.policy‎) ולא עמוד של האפליקציה. נצפה בפועל
// ב-02/09/2026: שלושה שדות — ‎username‎ (ת.ז.), ‎usercode‎ (קוד משתמש)
// ו-‎pass‎ — וכותרת «מערכת ייצוג לקוחות».
const BTL_LOGIN_PATH = '/my.policy';
const BTL_LOGOUT_PATH = '/my.logout';
// ‼ עוגן מבני ולא טקסטואלי: שם השדה אינו תלוי בשפה, בניסוח או בעיצוב.
const BTL_LOGIN_MARKER = /name=["']?usercode/i;

// מחוץ לריפו בכוונה — הפרופיל מחזיק סשן חי. בתוך הריפו הוא נצפה על ידי שרת
// הפיתוח, נראה ל-git, ונגרר עם עותקי קוד.
const PROFILE_DIR = resolve(
  process.env.LOCALAPPDATA || process.env.HOME || '.',
  'PIVO', 'btl-chrome-profile',
);

/**
 * פותח את חלון Chrome הייעודי של ב״ל על מסך הכניסה. **לא מתחבר** — הרו"ח
 * מזין בעצמו ת.ז., קוד משתמש, סיסמה והקוד החד-פעמי.
 */
export function launchDedicatedBtlChrome() {
  const exe = findChromeExe();
  if (!exe) return { ok: false, reason: 'chrome_not_found' };
  if (!existsSync(PROFILE_DIR)) mkdirSync(PROFILE_DIR, { recursive: true });
  const child = spawn(exe, [
    '--remote-debugging-port=9223',
    `--user-data-dir=${PROFILE_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    BTL_ROOT,
  ], { detached: true, stdio: 'ignore' });
  child.unref();
  return { ok: true };
}

/**
 * סוגר את חלון ב״ל הייעודי — «התנתקות».
 * ‼ מזוהה אך ורק לפי נתיב הפרופיל, כדי שלעולם לא ייסגר Chrome אחר —
 * לא הרגיל של הרו"ח ולא חלון שע״ם.
 */
export function closeDedicatedBtlChrome() {
  const ps =
    `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | ` +
    `Where-Object { $_.CommandLine -like '*btl-chrome-profile*' } | ` +
    `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  try {
    execFileSync('powershell', ['-NoProfile', '-Command', ps], { timeout: 15000, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** האם תהליך Chrome עם פורט הניפוי של ב״ל חי. HTTP בלבד — לא נתקע. */
async function isDebugEndpointUp() {
  try {
    const res = await fetch(`${CDP_URL}/json/version`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * מתחבר לחלון ב״ל הייעודי. כשל אינו שגיאת מערכת — הוא אומר «החלון סגור»,
 * ומטופל ב-handler כפעולה שממתינה לאדם.
 */
export async function attachBtl() {
  const running = await isDebugEndpointUp();
  try {
    const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 5000 });
    const context = browser.contexts()[0];
    if (!context) {
      await detachBtl(browser);
      return { ok: false, reason: 'no_context', detail: 'no_browser_context' };
    }
    const page = context.pages()[0] ?? await context.newPage();
    return { ok: true, browser, context, page };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      reason: running ? 'blocked' : 'not_running',
      detail: detail.slice(0, 200),
    };
  }
}

/** מנתק את חיבור ה-CDP בלבד. תהליך Chrome ממשיך לחיות עם הסשן שבו. */
export async function detachBtl(browser) {
  try { await browser?.close(); } catch { /* כבר נסגר */ }
}

/**
 * בין הלשוניות הפתוחות — זו שעומדת על ב״ל. ‼ הכרחי ולא נוחות: ‎attach‎
 * מחזיר את הלשונית הראשונה, ואחרי התחברות עשויה להישאר לשונית ישנה על מסך
 * הכניסה בזמן שהמערכת פתוחה בלשונית אחרת. שיפוט לפי הלשונית המתה היה
 * מדווח «מנותק» מעל סשן חי.
 *
 * מעדיף לשונית שכבר **מחוברת**, ורק אם אין כזו — לשונית כלשהי על הדומיין.
 */
export async function pickBtlPage(context, fallback) {
  let anyOnBtl = null;
  for (const p of context.pages()) {
    if (!p.url().startsWith(BTL_ORIGIN)) continue;
    let s;
    try { s = await snapPage(p); } catch { continue; }
    if (btlState(s).connected) return p;
    anyOnBtl = anyOnBtl ?? p;
  }
  return anyOnBtl ?? fallback;
}

/**
 * ההכרעה, ממצב הדף בלבד:
 *   ‎/my.policy‎ או שדה סיסמה  ⇒ מסך כניסה (גם שלב הקוד החד-פעמי יושב שם)
 *   ‎/my.logout‎               ⇒ יצא
 *   כל דבר אחר על הדומיין      ⇒ סשן פתוח
 */
export function btlState(s) {
  if (!s.href.startsWith(BTL_ORIGIN)) return { connected: false, reason: 'not_on_btl' };
  if (s.pathname.startsWith(BTL_LOGIN_PATH)) return { connected: false, reason: 'login_required' };
  if (s.pathname.startsWith(BTL_LOGOUT_PATH)) return { connected: false, reason: 'logged_out' };
  if (s.hasPasswordField) return { connected: false, reason: 'login_required' };
  return { connected: true, reason: 'session' };
}

/**
 * מביא את חלון ב״ל לחזית ומעמיד אותו על מסך הכניסה — בלי לפתוח חלון שני
 * ובלי לגעת בלשונית שכבר מחוברת.
 */
export async function focusBtlWindow(page) {
  try { await page.bringToFront(); } catch { /* לא קריטי */ }
  if (!page.url().startsWith(BTL_ORIGIN)) {
    await page.goto(BTL_ROOT, { waitUntil: 'domcontentloaded', timeout: 15000 })
      .catch(() => { /* איטי או חסום — הרו"ח רואה את החלון ממילא */ });
  }
}

/**
 * קריאה מקומית של מצב החיבור. מנווט **רק** כשהלשונית אינה על ב״ל בכלל
 * (למשל ‎about:blank‎ מיד אחרי פתיחת החלון) — ניווט מיותר היה מפיל את
 * הרו"ח מהמסך שהוא עומד בו.
 */
export async function classifyBtlAuth(page, { timeoutMs = 15000 } = {}) {
  if (!page.url().startsWith(BTL_ORIGIN)) {
    try {
      await page.goto(BTL_ROOT, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (NETWORK_FAILURE.test(msg)) return { connected: false, reason: 'unreachable', detail: msg.slice(0, 160) };
      return { connected: false, reason: 'navigation_failed', detail: msg.slice(0, 160) };
    }
  }
  const s = await snapPage(page);
  return { ...btlState(s), pathname: s.pathname };
}

const NETWORK_FAILURE = /net::ERR_NAME_NOT_RESOLVED|net::ERR_CONNECTION_REFUSED|net::ERR_INTERNET_DISCONNECTED|net::ERR_CONNECTION_RESET|net::ERR_NETWORK_CHANGED/i;

/**
 * בדיקת אמת מול השרת — ולא קריאה של דף שכבר טעון.
 *
 * ‼ למה: ‎classifyBtlAuth‎ קורא דף ישן. שער ה-F5 מנתק בגלל חוסר פעילות,
 * והדף הטעון ממשיך להיראות תקין — הנורית הייתה נשארת ירוקה מעל סשן מת.
 *
 * ‼ שתי מטרות בבקשה אחת: מאמתת שהסשן חי, **וגם** מחזיקה אותו ער.
 *
 * ‼ בקשה מתוך הדף ולא ניווט — כך שום דבר גלוי לא זז מתחת לידיו של הרו"ח.
 *
 * ‼ ההכרעה היא לפי **לאן הבקשה נחתה ומה חזר**, לא לפי קוד הסטטוס: שער
 * F5 מחזיר 200 גם למסך הכניסה.
 */
export async function probeBtlSession(page) {
  if (!page.url().startsWith(BTL_ORIGIN)) return { ok: false, connected: false, detail: 'not_on_btl' };
  try {
    const r = await page.evaluate(async () => {
      try {
        const res = await fetch('/', { method: 'GET', cache: 'no-store', credentials: 'include', redirect: 'follow' });
        const body = await res.text();
        return { status: res.status, finalUrl: res.url, len: body.length, body: body.slice(0, 4000) };
      } catch (e) { return { status: 0, err: String(e).slice(0, 120) }; }
    });
    if (!r.status) return { ok: false, connected: false, detail: r.err ?? 'fetch_failed' };
    const onLogin = (r.finalUrl ?? '').includes(BTL_LOGIN_PATH) || BTL_LOGIN_MARKER.test(r.body ?? '');
    return {
      ok: true,
      connected: r.status === 200 && !onLogin,
      detail: `status=${r.status} login=${onLogin} len=${r.len}`,
    };
  } catch (e) {
    return { ok: false, connected: false, detail: e instanceof Error ? e.message.slice(0, 120) : String(e) };
  }
}
