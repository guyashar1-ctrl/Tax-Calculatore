// מחיל את 280 («הדוחות שלך» בדף האישי) מהקובץ עצמו ומאמת.
//   לפני: התלויות קיימות (250 · 229 _portal_client/_tax_year_client · 214 client_step_gate_open) ועוגן הרשימה נמצא פעם אחת.
//   אחרי: שלוש הפונקציות — גוף זהה לקובץ, SECURITY DEFINER; הרשאות: portal_filings ⇒ anon+authenticated,
//         portal_filings_preview ⇒ authenticated בלבד, _portal_filings ⇒ אף אחד; 'portal_filings' ברשימת v_anon_ok פעם אחת;
//         טוקן שגוי ⇒ {ok:false, error:'invalid'} (קריאה כ-anon אמיתי).
//   node scripts/sql/280/apply.mjs [--verify-only] [--rollback]
//   STAGING_ENV_DIR=<תיקייה עם .env.local> — אם ה-.env.local אינו בשורש העותק הזה.
// ‼ staging כברירת מחדל. ייצור רק עם --target=prod --approved (אחרי אישור גיא) ואחרי גיבוי (prod-backup-before-migration.mjs).
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROD_REQ = process.argv.includes('--target=prod');
if (PROD_REQ && !process.argv.includes('--approved')) throw new Error('ייצור דורש --approved');
const REF = PROD_REQ ? 'uoweoqtuiettozagwgdw' : 'evdfxjqrkgugssfrdoxd';
const ROLLBACK = process.argv.includes('--rollback');
const VERIFY_ONLY = process.argv.includes('--verify-only');
console.log('יעד:', PROD_REQ ? 'ייצור' : 'staging', REF, ROLLBACK ? '(החזרה)' : VERIFY_ONLY ? '(אימות בלבד)' : '');

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const envDir = process.env.STAGING_ENV_DIR || root;
const envFile = join(envDir, '.env.local');
if (!existsSync(envFile)) throw new Error(`חסר ${envFile} (SUPABASE_ACCESS_TOKEN)`);
const env = Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/)
  .map(l => l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  const t = await r.text(); if (!r.ok) throw new Error(`sql ${r.status}: ${t.slice(0, 400)}`); return t ? JSON.parse(t) : [];
};
const read = (p) => readFileSync(join(here, p), 'utf8').replace(/\r\n/g, '\n');
const file = read('../../../supabase/280-portal-filings.sql');
const FNS = ['_portal_filings', 'portal_filings', 'portal_filings_preview'];
const bodyOf = (name) => { const at = file.indexOf(`function public.${name}(`); const s = file.indexOf('$$', at) + 2; const e = file.indexOf('$$', s); return file.slice(s, e).trim(); };

const [dep] = await sql(`select
    to_regclass('public.shaam_filing_obligations') is not null obligations,
    to_regprocedure('public._portal_client(text)') is not null portal_client,
    to_regprocedure('public._tax_year_client(text)') is not null tax_year_client,
    to_regprocedure('public.client_step_gate_open(text, timestamptz)') is not null gate,
    (select pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'assert_domain_function_invariants') inv`);
const anchors = (s, a) => (s.length - s.replaceAll(a, '').length) / a.length;
const inv = (dep.inv ?? '').replace(/\r\n/g, '\n');
const applied = inv.includes(`'portal_filings'`);
console.log(`  · תלויות: חובות 250 ${dep.obligations ? '✓' : '✗'} · _portal_client ${dep.portal_client ? '✓' : '✗'} · _tax_year_client ${dep.tax_year_client ? '✓' : '✗'} · client_step_gate_open ${dep.gate ? '✓' : '✗'}`);
console.log(`  · רשימת anon: ${applied ? "כבר כוללת 'portal_filings'" : `עוגן «];begin» נמצא ${anchors(inv, '\n  ];\nbegin')} פעמים`}`);
if (!dep.obligations || !dep.portal_client || !dep.tax_year_client || !dep.gate) { console.log('  ✗ תלות חסרה — לא מחילים'); process.exit(1); }
if (!ROLLBACK && !applied && anchors(inv, '\n  ];\nbegin') !== 1) { console.log('  ✗ העוגן אינו יחיד — לא מחילים'); process.exit(1); }

if (!VERIFY_ONLY) {
  await sql(ROLLBACK ? read('rollback-280.sql') : file);
  console.log(ROLLBACK ? '  הוחזר' : '  הוחל');
}

const rows = await sql(`select p.proname, p.prosrc, p.prosecdef, has_function_privilege('anon', p.oid, 'execute') anon,
    has_function_privilege('authenticated', p.oid, 'execute') auth
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any(array[${FNS.map(f => `'${f}'`).join(',')}])`);
const [after] = await sql(`select (select pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'assert_domain_function_invariants') inv`);
const inv2 = (after.inv ?? '').replace(/\r\n/g, '\n');
let bad = 0;
if (ROLLBACK) {
  const gone = rows.length === 0; const listOk = !inv2.includes(`'portal_filings'`);
  console.log(`  ${gone ? '✓' : '✗'} שלוש הפונקציות הוסרו · ${listOk ? '✓' : '✗'} 'portal_filings' לא ברשימת anon`);
  process.exit(gone && listOk ? 0 : 1);
}
const PERMS = { _portal_filings: { anon: false, auth: false }, portal_filings: { anon: true, auth: true }, portal_filings_preview: { anon: false, auth: true } };
for (const f of FNS) {
  const r = rows.find(x => x.proname === f);
  if (!r) { console.log(`  ✗ ${f} חסרה`); bad++; continue; }
  const same = r.prosrc.replace(/\r\n/g, '\n').trim() === bodyOf(f);
  const permsOk = r.anon === PERMS[f].anon && r.auth === PERMS[f].auth && r.prosecdef;
  console.log(`  ${same && permsOk ? '✓' : '✗'} ${f} · גוף ${same ? 'זהה לקובץ' : 'שונה!'} · SECURITY DEFINER ${r.prosecdef ? 'כן' : 'לא!'} · anon ${r.anon ? 'כן' : 'לא'} · authenticated ${r.auth ? 'כן' : 'לא'}`);
  if (!same || !permsOk) bad++;
}
const once = (inv2.match(/'portal_filings'/g) ?? []).length === 1;
console.log(`  ${once ? '✓' : '✗'} 'portal_filings' ברשימת v_anon_ok פעם אחת`);
if (!once) bad++;
const [probe] = await sql(`set role anon; select public.portal_filings('not-a-real-token-280') r;`);
const probeOk = probe?.r?.ok === false && probe?.r?.error === 'invalid' && !probe?.r?.years;
console.log(`  ${probeOk ? '✓' : '✗'} anon עם טוקן שגוי ⇒ ${JSON.stringify(probe?.r)}`);
if (!probeOk) bad++;
console.log(bad ? `${bad} בעיות` : 'הכול תקין');
process.exit(bad ? 1 : 0);
