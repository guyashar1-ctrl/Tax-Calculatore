-- ═══════════════════════════════════════════════════════════════════════════
--  175 — קישורים ציבוריים: בדיקת בריאות בלי עקבות (P1), ו«פורסם» ⇒ קישור קבוע (P7)
-- ═══════════════════════════════════════════════════════════════════════════
--  בדיקת הבריאות של הקישורים הציבוריים (32) קראה ל-get_client_portal על כל
--  לקוח — והפונקציה הזאת, כמו כניסה אמיתית של הלקוח, מטביעה
--  portal_token_last_used_at (97). כל הרצה של הבדיקה סימנה "נצפה לאחרונה" על
--  כל הלקוחות, ובלי להבחין מלקוח שבאמת נכנס. STABLE על הפונקציה החיצונית
--  לא מנע את זה: הכתיבה קורית בפונקציה הפנימית.
--  מעכשיו ענף הדף האישי נבדק דרך הבונה הפנימי (build_client_portal, 164) —
--  אותה תשובה בדיוק, בלי חותמת — ועם אותו כלל תפוגה שהדלת הציבורית אוכפת.
--  הרשאות כפי שקבעה 160: service_role בלבד.
create or replace function public.public_link_health()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with quote_links as (
    select (public.get_quotation(q.public_token)->>'quotationNumber') is not null as ok
    from public.quotations q where q.public_token is not null
  ),
  onboard_links as (
    select (select count(*) from public.get_onboarding(r.onboarding_token)) = 1 as ok
    from public.representation_requests r where r.onboarding_token is not null
  ),
  intake_links as (
    select (select count(*) from public.resolve_intake_token(c.intake_token)) >= 1 as ok
    from public.clients c where c.intake_token is not null
  ),
  sign_tokens as (
    select (select count(*) from public.user_id_for_public_token(s->>'signToken')) >= 1 as ok
    from public.representation_requests r,
         lateral jsonb_array_elements(coalesce(r.signers,'[]'::jsonb)) s
    where s->>'signToken' is not null
  ),
  portal_links as (
    -- 175: הבונה הפנימי ולא הדלת הציבורית — בלי חותמת "נצפה לאחרונה".
    select (c.portal_token_expires_at is null or c.portal_token_expires_at > now())
           and coalesce((public.build_client_portal(c.id, 'live')->>'ok')::boolean, false) as ok
    from public.clients c where c.portal_token is not null
  ),
  release_links as (
    select coalesce((public.get_release_portal(s.payload->>'releaseToken')->>'ok')::boolean, false) as ok
    from public.onboarding_steps s
    where s.step_type = 'release_letter' and nullif(s.payload->>'releaseToken','') is not null
  ),
  apply_links as (
    select (
      select count(*) from public.profiles p2
      where p2.apply_token = p.apply_token
    ) = 1 as ok
    from public.profiles p where p.apply_token is not null
  )
  select jsonb_build_object(
    'quote',    jsonb_build_object('total',(select count(*) from quote_links),   'ok',(select count(*) from quote_links   where ok)),
    'onboard',  jsonb_build_object('total',(select count(*) from onboard_links), 'ok',(select count(*) from onboard_links where ok)),
    'intake',   jsonb_build_object('total',(select count(*) from intake_links),  'ok',(select count(*) from intake_links  where ok)),
    'sign',     jsonb_build_object('total',(select count(*) from sign_tokens),   'ok',(select count(*) from sign_tokens   where ok)),
    'portal',   jsonb_build_object('total',(select count(*) from portal_links),  'ok',(select count(*) from portal_links  where ok)),
    'release',  jsonb_build_object('total',(select count(*) from release_links), 'ok',(select count(*) from release_links where ok)),
    'apply',    jsonb_build_object('total',(select count(*) from apply_links),   'ok',(select count(*) from apply_links   where ok)),
    'allHealthy', (select count(*) from quote_links where not ok)
                + (select count(*) from onboard_links where not ok)
                + (select count(*) from intake_links where not ok)
                + (select count(*) from sign_tokens where not ok)
                + (select count(*) from portal_links where not ok)
                + (select count(*) from release_links where not ok)
                + (select count(*) from apply_links where not ok) = 0
  );
$function$;
revoke execute on function public.public_link_health() from public, anon, authenticated;
grant  execute on function public.public_link_health() to service_role;

-- ── ② P7 — «פורסם» ⇒ יש קישור קבוע ─────────────────────────────────────────
--  הטוקן של הדף האישי נטבע עד היום רק מהדפדפן (mint_portal_token מחלון
--  השליחה / «עדכן את דף הלקוח»). בקשה שפורסמה ממסלול שרת — אישור ההצעה,
--  שחרור המוחזקות, המחולל — השאירה כרטיס שאומר «פורסם» ולקוח שאין לו לאן
--  להגיע: 5 כאלה בייצור ביום הכתיבה. הטוקן הוא יכולת בלבד — הקישור עדיין
--  נשלח רק כשהמשרד שולח (170: «נשלח» = שורה ביומן) — ולכן טביעתו ברגע
--  הפרסום אינה משנה שום התנהגות גלויה, רק סוגרת את הפער. אותו פורמט ואותו
--  «רק אם ריק» כמו mint_portal_token, ובאותה צורה כמו טוקן השאלון (172).
create or replace function public.tg_mint_portal_token_on_publish()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.published_at is not null and (tg_op = 'INSERT' or old.published_at is null) then
    update public.clients
       set portal_token = replace(gen_random_uuid()::text, '-', '')
     where id = new.client_id and portal_token is null;
  end if;
  return new;
end;
$function$;
drop trigger if exists onboarding_steps_mint_portal_token on public.onboarding_steps;
create trigger onboarding_steps_mint_portal_token
  after insert or update of published_at on public.onboarding_steps
  for each row execute function public.tg_mint_portal_token_on_publish();

-- יישור חד-פעמי: מי שכבר פורסם לו משהו מקבל את הקישור הקבוע שלו.
update public.clients c
   set portal_token = replace(gen_random_uuid()::text, '-', '')
 where c.portal_token is null
   and exists (select 1 from public.onboarding_steps s
                where s.client_id = c.id and s.published_at is not null and s.status <> 'cancelled');

-- ── ③ J-P2 — «פתח מחדש» מנקה completed_at גם על בקשה (כמו 166 על משימה) ─────
--  advance_onboarding_step שמרה את חותמת ההשלמה הראשונה לנצח: בקשה שנפתחה
--  מחדש הציגה «הושלם ב-…» לצד מצב «ממתין». ההיסטוריה חיה ביומן האירועים;
--  החותמת על השורה אומרת רק אם הבקשה מושלמת *עכשיו*. שורה אחת, עוגן אחד,
--  ובדיקת אורך — כמו 157/172.
do $do$
declare
  v_def    text;
  v_anchor text := 'completed_at = case when v_new = ''completed'' and completed_at is null then now() else completed_at end,';
  v_new_ln text := 'completed_at = case when v_new = ''completed'' then coalesce(completed_at, now())'
                || ' when v_new in (''pending'', ''in_progress'', ''waiting_client'', ''locked'', ''blocked'') then null'
                || ' else completed_at end, -- 175: פתיחה מחדש מנקה';
  v_new    text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where proname = 'advance_onboarding_step' and pronamespace = 'public'::regnamespace;
  if v_def is null then raise exception '175: advance_onboarding_step לא נמצאה'; end if;
  if position('175: פתיחה מחדש מנקה' in v_def) > 0 then
    raise notice '175: advance_onboarding_step כבר מכילה את התיקון';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '175: העוגן ב-advance_onboarding_step לא נמצא בדיוק פעם אחת';
  end if;
  v_new := replace(v_def, v_anchor, v_new_ln);
  if length(v_new) <> length(v_def) - length(v_anchor) + length(v_new_ln) then
    raise exception '175: אורך לא תואם אחרי ההחלפה';
  end if;
  execute v_new;
end
$do$;

select public.assert_domain_function_invariants();
