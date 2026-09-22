-- ─── 192 · «שלח בקשות» — מה מוכן לצאת ללקוח ולאנשי משק הבית, מקור אחד ─────────
-- הרקע: docs/FINDINGS-REQUESTS-PAGE-MODEL-2026-09-19.md (§E, §I) והאב-טיפוס
-- המאושר docs/prototypes/requests-v3-responsibility-v1.html.
--
-- מה כאן: פונקציית **קריאה בלבד** שגוזרת מעובדות קיימות מה מוכן לשליחה,
-- מקובץ לפי נמען. אין טבלה חדשה, אין כתיבה, אין מודל תקשורת חדש (הכרעת
-- הגילוי: לא נדרש למסך הזה). המגש, גלולת «טרם נשלח» והמונה על הכפתור קוראים
-- כולם מכאן — כדי שלא יסטו זה מזה כמו שקרה למוני "פתוחות".
--
-- שתי נגזרות, שתיהן מעובדות שכבר נכתבות היום:
--   • בעל הכרטיס: בקשה פונה-ללקוח, מפורסמת, פתוחה ולא נעולה, ש**התוכן שלה
--     ללקוח** מאוחר ממייל הדף האחרון (email_messages.kind ∈ process_open /
--     documents_sent / status_update, לא failed) — או שמעולם לא יצא מייל דף.
--     "התוכן ללקוח" = greatest(published_at, שינוי-תוכן אחרון): פריט שנוסף
--     לבקשה שכבר פורסמה (צילום תעודה נדחה — 191, meta.items), עריכה שפורסמה
--     (publish_case_changes — meta.editApplied), ובקשה סגורה שנפתחה מחדש.
--     כולם כבר נרשמים ב-onboarding_events; כאן רק קוראים אותם. בלי זה, ת.ז.
--     שנוספה ל«מסמכים מהלקוח» אחרי שהדף נשלח לא הייתה עולה ב«שלח בקשות».
--     ‼ שמרני בכוונה: קישור שהועתק לוואטסאפ אינו נרשם בשום מקום, ולכן לקוח
--     שקיבל את הדף כך יראה «טרם נשלח» — אמירה נכונה (PIVO לא שלח), והרו"ח
--     סוגר אותה בשליחה אחת. תועד כהחלטה שמרנית, לא כהחלטת מוצר חדשה.
--   • אדם במשק הבית (ב"ל לכל אדם, 157): שלב authority_representation פתוח
--     שבמסלול הביצוע שלו יש אסמכתא ואין instructionsSentAt, והאסמכתא לא פגה.
--     הנמען = הנושא (כמו היום ב-send-onboarding-email/ni_approve).
--
-- ‼ intake_questionnaire אינו ברשימת הבעלים: העיתוי שלו הוא החלטת הרו"ח
--    ויש לו שליחה משלו (send-step-email). retainer_authorization אינו שם:
--    בדף האישי הוא «בטיפול המשרד» עד שפייפרלס מבקשת כרטיס. custom_request
--    עם messageOnly מוצג בדף כהודעה שקטה ולא כפעולה — לא "מבקשים" אותו.

create or replace function public.client_ready_to_send(p_client_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid       uuid := auth.uid();
  c           public.clients%rowtype;
  v_last_sent timestamptz;
  v_owner     jsonb := '[]'::jsonb;
  v_persons   jsonb := '[]'::jsonb;
  s           record;
  v_exec      jsonb;
  v_track     jsonb;
  v_role      text;
  v_email     text;
  v_name      text;
  v_changed   timestamptz;
  v_since     timestamptz;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  -- ‼ רק בעל הכרטיס (או service_role) — אותו גבול כמו שאר פונקציות הכרטיס.
  if v_uid is not null and c.user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select max(sent_at) into v_last_sent
    from public.email_messages
   where client_id = p_client_id
     and kind in ('process_open', 'documents_sent', 'status_update')
     and status <> 'failed';

  for s in
    select id, step_type, payload, published_at, sort_order, pending_sort_order, created_at
      from public.onboarding_steps
     where client_id = p_client_id
       and status not in ('completed', 'verified', 'skipped', 'cancelled', 'locked')
       and published_at is not null
       and coalesce(pending_cancel, false) = false
       and step_type in ('client_documents', 'custom_request', 'paperless_tax_authority',
                         'paperless_invite', 'prev_accountant_details')
       and (step_type <> 'custom_request'
            or (coalesce(ball, 'client') = 'client'
                and coalesce((payload->>'messageOnly')::boolean, false) = false
                and payload->'externalParty' is null))
     order by coalesce(pending_sort_order, sort_order, 0), created_at
  loop
    -- שינוי תוכן אחרי הפרסום: פריט שנוסף (191), עריכה שפורסמה (101), פתיחה מחדש.
    select max(e.at) into v_changed
      from public.onboarding_events e
     where e.step_id = s.id and e.at > s.published_at
       and (e.meta ? 'items' or e.meta ? 'editApplied'
            or (e.type = 'status_changed' and e.meta->>'to' = 'waiting_client'
                and e.meta->>'from' in ('completed', 'verified', 'skipped')));
    v_since := greatest(s.published_at, coalesce(v_changed, s.published_at));
    if v_last_sent is null or v_since > v_last_sent then
      v_owner := v_owner || jsonb_strip_nulls(jsonb_build_object(
        'stepId', s.id,
        'stepType', s.step_type,
        'title', coalesce(nullif(s.payload->>'title', ''), nullif(s.payload->>'clientTitle', '')),
        'publishedAt', s.published_at,
        'changedAt', v_changed));
    end if;
  end loop;

  for s in
    select st.id, st.payload
      from public.onboarding_steps st
     where st.client_id = p_client_id
       and st.step_type = 'authority_representation'
       and st.payload->>'authority' = 'national_insurance'
       and st.status not in ('completed', 'verified', 'skipped', 'cancelled')
     order by st.sort_order, st.created_at
  loop
    v_role := case when s.payload->>'subjectRole' = 'spouse' then 'spouse' else 'client' end;
    select execution into v_exec from public.representation_requests
     where id = s.payload->>'representationRequestId';
    v_track := coalesce(v_exec -> (case when v_role = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end), '{}'::jsonb);
    continue when nullif(v_track->>'referenceNumber', '') is null;
    continue when (v_track->>'instructionsSentAt') is not null;
    continue when nullif(v_track->>'deadline', '') is not null and (v_track->>'deadline')::date < current_date;

    v_email := case when v_role = 'spouse' then c.spouse_email else c.email end;
    v_name  := coalesce(nullif(s.payload->>'subjectName', ''),
                 case when v_role = 'spouse'
                      then nullif(trim(coalesce(c.spouse_first_name, '') || ' ' || coalesce(c.spouse_last_name, '')), '')
                      else nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '') end,
                 case when v_role = 'spouse' then 'בן/בת הזוג' else 'הלקוח' end);
    v_persons := v_persons || jsonb_strip_nulls(jsonb_build_object(
      'role', v_role,
      'name', v_name,
      'email', nullif(trim(coalesce(v_email, '')), ''),
      'stepId', s.id,
      'requestId', s.payload->>'representationRequestId',
      'referenceNumber', v_track->>'referenceNumber',
      'deadline', nullif(v_track->>'deadline', '')));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'owner', jsonb_build_object(
      'email', nullif(trim(coalesce(c.email, '')), ''),
      'lastSentAt', v_last_sent,
      'items', v_owner),
    'persons', v_persons);
end;
$function$;

revoke all on function public.client_ready_to_send(text) from public, anon;
grant execute on function public.client_ready_to_send(text) to authenticated, service_role;
