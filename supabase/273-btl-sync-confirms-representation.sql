-- ═══════════════════════════════════════════════════════════════════════════
-- 273 · קריאת התיק בב"ל מאשרת ייצוג שהיא מוצאת (21.10.2026)
--
-- המקרה: דין וולוצקי ישר. «קריאת התיק בביטוח לאומי» פתחה את התיק שלה מתוך
-- «חיפוש מיוצגים» (נקלט 13.10.2026, בלי «ממתין»), אבל בכרטיס נשאר «בתהליך ·
-- אסמכתא … · עד …» עם «בדוק קבלת הייצוג» — ובקופסת «לבדיקה» הוצע לגיא לתקן
-- בעצמו. גיא: «איך זה הגיוני שהוא עשה יישור קו ולא הבין לבד שהיא מיוצגת?»
--
-- הכלל: אדם שהעובד **פתח** מתוך רשימת המיוצגים (ok), בלי סטטוס ובלי פעולה
-- ממתינה בשורה, מיוצג. זו אותה ראיה כמו «מצב: אושר» במעקב ייפוי הכוח (195),
-- ולכן אותה כתיבה: confirmedAt + externalState='approved' על מסלול האדם בבקשת
-- הייצוג. ממנו נגזר הכול (tg_sync_authority_rep_from_execution).
--
-- ‼ רק מסלול שכבר קיים בבקשה (הוזן / יש אסמכתא / נשלחו הנחיות). אדם בלי מסלול
--   — לא נוצר לו מסלול מכאן.
-- ‼ מסלול שבוטל (212, `cancelled`) — לא נוגעים; guard_ni_confirm_after_cancel
--   היה חוסם בכל מקרה.
-- ‼ «ממתין לאישור» / «ממתין תוקף» בשורה ⇒ לא מאשרים. כל סטטוס לא ריק ⇒ לא
--   מאשרים — אין אישור בלי ראיה חיובית.
-- ‼ גדר זמן כמו ב-195: קריאה שרצה לפני הראיה השמורה לא דורסת.
-- ‼ להריץ דרך execute_sql/prod-apply-migration ולאמת.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public._btl_confirm_from_sync_result(
  p_client_id text, p_result jsonb, p_at timestamptz
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_req_id  text;
  v_exec    jsonb;
  v_track   jsonb;
  v_person  jsonb;
  v_role    text;
  v_key     text;
  v_rep     jsonb;
  v_prev    timestamptz;
  v_at_txt  text := to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_changed int := 0;
begin
  if p_result is null or jsonb_typeof(p_result -> 'persons') is distinct from 'array' then
    return 0;
  end if;
  select representation_request_id into v_req_id from public.clients where id = p_client_id;
  if v_req_id is null then return 0; end if;
  select coalesce(execution, '{}'::jsonb) into v_exec from public.representation_requests where id = v_req_id;
  if v_exec is null then return 0; end if;

  for v_person in select * from jsonb_array_elements(p_result -> 'persons') loop
    v_role := v_person ->> 'role';
    -- ‼ `is not true` ולא `not …`: NULL נופל כאן החוצה ולא «בשקט» לענף הלא נכון.
    if v_role is null or v_role not in ('client', 'spouse') then continue; end if;
    if (v_person ->> 'ok')::boolean is not true then continue; end if;
    v_rep := v_person -> 'representation';
    if jsonb_typeof(v_rep) is distinct from 'object' or (v_rep ->> 'found')::boolean is not true then continue; end if;
    if coalesce(v_rep ->> 'status', '') <> '' or coalesce(v_rep ->> 'pendingAction', '') <> '' then continue; end if;

    v_key := case when v_role = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end;
    v_track := v_exec -> v_key;
    if jsonb_typeof(v_track) is distinct from 'object' or v_track = '{}'::jsonb then continue; end if;
    if v_track ? 'cancelled' then continue; end if;
    if coalesce(v_track ->> 'confirmedAt', '') <> '' then continue; end if;
    begin
      v_prev := nullif(v_track ->> 'syncedAt', '')::timestamptz;
    exception when others then v_prev := null;
    end;
    if v_prev is not null and v_prev > p_at then continue; end if;

    v_track := v_track || jsonb_strip_nulls(jsonb_build_object(
      'enteredAt', coalesce(nullif(v_track ->> 'enteredAt', ''), v_at_txt),
      'externalState', 'approved',
      'syncedAt', v_at_txt,
      'confirmedAt', v_at_txt,
      'confirmedVia', 'btl_represented_list',
      'representedSince', nullif(v_rep ->> 'receivedDate', '')
    ));
    v_exec := jsonb_set(v_exec, array[v_key], v_track, true);
    v_changed := v_changed + 1;
  end loop;

  if v_changed > 0 then
    update public.representation_requests set execution = v_exec where id = v_req_id;
  end if;
  return v_changed;
end;
$$;

revoke all on function public._btl_confirm_from_sync_result(text, jsonb, timestamptz) from public, anon, authenticated;

create or replace function public._btl_sync_confirms_representation_job()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public._btl_confirm_from_sync_result(new.client_id, new.result, coalesce(new.finished_at, now()));
  return new;
end;
$$;

revoke all on function public._btl_sync_confirms_representation_job() from public, anon, authenticated;

drop trigger if exists trg_btl_sync_confirms_representation on public.automation_jobs;
create trigger trg_btl_sync_confirms_representation
  after update of status on public.automation_jobs
  for each row
  when (new.action_type = 'btl.sync_file' and new.status = 'succeeded' and old.status is distinct from new.status)
  execute function public._btl_sync_confirms_representation_job();

-- ── השלמה לאחור: הקריאה המוצלחת האחרונה של כל לקוח ─────────────────────────
-- ‼ אותה פונקציה בדיוק; רק מסלולים פתוחים בלי confirmedAt מושפעים.
do $$
declare r record; n int := 0;
begin
  for r in
    select distinct on (client_id) client_id, result, coalesce(finished_at, updated_at) as at
      from public.automation_jobs
     where action_type = 'btl.sync_file' and status = 'succeeded' and client_id is not null
     order by client_id, coalesce(finished_at, updated_at) desc
  loop
    n := n + public._btl_confirm_from_sync_result(r.client_id, r.result, r.at);
  end loop;
  raise notice '273: % מסלולי ב"ל אושרו מקריאת התיק', n;
end $$;
