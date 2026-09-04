-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text, p_status text
CREATE OR REPLACE FUNCTION public.apply_client_representation(p_client_id text, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reps jsonb;
begin
  if p_client_id is null or p_status is null then return; end if;

  update public.clients
     set representation_status = p_status, updated_at = now()
   where id = p_client_id
     and coalesce(representation_status, '') <> 'active'
     and representation_status is distinct from p_status;

  if p_status = 'active' then
    select coalesce(jsonb_object_agg(
             t.k,
             case when t.k = 'nationalInsurance' then t.v
                  else t.v || jsonb_build_object('status', 'active') end), '{}'::jsonb)
      into v_reps
      from public.clients c,
           lateral jsonb_each(coalesce(c.authority_representations, '{}'::jsonb)) as t(k, v)
     where c.id = p_client_id;

    update public.clients
       set representation_status = 'active',
           authority_representations = case
             when v_reps is null or v_reps = '{}'::jsonb then authority_representations
             else v_reps end,
           updated_at = now()
     where id = p_client_id
       and (representation_status is distinct from 'active'
            or authority_representations is distinct from coalesce(v_reps, authority_representations));
  end if;

  perform public.refresh_lifecycle_stage_for(p_client_id);
end;
$function$

