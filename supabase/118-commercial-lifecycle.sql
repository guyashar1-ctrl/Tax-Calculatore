-- ─── 118: מחזור החיים המסחרי — כוונת ההצעה, חידוש עם תאריך תוקף, יתרה נגבית ──
--
-- שלוש יכולות, מודל מינימלי אחד:
--
-- 1. כוונה מפורשת על ההצעה (kind): 'engagement' משנה את ההסכם, 'one_time' מוכר
--    שירות לצד ההסכם הקיים. ‼ הכוונה נשמרת ולא נגזרת מקיום שורות חודשיות:
--    לקוח שיורד ל"דוח שנתי בלבד, בחיוב שנתי" שולח הצעת התקשרות בלי שורה
--    חודשית אחת — וגזירה הייתה מסווגת אותה כמכירה חד־פעמית ומשאירה את
--    הריטיינר הישן בתוקף. טעות כספית שקטה.
--
-- 2. חידוש עם תאריך: אישור הצעת התקשרות ללקוח שכבר יש לו הסכם יוצר התקשרות
--    'scheduled' עם effective_from ו-supersedes_engagement_id. ההסכם הנוכחי
--    נשאר נוכחי עד התאריך. במועד — הישן ל-'ended', החדש ל-'active'.
--    ‼ החלפה מסחרית לא ממתינה לקליטה: שלבי קליטה פתוחים עוברים להתקשרות
--    החדשה כדי שלא ייעלמו מהמסך (המסך מסנן לפי ההתקשרות הנוכחית).
--
-- 3. יתרה נדחית (דוח שנתי שנגבה חלקית בריטיינר) הופכת ל-additional_charges
--    אמיתי עם due_trigger במקום תאריך מדומה. אותו מנגנון ואותו מפתח ייחודיות
--    של החיובים החד־פעמיים — ולכן אישור חוזר לא מכפיל כסף.
--    create_deferred_collection_tasks נשארת ללא קורא בכוונה: אותו כסף בשני
--    מקומות הוא שני מקורות אמת.
--
-- ‼ תאימות לאחור: kind ברירת מחדל 'engagement', ולכן כל הצעה קיימת מתנהגת
-- בדיוק כמו היום. אפליקציה ישנה מול הסכימה החדשה ממשיכה לעבוד.

-- ── 1. סכימה — תוספות בלבד ──────────────────────────────────────────────────

alter table public.quotations
  add column if not exists kind text not null default 'engagement',
  add column if not exists effective_from date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quotations_kind_check') then
    alter table public.quotations
      add constraint quotations_kind_check check (kind in ('engagement','one_time'));
  end if;
end $$;

alter table public.engagements
  add column if not exists effective_from date,
  add column if not exists supersedes_engagement_id text references public.engagements(id);

-- 'scheduled' = אושרה, טרם נכנסה לתוקף. מכוון שלא נבחר 'onboarding' כאן:
-- derive_lifecycle_stage מסווג לקוח עם התקשרות 'onboarding' כ"בקליטה", וחידוש
-- היה מחזיר לקוח פעיל למצב קליטה. 'scheduled' אינרטי שם — ולכן בטוח.
alter table public.engagements drop constraint if exists engagements_status_check;
alter table public.engagements add constraint engagements_status_check
  check (status in ('onboarding','active','ended','cancelled','scheduled'));

alter table public.additional_charges
  add column if not exists due_trigger text;

comment on column public.quotations.kind is
  'engagement = יוצרת/משנה את ההסכם; one_time = מכירה לצד ההסכם הקיים.';
comment on column public.engagements.effective_from is
  'מתי ההתקשרות נעשית הנוכחית. "נוכחית" נגזרת מהתאריך ולא מסדר שורות.';
comment on column public.additional_charges.due_trigger is
  'תנאי עסקי במקום תאריך ("עם הגשת הדוח השנתי"). due_date נשאר ריק במקרה הזה.';

-- ── 2. מילוי לאחור ──────────────────────────────────────────────────────────

update public.engagements
   set effective_from = coalesce(
         nullif(billing_start_month, '') || '-01',
         to_char(created_at, 'YYYY-MM-DD')
       )::date
 where effective_from is null;

alter table public.engagements alter column effective_from set default current_date;
alter table public.engagements alter column effective_from set not null;

-- ── 3. אילוצים שמונעים מצב דו־משמעי ────────────────────────────────────────
-- ‼ נוצרים אחרי המילוי. הם ייכשלו אם ללקוח כלשהו כבר יש שתי התקשרויות
-- נוכחיות — וזו בדיוק הבדיקה שאנחנו רוצים שתעצור את המיגרציה.

create unique index if not exists engagements_one_current_uidx
  on public.engagements (client_id) where status in ('onboarding','active');

create unique index if not exists engagements_one_scheduled_uidx
  on public.engagements (client_id) where status = 'scheduled';

create index if not exists engagements_due_idx
  on public.engagements (effective_from) where status = 'scheduled';

-- ── 4. ההתקשרות הנוכחית — הגדרה אחת, בשרת ובלקוח ───────────────────────────

create or replace function public.current_engagement_id(p_client_id text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select e.id
    from public.engagements e
   where e.client_id = p_client_id
     and e.status in ('onboarding','active')
     and e.effective_from <= current_date
   order by e.effective_from desc, e.created_at desc
   limit 1;
$function$;

-- ── 5. מעבר התקשרויות שהגיע מועדן ──────────────────────────────────────────
-- אידמפוטנטית: הרצה חוזרת לא עושה כלום. התצוגה לא תלויה בה — היא נגזרת
-- מתאריכים — ולכן איחור בהרצה הוא ליקוי פנימי ולא טעות כספית על המסך.

create or replace function public.apply_due_engagement_transitions()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record; n int := 0;
begin
  for r in
    select e.id, e.client_id, e.user_id, e.supersedes_engagement_id
      from public.engagements e
     where e.status = 'scheduled'
       and e.effective_from <= current_date
     order by e.effective_from, e.created_at
  loop
    -- הישנה נסגרת ראשונה: אילוץ "התקשרות נוכחית אחת ללקוח" נבדק לכל משפט.
    update public.engagements
       set status = 'ended', ended_at = now(), updated_at = now()
     where client_id = r.client_id
       and status in ('onboarding','active')
       and id <> r.id;

    -- עבודת קליטה שלא הסתיימה עוברת להתקשרות החדשה. בלי זה היא נשארת תלויה
    -- בהתקשרות שהסתיימה ונעלמת מהמסך, שמסנן לפי ההתקשרות הנוכחית.
    if r.supersedes_engagement_id is not null then
      update public.onboarding_steps
         set engagement_id = r.id, updated_at = now()
       where engagement_id = r.supersedes_engagement_id
         and coalesce(status, '') not in ('completed','verified','skipped','cancelled');
    end if;

    update public.engagements
       set status = 'active',
           activated_at = coalesce(activated_at, now()),
           updated_at = now()
     where id = r.id;

    perform public.log_onboarding_event(r.user_id, null, r.id, 'created', 'system',
      'ההתקשרות נכנסה לתוקף', jsonb_build_object('supersedes', r.supersedes_engagement_id));

    n := n + 1;
  end loop;
  return n;
end;
$function$;

-- ── 6. אישור הצעה — מודע לכוונה ────────────────────────────────────────────
-- נבנתה מההגדרה החיה בייצור (pg_get_functiondef, 2026-08-17). כל מה שהיה
-- נשמר: copy_lead_facts_to_client, חיובים חד־פעמיים, שלבי קליטה, שאלון,
-- יישור קו, log_onboarding_event, dry-run ומבנה ההחזרה.

create or replace function public.create_engagement_for_quotation(p_quotation_id text, p_dry_run boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  q          public.quotations%rowtype;
  v_items    jsonb;
  v_monthly  numeric;
  v_start    text;
  v_eng_id   text;
  v_existing text;
  v_steps    jsonb;
  v_kind     text;
  v_current  text;
  v_eff      date;
  it         jsonb;
  v_qty      numeric; v_disc numeric; v_total numeric; v_inst int;
  v_per      numeric; v_incl numeric; v_balance numeric; v_off numeric; v_final numeric;
  v_label    text; v_trigger text;
begin
  select * into q from public.quotations where id = p_quotation_id;
  if q.id is null then return jsonb_build_object('ok', false, 'error', 'quotation_not_found'); end if;
  if q.status <> 'approved' then return jsonb_build_object('ok', false, 'error', 'not_approved'); end if;
  if q.client_id is null then return jsonb_build_object('ok', false, 'error', 'no_client'); end if;

  v_items := coalesce(q.snapshot->'items', q.items, '[]'::jsonb);
  v_kind  := coalesce(nullif(q.kind, ''), 'engagement');
  v_current := public.current_engagement_id(q.client_id);

  -- ‼ רשת ביטחון: 'one_time' ללא הסכם קיים אינו מצב חוקי — הוא היה משאיר
  -- לקוח בלי התקשרות ובלי קליטה. במקרה כזה מתייחסים אליו כהתקשרות ראשונה.
  if v_kind = 'one_time' and v_current is null then
    v_kind := 'engagement';
  end if;

  if not p_dry_run then
    perform public.copy_lead_facts_to_client(q.id);

    -- חיובים חד־פעמיים (ללא שינוי מההגדרה הקיימת)
    insert into public.additional_charges (
      user_id, client_id, description, amount, status,
      source_type, source_quotation_id, source_item_id
    )
    select
      q.user_id, q.client_id,
      coalesce(nullif(it2->>'name', ''), 'חיוב מהצעת מחיר'),
      (coalesce((it2->>'clientPrice')::numeric, 0))
        * (coalesce((it2->>'quantity')::numeric, 1))
        * (1 - coalesce((it2->>'discountPercent')::numeric, 0) / 100.0),
      'pending', 'quotation', q.id, it2->>'id'
    from jsonb_array_elements(v_items) it2
    where coalesce(it2->>'category', '') = 'one_time'
      and it2->>'id' is not null
      and (coalesce((it2->>'clientPrice')::numeric, 0))
            * (coalesce((it2->>'quantity')::numeric, 1))
            * (1 - coalesce((it2->>'discountPercent')::numeric, 0) / 100.0) > 0
    on conflict (source_quotation_id, source_item_id) where source_quotation_id is not null
    do nothing;

    -- יתרה נדחית → חיוב אמיתי. אותו חשבון של create_deferred_collection_tasks.
    -- ה-source_item_id הוא של השורה החודשית, ולכן לעולם לא מתנגש עם חד־פעמי,
    -- והמפתח הייחודי הקיים נותן אידמפוטנטיות בחינם.
    for it in select * from jsonb_array_elements(v_items) loop
      continue when coalesce(it->>'prorationMode', '') <> 'deferred';
      continue when it->>'id' is null;

      v_qty   := coalesce((it->>'quantity')::numeric, 1);
      v_disc  := 1 - coalesce((it->>'discountPercent')::numeric, 0) / 100.0;
      v_total := round(coalesce((it->>'annualPrice')::numeric, 0) * v_qty * v_disc, 2);
      v_inst  := greatest(1, least(60, coalesce((it->>'installments')::int, 12)));
      v_per   := round(coalesce((it->>'clientPrice')::numeric, 0) * v_qty * v_disc, 2);
      v_incl  := round(v_per * v_inst, 2);
      v_balance := greatest(0, round(v_total - v_incl, 2));

      if (it->>'deferredChargeAmount') is not null then
        v_final := least(greatest(0, (it->>'deferredChargeAmount')::numeric), v_balance);
      else
        v_off   := least(greatest(0, coalesce((it->>'deferredDiscount')::numeric, 0)), v_balance);
        v_final := round(v_balance - v_off, 2);
      end if;

      continue when v_final <= 0;

      v_label := coalesce(nullif(trim(it->>'name'), ''), 'שירות');
      if nullif(it->>'year', '') is not null then v_label := v_label || ' ' || (it->>'year'); end if;
      v_trigger := coalesce(nullif(trim(it->>'deferredTrigger'), ''), 'עם הגשת הדוח השנתי');

      insert into public.additional_charges (
        user_id, client_id, description, amount, status,
        source_type, source_quotation_id, source_item_id, due_trigger
      )
      values (q.user_id, q.client_id, 'השלמה ל' || v_label, v_final, 'pending',
              'quotation', q.id, it->>'id', v_trigger)
      on conflict (source_quotation_id, source_item_id) where source_quotation_id is not null
      do nothing;
    end loop;
  end if;

  -- מכירה חד־פעמית: חיובים בלבד. אין התקשרות, אין קליטה, הריטיינר לא זז.
  if v_kind = 'one_time' then
    return jsonb_build_object('ok', true, 'kind', 'one_time',
      'engagementId', null, 'chargesOnly', true);
  end if;

  -- כניסה חוזרת על אותה הצעה
  select id into v_existing from public.engagements where quotation_id = q.id;
  if v_existing is not null then
    if (select status from public.engagements where id = v_existing) = 'onboarding' then
      v_steps := public.generate_onboarding_steps(v_existing, p_dry_run);
      if not p_dry_run then
        perform public.add_intake_questionnaire_step(v_existing);
        perform public.ensure_institution_alignment_steps(q.client_id, v_existing, true);
      end if;
    end if;
    return jsonb_build_object('ok', true, 'engagementId', v_existing, 'existed', true, 'steps', v_steps);
  end if;

  select
    sum( (coalesce((it2->>'clientPrice')::numeric, 0))
       * (coalesce((it2->>'quantity')::numeric, 1))
       * (1 - coalesce((it2->>'discountPercent')::numeric, 0) / 100.0) ),
    min(nullif(it2->>'billingStartMonth', ''))
  into v_monthly, v_start
  from jsonb_array_elements(v_items) it2
  where coalesce(it2->>'category','') = 'monthly';

  if p_dry_run then
    return jsonb_build_object('ok', true, 'dryRun', true, 'wouldCreate', true,
      'clientId', q.client_id, 'monthlyTotal', v_monthly, 'billingStartMonth', v_start,
      'kind', v_kind, 'isRenewal', v_current is not null);
  end if;

  v_eff := coalesce(
    q.effective_from,
    (nullif(v_start, '') || '-01')::date,
    current_date);

  -- ── התקשרות ראשונה: בדיוק ההתנהגות הקיימת ──
  if v_current is null then
    insert into public.engagements (user_id, client_id, quotation_id, status,
                                    monthly_total, billing_start_month, approved_at, effective_from)
    values (q.user_id, q.client_id, q.id, 'onboarding',
            v_monthly, v_start, coalesce(q.approved_at, now()), v_eff)
    on conflict (quotation_id) do nothing
    returning id into v_eng_id;

    if v_eng_id is null then
      select id into v_eng_id from public.engagements where quotation_id = q.id;
      v_steps := public.generate_onboarding_steps(v_eng_id, false);
      perform public.add_intake_questionnaire_step(v_eng_id);
      perform public.ensure_institution_alignment_steps(q.client_id, v_eng_id, true);
      return jsonb_build_object('ok', true, 'engagementId', v_eng_id, 'existed', true, 'steps', v_steps);
    end if;

    perform public.log_onboarding_event(q.user_id, null, v_eng_id, 'created', 'system',
      'ההתקשרות נפתחה מאישור הצעה ' || coalesce(q.quotation_number, q.id),
      jsonb_build_object('quotationId', q.id));

    v_steps := public.generate_onboarding_steps(v_eng_id, false);
    perform public.add_intake_questionnaire_step(v_eng_id);
    perform public.ensure_institution_alignment_steps(q.client_id, v_eng_id, true);

    return jsonb_build_object('ok', true, 'engagementId', v_eng_id, 'existed', false, 'steps', v_steps);
  end if;

  -- ── חידוש: התקשרות עתידית, בלי קליטה חדשה ──
  -- חידוש מאוחר יותר גובר על חידוש שאושר קודם ועדיין לא נכנס לתוקף.
  update public.engagements
     set status = 'cancelled', updated_at = now()
   where client_id = q.client_id and status = 'scheduled';

  insert into public.engagements (user_id, client_id, quotation_id, status,
                                  monthly_total, billing_start_month, approved_at,
                                  effective_from, supersedes_engagement_id)
  values (q.user_id, q.client_id, q.id, 'scheduled',
          v_monthly, v_start, coalesce(q.approved_at, now()), v_eff, v_current)
  on conflict (quotation_id) do nothing
  returning id into v_eng_id;

  if v_eng_id is null then
    select id into v_eng_id from public.engagements where quotation_id = q.id;
    return jsonb_build_object('ok', true, 'engagementId', v_eng_id, 'existed', true, 'renewal', true);
  end if;

  perform public.log_onboarding_event(q.user_id, null, v_eng_id, 'created', 'system',
    'עדכון התקשרות אושר מהצעה ' || coalesce(q.quotation_number, q.id) ||
    ' — בתוקף מ-' || to_char(v_eff, 'MM/YYYY'),
    jsonb_build_object('quotationId', q.id, 'supersedes', v_current));

  -- תאריך התוקף כבר הגיע (חידוש "מהחודש הזה") — נכנס לתוקף מיד.
  perform public.apply_due_engagement_transitions();

  return jsonb_build_object('ok', true, 'engagementId', v_eng_id, 'existed', false,
    'renewal', true, 'effectiveFrom', v_eff);
end;
$function$;

-- ── 7. ביטול הצעה ──────────────────────────────────────────────────────────
-- טריגר ולא קוד אפליקציה: הביטול נעשה היום כעדכון שורה ישיר מהדפדפן
-- (useQuotations.ts), ולכן אין נקודת שרת אחת לתלות בה.

create or replace function public.tg_quotation_cancelled()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'cancelled' and coalesce(old.status, '') <> 'cancelled' then
    -- רק התקשרות שטרם נכנסה לתוקף. הסכם פעיל לא מבוטל בעקבות ביטול הצעה.
    update public.engagements
       set status = 'cancelled', updated_at = now()
     where quotation_id = new.id and status = 'scheduled';

    -- חיוב שנוצר אוטומטית, טרם נדרש וטרם שולם — אין מה לגבות על הסכם שבוטל.
    delete from public.additional_charges
     where source_quotation_id = new.id
       and source_type = 'quotation'
       and status = 'pending';
  end if;
  return new;
end;
$function$;

drop trigger if exists quotation_cancelled_trg on public.quotations;
create trigger quotation_cancelled_trg
  after update of status on public.quotations
  for each row execute function public.tg_quotation_cancelled();

grant execute on function public.current_engagement_id(text) to authenticated, service_role;
grant execute on function public.apply_due_engagement_transitions() to authenticated, service_role;
