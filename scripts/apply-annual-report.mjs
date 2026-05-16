// Apply the 04-annual-report.sql migration via Supabase Management API.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnv(file) {
  const env = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

// Worktree may not carry .env.local — fall back to the main repo path.
import { existsSync } from 'node:fs';
const localEnv = resolve(root, '.env.local');
const mainRepoEnv = resolve(root, '..', '..', '..', '.env.local');
const envFile = existsSync(localEnv) ? localEnv : mainRepoEnv;
console.log(`Using env file: ${envFile}`);
const env = loadEnv(envFile);
const token = env.SUPABASE_ACCESS_TOKEN;
const supabaseUrl = env.VITE_SUPABASE_URL;

if (!token || !supabaseUrl) {
  console.error('ERROR: SUPABASE_ACCESS_TOKEN or VITE_SUPABASE_URL missing in .env.local');
  process.exit(1);
}

const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
const sqlPath = resolve(root, 'supabase', '04-annual-report.sql');
const sql = readFileSync(sqlPath, 'utf8');

console.log(`Project ref: ${projectRef}`);
console.log(`SQL file:    ${sqlPath} (${sql.length} chars)`);

const res = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  }
);

const text = await res.text();
let body;
try { body = JSON.parse(text); } catch { body = text; }

console.log(`HTTP ${res.status} ${res.statusText}`);
console.log(typeof body === 'string' ? body : JSON.stringify(body, null, 2));

if (!res.ok) {
  console.error('\n❌ Migration NOT applied.');
  process.exit(1);
}
console.log('\n✅ Migration applied.');
