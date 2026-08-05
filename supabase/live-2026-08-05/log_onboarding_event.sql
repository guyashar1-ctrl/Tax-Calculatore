-- נמשך חי 2026-08-05 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_user_id uuid, p_step_id text, p_engagement_id text, p_type text, p_actor text, p_note text, p_meta jsonb
CREATE OR REPLACE FUNCTION public.log_onboarding_event(p_user_id uuid, p_step_id text, p_engagement_id text, p_type text, p_actor text DEFAULT 'system'::text, p_note text DEFAULT NULL::text, p_meta jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into public.onboarding_events (user_id, step_id, engagement_id, type, actor, note, meta)
  values (p_user_id, p_step_id, p_engagement_id, p_type, p_actor, p_note, coalesce(p_meta, '{}'::jsonb));
$function$

