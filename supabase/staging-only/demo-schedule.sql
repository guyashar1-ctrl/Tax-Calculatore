-- ═══════════════════════════════════════════════════════════════════════════
--  «הרץ את התזמון עכשיו» — staging בלבד, להדגמה. ‼ לא מיגרציה לייצור.
--
--  בייצור ה-cron מריץ את kick_due_client_notices כל 5 דקות. ב-staging אין משימות
--  מתוזמנות (בכוונה), ולכן ההדגמה מפעילה את אותו מנגנון בלחיצה — ומדמה רק את
--  הזמן: מה שבתור יוצא עכשיו (לא בעוד 2 דקות), ובבחירה — «דלג לזמן התזכורת»: כל
--  בקשה שנמסרה נחשבת כאילו נמסרה (או הוזכרה) לפני מספר הימים שהשלב שלה מגדיר
--  לתזכורת, כדי שתזכורת אמיתית תצא בלחיצה אחת. המיילים נקלטים אצל הספק המדומה.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.demo_run_schedule(p_simulate_day boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid   uuid := auth.uid();
  v_moved int := 0;
  v_aged  int := 0;
begin
  if v_uid is null or not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_simulate_day then
    -- «דלג לזמן התזכורת»: לכל בקשה — לפי afterDays של התזכורת שלה (אותו חישוב כמו
    -- _client_notice_items), ושעה ליתר ביטחון. בלי תזכורת — יום אחד (אין לזה השפעה).
    update public.client_step_notice_state ns
       set announced_at = least(ns.announced_at, now() - make_interval(days => d.days) - interval '1 hour'),
           last_reminded_at = case when ns.last_reminded_at is null then null
                                   else least(ns.last_reminded_at, now() - make_interval(days => d.days) - interval '1 hour') end,
           reminder_backoff_until = null
      from (select s.id, least(greatest(case when (s.payload->'reminder'->>'afterDays') ~ '^\d+$'
                                             then (s.payload->'reminder'->>'afterDays')::int else 1 end, 1), 60) as days
              from public.onboarding_steps s where s.user_id = v_uid) d
     where ns.step_id = d.id;
    get diagnostics v_aged = row_count;
    update public.client_notices set idempotency_key = idempotency_key || ':demo-' || substr(md5(random()::text), 1, 6)
     where user_id = v_uid and kind = 'reminder' and idempotency_key like 'auto:reminder:%'
       and idempotency_key not like '%:demo-%';
  end if;
  update public.client_notices set due_at = now() - interval '1 second', last_kicked_at = null
   where user_id = v_uid and status = 'queued';
  get diagnostics v_moved = row_count;
  return public.kick_due_client_notices() || jsonb_build_object('advanced', v_moved, 'agedSteps', v_aged);
end;
$$;
revoke all on function public.demo_run_schedule(boolean) from public, anon;
grant execute on function public.demo_run_schedule(boolean) to authenticated;
