// ─── בדיקות: מודל האימות המאושר (23.09.2026) ────────────────────────────────
// ‼ הכלל: התחברות ראשית פעם אחת → הכנת אמצעי משנה פעם אחת → מוכן →
// תת-מערכות עצלות. 12 הבדיקות שסימן ה-milestone כחובה, ממופות כאן.
//
//   node --test test/shaam-auth-state.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  AUTH_STATE, mainAuthState, subsystemLoginState,
  allowsAutomaticContinuation, requiresHumanNow,
} from '../src/shaamAuthState.mjs';
import { attemptRepresentationLoginConfirm, readRepresentationLoginForm } from '../src/browserSession.mjs';
import {
  isShaamLifecycleEstablished, markGmfVerified, resetShaamLifecycle,
} from '../src/connectionMonitor.mjs';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const noop = () => {};

// ── 1/8 · #/login לבד אינו MAIN_HUMAN_AUTH_REQUIRED ────────────────────────

test('1 · מסך ללא שדה סיסמה כלל (נצפה בפועל, 23.09.2026) → UNKNOWN, לא MAIN_HUMAN_AUTH_REQUIRED', () => {
  // ‼ המסך האמיתי של "מערכת לרישום ייצוג" הציג שם משתמש כטקסט קבוע
  // מהכרטיס ובלי input[type=password] כלל — hash עדיין #/login.
  const state = subsystemLoginState({
    onLoginScreen: true, hasPasswordField: false, passwordHasValue: false, submitButtonCount: 0,
  });
  assert.equal(state, AUTH_STATE.UNKNOWN_AUTH_STATE);
  assert.notEqual(state, AUTH_STATE.MAIN_HUMAN_AUTH_REQUIRED);
});

test('8 · UNKNOWN_AUTH_STATE אינו מאפשר המשך אוטומטי', () => {
  assert.equal(allowsAutomaticContinuation(AUTH_STATE.UNKNOWN_AUTH_STATE), false);
  assert.equal(requiresHumanNow(AUTH_STATE.UNKNOWN_AUTH_STATE), true);
});

test('8 · אין שדה סיסמה ⇒ attemptRepresentationLoginConfirm לא לוחץ כלום', async () => {
  let evaluateCalls = 0;
  const page = { evaluate: async () => { evaluateCalls++; return { hasField: false, hasValue: false, hasForm: false, submitButtonCount: 0, humanOnlyModal: false, modalTitle: null }; } };
  const r = await attemptRepresentationLoginConfirm(page);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_password_field');
  assert.equal(evaluateCalls, 1, 'רק קריאת read אחת — לא הגיע לשלב לחיצה');
});

// ── 2 · המשך סיסמה שמורה מזוהה ──────────────────────────────────────────────

test('2 · שדה מולא + כפתור יחיד חד-משמעי → SAVED_CREDENTIAL_CONTINUATION', () => {
  const state = subsystemLoginState({
    onLoginScreen: true, hasPasswordField: true, passwordHasValue: true, submitButtonCount: 1, humanOnlyModal: false,
  });
  assert.equal(state, AUTH_STATE.SAVED_CREDENTIAL_CONTINUATION);
  assert.equal(allowsAutomaticContinuation(state), true);
});

test('2 · כמה כפתורים חד-משמעיים (לא ברור איזה) → UNKNOWN, לא המשך אוטומטי', () => {
  const state = subsystemLoginState({
    onLoginScreen: true, hasPasswordField: true, passwordHasValue: true, submitButtonCount: 2,
  });
  assert.equal(state, AUTH_STATE.UNKNOWN_AUTH_STATE);
  assert.equal(allowsAutomaticContinuation(state), false);
});

// ── 3 · המשך מוכר נשלח פעם אחת ──────────────────────────────────────────────

test('3 · תנאים מלאים: read אחת, click אחת, read-אחרי אחת — ולא יותר', async () => {
  const seq = [];
  const page = {
    evaluate: async () => {
      seq.push(seq.length);
      if (seq.length === 1) return { hasField: true, hasValue: true, hasForm: true, submitButtonCount: 1, humanOnlyModal: false, modalTitle: null };
      if (seq.length === 2) return true; // click succeeded
      // (3) snapRepresentation: הגיע למסך המוכר — כותרת נכונה + תווית לשונית, בלי שדה סיסמה.
      return { hasPasswordField: false, titleMatches: true, hasReadyMarkers: true, hasCredentialControl: false };
    },
    waitForTimeout: async () => {},
    waitForLoadState: async () => {},
    url: () => 'https://shaam.taxes.gov.il/srmyzgipuykoach/#/reshimatMeyuzagim',
  };
  const r = await attemptRepresentationLoginConfirm(page);
  assert.equal(seq.length, 3, 'בדיוק שלוש קריאות evaluate — לא לולאה');
  assert.equal(r.ok, true);
});

// ── 4 · המשך שנכשל לא מנוסה שוב ──────────────────────────────────────────────

test('4 · לחיצה שלא נחתה על מסך מוכן → ok:false, בלי ניסיון נוסף', async () => {
  // ‼ שלוש קריאות evaluate בסדר קבוע: (1) readRepresentationLoginForm,
  // (2) הקליק עצמו, (3) snapRepresentation אחרי — לעולם לא רביעית.
  const seq = [];
  const page = {
    evaluate: async () => {
      seq.push(seq.length);
      if (seq.length === 1) return { hasField: true, hasValue: true, hasForm: true, submitButtonCount: 1, humanOnlyModal: false, modalTitle: null };
      if (seq.length === 2) return true; // click succeeded
      // (3) snapRepresentation: עדיין על מסך הכניסה — לא הגיע ל-ready.
      return { hasPasswordField: true, titleMatches: true, hasReadyMarkers: false, hasCredentialControl: true };
    },
    waitForTimeout: async () => {},
    waitForLoadState: async () => {},
    url: () => 'https://shaam.taxes.gov.il/srmyzgipuykoach/#/login',
  };
  const r = await attemptRepresentationLoginConfirm(page);
  assert.equal(r.ok, false);
  assert.equal(seq.length, 3, 'read + click + read-אחרי — ולא ניסיון קליק נוסף');
});

// ── 5 · אמצעי משנה חסר דורש אדם ──────────────────────────────────────────────

test('5 · שדה סיסמה קיים אך ריק → SECONDARY_CREDENTIAL_SETUP_REQUIRED', () => {
  const state = subsystemLoginState({
    onLoginScreen: true, hasPasswordField: true, passwordHasValue: false, submitButtonCount: 1,
  });
  assert.equal(state, AUTH_STATE.SECONDARY_CREDENTIAL_SETUP_REQUIRED);
  assert.equal(requiresHumanNow(state), true);
});

// ── 6 · אימות ראשי/כרטיס חכם דורש אדם ────────────────────────────────────────

test('6 · auth_required (כרטיס/PIN) → MAIN_HUMAN_AUTH_REQUIRED', () => {
  assert.equal(mainAuthState({ authenticated: false, state: 'auth_required' }), AUTH_STATE.MAIN_HUMAN_AUTH_REQUIRED);
});

test('6 · unreachable (אין חלון בכלל) → MAIN_HUMAN_AUTH_REQUIRED', () => {
  assert.equal(mainAuthState({ authenticated: false, state: 'unreachable' }), AUTH_STATE.MAIN_HUMAN_AUTH_REQUIRED);
});

// ── 7 · מצב אבטחה/חסימה עוצר מיד ─────────────────────────────────────────────

test('7 · card_not_recognized → AUTH_REJECTED_OR_SECURITY_BLOCK', () => {
  assert.equal(mainAuthState({ authenticated: false, state: 'card_not_recognized' }), AUTH_STATE.AUTH_REJECTED_OR_SECURITY_BLOCK);
});

test('7 · blockingSignal על תת-מערכת → AUTH_REJECTED_OR_SECURITY_BLOCK, לא המשך אוטומטי', () => {
  const state = subsystemLoginState({ onLoginScreen: true, blockingSignal: true, hasPasswordField: true, passwordHasValue: true, submitButtonCount: 1 });
  assert.equal(state, AUTH_STATE.AUTH_REJECTED_OR_SECURITY_BLOCK);
  assert.equal(allowsAutomaticContinuation(state), false);
});

// ── 9 · אין סיור יזום בכל תת-מערכת בחיבור הרגיל ──────────────────────────────

test('9 · connectionMonitor אינו מנווט יזום ל-VAT/מגן/ייצוג — GMF בלבד', () => {
  const s = src('../src/connectionMonitor.mjs');
  assert.ok(!s.includes('openVatAndCheck('), 'אין קריאה יזומה ל-VAT');
  assert.ok(!s.includes('openNikuiAndCheck('), 'אין קריאה יזומה למגן');
  assert.ok(!s.includes('openRepresentationAndCheck('), 'אין קריאה יזומה לייצוג');
  assert.ok(s.includes('openGmfAndCheck('), 'GMF נשארת — היא הבוטסטרפ היחיד');
  // ‼ הניווט היחיד שנשאר מותנה ב-!gmf, לא רץ שוב אחרי שהיא כבר מוכנה.
  assert.match(s, /if \(shaam && !gmf &&/);
});

// ── 10 · כניסה לתת-מערכת היא עצלה — רק כשעבודה אמיתית דורשת ──────────────────

test('10 · openRepresentationSystem מאציל ל-ensureRepresentation, לא מממש סיווג מקביל', () => {
  const s = src('../src/shaamRepresentationSession.mjs');
  assert.ok(s.includes('ensureRepresentation(page)'), 'openRepresentationSystem קורא ל-ensure המשותף');
  assert.ok(!s.includes('const classify ='), 'אין סיווג DOM מקומי כפול/מקביל ל-ensureRepresentation');
  assert.ok(!s.includes('subsystemLoginState('), 'הסיווג הכפול הוסר — לא נשאר קורא ישיר לסיווג מ-shaamAuthState כאן');
});

test('10 · warmupManager.runCapabilities נקרא רק מ-ensureCapability ומ-handlers עסקיים, לא מהחיבור הרקעי', () => {
  const monitor = src('../src/connectionMonitor.mjs');
  assert.ok(!monitor.includes('runCapabilities') && !monitor.includes('ensureRepresentation'),
    'connectionMonitor אינו מפעיל ensure ישירות — זה תפקיד ה-handler העסקי/ensureCapability');
});

// ── 11 · מחזור-חיים חדש נכנס מחדש לבוטסטרפ אמצעי המשנה ───────────────────────

test('11 · לפני markGmfVerified — המחזור אינו מבוסס', () => {
  resetShaamLifecycle(noop, 'test-reset');
  assert.equal(isShaamLifecycleEstablished(), false);
});

test('11 · אחרי markGmfVerified — המחזור מבוסס', () => {
  markGmfVerified();
  assert.equal(isShaamLifecycleEstablished(), true);
});

test('11 · resetShaamLifecycle (חלון נסגר) מבטל את הביסוס — בוטסטרפ חדש נדרש', () => {
  markGmfVerified();
  assert.equal(isShaamLifecycleEstablished(), true);
  resetShaamLifecycle(noop, 'window_closed');
  assert.equal(isShaamLifecycleEstablished(), false);
});

// ── 12 · ערובות ה-no-retry הקיימות לא נשברו ──────────────────────────────────

// ── 23.09.2026 · השדה האמיתי הוא type=text, לא type=password ────────────────
// ‼ המסך האמיתי ("מערכת לרישום ייצוג") הציג input[type=text] יחיד וגלוי,
// כבר מולא (6 תווים), בלי -webkit-text-security. ניסיון אימות מקצה-לקצה
// של תרחיש בדיוק כזה נמצא ב-lifecycle-gate.test.mjs (test 2) — כאן רק
// בדיקות המבנה/הבטיחות שלא נחזרות שם.

test('1/13 · readRepresentationLoginForm: נפילה לשדה הגלוי היחיד קיימת במקור, ומותנית בכותרת', () => {
  const s = src('../src/browserSession.mjs');
  const fn = s.slice(s.indexOf('export async function readRepresentationLoginForm'),
                      s.indexOf('export async function attemptRepresentationLoginConfirm'));
  assert.ok(fn.includes("querySelector('input[type=\"password\"]')"), 'עדיין מנסה קודם שדה סיסמה רגיל');
  assert.ok(fn.includes('visibleInputs.length === 1'), 'נופל לשדה הגלוי היחיד — לא לכל שדה טקסט');
  assert.ok(fn.includes('titleRe.test(document.title)'), 'הנפילה מותנית בכותרת המסך המוכר — לא בכל מסך');
});

test('2/13 · הסיווג לעולם לא קורא/מחזיר את תוכן הערך — רק length/בוליאני', () => {
  const s = src('../src/browserSession.mjs');
  const fn = s.slice(s.indexOf('export async function readRepresentationLoginForm'),
                      s.indexOf('export async function attemptRepresentationLoginConfirm'));
  // ‼ מחפשים כל שימוש ב-`.value` ומוודאים שהוא תמיד בהקשר length/בוליאני,
  // לא מוקצה למשתנה מוחזר/מודפס.
  const valueUses = [...fn.matchAll(/\.value\b(?!Length)[^;,)\n]*/g)].map((m) => m[0]);
  for (const use of valueUses) {
    assert.ok(/\.length|!!|&&/.test(use), `שימוש חשוד ב-.value: "${use}"`);
    assert.ok(!/return\s+\w*\.value\b(?!\.length)/.test(use), `ערך מוחזר ישירות: "${use}"`);
  }
  assert.ok(valueUses.length > 0, 'יש בכלל בדיקת ערך — לא בדיקה ריקה');
});

test('7 · כשל ברענון סשן הפורטל (רשת/timeout) אינו מאפס מחזור-חיים — רק תשובה חיובית מהשרת', () => {
  const s = src('../src/connectionMonitor.mjs');
  const block = s.slice(s.indexOf('const probe = await probeServerSession'), s.indexOf('// ── שכבות 2–4'));
  const ifOkIdx = block.indexOf('if (probe.ok)');
  const resetIdx = block.indexOf('resetShaamLifecycle');
  assert.ok(ifOkIdx >= 0 && resetIdx > ifOkIdx, 'resetShaamLifecycle יושב בתוך if(probe.ok) — לא מופעל על כשל רשת');
  const elseIdx = block.indexOf('} else {');
  assert.ok(elseIdx > resetIdx, 'יש ענף else נפרד לכשל שלא נוגע במחזור החיים');
});

test('12 · ensureRepresentation עדיין שוער ב-isShaamLifecycleEstablished לפני אישור אוטומטי', () => {
  const s = src('../src/warmupManager.mjs');
  assert.ok(s.includes('isShaamLifecycleEstablished()'),
    'אישור אוטומטי של מערכת הייצוג עדיין מותנה במחזור-חיים מבוסס');
  // ‼ 12 המלאה (no-retry על shaam.create_representation/submit_poa) כבר
  // מכוסה ב-34 הבדיקות הקיימות (shaam-safety/shaam-representation) — לא
  // משוכפלת כאן.
});
