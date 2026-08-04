-- ─── הצעה שהפכה ללקוח אינה נמחקת ─────────────────────────────────────────────
-- קרה בפועל: הצעת בדיקה אושרה, נולדו ממנה לקוח + התקשרות + שלבי קליטה + בקשת
-- ייצוג — ואז ההצעה נמחקה ממסך ההצעות. הלקוח נשאר בלי המסמך שממנו נולד,
-- והמסכים הציגו "לקוח בתהליך" שאין מאחוריו הצעה.
--
-- הכלל: כל עוד קיים כרטיס לקוח שמקושר להצעה — אי אפשר למחוק אותה. מוחקים
-- קודם את כרטיס הלקוח (הדיאלוג שם מפרט מה יימחק); המחיקה מנתקת את ההצעה
-- (client_id → null בזכות ה-FK), ורק אז היא ניתנת למחיקה.
--
-- ‼ הכפתור מוסתר גם במסך, אבל האכיפה כאן — כי המסך הוא רק אחד המסלולים.

create or replace function public.block_quotation_delete_with_client()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if old.client_id is not null and exists (select 1 from clients where id = old.client_id) then
    raise exception 'ההצעה מקושרת ללקוח קיים ואינה ניתנת למחיקה. מחק קודם את כרטיס הלקוח — ההצעה תתנתק ממנו ואז תוכל להימחק.'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists quotations_block_delete_with_client on public.quotations;
create trigger quotations_block_delete_with_client
  before delete on public.quotations
  for each row execute function public.block_quotation_delete_with_client();
