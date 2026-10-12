-- ═══════════════════════════════════════════════════════════════════════════
-- 239 · החתימה על ייפוי הכוח יוצאת עם הדף של הלקוח — מייל אחד (12.10.2026)
--
-- גיא (אמיר ויסמרק): «ייצוג מול הרשויות» הוא שורה ב«בקשות», אבל הוא נשלח במייל
-- נפרד מ«עדכן את דף הלקוח» — שני ערוצים, שני מיילים, ובדף עצמו «בטיפול המשרד ·
-- אין צורך בפעולה שלך» באותו רגע שמייל אחר מבקש לחתום. הכרעה: רגע שליחה אחד.
--
--   1. שלב «representation» נכנס למייל הדף (_client_announceable_steps) כשהבקשה
--      ממתינה לחתימת הלקוח — בשם «חתימה על ייפוי הכוח», ובמפתח הדף rep_sign.
--   2. כל כניסה ל«ממתין לחתימה» היא סבב חדש: גרסת התוכן של השלב עולה, כך שסבב
--      חתימה שני יוצא שוב כ«חדש» ולא נבלע כ«כבר נמסר».
--   3. «נשלח לחתימה» נגזר מראיה: כשמייל דף יצא (complete_client_notice) והמייל
--      שנשלח בפועל נושא את קישור החתימה של הלקוח — execution.signatureEmailSentAt.
--      והוראות ב"ל של הלקוח «נמסרו» רק אם מספר האסמכתא מופיע במייל עצמו.
--   4. שמירה מהדפדפן (execution שלם מעותק ישן) לא מוחקת «נשלח»/«ההוראות נמסרו».
--
-- ‼ אין כאן שליחה. המייל עצמו — send-process-open-email (בלוק החתימה מעל הכפתור).
-- ‼ בן/בת זוג שחותם/ת: אין לו/ה דף — ממשיך/ה לקבל מייל חתימה אישי (חריג מכוון).
-- ‼ הוחל כהזרקה לגוף הפונקציות החיות (_r239_patch), לא כהחלפה: ב-staging יש בהן
--   שינויים שטרם שוחררו (229/232). שחרור שיחליף את _client_announceable_steps /
--   _client_step_portal_key / _client_step_title מקובץ משלו חייב לשמור את שורות 239.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public._r239_patch(p_fn regprocedure, p_old text, p_new text)
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_fn);
  v_n int := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
begin
  if position(p_new in v_def) > 0 then return; end if;   -- כבר הוחל
  if v_n <> 1 then
    raise exception '239: anchor count % (expected 1) in %: %', v_n, p_fn, left(p_old, 120);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$$;

-- ── 1 · האם הלקוח צריך לחתום עכשיו ──────────────────────────────────────────
create or replace function public._rep_signing_open(p_client_id text)
returns boolean language plpgsql stable security definer set search_path to 'public' as $function$
declare
  r public.representation_requests;
begin
  r := public.representation_request_for_client(p_client_id);
  if r.id is null or r.status is distinct from 'pending_signature' then return false; end if;
  return exists (select 1 from jsonb_array_elements(coalesce(r.signers, '[]'::jsonb)) x
                  where x->>'role' = 'client' and x->>'signStatus' = 'pending'
                    and coalesce(x->>'signToken', '') <> '');
end;
$function$;
revoke execute on function public._rep_signing_open(text) from public, anon, authenticated;

select public._r239_patch('public._client_step_portal_key(text,text)'::regprocedure,
  $a$when 'rep_client_approval' then 'rep_approval'$a$,
  $b$when 'rep_client_approval' then 'rep_approval'
           -- 239 · החתימה על ייפוי הכוח — אותו מפתח שהדף נותן לפריט (_portal_rep_item)
           when 'representation' then 'rep_sign'$b$);

select public._r239_patch('public._client_step_title(text,jsonb)'::regprocedure,
  $a$when 'rep_client_approval' then 'זירוז אישור הייצוג באזור האישי'$a$,
  $b$when 'rep_client_approval' then 'זירוז אישור הייצוג באזור האישי'
             when 'representation' then 'חתימה על ייפוי הכוח'$b$);

select public._r239_patch('public._client_announceable_steps(text)'::regprocedure,
  $a$'paperless_invite', 'prev_accountant_details', 'rep_client_approval',$a$,
  $b$'paperless_invite', 'prev_accountant_details', 'rep_client_approval',
                         -- 239 · ייפוי הכוח — רק כשהלקוח צריך לחתום עליו עכשיו
                         'representation',$b$);

select public._r239_patch('public._client_announceable_steps(text)'::regprocedure,
  $a$and (s.step_type <> 'business_details' or coalesce(s.ball, 'client') = 'client')$a$,
  $b$and (s.step_type <> 'representation' or public._rep_signing_open(s.client_id))
     and (s.step_type <> 'business_details' or coalesce(s.ball, 'client') = 'client')$b$);

-- ── 2 · סבב חתימה חדש = גרסה חדשה של השלב ───────────────────────────────────
select public._r239_patch('public.sync_representation_step()'::regprocedure,
  $a$  if new.status = 'awaiting_authorities' then$a$,
  $b$  -- 239 · כל כניסה ל«ממתין לחתימה» היא בקשת חתימה חדשה ללקוח — ייכנס למייל הדף הבא.
  if new.status = 'pending_signature' then
    update public.onboarding_steps
       set client_content_version = client_content_version + 1
     where client_id = new.linked_client_id and step_type = 'representation'
       and status not in ('cancelled', 'skipped') and published_at is not null;
  end if;

  if new.status = 'awaiting_authorities' then$b$);

-- ── 3 · «נשלח לחתימה» מתוך המייל שיצא בפועל ─────────────────────────────────
create or replace function public._rep_mark_signing_delivered(p_notice_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  n       public.client_notices%rowtype;
  r       public.representation_requests;
  v_html  text;
  v_token text;
  v_exec  jsonb;
  v_ni    jsonb;
  v_now   text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  select * into n from public.client_notices where id = p_notice_id;
  if n.id is null or n.status <> 'sent' then return; end if;
  if not exists (select 1 from public.client_notice_items i
                   join public.onboarding_steps s on s.id = i.step_id
                  where i.notice_id = n.id and s.step_type = 'representation') then
    return;
  end if;
  r := public.representation_request_for_client(n.client_id);
  if r.id is null then return; end if;
  v_html := coalesce(n.request_body->>'html', '');
  select x->>'signToken' into v_token
    from jsonb_array_elements(coalesce(r.signers, '[]'::jsonb)) x
   where x->>'role' = 'client' and coalesce(x->>'signToken', '') <> '' limit 1;
  -- ‼ ראיה, לא כוונה: רק מייל שבאמת נשא את קישור החתימה נחשב «נשלח לחתימה».
  if v_token is null or position(('?sign=' || v_token) in v_html) = 0 then return; end if;

  v_exec := coalesce(r.execution, '{}'::jsonb);
  if nullif(v_exec->>'signatureEmailSentAt', '') is null then
    v_exec := v_exec || jsonb_build_object('signatureEmailSentAt', v_now);
  end if;
  v_ni := v_exec->'nationalInsurance';
  if jsonb_typeof(v_ni) = 'object' and nullif(v_ni->>'referenceNumber', '') is not null
     and nullif(v_ni->>'instructionsSentAt', '') is null
     and position((v_ni->>'referenceNumber') in v_html) > 0 then
    v_exec := jsonb_set(v_exec, '{nationalInsurance}',
      v_ni || jsonb_build_object('instructionsSentAt', v_now, 'instructionsSentWith', 'signature'));
  end if;
  if v_exec is distinct from r.execution then
    update public.representation_requests set execution = v_exec where id = r.id;
  end if;
end;
$function$;
revoke execute on function public._rep_mark_signing_delivered(uuid) from public, anon, authenticated;

select public._r239_patch('public.complete_client_notice(uuid,uuid,text,text,text)'::regprocedure,
  $a$  return jsonb_build_object('ok', true, 'emailId', v_rec->>'emailId', 'noticeId', n.id);$a$,
  $b$  -- 239 · מייל שנשא את החתימה על ייפוי הכוח ⇒ «נשלח לחתימה» בבקשת הייצוג.
  -- ‼ כשל כאן אינו כשל המייל — המייל כבר יצא ונרשם.
  begin
    perform public._rep_mark_signing_delivered(n.id);
  exception when others then
    raise warning '239: _rep_mark_signing_delivered(%) failed: %', n.id, sqlerrm;
  end;

  return jsonb_build_object('ok', true, 'emailId', v_rec->>'emailId', 'noticeId', n.id);$b$);

-- ── 4 · שמירה מעותק ישן לא מוחקת «נשלח» ─────────────────────────────────────
create or replace function public.guard_rep_execution_delivery()
returns trigger language plpgsql set search_path to 'public' as $function$
declare
  v_old jsonb := coalesce(old.execution, '{}'::jsonb);
  v_new jsonb := new.execution;
  k     text;
begin
  if v_new is null or jsonb_typeof(v_new) <> 'object' then return new; end if;
  if nullif(v_old->>'signatureEmailSentAt', '') is not null and nullif(v_new->>'signatureEmailSentAt', '') is null then
    v_new := v_new || jsonb_build_object('signatureEmailSentAt', v_old->'signatureEmailSentAt');
  end if;
  foreach k in array array['nationalInsurance', 'nationalInsuranceSpouse'] loop
    -- ‼ אסמכתא אחרת = הוראות אחרות; רק לאותה אסמכתא «נמסרו» נשמר.
    if jsonb_typeof(v_old->k) = 'object' and nullif(v_old->k->>'instructionsSentAt', '') is not null
       and jsonb_typeof(v_new->k) = 'object' and nullif(v_new->k->>'instructionsSentAt', '') is null
       and coalesce(v_new->k->>'referenceNumber', '') = coalesce(v_old->k->>'referenceNumber', '') then
      v_new := jsonb_set(v_new, array[k], (v_new->k)
        || jsonb_build_object('instructionsSentAt', v_old->k->'instructionsSentAt')
        || case when v_old->k ? 'instructionsSentWith'
                then jsonb_build_object('instructionsSentWith', v_old->k->'instructionsSentWith') else '{}'::jsonb end);
    end if;
  end loop;
  new.execution := v_new;
  return new;
end;
$function$;
revoke execute on function public.guard_rep_execution_delivery() from public, anon, authenticated;

drop trigger if exists rep_requests_guard_execution_delivery on public.representation_requests;
create trigger rep_requests_guard_execution_delivery
  before update of execution on public.representation_requests
  for each row execute function public.guard_rep_execution_delivery();

-- ── 5 · מי שכבר קיבל מייל חתימה נפרד — החתימה אינה «חדשה» במייל הדף הבא ─────
insert into public.client_step_notice_state as ns (step_id, announced_version, announced_at)
select s.id, s.client_content_version, (r.execution->>'signatureEmailSentAt')::timestamptz
  from public.representation_requests r
  join public.onboarding_steps s on s.client_id = r.linked_client_id and s.step_type = 'representation'
                                and s.status not in ('cancelled', 'skipped')
 where r.status = 'pending_signature' and nullif(r.execution->>'signatureEmailSentAt', '') is not null
on conflict (step_id) do update
   set announced_version = greatest(ns.announced_version, excluded.announced_version);

drop function public._r239_patch(regprocedure, text, text);
