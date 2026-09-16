-- ─── 184: defer_job_capability מקדם revision ─────────────────────────────
-- ‼ ממוספר 184 (לא 169) — ראה ההערה בראש 183-shaam-warmup-orchestration.sql.
-- ‼ תיקון לפער שנחשף בזמן מימוש warmupManager.mjs (183 עדיין לא נצרך בקוד
-- כשזה נכתב): defer_job_capability כתב ל-progress בלי לקדם revision. עדכון
-- CAS הבא של ה-worker (update_automation_job_progress) לא היה מזהה התנגשות
-- — כי הוא בודק revision, לא תוכן — ופשוט דורס את הדגל 'deferred' שהדפדפן
-- כרגע כתב, בלי שום שגיאה. "דלג כרגע" חייב לשרוד עדכון התקדמות מקביל של
-- ה-worker, אחרת פרק 16 §16.11 קריטריון 9 (skip אמין) לא מתקיים.
create or replace function public.defer_job_capability(p_job_id text, p_capability text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_job public.automation_jobs;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  update public.automation_jobs
     set progress = jsonb_set(
           coalesce(progress, '{}'::jsonb),
           '{capabilities}',
           coalesce(progress->'capabilities', '{}'::jsonb)
             || jsonb_build_object(
                  p_capability,
                  coalesce(progress #> array['capabilities', p_capability], '{}'::jsonb)
                    || jsonb_build_object('state', 'deferred')
                ),
           true
         ),
         revision = revision + 1
   where id = p_job_id
     and user_id = v_uid
     and status in ('running', 'needs_human')
   returning * into v_job;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_deferrable');
  end if;
  return jsonb_build_object('ok', true, 'job', to_jsonb(v_job));
end;
$function$;

revoke all on function public.defer_job_capability(text, text) from public, anon;
grant execute on function public.defer_job_capability(text, text) to authenticated;

select public.assert_domain_function_invariants();
