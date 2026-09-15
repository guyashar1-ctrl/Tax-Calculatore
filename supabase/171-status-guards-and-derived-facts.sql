-- ═══════════════════════════════════════════════════════════════════════════
--  171 — שערי מצב, עובדות נגזרות, וניקוי פונקציות מתות
-- ═══════════════════════════════════════════════════════════════════════════
--  אוסף ממצאים מספר הפערים שאין להם "אשכול" משלהם, וכולם מאותה משפחה:
--  המסד מרשה מצב שהמוצר לא מכיר, או שתי עמודות שאומרות אותו דבר בלי שמישהו
--  שומר שהן מסכימות.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① CHECK על מצבי הצעה וליד (C8) ─────────────────────────────────────────
--  הערכים הם בדיוק אלה של QuotationStatus / LeadStatus ב-src/types/quotations.ts.
--  בלי זה, טעות כתיב אחת בקוד הופכת לשורה שאף מסך לא יודע להציג.
alter table public.quotations drop constraint if exists quotations_status_check;
alter table public.quotations add constraint quotations_status_check
  check (status in ('draft', 'sent', 'viewed', 'approved', 'cancelled', 'expired'));

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check
  check (status in ('new', 'quoted', 'converted', 'closed'));

-- ── ② ביטול הצעה — פעולה על הצעה שטרם אושרה בלבד (C3/C4) ────────────────────
--  הדפדפן ביטל הצעה מתוך עותק ישן: המסך זכר "נשלחה", השרת כבר ידע "אושרה",
--  והכתיבה העיוורת דרסה אישור חתום. ביטול הצעה שאושרה אינו "ביטול הצעה" —
--  זו סיום התקשרות, מחזור חיים אחר (הכרעת מוצר פתוחה, C7). לכן:
--    · ה-RPC מבטל רק draft/sent/viewed ומחזיר את המצב האמיתי אחרת;
--    · הטריגר חוסם approved→cancelled מכל דלת, כולל UPDATE ישיר.
create or replace function public.cancel_quotation(p_quotation_id text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  q public.quotations%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;
  select * into q from public.quotations where id = p_quotation_id and user_id = v_uid for update;
  if q.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if q.status not in ('draft', 'sent', 'viewed') then
    -- ‼ לא כישלון: המסך פשוט ראה מצב ישן. מחזירים לו את האמת.
    return jsonb_build_object('ok', false, 'error', 'not_cancellable', 'status', q.status);
  end if;
  update public.quotations
     set status = 'cancelled',
         cancelled_at = now(),
         events = coalesce(events, '[]'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
           'type', 'cancelled', 'at', now(), 'note', nullif(trim(coalesce(p_note, '')), '')))
   where id = q.id;
  select * into q from public.quotations where id = q.id;
  return jsonb_build_object('ok', true, 'quotation', to_jsonb(q));
end;
$function$;
revoke execute on function public.cancel_quotation(text, text) from public, anon;
grant  execute on function public.cancel_quotation(text, text) to authenticated, service_role;

create or replace function public.tg_guard_quotation_status()
returns trigger
language plpgsql
as $function$
begin
  -- אישור הוא סופי מבחינת ההצעה. יציאה ממנו היא סיום התקשרות, לא עריכת הצעה.
  if old.status = 'approved' and new.status <> 'approved' then
    raise exception 'quotation % is approved; status cannot change to % (end the engagement instead)',
      old.id, new.status using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;
drop trigger if exists quotations_guard_status on public.quotations;
create trigger quotations_guard_status
  before update of status on public.quotations
  for each row execute function public.tg_guard_quotation_status();

-- ── ③ פטור מניכוי במקור נגזר ממצב הניכוי (T5) ───────────────────────────────
--  שתי עמודות, אותה עובדה: withholding_status ('exempt'|'rates'|'none') ו-
--  has_exempt_from_withholding. לשונית אחת ערכה צ'קבוקס, אחרת ערכה מצב, ואיש
--  לא שמר שהן מסכימות. מעכשיו המצב הוא המקור, והדגל נגזר ממנו כשהמצב ידוע.
create or replace function public.tg_derive_withholding_exempt()
returns trigger
language plpgsql
as $function$
begin
  if new.withholding_status is not null then
    new.has_exempt_from_withholding := (new.withholding_status = 'exempt');
  end if;
  return new;
end;
$function$;
drop trigger if exists clients_derive_withholding_exempt on public.clients;
create trigger clients_derive_withholding_exempt
  before insert or update of withholding_status, has_exempt_from_withholding on public.clients
  for each row execute function public.tg_derive_withholding_exempt();

-- ── ④ profiles.apply_token — קיים בפרודקשן בלי מיגרציה (PF19) ───────────────
alter table public.profiles add column if not exists apply_token text;

-- ── ⑤ פונקציות מתות (C8, B9) ───────────────────────────────────────────────
--  create_deferred_collection_tasks — עותק מת של נוסחת החיובים (הנוסחה החיה
--  ב-create_engagement_for_quotation); submit_onboarding — הגרסה בת 5 הארגומנטים
--  שהדף הציבורי החליף ב-_full. לשתיהן אין אף קורא, לא ב-SQL ולא בקוד.
--  resolve_intake_token נשארת: יש לה חמישה קוראים פנימיים.
drop function if exists public.create_deferred_collection_tasks(text);
drop function if exists public.submit_onboarding(text, text, text, text, text);

select public.assert_domain_function_invariants();
