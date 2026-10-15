-- ═══════════════════════════════════════════════════════════════════════════
-- 245 · «אישרתי באזור האישי» ששע״ם לא קלטה — הבקשה חוזרת ללקוח (15.10.2026)
--
-- המקרה (אמיר ויסמרק, 14–15.10): הלקוח לחץ «אישרתי» בדף האישי. הכרטיס עבר ל«בטיפול
-- המשרד — תודה, אנחנו בודקים» והמדריך והקישור ירדו מהדף. הבדיקות בשע״ם אחרי זה (אחרי 16
-- דקות ושוב אחרי 21 שעות) עדיין הציגו «ממתין לאישור לקוח», ושום דבר לא החזיר את הבקשה
-- אליו: הדף המשיך להגיד «בודקים», ובמשרד לא הייתה דרך להחזיר אותה.
--
-- הכרעת גיא (15.10): כשבדיקה בשע״ם אחרי ההצהרה עדיין מציגה «ממתין לאישור לקוח» —
-- ההצהרה לא נקלטה, והבקשה חוזרת ללקוח עם ההנחיות, המדריך והקישור.
--
--   1. _rep_approval_return_not_received — מחזירה את השלב ללקוח. ההצהרה לא נמחקת:
--      עוברת ל-declarationsNotReceived (היסטוריה), ו-notReceivedAt אומר לדף ולמשרד
--      מתי שע״ם הראתה שהאישור לא הגיע.
--   2. shaam_require_client_approval (שנקראת רק מבדיקה בשע״ם שמציגה «ממתין לאישור לקוח»)
--      — מפעילה את 1 כשההצהרה ישנה מ-15 דקות. המרווח מכסה בדיקה שהתחילה לפני הלחיצה
--      והסתיימה אחריה, ועיכוב קצר בצד הרשות.
--   3. _portal_step_items — הפריט rep_approval נושא notReceivedAt, כדי שהדף יגיד ללקוח
--      שהאישור עוד לא הגיע (ולא יציג את הכרטיס כאילו לא נגע בו).
--
-- ‼ שום דבר כאן לא שולח מייל ולא מפרסם. שלב שהושלם לא נפתח.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public._rep_approval_return_not_received(p_step_id text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  s public.onboarding_steps%rowtype;
begin
  select * into s from public.onboarding_steps where id = p_step_id for update;
  if s.id is null or s.step_type <> 'rep_client_approval' then return false; end if;
  if s.status in ('completed', 'verified', 'skipped', 'cancelled') then return false; end if;
  if nullif(s.payload ->> 'clientDeclaredAt', '') is null then return false; end if;

  update public.onboarding_steps
     set status = 'pending', ball = 'client', needs_attention = false,
         payload = (payload - 'clientDeclaredAt' - 'submittedByClient')
           || jsonb_build_object(
                'notReceivedAt', to_jsonb(now()),
                'declarationsNotReceived',
                  coalesce(case when jsonb_typeof(payload -> 'declarationsNotReceived') = 'array'
                                then payload -> 'declarationsNotReceived' end, '[]'::jsonb)
                  || jsonb_build_array(jsonb_build_object(
                       'declaredAt', payload ->> 'clientDeclaredAt',
                       'returnedAt', to_jsonb(now()),
                       'source', 'shaam')))
   where id = s.id;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'system',
    'שע״ם עדיין ממתינה לאישור הלקוח אחרי «אישרתי» - הבקשה חזרה לדף האישי עם ההנחיות והקישור',
    jsonb_build_object('to', 'pending', 'source', 'shaam', 'declaredAt', s.payload ->> 'clientDeclaredAt'));
  return true;
end;
$$;

revoke all on function public._rep_approval_return_not_received(text) from public, anon, authenticated;
grant  execute on function public._rep_approval_return_not_received(text) to service_role;

create or replace function public.shaam_require_client_approval(p_client_id text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_id text;
  s    public.onboarding_steps%rowtype;
begin
  v_id := public.ensure_rep_client_approval_step(p_client_id);

  if v_id is null then
    -- המשרד הסיר בעבר את כרטיס הזירוז. עכשיו שע״ם דורשת את האישור —
    -- זו אותה יחידת עבודה, והיא חוזרת (האינדקס מתיר רק שורה חיה אחת).
    select * into s from public.onboarding_steps
     where client_id = p_client_id and step_type = 'rep_client_approval' and status = 'cancelled'
     order by created_at desc limit 1;
    if s.id is null then return null; end if;
    perform public._set_step_status(s.id, 'pending', 'system',
      'שע״ם ממתינה לאישור הלקוח - הבקשה חזרה כחובה', jsonb_build_object('source', 'shaam'), 'client', null);
    -- ‼ 217: חוזר עכשיו ⇒ «פורסם» עכשיו (השער לכל בקשה רואה אותו כשייך להווה, לא לעבר).
    update public.onboarding_steps set published_at = now() where id = s.id;
    v_id := s.id;
  end if;

  select * into s from public.onboarding_steps where id = v_id;
  if s.status in ('completed', 'verified', 'skipped') then return v_id; end if;

  -- ‼ 245 · הלקוח דיווח «אישרתי», ושע״ם עדיין ממתינה לאישור שלו ⇒ ההצהרה לא נקלטה,
  -- והבקשה חוזרת אליו. 15 דקות: בדיקה שהתחילה לפני הלחיצה אינה ראיה נגדה.
  if nullif(s.payload ->> 'clientDeclaredAt', '') is not null
     and (s.payload ->> 'clientDeclaredAt')::timestamptz < now() - interval '15 minutes' then
    perform public._rep_approval_return_not_received(v_id);
    select * into s from public.onboarding_steps where id = v_id;
  end if;

  if coalesce(s.payload ->> 'requiredBy', '') = 'shaam' then return v_id; end if;

  update public.onboarding_steps
     set required_for_close = true,
         published_at = coalesce(published_at, now()),
         ball = case when nullif(payload ->> 'clientDeclaredAt', '') is not null then ball else 'client' end,
         payload = public._rep_client_approval_required_payload(payload, public._rep_approval_people(p_client_id)),
         updated_at = now()
   where id = v_id;

  perform public.log_onboarding_event(s.user_id, v_id, s.engagement_id, 'note', 'system',
    'שע״ם מציגה «ממתין לאישור לקוח» - אישור הלקוח באזור האישי נדרש כדי שהייצוג ייקלט',
    jsonb_build_object('source', 'shaam', 'requiredBy', 'shaam'));
  return v_id;
end;
$function$;

revoke all on function public.shaam_require_client_approval(text) from public, anon, authenticated;
grant  execute on function public.shaam_require_client_approval(text) to service_role;

-- ── 3 · הדף: notReceivedAt על הפריט rep_approval (הזרקה לגוף החי, עוגן של שורה אחת) ──
create or replace function public._r245_patch(p_fn regprocedure, p_old text, p_new text)
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_fn);
  v_n int := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
begin
  if position(p_new in v_def) > 0 then return; end if;
  if v_n <> 1 then
    raise exception '245: anchor count % (expected 1) in %: %', v_n, p_fn, left(p_old, 120);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$$;

select public._r245_patch(
  'public._portal_step_items(public.onboarding_steps, public.clients, public.profiles, public.representation_requests, jsonb, jsonb)'::regprocedure,
  $a$'approvals', v_rep_approvals,$a$,
  $b$'approvals', v_rep_approvals,
          -- 245 · «אישרתי» קודם, ושע״ם הראתה שהאישור לא הגיע ⇒ הדף אומר את זה.
          'notReceivedAt', nullif(s.payload->>'notReceivedAt',''),$b$);

drop function public._r245_patch(regprocedure, text, text);

-- ‼ אימות: הגוף החי (לא המשתנה) נושא את השורה.
do $verify$
begin
  if position('''notReceivedAt'', nullif(s.payload->>''notReceivedAt'','''')' in
       pg_get_functiondef('public._portal_step_items(public.onboarding_steps, public.clients, public.profiles, public.representation_requests, jsonb, jsonb)'::regprocedure)) = 0 then
    raise exception '245: _portal_step_items was not patched';
  end if;
  if position('_rep_approval_return_not_received' in
       pg_get_functiondef('public.shaam_require_client_approval(text)'::regprocedure)) = 0 then
    raise exception '245: shaam_require_client_approval was not replaced';
  end if;
end;
$verify$;
