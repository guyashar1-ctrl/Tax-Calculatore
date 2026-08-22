-- 119 — דף הרו"ח הקודם: רשימת הקבצים ששלח, הסרה שלהם, ומה שנשאר בטיפולו
--
-- ‼ שלוש בעיות שהתגלו בשימוש (הכרעת גיא 2026-08-22):
--
-- 1. הדף הציג מונה ("כבר התקבלו 3 קבצים") ולא רשימה. מי ששולח בכמה פעמים
--    לאורך שבועות לא יודע מה כבר הגיע, ושולח שוב את אותו קובץ.
--
-- 2. אי אפשר היה להסיר קובץ שנשלח בטעות. **ההסרה רכה בכוונה**: הקובץ נשאר
--    אצלנו ורק עובר מ-bulkUploads ל-removedUploads. הרו"ח הקודם רואה שהוא
--    ירד מהרשימה שלו; אצלנו שום מסמך לא נעלם, וטעות ניתנת לשחזור.
--    ‼ תופעת לוואי מכוונת: המונה בכרטיס שבצד המשרד קורא את אורך bulkUploads,
--    ולכן הוא מתעדכן לבד בלי שינוי קוד.
--
-- 3. עבודות שנשארו אצל הרו"ח הקודם (דוח שנתי, הצהרת הון) נכתבו במכתב אבל
--    לא הופיעו בדף. הוא קרא ש"הדוח השנתי יוגש על ידי משרדך" ואז ראה עמוד
--    שמדבר רק על חומרים. outstandingItems כבר יושב ב-payload — רק לא הוחזר.

-- ─── 1. הדף מקבל את רשימת הקבצים ואת מה שנשאר בטיפולו ───────────────────────
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
  v_ups    jsonb := '[]'::jsonb;
  v_out    jsonb := '[]'::jsonb;
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
    select count(*) filter (where (x->>'done')::boolean), count(*)
      into v_done, v_total
      from jsonb_array_elements(v_items) x
     where not coalesce((x->>'optional')::boolean, false);
    v_bulk := coalesce(jsonb_array_length(m.payload->'bulkUploads'), 0);

    -- הישן ביותר למעלה: זה סדר השליחה, וכך הוא זוכר מה שלח מתי.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', x->>'documentId',
             'name', coalesce(nullif(x->>'fileName',''), 'קובץ'),
             'at', x->>'at') order by ord), '[]'::jsonb)
      into v_ups
      from jsonb_array_elements(coalesce(m.payload->'bulkUploads','[]'::jsonb)) with ordinality t(x, ord);
  end if;

  -- ‼ נלקח מ-payload הראשי ולא מ-releaseDraft: הטיוטה היא מה שהמשרד ערך,
  -- והשורש הוא מה שנשלח בפועל. מה שהוא רואה חייב להתאים למכתב שקיבל.
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', x->>'key', 'label', x->>'label') order by ord), '[]'::jsonb)
    into v_out
    from jsonb_array_elements(coalesce(s.payload->'outstandingItems','[]'::jsonb)) with ordinality t(x, ord);

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
    'objectionWindowPassed', (v_due is not null and v_due < current_date
                              and nullif(s.payload->>'prevAccountantResponseNote','') is null),
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
    'bulkUploads', v_bulk,
    'uploads', v_ups,
    'outstanding', v_out);
end;
$function$;

-- ─── 2. הסרת קובץ שנשלח — רכה ───────────────────────────────────────────────
-- ‼ אינה נוגעת ב-documents ולא ב-storage. מי שמוחק כאן מסיר את הקובץ
-- מהרשימה שלו בלבד; אצלנו הוא ממשיך להיות מסמך בתיק הלקוח.
CREATE OR REPLACE FUNCTION public.release_portal_remove_upload(
  p_token text, p_document_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s        public.onboarding_steps%rowtype;
  m        public.onboarding_steps%rowtype;
  v_entry  jsonb;
  v_keep   jsonb := '[]'::jsonb;
  v_gone   jsonb := '[]'::jsonb;
begin
  select * into s from public.onboarding_steps
   where step_type = 'release_letter' and payload->>'releaseToken' = p_token limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  select * into m from public.onboarding_steps
    where client_id = s.client_id and step_type = 'materials_received'
      and status <> 'cancelled' limit 1;
  if m.id is null then return jsonb_build_object('ok', false, 'error', 'no_step'); end if;

  select x into v_entry
    from jsonb_array_elements(coalesce(m.payload->'bulkUploads','[]'::jsonb)) x
   where x->>'documentId' = p_document_id limit 1;
  if v_entry is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  select coalesce(jsonb_agg(x order by ord), '[]'::jsonb) into v_keep
    from jsonb_array_elements(coalesce(m.payload->'bulkUploads','[]'::jsonb)) with ordinality t(x, ord)
   where x->>'documentId' <> p_document_id;

  v_gone := coalesce(m.payload->'removedUploads','[]'::jsonb)
            || jsonb_build_array(v_entry || jsonb_build_object(
                 'removedAt', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                 'removedBy', 'prev_accountant'));

  update public.onboarding_steps
     set payload = m.payload
                   || jsonb_build_object('bulkUploads', v_keep)
                   || jsonb_build_object('removedUploads', v_gone)
   where id = m.id;

  return jsonb_build_object('ok', true, 'remaining', jsonb_array_length(v_keep));
end;
$function$;

GRANT EXECUTE ON FUNCTION public.release_portal_remove_upload(text, text) TO anon, authenticated;
