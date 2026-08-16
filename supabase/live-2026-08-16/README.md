# צילום לפני מיגרציות 101-104 (2026-08-16)

נמשך חי מהפרודקשן (`pg_get_functiondef`) לפני החלת מיגרציות 101-104, לצורך רולבק.

## מה נשמר כאן ולמה

- **`approve_quotation.sql`** — הגרסה עם המייל האוטומטי (לפני מיגרציה 102).
- **`flag_missing_representation_links.sql`** — הגרסה עם `representation_sent_at is null` (לפני מיגרציה 102).

`build_client_portal` ו-`publish_case_changes` לא נשמרו כאן בנפרד — הגרסה שלפני 101/103 היא **בדיוק** מיגרציה 99 (build_client_portal) ומיגרציה 83 (publish_case_changes), byte-for-byte (אומת לפני ההחלה, 2026-08-16). לרולבק — מריצים מחדש את הבלוקים `create or replace function` מהקבצים האלה.

## רולבק מלא (בסדר הפוך)

1. **קוד לקוח (Vercel):** revert ל-commit הקודם ל-`feat(process): מסך תהליך מאוחד` (ראה git log).
2. **`build_client_portal`:** להריץ מחדש את `create or replace function` מ-`supabase/99-portal-future-steps.sql`.
3. **`publish_case_changes`:** להריץ מחדש את `create or replace function` מ-`supabase/83-automatic-tasks.sql`.
4. **`flag_missing_representation_links`:** להריץ מחדש את `flag_missing_representation_links.sql` (בתיקייה הזאת).
5. **`approve_quotation`:** להריץ מחדש את `approve_quotation.sql` (בתיקייה הזאת).
6. **`stage_onboarding_steps_order` / `set_onboarding_step_pending_cancel` / `discard_case_changes`:**
   `drop function if exists public.stage_onboarding_steps_order(text, text[]);`
   `drop function if exists public.set_onboarding_step_pending_cancel(text, boolean);`
   `drop function if exists public.discard_case_changes(text);`
7. **עמודות:**
   `alter table public.onboarding_steps drop column if exists pending_sort_order, drop column if exists pending_cancel;`

‼ שלב 7 בטוח: העמודות לא נקראות משום מקום אחר חוץ מהפונקציות שהוסרו בשלבים 2-6.
שום שלב כאן לא נוגע בנתוני לקוחות (clients/onboarding_steps.payload/וכו') — רק בהגדרות פונקציות ובשתי עמודות ריקות.
