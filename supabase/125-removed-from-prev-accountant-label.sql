-- 125 — "הוסר מרשימת הרו״ח הקודם" כתווית, לא כתיקייה
--
-- ‼ הכרעת גיא (2026-08-23): הסרה מהרשימה של הרו"ח הקודם היא **מטא-דאטה של
-- הבקשה**, לא מקום של המסמך. הקובץ נשאר בתיקייה היציבה שלו; מה שמשתנה הוא
-- התווית. אין תת-תיקייה, אין העברה, אין שכפול, ואין נגיעה בקישורי משימות.
--
-- ‼ אילוץ מהסכימה: documents.label_id הוא עמודה יחידה — תווית אחת למסמך.
-- ולכן בזמן שהקובץ מוסר, תווית ההסרה **מחליפה** את "חומרים מהרו״ח הקודם".
-- שום מידע לא אובד: מקור הקובץ ממשיך להיאמר על ידי התיקייה שבה הוא יושב
-- ("חומרים מרו״ח קודם", מיגרציה 120). ביטול ההסרה מחזיר את תווית המקור.

CREATE UNIQUE INDEX IF NOT EXISTS document_labels_prev_removed_uniq
  ON public.document_labels (user_id)
  WHERE name = 'הוסר מרשימת הרו״ח הקודם';

CREATE OR REPLACE FUNCTION public.ensure_prev_accountant_removed_label(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id text;
begin
  select id into v_id from public.document_labels
   where user_id = p_user_id and name = 'הוסר מרשימת הרו״ח הקודם' limit 1;
  if v_id is not null then return v_id; end if;

  insert into public.document_labels (user_id, name)
  values (p_user_id, 'הוסר מרשימת הרו״ח הקודם')
  on conflict do nothing;

  select id into v_id from public.document_labels
   where user_id = p_user_id and name = 'הוסר מרשימת הרו״ח הקודם' limit 1;
  return v_id;
end;
$function$;

-- ─── סנכרון התווית לפי המצב בפועל ───────────────────────────────────────────
-- ‼ נגזר, לא נצבר: הפונקציה קוראת את מצב הבקשה ומכריעה מחדש. ולכן היא גם
-- אידמפוטנטית וגם מתקנת את עצמה — קריאה חוזרת אחרי ביטול הסרה תחזיר את
-- תווית המקור בלי שאיש יזכור לעשות זאת.
-- ‼ נוגעת אך ורק ב-label_id, ורק כשהתווית הנוכחית היא אחת משתי שלנו או ריקה.
-- תווית שהמשרד קבע בעצמו על הקובץ אינה נדרסת.
CREATE OR REPLACE FUNCTION public.sync_prev_accountant_removed_label(p_document_id text)
 RETURNS void
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  d          public.documents%rowtype;
  v_removed  boolean;
  v_src      text;
  v_rm       text;
  v_target   text;
begin
  select * into d from public.documents where id = p_document_id;
  if d.id is null then return; end if;

  select exists (
    select 1 from public.onboarding_steps s,
         lateral jsonb_array_elements(coalesce(s.payload->'removedUploads','[]'::jsonb)) x
     where s.step_type = 'materials_received' and s.client_id = d.client_id
       and x->>'documentId' = p_document_id)
   into v_removed;

  v_src := public.ensure_prev_accountant_label(d.user_id);
  v_rm  := public.ensure_prev_accountant_removed_label(d.user_id);
  v_target := case when v_removed then v_rm else v_src end;

  update public.documents
     set label_id = v_target
   where id = p_document_id
     and (label_id is null or label_id in (v_src, v_rm))
     and label_id is distinct from v_target;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.ensure_prev_accountant_removed_label(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_prev_accountant_removed_label(text) TO authenticated, service_role;

-- ─── ההסרה עצמה מסנכרנת את התווית ───────────────────────────────────────────
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

  -- ‼ אחרי העדכון: הפונקציה נגזרת מהמצב, ולכן חייבת לרוץ כשהמצב כבר נכון.
  perform public.sync_prev_accountant_removed_label(p_document_id);

  return jsonb_build_object('ok', true, 'remaining', jsonb_array_length(v_keep));
end;
$function$;

GRANT EXECUTE ON FUNCTION public.release_portal_remove_upload(text, text) TO anon, authenticated;

-- ─── השלמה לקבצים שכבר הוסרו ────────────────────────────────────────────────
DO $migrate$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT x->>'documentId' AS doc_id
      FROM public.onboarding_steps s,
           LATERAL jsonb_array_elements(coalesce(s.payload->'removedUploads','[]'::jsonb)) x
     WHERE s.step_type = 'materials_received'
  LOOP
    PERFORM public.sync_prev_accountant_removed_label(r.doc_id);
  END LOOP;
END
$migrate$;
