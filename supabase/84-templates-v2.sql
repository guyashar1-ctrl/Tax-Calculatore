-- 84 — תבניות v2: התבנית שומרת את התהליך כולו, וההחלה יוצרת טיוטות בלבד
--
-- מה נשמר (דרישת גיא, שלב 11): מבנה שלבי-העל וסדרם · הבקשות והמשימות ·
-- הדרישות על כל תצורתן (סוג, חובה/רשות, options, maxFiles) · תלויות כולל
-- מרובות-הורים · ידני/אוטומטי · תצורת גורם חיצוני ומיפוי מקור פרטי הקשר ·
-- required_for_close · תאריך יעד יחסי (בימים) · הבעלים.
--
-- שתי הכרעות מבניות:
-- 1. **מפתח יחסי לכל רשומה** (`key`) והתלויות מוצהרות כ-`dependsOn: [key…]`.
--    מזהי שלבים אמיתיים חסרי משמעות בתבנית; בהחלה הם ממופים למזהים החדשים.
-- 2. **תמיד טיוטות.** ההחלה קוראת ל-create_onboarding_request עם
--    p_published => false, בלי קשר למצב החשיפה של הלקוח (מיגרציה 76 עשתה
--    זאת רק כשהדף כבר היה חשוף). לכן גם אוטומציה שנשמרה בתבנית **אינה
--    חמושה** עד "עדכן את דף הלקוח" — כלל D3 מס' 2 נשמר במלואו.
--
-- תאימות לאחור: רשומות ישנות (בלי key/dependsOn/stage) מוחלות בדיוק כמו קודם —
-- ה-COALESCE על השדות החדשים מחזיר את ההתנהגות הישנה. `apply_journey_template`
-- שומרת על חתימתה, על הדדופליקציה לפי סוג (ולפי כותרת ב-custom_request),
-- ועל "לעולם לא דורסת בקשה קיימת".

-- ── 1. save_journey_template — צילום מלא של התהליך ───────────────────────────

CREATE OR REPLACE FUNCTION public.save_journey_template(p_client_id text, p_name text, p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c       public.clients%rowtype;
  v_uid   uuid := auth.uid();
  v_items jsonb;
  v_id    text;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if nullif(trim(coalesce(p_name,'')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'missing_name');
  end if;

  -- ‼ שומרים את הניסוח וההגדרות, לא את המצב. סטטוס, כדור, תאריכים ומסמכים
  -- שהתקבלו שייכים ללקוח הזה בלבד ואין להם מה לעבור לתבנית.
  with src as (
    select s.*,
           -- המפתח היחסי של הרשומה בתבנית. יציב לאורך ההחלה, ומאפשר לתאר
           -- תלות בלי להסתמך על מזהה שלב שלא יהיה קיים אצל הלקוח הבא.
           'e' || row_number() over (order by s.sort_order, s.created_at) as tkey
      from public.onboarding_steps s
     where s.client_id = c.id
       and s.status <> 'cancelled'
       -- הייצוג נולד מבקשת הייצוג ולא מתבנית; שלבים אוטומטיים אינם ניתנים להרכבה.
       and s.step_type not in ('representation', 'representation_upgrade', 'internal_setup', 'first_month_review')
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'key', src.tkey,
           'stepType', src.step_type,
           -- הבעלים נגזר מהכדור, כדי שההחלה תשחזר אותו במדויק.
           'owner', case
                      when src.payload ? 'externalParty' then 'external'
                      when src.ball = 'client' then 'client'
                      else 'me' end,
           -- שלב-העל: השם והסדר. בהחלה נוצר שלב באותו שם אם אינו קיים.
           'stageTitle', js.title,
           'stageOrder', js.sort_order,
           -- ‼ הערך האפקטיבי, לא הגולמי: שורה שנוצרה לפני העמודה מקבלת את
           -- ברירת המחדל לפי סוג, בדיוק כמו במסך וב-onboarding_close_readiness.
           'requiredForClose', coalesce(src.required_for_close,
             src.step_type not in ('representation_upgrade', 'first_month_review')),
           -- תאריך היעד נשמר כמרחק בימים מהיצירה — תאריך מוחלט של לקוח אחד
           -- אינו רלוונטי ללקוח הבא.
           'dueInDays', case when src.due_date is not null and src.created_at is not null
                             then greatest(0, (src.due_date - src.created_at::date)) end,
           -- תלויות כמפתחות יחסיים, כולל מרובות-הורים (טבלת 78 + העמודה).
           'dependsOn', (
             select coalesce(jsonb_agg(distinct p.tkey), null)
               from (
                 select d.depends_on_step_id as pid
                   from public.onboarding_step_dependencies d where d.step_id = src.id
                 union
                 select src.depends_on_step_id where src.depends_on_step_id is not null
               ) parents
               join src p on p.id = parents.pid),
           'payload', (src.payload - 'published' - 'releaseToken' - 'releaseBody' - 'releaseSubject'
                                 - 'releaseSentAt' - 'objectionDueDate' - 'submitted' - 'submittedByClient'
                                 - 'prevAccountantSignature' - 'prevAccountantSignedAt' - 'prevAccountantSignerName'
                                 - 'authUrl' - 'providerRef'
                                 -- מצב הביצוע האוטומטי שייך ללקוח, לא לתבנית.
                                 -- התצורה (autoAction) כן נשמרת.
                                 - 'autoExecutedAt' - 'autoError')
             -- פריטים חוזרים ריקים: התבנית אומרת מה לבקש, לא מה כבר הגיע.
             || case when src.payload ? 'checklist' then jsonb_build_object('checklist',
                  (select coalesce(jsonb_agg(jsonb_build_object('key',x->>'key','label',x->>'label','done',false) order by ord), '[]'::jsonb)
                     from jsonb_array_elements(src.payload->'checklist') with ordinality t(x,ord)))
                else '{}'::jsonb end
             -- ‼ תצורת הדרישה נשמרת במלואה: סוג, חובה/רשות, אפשרויות ותקרת
             -- קבצים. שמירה חלקית הייתה מחזירה כל דרישה כ"חובה" ומאבדת את
             -- רשימת הבחירה — כלומר תבנית שאינה מחזירה את מה שנשמר.
             || case when src.payload ? 'requirements' then jsonb_build_object('requirements',
                  (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                            'key', x->>'key', 'kind', x->>'kind', 'label', x->>'label',
                            'required', coalesce((x->>'required')::boolean, true),
                            'options', x->'options',
                            'maxFiles', x->'maxFiles',
                            'done', false)) order by ord), '[]'::jsonb)
                     from jsonb_array_elements(src.payload->'requirements') with ordinality t(x,ord)))
                else '{}'::jsonb end))
         order by src.sort_order, src.created_at), '[]'::jsonb)
    into v_items
    from src
    left join public.journey_stages js on js.id = src.stage_id;

  if jsonb_array_length(v_items) = 0 then
    return jsonb_build_object('ok', false, 'error', 'nothing_to_save');
  end if;

  insert into public.journey_templates (user_id, name, description, entries)
  values (v_uid, trim(p_name), nullif(trim(coalesce(p_description,'')), ''), v_items)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'templateId', v_id, 'count', jsonb_array_length(v_items));
end;
$function$;

-- ── 2. apply_journey_template — טיוטות בלבד, ומיפוי תלויות למזהים החדשים ─────

CREATE OR REPLACE FUNCTION public.apply_journey_template(p_client_id text, p_template_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c        public.clients%rowtype;
  t        public.journey_templates%rowtype;
  v_uid    uuid := auth.uid();
  e        jsonb;
  v_res    jsonb;
  v_added  int := 0;
  v_skip   int := 0;
  v_dup    boolean;
  v_title  text;
  v_map    jsonb := '{}'::jsonb;   -- מפתח-בתבנית → מזהה השלב שנוצר
  v_stages jsonb := '{}'::jsonb;   -- שם שלב-על → מזהה
  v_stage  text;
  v_deps   text[];
  v_dep_ids text[];
  v_owner  text;
  v_due    date;
  v_new    text;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  select * into t from public.journey_templates where id = p_template_id and user_id = v_uid;
  if t.id is null then return jsonb_build_object('ok', false, 'error', 'template_not_found'); end if;

  for e in select * from jsonb_array_elements(t.entries) loop
    if (e->>'stepType') = 'custom_request' then
      -- בקשה חופשית מזוהה לפי הכותרת: אפשר להוסיף כמה שרוצים, אבל לא פעמיים
      -- את אותה אחת.
      v_title := coalesce(nullif(trim(e->'payload'->>'title'), ''),
                          nullif(trim(e->'payload'->>'clientTitle'), ''));
      select exists (select 1 from public.onboarding_steps s
                     where s.client_id = c.id and s.step_type = 'custom_request'
                       and s.status <> 'cancelled'
                       and coalesce(nullif(trim(s.payload->>'title'), ''),
                                    nullif(trim(s.payload->>'clientTitle'), '')) is not distinct from v_title)
        into v_dup;
    else
      -- ‼ קיים ⇒ מדלגים. תבנית מוסיפה, לעולם לא דורסת ניסוח שכבר נערך ידנית
      -- ולא מוחקת בקשה שכבר רצה מול הלקוח.
      select exists (select 1 from public.onboarding_steps s
                     where s.client_id = c.id and s.step_type = e->>'stepType'
                       and s.status <> 'cancelled')
        into v_dup;
    end if;

    if v_dup then v_skip := v_skip + 1; continue; end if;

    -- שלב-העל: נוצר פעם אחת לכל שם, ומשויך לכל הרשומות שנשמרו תחתיו.
    v_stage := null;
    if nullif(trim(coalesce(e->>'stageTitle','')), '') is not null then
      if v_stages ? (e->>'stageTitle') then
        v_stage := v_stages->>(e->>'stageTitle');
      else
        select id into v_stage from public.journey_stages
         where client_id = c.id and title = e->>'stageTitle' limit 1;
        if v_stage is null then
          insert into public.journey_stages (user_id, client_id, title, sort_order)
          values (c.user_id, c.id, e->>'stageTitle',
                  coalesce((e->>'stageOrder')::int,
                           (select coalesce(max(sort_order), 0) + 10 from public.journey_stages where client_id = c.id)))
          returning id into v_stage;
        end if;
        v_stages := v_stages || jsonb_build_object(e->>'stageTitle', v_stage);
      end if;
    end if;

    v_owner := nullif(e->>'owner', '');
    v_due := case when (e->>'dueInDays') is not null
                  then (current_date + ((e->>'dueInDays')::int)) end;

    -- תלויות: ממפים מפתחות-תבנית למזהים שנוצרו בהחלה הזאת. מפתח שהרשומה שלו
    -- דולגה (כי הבקשה כבר קיימת) פשוט נושר — עדיף שלב פתוח מאשר שלב נעול
    -- לנצח מאחורי תלות שלא נוצרה.
    v_dep_ids := '{}';
    if jsonb_typeof(e->'dependsOn') = 'array' then
      select coalesce(array_agg(v_map->>k), '{}')
        into v_dep_ids
        from jsonb_array_elements_text(e->'dependsOn') k
       where v_map ? k;
    end if;

    -- ‼ תמיד טיוטה. גם אוטומציה שנשמרה בתבנית אינה חמושה עד הפרסום.
    v_res := public.create_onboarding_request(
               c.id, e->>'stepType', coalesce(e->'payload','{}'::jsonb),
               p_due_date => v_due,
               p_depends_on => case when array_length(v_dep_ids,1) >= 1 then v_dep_ids[1] end,
               p_published => false,
               p_required_for_close => coalesce((e->>'requiredForClose')::boolean, true),
               p_owner => v_owner,
               p_stage_id => v_stage);

    if coalesce((v_res->>'ok')::boolean, false) then
      v_added := v_added + 1;
      v_new := v_res->>'stepId';
      if nullif(e->>'key','') is not null then
        v_map := v_map || jsonb_build_object(e->>'key', v_new);
      end if;
      -- הורים נוספים (מעבר לראשון) נכנסים דרך ה-RPC שמכיר מרובות-הורים.
      if array_length(v_dep_ids, 1) > 1 then
        perform public.set_onboarding_step_dependencies(v_new, v_dep_ids);
      end if;
    else
      v_skip := v_skip + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'added', v_added, 'skipped', v_skip, 'template', t.name);
end;
$function$;
