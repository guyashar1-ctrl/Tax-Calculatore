-- 116 — מסלול הרו"ח הקודם: פחות עבודה לנמען.
-- הכרעות גיא 2026-08-18 (אחרי סבב תכנון):
--   1. לא מבקשים חתימה או אישור. מי שיש לו מניעה משיב למייל (כלל 16 נשמר בנוסח).
--   2. פעולה ראשית אחת: העלאה מרוכזת, בלי לשייך כל קובץ לפריט.
--   3. אחרי ההעלאה — סימון רשות "מה כלל המשלוח". מה שסומן נרשם כהתקבל.
--   4. פריט אפשר לסמן כ"חשוב במיוחד" — סדר ראשון והבלטה מאופקת, בלי להפוך
--      את השאר לרשות.
--
-- ‼ אין טבלאות חדשות ואין עמודות חדשות: הכל חי ב-payload של השלבים הקיימים,
--   כמו שאר מודל הבקשות.
--
-- ‼ מספור: קיימים שני קבצי 115 (`115-prev-accountant-always-ask.sql` שהוחל על
--   staging+פרודקשן, ו-`115-prev-accountant-handoff.sql` מ-2026-08-17 שהוחל
--   ולא תועד) — התנגשות בין סשנים מקבילים. **לא ממספרים מחדש קובץ שכבר הוחל**,
--   כי המספר הוא הדרך היחידה לזהות בדיעבד מה רץ. הקובץ הזה הוא 116.
--
-- ‼ להריץ דרך execute_sql ולאמת אחרי (הלקח של 101/110/115).

-- ── 1. get_release_portal — מה שהדף החדש צריך ────────────────────────────────
-- שינויים מול 115-handoff: priority על כל פריט, ספירת הקבצים שהועלו בלי שיוך,
-- ומצב חלון ההתייחסות (עבר בשקט / עדיין פתוח) כדי שהדף לא יחשב אותו בעצמו.
CREATE OR REPLACE FUNCTION public.get_release_portal(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s        public.onboarding_steps%rowtype;
  m        public.onboarding_steps%rowtype;
  c        public.clients%rowtype;
  p        public.profiles%rowtype;
  v_items  jsonb := '[]'::jsonb;
  v_done   int := 0;
  v_total  int := 0;
  v_bulk   int := 0;
  v_due    date;
begin
  select * into s from public.onboarding_steps
   where step_type = 'release_letter' and payload->>'releaseToken' = p_token limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  select * into c from public.clients where id = s.client_id;
  select * into p from public.profiles where id = s.user_id;
  select * into m from public.onboarding_steps
    where client_id = s.client_id and step_type = 'materials_received' and status <> 'cancelled' limit 1;

  if m.id is not null then
    -- ‼ חשובים ראשונים כבר מהשרת: הדף, המייל והכרטיס מציגים אותו סדר בדיוק,
    -- ואין שלושה מקומות שממיינים כל אחד לעצמו.
    select coalesce(jsonb_agg(jsonb_build_object(
             'key', x->>'key', 'label', x->>'label',
             'done', coalesce((x->>'done')::boolean, false),
             'optional', coalesce((x->>'optional')::boolean, (x->>'key') = 'additional_material'),
             'priority', coalesce((x->>'priority')::boolean, false),
             'uploads', coalesce(jsonb_array_length(x->'documentIds'),
                                 case when x ? 'documentId' then 1 else 0 end))
             order by coalesce((x->>'priority')::boolean, false) desc, ord), '[]'::jsonb)
      into v_items
      from jsonb_array_elements(coalesce(m.payload->'checklist','[]'::jsonb)) with ordinality t(x, ord);
    -- פריט רשות אינו נספר: "3 מתוך 8" שכולל אותו לעולם לא היה נסגר.
    select count(*) filter (where (x->>'done')::boolean), count(*)
      into v_done, v_total
      from jsonb_array_elements(v_items) x
     where not coalesce((x->>'optional')::boolean, false);
    v_bulk := coalesce(jsonb_array_length(m.payload->'bulkUploads'), 0);
  end if;

  v_due := nullif(s.payload->>'objectionDueDate','')::date;

  return jsonb_build_object(
    'ok', true,
    'firmName', coalesce(p.firm_name, 'המשרד'),
    'branding', coalesce(p.branding, '{}'::jsonb),
    'clientName', trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')),
    'businessName', nullif(trim(coalesce(c.business_name,'')), ''),
    'prevAccountantName', nullif(trim(coalesce(c.prev_accountant_name,'')), ''),
    'subject', nullif(s.payload->>'releaseSubject',''),
    'body', nullif(s.payload->>'releaseBody',''),
    'sentAt', s.payload->>'releaseSentAt',
    'objectionDueDate', s.payload->>'objectionDueDate',
    -- ‼ חלון שעבר בשקט. תצוגה בלבד — אינו סוגר שלב ואינו מחליף החלטה של הרו"ח.
    'objectionWindowPassed', (v_due is not null and v_due < current_date
                              and nullif(s.payload->>'prevAccountantResponseNote','') is null),
    -- חתימה: היסטוריה בלבד. הזרימה הרגילה אינה מבקשת אותה יותר.
    'signed', (s.payload->>'prevAccountantSignedAt') is not null,
    'signedAt', s.payload->>'prevAccountantSignedAt',
    'signerName', s.payload->>'prevAccountantSignerName',
    'responseNote', nullif(s.payload->>'prevAccountantResponseNote',''),
    'respondedAt', s.payload->>'prevAccountantRespondedAt',
    'responderName', nullif(s.payload->>'prevAccountantResponderName',''),
    'materialsStepId', m.id,
    'materials', v_items,
    'materialsDone', v_done,
    'materialsTotal', v_total,
    'bulkUploads', v_bulk);
end;
$function$;

-- ── 2. release_portal_mark_items — "מה כלל המשלוח" ───────────────────────────
-- ‼ הצהרה של הרו"ח הקודם, באותה רמת אמון בדיוק כמו העלאה פר-פריט שהייתה כאן
--   עד היום (גם שם איש לא בדק שהקובץ הוא באמת מה שביקשנו). הפריט מסומן
--   `declaredByRecipient` כדי שהמשרד יראה על מה הסימון נשען ויוכל לתקן.
-- ‼ לעולם אינו מבטל סימון קיים: פריט שכבר התקבל נשאר כזה גם אם לא סומן עכשיו.
-- ‼ פריט רשות אינו נסגר בהצהרה — הוא נשאר פתוח להמשך, כמו בכל שאר המסלול.
CREATE OR REPLACE FUNCTION public.release_portal_mark_items(p_token text, p_keys jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s          public.onboarding_steps%rowtype;
  m          public.onboarding_steps%rowtype;
  v_keys     text[];
  v_list     jsonb;
  v_marked   int := 0;
  v_remain   int;
  v_labels   text;
  v_client   text;
begin
  select * into s from public.onboarding_steps
   where step_type = 'release_letter' and payload->>'releaseToken' = p_token limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  select * into m from public.onboarding_steps
    where client_id = s.client_id and step_type = 'materials_received' and status <> 'cancelled' limit 1;
  if m.id is null then return jsonb_build_object('ok', false, 'error', 'no_materials_step'); end if;

  select coalesce(array_agg(k), '{}') into v_keys
    from jsonb_array_elements_text(coalesce(p_keys, '[]'::jsonb)) k;
  if array_length(v_keys, 1) is null then
    return jsonb_build_object('ok', true, 'marked', 0);
  end if;

  select jsonb_agg(
           case
             when (x->>'key') = any(v_keys)
              and not coalesce((x->>'done')::boolean, false)
              and not coalesce((x->>'optional')::boolean, (x->>'key') = 'additional_material')
             then x || jsonb_build_object(
                    'done', true, 'doneAt', to_jsonb(now()), 'declaredByRecipient', true)
             else x
           end order by ord)
    into v_list
    from jsonb_array_elements(coalesce(m.payload->'checklist','[]'::jsonb)) with ordinality t(x, ord);

  select count(*) into v_marked
    from jsonb_array_elements(coalesce(v_list,'[]'::jsonb)) x
   where coalesce((x->>'declaredByRecipient')::boolean, false)
     and (x->>'key') = any(v_keys);

  select count(*) into v_remain
    from jsonb_array_elements(coalesce(v_list,'[]'::jsonb)) x
   where not coalesce((x->>'done')::boolean, false)
     and not coalesce((x->>'optional')::boolean, (x->>'key') = 'additional_material');

  select string_agg(x->>'label', ' · ') into v_labels
    from jsonb_array_elements(coalesce(v_list,'[]'::jsonb)) x
   where (x->>'key') = any(v_keys);

  update public.onboarding_steps
     set payload = payload || jsonb_build_object('checklist', coalesce(v_list, '[]'::jsonb)),
         status  = case when v_remain = 0 then 'completed' else 'in_progress' end,
         ball    = case when v_remain = 0 then 'me' else ball end,
         completion_method = case when v_remain = 0 then 'system' else completion_method end,
         completed_at = case when v_remain = 0 then now() else completed_at end
   where id = m.id;

  perform public.log_onboarding_event(m.user_id, m.id, m.engagement_id,
    case when v_remain = 0 then 'status_changed' else 'note' end, 'system',
    'הרו״ח הקודם ציין מה כלל המשלוח: ' || coalesce(v_labels, ''),
    jsonb_build_object('actor', 'prev_accountant', 'keys', to_jsonb(v_keys), 'remaining', v_remain));

  if v_remain = 0 then perform public.unlock_dependent_steps(m.id); end if;

  select nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '')
    into v_client from public.clients where id = m.client_id;

  perform public.queue_accountant_notification(
    m.user_id, 'prev_accountant_document_uploaded', m.client_id, m.id, null, null,
    jsonb_build_object('clientName', v_client,
                       'requestTitle', 'הרו״ח הקודם ציין מה נשלח',
                       'lastItem', coalesce(v_labels, '')));

  return jsonb_build_object('ok', true, 'marked', v_marked, 'remaining', v_remain);
end;
$function$;

-- ‼ revoke from public ולא רק מ-anon (הלקח של 115-handoff): ההרשאה שניתנת
-- אוטומטית ל-PUBLIC כוללת את anon.
revoke all on function public.release_portal_mark_items(text, jsonb) from public;
grant execute on function public.release_portal_mark_items(text, jsonb) to anon, authenticated;
