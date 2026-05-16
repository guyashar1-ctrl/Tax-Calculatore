// Verify that the new annual_report_* tables exist with the right RLS.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const localEnv = resolve(root, '.env.local');
const fallback = resolve(root, '..', '..', '..', '.env.local');
const envFile = existsSync(localEnv) ? localEnv : fallback;

function loadEnv(file) {
  const env = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}
const env = loadEnv(envFile);
const token = env.SUPABASE_ACCESS_TOKEN;
const supabaseUrl = env.VITE_SUPABASE_URL;
const projectRef = new URL(supabaseUrl).hostname.split('.')[0];

const sql = `
  select c.relname as table_name, c.relrowsecurity as rls_enabled,
    (select count(*) from pg_policies p where p.tablename = c.relname) as num_policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname like 'annual_report%'
  order by c.relname;
`;
const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
console.log(`HTTP ${res.status}`);
console.log(await res.text());
