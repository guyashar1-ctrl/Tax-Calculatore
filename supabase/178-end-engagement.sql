-- ═══════════════════════════════════════════════════════════════════════════
--  178 — סיום התקשרות: פעולה מפורשת, נפרדת מביטול הצעה ומייצוג (C7)
-- ═══════════════════════════════════════════════════════════════════════════
--  הכרעת מוצר C7 (ספר הפערים, 09.09.2026):
--   · הצעה מאושרת היא ראיה היסטורית להסכם. היא **אינה** מבוטלת כדי לייצג
--     סיום קשר עם לקוח — cancel_quotation (171/172) כבר מסרבת ל-approved
--     (not_cancellable) מכל דלת, כולל UPDATE ישיר (הטריגר של 171). זה נשאר
--     כפי שהוא; אין כאן שינוי לפונקציה ההיא.
--   · סיום עבודה עם לקוח שייך למחזור החיים של ה-**התקשרות**, לא של ההצעה.
--     המודל: הצעה מאושרת → נוצרת התקשרות (onboarding/active) → בהמשך,
--     אם צריך, פעולת "סיים התקשרות" מפורשת.
--   · end_engagement היא הפעולה החדשה היחידה שמסיימת התקשרות שלא דרך
--     חידוש/החלפה (apply_due_engagement_transitions, שמסמנת 'ended' על
--     ההתקשרות הישנה כשהחדשה נכנסת לתוקף — נשארת כפי שהיא, ומקבלת עכשיו
--     גם reason='superseded' כדי ששני הנתיבים ל-'ended' יהיו ניתנים להבחנה).
--   · סיום התקשרות **אינו** מבטל ייצוג. ייצוג הוא מחזור חיים נפרד לגמרי
--     (representation_status נגזר בשרת מבקשת הייצוג — 155/157/171) ואינו
--     מקושר כאן בשום צורה, לא במפורש ולא במרומז, עד שתהיה החלטת מוצר עתידית
--     שאומרת אחרת.
--   · אין UI מאושר לפעולה הזאת עדיין (C7: "אל תמציא ממשק שלא אושר") — זה
--     רק הבסיס בשרת. history: ended_at (קיים כבר), ended_reason (חדש),
--     ended_by (חדש — מי ביצע: uuid למשתמש, null לפעולת מערכת/חידוש),
--     ואירוע ביומן ההתקשרות (log_onboarding_event).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.engagements
  add column if not exists ended_reason text,
  add column if not exists ended_by uuid references auth.users(id);

comment on column public.engagements.ended_reason is
  'למה הסתיימה — free text מהרו"ח ל-end_engagement, או ''superseded'' כשהסיום נגרם מכניסת התקשרות חדשה לתוקף (178, C7).';
comment on column public.engagements.ended_by is
  'מי ביצע את הסיום. null = פעולת מערכת (חידוש/החלפה); לא null = end_engagement מפורשת (178, C7).';

-- ── ① end_engagement — פעולה מפורשת, נפרדת מייצוג ומהצעה ───────────────────
create or replace function public.end_engagement(p_engagement_id text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  e     public.engagements%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;

  select * into e from public.engagements where id = p_engagement_id and user_id = v_uid for update;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  -- ‼ רק התקשרות חיה (בקליטה או פעילה) ניתנת לסיום מפורש. 'scheduled' טרם
  -- החלה (ראה שער readiness); 'ended'/'cancelled' כבר סופיות.
  if e.status not in ('onboarding', 'active') then
    return jsonb_build_object('ok', false, 'error', 'not_endable', 'status', e.status);
  end if;

  update public.engagements
     set status = 'ended',
         ended_at = now(),
         ended_reason = nullif(trim(coalesce(p_reason, '')), ''),
         ended_by = v_uid,
         updated_at = now()
   where id = e.id;

  -- ‼ ייצוג הוא מחזור חיים נפרד ואינו מושפע כאן, לא בכתיבה ולא בגזירה —
  -- representation_status ממשיך להיגזר מבקשת הייצוג כרגיל (155/157/171).
  perform public.log_onboarding_event(e.user_id, null, e.id, 'status_changed', 'accountant',
    'ההתקשרות סומנה כמסתיימת' || case when nullif(trim(coalesce(p_reason,'')),'') is not null
      then ' - ' || trim(p_reason) else '' end,
    jsonb_build_object('from', e.status, 'to', 'ended', 'reason', p_reason));

  return jsonb_build_object('ok', true, 'engagementId', e.id, 'endedAt', now());
end;
$function$;

revoke execute on function public.end_engagement(text, text) from public, anon;
grant  execute on function public.end_engagement(text, text) to authenticated, service_role;

-- ── ② apply_due_engagement_transitions — מסמנת reason='superseded' ─────────
--  אותו גוף בדיוק, עם שתי תוספות: reason על ההתקשרות הישנה, ובדיקת אורך.
do $do$
declare
  v_def    text;
  v_anchor text := E'    update public.engagements\n       set status = ''ended'', ended_at = now(), updated_at = now()\n     where client_id = r.client_id\n       and status in (''onboarding'',''active'')\n       and id <> r.id;';
  v_new_ln text := E'    -- 178: הסיום הזה נגרם מכניסת ההתקשרות החדשה לתוקף — לא פעולה מפורשת.\n'
                || E'    update public.engagements\n'
                || E'       set status = ''ended'', ended_at = now(), ended_reason = ''superseded'', updated_at = now()\n'
                || E'     where client_id = r.client_id\n'
                || E'       and status in (''onboarding'',''active'')\n'
                || E'       and id <> r.id;';
  v_new    text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where proname = 'apply_due_engagement_transitions' and pronamespace = 'public'::regnamespace;
  if v_def is null then raise exception '178: apply_due_engagement_transitions לא נמצאה'; end if;
  if position('178: הסיום הזה נגרם' in v_def) > 0 then
    raise notice '178: apply_due_engagement_transitions כבר מכילה את התיקון';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '178: העוגן ב-apply_due_engagement_transitions לא נמצא בדיוק פעם אחת';
  end if;
  v_new := replace(v_def, v_anchor, v_new_ln);
  if length(v_new) <> length(v_def) - length(v_anchor) + length(v_new_ln) then
    raise exception '178: אורך לא תואם אחרי ההחלפה';
  end if;
  execute v_new;
end
$do$;

select public.assert_domain_function_invariants();
