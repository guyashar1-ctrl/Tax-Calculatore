-- 76 — תבנית מסע לעולם לא חושפת בקשות ללקוח בשקט
--
-- הבעיה: apply_journey_template קראה ל-create_onboarding_request בלי p_published,
-- וברירת המחדל שם היא true. לכן החלת תבנית על לקוח שדף המסע שלו כבר פורסם
-- (או על לקוח ותיק בלי התקשרות — שהדף שלו חשוף תמיד) פתחה את הבקשות החדשות
-- ללקוח מיד, בלי שגיא ראה אותן קודם. זה סותר את מדיניות השליחה
-- (docs/PLAN-ONBOARDING-SEND-POLICY.md, פעולה א׳ אינה גוררת חשיפה) ואת הכרעת
-- המוצר מ-2026-08-09: "תבנית יוצרת טיוטות, לעולם לא חושפת שינויים בשקט".
--
-- הפתרון: לחשב האם דף הלקוח חשוף כרגע — אותו ביטוי בדיוק כמו ב-get_client_portal
-- (אין התקשרות ⇒ חשוף; יש התקשרות ⇒ חשוף רק אם process_published_at מולא) —
-- ואם הוא חשוף, כל בקשה מהתבנית נולדת כטיוטה (payload.published=false).
-- לפני פרסום התהליך אין שינוי: הבקשות נולדות כרגיל ושער הפרסום מסתיר אותן,
-- כך שהבונה ממשיך להציג אותן בלי תגי "טיוטה" מיותרים.
--
-- ההגדרה החיה שנדרסה שמורה ב-supabase/live-2026-08-09/apply_journey_template.sql.

CREATE OR REPLACE FUNCTION public.apply_journey_template(p_client_id text, p_template_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c         public.clients%rowtype;
  t         public.journey_templates%rowtype;
  v_uid     uuid := auth.uid();
  e         jsonb;
  v_res     jsonb;
  v_added   int := 0;
  v_skip    int := 0;
  v_dup     boolean;
  v_title   text;
  v_exposed boolean;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  select * into t from public.journey_templates where id = p_template_id and user_id = v_uid;
  if t.id is null then return jsonb_build_object('ok', false, 'error', 'template_not_found'); end if;

  -- האם הדף האישי חשוף כרגע? אותו כלל כמו get_client_portal: לקוח בלי
  -- התקשרות נחשב חשוף, ולכן גם אצלו התבנית יוצרת טיוטות.
  select coalesce(bool_or(e2.process_published_at is not null), true)
    into v_exposed
    from public.engagements e2
   where e2.client_id = c.id;

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

    -- ‼ סימון בשם ולא לפי מיקום, ו-p_published נקבע לפי מצב החשיפה:
    -- דף חשוף ⇒ טיוטה שגיא פותח ללקוח במפורש; דף לא-חשוף ⇒ כרגיל,
    -- שער הפרסום של התהליך ממשיך להסתיר.
    v_res := public.create_onboarding_request(
               c.id, e->>'stepType', coalesce(e->'payload','{}'::jsonb),
               p_required_for_close => coalesce((e->>'requiredForClose')::boolean, true),
               p_published => not v_exposed);
    if coalesce((v_res->>'ok')::boolean, false) then v_added := v_added + 1;
    else v_skip := v_skip + 1; end if;
  end loop;

  return jsonb_build_object('ok', true, 'added', v_added, 'skipped', v_skip, 'template', t.name);
end;
$function$;
