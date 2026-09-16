-- ═══════════════════════════════════════════════════════════════════════════
--  169 — מקור אמת אחד לכל שאלה שנענתה בכמה מקומות (אשכול D)
-- ═══════════════════════════════════════════════════════════════════════════
--  ‼ הביקורת מצאה ארבע עובדות שכל אחת מהן חושבה בכמה מקומות, ובכל מקום קצת
--  אחרת. כשאותה שאלה נענית בשתי דרכים, מסך אחד אומר "כן" והשני "לא" — וזה
--  קרה בפועל. הקובץ הזה קובע לכל עובדה בית אחד בשרת, וה-TS מחקה אותו במקום
--  לחשב בעצמו.
--
--  ① ההתקשרות הנוכחית          — current_engagement_id
--  ② "הליד הומר"               — נגזר מ-clients.merged_from_lead_id בטריגר
--  ③ שנת המס של השאלון         — current_tax_year(p_user), מקום אחד
--  ④ שלב «עדכון סטטוס מיסויי» — נגזר מסשן השאלון בטריגר, לא מסונכרן ביד
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① ההתקשרות הנוכחית ─────────────────────────────────────────────────────
--  ‼ הבאג: 118 סיננה `effective_from <= current_date`. התקשרות ראשונה שהחיוב
--  שלה מתחיל בחודש הבא נולדת 'onboarding' עם תאריך עתידי — ולכן הייתה בלתי
--  נראית. ההצעה הבאה של אותו לקוח נכנסה למסלול "התקשרות ראשונה", ניסתה
--  להכניס 'onboarding' שנייה ונפלה על engagements_one_current_uidx.
--  גם release_requests_held_until_approval לא מצאה למה לשייך את הבקשות.
--
--  הכלל מעכשיו: ההתקשרות הנוכחית היא השורה היחידה במצב 'onboarding' או
--  'active' (האינדקס הייחודי מבטיח שיש לכל היותר אחת). הקליטה מתחילה
--  באישור ההצעה, והחיוב מתחיל כשמתחיל — התאריך אינו תנאי לקיום ההתקשרות.
--  'scheduled' היא חידוש עתידי ואינה נוכחית לעולם, גם אם מועדה הגיע ומשימת
--  המעבר מאחרת — היא נהיית נוכחית רק כשהמעבר סוגר את הקודמת.
--
--  ‼ למה לא "active עם תאריך שהגיע, ואם אין — onboarding": קליטה שנסגרה לפני
--  תחילת החיוב היא 'active' עם תאריך עתידי, ואותו כלל היה מעלים אותה שוב.
--  הסינון לפי תאריך לא הבחין בין שתי התקשרויות מעולם — הוא רק הסתיר את
--  היחידה שיש.
--
--  ‼ חייב להישאר זהה תו-בתו ל-currentEngagement ב-src/utils/engagementSelectors.ts.
create or replace function public.current_engagement_id(p_client_id text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select e.id
    from public.engagements e
   where e.client_id = p_client_id
     and e.status in ('onboarding','active')
   order by (e.effective_from <= current_date) desc, e.effective_from desc, e.created_at desc
   limit 1;
$function$;

revoke execute on function public.current_engagement_id(text) from public, anon;
grant  execute on function public.current_engagement_id(text) to authenticated, service_role;

-- ── ② "הליד הומר" — עובדה אחת, שלושה שדות ───────────────────────────────────
--  ‼ עד עכשיו: leads.status='converted' נכתב ע"י הדפדפן (App.tsx, פעמיים),
--  leads.converted_client_id ע"י ensure_client_for_quotation ו-merge_leads,
--  ו-clients.merged_from_lead_id ע"י שתי האחרונות בלבד. מחיקת לקוח אפסה את
--  converted_client_id (FK) והשאירה status='converted' — ליד "שהומר" בלי
--  לקוח, וזה קיים בפרודקשן.
--
--  המקור מעכשיו: clients.merged_from_lead_id + קיום הכרטיס. שני טריגרים:
--   · על clients — כל שינוי בקישור (ומחיקת כרטיס) מעדכן את הליד.
--   · על leads — status אינו עובדה עצמאית: יש converted_client_id ⇒ 'converted';
--     אין ⇒ חוזרים למצב שלפני ההמרה (נשמר בעמודה חדשה), ואם לא ידוע — 'new'.
--  הדפדפן מקשר דרך link_lead_to_client ולא כותב ללידים בעצמו.

alter table public.leads
  add column if not exists pre_conversion_status text;

comment on column public.leads.pre_conversion_status is
  'המצב שהיה לליד לפני שהומר. משמש לשחזור כשהכרטיס נמחק. נכתב ע"י tg_lead_status_from_conversion בלבד.';

create or replace function public.tg_lead_status_from_conversion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.converted_client_id is not null then
    if new.status is distinct from 'converted' then
      -- הזיכרון נלכד ברגע ההמרה בלבד. כתיבה מאוחרת של status על ליד שכבר
      -- הומר (מסך ישן) אינה משנה כלום — ואסור שתדרוס את "מה היה לפני".
      if tg_op = 'INSERT' or old.converted_client_id is null then
        new.pre_conversion_status := new.status;
      end if;
      new.status := 'converted';
    end if;
  elsif new.status = 'converted' then
    new.status := coalesce(new.pre_conversion_status, 'new');
    new.pre_conversion_status := null;
  end if;
  return new;
end;
$function$;

revoke execute on function public.tg_lead_status_from_conversion() from public, anon, authenticated;

drop trigger if exists lead_status_from_conversion on public.leads;
create trigger lead_status_from_conversion
  before insert or update of status, converted_client_id on public.leads
  for each row execute function public.tg_lead_status_from_conversion();

create or replace function public.tg_sync_lead_conversion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.merged_from_lead_id is not null
     and (tg_op = 'DELETE' or new.merged_from_lead_id is distinct from old.merged_from_lead_id) then
    -- הכרטיס ניתק מהליד (או נמחק): הליד חוזר להיות ליד.
    update public.leads
       set converted_client_id = null
     where id = old.merged_from_lead_id
       and converted_client_id = old.id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.merged_from_lead_id is not null
     and (tg_op = 'INSERT' or new.merged_from_lead_id is distinct from old.merged_from_lead_id) then
    update public.leads
       set converted_client_id = new.id
     where id = new.merged_from_lead_id
       and converted_client_id is distinct from new.id;
  end if;

  return null;
end;
$function$;

revoke execute on function public.tg_sync_lead_conversion() from public, anon, authenticated;

drop trigger if exists sync_lead_conversion on public.clients;
create trigger sync_lead_conversion
  after insert or update of merged_from_lead_id or delete on public.clients
  for each row execute function public.tg_sync_lead_conversion();

-- הדלת היחידה של הדפדפן להמרה: קישור הכרטיס לליד. הליד מתעדכן מהטריגר.
create or replace function public.link_lead_to_client(p_lead_id text, p_client_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  l public.leads%rowtype;
  c public.clients%rowtype;
begin
  select * into l from public.leads where id = p_lead_id;
  if l.id is null then return jsonb_build_object('ok', false, 'error', 'lead_not_found'); end if;
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or l.user_id <> v_uid or c.user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if l.converted_client_id is not null and l.converted_client_id <> c.id then
    return jsonb_build_object('ok', false, 'error', 'lead_already_converted',
                              'clientId', l.converted_client_id);
  end if;

  update public.clients
     set merged_from_lead_id = coalesce(merged_from_lead_id, l.id), updated_at = now()
   where id = c.id;
  -- כרטיס שכבר קושר לליד אחר: הליד הזה עדיין מצביע עליו (ליד כפול לאותו אדם).
  update public.leads set converted_client_id = c.id
   where id = l.id and converted_client_id is distinct from c.id;

  perform public.refresh_lifecycle_stage_for(c.id);
  return jsonb_build_object('ok', true, 'clientId', c.id, 'leadId', l.id);
end;
$function$;

revoke execute on function public.link_lead_to_client(text, text) from public, anon;
grant  execute on function public.link_lead_to_client(text, text) to authenticated, service_role;

-- ── ③ שנת המס של השאלון — מקום אחד ────────────────────────────────────────
--  ‼ עד עכשיו: get_intake/start_intake/reopen_intake חישבו `now()-1` כל אחת
--  בנפרד, המשרד פתח דוח שנתי על 2025 קבוע, ו-CURRENT_TAX_YEAR ב-TS היא בכלל
--  "השנה העדכנית שיש לה טבלאות" (2026). בינואר שלוש התשובות מתפצלות.
--
--  הכלל: profiles.settings->>'taxYear' של המשרד אם הוגדר, ואם לא — השנה
--  הקלנדרית הקודמת. אין עדיין מסך שמגדיר את ההגדרה; זה רק הבית שלה.
--  ‼ חייב להישאר זהה ל-reportTaxYear ב-src/features/annualReport/reportTaxYear.ts.
create or replace function public.current_tax_year(p_user uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
           (select case when p.settings->>'taxYear' ~ '^\d{4}$'
                        then (p.settings->>'taxYear')::int end
              from public.profiles p where p.id = p_user),
           extract(year from now())::int - 1);
$function$;

revoke execute on function public.current_tax_year(uuid) from public, anon;
grant  execute on function public.current_tax_year(uuid) to authenticated, service_role;

-- שלוש פונקציות השאלון — הגוף זהה לפרודקשן, רק השנה מגיעה מהמקור האחד.
create or replace function public.get_intake(p_token text)
returns table(session_id uuid, tax_year integer, model jsonb, current_question_id text,
              session_status text, client_name text, identified boolean, firm_name text, branding jsonb)
language sql
security definer
set search_path to 'public'
as $function$
  select s.id, s.tax_year, s.model, s.current_question_id, s.status,
         t.client_name, t.identified,
         p.firm_name, p.branding
  from public.resolve_intake_token(p_token) t
  left join public.profiles p on p.id = t.user_id
  left join public.annual_report_sessions s
    on s.client_id = t.client_id
   and s.user_id = t.user_id
   and s.tax_year = public.current_tax_year(t.user_id)
  limit 1;
$function$;

create or replace function public.start_intake(p_token text)
returns table(session_id uuid, tax_year integer, model jsonb, current_question_id text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t record;
  s public.annual_report_sessions%rowtype;
  v_year int;
begin
  select * into t from public.resolve_intake_token(p_token) limit 1;
  if t.client_id is null then
    raise exception 'invalid token';
  end if;
  v_year := public.current_tax_year(t.user_id);

  update public.clients set intake_token_last_used_at = now()
   where id = t.client_id and intake_token = p_token;

  select * into s from public.annual_report_sessions ars
    where ars.client_id = t.client_id and ars.tax_year = v_year limit 1;

  if s.id is null then
    insert into public.annual_report_sessions (user_id, client_id, tax_year, status, model, current_question_id)
    values (
      t.user_id, t.client_id, v_year, 'in_progress',
      jsonb_build_object('taxYear', v_year, 'meta', jsonb_build_object('flow', 'onboarding')),
      'year_map'
    )
    returning * into s;
  end if;

  return query select s.id, s.tax_year, s.model, s.current_question_id;
end;
$function$;

create or replace function public.reopen_intake(p_token text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t record;
  v_year int;
begin
  select * into t from public.resolve_intake_token(p_token) limit 1;
  if t.client_id is null then return false; end if;
  v_year := public.current_tax_year(t.user_id);

  update public.annual_report_sessions
    set status = 'in_progress',
        current_question_id = 'year_map',
        completed_at = null
    where client_id = t.client_id and user_id = t.user_id and tax_year = v_year;

  return found;
end;
$function$;

-- ‼ דפים ציבוריים: הטוקן הוא ההרשאה. שלושתן ברשימת v_anon_ok של השומר.
revoke execute on function public.get_intake(text)    from public;
revoke execute on function public.start_intake(text)  from public;
revoke execute on function public.reopen_intake(text) from public;
grant  execute on function public.get_intake(text)    to anon, authenticated, service_role;
grant  execute on function public.start_intake(text)  to anon, authenticated, service_role;
grant  execute on function public.reopen_intake(text) to anon, authenticated, service_role;

-- ── ④ שלב «עדכון סטטוס מיסויי» נגזר מסשן השאלון ────────────────────────────
--  ‼ עד עכשיו הסנכרון היה חד-כיווני ורק בסגירה: save_intake_answer(p_done)
--  קראה ל-close_intake_step_for_client. reopen_intake לא החזירה את השלב,
--  מחיקת סשן במשרד השאירה "הושלם", והתחלת מילוי לא נראתה בכלל. השלב הוא
--  היטל של הסשן — והיטל נגזר, לא נכתב ביד (CLAUDE.md §9).
--
--  הכלל (סשן של שנת המס הנוכחית של המשרד בלבד):
--    review / mapping_done  ⇒ השלב הושלם (auto)
--    in_progress            ⇒ ממתין ללקוח (שלב שהושלם auto נפתח מחדש)
--    אין סשן / archived     ⇒ שלב שהושלם auto חוזר ל"ממתין ללקוח" אם פורסם,
--                              אחרת ל"ממתין"
--  השלמה ידנית של המשרד (completion_method<>'auto'), דילוג, אימות וביטול —
--  אינם נגזרים מהסשן ולא נדרסים.
create or replace function public.sync_intake_step_from_sessions(p_client_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s      public.onboarding_steps%rowtype;
  v_year int;
  v_sess text;
begin
  select * into s from public.onboarding_steps
    where client_id = p_client_id and step_type = 'intake_questionnaire'
      and status not in ('cancelled', 'skipped', 'verified')
    order by created_at desc limit 1;
  if s.id is null then return jsonb_build_object('ok', true, 'noop', true); end if;

  v_year := public.current_tax_year(s.user_id);
  select ars.status into v_sess from public.annual_report_sessions ars
    where ars.client_id = p_client_id and ars.tax_year = v_year;

  if v_sess in ('review', 'mapping_done') then
    if s.status = 'completed' then return jsonb_build_object('ok', true, 'noop', true); end if;
    update public.onboarding_steps
      set status = 'completed', completion_method = 'auto', ball = 'me',
          completed_at = coalesce(completed_at, now()), needs_attention = false, updated_at = now()
      where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'client',
      'הלקוח מילא את שאלון פתיחת התיק', jsonb_build_object('from', s.status, 'to', 'completed'));
    perform public.unlock_dependent_steps(s.id);
    return jsonb_build_object('ok', true, 'stepId', s.id, 'to', 'completed');
  end if;

  if s.status = 'completed' then
    if coalesce(s.completion_method, '') <> 'auto' then
      return jsonb_build_object('ok', true, 'noop', true);
    end if;
    update public.onboarding_steps
      set status = case when v_sess = 'in_progress' or s.published_at is not null
                        then 'waiting_client' else 'pending' end,
          ball = case when v_sess = 'in_progress' or s.published_at is not null
                      then 'client' else 'me' end,
          -- ברירת המחדל של העמודה (not null); "auto" נכתב רק כשהסשן סוגר.
          completion_method = 'manual', completed_at = null, updated_at = now()
      where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'client',
      case when v_sess = 'in_progress' then 'הלקוח פתח מחדש את השאלון'
           else 'שאלון השנה הוסר - הבקשה חזרה להמתין' end,
      jsonb_build_object('from', 'completed', 'session', v_sess));
    return jsonb_build_object('ok', true, 'stepId', s.id, 'to', 'reopened');
  end if;

  if v_sess = 'in_progress' and s.status = 'pending' then
    update public.onboarding_steps
      set status = 'waiting_client', ball = 'client', updated_at = now()
      where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'client',
      'הלקוח התחיל למלא את השאלון', jsonb_build_object('from', 'pending', 'to', 'waiting_client'));
    return jsonb_build_object('ok', true, 'stepId', s.id, 'to', 'waiting_client');
  end if;

  return jsonb_build_object('ok', true, 'noop', true);
end;
$function$;

revoke execute on function public.sync_intake_step_from_sessions(text) from public, anon, authenticated;
grant  execute on function public.sync_intake_step_from_sessions(text) to service_role;

-- close_intake_step_for_client נשארת כשם (save_intake_answer של 47 קוראת לה),
-- אבל הגוף שלה הוא הגזירה — אין יותר כתיבה ישירה של "הושלם".
create or replace function public.close_intake_step_for_client(p_client_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return public.sync_intake_step_from_sessions(p_client_id);
end;
$function$;

revoke execute on function public.close_intake_step_for_client(text) from public, anon, authenticated;
grant  execute on function public.close_intake_step_for_client(text) to service_role;

create or replace function public.tg_sync_intake_step_from_session()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.sync_intake_step_from_sessions(coalesce(new.client_id, old.client_id));
  return null;
end;
$function$;

revoke execute on function public.tg_sync_intake_step_from_session() from public, anon, authenticated;

drop trigger if exists sync_intake_step_from_session on public.annual_report_sessions;
create trigger sync_intake_step_from_session
  after insert or update of status or delete on public.annual_report_sessions
  for each row execute function public.tg_sync_intake_step_from_session();

-- ── שומר הקבועים ────────────────────────────────────────────────────────────
select public.assert_domain_function_invariants();
