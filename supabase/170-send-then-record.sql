-- ═══════════════════════════════════════════════════════════════════════════
--  170 — «נשלח» נכתב רק אחרי שהספק אישר, ויחד עם שורת היומן — באותה טרנזקציה
-- ═══════════════════════════════════════════════════════════════════════════
--  ‼ מה נמצא (ביקורת העקביות, אשכול F — "המסך אומר שזה קרה, המסד לא מסכים"):
--
--  N2  כל פונקציית send-* עשתה שתי כתיבות נפרדות אחרי תשובת Resend: שורה
--      ב-email_messages, ואז הסימון על הישות (סטטוס השלב / representation_sent_at /
--      sent_at של ההתראה). קריסה בין השתיים = מייל שיצא, יומן שיודע, וישות
--      שלא — או להפך. ובצד הדפדפן: releaseSentAt (מכתב ההעברה) נכתב רק אחרי
--      שגם ה-PDF נוצר ונשמר — כשל ב-PDF השאיר את המכתב "טרם נשלח" ושליחה
--      חוזרת שלחה אותו פעמיים.
--      תביעה שנלקחה לפני השליחה (autoExecutedAt) לא שוחררה כשה-fetch עצמו
--      זרק (רשת, timeout) — השלב הציג «⚡ בוצע אוטומטית» על מייל שלא יצא.
--
--  N5  cancel_automation_job סירבה ל-'running'. עובד מקומי שנהרג באמצע השאיר
--      את המשימה 'running' לנצח, האינדקס הייחודי על משימה פתוחה חסם משימה
--      חדשה, וכפתור ההתחברות בכותרת הפך לכפתור שלא עושה כלום.
--
--  P2  קריאות queue_accountant_notification מקבילות (שתי דרישות אחרונות שנסגרו
--      באותו רגע, לחיצה כפולה) יצרו שתי התראות זהות בתור.
--
--  מה הקובץ הזה עושה:
--   ① record_email_sent — נקודת הרישום היחידה של מייל שיצא: שורת היומן +
--      הסימון על הישות + אירוע היומן, בטרנזקציה אחת, עם מפתח ייחודי שנגזר
--      ממזהה הספק (ולא מ-COUNT+1, שהיה מרוץ בין שתי שליחות מקבילות).
--   ② cancel_automation_job מקבלת גם 'running' שהחכירה שלו פקעה.
--   ③ queue_accountant_notification — כפילות זהה בתור (אותו אירוע, אותו
--      payload, טרם נשלחה) נבלעת באינדקס ייחודי חלקי.
--
--  ‼ החלון השארי: בין תשובת 200 מ-Resend לבין הקריאה ל-record_email_sent
--  יש עדיין רגע שבו קריסה של פונקציית הקצה משאירה מייל שיצא בלי שורה. אי
--  אפשר לסגור אותו בלי טרנזקציה מבוזרת מול הספק; מה שכן — הקריאה היא
--  הפעולה **המיידית** הבאה אחרי התשובה, ואין שום כתיבה אחרת לפניה.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① record_email_sent — נקראת מפונקציות הקצה בלבד (service_role) ──────────
--  p_idempotency_key ריק ⇒ המפתח הוא 'resend:<id>'. מזהה הספק ייחודי לכל
--  שליחה מוצלחת, ולכן שתי שליחות ידניות מקבילות מקבלות שתי שורות (שני
--  מיילים באמת יצאו), ורישום חוזר של אותה שליחה (ניסיון חוזר אחרי timeout
--  של ה-RPC) נבלע — בלי לגעת שוב בסימון. מסלול אוטומטי מוסר מפתח קבוע
--  ('auto:step:<id>') כי שם "בדיוק פעם אחת" הוא ההבטחה.
-- (חתימה קודמת של אותה מיגרציה, אם הוחלה בסביבת הבדיקות לפני ההרחבה)
drop function if exists public.record_email_sent(uuid, text, text, text, text, text, text, text, text, jsonb, text, jsonb, text, text, text, text, text, text, jsonb, text);

create or replace function public.record_email_sent(
  p_user_id         uuid,
  p_kind            text,
  p_to_email        text,
  p_subject         text,
  p_resend_id       text,
  p_html            text  default null,
  p_client_id       text  default null,
  p_request_id      text  default null,
  p_step_id         text  default null,
  p_meta            jsonb default null,
  p_idempotency_key text  default null,
  -- הסימון על השלב: מיזוג ל-payload (למשל releaseSentAt), סטטוס וכדור.
  p_step_patch      jsonb default null,
  p_step_status     text  default null,
  p_step_ball       text  default null,
  -- הסימון על ההצעה: representation_sent_at (מייל קישור הייצוג).
  p_quotation_id    text  default null,
  -- הסימון על ההתראה למשרד: sent_at.
  p_notification_id text  default null,
  -- אירוע ביומן הקליטה (email_sent) — עם השלב, או עם ההתקשרות כשאין שלב.
  p_event_actor     text  default null,
  p_event_note      text  default null,
  p_event_meta      jsonb default null,
  p_engagement_id   text  default null,
  -- הסימון על בקשת ייצוג: execution.<track> (למשל nationalInsurance) מקבל
  -- patch — ורק אם instructionsSentAt שם עדיין ריק (שליחה חוזרת לא דורסת).
  p_request_track       text  default null,
  p_request_track_patch jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key       text := coalesce(nullif(trim(coalesce(p_idempotency_key, '')), ''), 'resend:' || p_resend_id);
  v_id        uuid;
  v_step      public.onboarding_steps%rowtype;
  v_step_uuid uuid;
  v_now       timestamptz := now();
begin
  if p_user_id is null then
    raise exception 'record_email_sent: missing user';
  end if;
  if nullif(trim(coalesce(p_resend_id, '')), '') is null then
    raise exception 'record_email_sent: missing provider id';
  end if;

  if p_step_id is not null then
    select * into v_step from public.onboarding_steps where id = p_step_id;
    if v_step.id is null then
      raise exception 'record_email_sent: step % not found', p_step_id;
    end if;
    if v_step.user_id <> p_user_id then
      raise exception 'record_email_sent: step % belongs to another office', p_step_id;
    end if;
    -- email_messages.step_id הוא uuid (מיגרציה 29) בעוד onboarding_steps.id הוא
    -- text של 32 הקסה; PostgreSQL קורא uuid גם בלי מקפים. מזהה בצורה אחרת
    -- (שלבי דוגמה ישנים) לא מפיל את הרישום — הוא פשוט לא מקושר בעמודה.
    v_step_uuid := case when p_step_id ~* '^[0-9a-f]{32}$|^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
                        then p_step_id::uuid else null end;
  end if;

  insert into public.email_messages
    (user_id, client_id, request_id, step_id, to_email, subject, kind, status,
     resend_id, html, meta, idempotency_key)
  values
    (p_user_id, p_client_id, p_request_id, v_step_uuid, p_to_email, p_subject, p_kind, 'sent',
     p_resend_id, p_html, coalesce(p_meta, '{}'::jsonb), v_key)
  on conflict (user_id, idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;

  if v_id is null then
    -- השליחה הזו כבר רשומה — והסימון כבר נעשה איתה. לא נוגעים שוב.
    select id into v_id from public.email_messages
     where user_id = p_user_id and idempotency_key = v_key;
    return jsonb_build_object('ok', true, 'alreadyRecorded', true, 'emailId', v_id);
  end if;

  if p_step_id is not null
     and (p_step_patch is not null or p_step_status is not null or p_step_ball is not null) then
    update public.onboarding_steps
       set payload    = payload || coalesce(p_step_patch, '{}'::jsonb),
           status     = coalesce(p_step_status, status),
           ball       = coalesce(p_step_ball, ball),
           updated_at = v_now
     where id = p_step_id;
  end if;

  if p_quotation_id is not null then
    -- שליחה חוזרת אינה דורסת את החותמת הראשונה.
    update public.quotations
       set representation_sent_at = coalesce(representation_sent_at, v_now),
           representation_error   = null
     where id = p_quotation_id and user_id = p_user_id;
  end if;

  if p_request_id is not null and p_request_track is not null and p_request_track_patch is not null then
    update public.representation_requests
       set execution = jsonb_set(
             coalesce(execution, '{}'::jsonb), array[p_request_track],
             coalesce(execution->p_request_track, '{}'::jsonb) || p_request_track_patch),
           updated_at = v_now
     where id = p_request_id and user_id = p_user_id
       and (execution->p_request_track->>'instructionsSentAt') is null;
  end if;

  if p_notification_id is not null then
    update public.accountant_notifications
       set sent_at = v_now, error = null
     where id = p_notification_id and user_id = p_user_id;
  end if;

  if p_event_note is not null then
    perform public.log_onboarding_event(
      p_user_id, p_step_id, coalesce(p_engagement_id, v_step.engagement_id),
      'email_sent', coalesce(p_event_actor, 'accountant'), p_event_note,
      coalesce(p_event_meta, '{}'::jsonb) || jsonb_build_object('resend_id', p_resend_id, 'emailId', v_id));
  end if;

  return jsonb_build_object('ok', true, 'alreadyRecorded', false, 'emailId', v_id, 'sentAt', v_now);
end;
$function$;

revoke execute on function public.record_email_sent(uuid, text, text, text, text, text, text, text, text, jsonb, text, jsonb, text, text, text, text, text, text, jsonb, text, text, jsonb)
  from public, anon, authenticated;
grant  execute on function public.record_email_sent(uuid, text, text, text, text, text, text, text, text, jsonb, text, jsonb, text, text, text, text, text, text, jsonb, text, text, jsonb)
  to service_role;

comment on function public.record_email_sent(uuid, text, text, text, text, text, text, text, text, jsonb, text, jsonb, text, text, text, text, text, text, jsonb, text, text, jsonb) is
  'רישום מייל שיצא: שורת יומן + הסימון על השלב/ההצעה/ההתראה + אירוע, בטרנזקציה אחת. נקראת מפונקציות הקצה מיד אחרי 200 מ-Resend. מיגרציה 170.';

-- ── ② cancel_automation_job — גם 'running' שהחכירה שלו פקעה ─────────────────
--  ‼ 150 השאירה 'running' מחוץ לטווח כי "העובד מחזיק אותה". חכירה שפקעה היא
--  בדיוק ההוכחה שאף אחד לא מחזיק: העובד מאריך אותה בכל פעימה (heartbeat), ומי
--  שלא האריך — מת או נותק. אותו כלל ש-claim_next_automation_job כבר מפעילה
--  כשהיא תופסת מחדש. עובד שיחזור לחיים וידווח על משימה שבוטלה ייתקל
--  ב-status<>'running' ויקבל not_owner_or_already_finished — לא כותב על ביטול.
create or replace function public.cancel_automation_job(p_job_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_job public.automation_jobs;
begin
  update public.automation_jobs
     set status = 'cancelled', finished_at = now()
   where id = p_job_id
     and user_id = v_uid
     and (status in ('queued', 'needs_human')
          or (status = 'running' and (lease_until is null or lease_until < now())))
   returning * into v_job;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_cancellable');
  end if;
  return jsonb_build_object('ok', true, 'job', to_jsonb(v_job));
end;
$function$;

revoke execute on function public.cancel_automation_job(text) from public, anon;
grant  execute on function public.cancel_automation_job(text) to authenticated, service_role;

-- ── ③ התור למשרד — כפילות זהה שטרם נשלחה נבלעת ───────────────────────────
--  המפתח הטבעי: אותו משרד, אותו אירוע, אותן ישויות, אותו payload — כל עוד
--  השורה הראשונה עדיין ממתינה. ברגע שנשלחה (או הושתקה) היא יוצאת מהאינדקס,
--  ואירוע חוזר אמיתי (בקשה שנפתחה מחדש והושלמה שוב) מקבל שורה חדשה.
--  jsonb::text קנוני (מפתחות ממוינים), ולכן md5 שלו יציב.
create unique index if not exists accountant_notifications_pending_dedupe_idx
  on public.accountant_notifications (
    user_id, kind,
    coalesce(step_id, ''), coalesce(request_id, ''), coalesce(quotation_id, ''), coalesce(client_id, ''),
    md5(coalesce(payload::text, '')))
  where sent_at is null and suppressed_at is null;

create or replace function public.queue_accountant_notification(
  p_user_id      uuid,
  p_kind         text,
  p_client_id    text  default null,
  p_step_id      text  default null,
  p_request_id   text  default null,
  p_quotation_id text  default null,
  p_payload      jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  insert into public.accountant_notifications
    (user_id, kind, client_id, step_id, request_id, quotation_id, payload)
  values
    (p_user_id, p_kind, p_client_id, p_step_id, p_request_id, p_quotation_id,
     coalesce(p_payload, '{}'::jsonb))
  on conflict (user_id, kind,
               coalesce(step_id, ''), coalesce(request_id, ''), coalesce(quotation_id, ''), coalesce(client_id, ''),
               md5(coalesce(payload::text, '')))
    where sent_at is null and suppressed_at is null
  do nothing;
$function$;

revoke execute on function public.queue_accountant_notification(uuid, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant  execute on function public.queue_accountant_notification(uuid, text, text, text, text, text, jsonb)
  to service_role;

select public.assert_domain_function_invariants();
