-- ════════════════════════════════════════════════════════════════════════════
-- 210 · טפסים חכמים — עריכת המיפוי מהמסך, כגרסאות
-- ════════════════════════════════════════════════════════════════════════════
--
-- עד כאן המיפוי (איפה כל שדה יושב על ה-PDF) חי רק בקוד (template.ts, «מיפוי 2»).
-- מכאן אפשר לערוך אותו מ«מסמכים ללקוחות» ← התבנית ← «טופס»:
--
--   smart_form_mappings   גרסת מיפוי = תיקוני גיאומטריה (מלבן, קו כתיבה, תאי ספרות)
--                         לכל שדה, **ביחס לבסיס שבקוד** (code_base). טיוטה אחת לכל
--                         תבנית; פרסום ⇒ הגרסה הפעילה; הקודמת ⇒ «הוחלפה».
--
-- ‼ הגרסה הפעילה היא מה ש-_smart_form_template מחזירה כ-mappingVersion — ולכן כל
--   ההגנות של 209 עובדות בלי שינוי: טיוטות מקבלות אותה, נעילה רושמת אותה, וגרסה
--   שננעלה במיפוי אחר לא נחתמת ולא נשמרת. פרסום = גרסה שננעלה לפני כן צריכה הכנה מחדש.
-- ‼ פרסום מותר רק עם בדיקת יישור שעברה **על אותה טיוטה בדיוק** (updated_at של הטיוטה
--   נכלל בתוצאת הבדיקה; עריכה אחרי הבדיקה ⇒ הפרסום נדחה). הבדיקה עצמה רצה בדפדפן
--   (רינדור PDF) — השרת לא מצייר; הוא אוכף שהיא נעשתה ונשמרת עם הגרסה.
-- ‼ דף החתימה הציבורי מקבל את תיקוני הגרסה *של הגרסה שנחתמת* — מצייר בדיוק אותה.

create table if not exists public.smart_form_mappings (
  template_key   text not null,
  version        int  not null check (version > 2),
  code_base      int  not null default 2,
  status         text not null check (status in ('draft', 'published', 'retired')),
  base_version   int  not null,
  fields         jsonb not null default '{}'::jsonb,
  note           text,
  audit          jsonb,
  created_by     uuid not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  published_by   uuid,
  published_at   timestamptz,
  primary key (template_key, version)
);
create unique index if not exists smart_form_mappings_one_draft on public.smart_form_mappings (template_key) where status = 'draft';

comment on table public.smart_form_mappings is
  '210 · גרסאות מיפוי של טפסים חכמים (תיקוני גיאומטריה ביחס לבסיס שבקוד). כתיבה רק דרך RPC; פרסום רק עם בדיקת יישור.';

alter table public.smart_form_mappings enable row level security;
drop policy if exists smart_form_mappings_select on public.smart_form_mappings;
create policy smart_form_mappings_select on public.smart_form_mappings for select to authenticated using (true);
drop policy if exists require_authorized on public.smart_form_mappings;
create policy require_authorized on public.smart_form_mappings as restrictive for all to authenticated
  using (public.is_authorized()) with check (public.is_authorized());
revoke all on public.smart_form_mappings from anon;
grant select on public.smart_form_mappings to authenticated;

-- ── הרשם: הגרסה הפעילה = הגרסה המפורסמת האחרונה (או בסיס הקוד) ─────────────
create or replace function public._smart_form_template(p_key text)
returns jsonb language sql stable set search_path to 'public' as $$
  select case p_key
    when 'btl-6101' then jsonb_build_object(
      'version', '06.2026',
      'sha256', '79e4f387e851cf1a8218c52c4991321e9daae39f3c02f235aeaa3287c3d93754',
      'mappingVersion', coalesce((select max(m.version) from public.smart_form_mappings m
                                   where m.template_key = p_key and m.status = 'published'), 2),
      'codeBase', 2,
      'title', 'דין וחשבון רב שנתי (6101) · ביטוח לאומי',
      'purposes', jsonb_build_array('multi_year_report', 'start', 'change', 'end', 'stop_employees', 'spouse_in_business', 'update_details'))
    else null end;
$$;

/** תיקוני הגרסה (ריק לבסיס הקוד). */
create or replace function public._smart_form_mapping_fields(p_key text, p_version int)
returns jsonb language sql stable set search_path to 'public' as $$
  select coalesce((select m.fields from public.smart_form_mappings m
                    where m.template_key = p_key and m.version = p_version and m.status in ('published', 'retired')),
                  '{}'::jsonb);
$$;

/** צורה תקינה של תיקוני שדות: מזהה שדה ⇒ {box, line, cells, baseline} בתוך העמוד. */
create or replace function public._smart_form_mapping_valid(p_fields jsonb)
returns boolean language plpgsql immutable set search_path to 'public' as $$
declare k text; v jsonb; b jsonb; c jsonb; prev numeric; x numeric;
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(p_fields)) > 400 then return false; end if;
  for k, v in select * from jsonb_each(p_fields) loop
    if k !~ '^p[1-9]\.[A-Za-z0-9_.]{1,80}$' or jsonb_typeof(v) <> 'object' then return false; end if;
    if exists (select 1 from jsonb_object_keys(v) kk where kk not in ('box', 'line', 'cells', 'baseline')) then return false; end if;
    b := v->'box';
    if b is not null then
      if jsonb_typeof(b) <> 'object'
         or jsonb_typeof(b->'x') <> 'number' or jsonb_typeof(b->'y') <> 'number'
         or jsonb_typeof(b->'w') <> 'number' or jsonb_typeof(b->'h') <> 'number' then return false; end if;
      if (b->>'x')::numeric < 0 or (b->>'y')::numeric < 0 or (b->>'w')::numeric < 1 or (b->>'h')::numeric < 1
         or (b->>'x')::numeric + (b->>'w')::numeric > 612 or (b->>'y')::numeric + (b->>'h')::numeric > 792 then return false; end if;
    end if;
    -- ‼ CASE ולא NOT על jsonb_typeof: מפתח חסר מחזיר NULL, ו-NOT NULL נופל בשקט ל-else
    -- ‼ ה-CASE בסוגריים: בלי סוגריים ה-THEN שלו נקרא כסוף תנאי ה-IF
    if v ? 'line' and (case jsonb_typeof(v->'line') when 'number' then (v->>'line')::numeric not between 0 and 792 when 'null' then false else true end) then return false; end if;
    if v ? 'baseline' and (case jsonb_typeof(v->'baseline') when 'number' then (v->>'baseline')::numeric not between 0 and 792 when 'null' then false else true end) then return false; end if;
    c := v->'cells';
    if c is not null then
      if jsonb_typeof(c) <> 'array' or jsonb_array_length(c) < 2 or jsonb_array_length(c) > 40 then return false; end if;
      prev := null;
      for x in select (e #>> '{}')::numeric from jsonb_array_elements(c) e loop
        if x < 0 or x > 612 or (prev is not null and x <= prev) then return false; end if;
        prev := x;
      end loop;
    end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

-- ── קריאה: הפעילה + הטיוטה + ההיסטוריה ─────────────────────────────────────
create or replace function public.get_smart_form_mapping(p_template_key text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare t jsonb := public._smart_form_template(p_template_key); v_active int; d public.smart_form_mappings%rowtype;
begin
  if auth.uid() is null or not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if t is null then return jsonb_build_object('ok', false, 'error', 'unknown_template'); end if;
  v_active := (t->>'mappingVersion')::int;
  select * into d from public.smart_form_mappings where template_key = p_template_key and status = 'draft';
  return jsonb_build_object('ok', true,
    'codeBase', (t->>'codeBase')::int,
    'active', jsonb_build_object('version', v_active, 'fields', public._smart_form_mapping_fields(p_template_key, v_active),
      'publishedAt', (select published_at from public.smart_form_mappings where template_key = p_template_key and version = v_active)),
    'draft', case when d.version is null then null else jsonb_build_object(
      'version', d.version, 'baseVersion', d.base_version, 'fields', d.fields, 'updatedAt', d.updated_at, 'note', d.note) end,
    'history', coalesce((select jsonb_agg(jsonb_build_object('version', m.version, 'status', m.status, 'publishedAt', m.published_at,
                           'note', m.note, 'checked', m.audit->'summary') order by m.version desc)
                         from public.smart_form_mappings m where m.template_key = p_template_key and m.status <> 'draft'), '[]'::jsonb));
end;
$$;

-- ── טיוטה: פתיחה (מהפעילה), שמירה, ביטול ───────────────────────────────────
create or replace function public.smart_form_mapping_draft_start(p_template_key text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare t jsonb := public._smart_form_template(p_template_key); v_active int; d public.smart_form_mappings%rowtype; v_next int;
begin
  if auth.uid() is null or not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if t is null then return jsonb_build_object('ok', false, 'error', 'unknown_template'); end if;
  select * into d from public.smart_form_mappings where template_key = p_template_key and status = 'draft' for update;
  if d.version is not null then
    return jsonb_build_object('ok', true, 'existing', true, 'version', d.version, 'fields', d.fields, 'updatedAt', d.updated_at, 'baseVersion', d.base_version);
  end if;
  v_active := (t->>'mappingVersion')::int;
  select greatest(coalesce(max(version), 2), v_active) + 1 into v_next from public.smart_form_mappings where template_key = p_template_key;
  insert into public.smart_form_mappings (template_key, version, status, base_version, fields, created_by)
  values (p_template_key, v_next, 'draft', v_active, public._smart_form_mapping_fields(p_template_key, v_active), auth.uid())
  returning * into d;
  return jsonb_build_object('ok', true, 'existing', false, 'version', d.version, 'fields', d.fields, 'updatedAt', d.updated_at, 'baseVersion', d.base_version);
end;
$$;

create or replace function public.smart_form_mapping_draft_save(p_template_key text, p_version int, p_fields jsonb, p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare d public.smart_form_mappings%rowtype;
begin
  if auth.uid() is null or not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select * into d from public.smart_form_mappings where template_key = p_template_key and version = p_version for update;
  if d.version is null or d.status <> 'draft' then return jsonb_build_object('ok', false, 'error', 'not_draft'); end if;
  -- ‼ שמירה על בסיס ישן (לשונית אחרת שמרה בינתיים) — לא דורסים בשקט
  if p_expected_updated_at is distinct from d.updated_at then return jsonb_build_object('ok', false, 'error', 'stale', 'updatedAt', d.updated_at); end if;
  if not public._smart_form_mapping_valid(p_fields) then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  update public.smart_form_mappings set fields = p_fields, updated_at = clock_timestamp(), audit = null
   where template_key = p_template_key and version = p_version returning * into d;
  return jsonb_build_object('ok', true, 'updatedAt', d.updated_at);
end;
$$;

create or replace function public.smart_form_mapping_draft_discard(p_template_key text, p_version int)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  delete from public.smart_form_mappings where template_key = p_template_key and version = p_version and status = 'draft';
  if not found then return jsonb_build_object('ok', false, 'error', 'not_draft'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── פרסום: רק עם בדיקת יישור שעברה על הטיוטה הזו בדיוק ──────────────────────
create or replace function public.smart_form_mapping_publish(p_template_key text, p_version int, p_audit jsonb, p_note text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare d public.smart_form_mappings%rowtype;
begin
  if auth.uid() is null or not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select * into d from public.smart_form_mappings where template_key = p_template_key and version = p_version for update;
  if d.version is null or d.status <> 'draft' then return jsonb_build_object('ok', false, 'error', 'not_draft'); end if;
  if p_audit is null or jsonb_typeof(p_audit) <> 'object'
     or (p_audit->>'passed') is distinct from 'true'
     or (p_audit->>'version') is distinct from p_version::text then
    return jsonb_build_object('ok', false, 'error', 'audit_required');
  end if;
  -- ‼ הבדיקה נעשתה על מצב הטיוטה הנוכחי — עריכה אחריה מבטלת אותה
  if (p_audit->>'draftUpdatedAt')::timestamptz is distinct from d.updated_at then
    return jsonb_build_object('ok', false, 'error', 'audit_stale');
  end if;
  update public.smart_form_mappings set status = 'retired'
   where template_key = p_template_key and status = 'published';
  update public.smart_form_mappings
     set status = 'published', audit = p_audit, note = nullif(trim(coalesce(p_note, '')), ''),
         published_by = auth.uid(), published_at = clock_timestamp()
   where template_key = p_template_key and version = p_version;
  return jsonb_build_object('ok', true, 'version', p_version);
end;
$$;

-- ── דף החתימה הציבורי: מקבל את תיקוני הגרסה שנחתמת (מ-206, בתוספת mapping) ────
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
    -- 210: הגיאומטריה של הגרסה שנחתמת, והגרסה הפעילה (השונה ממנה ⇒ החתימה תיחסם בשרת)
    'mapping', public._smart_form_mapping_fields((x.r).template_key, (x.r).mapping_version),
    'activeMappingVersion', (public._smart_form_template((x.r).template_key)->>'mappingVersion')::int,
    'purposes', to_jsonb((x.r).purposes),
    'data', (x.r).snapshot->'data',
    'contentSha256', (x.r).content_sha256,
    'otherSignatures', (select coalesce(jsonb_object_agg(k, v->'png'), '{}'::jsonb) from jsonb_each((x.r).signatures) sg(k, v) where k <> x.v_role),
    'clientSignedAt', (select e->>'signedAt' from jsonb_array_elements((x.r).signers) e where e->>'role' = 'client' and e->>'status' = 'signed'));
end;
$$;

revoke all on function public._smart_form_template(text) from public, anon, authenticated;
revoke all on function public._smart_form_mapping_fields(text, int) from public, anon, authenticated;
revoke all on function public._smart_form_mapping_valid(jsonb) from public, anon, authenticated;
revoke all on function public.get_smart_form_mapping(text) from public, anon;
revoke all on function public.smart_form_mapping_draft_start(text) from public, anon;
revoke all on function public.smart_form_mapping_draft_save(text, int, jsonb, timestamptz) from public, anon;
revoke all on function public.smart_form_mapping_draft_discard(text, int) from public, anon;
revoke all on function public.smart_form_mapping_publish(text, int, jsonb, text) from public, anon;
grant execute on function public.get_smart_form_mapping(text) to authenticated, service_role;
grant execute on function public.smart_form_mapping_draft_start(text) to authenticated, service_role;
grant execute on function public.smart_form_mapping_draft_save(text, int, jsonb, timestamptz) to authenticated, service_role;
grant execute on function public.smart_form_mapping_draft_discard(text, int) to authenticated, service_role;
grant execute on function public.smart_form_mapping_publish(text, int, jsonb, text) to authenticated, service_role;
revoke all on function public.get_smart_form_signing(text) from public;
grant execute on function public.get_smart_form_signing(text) to anon, authenticated, service_role;

select public.assert_domain_function_invariants();
