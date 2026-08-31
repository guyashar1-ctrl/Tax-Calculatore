-- 148 — פרטי הזדהות של בן/בת הזוג, כשיש לו/לה תיק
--
-- ‼ הכרעת גיא (31.8): מי שיש לו הגשה בשע״ם צריך את ערכת ההזדהות שלו —
-- ת.ז. + רישיון/דרכון/ת.ז. הורה + תאריך לידה. עד כה נאספו מבן/בת הזוג רק
-- שם, ת.ז. ושנת לידה (לב"ל), ולכן כשהתיק (מע"מ/ניכויים/מ"ה) על שמו/ה — לרו"ח
-- לא היה במה להזדהות עליו/ה בשע״ם.
--
-- שלושה מפתחות חדשים ב-identification (jsonb — אין שינוי סכימה):
--   spouseBirthDate · spouseSecondaryType · spouseSecondaryValue
--
-- ‼ DROP לפני CREATE: הפרמטרים החדשים עם DEFAULT היו יוצרים חתימה שנייה
-- (overload), וקריאה בשמות של 19 הפרמטרים הישנים הייתה מתאימה לשתיהן —
-- PostgREST נופל על עמימות. לקוח ישן שקורא עם 19 שמות ממשיך לעבוד מול
-- הפונקציה החדשה דרך ה-DEFAULT-ים.

drop function if exists public.submit_onboarding_full(
  text, text, text, text, text, text, text, text, text, text, text,
  text, integer, text, text, text, text, text, integer);

create or replace function public.submit_onboarding_full(
  p_token text,
  p_first_name text,
  p_last_name text,
  p_id_number text,
  p_birth_date text,
  p_secondary_type text,
  p_secondary_value text,
  p_phone text,
  p_email text,
  p_city text,
  p_address text,
  p_family_status text,
  p_family_status_year integer,
  p_spouse_name text,
  p_spouse_email text,
  p_spouse_id_number text,
  p_spouse_first_name text default null,
  p_spouse_last_name text default null,
  p_spouse_birth_year integer default null,
  p_spouse_birth_date text default null,
  p_spouse_secondary_type text default null,
  p_spouse_secondary_value text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_req         public.representation_requests;
  v_full_name   text := trim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''));
  v_spouse_full text := coalesce(
    nullif(trim(coalesce(p_spouse_first_name, '') || ' ' || coalesce(p_spouse_last_name, '')), ''),
    nullif(trim(coalesce(p_spouse_name, '')), ''));
  v_signers     jsonb;
  v_spouse      jsonb;
begin
  select * into v_req from public.representation_requests where onboarding_token = p_token limit 1;
  if not found then
    return false;
  end if;

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
             || case when coalesce(s->>'signToken', '') = ''
                  then jsonb_build_object('signToken', replace(gen_random_uuid()::text, '-', ''))
                  else '{}'::jsonb end
        else s
      end
    )
    from jsonb_array_elements(v_signers) s
  );

  if p_family_status = 'married' and v_spouse_full is not null then
    select s into v_spouse from jsonb_array_elements(v_signers) s where s->>'role' = 'spouse' limit 1;
    v_spouse := coalesce(v_spouse, jsonb_build_object(
      'id', 'spouse', 'role', 'spouse', 'signStatus', 'pending',
      'signToken', replace(gen_random_uuid()::text, '-', '')
    )) || jsonb_build_object(
      'name', v_spouse_full,
      'email', coalesce(nullif(trim(coalesce(p_spouse_email, '')), ''), v_spouse->>'email', '')
    );
    v_signers := (
      select coalesce(jsonb_agg(s), '[]'::jsonb)
      from jsonb_array_elements(v_signers) s where s->>'role' <> 'spouse'
    ) || jsonb_build_array(v_spouse);
  elsif coalesce(nullif(trim(coalesce(p_family_status, '')), ''), '') <> '' then
    v_signers := (
      select coalesce(jsonb_agg(s), '[]'::jsonb)
      from jsonb_array_elements(v_signers) s
      where s->>'role' <> 'spouse' or s->>'signStatus' = 'signed'
    );
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
          'spouseName',       v_spouse_full,
          'spouseFirstName',  nullif(trim(coalesce(p_spouse_first_name, '')), ''),
          'spouseLastName',   nullif(trim(coalesce(p_spouse_last_name, '')), ''),
          'spouseBirthYear',  p_spouse_birth_year,
          'spouseEmail',      nullif(trim(coalesce(p_spouse_email, '')), ''),
          'spouseIdNumber',   nullif(trim(coalesce(p_spouse_id_number, '')), ''),
          -- ערכת ההזדהות של בן/בת הזוג — נשלחת רק כשיש לו/לה תיק (148)
          'spouseBirthDate',      nullif(trim(coalesce(p_spouse_birth_date, '')), ''),
          'spouseSecondaryType',  nullif(trim(coalesce(p_spouse_secondary_type, '')), ''),
          'spouseSecondaryValue', nullif(trim(coalesce(p_spouse_secondary_value, '')), '')
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
          family_status   = coalesce(nullif(trim(coalesce(p_family_status, '')), ''), family_status),
          marriage_year   = case when p_family_status = 'married'  then coalesce(p_family_status_year, marriage_year)  else marriage_year  end,
          divorce_year    = case when p_family_status = 'divorced' then coalesce(p_family_status_year, divorce_year)   else divorce_year   end,
          widowhood_year  = case when p_family_status = 'widowed'  then coalesce(p_family_status_year, widowhood_year) else widowhood_year end,
          spouse_name       = coalesce(v_spouse_full, spouse_name),
          spouse_first_name = coalesce(nullif(trim(coalesce(p_spouse_first_name, '')), ''), spouse_first_name),
          spouse_last_name  = coalesce(nullif(trim(coalesce(p_spouse_last_name, '')), ''), spouse_last_name),
          -- שנת לידה נגזרת מהתאריך המלא כשהוא נמסר — מקור אחד, לא שניים
          spouse_birth_year = coalesce(
            p_spouse_birth_year,
            (substring(coalesce(p_spouse_birth_date, '') from '^\d{4}'))::integer,
            spouse_birth_year),
          spouse_id_number  = coalesce(nullif(trim(coalesce(p_spouse_id_number, '')), ''), spouse_id_number),
          -- ‼ המייל של בן/בת הזוג נאסף בטופס ונשמר עד כה על בקשת הייצוג בלבד.
          -- הוא פרט קשר קבוע, בדיוק כמו השם והת"ז שלידו, ולכן הוא נשמר גם כאן.
          spouse_email      = coalesce(nullif(trim(coalesce(p_spouse_email, '')), ''), spouse_email),
          representation_status = 'awaiting_accountant',
          updated_at      = now()
      where id = v_req.linked_client_id;
  end if;

  return true;
end;
$function$;

grant execute on function public.submit_onboarding_full(
  text, text, text, text, text, text, text, text, text, text, text,
  text, integer, text, text, text, text, text, integer, text, text, text
) to anon, authenticated;
