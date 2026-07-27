-- ─── 23: קישור ייצוג בהפקה עצמית — הלקוח ממלא את כל הפרטים ─────────────────
-- הרו"ח מפיק קישור מהטלפון (רק בחירת רשויות), שולח בוואטסאפ, והלקוח מזין בעצמו
-- שם פרטי/משפחה, ת.ז., לידה, טלפון, מייל, כתובת ומצב משפחתי — הכל בקישור אחד.
--
-- (א) שנות המצב המשפחתי על כרטיס הלקוח — רשויות המס דורשות אותן בטפסי הייצוג.
-- (ב) get_onboarding מחזיר גם מה שהרו"ח כבר מילא, כדי לא לשאול את הלקוח פעמיים.
-- (ג) submit_onboarding_full — קליטת כל הפרטים במכה אחת, כולל עדכון החותמים.
--     submit_onboarding הישן נשאר כמות שהוא לתאימות לאחור.

-- ── (א) שנות המצב המשפחתי ──────────────────────────────────────────────────
alter table public.clients add column if not exists marriage_year   integer;
alter table public.clients add column if not exists divorce_year    integer;
alter table public.clients add column if not exists widowhood_year  integer;

-- מה שהרו"ח מילא במפורש בעת הפקת הקישור. נפרד מכרטיס הלקוח, כי בכרטיס
-- לשדות יש ברירות מחדל ("רווק") ואי אפשר להבחין בין "נבחר" ל"לא נגעו".
alter table public.representation_requests
  add column if not exists prefill jsonb not null default '{}'::jsonb;


-- ── (ב) get_onboarding — עכשיו גם מה שכבר ידוע ─────────────────────────────
-- שינוי טיפוס ההחזרה מחייב drop; החתימה (p_token) נשארת זהה.
drop function if exists public.get_onboarding(text);
create or replace function public.get_onboarding(p_token text)
returns table(
  client_name text, firm_name text, branding jsonb, already_submitted boolean,
  status text, authorities text[], already_signed boolean, has_setup boolean,
  -- known_*: ערכי ברירת מחדל למילוי מראש בטופס. prefill: מה שהרו"ח בחר
  -- במפורש — רק הוא קובע אילו שאלות מדלגים עליהן.
  known_first_name text, known_last_name text, known_email text,
  known_family_status text, known_family_status_year integer,
  ni_included boolean, prefill jsonb
)
language sql
security definer
set search_path to 'public'
as $function$
  select r.client_name,
         coalesce(p.firm_name, '') as firm_name,
         coalesce(p.branding, '{}'::jsonb) as branding,
         (r.onboarding_status = 'submitted') as already_submitted,
         r.status,
         coalesce(r.authorities, '{}'::text[]) as authorities,
         (r.identification ? 'signatureDataUrl') as already_signed,
         (r.signature_setup is not null) as has_setup,
         nullif(c.first_name, '') as known_first_name,
         nullif(c.last_name, '')  as known_last_name,
         nullif(coalesce(c.email, r.client_email), '') as known_email,
         nullif(c.family_status, '') as known_family_status,
         case c.family_status
           when 'married'  then c.marriage_year
           when 'divorced' then c.divorce_year
           when 'widowed'  then c.widowhood_year
           else null
         end as known_family_status_year,
         -- ייצוג בב"ל נשמר רק במרשם הלקוח: טופס 2279א'5 מכסה מ"ה/ניכויים/מע"מ בלבד
         coalesce(c.authority_representations ? 'nationalInsurance', false) as ni_included,
         coalesce(r.prefill, '{}'::jsonb) as prefill
  from public.representation_requests r
  join public.profiles p on p.id = r.user_id
  left join public.clients c on c.id = r.linked_client_id
  where r.onboarding_token = p_token
  limit 1;
$function$;

grant execute on function public.get_onboarding(text) to anon, authenticated;


-- ── (ג) קליטת כל הפרטים מהלקוח ─────────────────────────────────────────────
create or replace function public.submit_onboarding_full(
  p_token             text,
  p_first_name        text,
  p_last_name         text,
  p_id_number         text,
  p_birth_date        text,
  p_secondary_type    text,
  p_secondary_value   text,
  p_phone             text,
  p_email             text,
  p_city              text,
  p_address           text,
  p_family_status     text,
  p_family_status_year integer,
  p_spouse_name       text,
  p_spouse_email      text,
  p_spouse_id_number  text
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_req       public.representation_requests;
  v_full_name text := trim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''));
  v_signers   jsonb;
  v_spouse    jsonb;
begin
  select * into v_req from public.representation_requests where onboarding_token = p_token limit 1;
  if not found then
    return false;
  end if;

  -- ── החותמים: הנישום תמיד; בן/בת הזוג רק אם הלקוח הצהיר שהוא נשוי ──
  -- הקישור מופק לפני שידוע השם והמייל, ולכן החותם נוצר ריק ומתמלא רק כאן.
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
             -- בקשה ישנה עלולה להיות בלי טוקן חתימה; משלימים ולא דורסים קיים
             || case when coalesce(s->>'signToken', '') = ''
                  then jsonb_build_object('signToken', replace(gen_random_uuid()::text, '-', ''))
                  else '{}'::jsonb end
        else s
      end
    )
    from jsonb_array_elements(v_signers) s
  );

  if p_family_status = 'married' and coalesce(trim(p_spouse_name), '') <> '' then
    select s into v_spouse from jsonb_array_elements(v_signers) s where s->>'role' = 'spouse' limit 1;
    v_spouse := coalesce(v_spouse, jsonb_build_object(
      'id', 'spouse', 'role', 'spouse', 'signStatus', 'pending',
      'signToken', replace(gen_random_uuid()::text, '-', '')
    )) || jsonb_build_object(
      'name', trim(p_spouse_name),
      -- אין מייל נפרד לבן/בת הזוג ⇒ שתי בקשות החתימה נשלחות למייל של הנישום
      'email', coalesce(nullif(trim(coalesce(p_spouse_email, '')), ''), p_email, '')
    );
    v_signers := (
      select coalesce(jsonb_agg(s), '[]'::jsonb)
      from jsonb_array_elements(v_signers) s where s->>'role' <> 'spouse'
    ) || jsonb_build_array(v_spouse);
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
          'spouseName',       nullif(trim(coalesce(p_spouse_name, '')), ''),
          'spouseEmail',      nullif(trim(coalesce(p_spouse_email, '')), ''),
          'spouseIdNumber',   nullif(trim(coalesce(p_spouse_id_number, '')), '')
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
          -- מה שהרו"ח כבר קבע גובר על מה שהלקוח מזין
          family_status   = coalesce(nullif(family_status, ''), nullif(trim(coalesce(p_family_status, '')), '')),
          marriage_year   = case when p_family_status = 'married'  then coalesce(marriage_year,  p_family_status_year) else marriage_year  end,
          divorce_year    = case when p_family_status = 'divorced' then coalesce(divorce_year,   p_family_status_year) else divorce_year   end,
          widowhood_year  = case when p_family_status = 'widowed'  then coalesce(widowhood_year, p_family_status_year) else widowhood_year end,
          spouse_name     = coalesce(nullif(trim(coalesce(p_spouse_name, '')), ''), spouse_name),
          spouse_id_number = coalesce(nullif(trim(coalesce(p_spouse_id_number, '')), ''), spouse_id_number),
          representation_status = 'awaiting_accountant',
          updated_at      = now()
      where id = v_req.linked_client_id;
  end if;

  return true;
end;
$function$;

grant execute on function public.submit_onboarding_full(
  text, text, text, text, text, text, text, text, text, text, text, text, integer, text, text, text
) to anon, authenticated;


-- ─── (ד) מעקב ביצוע הייצוג מול הרשויות ─────────────────────────────────────
-- מתי הוזן בכל רשות, מספר האסמכתא של הביטוח הלאומי, המועד האחרון לאישור,
-- מתי נשלחו ההוראות ללקוח ומתי הוא אישר. ראה RepresentationExecution.
alter table public.representation_requests
  add column if not exists execution jsonb not null default '{}'::jsonb;


-- ─── (ה) שמירת גוף המייל שנשלח ─────────────────────────────────────────────
-- בלי זה אין דרך לראות מה הלקוח קיבל: הטבלה שמרה רק מטא-דאטה, ומפתח ה-API של
-- Resend מוגבל לשליחה ואינו מאפשר לשלוף תוכן בדיעבד.
alter table public.email_messages add column if not exists html text;
