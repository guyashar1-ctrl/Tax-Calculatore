-- 274 · ליאת ברנשטיין — שורת «פעילות» על השינוי שנעשה ב-271-liat (שם הכרטיס עודכן בלי שורה).
-- באישור גיא (21.10.2026: «Approved: the 3 weak spots in representation first…»). פעם אחת בלבד.
do $$
declare s public.onboarding_steps%rowtype;
begin
  select * into s from public.onboarding_steps
   where client_id = 'dae71e10d41e4d1c9d611eb64912d1ba' and step_type = 'representation' and status <> 'cancelled'
   order by created_at desc limit 1;
  if s.id is null then raise exception 'liat: no representation step'; end if;
  if exists (select 1 from public.onboarding_events where step_id = s.id and meta ->> 'source' = 'shaam_creation_notice') then
    return;
  end if;
  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'system',
    'שע״ם העבירה את תיק מס הכנסה למספר של אוריה - אוריה סומן בכרטיס כבן הזוג הרשום, ובטופס אוריה חותם ב«בן זוג רשום» וליאת ב«בן/בת הזוג»',
    jsonb_build_object('requestId', '44efa4da044548f08a97eab6270ddb5c', 'submissionKey', 'person:client',
                       'learned', 'spouse', 'previous', null, 'source', 'shaam_creation_notice'));
end;
$$;
