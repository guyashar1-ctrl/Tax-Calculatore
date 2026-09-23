-- ─── 199: מספר הבקשה בשע״ם נשמר ברגע שהעובד קרא אותו ────────────────────────
--
-- הרקע (הדסה סלע, 23.09.2026, ניסיון 3): העובד פתח את הבקשה הקיימת בשע״ם,
-- קרא ממנה «מספר בקשה: 2026538930» ושמר אותו ב-progress של המשימה — ונעצר
-- לפני ההעלאה. 198 שומרת את המספר רק כשהשידור **הצליח**, ולכן מספר אמיתי
-- שנקרא מהרשות נשאר קבור במשימה שנעצרה, וה-PIVO המשיכה להציג «אין מספר».
--
-- הכלל:
--   · כש-progress.requestNumber של משימת shaam.* משתנה לערך תקין (6+ ספרות),
--     הוא נכתב ל-execution.shaam[submissionKey].requestNumber של הבקשה.
--   · ‼ רק כשאין שם מספר (null או ""). מזהה קיים לא נדרס לעולם (כמו 194/198).
--   · ‼ המפתח (submissionKey) מגיע מקלט המשימה בלבד — לא מנחשים «מי».
--   · מילוי חד-פעמי למשימות שכבר קראו מספר (UPDATE רגיל, בלי בלוק DO).
-- ‼ לא נוגע ב-sync_shaam_representation_from_job (198) ולא בשום מעבר סטטוס.

create or replace function public.sync_shaam_request_number_from_progress()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_num     text;
  v_old     text;
  v_key     text;
  v_req_id  text;
  v_cur     text;
begin
  v_num := nullif(regexp_replace(coalesce(new.progress ->> 'requestNumber', ''), '\D', '', 'g'), '');
  if v_num is null or length(v_num) < 6 then return new; end if;
  v_old := nullif(regexp_replace(coalesce(old.progress ->> 'requestNumber', ''), '\D', '', 'g'), '');
  if v_old is not distinct from v_num then return new; end if;

  v_key := coalesce(new.input ->> 'submissionKey', '');
  if v_key = '' then return new; end if;

  select representation_request_id into v_req_id from public.clients where id = new.client_id;
  if v_req_id is null then return new; end if;

  select nullif(execution #>> array['shaam', v_key, 'requestNumber'], '') into v_cur
    from public.representation_requests where id = v_req_id;
  if v_cur is not null then return new; end if;

  update public.representation_requests
     set execution = jsonb_set(
           coalesce(execution, '{}'::jsonb), array['shaam'],
           coalesce(execution -> 'shaam', '{}'::jsonb)
             || jsonb_build_object(v_key,
                  coalesce(execution #> array['shaam', v_key], '{}'::jsonb)
                    || jsonb_build_object('requestNumber', v_num)),
           true)
   where id = v_req_id;
  return new;
end;
$function$;

revoke all on function public.sync_shaam_request_number_from_progress() from public, anon, authenticated;

drop trigger if exists trg_sync_shaam_request_number_from_progress on public.automation_jobs;
create trigger trg_sync_shaam_request_number_from_progress
  after update of progress on public.automation_jobs
  for each row
  when (new.action_type like 'shaam.%' and new.progress ? 'requestNumber')
  execute function public.sync_shaam_request_number_from_progress();

-- ── מילוי חד-פעמי: משימות שכבר קראו מספר ────────────────────────────────────
with src as (
  select distinct on (r.id, j.input ->> 'submissionKey')
         r.id as req_id,
         j.input ->> 'submissionKey' as k,
         regexp_replace(j.progress ->> 'requestNumber', '\D', '', 'g') as num
    from public.automation_jobs j
    join public.clients c on c.id = j.client_id
    join public.representation_requests r on r.id = c.representation_request_id
   where j.action_type like 'shaam.%'
     and coalesce(j.progress ->> 'requestNumber', '') <> ''
     and coalesce(j.input ->> 'submissionKey', '') <> ''
   order by r.id, j.input ->> 'submissionKey', j.updated_at desc
)
update public.representation_requests r
   set execution = jsonb_set(
         coalesce(r.execution, '{}'::jsonb), array['shaam'],
         coalesce(r.execution -> 'shaam', '{}'::jsonb)
           || jsonb_build_object(src.k,
                coalesce(r.execution #> array['shaam', src.k], '{}'::jsonb)
                  || jsonb_build_object('requestNumber', src.num)),
         true)
  from src
 where r.id = src.req_id
   and length(src.num) >= 6
   and nullif(r.execution #>> array['shaam', src.k, 'requestNumber'], '') is null;

select public.assert_domain_function_invariants();
