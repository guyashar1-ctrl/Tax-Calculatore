-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_step_id text
CREATE OR REPLACE FUNCTION public.portal_lock_reason(p_step_id text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with parents as (
    select d.depends_on_step_id as pid
      from public.onboarding_step_dependencies d
     where d.step_id = p_step_id
    union
    select s.depends_on_step_id
      from public.onboarding_steps s
     where s.id = p_step_id
       and s.depends_on_step_id is not null
  ),
  blocking as (
    select coalesce(
             nullif(ps.payload->>'clientTitle', ''),
             case ps.step_type
               when 'paperless_connection'    then 'חיבור לפייפרלס'
               when 'paperless_invite'        then 'פתיחת חשבון פייפרלס'
               when 'retainer_authorization'  then 'הרשאת התשלום החודשי'
               when 'client_documents'        then 'המסמכים שביקשנו'
               when 'prev_accountant_details' then 'פרטי רואה החשבון הקודם'
               when 'intake_questionnaire'    then 'עדכון סטטוס מיסויי'
               when 'representation'          then 'ייפוי הכוח'
               when 'release_letter'          then 'מכתב השחרור'
               when 'materials_received'      then 'קבלת החומרים מרואה החשבון הקודם'
               when 'file_opening'            then 'פתיחת התיקים ברשויות'
               else 'השלב הקודם'
             end
           ) as lbl,
           coalesce(ps.sort_order, 0) as ord,
           ps.created_at as created
      from parents pr
      join public.onboarding_steps ps on ps.id = pr.pid
     where ps.status not in ('completed', 'verified', 'skipped', 'cancelled')
  )
  select case when count(*) = 0 then null
              else 'ייפתח אחרי ' || string_agg(lbl, ' · ' order by ord, created)
         end
    from blocking;
$function$

