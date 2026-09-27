// gmf-auto-login.test.mjs — הסיסמה השנייה של שע״ם (GMF): מתי מ-Chrome בלי
// אדם, ומתי בידי הרו"ח. page מדומה של מסך הכניסה ו«חלונית» מדומה של Chrome.
//
// הכלל של גיא (27.09.2026):
//   · מחובר + מופיעה רק הסיסמה השנייה ⇒ אוטומטי.
//   · הופיעה הסיסמה הראשונה ⇒ מחזור התחברות חדש: ידני עד סוף הסיסמה השנייה
//     (PIVO לא בוחרת ולא לוחצת — לפעמים שע״ם דורשת שם החלפת סיסמה).
//   · התחברות מלאה הושלמה ⇒ חוזרים לאוטומטי.
// וההגנות שלא השתנו:
//   · לוחצים «כניסה» רק אחרי ש-Chrome מילא (autofilled) — לא על הקלדה.
//   · סיסמה שמורה שנדחתה ⇒ ניסיון אחד, ואז לא שוב עד כניסה מוצלחת/מחזור חדש.
//   · בוחרים רק לפי שם המשתמש שמוצג במסך.
//
//   node --test test/gmf-auto-login.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tryGmfAutoLogin, ensureGmfLogin, waitForHumanGmfLogin, resetGmfAutoLogin, gmfAutoLoginRejected,
  beginShaamLoginCycle, completeShaamLogin, gmfAutoAllowed, shaamLoginCycle,
} from '../src/gmfAutoLogin.mjs';
import { parsePickOutput, isPickableUsername } from '../src/chromePasswordPicker.mjs';

/** «מחובר»: התחברות מלאה הושלמה, ועכשיו מבוקשת רק הסיסמה השנייה. */
function connected() {
  beginShaamLoginCycle('test_reset');
  completeShaamLogin();
  resetGmfAutoLogin();
}

/** «מחזור התחברות חדש»: שע״ם ביקשה את הסיסמה הראשונה. */
function newLoginCycle() {
  completeShaamLogin();
  beginShaamLoginCycle('first_password');
  resetGmfAutoLogin();
}

function fakeGmfLogin({ username = 'D1466734', accept = true, value = '', autofilled = false, modal = false } = {}) {
  const s = { path: '/gmf-main-menu/login', value, autofilled, username, modal, submits: 0, fieldClicks: 0, focused: false };
  const page = {
    s,
    url: () => `https://shaam.taxes.gov.il${s.path}`,
    bringToFront: async () => {},
    click: async () => { s.fieldClicks++; s.focused = true; },
    waitForTimeout: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5))),
    waitForLoadState: async () => {},
    waitForURL: async () => {},
    evaluate: async (fn) => {
      const src = fn.toString();
      if (src.includes('שם משתמש')) {
        const onLogin = s.path.startsWith('/gmf-main-menu/login');
        return {
          onLogin, hasField: onLogin, hasValue: onLogin && !!s.value, autofilled: onLogin && s.autofilled,
          focused: onLogin && s.focused, username: s.username, hasForm: onLogin, visibleSubmits: onLogin ? 1 : 0,
          humanOnlyModal: s.modal, modalTitle: s.modal ? 'החלפת סיסמה' : null,
        };
      }
      if (src.includes('btn.click')) {
        s.submits++;
        if (accept) s.path = '/gmf-main-menu/main/home';
        return true;
      }
      if (src.includes('.modal.d-block, .modal.show\'')) return { blocked: false };
      if (src.includes('input[type=password]')) return s.path.startsWith('/gmf-main-menu/login');
      throw new Error(`evaluate לא צפוי: ${src.slice(0, 80)}`);
    },
  };
  return page;
}

/** «חלונית» של Chrome: invoked ממלא את השדה כמו Chrome (ערך + autofilled). */
function fakePicker(page, statuses) {
  const calls = [];
  const queue = [...statuses];
  const picker = async (args) => {
    calls.push(args);
    const status = queue.length > 1 ? queue.shift() : queue[0];
    if (status === 'invoked') { page.s.value = 'x'; page.s.autofilled = true; }
    return { status };
  };
  return { picker, calls };
}

const noForeground = async () => 'foreground';

// ─── מחזור ההתחברות ────────────────────────────────────────────────────────

test('עובד שרק עלה: אין ראיה להתחברות מלאה ⇒ לא אוטומטי', async () => {
  // המצב ההתחלתי של המודול לפני כל קריאה ב-test הזה.
  assert.equal(shaamLoginCycle().state, 'unknown');
  assert.equal(gmfAutoAllowed(), false);
});

test('סיסמה ראשונה ⇒ ידני; התחברות מלאה ⇒ אוטומטי; סיסמה ראשונה שוב ⇒ ידני', () => {
  connected();
  assert.equal(gmfAutoAllowed(), true);
  assert.equal(beginShaamLoginCycle('first_password'), true);
  assert.equal(gmfAutoAllowed(), false);
  assert.equal(beginShaamLoginCycle('first_password'), false, 'כבר ידני — בלי מעבר נוסף');
  assert.equal(completeShaamLogin(), true);
  assert.equal(gmfAutoAllowed(), true);
});

// ─── מחובר + סיסמה שנייה בלבד ⇒ אוטומטי ─────────────────────────────────────

test('מחובר: בוחרים את השורה של שם המשתמש שבמסך, ולוחצים «כניסה» פעם אחת', async () => {
  connected();
  const page = fakeGmfLogin();
  const { picker, calls } = fakePicker(page, ['invoked']);
  const r = await tryGmfAutoLogin(page, { picker, foreground: noForeground });
  assert.deepEqual(r, { ok: true, reason: 'saved_password', attempted: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].username, 'D1466734');
  assert.equal(page.s.submits, 1);
  assert.equal(page.s.path, '/gmf-main-menu/main/home');
});

test('מחובר: החלונית לא נפתחה ⇒ החלון לחזית ברמת Windows, ועוד ניסיון פתיחה אחד', async () => {
  connected();
  const page = fakeGmfLogin();
  const { picker, calls } = fakePicker(page, ['no_popup', 'invoked']);
  let fg = 0;
  const r = await tryGmfAutoLogin(page, { picker, foreground: async () => { fg++; return 'foreground'; } });
  assert.equal(r.ok, true);
  assert.equal(fg, 1);
  assert.equal(calls.length, 2);
  assert.equal(page.s.fieldClicks, 2);
});

test('מחובר: סיסמה שמורה שנדחתה ⇒ ניסיון אחד בלבד, עד כניסה מוצלחת', async () => {
  connected();
  const page = fakeGmfLogin({ accept: false });
  const first = fakePicker(page, ['invoked']);
  const r1 = await tryGmfAutoLogin(page, { picker: first.picker, foreground: noForeground });
  assert.equal(r1.ok, false);
  assert.equal(r1.attempted, true);
  assert.ok(gmfAutoLoginRejected());

  page.s.value = ''; page.s.autofilled = false;
  const second = fakePicker(page, ['invoked']);
  const r2 = await tryGmfAutoLogin(page, { picker: second.picker, foreground: noForeground });
  assert.deepEqual(r2, { ok: false, reason: 'rejected_earlier', attempted: false });
  assert.equal(second.calls.length, 0, 'לא פותחים את החלונית בכלל');
  assert.equal(page.s.submits, 1, '«כניסה» נלחצה פעם אחת בלבד');

  resetGmfAutoLogin();
  assert.equal(gmfAutoLoginRejected(), null);
});

test('מחובר: הקלדה ידנית (שדה מלא אבל לא ע"י Chrome) ⇒ לא לוחצים «כניסה»', async () => {
  connected();
  const page = fakeGmfLogin({ value: 'ab', autofilled: false });
  const { picker, calls } = fakePicker(page, ['invoked']);
  const r = await tryGmfAutoLogin(page, { picker, foreground: noForeground });
  assert.deepEqual(r, { ok: false, reason: 'typed_by_human', attempted: false });
  assert.equal(calls.length, 0);
  assert.equal(page.s.submits, 0);
});

test('מחובר: אין שם משתמש חד-משמעי במסך ⇒ לא בוחרים שורה', async () => {
  connected();
  const page = fakeGmfLogin({ username: null });
  const { picker, calls } = fakePicker(page, ['invoked']);
  const r = await tryGmfAutoLogin(page, { picker, foreground: noForeground });
  assert.equal(r.reason, 'username_not_found');
  assert.equal(calls.length, 0);
});

test('מחובר: חלונית שדורשת אדם (למשל «החלפת סיסמה») ⇒ לא נוגעים', async () => {
  connected();
  const page = fakeGmfLogin({ modal: true });
  const { picker, calls } = fakePicker(page, ['invoked']);
  const r = await ensureGmfLogin(page, { picker, foreground: noForeground, waitForHumanMs: 10 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'human_only_modal');
  assert.equal(calls.length, 0);
  assert.equal(page.s.submits, 0);
});

test('מחובר: אין שורה עם שם המשתמש ⇒ לא לוחצים כלום; בלי המתנה לאדם זה סוף הניסיון', async () => {
  connected();
  const page = fakeGmfLogin();
  const { picker } = fakePicker(page, ['no_matching_credential']);
  const r = await ensureGmfLogin(page, { picker, foreground: noForeground, waitForHumanMs: 0 });
  assert.deepEqual(r, { ok: false, reason: 'no_matching_credential' });
  assert.equal(page.s.submits, 0);
});

test('מחובר: אדם בוחר בעצמו את הסיסמה השמורה ⇒ PIVO לוחצת «כניסה» פעם אחת', async () => {
  connected();
  const page = fakeGmfLogin();
  setTimeout(() => { page.s.value = 'x'; page.s.autofilled = true; }, 30);
  const r = await waitForHumanGmfLogin(page, { waitMs: 2000, pollMs: 10 });
  assert.equal(r.ok, true);
  assert.equal(page.s.submits, 1);
});

// ─── מחזור התחברות חדש ⇒ הסיסמה השנייה ידנית ────────────────────────────────

test('מחזור חדש: tryGmfAutoLogin לא פותח את החלונית ולא לוחץ', async () => {
  newLoginCycle();
  const page = fakeGmfLogin();
  const { picker, calls } = fakePicker(page, ['invoked']);
  const r = await tryGmfAutoLogin(page, { picker, foreground: noForeground });
  assert.deepEqual(r, { ok: false, reason: 'manual_login_cycle', attempted: false });
  assert.equal(calls.length, 0);
  assert.equal(page.s.submits, 0);
});

test('מחזור חדש: הרו"ח בוחר את השמורה ⇒ PIVO **לא** לוחצת «כניסה»; הרו"ח לוחץ ⇒ ממשיכים', async () => {
  newLoginCycle();
  const page = fakeGmfLogin();
  const { picker, calls } = fakePicker(page, ['invoked']);
  setTimeout(() => { page.s.value = 'x'; page.s.autofilled = true; }, 20);
  setTimeout(() => { page.s.path = '/gmf-main-menu/main/home'; }, 120);
  const r = await ensureGmfLogin(page, { picker, foreground: noForeground, waitForHumanMs: 2000 });
  assert.equal(r.ok, true);
  assert.equal(r.via, 'human');
  assert.equal(calls.length, 0, 'PIVO לא פתחה את חלונית הסיסמאות');
  assert.equal(page.s.submits, 0, 'PIVO לא לחצה «כניסה» — הרו"ח לחץ');
  assert.equal(page.s.fieldClicks, 1, 'השדה קיבל פוקוס פעם אחת, כדי שהרו"ח יראה את ההצעה');
});

test('מחזור חדש: הרו"ח לא סיים ⇒ עוצרים בלי ללחוץ, עם הסיבה «מחזור ידני»', async () => {
  newLoginCycle();
  const page = fakeGmfLogin();
  const { picker, calls } = fakePicker(page, ['invoked']);
  const r = await ensureGmfLogin(page, { picker, foreground: noForeground, waitForHumanMs: 0 });
  assert.deepEqual(r, { ok: false, reason: 'manual_login_cycle' });
  assert.equal(calls.length, 0);
  assert.equal(page.s.submits, 0);
});

test('מחזור חדש: שדה שכבר בפוקוס או מתחיל להתמלא ⇒ לא לוחצים עליו שוב (לא מזיזים סמן)', async () => {
  newLoginCycle();
  const page = fakeGmfLogin({ value: 'ab' });
  page.s.focused = true;
  setTimeout(() => { page.s.path = '/gmf-main-menu/main/home'; }, 30);
  const r = await waitForHumanGmfLogin(page, { waitMs: 2000, pollMs: 10 });
  assert.equal(r.ok, true);
  assert.equal(page.s.fieldClicks, 0);
  assert.equal(page.s.submits, 0);
});

test('אדם מקליד ⇒ PIVO לא שולחת; ממתינה שהוא ישלח בעצמו (בשני המצבים)', async () => {
  for (const setup of [connected, newLoginCycle]) {
    setup();
    const page = fakeGmfLogin({ accept: true });
    page.s.value = 'ab';
    setTimeout(() => { page.s.path = '/gmf-main-menu/main/home'; }, 40);
    const r = await waitForHumanGmfLogin(page, { waitMs: 2000, pollMs: 10 });
    assert.equal(r.ok, true);
    assert.equal(page.s.submits, 0, 'הרו"ח שלח, לא PIVO');
  }
});

test('פענוח תשובת הבוחר ושם משתמש מותר', () => {
  assert.deepEqual(parsePickOutput('{"status":"invoked","rows":2}'), { status: 'invoked', rows: 2 });
  assert.deepEqual(parsePickOutput('warning\r\n{"status":"no_popup"}'), { status: 'no_popup' });
  assert.equal(parsePickOutput('garbage').status, 'error');
  assert.equal(isPickableUsername('D1466734'), true);
  assert.equal(isPickableUsername('D1466734*'), false);
  assert.equal(isPickableUsername(''), false);
  assert.equal(isPickableUsername(null), false);
});
