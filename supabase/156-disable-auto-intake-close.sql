-- ─── 156 · סגירת קליטה רק בפעולה מפורשת ──────────────────────────────────────
--
-- הכרעת מוצר (גיא, 2026-09-04, אחרי 155): מוכנות לסגירה והמעבר בפועל נשארים
-- שני דברים נפרדים. onboarding_close_readiness ממשיכה לומר "מוכן" ברגע
-- שכל הנדרש הושלם — זה בדיוק מה שמאיר את כפתור "סגור קליטה" ומריק את רשימת
-- החוסמים. אבל שום דבר לא יזיז את ההתקשרות בעצמו. הסגירה קורית אך ורק
-- כשהרו"ח לוחץ.
--
-- הרקע: מיגרציה 155 איחדה את הכלל — advance_onboarding_step קרא לאותו
-- close_onboarding_if_ready שהכפתור קורא לו, במקום לכלל נפרד שהתעלם מהדגל.
-- זה תיקן את הסתירה (אותו תיק "מוכן" לפי אחד ו"לא" לפי השני), אבל השאיר את
-- הסגירה האוטומטית עצמה על כנה. עכשיו היא יורדת — לא כי היא הייתה שגויה,
-- אלא כי גיא רוצה לשלוט ברגע שבו לקוח עובר לשוטף, לא שהמערכת תחליט בשבילו
-- ברגע שהפריט האחרון נסגר.
--
-- ‼ close_onboarding_if_ready ו-close_onboarding עצמן לא זזות: הן ממשיכות
--   לשרת את הכפתור בדיוק כמו קודם, כולל p_force. משתמשות בהן: OnboardingTab
--   (הכפתור), ו-close_onboarding (שכבר בודקת בעלות ומאצילה אליהן).
-- ‼ אין כאן חזרה לגוף המקורי של advance_onboarding_step (מיגרציה 46): כל
--   שאר ההתנהגות — שער הנעילה, שער הפייפרלס, מפת הפעולות — נשארת בדיוק כמו
--   ב-155. השינוי היחיד הוא הסרת הבלוק בסוף.

create or replace function public.advance_onboarding_step(
  p_step_id text,
  p_action text,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  s          public.onboarding_steps%rowtype;
  v_new      text;
  v_ball     text;
  v_note     text;
  v_reason   text;
  v_uid      uuid := auth.uid();
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_reason := nullif(trim(coalesce(p_payload->>'reason', '')), '');
  v_note   := nullif(trim(coalesce(p_payload->>'note', '')), '');
  v_ball   := s.ball;

  if s.status = 'locked' and p_action not in ('cancel','note','block','set_due') then
    if not public.onboarding_dependency_met(s.id) then
      return jsonb_build_object('ok', false, 'error', 'locked',
        'message', case when s.step_type = 'retainer_authorization'
                        then 'הרשאת התשלום נוצרת בתוך חשבון הפייפרלס של הלקוח - יש לאשר קודם את החיבור לפייפרלס.'
                        else 'השלב נעול עד להשלמת השלב שהוא תלוי בו.' end);
    end if;
  end if;

  case p_action
    when 'start'        then v_new := 'in_progress';
    when 'wait_client'  then v_new := 'waiting_client'; v_ball := 'client';
    when 'complete'     then v_new := 'completed';
    when 'verify'       then v_new := 'verified';
    when 'skip'         then v_new := 'skipped';
    when 'block'        then v_new := 'blocked';
    when 'fail'         then v_new := 'failed';
    when 'reopen'       then v_new := 'pending';
    when 'cancel'       then v_new := 'cancelled';
    when 'record_link'  then v_new := case when s.status in ('locked','pending') then 'in_progress' else s.status end;
    when 'email_sent'   then v_new := 'waiting_client'; v_ball := 'client';
    when 'set_due'      then v_new := s.status;
    when 'note'         then v_new := s.status;
    else return jsonb_build_object('ok', false, 'error', 'unknown_action');
  end case;

  if p_action = 'skip' and s.step_type in ('paperless_invite','paperless_connection') then
    if coalesce(v_reason, '') not in ('already_connected','transferred_rep','not_applicable') then
      if exists (select 1 from public.onboarding_steps r
                 where r.client_id = s.client_id and r.step_type = 'retainer_authorization'
                   and r.status not in ('completed','verified','cancelled','skipped')
                   and coalesce(r.payload->>'method','') <> 'manual_arrangement') then
        return jsonb_build_object('ok', false, 'error', 'paperless_required',
          'message', 'קיימת הרשאת תשלום שממתינה - אי אפשר לדלג על הפייפרלס אלא אם הלקוח כבר מחובר.');
      end if;
    end if;
  end if;

  update public.onboarding_steps
    set status  = v_new,
        ball    = coalesce(nullif(p_payload->>'ball',''), v_ball),
        payload = payload || coalesce(p_payload - 'note' - 'ball', '{}'::jsonb)
                  || case when v_reason is not null then jsonb_build_object('skipReason', v_reason) else '{}'::jsonb end,
        due_date = coalesce((nullif(p_payload->>'dueDate',''))::date, due_date),
        needs_attention = case when v_new in ('completed','verified','skipped','cancelled') then false else needs_attention end,
        completion_method = coalesce(nullif(p_payload->>'completionMethod',''), completion_method),
        completed_by = case when v_new in ('completed','verified') then v_uid else completed_by end,
        completed_at = case when v_new = 'completed' and completed_at is null then now() else completed_at end,
        verified_at  = case when v_new = 'verified'  and verified_at  is null then now() else verified_at end
    where id = s.id;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id,
    case when v_new = s.status then 'note' else 'status_changed' end,
    'accountant', coalesce(v_note, v_reason),
    jsonb_build_object('from', s.status, 'to', v_new, 'action', p_action));

  if v_new in ('completed','verified','skipped') then
    perform public.unlock_dependent_steps(s.id);
  end if;

  -- ‼ 156 · הבלוק שסגר קליטה אוטומטית ירד. onboarding_close_readiness ממשיכה
  -- להאיר את הכפתור ולהריק את רשימת החוסמים — המוכנות לא נעלמה, רק המעבר
  -- בפועל דורש עכשיו לחיצה. ראה close_onboarding / close_onboarding_if_ready.

  return jsonb_build_object('ok', true, 'stepId', s.id, 'from', s.status, 'to', v_new);
end;
$function$;

grant execute on function public.advance_onboarding_step(text, text, jsonb) to authenticated;

-- ── רולבק ────────────────────────────────────────────────────────────────────
-- לשחזר סגירה אוטומטית: מחזירים את הגוף מ-supabase/155-request-vs-representation-boundary.sql
-- (החלק advance_onboarding_step), שם הבלוק עדיין קיים.
