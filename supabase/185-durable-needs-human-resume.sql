-- ─── 185: חידוש עמיד של needs_human — לא רמז תוך-תהליכי ────────────────────
-- ‼ ממוספר 185 (לא 170) — ראה ההערה בראש 183-shaam-warmup-orchestration.sql.
-- ‼ הבעיה: הגרסה הראשונה של warmupManager (183) סימנה ב-worker, בזיכרון
-- בלבד (Map), אילו jobs ממתינים לאיזו capability, כדי לחדש אותם כשה-worker
-- עצמו רואה שהאתגר נפתר. הפעלה מחדש של תהליך ה-worker מוחקת את הזיכרון
-- הזה — בדיוק מה שפרק 16 §16.11 קריטריון 16 אוסר ("נשמר checkpoint").
--
-- ‼ הפתרון: אין צורך במנגנון שני. automation_workers.status כבר נכתב בכל
-- סבב על ידי report_worker_status (153) — זו בדיוק הראיה העמידה שצריך.
-- מרחיבים את אותה פונקציה: אחרי שהיא כותבת את הסטטוס הטרי, היא סורקת את
-- ה-needs_human jobs ש**אותו worker_id בדיוק** מחזיק, גוזרת מ-error_code
-- (התבנית awaiting_<capability>_auth, כבר קיימת) איזו capability חסמה,
-- ובודקת אם היא מוכנה **באותו status שהיא הרגע כתבה**. worker_id קבוע
-- להתקנה (מוגדר ב-.env, לא נוצר מחדש לכל תהליך) — ולכן זהות "אותו worker"
-- שורדת הפעלה מחדש בלי שום דבר נוסף.
--
-- ‼ שתי הגנות קיימות כבר עושות את שאר העבודה: cancel_requested (183) מונע
-- חידוש job שבוטל, וה-WHERE האטומי על status='needs_human' מונע משני
-- workers עם אותו worker_id (לא אמור לקרות בפועל — מודל worker אחד למשתמש)
-- לחדש את אותו job פעמיים. lease קצרה (5 שניות) מחזירה את ה-job למחזור
-- ה-claim הרגיל — אין reclaim מיוחד, אין job חדש נוצר.
--
-- ‼ יחס לתיקון המקביל (consistency-remediation, מיגרציה 171_send_then_record):
-- שם cancel_automation_job הורחבה כדי לבטל job 'running' עם חכירה מתה —
-- אחריות שונה לגמרי: ניקוי job **נטוש** (worker מת) ביוזמת הדפדפן בלחיצה
-- מפורשת, לעומת המשך **מכוון** של job שממתין ל-capability, ביוזמת ה-worker
-- עצמו. שתי הפונקציות פועלות על תנאי status/lease זרים זה לזה ואינן נוגעות
-- זו בזו — ראה ניתוח ההתאמה המלא בדוח ההתאמה שקדם למיגרציה הזו.
create or replace function public.report_worker_status(
  p_user_id   uuid,
  p_worker_id text,
  p_status    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status   jsonb;
  v_job      record;
  v_capability text;
  v_ready    boolean;
  v_resumed  text[] := '{}';
begin
  insert into public.automation_workers (worker_id, user_id, last_seen_at, status)
  values (p_worker_id, p_user_id, now(), coalesce(p_status, '{}'::jsonb))
  on conflict (worker_id) do update
    set last_seen_at = now(),
        user_id      = excluded.user_id,
        status       = coalesce(excluded.status, public.automation_workers.status)
  returning status into v_status;

  for v_job in
    select id, error_code from public.automation_jobs
     where claimed_by = p_worker_id
       and status = 'needs_human'
       and action_type in ('shaam.connect', 'shaam.ensure_capability')
       and cancel_requested = false
  loop
    v_capability := (regexp_match(coalesce(v_job.error_code, ''), '^awaiting_(\w+)_auth$'))[1];
    continue when v_capability is null;

    v_ready := case
      when v_capability = 'shaam' then coalesce((v_status #>> array['shaam', 'connected'])::boolean, false)
      else coalesce((v_status #>> array[v_capability, 'ready'])::boolean, false)
    end;
    continue when not v_ready;

    -- ‼ אטומי ותנאי: מחדש רק אם עדיין needs_human, עדיין שייך לאותו worker,
    -- ולא בוטל בינתיים — לא מניחים שהמצב שנקרא למעלה עדיין נכון הרגע.
    update public.automation_jobs
       set status       = 'running',
           claimed_at   = now(),
           lease_until  = now() + make_interval(secs => 5),
           needs_human  = null,
           error_code   = null,
           error_detail = null
     where id = v_job.id
       and claimed_by = p_worker_id
       and status = 'needs_human'
       and cancel_requested = false;

    if found then
      v_resumed := array_append(v_resumed, v_job.id);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'resumed', to_jsonb(v_resumed));
end;
$function$;

revoke all on function public.report_worker_status(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.report_worker_status(uuid, text, jsonb) to service_role;

select public.assert_domain_function_invariants();
