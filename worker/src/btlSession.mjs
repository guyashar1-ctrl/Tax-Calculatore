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
import {
  TRACKING_COLUMNS, selectTrackingRow, classifyPoaStatus, toIsoDate, sameIdNumber,
} from './btlTracking.mjs';

// ‼ יוצאים מחדש כדי שה-handlers ימשיכו לייבא ממקום אחד («הסשן של ב"ל»),
// בלי שהלוגיקה הטהורה תיאלץ לחיות בקובץ שדורש Chrome כדי להיטען.
export { classifyPoaStatus, toIsoDate, sameIdNumber };

const CDP_URL = 'http://localhost:9223';
const BTL_ORIGIN = 'https://meyazegs.btl.gov.il';
const BTL_ROOT = 'https://meyazegs.btl.gov.il/';

// ‼ נצפה חי (23.09.2026): על **אותו דומיין** יושבות כמה אפליקציות של ביטוח
// לאומי, ולכל אחת תפריט משלה. שתי לשוניות פתוחות אצל הרו"ח באותו רגע:
//   · /BTL.ILG.Meyazgim.New/…  — «מערכת ייצוג לקוחות», זו שיש בה «מיוצגים»
//   · /tarmil/?q=…             — «תרמי"ל», תפריט אחר לגמרי
// `startsWith(BTL_ORIGIN)` לבדו אינו מבחין ביניהן, ולכן העובד בחר את לשונית
// תרמי"ל, לא מצא «מיוצגים», ודיווח «המסך השתנה — יש לעדכן את הקוד». הוא לא
// השתנה; פשוט הסתכלנו על האפליקציה הלא נכונה.
const BTL_REP_APP_PATH = '/BTL.ILG.Meyazgim.New/';
const BTL_REP_APP_ROOT = 'https://meyazegs.btl.gov.il/BTL.ILG.Meyazgim.New/groupdefaultpage.aspx';

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
/**
 * דירוג לשונית — גבוה יותר = מתאים יותר לעבוד עליו. ‼ טהורה ומיוצאת כדי
 * שתהיה ניתנת לבדיקה בלי Chrome (worker/test/btl-tracking.mjs).
 *   3 · מחובר **וב«מערכת ייצוג לקוחות»** — הלשונית היחידה שיש בה «מיוצגים»
 *   2 · מחובר, אבל באפליקציה אחרת על אותו דומיין (תרמי"ל וכו')
 *   1 · על ביטוח לאומי אך לא מחובר (מסך כניסה)
 *   0 · לא על ביטוח לאומי בכלל
 */
export function btlPageRank(s) {
  if (!s || !String(s.href ?? '').startsWith(BTL_ORIGIN)) return 0;
  if (!btlState(s).connected) return 1;
  return String(s.pathname ?? '').startsWith(BTL_REP_APP_PATH) ? 3 : 2;
}

/**
 * בוחר את הלשונית לעבוד עליה. ‼ לא "הראשונה שמחוברת": עד 23.09.2026 כל
 * לשונית על הדומיין של ביטוח לאומי נחשבה טובה באותה מידה, והבחירה נפלה על
 * תרמי"ל — אפליקציה אחרת, בלי תפריט «מיוצגים». עכשיו בוחרים לפי דירוג,
 * ולשונית של מערכת הייצוג תמיד גוברת.
 */
export async function pickBtlPage(context, fallback) {
  let best = null;
  let bestRank = 0;
  for (const p of context.pages()) {
    if (!p.url().startsWith(BTL_ORIGIN)) continue;
    let s;
    try { s = await snapPage(p); } catch { continue; }
    const rank = btlPageRank(s);
    if (rank > bestRank) { best = p; bestRank = rank; }
  }
  return best ?? fallback;
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

// ─── ניווט בתוך «מערכת ייצוג לקוחות» — ייפוי כוח מבוטח (פרק 17) ─────────────
//
// ‼ כל העוגנים כאן נצפו חי בסשן מאומת (16.09.2026), לא נוחשו:
//   · תפריט עליון: `a "מיוצגים"` — postback של ASP.NET (‎__doPostBack‎), טעינת
//     עמוד מלאה ל-groupdefaultpage.aspx עם אקורדיון בצד.
//   · באקורדיון: `button "ייפוי כח"` (href="#", מתקפל/נפתח בלחיצה) ובתוכו
//     ארבעה קישורים; אנחנו משתמשים בשניים: «הוספת ייפוי כח מבוטח» ו«מעקב
//     ייפוי כח». ‼ לחיצה על כותרת האקורדיון כשהוא כבר פתוח **סוגרת** אותו —
//     לכן בודקים קודם אם קישור היעד כבר גלוי.
//   · מסך ההוספה (y114z_…aspx?type=mv): ארבעה `<label for=…>` עם הטקסט
//     המדויק «תעודת זהות» / «שנת לידה» / «שם פרטי» / «שם משפחה» (בלי
//     נקודתיים — הן מ-CSS), ו-`<input type="button" value="הוספה">` שקורא
//     ל-showModalPopup לפני ה-postback.
//   · מסך המעקב (y114_…aspx?type=ik): GridView `#SherutData_GridViewMainList`
//     עם כותרות «אסמכתא / זהות/תיק מעסיק / שם / מ/עד תאריך / סטטוס», וערכי
//     סטטוס «ממתין לאישור» / «מאושר».
//   · חלון האישור: רכיב מודל משותף לאתר, `#modal.modalWindow`, כבר ב-DOM
//     ומוסתר, כפתוריו ב-`.modalWindowButtons`.
//
// ‼ מה **לא** נצפה חי: מסך התוצאה שאחרי «הוספה» (הטקסט «ייפוי הכח נקלט
// במערכת אך טרם הופעל», קוד האישור והמועד האחרון) — מקורו בתיאור המשימה.
// `extractPoaConfirmation` דורש את העוגן הזה במפורש ולא מכריע הצלחה בלעדיו.

/** קישור/כפתור/טקסט לפי שם מדויק — עדיפות למבנה (link/button) לפני טקסט חופשי. */
export function byExactName(page, label) {
  const link = page.getByRole('link', { name: label, exact: true });
  const button = page.getByRole('button', { name: label, exact: true });
  const text = page.getByText(label, { exact: true });
  return link.or(button).or(text).first();
}

/**
 * מיוצגים → ייפוי כח → <תת-מסך>. ‼ לא "שרשרת לחיצות עיוורת": אחרי
 * ה-postback של «מיוצגים» בודקים אם קישור היעד כבר גלוי (האקורדיון פתוח)
 * ורק אם לא — לוחצים על כותרת «ייפוי כח». נכשל בקול עם השלב שנעצר בו.
 */
async function openPoaSubScreen(page, subLabel) {
  const steps = [];
  let current = 'מיוצגים';
  const click = async (label) => {
    current = label;
    const loc = byExactName(page, label);
    await loc.waitFor({ state: 'visible', timeout: 10000 });
    await loc.click({ timeout: 10000 });
    steps.push(`clicked:${label}`);
  };

  /**
   * ‼ התאוששות חסומה (פעם אחת, לא לולאה): הלשונית נמצאת באפליקציה אחרת של
   * ביטוח לאומי — למשל תרמי"ל, שאין בה «מיוצגים» — ולכן עוברים לשורש מערכת
   * הייצוג. זה **לא** סותר את "לא נוגעים במסך שהרו"ח פתח": pickBtlPage כבר
   * מעדיף לשונית של מערכת הייצוג, ואם הגענו לכאן אין כזו בכלל.
   */
  const gotoRepApp = async (why) => {
    steps.push(`goto_rep_app:${why}`);
    await page.goto(BTL_REP_APP_ROOT, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(800);
  };

  const run = async () => {
    await click('מיוצגים');
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);
    const sub = byExactName(page, subLabel);
    if (!(await sub.isVisible().catch(() => false))) {
      await click('ייפוי כח');
      await page.waitForTimeout(500);
    }
    await click(subLabel);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
  };

  // ‼ לא על אפליקציית הייצוג בכלל ⇒ עוברים אליה **לפני** שמחפשים תפריט,
  // במקום להיכשל על "לא נמצא מיוצגים" ולהאשים את הקוד.
  try {
    const before = new URL(page.url());
    if (!before.pathname.startsWith(BTL_REP_APP_PATH)) await gotoRepApp('other_app');
  } catch { /* URL לא תקין — ננסה בכל זאת, ואם ייכשל תהיה התאוששות */ }

  try {
    await run();
    return { ok: true, steps };
  } catch (firstError) {
    const firstAt = current;
    await gotoRepApp('menu_not_found');
    try {
      await run();
      return { ok: true, steps, recovered: true };
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      return {
        ok: false, steps, failedAt: current, recoveryAttempted: true,
        firstFailedAt: firstAt,
        firstDetail: (firstError instanceof Error ? firstError.message : String(firstError)).slice(0, 200),
        detail: detail.slice(0, 200),
      };
    }
  }
}

/**
 * ממלא input לפי טקסט התווית שלו — לא לפי id/class (לא ידועים). מחפש תא/
 * span/label עם טקסט מדויק, ואז input בשורה/בהורה הקרוב. דו-משמעיות או
 * העדר תוצאה מוחזרים כשגיאה מפורשת, לא כניחוש.
 */
export async function fillFieldByLabel(page, label, value) {
  return page.evaluate(({ label, value }) => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const target = norm(label);
    const candidates = [...document.querySelectorAll('label, span, td, div')]
      .filter((e) => norm(e.textContent) === target && e.children.length === 0);
    if (candidates.length !== 1) {
      return { ok: false, reason: candidates.length ? 'ambiguous_label' : 'label_not_found', n: candidates.length };
    }
    const labelEl = candidates[0];
    let input = null;
    if (labelEl.tagName === 'LABEL' && labelEl.htmlFor) {
      input = document.getElementById(labelEl.htmlFor);
    }
    if (!input) {
      const row = labelEl.closest('tr, .row, fieldset') || labelEl.parentElement;
      input = row?.querySelector('input:not([type=hidden]):not([type=submit]):not([type=button])') ?? null;
    }
    if (!input) return { ok: false, reason: 'input_not_found_near_label' };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    input.focus();
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
    return { ok: true };
  }, { label, value });
}

/** מיוצגים → ייפוי כח → הוספת ייפוי כח מבוטח. מאמת הגעה לפי שדה «תעודת זהות» — לא לפי URL. */
export async function openAddPoaScreen(page) {
  const nav = await openPoaSubScreen(page, 'הוספת ייפוי כח מבוטח');
  if (!nav.ok) return nav;
  const idField = page.getByLabel('תעודת זהות', { exact: true }).first();
  const present = await idField.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
  if (!present) return { ok: false, steps: nav.steps, reason: 'id_field_not_found_after_nav' };
  const s = await snapPage(page);
  return { ok: true, steps: nav.steps, pathname: s.pathname };
}

/**
 * ממלא ת.ז./שנת לידה/שם פרטי/שם משפחה ולוחץ «הוספה», כולל חלון האישור.
 * ‼ לעולם לא קורא סיסמה/OTP — רק ארבעת השדות העסקיים שנמסרו.
 * ‼ מחזיר {ok:false} בכל כשל שלב — ה-handler מחליט needs_human/permanent.
 */
export async function submitAddPoaForm(page, { idNumber, birthYear, firstName, lastName }) {
  const fillResults = {};
  for (const [label, value] of [
    ['תעודת זהות', idNumber],
    ['שנת לידה', String(birthYear)],
    ['שם פרטי', firstName],
    ['שם משפחה', lastName],
  ]) {
    const r = await fillFieldByLabel(page, label, value);
    fillResults[label] = r;
    if (!r.ok) return { ok: false, reason: 'field_fill_failed', field: label, detail: r.reason, fillResults };
  }

  // ‼ כפתור «הוספה» — נצפה חי (16.09.2026) כ-`<input type="button"
  // id="SherutButtons_btnUpdate" value="הוספה">` עם
  // `onclick="return showModalPopup(this,'UPDATE',''); __doPostBack(...)"`.
  // Playwright ממפה role=button גם ל-input type=button/submit (שם נגיש
  // מ-value, לא textContent) — getByRole כאן אינו ניחוש.
  const submitBtn = page.getByRole('button', { name: 'הוספה', exact: true }).first();
  if (!(await submitBtn.count())) return { ok: false, reason: 'submit_button_not_found', fillResults };

  let dialogHandled = null;
  const onDialog = async (dialog) => {
    dialogHandled = { type: 'native', message: dialog.message().slice(0, 200) };
    await dialog.accept().catch(() => {});
  };
  page.on('dialog', onDialog);
  try {
    await submitBtn.click({ timeout: 10000 });
    await page.waitForTimeout(600);
    if (!dialogHandled) {
      // ‼ עוגן מדויק ולא ניחוש: `showModalPopup` (נצפה חי, 16.09.2026) הוא
      // רכיב מודל **משותף לכל האתר** שכבר יושב ב-DOM מטעינת הדף, מוסתר
      // (`#modal.modalWindow{display:none}`), עם כפתוריו תחת `.modalWindowButtons`
      // בתוכו. תחום לקונטיינר הזה **בשמו המדויק** — לא לכפתור "אישור" גלובלי
      // בעמוד (ראה דרישת המשימה) — עם רשימת מחלקות גנריות כגיבוי בלבד, למקרה
      // שמסך אחר משתמש ברכיב מודל שונה.
      const modal = page.locator('#modal.modalWindow, [role="dialog"], .modal, .ui-dialog, .k-window').first();
      await modal.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      if (await modal.isVisible().catch(() => false)) {
        const buttonsScope = modal.locator('.modalWindowButtons').first();
        const scope = (await buttonsScope.count()) ? buttonsScope : modal;
        const confirmBtn = scope.getByRole('button', { name: /^(אישור|אישור\/י|OK|כן|הוספה)$/i }).first();
        if (await confirmBtn.count()) {
          await confirmBtn.click({ timeout: 8000 });
          dialogHandled = { type: 'modal' };
        } else {
          return { ok: false, reason: 'modal_confirm_button_not_found', fillResults };
        }
      }
      // ‼ אין דיאלוג טבעי ואין מודל גלוי — לא כשל: ייתכן שהאתר ממשיך בלי
      // אישור ביניים. extractPoaConfirmation הוא הבודק האמיתי של הצלחה.
    }
  } finally {
    page.off('dialog', onDialog);
  }

  return { ok: true, dialogHandled, fillResults };
}

// ‼ עוגני ההצלחה **כפי שנצפו חי** במסך התוצאה האמיתי (16.09.2026, אחרי
// הגשה אמיתית): «רישום הטופס נקלט בהצלחה» (הודעת מערכת) ו«ייפוי הכוח
// ניקלט במערכת, אך עדיין אינו בתוקף». הניסוח שתואר במקור («ייפוי הכח
// נקלט במערכת אך טרם הופעל») **לא** מופיע בפועל — ההגשה הראשונה נעצרה
// כ-ambiguous בדיוק בגלל זה, וזה מה שרצינו: לא להכריז הצלחה על סמך ניסוח
// מנוחש. נשמר גם כגיבוי, למקרה שיש גרסאות מסך שונות.
// בלי אחד העוגנים לא מכריעים שהוגש בהצלחה, גם אם אין שגיאה גלויה.
const SUCCESS_MARKERS = [
  'רישום הטופס נקלט בהצלחה',
  'ייפוי הכוח ניקלט במערכת',
  'ייפוי הכח נקלט במערכת אך טרם הופעל',
];

/**
 * קורא מהמסך שאחרי הגשה מוצלחת: מספר אסמכתא + מועד אחרון לאישור.
 * ‼ «הוספה» מסתיימת ב-postback (טעינת עמוד מלאה) — ממתינים לעוגן ההצלחה
 * עד 20 שניות לפני שמכריעים «לא נמצא». האסמכתא והמועד נקראים **ליד התווית
 * שלהם** («מספר האסמכתא של ייפוי הכוח: N» / «המועד האחרון לאישור הטופס:
 * D» — נצפו חי), לא "המספר/התאריך הראשון בעמוד".
 */
export async function extractPoaConfirmation(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
  const anyMarker = page.getByText(SUCCESS_MARKERS[0], { exact: false })
    .or(page.getByText(SUCCESS_MARKERS[1], { exact: false }))
    .or(page.getByText(SUCCESS_MARKERS[2], { exact: false })).first();
  await anyMarker.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  const s = await snapPage(page);
  const bodyText = (await page.evaluate(() => document.body.innerText || '')).replace(/\s+/g, ' ');
  // ‼ נצפה חי (16.09.2026): הגשה חוזרת לאותו מבוטח נדחית ע"י ביטוח לאומי עם
  // «מבוטח זה כבר קיים במעקב ייפוי כח - מספר אסמכתא: N». זו לא עמימות —
  // זו עדות חיובית שייפוי כוח קיים, כולל האסמכתא שלו. מוחזר כ-alreadyExisted
  // כדי שה-handler ישלים מועד אחרון ממסך המעקב במקום להכריז כישלון.
  const exists = bodyText.match(/כבר קיים במעקב ייפוי כו?ח[^\d]{0,40}?(\d{5,})/);
  if (exists) {
    return { ok: true, alreadyExisted: true, referenceNumber: exists[1], deadline: null, pathname: s.pathname };
  }
  if (!SUCCESS_MARKERS.some((m) => bodyText.includes(m))) {
    return { ok: false, reason: 'success_marker_not_found', pathname: s.pathname, snippet: bodyText.slice(0, 400) };
  }
  const refMatch = bodyText.match(/מספר\s*האסמכתא[^\d]{0,40}?(\d{5,})/)
    ?? bodyText.match(/(?:קוד\s*(?:אישור|זיהוי)|מספר\s*אישור)[^\d]{0,40}?(\d{5,})/);
  const deadlineMatch = bodyText.match(/המועד\s*האחרון[^\d]{0,60}?(\d{2}\/\d{2}\/\d{4})/)
    ?? bodyText.match(/(?:תאריך\s*תוקף|בתוקף\s*עד)[^\d]{0,40}?(\d{2}\/\d{2}\/\d{4})/);
  return {
    ok: true,
    referenceNumber: refMatch ? refMatch[1] : null,
    deadline: deadlineMatch ? toIsoDate(deadlineMatch[1]) : null,
    status: confirmationState(bodyText),
    // ‼ אם אחד מהם null למרות שנמצא ה-marker: ה-handler מדווח permanent
    // (no_reference_extracted) — לא כותב ערך חלקי כאילו הוא שלם.
  };
}

// ‼ מסך התוצאה אומר במפורש «ייפוי הכוח ניקלט במערכת, אך עדיין אינו בתוקף»
// (נצפה חי 16.09.2026, ושוב 23.09.2026 במסך הפירוט של רישום קיים). זו ראיה
// חיובית ל**ממתין** — לא היעדר ראיה. בלי ניסוח כזה מחזירים 'unknown':
// הגשה שהצליחה אינה, ולעולם לא תהיה, ראיה לאישור.
const PENDING_MARKERS = ['אינו בתוקף', 'אינה בתוקף', 'טרם הופעל', 'ממתין לאישור'];

export function confirmationState(bodyText) {
  const t = String(bodyText ?? '');
  return PENDING_MARKERS.some((m) => t.includes(m)) ? 'pending' : 'unknown';
}

/** מיוצגים → ייפוי כח → מעקב ייפוי כח. מאמת הגעה לפי טבלת המעקב — לא לפי URL. */
export async function openPoaTrackingScreen(page) {
  const nav = await openPoaSubScreen(page, 'מעקב ייפוי כח');
  if (!nav.ok) return nav;
  const table = page.locator('table').filter({ has: page.getByText('אסמכתא', { exact: true }) }).first();
  const present = await table.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
  if (!present) return { ok: false, steps: nav.steps, reason: 'tracking_table_not_found' };
  return { ok: true, steps: nav.steps };
}

// ─── קריאת טבלת המעקב ───────────────────────────────────────────────────────
// ‼ החלוקה כאן מכוונת: הדף מחזיר **טקסט בלבד** (כותרות ושורות), וכל
// ההכרעה — מיפוי עמודות, התאמה, בחירה בין כמה שורות וסיווג הסטטוס — קורית
// ב-Node בתוך `selectTrackingRow` (btlTracking.mjs), שהוא טהור ונבדק
// ב-worker/test/btl-tracking.mjs. עד 23.09.2026 הכול חי בתוך page.evaluate
// ולכן לא היה ניתן לבדיקה בלי סשן מאומת — וזו בדיוק השכבה שבה «קיימת שורה»
// יכול היה להיקרא כ«אושר».

/**
 * גורד **את כל** הטבלאות המועמדות כמערך מחרוזות. בלי שום החלטה עסקית.
 * ‼ לא "הראשונה שיש בה «אסמכתא»": במסך המעקב פאנל הסינון שבראש העמוד מכיל
 * בעצמו את המילים «אסמכתא» ו«סטטוס», והוא מגיע ראשון ב-DOM. הבחירה
 * (pickTrackingTable) קורית ב-Node, על כל המועמדות, לפי כמה כותרות מוכרות
 * יש בכל אחת — ראה btlTracking.mjs.
 */
async function scrapeTrackingTables(page) {
  return page.evaluate((referenceLabels) => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const tables = [];
    for (const t of document.querySelectorAll('table')) {
      if (tables.length >= 20) break;
      const headerRow = t.querySelector('tr');
      if (!headerRow) continue;
      const headerCells = [...headerRow.querySelectorAll('th,td')].map((c) => norm(c.textContent));
      if (!headerCells.some((c) => referenceLabels.includes(c))) continue;
      const dataRows = [...t.querySelectorAll('tr')].slice(1, 501)
        .map((r) => [...r.querySelectorAll('td,th')].map((c) => norm(c.textContent)));
      tables.push({ headerCells, dataRows });
    }
    return { ok: tables.length > 0, tables };
  }, TRACKING_COLUMNS.reference);
}

/**
 * מאתר בטבלת המעקב שורה אחת — לפי אסמכתא כשהיא ידועה (מסלול הבדיקה,
 * `btlCheckRepresentation`), או לפי ת.ז. כשאין עדיין אסמכתא (מסלול ההתאמה
 * ביצירה, `btlCreateRepresentation`). מחזיר גם `status` **קנוני** לצד
 * `rawStatus` הגולמי; ראה btlTracking.mjs לכללי ההכרעה.
 */
export async function findPoaTrackingRow(page, { referenceNumber, idNumber }) {
  const scraped = await scrapeTrackingTables(page);
  if (!scraped?.ok) return { found: false, reason: 'table_not_found' };
  return selectTrackingRow(scraped, { referenceNumber, idNumber });
}
