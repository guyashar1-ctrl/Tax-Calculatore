-- ─── 305 · רשימות שע״ם: נכתב מיד · בקשה פנימית לבד · ביטול העלאה · 154 מהשרת — 26.10.2026 ─────────────────────
-- ‼ הוחלה בייצור 26.10.2026 בשם «304-shaam-hub-decisions» (גרסה 20261026114313). הקובץ הועבר ל-305 כי סשן מקביל לקח את 304 (פייפרלס) — התוכן זהה.
-- שלוש החלטות של גיא (25.10.2026, אושרו):
--   1 · שורות מזוהות נכתבות לתיקים מיד בהעלאה/בקריאה; לא ודאי נשאר «לבדיקה» (בלי כתיבה לתיק); וכל העלאה ניתנת לביטול.
--   2 · חובה חדשה פותחת בקשה פנימית ב«בקשות» של הלקוח — לא בדף, בלי מייל. אותה פונקציה כמו «פתח בקשה» הידני
--       (upsert_tax_work → ensure_tax_year_request, אידמפוטנטית לפי זהות העבודה: לקוח + סוג + שנה + פתוחה), ואותו קישור.
--   3 · 154 הוא המקור הראשי: קריאת 154 שהסתיימה נקלטת בשרת (טריגר על automation_jobs) — גם כשאיש לא פתח את התיק.
--       הקליטה מהדפדפן (useGmf154Import) נשארת, ובשרת היא אידמפוטנטית (אותו מקור לפי מזהה הריצה).
--
-- ‼ השרת כבר כתב שורות מזוהות ב-shaam_filing_import (250); מה שהשתנה כאן: רישום מה כל מקור עשה (shaam_filing_source_effects),
--   פתיחת בקשה אוטומטית, ביטול לפי מקור (undo_shaam_filing_source), ו-154 מהשרת. «תצוגת קליטה» (shaam_filing_preview) לא נמחקה.
-- ‼ בקשה אוטומטית — דוח שנתי בלבד. הצהרת הון דורשת יום הצהרה שנבחר במפורש (שע״ם מציג שנה בלבד) — נשארת «פתח בקשה».
--   גם: שנה שטרם הסתיימה (year_not_ended) ושורה שיש לה כבר בקשה מקושרת — לא נפתחת. רק מעבר למצב «פתוח» בייבוא הזה
--   (חדשה, או שהייתה «לבדיקה»/אחר) פותח; שורה פתוחה ישנה בלי בקשה נשארת ל«פתח בקשה».
-- ‼ הבקשה האוטומטית = מה שהידנית יוצרת: annual_return פנימי (track internal, ball me). אין ענף לבקשה הזו בדף האישי
--   (_portal_step_items מציג annual_return רק עם חתימה — 298), אין פרסום של «השלמת מידע», אין מייל. השאלון נבנה כשהמשרד
--   לוחץ «הכן ופרסם בדף» בבקשה (publishAnnualAsks) — כמו בקשה שנפתחה «לפני השליחה».
--   הנושא נשמר כתפקיד על החובה (subject_role client/spouse). הדוח השנתי הוא אחד לכרטיס ולשנה — כמו בידני.
-- ‼ ביטול העלאה: מחזיר בדיוק את מה שהמקור עשה — חובה שנוצרה ושאין לה הפניה של אדם נמחקת; חובה שעודכנה חוזרת לערכים
--   הקודמים (צילום השורה לפני הכתיבה); בקשה שנפתחה אוטומטית ועוד לא נגעו בה — מבוטלת (remove_tax_work 'cancel' — נשמרת
--   בהיסטוריה וניתנת להחזרה); בקשה שעבדו עליה, שורה שהמשרד שינה אחרי ההעלאה, או שורה שהעלאה חדשה יותר אישרה — נשארות,
--   ומדווחות בתשובה (kept). קריאה שנייה — בלי שינוי (already).
-- ‼ anon — חסום. הכול security definer, למשרד המחובר בלבד (auth.uid() + is_authorized()).
-- החזרה: scripts/sql/305/rollback-305.sql · בדיקה ב-staging: scripts/staging-test-305-shaam-hub.mjs

do $guard$
begin
  if to_regclass('public.shaam_filing_obligations') is null then raise exception '305: חסרה shaam_filing_obligations (250)'; end if;
  if not exists (select 1 from pg_proc where proname = '_shaam_plan') then raise exception '305: חסרה _shaam_plan (250)'; end if;
  if not exists (select 1 from pg_proc where proname = 'upsert_tax_work') then raise exception '305: חסרה upsert_tax_work (241)'; end if;
  if not exists (select 1 from pg_proc where proname = 'remove_tax_work') then raise exception '305: חסרה remove_tax_work (242)'; end if;
  if to_regclass('public.annual_returns') is null or to_regclass('public.annual_return_signings') is null then raise exception '305: חסרות annual_returns / annual_return_signings'; end if;
end
$guard$;

-- ── 1 · מה כל מקור עשה ────────────────────────────────────────────────────────────────────────────
alter table public.shaam_filing_sources add column if not exists undone_at timestamptz;
alter table public.shaam_filing_sources add column if not exists undo_summary jsonb;

create table if not exists public.shaam_filing_source_effects (
  id              bigint generated always as identity primary key,
  user_id         uuid not null,
  source_id       uuid not null references public.shaam_filing_sources(id) on delete cascade,
  -- ‼ בלי FK: הביטול מוחק חובות, והרשומה נשארת כהיסטוריה של הביטול
  obligation_id   uuid not null,
  action          text not null check (action in ('created', 'updated', 'unchanged')),
  -- השורה כולה לפני הכתיבה (to_jsonb) — לשחזור מדויק
  prev            jsonb,
  -- בקשה שקושרה בייבוא הזה לבד (_shaam_after_change / בקשה פתוחה קיימת) · בקשה שנפתחה בייבוא הזה
  linked_step_id  text,
  opened_step_id  text,
  -- «הוגש לפי שע״ם» סומן על הבקשה בייבוא הזה (payload.work.shaamFiled)
  marked_filed    boolean not null default false,
  created_at      timestamptz not null default now(),
  undone_at       timestamptz,
  undo_result     jsonb
);
create index if not exists shaam_filing_source_effects_source_idx on public.shaam_filing_source_effects (source_id, id);
create index if not exists shaam_filing_source_effects_obligation_idx on public.shaam_filing_source_effects (obligation_id, id);
comment on table public.shaam_filing_source_effects is
  '305 · מה כל העלאה/קריאה של רשימת שע״ם עשתה לכל חובה — הבסיס ל«ביטול ההעלאה» (undo_shaam_filing_source).';
alter table public.shaam_filing_source_effects enable row level security;
revoke all on public.shaam_filing_source_effects from public, anon, authenticated;

-- ── 2 · פתיחת הבקשה האוטומטית — אותה פונקציה כמו «פתח בקשה» (createWork → upsert_tax_work) ───────────────
-- ‼ אותם פרטים כמו toWorkRow + metaOf בדפדפן: מקור «מסך המייצגים», הערת מקור, «נבדק ברשות», מועד «נמסר, לא מאומת».
-- ‼ כשל כאן לא מפיל את הקליטה: השורה נשמרת, והכשל חוזר בתשובה ושורת «פתח בקשה» נשארת.
create or replace function public._shaam_auto_open(p_id uuid, p_source uuid)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $$
declare
  o public.shaam_filing_obligations%rowtype; v_src text; v_note text; v_meta jsonb; v_res jsonb; v_created boolean;
begin
  select * into o from public.shaam_filing_obligations where id = p_id;
  if o.id is null or o.state <> 'open' or o.client_id is null or o.step_id is not null then return null; end if;
  if o.kind <> 'annual' then return jsonb_build_object('skipped', 'needs_as_of_date'); end if;
  if o.tax_year is null or o.tax_year >= extract(year from current_date)::int then return jsonb_build_object('skipped', 'year_not_ended'); end if;
  select file_name into v_src from public.shaam_filing_sources where id = o.source_id;
  v_note := 'רשימת שע״ם · ' || case when v_src = 'שע״ם · שאילתה 154 — מידע אודות שנות מס' then 'מידע אודות שנות מס (154)' else 'מעקב הגשת דוחות (IDOM)' end
            || coalesce(' · הופקה ' || to_char(o.produced_on, 'DD.MM.YYYY'), '');
  v_meta := jsonb_build_object('createdVia', 'tax_work', 'source', 'portal', 'sourceNote', v_note)
    || case when o.produced_on is not null then jsonb_build_object('lastAuthorityCheck', jsonb_build_object('at', to_char(o.produced_on, 'YYYY-MM-DD'))) else '{}'::jsonb end
    || case when o.legal_due is not null then jsonb_build_object('deadline', jsonb_build_object('status', 'reported', 'source', 'portal', 'due', to_char(o.legal_due, 'YYYY-MM-DD'))) else '{}'::jsonb end;
  begin
    v_res := public.upsert_tax_work(o.client_id, 'annual', o.tax_year, null, v_meta);
  exception when others then
    return jsonb_build_object('error', left(sqlerrm, 200));
  end;
  if coalesce((v_res->>'ok')::boolean, false) is false then return jsonb_build_object('error', coalesce(v_res->>'error', 'failed')); end if;
  v_created := coalesce((v_res->>'created')::boolean, false);
  update public.shaam_filing_obligations set step_id = v_res->>'stepId' where id = o.id;
  insert into public.onboarding_events (user_id, step_id, type, actor, note, meta)
  values (o.user_id, v_res->>'stepId', 'note', 'system',
    case when v_created then 'נפתחה לבד לפי חובה שנקלטה מרשימת שע״ם — פנימית: לא בדף ובלי מייל' else 'קושרה לחובה שנקלטה מרשימת שע״ם' end,
    jsonb_strip_nulls(jsonb_build_object('what', case when v_created then 'shaam_auto_opened' else 'shaam_obligation_linked' end,
      'obligationId', o.id, 'sourceId', p_source, 'legalDue', o.legal_due, 'yearShown', o.year_shown, 'role', o.subject_role)));
  return jsonb_build_object('stepId', v_res->>'stepId', 'created', v_created);
end $$;

-- ── 3 · הקליטה עצמה (פנימית) — הגוף של 250 + רישום ההשפעה + בקשה אוטומטית ────────────────────────────────
-- ‼ p_uid חייב להיות המשתמש המחובר (upsert_tax_work בודק בעלות לפי auth.uid()). מהטריגר של 154 — בזהות בעל המשימה.
create or replace function public._shaam_filing_import(p_uid uuid, p_batch jsonb)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $$
declare
  v_plan jsonb; p jsonb; r jsonb; s jsonb; v_src uuid; v_srcs jsonb := '{}'::jsonb;
  e public.shaam_filing_obligations%rowtype; o public.shaam_filing_obligations%rowtype; v_id uuid; v_group text; v_kind text; v_n jsonb := '{}'::jsonb;
  v_prev jsonb; v_prev_state text; v_prev_step text; v_marks int; v_auto jsonb; v_row_src uuid;
  v_written int := 0; v_unchanged int := 0; v_review int := 0; v_opened int := 0; v_linked int := 0; v_need_day int := 0;
  v_failed jsonb := '[]'::jsonb; v_open_list jsonb := '[]'::jsonb;
begin
  if p_uid is null or auth.uid() is distinct from p_uid then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_batch) is distinct from 'object' or jsonb_array_length(coalesce(p_batch->'rows', '[]'::jsonb)) > 5000 then
    return jsonb_build_object('ok', false, 'error', 'bad_batch');
  end if;
  -- מקורות: אותו קובץ (sha) — אותה רשומה; הנתיב בדלי חייב להיות בתיקיית המשרד
  for s in select * from jsonb_array_elements(coalesce(p_batch->'sources', '[]'::jsonb)) loop
    if nullif(s->>'storagePath', '') is not null and split_part(s->>'storagePath', '/', 1) <> p_uid::text then
      return jsonb_build_object('ok', false, 'error', 'bad_storage_path');
    end if;
    if s->>'kind' not in ('annual', 'wealth') then return jsonb_build_object('ok', false, 'error', 'bad_source'); end if;
    v_src := null;
    if nullif(s->>'sha256', '') is not null then
      select id into v_src from public.shaam_filing_sources where user_id = p_uid and content_sha256 = s->>'sha256';
    end if;
    if v_src is null then
      insert into public.shaam_filing_sources (user_id, method, file_name, content_sha256, storage_path, file_size, list_kind, wealth_group, tax_year,
        produced_raw, produced_on, pages, status, note, uploaded_by)
      values (p_uid, coalesce(nullif(s->>'method', ''), 'pdf'), left(coalesce(nullif(s->>'fileName', ''), 'קובץ'), 200), nullif(s->>'sha256', ''),
        nullif(s->>'storagePath', ''), nullif(s->>'size', '')::bigint, s->>'kind', nullif(s->>'group', ''), nullif(s->>'taxYear', '')::int,
        left(nullif(s->>'producedRaw', ''), 40), nullif(s->>'producedOn', '')::date, coalesce(s->'pages', '[]'::jsonb),
        case when s->>'status' in ('ok', 'empty_confirmed', 'partial') then s->>'status' else 'partial' end, left(nullif(s->>'note', ''), 500), p_uid)
      returning id into v_src;
    else
      -- ‼ 305 · אותו קובץ שוב אחרי ביטול — המקור חוזר לחיים (ההשפעות החדשות נרשמות מעכשיו)
      update public.shaam_filing_sources set storage_path = coalesce(storage_path, nullif(s->>'storagePath', '')), undone_at = null where id = v_src;
    end if;
    v_srcs := v_srcs || jsonb_build_object(s->>'key', v_src);
  end loop;

  v_plan := public._shaam_plan(p_uid, p_batch);
  for p in select * from jsonb_array_elements(v_plan) loop
    v_n := jsonb_set(v_n, array[p->>'change'], to_jsonb(coalesce((v_n->>(p->>'change'))::int, 0) + 1));
    if p->>'change' not in ('new', 'updated', 'unchanged') then continue; end if;
    r := p_batch->'rows'->((p->>'i')::int - 1);
    select x.value into s from jsonb_array_elements(p_batch->'sources') x where x.value->>'key' = r->>'sourceKey' limit 1;
    v_kind := s->>'kind'; v_group := nullif(s->>'group', ''); v_row_src := (v_srcs->>(r->>'sourceKey'))::uuid;
    v_prev := null; v_prev_state := null; v_prev_step := null;
    if p->>'change' in ('updated', 'unchanged') then
      select * into e from public.shaam_filing_obligations where id = (p->>'existingId')::uuid for update;
      v_prev := to_jsonb(e); v_prev_state := e.state; v_prev_step := e.step_id;
    end if;
    if p->>'change' = 'unchanged' then
      update public.shaam_filing_obligations set last_seen_at = now(), state = p->>'state',
             client_id = coalesce(client_id, p->>'clientId'), subject_role = coalesce(subject_role, p->>'role'),
             match_kind = coalesce(match_kind, p->>'tier'), review_reason = p->>'reason', candidates = p->'candidates'
       where id = (p->>'existingId')::uuid;
      v_id := (p->>'existingId')::uuid;
    elsif p->>'change' = 'updated' then
      update public.shaam_filing_obligations set
        name_captured = nullif(r->>'name', ''), office = nullif(r->>'office', ''), file_type = nullif(r->>'fileType', ''),
        section = nullif(r->>'section', ''), branch = nullif(r->>'branch', ''), required = (r->>'required')::boolean,
        legal_due = nullif(r->>'legalDue', '')::date, legal_due_raw = nullif(r->>'legalDueRaw', ''),
        filed_on = nullif(r->>'filedOn', '')::date, filed_on_raw = nullif(r->>'filedOnRaw', ''),
        no_assessment = coalesce((r->>'noAssessment')::boolean, false), wealth_group = v_group,
        fine = case when v_group is null then null else v_group like '%\_fine' and v_group not like '%no\_fine' end,
        shaam_status = p->>'shaamStatus', state = p->>'state', review_reason = p->>'reason', candidates = p->'candidates',
        client_id = coalesce(e.client_id, p->>'clientId'), subject_role = coalesce(e.subject_role, p->>'role'), match_kind = coalesce(e.match_kind, p->>'tier'),
        source_id = v_row_src, evidence = jsonb_build_object('sourceId', v_row_src, 'page', r->'page', 'line', r->'line'),
        produced_on = nullif(s->>'producedOn', '')::date,
        history = e.history || jsonb_build_array(jsonb_build_object('at', now(), 'sourceId', e.source_id, 'producedOn', e.produced_on,
          'state', e.state, 'values', public._shaam_values(e))),
        last_seen_at = now(), updated_at = now()
       where id = e.id;
      v_id := e.id;
    else
      insert into public.shaam_filing_obligations (user_id, kind, file_number, year_shown, tax_year, name_captured, office, file_type, section, branch,
        required, legal_due, legal_due_raw, filed_on, filed_on_raw, no_assessment, wealth_group, fine, shaam_status, state, review_reason,
        client_id, subject_role, match_kind, candidates, source_id, evidence, produced_on)
      values (p_uid, v_kind, public._shaam_file9(r->>'fileNumber'), btrim(r->>'yearShown'), (btrim(r->>'yearShown'))::int,
        nullif(r->>'name', ''), nullif(r->>'office', ''), nullif(r->>'fileType', ''), nullif(r->>'section', ''), nullif(r->>'branch', ''),
        (r->>'required')::boolean, nullif(r->>'legalDue', '')::date, nullif(r->>'legalDueRaw', ''), nullif(r->>'filedOn', '')::date, nullif(r->>'filedOnRaw', ''),
        coalesce((r->>'noAssessment')::boolean, false), v_group,
        case when v_group is null then null else v_group like '%\_fine' and v_group not like '%no\_fine' end,
        p->>'shaamStatus', p->>'state', p->>'reason', p->>'clientId', p->>'role', p->>'tier', p->'candidates',
        v_row_src, jsonb_build_object('sourceId', v_row_src, 'page', r->'page', 'line', r->'line'),
        nullif(s->>'producedOn', '')::date)
      returning id into v_id;
    end if;
    select count(*) into v_marks from public.onboarding_events ev where ev.meta->>'what' = 'filed_per_shaam' and ev.meta->>'obligationId' = v_id::text;
    perform public._shaam_after_change(v_id);

    -- ‼ 305 · חובה שנעשתה «פתוחה» בייבוא הזה, עם לקוח מזוהה ובלי בקשה ⇒ בקשה פנימית (דוח שנתי)
    select * into o from public.shaam_filing_obligations where id = v_id;
    v_auto := null;
    if o.state = 'open' and o.client_id is not null and o.step_id is null and v_prev_state is distinct from 'open' then
      v_auto := public._shaam_auto_open(v_id, v_row_src);
      if v_auto ? 'stepId' then
        if (v_auto->>'created')::boolean then v_opened := v_opened + 1; else v_linked := v_linked + 1; end if;
        v_open_list := v_open_list || jsonb_build_object('obligationId', v_id, 'clientId', o.client_id, 'stepId', v_auto->>'stepId', 'created', (v_auto->>'created')::boolean);
      elsif v_auto->>'skipped' = 'needs_as_of_date' then v_need_day := v_need_day + 1;
      elsif v_auto ? 'error' then v_failed := v_failed || jsonb_build_object('obligationId', v_id, 'clientId', o.client_id, 'error', v_auto->>'error');
      end if;
      select * into o from public.shaam_filing_obligations where id = v_id;
    end if;

    insert into public.shaam_filing_source_effects (user_id, source_id, obligation_id, action, prev, linked_step_id, opened_step_id, marked_filed)
    values (p_uid, v_row_src, v_id, case p->>'change' when 'new' then 'created' else p->>'change' end, v_prev,
      case when o.step_id is not null and o.step_id is distinct from v_prev_step and not coalesce((v_auto->>'created')::boolean, false) then o.step_id end,
      case when coalesce((v_auto->>'created')::boolean, false) then v_auto->>'stepId' end,
      (select count(*) from public.onboarding_events ev where ev.meta->>'what' = 'filed_per_shaam' and ev.meta->>'obligationId' = v_id::text) > v_marks);

    if o.state = 'needs_review' then v_review := v_review + 1;
    elsif o.state <> 'dismissed' and o.client_id is not null then
      if p->>'change' = 'unchanged' then v_unchanged := v_unchanged + 1; else v_written := v_written + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'counts', v_n, 'plan', v_plan, 'sources', v_srcs,
    'summary', jsonb_build_object('written', v_written, 'unchanged', v_unchanged, 'review', v_review, 'opened', v_opened, 'linked', v_linked,
      'needDay', v_need_day, 'openFailed', jsonb_array_length(v_failed)),
    'opened', v_open_list, 'openFailed', v_failed);
end $$;

-- «שמירה לתיקים» — עכשיו נקרא מיד אחרי ההעלאה. אותה חתימה כמו 250.
create or replace function public.shaam_filing_import(p_batch jsonb)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_authorized() then raise exception 'forbidden' using errcode = '42501'; end if;
  return public._shaam_filing_import(v_uid, p_batch);
end $$;

-- ── 4 · ביטול העלאה ────────────────────────────────────────────────────────────────────────────────
-- בקשה שנפתחה לבד ועוד לא נגעו בה? null = לא נגעו; אחרת הסיבה. ‼ «נגעו» = כל דבר שאדם או הלקוח עשו בה.
create or replace function public._shaam_auto_request_untouched(p_step_id text, p_obligation_id uuid)
returns text language plpgsql stable security definer set search_path to 'public' as $$
declare st public.onboarding_steps%rowtype; f jsonb;
begin
  select * into st from public.onboarding_steps where id = p_step_id;
  if st.id is null then return 'gone'; end if;
  if st.status = any (array['completed', 'verified', 'skipped', 'cancelled', 'failed']) then return 'closed'; end if;
  if st.step_type <> 'annual_return' or st.status <> 'in_progress' or st.ball <> 'me' then return 'worked_on'; end if;
  -- חובה אחרת (למשל תיק בן/בת הזוג באותה שנה) נשענת על אותה בקשה
  if exists (select 1 from public.shaam_filing_obligations x where x.step_id = st.id and x.id <> p_obligation_id) then return 'shared'; end if;
  if exists (select 1 from public.onboarding_steps i where i.payload->>'parentStepId' = st.id) then return 'worked_on'; end if;
  f := public._tax_work_removal_facts(st.id);
  if coalesce((f->>'infoPublished')::boolean, false)
     or coalesce((f->>'asksDraft')::int, 0) + coalesce((f->>'asksOpen')::int, 0) + coalesce((f->>'asksAnswered')::int, 0)
      + coalesce((f->>'factsAccepted')::int, 0) + coalesce((f->>'factsPending')::int, 0) + coalesce((f->>'documents')::int, 0)
      + coalesce((f->>'emails')::int, 0) + coalesce((f->>'estimatesApproved')::int, 0) + coalesce((f->>'estimatesPublished')::int, 0)
      + coalesce((f->>'estimatesDraft')::int, 0) + coalesce((f->>'notices')::int, 0) > 0 then return 'worked_on'; end if;
  if exists (select 1 from public.email_messages m where m.request_id = st.id or replace(m.step_id::text, '-', '') = st.id) then return 'worked_on'; end if;
  if exists (select 1 from public.annual_returns a where a.request_id = st.id)
     or exists (select 1 from public.annual_return_signings g where g.request_id = st.id) then return 'worked_on'; end if;
  -- ‼ רק ההערות שהמערכת עצמה כתבה על הקישור לשע״ם
  if exists (select 1 from public.onboarding_events ev where ev.step_id = st.id
              and coalesce(ev.meta->>'what', '') not in ('shaam_auto_opened', 'shaam_obligation_linked', 'filed_per_shaam')) then return 'worked_on'; end if;
  if jsonb_array_length(coalesce(st.payload->'workLog', '[]'::jsonb)) > 1 then return 'worked_on'; end if;
  return null;
end $$;

create or replace function public.undo_shaam_filing_source(p_source_id uuid)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid(); src public.shaam_filing_sources%rowtype; ef public.shaam_filing_source_effects%rowtype;
  o public.shaam_filing_obligations%rowtype; pr public.shaam_filing_obligations%rowtype; v_why text; v_req text; v_rm jsonb;
  v_req_kept boolean; v_deleted int := 0; v_restored int := 0; v_cancelled int := 0; v_gone int := 0;
  v_kept jsonb := '[]'::jsonb; v_kept_req jsonb := '[]'::jsonb; v_any boolean := false; v_summary jsonb; v_res jsonb;
begin
  if v_uid is null or not public.is_authorized() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into src from public.shaam_filing_sources where id = p_source_id and user_id = v_uid for update;
  if src.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  for ef in select * from public.shaam_filing_source_effects where source_id = src.id and undone_at is null order by id desc for update loop
    v_any := true; v_res := null; v_req_kept := false;
    select * into o from public.shaam_filing_obligations where id = ef.obligation_id and user_id = v_uid for update;
    if o.id is null then
      v_gone := v_gone + 1; v_res := jsonb_build_object('result', 'gone');
    else
      -- ‼ העלאה מאוחרת יותר (לא מבוטלת) אישרה את השורה — לא מחזירים לאחור מעליה
      if exists (select 1 from public.shaam_filing_source_effects x where x.obligation_id = o.id and x.id > ef.id and x.source_id <> src.id and x.undone_at is null) then
        v_why := 'newer_upload';
      -- ‼ המשרד שינה את השורה אחרי ההעלאה (שיוך, «לא שלנו», פתיחת בקשה, בקשת עותק) — של אדם, לא נוגעים
      elsif o.updated_at > ef.created_at then v_why := 'office_changed';
      else v_why := null; end if;

      if v_why is not null then
        v_kept := v_kept || jsonb_build_object('obligationId', o.id, 'clientId', o.client_id, 'reason', v_why);
        v_res := jsonb_build_object('result', 'kept', 'reason', v_why);
      else
        -- הבקשה שנפתחה לבד בהעלאה הזו
        v_req := ef.opened_step_id;
        if v_req is not null then
          v_why := public._shaam_auto_request_untouched(v_req, o.id);
          if v_why is null then
            v_rm := public.remove_tax_work(v_req, 'cancel', 'ביטול העלאת רשימת שע״ם');
            if coalesce((v_rm->>'ok')::boolean, false) then v_cancelled := v_cancelled + 1;
            else v_req_kept := true; v_kept_req := v_kept_req || jsonb_build_object('stepId', v_req, 'clientId', o.client_id, 'reason', coalesce(v_rm->>'error', 'failed')); end if;
          elsif v_why not in ('gone', 'closed') then
            v_req_kept := true; v_kept_req := v_kept_req || jsonb_build_object('stepId', v_req, 'clientId', o.client_id, 'reason', v_why);
          end if;
        end if;
        -- «הוגש לפי שע״ם» שסומן בהעלאה הזו — מוסר מבקשה פתוחה (הבקשה לא נסגרה אז, ולא נסגרת עכשיו)
        if ef.marked_filed and o.step_id is not null then
          update public.onboarding_steps set payload = jsonb_set(payload, '{work}', (payload->'work') - 'shaamFiled'), updated_at = now()
           where id = o.step_id and payload->'work'->'shaamFiled'->>'obligationId' = o.id::text
             and status <> all (array['completed', 'verified', 'skipped', 'cancelled', 'failed']);
          if found then
            insert into public.onboarding_events (user_id, step_id, type, actor, note, meta)
            values (v_uid, o.step_id, 'note', 'accountant', 'סימון «הוגש לפי שע״ם» הוסר — ההעלאה בוטלה',
              jsonb_build_object('what', 'shaam_filed_undone', 'obligationId', o.id, 'sourceId', src.id));
          end if;
        end if;

        if ef.action = 'created' then
          if v_req_kept or o.copy_step_id is not null or o.match_kind = 'manual' or o.state = 'dismissed'
             or (o.step_id is not null and o.step_id is distinct from ef.opened_step_id and o.step_id is distinct from ef.linked_step_id) then
            v_why := case when v_req_kept then 'request_worked_on' when o.copy_step_id is not null then 'copy_requested' else 'office_changed' end;
            v_kept := v_kept || jsonb_build_object('obligationId', o.id, 'clientId', o.client_id, 'reason', v_why);
            v_res := jsonb_build_object('result', 'kept', 'reason', v_why);
          else
            delete from public.shaam_filing_obligations where id = o.id;
            v_deleted := v_deleted + 1; v_res := jsonb_build_object('result', 'deleted');
          end if;
        elsif ef.prev is not null then
          pr := jsonb_populate_record(null::public.shaam_filing_obligations, ef.prev);
          update public.shaam_filing_obligations set
            name_captured = pr.name_captured, office = pr.office, file_type = pr.file_type, section = pr.section, branch = pr.branch,
            required = pr.required, legal_due = pr.legal_due, legal_due_raw = pr.legal_due_raw, filed_on = pr.filed_on, filed_on_raw = pr.filed_on_raw,
            no_assessment = pr.no_assessment, wealth_group = pr.wealth_group, fine = pr.fine, shaam_status = pr.shaam_status, state = pr.state,
            review_reason = pr.review_reason, client_id = pr.client_id, subject_role = pr.subject_role, match_kind = pr.match_kind, candidates = pr.candidates,
            step_id = case when v_req_kept then o.step_id
                           when o.step_id is not distinct from ef.opened_step_id or o.step_id is not distinct from ef.linked_step_id then pr.step_id
                           else o.step_id end,
            source_id = pr.source_id, evidence = pr.evidence, produced_on = pr.produced_on, history = pr.history,
            last_seen_at = pr.last_seen_at, updated_at = pr.updated_at
           where id = o.id;
          v_restored := v_restored + 1; v_res := jsonb_build_object('result', 'restored', 'requestKept', v_req_kept);
        end if;
      end if;
    end if;
    update public.shaam_filing_source_effects set undone_at = now(), undo_result = v_res where id = ef.id;
  end loop;

  if not v_any then
    if src.undone_at is not null then return jsonb_build_object('ok', true, 'already', true, 'summary', src.undo_summary); end if;
    -- ‼ מקור שנקלט לפני 305 — לא נרשם מה הוא עשה, ולכן אין מה להחזיר בבטחה
    return jsonb_build_object('ok', false, 'error', 'not_recorded');
  end if;
  v_summary := jsonb_build_object('at', now(), 'deleted', v_deleted, 'restored', v_restored, 'cancelledRequests', v_cancelled, 'gone', v_gone,
    'kept', v_kept, 'keptRequests', v_kept_req);
  update public.shaam_filing_sources set undone_at = now(), undo_summary = v_summary where id = src.id;
  return jsonb_build_object('ok', true) || v_summary;
end $$;

-- ── 5 · רשימה — כמו 250, ולמקור: האם אפשר לבטל, ומה הביטול עשה ───────────────────────────────────────
create or replace function public.shaam_filing_list(p_client_id text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_authorized() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object('ok', true,
    'obligations', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', o.id, 'kind', o.kind, 'fileNumber', o.file_number, 'yearShown', o.year_shown, 'name', o.name_captured,
        'office', o.office, 'fileType', o.file_type, 'section', o.section, 'required', o.required,
        'legalDue', o.legal_due, 'legalDueRaw', o.legal_due_raw, 'filedOn', o.filed_on, 'noAssessment', o.no_assessment,
        'group', o.wealth_group, 'fine', o.fine, 'shaamStatus', o.shaam_status, 'state', o.state, 'reason', o.review_reason,
        'clientId', o.client_id, 'clientName', nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), ''), 'role', o.subject_role,
        'matchKind', o.match_kind, 'candidates', o.candidates,
        'stepId', o.step_id, 'stepStatus', st.status, 'copyStepId', o.copy_step_id, 'copyStepStatus', cs.status,
        'copyInOffice', case when o.client_id is not null and o.state in ('history', 'filed_per_shaam') then exists (
            select 1 from public.documents d left join public.document_labels l on l.id = d.label_id
            where d.client_id = o.client_id and d.user_id = v_uid and d.year = o.year_shown
              and (case when o.kind = 'wealth' then concat_ws(' ', d.file_name, d.description, l.name) ~ 'הצהרת\s*הון'
                        else concat_ws(' ', d.file_name, d.description, l.name) ~ '(1301|דוח\s*שנתי|דו"ח\s*שנתי)' end)) end,
        'evidence', o.evidence, 'producedOn', o.produced_on, 'sourceName', src.file_name,
        'firstSeenAt', o.first_seen_at, 'lastSeenAt', o.last_seen_at, 'updatedAt', o.updated_at,
        'historyCount', jsonb_array_length(o.history)
      )) order by o.legal_due nulls last, o.file_number)
      from public.shaam_filing_obligations o
      left join public.clients c on c.id = o.client_id
      left join public.onboarding_steps st on st.id = o.step_id
      left join public.onboarding_steps cs on cs.id = o.copy_step_id
      left join public.shaam_filing_sources src on src.id = o.source_id
      where o.user_id = v_uid and (p_client_id is null or o.client_id = p_client_id)), '[]'::jsonb),
    'sources', case when p_client_id is not null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', s.id, 'method', s.method, 'fileName', s.file_name, 'kind', s.list_kind, 'group', s.wealth_group,
        'taxYear', s.tax_year, 'producedRaw', s.produced_raw, 'producedOn', s.produced_on, 'pages', s.pages, 'status', s.status,
        'note', s.note, 'uploadedAt', s.uploaded_at, 'hasFile', s.storage_path is not null, 'sha256', s.content_sha256,
        -- 305 · «ביטול ההעלאה»: יש השפעות שלא בוטלו · מה הביטול האחרון עשה
        'canUndo', exists (select 1 from public.shaam_filing_source_effects x where x.source_id = s.id and x.undone_at is null),
        'undoneAt', s.undone_at, 'undo', s.undo_summary)) order by s.uploaded_at desc)
      from public.shaam_filing_sources s where s.user_id = v_uid), '[]'::jsonb) end);
end $$;

-- ── 6 · 154 מהשרת: קריאה שהסתיימה ⇒ אותה אצווה כמו batchFromGmf154 (src/features/shaamFiling/fromGmf154.ts) ─────────
-- ‼ התאום בדפדפן: batchFromGmf154. שינוי כאן ⇒ גם שם (ולהפך). אותו sha למקור (gmf154:<ריצה>:<סוג>) ⇒ קליטה מהדפדפן
--   של אותה ריצה = «ללא שינוי», בלי מקור שני ובלי בקשה שנייה.
create or replace function public._shaam_gmf154_batch(p_uid uuid, p_client_id text, p_filing jsonb, p_file_number text, p_run_id text, p_produced_on text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_digits text := regexp_replace(coalesce(p_file_number, ''), '\D', '', 'g'); v_file text; v_name text;
  v_known text[]; v_list_wealth text[]; v_annual jsonb := '[]'::jsonb; v_wealth jsonb := '[]'::jsonb; y jsonb; w jsonb; v_row jsonb; v_srcs jsonb := '[]'::jsonb;
  v_status text;
begin
  if v_digits = '' or v_digits ~ '^0+$' or length(v_digits) > 9 then return null; end if;
  if jsonb_typeof(p_filing->'years') is distinct from 'array' or jsonb_typeof(p_filing->'wealth') is distinct from 'array' then return null; end if;
  v_file := lpad(v_digits, 9, '0');
  v_name := coalesce(p_filing->>'name', '');
  select coalesce(array_agg(o.year_shown) filter (where o.kind = 'annual'), '{}'),
         coalesce(array_agg(o.year_shown) filter (where o.kind = 'wealth' and coalesce(sx.file_name, '') <> 'שע״ם · שאילתה 154 — מידע אודות שנות מס'), '{}')
    into v_known, v_list_wealth
    from public.shaam_filing_obligations o left join public.shaam_filing_sources sx on sx.id = o.source_id
   where o.user_id = p_uid and o.client_id = p_client_id and o.file_number = v_file;

  for y in select x.value from jsonb_array_elements(p_filing->'years') with ordinality x(value, n) order by x.n loop
    if not ((y->>'required' = 'required' and nullif(y->>'filedOn', '') is null) or (y->>'year') = any (v_known)) then continue; end if;
    v_row := jsonb_build_object('sourceKey', 'gmf154:annual', 'page', y->'page', 'line', jsonb_array_length(v_annual) + 1, 'fileNumber', v_file, 'name', v_name,
      'yearShown', y->>'year', 'required', y->>'required' = 'required', 'problems', '[]'::jsonb);
    if nullif(y->>'section', '') is not null then v_row := v_row || jsonb_build_object('section', y->>'section'); end if;
    if nullif(y->>'extension', '') is not null then
      v_row := v_row || jsonb_build_object('legalDue', y->>'extension', 'legalDueRaw',
        case when y ? 'extensionRaw' then coalesce(y->>'extensionRaw', 'null') else 'undefined' end
        || ' (ארכה' || coalesce(' · ' || nullif(y->>'extensionSource', ''), '') || ')');
    elsif nullif(y->>'legalDue', '') is not null then
      v_row := v_row || jsonb_build_object('legalDue', y->>'legalDue') || case when y->>'legalDueRaw' is not null then jsonb_build_object('legalDueRaw', y->>'legalDueRaw') else '{}'::jsonb end;
    end if;
    if y->>'filedOn' is not null then v_row := v_row || jsonb_build_object('filedOn', y->>'filedOn'); end if;
    if y->>'filedRaw' is not null then v_row := v_row || jsonb_build_object('filedOnRaw', y->>'filedRaw'); end if;
    v_annual := v_annual || v_row;
  end loop;

  for w in select x.value from jsonb_array_elements(p_filing->'wealth') with ordinality x(value, n) order by x.n loop
    if coalesce(nullif(w->>'year', ''), '0') = '0' or nullif(w->>'due', '') is null or (w->>'year') = any (v_list_wealth) then continue; end if;
    v_row := jsonb_build_object('sourceKey', 'gmf154:wealth', 'line', jsonb_array_length(v_wealth) + 1, 'fileNumber', v_file, 'name', v_name,
      'yearShown', w->>'year', 'problems', '[]'::jsonb);
    -- ‼ «הענות …» = הוגשה בתאריך הזה (295); אחרת — דרישה עם מועד
    if btrim(coalesce(w->>'text', '')) ~ '^הענות\s' then v_row := v_row || jsonb_build_object('filedOn', w->>'due', 'filedOnRaw', w->>'text');
    else v_row := v_row || jsonb_build_object('legalDue', w->>'due', 'legalDueRaw', w->>'text'); end if;
    v_wealth := v_wealth || v_row;
  end loop;

  if jsonb_array_length(v_annual) = 0 and jsonb_array_length(v_wealth) = 0 then return null; end if;
  v_status := case when coalesce((p_filing->>'complete')::boolean, false) then 'ok' else 'partial' end;
  if jsonb_array_length(v_annual) > 0 then
    v_srcs := v_srcs || jsonb_build_object('key', 'gmf154:annual', 'method', 'manual', 'fileName', 'שע״ם · שאילתה 154 — מידע אודות שנות מס',
      'sha256', 'gmf154:' || p_run_id || ':annual', 'kind', 'annual', 'producedOn', p_produced_on, 'status', v_status, 'pages', '[]'::jsonb);
  end if;
  if jsonb_array_length(v_wealth) > 0 then
    v_srcs := v_srcs || jsonb_build_object('key', 'gmf154:wealth', 'method', 'manual', 'fileName', 'שע״ם · שאילתה 154 — מידע אודות שנות מס',
      'sha256', 'gmf154:' || p_run_id || ':wealth', 'kind', 'wealth', 'producedOn', p_produced_on, 'status', v_status, 'pages', '[]'::jsonb);
  end if;
  return jsonb_build_object('sources', v_srcs, 'rows', v_annual || v_wealth);
end $$;

-- הטריגר: קריאת תיק מס הכנסה שהסתיימה ⇒ קליטה בזהות בעל המשימה. ‼ כשל כאן לא מפיל את סיום המשימה.
-- ‼ הזהות מוגדרת מקומית לטרנזקציה (set_config … true) ומוחזרת מיד אחרי — כדי ש-upsert_tax_work יבדוק בעלות כרגיל.
create or replace function public._shaam_filing_from_gmf154_job()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_batch jsonb; v_claims text; v_sub text; v_res jsonb;
begin
  if jsonb_typeof(new.result->'filing') is distinct from 'object' then return new; end if;
  v_batch := public._shaam_gmf154_batch(new.user_id, new.client_id, new.result->'filing', new.input->>'fileNumber', new.id,
    to_char((coalesce(new.finished_at, new.updated_at, now()) at time zone 'UTC')::date, 'YYYY-MM-DD'));
  if v_batch is null then return new; end if;
  v_claims := current_setting('request.jwt.claims', true);
  v_sub := current_setting('request.jwt.claim.sub', true);
  begin
    perform set_config('request.jwt.claims', jsonb_build_object('sub', new.user_id, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', new.user_id::text, true);
    if public.is_authorized() then v_res := public._shaam_filing_import(new.user_id, v_batch); end if;
    perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
    perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  exception when others then
    perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
    perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
    raise warning '305 · קליטת 154 מהמשימה % נכשלה: %', new.id, sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists trg_shaam_filing_from_gmf154_job on public.automation_jobs;
create trigger trg_shaam_filing_from_gmf154_job
  after update on public.automation_jobs
  for each row
  when (new.status = 'succeeded' and old.status is distinct from new.status and new.action_type = 'shaam.sync_income_tax_file')
  execute function public._shaam_filing_from_gmf154_job();

-- ── 7 · הרשאות ────────────────────────────────────────────────────────────────────────────────────
revoke all on function public._shaam_auto_open(uuid, uuid) from public, anon, authenticated;
revoke all on function public._shaam_filing_import(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._shaam_auto_request_untouched(text, uuid) from public, anon, authenticated;
revoke all on function public._shaam_gmf154_batch(uuid, text, jsonb, text, text, text) from public, anon, authenticated;
revoke all on function public._shaam_filing_from_gmf154_job() from public, anon, authenticated;
revoke all on function public.shaam_filing_import(jsonb) from public, anon;
revoke all on function public.shaam_filing_list(text) from public, anon;
revoke all on function public.undo_shaam_filing_source(uuid) from public, anon;
grant execute on function public.shaam_filing_import(jsonb) to authenticated;
grant execute on function public.shaam_filing_list(text) to authenticated;
grant execute on function public.undo_shaam_filing_source(uuid) to authenticated;
