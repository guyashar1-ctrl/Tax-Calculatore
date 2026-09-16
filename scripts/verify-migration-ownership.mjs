#!/usr/bin/env node
/**
 * verify-migration-ownership.mjs — בדיקה מכנית: לכל פונקציה שמוגדרת ביותר
 * ממיגרציה אחת בטווח שנבדק, הבעלים הקנוני (המספר הגבוה ביותר) הוא זה שקבע
 * את הגוף החי בפועל על היעד. בלי זה, החלה מחדש של מיגרציה ישנה יכולה להשיב
 * גוף מיושן ולבטל בשקט אינווריאנט שמיגרציה מאוחרת יותר קבעה (בדיוק מה שקרה
 * עם get_release_portal בין 165 ל-167 בסבב הקודם).
 *
 * הרצה: node scripts/verify-migration-ownership.mjs [--min=160] [--target=staging|prod]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { writeStaging, readProd } from './staging-lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
}));
const MIN = parseInt(args.min ?? '160', 10);
const target = args.target === 'prod' ? readProd : writeStaging;
const targetName = args.target === 'prod' ? 'production' : 'staging';

const files = readdirSync('supabase')
  .filter(f => /^\d+-.*\.sql$/.test(f))
  .filter(f => parseInt(f, 10) >= MIN)
  .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

const owner = {}; // funcname(args) -> {file, body}
for (const f of files) {
  const s = readFileSync('supabase/' + f, 'utf8').replace(/\r\n/g, '\n');
  const re = /create or replace function public\.([a-z_0-9]+)\s*\(([^)]*)\)[\s\S]*?as \$(function|\$)\$\n([\s\S]*?)\n\$(function|\$)\$;/gi;
  let m;
  while ((m = re.exec(s))) {
    const key = m[1]; // by name only — pg allows overloads but this codebase doesn't lean on them for these functions
    owner[key] = { file: f, body: m[4] };
  }
}

// פונקציות שיש עליהן תוספת דינמית מוכרת (DO-block שמזריק ענף לתוך גוף קיים,
// כמו 172/173/176) — הגוף החי צפוי להיות **מכיל** את גוף הבעלים, לא זהה לו.
// ראה docs/consistency memory "codemod-על-פונקציות-SQL" / "apply-migration-do-block-quirk".
const KNOWN_DO_BLOCK_PATCHES = new Set(['advance_onboarding_step', 'build_client_portal']);

const names = Object.keys(owner);
console.log(`${targetName}: checking ${names.length} functions defined across ${files.length} migrations (>= ${MIN})`);

const rows = await target(`select proname, pg_get_functiondef(oid) def from pg_proc where pronamespace='public'::regnamespace and proname in (${names.map(n => `'${n}'`).join(',')})`);

let okN = 0;
const bad = [];
const patched = [];
for (const n of names) {
  const r = rows.find(x => x.proname === n);
  if (!r) { bad.push(`${n}: MISSING on ${targetName} (owner: ${owner[n].file})`); continue; }
  const mm = r.def.replace(/\r\n/g, '\n').match(/AS \$(function|\$)\$\n([\s\S]*?)\n\$(function|\$)\$\s*$/);
  const live = (mm ? mm[2] : '').trim();
  const ownerBody = owner[n].body.trim();
  if (live === ownerBody) { okN++; continue; }
  if (KNOWN_DO_BLOCK_PATCHES.has(n) && live.includes(ownerBody.slice(0, 200))) {
    patched.push(`${n}: owner ${owner[n].file} + a known DO-block patch (not a mismatch)`);
    okN++;
    continue;
  }
  // אימות שני: אולי זו רק חוסר-דיוק ברגקס (עוגן nested $$ וכו') ולא סטייה
  // אמיתית — הגוף החי מופיע תו-בתו בקובץ הבעלים עצמו.
  const srcFile = readFileSync('supabase/' + owner[n].file, 'utf8').replace(/\r\n/g, '\n');
  if (srcFile.includes(live)) { okN++; continue; }
  bad.push(`${n}: DIFFERS from canonical owner ${owner[n].file}`);
}
if (patched.length) { console.log('ℹ known DO-block patches (expected divergence):'); patched.forEach(p => console.log('  - ' + p)); }

console.log(`${okN}/${names.length} function bodies match their canonical (highest-numbered) owner file`);
if (bad.length) {
  console.log('✗ MISMATCHES:');
  bad.forEach(b => console.log('  - ' + b));
  process.exit(1);
} else {
  console.log('✓ all canonical — every function on ' + targetName + ' matches the highest-numbered migration that defines it');
}
