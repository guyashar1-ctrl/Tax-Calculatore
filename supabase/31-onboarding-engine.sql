-- ═══════════════════════════════════════════════════════════════════════════
--  31 — מנוע הקליטה: הרכבה, קידום שלבים, וסנכרון עם הייצוג
-- ═══════════════════════════════════════════════════════════════════════════
--  ‼ העיקרון: מסלול הקליטה הוא חישוב, לא טופס. אף אחד לא נשאל "יצטרך הרשאת
--  תשלום?" — ההצעה שאושרה כבר עונה: יש בה שורות חודשיות ⇒ יש שלב. כך אין
--  שתי גרסאות של אותה עובדה שיכולות לסתור זו את זו.
--
--  ‼ כל שינוי סטטוס עובר דרך advance_onboarding_step ואף פעם לא ב-UPDATE ישיר
--  מהדפדפן. שם, ורק שם, נאכפת התלות הקשיחה:
--        חיבור פייפרלס אושר  →  הרשאת התשלום נפתחת
--  הסיבה תפעולית ולא ויזואלית: ההרשאה החודשית נוצרת בתוך חשבון הפייפרלס של
--  הלקוח, ולכן היא לא יכולה להתקיים לפני שהלקוח קיים ומחובר שם.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── עזר: רישום אירוע ───────────────────────────────────────────────────────
create or replace function public.log_onboarding_event(
  p_user_id uuid, p_step_id text, p_engagement_id text,
  p_type text, p_actor text default 'system', p_note text default null,
  p_meta jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path to 'public' as $$
  insert into public.onboarding_events (user_id, step_id, engagement_id, type, actor, note, meta)
  values (p_user_id, p_step_id, p_engagement_id, p_type, p_actor, p_note, coalesce(p_meta, '{}'::jsonb));
$$;

-- ─── עזר: האם התלות סופקה ───────────────────────────────────────────────────
-- שלב פתוח כשאין לו תלות, או כשהשלב שהוא תלוי בו הגיע לסיום אמיתי.
-- ‼ 'skipped' נחשב סיום רק כשהסיבה היא שהלקוח כבר מחובר — לא כשהשלב "לא נדרש".
create or replace function public.onboarding_dependency_met(p_step_id text)
returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
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
    return coalesce(d.payload->>'skipReason', '') in ('already_connected','transferred_rep','not_applicable_history');
  end if;
  return false;
end;
$$;

-- ─── עזר: פתיחת שלבים שהתלות שלהם סופקה ─────────────────────────────────────
create or replace function public.unlock_dependent_steps(p_step_id text)
returns int
language plpgsql security definer set search_path to 'public' as $$
declare
  r public.onboarding_steps%rowtype;
  n int := 0;
begin
  for r in select * from public.onboarding_steps
           where depends_on_step_id = p_step_id and status = 'locked'
  loop
    if public.onboarding_dependency_met(r.id) then
      update public.onboarding_steps set status = 'pending' where id = r.id;
      perform public.log_onboarding_event(
        r.user_id, r.id, r.engagement_id, 'status_changed', 'system',
        'השלב נפתח — התלייה הקודמת הושלמה', jsonb_build_object('from','locked','to','pending'));
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
--  הרכבת מסלול הקליטה מההצעה שאושרה
-- ═══════════════════════════════════════════════════════════════════════════
--  p_dry_run=true  ⇒  מחזיר את מה שהיה נוצר, בלי לכתוב שורה אחת.
create or replace function public.generate_onboarding_steps(
  p_engagement_id text, p_dry_run boolean default false
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  e            public.engagements%rowtype;
  q            public.quotations%rowtype;
  v_items      jsonb;
  v_has_monthly boolean := false;
  v_has_paperless boolean := false;
  v_needs_paperless boolean := false;
  v_has_rep    boolean := false;
  v_has_prev   boolean := false;
  v_client     public.clients%rowtype;
  v_planned    jsonb := '[]'::jsonb;
  v_created    int := 0;
  v_id_invite  text;
  v_id_conn    text;
  v_id_release text;
  v_new_id     text;
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'engagement_not_found'); end if;

  select * into q from public.quotations where id = e.quotation_id;
  select * into v_client from public.clients where id = e.client_id;

  v_items := coalesce(q.snapshot->'items', q.items, '[]'::jsonb);

  select
    bool_or(coalesce(it->>'category','') = 'monthly'),
    bool_or(coalesce(it->>'name','') ilike '%הנהלת חשבונות%'
         or coalesce(it->>'name','') ilike '%פייפרלס%'
         or coalesce(it->>'name','') ilike '%paperless%')
  into v_has_monthly, v_has_paperless
  from jsonb_array_elements(v_items) it;

  v_has_monthly   := coalesce(v_has_monthly, false);
  v_has_paperless := coalesce(v_has_paperless, false);
  -- ‼ שורות חודשיות ⇒ פייפרלס נדרש גם אם לא נמכר במפורש: הגבייה החודשית
  -- מתבצעת דרך חשבון הפייפרלס של הלקוח.
  v_needs_paperless := v_has_monthly or v_has_paperless;

  v_has_rep := coalesce(q.representation_request_id, v_client.representation_request_id) is not null;

  select coalesce(l.has_previous_accountant, false) into v_has_prev
    from public.leads l where l.converted_client_id = e.client_id limit 1;
  if v_has_prev is null then
    select coalesce(l.has_previous_accountant, false) into v_has_prev
      from public.leads l where l.id = q.lead_id limit 1;
  end if;
  v_has_prev := coalesce(v_has_prev, false);

  -- ── הרכבה ──
  -- כל קריאה: אם השלב כבר קיים (ברמת האדם או ברמת ההתקשרות) — מדלגים.
  -- הפונקציה הפנימית ממומשת כבלוק חוזר כדי להישאר בפונקציה אחת קריאה.

  -- 1. ייצוג (אדם)
  if v_has_rep then
    select id into v_new_id from public.onboarding_steps
      where client_id = e.client_id and step_type = 'representation' and status <> 'cancelled' limit 1;
    if v_new_id is null then
      v_planned := v_planned || jsonb_build_object('step_type','representation','track','authorities','scope','person','status','in_progress');
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball)
        values (e.user_id, e.id, e.client_id, 'representation', 'authorities', 'person', 'in_progress', 'me');
        v_created := v_created + 1;
      end if;
    end if;
    v_new_id := null;

    -- 2. הכרת הלקוח / חובת זיהוי (אדם) — שקט, הנתונים כבר נאספו בטופס הייצוג
    select id into v_new_id from public.onboarding_steps
      where client_id = e.client_id and step_type = 'kyc_identification' and status <> 'cancelled' limit 1;
    if v_new_id is null then
      v_planned := v_planned || jsonb_build_object('step_type','kyc_identification','track','internal','scope','person','status','pending');
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball)
        values (e.user_id, e.id, e.client_id, 'kyc_identification', 'internal', 'person', 'pending', 'me');
        v_created := v_created + 1;
      end if;
    end if;
    v_new_id := null;
  end if;

  -- 3. מכתב שחרור + קבלת חומרים (אדם) — רק כשיש רו"ח קודם
  if v_has_prev then
    select id into v_id_release from public.onboarding_steps
      where client_id = e.client_id and step_type = 'release_letter' and status <> 'cancelled' limit 1;
    if v_id_release is null then
      v_planned := v_planned || jsonb_build_object('step_type','release_letter','track','prev_accountant','scope','person','status','pending');
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball)
        values (e.user_id, e.id, e.client_id, 'release_letter', 'prev_accountant', 'person', 'pending', 'me')
        returning id into v_id_release;
        v_created := v_created + 1;
      end if;
    end if;

    select id into v_new_id from public.onboarding_steps
      where client_id = e.client_id and step_type = 'materials_received' and status <> 'cancelled' limit 1;
    if v_new_id is null then
      v_planned := v_planned || jsonb_build_object('step_type','materials_received','track','prev_accountant','scope','person','status','locked');
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, depends_on_step_id, payload)
        values (e.user_id, e.id, e.client_id, 'materials_received', 'prev_accountant', 'person', 'locked', 'prev_accountant', v_id_release,
                jsonb_build_object('checklist', jsonb_build_array(
                  jsonb_build_object('key','ledgers','label','כרטסות','done',false),
                  jsonb_build_object('key','trial_balance','label','מאזן בוחן','done',false),
                  jsonb_build_object('key','last_return','label','דוח שנתי אחרון','done',false),
                  jsonb_build_object('key','depreciation','label','טופס פחת','done',false),
                  jsonb_build_object('key','form106','label','טופסי 106','done',false),
                  jsonb_build_object('key','uniform_file','label','קובץ מבנה אחיד','done',false))));
        v_created := v_created + 1;
      end if;
    end if;
    v_new_id := null;
  end if;

  -- 4. פייפרלס: הזמנה → חיבור (אדם)
  if v_needs_paperless then
    select id into v_id_invite from public.onboarding_steps
      where client_id = e.client_id and step_type = 'paperless_invite' and status <> 'cancelled' limit 1;
    if v_id_invite is null then
      v_planned := v_planned || jsonb_build_object('step_type','paperless_invite','track','tools','scope','person','status','pending');
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload)
        values (e.user_id, e.id, e.client_id, 'paperless_invite', 'tools', 'person', 'pending', 'me',
                jsonb_build_object('paperlessStatus','unknown','dataSource','unknown'))
        returning id into v_id_invite;
        v_created := v_created + 1;
      end if;
    end if;

    select id into v_id_conn from public.onboarding_steps
      where client_id = e.client_id and step_type = 'paperless_connection' and status <> 'cancelled' limit 1;
    if v_id_conn is null then
      v_planned := v_planned || jsonb_build_object('step_type','paperless_connection','track','tools','scope','person','status','locked');
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, depends_on_step_id)
        values (e.user_id, e.id, e.client_id, 'paperless_connection', 'tools', 'person', 'locked', 'client', v_id_invite)
        returning id into v_id_conn;
        v_created := v_created + 1;
      end if;
    end if;
  end if;

  -- 5. הרשאת תשלום (התקשרות!) — נעולה על חיבור הפייפרלס
  if v_has_monthly then
    if not exists (select 1 from public.onboarding_steps
                   where engagement_id = e.id and step_type = 'retainer_authorization') then
      v_planned := v_planned || jsonb_build_object(
        'step_type','retainer_authorization','track','payment','scope','engagement','status','locked',
        'depends_on','paperless_connection');
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, depends_on_step_id, payload)
        values (e.user_id, e.id, e.client_id, 'retainer_authorization', 'payment', 'engagement',
                case when v_id_conn is null then 'pending' else 'locked' end, 'me', v_id_conn,
                jsonb_build_object('amount', e.monthly_total, 'billingStartMonth', e.billing_start_month));
        v_created := v_created + 1;
      end if;
    end if;
  end if;

  -- 6. הקמה פנימית (התקשרות) — תמיד
  if not exists (select 1 from public.onboarding_steps
                 where engagement_id = e.id and step_type = 'internal_setup') then
    v_planned := v_planned || jsonb_build_object('step_type','internal_setup','track','internal','scope','engagement','status','pending');
    if not p_dry_run then
      insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload)
      values (e.user_id, e.id, e.client_id, 'internal_setup', 'internal', 'engagement', 'pending', 'me',
              jsonb_build_object('checklist', jsonb_build_array(
                jsonb_build_object('key','file_numbers','label','מספרי תיקים בכרטיס','done',false),
                jsonb_build_object('key','assignee','label','שיוך מטפל','done',false),
                jsonb_build_object('key','frequencies','label','תדירויות דיווח','done',false))));
      v_created := v_created + 1;
    end if;
  end if;

  -- 7. ביקורת חודש ראשון (התקשרות)
  if not exists (select 1 from public.onboarding_steps
                 where engagement_id = e.id and step_type = 'first_month_review') then
    v_planned := v_planned || jsonb_build_object('step_type','first_month_review','track','review','scope','engagement','status','pending');
    if not p_dry_run then
      insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, due_date)
      values (e.user_id, e.id, e.client_id, 'first_month_review', 'review', 'engagement', 'pending', 'me',
              (coalesce(e.approved_at, now()) + interval '30 days')::date);
      v_created := v_created + 1;
    end if;
  end if;

  if not p_dry_run and v_created > 0 then
    perform public.log_onboarding_event(e.user_id, null, e.id, 'created', 'system',
      'מסלול הקליטה הורכב מההצעה שאושרה', jsonb_build_object('stepsCreated', v_created));
  end if;

  return jsonb_build_object(
    'ok', true, 'dryRun', p_dry_run, 'engagementId', e.id, 'clientId', e.client_id,
    'created', v_created, 'planned', v_planned,
    'facts', jsonb_build_object(
      'hasMonthly', v_has_monthly, 'hasPaperlessService', v_has_paperless,
      'needsPaperless', v_needs_paperless, 'hasRepresentation', v_has_rep,
      'hasPreviousAccountant', v_has_prev,
      'monthlyTotal', e.monthly_total, 'billingStartMonth', e.billing_start_month));
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
--  יצירת התקשרות מהצעה שאושרה
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.create_engagement_for_quotation(
  p_quotation_id text, p_dry_run boolean default false
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  q         public.quotations%rowtype;
  v_items   jsonb;
  v_monthly numeric;
  v_start   text;
  v_eng_id  text;
  v_existing text;
begin
  select * into q from public.quotations where id = p_quotation_id;
  if q.id is null then return jsonb_build_object('ok', false, 'error', 'quotation_not_found'); end if;
  if q.status <> 'approved' then return jsonb_build_object('ok', false, 'error', 'not_approved'); end if;
  if q.client_id is null then return jsonb_build_object('ok', false, 'error', 'no_client'); end if;

  select id into v_existing from public.engagements where quotation_id = q.id;
  if v_existing is not null then
    -- אידמפוטנטי: קיימת כבר. משלימים שלבים חסרים ומחזירים אותה.
    return jsonb_build_object('ok', true, 'engagementId', v_existing, 'existed', true,
      'steps', public.generate_onboarding_steps(v_existing, p_dry_run));
  end if;

  v_items := coalesce(q.snapshot->'items', q.items, '[]'::jsonb);

  -- הסכום החודשי מוקפא כאן: מחיר ליחידה × כמות, בניכוי הנחה, לפני מע"מ.
  select
    sum( (coalesce((it->>'clientPrice')::numeric, 0))
       * (coalesce((it->>'quantity')::numeric, 1))
       * (1 - coalesce((it->>'discountPercent')::numeric, 0) / 100.0) ),
    min(nullif(it->>'billingStartMonth', ''))
  into v_monthly, v_start
  from jsonb_array_elements(v_items) it
  where coalesce(it->>'category','') = 'monthly';

  if p_dry_run then
    return jsonb_build_object('ok', true, 'dryRun', true, 'wouldCreate', true,
      'clientId', q.client_id, 'monthlyTotal', v_monthly, 'billingStartMonth', v_start);
  end if;

  insert into public.engagements (user_id, client_id, quotation_id, status,
                                  monthly_total, billing_start_month, approved_at)
  values (q.user_id, q.client_id, q.id, 'onboarding',
          v_monthly, v_start, coalesce(q.approved_at, now()))
  on conflict (quotation_id) do nothing
  returning id into v_eng_id;

  -- מרוץ: שני מסלולים יצרו במקביל. השני מוצא את הראשונה ומשלים שלבים.
  if v_eng_id is null then
    select id into v_eng_id from public.engagements where quotation_id = q.id;
    return jsonb_build_object('ok', true, 'engagementId', v_eng_id, 'existed', true,
      'steps', public.generate_onboarding_steps(v_eng_id, false));
  end if;

  perform public.log_onboarding_event(q.user_id, null, v_eng_id, 'created', 'system',
    'ההתקשרות נפתחה מאישור הצעה ' || coalesce(q.quotation_number, q.id),
    jsonb_build_object('quotationId', q.id));

  return jsonb_build_object('ok', true, 'engagementId', v_eng_id, 'existed', false,
    'steps', public.generate_onboarding_steps(v_eng_id, false));
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
--  קידום שלב — נתיב הכתיבה היחיד
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.advance_onboarding_step(
  p_step_id text, p_action text, p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
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
  -- הבעלות נבדקת בשרת ולא נסמכת על ה-RLS של הקורא: הפונקציה SECURITY DEFINER.
  if v_uid is null or s.user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_reason := nullif(trim(coalesce(p_payload->>'reason', '')), '');
  v_note   := nullif(trim(coalesce(p_payload->>'note', '')), '');
  v_ball   := s.ball;

  -- ‼ השער. שלב נעול לא זז לפני שהתלות שלו הושלמה — לא מהמסך, ולא מקריאה
  -- ישירה ל-API. זו הנקודה שבה "פייפרלס לפני הרשאת תשלום" הופך לכלל אמיתי.
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

  -- ‼ דילוג על שלב פייפרלס בטענה "לא נדרש" בזמן שקיימת הרשאת תשלום פתוחה
  -- היה עוקף את התלות מהדלת האחורית. הסיבות המותרות לדילוג הן רק אלה
  -- שמשמעותן "הלקוח באמת מחובר".
  if p_action = 'skip' and s.step_type in ('paperless_invite','paperless_connection') then
    if coalesce(v_reason, '') not in ('already_connected','transferred_rep') then
      if exists (select 1 from public.onboarding_steps r
                 where r.client_id = s.client_id and r.step_type = 'retainer_authorization'
                   and r.status not in ('completed','verified','cancelled','skipped')) then
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

  -- ההתקשרות הופכת לפעילה כשאין יותר שלב פתוח.
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
$$;

-- ═══════════════════════════════════════════════════════════════════════════
--  סנכרון שלב הייצוג מתוך בקשת הייצוג
-- ═══════════════════════════════════════════════════════════════════════════
--  ‼ מקור אמת אחד. לשלב 'representation' אין מכונת מצבים משלו — הוא מראה את
--  מצב הבקשה. אחרת היו שתי אמיתות שאפשר שיסתרו.
create or replace function public.sync_representation_step()
returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare
  v_status text;
  v_ball   text;
begin
  if coalesce(old.status,'') = coalesce(new.status,'') then return new; end if;
  if new.linked_client_id is null then return new; end if;

  case new.status
    when 'pending_fill'        then v_status := 'waiting_client'; v_ball := 'client';
    when 'awaiting_accountant' then v_status := 'in_progress';    v_ball := 'me';
    when 'pending_signature'   then v_status := 'waiting_client'; v_ball := 'client';
    when 'awaiting_stamp'      then v_status := 'in_progress';    v_ball := 'me';
    when 'awaiting_authorities' then v_status := 'in_progress';   v_ball := 'authority';
    when 'active'              then v_status := 'completed';      v_ball := 'me';
    else return new;
  end case;

  update public.onboarding_steps
    set status = v_status, ball = v_ball,
        completion_method = 'auto',
        completed_at = case when v_status = 'completed' and completed_at is null then now() else completed_at end
    where client_id = new.linked_client_id
      and step_type = 'representation'
      and status not in ('cancelled','skipped');

  return new;
end;
$$;

drop trigger if exists sync_representation_step_trg on public.representation_requests;
create trigger sync_representation_step_trg
  after update of status on public.representation_requests
  for each row execute function public.sync_representation_step();

-- ═══════════════════════════════════════════════════════════════════════════
--  חיבור לאישור ההצעה — התוספת היחידה לזרימה הקיימת
-- ═══════════════════════════════════════════════════════════════════════════
--  ‼ approve_quotation לא משנה התנהגות: אותה חתימה, אותו ערך מוחזר, אותם
--  טוקנים. נוספה שורה אחת שיוצרת את ההתקשרות. היא עטופה כך שכשל בהרכבת
--  הקליטה לעולם לא יפיל את אישור ההצעה של הלקוח.
create or replace function public.approve_quotation(
  p_token text, p_signature text default null, p_signer_name text default null
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
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

  -- ★ התוספת: פתיחת ההתקשרות ומסלול הקליטה. אידמפוטנטית, ולא חוסמת.
  begin
    perform public.create_engagement_for_quotation(q.id, false);
  exception when others then
    null;   -- אישור ההצעה של הלקוח חשוב יותר מהרכבת הקליטה; תושלם במילוי-לאחור
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
$$;

-- ─── הרשאות ────────────────────────────────────────────────────────────────
grant execute on function public.advance_onboarding_step(text, text, jsonb)   to authenticated;
grant execute on function public.create_engagement_for_quotation(text, boolean) to authenticated;
grant execute on function public.generate_onboarding_steps(text, boolean)      to authenticated;
grant execute on function public.onboarding_dependency_met(text)               to authenticated;
grant execute on function public.approve_quotation(text, text, text)           to anon, authenticated;
