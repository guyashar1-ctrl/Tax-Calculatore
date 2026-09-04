-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_quotation_id text, p_dry_run boolean
CREATE OR REPLACE FUNCTION public.create_engagement_for_quotation(p_quotation_id text, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  if v_kind = 'one_time' and v_current is null then
    v_kind := 'engagement';
  end if;

  if not p_dry_run then
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
$function$

