-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_dry_run boolean
CREATE OR REPLACE FUNCTION public.merge_leads_into_people(p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  l          public.leads%rowtype;
  v_match    text;
  v_new_id   text;
  v_report   jsonb := '[]'::jsonb;
  v_created  int := 0;
  v_linked   int := 0;
  v_skipped  int := 0;
begin
  for l in select * from public.leads order by created_at loop
    if l.converted_client_id is not null then
      v_skipped := v_skipped + 1;
      v_report := v_report || jsonb_build_object('lead', l.full_name, 'action', 'already_linked',
                                                 'clientId', l.converted_client_id);
      continue;
    end if;

    v_match := null;
    if nullif(trim(coalesce(l.email, '')), '') is not null then
      select c.id into v_match from public.clients c
        where c.user_id = l.user_id
          and lower(trim(coalesce(c.email, ''))) = lower(trim(l.email))
        limit 1;
    end if;
    if v_match is null and nullif(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), '') is not null then
      select c.id into v_match from public.clients c
        where c.user_id = l.user_id
          and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = regexp_replace(l.phone, '\D', '', 'g')
        limit 1;
    end if;

    if v_match is not null then
      v_linked := v_linked + 1;
      v_report := v_report || jsonb_build_object('lead', l.full_name, 'action', 'merge_into_existing',
                                                 'clientId', v_match);
      if not p_dry_run then
        update public.leads set converted_client_id = v_match where id = l.id;
        update public.clients c
          set merged_from_lead_id   = coalesce(c.merged_from_lead_id, l.id),
              business_name         = coalesce(c.business_name, l.business_name),
              dealer_type           = coalesce(c.dealer_type, l.dealer_type),
              has_previous_accountant = coalesce(c.has_previous_accountant, l.has_previous_accountant),
              prev_accountant_name  = coalesce(c.prev_accountant_name, l.prev_accountant_name),
              prev_accountant_email = coalesce(c.prev_accountant_email, l.prev_accountant_email),
              prev_accountant_phone = coalesce(c.prev_accountant_phone, l.prev_accountant_phone),
              -- ההערות של הליד נשמרות גלויות ומתויגות, לא נמחקות ולא נדרסות
              notes = case when nullif(trim(coalesce(l.notes,'')), '') is null then c.notes
                           else trim(coalesce(c.notes, '') || E'\n[משלב הליד] ' || l.notes) end
          where c.id = v_match;
      end if;
    else
      v_created := v_created + 1;
      v_report := v_report || jsonb_build_object('lead', l.full_name, 'action', 'create_person_card');
      if not p_dry_run then
        v_new_id := replace(gen_random_uuid()::text, '-', '');
        insert into public.clients (
          id, user_id, first_name, last_name, email, phone,
          lifecycle_stage, merged_from_lead_id,
          business_name, dealer_type, has_previous_accountant,
          prev_accountant_name, prev_accountant_email, prev_accountant_phone,
          referral_source, business_transfer, notes)
        values (
          v_new_id, l.user_id,
          split_part(trim(coalesce(l.full_name, 'ליד')), ' ', 1),
          nullif(trim(substr(trim(coalesce(l.full_name, '')), length(split_part(trim(coalesce(l.full_name, '')), ' ', 1)) + 1)), ''),
          l.email, l.phone,
          'lead', l.id,
          l.business_name, l.dealer_type, l.has_previous_accountant,
          l.prev_accountant_name, l.prev_accountant_email, l.prev_accountant_phone,
          l.referral_source, l.business_transfer, l.notes);
        -- ‼ המצביע הקיים הוא מה שמונע כפילות בהמשך: כשההצעה תאושר,
        -- open_quotation_representation ימצא את הכרטיס הזה ולא ייצור שני.
        update public.leads set converted_client_id = v_new_id where id = l.id;
      end if;
    end if;
  end loop;

  if not p_dry_run then perform public.refresh_lifecycle_stages(); end if;

  return jsonb_build_object('ok', true, 'dryRun', p_dry_run,
    'createdPersonCards', v_created, 'mergedIntoExisting', v_linked,
    'alreadyLinked', v_skipped, 'report', v_report);
end;
$function$

