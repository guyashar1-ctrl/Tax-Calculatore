// lifecycle-gate.mjs — שער מחזור-החיים לאישור אוטומטי של טפסי-משנה (ייצוג):
// במחזור חיים חדש (לפני ש-GMF אומתה) PIVO לא לוחצת על טופס שמולא ע"י Chrome;
// אחרי אימות GMF — כן; אחרי איפוס מחזור החיים — שוב לא. page מדומה, בלי
// Chrome אמיתי; ההכרעה היא על ההיגיון, לא על הניווט.
//
// הרצה: node test/lifecycle-gate.mjs
import { ensureRepresentation } from '../src/warmupManager.mjs';
import { resetShaamLifecycle, markGmfVerified, isShaamLifecycleEstablished } from '../src/connectionMonitor.mjs';

let failures = 0;
function assertEq(actual, expected, label) {
  const ok = actual === expected;
  console.log(`${ok ? '✓' : '✗'} ${label} (${JSON.stringify(actual)} ${ok ? '===' : '!=='} ${JSON.stringify(expected)})`);
  if (!ok) failures++;
}

/** לשונית מדומה על מסך הכניסה של הייצוג, עם שדה סיסמה שכבר מולא (Chrome). */
function fakeRepresentationLoginPage() {
  const state = { hash: '#/login', confirmAttempted: false };
  return {
    state,
    url: () => `https://shaam.taxes.gov.il/srReshMeyuzagim/${state.hash}`,
    goto: async () => {},
    reload: async () => {},
    waitForTimeout: async () => {},
    waitForLoadState: async () => {},
    evaluate: async (fn) => {
      const src = String(fn);
      if (src.includes('btn.click()')) { state.confirmAttempted = true; state.hash = '#/reshimatMeyuzagim'; return true; }
      if (src.includes('no_password_field')) return { ok: true };
      return state.hash === '#/login'; // snapRepresentation: יש שדה סיסמה רק במסך הכניסה
    },
  };
}

const quiet = () => {};

// ── 1. מחזור חיים חדש: השער סגור, הטופס המלא לא נלחץ ───────────────────────
resetShaamLifecycle(quiet, 'test');
assertEq(isShaamLifecycleEstablished(), false, '1a: אחרי איפוס — מחזור החיים לא מוקם');
{
  const page = fakeRepresentationLoginPage();
  const r = await ensureRepresentation(page);
  assertEq(r.state, 'human_required', '1b: ייצוג דורש אדם במחזור חדש');
  assertEq(r.reasonCode, 'bootstrap_required', '1c: הסיבה היא שער ה-bootstrap, לא הטופס');
  assertEq(page.state.confirmAttempted, false, '1d: לא בוצעה שום לחיצה על הטופס שמולא');
}

// ── 2. GMF אומתה: השער נפתח, ייצוג אוטומטי לגמרי ────────────────────────────
markGmfVerified();
assertEq(isShaamLifecycleEstablished(), true, '2a: אחרי אימות GMF — מחזור החיים מוקם');
{
  const page = fakeRepresentationLoginPage();
  const r = await ensureRepresentation(page);
  assertEq(r.state, 'ready', '2b: ייצוג מוכנה באותו מחזור חיים');
  assertEq(r.reasonCode, 'confirmed_autofill', '2c: דרך אישור המילוי של Chrome');
  assertEq(page.state.confirmAttempted, true, '2d: הלחיצה היחידה בוצעה');
}

// ── 3. איפוס מחזור החיים (ניתוק/פקיעה/הפעלה מחדש): השער נסגר שוב ─────────────
resetShaamLifecycle(quiet, 'test-reset');
assertEq(isShaamLifecycleEstablished(), false, '3a: אחרי איפוס נוסף — סגור');
{
  const page = fakeRepresentationLoginPage();
  const r = await ensureRepresentation(page);
  assertEq(r.reasonCode, 'bootstrap_required', '3b: ייצוג שוב מחכה ל-GMF');
  assertEq(page.state.confirmAttempted, false, '3c: ושוב בלי לחיצה');
}

console.log(`\n${failures === 0 ? '✓ עבר' : `✗ נכשל (${failures})`}: lifecycle gate — closed on new lifecycle, open after GMF, closed again after reset.`);
process.exit(failures === 0 ? 0 : 1);
