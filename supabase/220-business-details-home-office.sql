-- ═══════════════════════════════════════════════════════════════════════════
-- 220 · פרטי העסק ועבודה מהבית — בקשה בקבוצת פייפרלס, תשובות, אישור המשרד
--        ואישור נפרד שהאחוז הוזן בפייפרלס (05.10.2026)
--
-- המקור: docs/CLAUDE-REQUESTS-AND-PAPERLESS-MILESTONE-2026-10-05.md §4–§5,
-- וההדמיה המאושרת docs/prototypes/requests-approved-2026-10-05/reference.html.
--
-- מה נוסף:
--   1. סוג בקשה חדש `business_details` («פרטי העסק») — של הלקוח, בקבוצת פייפרלס.
--      נפתח יחד עם «הרשמה לפייפרלס» (טריגר על יצירתה — מחולל הקליטה וגם «＋ בקשה»),
--      וזמין ידנית מ«＋ בקשה» ללקוח קיים. ‼ אין פתיחה בדיעבד ללקוחות קיימים.
--   2. שתי טבלאות היסטוריה בלבד-הוספה:
--        client_home_office_answers   — מה נמסר (הלקוח או המשרד), מתי ומאיזה נתיב;
--        client_home_office_approvals — האחוז שהמשרד אישר, מי ומתי, מאיזה תאריך,
--                                       ואישור נפרד שהוזן בפייפרלס.
--      ‼ התשובה המקורית לעולם אינה נכתבת מחדש: תשובה חדשה היא שורה חדשה, ואישור
--      שניתן לתשובה קודמת מוצג «לבדיקה» — לא נמחק ולא ממשיך להיראות עדכני.
--   3. RPC: save_home_office_answers (משרד), approve_home_office (משרד, עד 25%),
--      confirm_home_office_in_paperless (משרד, אישור ידני נפרד),
--      get_home_office (קריאה), portal_submit_business_details (הלקוח בדף האישי).
--   4. הדף האישי: ענף business_details ב-build_client_portal (גוף 216 + הענף),
--      והסוג נכנס ל«מה מותר להודיע» (_client_announceable_steps, גוף 214 + הסוג).
--
-- ‼ כלל המשרד (גיא, 05.10.2026): אחוז מאושר מרבי 25%. זו דרישת המשרד, לא קביעה משפטית.
--   היחס המחושב נשמר ומוצג בנפרד גם כשהוא גבוה מהתקרה; האישור עצמו לא יעלה עליה.
-- ‼ ספירת החדרים: «כולל חדרי העסק, בלי מטבח, חדרי רחצה ושירותים» — מוסכמת ניסוח של
--   השאלון (ההדמיה המאושרת), לא הלכה משפטית. חדרים בגדלים שונים — הערה ותיקון המשרד.
-- ‼ שום דבר כאן לא כותב לפייפרלס, לא שולח מייל, ולא נוגע בבקשות קיימות.
--
-- סבב 2 (ביקורת עצמאית, 05.10):
--   · סדר אחד לכל פעולה על עבודה מהבית ושם העסק: נעילת שורת הלקוח (FOR UPDATE) לפני כל
--     קריאה שעליה נשענת ההחלטה — כך ששמירה מקבילה של המשרד לא נדרסת ואישור לא «מצליח»
--     על תשובות שהתחלפו.
--   · היסטוריה לשינוי שם העסק (tax_fact_changes, מקור 'manual' / 'portal') — מכל נתיב.
--   · שם עסק שהושלם בתיק המס מסגיר בקשת «פרטי העסק» שחיכתה רק לו.
--   · «הקמת העסק בפייפרלס» לא נסגרת כהושלמה כשפרטי העסק פתוחים, או כשאחוז מאושר טרם
--     סומן כמוזן בפייפרלס (טריגר — כל נתיב; רק במעבר, לא בדיעבד).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · הסוג ────────────────────────────────────────────────────────────────
alter table public.onboarding_steps drop constraint if exists onboarding_steps_step_type_check;
alter table public.onboarding_steps add constraint onboarding_steps_step_type_check
  check (step_type = any (array[
    'representation', 'file_opening', 'representation_upgrade', 'release_letter', 'rep_client_approval',
    'materials_received', 'paperless_invite', 'paperless_connection', 'paperless_tax_authority',
    'data_import', 'data_verification', 'retainer_authorization', 'internal_setup', 'kyc_identification',
    'first_month_review', 'intake_questionnaire', 'client_documents', 'prev_accountant_details',
    'custom_request', 'institution_alignment_btl', 'institution_alignment_vat',
    'institution_alignment_income', 'opening_call', 'authority_representation',
    'business_details']));

-- «פתוחה אחת ללקוח, ואחת לכל התקשרות» — בדיוק כמו «מסמכים מהלקוח» (217, D4):
-- אחרי שהושלמה מותרת חדשה (שינוי מהותי בתשובות = בקשה חדשה או פתיחה מחדש).
drop index if exists public.onboarding_steps_person_type_idx;
create unique index onboarding_steps_person_type_idx on public.onboarding_steps (client_id, step_type)
  where scope = 'person' and status <> 'cancelled'
    and step_type <> all (array['custom_request', 'authority_representation', 'client_documents',
      'prev_accountant_details', 'release_letter', 'materials_received', 'intake_questionnaire',
      'retainer_authorization', 'business_details']);
drop index if exists public.onboarding_steps_person_type_open_idx;
create unique index onboarding_steps_person_type_open_idx on public.onboarding_steps (client_id, step_type)
  where scope = 'person' and status <> all (array['completed', 'verified', 'skipped', 'cancelled'])
    and step_type = any (array['client_documents', 'prev_accountant_details', 'release_letter',
      'materials_received', 'intake_questionnaire', 'retainer_authorization', 'business_details']);
drop index if exists public.onboarding_steps_unassigned_type_idx;
create unique index onboarding_steps_unassigned_type_idx on public.onboarding_steps (client_id, step_type)
  where scope = 'person' and engagement_id is null and status <> 'cancelled'
    and step_type = any (array['client_documents', 'prev_accountant_details', 'release_letter',
      'materials_received', 'intake_questionnaire', 'retainer_authorization', 'business_details']);

create or replace function public.per_engagement_step_types()
returns text[] language sql immutable set search_path to 'public' as $$
  select array['client_documents', 'prev_accountant_details', 'release_letter', 'materials_received',
               'intake_questionnaire', 'retainer_authorization', 'business_details'];
$$;

create or replace function public.request_creatable_step_types()
returns text[] language sql immutable as $function$
  select array['client_documents','prev_accountant_details','custom_request',
               'paperless_invite','paperless_connection','paperless_tax_authority',
               'rep_client_approval','retainer_authorization',
               'release_letter','materials_received','file_opening',
               'intake_questionnaire','kyc_identification','internal_setup',
               'business_details'];
$function$;

create or replace function public.onboarding_track_for(p_step_type text)
returns text language sql immutable as $function$
  select case p_step_type
    when 'representation' then 'authorities'
    when 'representation_upgrade' then 'authorities'
    when 'rep_client_approval' then 'authorities'
    when 'authority_representation' then 'authorities'
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
    when 'business_details' then 'tools'
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

-- ── 2 · ההיסטוריה ───────────────────────────────────────────────────────────
create table if not exists public.client_home_office_answers (
  id            text primary key default replace(gen_random_uuid()::text, '-', ''),
  -- ‼ סדר אמין: שתי מסירות באותו רגע (אותה טרנזקציה, אותו now()) — «האחרונה» לפי seq, לא לפי זמן.
  seq           bigint generated always as identity,
  user_id       uuid not null,
  client_id     text not null references public.clients(id) on delete cascade,
  step_id       text references public.onboarding_steps(id) on delete set null,
  -- 'client' = הלקוח בדף האישי · 'office' = המשרד (מילוי במקום הלקוח / תיקון)
  source        text not null check (source in ('client', 'office')),
  has_dedicated_room boolean not null,
  total_rooms    numeric(5,1),
  business_rooms numeric(5,1),
  -- היחס כפי שחושב ברגע המסירה (business/total*100) — לא «הזכאות».
  ratio_percent  numeric(5,1),
  note          text,
  submitted_by  uuid,
  created_at    timestamptz not null default now(),
  constraint ho_answers_rooms check (
    (has_dedicated_room = false and total_rooms is null and business_rooms is null)
    or (has_dedicated_room = true and total_rooms > 0 and business_rooms > 0
        and business_rooms <= total_rooms and total_rooms <= 50
        and total_rooms * 2 = trunc(total_rooms * 2) and business_rooms * 2 = trunc(business_rooms * 2)))
);
create index if not exists client_home_office_answers_client_idx
  on public.client_home_office_answers (client_id, seq desc);

create table if not exists public.client_home_office_approvals (
  id            text primary key default replace(gen_random_uuid()::text, '-', ''),
  seq           bigint generated always as identity,
  user_id       uuid not null,
  client_id     text not null references public.clients(id) on delete cascade,
  answers_id    text not null references public.client_home_office_answers(id) on delete cascade,
  -- ‼ 0 מותר במפורש («המשרד אישר 0%») — שונה מ«אין חדר בלעדי» ומ«טרם אושר».
  approved_percent numeric(5,1) not null check (approved_percent >= 0 and approved_percent <= 25),
  effective_from date not null,
  note          text,
  approved_by   uuid,
  approved_at   timestamptz not null default now(),
  -- אישור ידני נפרד: המשרד הזין את האחוז הזה בפייפרלס. אין אינטגרציה — הצהרה של המשרד.
  paperless_entered_at timestamptz,
  paperless_entered_by uuid
);
create index if not exists client_home_office_approvals_client_idx
  on public.client_home_office_approvals (client_id, seq desc);

alter table public.client_home_office_answers enable row level security;
alter table public.client_home_office_approvals enable row level security;
drop policy if exists ho_answers_own on public.client_home_office_answers;
create policy ho_answers_own on public.client_home_office_answers for select to authenticated
  using (user_id = auth.uid());
drop policy if exists ho_approvals_own on public.client_home_office_approvals;
create policy ho_approvals_own on public.client_home_office_approvals for select to authenticated
  using (user_id = auth.uid());
drop policy if exists require_authorized on public.client_home_office_answers;
create policy require_authorized on public.client_home_office_answers as restrictive for all to authenticated
  using (public.is_authorized());
drop policy if exists require_authorized on public.client_home_office_approvals;
create policy require_authorized on public.client_home_office_approvals as restrictive for all to authenticated
  using (public.is_authorized());
revoke all on public.client_home_office_answers, public.client_home_office_approvals from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.client_home_office_answers, public.client_home_office_approvals from authenticated;
grant select on public.client_home_office_answers, public.client_home_office_approvals to authenticated;

-- ── 3 · בדיקת תשובות — מקור אחד לשני הנתיבים ────────────────────────────────
-- מחזירה קוד שגיאה, או null כשהתשובות תקינות. אותם כללים כמו homeOffice.ts במסך.
create or replace function public._home_office_answers_error(p_data jsonb)
returns text language plpgsql immutable set search_path to 'public' as $$
declare
  v_has text := p_data->>'hasDedicatedRoom';
  v_total numeric;
  v_biz numeric;
begin
  if v_has is null or v_has not in ('true', 'false') then return 'missing_has_room'; end if;
  if v_has = 'false' then return null; end if;
  begin
    v_total := nullif(p_data->>'totalRooms', '')::numeric;
    v_biz := nullif(p_data->>'businessRooms', '')::numeric;
  exception when others then
    return 'rooms_not_numeric';
  end;
  if v_total is null or v_biz is null then return 'missing_rooms'; end if;
  if v_total <= 0 or v_biz <= 0 then return 'rooms_not_positive'; end if;
  if v_total > 50 then return 'rooms_too_many'; end if;
  if v_total * 2 <> trunc(v_total * 2) or v_biz * 2 <> trunc(v_biz * 2) then return 'rooms_precision'; end if;
  if v_biz > v_total then return 'business_rooms_exceed_total'; end if;
  return null;
end;
$$;

-- כותבת שורת תשובות (אחרי בדיקה). פנימית — נקראת משני הנתיבים בלבד.
create or replace function public._home_office_insert_answers(
  p_client_id text, p_user_id uuid, p_step_id text, p_source text, p_data jsonb, p_by uuid
) returns text language plpgsql security definer set search_path to 'public' as $$
declare
  v_has boolean := (p_data->>'hasDedicatedRoom')::boolean;
  v_total numeric := case when v_has then (p_data->>'totalRooms')::numeric end;
  v_biz numeric := case when v_has then (p_data->>'businessRooms')::numeric end;
  v_id text;
begin
  insert into public.client_home_office_answers
    (user_id, client_id, step_id, source, has_dedicated_room, total_rooms, business_rooms,
     ratio_percent, note, submitted_by)
  values (p_user_id, p_client_id, p_step_id, p_source, v_has, v_total, v_biz,
          case when v_has then round(v_biz / v_total * 100, 1) end,
          nullif(left(trim(coalesce(p_data->>'note', '')), 1000), ''), p_by)
  returning id into v_id;
  return v_id;
end;
$$;

/** המצב הנוכחי — תשובות אחרונות, אישור אחרון, וההיסטוריה. נגזר; לא נשמר. */
create or replace function public._home_office_state(p_client_id text)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'answers', coalesce((select jsonb_agg(to_jsonb(a) - 'user_id' order by a.seq desc)
                           from public.client_home_office_answers a where a.client_id = p_client_id), '[]'::jsonb),
    'approvals', coalesce((select jsonb_agg(to_jsonb(x) - 'user_id' order by x.seq desc)
                             from public.client_home_office_approvals x where x.client_id = p_client_id), '[]'::jsonb));
$$;

create or replace function public.get_home_office(p_client_id text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  c public.clients%rowtype;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if auth.uid() is null or c.user_id <> auth.uid() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  return jsonb_build_object('ok', true) || public._home_office_state(p_client_id);
end;
$$;

-- הבקשה הפתוחה של הלקוח (אם יש) — לשורת היומן ולסגירה.
create or replace function public._open_business_details_step(p_client_id text)
returns public.onboarding_steps language sql stable security definer set search_path to 'public' as $$
  select * from public.onboarding_steps
   where client_id = p_client_id and step_type = 'business_details'
     and status not in ('completed', 'verified', 'skipped', 'cancelled')
   order by created_at desc limit 1;
$$;

/**
 * ‼ הבקשה נסגרת רק כשיש לה את מה שביקשה: שם עסק בכרטיס, ותשובה על עבודה מהבית —
 * «אין חדר בלעדי» (סוגר את האיסוף; אין אישור מומצא), או אחוז שהמשרד אישר לתשובות
 * האחרונות. אחרת — אצל המשרד לבדיקה, או אצל הלקוח כשחסר לו מה למלא.
 */
create or replace function public._settle_business_details_step(p_client_id text, p_actor text, p_note text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare
  s public.onboarding_steps%rowtype;
  c public.clients%rowtype;
  a public.client_home_office_answers%rowtype;
  v_appr boolean;
  v_to text;
begin
  s := public._open_business_details_step(p_client_id);
  if s.id is null then return null; end if;
  select * into c from public.clients where id = p_client_id;
  select * into a from public.client_home_office_answers where client_id = p_client_id
   order by seq desc limit 1;
  if a.id is null then return 'unanswered'; end if;
  v_appr := exists (select 1 from public.client_home_office_approvals x
                     where x.client_id = p_client_id and x.answers_id = a.id);
  if nullif(trim(coalesce(c.business_name, '')), '') is not null
     and (a.has_dedicated_room = false or v_appr) then
    update public.onboarding_steps
       set status = 'completed', ball = 'me', completed_at = now(), needs_attention = false,
           completion_method = case when p_actor = 'client' then 'system' else 'manual' end,
           completed_by = case when p_actor = 'client' then null else auth.uid() end,
           updated_at = now()
     where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', p_actor, p_note,
      jsonb_build_object('from', s.status, 'to', 'completed'));
    perform public.unlock_dependent_steps(s.id);
    v_to := 'completed';
  else
    -- יש תשובות — הבדיקה אצל המשרד (אחוז לאישור, או שם עסק חסר).
    update public.onboarding_steps
       set status = 'in_progress', ball = 'me', needs_attention = false, updated_at = now(),
           payload = payload || jsonb_build_object('answersAt', to_jsonb(a.created_at), 'answersSource', a.source)
     where id = s.id;
    if p_note is not null then
      perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id,
        case when s.status = 'in_progress' then 'note' else 'status_changed' end, p_actor, p_note,
        jsonb_build_object('from', s.status, 'to', 'in_progress'));
    end if;
    v_to := 'in_progress';
  end if;
  return v_to;
end;
$$;

-- ── 4 · המשרד ───────────────────────────────────────────────────────────────
create or replace function public.save_home_office_answers(p_client_id text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  c public.clients%rowtype;
  v_err text;
  v_id text;
  s public.onboarding_steps%rowtype;
  v_state text;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if auth.uid() is null or c.user_id <> auth.uid() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  -- ‼ סדר אחד לכל הלקוח: השורה נעולה עד סוף הטרנזקציה (אישור/שליחה מקבילים מחכים).
  select * into c from public.clients where id = c.id for update;
  v_err := public._home_office_answers_error(coalesce(p_data, '{}'::jsonb));
  if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err); end if;
  s := public._open_business_details_step(c.id);
  v_id := public._home_office_insert_answers(c.id, c.user_id, s.id, 'office', p_data, auth.uid());
  if s.id is not null then
    v_state := public._settle_business_details_step(c.id, 'accountant', 'המשרד עדכן את פרטי העבודה מהבית');
  end if;
  return jsonb_build_object('ok', true, 'answersId', v_id, 'step', v_state) || public._home_office_state(c.id);
end;
$$;

create or replace function public.approve_home_office(
  p_client_id text, p_answers_id text, p_percent numeric, p_effective_from date, p_note text default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  c public.clients%rowtype;
  a public.client_home_office_answers%rowtype;
  v_latest text;
  v_id text;
  v_state text;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if auth.uid() is null or c.user_id <> auth.uid() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  -- ‼ נעילה לפני «מהן התשובות האחרונות»: תשובה שנשמרת במקביל מחכה, או שהאישור רואה אותה.
  select * into c from public.clients where id = c.id for update;
  select * into a from public.client_home_office_answers where id = p_answers_id and client_id = c.id;
  if a.id is null then return jsonb_build_object('ok', false, 'error', 'answers_not_found'); end if;
  -- ‼ מאשרים רק את התשובות האחרונות: אישור לתשובה שכבר הוחלפה היה מציג אחוז ישן כעדכני.
  select id into v_latest from public.client_home_office_answers where client_id = c.id
   order by seq desc limit 1;
  if v_latest <> a.id then
    return jsonb_build_object('ok', false, 'error', 'answers_changed') || public._home_office_state(c.id);
  end if;
  if a.has_dedicated_room = false and coalesce(p_percent, 0) <> 0 then
    return jsonb_build_object('ok', false, 'error', 'no_room_percent');
  end if;
  if p_percent is null or p_percent < 0 then return jsonb_build_object('ok', false, 'error', 'percent_invalid'); end if;
  if p_percent > 25 then return jsonb_build_object('ok', false, 'error', 'percent_above_cap'); end if;
  if p_percent * 10 <> trunc(p_percent * 10) then return jsonb_build_object('ok', false, 'error', 'percent_precision'); end if;
  if p_effective_from is null then return jsonb_build_object('ok', false, 'error', 'missing_effective_from'); end if;

  insert into public.client_home_office_approvals
    (user_id, client_id, answers_id, approved_percent, effective_from, note, approved_by)
  values (c.user_id, c.id, a.id, p_percent, p_effective_from, nullif(left(trim(coalesce(p_note, '')), 1000), ''), auth.uid())
  returning id into v_id;

  v_state := public._settle_business_details_step(c.id, 'accountant',
    'המשרד אישר משרד ביתי: ' || trim(to_char(p_percent, 'FM990.0')) || '% מ-' || to_char(p_effective_from, 'DD.MM.YYYY'));
  return jsonb_build_object('ok', true, 'approvalId', v_id, 'step', v_state) || public._home_office_state(c.id);
end;
$$;

create or replace function public.confirm_home_office_in_paperless(p_approval_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  x public.client_home_office_approvals%rowtype;
  v_latest_answers text;
  v_latest_approval text;
  s public.onboarding_steps%rowtype;
begin
  select * into x from public.client_home_office_approvals where id = p_approval_id;
  if x.id is null then return jsonb_build_object('ok', false, 'error', 'approval_not_found'); end if;
  if auth.uid() is null or x.user_id <> auth.uid() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  perform 1 from public.clients where id = x.client_id for update;
  select * into x from public.client_home_office_approvals where id = p_approval_id;
  select id into v_latest_answers from public.client_home_office_answers where client_id = x.client_id
   order by seq desc limit 1;
  select id into v_latest_approval from public.client_home_office_approvals where client_id = x.client_id
   order by seq desc limit 1;
  -- ‼ רק האישור העדכני של התשובות העדכניות. אחוז ישן שהוזן בפייפרלס אינו «עודכן».
  if x.answers_id <> v_latest_answers or x.id <> v_latest_approval then
    return jsonb_build_object('ok', false, 'error', 'approval_not_current') || public._home_office_state(x.client_id);
  end if;
  if x.paperless_entered_at is not null then
    return jsonb_build_object('ok', true, 'noop', true) || public._home_office_state(x.client_id);
  end if;
  update public.client_home_office_approvals
     set paperless_entered_at = now(), paperless_entered_by = auth.uid()
   where id = x.id;
  select * into s from public.onboarding_steps
   where client_id = x.client_id and step_type = 'paperless_connection' and status <> 'cancelled'
   order by created_at desc limit 1;
  if s.id is not null then
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'accountant',
      'סומן: אחוז המשרד הביתי (' || trim(to_char(x.approved_percent, 'FM990.0')) || '%) הוזן בפייפרלס',
      jsonb_build_object('action', 'home_office_paperless', 'approvalId', x.id));
  end if;
  return jsonb_build_object('ok', true) || public._home_office_state(x.client_id);
end;
$$;

-- ── 5 · הלקוח, בדף האישי ────────────────────────────────────────────────────
/**
 * ‼ מקום כתיבה אחד: שם העסק ל-clients.business_name (כמו ההרשמה, 208), והתשובות
 *   לטבלת ההיסטוריה. בלי עותק על הבקשה.
 * ‼ הגנה מדריסה: p_data.expectedBusinessName = השם שהדף הציג. אם המשרד שינה את השם
 *   בינתיים והלקוח שולח ערך אחר — 'stale', עם השם הנוכחי, ולא נכתב כלום.
 */
create or replace function public.portal_submit_business_details(p_token text, p_step_id text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  c public.clients%rowtype;
  s public.onboarding_steps%rowtype;
  v_biz text;
  v_cur text;
  v_expected text;
  v_err text;
  v_state text;
  v_has boolean;
  v_client_name text;
begin
  -- ‼ FOR UPDATE בקריאה הראשונה: ההשוואה לשם «שהדף הציג» נעשית מול השורה העדכנית תחת
  -- נעילה. עדכון של המשרד שהתחיל קודם — ממתינים לו ורואים את התוצאה שלו; שמתחיל אחרי —
  -- ממתין לנו, ו-update_client_fields שלו מקבל 'stale' (updated_at השתנה).
  select * into c from public.clients where portal_token = p_token limit 1 for update;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if c.portal_token_expires_at is not null and c.portal_token_expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  update public.clients set portal_token_last_used_at = now() where id = c.id;

  select * into s from public.onboarding_steps where id = p_step_id and client_id = c.id;
  if s.id is null or s.step_type <> 'business_details' then
    return jsonb_build_object('ok', false, 'error', 'step_not_found');
  end if;
  if s.status in ('completed', 'verified', 'skipped', 'cancelled') then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;
  -- אותו שער כמו הדף: מה שהלקוח לא רואה — הוא גם לא יכול לשלוח.
  if s.published_at is null or not public.client_step_gate_open(c.id, s.published_at) then
    return jsonb_build_object('ok', false, 'error', 'not_published');
  end if;
  if s.status = 'locked' then return jsonb_build_object('ok', false, 'error', 'locked'); end if;

  v_err := public._home_office_answers_error(coalesce(p_data->'homeOffice', '{}'::jsonb));
  if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err); end if;

  v_biz := nullif(left(trim(coalesce(p_data->>'businessName', '')), 200), '');
  v_cur := nullif(trim(coalesce(c.business_name, '')), '');
  v_expected := nullif(trim(coalesce(p_data->>'expectedBusinessName', '')), '');
  if v_biz is null and v_cur is null then
    return jsonb_build_object('ok', false, 'error', 'missing_business_name');
  end if;
  if v_biz is not null and v_biz is distinct from v_cur and v_expected is distinct from v_cur then
    return jsonb_build_object('ok', false, 'error', 'stale', 'businessName', v_cur);
  end if;
  if v_biz is not null and v_biz is distinct from v_cur then
    perform set_config('pivo.change_source', 'portal', true);
    -- ‼ הסגירה רצה בסוף, אחרי שהתשובות החדשות נשמרו — לא על התשובות הקודמות (טריגר השם).
    perform set_config('pivo.defer_settle', 'on', true);
    update public.clients set business_name = v_biz, updated_at = now() where id = c.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'client',
      'הלקוח עדכן את שם העסק: ' || v_biz,
      jsonb_build_object('field', 'businessName', 'from', v_cur, 'to', v_biz));
  end if;

  perform public._home_office_insert_answers(c.id, c.user_id, s.id, 'client', p_data->'homeOffice', null);
  v_has := (p_data->'homeOffice'->>'hasDedicatedRoom')::boolean;
  v_state := public._settle_business_details_step(c.id, 'client',
    case when v_has then 'הלקוח מסר פרטי עסק ועבודה מהבית - לבדיקת המשרד'
         else 'הלקוח מסר פרטי עסק · אין חדר שמשמש רק לעסק' end);
  -- ‼ הדגלים מקומיים לטרנזקציה — מאפסים, כדי שכתיבה אחרת באותה טרנזקציה לא תירש אותם.
  perform set_config('pivo.defer_settle', '', true);
  perform set_config('pivo.change_source', '', true);

  v_client_name := trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''));
  perform public.queue_accountant_notification(
    s.user_id, 'client_request_completed', c.id, s.id, null, null,
    jsonb_build_object(
      'clientName', v_client_name,
      'requestTitle', coalesce(nullif(s.payload->>'clientTitle', ''), 'פרטי העסק'),
      'lastItem', case when v_state = 'completed' then 'הלקוח מסר את פרטי העסק'
                       else 'הלקוח מסר פרטי עבודה מהבית - האחוז ממתין לאישורך' end));
  return jsonb_build_object('ok', true, 'step', v_state);
end;
$$;

-- ── 6 · נפתחת עם קבוצת פייפרלס ─────────────────────────────────────────────
/**
 * «פרטי העסק» היא חלק מקבוצת פייפרלס: כשנוצרת «הרשמה לפייפרלס» (במחולל בקליטה או
 * ב«＋ בקשה ← פייפרלס») נוצרת לצידה, באותו מצב פרסום, אצל הלקוח, במקביל להרשמה.
 * ‼ רק ביצירה (INSERT) — אין פתיחה בדיעבד ללקוחות קיימים, ואין החייאה של שורה מבוטלת.
 * ‼ לא חוסמת סגירת קליטה (required_for_close=false): כללי הסגירה לא משתנים כאן.
 * ‼ אם כבר פתוחה אחת ללקוח — לא נוצרת שנייה.
 */
create or replace function public._open_business_details_with_paperless()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  -- ‼ רק הרשמה פתוחה: שורה שנכנסת כבר סגורה היא היסטוריה (או העתקה), לא פתיחת קבוצה.
  if new.step_type <> 'paperless_invite' or new.status in ('completed', 'verified', 'skipped', 'cancelled')
     or new.payload ? 'creationProblem' then
    return new;
  end if;
  if exists (select 1 from public.onboarding_steps b
              where b.client_id = new.client_id and b.step_type = 'business_details'
                and b.status <> 'cancelled'
                and (b.status not in ('completed', 'verified', 'skipped')
                     or b.engagement_id is not distinct from new.engagement_id)) then
    return new;
  end if;
  insert into public.onboarding_steps
    (user_id, engagement_id, client_id, step_type, track, scope, status, ball,
     sort_order, published_at, required_for_close, payload)
  values (new.user_id, new.engagement_id, new.client_id, 'business_details',
          public.onboarding_track_for('business_details'), 'person', 'pending', 'client',
          coalesce(new.sort_order, 0) + 1, new.published_at, false,
          jsonb_strip_nulls(jsonb_build_object(
            'clientTitle', 'פרטי העסק',
            'clientSub', 'שם העסק ושאלה קצרה על עבודה מהבית',
            'openedWith', 'paperless_invite',
            'delivery', new.payload->'delivery',
            'heldUntilApproval', new.payload->'heldUntilApproval')));
  return new;
end;
$$;
drop trigger if exists z_open_business_details_with_paperless on public.onboarding_steps;
create trigger z_open_business_details_with_paperless
  after insert on public.onboarding_steps
  for each row when (new.step_type = 'paperless_invite')
  execute function public._open_business_details_with_paperless();

-- ── 6א · שם העסק — היסטוריה, ובקשה שחיכתה רק לשם ─────────────────────────────
-- ‼ כל שינוי של clients.business_name — מהמשרד (update_client_fields, תיק המס), מהדף האישי
-- (פרטי העסק / ההרשמה לפייפרלס, 208) — נרשם כשורה מאושרת ב-tax_fact_changes, המנגנון הקיים
-- של היסטוריית עובדות (מוצג בלשונית «פעילות»). מקור: 'portal' כשאין משתמש מחובר (טוקן הדף)
-- או כשהפונקציה סימנה זאת; אחרת 'manual'.
alter table public.tax_fact_changes drop constraint if exists tax_fact_changes_source_check;
alter table public.tax_fact_changes add constraint tax_fact_changes_source_check
  check (source = any (array['questionnaire','manual','institution_alignment','import','automation','prerequisite','portal']));

create or replace function public._clients_business_name_changed()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_src text := coalesce(nullif(current_setting('pivo.change_source', true), ''),
                         case when auth.uid() is null then 'portal' else 'manual' end);
  v_old text := nullif(trim(coalesce(old.business_name, '')), '');
  v_new text := nullif(trim(coalesce(new.business_name, '')), '');
begin
  if v_old is not distinct from v_new then return new; end if;
  insert into public.tax_fact_changes
    (user_id, client_id, field_key, label, old_value, new_value, source, status, decided_by, decided_at, note)
  values (new.user_id, new.id, 'businessName', 'שם העסק',
          jsonb_build_object('display', coalesce(v_old, '—'), 'value', v_old),
          jsonb_build_object('display', coalesce(v_new, '—'), 'value', v_new),
          case when v_src in ('portal', 'manual') then v_src else 'manual' end,
          'accepted', auth.uid(), now(),
          case when v_src = 'portal' then 'הלקוח עדכן בדף האישי' else null end);
  -- ‼ בקשת «פרטי העסק» שיש לה כבר תשובות (ואישור, כשנדרש) וחיכתה רק לשם — נסגרת עכשיו,
  -- בלי תשובה נוספת ובלי אישור כפול. בלי תשובות — לא נוגעים (unanswered).
  if v_new is not null and coalesce(current_setting('pivo.defer_settle', true), '') <> 'on' then
    perform public._settle_business_details_step(new.id,
      case when v_src = 'portal' then 'client' else 'accountant' end,
      'שם העסק עודכן' || case when v_src = 'portal' then ' בדף האישי' else ' בתיק' end);
  end if;
  return new;
end;
$$;
drop trigger if exists z_clients_business_name_changed on public.clients;
create trigger z_clients_business_name_changed
  after update of business_name on public.clients
  for each row when (old.business_name is distinct from new.business_name)
  execute function public._clients_business_name_changed();

-- ── 6ב · «הקמת העסק בפייפרלס» לא «הושלמה» לפני פרטי העסק ───────────────────
/**
 * ‼ הכלל (מינימלי, בשרת, לכל נתיב): המעבר של paperless_connection ל«הושלם/אומת» נחסם כאשר
 *   (א) ללקוח יש בקשת «פרטי העסק» פתוחה (שם/תשובות/אישור עוד חסרים), או
 *   (ב) יש אחוז משרד ביתי מאושר לתשובות האחרונות שטרם סומן «הוזן בפייפרלס».
 * מה שלא נחסם: עבודה במקביל (סימון סעיפי ההקמה, הזנת הכרטיס), «אין צורך» (דילוג), לקוח
 * שאין לו בקשת «פרטי העסק» בכלל (קליטות מלפני 220), «אין חדר בלעדי» בלי אישור, ושלבים שכבר
 * הושלמו (הטריגר רק על מעבר — לא נפתח שום דבר בדיעבד).
 */
create or replace function public._paperless_setup_block_reason(p_client_id text)
returns text language sql stable security definer set search_path to 'public' as $$
  select case
    when exists (select 1 from public.onboarding_steps b
                  where b.client_id = p_client_id and b.step_type = 'business_details'
                    and b.status not in ('completed', 'verified', 'skipped', 'cancelled'))
      then 'business_details_open'
    when exists (select 1 from public.client_home_office_approvals x
                  where x.client_id = p_client_id and x.paperless_entered_at is null
                    and x.id = (select x2.id from public.client_home_office_approvals x2
                                 where x2.client_id = p_client_id order by x2.seq desc limit 1)
                    and x.answers_id = (select a.id from public.client_home_office_answers a
                                         where a.client_id = p_client_id order by a.seq desc limit 1))
      then 'home_office_not_entered'
  end;
$$;

create or replace function public._paperless_setup_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_reason text;
begin
  if new.step_type <> 'paperless_connection' or new.status not in ('completed', 'verified')
     or old.status in ('completed', 'verified') then
    return new;
  end if;
  v_reason := public._paperless_setup_block_reason(new.client_id);
  if v_reason = 'business_details_open' then
    raise exception using errcode = 'P0001', hint = 'paperless_setup_blocked:business_details_open',
      message = 'ההקמה בפייפרלס תסומן כהושלמה אחרי «פרטי העסק» — שם העסק ותשובה על עבודה מהבית (ואישור האחוז כשיש חדר). אפשר להמשיך בסעיפי ההקמה בינתיים.';
  elsif v_reason = 'home_office_not_entered' then
    raise exception using errcode = 'P0001', hint = 'paperless_setup_blocked:home_office_not_entered',
      message = 'אחוז המשרד הביתי שאושר עוד לא סומן כמוזן בפייפרלס. מסמנים «הוזן בפייפרלס» ואז מסיימים את ההקמה.';
  end if;
  return new;
end;
$$;
drop trigger if exists z_paperless_setup_guard on public.onboarding_steps;
create trigger z_paperless_setup_guard
  before update of status on public.onboarding_steps
  for each row when (new.step_type = 'paperless_connection' and new.status in ('completed', 'verified'))
  execute function public._paperless_setup_guard();

-- ── 7 · שם והמפתח בדף/במייל ────────────────────────────────────────────────
create or replace function public._client_step_title(p_step_type text, p_payload jsonb)
returns text language sql immutable set search_path to 'public' as $$
  select coalesce(nullif(p_payload->>'clientTitle', ''),
           case p_step_type
             when 'client_documents' then 'מסמכים שביקשנו'
             when 'custom_request' then coalesce(nullif(p_payload->>'title', ''), 'בקשה מהמשרד')
             when 'prev_accountant_details' then 'פרטי רואה החשבון הקודם שלך'
             when 'paperless_invite' then 'הרשמה לפייפרלס'
             when 'paperless_tax_authority' then 'חיבור פייפרלס לרשות המסים'
             when 'business_details' then 'פרטי העסק'
             -- כשע״ם דורשת את האישור, clientTitle הוא «אישור הייצוג באזור האישי» (201).
             when 'rep_client_approval' then 'זירוז אישור הייצוג באזור האישי'
             else coalesce(nullif(p_payload->>'title', ''), 'בקשה מהמשרד') end);
$$;

create or replace function public._client_step_portal_key(p_step_id text, p_step_type text)
returns text language sql immutable set search_path to 'public' as $$
  select case p_step_type
           when 'client_documents' then 'docs'
           when 'custom_request' then 'custom_' || p_step_id
           when 'prev_accountant_details' then 'prev_details'
           when 'paperless_invite' then 'paperless_signup'
           when 'paperless_tax_authority' then 'paperless_tax'
           when 'business_details' then 'business_details'
           when 'rep_client_approval' then 'rep_approval'
         end;
$$;

-- ── 9 · הדף האישי (גוף 216 + ענף «פרטי העסק») ───────────────────────────────
-- ‼ הגוף של 216 תו-בתו, ושני שינויים בלבד: המשתנה v_ho, והענף 'business_details'
--   לפני 'intake_questionnaire'. scripts/staging-test-single-source.mjs משווה את
--   PORTAL_STEP_TYPES לענפים כאן.
CREATE OR REPLACE FUNCTION public.build_client_portal(p_client_id text, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c        public.clients%rowtype;
  p        public.profiles%rowtype;
  req      public.representation_requests%rowtype;
  quo      public.quotations%rowtype;
  s        record;
  v_items  jsonb := '[]'::jsonb;
  v_done   int := 0;
  v_total  int := 0;
  v_sign_token text;
  v_spouse_pending boolean := false;
  v_invite_url text;
  v_res_key   text;
  -- ‼ 114: מה שהבקשה פותחת — קובץ מספריית המשרד, או קישור חיצוני שנשמר עליה.
  v_res_url   text;
  -- ‼ 144: כמה קבצים בבקשה אחת. ריק/חסר ⇒ הבקשה היא מהסוג הישן.
  v_res_list  jsonb;
  v_res_out   jsonb;
  v_prev_open boolean := false;
  v_prev_done boolean := false;
  v_first  text;
  v_has_eng boolean := false;
  v_stage  text;
  v_ck_done int;
  v_ck_total int;
  v_label  text;
  v_sub    text;
  v_published boolean := true;
  v_reqs   jsonb;
  v_rq_done int;
  v_rq_total int;
  v_rep_item jsonb := null;
  v_rep_seen boolean := false;
  v_before int := 0;
  v_lock   text;
  -- 217 · לקוח שחוזר
  v_cur    text;
  v_quote_open boolean := false;
  v_returning_intake boolean := false;
  -- 217 · אישור הייצוג באזור האישי — מי מאשר ואת מה
  v_rep_approvals jsonb;
  v_rep_req_sub text;
  -- 220 · פרטי העסק
  v_ho     jsonb;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  select * into p from public.profiles where id = c.user_id;
  v_first := split_part(trim(coalesce(c.first_name, '')), ' ', 1);
  v_invite_url := nullif(trim(coalesce(p.settings->'paperless'->>'inviteUrl', '')), '');
  -- ‼ נפתר מהגדרות המשרד בכל רינדור, כמו קישור הפייפרלס שמעליו: קובץ אחד
  -- משותף, והחלפתו משנה מיד את מה שכל בקשה תפתח.

  v_has_eng := exists (select 1 from public.engagements e where e.client_id = c.id);

  -- ‼ «התהליך נפתח ללקוח» — השער ברמת הלקוח (client_process_published, 217), רק בשביל
  -- «אנחנו מכינים את המשך התהליך». מה שמוצג בדף נבחר לכל בקשה בנפרד (client_step_gate_open,
  -- 214, בלולאה למטה): לקוח שחוזר רואה את מה שפורסם לפני הקליטה החדשה ועדיין פתוח, והקליטה
  -- החדשה מחכה לפרסום (הכרעה ב). אותו שער במייל, בתזכורות ובמשימה האוטומטית.
  v_published := public.client_process_published(c.id);

  select * into quo from public.quotations q
    where q.client_id = c.id and q.status <> 'draft'
    order by q.updated_at desc limit 1;

  -- ‼ 217: לקוח שחוזר — הצעה חדשה שמחכה לאישור (אין התקשרות נוכחית). ליד ראשון: אותו דבר כמו קודם.
  v_cur := public.current_engagement_id(c.id);
  v_quote_open := quo.id is not null and quo.status in ('sent', 'viewed') and v_cur is null;
  -- ‼ 217: קליטה חדשה של לקוח שחוזר — מה שהושלם בהתקשרות הקודמת אינו בדף (נשאר ב«הושלמו» במשרד).
  v_returning_intake := v_cur is not null
    and (select e.supersedes_engagement_id is null from public.engagements e where e.id = v_cur)
    and public.previous_engagement_end(c.id, v_cur) is not null;

  if v_quote_open then
    v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
      'bucket','action','key','quote_sign',
      'label','הצעת המחיר שלך מוכנה',
      'sub','לקריאה ולאישור - ואפשר להתחיל · כמה דקות',
      'actionKind','quote','actionValue', quo.public_token));
  elsif v_has_eng then
    v_items := v_items || jsonb_build_object('bucket','done','key','quotation','label','הצעת המחיר אושרה');
  elsif quo.id is not null and quo.status in ('sent','viewed') then
    v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
      'bucket','action','key','quote_sign',
      'label','הצעת המחיר שלך מוכנה',
      'sub','לקריאה ולאישור - ואפשר להתחיל · כמה דקות',
      'actionKind','quote','actionValue', quo.public_token));
  elsif quo.id is not null and quo.status = 'approved' then
    v_items := v_items || jsonb_build_object('bucket','done','key','quotation','label','הצעת המחיר אושרה');
    v_items := v_items || jsonb_build_object('bucket','office','key','quote_processing',
      'label','אנחנו מכינים את המשך התהליך','sub','נעדכן אותך כאן ברגע שיהיה מה לעשות');
  elsif quo.id is not null and quo.status in ('expired','cancelled') then
    v_items := v_items || jsonb_build_object('bucket','office','key','quote_expired',
      'label','הצעת המחיר כבר לא בתוקף','sub','נשמח לחדש אותה - דברו איתנו');
  end if;

  select * into req from public.representation_requests
    where linked_client_id = c.id order by created_at desc limit 1;

  if req.id is not null then
    if req.status = 'pending_fill' then
      v_rep_item := jsonb_strip_nulls(jsonb_build_object('bucket','action','key','rep_fill','label','מילוי פרטים וייפוי כוח','sub','הפרטים שנדרשים כדי לייצג אותך מול רשויות המס · כמה דקות','actionKind','onboard','actionValue', req.onboarding_token));
    elsif req.status = 'pending_signature' then
      select x->>'signToken' into v_sign_token
        from jsonb_array_elements(coalesce(req.signers, '[]'::jsonb)) x
        where x->>'role' = 'client' and x->>'signStatus' = 'pending' limit 1;
      select exists (
        select 1 from jsonb_array_elements(coalesce(req.signers, '[]'::jsonb)) x
        where x->>'role' = 'spouse' and x->>'signStatus' = 'pending')
        into v_spouse_pending;
      if v_sign_token is not null then
        v_rep_item := jsonb_strip_nulls(jsonb_build_object('bucket','action','key','rep_sign','label','חתימה על ייפוי הכוח','sub','הטופס מוכן - נשארה חתימה · כדקה','actionKind','sign','actionValue', v_sign_token));
      elsif v_spouse_pending then
        select jsonb_strip_nulls(jsonb_build_object('bucket','action','key','rep_sign_spouse','label','חתימת בן/בת הזוג על ייפוי הכוח','sub','אפשר לחתום יחד עכשיו, או לשלוח לבן/בת הזוג קישור אישי','actionKind','sign','actionValue', x->>'signToken')) into v_rep_item
        from jsonb_array_elements(coalesce(req.signers, '[]'::jsonb)) x
        where x->>'role' = 'client' and coalesce(x->>'signToken', '') <> '' limit 1;
      end if;
    elsif req.status in ('awaiting_accountant', 'awaiting_stamp') then
      -- ‼ 208 · «ממתין לרו"ח» לפני כל חתימה = אנחנו מכינים את הטופס. «נחתם על ידך»
      -- נאמר רק כשמישהו באמת חתם.
      v_rep_item := jsonb_build_object('bucket','office','key','rep_office','label','ייפוי הכוח','sub',
        case when exists (select 1 from jsonb_array_elements(coalesce(req.signers, '[]'::jsonb)) x
                           where x->>'signStatus' = 'signed')
             then 'נחתם על ידך - עכשיו בבדיקה ובחתימה אצלנו'
             else 'הפרטים התקבלו - אנחנו מכינים את ייפוי הכוח לחתימה' end);
    elsif req.status = 'awaiting_authorities' then
      v_rep_item := jsonb_build_object('bucket','office','key','rep_authorities','label','ייפוי הכוח','sub','נחתם והוגש לרשויות המס - ממתינים לאישור');
    elsif req.status = 'active' then
      v_rep_item := jsonb_build_object('bucket','done','key','rep_done','label','הייצוג מול רשויות המס אושר');
    end if;
  end if;

  for s in
    select * from public.onboarding_steps st
    where st.client_id = c.id and st.status <> 'cancelled'
      and (p_mode = 'preview'
           or (st.published_at is not null
               and (st.step_type = 'representation' or public.client_step_gate_open(c.id, st.published_at))))
    order by (case when p_mode = 'preview' then coalesce(st.pending_sort_order, st.sort_order, 0)
                   else coalesce(st.sort_order, 0) end),
             st.created_at
  loop
    -- 172: תצוגה מקדימה = הטיוטה מעל הפרסום; live נשאר כפי שהוא.
    if p_mode = 'preview' and s.draft_payload is not null then
      s.payload := public.merge_step_draft(s.payload, s.draft_payload);
    end if;
    -- ‼ 217: קליטה חדשה של לקוח שחוזר — מה שנסגר בהתקשרות קודמת לא חוזר לדף (וגם לא שני
    -- «מסמכים»). מסמכים שהמשרד שלח (קבצים/קישור) נשארים זמינים, כמו בכל בקשה שנסגרה.
    if v_returning_intake and s.engagement_id is not null and s.engagement_id <> v_cur
       and s.status in ('completed', 'verified', 'skipped')
       and not (s.step_type = 'custom_request'
                and (nullif(s.payload->>'clientResource', '') is not null
                     or coalesce(jsonb_array_length(case when jsonb_typeof(s.payload->'clientResources') = 'array'
                                                         then s.payload->'clientResources' end), 0) > 0
                     or nullif(trim(coalesce(s.payload->>'clientLinkUrl', '')), '') is not null)) then
      continue;
    end if;
    v_before := jsonb_array_length(v_items);
    case s.step_type

    when 'representation' then
      v_rep_seen := true;
      if v_rep_item is not null then
        v_items := v_items || v_rep_item;
      end if;

    when 'client_documents' then
      select count(*) filter (where (x->>'done')::boolean), count(*)
        into v_ck_done, v_ck_total
        from jsonb_array_elements(coalesce(s.payload->'checklist','[]'::jsonb)) x;
      v_label := coalesce(nullif(s.payload->>'clientTitle',''), 'מסמכים שביקשנו');
      v_sub   := nullif(s.payload->>'clientSub','');

      if s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_build_object('bucket','done','key','docs','label', v_label);
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','docs','label', v_label,
          'sub', coalesce(public.portal_lock_reason(s.id), v_sub)));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','docs','label', v_label,
          'sub', case when coalesce(v_ck_total,0) > 0
                      then v_ck_done || ' מתוך ' || v_ck_total || ' התקבלו'
                      else v_sub end,
          'actionKind','portal','actionValue', s.id,
          'kind','documents',
          'canUpload', true,
          'checklist', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                            'key', x->>'key', 'label', x->>'label', 'done', (x->>'done')::boolean,
                            -- 204 · שע״ם דרשה את המסמך: הלקוח רואה למה, ובלי לרמוז שהחתימה תלויה בו.
                            'note', case when x->>'requiredBy' = 'shaam'
                                         then 'נדרש על ידי רשות המסים להשלמת הייצוג' end))
                          order by ord)
                          from jsonb_array_elements(coalesce(s.payload->'checklist','[]'::jsonb))
                               with ordinality t(x, ord))));
      end if;

    when 'custom_request' then
      -- ‼ 216: משימה של המשרד אינה בדף של הלקוח — לא כפעולה, לא «בהמשך» ולא «הושלם»:
      -- אישור אישי של בן/בת הזוג (personalConfirmFor) ומשימה פנימית (internalTask).
      -- ‼ לא לפי ball: בקשה שהלקוח השלים עוברת ל-'me' ועדיין שלו. והודעת מלל — כן בדף.
      -- ‼ 217: השוואת טקסט — ערך שאינו בוליאני לא מפיל את הדף של הלקוח.
      -- ‼ 217 §ז: הצילום של בן/בת הזוג לשע״ם — המשרד בודק; בעל הכרטיס לא מאשר במקומו/ה (§9).
      if s.payload ? 'personalConfirmFor'
         or s.payload #>> '{shaamIdentity,person}' = 'spouse'
         or (coalesce(s.payload->>'internalTask', '') = 'true'
             and coalesce(s.payload->>'messageOnly', '') <> 'true') then
        continue;
      end if;
      -- ‼ 208 · שע״ם דורשת צילום תעודה, ובתיק כבר יש אחד ⇒ הלקוח רואה אותו
      -- ומאשר שהוא שלו, או מעלה אחר. קיום הקובץ אינו אישור.
      if s.payload ? 'shaamIdentity' then
        if s.status in ('completed','verified','skipped') then
          v_items := v_items || jsonb_build_object('bucket','done','key','custom_'||s.id,
            'label', coalesce(nullif(s.payload->>'clientTitle',''), 'צילום תעודה לרשות המסים'));
        elsif s.status <> 'locked' then
          v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
            'bucket','action','key','custom_'||s.id,
            'label', coalesce(nullif(s.payload->>'clientTitle',''), 'צילום תעודה לרשות המסים'),
            'sub', nullif(s.payload->>'clientSub',''),
            'note', nullif(s.payload->>'clientNote',''),
            'actionKind','portal','actionValue', s.id, 'stepId', s.id,
            'kind','identity_confirm',
            'resources', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                             'key', x->>'key', 'label', x->>'label', 'fileName', nullif(x->>'fileName',''),
                             'documentId', nullif(x->>'documentId',''))) order by ord)
                            from jsonb_array_elements(coalesce(s.payload->'clientResources','[]'::jsonb)) with ordinality t(x, ord)
                           where x->>'source' = 'client')));
        end if;
        continue;
      end if;
      v_reqs := coalesce(s.payload->'requirements', '[]'::jsonb);
      select count(*) filter (where coalesce((x->>'done')::boolean, false)
                               and coalesce((x->>'required')::boolean, true)),
             count(*) filter (where coalesce((x->>'required')::boolean, true))
        into v_rq_done, v_rq_total
        from jsonb_array_elements(v_reqs) x;
      v_label := coalesce(nullif(s.payload->>'clientTitle',''), 'בקשה מהמשרד');
      v_res_key := nullif(s.payload->>'clientResource', '');
      -- ‼ 114: קישור חיצוני כחומר עזר לכל דבר. בקשה שנושאת clientLinkUrl
      -- מתנהגת בדיוק כמו בקשת מסמך — כפתור פתיחה אחד — גם בלי קובץ בספרייה.
      -- כך המדריך של פייפרלס אינו דורש סוג שלב חדש ולא ספרייה שנייה.
      v_res_url := coalesce(public.office_document_url(p.id, v_res_key),
                            nullif(trim(coalesce(s.payload->>'clientLinkUrl','')), ''));

      -- ‼ 144: הרשימה החדשה. `url` נפתר כאן רק לקבצי ספריית המשרד — קובץ
      -- מהתיק של הלקוח הוא פרטי, ונמסר כמזהה בלבד שהדף פודה מול
      -- portal-open-document. `done` נקרא מהדרישה בעלת אותו מפתח, ולכן
      -- הסימון שנרשם בפתיחה הוא אותו סימון שסוגר את הבקשה.
      v_res_list := case when jsonb_typeof(s.payload->'clientResources') = 'array'
                         then s.payload->'clientResources' end;
      if coalesce(jsonb_array_length(v_res_list), 0) > 0 then
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                 'key',   x->>'key',
                 'label', x->>'label',
                 'fileName', nullif(x->>'fileName',''),
                 'url', case when x->>'source' = 'office'
                             then public.office_document_url(p.id, nullif(x->>'officeId','')) end,
                 'documentId', case when x->>'source' = 'client'
                             then nullif(x->>'documentId','') end,
                 'done', coalesce((select (r->>'done')::boolean
                                     from jsonb_array_elements(v_reqs) r
                                    where r->>'key' = x->>'key' limit 1), false)))
               order by ord)
          into v_res_out
          from jsonb_array_elements(v_res_list) with ordinality t(x, ord);
      else
        v_res_out := null;
      end if;

      -- ── הודעת מלל: כרטיס שקט, בלי פקד, ובלי מונה ────────────────────────
      -- ‼ נעולה או סגורה ⇒ פשוט אינה מופיעה. אין "הודעה שהושלמה": ברגע
      -- שהמשרד סוגר אותה היא יורדת מהדף, וזו כל מחזור החיים שלה.
      if coalesce((s.payload->>'messageOnly')::boolean, false) then
        if s.status in ('completed','verified','skipped','locked') then
          null;
        else
          v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
            'bucket','office','key','custom_'||s.id,
            'kind','message',
            'label', v_label,
            'note', nullif(s.payload->>'message','')));
        end if;

      -- ── שליחת מסמכים: שורה לכל קובץ, והפתיחה היא מה שסוגר ───────────────
      elsif v_res_out is not null then
        if s.status in ('completed','verified','skipped') then
          -- ‼ ממשיכה לשאת את הקבצים: הבקשה נסגרה, אבל המסמכים עצמם נשארים
          -- זמינים תחת «מסמכים שימושיים». לקוח שפתח פעם אחת לא מאבד אותם.
          -- ‼ stepId נמסר גם כאן, ובלעדיו קובץ פרטי היה הופך לבלתי-נגיש ברגע
          -- שהבקשה נסגרת: portal-open-document מזהה את הקובץ דרך הבקשה שלו.
          -- ‼ 147: גם המלל שצורף לקבצים נשאר. הקבצים והמלל חיים באותו מקום
          -- בדף («מסמכים מהמשרד»), ובלי זה ההסבר שהמשרד כתב היה נעלם בדיוק
          -- ברגע שהלקוח פותח את הקובץ האחרון — תוכן שנמחק מול העיניים.
          v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
            'bucket','done','key','custom_'||s.id,'label', v_label,
            'stepId', s.id,
            'note', nullif(s.payload->>'message',''),
            'resources', v_res_out));
        elsif s.status = 'locked' then
          v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
            'bucket','future','key','custom_'||s.id,'label', v_label,
            'sub', coalesce(public.portal_lock_reason(s.id), nullif(s.payload->>'clientSub',''))));
        else
          v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
            'bucket','action','key','custom_'||s.id,'label', v_label,
            'sub', nullif(s.payload->>'clientSub',''),
            'actionKind','portal','actionValue', s.id,
            'stepId', s.id,
            'kind','guide',
            'resources', v_res_out,
            'note', nullif(s.payload->>'message','')));
        end if;

      elsif s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','done','key','custom_'||s.id,'label', v_label,
          -- ‼ בקשת חומר עזר שהושלמה ממשיכה לשאת את הקישור. הדף מציג אותה
          -- תחת «מסמכים שימושיים» — אחרת הלקוח שפתח את המדריך פעם אחת
          -- מאבד אליו גישה לתמיד.
          'resourceKey', case when public.office_document_url(p.id, v_res_key) is not null then v_res_key else null end,
          'resourceUrl', v_res_url));
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','custom_'||s.id,'label', v_label,
          'sub', coalesce(public.portal_lock_reason(s.id), nullif(s.payload->>'clientSub',''))));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','custom_'||s.id,'label', v_label,
          'sub', case when v_res_url is not null then nullif(s.payload->>'clientSub','')
                      when coalesce(v_rq_total,0) > 1
                      then v_rq_done || ' מתוך ' || v_rq_total || ' הושלמו'
                      else nullif(s.payload->>'clientSub','') end,
          'actionKind','portal','actionValue', s.id,
          -- ‼ בקשת חומר עזר אינה טופס: הפעולה היחידה היא פתיחת הקובץ, והיא
          -- עצמה מה שסוגר אותה. kind נפרד כדי שהדף לא יצייר שורות דרישות.
          'kind', case when v_res_url is not null then 'guide' else 'custom' end,
          'resourceKey', case when public.office_document_url(p.id, v_res_key) is not null then v_res_key else null end,
          'resourceUrl', v_res_url,
          'cta', nullif(s.payload->>'clientCta',''),
          -- ‼ מיגרציה 107: ההסבר, המספרים להעתקה ומשפט הסגירה עוברים כמו שהם
          -- אל הדף האישי. clientSub לבדו לא הספיק — הוא מוחלף בשורת ההתקדמות
          -- ("1 מתוך 2 הושלמו") ברגע שיש יותר מדרישה אחת, וכל הסבר שנשען עליו
          -- נעלם בדיוק בבקשות שהכי זקוקות לו.
          'note', nullif(s.payload->>'clientNote',''),
          'refs', s.payload->'clientRefs',
          'noteAfter', nullif(s.payload->>'clientNoteAfter',''),
          'canUpload', exists (select 1 from jsonb_array_elements(v_reqs) x where x->>'kind' in ('file','files')),
          'requirements', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                              'key', x->>'key', 'kind', x->>'kind', 'label', x->>'label',
                              'done', coalesce((x->>'done')::boolean, false),
                              'required', coalesce((x->>'required')::boolean, true),
                              'options', x->'options',
                              'maxFiles', x->'maxFiles',
                              'fileCount', coalesce(jsonb_array_length(x->'documentIds'),
                                             case when nullif(x->>'documentId','') is not null then 1 else 0 end),
                              'value', x->>'value')) order by ord)
                            from jsonb_array_elements(v_reqs) with ordinality t(x, ord))));
      end if;

    when 'prev_accountant_details' then
      if s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_build_object('bucket','done','key','prev_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי רואה החשבון הקודם'));
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','prev_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי רואה החשבון הקודם'),
          'sub', coalesce(public.portal_lock_reason(s.id), nullif(s.payload->>'clientSub',''))));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','prev_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי רואה החשבון הקודם שלך'),
          'sub', coalesce(nullif(s.payload->>'clientSub',''), 'שם, אימייל וטלפון - כדי שנפנה אליו בשמך'),
          'actionKind','portal','actionValue', s.id, 'kind','prev_accountant',
          -- ‼ 217 (D3): לקוח שחוזר — שואלים מחדש; הפרטים שעל הכרטיס הם של מי שהיה לפנינו.
          'prefill', case when coalesce(s.payload->>'askAgain', '') = 'true' then null else nullif(jsonb_strip_nulls(jsonb_build_object(
            'name',  nullif(trim(coalesce(c.prev_accountant_name ,'')), ''),
            'email', nullif(trim(coalesce(c.prev_accountant_email,'')), ''),
            'phone', nullif(trim(coalesce(c.prev_accountant_phone,'')), ''))), '{}'::jsonb) end));
      end if;

    -- ── שלב 1: ההרשמה — של הלקוח ──────────────────────────────────────────
    -- ‼ עד מיגרציה 106 היה כאן `continue`, כלומר השלב לא הגיע ללקוח כלל.
    -- עכשיו זו הפעולה שלו: קישור ההרשמה של המשרד (אם הוגדר) וכפתור אישור
    -- אחד. linkUrl נפרד מ-actionKind במכוון — הכרטיס נושא גם קישור יוצא
    -- וגם השלמה בתוך הדף, ו-actionKind='portal' הוא זה שמפעיל את ההשלמה.
    when 'paperless_invite' then
      if coalesce(s.payload->>'paperlessStatus', '') in ('not_applicable', 'other_rep') then
        -- לא רלוונטי ללקוח: או שאין פייפרלס, או שהחשבון מועבר אלינו מהמייצג
        -- הקודם — ובשני המקרים אין לו מה להירשם.
        continue;
      elsif s.status in ('completed', 'verified') or
            (s.status = 'skipped' and coalesce(s.payload->>'skipReason','') in ('already_connected','transferred_rep')) then
        v_items := v_items || jsonb_build_object('bucket','done','key','paperless_signup','label','הרשמה לפייפרלס');
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','paperless_signup','label','הרשמה לפייפרלס',
          'sub', public.portal_lock_reason(s.id)));
      elsif coalesce(s.payload->>'paperlessStatus', '') = 'self' then
        -- ללקוח כבר יש חשבון: מה שנדרש ממנו הוא לצרף אותנו כמייצג, לא להירשם.
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','paperless_signup',
          'label','קישור חשבון הפייפרלס למשרד',
          'sub','בחשבון הפייפרלס שלך: הוסיפו את המשרד כמייצג',
          'actionKind','portal','actionValue', s.id, 'kind','paperless_signup',
          -- ‼ 114: שם העסק נשאל כאן, כי זה מה שאנחנו צריכים להזין בפייפרלס.
          -- הערך מגיע מ-clients.business_name ונשמר בחזרה לשם בלבד.
          'needsBusinessName', true,
          'businessName', nullif(trim(coalesce(c.business_name,'')), ''),
          'cta','קישרתי את המשרד'));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','paperless_signup',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'הרשמה לפייפרלס'),
          'sub', coalesce(nullif(s.payload->>'clientSub',''),
                          'שתי דקות, ומשם רק מצלמים קבלות מהטלפון'),
          'actionKind','portal','actionValue', s.id, 'kind','paperless_signup',
          'needsBusinessName', true,
          'businessName', nullif(trim(coalesce(c.business_name,'')), ''),
          'linkUrl', v_invite_url,
          'cta', coalesce(nullif(s.payload->>'clientCta',''), 'נרשמתי לפייפרלס')));
      end if;

    -- ── שלב 2: החיבור — של המשרד ──────────────────────────────────────────
    -- ‼ אין כאן פעולה ללקוח, וזו לא השמטה: ברגע שאנחנו נכנסים לחשבון שלו
    -- פייפרלס מבקשת מאיתנו את פרטי האשראי, ולכן ההשלמה היא של המשרד. מה
    -- שהלקוח צריך לדעת הוא רק שזה בטיפול ושאין לו מה לעשות.
    when 'paperless_connection' then
      if coalesce(s.payload->>'paperlessStatus', '') = 'not_applicable' then
        continue;
      elsif s.status in ('completed', 'verified') or
            (s.status = 'skipped' and coalesce(s.payload->>'skipReason','') in ('already_connected','transferred_rep')) then
        v_items := v_items || jsonb_build_object('bucket','done','key','paperless','label','חיבור לפייפרלס');
      elsif coalesce(s.payload->>'paperlessStatus', '') = 'other_rep' then
        v_items := v_items || jsonb_build_object('bucket','office','key','paperless_transfer',
          'label','העברת חשבון הפייפרלס אלינו',
          'sub','אנחנו מושכים את החשבון מהמייצג הקודם. אין צורך לעשות דבר.');
      -- ‼ נעול ⇒ "בהמשך" ולא "בטיפול המשרד". כל עוד הלקוח לא נרשם אנחנו לא
      -- באמת מטפלים בכלום, ו"בימים הקרובים ניכנס" היה הבטחה לא נכונה שגם
      -- מסתירה ממנו שהכדור עדיין אצלו.
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','paperless_connect',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'חיבור לפייפרלס'),
          'sub', public.portal_lock_reason(s.id)));
      else
        v_items := v_items || jsonb_build_object('bucket','office','key','paperless_connect',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'חיבור לפייפרלס'),
          'sub', coalesce(nullif(s.payload->>'clientSub',''),
                          'בימים הקרובים ניכנס לחשבון הפייפרלס ונשלים את החיבור. אין צורך לעשות דבר כרגע.'));
      end if;

    -- ‼ מיגרציה 103: אין יותר כפתור-קישור חיצוני. ההרשאה נוצרת בתוך פייפרלס,
    -- לא דרך קישור ששולחים ללקוח. כשהיא לא נעולה ולא הושלמה — הודעת מידע
    -- רגועה בלבד, ללא פעולה. אותה הודעה בדיוק לפני ואחרי שגיא יוצר את
    -- ההרשאה בפועל בצד שלו — אין ל-UI דרך לדעת מתי בדיוק הכרטיס הוזן.
    -- ── חיבור פייפרלס לרשות המסים ────────────────────────────────────────
    -- ‼ הפעולה קורית מחוץ לדף, אבל בניגוד להזנת הכרטיס יש כאן מה לאשר:
    -- הלקוח הוא היחיד שיודע שהחיבור בוצע, וההצהרה שלו היא שסוגרת. אין
    -- לנו גישה לחשבון שלו ברשות המסים ולכן אין מה לאמת.
    when 'rep_client_approval' then
      if s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_build_object('bucket','done','key','rep_approval',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'זירוז אישור הייצוג באזור האישי'));
      elsif nullif(s.payload->>'clientDeclaredAt','') is not null then
        v_items := v_items || jsonb_build_object('bucket','office','key','rep_approval',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'זירוז אישור הייצוג באזור האישי'),
          'sub', 'תודה. אנחנו בודקים שהאישור נקלט אצל רשות המסים.');
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','rep_approval',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'זירוז אישור הייצוג באזור האישי'),
          'sub', public.portal_lock_reason(s.id)));
      else
        -- ‼ 217 · «מה מסמנים באזור האישי»: מי מבני הזוג מאשר ואילו רשויות (_rep_approval_people).
        -- לא ידוע ⇒ אין approvals, והכרטיס בנוסח הכללי. ‼ הקריאה עטופה: נתון פגום (או עזר
        -- שעוד לא הוחל) לעולם לא שובר את הדף — זו הפונקציה של כל דף של לקוח.
        -- ‼ 217 (H2.5b) · כשהאישור נדרש: שורת המשנה לפי מי ששע״ם ממתינה לאישור שלו («…לאישור
        -- של רחל»), לא «שלך» קבוע. בלי נתון — הנוסח השמור.
        v_rep_req_sub := null;
        begin
          v_rep_approvals := nullif(public._rep_approval_people(c.id), '[]'::jsonb);
          if coalesce(s.payload->>'requiredBy', '') = 'shaam' then
            v_rep_req_sub := public._rep_approval_required_sub(v_rep_approvals);
          end if;
        exception when others then
          v_rep_approvals := null;
          v_rep_req_sub := null;
        end;
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','rep_approval',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'זירוז אישור הייצוג באזור האישי'),
          -- ‼ ברירת המחדל הישנה («שלוש דקות») מוצגת בנוסח של היום («שתי דקות» — כמו ההסבר),
          -- בלי לכתוב לשורה. נוסח שהמשרד כתב — כמו שהוא.
          'sub', coalesce(v_rep_req_sub,
                          case when s.payload->>'clientSub' = 'אופציונלי - שלוש דקות שמקצרות את ההמתנה לאישור הרשויות'
                               then 'אופציונלי - שתי דקות שמקצרות את ההמתנה לאישור הרשויות'
                               else nullif(s.payload->>'clientSub','') end),
          -- ‼ 217 · כרטיסים שנוצרו מאז 186 שמרו «\n» (לוכסן ו-n) במקום ירידת שורה. מוצג כירידת
          -- שורה, בלי לכתוב לשורה השמורה.
          'note', nullif(replace(s.payload->>'clientNote', E'\\n', E'\n'),''),
          'noteAfter', nullif(s.payload->>'clientNoteAfter',''),
          'cta', coalesce(nullif(s.payload->>'clientCta',''), 'אישרתי באזור האישי'),
          'linkUrl', nullif(s.payload->>'clientLinkUrl',''),
          'linkLabel', nullif(s.payload->>'clientLinkLabel',''),
          'approvals', v_rep_approvals,
          'actionKind','portal','actionValue', s.id, 'kind','declare'));
      end if;

    when 'paperless_tax_authority' then
      if s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_build_object('bucket','done','key','paperless_tax',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'חיבור פייפרלס לרשות המסים'));
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','paperless_tax',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'חיבור פייפרלס לרשות המסים'),
          'sub', public.portal_lock_reason(s.id)));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','paperless_tax',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'חיבור פייפרלס לרשות המסים'),
          'sub', nullif(s.payload->>'clientSub',''),
          'note', nullif(s.payload->>'clientNote',''),
          'noteAfter', nullif(s.payload->>'clientNoteAfter',''),
          'cta', coalesce(nullif(s.payload->>'clientCta',''), 'ביצעתי את החיבור'),
          'linkUrl', nullif(s.payload->>'clientLinkUrl',''),
          'actionKind','portal','actionValue', s.id, 'kind','declare'));
      end if;

    when 'retainer_authorization' then
      if coalesce(s.payload->>'method', '') = 'manual_arrangement' then
        continue;
      elsif s.status in ('completed', 'verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','retainer','label','החיוב החודשי הוסדר');
      -- ‼ סדר הבדיקות: החותמות **קודמות** למנעול, ולא להפך. הריטיינר מתעדכן
      -- לכרטיס אשראי כסעיף האחרון ברשימת החיבור — כלומר לפני שגיא לוחץ
      -- «סיימתי», וכשהשלב הזה עוד נעול. פייפרלס כבר מבקשת מהלקוח כרטיס באותו
      -- רגע, ולכן "בהמשך — ייפתח אוטומטית" היה מסתיר ממנו בדיוק את מה שממתין
      -- לו. נמצא בבדיקה בדפדפן (2026-08-17) — לא בקריאת קוד.
      -- ‼ החותמת קיימת רק אם גיא הצהיר שעשה את זה, ולכן היא ראיה טובה מהמנעול.
      elsif nullif(s.payload->>'cardEnteredAt','') is not null then
        v_items := v_items || jsonb_build_object('bucket','office','key','retainer_charge',
          'label','החיוב החודשי',
          'sub','פרטי הכרטיס התקבלו. נשלים את החיוב החודשי ונעדכן כאן.');
      -- ‼ הכדור אצל הלקוח — אבל הפעולה עצמה קורית בתוך פייפרלס, ולכן כרטיס
      -- מידע בלי פקד: הלקוח לא מאשר לנו כאן שהזין כרטיס. אין לנו דרך לדעת,
      -- ואישור שאין מאחוריו אימות הוא בדיוק מה שלא רצינו.
      elsif nullif(s.payload->>'authorizationCreatedAt','') is not null then
        v_items := v_items || jsonb_build_object('bucket','action','key','retainer_card',
          'kind','info',
          'label','הזנת כרטיס אשראי בפייפרלס',
          -- ‼ שני הערוצים שבהם זה קורה בפועל, בדיוק כפי שגיא תיאר: הודעה
          -- שנשלחת מפייפרלס, או חלון שנפתח בכניסה לאפליקציה.
          -- ‼ גוף שני רבים, כמו בכל הדף ("שאלות? פשוט השיבו למייל"). ערבוב
          -- יחיד ורבים בתוך אותו כרטיס נקרא כמו שתי הודעות שהודבקו יחד.
          'sub','פייפרלס תשלח לכם הודעה להזנת כרטיס אשראי לחיוב החודשי שסיכמנו - או שייפתח לכם חלון להזנת הכרטיס בכניסה הבאה לאפליקציה.',
          -- ‼ "1 ₪" ולא "₪1": בעברית סימן המטבע נדחף אחרי הספרה בכל מקרה, ובלי
          -- הרווח זה נקרא "1₪" ונראה כמו תקלה. נבדק בדפדפן.
          'note','ייתכן שתראו חיוב אימות בסך 1 ₪ - הוא נועד לוודא שהכרטיס תקין, ואינו החיוב החודשי.' || chr(10) ||
                 'אין מה לאשר כאן: ברגע שהכרטיס יוזן, נראה את זה מצידנו ונעדכן.');
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_build_object('bucket','future','key','retainer_future',
          'label','הרשאת התשלום החודשי',
          'sub', coalesce(public.portal_lock_reason(s.id), 'תופיע כאן אחרי חיבור הפייפרלס'));
      -- ‼ 114: עד כאן ההודעה "תתבקש להזין כרטיס" הופיעה ברגע שהשלב נפתח —
      -- כלומר לפני שגיא בכלל עדכן את הריטיינר בפייפרלס. הבטחה שאין מאחוריה
      -- כלום היא בדיוק הפנייה שהיא באה למנוע.
      -- ‼ כן מקדימים ואומרים מה עוד יגיע (הכרעת גיא, אותו יום): הלקוח שסיים
      -- להירשם ולהתקין צריך לדעת שתגיע אליו בקשה להזנת כרטיס — אחרת ההודעה
      -- מפייפרלס נראית לו כמו פנייה מגורם זר. מה שלא נאמר כאן הוא ההנחיה
      -- עצמה ולא חיוב האימות: אלה מופיעים רק כשזה באמת ממתין לו.
      else
        v_items := v_items || jsonb_build_object('bucket','office','key','retainer_info',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'החיוב החודשי'),
          'sub', 'אנחנו מסדירים מול פייפרלס את החיוב החודשי שסיכמנו. בהמשך תגיע אליכם מפייפרלס בקשה להזנת כרטיס אשראי - נעדכן אותכם כאן. אין צורך לעשות דבר כרגע.');
      end if;

    -- ── 220 · פרטי העסק (קבוצת פייפרלס) ───────────────────────────────────
    -- ‼ שם העסק מ-clients.business_name (מקור אחד) והתשובות האחרונות על עבודה מהבית —
    -- למילוי ולתיקון. כשהבקשה אצל המשרד (בדיקת האחוז) — «בטיפול המשרד», בלי פקד.
    -- ‼ האחוז שהמשרד אישר אינו מוצג כאן: זו החלטה מקצועית שנמסרת בשיחה, לא שדה בדף.
    when 'business_details' then
      select jsonb_build_object('hasDedicatedRoom', a.has_dedicated_room,
               'totalRooms', a.total_rooms, 'businessRooms', a.business_rooms, 'note', a.note)
        into v_ho
        from public.client_home_office_answers a where a.client_id = c.id
       order by a.seq desc limit 1;
      if s.status in ('completed', 'verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','business_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי העסק'));
      elsif s.status = 'skipped' then
        continue;
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','business_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי העסק'),
          'sub', public.portal_lock_reason(s.id)));
      elsif coalesce(s.ball, 'client') <> 'client' then
        v_items := v_items || jsonb_build_object('bucket','office','key','business_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי העסק'),
          'sub', 'קיבלנו את הפרטים ואנחנו בודקים אותם. אין צורך לעשות דבר כרגע.');
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','business_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי העסק'),
          'sub', case when nullif(trim(coalesce(c.business_name,'')), '') is not null and v_ho is null
                      then 'נשאר להשלים מידע על עבודה מהבית'
                      else coalesce(nullif(s.payload->>'clientSub',''), 'שם העסק ושאלה קצרה על עבודה מהבית') end,
          'actionKind','portal','actionValue', s.id, 'kind','business_details',
          'businessName', nullif(trim(coalesce(c.business_name,'')), ''),
          'homeOffice', v_ho,
          'cta', 'העברה למשרד'));
      end if;

    when 'intake_questionnaire' then
      if s.status in ('completed', 'verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','intake','label','עדכון סטטוס מיסויי');
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','intake_future','label','עדכון סטטוס מיסויי',
          'sub', public.portal_lock_reason(s.id)));
      elsif s.status = 'waiting_client' and c.intake_token is not null then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object('bucket','action','key','intake_fill','label','עדכון סטטוס מיסויי','sub','עונים רק על מה שרלוונטי · אפשר לעצור ולהמשיך','actionKind','intake','actionValue', c.intake_token));
      end if;

    when 'release_letter' then
      if s.status not in ('completed', 'verified', 'skipped') then v_prev_open := true;
      else v_prev_done := true; end if;

    when 'materials_received' then
      if s.status not in ('completed', 'verified', 'skipped') then v_prev_open := true;
      else v_prev_done := true; end if;

    when 'file_opening' then
      if s.status in ('completed', 'verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','files','label','פתיחת התיקים ברשויות');
      elsif s.status not in ('skipped') then
        v_items := v_items || jsonb_build_object('bucket','office','key','files_office','label','פתיחת התיקים ברשויות','sub','מע"מ, מס הכנסה וביטוח לאומי - בטיפולנו');
      end if;

    when 'authority_representation' then
      v_label := coalesce(nullif(s.payload->>'title',''), 'ייצוג ברשות');
      if s.status in ('pending','in_progress') then
        v_items := v_items || jsonb_build_object('bucket','office','key','authrep_'||s.id,
          'label', v_label,
          'sub', case when nullif(req.execution -> (case when s.payload->>'subjectRole' = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end) ->> 'referenceNumber', '') is not null
                      then 'האסמכתא התקבלה — נשלח הוראות אישור בקרוב'
                      else 'בטיפול המשרד — הזנת הייצוג בביטוח לאומי' end);
      elsif s.status = 'waiting_client' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','office','key','authrep_'||s.id, 'kind','message',
          'label', v_label,
          'note', 'האסמכתא: ' || coalesce(nullif(req.execution -> (case when s.payload->>'subjectRole' = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end) ->> 'referenceNumber', ''), '') ||
            case when nullif(req.execution -> (case when s.payload->>'subjectRole' = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end) ->> 'deadline', '') is not null
                 then chr(10) || 'יש לאשר עד ' || to_char((req.execution -> (case when s.payload->>'subjectRole' = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end) ->> 'deadline')::date, 'DD.MM.YYYY')
                 else '' end ||
            chr(10) || 'ניתן לאשר באתר הביטוח הלאומי או בטלפון 02-5393740. אם ההודעה לא הגיעה - אפשר להעביר את ההוראות.',
          'linkUrl', 'https://b2b.btl.gov.il/BTL.ILG.PAYMENTS/IshurIpuyKoachInfo.aspx',
          'linkLabel', 'לאתר הביטוח הלאומי'));
      elsif s.status = 'blocked' then
        v_items := v_items || jsonb_build_object('bucket','office','key','authrep_'||s.id,
          'label', v_label, 'sub', 'האסמכתא פגה - נזין מחדש');
      elsif s.status in ('completed','verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','authrep_'||s.id,
          'label', v_label || ' · אושר');
      end if;

    else
      continue;
    end case;

    if p_mode = 'preview' and s.published_at is null
       and jsonb_array_length(v_items) > v_before then
      select coalesce(jsonb_agg(
               case when ord > v_before then x || jsonb_build_object('draft', true) else x end
               order by ord), '[]'::jsonb)
        into v_items
        from jsonb_array_elements(v_items) with ordinality t(x, ord);
    end if;

    if p_mode = 'preview' and s.pending_cancel
       and jsonb_array_length(v_items) > v_before then
      select coalesce(jsonb_agg(
               case when ord > v_before then x || jsonb_build_object('removing', true) else x end
               order by ord), '[]'::jsonb)
        into v_items
        from jsonb_array_elements(v_items) with ordinality t(x, ord);
    end if;
    -- 172: נערך — בקשה מפורסמת שיש עליה טיוטה; הפאנל סופר "ישתנו".
    if p_mode = 'preview' and s.published_at is not null and s.draft_payload is not null
       and jsonb_array_length(v_items) > v_before then
      select coalesce(jsonb_agg(
               case when ord > v_before then x || jsonb_build_object('edited', true) else x end
               order by ord), '[]'::jsonb)
        into v_items
        from jsonb_array_elements(v_items) with ordinality t(x, ord);
    end if;
  end loop;

  if not v_rep_seen and v_rep_item is not null then
    v_items := v_items || v_rep_item;
  end if;

  if v_prev_open then
    v_items := v_items || jsonb_build_object('bucket','office','key','prev_accountant','label','קבלת החומרים מרואה החשבון הקודם','sub','ביקשנו את התיק - בתהליך');
  elsif v_prev_done then
    v_items := v_items || jsonb_build_object('bucket','done','key','prev_accountant','label','החומרים מרואה החשבון הקודם התקבלו');
  end if;

  -- ‼ ברמת הלקוח: התהליך (או הקליטה החדשה של לקוח שחוזר) עוד לא נפתח — גם כשבקשות שפורסמו
  -- לפני הקליטה מוצגות למעלה.
  if v_has_eng and not v_published and p_mode = 'live' then
    v_items := v_items || jsonb_build_object('bucket','office','key','process_pending',
      'label','אנחנו מכינים את המשך התהליך','sub','נעדכן אותך כאן ברגע שיהיה מה לעשות');
  end if;

  -- ‼ 144: הודעת מלל אינה נספרת. אין לה השלמה, ולכן כל ספירה שכוללת אותה
  -- מייצרת מונה שלעולם לא ייסגר — והופכת הודעה למטלה פתוחה לנצח. מאותה
  -- סיבה היא גם אינה משפיעה על journeyStage שנגזר מהיחס למטה.
  select count(*) filter (where x->>'bucket' = 'done'),
         count(*) filter (where x->>'bucket' <> 'future'
                            and coalesce(x->>'kind','') <> 'message')
    into v_done, v_total
    from jsonb_array_elements(v_items) x;

  if v_quote_open then
    -- 217: גם לקוח שחוזר — השלב הוא ההצעה החדשה.
    v_stage := 'quote';
  elsif not v_has_eng and quo.id is null and req.id is not null then
    v_stage := case when req.status = 'active' then 'active' else 'identity' end;
  elsif not v_has_eng then
    v_stage := case when quo.status = 'approved' then 'identity' else 'quote' end;
  elsif req.id is not null and coalesce(req.status, '') <> 'active' then
    v_stage := 'identity';
  elsif v_done < v_total then
    v_stage := 'setup';
  else
    v_stage := 'active';
  end if;

  return jsonb_build_object(
    'ok', true,
    'clientFirstName', v_first,
    'firmName', coalesce(p.firm_name, 'המשרד'),
    'branding', coalesce(p.branding, '{}'::jsonb),
    'done', v_done, 'total', v_total,
    'journeyStage', v_stage,
    'items', v_items);
end;
$function$;

-- ── 10 · מה מותר להודיע ללקוח (גוף 214 + הסוג) ─────────────────────────────
-- ‼ «פרטי העסק» נכנסת ל«שלח מייל…» ולמייל «לבד» כמו כל בקשה של הלקוח — רק כשהיא
--   אצלו. בבדיקת המשרד (ball 'me') היא לא «ממתינה ללקוח» ולא נכנסת.
create or replace function public._client_announceable_steps(p_client_id text)
returns table (step_id text, step_type text, version int, announced_version int, title text,
               delivery text, run_id text, run_status text, stage_key text,
               reminder jsonb, announced_at timestamptz, reminder_count int,
               last_reminded_at timestamptz, reminder_backoff_until timestamptz,
               is_document boolean, sort_key int, created_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select s.id, s.step_type, s.client_content_version, coalesce(ns.announced_version, 0),
         public._client_step_title(s.step_type, s.payload),
         case when s.step_type = 'rep_client_approval' then 'approve'
              else coalesce(nullif(s.payload->>'delivery', ''), 'approve') end,
         s.flow_run_id, r.status, s.flow_stage_key,
         case when s.step_type <> 'rep_client_approval' and jsonb_typeof(s.payload->'reminder') = 'object'
              then s.payload->'reminder' end,
         ns.announced_at, coalesce(ns.reminder_count, 0), ns.last_reminded_at, ns.reminder_backoff_until,
         (s.step_type = 'custom_request' and not (s.payload ? 'shaamIdentity')
           and (nullif(s.payload->>'clientResource', '') is not null
                or jsonb_typeof(s.payload->'clientResources') = 'array')),
         coalesce(s.pending_sort_order, s.sort_order, 0), s.created_at
    from public.onboarding_steps s
    left join public.client_step_notice_state ns on ns.step_id = s.id
    left join public.flow_runs r on r.id = s.flow_run_id
   where s.client_id = p_client_id
     and s.status not in ('completed', 'verified', 'skipped', 'cancelled', 'locked')
     and s.published_at is not null
     and public.client_step_gate_open(p_client_id, s.published_at)
     and coalesce(s.pending_cancel, false) = false
     and s.step_type in ('client_documents', 'custom_request', 'paperless_tax_authority',
                         'paperless_invite', 'prev_accountant_details', 'rep_client_approval',
                         -- ‼ 220 · פרטי העסק — רק כשהיא אצל הלקוח (לא בבדיקת המשרד).
                         'business_details')
     and (s.step_type <> 'business_details' or coalesce(s.ball, 'client') = 'client')
     and (s.step_type <> 'rep_client_approval'
          or (coalesce(s.payload->>'requiredBy', '') = 'shaam'
              and coalesce(s.ball, 'client') = 'client'
              and nullif(s.payload->>'clientDeclaredAt', '') is null))
     and (s.step_type <> 'custom_request'
          or (coalesce(s.ball, 'client') = 'client'
              and coalesce(s.payload->>'messageOnly', 'false') <> 'true'
              and s.payload->'externalParty' is null
              -- ‼ משימה של המשרד (216 §9) אינה בדף — ולכן גם לא במייל, גם אחרי «ממתין ללקוח».
              and not (s.payload ? 'personalConfirmFor')
              and coalesce(s.payload->>'internalTask', 'false') <> 'true'
              -- ‼ סומנה לבדיקה ואין בה תוכן ללקוח. הכלל של התוכן = _payload_has_client_content
              --   (216 §9), משוכפל כאן תו בתו כי 214 מוחלת לפניה — לשנות בשני המקומות יחד.
              and not (coalesce(s.payload->>'internalTaskReview', '') = 'true'
                       and not (coalesce(s.payload, '{}'::jsonb) <> '{}'::jsonb and coalesce(jsonb_typeof(s.payload) = 'object', false) and (
       coalesce(jsonb_array_length(case when jsonb_typeof(s.payload->'requirements') = 'array' then s.payload->'requirements' end), 0) > 0
    or coalesce(jsonb_array_length(case when jsonb_typeof(s.payload->'checklist') = 'array' then s.payload->'checklist' end), 0) > 0
    or coalesce(jsonb_array_length(case when jsonb_typeof(s.payload->'clientResources') = 'array' then s.payload->'clientResources' end), 0) > 0
    or coalesce(nullif(s.payload->>'clientResource', ''), nullif(btrim(coalesce(s.payload->>'clientLinkUrl', '')), '')) is not null
    or coalesce(s.payload->>'messageOnly', '') = 'true'
    or coalesce(jsonb_typeof(s.payload->'externalParty'), '') = 'object'
    or s.payload ?| array['smartForm', 'shaamIdentity', 'guideKey'])))))
     and coalesce(s.payload->>'delivery', '') <> 'page';
$$;

-- ── 8 · הרשאות ──────────────────────────────────────────────────────────────
revoke all on function public._home_office_answers_error(jsonb) from public, anon, authenticated;
revoke all on function public._home_office_insert_answers(text, uuid, text, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public._home_office_state(text) from public, anon, authenticated;
revoke all on function public._open_business_details_step(text) from public, anon, authenticated;
revoke all on function public._settle_business_details_step(text, text, text) from public, anon, authenticated;
revoke all on function public._open_business_details_with_paperless() from public, anon, authenticated;
revoke all on function public._clients_business_name_changed() from public, anon, authenticated;
revoke all on function public._paperless_setup_guard() from public, anon, authenticated;
revoke all on function public._paperless_setup_block_reason(text) from public, anon;
grant execute on function public._paperless_setup_block_reason(text) to service_role;
revoke all on function public.get_home_office(text) from public, anon;
revoke all on function public.save_home_office_answers(text, jsonb) from public, anon;
revoke all on function public.approve_home_office(text, text, numeric, date, text) from public, anon;
revoke all on function public.confirm_home_office_in_paperless(text) from public, anon;
grant execute on function public.get_home_office(text) to authenticated, service_role;
grant execute on function public.save_home_office_answers(text, jsonb) to authenticated, service_role;
grant execute on function public.approve_home_office(text, text, numeric, date, text) to authenticated, service_role;
grant execute on function public.confirm_home_office_in_paperless(text) to authenticated, service_role;
-- הדף האישי — מבוסס טוקן, כמו portal_submit_step.
revoke all on function public.portal_submit_business_details(text, text, jsonb) from public;
grant execute on function public.portal_submit_business_details(text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public._home_office_answers_error(jsonb) to service_role;
grant execute on function public._home_office_state(text) to service_role;

-- ── 11 · רשימת anon המותרת (גוף 206 + portal_submit_business_details) ─────────
create or replace function public.assert_domain_function_invariants()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_def text;
  v_leak text;
  v_msgs text[] := '{}';
  v_anon_ok text[] := array[
    'get_quotation', 'mark_quotation_viewed', 'approve_quotation',
    'start_intake', 'save_intake_answer', 'get_intake', 'reopen_intake',
    'get_client_portal', 'portal_submit_step',
    'get_onboarding', 'submit_onboarding_full', 'submit_signature',
    'request_spouse_onboarding',
    'get_spouse_onboarding', 'submit_spouse_onboarding',
    'get_release_portal', 'release_portal_set_item', 'release_portal_respond',
    'release_portal_remove_upload', 'release_portal_mark_items',
    'get_participant_form', 'participant_submit_prerequisites',
    -- 191: שמירת שלב בטופס הקליטה ו«הקישור נפתח» — טוקן הקליטה בלבד
    'save_onboarding_step', 'touch_onboarding',
    -- 206: דף החתימה על טופס חכם — טוקן חד-פעמי לתפקיד
    'get_smart_form_signing', 'submit_smart_form_signature',
    -- 220: «פרטי העסק» בדף האישי — טוקן הדף בלבד, אותו שער כמו portal_submit_step
    'portal_submit_business_details'
  ];
begin
  v_def := pg_get_functiondef('public.ensure_institution_alignment_steps(text,text,boolean)'::regprocedure);
  if v_def not ilike '%v_uid is not null and v_owner <> v_uid%' then
    v_msgs := array_append(v_msgs, 'ensure_institution_alignment_steps: לא הגרסה של 163');
  end if;

  v_def := pg_get_functiondef('public.approve_quotation(text,text,text)'::regprocedure);
  if v_def ilike '%exception when others%' or v_def not ilike '%approval_incomplete%' then
    v_msgs := array_append(v_msgs, 'approve_quotation: לא הגרסה של 161');
  end if;

  v_def := pg_get_functiondef('public.create_engagement_for_quotation(text,boolean)'::regprocedure);
  if v_def not ilike '%journey_incomplete%' then
    v_msgs := array_append(v_msgs, 'create_engagement_for_quotation: לא הגרסה של 163');
  end if;

  v_def := pg_get_functiondef('public.propose_tax_facts(text,text,text,jsonb)'::regprocedure);
  if v_def not ilike '%v_rows%' then
    v_msgs := array_append(v_msgs, 'propose_tax_facts: לא הגרסה של 162');
  end if;

  select string_agg(p.proname, ', ') into v_leak
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind in ('f','p')
     and p.prorettype <> 'trigger'::regtype
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and not (p.proname = any(v_anon_ok));
  if v_leak is not null then
    v_msgs := array_append(v_msgs, 'פונקציות פתוחות ל-anon מחוץ לרשימה: ' || v_leak);
  end if;

  if has_function_privilege('authenticated', 'public.build_client_portal(text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.build_client_portal(text,text)', 'EXECUTE') then
    v_msgs := array_append(v_msgs, 'build_client_portal פתוחה ל-anon/authenticated');
  end if;

  if not exists (select 1 from pg_event_trigger where evtname = 'p0_lock_new_functions' and evtenabled <> 'D') then
    v_msgs := array_append(v_msgs, 'event trigger p0_lock_new_functions חסר או מנוטרל');
  end if;

  if has_function_privilege('authenticated', 'public._apply_prerequisite_values(text,text,jsonb,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public._apply_prerequisite_values(text,text,jsonb,text,text)', 'EXECUTE') then
    v_msgs := array_append(v_msgs, '_apply_prerequisite_values פתוחה ל-anon/authenticated');
  end if;

  if array_length(v_msgs, 1) > 0 then
    raise exception 'domain function invariants violated: %', array_to_string(v_msgs, ' | ');
  end if;
  return 'ok';
end;
$function$;

revoke execute on function public.assert_domain_function_invariants() from public, anon, authenticated;
grant  execute on function public.assert_domain_function_invariants() to authenticated, service_role;

select public.assert_domain_function_invariants();
