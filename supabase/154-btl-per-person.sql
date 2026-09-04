-- ─── 154: ביטוח לאומי הופך לניתן ייצוג בנפרד לכל אדם — עמודות בן/בת הזוג ────
-- מקור: docs/PLAN-BTL-PER-PERSON.md §F. עד היום חמש עובדות הב"ל התפעוליות
-- (עיסוקים, בסיס למקדמות, מקדמה חודשית, יתרה, הרשאה לחיוב) היו סינגלטון
-- ברמת הכרטיס. לזוג נשוי שבו שני בני הזוג מיוצגים בב"ל אין איפה לשמור את
-- הנתונים של בן/בת הזוג בנפרד — בדיוק כמו שמספר התיק כבר נשמר לפי owner
-- ב-taxFiles, חסרה אותה הבחנה לחמשת השדות האלה.
--
-- ‼ הערכים הקיימים (ni_balance וכו') ממשיכים לייצג את הלקוח הראשי — קריאת
-- תאימות, לא מיגרציית נתונים. אין בייצור אף ערך ב"ל שהושג עבור בן/בת זוג
-- (נבדק לפני הכתיבה: 22 לקוחות, אף אחד עם spouse_client_id, אף נתון ב"ל
-- אמיתי על לקוח נשוי). ראה docs/PLAN-BTL-PER-PERSON.md §D/§A5.
--
-- ‼ חמישה עמודות סקלריות נפרדות, לא בלוב אחד: אישור מקובץ עם כמה שדות
-- ששונו יוצר כמה הצעות, וכל אחת נבדקת מול stale_conflict בנפרד. בלוב אחד
-- היה הופך את הבדיקה השנייה לכישלון שגוי ברגע שהראשונה נכתבה. אותו טיעון
-- בדיוק כמו כל שאר העובדות המנוהלות בקובץ הזה.
--
-- ‼ הענפים מוזרקים ל-_tax_fact_field_op בתיקון טקסטואלי ולא בהגדרה מחדש של
-- כל הפונקציה — אותה טכניקה בדיוק כמו 146/151: העתקה ידנית של פונקציה בת
-- כ-20KB מסכנת השמטה שקטה של ענף קיים. האימות דו-כיווני: האורך גדל בדיוק
-- בגודל התוספת, ומספר הענפים גדל בדיוק בחמש.
-- ‼ אידמפוטנטי: ריצה חוזרת מדלגת.

alter table public.clients
  add column if not exists spouse_ni_occupations          jsonb,
  add column if not exists spouse_ni_income_basis_monthly numeric,
  add column if not exists spouse_ni_advance_monthly      numeric,
  add column if not exists spouse_ni_balance               numeric,
  add column if not exists spouse_ni_debit_authorization  boolean;

comment on column public.clients.spouse_ni_occupations is
  'עיסוקים בביטוח לאומי של בן/בת הזוג — כשהוא/היא מיוצג/ת בנפרד. אינו מוסק מ-ni_occupations.';
comment on column public.clients.spouse_ni_income_basis_monthly is
  'בסיס הכנסה למקדמות בביטוח לאומי של בן/בת הזוג, לחודש.';
comment on column public.clients.spouse_ni_advance_monthly is
  'מקדמה חודשית בביטוח לאומי של בן/בת הזוג.';
comment on column public.clients.spouse_ni_balance is
  'יתרה בביטוח לאומי של בן/בת הזוג. אותה מוסכמת סימנים כמו ni_balance: חיובי=חוב, שלילי=זכות.';
comment on column public.clients.spouse_ni_debit_authorization is
  'הרשאת חיוב חשבון בביטוח לאומי של בן/בת הזוג.';

do $do$
declare
  v_def text;
  v_new text;
  -- ‼ ציטוט דולר, לא שרשור מחרוזות E''/'' צמודות: שרשור צמוד עם כמה קידומות
  -- E נפרדות באותה ביטוי נתקל בשגיאת תחביר בפועל (נבדק). דולר-קוטציה נותנת
  -- שורות אמיתיות בלי לברוח אף תו, ובלי הכפלת גרשיים בודדים.
  v_anchor constant text := $anchor$    when 'vatBalance' then
$anchor$;
  v_branch constant text := $branch$    when 'spouseNiOccupations' then
      select to_jsonb(spouse_ni_occupations) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set spouse_ni_occupations = p_value, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'spouseNiIncomeBasisMonthly' then
      select to_jsonb(spouse_ni_income_basis_monthly) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set spouse_ni_income_basis_monthly = (p_value #>> '{}')::numeric, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'spouseNiAdvanceMonthly' then
      select to_jsonb(spouse_ni_advance_monthly) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set spouse_ni_advance_monthly = (p_value #>> '{}')::numeric, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'spouseNiBalance' then
      select to_jsonb(spouse_ni_balance) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set spouse_ni_balance = (p_value #>> '{}')::numeric, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'spouseNiDebitAuthorization' then
      select to_jsonb(spouse_ni_debit_authorization) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set spouse_ni_debit_authorization = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
$branch$;
  v_branches_before int;
  v_branches_after int;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_tax_fact_field_op';

  if v_def is null then
    raise exception '154: _tax_fact_field_op לא נמצאה';
  end if;

  -- כבר הוחל — לא נוגעים
  if position('spouseNiOccupations' in v_def) > 0 then
    raise notice '154: הענפים כבר קיימים, מדלג';
    return;
  end if;

  -- העוגן חייב להופיע בדיוק פעם אחת
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '154: העוגן vatBalance אינו יחיד — התיקון נעצר';
  end if;

  v_branches_before := (length(v_def) - length(replace(v_def, E'\n    when ''', ''))) / length(E'\n    when ''');

  v_new := replace(v_def, v_anchor, v_branch || v_anchor);

  -- אימות דו-כיווני: האורך גדל בדיוק בתוספת, ומספר הענפים גדל בדיוק בחמש
  if length(v_new) <> length(v_def) + length(v_branch) then
    raise exception '154: אורך לא תואם אחרי ההזרקה';
  end if;
  v_branches_after := (length(v_new) - length(replace(v_new, E'\n    when ''', ''))) / length(E'\n    when ''');
  if v_branches_after <> v_branches_before + 5 then
    raise exception '154: מספר הענפים השתנה ב-% במקום ב-5', v_branches_after - v_branches_before;
  end if;

  execute v_new;
  raise notice '154: הענפים הוזרקו (% ענפים)', v_branches_after;
end
$do$;
