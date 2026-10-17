// מחיל את 253 מהקובץ עצמו ומאמת: הסימון «253 ·» פעם אחת ב-add_tax_info_asks וב-portal_submit_tax_info,
//   _tax_year_items = הקובץ, _tax_institutions קיימת ולא ל-anon/authenticated. --rollback מחיל את rollback-253.sql.
//   STAGING_ENV_DIR=<תיקייה עם .env.local שבו SUPABASE_ACCESS_TOKEN> node scripts/sql/253/apply-staging.mjs [--verify-only] [--rollback]
// ‼ staging בלבד. ייצור רק עם --target=prod --approved (אחרי אישור גיא). לפני ייצור: לוודא ש-241 חיה שם (הסימון «241 · רשומה»).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const PROD_REQ = process.argv.includes('--target=prod');
if (PROD_REQ && !process.argv.includes('--approved')) throw new Error('ייצור דורש --approved');
const REF = PROD_REQ ? 'uoweoqtuiettozagwgdw' : 'evdfxjqrkgugssfrdoxd';
const ROLLBACK = process.argv.includes('--rollback');
console.log('יעד:', PROD_REQ ? 'ייצור' : 'staging', REF, ROLLBACK ? '(חזרה)' : '');
const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(readFileSync(join(process.env.STAGING_ENV_DIR, '.env.local'), 'utf8').split(/\r?\n/)
  .map(l => l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  const t = await r.text(); if (!r.ok) throw new Error(`sql ${r.status}: ${t.slice(0, 300)}`); return t ? JSON.parse(t) : [];
};
const read = (p) => readFileSync(join(here, p), 'utf8').replace(/\r\n/g, '\n');
const f253 = read('../../../supabase/253-intake-closed-lists.sql');
const itemsOf = (file) => { const at = file.indexOf('function public._tax_year_items()'); const a = file.indexOf("select '", at) + "select '".length; const b = file.indexOf("'::jsonb", a); return JSON.parse(file.slice(a, b).replace(/''/g, "'")); };
const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
const live = async () => (await sql(`select
    (select count(*)::int from pg_proc where proname = 'add_tax_info_asks' and prosrc like '%253 · רשת ושל מי%') a253,
    (select count(*)::int from pg_proc where proname = 'portal_submit_tax_info' and prosrc like '%253 · מסך הרשת%') p253,
    (select count(*)::int from pg_proc where proname = 'portal_submit_tax_info' and prosrc like '%241 · רשומה%') p241,
    (select (length(prosrc) - length(replace(prosrc, '253 · מסך הרשת', ''))) / length('253 · מסך הרשת') from pg_proc where proname = 'portal_submit_tax_info') p253n,
    public._tax_year_items() items,
    to_regprocedure('public._tax_institutions()') is not null inst,
    case when to_regprocedure('public._tax_institutions()') is not null then has_function_privilege('anon', 'public._tax_institutions()', 'execute') else false end inst_anon,
    case when to_regprocedure('public._tax_institutions()') is not null then has_function_privilege('authenticated', 'public._tax_institutions()', 'execute') else false end inst_auth,
    has_function_privilege('anon', 'public._tax_year_items()', 'execute') items_anon`))[0];
const I253 = itemsOf(f253);
const before = await live();
console.log(`  · לפני: 253 ב-add=${before.a253} ב-submit=${before.p253} (×${before.p253n}) · 241=${before.p241} · פריטים=${Object.keys(before.items).length}${same(before.items, I253) ? ' (=253)' : ''} · _tax_institutions=${before.inst}`);
if (!before.p241) { console.log('  ✗ 241 לא חיה כאן — לא מחילים'); process.exit(1); }
if (!process.argv.includes('--verify-only')) {
  const done = ROLLBACK ? (!before.a253 && !before.p253 && !before.inst) : (before.a253 && before.p253 && before.inst && same(before.items, I253));
  if (done) console.log('  · כבר במצב היעד — אין מה לעשות');
  else { await sql(ROLLBACK ? read('rollback-253.sql') : f253); console.log('  הוחל'); }
}
const after = await live();
const good = ROLLBACK ? (!after.a253 && !after.p253 && !after.inst && !('intake.whatYouHave' in after.items))
  : (after.a253 === 1 && after.p253 === 1 && after.p253n === 1 && after.inst && !after.inst_anon && !after.inst_auth && same(after.items, I253) && !after.items_anon);
console.log(`  ${good ? '✓' : '✗'} אחרי: 253 ב-add=${after.a253} ב-submit=${after.p253} (×${after.p253n}) · פריטים=${Object.keys(after.items).length}${same(after.items, I253) ? ' (=253)' : ''} · _tax_institutions=${after.inst} anon=${after.inst_anon} auth=${after.inst_auth}`);
process.exit(good ? 0 : 1);
