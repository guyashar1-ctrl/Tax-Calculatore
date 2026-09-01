-- ─── 152: תיק מס חי (V6) — עובדות מס אישיות שחסרו ───────────────────────────
-- מקור: docs/TAX-FILE-V6-READINESS.md §C1-C3.
--
-- ‼ גבול המערכות (הכרעת גיא, 31.8): נתוני הנהלת חשבונות של העסק — מחזור,
-- הוצאות מוכרות, רווח/הפסד — שייכים לפייפרלס ו**אינם נוספים כאן**. השדות
-- שכן נוספים הם עובדות מס אישיות: ניכוי לפי סעיף 47 (הפקדות עצמאי), הוצאות
-- על נכס מושכר, הכנסה מחו"ל, ימי מילואים, וקריפטו. אלה אינם תנועות בספרי
-- העסק — הם נכנסים לדוח כניכוי/הכנסה של הנישום.
--
-- ‼ business_data_status הוא **סימון ידני שמרני בלבד** ולא ייבוא: הוא אומר
-- "האם נתוני ההנהלה בידינו", לא כמה הם. ברירת המחדל (NULL) נקראת כ"נגזר
-- משלב data_verification בקליטה". אין כאן העמדת פנים שקיימת אינטגרציה.

alter table public.clients
  add column if not exists other_income numeric,
  add column if not exists rental_expenses numeric,
  add column if not exists self_employed_pension_amount numeric,
  add column if not exists keren_hishtalmut_se numeric,
  add column if not exists foreign_tax_paid numeric,
  add column if not exists has_foreign_income boolean,
  add column if not exists foreign_income_annual numeric,
  add column if not exists reserve_combat_days_prev_year integer,
  add column if not exists has_crypto boolean,
  add column if not exists business_data_status text;

comment on column public.clients.self_employed_pension_amount is
  'הפקדת עצמאי לפנסיה/גמל — ניכוי אישי לפי סעיף 47. אינו נתון הנהלת חשבונות.';
comment on column public.clients.keren_hishtalmut_se is
  'הפקדת עצמאי לקרן השתלמות — ניכוי אישי. אינו נתון הנהלת חשבונות.';
comment on column public.clients.rental_expenses is
  'הוצאות על נכס מושכר (מסלול רגיל). הוצאה אישית, לא ספרי העסק.';
comment on column public.clients.reserve_combat_days_prev_year is
  'ימי מילואים כלוחם בשנה הקודמת — סעיף 39ב, מ-2026. מזין את creditPoints.ts.';
comment on column public.clients.has_crypto is
  'עוגן ידיעה לדומיין קריפטו. הפירוט חי ב-investment_accounts (זירה ישראלית) וב-foreign_accounts (חו״ל).';
comment on column public.clients.business_data_status is
  'סימון ידני שמרני: received / waiting / not_applicable. NULL = נגזר משלב data_verification.';

-- ── הרחבת ה-allowlist של העובדות המנוהלות ──
-- ‼ אותה טכניקת הזרקה טקסטואלית מאומתת של 146/151: הפונקציה ~20KB של ענפי
-- CASE, והגדרה מחדש ידנית מסכנת השמטה שקטה של ענף קיים. בלוק אחד, עוגן אחד,
-- אימות דו-כיווני (אורך + ספירת ענפים), ואידמפוטנטי.
do $do$
declare
  v_def text;
  v_new text;
  v_anchor constant text := E'    when ''withholdingRate'' then\n';
  v_block  constant text :=
    -- עובדות מס אישיות חדשות (V6)
    E'    when ''otherIncome'' then\n'
    '      select to_jsonb(other_income) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set other_income = (p_value #>> ''{}'')::numeric, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    '    when ''rentalExpenses'' then\n'
    '      select to_jsonb(rental_expenses) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set rental_expenses = (p_value #>> ''{}'')::numeric, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    '    when ''selfEmployedPensionAmount'' then\n'
    '      select to_jsonb(self_employed_pension_amount) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set self_employed_pension_amount = (p_value #>> ''{}'')::numeric, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    '    when ''krenHashtalmutSE'' then\n'
    '      select to_jsonb(keren_hishtalmut_se) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set keren_hishtalmut_se = (p_value #>> ''{}'')::numeric, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    '    when ''foreignTaxPaid'' then\n'
    '      select to_jsonb(foreign_tax_paid) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set foreign_tax_paid = (p_value #>> ''{}'')::numeric, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    '    when ''hasForeignIncome'' then\n'
    '      select to_jsonb(has_foreign_income) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set has_foreign_income = (p_value #>> ''{}'')::boolean, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    '    when ''foreignIncomeAnnual'' then\n'
    '      select to_jsonb(foreign_income_annual) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set foreign_income_annual = (p_value #>> ''{}'')::numeric, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    '    when ''reserveCombatDaysPrevYear'' then\n'
    '      select to_jsonb(reserve_combat_days_prev_year) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set reserve_combat_days_prev_year = (p_value #>> ''{}'')::integer, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    '    when ''hasCrypto'' then\n'
    '      select to_jsonb(has_crypto) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set has_crypto = (p_value #>> ''{}'')::boolean, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    '    when ''businessDataStatus'' then\n'
    '      select to_jsonb(business_data_status) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set business_data_status = p_value #>> ''{}'', field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    -- עוגני דומיין שהיו מחוץ ל-allowlist ולכן לא יכלו לשאת פרובננס
    '    when ''hasRentalIncome'' then\n'
    '      select to_jsonb(has_rental_income) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set has_rental_income = (p_value #>> ''{}'')::boolean, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    '    when ''hasKrenHashtalmut'' then\n'
    '      select to_jsonb(has_kren_hashtalmut) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set has_kren_hashtalmut = (p_value #>> ''{}'')::boolean, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    '    when ''hasDisabilityInsurance'' then\n'
    '      select to_jsonb(has_disability_insurance) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set has_disability_insurance = (p_value #>> ''{}'')::boolean, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    '    when ''hasMedicalInsurance'' then\n'
    '      select to_jsonb(has_medical_insurance) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set has_medical_insurance = (p_value #>> ''{}'')::boolean, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n';
  v_before int;
  v_after  int;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_tax_fact_field_op';

  if v_def is null then raise exception '152: _tax_fact_field_op לא נמצאה'; end if;

  if position('''hasCrypto''' in v_def) > 0 then
    raise notice '152: הענפים כבר קיימים, מדלג';
    return;
  end if;

  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '152: העוגן withholdingRate אינו יחיד';
  end if;

  v_before := (length(v_def) - length(replace(v_def, E'\n    when ''', ''))) / length(E'\n    when ''');
  v_new := replace(v_def, v_anchor, v_block || v_anchor);

  if length(v_new) <> length(v_def) + length(v_block) then
    raise exception '152: אורך לא תואם אחרי ההזרקה';
  end if;
  v_after := (length(v_new) - length(replace(v_new, E'\n    when ''', ''))) / length(E'\n    when ''');
  if v_after <> v_before + 14 then
    raise exception '152: נוספו % ענפים במקום 14', v_after - v_before;
  end if;

  execute v_new;
  raise notice '152: הוזרקו 14 ענפים (% סה"כ)', v_after;
end
$do$;

-- ── סשן שאלון: מתי העובדות שלו נקלטו לתיק ──
-- ‼ בלי החותמת הזו הקליטה הייתה רצה שוב בכל פתיחה של תיק המס. היא מסמנת
-- "הסשן הזה כבר תורגם לעובדות", ולכן היא על הסשן ולא על הלקוח.
alter table public.annual_report_sessions
  add column if not exists facts_synced_at timestamptz;

comment on column public.annual_report_sessions.facts_synced_at is
  'מתי תשובות הסשן תורגמו לעובדות מקצועיות בתיק. NULL = טרם נקלט.';
