#!/usr/bin/env node
/**
 * deploy-edge-function.mjs — פורס פונקציית Edge מקבצי הריפו, בדיוק כפי שהם.
 *
 * ‼ למה זה קיים: עד כה פונקציות נפרסו בהעתקת התוכן ידנית לכלי חיצוני, וכל
 * העתקה כזו היא הזדמנות לפער בין מה שבריפו למה שרץ. כאן הקובץ נקרא מהדיסק,
 * ואיתו כל התלויות היחסיות שהוא מייבא מ-_shared — אחרת הפונקציה נפרסת עם
 * גרסה ישנה של הקוד המשותף.
 *
 *   שימוש:  node scripts/deploy-edge-function.mjs <staging|prod> <שם-הפונקציה>
 *
 * דורש SUPABASE_ACCESS_TOKEN ב-.env.local.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REFS = { staging: 'evdfxjqrkgugssfrdoxd', prod: 'uoweoqtuiettozagwgdw' };

const env = {};
for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('✋ SUPABASE_ACCESS_TOKEN חסר ב-.env.local'); process.exit(1); }

const [target, name] = process.argv.slice(2);
const ref = REFS[target];
if (!ref || !name) {
  console.error('שימוש: node scripts/deploy-edge-function.mjs <staging|prod> <שם-הפונקציה>');
  process.exit(1);
}

const fnDir = resolve(ROOT, 'supabase/functions', name);
const entry = join(fnDir, 'index.ts');
if (!existsSync(entry)) { console.error(`✋ ${relative(ROOT, entry)} לא נמצא`); process.exit(1); }

/** אוסף את הקובץ ואת כל מה שהוא מייבא ביחסיות — רקורסיבית. */
const files = new Map();
const walk = (abs) => {
  const key = relative(resolve(ROOT, 'supabase/functions'), abs).replace(/\\/g, '/');
  if (files.has(key)) return;
  const src = readFileSync(abs, 'utf8');
  files.set(key, src);
  for (const m of src.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
    const dep = resolve(dirname(abs), m[1]);
    if (existsSync(dep)) walk(dep);
  }
};
walk(entry);

const form = new FormData();
form.append('metadata', JSON.stringify({
  name, entrypoint_path: `${name}/index.ts`, verify_jwt: false,
}));
for (const [path, content] of files) {
  form.append('file', new File([content], path, { type: 'application/typescript' }), path);
}

console.log(`יעד: ${ref}  ·  ${name}  ·  ${files.size} קבצים:`);
for (const p of files.keys()) console.log('   · ' + p);

const r = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=${encodeURIComponent(name)}`,
  { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: form },
);
const text = await r.text();
if (!r.ok) { console.error('✗ נכשל:', r.status, text.slice(0, 600)); process.exit(1); }
const out = JSON.parse(text);
console.log(`✓ נפרס · גרסה ${out.version} · verify_jwt=${out.verify_jwt}`);
