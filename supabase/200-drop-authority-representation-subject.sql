-- ─── 200: הסרת אדם מהייצוג בב"ל — בלי למחוק את מה שכבר נרשם ────────────────
-- מקרה אמת (23.09.2026): בקשה לזוג, ב"ל לשניהם. אחד אושר, והמשרד החליט לא
-- להמשיך עם בן/בת הזוג. עד היום לא הייתה דרך לומר את זה — המסלול נשאר
-- «חובה», הרשות לא נסגרה כ«פעיל», והתזכורות היו ממשיכות לצאת אליו/ה.
--
-- ‼ «הסרה» = האדם יוצא מ-targets, והבקשה שלו במשטח «בקשות» מבוטלת.
-- ‼ מה שלא נוגעים בו: execution.nationalInsurance[Spouse] — האסמכתא, המועד
-- וכל חותמות הזמן נשארים כהיסטוריה. בקשה חוזרת («בקש ייצוג» מתיק המס) נפתחת
-- כשורה חדשה וממשיכה מאותו מסלול ביצוע.
-- ‼ לא מאפשרים להסיר את האחרון: targets ריק מתפרש בכל מקום כ-['client']
-- (targetsOf / 157), כך ש"הסרת האחרון" הייתה מחזירה את הלקוח בשקט.
-- ‼ לא מאפשרים להסיר מי שכבר אושר — זה ייצוג פעיל, לא בקשה.

create or replace function public.drop_authority_representation(
  p_client_id text, p_authority text, p_subject_role text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c           public.clients%rowtype;
  req         public.representation_requests%rowtype;
  v_uid       uuid := auth.uid();
  v_track     text;
  v_rec       jsonb;
  v_targets   jsonb;
  v_left      jsonb;
  v_file      jsonb;
  v_new_files jsonb;
  v_all_ok    boolean;
  s           record;
  v_name      text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'unauthenticated'); end if;

  select * into c from public.clients where id = p_client_id for update;
  if c.id is null then return jsonb_build_object('ok', false, 'reason', 'client_not_found'); end if;
  if c.user_id <> v_uid then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  if p_authority <> 'national_insurance' then
    return jsonb_build_object('ok', false, 'reason', 'bad_authority');
  end if;
  if p_subject_role not in ('client','spouse') then
    return jsonb_build_object('ok', false, 'reason', 'bad_subject_role');
  end if;

  v_track := case when p_subject_role = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end;
  if c.representation_request_id is not null then
    select * into req from public.representation_requests where id = c.representation_request_id for update;
  end if;

  -- targets מנורמל — אותו כלל כמו targetsOf() ו-157
  v_rec := c.authority_representations -> 'nationalInsurance';
  if v_rec is null then
    return jsonb_build_object('ok', false, 'reason', 'not_requested');
  end if;
  if (case when jsonb_typeof(v_rec->'targets') = 'array'
           then jsonb_array_length(v_rec->'targets') else 0 end) > 0 then
    v_targets := v_rec->'targets';
  elsif coalesce((v_rec->>'coversSpouse')::boolean, false) then
    v_targets := '["client","spouse"]'::jsonb;
  else
    v_targets := '["client"]'::jsonb;
  end if;

  if not coalesce((select bool_or(x = p_subject_role) from jsonb_array_elements_text(v_targets) x), false) then
    return jsonb_build_object('ok', false, 'reason', 'not_requested');
  end if;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_left
    from jsonb_array_elements_text(v_targets) x where x <> p_subject_role;
  if jsonb_array_length(v_left) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'last_subject');
  end if;

  select f into v_file from jsonb_array_elements(coalesce(c.tax_files, '[]'::jsonb)) f
    where f->>'authority' = p_authority and f->>'owner' = p_subject_role limit 1;
  if (v_file->>'repStatus') = 'active'
     or (req.id is not null and (req.execution -> v_track ->> 'confirmedAt') is not null) then
    return jsonb_build_object('ok', false, 'reason', 'already_active');
  end if;

  -- ‼ מי שנשארו כבר אושרו כולם ⇒ הרשות הושלמה. אותו כלל כמו handleSaveExecution
  -- בדפדפן — שם הוא נבדק רק בשמירת ביצוע, ולכן כאן חייבים לבדוק בעצמנו.
  select coalesce(bool_and(
           req.id is not null and (req.execution -> (case when x = 'spouse' then 'nationalInsuranceSpouse'
                                                          else 'nationalInsurance' end) ->> 'confirmedAt') is not null),
         false)
    into v_all_ok
    from jsonb_array_elements_text(v_left) x;

  update public.clients
     set authority_representations = jsonb_set(
           authority_representations, '{nationalInsurance}',
           ((v_rec - 'coversSpouse')
              || jsonb_build_object('targets', v_left)
              || (case when v_all_ok then jsonb_build_object('status', 'active') else '{}'::jsonb end))),
         tax_files = case
           when (v_file->>'repStatus') = 'pending' then (
             select jsonb_agg(case when f->>'authority' = p_authority and f->>'owner' = p_subject_role
                                   then f || jsonb_build_object('repStatus', 'none') else f end)
               from jsonb_array_elements(c.tax_files) f)
           else tax_files end,
         updated_at = now()
   where id = c.id;

  v_name := case when p_subject_role = 'spouse'
    then coalesce(nullif(trim(coalesce(c.spouse_first_name,'') || ' ' || coalesce(c.spouse_last_name,'')), ''),
                  nullif(trim(coalesce(c.spouse_name,'')), ''), 'בן/בת הזוג')
    else coalesce(nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''), 'הלקוח') end;

  for s in
    select * from public.onboarding_steps
     where client_id = c.id and step_type = 'authority_representation'
       and payload->>'authority' = p_authority and payload->>'subjectRole' = p_subject_role
       and status not in ('completed','verified','skipped','cancelled')
  loop
    update public.onboarding_steps
       set status = 'cancelled', needs_attention = false, updated_at = now()
     where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'accountant',
      'הייצוג בביטוח לאומי עבור ' || v_name || ' הוסר מהבקשה. הפרטים שכבר נרשמו נשמרו.',
      jsonb_build_object('from', s.status, 'to', 'cancelled', 'reason', 'subject_dropped'));
  end loop;

  return jsonb_build_object('ok', true, 'completed', v_all_ok);
end;
$function$;

revoke all on function public.drop_authority_representation(text, text, text) from public, anon;
grant execute on function public.drop_authority_representation(text, text, text) to authenticated;
