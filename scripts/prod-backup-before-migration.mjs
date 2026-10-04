#!/usr/bin/env node
/**
 * prod-backup-before-migration.mjs — גיבוי לפני החלת מיגרציות על הייצור.
 *
 * ‼ למה: אין pg_dump במחשב, ולפרויקט אין גיבויים אוטומטיים שאפשר לשחזר מהם בלחיצה
 *   (נבדק 03.10: PITR כבוי, רשימת הגיבויים ריקה). לכן לפני כל מהלך מסד — הגיבוי הזה:
 *   1. הגדרת כל פונקציה ב-public (+ הרשאות), מדיניות RLS, טריגרים, אינדקסים, משימות cron
 *      ושמות הסודות ב-vault (בלי ערכים) → קובץ JSON מקומי.
 *   2. עותק מלא של כל טבלה שהמיגרציות משנות בה נתונים: בתוך המסד (סכימה נפרדת
 *      backup_<tag>, לא חשופה ל-API — לשחזור מהיר ב-SQL), וגם כקובץ JSON מקומי.
 *   3. README עם דרך השחזור.
 *
 *   שימוש:  node scripts/prod-backup-before-migration.mjs <tag> <תיקיית-יעד> <טבלה,טבלה,...>
 *   למשל:   node scripts/prod-backup-before-migration.mjs r4_20261003 C:/Users/guyas/PIVO/backups/r4 onboarding_steps,engagements
 *
 * ‼ לא דורס: סכימת גיבוי עם אותו tag שכבר קיימת ⇒ עצירה.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readProd, PROD_REF, api } from './staging-lib.mjs';

const [tag, outDir, tablesArg] = process.argv.slice(2);
if (!tag || !/^[a-z0-9_]+$/.test(tag) || !outDir || !tablesArg) {
  console.error('שימוש: node scripts/prod-backup-before-migration.mjs <tag:a-z0-9_> <out-dir> <table,table,...>');
  process.exit(2);
}
const tables = tablesArg.split(',').map(s => s.trim()).filter(Boolean);
for (const t of tables) if (!/^[a-z_][a-z0-9_]*$/.test(t)) { console.error('שם טבלה לא תקין:', t); process.exit(2); }
const schema = `backup_${tag}`;
if (existsSync(join(outDir, 'MANIFEST.json'))) { console.error(`✋ ${outDir} כבר מכיל גיבוי — לא דורסים.`); process.exit(1); }
mkdirSync(outDir, { recursive: true });

/** כתיבה לייצור — רק יצירת סכימת הגיבוי והעתקת טבלאות. */
async function writeProd(query) {
  return api(`/projects/${PROD_REF}/database/query`, { method: 'POST', body: JSON.stringify({ query }) });
}

const now = new Date().toISOString();
console.log(`גיבוי ${PROD_REF} · ${schema} · ${outDir}`);

// ── 1 · ההגדרות ────────────────────────────────────────────────────────────────
const defs = {
  takenAt: now,
  functions: await readProd(`select p.oid::regprocedure::text as signature, pg_get_functiondef(p.oid) as definition,
      p.proacl::text as acl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f', 'p') order by 1`),
  policies: await readProd(`select schemaname, tablename, policyname, permissive, roles::text as roles, cmd, qual, with_check
    from pg_policies where schemaname = 'public' order by tablename, policyname`),
  triggers: await readProd(`select c.relname as table_name, t.tgname as name, pg_get_triggerdef(t.oid) as definition,
      t.tgenabled as enabled
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not t.tgisinternal order by 1, 2`),
  indexes: await readProd(`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1, 2`),
  columns: await readProd(`select table_name, column_name, data_type, is_nullable, column_default
    from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position`),
  cron: await readProd(`select jobid, jobname, schedule, command, active from cron.job order by jobid`),
  vaultSecretNames: await readProd(`select name from vault.secrets order by name`),
  migrations: await readProd(`select version, name from supabase_migrations.schema_migrations order by version`),
};
writeFileSync(join(outDir, 'definitions.json'), JSON.stringify(defs, null, 1));
console.log(`✓ הגדרות: ${defs.functions.length} פונקציות · ${defs.policies.length} מדיניות · ${defs.triggers.length} טריגרים · ${defs.indexes.length} אינדקסים · ${defs.cron.length} cron`);

// ── 2 · הטבלאות: עותק במסד + קובץ ────────────────────────────────────────────────
const exists = await readProd(`select count(*)::int as n from information_schema.schemata where schema_name = '${schema}'`);
if (exists[0].n > 0) { console.error(`✋ הסכימה ${schema} כבר קיימת במסד — לא דורסים. בחר tag אחר.`); process.exit(1); }
await writeProd(`create schema ${schema}; revoke all on schema ${schema} from public, anon, authenticated;`);
const counts = {};
for (const t of tables) {
  await writeProd(`create table ${schema}.${t} as table public.${t};`);
  const [{ n }] = await readProd(`select (select count(*) from public.${t})::int as n`);
  const [{ m }] = await readProd(`select (select count(*) from ${schema}.${t})::int as m`);
  if (n !== m) { console.error(`✋ ${t}: ${n} שורות במקור, ${m} בעותק — עוצרים.`); process.exit(1); }
  // קובץ מקומי, בדפים (תשובת ה-API מוגבלת בגודל)
  const rows = [];
  for (let off = 0; off < m; off += 500) {
    const page = await readProd(`select to_jsonb(x) as r from (select * from ${schema}.${t} order by 1 limit 500 offset ${off}) x`);
    for (const p of page) rows.push(p.r);
  }
  writeFileSync(join(outDir, `${t}.json`), JSON.stringify(rows));
  counts[t] = m;
  console.log(`✓ ${t}: ${m} שורות (במסד: ${schema}.${t} · בקובץ: ${t}.json)`);
}

// ── 3 · מניפסט ודרך השחזור ───────────────────────────────────────────────────────
writeFileSync(join(outDir, 'MANIFEST.json'), JSON.stringify({ takenAt: now, project: PROD_REF, schema, tables: counts }, null, 1));
writeFileSync(join(outDir, 'README.md'), `# גיבוי ${tag} — ${now}

פרויקט: ${PROD_REF}. עותקי הטבלאות במסד: סכימה \`${schema}\` (לא חשופה ל-API).

## שחזור
- **פונקציה:** definitions.json → functions[].definition — להריץ כמות שהוא (create or replace), ואז את ההרשאות (acl).
  פונקציה חדשה שהמיגרציה הוסיפה ואינה ברשימה — אפשר להשאיר (אינה נקראת מקוד ישן) או למחוק.
- **מדיניות / טריגר / אינדקס:** definitions.json → policies / triggers / indexes (הגדרה מלאה).
- **נתונים בטבלה** (דוגמה — payload של בקשות):
  \`update public.onboarding_steps s set payload = b.payload, updated_at = b.updated_at from ${schema}.onboarding_steps b where b.id = s.id and s.payload is distinct from b.payload;\`
- **טבלה שלמה** (רק אם חייבים): \`insert into public.<t> select * from ${schema}.<t> on conflict do nothing;\` — אחרי בדיקה.
- **cron:** definitions.json → cron (המצב לפני השינוי).

שורות שגובו: ${Object.entries(counts).map(([t, n]) => `${t}=${n}`).join(' · ')}
`);
console.log(`✓ הגיבוי הושלם: ${outDir}`);
