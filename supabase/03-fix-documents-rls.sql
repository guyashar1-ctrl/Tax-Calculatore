-- ─────────────────────────────────────────────────────────────────────────
-- תיקון RLS לטבלת documents
-- ─────────────────────────────────────────────────────────────────────────
-- הבאג שאנחנו פותרים:
--   INSERT עובד (המסמך נכנס ל-DB), אבל SELECT מחזיר 0 שורות.
--   הסיבה: כשהורצת את ה-schema הראשונית (01-schema.sql) חלק מ-policies לא נוצרו,
--   ככל הנראה רק INSERT נוצר אבל SELECT/UPDATE/DELETE לא.
--
-- הפתרון:
--   1. לוודא ש-RLS מופעל.
--   2. למחוק policies קיימים אם יש (כדי לא לכפול), וליצור 4 policies מחדש.
--   3. כל פעולה (select/insert/update/delete) מותרת רק לבעל הרשומה (user_id = auth.uid()).
--
-- בטוח להריץ גם אם ה-policies כבר קיימים.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. הפעלת RLS (אם עדיין לא)
alter table public.documents enable row level security;

-- 2. drop של policies קיימים (אם יש) ויצירה מחדש
drop policy if exists "documents_select_own" on public.documents;
create policy "documents_select_own"
  on public.documents for select
  using (auth.uid() = user_id);

drop policy if exists "documents_insert_own" on public.documents;
create policy "documents_insert_own"
  on public.documents for insert
  with check (auth.uid() = user_id);

drop policy if exists "documents_update_own" on public.documents;
create policy "documents_update_own"
  on public.documents for update
  using (auth.uid() = user_id);

drop policy if exists "documents_delete_own" on public.documents;
create policy "documents_delete_own"
  on public.documents for delete
  using (auth.uid() = user_id);

-- 3. אבחון מהיר: רוץ את השאילתא הזו אחרי הפעלת ה-script כדי לוודא ש-4 policies קיימים:
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'documents';
-- אמור להחזיר 4 שורות: documents_select_own, documents_insert_own, documents_update_own, documents_delete_own
