-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_user_id uuid, p_kind text, p_client_id text, p_step_id text, p_request_id text, p_quotation_id text, p_payload jsonb
CREATE OR REPLACE FUNCTION public.queue_accountant_notification(p_user_id uuid, p_kind text, p_client_id text DEFAULT NULL::text, p_step_id text DEFAULT NULL::text, p_request_id text DEFAULT NULL::text, p_quotation_id text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into public.accountant_notifications
    (user_id, kind, client_id, step_id, request_id, quotation_id, payload)
  values
    (p_user_id, p_kind, p_client_id, p_step_id, p_request_id, p_quotation_id,
     coalesce(p_payload, '{}'::jsonb));
$function$

