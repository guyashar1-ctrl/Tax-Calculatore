-- 291 · סוג העוסק מההצעה המאושרת הוא ברירת מחדל בכרטיס, בלי אישור נוסף.
-- זהו סוג תפעולי בלבד: אין כתיבה לסיווג מע״מ או לעובדות מאומתות/היסטוריות.
-- העדכון הרטרואקטיבי נפרד, כדי לבדוק ולגבות את המועמדים לפני הפעלתו.
begin;

create or replace function public._apply_quotation_dealer_default(p_quotation_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  q public.quotations%rowtype;
  c public.clients%rowtype;
  v_kind text;
  v_dealer text;
  v_eng text;
begin
  select * into q from public.quotations where id = p_quotation_id;
  if q.id is null or q.status <> 'approved' or q.client_id is null
     or coalesce(q.kind, 'engagement') <> 'engagement' then
    return jsonb_build_object('action', 'not_applicable');
  end if;
  if q.effective_from > current_date then
    return jsonb_build_object('action', 'future_quote');
  end if;
  select * into c from public.clients where id = q.client_id for update;
  if c.id is null then return jsonb_build_object('action', 'no_client'); end if;
  -- בעלות נבדקת גם בקריאה פנימית, ולא מסתמכים על מזהה לקוח שנשלח מבחוץ.
  if q.user_id <> c.user_id and not exists (
    select 1 from public.profiles a join public.profiles b on b.office_id = a.office_id
     where a.id = q.user_id and b.id = c.user_id and a.office_id is not null
  ) then return jsonb_build_object('action', 'wrong_office'); end if;

  select t.kind into v_kind from public.quotation_templates t
   where t.id = q.template_id and (t.user_id = q.user_id or exists (
     select 1 from public.profiles a join public.profiles b on b.office_id = a.office_id
      where a.id = q.user_id and b.id = t.user_id and a.office_id is not null));
  v_dealer := case v_kind when 'exempt_dealer' then 'exempt'
                          when 'licensed_dealer' then 'licensed'
                          when 'company' then 'company' end;
  if v_dealer is null then return jsonb_build_object('action', 'no_explicit_kind'); end if;
  if nullif(btrim(c.dealer_type), '') is not null then
    return jsonb_build_object('action', case when c.dealer_type = v_dealer then 'already_set' else 'card_conflict' end);
  end if;
  if nullif(btrim(c.vat_status), '') is not null and not (
    (c.vat_status = 'exemptDealer' and v_dealer = 'exempt') or
    (c.vat_status = 'authorizedDealer' and v_dealer in ('licensed', 'company'))
  ) then return jsonb_build_object('action', 'vat_conflict'); end if;
  -- כמה הצעות מאושרות עם סוגים שונים אינן בסיס להשלמת נתון חסר בשקט.
  if exists (
    select 1 from public.quotations prev join public.quotation_templates t on t.id = prev.template_id
     where prev.client_id = c.id and prev.status = 'approved'
       and coalesce(prev.kind, 'engagement') = 'engagement'
       and (prev.effective_from is null or prev.effective_from <= current_date)
       and t.kind in ('exempt_dealer', 'licensed_dealer', 'company') and t.kind <> v_kind
  ) then return jsonb_build_object('action', 'quote_conflict'); end if;

  update public.clients set dealer_type = v_dealer where id = c.id;
  select id into v_eng from public.engagements where client_id = c.id order by created_at desc limit 1;
  if v_eng is not null then
    perform public.log_onboarding_event(c.user_id, null, v_eng, 'note', 'system',
      'סוג העוסק הושלם אוטומטית לפי ההצעה המאושרת',
      jsonb_build_object('source', 'quotation_dealer_default', 'quotationId', q.id,
                        'dealerType', v_dealer, 'previousDealerType', c.dealer_type));
  end if;
  return jsonb_build_object('action', 'updated', 'clientId', c.id, 'dealerType', v_dealer);
end;
$$;
revoke all on function public._apply_quotation_dealer_default(text) from public, anon, authenticated;

-- אותו מסלול אישור והתקשרות, לפני העשרת הליד ולפני יצירת בקשות הקליטה.
-- אין שכפול של גוף הפונקציה החי ואין שינוי בסמנטיקת dry-run.
do $$
declare
  v_body text := pg_get_functiondef('public.create_engagement_for_quotation(text,boolean)'::regprocedure);
  v_anchor text := '    perform public.copy_lead_facts_to_client(q.id);';
  v_call text := '    perform public._apply_quotation_dealer_default(q.id);';
begin
  if position(v_call in v_body) = 0 then
    if (length(v_body) - length(replace(v_body, v_anchor, ''))) / length(v_anchor) <> 1 then
      raise exception '291: create_engagement_for_quotation anchor changed';
    end if;
    execute replace(v_body, v_anchor, v_call || E'\n' || v_anchor);
  end if;
end;
$$;
commit;
