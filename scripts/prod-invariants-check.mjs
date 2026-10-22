#!/usr/bin/env node
/**
 * prod-invariants-check.mjs — בדיקה שקטה של כללים חוצי-מסכים בנתונים החיים (קריאה בלבד).
 *
 * ‼ למה (21.10.2026, ליאת ואוריה): שינוי בקוד (269) שבר כלל שחי בקובץ אחר (218: מי חותם/ת
 *   ב«בן זוג רשום»), והטעות נראתה רק בעין, בטופס של לקוחה אמיתית. כל בדיקה = כלל מ-docs/INVARIANTS.md.
 * ‼ הבדיקות עצמן חיות במקום אחד — public.pivo_invariant_violations() (282), שגם רצה כל יום
 *   (run_invariant_check, pg_cron). כאן רק קוראים לה (קריאה בלבד), ובנוסף INV-SEC-01.
 *
 *   שימוש:  node scripts/prod-invariants-check.mjs            (ייצור)
 *           node scripts/prod-invariants-check.mjs --staging  (סביבת הבדיקות)
 *   יציאה 1 = נמצאה הפרה (או שהבדיקה עצמה נכשלה). רץ גם בבדיקה שלפני push (pre-push-check).
 */
import { readProd, sql, STAGING_REF, PROD_REF } from './staging-lib.mjs';

const staging = process.argv.includes('--staging');
const q = (query) => (staging ? sql(STAGING_REF, query) : readProd(query));

const DATA_CHECKS = ['INV-REP-02', 'INV-REP-03', 'INV-AUTO-01', 'INV-AUTO-02'];

let failed = 0;
const line = (ok, id, text) => console.log(`  ${ok ? '✓' : '✗'} ${id}${text ? ` · ${text}` : ''}`);
console.log(`בדיקת כללים חיים · ${staging ? `staging (${STAGING_REF})` : `ייצור (${PROD_REF})`} · קריאה בלבד\n`);

try {
  const rows = await q('select public.pivo_invariant_violations() as v');
  const v = rows?.[0]?.v ?? [];
  const byId = new Map(v.map(x => [x.id, x]));
  for (const id of DATA_CHECKS) {
    const x = byId.get(id);
    if (!x) { line(true, id); continue; }
    failed++;
    line(false, id, `${x.title} — ${x.rows.length} מקרים:`);
    for (const r of x.rows.slice(0, 10)) console.log(`      ${JSON.stringify(r)}`);
  }
  for (const x of v) if (!DATA_CHECKS.includes(x.id)) { failed++; line(false, x.id, x.title); }
} catch (e) {
  failed++;
  console.log(`  ✗ pivo_invariant_violations — הבדיקה עצמה נכשלה: ${String(e.message).slice(0, 200)}`);
}

// INV-SEC-01 · אין פונקציה חדשה פתוחה ל-anon מחוץ לרשימה
try {
  await q('select public.assert_domain_function_invariants()');
  line(true, 'INV-SEC-01');
} catch (e) {
  // ‼ מ-284 הבדיקה ירוקה בייצור — כל פונקציה פתוחה ל-anon שלא ברשימת ההיתר היא הפרה.
  const m = /מחוץ לרשימה: ([^"\\\n]+)/.exec(String(e.message));
  {
    failed++;
    line(false, 'INV-SEC-01', m ? `פתוחות ל-anon: ${m[1].trim()}` : String(e.message).slice(0, 200));
    // ‼ אם הפתיחה מכוונת (למשל דף לקוח ציבורי שקורא רשימה) — מוסיפים לרשימת ההיתר של
    //   assert_domain_function_invariants במיגרציה, עם סיבה במשפט. לא מוחקים את הבדיקה ולא מוסיפים כאן.
    console.log('      אם זה מכוון — להוסיף לרשימת ההיתר של assert_domain_function_invariants במיגרציה, עם סיבה.');
  }
}

console.log(failed ? `\n${failed} כללים מופרים — לבדוק לפני שממשיכים.` : '\nהכול תקין.');
process.exitCode = failed ? 1 : 0;
