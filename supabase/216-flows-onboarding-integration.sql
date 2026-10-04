-- 216: מסלול הקליטה — חיבור למחולל ולאישור ההצעה, ומעבר מחמש הרשימות למסלול אחד.
--
-- ‼ המחולל (generate_onboarding_steps) נשאר היצרן היחיד של בקשות הקליטה.
-- מסלול הקליטה נשמר כגרסאות (office_flows) ומתורגם בשמירה לחמש הרשימות
-- שהמחולל קורא (save_office_flow, 215). כאן:
--   1. ensure_onboarding_flow — כל משרד מקבל מסלול קליטה שנבנה מהרשימות
--      הקיימות שלו, בלי לשנות דבר במה שלקוח חדש מקבל (בדיקת הלוך-ושוב
--      ב-scripts/staging-test-flows.mjs). בקשות המשרד שבתוך הרשימות עוברות
--      לספרייה, והמסלול מצביע עליהן.
--   2. attach_onboarding_flow_run — אחרי שהמחולל יצר את הבקשות, נוצרת ריצה,
--      הבקשות משויכות לשלבים, ושער השלבים, «איך מגיע ללקוח» והתזכורות חלים.
--   3. המחולל: עובדת «נשוי/אה», תנאי עובדות על בקשות המשרד, בקשה מהספרייה
--      לפי templateId, תבנית «מותאמת», וערכים פגומים שאינם מפילים אישור.
--   4. פרסום שינויים לא מפרסם בקשה שממתינה לשלב קודם; משימה אוטומטית לא
--      יוצאת כשהמסלול בעצירה.
--   5. «בקשות ללקוח חדש» נכתבות רק דרך שמירת המסלול — הכתיבה הישירה נסגרת.
--   6. תבניות «מסע» ישנות (kind='journey') — הופכות למסלול ידני בלחיצה.

-- ── 1 · מסלול הקליטה של משרד ─────────────────────────────────────────────
/** «עוסק מורשה ועוסק פטור», «חברה» — סוגי לקוח בעברית, לשם בספרייה. */
create or replace function public._client_kinds_label(p_kinds text[])
returns text language sql immutable set search_path to 'public' as $$
  with l as (
    select case k when 'licensed_dealer' then 'עוסק מורשה' when 'exempt_dealer' then 'עוסק פטור'
                  when 'company' then 'חברה' when 'tax_refund' then 'החזר מס'
                  when 'representation_only' then 'ייצוג בלבד' else k end as label, o
      from unnest(coalesce(p_kinds, '{}'::text[])) with ordinality as x(k, o))
  select case when (select count(*) from l) <= 1 then (select label from l)
              else (select string_agg(label, ', ' order by o) from l where o < (select max(o) from l))
                   || ' ו' || (select label from l order by o desc limit 1) end;
$$;

/**
 * מחזירה את מסלול הקליטה הפעיל של המשרד, ויוצרת אותו מהרשימות הקיימות אם
 * חסר. ‼ התרגום הפוך לזה של compileOnboarding (src/features/flows/compile.ts):
 *   · לכל מפתח, סוגי הלקוח שבהם הרשומה זהה (חוץ מהסדר) הופכים לפריט אחד עם
 *     «רק ל…»; רשומה שונה בין סוגים — פריט נפרד לכל קבוצה.
 *   · dependsOn ⇒ «נפתח אחרי» בתוך השלב.
 *   · בקשת משרד ⇒ בקשה בספרייה (journey_templates) שהפריט מצביע עליה; מסמך
 *     ⇒ מסמך מהספרייה. מפתח הפריט = מפתח הרשומה, כדי שבקשות שכבר נוצרו
 *     (defaultOrigin.key) ימשיכו להיות מזוהות.
 *   · שלב אחד שנפתח מיד, «הכול באישורך» — בדיוק מה שקורה היום: שום דבר לא
 *     מופיע ללקוח לפני שהרו"ח פותח את הדף.
 *   · ‼ בקשת משרד ששונה בין הסוגים הופכת לכמה בקשות בספרייה — כל אחת בשם שלה ובסוגים
 *     שלה («… — חברה»), כי בספרייה הן עומדות זו ליד זו. השם בספרייה בלבד: הכותרת
 *     שהלקוח רואה (payload) — כפי שהייתה.
 */
create or replace function public.ensure_onboarding_flow(p_office_id uuid)
returns text language plpgsql security definer set search_path to 'public' as $$
declare
  v_id     text;
  v_items  jsonb := '[]'::jsonb;
  v_rows   jsonb := '[]'::jsonb;
  k        record;
  g        record;
  v_entries jsonb;
  v_key    text;
  v_n      int;
  v_item   jsonb;
  v_tid    text;
  v_kinds  text[];
  v_def    jsonb;
  v_first_key jsonb := '{}'::jsonb;
  v_all    text[] := array['licensed_dealer', 'exempt_dealer', 'company', 'tax_refund', 'representation_only'];
  v_groups int;
begin
  if p_office_id is null then return null; end if;
  select id into v_id from public.office_flows
   where office_id = p_office_id and trigger = 'quote_approved' and status = 'active';
  if v_id is not null then return v_id; end if;

  perform public.seed_office_journey_defaults(p_office_id);

  -- כל הרשומות הפעילות, לפי סדר הסוגים ואז הסדר בתוך הסוג.
  for k in select kind, ord from unnest(v_all) with ordinality as x(kind, ord) loop
    select d.entries into v_entries from public.office_journey_defaults d
     where d.office_id = p_office_id and d.client_kind = k.kind;
    if v_entries is null or jsonb_typeof(v_entries) <> 'array' then
      v_entries := public.default_journey_entries(k.kind);
    end if;
    v_rows := v_rows || coalesce((
      select jsonb_agg(jsonb_build_object('kind', k.kind, 'kord', k.ord, 'idx', e.idx, 'entry', e.v)
                       order by case when (e.v->>'sortIndex') ~ '^-?\d{1,9}$' then (e.v->>'sortIndex')::int else 0 end, e.idx)
        from jsonb_array_elements(v_entries) with ordinality as e(v, idx)
       where coalesce(e.v->>'enabled', 'true') <> 'false' and nullif(e.v->>'stepType', '') is not null), '[]'::jsonb);
    v_entries := null;
  end loop;

  -- לכל מפתח (לפי הופעה ראשונה), קבוצות של סוגים עם רשומה זהה.
  for v_key in
    select x->'entry'->>'key' from jsonb_array_elements(v_rows) with ordinality as r(x, o)
     group by x->'entry'->>'key' order by min((x->>'kord')::int * 1000 + o)
  loop
    v_n := 0;
    -- כמה גרסאות שונות יש לרשומה הזו בין הסוגים — יותר מאחת ⇒ השם בספרייה נושא את הסוגים.
    select count(distinct (x->'entry') - 'sortIndex' - 'enabled') into v_groups
      from jsonb_array_elements(v_rows) x where x->'entry'->>'key' = v_key;
    for g in
      select (x->'entry') - 'sortIndex' - 'enabled' as cfg,
             array_agg(x->>'kind' order by (x->>'kord')::int) as kinds,
             min((x->>'kord')::int) as first_kind
        from jsonb_array_elements(v_rows) x
       where x->'entry'->>'key' = v_key
       group by (x->'entry') - 'sortIndex' - 'enabled'
       order by min((x->>'kord')::int)
    loop
      v_n := v_n + 1;
      v_kinds := g.kinds;
      -- ‼ מפתח הפריט ייחודי במסלול; מפתח הרשומה (entryKey) נשמר כמו שהוא — בו המחולל
      -- מזהה בקשות שכבר נוצרו (defaultOrigin.key), ולכן הוא לא משתנה בתרגום.
      v_item := jsonb_build_object('key', case when v_n = 1 then v_key else v_key || '~' || v_n end)
             || case when v_n > 1 then jsonb_build_object('entryKey', v_key) else '{}'::jsonb end;
      if coalesce(array_length(v_kinds, 1), 0) < array_length(v_all, 1) then
        v_item := v_item || jsonb_build_object('when', jsonb_build_object('kinds', to_jsonb(v_kinds)));
      end if;
      if g.cfg->>'source' = 'office' then
        if nullif(g.cfg->>'documentId', '') is not null then
          v_item := v_item || jsonb_build_object('ref', jsonb_build_object('kind', 'document', 'docId', g.cfg->>'documentId'));
        else
          -- בקשת המשרד עוברת לספרייה. ‼ אותה בקשה שכבר הועברה (אותו מפתח) — לא שוב.
          -- ‼ הסימון פנימי (entries[0].migratedFrom) ולא בתיאור: התיאור מוצג כשורת משנה
          -- ב«＋ בקשה חדשה», וקוד כמו «(fee_ack)» אינו טקסט למשתמש. התיאור — ריק.
          select id into v_tid from public.journey_templates
           where office_id = p_office_id and kind = 'request'
             and (entries->0->>'migratedFrom' = v_key || case when v_n = 1 then '' else '~' || v_n end
                  or description = 'הועבר מבקשות ללקוח חדש (' || v_key || case when v_n = 1 then '' else '~' || v_n end || ')')
           limit 1;
          if v_tid is null then
            insert into public.journey_templates (user_id, office_id, kind, name, description, entries)
            values (null, p_office_id, 'request',
                    coalesce(nullif(g.cfg->'payload'->>'title', ''), nullif(g.cfg->'payload'->>'clientTitle', ''), 'בקשה של המשרד')
                      -- ‼ שתי בקשות באותו שם בספרייה (שונות בין הסוגים) — כל אחת עם הסוגים שלה.
                      || case when v_groups > 1 then ' — ' || public._client_kinds_label(v_kinds) else '' end,
                    null,
                    jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
                      'key', 'e1', 'stepType', coalesce(nullif(g.cfg->>'stepType', ''), 'custom_request'), 'owner', 'client',
                      'requiredForClose', coalesce(g.cfg->>'requiredForClose', 'true') <> 'false',
                      'payload', coalesce(g.cfg->'payload', '{}'::jsonb),
                      'migratedFrom', v_key || case when v_n = 1 then '' else '~' || v_n end))))
            returning id into v_tid;
          end if;
          v_item := v_item || jsonb_build_object(
            'ref', jsonb_build_object('kind', 'template', 'templateId', v_tid),
            'snapshot', jsonb_strip_nulls(jsonb_build_object(
              'stepType', coalesce(nullif(g.cfg->>'stepType', ''), 'custom_request'),
              'title', coalesce(nullif(g.cfg->'payload'->>'title', ''), 'בקשה של המשרד'),
              'payload', g.cfg->'payload')));
          v_tid := null;
        end if;
        if coalesce(g.cfg->>'requiredForClose', 'true') = 'false' then
          v_item := v_item || jsonb_build_object('optional', true);
        end if;
      else
        -- ‼ בלי jsonb_strip_nulls על הענפים: הוא רקורסיבי, ומוחק את "fact": null
        -- של ענף ברירת המחדל — והתרגום בחזרה כבר לא היה זהה.
        v_item := v_item || jsonb_build_object(
          'ref', jsonb_build_object('kind', 'system', 'stepType', g.cfg->>'stepType'),
          'system', '{}'::jsonb
            || case when jsonb_typeof(g.cfg->'variants') = 'array' and jsonb_array_length(g.cfg->'variants') > 0
                    then jsonb_build_object('variants', g.cfg->'variants') else '{}'::jsonb end
            || case when jsonb_typeof(g.cfg->'authorities') = 'array'
                    then jsonb_build_object('authorities', g.cfg->'authorities') else '{}'::jsonb end
            || case when jsonb_typeof(g.cfg->'requiredForClose') = 'boolean'
                    then jsonb_build_object('requiredForClose', g.cfg->'requiredForClose') else '{}'::jsonb end);
        if g.cfg->>'requiredForClose' = 'false' then
          v_item := v_item || jsonb_build_object('optional', true);
        end if;
        if v_first_key->>(g.cfg->>'stepType') is null then
          v_first_key := v_first_key || jsonb_build_object(g.cfg->>'stepType', v_item->>'key');
        end if;
      end if;
      if (g.cfg->>'dueInDays') ~ '^\d{1,3}$' then
        v_item := v_item || jsonb_build_object('dueInDays', (g.cfg->>'dueInDays')::int);
      end if;
      if nullif(g.cfg->>'dependsOn', '') is not null then
        v_item := v_item || jsonb_build_object('dependsOnType', g.cfg->>'dependsOn');
      end if;
      v_items := v_items || v_item;
    end loop;
  end loop;

  -- «נפתח אחרי» לפי סוג השלב ⇒ מפתח הפריט הראשון מאותו סוג.
  select coalesce(jsonb_agg(case when x ? 'dependsOnType' and v_first_key ? (x->>'dependsOnType')
                                 then (x - 'dependsOnType') || jsonb_build_object('after', v_first_key->>(x->>'dependsOnType'))
                                 else x - 'dependsOnType' end order by o), '[]'::jsonb)
    into v_items from jsonb_array_elements(v_items) with ordinality as i(x, o);

  v_def := jsonb_build_object('stages', jsonb_build_array(jsonb_build_object(
    'key', 's1', 'name', 'פתיחת התיק', 'opens', jsonb_build_object('after', 'start'),
    'delivery', 'hold', 'reminder', null, 'notifyOffice', false,
    'items', jsonb_build_array(jsonb_build_object(
               'key', 'representation', 'fixed', true,
               'ref', jsonb_build_object('kind', 'system', 'stepType', 'representation'),
               'when', jsonb_build_object('facts', jsonb_build_array(jsonb_build_object('key', 'rep', 'is', true)))))
             || v_items)));

  insert into public.office_flows (office_id, name, trigger, current_version, seed_key)
  values (p_office_id, 'קליטת לקוח חדש', 'quote_approved', 1, 'onboarding')
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.office_flows
     where office_id = p_office_id and trigger = 'quote_approved' and status = 'active';
    return v_id;
  end if;
  insert into public.office_flow_versions (flow_id, version, definition, note)
  values (v_id, 1, v_def, 'נבנה מ«בקשות ללקוח חדש» כפי שהיו - בלי שינוי במה שלקוח חדש מקבל');
  return v_id;
end;
$$;

-- ‼ בקשות שכבר הועברו בגרסה קודמת של הקובץ (staging) נשאו את הסימון בתיאור — הוא עובר
-- ל-entries[0].migratedFrom והתיאור מתרוקן. חוזר על עצמו בלי נזק (אין יותר תיאור כזה).
update public.journey_templates
   set entries = jsonb_set(entries, '{0,migratedFrom}',
                           to_jsonb(substring(description from '^הועבר מבקשות ללקוח חדש \((.*)\)$'))),
       description = null
 where kind = 'request'
   and description ~ '^הועבר מבקשות ללקוח חדש \(.*\)$'
   and jsonb_typeof(entries) = 'array' and jsonb_array_length(entries) > 0;

-- ── 2 · ריצת הקליטה אצל לקוח ─────────────────────────────────────────────
/**
 * אחרי שהמחולל יצר את הבקשות: ריצה אחת לכל התקשרות (אישור חוזר רק נרשם),
 * שיוך כל בקשה לפריט שלה, ושער השלבים / «איך מגיע ללקוח» / תזכורות.
 * p_new — התקשרות שנוצרה עכשיו: רק לה מותר להריץ פעולות «לבד» מול רשות.
 */
create or replace function public.attach_onboarding_flow_run(p_engagement_id text, p_new boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  e       public.engagements%rowtype;
  v_office uuid;
  v_flow  text;
  f       public.office_flows%rowtype;
  r       public.flow_runs%rowtype;
  v_def   jsonb;
  st      jsonb;
  it      jsonb;
  s       record;
  v_matched int := 0;
  v_publish boolean := false;
  v_start_hold boolean := false;
  v_parents text[];
  v_inserted boolean := false;
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'engagement_not_found'); end if;
  if e.status <> 'onboarding' then return jsonb_build_object('ok', false, 'skipped', 'not_onboarding'); end if;
  select office_id into v_office from public.profiles where id = e.user_id;
  if v_office is null then return jsonb_build_object('ok', false, 'skipped', 'no_office'); end if;
  v_flow := public.ensure_onboarding_flow(v_office);
  select * into f from public.office_flows where id = v_flow;

  insert into public.flow_runs (user_id, client_id, flow_id, flow_version, cycle_key, trigger, facts, started_by,
                                engagement_id, state)
  values (e.user_id, e.client_id, f.id, f.current_version, e.id, 'quote_approved',
          public.client_flow_facts(e.client_id, e.id), 'system', e.id,
          jsonb_build_object('stages', '{}'::jsonb, 'actions', '{}'::jsonb, 'autoActions', coalesce(p_new, false)))
  on conflict (client_id, flow_id, cycle_key) do nothing
  returning * into r;
  v_inserted := r.id is not null;
  if r.id is null then
    select * into r from public.flow_runs where client_id = e.client_id and flow_id = f.id and cycle_key = e.id;
    -- ‼ ריצה שבוטלה או הסתיימה — אישור חוזר לא מחזיר אותה לחיים.
    if r.status not in ('active', 'paused') then
      return jsonb_build_object('ok', true, 'existing', true, 'runId', r.id, 'status', r.status);
    end if;
  end if;
  v_def := public._flow_def(r.flow_id, r.flow_version);

  -- שיוך: בקשת מערכת לפי סוג (פריט אחד חל על הסוג של הלקוח); בקשת משרד לפי
  -- המפתח שהמחולל רשם (defaultOrigin.key). רק בקשות שלא שייכות לריצה אחרת.
  for st in select value from jsonb_array_elements(v_def->'stages') loop
    -- ‼ שלב שמוגבל לסוגי לקוח אחרים — לא משייכים אליו ולא נגזר ממנו פרסום.
    -- ‼ 217: סוג שלא ידוע — רק מה שחל על כל אחד משלושת הסוגים (מה ששונה ביניהם מוחזק
    -- ולא נוצר; כשהסוג נקבע, release_kind_hold מצמיד שוב).
    continue when not public._flow_when_matches_kind(jsonb_build_object('kinds', coalesce(st->'when'->'kinds', '[]'::jsonb)), r.facts);
    for it in select value from jsonb_array_elements(st->'items') loop
      continue when it->'ref'->>'kind' = 'action';
      continue when not public._flow_when_matches_kind(jsonb_build_object('kinds', coalesce(it->'when'->'kinds', '[]'::jsonb)), r.facts);
      for s in
        select x.id, x.status, x.payload, x.published_at,
               coalesce((select ns.announced_version from public.client_step_notice_state ns where ns.step_id = x.id), 0) as announced
          from public.onboarding_steps x
         where x.client_id = e.client_id and x.flow_run_id is null and x.status <> 'cancelled'
           and (x.engagement_id = e.id or x.engagement_id is null)
           and case it->'ref'->>'kind'
                 when 'system' then x.step_type = it->'ref'->>'stepType' and not (x.payload ? 'creationProblem')
                 -- ‼ 217: שורת «לא נוצרה» של בקשת משרד מהקליטה (creationProblem.entryKey) — שייכת
                 -- לפריט שלה, כדי שהשלב יחכה לה כמו לבקשה עצמה.
                 else coalesce(x.payload->'defaultOrigin'->>'key', x.payload->'creationProblem'->>'entryKey')
                        = coalesce(nullif(it->>'entryKey', ''), it->>'key') end
      loop
        update public.onboarding_steps
           set flow_run_id = r.id, flow_stage_key = st->>'key', flow_item_key = it->>'key',
               payload = payload
                 || case when s.payload ? 'creationProblem'
                         then jsonb_build_object('flowOrigin', jsonb_build_object('runId', r.id, 'itemKey', it->>'key', 'stageKey', st->>'key'))
                              || jsonb_build_object('creationProblem', (s.payload->'creationProblem')
                                   || jsonb_build_object('runId', r.id, 'stageKey', st->>'key', 'itemKey', it->>'key'))
                         else jsonb_build_object('delivery', coalesce(st->>'delivery', 'hold'),
                                       'flowOrigin', jsonb_build_object('runId', r.id, 'itemKey', it->>'key', 'stageKey', st->>'key'))
                              || case when jsonb_typeof(st->'reminder') = 'object' then jsonb_build_object('reminder', st->'reminder') else '{}'::jsonb end
                    end,
               -- שלב «הכול באישורך» שאינו נפתח מיד — לא בדף עד שייפתח ותאשר.
               -- ‼ רק בקשה שנולדה עכשיו (התקשרות חדשה) ושלא נמסרה ללקוח. בקשה
               -- שהלקוח כבר רואה או עובד עליה לא נעלמת מהדף בהצמדה מאוחרת.
               published_at = case when p_new and st->>'delivery' = 'hold'
                                        and coalesce(st->'opens'->>'after', 'start') <> 'start'
                                        and s.announced = 0
                                        and s.status not in ('completed', 'verified', 'skipped', 'cancelled')
                                        -- ‼ 217: משימת משרד («לא נוצרה») אינה טיוטה ללקוח.
                                        and not (s.payload ? 'creationProblem')
                                        -- ‼ הכרעה ב: מה שפורסם לפני שהקליטה נוצרה (לקוח שחוזר — מה שעבר
                                        -- אליה מההתקשרות הקודמת) כבר בדף, גם בלי מייל — לא נהיה טיוטה.
                                        and not coalesce(s.published_at < e.created_at, false)
                                   then null else published_at end
         where id = s.id;
        v_matched := v_matched + 1;
      end loop;
    end loop;
    if coalesce(st->'opens'->>'after', 'start') = 'start' then
      if st->>'delivery' in ('approve', 'auto', 'page') then v_publish := true; else v_start_hold := true; end if;
    end if;
  end loop;
  -- ‼ פתיחת הדף לפי השלב הראשון — רק בהתקשרות חדשה (הצמדה מאוחרת לא משנה מה הלקוח רואה).
  if not p_new then v_publish := false; end if;

  -- שער השלבים: בקשה בשלב שנפתח «אחרי» מחכה לשלב/לפריט שלפניו; בקשת משרד
  -- עם «אחרי» בתוך השלב — לפריט. (קשתות המחולל של בקשות המערכת לא נוגעים.)
  -- ‼ 217: שורת «לא נוצרה» לא מקבלת קשתות ולא ננעלת — אדומה מיד, גם בשלב שעוד לא נפתח.
  -- ‼ הכרעה ב: בקשה שפורסמה לפני שהקליטה נוצרה (מה שעבר אליה מהתקשרות קודמת) כבר בידי הלקוח —
  -- לא ננעלת מחדש מאחורי שלב של הקליטה החדשה (כמו בקשה שנמסרה במייל, _flow_add_parents).
  for s in select x.id, x.flow_stage_key, x.flow_item_key from public.onboarding_steps x
            where x.flow_run_id = r.id and x.status not in ('completed', 'verified', 'skipped', 'cancelled')
              and not (x.payload ? 'creationProblem')
              and not coalesce(x.published_at < e.created_at, false) loop
    select x2.v into st from jsonb_array_elements(v_def->'stages') as x2(v) where x2.v->>'key' = s.flow_stage_key;
    select i.v into it from jsonb_array_elements(st->'items') as i(v) where i.v->>'key' = s.flow_item_key;
    v_parents := public._flow_gate_steps(r.id, v_def, st->'opens');
    if nullif(it->>'after', '') is not null and it->'ref'->>'kind' <> 'system' then
      v_parents := v_parents || coalesce((select array_agg(y.id) from public.onboarding_steps y
                                           where y.flow_run_id = r.id and y.flow_item_key = it->>'after'
                                             and y.status <> 'cancelled'), '{}');
    end if;
    if coalesce(array_length(v_parents, 1), 0) > 0 then
      perform public._flow_add_parents(s.id, v_parents);
    end if;
  end loop;

  -- «איך מגיע ללקוח» של השלב הראשון: כל מה שאינו «הכול באישורך» פותח את הדף
  -- עכשיו (ישירות — publish_onboarding_process דורשת משתמש מחובר, והאישור אנונימי).
  if v_publish and e.process_published_at is null then
    update public.engagements set process_published_at = now() where id = e.id and process_published_at is null;
    if found then
      perform public.log_onboarding_event(e.user_id, null, e.id, 'status_changed', 'system',
        'התהליך נפתח ללקוח - לפי מסלול הקליטה', jsonb_build_object('flowRunId', r.id, 'processPublished', true));
      if v_start_hold then
        -- שלב «הכול באישורך» שנפתח יחד עם שלב שנפתח לדף — שלו נשאר טיוטה.
        -- ‼ הכרעה ב: חוץ ממה שפורסם לפני שהקליטה נוצרה — הוא כבר בדף.
        update public.onboarding_steps set published_at = null
         where flow_run_id = r.id and coalesce(payload->>'delivery', '') = 'hold'
           and status not in ('completed', 'verified', 'skipped', 'cancelled')
           and not (payload ? 'creationProblem')
           and not coalesce(published_at < e.created_at, false);
      end if;
    end if;
  end if;

  perform public._flow_progress(r.id);
  -- רק כשבאמת קרה משהו — אישור חוזר מהקישור הציבורי לא ממלא את היומן.
  if v_inserted or v_matched > 0 then
    perform public.log_onboarding_event(e.user_id, null, e.id, 'note', 'system',
      'מסלול «' || f.name || '» (גרסה ' || r.flow_version || ') הוצמד ללקוח',
      jsonb_build_object('flowRunId', r.id, 'flowEvent', 'attached', 'matched', v_matched));
  end if;
  return jsonb_build_object('ok', true, 'runId', r.id, 'matched', v_matched);
end;
$$;

/** הצמדה שאינה יכולה להפיל את אישור ההצעה. כשל — גלוי: יומן + הודעה למשרד. */
create or replace function public._attach_onboarding_flow_run_safe(p_engagement_id text, p_new boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare e public.engagements%rowtype;
begin
  perform public.attach_onboarding_flow_run(p_engagement_id, p_new);
exception when others then
  begin
    select * into e from public.engagements where id = p_engagement_id;
    perform public.log_onboarding_event(e.user_id, null, e.id, 'note', 'system',
      'מסלול הקליטה לא הוצמד: ' || left(sqlerrm, 200), jsonb_build_object('flowEvent', 'attach_failed'));
    perform public.queue_accountant_notification(e.user_id, 'flow_attach_failed', e.client_id, null, null, null,
      jsonb_build_object('engagementId', e.id, 'error', left(sqlerrm, 200)));
  exception when others then null;
  end;
end;
$$;

/** «הצמד את מסלול הקליטה» מהכרטיס — לקוח שאין לו ריצה (כשל, או נקלט לפני 216). */
create or replace function public.reattach_onboarding_flow_run(p_client_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  c     public.clients%rowtype;
  v_eng text;
begin
  if v_uid is null or not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select * into c from public.clients where id = p_client_id;
  if c.id is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select id into v_eng from public.engagements
   where client_id = c.id and status = 'onboarding' order by created_at desc limit 1;
  if v_eng is null then return jsonb_build_object('ok', false, 'error', 'no_onboarding'); end if;
  return public.attach_onboarding_flow_run(v_eng, false);
end;
$$;

-- ── 3 · תבנית «מסע» ישנה ⇒ מסלול ידני ────────────────────────────────────
/**
 * ‼ «בקשה מתבנית» הייתה מסלול ידני בלי שם: כמה בקשות, שלבים ותלויות, בלי
 * מעקב. כאן היא הופכת למסלול ידני אמיתי — כל בקשה בה עוברת לספרייה (בלי
 * כפילות: אותה בקשה בדיוק שכבר בספרייה — משמשת), תלות בתוך שלב נשמרת.
 * התבנית הישנה נשארת כמות שהיא; ההמרה מסומנת ולא תקרה פעמיים.
 */
create or replace function public.convert_journey_template_to_flow(p_template_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_office uuid;
  t     public.journey_templates%rowtype;
  e     record;
  v_stage_items jsonb := '{}'::jsonb;
  v_stage_order jsonb := '{}'::jsonb;
  v_keymap jsonb := '{}'::jsonb;
  v_stage_of jsonb := '{}'::jsonb;
  v_stage text;
  v_tid text;
  v_entry jsonb;
  v_item jsonb;
  v_stages jsonb := '[]'::jsonb;
  v_def jsonb;
  v_flow text;
  v_err text;
  x record;
begin
  if v_uid is null or not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select office_id into v_office from public.profiles where id = v_uid;
  select * into t from public.journey_templates where id = p_template_id and kind = 'journey';
  if t.id is null or (t.office_id is not null and t.office_id <> v_office) then
    return jsonb_build_object('ok', false, 'error', 'template_not_found');
  end if;
  select id into v_flow from public.office_flows where office_id = v_office and seed_key = 'journey_template:' || t.id;
  if v_flow is not null then return jsonb_build_object('ok', true, 'flowId', v_flow, 'existed', true); end if;

  for e in select v, o from jsonb_array_elements(t.entries) with ordinality as j(v, o) loop
    continue when not (coalesce(e.v->>'stepType', '') = any (public.request_creatable_step_types()));
    v_stage := coalesce(nullif(trim(e.v->>'stageTitle'), ''), 'בקשות');
    v_entry := jsonb_strip_nulls(jsonb_build_object('key', 'e1', 'stepType', e.v->>'stepType',
      'owner', coalesce(nullif(e.v->>'owner', ''), 'client'),
      -- 217 (D): משימה של המשרד נשארת משימה של המשרד (_template_entry_owner).
      'officeTask', case when coalesce(e.v->>'officeTask', '') = 'true' then true end,
      'requiredForClose', coalesce(e.v->>'requiredForClose', 'true') <> 'false',
      'payload', coalesce(e.v->'payload', '{}'::jsonb)));
    -- אותה בקשה בדיוק כבר בספרייה של המשרד ⇒ משתמשים בה.
    select id into v_tid from public.journey_templates
     where kind = 'request' and office_id = v_office and md5(entries::text) = md5(jsonb_build_array(v_entry)::text) limit 1;
    if v_tid is null then
      insert into public.journey_templates (user_id, office_id, kind, name, description, entries)
      values (v_uid, v_office, 'request',
              coalesce(nullif(e.v->'payload'->>'title', ''), nullif(e.v->'payload'->>'clientTitle', ''), t.name || ' - ' || e.o),
              'הועבר מהתבנית «' || t.name || '»', jsonb_build_array(v_entry))
      returning id into v_tid;
    end if;
    v_item := jsonb_build_object('key', 'j' || e.o, 'ref', jsonb_build_object('kind', 'template', 'templateId', v_tid),
      'snapshot', jsonb_build_object('stepType', e.v->>'stepType',
        'title', coalesce(nullif(e.v->'payload'->>'title', ''), 'בקשה'), 'payload', e.v->'payload'));
    if coalesce(e.v->>'requiredForClose', 'true') = 'false' then v_item := v_item || jsonb_build_object('optional', true); end if;
    if (e.v->>'dueInDays') ~ '^\d{1,3}$' then v_item := v_item || jsonb_build_object('dueInDays', (e.v->>'dueInDays')::int); end if;
    v_keymap := v_keymap || jsonb_build_object(coalesce(e.v->>'key', 'e' || e.o), 'j' || e.o);
    v_stage_of := v_stage_of || jsonb_build_object('j' || e.o, v_stage);
    -- תלות (dependsOn: מפתחות) ⇒ «אחרי» כשהיא באותו שלב; הראשונה בלבד.
    v_item := v_item || jsonb_build_object('_deps', coalesce(e.v->'dependsOn', '[]'::jsonb));
    v_stage_items := jsonb_set(v_stage_items, array[v_stage], coalesce(v_stage_items->v_stage, '[]'::jsonb) || v_item);
    if not (v_stage_order ? v_stage) then
      v_stage_order := v_stage_order || jsonb_build_object(v_stage,
        coalesce(case when (e.v->>'stageOrder') ~ '^\d{1,6}$' then (e.v->>'stageOrder')::int end, 1000 + e.o));
    end if;
  end loop;

  for x in select key as name, value::int as ord from jsonb_each_text(v_stage_order) order by value::int loop
    v_stages := v_stages || jsonb_build_object(
      'key', 's' || (jsonb_array_length(v_stages) + 1), 'name', x.name, 'opens', jsonb_build_object('after', 'start'),
      'delivery', 'hold', 'reminder', null, 'notifyOffice', false,
      'items', (select coalesce(jsonb_agg(
                  (i.v - '_deps') || coalesce((
                    select jsonb_build_object('after', v_keymap->>d)
                      from jsonb_array_elements_text(case when jsonb_typeof(i.v->'_deps') = 'array' then i.v->'_deps' else '[]'::jsonb end) d
                     where v_keymap ? d and v_stage_of->>(v_keymap->>d) = x.name and v_keymap->>d <> i.v->>'key'
                     limit 1), '{}'::jsonb) order by o), '[]'::jsonb)
                  from jsonb_array_elements(v_stage_items->x.name) with ordinality as i(v, o)));
  end loop;
  if jsonb_array_length(v_stages) = 0 then return jsonb_build_object('ok', false, 'error', 'nothing_to_convert'); end if;
  v_def := jsonb_build_object('stages', v_stages);
  v_err := public.flow_definition_error(v_def, 'manual');
  if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err); end if;

  insert into public.office_flows (office_id, name, trigger, current_version, seed_key, created_by)
  values (v_office, t.name, 'manual', 1, 'journey_template:' || t.id, v_uid) returning id into v_flow;
  insert into public.office_flow_versions (flow_id, version, definition, note, created_by)
  values (v_flow, 1, v_def, 'הועבר מהתבנית «' || t.name || '»', v_uid);
  return jsonb_build_object('ok', true, 'flowId', v_flow);
end;
$$;

-- ── 2 · המחולל (generate_onboarding_steps) — גוף חי + שינויים מעוגנים ───────
create or replace function public.generate_onboarding_steps(p_engagement_id text, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  e            public.engagements%rowtype;
  q            public.quotations%rowtype;
  v_items      jsonb;
  v_has_monthly boolean := false;
  v_has_paperless boolean := false;
  v_needs_paperless boolean := false;
  v_has_rep    boolean := false;
  v_has_prev   boolean := false;
  v_new_business boolean := false;
  v_client     public.clients%rowtype;
  v_planned    jsonb := '[]'::jsonb;
  v_created    int := 0;
  v_id_conn    text;
  v_id_prevdet text;
  v_no_paperless boolean := false;
  v_conn_done  boolean := false;
  v_needs_prevdet boolean := false;
  v_docs       jsonb;
  v_licensed   boolean := false;
  v_kind       text;
  v_kind_fallback boolean := false;
  v_snap       jsonb;
  v_facts      jsonb;
  v_var        jsonb;
  v_prev_known boolean;
  v_fresh      boolean;
  v_office     uuid;
  v_oentry     jsonb;
  v_opayload   jsonb;
  v_oowner     text;
  v_otpl       public.journey_templates%rowtype;
  v_ores       jsonb;
  v_hold       boolean := false;
  v_r          jsonb;
  -- 217 · סוג העוסק שלא ידוע (kind_hold) ובקשות שלא נוצרו (creationProblem)
  v_kind_pending boolean := false;
  v_snap_kind  text;
  v_hold_keys  text[] := '{}';
  v_hold_lists jsonb;
  v_kdep       jsonb;
  v_held       jsonb := '[]'::jsonb;
  v_hkey       text;
  v_hentry     jsonb;
  v_htype      text;
  v_only       text[];
  v_oc         jsonb;
  v_prob       jsonb;
  v_problems   jsonb := '[]'::jsonb;
  v_new_titles jsonb := '[]'::jsonb;
  v_held_failed boolean := false;
  -- 217 · לקוח שחוזר (D1–D4)
  v_prev_end   timestamptz;
  v_returning  boolean := false;
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'engagement_not_found'); end if;
  -- ‼ 217: שחרור בקשות שחיכו לסוג העוסק (release_kind_hold) מריץ את המחולל רק על
  -- המפתחות שהוחזקו. דגל מקומי לטרנזקציה (כמו 168/208/212) — בלי חתימה נוספת.
  v_only := case when nullif(current_setting('pivo.generator_only_keys', true), '') is not null
                 then string_to_array(current_setting('pivo.generator_only_keys', true), ',') end;

  select * into q from public.quotations where id = e.quotation_id;
  select * into v_client from public.clients where id = e.client_id;

  v_items := coalesce(q.snapshot->'items', q.items, '[]'::jsonb);

  select
    bool_or(coalesce(it->>'category','') = 'monthly'),
    bool_or(coalesce(it->>'name','') ilike '%הנהלת חשבונות%'
         or coalesce(it->>'name','') ilike '%פייפרלס%'
         or coalesce(it->>'name','') ilike '%paperless%')
  into v_has_monthly, v_has_paperless
  from jsonb_array_elements(v_items) it;

  v_has_monthly   := coalesce(v_has_monthly, false);
  v_has_paperless := coalesce(v_has_paperless, false);

  v_no_paperless := coalesce(v_client.paperless_status, '') = 'not_applicable';
  v_needs_paperless := (v_has_monthly or v_has_paperless) and not v_no_paperless;

  -- ‼ עוסק מורשה וחברה בלבד: מספר הקצאה נדרש לחשבונית מס, ועוסק פטור אינו
  -- מוציא כזו. תבנית ההצעה היא ההכרעה; סוג העוסק שעל הכרטיס הוא הגיבוי
  -- כשההצעה נבנתה בלי תבנית. אין אף אחד מהם ⇒ לא מנחשים, והבקשה נשארת
  -- זמינה ידנית מ"+ בקשה חדשה".
  select coalesce(t.kind in ('licensed_dealer','company'), false)
    into v_licensed
    from public.quotation_templates t where t.id = q.template_id;
  v_licensed := coalesce(v_licensed, false)
                or coalesce(v_client.dealer_type, '') in ('licensed','company')
                or coalesce(v_client.vat_status, '') = 'authorizedDealer';

  v_has_rep := coalesce(q.representation_request_id, v_client.representation_request_id) is not null;

  v_has_prev := v_client.has_previous_accountant;
  if v_has_prev is null then
    select l.has_previous_accountant into v_has_prev
      from public.leads l where l.converted_client_id = e.client_id limit 1;
  end if;
  if v_has_prev is null and q.lead_id is not null then
    select l.has_previous_accountant into v_has_prev
      from public.leads l where l.id = q.lead_id limit 1;
  end if;
  v_has_prev := coalesce(v_has_prev, false);

  v_prev_known := v_client.has_previous_accountant;
  if v_prev_known is null then
    select l.has_previous_accountant into v_prev_known
      from public.leads l where l.converted_client_id = e.client_id limit 1;
  end if;
  if v_prev_known is null and q.lead_id is not null then
    select l.has_previous_accountant into v_prev_known
      from public.leads l where l.id = q.lead_id limit 1;
  end if;
  -- ‼ 216: «טרי» = המחולל עוד לא רץ על ההתקשרות. בקשת הייצוג מההצעה (ובקשות שהוכנו
  -- לפני האישור) מאומצות להתקשרות ברגע שהיא נוצרת (engagements_adopt_*), עוד לפני
  -- המחולל — והבדיקה הקודמת («אין אף שלב») ראתה אותן ודילגה על הצילום. בלי צילום
  -- המחולל דילג על כל הבקשות שהמשרד הוסיף לקליטה: הצעה עם ייצוג = בלי בקשות המשרד.
  -- התקשרות ישנה בלי צילום אבל עם שלבי מחולל — נשארת «לא טרייה», כמו קודם.
  -- ‼ הסימן: «ביקורת חודש ראשון» — רק המחולל יוצר אותה (היא לא ב-request_creatable_step_types),
  -- וכל גרסה שלו יצרה אותה. סוגים שהמשרד יכול להכין לפני האישור («מסמכים מהלקוח»,
  -- רו"ח קודם, פייפרלס, שאלון…) אינם סימן: בקשה כזו שהוכנה מראש ואומצה כיבתה את הצילום,
  -- וכל בקשות המשרד בקליטה דולגו בשקט.
  v_fresh := e.journey_default_facts is null and not exists (
    select 1 from public.onboarding_steps
     where engagement_id = e.id and step_type = 'first_month_review');
  if v_fresh then
    v_new_business := (v_prev_known is false) or (v_client.business_transfer is false);
  else
    v_new_business := coalesce(v_client.business_transfer, not v_has_prev) = false and v_has_prev = false
                      and v_client.business_transfer is not null;
  end if;

  v_needs_prevdet := nullif(trim(coalesce(v_client.prev_accountant_email, '')), '') is null;

  -- ‼ 217 · לקוח שחוזר: ההתקשרות הקודמת הסתיימה, וזו קליטה חדשה (לא עדכון הסכם — אין
  -- supersedes). הכרטיס עדיין מתאר את הקליטה הראשונה: «עסק חדש» אז אינו עסק חדש עכשיו
  -- (D4), ורו"ח הקודם שעל הכרטיס הוא זה שלפנינו — לא מי שטיפל בלקוח מאז שעזב (D3):
  -- שואלים מחדש, בלי הפרטים הישנים לאישור, והמכתב מחכה לתשובה. בהרצה חוזרת — מהעובדות.
  v_prev_end := public.previous_engagement_end(e.client_id, e.id);
  v_returning := e.supersedes_engagement_id is null
                 and ((v_fresh and v_prev_end is not null)
                      or coalesce(e.journey_default_facts->>'returning', 'false') = 'true');
  if v_returning then
    v_new_business := false;
    v_needs_prevdet := true;
  end if;

  -- JF4 · פרדיקט אחד. התקשרות בקליטה ⇒ השלב 'onboarding' ⇒ לא מוחזק; הכלל
  -- כתוב כאן כדי שלא יהיו שני ניסוחים, לא כי המצב האחר נגיש היום.
  v_hold := public.requests_held_until_approval(e.client_id);

  -- ‼ גבול מחזור החיים במפורש: רק התקשרות שאין לה עדיין שום שלב
  -- מקבלת צילום. מסע שכבר התחיל ממשיך לפי מה שנולד איתו, ולכן עריכה
  -- עתידית של ברירת המחדל אינה נוגעת בו (הכרעת גיא 2026-08-25).
  v_facts := jsonb_build_object(
    'monthly', v_has_monthly, 'paperless', v_has_paperless,
    'licensed', v_licensed, 'rep', v_has_rep, 'has_prev', v_has_prev,
    'new_business', v_new_business, 'no_prev_email', v_needs_prevdet,
    -- 216: מצב משפחתי מהכרטיס - לתנאי «נשוי/אה» בבקשות של המשרד.
    'married', coalesce(v_client.family_status = 'married', false))
    || case when v_returning
            then jsonb_build_object('returning', true, 'previousEngagementEndedAt', v_prev_end)
            else '{}'::jsonb end;

  select office_id into v_office from public.profiles where id = e.user_id;
  v_snap := e.journey_default_snapshot;
  if v_snap is null and v_fresh then
    -- JF19 · צילום תמיד: משרד נזרע אם חסר, ובלי משרד — זריעת הקוד.
    -- ‼ 217: סוג שלא ידוע אינו «עוסק מורשה». תבנית «מותאמת» — הסוג מהכרטיס בלבד
    -- (_engagement_kind); אין כזה ⇒ ריק. הצילום נלקח מרשימת המורשה (snapshotKind,
    -- כדי שתמיד יהיה צילום), אבל כל מה ששונה בין עוסק פטור, עוסק מורשה וחברה מוחזק
    -- (engagements.kind_hold) עד שהמשרד קובע את הסוג — ואז נפתח לפי הסוג שנקבע.
    v_kind := public._engagement_kind(e.quotation_id, e.client_id);
    v_kind_pending := v_kind is null;
    v_kind_fallback := v_kind_pending;
    v_snap_kind := coalesce(v_kind, 'licensed_dealer');
    if v_office is not null then
      select d.entries into v_snap from public.office_journey_defaults d
       where d.office_id = v_office and d.client_kind = v_snap_kind;
      if v_snap is null and not p_dry_run then
        perform public.seed_office_journey_defaults(v_office);
        select d.entries into v_snap from public.office_journey_defaults d
         where d.office_id = v_office and d.client_kind = v_snap_kind;
      end if;
    end if;
    if v_snap is null then
      v_snap := public.default_journey_entries(v_snap_kind);
    end if;
    v_facts := v_facts || jsonb_build_object('kind', v_kind, 'snapshotKind', v_snap_kind,
                                             'kindFallback', v_kind_fallback, 'kindPending', v_kind_pending);
    if not p_dry_run then
      update public.engagements
         set journey_default_snapshot = v_snap, journey_default_facts = v_facts
       where id = e.id;
    end if;
  elsif e.journey_default_facts is not null then
    v_facts := e.journey_default_facts;   -- הרצה חוזרת: דטרמיניזם
  end if;

  -- ‼ 217: הרצה חוזרת בזמן שהסוג עדיין לא נקבע — אותם מפתחות מוחזקים, מהרשימות
  -- שהוקפאו באישור. נקלט כשהסוג לא ידוע ושום דבר לא הוחזק אז (kindPending בלי
  -- kind_hold) — נבדק שוב מול הרשימות של היום, כל עוד הסוג עדיין לא ידוע.
  if jsonb_typeof(e.kind_hold) = 'object' then
    if e.kind_hold->>'resolvedAt' is null then
      v_kind_pending := true;
      v_hold_keys := coalesce((select array_agg(x) from jsonb_array_elements_text(
                       case when jsonb_typeof(e.kind_hold->'keys') = 'array' then e.kind_hold->'keys' else '[]'::jsonb end) x), '{}');
      v_hold_lists := e.kind_hold->'lists';
    end if;
  elsif not v_kind_pending and coalesce(v_facts->>'kindPending', 'false') = 'true'
        and public._engagement_kind(e.quotation_id, e.client_id) is null then
    v_kind_pending := true;
  end if;
  if v_kind_pending and v_hold_lists is null then
    -- ‼ אישור ההצעה לא נופל בגלל רשימה פגומה של המשרד: נופלים לברירת המחדל של הקוד.
    begin
      v_kdep := public._kind_dependent_entries(v_office);
    exception when others then
      v_kdep := public._kind_dependent_entries(null);
    end;
    v_hold_keys := coalesce((select array_agg(x) from jsonb_array_elements_text(v_kdep->'keys') x), '{}');
    v_hold_lists := v_kdep->'lists';
  end if;

  -- ── עבודת מערכת (סיווג C ב-135): לא ברשומות, לא נכבית מהמסך ───────────────
  -- JF12 · גם כאן: מה שהמשרד הסיר אינו נולד מחדש בהרצה חוזרת.
  if v_has_rep then
    if not exists (select 1 from public.onboarding_steps
                    where client_id = e.client_id and step_type = 'representation' and status <> 'cancelled')
       and not public.step_removed_by_office(e.client_id, 'representation', e.id)
       -- 217: מחכה לסוג העוסק ⇒ לא כאן; שחרור ⇒ רק המפתחות שחיכו
       and not ('representation' = any (v_hold_keys)) and (v_only is null or 'representation' = any (v_only)) then
      v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
               'representation', 'authorities', 'person', 'me', '{}'::jsonb,
               true, null, false, v_hold, 'in_progress', null, p_dry_run);
      v_planned := v_planned || jsonb_build_object('step_type','representation','track','authorities','scope','person','status', v_r->>'status');
      if not p_dry_run then v_created := v_created + 1; end if;
    end if;

    if not exists (select 1 from public.onboarding_steps
                    where client_id = e.client_id and step_type = 'kyc_identification' and status <> 'cancelled')
       and not public.step_removed_by_office(e.client_id, 'kyc_identification', e.id)
       -- 217: מחכה לסוג העוסק ⇒ לא כאן; שחרור ⇒ רק המפתחות שחיכו
       and not ('kyc_identification' = any (v_hold_keys)) and (v_only is null or 'kyc_identification' = any (v_only)) then
      v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
               'kyc_identification', 'internal', 'person', 'me', '{}'::jsonb,
               true, null, false, v_hold, 'pending', null, p_dry_run);
      v_planned := v_planned || jsonb_build_object('step_type','kyc_identification','track','internal','scope','person','status', v_r->>'status');
      if not p_dry_run then v_created := v_created + 1; end if;
    end if;
  end if;

  if v_new_business then
    if not exists (select 1 from public.onboarding_steps
                    where client_id = e.client_id and step_type = 'file_opening' and status <> 'cancelled')
       and not public.step_removed_by_office(e.client_id, 'file_opening', e.id)
       -- 217: מחכה לסוג העוסק ⇒ לא כאן; שחרור ⇒ רק המפתחות שחיכו
       and not ('file_opening' = any (v_hold_keys)) and (v_only is null or 'file_opening' = any (v_only)) then
      v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
               'file_opening', 'authorities', 'person', 'me',
               jsonb_build_object('checklist', jsonb_build_array(
                 jsonb_build_object('key','vat','label','פתיחת תיק מעמ','done',false),
                 jsonb_build_object('key','income_tax','label','פתיחת תיק מס הכנסה','done',false),
                 jsonb_build_object('key','ni','label','פתיחת תיק ביטוח לאומי','done',false))),
               true, null, false, v_hold, 'pending', null, p_dry_run);
      v_planned := v_planned || jsonb_build_object('step_type','file_opening','track','authorities','scope','person','status', v_r->>'status');
      if not p_dry_run then v_created := v_created + 1; end if;
    end if;
  end if;

  -- ── מסמכים מהלקוח ────────────────────────────────────────────────────────────
  -- הרשימה נגזרת מסוג הלקוח: מי שעובר מרו"ח מתבקש את מה שיש לו ביד; עסק חדש
  -- מתבקש את תעודות הפתיחה. הרו"ח יכול לערוך את הרשימה בבונה התהליך.
  -- ‼ 217: «לכל התקשרות» (D4) — מה שהושלם בהתקשרות קודמת הוא היסטוריה, לא «כבר קיימת».
  if not public._intake_step_exists(e.client_id, e.id, 'client_documents')
     and not public.step_removed_by_office(e.client_id, 'client_documents', e.id)
     -- 217: מחכה לסוג העוסק ⇒ לא כאן; שחרור ⇒ רק המפתחות שחיכו
     and not ('client_documents' = any (v_hold_keys)) and (v_only is null or 'client_documents' = any (v_only))
     and public.journey_default_enabled(v_snap, 'client_documents') then
    v_var := public.journey_default_variant(v_snap, 'client_documents', v_facts);
    if v_var is not null then
      v_docs := public.journey_default_checklist(v_var);
    elsif v_new_business then
      v_docs := jsonb_build_array(
        jsonb_build_object('key','vat_cert','label','תעודת עוסק','done',false),
        jsonb_build_object('key','id_card','label','צילום תעודת זהות','done',false),
        jsonb_build_object('key','bank_confirm','label','אישור ניהול חשבון בנק','done',false));
    elsif v_has_prev then
      v_docs := jsonb_build_array(
        jsonb_build_object('key','bank_confirm','label','אישור ניהול חשבון בנק','done',false),
        jsonb_build_object('key','last_return','label','דוח שנתי אחרון','done',false),
        jsonb_build_object('key','form106','label','טופס 106','done',false));
    else
      v_docs := jsonb_build_array(
        jsonb_build_object('key','id_card','label','צילום תעודת זהות','done',false),
        jsonb_build_object('key','bank_confirm','label','אישור ניהול חשבון בנק','done',false));
    end if;

    v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
             'client_documents', 'tools', 'person', 'client',
             jsonb_build_object(
               'checklist', v_docs,
               'clientTitle', 'להעלות ' || jsonb_array_length(v_docs) || ' מסמכים',
               'clientSub', (select string_agg(d->>'label', ' · ') from jsonb_array_elements(v_docs) d),
               'clientCta', 'להעלאה'),
             true, null, true, v_hold, 'pending', null, p_dry_run);
    v_planned := v_planned || jsonb_build_object('step_type','client_documents','track','tools','scope','person','status', v_r->>'status');
    if not p_dry_run then v_created := v_created + 1; end if;
  end if;

  -- ── מסלול הרו"ח הקודם ──────────────────────────────────────────────────────
  -- JF12 · כל אחד משלושת השלבים נבדק בנפרד: הסרה של אחד אינה מסתירה את השני,
  -- והסרה אינה נולדת מחדש (117).
  if v_has_prev then
    -- ── פרטי הרו"ח הקודם ──────────────────────────────────────────────────────
    -- נשאלים רק אם אינם על הכרטיס. בלי מייל אין למי לשלוח מכתב שחרור,
    -- ולכן המכתב תלוי בשלב הזה ולא נולד פתוח לחינם.
    -- ‼ 115: השאלה ללקוח נוצרת תמיד (הכרעת גיא 2026-08-18). כשיש כבר
    -- אימייל בכרטיס היא בקשת אישור בלבד — לא נועלת ולא חוסמת סגירה.
    -- ‼ 217: «לכל התקשרות» (D4) — כמו «מסמכים מהלקוח».
    if not public._intake_step_exists(e.client_id, e.id, 'prev_accountant_details')
       and not public.step_removed_by_office(e.client_id, 'prev_accountant_details', e.id)
       -- 217: מחכה לסוג העוסק ⇒ לא כאן; שחרור ⇒ רק המפתחות שחיכו
       and not ('prev_accountant_details' = any (v_hold_keys)) and (v_only is null or 'prev_accountant_details' = any (v_only))
       and public.journey_default_enabled(v_snap, 'prev_accountant_details') then
      v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
               'prev_accountant_details', 'prev_accountant', 'person', 'client',
               coalesce(
                 public.journey_default_variant(v_snap, 'prev_accountant_details', v_facts)->'copy',
                 case when v_needs_prevdet then jsonb_build_object(
                   'clientTitle', 'פרטי רואה החשבון הקודם שלך',
                   'clientSub', 'שם, אימייל וטלפון - כדי שנפנה אליו בשמך',
                   'clientCta', 'למילוי')
                 else jsonb_build_object(
                   'clientTitle', 'לאשר את פרטי רואה החשבון הקודם',
                   'clientSub', 'הפרטים שאצלנו מוצגים למילוי מראש - רק לוודא שהם נכונים',
                   'clientCta', 'לאישור') end)
               -- ‼ 217 (D3): לקוח שחוזר — הטופס בדף ריק; הפרטים שעל הכרטיס הם של מי שהיה לפנינו.
               || case when v_returning then jsonb_build_object('askAgain', true) else '{}'::jsonb end,
               v_needs_prevdet, null, false, v_hold, 'pending', null, p_dry_run);
      v_id_prevdet := v_r->>'stepId';
      v_planned := v_planned || jsonb_build_object('step_type','prev_accountant_details','track','prev_accountant','scope','person','status', v_r->>'status');
      if not p_dry_run then v_created := v_created + 1; end if;
    end if;

    -- המכתב תלוי בשאלה רק כשאין מייל בכרטיס (התנאי העסקי); *במה* — מהצילום.
    if not public._intake_step_exists(e.client_id, e.id, 'release_letter')
       and not public.step_removed_by_office(e.client_id, 'release_letter', e.id)
       -- 217: מחכה לסוג העוסק ⇒ לא כאן; שחרור ⇒ רק המפתחות שחיכו
       and not ('release_letter' = any (v_hold_keys)) and (v_only is null or 'release_letter' = any (v_only))
       and public.journey_default_enabled(v_snap, 'release_letter') then
      v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
               'release_letter', 'prev_accountant', 'person', 'me', '{}'::jsonb,
               true, 'prev_accountant_details', v_needs_prevdet, v_hold, 'pending', null, p_dry_run);
      v_planned := v_planned || jsonb_build_object('step_type','release_letter','track','prev_accountant','scope','person','status', v_r->>'status');
      if not p_dry_run then v_created := v_created + 1; end if;
    end if;

    if not public._intake_step_exists(e.client_id, e.id, 'materials_received')
       and not public.step_removed_by_office(e.client_id, 'materials_received', e.id)
       -- 217: מחכה לסוג העוסק ⇒ לא כאן; שחרור ⇒ רק המפתחות שחיכו
       and not ('materials_received' = any (v_hold_keys)) and (v_only is null or 'materials_received' = any (v_only))
       and public.journey_default_enabled(v_snap, 'materials_received') then
      -- JF25 · הרשימה מ-④ — אותה רשימה ש-create_onboarding_request ממלאת.
      v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
               'materials_received', 'prev_accountant', 'person', 'prev_accountant',
               jsonb_build_object('checklist', public.default_materials_checklist()),
               true, 'release_letter', true, v_hold, 'pending', null, p_dry_run);
      v_planned := v_planned || jsonb_build_object('step_type','materials_received','track','prev_accountant','scope','person','status', v_r->>'status');
      if not p_dry_run then v_created := v_created + 1; end if;
    end if;
  end if;

  -- ── פייפרלס ──────────────────────────────────────────────────────────────
  if v_needs_paperless then
    if not exists (select 1 from public.onboarding_steps
                    where client_id = e.client_id and step_type = 'paperless_invite' and status <> 'cancelled')
       and not public.step_removed_by_office(e.client_id, 'paperless_invite', e.id)
       -- 217: מחכה לסוג העוסק ⇒ לא כאן; שחרור ⇒ רק המפתחות שחיכו
       and not ('paperless_invite' = any (v_hold_keys)) and (v_only is null or 'paperless_invite' = any (v_only))
       and public.journey_default_enabled(v_snap, 'paperless_invite') then
      v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
               'paperless_invite', 'tools', 'person', 'client',
               jsonb_build_object('paperlessStatus', coalesce(v_client.paperless_status,'unknown'),
                                  'dataSource','unknown',
                                  'clientTitle','הרשמה לפייפרלס',
                                  'clientSub','שתי דקות, ומשם רק מצלמים קבלות מהטלפון',
                                  'clientCta','נרשמתי לפייפרלס'),
               true, null, true, v_hold, 'pending', null, p_dry_run);
      v_planned := v_planned || jsonb_build_object('step_type','paperless_invite','track','tools','scope','person','status', v_r->>'status');
      if not p_dry_run then v_created := v_created + 1; end if;
    end if;

    select id, status in ('completed','verified','skipped')
      into v_id_conn, v_conn_done
      from public.onboarding_steps
      where client_id = e.client_id and step_type = 'paperless_connection' and status <> 'cancelled' limit 1;
    if v_id_conn is null
       and not public.step_removed_by_office(e.client_id, 'paperless_connection', e.id)
       -- 217: מחכה לסוג העוסק ⇒ לא כאן; שחרור ⇒ רק המפתחות שחיכו
       and not ('paperless_connection' = any (v_hold_keys)) and (v_only is null or 'paperless_connection' = any (v_only))
       and public.journey_default_enabled(v_snap, 'paperless_connection') then
      v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
               'paperless_connection', 'tools', 'person', 'me',
               jsonb_build_object(
                 'clientTitle', 'חיבור לפייפרלס',
                 'clientSub', 'בימים הקרובים ניכנס לחשבון הפייפרלס ונשלים את החיבור. אין צורך לעשות דבר כרגע.'),
               true, 'paperless_invite', true, v_hold, 'pending', null, p_dry_run);
      v_id_conn := v_r->>'stepId';
      v_conn_done := false;
      v_planned := v_planned || jsonb_build_object('step_type','paperless_connection','track','tools','scope','person','status', v_r->>'status');
      if not p_dry_run then v_created := v_created + 1; end if;
    end if;
  end if;

  -- ── חיבור פייפרלס לרשות המסים ──────────────────────────────────────────
  -- ‼ תלוי בחיבור ולא בהרשמה: בלי שם עסק ומשיכת עוסקים בחשבון אין מה לחבר.
  -- ‼ הכדור אצל הלקוח — ההזדהות היא בתעודת הזהות ובקוד הקבוע שלו.
  if v_needs_paperless and v_licensed
     and not public.step_removed_by_office(e.client_id, 'paperless_tax_authority', e.id)
     -- 217: מחכה לסוג העוסק ⇒ לא כאן; שחרור ⇒ רק המפתחות שחיכו
     and not ('paperless_tax_authority' = any (v_hold_keys)) and (v_only is null or 'paperless_tax_authority' = any (v_only))
     and not exists (select 1 from public.onboarding_steps
                      where client_id = e.client_id and step_type = 'paperless_tax_authority'
                        and status <> 'cancelled')
     and public.journey_default_enabled(v_snap, 'paperless_tax_authority') then
    v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
             'paperless_tax_authority', 'tools', 'person', 'client',
             jsonb_build_object(
               'clientTitle', 'חיבור פייפרלס לרשות המסים',
               'clientSub', 'כדי שהחשבוניות שלך יקבלו מספר הקצאה',
               'clientNote', E'1. בפייפרלס: הגדרות ← חיבורים והרשאות, ולחיצה על אייקון הקישור.\n2. נפתח אתר רשות המסים ומבקש הזדהות - תעודת זהות וקוד קבוע (לא כרטיס חכם). מאשרים את ההרשאה.\n3. חוזרים לפייפרלס ולוחצים "המשך".',
               'clientNoteAfter', 'החיבור תקף לשלושה חודשים ואז צריך לחדש אותו - נזכיר לך כשיגיע הזמן. אם החיבור נכשל, ממתינים כשלוש שעות ומנסים שוב.',
               'clientCta', 'ביצעתי את החיבור',
               'clientLinkUrl', 'https://academy-bu.paperless.tax/he/articles/11424861-%D7%97%D7%99%D7%91%D7%95%D7%A8-%D7%94%D7%9E%D7%A2%D7%A8%D7%9B%D7%AA-%D7%9C%D7%A8%D7%A9%D7%95%D7%AA-%D7%94%D7%9E%D7%99%D7%A1%D7%99%D7%9D'),
             true, 'paperless_connection', true, v_hold, 'pending', null, p_dry_run);
    v_planned := v_planned || jsonb_build_object('step_type','paperless_tax_authority','track','tools','scope','person','status', v_r->>'status');
    if not p_dry_run then v_created := v_created + 1; end if;
  end if;

  -- ── הרשאת התשלום החודשי ───────────────────────────────────────────────────
  if v_has_monthly then
    if not public._intake_step_exists(e.client_id, e.id, 'retainer_authorization')
       and not public.step_removed_by_office(e.client_id, 'retainer_authorization', e.id)
       -- 217: מחכה לסוג העוסק ⇒ לא כאן; שחרור ⇒ רק המפתחות שחיכו
       and not ('retainer_authorization' = any (v_hold_keys)) and (v_only is null or 'retainer_authorization' = any (v_only))
       and public.journey_default_enabled(v_snap, 'retainer_authorization') then
      v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
               'retainer_authorization', 'payment', 'engagement', 'me',
               jsonb_build_object('amount', e.monthly_total, 'billingStartMonth', e.billing_start_month,
                                  'clientTitle', 'להזין אמצעי תשלום',
                                  'clientSub', 'הסכום שסוכם בהצעה, כהרשאה קבועה',
                                  'clientCta', 'להזנה')
               || case when v_no_paperless then jsonb_build_object('method','manual_arrangement') else '{}'::jsonb end,
               true, 'paperless_connection', true, v_hold, 'pending', null, p_dry_run);
      v_planned := v_planned || jsonb_build_object('step_type','retainer_authorization','track','payment','scope','engagement',
                                                   'status', v_r->>'status', 'depends_on', v_r->'dependsOn');
      if not p_dry_run then v_created := v_created + 1; end if;
    end if;
  end if;

  -- ── עבודה פנימית (סיווג C) — קיום נבדק לפי ההתקשרות, כולל שורה מבוטלת ──
  if v_only is null and not exists (select 1 from public.onboarding_steps
                 where engagement_id = e.id and step_type = 'internal_setup') then
    v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
             'internal_setup', 'internal', 'engagement', 'me',
             jsonb_build_object('checklist', jsonb_build_array(
               jsonb_build_object('key','file_numbers','label','מספרי תיקים בכרטיס','done',false),
               jsonb_build_object('key','assignee','label','שיוך מטפל','done',false),
               jsonb_build_object('key','frequencies','label','תדירויות דיווח','done',false))),
             true, null, false, v_hold, 'pending', null, p_dry_run);
    v_planned := v_planned || jsonb_build_object('step_type','internal_setup','track','internal','scope','engagement','status', v_r->>'status');
    if not p_dry_run then v_created := v_created + 1; end if;
  end if;

  if v_only is null and not exists (select 1 from public.onboarding_steps
                 where engagement_id = e.id and step_type = 'first_month_review') then
    v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
             'first_month_review', 'review', 'engagement', 'me', '{}'::jsonb,
             false, null, false, v_hold, 'pending',
             (coalesce(e.approved_at, now()) + interval '30 days')::date, p_dry_run);
    v_planned := v_planned || jsonb_build_object('step_type','first_month_review','track','review','scope','engagement','status', v_r->>'status');
    if not p_dry_run then v_created := v_created + 1; end if;
  end if;

  -- ── בקשות חופשיות של המשרד (137) ──────────────────────────────────────────
  -- 216: המשרד נדרש גם בהרצה חוזרת - לפתרון בקשה מהספרייה לפי templateId.
  if v_office is null then
    select office_id into v_office from public.profiles where id = e.user_id;
  end if;
  if v_snap is not null then
    for v_oentry in
      select value from jsonb_array_elements(v_snap)
       where value->>'source' = 'office'
         -- 216: ערך פגום לא מפיל אישור הצעה (היה cast ישיר).
         and coalesce(value->>'enabled', 'true') <> 'false'
       order by case when (value->>'sortIndex') ~ '^-?\d{1,9}$' then (value->>'sortIndex')::int else 0 end
    loop
      continue when v_only is not null and not (coalesce(v_oentry->>'key', '') = any (v_only));
      -- כבר קיימת אצל הלקוח (כולל מבוטלת) ⇒ לא נוצרת שוב. ‼ 217: בקליטה הזו (או הוכנה
      -- לקראתה) — בקשה מהקליטה של התקשרות קודמת היא היסטוריה, ולקוח שחוזר מקבל אותה שוב.
      continue when exists (
        select 1 from public.onboarding_steps s
         where s.client_id = e.client_id
           and s.payload->'defaultOrigin'->>'key' = v_oentry->>'key'
           and (s.engagement_id = e.id
                or (s.engagement_id is null and s.created_at >= coalesce(v_prev_end, '-infinity'::timestamptz))));
      -- ‼ 217: בקשה שלא נוצרה כבר מחכה בשורה האדומה שלה, או שהמשרד סגר אותה («אין צורך»,
      -- או ביטול מסלול הקליטה). אין ניסיון שקט נוסף באישור חוזר — «צור שוב» הוא כפתור
      -- מפורש בשורה, ואישור חוזר אחרי ביטול לא מחזיר דבר לחיים (כמו כל בקשה שבוטלה).
      continue when exists (
        select 1 from public.onboarding_steps s
         where s.client_id = e.client_id and s.payload ? 'creationProblem'
           and s.payload->'creationProblem'->>'key' = 'gen:' || e.id || ':' || coalesce(v_oentry->>'key', ''));
      -- ‼ 217: שונה בין סוגי העוסק ⇒ מחכה לסוג (נאסף למטה, ב«מה מחכה לסוג העוסק»).
      continue when (v_oentry->>'key') = any (v_hold_keys);
      -- 216: תנאי העובדות של מסלול הקליטה (למשל «נשוי/אה»), הנוסח והבעלים מהספרייה,
      -- ומסמך שהוסר — כולם בתוך היצירה (_onboarding_office_default_create, 217).
      begin
        v_oc := public._onboarding_office_default_create(e, v_oentry, v_office, v_facts, p_dry_run);
      exception when others then
        v_oc := jsonb_build_object('ok', false, 'attempted', true, 'reason', 'create_failed',
                  'title', coalesce(nullif(v_oentry->'payload'->>'title', ''), 'בקשה של המשרד'));
      end;
      -- ‼ «planned» כמו קודם: כל מה שהגיע לניסיון היצירה (גם אם נכשל), ולא מה שלא היה לו תוכן.
      if coalesce((v_oc->>'attempted')::boolean, false) then
        v_planned := v_planned || jsonb_build_object(
          'step_type', coalesce(v_oentry->>'stepType', 'custom_request'),
          'track', 'custom', 'scope', 'person', 'status', 'pending',
          'officeKey', v_oentry->>'key');
      end if;
      if coalesce((v_oc->>'ok')::boolean, false) then
        if not p_dry_run then v_created := v_created + 1; end if;
        continue;
      end if;
      -- לא חל / כבר קיימת מאותו סוג — לא בעיה.
      continue when public._creation_problem_class(v_oc->>'reason') is null;
      -- ‼ 217: בקשה שהייתה אמורה להיווצר ולא נוצרה — שורה אדומה ב«בקשות» עם הסיבה ומה עושים.
      -- לא מפילים את האישור בגלל בקשה אחת, וגם לא בגלל הרישום שלה.
      v_prob := jsonb_strip_nulls(jsonb_build_object(
        'key', 'gen:' || e.id || ':' || coalesce(v_oentry->>'key', ''), 'source', 'generator',
        'reason', v_oc->>'reason', 'engagementId', e.id, 'entryKey', v_oentry->>'key',
        'ref', v_oc->'ref', 'itemTitle', v_oc->>'title'));
      if p_dry_run then
        v_problems := v_problems || v_prob;
        continue;
      end if;
      begin
        v_r := public._record_creation_problem(e.client_id, e.id, v_prob,
                 coalesce(v_oentry->>'requiredForClose', 'true') <> 'false');
        v_problems := v_problems || (v_prob || jsonb_build_object('stepId', v_r->>'stepId'));
        if coalesce((v_r->>'inserted')::boolean, false) then
          v_new_titles := v_new_titles || to_jsonb(coalesce(v_oc->>'title', 'בקשה'));
        end if;
      exception when others then
        begin
          perform public.log_onboarding_event(e.user_id, null, e.id, 'note', 'system',
            'בקשה מהקליטה לא נוצרה: «' || coalesce(v_oc->>'title', 'בקשה') || '» (גם הרישום שלה ברשימה נכשל)',
            jsonb_build_object('officeKey', v_oentry->>'key', 'reason', v_oc->>'reason', 'error', left(sqlerrm, 200)));
        exception when others then null;
        end;
      end;
    end loop;
  end if;

  -- ── 217 · מה מחכה לסוג העוסק ──────────────────────────────────────────────
  -- ‼ רק מה שהיה נוצר: אותם שערים כמו למעלה, בלי הסוג (עובדת «מורשה» לא ידועה —
  -- תנאי שתלוי בה נבדק בשני הכיוונים). מפתח שאינו בצילום (רק ברשימה של סוג אחר)
  -- נלקח מהרשימות שהוקפאו באישור. הרשימה הזו היא מה שהמשרד רואה; השחרור עצמו
  -- מריץ את המחולל על כל המפתחות שהוחזקו (release_kind_hold).
  if v_kind_pending and cardinality(v_hold_keys) > 0 then
    begin
    foreach v_hkey in array v_hold_keys loop
      v_hentry := null;
      select x into v_hentry from jsonb_array_elements(coalesce(v_snap, '[]'::jsonb)) x
       where coalesce(nullif(x->>'key', ''), x->>'stepType') = v_hkey and coalesce(x->>'enabled', 'true') <> 'false'
       limit 1;
      if v_hentry is null then
        select x into v_hentry
          from jsonb_each(case when jsonb_typeof(v_hold_lists) = 'object' then v_hold_lists else '{}'::jsonb end) l,
               jsonb_array_elements(case when jsonb_typeof(l.value) = 'array' then l.value else '[]'::jsonb end) x
         where coalesce(nullif(x->>'key', ''), x->>'stepType') = v_hkey and coalesce(x->>'enabled', 'true') <> 'false'
         limit 1;
      end if;
      continue when v_hentry is null;
      if v_hentry->>'source' = 'office' then
        continue when exists (select 1 from public.onboarding_steps s
                               where s.client_id = e.client_id and s.payload->'defaultOrigin'->>'key' = v_hkey
                                 and (s.engagement_id = e.id
                                      or (s.engagement_id is null
                                          and s.created_at >= coalesce(v_prev_end, '-infinity'::timestamptz))));
        continue when not (public.flow_when_matches(v_hentry->'when', v_facts || '{"licensed":true}'::jsonb)
                           or public.flow_when_matches(v_hentry->'when', v_facts || '{"licensed":false}'::jsonb));
      else
        v_htype := coalesce(nullif(v_hentry->>'stepType', ''), v_hkey);
        continue when public._intake_step_exists(e.client_id, e.id, v_htype);
        continue when public.step_removed_by_office(e.client_id, v_htype, e.id);
        continue when case v_htype
          when 'prev_accountant_details' then not v_has_prev
          when 'release_letter' then not v_has_prev
          when 'materials_received' then not v_has_prev
          when 'paperless_invite' then not v_needs_paperless
          when 'paperless_connection' then not v_needs_paperless
          when 'paperless_tax_authority' then not v_needs_paperless
          when 'retainer_authorization' then not v_has_monthly
          when 'representation' then not v_has_rep
          when 'kyc_identification' then not v_has_rep
          when 'file_opening' then not v_new_business
          else false end;
      end if;
      v_held := v_held || public._kind_hold_entry(v_hentry, v_office, e.user_id);
    end loop;
    exception when others then
      -- ‼ לא מפילים את האישור. המפתחות עדיין מוחזקים (לא נוצרו) — ולכן ההמתנה נרשמת בכל
      -- זאת, כדי שקביעת הסוג תפתח אותם; הרשימה תתמלא בהרצה הבאה.
      v_held_failed := true;
      perform public.log_onboarding_event(e.user_id, null, e.id, 'note', 'system',
        'סוג העוסק לא ידוע - לא הצלחנו לחשב אילו בקשות מחכות לו',
        jsonb_build_object('kindHoldEvent', 'held_failed', 'error', left(sqlerrm, 200)));
    end;

    if not p_dry_run then
      if jsonb_typeof(e.kind_hold) = 'object' then
        update public.engagements set kind_hold = kind_hold || jsonb_build_object('held', v_held)
         where id = e.id and kind_hold->>'resolvedAt' is null;
      elsif jsonb_array_length(v_held) > 0 or v_held_failed then
        update public.engagements
           set kind_hold = jsonb_build_object('since', now(),
                 'snapshotKind', coalesce(v_facts->>'snapshotKind', 'licensed_dealer'),
                 'keys', to_jsonb(v_hold_keys), 'held', v_held, 'lists', v_hold_lists)
         where id = e.id and kind_hold is null;
        perform public.log_onboarding_event(e.user_id, null, e.id, 'note', 'system',
          'סוג העוסק לא ידוע - '
            || case jsonb_array_length(v_held)
                 -- החישוב נכשל (v_held_failed): המפתחות מוחזקים, הרשימה תתמלא בהרצה הבאה.
                 when 0 then 'יש בקשות שמחכות לו. הן ייפתחו'
                 when 1 then 'בקשה אחת מחכה לו: «' || (v_held->0->>'title') || '». היא תיפתח'
                 else jsonb_array_length(v_held) || ' בקשות מחכות לו: '
                      || (select string_agg('«' || (h->>'title') || '»', ', ') from jsonb_array_elements(v_held) h)
                      || '. הן ייפתחו' end
            || ' כשייקבע בתיק המס אם זה עוסק פטור, עוסק מורשה או חברה.',
          jsonb_build_object('kindHoldEvent', 'held', 'keys', (select jsonb_agg(h->'key') from jsonb_array_elements(v_held) h)));
      end if;
    end if;
  end if;

  -- ‼ 217: מייל אחד לרו"ח כשאישור הצעה (בלי שהוא מול המסך) השאיר בקשה שלא נוצרה.
  -- רק כשנפתחה שורה חדשה — אישור חוזר לא שולח שוב.
  if not p_dry_run and jsonb_array_length(v_new_titles) > 0 then
    begin
      perform public.queue_accountant_notification(e.user_id, 'request_not_created', e.client_id, null, null, e.quotation_id,
        jsonb_build_object('engagementId', e.id, 'titles', v_new_titles));
    exception when others then null;
    end;
  end if;

  if not p_dry_run and v_created > 0 then
    perform public.log_onboarding_event(e.user_id, null, e.id, 'created', 'system',
      'מסלול הקליטה הורכב מההצעה שאושרה', jsonb_build_object('stepsCreated', v_created));
  end if;

  -- ‼ 217: «problems» ו«held» בנפרד מ«planned» — ההשוואות של הלוך-ושוב (planned) לא זזות.
  return jsonb_build_object(
    'ok', true, 'dryRun', p_dry_run, 'engagementId', e.id, 'clientId', e.client_id,
    'created', v_created, 'planned', v_planned,
    'problems', v_problems, 'kindPending', v_kind_pending, 'held', v_held,
    'facts', jsonb_build_object(
      'hasMonthly', v_has_monthly, 'hasPaperlessService', v_has_paperless,
      'needsPaperless', v_needs_paperless, 'hasRepresentation', v_has_rep,
      'hasPreviousAccountant', v_has_prev, 'newBusiness', v_new_business,
      'noPaperless', v_no_paperless, 'needsPrevDetails', v_needs_prevdet,
      'heldUntilApproval', v_hold, 'kindFallback', v_kind_fallback, 'kindPending', v_kind_pending,
      'returning', v_returning,
      'monthlyTotal', e.monthly_total, 'billingStartMonth', e.billing_start_month));
end;
$function$;

-- ── 3 · יצירת ההתקשרות מאישור הצעה — הצמדת ריצת המסלול ─────────────────
create or replace function public.create_engagement_for_quotation(p_quotation_id text, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  q          public.quotations%rowtype;
  v_items    jsonb;
  v_monthly  numeric;
  v_vat_rate numeric;
  v_monthly_with_vat numeric;
  v_start    text;
  v_eng_id   text;
  v_existing text;
  v_steps    jsonb;
  v_kind     text;
  v_current  text;
  v_eff      date;
  it         jsonb;
  v_qty      numeric; v_disc numeric; v_total numeric; v_inst int;
  v_per      numeric; v_incl numeric; v_balance numeric; v_off numeric; v_final numeric;
  v_label    text; v_trigger text;
  v_sub      jsonb;
begin
  select * into q from public.quotations where id = p_quotation_id;
  if q.id is null then return jsonb_build_object('ok', false, 'error', 'quotation_not_found'); end if;
  if q.status <> 'approved' then return jsonb_build_object('ok', false, 'error', 'not_approved'); end if;
  if q.client_id is null then return jsonb_build_object('ok', false, 'error', 'no_client'); end if;

  v_items := coalesce(q.snapshot->'items', q.items, '[]'::jsonb);
  v_kind  := coalesce(nullif(q.kind, ''), 'engagement');
  v_current := public.current_engagement_id(q.client_id);

  if v_kind = 'one_time' and v_current is null then
    v_kind := 'engagement';
  end if;

  if not p_dry_run then
    -- ‼ העשרת נתונים בלבד — מחוץ לגבול ההצלחה במכוון (ראה כותרת 159).
    perform public.copy_lead_facts_to_client(q.id);

    insert into public.additional_charges (
      user_id, client_id, description, amount, status,
      source_type, source_quotation_id, source_item_id
    )
    select
      q.user_id, q.client_id,
      coalesce(nullif(it2->>'name', ''), 'חיוב מהצעת מחיר'),
      (coalesce((it2->>'clientPrice')::numeric, 0))
        * (coalesce((it2->>'quantity')::numeric, 1))
        * (1 - coalesce((it2->>'discountPercent')::numeric, 0) / 100.0),
      'pending', 'quotation', q.id, it2->>'id'
    from jsonb_array_elements(v_items) it2
    where coalesce(it2->>'category', '') = 'one_time'
      and it2->>'id' is not null
      and (coalesce((it2->>'clientPrice')::numeric, 0))
            * (coalesce((it2->>'quantity')::numeric, 1))
            * (1 - coalesce((it2->>'discountPercent')::numeric, 0) / 100.0) > 0
    on conflict (source_quotation_id, source_item_id) where source_quotation_id is not null
    do nothing;

    for it in select * from jsonb_array_elements(v_items) loop
      continue when coalesce(it->>'prorationMode', '') <> 'deferred';
      continue when it->>'id' is null;

      v_qty   := coalesce((it->>'quantity')::numeric, 1);
      v_disc  := 1 - coalesce((it->>'discountPercent')::numeric, 0) / 100.0;
      v_total := round(coalesce((it->>'annualPrice')::numeric, 0) * v_qty * v_disc, 2);
      v_inst  := greatest(1, least(60, coalesce((it->>'installments')::int, 12)));
      v_per   := round(coalesce((it->>'clientPrice')::numeric, 0) * v_qty * v_disc, 2);
      v_incl  := round(v_per * v_inst, 2);
      v_balance := greatest(0, round(v_total - v_incl, 2));

      if (it->>'deferredChargeAmount') is not null then
        v_final := least(greatest(0, (it->>'deferredChargeAmount')::numeric), v_balance);
      else
        v_off   := least(greatest(0, coalesce((it->>'deferredDiscount')::numeric, 0)), v_balance);
        v_final := round(v_balance - v_off, 2);
      end if;

      continue when v_final <= 0;

      v_label := coalesce(nullif(trim(it->>'name'), ''), 'שירות');
      if nullif(it->>'year', '') is not null then v_label := v_label || ' ' || (it->>'year'); end if;
      v_trigger := coalesce(nullif(trim(it->>'deferredTrigger'), ''), 'עם הגשת הדוח השנתי');

      insert into public.additional_charges (
        user_id, client_id, description, amount, status,
        source_type, source_quotation_id, source_item_id, due_trigger
      )
      values (q.user_id, q.client_id, 'השלמה ל' || v_label, v_final, 'pending',
              'quotation', q.id, it->>'id', v_trigger)
      on conflict (source_quotation_id, source_item_id) where source_quotation_id is not null
      do nothing;
    end loop;
  end if;

  if v_kind = 'one_time' then
    return jsonb_build_object('ok', true, 'kind', 'one_time',
      'engagementId', null, 'chargesOnly', true);
  end if;

  select id into v_existing from public.engagements where quotation_id = q.id;
  if v_existing is not null then
    -- ‼ 217: סוג העוסק נקבע בכרטיס מאז האישור הקודם (והשחרור מהטריגר לא רץ או נכשל) —
    -- הבקשות שחיכו לו נפתחות עכשיו. לעולם לא מפיל את האישור (_release_kind_hold_safe).
    if not p_dry_run then
      perform public._release_kind_hold_safe(q.client_id, 'system');
    end if;
    if (select status from public.engagements where id = v_existing) = 'onboarding' then
      v_steps := public.generate_onboarding_steps(v_existing, p_dry_run);
      if not p_dry_run then
        v_sub := public.add_intake_questionnaire_step(v_existing);
        if coalesce(v_sub->>'ok','false') <> 'true' then
          raise exception 'journey_incomplete: intake (%)', coalesce(v_sub->>'error','unknown')
            using errcode = 'data_exception';
        end if;
        v_sub := public.ensure_institution_alignment_steps(q.client_id, v_existing, true);
        if coalesce(v_sub->>'ok','false') <> 'true' then
          raise exception 'journey_incomplete: alignment (%)', coalesce(v_sub->>'error','unknown')
            using errcode = 'data_exception';
        end if;
      end if;
    end if;
    -- 216: הריצה של מסלול הקליטה (אידמפוטנטית; כשל לא מפיל את האישור).
    if not p_dry_run and (select status from public.engagements where id = v_existing) = 'onboarding' then
      perform public._attach_onboarding_flow_run_safe(v_existing, false);
    end if;
    return jsonb_build_object('ok', true, 'engagementId', v_existing, 'existed', true, 'steps', v_steps);
  end if;

  -- 177: כל שורה מעוגלת לאגורות לפני החיבור — אותו כלל בדיוק כמו
  -- quotationCalc.ts (round2 לכל שורה, ורק אז סכום). לפני התיקון הסכום
  -- הגולמי (numeric ללא עיגול) יכול היה לסטות במאיות אגורה מהמסך.
  select
    sum( round( (coalesce((it2->>'clientPrice')::numeric, 0))
       * (coalesce((it2->>'quantity')::numeric, 1))
       * (1 - coalesce((it2->>'discountPercent')::numeric, 0) / 100.0), 2) ),
    min(nullif(it2->>'billingStartMonth', ''))
  into v_monthly, v_start
  from jsonb_array_elements(v_items) it2
  where coalesce(it2->>'category','') = 'monthly';

  v_monthly := coalesce(v_monthly, 0);
  v_vat_rate := coalesce(q.vat_rate, 0);
  v_monthly_with_vat := round(v_monthly * (1 + v_vat_rate / 100.0), 2);

  if p_dry_run then
    return jsonb_build_object('ok', true, 'dryRun', true, 'wouldCreate', true,
      'clientId', q.client_id, 'monthlyTotal', v_monthly, 'billingStartMonth', v_start,
      'kind', v_kind, 'isRenewal', v_current is not null);
  end if;

  v_eff := coalesce(q.effective_from, (nullif(v_start, '') || '-01')::date, current_date);

  if v_current is null then
    insert into public.engagements (user_id, client_id, quotation_id, status,
                                    monthly_total, vat_rate_at_signing, monthly_total_with_vat,
                                    billing_start_month, approved_at, effective_from)
    values (q.user_id, q.client_id, q.id, 'onboarding',
            v_monthly, v_vat_rate, v_monthly_with_vat, v_start, coalesce(q.approved_at, now()), v_eff)
    on conflict (quotation_id) do nothing
    returning id into v_eng_id;

    if v_eng_id is null then
      select id into v_eng_id from public.engagements where quotation_id = q.id;
      v_steps := public.generate_onboarding_steps(v_eng_id, false);
      v_sub := public.add_intake_questionnaire_step(v_eng_id);
      if coalesce(v_sub->>'ok','false') <> 'true' then
        raise exception 'journey_incomplete: intake (%)', coalesce(v_sub->>'error','unknown')
          using errcode = 'data_exception';
      end if;
      v_sub := public.ensure_institution_alignment_steps(q.client_id, v_eng_id, true);
      if coalesce(v_sub->>'ok','false') <> 'true' then
        raise exception 'journey_incomplete: alignment (%)', coalesce(v_sub->>'error','unknown')
          using errcode = 'data_exception';
      end if;
      perform public._attach_onboarding_flow_run_safe(v_eng_id, false);
      return jsonb_build_object('ok', true, 'engagementId', v_eng_id, 'existed', true, 'steps', v_steps);
    end if;

    perform public.log_onboarding_event(q.user_id, null, v_eng_id, 'created', 'system',
      'ההתקשרות נפתחה מאישור הצעה ' || coalesce(q.quotation_number, q.id),
      jsonb_build_object('quotationId', q.id));

    -- ‼ 217 · לקוח שחוזר (D1): מה שנשאר פתוח מההתקשרות שהסתיימה מצטרף לקליטה הזו, ומסלול
    -- הקליטה הקודם נסגר — לפני המחולל, כדי שלא ייווצר עותק שני של מה שכבר פתוח.
    perform public._open_returning_intake(v_eng_id);

    v_steps := public.generate_onboarding_steps(v_eng_id, false);
    v_sub := public.add_intake_questionnaire_step(v_eng_id);
    if coalesce(v_sub->>'ok','false') <> 'true' then
      raise exception 'journey_incomplete: intake (%)', coalesce(v_sub->>'error','unknown')
        using errcode = 'data_exception';
    end if;
    v_sub := public.ensure_institution_alignment_steps(q.client_id, v_eng_id, true);
    if coalesce(v_sub->>'ok','false') <> 'true' then
      raise exception 'journey_incomplete: alignment (%)', coalesce(v_sub->>'error','unknown')
        using errcode = 'data_exception';
    end if;

    -- 216: התקשרות חדשה ⇒ ריצה חדשה, שמותר לה להריץ פעולות «לבד» שבמסלול.
    perform public._attach_onboarding_flow_run_safe(v_eng_id, true);
    return jsonb_build_object('ok', true, 'engagementId', v_eng_id, 'existed', false, 'steps', v_steps);
  end if;

  update public.engagements
     set status = 'cancelled', updated_at = now()
   where client_id = q.client_id and status = 'scheduled';

  insert into public.engagements (user_id, client_id, quotation_id, status,
                                  monthly_total, vat_rate_at_signing, monthly_total_with_vat,
                                  billing_start_month, approved_at,
                                  effective_from, supersedes_engagement_id)
  values (q.user_id, q.client_id, q.id, 'scheduled',
          v_monthly, v_vat_rate, v_monthly_with_vat, v_start, coalesce(q.approved_at, now()), v_eff, v_current)
  on conflict (quotation_id) do nothing
  returning id into v_eng_id;

  if v_eng_id is null then
    select id into v_eng_id from public.engagements where quotation_id = q.id;
    return jsonb_build_object('ok', true, 'engagementId', v_eng_id, 'existed', true, 'renewal', true);
  end if;

  perform public.log_onboarding_event(q.user_id, null, v_eng_id, 'created', 'system',
    'עדכון התקשרות אושר מהצעה ' || coalesce(q.quotation_number, q.id) ||
    ' - בתוקף מ-' || to_char(v_eff, 'MM/YYYY'),
    jsonb_build_object('quotationId', q.id, 'supersedes', v_current));

  perform public.apply_due_engagement_transitions();

  return jsonb_build_object('ok', true, 'engagementId', v_eng_id, 'existed', false,
    'renewal', true, 'effectiveFrom', v_eff);
end;
$function$;

-- ── 4 · פרסום שינויים — לא מפרסמים מה שממתין לשלב קודם ────────────────────
create or replace function public.publish_case_changes(p_client_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c        public.clients%rowtype;
  v_uid    uuid := auth.uid();
  e        record;
  s        record;
  v_opened  int := 0;
  v_ordered int := 0;
  v_edits   int := 0;
  v_removed int := 0;
  v_exposed int := 0;
  v_auto    int := 0;
  r        jsonb;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  -- 135: עוד לא נמכר כלום - הבקשות מוכנות ומחכות לאישור ההצעה, לא לכפתור.
  -- ‼ 217 (D2): אותו פרדיקט שמחזיק אותן — גם לקוח שחוזר שנשלחה לו הצעה חדשה.
  if public.requests_held_until_approval(c.id) then
    return jsonb_build_object('ok', false, 'error', 'quotation_not_approved');
  end if;

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

  -- 2. סידור ממתין (מיגרציה 101)
  update public.onboarding_steps
     set sort_order = pending_sort_order,
         pending_sort_order = null
   where client_id = c.id and pending_sort_order is not null;
  get diagnostics v_ordered = row_count;

  -- 3. עריכות ממתינות על בקשות קיימות
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

  -- 4. הסרות ממתינות (מיגרציה 101) — אותה סמנטיקה כמו advance_onboarding_step('cancel'),
  --    כולל פתיחת התלויים ורישום ביומן (167).
  for s in
    select * from public.onboarding_steps
     where client_id = c.id and pending_cancel = true and status <> 'cancelled'
  loop
    update public.onboarding_steps set pending_cancel = false where id = s.id;
    perform public._set_step_status(s.id, 'cancelled', 'accountant',
      'הבקשה הוסרה בעדכון דף הלקוח', jsonb_build_object('pendingCancel', true));
    v_removed := v_removed + 1;
  end loop;

  -- 5. חשיפת טיוטות
  for s in
    select * from public.onboarding_steps
     where client_id = c.id and published_at is null and status <> 'cancelled'
       -- 216: שלב «הכול באישורך» שעוד לא נפתח - מתפרסם כשהשלב נפתח, לא לפני.
       and not (status = 'locked' and coalesce(payload->>'delivery', '') = 'hold')
  loop
    update public.onboarding_steps
       set published_at = now(),
           payload = payload - 'published'
     where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'accountant',
      'הבקשה נפתחה ללקוח', jsonb_build_object('published', true));
    v_exposed := v_exposed + 1;
  end loop;

  -- 6. הערכה-מחדש אחרי חימוש (D3 §5, מיגרציה 83) — תצורה אוטומטית שפורסמה
  -- עכשיו, ושכל תנאיה כבר מולאו, מתבצעת בדיוק פעם אחת (התביעה בפונקציית השליחה).
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
    'processOpened', v_opened, 'ordered', v_ordered, 'editsApplied', v_edits,
    'removed', v_removed, 'draftsExposed', v_exposed, 'autoQueued', v_auto);
end;
$function$;

-- ── 5 · משימה אוטומטית — לא בזמן עצירה ────────────────────────────────────
create or replace function public.execute_automatic_step(p_step_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if s.published_at is null then
    return jsonb_build_object('skipped', 'draft');
  end if;
  if s.status not in ('pending', 'in_progress') then
    return jsonb_build_object('skipped', 'status', 'status', s.status);
  end if;
  if s.payload->>'autoExecutedAt' is not null then
    return jsonb_build_object('skipped', 'already_executed');
  end if;
  -- 216: מסלול בעצירה או מבוטל - שום דבר לא יוצא לבד. החידוש מריץ שוב.
  if s.flow_run_id is not null
     and exists (select 1 from public.flow_runs fr where fr.id = s.flow_run_id and fr.status in ('paused', 'cancelled')) then
    return jsonb_build_object('skipped', 'run_paused');
  end if;
  if not public.onboarding_dependency_met(s.id) then
    return jsonb_build_object('skipped', 'dependencies');
  end if;

  -- ‼ אותו שער כמו הדף האישי, לבקשה הזו (client_step_gate_open, 214): בקשה של קליטה חדשה
  -- שעוד לא נפתחה ללקוח מחכה לפרסום; בקשה שפורסמה לפני הקליטה (עבודה קודמת שעברה אליה) —
  -- לא מחכה בגלל הקליטה (הכרעה ב).
  v_published := public.client_step_gate_open(s.client_id, s.published_at);
  if not v_published then
    return jsonb_build_object('skipped', 'process_unpublished');
  end if;

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
      'המשימה האוטומטית לא בוצעה - חסרה הגדרת שליחה פנימית',
      jsonb_build_object('automatic', true));
    return jsonb_build_object('skipped', 'missing_secrets');
  end if;

  perform net.http_post(
    url := v_base || '/functions/v1/send-step-email',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('internalSecret', v_secret, 'stepId', s.id, 'kind', 'step_reminder'),
    timeout_milliseconds := 15000);

  return jsonb_build_object('ok', true, 'queued', true);
exception when others then
  return jsonb_build_object('skipped', 'error', 'detail', left(coalesce(sqlerrm, ''), 200));
end;
$function$;

-- ── 6 · «בקשות ללקוח חדש» נכתבות רק דרך שמירת המסלול ───────────────────────
-- ‼ עד כאן כל חבר משרד יכול היה לכתוב את חמש הרשימות ישירות (135). עכשיו
-- הן תרגום של מסלול הקליטה — כתיבה ישירה הייתה יוצרת רשימה שאינה תואמת אף
-- גרסה של המסלול. הקריאה נשארת.
drop policy if exists ojd_insert on public.office_journey_defaults;
drop policy if exists ojd_update on public.office_journey_defaults;
drop policy if exists ojd_delete on public.office_journey_defaults;
revoke insert, update, delete on public.office_journey_defaults from authenticated;

-- ── 7 · מילוי: מסלול קליטה לכל משרד, מהרשימות הקיימות ─────────────────────
do $$
declare v_office uuid;
begin
  for v_office in
    select distinct office_id from public.office_journey_defaults where office_id is not null
    union
    select distinct office_id from public.profiles where office_id is not null
  loop
    perform public.ensure_onboarding_flow(v_office);
  end loop;
end $$;

-- ── 8 · הרשאות ───────────────────────────────────────────────────────────
revoke all on function public.ensure_onboarding_flow(uuid) from public, anon, authenticated;
revoke all on function public._client_kinds_label(text[]) from public, anon, authenticated;
revoke all on function public.attach_onboarding_flow_run(text, boolean) from public, anon, authenticated;
revoke all on function public._attach_onboarding_flow_run_safe(text, boolean) from public, anon, authenticated;
revoke all on function public.reattach_onboarding_flow_run(text) from public, anon;
revoke all on function public.convert_journey_template_to_flow(text) from public, anon;
grant execute on function public.ensure_onboarding_flow(uuid) to service_role;
grant execute on function public._client_kinds_label(text[]) to service_role;
grant execute on function public.attach_onboarding_flow_run(text, boolean) to service_role;
grant execute on function public._attach_onboarding_flow_run_safe(text, boolean) to service_role;
grant execute on function public.reattach_onboarding_flow_run(text) to authenticated, service_role;
grant execute on function public.convert_journey_template_to_flow(text) to authenticated, service_role;

-- ── 9 · משימות משרד לא בדף של הלקוח ─────────────────────────────────────
-- ‼ ביקורת סבב 3: משימה בבעלות המשרד (אישור אישי של בן/בת זוג, «משימה פנימית» מהעורך,
-- פריט ספרייה בבעלות המשרד) פורסמה — ונבנתה בדף האישי כ«בקשה מהמשרד» ריקה שאי אפשר
-- לסגור, ונמנתה במייל. הסימן נקבע ביצירה, בשרת, לכל נתיב: בקשה חופשית שנולדה אצל
-- המשרד (ball='me') ואינה הודעה/שליחת קבצים/גורם חיצוני. ‼ לא לפי ball בזמן הבנייה:
-- בקשה שהלקוח השלים עוברת ל-'me' ועדיין שלו.
/**
 * יש בבקשה משהו בשביל הלקוח (או גורם חיצוני) — מה למלא, לקרוא, לפתוח או לאשר.
 * ‼ התאום של hasClientContent (src/utils/clientFacingRows.ts), ומשוכפל ב-214
 * (_client_announceable_steps, שמוחלת לפני הקובץ הזה) — שינוי כאן, בשני המקומות
 * (תו בתו, p ⇐ s.payload; N.2–N.3 ב-test-r4-notices נופלות על כל סטייה).
 */
create or replace function public._payload_has_client_content(p jsonb)
returns boolean language sql immutable set search_path to 'public' as $$
  select coalesce(p, '{}'::jsonb) <> '{}'::jsonb and coalesce(jsonb_typeof(p) = 'object', false) and (
       coalesce(jsonb_array_length(case when jsonb_typeof(p->'requirements') = 'array' then p->'requirements' end), 0) > 0
    or coalesce(jsonb_array_length(case when jsonb_typeof(p->'checklist') = 'array' then p->'checklist' end), 0) > 0
    or coalesce(jsonb_array_length(case when jsonb_typeof(p->'clientResources') = 'array' then p->'clientResources' end), 0) > 0
    or coalesce(nullif(p->>'clientResource', ''), nullif(btrim(coalesce(p->>'clientLinkUrl', '')), '')) is not null
    or coalesce(p->>'messageOnly', '') = 'true'
    or coalesce(jsonb_typeof(p->'externalParty'), '') = 'object'
    or p ?| array['smartForm', 'shaamIdentity', 'guideKey']);
$$;

/**
 * מי מבצע בקשה שנוצרת מרשומה בספרייה / בתבנית (entry: {stepType, owner, officeTask, payload}).
 * ‼ התאום של templateEntryOwner במסך. 'external' — גורם חיצוני. 'me' — המשרד בחר במפורש
 * «משימה של המשרד» (officeTask), או שאין בה שום דבר ללקוח, או שזו הודעת מלל; בבקשת מערכת
 * שבצד המשרד (מכתב, חיבור, פתיחת תיקים…) — כמו שנשמר. אחרת 'client': בעלים 'me' שנגזר
 * פעם מהכדור (תבנית שנשמרה מבקשה שהלקוח השלים) אינו הופך בקשה ללקוח למשימה נסתרת.
 */
create or replace function public._template_entry_owner(p_entry jsonb)
returns text language sql immutable set search_path to 'public' as $$
  select case
    when coalesce(p_entry->>'owner', '') = 'external'
         or coalesce(jsonb_typeof(p_entry->'payload'->'externalParty'), '') = 'object' then 'external'
    when coalesce(p_entry->>'owner', '') = 'me'
         and (coalesce(p_entry->>'officeTask', '') = 'true'
              or coalesce(nullif(p_entry->>'stepType', ''), 'custom_request')
                   not in ('custom_request', 'client_documents', 'prev_accountant_details')
              or (coalesce(nullif(p_entry->>'stepType', ''), 'custom_request') = 'custom_request'
                  and (coalesce(p_entry->'payload'->>'messageOnly', '') = 'true'
                       or not public._payload_has_client_content(p_entry->'payload')))) then 'me'
    else 'client' end;
$$;

/**
 * הבעלים שנשמר כשבקשה אצל לקוח נשמרת לספרייה / לתבנית (save_request_template,
 * update_request_template, save_journey_template). ‼ לא לפי הכדור לבדו: משימה פנימית
 * שהועברה ל«ממתין ללקוח» היא עדיין של המשרד, ובקשה שהלקוח השלים (הכדור עבר למשרד)
 * היא עדיין שלו. officeTask נשמר כשהמקור משימה פנימית.
 */
create or replace function public._step_template_owner(p_step_type text, p_ball text, p_payload jsonb)
returns text language sql immutable set search_path to 'public' as $$
  select case
    when coalesce(jsonb_typeof(p_payload->'externalParty'), '') = 'object' then 'external'
    when coalesce(p_payload->>'internalTask', '') = 'true' or coalesce(p_payload ? 'personalConfirmFor', false) then 'me'
    when p_ball = 'client' then 'client'
    when p_step_type = 'custom_request' and coalesce(p_payload->>'messageOnly', '') <> 'true'
         and public._payload_has_client_content(p_payload) then 'client'
    when p_step_type in ('client_documents', 'prev_accountant_details') then 'client'
    else 'me' end;
$$;

create or replace function public.mark_internal_office_task()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  -- ‼ רק בלי שום דבר ללקוח: בקשה עם דרישות/קבצים/קישור שנוצרת בבעלות המשרד (למשל מתבנית
  -- שנשמרה מבקשה שהלקוח השלים) היא עדיין בקשה ללקוח. סימון מפורש (גם false) — נשמר.
  if new.step_type = 'custom_request' and coalesce(new.ball, 'client') = 'me'
     and not (coalesce(new.payload, '{}'::jsonb) ? 'internalTask')
     and not public._payload_has_client_content(new.payload) then
    new.payload := coalesce(new.payload, '{}'::jsonb) || jsonb_build_object('internalTask', true);
  end if;
  return new;
end;
$$;
drop trigger if exists onboarding_steps_mark_internal_task on public.onboarding_steps;
create trigger onboarding_steps_mark_internal_task
  before insert on public.onboarding_steps
  for each row execute function public.mark_internal_office_task();
revoke all on function public.mark_internal_office_task() from public, anon, authenticated;

/**
 * משימה פנימית (הלקוח לא רואה אותה) שעוד «ממתינה ללקוח» ⇒ חוזרת למשרד: waiting_client ⇒
 * pending (דרך _set_step_status — נרשם ביומן), והכדור אצל הלקוח ⇒ אצלך. ‼ «ממתין לשרון» על
 * משהו ששרון לא רואה הוא משימה שאי אפשר לסיים (F4). סגורה, או אצל רשות / גורם חיצוני — לא
 * נוגעים. מחזירה true כשמשהו זז.
 */
create or replace function public._internal_task_back_to_office(p_step_id text, p_actor text, p_note text, p_meta jsonb)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare
  s public.onboarding_steps%rowtype;
begin
  select * into s from public.onboarding_steps where id = p_step_id for update;
  if s.id is null or s.status in ('completed', 'verified', 'skipped', 'cancelled') then return false; end if;
  if s.status = 'waiting_client' then
    perform public._set_step_status(s.id, 'pending', p_actor, p_note, coalesce(p_meta, '{}'::jsonb), 'me');
    return true;
  end if;
  if s.ball = 'client' then
    update public.onboarding_steps set ball = 'me' where id = s.id;
    return true;
  end if;
  return false;
end;
$$;

/**
 * משימות קיימות (לפני 216): הסימון לפי ראיה, לא לפי הכדור של היום. ‼ משימה של המשרד
 * שהועברה ל«ממתין ללקוח» (הכדור אצל הלקוח) — בדף ובמייל עד עכשיו; הכלל «ball='me'» פספס אותה.
 *   · מסומנת (internalTask) — נוצרה כמשימה של המשרד (אירוע 'created' של המשרד עם owner 'me'),
 *     הלקוח מעולם לא פעל בה, ואין בה (וגם לא בעריכה שממתינה) שום דבר ללקוח — בכל כדור ומצב.
 *     שורה שהלקוח ראה (פורסמה, לא בוטלה) — נרשמת בפעילות (legacyMark), וכך גם הביטול.
 *     ‼ וחיכתה ללקוח (waiting_client / הכדור אצלו) ⇒ חוזרת אליך (_internal_task_back_to_office,
 *     אותו כלל כמו «הסתר מהדף»).
 *   · לבדיקה (internalTaskReview) — פתוחה, בלי תוכן ללקוח, ובלי הראיה: נשארת בדף,
 *     והמשרד מחליט («הסתר מהדף» / עריכה). לא במייל (214).
 *   · לא נוגעים: סגורה בלי ראיה, ועריכה שממתינה ומוסיפה ללקוח מה לעשות.
 * ‼ סימון קיים (גם false) — לא נוגעים. אידמפוטנטית. updated_at — באחריות הקורא (ההחלה).
 */
create or replace function public._mark_legacy_internal_tasks(p_client_id text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  r        record;
  v_marked int := 0;
  v_review int := 0;
  v_back   int := 0;
begin
  for r in
    with cand as (
      select s.id, s.user_id, s.engagement_id, s.ball, s.status, s.published_at, s.draft_payload
        from public.onboarding_steps s
       where s.step_type = 'custom_request'
         and (p_client_id is null or s.client_id = p_client_id)
         and not (coalesce(s.payload, '{}'::jsonb) ?| array['internalTask', 'personalConfirmFor', 'internalTaskReview'])
         and not public._payload_has_client_content(s.payload)
    )
    select c.*,
           coalesce((select bool_or(ev.type = 'created' and ev.actor = 'accountant' and ev.meta->>'owner' = 'me')
                       from public.onboarding_events ev where ev.step_id = c.id), false) as born_office,
           coalesce((select bool_or(ev.actor = 'client')
                       from public.onboarding_events ev where ev.step_id = c.id), false) as client_touched
      from cand c
     order by c.id
  loop
    continue when public._payload_has_client_content(r.draft_payload);
    if r.born_office and not r.client_touched then
      update public.onboarding_steps set payload = payload || jsonb_build_object('internalTask', true) where id = r.id;
      v_marked := v_marked + 1;
      if r.published_at is not null and r.status <> 'cancelled' then
        perform public.log_onboarding_event(r.user_id, r.id, r.engagement_id, 'note', 'system',
          'סומנה כמשימה פנימית של המשרד - כבר לא מופיעה בדף של הלקוח ולא במייל',
          jsonb_build_object('legacyMark', true, 'ball', r.ball, 'status', r.status));
      end if;
      -- ‼ F4: חיכתה ללקוח שלא רואה אותה ⇒ חוזרת אליך, ונרשם ביומן (רק המעבר — סימון לבד אינו שינוי).
      if public._internal_task_back_to_office(r.id, 'system',
           'משימה פנימית של המשרד - הלקוח לא רואה אותה, ולכן היא חזרה אליך',
           jsonb_build_object('internalBackToOffice', true)) then
        v_back := v_back + 1;
      end if;
    elsif r.status not in ('completed', 'verified', 'skipped', 'cancelled') then
      update public.onboarding_steps set payload = payload || jsonb_build_object('internalTaskReview', true) where id = r.id;
      v_review := v_review + 1;
    end if;
  end loop;
  return jsonb_build_object('marked', v_marked, 'review', v_review, 'backToOffice', v_back);
end;
$$;

-- ‼ בלי לגעת ב-updated_at: הגיל של השורה במשרד נקרא ממנו, וסימון אינו שינוי בבקשה.
alter table public.onboarding_steps disable trigger set_onboarding_steps_updated_at;
select public._mark_legacy_internal_tasks(null);
alter table public.onboarding_steps enable trigger set_onboarding_steps_updated_at;

/**
 * «הסתר מהדף» — משימה ישנה שסומנה לבדיקה (או כל בקשה חופשית בלי שום דבר ללקוח): הופכת
 * למשימה פנימית. ‼ בקשה שיש בה (או בעריכה שממתינה) מה לעשות ללקוח — לא; שם «ערוך».
 * ‼ F4: מה שחיכה ללקוח (waiting_client / הכדור אצלו) חוזר אליך — הלקוח כבר לא רואה אותה,
 * ובלי זה נשארה «ממתין לשרון» בלי דרך לסיים (_internal_task_back_to_office; backToOffice).
 * מחזירה {ok, backToOffice?} או {ok:false, error: forbidden | step_not_found | not_a_request | has_client_content}.
 */
create or replace function public.hide_step_from_client(p_step_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  s     public.onboarding_steps%rowtype;
  c     public.clients%rowtype;
  v_back boolean;
begin
  if v_uid is null or not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select * into s from public.onboarding_steps where id = p_step_id for update;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  select * into c from public.clients where id = s.client_id;
  if c.id is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if s.step_type <> 'custom_request' or s.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'not_a_request');
  end if;
  if coalesce(s.payload->>'internalTask', '') = 'true' then
    update public.onboarding_steps set payload = payload - 'internalTaskReview' where id = s.id and payload ? 'internalTaskReview';
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if public._payload_has_client_content(s.payload) or public._payload_has_client_content(s.draft_payload) then
    return jsonb_build_object('ok', false, 'error', 'has_client_content');
  end if;
  update public.onboarding_steps
     set payload = (payload - 'internalTaskReview') || jsonb_build_object('internalTask', true)
   where id = s.id;
  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'accountant',
    'הוסתרה מהדף של הלקוח - משימה פנימית', jsonb_build_object('hiddenFromClient', true));
  v_back := public._internal_task_back_to_office(s.id, 'accountant',
    'הוסתרה מהדף - הלקוח כבר לא רואה אותה, ולכן היא חזרה אליך',
    jsonb_build_object('hiddenFromClient', true, 'internalBackToOffice', true));
  return jsonb_build_object('ok', true) || case when v_back then jsonb_build_object('backToOffice', true) else '{}'::jsonb end;
end;
$$;

revoke all on function public._payload_has_client_content(jsonb) from public, anon, authenticated;
revoke all on function public._template_entry_owner(jsonb) from public, anon, authenticated;
revoke all on function public._step_template_owner(text, text, jsonb) from public, anon, authenticated;
revoke all on function public._mark_legacy_internal_tasks(text) from public, anon, authenticated;
revoke all on function public._internal_task_back_to_office(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.hide_step_from_client(text) from public, anon;
grant execute on function public._payload_has_client_content(jsonb) to service_role;
grant execute on function public._template_entry_owner(jsonb) to service_role;
grant execute on function public._step_template_owner(text, text, jsonb) to service_role;
grant execute on function public._mark_legacy_internal_tasks(text) to service_role;
grant execute on function public._internal_task_back_to_office(text, text, text, jsonb) to service_role;
grant execute on function public.hide_step_from_client(text) to authenticated, service_role;

-- הדף האישי (208) — אותה פונקציה, ודילוג על משימות המשרד בתחילת «custom_request».
CREATE OR REPLACE FUNCTION public.build_client_portal(p_client_id text, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c        public.clients%rowtype;
  p        public.profiles%rowtype;
  req      public.representation_requests%rowtype;
  quo      public.quotations%rowtype;
  s        record;
  v_items  jsonb := '[]'::jsonb;
  v_done   int := 0;
  v_total  int := 0;
  v_sign_token text;
  v_spouse_pending boolean := false;
  v_invite_url text;
  v_res_key   text;
  -- ‼ 114: מה שהבקשה פותחת — קובץ מספריית המשרד, או קישור חיצוני שנשמר עליה.
  v_res_url   text;
  -- ‼ 144: כמה קבצים בבקשה אחת. ריק/חסר ⇒ הבקשה היא מהסוג הישן.
  v_res_list  jsonb;
  v_res_out   jsonb;
  v_prev_open boolean := false;
  v_prev_done boolean := false;
  v_first  text;
  v_has_eng boolean := false;
  v_stage  text;
  v_ck_done int;
  v_ck_total int;
  v_label  text;
  v_sub    text;
  v_published boolean := true;
  v_reqs   jsonb;
  v_rq_done int;
  v_rq_total int;
  v_rep_item jsonb := null;
  v_rep_seen boolean := false;
  v_before int := 0;
  v_lock   text;
  -- 217 · לקוח שחוזר
  v_cur    text;
  v_quote_open boolean := false;
  v_returning_intake boolean := false;
  -- 217 · אישור הייצוג באזור האישי — מי מאשר ואת מה
  v_rep_approvals jsonb;
  v_rep_req_sub text;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  select * into p from public.profiles where id = c.user_id;
  v_first := split_part(trim(coalesce(c.first_name, '')), ' ', 1);
  v_invite_url := nullif(trim(coalesce(p.settings->'paperless'->>'inviteUrl', '')), '');
  -- ‼ נפתר מהגדרות המשרד בכל רינדור, כמו קישור הפייפרלס שמעליו: קובץ אחד
  -- משותף, והחלפתו משנה מיד את מה שכל בקשה תפתח.

  v_has_eng := exists (select 1 from public.engagements e where e.client_id = c.id);

  -- ‼ «התהליך נפתח ללקוח» — השער ברמת הלקוח (client_process_published, 217), רק בשביל
  -- «אנחנו מכינים את המשך התהליך». מה שמוצג בדף נבחר לכל בקשה בנפרד (client_step_gate_open,
  -- 214, בלולאה למטה): לקוח שחוזר רואה את מה שפורסם לפני הקליטה החדשה ועדיין פתוח, והקליטה
  -- החדשה מחכה לפרסום (הכרעה ב). אותו שער במייל, בתזכורות ובמשימה האוטומטית.
  v_published := public.client_process_published(c.id);

  select * into quo from public.quotations q
    where q.client_id = c.id and q.status <> 'draft'
    order by q.updated_at desc limit 1;

  -- ‼ 217: לקוח שחוזר — הצעה חדשה שמחכה לאישור (אין התקשרות נוכחית). ליד ראשון: אותו דבר כמו קודם.
  v_cur := public.current_engagement_id(c.id);
  v_quote_open := quo.id is not null and quo.status in ('sent', 'viewed') and v_cur is null;
  -- ‼ 217: קליטה חדשה של לקוח שחוזר — מה שהושלם בהתקשרות הקודמת אינו בדף (נשאר ב«הושלמו» במשרד).
  v_returning_intake := v_cur is not null
    and (select e.supersedes_engagement_id is null from public.engagements e where e.id = v_cur)
    and public.previous_engagement_end(c.id, v_cur) is not null;

  if v_quote_open then
    v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
      'bucket','action','key','quote_sign',
      'label','הצעת המחיר שלך מוכנה',
      'sub','לקריאה ולאישור - ואפשר להתחיל · כמה דקות',
      'actionKind','quote','actionValue', quo.public_token));
  elsif v_has_eng then
    v_items := v_items || jsonb_build_object('bucket','done','key','quotation','label','הצעת המחיר אושרה');
  elsif quo.id is not null and quo.status in ('sent','viewed') then
    v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
      'bucket','action','key','quote_sign',
      'label','הצעת המחיר שלך מוכנה',
      'sub','לקריאה ולאישור - ואפשר להתחיל · כמה דקות',
      'actionKind','quote','actionValue', quo.public_token));
  elsif quo.id is not null and quo.status = 'approved' then
    v_items := v_items || jsonb_build_object('bucket','done','key','quotation','label','הצעת המחיר אושרה');
    v_items := v_items || jsonb_build_object('bucket','office','key','quote_processing',
      'label','אנחנו מכינים את המשך התהליך','sub','נעדכן אותך כאן ברגע שיהיה מה לעשות');
  elsif quo.id is not null and quo.status in ('expired','cancelled') then
    v_items := v_items || jsonb_build_object('bucket','office','key','quote_expired',
      'label','הצעת המחיר כבר לא בתוקף','sub','נשמח לחדש אותה - דברו איתנו');
  end if;

  select * into req from public.representation_requests
    where linked_client_id = c.id order by created_at desc limit 1;

  if req.id is not null then
    if req.status = 'pending_fill' then
      v_rep_item := jsonb_strip_nulls(jsonb_build_object('bucket','action','key','rep_fill','label','מילוי פרטים וייפוי כוח','sub','הפרטים שנדרשים כדי לייצג אותך מול רשויות המס · כמה דקות','actionKind','onboard','actionValue', req.onboarding_token));
    elsif req.status = 'pending_signature' then
      select x->>'signToken' into v_sign_token
        from jsonb_array_elements(coalesce(req.signers, '[]'::jsonb)) x
        where x->>'role' = 'client' and x->>'signStatus' = 'pending' limit 1;
      select exists (
        select 1 from jsonb_array_elements(coalesce(req.signers, '[]'::jsonb)) x
        where x->>'role' = 'spouse' and x->>'signStatus' = 'pending')
        into v_spouse_pending;
      if v_sign_token is not null then
        v_rep_item := jsonb_strip_nulls(jsonb_build_object('bucket','action','key','rep_sign','label','חתימה על ייפוי הכוח','sub','הטופס מוכן - נשארה חתימה · כדקה','actionKind','sign','actionValue', v_sign_token));
      elsif v_spouse_pending then
        select jsonb_strip_nulls(jsonb_build_object('bucket','action','key','rep_sign_spouse','label','חתימת בן/בת הזוג על ייפוי הכוח','sub','אפשר לחתום יחד עכשיו, או לשלוח לבן/בת הזוג קישור אישי','actionKind','sign','actionValue', x->>'signToken')) into v_rep_item
        from jsonb_array_elements(coalesce(req.signers, '[]'::jsonb)) x
        where x->>'role' = 'client' and coalesce(x->>'signToken', '') <> '' limit 1;
      end if;
    elsif req.status in ('awaiting_accountant', 'awaiting_stamp') then
      -- ‼ 208 · «ממתין לרו"ח» לפני כל חתימה = אנחנו מכינים את הטופס. «נחתם על ידך»
      -- נאמר רק כשמישהו באמת חתם.
      v_rep_item := jsonb_build_object('bucket','office','key','rep_office','label','ייפוי הכוח','sub',
        case when exists (select 1 from jsonb_array_elements(coalesce(req.signers, '[]'::jsonb)) x
                           where x->>'signStatus' = 'signed')
             then 'נחתם על ידך - עכשיו בבדיקה ובחתימה אצלנו'
             else 'הפרטים התקבלו - אנחנו מכינים את ייפוי הכוח לחתימה' end);
    elsif req.status = 'awaiting_authorities' then
      v_rep_item := jsonb_build_object('bucket','office','key','rep_authorities','label','ייפוי הכוח','sub','נחתם והוגש לרשויות המס - ממתינים לאישור');
    elsif req.status = 'active' then
      v_rep_item := jsonb_build_object('bucket','done','key','rep_done','label','הייצוג מול רשויות המס אושר');
    end if;
  end if;

  for s in
    select * from public.onboarding_steps st
    where st.client_id = c.id and st.status <> 'cancelled'
      and (p_mode = 'preview'
           or (st.published_at is not null
               and (st.step_type = 'representation' or public.client_step_gate_open(c.id, st.published_at))))
    order by (case when p_mode = 'preview' then coalesce(st.pending_sort_order, st.sort_order, 0)
                   else coalesce(st.sort_order, 0) end),
             st.created_at
  loop
    -- 172: תצוגה מקדימה = הטיוטה מעל הפרסום; live נשאר כפי שהוא.
    if p_mode = 'preview' and s.draft_payload is not null then
      s.payload := public.merge_step_draft(s.payload, s.draft_payload);
    end if;
    -- ‼ 217: קליטה חדשה של לקוח שחוזר — מה שנסגר בהתקשרות קודמת לא חוזר לדף (וגם לא שני
    -- «מסמכים»). מסמכים שהמשרד שלח (קבצים/קישור) נשארים זמינים, כמו בכל בקשה שנסגרה.
    if v_returning_intake and s.engagement_id is not null and s.engagement_id <> v_cur
       and s.status in ('completed', 'verified', 'skipped')
       and not (s.step_type = 'custom_request'
                and (nullif(s.payload->>'clientResource', '') is not null
                     or coalesce(jsonb_array_length(case when jsonb_typeof(s.payload->'clientResources') = 'array'
                                                         then s.payload->'clientResources' end), 0) > 0
                     or nullif(trim(coalesce(s.payload->>'clientLinkUrl', '')), '') is not null)) then
      continue;
    end if;
    v_before := jsonb_array_length(v_items);
    case s.step_type

    when 'representation' then
      v_rep_seen := true;
      if v_rep_item is not null then
        v_items := v_items || v_rep_item;
      end if;

    when 'client_documents' then
      select count(*) filter (where (x->>'done')::boolean), count(*)
        into v_ck_done, v_ck_total
        from jsonb_array_elements(coalesce(s.payload->'checklist','[]'::jsonb)) x;
      v_label := coalesce(nullif(s.payload->>'clientTitle',''), 'מסמכים שביקשנו');
      v_sub   := nullif(s.payload->>'clientSub','');

      if s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_build_object('bucket','done','key','docs','label', v_label);
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','docs','label', v_label,
          'sub', coalesce(public.portal_lock_reason(s.id), v_sub)));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','docs','label', v_label,
          'sub', case when coalesce(v_ck_total,0) > 0
                      then v_ck_done || ' מתוך ' || v_ck_total || ' התקבלו'
                      else v_sub end,
          'actionKind','portal','actionValue', s.id,
          'kind','documents',
          'canUpload', true,
          'checklist', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                            'key', x->>'key', 'label', x->>'label', 'done', (x->>'done')::boolean,
                            -- 204 · שע״ם דרשה את המסמך: הלקוח רואה למה, ובלי לרמוז שהחתימה תלויה בו.
                            'note', case when x->>'requiredBy' = 'shaam'
                                         then 'נדרש על ידי רשות המסים להשלמת הייצוג' end))
                          order by ord)
                          from jsonb_array_elements(coalesce(s.payload->'checklist','[]'::jsonb))
                               with ordinality t(x, ord))));
      end if;

    when 'custom_request' then
      -- ‼ 216: משימה של המשרד אינה בדף של הלקוח — לא כפעולה, לא «בהמשך» ולא «הושלם»:
      -- אישור אישי של בן/בת הזוג (personalConfirmFor) ומשימה פנימית (internalTask).
      -- ‼ לא לפי ball: בקשה שהלקוח השלים עוברת ל-'me' ועדיין שלו. והודעת מלל — כן בדף.
      -- ‼ 217: השוואת טקסט — ערך שאינו בוליאני לא מפיל את הדף של הלקוח.
      -- ‼ 217 §ז: הצילום של בן/בת הזוג לשע״ם — המשרד בודק; בעל הכרטיס לא מאשר במקומו/ה (§9).
      if s.payload ? 'personalConfirmFor'
         or s.payload #>> '{shaamIdentity,person}' = 'spouse'
         or (coalesce(s.payload->>'internalTask', '') = 'true'
             and coalesce(s.payload->>'messageOnly', '') <> 'true') then
        continue;
      end if;
      -- ‼ 208 · שע״ם דורשת צילום תעודה, ובתיק כבר יש אחד ⇒ הלקוח רואה אותו
      -- ומאשר שהוא שלו, או מעלה אחר. קיום הקובץ אינו אישור.
      if s.payload ? 'shaamIdentity' then
        if s.status in ('completed','verified','skipped') then
          v_items := v_items || jsonb_build_object('bucket','done','key','custom_'||s.id,
            'label', coalesce(nullif(s.payload->>'clientTitle',''), 'צילום תעודה לרשות המסים'));
        elsif s.status <> 'locked' then
          v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
            'bucket','action','key','custom_'||s.id,
            'label', coalesce(nullif(s.payload->>'clientTitle',''), 'צילום תעודה לרשות המסים'),
            'sub', nullif(s.payload->>'clientSub',''),
            'note', nullif(s.payload->>'clientNote',''),
            'actionKind','portal','actionValue', s.id, 'stepId', s.id,
            'kind','identity_confirm',
            'resources', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                             'key', x->>'key', 'label', x->>'label', 'fileName', nullif(x->>'fileName',''),
                             'documentId', nullif(x->>'documentId',''))) order by ord)
                            from jsonb_array_elements(coalesce(s.payload->'clientResources','[]'::jsonb)) with ordinality t(x, ord)
                           where x->>'source' = 'client')));
        end if;
        continue;
      end if;
      v_reqs := coalesce(s.payload->'requirements', '[]'::jsonb);
      select count(*) filter (where coalesce((x->>'done')::boolean, false)
                               and coalesce((x->>'required')::boolean, true)),
             count(*) filter (where coalesce((x->>'required')::boolean, true))
        into v_rq_done, v_rq_total
        from jsonb_array_elements(v_reqs) x;
      v_label := coalesce(nullif(s.payload->>'clientTitle',''), 'בקשה מהמשרד');
      v_res_key := nullif(s.payload->>'clientResource', '');
      -- ‼ 114: קישור חיצוני כחומר עזר לכל דבר. בקשה שנושאת clientLinkUrl
      -- מתנהגת בדיוק כמו בקשת מסמך — כפתור פתיחה אחד — גם בלי קובץ בספרייה.
      -- כך המדריך של פייפרלס אינו דורש סוג שלב חדש ולא ספרייה שנייה.
      v_res_url := coalesce(public.office_document_url(p.id, v_res_key),
                            nullif(trim(coalesce(s.payload->>'clientLinkUrl','')), ''));

      -- ‼ 144: הרשימה החדשה. `url` נפתר כאן רק לקבצי ספריית המשרד — קובץ
      -- מהתיק של הלקוח הוא פרטי, ונמסר כמזהה בלבד שהדף פודה מול
      -- portal-open-document. `done` נקרא מהדרישה בעלת אותו מפתח, ולכן
      -- הסימון שנרשם בפתיחה הוא אותו סימון שסוגר את הבקשה.
      v_res_list := case when jsonb_typeof(s.payload->'clientResources') = 'array'
                         then s.payload->'clientResources' end;
      if coalesce(jsonb_array_length(v_res_list), 0) > 0 then
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                 'key',   x->>'key',
                 'label', x->>'label',
                 'fileName', nullif(x->>'fileName',''),
                 'url', case when x->>'source' = 'office'
                             then public.office_document_url(p.id, nullif(x->>'officeId','')) end,
                 'documentId', case when x->>'source' = 'client'
                             then nullif(x->>'documentId','') end,
                 'done', coalesce((select (r->>'done')::boolean
                                     from jsonb_array_elements(v_reqs) r
                                    where r->>'key' = x->>'key' limit 1), false)))
               order by ord)
          into v_res_out
          from jsonb_array_elements(v_res_list) with ordinality t(x, ord);
      else
        v_res_out := null;
      end if;

      -- ── הודעת מלל: כרטיס שקט, בלי פקד, ובלי מונה ────────────────────────
      -- ‼ נעולה או סגורה ⇒ פשוט אינה מופיעה. אין "הודעה שהושלמה": ברגע
      -- שהמשרד סוגר אותה היא יורדת מהדף, וזו כל מחזור החיים שלה.
      if coalesce((s.payload->>'messageOnly')::boolean, false) then
        if s.status in ('completed','verified','skipped','locked') then
          null;
        else
          v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
            'bucket','office','key','custom_'||s.id,
            'kind','message',
            'label', v_label,
            'note', nullif(s.payload->>'message','')));
        end if;

      -- ── שליחת מסמכים: שורה לכל קובץ, והפתיחה היא מה שסוגר ───────────────
      elsif v_res_out is not null then
        if s.status in ('completed','verified','skipped') then
          -- ‼ ממשיכה לשאת את הקבצים: הבקשה נסגרה, אבל המסמכים עצמם נשארים
          -- זמינים תחת «מסמכים שימושיים». לקוח שפתח פעם אחת לא מאבד אותם.
          -- ‼ stepId נמסר גם כאן, ובלעדיו קובץ פרטי היה הופך לבלתי-נגיש ברגע
          -- שהבקשה נסגרת: portal-open-document מזהה את הקובץ דרך הבקשה שלו.
          -- ‼ 147: גם המלל שצורף לקבצים נשאר. הקבצים והמלל חיים באותו מקום
          -- בדף («מסמכים מהמשרד»), ובלי זה ההסבר שהמשרד כתב היה נעלם בדיוק
          -- ברגע שהלקוח פותח את הקובץ האחרון — תוכן שנמחק מול העיניים.
          v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
            'bucket','done','key','custom_'||s.id,'label', v_label,
            'stepId', s.id,
            'note', nullif(s.payload->>'message',''),
            'resources', v_res_out));
        elsif s.status = 'locked' then
          v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
            'bucket','future','key','custom_'||s.id,'label', v_label,
            'sub', coalesce(public.portal_lock_reason(s.id), nullif(s.payload->>'clientSub',''))));
        else
          v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
            'bucket','action','key','custom_'||s.id,'label', v_label,
            'sub', nullif(s.payload->>'clientSub',''),
            'actionKind','portal','actionValue', s.id,
            'stepId', s.id,
            'kind','guide',
            'resources', v_res_out,
            'note', nullif(s.payload->>'message','')));
        end if;

      elsif s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','done','key','custom_'||s.id,'label', v_label,
          -- ‼ בקשת חומר עזר שהושלמה ממשיכה לשאת את הקישור. הדף מציג אותה
          -- תחת «מסמכים שימושיים» — אחרת הלקוח שפתח את המדריך פעם אחת
          -- מאבד אליו גישה לתמיד.
          'resourceKey', case when public.office_document_url(p.id, v_res_key) is not null then v_res_key else null end,
          'resourceUrl', v_res_url));
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','custom_'||s.id,'label', v_label,
          'sub', coalesce(public.portal_lock_reason(s.id), nullif(s.payload->>'clientSub',''))));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','custom_'||s.id,'label', v_label,
          'sub', case when v_res_url is not null then nullif(s.payload->>'clientSub','')
                      when coalesce(v_rq_total,0) > 1
                      then v_rq_done || ' מתוך ' || v_rq_total || ' הושלמו'
                      else nullif(s.payload->>'clientSub','') end,
          'actionKind','portal','actionValue', s.id,
          -- ‼ בקשת חומר עזר אינה טופס: הפעולה היחידה היא פתיחת הקובץ, והיא
          -- עצמה מה שסוגר אותה. kind נפרד כדי שהדף לא יצייר שורות דרישות.
          'kind', case when v_res_url is not null then 'guide' else 'custom' end,
          'resourceKey', case when public.office_document_url(p.id, v_res_key) is not null then v_res_key else null end,
          'resourceUrl', v_res_url,
          'cta', nullif(s.payload->>'clientCta',''),
          -- ‼ מיגרציה 107: ההסבר, המספרים להעתקה ומשפט הסגירה עוברים כמו שהם
          -- אל הדף האישי. clientSub לבדו לא הספיק — הוא מוחלף בשורת ההתקדמות
          -- ("1 מתוך 2 הושלמו") ברגע שיש יותר מדרישה אחת, וכל הסבר שנשען עליו
          -- נעלם בדיוק בבקשות שהכי זקוקות לו.
          'note', nullif(s.payload->>'clientNote',''),
          'refs', s.payload->'clientRefs',
          'noteAfter', nullif(s.payload->>'clientNoteAfter',''),
          'canUpload', exists (select 1 from jsonb_array_elements(v_reqs) x where x->>'kind' in ('file','files')),
          'requirements', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                              'key', x->>'key', 'kind', x->>'kind', 'label', x->>'label',
                              'done', coalesce((x->>'done')::boolean, false),
                              'required', coalesce((x->>'required')::boolean, true),
                              'options', x->'options',
                              'maxFiles', x->'maxFiles',
                              'fileCount', coalesce(jsonb_array_length(x->'documentIds'),
                                             case when nullif(x->>'documentId','') is not null then 1 else 0 end),
                              'value', x->>'value')) order by ord)
                            from jsonb_array_elements(v_reqs) with ordinality t(x, ord))));
      end if;

    when 'prev_accountant_details' then
      if s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_build_object('bucket','done','key','prev_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי רואה החשבון הקודם'));
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','prev_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי רואה החשבון הקודם'),
          'sub', coalesce(public.portal_lock_reason(s.id), nullif(s.payload->>'clientSub',''))));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','prev_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי רואה החשבון הקודם שלך'),
          'sub', coalesce(nullif(s.payload->>'clientSub',''), 'שם, אימייל וטלפון - כדי שנפנה אליו בשמך'),
          'actionKind','portal','actionValue', s.id, 'kind','prev_accountant',
          -- ‼ 217 (D3): לקוח שחוזר — שואלים מחדש; הפרטים שעל הכרטיס הם של מי שהיה לפנינו.
          'prefill', case when coalesce(s.payload->>'askAgain', '') = 'true' then null else nullif(jsonb_strip_nulls(jsonb_build_object(
            'name',  nullif(trim(coalesce(c.prev_accountant_name ,'')), ''),
            'email', nullif(trim(coalesce(c.prev_accountant_email,'')), ''),
            'phone', nullif(trim(coalesce(c.prev_accountant_phone,'')), ''))), '{}'::jsonb) end));
      end if;

    -- ── שלב 1: ההרשמה — של הלקוח ──────────────────────────────────────────
    -- ‼ עד מיגרציה 106 היה כאן `continue`, כלומר השלב לא הגיע ללקוח כלל.
    -- עכשיו זו הפעולה שלו: קישור ההרשמה של המשרד (אם הוגדר) וכפתור אישור
    -- אחד. linkUrl נפרד מ-actionKind במכוון — הכרטיס נושא גם קישור יוצא
    -- וגם השלמה בתוך הדף, ו-actionKind='portal' הוא זה שמפעיל את ההשלמה.
    when 'paperless_invite' then
      if coalesce(s.payload->>'paperlessStatus', '') in ('not_applicable', 'other_rep') then
        -- לא רלוונטי ללקוח: או שאין פייפרלס, או שהחשבון מועבר אלינו מהמייצג
        -- הקודם — ובשני המקרים אין לו מה להירשם.
        continue;
      elsif s.status in ('completed', 'verified') or
            (s.status = 'skipped' and coalesce(s.payload->>'skipReason','') in ('already_connected','transferred_rep')) then
        v_items := v_items || jsonb_build_object('bucket','done','key','paperless_signup','label','הרשמה לפייפרלס');
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','paperless_signup','label','הרשמה לפייפרלס',
          'sub', public.portal_lock_reason(s.id)));
      elsif coalesce(s.payload->>'paperlessStatus', '') = 'self' then
        -- ללקוח כבר יש חשבון: מה שנדרש ממנו הוא לצרף אותנו כמייצג, לא להירשם.
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','paperless_signup',
          'label','קישור חשבון הפייפרלס למשרד',
          'sub','בחשבון הפייפרלס שלך: הוסיפו את המשרד כמייצג',
          'actionKind','portal','actionValue', s.id, 'kind','paperless_signup',
          -- ‼ 114: שם העסק נשאל כאן, כי זה מה שאנחנו צריכים להזין בפייפרלס.
          -- הערך מגיע מ-clients.business_name ונשמר בחזרה לשם בלבד.
          'needsBusinessName', true,
          'businessName', nullif(trim(coalesce(c.business_name,'')), ''),
          'cta','קישרתי את המשרד'));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','paperless_signup',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'הרשמה לפייפרלס'),
          'sub', coalesce(nullif(s.payload->>'clientSub',''),
                          'שתי דקות, ומשם רק מצלמים קבלות מהטלפון'),
          'actionKind','portal','actionValue', s.id, 'kind','paperless_signup',
          'needsBusinessName', true,
          'businessName', nullif(trim(coalesce(c.business_name,'')), ''),
          'linkUrl', v_invite_url,
          'cta', coalesce(nullif(s.payload->>'clientCta',''), 'נרשמתי לפייפרלס')));
      end if;

    -- ── שלב 2: החיבור — של המשרד ──────────────────────────────────────────
    -- ‼ אין כאן פעולה ללקוח, וזו לא השמטה: ברגע שאנחנו נכנסים לחשבון שלו
    -- פייפרלס מבקשת מאיתנו את פרטי האשראי, ולכן ההשלמה היא של המשרד. מה
    -- שהלקוח צריך לדעת הוא רק שזה בטיפול ושאין לו מה לעשות.
    when 'paperless_connection' then
      if coalesce(s.payload->>'paperlessStatus', '') = 'not_applicable' then
        continue;
      elsif s.status in ('completed', 'verified') or
            (s.status = 'skipped' and coalesce(s.payload->>'skipReason','') in ('already_connected','transferred_rep')) then
        v_items := v_items || jsonb_build_object('bucket','done','key','paperless','label','חיבור לפייפרלס');
      elsif coalesce(s.payload->>'paperlessStatus', '') = 'other_rep' then
        v_items := v_items || jsonb_build_object('bucket','office','key','paperless_transfer',
          'label','העברת חשבון הפייפרלס אלינו',
          'sub','אנחנו מושכים את החשבון מהמייצג הקודם. אין צורך לעשות דבר.');
      -- ‼ נעול ⇒ "בהמשך" ולא "בטיפול המשרד". כל עוד הלקוח לא נרשם אנחנו לא
      -- באמת מטפלים בכלום, ו"בימים הקרובים ניכנס" היה הבטחה לא נכונה שגם
      -- מסתירה ממנו שהכדור עדיין אצלו.
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','paperless_connect',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'חיבור לפייפרלס'),
          'sub', public.portal_lock_reason(s.id)));
      else
        v_items := v_items || jsonb_build_object('bucket','office','key','paperless_connect',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'חיבור לפייפרלס'),
          'sub', coalesce(nullif(s.payload->>'clientSub',''),
                          'בימים הקרובים ניכנס לחשבון הפייפרלס ונשלים את החיבור. אין צורך לעשות דבר כרגע.'));
      end if;

    -- ‼ מיגרציה 103: אין יותר כפתור-קישור חיצוני. ההרשאה נוצרת בתוך פייפרלס,
    -- לא דרך קישור ששולחים ללקוח. כשהיא לא נעולה ולא הושלמה — הודעת מידע
    -- רגועה בלבד, ללא פעולה. אותה הודעה בדיוק לפני ואחרי שגיא יוצר את
    -- ההרשאה בפועל בצד שלו — אין ל-UI דרך לדעת מתי בדיוק הכרטיס הוזן.
    -- ── חיבור פייפרלס לרשות המסים ────────────────────────────────────────
    -- ‼ הפעולה קורית מחוץ לדף, אבל בניגוד להזנת הכרטיס יש כאן מה לאשר:
    -- הלקוח הוא היחיד שיודע שהחיבור בוצע, וההצהרה שלו היא שסוגרת. אין
    -- לנו גישה לחשבון שלו ברשות המסים ולכן אין מה לאמת.
    when 'rep_client_approval' then
      if s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_build_object('bucket','done','key','rep_approval',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'זירוז אישור הייצוג באזור האישי'));
      elsif nullif(s.payload->>'clientDeclaredAt','') is not null then
        v_items := v_items || jsonb_build_object('bucket','office','key','rep_approval',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'זירוז אישור הייצוג באזור האישי'),
          'sub', 'תודה. אנחנו בודקים שהאישור נקלט אצל רשות המסים.');
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','rep_approval',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'זירוז אישור הייצוג באזור האישי'),
          'sub', public.portal_lock_reason(s.id)));
      else
        -- ‼ 217 · «מה מסמנים באזור האישי»: מי מבני הזוג מאשר ואילו רשויות (_rep_approval_people).
        -- לא ידוע ⇒ אין approvals, והכרטיס בנוסח הכללי. ‼ הקריאה עטופה: נתון פגום (או עזר
        -- שעוד לא הוחל) לעולם לא שובר את הדף — זו הפונקציה של כל דף של לקוח.
        -- ‼ 217 (H2.5b) · כשהאישור נדרש: שורת המשנה לפי מי ששע״ם ממתינה לאישור שלו («…לאישור
        -- של רחל»), לא «שלך» קבוע. בלי נתון — הנוסח השמור.
        v_rep_req_sub := null;
        begin
          v_rep_approvals := nullif(public._rep_approval_people(c.id), '[]'::jsonb);
          if coalesce(s.payload->>'requiredBy', '') = 'shaam' then
            v_rep_req_sub := public._rep_approval_required_sub(v_rep_approvals);
          end if;
        exception when others then
          v_rep_approvals := null;
          v_rep_req_sub := null;
        end;
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','rep_approval',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'זירוז אישור הייצוג באזור האישי'),
          -- ‼ ברירת המחדל הישנה («שלוש דקות») מוצגת בנוסח של היום («שתי דקות» — כמו ההסבר),
          -- בלי לכתוב לשורה. נוסח שהמשרד כתב — כמו שהוא.
          'sub', coalesce(v_rep_req_sub,
                          case when s.payload->>'clientSub' = 'אופציונלי - שלוש דקות שמקצרות את ההמתנה לאישור הרשויות'
                               then 'אופציונלי - שתי דקות שמקצרות את ההמתנה לאישור הרשויות'
                               else nullif(s.payload->>'clientSub','') end),
          -- ‼ 217 · כרטיסים שנוצרו מאז 186 שמרו «\n» (לוכסן ו-n) במקום ירידת שורה. מוצג כירידת
          -- שורה, בלי לכתוב לשורה השמורה.
          'note', nullif(replace(s.payload->>'clientNote', E'\\n', E'\n'),''),
          'noteAfter', nullif(s.payload->>'clientNoteAfter',''),
          'cta', coalesce(nullif(s.payload->>'clientCta',''), 'אישרתי באזור האישי'),
          'linkUrl', nullif(s.payload->>'clientLinkUrl',''),
          'linkLabel', nullif(s.payload->>'clientLinkLabel',''),
          'approvals', v_rep_approvals,
          'actionKind','portal','actionValue', s.id, 'kind','declare'));
      end if;

    when 'paperless_tax_authority' then
      if s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_build_object('bucket','done','key','paperless_tax',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'חיבור פייפרלס לרשות המסים'));
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','paperless_tax',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'חיבור פייפרלס לרשות המסים'),
          'sub', public.portal_lock_reason(s.id)));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','paperless_tax',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'חיבור פייפרלס לרשות המסים'),
          'sub', nullif(s.payload->>'clientSub',''),
          'note', nullif(s.payload->>'clientNote',''),
          'noteAfter', nullif(s.payload->>'clientNoteAfter',''),
          'cta', coalesce(nullif(s.payload->>'clientCta',''), 'ביצעתי את החיבור'),
          'linkUrl', nullif(s.payload->>'clientLinkUrl',''),
          'actionKind','portal','actionValue', s.id, 'kind','declare'));
      end if;

    when 'retainer_authorization' then
      if coalesce(s.payload->>'method', '') = 'manual_arrangement' then
        continue;
      elsif s.status in ('completed', 'verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','retainer','label','החיוב החודשי הוסדר');
      -- ‼ סדר הבדיקות: החותמות **קודמות** למנעול, ולא להפך. הריטיינר מתעדכן
      -- לכרטיס אשראי כסעיף האחרון ברשימת החיבור — כלומר לפני שגיא לוחץ
      -- «סיימתי», וכשהשלב הזה עוד נעול. פייפרלס כבר מבקשת מהלקוח כרטיס באותו
      -- רגע, ולכן "בהמשך — ייפתח אוטומטית" היה מסתיר ממנו בדיוק את מה שממתין
      -- לו. נמצא בבדיקה בדפדפן (2026-08-17) — לא בקריאת קוד.
      -- ‼ החותמת קיימת רק אם גיא הצהיר שעשה את זה, ולכן היא ראיה טובה מהמנעול.
      elsif nullif(s.payload->>'cardEnteredAt','') is not null then
        v_items := v_items || jsonb_build_object('bucket','office','key','retainer_charge',
          'label','החיוב החודשי',
          'sub','פרטי הכרטיס התקבלו. נשלים את החיוב החודשי ונעדכן כאן.');
      -- ‼ הכדור אצל הלקוח — אבל הפעולה עצמה קורית בתוך פייפרלס, ולכן כרטיס
      -- מידע בלי פקד: הלקוח לא מאשר לנו כאן שהזין כרטיס. אין לנו דרך לדעת,
      -- ואישור שאין מאחוריו אימות הוא בדיוק מה שלא רצינו.
      elsif nullif(s.payload->>'authorizationCreatedAt','') is not null then
        v_items := v_items || jsonb_build_object('bucket','action','key','retainer_card',
          'kind','info',
          'label','הזנת כרטיס אשראי בפייפרלס',
          -- ‼ שני הערוצים שבהם זה קורה בפועל, בדיוק כפי שגיא תיאר: הודעה
          -- שנשלחת מפייפרלס, או חלון שנפתח בכניסה לאפליקציה.
          -- ‼ גוף שני רבים, כמו בכל הדף ("שאלות? פשוט השיבו למייל"). ערבוב
          -- יחיד ורבים בתוך אותו כרטיס נקרא כמו שתי הודעות שהודבקו יחד.
          'sub','פייפרלס תשלח לכם הודעה להזנת כרטיס אשראי לחיוב החודשי שסיכמנו - או שייפתח לכם חלון להזנת הכרטיס בכניסה הבאה לאפליקציה.',
          -- ‼ "1 ₪" ולא "₪1": בעברית סימן המטבע נדחף אחרי הספרה בכל מקרה, ובלי
          -- הרווח זה נקרא "1₪" ונראה כמו תקלה. נבדק בדפדפן.
          'note','ייתכן שתראו חיוב אימות בסך 1 ₪ - הוא נועד לוודא שהכרטיס תקין, ואינו החיוב החודשי.' || chr(10) ||
                 'אין מה לאשר כאן: ברגע שהכרטיס יוזן, נראה את זה מצידנו ונעדכן.');
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_build_object('bucket','future','key','retainer_future',
          'label','הרשאת התשלום החודשי',
          'sub', coalesce(public.portal_lock_reason(s.id), 'תופיע כאן אחרי חיבור הפייפרלס'));
      -- ‼ 114: עד כאן ההודעה "תתבקש להזין כרטיס" הופיעה ברגע שהשלב נפתח —
      -- כלומר לפני שגיא בכלל עדכן את הריטיינר בפייפרלס. הבטחה שאין מאחוריה
      -- כלום היא בדיוק הפנייה שהיא באה למנוע.
      -- ‼ כן מקדימים ואומרים מה עוד יגיע (הכרעת גיא, אותו יום): הלקוח שסיים
      -- להירשם ולהתקין צריך לדעת שתגיע אליו בקשה להזנת כרטיס — אחרת ההודעה
      -- מפייפרלס נראית לו כמו פנייה מגורם זר. מה שלא נאמר כאן הוא ההנחיה
      -- עצמה ולא חיוב האימות: אלה מופיעים רק כשזה באמת ממתין לו.
      else
        v_items := v_items || jsonb_build_object('bucket','office','key','retainer_info',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'החיוב החודשי'),
          'sub', 'אנחנו מסדירים מול פייפרלס את החיוב החודשי שסיכמנו. בהמשך תגיע אליכם מפייפרלס בקשה להזנת כרטיס אשראי - נעדכן אותכם כאן. אין צורך לעשות דבר כרגע.');
      end if;

    when 'intake_questionnaire' then
      if s.status in ('completed', 'verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','intake','label','עדכון סטטוס מיסויי');
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','intake_future','label','עדכון סטטוס מיסויי',
          'sub', public.portal_lock_reason(s.id)));
      elsif s.status = 'waiting_client' and c.intake_token is not null then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object('bucket','action','key','intake_fill','label','עדכון סטטוס מיסויי','sub','עונים רק על מה שרלוונטי · אפשר לעצור ולהמשיך','actionKind','intake','actionValue', c.intake_token));
      end if;

    when 'release_letter' then
      if s.status not in ('completed', 'verified', 'skipped') then v_prev_open := true;
      else v_prev_done := true; end if;

    when 'materials_received' then
      if s.status not in ('completed', 'verified', 'skipped') then v_prev_open := true;
      else v_prev_done := true; end if;

    when 'file_opening' then
      if s.status in ('completed', 'verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','files','label','פתיחת התיקים ברשויות');
      elsif s.status not in ('skipped') then
        v_items := v_items || jsonb_build_object('bucket','office','key','files_office','label','פתיחת התיקים ברשויות','sub','מע"מ, מס הכנסה וביטוח לאומי - בטיפולנו');
      end if;

    when 'authority_representation' then
      v_label := coalesce(nullif(s.payload->>'title',''), 'ייצוג ברשות');
      if s.status in ('pending','in_progress') then
        v_items := v_items || jsonb_build_object('bucket','office','key','authrep_'||s.id,
          'label', v_label,
          'sub', case when nullif(req.execution -> (case when s.payload->>'subjectRole' = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end) ->> 'referenceNumber', '') is not null
                      then 'האסמכתא התקבלה — נשלח הוראות אישור בקרוב'
                      else 'בטיפול המשרד — הזנת הייצוג בביטוח לאומי' end);
      elsif s.status = 'waiting_client' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','office','key','authrep_'||s.id, 'kind','message',
          'label', v_label,
          'note', 'האסמכתא: ' || coalesce(nullif(req.execution -> (case when s.payload->>'subjectRole' = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end) ->> 'referenceNumber', ''), '') ||
            case when nullif(req.execution -> (case when s.payload->>'subjectRole' = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end) ->> 'deadline', '') is not null
                 then chr(10) || 'יש לאשר עד ' || to_char((req.execution -> (case when s.payload->>'subjectRole' = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end) ->> 'deadline')::date, 'DD.MM.YYYY')
                 else '' end ||
            chr(10) || 'ניתן לאשר באתר הביטוח הלאומי או בטלפון 02-5393740. אם ההודעה לא הגיעה - אפשר להעביר את ההוראות.',
          'linkUrl', 'https://b2b.btl.gov.il/BTL.ILG.PAYMENTS/IshurIpuyKoachInfo.aspx',
          'linkLabel', 'לאתר הביטוח הלאומי'));
      elsif s.status = 'blocked' then
        v_items := v_items || jsonb_build_object('bucket','office','key','authrep_'||s.id,
          'label', v_label, 'sub', 'האסמכתא פגה - נזין מחדש');
      elsif s.status in ('completed','verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','authrep_'||s.id,
          'label', v_label || ' · אושר');
      end if;

    else
      continue;
    end case;

    if p_mode = 'preview' and s.published_at is null
       and jsonb_array_length(v_items) > v_before then
      select coalesce(jsonb_agg(
               case when ord > v_before then x || jsonb_build_object('draft', true) else x end
               order by ord), '[]'::jsonb)
        into v_items
        from jsonb_array_elements(v_items) with ordinality t(x, ord);
    end if;

    if p_mode = 'preview' and s.pending_cancel
       and jsonb_array_length(v_items) > v_before then
      select coalesce(jsonb_agg(
               case when ord > v_before then x || jsonb_build_object('removing', true) else x end
               order by ord), '[]'::jsonb)
        into v_items
        from jsonb_array_elements(v_items) with ordinality t(x, ord);
    end if;
    -- 172: נערך — בקשה מפורסמת שיש עליה טיוטה; הפאנל סופר "ישתנו".
    if p_mode = 'preview' and s.published_at is not null and s.draft_payload is not null
       and jsonb_array_length(v_items) > v_before then
      select coalesce(jsonb_agg(
               case when ord > v_before then x || jsonb_build_object('edited', true) else x end
               order by ord), '[]'::jsonb)
        into v_items
        from jsonb_array_elements(v_items) with ordinality t(x, ord);
    end if;
  end loop;

  if not v_rep_seen and v_rep_item is not null then
    v_items := v_items || v_rep_item;
  end if;

  if v_prev_open then
    v_items := v_items || jsonb_build_object('bucket','office','key','prev_accountant','label','קבלת החומרים מרואה החשבון הקודם','sub','ביקשנו את התיק - בתהליך');
  elsif v_prev_done then
    v_items := v_items || jsonb_build_object('bucket','done','key','prev_accountant','label','החומרים מרואה החשבון הקודם התקבלו');
  end if;

  -- ‼ ברמת הלקוח: התהליך (או הקליטה החדשה של לקוח שחוזר) עוד לא נפתח — גם כשבקשות שפורסמו
  -- לפני הקליטה מוצגות למעלה.
  if v_has_eng and not v_published and p_mode = 'live' then
    v_items := v_items || jsonb_build_object('bucket','office','key','process_pending',
      'label','אנחנו מכינים את המשך התהליך','sub','נעדכן אותך כאן ברגע שיהיה מה לעשות');
  end if;

  -- ‼ 144: הודעת מלל אינה נספרת. אין לה השלמה, ולכן כל ספירה שכוללת אותה
  -- מייצרת מונה שלעולם לא ייסגר — והופכת הודעה למטלה פתוחה לנצח. מאותה
  -- סיבה היא גם אינה משפיעה על journeyStage שנגזר מהיחס למטה.
  select count(*) filter (where x->>'bucket' = 'done'),
         count(*) filter (where x->>'bucket' <> 'future'
                            and coalesce(x->>'kind','') <> 'message')
    into v_done, v_total
    from jsonb_array_elements(v_items) x;

  if v_quote_open then
    -- 217: גם לקוח שחוזר — השלב הוא ההצעה החדשה.
    v_stage := 'quote';
  elsif not v_has_eng and quo.id is null and req.id is not null then
    v_stage := case when req.status = 'active' then 'active' else 'identity' end;
  elsif not v_has_eng then
    v_stage := case when quo.status = 'approved' then 'identity' else 'quote' end;
  elsif req.id is not null and coalesce(req.status, '') <> 'active' then
    v_stage := 'identity';
  elsif v_done < v_total then
    v_stage := 'setup';
  else
    v_stage := 'active';
  end if;

  return jsonb_build_object(
    'ok', true,
    'clientFirstName', v_first,
    'firmName', coalesce(p.firm_name, 'המשרד'),
    'branding', coalesce(p.branding, '{}'::jsonb),
    'done', v_done, 'total', v_total,
    'journeyStage', v_stage,
    'items', v_items);
end;
$function$;

-- ── 10 · עצירת מסלול הקליטה עוצרת גם את תזכורות הייצוג ─────────────────────
-- ‼ המסך אומר «בעצירה — שום מייל לא ייצא לבד», אבל תזכורות החתימה, אישור ב"ל וכרטיס
-- הזירוז באזור האישי לא הכירו את המסלול. השער בתביעה (כמו 212 §8), כדי שגם פונקציה
-- פרוסה ישנה תציית. false לא צורך את המונה: מה שהגיע זמנו יוצא בהרצה הראשונה אחרי החידוש.
create or replace function public._rep_reminders_paused(p_client_id text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select p_client_id is not null and exists (
    select 1 from public.onboarding_steps s join public.flow_runs fr on fr.id = s.flow_run_id
     where s.client_id = p_client_id and fr.status = 'paused'
       and s.step_type in ('representation', 'authority_representation', 'rep_client_approval')
       and s.status <> 'cancelled');
$$;
revoke all on function public._rep_reminders_paused(text) from public, anon, authenticated;

-- 212 + השער. (‼ גוף 212 — ni_targets_of מוגדרת שם; 216 מוחלת אחרי 212.)
create or replace function public.claim_representation_reminder(
  p_request_id text, p_audience text, p_expected_count int
) returns boolean
language plpgsql security definer set search_path to 'public' as $$
declare
  v_rows int;
  v_role text;
  v_rec  jsonb;
begin
  if p_audience not in ('sign', 'niClient', 'niSpouse') then
    raise exception 'invalid audience: %', p_audience;
  end if;

  if public._rep_reminders_paused((select linked_client_id from public.representation_requests where id = p_request_id)) then
    return false;
  end if;

  if p_audience in ('niClient', 'niSpouse') then
    v_role := case when p_audience = 'niSpouse' then 'spouse' else 'client' end;
    select c.authority_representations -> 'nationalInsurance' into v_rec
      from public.representation_requests r join public.clients c on c.id = r.linked_client_id
     where r.id = p_request_id;
    if not coalesce((select bool_or(x = v_role) from jsonb_array_elements_text(public.ni_targets_of(v_rec)) x), false) then
      return false;
    end if;
  end if;

  update public.representation_requests
     set execution = coalesce(execution, '{}'::jsonb) || jsonb_build_object(
           'reminders', coalesce(execution -> 'reminders', '{}'::jsonb) || jsonb_build_object(
             p_audience, jsonb_build_object('count', p_expected_count + 1, 'lastSentAt', now())
           )
         ),
         updated_at = now()
   where id = p_request_id
     and coalesce((execution -> 'reminders' -> p_audience ->> 'count')::int, 0) = p_expected_count;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;
revoke all on function public.claim_representation_reminder(text, text, int) from public, anon, authenticated;
grant execute on function public.claim_representation_reminder(text, text, int) to service_role;

create or replace function public.claim_representation_portal_reminder(p_step_id text, p_expected_count integer)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare
  v_rows   int;
  v_client text;
  v_pub    timestamptz;
begin
  select client_id, published_at into v_client, v_pub from public.onboarding_steps where id = p_step_id;
  if public._rep_reminders_paused(v_client) then
    return false;
  end if;
  -- ‼ התזכורת מפנה לכרטיס בדף האישי — ולכן אותו שער כמו הדף (build_client_portal) וכמו
  -- «שלח מייל…» (214), לכרטיס הזה: טיוטה, או כרטיס של קליטה חדשה שטרם נפתחה ללקוח
  -- (client_step_gate_open, 214 — הכרעה א) ⇒ הכרטיס לא בדף, ואין תזכורת. כרטיס שפורסם לפני
  -- הקליטה — עבודה קודמת שנשארת בדף, והתזכורת שלו ממשיכה (הכרעה ב).
  if v_pub is null or not public.client_step_gate_open(v_client, v_pub) then
    return false;
  end if;

  update public.onboarding_steps
     set payload = jsonb_set(
           coalesce(payload, '{}'::jsonb), array['reminder'],
           jsonb_build_object('count', p_expected_count + 1, 'lastSentAt', now())),
         updated_at = now()
   where id = p_step_id
     and coalesce((payload -> 'reminder' ->> 'count')::int, 0) = p_expected_count;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- ── 11 · אישור אישי לא נוסף לבקשה על בן/בת הזוג ─────────────────────────────
-- ‼ הבקשה על בן/בת הזוג נמצאת בדף של בעל הכרטיס — אישור («אני מאשר/ת») שם היה ניתן
-- על ידיו במקום הנושא (§9). 82 + השער; אותו כלל כמו ביצירה במסלול (_flow_materialize).
create or replace function public.update_onboarding_request(
  p_step_id text,
  p_payload jsonb,
  p_due_date date default null,
  p_apply_due boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s     public.onboarding_steps%rowtype;
  v_uid uuid := auth.uid();
  v_err text;
  v_content jsonb;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if s.status in ('completed','verified','cancelled','skipped') then
    return jsonb_build_object('ok', false, 'error', 'step_terminal');
  end if;
  -- עריכת תוכן קיימת רק לבקשות שנבנות בקומפוזר; הכרטיסים הייעודיים מנוהלים במסכיהם.
  if s.step_type not in ('custom_request','client_documents') then
    return jsonb_build_object('ok', false, 'error', 'not_editable');
  end if;

  -- ניקוי מפתחות מוגנים — עורך התוכן לא נוגע בהם (אותה רשימה כמו שמירת תבנית).
  v_content := coalesce(p_payload, '{}'::jsonb)
    - 'published' - 'releaseToken' - 'releaseBody' - 'releaseSubject' - 'releaseSentAt'
    - 'objectionDueDate' - 'submitted' - 'submittedByClient'
    - 'prevAccountantSignature' - 'prevAccountantSignedAt' - 'prevAccountantSignerName'
    - 'authUrl' - 'providerRef';

  if coalesce(v_content->>'subjectRole', s.payload->>'subjectRole') = 'spouse'
     and public._flow_has_personal_confirm(v_content) then
    return jsonb_build_object('ok', false, 'error', 'personal_confirm_for_subject');
  end if;

  if s.step_type = 'custom_request' and s.ball = 'client' then
    v_err := public.validate_requirements(v_content->'requirements');
    if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err); end if;
  elsif v_content ? 'requirements'
        and coalesce(jsonb_array_length(v_content->'requirements'), 0) > 0 then
    v_err := public.validate_requirements(v_content->'requirements');
    if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err); end if;
  end if;

  if s.published_at is null then
    -- טיוטה: נערכת במקום. merge_step_draft שומר על מצב פריטים אם כבר קיים.
    update public.onboarding_steps
       set payload = public.merge_step_draft(payload, v_content),
           due_date = case when p_apply_due then p_due_date else due_date end
     where id = s.id;
  else
    -- פורסמה: העריכה ממתינה ב-draft_payload; הלקוח רואה את הישן עד הפרסום.
    update public.onboarding_steps
       set draft_payload = v_content,
           due_date = case when p_apply_due then p_due_date else due_date end
     where id = s.id;
  end if;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'accountant',
    case when s.published_at is null then 'הבקשה נערכה (טיוטה)' else 'הבקשה נערכה — ממתין לפרסום' end,
    jsonb_build_object('pendingEdit', s.published_at is not null));

  return jsonb_build_object('ok', true, 'pendingEdit', s.published_at is not null);
end;
$function$;

-- ── 12 · «שמור את המסע כתבנית» בלי משימת האישור האישי (174 + סינון) ─────────
create or replace function public.save_journey_template(p_client_id text, p_name text, p_description text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c       public.clients%rowtype;
  v_uid   uuid := auth.uid();
  v_office uuid;
  v_items jsonb;
  v_id    text;
  v_skipped jsonb;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if nullif(trim(coalesce(p_name,'')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'missing_name');
  end if;

  select office_id into v_office from public.profiles where id = v_uid;
  if v_office is null then return jsonb_build_object('ok', false, 'error', 'no_office'); end if;

  -- מה שלא ייכנס לתבנית, ולמה — כדי שהמסך יוכל להגיד את זה במקום להבטיח
  -- "נשמרו 12" ולהחיל 9.
  select coalesce(jsonb_agg(jsonb_build_object('stepType', s.step_type, 'reason', 'not_creatable')), '[]'::jsonb)
    into v_skipped
    from public.onboarding_steps s
   where s.client_id = c.id
     and s.status <> 'cancelled'
     and not (s.step_type = any (public.request_creatable_step_types()));

  with src as (
    select s.*,
           -- JF14 · הנוסח האפקטיבי: עריכה שממתינה לפרסום היא מה שהמשרד מתכוון אליו.
           case when s.draft_payload is not null
                then public.merge_step_draft(s.payload, s.draft_payload)
                else s.payload end as effective_payload,
           'e' || row_number() over (order by s.sort_order, s.created_at) as tkey
      from public.onboarding_steps s
     where s.client_id = c.id
       and s.status <> 'cancelled'
       and s.step_type = any (public.request_creatable_step_types())
       -- ‼ 216: משימת «אישור אישי» של בן/בת הזוג שייכת לאדם אחד אצל לקוח אחד.
       and not (s.payload ? 'personalConfirmFor')
       -- ‼ 217: «לא נוצרה» — שורה על בקשה אחת אצל לקוח אחד, לא בקשה שעוברת לתבנית.
       and not (s.payload ? 'creationProblem')
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'key', src.tkey,
           'stepType', src.step_type,
           -- ‼ 216/217: בקשה שהלקוח השלים עוברת ל-'me' — ועדיין שלו; משימה פנימית שהועברה
           -- ל«ממתין ללקוח» — עדיין של המשרד, ונשמרת כ«משימה של המשרד» (officeTask).
           'owner', public._step_template_owner(src.step_type, src.ball, src.effective_payload),
           'officeTask', case when coalesce(src.effective_payload->>'internalTask', '') = 'true' then true end,
           'stageTitle', js.title,
           'stageOrder', js.sort_order,
           'requiredForClose', coalesce(src.required_for_close,
             src.step_type not in ('representation_upgrade', 'first_month_review')),
           'dueInDays', case when src.due_date is not null and src.created_at is not null
                             then greatest(0, (src.due_date - src.created_at::date)) end,
           'dependsOn', (
             select coalesce(jsonb_agg(distinct p.tkey), null)
               from public.onboarding_step_dependencies d
               join src p on p.id = d.depends_on_step_id
              where d.step_id = src.id),
           'payload', public.template_payload_from_step(src.effective_payload)))
         order by src.sort_order, src.created_at), '[]'::jsonb)
    into v_items
    from src
    left join public.journey_stages js on js.id = src.stage_id;

  if jsonb_array_length(v_items) = 0 then
    return jsonb_build_object('ok', false, 'error', 'nothing_to_save');
  end if;

  insert into public.journey_templates (user_id, office_id, kind, name, description, entries)
  values (v_uid, v_office, 'journey', trim(p_name), nullif(trim(coalesce(p_description,'')), ''), v_items)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'templateId', v_id, 'count', jsonb_array_length(v_items),
                            'skippedEntries', v_skipped);
end;
$function$;


select public.assert_domain_function_invariants();
