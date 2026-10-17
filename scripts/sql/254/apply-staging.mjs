// מחיל את 254 מהקובץ עצמו (בלי העתקה ידנית) ומאמת:
//   לפני: ensure_tax_file_intake(text) של 236 קיימת ועם ההזרקה של 236 ב-add_tax_info_asks; ה-overload (text, jsonb) — לא קיים או זהה לקובץ.
//   אחרי: ensure_tax_file_intake(text, jsonb) קיימת, SECURITY DEFINER, authenticated כן, anon לא; הגוף זהה לקובץ; ה-(text) של 236 לא השתנתה.
// --rollback מסיר את ה-overload (rollback-254.sql). --verify-only רק בודק.
//   STAGING_ENV_DIR=<תיקייה עם .env.local שבו SUPABASE_ACCESS_TOKEN> node scripts/sql/254/apply-staging.mjs [--verify-only] [--rollback]
// ‼ staging בלבד. ייצור רק עם --target=prod --approved (אחרי אישור גיא), ואחרי גיבוי (prod-backup-before-migration.mjs).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const PROD_REQ = process.argv.includes('--target=prod');
if (PROD_REQ && !process.argv.includes('--approved')) throw new Error('ייצור דורש --approved');
const REF = PROD_REQ ? 'uoweoqtuiettozagwgdw' : 'evdfxjqrkgugssfrdoxd';
const ROLLBACK = process.argv.includes('--rollback');
console.log('יעד:', PROD_REQ ? 'ייצור' : 'staging', REF, ROLLBACK ? '(חזרה — בלי ה-overload)' : '');
const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(readFileSync(join(process.env.STAGING_ENV_DIR, '.env.local'), 'utf8').split(/\r?\n/)
  .map(l => l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  const t = await r.text(); if (!r.ok) throw new Error(`sql ${r.status}: ${t.slice(0, 300)}`); return t ? JSON.parse(t) : [];
};
const read = (p) => readFileSync(join(here, p), 'utf8').replace(/\r\n/g, '\n');
const f254 = read('../../../supabase/254-intake-publishes-itself.sql');
const fRb = read('rollback-254.sql');
const bodyOf = (file) => { const at = file.indexOf('function public.ensure_tax_file_intake(p_client_id text, p_asks jsonb)'); const s = file.indexOf('as $$', at) + 'as $$'.length; const e = file.indexOf('$$;', s); return file.slice(s, e).trim(); };
const B254 = bodyOf(f254);
const live = async () => {
  const [one] = await sql(`select to_regprocedure('public.ensure_tax_file_intake(text)') is not null has1,
      position('236 · קליטה' in pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure)) > 0 inj236,
      md5(pg_get_functiondef('public.ensure_tax_file_intake(text)'::regprocedure)) md1`);
  const two = await sql(`select p.prosrc, p.prosecdef, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') auth,
      has_function_privilege('authenticated', 'public.publish_tax_info(text)', 'execute') pub_auth
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'ensure_tax_file_intake' and pg_get_function_identity_arguments(p.oid) = 'p_client_id text, p_asks jsonb'`);
  return { ...one, two: two[0] ?? null };
};
const before = await live();
if (!before.has1 || !before.inj236) { console.log('  ✗ 236 לא הוחלה כאן (ensure_tax_file_intake(text) / ההזרקה ב-add_tax_info_asks) — לא מחילים'); process.exit(1); }
const state = (l) => !l.two ? 'אין' : l.two.prosrc.trim() === B254 ? '254' : 'אחר';
console.log(`  · לפני: ensure_tax_file_intake(text) של 236 קיימת · overload (text, jsonb) = ${state(before)}`);
if (!process.argv.includes('--verify-only')) {
  if (state(before) === 'אחר') { console.log('  ✗ ה-overload קיים עם גוף שאינו 254 — לא מחילים (סחיפה; לבדוק ידנית)'); process.exit(1); }
  const done = ROLLBACK ? state(before) === 'אין' : state(before) === '254';
  if (done) console.log('  · כבר במצב היעד — אין מה לעשות');
  else { await sql(ROLLBACK ? fRb : f254); console.log('  הוחל'); }
}
const after = await live();
const ok1 = after.md1 === before.md1 && after.has1;
console.log(`  ${ok1 ? '✓' : '✗'} ensure_tax_file_intake(text) של 236 — לא השתנתה`);
let okAll = ok1;
if (ROLLBACK) {
  const ok2 = !after.two; okAll &&= ok2;
  console.log(`  ${ok2 ? '✓' : '✗'} ה-overload (text, jsonb) הוסר`);
} else {
  const t = after.two;
  const ok2 = !!t && t.prosrc.trim() === B254 && t.prosecdef && t.auth && !t.anon; okAll &&= ok2;
  console.log(`  ${ok2 ? '✓' : '✗'} ensure_tax_file_intake(text, jsonb) · גוף = קובץ ${t && t.prosrc.trim() === B254 ? 'כן' : 'לא!'} · SECURITY DEFINER ${t?.prosecdef ? 'כן' : 'לא!'} · authenticated ${t?.auth ? 'כן' : 'לא!'} · anon ${t?.anon ? 'כן!' : 'לא'}`);
}
process.exit(okAll ? 0 : 1);
