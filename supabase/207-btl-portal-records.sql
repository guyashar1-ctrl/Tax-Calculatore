-- ════════════════════════════════════════════════════════════════════════════
-- 207 · מה ביטוח לאומי רושם — עובדות, מסמכים, וראיית קליטה לטופס 6101
-- ════════════════════════════════════════════════════════════════════════════
--
-- ‼ שלוש הכרעות:
--   1. **נשמר מה שנצפה, לא מה שמשנה את הכרטיס.** קריאת «עדכן נתונים מביטוח לאומי»
--      (btl.sync_file) נשמרת כאן אוטומטית, בטריגר על המשימה שהצליחה — כעובדות
--      «רשום בב"ל» עם מקור, מסך, מועד קריאה ראשון/אחרון והמשימה שקראה. **שום ערך
--      בכרטיס לא נדרס** (מצב משפחתי בכרטיס נשאר של הכרטיס; סתירה מוצגת לבדיקה).
--   2. **היסטוריה רק כשמשהו השתנה.** ערך זהה ⇒ מתעדכן «נקרא לאחרונה»; ערך אחר ⇒
--      שורה חדשה. כך «חובת תשלום» שהשתנתה נראית עם «מאז» ו«קודם».
--   3. **כשל של מקטע אינו «אין».** מקטע שלא נקרא לא נוגע בשום דבר; הערך האחרון
--      שאומת נשאר, עם מועד הקריאה שלו.
--
-- ‼ ראיית קליטה ל-6101: «דין וחשבון» בתיק המסמכים של ב"ל אינו מזהה הגשה מסוימת
-- (אין אסמכתא, והתיאור כללי) — ולכן **אין סימון אוטומטי**. השרת מציע מועמדים
-- (אחרי מועד ההגשה), הרו"ח מאשר, והראיה נשמרת על ההגשה כפי שהייתה באישור.
--
-- נצפה חי ב-28.09.2026 (קריאה בלבד, פלט ממוסך) — ראה docs/PLAN-BTL-6101-SMART-FORM.md §9.

-- ── 1 · טבלאות ─────────────────────────────────────────────────────────────

create table if not exists public.btl_portal_facts (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  client_id     text not null references public.clients(id) on delete cascade,
  person_role   text not null check (person_role in ('client', 'spouse')),
  fact_key      text not null check (fact_key in (
                  'familyStatus', 'residency', 'paymentObligation', 'coverage', 'enforcement',
                  'paymentArrangement', 'collectionAudit', 'withholdingFile',
                  'representation', 'debitMethod', 'notices', 'reserveDuty', 'annualContributions',
                  'correspondence', 'benefitDebt', 'documentsRead')),
  value         jsonb not null,
  source_screen text not null,
  first_seen_at timestamptz not null,
  last_seen_at  timestamptz not null,
  first_job_id  text,
  last_job_id   text
);
create index if not exists btl_portal_facts_current
  on public.btl_portal_facts (client_id, person_role, fact_key, first_seen_at desc, id desc);

comment on table public.btl_portal_facts is
  '207 · מה ב"ל רושם (נקרא בפורטל המייצגים). שורה חדשה רק כשהערך השתנה; last_seen_at = קריאה אחרונה שאישרה אותו. לא נכתב מהדפדפן.';

create table if not exists public.btl_portal_documents (
  id            text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id       uuid not null references auth.users(id) on delete cascade,
  client_id     text not null references public.clients(id) on delete cascade,
  person_role   text not null check (person_role in ('client', 'spouse')),
  description   text not null,
  doc_date      date not null,
  pages         int,
  scan_ref      text,
  first_seen_at timestamptz not null,
  last_seen_at  timestamptz not null,
  first_job_id  text,
  last_job_id   text
);
-- ‼ זהות מסמך = תיאור + תאריך + עמודים. נתיב הסריקה אומת יציב רק בתוך סשן, ולכן
-- הוא מטא-דאטה (scan_ref = טביעה, לא הנתיב) ולא חלק מהזהות.
create unique index if not exists btl_portal_documents_identity
  on public.btl_portal_documents (client_id, person_role, description, doc_date, (coalesce(pages, -1)));

comment on table public.btl_portal_documents is
  '207 · תיק המסמכים של המבוטח בב"ל (מטא-דאטה בלבד: תיאור, תאריך, עמודים). מסמך שלא הופיע בקריאה אחרונה נשאר כהיסטוריה.';

alter table public.smart_form_filings add column if not exists receipt jsonb;
comment on column public.smart_form_filings.receipt is
  '207 · ראיית קליטה בב"ל שאושרה בידי הרו"ח: המסמך מתיק המסמכים כפי שהיה באישור, כמה מועמדים היו, מי ומתי.';

alter table public.btl_portal_facts enable row level security;
alter table public.btl_portal_documents enable row level security;
do $$
declare t text;
begin
  foreach t in array array['btl_portal_facts', 'btl_portal_documents'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('create policy %I on public.%I for select to authenticated using (auth.uid() = user_id)', t || '_select_own', t);
    execute format('drop policy if exists require_authorized on public.%I', t);
    execute format('create policy require_authorized on public.%I as restrictive for all to authenticated '
                   || 'using (public.is_authorized()) with check (public.is_authorized())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ── 2 · עזרים: ניקוי ערכים (הערכים מגיעים מהעובד — מגבילים אורך, סוג וכמות) ──

create or replace function public._btl_txt(p jsonb, p_max int)
returns text language sql immutable set search_path to 'public' as $$
  select case when jsonb_typeof(p) = 'string' then nullif(left(btrim(p #>> '{}'), p_max), '') end
$$;

create or replace function public._btl_num(p jsonb)
returns numeric language sql immutable set search_path to 'public' as $$
  select case when jsonb_typeof(p) = 'number' then (p #>> '{}')::numeric end
$$;

create or replace function public._btl_date(p jsonb)
returns text language sql immutable set search_path to 'public' as $$
  select case when jsonb_typeof(p) = 'string' and (p #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$' then p #>> '{}' end
$$;

/** עובדה מריכוז המידע: {raw, code?, sinceMonth?}. raw:null = «אין» לפי ב"ל. */
create or replace function public._btl_clean_summary_fact(p_key text, v jsonb)
returns jsonb language plpgsql immutable set search_path to 'public' as $$
declare out jsonb;
begin
  if jsonb_typeof(v) is distinct from 'object' then return null; end if;
  out := jsonb_build_object('raw', public._btl_txt(v -> 'raw', 120));
  if p_key = 'familyStatus' and (v ->> 'code') in ('single', 'married', 'divorced', 'widowed', 'separated', 'common_law') then
    out := out || jsonb_build_object('code', v ->> 'code');
  end if;
  if p_key = 'coverage' and (v ->> 'sinceMonth') ~ '^\d{4}-\d{2}$' then
    out := out || jsonb_build_object('sinceMonth', v ->> 'sinceMonth');
  end if;
  return out;
end;
$$;

create or replace function public._btl_clean_list_fact(p_key text, v jsonb)
returns jsonb language plpgsql immutable set search_path to 'public' as $$
begin
  if jsonb_typeof(v) is distinct from 'object' then return null; end if;
  case p_key
    when 'notices' then
      return jsonb_build_object(
        'items', coalesce((select jsonb_agg(x order by ord) from (
          select jsonb_strip_nulls(jsonb_build_object(
                   'date', public._btl_date(e -> 'date'), 'type', public._btl_txt(e -> 'type', 120),
                   'category', e ->> 'category', 'state', public._btl_txt(e -> 'state', 60))) as x, ord
            from jsonb_array_elements(case when jsonb_typeof(v -> 'items') = 'array' then v -> 'items' else '[]'::jsonb end)
                 with ordinality as a(e, ord)
           where public._btl_date(e -> 'date') is not null and public._btl_txt(e -> 'type', 120) is not null
             and (e ->> 'category') in ('report', 'documents', 'reserve_duty', 'assessment', 'representation', 'decision', 'insured_update')
           order by ord limit 40) s), '[]'::jsonb),
        'otherCount', greatest(0, coalesce(public._btl_num(v -> 'otherCount'), 0))::int);
    when 'reserveDuty' then
      return jsonb_build_object(
        'rows', coalesce((select jsonb_agg(x order by ord) from (
          select jsonb_build_object(
                   'year', (e ->> 'year')::int, 'benefit', public._btl_txt(e -> 'benefit', 60),
                   'gross', public._btl_num(e -> 'gross'), 'taxWithheld', public._btl_num(e -> 'taxWithheld'),
                   'debtRepaymentGross', public._btl_num(e -> 'debtRepaymentGross'), 'taxRefund', public._btl_num(e -> 'taxRefund')) as x, ord
            from jsonb_array_elements(case when jsonb_typeof(v -> 'rows') = 'array' then v -> 'rows' else '[]'::jsonb end)
                 with ordinality as a(e, ord)
           where (e ->> 'year') ~ '^\d{4}$' and public._btl_txt(e -> 'benefit', 60) is not null
           order by ord limit 30) s), '[]'::jsonb),
        'otherBenefitsCount', greatest(0, coalesce(public._btl_num(v -> 'otherBenefitsCount'), 0))::int);
    when 'annualContributions' then
      return jsonb_build_object(
        'years', coalesce((select jsonb_agg(x order by ord) from (
          select jsonb_build_object(
                   'year', (e ->> 'year')::int,
                   'byAssessment', case when jsonb_typeof(e -> 'byAssessment') = 'boolean' then e -> 'byAssessment' else 'null'::jsonb end,
                   'total', public._btl_num(e -> 'total'),
                   'classes', coalesce((select jsonb_agg(jsonb_build_object(
                                 'classification', public._btl_txt(c -> 'classification', 30), 'charge', public._btl_txt(c -> 'charge', 20),
                                 'annualBase', public._btl_num(c -> 'annualBase'), 'annualContribution', public._btl_num(c -> 'annualContribution')) order by co)
                               from jsonb_array_elements(case when jsonb_typeof(e -> 'classes') = 'array' then e -> 'classes' else '[]'::jsonb end)
                                    with ordinality as cc(c, co)
                              where public._btl_txt(c -> 'classification', 30) is not null and co <= 4), '[]'::jsonb)) as x, ord
            from jsonb_array_elements(case when jsonb_typeof(v -> 'years') = 'array' then v -> 'years' else '[]'::jsonb end)
                 with ordinality as a(e, ord)
           where (e ->> 'year') ~ '^\d{4}$'
           order by ord limit 12) s), '[]'::jsonb));
    when 'correspondence', 'benefitDebt', 'documentsRead' then
      return jsonb_build_object('count', greatest(0, coalesce(public._btl_num(v -> 'count'), 0))::int);
    else return null;
  end case;
end;
$$;

/**
 * עובדה אחת: זהה לאחרונה ⇒ רק «נקרא לאחרונה»; אחרת שורה חדשה.
 * ‼ «זהה» = jsonb שווה (הסדר ברשימות קבוע — העובד ממיין).
 */
create or replace function public._btl_fact_put(
  p_user uuid, p_client text, p_role text, p_key text, p_value jsonb, p_screen text, p_job text, p_at timestamptz)
returns void language plpgsql security definer set search_path to 'public' as $$
declare cur public.btl_portal_facts%rowtype;
begin
  if p_value is null then return; end if;
  select * into cur from public.btl_portal_facts
   where client_id = p_client and person_role = p_role and fact_key = p_key
   order by first_seen_at desc, id desc limit 1 for update;
  if cur.id is not null and cur.value = p_value then
    update public.btl_portal_facts
       set last_seen_at = greatest(last_seen_at, p_at), last_job_id = p_job
     where id = cur.id;
  else
    insert into public.btl_portal_facts (user_id, client_id, person_role, fact_key, value, source_screen,
                                         first_seen_at, last_seen_at, first_job_id, last_job_id)
    values (p_user, p_client, p_role, p_key, p_value, p_screen, p_at, p_at, p_job, p_job);
  end if;
end;
$$;

-- ── 3 · קליטה מהמשימה שהצליחה ────────────────────────────────────────────

create or replace function public._btl_portal_ingest(p_job public.automation_jobs)
returns int language plpgsql security definer set search_path to 'public' as $$
declare
  v_at timestamptz := coalesce(p_job.finished_at, now());
  p jsonb; s jsonb; v_role text; k text; d jsonb;
  v_n int := 0; v_docs int;
  v_summary_keys text[] := array['familyStatus', 'residency', 'paymentObligation', 'coverage', 'enforcement',
                                 'paymentArrangement', 'collectionAudit', 'withholdingFile'];
begin
  if jsonb_typeof(p_job.result -> 'persons') is distinct from 'array' then return 0; end if;
  for p in select * from jsonb_array_elements(p_job.result -> 'persons') loop
    v_role := p ->> 'role';
    continue when v_role is null or v_role not in ('client', 'spouse');
    -- ‼ אדם שלא נפתח — אין ממנו כלום (ולא «אין»).
    continue when (p ->> 'ok') is distinct from 'true';
    s := coalesce(p -> 'sections', '{}'::jsonb);

    -- ייצוג ואמצעי חיוב — מתוצאות «חיפוש מיוצגים» (השורה של האדם, אחרי אימות ת.ז.).
    if (p -> 'representation' ->> 'found') = 'true' then
      perform public._btl_fact_put(p_job.user_id, p_job.client_id, v_role, 'representation',
        jsonb_strip_nulls(jsonb_build_object(
          'receivedDate', public._btl_date(p -> 'representation' -> 'receivedDate'),
          'status', public._btl_txt(p -> 'representation' -> 'status', 60),
          'pendingAction', public._btl_txt(p -> 'representation' -> 'pendingAction', 60),
          'benefitsAuthorization', public._btl_txt(p -> 'representation' -> 'benefitsAuthorization', 60))),
        'search', p_job.id, v_at);
      perform public._btl_fact_put(p_job.user_id, p_job.client_id, v_role, 'debitMethod',
        jsonb_build_object('raw', public._btl_txt(p -> 'representation' -> 'debitAuthorization', 60)), 'search', p_job.id, v_at);
      v_n := v_n + 2;
    end if;

    if (s -> 'summaryFacts' ->> 'ok') = 'true' then
      foreach k in array v_summary_keys loop
        continue when not (s -> 'summaryFacts' -> 'value') ? k;
        perform public._btl_fact_put(p_job.user_id, p_job.client_id, v_role, k,
          public._btl_clean_summary_fact(k, s -> 'summaryFacts' -> 'value' -> k), 'summary', p_job.id, v_at);
        v_n := v_n + 1;
      end loop;
    end if;

    if (s -> 'notices' ->> 'ok') = 'true' then
      perform public._btl_fact_put(p_job.user_id, p_job.client_id, v_role, 'notices',
        public._btl_clean_list_fact('notices', s -> 'notices' -> 'value'), 'notices', p_job.id, v_at);
      v_n := v_n + 1;
    end if;
    if (s -> 'reserveDuty' ->> 'ok') = 'true' then
      perform public._btl_fact_put(p_job.user_id, p_job.client_id, v_role, 'reserveDuty',
        public._btl_clean_list_fact('reserveDuty', s -> 'reserveDuty' -> 'value'), 'benefits', p_job.id, v_at);
      v_n := v_n + 1;
    end if;
    if (s -> 'annualContributions' ->> 'ok') = 'true' then
      perform public._btl_fact_put(p_job.user_id, p_job.client_id, v_role, 'annualContributions',
        public._btl_clean_list_fact('annualContributions', s -> 'annualContributions' -> 'value'), 'contributions', p_job.id, v_at);
      v_n := v_n + 1;
    end if;
    if (s -> 'correspondence' ->> 'ok') = 'true' then
      perform public._btl_fact_put(p_job.user_id, p_job.client_id, v_role, 'correspondence',
        public._btl_clean_list_fact('correspondence', s -> 'correspondence' -> 'value'), 'correspondence', p_job.id, v_at);
      v_n := v_n + 1;
    end if;
    if (s -> 'benefitDebt' ->> 'ok') = 'true' then
      perform public._btl_fact_put(p_job.user_id, p_job.client_id, v_role, 'benefitDebt',
        public._btl_clean_list_fact('benefitDebt', s -> 'benefitDebt' -> 'value'), 'benefit_debt', p_job.id, v_at);
      v_n := v_n + 1;
    end if;

    if (s -> 'documents' ->> 'ok') = 'true' then
      v_docs := 0;
      for d in select e from jsonb_array_elements(
                 case when jsonb_typeof(s -> 'documents' -> 'value' -> 'items') = 'array'
                      then s -> 'documents' -> 'value' -> 'items' else '[]'::jsonb end) as a(e) limit 200 loop
        continue when public._btl_txt(d -> 'description', 120) is null or public._btl_date(d -> 'date') is null;
        insert into public.btl_portal_documents as bd (user_id, client_id, person_role, description, doc_date, pages, scan_ref,
                                                       first_seen_at, last_seen_at, first_job_id, last_job_id)
        values (p_job.user_id, p_job.client_id, v_role, public._btl_txt(d -> 'description', 120), (d ->> 'date')::date,
                case when (d ->> 'pages') ~ '^\d{1,4}$' then (d ->> 'pages')::int end,
                case when (d ->> 'scanRef') ~ '^[0-9a-f]{8,64}$' then d ->> 'scanRef' end,
                v_at, v_at, p_job.id, p_job.id)
        on conflict (client_id, person_role, description, doc_date, (coalesce(pages, -1)))
        do update set last_seen_at = greatest(bd.last_seen_at, excluded.last_seen_at), last_job_id = excluded.last_job_id,
                      scan_ref = coalesce(excluded.scan_ref, bd.scan_ref);
        v_docs := v_docs + 1;
      end loop;
      -- «נקרא לאחרונה» של תיק המסמכים עצמו — כדי שמסמך שלא הופיע יזוהה כ«לא בקריאה האחרונה».
      perform public._btl_fact_put(p_job.user_id, p_job.client_id, v_role, 'documentsRead',
        jsonb_build_object('count', v_docs), 'documents', p_job.id, v_at);
      v_n := v_n + v_docs + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

create or replace function public._btl_portal_ingest_job()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status <> 'succeeded' or old.status is not distinct from new.status then return new; end if;
  begin
    perform public._btl_portal_ingest(new);
  exception when others then
    -- ‼ כשל בשמירה לא מפיל את סיום המשימה (תוצאת הבדיקה עדיין מוצגת), אבל גם לא
    -- נבלע בשקט: נרשם על המשימה, והמסך מציג שהנתונים לא נשמרו.
    update public.automation_jobs
       set progress = coalesce(progress, '{}'::jsonb) || jsonb_build_object('portalIngestError', left(sqlerrm, 200))
     where id = new.id;
  end;
  return new;
end;
$$;

drop trigger if exists trg_btl_portal_ingest on public.automation_jobs;
create trigger trg_btl_portal_ingest
  after update of status on public.automation_jobs
  for each row
  when (new.action_type = 'btl.sync_file')
  execute function public._btl_portal_ingest_job();

-- ── 4 · קריאה לתצוגה: מה ב"ל רושם, לכל אדם ───────────────────────────────

create or replace function public.get_btl_portal_record(p_client_id text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_owner uuid; out jsonb := '{}'::jsonb; r text;
begin
  if auth.uid() is null or not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select user_id into v_owner from public.clients where id = p_client_id;
  if v_owner is null or v_owner <> auth.uid() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  foreach r in array array['client', 'spouse'] loop
    out := out || jsonb_build_object(r, jsonb_build_object(
      'facts', coalesce((
        select jsonb_object_agg(k.fact_key, jsonb_build_object(
                 'value', cur.value, 'since', cur.first_seen_at, 'lastSeen', cur.last_seen_at,
                 'screen', cur.source_screen, 'jobId', cur.last_job_id,
                 'history', coalesce((select jsonb_agg(jsonb_build_object('value', h.value, 'since', h.first_seen_at, 'until', h.last_seen_at)
                                                       order by h.first_seen_at desc)
                                        from (select * from public.btl_portal_facts h0
                                               where h0.client_id = p_client_id and h0.person_role = r and h0.fact_key = k.fact_key and h0.id <> cur.id
                                               order by h0.first_seen_at desc limit 5) h), '[]'::jsonb)))
          from (select distinct fact_key from public.btl_portal_facts where client_id = p_client_id and person_role = r) k
          cross join lateral (select * from public.btl_portal_facts c
                               where c.client_id = p_client_id and c.person_role = r and c.fact_key = k.fact_key
                               order by c.first_seen_at desc, c.id desc limit 1) cur), '{}'::jsonb),
      'documents', coalesce((
        select jsonb_agg(jsonb_build_object('id', d.id, 'description', d.description, 'docDate', d.doc_date,
                                            'pages', d.pages, 'firstSeenAt', d.first_seen_at, 'lastSeenAt', d.last_seen_at)
                         order by d.doc_date desc, d.description)
          from (select * from public.btl_portal_documents d0 where d0.client_id = p_client_id and d0.person_role = r
                 order by d0.doc_date desc limit 30) d), '[]'::jsonb)));
  end loop;
  return jsonb_build_object('ok', true, 'persons', out);
end;
$$;

-- ── 5 · 6101: מועמדים לראיית קליטה, ואישור של הרו"ח ──────────────────────

/** המועמדים: «דין וחשבון» של אותו אדם, מתאריך ההגשה (פחות 7 ימים לסבילות) והלאה, שלא אושרו להגשה אחרת. */
create or replace function public._smart_form_receipt_pool(f public.smart_form_filings)
returns setof public.btl_portal_documents language sql stable security definer set search_path to 'public' as $$
  select d.* from public.btl_portal_documents d
   where d.client_id = f.client_id and d.person_role = f.subject_role
     and d.description ~ 'דין\s*ו?חשבון'
     and (f.submission ->> 'submittedAt') ~ '^\d{4}-\d{2}-\d{2}'
     and d.doc_date >= ((f.submission ->> 'submittedAt')::date - 7)
     and not exists (select 1 from public.smart_form_filings o
                      where o.id <> f.id and o.receipt ->> 'documentId' = d.id)
   order by abs(d.doc_date - (f.submission ->> 'submittedAt')::date), d.doc_date, d.id
$$;

create or replace function public.smart_form_receipt_candidates(p_filing_id text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare f public.smart_form_filings%rowtype; v_read timestamptz; v_c jsonb; v_n int;
begin
  if auth.uid() is null or not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select * into f from public.smart_form_filings where id = p_filing_id;
  if f.id is null or f.user_id <> auth.uid() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select max(last_seen_at) into v_read from public.btl_portal_facts
   where client_id = f.client_id and person_role = f.subject_role and fact_key = 'documentsRead';
  if f.receipt is not null then
    return jsonb_build_object('ok', true, 'state', 'confirmed', 'receipt', f.receipt, 'lastReadAt', v_read);
  end if;
  if coalesce(f.submission ->> 'submittedAt', '') !~ '^\d{4}-\d{2}-\d{2}' then
    return jsonb_build_object('ok', true, 'state', 'not_submitted', 'lastReadAt', v_read);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'description', c.description, 'docDate', c.doc_date, 'pages', c.pages,
                                               'firstSeenAt', c.first_seen_at, 'lastSeenAt', c.last_seen_at)), '[]'::jsonb), count(*)
    into v_c, v_n from public._smart_form_receipt_pool(f) c;
  return jsonb_build_object('ok', true,
    'state', case when v_n = 0 then 'none' when v_n = 1 then 'single' else 'multiple' end,
    'candidates', v_c, 'submittedAt', f.submission ->> 'submittedAt', 'lastReadAt', v_read);
end;
$$;

create or replace function public.smart_form_confirm_receipt(p_filing_id text, p_document_id text, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  f public.smart_form_filings%rowtype := public._smart_form_owned(p_filing_id);
  d public.btl_portal_documents%rowtype;
  v_n int;
begin
  if f.id is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if f.state not in ('submitted', 'info_requested', 'result_received') then
    return jsonb_build_object('ok', false, 'error', 'not_submitted', 'state', f.state);
  end if;
  if f.receipt is not null then
    if f.receipt ->> 'documentId' = p_document_id then return jsonb_build_object('ok', true, 'existing', true); end if;
    return jsonb_build_object('ok', false, 'error', 'already_confirmed');
  end if;
  select count(*) into v_n from public._smart_form_receipt_pool(f);
  select * into d from public._smart_form_receipt_pool(f) c where c.id = p_document_id;
  if d.id is null then return jsonb_build_object('ok', false, 'error', 'not_a_candidate'); end if;

  update public.smart_form_filings
     set receipt = jsonb_build_object(
           'documentId', d.id, 'description', d.description, 'docDate', d.doc_date, 'pages', d.pages, 'scanRef', d.scan_ref,
           'firstSeenAt', d.first_seen_at, 'lastSeenAt', d.last_seen_at, 'observedJobId', d.last_job_id,
           'source', 'btl_portal:תיק מסמכים', 'candidatesAtConfirmation', v_n,
           'confirmedAt', now(), 'confirmedBy', auth.uid(), 'note', nullif(left(btrim(coalesce(p_note, '')), 300), '')),
         updated_at = now()
   where id = f.id;
  -- ‼ ביומן: בלי הערה חופשית (עלולה להכיל פרטים אישיים) — מזהה, תאריך וכמות מועמדים.
  perform public._smart_form_event(f.id, f.user_id, f.current_revision, 'office', 'receipt_confirmed',
    jsonb_build_object('documentId', d.id, 'docDate', d.doc_date, 'candidates', v_n));
  perform public._smart_form_sync_step(f.id);
  return jsonb_build_object('ok', true);
end;
$$;

-- ── 6 · ההיטל ב«בקשות»: «נקלט בב"ל» רק עם ראיה שאושרה ─────────────────────

create or replace function public._smart_form_sync_step(p_filing_id text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  f public.smart_form_filings%rowtype;
  r public.smart_form_revisions%rowtype;
  v_status text; v_ball text; v_label text; v_waiting text; v_pending text[]; v_client_msg text;
  v_received boolean;
begin
  select * into f from public.smart_form_filings where id = p_filing_id;
  if f.id is null or f.step_id is null then return; end if;
  select * into r from public.smart_form_revisions where filing_id = f.id and revision = f.current_revision;
  v_received := f.receipt is not null;

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
    when 'submitted' then v_status := 'in_progress'; v_ball := 'authority'; v_waiting := 'authority';
      v_label := case when v_received then 'הוגש ונקלט בביטוח לאומי — ממתין לתשובה' else 'הוגש — ממתין לביטוח לאומי' end;
    when 'info_requested' then v_status := 'in_progress'; v_ball := 'me'; v_label := 'ביטוח לאומי ביקש מידע נוסף';
    when 'result_received' then v_status := 'in_progress'; v_ball := 'me'; v_label := 'התקבלה תשובה רשמית — להחליט על ההמשך';
    when 'closed' then v_status := 'completed'; v_ball := 'me'; v_label := 'הושלם';
    when 'cancelled' then v_status := 'cancelled'; v_ball := 'me'; v_label := 'בוטל';
  end case;

  v_client_msg := case f.state
    when 'waiting_client_info' then 'המשרד מכין את הדיווח לביטוח לאומי (טופס 6101) וייצור איתך קשר להשלמת פרטים.'
    when 'awaiting_signatures' then 'הטופס מוכן לחתימה. החתימה נעשית במשרד או בקישור אישי שהמשרד מעביר.'
    when 'signed' then 'הטופס נחתם. המשרד מטפל בהגשה לביטוח לאומי.'
    when 'awaiting_client_submission' then 'הטופס נחתם. יש להגיש אותו באזור האישי באתר ביטוח לאומי ולהעביר למשרד אישור על ההגשה.'
    when 'submitted' then case when v_received then 'הטופס הוגש לביטוח לאומי ונקלט אצלם. ממתינים לתשובה.'
                               else 'הטופס הוגש לביטוח לאומי. ממתינים לתשובה.' end
    when 'info_requested' then 'ביטוח לאומי ביקש מידע נוסף. המשרד מטפל בכך.'
    when 'result_received' then 'התקבלה תשובה מביטוח לאומי. המשרד בודק אותה.'
    else 'המשרד מכין עבורך את הדיווח לביטוח לאומי (טופס 6101).' end;

  update public.onboarding_steps
     set payload = coalesce(payload, '{}'::jsonb)
                   || jsonb_build_object('messageOnly', true, 'clientTitle', 'דיווח לביטוח לאומי (טופס 6101)', 'message', v_client_msg)
                   || jsonb_build_object('smartForm', jsonb_build_object(
           'filingId', f.id, 'templateKey', f.template_key, 'state', f.state, 'stateLabel', v_label,
           'waitingOn', v_waiting, 'revision', f.current_revision, 'purposes', to_jsonb(f.purposes),
           'subjectRole', f.subject_role, 'syncedAt', now(),
           'receivedAt', case when v_received then f.receipt ->> 'docDate' end)),
         updated_at = now()
   where id = f.step_id;

  perform public._set_step_status(f.step_id, v_status, 'system', v_label,
    jsonb_build_object('filingId', f.id, 'state', f.state), v_ball,
    case when v_status = 'completed' then 'manual' else null end);
end;
$$;

-- ── 7 · הרשאות ─────────────────────────────────────────────────────────────

revoke all on function public._btl_txt(jsonb, int) from public, anon, authenticated;
revoke all on function public._btl_num(jsonb) from public, anon, authenticated;
revoke all on function public._btl_date(jsonb) from public, anon, authenticated;
revoke all on function public._btl_clean_summary_fact(text, jsonb) from public, anon, authenticated;
revoke all on function public._btl_clean_list_fact(text, jsonb) from public, anon, authenticated;
revoke all on function public._btl_fact_put(uuid, text, text, text, jsonb, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public._btl_portal_ingest(public.automation_jobs) from public, anon, authenticated;
revoke all on function public._btl_portal_ingest_job() from public, anon, authenticated;
revoke all on function public._smart_form_receipt_pool(public.smart_form_filings) from public, anon, authenticated;
revoke all on function public._smart_form_sync_step(text) from public, anon, authenticated;

revoke all on function public.get_btl_portal_record(text) from public, anon;
grant execute on function public.get_btl_portal_record(text) to authenticated;
revoke all on function public.smart_form_receipt_candidates(text) from public, anon;
grant execute on function public.smart_form_receipt_candidates(text) to authenticated;
revoke all on function public.smart_form_confirm_receipt(text, text, text) from public, anon;
grant execute on function public.smart_form_confirm_receipt(text, text, text) to authenticated;

select public.assert_domain_function_invariants();
