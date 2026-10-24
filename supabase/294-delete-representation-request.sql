-- 294 · מחיקת בקשת ייצוג סוגרת גם את השורות שלה ב«בקשות».
-- עד היום המסך מחק את השורה ב-representation_requests ישירות, והשלבים שנולדו
-- ממנה נשארו פתוחים: «בקשת ייצוג» (שאין לה הסרה רגילה — היא שולחת למרכז הייצוג,
-- שם הבקשה כבר לא קיימת), צילום התעודה לשע״ם, ב"ל לאדם, וזירוז האישור.
-- הלקוח המשיך לראות אותם בדף. (עידן רוקח, 25.10.2026)
--
-- ‼ מה נסגר: רק שלבים פתוחים (שלב שהושלם הוא היסטוריה) של הכרטיס המקושר —
--   · כל שלב שמצביע על הבקשה הזאת (representationRequestId / shaamIdentity.requestId / requestId);
--   · «בקשת ייצוג» ו«זירוז אישור הייצוג», שהם ברמת הכרטיס — רק אם לא נשארה לכרטיס
--     בקשת ייצוג אחרת (ensure_representation_step נשען על האחרונה).
-- ‼ נסגרים מיד ולא «בפרסום הבא»: הבקשה שמאחוריהם כבר לא קיימת, והקישור בדף היה מוביל לשום מקום.
-- ‼ שום דבר כאן לא מבטל בקשה או ייצוג אצל הרשות.
begin;

create or replace function public.delete_representation_request(p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r       public.representation_requests%rowtype;
  v_uid   uuid := auth.uid();
  v_other boolean := false;
  v_res   jsonb;
  v_closed int := 0;
  s       record;
begin
  select * into r from public.representation_requests where id = p_request_id for update;
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  -- אותה הרשאה כמו מדיניות המחיקה של הטבלה (reps_delete_own + require_authorized).
  if v_uid is null or r.user_id <> v_uid or not public.is_authorized() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if r.linked_client_id is not null then
    select exists (select 1 from public.representation_requests o
                    where o.linked_client_id = r.linked_client_id and o.id <> r.id) into v_other;

    for s in
      select id from public.onboarding_steps
       where client_id = r.linked_client_id
         and status not in ('completed', 'verified', 'skipped', 'cancelled')
         and (   payload ->> 'representationRequestId' = r.id
              or payload -> 'shaamIdentity' ->> 'requestId' = r.id
              or payload ->> 'requestId' = r.id
              or (not v_other and step_type in ('representation', 'rep_client_approval')))
       order by sort_order
    loop
      v_res := public._set_step_status(s.id, 'cancelled', 'accountant', 'בקשת הייצוג נמחקה במשרד',
        jsonb_build_object('requestId', r.id, 'reason', 'representation_request_deleted'), null, null);
      if coalesce((v_res ->> 'changed')::boolean, false) then v_closed := v_closed + 1; end if;
      update public.onboarding_steps set pending_cancel = false where id = s.id and pending_cancel;
    end loop;
  end if;

  delete from public.representation_requests where id = r.id;

  return jsonb_build_object('ok', true, 'closedSteps', v_closed);
end;
$$;

revoke all on function public.delete_representation_request(text) from public, anon;
grant execute on function public.delete_representation_request(text) to authenticated;

commit;
