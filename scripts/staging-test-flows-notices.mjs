#!/usr/bin/env node
/**
 * staging-test-flows-notices.mjs — 214–216: הודעות ללקוח (חדש/תזכורת, תפיסה בשרת,
 * גידור, כשל ודאי/לא ודאי), מסלולים (שלבים, עצירה, חידוש, ביטול, גרסאות,
 * הצעות, שנתי), פעולה מול רשות במסלול, ואישור הצעה ⇒ ריצת קליטה אחת.
 *
 * ‼ המיגרציות והבדיקה נשלחות כבקשה אחת שמסתיימת ב-raise — שום דבר לא נשמר,
 * ואפשר להריץ גם כש-214–216 עוד לא הוחלו על staging. שום מייל לא נשלח:
 * ההשלמה מדומה ברמת הפונקציות, כמו ב-staging-test-send-record.
 * הבדיקה עצמה: scripts/sql/test-notices-flows.sql.
 *
 * שימוש:  node scripts/staging-test-flows-notices.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, loadEnv, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const MIGRATIONS = ['supabase/214-client-notices.sql', 'supabase/215-flows.sql', 'supabase/216-flows-onboarding-integration.sql']
  .map(f => readFileSync(resolve(ROOT, f), 'utf8')).join('\n');
const TEST = readFileSync(resolve(ROOT, 'scripts/sql/test-notices-flows.sql'), 'utf8').replaceAll('__USER__', USER_ID);

// ‼ fetch ישיר: writeStaging קוטע שגיאות ב-600 תווים, והתוצאות יושבות בשגיאה.
const r = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${loadEnv().SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: MIGRATIONS + '\n' + TEST }),
});
const body = await r.text();
if (r.ok) { console.error('✋ הבקשה הסתיימה בלי raise — ייתכן שמשהו נשמר!'); process.exit(1); }
let msg = body; try { msg = JSON.parse(body).message ?? body; } catch { /* text */ }
const m = msg.match(/RESULTS:(\[.*\])/s);
if (!m) { console.error('✋ המיגרציה או הבדיקה נכשלו לפני הסוף:\n' + msg.slice(0, 3000)); process.exit(1); }
const results = JSON.parse(m[1].slice(0, m[1].lastIndexOf(']') + 1));
let pass = 0, fail = 0;
for (const x of results) {
  if (x.pass) { pass++; console.log(`  ✓ ${x.t}`); } else { fail++; console.log(`  ✗ ${x.t} — ${JSON.stringify(x.got)}`); }
}
console.log(`\n${pass} עברו · ${fail} נכשלו · rolled back`);
process.exitCode = fail ? 1 : 0;
