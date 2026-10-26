#!/usr/bin/env node
/**
 * staging-test-paperless-304.mjs — פייפרלס לבד (304): «נרשמתי» ⇒ משימת הקמה, התצפית ⇒ סימונים,
 * כרטיס ⇒ חותמת + התראה + סגירה (כששומר ההקמה מאפשר), חיוב ⇒ התשלום הושלם, «לא דורסים», הרשאות.
 *
 * ‼ הכול בבקשה אחת שנגמרת ב-raise — staging חוזר בדיוק למה שהיה. נתוני דמה בלבד.
 * הרצה:  node scripts/staging-test-paperless-304.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, loadEnv, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const sql = readFileSync(resolve(ROOT, 'scripts/sql/test-304-paperless-automation.sql'), 'utf8').replaceAll('__USER__', USER_ID);

const r = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${loadEnv().SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const body = await r.text();
if (r.ok) { console.error('✋ הסתיים בלי raise — ייתכן שנשמר!'); process.exit(1); }
let msg = body; try { msg = JSON.parse(body).message ?? body; } catch { /* טקסט */ }
const m = msg.match(/RESULTS:(\[.*\])/s);
if (!m) { console.error(msg.slice(0, 3000)); process.exit(1); }
const rows = JSON.parse(m[1].slice(0, m[1].lastIndexOf(']') + 1));
let fail = 0;
for (const x of rows) {
  if (!x.pass) fail++;
  console.log(`${x.pass ? '✓' : '✗'} ${x.t}${x.pass ? '' : ' — ' + JSON.stringify(x.got).slice(0, 600)}`);
}
console.log(`${rows.length - fail}/${rows.length} · rolled back`);
process.exit(fail ? 1 : 0);
