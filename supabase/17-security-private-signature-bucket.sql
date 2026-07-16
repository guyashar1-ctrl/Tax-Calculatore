-- ═══════════════════════════════════════════════════════════════════════════
--  17 — דלי פרטי לחתימה ולחותמת  ·  שלב 1 באבטחה
-- ═══════════════════════════════════════════════════════════════════════════
--  החתימה והחותמת של הרו"ח היו ב-firm-logos (ציבורי) — מי שהשיג כתובת הוריד
--  אותן. מעבירים אותן לדלי פרטי firm-private עם הפרדה לפי משתמש (התיקייה = uid).
--  שתי נקודות הצריכה (מסך המשרד + הטבעה ב-PDF) רצות בדפדפן המחובר של הרו"ח,
--  ולכן ניגשות דרך download() מאומת — אין צורך בכתובות ציבוריות או חתומות.
--  הלוגו נשאר ב-firm-logos (הוא מוטבע במיילים ללקוחות וחייב כתובת קבועה).
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('firm-private', 'firm-private', false, 2097152,
        array['image/png','image/jpeg','image/svg+xml','image/webp'])
on conflict (id) do nothing;

-- הפרדה לפי משתמש: התיקייה הראשונה בנתיב = auth.uid()
drop policy if exists firm_private_select_own on storage.objects;
create policy firm_private_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'firm-private' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists firm_private_insert_own on storage.objects;
create policy firm_private_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'firm-private' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists firm_private_update_own on storage.objects;
create policy firm_private_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'firm-private' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists firm_private_delete_own on storage.objects;
create policy firm_private_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'firm-private' and (storage.foldername(name))[1] = auth.uid()::text);
