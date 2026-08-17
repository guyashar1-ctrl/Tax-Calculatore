-- ─── מסלול הרו"ח הקודם — תגובה, פריט פתוח וסימון טיפול ───────────────────────
-- שלוש תוספות לצד הקיים. שום מכונת מצבים חדשה: הטיוטה, ההיסטוריה והראיות
-- יושבות ב-payload של שלב מכתב השחרור, והסטטוסים נשארים הגנריים.
--
-- 1. get_release_portal — מחזירה את הפריט הפתוח כפריט-רשות (optional) עם מספר
--    הקבצים שהצטברו אליו, מוציאה אותו מספירת ההתקדמות, ומחזירה את התגובה
--    שנרשמה. בלי זה הדף הציבורי לא יכול להבדיל בין "מה שהתבקש" ל"מה שאולי".
-- 2. release_portal_respond — ערוץ תשובה עניינית לרו"ח הקודם (הערה, הסתייגות,
--    התנגדות). ‼ אינו סוגר את השלב ואינו מחליף את החתימה: הוא מסמן "דורש
--    טיפול" ומשאיר את ההחלטה לרו"ח החדש. ‼ הניסוח בדף ניטרלי בכוונה — אין
--    כאן קביעה מה מותר או אסור לרו"ח הקודם.
-- 3. set_step_attention — הדרך לכבות "דורש טיפול" אחרי שהתגובה טופלה.
--    advance_onboarding_step מכבה אותו רק בסגירת שלב, וכאן השלב נשאר פתוח.

-- ── 1 ────────────────────────────────────────────────────────────────────────
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
begin
  select * into s from public.onboarding_steps
   where step_type = 'release_letter' and payload->>'releaseToken' = p_token limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  select * into c from public.clients where id = s.client_id;
  select * into p from public.profiles where id = s.user_id;
  select * into m from public.onboarding_steps
    where client_id = s.client_id and step_type = 'materials_received' and status <> 'cancelled' limit 1;

  if m.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'key', x->>'key', 'label', x->>'label',
             'done', coalesce((x->>'done')::boolean, false),
             'optional', coalesce((x->>'optional')::boolean, (x->>'key') = 'additional_material'),
             'uploads', coalesce(jsonb_array_length(x->'documentIds'),
                                 case when x ? 'documentId' then 1 else 0 end))
             order by ord), '[]'::jsonb)
      into v_items
      from jsonb_array_elements(coalesce(m.payload->'checklist','[]'::jsonb)) with ordinality t(x, ord);
    -- ‼ פריט רשות אינו נספר: "3 מתוך 8" שכולל אותו לעולם לא היה נסגר.
    select count(*) filter (where (x->>'done')::boolean), count(*)
      into v_done, v_total
      from jsonb_array_elements(v_items) x
     where not coalesce((x->>'optional')::boolean, false);
  end if;

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
    'signed', (s.payload->>'prevAccountantSignedAt') is not null,
    'signedAt', s.payload->>'prevAccountantSignedAt',
    'signerName', s.payload->>'prevAccountantSignerName',
    'responseNote', nullif(s.payload->>'prevAccountantResponseNote',''),
    'respondedAt', s.payload->>'prevAccountantRespondedAt',
    'responderName', nullif(s.payload->>'prevAccountantResponderName',''),
    'materialsStepId', m.id,
    'materials', v_items,
    'materialsDone', v_done,
    'materialsTotal', v_total);
end;
$function$;

-- ── 2 ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.release_portal_respond(
  p_token text, p_note text, p_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s      public.onboarding_steps%rowtype;
  v_note text;
  v_name text;
  v_prev text;
  v_client_name text;
begin
  select * into s from public.onboarding_steps
   where step_type = 'release_letter' and payload->>'releaseToken' = p_token limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');
  if v_note is null then return jsonb_build_object('ok', false, 'error', 'missing_note'); end if;
  -- תקרה — הערה היא הערה, לא ערוץ להזרקת תוכן.
  v_note := left(v_note, 4000);
  v_name := left(nullif(trim(coalesce(p_name, '')), ''), 200);

  -- הערה נוספת אינה מוחקת את הקודמת: הראיה מצטברת.
  v_prev := nullif(s.payload->>'prevAccountantResponseNote', '');
  if v_prev is not null then
    v_note := v_prev || E'\n\n— — —\n' || v_note;
  end if;

  -- ‼ הסוגריים חובה: `-` נקשר חזק יותר מ-`||`, ובלעדיהן המחיקה חלה על
  -- האובייקט החדש (שאין בו את המפתח) והסימון "טופל" היה שורד תגובה חדשה.
  update public.onboarding_steps
     set payload = (payload || jsonb_strip_nulls(jsonb_build_object(
                     'prevAccountantResponseNote', v_note,
                     'prevAccountantRespondedAt', to_jsonb(now()),
                     'prevAccountantResponderName', v_name)))
                   - 'responseHandledAt',
         -- ‼ השלב אינו נסגר ואינו נפתח מחדש: רק הכדור חוזר לרו"ח החדש, עם דגל
         -- שאומר שיש כאן משהו לקרוא. ההחלטה מה לעשות היא שלו.
         ball = 'me',
         needs_attention = true
   where id = s.id;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'system',
    coalesce('הרו״ח הקודם השיב — ' || v_name, 'הרו״ח הקודם השיב'),
    jsonb_build_object('actor', 'prev_accountant', 'note', v_note));

  select nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '')
    into v_client_name from public.clients where id = s.client_id;

  perform public.queue_accountant_notification(
    s.user_id, 'release_letter_objection', s.client_id, s.id, null, null,
    jsonb_build_object(
      'clientName', v_client_name,
      'responderName', v_name,
      'note', left(v_note, 800),
      'prevAccountantName', s.payload->>'prevAccountantName'));

  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.release_portal_respond(text, text, text) from public;
grant execute on function public.release_portal_respond(text, text, text) to anon, authenticated;

-- ── 3 ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_step_attention(p_step_id text, p_on boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s     public.onboarding_steps%rowtype;
  v_uid uuid := auth.uid();
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  update public.onboarding_steps set needs_attention = coalesce(p_on, false) where id = s.id;
  return jsonb_build_object('ok', true, 'needsAttention', coalesce(p_on, false));
end;
$function$;

-- ‼ revoke from public ולא רק מ-anon: הרשאת ההרצה שניתנת אוטומטית ל-PUBLIC
-- כוללת את anon, ו-revoke ממנו לבדו משאיר אותה בתוקף.
revoke all on function public.set_step_attention(text, boolean) from public, anon;
grant execute on function public.set_step_attention(text, boolean) to authenticated;
