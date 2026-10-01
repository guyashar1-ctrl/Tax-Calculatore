#!/usr/bin/env node
/**
 * prod-dryrun-6101-migrations.mjs — חזרה גנרלית של 206 → 207 → 209 על הפרודקשן, שמתגלגלת לאחור.
 *
 *   node scripts/prod-dryrun-6101-migrations.mjs [--staging] [--files a.sql,b.sql]
 *
 * ‼ שלושת הקבצים, כמו שהם, נשלחים בבקשה אחת שמסתיימת ב-raise 'DRY_RUN_OK' — כל הבקשה רצה
 *   בטרנזקציה מרומזת אחת, והשגיאה בסופה מבטלת הכול (DDL ב-Postgres הוא טרנזקציוני). כך רואים
 *   שהקבצים עוברים על הסכימה האמיתית — כולל assert_domain_function_invariants בסוף כל קובץ —
 *   בלי לשנות כלום. לפני השליחה: וידוא שאין בקבצים פקודות טרנזקציה או פעולות שלא רצות בטרנזקציה.
 */
import { readFileSync } from 'node:fs';
import { PROD_REF, STAGING_REF, loadEnv } from './staging-lib.mjs';

const REF = process.argv.includes('--staging') ? STAGING_REF : PROD_REF;
const fi = process.argv.indexOf('--files');
const FILES = fi > 0 ? process.argv[fi + 1].split(',')
  : ['supabase/206-smart-form-filings.sql', 'supabase/207-btl-portal-records.sql', 'supabase/209-smart-form-mapping-v2.sql'];
const TOKEN = loadEnv('.env.local').SUPABASE_ACCESS_TOKEN;

const bodies = FILES.map(f => readFileSync(f, 'utf8'));
for (const [i, s] of bodies.entries()) {
  const top = s.replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/g, '');
  const bad = top.match(/^\s*(begin|commit|rollback|start transaction|vacuum|create index concurrently|alter type\s.*\sadd value)\b[^\n]*/gim) ?? [];
  if (bad.length) { console.error(`✋ ${FILES[i]}: ${bad.join(' | ')} — לא ניתן לחזרה בטרנזקציה`); process.exit(1); }
}
const query = bodies.join('\n;\n') + `\n;\ndo $dry$ begin raise exception 'DRY_RUN_OK'; end $dry$;`;
const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});
const body = await r.text();
const ok = body.includes('DRY_RUN_OK');
console.log(`${REF === PROD_REF ? 'פרודקשן' : 'staging'} (${REF}) · ${FILES.length} קבצים · ${query.length} תווים`);
console.log(ok ? `✓ ${FILES.length} המיגרציות עברו על הסכימה האמיתית, והכול בוטל (DRY_RUN_OK)` : `✗ ${r.status} ${body.slice(0, 800)}`);
const check = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `select to_regclass('public.smart_form_filings') is not null as filings, to_regclass('public.btl_portal_facts') is not null as facts,
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='clients' and column_name='zip_code') as zip,
    to_regclass('public.smart_form_mappings') is not null as mappings` }),
}).then(x => x.json());
console.log('אחרי החזרה — קיים במסד?', JSON.stringify(check?.[0]));
process.exit(ok ? 0 : 1);
