// config.mjs — קורא worker/.env בעצמו, בלי תלות (אין dotenv). פורמט זהה
// לזה שהסקריפטים ב-scripts/ כבר קוראים ידנית.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = resolve(ROOT, '.env');

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !m[1].startsWith('#')) out[m[1]] = m[2].trim();
  }
  return out;
}

const fileEnv = loadEnvFile(ENV_PATH);
const get = (key) => process.env[key] ?? fileEnv[key];

export const FUNCTION_URL = get('PIVO_FUNCTION_URL');
export const WORKER_SECRET = get('PIVO_WORKER_SECRET');
export const USER_ID = get('PIVO_USER_ID');
export const WORKER_ID = get('PIVO_WORKER_ID') || 'worker-1';
export const POLL_SECONDS = Number(get('PIVO_POLL_SECONDS') || 5);
export const LEASE_SECONDS = Number(get('PIVO_LEASE_SECONDS') || 60);

const missing = [];
if (!FUNCTION_URL) missing.push('PIVO_FUNCTION_URL');
if (!WORKER_SECRET) missing.push('PIVO_WORKER_SECRET');
if (!USER_ID) missing.push('PIVO_USER_ID');
if (missing.length) {
  console.error(`✋ חסרים משתני סביבה: ${missing.join(', ')}`);
  console.error(`   העתק worker/.env.example ל-worker/.env ומלא אותם.`);
  process.exit(1);
}
