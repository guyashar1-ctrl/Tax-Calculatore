// Dump existing annual_report_sessions to check for stale model shapes.
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

const sql = `select id, client_id, tax_year, status, current_question_id,
  jsonb_object_keys(model) as model_top_key,
  created_at, updated_at
from public.annual_report_sessions
order by updated_at desc
limit 30;`;

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
console.log('HTTP', res.status);
const data = await res.json();
console.log(JSON.stringify(data, null, 2));
