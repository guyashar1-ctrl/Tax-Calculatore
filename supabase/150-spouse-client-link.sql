-- 150 — קישור בין שני כרטיסים שהם בני זוג
--
-- ‼ הכרעת גיא (31.8): מע"מ, ניכויים וביטוח לאומי הם ייצוג של **אדם** —
-- אותו מודל בדיוק. מס הכנסה הוא ייצוג של **הזוג**. כשבן/בת זוג הופכים
-- ללקוח בפני עצמם, אסור לבקש שוב ייצוג שכבר קיים להם.
--
-- ‼ עמודה אחת, בלי מיגרציית נתונים: אין בספרים אף זוג ששניהם לקוחות,
-- ואין אף אסמכתת ב"ל שהושגה עבור בן/בת זוג (נבדק לפני הכתיבה).
--
-- ‼ הקישור סימטרי אך לא נאכף ב-DB (FK עצמי + CHECK הדדי הוא שביר): האפליקציה
-- כותבת את שני הצדדים באותה פעולה. ראה docs/PLAN-PERSON-AND-COUPLE-MODEL.md.

alter table public.clients
  add column if not exists spouse_client_id text references public.clients(id) on delete set null;

create index if not exists clients_spouse_client_id_idx
  on public.clients (spouse_client_id)
  where spouse_client_id is not null;

-- ‼ "יש עסק" ≠ "הוא הלקוח שלנו" (תרחיש ד'). בלי הדגל, ייצוג ברמת אדם
-- (מע"מ/ניכויים/ב"ל) שנגזר מקישור בן-זוג היה עלול להיקרא כברירת מחדל
-- "אנחנו מנהלים את זה" — וזה בדיוק אסור.
alter table public.clients
  add column if not exists spouse_represented_elsewhere boolean;
