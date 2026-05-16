// Migrate Guy's existing client row:
//   - Move investment_broker_name → investment_accounts[0]
//   - Move pension_fund_name → pension_funds[0] (kind = new_pension)
//   - Salary_employer_count from old annual report sessions → employers list?
//     (only if obvious — skip if ambiguous)
//
// Idempotent: safe to re-run.
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

async function runSql(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status}: ${t}`);
  }
  return res.json();
}

// 1. Dump existing rows so we know what we're migrating
console.log('=== Current client rows ===');
const before = await runSql(`
  select id, first_name, last_name,
    investment_broker_name, has_investments, investment_notes,
    pension_fund_name, has_pension, employee_pension_pct, employer_pension_pct,
    has_kupot_gemel, has_kren_hashtalmut, kren_hashtalmut_monthly,
    jsonb_array_length(coalesce(investment_accounts, '[]'::jsonb)) as inv_count,
    jsonb_array_length(coalesce(bank_accounts,       '[]'::jsonb)) as bank_count,
    jsonb_array_length(coalesce(employers,           '[]'::jsonb)) as emp_count,
    jsonb_array_length(coalesce(pension_funds,       '[]'::jsonb)) as pen_count
  from public.clients
  order by created_at;
`);
console.log(JSON.stringify(before, null, 2));

// 2. Migrate investment_broker_name → investment_accounts (only if empty)
console.log('\n=== Migrating investment_broker_name → investment_accounts ===');
const invResult = await runSql(`
  update public.clients
  set investment_accounts = jsonb_build_array(
    jsonb_build_object(
      'id',              concat('inv-migrated-', gen_random_uuid()::text),
      'institutionName', investment_broker_name,
      'kind',            'broker_account',
      'notes',           coalesce(investment_notes, '')
    )
  )
  where coalesce(investment_broker_name, '') <> ''
    and (investment_accounts is null or investment_accounts = '[]'::jsonb)
  returning id, first_name, investment_broker_name, investment_accounts;
`);
console.log(JSON.stringify(invResult, null, 2));

// 3. Migrate pension_fund_name → pension_funds (only if empty)
console.log('\n=== Migrating pension_fund_name → pension_funds ===');
const penResult = await runSql(`
  update public.clients
  set pension_funds = jsonb_build_array(
    jsonb_build_object(
      'id',              concat('pen-migrated-', gen_random_uuid()::text),
      'institutionName', pension_fund_name,
      'kind',            'new_pension',
      'isEmployerLinked', true
    )
  )
  where coalesce(pension_fund_name, '') <> ''
    and (pension_funds is null or pension_funds = '[]'::jsonb);
`);
console.log(JSON.stringify(penResult, null, 2));

// 4. Final state
console.log('\n=== Final state ===');
const after = await runSql(`
  select id, first_name,
    jsonb_array_length(coalesce(investment_accounts, '[]'::jsonb)) as inv_count,
    jsonb_array_length(coalesce(pension_funds, '[]'::jsonb))       as pen_count,
    investment_accounts, pension_funds
  from public.clients
  order by created_at;
`);
console.log(JSON.stringify(after, null, 2));

console.log('\n✅ Migration complete.');
