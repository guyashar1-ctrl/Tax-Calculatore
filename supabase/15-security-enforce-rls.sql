-- ═══════════════════════════════════════════════════════════════════════════
--  15 — אכיפת המורשים ב-RLS  ·  שלב 1 באבטחה
-- ═══════════════════════════════════════════════════════════════════════════
--  על כל טבלת מידע מוסיפים מדיניות RESTRICTIVE: בנוסף לתנאי הקיים ("השורה שלך"),
--  המשתמש חייב להיות מורשה. RESTRICTIVE מצטרפת ב-AND לכל שאר המדיניות — כך
--  שמשתמש מחובר שאינו ברשימה לא קורא ולא כותב אף שורה, גם בגישה ישירה ל-API.
--
--  לא נוגע ב-anon: הקישורים הציבוריים של הלקוחות עוברים דרך פונקציות SECURITY
--  DEFINER שאינן כפופות ל-RLS, וממשיכים לעבוד כרגיל.
--
--  רשת ביטחון: אם is_authorized() תשגה, שחזור ע"י מחיקת ה-policies דרך service role.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  t text;
  tbls text[] := array[
    'annual_report_answers','annual_report_model_snapshots','annual_report_sessions',
    'cases','clients','document_task_links','documents','email_messages','employees',
    'leads','profiles','quotation_counters','quotation_templates','quotations',
    'representation_requests','service_catalog','tasks'
  ];
begin
  foreach t in array tbls loop
    execute format('drop policy if exists require_authorized on public.%I', t);
    execute format(
      'create policy require_authorized on public.%I '
      || 'as restrictive for all to authenticated '
      || 'using (public.is_authorized()) with check (public.is_authorized())', t);
  end loop;
end $$;
