-- ═══════════════════════════════════════════════════════════════════════════
--  170 — שלמות הפניות במחיקה ובקישור: מסמכים, בני זוג, ומחיקת לקוח
-- ═══════════════════════════════════════════════════════════════════════════
--  ‼ מה נמצא (ביקורת העקביות, ספטמבר 2026):
--
--   D2  מחיקת מסמך השאירה documentId/documentIds תלויים ב-payload של שלבי
--       הקליטה (checklist, requirements, clientResources) ובעמודות ה-jsonb של
--       בקשת הייצוג (submission.uploadedDocs, identity_docs, signature_documents,
--       signature_setup). הטריגר של 124 ניקה רק bulkUploads/removedUploads.
--       פריט ברשימה שכל הראיה שלו נמחקה נשאר "בוצע" — בלי שום קובץ מאחוריו.
--
--   D-P2 מחיקת לקוח מוחקת בגרירה את *שורות* המסמכים, אבל הקבצים באחסון נשארו
--       יתומים (8 כאלה בפרודקשן ביום הכתיבה). ‼ אי אפשר לפתור את זה ב-SQL:
--       Supabase חוסמת DELETE ישיר על storage.objects, ומחיקת השורה בלבד הייתה
--       משאירה את הבייטים ב-S3. לכן delete_client מחזירה את נתיבי הקבצים
--       והדפדפן מוחק אותם דרך ה-Storage API.
--
--   A6/A10 קישור בני זוג הוא שתי כתיבות נפרדות מהדפדפן — כישלון באמצע משאיר
--       קישור חד-כיווני. הפונקציה שהתיעוד מזכיר (`linkSpouseClients`) לא
--       הייתה קיימת, ולא היה מסלול ניתוק.
--
--   C5  מחיקת לקוח מהדפדפן היא DELETE ישיר על clients: הצעות מחיר שנשלחו
--       נשארות "נשלחה" בלי לקוח, ובקשת הייצוג נשארת עם linked_client_id ריק.
--
--  ‼ מה כאן: (1) טריגר אחד על מחיקת מסמך שמסיר את המזהה מכל מקום; (2) RPC אטומי לקישור/ניתוק בני זוג + טריגר שמנקה את הצד
--  השני במחיקה; (3) delete_client — הכניסה היחידה של הדומיין למחיקת לקוח,
--  עם תצוגה מקדימה של מה שיושפע.
--
--  ‼ מה כאן **לא**: הצעת מחיר *מאושרת* של לקוח שנמחק. מה לעשות בה (לבטל?
--  להשאיר כהיסטוריה בלי לקוח? לחסום מחיקה?) היא הכרעת מוצר — הפונקציה
--  משאירה אותה כפי שהיא (ה-FK מאפס client_id, כמו היום) ורק מסרבת למחוק
--  כשיש התקשרות חיה, אלא אם הקורא אמר במפורש p_force.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── ① מסמך שנמחק נעלם מכל מקום שהצביע אליו ─────────────────────────────────

-- פריטים עם documentId / documentIds / done (checklist, requirements).
-- ‼ done יורד רק לפריט שהראיה שלו נמחקה ולא נשאר לו שום מסמך — פריט שסומן
-- ידנית (בלי documentId מעולם) אינו נוגע.
create or replace function public.strip_document_from_items(p_items jsonb, p_doc_id text)
returns jsonb
language plpgsql
immutable
as $function$
declare
  v_out jsonb := '[]'::jsonb;
  x     jsonb;
  y     jsonb;
  v_hit boolean;
begin
  if jsonb_typeof(p_items) <> 'array' then return p_items; end if;
  for x in select * from jsonb_array_elements(p_items) loop
    y := x;
    v_hit := false;
    if (x->>'documentId') = p_doc_id then
      y := y - 'documentId';
      v_hit := true;
    end if;
    if jsonb_typeof(x->'documentIds') = 'array' and (x->'documentIds') ? p_doc_id then
      y := y || jsonb_build_object('documentIds', (
        select coalesce(jsonb_agg(v), '[]'::jsonb)
          from jsonb_array_elements(x->'documentIds') v
         where (v #>> '{}') <> p_doc_id));
      v_hit := true;
    end if;
    if v_hit and (y->>'documentId') is null
       -- ‼ coalesce: מפתח שאינו קיים נותן NULL, ו-NULL <> 'array' אינו true
       and (coalesce(jsonb_typeof(y->'documentIds'), '') <> 'array' or jsonb_array_length(y->'documentIds') = 0)
       and (x ? 'done') then
      y := (y - 'doneAt' - 'lastUploadAt') || jsonb_build_object('done', false);
    end if;
    v_out := v_out || jsonb_build_array(y);
  end loop;
  return v_out;
end;
$function$;

revoke execute on function public.strip_document_from_items(jsonb, text) from public, anon, authenticated;
grant  execute on function public.strip_document_from_items(jsonb, text) to service_role;

-- ה-payload השלם של שלב (payload וגם draft_payload).
-- ‼ clientResources: משאב שהקובץ שלו נמחק יורד יחד עם דרישת "פתיחת X" שלו
-- (אותו key) — אחרת הבקשה לא הייתה נסגרת לעולם, כי אי אפשר לפתוח קובץ שאינו.
create or replace function public.strip_document_references(p_payload jsonb, p_doc_id text)
returns jsonb
language plpgsql
immutable
as $function$
declare
  v      jsonb := p_payload;
  v_keys text[];
begin
  if v is null or jsonb_typeof(v) <> 'object' then return v; end if;

  if jsonb_typeof(v->'checklist') = 'array' then
    v := v || jsonb_build_object('checklist', public.strip_document_from_items(v->'checklist', p_doc_id));
  end if;

  if jsonb_typeof(v->'clientResources') = 'array' then
    select coalesce(array_agg(x->>'key'), '{}')
      into v_keys
      from jsonb_array_elements(v->'clientResources') x
     where (x->>'documentId') = p_doc_id and (x->>'key') is not null;
    v := v || jsonb_build_object('clientResources', (
      select coalesce(jsonb_agg(x order by ord), '[]'::jsonb)
        from jsonb_array_elements(v->'clientResources') with ordinality t(x, ord)
       where (x->>'documentId') is distinct from p_doc_id));
    if array_length(v_keys, 1) > 0 and jsonb_typeof(v->'requirements') = 'array' then
      v := v || jsonb_build_object('requirements', (
        select coalesce(jsonb_agg(x order by ord), '[]'::jsonb)
          from jsonb_array_elements(v->'requirements') with ordinality t(x, ord)
         where not ((x->>'key') = any(v_keys))));
    end if;
  end if;

  if jsonb_typeof(v->'requirements') = 'array' then
    v := v || jsonb_build_object('requirements', public.strip_document_from_items(v->'requirements', p_doc_id));
  end if;

  -- 124: ההעלאה המרוכזת של הרו"ח הקודם, וההסרה הרכה שלה
  if jsonb_typeof(v->'bulkUploads') = 'array' then
    v := v || jsonb_build_object('bulkUploads', (
      select coalesce(jsonb_agg(x order by ord), '[]'::jsonb)
        from jsonb_array_elements(v->'bulkUploads') with ordinality t(x, ord)
       where (x->>'documentId') is distinct from p_doc_id));
  end if;
  if jsonb_typeof(v->'removedUploads') = 'array' then
    v := v || jsonb_build_object('removedUploads', (
      select coalesce(jsonb_agg(x order by ord), '[]'::jsonb)
        from jsonb_array_elements(v->'removedUploads') with ordinality t(x, ord)
       where (x->>'documentId') is distinct from p_doc_id));
  end if;

  return v;
end;
$function$;

revoke execute on function public.strip_document_references(jsonb, text) from public, anon, authenticated;
grant  execute on function public.strip_document_references(jsonb, text) to service_role;

-- ‼ הטריגר יושב ליד המחיקה עצמה (כמו 124): מחיקה קורית מתיק המסמכים, ממחיקה
-- מרובה, ממחיקת לקוח (CASCADE) ומתחזוקה ידנית — כולן עוברות כאן.
-- ‼ הסינון המקדים הוא חיפוש טקסטואלי של המזהה בגוף ה-jsonb: זול, ומבטיח
-- שרק שורות שבאמת מזכירות את המסמך נכתבות מחדש (updated_at לא זז לאחרות).
create or replace function public.forget_deleted_document_references()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  rr record;
begin
  -- שלבי קליטה: payload + draft_payload
  update public.onboarding_steps s
     set payload = public.strip_document_references(s.payload, OLD.id),
         draft_payload = public.strip_document_references(s.draft_payload, OLD.id)
   where s.user_id = OLD.user_id
     and (position(OLD.id in coalesce(s.payload::text, '')) > 0
       or position(OLD.id in coalesce(s.draft_payload::text, '')) > 0);

  -- בקשת ייצוג: הקבצים שהלקוח העלה, צילומי הזהות, וטופסי החתימה
  for rr in
    select r.id from public.representation_requests r
     where r.user_id = OLD.user_id
       and (position(OLD.id in coalesce(r.submission::text, '')) > 0
         or position(OLD.id in coalesce(r.identity_docs::text, '')) > 0
         or position(OLD.id in coalesce(r.signature_documents::text, '')) > 0
         or (r.signature_setup->>'pdfDocId') = OLD.id
         or r.signed_pdf_path = OLD.id)
  loop
    update public.representation_requests r
       set submission = case
             when jsonb_typeof(r.submission->'uploadedDocs') = 'array'
             then r.submission || jsonb_build_object('uploadedDocs', (
                    select coalesce(jsonb_agg(x order by ord), '[]'::jsonb)
                      from jsonb_array_elements(r.submission->'uploadedDocs') with ordinality t(x, ord)
                     where (x->>'storedDocId') is distinct from OLD.id))
             else r.submission end,
           identity_docs = case
             when jsonb_typeof(r.identity_docs) = 'object'
             then (select coalesce(jsonb_object_agg(e.k, case
                            when jsonb_typeof(e.v) = 'array'
                            then (select coalesce(jsonb_agg(x order by ord), '[]'::jsonb)
                                    from jsonb_array_elements(e.v) with ordinality t(x, ord)
                                   where (x->>'documentId') is distinct from OLD.id)
                            else e.v end), '{}'::jsonb)
                     from jsonb_each(r.identity_docs) e(k, v))
             else r.identity_docs end,
           signature_documents = case
             when jsonb_typeof(r.signature_documents) = 'array'
             then (select coalesce(jsonb_agg(
                            case when (x->>'signedPdfStoredId') = OLD.id
                                 then x || jsonb_build_object('signedPdfStoredId', null)
                                 else x end order by ord), '[]'::jsonb)
                     from jsonb_array_elements(r.signature_documents) with ordinality t(x, ord)
                    where (x->>'pdfDocId') is distinct from OLD.id)
             else r.signature_documents end
     where r.id = rr.id;

    -- ‼ השדות הישנים הם מראה של המסמך הראשון (withLegacyMirror בדפדפן):
    -- כשיש רשימה — נגזרים ממנה מחדש; כשאין (בקשה ותיקה) — מתאפסים רק אם
    -- הצביעו למסמך שנמחק.
    update public.representation_requests r
       set signature_setup = case
             when jsonb_typeof(r.signature_documents) = 'array' then
               case when jsonb_array_length(r.signature_documents) = 0 then null
                    else jsonb_build_object(
                           'pdfDocId',    r.signature_documents->0->'pdfDocId',
                           'pdfFileName', r.signature_documents->0->'pdfFileName',
                           'fields',      r.signature_documents->0->'fields',
                           'createdAt',   r.signature_documents->0->'createdAt') end
             when (r.signature_setup->>'pdfDocId') = OLD.id then null
             else r.signature_setup end,
           signed_pdf_path = case
             when jsonb_typeof(r.signature_documents) = 'array' then
               nullif(r.signature_documents->0->>'signedPdfStoredId', '')
             when r.signed_pdf_path = OLD.id then null
             else r.signed_pdf_path end
     where r.id = rr.id;
  end loop;

  -- ‼ הקובץ עצמו **אינו** נמחק כאן, בכוונה. Supabase חוסמת DELETE ישיר על
  -- storage.objects (הטריגר protect_objects_delete, גם בפרודקשן וגם
  -- בסטייג'ינג): מחיקת השורה בלבד הייתה משאירה את הבייטים ב-S3 יתומים
  -- לתמיד — בדיוק הבעיה שרצינו לפתור, רק בלתי נראית. הקובץ נמחק דרך
  -- ה-Storage API בלבד: deleteDoc בדפדפן, ו-delete_client מחזירה את רשימת
  -- הנתיבים כדי שהקורא ימחק אותם אחרי שהשורות ירדו (מדיניות המחיקה באחסון
  -- היא לפי תיקיית המשתמש, לא לפי שורת documents, ולכן זה עובד גם אז).

  return OLD;
end;
$function$;

-- 124 נבלע כאן: אותו טריגר, שם חדש, כיסוי רחב יותר.
drop trigger if exists documents_forget_prev_accountant_upload on public.documents;
drop trigger if exists documents_forget_deleted_references on public.documents;
create trigger documents_forget_deleted_references
  after delete on public.documents
  for each row execute function public.forget_deleted_document_references();

-- ─── ② קישור בני זוג — אטומי, דו-כיווני, וניתן לניתוק ──────────────────────

-- ‼ נעילה בסדר מזהים קבוע: שני קישורים מקבילים על אותו זוג לא יכולים להינעל
-- זה מול זה. שני הכרטיסים חייבים להיות של הקורא; כרטיס שכבר מקושר לאדם
-- שלישי אינו נדרס בשקט — זה כישלון שהמשתמש צריך לראות.
-- ‼ "בן/בת הזוג הוא הלקוח שלנו" סותר "מיוצג במקום אחר", ולכן הדגל יורד
-- בשני הצדדים (כפי שהדפדפן כבר כתב ב-handleSpousePromotion).
create or replace function public.link_spouse_clients(p_a text, p_b text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  a     public.clients%rowtype;
  b     public.clients%rowtype;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_a is null or p_b is null or p_a = p_b then
    return jsonb_build_object('ok', false, 'error', 'same_client');
  end if;

  select * into a from public.clients where id = least(p_a, p_b) for update;
  select * into b from public.clients where id = greatest(p_a, p_b) for update;
  if a.id is null or b.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if a.user_id <> v_uid or b.user_id <> v_uid then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if a.spouse_client_id is not null and a.spouse_client_id <> b.id then
    return jsonb_build_object('ok', false, 'error', 'already_linked', 'client_id', a.id, 'linked_to', a.spouse_client_id);
  end if;
  if b.spouse_client_id is not null and b.spouse_client_id <> a.id then
    return jsonb_build_object('ok', false, 'error', 'already_linked', 'client_id', b.id, 'linked_to', b.spouse_client_id);
  end if;

  update public.clients set spouse_client_id = b.id, spouse_represented_elsewhere = false where id = a.id;
  update public.clients set spouse_client_id = a.id, spouse_represented_elsewhere = false where id = b.id;
  return jsonb_build_object('ok', true, 'a', a.id, 'b', b.id);
end;
$function$;

revoke execute on function public.link_spouse_clients(text, text) from public, anon;
grant  execute on function public.link_spouse_clients(text, text) to authenticated, service_role;

-- ניתוק: שני הצדדים מתאפסים, וגם כל כרטיס אחר שמצביע לכאן (שריד חד-כיווני).
-- ‼ השדות השטוחים של בן/בת הזוג (spouse_name וכו') נשארים — הם מתארים אדם
-- שעדיין קיים, רק אינו כרטיס יותר. וכך גם תיק המס של בן/בת הזוג (tax_files
-- owner='spouse'): הכרעת מוצר, לא ניקוי טכני.
create or replace function public.unlink_spouse_clients(p_a text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid     uuid := auth.uid();
  v_owner   uuid;
  v_partner text;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select user_id, spouse_client_id into v_owner, v_partner
    from public.clients where id = p_a for update;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_owner <> v_uid then raise exception 'forbidden' using errcode = '42501'; end if;

  update public.clients set spouse_client_id = null where id = p_a and spouse_client_id is not null;
  update public.clients set spouse_client_id = null
   where spouse_client_id = p_a and user_id = v_uid;
  return jsonb_build_object('ok', true, 'client_id', p_a, 'partner', v_partner);
end;
$function$;

revoke execute on function public.unlink_spouse_clients(text) from public, anon;
grant  execute on function public.unlink_spouse_clients(text) to authenticated, service_role;

-- ‼ ה-FK כבר מאפס את הצד השני (on delete set null). הטריגר הופך את זה
-- למפורש ומכסה גם שריד חד-כיווני שה-FK לא היה רואה מהצד הזה.
create or replace function public.clear_spouse_link_before_client_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.clients set spouse_client_id = null where spouse_client_id = OLD.id;
  return OLD;
end;
$function$;

drop trigger if exists clients_clear_spouse_link on public.clients;
create trigger clients_clear_spouse_link
  before delete on public.clients
  for each row execute function public.clear_spouse_link_before_client_delete();

-- ─── ③ מחיקת לקוח — כניסה אחת, עם תצוגה מקדימה ─────────────────────────────

-- מה יושפע. ‼ אותם מספרים בדיוק שהמחיקה תפעל עליהם — הדיאלוג מציג את זה
-- ולא סופר בעצמו טבלה-טבלה, כדי שלא יהיה פער בין מה שנאמר למה שקורה.
create or replace function public.delete_client_preview(p_client_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  c     public.clients%rowtype;
  v_partner text;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then raise exception 'forbidden' using errcode = '42501'; end if;

  select trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into v_partner
    from public.clients where id = c.spouse_client_id;

  return jsonb_build_object(
    'ok', true,
    'tasks',            (select count(*) from public.tasks t where t.client_id = c.id),
    'open_tasks',       (select count(*) from public.tasks t where t.client_id = c.id and t.status is distinct from 'done'),
    'documents',        (select count(*) from public.documents d where d.client_id = c.id),
    'onboarding_steps', (select count(*) from public.onboarding_steps s where s.client_id = c.id),
    'annual_reports',   (select count(*) from public.annual_report_sessions a where a.client_id = c.id),
    'requests',         (select count(*) from public.representation_requests r where r.linked_client_id = c.id),
    'emails',           (select count(*) from public.email_messages m where m.client_id = c.id),
    'quotations_open',     (select count(*) from public.quotations q where q.client_id = c.id and q.status in ('draft','sent','viewed')),
    'quotations_approved', (select count(*) from public.quotations q where q.client_id = c.id and q.status = 'approved'),
    'quotations_other',    (select count(*) from public.quotations q where q.client_id = c.id and q.status in ('cancelled','expired')),
    'live_engagements', (select count(*) from public.engagements e where e.client_id = c.id and e.status in ('onboarding','active','scheduled')),
    'leads',            (select count(*) from public.leads l where l.converted_client_id = c.id or l.match_client_id = c.id),
    'spouse_client_id', c.spouse_client_id,
    'spouse_name',      nullif(v_partner, '')
  );
end;
$function$;

revoke execute on function public.delete_client_preview(text) from public, anon;
grant  execute on function public.delete_client_preview(text) to authenticated, service_role;

-- המחיקה עצמה.
-- ‼ סדר: קודם מבטלים הצעות פתוחות ומוחקים בקשות ייצוג — בזמן שהלקוח עדיין
-- קיים, כדי שהטריגרים שלהן (ביטול התקשרות מתוזמנת, מחיקת חיובים ממתינים,
-- סנכרון שלב הלקוח) ירוצו על שורה חיה. רק אז DELETE על הכרטיס, וה-CASCADE
-- עושה את השאר (משימות, מסמכים ⇒ קבצים, שלבים, התקשרויות, חיובים).
-- ‼ הליד שהומר מוחזר ע"י טריגר נפרד על מחיקת לקוח (אשכול D) — לא כאן.
-- ‼ הצעה מאושרת נשארת כפי שהיא (הכרעת מוצר פתוחה, ראה כותרת הקובץ).
create or replace function public.delete_client(p_client_id text, p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  c     public.clients%rowtype;
  v_live int;
  v_cancelled int := 0;
  v_requests  int := 0;
  v_request_ids text[];
  v_storage_paths text[];
begin
  select * into c from public.clients where id = p_client_id for update;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then raise exception 'forbidden' using errcode = '42501'; end if;

  select count(*) into v_live
    from public.engagements e
   where e.client_id = c.id and e.status in ('onboarding','active','scheduled')
     and exists (select 1 from public.quotations q where q.id = e.quotation_id and q.status = 'approved');
  if v_live > 0 and not coalesce(p_force, false) then
    return jsonb_build_object('ok', false, 'error', 'active_engagement', 'live_engagements', v_live);
  end if;

  -- הצעות שטרם אושרו — מבוטלות, עם אירוע שאומר למה
  update public.quotations q
     set status = 'cancelled',
         cancelled_at = now(),
         events = coalesce(q.events, '[]'::jsonb)
                  || jsonb_build_object('type', 'client_deleted', 'at', now(),
                                        'note', 'כרטיס הלקוח נמחק')
   where q.client_id = c.id and q.status in ('draft','sent','viewed');
  get diagnostics v_cancelled = row_count;

  -- הקבצים באחסון — נאספים לפני שה-CASCADE מוחק את השורות שמצביעות אליהם.
  -- ‼ מוחזרים לקורא ולא נמחקים כאן (ראה forget_deleted_document_references).
  select coalesce(array_agg(d.storage_path), '{}') into v_storage_paths
    from public.documents d
   where d.client_id = c.id and d.storage_path is not null;

  -- בקשות ייצוג — אין להן קיום בלי הלקוח שהן מייצגות
  select coalesce(array_agg(id), '{}') into v_request_ids
    from public.representation_requests where linked_client_id = c.id;
  v_requests := coalesce(array_length(v_request_ids, 1), 0);
  if v_requests > 0 then
    update public.quotations set representation_request_id = null
     where representation_request_id = any(v_request_ids);
    delete from public.representation_requests where id = any(v_request_ids);
  end if;

  delete from public.clients where id = c.id;

  return jsonb_build_object(
    'ok', true,
    'client_id', c.id,
    'quotations_cancelled', v_cancelled,
    'requests_deleted', v_requests,
    'storage_paths', to_jsonb(v_storage_paths),
    'forced', v_live > 0);
end;
$function$;

revoke execute on function public.delete_client(text, boolean) from public, anon;
grant  execute on function public.delete_client(text, boolean) to authenticated, service_role;

-- ─── ניקוי הפניות תלויות שכבר נוצרו (רק למסמכים שאינם קיימים) ──────────────
-- ‼ שלבי קליטה עם מסמך שאינו קיים ב-documents. אותה פונקציה בדיוק שהטריגר
-- מריץ, מזהה-מזהה, ולכן התוצאה זהה למה שהיה קורה לו הטריגר היה קיים אז.
do $do$
declare
  rec record;
begin
  for rec in
    select distinct s.id as step_id, x.doc_id
      from public.onboarding_steps s
      cross join lateral (
        select i->>'documentId' as doc_id
          from jsonb_array_elements(case when jsonb_typeof(s.payload->'checklist')='array' then s.payload->'checklist' else '[]'::jsonb end) i
         where i->>'documentId' is not null
        union
        select v #>> '{}'
          from jsonb_array_elements(case when jsonb_typeof(s.payload->'checklist')='array' then s.payload->'checklist' else '[]'::jsonb end) i
          cross join lateral jsonb_array_elements(case when jsonb_typeof(i->'documentIds')='array' then i->'documentIds' else '[]'::jsonb end) v
        union
        select i->>'documentId'
          from jsonb_array_elements(case when jsonb_typeof(s.payload->'requirements')='array' then s.payload->'requirements' else '[]'::jsonb end) i
         where i->>'documentId' is not null
        union
        select v #>> '{}'
          from jsonb_array_elements(case when jsonb_typeof(s.payload->'requirements')='array' then s.payload->'requirements' else '[]'::jsonb end) i
          cross join lateral jsonb_array_elements(case when jsonb_typeof(i->'documentIds')='array' then i->'documentIds' else '[]'::jsonb end) v
        union
        select i->>'documentId'
          from jsonb_array_elements(case when jsonb_typeof(s.payload->'clientResources')='array' then s.payload->'clientResources' else '[]'::jsonb end) i
         where i->>'documentId' is not null
        union
        select i->>'documentId'
          from jsonb_array_elements(case when jsonb_typeof(s.payload->'bulkUploads')='array' then s.payload->'bulkUploads' else '[]'::jsonb end) i
        union
        select i->>'documentId'
          from jsonb_array_elements(case when jsonb_typeof(s.payload->'removedUploads')='array' then s.payload->'removedUploads' else '[]'::jsonb end) i
      ) x
     where x.doc_id is not null
       and not exists (select 1 from public.documents d where d.id = x.doc_id)
  loop
    update public.onboarding_steps
       set payload = public.strip_document_references(payload, rec.doc_id),
           draft_payload = public.strip_document_references(draft_payload, rec.doc_id)
     where id = rec.step_id;
  end loop;

  -- בקשת ייצוג שה-PDF שלה נמחק (בפרודקשן: אחת, בסטטוס active — היסטוריה)
  update public.representation_requests r
     set signature_setup = null
   where r.signature_setup->>'pdfDocId' is not null
     and not exists (select 1 from public.documents d where d.id = r.signature_setup->>'pdfDocId')
     and r.signature_documents is null;
  update public.representation_requests r
     set signed_pdf_path = null
   where r.signed_pdf_path is not null
     and not exists (select 1 from public.documents d where d.id = r.signed_pdf_path)
     and r.signature_documents is null;
end
$do$;

select public.assert_domain_function_invariants();
