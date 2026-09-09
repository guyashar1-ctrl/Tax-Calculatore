-- ═══════════════════════════════════════════════════════════════════════════
--  163 — P0-B (המשך) · מסלול הקליטה נוצר גם כשהלקוח מאשר בעצמו
-- ═══════════════════════════════════════════════════════════════════════════
--  ‼ איך זה נמצא: הבדיקות הקיימות "מאשרות כמו לקוח" דרך לקוח supabase-js
--  שקודם לכן הריץ signInWithPassword — ולכן הן שולחות JWT של הרו"ח. בדיקה
--  עם לקוח anon אמיתי, שמעולם לא התחבר (בדיוק מה שהדפדפן של הלקוח שולח),
--  מגלה תמונה אחרת:
--
--     אישור ע"י רו"ח מחובר   ⇒ 12 שלבים, כולל 3 יישורי קו + שיחת פתיחה
--     אישור ע"י לקוח אמיתי    ⇒  8 שלבים, בלי אף אחד מהם
--
--  ‼ הסיבה: ensure_institution_alignment_steps פותחת ב-
--        if v_uid is null then return ... 'unauthenticated'
--  וללקוח שמאשר מקישור במייל אין auth.uid(). היא יוצאת מיד, והקריאה אליה
--  בתוך create_engagement_for_quotation היא `perform` — הערך המוחזר נזרק.
--  כך שכל לקוח אמיתי שאישר הצעה קיבל מסלול קליטה חסר, בשקט, מאז ומתמיד.
--
--  ‼ זה בדיוק הדפוס שמיגרציה 161 באה לחסל, רק שכבה אחת פנימה: פעולה מצליחה,
--  אחת מכתיבות המשנה נכשלת, הכישלון נזרק, והמשתמש רואה הצלחה.
--
--  ── התיקון ────────────────────────────────────────────────────────────────
--  ① הבעלים נגזר מהלקוח, לא מהסשן — בדיוק כמו באחות שלה,
--     add_intake_questionnaire_step, שנוטלת את user_id מה-engagement ולכן
--     תמיד עבדה. בדיקת הבעלות נשמרת ומתהדקת: כשיש משתמש מחובר הוא חייב
--     להיות הבעלים. כשאין (מסלול מערכת/אישור ציבורי) — ההרשאה כבר נאכפת
--     בשכבת ה-GRANT, שכן anon אינו יכול לקרוא לפונקציה הזו כלל (מיגרציה 160).
--  ② שתי הקריאות שבונות את מבנה המסע נבדקות במקום להיזרק.
--
--  ‼ copy_lead_facts_to_client נשארת מחוץ לגבול ההצלחה במכוון: היא העשרת
--  נתונים (העתקת עובדות מהליד), ולא מבנה. כישלון שלה אינו הופך את המסע
--  לחסר, ולחסום אישור בגללה היה מחמיר בלי להגן על שום דבר.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① יישור קו: עובד גם בהקשר מערכת ────────────────────────────────────────
create or replace function public.ensure_institution_alignment_steps(
  p_client_id text, p_engagement_id text default null, p_include_opening_call boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_stage_id text;
  v_btl_id text;
  v_vat_id text;
  v_income_id text;
  v_call_id text;
  v_created int := 0;
begin
  -- ‼ הבעלים מהלקוח, לא מהסשן. זה מה שמאפשר לאישור ציבורי לבנות את המסע.
  select user_id into v_owner from public.clients where id = p_client_id;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;

  -- משתמש מחובר רשאי רק על לקוח שלו. בלי משתמש — מסלול מערכת, וההרשאה
  -- להריץ את הפונקציה כבר מוגבלת ל-authenticated/service_role (מיגרציה 160).
  if v_uid is not null and v_owner <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- ההתקשרות חייבת להיות של אותו בעלים ושל אותו לקוח — אחרת אפשר להטביע
  -- בשלבים שלי מזהה התקשרות של אחר ולחסום לו את סגירת הקליטה.
  if p_engagement_id is not null
     and not exists (select 1 from public.engagements e
                      where e.id = p_engagement_id
                        and e.user_id = v_owner
                        and e.client_id = p_client_id) then
    return jsonb_build_object('ok', false, 'error', 'engagement_not_found');
  end if;

  select id into v_stage_id from public.journey_stages
   where client_id = p_client_id and title = 'יישור קו מול הרשויות' limit 1;
  if v_stage_id is null then
    insert into public.journey_stages (user_id, client_id, engagement_id, title, sort_order)
    values (v_owner, p_client_id, p_engagement_id, 'יישור קו מול הרשויות', 5)
    returning id into v_stage_id;
  end if;

  select id into v_btl_id from public.onboarding_steps
   where client_id = p_client_id and step_type = 'institution_alignment_btl' and status <> 'cancelled' limit 1;
  if v_btl_id is null then
    insert into public.onboarding_steps
      (user_id, engagement_id, client_id, step_type, track, scope, status, ball, stage_id, required_for_close, payload)
    values
      (v_owner, p_engagement_id, p_client_id, 'institution_alignment_btl', 'authorities', 'person', 'pending', 'me',
       v_stage_id, false, jsonb_build_object('institution', 'btl'))
    returning id into v_btl_id;
    v_created := v_created + 1;
  end if;

  select id into v_vat_id from public.onboarding_steps
   where client_id = p_client_id and step_type = 'institution_alignment_vat' and status <> 'cancelled' limit 1;
  if v_vat_id is null then
    insert into public.onboarding_steps
      (user_id, engagement_id, client_id, step_type, track, scope, status, ball, stage_id, required_for_close, payload)
    values
      (v_owner, p_engagement_id, p_client_id, 'institution_alignment_vat', 'authorities', 'person', 'pending', 'me',
       v_stage_id, false, jsonb_build_object('institution', 'vat'))
    returning id into v_vat_id;
    v_created := v_created + 1;
  end if;

  select id into v_income_id from public.onboarding_steps
   where client_id = p_client_id and step_type = 'institution_alignment_income' and status <> 'cancelled' limit 1;
  if v_income_id is null then
    insert into public.onboarding_steps
      (user_id, engagement_id, client_id, step_type, track, scope, status, ball, stage_id, required_for_close, payload)
    values
      (v_owner, p_engagement_id, p_client_id, 'institution_alignment_income', 'authorities', 'person', 'pending', 'me',
       v_stage_id, false, jsonb_build_object('institution', 'income'))
    returning id into v_income_id;
    v_created := v_created + 1;
  end if;

  if p_include_opening_call then
    select id into v_call_id from public.onboarding_steps
     where client_id = p_client_id and step_type = 'opening_call' and status <> 'cancelled' limit 1;
    if v_call_id is null then
      insert into public.onboarding_steps
        (user_id, engagement_id, client_id, step_type, track, scope, status, ball, required_for_close, payload)
      values
        (v_owner, p_engagement_id, p_client_id, 'opening_call', 'review', 'person', 'locked', 'me',
         false, jsonb_build_object('clarifications', '[]'::jsonb))
      returning id into v_call_id;
      v_created := v_created + 1;
      insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id)
      values (v_call_id, v_btl_id, v_owner), (v_call_id, v_vat_id, v_owner), (v_call_id, v_income_id, v_owner)
      on conflict do nothing;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true, 'created', v_created, 'stageId', v_stage_id,
    'btlStepId', v_btl_id, 'vatStepId', v_vat_id, 'incomeStepId', v_income_id, 'openingCallStepId', v_call_id
  );
end;
$function$;

comment on function public.ensure_institution_alignment_steps(text, text, boolean) is
  'יוצרת את שלושת שלבי יישור הקו (ואת שיחת הפתיחה). הבעלים נגזר מהלקוח כדי שגם אישור הצעה ע"י הלקוח עצמו יבנה את המסע המלא — ראה מיגרציה 163. בעלות נאכפת כשיש משתמש מחובר, וההתקשרות חייבת להיות של אותו לקוח.';

revoke execute on function public.ensure_institution_alignment_steps(text, text, boolean) from public, anon;
grant execute on function public.ensure_institution_alignment_steps(text, text, boolean) to authenticated, service_role;

-- ── ② יצירת ההתקשרות: כתיבות המשנה נבדקות ולא נזרקות ───────────────────────
create or replace function public.create_engagement_for_quotation(
  p_quotation_id text, p_dry_run boolean default false
)
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
  v_sub      jsonb;
begin
  select * into q from public.quotations where id = p_quotation_id;
  if q.id is null then return jsonb_build_object('ok', false, 'error', 'quotation_not_found'); end if;
  if q.status <> 'approved' then return jsonb_build_object('ok', false, 'error', 'not_approved'); end if;
  if q.client_id is null then return jsonb_build_object('ok', false, 'error', 'no_client'); end if;

  v_items := coalesce(q.snapshot->'items', q.items, '[]'::jsonb);
  v_kind  := coalesce(nullif(q.kind, ''), 'engagement');
  v_current := public.current_engagement_id(q.client_id);

  if v_kind = 'one_time' and v_current is null then
    v_kind := 'engagement';
  end if;

  if not p_dry_run then
    -- ‼ העשרת נתונים בלבד — מחוץ לגבול ההצלחה במכוון (ראה כותרת 159).
    perform public.copy_lead_facts_to_client(q.id);

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

  if v_kind = 'one_time' then
    return jsonb_build_object('ok', true, 'kind', 'one_time',
      'engagementId', null, 'chargesOnly', true);
  end if;

  select id into v_existing from public.engagements where quotation_id = q.id;
  if v_existing is not null then
    if (select status from public.engagements where id = v_existing) = 'onboarding' then
      v_steps := public.generate_onboarding_steps(v_existing, p_dry_run);
      if not p_dry_run then
        v_sub := public.add_intake_questionnaire_step(v_existing);
        if coalesce(v_sub->>'ok','false') <> 'true' then
          raise exception 'journey_incomplete: intake (%)', coalesce(v_sub->>'error','unknown')
            using errcode = 'data_exception';
        end if;
        v_sub := public.ensure_institution_alignment_steps(q.client_id, v_existing, true);
        if coalesce(v_sub->>'ok','false') <> 'true' then
          raise exception 'journey_incomplete: alignment (%)', coalesce(v_sub->>'error','unknown')
            using errcode = 'data_exception';
        end if;
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

  v_eff := coalesce(q.effective_from, (nullif(v_start, '') || '-01')::date, current_date);

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
      v_sub := public.add_intake_questionnaire_step(v_eng_id);
      if coalesce(v_sub->>'ok','false') <> 'true' then
        raise exception 'journey_incomplete: intake (%)', coalesce(v_sub->>'error','unknown')
          using errcode = 'data_exception';
      end if;
      v_sub := public.ensure_institution_alignment_steps(q.client_id, v_eng_id, true);
      if coalesce(v_sub->>'ok','false') <> 'true' then
        raise exception 'journey_incomplete: alignment (%)', coalesce(v_sub->>'error','unknown')
          using errcode = 'data_exception';
      end if;
      return jsonb_build_object('ok', true, 'engagementId', v_eng_id, 'existed', true, 'steps', v_steps);
    end if;

    perform public.log_onboarding_event(q.user_id, null, v_eng_id, 'created', 'system',
      'ההתקשרות נפתחה מאישור הצעה ' || coalesce(q.quotation_number, q.id),
      jsonb_build_object('quotationId', q.id));

    v_steps := public.generate_onboarding_steps(v_eng_id, false);
    v_sub := public.add_intake_questionnaire_step(v_eng_id);
    if coalesce(v_sub->>'ok','false') <> 'true' then
      raise exception 'journey_incomplete: intake (%)', coalesce(v_sub->>'error','unknown')
        using errcode = 'data_exception';
    end if;
    v_sub := public.ensure_institution_alignment_steps(q.client_id, v_eng_id, true);
    if coalesce(v_sub->>'ok','false') <> 'true' then
      raise exception 'journey_incomplete: alignment (%)', coalesce(v_sub->>'error','unknown')
        using errcode = 'data_exception';
    end if;

    return jsonb_build_object('ok', true, 'engagementId', v_eng_id, 'existed', false, 'steps', v_steps);
  end if;

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
    ' - בתוקף מ-' || to_char(v_eff, 'MM/YYYY'),
    jsonb_build_object('quotationId', q.id, 'supersedes', v_current));

  perform public.apply_due_engagement_transitions();

  return jsonb_build_object('ok', true, 'engagementId', v_eng_id, 'existed', false,
    'renewal', true, 'effectiveFrom', v_eff);
end;
$function$;

comment on function public.create_engagement_for_quotation(text, boolean) is
  'יוצרת התקשרות, חיובים ומסלול קליטה מהצעה מאושרת. כתיבות המשנה שבונות את מבנה המסע (שאלון קליטה, יישור קו) נבדקות ומפילות את הפעולה בכישלון — ראה מיגרציה 163.';

revoke execute on function public.create_engagement_for_quotation(text, boolean) from public, anon, authenticated;
grant execute on function public.create_engagement_for_quotation(text, boolean) to service_role;
