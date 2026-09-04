-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_step_id text, p_required boolean
CREATE OR REPLACE FUNCTION public.set_onboarding_step_required(p_step_id text, p_required boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s      public.onboarding_steps%rowtype;
  c      public.clients%rowtype;
  v_uid  uuid := auth.uid();
  v_from boolean;
  v_to   boolean := coalesce(p_required, true);
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;

  -- הבעלות נבדקת דרך הלקוח, כמו בכל שאר פונקציות הקליטה.
  select * into c from public.clients where id = s.client_id;
  if c.id is null or c.user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if s.status in ('completed', 'verified', 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'step_closed', 'status', s.status);
  end if;

  -- 155 · אין קליטה פתוחה ⇒ אין מה לחסום, ולכן אי אפשר לסמן כנדרש.
  if v_to and not public.intake_accepts_required(c.id) then
    return jsonb_build_object('ok', false, 'error', 'no_open_intake',
      'intakeState', public.client_intake_state(c.id)->>'state');
  end if;

  v_from := coalesce(s.required_for_close,
                     s.step_type not in ('representation_upgrade', 'first_month_review'));

  if v_from = v_to then
    return jsonb_build_object('ok', true, 'unchanged', true, 'requiredForClose', v_to);
  end if;

  update public.onboarding_steps
     set required_for_close = v_to, updated_at = now()
   where id = s.id;

  perform public.log_onboarding_event(c.user_id, s.id, s.engagement_id, 'note', 'accountant',
    case when v_to then 'עודכן: השלב נדרש לסגירת הקליטה'
         else 'עודכן: השלב אינו נדרש לסגירת הקליטה' end,
    jsonb_build_object('requiredForClose', jsonb_build_object('from', v_from, 'to', v_to)));

  return jsonb_build_object('ok', true, 'requiredForClose', v_to);
end;
$function$

