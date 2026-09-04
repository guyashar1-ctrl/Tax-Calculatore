-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_step_id text
CREATE OR REPLACE FUNCTION public.execute_automatic_step(p_step_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s          public.onboarding_steps%rowtype;
  v_published boolean;
  v_secret   text;
  v_base     text;
  v_email    text;
  v_ext      jsonb;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('skipped', 'not_found'); end if;

  if coalesce(s.payload->'autoAction'->>'kind', '') <> 'email' then
    return jsonb_build_object('skipped', 'not_automatic');
  end if;
  if s.published_at is null then
    return jsonb_build_object('skipped', 'draft');
  end if;
  if s.status not in ('pending', 'in_progress') then
    return jsonb_build_object('skipped', 'status', 'status', s.status);
  end if;
  if s.payload->>'autoExecutedAt' is not null then
    return jsonb_build_object('skipped', 'already_executed');
  end if;
  if not public.onboarding_dependency_met(s.id) then
    return jsonb_build_object('skipped', 'dependencies');
  end if;

  select coalesce(bool_or(e.process_published_at is not null), true)
    into v_published from public.engagements e where e.client_id = s.client_id;
  if not v_published then
    return jsonb_build_object('skipped', 'process_unpublished');
  end if;

  v_ext := s.payload->'externalParty';
  if v_ext is not null and jsonb_typeof(v_ext) = 'object' then
    if v_ext->>'kind' = 'prev_accountant' then
      select prev_accountant_email into v_email from public.clients where id = s.client_id;
    else
      v_email := v_ext->'contact'->>'email';
    end if;
  else
    select email into v_email from public.clients where id = s.client_id;
  end if;
  if nullif(trim(coalesce(v_email, '')), '') is null then
    return jsonb_build_object('skipped', 'contact_missing');
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'internal_send_secret';
  select decrypted_secret into v_base   from vault.decrypted_secrets where name = 'functions_base_url';
  if v_secret is null or v_base is null then
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'system',
      'המשימה האוטומטית לא בוצעה - חסרה הגדרת שליחה פנימית',
      jsonb_build_object('automatic', true));
    return jsonb_build_object('skipped', 'missing_secrets');
  end if;

  perform net.http_post(
    url := v_base || '/functions/v1/send-step-email',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('internalSecret', v_secret, 'stepId', s.id, 'kind', 'step_reminder'),
    timeout_milliseconds := 15000);

  return jsonb_build_object('ok', true, 'queued', true);
exception when others then
  return jsonb_build_object('skipped', 'error', 'detail', left(coalesce(sqlerrm, ''), 200));
end;
$function$

