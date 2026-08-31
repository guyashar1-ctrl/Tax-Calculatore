-- 149 — «אין לי מושג, בלי בן/בת הזוג אני אבוד/ה»: קישור להשלמה עצמית
--
-- ‼ הכרעת גיא (31.8): כשלבן/בת הזוג יש תיק, הלקוח נדרש למספר ת.ז., תאריך
-- לידה ומספר רישיון/דרכון **של אדם אחר** — ולרוב הוא פשוט לא יודע אותם, ואז
-- הטופס נתקע. הפתרון: כפתור ששולח לבן/בת הזוג קישור משלו/ה להשלמת החלק שלו/ה.
--
-- שלוש הכרעות שהמבנה נשען עליהן:
--
-- ‼ **השם נשאר אצל הלקוח.** רק ת.ז., תאריך לידה ואמצעי הזיהוי עוברים — את
--   שם בן/בת הזוג כל אחד יודע. זה גם מה ששומר על `submit_onboarding_full`:
--   הוא גוזר את חותם בן/בת הזוג מ-v_spouse_full, ובלי שם היה **מוחק** אותו
--   מרשימת החותמים.
--
-- ‼ **ההשלמה אינה חוסמת את הלקוח.** הוא מגיש את החלק שלו ומסיים; פרטי בן/בת
--   הזוג נכנסים מתי שייכנסו. אדם שלישי לא עוצר קליטה של לקוח - אותו עיקרון
--   של «אישור המייצג באזור האישי הוא זירוז».
--
-- ‼ **טוקן נפרד ולא הקישור המשותף.** בקישור המשותף בן/בת הזוג היה רואה
--   ועורך את כל מה שהלקוח מילא, ויכול היה להגיש את הטופס כולו. הטוקן החדש
--   נפתר לאותה בקשה אבל פותח טופס קטן — החלק שלו/ה בלבד.
--
-- מצב נגזר משתי עובדות חיוביות ולא מדגל: התבקש (spouseFillRequestedAt) ולא
-- הושלם (spouseFillSubmittedAt) ⇒ ממתינים. ראה הלקח של 140.

alter table public.representation_requests
  add column if not exists spouse_onboarding_token text;

create unique index if not exists representation_requests_spouse_token_idx
  on public.representation_requests (spouse_onboarding_token)
  where spouse_onboarding_token is not null;

-- ─── יצירת הקישור, מתוך טופס הלקוח ────────────────────────────────────────
-- אידמפוטנטית: לחיצה חוזרת מחזירה את אותו טוקן, כדי שקישור שכבר נשלח
-- בוואטסאפ לא ימות בלחיצה שנייה.
create or replace function public.request_spouse_onboarding(
  p_token text,
  p_spouse_email text default null
)
returns table(spouse_token text, spouse_name text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_req public.representation_requests;
  v_tok text;
begin
  select * into v_req from public.representation_requests
    where onboarding_token = p_token limit 1;
  if not found then
    return;
  end if;
  -- אחרי ההגשה אין טעם לפתוח קישור חדש מהטופס; המשרד מטפל מהכרטיס.
  if v_req.onboarding_status = 'submitted'
     and coalesce(v_req.identification->>'spouseFillRequestedAt', '') = '' then
    return;
  end if;

  v_tok := coalesce(
    nullif(v_req.spouse_onboarding_token, ''),
    replace(gen_random_uuid()::text, '-', ''));

  update public.representation_requests
    set spouse_onboarding_token = v_tok,
        identification = coalesce(identification, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
          'spouseFillRequestedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'spouseEmail', nullif(trim(coalesce(p_spouse_email, '')), '')
        )),
        updated_at = now()
    where id = v_req.id;

  return query select v_tok, coalesce(
    nullif(trim(coalesce(v_req.identification->>'spouseFirstName','') || ' ' ||
                coalesce(v_req.identification->>'spouseLastName','')), ''),
    nullif(trim(coalesce(v_req.identification->>'spouseName','')), ''),
    '');
end;
$function$;

-- ─── מה בן/בת הזוג רואה בקישור שלו/ה ──────────────────────────────────────
create or replace function public.get_spouse_onboarding(p_token text)
returns table(
  firm_name text,
  branding jsonb,
  client_name text,
  spouse_name text,
  spouse_first_name text,
  authorities text[],
  scope jsonb,
  already_submitted boolean,
  identity_docs jsonb
)
language sql
security definer
set search_path to 'public'
as $function$
  select coalesce(p.firm_name, '') as firm_name,
         coalesce(p.branding, '{}'::jsonb) as branding,
         coalesce(
           nullif(trim(coalesce(r.identification->>'firstName','') || ' ' ||
                       coalesce(r.identification->>'lastName','')), ''),
           r.client_name, '') as client_name,
         coalesce(
           nullif(trim(coalesce(r.identification->>'spouseFirstName','') || ' ' ||
                       coalesce(r.identification->>'spouseLastName','')), ''),
           nullif(trim(coalesce(r.identification->>'spouseName','')), ''), '') as spouse_name,
         coalesce(nullif(trim(coalesce(r.identification->>'spouseFirstName','')), ''), '') as spouse_first_name,
         coalesce(r.authorities, '{}'::text[]) as authorities,
         coalesce(r.scope, c.authority_representations, '{}'::jsonb) as scope,
         (coalesce(r.identification->>'spouseFillSubmittedAt', '') <> '') as already_submitted,
         coalesce(r.identity_docs, '{}'::jsonb) as identity_docs
  from public.representation_requests r
  join public.profiles p on p.id = r.user_id
  left join public.clients c on c.id = r.linked_client_id
  where r.spouse_onboarding_token = p_token
  limit 1;
$function$;

-- ─── ההשלמה עצמה ──────────────────────────────────────────────────────────
-- ‼ כותבת **רק** את המפתחות של בן/בת הזוג. אינה נוגעת בסטטוס הבקשה, בחותמים
-- ובשום שדה של הלקוח: הלקוח כבר הגיש (או עוד יגיש) בנתיב שלו, ושתי הכתיבות
-- לא אמורות לדרוס זו את זו.
create or replace function public.submit_spouse_onboarding(
  p_token text,
  p_id_number text,
  p_birth_date text,
  p_secondary_type text,
  p_secondary_value text
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_req public.representation_requests;
begin
  select * into v_req from public.representation_requests
    where spouse_onboarding_token = p_token limit 1;
  if not found then
    return false;
  end if;
  if coalesce(v_req.identification->>'spouseFillSubmittedAt', '') <> '' then
    return true;   -- כבר הושלם; לחיצה כפולה אינה שגיאה
  end if;

  update public.representation_requests
    set identification = coalesce(identification, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
          'spouseIdNumber',       nullif(trim(coalesce(p_id_number, '')), ''),
          'spouseBirthDate',      nullif(trim(coalesce(p_birth_date, '')), ''),
          'spouseSecondaryType',  nullif(trim(coalesce(p_secondary_type, '')), ''),
          'spouseSecondaryValue', nullif(trim(coalesce(p_secondary_value, '')), ''),
          'spouseFillSubmittedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )),
        updated_at = now()
    where id = v_req.id;

  if v_req.linked_client_id is not null then
    update public.clients
      set spouse_id_number  = coalesce(nullif(trim(coalesce(p_id_number, '')), ''), spouse_id_number),
          spouse_birth_year = coalesce(
            (substring(coalesce(p_birth_date, '') from '^\d{4}'))::integer, spouse_birth_year),
          updated_at = now()
      where id = v_req.linked_client_id;
  end if;

  return true;
end;
$function$;

grant execute on function public.request_spouse_onboarding(text, text) to anon, authenticated;
grant execute on function public.get_spouse_onboarding(text) to anon, authenticated;
grant execute on function public.submit_spouse_onboarding(text, text, text, text, text) to anon, authenticated;
