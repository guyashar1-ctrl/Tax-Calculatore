-- נמשך חי 2026-08-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text, p_paperless_status text, p_data_source text, p_software_name text
CREATE OR REPLACE FUNCTION public.set_paperless_path(p_client_id text, p_paperless_status text, p_data_source text, p_software_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid      uuid := auth.uid();
  v_invite   public.onboarding_steps%rowtype;
  v_conn     public.onboarding_steps%rowtype;
  v_import   public.onboarding_steps%rowtype;
  v_verify   public.onboarding_steps%rowtype;
  v_retainer public.onboarding_steps%rowtype;
  v_eng      text;
  v_facts    jsonb;
  v_created  int := 0;
  v_na       boolean;
begin
  if p_paperless_status not in ('none','other_rep','self','not_applicable')
     or p_data_source not in ('none','other_software','paperless') then
    return jsonb_build_object('ok', false, 'error', 'bad_values');
  end if;
  v_na := p_paperless_status = 'not_applicable';

  select * into v_invite from public.onboarding_steps
    where client_id = p_client_id and step_type = 'paperless_invite' and status <> 'cancelled' limit 1;
  select * into v_conn from public.onboarding_steps
    where client_id = p_client_id and step_type = 'paperless_connection' and status <> 'cancelled' limit 1;

  if v_conn.id is null then return jsonb_build_object('ok', false, 'error', 'no_paperless_steps'); end if;
  if v_uid is null or v_conn.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  v_eng := v_conn.engagement_id;
  v_facts := jsonb_build_object(
    'paperlessStatus', p_paperless_status,
    'dataSource', case when v_na then 'none' else p_data_source end,
    'softwareName', nullif(trim(coalesce(p_software_name, '')), ''));

  update public.clients set paperless_status = p_paperless_status, updated_at = now()
    where id = p_client_id;

  update public.onboarding_steps set payload = payload || v_facts
    where client_id = p_client_id and step_type in ('paperless_invite','paperless_connection')
      and status <> 'cancelled';

  if v_na then
    update public.onboarding_steps
      set status = 'skipped',
          payload = payload || jsonb_build_object('skipReason', 'not_applicable')
      where client_id = p_client_id
        and step_type in ('paperless_invite','paperless_connection')
        and status not in ('completed','verified','cancelled');
    perform public.unlock_dependent_steps(v_conn.id);
    if v_invite.id is not null then perform public.unlock_dependent_steps(v_invite.id); end if;

  elsif p_paperless_status in ('other_rep','self') then
    if v_invite.id is not null and v_invite.status in ('locked','pending','in_progress','waiting_client','skipped') then
      update public.onboarding_steps
        set status = 'skipped',
            payload = payload || jsonb_build_object('skipReason',
              case when p_paperless_status = 'other_rep' then 'transferred_rep' else 'already_connected' end)
        where id = v_invite.id;
      perform public.unlock_dependent_steps(v_invite.id);
    end if;
    update public.onboarding_steps
      set status = case when status = 'skipped' then 'pending' else status end,
          payload = payload - 'skipReason',
          ball = case when p_paperless_status = 'other_rep' then 'me' else 'client' end
      where id = v_conn.id and status not in ('completed','verified','cancelled');
  else
    if v_invite.id is not null and v_invite.status = 'skipped' then
      update public.onboarding_steps set status = 'pending',
             payload = payload - 'skipReason' where id = v_invite.id;
    end if;
    update public.onboarding_steps
      set status = 'locked', ball = 'client', payload = payload - 'skipReason'
      where id = v_conn.id and status in ('pending','locked','skipped');
  end if;

  select * into v_import from public.onboarding_steps
    where client_id = p_client_id and step_type = 'data_import' and status <> 'cancelled' limit 1;

  if p_data_source = 'other_software' and not v_na then
    if v_import.id is null then
      insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, depends_on_step_id, payload)
      values (v_conn.user_id, v_eng, p_client_id, 'data_import', 'tools', 'person', 'locked', 'me', v_conn.id,
              v_facts || jsonb_build_object('checklist', jsonb_build_array(
                jsonb_build_object('key','uniform_file','label','קובץ מבנה אחיד התקבל','done',false),
                jsonb_build_object('key','imported','label','יובא לפייפרלס','done',false))))
      returning * into v_import;
      v_created := v_created + 1;
    end if;
  elsif v_import.id is not null and v_import.status in ('locked','pending') then
    update public.onboarding_steps set status = 'cancelled' where id = v_import.id;
    v_import := null;
  end if;

  select * into v_verify from public.onboarding_steps
    where client_id = p_client_id and step_type = 'data_verification' and status <> 'cancelled' limit 1;

  if p_data_source in ('other_software','paperless') and not v_na then
    if v_verify.id is null then
      insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, depends_on_step_id, payload)
      values (v_conn.user_id, v_eng, p_client_id, 'data_verification', 'tools', 'person', 'locked', 'me',
              coalesce(v_import.id, v_conn.id),
              jsonb_build_object('checklist', jsonb_build_array(
                jsonb_build_object('key','documents','label','מסמכים קיימים','done',false),
                jsonb_build_object('key','income','label','הכנסות קיימות','done',false),
                jsonb_build_object('key','expenses','label','הוצאות קיימות','done',false),
                jsonb_build_object('key','balances','label','יתרות פתיחה הגיוניות','done',false))));
      v_created := v_created + 1;
    else
      update public.onboarding_steps set depends_on_step_id = coalesce(v_import.id, v_conn.id)
        where id = v_verify.id and status in ('locked','pending');
    end if;
  elsif v_verify.id is not null and v_verify.status in ('locked','pending') then
    update public.onboarding_steps set status = 'cancelled' where id = v_verify.id;
  end if;

  select * into v_retainer from public.onboarding_steps
    where client_id = p_client_id and step_type = 'retainer_authorization'
      and status not in ('cancelled') limit 1;

  if v_retainer.id is not null then
    if v_na then
      update public.onboarding_steps
        set depends_on_step_id = null,
            status = case when status = 'locked' then 'pending' else status end,
            ball = 'me',
            payload = payload || jsonb_build_object('method', 'manual_arrangement')
        where id = v_retainer.id;
    else
      update public.onboarding_steps
        set depends_on_step_id = v_conn.id,
            payload = payload - 'method',
            status = case
              when status in ('completed','verified') then status
              when v_conn.status in ('completed','verified') then status
              when status = 'pending' then 'locked'
              else status end
        where id = v_retainer.id;
    end if;
  end if;

  perform public.log_onboarding_event(v_conn.user_id, v_conn.id, v_eng, 'status_changed', 'accountant',
    case when v_na then 'הלקוח לא יעבוד עם פייפרלס — הגבייה תוסדר ידנית'
         else 'מסלול הפייפרלס נקבע' end, v_facts);

  return jsonb_build_object('ok', true, 'created', v_created, 'facts', v_facts,
                            'notApplicable', v_na);
end;
$function$

