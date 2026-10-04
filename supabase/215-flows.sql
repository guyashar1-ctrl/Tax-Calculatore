-- 215: מסלולים — הגדרה בגרסאות, ריצה אצל לקוח, שלבים, עצירה, ביטול ועדכון.
--
-- ‼ מסלול אינו מנוע נוסף. ריצה יוצרת שורות onboarding_steps רגילות דרך
-- create_onboarding_request, שלב שנפתח «אחרי» הוא קשתות רגילות ב-
-- onboarding_step_dependencies, ופתיחתו היא unlock_dependent_steps הקיימת.
-- מה שנוסף כאן: איזו גרסה רצה אצל מי, מתי נפתח/הושלם כל שלב, ומה קורה אז
-- (מייל מרוכז, הודעה אליך, פעולת קריאה מול רשות).
--
-- ‼ שינוי במסלול = גרסה חדשה, וחל על ריצות חדשות בלבד. ריצה קיימת מתעדכנת
-- רק בבחירה, עם תצוגת הבדלים, ונרשמת ביומן. שינוי בנתוני הלקוח רק מציע.
--
-- ‼ הטבלאות נוצרו ב-214. כאן הפונקציות. החיבור למחולל ולאישור ההצעה — 216.

-- ── 1 · תנאים ועובדות ─────────────────────────────────────────────────────
/**
 * השם הפרטי של בן/בת הזוג בכרטיס — כלל אחד: השדה המפוצל, ואם הוא ריק — המילה
 * הראשונה של «שם בן/בת הזוג» (כמו המילוי של 110). ‼ כרטיס שנוצר מהצעה / מליד / מהטופס
 * המלא נושא רק את השם המשורשר; בלי הכלל הזה בן/בת הזוג לא «קיים/ת» למסלולים.
 * התאום בדפדפן: spouseFirstNameOf ב-src/components/flows/StartFlowDialog.tsx.
 */
create or replace function public.client_spouse_first_name(p_first text, p_full text)
returns text language sql immutable set search_path to 'public' as $$
  select coalesce(nullif(trim(coalesce(p_first, '')), ''),
                  nullif(split_part(trim(coalesce(p_full, '')), ' ', 1), ''));
$$;

/**
 * ריק = חל. סוגים — אחד מהם (סוג לא ידוע אינו מתאים לרשימה לא ריקה).
 * עובדות — כולן; עובדה שלא ידועה היא false. ‼ אותה סמנטיקה כמו
 * src/features/flows/conditions.ts — מוכח בבדיקה משותפת (whenCases.json).
 */
create or replace function public.flow_when_matches(p_when jsonb, p_facts jsonb)
returns boolean language sql immutable set search_path to 'public' as $$
  select case
    when p_when is null or jsonb_typeof(p_when) <> 'object' then true
    else
      (coalesce(jsonb_typeof(p_when->'kinds'), '') <> 'array'
        or jsonb_array_length(p_when->'kinds') = 0
        or exists (select 1 from jsonb_array_elements_text(p_when->'kinds') k
                    where k = coalesce(p_facts->>'kind', '')))
      and not exists (
        select 1 from jsonb_array_elements(case when jsonb_typeof(p_when->'facts') = 'array'
                                                then p_when->'facts' else '[]'::jsonb end) f
         where (coalesce(p_facts->>(f->>'key'), 'false') = 'true')
               <> (coalesce(f->>'is', 'true') = 'true'))
  end;
$$;

/**
 * מה ידוע על הלקוח, באותו אוצר מילים כמו המחולל. עם התקשרות — העובדות
 * שהמחולל כבר שמר (דטרמיניזם); בלעדיה — מהכרטיס ומההתקשרות האחרונה.
 * תמיד מהכרטיס: מצב משפחתי ובן/בת זוג.
 */
create or replace function public.client_flow_facts(p_client_id text, p_engagement_id text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  c       public.clients%rowtype;
  v_eng   public.engagements%rowtype;
  v_f     jsonb := '{}'::jsonb;
  v_kind  text;
  v_has_prev boolean;
  v_spouse_name text;
  v_card_licensed boolean;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return '{}'::jsonb; end if;

  if p_engagement_id is not null then
    select * into v_eng from public.engagements where id = p_engagement_id and client_id = c.id;
  end if;
  if v_eng.id is null then
    select * into v_eng from public.engagements
     where client_id = c.id and journey_default_facts is not null
     order by created_at desc limit 1;
  end if;
  if v_eng.id is not null and jsonb_typeof(v_eng.journey_default_facts) = 'object' then
    v_f := v_eng.journey_default_facts;
  end if;

  v_has_prev := coalesce(c.has_previous_accountant, (v_f->>'has_prev')::boolean, false);
  -- ‼ 217: סוג שהמחולל ניחש (kindFallback — לפני 217 «עוסק מורשה» כשלא היה ידוע) אינו
  -- עובדה: הכרטיס קובע. סוג שלא ידוע נשאר ריק — תנאי שתלוי בו מחכה לו, לא «מורשה».
  v_kind := coalesce(case when coalesce(v_f->>'kindFallback', 'false') = 'true' then null
                          else nullif(v_f->>'kind', '') end,
                     public.resolve_client_kind(null, c.id));
  if v_kind = 'custom' or v_kind is null then
    v_kind := case when c.dealer_type = 'company' then 'company'
                   when c.dealer_type = 'licensed' or c.vat_status = 'authorizedDealer' then 'licensed_dealer'
                   when c.dealer_type = 'exempt' or c.vat_status = 'exemptDealer' then 'exempt_dealer'
                   else nullif(v_kind, 'custom') end;
  end if;
  -- ‼ 217: כל צד בנפרד. «false OR NULL» הוא NULL — ועוסק פטור בלי סיווג מע״מ קיבל את
  -- ה«מורשה» השמור בהתקשרות.
  v_card_licensed := case when c.dealer_type in ('licensed', 'company') or c.vat_status = 'authorizedDealer' then true
                          when c.dealer_type = 'exempt' or c.vat_status = 'exemptDealer' then false end;
  -- ‼ השם הפרטי — כלל אחד (client_spouse_first_name): גם כרטיס שיש בו רק «שם בן/בת הזוג».
  v_spouse_name := public.client_spouse_first_name(c.spouse_first_name, c.spouse_name);

  return v_f || jsonb_build_object(
    'kind', v_kind,
    'licensed', coalesce(v_card_licensed,
                         case when v_kind is not null then v_kind in ('licensed_dealer', 'company') end,
                         (v_f->>'licensed')::boolean, false),
    'has_prev', v_has_prev,
    'no_prev_email', nullif(trim(coalesce(c.prev_accountant_email, '')), '') is null,
    'rep', coalesce((v_f->>'rep')::boolean, false) or c.representation_request_id is not null,
    'monthly', coalesce((v_f->>'monthly')::boolean, false),
    'paperless', coalesce((v_f->>'paperless')::boolean, false),
    'new_business', coalesce((v_f->>'new_business')::boolean, c.business_transfer = false and not v_has_prev, false),
    'married', coalesce(c.family_status = 'married', false),
    -- ‼ בן/בת זוג שיש להם כרטיס משלהם — העבודה עליהם נוצרת מהכרטיס שלהם
    -- (יסודות §5, niEditable). מכאן לא מציעים עליהם כלום.
    'hasSpouse', coalesce(c.family_status = 'married', false)
                 and v_spouse_name is not null and c.spouse_client_id is null,
    -- ‼ נשוי/אה, בלי כרטיס לבן/בת הזוג, ובלי שום שם בכרטיס: אין למי לפתוח — וזה נאמר
    -- (_flow_materialize רושם שורת «לא נוצרה»), לא דילוג שקט.
    'spouseNameMissing', coalesce(c.family_status = 'married', false)
                         and v_spouse_name is null and c.spouse_client_id is null,
    'clientFirstName', nullif(trim(coalesce(c.first_name, '')), ''),
    'spouseFirstName', v_spouse_name);
end;
$$;

-- ── 2 · הגדרה: בדיקה וקריאה ───────────────────────────────────────────────
-- פעולות מול רשות שמותר למסלול להריץ לבד: קריאה בלבד. כל השאר — בלחיצה.
create or replace function public.flow_auto_action_allowed(p_action_type text)
returns boolean language sql immutable set search_path to 'public' as $$
  select coalesce(p_action_type, '') in ('shaam.sync_income_tax_file', 'btl.sync_file');
$$;

/**
 * null = תקין; אחרת קוד שגיאה. ‼ אותם כללים כמו validateFlow ב-TS.
 * במסלול הקליטה בקשות המערכת נוצרות במחולל לפי כללים קבועים — לכן הן רק
 * בשלבים שנפתחים מיד, מוגבלות רק לפי סוג לקוח, ולא «לכל אדם». במסלול ידני
 * או שנתי אין בקשות מערכת בכלל: רק מהספרייה (חוזרות בכל מחזור).
 */
create or replace function public.flow_definition_error(p_def jsonb, p_trigger text)
returns text language plpgsql immutable set search_path to 'public' as $$
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
        if not public.flow_auto_action_allowed(it->'ref'->>'actionType') then return 'action_not_supported'; end if;
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
      v_item_kind := v_item_kind || jsonb_build_object(it->>'key', it->'ref'->>'kind');
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
        if v_item_kind->>(it->>'after') = 'action' or it->'ref'->>'kind' = 'action' then return 'after_action'; end if;
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
$$;

create or replace function public._flow_def(p_flow_id text, p_version int)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select definition from public.office_flow_versions where flow_id = p_flow_id and version = p_version;
$$;

-- ── 3 · מהספרייה לבקשה ────────────────────────────────────────────────────
/** «שליחת מסמך» — אותו payload כמו buildDocumentRequestPayload (src/lib/clientGuide.ts). */
create or replace function public._document_request_payload(p_profile_id uuid, p_doc_id text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_doc   jsonb;
  v_label text;
  v_noun  text;
begin
  select d into v_doc
    from public.profiles p,
         jsonb_array_elements(case when jsonb_typeof(p.settings->'client_documents') = 'array'
                                   then p.settings->'client_documents' else '[]'::jsonb end) d
   where p.id = p_profile_id and d->>'id' = p_doc_id
   limit 1;
  if v_doc is null then return null; end if;
  v_label := coalesce(nullif(v_doc->>'label', ''), 'מסמך מהמשרד');
  v_noun := case when position('מדריך' in v_label) > 0 then 'המדריך' else 'המסמך' end;
  return jsonb_build_object(
    'title', v_label, 'clientTitle', v_label,
    'clientSub', 'מסמך מהמשרד - כמה דקות קריאה',
    'clientCta', 'לפתיחת המסמך',
    'clientResource', p_doc_id,
    'requirements', jsonb_build_array(
      jsonb_build_object('key', 'opened', 'kind', 'confirm', 'label', 'פתיחת ' || v_noun, 'done', false, 'required', false),
      jsonb_build_object('key', 'reviewed', 'kind', 'confirm', 'label', 'עברתי על ' || v_noun, 'done', false, 'required', true)));
end;
$$;

/**
 * הבקשה בספרייה שפריט מצביע עליה. ‼ פריט שנוסף כשהבקשה הייתה מובנית מצביע
 * על המזהה של המובנית; «התאמה למשרד» יוצרת שורה חדשה (אותו seed_key) ולא
 * משכתבת מסלולים. בלי ההעדפה הזו המסלול המשיך לקרוא את המובנית — והמשרד
 * ערך עותק שאף מסלול לא קורא. אותו כלל במסך: loadRequestTemplates (overrides).
 */
create or replace function public._library_template(p_office uuid, p_template_id text)
returns public.journey_templates language plpgsql stable security definer set search_path to 'public' as $$
declare
  t public.journey_templates%rowtype;
  c public.journey_templates%rowtype;
begin
  select * into t from public.journey_templates
   where id = p_template_id and kind = 'request' and (office_id is null or office_id = p_office);
  if t.id is not null and t.office_id is null and t.seed_key is not null and p_office is not null then
    select * into c from public.journey_templates
     where kind = 'request' and office_id = p_office and seed_key = t.seed_key
     order by updated_at desc nulls last limit 1;
    if c.id is not null then return c; end if;
  end if;
  return t;
end;
$$;

/**
 * בקשה שיש בה אישור אישי (פריט confirm — «עברתי על…», «אני מאשר…»).
 * ‼ לבן/בת הזוג אין דף משלו; בקשה «לכל אדם» מופיעה בדף של בעל הכרטיס. העלאת
 * קובץ או מסירת מידע על בן/בת הזוג — משק בית שמגיש יחד. אישור אישי — לא:
 * בעל הכרטיס היה מאשר במקומו/ה (CLAUDE.md §9: «בלי פקד שסוגר במקום הנושא»).
 * אותו כלל במסך: hasPersonalConfirm ב-features/flows/compile.ts.
 */
create or replace function public._flow_has_personal_confirm(p_payload jsonb)
returns boolean language sql immutable set search_path to 'public' as $$
  select coalesce(jsonb_typeof(p_payload->'requirements') = 'array'
     and exists (select 1 from jsonb_array_elements(p_payload->'requirements') x where x->>'kind' = 'confirm'), false);
$$;

/**
 * פריט במסלול → סוג, payload ובעלים, מהספרייה ברגע היצירה.
 * ‼ הספרייה היא המקור: שינוי בה חל על בקשות שייווצרו מעכשיו, ואינו נוגע
 * בבקשות שכבר נוצרו (כמו תבנית — src/lib/requestTemplates.ts).
 * p_repeatable — מסלול שחוזר (שנתי/ידני): «מסמכים מהלקוח» נוצרת כבקשה
 * רגילה עם דרישות קובץ, כי בקשת המערכת היא אחת ללקוח לכל חייו.
 */
create or replace function public._flow_item_spec(p_user_id uuid, p_item jsonb, p_repeatable boolean)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
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
$$;

-- ── 4 · קשתות: «נפתח אחרי» ───────────────────────────────────────────────
/**
 * מוסיפה הורים (איחוד, לא החלפה — קשתות המחולל והמשרד נשארות) ונועלת אם
 * טרם הושלמו. מסלול מערכת — בלי auth. הקשתות מסומנות origin='flow'.
 * ‼ בקשה שכבר נמסרה ללקוח כמשהו לעשות לא ננעלת מחדש: מחזירה false ולא
 * מוסיפה קשת. הורה מלקוח אחר או מעגל — נדחים, כמו ב-set_onboarding_step_dependencies.
 */
create or replace function public._flow_add_parents(p_step_id text, p_parents text[])
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare
  s public.onboarding_steps%rowtype;
  v_parents text[];
  v_announced int;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return false; end if;
  select coalesce(array_agg(distinct p), '{}') into v_parents
    from unnest(coalesce(p_parents, '{}')) p
   where p is not null and p <> s.id
     and exists (select 1 from public.onboarding_steps ps
                  where ps.id = p and ps.client_id = s.client_id and ps.user_id = s.user_id)
     and not exists (select 1 from public.onboarding_step_dependencies d
                      where d.step_id = s.id and d.depends_on_step_id = p);
  if coalesce(array_length(v_parents, 1), 0) = 0 then return true; end if;
  if exists (
    with recursive desc_steps(id) as (
      select d.step_id from public.onboarding_step_dependencies d where d.depends_on_step_id = s.id
      union
      select d2.step_id from public.onboarding_step_dependencies d2 join desc_steps ds on ds.id = d2.depends_on_step_id
    ) select 1 from desc_steps where id = any (v_parents)) then
    return false;
  end if;
  select coalesce(announced_version, 0) into v_announced from public.client_step_notice_state where step_id = s.id;
  if s.status = 'pending' and s.published_at is not null and coalesce(v_announced, 0) >= 1
     and exists (select 1 from public.onboarding_steps ps where ps.id = any (v_parents)
                  and not public.step_satisfies_dependency(ps.status, ps.payload)) then
    return false;
  end if;
  insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id, origin)
  select s.id, p, s.user_id, 'flow' from unnest(v_parents) p
  on conflict do nothing;
  if s.status = 'pending' and not public.onboarding_dependency_met(s.id) then
    update public.onboarding_steps set status = 'locked' where id = s.id;
  end if;
  return true;
end;
$$;

/**
 * הצעדים שעליהם שלב «מחכה». שלב שאין בו צעד חובה אחד (לא חל, הכול רשות,
 * הכול פעולות) עובר הלאה להורה שלו — אחרת השלב הבא היה נפתח לפני זמנו.
 */
create or replace function public._flow_gate_steps(p_run_id text, p_def jsonb, p_opens jsonb, p_depth int default 0)
returns text[] language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_steps text[];
  v_stage jsonb;
  v_item_stage text;
begin
  if p_depth > 20 or p_opens is null or coalesce(p_opens->>'after', 'start') = 'start' then
    return '{}';
  end if;
  if p_opens->>'after' = 'item' then
    select coalesce(array_agg(s.id), '{}') into v_steps
      from public.onboarding_steps s
     where s.flow_run_id = p_run_id and s.flow_item_key = p_opens->>'item' and s.status <> 'cancelled';
    if coalesce(array_length(v_steps, 1), 0) > 0 then return v_steps; end if;
    select st->>'key' into v_item_stage
      from jsonb_array_elements(p_def->'stages') st, jsonb_array_elements(st->'items') it
     where it->>'key' = p_opens->>'item' limit 1;
    -- ‼ הפריט לא נוצר (לא חל / נמחק) ⇒ מחכים שהשלב שלו יסתיים — אותו כלל כמו
    -- ב-_flow_progress, כדי שהקשתות והמצב ברצועה לא יסתרו זה את זה.
    if v_item_stage is null then return '{}'; end if;
    return public._flow_gate_steps(p_run_id, p_def, jsonb_build_object('after', 'stage', 'stage', v_item_stage), p_depth + 1);
  end if;
  -- after stage. ‼ left join: בקשה שצורפה לשלב אחר כך (adhoc-…) מחזיקה אותו כמו פריט חובה.
  select coalesce(array_agg(s.id), '{}') into v_steps
    from public.onboarding_steps s
    left join lateral (select it from jsonb_array_elements(p_def->'stages') st, jsonb_array_elements(st->'items') it
                        where st->>'key' = p_opens->>'stage' and it->>'key' = s.flow_item_key limit 1) x on true
   where s.flow_run_id = p_run_id and s.flow_stage_key = p_opens->>'stage' and s.status <> 'cancelled'
     -- ‼ שורה שאין לה פריט בהגדרה: בקשה שצורפה (adhoc-…) מחזיקה; פריט שהוסר בעדכון — לא
     -- («מה שלא סימנת — לא משתנה»: רשות שהוסרה לא הופכת לחובה).
     and case when x.it is null then s.flow_item_key like 'adhoc-%'
              else coalesce(x.it->>'optional', 'false') <> 'true' end;
  if coalesce(array_length(v_steps, 1), 0) > 0 then return v_steps; end if;
  select st into v_stage from jsonb_array_elements(p_def->'stages') st where st->>'key' = p_opens->>'stage';
  return public._flow_gate_steps(p_run_id, p_def, v_stage->'opens', p_depth + 1);
end;
$$;

/**
 * מחשבת מחדש את הקשתות של כל צעד נעול בריצה, מההגדרה של הגרסה שלה: השערים של
 * השלב (_flow_gate_steps — כולל בקשות שצורפו, ועובר דרך שלב ריק/שלא חל) ו«אחרי»
 * בתוך השלב. ‼ בלעדיה: בקשה שנוספה אחר כך לשלב פתוח (הוספה, בן/בת זוג, עדכון,
 * צירוף) לא החזיקה את השלבים שאחריו — הקשתות שלהם נקבעו פעם אחת, בהפעלה.
 * נוגעת רק בקשתות origin='flow' של צעדים נעולים; קשתות המחולל והמשרד נשארות.
 */
create or replace function public._flow_rearc_locked(p_run_id text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  r     public.flow_runs%rowtype;
  v_def jsonb;
  s     record;
  st    jsonb;
  it    jsonb;
  v_parents text[];
begin
  select * into r from public.flow_runs where id = p_run_id;
  if r.id is null or r.status not in ('active', 'paused') then return; end if;
  v_def := public._flow_def(r.flow_id, r.flow_version);
  for s in select id, flow_stage_key, flow_item_key from public.onboarding_steps
            where flow_run_id = r.id and status = 'locked' loop
    st := null; it := null;
    select x.v into st from jsonb_array_elements(v_def->'stages') as x(v) where x.v->>'key' = s.flow_stage_key;
    continue when st is null;
    select x into it from jsonb_array_elements(st->'items') x where x->>'key' = s.flow_item_key;
    -- ‼ שלב שכבר נפתח — השער שלו עבר. בקשה שנוספה לשלב קודם (שהסתיים) לא נועלת אותו שוב.
    v_parents := case when (r.state->'stages'->(st->>'key')->>'openedAt') is not null then '{}'::text[]
                      else public._flow_gate_steps(r.id, v_def, st->'opens') end;
    if nullif(it->>'after', '') is not null then
      v_parents := v_parents || coalesce((select array_agg(p.id) from public.onboarding_steps p
                                           where p.flow_run_id = r.id and p.flow_item_key = it->>'after'
                                             and p.status <> 'cancelled'), '{}');
    end if;
    delete from public.onboarding_step_dependencies d
     where d.step_id = s.id and d.origin = 'flow' and not (d.depends_on_step_id = any (v_parents));
    perform public._flow_add_parents(s.id, v_parents);
  end loop;
end;
$$;

-- ── 5 · יצירת הבקשות של ריצה ──────────────────────────────────────────────
/**
 * יוצרת את הבקשות של הריצה (או רק את הפריטים/האנשים שנבחרו). כל השלבים
 * נוצרים מראש; שלב מאוחר נעול בקשתות ומופיע בדף כ«בהמשך».
 * ‼ בקשה שכבר פתוחה אצל הלקוח מצורפת ולא נפתחת שנייה. בקשת «פעם אחת» שכבר
 * הושלמה — לא נפתחת שוב.
 */
create or replace function public._flow_materialize(p_run_id text, p_item_keys text[] default null,
  p_roles text[] default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
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
      continue when coalesce(it->>'fixed', 'false') = 'true' or it->'ref'->>'kind' = 'action';
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
$$;

-- ── 6 · פעולה מול רשות כשהשלב נפתח ────────────────────────────────────────
/**
 * ‼ «אפשר להריץ לבד» אינו רשות להפעיל. פעולה רצה לבד רק כשכל אלה מתקיימים:
 *   · פעולת קריאה (קריאת תיק מ״ה מהשע״ם, קריאת התיק בב״ל) — שינוי לעולם לא;
 *   · בהגדרת הפריט במסלול נבחר «לבד» (מקום ההגדרה היחיד);
 *   · הריצה עצמה הורשתה לכך כשנוצרה: ריצת קליטה של התקשרות חדשה, או הפעלה
 *     שבה הרו״ח אישר במפורש «פעולות מול רשות ירוצו לבד» (state.autoActions);
 *   · יש ראיה שהמשרד מייצג את האדם ברשות (בלעדיה הקריאה נכשלת בהכרח);
 *   · מחשב עבודה חי, עם היכולת, בשכבה טרייה, ושאיש לא נוגע בו 3 דקות — הקריאה
 *     משתלטת על החלון הפתוח (worker/src/browserSession.mjs, btlSyncFile.mjs);
 *   · אין כבר קריאה אוטומטית פתוחה במשרד מאותו סוג, ואין ללקוח קריאה מהשבוע.
 * כל תוצאה אחרת ⇒ «ממתין לך», עם הסיבה — לא «דולג» בשקט.
 */
create or replace function public._flow_authority_ready(p_user_id uuid, p_action_type text)
returns text language sql stable security definer set search_path to 'public' as $$
  select case
    when not exists (select 1 from public.automation_workers w
                      where w.user_id = p_user_id and public.automation_worker_fresh(w)
                        and public.automation_job_subsystem(p_action_type) = any (w.capabilities))
      then 'worker_offline'
    when not exists (
      select 1 from public.automation_workers w
       where w.user_id = p_user_id and public.automation_worker_fresh(w)
         and public.automation_job_subsystem(p_action_type) = any (w.capabilities)
         and case p_action_type
               when 'shaam.sync_income_tax_file' then
                 coalesce(w.status #>> '{gmf,ready}', 'false') = 'true'
                 and coalesce(w.status #>> '{gmf,checkedAt}', '') ~ '^\d{4}-'
                 and (w.status #>> '{gmf,checkedAt}')::timestamptz > now() - interval '10 minutes'
               when 'btl.sync_file' then
                 coalesce(w.status #>> '{btl,connected}', 'false') = 'true'
               else false end)
      then 'not_connected'
    when not exists (
      select 1 from public.automation_workers w
       where w.user_id = p_user_id and public.automation_worker_fresh(w)
         and public.automation_job_subsystem(p_action_type) = any (w.capabilities)
         and public.automation_worker_idle(w) >= 180)
      then 'office_busy'
    else 'ready' end;
$$;

create or replace function public._flow_run_action(r public.flow_runs, p_item jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_type    text := p_item->'ref'->>'actionType';
  v_input   jsonb;
  v_file    text;
  c         public.clients%rowtype;
  v_ready   text;
  v_job     text;
  v_tf      jsonb;
  v_wait    jsonb := jsonb_build_object('state', 'waiting_office', 'at', now());
begin
  if not public.flow_auto_action_allowed(v_type) then
    return v_wait || jsonb_build_object('reason', 'not_supported');
  end if;
  if coalesce(p_item->>'mode', 'manual') <> 'auto' then
    return v_wait;
  end if;
  if coalesce(r.state->>'autoActions', 'false') <> 'true' then
    return v_wait || jsonb_build_object('reason', 'run_not_authorized');
  end if;

  select * into c from public.clients where id = r.client_id;
  v_tf := case when jsonb_typeof(c.tax_files) = 'array' then c.tax_files else '[]'::jsonb end;
  if v_type = 'shaam.sync_income_tax_file' then
    select regexp_replace(coalesce(x->>'fileNumber', ''), '\D', '', 'g') into v_file
      from jsonb_array_elements(v_tf) x where x->>'authority' = 'income_tax' limit 1;
    if coalesce(v_file, '') = '' then return v_wait || jsonb_build_object('reason', 'missing_input'); end if;
    if not exists (select 1 from jsonb_array_elements(v_tf) x
                    where x->>'authority' = 'income_tax' and x->>'repStatus' = 'active')
       and not exists (select 1 from public.representation_requests rr
                        where rr.id = c.representation_request_id and rr.status = 'active') then
      return v_wait || jsonb_build_object('reason', 'not_represented');
    end if;
    v_input := jsonb_build_object('fileNumber', v_file);
  else
    select jsonb_agg(q.x) into v_input from (
      select jsonb_build_object('role', 'client', 'idNumber', regexp_replace(coalesce(c.id_number, ''), '\D', '', 'g'),
               'label', nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '')) as x
       where length(regexp_replace(coalesce(c.id_number, ''), '\D', '', 'g')) >= 5
         and exists (select 1 from jsonb_array_elements(v_tf) t
                      where t->>'authority' = 'national_insurance' and coalesce(t->>'owner', 'client') = 'client'
                        and t->>'repStatus' = 'active')
      union all
      select jsonb_build_object('role', 'spouse', 'idNumber', regexp_replace(coalesce(c.spouse_id_number, ''), '\D', '', 'g'),
               'label', nullif(trim(coalesce(c.spouse_first_name, '') || ' ' || coalesce(c.spouse_last_name, '')), ''))
       where c.family_status = 'married' and c.spouse_client_id is null
         and length(regexp_replace(coalesce(c.spouse_id_number, ''), '\D', '', 'g')) >= 5
         and exists (select 1 from jsonb_array_elements(v_tf) t
                      where t->>'authority' = 'national_insurance' and t->>'owner' = 'spouse'
                        and t->>'repStatus' = 'active')) q;
    if v_input is null or jsonb_array_length(v_input) = 0 then
      if exists (select 1 from jsonb_array_elements(v_tf) t
                  where t->>'authority' = 'national_insurance' and t->>'repStatus' = 'active'
                    and length(regexp_replace(coalesce(case when t->>'owner' = 'spouse' then c.spouse_id_number
                                                            else c.id_number end, ''), '\D', '', 'g')) < 5) then
        return v_wait || jsonb_build_object('reason', 'missing_input');
      end if;
      return v_wait || jsonb_build_object('reason', 'not_represented');
    end if;
    v_input := jsonb_build_object('subjects', v_input);
  end if;

  -- ‼ «כבר נקרא השבוע» = קריאה שהצליחה. קריאה פתוחה ללקוח — לא פותחים שנייה (וזו
  -- שעצרה וצריכה אותך — ממתינה לך). קריאה שנכשלה או בוטלה — לא חוסמת חדשה.
  if exists (select 1 from public.automation_jobs j
              where j.client_id = r.client_id and j.action_type = v_type and j.status = 'needs_human') then
    return v_wait || jsonb_build_object('reason', 'open_needs_you');
  end if;
  if exists (select 1 from public.automation_jobs j
              where j.client_id = r.client_id and j.action_type = v_type and j.status in ('queued', 'running')) then
    return jsonb_build_object('state', 'already_open', 'at', now());
  end if;
  if exists (select 1 from public.automation_jobs j
              where j.client_id = r.client_id and j.action_type = v_type and j.status = 'succeeded'
                and coalesce(j.finished_at, j.created_at) > now() - interval '7 days') then
    return v_wait || jsonb_build_object('reason', 'recent_job');
  end if;
  if exists (select 1 from public.automation_jobs j
              where j.user_id = r.user_id and j.action_type = v_type
                and j.status in ('queued', 'running', 'needs_human')
                and j.input->>'reason' = 'flow_stage_opened') then
    return v_wait || jsonb_build_object('reason', 'deferred');
  end if;
  v_ready := public._flow_authority_ready(r.user_id, v_type);
  if v_ready <> 'ready' then return v_wait || jsonb_build_object('reason', v_ready); end if;

  insert into public.automation_jobs (user_id, client_id, action_type, input, status, max_attempts)
  values (r.user_id, r.client_id, v_type,
          v_input || jsonb_build_object('reason', 'flow_stage_opened', 'flowRunId', r.id,
                                        'flowItemKey', p_item->>'key'),
          'queued', 3)
  on conflict (client_id, action_type) where status in ('queued', 'running', 'needs_human') do nothing
  returning id into v_job;
  if v_job is null then return jsonb_build_object('state', 'already_open', 'at', now()); end if;
  return jsonb_build_object('state', 'queued', 'jobId', v_job, 'at', now());
exception when others then
  return v_wait || jsonb_build_object('reason', 'error', 'error', left(sqlerrm, 200));
end;
$$;

-- ── 7 · התקדמות: מתי שלב נפתח, מתי הושלם, ומה קורה אז ────────────────────
/**
 * אידמפוטנטית: מחשבת מחדש מה נפתח ומה הושלם, ורושמת כל אירוע פעם אחת
 * (state.stages.<key>.openedAt / doneAt / notifiedAt). נקראת אחרי כל צעד
 * שהסתיים בריצה, בפתיחה, בחידוש ובעדכון.
 * ‼ נועלת את שורת הריצה: שני סיומים במקביל באותה ריצה מסתדרים בתור, והשני
 * רואה את הראשון. ריצה שאינה פעילה (בעצירה, מבוטלת, הסתיימה) — לא זזה.
 * ‼ גם מתקנת: צעד נעול שכל הוריו הושלמו (מרוץ בין שני הורים) — נפתח.
 */
create or replace function public._flow_progress(p_run_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
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
            for it in select value from jsonb_array_elements(st->'items') where value->'ref'->>'kind' = 'action' loop
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
$$;

-- עטיפה בטוחה: כשל במעקב המסלול לעולם לא מפיל פעולה של לקוח או של רו"ח.
create or replace function public._flow_progress_safe(p_run_id text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if p_run_id is null then return; end if;
  perform public._flow_progress(p_run_id);
exception when others then
  begin
    insert into public.onboarding_events (user_id, step_id, engagement_id, type, actor, note, meta)
    select fr.user_id, null, fr.engagement_id, 'note', 'system', 'מעקב המסלול נכשל: ' || left(sqlerrm, 200),
           jsonb_build_object('flowRunId', fr.id, 'flowEvent', 'progress_failed')
      from public.flow_runs fr where fr.id = p_run_id;
  exception when others then null;
  end;
end;
$$;

/**
 * רשת הביטחון (נקראת מהדופק): ריצות פעילות עם צעד נעול — חישוב מחדש
 * (שכולל את התיקון); קריאה אוטומטית מול רשות שממתינה למחשב יותר מרבע
 * שעה — מבוטלת, והפריט חוזר ל«ממתין לך».
 */
create or replace function public._flow_heal_all()
returns int language plpgsql security definer set search_path to 'public' as $$
declare
  v_run text;
  n int := 0;
  j record;
begin
  for v_run in select distinct s.flow_run_id from public.onboarding_steps s
                 join public.flow_runs fr on fr.id = s.flow_run_id and fr.status = 'active'
                where s.status = 'locked' limit 200 loop
    perform public._flow_progress_safe(v_run);
    n := n + 1;
  end loop;
  for j in select id, input from public.automation_jobs
            where status = 'queued' and input->>'reason' = 'flow_stage_opened'
              and created_at < now() - interval '15 minutes' for update skip locked loop
    update public.automation_jobs set status = 'cancelled', error_code = 'auto_expired',
           error_detail = 'לא נלקחה תוך רבע שעה - חוזרת לטיפולך', finished_at = now()
     where id = j.id;
    update public.flow_runs
       set state = jsonb_set(state, array['actions', j.input->>'flowItemKey'],
                             jsonb_build_object('state', 'waiting_office', 'reason', 'auto_expired', 'at', now())),
           updated_at = now()
     where id = j.input->>'flowRunId' and state ? 'actions';
  end loop;
  return n;
end;
$$;

-- ── 8 · מנוע הבקשות הקיים: נקודות החיבור ──────────────────────────────────
/**
 * 168 + 215: (א) ריצה בעצירה/מבוטלת — הצעד נשאר נעול; (ב) צעד בשלב «לבד»
 * שנפתח — מייל מרוכז בתור; (ג) אחרי הכול — התקדמות המסלולים שנגעו, בבלוק
 * שאינו יכול להפיל את הפעולה שקראה (הגשה מהדף האישי, סימון «הושלם»).
 * ‼ שורת הריצה ננעלת לפני הבדיקה: שני הורים שמסתיימים במקביל לא משאירים
 * את הילד נעול לעד.
 */
create or replace function public.unlock_dependent_steps(p_step_id text)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  r public.onboarding_steps%rowtype;
  n int := 0;
  v_run_status text;
  v_runs text[] := '{}';
  v_src_run text;
  v_run text;
begin
  select flow_run_id into v_src_run from public.onboarding_steps where id = p_step_id;
  if v_src_run is not null then
    perform 1 from public.flow_runs where id = v_src_run for update;
    v_runs := v_runs || v_src_run;
  end if;

  for r in
    select st.* from public.onboarding_steps st
    where st.status = 'locked'
      and exists (select 1 from public.onboarding_step_dependencies d
                   where d.step_id = st.id and d.depends_on_step_id = p_step_id)
  loop
    if r.flow_run_id is not null then
      select status into v_run_status from public.flow_runs where id = r.flow_run_id;
      -- ‼ עצירה: שום שלב לא נפתח. מה שכבר בדף נשאר.
      continue when v_run_status in ('paused', 'cancelled');
    end if;
    if public.onboarding_dependency_met(r.id) then
      update public.onboarding_steps set status = 'pending' where id = r.id;
      perform public.log_onboarding_event(
        r.user_id, r.id, r.engagement_id, 'status_changed', 'system',
        'השלב נפתח - התלייה הקודמת הושלמה', jsonb_build_object('from','locked','to','pending'));
      perform public.execute_automatic_step(r.id);
      if r.flow_run_id is not null and r.published_at is not null
         and coalesce(r.payload->>'delivery', '') = 'auto' then
        perform public.enqueue_client_notice(r.client_id, 'new', now() + interval '2 minutes');
      end if;
      if r.flow_run_id is not null then v_runs := v_runs || r.flow_run_id; end if;
      n := n + 1;
    end if;
  end loop;

  for v_run in select distinct x from unnest(v_runs) x loop
    perform public._flow_progress_safe(v_run);
  end loop;
  return n;
end;
$$;

-- ── 9 · הפעלה, עצירה, חידוש, ביטול ───────────────────────────────────────
-- בעלות על ריצה: מחובר, מורשה, והריצה שלו. אחרת null.
create or replace function public._flow_owner_check(p_run_id text)
returns public.flow_runs language plpgsql stable security definer set search_path to 'public' as $$
declare r public.flow_runs%rowtype;
begin
  if auth.uid() is null or not public.is_authorized() then return null; end if;
  select * into r from public.flow_runs where id = p_run_id;
  if r.id is null or r.user_id <> auth.uid() then
    return null;
  end if;
  return r;
end;
$$;

/** קריאות אוטומטיות מול רשות שעוד לא נלקחו — מבוטלות (עצירה/ביטול של הריצה). */
create or replace function public._flow_cancel_queued_jobs(p_run_id text, p_reason text)
returns int language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  update public.automation_jobs
     set status = 'cancelled', error_code = p_reason, finished_at = now(),
         error_detail = case p_reason when 'flow_paused' then 'המסלול נעצר' else 'המסלול בוטל' end
   where status = 'queued' and input->>'flowRunId' = p_run_id and input->>'reason' = 'flow_stage_opened';
  get diagnostics n = row_count;
  return n;
end;
$$;

/**
 * הפעלת מסלול ידני/שנתי ללקוח. ‼ אידמפוטנטית: לחיצה כפולה מחזירה את אותה
 * ריצה; שנתי — ריצה אחת לכל שנה; ידני — אחת פעילה בכל פעם.
 * p_allow_auto_actions — הרו״ח אישר במפורש שפעולות «לבד» מול רשות ירוצו
 * אצל הלקוח הזה. בלי אישור — הן ממתינות לו.
 */
create or replace function public.start_flow_run(p_client_id text, p_flow_id text, p_cycle_key text default null,
  p_allow_auto_actions boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid   uuid := auth.uid();
  c       public.clients%rowtype;
  f       public.office_flows%rowtype;
  v_office uuid;
  v_cycle text;
  v_run   public.flow_runs%rowtype;
  v_mat   jsonb;
  v_existing text;
begin
  if v_uid is null or not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select * into c from public.clients where id = p_client_id for update;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select office_id into v_office from public.profiles where id = v_uid;
  select * into f from public.office_flows where id = p_flow_id and office_id = v_office;
  if f.id is null then return jsonb_build_object('ok', false, 'error', 'flow_not_found'); end if;
  if f.status <> 'active' then return jsonb_build_object('ok', false, 'error', 'flow_archived'); end if;
  if f.trigger = 'quote_approved' then return jsonb_build_object('ok', false, 'error', 'onboarding_starts_on_approval'); end if;

  if f.trigger = 'annual' then
    v_cycle := nullif(trim(coalesce(p_cycle_key, '')), '');
    if v_cycle is null or v_cycle !~ '^\d{4}$' then return jsonb_build_object('ok', false, 'error', 'bad_cycle'); end if;
  else
    select id into v_existing from public.flow_runs
     where client_id = c.id and flow_id = f.id and status in ('active', 'paused') limit 1;
    if v_existing is not null then
      return jsonb_build_object('ok', false, 'error', 'already_active', 'runId', v_existing);
    end if;
    v_cycle := 'manual:' || ((select count(*) from public.flow_runs where client_id = c.id and flow_id = f.id) + 1);
  end if;

  insert into public.flow_runs (user_id, client_id, flow_id, flow_version, cycle_key, trigger, facts, started_by,
                                engagement_id, state)
  values (c.user_id, c.id, f.id, f.current_version, v_cycle, f.trigger, public.client_flow_facts(c.id), 'accountant',
          public.current_engagement_id(c.id),
          jsonb_build_object('stages', '{}'::jsonb, 'actions', '{}'::jsonb,
                             'autoActions', coalesce(p_allow_auto_actions, false)))
  on conflict (client_id, flow_id, cycle_key) do nothing
  returning * into v_run;
  if v_run.id is null then
    select * into v_run from public.flow_runs
     where client_id = c.id and flow_id = f.id and cycle_key = v_cycle for update;
    -- ‼ שנה שבוטלה (למשל הופעלה בטעות) — מתחילה מחדש באותה ריצה, בגרסה הנוכחית:
    -- מה שהושלם בה נשאר ולא נפתח שוב; מה שבוטל נוצר מחדש. בלי זה «הפעל» החזיר
    -- «כבר פעיל» על ריצה מבוטלת ושום דבר לא נפתח.
    if v_run.status = 'cancelled' then
      update public.flow_runs
         set status = 'active', cancelled_at = null, updated_at = now(),
             flow_version = f.current_version, facts = public.client_flow_facts(c.id),
             engagement_id = public.current_engagement_id(c.id),
             state = jsonb_build_object('stages', '{}'::jsonb, 'actions', '{}'::jsonb,
                                        'autoActions', coalesce(p_allow_auto_actions, false))
       where id = v_run.id;
      v_mat := public._flow_materialize(v_run.id);
      perform public.log_onboarding_event(c.user_id, null, public.current_engagement_id(c.id), 'created', 'accountant',
        'הופעל מחדש מסלול «' || f.name || '»' || case when f.trigger = 'annual' then ' לשנת ' || v_cycle else '' end,
        jsonb_build_object('flowRunId', v_run.id, 'flowId', f.id, 'version', f.current_version, 'flowEvent', 'restarted',
                           'created', jsonb_array_length(v_mat->'created'), 'skipped', v_mat->'skipped',
                           'autoActions', coalesce(p_allow_auto_actions, false)));
      perform public._flow_progress(v_run.id);
      return jsonb_build_object('ok', true, 'restarted', true, 'runId', v_run.id,
                                'created', v_mat->'created', 'skipped', v_mat->'skipped');
    end if;
    -- שנה שהושלמה — לא «פעיל»; אין מה להפעיל.
    if v_run.status = 'done' then
      return jsonb_build_object('ok', false, 'error', 'cycle_done', 'runId', v_run.id);
    end if;
    return jsonb_build_object('ok', true, 'alreadyStarted', true, 'runId', v_run.id, 'status', v_run.status);
  end if;

  v_mat := public._flow_materialize(v_run.id);
  perform public.log_onboarding_event(c.user_id, null, v_run.engagement_id, 'created', 'accountant',
    'הופעל מסלול «' || f.name || '»' || case when f.trigger = 'annual' then ' לשנת ' || v_cycle else '' end,
    jsonb_build_object('flowRunId', v_run.id, 'flowId', f.id, 'version', f.current_version, 'flowEvent', 'started',
                       'created', jsonb_array_length(v_mat->'created'), 'skipped', v_mat->'skipped',
                       'autoActions', coalesce(p_allow_auto_actions, false)));
  perform public._flow_progress(v_run.id);
  return jsonb_build_object('ok', true, 'runId', v_run.id, 'created', v_mat->'created', 'skipped', v_mat->'skipped');
end;
$$;

create or replace function public.pause_flow_run(p_run_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  r public.flow_runs%rowtype;
  v_jobs int;
begin
  r := public._flow_owner_check(p_run_id);
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  update public.flow_runs set status = 'paused', paused_at = now(), updated_at = now()
   where id = r.id and status = 'active';
  if not found then return jsonb_build_object('ok', false, 'error', 'not_active', 'status', r.status); end if;
  v_jobs := public._flow_cancel_queued_jobs(r.id, 'flow_paused');
  perform public.log_onboarding_event(r.user_id, null, r.engagement_id, 'note', 'accountant',
    'המסלול נעצר - שום שלב לא ייפתח ושום מייל לא ייצא לבד', jsonb_build_object('flowRunId', r.id, 'flowEvent', 'paused'));
  return jsonb_build_object('ok', true, 'cancelledJobs', v_jobs);
end;
$$;

/**
 * חידוש: מה שהתעכב קורה עכשיו — צעדים שתלותם הושלמה נפתחים (כולל משימות
 * אוטומטיות שנדחו בגלל העצירה), השלבים מחושבים מחדש, ומייל מרוכז אחד.
 */
create or replace function public.resume_flow_run(p_run_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  r public.flow_runs%rowtype;
  s record;
  n int := 0;
begin
  r := public._flow_owner_check(p_run_id);
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  perform 1 from public.onboarding_steps where flow_run_id = r.id
     and status not in ('completed', 'verified', 'skipped', 'cancelled') order by id for update;
  update public.flow_runs set status = 'active', resumed_at = now(), updated_at = now()
   where id = r.id and status = 'paused';
  if not found then return jsonb_build_object('ok', false, 'error', 'not_paused', 'status', r.status); end if;

  select count(*) into n from public.onboarding_steps
   where flow_run_id = r.id and status = 'locked' and public.onboarding_dependency_met(id);
  -- הפתיחה עצמה — בחישוב ההתקדמות (אותה לוגיקה, פעם אחת).
  perform public._flow_progress(r.id);
  for s in select id from public.onboarding_steps
            where flow_run_id = r.id and status in ('pending', 'in_progress')
              and payload->'autoAction'->>'kind' = 'email' and payload->>'autoExecutedAt' is null loop
    perform public.execute_automatic_step(s.id);
  end loop;
  perform public.log_onboarding_event(r.user_id, null, r.engagement_id, 'note', 'accountant',
    'המסלול חודש', jsonb_build_object('flowRunId', r.id, 'flowEvent', 'resumed', 'unlocked', n));
  -- ‼ גם מה שכבר היה פתוח בשלב «לבד» ולא נמסר בזמן העצירה — במייל אחד.
  if exists (select 1 from public.onboarding_steps st
               left join public.client_step_notice_state ns on ns.step_id = st.id
              where st.flow_run_id = r.id and coalesce(st.payload->>'delivery', '') = 'auto'
                and st.client_content_version > coalesce(ns.announced_version, 0) and st.published_at is not null
                and st.status not in ('completed', 'verified', 'skipped', 'cancelled', 'locked')) then
    perform public.enqueue_client_notice(r.client_id, 'new', now() + interval '2 minutes');
  end if;
  return jsonb_build_object('ok', true, 'unlocked', n);
end;
$$;

-- סוגים שהם השתקפות של ישות אחרת — ביטול ריצה לא נוגע בהם (יש להם ביטול משלהם).
create or replace function public._flow_projection_step(p_step_type text, p_payload jsonb)
returns boolean language sql immutable set search_path to 'public' as $$
  select p_step_type in ('representation', 'authority_representation', 'rep_client_approval',
                         'intake_questionnaire', 'representation_upgrade')
      or p_payload ? 'smartForm' or p_payload ? 'shaamIdentity' or p_payload ? 'identityDocs'
      or coalesce(p_payload->>'identityRequest', '') <> '';
$$;

/**
 * ביטול ריצה: מה שפתוח יורד מהדף, מה שהושלם נשאר בהיסטוריה, ולא יוצא מייל.
 * ‼ הריצה מסומנת מבוטלת **לפני** ביטול הצעדים — אחרת כל ביטול היה פותח את
 * הצעד הבא, מסמן שלב «הושלם» ושולח הודעה. בקשות שהן השתקפות (ייצוג, ב"ל
 * לאדם, טופס חכם…) נשארות, מנותקות מהריצה ומשוחררות משער השלב — לכל אחת
 * מסלול ביטול משלה (למשל cancel_authority_representation לבן/בת זוג בב"ל).
 */
create or replace function public.cancel_flow_run(p_run_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  r      public.flow_runs%rowtype;
  s      public.onboarding_steps%rowtype;
  n      int := 0;
  v_kept jsonb := '[]'::jsonb;
  v_jobs int;
begin
  r := public._flow_owner_check(p_run_id);
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  -- ‼ סדר הנעילות של השלמת בקשה: קודם הבקשה, אחר כך הריצה. בסדר הפוך — קיפאון.
  perform 1 from public.onboarding_steps where flow_run_id = r.id
     and status not in ('completed', 'verified', 'skipped', 'cancelled') order by id for update;
  update public.flow_runs set status = 'cancelled', cancelled_at = now(), updated_at = now()
   where id = r.id and status in ('active', 'paused');
  if not found then return jsonb_build_object('ok', false, 'error', 'not_running', 'status', r.status); end if;
  v_jobs := public._flow_cancel_queued_jobs(r.id, 'flow_cancelled');

  for s in select * from public.onboarding_steps
            where flow_run_id = r.id and status not in ('completed', 'verified', 'skipped', 'cancelled') loop
    if public._flow_projection_step(s.step_type, s.payload) then
      delete from public.onboarding_step_dependencies where step_id = s.id and origin = 'flow';
      update public.onboarding_steps
         set flow_run_id = null, flow_stage_key = null, flow_item_key = null,
             payload = payload || jsonb_build_object('detachedFromFlowRun', r.id),
             status = case when status = 'locked' and public.onboarding_dependency_met(id) then 'pending' else status end
       where id = s.id;
      v_kept := v_kept || jsonb_build_object('stepId', s.id, 'stepType', s.step_type,
        'title', public._client_step_title(s.step_type, s.payload));
      continue;
    end if;
    update public.onboarding_steps
       set pending_cancel = false, draft_payload = null,
           payload = payload || jsonb_build_object('cancelledBy', 'flow_run')
     where id = s.id;
    perform public._set_step_status(s.id, 'cancelled', 'accountant', 'המסלול בוטל',
      jsonb_build_object('flowRunId', r.id));
    n := n + 1;
  end loop;

  perform public.log_onboarding_event(r.user_id, null, r.engagement_id, 'note', 'accountant',
    'המסלול בוטל - ' || n || ' בקשות ירדו מהדף',
    jsonb_build_object('flowRunId', r.id, 'flowEvent', 'cancelled', 'cancelled', n, 'kept', v_kept,
                       'cancelledJobs', v_jobs));
  return jsonb_build_object('ok', true, 'cancelled', n, 'kept', v_kept, 'cancelledJobs', v_jobs);
end;
$$;

-- ── 10 · התאמה ללקוח, עדכון גרסה, הצעות ───────────────────────────────────
/**
 * בקשה שנוספה ללקוח הזה (מכל מקום) משויכת לשלב בריצה: אותן קשתות כמו
 * לאחיותיה, ואותו «איך מגיע ללקוח». ‼ תוספת לשלב «לבד» שכבר נמסר נכנסת
 * לתור — והמגש מציע «שלח עכשיו» או «אל תשלח לבד».
 */
create or replace function public.attach_step_to_flow_stage(p_step_id text, p_run_id text, p_stage_key text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  r     public.flow_runs%rowtype;
  s     public.onboarding_steps%rowtype;
  v_def jsonb;
  st    jsonb;
begin
  r := public._flow_owner_check(p_run_id);
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if r.status not in ('active', 'paused') then return jsonb_build_object('ok', false, 'error', 'not_running'); end if;
  select * into s from public.onboarding_steps where id = p_step_id and client_id = r.client_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if s.flow_run_id is not null and s.flow_run_id <> r.id then return jsonb_build_object('ok', false, 'error', 'in_other_run'); end if;
  v_def := public._flow_def(r.flow_id, r.flow_version);
  select x into st from jsonb_array_elements(v_def->'stages') x where x->>'key' = p_stage_key;
  if st is null then return jsonb_build_object('ok', false, 'error', 'stage_not_found'); end if;

  update public.onboarding_steps
     set flow_run_id = r.id, flow_stage_key = p_stage_key,
         flow_item_key = coalesce(flow_item_key, 'adhoc-' || s.id),
         payload = payload || jsonb_build_object('delivery', coalesce(st->>'delivery', 'approve'))
                   || case when jsonb_typeof(st->'reminder') = 'object'
                           then jsonb_build_object('reminder', st->'reminder') else '{}'::jsonb end
   where id = s.id;
  perform public._flow_add_parents(s.id, public._flow_gate_steps(r.id, v_def, st->'opens'));
  -- ‼ שלב שעוד לא הושלם: הבקשה המאוחרת מחזיקה גם את מה שנפתח אחריו (כמו פריט מקורי
  --   בשלב) — ישירות, וגם דרך שלב ריק/שלא חל/שכולו רשות (_flow_gate_steps עובר דרכו).
  if (r.state->'stages'->p_stage_key->>'doneAt') is null then
    perform public._flow_rearc_locked(r.id);
  end if;
  select * into s from public.onboarding_steps where id = s.id;
  if r.status = 'active' and st->>'delivery' = 'auto' and s.status <> 'locked' and s.published_at is not null then
    perform public.enqueue_client_notice(r.client_id, 'new', now() + interval '2 minutes');
  end if;
  return jsonb_build_object('ok', true, 'status', s.status);
end;
$$;

/** «＋ בקשה ללקוח הזה» מתוך המסלול: פריטים מגרסת הריצה, לאנשים שנבחרו. */
create or replace function public.flow_run_add_items(p_run_id text, p_item_keys text[], p_roles text[] default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  r     public.flow_runs%rowtype;
  v_mat jsonb;
  v_cf  jsonb;
begin
  r := public._flow_owner_check(p_run_id);
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if r.status not in ('active', 'paused') then return jsonb_build_object('ok', false, 'error', 'not_running'); end if;
  perform 1 from public.onboarding_steps where flow_run_id = r.id
     and status not in ('completed', 'verified', 'skipped', 'cancelled') order by id for update;
  -- עובדות עדכניות (למשל נישואים) — כדי שפריט «לכל אדם» יכיר את בן/בת הזוג.
  -- ‼ 217: הסוג לא מתעדכן — חוץ מסוג שהיה ריק (לא ידוע) ונקבע מאז בכרטיס.
  v_cf := public.client_flow_facts(r.client_id, r.engagement_id);
  update public.flow_runs
     set facts = facts || (v_cf - 'kind' - 'monthly' - 'paperless' - 'rep' - 'new_business')
                 || case when nullif(coalesce(facts->>'kind', ''), '') is null and nullif(coalesce(v_cf->>'kind', ''), '') is not null
                         then jsonb_build_object('kind', v_cf->>'kind') else '{}'::jsonb end
   where id = r.id;
  select * into r from public.flow_runs where id = r.id;
  v_mat := public._flow_materialize(r.id, p_item_keys, p_roles);
  perform public.log_onboarding_event(r.user_id, null, r.engagement_id, 'note', 'accountant',
    'נוספו בקשות למסלול ללקוח הזה', jsonb_build_object('flowRunId', r.id, 'flowEvent', 'items_added',
      'created', v_mat->'created', 'skipped', v_mat->'skipped'));
  perform public._flow_progress_safe(r.id);
  if r.status = 'active' and exists (
       select 1 from jsonb_array_elements(v_mat->'created') x
         join public.onboarding_steps s on s.id = x->>'stepId'
        where coalesce(s.payload->>'delivery', '') = 'auto' and s.status <> 'locked' and s.published_at is not null) then
    perform public.enqueue_client_notice(r.client_id, 'new', now() + interval '2 minutes');
  end if;
  return jsonb_build_object('ok', true, 'created', v_mat->'created', 'skipped', v_mat->'skipped');
end;
$$;

/** ההבדלים בין גרסת הריצה לגרסה הנוכחית, כפי שהם חלים על הלקוח הזה. לא כותבת. */
create or replace function public.flow_run_upgrade_preview(p_run_id text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  r      public.flow_runs%rowtype;
  f      public.office_flows%rowtype;
  v_old  jsonb;
  v_new  jsonb;
  v_facts jsonb;
  v_cf   jsonb;
  v_added jsonb := '[]'::jsonb;
  v_removed jsonb := '[]'::jsonb;
  v_changed jsonb := '[]'::jsonb;
  v_stage_changes jsonb := '[]'::jsonb;
  st     jsonb;
  it     jsonb;
  v_old_it jsonb;
  v_old_st jsonb;
  v_what text[];
  v_spec jsonb;
  v_why  text;
begin
  r := public._flow_owner_check(p_run_id);
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select * into f from public.office_flows where id = r.flow_id;
  if f.current_version <= r.flow_version then
    return jsonb_build_object('ok', true, 'upToDate', true, 'from', r.flow_version, 'to', f.current_version);
  end if;
  v_old := public._flow_def(r.flow_id, r.flow_version);
  v_new := public._flow_def(r.flow_id, f.current_version);
  -- ‼ 217: הסוג לא מתעדכן — חוץ מסוג שהיה ריק (לא ידוע) ונקבע מאז בכרטיס.
  v_cf := public.client_flow_facts(r.client_id, r.engagement_id);
  v_facts := r.facts || (v_cf - 'kind' - 'monthly' - 'paperless' - 'rep' - 'new_business')
             || case when nullif(coalesce(r.facts->>'kind', ''), '') is null and nullif(coalesce(v_cf->>'kind', ''), '') is not null
                     then jsonb_build_object('kind', v_cf->>'kind') else '{}'::jsonb end;

  for st in select value from jsonb_array_elements(v_new->'stages') loop
    for it in select value from jsonb_array_elements(st->'items') loop
      select x, s into v_old_it, v_old_st from jsonb_array_elements(v_old->'stages') s, jsonb_array_elements(s->'items') x
       where x->>'key' = it->>'key' limit 1;
      if v_old_it is null then
        -- ‼ מה שהשרת לא ייצור (בקשה ריקה בספרייה, סוג שלא חוזר) — לא מסומן מראש ולא מובטח.
        v_why := null;
        if it->'ref'->>'kind' in ('template', 'document') then
          v_spec := public._flow_item_spec(r.user_id, it, r.trigger <> 'quote_approved');
          if not coalesce((v_spec->>'ok')::boolean, false) then
            v_why := v_spec->>'reason';
          elsif v_spec->>'stepType' = 'custom_request' and coalesce(v_spec->>'owner', 'client') = 'client' then
            v_why := public.validate_requirements(v_spec->'payload'->'requirements');
          end if;
        end if;
        v_added := v_added || jsonb_build_object(
          'stageKey', st->>'key', 'stageName', st->>'name', 'itemKey', it->>'key', 'ref', it->'ref',
          'applies', public._flow_when_matches_kind(st->'when', v_facts) and public._flow_when_matches_kind(it->'when', v_facts),
          'stageOpen', (r.state->'stages'->(st->>'key')->>'openedAt') is not null,
          'action', it->'ref'->>'kind' = 'action', 'mode', coalesce(it->>'mode', 'manual'),
          'fixed', coalesce(it->>'fixed', 'false') = 'true',
          -- ‼ בקשת מערכת בקליטה נוצרת רק במחולל, באישור ההצעה — ללקוחות חדשים בלבד.
          'addable', coalesce(it->>'fixed', 'false') <> 'true'
                     and not (r.trigger = 'quote_approved' and it->'ref'->>'kind' = 'system')
                     and v_why is null,
          'notAddableReason', v_why);
      elsif (v_old_it - 'key') is distinct from (it - 'key') or v_old_st->>'key' <> st->>'key' then
        -- ‼ מה השתנה — כי חלק מזה חל מיד גם על מה שכבר נפתח (חובה/רשות, «אחרי», העברה
        -- לשלב אחר קובעים מתי שלב נסגר ונפתח). התוכן של בקשה שנוצרה — לא משתנה.
        v_what := '{}';
        if v_old_st->>'key' <> st->>'key' then v_what := array_append(v_what, 'moved'::text); end if;
        if coalesce(v_old_it->>'optional', 'false') <> coalesce(it->>'optional', 'false') then
          v_what := array_append(v_what, case when coalesce(it->>'optional', 'false') = 'true' then 'now_optional' else 'now_required' end);
        end if;
        if coalesce(v_old_it->>'after', '') <> coalesce(it->>'after', '') then v_what := array_append(v_what, 'after'::text); end if;
        if (v_old_it->'when') is distinct from (it->'when') then v_what := array_append(v_what, 'when'::text); end if;
        if coalesce(v_old_it->>'mode', 'manual') <> coalesce(it->>'mode', 'manual') then v_what := array_append(v_what, 'mode'::text); end if;
        if coalesce(v_old_it->>'perPerson', 'false') <> coalesce(it->>'perPerson', 'false') then v_what := array_append(v_what, 'perPerson'::text); end if;
        if coalesce(v_old_it->>'dueInDays', '') <> coalesce(it->>'dueInDays', '') then v_what := array_append(v_what, 'due'::text); end if;
        if (v_old_it->'ref') is distinct from (it->'ref') or (v_old_it->'variants') is distinct from (it->'variants') then
          v_what := array_append(v_what, 'content'::text);
        end if;
        v_changed := v_changed || jsonb_build_object('itemKey', it->>'key', 'ref', it->'ref', 'stageName', st->>'name',
          'fromStageName', case when v_old_st->>'key' <> st->>'key' then v_old_st->>'name' end,
          'what', to_jsonb(v_what));
      end if;
      v_old_it := null;
      v_old_st := null;
    end loop;
  end loop;

  for st in select value from jsonb_array_elements(v_old->'stages') loop
    for it in select value from jsonb_array_elements(st->'items') loop
      if not exists (select 1 from jsonb_array_elements(v_new->'stages') s, jsonb_array_elements(s->'items') x
                      where x->>'key' = it->>'key') then
        v_removed := v_removed || jsonb_build_object('itemKey', it->>'key', 'ref', it->'ref', 'stageName', st->>'name',
          'steps', coalesce((select jsonb_agg(jsonb_build_object('stepId', s.id, 'status', s.status,
                                     'title', public._client_step_title(s.step_type, s.payload),
                                     -- הושלמה — היסטוריה; השתקפות — יש לה ביטול משלה. רק פתוחה רגילה ניתנת לדילוג.
                                     'canSkip', s.status not in ('completed', 'verified', 'skipped', 'cancelled')
                                                and not public._flow_projection_step(s.step_type, s.payload)))
                               from public.onboarding_steps s
                              where s.flow_run_id = r.id and s.flow_item_key = it->>'key' and s.status <> 'cancelled'), '[]'::jsonb));
      end if;
    end loop;
  end loop;

  -- שינויים בשלב עצמו — חלים על הריצה מהעדכון (מתי נפתח, איך מגיע, תזכורת, הודעה אליך).
  for st in select value from jsonb_array_elements(v_new->'stages') loop
    select s into v_old_st from jsonb_array_elements(v_old->'stages') s where s->>'key' = st->>'key' limit 1;
    continue when v_old_st is null;
    v_what := '{}';
    if coalesce(v_old_st->>'name', '') <> coalesce(st->>'name', '') then v_what := array_append(v_what, 'name'::text); end if;
    if (v_old_st->'opens') is distinct from (st->'opens') then v_what := array_append(v_what, 'opens'::text); end if;
    if (v_old_st->'when') is distinct from (st->'when') then v_what := array_append(v_what, 'when'::text); end if;
    if coalesce(v_old_st->>'delivery', '') <> coalesce(st->>'delivery', '') then v_what := array_append(v_what, 'delivery'::text); end if;
    if (v_old_st->'reminder') is distinct from (st->'reminder') then v_what := array_append(v_what, 'reminder'::text); end if;
    if coalesce(v_old_st->>'notifyOffice', 'false') <> coalesce(st->>'notifyOffice', 'false') then v_what := array_append(v_what, 'notifyOffice'::text); end if;
    if cardinality(v_what) > 0 then
      v_stage_changes := v_stage_changes || jsonb_build_object('stageKey', st->>'key', 'stageName', st->>'name',
        'fromName', case when 'name' = any (v_what) then v_old_st->>'name' end, 'what', to_jsonb(v_what));
    end if;
    v_old_st := null;
  end loop;

  return jsonb_build_object('ok', true, 'upToDate', false, 'from', r.flow_version, 'to', f.current_version,
    'added', v_added, 'removed', v_removed, 'changed', v_changed, 'stageChanges', v_stage_changes);
end;
$$;

/**
 * עדכון הלקוח לגרסה הנוכחית — רק מה שבחרו. ‼ לא מוחק כלום לבד: פריט שירד
 * מהמסלול מדולג רק אם סומן; פריט שהשתנה לא נוגע בבקשה שכבר נוצרה.
 * ההבדלים נרשמים ביומן.
 */
create or replace function public.flow_run_upgrade_apply(p_run_id text, p_to_version int,
  p_add_item_keys text[] default '{}', p_skip_step_ids text[] default '{}')
returns jsonb language plpgsql security definer set search_path to 'public' as $$
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
$$;

/**
 * הצעות כשנתוני הלקוח השתנו (למשל נישואים): מה חל עכשיו ואין לו בקשה, ומה
 * פתוח ואינו חל עוד. ‼ רק מציעה — §9: אין אוטומציה על שינוי מצב משפחתי.
 */
create or replace function public.flow_run_suggestions(p_run_id text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  r     public.flow_runs%rowtype;
  v_def jsonb;
  v_now jsonb;
  v_cf  jsonb;
  st    jsonb;
  it    jsonb;
  v_out jsonb := '[]'::jsonb;
  v_applies boolean;
  v_has boolean;
begin
  r := public._flow_owner_check(p_run_id);
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if r.status not in ('active', 'paused') then return jsonb_build_object('ok', true, 'suggestions', '[]'::jsonb); end if;
  v_def := public._flow_def(r.flow_id, r.flow_version);
  -- ‼ 217: הסוג לא מתעדכן — חוץ מסוג שהיה ריק (לא ידוע) ונקבע מאז בכרטיס. פריט שחיכה לו
  -- (kind_unknown) מוצע עכשיו להוספה — לא נוצר לבד (§12.4 #7).
  v_cf := public.client_flow_facts(r.client_id, r.engagement_id);
  v_now := r.facts || (v_cf - 'kind' - 'monthly' - 'paperless' - 'rep' - 'new_business')
             || case when nullif(coalesce(r.facts->>'kind', ''), '') is null and nullif(coalesce(v_cf->>'kind', ''), '') is not null
                     then jsonb_build_object('kind', v_cf->>'kind') else '{}'::jsonb end;

  for st in select value from jsonb_array_elements(v_def->'stages') loop
    for it in select value from jsonb_array_elements(st->'items') loop
      continue when coalesce(it->>'fixed', 'false') = 'true' or it->'ref'->>'kind' = 'action';
      -- בקשת מערכת בקליטה — נוצרת רק במחולל; כאן אין מה להציע.
      continue when r.trigger = 'quote_approved' and it->'ref'->>'kind' = 'system';
      v_applies := public._flow_when_matches_kind(st->'when', v_now) and public._flow_when_matches_kind(it->'when', v_now);
      select exists (select 1 from public.onboarding_steps s
                      where s.flow_run_id = r.id and s.flow_item_key = it->>'key' and s.status <> 'cancelled')
        into v_has;
      if v_applies and not v_has
         and not (public._flow_when_matches_kind(st->'when', r.facts) and public._flow_when_matches_kind(it->'when', r.facts)) then
        v_out := v_out || jsonb_build_object('kind', 'add', 'itemKey', it->>'key', 'ref', it->'ref', 'stageName', st->>'name');
      elsif not v_applies and v_has then
        v_out := v_out || jsonb_build_object('kind', 'not_needed', 'itemKey', it->>'key', 'ref', it->'ref', 'stageName', st->>'name',
          'steps', (select jsonb_agg(s.id) from public.onboarding_steps s
                     where s.flow_run_id = r.id and s.flow_item_key = it->>'key'
                       and s.status not in ('completed', 'verified', 'skipped', 'cancelled')));
      end if;
      -- בן/בת זוג חדש/ה ⇒ פריט «לכל אדם» שאין לו עדיין צעד לבן/בת הזוג.
      if v_applies and coalesce(it->>'perPerson', 'false') = 'true'
         and coalesce((v_now->>'hasSpouse')::boolean, false)
         and not exists (select 1 from public.onboarding_steps s
                          where s.flow_run_id = r.id and s.flow_item_key = it->>'key'
                            and s.payload->>'subjectRole' = 'spouse' and s.status <> 'cancelled') then
        v_out := v_out || jsonb_build_object('kind', 'add_person', 'itemKey', it->>'key', 'ref', it->'ref',
          'stageName', st->>'name', 'role', 'spouse', 'name', v_now->>'spouseFirstName',
          -- ‼ אישור אישי ⇒ ייפתחו משימה למשרד (ובקשה בדף רק לשאר הפריטים) — המסך אומר את זה.
          'personalConfirm', public._flow_has_personal_confirm(
            (public._flow_item_spec(r.user_id, it, r.trigger <> 'quote_approved'))->'payload'),
          -- יש בה גם קבצים/פרטים ⇒ החלק הזה נפתח בדף של בעל הכרטיס בשם בן/בת הזוג (_flow_materialize).
          'pagePart', coalesce((select bool_or(x->>'kind' <> 'confirm')
                                  from jsonb_array_elements(case when jsonb_typeof(
                                         (public._flow_item_spec(r.user_id, it, r.trigger <> 'quote_approved'))->'payload'->'requirements') = 'array'
                                       then (public._flow_item_spec(r.user_id, it, r.trigger <> 'quote_approved'))->'payload'->'requirements'
                                       else '[]'::jsonb end) x), false));
      end if;
    end loop;
  end loop;
  return jsonb_build_object('ok', true, 'suggestions', v_out);
end;
$$;

-- ── 11 · מה רואים: מסלולי המשרד, וריצות אצל לקוח ──────────────────────────
create or replace function public.get_office_flows()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_office uuid;
begin
  if v_uid is null or not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select office_id into v_office from public.profiles where id = v_uid;
  return jsonb_build_object('ok', true, 'flows', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.id, 'name', f.name, 'trigger', f.trigger, 'status', f.status,
      'currentVersion', f.current_version, 'seedKey', f.seed_key, 'updatedAt', f.updated_at,
      'definition', (select v.definition from public.office_flow_versions v where v.flow_id = f.id and v.version = f.current_version),
      'versions', (select jsonb_agg(jsonb_build_object('version', v.version, 'note', v.note, 'createdAt', v.created_at) order by v.version desc)
                     from public.office_flow_versions v where v.flow_id = f.id),
      'runsByVersion', (select jsonb_object_agg(x.flow_version::text, x.n)
                          from (select flow_version, count(*) n from public.flow_runs
                                 where flow_id = f.id and status in ('active', 'paused') group by flow_version) x),
      'activeRuns', (select count(*) from public.flow_runs where flow_id = f.id and status in ('active', 'paused')))
      order by (f.trigger = 'quote_approved') desc, f.created_at)
      from public.office_flows f where f.office_id = v_office and f.status = 'active'), '[]'::jsonb));
end;
$$;

/** הריצות אצל לקוח, עם מצב כל שלב ומה ממתין ולמי — לרצועה בלשונית «בקשות». */
create or replace function public.get_client_flow_runs(p_client_id text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
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
          where coalesce(it->>'fixed', 'false') <> 'true' and coalesce(it->'ref'->>'kind', '') <> 'action'
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
                      from jsonb_array_elements(st->'items') it where it->'ref'->>'kind' = 'action'))
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
$$;

-- ── 12 · הגדרת מסלולים במשרד ─────────────────────────────────────────────
create or replace function public.create_office_flow(p_name text, p_trigger text, p_definition jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_office uuid;
  v_err text;
  v_id  text;
begin
  if v_uid is null or not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select office_id into v_office from public.profiles where id = v_uid;
  if v_office is null then return jsonb_build_object('ok', false, 'error', 'no_office'); end if;
  if coalesce(trim(p_name), '') = '' then return jsonb_build_object('ok', false, 'error', 'missing_name'); end if;
  if p_trigger not in ('manual', 'annual') then return jsonb_build_object('ok', false, 'error', 'bad_trigger'); end if;
  v_err := public.flow_definition_error(p_definition, p_trigger);
  if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err); end if;
  insert into public.office_flows (office_id, name, trigger, current_version, created_by)
  values (v_office, trim(p_name), p_trigger, 1, v_uid) returning id into v_id;
  insert into public.office_flow_versions (flow_id, version, definition, note, created_by)
  values (v_id, 1, p_definition, 'נוצר', v_uid);
  return jsonb_build_object('ok', true, 'flowId', v_id, 'version', 1);
end;
$$;

/**
 * שמירה = גרסה חדשה. ‼ ריצות קיימות נשארות על הגרסה שבה התחילו.
 * במסלול הקליטה נשמרות באותה פעולה גם חמש הרשימות שהמחולל קורא (p_compiled),
 * כדי שלא יהיה רגע שבו המסלול והמחולל אינם מסכימים.
 */
create or replace function public.save_office_flow(p_flow_id text, p_base_version int, p_definition jsonb,
  p_name text default null, p_note text default null, p_compiled jsonb default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_office uuid;
  f     public.office_flows%rowtype;
  v_err text;
  v_kind text;
  v_new int;
begin
  if v_uid is null or not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select office_id into v_office from public.profiles where id = v_uid;
  select * into f from public.office_flows where id = p_flow_id and office_id = v_office for update;
  if f.id is null then return jsonb_build_object('ok', false, 'error', 'flow_not_found'); end if;
  if p_base_version is distinct from f.current_version then
    return jsonb_build_object('ok', false, 'error', 'version_conflict', 'current', f.current_version);
  end if;
  v_err := public.flow_definition_error(p_definition, f.trigger);
  if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err); end if;

  if f.trigger = 'quote_approved' then
    if p_compiled is null or jsonb_typeof(p_compiled) <> 'object' then
      return jsonb_build_object('ok', false, 'error', 'missing_compiled');
    end if;
    for v_kind in select unnest(array['exempt_dealer', 'licensed_dealer', 'company', 'tax_refund', 'representation_only']) loop
      if jsonb_typeof(p_compiled->v_kind) <> 'array' then
        return jsonb_build_object('ok', false, 'error', 'missing_compiled', 'kind', v_kind);
      end if;
    end loop;
  end if;

  v_new := f.current_version + 1;
  insert into public.office_flow_versions (flow_id, version, definition, note, created_by)
  values (f.id, v_new, p_definition, nullif(trim(coalesce(p_note, '')), ''), v_uid);
  update public.office_flows
     set current_version = v_new, name = coalesce(nullif(trim(coalesce(p_name, '')), ''), name), updated_at = now()
   where id = f.id;

  if f.trigger = 'quote_approved' then
    for v_kind in select unnest(array['exempt_dealer', 'licensed_dealer', 'company', 'tax_refund', 'representation_only']) loop
      insert into public.office_journey_defaults (office_id, client_kind, entries)
      values (v_office, v_kind, p_compiled->v_kind)
      on conflict (office_id, client_kind) do update set entries = excluded.entries, updated_at = now();
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'version', v_new);
end;
$$;

create or replace function public.archive_office_flow(p_flow_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_office uuid;
  f public.office_flows%rowtype;
begin
  if v_uid is null or not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select office_id into v_office from public.profiles where id = v_uid;
  select * into f from public.office_flows where id = p_flow_id and office_id = v_office;
  if f.id is null then return jsonb_build_object('ok', false, 'error', 'flow_not_found'); end if;
  if f.trigger = 'quote_approved' then return jsonb_build_object('ok', false, 'error', 'onboarding_cannot_archive'); end if;
  update public.office_flows set status = 'archived', updated_at = now() where id = f.id;
  return jsonb_build_object('ok', true,
    'activeRuns', (select count(*) from public.flow_runs where flow_id = f.id and status in ('active', 'paused')));
end;
$$;

-- ── 13 · ספרייה: בקשות של המשרד ──────────────────────────────────────────
/**
 * יצירה/עדכון של בקשה בספרייה (journey_templates kind='request' של המשרד).
 * ‼ מובנית (office_id null) אינה נכתבת — עדכון שלה יוצר עותק של המשרד, כמו
 * update_request_template (168).
 */
create or replace function public.upsert_library_request(p_template_id text, p_name text, p_description text,
  p_entry jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_office uuid;
  t public.journey_templates%rowtype;
  v_err text;
  v_entry jsonb;
  v_id text;
  v_owner text;
begin
  if v_uid is null or not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select office_id into v_office from public.profiles where id = v_uid;
  if v_office is null then return jsonb_build_object('ok', false, 'error', 'no_office'); end if;
  if coalesce(trim(p_name), '') = '' then return jsonb_build_object('ok', false, 'error', 'missing_name'); end if;
  if p_entry is null or jsonb_typeof(p_entry->'payload') <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'missing_payload');
  end if;
  if not (coalesce(p_entry->>'stepType', 'custom_request') = any (public.request_creatable_step_types())) then
    return jsonb_build_object('ok', false, 'error', 'step_type_not_allowed');
  end if;
  v_owner := coalesce(nullif(p_entry->>'owner', ''), 'client');
  if v_owner not in ('client', 'me', 'external') then return jsonb_build_object('ok', false, 'error', 'bad_owner'); end if;
  if coalesce(p_entry->>'stepType', 'custom_request') = 'custom_request' and v_owner = 'client' then
    v_err := public.validate_requirements(p_entry->'payload'->'requirements');
    if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err); end if;
  end if;
  -- בקשת מסמכים בלי רשימה מדולגת במסלול שחוזר (_flow_item_spec) — לא נשמרת כך בספרייה.
  if p_entry->>'stepType' = 'client_documents'
     and (jsonb_typeof(p_entry->'payload'->'checklist') is distinct from 'array'
          or jsonb_array_length(p_entry->'payload'->'checklist') = 0) then
    return jsonb_build_object('ok', false, 'error', 'no_documents');
  end if;
  v_entry := jsonb_strip_nulls(jsonb_build_object(
    'key', 'e1', 'stepType', coalesce(p_entry->>'stepType', 'custom_request'), 'owner', v_owner,
    -- ‼ 217 (D): «המשרד» נבחר במפורש — נשאר משימה של המשרד גם כשיש בה «מה צריך לעשות»
    -- (_template_entry_owner). בלי הסימון בעלים 'me' עם פריטים נקרא כבקשה ללקוח.
    'officeTask', case when v_owner = 'me' then true end,
    'requiredForClose', coalesce((p_entry->>'requiredForClose')::boolean, true),
    'payload', public.template_payload_from_step(p_entry->'payload')));

  if p_template_id is not null then
    select * into t from public.journey_templates where id = p_template_id and kind = 'request';
    if t.id is null then return jsonb_build_object('ok', false, 'error', 'template_not_found'); end if;
    if t.office_id is not null and t.office_id <> v_office then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  end if;

  if t.id is not null and t.office_id = v_office then
    -- ‼ 216: הסימון הפנימי של בקשה שהועברה מ«בקשות ללקוח חדש» (migratedFrom) נשמר בעריכה —
    -- בלעדיו מסלול קליטה שנבנה מחדש היה מעביר אותה שוב, כבקשה כפולה בספרייה.
    update public.journey_templates
       set name = trim(p_name), description = nullif(trim(coalesce(p_description, '')), ''),
           entries = jsonb_build_array(v_entry || jsonb_strip_nulls(jsonb_build_object('migratedFrom', t.entries->0->'migratedFrom'))),
           updated_at = now()
     where id = t.id;
    return jsonb_build_object('ok', true, 'templateId', t.id);
  end if;
  insert into public.journey_templates (user_id, office_id, kind, name, description, entries, seed_key)
  values (v_uid, v_office, 'request', trim(p_name), nullif(trim(coalesce(p_description, '')), ''),
          jsonb_build_array(v_entry), t.seed_key)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    -- עותק המשרד של מובנית כבר קיים ⇒ מעדכנים אותו.
    update public.journey_templates
       set name = trim(p_name), description = nullif(trim(coalesce(p_description, '')), ''),
           entries = jsonb_build_array(v_entry), updated_at = now()
     where office_id = v_office and seed_key = t.seed_key
    returning id into v_id;
  end if;
  return jsonb_build_object('ok', true, 'templateId', v_id, 'copiedFromSeed', t.office_id is null and t.id is not null);
end;
$$;

/** מחיקה מהספרייה — רק כשאינה בשימוש בגרסה הנוכחית של מסלול פעיל. */
create or replace function public.delete_library_request(p_template_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_office uuid;
  t public.journey_templates%rowtype;
  v_used jsonb;
begin
  if v_uid is null or not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select office_id into v_office from public.profiles where id = v_uid;
  select * into t from public.journey_templates where id = p_template_id and kind = 'request';
  if t.id is null or t.office_id is null or t.office_id <> v_office then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select jsonb_agg(distinct f.name) into v_used
    from public.office_flows f
    join public.office_flow_versions v on v.flow_id = f.id and v.version = f.current_version
   where f.office_id = v_office and f.status = 'active'
     and exists (select 1 from jsonb_array_elements(v.definition->'stages') s, jsonb_array_elements(s->'items') i
                  where i->'ref'->>'templateId' = t.id);
  if v_used is not null then return jsonb_build_object('ok', false, 'error', 'in_use', 'flows', v_used); end if;
  delete from public.journey_templates where id = t.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── 13a · בקשה שנשמרת לספרייה לא נושאת איתה את הריצה ─────────────────────
-- 111 + 215: delivery/reminder/flowOrigin/נושא/סיבת דילוג שייכים לבקשה אצל לקוח
-- אחד. תבנית שנשמרה מבקשה כזו הייתה מעבירה ללקוח הבא «רק בדף» או בן/בת זוג זרים.
create or replace function public.template_payload_from_step(p_payload jsonb)
returns jsonb language sql immutable as $function$
  -- ‼ 216: הכותרת כפי שהייתה בספרייה (baseTitle) — לא «… (2025) - רונית» של לקוח אחד;
  -- ושדות של משימת משרד (אישור אישי, משימה פנימית) לא עוברים ללקוח הבא.
  select (coalesce(p_payload, '{}'::jsonb)
            - 'baseTitle' - 'baseClientTitle' - 'personalConfirmFor' - 'officeNote' - 'internalTask'
            - 'defaultOrigin' - 'heldUntilApproval'
            - 'published' - 'releaseToken' - 'releaseBody' - 'releaseSubject'
            - 'releaseSentAt' - 'objectionDueDate' - 'submitted' - 'submittedByClient'
            - 'prevAccountantSignature' - 'prevAccountantSignedAt' - 'prevAccountantSignerName'
            - 'authUrl' - 'providerRef'
            - 'autoExecutedAt' - 'autoError' - 'templateOrigin'
            - 'delivery' - 'reminder' - 'flowOrigin' - 'subjectRole' - 'subjectName'
            - 'detachedFromFlowRun' - 'cancelledBy' - 'skipReason'
            -- ‼ 217: «לא נוצרה» שייכת לבקשה אחת אצל לקוח אחד — לא עוברת לתבנית; וכך גם
            -- הסימון «לבדיקה» של משימה ישנה, «שואלים מחדש» של לקוח שחוזר, ו«עברה מהתקשרות קודמת».
            - 'creationProblem' - 'internalTaskReview' - 'askAgain' - 'carriedFrom')
      || case when nullif(p_payload->>'baseTitle', '') is not null
              then jsonb_build_object('title', p_payload->>'baseTitle') else '{}'::jsonb end
      || case when p_payload ? 'baseTitle' or p_payload ? 'baseClientTitle'
              then jsonb_strip_nulls(jsonb_build_object('clientTitle', nullif(p_payload->>'baseClientTitle', '')))
              else '{}'::jsonb end
      || case when p_payload ? 'checklist' then jsonb_build_object('checklist',
           (select coalesce(jsonb_agg(jsonb_build_object(
                     'key', x->>'key', 'label', x->>'label', 'done', false) order by ord), '[]'::jsonb)
              from jsonb_array_elements(p_payload->'checklist') with ordinality t(x, ord)))
         else '{}'::jsonb end
      || case when p_payload ? 'requirements' then jsonb_build_object('requirements',
           (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                     'key', x->>'key', 'kind', x->>'kind', 'label', x->>'label',
                     'required', coalesce((x->>'required')::boolean, true),
                     'options', x->'options',
                     'maxFiles', x->'maxFiles',
                     'done', false)) order by ord), '[]'::jsonb)
              from jsonb_array_elements(p_payload->'requirements') with ordinality t(x, ord)))
         else '{}'::jsonb end;
$function$;

-- ── 13b · עריכת תלויות ידנית שומרת על שער המסלול ─────────────────────────
create or replace function public.set_onboarding_step_dependencies(p_step_id text, p_depends_on text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s      public.onboarding_steps%rowtype;
  v_uid  uuid := auth.uid();
  v_deps text[] := coalesce(p_depends_on, '{}');
  v_bad  int;
  v_met  boolean;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if s.status in ('completed','verified','cancelled') then
    return jsonb_build_object('ok', false, 'error', 'step_terminal');
  end if;

  select coalesce(array_agg(distinct d), '{}') into v_deps
    from unnest(v_deps) d where d is not null and d <> s.id;

  select count(*) into v_bad
    from unnest(v_deps) d
    left join public.onboarding_steps ds on ds.id = d and ds.client_id = s.client_id
   where ds.id is null;
  if v_bad > 0 then return jsonb_build_object('ok', false, 'error', 'dependency_not_found'); end if;

  if exists (
    with recursive desc_steps(id) as (
      select d.step_id from public.onboarding_step_dependencies d
       where d.depends_on_step_id = s.id
      union
      select d2.step_id from public.onboarding_step_dependencies d2
        join desc_steps ds on ds.id = d2.depends_on_step_id
    )
    select 1 from desc_steps where id = any(v_deps)
  ) then
    return jsonb_build_object('ok', false, 'error', 'dependency_cycle');
  end if;

  -- הקשתות הן המקור; העמודה נגזרת מהן בטריגר.
  -- ‼ 215: שער שלב שמסלול הוסיף (origin='flow') נשאר — עריכת התלויות של
  -- בקשה אינה דרך שקטה לעקוף את סדר המסלול.
  delete from public.onboarding_step_dependencies where step_id = s.id and origin is distinct from 'flow';
  if array_length(v_deps, 1) >= 1 then
    insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id)
    select s.id, d, s.user_id from unnest(v_deps) d
    on conflict do nothing;
  end if;

  v_met := public.onboarding_dependency_met(s.id);
  if s.status = 'locked' and v_met then
    update public.onboarding_steps set status = 'pending' where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'system',
      'השלב נפתח - התלויות עודכנו', jsonb_build_object('from','locked','to','pending'));
  elsif s.status = 'pending' and not v_met then
    update public.onboarding_steps set status = 'locked' where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'system',
      'השלב ננעל - נוספה תלות שטרם הושלמה', jsonb_build_object('from','pending','to','locked'));
  end if;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'accountant',
    'עודכנו התלויות של הבקשה', jsonb_build_object('dependsOn', to_jsonb(v_deps)));

  return jsonb_build_object('ok', true, 'dependsOn', to_jsonb(v_deps), 'met', v_met);
end;
$function$;

-- ── 14 · הרשאות ───────────────────────────────────────────────────────────
revoke all on function public.flow_when_matches(jsonb, jsonb) from public, anon;
revoke all on function public.client_flow_facts(text, text) from public, anon, authenticated;
revoke all on function public.client_spouse_first_name(text, text) from public, anon, authenticated;
revoke all on function public.flow_auto_action_allowed(text) from public, anon;
revoke all on function public.flow_definition_error(jsonb, text) from public, anon;
revoke all on function public._flow_def(text, int) from public, anon, authenticated;
revoke all on function public._document_request_payload(uuid, text) from public, anon, authenticated;
revoke all on function public._flow_item_spec(uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public._library_template(uuid, text) from public, anon, authenticated;
revoke all on function public._flow_has_personal_confirm(jsonb) from public, anon, authenticated;
revoke all on function public._flow_add_parents(text, text[]) from public, anon, authenticated;
revoke all on function public._flow_gate_steps(text, jsonb, jsonb, int) from public, anon, authenticated;
revoke all on function public._flow_rearc_locked(text) from public, anon, authenticated;
revoke all on function public._flow_materialize(text, text[], text[]) from public, anon, authenticated;
revoke all on function public._flow_run_action(public.flow_runs, jsonb) from public, anon, authenticated;
revoke all on function public._flow_progress(text) from public, anon, authenticated;
revoke all on function public._flow_progress_safe(text) from public, anon, authenticated;
revoke all on function public.unlock_dependent_steps(text) from public, anon, authenticated;
revoke all on function public._flow_owner_check(text) from public, anon, authenticated;
revoke all on function public._flow_projection_step(text, jsonb) from public, anon;
revoke all on function public.start_flow_run(text, text, text, boolean) from public, anon;
revoke all on function public._flow_authority_ready(uuid, text) from public, anon, authenticated;
revoke all on function public._flow_heal_all() from public, anon, authenticated;
revoke all on function public._flow_cancel_queued_jobs(text, text) from public, anon, authenticated;
revoke all on function public.set_onboarding_step_dependencies(text, text[]) from public, anon;
revoke all on function public.pause_flow_run(text) from public, anon;
revoke all on function public.resume_flow_run(text) from public, anon;
revoke all on function public.cancel_flow_run(text) from public, anon;
revoke all on function public.attach_step_to_flow_stage(text, text, text) from public, anon;
revoke all on function public.flow_run_add_items(text, text[], text[]) from public, anon;
revoke all on function public.flow_run_upgrade_preview(text) from public, anon;
revoke all on function public.flow_run_upgrade_apply(text, int, text[], text[]) from public, anon;
revoke all on function public.flow_run_suggestions(text) from public, anon;
revoke all on function public.get_office_flows() from public, anon;
revoke all on function public.get_client_flow_runs(text) from public, anon;
revoke all on function public.create_office_flow(text, text, jsonb) from public, anon;
revoke all on function public.save_office_flow(text, int, jsonb, text, text, jsonb) from public, anon;
revoke all on function public.archive_office_flow(text) from public, anon;
revoke all on function public.upsert_library_request(text, text, text, jsonb) from public, anon;
revoke all on function public.delete_library_request(text) from public, anon;

grant execute on function public.flow_when_matches(jsonb, jsonb) to authenticated, service_role;
grant execute on function public.flow_auto_action_allowed(text) to authenticated, service_role;
grant execute on function public.flow_definition_error(jsonb, text) to authenticated, service_role;
grant execute on function public._flow_projection_step(text, jsonb) to authenticated, service_role;
grant execute on function public.client_flow_facts(text, text) to service_role;
grant execute on function public.client_spouse_first_name(text, text) to service_role;
grant execute on function public._flow_def(text, int) to service_role;
grant execute on function public._document_request_payload(uuid, text) to service_role;
grant execute on function public._flow_item_spec(uuid, jsonb, boolean) to service_role;
grant execute on function public._library_template(uuid, text) to service_role;
grant execute on function public._flow_has_personal_confirm(jsonb) to service_role;
grant execute on function public._flow_add_parents(text, text[]) to service_role;
grant execute on function public._flow_gate_steps(text, jsonb, jsonb, int) to service_role;
grant execute on function public._flow_materialize(text, text[], text[]) to service_role;
grant execute on function public._flow_run_action(public.flow_runs, jsonb) to service_role;
grant execute on function public._flow_progress(text) to service_role;
grant execute on function public._flow_progress_safe(text) to service_role;
grant execute on function public.unlock_dependent_steps(text) to service_role;
grant execute on function public._flow_owner_check(text) to service_role;
grant execute on function public.start_flow_run(text, text, text, boolean) to authenticated, service_role;
grant execute on function public._flow_authority_ready(uuid, text) to service_role;
grant execute on function public._flow_heal_all() to service_role;
grant execute on function public._flow_cancel_queued_jobs(text, text) to service_role;
grant execute on function public.set_onboarding_step_dependencies(text, text[]) to authenticated, service_role;
grant execute on function public.pause_flow_run(text) to authenticated, service_role;
grant execute on function public.resume_flow_run(text) to authenticated, service_role;
grant execute on function public.cancel_flow_run(text) to authenticated, service_role;
grant execute on function public.attach_step_to_flow_stage(text, text, text) to authenticated, service_role;
grant execute on function public.flow_run_add_items(text, text[], text[]) to authenticated, service_role;
grant execute on function public.flow_run_upgrade_preview(text) to authenticated, service_role;
grant execute on function public.flow_run_upgrade_apply(text, int, text[], text[]) to authenticated, service_role;
grant execute on function public.flow_run_suggestions(text) to authenticated, service_role;
grant execute on function public.get_office_flows() to authenticated, service_role;
grant execute on function public.get_client_flow_runs(text) to authenticated, service_role;
grant execute on function public.create_office_flow(text, text, jsonb) to authenticated, service_role;
grant execute on function public.save_office_flow(text, int, jsonb, text, text, jsonb) to authenticated, service_role;
grant execute on function public.archive_office_flow(text) to authenticated, service_role;
grant execute on function public.upsert_library_request(text, text, text, jsonb) to authenticated, service_role;
grant execute on function public.delete_library_request(text) to authenticated, service_role;

select public.assert_domain_function_invariants();
