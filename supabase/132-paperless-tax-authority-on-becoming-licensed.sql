-- ─── 132 · הבקשה נולדת גם כשלקוח *הופך* לעוסק מורשה ────────────────────────
-- 130 יצרה את השלב רק בשעת הקליטה, מתבנית ההצעה או מ-clients.dealer_type.
-- אבל עוסק פטור שהופך למורשה חודש אחרי הקליטה לא עובר בשום מחולל — ולכן
-- הבקשה לא הייתה מגיעה אליו לעולם בלי שגיא יזכור להוסיף אותה ידנית.
--
-- ‼ הטריגר הוא הסיווג שעל הכרטיס ולא "שירות עתידי" בהצעה. בדקתי:
-- «מעבר מעוסק פטור לעוסק מורשה» יושב ב-futureServices של **כל** הצעת עוסק
-- פטור (הוא פריט מחירון בתבנית `exempt_dealer`), ולכן הוא אינו מעיד על
-- לקוח מסוים אלא על סוג ההצעה. שימוש בו היה שולח את הבקשה לכל עוסק פטור.
-- מה שכן מעיד: `clients.vat_status = 'authorizedDealer'` — השדה שבתיק המס,
-- שהמשרד מעדכן כשהסיווג באמת משתנה.
--
-- שלושה חלקים:
--   1. sync_paperless_tax_authority_step — יוצרת את הבקשה כשהתנאים מתקיימים
--   2. טריגר על clients (dealer_type / vat_status) שקורא לה
--   3. הרחבת המחולל, כדי ששלוש הראיות יהיו זהות בשני המסלולים
--
-- ‼ בקשה שהמשרד הסיר אינה נולדת מחדש: הבדיקה היא על **כל** סטטוס, כולל
-- cancelled. אותו כלל של 117.

-- ── 1. הסנכרון ─────────────────────────────────────────────────────────────
create or replace function public.sync_paperless_tax_authority_step(p_client_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c          public.clients%rowtype;
  v_conn     public.onboarding_steps%rowtype;
  v_licensed boolean;
  v_eng      text;
  v_id       text;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;

  -- ‼ כל סטטוס, כולל מבוטל: הסרה היא החלטה של המשרד ולא באג לתקן.
  if exists (select 1 from public.onboarding_steps
              where client_id = p_client_id and step_type = 'paperless_tax_authority') then
    return jsonb_build_object('ok', true, 'action', 'exists');
  end if;

  select * into v_conn from public.onboarding_steps
    where client_id = p_client_id and step_type = 'paperless_connection'
      and status <> 'cancelled' limit 1;

  -- בלי פייפרלס אין מה לחבר לרשות המסים.
  if coalesce(c.paperless_status, '') = 'not_applicable'
     or (v_conn.id is null and not exists (select 1 from public.onboarding_steps
            where client_id = p_client_id and step_type = 'paperless_invite'
              and status <> 'cancelled')) then
    return jsonb_build_object('ok', true, 'action', 'no_paperless');
  end if;

  select coalesce(bool_or(t.kind in ('licensed_dealer','company')), false)
    into v_licensed
    from public.engagements e
    join public.quotations q on q.id = e.quotation_id
    join public.quotation_templates t on t.id = q.template_id
   where e.client_id = p_client_id;
  v_licensed := coalesce(v_licensed, false)
                or coalesce(c.dealer_type, '') in ('licensed','company')
                or coalesce(c.vat_status, '') = 'authorizedDealer';
  if not v_licensed then
    return jsonb_build_object('ok', true, 'action', 'not_licensed');
  end if;

  select id into v_eng from public.engagements
   where client_id = p_client_id order by created_at desc limit 1;

  insert into public.onboarding_steps (
    user_id, engagement_id, client_id, required_for_close, step_type, track, scope,
    status, ball, depends_on_step_id, sort_order, payload)
  values (
    c.user_id, v_eng, p_client_id, true, 'paperless_tax_authority', 'tools', 'person',
    case when v_conn.id is null or v_conn.status in ('completed','verified','skipped')
         then 'pending' else 'locked' end,
    'client', v_conn.id, coalesce(v_conn.sort_order, 0),
    jsonb_build_object(
      'clientTitle', 'חיבור פייפרלס לרשות המסים',
      'clientSub', 'כדי שהחשבוניות שלך יקבלו מספר הקצאה',
      'clientNote', E'1. בפייפרלס: הגדרות ← חיבורים והרשאות, ולחיצה על אייקון הקישור.\n2. נפתח אתר רשות המסים ומבקש הזדהות - תעודת זהות וקוד קבוע (לא כרטיס חכם). מאשרים את ההרשאה.\n3. חוזרים לפייפרלס ולוחצים "המשך".',
      'clientNoteAfter', 'החיבור תקף לשלושה חודשים ואז צריך לחדש אותו - נזכיר לך כשיגיע הזמן. אם החיבור נכשל, ממתינים כשלוש שעות ומנסים שוב.',
      'clientCta', 'ביצעתי את החיבור',
      'clientLinkUrl', 'https://academy-bu.paperless.tax/he/articles/11424861-%D7%97%D7%99%D7%91%D7%95%D7%A8-%D7%94%D7%9E%D7%A2%D7%A8%D7%9B%D7%AA-%D7%9C%D7%A8%D7%A9%D7%95%D7%AA-%D7%94%D7%9E%D7%99%D7%A1%D7%99%D7%9D'))
  returning id into v_id;

  perform public.log_onboarding_event(c.user_id, v_id, v_eng, 'created', 'system',
    'נפתחה בקשת חיבור פייפרלס לרשות המסים - הלקוח מסווג כעוסק מורשה',
    jsonb_build_object('dealerType', c.dealer_type, 'vatStatus', c.vat_status));

  return jsonb_build_object('ok', true, 'action', 'created', 'stepId', v_id);
end;
$function$;

-- ── 2. הטריגר — הרגע שבו הסיווג משתנה ──────────────────────────────────────
create or replace function public.trg_sync_paperless_tax_authority()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(new.dealer_type, '') in ('licensed','company')
     or coalesce(new.vat_status, '') = 'authorizedDealer' then
    if tg_op = 'INSERT'
       or coalesce(old.dealer_type, '') is distinct from coalesce(new.dealer_type, '')
       or coalesce(old.vat_status, '') is distinct from coalesce(new.vat_status, '') then
      perform public.sync_paperless_tax_authority_step(new.id);
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists sync_paperless_tax_authority_trg on public.clients;
create trigger sync_paperless_tax_authority_trg
  after insert or update of dealer_type, vat_status on public.clients
  for each row execute function public.trg_sync_paperless_tax_authority();

-- ── 3. המחולל קורא את אותן שלוש הראיות ─────────────────────────────────────
do $do$
declare
  v_src text := pg_get_functiondef('public.generate_onboarding_steps(text,boolean)'::regprocedure);
  v_new text;
begin
  if position('vat_status' in v_src) > 0 then
    raise notice '132: המחולל כבר קורא את vat_status - מדלגים';
    return;
  end if;

  v_new := replace(v_src,
    $q$  v_licensed := coalesce(v_licensed, false)
                or coalesce(v_client.dealer_type, '') in ('licensed','company');$q$,
    $q$  v_licensed := coalesce(v_licensed, false)
                or coalesce(v_client.dealer_type, '') in ('licensed','company')
                or coalesce(v_client.vat_status, '') = 'authorizedDealer';$q$);
  if v_new = v_src then raise exception '132: חישוב v_licensed לא נמצא במחולל'; end if;

  execute v_new;
end $do$;
