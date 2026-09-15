-- ═══════════════════════════════════════════════════════════════════════════
--  165 — גבולות הרשאה: RLS, טוקנים ציבוריים, חזרה על הגשה, מכתב שחרור, התאמת לקוח
-- ═══════════════════════════════════════════════════════════════════════════
--  סבב סגירת ספר הפערים (2026-09-09), אשכול א׳ — הרשאות / טוקנים / גבול בין
--  משרדים. כל סעיף כאן אומת קודם מול הפרודקשן (קריאה בלבד), והגופים של
--  הפונקציות נלקחו מהפרודקשן מילה במילה; מה שהשתנה מסומן "165".
--
--  PF6  — שש טבלאות בלי שער המורשים (require_authorized) ב-RLS.
--  PF11 — get_quotation החזירה הצעה מבוטלת/פגה במלואה, כולל טוקן הקליטה;
--         user_id_for_public_token לא כיבד את תפוגת טוקן הדף האישי.
--  PF3  — submit_onboarding_full קיבלה הגשה חוזרת ודרסה זהות, סטטוס וחותמים.
--  JF26/PF17 — release_portal_sign בלי קורא ועם כוח להשלים מכתב מבוטל;
--         טוקן השחרור המשיך לעבוד גם אחרי ביטול המכתב.
--  H1   — open_quotation_representation הצמידה הצעה לכרטיס שרירותי לפי מייל.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── PF6 · שער המורשים על הטבלאות שנשארו בחוץ ───────────────────────────────
--  ‼ מיגרציה 15 הוסיפה מדיניות RESTRICTIVE "חייב להיות מורשה" לכל טבלה שהייתה
--  קיימת אז. טבלאות שנולדו אחר כך קיבלו רק "השורה שלך" — ומשתמש מחובר שאינו
--  ברשימת המורשים (יש כאלה בפרודקשן) קרא וכתב בהן חופשי דרך ה-API.
--  service_role עוקף RLS ולכן העובד המקומי ופונקציות הקצה אינם מושפעים.
do $$
declare
  t text;
begin
  foreach t in array array[
    'additional_charges', 'tax_fact_changes',
    'automation_jobs', 'automation_workers',
    'journey_templates', 'office_journey_defaults'
  ] loop
    execute format('drop policy if exists require_authorized on public.%I', t);
    execute format(
      'create policy require_authorized on public.%I '
      || 'as restrictive for all to authenticated '
      || 'using (public.is_authorized()) with check (public.is_authorized())', t);
  end loop;
end $$;

-- ── PF11 · הצעה מבוטלת/פגה אינה חושפת תוכן ולא טוקן ────────────────────────
--  ‼ עד כאן get_quotation לא הסתכלה על הסטטוס בכלל: מי שהחזיק קישור להצעה
--  שבוטלה קיבל את כל הפריטים, ובהצעה שכבר אושרה ואז בוטלה — גם את
--  onboardingToken, שהוא הדלת לטופס הזיהוי. הכלל: מבוטלת/פגה מחזירה מעטפה
--  בלבד (מספר, סטטוס, מיתוג, שם הנמען) — מספיק כדי שהדף יציג "ההצעה בוטלה"
--  במיתוג המשרד, ולא יותר. כלל התפוגה זהה ל-approve_quotation (161): הצעה
--  שעדיין ממתינה ללקוח ותאריך התוקף שלה עבר — פגה. מאושרת אינה פגה לעולם.
create or replace function public.get_quotation(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  q        public.quotations%rowtype;
  v_status text;
  v_firm   jsonb;
  v_name   text;
begin
  select * into q from public.quotations where public_token = p_token limit 1;
  if q.id is null then return null; end if;

  select jsonb_build_object(
           'firmName', p.firm_name,
           'branding', p.branding,
           'email', p.email,
           'phone', p.phone,
           'address', p.address,
           'emailSignature', p.communication->>'emailSignature')
    into v_firm
    from public.profiles p where p.id = q.user_id;
  v_firm := coalesce(v_firm, '{}'::jsonb);

  select coalesce(q.snapshot->>'recipientName', l.full_name,
                  nullif(trim(coalesce(c.first_name,'')||' '||coalesce(c.last_name,'')), ''))
    into v_name
    from (select 1) x
    left join public.leads l   on l.id = q.lead_id
    left join public.clients c on c.id = q.client_id;

  v_status := q.status;
  if v_status not in ('approved', 'cancelled', 'expired')
     and q.expires_at is not null and q.expires_at < now() then
    v_status := 'expired';
  end if;

  if v_status in ('cancelled', 'expired') then
    return jsonb_build_object(
      'quotationNumber', q.quotation_number,
      'status', v_status,
      'expiresAt', q.expires_at,
      'vatRate', coalesce((q.snapshot->>'vatRate')::numeric, q.vat_rate),
      'recipientName', v_name,
      'items', '[]'::jsonb,
      'firm', v_firm);
  end if;

  return jsonb_build_object(
    'quotationNumber', q.quotation_number,
    'status', v_status,
    'revision', q.revision,
    'expiresAt', q.expires_at,
    'vatRate', coalesce((q.snapshot->>'vatRate')::numeric, q.vat_rate),
    'recipientName', v_name,
    'businessName', coalesce(q.snapshot->>'businessName',
                             (select l.business_name from public.leads l where l.id = q.lead_id)),
    'notesForClient', coalesce(q.snapshot->>'notesForClient', q.notes_for_client),
    'items', coalesce(q.snapshot->'items', q.items),
    'futureServices', coalesce(q.snapshot->'futureServices', q.future_services),
    'representation', coalesce(q.snapshot->'representation', q.representation),
    'onboardingToken', (
      select r.onboarding_token from public.representation_requests r
      where r.id = q.representation_request_id
    ),
    'firm', v_firm);
end;
$function$;

revoke execute on function public.get_quotation(text) from public, anon;
grant  execute on function public.get_quotation(text) to anon, authenticated, service_role;

-- ── PF11 · תפוגת טוקן הדף האישי — אותו כלל בכל דלת ─────────────────────────
--  get_client_portal ו-portal_submit_step (97) בודקות portal_token_expires_at;
--  user_id_for_public_token לא. ומכתב שחרור שבוטל — הטוקן שלו אינו מזהה יותר.
create or replace function public.user_id_for_public_token(p_token text)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select user_id from public.quotations where public_token = p_token
  union all
  select user_id from public.representation_requests where onboarding_token = p_token
  union all
  select r.user_id from public.representation_requests r
    where exists (select 1 from jsonb_array_elements(coalesce(r.signers, '[]'::jsonb)) s
                  where s->>'signToken' = p_token)
  union all
  select user_id from public.clients
    where portal_token = p_token
      and (portal_token_expires_at is null or portal_token_expires_at >= now())
  union all
  select user_id from public.onboarding_steps
    where step_type = 'release_letter' and payload->>'releaseToken' = p_token
      and status <> 'cancelled'
  limit 1;
$function$;

revoke execute on function public.user_id_for_public_token(text) from public, anon, authenticated;
grant  execute on function public.user_id_for_public_token(text) to service_role;

-- ── PF3 · הגשה חוזרת של טופס הזיהוי ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_onboarding_full(p_token text, p_first_name text, p_last_name text, p_id_number text, p_birth_date text, p_secondary_type text, p_secondary_value text, p_phone text, p_email text, p_city text, p_address text, p_family_status text, p_family_status_year integer, p_spouse_name text, p_spouse_email text, p_spouse_id_number text, p_spouse_first_name text DEFAULT NULL::text, p_spouse_last_name text DEFAULT NULL::text, p_spouse_birth_year integer DEFAULT NULL::integer, p_spouse_birth_date text DEFAULT NULL::text, p_spouse_secondary_type text DEFAULT NULL::text, p_spouse_secondary_value text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_req         public.representation_requests;
  v_full_name   text := trim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''));
  v_spouse_full text := coalesce(
    nullif(trim(coalesce(p_spouse_first_name, '') || ' ' || coalesce(p_spouse_last_name, '')), ''),
    nullif(trim(coalesce(p_spouse_name, '')), ''));
  v_signers     jsonb;
  v_spouse      jsonb;
begin
  select * into v_req from public.representation_requests where onboarding_token = p_token limit 1;
  if not found then
    return false;
  end if;

  -- ‼ 165 (PF3): שער חזרה. עד כאן הפונקציה קיבלה כל הגשה — גם על בקשה שכבר
  -- הוגשה, נחתמה או הופעלה — ודרסה את הזהות, החזירה את הסטטוס ל-
  -- awaiting_accountant ובנתה מחדש את רשימת החותמים. הדף עצמו לא מציג את
  -- הטופס אחרי ההגשה, אבל הפונקציה פתוחה ל-anon עם הטוקן בלבד. הכלל זהה
  -- לדלת האחות onboarding-upload-id: אחרי ההגשה הקישור אינו ערוץ כתיבה.
  if v_req.onboarding_status = 'submitted' or v_req.status <> 'pending_fill' then
    return false;
  end if;

  v_signers := coalesce(v_req.signers, '[]'::jsonb);
  if jsonb_array_length(v_signers) = 0 then
    v_signers := jsonb_build_array(jsonb_build_object(
      'id', 'client', 'role', 'client', 'signStatus', 'pending',
      'signToken', replace(gen_random_uuid()::text, '-', '')
    ));
  end if;

  v_signers := (
    select jsonb_agg(
      case when s->>'role' = 'client'
        then s
             || jsonb_build_object('name', v_full_name, 'email', coalesce(p_email, s->>'email', ''))
             || case when coalesce(s->>'signToken', '') = ''
                  then jsonb_build_object('signToken', replace(gen_random_uuid()::text, '-', ''))
                  else '{}'::jsonb end
        else s
      end
    )
    from jsonb_array_elements(v_signers) s
  );

  if p_family_status = 'married' and v_spouse_full is not null then
    select s into v_spouse from jsonb_array_elements(v_signers) s where s->>'role' = 'spouse' limit 1;
    v_spouse := coalesce(v_spouse, jsonb_build_object(
      'id', 'spouse', 'role', 'spouse', 'signStatus', 'pending',
      'signToken', replace(gen_random_uuid()::text, '-', '')
    )) || jsonb_build_object(
      'name', v_spouse_full,
      'email', coalesce(nullif(trim(coalesce(p_spouse_email, '')), ''), v_spouse->>'email', '')
    );
    v_signers := (
      select coalesce(jsonb_agg(s), '[]'::jsonb)
      from jsonb_array_elements(v_signers) s where s->>'role' <> 'spouse'
    ) || jsonb_build_array(v_spouse);
  elsif coalesce(nullif(trim(coalesce(p_family_status, '')), ''), '') <> '' then
    v_signers := (
      select coalesce(jsonb_agg(s), '[]'::jsonb)
      from jsonb_array_elements(v_signers) s
      where s->>'role' <> 'spouse' or s->>'signStatus' = 'signed'
    );
  end if;

  update public.representation_requests
    set identification = coalesce(identification, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
          'firstName',        nullif(trim(coalesce(p_first_name, '')), ''),
          'lastName',         nullif(trim(coalesce(p_last_name, '')), ''),
          'idNumber',         nullif(trim(coalesce(p_id_number, '')), ''),
          'birthDate',        nullif(trim(coalesce(p_birth_date, '')), ''),
          'secondaryType',    nullif(trim(coalesce(p_secondary_type, '')), ''),
          'secondaryValue',   nullif(trim(coalesce(p_secondary_value, '')), ''),
          'phone',            nullif(trim(coalesce(p_phone, '')), ''),
          'email',            nullif(trim(coalesce(p_email, '')), ''),
          'city',             nullif(trim(coalesce(p_city, '')), ''),
          'address',          nullif(trim(coalesce(p_address, '')), ''),
          'familyStatus',     nullif(trim(coalesce(p_family_status, '')), ''),
          'familyStatusYear', p_family_status_year,
          'spouseName',       v_spouse_full,
          'spouseFirstName',  nullif(trim(coalesce(p_spouse_first_name, '')), ''),
          'spouseLastName',   nullif(trim(coalesce(p_spouse_last_name, '')), ''),
          'spouseBirthYear',  p_spouse_birth_year,
          'spouseEmail',      nullif(trim(coalesce(p_spouse_email, '')), ''),
          'spouseIdNumber',   nullif(trim(coalesce(p_spouse_id_number, '')), ''),
          'spouseBirthDate',      nullif(trim(coalesce(p_spouse_birth_date, '')), ''),
          'spouseSecondaryType',  nullif(trim(coalesce(p_spouse_secondary_type, '')), ''),
          'spouseSecondaryValue', nullif(trim(coalesce(p_spouse_secondary_value, '')), '')
        )),
        client_name       = coalesce(nullif(v_full_name, ''), client_name),
        client_email      = coalesce(nullif(trim(coalesce(p_email, '')), ''), client_email),
        signers           = v_signers,
        onboarding_status = 'submitted',
        onboarding_submitted_at = now(),
        status            = 'awaiting_accountant',
        updated_at        = now()
    where id = v_req.id;

  if v_req.linked_client_id is not null then
    update public.clients
      set first_name      = coalesce(nullif(trim(coalesce(p_first_name, '')), ''), first_name),
          last_name       = coalesce(nullif(trim(coalesce(p_last_name, '')), ''), last_name),
          id_number       = coalesce(nullif(trim(coalesce(p_id_number, '')), ''), id_number),
          birth_date      = coalesce(nullif(trim(coalesce(p_birth_date, '')), '')::date, birth_date),
          phone           = coalesce(nullif(trim(coalesce(p_phone, '')), ''), phone),
          email           = coalesce(nullif(trim(coalesce(p_email, '')), ''), email),
          city            = coalesce(nullif(trim(coalesce(p_city, '')), ''), city),
          address         = coalesce(nullif(trim(coalesce(p_address, '')), ''), address),
          family_status   = coalesce(nullif(trim(coalesce(p_family_status, '')), ''), family_status),
          marriage_year   = case when p_family_status = 'married'  then coalesce(p_family_status_year, marriage_year)  else marriage_year  end,
          divorce_year    = case when p_family_status = 'divorced' then coalesce(p_family_status_year, divorce_year)   else divorce_year   end,
          widowhood_year  = case when p_family_status = 'widowed'  then coalesce(p_family_status_year, widowhood_year) else widowhood_year end,
          spouse_name       = coalesce(v_spouse_full, spouse_name),
          spouse_first_name = coalesce(nullif(trim(coalesce(p_spouse_first_name, '')), ''), spouse_first_name),
          spouse_last_name  = coalesce(nullif(trim(coalesce(p_spouse_last_name, '')), ''), spouse_last_name),
          spouse_birth_year = coalesce(
            p_spouse_birth_year,
            (substring(coalesce(p_spouse_birth_date, '') from '^\d{4}'))::integer,
            spouse_birth_year),
          spouse_id_number  = coalesce(nullif(trim(coalesce(p_spouse_id_number, '')), ''), spouse_id_number),
          spouse_email      = coalesce(nullif(trim(coalesce(p_spouse_email, '')), ''), spouse_email),
          representation_status = 'awaiting_accountant',
          updated_at      = now()
      where id = v_req.linked_client_id;
  end if;

  return true;
end;
$function$;

revoke execute on function public.submit_onboarding_full(text, text, text, text, text, text, text, text, text, text, text, text, integer, text, text, text, text, text, integer, text, text, text) from public, anon;
grant  execute on function public.submit_onboarding_full(text, text, text, text, text, text, text, text, text, text, text, text, integer, text, text, text, text, text, integer, text, text, text) to anon, authenticated, service_role;

-- ── JF26 / PF17 · דף הרו"ח הקודם ───────────────────────────────────────────
--  ‼ release_portal_sign: הממשק הפסיק לקרוא לה (הכרעת גיא 2026-08-18 — לא
--  מבקשים חתימה מהרו"ח הקודם), היא נסגרה ל-anon ב-160, ובכל זאת נשארה בשרת
--  עם היכולת להפוך מכתב מבוטל או שהושלם ל"הושלם" ולפתוח את מה שתלוי בו.
--  קוד מת עם כוח — נמחק. חתימות שכבר נאספו נשארות ב-payload ומוצגות כהיסטוריה.
drop function if exists public.release_portal_sign(text, text, text);

--  ‼ טוקן השחרור לא פג ולא בוטל מעולם: מכתב שהמשרד ביטל המשיך לפתוח את הדף,
--  לקבל סימונים ותשובות ולהעלות קבצים. אין עמודת תפוגה לטוקן הזה — ובמכוון
--  לא הומצאה כאן אחת (הכרעת מוצר, ראה דו"ח). מה שכן: ביטול המכתב מבטל את
--  הטוקן, באותו תנאי בכל חמש הפונקציות. הגופים זהים לפרודקשן פרט לשורה הזו.
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
   where step_type = 'release_letter' and payload->>'releaseToken' = p_token
     -- ‼ 165: מכתב שבוטל = הטוקן שלו מת. אותו תנאי בכל חמש הדלתות.
     and status <> 'cancelled' limit 1;
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
             'declaredByRecipient', coalesce((x->>'declaredByRecipient')::boolean, false),
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

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', x->>'documentId',
             'name', coalesce(nullif(x->>'fileName',''), 'קובץ'),
             'at', x->>'at') order by ord), '[]'::jsonb)
      into v_ups
      from jsonb_array_elements(coalesce(m.payload->'bulkUploads','[]'::jsonb)) with ordinality t(x, ord);
  end if;

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

revoke execute on function public.get_release_portal(text) from public, anon;
grant  execute on function public.get_release_portal(text) to anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.release_portal_set_item(p_token text, p_key text, p_done boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s         public.onboarding_steps%rowtype;
  m         public.onboarding_steps%rowtype;
  v_item    jsonb;
  v_list    jsonb;
  v_remain  int;
  v_label   text;
  v_client  text;
begin
  select * into s from public.onboarding_steps
   where step_type = 'release_letter' and payload->>'releaseToken' = p_token
     -- ‼ 165: מכתב שבוטל = הטוקן שלו מת. אותו תנאי בכל חמש הדלתות.
     and status <> 'cancelled' limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  select * into m from public.onboarding_steps
    where client_id = s.client_id and step_type = 'materials_received'
      and status <> 'cancelled' limit 1;
  if m.id is null then return jsonb_build_object('ok', false, 'error', 'no_materials_step'); end if;

  select x into v_item
    from jsonb_array_elements(coalesce(m.payload->'checklist','[]'::jsonb)) x
   where x->>'key' = p_key limit 1;
  if v_item is null then return jsonb_build_object('ok', false, 'error', 'item_not_found'); end if;

  if coalesce((v_item->>'optional')::boolean, (v_item->>'key') = 'additional_material') then
    return jsonb_build_object('ok', false, 'error', 'not_markable');
  end if;

  if p_done then
    if coalesce((v_item->>'done')::boolean, false) then
      return jsonb_build_object('ok', true, 'noop', true);
    end if;
  else
    if not coalesce((v_item->>'declaredByRecipient')::boolean, false) then
      return jsonb_build_object('ok', false, 'error', 'not_yours');
    end if;
  end if;

  select jsonb_agg(
           case when (x->>'key') = p_key then
             case when p_done
               then x || jsonb_build_object('done', true, 'doneAt', to_jsonb(now()),
                                            'declaredByRecipient', true)
               else (x - 'doneAt' - 'declaredByRecipient') || jsonb_build_object('done', false)
             end
           else x end order by ord)
    into v_list
    from jsonb_array_elements(coalesce(m.payload->'checklist','[]'::jsonb)) with ordinality t(x, ord);

  select count(*) into v_remain
    from jsonb_array_elements(coalesce(v_list,'[]'::jsonb)) x
   where not coalesce((x->>'done')::boolean, false)
     and not coalesce((x->>'optional')::boolean, (x->>'key') = 'additional_material');

  update public.onboarding_steps
     set payload = payload || jsonb_build_object('checklist', coalesce(v_list, '[]'::jsonb)),
         status  = case when v_remain = 0 then 'completed' else 'in_progress' end,
         ball    = case when v_remain = 0 then 'me' else ball end,
         completion_method = case when v_remain = 0 then 'system' else completion_method end,
         completed_at = case when v_remain = 0 then now() else null end
   where id = m.id;

  v_label := coalesce(v_item->>'label', p_key);

  perform public.log_onboarding_event(m.user_id, m.id, m.engagement_id,
    'note', 'system',
    case when p_done
      then 'הרו״ח הקודם ציין שנשלח: ' || v_label
      else 'הרו״ח הקודם ביטל סימון: ' || v_label end,
    jsonb_build_object('actor', 'prev_accountant', 'key', p_key,
                       'done', p_done, 'remaining', v_remain));

  if v_remain = 0 then perform public.unlock_dependent_steps(m.id); end if;

  select nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '')
    into v_client from public.clients where id = m.client_id;

  perform public.queue_accountant_notification(
    m.user_id, 'prev_accountant_document_uploaded', m.client_id, m.id, null, null,
    jsonb_build_object('clientName', v_client,
                       'requestTitle', case when p_done then 'הרו״ח הקודם ציין מה נשלח'
                                                        else 'הרו״ח הקודם ביטל סימון' end,
                       'lastItem', v_label));

  return jsonb_build_object('ok', true, 'done', p_done, 'remaining', v_remain);
end;
$function$;

revoke execute on function public.release_portal_set_item(text, text, boolean) from public, anon;
grant  execute on function public.release_portal_set_item(text, text, boolean) to anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.release_portal_respond(p_token text, p_note text, p_name text DEFAULT NULL::text)
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
   where step_type = 'release_letter' and payload->>'releaseToken' = p_token
     -- ‼ 165: מכתב שבוטל = הטוקן שלו מת. אותו תנאי בכל חמש הדלתות.
     and status <> 'cancelled' limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');
  if v_note is null then return jsonb_build_object('ok', false, 'error', 'missing_note'); end if;
  v_note := left(v_note, 4000);
  v_name := left(nullif(trim(coalesce(p_name, '')), ''), 200);

  v_prev := nullif(s.payload->>'prevAccountantResponseNote', '');
  if v_prev is not null then
    v_note := v_prev || E'\n\n- - -\n' || v_note;
  end if;

  update public.onboarding_steps
     set payload = (payload || jsonb_strip_nulls(jsonb_build_object(
                     'prevAccountantResponseNote', v_note,
                     'prevAccountantRespondedAt', to_jsonb(now()),
                     'prevAccountantResponderName', v_name)))
                   - 'responseHandledAt',
         ball = 'me',
         needs_attention = true
   where id = s.id;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'system',
    coalesce('הרו״ח הקודם השיב - ' || v_name, 'הרו״ח הקודם השיב'),
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

revoke execute on function public.release_portal_respond(text, text, text) from public, anon;
grant  execute on function public.release_portal_respond(text, text, text) to anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.release_portal_remove_upload(p_token text, p_document_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s public.onboarding_steps%rowtype; m public.onboarding_steps%rowtype;
  v_entry jsonb; v_keep jsonb := '[]'::jsonb; v_gone jsonb := '[]'::jsonb;
begin
  select * into s from public.onboarding_steps
   where step_type = 'release_letter' and payload->>'releaseToken' = p_token
     -- ‼ 165: מכתב שבוטל = הטוקן שלו מת. אותו תנאי בכל חמש הדלתות.
     and status <> 'cancelled' limit 1;
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
     set payload = m.payload || jsonb_build_object('bulkUploads', v_keep)
                             || jsonb_build_object('removedUploads', v_gone)
   where id = m.id;
  perform public.sync_prev_accountant_removed_label(p_document_id);
  return jsonb_build_object('ok', true, 'remaining', jsonb_array_length(v_keep));
end;
$function$;

revoke execute on function public.release_portal_remove_upload(text, text) from public, anon;
grant  execute on function public.release_portal_remove_upload(text, text) to anon, authenticated, service_role;

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
   where step_type = 'release_letter' and payload->>'releaseToken' = p_token
     -- ‼ 165: מכתב שבוטל = הטוקן שלו מת. אותו תנאי בכל חמש הדלתות.
     and status <> 'cancelled' limit 1;
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

revoke execute on function public.release_portal_mark_items(text, jsonb) from public, anon;
grant  execute on function public.release_portal_mark_items(text, jsonb) to anon, authenticated, service_role;

-- ── H1 · הצמדת הצעה לכרטיס קיים — רק כשהזהות חד-משמעית ─────────────────────
CREATE OR REPLACE FUNCTION public.open_quotation_representation(p_quotation_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  q            public.quotations%rowtype;
  v_rep        jsonb;
  v_areas      jsonb;
  v_prefill    jsonb;
  v_spouse     jsonb;
  v_client_id  text;
  v_req_id     text := replace(gen_random_uuid()::text, '-', '');
  v_first      text;
  v_last       text;
  v_name       text;
  v_email      text;
  v_signers    jsonb;
  v_shaam      text[];
  v_area_keys  text[];
  v_labels     text;
  v_placeholder text;
  v_existing   public.clients%rowtype;
  v_added      text[];
  v_added_lbl  text;
  v_sp_full    text;
  -- 165 (H1): התאמה לפי מייל — רק כשהיא חד-משמעית
  v_match_n    int  := 0;
  v_match_id   text;
  v_ambiguous  int  := 0;
begin
  select * into q from public.quotations where id = p_quotation_id limit 1;
  if q.id is null then return null; end if;
  if q.representation_request_id is not null then return q.representation_request_id; end if;
  if q.status <> 'approved' then return null; end if;

  v_rep := coalesce(q.representation, '{}'::jsonb);
  if not coalesce((v_rep->>'enabled')::boolean, false) then return null; end if;

  v_areas   := coalesce(v_rep->'areas', '{}'::jsonb);
  v_prefill := coalesce(v_rep->'prefill', '{}'::jsonb);
  v_spouse  := v_rep->'spouse';
  if v_spouse = 'null'::jsonb then v_spouse := null; end if;
  select array_agg(k) into v_area_keys from jsonb_object_keys(v_areas) k;
  if v_area_keys is null then return null; end if;

  v_first := nullif(trim(coalesce(v_prefill->>'firstName', '')), '');
  v_last  := nullif(trim(coalesce(v_prefill->>'lastName', '')), '');
  v_name  := nullif(trim(coalesce(v_first, '') || ' ' || coalesce(v_last, '')), '');
  if v_name is null then
    select nullif(trim(coalesce(l.full_name, '')), '') into v_name
      from public.leads l where l.id = q.lead_id;
  end if;
  v_name := coalesce(v_name, nullif(trim(coalesce(q.snapshot->>'recipientName', '')), ''));
  if v_first is null and v_name is not null then
    v_first := split_part(v_name, ' ', 1);
    v_last  := nullif(trim(substr(v_name, length(split_part(v_name, ' ', 1)) + 1)), '');
  end if;

  v_email := nullif(trim(coalesce(v_prefill->>'email', '')), '');
  if v_email is null then
    select nullif(trim(coalesce(l.email, '')), '') into v_email
      from public.leads l where l.id = q.lead_id;
  end if;
  v_email := coalesce(v_email, nullif(trim(coalesce(q.snapshot->>'recipientEmail', '')), ''));

  v_sp_full := nullif(trim(coalesce(v_prefill->>'spouseName', '')), '');

  v_client_id := q.client_id;
  if v_client_id is null then
    select l.converted_client_id into v_client_id from public.leads l where l.id = q.lead_id;
  end if;

  -- ‼ 165 (H1): עד כאן ההתאמה לפי מייל הייתה `limit 1` בלי מיון — ובפרודקשן יש
  -- כמה כרטיסים של אותו משרד עם אותו מייל (בני זוג, כרטיס ישן וחדש). ההצעה
  -- הייתה נצמדת לכרטיס שרירותי, והרשויות שלה נכתבות אצל האדם הלא נכון.
  -- הכלל: מצמידים לכרטיס קיים רק כשיש בדיוק אחד. אפס או יותר מאחד — נפתח
  -- כרטיס חדש, והעמימות נרשמת באירועי ההצעה כדי שהמשרד יאחד ביד.
  -- (הכרטיס שעל ההצעה ו-converted_client_id של הליד עדיין קודמים — הם זהות
  -- ודאית, לא ניחוש.)
  if v_client_id is null and v_email is not null then
    select count(*), min(c.id) into v_match_n, v_match_id
      from public.clients c
      where c.user_id = q.user_id
        and lower(trim(coalesce(c.email, ''))) = lower(v_email)
        and c.representation_request_id is not null;
    if v_match_n = 1 then
      v_client_id := v_match_id;
    elsif v_match_n > 1 then
      v_ambiguous := v_match_n;
    end if;
  end if;

  select coalesce(array_agg(k), '{}'::text[]) into v_shaam
    from unnest(v_area_keys) k where k <> 'nationalInsurance';

  if v_client_id is not null then
    select * into v_existing from public.clients where id = v_client_id limit 1;
    if v_existing.id is null then
      v_client_id := null;

    elsif v_existing.representation_request_id is not null then
      select coalesce(array_agg(k), '{}'::text[]) into v_added
        from unnest(v_area_keys) k
        where not (coalesce(v_existing.authority_representations, '{}'::jsonb) ? k);

      if array_length(v_added, 1) > 0 then
        update public.clients
          set authority_representations = v_areas || coalesce(authority_representations, '{}'::jsonb),
              updated_at = now()
          where id = v_client_id;

        update public.representation_requests
          set authorities = (
                select coalesce(array_agg(distinct a), '{}'::text[])
                from unnest(coalesce(authorities, '{}'::text[]) || v_shaam) a
              ),
              updated_at = now()
          where id = v_existing.representation_request_id;
      end if;

      select string_agg(
        case k when 'incomeTax' then 'מס הכנסה'
               when 'withholding' then 'ניכויים'
               when 'vat' then 'מע"מ'
               when 'nationalInsurance' then 'ביטוח לאומי'
               else k end, ', ')
        into v_added_lbl from unnest(coalesce(v_added, '{}'::text[])) k;

      update public.quotations
        set client_id = v_client_id,
            representation_request_id = v_existing.representation_request_id,
            events = coalesce(events, '[]'::jsonb) || jsonb_build_object(
              'type', 'representation_opened', 'at', now(),
              'note', 'ללקוח כבר קיים תהליך ייצוג - לא נפתחה בקשה חדשה'
                      || case when v_added_lbl is not null
                              then '. נוספו רשויות: ' || v_added_lbl else '' end),
            updated_at = now()
        where id = q.id;
      return v_existing.representation_request_id;
    end if;
  end if;

  if v_client_id is null then
    v_placeholder := to_char(now() at time zone 'Asia/Jerusalem', 'DD/MM HH24:MI');
    v_client_id := replace(gen_random_uuid()::text, '-', '');
    insert into public.clients (
      id, user_id, first_name, last_name, email,
      representation_status, representation_request_id, authority_representations,
      family_status, marriage_year, divorce_year, widowhood_year,
      spouse_name, spouse_id_number,
      spouse_first_name, spouse_last_name, spouse_birth_year, notes
    ) values (
      v_client_id, q.user_id,
      coalesce(v_first, 'ממתין למילוי'),
      coalesce(v_last, case when v_first is null then v_placeholder else '' end),
      v_email,
      'pending_fill', v_req_id, v_areas,
      nullif(v_prefill->>'familyStatus', ''),
      case when v_prefill->>'familyStatus' = 'married'  then (v_prefill->>'familyStatusYear')::int end,
      case when v_prefill->>'familyStatus' = 'divorced' then (v_prefill->>'familyStatusYear')::int end,
      case when v_prefill->>'familyStatus' = 'widowed'  then (v_prefill->>'familyStatusYear')::int end,
      v_sp_full,
      nullif(v_prefill->>'spouseIdNumber', ''),
      nullif(split_part(coalesce(v_sp_full, ''), ' ', 1), ''),
      nullif(trim(substr(coalesce(v_sp_full, ''), length(split_part(coalesce(v_sp_full, ''), ' ', 1)) + 1)), ''),
      (v_prefill->>'spouseBirthYear')::int,
      'נוצר אוטומטית עם אישור הצעת מחיר ' || q.quotation_number || '. ממתין להשלמת הייצוג.'
    );
  else
    update public.clients
      set representation_status     = 'pending_fill',
          representation_request_id = v_req_id,
          authority_representations = coalesce(authority_representations, '{}'::jsonb) || v_areas,
          updated_at                = now()
      where id = v_client_id;
  end if;

  v_signers := jsonb_build_array(jsonb_build_object(
    'id', 'client', 'role', 'client',
    'name', coalesce(v_name, ''), 'email', coalesce(v_email, ''),
    'signStatus', 'pending',
    'signToken', replace(gen_random_uuid()::text, '-', '')
  ));
  if v_spouse is not null and coalesce(trim(v_spouse->>'name'), '') <> '' then
    v_signers := v_signers || jsonb_build_array(jsonb_build_object(
      'id', 'spouse', 'role', 'spouse',
      'name', trim(v_spouse->>'name'),
      'email', coalesce(nullif(trim(coalesce(v_spouse->>'email', '')), ''), ''),
      'signStatus', 'pending',
      'signToken', replace(gen_random_uuid()::text, '-', '')
    ));
  end if;

  insert into public.representation_requests (
    id, user_id, linked_client_id, client_name, client_email,
    authorities, requested_docs, notes, status,
    onboarding_token, onboarding_status, prefill, signers
  ) values (
    v_req_id, q.user_id, v_client_id, coalesce(v_name, ''), coalesce(v_email, ''),
    v_shaam,
    jsonb_build_array(
      jsonb_build_object('id','id_card','label','תצלום תעודת זהות + ספח','required',true,'isDefault',true),
      jsonb_build_object('id','drivers_license','label','תצלום רישיון נהיגה','required',true,'isDefault',true)
    ),
    'נפתח אוטומטית עם אישור הצעת מחיר ' || q.quotation_number || '.',
    'pending_fill',
    replace(gen_random_uuid()::text, '-', ''), 'pending', v_prefill, v_signers
  );

  select string_agg(
    case k when 'incomeTax' then 'מס הכנסה'
           when 'withholding' then 'ניכויים'
           when 'vat' then 'מע"מ'
           when 'nationalInsurance' then 'ביטוח לאומי'
           else k end, ', ')
    into v_labels from unnest(v_area_keys) k;

  if q.lead_id is not null then
    update public.leads
      set status = 'converted', converted_client_id = v_client_id, updated_at = now()
      where id = q.lead_id;
  end if;

  update public.quotations
    set client_id = v_client_id,
        representation_request_id = v_req_id,
        events = coalesce(events, '[]'::jsonb)
                 || jsonb_build_object('type', 'lead_converted', 'at', now())
                 || jsonb_build_object('type', 'representation_opened', 'at', now(),
                                       'note', 'רשויות: ' || coalesce(v_labels, '-'))
                 || case when v_ambiguous > 0
                      then jsonb_build_object('type', 'client_match_ambiguous', 'at', now(),
                             'note', v_ambiguous || ' כרטיסים קיימים עם אותו מייל - נפתח כרטיס חדש במקום להצמיד לאחד מהם')
                      else '[]'::jsonb end,
        updated_at = now()
    where id = q.id;

  return v_req_id;
end;
$function$;

revoke execute on function public.open_quotation_representation(text) from public, anon, authenticated;
grant  execute on function public.open_quotation_representation(text) to service_role;

select public.assert_domain_function_invariants();
