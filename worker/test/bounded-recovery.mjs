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

// ── 7–10 (30.10.2026): דף שעדיין יורד — מחכים לו, לא מרעננים ─────────────────
/** page שהמסמך שלו «בטעינה» עד שעוברות loadingTicks המתנות. */
function loadingPage(loadingTicks) {
  let ticks = 0;
  const calls = { reload: 0 };
  return {
    calls,
    url: () => 'https://example.test/srmyzgipuykoach/',
    isClosed: () => false,
    evaluate: async (fn) => (String(fn).includes('readyState')
      ? { readyState: ticks < loadingTicks ? 'loading' : 'complete', hasBody: ticks >= loadingTicks, resources: 10 }
      : false),
    waitForLoadState: async () => {},
    waitForTimeout: async (ms) => { ticks++; await new Promise((r) => setTimeout(r, Math.min(ms, 5))); },
    reload: async () => { calls.reload++; },
  };
}

{
  // 7. «ריק» כי הדף עוד יורד, ואז נטען — בלי פתיחה מחדש.
  const page = loadingPage(3);
  let reopenCalls = 0;
  const r = await ensureWithBoundedRecovery(page, {
    initial: { ready: false, reason: 'unknown_screen' },
    readCurrent: async () => ({ ready: true, reason: 'list_screen', pathname: '/srmyzgipuykoach/' }),
    reopen: async () => { reopenCalls++; return { ready: true, reason: 'list_screen' }; },
    loadMaxMs: 60_000,
  });
  assertEq(r.ready, true, '7a: הדף נטען אחרי המתנה');
  assertEq(reopenCalls, 0, '7b: אין פתיחה מחדש');
}

{
  // 8. עדיין יורד אחרי ההמתנה המלאה ⇒ still_loading, ואף רענון.
  const page = loadingPage(Number.POSITIVE_INFINITY);
  let reopenCalls = 0;
  const r = await ensureWithBoundedRecovery(page, {
    initial: { ready: false, reason: 'unknown_screen' },
    readCurrent: async () => ({ ready: false, reason: 'unknown_screen' }),
    reopen: async () => { reopenCalls++; return { ready: false, reason: 'unknown_screen' }; },
    loadMaxMs: 40,
  });
  assertEq(r.reason, 'still_loading', '8a: מדווח «עדיין נטען», לא «מוצה»');
  assertEq(page.calls.reload, 0, '8b: לא רוענן דף שעוד יורד — רענון מתחיל את ההורדה מאפס');
  assertEq(reopenCalls, 0, '8c: לא נפתח מחדש');
}

{
  // 9. הפתיחה עצמה כבר דיווחה still_loading ⇒ מחזירים אותו כמו שהוא.
  const page = loadingPage(0);
  const r = await ensureWithBoundedRecovery(page, {
    initial: { ready: false, reason: 'still_loading' },
    readCurrent: async () => ({ ready: true, reason: 'list_screen' }),
    reopen: async () => ({ ready: true, reason: 'list_screen' }),
  });
  assertEq(r.reason, 'still_loading', '9a: still_loading מהפתיחה לא הופך לרענון');
  assertEq(page.calls.reload, 0, '9b: אין רענון');
}

{
  // 10. waitWhileLoading: מחכה עד שהמסמך נטען, ומדווח.
  const { waitWhileLoading } = await import('../src/browserSession.mjs');
  const done = await waitWhileLoading(loadingPage(2), { maxMs: 60_000, stepMs: 1 });
  assertEq(done.stillLoading, false, '10a: נטען');
  assertEq(done.readyState, 'complete', '10b: readyState=complete');
  const stuck = await waitWhileLoading(loadingPage(Number.POSITIVE_INFINITY), { maxMs: 30, stepMs: 1 });
  assertEq(stuck.stillLoading, true, '10c: עדיין בטעינה אחרי maxMs');
}

console.log(`\n${failures === 0 ? '✓ עבר' : `✗ נכשל (${failures})`}: ensureWithBoundedRecovery — bounded, no storms, positive-evidence, work-screen-safe.`);
process.exit(failures === 0 ? 0 : 1);
