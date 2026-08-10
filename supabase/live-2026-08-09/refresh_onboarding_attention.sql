-- נמשך חי 2026-08-09 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_billing_days integer, p_client_wait_days integer
CREATE OR REPLACE FUNCTION public.refresh_onboarding_attention(p_billing_days integer DEFAULT 10, p_client_wait_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_billing int := 0; v_waiting int := 0; v_upgrade int := 0; v_cleared int := 0;
  r record;
begin
  for r in
    select s.id, s.user_id, s.engagement_id, e.billing_start_month
    from public.onboarding_steps s
    join public.engagements e on e.id = s.engagement_id
    where s.step_type = 'retainer_authorization'
      and s.status not in ('completed','verified','cancelled','skipped')
      and e.billing_start_month is not null
      and (e.billing_start_month || '-01')::date - current_date <= p_billing_days
      and not s.needs_attention
  loop
    update public.onboarding_steps set needs_attention = true where id = r.id;
    perform public.log_onboarding_event(r.user_id, r.id, r.engagement_id, 'reminder_prepared', 'system',
      'חודש החיוב הראשון (' || r.billing_start_month || ') מתקרב וההרשאה טרם הושלמה',
      jsonb_build_object('billingStartMonth', r.billing_start_month));
    v_billing := v_billing + 1;
  end loop;

  for r in
    select s.id, s.user_id, s.engagement_id, s.step_type
    from public.onboarding_steps s
    where s.status = 'waiting_client'
      and s.updated_at < now() - make_interval(days => p_client_wait_days)
      and not s.needs_attention
  loop
    update public.onboarding_steps set needs_attention = true where id = r.id;
    perform public.log_onboarding_event(r.user_id, r.id, r.engagement_id, 'reminder_prepared', 'system',
      'ממתינים ללקוח יותר מ-' || p_client_wait_days || ' ימים — תזכורת מוכנה לאישורך',
      jsonb_build_object('stepType', r.step_type));
    v_waiting := v_waiting + 1;
  end loop;

  for r in
    select s.id, s.user_id, s.engagement_id, s.due_date
    from public.onboarding_steps s
    where s.step_type = 'representation_upgrade'
      and s.status not in ('completed','verified','cancelled','skipped')
      and s.due_date is not null and s.due_date <= current_date
      and not s.needs_attention
  loop
    update public.onboarding_steps set needs_attention = true where id = r.id;
    perform public.log_onboarding_event(r.user_id, r.id, r.engagement_id, 'reminder_prepared', 'system',
      'הגיע מועד התזכורת לשדרוג הייצוג לראשי', jsonb_build_object('dueDate', r.due_date));
    v_upgrade := v_upgrade + 1;
  end loop;

  update public.onboarding_steps set needs_attention = false
    where needs_attention and status in ('completed','verified','skipped','cancelled');
  get diagnostics v_cleared = row_count;

  return jsonb_build_object('ok', true, 'billingFlagged', v_billing,
    'waitingFlagged', v_waiting, 'upgradeFlagged', v_upgrade, 'cleared', v_cleared);
end;
$function$

