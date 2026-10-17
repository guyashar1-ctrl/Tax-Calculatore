-- ════════════════════════════════════════════════════════════════════════════
-- 257 · שורות מקור לדוח השנתי — שלב 1 של תוכנית הליווי (docs/PLAN-GUIDED-RETURN-PREP-2026-10-16.md §0, §2.4) — 17.10.2026
-- ════════════════════════════════════════════════════════════════════════════
-- הכלל: כל סכום בדוח מורכב משורות מקור. שורת מקור = עובדת שנת המס (tax_year_facts) עם: הסכום (רכיב בתוך value), המסמך
-- (evidence_id), השאלה בשאלון (item_key / ask_id), האדם (subject_role), השנה (tax_year), ומפתח השורה במסמך (line_key —
-- למשל ‎ni.health‎). השדה בטופס 1301 הוא סיכום מחושב של השורות (features/annualReturn/engine.ts) — לא נשמר כמספר.
-- ‼ אין טבלה שנייה של «מספרים לדוח»: מרחיבים את העובדות הקיימות (229) בשתי עמודות ובפונקציה אחת.
-- ‼ זהות שורה = (מסמך, line_key). שמירה חוזרת של אותו מסמך מחליפה את כל שורותיו («הוחלפה», עם supersedes); אישור מתקן
--   מחליף גם את שורות המסמך הקודם (p_replaces_evidence_id); אישור נוסף = מסמך חדש ⇒ שורות מתווספות.
-- ‼ המשרד מזין ⇒ העובדה מאושרת מיד (אישור אחד של גיא על גרסת הדוח בסוף — הכרעת 16.10), עם «מי הזין ומתי» (entered_by, created_at).
-- ‼ המספרים 252–256 שמורים לתוכנית «בקשה אחת»; 233 (annual_returns) מוחלת יחד עם הקובץ הזה.
--   בידוד: scripts/sql/233/test-233-257.pglite.mjs · החלה: scripts/sql/233/apply-staging.mjs · חזרה: scripts/sql/257/rollback-257.sql.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.tax_year_facts add column if not exists line_key   text;
alter table public.tax_year_facts add column if not exists entered_by uuid references auth.users(id);
create index if not exists tax_year_facts_evidence_idx on public.tax_year_facts (evidence_id) where evidence_id is not null;

-- ── הזנת שורות מקור ממסמך אחד ──
-- p_evidence_id — מסמך קיים (שהלקוח העלה או שהמשרד רשם); null ⇒ נרשם מסמך חדש מ-p_evidence (docKind, subjectRole, entityKind,
-- entityRef, taxYear, fileName, documentId, periodFrom, periodTo) — גם בלי קובץ («הזנה מהנייר»).
-- p_lines — [{ lineKey, itemKey, subjectRole, entityKind, entityRef, taxYear, value, periodFrom, periodTo, note, requestId, askId }]
--   value: מספר, או אובייקט רכיבים ({"gross": 152855}) — כמו שהמנוע קורא (readComponents).
create or replace function public.record_source_lines(p_client_id text, p_evidence_id uuid, p_evidence jsonb, p_lines jsonb, p_replaces_evidence_id uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  c public.clients%rowtype; e public.tax_evidence%rowtype; x jsonb;
  v_ev uuid; v_year int; v_ids uuid[] := '{}'; v_prev uuid; v_sup int := 0; v_items jsonb := public._tax_year_items();
  v_from date; v_to date; v_answer text; v_role text;
begin
  c := public._tax_year_client(p_client_id);
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then return jsonb_build_object('ok', false, 'error', 'no_lines'); end if;

  -- אימות כל השורות לפני כל כתיבה
  for x in select value from jsonb_array_elements(p_lines) loop
    if nullif(trim(coalesce(x->>'lineKey','')), '') is null then return jsonb_build_object('ok', false, 'error', 'line_key_required'); end if;
    if not (v_items ? (x->>'itemKey')) then return jsonb_build_object('ok', false, 'error', 'unknown_item', 'itemKey', x->>'itemKey'); end if;
    if coalesce(x->>'subjectRole','') not in ('client','spouse','couple') then return jsonb_build_object('ok', false, 'error', 'bad_subject'); end if;
    if (x->>'taxYear') is null then return jsonb_build_object('ok', false, 'error', 'year_required'); end if;
    v_answer := coalesce(x->>'answer', 'value');
    if v_answer not in ('value','zero') then return jsonb_build_object('ok', false, 'error', 'bad_answer'); end if;
    if v_answer = 'value' and (x->'value') is null then return jsonb_build_object('ok', false, 'error', 'bad_value', 'lineKey', x->>'lineKey'); end if;
    if v_answer = 'value' and jsonb_typeof(x->'value') not in ('number','object') then return jsonb_build_object('ok', false, 'error', 'bad_value', 'lineKey', x->>'lineKey'); end if;
  end loop;

  -- המסמך
  if p_evidence_id is not null then
    select * into e from public.tax_evidence where id = p_evidence_id for update;
    if e.id is null or e.client_id <> c.id then return jsonb_build_object('ok', false, 'error', 'evidence_not_found'); end if;
    -- הזנה של המשרד מהמסמך = המשרד בדק אותו; «לא תואם» שנקבע במפורש נשאר ואינו נדרס
    if e.identity_match = 'mismatch' or e.period_match = 'mismatch' then return jsonb_build_object('ok', false, 'error', 'evidence_mismatch'); end if;
    update public.tax_evidence set extraction = 'office_entered', identity_match = 'match', period_match = 'match', review = 'accepted',
      reviewed_by = auth.uid(), reviewed_at = now() where id = e.id;
    v_ev := e.id;
  else
    if p_evidence is null or jsonb_typeof(p_evidence) <> 'object' or nullif(p_evidence->>'docKind','') is null then return jsonb_build_object('ok', false, 'error', 'evidence_required'); end if;
    if coalesce(p_evidence->>'subjectRole','') not in ('client','spouse','couple') then return jsonb_build_object('ok', false, 'error', 'bad_subject'); end if;
    v_year := (p_evidence->>'taxYear')::int;
    insert into public.tax_evidence (user_id, client_id, tax_year, doc_kind, subject_role, entity_kind, entity_ref, period_from, period_to, document_id, file_name,
      received_via, extraction, identity_match, period_match, review, reviewed_by, reviewed_at, note)
    values (c.user_id, c.id, v_year, p_evidence->>'docKind', p_evidence->>'subjectRole', nullif(p_evidence->>'entityKind',''), nullif(p_evidence->>'entityRef',''),
      coalesce((p_evidence->>'periodFrom')::date, case when v_year is not null then make_date(v_year, 1, 1) end),
      coalesce((p_evidence->>'periodTo')::date, case when v_year is not null then make_date(v_year, 12, 31) end),
      nullif(p_evidence->>'documentId',''), nullif(p_evidence->>'fileName',''),
      'office', 'office_entered', 'match', 'match', 'accepted', auth.uid(), now(), nullif(p_evidence->>'note',''))
    returning id into v_ev;
  end if;
  perform pg_advisory_xact_lock(hashtext('source_lines:' || v_ev::text));

  -- אישור מתקן: שורות המסמך הקודם יוצאות מהחישוב (נשארות בהיסטוריה)
  if p_replaces_evidence_id is not null then
    if not exists (select 1 from public.tax_evidence where id = p_replaces_evidence_id and client_id = c.id) then return jsonb_build_object('ok', false, 'error', 'replaced_not_found'); end if;
    update public.tax_year_facts set status = 'superseded' where evidence_id = p_replaces_evidence_id and status in ('accepted','pending');
    get diagnostics v_sup = row_count;
    update public.tax_evidence set note = concat_ws(' · ', nullif(note, ''), 'הוחלף באישור מתקן ' || v_ev::text) where id = p_replaces_evidence_id;
  end if;

  -- שמירה חוזרת של אותו מסמך מחליפה את כל שורותיו
  for x in select value from jsonb_array_elements(p_lines) loop
    v_year := (x->>'taxYear')::int;
    v_role := x->>'subjectRole';
    v_answer := coalesce(x->>'answer', 'value');
    v_from := coalesce((x->>'periodFrom')::date, make_date(v_year, 1, 1));
    v_to := coalesce((x->>'periodTo')::date, make_date(v_year, 12, 31));
    select id into v_prev from public.tax_year_facts where evidence_id = v_ev and line_key = x->>'lineKey' and status = 'accepted' order by created_at desc limit 1;
    insert into public.tax_year_facts (user_id, client_id, tax_year, item_key, subject_role, entity_kind, entity_ref, period_kind, period_from, period_to,
      answer, value, basis, source, request_id, ask_id, evidence_id, line_key, entered_by, status, decided_by, decided_at, supersedes, note)
    values (c.user_id, c.id, v_year, x->>'itemKey', v_role, nullif(x->>'entityKind',''), nullif(x->>'entityRef',''), coalesce(x->>'periodKind','year'), v_from, v_to,
      v_answer, case when v_answer = 'value' then x->'value' else to_jsonb(0) end, 'final', 'document', nullif(x->>'requestId',''), nullif(x->>'askId','')::uuid,
      v_ev, x->>'lineKey', auth.uid(), 'accepted', auth.uid(), now(), v_prev, nullif(x->>'note',''))
    returning id into v_prev;
    v_ids := v_ids || v_prev;
  end loop;
  update public.tax_year_facts set status = 'superseded' where evidence_id = v_ev and status in ('accepted','pending') and not (id = any(v_ids));
  return jsonb_build_object('ok', true, 'evidenceId', v_ev, 'factIds', to_jsonb(v_ids), 'superseded', v_sup + (select count(*) from public.tax_year_facts where evidence_id = v_ev and status = 'superseded'));
end $$;

revoke all on function public.record_source_lines(text, uuid, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.record_source_lines(text, uuid, jsonb, jsonb, uuid) to authenticated;
