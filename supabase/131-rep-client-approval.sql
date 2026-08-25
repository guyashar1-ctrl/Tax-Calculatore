-- ─── 131 · אישור המייצג באזור האישי של רשות המסים ──────────────────────────
-- שלב חדש: 'rep_client_approval'. הלקוח נכנס לאזור האישי ברשות המסים
-- ומאשר את המשרד כמייצג, במקום להמתין לקליטה האוטומטית בשע"ם.
--
--   הייצוג הוגש לשע"ם (awaiting_authorities) → אישור הלקוח באזור האישי
--                                            → הייצוג פעיל
--
-- ‼ למה זה נולד מסטטוס הבקשה ולא מהמחולל: אין מה לאשר לפני שהבקשה הוגשה.
-- לקוח שנשלח לאזור האישי מוקדם מדי ייכנס, לא ימצא כלום, ויתקשר. הטריגר
-- היחיד הנכון הוא הרגע שבו הרו"ח סימן "נשלח לשע"ם" — ומשם כל יום שהלקוח
-- מקדים שווה יום פחות המתנה.
--
-- ‼ למה זה **אינו** חוסם סגירת קליטה (required_for_close = false): הערך כאן
-- הוא זירוז, לא תנאי. הקליטה האוטומטית תקרה בכל מקרה. לקוח שנתקע בהזדהות
-- מול רשות המסים אינו אמור לתקוע את התיק — ובלי הכלל הזה היינו קונים פריט
-- חוסם על צעד שהוא מלכתחילה רשות. אותה סיבה בדיוק מכתיבה את הניסוח בדף
-- האישי: "מקצר את ההמתנה", ולא "נדרש ממך".
--
-- ‼ למה ההצהרה של הלקוח אינה סוגרת את השלב: אין לנו דרך לדעת שהאישור
-- באמת נקלט — רשות המסים לא מחזירה לנו כלום, והלקוח יכול היה גם ללחוץ
-- דחייה. לכן "אישרתי" מעביר את הכדור לרו"ח עם "כדאי לבדוק בשע"ם עכשיו",
-- והסגירה בפועל היא של הרו"ח. זה בדיוק הערך שהתבקש: לבדוק מחר במקום
-- בעוד חמישה ימים.
--
-- ‼ מה נסגר לבד: כשהייצוג עובר ל-active השלב הזה איבד את תפקידו ונסגר
-- אוטומטית. אחרת הלקוח היה ממשיך לראות בדף האישי משימה שכבר לא רלוונטית.
--
-- טלאים על הגדרות חיות בדפוס של 106/115/117/130: קוראים את המקור מהמסד,
-- מחליפים עוגן יחיד, ונופלים בקול אם העוגן לא נמצא.

-- ── 1. הסוג החדש מותר בעמודה ────────────────────────────────────────────────
alter table public.onboarding_steps drop constraint if exists onboarding_steps_step_type_check;
alter table public.onboarding_steps add constraint onboarding_steps_step_type_check
  check (step_type = any (array[
    'representation', 'file_opening', 'representation_upgrade', 'release_letter',
    'rep_client_approval',
    'materials_received', 'paperless_invite', 'paperless_connection',
    'paperless_tax_authority',
    'data_import', 'data_verification', 'retainer_authorization', 'internal_setup',
    'kyc_identification', 'first_month_review', 'intake_questionnaire',
    'client_documents', 'prev_accountant_details', 'custom_request',
    'institution_alignment_btl', 'institution_alignment_vat',
    'institution_alignment_income', 'opening_call']));

-- ── 2. המסלול שלו — רשויות, ליד הייצוג ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.onboarding_track_for(p_step_type text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case p_step_type
    when 'representation' then 'authorities'
    when 'representation_upgrade' then 'authorities'
    when 'rep_client_approval' then 'authorities'
    when 'file_opening' then 'authorities'
    when 'institution_alignment_btl' then 'authorities'
    when 'institution_alignment_vat' then 'authorities'
    when 'institution_alignment_income' then 'authorities'
    when 'release_letter' then 'prev_accountant'
    when 'materials_received' then 'prev_accountant'
    when 'prev_accountant_details' then 'prev_accountant'
    when 'paperless_invite' then 'tools'
    when 'paperless_connection' then 'tools'
    when 'paperless_tax_authority' then 'tools'
    when 'data_import' then 'tools'
    when 'data_verification' then 'tools'
    when 'client_documents' then 'tools'
    when 'retainer_authorization' then 'payment'
    when 'internal_setup' then 'internal'
    when 'kyc_identification' then 'internal'
    when 'intake_questionnaire' then 'internal'
    when 'first_month_review' then 'review'
    when 'opening_call' then 'review'
    when 'custom_request' then 'custom'
    else 'custom' end;
$function$;

-- ── 3. יצירת השלב · אידמפוטנטית ────────────────────────────────────────────
-- ‼ published_at = now(): הבקשה נולדת מפעולה של הרו"ח ("נשלח לשע"ם") ברגע
-- שבו הוא רוצה שהלקוח יראה אותה. טיוטה שמחכה ל"שלח ללקוח" הייתה הורגת את
-- כל הזירוז — הפריט היה יושב שבוע אצל הרו"ח בזמן שהקליטה האוטומטית רצה.
-- ‼ 117: בקשה שהמשרד הסיר (cancelled) אינה נולדת מחדש.
create or replace function public.ensure_rep_client_approval_step(p_client_id text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c      public.clients%rowtype;
  v_id   text;
  v_eng  text;
  v_sort int;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return null; end if;

  select id into v_id from public.onboarding_steps
    where client_id = p_client_id and step_type = 'rep_client_approval'
      and status <> 'cancelled' limit 1;
  if v_id is not null then return v_id; end if;

  if exists (select 1 from public.onboarding_steps
              where client_id = p_client_id and step_type = 'rep_client_approval'
                and status = 'cancelled') then
    return null;
  end if;

  select id into v_eng from public.engagements
    where client_id = p_client_id order by created_at desc limit 1;

  -- מיד אחרי שלב הייצוג: זו ההמשכיות שהלקוח חווה.
  select coalesce(max(sort_order), 0) + 1 into v_sort
    from public.onboarding_steps
    where client_id = p_client_id and step_type = 'representation'
      and status <> 'cancelled';

  insert into public.onboarding_steps
    (user_id, engagement_id, client_id, required_for_close, step_type, track, scope,
     status, ball, sort_order, published_at, payload)
  values
    (c.user_id, v_eng, p_client_id, false, 'rep_client_approval', 'authorities', 'person',
     'pending', 'client', v_sort, now(),
     jsonb_build_object(
       'clientTitle', 'אישור המייצג באזור האישי',
       'clientSub', 'שלוש דקות שמקצרות את ההמתנה לאישור הרשויות',
       'clientNote', E'יש לך כבר משתמש באזור האישי של רשות המסים?\n\nכן - נכנסים בקישור, לוחצים "לכניסה למערכת" ומזדהים. מחפשים את הבקשה שבה מופיע שם המשרד כמייצג, ובוחרים אישור. שתי דקות.\n\nלא - קודם צריך להירשם ולהזדהות מול רשות המסים. זה החלק שלוקח את הזמן, ובלעדיו אי אפשר לאשר.\n\nאם קיבלת מרשות המסים הודעת SMS על רישום מייצג - אפשר להיכנס ישירות מהקישור שבהודעה, וזה קצר יותר.',
       'clientNoteAfter', 'ואם לא הסתדר - אין בעיה. הייצוג ייכנס לתוקף גם בלי זה, זה פשוט לוקח כמה ימים יותר.',
       'clientCta', 'אישרתי באזור האישי',
       'clientLinkUrl', 'https://www.gov.il/he/service/personal_area_taxes',
       'clientLinkLabel', 'לכניסה לאזור האישי'))
  returning id into v_id;

  perform public.log_onboarding_event(c.user_id, v_id, v_eng, 'created', 'system',
    'הבקשה נוצרה כשהייצוג הוגש לשע"ם', '{}'::jsonb);

  return v_id;
end;
$function$;

revoke all on function public.ensure_rep_client_approval_step(text) from public, anon, authenticated;

-- ── 4. נולד בהגשה לשע"ם, נסגר כשהייצוג פעיל ────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_representation_step()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status text;
  v_ball   text;
begin
  if coalesce(old.status,'') = coalesce(new.status,'') then return new; end if;
  if new.linked_client_id is null then return new; end if;

  case new.status
    when 'pending_fill'        then v_status := 'waiting_client'; v_ball := 'client';
    when 'awaiting_accountant' then v_status := 'in_progress';    v_ball := 'me';
    when 'pending_signature'   then v_status := 'waiting_client'; v_ball := 'client';
    when 'awaiting_stamp'      then v_status := 'in_progress';    v_ball := 'me';
    when 'awaiting_authorities' then v_status := 'in_progress';   v_ball := 'authority';
    when 'active'              then v_status := 'completed';      v_ball := 'me';
    else return new;
  end case;

  update public.onboarding_steps
    set status = v_status, ball = v_ball,
        completion_method = 'auto',
        completed_at = case when v_status = 'completed' and completed_at is null then now() else completed_at end
    where client_id = new.linked_client_id
      and step_type = 'representation'
      and status not in ('cancelled','skipped');

  -- ‼ הוגש לשע"ם ⇒ עכשיו יש מה לאשר באזור האישי, ולא רגע לפני.
  if new.status = 'awaiting_authorities' then
    perform public.ensure_rep_client_approval_step(new.linked_client_id);
  end if;

  -- ‼ הייצוג נכנס לתוקף ⇒ הזירוז איבד את תפקידו. נסגר לבד, כדי שהלקוח לא
  -- יראה בדף האישי משימה שכבר אין בה טעם.
  if new.status = 'active' then
    update public.onboarding_steps
       set status = 'completed', ball = 'me', completion_method = 'auto',
           completed_at = coalesce(completed_at, now()), needs_attention = false
     where client_id = new.linked_client_id
       and step_type = 'rep_client_approval'
       and status not in ('completed','verified','skipped','cancelled');
  end if;

  return new;
end;
$function$;

-- ── 5. הדף האישי — הוראות, ואחרי ההצהרה "בטיפול המשרד" ─────────────────────
do $do$
declare
  v_src text := pg_get_functiondef('public.build_client_portal(text,text)'::regprocedure);
  v_new text;
begin
  if position('rep_client_approval' in v_src) > 0 then
    raise notice '131: הדף האישי כבר מכיר את השלב - מדלגים';
    return;
  end if;

  v_new := replace(v_src, $q$when 'paperless_tax_authority' then$q$,
$q$-- ── אישור המייצג באזור האישי ─────────────────────────────────────────
    -- ‼ שלושה מצבים ולא שניים: אחרי שהלקוח הצהיר הפריט עובר ל"בטיפול
    -- המשרד" ולא ל"בוצע" — אנחנו עוד לא יודעים שהאישור נקלט, והצגת "בוצע"
    -- הייתה הבטחה שאין לנו כיסוי אליה. הכפתור נעלם כדי שלא ילחץ שוב.
    when 'rep_client_approval' then
      if s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_build_object('bucket','done','key','rep_approval',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'אישור המייצג באזור האישי'));
      elsif nullif(s.payload->>'clientDeclaredAt','') is not null then
        v_items := v_items || jsonb_build_object('bucket','office','key','rep_approval',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'אישור המייצג באזור האישי'),
          'sub', 'תודה. אנחנו בודקים שהאישור נקלט אצל רשות המסים.');
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','rep_approval',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'אישור המייצג באזור האישי'),
          'sub', public.portal_lock_reason(s.id)));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','rep_approval',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'אישור המייצג באזור האישי'),
          'sub', nullif(s.payload->>'clientSub',''),
          'note', nullif(s.payload->>'clientNote',''),
          'noteAfter', nullif(s.payload->>'clientNoteAfter',''),
          'cta', coalesce(nullif(s.payload->>'clientCta',''), 'אישרתי באזור האישי'),
          'linkUrl', nullif(s.payload->>'clientLinkUrl',''),
          'linkLabel', nullif(s.payload->>'clientLinkLabel',''),
          'actionKind','portal','actionValue', s.id, 'kind','declare'));
      end if;

    when 'paperless_tax_authority' then$q$);
  if v_new = v_src then raise exception '131: העוגן paperless_tax_authority לא נמצא בדף האישי'; end if;

  execute v_new;
end $do$;

-- ── 6. "אישרתי" — מעביר כדור, לא סוגר ──────────────────────────────────────
do $do$
declare
  v_src text := pg_get_functiondef('public.portal_submit_step(text,text,jsonb)'::regprocedure);
  v_new text;
begin
  if position('rep_client_approval' in v_src) > 0 then
    raise notice '131: portal_submit_step כבר מכיר את השלב - מדלגים';
    return;
  end if;

  v_new := replace(v_src,
    $q$if s.step_type not in ('prev_accountant_details', 'custom_request', 'paperless_invite', 'paperless_tax_authority') then$q$,
    $q$if s.step_type not in ('prev_accountant_details', 'custom_request', 'paperless_invite', 'paperless_tax_authority', 'rep_client_approval') then$q$);
  if v_new = v_src then raise exception '131: רשימת ההיתר לא נמצאה ב-portal_submit_step'; end if;
  v_src := v_new;

  v_new := replace(v_src, $q$if s.step_type = 'paperless_tax_authority' then$q$,
$q$-- ── "אישרתי באזור האישי" ──────────────────────────────────────────────────
  -- ‼ הכדור עובר לרו"ח, והשלב **נשאר פתוח**. אין לנו גישה לאזור האישי של
  -- הלקוח ואין דרך לוודא שהאישור נקלט — הוא יכול היה גם ללחוץ דחייה. מה
  -- שההצהרה נותנת הוא הדבר שביקשנו: סימן לבדוק בשע"ם עכשיו במקום בעוד
  -- חמישה ימים. הסגירה נשארת של הרו"ח, או אוטומטית כשהייצוג הופך לפעיל.
  if s.step_type = 'rep_client_approval' then
    update public.onboarding_steps
       set status = 'in_progress', ball = 'me', needs_attention = true,
           payload = payload || jsonb_build_object(
             'submittedByClient', true,
             'clientDeclaredAt', to_jsonb(now()))
     where id = s.id;

    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'client',
      'הלקוח אישר את המייצג באזור האישי של רשות המסים',
      jsonb_build_object('to', 'in_progress'));

    perform public.queue_accountant_notification(
      s.user_id, 'client_request_completed', c.id, s.id, null, null,
      jsonb_build_object(
        'clientName', v_client_name,
        'requestTitle', coalesce(nullif(s.payload->>'clientTitle',''), 'אישור המייצג באזור האישי'),
        'lastItem', 'הלקוח דיווח שאישר באזור האישי - אפשר לבדוק בשע"ם אם הייצוג נקלט'));

    return jsonb_build_object('ok', true, 'completed', false);
  end if;

  if s.step_type = 'paperless_tax_authority' then$q$);
  if v_new = v_src then raise exception '131: ענף paperless_tax_authority לא נמצא ב-portal_submit_step'; end if;

  execute v_new;
end $do$;

-- ── 7. הבקשה זמינה מ"+ בקשה חדשה" ──────────────────────────────────────────
do $do$
declare
  v_src text := pg_get_functiondef('public.create_onboarding_request(text,text,jsonb,date,text,boolean,boolean,text,text)'::regprocedure);
  v_new text;
begin
  if position('rep_client_approval' in v_src) > 0 then
    raise notice '131: create_onboarding_request כבר מכיר את השלב - מדלגים';
    return;
  end if;

  v_new := replace(v_src,
    $q$'paperless_invite','paperless_connection','paperless_tax_authority','retainer_authorization',$q$,
    $q$'paperless_invite','paperless_connection','paperless_tax_authority','rep_client_approval','retainer_authorization',$q$);
  if v_new = v_src then raise exception '131: רשימת ההיתר לא נמצאה ב-create_onboarding_request'; end if;

  execute v_new;
end $do$;

-- ── 8. מי שכבר ממתין לרשויות מקבל את הבקשה עכשיו ───────────────────────────
-- ‼ בלי זה הפריט היה קיים רק לבקשות ייצוג עתידיות, ומי שכבר תקוע בהמתנה —
-- בדיוק מי שהפיצ'ר נבנה בשבילו — לא היה מקבל אותו לעולם.
do $do$
declare
  r record;
  v_id text;
  v_n  int := 0;
begin
  for r in
    select distinct rr.linked_client_id as cid
      from public.representation_requests rr
     where rr.status = 'awaiting_authorities'
       and rr.linked_client_id is not null
  loop
    v_id := public.ensure_rep_client_approval_step(r.cid);
    if v_id is not null then v_n := v_n + 1; end if;
  end loop;
  raise notice '131: נוצרו % בקשות אישור ללקוחות שכבר ממתינים לרשויות', v_n;
end $do$;
