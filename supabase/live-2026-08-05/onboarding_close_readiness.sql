-- נמשך חי 2026-08-05 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_engagement_id text
CREATE OR REPLACE FUNCTION public.onboarding_close_readiness(p_engagement_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  e public.engagements%rowtype;
  v_retainer  text;
  v_release   text;
  v_intake    text;
  v_blocking  jsonb;
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'engagement_not_found'); end if;

  -- הריטיינר הוזן: אין שלב תשלום, או שהוא נסגר.
  select case when count(*) = 0 then 'not_required'
              when count(*) filter (where status in ('completed','verified','skipped')) = count(*) then 'done'
              else 'open' end
    into v_retainer
    from public.onboarding_steps
   where client_id = e.client_id and step_type = 'retainer_authorization' and status <> 'cancelled';

  -- הרו"ח הקודם: המכתב נשלח וחלון ההתנגדות עבר, או שאין רו"ח קודם בכלל.
  select case when count(*) = 0 then 'not_required'
              when count(*) filter (where status in ('completed','verified','skipped')) = count(*) then 'done'
              when bool_or(due_date is not null and due_date <= current_date) then 'no_objection'
              else 'open' end
    into v_release
    from public.onboarding_steps
   where client_id = e.client_id and step_type = 'release_letter' and status <> 'cancelled';

  -- השאלון: נשלח, נענה, או שסומן במודע כדילוג.
  select case when count(*) = 0 then 'not_required'
              when count(*) filter (where status in ('completed','verified','skipped')) = count(*) then 'done'
              when bool_or(status = 'waiting_client') then 'sent'
              else 'open' end
    into v_intake
    from public.onboarding_steps
   where client_id = e.client_id and step_type = 'intake_questionnaire' and status <> 'cancelled';

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'stepType', step_type, 'status', status, 'ball', ball)), '[]'::jsonb)
    into v_blocking
    from public.onboarding_steps
   where engagement_id = e.id
     and status not in ('completed','verified','skipped','cancelled')
     and step_type not in ('representation_upgrade','first_month_review');

  return jsonb_build_object(
    'ok', true,
    'engagementId', e.id,
    'alreadyClosed', e.status <> 'onboarding',
    'retainer', v_retainer,
    'releaseLetter', v_release,
    'intake', v_intake,
    'blocking', v_blocking,
    'ready', v_retainer in ('done','not_required')
         and v_release in ('done','not_required','no_objection')
         and v_intake  in ('done','not_required','sent')
         and jsonb_array_length(v_blocking) = 0);
end;
$function$

