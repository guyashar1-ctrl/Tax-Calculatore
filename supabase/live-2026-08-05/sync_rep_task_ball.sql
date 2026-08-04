-- נמשך חי 2026-08-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: (ללא)
CREATE OR REPLACE FUNCTION public.sync_rep_task_ball()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ball text;
begin
  if coalesce(old.status, '') = coalesce(new.status, '') then return new; end if;
  if new.linked_client_id is null then return new; end if;

  if new.status = 'active' then
    update public.tasks
      set status = 'done', completed_at = now()
      where user_id = new.user_id
        and client_id = new.linked_client_id
        and status = 'open'
        and title like 'להשלים ייצוג%';
    return new;
  end if;

  v_ball := case new.status
    when 'pending_fill'         then 'client'
    when 'awaiting_accountant'  then 'me'
    when 'pending_signature'    then 'client'
    when 'awaiting_stamp'       then 'me'
    when 'awaiting_authorities' then 'authority'
    else null
  end;
  if v_ball is null then return new; end if;

  update public.tasks
    set ball_with = v_ball,
        progress = case when new.status = 'pending_fill' then progress else 'in_progress' end
    where user_id = new.user_id
      and client_id = new.linked_client_id
      and status = 'open'
      and title like 'להשלים ייצוג%'
      and (ball_with is distinct from v_ball
           or (new.status <> 'pending_fill' and progress is distinct from 'in_progress'));

  return new;
end;
$function$

