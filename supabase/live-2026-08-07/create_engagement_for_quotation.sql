-- נמשך חי 2026-08-07 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_quotation_id text, p_dry_run boolean
CREATE OR REPLACE FUNCTION public.create_engagement_for_quotation(p_quotation_id text, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  q         public.quotations%rowtype;
  v_items   jsonb;
  v_monthly numeric;
  v_start   text;
  v_eng_id  text;
  v_existing text;
  v_steps   jsonb;
begin
  select * into q from public.quotations where id = p_quotation_id;
  if q.id is null then return jsonb_build_object('ok', false, 'error', 'quotation_not_found'); end if;
  if q.status <> 'approved' then return jsonb_build_object('ok', false, 'error', 'not_approved'); end if;
  if q.client_id is null then return jsonb_build_object('ok', false, 'error', 'no_client'); end if;

  if not p_dry_run then perform public.copy_lead_facts_to_client(q.id); end if;

  select id into v_existing from public.engagements where quotation_id = q.id;
  if v_existing is not null then
    v_steps := public.generate_onboarding_steps(v_existing, p_dry_run);
    if not p_dry_run then perform public.add_intake_questionnaire_step(v_existing); end if;
    return jsonb_build_object('ok', true, 'engagementId', v_existing, 'existed', true, 'steps', v_steps);
  end if;

  v_items := coalesce(q.snapshot->'items', q.items, '[]'::jsonb);

  select
    sum( (coalesce((it->>'clientPrice')::numeric, 0))
       * (coalesce((it->>'quantity')::numeric, 1))
       * (1 - coalesce((it->>'discountPercent')::numeric, 0) / 100.0) ),
    min(nullif(it->>'billingStartMonth', ''))
  into v_monthly, v_start
  from jsonb_array_elements(v_items) it
  where coalesce(it->>'category','') = 'monthly';

  if p_dry_run then
    return jsonb_build_object('ok', true, 'dryRun', true, 'wouldCreate', true,
      'clientId', q.client_id, 'monthlyTotal', v_monthly, 'billingStartMonth', v_start);
  end if;

  insert into public.engagements (user_id, client_id, quotation_id, status,
                                  monthly_total, billing_start_month, approved_at)
  values (q.user_id, q.client_id, q.id, 'onboarding',
          v_monthly, v_start, coalesce(q.approved_at, now()))
  on conflict (quotation_id) do nothing
  returning id into v_eng_id;

  if v_eng_id is null then
    select id into v_eng_id from public.engagements where quotation_id = q.id;
    v_steps := public.generate_onboarding_steps(v_eng_id, false);
    perform public.add_intake_questionnaire_step(v_eng_id);
    return jsonb_build_object('ok', true, 'engagementId', v_eng_id, 'existed', true, 'steps', v_steps);
  end if;

  perform public.log_onboarding_event(q.user_id, null, v_eng_id, 'created', 'system',
    'ההתקשרות נפתחה מאישור הצעה ' || coalesce(q.quotation_number, q.id),
    jsonb_build_object('quotationId', q.id));

  v_steps := public.generate_onboarding_steps(v_eng_id, false);
  perform public.add_intake_questionnaire_step(v_eng_id);

  return jsonb_build_object('ok', true, 'engagementId', v_eng_id, 'existed', false, 'steps', v_steps);
end;
$function$

