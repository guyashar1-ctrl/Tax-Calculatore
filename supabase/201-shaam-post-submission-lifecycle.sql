-- ─── 201: מחזור החיים של הייצוג בשע״ם אחרי ההגשה ─────────────────────────────
--
-- הרקע (הדסה סלע, בקשה 2026538930, 23.09.2026): הטופס החתום נקלט בשע״ם
-- ב-20:42. מסך האישור של שע״ם עצמו אמר «בקשתך תיקלט במערכת ותמתין לסיום
-- השהייה הצפויה להסתיים ביום 06/10/2026» — והמשפט נשמר רק בתוצאת המשימה.
-- ברשימה בשע״ם הבקשה עברה ל«התקבלו המסמכים» / «השהייה». ב-PIVO נשאר צילום
-- הרשימה מ-14:50 («המתנה למסמכים»), כי:
--   R1 · אחרי שידור מוצלח לא נקרא המצב מחדש — «נשלח» היה סוף הדרך.
--   R2 · התאריך שבמסך האישור לא הגיע ל-execution.
--   R3 · בדיקה שלא מצאה שורות דרסה את השורות הקודמות ברשימה ריקה, ובדיקה
--        ישנה שהסתיימה מאוחר יכלה לדרוס קריאה חדשה יותר.
--   R4 · «ממתין לאישור לקוח» היה רק מילה על המסך; השלב בדף האישי נשאר
--        «זירוז אופציונלי», גם כששע״ם אומרת שבלי האישור הייצוג לא ייקלט.
--   R5 · דרישת מסמך נוסף (ת.ז./דרכון) במסך טעינת המסמכים עצרה את השידור —
--        ולא הפכה לבקשת מסמך אצל הלקוח.
--
-- מה משתנה (הכול על המבנה הקיים — execution.shaam[key] ו-onboarding_steps,
-- בלי טבלה ובלי עמודה חדשה):
--   ① sync_shaam_representation_from_job:
--       · submit_poa מוצלח ⇒ submissionConfirmation (הטקסט של שע״ם כמו שהוא)
--         + suspensionEndsAt מהמשפט «הצפויה להסתיים ביום …» (מקור: המסך).
--       · submit_poa מוצלח ⇒ משימת shaam.check_representation (קוראת בלבד)
--         נוצרת מיד — יישוב המצב אחרי ההגשה.
--       · check_representation: observedAt; קריאה ישנה מקריאה שמורה, או
--         קריאה שקדמה להגשה, אינה דורסת. «לא נמצאה ברשימה» אינה מוחקת שורות.
--       · «ממתין לאישור לקוח» ⇒ shaam_require_client_approval.
--   ② shaam_require_client_approval — השלב הקיים rep_client_approval הופך
--       לחובה: required_for_close, ניסוח «נדרש», requiredBy='shaam'.
--   ③ דרישת מסמך מזהה ממסך המסמכים (progress.shaamRequiredDocuments) ⇒
--       נשמרת ב-execution, וכשזו ת.ז./דרכון שאין בחומרים — פריט אחד
--       בבקשת «מסמכים מהלקוח» הקיימת (אותם מפתחות id_card/id_card_spouse,
--       כדי שההתכנסות של 191 תסגור אותו לבד כשהצילום מגיע).
--   ④ מילוי חד-פעמי מתוצאות submit_poa שכבר הצליחו (הדסה).
--
-- ‼ שום דבר כאן אינו פונה לשע״ם ואינו שולח הודעה. המשימה שנוצרת ב-① היא
--   קריאה בלבד (is_external_mutation_action = false), ורצה בסשן שכבר מחובר.

-- ── עזר: תאריך dd/mm/yyyy ⇒ ISO, רק כשיש שם תאריך אמיתי ──────────────────────
create or replace function public._shaam_date_iso(p_text text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  m text[];
begin
  m := regexp_match(coalesce(p_text, ''), '(\d{1,2})[./](\d{1,2})[./](\d{4})');
  if m is null then return null; end if;
  return to_char(make_date(m[3]::int, m[2]::int, m[1]::int), 'YYYY-MM-DD');
exception when others then
  return null;
end;
$function$;

revoke all on function public._shaam_date_iso(text) from public, anon, authenticated;

-- ── עזר: סוג המסמך המזהה ששע״ם מבקשת, מתוך התווית ──────────────────────────
-- ‼ אותו כלל כמו shaamIdentityDocKind ב-shaamRepresentation.ts. תווית שאינה
--   מזוהה ⇒ null — לא מנחשים, ולא נפתחת בקשת מסמך.
create or replace function public.shaam_identity_doc_kind(p_label text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select case
    when l ~ '(תעודת\s*זהות|ת\.\s*ז\.?|תז\M|ספח)' and l ~ 'דרכון' then 'idOrPassport'
    when l ~ '(תעודת\s*זהות|ת\.\s*ז\.?|תז\M|ספח)' then 'idCard'
    when l ~ 'דרכון' then 'passport'
    else null
  end
  from (select regexp_replace(coalesce(p_label, ''), '["״׳'']', '', 'g') as l) x;
$function$;

revoke all on function public.shaam_identity_doc_kind(text) from public, anon, authenticated;

-- ── ② «ממתין לאישור לקוח» ⇒ האישור הוא חובה ────────────────────────────────
-- ‼ השלב עצמו כבר קיים (131/133/186) — כאן הוא רק משנה משמעות: מזירוז
--   לחובה. לא נפתחת בקשה שנייה.
-- ‼ שלב שהושלם — היסטוריה; לא נפתח מחדש בשקט. מסך הביצוע מציג את הפער
--   («שע״ם עדיין ממתינה לאישור») לרו"ח.
create or replace function public.shaam_require_client_approval(p_client_id text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id text;
  s    public.onboarding_steps%rowtype;
begin
  v_id := public.ensure_rep_client_approval_step(p_client_id);

  if v_id is null then
    -- המשרד הסיר בעבר את כרטיס הזירוז. עכשיו שע״ם דורשת את האישור —
    -- זו אותה יחידת עבודה, והיא חוזרת (האינדקס מתיר רק שורה חיה אחת).
    select * into s from public.onboarding_steps
     where client_id = p_client_id and step_type = 'rep_client_approval' and status = 'cancelled'
     order by created_at desc limit 1;
    if s.id is null then return null; end if;
    perform public._set_step_status(s.id, 'pending', 'system',
      'שע״ם ממתינה לאישור הלקוח - הבקשה חזרה כחובה', jsonb_build_object('source', 'shaam'), 'client', null);
    v_id := s.id;
  end if;

  select * into s from public.onboarding_steps where id = v_id;
  if s.status in ('completed', 'verified', 'skipped') then return v_id; end if;
  if coalesce(s.payload ->> 'requiredBy', '') = 'shaam' then return v_id; end if;

  update public.onboarding_steps
     set required_for_close = true,
         published_at = coalesce(published_at, now()),
         ball = case when nullif(payload ->> 'clientDeclaredAt', '') is not null then ball else 'client' end,
         payload = payload || jsonb_build_object(
           'requiredBy', 'shaam',
           'requiredSince', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'optionalCopy', jsonb_build_object(
             'clientTitle', payload -> 'clientTitle',
             'clientSub', payload -> 'clientSub',
             'clientNoteAfter', payload -> 'clientNoteAfter'),
           'clientTitle', 'אישור הייצוג באזור האישי',
           'clientSub', 'נדרש - רשות המסים ממתינה לאישור שלך לבקשת הייצוג',
           'clientNoteAfter', 'בלי האישור הזה רשות המסים לא תקלוט את הייצוג, והטיפול מולה לא יוכל להתקדם.'),
         updated_at = now()
   where id = v_id;

  perform public.log_onboarding_event(s.user_id, v_id, s.engagement_id, 'note', 'system',
    'שע״ם מציגה «ממתין לאישור לקוח» - אישור הלקוח באזור האישי נדרש כדי שהייצוג ייקלט',
    jsonb_build_object('source', 'shaam', 'requiredBy', 'shaam'));
  return v_id;
end;
$function$;

revoke all on function public.shaam_require_client_approval(text) from public, anon, authenticated;
grant execute on function public.shaam_require_client_approval(text) to service_role;

-- ── ③ מסמך מזהה ששע״ם דורשת ⇒ בקשת מסמך, פעם אחת, רק כשחסר ──────────────────
-- מחזיר: exists | requested | already_requested | ambiguous_materials |
--        unrecognized | no_request.
-- ‼ «קיים» = צילום שמשויך לאדם הזה ב-identity_docs מהסוג שנדרש, או פריט
--   שכבר סגור בבקשת המסמכים. צילום ת.ז. בתיק שלא ידוע של מי הוא ⇒ עוצרים
--   (ambiguous_materials): לא מבקשים שוב מה שאולי כבר יש, ולא מניחים שיש.
create or replace function public.ensure_shaam_identity_document_request(
  p_client_id text, p_person text, p_kind text, p_shaam_label text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c        public.clients%rowtype;
  r        public.representation_requests%rowtype;
  s        public.onboarding_steps%rowtype;
  v_key    text;
  v_label  text;
  v_list   jsonb;
  v_draft  jsonb;
  v_item   jsonb;
  v_ok_kinds text[];
  v_eng    text;
  v_sort   int;
  v_stage  text;
begin
  if p_person not in ('client', 'spouse') then return 'unrecognized'; end if;
  v_ok_kinds := case p_kind
    when 'idCard' then array['idCard']
    when 'passport' then array['passport']
    when 'idOrPassport' then array['idCard', 'passport']
    else null end;
  if v_ok_kinds is null then return 'unrecognized'; end if;

  select * into c from public.clients where id = p_client_id;
  if c.id is null then return 'no_request'; end if;
  select * into r from public.representation_requests where id = c.representation_request_id;
  if r.id is null then return 'no_request'; end if;

  -- קיים ומשויך לאדם הזה, מהסוג שנדרש.
  if exists (
    select 1 from jsonb_array_elements(
             case when jsonb_typeof(r.identity_docs -> p_person) = 'array' then r.identity_docs -> p_person else '[]'::jsonb end) e
     where coalesce(e ->> 'docKind', 'idCard') = any(v_ok_kinds)
       and nullif(e ->> 'documentId', '') is not null
  ) then
    return 'exists';
  end if;

  v_key := public.identity_doc_item_key(p_person);
  select * into s from public.onboarding_steps
   where client_id = c.id and step_type = 'client_documents' and status <> 'cancelled'
   order by created_at desc limit 1;

  if s.id is not null then
    select x into v_item from jsonb_array_elements(coalesce(s.payload -> 'checklist', '[]'::jsonb)) x
     where x ->> 'key' = v_key limit 1;
    if v_item is not null and coalesce((v_item ->> 'done')::boolean, false)
       and nullif(v_item ->> 'documentId', '') is not null then
      return 'exists';
    end if;
    if v_item is not null and not coalesce((v_item ->> 'done')::boolean, false) then
      return 'already_requested';
    end if;
  end if;

  -- צילום תעודה בתיק שאינו משויך לאף אדם — לא ידוע אם הוא של האדם הזה.
  if exists (
    select 1 from public.documents d
     where d.client_id = c.id and d.category = 'id_card'
       and not exists (
         select 1 from jsonb_each(coalesce(r.identity_docs, '{}'::jsonb)) p,
                       jsonb_array_elements(case when jsonb_typeof(p.value) = 'array' then p.value else '[]'::jsonb end) e
          where e ->> 'documentId' = d.id)
  ) then
    return 'ambiguous_materials';
  end if;

  v_label := case p_kind when 'passport' then 'צילום דרכון'
                         when 'idOrPassport' then 'צילום תעודת זהות או דרכון'
                         else 'צילום תעודת זהות' end
             || case when p_person = 'spouse'
                     then ' - ' || coalesce(nullif(trim(coalesce(r.identification ->> 'spouseFirstName', '') || ' ' ||
                                                         coalesce(r.identification ->> 'spouseLastName', '')), ''),
                                           nullif(trim(coalesce(r.identification ->> 'spouseName', '')), ''),
                                           'בן/בת הזוג')
                     else '' end;
  v_item := jsonb_build_object('key', v_key, 'label', v_label, 'done', false,
                               'source', 'shaam_documents_step', 'shaamLabel', p_shaam_label);

  if s.id is not null then
    v_list  := coalesce(s.payload -> 'checklist', '[]'::jsonb) || v_item;
    v_draft := s.draft_payload;
    if v_draft is not null and jsonb_typeof(v_draft -> 'checklist') = 'array'
       and not exists (select 1 from jsonb_array_elements(v_draft -> 'checklist') y where y ->> 'key' = v_key) then
      v_draft := jsonb_set(v_draft, '{checklist}', (v_draft -> 'checklist') || v_item);
    end if;
    update public.onboarding_steps
       set payload = payload || jsonb_build_object('checklist', v_list)
                     || case when coalesce(s.payload ->> 'clientTitle', '') ~ '^להעלות (\d+ מסמכים|מסמך אחד)$'
                             then jsonb_build_object('clientTitle', public._documents_title(jsonb_array_length(v_list)))
                             else '{}'::jsonb end,
           draft_payload = v_draft,
           updated_at = now()
     where id = s.id;
    -- אותו דפוס כמו 191: בקשת המסמכים שנסגרה נפתחת מחדש לפריט שנוסף.
    if s.status in ('completed', 'verified', 'skipped') then
      perform public._set_step_status(s.id, 'waiting_client', 'system',
        'רשות המסים דורשת ' || v_label || ' לבקשת הייצוג - הבקשה נפתחה מחדש',
        jsonb_build_object('source', 'shaam', 'item', v_item), 'client', null);
    else
      perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'system',
        'רשות המסים דורשת ' || v_label || ' לבקשת הייצוג - נוסף לרשימת המסמכים',
        jsonb_build_object('source', 'shaam', 'item', v_item));
    end if;
    return 'requested';
  end if;

  select id into v_eng from public.engagements where client_id = c.id order by created_at desc limit 1;
  select coalesce(max(sort_order), 0) + 10 into v_sort
    from public.onboarding_steps where client_id = c.id and status <> 'cancelled';
  v_stage := public.derive_lifecycle_stage(c.id);

  insert into public.onboarding_steps
    (user_id, engagement_id, client_id, required_for_close, step_type, track, scope,
     status, ball, sort_order, payload, published_at)
  values
    (c.user_id, v_eng, c.id, public.intake_accepts_required(c.id), 'client_documents', 'tools', 'person',
     'pending', 'client', v_sort,
     jsonb_build_object('checklist', jsonb_build_array(v_item),
       'clientTitle', public._documents_title(1), 'clientSub', v_label, 'clientCta', 'להעלאה')
     || case when v_stage in ('lead', 'quoted') then jsonb_build_object('published', false, 'heldUntilApproval', true) else '{}'::jsonb end,
     case when v_stage in ('lead', 'quoted') then null else now() end)
  returning * into s;

  perform public.log_onboarding_event(c.user_id, s.id, v_eng, 'created', 'system',
    'רשות המסים דורשת ' || v_label || ' לבקשת הייצוג - נפתחה בקשת מסמכים',
    jsonb_build_object('source', 'shaam', 'item', v_item));
  return 'requested';
end;
$function$;

revoke all on function public.ensure_shaam_identity_document_request(text, text, text, text) from public, anon, authenticated;
grant execute on function public.ensure_shaam_identity_document_request(text, text, text, text) to service_role;

-- ── ① הטריגר על תוצאת המשימה ────────────────────────────────────────────────
-- ‼ גוף 198, ועליו: submissionConfirmation/suspensionEndsAt, יישוב אוטומטי
--   אחרי שידור, שומר-התיישנות, ו«ממתין לאישור לקוח».
CREATE OR REPLACE FUNCTION public.sync_shaam_representation_from_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_key       text;
  v_req_id    text;
  v_track     jsonb;
  v_exec      jsonb;
  v_now       text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_status    text;
  v_rows      jsonb;
  v_found     boolean;
  v_observed  timestamptz;
  v_stale     boolean := false;
  v_confirm   text;
  v_date      text;
  v_row       jsonb;
  v_awaiting_client boolean := false;
  v_apply_state boolean := false;
begin
  if new.action_type not in (
    'shaam.create_representation', 'shaam.submit_poa', 'shaam.check_representation'
  ) then
    return new;
  end if;

  -- ‼ מפתח ההגשה חייב לבוא מהתוצאה/הקלט המפורשים — לעולם לא מנחשים "מי".
  v_key := coalesce(new.result ->> 'submissionKey', new.input ->> 'submissionKey');
  if v_key is null or v_key = '' then return new; end if;

  select representation_request_id into v_req_id
    from public.clients where id = new.client_id;
  if v_req_id is null then return new; end if;

  select coalesce(execution, '{}'::jsonb) into v_exec
    from public.representation_requests where id = v_req_id;
  if v_exec is null then return new; end if;
  v_track := coalesce(v_exec #> array['shaam', v_key], '{}'::jsonb);

  if new.action_type = 'shaam.create_representation' then
    v_track := v_track || jsonb_strip_nulls(jsonb_build_object(
      'requestNumber',  coalesce(nullif(v_track ->> 'requestNumber', ''), nullif(new.result ->> 'requestNumber', '')),
      'createdAt',      coalesce(v_track ->> 'createdAt', v_now),
      'formDocumentId', new.result ->> 'formDocumentId',
      'formFileName',   new.result ->> 'formFileName',
      'formFetchedAt',  case when new.result ->> 'formDocumentId' is not null
                             then coalesce(v_track ->> 'formFetchedAt', v_now) end
    ));

  elsif new.action_type = 'shaam.submit_poa' then
    -- ‼ «נשלח לשע״ם» רק על ראיה מפורשת.
    if coalesce((new.result ->> 'submitted')::boolean, false) then
      v_track := v_track || jsonb_build_object(
        'submittedAt', coalesce(v_track ->> 'submittedAt', v_now));
      -- ‼ 201: מה ששע״ם אמרה במסך האישור — כמו שהוא. זו ראיה של הרשות,
      -- לא סיכום שלנו, ולכן נשמרת בנפרד מ«מצב בקשה»/«מצב מערך».
      v_confirm := coalesce(
        (select string_agg(x, ' · ') from jsonb_array_elements_text(
           case when jsonb_typeof(new.result -> 'statusLines') = 'array' then new.result -> 'statusLines' else '[]'::jsonb end) x),
        new.result ->> 'summary', '');
      if v_confirm <> '' then
        v_track := v_track || jsonb_build_object('submissionConfirmation', jsonb_build_object(
          'text', left(v_confirm, 600),
          'at', coalesce(v_track #>> '{submissionConfirmation,at}', v_now)));
        -- «… לסיום השהייה הצפויה להסתיים ביום 06/10/2026» — רק כשהמשפט עוסק בהשהייה.
        v_date := public._shaam_date_iso(substring(v_confirm from 'השהי[^0-9]{0,60}(\d{1,2}[./]\d{1,2}[./]\d{4})'));
        if v_date is not null and v_track ->> 'suspensionEndsSource' is distinct from 'request_list' then
          v_track := v_track || jsonb_build_object(
            'suspensionEndsAt', v_date, 'suspensionEndsSource', 'submission_confirmation');
        end if;
      end if;
    end if;
    v_track := v_track || jsonb_strip_nulls(jsonb_build_object(
      'requestNumber', coalesce(nullif(v_track ->> 'requestNumber', ''), nullif(new.result ->> 'requestNumber', ''))
    ));

  elsif new.action_type = 'shaam.check_representation' then
    v_rows := case when jsonb_typeof(new.result -> 'rows') = 'array' then new.result -> 'rows' else '[]'::jsonb end;
    v_found := coalesce((new.result ->> 'found')::boolean, jsonb_array_length(v_rows) > 0);
    -- ‼ מתי נקראה שע״ם: לפי העובד, ובהיעדרו — מתי התחילה הריצה.
    v_observed := coalesce(
      case when coalesce(new.result ->> 'observedAt', '') ~ '^\d{4}-\d{2}-\d{2}T'
           then (new.result ->> 'observedAt')::timestamptz end,
      new.claimed_at, now());

    -- ‼ שומר-התיישנות: קריאה ישנה מהקריאה השמורה, או קריאה שקדמה להגשה,
    -- אינה מתארת את המצב של עכשיו — ולא דורסת אותו.
    if nullif(v_track ->> 'observedAt', '') is not null
       and v_observed < (v_track ->> 'observedAt')::timestamptz then
      v_stale := true;
    end if;
    if nullif(v_track ->> 'submittedAt', '') is not null
       and v_observed < (v_track ->> 'submittedAt')::timestamptz then
      v_stale := true;
    end if;

    v_track := v_track || jsonb_build_object('syncedAt', v_now)
      || jsonb_strip_nulls(jsonb_build_object(
           'requestNumber', coalesce(nullif(v_track ->> 'requestNumber', ''), nullif(new.result ->> 'requestNumber', ''))));

    if v_stale then
      v_track := v_track || jsonb_build_object('lastStaleReadingAt', to_char(v_observed at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
    elsif not v_found then
      -- ‼ «לא נמצאה ברשימת הבקשות בתהליך» היא עובדה, לא מסקנה: ייתכן שנקלטה
      -- וייתכן שבוטלה. השורות האחרונות שנצפו נשמרות.
      v_track := v_track || jsonb_build_object(
        'observedAt', to_char(v_observed at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'notInListAt', to_char(v_observed at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
    else
      v_apply_state := true;
      v_track := (v_track - 'notInListAt') || jsonb_strip_nulls(jsonb_build_object(
        'observedAt',      to_char(v_observed at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'rawRequestState', v_rows -> 0 ->> 'rawRequestState',
        'systems',         v_rows
      ));
      -- «צפי לסיום השהייה» מפירוט הבקשה ברשימה — עדכני יותר ממסך האישור.
      select public._shaam_date_iso(x ->> 'suspensionEndsRaw') into v_date
        from jsonb_array_elements(v_rows) x
       where public._shaam_date_iso(x ->> 'suspensionEndsRaw') is not null limit 1;
      if v_date is not null then
        v_track := v_track || jsonb_build_object('suspensionEndsAt', v_date, 'suspensionEndsSource', 'request_list');
      end if;
      for v_row in select x from jsonb_array_elements(v_rows) x loop
        if regexp_replace(coalesce(v_row ->> 'rawSystemState', ''), '\s+', ' ', 'g') ~ 'לאישור (ה)?לקוח' then
          v_awaiting_client := true;
        end if;
      end loop;
      if v_awaiting_client then
        v_track := v_track || jsonb_build_object(
          'clientApprovalRequiredAt', coalesce(v_track ->> 'clientApprovalRequiredAt', v_now));
      end if;
    end if;
  end if;

  update public.representation_requests
     set execution = jsonb_set(
           coalesce(execution, '{}'::jsonb), array['shaam'],
           coalesce(execution -> 'shaam', '{}'::jsonb) || jsonb_build_object(v_key, v_track),
           true)
   where id = v_req_id;

  select status into v_status from public.representation_requests where id = v_req_id;

  -- «נשלח לשע״ם»: הטופס נקלט אצל הרשות ⇒ הבקשה ממתינה לרשויות.
  if new.action_type = 'shaam.submit_poa'
     and coalesce((new.result ->> 'submitted')::boolean, false) then
    if v_status in ('pending_signature', 'awaiting_stamp') then
      update public.representation_requests
         set status = 'awaiting_authorities', updated_at = now()
       where id = v_req_id;
    end if;
    -- ‼ 201 · יישוב מיד אחרי ההגשה: קריאה בלבד, באותו סשן שכבר מחובר.
    -- משימה פתוחה קיימת מאותו סוג ⇒ לא נוצרת שנייה (automation_jobs_open_unique).
    insert into public.automation_jobs (user_id, client_id, action_type, input, status, max_attempts)
    values (new.user_id, new.client_id, 'shaam.check_representation',
            jsonb_strip_nulls(jsonb_build_object(
              'submissionKey', v_key,
              'role',          coalesce(new.result ->> 'role', new.input ->> 'role'),
              'requestNumber', coalesce(nullif(v_track ->> 'requestNumber', ''), nullif(new.input ->> 'requestNumber', ''), ''),
              'entityId',      new.input ->> 'entityId',
              'personName',    new.input ->> 'personName',
              'reason',        'post_submission_reconciliation',
              'afterJobId',    new.id)),
            'queued', 3)
    on conflict (client_id, action_type) where status in ('queued', 'running', 'needs_human')
    do nothing;
  end if;

  if new.action_type = 'shaam.check_representation' and v_apply_state then
    -- «הייצוג פעיל»: שע״ם מדווחת שכל המערכים שהתבקשו נקלטו.
    if coalesce((new.result ->> 'allAccepted')::boolean, false) and v_status = 'awaiting_authorities' then
      update public.representation_requests
         set status = 'active', updated_at = now()
       where id = v_req_id;
    elsif v_awaiting_client and v_status = 'awaiting_authorities' then
      perform public.shaam_require_client_approval(new.client_id);
    end if;
  end if;

  return new;
end;
$function$;

-- ── ③ דרישת מסמך ממסך «טעינת מסמכים» (progress) ──────────────────────────────
-- העובד כותב progress.shaamRequiredDocuments = [{label, required}] כשהוא
-- קורא את מסך המסמכים (לפני כל נגיעה). הטריגר שומר את זה בהגשה, ולכל
-- מסמך מזהה — ensure_shaam_identity_document_request.
create or replace function public.sync_shaam_required_documents_from_progress()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_key    text;
  v_role   text;
  v_req_id text;
  v_docs   jsonb;
  v_out    jsonb := '[]'::jsonb;
  d        jsonb;
  v_kind   text;
  v_res    text;
begin
  v_docs := new.progress -> 'shaamRequiredDocuments';
  if jsonb_typeof(v_docs) <> 'array' then return new; end if;
  if (old.progress -> 'shaamRequiredDocuments') is not distinct from v_docs then return new; end if;

  v_key := coalesce(new.input ->> 'submissionKey', '');
  v_role := new.input ->> 'role';
  if v_key = '' or v_role not in ('client', 'spouse') then return new; end if;
  select representation_request_id into v_req_id from public.clients where id = new.client_id;
  if v_req_id is null then return new; end if;

  for d in select x from jsonb_array_elements(v_docs) x loop
    v_kind := public.shaam_identity_doc_kind(d ->> 'label');
    v_res := case when v_kind is null then 'unrecognized'
                  else public.ensure_shaam_identity_document_request(new.client_id, v_role, v_kind, d ->> 'label') end;
    v_out := v_out || jsonb_strip_nulls(jsonb_build_object(
      'label', d ->> 'label', 'required', d -> 'required', 'kind', v_kind, 'handling', v_res));
  end loop;

  update public.representation_requests
     set execution = jsonb_set(
           coalesce(execution, '{}'::jsonb), array['shaam'],
           coalesce(execution -> 'shaam', '{}'::jsonb)
             || jsonb_build_object(v_key,
                  coalesce(execution #> array['shaam', v_key], '{}'::jsonb)
                    || jsonb_build_object(
                         'requiredDocuments', v_out,
                         'requiredDocumentsObservedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
           true)
   where id = v_req_id;
  return new;
end;
$function$;

revoke all on function public.sync_shaam_required_documents_from_progress() from public, anon, authenticated;

drop trigger if exists trg_sync_shaam_required_documents_from_progress on public.automation_jobs;
create trigger trg_sync_shaam_required_documents_from_progress
  after update of progress on public.automation_jobs
  for each row
  when (new.action_type like 'shaam.%' and new.progress ? 'shaamRequiredDocuments')
  execute function public.sync_shaam_required_documents_from_progress();

-- ── ④ מילוי חד-פעמי: מה שמסך האישור של שע״ם כבר אמר ──────────────────────────
-- רק submitConfirmation/suspensionEndsAt — לא מעברי סטטוס ולא משימות.
with src as (
  select distinct on (r.id, j.input ->> 'submissionKey')
         r.id as req_id,
         j.input ->> 'submissionKey' as k,
         coalesce(
           (select string_agg(x, ' · ') from jsonb_array_elements_text(
              case when jsonb_typeof(j.result -> 'statusLines') = 'array' then j.result -> 'statusLines' else '[]'::jsonb end) x),
           j.result ->> 'summary', '') as txt,
         to_char(coalesce(j.finished_at, j.updated_at) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at
    from public.automation_jobs j
    join public.clients c on c.id = j.client_id
    join public.representation_requests r on r.id = c.representation_request_id
   where j.action_type = 'shaam.submit_poa' and j.status = 'succeeded'
     and coalesce((j.result ->> 'submitted')::boolean, false)
     and coalesce(j.input ->> 'submissionKey', '') <> ''
   order by r.id, j.input ->> 'submissionKey', j.updated_at desc
)
update public.representation_requests r
   set execution = jsonb_set(
         coalesce(r.execution, '{}'::jsonb), array['shaam'],
         coalesce(r.execution -> 'shaam', '{}'::jsonb)
           || jsonb_build_object(src.k,
                coalesce(r.execution #> array['shaam', src.k], '{}'::jsonb)
                  || jsonb_build_object('submissionConfirmation', jsonb_build_object('text', left(src.txt, 600), 'at', src.at))
                  || case when public._shaam_date_iso(substring(src.txt from 'השהי[^0-9]{0,60}(\d{1,2}[./]\d{1,2}[./]\d{4})')) is not null
                           and (r.execution #>> array['shaam', src.k, 'suspensionEndsSource']) is distinct from 'request_list'
                          then jsonb_build_object(
                            'suspensionEndsAt', public._shaam_date_iso(substring(src.txt from 'השהי[^0-9]{0,60}(\d{1,2}[./]\d{1,2}[./]\d{4})')),
                            'suspensionEndsSource', 'submission_confirmation')
                          else '{}'::jsonb end),
         true)
  from src
 where r.id = src.req_id
   and src.txt <> ''
   and (r.execution #> array['shaam', src.k, 'submissionConfirmation']) is null;

select public.assert_domain_function_invariants();
