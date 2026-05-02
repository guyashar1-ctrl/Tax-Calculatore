-- ─────────────────────────────────────────────────────────────────────────
-- Storage setup for client documents
-- ─────────────────────────────────────────────────────────────────────────
-- מה זה עושה:
--   1. יוצר bucket פרטי בשם 'client-documents' שבו יישמרו כל הקבצים של
--      המשרד (תעודות, PDFים, ייפויי כוח, מסמכי חתימה, וכו').
--   2. מגדיר Row-Level Security על storage.objects כך שכל משתמש רואה ויכול
--      לפעול רק על קבצים שמתחילים בנתיב <user_id>/...
--      כלומר: גיא לא יכול לראות קבצים של רו"ח אחר במערכת ולהפך.
--
-- מבנה נתיב הקבצים: <user_id>/<client_id>/<doc_id>.<ext>
-- ─────────────────────────────────────────────────────────────────────────

-- 1. יצירת ה-bucket עצמו (פרטי — לא נגיש ציבורית)
insert into storage.buckets (id, name, public)
values ('client-documents', 'client-documents', false)
on conflict (id) do nothing;

-- 2. RLS: בחירה (read) — רק קבצים שלי
drop policy if exists "client_documents_select_own" on storage.objects;
create policy "client_documents_select_own"
  on storage.objects for select
  using (
    bucket_id = 'client-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 3. RLS: הוספה (upload) — רק תחת התיקייה שלי
drop policy if exists "client_documents_insert_own" on storage.objects;
create policy "client_documents_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'client-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 4. RLS: עדכון (move/replace) — רק קבצים שלי
drop policy if exists "client_documents_update_own" on storage.objects;
create policy "client_documents_update_own"
  on storage.objects for update
  using (
    bucket_id = 'client-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 5. RLS: מחיקה — רק קבצים שלי
drop policy if exists "client_documents_delete_own" on storage.objects;
create policy "client_documents_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'client-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
