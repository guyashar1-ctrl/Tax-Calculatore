// Apply SQL schema to Supabase via Management API.
// Reads SUPABASE_ACCESS_TOKEN from .env.local and executes supabase/01-schema.sql.

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

const env = loadEnv(resolve(root, '.env.local'));
const token = env.SUPABASE_ACCESS_TOKEN;
const supabaseUrl = env.VITE_SUPABASE_URL;

if (!token) {
  console.error('ERROR: SUPABASE_ACCESS_TOKEN not found in .env.local');
  process.exit(1);
}
if (!supabaseUrl) {
  console.error('ERROR: VITE_SUPABASE_URL not found in .env.local');
  process.exit(1);
}

const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
const sqlPath = resolve(root, 'supabase', '01-schema.sql');
const sql = readFileSync(sqlPath, 'utf8');

console.log(`Project ref: ${projectRef}`);
console.log(`SQL file:    ${sqlPath} (${sql.length} chars)`);
console.log(`Endpoint:    https://api.supabase.com/v1/projects/${projectRef}/database/query`);
console.log('');
console.log('Sending SQL to Supabase Management API...');

const res = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  }
);

const text = await res.text();
let body;
try { body = JSON.parse(text); } catch { body = text; }

console.log(`HTTP ${res.status} ${res.statusText}`);
console.log('Response body:');
console.log(typeof body === 'string' ? body : JSON.stringify(body, null, 2));

if (!res.ok) {
  console.error('\n❌ Schema NOT applied. See error above.');
  process.exit(1);
}

console.log('\n✅ Schema applied successfully.');
