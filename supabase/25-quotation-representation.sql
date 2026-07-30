-- ─── 25: אישור הצעת מחיר פותח את תהליך הייצוג אוטומטית ──────────────────────
-- עד כה: הלקוח אישר, ואז הרו"ח היה צריך להיכנס למערכת, ללחוץ "הפוך ללקוח",
-- למלא את דיאלוג הייצוג ולשלוח קישור. הלקוח שאישר בשתיים בלילה חיכה עד שהרו"ח
-- ייזכר. עכשיו האישור עצמו עושה את כל זה.
--
-- ההגדרה נקבעת מראש בהצעה (quotations.representation), כי ברגע האישור אין אף
-- אחד שיבחר רשויות. המבנה זהה למה שדיאלוג הייצוג אוסף:
--   { enabled, areas: {רשות: {status,level,coversSpouse}}, prefill: {...},
--     spouse: {name,email,idNumber} | null }
--
-- מה נוצר באישור (הכל בטרנזקציה אחת של approve_quotation, ולכן או שהכל נוצר
-- או שכלום לא — לקוח בלי בקשת ייצוג הוא המצב הגרוע ביותר):
--   1. לקוח ("ממתין למילוי") עם מרשם ייצוג לכל רשות שנבחרה
--   2. בקשת ייצוג עם onboarding_token + חותמים (נישום, ובן/בת זוג אם ידוע)
--   3. משימה פנימית למעקב
--   4. הליד מסומן "הפך ללקוח" וההצעה נקשרת ללקוח
-- המייל עצמו נשלח מהפונקציה send-onboarding-email — SQL לא שולח מיילים.

alter table public.quotations
  add column if not exists representation            jsonb not null default '{}'::jsonb,
  add column if not exists representation_request_id text,
  add column if not exists representation_sent_at    timestamptz,
  add column if not exists representation_error      text;


-- ── עמוד ההצעה: גם הגדרת הייצוג, כדי להסביר ללקוח למה צריך ייצוג ───────────
create or replace function public.get_quotation(p_token text)
returns jsonb
language sql
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'quotationNumber', q.quotation_number,
    'status', q.status,
    'revision', q.revision,
    'expiresAt', q.expires_at,
    'vatRate', coalesce((q.snapshot->>'vatRate')::numeric, q.vat_rate),
    'recipientName', coalesce(q.snapshot->>'recipientName', l.full_name, nullif(trim(coalesce(c.first_name,'')||' '||coalesce(c.last_name,'')), '')),
    'businessName', coalesce(q.snapshot->>'businessName', l.business_name),
    'notesForClient', coalesce(q.snapshot->>'notesForClient', q.notes_for_client),
    'items', coalesce(q.snapshot->'items', q.items),
    'futureServices', coalesce(q.snapshot->'futureServices', q.future_services),
    -- ה-snapshot קודם: מה שהלקוח ראה ואישר הוא מה שקובע
    'representation', coalesce(q.snapshot->'representation', q.representation),
    -- הצעד הבא — רק אחרי אישור, ורק למי שמחזיק בטוקן ההצעה (הלקוח עצמו)
    'onboardingToken', (
      select r.onboarding_token from public.representation_requests r
      where r.id = q.representation_request_id
    ),
    'firm', jsonb_build_object(
      'firmName', p.firm_name,
      'branding', p.branding,
      'email', p.email,
      'phone', p.phone,
      'address', p.address,
      'emailSignature', p.communication->>'emailSignature'
    )
  )
  from public.quotations q
  left join public.leads l   on l.id = q.lead_id
  left join public.clients c on c.id = q.client_id
  left join public.profiles p on p.id = q.user_id
  where q.public_token = p_token
  limit 1;
$$;


-- ── פתיחת הייצוג. מוחזר מזהה הבקשה, או null אם לא נפתח דבר ─────────────────
-- נפרד מ-approve_quotation כדי שיהיה אפשר לקרוא לו גם בהשלמה בדיעבד (הצעה
-- שאושרה לפני שהאוטומציה עלתה לאוויר).
create or replace function public.open_quotation_representation(p_quotation_id text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
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
begin
  select * into q from public.quotations where id = p_quotation_id limit 1;
  if q.id is null then return null; end if;
  -- אידמפוטנטי: פעם אחת בלבד לכל הצעה
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

  -- ── שם ומייל: מה שהרו"ח מילא, אחרת מהליד, אחרת מה-snapshot של ההצעה ──
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

  -- ── הלקוח ──────────────────────────────────────────────────────────────
  -- הצעה ללקוח קיים (שירות נוסף): לא נוגעים בייצוג שכבר קיים לו. הצעה לליד
  -- שכבר הומר: משתמשים באותו כרטיס ולא פותחים שני לקוחות לאותו אדם.
  v_client_id := q.client_id;
  if v_client_id is null then
    select l.converted_client_id into v_client_id from public.leads l where l.id = q.lead_id;
  end if;

  -- שער נגד כרטיס כפול: אותה כתובת מייל שכבר יש לה תהליך ייצוג אצל אותו רו"ח.
  -- הבונה חוסם את זה בשליחה, אבל הצעה שנשלחה לפני שהלקוח נפתח בדרך אחרת עדיין
  -- יכולה להגיע לכאן — ושני כרטיסים לאותו אדם הם נזק שקשה לתקן.
  if v_client_id is null and v_email is not null then
    select c.id into v_client_id
      from public.clients c
      where c.user_id = q.user_id
        and lower(trim(coalesce(c.email, ''))) = lower(v_email)
        and c.representation_request_id is not null
      limit 1;
  end if;

  if v_client_id is not null then
    select * into v_existing from public.clients where id = v_client_id limit 1;
    if v_existing.id is null then
      v_client_id := null;
    elsif v_existing.representation_request_id is not null then
      -- כבר יש לו תהליך ייצוג — לא פותחים שני
      update public.quotations
        set client_id = v_client_id,
            representation_request_id = v_existing.representation_request_id,
            events = coalesce(events, '[]'::jsonb) || jsonb_build_object(
              'type', 'representation_opened', 'at', now(),
              'note', 'ללקוח כבר קיים תהליך ייצוג — לא נפתח חדש'),
            updated_at = now()
        where id = q.id;
      return v_existing.representation_request_id;
    end if;
  end if;

  if v_client_id is null then
    -- כרטיס בלי שם צריך תווית שאפשר לזהות ברשימה; submit_onboarding_full דורס
    -- אותה בשם האמיתי כשהלקוח ממלא.
    v_placeholder := to_char(now() at time zone 'Asia/Jerusalem', 'DD/MM HH24:MI');
    v_client_id := replace(gen_random_uuid()::text, '-', '');
    insert into public.clients (
      id, user_id, first_name, last_name, email,
      representation_status, representation_request_id, authority_representations,
      family_status, marriage_year, divorce_year, widowhood_year,
      spouse_name, spouse_id_number, notes
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
      nullif(v_prefill->>'spouseName', ''),
      nullif(v_prefill->>'spouseIdNumber', ''),
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

  -- ── החותמים: הנישום תמיד; בן/בת הזוג רק אם שמו ידוע כבר עכשיו ──────────
  v_signers := jsonb_build_array(jsonb_build_object(
    'id', 'client', 'role', 'client',
    'name', coalesce(v_name, ''), 'email', coalesce(v_email, ''),
    'signStatus', 'pending',
    'signToken', replace(gen_random_uuid()::text, '-', '')
  ));
  if v_spouse is not null and coalesce(trim(v_spouse->>'name'), '') <> '' then
    v_signers := v_signers || jsonb_build_array(jsonb_build_object(
      'id', 'spouse', 'role', 'spouse',
      'name', trim(v_spouse->>'name'),
      -- אין מייל נפרד לבן/בת הזוג ⇒ שתי בקשות החתימה נשלחות למייל של הנישום
      'email', coalesce(nullif(trim(coalesce(v_spouse->>'email', '')), ''), v_email, ''),
      'signStatus', 'pending',
      'signToken', replace(gen_random_uuid()::text, '-', '')
    ));
  end if;

  -- טופס 2279א'5 (שע"ם) מכסה מ"ה/ניכויים/מע"מ בלבד; ביטוח לאומי הוא ייצוג
  -- נפרד ולכן נשמר רק במרשם הלקוח ולא ברשויות הבקשה.
  select coalesce(array_agg(k), '{}'::text[]) into v_shaam
    from unnest(v_area_keys) k where k <> 'nationalInsurance';

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

  -- ── משימה פנימית למעקב ─────────────────────────────────────────────────
  select string_agg(
    case k when 'incomeTax' then 'מס הכנסה'
           when 'withholding' then 'ניכויים'
           when 'vat' then 'מע"מ'
           when 'nationalInsurance' then 'ביטוח לאומי'
           else k end, ', ')
    into v_labels from unnest(v_area_keys) k;

  insert into public.tasks (id, user_id, client_id, category, title, description, ball_with, status, progress, priority)
  values (
    replace(gen_random_uuid()::text, '-', ''), q.user_id, v_client_id, 'institutions',
    'להשלים ייצוג — ' || coalesce(v_name, 'לקוח חדש מהצעה ' || q.quotation_number),
    'ההצעה ' || q.quotation_number || ' אושרה ונחתמה. קישור הייצוג נשלח ללקוח. רשויות: ' || coalesce(v_labels, '—') || '.',
    'client', 'open', 'new', 'normal'
  );

  -- ── הליד הפך ללקוח, וההצעה נקשרת ─────────────────────────────────────
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
$$;


-- ── האישור: מסמן מאושר, פותח ייצוג, ומחזיר גם את הצעד הבא ללקוח ───────────
-- טיפוס ההחזרה משתנה מ-text ל-jsonb (הלקוח צריך גם את טוקן האונבורדינג כדי
-- להמשיך מיד באותו מסך), ולכן drop לפני create.
drop function if exists public.approve_quotation(text, text, text);

create or replace function public.approve_quotation(
  p_token text,
  p_signature text default null,
  p_signer_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  q        public.quotations%rowtype;
  v_req_id text;
  v_token  text;
begin
  select * into q from public.quotations where public_token = p_token limit 1;
  if q.id is null then return jsonb_build_object('status', 'invalid'); end if;

  if q.status = 'approved' then
    -- אידמפוטנטי, אבל עדיין מחזיר את הצעד הבא: לקוח שרענן את העמוד או חזר
    -- מהמייל צריך למצוא את הקישור, לא מסך "כבר אושר" ללא המשך.
    v_req_id := coalesce(q.representation_request_id, public.open_quotation_representation(q.id));
    select r.onboarding_token into v_token from public.representation_requests r where r.id = v_req_id;
    return jsonb_build_object('status', 'approved', 'onboardingToken', v_token);
  end if;
  if q.status = 'cancelled' then return jsonb_build_object('status', 'cancelled'); end if;
  if q.expires_at is not null and q.expires_at < now() then
    update public.quotations
      set status = 'expired',
          events = coalesce(events, '[]'::jsonb) || jsonb_build_object('type','expired','at', now())
      where id = q.id and status <> 'expired';
    return jsonb_build_object('status', 'expired');
  end if;
  if q.status not in ('sent','viewed') then return jsonb_build_object('status', q.status); end if;

  update public.quotations
    set status = 'approved',
        approved_at = now(),
        approval_signature = coalesce(p_signature, approval_signature),
        approval_signer_name = coalesce(nullif(trim(p_signer_name), ''), approval_signer_name),
        events = coalesce(events, '[]'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
          'type', 'approved',
          'at', now(),
          'note', case when nullif(trim(p_signer_name), '') is not null
                       then 'נחתם על ידי ' || trim(p_signer_name) end
        ))
    where id = q.id;

  v_req_id := public.open_quotation_representation(q.id);
  select r.onboarding_token into v_token from public.representation_requests r where r.id = v_req_id;
  return jsonb_build_object('status', 'approved', 'onboardingToken', v_token);
end;
$$;

grant execute on function public.get_quotation(text) to anon, authenticated;
grant execute on function public.approve_quotation(text, text, text) to anon, authenticated;
-- open_quotation_representation נקראת רק מתוך approve_quotation ומהמערכת עצמה
grant execute on function public.open_quotation_representation(text) to authenticated;
