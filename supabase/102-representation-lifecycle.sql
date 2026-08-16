-- ─── 102: הסרת המייל האוטומטי הכפול מ-approve_quotation ─────────────────────
-- הכרעת גיא: המעבר בדפדפן מ"אושר" לטופס הייצוג (PublicQuotationPage.tsx,
-- redirect אוטומטי אחרי 2.2 שניות) כבר עושה את מה שהמייל האוטומטי של D1
-- (מיגרציה 72) נועד לעשות — והוא כפילות. ‼ ההעברה עצמה, יצירת בקשת הייצוג,
-- ויצירת ההתקשרות — לא נוגעים בהם בכלל. מסירים אך ורק את בלוק
-- ה-net.http_post ל-send-onboarding-email ואת ה-exception handler סביבו.
--
-- send-onboarding-email עצמה נשארת קיימת ופעילה — משמשת "שלח מייל שוב"
-- (RepresentationRequestReview.tsx) ומיילים לחותמים/בן-זוג.
--
-- ארכוב לפני החלפה: supabase/live-2026-08-07/approve_quotation.sql (הגרסה
-- שלפני 72) ומיגרציה 72 עצמה (הגרסה עם השליחה, המוחלפת כאן).

create or replace function public.approve_quotation(p_token text, p_signature text default null::text, p_signer_name text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  q         public.quotations%rowtype;
  v_req_id  text;
  v_token   text;
  v_needs   boolean := false;
  v_reused  boolean := false;
begin
  select * into q from public.quotations where public_token = p_token limit 1;
  if q.id is null then return jsonb_build_object('status', 'invalid'); end if;

  if q.status = 'approved' then
    v_reused := q.representation_request_id is not null;
    v_req_id := coalesce(q.representation_request_id, public.open_quotation_representation(q.id));
  elsif q.status = 'cancelled' then
    return jsonb_build_object('status', 'cancelled');
  elsif q.expires_at is not null and q.expires_at < now() then
    update public.quotations
      set status = 'expired',
          events = coalesce(events, '[]'::jsonb) || jsonb_build_object('type','expired','at', now())
      where id = q.id and status <> 'expired';
    return jsonb_build_object('status', 'expired');
  elsif q.status not in ('sent','viewed') then
    return jsonb_build_object('status', q.status);
  else
    update public.quotations
      set status = 'approved',
          approved_at = now(),
          approval_signature = coalesce(p_signature, approval_signature),
          approval_signer_name = coalesce(nullif(trim(p_signer_name), ''), approval_signer_name),
          events = coalesce(events, '[]'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
            'type', 'approved',
            'at', now(),
            'note', case when nullif(trim(p_signer_name), '') is not null
                         then 'נחתם על ידי ' || trim(p_signer_name) end
          ))
      where id = q.id;

    v_req_id := public.open_quotation_representation(q.id);
    select (r.created_at < now() - interval '10 seconds') into v_reused
      from public.representation_requests r where r.id = v_req_id;
  end if;

  begin
    perform public.create_engagement_for_quotation(q.id, false);
  exception when others then
    null;
  end;

  select r.onboarding_token, coalesce(r.onboarding_status, 'pending') = 'pending'
    into v_token, v_needs
    from public.representation_requests r where r.id = v_req_id;

  return jsonb_build_object(
    'status', 'approved',
    'onboardingToken', case when coalesce(v_needs, false) then v_token end,
    'repReused', coalesce(v_reused, false)
  );
end;
$function$;

-- ── תיקון סמנטי: "אזהרת 24 שעות" בודקת השלמה, לא שליחת מייל ──────────────────
-- ‼ התנאי המקורי כבר בדק onboarding_status='pending' + 24 שעות מהאישור —
-- זה בדיוק "הלקוח לא השלים את פרטי הייצוג", מילה במילה. השורה היחידה שהייתה
-- שקרית אחרי הסרת המייל האוטומטי היא q.representation_sent_at is null (שהייתה
-- אומרת "מייל לא יצא", ועכשיו הייתה אומרת את זה כמעט תמיד, גם כשהכול תקין).
-- מסירים רק אותה. שאר הפונקציה, כולל ה-not-exists נגד התראה כפולה, לא זזה.

create or replace function public.flag_missing_representation_links()
returns integer
language plpgsql security definer set search_path to 'public'
as $function$
declare
  r record;
  v_n int := 0;
begin
  for r in
    select q.id, q.user_id, q.quotation_number, q.client_id
      from public.quotations q
      join public.representation_requests rr on rr.id = q.representation_request_id
     where q.status = 'approved'
       and coalesce(rr.onboarding_status, 'pending') = 'pending'
       and q.approved_at < now() - interval '24 hours'
       -- פעם אחת להצעה. התראה שחוזרת כל יום הופכת לרעש שמתעלמים ממנו.
       and not exists (
         select 1 from public.accountant_notifications an
          where an.kind = 'representation_link_missing'
            and an.payload->>'quotationId' = q.id)
  loop
    perform public.queue_accountant_notification(
      r.user_id, 'representation_link_missing', r.client_id, null, null, null,
      jsonb_build_object('quotationId', r.id, 'quotationNumber', r.quotation_number));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;

revoke all on function public.flag_missing_representation_links() from public, anon, authenticated;
