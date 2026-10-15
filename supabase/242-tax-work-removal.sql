-- ════════════════════════════════════════════════════════════════════════════
--  242 · הסרת עבודת מס: מחיקה / ביטול / החזרה (14.10.2026)
-- ════════════════════════════════════════════════════════════════════════════
--  גיא: אין דרך להסיר עבודה שנפתחה בטעות. ‼ «אל תמחק בשקט מידע מאושר בתיק, מסמכים משותפים או היסטוריה».
--  עד היום: אין פעולה לעבודות מס; advance_onboarding_step('cancel') מבטל שורה אחת בלי השאלות שלה —
--  שאלות פתוחות נשארו בדף האישי ונחסמו לעבודה חדשה לאותה שנה (tax_info_asks_open_uidx).
--
--  הכללים — זהים ל-src/features/taxYear/workRemoval.ts:
--   · delete — כלום לא יצא מהמשרד: השאלון לא פורסם, אין תשובה, עובדה, מסמך, מייל או הערכה מאושרת/מפורסמת.
--     נמחקים: העבודה, «השלמת המידע» שלה וטיוטת השאלות (cascade), טיוטת הערכה (cascade). הכרטיס לא משתנה.
--   · cancel — משהו כבר יצא או התקבל. העבודה ו«השלמת המידע» → cancelled (יורדות מ«בקשות» ומהדף האישי —
--     build_client_portal מסנן cancelled). שאלות טיוטה/פתוחות → cancelled: הלקוח לא יכול לענות (המצב נבדק
--     ב-portal_submit_tax_info) והשאלה לא חוסמת עבודה חדשה. תשובות, עובדות, מסמכים, גרסאות הערכה ומיילים — נשארים.
--     המצב הקודם נרשם ב-payload.removal, כדי שאפשר יהיה להחזיר.
--   · עבודה שהושלמה — לא נמחקת ולא מבוטלת (יסודות הבקשות §8).
--   · restore — רק לעבודה שבוטלה כאן, ורק אם אין בינתיים עבודה פתוחה לאותה זהות (האינדקסים הייחודיים).
--
--  ‼ עבודות בלבד: tax_file_intake / annual_return / wealth_declaration / tax_estimate.
--  ‼ בעלים: _tax_year_client (‎user_id = auth.uid()‎ ו-is_authorized). אין שינוי בטבלאות; רק פונקציות.
-- ════════════════════════════════════════════════════════════════════════════

-- ── העובדות שההחלטה נשענת עליהן ──────────────────────────────────────────────
create or replace function public._tax_work_removal_facts(p_step_id text)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with st as (select * from public.onboarding_steps where id = p_step_id),
  infos as (select i.* from public.onboarding_steps i, st
             where i.step_type = 'info_collection' and i.payload->>'parentStepId' = st.id),
  asks as (select a.* from public.tax_info_asks a where a.parent_step_id = p_step_id or a.step_id in (select id from infos))
  select jsonb_build_object(
    'status', (select status from st),
    'stepType', (select step_type from st),
    'infoPublished', exists (select 1 from infos where published_at is not null),
    'asksDraft', (select count(*) from asks where state = 'draft'),
    'asksOpen', (select count(*) from asks where state in ('published', 'unavailable')),
    'asksAnswered', (select count(*) from asks where state = 'answered'),
    'factsAccepted', (select count(*) from public.tax_year_facts f where (f.ask_id in (select id from asks) or f.request_id = p_step_id) and f.status = 'accepted'),
    'factsPending', (select count(*) from public.tax_year_facts f where (f.ask_id in (select id from asks) or f.request_id = p_step_id) and f.status = 'pending'),
    'documents', (select count(*) from public.tax_evidence e where e.ask_id in (select id from asks)),
    -- ‼ email_messages.step_id הוא uuid, ומזהה הבקשה הוא אותו uuid בלי מקפים (staging 15.10: 6 מתוך 7 מתחברים רק כך).
    --   השוואה ישירה (::text) לא מוצאת אף מייל — ועבודה שנשלח ממנה מייל הייתה נראית «ניתנת למחיקה».
    'emails', (select count(*) from public.email_messages m where replace(m.step_id::text, '-', '') = p_step_id
                 or replace(m.step_id::text, '-', '') in (select id from infos)),
    'estimatesApproved', (select count(*) from public.tax_estimates e where e.request_id = p_step_id and e.status in ('approved', 'superseded')),
    'estimatesPublished', (select count(*) from public.tax_estimates e where e.request_id = p_step_id and e.published_at is not null),
    'estimatesDraft', (select count(*) from public.tax_estimates e where e.request_id = p_step_id and e.status = 'draft'),
    -- ‼ מחיקה הייתה מוחקת בשרשור גם את מה שנמסר ללקוח (214) ואת יומן העבודה — ולכן כל אחד מהם הופך את ההסרה לביטול
    'notices', (select count(*) from public.client_notice_items n where n.step_id = p_step_id or n.step_id in (select id from infos))
             + (select count(*) from public.client_step_notice_state s where (s.step_id = p_step_id or s.step_id in (select id from infos)) and s.announced_version > 0),
    'notes', (select count(*) from public.onboarding_events ev where (ev.step_id = p_step_id or ev.step_id in (select id from infos))
               and (ev.type = 'note' or ev.meta->>'what' in ('tax_work_cancelled', 'tax_work_restored')))
  )
$$;
revoke all on function public._tax_work_removal_facts(text) from public, anon, authenticated;

create or replace function public._tax_work_removal_mode(f jsonb)
returns text language sql immutable set search_path to 'public' as $$
  select case
    when f->>'status' in ('completed', 'verified', 'skipped', 'cancelled') then 'none'
    when (f->>'infoPublished')::boolean
      or (f->>'asksAnswered')::int > 0 or (f->>'factsAccepted')::int + (f->>'factsPending')::int > 0
      or (f->>'documents')::int > 0 or (f->>'emails')::int > 0
      or (f->>'estimatesApproved')::int > 0 or (f->>'estimatesPublished')::int > 0
      or coalesce((f->>'notices')::int, 0) > 0 or coalesce((f->>'notes')::int, 0) > 0 then 'cancel'
    else 'delete' end
$$;
revoke all on function public._tax_work_removal_mode(jsonb) from public, anon, authenticated;

-- ── מה יקרה אם מסירים (לחלון האישור) ──────────────────────────────────────────
create or replace function public.tax_work_removal_check(p_step_id text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare st public.onboarding_steps%rowtype; f jsonb;
begin
  select * into st from public.onboarding_steps where id = p_step_id;
  if st.id is null or st.step_type not in ('tax_file_intake', 'annual_return', 'wealth_declaration', 'tax_estimate') then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform public._tax_year_client(st.client_id);
  f := public._tax_work_removal_facts(st.id);
  return jsonb_build_object('ok', true, 'mode', public._tax_work_removal_mode(f), 'facts', f,
    'restorable', st.status = 'cancelled' and st.payload ? 'removal');
end $$;
revoke all on function public.tax_work_removal_check(text) from public, anon;
grant execute on function public.tax_work_removal_check(text) to authenticated;

-- ── הסרה ─────────────────────────────────────────────────────────────────────
-- ‼ p_mode — מה שהמסך הציג למשתמש. אם בינתיים המצב השתנה (למשל הלקוח ענה), השרת לא מוחק: 'changed'.
create or replace function public.remove_tax_work(p_step_id text, p_mode text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  st public.onboarding_steps%rowtype;
  f jsonb; v_mode text; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_asks jsonb; v_infos jsonb; v_n int := 0;
begin
  select * into st from public.onboarding_steps where id = p_step_id for update;
  if st.id is null or st.step_type not in ('tax_file_intake', 'annual_return', 'wealth_declaration', 'tax_estimate') then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform public._tax_year_client(st.client_id);
  f := public._tax_work_removal_facts(st.id);
  v_mode := public._tax_work_removal_mode(f);
  if v_mode = 'none' then return jsonb_build_object('ok', false, 'error', case when st.status = 'cancelled' then 'already_cancelled' else 'completed' end); end if;
  -- ‼ מחיקה רק כשהמצב עדיין «כלום לא יצא»; ביטול מותר גם כשאפשר היה למחוק (בחירה לשמור היסטוריה)
  if p_mode = 'delete' and v_mode <> 'delete' then return jsonb_build_object('ok', false, 'error', 'changed', 'mode', v_mode, 'facts', f); end if;
  if p_mode not in ('delete', 'cancel') then return jsonb_build_object('ok', false, 'error', 'bad_mode'); end if;

  if p_mode = 'delete' then
    delete from public.onboarding_steps where step_type = 'info_collection' and payload->>'parentStepId' = st.id;
    delete from public.onboarding_steps where id = st.id;
    return jsonb_build_object('ok', true, 'mode', 'delete');
  end if;

  -- ביטול: השאלות שעוד לא נענו נסגרות; המצב הקודם נשמר להחזרה
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'state', a.state)), '[]'::jsonb) into v_asks
    from public.tax_info_asks a
   where (a.parent_step_id = st.id or a.step_id in (select id from public.onboarding_steps where step_type = 'info_collection' and payload->>'parentStepId' = st.id))
     and a.state in ('draft', 'published', 'unavailable');
  update public.tax_info_asks set state = 'cancelled'
   where id in (select (x->>'id')::uuid from jsonb_array_elements(v_asks) x);
  get diagnostics v_n = row_count;

  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'status', i.status)), '[]'::jsonb) into v_infos
    from public.onboarding_steps i where i.step_type = 'info_collection' and i.payload->>'parentStepId' = st.id and i.status <> 'cancelled';
  update public.onboarding_steps set status = 'cancelled', needs_attention = false, updated_at = now()
   where id in (select x->>'id' from jsonb_array_elements(v_infos) x);

  update public.onboarding_steps set
    status = 'cancelled', needs_attention = false, updated_at = now(),
    payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
      'removal', jsonb_strip_nulls(jsonb_build_object('at', now(), 'by', auth.uid(), 'reason', v_reason,
        'prevStatus', st.status, 'prevBall', st.ball, 'asks', v_asks, 'infos', v_infos)),
      'workLog', coalesce(payload->'workLog', '[]'::jsonb) || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'at', now(), 'by', auth.uid(), 'what', 'cancelled', 'note', v_reason))))
  where id = st.id;
  insert into public.onboarding_events (user_id, step_id, type, actor, note, meta)
  values (st.user_id, st.id, 'status_changed', 'accountant', coalesce(v_reason, 'העבודה בוטלה'),
          jsonb_build_object('what', 'tax_work_cancelled', 'from', st.status, 'asksClosed', v_n));
  return jsonb_build_object('ok', true, 'mode', 'cancel', 'asksClosed', v_n);
end $$;
revoke all on function public.remove_tax_work(text, text, text) from public, anon;
grant execute on function public.remove_tax_work(text, text, text) to authenticated;

-- ── החזרה של עבודה שבוטלה ─────────────────────────────────────────────────────
-- ‼ שאלה שבינתיים נפתחה מחדש בעבודה אחרת (אותו פריט) לא חוזרת — נשארת סגורה, והמסך אומר כמה.
create or replace function public.restore_tax_work(p_step_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  st public.onboarding_steps%rowtype; r jsonb; x jsonb; v_back int := 0; v_kept int := 0;
begin
  select * into st from public.onboarding_steps where id = p_step_id for update;
  if st.id is null or st.step_type not in ('tax_file_intake', 'annual_return', 'wealth_declaration', 'tax_estimate') then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform public._tax_year_client(st.client_id);
  r := st.payload->'removal';
  if st.status <> 'cancelled' or r is null then return jsonb_build_object('ok', false, 'error', 'not_cancelled'); end if;
  begin
    update public.onboarding_steps set
      status = coalesce(r->>'prevStatus', 'in_progress'), ball = coalesce(r->>'prevBall', ball), updated_at = now(),
      payload = (payload - 'removal') || jsonb_build_object('workLog', coalesce(payload->'workLog', '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object('at', now(), 'by', auth.uid(), 'what', 'restored')))
    where id = st.id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'superseded');
  end;
  for x in select * from jsonb_array_elements(coalesce(r->'infos', '[]'::jsonb)) loop
    begin
      update public.onboarding_steps set status = x->>'status', updated_at = now() where id = x->>'id' and status = 'cancelled';
    exception when unique_violation then null;
    end;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(r->'asks', '[]'::jsonb)) loop
    begin
      update public.tax_info_asks set state = x->>'state' where id = (x->>'id')::uuid and state = 'cancelled';
      if found then v_back := v_back + 1; end if;
    exception when unique_violation then v_kept := v_kept + 1;
    end;
  end loop;
  insert into public.onboarding_events (user_id, step_id, type, actor, note, meta)
  values (st.user_id, st.id, 'status_changed', 'accountant', 'העבודה הוחזרה', jsonb_build_object('what', 'tax_work_restored', 'asksBack', v_back, 'asksKept', v_kept));
  return jsonb_build_object('ok', true, 'asksBack', v_back, 'asksKept', v_kept);
end $$;
revoke all on function public.restore_tax_work(text) from public, anon;
grant execute on function public.restore_tax_work(text) to authenticated;
