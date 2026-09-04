-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text
CREATE OR REPLACE FUNCTION public.ensure_rep_client_approval_step(p_client_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c      public.clients%rowtype;
  v_id   text;
  v_eng  text;
  v_sort int;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return null; end if;

  select id into v_id from public.onboarding_steps
    where client_id = p_client_id and step_type = 'rep_client_approval'
      and status <> 'cancelled' limit 1;
  if v_id is not null then return v_id; end if;

  if exists (select 1 from public.onboarding_steps
              where client_id = p_client_id and step_type = 'rep_client_approval'
                and status = 'cancelled') then
    return null;
  end if;

  select id into v_eng from public.engagements
    where client_id = p_client_id order by created_at desc limit 1;

  select coalesce(max(sort_order), 0) + 1 into v_sort
    from public.onboarding_steps
    where client_id = p_client_id and step_type = 'representation'
      and status <> 'cancelled';

  insert into public.onboarding_steps
    (user_id, engagement_id, client_id, required_for_close, step_type, track, scope,
     status, ball, sort_order, published_at, payload)
  values
    (c.user_id, v_eng, p_client_id, false, 'rep_client_approval', 'authorities', 'person',
     'pending', 'client', v_sort, now(),
     jsonb_build_object(
       'clientTitle', 'זירוז אישור הייצוג באזור האישי',
       'clientSub', 'אופציונלי - שלוש דקות שמקצרות את ההמתנה לאישור הרשויות',
       'clientNote', E'יש לך כבר משתמש באזור האישי של רשות המסים?\n\nכן - נכנסים בקישור, לוחצים "לכניסה למערכת" ומזדהים. מחפשים את הבקשה שבה מופיע שם המשרד כמייצג, ובוחרים אישור. שתי דקות.\n\nלא - קודם צריך להירשם ולהזדהות מול רשות המסים. זה החלק שלוקח את הזמן, ובלעדיו אי אפשר לאשר.\n\nאם קיבלת מרשות המסים הודעת SMS על רישום מייצג - אפשר להיכנס ישירות מהקישור שבהודעה, וזה קצר יותר.',
       'clientNoteAfter', 'ואם לא הסתדר - אין בעיה. הייצוג ייכנס לתוקף גם בלי זה, זה פשוט לוקח כמה ימים יותר.',
       'clientCta', 'אישרתי באזור האישי',
       'clientLinkUrl', 'https://www.gov.il/he/service/personal_area_taxes',
       'clientLinkLabel', 'לכניסה לאזור האישי'))
  returning id into v_id;

  perform public.log_onboarding_event(c.user_id, v_id, v_eng, 'created', 'system',
    'הבקשה נוצרה כשהייצוג הוגש לשע"ם', '{}'::jsonb);

  return v_id;
end;
$function$

