-- ═══════════════════════════════════════════════════════════════════════════
--  46 · לקוח שלא יעבוד עם פייפרלס + תיקון נעילה מיותרת
-- ═══════════════════════════════════════════════════════════════════════════
--  ‼ המצב שחסר: שכיר להחזר מס, בעל שליטה, לקוח שגובים ממנו בהוראת קבע ולא
--  דרך פייפרלס. עד היום המנוע ידע רק "בפייפרלס / לא בפייפרלס עדיין" — ולכן
--  ללקוח כזה נפתחו שלבי הזמנה וחיבור שלעולם לא ייסגרו, והרשאת התשלום נשארה
--  נעולה מאחוריהם לנצח.
--
--  ‼ המסלול הרביעי אינו "דילוג": הוא עובדה על האדם. לכן היא יושבת על הכרטיס
--  (clients.paperless_status) ולא רק על השלב — התקשרות שנייה חייבת לדעת אותה
--  גם כשלא נשאר אף שלב פייפרלס לקרוא ממנו.
--
--  ‼ התשלום לא מוותר: בלי פייפרלס הוא הופך ל"הסדר גבייה ידני" — בלי תלות,
--  בלי קישור ובלי מייל. הכסף לא נעלם רק כי הכלי שונה.
--
--  ‼ תיקון נלווה (ה.3): שלב שנוצר עם תלות שכבר הושלמה נולד `pending` ולא
--  `locked`. עד היום התקשרות שנייה ללקוח שכבר חובר לפייפרלס ייצרה הרשאה
--  נעולה שאין מה לפתוח אותה — הפתיחה האוטומטית רצה רק ברגע שהתלות נסגרת,
--  וזה כבר קרה בעבר.
--
--  כל הנוסחים כאן נשלפו מ-pg_get_functiondef לפני השינוי. תוספתי בלבד.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── העובדה על הכרטיס ────────────────────────────────────────────────────────
alter table public.clients add column if not exists paperless_status text;

comment on column public.clients.paperless_status is
  'none | other_rep | self | not_applicable — מסלול הפייפרלס של האדם. נקבע ב-set_paperless_path ונקרא ע"י המרכיב.';

-- ── 1 · תלות מסופקת גם ע"י דילוג "לא רלוונטי" ──────────────────────────────
create or replace function public.onboarding_dependency_met(p_step_id text)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  s public.onboarding_steps%rowtype;
  d public.onboarding_steps%rowtype;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return false; end if;
  if s.depends_on_step_id is null then return true; end if;
  select * into d from public.onboarding_steps where id = s.depends_on_step_id;
  if d.id is null then return true; end if;
  if d.status in ('completed','verified') then return true; end if;
  if d.status = 'skipped' then
    -- ‼ 'not_applicable' הצטרף: לקוח שלא יעבוד עם פייפרלס אינו "מדלג" על
    -- החיבור — הוא פשוט לא צריך אותו, ואין סיבה שהתשלום ימתין לו.
    return coalesce(d.payload->>'skipReason', '')
           in ('already_connected','transferred_rep','not_applicable_history','not_applicable');
  end if;
  return false;
end;
$function$;

-- ── 2 · מסלול הפייפרלס, כולל "לא יעבוד עם פייפרלס" ─────────────────────────
create or replace function public.set_paperless_path(
  p_client_id text, p_paperless_status text, p_data_source text, p_software_name text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid      uuid := auth.uid();
  v_invite   public.onboarding_steps%rowtype;
  v_conn     public.onboarding_steps%rowtype;
  v_import   public.onboarding_steps%rowtype;
  v_verify   public.onboarding_steps%rowtype;
  v_retainer public.onboarding_steps%rowtype;
  v_eng      text;
  v_facts    jsonb;
  v_created  int := 0;
  v_na       boolean;
begin
  if p_paperless_status not in ('none','other_rep','self','not_applicable')
     or p_data_source not in ('none','other_software','paperless') then
    return jsonb_build_object('ok', false, 'error', 'bad_values');
  end if;
  v_na := p_paperless_status = 'not_applicable';

  select * into v_invite from public.onboarding_steps
    where client_id = p_client_id and step_type = 'paperless_invite' and status <> 'cancelled' limit 1;
  select * into v_conn from public.onboarding_steps
    where client_id = p_client_id and step_type = 'paperless_connection' and status <> 'cancelled' limit 1;

  if v_conn.id is null then return jsonb_build_object('ok', false, 'error', 'no_paperless_steps'); end if;
  if v_uid is null or v_conn.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  v_eng := v_conn.engagement_id;
  v_facts := jsonb_build_object(
    'paperlessStatus', p_paperless_status,
    'dataSource', case when v_na then 'none' else p_data_source end,
    'softwareName', nullif(trim(coalesce(p_software_name, '')), ''));

  -- ‼ העובדה נשמרת על האדם, לא רק על השלב: התקשרות שנייה תקרא אותה גם
  -- כששלבי הפייפרלס כבר מדולגים ואין ממי לרשת אותה.
  update public.clients set paperless_status = p_paperless_status, updated_at = now()
    where id = p_client_id;

  update public.onboarding_steps set payload = payload || v_facts
    where client_id = p_client_id and step_type in ('paperless_invite','paperless_connection')
      and status <> 'cancelled';

  -- ── ההזמנה והחיבור ──
  if v_na then
    -- שני השלבים יורדים יחד. הסיבה 'not_applicable' היא זו שמאפשרת לתשלום
    -- להיפתח (ראה onboarding_dependency_met).
    update public.onboarding_steps
      set status = 'skipped',
          payload = payload || jsonb_build_object('skipReason', 'not_applicable')
      where client_id = p_client_id
        and step_type in ('paperless_invite','paperless_connection')
        and status not in ('completed','verified','cancelled');
    perform public.unlock_dependent_steps(v_conn.id);
    if v_invite.id is not null then perform public.unlock_dependent_steps(v_invite.id); end if;

  elsif p_paperless_status in ('other_rep','self') then
    if v_invite.id is not null and v_invite.status in ('locked','pending','in_progress','waiting_client','skipped') then
      update public.onboarding_steps
        set status = 'skipped',
            payload = payload || jsonb_build_object('skipReason',
              case when p_paperless_status = 'other_rep' then 'transferred_rep' else 'already_connected' end)
        where id = v_invite.id;
      perform public.unlock_dependent_steps(v_invite.id);
    end if;
    update public.onboarding_steps
      set status = case when status = 'skipped' then 'pending' else status end,
          payload = payload - 'skipReason',
          ball = case when p_paperless_status = 'other_rep' then 'me' else 'client' end
      where id = v_conn.id and status not in ('completed','verified','cancelled');
  else
    -- חזרה למסלול "לקוח חדש": ההזמנה שבה לחיים, והחיבור ננעל עליה מחדש.
    if v_invite.id is not null and v_invite.status = 'skipped' then
      update public.onboarding_steps set status = 'pending',
             payload = payload - 'skipReason' where id = v_invite.id;
    end if;
    update public.onboarding_steps
      set status = 'locked', ball = 'client', payload = payload - 'skipReason'
      where id = v_conn.id and status in ('pending','locked','skipped');
  end if;

  -- ── ייבוא היסטוריה (רק מתוכנה אחרת, ורק כשיש בכלל פייפרלס) ──
  select * into v_import from public.onboarding_steps
    where client_id = p_client_id and step_type = 'data_import' and status <> 'cancelled' limit 1;

  if p_data_source = 'other_software' and not v_na then
    if v_import.id is null then
      insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, depends_on_step_id, payload)
      values (v_conn.user_id, v_eng, p_client_id, 'data_import', 'tools', 'person', 'locked', 'me', v_conn.id,
              v_facts || jsonb_build_object('checklist', jsonb_build_array(
                jsonb_build_object('key','uniform_file','label','קובץ מבנה אחיד התקבל','done',false),
                jsonb_build_object('key','imported','label','יובא לפייפרלס','done',false))))
      returning * into v_import;
      v_created := v_created + 1;
    end if;
  elsif v_import.id is not null and v_import.status in ('locked','pending') then
    update public.onboarding_steps set status = 'cancelled' where id = v_import.id;
    v_import := null;
  end if;

  -- ── אימות הנתונים ──
  select * into v_verify from public.onboarding_steps
    where client_id = p_client_id and step_type = 'data_verification' and status <> 'cancelled' limit 1;

  if p_data_source in ('other_software','paperless') and not v_na then
    if v_verify.id is null then
      insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, depends_on_step_id, payload)
      values (v_conn.user_id, v_eng, p_client_id, 'data_verification', 'tools', 'person', 'locked', 'me',
              coalesce(v_import.id, v_conn.id),
              jsonb_build_object('checklist', jsonb_build_array(
                jsonb_build_object('key','documents','label','מסמכים קיימים','done',false),
                jsonb_build_object('key','income','label','הכנסות קיימות','done',false),
                jsonb_build_object('key','expenses','label','הוצאות קיימות','done',false),
                jsonb_build_object('key','balances','label','יתרות פתיחה הגיוניות','done',false))));
      v_created := v_created + 1;
    else
      update public.onboarding_steps set depends_on_step_id = coalesce(v_import.id, v_conn.id)
        where id = v_verify.id and status in ('locked','pending');
    end if;
  elsif v_verify.id is not null and v_verify.status in ('locked','pending') then
    update public.onboarding_steps set status = 'cancelled' where id = v_verify.id;
  end if;

  -- ── הרשאת התשלום: משנה שיטה, לא נעלמת ──
  select * into v_retainer from public.onboarding_steps
    where client_id = p_client_id and step_type = 'retainer_authorization'
      and status not in ('cancelled') limit 1;

  if v_retainer.id is not null then
    if v_na then
      -- ‼ בלי פייפרלס אין קישור הרשאה ואין מייל — אבל יש כסף. השלב הופך
      -- להסדר גבייה ידני, בלי תלות ובלי מנעול.
      update public.onboarding_steps
        set depends_on_step_id = null,
            status = case when status = 'locked' then 'pending' else status end,
            ball = 'me',
            payload = payload || jsonb_build_object('method', 'manual_arrangement')
        where id = v_retainer.id;
    else
      -- חזרה למסלול פייפרלס: התלות והמנעול חוזרים, אלא אם החיבור כבר נסגר.
      update public.onboarding_steps
        set depends_on_step_id = v_conn.id,
            payload = payload - 'method',
            status = case
              when status in ('completed','verified') then status
              when v_conn.status in ('completed','verified') then status
              when status = 'pending' then 'locked'
              else status end
        where id = v_retainer.id;
    end if;
  end if;

  perform public.log_onboarding_event(v_conn.user_id, v_conn.id, v_eng, 'status_changed', 'accountant',
    case when v_na then 'הלקוח לא יעבוד עם פייפרלס — הגבייה תוסדר ידנית'
         else 'מסלול הפייפרלס נקבע' end, v_facts);

  return jsonb_build_object('ok', true, 'created', v_created, 'facts', v_facts,
                            'notApplicable', v_na);
end;
$function$;

-- ── 3 · דילוג "לא רלוונטי" מותר גם כשיש הרשאה פתוחה ────────────────────────
-- (הנוסח המלא של advance_onboarding_step, עם שינוי בשורת הסיבות בלבד)
create or replace function public.advance_onboarding_step(p_step_id text, p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s          public.onboarding_steps%rowtype;
  v_new      text;
  v_ball     text;
  v_note     text;
  v_reason   text;
  v_uid      uuid := auth.uid();
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_reason := nullif(trim(coalesce(p_payload->>'reason', '')), '');
  v_note   := nullif(trim(coalesce(p_payload->>'note', '')), '');
  v_ball   := s.ball;

  if s.status = 'locked' and p_action not in ('cancel','note','block','set_due') then
    if not public.onboarding_dependency_met(s.id) then
      return jsonb_build_object('ok', false, 'error', 'locked',
        'message', case when s.step_type = 'retainer_authorization'
                        then 'הרשאת התשלום נוצרת בתוך חשבון הפייפרלס של הלקוח — יש לאשר קודם את החיבור לפייפרלס.'
                        else 'השלב נעול עד להשלמת השלב שהוא תלוי בו.' end);
    end if;
  end if;

  case p_action
    when 'start'        then v_new := 'in_progress';
    when 'wait_client'  then v_new := 'waiting_client'; v_ball := 'client';
    when 'complete'     then v_new := 'completed';
    when 'verify'       then v_new := 'verified';
    when 'skip'         then v_new := 'skipped';
    when 'block'        then v_new := 'blocked';
    when 'fail'         then v_new := 'failed';
    when 'reopen'       then v_new := 'pending';
    when 'cancel'       then v_new := 'cancelled';
    when 'record_link'  then v_new := case when s.status in ('locked','pending') then 'in_progress' else s.status end;
    when 'email_sent'   then v_new := 'waiting_client'; v_ball := 'client';
    when 'set_due'      then v_new := s.status;
    when 'note'         then v_new := s.status;
    else return jsonb_build_object('ok', false, 'error', 'unknown_action');
  end case;

  if p_action = 'skip' and s.step_type in ('paperless_invite','paperless_connection') then
    -- ‼ 'not_applicable' הצטרף לסיבות המותרות: לקוח שאינו עובד עם פייפרלס
    -- אינו עוקף את הכלל — הכלל פשוט לא חל עליו, והגבייה מוסדרת ידנית.
    if coalesce(v_reason, '') not in ('already_connected','transferred_rep','not_applicable') then
      if exists (select 1 from public.onboarding_steps r
                 where r.client_id = s.client_id and r.step_type = 'retainer_authorization'
                   and r.status not in ('completed','verified','cancelled','skipped')
                   and coalesce(r.payload->>'method','') <> 'manual_arrangement') then
        return jsonb_build_object('ok', false, 'error', 'paperless_required',
          'message', 'קיימת הרשאת תשלום שממתינה — אי אפשר לדלג על הפייפרלס אלא אם הלקוח כבר מחובר.');
      end if;
    end if;
  end if;

  update public.onboarding_steps
    set status  = v_new,
        ball    = coalesce(nullif(p_payload->>'ball',''), v_ball),
        payload = payload || coalesce(p_payload - 'note' - 'ball', '{}'::jsonb)
                  || case when v_reason is not null then jsonb_build_object('skipReason', v_reason) else '{}'::jsonb end,
        due_date = coalesce((nullif(p_payload->>'dueDate',''))::date, due_date),
        needs_attention = case when v_new in ('completed','verified','skipped','cancelled') then false else needs_attention end,
        completion_method = coalesce(nullif(p_payload->>'completionMethod',''), completion_method),
        completed_by = case when v_new in ('completed','verified') then v_uid else completed_by end,
        completed_at = case when v_new = 'completed' and completed_at is null then now() else completed_at end,
        verified_at  = case when v_new = 'verified'  and verified_at  is null then now() else verified_at end
    where id = s.id;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id,
    case when v_new = s.status then 'note' else 'status_changed' end,
    'accountant', coalesce(v_note, v_reason),
    jsonb_build_object('from', s.status, 'to', v_new, 'action', p_action));

  if v_new in ('completed','verified','skipped') then
    perform public.unlock_dependent_steps(s.id);
  end if;

  if s.engagement_id is not null then
    update public.engagements e
      set status = 'active', activated_at = coalesce(activated_at, now())
      where e.id = s.engagement_id and e.status = 'onboarding'
        and not exists (
          select 1 from public.onboarding_steps x
          where x.engagement_id = e.id
            and x.status not in ('completed','verified','skipped','cancelled'));
  end if;

  return jsonb_build_object('ok', true, 'stepId', s.id, 'from', s.status, 'to', v_new);
end;
$function$;
