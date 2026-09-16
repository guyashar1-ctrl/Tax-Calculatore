-- ─── 190: תיקון חותמות הזמן שכותב sync_btl_representation_from_job (187) ────
-- ‼ נתפס בריצה האמיתית הראשונה (יאיר, 16.09.2026): enteredAt נכתב עם מירכאות
-- כפולות בתוך המחרוזת ("\"2026-09-16T20:55:17…\"") — to_jsonb(now())::text
-- מייצר מחרוזת JSON **כולל** המירכאות, ו-jsonb_build_object קידד אותה שוב.
-- new Date() בדפדפן לא מפענח את זה. אותה תקלה הייתה ממתינה גם ל-confirmedAt
-- במסלול הבדיקה. הפורמט המתוקן זהה לזה שהדפדפן כותב בעצמו (ISO, UTC, 'Z').
-- ‼ שינוי בגוף הפונקציה בלבד — הטריגר (trg_sync_btl_representation_from_job)
-- ואיזה אירועים מפעילים אותו לא משתנים. כולל תיקון נתונים לערך היחיד שנכתב
-- בפורמט השגוי (הבקשה של יאיר), לפי זיהוי הצורה, לא לפי מזהה קשיח.

create or replace function public.sync_btl_representation_from_job()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role   text;
  v_key    text;
  v_req_id text;
  v_track  jsonb;
  v_now    text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if new.action_type not in ('btl.create_representation', 'btl.check_representation') then
    return new;
  end if;

  -- ‼ הנושא (154) חייב לבוא מהתוצאה/הקלט המפורשים — לעולם לא מנחשים "מי".
  v_role := coalesce(new.result ->> 'role', new.input ->> 'role');
  if v_role not in ('client', 'spouse') then
    return new;
  end if;
  v_key := case when v_role = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end;

  select representation_request_id into v_req_id
    from public.clients where id = new.client_id;
  if v_req_id is null then
    return new;
  end if;

  select coalesce(execution -> v_key, '{}'::jsonb) into v_track
    from public.representation_requests where id = v_req_id;
  if v_track is null then
    return new;
  end if;

  if new.action_type = 'btl.create_representation' then
    -- ‼ enteredAt/referenceNumber/deadline הם עובדות חדשות שהתקבלו מביטוח
    -- לאומי, לא היטל של ישות אחרת — נכתבות ישירות, פעם אחת (coalesce שומר
    -- על ערך קיים אם משום מה כבר נכתב).
    v_track := v_track || jsonb_strip_nulls(jsonb_build_object(
      'enteredAt', coalesce(v_track ->> 'enteredAt', v_now),
      'referenceNumber', new.result ->> 'referenceNumber',
      'deadline', new.result ->> 'deadline'
    ));
  elsif new.action_type = 'btl.check_representation' then
    if new.result ->> 'status' = 'approved' then
      v_track := v_track || jsonb_build_object('confirmedAt', coalesce(v_track ->> 'confirmedAt', v_now));
    end if;
    -- ‼ 'pending'/'unknown'/'not_found' — אין שינוי במצב העסקי. הראיה עצמה
    -- (rawStatus וכו') נשארת על ה-job.result לאבחון, לא נכתבת ל-execution.
  end if;

  update public.representation_requests
     set execution = jsonb_set(coalesce(execution, '{}'::jsonb), array[v_key], v_track, true)
   where id = v_req_id;

  return new;
end;
$function$;

-- ── תיקון נתונים: ערכים שנכתבו ע"י 187 עם מירכאות מוטמעות ──────────────────
-- מזוהים לפי צורה (מתחיל ב-") — לא לפי מזהה בקשה. הופכים "\"…\"" ל-"…".
update public.representation_requests
   set execution = jsonb_set(execution, '{nationalInsurance,enteredAt}',
                             to_jsonb(trim(both '"' from (execution -> 'nationalInsurance' ->> 'enteredAt'))))
 where (execution -> 'nationalInsurance' ->> 'enteredAt') like '"%';

update public.representation_requests
   set execution = jsonb_set(execution, '{nationalInsuranceSpouse,enteredAt}',
                             to_jsonb(trim(both '"' from (execution -> 'nationalInsuranceSpouse' ->> 'enteredAt'))))
 where (execution -> 'nationalInsuranceSpouse' ->> 'enteredAt') like '"%';

select public.assert_domain_function_invariants();
