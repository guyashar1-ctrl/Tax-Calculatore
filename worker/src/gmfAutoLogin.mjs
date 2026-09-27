// gmfAutoLogin.mjs — כניסה למערכת גביית מס הכנסה (GMF) עם הסיסמה השנייה
// ששמורה ב-Chrome, בלי אדם.
//
// ‼ החלטת מוצר (גיא, 27.09.2026): אחרי כרטיס+PIN עוברים מיד למסך הסיסמה
// השנייה; בפעם הראשונה הרו"ח מקליד אותה ו-Chrome שומר; ומאז, עד שהפורטל
// דורש שוב כרטיס+PIN, PIVO משתמשת בה לבד — גם כש-GMF מבקשת אותה באמצע עבודה
// (יישור קו נתקע ב-27.09.2026 על מסך הכניסה של GMF, 2.5 דקות אחרי כניסה).
//
// ‼ ניסיון אחד. אם «כניסה» נלחצה עם הסיסמה השמורה ו-GMF לא נפתחה — לא
// מנסים שוב לבד עד שאדם נכנס בהצלחה או שמתחיל מחזור חיים חדש של שע״ם.
// סיסמה שמורה ישנה שנשלחת שוב ושוב היא הדרך הקצרה לנעילת המשתמש.
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
 * החלון בחזית והשדה בפוקוס (החלונית של Chrome פתוחה) — ממתינים שהרו"ח יבחר
 * את הסיסמה השמורה (ואז PIVO לוחצת «כניסה» פעם אחת) או יקליד ויישלח בעצמו
 * (ואז Chrome מציע לשמור). הקלדה ידנית לעולם לא נשלחת מכאן.
 */
export async function waitForHumanGmfLogin(page, { waitMs = HUMAN_WAIT_MS, pollMs = HUMAN_POLL_MS } = {}) {
  await focusGmfLoginField(page);
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await page.waitForTimeout(pollMs);
    const f = await readGmfLoginForm(page);
    if (!f.onLogin) break;
    if (f.humanOnlyModal) return { ok: false, reason: 'human_only_modal' };
    if (f.hasValue && f.autofilled) {
      const c = await attemptGmfLoginConfirm(page);
      return c.ok ? { ok: true, reason: 'confirmed_fill' } : { ok: false, reason: c.reason };
    }
  }
  await settlePage(page, { idleMs: 8000, watchMs: 2000 });
  const now = await readGmfOnCurrentPage(page);
  return now.ready === true ? { ok: true, reason: now.reason } : { ok: false, reason: now.reason ?? 'login_required' };
}

/**
 * הדף עומד על מסך הכניסה של GMF: קודם הסיסמה השמורה, ואם אין — אדם, עד
 * waitForHumanMs. סיסמה שמורה שנדחתה ⇒ לא ממתינים (מסך שגיאה של שע״ם).
 *
 * @returns {Promise<{ ok: boolean, reason: string, via?: 'saved_password'|'human' }>}
 */
export async function ensureGmfLogin(page, { log = () => {}, waitForHumanMs = HUMAN_WAIT_MS, ...deps } = {}) {
  const auto = await tryGmfAutoLogin(page, { log, ...deps });
  if (auto.ok) return { ok: true, reason: auto.reason, via: 'saved_password' };
  log(`כניסה עם הסיסמה השמורה לא בוצעה: ${auto.reason}`);
  if (auto.attempted) return { ok: false, reason: 'saved_password_rejected' };
  if (auto.reason === 'human_only_modal' || waitForHumanMs <= 0) return { ok: false, reason: auto.reason };
  const human = await waitForHumanGmfLogin(page, { waitMs: waitForHumanMs });
  return human.ok ? { ...human, via: 'human' } : human;
}
