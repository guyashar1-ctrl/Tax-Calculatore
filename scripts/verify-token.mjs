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
const supabaseUrl = env.VITE_SUPABASE_URL;
const expectedRef = new URL(supabaseUrl).hostname.split('.')[0];

console.log(`Token prefix:  ${token.slice(0, 8)}...`);
console.log(`Token length:  ${token.length}`);
console.log(`Expected ref:  ${expectedRef}`);
console.log('');

console.log('Testing token by listing projects...');
const r = await fetch('https://api.supabase.com/v1/projects', {
  headers: { Authorization: `Bearer ${token}` },
});
console.log(`HTTP ${r.status}`);
const txt = await r.text();
let parsed;
try { parsed = JSON.parse(txt); } catch { parsed = txt; }

if (!r.ok) {
  console.log('Body:', parsed);
  process.exit(1);
}

if (Array.isArray(parsed)) {
  console.log(`Found ${parsed.length} project(s):`);
  for (const p of parsed) {
    const match = p.id === expectedRef ? '  <-- MATCH' : '';
    console.log(`  - id=${p.id}  name=${p.name}  region=${p.region}  status=${p.status}${match}`);
  }
} else {
  console.log('Body:', parsed);
}
