-- החזרה של 281. ‼ מוחק את השאלות ואת «מה אני לומד» — לגבות לפני (prod-backup-before-migration.mjs).
-- הקבצים בדלי knowledge-inbox נשארים (מחיקת קבצים — רק דרך Storage API, ביד).
drop policy if exists knowledge_inbox_files_select_own on storage.objects;
drop policy if exists knowledge_inbox_files_insert_own on storage.objects;
drop policy if exists knowledge_inbox_files_delete_own on storage.objects;
drop table if exists public.knowledge_questions;
drop table if exists public.knowledge_inbox;
