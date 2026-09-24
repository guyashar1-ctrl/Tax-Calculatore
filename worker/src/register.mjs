#!/usr/bin/env node
// register.mjs — רישום המחשב הזה כמחשב עבודה של PIVO (203).
//
// ‼ הצעד האנושי היחיד: משתמש מחובר ב-PIVO יוצר קוד צימוד (תפריט החשבון ←
// «חיבור מחשב עבודה»), והקוד מוקלד כאן. הקוד חד-פעמי ותקף 15 דקות. בתמורה
// השרת מחזיר זהות מחשב + אסימון אישי, שנכתבים ל-worker/.env **במחשב הזה
// בלבד** (לא ב-git, לא נשלחים לשום מקום אחר). הענן שומר רק sha256 שלו.
//
//   node src/register.mjs --code ABCD234XYZ [--label "משרד - מחשב 2"]
//        [--existing-worker-id guy-office-pc]   ← הגירה של זהות קיימת
//        [--function-url https://…/functions/v1/automation-worker]

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostname } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = resolve(ROOT, '.env');
const DEFAULT_URL = 'https://uoweoqtuiettozagwgdw.supabase.co/functions/v1/automation-worker';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split(/\s*--/).filter(Boolean).map((p) => {
    const [k, ...v] = p.trim().split(/\s+/);
    return [k, v.join(' ').replace(/^"|"$/g, '')];
  }),
);

/** מעדכן מפתחות ב-.env ומשאיר את השאר בדיוק כמו שהם. טהורה. */
export function mergeEnv(text, set, remove = []) {
  const lines = String(text ?? '').split(/\r?\n/);
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=/);
    if (m && remove.includes(m[1])) continue;
    if (m && m[1] in set) { out.push(`${m[1]}=${set[m[1]]}`); seen.add(m[1]); continue; }
    out.push(line);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  for (const [k, v] of Object.entries(set)) if (!seen.has(k)) out.push(`${k}=${v}`);
  return out.join('\n') + '\n';
}

async function main() {
  const code = (args.code || '').trim();
  if (!code) {
    console.error('✋ חסר --code. צרו קוד ב-PIVO: תפריט החשבון ← «חיבור מחשב עבודה».');
    process.exit(1);
  }
  const current = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
  const urlFromEnv = current.match(/^\s*PIVO_FUNCTION_URL\s*=\s*(.+)$/m)?.[1]?.trim();
  const url = args['function-url'] || urlFromEnv || DEFAULT_URL;
  const label = args.label || hostname();

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op: 'register', code, label, existingWorkerId: args['existing-worker-id'] || undefined }),
  });
  const data = await res.json().catch(() => ({ ok: false, error: `bad_response_${res.status}` }));
  if (!data?.ok) {
    const why = {
      invalid_or_expired_code: 'הקוד שגוי, כבר נוצל, או שעברו 15 דקות. צרו קוד חדש ב-PIVO.',
      worker_belongs_to_another_account: 'הזהות הזאת שייכת לחשבון אחר.',
      existing_worker_not_found: 'הזהות הקיימת שצוינה לא נמצאה.',
    }[data?.error] ?? data?.error;
    console.error(`✗ הרישום נכשל: ${why}`);
    process.exit(1);
  }

  // ‼ הסוד המשותף הישן יורד מהקובץ: מהרגע הזה המחשב מזדהה באסימון שלו בלבד.
  writeFileSync(ENV_PATH, mergeEnv(current, {
    PIVO_FUNCTION_URL: url,
    PIVO_WORKER_ID: data.workerId,
    PIVO_WORKER_TOKEN: data.token,
    PIVO_USER_ID: data.userId,
  }, ['PIVO_WORKER_SECRET']));
  console.log(`✓ המחשב נרשם · זהות ${data.workerId} · «${label}»`);
  console.log('  האסימון נשמר ב-worker/.env במחשב הזה בלבד. אל תעתיקו את הקובץ למחשב אחר —');
  console.log('  מחשב נוסף נרשם בקוד צימוד משלו.');
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('register.mjs')) {
  main();
}
