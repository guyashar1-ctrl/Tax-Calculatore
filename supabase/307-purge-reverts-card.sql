-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 307 · «מחק לגמרי» מחזיר גם את הכרטיס (27.10.2026)
-- ‼ גיא: «פתחתי דוח ואז מחקתי אותו ואז פתחתי מחדש — כאילו לא נמחק ונשאר מפעם קודמת»; «כן — יחזיר גם את מה שהשאלון
--   עדכן בכרטיס (רק מה שלא השתנה מאז) וימחק הצעות שנשארו בלי מקור».
-- ‼ למה: 266 מחק את העובדות, אבל העדכונים שהן הכניסו לכרטיס (tax_fact_changes, source_ref = 'tax_year_fact:<id>') —
--   אושרו לבד (useAutoAccept) ונשארו; והצעות שעוד לא הוחלטו נשארו יתומות. כך השאלון הבא «ידע» את התשובות הקודמות.
-- ‼ הכלל:
--   · עדכון שאושר ⇒ מוחזר רק אם כל שדה בו עדיין בדיוק מה שהוא כתב (מהחדש לישן — שרשרת עדכונים לאותו שדה נפרמת
--     לפי הסדר). שדה שהשתנה מאז (ידנית, מרשות, משאלון אחר) ⇒ העדכון כולו נשאר ונספר ב«נשאר».
--   · «spouse» ממוזג (288: spouse || patch) ⇒ מה שנכתב = הישן || patch, וההחזרה מציבה את הישן עצמו (לא מיזוג).
--     השם והת.ז. של בן/בת הזוג נשארים בעמודות השטוחות (spouse_first_name…) — מהן הם נזרעים שוב (recordToCard.personPlan).
--   · field_meta של שדה שהוחזר ⇒ לפי העדכון האחרון שעדיין עומד לאותו שדה; אין כזה ⇒ בלי רשומה («לא נשאל»).
--   · עדכון שהוחזר ⇒ status 'superseded' + הערה (היסטוריה, לא נמחק). הצעה ממתינה ⇒ 'rejected' + הערה.
--   · לפני הכול — הכרטיס והעדכונים נשמרים בעותק הנסתר (tax_work_trash.snapshot: clientBefore, cardChanges).
-- חזרה: scripts/sql/307/rollback-307.sql (מחזיר את purge_tax_work של 266 ומסיר את הפונקציות החדשות)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- «אותו ערך» כמו שהכרטיס שומר אותו: '' ו-null זהים (עמודות טקסט נשמרות nullif '')
create or replace function public._tax_card_same(a jsonb, b jsonb)
returns boolean language sql immutable set search_path to 'public' as $$
  select coalesce(case when a is null or a = 'null'::jsonb or a = '""'::jsonb then null else a end, 'null'::jsonb)
       = coalesce(case when b is null or b = 'null'::jsonb or b = '""'::jsonb then null else b end, 'null'::jsonb);
$$;
revoke all on function public._tax_card_same(jsonb, jsonb) from public, anon, authenticated;

-- p_apply = false ⇒ רק הספירה (לחלון האישור) — אותו מעבר בדיוק, על «כרטיס מדומה» (v_virt)
create or replace function public._tax_work_card_undo(p_client_id text, p_fact_ids text[], p_apply boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_refs text[] := array(select 'tax_year_fact:' || x from unnest(coalesce(p_fact_ids, '{}'::text[])) x);
  r public.tax_fact_changes%rowtype;
  v_prev public.tax_fact_changes%rowtype;
  k text; v_cur jsonb; v_ok boolean; v_wrote jsonb; v_back jsonb; v_match boolean;
  v_virt jsonb := '{}'::jsonb; v_step jsonb;
  v_undone int := 0; v_kept int := 0; v_dropped int := 0;
begin
  if p_apply then perform 1 from public.clients where id = p_client_id for update; end if;
  select count(*) into v_dropped from public.tax_fact_changes
   where client_id = p_client_id and status = 'pending' and source_ref = any(v_refs);
  if p_apply and v_dropped > 0 then
    update public.tax_fact_changes
       set status = 'rejected', decided_by = auth.uid(), decided_at = now(), note = concat_ws(' · ', note, 'המקור נמחק («מחק לגמרי»)')
     where client_id = p_client_id and status = 'pending' and source_ref = any(v_refs);
  end if;

  for r in select * from public.tax_fact_changes
            where client_id = p_client_id and status = 'accepted' and source_ref = any(v_refs)
            order by coalesce(decided_at, created_at) desc, created_at desc, id desc loop
    v_match := jsonb_typeof(r.new_value -> 'patch') = 'object' and r.new_value -> 'patch' <> '{}'::jsonb;
    if v_match then
      for k in select jsonb_object_keys(r.new_value -> 'patch') loop
        if v_virt ? k then v_cur := v_virt -> k; v_ok := true;
        else select f.out_current, f.out_ok into v_cur, v_ok from public._tax_fact_field_op(p_client_id, k, false, null, null) f;
        end if;
        v_wrote := r.new_value -> 'patch' -> k;
        if k = 'spouse' and jsonb_typeof(v_wrote) = 'object' then
          v_wrote := (case when jsonb_typeof(r.old_value -> 'patch' -> k) = 'object' then r.old_value -> 'patch' -> k else '{}'::jsonb end) || v_wrote;
        end if;
        if not coalesce(v_ok, false) or not public._tax_card_same(v_cur, v_wrote) then v_match := false; end if;
      end loop;
    end if;
    if not v_match then v_kept := v_kept + 1; continue; end if;

    v_step := '{}'::jsonb;
    for k in select jsonb_object_keys(r.new_value -> 'patch') loop
      v_step := v_step || jsonb_build_object(k, coalesce(r.old_value -> 'patch' -> k, 'null'::jsonb));
    end loop;

    if p_apply then
      begin
        update public.tax_fact_changes
           set status = 'superseded', note = concat_ws(' · ', note, 'הוחזר — הדוח נמחק («מחק לגמרי»)')
         where id = r.id;
        for k in select jsonb_object_keys(v_step) loop
          v_back := nullif(v_step -> k, 'null'::jsonb);
          if k = 'spouse' then
            update public.clients set spouse = case when jsonb_typeof(v_back) = 'object' then v_back end where id = p_client_id;
          else
            perform public._tax_fact_field_op(p_client_id, k, true, v_back, 'tax_work_purge');
          end if;
          select * into v_prev from public.tax_fact_changes
           where client_id = p_client_id and status = 'accepted' and new_value -> 'patch' ? k
           order by coalesce(decided_at, created_at) desc, created_at desc limit 1;
          update public.clients set field_meta = case when v_prev.id is null then coalesce(field_meta, '{}'::jsonb) - k
              else coalesce(field_meta, '{}'::jsonb) || jsonb_build_object(k, jsonb_build_object('source', v_prev.source,
                'syncedAt', to_char(coalesce(v_prev.decided_at, v_prev.created_at) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) end
           where id = p_client_id;
        end loop;
      exception when others then
        v_kept := v_kept + 1; continue;
      end;
    end if;
    v_virt := v_virt || v_step;
    v_undone := v_undone + 1;
  end loop;
  return jsonb_build_object('undone', v_undone, 'kept', v_kept, 'dropped', v_dropped);
end $$;
revoke all on function public._tax_work_card_undo(text, text[], boolean) from public, anon, authenticated;

-- p_dry_run = true ⇒ רק הספירה (לחלון האישור). ‼ אותה ספירה כמו המחיקה — מקור אחד.
create or replace function public.purge_tax_work(p_step_id text, p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  st public.onboarding_steps%rowtype;
  sc jsonb; v_counts jsonb; v_fact_ids text[]; v_card jsonb;
begin
  select * into st from public.onboarding_steps where id = p_step_id for update;
  if st.id is null or st.step_type not in ('tax_file_intake', 'annual_return', 'wealth_declaration', 'tax_estimate') then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform public._tax_year_client(st.client_id);
  if st.status in ('completed', 'verified', 'skipped') then return jsonb_build_object('ok', false, 'error', 'completed'); end if;
  sc := public._tax_work_purge_scope(st.id);
  v_fact_ids := array(select x->>'id' from jsonb_array_elements(sc->'facts') x);
  v_card := public._tax_work_card_undo(st.client_id, v_fact_ids, false);
  v_counts := jsonb_build_object(
    'answers', (select count(*) from jsonb_array_elements(sc->'asks') a where a->>'state' = 'answered'),
    'asks', jsonb_array_length(sc->'asks'),
    'facts', jsonb_array_length(sc->'facts'),
    'files', jsonb_array_length(sc->'documents'),
    'returns', jsonb_array_length(sc->'annualReturns'),
    'estimates', jsonb_array_length(sc->'estimates'),
    'cardUndo', (v_card->>'undone')::int,
    'cardKept', (v_card->>'kept')::int,
    'cardDropped', (v_card->>'dropped')::int);
  if coalesce(p_dry_run, false) then return jsonb_build_object('ok', true, 'dryRun', true, 'counts', v_counts); end if;

  -- ‼ לפני ההחזרה: הכרטיס כפי שהוא והעדכונים שנוגעים בעבודה — לשחזור ידני במקרה של טעות
  sc := sc || jsonb_build_object(
    'clientBefore', (select to_jsonb(c) from public.clients c where c.id = st.client_id),
    'cardChanges', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.tax_fact_changes x
                     where x.client_id = st.client_id and x.source_ref = any(array(select 'tax_year_fact:' || f from unnest(v_fact_ids) f))));
  insert into public.tax_work_trash (user_id, client_id, step_id, step_type, title, deleted_by, counts, snapshot)
  values (st.user_id, st.client_id, st.id, st.step_type, st.payload->>'title', auth.uid(), v_counts, sc);

  v_card := public._tax_work_card_undo(st.client_id, v_fact_ids, true);
  v_counts := v_counts || jsonb_build_object('cardUndo', (v_card->>'undone')::int, 'cardKept', (v_card->>'kept')::int, 'cardDropped', (v_card->>'dropped')::int);

  -- קישורים מבחוץ לעובדות ולראיות שנמחקות — מנותקים, לא נמחקים (NO ACTION)
  update public.tax_year_facts set supersedes = null
   where supersedes in (select (x->>'id')::uuid from jsonb_array_elements(sc->'facts') x)
     and id not in (select (x->>'id')::uuid from jsonb_array_elements(sc->'facts') x);
  update public.tax_year_facts set evidence_id = null
   where evidence_id in (select (x->>'id')::uuid from jsonb_array_elements(sc->'evidence') x)
     and id not in (select (x->>'id')::uuid from jsonb_array_elements(sc->'facts') x);
  delete from public.tax_card_transfers where fact_id in (select (x->>'id')::uuid from jsonb_array_elements(sc->'facts') x);
  delete from public.tax_year_facts where id in (select (x->>'id')::uuid from jsonb_array_elements(sc->'facts') x);
  delete from public.tax_evidence where id in (select (x->>'id')::uuid from jsonb_array_elements(sc->'evidence') x);
  delete from public.documents where id in (select x->>'id' from jsonb_array_elements(sc->'documents') x);
  -- העבודה ובקשות־הבת — השאלות, גרסאות הדוח/ההערכה, האירועים וההודעות יורדים איתן (cascade)
  delete from public.onboarding_steps where id in (select x->>'id' from jsonb_array_elements(sc->'steps') x);
  return jsonb_build_object('ok', true, 'counts', v_counts);
end $$;
revoke all on function public.purge_tax_work(text, boolean) from public, anon;
grant execute on function public.purge_tax_work(text, boolean) to authenticated;
