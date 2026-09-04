-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: (ללא)
CREATE OR REPLACE FUNCTION public.sync_representation_step()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status text;
  v_ball   text;
begin
  if coalesce(old.status,'') = coalesce(new.status,'') then return new; end if;
  if new.linked_client_id is null then return new; end if;

  case new.status
    when 'pending_fill'        then v_status := 'waiting_client'; v_ball := 'client';
    when 'awaiting_accountant' then v_status := 'in_progress';    v_ball := 'me';
    when 'pending_signature'   then v_status := 'waiting_client'; v_ball := 'client';
    when 'awaiting_stamp'      then v_status := 'in_progress';    v_ball := 'me';
    when 'awaiting_authorities' then v_status := 'in_progress';   v_ball := 'authority';
    when 'active'              then v_status := 'completed';      v_ball := 'me';
    else return new;
  end case;

  update public.onboarding_steps
    set status = v_status, ball = v_ball,
        completion_method = 'auto',
        completed_at = case when v_status = 'completed' and completed_at is null then now() else completed_at end
    where client_id = new.linked_client_id
      and step_type = 'representation'
      and status not in ('cancelled','skipped');

  if new.status = 'awaiting_authorities' then
    perform public.ensure_rep_client_approval_step(new.linked_client_id);
  end if;

  if new.status = 'active' then
    update public.onboarding_steps
       set status = 'completed', ball = 'me', completion_method = 'auto',
           completed_at = coalesce(completed_at, now()), needs_attention = false
     where client_id = new.linked_client_id
       and step_type = 'rep_client_approval'
       and status not in ('completed','verified','skipped','cancelled');
  end if;

  return new;
end;
$function$

