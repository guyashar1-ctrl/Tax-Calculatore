-- 261 · יישור קו מול הרשויות — רק כשהמשרד מבקש (19.10.2026)
--
-- גיא, 19.10.2026: «הבקשה ליישור קו ברשויות — האם נכון שהיא תפתח אוטומטית? … כל פעם יש לי בבקשות את היישור
-- קו הזה ולפעמים זה תוקע». ההכרעה (הדמיה מאושרת docs/proposals/2026-10-19-simple-annual-questionnaire.html):
-- יישור קו הוא כלי בתיק המס («בצע יישור קו», «תצוגה מפורטת» לכל רשות) — לא בקשה, ולא נפתח לבד.
--
-- ‼ «תוקע»: שיחת הפתיחה (opening_call) נוצרה נעולה על שלושת שלבי יישור הקו (163), כך שהיא חיכתה עד שכל
--   שלוש הרשויות סומנו. בלי יישור אוטומטי — אין גם שיחת פתיחה אוטומטית.
-- ‼ הקריאה הידנית (p_include_opening_call = false) לא השתנתה: אותם שלבים, אותה בעלות, אותה בדיקה.
-- ‼ שלבי יישור קו קיימים לא נמחקים ולא משתנים — הם המקור לתאריך «נבדק לאחרונה» ולמסכי הרשות.
--
-- חזרה: scripts/sql/261/rollback-261.sql (הגרסה של 163 + החזרת שיחות הפתיחה שבוטלו כאן).

create or replace function public.ensure_institution_alignment_steps(
  p_client_id text, p_engagement_id text default null, p_include_opening_call boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_stage_id text;
  v_btl_id text;
  v_vat_id text;
  v_income_id text;
  v_call_id text;
  v_created int := 0;
begin
  -- ‼ הבעלים מהלקוח, לא מהסשן. זה מה שמאפשר לאישור ציבורי לבנות את המסע.
  select user_id into v_owner from public.clients where id = p_client_id;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;

  -- משתמש מחובר רשאי רק על לקוח שלו. בלי משתמש — מסלול מערכת, וההרשאה
  -- להריץ את הפונקציה כבר מוגבלת ל-authenticated/service_role (מיגרציה 160).
  if v_uid is not null and v_owner <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- ההתקשרות חייבת להיות של אותו בעלים ושל אותו לקוח — אחרת אפשר להטביע
  -- בשלבים שלי מזהה התקשרות של אחר ולחסום לו את סגירת הקליטה.
  if p_engagement_id is not null
     and not exists (select 1 from public.engagements e
                      where e.id = p_engagement_id
                        and e.user_id = v_owner
                        and e.client_id = p_client_id) then
    return jsonb_build_object('ok', false, 'error', 'engagement_not_found');
  end if;

  -- ‼ 261 (19.10.2026, גיא): יישור קו מול הרשויות אינו נפתח לבד. המסלול האוטומטי (בניית המסע מההצעה —
  --   הקריאות עם p_include_opening_call = true ב-216) לא יוצר יותר את שלושת השלבים ולא את שיחת הפתיחה
  --   שהייתה נעולה עליהם. יישור קו נפתח רק כשהמשרד מבקש («בצע יישור קו» בתיק המס — p_include_opening_call = false).
  if p_include_opening_call then
    return jsonb_build_object('ok', true, 'created', 0, 'skipped', 'alignment_on_demand');
  end if;

  select id into v_stage_id from public.journey_stages
   where client_id = p_client_id and title = 'יישור קו מול הרשויות' limit 1;
  if v_stage_id is null then
    insert into public.journey_stages (user_id, client_id, engagement_id, title, sort_order)
    values (v_owner, p_client_id, p_engagement_id, 'יישור קו מול הרשויות', 5)
    returning id into v_stage_id;
  end if;

  select id into v_btl_id from public.onboarding_steps
   where client_id = p_client_id and step_type = 'institution_alignment_btl' and status <> 'cancelled' limit 1;
  if v_btl_id is null then
    insert into public.onboarding_steps
      (user_id, engagement_id, client_id, step_type, track, scope, status, ball, stage_id, required_for_close, payload)
    values
      (v_owner, p_engagement_id, p_client_id, 'institution_alignment_btl', 'authorities', 'person', 'pending', 'me',
       v_stage_id, false, jsonb_build_object('institution', 'btl'))
    returning id into v_btl_id;
    v_created := v_created + 1;
  end if;

  select id into v_vat_id from public.onboarding_steps
   where client_id = p_client_id and step_type = 'institution_alignment_vat' and status <> 'cancelled' limit 1;
  if v_vat_id is null then
    insert into public.onboarding_steps
      (user_id, engagement_id, client_id, step_type, track, scope, status, ball, stage_id, required_for_close, payload)
    values
      (v_owner, p_engagement_id, p_client_id, 'institution_alignment_vat', 'authorities', 'person', 'pending', 'me',
       v_stage_id, false, jsonb_build_object('institution', 'vat'))
    returning id into v_vat_id;
    v_created := v_created + 1;
  end if;

  select id into v_income_id from public.onboarding_steps
   where client_id = p_client_id and step_type = 'institution_alignment_income' and status <> 'cancelled' limit 1;
  if v_income_id is null then
    insert into public.onboarding_steps
      (user_id, engagement_id, client_id, step_type, track, scope, status, ball, stage_id, required_for_close, payload)
    values
      (v_owner, p_engagement_id, p_client_id, 'institution_alignment_income', 'authorities', 'person', 'pending', 'me',
       v_stage_id, false, jsonb_build_object('institution', 'income'))
    returning id into v_income_id;
    v_created := v_created + 1;
  end if;

  if p_include_opening_call then
    select id into v_call_id from public.onboarding_steps
     where client_id = p_client_id and step_type = 'opening_call' and status <> 'cancelled' limit 1;
    if v_call_id is null then
      insert into public.onboarding_steps
        (user_id, engagement_id, client_id, step_type, track, scope, status, ball, required_for_close, payload)
      values
        (v_owner, p_engagement_id, p_client_id, 'opening_call', 'review', 'person', 'locked', 'me',
         false, jsonb_build_object('clarifications', '[]'::jsonb))
      returning id into v_call_id;
      v_created := v_created + 1;
      insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id)
      values (v_call_id, v_btl_id, v_owner), (v_call_id, v_vat_id, v_owner), (v_call_id, v_income_id, v_owner)
      on conflict do nothing;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true, 'created', v_created, 'stageId', v_stage_id,
    'btlStepId', v_btl_id, 'vatStepId', v_vat_id, 'incomeStepId', v_income_id, 'openingCallStepId', v_call_id
  );
end;
$function$;

comment on function public.ensure_institution_alignment_steps(text, text, boolean) is
  'יוצרת את שלושת שלבי יישור הקו כשהמשרד מבקש (p_include_opening_call = false). מ-261: הקריאה האוטומטית מבניית המסע (true) אינה יוצרת דבר — יישור קו אינו נפתח לבד. בעלות נאכפת כשיש משתמש מחובר, וההתקשרות חייבת להיות של אותו לקוח.';

revoke execute on function public.ensure_institution_alignment_steps(text, text, boolean) from public, anon;
grant execute on function public.ensure_institution_alignment_steps(text, text, boolean) to authenticated, service_role;

-- ── שיחות פתיחה שנוצרו אוטומטית ועדיין נעולות על יישור הקו — יורדות ───────────────────────────────
-- ‼ רק נעולות (locked) שכל התלויות שלהן הן שלבי יישור קו שטרם הושלמו. מסומנות כדי שאפשר יהיה להחזיר.
update public.onboarding_steps s
   set status = 'cancelled',
       payload = coalesce(s.payload, '{}'::jsonb) || jsonb_build_object('cancelledBy', '261', 'cancelledReason', 'alignment_on_demand'),
       updated_at = now()
 where s.step_type = 'opening_call'
   and s.status = 'locked'
   and exists (select 1 from public.onboarding_step_dependencies d where d.step_id = s.id)
   and not exists (
     select 1 from public.onboarding_step_dependencies d
       join public.onboarding_steps p on p.id = d.depends_on_step_id
      where d.step_id = s.id and p.step_type not like 'institution_alignment_%');
