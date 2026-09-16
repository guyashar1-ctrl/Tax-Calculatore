// bounded-recovery.mjs — בדיקה מבוקרת (fixture, בלי Chrome אמיתי) של
// ensureWithBoundedRecovery: לא בטוח/לא אמין לאלץ דף לבן אמיתי בשע״ם כדי
// לבדוק את זה, ולכן page מדומה עם url()/evaluate()/reload()/waitForTimeout()
// שהפונקציה קוראת דרך isOnWorkScreen/settlePage הקיימים.
//
// הרצה: node test/bounded-recovery.mjs
import { ensureWithBoundedRecovery } from '../src/browserSession.mjs';

let failures = 0;
function assertEq(actual, expected, label) {
  const ok = actual === expected;
  console.log(`${ok ? '✓' : '✗'} ${label} (${JSON.stringify(actual)} ${ok ? '===' : '!=='} ${JSON.stringify(expected)})`);
  if (!ok) failures++;
}

/** page מדומה: לא על מסך עבודה (isOnWorkScreen=false) כברירת מחדל. */
function fakePage({ pathname = '/other', hasPasswordField = false } = {}) {
  return {
    url: () => `https://example.test${pathname}`,
    evaluate: async () => hasPasswordField,
    waitForLoadState: async () => {},
    waitForTimeout: async () => {},
    reload: async () => {},
  };
}

// ── 1. תוצאה סופית (ready) — אין שום התאוששות ──────────────────────────────
{
  const page = fakePage();
  const initial = { ready: true, reason: 'menu' };
  const r = await ensureWithBoundedRecovery(page, { initial, readCurrent: async () => ({ ready: true, reason: 'menu' }), reopen: async () => initial });
  assertEq(r.ready, true, '1a: ready מיידי נשאר ready');
  assertEq(r.recoveries, 0, '1b: אין ניסיונות התאוששות כשהתוצאה כבר סופית');
}

// ── 2. אתגר אמיתי (login_required) — לא ambiguous, אין התאוששות ────────────
{
  const page = fakePage();
  const initial = { ready: false, reason: 'login_required' };
  const r = await ensureWithBoundedRecovery(page, { initial, readCurrent: async () => ({ ready: false, reason: 'login_required' }), reopen: async () => initial });
  assertEq(r.reason, 'login_required', '2: login_required לא מטופל כ"דף לא-ודאי" — לא הופך human_required לבדיקה חוזרת');
  assertEq(r.recoveries, 0, '2b: אין התאוששות על אתגר אמיתי');
}

// ── 3. ambiguous → reload (התאוששות 1) מתקן → עוצר, לא מגיע ל-reopen ───────
{
  const page = fakePage();
  let reopenCalls = 0;
  const initial = { ready: false, reason: 'unexpected_destination' };
  const r = await ensureWithBoundedRecovery(page, {
    initial,
    readCurrent: async () => ({ ready: true, reason: 'menu', pathname: '/gmf-main-menu' }), // reload "תיקן"
    reopen: async () => { reopenCalls++; return { ready: true, reason: 'menu' }; },
  });
  assertEq(r.ready, true, '3a: reload בלבד הספיק');
  assertEq(r.recoveries, 1, '3b: התאוששות אחת בדיוק נוצלה');
  assertEq(reopenCalls, 0, '3c: לא הגענו לניווט מלא (reopen) כי reload כבר הכריע');
}

// ── 4. ambiguous אחרי reload, reopen (התאוששות 2) מתקן ──────────────────────
{
  const page = fakePage();
  let readCurrentCalls = 0;
  let reopenCalls = 0;
  const initial = { ready: false, reason: 'unexpected_destination' };
  const r = await ensureWithBoundedRecovery(page, {
    initial,
    readCurrent: async () => { readCurrentCalls++; return { ready: null, reason: null, pathname: '/' }; }, // עדיין לא על הנתיב בכלל אחרי reload
    reopen: async () => { reopenCalls++; return { ready: true, reason: 'menu' }; },
  });
  assertEq(r.ready, true, '4a: ניווט מלא (reopen) הכריע אחרי ש-reload לא לימד כלום');
  assertEq(r.recoveries, 2, '4b: שתי התאוששויות נוצלו');
  assertEq(readCurrentCalls, 1, '4c: readCurrent נקרא פעם אחת (בהתאוששות 1)');
  assertEq(reopenCalls, 1, '4d: reopen נקרא פעם אחת (בהתאוששות 2)');
}

// ── 5. עדיין ambiguous אחרי שתי ההתאוששויות → "לא זמינה" אמיתית, לא human_required, ולא יותר משתי נסיונות ──
{
  const page = fakePage();
  let reopenCalls = 0;
  const initial = { ready: false, reason: 'unexpected_destination' };
  const r = await ensureWithBoundedRecovery(page, {
    initial,
    readCurrent: async () => ({ ready: null, reason: null, pathname: '/' }),
    reopen: async () => { reopenCalls++; return { ready: false, reason: 'unexpected_destination' }; },
  });
  assertEq(r.ready, false, '5a: לא הופך ready על סמך ניחוש');
  assertEq(r.reason, 'transient_recovery_exhausted', '5b: מדווח "לא זמינה, לא human_required" אחרי מיצוי');
  assertEq(r.recoveries, 2, '5c: לא יותר משתי התאוששויות — לא refresh storm');
  assertEq(reopenCalls, 1, '5d: reopen נקרא פעם אחת בדיוק, לא בלולאה בלתי-מוגבלת');
}

// ── 6. מסך עבודה פתוח לרו"ח — לא נוגעים, עוצרים מיד בלי אף התאוששות ─────────
{
  const page = fakePage({ pathname: '/gmf-134/main/meda' }); // isOnWorkScreen⇒true
  let reloadCalls = 0;
  const wrappedPage = { ...page, reload: async () => { reloadCalls++; } };
  const initial = { ready: false, reason: 'unexpected_destination' };
  const r = await ensureWithBoundedRecovery(wrappedPage, {
    initial,
    readCurrent: async () => ({ ready: true, reason: 'menu' }),
    reopen: async () => ({ ready: true, reason: 'menu' }),
  });
  assertEq(r.reason, 'unexpected_destination', '6a: לא מדווח "exhausted" — לא בוצעה אף התאוששות בכלל');
  assertEq(r.recoveries, 0, '6b: אפס התאוששויות כשהדפדפן עומד על מסך עבודה פתוח');
  assertEq(reloadCalls, 0, '6c: לא בוצע אפילו reload אחד — לא נוגעים במסך שהרו"ח פתח');
}

console.log(`\n${failures === 0 ? '✓ עבר' : `✗ נכשל (${failures})`}: ensureWithBoundedRecovery — bounded, no storms, positive-evidence, work-screen-safe.`);
process.exit(failures === 0 ? 0 : 1);
