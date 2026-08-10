-- 81 — "עדכן את דף הלקוח": פרסום כל שינויי התיק בלחיצה אחת (הכרעת D4)
--
-- הזרימה המאושרת: עורכים חופשי → תצוגה מקדימה → "עדכן את דף הלקוח" → ואז,
-- בנפרד, "לשלוח מייל עם הקישור?". הפרסום עצמו לא שולח שום מייל.
--
-- publish_case_changes עושה שלושה דברים, בסדר הזה:
-- 1. פותחת את התהליך (process_published_at) אם יש התקשרות בקליטה שטרם נפתחה —
--    דרך publish_onboarding_process הקיימת (אידמפוטנטית, רושמת ביומן).
-- 2. מחילה עריכות ממתינות (draft_payload) על בקשות שכבר פורסמו — בעזרת
--    merge_step_draft: התוכן (ניסוח, מבנה) מהטיוטה, המצב (done/value/קבצים)
--    מהחי לפי key. עריכה לעולם לא דורסת התקדמות שהלקוח כבר עשה.
-- 3. חושפת טיוטות (published_at is null ⇒ now(), והמראה payload.published יורדת).
--
-- שום מייל, שום טוקן, שום התראה ללקוח — פעולה א׳+ב׳ בלבד במודל שלוש הפעולות.

-- ── merge_step_draft — תוכן מהטיוטה, מצב מהחי ────────────────────────────────

create or replace function public.merge_step_draft(p_live jsonb, p_draft jsonb)
returns jsonb
language plpgsql
immutable
as $function$
declare
  v_out  jsonb;
  v_list jsonb;
begin
  if p_draft is null then return p_live; end if;

  v_out := coalesce(p_live, '{}'::jsonb) || (p_draft - 'checklist' - 'requirements');

  if p_draft ? 'checklist' then
    select coalesce(jsonb_agg(
             d.x || coalesce((
               select jsonb_strip_nulls(jsonb_build_object(
                        'done',       l.x->'done',
                        'documentId', l.x->'documentId',
                        'doneAt',     l.x->'doneAt'))
                 from jsonb_array_elements(coalesce(p_live->'checklist', '[]'::jsonb)) l(x)
                where l.x->>'key' = d.x->>'key'
                limit 1), '{}'::jsonb)
             order by d.ord), '[]'::jsonb)
      into v_list
      from jsonb_array_elements(p_draft->'checklist') with ordinality d(x, ord);
    v_out := v_out || jsonb_build_object('checklist', v_list);
  end if;

  if p_draft ? 'requirements' then
    select coalesce(jsonb_agg(
             d.x || coalesce((
               select jsonb_strip_nulls(jsonb_build_object(
                        'done',       l.x->'done',
                        'value',      l.x->'value',
                        'documentId', l.x->'documentId',
                        'doneAt',     l.x->'doneAt'))
                 from jsonb_array_elements(coalesce(p_live->'requirements', '[]'::jsonb)) l(x)
                where l.x->>'key' = d.x->>'key'
                limit 1), '{}'::jsonb)
             order by d.ord), '[]'::jsonb)
      into v_list
      from jsonb_array_elements(p_draft->'requirements') with ordinality d(x, ord);
    v_out := v_out || jsonb_build_object('requirements', v_list);
  end if;

  return v_out;
end;
$function$;

-- ── publish_case_changes ─────────────────────────────────────────────────────

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
  r        jsonb;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  -- 1. פתיחת תהליך שטרם נפתח — דרך הפונקציה הקיימת (יומן + אידמפוטנטיות שלה)
  for e in
    select id from public.engagements
     where client_id = c.id and status = 'onboarding' and process_published_at is null
  loop
    r := public.publish_onboarding_process(e.id);
    if coalesce((r->>'ok')::boolean, false) and not coalesce((r->>'alreadyPublished')::boolean, false) then
      v_opened := v_opened + 1;
    end if;
  end loop;

  -- 2. עריכות ממתינות על בקשות קיימות
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

  -- 3. חשיפת טיוטות
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

  return jsonb_build_object('ok', true,
    'processOpened', v_opened, 'editsApplied', v_edits, 'draftsExposed', v_exposed);
end;
$function$;

revoke all on function public.merge_step_draft(jsonb, jsonb) from public, anon;
revoke all on function public.publish_case_changes(text) from public, anon;
grant execute on function public.publish_case_changes(text) to authenticated;
