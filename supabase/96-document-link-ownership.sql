-- ─── 96: קישורי מסמכים — בעלות על שני הצדדים, לא רק על השורה ────────────────
-- ‼ פער שהתגלה בשער השחרור של M3. המדיניות על טבלאות הקישור בדקה רק ש-user_id
-- בשורה הנכתבת הוא המשתמש המחובר. היא לא בדקה שהמסמך, הלקוח או המשימה שאליהם
-- השורה מצביעה שייכים לו גם הם. התוצאה: משתמש אחד יכול היה לכתוב שורת קישור
-- שמצביעה על מסמך של משתמש אחר — ואף לתלות אותו על לקוח של אותו משתמש אחר,
-- כך שהמסמך היה צץ אצלו בכרטיס הלקוח בלי שהוא יצר את הקישור.
--
-- אין כאן דליפת קריאה: documents עצמה מסוננת לפי בעלות, ולכן הצד המותקף לא
-- היה רואה תוכן זר. אבל זו כתיבה חוצת-בעלות שמזהמת תצוגה של משתמש אחר, וזה
-- מספיק כדי לסגור אותה לפני עלייה ל-master.
--
-- ‼ אין שינוי התנהגות לשימוש התקין: המסך מקשר תמיד בין פריטים של אותו משתמש.
-- ‼ פונקציות הקצה (portal-upload-document) עובדות עם service role ועוקפות RLS,
--    ולכן אינן מושפעות.
-- ‼ document_task_links קדמה ל-M3 אבל נכנסה לשימוש בפועל רק בה — אותו תיקון.

-- ── 1. document_clients — המסמך והלקוח חייבים להיות של הכותב ───────────────
drop policy if exists document_clients_insert_own on public.document_clients;
create policy document_clients_insert_own on public.document_clients
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.documents d
       where d.id = document_id and d.user_id = auth.uid())
    and exists (
      select 1 from public.clients c
       where c.id = client_id and c.user_id = auth.uid())
  );

-- ── 2. document_task_links — המסמך והמשימה חייבים להיות של הכותב ───────────
-- ‼ tasks.client_id יכול להיות NULL (משימה פנימית של המשרד), ולכן הבדיקה היא
--    על בעלות המשימה עצמה ולא על הלקוח שלה.
drop policy if exists dtl_insert_own on public.document_task_links;
create policy dtl_insert_own on public.document_task_links
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.documents d
       where d.id = document_id and d.user_id = auth.uid())
    and exists (
      select 1 from public.tasks t
       where t.id = task_id and t.user_id = auth.uid())
  );
