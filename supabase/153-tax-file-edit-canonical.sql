-- ─── 153: חוויית העריכה המלאה — הכרעת שבע כפילויות מקור-האמת ────────────────
-- מקור: docs/PLAN-TAX-FILE-EDIT.md §1 + §6, ו-docs/prototypes/tax-file-edit-v1.html.
--
-- ‼ המיגרציה הזו נכתבה אחרי ספירה בפועל בפרודקשן (21 לקוחות):
--     has_capital_income=true .............. 1   (ויש לו field_meta)
--     has_investments=true ................. 0
--     investment_accounts לא ריק ........... 0
--     has_exempt_from_withholding=true ..... 1
--     withholding_status מוגדר ............. 0
--     kren_hashtalmut_monthly>0 ............ 3
--     keren_hishtalmut_se>0 ................ 0
--     foreign_tax_paid כלשהו ............... 0
--   כלומר בכל אחת מארבע ההכרעות יש **צד אחד בלבד** שמחזיק מידע, ולכן ההעברה
--   אינה מכריעה בין שני ערכים סותרים — היא מעתיקה את הערך היחיד לעמודה
--   הקנונית. אין מקרה דו-משמעי, ולכן אין מה לעצור עליו.

-- ═══════════════════════════════════════════════════════════════════════════
-- א · הכרעה 5 — «בן/בת זוג ללא הכנסה» הופך לעובדה של התיק
-- ═══════════════════════════════════════════════════════════════════════════
-- ‼ NULL = לא ידוע, ולא «לא זכאי». אסור לגזור אותו מ-spouse_working=false:
--   סעיף 37 דורש גם שאחד מבני הזוג הגיע לגיל פרישה או עיוור/נכה. יש בייצור
--   6 נשואים עם spouse_working=false — גזירה אוטומטית הייתה ממציאה להם זכאות.
alter table public.clients
  add column if not exists spouse_no_income_eligible boolean;

comment on column public.clients.spouse_no_income_eligible is
  'זכאות לנקודה בגין בן/בת זוג ללא הכנסה (סעיף 37). NULL = טרם נקבע. אינו נגזר מ-spouse_working.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ב · הכרעות 1, 2, 4 — העברת הערך היחיד לעמודה הקנונית, עם הפרובננס
-- ═══════════════════════════════════════════════════════════════════════════
do $mig$
declare
  v_cap int; v_wh int; v_kh int;
begin
  -- ── 1 · שוק ההון: has_investments הוא עוגן הידיעה ──────────────────────
  -- ‼ field_meta מועתק יחד עם הערך. בלעדיו הלקוח היחיד שכן נשאל היה חוזר
  --   למצב «טרם ביררנו» — כלומר האיחוד היה *מוחק* ידיעה קיימת.
  update public.clients
     set has_investments = true,
         field_meta = coalesce(field_meta, '{}'::jsonb)
           || jsonb_build_object('hasInvestments',
                coalesce(field_meta -> 'hasCapitalIncome',
                         jsonb_build_object('source','import','syncedAt', now())))
   where has_capital_income is true
     and has_investments is distinct from true;
  get diagnostics v_cap = row_count;

  -- ── 2 · ניכוי במקור: withholding_status הוא הקנוני ─────────────────────
  -- הצ'קבוקס הישן הוא המידע היחיד שקיים; הוא מתורגם למצב המקביל. אינו נמחק
  -- — הוא נשאר בעמודה לקריאה ולהיסטוריה, ורק יורד מהעריכה הראשית.
  update public.clients
     set withholding_status = 'exempt',
         field_meta = coalesce(field_meta, '{}'::jsonb)
           || jsonb_build_object('withholdingStatus',
                coalesce(field_meta -> 'hasExemptFromWithholding',
                         jsonb_build_object('source','import','syncedAt', now())))
   where has_exempt_from_withholding is true
     and withholding_status is null;
  get diagnostics v_wh = row_count;

  -- ── 4 · קרן השתלמות לעצמאי: הסכום השנתי הוא הקנוני ────────────────────
  update public.clients
     set keren_hishtalmut_se = round(kren_hashtalmut_monthly * 12),
         field_meta = coalesce(field_meta, '{}'::jsonb)
           || jsonb_build_object('krenHashtalmutSE',
                coalesce(field_meta -> 'krenHashtalmutMonthly',
                         jsonb_build_object('source','import','syncedAt', now())))
   where coalesce(kren_hashtalmut_monthly, 0) > 0
     and coalesce(keren_hishtalmut_se, 0) = 0;
  get diagnostics v_kh = row_count;

  raise notice '153: שוק ההון %, ניכוי במקור %, השתלמות %', v_cap, v_wh, v_kh;
end
$mig$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ג · הרחבת ה-allowlist — מה שהעורך החדש כותב
-- ═══════════════════════════════════════════════════════════════════════════
-- ‼ אותה טכניקת הזרקה מאומתת של 146/151/152: עוגן יחיד, אימות אורך, אימות
--   ספירת ענפים, ואידמפוטנטיות. הפונקציה ~24KB — הגדרה מחדש ידנית מסכנת
--   השמטה שקטה של ענף קיים.
-- ‼ למה זה נדרש: record_manual_fact_change מריץ כל מפתח דרך _tax_fact_field_op
--   וזורק unknown_field_key על מה שאינו ברשימה. בלי הענפים האלה, העריכה
--   החדשה הייתה חייבת לעקוף את מסלול הפרובננס — בדיוק מה שאסור (הכרעה 7).
do $do$
declare
  v_def text;
  v_new text;
  v_anchor constant text := E'    when ''hasCrypto'' then\n';
  v_block  constant text :=
    -- זכאות (סעיף 37) — הכרעה 5
    E'    when ''spouseNoIncomeEligible'' then\n'
    '      select to_jsonb(spouse_no_income_eligible) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set spouse_no_income_eligible = (p_value #>> ''{}'')::boolean, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    -- סכומי הכנסה שהעורך מזין
    '    when ''capitalGainsAnnual'' then\n'
    '      select to_jsonb(capital_gains_annual) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set capital_gains_annual = (p_value #>> ''{}'')::numeric, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    '    when ''dividendInterestAnnual'' then\n'
    '      select to_jsonb(dividend_interest_annual) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set dividend_interest_annual = (p_value #>> ''{}'')::numeric, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    '    when ''rentalIncomeAnnual'' then\n'
    '      select to_jsonb(rental_income_annual) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set rental_income_annual = (p_value #>> ''{}'')::numeric, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    '    when ''gamblingIncomeAnnual'' then\n'
    '      select to_jsonb(gambling_income_annual) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set gambling_income_annual = (p_value #>> ''{}'')::numeric, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    -- זכאות לנקודות זיכוי שלא היו ברשימה
    '    when ''qualifyingSettlementId'' then\n'
    '      select to_jsonb(qualifying_settlement_id) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set qualifying_settlement_id = p_value #>> ''{}'', field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    '    when ''academicDegreeType'' then\n'
    '      select to_jsonb(academic_degree_type) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set academic_degree_type = p_value #>> ''{}'', field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    -- רשימות שהעורך מנהל
    '    when ''properties'' then\n'
    '      select coalesce(properties, ''[]''::jsonb) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set properties = p_value, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    '    when ''foreignAccounts'' then\n'
    '      select coalesce(foreign_accounts, ''[]''::jsonb) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set foreign_accounts = p_value, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    -- ביטוחים ותיאור העסק
    '    when ''disabilityInsuranceAnnual'' then\n'
    '      select to_jsonb(disability_insurance_annual) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set disability_insurance_annual = (p_value #>> ''{}'')::numeric, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    '    when ''medicalInsuranceAnnual'' then\n'
    '      select to_jsonb(medical_insurance_annual) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set medical_insurance_annual = (p_value #>> ''{}'')::numeric, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    '    when ''businessDescription'' then\n'
    '      select to_jsonb(business_description) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set business_description = p_value #>> ''{}'', field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n';
  v_before int;
  v_after  int;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_tax_fact_field_op';

  if v_def is null then raise exception '153: _tax_fact_field_op לא נמצאה'; end if;

  if position('''spouseNoIncomeEligible''' in v_def) > 0 then
    raise notice '153: הענפים כבר קיימים, מדלג';
    return;
  end if;

  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '153: העוגן hasCrypto אינו יחיד — ודא ש-152 הוחלה';
  end if;

  v_before := (length(v_def) - length(replace(v_def, E'\n    when ''', ''))) / length(E'\n    when ''');
  v_new := replace(v_def, v_anchor, v_block || v_anchor);

  if length(v_new) <> length(v_def) + length(v_block) then
    raise exception '153: אורך לא תואם אחרי ההזרקה';
  end if;
  v_after := (length(v_new) - length(replace(v_new, E'\n    when ''', ''))) / length(E'\n    when ''');
  if v_after <> v_before + 12 then
    raise exception '153: נוספו % ענפים במקום 12', v_after - v_before;
  end if;

  execute v_new;
  raise notice '153: הוזרקו 12 ענפים (% סה"כ)', v_after;
end
$do$;
