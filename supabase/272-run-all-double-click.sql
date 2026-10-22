-- ═══════════════════════════════════════════════════════════════════════════
-- 272 · «הפעל הכול» — לחיצה שנייה לא שולחת שוב את מי שכבר בדרך (21.10.2026)
--
-- המקרה: ליאת ואוריה. לחיצה שנייה, כשהמסך עוד לא ידע שב״ל של ליאת כבר רץ, הכניסה לתור
-- «המשך» לליאת (אחרי המשימה של אוריה) ואחר כך שוב לאוריה. העובד מצא שייפוי הכוח כבר
-- קיים ולא הזין שוב — אבל זו פנייה מיותרת לרשות. כאן השרת מסרב לייצר «המשך» לאדם/הגשה
-- שכבר יש לו/ה משימה פתוחה, או שהופעל/ה אחרי ה«המשך» הקודם שלו/ה ועוד לא הסתיים.
-- (הדפדפן בודק גם הוא לפני השליחה; זה הגיבוי בשרת.)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.create_automation_job_after(
  p_client_id text, p_action_type text, p_input jsonb, p_after_job_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid   uuid := auth.uid();
  v_after public.automation_jobs;
  v_open  public.automation_jobs;
  v_f     public.automation_job_followups;
  v_who   text := coalesce(p_input->>'submissionKey', p_input->>'role', '');
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;
  if not exists (select 1 from public.clients where id = p_client_id and user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'client_not_found');
  end if;
  select * into v_after from public.automation_jobs where id = p_after_job_id and user_id = v_uid;
  if v_after.id is null then return jsonb_build_object('ok', false, 'error', 'after_job_not_found'); end if;

  -- ‼ 272: לאותו אדם/הגשה כבר יש משימה פתוחה ⇒ היא התשובה, לא «המשך» נוסף.
  select * into v_open from public.automation_jobs
   where client_id = p_client_id and action_type = p_action_type
     and status in ('queued', 'running', 'needs_human')
     and coalesce(input->>'submissionKey', input->>'role', '') = v_who
   order by created_at desc limit 1;
  if v_open.id is not null then
    return jsonb_build_object('ok', true, 'created', false, 'job', to_jsonb(v_open), 'already', true);
  end if;

  if v_after.status not in ('queued', 'running', 'needs_human') then
    return public.create_automation_job(p_client_id, p_action_type, p_input) || jsonb_build_object('immediate', true);
  end if;

  select * into v_f from public.automation_job_followups
   where client_id = p_client_id and action_type = p_action_type and status = 'waiting'
     and coalesce(input->>'submissionKey', input->>'role', '') = v_who
   order by created_at desc limit 1;
  if v_f.id is not null then
    if exists (select 1 from public.automation_jobs j where j.id = v_f.after_job_id
                and j.status in ('queued', 'running', 'needs_human')) then
      return jsonb_build_object('ok', true, 'created', false, 'followup', to_jsonb(v_f));
    end if;
    update public.automation_job_followups
       set status = 'cancelled', note = 'הוחלף בהפעלה חדשה', updated_at = now()
     where id = v_f.id;
  end if;

  insert into public.automation_job_followups (user_id, client_id, action_type, input, after_job_id)
  values (v_uid, p_client_id, p_action_type, coalesce(p_input, '{}'::jsonb), p_after_job_id)
  returning * into v_f;
  return jsonb_build_object('ok', true, 'created', true, 'followup', to_jsonb(v_f));
end;
$$;
revoke all on function public.create_automation_job_after(text, text, jsonb, text) from public, anon;
grant execute on function public.create_automation_job_after(text, text, jsonb, text) to authenticated;
