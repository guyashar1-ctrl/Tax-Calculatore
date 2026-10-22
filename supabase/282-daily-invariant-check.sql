-- ═══════════════════════════════════════════════════════════════════════════
-- 282 · בדיקה יומית שקטה של הכללים החיים (docs/INVARIANTS.md) (22.10.2026)
--
-- גיא אישר (21.10.2026) «בדיקה יומית שקטה באתר החי» אחרי ליאת ואוריה: טופס שבו ב«בן זוג רשום»
-- חותם/ת מי שאינו/ה הרשום/ה נראה רק בעין. כאן:
--   · pivo_invariant_violations() — הבדיקות עצמן, במקום אחד. גם scripts/prod-invariants-check.mjs
--     (שרץ לפני כל push ואחרי מיגרציה) קורא לה — אין עותק שני של ה-SQL.
--   · run_invariant_check() — רץ פעם ביום (pg_cron), נרשם ב-invariant_check_runs, ובהפרה פותח
--     משימה אחת למשרד ב«משימות» (בלי מייל, בלי לקוח). משימה פתוחה עם אותה כותרת ⇒ לא נפתחת שנייה.
-- ‼ קריאה בלבד מול הנתונים העסקיים: הדבר היחיד שנכתב הוא שורת ריצה ומשימה פנימית.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.invariant_check_runs (
  id         bigint generated always as identity primary key,
  ran_at     timestamptz not null default now(),
  ok         boolean not null,
  violations jsonb not null default '[]'::jsonb,
  source     text not null default 'cron'
);
alter table public.invariant_check_runs enable row level security;
revoke all on public.invariant_check_runs from anon, authenticated;

/**
 * כל הכללים שנבדקים בנתונים. מחזיר מערך: {id, title, rows:[...], users:[uuid]} — רק כללים מופרים.
 * ‼ כלל חדש ב-docs/INVARIANTS.md עם «בדיקה חיה» ⇒ ענף כאן (ולא בסקריפט).
 */
create or replace function public.pivo_invariant_violations()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_out  jsonb := '[]'::jsonb;
  v_rows jsonb;
begin
  -- INV-REP-02 · בטופס של זוג (מ"ה): ב«חתימת בן זוג רשום» חותם/ת הרשום/ה
  select coalesce(jsonb_agg(jsonb_build_object('request', x.request, 'client', x.client_name, 'submission', x.submission,
                                               'in_slot', x.in_slot, 'should_be', x.should_be, 'user', x.user_id)), '[]'::jsonb)
    into v_rows
    from (
      select r.id as request, r.client_name, d ->> 'key' as submission, r.user_id,
             (select f ->> 'signerId' from jsonb_array_elements(d -> 'fields') f
               where f ->> 'kind' = 'signature' and (f ->> 'xPct')::numeric between 0.39 and 0.40 limit 1) as in_slot,
             public._rep_registered_signer(r.id, d ->> 'key') as should_be
        from public.representation_requests r
        join public.clients c on c.id = r.linked_client_id,
             jsonb_array_elements(case when jsonb_typeof(r.signature_documents) = 'array' then r.signature_documents else '[]'::jsonb end) d
       where r.status in ('awaiting_accountant', 'pending_signature', 'awaiting_stamp')
         and coalesce(c.family_status, '') = 'married'
         and (r.execution #> array['shaam', d ->> 'key', 'requestedSystems']) ? 'מס הכנסה'
         and (select count(*) from jsonb_array_elements(d -> 'fields') f where f ->> 'kind' = 'signature') = 2
    ) x
   where x.in_slot is distinct from x.should_be;
  if jsonb_array_length(v_rows) > 0 then
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', 'INV-REP-02',
      'title', 'בטופס ייפוי כוח של זוג, ב«חתימת בן זוג רשום» לא חותם/ת הרשום/ה', 'rows', v_rows));
  end if;

  -- INV-REP-03 · מס הכנסה בבקשה אחת בלבד בשע״ם
  select coalesce(jsonb_agg(jsonb_build_object('request', x.id, 'client', x.client_name, 'count', x.n, 'user', x.user_id)), '[]'::jsonb)
    into v_rows
    from (select r.id, r.client_name, r.user_id, count(*) as n
            from public.representation_requests r,
                 jsonb_each(case when jsonb_typeof(r.execution -> 'shaam') = 'object' then r.execution -> 'shaam' else '{}'::jsonb end) e(k, v)
           where (v -> 'requestedSystems') ? 'מס הכנסה' and not (v ? 'replacement')
           group by r.id, r.client_name, r.user_id having count(*) > 1) x;
  if jsonb_array_length(v_rows) > 0 then
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', 'INV-REP-03',
      'title', 'מס הכנסה נפתח ביותר מבקשה אחת בשע״ם לאותה בקשת ייצוג', 'rows', v_rows));
  end if;

  -- INV-AUTO-01 · «המשך» תקוע: הקודמת הסתיימה לפני יותר מ-10 דקות והוא עוד ממתין
  select coalesce(jsonb_agg(jsonb_build_object('followup', f.id, 'client', f.client_id, 'action', f.action_type,
                                               'previous', j.status, 'user', f.user_id)), '[]'::jsonb)
    into v_rows
    from public.automation_job_followups f
    join public.automation_jobs j on j.id = f.after_job_id
   where f.status = 'waiting' and j.status in ('succeeded', 'failed')
     and coalesce(j.finished_at, j.updated_at) < now() - interval '10 minutes';
  if jsonb_array_length(v_rows) > 0 then
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', 'INV-AUTO-01',
      'title', 'הזנה ב«הפעל הכול» תקועה בתור אחרי משימה שכבר הסתיימה', 'rows', v_rows));
  end if;

  -- INV-AUTO-02 · אותה הזנה לאותו אדם הצליחה פעמיים ביממה (ולא כ«נמצא קיים»)
  select coalesce(jsonb_agg(jsonb_build_object('client', x.client_id, 'action', x.action_type, 'who', x.who, 'count', x.n, 'user', x.user_id)), '[]'::jsonb)
    into v_rows
    from (select client_id, user_id, action_type, coalesce(input ->> 'submissionKey', input ->> 'role') as who, count(*) as n
            from public.automation_jobs
           where action_type in ('shaam.create_representation', 'btl.create_representation')
             and status = 'succeeded' and created_at > now() - interval '1 day'
             and coalesce(result ->> 'reconciled', 'false') <> 'true'
           group by 1, 2, 3, 4 having count(*) > 1) x;
  if jsonb_array_length(v_rows) > 0 then
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', 'INV-AUTO-02',
      'title', 'הזנה לרשות נשלחה פעמיים לאותו אדם באותה יממה', 'rows', v_rows));
  end if;

  return v_out;
end;
$$;
revoke all on function public.pivo_invariant_violations() from public, anon, authenticated;

/** הריצה היומית: נרשמת, ובהפרה — משימה אחת למשרד (לכל משרד שנוגע בהפרה), בלי כפילות. */
create or replace function public.run_invariant_check(p_source text default 'cron')
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v      jsonb := public.pivo_invariant_violations();
  x      jsonb;
  v_user uuid;
  v_title text;
  v_desc  text;
begin
  insert into public.invariant_check_runs (ok, violations, source)
  values (jsonb_array_length(v) = 0, v, coalesce(p_source, 'cron'));
  for x in select value from jsonb_array_elements(v) loop
    v_title := 'בדיקת מערכת: ' || (x ->> 'title');
    v_desc := 'הבדיקה היומית מצאה ' || jsonb_array_length(x -> 'rows') || ' מקרים (' || (x ->> 'id') || ' ב-docs/INVARIANTS.md). '
      || 'זה סימן שמשהו בקוד או בנתונים סוטה מכלל שהמערכת אמורה לשמור. לפנות ל-Claude עם הקוד ' || (x ->> 'id') || '. '
      || 'פרטים: ' || left((x -> 'rows')::text, 600);
    for v_user in select distinct (r ->> 'user')::uuid from jsonb_array_elements(x -> 'rows') r where r ->> 'user' is not null loop
      if not exists (select 1 from public.tasks t where t.user_id = v_user and t.title = v_title and t.status <> 'done') then
        insert into public.tasks (user_id, category, title, description, ball_with, status, progress, priority)
        values (v_user, 'management', v_title, v_desc, 'me', 'open', 'new', 'urgent');
      end if;
    end loop;
  end loop;
  return v;
end;
$$;
revoke all on function public.run_invariant_check(text) from public, anon, authenticated;

-- ‼ 08:30 בישראל (05:30 UTC) — אחרי onboarding-attention-daily (05:15) ולפני תזכורות 06:00.
select cron.unschedule(jobid) from cron.job where jobname = 'invariant-check-daily';
select cron.schedule('invariant-check-daily', '30 5 * * *', $c$select public.run_invariant_check('cron')$c$);
