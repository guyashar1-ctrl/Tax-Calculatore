-- ─── 195: «קיימת בקשה» אינו «הייצוג אושר» — יישוב מצב ייפוי הכוח מב"ל ──────
--
-- הרקע (אירוע אמת, הדסה סלע, 23.09.2026): ייפוי כוח נוצר **ידנית** בפורטל
-- «מערכת ייצוג לקוחות», ו-btl.create_representation מצא אותו במסך המעקב.
-- ההחזרה מהעובד הייתה `{referenceNumber, deadline, reconciled}` בלבד —
-- **בלי הסטטוס שנקרא**. מסך המעקב הראה «ממתין לאישור», ו-PIVO לא ידעה זאת
-- כלל: היא רשמה אסמכתא ומועד, סימנה את הצעדים כבוצעו, ולא החזיקה שום
-- אמירה על מה שביטוח לאומי באמת אמר. הבקשה נקראה כ"נסגרה" בעין.
--
-- הכלל שנאכף כאן, בנקודה שבה הוא באמת נשמר:
--   · ‼ **רק** `status = 'approved'` יוצר `confirmedAt`. 'pending',
--     'expired', 'cancelled', 'unknown', 'not_found' — ואפילו `status`
--     חסר לגמרי — לעולם לא. ערך שאינו ברשימה הסגורה מתנרמל ל-'unknown'.
--   · ‼ ראיה חיצונית נשמרת **תמיד** (externalState/rawExternalState/
--     syncedAt) — גם כשהיא לא מזיזה שום מצב עסקי. עד היום היא נשארה על
--     job.result בלבד, ולכן המסך לא יכול היה לומר "ב"ל אומרת: ממתין".
--   · ‼ אסמכתא ומועד מיושבים משתי הפעולות, לא רק מהיצירה — בדיקה שמצאה
--     שורה היא גם הזדמנות ליישב מטא-דאטה של רישום שנוצר מחוץ ל-PIVO.
--   · ‼ גדר מול תוצאה ישנה: משימות שנתקעו ב-needs_human ימים ורצות בבת
--     אחת כשהחלון מתחבר (נצפה: ארבע משימות סיימו תוך 21 שניות ב-23.09).
--     תוצאה שרצה **לפני** הראיה השמורה לא דורסת אותה.
--   · ‼ מונוטוני: `confirmedAt` לא נמחק בקריאה מאוחרת יותר. אישור ייפוי
--     כוח בב"ל אינו חוזר לאחור; פקיעה מטופלת דרך `deadline` ב-
--     sync_authority_representation_steps (157/165/167), שם היא כבר
--     מייצרת 'blocked'.
--
-- ‼ שינוי בגוף הפונקציה בלבד. הטריגר (trg_sync_btl_representation_from_job)
-- ואיזה אירועים מפעילים אותו — ללא שינוי.

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
  v_state  text;
  v_found  boolean;
  v_at     timestamptz := coalesce(new.finished_at, now());
  v_at_txt text;
  v_prev   timestamptz;
begin
  if new.action_type not in ('btl.create_representation', 'btl.check_representation') then
    return new;
  end if;

  -- ‼ הנושא (154) חייב לבוא מהתוצאה/הקלט המפורשים — לעולם לא מנחשים "מי".
  v_role := coalesce(new.result ->> 'role', new.input ->> 'role');
  -- ‼ `v_role is null or` אינו קישוט: ב-PL/pgSQL `null not in (…)` הוא NULL,
  -- ו-`if NULL then` נופל ל-else **בשקט**. בלי הבדיקה הזאת משימה שהגיעה בלי
  -- `role` (תוצאה חלקית, קלט ישן) לא הייתה נעצרת כאן — `v_key` היה נופל
  -- לענף ה-else ונכתב ל`nationalInsurance` של הלקוח, כלומר ל**אדם הלא נכון**.
  -- נתפס בבדיקה 9 ב-scripts/staging-test-btl-representation.mjs; אותה מלכודת
  -- כמו ב-157 (jsonb_typeof) ו-145.
  if v_role is null or v_role not in ('client', 'spouse') then
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

  -- ‼ אותו פורמט שהדפדפן כותב בעצמו (190): ISO, UTC, 'Z'.
  v_at_txt := to_char(v_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  -- ── גדר מול תוצאה שרצה לפני הראיה השמורה ────────────────────────────────
  begin
    v_prev := nullif(v_track ->> 'syncedAt', '')::timestamptz;
  exception when others then
    v_prev := null;
  end;
  if v_prev is not null and v_prev > v_at then
    return new;
  end if;

  -- ── נרמול המצב לרשימה סגורה ─────────────────────────────────────────────
  -- ‼ כל מה שאינו ערך מוכר הופך ל-'unknown'. זה הענף היחיד שמגן על
  -- ההבטחה "אין אישור בלי ראיה חיובית" מפני עובד עתידי/ישן שמחזיר משהו אחר.
  v_state := new.result ->> 'status';
  if v_state is null or v_state not in
     ('approved', 'pending', 'expired', 'cancelled', 'unknown', 'not_found') then
    v_state := 'unknown';
  end if;

  -- ‼ `found` מפורש כשהעובד מוסר אותו; אחרת נגזר מהמצב. 'not_found' הוא
  -- התשובה היחידה שמשמעותה "אין שורה".
  v_found := coalesce((new.result ->> 'found')::boolean, v_state <> 'not_found');

  -- ── עובדות שנקראו מביטוח לאומי ──────────────────────────────────────────
  if v_found then
    v_track := v_track || jsonb_strip_nulls(jsonb_build_object(
      -- ‼ קיימת שורה בב"ל ⇒ ייפוי הכוח **הוזן שם**. מי הזין אותו נאמר
      -- ב-foundExternally, לא כאן; enteredAt נשאר "מתי נודע לנו", פעם אחת.
      'enteredAt', coalesce(nullif(v_track ->> 'enteredAt', ''), v_at_txt),
      -- ‼ הרשות היא מקור האמת לשני אלה — הערך החיצוני מיישב את השמור.
      -- jsonb_strip_nulls מבטיח שהיעדר ערך לא מוחק ערך קיים.
      'referenceNumber', nullif(new.result ->> 'referenceNumber', ''),
      'deadline', nullif(new.result ->> 'deadline', '')
    ));
  end if;

  v_track := v_track || jsonb_strip_nulls(jsonb_build_object(
    'externalState', v_state,
    'rawExternalState', nullif(new.result ->> 'rawStatus', ''),
    'syncedAt', v_at_txt,
    'foundExternally', case when new.result ? 'foundExternally'
                            then new.result -> 'foundExternally' else null end
  ));

  -- ── ההכרעה היחידה שיוצרת "ייצוג פעיל" ───────────────────────────────────
  if v_state = 'approved' then
    v_track := v_track || jsonb_build_object(
      'confirmedAt', coalesce(nullif(v_track ->> 'confirmedAt', ''), v_at_txt));
  end if;

  update public.representation_requests
     set execution = jsonb_set(coalesce(execution, '{}'::jsonb), array[v_key], v_track, true)
   where id = v_req_id;

  return new;
end;
$function$;

select public.assert_domain_function_invariants();
