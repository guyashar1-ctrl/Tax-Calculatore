// מחיל את 242 על staging בלבד, מהקובץ עצמו (בלי העתקה ידנית), ומאמת: חמש פונקציות, גוף זהה לקובץ, והרשאות.
//   STAGING_ENV_DIR=<תיקייה עם .env.local שבו SUPABASE_ACCESS_TOKEN> node scripts/sql/242/apply-staging.mjs [--verify-only]
// ‼ פרויקט staging קבוע בקוד; אין דרך להפנות את הסקריפט לייצור.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const STAGING = 'evdfxjqrkgugssfrdoxd';
const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(readFileSync(join(process.env.STAGING_ENV_DIR, '.env.local'), 'utf8').split(/\r?\n/)
  .map(l => l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${STAGING}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  const t = await r.text(); if (!r.ok) throw new Error(`sql ${r.status}: ${t.slice(0, 300)}`); return t ? JSON.parse(t) : [];
};
const file = readFileSync(join(here, '../../../supabase/242-tax-work-removal.sql'), 'utf8').replace(/\r\n/g, '\n');
if (!process.argv.includes('--verify-only')) { await sql(file); console.log('הוחל על staging'); }
const fns = ['_tax_work_removal_facts', '_tax_work_removal_mode', 'tax_work_removal_check', 'remove_tax_work', 'restore_tax_work'];
const rows = await sql(`select p.proname, p.prosrc, p.prosecdef, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') auth
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any(array[${fns.map(f => `'${f}'`).join(',')}])`);
let bad = 0;
for (const f of fns) {
  const r = rows.find(x => x.proname === f);
  if (!r) { console.log(`  ✗ ${f} חסרה`); bad++; continue; }
  // גוף הפונקציה בקובץ: בין $$ ל-$$ אחרי השם
  const at = file.indexOf(`function public.${f}(`); const s = file.indexOf('$$', at) + 2; const e = file.indexOf('$$', s);
  const same = r.prosrc.trim() === file.slice(s, e).trim();
  const internal = f.startsWith('_');
  const permsOk = !r.anon && (internal ? !r.auth : r.auth);
  console.log(`  ${same && permsOk ? '✓' : '✗'} ${f} · גוף ${same ? 'זהה לקובץ' : 'שונה!'} · anon ${r.anon ? 'כן!' : 'לא'} · authenticated ${r.auth ? 'כן' : 'לא'}`);
  if (!same || !permsOk) bad++;
}
console.log(bad ? `${bad} בעיות` : 'כל חמש הפונקציות: זהות לקובץ, הרשאות תקינות');
process.exit(bad ? 1 : 0);
