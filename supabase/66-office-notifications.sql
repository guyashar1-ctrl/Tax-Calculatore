-- ═══════════════════════════════════════════════════════════════════════════
--  66 — התראות למשרד: מתג לכל אירוע, ומנגנון פתוח לאירועים הבאים
-- ═══════════════════════════════════════════════════════════════════════════
--  עד כאן שלוש ההתראות (הצעה נחתמה / פרטי ייצוג / ייפוי כוח) היו קשיחות: מי
--  שרצה לא לקבל אותן היה צריך שינוי קוד. מעכשיו כל התראה למשרד עוברת דרך
--  profiles.settings.accountantNotifications, ותיבת סימון אחת מכבה אותה.
--
--  ‼ הסינון נעשה בשליחה ולא ברישום. הטריגר ממשיך לרשום כל אירוע — כך שיומן
--  ההתקדמות שלם גם על אירועים שלא נשלח עליהם מייל, ושינוי הגדרה לא מוחק
--  היסטוריה. השורה שלא נשלחה מסומנת suppressed_at ולא נשלפת שוב.
--
--  ‼ כל אירוע חדש שייכתב בעתיד — מכל מקום — רק כותב שורה בתור עם kind חדש.
--  אין רשימה סגורה במסד: מי שמחליט אם לשלוח הוא הקטלוג המשותף
--  (supabase/functions/_shared/accountantNotifications.ts), והוא גם מה שמייצר
--  את תיבת הסימון במסך "המשרד".
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── התור מקבל שני שדות ─────────────────────────────────────────────────────
-- suppressed_at: ההתראה נרשמה, ההגדרה כיבתה אותה, ואין לנסות שוב.
-- step_id: האירועים החדשים תלויים בשלב קליטה ולא בהצעה/בקשת ייצוג.
alter table public.accountant_notifications
  add column if not exists suppressed_at timestamptz;

alter table public.accountant_notifications
  add column if not exists step_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'accountant_notifications_step_id_fkey'
  ) then
    alter table public.accountant_notifications
      add constraint accountant_notifications_step_id_fkey
      foreign key (step_id) references public.onboarding_steps(id) on delete cascade;
  end if;
end $$;

-- שורה מושתקת אינה ממתינה. האינדקס החלקי מדלג עליה כמו על שורה שנשלחה.
drop index if exists public.accountant_notifications_pending_idx;
create index if not exists accountant_notifications_pending_idx
  on public.accountant_notifications (user_id, created_at)
  where sent_at is null and suppressed_at is null;

-- ─── רישום התראה — נקודת הכניסה היחידה מהמסד ────────────────────────────────
-- כל פונקציה שרוצה להתריע קוראת לכאן. הוספת אירוע עתידי = קריאה אחת עם kind
-- חדש, בלי לגעת בטבלה, בהרשאות או בפונקציית השליחה.
create or replace function public.queue_accountant_notification(
  p_user_id      uuid,
  p_kind         text,
  p_client_id    text default null,
  p_step_id      text default null,
  p_request_id   text default null,
  p_quotation_id text default null,
  p_payload      jsonb default '{}'::jsonb
) returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into public.accountant_notifications
    (user_id, kind, client_id, step_id, request_id, quotation_id, payload)
  values
    (p_user_id, p_kind, p_client_id, p_step_id, p_request_id, p_quotation_id,
     coalesce(p_payload, '{}'::jsonb));
$$;

revoke all on function public.queue_accountant_notification(uuid, text, text, text, text, text, jsonb)
  from public, anon, authenticated;

-- ─── הטוקנים הציבוריים החדשים מזוהים גם הם ──────────────────────────────────
-- הדף האישי של הלקוח ודף הרו"ח הקודם מפעילים עכשיו את השליחה מיד עם האירוע,
-- בדיוק כמו דף ההצעה ודף החתימה. בלי זה ההתראה הייתה יוצאת רק בכניסה הבאה
-- של הרו"ח למערכת. הטוקן עדיין רק *מפעיל* — הוא לא מקבל שום מידע בחזרה.
create or replace function public.user_id_for_public_token(p_token text)
returns uuid
language sql
security definer
set search_path to 'public'
stable
as $$
  select user_id from public.quotations where public_token = p_token
  union all
  select user_id from public.representation_requests where onboarding_token = p_token
  union all
  select r.user_id from public.representation_requests r
    where exists (select 1 from jsonb_array_elements(coalesce(r.signers, '[]'::jsonb)) s
                  where s->>'signToken' = p_token)
  union all
  select user_id from public.clients where portal_token = p_token
  union all
  select user_id from public.onboarding_steps
    where step_type = 'release_letter' and payload->>'releaseToken' = p_token
  limit 1;
$$;

revoke all on function public.user_id_for_public_token(text) from public, anon, authenticated;

commit;
