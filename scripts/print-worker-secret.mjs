#!/usr/bin/env node
/**
 * print-worker-secret.mjs — קורא את סוד העובד המקומי מתוך Vault ומדפיס אותו,
 * פעם אחת, כדי להעתיק ל-worker/.env (PIVO_WORKER_SECRET).
 *
 * ‼ קריאה בלבד — אף פעם לא נכתב לשום מקום. הסוד עצמו נוצר בתוך המסד
 *   (supabase/150-automation-jobs.sql) ומעולם לא עבר דרך כלי חיצוני עד כאן.
 *   אחרי ההעתקה ל-worker/.env הוא חי רק שם — לא כדאי להדביק אותו שוב בשום
 *   צ'אט, לוג, או מסמך.
 *
 *   שימוש:  node scripts/print-worker-secret.mjs <staging|prod>
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REFS = { staging: 'evdfxjqrkgugssfrdoxd', prod: 'uoweoqtuiettozagwgdw' };
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const env = Object.fromEntries(
  readFileSync(resolve(ROOT, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

const TOKEN = env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('✋ SUPABASE_ACCESS_TOKEN חסר ב-.env.local'); process.exit(1); }

const target = process.argv[2];
const ref = REFS[target];
if (!ref) { console.error('שימוש: node scripts/print-worker-secret.mjs <staging|prod>'); process.exit(1); }

const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `select decrypted_secret from vault.decrypted_secrets where name = 'automation_worker_secret';` }),
});
const body = await r.json().catch(() => ({}));
if (!r.ok) { console.error('✗', JSON.stringify(body).slice(0, 400)); process.exit(1); }
const secret = body?.[0]?.decrypted_secret;
if (!secret) { console.error('✗ הסוד לא נמצא — supabase/150-automation-jobs.sql הוחל?'); process.exit(1); }

console.log(`\nPIVO_WORKER_SECRET=${secret}\n`);
console.log(`↳ להדביק את השורה הזאת ל-worker/.env (${target}). לא לשמור בשום מקום אחר.`);
