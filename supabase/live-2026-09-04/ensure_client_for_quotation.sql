-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_quotation_id text
CREATE OR REPLACE FUNCTION public.ensure_client_for_quotation(p_quotation_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  q           public.quotations%rowtype;
  l           public.leads%rowtype;
  v_client_id text;
  v_created   boolean := false;
  v_token     text;
  v_name      text;
  v_first     text;
  v_last      text;
  v_email     text;
  v_phone     text;
begin
  select * into q from public.quotations where id = p_quotation_id limit 1;
  if q.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if auth.uid() is null or q.user_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_client_id := q.client_id;
  if q.lead_id is not null then
    select * into l from public.leads where id = q.lead_id;
    if v_client_id is null then v_client_id := l.converted_client_id; end if;
  end if;

  v_name  := coalesce(nullif(trim(coalesce(l.full_name, '')), ''),
                      nullif(trim(coalesce(q.snapshot->>'recipientName', '')), ''));
  v_email := coalesce(nullif(trim(coalesce(l.email, '')), ''),
                      nullif(trim(coalesce(q.snapshot->>'recipientEmail', '')), ''));
  v_phone := nullif(trim(coalesce(l.phone, '')), '');

  if v_client_id is not null
     and not exists (select 1 from public.clients where id = v_client_id) then
    v_client_id := null;
  end if;

  if v_client_id is null then
    v_first := split_part(trim(coalesce(v_name, 'ליד')), ' ', 1);
    v_last  := nullif(trim(substr(trim(coalesce(v_name, '')),
                 length(split_part(trim(coalesce(v_name, '')), ' ', 1)) + 1)), '');
    v_client_id := replace(gen_random_uuid()::text, '-', '');
    insert into public.clients (
      id, user_id, first_name, last_name, email, phone,
      lifecycle_stage, representation_status, merged_from_lead_id, business_name, notes
    ) values (
      v_client_id, q.user_id, v_first, v_last, v_email, v_phone,
      'quoted', null, q.lead_id, nullif(trim(coalesce(l.business_name, '')), ''),
      'נוצר עם שליחת הצעת מחיר ' || q.quotation_number || '.'
    );
    v_created := true;
  else
    update public.clients c
      set merged_from_lead_id = coalesce(c.merged_from_lead_id, q.lead_id),
          email      = coalesce(nullif(trim(coalesce(c.email, '')), ''), v_email),
          phone      = coalesce(nullif(trim(coalesce(c.phone, '')), ''), v_phone),
          updated_at = now()
      where c.id = v_client_id;
  end if;

  if q.lead_id is not null then
    update public.leads
      set converted_client_id = coalesce(converted_client_id, v_client_id),
          updated_at = now()
      where id = q.lead_id;
  end if;

  if q.client_id is distinct from v_client_id then
    update public.quotations
      set client_id = v_client_id,
          events = coalesce(events, '[]'::jsonb) || jsonb_build_object(
            'type', case when v_created then 'client_precreated' else 'client_linked' end,
            'at', now()),
          updated_at = now()
      where id = q.id;
  end if;

  select portal_token into v_token from public.clients where id = v_client_id;
  if v_token is null then
    v_token := replace(gen_random_uuid()::text, '-', '');
    update public.clients set portal_token = v_token
      where id = v_client_id and portal_token is null;
    select portal_token into v_token from public.clients where id = v_client_id;
  end if;

  perform public.copy_lead_facts_to_client(q.id);
  perform public.refresh_lifecycle_stage_for(v_client_id);

  return jsonb_build_object('ok', true, 'clientId', v_client_id,
                            'portalToken', v_token, 'created', v_created);
end;
$function$

