#!/usr/bin/env node
/**
 * prod-check-6101-schema-ready.mjs — לפני החלת 206/207/209 על הפרודקשן: כל טבלה ועמודה שהן נוגעות בהן
 * קיימת שם בדיוק כמו ב-staging (שם הן נבדקו). ‼ קריאה בלבד בשתי הסביבות.
 *
 *   node scripts/prod-check-6101-schema-ready.mjs
 *
 * למה: הפרודקשן יכול להיות מאחור מ-staging — פונקציה שקוראת עמודה שאין בפרודקשן נשברת שם בלבד.
 * הבדיקה סורקת את קבצי המיגרציה לשמות `public.<table>`, ומשווה את העמודות (שם + סוג) של כל טבלה
 * קיימת בין שתי הסביבות. טבלאות שהמיגרציות עצמן יוצרות — מדולגות (אסור שיהיו בפרודקשן).
 */
import { readFileSync } from 'node:fs';
import { sql, readProd, STAGING_REF } from './staging-lib.mjs';

const FILES = ['supabase/206-smart-form-filings.sql', 'supabase/207-btl-portal-records.sql', 'supabase/209-smart-form-mapping-v2.sql'];
const text = FILES.map(f => readFileSync(f, 'utf8')).join('\n');
const created = new Set([...text.matchAll(/create table (?:if not exists )?public\.([a-z_0-9]+)/gi)].map(m => m[1]));
// עמודות שהמיגרציות עצמן מוסיפות (add column if not exists) — לא «חסרות» בפרודקשן אלא עוד לא נוספו
const added = new Set([...text.matchAll(/alter table public\.([a-z_0-9]+) add column if not exists ([a-z_0-9]+)/gi)].map(m => `${m[1]}.${m[2]}`));
const referenced = [...new Set([...text.matchAll(/public\.([a-z_][a-z_0-9]*)/gi)].map(m => m[1]))];

const relsQ = (names) => `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p','v') and c.relname = any(array[${names.map(n => `'${n}'`).join(',')}])`;
const stagingTables = new Set((await sql(STAGING_REF, relsQ(referenced))).map(r => r.relname));
const tables = referenced.filter(t => stagingTables.has(t) && !created.has(t)).sort();
const prodTables = new Set((await readProd(relsQ(tables))).map(r => r.relname));

const colsQ = `select table_name, column_name, data_type from information_schema.columns where table_schema = 'public'
  and table_name = any(array[${tables.map(n => `'${n}'`).join(',')}])`;
const key = (r) => `${r.table_name}.${r.column_name}:${r.data_type}`;
const sCols = new Set((await sql(STAGING_REF, colsQ)).map(key));
const pCols = new Set((await readProd(colsQ)).map(key));

let bad = 0;
for (const t of tables) {
  if (!prodTables.has(t)) { bad++; console.log(`✗ ${t}: הטבלה לא קיימת בפרודקשן`); continue; }
  const missing = [...sCols].filter(c => c.startsWith(`${t}.`) && !pCols.has(c) && !added.has(c.split(':')[0]));
  const toAdd = [...added].filter(c => c.startsWith(`${t}.`));
  if (missing.length) { bad++; console.log(`✗ ${t}: חסר בפרודקשן — ${missing.map(c => c.slice(t.length + 1)).join(', ')}`); }
  else console.log(`✓ ${t}${toAdd.length ? ` (המיגרציה תוסיף: ${toAdd.map(c => c.slice(t.length + 1)).join(', ')})` : ''}`);
}
const preexisting = [...created].filter(t => prodTables.has(t));
for (const t of [...created]) {
  const e = (await readProd(`select to_regclass('public.${t}') is not null as e`))[0].e;
  if (e) { bad++; console.log(`✗ ${t}: כבר קיימת בפרודקשן (המיגרציה אמורה ליצור אותה)`); }
}
console.log(`\nטבלאות קיימות שהמיגרציות נוגעות בהן: ${tables.length} · טבלאות חדשות: ${[...created].join(', ')}${preexisting.length ? '' : ''}`);
console.log(bad ? `✗ ${bad} פערים` : '✓ הפרודקשן מוכן: כל מה שהמיגרציות קוראות קיים שם כמו ב-staging');
process.exit(bad ? 1 : 0);
