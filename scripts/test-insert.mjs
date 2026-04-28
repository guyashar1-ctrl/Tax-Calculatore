// Verify the dbMappers fix: simulate exactly what addClient(makeEmptyClient(...))
// produces after the empty-string-skip fix, and try the INSERT via Management API.
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
  return { status: r.status, body: text };
}

const usersRes = await runQuery(`select id from auth.users limit 1`);
const userId = JSON.parse(usersRes.body)[0]?.id;

// Simulate the row that addClient sends after our fixes (empty strings skipped)
const row = {
  id: 'test-' + Date.now(),
  user_id: userId,
  // From QuickCreateClient form input
  first_name: 'בדיקה',
  last_name: 'משתמש',
  id_number: '123456789',
  phone: '050-0000000',
  email: 'test@example.com',
  // From makeEmptyClient defaults (only non-empty, non-undefined)
  gender: 'male',
  has_exempt_from_withholding: false,
  ni_type: 'employee',
  has_tax_coordination: false,
  family_status: 'single',
  spouse_working: false,
  spouse_income: 0,
  spouse: null,
  children: [],
  is_new_immigrant: false,
  aliyah_year: 0,
  is_returning_resident: false,
  returning_year: 0,
  disability_percentage: 0,
  has_academic_degree: false,
  academic_degree_year: 0,
  completed_idf: false,
  idf_release_year: 0,
  completed_national_service: false,
  national_service_year: 0,
  qualifying_settlement_override: false,
  qualifying_settlement_credit_points: 0,
  has_residential_property: false,
  number_of_properties: 0,
  has_pension: false,
  employee_pension_pct: 0,
  employer_pension_pct: 0,
  has_kupot_gemel: false,
  has_kren_hashtalmut: false,
  kren_hashtalmut_monthly: 0,
  completed_idf: false,
  completed_national_service: false,
  representation_status: 'active',
  income_tax_type: 'employee',
  vat_status: 'none',
  created_at: new Date().toISOString(),
};

// Build INSERT statement
const cols = Object.keys(row);
const vals = cols.map(c => {
  const v = row[c];
  if (v === null) return 'NULL';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (Array.isArray(v) || typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
});
const sql = `insert into public.clients (${cols.join(', ')}) values (${vals.join(', ')}) returning id, first_name, birth_date, created_at`;

console.log('Testing INSERT with the row addClient would produce after the fix...');
const r = await runQuery(sql);
console.log(`HTTP ${r.status}`);
console.log(r.body);

// Cleanup
if (r.status >= 200 && r.status < 300) {
  await runQuery(`delete from public.clients where id = '${row.id}'`);
  console.log('\n✅ Insert succeeded — fix works. Test row cleaned up.');
} else {
  console.log('\n❌ Insert still fails. Need a different fix.');
}
