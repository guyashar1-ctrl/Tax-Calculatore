// lifecycle-gate.test.mjs — שער מחזור-החיים לאישור אוטומטי של טופס-משנה
// (מערכת הייצוג): במחזור חיים חדש (לפני ש-GMF אומתה) PIVO לא לוחצת על
// טופס שמולא ע"י Chrome; אחרי אימות GMF — כן, פעם אחת; אחרי איפוס מחזור
// החיים — שוב לא. page מדומה, בלי Chrome אמיתי; ההכרעה היא על ההיגיון.
//
// ‼ הועבר מ-`node test/lifecycle-gate.mjs` (סקריפט עצמאי) ל-`node --test`
// אחרי ש-23.09.2026 גילה שהוא היה שבור בשקט — לא היה חלק מריצת הבדיקות
// הרגילה, ומיפוי-הזיהוי הישן (התאמת מחרוזת על תוכן הפונקציה) הפסיק להתאים
// אחרי ש-`readRepresentationLoginForm` הופרד לפונקציה משותפת.
//
//   node --test test/lifecycle-gate.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureRepresentation } from '../src/warmupManager.mjs';
import { resetShaamLifecycle, markGmfVerified, isShaamLifecycleEstablished } from '../src/connectionMonitor.mjs';

/**
 * לשונית מדומה על מסך הכניסה של הייצוג, עם שדה שכבר מולא (Chrome).
 * ‼ שלוש קריאות evaluate שונות מזוהות **לפי תוכן הפונקציה עצמה**, לא לפי
 * סדר — בדיוק כי `readRepresentationLoginForm` והקליק (attemptRepresentationLoginConfirm)
 * שניהם מקבלים אותו מספר ארגומנטים (titleSrc) ולא ניתן להבדיל ביניהם לפי arity.
 */
function fakeRepresentationLoginPage() {
  const state = { hash: '#/login', confirmAttempted: false };
  return {
    state,
    url: () => `https://shaam.taxes.gov.il/srReshMeyuzagim/${state.hash}`,
    title: async () => 'רשות המיסים - מערכת לרישום ייצוג',
    goto: async () => {},
    reload: async () => {},
    waitForTimeout: async () => {},
    waitForLoadState: async () => {},
    evaluate: async (fn) => {
      const src = String(fn);
      if (src.includes('.click()')) { state.confirmAttempted = true; state.hash = '#/reshimatMeyuzagim'; return true; }
      if (src.includes('humanOnlyModal')) {
        // readRepresentationLoginForm — שדה type=text יחיד, כבר מולא (23.09.2026).
        const onLogin = state.hash === '#/login';
        return {
          hasField: onLogin, fieldKind: onLogin ? 'sole_visible_field_on_known_screen' : null,
          hasValue: onLogin, hasForm: onLogin, submitButtonCount: onLogin ? 1 : 0,
          humanOnlyModal: false, modalTitle: null,
        };
      }
      // snapRepresentation: כותרת נכונה תמיד; hasReadyMarkers רק אחרי הקליק;
      // hasPasswordField תמיד false (השדה האמיתי type=text, לא type=password —
      // נצפה בפועל, 23.09.2026) — hasCredentialControl הוא מה שמזהה login.
      const onLogin = state.hash === '#/login';
      return { hasPasswordField: false, titleMatches: true, hasReadyMarkers: !onLogin, hasCredentialControl: onLogin };
    },
  };
}

test('1a/1b/1c/1d · מחזור חיים חדש: השער סגור, הטופס המלא לא נלחץ', async () => {
  resetShaamLifecycle(() => {}, 'test');
  assert.equal(isShaamLifecycleEstablished(), false);
  const page = fakeRepresentationLoginPage();
  const r = await ensureRepresentation(page);
  assert.equal(r.state, 'human_required');
  assert.equal(r.reasonCode, 'bootstrap_required');
  assert.equal(page.state.confirmAttempted, false);
});

test('2a/2b/2c/2d · אחרי אימות GMF: ייצוג מוכנה אוטומטית, לחיצה יחידה', async () => {
  markGmfVerified();
  assert.equal(isShaamLifecycleEstablished(), true);
  const page = fakeRepresentationLoginPage();
  const r = await ensureRepresentation(page);
  assert.equal(r.state, 'ready');
  assert.equal(r.reasonCode, 'confirmed_autofill');
  assert.equal(page.state.confirmAttempted, true);
});

// ── 23.09.2026 · תהליך עובד "טרי" (דגל תוך-תהליכי כבוי) שמודד GMF בעצמו ──────
// ‼ זה בדיוק המצב האמיתי של worker מבודד/שהופעל מחדש: הדגל התוך-תהליכי
// isShaamLifecycleEstablished() התאפס, אבל הסשן האמיתי (אותו Chrome) עדיין
// חי. במקום להכריז "לא מבוסס" סתם, ensureRepresentation מודד את GMF —
// **בלשונית נפרדת**, בלי לגעת בלשונית של מערכת הייצוג עצמה.

/** לשונית "GMF" מדומה — כבר על התפריט, לא על מסך כניסה. */
function fakeGmfReadyPage() {
  return {
    context: () => ({ pages: () => [] }), // אין לשונית קיימת לשימוש חוזר
    url: () => 'https://shaam.taxes.gov.il/gmf-main-menu/main/home',
    goto: async () => {},
    waitForLoadState: async () => {},
    waitForTimeout: async () => {},
    evaluate: async () => false, // hasPasswordField=false — לא על מסך כניסה
    close: async () => {},
  };
}

test('11/23.09 · דגל תוך-תהליכי כבוי, אבל GMF עדיין מחוברת בפועל — הלשונית של הייצוג לא זזה', async () => {
  resetShaamLifecycle(() => {}, 'fresh-process-simulation');
  assert.equal(isShaamLifecycleEstablished(), false);

  const scratch = fakeGmfReadyPage();
  let scratchOpened = false;
  const repPage = fakeRepresentationLoginPage();
  const repGotoCalls = [];
  const origGoto = repPage.goto;
  repPage.goto = async (...args) => { repGotoCalls.push(args[0]); return origGoto(...args); };
  repPage.context = () => ({
    newPage: async () => { scratchOpened = true; return scratch; },
  });

  const r = await ensureRepresentation(repPage);

  assert.equal(scratchOpened, true, 'נפתחה לשונית נפרדת למדידת GMF');
  assert.equal(isShaamLifecycleEstablished(), true, 'המדידה עדכנה את הדגל התוך-תהליכי בהתאם למציאות');
  assert.equal(r.state, 'ready', 'הייצוג המשיך אוטומטית אחרי שה-GMF הפרטי אומת');
  assert.equal(repPage.state.confirmAttempted, true);
  for (const url of repGotoCalls) {
    assert.ok(!String(url).includes('gmf-main-menu'), 'הלשונית של מערכת הייצוג לא נוטתה ל-GMF בשום שלב');
  }
});

test('3a/3b/3c · איפוס מחזור חיים נוסף: השער נסגר שוב, בלי לחיצה', async () => {
  resetShaamLifecycle(() => {}, 'test-reset');
  assert.equal(isShaamLifecycleEstablished(), false);
  const page = fakeRepresentationLoginPage();
  const r = await ensureRepresentation(page);
  assert.equal(r.reasonCode, 'bootstrap_required');
  assert.equal(page.state.confirmAttempted, false);
});
