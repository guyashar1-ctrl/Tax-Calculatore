-- ════════════════════════════════════════════════════════════════════════════
-- 313 · «בקשות» — אוטומציה היא נקודה רגילה בשרשרת (שלב 4)
-- ════════════════════════════════════════════════════════════════════════════
-- הדמיה שאושרה: docs/proposals/2026-10-29-requests-dots-v2.html
-- תוכנית: docs/plans/2026-10-29-work-tab-dots-groups-flows.md (שלב 4)
--
-- 1. נקודת אוטומציה = משימה של המשרד (custom_request, internalTask) עם payload.automation.
--    לא בדף של הלקוח ולא במייל. נוספת מ«＋ בקשה חדשה ← אוטומציות» (add_automation_step)
--    או נפתחת מכלל (פריט action עם asStep).
-- 2. כשמגיע תורה (pending): קריאה רצה לבד — דרך _flow_run_action, עם כל השערים הקיימים
--    (מיוצג, מחשב עבודה מחובר ופנוי, לא נקרא בשבוע האחרון); אם שער לא עובר — נשארת
--    «עליך» עם הכפתור. כתיבה ברשות — תמיד מחכה ללחיצה על הכפתור בשם הפעולה.
--    ‼ הוספת הנקודה (או שמירתה בכלל) היא ההרשאה של המשרד לקריאה לבד.
-- 3. ריצה שהצליחה (מכל מקום — השורה, תיק המס, מרכז הייצוג) סוגרת את הנקודה הפתוחה של אותה
--    פעולה לאותו לקוח ⇒ ירוק (310), והבאה בקבוצה נפתחת (unlock_dependent_steps).
-- 4. בכלל: פריט action עם asStep נוצר כבקשה, יכול לחכות לקודמת ולהיות שער. פריט action
--    בלי asStep — בדיוק כמו היום (רצועת המסלול בכרטיס).
-- ‼ ההגדרה של כל פעולה נשארת במקום אחד — עמוד «אוטומציות» (automationCatalog.ts); כאן רק
--   השם (= FLOW_ACTION_NAMES / SHAAM_ISSUE_CERTIFICATES_ACTION_NAME) ואופי הפעולה.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. אילו פעולות יכולות להיות נקודה, ובאיזה שם ────────────────────────────
create or replace function public._automation_step_name(p_action_type text)
returns text language sql immutable set search_path to 'public' as $$
  select case p_action_type
    when 'shaam.sync_income_tax_file' then 'קריאת תיק מס הכנסה מהשע״ם'
    when 'btl.sync_file' then 'קריאת התיק בביטוח לאומי'
    when 'shaam.issue_annual_certificates' then 'הנפקת אישורי ניכוי וניהול ספרים'
  end;
$$;

create or replace function public._automation_step_payload(p_action_type text)
returns jsonb language sql immutable set search_path to 'public' as $$
  select jsonb_build_object(
    'title', public._automation_step_name(p_action_type),
    'automation', jsonb_build_object('actionType', p_action_type),
    'internalTask', true,
    -- ‼ בקשה חופשית חייבת דרישה; «בוצע» ידני נשאר אפשרי (המשרד עשה את זה בעצמו).
    'requirements', jsonb_build_array(jsonb_build_object(
      'key', 'done', 'kind', 'confirm', 'label', public._automation_step_name(p_action_type))));
$$;

-- ── 2. הוספה מ«＋ בקשה חדשה ← אוטומציות» ─────────────────────────────────────
-- ‼ אידמפוטנטית בשרת: נקודה פתוחה של אותה פעולה ללקוח — מוחזרת, לא נוצרת שנייה.
create or replace function public.add_automation_step(p_client_id text, p_action_type text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c     public.clients%rowtype;
  v_id  text;
  v_res jsonb;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null or auth.uid() is null or c.user_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if public._automation_step_name(p_action_type) is null then
    return jsonb_build_object('ok', false, 'error', 'not_supported');
  end if;
  select id into v_id from public.onboarding_steps
   where client_id = c.id and payload->'automation'->>'actionType' = p_action_type
     and status not in ('completed', 'verified', 'skipped', 'cancelled')
   order by created_at limit 1;
  if v_id is not null then return jsonb_build_object('ok', true, 'stepId', v_id, 'existed', true); end if;

  v_res := public.create_onboarding_request(c.id, 'custom_request', public._automation_step_payload(p_action_type),
             p_owner => 'me');
  if coalesce(v_res->>'ok', 'false') <> 'true' then
    return jsonb_build_object('ok', false, 'error', coalesce(v_res->>'error', 'create_failed'));
  end if;
  return jsonb_build_object('ok', true, 'stepId', v_res->>'stepId', 'existed', false);
end;
$function$;

-- ── 3. כשמגיע התור — קריאה רצה לבד ──────────────────────────────────────────
create or replace function public._automation_step_kick(p_step_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s     public.onboarding_steps%rowtype;
  r     public.flow_runs%rowtype;
  v_type text;
  v_res jsonb;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null or s.status <> 'pending' then return; end if;
  v_type := s.payload->'automation'->>'actionType';
  -- כתיבה ברשות — רק בלחיצה.
  if not public.flow_auto_action_allowed(v_type) then return; end if;
  -- ‼ אותם שערים בדיוק כמו פעולה במסלול (215); ההרשאה = המשרד הוסיף את הנקודה.
  r.user_id := s.user_id;
  r.client_id := s.client_id;
  r.state := jsonb_build_object('autoActions', true);
  v_res := public._flow_run_action(r, jsonb_build_object(
    'key', s.id, 'mode', 'auto', 'ref', jsonb_build_object('kind', 'action', 'actionType', v_type)));
  -- נקרא בשבוע האחרון — הנקודה הושלמה בלי לקרוא שוב.
  if v_res->>'reason' = 'recent_job' then
    perform public._set_step_status(s.id, 'completed', 'system',
      '«' || public._automation_step_name(v_type) || '» — כבר נקרא בשבוע האחרון',
      jsonb_build_object('automation', v_type, 'recent', true));
  end if;
end;
$function$;

-- ‼ נדחה לסוף הטרנזקציה: בקשה במסלול נוצרת 'pending' ורק אחר כך ננעלת על הקודמת —
--   בלי הדחייה הקריאה הייתה יוצאת לפני תורה.
create or replace function public._automation_step_on_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then return null; end if;
  perform public._automation_step_kick(new.id);
  return null;
end;
$function$;

drop trigger if exists onboarding_steps_automation_kick on public.onboarding_steps;
create constraint trigger onboarding_steps_automation_kick
  after insert or update of status on public.onboarding_steps
  deferrable initially deferred
  for each row when (new.payload ? 'automation' and new.status = 'pending')
  execute function public._automation_step_on_status();

-- ── 4. ריצה שהצליחה סוגרת את הנקודה ─────────────────────────────────────────
create or replace function public._automation_job_closes_steps()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s record;
begin
  if new.status <> 'succeeded' or old.status is not distinct from new.status or new.client_id is null then return null; end if;
  for s in select id from public.onboarding_steps
            where client_id = new.client_id and status = 'pending'
              and payload->'automation'->>'actionType' = new.action_type loop
    perform public._set_step_status(s.id, 'completed', 'system',
      '«' || coalesce(public._automation_step_name(new.action_type), new.action_type) || '» הסתיים בהצלחה',
      jsonb_build_object('automation', new.action_type, 'jobId', new.id));
  end loop;
  return null;
end;
$function$;

drop trigger if exists automation_jobs_close_steps on public.automation_jobs;
create trigger automation_jobs_close_steps
  after update of status on public.automation_jobs
  for each row when (new.status = 'succeeded')
  execute function public._automation_job_closes_steps();

revoke all on function public._automation_step_name(text) from public, anon;
revoke all on function public._automation_step_payload(text) from public, anon;
revoke all on function public.add_automation_step(text, text) from public, anon;
revoke all on function public._automation_step_kick(text) from public, anon, authenticated;
revoke all on function public._automation_step_on_status() from public, anon, authenticated;
revoke all on function public._automation_job_closes_steps() from public, anon, authenticated;
grant execute on function public._automation_step_name(text) to authenticated, service_role;
grant execute on function public._automation_step_payload(text) to authenticated, service_role;
grant execute on function public.add_automation_step(text, text) to authenticated;
grant execute on function public._automation_step_kick(text) to service_role;

-- ── 5. המנוע: פריט action עם asStep ─────────────────────────────────────────
-- ── flow_definition_error — הגוף החי (זהה בייצור וב-staging, 30.10.2026) + 313 ──
CREATE OR REPLACE FUNCTION public.flow_definition_error(p_def jsonb, p_trigger text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  st  jsonb;
  it  jsonb;
  v_stage_keys text[] := '{}';
  v_item_keys  text[] := '{}';
  v_item_stage jsonb := '{}'::jsonb;
  v_item_kind  jsonb := '{}'::jsonb;
  v_parent     jsonb := '{}'::jsonb;
  v_cur        text;
  v_seen       text[];
  v_onb        boolean := p_trigger = 'quote_approved';
begin
  if p_def is null or coalesce(jsonb_typeof(p_def), '') <> 'object' or coalesce(jsonb_typeof(p_def->'stages'), '') <> 'array'
     or jsonb_array_length(p_def->'stages') = 0 then
    return 'no_stages';
  end if;
  for st in select value from jsonb_array_elements(p_def->'stages') loop
    if coalesce(nullif(st->>'key', ''), '') = '' then return 'stage_without_key'; end if;
    if st->>'key' = any (v_stage_keys) then return 'duplicate_stage_key'; end if;
    if coalesce(trim(st->>'name'), '') = '' then return 'stage_without_name'; end if;
    if coalesce(st->>'delivery', '') not in ('approve', 'auto', 'hold', 'page') then return 'bad_delivery'; end if;
    if coalesce(jsonb_typeof(st->'items'), '') <> 'array' then return 'stage_without_items'; end if;
    v_stage_keys := v_stage_keys || (st->>'key');
    for it in select value from jsonb_array_elements(st->'items') loop
      if coalesce(nullif(it->>'key', ''), '') = '' then return 'item_without_key'; end if;
      if it->>'key' = any (v_item_keys) then return 'duplicate_item_key'; end if;
      if coalesce(it->'ref'->>'kind', '') not in ('system', 'template', 'document', 'action') then return 'bad_ref'; end if;
      if it->'ref'->>'kind' = 'action' then
        -- ‼ רק פעולות קריאה שיש להן מבצע. פעולה שאינה קיימת לא מוצגת כאילו קיימת.
        -- 313: אוטומציה כנקודה (asStep) — גם פעולת כתיבה, בלחיצה בלבד (_automation_step_name).
        if not (public.flow_auto_action_allowed(it->'ref'->>'actionType')
                or (coalesce(it->>'asStep', 'false') = 'true' and public._automation_step_name(it->'ref'->>'actionType') is not null)) then
          return 'action_not_supported';
        end if;
        if coalesce(it->>'perPerson', 'false') = 'true' then return 'action_per_person'; end if;
      elsif it->'ref'->>'kind' = 'system' then
        if not v_onb and coalesce(it->>'fixed', 'false') <> 'true' then return 'system_in_repeatable_flow'; end if;
        if v_onb and coalesce(it->>'fixed', 'false') <> 'true' then
          if coalesce(st->'opens'->>'after', 'start') <> 'start' then return 'system_in_later_stage'; end if;
          if jsonb_typeof(it->'when'->'facts') = 'array' and jsonb_array_length(it->'when'->'facts') > 0 then
            return 'system_with_facts';
          end if;
          if jsonb_typeof(st->'when'->'facts') = 'array' and jsonb_array_length(st->'when'->'facts') > 0 then
            return 'system_with_facts';
          end if;
          -- ‼ «מסמכים מהלקוח» במצב בלי אף מסמך: המחולל יוצר ממנו «להעלות 0 מסמכים» — בקשה
          -- ריקה בדף של לקוח חדש. אותה בדיקה כמו validateFlow (compile.ts). פריט בלי
          -- מצבים משלו נופל לרשימות הקבועות — תקין.
          if it->'ref'->>'stepType' = 'client_documents' and jsonb_typeof(it->'system'->'variants') = 'array'
             and exists (select 1 from jsonb_array_elements(it->'system'->'variants') v
                          where not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(v->'items') = 'array'
                                                                                    then v->'items' else '[]'::jsonb end) x
                                             where coalesce(trim(x->>'label'), '') <> '')) then
            return 'variant_without_documents';
          end if;
        end if;
        if coalesce(it->>'perPerson', 'false') = 'true' then return 'system_per_person'; end if;
      end if;
      if v_onb and coalesce(it->>'perPerson', 'false') = 'true' then return 'per_person_in_onboarding'; end if;
      v_item_keys := v_item_keys || (it->>'key');
      v_item_stage := v_item_stage || jsonb_build_object(it->>'key', st->>'key');
      v_item_kind := v_item_kind || jsonb_build_object(it->>'key', case when coalesce(it->>'asStep', 'false') = 'true' then 'step' else it->'ref'->>'kind' end);
    end loop;
  end loop;
  for st in select value from jsonb_array_elements(p_def->'stages') loop
    if st->'opens'->>'after' = 'stage' then
      if coalesce(st->'opens'->>'stage', '') = '' or not (st->'opens'->>'stage' = any (v_stage_keys))
         or st->'opens'->>'stage' = st->>'key' then
        return 'bad_opens';
      end if;
      v_parent := v_parent || jsonb_build_object(st->>'key', st->'opens'->>'stage');
    elsif st->'opens'->>'after' = 'item' then
      if coalesce(st->'opens'->>'item', '') = '' or not (st->'opens'->>'item' = any (v_item_keys))
         or v_item_stage->>(st->'opens'->>'item') = st->>'key' then
        return 'bad_opens';
      end if;
      -- ‼ פעולה מול רשות אינה שער: אין לה «הושלם» שאפשר לחכות לו.
      if v_item_kind->>(st->'opens'->>'item') = 'action' then return 'opens_after_action'; end if;
      v_parent := v_parent || jsonb_build_object(st->>'key', v_item_stage->>(st->'opens'->>'item'));
    elsif coalesce(st->'opens'->>'after', '') <> 'start' then
      return 'bad_opens';
    end if;
    for it in select value from jsonb_array_elements(st->'items') loop
      if nullif(it->>'after', '') is not null then
        if coalesce(v_item_stage->>(it->>'after'), '') <> st->>'key' then return 'bad_after'; end if;
        if v_item_kind->>(it->>'after') = 'action' or (it->'ref'->>'kind' = 'action' and not coalesce(it->>'asStep', 'false') = 'true') then return 'after_action'; end if;
      end if;
    end loop;
  end loop;
  -- שלבים שנפתחים זה אחרי זה במעגל
  for st in select value from jsonb_array_elements(p_def->'stages') loop
    v_seen := array[st->>'key'];
    v_cur := v_parent->>(st->>'key');
    while v_cur is not null loop
      if v_cur = any (v_seen) then return 'stage_cycle'; end if;
      v_seen := v_seen || v_cur;
      v_cur := v_parent->>v_cur;
    end loop;
  end loop;
  return null;
end;
$function$;

-- ── _flow_item_spec — הגוף החי (זהה בייצור וב-staging, 30.10.2026) + 313 ──
CREATE OR REPLACE FUNCTION public._flow_item_spec(p_user_id uuid, p_item jsonb, p_repeatable boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_office uuid;
  t        public.journey_templates%rowtype;
  e        jsonb;
  v_type   text;
  v_payload jsonb;
  v_owner  text;
  v_name   text;
begin
  select office_id into v_office from public.profiles where id = p_user_id;

  case p_item->'ref'->>'kind'
    when 'template' then
      t := public._library_template(v_office, p_item->'ref'->>'templateId');
      if t.id is not null and jsonb_typeof(t.entries) = 'array' and jsonb_array_length(t.entries) > 0 then
        e := t.entries->0;
        v_type := coalesce(nullif(e->>'stepType', ''), 'custom_request');
        v_payload := coalesce(e->'payload', '{}'::jsonb);
        -- ‼ 217 (D): כלל אחד לבעלים של רשומה בספרייה (_template_entry_owner, 216 §9).
        v_owner := public._template_entry_owner(e);
        v_name := t.name;
      elsif jsonb_typeof(p_item->'snapshot') = 'object' then
        v_type := coalesce(nullif(p_item->'snapshot'->>'stepType', ''), 'custom_request');
        v_payload := coalesce(p_item->'snapshot'->'payload', '{}'::jsonb);
        v_owner := 'client';
        v_name := p_item->'snapshot'->>'title';
      else
        return jsonb_build_object('ok', false, 'reason', 'library_item_missing');
      end if;
    when 'document' then
      v_payload := public._document_request_payload(p_user_id, p_item->'ref'->>'docId');
      -- ‼ קובץ שהוסר מהספרייה ⇒ הבקשה לא נוצרת (כך המסך מבטיח). העותק השמור בפריט
      -- היה פותח ללקוח «לפתיחת המסמך» בלי מסמך, עם «עברתי על המסמך» לסמן.
      if v_payload is null then
        return jsonb_build_object('ok', false, 'reason', 'library_item_missing');
      end if;
      v_type := 'custom_request';
      v_owner := 'client';
      v_name := v_payload->>'title';
    when 'system' then
      v_type := p_item->'ref'->>'stepType';
      select * into t from public.journey_templates
       where kind = 'request' and seed_key = v_type and (office_id = v_office or office_id is null)
       order by (office_id is not null) desc limit 1;
      v_payload := coalesce(t.entries->0->'payload', '{}'::jsonb);
      v_owner := null;
      v_name := coalesce(t.name, v_type);
    when 'action' then
      -- 313 · אוטומציה כנקודה בקבוצה: משימה של המשרד שמריצה את הפעולה (_automation_step_kick).
      if coalesce(p_item->>'asStep', 'false') <> 'true' or public._automation_step_name(p_item->'ref'->>'actionType') is null then
        return jsonb_build_object('ok', false, 'reason', 'not_a_request');
      end if;
      v_payload := public._automation_step_payload(p_item->'ref'->>'actionType');
      v_type := 'custom_request';
      v_owner := 'me';
      v_name := v_payload->>'title';
    else
      return jsonb_build_object('ok', false, 'reason', 'not_a_request');
  end case;

  -- ‼ מסלול שחוזר: כל שנה נוצרת בקשה חדשה. סוג שהוא «אחד ללקוח לכל חייו» (שאלון,
  -- זיהוי, פרטי רו"ח קודם…) היה נבלע ב-step_type_exists ומסומן «הושלם בעבר» — כלומר
  -- שנה קודמת פוטרת את החדשה. רק בקשה חופשית ובקשת מסמכים (שהופכת לחופשית) חוזרות.
  if p_repeatable and p_item->'ref'->>'kind' = 'template'
     and v_type not in ('custom_request', 'client_documents') then
    return jsonb_build_object('ok', false, 'reason', 'not_repeatable');
  end if;

  if p_repeatable and v_type = 'client_documents' then
    -- ‼ הנוסח ללקוח נגזר מהרשימה כפי שהיא עכשיו (כמו בעורך: «נגזרת מהרשימה»).
    -- הטקסט השמור הוא של הרשימה הישנה — מובנית שהותאמה מ-2 ל-4 מסמכים אמרה «להעלות 2».
    v_payload := jsonb_strip_nulls(jsonb_build_object(
      'title', coalesce(v_name, 'מסמכים מהלקוח'),
      'clientTitle', coalesce(v_name, 'מסמכים מהלקוח'),
      'clientSub', (select string_agg(x->>'label', ' · ' order by o)
                      from jsonb_array_elements(case when jsonb_typeof(v_payload->'checklist') = 'array'
                                                     then v_payload->'checklist' else '[]'::jsonb end) with ordinality as a(x, o)
                     where nullif(trim(x->>'label'), '') is not null),
      'clientCta', coalesce(nullif(v_payload->>'clientCta', ''), 'להעלאה'),
      'requirements', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'key', coalesce(nullif(x->>'key', ''), 'd' || o),
                 'kind', 'file', 'label', x->>'label', 'done', false, 'required', true) order by o)
          from jsonb_array_elements(case when jsonb_typeof(v_payload->'checklist') = 'array'
                                         then v_payload->'checklist' else '[]'::jsonb end) with ordinality as a(x, o)),
        '[]'::jsonb)));
    v_type := 'custom_request';
    v_owner := 'client';
  end if;

  if not (v_type = any (public.request_creatable_step_types())) then
    return jsonb_build_object('ok', false, 'reason', 'not_creatable');
  end if;
  -- ‼ 217 (D): משימה של המשרד נולדת מסומנת — לא בדף של הלקוח ולא במייל, גם כשיש בה
  -- «מה צריך לעשות» (הרשימה היא של המשרד). הודעת מלל — כן בדף.
  if v_type = 'custom_request' and v_owner = 'me' and coalesce(v_payload->>'messageOnly', '') <> 'true' then
    v_payload := v_payload || jsonb_build_object('internalTask', true);
  end if;
  return jsonb_build_object('ok', true, 'stepType', v_type, 'payload', v_payload,
                            'owner', v_owner, 'title', v_name);
end;
$function$;

-- ── _flow_materialize — הגוף החי (זהה בייצור וב-staging, 30.10.2026) + 313 ──
CREATE OR REPLACE FUNCTION public._flow_materialize(p_run_id text, p_item_keys text[] DEFAULT NULL::text[], p_roles text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r        public.flow_runs%rowtype;
  v_def    jsonb;
  st       jsonb;
  it       jsonb;
  v_role   text;
  v_roles  text[];
  v_spec   jsonb;
  v_payload jsonb;
  v_res    jsonb;
  v_step   text;
  v_exist  public.onboarding_steps%rowtype;
  v_created jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_touched text[] := '{}';
  v_repeat boolean;
  v_name   text;
  v_title  text;
  v_office_task boolean;
  v_base_title text;
  v_parents text[];
  v_kind   text;
  v_kinds  text[];
  v_page_reqs jsonb;
  v_lib_title text;
  v_lib_ctitle text;
  v_pkey   text;
  v_found  text;
  v_skip   jsonb;
  v_resolve jsonb := '[]'::jsonb;
  x        jsonb;
begin
  select * into r from public.flow_runs where id = p_run_id;
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'run_not_found'); end if;
  v_def := public._flow_def(r.flow_id, r.flow_version);
  v_repeat := r.trigger <> 'quote_approved';

  for st in select value from jsonb_array_elements(v_def->'stages') loop
    for it in select value from jsonb_array_elements(st->'items') loop
      continue when p_item_keys is not null and not ((it->>'key') = any (p_item_keys));
      continue when coalesce(it->>'fixed', 'false') = 'true' or (it->'ref'->>'kind' = 'action' and not coalesce(it->>'asStep', 'false') = 'true');
      -- ‼ בקשות המערכת של הקליטה נוצרות רק במחולל (שם התוכן שלהן: סכום, רשימה, קישור).
      if not v_repeat and it->'ref'->>'kind' = 'system' then
        v_skipped := v_skipped || jsonb_build_object('itemKey', it->>'key', 'reason', 'generator_only');
        continue;
      end if;
      -- ‼ 217: סוג העוסק לא ידוע והתנאי תלוי בו — לא «לא חל» ולא ניחוש. מחכה לסוג:
      -- כשנקבע, «מתאים עכשיו» מציע להוסיף (flow_run_suggestions).
      if public._flow_kind_waits(st->'when', r.facts) or public._flow_kind_waits(it->'when', r.facts) then
        v_skipped := v_skipped || jsonb_build_object('itemKey', it->>'key', 'reason', 'kind_unknown');
        continue;
      end if;
      if not (public._flow_when_matches_kind(st->'when', r.facts) and public._flow_when_matches_kind(it->'when', r.facts)) then
        v_skipped := v_skipped || jsonb_build_object('itemKey', it->>'key', 'reason', 'not_applicable');
        -- ‼ 217: שורת «לא נוצרה» של פריט שכבר לא חל נסגרת (אחרי הקשתות, למטה).
        v_resolve := v_resolve || jsonb_build_object('item', it->>'key', 'how', 'not_applicable');
        continue;
      end if;

      v_roles := case when coalesce(it->>'perPerson', 'false') = 'true' and coalesce((r.facts->>'hasSpouse')::boolean, false)
                      then array['client', 'spouse'] else array['client'] end;
      -- ‼ «גם לבן/בת הזוג», הלקוח נשוי/אה — ואין בכרטיס שם לבן/בת הזוג (spouseNameMissing):
      -- לא דילוג שקט. שורת «לא נוצרה» לבן/בת הזוג, ו«צור שוב» אחרי שהשם נכתב בתיק המס
      -- (flow_run_add_items מרעננת את העובדות). כשהבקשה נוצרת — השורה נסגרת (v_resolve).
      if coalesce(it->>'perPerson', 'false') = 'true' and not ('spouse' = any (v_roles))
         and coalesce((r.facts->>'spouseNameMissing')::boolean, false)
         and (p_roles is null or 'spouse' = any (p_roles)) then
        v_skipped := v_skipped || (jsonb_build_object('itemKey', it->>'key', 'role', 'spouse', 'reason', 'spouse_name_missing')
                     || public._flow_record_creation_problem(r, st, it, 'spouse', 'spouse_name_missing', null, false));
      elsif coalesce(it->>'perPerson', 'false') = 'true' and not ('spouse' = any (v_roles))
            and (p_roles is null or 'spouse' = any (p_roles)) then
        -- כבר אין בן/בת זוג כאן (לא נשוי/אה, או שיש לו/ה כרטיס משלו) ⇒ שורת «חסר שם» פתוחה נסגרת כ«לא חלה».
        v_resolve := v_resolve || jsonb_build_object('key', 'flow:' || r.id || ':' || (it->>'key') || ':spouse', 'how', 'not_applicable');
      end if;
      if p_roles is not null then
        select coalesce(array_agg(x2), '{}') into v_roles from unnest(v_roles) x2 where x2 = any (p_roles);
      end if;

      foreach v_role in array v_roles loop
        -- ‼ 217: המפתח של שורת «לא נוצרה» — לפריט ולאדם (אישור אישי: «:confirm»).
        v_pkey := 'flow:' || r.id || ':' || (it->>'key') || ':' || v_role;
        -- כבר קיים בריצה הזאת (לאותו אדם) ⇒ לא שוב. ‼ שורת «לא נוצרה» אינה הבקשה.
        v_found := null;
        select s.id into v_found from public.onboarding_steps s
         where s.flow_run_id = r.id and s.flow_item_key = it->>'key' and s.status <> 'cancelled'
           and not (s.payload ? 'creationProblem')
           and coalesce(s.payload->>'subjectRole', '') =
               case when coalesce(it->>'perPerson', 'false') = 'true' then v_role else '' end
         limit 1;
        if v_found is not null then
          v_skipped := v_skipped || jsonb_build_object('itemKey', it->>'key', 'role', v_role, 'reason', 'exists');
          v_resolve := v_resolve || jsonb_build_object('key', v_pkey, 'how', 'exists', 'stepId', v_found);
          continue;
        end if;

        v_spec := public._flow_item_spec(r.user_id, it, v_repeat);
        if not coalesce((v_spec->>'ok')::boolean, false) then
          v_skip := jsonb_build_object('itemKey', it->>'key', 'role', v_role, 'reason', v_spec->>'reason');
          -- ‼ 217: בקשה שהייתה אמורה להיווצר ולא נוצרה — שורה אדומה ב«בקשות» (לא רק הערה שנעלמת).
          v_skip := v_skip || public._flow_record_creation_problem(r, st, it, v_role, v_spec->>'reason', null, false);
          v_skipped := v_skipped || v_skip;
          continue;
        end if;
        -- ‼ אישור אישי של בן/בת הזוג: אין לו/ה דף משלו, ובעל הכרטיס לא מאשר במקומו/ה
        -- (CLAUDE.md §9). לא משמיטים בשקט בקשה נדרשת — נפתחת משימה למשרד שאומרת
        -- מה חסר ואיך ממשיכים. לא מופיעה בדף הלקוח ולא במייל (בעלים: המשרד, ו-216
        -- מוריד אותה מהדף). ‼ בקשה שיש בה גם קבצים/פרטים: החלק הזה נפתח בדף של בעל
        -- הכרטיס כרגיל (משק בית שמגיש יחד), ורק האישור עובר למשימה — לא נבלע.
        v_kinds := array['normal'];
        if v_role = 'spouse' and public._flow_has_personal_confirm(v_spec->'payload') then
          select coalesce(jsonb_agg(x3 order by o), '[]'::jsonb) into v_page_reqs
            from jsonb_array_elements(v_spec->'payload'->'requirements') with ordinality as t(x3, o)
           where x3->>'kind' <> 'confirm';
          v_kinds := case when jsonb_array_length(v_page_reqs) > 0 then array['page', 'office'] else array['office'] end;
        end if;

        foreach v_kind in array v_kinds loop
        v_office_task := v_kind = 'office';

        -- ‼ שדות של ריצה/אדם ששרדו בבקשה שנשמרה לספרייה לא עוברים הלאה.
        v_payload := (coalesce(v_spec->'payload', '{}'::jsonb) - 'delivery' - 'reminder' - 'flowOrigin'
                        - 'subjectRole' - 'subjectName' - 'detachedFromFlowRun' - 'carriedFrom' - 'cancelledBy' - 'skipReason')
          || jsonb_build_object('delivery', coalesce(st->>'delivery', 'approve'),
                                'flowOrigin', jsonb_build_object('runId', r.id, 'itemKey', it->>'key', 'stageKey', st->>'key'))
          || case when jsonb_typeof(st->'reminder') = 'object'
                  then jsonb_build_object('reminder', st->'reminder') else '{}'::jsonb end;
        -- השם כפי שהוא בספרייה — כדי ש«שמור כתבנית» לא יעתיק שנה ושם של אדם ללקוח אחר.
        v_lib_title := coalesce(nullif(v_payload->>'title', ''), v_spec->>'title');
        v_lib_ctitle := nullif(v_payload->>'clientTitle', '');
        -- ‼ מסלול שנתי: השנה בכותרת. שתי שנים פתוחות אצל אותו לקוח (באוקטובר — 2025
        -- ו-2026) היו שתי שורות זהות במשרד, בדף של הלקוח ובמייל.
        if r.trigger = 'annual' and coalesce(r.cycle_key, '') ~ '^\d{4}$' then
          v_title := coalesce(nullif(v_payload->>'title', ''), v_spec->>'title');
          if v_title is not null and position(r.cycle_key in v_title) = 0 then
            v_payload := v_payload || jsonb_build_object('title', v_title || ' (' || r.cycle_key || ')');
          end if;
          if nullif(v_payload->>'clientTitle', '') is not null and position(r.cycle_key in v_payload->>'clientTitle') = 0 then
            v_payload := v_payload || jsonb_build_object('clientTitle', (v_payload->>'clientTitle') || ' (' || r.cycle_key || ')');
          end if;
        end if;
        v_base_title := coalesce(nullif(v_payload->>'title', ''), v_spec->>'title', 'בקשה');
        if coalesce(it->>'perPerson', 'false') = 'true' then
          v_name := case when v_role = 'spouse' then r.facts->>'spouseFirstName' else r.facts->>'clientFirstName' end;
          v_title := coalesce(nullif(v_payload->>'title', ''), v_spec->>'title', 'בקשה');
          v_payload := v_payload || jsonb_strip_nulls(jsonb_build_object(
            'subjectRole', v_role,
            'subjectName', v_name,
            -- ‼ הנושא חד-משמעי בכותרת כשיש שני אנשים — כמו כל בקשה לאדם (§9).
            'title', case when array_length(v_roles, 1) > 1 or v_role = 'spouse'
                          then v_title || ' - ' || coalesce(v_name, case when v_role = 'spouse' then 'בן/בת הזוג' else 'הלקוח' end)
                          else v_title end,
            'clientTitle', case when nullif(v_payload->>'clientTitle', '') is not null
                                     and (array_length(v_roles, 1) > 1 or v_role = 'spouse')
                                then (v_payload->>'clientTitle') || ' - ' || coalesce(v_name, case when v_role = 'spouse' then 'בן/בת הזוג' else 'הלקוח' end)
                                else v_payload->>'clientTitle' end));
        end if;
        if v_payload->>'title' is distinct from v_lib_title or v_payload->>'clientTitle' is distinct from v_lib_ctitle then
          v_payload := v_payload || jsonb_strip_nulls(jsonb_build_object('baseTitle', v_lib_title, 'baseClientTitle', v_lib_ctitle));
        end if;
        if v_kind = 'page' then
          v_payload := v_payload || jsonb_build_object('requirements', v_page_reqs);
        end if;

        if v_office_task then
          v_name := coalesce(nullif(r.facts->>'spouseFirstName', ''), 'בן/בת הזוג');
          v_payload := jsonb_strip_nulls(jsonb_build_object(
            'title', 'אישור אישי של ' || v_name || ' — «' || v_base_title || '»',
            'subjectRole', 'spouse', 'subjectName', r.facts->>'spouseFirstName',
            'personalConfirmFor', it->>'key',
            -- ‼ שמות הכפתורים כמו בשורה (OnboardingTab): «בוצע — התקבל האישור» / «אין צורך».
            'officeNote', 'האישור הזה אישי ל' || v_name || ', ואין לו/ה דף משלו/ה — לכן הוא לא עבר לדף של בעל הכרטיס. '
              || case when 'page' = any (v_kinds)
                      then 'שאר הבקשה (בלי האישור) מופיעה בדף של בעל הכרטיס כרגיל. ' else '' end
              || 'קבל את האישור מ' || v_name || ' (בחתימה, במייל או בפגישה) ולחץ «בוצע — התקבל האישור», או «אין צורך».',
            'delivery', v_payload->>'delivery', 'flowOrigin', v_payload->'flowOrigin',
            'requirements', '[]'::jsonb));
        end if;
        v_res := public.create_onboarding_request(
          r.client_id, case when v_office_task then 'custom_request' else v_spec->>'stepType' end, v_payload,
          p_due_date => case when coalesce(it->>'dueInDays', '') ~ '^\d{1,3}$' then current_date + (it->>'dueInDays')::int end,
          p_depends_on => null,
          p_published => v_office_task or coalesce(st->>'delivery', 'approve') <> 'hold',
          -- ‼ רק מסלול הקליטה חוסם את סגירת הקליטה; מסלול שנתי/ידני לא.
          p_required_for_close => (not v_repeat) and coalesce(it->>'optional', 'false') <> 'true',
          p_owner => case when v_office_task then 'me' else v_spec->>'owner' end,
          p_stage_id => null);

        if coalesce((v_res->>'ok')::boolean, false) then
          v_step := v_res->>'stepId';
        elsif v_res->>'error' = 'step_type_exists' then
          -- בקשה מאותו סוג כבר קיימת אצל הלקוח: מצרפים רק אם היא פתוחה ולא שייכת לריצה אחרת.
          -- ‼ 217: פתוחה קודם (סוג «לכל התקשרות» — אחת פתוחה ללקוח, ואחרות שהושלמו בהתקשרויות קודמות).
          select * into v_exist from public.onboarding_steps
           where client_id = r.client_id and step_type = v_spec->>'stepType' and status <> 'cancelled'
           order by (status not in ('completed', 'verified', 'skipped')) desc,
                    (engagement_id is not distinct from r.engagement_id) desc, created_at desc limit 1;
          if v_exist.status in ('completed', 'verified', 'skipped') then
            v_skipped := v_skipped || jsonb_build_object('itemKey', it->>'key', 'role', v_role, 'reason', 'already_done', 'stepId', v_exist.id);
            v_resolve := v_resolve || jsonb_build_object('key', v_pkey, 'how', 'exists', 'stepId', v_exist.id);
            continue;
          elsif v_exist.flow_run_id is not null and v_exist.flow_run_id <> r.id then
            v_skipped := v_skipped || jsonb_build_object('itemKey', it->>'key', 'role', v_role, 'reason', 'in_other_run', 'stepId', v_exist.id);
            v_resolve := v_resolve || jsonb_build_object('key', v_pkey, 'how', 'exists', 'stepId', v_exist.id);
            continue;
          end if;
          v_step := v_exist.id;
          v_created := v_created || jsonb_build_object('itemKey', it->>'key', 'stepId', v_step, 'attached', true);
          update public.onboarding_steps
             set flow_run_id = r.id, flow_stage_key = st->>'key', flow_item_key = it->>'key'
           where id = v_step;
          v_touched := v_touched || v_step;
          v_resolve := v_resolve || jsonb_build_object('key', v_pkey, 'how', 'exists', 'stepId', v_step);
          continue;
        else
          v_skip := jsonb_build_object('itemKey', it->>'key', 'role', v_role, 'reason', coalesce(v_res->>'error', 'create_failed'));
          v_skip := v_skip || public._flow_record_creation_problem(r, st, it, v_role, coalesce(v_res->>'error', 'create_failed'),
                                v_spec->>'title', v_office_task);
          v_skipped := v_skipped || v_skip;
          continue;
        end if;

        update public.onboarding_steps
           set flow_run_id = r.id, flow_stage_key = st->>'key', flow_item_key = it->>'key'
         where id = v_step;
        v_created := v_created || (jsonb_build_object('itemKey', it->>'key', 'stepId', v_step, 'role', v_role)
                     || case when v_office_task then jsonb_build_object('officeTask', true) else '{}'::jsonb end);
        v_touched := v_touched || v_step;
        v_resolve := v_resolve || jsonb_build_object('key', v_pkey, 'how', 'created', 'stepId', v_step);
        if v_office_task then
          v_resolve := v_resolve || jsonb_build_object('key', v_pkey || ':confirm', 'how', 'created', 'stepId', v_step);
        end if;
        end loop;  -- v_kind
      end loop;
    end loop;
  end loop;

  -- מעבר שני: קשתות. שלב «אחרי» ⇒ הצעדים של השלב/הפריט שלפניו; «אחרי» בתוך השלב ⇒ הפריט.
  for v_step in select unnest(v_touched) loop
    select x4.v into st
      from jsonb_array_elements(v_def->'stages') as x4(v)
     where x4.v->>'key' = (select flow_stage_key from public.onboarding_steps where id = v_step);
    select x5 into it
      from jsonb_array_elements(st->'items') x5
     where x5->>'key' = (select flow_item_key from public.onboarding_steps where id = v_step);
    v_parents := case when (r.state->'stages'->(st->>'key')->>'openedAt') is not null then '{}'::text[]
                      else public._flow_gate_steps(r.id, v_def, st->'opens') end;
    if nullif(it->>'after', '') is not null then
      v_parents := v_parents || coalesce((select array_agg(s.id) from public.onboarding_steps s
                                           where s.flow_run_id = r.id and s.flow_item_key = it->>'after'
                                             and s.status <> 'cancelled'), '{}');
    end if;
    perform public._flow_add_parents(v_step, v_parents);
  end loop;
  -- ‼ הוספה לריצה קיימת (פריטים, בן/בת זוג, עדכון): הבקשות החדשות צריכות להחזיק גם
  -- את השלבים שכבר נוצרו אחריהן — לא רק לקבל הורים משלהן.
  if p_item_keys is not null or p_roles is not null then
    perform public._flow_rearc_locked(r.id);
  end if;

  -- ‼ 217: שורות «לא נוצרה» נסגרות רק עכשיו — אחרי שהבקשה האמיתית קיבלה את הקשתות שלה.
  -- שורה מבוטלת נחשבת «הושלמה» לתלויים (step_satisfies_dependency): סגירה לפני הקשתות
  -- הייתה פותחת את השלב הבא כשהבקשה החדשה עוד פתוחה.
  for x in select value from jsonb_array_elements(v_resolve) loop
    begin
      if x ? 'item' then
        for v_pkey in select s.payload->'creationProblem'->>'key' from public.onboarding_steps s
                       where s.client_id = r.client_id and s.flow_run_id = r.id and s.flow_item_key = x->>'item'
                         and s.payload ? 'creationProblem'
                         and s.status not in ('completed', 'verified', 'skipped', 'cancelled') loop
          perform public._resolve_creation_problem(r.client_id, v_pkey, null, 'not_applicable');
        end loop;
      else
        perform public._resolve_creation_problem(r.client_id, x->>'key', x->>'stepId', x->>'how');
      end if;
    exception when others then
      perform public.log_onboarding_event(r.user_id, null, r.engagement_id, 'note', 'system',
        'שורת «לא נוצרה» לא נסגרה אוטומטית - אפשר לסגור אותה ב«אין צורך»',
        jsonb_build_object('flowRunId', r.id, 'resolve', x, 'error', left(sqlerrm, 200)));
    end;
  end loop;

  return jsonb_build_object('ok', true, 'created', v_created, 'skipped', v_skipped);
end;
$function$;

-- ── _flow_progress — הגוף החי (זהה בייצור וב-staging, 30.10.2026) + 313 ──
CREATE OR REPLACE FUNCTION public._flow_progress(p_run_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r       public.flow_runs%rowtype;
  v_def   jsonb;
  v_state jsonb;
  st      jsonb;
  it      jsonb;
  v_ss    jsonb;
  v_changed boolean := true;
  v_iter  int := 0;
  v_open  boolean;
  v_done  boolean;
  v_flow  text;
  v_all_done boolean;
  v_auto  boolean := false;
  v_acts  jsonb;
  s       record;
begin
  select * into r from public.flow_runs where id = p_run_id for update;
  if r.id is null or r.status <> 'active' then
    return jsonb_build_object('ok', false, 'skipped', coalesce(r.status, 'not_found'));
  end if;
  v_def := public._flow_def(r.flow_id, r.flow_version);
  v_state := coalesce(r.state, '{}'::jsonb);
  v_state := jsonb_set(v_state, '{stages}', coalesce(v_state->'stages', '{}'::jsonb));
  v_state := jsonb_set(v_state, '{actions}', coalesce(v_state->'actions', '{}'::jsonb));
  select name into v_flow from public.office_flows where id = r.flow_id;

  -- תיקון: צעד נעול שתלותו כבר הושלמה (שני הורים שהסתיימו במקביל).
  for s in select id, user_id, engagement_id, payload, published_at from public.onboarding_steps
            where flow_run_id = r.id and status = 'locked' loop
    if public.onboarding_dependency_met(s.id) then
      update public.onboarding_steps set status = 'pending' where id = s.id;
      perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'system',
        'השלב נפתח - התלייה הקודמת הושלמה', jsonb_build_object('from', 'locked', 'to', 'pending', 'healed', true));
      perform public.execute_automatic_step(s.id);
      if s.published_at is not null and coalesce(s.payload->>'delivery', '') = 'auto' then v_auto := true; end if;
    end if;
  end loop;

  while v_changed and v_iter < 20 loop
    v_changed := false;
    v_iter := v_iter + 1;
    for st in select value from jsonb_array_elements(v_def->'stages') loop
      v_ss := coalesce(v_state->'stages'->(st->>'key'), '{}'::jsonb);

      if v_ss->>'openedAt' is null then
        v_open := case coalesce(st->'opens'->>'after', 'start')
          when 'start' then true
          when 'stage' then (v_state->'stages'->(st->'opens'->>'stage')->>'doneAt') is not null
          when 'item' then
            (select case when count(*) = 0
                         then (v_state->'stages'->(
                                 (select s2.v->>'key' from jsonb_array_elements(v_def->'stages') as s2(v),
                                         jsonb_array_elements(s2.v->'items') as i2(v)
                                   where i2.v->>'key' = st->'opens'->>'item' limit 1))->>'doneAt') is not null
                         else bool_and(public.step_satisfies_dependency(x.status, x.payload)) end
               from public.onboarding_steps x
              where x.flow_run_id = r.id and x.flow_item_key = st->'opens'->>'item' and x.status <> 'cancelled')
          else false end;
        -- ‼ 217: סוג העוסק לא ידוע והשלב תלוי בו — לא נפתח ולא מסומן «לא חל» (זה היה סופי).
        -- נפתח אחרי שהסוג נקבע (release_kind_hold / רענון העובדות של הריצה).
        if v_open and public._flow_kind_waits(st->'when', r.facts) then
          v_open := false;
        end if;
        if v_open then
          v_ss := v_ss || jsonb_build_object('openedAt', now());
          if not public._flow_when_matches_kind(st->'when', r.facts) then
            v_ss := v_ss || jsonb_build_object('notApplicable', true, 'doneAt', now());
          else
            -- פעולות מול רשות שבשלב (כל אחת בבלוק משלה — כשל לא מפיל כלום)
            for it in select value from jsonb_array_elements(st->'items') where value->'ref'->>'kind' = 'action'
                                                              and coalesce(value->>'asStep', 'false') <> 'true' loop
              continue when (v_state->'actions'->(it->>'key')) is not null;
              continue when not public._flow_when_matches_kind(it->'when', r.facts);
              v_acts := public._flow_run_action(r, it);
              v_state := jsonb_set(v_state, array['actions', it->>'key'], v_acts);
            end loop;
            if st->>'delivery' = 'auto' then v_auto := true; end if;
            perform public.log_onboarding_event(r.user_id, null, r.engagement_id, 'note', 'system',
              'נפתח שלב «' || coalesce(st->>'name', '') || '» במסלול «' || coalesce(v_flow, '') || '»',
              jsonb_build_object('flowRunId', r.id, 'stageKey', st->>'key', 'flowEvent', 'stage_opened'));
          end if;
          v_state := jsonb_set(v_state, array['stages', st->>'key'], v_ss);
          v_changed := true;
        end if;
      end if;

      if (v_ss->>'openedAt') is not null and (v_ss->>'doneAt') is null then
        -- ‼ אותו כלל כמו הקשתות (step_satisfies_dependency): דילוג בלי סיבה מוכרת לא פותח.
        -- ‼ left join: בקשה שצורפה לשלב אחר כך (attach_step_to_flow_stage, adhoc-…) אינה פריט
        --   בהגדרה — ועדיין מחזיקה את השלב עד שהיא נסגרת. רק פריט «רשות» בהגדרה לא מחזיק.
        select coalesce(bool_and(public.step_satisfies_dependency(x.status, x.payload)), true)
          into v_done
          from public.onboarding_steps x
          left join lateral (select i.v from jsonb_array_elements(st->'items') as i(v) where i.v->>'key' = x.flow_item_key limit 1) itm on true
         where x.flow_run_id = r.id and x.flow_stage_key = st->>'key' and x.status <> 'cancelled'
           and case when itm.v is null then x.flow_item_key like 'adhoc-%'
                    else coalesce(itm.v->>'optional', 'false') <> 'true' end;
        if v_done then
          v_ss := v_ss || jsonb_build_object('doneAt', now());
          perform public.log_onboarding_event(r.user_id, null, r.engagement_id, 'note', 'system',
            'הושלם שלב «' || coalesce(st->>'name', '') || '» במסלול «' || coalesce(v_flow, '') || '»',
            jsonb_build_object('flowRunId', r.id, 'stageKey', st->>'key', 'flowEvent', 'stage_done'));
          if coalesce(st->>'notifyOffice', 'false') = 'true' and v_ss->>'notifiedAt' is null then
            perform public.queue_accountant_notification(r.user_id, 'flow_stage_done', r.client_id, null, null, null,
              jsonb_build_object('runId', r.id, 'flowName', v_flow, 'stageKey', st->>'key', 'stageName', st->>'name'));
            v_ss := v_ss || jsonb_build_object('notifiedAt', now());
          end if;
          v_state := jsonb_set(v_state, array['stages', st->>'key'], v_ss);
          v_changed := true;
        end if;
      end if;
    end loop;
  end loop;

  select bool_and((v_state->'stages'->(x.v->>'key')->>'doneAt') is not null) into v_all_done
    from jsonb_array_elements(v_def->'stages') as x(v);

  update public.flow_runs
     set state = v_state, updated_at = now(),
         status = case when coalesce(v_all_done, false) then 'done' else status end,
         done_at = case when coalesce(v_all_done, false) then coalesce(done_at, now()) else done_at end
   where id = r.id and status = 'active';

  if coalesce(v_all_done, false) then
    perform public.log_onboarding_event(r.user_id, null, r.engagement_id, 'note', 'system',
      'המסלול «' || coalesce(v_flow, '') || '» הושלם', jsonb_build_object('flowRunId', r.id, 'flowEvent', 'done'));
  end if;
  -- שלב «לבד» שנפתח ⇒ מייל מרוכז אחד (התור מאחד תוספות קרובות).
  if v_auto then
    perform public.enqueue_client_notice(r.client_id, 'new', now() + interval '2 minutes');
  end if;
  return jsonb_build_object('ok', true, 'done', coalesce(v_all_done, false));
end;
$function$;

-- ── get_client_flow_runs — הגוף החי (זהה בייצור וב-staging, 30.10.2026) + 313 ──
CREATE OR REPLACE FUNCTION public.get_client_flow_runs(p_client_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  c     public.clients%rowtype;
  r     record;
  v_def jsonb;
  st    jsonb;
  v_stages jsonb;
  v_out jsonb := '[]'::jsonb;
  v_cur int;
  v_ss  jsonb;
  v_counts jsonb;
  v_state text;
  v_kind_wait int;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid or not public.is_authorized() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  for r in select fr.*, f.name as flow_name, f.current_version, f.trigger as flow_trigger
             from public.flow_runs fr join public.office_flows f on f.id = fr.flow_id
            where fr.client_id = c.id
            order by (fr.status in ('active', 'paused')) desc, fr.started_at desc loop
    v_def := public._flow_def(r.flow_id, r.flow_version);
    v_stages := '[]'::jsonb;
    for st in select value from jsonb_array_elements(v_def->'stages') loop
      v_ss := coalesce(r.state->'stages'->(st->>'key'), '{}'::jsonb);
      select jsonb_build_object(
               'total', count(*) filter (where s.status <> 'cancelled'),
               'done', count(*) filter (where s.status in ('completed', 'verified', 'skipped')
                                          and public.step_satisfies_dependency(s.status, s.payload)),
               'stuck', count(*) filter (where s.status = 'skipped'
                                           and not public.step_satisfies_dependency(s.status, s.payload)),
               'gates', count(*) filter (where s.status <> 'cancelled' and case when gi.v is null then s.flow_item_key like 'adhoc-%'
                                                    else coalesce(gi.v->>'optional', 'false') <> 'true' end),
               -- ‼ טיוטה שעוד לא פורסמה נספרת רק ב«מחכים לאישורך» — לא גם אצל מי שהכדור
               -- אצלו (בטיוטה הכדור אצל המשרד עד הפרסום, והיא נספרה פעמיים).
               'client', count(*) filter (where s.status not in ('completed', 'verified', 'skipped', 'cancelled', 'locked') and s.ball = 'client'
                                            and s.published_at is not null),
               'office', count(*) filter (where s.status not in ('completed', 'verified', 'skipped', 'cancelled', 'locked') and s.ball = 'me'
                                            and s.published_at is not null),
               'external', count(*) filter (where s.status not in ('completed', 'verified', 'skipped', 'cancelled', 'locked') and s.ball in ('prev_accountant', 'external', 'authority')
                                              and s.published_at is not null),
               'unannounced', count(*) filter (where s.status not in ('completed', 'verified', 'skipped', 'cancelled', 'locked')
                                                 and s.published_at is not null and s.client_content_version > coalesce(ns.announced_version, 0)
                                                 and coalesce(s.payload->>'delivery', '') <> 'page'),
               'drafts', count(*) filter (where s.published_at is null
                                            and s.status not in ('completed', 'verified', 'skipped', 'cancelled', 'locked')),
               -- ‼ מחכה לשלב קודם ואחר כך לאישורך — אינו «טיוטה» שאפשר לפרסם עכשיו.
               'awaitingStage', count(*) filter (where s.published_at is null and s.status = 'locked'),
               -- ‼ 217: בקשה שהייתה אמורה להיווצר ולא נוצרה (שורה אדומה ב«בקשות»).
               'problems', count(*) filter (where s.payload ? 'creationProblem'
                                              and s.status not in ('completed', 'verified', 'skipped', 'cancelled')))
        into v_counts
        from public.onboarding_steps s
        left join public.client_step_notice_state ns on ns.step_id = s.id
        left join lateral (select i.v from jsonb_array_elements(st->'items') as i(v)
                            where i.v->>'key' = s.flow_item_key limit 1) gi on true
       where s.flow_run_id = r.id and s.flow_stage_key = st->>'key';
      v_state := case when coalesce(v_ss->>'notApplicable', 'false') = 'true' then 'not_applicable'
                      when v_ss->>'doneAt' is not null then 'done'
                      when v_ss->>'openedAt' is not null then 'open' else 'waiting' end;
      -- ‼ (B4) כמה בקשות בשלב מחכות לסוג העוסק: התנאי (של השלב או של הפריט) תלוי בסוג שלא
      -- ידוע, שאר התנאי יכול להתקיים, ואין להן בקשה בריצה. אותו כלל כמו kind_unknown
      -- ב-_flow_materialize — בלי פריטים קבועים ובלי פעולות מול רשות (אינן בקשות).
      v_kind_wait := case when r.status in ('active', 'paused') and v_state in ('waiting', 'open') then
        (select count(*)::int from jsonb_array_elements(st->'items') it
          where coalesce(it->>'fixed', 'false') <> 'true' and (coalesce(it->'ref'->>'kind', '') <> 'action' or coalesce(it->>'asStep', 'false') = 'true')
            and (public._flow_kind_waits(st->'when', r.facts) or public._flow_kind_waits(it->'when', r.facts))
            and (public._flow_kind_waits(st->'when', r.facts) or public._flow_when_matches_kind(st->'when', r.facts))
            and (public._flow_kind_waits(it->'when', r.facts) or public._flow_when_matches_kind(it->'when', r.facts))
            and not exists (select 1 from public.onboarding_steps s
                             where s.flow_run_id = r.id and s.flow_item_key = it->>'key' and s.status <> 'cancelled'
                               and not (s.payload ? 'creationProblem')))
        else 0 end;
      v_stages := v_stages || (jsonb_build_object(
        'key', st->>'key', 'name', st->>'name', 'opens', st->'opens', 'delivery', st->>'delivery',
        'reminder', st->'reminder', 'notifyOffice', coalesce(st->>'notifyOffice', 'false') = 'true',
        'state', v_state,
        'openedAt', v_ss->>'openedAt', 'doneAt', v_ss->>'doneAt',
        -- ‼ 217: סוג העוסק לא ידוע והשלב תלוי בו — «מחכה לסוג העוסק» (לא «לא חל»).
        'waitingKind', (v_ss->>'openedAt') is null and public._flow_kind_waits(st->'when', r.facts),
        'kindWaitItems', v_kind_wait,
        'counts', v_counts,
        'actions', (select jsonb_agg(jsonb_build_object('itemKey', it->>'key', 'ref', it->'ref', 'mode', coalesce(it->>'mode', 'manual'),
                                       'state', r.state->'actions'->(it->>'key'),
                                       -- המצב החי: הקריאה האחרונה של הפעולה הזאת ללקוח מאז שהשלב נפתח.
                                       'job', (select jsonb_build_object('id', j.id, 'status', j.status, 'errorCode', j.error_code,
                                                        'errorDetail', j.error_detail, 'needsHuman', j.needs_human,
                                                        'createdAt', j.created_at, 'finishedAt', j.finished_at,
                                                        'auto', j.input->>'reason' = 'flow_stage_opened')
                                                 from public.automation_jobs j
                                                where j.client_id = r.client_id and j.action_type = it->'ref'->>'actionType'
                                                  and j.created_at >= coalesce((v_ss->>'openedAt')::timestamptz, r.started_at)
                                                order by j.created_at desc limit 1)))
                      from jsonb_array_elements(st->'items') it where it->'ref'->>'kind' = 'action' and not coalesce(it->>'asStep', 'false') = 'true'))
        -- ‼ (B1) שלב שמחכה: האם יחול על הלקוח הזה לפי עובדות הריצה (ענף של סוג אחר ⇒ false).
        -- השרת מסמן «לא חל» רק כשההורה מסתיים; עד אז הכרטיס לא סופר אותו «במקביל»/«הבא».
        -- ‼ סוג לא ידוע אינו «לא יחול» — waitingKind קובע שם, והכרטיס מכבד אותו.
        || case when v_state = 'waiting'
                then jsonb_build_object('willApply', public._flow_when_matches_kind(st->'when', r.facts)) else '{}'::jsonb end
        -- התנאי של השלב (סוגים/עובדות) — לקיבוץ ענפים חלופיים («או») בכרטיס.
        || case when jsonb_typeof(st->'when') = 'object' then jsonb_build_object('when', st->'when') else '{}'::jsonb end);
    end loop;
    v_out := v_out || jsonb_build_object(
      'id', r.id, 'flowId', r.flow_id, 'flowName', r.flow_name, 'trigger', r.flow_trigger,
      'version', r.flow_version, 'currentVersion', r.current_version,
      -- ‼ ההרשאה לפעולות «לבד» נקבעת פעם אחת ביצירת הריצה (state.autoActions) — הכרטיס מציג אותה.
      'autoActions', coalesce(r.state->>'autoActions', 'false') = 'true',
      'upgradeAvailable', r.status in ('active', 'paused') and r.current_version > r.flow_version,
      'cycleKey', r.cycle_key, 'status', r.status, 'startedAt', r.started_at,
      'pausedAt', r.paused_at, 'cancelledAt', r.cancelled_at, 'doneAt', r.done_at,
      -- ‼ 217: נסגר כי ההתקשרות הסתיימה ('engagement_ended') — לא «בוטל» בידי המשרד.
      'closedBy', r.state->>'closedBy',
      'stages', v_stages,
      'suggestions', case when r.status in ('active', 'paused')
                          then coalesce(jsonb_array_length(public.flow_run_suggestions(r.id)->'suggestions'), 0) else 0 end);
  end loop;
  return jsonb_build_object('ok', true, 'runs', v_out);
end;
$function$;

-- ── flow_run_upgrade_apply — הגוף החי (זהה בייצור וב-staging, 30.10.2026) + 313 ──
CREATE OR REPLACE FUNCTION public.flow_run_upgrade_apply(p_run_id text, p_to_version integer, p_add_item_keys text[] DEFAULT '{}'::text[], p_skip_step_ids text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r     public.flow_runs%rowtype;
  f     public.office_flows%rowtype;
  v_mat jsonb := jsonb_build_object('created', '[]'::jsonb, 'skipped', '[]'::jsonb);
  v_sid text;
  v_skipped int := 0;
  v_preview jsonb;
  v_cf  jsonb;
begin
  r := public._flow_owner_check(p_run_id);
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if r.status not in ('active', 'paused') then return jsonb_build_object('ok', false, 'error', 'not_running'); end if;
  select * into f from public.office_flows where id = r.flow_id;
  if p_to_version is distinct from f.current_version or p_to_version <= r.flow_version then
    return jsonb_build_object('ok', false, 'error', 'version_conflict', 'current', f.current_version, 'run', r.flow_version);
  end if;
  v_preview := public.flow_run_upgrade_preview(r.id);
  perform 1 from public.onboarding_steps where flow_run_id = r.id
     and status not in ('completed', 'verified', 'skipped', 'cancelled') order by id for update;

  -- ‼ 217: הסוג לא מתעדכן — חוץ מסוג שהיה ריק (לא ידוע) ונקבע מאז בכרטיס.
  v_cf := public.client_flow_facts(r.client_id, r.engagement_id);
  update public.flow_runs
     set flow_version = p_to_version,
         facts = facts || (v_cf - 'kind' - 'monthly' - 'paperless' - 'rep' - 'new_business')
                 || case when nullif(coalesce(facts->>'kind', ''), '') is null and nullif(coalesce(v_cf->>'kind', ''), '') is not null
                         then jsonb_build_object('kind', v_cf->>'kind') else '{}'::jsonb end,
         updated_at = now()
   where id = r.id;
  -- ‼ «עבר לשלב אחר» חל מהעדכון (כך כתוב בחלון): הצעדים הפתוחים של הפריט עוברים
  -- לשלב החדש — אחרת הם היו מחזיקים את השלב הישן כחובה ונעלמים מהחדש.
  update public.onboarding_steps s
     set flow_stage_key = n.stage_key,
         payload = jsonb_set(s.payload, '{flowOrigin,stageKey}', to_jsonb(n.stage_key), true)
    from (select st2.v->>'key' as stage_key, i.v->>'key' as item_key
            from jsonb_array_elements(public._flow_def(r.flow_id, p_to_version)->'stages') as st2(v),
                 jsonb_array_elements(st2.v->'items') as i(v)) n
   where s.flow_run_id = r.id and s.flow_item_key = n.item_key
     and s.flow_stage_key is distinct from n.stage_key
     and s.status not in ('completed', 'verified', 'skipped', 'cancelled');
  -- ‼ «איך מגיע ללקוח» והתזכורת נקראים מכל בקשה (delivery/reminder ב-payload), לא מההגדרה —
  -- ולכן שינוי בשלב (או מעבר לשלב אחר) נכתב לבקשות הפתוחות. בקשה שעוד לא נמסרה ללקוח
  -- ושנעולה: «באישורך» ⇒ יורדת מהדף; יציאה מ«באישורך» ⇒ עולה לדף כ«בהמשך», כמו בהפעלה.
  update public.onboarding_steps s
     set payload = (s.payload - 'reminder')
                   || jsonb_build_object('delivery', n.delivery)
                   || case when jsonb_typeof(n.reminder) = 'object' then jsonb_build_object('reminder', n.reminder) else '{}'::jsonb end,
         published_at = case
           when s.status = 'locked' and not (s.payload ? 'personalConfirmFor')
                and coalesce((select ns.announced_version from public.client_step_notice_state ns where ns.step_id = s.id), 0) = 0
           then case when n.delivery = 'hold' then null else coalesce(s.published_at, now()) end
           else s.published_at end
    from (select st2.v->>'key' as stage_key, coalesce(st2.v->>'delivery', 'approve') as delivery, st2.v->'reminder' as reminder
            from jsonb_array_elements(public._flow_def(r.flow_id, p_to_version)->'stages') as st2(v)) n
   where s.flow_run_id = r.id and s.flow_stage_key = n.stage_key
     and s.status not in ('completed', 'verified', 'skipped', 'cancelled')
     and not (s.payload ? 'personalConfirmFor')
     -- ‼ 217: שורת «לא נוצרה» היא משימת משרד — לא «איך מגיע ללקוח» ולא יורדת מהדף.
     and not (s.payload ? 'creationProblem')
     and (s.payload->>'delivery' is distinct from n.delivery
          or s.payload->'reminder' is distinct from case when jsonb_typeof(n.reminder) = 'object' then n.reminder end);
  perform public._flow_rearc_locked(r.id);
  if coalesce(array_length(p_add_item_keys, 1), 0) > 0 then
    v_mat := public._flow_materialize(r.id, p_add_item_keys, null);
    -- פעולה מול רשות שנוספה לשלב שכבר נפתח — ממתינה לך (אף פעם לא רצה לבד בעדכון).
    update public.flow_runs fr
       set state = fr.state || jsonb_build_object('actions', coalesce(fr.state->'actions', '{}'::jsonb) || (
             select coalesce(jsonb_object_agg(i.v->>'key', jsonb_build_object('state', 'waiting_office',
                              'reason', 'added_in_upgrade', 'at', now())), '{}'::jsonb)
               from jsonb_array_elements(public._flow_def(fr.flow_id, p_to_version)->'stages') as st2(v),
                    jsonb_array_elements(st2.v->'items') as i(v)
              where i.v->>'key' = any (p_add_item_keys) and i.v->'ref'->>'kind' = 'action'
                and coalesce(i.v->>'asStep', 'false') <> 'true'
                and (fr.state->'stages'->(st2.v->>'key')->>'openedAt') is not null
                and (fr.state->'actions'->(i.v->>'key')) is null))
     where fr.id = r.id;
  end if;
  foreach v_sid in array coalesce(p_skip_step_ids, '{}') loop
    if exists (select 1 from public.onboarding_steps s where s.id = v_sid and s.flow_run_id = r.id
                and s.status not in ('completed', 'verified', 'skipped', 'cancelled')
                and not public._flow_projection_step(s.step_type, s.payload)) then
      -- ‼ הסיבה נכתבת לפני הסטטוס: דילוג בלי סיבה מוכרת אינו משחרר תלויים (168).
      update public.onboarding_steps set payload = payload || jsonb_build_object('skipReason', 'not_applicable') where id = v_sid;
      perform public._set_step_status(v_sid, 'skipped', 'accountant', 'אין צורך - הוסר מהמסלול בעדכון',
        jsonb_build_object('flowRunId', r.id, 'flowEvent', 'upgrade_skip'), null, 'manual');
      v_skipped := v_skipped + 1;
    end if;
  end loop;
  perform public.log_onboarding_event(r.user_id, null, r.engagement_id, 'note', 'accountant',
    'המסלול עודכן לגרסה ' || p_to_version || ' ללקוח הזה',
    jsonb_build_object('flowRunId', r.id, 'flowEvent', 'upgraded', 'from', r.flow_version, 'to', p_to_version,
                       'diff', v_preview, 'added', v_mat->'created', 'skippedSteps', v_skipped));
  perform public._flow_progress_safe(r.id);
  return jsonb_build_object('ok', true, 'created', v_mat->'created', 'skipped', v_mat->'skipped', 'skippedSteps', v_skipped);
end;
$function$;

-- ── 6. קבוצה ⇒ כלל: נקודת אוטומציה נשמרת כפריט action (asStep) ─────────────
create or replace function public.save_work_group_as_flow(p_group_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  g          public.client_work_groups%rowtype;
  v_uid      uuid := auth.uid();
  v_office   uuid;
  v_stages   jsonb := '[]'::jsonb;
  v_items    jsonb;
  v_skipped  jsonb := '[]'::jsonb;
  v_prev     text;
  v_n        int := 0;
  v_stage_n  int := 0;
  st         record;
  r          record;
  v_title    text;
  v_tpl      text;
  v_res      jsonb;
  v_err      text;
  v_def      jsonb;
  v_flow     public.office_flows%rowtype;
begin
  select * into g from public.client_work_groups where id = p_group_id;
  if g.id is null or v_uid is null or g.user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'group_not_found');
  end if;
  if g.builtin_key is not null then return jsonb_build_object('ok', false, 'error', 'builtin'); end if;
  -- הכלל הוא של הקבוצה העליונה; קבוצה פנימית = שלב בו.
  while g.parent_group_id is not null loop
    select * into g from public.client_work_groups where id = g.parent_group_id;
  end loop;
  -- ‼ קבוצה שנפתחה מכלל היא העותק של הלקוח הזה (CLAUDE.md §12.2 «אצל הלקוח») —
  --   שינוי שם בה לא משנה את הכלל של שאר הלקוחות.
  if g.flow_run_id is not null then return jsonb_build_object('ok', false, 'error', 'from_rule'); end if;
  select office_id into v_office from public.profiles where id = v_uid;
  if v_office is null then return jsonb_build_object('ok', false, 'error', 'no_office'); end if;

  -- השלב הראשון: הבקשות שבקבוצה עצמה. אחריו — שלב לכל קבוצה פנימית (עם כל מה שבתוכה).
  for st in
    select g.id as gid, g.name as gname, 0 as ord
    union all
    select c.id, c.name, 1 from public.client_work_groups c
     where c.parent_group_id = g.id and c.builtin_key is null
    order by ord
  loop
    v_items := '[]'::jsonb;
    v_prev := null;
    for r in
      with recursive sub(id) as (
        select st.gid
        union all
        select c.id from public.client_work_groups c join sub on c.parent_group_id = sub.id
         where st.ord = 1 and c.builtin_key is null
      )
      select s.* from public.onboarding_steps s
       where s.status <> 'cancelled'
         and ((st.ord = 0 and s.work_group_id = g.id)
           or (st.ord = 1 and s.work_group_id in (select id from sub)))
       order by coalesce(s.sort_order, 0), s.created_at
    loop
      v_title := coalesce(nullif(btrim(r.payload->>'title'), ''), r.step_type);
      -- 313 · נקודת אוטומציה ⇒ פעולה בכלל (מוגדרת ב«אוטומציות», לא בספרייה — CLAUDE.md §12.2).
      if public._automation_step_name(r.payload->'automation'->>'actionType') is not null then
        v_n := v_n + 1;
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'key', 'i' || v_n,
          'ref', jsonb_build_object('kind', 'action', 'actionType', r.payload->'automation'->>'actionType'),
          'asStep', true,
          'after', v_prev));
        v_prev := 'i' || v_n;
        continue;
      end if;
      if r.step_type not in ('custom_request', 'client_documents') then
        v_skipped := v_skipped || to_jsonb(v_title);
        continue;
      end if;
      v_tpl := null;
      select t.id into v_tpl from public.journey_templates t
       where t.kind = 'request' and t.office_id = v_office and t.name = v_title
         and t.entries->0->>'stepType' = r.step_type
       order by t.created_at limit 1;
      if v_tpl is null then
        v_res := public.save_request_template(r.id, v_title);
        if coalesce(v_res->>'ok', 'false') <> 'true' then
          v_skipped := v_skipped || to_jsonb(v_title);
          continue;
        end if;
        v_tpl := v_res->>'templateId';
      end if;
      v_n := v_n + 1;
      v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
        'key', 'i' || v_n,
        'ref', jsonb_build_object('kind', 'template', 'templateId', v_tpl),
        'after', v_prev,
        'snapshot', jsonb_build_object('stepType', r.step_type, 'title', v_title,
                                       'payload', public.template_payload_from_step(r.payload))));
      v_prev := 'i' || v_n;
    end loop;
    if jsonb_array_length(v_items) > 0 then
      v_stage_n := v_stage_n + 1;
      v_stages := v_stages || jsonb_build_object(
        'key', case when st.ord = 0 then 's1' else 'g' || v_stage_n end,
        'name', st.gname,
        'opens', jsonb_build_object('after', 'start'),
        -- ‼ החלטה שאושרה: מה שיוצא ללקוח מכלל שהמשרד הגדיר — מופיע בדף והמייל יוצא לבד.
        'delivery', 'auto',
        'items', v_items);
    end if;
  end loop;

  -- פייפרלס / רו״ח קודם שבתוך הקבוצה — לא נכנסים לכלל (הם נפתחים במסלול הקליטה); המשרד רואה את זה.
  v_skipped := v_skipped || coalesce((
    with recursive d(id, builtin_key, name) as (
      select c.id, c.builtin_key, c.name from public.client_work_groups c where c.parent_group_id = g.id
      union all
      select c.id, c.builtin_key, c.name from public.client_work_groups c join d on c.parent_group_id = d.id
       where d.builtin_key is null
    ) select jsonb_agg(d.name) from d where d.builtin_key is not null), '[]'::jsonb);

  if jsonb_array_length(v_stages) = 0 then
    return jsonb_build_object('ok', false, 'error', 'nothing_to_save', 'skipped', v_skipped);
  end if;
  v_def := jsonb_build_object('stages', v_stages);
  v_err := public.flow_definition_error(v_def, 'manual');
  if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err, 'skipped', v_skipped); end if;

  select * into v_flow from public.office_flows
   where id = g.flow_id and office_id = v_office and status = 'active';
  if v_flow.id is null then
    select * into v_flow from public.office_flows
     where office_id = v_office and status = 'active' and trigger = 'manual'
       and seed_key = 'work_group' and name = g.name
     order by created_at limit 1;
  end if;

  if v_flow.id is null then
    v_res := public.create_office_flow(g.name, 'manual', v_def);
    if coalesce(v_res->>'ok', 'false') <> 'true' then
      return jsonb_build_object('ok', false, 'error', coalesce(v_res->>'error', 'unknown'), 'skipped', v_skipped);
    end if;
    update public.office_flows set seed_key = 'work_group' where id = v_res->>'flowId';
    update public.client_work_groups set flow_id = v_res->>'flowId', updated_at = now() where id = g.id;
    return jsonb_build_object('ok', true, 'flowId', v_res->>'flowId', 'created', true, 'skipped', v_skipped);
  end if;

  v_res := public.save_office_flow(v_flow.id, v_flow.current_version, v_def, g.name, 'מקבוצה אצל לקוח');
  if coalesce(v_res->>'ok', 'false') <> 'true' then
    return jsonb_build_object('ok', false, 'error', coalesce(v_res->>'error', 'unknown'), 'skipped', v_skipped);
  end if;
  update public.client_work_groups set flow_id = v_flow.id, updated_at = now() where id = g.id;
  return jsonb_build_object('ok', true, 'flowId', v_flow.id, 'created', false, 'skipped', v_skipped);
end;
$function$;
