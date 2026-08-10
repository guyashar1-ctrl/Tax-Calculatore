-- 83 — משימות אוטומטיות: חמושות רק אחרי פרסום, מתבצעות בדיוק פעם אחת (D3)
--
-- המודל (docs/EMAIL-POLICY.md §9, הכרעת גיא 2026-08-10):
--   ידני   — התנאים מולאו ⇒ המשימה "מוכנה לביצוע". שום דבר לא יוצא לבד.
--   אוטומטי — התנאים מולאו + התצורה פורסמה ⇒ המייל של הבקשה יוצא אוטומטית,
--             בדיוק פעם אחת, מהשרת בלבד.
--
-- תצורת האוטומציה היא תוכן: payload.autoAction = {"kind":"email"}. לכן:
-- * טיוטה אינה חמושה — execute דורש published_at (כלל D3 מס' 2).
-- * עריכת אוטומציה על בקשה שפורסמה נכתבת ל-draft_payload ונחמשת רק
--   ב"עדכן את דף הלקוח" (merge_step_draft מחיל אותה בפרסום).
-- * ביטול אוטומציה נשלח כ-autoAction:null — המפתח נדרס בפרסום.
--
-- שתי נקודות ההפעלה:
-- 1. unlock_dependent_steps — תלות אחרונה הושלמה והשלב נפתח.
-- 2. publish_case_changes — פרסום מחמש תצורה חדשה; אם התנאים כבר מולאו
--    לפני הפרסום, ההערכה־מחדש כאן מפעילה בדיוק פעם אחת (כלל D3 מס' 5).
--
-- בדיוק-פעם-אחת: התביעה האטומית נעשית ב-send-step-email (מסלול הסוד הפנימי) —
-- update … where payload->>'autoExecutedAt' is null. שתי קריאות מקבילות ⇒
-- זוכה אחד. כישלון Resend משחרר את התביעה ורושם autoError, כמו מייל הייצוג.
--
-- דרישת קשר לגורם חיצוני נבדקת כאן וגם בפונקציית השליחה — היא דרישת-מערכת
-- ואינה תלות: הסרת צ'יפ תלות אינה עוקפת אותה (Correction 1).
--
-- ‼ מנגנון מייל הייצוג (מיגרציה 72) מוגן ולא נגעו בו.

-- ── 1. execute_automatic_step — שער ההערכה. לעולם לא מפיל את הקורא. ─────────

create or replace function public.execute_automatic_step(p_step_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  -- ‼ טיוטה אינה חמושה. לעולם.
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

  -- דרישת הקשר — נמען שלא נפתר עוצר את הביצוע, בלי קשר לתלויות.
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
      'המשימה האוטומטית לא בוצעה — חסרה הגדרת שליחה פנימית',
      jsonb_build_object('automatic', true));
    return jsonb_build_object('skipped', 'missing_secrets');
  end if;

  -- נרשם בתור בתוך הטרנזקציה ויוצא רק אחרי commit — טרנזקציה שהתגלגלה
  -- לאחור אינה שולחת דבר (אותו דפוס כמו מייל הייצוג, מיגרציה 72).
  perform net.http_post(
    url := v_base || '/functions/v1/send-step-email',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('internalSecret', v_secret, 'stepId', s.id, 'kind', 'step_reminder'),
    timeout_milliseconds := 15000);

  return jsonb_build_object('ok', true, 'queued', true);
exception when others then
  -- כשל בהערכה לעולם אינו מפיל את הפעולה שמסביב (פרסום / השלמת תלות).
  return jsonb_build_object('skipped', 'error', 'detail', left(coalesce(sqlerrm, ''), 200));
end;
$function$;

revoke all on function public.execute_automatic_step(text) from public, anon, authenticated;

-- ── 1ב. התביעה האטומית ושחרורה — נקראות מ-send-step-email בלבד ───────────────
-- UPDATE יחיד עם WHERE על היעדר המפתח: שתי קריאות מקבילות ⇒ זוכה אחד.
-- ה-merge נעשה בצד המסד כדי שלא לדרוס בטעות עדכון מקביל של הלקוח ב-payload.

create or replace function public.claim_auto_execution(p_step_id text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.onboarding_steps
     set payload = (payload - 'autoError') || jsonb_build_object('autoExecutedAt', now())
   where id = p_step_id
     and payload->>'autoExecutedAt' is null;
  return found;
end;
$function$;

create or replace function public.release_auto_execution(p_step_id text, p_error text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- כישלון שליחה משחרר את התביעה — הניסיון הבא (פרסום/תלות) יוכל לירות שוב.
  update public.onboarding_steps
     set payload = (payload - 'autoExecutedAt')
                   || case when p_error is null then '{}'::jsonb
                           else jsonb_build_object('autoError', left(p_error, 300)) end
   where id = p_step_id;
end;
$function$;

revoke all on function public.claim_auto_execution(text) from public, anon, authenticated;
revoke all on function public.release_auto_execution(text, text) from public, anon, authenticated;
grant execute on function public.claim_auto_execution(text) to service_role;
grant execute on function public.release_auto_execution(text, text) to service_role;

-- ── 2. unlock_dependent_steps — נקודת הפעלה א': התלות האחרונה הושלמה ─────────

CREATE OR REPLACE FUNCTION public.unlock_dependent_steps(p_step_id text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.onboarding_steps%rowtype;
  n int := 0;
begin
  for r in
    select distinct st.* from public.onboarding_steps st
    where st.status = 'locked'
      and (st.depends_on_step_id = p_step_id
           or exists (select 1 from public.onboarding_step_dependencies d
                      where d.step_id = st.id and d.depends_on_step_id = p_step_id))
  loop
    if public.onboarding_dependency_met(r.id) then
      update public.onboarding_steps set status = 'pending' where id = r.id;
      perform public.log_onboarding_event(
        r.user_id, r.id, r.engagement_id, 'status_changed', 'system',
        'השלב נפתח — התלייה הקודמת הושלמה', jsonb_build_object('from','locked','to','pending'));
      -- משימה אוטומטית שנפתחה — ההערכה מחליטה אם לירות (חמושה? נמען פתור?).
      perform public.execute_automatic_step(r.id);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$function$;

-- ── 3. publish_case_changes — נקודת הפעלה ב': הפרסום מחמש ומעריך מחדש ────────

create or replace function public.publish_case_changes(p_client_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c        public.clients%rowtype;
  v_uid    uuid := auth.uid();
  e        record;
  s        record;
  v_opened  int := 0;
  v_edits   int := 0;
  v_exposed int := 0;
  v_auto    int := 0;
  r        jsonb;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  for e in
    select id from public.engagements
     where client_id = c.id and status = 'onboarding' and process_published_at is null
  loop
    r := public.publish_onboarding_process(e.id);
    if coalesce((r->>'ok')::boolean, false) and not coalesce((r->>'alreadyPublished')::boolean, false) then
      v_opened := v_opened + 1;
    end if;
  end loop;

  for s in
    select * from public.onboarding_steps
     where client_id = c.id and draft_payload is not null and status <> 'cancelled'
  loop
    update public.onboarding_steps
       set payload = public.merge_step_draft(payload, draft_payload) - 'published',
           draft_payload = null
     where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'accountant',
      'נוסח הבקשה עודכן ופורסם', jsonb_build_object('editApplied', true));
    v_edits := v_edits + 1;
  end loop;

  for s in
    select * from public.onboarding_steps
     where client_id = c.id and published_at is null and status <> 'cancelled'
  loop
    update public.onboarding_steps
       set published_at = now(),
           payload = payload - 'published'
     where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'accountant',
      'הבקשה נפתחה ללקוח', jsonb_build_object('published', true));
    v_exposed := v_exposed + 1;
  end loop;

  -- ‼ הערכה-מחדש אחרי חימוש (כלל D3 מס' 5): תצורה אוטומטית שפורסמה זה עתה,
  -- ושכל תנאיה כבר מולאו — מתבצעת עכשיו, בדיוק פעם אחת (התביעה בפונקציית
  -- השליחה). ההערכה עצמה בודקת טיוטה/סטטוס/תלויות/נמען ומדלגת בשקט.
  for s in
    select id from public.onboarding_steps
     where client_id = c.id
       and status in ('pending', 'in_progress')
       and payload->'autoAction'->>'kind' = 'email'
       and payload->>'autoExecutedAt' is null
  loop
    r := public.execute_automatic_step(s.id);
    if coalesce((r->>'ok')::boolean, false) then v_auto := v_auto + 1; end if;
  end loop;

  return jsonb_build_object('ok', true,
    'processOpened', v_opened, 'editsApplied', v_edits, 'draftsExposed', v_exposed,
    'autoQueued', v_auto);
end;
$function$;

revoke all on function public.publish_case_changes(text) from public, anon;
grant execute on function public.publish_case_changes(text) to authenticated;
