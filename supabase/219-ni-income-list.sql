-- ─── 219: רשימת ההכנסות בביטוח לאומי — הצהרה ושומה, כלשונן, לכל אדם ──────────
-- «עדכן נתונים מביטוח לאומי» (btl.sync_file) קורא את «עיסוקים והכנסות →
-- רשימת הכנסות». עד היום נלקחה ממנה שורה אחת — האחרונה לפי שנה — ו«סכום
-- הכנסה» שלה נכתב ל-ni_income_basis_monthly כאילו היה הכנסה **חודשית**.
--
-- ‼ «סכום הכנסה» אינו נושא יחידה. המשמעות לפי «מקור מידע»:
--     הצהרה      · יוני 2025          · 16,500 ⇒ הכנסה חודשית.
--     שומה עצמי  · ינואר–דצמבר 2025   · 47,800 ⇒ הכנסה שנתית (≈ 3,983 לחודש).
--   כך נרשם 47,800 «לחודש» בכרטיס (05.10.2026). מעכשיו רק הצהרה נכתבת
--   ל-ni_income_basis_monthly, והשורות עצמן — כולל השומה — נשמרות כאן.
--
-- ‼ jsonb ולא עמודות: { declaration, assessment, ambiguous?, partial? } —
-- כל שורה כלשונה (שנה, חודשים, מקור מידע, מקור הכנסה, סכום, תאריך קבלה,
-- סטטוס). עובדה אחת שנקראת יחד ומאושרת יחד, כמו 197.
--
-- ‼ לכל אדם (154): ni_income_list ללקוח, spouse_ni_income_list לבן/בת הזוג
-- כשאין לו/ה כרטיס משלו/ה. אינם מוסקים זה מזה.
--
-- ‼ אין כאן תיקון נתונים. ערכים שנכתבו בעבר מקריאה אוטומטית מסומנים במסך
-- «טעון אימות» ומוצעים לתיקון דרך האישור הרגיל (ראה
-- docs/NI-INCOME-LEGACY-REPAIR-DRY-RUN.sql — שאילתת קריאה בלבד).
--
-- ‼ אותה טכניקת הזרקה בדיוק כמו 154/197: אימות דו-כיווני של אורך ומספר
-- ענפים. אידמפוטנטי: ריצה חוזרת מדלגת. _governed_client_columns (182)
-- נגזרת מגוף הפונקציה — ולכן שתי העמודות נחסמות מכתיבה ישירה.
--
-- סדר פריסה: המסד (219) **לפני** האתר. אתר חדש מול מסד ישן — אישור
-- «רשימת הכנסות» ייכשל (מפתח לא מוכר) ולא יכתוב דבר; השאר יעבוד.

alter table public.clients
  add column if not exists ni_income_list        jsonb,
  add column if not exists spouse_ni_income_list jsonb;

comment on column public.clients.ni_income_list is
  'רשימת ההכנסות בביטוח לאומי: ההצהרה האחרונה והשומה האחרונה של העצמאי, כלשונן. «סכום הכנסה» בהצהרה הוא לחודש, בשומה לינואר–דצמבר — לשנה.';
comment on column public.clients.spouse_ni_income_list is
  'רשימת ההכנסות של בן/בת הזוג — כשהוא/היא מיוצג/ת בנפרד. אינה מוסקת מ-ni_income_list.';

do $do$
declare
  v_def text;
  v_new text;
  v_nl text;
  v_anchor text;
  v_branch text;
  -- ‼ סוף השורה אינו חלק מהעוגן: הוא נלקח מגוף הפונקציה במסד. קובץ שנפתח
  -- ב-Windows (CRLF) מול גוף עם LF — או להפך — לא יפיל ולא יזריק ענף עם
  -- שורות מעורבות. (נמצא בבדיקה במסד זמני, 05.10.2026.)
  v_anchor_core constant text := $anchor$    when 'vatBalance' then$anchor$;
  v_branch_src constant text := $branch$    when 'niIncomeList' then
      select to_jsonb(ni_income_list) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set ni_income_list = p_value, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'spouseNiIncomeList' then
      select to_jsonb(spouse_ni_income_list) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set spouse_ni_income_list = p_value, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
$branch$;
  v_branches_before int;
  v_branches_after int;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_tax_fact_field_op';

  if v_def is null then
    raise exception '219: _tax_fact_field_op לא נמצאה';
  end if;

  if position('niIncomeList' in v_def) > 0 then
    raise notice '219: הענפים כבר קיימים, מדלג';
    return;
  end if;

  v_nl := case when position(v_anchor_core || E'\r\n' in v_def) > 0 then E'\r\n' else E'\n' end;
  v_anchor := v_anchor_core || v_nl;
  v_branch := replace(replace(v_branch_src, E'\r', ''), E'\n', v_nl);

  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '219: העוגן vatBalance אינו יחיד — התיקון נעצר';
  end if;

  v_branches_before := (length(v_def) - length(replace(v_def, E'\n    when ''', ''))) / length(E'\n    when ''');
  v_new := replace(v_def, v_anchor, v_branch || v_anchor);

  if length(v_new) <> length(v_def) + length(v_branch) then
    raise exception '219: אורך לא תואם אחרי ההזרקה';
  end if;
  v_branches_after := (length(v_new) - length(replace(v_new, E'\n    when ''', ''))) / length(E'\n    when ''');
  if v_branches_after <> v_branches_before + 2 then
    raise exception '219: מספר הענפים השתנה ב-% במקום ב-2', v_branches_after - v_branches_before;
  end if;

  execute v_new;
  raise notice '219: הענפים הוזרקו (% ענפים)', v_branches_after;
end
$do$;

-- ‼ ההזרקה מחליפה את הפונקציה (create or replace) — ההרשאות שלה נשמרות,
-- אבל מאשרים שוב במפורש, כמו 94/197, שהיא פנימית בלבד.
revoke all on function public._tax_fact_field_op(text, text, boolean, jsonb, text) from public, anon, authenticated;
