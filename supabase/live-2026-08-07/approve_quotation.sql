-- נמשך חי 2026-08-07 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_token text, p_signature text, p_signer_name text
CREATE OR REPLACE FUNCTION public.approve_quotation(p_token text, p_signature text DEFAULT NULL::text, p_signer_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  q         public.quotations%rowtype;
  v_req_id  text;
  v_token   text;
  v_needs   boolean := false;
  v_reused  boolean := false;
begin
  select * into q from public.quotations where public_token = p_token limit 1;
  if q.id is null then return jsonb_build_object('status', 'invalid'); end if;

  if q.status = 'approved' then
    v_reused := q.representation_request_id is not null;
    v_req_id := coalesce(q.representation_request_id, public.open_quotation_representation(q.id));
  elsif q.status = 'cancelled' then
    return jsonb_build_object('status', 'cancelled');
  elsif q.expires_at is not null and q.expires_at < now() then
    update public.quotations
      set status = 'expired',
          events = coalesce(events, '[]'::jsonb) || jsonb_build_object('type','expired','at', now())
      where id = q.id and status <> 'expired';
    return jsonb_build_object('status', 'expired');
  elsif q.status not in ('sent','viewed') then
    return jsonb_build_object('status', q.status);
  else
    update public.quotations
      set status = 'approved',
          approved_at = now(),
          approval_signature = coalesce(p_signature, approval_signature),
          approval_signer_name = coalesce(nullif(trim(p_signer_name), ''), approval_signer_name),
          events = coalesce(events, '[]'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
            'type', 'approved',
            'at', now(),
            'note', case when nullif(trim(p_signer_name), '') is not null
                         then 'נחתם על ידי ' || trim(p_signer_name) end
          ))
      where id = q.id;

    v_req_id := public.open_quotation_representation(q.id);
    select (r.created_at < now() - interval '10 seconds') into v_reused
      from public.representation_requests r where r.id = v_req_id;
  end if;

  begin
    perform public.create_engagement_for_quotation(q.id, false);
  exception when others then
    null;
  end;

  select r.onboarding_token, coalesce(r.onboarding_status, 'pending') = 'pending'
    into v_token, v_needs
    from public.representation_requests r where r.id = v_req_id;

  return jsonb_build_object(
    'status', 'approved',
    'onboardingToken', case when coalesce(v_needs, false) then v_token end,
    'repReused', coalesce(v_reused, false)
  );
end;
$function$

