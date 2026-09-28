-- ═══════════════════════════════════════════════════════════════════════════
-- 206 · טפסים חכמים — הגשת טופס 6101 לביטוח לאומי
-- ═══════════════════════════════════════════════════════════════════════════
--
-- «טופס חכם» = קובץ רשמי שטוח + מיפוי שדות שנמדד עליו (בקוד, קשור ל-SHA-256
-- של הקובץ). כאן נשמר מה שמשתנה לכל לקוח:
--
--   smart_form_filings    הגשה אחת — מחזור חיים אחד, שורה אחת ב«בקשות».
--   smart_form_revisions  גרסאות התוכן. גרסה נעולה לחתימה אינה משתנה; שינוי
--                         אחרי נעילה/חתימה = גרסה חדשה וחתימות מחדש. גרסה
--                         חתומה נשארת כהיסטוריה עם הקובץ החתום והטביעה שלו.
--   smart_form_events     יומן ביקורת (רק הוספה).
--
-- ‼ ההגשה מתארת «מה מבוקש», לא «מה אושר». שום פעולה כאן אינה כותבת את מצב
-- ב"ל בכרטיס (niOccupations וכו'). תוצאה רשמית נרשמת רק עם ראיה.
--
-- ‼ שלב «בקשות» (onboarding_steps, custom_request) הוא היטל של ההגשה: הוא
-- נכתב רק דרך _smart_form_sync_step, שעוברת ב-_set_step_status — הנתיב היחיד
-- לסטטוס (168). היסודות: docs/PRODUCT-REQUESTS-WORKFLOW-FOUNDATION.md §3, §4, §12.
--
-- בנוסף: שלושה שדות קנוניים חדשים בכרטיס — מיקוד, טלפון קווי ומען למכתבים.
-- כתובת העסק נשמרת בתוך businesses[] (jsonb) ואינה דורשת עמודה.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0 · הכרטיס ─────────────────────────────────────────────────────────────
alter table public.clients add column if not exists zip_code text;
alter table public.clients add column if not exists landline_phone text;
alter table public.clients add column if not exists mailing_address jsonb;

comment on column public.clients.zip_code is '206 · מיקוד מגורים. NULL = לא ידוע.';
comment on column public.clients.landline_phone is '206 · טלפון קווי, נפרד מ-phone (הנייד).';
comment on column public.clients.mailing_address is '206 · מען למכתבים כשהוא שונה מכתובת המגורים: {recipient,street,houseNumber,entrance,apartment,city,zip}.';

-- ── 1 · טבלאות ─────────────────────────────────────────────────────────────
create table if not exists public.smart_form_filings (
  id              text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id         uuid not null references auth.users(id) on delete cascade,
  client_id       text not null references public.clients(id) on delete cascade,
  template_key    text not null check (template_key in ('btl-6101')),
  subject_role    text not null default 'client' check (subject_role in ('client', 'spouse')),
  purposes        text[] not null default '{}',
  flags           jsonb not null default '{}'::jsonb,
  state           text not null default 'draft' check (state in (
                    'draft', 'waiting_client_info', 'review', 'awaiting_signatures', 'signed',
                    'awaiting_client_submission', 'submitted', 'info_requested', 'result_received',
                    'closed', 'cancelled')),
  current_revision int not null default 1,
  step_id         text references public.onboarding_steps(id) on delete set null,
  missing_info    jsonb,
  attachments     jsonb not null default '[]'::jsonb,
  submission      jsonb,
  outcome         jsonb,
  follow_up       jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  closed_at       timestamptz
);

-- ‼ §11 · זהות העבודה: בעלים + סוג + נושא + פתוח. שתי כניסות ⇒ אותה הגשה.
create unique index if not exists smart_form_filings_one_open
  on public.smart_form_filings (client_id, template_key, subject_role)
  where state not in ('closed', 'cancelled');
create index if not exists smart_form_filings_client_idx on public.smart_form_filings (client_id);

create table if not exists public.smart_form_revisions (
  id               text primary key default replace(gen_random_uuid()::text, '-', ''),
  filing_id        text not null references public.smart_form_filings(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  revision         int not null,
  template_key     text not null,
  template_version text not null,
  template_sha256  text not null,
  mapping_version  int not null,
  purposes         text[] not null default '{}',
  values           jsonb not null default '{}'::jsonb,
  snapshot         jsonb,
  content_sha256   text,
  state            text not null default 'draft' check (state in ('draft', 'locked', 'signed', 'superseded')),
  signers          jsonb not null default '[]'::jsonb,
  signatures       jsonb not null default '{}'::jsonb,
  sign_tokens      jsonb not null default '{}'::jsonb,
  signed_document_id text,
  signed_pdf_sha256  text,
  created_at       timestamptz not null default now(),
  locked_at        timestamptz,
  signed_at        timestamptz,
  superseded_at    timestamptz,
  unique (filing_id, revision)
);

create table if not exists public.smart_form_events (
  id         bigserial primary key,
  filing_id  text not null references public.smart_form_filings(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  revision   int,
  at         timestamptz not null default now(),
  actor      text not null check (actor in ('office', 'client', 'spouse', 'system')),
  kind       text not null,
  detail     jsonb not null default '{}'::jsonb
);
create index if not exists smart_form_events_filing_idx on public.smart_form_events (filing_id, at);

-- ── 2 · RLS: קריאה לבעלים בלבד; כל כתיבה דרך RPC ─────────────────────────
alter table public.smart_form_filings enable row level security;
alter table public.smart_form_revisions enable row level security;
alter table public.smart_form_events enable row level security;

do $$
declare t text;
begin
  foreach t in array array['smart_form_filings', 'smart_form_revisions', 'smart_form_events'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('create policy %I on public.%I for select to authenticated using (auth.uid() = user_id)', t || '_select_own', t);
    execute format('drop policy if exists require_authorized on public.%I', t);
    execute format('create policy require_authorized on public.%I as restrictive for all to authenticated '
                   || 'using (public.is_authorized()) with check (public.is_authorized())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ── 3 · עזרים (לא ניתנים לקריאה מבחוץ) ─────────────────────────────────────

/** הטפסים הרשומים — אותם קבועים כמו בקוד (template.ts). קובץ אחר ⇒ לא מופה. */
create or replace function public._smart_form_template(p_key text)
returns jsonb language sql immutable set search_path to 'public' as $$
  select case p_key
    when 'btl-6101' then jsonb_build_object(
      'version', '06.2026',
      'sha256', '79e4f387e851cf1a8218c52c4991321e9daae39f3c02f235aeaa3287c3d93754',
      'mappingVersion', 1,
      'title', 'דין וחשבון רב שנתי (6101) · ביטוח לאומי',
      'purposes', jsonb_build_array('multi_year_report', 'start', 'change', 'end', 'stop_employees', 'spouse_in_business', 'update_details'))
    else null end;
$$;

create or replace function public._smart_form_event(p_filing text, p_user uuid, p_revision int, p_actor text, p_kind text, p_detail jsonb default '{}'::jsonb)
returns void language sql security definer set search_path to 'public' as $$
  insert into public.smart_form_events (filing_id, user_id, revision, actor, kind, detail)
  values (p_filing, p_user, p_revision, p_actor, p_kind, coalesce(p_detail, '{}'::jsonb));
$$;

create or replace function public._smart_form_png_ok(p_png text)
returns boolean language sql immutable set search_path to 'public' as $$
  select p_png is not null
     and p_png like 'data:image/png;base64,%'
     and length(p_png) between 200 and 600000
     and substr(p_png, 23) ~ '^[A-Za-z0-9+/=]+$';
$$;

/**
 * ההיטל לשלב «בקשות». ‼ הנתיב היחיד שמזיז אותו — דרך _set_step_status.
 * payload.smartForm נושא את מה שהמסך צריך בשביל כרטיס ופעולה ראשית.
 */
create or replace function public._smart_form_sync_step(p_filing_id text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  f public.smart_form_filings%rowtype;
  r public.smart_form_revisions%rowtype;
  v_status text; v_ball text; v_label text; v_waiting text; v_pending text[]; v_client_msg text;
begin
  select * into f from public.smart_form_filings where id = p_filing_id;
  if f.id is null or f.step_id is null then return; end if;
  select * into r from public.smart_form_revisions where filing_id = f.id and revision = f.current_revision;

  select coalesce(array_agg(s->>'role'), '{}') into v_pending
    from jsonb_array_elements(coalesce(r.signers, '[]'::jsonb)) s
   where coalesce((s->>'required')::boolean, true) and coalesce(s->>'status', 'pending') <> 'signed';

  case f.state
    when 'draft' then v_status := 'in_progress'; v_ball := 'me'; v_label := 'בהכנה במשרד';
    when 'waiting_client_info' then v_status := 'waiting_client'; v_ball := 'client'; v_label := 'ממתין למידע מהלקוח'; v_waiting := 'client';
    when 'review' then v_status := 'in_progress'; v_ball := 'me'; v_label := 'לבדיקה מקצועית';
    when 'awaiting_signatures' then
      v_status := 'waiting_client'; v_ball := 'client';
      v_waiting := case when 'client' = any(v_pending) then 'client' when 'spouse' = any(v_pending) then 'spouse' else 'client' end;
      v_label := case when 'client' = any(v_pending) and 'spouse' = any(v_pending) then 'ממתין לחתימת הלקוח ובן/בת הזוג'
                      when 'client' = any(v_pending) then 'ממתין לחתימת הלקוח'
                      when 'spouse' = any(v_pending) then 'ממתין לחתימת בן/בת הזוג'
                      else 'ממתין לחתימות' end;
    when 'signed' then
      v_status := 'in_progress'; v_ball := 'me';
      v_label := case when r.signed_document_id is null then 'נחתם — להפקת המסמך החתום' else 'נחתם — מוכן להגשה' end;
    when 'awaiting_client_submission' then v_status := 'waiting_client'; v_ball := 'client'; v_label := 'הלקוח מגיש באזור האישי בביטוח לאומי'; v_waiting := 'client';
    when 'submitted' then v_status := 'in_progress'; v_ball := 'authority'; v_label := 'הוגש — ממתין לביטוח לאומי'; v_waiting := 'authority';
    when 'info_requested' then v_status := 'in_progress'; v_ball := 'me'; v_label := 'ביטוח לאומי ביקש מידע נוסף';
    when 'result_received' then v_status := 'in_progress'; v_ball := 'me'; v_label := 'התקבלה תשובה רשמית — להחליט על ההמשך';
    when 'closed' then v_status := 'completed'; v_ball := 'me'; v_label := 'הושלם';
    when 'cancelled' then v_status := 'cancelled'; v_ball := 'me'; v_label := 'בוטל';
  end case;

  -- ‼ מה שהלקוח רואה בדף האישי: שורה שקטה «בטיפול המשרד» (messageOnly), לא
  -- פעולה ולא בקשה — ובלי «נשלח»/«אושר» שאין להם ראיה. החתימה עצמה בקישור אישי.
  v_client_msg := case f.state
    when 'waiting_client_info' then 'המשרד מכין את הדיווח לביטוח לאומי (טופס 6101) וייצור איתך קשר להשלמת פרטים.'
    when 'awaiting_signatures' then 'הטופס מוכן לחתימה. החתימה נעשית במשרד או בקישור אישי שהמשרד מעביר.'
    when 'signed' then 'הטופס נחתם. המשרד מטפל בהגשה לביטוח לאומי.'
    when 'awaiting_client_submission' then 'הטופס נחתם. יש להגיש אותו באזור האישי באתר ביטוח לאומי ולהעביר למשרד אישור על ההגשה.'
    when 'submitted' then 'הטופס הוגש לביטוח לאומי. ממתינים לתשובה.'
    when 'info_requested' then 'ביטוח לאומי ביקש מידע נוסף. המשרד מטפל בכך.'
    when 'result_received' then 'התקבלה תשובה מביטוח לאומי. המשרד בודק אותה.'
    else 'המשרד מכין עבורך את הדיווח לביטוח לאומי (טופס 6101).' end;

  update public.onboarding_steps
     set payload = coalesce(payload, '{}'::jsonb)
                   || jsonb_build_object('messageOnly', true, 'clientTitle', 'דיווח לביטוח לאומי (טופס 6101)', 'message', v_client_msg)
                   || jsonb_build_object('smartForm', jsonb_build_object(
           'filingId', f.id, 'templateKey', f.template_key, 'state', f.state, 'stateLabel', v_label,
           'waitingOn', v_waiting, 'revision', f.current_revision, 'purposes', to_jsonb(f.purposes),
           'subjectRole', f.subject_role, 'syncedAt', now())),
         updated_at = now()
   where id = f.step_id;

  perform public._set_step_status(f.step_id, v_status, 'system', v_label,
    jsonb_build_object('filingId', f.id, 'state', f.state), v_ball,
    case when v_status = 'completed' then 'manual' else null end);
end;
$$;

/** בעלות + הרשאה. מחזיר את ההגשה נעולה לעדכון, או null. */
create or replace function public._smart_form_owned(p_filing_id text)
returns public.smart_form_filings language plpgsql security definer set search_path to 'public' as $$
declare f public.smart_form_filings%rowtype;
begin
  if auth.uid() is null or not public.is_authorized() then return null; end if;
  select * into f from public.smart_form_filings where id = p_filing_id for update;
  if f.id is null or f.user_id <> auth.uid() then return null; end if;
  return f;
end;
$$;

/** אחרי חתימה: כשכל החותמים הנדרשים חתמו — הגרסה חתומה וההגשה «נחתם». */
create or replace function public._smart_form_after_signature(p_revision_id text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare r public.smart_form_revisions%rowtype; v_open int;
begin
  select * into r from public.smart_form_revisions where id = p_revision_id for update;
  select count(*) into v_open from jsonb_array_elements(r.signers) s
   where coalesce((s->>'required')::boolean, true) and coalesce(s->>'status', 'pending') <> 'signed';
  if v_open > 0 then return false; end if;
  update public.smart_form_revisions set state = 'signed', signed_at = now(), sign_tokens = '{}'::jsonb where id = r.id;
  update public.smart_form_filings set state = 'signed', updated_at = now() where id = r.filing_id;
  perform public._smart_form_event(r.filing_id, r.user_id, r.revision, 'system', 'all_signed', '{}'::jsonb);
  return true;
end;
$$;

-- ── 4 · פתיחת הגשה (אידמפוטנטי) ─────────────────────────────────────────────
create or replace function public.smart_form_start(
  p_client_id text, p_template_key text, p_subject_role text default 'client', p_purposes text[] default '{}'::text[])
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  c public.clients%rowtype;
  f public.smart_form_filings%rowtype;
  t jsonb := public._smart_form_template(p_template_key);
  v_res jsonb;
  v_bad text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;
  if not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if t is null then return jsonb_build_object('ok', false, 'error', 'unknown_template'); end if;
  -- ‼ נושא = הלקוח בלבד בשלב זה: לבן/בת זוג בלי כרטיס אין זהות מבוטח משלו (יסודות §5).
  if coalesce(p_subject_role, 'client') <> 'client' then return jsonb_build_object('ok', false, 'error', 'subject_not_supported'); end if;
  select p into v_bad from unnest(coalesce(p_purposes, '{}')) p
   where not (to_jsonb(p) <@ (t->'purposes')) limit 1;
  if v_bad is not null then return jsonb_build_object('ok', false, 'error', 'bad_purpose', 'purpose', v_bad); end if;

  select * into f from public.smart_form_filings
   where client_id = c.id and template_key = p_template_key and subject_role = 'client'
     and state not in ('closed', 'cancelled')
   for update;
  if f.id is not null then
    return jsonb_build_object('ok', true, 'filingId', f.id, 'existing', true, 'stepId', f.step_id);
  end if;

  begin
    insert into public.smart_form_filings (user_id, client_id, template_key, subject_role, purposes)
    values (v_uid, c.id, p_template_key, 'client', coalesce(p_purposes, '{}'))
    returning * into f;
  exception when unique_violation then
    select * into f from public.smart_form_filings
     where client_id = c.id and template_key = p_template_key and subject_role = 'client'
       and state not in ('closed', 'cancelled');
    return jsonb_build_object('ok', true, 'filingId', f.id, 'existing', true, 'stepId', f.step_id);
  end;

  insert into public.smart_form_revisions (filing_id, user_id, revision, template_key, template_version, template_sha256, mapping_version, purposes)
  values (f.id, v_uid, 1, p_template_key, t->>'version', t->>'sha256', (t->>'mappingVersion')::int, f.purposes);

  -- השורה ב«בקשות»: עבודה של המשרד (owner=me), לא חלק מסגירת הקליטה.
  v_res := public.create_onboarding_request(
    c.id, 'custom_request',
    jsonb_build_object('title', t->>'title', 'requirements', '[]'::jsonb, 'messageOnly', true,
                       'clientTitle', 'דיווח לביטוח לאומי (טופס 6101)', 'message', 'המשרד מכין עבורך את הדיווח לביטוח לאומי (טופס 6101).',
                       'smartForm', jsonb_build_object('filingId', f.id, 'templateKey', p_template_key, 'state', 'draft')),
    null, null, true, false, 'me', null);
  if not coalesce((v_res->>'ok')::boolean, false) then
    raise exception 'smart_form_step_failed: %', coalesce(v_res->>'error', 'unknown');
  end if;
  update public.smart_form_filings set step_id = v_res->>'stepId' where id = f.id;

  perform public._smart_form_event(f.id, v_uid, 1, 'office', 'created',
    jsonb_build_object('templateKey', p_template_key, 'templateVersion', t->>'version', 'purposes', to_jsonb(f.purposes)));
  perform public._smart_form_sync_step(f.id);
  return jsonb_build_object('ok', true, 'filingId', f.id, 'existing', false, 'stepId', v_res->>'stepId');
end;
$$;

-- ── 5 · שמירת טיוטה ─────────────────────────────────────────────────────────
create or replace function public.smart_form_save(
  p_filing_id text, p_revision int, p_purposes text[], p_flags jsonb, p_values jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  f public.smart_form_filings%rowtype := public._smart_form_owned(p_filing_id);
  r public.smart_form_revisions%rowtype;
  t jsonb;
  v_bad text;
  v_changed text[];
begin
  if f.id is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if f.state not in ('draft', 'waiting_client_info', 'review') then return jsonb_build_object('ok', false, 'error', 'not_editable', 'state', f.state); end if;
  if p_revision is distinct from f.current_revision then return jsonb_build_object('ok', false, 'error', 'stale_revision', 'revision', f.current_revision); end if;
  select * into r from public.smart_form_revisions where filing_id = f.id and revision = f.current_revision for update;
  if r.state <> 'draft' then return jsonb_build_object('ok', false, 'error', 'revision_locked'); end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then return jsonb_build_object('ok', false, 'error', 'invalid_values'); end if;
  t := public._smart_form_template(f.template_key);
  select p into v_bad from unnest(coalesce(p_purposes, '{}')) p where not (to_jsonb(p) <@ (t->'purposes')) limit 1;
  if v_bad is not null then return jsonb_build_object('ok', false, 'error', 'bad_purpose', 'purpose', v_bad); end if;

  select coalesce(array_agg(n.key), '{}') into v_changed
    from jsonb_each(coalesce(p_values->'entered', '{}'::jsonb)) n
   where n.value is distinct from (r.values->'entered'->n.key);

  update public.smart_form_revisions set values = p_values, purposes = coalesce(p_purposes, '{}') where id = r.id;
  update public.smart_form_filings set purposes = coalesce(p_purposes, '{}'), flags = coalesce(p_flags, '{}'::jsonb), updated_at = now() where id = f.id;
  -- ‼ ביומן — אילו מפתחות השתנו, לא הערכים (מידע אישי נשאר בגרסה עצמה).
  if array_length(v_changed, 1) > 0 or f.purposes is distinct from coalesce(p_purposes, '{}') then
    perform public._smart_form_event(f.id, f.user_id, r.revision, 'office', 'saved',
      jsonb_build_object('changedKeys', to_jsonb(v_changed), 'purposes', to_jsonb(coalesce(p_purposes, '{}'))));
  end if;
  perform public._smart_form_sync_step(f.id);
  return jsonb_build_object('ok', true, 'revision', r.revision);
end;
$$;

-- ── 6 · גרסה חדשה (אחרי נעילה/חתימה) ────────────────────────────────────────
create or replace function public.smart_form_new_revision(p_filing_id text, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  f public.smart_form_filings%rowtype := public._smart_form_owned(p_filing_id);
  r public.smart_form_revisions%rowtype;
  v_next int;
begin
  if f.id is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  -- ‼ מה שהוגש הוא מה שהוגש: אחרי הגשה אין גרסה חדשה על אותה הגשה.
  if f.state in ('awaiting_client_submission', 'submitted', 'info_requested', 'result_received', 'closed', 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'submitted_is_final', 'state', f.state);
  end if;
  if coalesce(trim(p_reason), '') = '' then return jsonb_build_object('ok', false, 'error', 'reason_required'); end if;
  select * into r from public.smart_form_revisions where filing_id = f.id and revision = f.current_revision for update;
  if r.state = 'draft' then return jsonb_build_object('ok', true, 'revision', r.revision, 'unchanged', true); end if;

  v_next := r.revision + 1;
  update public.smart_form_revisions
     set state = case when state = 'locked' then 'superseded' else state end,
         superseded_at = now(), sign_tokens = '{}'::jsonb
   where id = r.id;
  insert into public.smart_form_revisions (filing_id, user_id, revision, template_key, template_version, template_sha256, mapping_version, purposes, values)
  values (f.id, f.user_id, v_next, r.template_key, r.template_version, r.template_sha256, r.mapping_version, r.purposes, r.values);
  update public.smart_form_filings set current_revision = v_next, state = 'draft', updated_at = now() where id = f.id;
  perform public._smart_form_event(f.id, f.user_id, v_next, 'office', 'new_revision',
    jsonb_build_object('from', r.revision, 'fromState', r.state, 'reason', p_reason, 'signaturesVoided', r.state in ('locked', 'signed')));
  perform public._smart_form_sync_step(f.id);
  return jsonb_build_object('ok', true, 'revision', v_next);
end;
$$;

-- ── 7 · נעילה לחתימה ────────────────────────────────────────────────────────
create or replace function public.smart_form_lock(p_filing_id text, p_revision int, p_snapshot jsonb, p_signers jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  f public.smart_form_filings%rowtype := public._smart_form_owned(p_filing_id);
  r public.smart_form_revisions%rowtype;
  v_signers jsonb := '[]'::jsonb;
  s jsonb;
  v_hash text;
  v_need_spouse boolean;
  v_req jsonb;
  v_att jsonb;
  v_reason text;
begin
  if f.id is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if f.state not in ('draft', 'review', 'waiting_client_info') then return jsonb_build_object('ok', false, 'error', 'not_lockable', 'state', f.state); end if;
  if p_revision is distinct from f.current_revision then return jsonb_build_object('ok', false, 'error', 'stale_revision'); end if;
  select * into r from public.smart_form_revisions where filing_id = f.id and revision = f.current_revision for update;
  if r.state <> 'draft' then return jsonb_build_object('ok', false, 'error', 'revision_locked'); end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot->'data') <> 'object' then return jsonb_build_object('ok', false, 'error', 'invalid_snapshot'); end if;
  if jsonb_typeof(p_snapshot->'blockers') = 'array' and jsonb_array_length(p_snapshot->'blockers') > 0 then
    return jsonb_build_object('ok', false, 'error', 'has_blockers');
  end if;

  -- ‼ «התחלתי» ו«חדלתי» באותו טופס — רק באישור מקצועי מפורש עם סיבה, שנרשמת
  -- ביומן. נאכף כאן ולא רק במסך: הצילום מהדפדפן אינו ראיה לאישור.
  v_reason := coalesce(trim(p_snapshot->'professional'->'startAndEnd'->>'reason'), '');
  if 'start' = any(f.purposes) and 'end' = any(f.purposes) and v_reason = '' then
    return jsonb_build_object('ok', false, 'error', 'professional_confirmation_required');
  end if;

  -- ‼ אסמכתאות שנדרשות לפי מה שננעל (למשל דיווח למפרע) נרשמות על ההגשה כאן,
  -- עם lockedRequirement — ו«הוגש» נחסם עד שצורפו (smart_form_advance).
  -- אסמכתא קיימת עם אותו מפתח שומרת את המסמך שצורף לה.
  v_req := case when jsonb_typeof(p_snapshot->'requiredAttachments') = 'array' then p_snapshot->'requiredAttachments' else '[]'::jsonb end;
  if exists (select 1 from jsonb_array_elements(v_req) x
              where coalesce(x->>'key', '') = '' or coalesce(x->>'label', '') = '' or jsonb_typeof(x->'required') is distinct from 'boolean') then
    return jsonb_build_object('ok', false, 'error', 'invalid_snapshot');
  end if;
  select coalesce(jsonb_agg(t.x), '[]'::jsonb) into v_att from (
    select case
             when req.x is null then cur.x
             else coalesce(cur.x, '{}'::jsonb) || jsonb_build_object(
               'key', req.x->>'key', 'label', req.x->>'label',
               'required', (req.x->>'required')::boolean or coalesce((cur.x->>'required')::boolean, false),
               'lockedRequirement', (req.x->>'required')::boolean or coalesce((cur.x->>'lockedRequirement')::boolean, false))
           end as x
      from (select a as x from jsonb_array_elements(f.attachments) a) cur
      full join (select a as x from jsonb_array_elements(v_req) a) req on cur.x->>'key' = req.x->>'key'
  ) t;

  v_need_spouse := 'spouse_in_business' = any(f.purposes);
  for s in select * from jsonb_array_elements(coalesce(p_signers, '[]'::jsonb)) loop
    if s->>'role' not in ('client', 'spouse') then return jsonb_build_object('ok', false, 'error', 'bad_signer'); end if;
    if coalesce(trim(s->>'name'), '') = '' then return jsonb_build_object('ok', false, 'error', 'signer_name_required', 'role', s->>'role'); end if;
    v_signers := v_signers || jsonb_build_array(jsonb_build_object(
      'role', s->>'role', 'name', trim(s->>'name'), 'idNumber', s->>'idNumber',
      'required', (s->>'role' = 'client') or v_need_spouse, 'status', 'pending'));
  end loop;
  if not exists (select 1 from jsonb_array_elements(v_signers) x where x->>'role' = 'client') then
    return jsonb_build_object('ok', false, 'error', 'client_signer_required');
  end if;
  if v_need_spouse and not exists (select 1 from jsonb_array_elements(v_signers) x where x->>'role' = 'spouse') then
    return jsonb_build_object('ok', false, 'error', 'spouse_signer_required');
  end if;

  -- ‼ הטביעה מחושבת בשרת: jsonb מנורמל ⇒ אותו תוכן, אותה טביעה.
  v_hash := encode(sha256(convert_to(r.template_sha256 || '|' || r.mapping_version::text || '|'
                   || array_to_string(f.purposes, ',') || '|' || (p_snapshot->'data')::text, 'UTF8')), 'hex');

  update public.smart_form_revisions
     set state = 'locked', snapshot = p_snapshot, content_sha256 = v_hash, signers = v_signers,
         signatures = '{}'::jsonb, sign_tokens = '{}'::jsonb, locked_at = now(), purposes = f.purposes
   where id = r.id;
  update public.smart_form_filings set state = 'awaiting_signatures', missing_info = null, attachments = v_att, updated_at = now() where id = f.id;
  perform public._smart_form_event(f.id, f.user_id, r.revision, 'office', 'locked',
    jsonb_build_object('contentSha256', v_hash,
      'signers', (select jsonb_agg(x->>'role') from jsonb_array_elements(v_signers) x where (x->>'required')::boolean),
      'requiredAttachments', (select jsonb_agg(x->>'key') from jsonb_array_elements(v_req) x where (x->>'required')::boolean))
    || case when v_reason <> '' then jsonb_build_object('professionalStartAndEnd', v_reason) else '{}'::jsonb end);
  perform public._smart_form_sync_step(f.id);
  return jsonb_build_object('ok', true, 'contentSha256', v_hash);
end;
$$;

-- ── 8 · חתימה במשרד (החותם נוכח וחותם על המסך) ─────────────────────────────
create or replace function public.smart_form_capture_signature(
  p_filing_id text, p_revision int, p_role text, p_png text, p_content_sha256 text, p_attestation text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  f public.smart_form_filings%rowtype := public._smart_form_owned(p_filing_id);
  r public.smart_form_revisions%rowtype;
  v_found boolean := false;
  v_signers jsonb := '[]'::jsonb;
  s jsonb;
  v_all boolean;
begin
  if f.id is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if f.state <> 'awaiting_signatures' then return jsonb_build_object('ok', false, 'error', 'not_awaiting_signatures', 'state', f.state); end if;
  select * into r from public.smart_form_revisions where filing_id = f.id and revision = f.current_revision for update;
  if p_revision is distinct from r.revision or r.state <> 'locked' then return jsonb_build_object('ok', false, 'error', 'stale_revision'); end if;
  -- ‼ החותם חותם על מה שראה: הטביעה שהמסך הציג חייבת להיות הטביעה הנעולה.
  if p_content_sha256 is distinct from r.content_sha256 then return jsonb_build_object('ok', false, 'error', 'content_changed'); end if;
  if not public._smart_form_png_ok(p_png) then return jsonb_build_object('ok', false, 'error', 'bad_signature_image'); end if;
  if coalesce(trim(p_attestation), '') = '' then return jsonb_build_object('ok', false, 'error', 'attestation_required'); end if;

  for s in select * from jsonb_array_elements(r.signers) loop
    if s->>'role' = p_role then
      if s->>'status' = 'signed' then return jsonb_build_object('ok', false, 'error', 'already_signed'); end if;
      v_found := true;
      s := s || jsonb_build_object('status', 'signed', 'signedAt', now(), 'method', 'in_office', 'attestedBy', auth.uid(), 'attestation', p_attestation);
    end if;
    v_signers := v_signers || jsonb_build_array(s);
  end loop;
  if not v_found then return jsonb_build_object('ok', false, 'error', 'unknown_signer'); end if;

  update public.smart_form_revisions
     set signers = v_signers,
         signatures = signatures || jsonb_build_object(p_role, jsonb_build_object('png', p_png, 'signedAt', now(), 'method', 'in_office')),
         sign_tokens = sign_tokens - p_role
   where id = r.id;
  perform public._smart_form_event(f.id, f.user_id, r.revision, 'office', 'signature_captured',
    jsonb_build_object('role', p_role, 'method', 'in_office', 'contentSha256', r.content_sha256));
  v_all := public._smart_form_after_signature(r.id);
  perform public._smart_form_sync_step(f.id);
  return jsonb_build_object('ok', true, 'allSigned', v_all);
end;
$$;

-- ── 9 · קישור חתימה מרחוק (חד-פעמי, לתפקיד, עם תפוגה) ──────────────────────
create or replace function public.smart_form_issue_sign_link(p_filing_id text, p_revision int, p_role text, p_days int default 14)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  f public.smart_form_filings%rowtype := public._smart_form_owned(p_filing_id);
  r public.smart_form_revisions%rowtype;
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_exp timestamptz := now() + make_interval(days => greatest(1, least(coalesce(p_days, 14), 30)));
begin
  if f.id is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if f.state <> 'awaiting_signatures' then return jsonb_build_object('ok', false, 'error', 'not_awaiting_signatures'); end if;
  select * into r from public.smart_form_revisions where filing_id = f.id and revision = f.current_revision for update;
  if p_revision is distinct from r.revision or r.state <> 'locked' then return jsonb_build_object('ok', false, 'error', 'stale_revision'); end if;
  if not exists (select 1 from jsonb_array_elements(r.signers) s where s->>'role' = p_role and s->>'status' <> 'signed') then
    return jsonb_build_object('ok', false, 'error', 'no_pending_signer');
  end if;
  -- ‼ נשמרת רק הטביעה של הטוקן; הקישור הקודם לאותו תפקיד מתבטל.
  update public.smart_form_revisions
     set sign_tokens = sign_tokens || jsonb_build_object(p_role, jsonb_build_object(
           'hash', encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), 'expiresAt', v_exp, 'issuedAt', now()))
   where id = r.id;
  perform public._smart_form_event(f.id, f.user_id, r.revision, 'office', 'sign_link_issued',
    jsonb_build_object('role', p_role, 'expiresAt', v_exp));
  return jsonb_build_object('ok', true, 'token', v_token, 'expiresAt', v_exp);
end;
$$;

/** מאתר גרסה לפי טוקן — פנימי, לשתי הפונקציות הציבוריות. */
create or replace function public._smart_form_by_token(p_token text, out r public.smart_form_revisions, out v_role text, out v_reason text)
language plpgsql security definer set search_path to 'public' as $$
declare v_hash text; k text; v jsonb;
begin
  if p_token is null or length(p_token) < 40 or p_token !~ '^[0-9a-f]+$' then v_reason := 'not_found'; return; end if;
  v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  select x.* into r from public.smart_form_revisions x
   where exists (select 1 from jsonb_each(x.sign_tokens) e where e.value->>'hash' = v_hash)
   limit 1;
  if r.id is null then v_reason := 'not_found'; return; end if;
  for k, v in select * from jsonb_each(r.sign_tokens) loop
    if v->>'hash' = v_hash then v_role := k; if (v->>'expiresAt')::timestamptz < now() then v_reason := 'link_expired'; end if; end if;
  end loop;
  if r.state <> 'locked' then v_reason := coalesce(v_reason, 'not_signable'); end if;
end;
$$;

create or replace function public.get_smart_form_signing(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  x record;
  f public.smart_form_filings%rowtype;
  c public.clients%rowtype;
  p public.profiles%rowtype;
  s jsonb;
begin
  select * into x from public._smart_form_by_token(p_token);
  if x.v_reason is not null then return jsonb_build_object('ok', false, 'reason', x.v_reason); end if;
  select * into f from public.smart_form_filings where id = (x.r).filing_id;
  if f.state <> 'awaiting_signatures' then return jsonb_build_object('ok', false, 'reason', 'not_signable'); end if;
  select * into c from public.clients where id = f.client_id;
  select * into p from public.profiles where id = f.user_id;
  select e into s from jsonb_array_elements((x.r).signers) e where e->>'role' = x.v_role;
  if s->>'status' = 'signed' then return jsonb_build_object('ok', true, 'alreadySigned', true); end if;
  perform public._smart_form_event(f.id, f.user_id, (x.r).revision, x.v_role, 'sign_link_opened', '{}'::jsonb);
  return jsonb_build_object('ok', true,
    'role', x.v_role, 'signerName', s->>'name',
    'firmName', coalesce(p.firm_name, ''),
    'templateKey', (x.r).template_key, 'templateVersion', (x.r).template_version,
    'templateSha256', (x.r).template_sha256, 'mappingVersion', (x.r).mapping_version,
    'purposes', to_jsonb((x.r).purposes),
    'data', (x.r).snapshot->'data',
    'contentSha256', (x.r).content_sha256,
    'otherSignatures', (select coalesce(jsonb_object_agg(k, v->'png'), '{}'::jsonb) from jsonb_each((x.r).signatures) sg(k, v) where k <> x.v_role),
    'clientSignedAt', (select e->>'signedAt' from jsonb_array_elements((x.r).signers) e where e->>'role' = 'client' and e->>'status' = 'signed'));
end;
$$;

create or replace function public.submit_smart_form_signature(p_token text, p_png text, p_content_sha256 text, p_consent boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  x record;
  r public.smart_form_revisions%rowtype;
  f public.smart_form_filings%rowtype;
  v_signers jsonb := '[]'::jsonb;
  s jsonb;
  v_all boolean;
begin
  select * into x from public._smart_form_by_token(p_token);
  if x.v_reason is not null then return jsonb_build_object('ok', false, 'reason', x.v_reason); end if;
  select * into r from public.smart_form_revisions where id = (x.r).id for update;
  select * into f from public.smart_form_filings where id = r.filing_id for update;
  if f.state <> 'awaiting_signatures' or r.state <> 'locked' then return jsonb_build_object('ok', false, 'reason', 'not_signable'); end if;
  if p_content_sha256 is distinct from r.content_sha256 then return jsonb_build_object('ok', false, 'reason', 'content_changed'); end if;
  if p_consent is not true then return jsonb_build_object('ok', false, 'reason', 'consent_required'); end if;
  if not public._smart_form_png_ok(p_png) then return jsonb_build_object('ok', false, 'reason', 'bad_signature_image'); end if;

  for s in select * from jsonb_array_elements(r.signers) loop
    if s->>'role' = x.v_role then
      if s->>'status' = 'signed' then return jsonb_build_object('ok', true, 'alreadySigned', true); end if;
      s := s || jsonb_build_object('status', 'signed', 'signedAt', now(), 'method', 'remote_link');
    end if;
    v_signers := v_signers || jsonb_build_array(s);
  end loop;

  update public.smart_form_revisions
     set signers = v_signers,
         signatures = signatures || jsonb_build_object(x.v_role, jsonb_build_object('png', p_png, 'signedAt', now(), 'method', 'remote_link')),
         sign_tokens = sign_tokens - x.v_role
   where id = r.id;
  perform public._smart_form_event(f.id, f.user_id, r.revision, x.v_role, 'signature_captured',
    jsonb_build_object('role', x.v_role, 'method', 'remote_link', 'contentSha256', r.content_sha256));
  v_all := public._smart_form_after_signature(r.id);
  perform public._smart_form_sync_step(f.id);
  return jsonb_build_object('ok', true, 'allSigned', v_all);
end;
$$;

-- ── 10 · הקובץ החתום ─────────────────────────────────────────────────────────
create or replace function public.smart_form_attach_signed_pdf(p_filing_id text, p_revision int, p_document_id text, p_pdf_sha256 text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  f public.smart_form_filings%rowtype := public._smart_form_owned(p_filing_id);
  r public.smart_form_revisions%rowtype;
begin
  if f.id is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select * into r from public.smart_form_revisions where filing_id = f.id and revision = p_revision for update;
  if r.id is null or r.state <> 'signed' then return jsonb_build_object('ok', false, 'error', 'not_signed'); end if;
  if r.signed_document_id is not null and r.signed_document_id <> p_document_id then
    return jsonb_build_object('ok', false, 'error', 'already_attached');
  end if;
  -- אותו קובץ ואותה טביעה — כבר נרשם; אין אירוע כפול.
  if r.signed_document_id = p_document_id and r.signed_pdf_sha256 = p_pdf_sha256 then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;
  -- ‼ קובץ חתום לא מוחלף בשקט בטביעה אחרת.
  if r.signed_document_id = p_document_id and r.signed_pdf_sha256 is distinct from p_pdf_sha256 then
    return jsonb_build_object('ok', false, 'error', 'hash_mismatch');
  end if;
  if p_pdf_sha256 !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'bad_hash'); end if;
  if not exists (select 1 from public.documents d where d.id = p_document_id and d.user_id = f.user_id and d.client_id = f.client_id) then
    return jsonb_build_object('ok', false, 'error', 'document_not_found');
  end if;
  update public.smart_form_revisions set signed_document_id = p_document_id, signed_pdf_sha256 = p_pdf_sha256 where id = r.id;
  update public.smart_form_filings set updated_at = now() where id = f.id;
  perform public._smart_form_event(f.id, f.user_id, r.revision, 'office', 'signed_pdf_stored',
    jsonb_build_object('documentId', p_document_id, 'sha256', p_pdf_sha256));
  perform public._smart_form_sync_step(f.id);
  return jsonb_build_object('ok', true);
end;
$$;

-- ── 11 · אסמכתאות תומכות ────────────────────────────────────────────────────
create or replace function public.smart_form_set_attachments(p_filing_id text, p_attachments jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  f public.smart_form_filings%rowtype := public._smart_form_owned(p_filing_id);
  a jsonb;
  v_new jsonb;
begin
  if f.id is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if f.state in ('submitted', 'info_requested', 'result_received', 'closed', 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'not_editable');
  end if;
  if jsonb_typeof(p_attachments) is distinct from 'array' then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  for a in select * from jsonb_array_elements(p_attachments) loop
    if coalesce(a->>'key', '') = '' or coalesce(a->>'label', '') = '' then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
    if a->>'documentId' is not null and not exists (
      select 1 from public.documents d where d.id = a->>'documentId' and d.user_id = f.user_id and d.client_id = f.client_id) then
      return jsonb_build_object('ok', false, 'error', 'document_not_found');
    end if;
  end loop;
  -- ‼ אסמכתא שננעלה כחובה (lockedRequirement) אינה יורדת מהרשימה ואינה הופכת
  -- לרשות מכאן — אחרת «הוגש» היה נפתח בלי האסמכתא שהכללים דרשו.
  if exists (select 1 from jsonb_array_elements(f.attachments) cur
              where coalesce((cur->>'lockedRequirement')::boolean, false)
                and not exists (select 1 from jsonb_array_elements(p_attachments) n where n->>'key' = cur->>'key')) then
    return jsonb_build_object('ok', false, 'error', 'required_attachment_locked');
  end if;
  select coalesce(jsonb_agg(case
           when exists (select 1 from jsonb_array_elements(f.attachments) cur
                         where cur->>'key' = n->>'key' and coalesce((cur->>'lockedRequirement')::boolean, false))
             then n || jsonb_build_object('required', true, 'lockedRequirement', true)
           else n - 'lockedRequirement' end), '[]'::jsonb)
    into v_new from jsonb_array_elements(p_attachments) n;
  update public.smart_form_filings set attachments = v_new, updated_at = now() where id = f.id;
  perform public._smart_form_event(f.id, f.user_id, f.current_revision, 'office', 'attachments_updated',
    jsonb_build_object('count', jsonb_array_length(p_attachments)));
  return jsonb_build_object('ok', true);
end;
$$;

-- ── 12 · מעברי מצב אחרי החתימה (עם ראיה) ───────────────────────────────────
create or replace function public.smart_form_advance(p_filing_id text, p_action text, p_detail jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  f public.smart_form_filings%rowtype := public._smart_form_owned(p_filing_id);
  r public.smart_form_revisions%rowtype;
  d jsonb := coalesce(p_detail, '{}'::jsonb);
  v_to text;
  v_patch jsonb := '{}'::jsonb;
  v_res jsonb;
  v_missing_attach int;
begin
  if f.id is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select * into r from public.smart_form_revisions where filing_id = f.id and revision = f.current_revision;

  case p_action
    when 'wait_client_info' then
      if f.state not in ('draft', 'review') then return jsonb_build_object('ok', false, 'error', 'bad_transition'); end if;
      if jsonb_typeof(d->'keys') <> 'array' or jsonb_array_length(d->'keys') = 0 then return jsonb_build_object('ok', false, 'error', 'keys_required'); end if;
      v_to := 'waiting_client_info';
      update public.smart_form_filings set missing_info = jsonb_build_object('keys', d->'keys', 'note', d->>'note', 'requestedAt', now()) where id = f.id;
    when 'info_received' then
      if f.state <> 'waiting_client_info' then return jsonb_build_object('ok', false, 'error', 'bad_transition'); end if;
      v_to := 'draft';
    when 'to_review' then
      if f.state not in ('draft', 'waiting_client_info') then return jsonb_build_object('ok', false, 'error', 'bad_transition'); end if;
      v_to := 'review';
    when 'back_to_draft' then
      if f.state not in ('review', 'waiting_client_info') then return jsonb_build_object('ok', false, 'error', 'bad_transition'); end if;
      v_to := 'draft';
    when 'handoff_to_client' then
      -- הלקוח מגיש בעצמו באזור האישי (למייצג אין גישה לשם). ‼ לא «הוגש».
      if f.state <> 'signed' or r.signed_document_id is null then return jsonb_build_object('ok', false, 'error', 'not_ready'); end if;
      v_to := 'awaiting_client_submission';
      v_patch := jsonb_build_object('channel', 'client_personal_area', 'handedOffAt', now(), 'note', d->>'note');
      update public.smart_form_filings set submission = v_patch where id = f.id;
    when 'record_submission' then
      if f.state not in ('signed', 'awaiting_client_submission') or r.signed_document_id is null then
        return jsonb_build_object('ok', false, 'error', 'not_ready');
      end if;
      select count(*) into v_missing_attach from jsonb_array_elements(f.attachments) a
       where coalesce((a->>'required')::boolean, false) and a->>'documentId' is null;
      if v_missing_attach > 0 then return jsonb_build_object('ok', false, 'error', 'attachments_missing', 'count', v_missing_attach); end if;
      if coalesce(d->>'channel', '') not in ('representatives_portal', 'client_personal_area', 'branch', 'mail', 'fax', 'online_form') then
        return jsonb_build_object('ok', false, 'error', 'channel_required');
      end if;
      if coalesce(d->>'submittedAt', '') = '' then return jsonb_build_object('ok', false, 'error', 'date_required'); end if;
      -- ‼ פעולה של הלקוח באזור האישי אינה «הוגשה» בלי ראיה.
      if d->>'channel' = 'client_personal_area' and coalesce(d->>'reference', '') = '' and d->>'evidenceDocumentId' is null then
        return jsonb_build_object('ok', false, 'error', 'evidence_required');
      end if;
      v_to := 'submitted';
      update public.smart_form_filings set submission = coalesce(submission, '{}'::jsonb) || jsonb_build_object(
        'channel', d->>'channel', 'submittedAt', d->>'submittedAt', 'reference', nullif(d->>'reference', ''),
        'evidenceDocumentId', d->>'evidenceDocumentId', 'recordedAt', now(), 'recordedBy', auth.uid(),
        'documentId', r.signed_document_id, 'revision', r.revision) where id = f.id;
    when 'record_info_request' then
      if f.state <> 'submitted' then return jsonb_build_object('ok', false, 'error', 'bad_transition'); end if;
      if coalesce(d->>'note', '') = '' then return jsonb_build_object('ok', false, 'error', 'note_required'); end if;
      v_to := 'info_requested';
      update public.smart_form_filings set outcome = jsonb_build_object('infoRequest', jsonb_build_object('note', d->>'note', 'receivedAt', coalesce(d->>'receivedAt', now()::text))) where id = f.id;
    when 'info_provided' then
      if f.state <> 'info_requested' then return jsonb_build_object('ok', false, 'error', 'bad_transition'); end if;
      v_to := 'submitted';
      update public.smart_form_filings set outcome = coalesce(outcome, '{}'::jsonb) || jsonb_build_object('infoProvidedAt', now(), 'infoProvidedNote', d->>'note') where id = f.id;
    when 'record_result' then
      if f.state not in ('submitted', 'info_requested') then return jsonb_build_object('ok', false, 'error', 'bad_transition'); end if;
      if coalesce(d->>'status', '') not in ('approved', 'rejected', 'partial') then return jsonb_build_object('ok', false, 'error', 'status_required'); end if;
      if coalesce(d->>'summary', '') = '' then return jsonb_build_object('ok', false, 'error', 'summary_required'); end if;
      -- ‼ תוצאה רשמית רק עם ראיה: מסמך, אסמכתא, או קריאה מב"ל שמראה אותה.
      if d->>'evidenceDocumentId' is null and coalesce(d->>'reference', '') = '' and coalesce(d->>'btlSyncAt', '') = '' then
        return jsonb_build_object('ok', false, 'error', 'evidence_required');
      end if;
      if d->>'evidenceDocumentId' is not null and not exists (
        select 1 from public.documents x where x.id = d->>'evidenceDocumentId' and x.user_id = f.user_id and x.client_id = f.client_id) then
        return jsonb_build_object('ok', false, 'error', 'document_not_found');
      end if;
      v_to := 'result_received';
      update public.smart_form_filings set outcome = coalesce(outcome, '{}'::jsonb) || jsonb_build_object(
        'status', d->>'status', 'summary', d->>'summary', 'receivedAt', coalesce(d->>'receivedAt', now()::text),
        'evidenceDocumentId', d->>'evidenceDocumentId', 'reference', nullif(d->>'reference', ''),
        'btlSyncAt', nullif(d->>'btlSyncAt', ''), 'recordedAt', now(), 'recordedBy', auth.uid()) where id = f.id;
    when 'close' then
      if f.state <> 'result_received' then return jsonb_build_object('ok', false, 'error', 'bad_transition'); end if;
      v_to := 'closed';
      if coalesce(d->>'followUp', 'none') <> 'none' then
        if d->>'followUp' not in ('reserve_duty_claim', 'refund_check', 'other') then return jsonb_build_object('ok', false, 'error', 'bad_follow_up'); end if;
        -- ‼ בן עם מחזור משלו (יסודות §6). כשהלקוח פועל באזור האישי — טיוטה בדף שלו
        -- (המשרד מפרסם בעצמו), וסגירה רק עם ראיה שהלקוח מעלה.
        v_res := public.create_onboarding_request(
          f.client_id, 'custom_request',
          case when d->>'followUpOwner' = 'client' then jsonb_build_object(
                 'title', coalesce(nullif(d->>'followUpTitle', ''), 'מעקב אחרי שינוי הסיווג בביטוח לאומי'),
                 'clientTitle', coalesce(nullif(d->>'followUpTitle', ''), 'פעולה באזור האישי בביטוח לאומי'),
                 'clientSub', coalesce(d->>'followUpNote', ''),
                 'requirements', jsonb_build_array(jsonb_build_object('key', 'evidence', 'kind', 'file', 'label', 'צילום מסך או אישור מהאזור האישי שהפעולה בוצעה', 'required', true)),
                 'smartFormParent', f.id)
               else jsonb_build_object(
                 'title', coalesce(nullif(d->>'followUpTitle', ''), 'מעקב אחרי שינוי הסיווג בביטוח לאומי'),
                 'message', coalesce(d->>'followUpNote', ''), 'requirements', '[]'::jsonb, 'smartFormParent', f.id) end,
          nullif(d->>'followUpDue', '')::date, null,
          coalesce(d->>'followUpOwner', 'me') <> 'client', false,
          case when d->>'followUpOwner' = 'client' then 'client' else 'me' end, null);
        if not coalesce((v_res->>'ok')::boolean, false) then
          return jsonb_build_object('ok', false, 'error', 'follow_up_failed', 'detail', v_res->>'error');
        end if;
        update public.smart_form_filings set follow_up = jsonb_build_object(
          'kind', d->>'followUp', 'owner', coalesce(d->>'followUpOwner', 'me'), 'stepId', v_res->>'stepId',
          'title', d->>'followUpTitle', 'createdAt', now()) where id = f.id;
      end if;
    when 'cancel' then
      if f.state in ('closed', 'cancelled') then return jsonb_build_object('ok', false, 'error', 'bad_transition'); end if;
      if f.state in ('submitted', 'info_requested', 'result_received') then return jsonb_build_object('ok', false, 'error', 'submitted_cannot_cancel'); end if;
      if coalesce(d->>'reason', '') = '' then return jsonb_build_object('ok', false, 'error', 'reason_required'); end if;
      v_to := 'cancelled';
      update public.smart_form_revisions set sign_tokens = '{}'::jsonb where filing_id = f.id;
    else
      return jsonb_build_object('ok', false, 'error', 'unknown_action');
  end case;

  update public.smart_form_filings
     set state = v_to, updated_at = now(),
         closed_at = case when v_to in ('closed', 'cancelled') then now() else closed_at end
   where id = f.id;
  perform public._smart_form_event(f.id, f.user_id, f.current_revision, 'office', p_action,
    (d - 'png') || jsonb_build_object('from', f.state, 'to', v_to));
  perform public._smart_form_sync_step(f.id);
  return jsonb_build_object('ok', true, 'state', v_to, 'followUpStepId', v_res->>'stepId');
end;
$$;

-- ── 13 · עדכון הכרטיס מההגשה — רק בהסכמה, רק שדות מוגדרים, עם ערך צפוי ──────
create or replace function public.smart_form_apply_profile_updates(p_filing_id text, p_updates jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  f public.smart_form_filings%rowtype := public._smart_form_owned(p_filing_id);
  c public.clients%rowtype;
  u jsonb;
  v_key text;
  v_cur jsonb;
  v_new jsonb;
  v_meta jsonb := '{}'::jsonb;
  v_biz jsonb;
  v_done jsonb := '[]'::jsonb;
  v_idx int;
begin
  if f.id is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if jsonb_typeof(p_updates) <> 'array' then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  select * into c from public.clients where id = f.client_id for update;

  for u in select * from jsonb_array_elements(p_updates) loop
    v_key := u->>'key';
    if not (u ? 'value') then return jsonb_build_object('ok', false, 'error', 'value_required', 'key', v_key); end if;
    v_new := u->'value';
    v_biz := null;
    case v_key
      when 'zipCode' then v_cur := to_jsonb(c.zip_code);
      when 'landlinePhone' then v_cur := to_jsonb(c.landline_phone);
      when 'mailingAddress' then v_cur := coalesce(c.mailing_address, 'null'::jsonb);
      when 'businessAddress' then
        select (ord - 1)::int, b into v_idx, v_biz from jsonb_array_elements(coalesce(c.businesses, '[]'::jsonb)) with ordinality e(b, ord)
         where b->>'id' = u->>'businessId';
        if v_biz is null then return jsonb_build_object('ok', false, 'error', 'business_not_found'); end if;
        v_cur := coalesce(v_biz->'address', 'null'::jsonb);
      else return jsonb_build_object('ok', false, 'error', 'field_not_allowed', 'key', v_key);
    end case;
    v_cur := coalesce(v_cur, 'null'::jsonb);
    -- ‼ לא דורסים בשקט: הערך שהמסך ראה חייב להיות הערך שבכרטיס עכשיו.
    if v_cur is distinct from coalesce(u->'expected', 'null'::jsonb) then
      return jsonb_build_object('ok', false, 'error', 'stale', 'key', v_key, 'current', v_cur);
    end if;
    if v_key = 'zipCode' and v_new <> 'null'::jsonb and (jsonb_typeof(v_new) <> 'string' or v_new #>> '{}' !~ '^\d{5}(\d{2})?$') then
      return jsonb_build_object('ok', false, 'error', 'bad_zip');
    end if;
    if v_key = 'landlinePhone' and v_new <> 'null'::jsonb and jsonb_typeof(v_new) <> 'string' then
      return jsonb_build_object('ok', false, 'error', 'bad_phone');
    end if;
    if v_key in ('mailingAddress', 'businessAddress') and v_new <> 'null'::jsonb and jsonb_typeof(v_new) <> 'object' then
      return jsonb_build_object('ok', false, 'error', 'bad_address');
    end if;

    case v_key
      when 'zipCode' then update public.clients set zip_code = nullif(v_new #>> '{}', '') where id = c.id;
      when 'landlinePhone' then update public.clients set landline_phone = nullif(v_new #>> '{}', '') where id = c.id;
      when 'mailingAddress' then update public.clients set mailing_address = nullif(v_new, 'null'::jsonb) where id = c.id;
      when 'businessAddress' then
        update public.clients set businesses = jsonb_set(businesses, array[v_idx::text, 'address'], coalesce(v_new, 'null'::jsonb)) where id = c.id;
    end case;
    v_meta := v_meta || jsonb_build_object(case when v_key = 'businessAddress' then 'businesses' else v_key end,
                        jsonb_build_object('source', 'manual', 'syncedAt', now(), 'via', 'btl-6101'));
    v_done := v_done || jsonb_build_array(v_key);
    perform public._smart_form_event(f.id, f.user_id, f.current_revision, 'office', 'profile_updated',
      jsonb_build_object('key', v_key, 'from', v_cur, 'to', v_new, 'businessId', u->>'businessId'));
    select * into c from public.clients where id = f.client_id;
  end loop;

  update public.clients set field_meta = coalesce(field_meta, '{}'::jsonb) || v_meta where id = c.id;
  return jsonb_build_object('ok', true, 'updated', v_done,
    'client', (select to_jsonb(x) from public.clients x where x.id = c.id));
end;
$$;

-- ── 14 · הרשאות ─────────────────────────────────────────────────────────────
do $$
declare fn text;
begin
  foreach fn in array array[
    'public._smart_form_template(text)',
    'public._smart_form_event(text, uuid, int, text, text, jsonb)',
    'public._smart_form_png_ok(text)',
    'public._smart_form_sync_step(text)',
    'public._smart_form_owned(text)',
    'public._smart_form_after_signature(text)',
    'public._smart_form_by_token(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.smart_form_start(text, text, text, text[])',
    'public.smart_form_save(text, int, text[], jsonb, jsonb)',
    'public.smart_form_new_revision(text, text)',
    'public.smart_form_lock(text, int, jsonb, jsonb)',
    'public.smart_form_capture_signature(text, int, text, text, text, text)',
    'public.smart_form_issue_sign_link(text, int, text, int)',
    'public.smart_form_attach_signed_pdf(text, int, text, text)',
    'public.smart_form_set_attachments(text, jsonb)',
    'public.smart_form_advance(text, text, jsonb)',
    'public.smart_form_apply_profile_updates(text, jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
  -- הדף הציבורי של החותם: טוקן בלבד.
  foreach fn in array array[
    'public.get_smart_form_signing(text)',
    'public.submit_smart_form_signature(text, text, text, boolean)'
  ] loop
    execute format('revoke execute on function %s from public', fn);
    execute format('grant execute on function %s to anon, authenticated, service_role', fn);
  end loop;
end $$;

-- ── 15 · רשימת anon המותרת — שתי הפונקציות של דף החתימה ────────────────────
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
    'get_smart_form_signing', 'submit_smart_form_signature'
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
