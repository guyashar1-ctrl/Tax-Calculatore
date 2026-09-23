-- ─── 197: בסיס דמי הביטוח לתקופה, לכל אדם — עובדה נפרדת מההכנסה ─────────────
-- «עדכן נתונים מביטוח לאומי» (btl.sync_file) קורא מריכוז המידע של המבוטח
-- את השורה «דמי ביטוח: 2026 / 7-9 בסיס : עצמאי 47,583 … סכום : 2062».
--
-- ‼ 47,583 הוא **בסיס** — לרבעון, אחרי קידום ההכנסה לשנת הביטוח ואחרי ניכוי
-- 52% מדמי הביטוח הלאומי. הוא אינו ההכנסה המוצהרת (16,500 לחודש, שכבר נשמרת
-- ב-ni_income_basis_monthly מרשימת ההכנסות). עד היום לא היה לו מקום, ולכן
-- הוא נשמר כאן כעובדה נפרדת — כדי שאיש לא יכתוב אותו לשדה ההכנסה.
--
-- ‼ jsonb ולא ארבע עמודות: שנה, חודשים, בסיס ומקדמה הם **עובדה אחת** — ערך
-- שהפורטל מציג בשורה אחת. פיצול היה מאפשר אישור חלקי (בסיס של רבעון אחד עם
-- חודשים של אחר) — בדיוק ההפך מהנימוק של 154, שם כל עמודה היא עובדה נפרדת.
--
-- ‼ לכל אדם (154): ni_insurance_basis ללקוח, spouse_ni_insurance_basis לבן/בת
-- הזוג כשאין לו/ה כרטיס משלו/ה. אינם מוסקים זה מזה.
--
-- ‼ אותה טכניקת הזרקה בדיוק כמו 154 (ולא הגדרה מחדש של הפונקציה כולה):
-- אימות דו-כיווני של אורך ומספר ענפים. אידמפוטנטי: ריצה חוזרת מדלגת.
-- _governed_client_columns (182) נגזרת מגוף הפונקציה — ולכן שתי העמודות
-- נחסמות מכתיבה ישירה ב-update_client_fields בלי שינוי נוסף.

alter table public.clients
  add column if not exists ni_insurance_basis        jsonb,
  add column if not exists spouse_ni_insurance_basis jsonb;

comment on column public.clients.ni_insurance_basis is
  'בסיס דמי הביטוח לתקופה בביטוח לאומי (שנה, חודשים, בסיס, מקדמה). אינו הכנסה — ראה ni_income_basis_monthly.';
comment on column public.clients.spouse_ni_insurance_basis is
  'בסיס דמי הביטוח לתקופה של בן/בת הזוג — כשהוא/היא מיוצג/ת בנפרד. אינו מוסק מ-ni_insurance_basis.';

do $do$
declare
  v_def text;
  v_new text;
  v_anchor constant text := $anchor$    when 'vatBalance' then
$anchor$;
  v_branch constant text := $branch$    when 'niInsuranceBasis' then
      select to_jsonb(ni_insurance_basis) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set ni_insurance_basis = p_value, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'spouseNiInsuranceBasis' then
      select to_jsonb(spouse_ni_insurance_basis) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set spouse_ni_insurance_basis = p_value, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
$branch$;
  v_branches_before int;
  v_branches_after int;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_tax_fact_field_op';

  if v_def is null then
    raise exception '197: _tax_fact_field_op לא נמצאה';
  end if;

  if position('niInsuranceBasis' in v_def) > 0 then
    raise notice '197: הענפים כבר קיימים, מדלג';
    return;
  end if;

  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '197: העוגן vatBalance אינו יחיד — התיקון נעצר';
  end if;

  v_branches_before := (length(v_def) - length(replace(v_def, E'\n    when ''', ''))) / length(E'\n    when ''');
  v_new := replace(v_def, v_anchor, v_branch || v_anchor);

  if length(v_new) <> length(v_def) + length(v_branch) then
    raise exception '197: אורך לא תואם אחרי ההזרקה';
  end if;
  v_branches_after := (length(v_new) - length(replace(v_new, E'\n    when ''', ''))) / length(E'\n    when ''');
  if v_branches_after <> v_branches_before + 2 then
    raise exception '197: מספר הענפים השתנה ב-% במקום ב-2', v_branches_after - v_branches_before;
  end if;

  execute v_new;
  raise notice '197: הענפים הוזרקו (% ענפים)', v_branches_after;
end
$do$;

-- ‼ ההזרקה מחליפה את הפונקציה (create or replace) — ההרשאות שלה נשמרות,
-- אבל מאשרים שוב במפורש, כמו 94, שהיא פנימית בלבד.
revoke all on function public._tax_fact_field_op(text, text, boolean, jsonb, text) from public, anon, authenticated;
