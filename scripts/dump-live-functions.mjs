#!/usr/bin/env node
/**
 * dump-live-functions.mjs — מושך הגדרות חיות של פונקציות SQL מהמסד לקבצים.
 *
 * למה: הכלל בפרויקט הוא "לא לדרוס פונקציה בלי לקרוא אותה קודם", ואחרי כל מהלך
 * הריפו צריך לשקף את מה שרץ בפועל. עד היום זה נעשה ידנית ולכן נשכח — הארכיון
 * של 2026-08-04 פספס שש פונקציות ונשאר תקוע לפני מיגרציה 51.
 *
 * שימוש:
 *   node scripts/dump-live-functions.mjs <תיקיית-יעד> [שם_פונקציה ...]
 * בלי שמות — מושך את כל הפונקציות של סכימת public.
 *
 * דורש SUPABASE_SERVICE_ROLE_KEY ב-.env.local. DEV בלבד; המפתח לא מודפס.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = resolve(ROOT, '.env.local');

if (process.env.NODE_ENV === 'production') {
  console.error('✋ NODE_ENV=production — הסקריפט הזה ל-DEV בלבד.');
  process.exit(1);
}
if (!existsSync(ENV_PATH)) { console.error('✋ .env.local לא נמצא'); process.exit(1); }

const env = {};
for (const line of readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}
const URL = env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('✋ VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY חסרים ב-.env.local'); process.exit(1); }

const [outDir, ...names] = process.argv.slice(2);
if (!outDir) { console.error('שימוש: node scripts/dump-live-functions.mjs <תיקיית-יעד> [שמות...]'); process.exit(1); }

const admin = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// פונקציית העזר נוצרת פעם אחת ונשארת — היא קוראת בלבד ומוגבלת לסכימת public.
const HELPER = `
create or replace function public.__dump_function_defs(p_names text[] default null)
returns table(name text, args text, def text)
language sql stable security definer set search_path to 'public' as $$
  select p.proname::text,
         pg_get_function_identity_arguments(p.oid),
         pg_get_functiondef(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and (p_names is null or p.proname = any(p_names))
  order by p.proname;
$$;`;

const { error: helperErr } = await admin.rpc('__dump_function_defs', { p_names: null }).limit(1);
if (helperErr) {
  console.error('✋ פונקציית העזר __dump_function_defs לא קיימת במסד.');
  console.error('   הרץ פעם אחת את ה-SQL הבא (או דרך מיגרציה):\n');
  console.error(HELPER);
  process.exit(1);
}

const { data, error } = await admin.rpc('__dump_function_defs', { p_names: names.length ? names : null });
if (error) { console.error('✋ ' + error.message); process.exit(1); }

const dir = resolve(ROOT, outDir);
mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().slice(0, 10);
let written = 0;
for (const row of data) {
  const file = join(dir, `${row.name}.sql`);
  writeFileSync(file, `-- נמשך חי ${stamp} מהמסד (pg_get_functiondef).\n-- ארגומנטים: ${row.args || '(ללא)'}\n${row.def}\n`, 'utf8');
  written++;
}
console.log(`✓ נכתבו ${written} הגדרות אל ${outDir}`);
