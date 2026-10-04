#!/usr/bin/env node
/**
 * staging-dryrun-flows.mjs — קבצי המיגרציה של השחרור כפי שהם, ואחריהם בלוק בדיקות,
 * בבקשה אחת לסביבת הבדיקות שמסתיימת ב-raise — הכול מתבטל.
 *
 * ‼ למה: הבדיקות הרגילות רצות מול הפונקציות שכבר הוחלו ב-staging. כשעורכים
 *   את קבצי המיגרציה אחרי ההחלה (ומחילים פונקציה בודדת), זה מה שמוכיח שהקבצים
 *   עצמם — מה שיוחל על הייצור — מתקמפלים יחד ומתנהגים כמו שנבדק.
 *
 *   הקבצים: 214, 215, 216 וכל supabase/217-*.sql … 229-*.sql שקיים (לפי הסדר);
 *   ‎--full מוסיף את 212 בראש (סדר השחרור המלא).
 *
 *   שימוש:  node scripts/staging-dryrun-flows.mjs                 (קבצים + scripts/sql/test-notices-flows.sql)
 *           node scripts/staging-dryrun-flows.mjs --only          (רק שהקבצים עוברים)
 *           node scripts/staging-dryrun-flows.mjs --full          (עם 212 בראש)
 *           node scripts/staging-dryrun-flows.mjs --tests a.sql,b.sql   (קובצי בדיקה נוספים, כל אחד בבקשה משלו)
 *           node scripts/staging-dryrun-flows.mjs --tests-only a.sql    (רק הקבצים האלה)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, loadEnv } from './staging-lib.mjs';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const only = flag('--only');
const later = readdirSync(resolve(ROOT, 'supabase'))
  .filter(f => /^2(1[7-9]|2\d)-.*\.sql$/.test(f))
  .sort((a, b) => parseInt(a) - parseInt(b))
  .map(f => `supabase/${f}`);
// ‼ 216 בונה על 212 (claim_representation_reminder משתמשת ב-ni_targets_of) — בשחרור 212 קודמת.
const FILES = [...(flag('--full') ? ['supabase/212-cancel-ni-representation-subject.sql'] : []),
  'supabase/214-client-notices.sql', 'supabase/215-flows.sql', 'supabase/216-flows-onboarding-integration.sql', ...later];
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const extra = (opt('--tests') || opt('--tests-only') || '').split(',').map(s => s.trim()).filter(Boolean);
const testFiles = only ? [] : [...(flag('--tests-only') ? [] : ['scripts/sql/test-notices-flows.sql']), ...extra];
const migrations = FILES.map(f => readFileSync(resolve(ROOT, f), 'utf8')).join('\n');

console.log(`יעד: ${STAGING_REF} · ${FILES.map(f => f.replace(/^supabase\//, '').split('-')[0]).join(' → ')}${testFiles.length ? ' · ' + testFiles.length + ' קובצי בדיקה' : ''} · מתבטל בסוף`);

async function runOnce(tail, label) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${loadEnv().SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: migrations + '\n' + tail }),
  });
  const body = await r.text();
  if (r.ok) { console.error(`✋ ${label}: הסתיים בלי raise — ייתכן שנשמר!`); console.log(body.slice(0, 500)); return 1; }
  let msg = body; try { msg = JSON.parse(body).message ?? body; } catch { /* טקסט */ }
  const m = msg.match(/RESULTS:(\[.*\])/s);
  if (m) {
    const results = JSON.parse(m[1].slice(0, m[1].lastIndexOf(']') + 1));
    let pass = 0, fail = 0;
    for (const x of results) { if (x.pass) pass++; else { fail++; console.log(`  ✗ ${x.t} — ${JSON.stringify(x.got).slice(0, 600)}`); } }
    console.log(`${label}: ${pass} עברו · ${fail} נכשלו · rolled back`);
    return fail ? 1 : 0;
  }
  if (/DRYRUN_OK/.test(msg)) { console.log(`✓ ${label}: הקבצים עברו יחד · rolled back`); return 0; }
  console.log(`✗ ${label}:\n` + msg.slice(0, 3000));
  return 1;
}

let failed = 0;
if (only) failed += await runOnce(`do $$ begin raise exception 'DRYRUN_OK'; end $$;`, 'קבצים');
for (const t of testFiles) {
  failed += await runOnce(readFileSync(resolve(ROOT, t), 'utf8').replaceAll('__USER__', USER_ID), t.replace(/^scripts\/sql\//, ''));
}
process.exitCode = failed ? 1 : 0;
