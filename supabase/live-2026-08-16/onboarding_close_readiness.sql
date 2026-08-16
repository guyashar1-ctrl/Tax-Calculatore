-- נמשך חי 2026-08-16 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_engagement_id text
CREATE OR REPLACE FUNCTION public.onboarding_close_readiness(p_engagement_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  e public.engagements%rowtype;
  v_blocking jsonb;
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'engagement_not_found'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'stepType', step_type, 'status', status, 'ball', ball)), '[]'::jsonb)
    into v_blocking
    from public.onboarding_steps
   where engagement_id = e.id
     and status not in ('completed', 'verified', 'skipped', 'cancelled')
     and required_for_close
     -- ‼ עבודה פנימית אוטומטית שהמסך אינו מציג — אינה חוסמת.
     and step_type not in ('internal_setup', 'kyc_identification', 'first_month_review',
                           'representation_upgrade', 'opening_call', 'file_opening',
                           'data_import', 'data_verification')
     and not (step_type = 'release_letter'
              and status not in ('pending', 'locked')
              and due_date is not null
              and due_date <= current_date);

  return jsonb_build_object(
    'ok', true,
    'engagementId', e.id,
    'alreadyClosed', e.status <> 'onboarding',
    'blocking', v_blocking,
    'ready', jsonb_array_length(v_blocking) = 0);
end;
$function$

