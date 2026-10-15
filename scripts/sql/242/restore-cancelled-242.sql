-- ─── התאוששות 242: החזרת עבודות שבוטלו — לפני החזרת המסד לאחור (15.10.2026) ─────────────────────
-- ‼ גיא: «ודא שתוכנית ההתאוששות מכסה גם עבודות שכבר בוטלו, בלי לאבד תשובות ומסמכים ובלי להשאיר אותן ללא דרך טיפול».
--   ביטול (242) לא מוחק תשובות, עובדות, מסמכים או מיילים — רק סוגר שאלות פתוחות ומסמן את העבודה cancelled,
--   עם המצב הקודם ב-payload.removal. אחרי rollback-242 האתר הישן לא מציג עבודות שבוטלו ואין פונקציית החזרה —
--   ולכן מריצים את הקובץ הזה *לפני* rollback-242: כל עבודה שבוטלה חוזרת למצבה הקודם, בדיוק כמו «החזר…».
-- ‼ עבודה שבינתיים נפתחה במקומה עבודה חדשה לאותה זהות (אינדקס ייחודי) — לא חוזרת, ומופיעה בדוח 'superseded'
--   (המידע שלה נשאר במסד ובתיק המס; אין שתי עבודות פתוחות).
-- ‼ מריצים כ-postgres (Management API / SQL editor). פונקציה זמנית ב-pg_temp — לא נשארת במסד.
-- קודם: ייצוא לגיבוי —
--   select id, client_id, step_type, payload->'removal' as removal from public.onboarding_steps where status = 'cancelled' and payload ? 'removal';

create or replace function pg_temp.restore_cancelled_242(p_step_id text) returns jsonb language plpgsql as $$
declare st public.onboarding_steps%rowtype; r jsonb; x jsonb; v_back int := 0; v_kept int := 0;
begin
  select * into st from public.onboarding_steps where id = p_step_id for update;
  r := st.payload->'removal';
  if st.id is null or st.status <> 'cancelled' or r is null then return jsonb_build_object('id', p_step_id, 'result', 'skipped'); end if;
  begin
    update public.onboarding_steps set
      status = coalesce(r->>'prevStatus', 'in_progress'), ball = coalesce(r->>'prevBall', ball), updated_at = now(),
      payload = (payload - 'removal') || jsonb_build_object('workLog', coalesce(payload->'workLog', '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object('at', now(), 'what', 'restored', 'note', 'התאוששות 242')))
    where id = st.id;
  exception when unique_violation then
    -- ‼ נפתחה במקומה עבודה חדשה: נשארת מבוטלת כמו כל בקשה מבוטלת, המצב הקודם נשמר בארכיון (לא נמחק דבר)
    update public.onboarding_steps set payload = (payload - 'removal') || jsonb_build_object('removalArchived', r, 'recovery242', 'superseded')
     where id = st.id;
    return jsonb_build_object('id', p_step_id, 'client', st.client_id, 'type', st.step_type, 'result', 'superseded');
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
  values (st.user_id, st.id, 'status_changed', 'system', 'העבודה הוחזרה (התאוששות 242)', jsonb_build_object('what', 'tax_work_restored', 'recovery', true, 'asksBack', v_back, 'asksKept', v_kept));
  return jsonb_build_object('id', p_step_id, 'result', 'restored', 'asksBack', v_back, 'asksKept', v_kept);
end $$;

select pg_temp.restore_cancelled_242(id) as result
  from public.onboarding_steps
 where status = 'cancelled' and payload ? 'removal'
   and step_type in ('tax_file_intake', 'annual_return', 'wealth_declaration', 'tax_estimate')
 order by created_at;
