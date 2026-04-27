import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const env = {};
for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const token = env.SUPABASE_ACCESS_TOKEN;
const projectRef = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];

async function runQuery(query) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    }
  );
  const text = await r.text();
  if (!r.ok) {
    console.error(`Query failed (HTTP ${r.status}):`, text);
    return null;
  }
  return JSON.parse(text);
}

console.log('=== Tables in public schema ===');
const tables = await runQuery(`
  select table_name
  from information_schema.tables
  where table_schema = 'public'
  order by table_name
`);
for (const t of tables) console.log(`  - ${t.table_name}`);

console.log('\n=== RLS enabled? ===');
const rls = await runQuery(`
  select tablename, rowsecurity
  from pg_tables
  where schemaname = 'public'
  order by tablename
`);
for (const t of rls) console.log(`  - ${t.tablename}: ${t.rowsecurity ? 'YES' : 'NO'}`);

console.log('\n=== Policy count per table ===');
const policies = await runQuery(`
  select tablename, count(*) as policy_count
  from pg_policies
  where schemaname = 'public'
  group by tablename
  order by tablename
`);
for (const p of policies) console.log(`  - ${p.tablename}: ${p.policy_count} policies`);

console.log('\n=== Storage buckets ===');
const buckets = await runQuery(`select id, name, public from storage.buckets order by id`);
for (const b of buckets) console.log(`  - ${b.id} (public: ${b.public})`);

console.log('\n=== Storage policies ===');
const storagePolicies = await runQuery(`
  select policyname
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
  order by policyname
`);
console.log(`  ${storagePolicies.length} policies on storage.objects`);
for (const p of storagePolicies) console.log(`  - ${p.policyname}`);

console.log('\n=== Column count for clients table ===');
const cols = await runQuery(`
  select count(*) as cnt
  from information_schema.columns
  where table_schema = 'public' and table_name = 'clients'
`);
console.log(`  clients has ${cols[0].cnt} columns`);

console.log('\n=== Triggers ===');
const triggers = await runQuery(`
  select event_object_table as tbl, trigger_name
  from information_schema.triggers
  where trigger_schema = 'public'
  order by tbl, trigger_name
`);
for (const t of triggers) console.log(`  - ${t.tbl}: ${t.trigger_name}`);

console.log('\n✅ Verification complete.');
