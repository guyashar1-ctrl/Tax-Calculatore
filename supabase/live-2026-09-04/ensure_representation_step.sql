-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text
CREATE OR REPLACE FUNCTION public.ensure_representation_step(p_client_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c        public.clients%rowtype;
  r        public.representation_requests%rowtype;
  v_id     text;
  v_status text;
  v_ball   text;
  v_eng    text;
  v_sort   int;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return null; end if;

  select * into r from public.representation_requests
    where linked_client_id = p_client_id
    order by created_at desc limit 1;
  if r.id is null then return null; end if;

  select id into v_id from public.onboarding_steps
    where client_id = p_client_id and step_type = 'representation'
      and status <> 'cancelled' limit 1;
  if v_id is not null then return v_id; end if;

  -- אותה מפה בדיוק כמו ב-sync_representation_step. שינוי כאן מחייב שינוי שם.
  case r.status
    when 'pending_fill'         then v_status := 'waiting_client'; v_ball := 'client';
    when 'awaiting_accountant'  then v_status := 'in_progress';    v_ball := 'me';
    when 'pending_signature'    then v_status := 'waiting_client'; v_ball := 'client';
    when 'awaiting_stamp'       then v_status := 'in_progress';    v_ball := 'me';
    when 'awaiting_authorities' then v_status := 'in_progress';    v_ball := 'authority';
    when 'active'               then v_status := 'completed';      v_ball := 'me';
    else v_status := 'in_progress'; v_ball := 'me';
  end case;

  select id into v_eng from public.engagements
    where client_id = p_client_id order by created_at desc limit 1;

  -- ‼ ראשון ברשימה: הייצוג הוא שער הכניסה, וכל שאר הבקשות באות אחריו —
  -- גם בכרטיס וגם בדף הלקוח (שם הפריט היה נופל אחרון, כי לא היה לו שלב).
  select coalesce(min(sort_order), 1) - 1 into v_sort
    from public.onboarding_steps
    where client_id = p_client_id and status <> 'cancelled';

  -- published_at = now(): הבקשה כבר יצאה ללקוח, ולכן היא אינה טיוטה. בלי זה
  -- הכרטיס היה מציג "שינוי אחד שלא פורסם" על משהו שהלקוח כבר ראה.
  insert into public.onboarding_steps
    (user_id, engagement_id, client_id, required_for_close, step_type, track, scope,
     status, ball, sort_order, completion_method, completed_at, published_at)
  values
    (c.user_id, v_eng, p_client_id, true, 'representation', 'authorities', 'person',
     v_status, v_ball, v_sort, 'auto',
     case when v_status = 'completed' then coalesce(r.updated_at, now()) end,
     now())
  returning id into v_id;

  return v_id;
end;
$function$

