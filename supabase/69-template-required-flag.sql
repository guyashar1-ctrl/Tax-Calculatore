-- 69 · תבנית המסע נושאת חובה/רשות
--
-- למה: היום התבנית שומרת ניסוח והגדרות בלבד, ולכן שלב שהוגדר כרשות אצל לקוח
-- אחד חוזר כ"נדרש" אצל כל לקוח שהתבנית מוחלת עליו. ההחלטה שייכת לשלב, ולכן
-- היא חייבת לנסוע אתו בתבנית.
--
-- מבנה: לכל רשומה ב-entries נוסף מפתח אופציונלי אחד —
--   { stepType, payload, requiredForClose? }
-- רשומה בלי המפתח (כל התבניות שנשמרו עד היום) נקראת כ"נדרש", כלומר
-- ההתנהגות הקיימת נשמרת.
--
-- שתי הפונקציות הן ההגדרות החיות (live-2026-08-07) עם התוספת בלבד.
-- ארכוב לפני החלפה: supabase/live-2026-08-07/

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
  select coalesce(jsonb_agg(jsonb_build_object(
           'stepType', s.step_type,
           -- ‼ הערך האפקטיבי, לא הגולמי: שורה שנוצרה לפני העמודה מקבלת את
           -- ברירת המחדל לפי סוג, בדיוק כמו במסך וב-onboarding_close_readiness.
           'requiredForClose', coalesce(s.required_for_close,
             s.step_type not in ('representation_upgrade', 'first_month_review')),
           'payload', (s.payload - 'published' - 'releaseToken' - 'releaseBody' - 'releaseSubject'
                                 - 'releaseSentAt' - 'objectionDueDate' - 'submitted' - 'submittedByClient'
                                 - 'prevAccountantSignature' - 'prevAccountantSignedAt' - 'prevAccountantSignerName'
                                 - 'authUrl' - 'providerRef')
             -- פריטים חוזרים ריקים: התבנית אומרת מה לבקש, לא מה כבר הגיע.
             || case when s.payload ? 'checklist' then jsonb_build_object('checklist',
                  (select coalesce(jsonb_agg(jsonb_build_object('key',x->>'key','label',x->>'label','done',false) order by ord), '[]'::jsonb)
                     from jsonb_array_elements(s.payload->'checklist') with ordinality t(x,ord)))
                else '{}'::jsonb end
             || case when s.payload ? 'requirements' then jsonb_build_object('requirements',
                  (select coalesce(jsonb_agg(jsonb_build_object('key',x->>'key','kind',x->>'kind','label',x->>'label','done',false) order by ord), '[]'::jsonb)
                     from jsonb_array_elements(s.payload->'requirements') with ordinality t(x,ord)))
                else '{}'::jsonb end)
         order by s.sort_order, s.created_at), '[]'::jsonb)
    into v_items
    from public.onboarding_steps s
   where s.client_id = c.id
     and s.status <> 'cancelled'
     -- הייצוג נולד מבקשת הייצוג ולא מתבנית; שלבים אוטומטיים אינם ניתנים להרכבה.
     and s.step_type not in ('representation', 'representation_upgrade', 'internal_setup', 'first_month_review');

  if jsonb_array_length(v_items) = 0 then
    return jsonb_build_object('ok', false, 'error', 'nothing_to_save');
  end if;

  insert into public.journey_templates (user_id, name, description, entries)
  values (v_uid, trim(p_name), nullif(trim(coalesce(p_description,'')), ''), v_items)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'templateId', v_id, 'count', jsonb_array_length(v_items));
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_journey_template(p_client_id text, p_template_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c       public.clients%rowtype;
  t       public.journey_templates%rowtype;
  v_uid   uuid := auth.uid();
  e       jsonb;
  v_res   jsonb;
  v_added int := 0;
  v_skip  int := 0;
  v_dup   boolean;
  v_title text;
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

    -- ‼ סימון בשם ולא לפי מיקום: p_required_for_close הוא הפרמטר השביעי,
    -- ואחריו p_due_date/p_depends_on/p_published שאין לתבנית מה לומר עליהם.
    v_res := public.create_onboarding_request(
               c.id, e->>'stepType', coalesce(e->'payload','{}'::jsonb),
               p_required_for_close => coalesce((e->>'requiredForClose')::boolean, true));
    if coalesce((v_res->>'ok')::boolean, false) then v_added := v_added + 1;
    else v_skip := v_skip + 1; end if;
  end loop;

  return jsonb_build_object('ok', true, 'added', v_added, 'skipped', v_skip, 'template', t.name);
end;
$function$;
