// מחיל את 281 (ידע מקצועי: שאלות, «מה אני לומד», דלי קבצים) מהקובץ עצמו ומאמת: RLS, הרשאות (anon חסום, אין עדכון ישיר), דלי פרטי.
//   node scripts/sql/281/apply-staging.mjs [--verify-only] [--rollback]
// ‼ staging בלבד (staging-lib עוצר כתיבה לייצור). ייצור — scripts/prod-apply-migration.mjs אחרי גיבוי, בשחרור מאושר.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeStaging as sql } from '../../staging-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
if (process.argv.includes('--rollback')) {
  await sql(readFileSync(join(here, 'rollback-281.sql'), 'utf8').replace(/\r\n/g, '\n'));
  console.log('rollback הוחל');
  process.exit(0);
}
if (!process.argv.includes('--verify-only')) {
  await sql(readFileSync(join(here, '../../../supabase/281-knowledge-ask.sql'), 'utf8').replace(/\r\n/g, '\n'));
  console.log('הוחל ב-staging');
}
export const VERIFY_281 = `select
  (select relrowsecurity from pg_class where oid = 'public.knowledge_questions'::regclass) rls_q,
  (select relrowsecurity from pg_class where oid = 'public.knowledge_inbox'::regclass) rls_i,
  has_table_privilege('anon', 'public.knowledge_questions', 'select') anon_q,
  has_table_privilege('anon', 'public.knowledge_inbox', 'select') anon_i,
  has_table_privilege('authenticated', 'public.knowledge_questions', 'update') upd_q,
  has_table_privilege('authenticated', 'public.knowledge_inbox', 'update') upd_i,
  has_table_privilege('authenticated', 'public.knowledge_inbox', 'insert') ins_i,
  (select public from storage.buckets where id = 'knowledge-inbox') bucket_public,
  (select count(*)::int from pg_policies where schemaname = 'storage' and policyname like 'knowledge_inbox_files_%') bucket_policies,
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename in ('knowledge_questions', 'knowledge_inbox')) table_policies`;
const [t] = await sql(VERIFY_281);
const ok = t.rls_q && t.rls_i && !t.anon_q && !t.anon_i && !t.upd_q && !t.upd_i && t.ins_i && t.bucket_public === false && t.bucket_policies === 3 && t.table_policies === 5;
console.log(`  ${ok ? '✓' : '✗'} RLS ${t.rls_q && t.rls_i ? 'פעיל' : 'כבוי!'} · anon ${t.anon_q || t.anon_i ? 'קורא!' : 'חסום'} · עדכון ישיר ${t.upd_q || t.upd_i ? 'פתוח!' : 'חסום'} · דלי ${t.bucket_public === false ? 'פרטי' : String(t.bucket_public)} (${t.bucket_policies}) · מדיניות ${t.table_policies}`);
process.exit(ok ? 0 : 1);
