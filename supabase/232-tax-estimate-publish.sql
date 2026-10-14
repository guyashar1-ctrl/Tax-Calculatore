-- ════════════════════════════════════════════════════════════════════════════
-- 232 · הערכת מס — פרסום הגרסה המאושרת בדף האישי ובשליחת «שלח בקשות» — 11.10.2026
-- ════════════════════════════════════════════════════════════════════════════
-- ‼ חבילה נפרדת — לא הוחלה על שום סביבה. תלויה ב-229 ו-231. בידוד: scripts/sql/232/test-232-publish.pglite.mjs.
-- ‼ הדף האישי לא מחזיק עותק: הפריט והתצוגה נקראים מאותה שורה מאושרת ב-tax_estimates. גרסה חדשה שמאושרת
--   מחליפה את הקודמת («הוחלפה») — והפריט נעלם עד שהמשרד מפרסם את החדשה. אין מצב שבו הלקוח רואה מספר ישן.
-- ‼ פרסום = הבקשה «הערכת מס» מסומנת מפורסמת, וגרסת התוכן ללקוח עולה (תווית המשנה משתנה) — כך «שלח בקשות»
--   הקיים יודע שיש מה לבשר. אין כאן שליחה; השליחה נשארת פעולה של המשרד בכרטיס.
-- ‼ ללקוח לא נחשפים: הכרעות משרד, הערת המשרד, יישור בין מקורות, תיאומים, חוסמים וכללים פנימיים.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.tax_estimates add column if not exists published_at timestamptz;
alter table public.tax_estimates add column if not exists published_by uuid references auth.users(id);
-- גרסה מפורסמת אחת לכל בקשה
create unique index if not exists tax_estimates_one_published_idx on public.tax_estimates (request_id) where published_at is not null and status = 'approved';

-- ── הגרסה המאושרת אינה נערכת — חוץ משדות הפרסום ──
create or replace function public._tax_estimate_immutable()
returns trigger language plpgsql as $$
begin
  if old.status = 'superseded' then
    raise exception 'tax_estimate_superseded: גרסה שהוחלפה אינה נערכת';
  end if;
  if old.status = 'approved' then
    if new.draft = old.draft and new.outputs is not distinct from old.outputs and new.input_facts = old.input_facts
       and new.version = old.version and new.revision = old.revision and new.cutoff_month = old.cutoff_month
       and new.approved_at is not distinct from old.approved_at then
      -- «הוחלפה» (בלי לגעת בשום דבר אחר), או פרסום / הסרה מהדף האישי של גרסה מאושרת
      if new.status = 'superseded' and new.published_at is not distinct from old.published_at then return new; end if;
      if new.status = 'approved' then return new; end if;
    end if;
    raise exception 'tax_estimate_approved: גרסה מאושרת אינה נערכת — חישוב מחדש יוצר גרסה חדשה';
  end if;
  return new;
end $$;
revoke all on function public._tax_estimate_immutable() from public, anon, authenticated;

-- ── פרסום / הסרה ──
create or replace function public.publish_tax_estimate(p_estimate_id text, p_publish boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  e public.tax_estimates%rowtype;
  c public.clients%rowtype;
begin
  select * into e from public.tax_estimates where id = p_estimate_id for update;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  c := public._tax_year_client(e.client_id);
  if e.status <> 'approved' then return jsonb_build_object('ok', false, 'error', 'not_approved'); end if;
  if coalesce(p_publish, false) then
    update public.tax_estimates set published_at = now(), published_by = auth.uid(), updated_at = now() where id = e.id;
    -- הבקשה מפורסמת; תווית המשנה מתעדכנת לגרסה ⇒ גרסת התוכן ללקוח עולה (214) ו«שלח בקשות» יודע
    update public.onboarding_steps
       set published_at = coalesce(published_at, now()),
           payload = payload || jsonb_build_object('clientSub', 'גרסה ' || e.version || ' · אושרה ' || to_char(e.approved_at at time zone 'Asia/Jerusalem', 'DD.MM.YYYY'),
                                                   'publishedEstimateId', e.id),
           updated_at = now()
     where id = e.request_id;
    return jsonb_build_object('ok', true, 'id', e.id, 'publishedAt', now());
  end if;
  update public.tax_estimates set published_at = null, published_by = null, updated_at = now() where id = e.id;
  -- ‼ published_at של הבקשה לא נוגעים: בקשת «הערכת מס» נוצרת מפורסמת (229); הדף ו«שלח בקשות» בודקים גרסה מפורסמת
  update public.onboarding_steps set payload = payload - 'publishedEstimateId' - 'clientSub', updated_at = now() where id = e.request_id;
  return jsonb_build_object('ok', true, 'id', e.id, 'publishedAt', null);
end $$;

-- ── מה הלקוח רואה: הגרסה המאושרת והמפורסמת, בלי שדות פנימיים ──
create or replace function public._tax_estimate_client_view(p_client_id text, p_step_id text, p_preview boolean)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('ok', true, 'stepId', e.request_id, 'estimateId', e.id, 'taxYear', e.tax_year, 'version', e.version,
           'approvedAt', e.approved_at, 'publishedAt', e.published_at,
           'clientName', concat_ws(' ', c.first_name, c.last_name), 'spouseName', coalesce(nullif(c.spouse_first_name, ''), nullif(c.spouse->>'firstName', '')),
           'draft', jsonb_build_object('cutoffMonth', e.draft->'cutoffMonth', 'preparedOn', e.draft->'preparedOn',
                      'lines', coalesce((select jsonb_agg(l - 'actualSource' - 'entityRef') from jsonb_array_elements(coalesce(e.draft->'lines', '[]'::jsonb)) l), '[]'::jsonb),
                      -- 13.10.2026: חד־פעמיים והתאמות מס מוצגים ללקוח — כל אחד בנפרד, בלי מקורות פנימיים
                      'oneOffs', coalesce((select jsonb_agg(o - 'source') from jsonb_array_elements(coalesce(e.draft->'oneOffs', '[]'::jsonb)) o), '[]'::jsonb),
                      'adjustments', coalesce(e.draft->'adjustments', '[]'::jsonb)),
           -- ‼ מצב היישור מול הרשויות (alignment) פנימי למשרד — לא נחשף
           'outputs', e.outputs - 'usedRules' - 'blockers' - 'rulesetVersion' - 'nextAction' - 'alignment')
    from public.tax_estimates e
    join public.clients c on c.id = e.client_id
   where e.client_id = p_client_id and e.request_id = p_step_id and e.status = 'approved'
     and (p_preview or e.published_at is not null)
   order by e.version desc limit 1
$$;
revoke all on function public._tax_estimate_client_view(text, text, boolean) from public, anon, authenticated;

create or replace function public.portal_tax_estimate(p_token text, p_step_id text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare c public.clients%rowtype;
begin
  c := public._portal_client(p_token);
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  return coalesce(public._tax_estimate_client_view(c.id, p_step_id, false), jsonb_build_object('ok', false, 'error', 'not_found'));
end $$;

-- «מה הלקוח יראה» מהמשרד — אותה תצוגה, גם לפני פרסום.
create or replace function public.portal_tax_estimate_preview(p_client_id text, p_step_id text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  perform public._tax_year_client(p_client_id);
  return coalesce(public._tax_estimate_client_view(p_client_id, p_step_id, true), jsonb_build_object('ok', false, 'error', 'not_found'));
end $$;

revoke all on function public.publish_tax_estimate(text, boolean) from public, anon;
revoke all on function public.portal_tax_estimate_preview(text, text) from public, anon;
grant execute on function public.publish_tax_estimate(text, boolean) to authenticated;
grant execute on function public.portal_tax_estimate_preview(text, text) to authenticated;
revoke all on function public.portal_tax_estimate(text, text) from public;
grant execute on function public.portal_tax_estimate(text, text) to anon, authenticated;

-- ── הדף האישי: פריט «הערכת המס» — רק כשיש גרסה מאושרת ומפורסמת ──
-- ‼ הזרקה מבוקרת לגוף החי של _portal_step_items (אותו דפוס כמו 229/11): עוגן אחד בדיוק, החלה חוזרת לא מכפילה.
do $p232a$
declare
  v_def    text;
  v_anchor text := E'    else\n      exit step_body;\n    end case;';
  v_branch text := E'    when ''tax_estimate'' then\n'
    || E'      -- 232 · הערכת מס שפורסמה: נקראת מהגרסה המאושרת עצמה (לא עותק)\n'
    || E'      v_items := v_items || coalesce((select jsonb_build_array(jsonb_build_object(''bucket'',''action'',''key'',''taxest_''||s.id,\n'
    || E'          ''label'', ''הערכת המס לשנת '' || e.tax_year,\n'
    || E'          ''sub'', ''גרסה '' || e.version || '' · המלצת המשרד למקדמות · לקריאה'',\n'
    || E'          ''actionKind'',''taxEstimate'',''actionValue'', s.id))\n'
    || E'        from public.tax_estimates e where e.request_id = s.id and e.status = ''approved'' and e.published_at is not null\n'
    || E'        order by e.version desc limit 1), ''[]''::jsonb);\n\n';
begin
  select pg_get_functiondef('public._portal_step_items(public.onboarding_steps, public.clients, public.profiles, public.representation_requests, jsonb, jsonb)'::regprocedure)
    into v_def;
  if v_def like '%232 · הערכת מס שפורסמה%' then
    raise notice '232: הענף כבר קיים';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '232: עוגן הענף ב-_portal_step_items לא נמצא פעם אחת בדיוק';
  end if;
  execute replace(v_def, v_anchor, v_branch || v_anchor);
end
$p232a$;

-- ── «שלח בקשות»: הערכה שפורסמה נספרת, עם מפתח הפריט בדף ──
do $p232b$
declare
  v_def text;
  -- ‼ עוגן של שורה אחת: 239 הכניסה שורה בין סוף הרשימה לתנאי business_details, והעוגן הדו־שורתי
  --   הקודם (שהוחל ב-staging לפני 239) לא נמצא בגוף שבייצור (נבדק 13.10.2026).
  v_a1 text := E'''info_collection'')\n';
  v_n1 text := E'''info_collection'',\n                         -- 232 · הערכת מס — רק כשיש גרסה מאושרת ומפורסמת (הבקשה עצמה פנימית ו«מפורסמת» מיצירתה, 229)\n                         ''tax_estimate'')\n     and (s.step_type <> ''tax_estimate'' or exists (select 1 from public.tax_estimates e where e.request_id = s.id and e.status = ''approved'' and e.published_at is not null))\n';
  v_a2 text := E'when ''info_collection'' then ''taxinfo_'' || p_step_id';
  v_n2 text := E'when ''tax_estimate'' then ''taxest_'' || p_step_id\n           when ''info_collection'' then ''taxinfo_'' || p_step_id';
begin
  if to_regprocedure('public._client_announceable_steps(text)') is null then
    raise notice '232: _client_announceable_steps חסרה — מדלג (סביבה בלי 214)';
  else
    v_def := pg_get_functiondef('public._client_announceable_steps(text)'::regprocedure);
    if v_def like '%232 · הערכת מס%' then
      raise notice '232: «הערכת מס» כבר ברשימה';
    elsif (length(v_def) - length(replace(v_def, v_a1, ''))) / length(v_a1) <> 1 then
      raise exception '232: העוגן ב-_client_announceable_steps לא נמצא פעם אחת בדיוק (נדרש 229/12)';
    else
      execute replace(v_def, v_a1, v_n1);
    end if;
  end if;
  if to_regprocedure('public._client_step_portal_key(text, text)') is null then
    raise notice '232: _client_step_portal_key חסרה — מדלג';
  else
    v_def := pg_get_functiondef('public._client_step_portal_key(text, text)'::regprocedure);
    if v_def like '%''taxest_''%' then
      raise notice '232: מפתח הדף כבר קיים';
    elsif (length(v_def) - length(replace(v_def, v_a2, ''))) / length(v_a2) <> 1 then
      raise exception '232: העוגן ב-_client_step_portal_key לא נמצא פעם אחת בדיוק (נדרש 229/12)';
    else
      execute replace(v_def, v_a2, v_n2);
    end if;
  end if;
end
$p232b$;
