-- ─── 110: בן/בת הזוג הם חלק מהקליטה של משק הבית — לא נספח של המשרד ────────────
--
-- ההכרעות (2026-08-17):
--   · לקוח נשוי ממלא את פרטי בן/בת הזוג בעצמו בקישור הקליטה — כולל שם פרטי,
--     שם משפחה ושנת לידה (ארבעת שדות ייפוי הכוח בב"ל). הרו"ח לא חייב לדעת אותם מראש.
--   · הלקוח הוא מקור האמת על המצב המשפחתי ופרטי בן/בת הזוג: מה שהוא מזין בקישור
--     גובר על מה שהוזן בכרטיס — עד כה מצב משפחתי בכרטיס ניצח בשקט את הלקוח,
--     בעוד שם/ת.ז. של בן/בת הזוג דווקא כן התעדכנו. הא-סימטריה הזו מוסרת.
--   · מייל של בן/בת הזוג אינו נתון קליטה. הוא נאסף רק כשבוחרים "לשלוח לבן/בת
--     הזוג בנפרד" בשלב החתימה — ולכן חותם בן/הזוג כבר לא יורש בשקט את המייל
--     של הנישום (הירושה השקטה גרמה לשני מיילים לאותה תיבה בלי שאיש בחר בזה).
--   · לקוח שמתקן ל"לא נשוי" מוריד את חותם בן/הזוג הממתין (חתימה שכבר נחתמה לא נמחקת).
--
-- (א) עמודות: clients.spouse_first_name / spouse_last_name / spouse_birth_year.
--     spouse_name נשאר ונכתב כשרשור — כל הקוראים הקיימים ממשיכים לעבוד.
-- (ב) submit_onboarding_full — פרמטרים חדשים עם ברירת מחדל (גרסת UI ישנה בדפדפן
--     ממשיכה לעבוד), עדיפות ללקוח, בלי ירושת מייל.
-- (ג) get_onboarding — prefill מתמזג עם נתוני הכרטיס (בלי family_status, שיש לו
--     ברירת מחדל בכרטיס ואי אפשר להבחין בין "נבחר" ל"לא נגעו").
-- (ד) open_quotation_representation — אותה הסרת ירושת מייל + העתקת השדות החדשים.
-- (ה) build_client_portal — כשממתינים רק לחתימת בן/בת הזוג, הפריט הופך לפעולה
--     שפותחת את מסך הבחירה של הנישום (לחתום יחד / לשלוח קישור אישי).

-- ── (א) עמודות ────────────────────────────────────────────────────────────────
alter table public.clients
  add column if not exists spouse_first_name text,
  add column if not exists spouse_last_name  text,
  add column if not exists spouse_birth_year integer;

-- מילוי-לאחור שמרני מהשם המשורשר: המילה הראשונה — שם פרטי, השאר — שם משפחה.
-- פיצול כזה שוגה בשמות מורכבים, ולכן הוא רק זריעה: הלקוח יתקן בקליטה, והקוד
-- החדש תמיד מעדיף את העמודות המפוצלות כשהן קיימות.
update public.clients
   set spouse_first_name = nullif(split_part(btrim(spouse_name), ' ', 1), ''),
       spouse_last_name  = nullif(btrim(substr(btrim(spouse_name),
                             length(split_part(btrim(spouse_name), ' ', 1)) + 1)), '')
 where coalesce(btrim(spouse_name), '') <> ''
   and spouse_first_name is null;

-- ── (ב) submit_onboarding_full ────────────────────────────────────────────────
-- החתימה הישנה נמחקת כדי שלא ייווצר עומס-יתר דו-משמעי מול PostgREST; לפרמטרים
-- החדשים יש ברירת מחדל, ולכן קריאה מגרסת UI ישנה (בלי הפרמטרים) עדיין תואמת.
drop function if exists public.submit_onboarding_full(text, text, text, text, text, text, text, text, text, text, text, text, integer, text, text, text);

create or replace function public.submit_onboarding_full(
  p_token text, p_first_name text, p_last_name text, p_id_number text,
  p_birth_date text, p_secondary_type text, p_secondary_value text,
  p_phone text, p_email text, p_city text, p_address text,
  p_family_status text, p_family_status_year integer,
  p_spouse_name text, p_spouse_email text, p_spouse_id_number text,
  p_spouse_first_name text default null,
  p_spouse_last_name  text default null,
  p_spouse_birth_year integer default null
) returns boolean
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_req         public.representation_requests;
  v_full_name   text := trim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''));
  -- שם בן/בת הזוג: השדות המפוצלים הם המקור; p_spouse_name נשמר לתאימות לאחור
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
    -- ‼ בלי ירושת מייל מהנישום: מייל ריק הוא מצב מתוכנן — הזוג יבחר בשלב
    -- החתימה אם לחתום יחד או לשלוח קישור אישי (ורק אז יוזן מייל).
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
    -- הלקוח הצהיר במפורש שאינו נשוי — חותם בן/זוג ממתין יורד. חתימה שנחתמה נשארת.
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
    -- ‼ הלקוח גובר: מה שהוזן בקישור נכתב לכרטיס גם כשיש שם ערך קודם.
    -- (עד מיגרציה 110 מצב משפחתי בכרטיס ניצח את הלקוח, בעוד פרטי בן/בת הזוג
    -- דווקא התעדכנו — עכשיו הכלל אחיד.) מה שהלקוח לא מילא — נשאר כשהיה.
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
          spouse_birth_year = coalesce(p_spouse_birth_year, spouse_birth_year),
          spouse_id_number  = coalesce(nullif(trim(coalesce(p_spouse_id_number, '')), ''), spouse_id_number),
          representation_status = 'awaiting_accountant',
          updated_at      = now()
      where id = v_req.linked_client_id;
  end if;

  return true;
end;
$function$;

-- ── (ג) get_onboarding — הכרטיס זורע, ה-prefill המפורש גובר ─────────────────
-- לקוח ותיק שכבר יש בכרטיסו פרטי בן/בת זוג לא יתבקש להקליד אותם מאפס.
-- family_status של הכרטיס לא נכלל בכוונה: יש לו ברירת מחדל ('רווק') ואי אפשר
-- להבחין בין בחירה מפורשת ל"אף אחד לא נגע" — ראה ההערה על OnboardingPrefill.
create or replace function public.get_onboarding(p_token text)
 returns table(client_name text, firm_name text, branding jsonb, already_submitted boolean, status text, authorities text[], already_signed boolean, has_setup boolean, known_first_name text, known_last_name text, known_email text, known_family_status text, known_family_status_year integer, ni_included boolean, prefill jsonb)
 language sql security definer set search_path to 'public'
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
         coalesce(c.authority_representations ? 'nationalInsurance', false) as ni_included,
         jsonb_strip_nulls(jsonb_build_object(
           'spouseName',      nullif(c.spouse_name, ''),
           'spouseFirstName', nullif(c.spouse_first_name, ''),
           'spouseLastName',  nullif(c.spouse_last_name, ''),
           'spouseIdNumber',  nullif(c.spouse_id_number, ''),
           'spouseBirthYear', c.spouse_birth_year
         )) || coalesce(r.prefill, '{}'::jsonb) as prefill
  from public.representation_requests r
  join public.profiles p on p.id = r.user_id
  left join public.clients c on c.id = r.linked_client_id
  where r.onboarding_token = p_token
  limit 1;
$function$;

-- ── (ד) open_quotation_representation ────────────────────────────────────────
-- שני שינויים לעומת הגרסה החיה: חותם בן/הזוג כבר לא יורש את מייל הנישום,
-- והשדות המפוצלים/שנת הלידה מה-prefill מועתקים לכרטיס שנולד מההצעה.
create or replace function public.open_quotation_representation(p_quotation_id text)
 returns text
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  q            public.quotations%rowtype;
  v_rep        jsonb;
  v_areas      jsonb;
  v_prefill    jsonb;
  v_spouse     jsonb;
  v_client_id  text;
  v_req_id     text := replace(gen_random_uuid()::text, '-', '');
  v_first      text;
  v_last       text;
  v_name       text;
  v_email      text;
  v_signers    jsonb;
  v_shaam      text[];
  v_area_keys  text[];
  v_labels     text;
  v_placeholder text;
  v_existing   public.clients%rowtype;
  v_added      text[];
  v_added_lbl  text;
  v_sp_full    text;
begin
  select * into q from public.quotations where id = p_quotation_id limit 1;
  if q.id is null then return null; end if;
  if q.representation_request_id is not null then return q.representation_request_id; end if;
  if q.status <> 'approved' then return null; end if;

  v_rep := coalesce(q.representation, '{}'::jsonb);
  if not coalesce((v_rep->>'enabled')::boolean, false) then return null; end if;

  v_areas   := coalesce(v_rep->'areas', '{}'::jsonb);
  v_prefill := coalesce(v_rep->'prefill', '{}'::jsonb);
  v_spouse  := v_rep->'spouse';
  if v_spouse = 'null'::jsonb then v_spouse := null; end if;
  select array_agg(k) into v_area_keys from jsonb_object_keys(v_areas) k;
  if v_area_keys is null then return null; end if;

  v_first := nullif(trim(coalesce(v_prefill->>'firstName', '')), '');
  v_last  := nullif(trim(coalesce(v_prefill->>'lastName', '')), '');
  v_name  := nullif(trim(coalesce(v_first, '') || ' ' || coalesce(v_last, '')), '');
  if v_name is null then
    select nullif(trim(coalesce(l.full_name, '')), '') into v_name
      from public.leads l where l.id = q.lead_id;
  end if;
  v_name := coalesce(v_name, nullif(trim(coalesce(q.snapshot->>'recipientName', '')), ''));
  if v_first is null and v_name is not null then
    v_first := split_part(v_name, ' ', 1);
    v_last  := nullif(trim(substr(v_name, length(split_part(v_name, ' ', 1)) + 1)), '');
  end if;

  v_email := nullif(trim(coalesce(v_prefill->>'email', '')), '');
  if v_email is null then
    select nullif(trim(coalesce(l.email, '')), '') into v_email
      from public.leads l where l.id = q.lead_id;
  end if;
  v_email := coalesce(v_email, nullif(trim(coalesce(q.snapshot->>'recipientEmail', '')), ''));

  v_sp_full := nullif(trim(coalesce(v_prefill->>'spouseName', '')), '');

  v_client_id := q.client_id;
  if v_client_id is null then
    select l.converted_client_id into v_client_id from public.leads l where l.id = q.lead_id;
  end if;

  if v_client_id is null and v_email is not null then
    select c.id into v_client_id
      from public.clients c
      where c.user_id = q.user_id
        and lower(trim(coalesce(c.email, ''))) = lower(v_email)
        and c.representation_request_id is not null
      limit 1;
  end if;

  select coalesce(array_agg(k), '{}'::text[]) into v_shaam
    from unnest(v_area_keys) k where k <> 'nationalInsurance';

  if v_client_id is not null then
    select * into v_existing from public.clients where id = v_client_id limit 1;
    if v_existing.id is null then
      v_client_id := null;

    elsif v_existing.representation_request_id is not null then
      select coalesce(array_agg(k), '{}'::text[]) into v_added
        from unnest(v_area_keys) k
        where not (coalesce(v_existing.authority_representations, '{}'::jsonb) ? k);

      if array_length(v_added, 1) > 0 then
        update public.clients
          set authority_representations = v_areas || coalesce(authority_representations, '{}'::jsonb),
              updated_at = now()
          where id = v_client_id;

        update public.representation_requests
          set authorities = (
                select coalesce(array_agg(distinct a), '{}'::text[])
                from unnest(coalesce(authorities, '{}'::text[]) || v_shaam) a
              ),
              updated_at = now()
          where id = v_existing.representation_request_id;
      end if;

      select string_agg(
        case k when 'incomeTax' then 'מס הכנסה'
               when 'withholding' then 'ניכויים'
               when 'vat' then 'מע"מ'
               when 'nationalInsurance' then 'ביטוח לאומי'
               else k end, ', ')
        into v_added_lbl from unnest(coalesce(v_added, '{}'::text[])) k;

      update public.quotations
        set client_id = v_client_id,
            representation_request_id = v_existing.representation_request_id,
            events = coalesce(events, '[]'::jsonb) || jsonb_build_object(
              'type', 'representation_opened', 'at', now(),
              'note', 'ללקוח כבר קיים תהליך ייצוג — לא נפתחה בקשה חדשה'
                      || case when v_added_lbl is not null
                              then '. נוספו רשויות: ' || v_added_lbl else '' end),
            updated_at = now()
        where id = q.id;
      return v_existing.representation_request_id;
    end if;
  end if;

  if v_client_id is null then
    v_placeholder := to_char(now() at time zone 'Asia/Jerusalem', 'DD/MM HH24:MI');
    v_client_id := replace(gen_random_uuid()::text, '-', '');
    insert into public.clients (
      id, user_id, first_name, last_name, email,
      representation_status, representation_request_id, authority_representations,
      family_status, marriage_year, divorce_year, widowhood_year,
      spouse_name, spouse_id_number,
      spouse_first_name, spouse_last_name, spouse_birth_year, notes
    ) values (
      v_client_id, q.user_id,
      coalesce(v_first, 'ממתין למילוי'),
      coalesce(v_last, case when v_first is null then v_placeholder else '' end),
      v_email,
      'pending_fill', v_req_id, v_areas,
      nullif(v_prefill->>'familyStatus', ''),
      case when v_prefill->>'familyStatus' = 'married'  then (v_prefill->>'familyStatusYear')::int end,
      case when v_prefill->>'familyStatus' = 'divorced' then (v_prefill->>'familyStatusYear')::int end,
      case when v_prefill->>'familyStatus' = 'widowed'  then (v_prefill->>'familyStatusYear')::int end,
      v_sp_full,
      nullif(v_prefill->>'spouseIdNumber', ''),
      nullif(split_part(coalesce(v_sp_full, ''), ' ', 1), ''),
      nullif(trim(substr(coalesce(v_sp_full, ''), length(split_part(coalesce(v_sp_full, ''), ' ', 1)) + 1)), ''),
      (v_prefill->>'spouseBirthYear')::int,
      'נוצר אוטומטית עם אישור הצעת מחיר ' || q.quotation_number || '. ממתין להשלמת הייצוג.'
    );
  else
    update public.clients
      set representation_status     = 'pending_fill',
          representation_request_id = v_req_id,
          authority_representations = coalesce(authority_representations, '{}'::jsonb) || v_areas,
          updated_at                = now()
      where id = v_client_id;
  end if;

  v_signers := jsonb_build_array(jsonb_build_object(
    'id', 'client', 'role', 'client',
    'name', coalesce(v_name, ''), 'email', coalesce(v_email, ''),
    'signStatus', 'pending',
    'signToken', replace(gen_random_uuid()::text, '-', '')
  ));
  if v_spouse is not null and coalesce(trim(v_spouse->>'name'), '') <> '' then
    -- ‼ בלי ירושת מייל מהנישום — מייל ריק פירושו שהזוג יבחר בשלב החתימה
    -- (לחתום יחד באותו מכשיר, או להזין מייל ולשלוח קישור אישי).
    v_signers := v_signers || jsonb_build_array(jsonb_build_object(
      'id', 'spouse', 'role', 'spouse',
      'name', trim(v_spouse->>'name'),
      'email', coalesce(nullif(trim(coalesce(v_spouse->>'email', '')), ''), ''),
      'signStatus', 'pending',
      'signToken', replace(gen_random_uuid()::text, '-', '')
    ));
  end if;

  insert into public.representation_requests (
    id, user_id, linked_client_id, client_name, client_email,
    authorities, requested_docs, notes, status,
    onboarding_token, onboarding_status, prefill, signers
  ) values (
    v_req_id, q.user_id, v_client_id, coalesce(v_name, ''), coalesce(v_email, ''),
    v_shaam,
    jsonb_build_array(
      jsonb_build_object('id','id_card','label','תצלום תעודת זהות + ספח','required',true,'isDefault',true),
      jsonb_build_object('id','drivers_license','label','תצלום רישיון נהיגה','required',true,'isDefault',true)
    ),
    'נפתח אוטומטית עם אישור הצעת מחיר ' || q.quotation_number || '.',
    'pending_fill',
    replace(gen_random_uuid()::text, '-', ''), 'pending', v_prefill, v_signers
  );

  select string_agg(
    case k when 'incomeTax' then 'מס הכנסה'
           when 'withholding' then 'ניכויים'
           when 'vat' then 'מע"מ'
           when 'nationalInsurance' then 'ביטוח לאומי'
           else k end, ', ')
    into v_labels from unnest(v_area_keys) k;

  if q.lead_id is not null then
    update public.leads
      set status = 'converted', converted_client_id = v_client_id, updated_at = now()
      where id = q.lead_id;
  end if;

  update public.quotations
    set client_id = v_client_id,
        representation_request_id = v_req_id,
        events = coalesce(events, '[]'::jsonb)
                 || jsonb_build_object('type', 'lead_converted', 'at', now())
                 || jsonb_build_object('type', 'representation_opened', 'at', now(),
                                       'note', 'רשויות: ' || coalesce(v_labels, '—')),
        updated_at = now()
    where id = q.id;

  return v_req_id;
end;
$function$;

-- ── (ה) build_client_portal — טלאי נקודתי על ההגדרה החיה ─────────────────────
-- הפונקציה גדולה ומתעדכנת ממיגרציות אחרות, ולכן לא משכתבים אותה: מושכים את
-- ההגדרה החיה, מחליפים אך ורק את ענף "ממתינים לחתימת בן/בת הזוג", ומריצים.
-- אם הטקסט לא נמצא (ההגדרה השתנתה) — נכשלים ברעש, לא דורסים בשקט.
do $patch$
declare
  src     text;
  patched text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'build_client_portal';

  patched := replace(src,
    $old$v_rep_item := jsonb_build_object('bucket','office','key','rep_sign_spouse','label','ייפוי הכוח','sub','ממתינים לחתימת בן/בת הזוג — קישור אישי נשלח במייל נפרד');$old$,
    -- הנישום כבר חתם; הקישור האישי שלו מציג עכשיו את מסך הבחירה (יחד / במייל),
    -- ולכן הפריט הופך לפעולה עם הטוקן שלו. הטוקן של בן/בת הזוג לעולם לא נחשף כאן.
    $new$select jsonb_strip_nulls(jsonb_build_object('bucket','action','key','rep_sign_spouse','label','חתימת בן/בת הזוג על ייפוי הכוח','sub','אפשר לחתום יחד עכשיו, או לשלוח לבן/בת הזוג קישור אישי','actionKind','sign','actionValue', x->>'signToken')) into v_rep_item
        from jsonb_array_elements(coalesce(req.signers, '[]'::jsonb)) x
        where x->>'role' = 'client' and coalesce(x->>'signToken', '') <> '' limit 1;$new$);

  if patched = src then
    raise exception 'build_client_portal: rep_sign_spouse branch not found — the live definition drifted, patch manually';
  end if;

  execute patched;
end;
$patch$;
