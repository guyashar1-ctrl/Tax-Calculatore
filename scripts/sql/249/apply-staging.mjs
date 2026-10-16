// מחיל את 249 מהקובץ עצמו (בלי העתקה ידנית) ומאמת שני חלקים:
//   (א) publish_case_changes — לפני: הגוף החי זהה ל-216 (או כבר 249); אחרי: זהה לקובץ, SECURITY DEFINER, authenticated כן, anon לא.
//   (ב) _tax_year_items — לפני: הרשימה החיה = של 241, או גרסה קודמת של 249 (תת-קבוצה של הקובץ, בלי שינוי סוג); אחרי: זהה לקובץ, anon/authenticated לא.
//   (ג) _tax_fact_field_op — ענפי שנות המצב המשפחתי (249ג); שלוש העמודות ב-_governed_client_columns ⇒ הדפדפן חייב אותן ב-GOVERNED_FACT_KEYS. בחזרה — אין.
// --rollback מחזיר את שלושתם (rollback-249.sql: הגוף של 216, הרשימה של 241, בלי הענפים).
//   STAGING_ENV_DIR=<תיקייה עם .env.local שבו SUPABASE_ACCESS_TOKEN> node scripts/sql/249/apply-staging.mjs [--verify-only] [--rollback]
// ‼ staging בלבד. ייצור רק עם --target=prod --approved (אחרי אישור גיא).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const PROD_REQ = process.argv.includes('--target=prod');
if (PROD_REQ && !process.argv.includes('--approved')) throw new Error('ייצור דורש --approved');
const REF = PROD_REQ ? 'uoweoqtuiettozagwgdw' : 'evdfxjqrkgugssfrdoxd';
const ROLLBACK = process.argv.includes('--rollback');
console.log('יעד:', PROD_REQ ? 'ייצור' : 'staging', REF, ROLLBACK ? '(חזרה ל-216/241)' : '');
const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(readFileSync(join(process.env.STAGING_ENV_DIR, '.env.local'), 'utf8').split(/\r?\n/)
  .map(l => l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  const t = await r.text(); if (!r.ok) throw new Error(`sql ${r.status}: ${t.slice(0, 300)}`); return t ? JSON.parse(t) : [];
};
const read = (p) => readFileSync(join(here, p), 'utf8').replace(/\r\n/g, '\n');
const f249 = read('../../../supabase/249-publish-page-publishes-tax-questions.sql');
const fRb = read('rollback-249.sql');
const pccBody = (file) => { const at = file.indexOf('function public.publish_case_changes('); const s = file.indexOf('$function$', at) + '$function$'.length; const e = file.indexOf('$function$', s); return file.slice(s, e).trim(); };
const itemsOf = (file) => { const at = file.indexOf('function public._tax_year_items()'); const a = file.indexOf("select '", at) + "select '".length; const b = file.indexOf("'::jsonb", a); return JSON.parse(file.slice(a, b).replace(/''/g, "'")); };
const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
const live = async () => {
  const [p] = await sql(`select p.prosrc, p.prosecdef, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') auth
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'publish_case_changes'`);
  const [i] = await sql(`select public._tax_year_items() items, has_function_privilege('anon', 'public._tax_year_items()', 'execute') anon, has_function_privilege('authenticated', 'public._tax_year_items()', 'execute') auth`);
  const [f] = await sql(`select position('249 · שנות המצב המשפחתי' in pg_get_functiondef(p.oid)) > 0 has249c,
      has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') auth,
      (select count(*)::int from unnest(public._governed_client_columns()) g where g in ('marriage_year', 'divorce_year', 'widowhood_year')) gov_years
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '_tax_fact_field_op'`);
  return { p, i, f };
};

const B216 = pccBody(fRb), B249 = pccBody(f249), I241 = itemsOf(fRb), I249 = itemsOf(f249);
const before = await live();
const pNow = before.p.prosrc.trim() === B249 ? '249' : before.p.prosrc.trim() === B216 ? '216' : 'אחר';
// גרסה קודמת של 249 (16.10, לפני שנות המצב המשפחתי): כל הפריטים החיים בקובץ, עם אותו סוג, וכל פריטי 241 בהם
const older249 = (live) => Object.entries(live).every(([k, v]) => I249[k] === v) && Object.keys(I241).every(k => k in live);
const iNow = same(before.i.items, I249) ? '249' : same(before.i.items, I241) ? '241' : older249(before.i.items) ? '249-קודמת' : 'אחר';
console.log(`  · לפני: publish_case_changes = ${pNow} · _tax_year_items = ${iNow} (${Object.keys(before.i.items).length} פריטים) · שנות המצב המשפחתי מנוהלות: ${before.f.gov_years}`);
if (!process.argv.includes('--verify-only')) {
  if (pNow === 'אחר' || iNow === 'אחר') { console.log('  ✗ גוף או רשימה שאינם 216/249 או 241/249 — לא מחילים (סחיפה; לבדוק ידנית)'); process.exit(1); }
  const done = ROLLBACK ? (pNow === '216' && iNow === '241' && !before.f.has249c) : (pNow === '249' && iNow === '249' && before.f.has249c);
  if (done) console.log('  · כבר במצב היעד — אין מה לעשות');
  else { await sql(ROLLBACK ? fRb : f249); console.log('  הוחל'); }
}
const after = await live();
const pOk = after.p.prosrc.trim() === (ROLLBACK ? B216 : B249) && after.p.prosecdef && after.p.auth && !after.p.anon;
const iOk = same(after.i.items, ROLLBACK ? I241 : I249) && !after.i.anon && !after.i.auth;
console.log(`  ${pOk ? '✓' : '✗'} publish_case_changes · ${ROLLBACK ? '216' : '249'} · SECURITY DEFINER ${after.p.prosecdef ? 'כן' : 'לא!'} · authenticated ${after.p.auth ? 'כן' : 'לא!'} · anon ${after.p.anon ? 'כן!' : 'לא'}`);
console.log(`  ${iOk ? '✓' : '✗'} _tax_year_items · ${Object.keys(after.i.items).length} פריטים (${ROLLBACK ? '241' : '249, כולל דמי לידה ושנות המצב המשפחתי'}) · anon ${after.i.anon ? 'כן!' : 'לא'} · authenticated ${after.i.auth ? 'כן!' : 'לא'}`);
const fOk = ROLLBACK ? (!after.f.has249c && after.f.gov_years === 0) : (after.f.has249c && after.f.gov_years === 3 && !after.f.anon && !after.f.auth);
console.log(`  ${fOk ? '✓' : '✗'} _tax_fact_field_op · ענפי שנות המצב המשפחתי ${after.f.has249c ? 'קיימים' : 'אינם'} · מנוהלות: ${after.f.gov_years}/3 · anon ${after.f.anon ? 'כן!' : 'לא'} · authenticated ${after.f.auth ? 'כן!' : 'לא'}`);
process.exit(pOk && iOk && fOk ? 0 : 1);
