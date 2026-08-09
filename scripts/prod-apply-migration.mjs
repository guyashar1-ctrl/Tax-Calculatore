#!/usr/bin/env node
/**
 * prod-apply-migration.mjs — מחיל קובץ מיגרציה על הפרודקשן, בדיוק כפי שהוא.
 *
 * ‼ הקובץ נשלח כמחרוזת אחת ולא מפוצל ולא נערך — כדי שמה שרץ על המסד יהיה
 *   בדיוק מה שנסקר ונבדק ב-staging, בלי סיכון של העתקה ידנית.
 *
 *   שימוש:  node scripts/prod-apply-migration.mjs supabase/68-....sql
 */
import { readFileSync } from 'node:fs';
import { resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROD_REF = 'uoweoqtuiettozagwgdw';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const env = Object.fromEntries(
  readFileSync(resolve(ROOT, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

const TOKEN = env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('✋ SUPABASE_ACCESS_TOKEN חסר'); process.exit(1); }

const file = process.argv[2];
if (!file) { console.error('✋ יש למסור נתיב לקובץ מיגרציה'); process.exit(1); }

async function query(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(body).slice(0, 600)}`);
  return body;
}

const sql = readFileSync(resolve(ROOT, file), 'utf8');
const name = basename(file, '.sql');
console.log(`→ ${name} (${sql.length} תווים) על ${PROD_REF}`);

await query(sql);
console.log('✓ הוחל בלי שגיאה');

// רישום בהיסטוריית המיגרציות, כדי שהמסד יידע מה רץ עליו.
const version = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
await query(`insert into supabase_migrations.schema_migrations (version, name)
             values ('${version}', ${JSON.stringify(name).replace(/"/g, "'")})
             on conflict (version) do nothing;`);
console.log(`✓ נרשם כגרסה ${version}`);
