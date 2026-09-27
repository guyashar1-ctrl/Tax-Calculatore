// gmf-auto-login.test.mjs — הסיסמה השנייה של שע״ם (GMF) מ-Chrome, בלי אדם
// (החלטת גיא, 27.09.2026). page מדומה של מסך הכניסה ו«חלונית» מדומה של
// Chrome; ההכרעות שנבדקות כאן הן אלה שמגנות על החשבון:
//   · לוחצים «כניסה» רק אחרי ש-Chrome מילא (autofilled) — לא על הקלדה.
//   · סיסמה שמורה שנדחתה ⇒ ניסיון אחד, ואז לא שוב עד כניסה מוצלחת/מחזור חדש.
//   · בוחרים רק לפי שם המשתמש שמוצג במסך.
//
//   node --test test/gmf-auto-login.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tryGmfAutoLogin, ensureGmfLogin, waitForHumanGmfLogin, resetGmfAutoLogin, gmfAutoLoginRejected,
} from '../src/gmfAutoLogin.mjs';
import { parsePickOutput, isPickableUsername } from '../src/chromePasswordPicker.mjs';

function fakeGmfLogin({ username = 'D1466734', accept = true, value = '', autofilled = false, modal = false } = {}) {
  const s = { path: '/gmf-main-menu/login', value, autofilled, username, modal, submits: 0, fieldClicks: 0 };
  const page = {
    s,
    url: () => `https://shaam.taxes.gov.il${s.path}`,
    bringToFront: async () => {},
    click: async () => { s.fieldClicks++; },
    waitForTimeout: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5))),
    waitForLoadState: async () => {},
    waitForURL: async () => {},
    evaluate: async (fn) => {
      const src = fn.toString();
      if (src.includes('שם משתמש')) {
        const onLogin = s.path.startsWith('/gmf-main-menu/login');
        return {
          onLogin, hasField: onLogin, hasValue: onLogin && !!s.value, autofilled: onLogin && s.autofilled,
          username: s.username, hasForm: onLogin, visibleSubmits: onLogin ? 1 : 0,
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

test('סיסמה שמורה: בוחרים את השורה של שם המשתמש שבמסך, ולוחצים «כניסה» פעם אחת', async () => {
  resetGmfAutoLogin();
  const page = fakeGmfLogin();
  const { picker, calls } = fakePicker(page, ['invoked']);
  const r = await tryGmfAutoLogin(page, { picker, foreground: noForeground });
  assert.deepEqual(r, { ok: true, reason: 'saved_password', attempted: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].username, 'D1466734');
  assert.equal(page.s.submits, 1);
  assert.equal(page.s.path, '/gmf-main-menu/main/home');
});

test('החלונית לא נפתחה ⇒ החלון לחזית ברמת Windows, ועוד ניסיון פתיחה אחד', async () => {
  resetGmfAutoLogin();
  const page = fakeGmfLogin();
  const { picker, calls } = fakePicker(page, ['no_popup', 'invoked']);
  let fg = 0;
  const r = await tryGmfAutoLogin(page, { picker, foreground: async () => { fg++; return 'foreground'; } });
  assert.equal(r.ok, true);
  assert.equal(fg, 1);
  assert.equal(calls.length, 2);
  assert.equal(page.s.fieldClicks, 2);
});

test('סיסמה שמורה שנדחתה ⇒ ניסיון אחד בלבד, עד כניסה מוצלחת', async () => {
  resetGmfAutoLogin();
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

test('הקלדה ידנית (שדה מלא אבל לא ע"י Chrome) ⇒ לא לוחצים «כניסה»', async () => {
  resetGmfAutoLogin();
  const page = fakeGmfLogin({ value: 'ab', autofilled: false });
  const { picker, calls } = fakePicker(page, ['invoked']);
  const r = await tryGmfAutoLogin(page, { picker, foreground: noForeground });
  assert.deepEqual(r, { ok: false, reason: 'typed_by_human', attempted: false });
  assert.equal(calls.length, 0);
  assert.equal(page.s.submits, 0);
});

test('אין שם משתמש חד-משמעי במסך ⇒ לא בוחרים שורה', async () => {
  resetGmfAutoLogin();
  const page = fakeGmfLogin({ username: null });
  const { picker, calls } = fakePicker(page, ['invoked']);
  const r = await tryGmfAutoLogin(page, { picker, foreground: noForeground });
  assert.equal(r.reason, 'username_not_found');
  assert.equal(calls.length, 0);
});

test('חלונית שדורשת אדם (למשל «החלפת סיסמה») ⇒ לא נוגעים', async () => {
  resetGmfAutoLogin();
  const page = fakeGmfLogin({ modal: true });
  const { picker, calls } = fakePicker(page, ['invoked']);
  const r = await ensureGmfLogin(page, { picker, foreground: noForeground, waitForHumanMs: 10 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'human_only_modal');
  assert.equal(calls.length, 0);
  assert.equal(page.s.submits, 0);
});

test('אין שורה עם שם המשתמש ⇒ לא לוחצים כלום; בלי המתנה לאדם זה סוף הניסיון', async () => {
  resetGmfAutoLogin();
  const page = fakeGmfLogin();
  const { picker } = fakePicker(page, ['no_matching_credential']);
  const r = await ensureGmfLogin(page, { picker, foreground: noForeground, waitForHumanMs: 0 });
  assert.deepEqual(r, { ok: false, reason: 'no_matching_credential' });
  assert.equal(page.s.submits, 0);
});

test('אדם בוחר בעצמו את הסיסמה השמורה ⇒ PIVO לוחצת «כניסה» פעם אחת', async () => {
  resetGmfAutoLogin();
  const page = fakeGmfLogin();
  setTimeout(() => { page.s.value = 'x'; page.s.autofilled = true; }, 30);
  const r = await waitForHumanGmfLogin(page, { waitMs: 2000, pollMs: 10 });
  assert.equal(r.ok, true);
  assert.equal(page.s.submits, 1);
});

test('אדם מקליד ⇒ PIVO לא שולחת; ממתינה שהוא ישלח בעצמו', async () => {
  resetGmfAutoLogin();
  const page = fakeGmfLogin({ accept: true });
  page.s.value = 'ab';
  setTimeout(() => { page.s.path = '/gmf-main-menu/main/home'; }, 40);
  const r = await waitForHumanGmfLogin(page, { waitMs: 2000, pollMs: 10 });
  assert.equal(r.ok, true);
  assert.equal(page.s.submits, 0, 'הרו"ח שלח, לא PIVO');
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
