// gmfAutoLogin.mjs — הסיסמה השנייה של שע״ם (מערכת גביית מס הכנסה, GMF):
// מתי PIVO משתמשת בה לבד, ומתי הרו"ח עושה את זה בעצמו.
//
// ‼ הכלל של גיא (27.09.2026, מדויק בגרסה השנייה של אותו יום):
//   · מחובר, ומופיעה **רק** הסיסמה השנייה ⇒ אוטומטי: הסיסמה השמורה ב-Chrome
//     ו«כניסה», וממשיכים (יישור קו נתקע בדיוק על זה, 2.5 דקות אחרי כניסה).
//   · שע״ם ביקשה שוב את הסיסמה **הראשונה** (אישור דיגיטלי/PIN/קוד חד-פעמי/
//     מספר מעסיק) ⇒ מחזור התחברות חדש, ומאותו רגע ידני עד סוף הסיסמה השנייה:
//     PIVO מעבירה מיד למסך הסיסמה השנייה וממקדת את השדה — ולא בוחרת ולא
//     לוחצת. לפעמים שע״ם דורשת שם החלפת סיסמה, והרו"ח רוצה לראות ולאשר.
//   · התחברות מלאה שהושלמה (GMF פתוחה והפורטל מחובר) ⇒ חוזרים לאוטומטי.
//
// ‼ ניסיון אחד (ללא שינוי מהגרסה הראשונה): סיסמה שמורה שנשלחה ונדחתה לא
// נשלחת שוב לבד עד כניסה מוצלחת או מחזור חיים חדש. הקלדה ידנית לעולם לא
// נשלחת ע"י PIVO.
//
// ‼ PIVO לא רואה את הסיסמה: Chrome ממלא, העובד בודק רק «יש ערך» ו«Chrome
// מילא», ולוחץ «כניסה».
import {
  readGmfLoginForm, focusGmfLoginField, attemptGmfLoginConfirm, readGmfOnCurrentPage, settlePage,
} from './browserSession.mjs';
import { pickSavedPassword, bringChromeToForeground } from './chromePasswordPicker.mjs';

const FILL_WAIT_MS = 2_000;
const FILL_POLL_MS = 200;
export const HUMAN_WAIT_MS = 45_000;
const HUMAN_POLL_MS = 1_000;

/** @type {{ at: number, reason: string } | null} */
let rejected = null;

/**
 * מחזור ההתחברות לשע״ם, בזיכרון התהליך:
 *   'unknown'     — עובד שרק עלה ועוד לא ראה התחברות מלאה ⇒ כמו ידני.
 *   'manual'      — שע״ם ביקשה את הסיסמה הראשונה; הרו"ח מסיים הכול בעצמו.
 *   'established' — התחברות מלאה הושלמה; סיסמה שנייה לבדה ⇒ אוטומטי.
 * ‼ ברירת המחדל הזהירה: בלי ראיה להתחברות מלאה — לא בוחרים סיסמה.
 */
let cycle = { state: 'unknown', reason: 'worker_start', at: 0 };

/** שע״ם ביקשה את הסיסמה הראשונה (או שהחלון נפתח/נסגר) — מכאן ידני. */
export function beginShaamLoginCycle(reason) {
  if (cycle.state === 'manual') return false;
  cycle = { state: 'manual', reason, at: Date.now() };
  return true;
}

/** GMF פתוחה והפורטל מחובר — ההתחברות המלאה הושלמה. */
export function completeShaamLogin() {
  if (cycle.state === 'established') return false;
  cycle = { state: 'established', reason: 'full_login', at: Date.now() };
  return true;
}

export function shaamLoginCycle() {
  return cycle;
}

/** מותר להשתמש בסיסמה השמורה בלי הרו"ח. */
export function gmfAutoAllowed() {
  return cycle.state === 'established';
}

/** מחזור חיים חדש, או כניסה מוצלחת — מותר שוב ניסיון אוטומטי אחד. */
export function resetGmfAutoLogin() {
  rejected = null;
}

export function gmfAutoLoginRejected() {
  return rejected;
}

/**
 * ניסיון אחד להיכנס עם הסיסמה ש-Chrome שמר. לא ממתין לאדם.
 *
 * @returns {Promise<{ ok: boolean, reason: string, attempted: boolean }>}
 *   attempted = «כניסה» נלחצה מול שע״ם.
 */
export async function tryGmfAutoLogin(page, {
  log = () => {}, picker = pickSavedPassword, foreground = bringChromeToForeground,
} = {}) {
  if (!gmfAutoAllowed()) return { ok: false, reason: 'manual_login_cycle', attempted: false };
  if (rejected) return { ok: false, reason: 'rejected_earlier', attempted: false };
  const f = await readGmfLoginForm(page);
  if (!f.onLogin) return { ok: false, reason: 'not_on_login', attempted: false };
  if (f.humanOnlyModal) return { ok: false, reason: 'human_only_modal', attempted: false };
  if (!f.hasField) return { ok: false, reason: 'no_password_field', attempted: false };
  // הרו"ח באמצע הקלדה — לא נוגעים ולא שולחים.
  if (f.hasValue && !f.autofilled) return { ok: false, reason: 'typed_by_human', attempted: false };

  if (!f.hasValue) {
    if (!f.username) return { ok: false, reason: 'username_not_found', attempted: false };
    if (!(await focusGmfLoginField(page))) return { ok: false, reason: 'field_not_focusable', attempted: false };

    let pick = await picker({ username: f.username });
    // ‼ Chrome פותח את החלונית רק בחלון שבפוקוס. נבדק 27.09.2026: עם חלון
    // אחר בחזית, bringToFront של הדפדפן הספיק. אם בכל זאת לא נפתחה —
    // מביאים את החלון לחזית ברמת Windows ומנסים לפתוח אותה פעם אחת נוספת.
    // ‼ לא לפי document.hasFocus(): Playwright מדמה פוקוס, והוא תמיד true.
    if (pick.status === 'no_popup') {
      log(`חלונית הסיסמאות לא נפתחה — חלון שע״ם לחזית: ${await foreground()}`);
      if (await focusGmfLoginField(page)) pick = await picker({ username: f.username });
    }
    log(`סיסמה שמורה ב-Chrome: ${pick.status}`);
    if (pick.status !== 'invoked') return { ok: false, reason: pick.status, attempted: false };

    const deadline = Date.now() + FILL_WAIT_MS;
    let filled = false;
    while (Date.now() < deadline) {
      const now = await readGmfLoginForm(page);
      if (now.hasValue && now.autofilled) { filled = true; break; }
      await page.waitForTimeout(FILL_POLL_MS);
    }
    if (!filled) return { ok: false, reason: 'not_filled_after_pick', attempted: false };
  }

  const confirm = await attemptGmfLoginConfirm(page);
  if (confirm.ok) return { ok: true, reason: 'saved_password', attempted: true };
  if (confirm.clicked) rejected = { at: Date.now(), reason: confirm.reason };
  return { ok: false, reason: confirm.reason, attempted: !!confirm.clicked };
}

/**
 * מסך הסיסמה השנייה מוצג לרו"ח: החלון בחזית והשדה בפוקוס (ואז Chrome מציג
 * את ההצעה שלו). ‼ לא לוחצים על שדה שכבר בפוקוס או שכבר יש בו ערך — לחיצה
 * באמצע הקלדה מזיזה את הסמן.
 */
export async function presentGmfLoginToHuman(page) {
  try { await page.bringToFront(); } catch { /* לא קריטי */ }
  const f = await readGmfLoginForm(page);
  if (!f.onLogin || !f.hasField || f.humanOnlyModal || f.focused || f.hasValue) return false;
  return focusGmfLoginField(page);
}

/**
 * ממתינים לרו"ח על מסך הסיסמה השנייה, עד waitMs.
 *   confirmChromeFill=true (מחובר, אוטומטי מותר): הרו"ח בחר בהצעה של Chrome ⇒
 *     PIVO לוחצת «כניסה» פעם אחת.
 *   confirmChromeFill=false (מחזור התחברות חדש): PIVO לא לוחצת כלום — הרו"ח
 *     בוחר, לוחץ «כניסה» ומטפל בהחלפת סיסמה אם שע״ם דורשת.
 * הקלדה ידנית לעולם לא נשלחת מכאן.
 */
export async function waitForHumanGmfLogin(page, {
  waitMs = HUMAN_WAIT_MS, pollMs = HUMAN_POLL_MS, confirmChromeFill = gmfAutoAllowed(),
} = {}) {
  await presentGmfLoginToHuman(page);
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await page.waitForTimeout(pollMs);
    const f = await readGmfLoginForm(page);
    if (!f.onLogin) break;
    if (f.humanOnlyModal) return { ok: false, reason: 'human_only_modal' };
    if (confirmChromeFill && f.hasValue && f.autofilled) {
      const c = await attemptGmfLoginConfirm(page);
      return c.ok ? { ok: true, reason: 'confirmed_fill' } : { ok: false, reason: c.reason };
    }
  }
  await settlePage(page, { idleMs: 8000, watchMs: 2000 });
  const now = await readGmfOnCurrentPage(page);
  return now.ready === true ? { ok: true, reason: now.reason } : { ok: false, reason: now.reason ?? 'login_required' };
}

/**
 * הדף עומד על מסך הכניסה של GMF: במצב אוטומטי — קודם הסיסמה השמורה; ובכל
 * מקרה שלא נכנסנו — עד waitForHumanMs לרו"ח. סיסמה שמורה שנדחתה ⇒ לא
 * ממתינים (מסך שגיאה של שע״ם).
 *
 * @returns {Promise<{ ok: boolean, reason: string, via?: 'saved_password'|'human' }>}
 */
export async function ensureGmfLogin(page, { log = () => {}, waitForHumanMs = HUMAN_WAIT_MS, ...deps } = {}) {
  const auto = gmfAutoAllowed();
  let reason = 'manual_login_cycle';
  if (auto) {
    const tried = await tryGmfAutoLogin(page, { log, ...deps });
    if (tried.ok) return { ok: true, reason: tried.reason, via: 'saved_password' };
    log(`כניסה עם הסיסמה השמורה לא בוצעה: ${tried.reason}`);
    if (tried.attempted) return { ok: false, reason: 'saved_password_rejected' };
    if (tried.reason === 'human_only_modal') return { ok: false, reason: tried.reason };
    reason = tried.reason;
  } else {
    log(`מחזור התחברות חדש לשע״ם (${cycle.reason}) — הסיסמה השנייה בידי הרו"ח, PIVO לא בוחרת ולא לוחצת`);
    if ((await readGmfLoginForm(page)).humanOnlyModal) return { ok: false, reason: 'human_only_modal' };
  }
  if (waitForHumanMs <= 0) return { ok: false, reason };
  const human = await waitForHumanGmfLogin(page, { waitMs: waitForHumanMs, confirmChromeFill: auto });
  return human.ok ? { ...human, via: 'human' } : human;
}
