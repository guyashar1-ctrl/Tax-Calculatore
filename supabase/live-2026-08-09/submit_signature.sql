-- נמשך חי 2026-08-09 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_token text, p_signature text
CREATE OR REPLACE FUNCTION public.submit_signature(p_token text, p_signature text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_req public.representation_requests;
begin
  select * into v_req from public.representation_requests where onboarding_token = p_token limit 1;
  if not found then return false; end if;
  if v_req.status <> 'pending_signature' then return false; end if;
  if v_req.signature_setup is not null then return false; end if;
  update public.representation_requests
    set identification = coalesce(identification, '{}'::jsonb) || jsonb_build_object('signatureDataUrl', p_signature, 'signedAt', now()),
        status = 'awaiting_stamp',
        updated_at = now()
    where id = v_req.id;
  if v_req.linked_client_id is not null then
    update public.clients set representation_status = 'awaiting_stamp', updated_at = now() where id = v_req.linked_client_id;
  end if;
  return true;
end $function$

