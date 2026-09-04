-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: (ללא)
CREATE OR REPLACE FUNCTION public.domain_consistency_report()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    -- דגל «נדרש» על בקשה פתוחה שאין לה קליטה לחסום. אינרטי, לא מזיק.
    'inertRequiredFlags', (
      select count(*) from public.onboarding_steps s
       where coalesce(s.required_for_close, true)
         and s.status not in ('completed','verified','skipped','cancelled')
         and not public.intake_accepts_required(s.client_id)),
    -- ‼ שתי מחלקות שונות לגמרי, ולכן שתי שורות ולא אחת:
    -- (א) הכרטיס **מפגר** אחרי הבקשה. ניתן להשלמה בבטחה, קדימה בלבד — זה
    --     בדיוק מה ש-§11 מתקן, ומכאן והלאה הטריגר מונע.
    'clientBehindRequest', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'clientId', c.id, 'client', c.representation_status, 'request', r.status)), '[]'::jsonb)
        from public.clients c
        join lateral (select status from public.representation_requests rr
                       where rr.linked_client_id = c.id
                       order by created_at desc limit 1) r on true
       where c.representation_status is distinct from r.status
         and coalesce(c.representation_status, '') <> 'active'),
    -- (ב) הכרטיס **מקדים** את הבקשה: מיוצג, בזמן שהבקשה עוד בדרך. אי אפשר
    --     להסיק מה נכון — להוריד את הלקוח מ"מיוצג" אסור (הכרעת מוצר 2),
    --     ולקדם את הבקשה היה ממציא היסטוריית חתימה. דורש עין אנושית.
    'clientAheadOfRequest', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'clientId', c.id, 'client', c.representation_status, 'request', r.status)), '[]'::jsonb)
        from public.clients c
        join lateral (select status from public.representation_requests rr
                       where rr.linked_client_id = c.id
                       order by created_at desc limit 1) r on true
       where c.representation_status is distinct from r.status
         and coalesce(c.representation_status, '') = 'active'),
    -- שלב חיים שמור ששונה מהנגזר. אמור להיות ריק תמיד אחרי §9.
    'lifecycleDrift', (
      select count(*) from public.clients c
       where c.lifecycle_stage is distinct from public.derive_lifecycle_stage(c.id)),
    -- יותר מבקשת ייצוג פתוחה אחת לאותו לקוח.
    'multipleOpenRepRequests', (
      select coalesce(jsonb_agg(x.linked_client_id), '[]'::jsonb) from (
        select linked_client_id from public.representation_requests
         where linked_client_id is not null and status <> 'active'
         group by 1 having count(*) > 1) x)
  );
$function$

