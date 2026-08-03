-- ═══════════════════════════════════════════════════════════════════════════
--  29 — מפתח ייחודי לכל מייל יוצא (מניעת שליחה כפולה)
-- ═══════════════════════════════════════════════════════════════════════════
--  מייל קישור הייצוג נשלח משני מקומות שאינם יודעים זה על זה: הדפדפן של הלקוח
--  מיד אחרי שאישר את ההצעה, ורשת הביטחון שרצה בכניסה הבאה של הרו"ח. עד היום
--  הסימון "כבר נשלח" נעשה בצד הדפדפן — ולכן שני מסלולים שרצו באותו רגע יכלו
--  לשלוח ללקוח את אותו מייל פעמיים.
--
--  ‼ המפתח הוא שכבת ההגנה השנייה. הראשונה היא תביעה אטומית על ההצעה עצמה
--  (UPDATE ... WHERE representation_sent_at IS NULL) בתוך פונקציית השרת.
--  האינדקס כאן מבטיח שגם אם התביעה תיעקף, לא ייווצר רישום כפול ביומן.
--
--  ‼ email_messages נוצרה מחוץ למיגרציות של הריפו. הקובץ הזה רק מוסיף לה
--  עמודות, ולעולם לא יוצר אותה — כדי שהרצה בסביבה שאין בה את הטבלה תדלג
--  בשקט במקום להמציא טבלה שונה מזו שבייצור.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.email_messages') is null then
    raise notice 'email_messages לא קיימת — מדלגים';
    return;
  end if;

  alter table public.email_messages add column if not exists idempotency_key text;
  -- מזהה שלב הקליטה שהמייל שייך לו. בלי FK, כמו request_id הקיים לצידו:
  -- הטבלה קדמה למיגרציות ואין לה קשרים נאכפים.
  alter table public.email_messages add column if not exists step_id uuid;

  create unique index if not exists email_messages_idempotency_key_idx
    on public.email_messages (user_id, idempotency_key)
    where idempotency_key is not null;
end
$$;
