-- 86 — זהות יציבה לרשומת תבנית: שתי בקשות עם אותה כותרת הן שתי בקשות
--
-- הבאג (חוסם שחרור, התגלה באימות של שלב 11): זהות בקשה חופשית בהחלת תבנית
-- נקבעה לפי הכותרת בלבד (מיגרציה 65). לכן תבנית v2 שמכילה שתי בקשות שונות
-- באותה כותרת — למשל "מסמכים חסרים" בשלב הקליטה ובשלב הבירור — יצרה אחת
-- בלבד. זו הפרה של האינווריאנט של v2: התבנית חייבת לשחזר את מבנה התהליך
-- שנשמר, וכותרת שהמשתמש רואה אינה מזהה.
--
-- התיקון (מינימלי): כל רשומת תבנית v2 כבר נושאת `key` יציב. בהחלה חותמים
-- אותו על הבקשה שנוצרה — `payload.templateOrigin = {templateId, key}` —
-- וזהו המזהה לדדופליקציה. הכותרת נשארת נפילה-אחורה, אבל **רק** מול שורות
-- שאינן חתומות על ידי אותה תבנית:
--
--   1. בקשה חופשית עם `key` (v2):
--      א. קיימת שורה חתומה ב-(templateId, key) ⇒ דילוג. זו האידמפוטנטיות.
--      ב. אחרת, קיימת שורה באותה כותרת שאינה חתומה על ידי התבנית הזאת
--         (למשל בקשה שגיא יצר ידנית) ⇒ דילוג, כמו קודם — תבנית לא מכפילה
--         עבודה קיימת.
--      ג. אחרת ⇒ נוצרת. שתי רשומות עם אותה כותרת נבדלות ב-key, ולכן (ב)
--         אינה בולעת את השנייה: השורה שנוצרה מהראשונה חתומה על התבנית.
--   2. בקשה חופשית בלי `key` (תבנית v1) ⇒ בדיוק ההתנהגות הישנה, לפי כותרת.
--   3. כל שאר הסוגים ⇒ ללא שינוי, דדופליקציה לפי step_type (האינדקסים
--      הייחודיים ממילא אוכפים שלב אחד מכל סוג ללקוח).
--
-- ‼ אין כאן מערכת זהויות גנרית — רק חותמת מקור על בקשות שנוצרו מתבנית,
-- שנועדה בדיוק לשחזור נאמן ולאידמפוטנטיות של ההחלה.
--
-- תאימות לאחור: התבנית החיה בפרודקשן היא v1 (8 רשומות, בלי key) ואינה
-- נכתבת מחדש. שורות קיימות שאינן חתומות ממשיכות להתנהג כמו קודם.

-- ── 1. save_journey_template — חותמת מקור ישנה אינה נשמרת לתבנית חדשה ────────
-- (התבנית מתארת מה לבקש; מאיזו תבנית קודמת השורה נוצרה אינו חלק מהתיאור.)

do $mig$
declare def text;
begin
  select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'save_journey_template';

  if strpos(def, $s$- 'autoExecutedAt' - 'autoError')$s$) = 0 then
    raise exception 'מיגרציה 86: רשימת המפתחות המנוקים ב-save_journey_template לא נמצאה';
  end if;
  def := replace(def,
    $s$- 'autoExecutedAt' - 'autoError')$s$,
    $s$- 'autoExecutedAt' - 'autoError' - 'templateOrigin')$s$);

  execute def;
end $mig$;

-- ── 2. apply_journey_template — זהות לפי key, נפילה-אחורה לכותרת ─────────────

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
  v_key    text;
  v_map    jsonb := '{}'::jsonb;
  v_stages jsonb := '{}'::jsonb;
  v_stage  text;
  v_dep_ids text[];
  v_owner  text;
  v_due    date;
  v_new    text;
  v_payload jsonb;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  select * into t from public.journey_templates where id = p_template_id and user_id = v_uid;
  if t.id is null then return jsonb_build_object('ok', false, 'error', 'template_not_found'); end if;

  for e in select * from jsonb_array_elements(t.entries) loop
    v_key := nullif(trim(coalesce(e->>'key','')), '');

    if (e->>'stepType') = 'custom_request' then
      v_title := coalesce(nullif(trim(e->'payload'->>'title'), ''),
                          nullif(trim(e->'payload'->>'clientTitle'), ''));
      if v_key is not null then
        -- v2: זהות = (מזהה התבנית, מפתח הרשומה). הכותרת אינה מזהה.
        select exists (
          select 1 from public.onboarding_steps s
           where s.client_id = c.id and s.step_type = 'custom_request'
             and s.status <> 'cancelled'
             and s.payload->'templateOrigin'->>'templateId' = t.id
             and s.payload->'templateOrigin'->>'key' = v_key)
          into v_dup;
        if not v_dup then
          -- נפילה-אחורה: בקשה קיימת באותה כותרת שאינה שייכת לתבנית הזאת
          -- (בדרך כלל אחת שגיא יצר ידנית) — לא מכפילים אותה.
          select exists (
            select 1 from public.onboarding_steps s
             where s.client_id = c.id and s.step_type = 'custom_request'
               and s.status <> 'cancelled'
               and coalesce(s.payload->'templateOrigin'->>'templateId', '') <> t.id
               and coalesce(nullif(trim(s.payload->>'title'), ''),
                            nullif(trim(s.payload->>'clientTitle'), '')) is not distinct from v_title)
            into v_dup;
        end if;
      else
        -- v1: בדיוק ההתנהגות הישנה — זיהוי לפי כותרת.
        select exists (select 1 from public.onboarding_steps s
                       where s.client_id = c.id and s.step_type = 'custom_request'
                         and s.status <> 'cancelled'
                         and coalesce(nullif(trim(s.payload->>'title'), ''),
                                      nullif(trim(s.payload->>'clientTitle'), '')) is not distinct from v_title)
          into v_dup;
      end if;
    else
      -- ‼ קיים ⇒ מדלגים. תבנית מוסיפה, לעולם לא דורסת ניסוח שכבר נערך ידנית
      -- ולא מוחקת בקשה שכבר רצה מול הלקוח.
      select exists (select 1 from public.onboarding_steps s
                     where s.client_id = c.id and s.step_type = e->>'stepType'
                       and s.status <> 'cancelled')
        into v_dup;
    end if;

    if v_dup then v_skip := v_skip + 1; continue; end if;

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

    v_dep_ids := '{}';
    if jsonb_typeof(e->'dependsOn') = 'array' then
      select coalesce(array_agg(v_map->>k), '{}')
        into v_dep_ids
        from jsonb_array_elements_text(e->'dependsOn') k
       where v_map ? k;
    end if;

    -- חותמת המקור נכתבת רק על בקשה חופשית מתבנית v2 — שם הזהות נדרשת.
    v_payload := coalesce(e->'payload','{}'::jsonb);
    if v_key is not null and (e->>'stepType') = 'custom_request' then
      v_payload := v_payload || jsonb_build_object('templateOrigin',
        jsonb_build_object('templateId', t.id, 'key', v_key));
    end if;

    v_res := public.create_onboarding_request(
               c.id, e->>'stepType', v_payload,
               p_due_date => v_due,
               p_depends_on => case when array_length(v_dep_ids,1) >= 1 then v_dep_ids[1] end,
               p_published => false,
               p_required_for_close => coalesce((e->>'requiredForClose')::boolean, true),
               p_owner => v_owner,
               p_stage_id => v_stage);

    if coalesce((v_res->>'ok')::boolean, false) then
      v_added := v_added + 1;
      v_new := v_res->>'stepId';
      if v_key is not null then
        v_map := v_map || jsonb_build_object(v_key, v_new);
      end if;
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
