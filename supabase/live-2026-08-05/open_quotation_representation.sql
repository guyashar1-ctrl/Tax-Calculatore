-- נמשך חי 2026-08-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_quotation_id text
CREATE OR REPLACE FUNCTION public.open_quotation_representation(p_quotation_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  q            public.quotations%rowtype;
  v_rep        jsonb;
  v_areas      jsonb;
  v_prefill    jsonb;
  v_spouse     jsonb;
  v_client_id  text;
  v_req_id     text := replace(gen_random_uuid()::text, '-', '');
  v_first      text;
  v_last       text;
  v_name       text;
  v_email      text;
  v_signers    jsonb;
  v_shaam      text[];
  v_area_keys  text[];
  v_labels     text;
  v_placeholder text;
  v_existing   public.clients%rowtype;
  v_added      text[];
  v_added_lbl  text;
begin
  select * into q from public.quotations where id = p_quotation_id limit 1;
  if q.id is null then return null; end if;
  if q.representation_request_id is not null then return q.representation_request_id; end if;
  if q.status <> 'approved' then return null; end if;

  v_rep := coalesce(q.representation, '{}'::jsonb);
  if not coalesce((v_rep->>'enabled')::boolean, false) then return null; end if;

  v_areas   := coalesce(v_rep->'areas', '{}'::jsonb);
  v_prefill := coalesce(v_rep->'prefill', '{}'::jsonb);
  v_spouse  := v_rep->'spouse';
  if v_spouse = 'null'::jsonb then v_spouse := null; end if;
  select array_agg(k) into v_area_keys from jsonb_object_keys(v_areas) k;
  if v_area_keys is null then return null; end if;

  v_first := nullif(trim(coalesce(v_prefill->>'firstName', '')), '');
  v_last  := nullif(trim(coalesce(v_prefill->>'lastName', '')), '');
  v_name  := nullif(trim(coalesce(v_first, '') || ' ' || coalesce(v_last, '')), '');
  if v_name is null then
    select nullif(trim(coalesce(l.full_name, '')), '') into v_name
      from public.leads l where l.id = q.lead_id;
  end if;
  v_name := coalesce(v_name, nullif(trim(coalesce(q.snapshot->>'recipientName', '')), ''));
  if v_first is null and v_name is not null then
    v_first := split_part(v_name, ' ', 1);
    v_last  := nullif(trim(substr(v_name, length(split_part(v_name, ' ', 1)) + 1)), '');
  end if;

  v_email := nullif(trim(coalesce(v_prefill->>'email', '')), '');
  if v_email is null then
    select nullif(trim(coalesce(l.email, '')), '') into v_email
      from public.leads l where l.id = q.lead_id;
  end if;
  v_email := coalesce(v_email, nullif(trim(coalesce(q.snapshot->>'recipientEmail', '')), ''));

  v_client_id := q.client_id;
  if v_client_id is null then
    select l.converted_client_id into v_client_id from public.leads l where l.id = q.lead_id;
  end if;

  if v_client_id is null and v_email is not null then
    select c.id into v_client_id
      from public.clients c
      where c.user_id = q.user_id
        and lower(trim(coalesce(c.email, ''))) = lower(v_email)
        and c.representation_request_id is not null
      limit 1;
  end if;

  select coalesce(array_agg(k), '{}'::text[]) into v_shaam
    from unnest(v_area_keys) k where k <> 'nationalInsurance';

  if v_client_id is not null then
    select * into v_existing from public.clients where id = v_client_id limit 1;
    if v_existing.id is null then
      v_client_id := null;

    elsif v_existing.representation_request_id is not null then
      select coalesce(array_agg(k), '{}'::text[]) into v_added
        from unnest(v_area_keys) k
        where not (coalesce(v_existing.authority_representations, '{}'::jsonb) ? k);

      if array_length(v_added, 1) > 0 then
        update public.clients
          set authority_representations = v_areas || coalesce(authority_representations, '{}'::jsonb),
              updated_at = now()
          where id = v_client_id;

        update public.representation_requests
          set authorities = (
                select coalesce(array_agg(distinct a), '{}'::text[])
                from unnest(coalesce(authorities, '{}'::text[]) || v_shaam) a
              ),
              updated_at = now()
          where id = v_existing.representation_request_id;
      end if;

      select string_agg(
        case k when 'incomeTax' then 'מס הכנסה'
               when 'withholding' then 'ניכויים'
               when 'vat' then 'מע"מ'
               when 'nationalInsurance' then 'ביטוח לאומי'
               else k end, ', ')
        into v_added_lbl from unnest(coalesce(v_added, '{}'::text[])) k;

      update public.quotations
        set client_id = v_client_id,
            representation_request_id = v_existing.representation_request_id,
            events = coalesce(events, '[]'::jsonb) || jsonb_build_object(
              'type', 'representation_opened', 'at', now(),
              'note', 'ללקוח כבר קיים תהליך ייצוג — לא נפתחה בקשה חדשה'
                      || case when v_added_lbl is not null
                              then '. נוספו רשויות: ' || v_added_lbl else '' end),
            updated_at = now()
        where id = q.id;
      return v_existing.representation_request_id;
    end if;
  end if;

  if v_client_id is null then
    v_placeholder := to_char(now() at time zone 'Asia/Jerusalem', 'DD/MM HH24:MI');
    v_client_id := replace(gen_random_uuid()::text, '-', '');
    insert into public.clients (
      id, user_id, first_name, last_name, email,
      representation_status, representation_request_id, authority_representations,
      family_status, marriage_year, divorce_year, widowhood_year,
      spouse_name, spouse_id_number, notes
    ) values (
      v_client_id, q.user_id,
      coalesce(v_first, 'ממתין למילוי'),
      coalesce(v_last, case when v_first is null then v_placeholder else '' end),
      v_email,
      'pending_fill', v_req_id, v_areas,
      nullif(v_prefill->>'familyStatus', ''),
      case when v_prefill->>'familyStatus' = 'married'  then (v_prefill->>'familyStatusYear')::int end,
      case when v_prefill->>'familyStatus' = 'divorced' then (v_prefill->>'familyStatusYear')::int end,
      case when v_prefill->>'familyStatus' = 'widowed'  then (v_prefill->>'familyStatusYear')::int end,
      nullif(v_prefill->>'spouseName', ''),
      nullif(v_prefill->>'spouseIdNumber', ''),
      'נוצר אוטומטית עם אישור הצעת מחיר ' || q.quotation_number || '. ממתין להשלמת הייצוג.'
    );
  else
    update public.clients
      set representation_status     = 'pending_fill',
          representation_request_id = v_req_id,
          authority_representations = coalesce(authority_representations, '{}'::jsonb) || v_areas,
          updated_at                = now()
      where id = v_client_id;
  end if;

  v_signers := jsonb_build_array(jsonb_build_object(
    'id', 'client', 'role', 'client',
    'name', coalesce(v_name, ''), 'email', coalesce(v_email, ''),
    'signStatus', 'pending',
    'signToken', replace(gen_random_uuid()::text, '-', '')
  ));
  if v_spouse is not null and coalesce(trim(v_spouse->>'name'), '') <> '' then
    v_signers := v_signers || jsonb_build_array(jsonb_build_object(
      'id', 'spouse', 'role', 'spouse',
      'name', trim(v_spouse->>'name'),
      'email', coalesce(nullif(trim(coalesce(v_spouse->>'email', '')), ''), v_email, ''),
      'signStatus', 'pending',
      'signToken', replace(gen_random_uuid()::text, '-', '')
    ));
  end if;

  insert into public.representation_requests (
    id, user_id, linked_client_id, client_name, client_email,
    authorities, requested_docs, notes, status,
    onboarding_token, onboarding_status, prefill, signers
  ) values (
    v_req_id, q.user_id, v_client_id, coalesce(v_name, ''), coalesce(v_email, ''),
    v_shaam,
    jsonb_build_array(
      jsonb_build_object('id','id_card','label','תצלום תעודת זהות + ספח','required',true,'isDefault',true),
      jsonb_build_object('id','drivers_license','label','תצלום רישיון נהיגה','required',true,'isDefault',true)
    ),
    'נפתח אוטומטית עם אישור הצעת מחיר ' || q.quotation_number || '.',
    'pending_fill',
    replace(gen_random_uuid()::text, '-', ''), 'pending', v_prefill, v_signers
  );

  select string_agg(
    case k when 'incomeTax' then 'מס הכנסה'
           when 'withholding' then 'ניכויים'
           when 'vat' then 'מע"מ'
           when 'nationalInsurance' then 'ביטוח לאומי'
           else k end, ', ')
    into v_labels from unnest(v_area_keys) k;

  if q.lead_id is not null then
    update public.leads
      set status = 'converted', converted_client_id = v_client_id, updated_at = now()
      where id = q.lead_id;
  end if;

  update public.quotations
    set client_id = v_client_id,
        representation_request_id = v_req_id,
        events = coalesce(events, '[]'::jsonb)
                 || jsonb_build_object('type', 'lead_converted', 'at', now())
                 || jsonb_build_object('type', 'representation_opened', 'at', now(),
                                       'note', 'רשויות: ' || coalesce(v_labels, '—')),
        updated_at = now()
    where id = q.id;

  return v_req_id;
end;
$function$

