-- ─── 198: מספר הבקשה בשע״ם נשמר גם כשהוא נקרא מהבקשה שנפתחה ─────────────
--
-- הרקע (הדסה סלע, 23.09.2026): רשימת «בקשות בתהליך» בשע״ם אינה מציגה את
-- מספר הבקשה. הוא **כן** מוצג אחרי «טעינת מסמכים» («מספר בקשה: 2026538930»),
-- והעובד קורא אותו משם במהלך shaam.submit_poa. עד כאן הטריגר:
--   · בענף submit_poa — לא שמר מספר בקשה בכלל;
--   · בענפי create/check — coalesce(v_track->>'requestNumber', ...) — והבדיקה
--     כבר כתבה שם "" (מחרוזת ריקה, לא null), כך ש-coalesce החזיר "" לנצח
--     ומספר אמיתי לא היה נשמר לעולם.
-- התיקון: nullif(...,'') בשני הצדדים, ובענף submit_poa שמירת המספר מהתוצאה.
-- ‼ מזהה קיים לא נדרס (אותו כלל כמו ב-194). שאר הגוף — מילה במילה כמו החי.
-- ‼ שינוי בגוף הפונקציה בלבד; הטריגר (trg_sync_shaam_representation_from_job)
-- ללא שינוי.

CREATE OR REPLACE FUNCTION public.sync_shaam_representation_from_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_key     text;
  v_req_id  text;
  v_track   jsonb;
  v_exec    jsonb;
  v_now     text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_status  text;
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
    -- ‼ coalesce על מספר הבקשה: מזהה חיצוני קיים לא נדרס לעולם.
    v_track := v_track || jsonb_strip_nulls(jsonb_build_object(
      'requestNumber',  coalesce(nullif(v_track ->> 'requestNumber', ''), nullif(new.result ->> 'requestNumber', '')),
      'createdAt',      coalesce(v_track ->> 'createdAt', v_now),
      'formDocumentId', new.result ->> 'formDocumentId',
      -- ‼ שם הקובץ נשמר כדי שהכנת אזורי החתימה לא תצטרך לשאול את טבלת
      -- המסמכים: הוא חלק מאותה עובדה שהתקבלה, לא חיפוש נוסף.
      'formFileName',   new.result ->> 'formFileName',
      'formFetchedAt',  case when new.result ->> 'formDocumentId' is not null
                             then coalesce(v_track ->> 'formFetchedAt', v_now) end
    ));

  elsif new.action_type = 'shaam.submit_poa' then
    -- ‼ **הכלל היחיד שאסור לפספס:** «נשלח לשע״ם» רק על ראיה מפורשת.
    -- ניסיון העלאה, לחיצה או ניווט אינם submitted=true.
    if coalesce((new.result ->> 'submitted')::boolean, false) then
      v_track := v_track || jsonb_build_object(
        'submittedAt', coalesce(v_track ->> 'submittedAt', v_now));
    end if;
    -- ‼ 198: מספר הבקשה נקרא מהבקשה שנפתחה (הוא לא מוצג ברשימה). נשמר
    -- כשאין עדיין מספר — מזהה חיצוני קיים לא נדרס לעולם.
    v_track := v_track || jsonb_strip_nulls(jsonb_build_object(
      'requestNumber', coalesce(nullif(v_track ->> 'requestNumber', ''), nullif(new.result ->> 'requestNumber', ''))
    ));

  elsif new.action_type = 'shaam.check_representation' then
    -- ‼ הסיווג לתוויות עסקיות נעשה ב-PIVO (shaamRepresentation.ts). כאן
    -- נשמר מה שנקרא, כולל הטקסט הגולמי — כדי שניסוח חדש אצל הרשות יהיה
    -- ניתן לזיהוי בדיעבד במקום להיעלם בתרגום.
    v_track := v_track || jsonb_strip_nulls(jsonb_build_object(
      'syncedAt',        v_now,
      'requestNumber',   coalesce(nullif(v_track ->> 'requestNumber', ''), nullif(new.result ->> 'requestNumber', '')),
      'rawRequestState', (new.result -> 'rows' -> 0) ->> 'rawRequestState',
      'systems',         new.result -> 'rows'
    ));
  end if;

  update public.representation_requests
     set execution = jsonb_set(
           coalesce(execution, '{}'::jsonb), array['shaam'],
           coalesce(execution -> 'shaam', '{}'::jsonb) || jsonb_build_object(v_key, v_track),
           true)
   where id = v_req_id;

  -- ── מעברי הסטטוס העסקי, שניהם על ראיה חיצונית בלבד ──────────────────────
  select status into v_status from public.representation_requests where id = v_req_id;

  -- «נשלח לשע״ם»: הטופס נקלט אצל הרשות ⇒ הבקשה ממתינה לרשויות.
  if new.action_type = 'shaam.submit_poa'
     and coalesce((new.result ->> 'submitted')::boolean, false)
     and v_status in ('pending_signature', 'awaiting_stamp') then
    update public.representation_requests
       set status = 'awaiting_authorities', updated_at = now()
     where id = v_req_id;
  end if;

  -- «הייצוג פעיל»: שע״ם מדווחת שכל המערכים שהתבקשו נקלטו.
  -- ‼ allAccepted מחושב בעובד על שורות שנצפו בפועל; רשימה ריקה לעולם
  -- אינה «הכול נקלט» (ראה shaamCheckRepresentation.mjs).
  if new.action_type = 'shaam.check_representation'
     and coalesce((new.result ->> 'allAccepted')::boolean, false)
     and v_status = 'awaiting_authorities' then
    update public.representation_requests
       set status = 'active', updated_at = now()
     where id = v_req_id;
  end if;

  return new;
end;
$function$;

select public.assert_domain_function_invariants();
