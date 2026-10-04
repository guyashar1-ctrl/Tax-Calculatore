-- 217: שלמות הבקשות — בקשה שלא נוצרה גלויה, סוג עוסק שלא ידוע אינו «עוסק מורשה», לקוח
--      שחוזר מקבל קליטה חדשה (וההיסטוריה נשארת), ומשימה של המשרד אינה בדף של הלקוח.
--
-- ‼ סדר השחרור: 212 → 214 → 215 → 216 → 217. הקובץ נשלח אחרי 216 ותלוי ב-212
--   (216 בונה עליה), וגם הפוך: פונקציות ב-215/216 (המחולל, _flow_materialize,
--   _flow_progress, attach_onboarding_flow_run, get_client_flow_runs…) קוראות לאובייקטים
--   שנוצרים כאן — ולכן 214–217 עולים יחד, באותו שחרור, ו-217 מוחלת מחדש אחרי כל החלה
--   חוזרת של 216 (מלכודת סדר ההחלה). scripts/staging-dryrun-flows.mjs --full מוכיח שהם
--   מתקמפלים ועובדים יחד.
--
-- א · בקשה שהייתה אמורה להיווצר ולא נוצרה (docs: inv4 «not-created»)
--   עד כאן: הערה בחלון שנעלמת אחרי 9 שניות, שורה ב«פעילות» (לפעמים עם קוד באנגלית), או
--   כלום. השלב נסגר בלעדיה, והשלב הבא נפתח. מכאן: שורה אדומה ב«בקשות» — משימת משרד
--   (custom_request, ball 'me', payload.internalTask, payload.creationProblem) עם הסיבה ומה
--   עושים: «צור שוב» (retry_request_creation) או «אין צורך» (advance_onboarding_step skip,
--   not_applicable). במסלול היא מקבלת את מפתח הפריט — השלב מחכה לה כמו לבקשה עצמה, ומי
--   שנפתח «אחריה» מחכה. כשהבקשה נוצרת בכל דרך שהיא — השורה נסגרת (מבוטלת, resolvedStepId),
--   ורק אחרי שהבקשה האמיתית קיבלה את הקשתות שלה.
--
-- ב · סוג העוסק לא ידוע (docs: inv4 «client-kind»)
--   עד כאן: לקוח בלי סוג נקלט כ«עוסק מורשה» בשקט (resolve_journey_default_kind), והניחוש
--   נשמר בעובדות של ההתקשרות וגבר על הכרטיס לתמיד. מכאן: מה ששונה בין עוסק פטור, עוסק
--   מורשה וחברה מוחזק (engagements.kind_hold) — לא נוצר — וכל השאר נפתח. כשהמשרד קובע את
--   «סוג העוסק» (clients.dealer_type, או סיווג המע״מ) הטריגר כאן פותח את מה שחיכה, לפי
--   הרשימה של הסוג שנקבע כפי שהייתה באישור. כשל בשחרור לעולם לא מפיל את שמירת הכרטיס.
--
-- ג · לקוח שחוזר (docs: inv4-returning; הכרעות D1–D4) — סעיפים 12–21
--   עד כאן: מה שהושלם בהתקשרות שהסתיימה חסם את הקליטה החדשה (אינדקס «אחת ללקוח לכל
--   חייו», בדיקות קיום והסרה לכל הלקוח), בקשה שהוכנה לפני האישור נצמדה להתקשרות שהסתיימה
--   ופורסמה מיד, והייצוג נשאר מחוץ לקליטה. מכאן: שישה סוגים נפתחים מחדש בכל התקשרות,
--   מה שפתוח מצטרף לקליטה החדשה (payload.carriedFrom) והמסלול הקודם נסגר, בקשה שהוכנה
--   מוחזקת עד האישור, והדף של הלקוח מציג את ההצעה החדשה ואת הקליטה החדשה (בלי מה שהושלם
--   בהתקשרות הקודמת). ‼ הכרעה (ב), 03.10: בקשה שפורסמה לפני הקליטה החדשה ועדיין פתוחה —
--   גלויה ללקוח גם כשהקליטה החדשה טרם פורסמה; הקליטה החדשה עצמה — טיוטה עד שהמשרד מפרסם
--   (השער לכל בקשה: client_step_gate_open, 214). דף הרו"ח הקודם — רק החומרים של
--   המכתב שלו. ‼ portal-upload-document (פונקציית Edge) חייבת לאכוף את אותו כלל
--   (_release_materials_step) — סדר הפריסה: מסד, Edge (לאמת מול השרת), אתר.
--
-- ד · משימות פנימיות ישנות ובעלים של תבנית (docs: inv4 «internal-legacy») — סעיפים 22–24
--   הכלל והסימון ב-216 §9; כאן «שמור כתבנית», «עדכן תבנית» והחלת תבנית «מסע» מהייצור,
--   ובקשת המשרד בקליטה (סעיף 3): בעלים 'me' שנגזר מהכדור אינו מסתיר בקשה ללקוח, ומשימה
--   של המשרד נולדת מסומנת — לא בדף של הלקוח ולא במייל.
--
-- ה · אישור הייצוג באזור האישי — מה מסמנים (docs: inv4 «links-guide» §3 א–ג) — סעיפים 25–26
--   _rep_approval_people: מי מבני הזוג מאשר ואילו רשויות (משע״ם, ובלעדיה מההיקף שעל הבקשה;
--   לא מנחשים). build_client_portal (216) מוסיפה approvals לכרטיס rep_approval, בקריאה עטופה —
--   שורה פגומה לעולם לא שוברת דף. ensure_rep_client_approval_step (מ-186): «את כל הבקשות»,
--   וירידות שורה אמיתיות. מה ששע״ם דורשת נכנס ל«שלח מייל…» ב-214 (_client_announceable_steps).
--   shaam_require_client_approval (מ-201, סעיף 27): כרטיס שבוטל וחוזר — published_at = עכשיו,
--   כדי שקליטה חדשה שטרם פורסמה תסתיר אותו כמו כרטיס חדש (הכרעה א).
--
-- ו · בן/בת הזוג (בדיקת ההתאמה G1/X-5, 04.10)
--   «גם לבן/בת הזוג» כשבכרטיס אין שם לבן/בת הזוג ⇒ שורת «לא נוצרה» (spouse_name_missing, card ⇒
--   «צור שוב» אחרי שהשם נכתב בתיק המס), לא דילוג שקט (215 _flow_materialize). create_onboarding_request
--   דוחה אישור אישי על בן/בת הזוג (personal_confirm_for_subject) — כמו העריכה.
--
-- ז · צילום התעודה של בן/בת הזוג לשע״ם (G1.b, 04.10) — סעיף ז בסוף הקובץ
--   בעל הכרטיס לא מאשר «זה הצילום הנכון» במקום בן/בת הזוג: הבקשה (208) הופכת למשימה של המשרד
--   (personalConfirmFor + officeNote, כמו 215), «התקבל האישור» רושם את האישור על הצילום, ומה
--   שפתוח עובר בהמרה מוגנת. הצילום של הלקוח עצמו — ללא שינוי.

-- ── 0 · עמודה ואינדקסים ──────────────────────────────────────────────────────
-- { since, snapshotKind, keys:[…], held:[{key, stepType, source, title}], lists:{kind:[entries]},
--   resolvedAt?, resolvedKind?, created?:[{key, stepId}], notApplicable?:[key], failedAt?, error? }
-- «ממתין» = יש kind_hold ואין resolvedAt. נוצר רק כשמשהו באמת מחכה לסוג.
alter table public.engagements add column if not exists kind_hold jsonb;

-- ‼ שורת «לא נוצרה» של פריט אינה הבקשה של הפריט: הבקשה האמיתית נוצרת לצידה (ורק אחר כך
-- השורה נסגרת), ולכן היא מחוץ לייחודיות של (ריצה, פריט, אדם).
drop index if exists public.onboarding_steps_flow_item_uidx;
create unique index onboarding_steps_flow_item_uidx
  on public.onboarding_steps (flow_run_id, flow_item_key, coalesce(payload->>'subjectRole', ''), (payload ? 'personalConfirmFor'))
  where flow_run_id is not null and flow_item_key is not null and status <> 'cancelled'
    and not (payload ? 'creationProblem');
-- שורה פתוחה אחת לכל בעיה. שורה שנסגרה היא היסטוריה; כשל חדש אחריה — שורה חדשה (§9).
create unique index if not exists onboarding_steps_open_problem_uidx
  on public.onboarding_steps (client_id, (payload->'creationProblem'->>'key'))
  where payload ? 'creationProblem' and status not in ('completed', 'verified', 'skipped', 'cancelled');

-- ── 1 · מה נחשב «לא נוצרה» ───────────────────────────────────────────────────
/**
 * null = דילוג תקין (לא חל, כבר קיימת, בקשת מערכת של המחולל, הושלמה בעבר, פתוחה במסלול
 * אחר, סוג שלא חוזר במסלול שחוזר — הבונה כבר מסמן אותו, מחכה לסוג העוסק).
 * אחרת — הסוג: library (נמחקה מהספרייה), content (התוכן בספרייה לא תקין), config (סוג
 * שלא נוצר מתוך מסלול / חסר מי מבצע), card (חסר נתון בכרטיס — שם בן/בת הזוג), system (כל
 * השאר, כולל קוד לא מוכר).
 * ‼ המסכים לא מחזיקים רשימה שנייה: השרת מחזיר problem:true.
 */
create or replace function public._creation_problem_class(p_reason text)
returns text language sql immutable set search_path to 'public' as $$
  select case
    when p_reason is null or p_reason in ('not_applicable', 'exists', 'generator_only', 'already_done',
                                          'in_other_run', 'step_type_exists', 'not_repeatable', 'kind_unknown')
      then null
    when p_reason = 'library_item_missing' then 'library'
    when p_reason = 'spouse_name_missing' then 'card'
    when p_reason in ('missing_payload', 'no_requirements', 'missing_requirement_label',
                      'bad_requirement_kind', 'select_needs_options') then 'content'
    when p_reason in ('not_creatable', 'not_a_request', 'step_type_not_allowed',
                      'bad_owner', 'missing_external_party') then 'config'
    else 'system' end;
$$;

/**
 * רושמת (או מעדכנת) את שורת «לא נוצרה». p_info: key, source ('flow'|'generator'), reason,
 * runId, stageKey, itemKey, role, engagementId, entryKey, ref, itemTitle, subjectName.
 * ‼ הכנסה ישירה — לא create_onboarding_request (שרושמת «נוספה בקשה»). שורה פתוחה עם אותו
 * מפתח ⇒ ניסיון חוזר (attempts+1) באותה שורה. מחזירה {ok, stepId, inserted}.
 */
create or replace function public._record_creation_problem(p_client_id text, p_engagement_id text,
  p_info jsonb, p_required boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  c        public.clients%rowtype;
  s        public.onboarding_steps%rowtype;
  v_key    text := nullif(p_info->>'key', '');
  v_reason text := coalesce(nullif(p_info->>'reason', ''), 'create_failed');
  v_cls    text;
  v_next   text;
  v_item   text;
  v_title  text;
  v_eng    text;
  v_cp     jsonb;
  v_id     text;
  v_sort   int;
  v_spouse boolean := p_info->>'role' = 'spouse';
begin
  if v_key is null then return jsonb_build_object('ok', false, 'error', 'missing_key'); end if;
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  v_cls := coalesce(public._creation_problem_class(v_reason), 'system');
  -- מה עושים: נמחקה מהספרייה ⇒ «＋ בקשה חדשה» (ניסיון חוזר לא יצליח); תוכן ⇒ לתקן בספרייה;
  -- סוג שלא נוצר מתוך מסלול ⇒ להחליף את הפריט במסלול; תקלה ⇒ «צור שוב».
  -- ‼ חסר שם בן/בת הזוג (card) ⇒ «צור שוב» אחרי שהשם נכתב בתיק המס: הניסיון החוזר
  -- (flow_run_add_items) קורא את הכרטיס מחדש — «＋ בקשה חדשה» הייתה יוצרת בקשה מחוץ למסלול.
  v_next := case when v_cls = 'card' then 'retry'
                 when v_cls = 'library' then 'add'
                 when v_cls = 'content' then 'library'
                 when v_reason in ('bad_owner', 'missing_external_party') then 'library'
                 when v_cls = 'config' then 'flow'
                 else 'retry' end;
  v_item := coalesce(nullif(trim(coalesce(p_info->>'itemTitle', '')), ''), 'בקשה');

  select * into s from public.onboarding_steps
   where client_id = c.id and payload ? 'creationProblem' and payload->'creationProblem'->>'key' = v_key
     and status not in ('completed', 'verified', 'skipped', 'cancelled')
   order by created_at desc limit 1
   for update;
  if s.id is null then
    v_eng := coalesce(nullif(p_engagement_id, ''),
                      (select id from public.engagements where client_id = c.id and status = 'onboarding'
                        order by created_at desc limit 1),
                      (select id from public.engagements where client_id = c.id order by created_at desc limit 1));
    v_cp := jsonb_strip_nulls(jsonb_build_object(
      'key', v_key, 'source', coalesce(nullif(p_info->>'source', ''), 'flow'), 'reason', v_reason,
      'cls', v_cls, 'next', v_next,
      'runId', nullif(p_info->>'runId', ''), 'stageKey', nullif(p_info->>'stageKey', ''),
      'itemKey', nullif(p_info->>'itemKey', ''), 'role', nullif(p_info->>'role', ''),
      'engagementId', v_eng, 'entryKey', nullif(p_info->>'entryKey', ''),
      'ref', case when jsonb_typeof(p_info->'ref') = 'object' then p_info->'ref' end,
      'itemTitle', v_item, 'attempts', 1, 'firstAt', now(), 'lastAt', now()));
    v_title := 'לא נוצרה — «' || v_item || '»'
      || case when v_spouse then ' - ' || coalesce(nullif(trim(coalesce(p_info->>'subjectName', '')), ''), 'בן/בת הזוג') else '' end;
    select coalesce(max(sort_order), 0) + 10 into v_sort from public.onboarding_steps where client_id = c.id;
    insert into public.onboarding_steps
      (user_id, engagement_id, client_id, step_type, track, scope, status, ball, required_for_close,
       sort_order, payload, published_at, flow_run_id, flow_stage_key, flow_item_key)
    values
      (c.user_id, v_eng, c.id, 'custom_request', public.onboarding_track_for('custom_request'), 'person',
       'pending', 'me', coalesce(p_required, false), v_sort,
       jsonb_build_object('title', v_title, 'internalTask', true, 'creationProblem', v_cp, 'requirements', '[]'::jsonb)
         || case when v_spouse then jsonb_strip_nulls(jsonb_build_object('subjectRole', 'spouse',
                                     'subjectName', nullif(trim(coalesce(p_info->>'subjectName', '')), '')))
                 else '{}'::jsonb end
         || case when nullif(p_info->>'runId', '') is not null
                 then jsonb_build_object('flowOrigin', jsonb_build_object('runId', p_info->>'runId',
                        'itemKey', p_info->>'itemKey', 'stageKey', p_info->>'stageKey'))
                 else '{}'::jsonb end,
       now(), nullif(p_info->>'runId', ''), nullif(p_info->>'stageKey', ''), nullif(p_info->>'itemKey', ''))
    on conflict do nothing
    returning id into v_id;
    if v_id is not null then
      perform public.log_onboarding_event(c.user_id, v_id, v_eng, 'note', 'system',
        'לא נוצרה «' || v_item || '» - הסיבה ומה עושים מופיעים ברשימת הבקשות',
        jsonb_build_object('creationProblem', v_key, 'reason', v_reason, 'cls', v_cls));
      return jsonb_build_object('ok', true, 'stepId', v_id, 'inserted', true);
    end if;
    -- ‼ מרוץ: שתי לחיצות רשמו יחד — הרישום של השנייה הוא ניסיון חוזר באותה שורה.
    select * into s from public.onboarding_steps
     where client_id = c.id and payload ? 'creationProblem' and payload->'creationProblem'->>'key' = v_key
       and status not in ('completed', 'verified', 'skipped', 'cancelled')
     order by created_at desc limit 1
     for update;
    if s.id is null then return jsonb_build_object('ok', false, 'error', 'record_failed'); end if;
  end if;

  update public.onboarding_steps
     set payload = jsonb_set(payload, '{creationProblem}', (payload->'creationProblem')
           || jsonb_build_object('reason', v_reason, 'cls', v_cls, 'next', v_next, 'lastAt', now(),
                                 'attempts', coalesce(case when (payload->'creationProblem'->>'attempts') ~ '^\d{1,6}$'
                                                           then (payload->'creationProblem'->>'attempts')::int end, 1) + 1)
           || case when jsonb_typeof(p_info->'ref') = 'object' then jsonb_build_object('ref', p_info->'ref') else '{}'::jsonb end)
   where id = s.id;
  perform public.log_onboarding_event(c.user_id, s.id, s.engagement_id, 'note', 'system',
    'ניסיון חוזר: «' || coalesce(s.payload->'creationProblem'->>'itemTitle', v_item) || '» עדיין לא נוצרה',
    jsonb_build_object('creationProblem', v_key, 'reason', v_reason, 'cls', v_cls));
  return jsonb_build_object('ok', true, 'stepId', s.id, 'inserted', false);
end;
$$;

/**
 * הבקשה קיימת עכשיו (נוצרה, או שהתברר שכבר הייתה) ⇒ השורה מבוטלת עם resolvedStepId, והבקשה
 * האמיתית תופסת את מקומה. לא חלה עוד ⇒ «דולגה» (not_applicable). p_how: created | exists |
 * not_applicable. ‼ מבוטלת נחשבת «הושלמה» לתלויים — הקורא אחראי שהבקשה האמיתית כבר קיבלה
 * את הקשתות שלה (ראה _flow_materialize).
 */
create or replace function public._resolve_creation_problem(p_client_id text, p_key text, p_new_step text, p_how text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  s       public.onboarding_steps%rowtype;
  v_title text;
  v_how   text := case when p_how in ('created', 'exists', 'not_applicable') then p_how else 'created' end;
begin
  if p_key is null then return jsonb_build_object('ok', true, 'resolved', false); end if;
  select * into s from public.onboarding_steps
   where client_id = p_client_id and payload ? 'creationProblem' and payload->'creationProblem'->>'key' = p_key
     and status not in ('completed', 'verified', 'skipped', 'cancelled')
   order by created_at desc limit 1
   for update;
  if s.id is null then return jsonb_build_object('ok', true, 'resolved', false); end if;
  v_title := coalesce(nullif(s.payload->'creationProblem'->>'itemTitle', ''), 'הבקשה');
  update public.onboarding_steps
     set payload = jsonb_set(payload, '{creationProblem}', (payload->'creationProblem')
           || jsonb_strip_nulls(jsonb_build_object('resolvedStepId', nullif(p_new_step, ''),
                                                   'resolvedHow', v_how, 'resolvedAt', now())))
           || case when v_how = 'not_applicable' then jsonb_build_object('skipReason', 'not_applicable') else '{}'::jsonb end
   where id = s.id;
  if v_how = 'not_applicable' then
    -- ‼ הסיבה נכתבת לפני הסטטוס: דילוג בלי סיבה מוכרת אינו משחרר תלויים (168).
    perform public._set_step_status(s.id, 'skipped', 'system',
      'לא חלה עוד על הלקוח - השורה «לא נוצרה» נסגרה',
      jsonb_build_object('creationProblem', p_key, 'how', v_how));
  else
    perform public._set_step_status(s.id, 'cancelled', 'system',
      case when v_how = 'created' then 'נוצרה «' || v_title || '» - השורה «לא נוצרה» נסגרה'
           else '«' || v_title || '» כבר קיימת אצל הלקוח - השורה «לא נוצרה» נסגרה' end,
      jsonb_build_object('creationProblem', p_key, 'how', v_how, 'resolvedStepId', p_new_step));
  end if;
  return jsonb_build_object('ok', true, 'resolved', true, 'stepId', s.id, 'how', v_how);
end;
$$;

/**
 * _flow_materialize: פריט שלא נוצר ⇒ שורת «לא נוצרה» לפריט ולאדם. המפתח:
 * flow:{runId}:{itemKey}:{role}[:confirm]. ‼ לעולם לא מפילה את הפעולה שקראה — כשל ברישום
 * נרשם ביומן, והפריט נשאר בשורת הדילוג כמו קודם. מחזירה {problem, problemStepId} או {}.
 */
create or replace function public._flow_record_creation_problem(p_run public.flow_runs, p_stage jsonb, p_item jsonb,
  p_role text, p_reason text, p_title text default null, p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_office uuid;
  v_title  text := nullif(trim(coalesce(p_title, '')), '');
  v_res    jsonb;
begin
  if public._creation_problem_class(p_reason) is null then return '{}'::jsonb; end if;
  if v_title is null then
    select office_id into v_office from public.profiles where id = p_run.user_id;
    -- ‼ אותו שם כמו בבונה (itemTitle ב-features/flows/compile.ts): מהספרייה, ואם נמחק משם — מהעותק.
    v_title := case p_item->'ref'->>'kind'
      when 'template' then coalesce(nullif((public._library_template(v_office, p_item->'ref'->>'templateId')).name, ''),
                                    nullif(p_item->'snapshot'->>'title', ''), 'בקשה שנמחקה מהספרייה')
      when 'document' then coalesce(nullif(public._document_request_payload(p_run.user_id, p_item->'ref'->>'docId')->>'title', ''),
                                    nullif(p_item->'snapshot'->>'title', ''), 'מסמך שנמחק מהספרייה')
      else coalesce(nullif(p_item->'snapshot'->>'title', ''), 'בקשה') end;
  end if;
  if p_confirm then v_title := 'אישור אישי — ' || v_title; end if;
  v_res := public._record_creation_problem(p_run.client_id, p_run.engagement_id, jsonb_build_object(
    'key', 'flow:' || p_run.id || ':' || (p_item->>'key') || ':' || coalesce(p_role, 'client')
           || case when p_confirm then ':confirm' else '' end,
    'source', 'flow', 'reason', p_reason, 'runId', p_run.id, 'stageKey', p_stage->>'key',
    'itemKey', p_item->>'key', 'role', coalesce(p_role, 'client'), 'ref', p_item->'ref', 'itemTitle', v_title,
    'subjectName', case when p_role = 'spouse' then p_run.facts->>'spouseFirstName' end),
    -- ‼ כמו הבקשה עצמה: רק מסלול הקליטה חוסם את סגירת הקליטה, ורק פריט חובה.
    p_run.trigger = 'quote_approved' and coalesce(p_item->>'optional', 'false') <> 'true');
  if not coalesce((v_res->>'ok')::boolean, false) then return '{}'::jsonb; end if;
  return jsonb_build_object('problem', true, 'problemStepId', v_res->>'stepId');
exception when others then
  begin
    perform public.log_onboarding_event(p_run.user_id, null, p_run.engagement_id, 'note', 'system',
      'בקשה במסלול לא נוצרה, וגם לא נרשמה ברשימת הבקשות: «' || coalesce(v_title, p_item->>'key', 'בקשה') || '»',
      jsonb_build_object('flowRunId', p_run.id, 'itemKey', p_item->>'key', 'reason', p_reason, 'error', left(sqlerrm, 200)));
  exception when others then null;
  end;
  return '{}'::jsonb;
end;
$$;

-- ── 2 · סוג העוסק של התקשרות ───────────────────────────────────────────────
/**
 * תבנית ההצעה, ואחריה הכרטיס (resolve_client_kind). ‼ תבנית «מותאמת» אינה סוג: הסוג מהכרטיס
 * בלבד — ובלעדיו null. אין יותר «עוסק מורשה» כברירת מחדל (resolve_journey_default_kind).
 */
create or replace function public._engagement_kind(p_quotation_id text, p_client_id text)
returns text language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_kind text;
  c      public.clients%rowtype;
begin
  v_kind := public.resolve_client_kind(p_quotation_id, p_client_id);
  if v_kind = 'custom' then
    select * into c from public.clients where id = p_client_id;
    v_kind := case when c.dealer_type = 'company' then 'company'
                   when c.dealer_type = 'licensed' or c.vat_status = 'authorizedDealer' then 'licensed_dealer'
                   when c.dealer_type = 'exempt' or c.vat_status = 'exemptDealer' then 'exempt_dealer' end;
  end if;
  return v_kind;
end;
$$;

-- ── 3 · בקשת משרד של הקליטה — יצירה במקום אחד ──────────────────────────────
/**
 * גוף הלולאה של המחולל (216) שהוצא החוצה בלי שינוי בהתנהגות, כדי ש«צור שוב» ייצור בדיוק
 * כמו האישור: הנוסח העדכני מהספרייה (או מהעותק אם נמחקה), הבעלים מהספרייה, מסמך שהוסר —
 * לא נוצר. מחזירה {ok, stepId, title} או {ok:false, reason, ref, title}; attempted = הגיע
 * לניסיון היצירה (או, בהרצה יבשה, היה נוצר) — כך «planned» של המחולל לא משתנה.
 */
create or replace function public._onboarding_office_default_create(p_e public.engagements, p_entry jsonb,
  p_office uuid, p_facts jsonb, p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_payload jsonb;
  v_owner   text := 'client';
  v_tpl     public.journey_templates%rowtype;
  v_title   text;
  v_ref     jsonb;
  v_res     jsonb;
  v_type    text := coalesce(nullif(p_entry->>'stepType', ''), 'custom_request');
  v_exist   text;
begin
  -- 216: תנאי העובדות של מסלול הקליטה (למשל «נשוי/אה»). סוגי לקוח כבר
  -- סוננו בתרגום לרשימה של כל סוג.
  if not public.flow_when_matches(p_entry->'when', p_facts) then
    return jsonb_build_object('ok', false, 'reason', 'not_applicable');
  end if;
  v_payload := p_entry->'payload';
  v_title := coalesce(nullif(p_entry->'payload'->>'title', ''), nullif(p_entry->'payload'->>'clientTitle', ''));
  -- 216: בקשה מהספרייה - הנוסח העדכני שלה, של המשרד או מובנית (ואם המשרד
  -- התאים מובנית — ההתאמה שלו, _library_template). העותק שבצילום משמש רק
  -- אם היא נמחקה. ‼ הבעלים מהספרייה: משימה של המשרד נשארת משימה של המשרד —
  -- לא בקשה ללקוח בדף ובמייל.
  if nullif(p_entry->>'templateId', '') is not null then
    v_ref := jsonb_build_object('kind', 'template', 'templateId', p_entry->>'templateId');
    v_tpl := public._library_template(p_office, p_entry->>'templateId');
    if v_tpl.id is not null then
      v_payload := coalesce(v_tpl.entries->0->'payload', v_payload);
      -- ‼ 217 (D): כלל אחד לבעלים של רשומה בספרייה (_template_entry_owner, 216 §9).
      v_owner := public._template_entry_owner(v_tpl.entries->0);
      v_title := coalesce(nullif(v_tpl.name, ''), v_title);
    end if;
    v_payload := coalesce(v_payload, p_entry->'payload');
  elsif nullif(p_entry->>'documentId', '') is not null then
    v_ref := jsonb_build_object('kind', 'document', 'docId', p_entry->>'documentId');
    -- ‼ קובץ שהוסר מהספרייה ⇒ הבקשה לא נוצרת (כך המסך מבטיח).
    v_payload := public._document_request_payload(p_e.user_id, p_entry->>'documentId');
    if v_payload is null then
      return jsonb_build_object('ok', false, 'reason', 'library_item_missing', 'ref', v_ref,
                                'title', coalesce(v_title, 'מסמך שנמחק מהספרייה'));
    end if;
    v_title := coalesce(nullif(v_payload->>'title', ''), v_title);
  end if;
  -- תצורה חסרה ⇒ אין מה לבקש. ‼ 217: לא בשקט — בקשה שנמחקה מהספרייה בלי עותק, או ריקה.
  if v_payload is null or jsonb_typeof(v_payload) <> 'object' or v_payload = '{}'::jsonb then
    return jsonb_build_object('ok', false,
      'reason', case when v_ref->>'kind' = 'template' and v_tpl.id is null then 'library_item_missing' else 'missing_payload' end,
      'ref', v_ref,
      'title', coalesce(v_title, case when v_ref->>'kind' = 'template' and v_tpl.id is null
                                      then 'בקשה שנמחקה מהספרייה' else 'בקשה של המשרד' end));
  end if;
  v_title := coalesce(v_title, nullif(v_payload->>'title', ''), nullif(v_payload->>'clientTitle', ''), 'בקשה של המשרד');
  -- ‼ 217 (D): משימה של המשרד נולדת מסומנת — לא בדף של הלקוח ולא במייל.
  if v_type = 'custom_request' and v_owner = 'me' and coalesce(v_payload->>'messageOnly', '') <> 'true' then
    v_payload := v_payload || jsonb_build_object('internalTask', true);
  end if;
  if p_dry_run then
    return jsonb_build_object('ok', true, 'dryRun', true, 'attempted', true, 'stepType', v_type, 'title', v_title);
  end if;

  -- ‼ 217: תקלה ביצירה (שגיאה, לא קוד) לא מפילה את אישור ההצעה — נרשמת כ«לא נוצרה».
  begin
    v_res := public.create_onboarding_request(
      p_e.client_id,
      v_type,
      v_payload || jsonb_build_object('defaultOrigin',
        jsonb_build_object('key', p_entry->>'key', 'kind', 'office_default')),
      p_due_date => case when (p_entry->>'dueInDays') ~ '^\d{1,3}$'
                         then current_date + (p_entry->>'dueInDays')::int end,
      p_depends_on => null,
      p_published => true,
      p_required_for_close => coalesce(p_entry->>'requiredForClose', 'true') <> 'false',
      p_owner => v_owner,
      p_stage_id => null);
  exception when others then
    return jsonb_build_object('ok', false, 'attempted', true, 'reason', 'create_failed',
                              'detail', left(sqlerrm, 200), 'ref', v_ref, 'title', v_title);
  end;

  if coalesce((v_res->>'ok')::boolean, false) then
    update public.onboarding_steps
       set sort_order = case when (p_entry->>'sortIndex') ~ '^-?\d{1,9}$' then (p_entry->>'sortIndex')::int else 0 end
     where id = v_res->>'stepId';
    return jsonb_build_object('ok', true, 'attempted', true, 'stepId', v_res->>'stepId', 'title', v_title);
  end if;
  if v_res->>'error' = 'step_type_exists' then
    -- ‼ 217: זו שתפסה את המקום בקליטה הזו (סוג «לכל התקשרות» — לא אחת שהושלמה בהתקשרות קודמת).
    v_exist := public._step_type_taken(p_e.client_id, v_type, p_e.id);
    return jsonb_build_object('ok', false, 'attempted', true, 'reason', 'step_type_exists', 'stepId', v_exist, 'title', v_title);
  end if;
  return jsonb_build_object('ok', false, 'attempted', true, 'reason', coalesce(nullif(v_res->>'error', ''), 'create_failed'),
                            'ref', v_ref, 'title', v_title);
end;
$$;

-- ── 4 · «צור שוב» ───────────────────────────────────────────────────────────
/**
 * מנסה שוב ליצור את הבקשה של שורת «לא נוצרה». ממסלול — אותה פעולה כמו «＋ בקשה ללקוח
 * הזה» (flow_run_add_items: בעלות, נעילות, עובדות עדכניות, יומן, התקדמות ומייל). מהקליטה —
 * אותה יצירה כמו באישור (_onboarding_office_default_create), ואז הצמדה למסלול הקליטה.
 * מחזירה {ok, resolved, how?, stepId?, reason?} (נסגרה: how + reason exists|not_applicable;
 * נוצרה: stepId) או {ok:false, error: not_a_problem |
 * entry_not_found | not_running | forbidden}. ‼ resolved=false ⇒ אותה שורה, הסיבה עודכנה.
 */
create or replace function public.retry_request_creation(p_step_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid    uuid := auth.uid();
  s        public.onboarding_steps%rowtype;
  c        public.clients%rowtype;
  v_cp     jsonb;
  r        public.flow_runs%rowtype;
  e        public.engagements%rowtype;
  v_entry  jsonb;
  v_office uuid;
  v_res    jsonb;
  v_def    jsonb;
begin
  if v_uid is null or not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'not_a_problem'); end if;
  select * into c from public.clients where id = s.client_id;
  if c.id is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select * into s from public.onboarding_steps where id = p_step_id for update;
  if not (s.payload ? 'creationProblem') or s.status in ('completed', 'verified', 'skipped', 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'not_a_problem');
  end if;
  v_cp := s.payload->'creationProblem';

  if coalesce(v_cp->>'source', 'flow') = 'flow' then
    select * into r from public.flow_runs where id = v_cp->>'runId';
    if r.id is null or r.status not in ('active', 'paused') then
      return jsonb_build_object('ok', false, 'error', 'not_running');
    end if;
    v_def := public._flow_def(r.flow_id, r.flow_version);
    if not exists (select 1 from jsonb_array_elements(v_def->'stages') st, jsonb_array_elements(st->'items') it
                    where it->>'key' = v_cp->>'itemKey') then
      return jsonb_build_object('ok', false, 'error', 'entry_not_found');
    end if;
    v_res := public.flow_run_add_items(r.id, array[v_cp->>'itemKey'],
               case when nullif(v_cp->>'role', '') is not null then array[v_cp->>'role'] end);
    if not coalesce((v_res->>'ok')::boolean, false) then
      return jsonb_build_object('ok', false, 'error', coalesce(v_res->>'error', 'not_running'));
    end if;
  else
    select * into e from public.engagements where id = v_cp->>'engagementId' and client_id = c.id;
    if e.id is not null then
      select x into v_entry
        from jsonb_array_elements(case when jsonb_typeof(e.journey_default_snapshot) = 'array'
                                       then e.journey_default_snapshot else '[]'::jsonb end) x
       where x->>'key' = v_cp->>'entryKey'
       limit 1;
    end if;
    if e.id is null or v_entry is null then return jsonb_build_object('ok', false, 'error', 'entry_not_found'); end if;
    select office_id into v_office from public.profiles where id = e.user_id;
    v_res := public._onboarding_office_default_create(e, v_entry, v_office,
               case when jsonb_typeof(e.journey_default_facts) = 'object' then e.journey_default_facts else '{}'::jsonb end, false);
    if coalesce((v_res->>'ok')::boolean, false) then
      -- ‼ קודם ההצמדה למסלול הקליטה (השלב והקשתות חלים על הבקשה החדשה), ורק אז סגירת
      -- השורה — סגירה לפני כן הייתה משחררת את מה שמחכה לשלב בזמן שהבקשה עוד פתוחה.
      if e.status = 'onboarding' then
        perform public._attach_onboarding_flow_run_safe(e.id, false);
      end if;
      perform public._resolve_creation_problem(c.id, v_cp->>'key', v_res->>'stepId', 'created');
    elsif v_res->>'reason' = 'step_type_exists' then
      perform public._resolve_creation_problem(c.id, v_cp->>'key', v_res->>'stepId', 'exists');
    elsif v_res->>'reason' = 'not_applicable' then
      perform public._resolve_creation_problem(c.id, v_cp->>'key', null, 'not_applicable');
    else
      perform public._record_creation_problem(c.id, e.id,
        v_cp || jsonb_strip_nulls(jsonb_build_object('reason', v_res->>'reason',
                  'itemTitle', coalesce(nullif(v_res->>'title', ''), v_cp->>'itemTitle'), 'ref', v_res->'ref')),
        s.required_for_close);
    end if;
  end if;

  select * into s from public.onboarding_steps where id = p_step_id;
  if s.status in ('cancelled', 'skipped', 'completed', 'verified') then
    -- how: created | exists | not_applicable. reason — אותו מידע בקוד שהמסך מכיר
    -- (retryCreationText: «כבר קיימת» / «לא חלה עוד»); בבקשה שנוצרה — stepId בלבד.
    return jsonb_strip_nulls(jsonb_build_object('ok', true, 'resolved', true,
      'how', s.payload->'creationProblem'->>'resolvedHow',
      'reason', case s.payload->'creationProblem'->>'resolvedHow'
                  when 'exists' then 'exists' when 'not_applicable' then 'not_applicable' end,
      'stepId', s.payload->'creationProblem'->>'resolvedStepId'));
  end if;
  return jsonb_build_object('ok', true, 'resolved', false, 'reason', s.payload->'creationProblem'->>'reason',
                            'attempts', s.payload->'creationProblem'->'attempts');
end;
$$;

-- ── 5 · תנאי במסלול כשסוג העוסק לא ידוע ─────────────────────────────────────
/**
 * true = הסוג לא ידוע, והתנאי תלוי בו בין שלושת הסוגים שהכרטיס מבטא (עוסק פטור, עוסק
 * מורשה, חברה) — או בעובדה «מורשה», שנגזרת ממנו — ושאר התנאי עדיין יכול להתקיים. אז
 * לא «לא חל» (זה היה סופי) ולא ניחוש: מחכים לסוג (kind_unknown / waitingKind).
 */
create or replace function public._flow_kind_waits(p_when jsonb, p_facts jsonb)
returns boolean language sql immutable set search_path to 'public' as $$
  select coalesce(jsonb_typeof(p_when) = 'object', false)
     and nullif(coalesce(p_facts->>'kind', ''), '') is null
     and ((select count(distinct k)
             from jsonb_array_elements_text(case when jsonb_typeof(p_when->'kinds') = 'array'
                                                 then p_when->'kinds' else '[]'::jsonb end) k
            where k in ('licensed_dealer', 'exempt_dealer', 'company')) between 1 and 2
          or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p_when->'facts') = 'array'
                                                             then p_when->'facts' else '[]'::jsonb end) f
                      where f->>'key' = 'licensed'))
     and (public.flow_when_matches(p_when - 'kinds', coalesce(p_facts, '{}'::jsonb) || '{"licensed":true}'::jsonb)
          or public.flow_when_matches(p_when - 'kinds', coalesce(p_facts, '{}'::jsonb) || '{"licensed":false}'::jsonb));
$$;

/**
 * flow_when_matches, כשסוג העוסק לא ידוע: רשימת סוגים שכוללת את שלושת הסוגים שבכרטיס
 * חלה בכל מקרה («לכולם חוץ מהחזר מס»). ‼ flow_when_matches עצמה לא משתנה — אותה סמנטיקה
 * כמו conditions.ts (whenCases.json).
 */
create or replace function public._flow_when_matches_kind(p_when jsonb, p_facts jsonb)
returns boolean language sql immutable set search_path to 'public' as $$
  select public.flow_when_matches(p_when,
    case when nullif(coalesce(p_facts->>'kind', ''), '') is null
              and coalesce(jsonb_typeof(p_when), '') = 'object'
              and (select count(distinct k)
                     from jsonb_array_elements_text(case when jsonb_typeof(p_when->'kinds') = 'array'
                                                         then p_when->'kinds' else '[]'::jsonb end) k
                    where k in ('licensed_dealer', 'exempt_dealer', 'company')) = 3
         then coalesce(p_facts, '{}'::jsonb) || '{"kind":"licensed_dealer"}'::jsonb
         else p_facts end);
$$;

-- ── 6 · מה מחכה לסוג העוסק ─────────────────────────────────────────────────
/**
 * המפתחות ששונים בין שלוש הרשימות של המשרד (עוסק פטור, עוסק מורשה, חברה — ובלי רשימה
 * של המשרד: ברירת המחדל של הקוד): חסר/כבוי באחת, תוכן אחר (בלי הסדר), תנאי או גרסה לפי
 * «מורשה», וחיבור פייפרלס לרשות המסים (תלוי ב«מורשה» בקוד המחולל). וגם מה שתלוי באחד
 * מהם — dependsOn ברשימות, ו«נפתח אחרי» בתוך השלב במסלול הקליטה (בקשת משרד: הקשת נוצרת
 * רק בהצמדה) — אחרת היה נפתח בלי הורה. מחזירה {keys, lists} — lists רק המפתחות
 * האלה, כפי שהם עכשיו (מוקפאים באישור; שינוי במסלול חל על חדשים בלבד).
 * ‼ החזר מס וייצוג בלבד מגיעים רק מתבנית ההצעה — לא מהכרטיס — ולכן אינם מועמדים.
 */
create or replace function public._kind_dependent_entries(p_office uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_kinds text[] := array['licensed_dealer', 'exempt_dealer', 'company'];
  v_lists jsonb := '{}'::jsonb;
  v_list  jsonb;
  k       text;
  v_keys  text[];
  v_more  text[];
  v_more2 text[];
  v_def   jsonb;
  v_out   jsonb := '{}'::jsonb;
begin
  foreach k in array v_kinds loop
    v_list := null;
    if p_office is not null then
      select d.entries into v_list from public.office_journey_defaults d
       where d.office_id = p_office and d.client_kind = k;
    end if;
    if v_list is null or jsonb_typeof(v_list) <> 'array' then
      v_list := public.default_journey_entries(k);
    end if;
    v_lists := v_lists || jsonb_build_object(k, v_list);
  end loop;

  with ent as (
    select l.key as kind, e.value as v, coalesce(nullif(e.value->>'key', ''), e.value->>'stepType') as ekey
      from jsonb_each(v_lists) l, jsonb_array_elements(l.value) e
     where coalesce(nullif(e.value->>'key', ''), nullif(e.value->>'stepType', '')) is not null
  ), ks as (select distinct ekey from ent)
  select coalesce(array_agg(ks.ekey), '{}') into v_keys
    from ks
   where (select count(distinct coalesce(
                   (select (x.v - 'sortIndex' - 'enabled')::text from ent x
                     where x.kind = kk and x.ekey = ks.ekey and coalesce(x.v->>'enabled', 'true') <> 'false'
                     limit 1), '-'))
            from unnest(v_kinds) kk) > 1
      or exists (select 1 from ent x
                  where x.ekey = ks.ekey and coalesce(x.v->>'enabled', 'true') <> 'false'
                    and (x.v->>'stepType' = 'paperless_tax_authority'
                         or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(x.v->'when'->'facts') = 'array'
                                                                            then x.v->'when'->'facts' else '[]'::jsonb end) f
                                     where f->>'key' = 'licensed')
                         or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(x.v->'variants') = 'array'
                                                                            then x.v->'variants' else '[]'::jsonb end) vv
                                     where vv->>'fact' = 'licensed')));

  -- מסלול הקליטה הפעיל — ל«נפתח אחרי» של בקשות המשרד (המפתח ברשימה: סוג לבקשת מערכת,
  -- entryKey/key לבקשת משרד — כמו compileOnboarding).
  if p_office is not null then
    select v.definition into v_def
      from public.office_flows f
      join public.office_flow_versions v on v.flow_id = f.id and v.version = f.current_version
     where f.office_id = p_office and f.trigger = 'quote_approved' and f.status = 'active'
     limit 1;
  end if;

  -- סגירה: מה שנפתח אחרי משהו שמוחזק — מוחזק גם הוא.
  loop
    select coalesce(array_agg(distinct coalesce(nullif(e.value->>'key', ''), e.value->>'stepType')), '{}') into v_more
      from jsonb_each(v_lists) l, jsonb_array_elements(l.value) e
     where nullif(e.value->>'dependsOn', '') is not null
       and not (coalesce(nullif(e.value->>'key', ''), e.value->>'stepType') = any (v_keys))
       and exists (select 1 from jsonb_each(v_lists) l2, jsonb_array_elements(l2.value) e2
                    where coalesce(nullif(e2.value->>'key', ''), e2.value->>'stepType') = any (v_keys)
                      and e2.value->>'stepType' = e.value->>'dependsOn');
    select coalesce(array_agg(distinct case when i->'ref'->>'kind' = 'system' then i->'ref'->>'stepType'
                                            else coalesce(nullif(i->>'entryKey', ''), i->>'key') end), '{}')
      into v_more2
      from jsonb_array_elements(case when jsonb_typeof(v_def->'stages') = 'array' then v_def->'stages' else '[]'::jsonb end) st,
           jsonb_array_elements(case when jsonb_typeof(st->'items') = 'array' then st->'items' else '[]'::jsonb end) i
     where nullif(i->>'after', '') is not null
       and coalesce(i->'ref'->>'kind', '') <> 'action'
       and not (case when i->'ref'->>'kind' = 'system' then i->'ref'->>'stepType'
                     else coalesce(nullif(i->>'entryKey', ''), i->>'key') end = any (v_keys || v_more))
       and exists (select 1
                     from jsonb_array_elements(v_def->'stages') st2,
                          jsonb_array_elements(case when jsonb_typeof(st2->'items') = 'array' then st2->'items' else '[]'::jsonb end) a
                    where a->>'key' = i->>'after'
                      and case when a->'ref'->>'kind' = 'system' then a->'ref'->>'stepType'
                               else coalesce(nullif(a->>'entryKey', ''), a->>'key') end = any (v_keys));
    v_more := array(select distinct x from unnest(v_more || v_more2) x where x is not null);
    exit when coalesce(array_length(v_more, 1), 0) = 0;
    v_keys := v_keys || v_more;
  end loop;

  foreach k in array v_kinds loop
    v_out := v_out || jsonb_build_object(k, coalesce((
      select jsonb_agg(e order by o) from jsonb_array_elements(v_lists->k) with ordinality as t(e, o)
       where coalesce(nullif(e->>'key', ''), e->>'stepType') = any (v_keys)), '[]'::jsonb));
  end loop;
  return jsonb_build_object('keys', to_jsonb(v_keys), 'lists', v_out);
end;
$$;

/** שורה ב«מה מחכה לסוג העוסק»: {key, stepType, source, title} — בשמות שהמשרד רואה ב«בקשות». */
create or replace function public._kind_hold_entry(p_entry jsonb, p_office uuid, p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_type  text := coalesce(nullif(p_entry->>'stepType', ''), 'custom_request');
  v_src   text := coalesce(nullif(p_entry->>'source', ''), 'system');
  v_title text;
begin
  if v_src = 'office' then
    v_title := coalesce(
      case when nullif(p_entry->>'templateId', '') is not null
           then nullif((public._library_template(p_office, p_entry->>'templateId')).name, '') end,
      case when nullif(p_entry->>'documentId', '') is not null
           then nullif(public._document_request_payload(p_user_id, p_entry->>'documentId')->>'title', '') end,
      nullif(p_entry->'payload'->>'title', ''), nullif(p_entry->'payload'->>'clientTitle', ''), 'בקשה של המשרד');
  else
    -- ‼ השם של השורה ב«בקשות» (rowTitle ב-OnboardingTab): שם שניתן לבקשה, ואחרת
    -- STEP_TYPE_LABELS (src/types/onboarding.ts) — כל הסוגים, כדי שלעולם לא יחזור ריק.
    -- ‼ לא _client_step_title: הרשימה מוצגת למשרד (תיק מס, המגש), ושם הלקוח כתוב בגוף
    --   שני («פרטי רואה החשבון הקודם שלך») או כללי («בקשה מהמשרד» ל«עדכון סטטוס מס»).
    v_title := coalesce(nullif(btrim(coalesce(p_entry->'payload'->>'title', '')), ''), case v_type
      when 'representation' then 'ייצוג מול הרשויות'
      when 'representation_upgrade' then 'שדרוג לייצוג ראשי'
      when 'rep_client_approval' then 'אישור הייצוג באזור האישי'
      when 'file_opening' then 'פתיחת תיקים ברשויות'
      when 'release_letter' then 'מכתב העברת טיפול לרו״ח הקודם'
      when 'materials_received' then 'קבלת חומרים מהרו״ח הקודם'
      when 'paperless_invite' then 'הרשמה לפייפרלס'
      when 'paperless_connection' then 'חיבור לפייפרלס'
      when 'paperless_tax_authority' then 'חיבור פייפרלס לרשות המסים'
      when 'data_import' then 'ייבוא היסטוריה'
      when 'data_verification' then 'אימות הנתונים'
      when 'retainer_authorization' then 'הרשאה לתשלום חודשי'
      when 'internal_setup' then 'הקמה פנימית'
      when 'kyc_identification' then 'הכרת הלקוח'
      when 'first_month_review' then 'ביקורת חודש ראשון'
      when 'intake_questionnaire' then 'עדכון סטטוס מס'
      when 'client_documents' then 'מסמכים מהלקוח'
      when 'prev_accountant_details' then 'פרטי הרו״ח הקודם'
      when 'institution_alignment_btl' then 'יישור קו · ביטוח לאומי'
      when 'institution_alignment_vat' then 'יישור קו · מע״מ'
      when 'institution_alignment_income' then 'יישור קו · מס הכנסה'
      when 'opening_call' then 'שיחת פתיחה'
      when 'authority_representation' then 'ייצוג ברשות'
      else 'בקשה מהמשרד' end);
  end if;
  return jsonb_build_object('key', coalesce(nullif(p_entry->>'key', ''), v_type), 'stepType', v_type,
                            'source', v_src, 'title', v_title);
end;
$$;

-- ── 7 · כשהסוג נקבע — פותחים את מה שחיכה ───────────────────────────────────
/**
 * לכל התקשרות של הלקוח שמחכה לסוג (נעולה FOR UPDATE): הסוג מהכרטיס (או מהתבנית); עדיין
 * לא ידוע ⇒ כלום. התקשרות שכבר לא בקליטה/פעילה ⇒ נסגר בלי ליצור (הכרעה ל-Guy). אחרת:
 * הצילום = הישן בלי המפתחות שחיכו + הרשימה של הסוג שנקבע כפי שהוקפאה באישור; העובדות
 * מקבלות את הסוג; resolvedAt נכתב **לפני** המחולל; המחולל רץ רק על המפתחות שחיכו
 * (pivo.generator_only_keys); מסלול הקליטה מקבל את הסוג (רק אם היה ריק) ומוצמד שוב;
 * בקשה חדשה בשלב «מחכה לאישורך» אחרי שהדף נפתח — טיוטה; בשלב «לבד» — מייל בתור.
 * ‼ אידמפוטנטית: resolvedAt + הנעילה ⇒ טריגר כפול או שתי לשוניות לא יוצרים שוב, ובקשות
 * המערכת/המשרד נבדקות לפי סוג/מפתח (כולל מבוטלות).
 */
create or replace function public.release_kind_hold(p_client_id text, p_actor text default 'system')
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  c        public.clients%rowtype;
  e        public.engagements%rowtype;
  v_kind   text;
  v_label  text;
  v_keys   text[];
  v_held_keys text[];
  v_snap   jsonb;
  v_before text[];
  s        record;
  v_created jsonb;
  v_na     jsonb;
  v_run    public.flow_runs%rowtype;
  v_auto   boolean;
  v_key    text;
  v_n_created int := 0;
  v_n_na   int := 0;
  v_n_eng  int := 0;
  v_actor  text := case when p_actor in ('accountant', 'client', 'system') then p_actor else 'system' end;
  v_runid  text;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;

  for e in select * from public.engagements
            where client_id = c.id and jsonb_typeof(kind_hold) = 'object' and kind_hold->>'resolvedAt' is null
            order by created_at
            for update loop
    v_kind := public._engagement_kind(e.quotation_id, c.id);
    continue when v_kind is null;
    v_n_eng := v_n_eng + 1;
    v_label := case v_kind when 'licensed_dealer' then 'עוסק מורשה' when 'exempt_dealer' then 'עוסק פטור'
                           when 'company' then 'חברה' else v_kind end;
    v_keys := coalesce((select array_agg(x) from jsonb_array_elements_text(
                case when jsonb_typeof(e.kind_hold->'keys') = 'array' then e.kind_hold->'keys' else '[]'::jsonb end) x), '{}');
    v_held_keys := coalesce((select array_agg(h->>'key') from jsonb_array_elements(
                     case when jsonb_typeof(e.kind_hold->'held') = 'array' then e.kind_hold->'held' else '[]'::jsonb end) h), '{}');

    if e.status not in ('onboarding', 'active') then
      update public.engagements
         set kind_hold = (kind_hold - 'failedAt' - 'error') || jsonb_build_object('resolvedAt', now(), 'resolvedKind', v_kind,
               'created', '[]'::jsonb, 'notApplicable', to_jsonb(v_held_keys), 'closedWithoutCreating', true)
       where id = e.id;
      perform public.log_onboarding_event(e.user_id, null, e.id, 'note', v_actor,
        'סוג העוסק נקבע: ' || v_label || ' - ההתקשרות כבר לא בקליטה, ולכן הבקשות שחיכו לו לא נפתחו',
        jsonb_build_object('kindHoldEvent', 'released', 'kind', v_kind, 'created', 0));
      continue;
    end if;

    v_snap := coalesce((select jsonb_agg(x order by o)
                          from jsonb_array_elements(case when jsonb_typeof(e.journey_default_snapshot) = 'array'
                                                         then e.journey_default_snapshot else '[]'::jsonb end) with ordinality as t(x, o)
                         where not (coalesce(nullif(x->>'key', ''), x->>'stepType', '') = any (v_keys))), '[]'::jsonb)
              || coalesce(case when jsonb_typeof(e.kind_hold->'lists'->v_kind) = 'array' then e.kind_hold->'lists'->v_kind end,
                          '[]'::jsonb);
    update public.engagements
       set journey_default_snapshot = v_snap,
           journey_default_facts = coalesce(journey_default_facts, '{}'::jsonb)
             || jsonb_build_object('kind', v_kind, 'licensed', v_kind in ('licensed_dealer', 'company'),
                                   'kindFallback', false, 'kindPending', false),
           kind_hold = (kind_hold - 'failedAt' - 'error') || jsonb_build_object('resolvedAt', now(), 'resolvedKind', v_kind)
     where id = e.id;

    select coalesce(array_agg(id), '{}') into v_before from public.onboarding_steps where client_id = c.id;
    perform set_config('pivo.generator_only_keys', array_to_string(v_keys, ','), true);
    perform public.generate_onboarding_steps(e.id, false);
    perform set_config('pivo.generator_only_keys', '', true);
    if 'intake_questionnaire' = any (v_keys) then
      perform public.add_intake_questionnaire_step(e.id);
    end if;

    -- מסלול הקליטה: הסוג נכתב רק אם היה ריק (לא דורסים סוג ידוע), ואז הצמדה מחדש.
    v_run := null;
    select * into v_run from public.flow_runs
     where engagement_id = e.id and trigger = 'quote_approved' and status in ('active', 'paused')
     order by started_at desc limit 1
     for update;
    if v_run.id is not null and nullif(coalesce(v_run.facts->>'kind', ''), '') is null then
      update public.flow_runs
         set facts = facts || jsonb_build_object('kind', v_kind, 'licensed', v_kind in ('licensed_dealer', 'company')),
             updated_at = now()
       where id = v_run.id;
    end if;
    if e.status = 'onboarding' then
      perform public.attach_onboarding_flow_run(e.id, false);
    end if;

    v_created := '[]'::jsonb;
    v_auto := false;
    -- ‼ created = רק מה שהשחרור הזה פתח: לא היה לפניו (v_before), נוצר בטרנזקציה הזו
    -- (created_at = now() — שורה שנוספה במקביל מטרנזקציה אחרת אינה «נפתחה עכשיו»), ולא בוטל.
    for s in select st.id, st.step_type, st.payload, st.status, st.flow_run_id, st.published_at
               from public.onboarding_steps st
              where st.client_id = c.id and not (st.id = any (v_before))
                and st.created_at = now() and st.status <> 'cancelled'
                and not (st.payload ? 'creationProblem')
              order by st.created_at, st.id loop
      v_key := coalesce(s.payload->'defaultOrigin'->>'key', s.step_type);
      v_created := v_created || jsonb_build_object('key', v_key, 'stepId', s.id);
      if v_run.id is not null and s.flow_run_id = v_run.id
         and s.status not in ('completed', 'verified', 'skipped', 'cancelled') then
        -- «מחכה לאישורך» אחרי שהדף כבר נפתח — טיוטה עד שתאשר (כמו בעדכון מסלול, 215).
        -- ‼ «הדף נפתח» — השער ברמת הלקוח (client_process_published), לא הדגל של ההתקשרות לבדה.
        -- הבקשה נוצרה עכשיו (אחרי כל קליטה), ולכן זו גם התשובה של השער שלה (client_step_gate_open).
        if coalesce(s.payload->>'delivery', '') = 'hold' and public.client_process_published(c.id)
           and s.published_at is not null then
          update public.onboarding_steps set published_at = null where id = s.id;
        elsif coalesce(s.payload->>'delivery', '') = 'auto' and s.published_at is not null and s.status <> 'locked' then
          v_auto := true;
        end if;
      end if;
    end loop;
    if v_auto and v_run.id is not null and v_run.status = 'active' then
      perform public.enqueue_client_notice(c.id, 'new', now() + interval '2 minutes');
    end if;
    if v_run.id is not null then
      perform public._flow_progress_safe(v_run.id);
    end if;

    select coalesce(jsonb_agg(k), '[]'::jsonb) into v_na
      from unnest(v_held_keys) k
     where not exists (select 1 from jsonb_array_elements(v_created) x where x->>'key' = k);
    update public.engagements
       set kind_hold = kind_hold || jsonb_build_object('created', v_created, 'notApplicable', v_na)
     where id = e.id;
    v_n_created := v_n_created + jsonb_array_length(v_created);
    v_n_na := v_n_na + jsonb_array_length(v_na);
    perform public.log_onboarding_event(e.user_id, null, e.id, 'note', v_actor,
      'סוג העוסק נקבע: ' || v_label || ' - '
        || case jsonb_array_length(v_created)
             when 0 then 'אף בקשה שחיכתה לסוג העוסק לא מתאימה ל' || v_label || ', ולכן לא נפתח דבר'
             when 1 then 'נפתחה בקשה אחת שחיכתה לו'
             else 'נפתחו ' || jsonb_array_length(v_created) || ' בקשות שחיכו לו' end,
      jsonb_build_object('kindHoldEvent', 'released', 'kind', v_kind, 'created', v_created, 'notApplicable', v_na));
  end loop;

  -- נקלט כשהסוג לא ידוע ושום דבר לא חיכה לו: רק העובדות (ההתקשרות ומסלול הקליטה).
  for e in select * from public.engagements
            where client_id = c.id and kind_hold is null and status in ('onboarding', 'active')
              and coalesce(journey_default_facts->>'kindPending', 'false') = 'true'
            for update loop
    v_kind := public._engagement_kind(e.quotation_id, c.id);
    continue when v_kind is null;
    update public.engagements
       set journey_default_facts = journey_default_facts
             || jsonb_build_object('kind', v_kind, 'licensed', v_kind in ('licensed_dealer', 'company'),
                                   'kindFallback', false, 'kindPending', false)
     where id = e.id;
    v_runid := null;
    update public.flow_runs
       set facts = facts || jsonb_build_object('kind', v_kind, 'licensed', v_kind in ('licensed_dealer', 'company')),
           updated_at = now()
     where engagement_id = e.id and trigger = 'quote_approved' and status in ('active', 'paused')
       and nullif(coalesce(facts->>'kind', ''), '') is null
    returning id into v_runid;
    if v_runid is not null then
      perform public._flow_progress_safe(v_runid);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'engagements', v_n_eng, 'created', v_n_created, 'notApplicable', v_n_na);
end;
$$;

/**
 * עטיפה שאינה יכולה להפיל את שמירת הכרטיס (או את אישור ההצעה). כשל — גלוי: kind_hold.failedAt
 * (המגש מציע «לפתוח את הבקשות שחיכו» ⇒ retry_kind_hold) ושורה ב«פעילות».
 * ‼ בלי מייל למשרד: הכשל קורה בפעולה של המשרד עצמו (שמירת הכרטיס), והתוצאה מוצגת לו שם.
 */
create or replace function public._release_kind_hold_safe(p_client_id text, p_actor text default 'system')
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_err text;
  e     record;
begin
  return public.release_kind_hold(p_client_id, p_actor);
exception when others then
  v_err := left(sqlerrm, 200);
  begin
    for e in update public.engagements
                set kind_hold = kind_hold || jsonb_build_object('failedAt', now(), 'error', v_err)
              where client_id = p_client_id and jsonb_typeof(kind_hold) = 'object' and kind_hold->>'resolvedAt' is null
             returning id, user_id loop
      perform public.log_onboarding_event(e.user_id, null, e.id, 'note', 'system',
        'סוג העוסק נשמר, אבל הבקשות שחיכו לו לא נפתחו - אפשר לנסות שוב מהמגש שבראש «בקשות»',
        jsonb_build_object('kindHoldEvent', 'release_failed', 'error', v_err));
    end loop;
  exception when others then null;
  end;
  return jsonb_build_object('ok', false, 'error', 'release_failed');
end;
$$;

create or replace function public.trg_release_kind_hold()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(old.dealer_type, '') is distinct from coalesce(new.dealer_type, '')
     or coalesce(old.vat_status, '') is distinct from coalesce(new.vat_status, '') then
    -- ‼ לא נוגע בשום דבר כשאין מה לשחרר — הטריגר רץ על כל שינוי בסוג/סיווג.
    if exists (select 1 from public.engagements e
                where e.client_id = new.id
                  and ((jsonb_typeof(e.kind_hold) = 'object' and e.kind_hold->>'resolvedAt' is null)
                       or (e.kind_hold is null and e.status in ('onboarding', 'active')
                           and coalesce(e.journey_default_facts->>'kindPending', 'false') = 'true'))) then
      perform public._release_kind_hold_safe(new.id, case when auth.uid() is null then 'system' else 'accountant' end);
    end if;
  end if;
  return new;
exception when others then
  return new;
end;
$$;
-- ‼ «a_» — לפני sync_paperless_tax_authority_trg (טריגרים AFTER רצים לפי שם): השחרור קובע
-- קודם, ו-132 רואה שהבקשה כבר נפתחה (או שלא חלה) ואינו יוצר עותק שני.
drop trigger if exists a_release_kind_hold_trg on public.clients;
create trigger a_release_kind_hold_trg
  after update of dealer_type, vat_status on public.clients
  for each row execute function public.trg_release_kind_hold();

/** «לפתוח את הבקשות שחיכו» — אחרי כשל, או כשהסוג נקבע בדרך שלא הפעילה את הטריגר. */
create or replace function public.retry_kind_hold(p_client_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  c     public.clients%rowtype;
  v_res jsonb;
begin
  if v_uid is null or not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select * into c from public.clients where id = p_client_id;
  if c.id is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if not exists (select 1 from public.engagements e
                  where e.client_id = c.id and jsonb_typeof(e.kind_hold) = 'object' and e.kind_hold->>'resolvedAt' is null) then
    return jsonb_build_object('ok', true, 'created', 0, 'notApplicable', 0);
  end if;
  if not exists (select 1 from public.engagements e
                  where e.client_id = c.id and jsonb_typeof(e.kind_hold) = 'object' and e.kind_hold->>'resolvedAt' is null
                    and public._engagement_kind(e.quotation_id, c.id) is not null) then
    return jsonb_build_object('ok', false, 'error', 'kind_unknown');
  end if;
  v_res := public._release_kind_hold_safe(c.id, 'accountant');
  if not coalesce((v_res->>'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', coalesce(v_res->>'error', 'release_failed'));
  end if;
  return jsonb_build_object('ok', true, 'created', coalesce((v_res->>'created')::int, 0),
                            'notApplicable', coalesce((v_res->>'notApplicable')::int, 0));
end;
$$;

-- ── 8 · 132 — חיבור פייפרלס לרשות המסים כשהלקוח הופך למורשה ─────────────────
-- הגוף של 132 כפי שהוא, ועוד שני שערים לפני היצירה (‼ 217).
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
  v_last     public.engagements%rowtype;
  v_office   uuid;
  v_list     jsonb;
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

  -- ‼ 217: ההתקשרות האחרונה קובעת. סוג העוסק עוד מחכה שם (kind_hold) ⇒ השחרור פותח את
  -- הבקשה לפי מה שהמשרד הגדיר לסוג שנקבע (release_kind_hold) — לא כאן, ולא פעמיים.
  -- והמשרד כיבה את הבקשה (בצילום; ובצילום של סוג שאין בו את הבקשה — ברשימה של הסוג
  -- שעכשיו) ⇒ לא נפתחת.
  select * into v_last from public.engagements where client_id = p_client_id order by created_at desc limit 1;
  if v_last.id is not null then
    if jsonb_typeof(v_last.kind_hold) = 'object' and v_last.kind_hold->>'resolvedAt' is null then
      return jsonb_build_object('ok', true, 'action', 'kind_hold_pending');
    end if;
    if public.journey_default_entry(v_last.journey_default_snapshot, 'paperless_tax_authority') is not null then
      if not public.journey_default_enabled(v_last.journey_default_snapshot, 'paperless_tax_authority') then
        return jsonb_build_object('ok', true, 'action', 'disabled_by_office');
      end if;
    elsif jsonb_typeof(v_last.journey_default_snapshot) = 'array' then
      select office_id into v_office from public.profiles where id = c.user_id;
      select d.entries into v_list from public.office_journey_defaults d
       where d.office_id = v_office
         and d.client_kind = case when c.dealer_type = 'company' then 'company' else 'licensed_dealer' end;
      if v_list is not null and not public.journey_default_enabled(v_list, 'paperless_tax_authority') then
        return jsonb_build_object('ok', true, 'action', 'disabled_by_office');
      end if;
    end if;
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

-- ── 9 · 168 — מוכנות לסגירת הקליטה ─────────────────────────────────────────
-- הגוף של 168 כפי שהוא, ועוד kindHold (‼ 217): בקשות שמחכות לסוג העוסק עוד לא נפתחו —
-- הקליטה לא «מוכנה» עד שהסוג נקבע (והן נפתחות או מתבררות כלא רלוונטיות).
create or replace function public.onboarding_close_readiness(p_engagement_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  e public.engagements%rowtype;
  v_blocking jsonb;
  v_hold jsonb;
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'engagement_not_found'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'stepType', step_type, 'status', status, 'ball', ball)), '[]'::jsonb)
    into v_blocking
    from public.onboarding_steps
   where engagement_id = e.id
     and status not in ('completed', 'verified', 'skipped', 'cancelled')
     and required_for_close
     -- ‼ עבודה פנימית אוטומטית שהמסך אינו מציג — אינה חוסמת.
     and step_type not in ('internal_setup', 'kyc_identification', 'first_month_review',
                           'representation_upgrade', 'opening_call', 'file_opening',
                           'data_import', 'data_verification')
     and not (step_type = 'release_letter'
              and status not in ('pending', 'locked')
              and due_date is not null
              and due_date <= current_date
              -- התנגדות שנרשמה אינה שתיקה.
              and nullif(payload->>'prevAccountantResponseNote', '') is null);

  v_hold := case when jsonb_typeof(e.kind_hold) = 'object' and e.kind_hold->>'resolvedAt' is null
                 then jsonb_strip_nulls(jsonb_build_object('since', e.kind_hold->'since', 'held', coalesce(e.kind_hold->'held', '[]'::jsonb),
                        'count', jsonb_array_length(case when jsonb_typeof(e.kind_hold->'held') = 'array' then e.kind_hold->'held' else '[]'::jsonb end),
                        'failedAt', e.kind_hold->'failedAt')) end;

  return jsonb_build_object(
    'ok', true,
    'engagementId', e.id,
    'alreadyClosed', e.status <> 'onboarding',
    'blocking', v_blocking,
    'kindHold', v_hold,
    'ready', jsonb_array_length(v_blocking) = 0 and v_hold is null);
end;
$function$;

-- ── 10 · 174 — «עדכון סטטוס מס» כשהיא מחכה לסוג העוסק ──────────────────────
-- הגוף של 174 כפי שהוא, ועוד שער אחד (‼ 217), וקיום/הסרה לפי התקשרות (‼ 217, D4).
create or replace function public.add_intake_questionnaire_step(p_engagement_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  e    public.engagements%rowtype;
  v_id text;
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'engagement_not_found'); end if;

  -- ‼ 217 (D4): «לכל התקשרות» — בקליטה הזו (או שהוכנה לקראתה, או פתוחה); מה שהושלם או
  -- הוסר בהתקשרות קודמת אינו חוסם לקוח שחוזר.
  select s.id into v_id from public.onboarding_steps s
    where s.client_id = e.client_id and s.step_type = 'intake_questionnaire' and s.status <> 'cancelled'
      and (s.engagement_id = e.id or s.engagement_id is null
           or s.status not in ('completed', 'verified', 'skipped'))
    order by (s.engagement_id is not distinct from e.id) desc, s.created_at desc limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'existed', true, 'stepId', v_id);
  end if;

  if public.step_removed_by_office(e.client_id, 'intake_questionnaire', e.id) then
    return jsonb_build_object('ok', true, 'skipped', 'removed_by_office');
  end if;
  -- ‼ 217: שונה בין סוגי העוסק אצל המשרד, והסוג עוד לא נקבע ⇒ מחכה לו (release_kind_hold
  -- קוראת לכאן שוב כשהוא נקבע). ok — אישור ההצעה ממשיך.
  if jsonb_typeof(e.kind_hold) = 'object' and e.kind_hold->>'resolvedAt' is null
     and coalesce(e.kind_hold->'keys', '[]'::jsonb) ? 'intake_questionnaire' then
    return jsonb_build_object('ok', true, 'skipped', 'kind_unknown');
  end if;
  if not public.journey_default_enabled(e.journey_default_snapshot, 'intake_questionnaire') then
    return jsonb_build_object('ok', true, 'skipped', 'disabled_by_default');
  end if;

  insert into public.onboarding_steps (
    user_id, engagement_id, client_id, step_type, track, scope, status, ball,
    required_for_close, due_date, sort_order, payload, published_at)
  values (
    e.user_id, e.id, e.client_id, 'intake_questionnaire', 'internal', 'person', 'pending', 'me',
    -- תזכורת אופציונלית בסוף הקליטה, לא תנאי לסגירתה (73) — אלא אם המשרד קבע אחרת.
    public.journey_default_required(e.journey_default_snapshot, 'intake_questionnaire', false),
    public.journey_default_due_date(e.journey_default_snapshot, 'intake_questionnaire'),
    public.journey_default_order(e.journey_default_snapshot, 'intake_questionnaire'),
    -- טיוטה: published_at ריק הוא הסימון היחיד (JF3). אין יותר payload.published.
    '{}'::jsonb,
    null)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'existed', false, 'stepId', v_id);
end;
$function$;

-- ══ ג · לקוח שחוזר (docs: inv4-returning; הכרעות גיא D1–D4) ═══════════════════
-- לקוח שההתקשרות שלו הסתיימה (end_engagement) ואישר הצעה חדשה. ‼ ההיסטוריה נשארת
-- בהתקשרות הקודמת («בקשה שהושלמה היא היסטוריה», §9), והקליטה החדשה נבנית מחדש:
--   D1 · מה שנשאר פתוח מההתקשרות הקודמת מצטרף לקליטה החדשה, ומסלול הקליטה הקודם נסגר
--        (גם end_engagement סוגרת עכשיו את המסלולים של ההתקשרות — בלי תזכורות ללקוח שעזב).
--   D2 · בקשה שהמשרד מכין לפני שההצעה החדשה אושרה — מוחזקת עד האישור (כמו ליד), ואז
--        נצמדת לקליטה החדשה (לא להתקשרות שהסתיימה).
--   D3 · שואלים שוב על רו"ח קודם — הטופס ריק, והמכתב מחכה לתשובה (המחולל, 216).
--   D4 · שישה סוגים נפתחים מחדש בכל התקשרות; כל השאר — פעם אחת ללקוח.
-- ‼ עדכון הסכם ללקוח פעיל (scheduled → active) אינו קליטה ואינו משתנה כאן.

-- ── 12 · שישה סוגים «לכל התקשרות» (D4) ─────────────────────────────────────────
/** ‼ חייב להתאים ל-PER_ENGAGEMENT_STEP_TYPES (src/lib/clientState.ts) ולרשימה באינדקסים שלמטה. */
create or replace function public.per_engagement_step_types()
returns text[] language sql immutable set search_path to 'public' as $$
  select array['client_documents', 'prev_accountant_details', 'release_letter', 'materials_received',
               'intake_questionnaire', 'retainer_authorization'];
$$;

-- «פעם אחת ללקוח» (157) — כמו שהיה, בלי ששת הסוגים. להם: פתוחה אחת ללקוח (יסודות §11:
-- אחרי שנסגרה מותרת חדשה), ואחת לכל התקשרות (onboarding_steps_engagement_type_idx, 168),
-- ולא יותר מאחת שעוד לא שויכה — כדי שאימוץ להתקשרות חדשה לא ייתקע על (התקשרות, סוג).
-- ‼ כל תנאי מכסה תת-קבוצה של השורות שהאינדקס הקודם כיסה — הבנייה לא יכולה להיכשל.
-- ‼ הרשימה כאן היא per_engagement_step_types() — השוואה בבדיקות (R.0, test-r4-engine.sql).
drop index if exists public.onboarding_steps_person_type_idx;
create unique index onboarding_steps_person_type_idx
  on public.onboarding_steps (client_id, step_type)
  where scope = 'person' and status <> 'cancelled'
    and step_type not in ('custom_request', 'authority_representation',
                          'client_documents', 'prev_accountant_details', 'release_letter', 'materials_received',
                          'intake_questionnaire', 'retainer_authorization');
drop index if exists public.onboarding_steps_person_type_open_idx;
create unique index onboarding_steps_person_type_open_idx
  on public.onboarding_steps (client_id, step_type)
  where scope = 'person' and status not in ('completed', 'verified', 'skipped', 'cancelled')
    and step_type in ('client_documents', 'prev_accountant_details', 'release_letter', 'materials_received',
                      'intake_questionnaire', 'retainer_authorization');
drop index if exists public.onboarding_steps_unassigned_type_idx;
create unique index onboarding_steps_unassigned_type_idx
  on public.onboarding_steps (client_id, step_type)
  where scope = 'person' and engagement_id is null and status <> 'cancelled'
    and step_type in ('client_documents', 'prev_accountant_details', 'release_letter', 'materials_received',
                      'intake_questionnaire', 'retainer_authorization');

-- ── 13 · עזרים ────────────────────────────────────────────────────────────────
/** מתי הסתיימה ההתקשרות הקודמת (הסתיימה/בוטלה, ונוצרה לפני p_engagement_id). null — לקוח שלא עזב. */
create or replace function public.previous_engagement_end(p_client_id text, p_engagement_id text default null)
returns timestamptz language sql stable security definer set search_path to 'public' as $$
  select max(coalesce(o.ended_at, o.updated_at))
    from public.engagements o
   where o.client_id = p_client_id
     and o.status in ('ended', 'cancelled')
     and o.id is distinct from p_engagement_id
     and (p_engagement_id is null
          or o.created_at < (select x.created_at from public.engagements x where x.id = p_engagement_id));
$$;

/**
 * המחולל: האם כבר יש בקשה מהסוג הזה לקליטה הזו. סוג «לכל התקשרות» — בהתקשרות הזו, או
 * שהוכנה לקראתה (לא משויכת), או פתוחה איפה שהיא; כל סוג אחר — לא מבוטלת, איפה שהיא.
 */
create or replace function public._intake_step_exists(p_client_id text, p_engagement_id text, p_step_type text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.onboarding_steps s
     where s.client_id = p_client_id and s.step_type = p_step_type and s.status <> 'cancelled'
       and (not (p_step_type = any (public.per_engagement_step_types()))
            or s.engagement_id = p_engagement_id or s.engagement_id is null
            or s.status not in ('completed', 'verified', 'skipped')));
$$;

/**
 * JF12 לפי התקשרות: המשרד הסיר בקשה מהסוג הזה בקליטה הזו — או לפני האישור שלה (לא משויכת,
 * אחרי שההתקשרות הקודמת הסתיימה). ‼ הסרה בהתקשרות קודמת אינה חוסמת קליטה חדשה. ללקוח שלא
 * עזב — זהה לגרסה עם שני הפרמטרים (174), שנשארת.
 */
create or replace function public.step_removed_by_office(p_client_id text, p_step_type text, p_engagement_id text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.onboarding_steps s
     where s.client_id = p_client_id and s.step_type = p_step_type and s.status = 'cancelled'
       and (s.engagement_id = p_engagement_id
            or (s.engagement_id is null
                and s.created_at >= coalesce(public.previous_engagement_end(p_client_id, p_engagement_id),
                                             '-infinity'::timestamptz))));
$$;

/**
 * «כבר יש כזו» כשמוסיפים בקשה (create_onboarding_request, תבנית, בקשת המשרד בקליטה).
 * סוג «לכל התקשרות»: פתוחה איפה שהיא, או לא מבוטלת בהתקשרות p_engagement_id — ובלי
 * התקשרות, אחת שעוד לא שויכה. כל סוג אחר: לא מבוטלת, איפה שהיא. מחזירה את המזהה (פתוחה
 * קודם, אחר כך של ההתקשרות, אחר כך החדשה) או null.
 * ‼ אותו כלל כמו stepTypeTaken (src/lib/clientState.ts).
 */
create or replace function public._step_type_taken(p_client_id text, p_step_type text, p_engagement_id text)
returns text language sql stable security definer set search_path to 'public' as $$
  select s.id from public.onboarding_steps s
   where s.client_id = p_client_id and s.step_type = p_step_type and s.status <> 'cancelled'
     and (not (p_step_type = any (public.per_engagement_step_types()))
          or s.status not in ('completed', 'verified', 'skipped')
          or (p_engagement_id is not null and s.engagement_id = p_engagement_id)
          or (p_engagement_id is null and s.engagement_id is null))
   order by (s.status not in ('completed', 'verified', 'skipped')) desc,
            (s.engagement_id is not distinct from p_engagement_id) desc, s.created_at desc
   limit 1;
$$;

/**
 * «התהליך נפתח ללקוח» — השער ברמת הלקוח: קליטה פתוחה ⇒ הדגל שלה; אחרת — התקשרות כלשהי
 * שנפתחה, ובלי התקשרות — פתוח. ‼ עטיפה בלבד: client_step_gate_open (214) עם null — מקור אחד.
 * ‼ מה שמוצג ללקוח נבחר לכל בקשה (client_step_gate_open עם published_at שלה): הדף, «שלח
 *   מייל…», תזכורת הכרטיס והמשימה האוטומטית (הכרעות א/ב). כאן — רק השאלות ברמת הלקוח:
 *   «אנחנו מכינים את המשך התהליך» בדף (216), ו«הדף כבר נפתח» כשבקשה «מחכה לאישורך» נוצרת
 *   (release_kind_hold, למעלה). N.1 ב-test-r4-notices.
 */
create or replace function public.client_process_published(p_client_id text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.client_step_gate_open(p_client_id, null);
$$;

-- ── 14 · מסלולים של התקשרות שהסתיימה נסגרים (D1) ───────────────────────────────
/**
 * כל מסלול פעיל/עצור של ההתקשרות נסגר (status 'cancelled', state.closedBy) — בלי לגעת
 * בבקשות: מה שפתוח נשאר כמו שהוא (וכשהלקוח חוזר — מצטרף לקליטה החדשה). שום דבר לא יוצא
 * לבד ממסלול סגור (execute_automatic_step, 214). מחזירה כמה נסגרו.
 */
create or replace function public._close_engagement_flow_runs(p_engagement_id text, p_reason text default 'engagement_ended',
  p_returning boolean default false)
returns int language plpgsql security definer set search_path to 'public' as $$
declare
  r public.flow_runs%rowtype;
  n int := 0;
  v_name text;
begin
  for r in select * from public.flow_runs
            where engagement_id = p_engagement_id and status in ('active', 'paused')
            order by started_at
            for update loop
    update public.flow_runs
       set status = 'cancelled', cancelled_at = now(), updated_at = now(),
           state = coalesce(state, '{}'::jsonb) || jsonb_build_object('closedBy', coalesce(p_reason, 'engagement_ended'))
     where id = r.id;
    perform public._flow_cancel_queued_jobs(r.id, 'flow_cancelled');
    select name into v_name from public.office_flows where id = r.flow_id;
    perform public.log_onboarding_event(r.user_id, null, r.engagement_id, 'note', 'system',
      case when r.trigger = 'quote_approved'
           then case when p_returning then 'מסלול הקליטה הקודם נסגר - ההתקשרות הסתיימה.'
                     else 'מסלול הקליטה נסגר - ההתקשרות הסתיימה.' end
           else 'המסלול «' || coalesce(v_name, 'מסלול') || '» נסגר - ההתקשרות הסתיימה.' end,
      jsonb_build_object('flowRunId', r.id, 'flowEvent', 'closed', 'closedBy', coalesce(p_reason, 'engagement_ended')));
    n := n + 1;
  end loop;
  return n;
end;
$$;

/**
 * D1 · מה שנשאר פתוח בהתקשרויות שהסתיימו (או בוטלו) עובר להתקשרות p_engagement_id, כמו
 * בעדכון הסכם (118): מנותק מהמסלול הקודם (בלי קשתות המסלול, נעול שתלותו מולאה — נפתח),
 * ומגיע למסלול הקליטה החדש בהצמדה. נושא payload.carriedFrom = {engagementId, endedAt} — ההתקשרות
 * שממנה עבר ומתי הסתיימה (detachedFromFlowRun נשאר). ‼ סוג שכבר יש מסוגו בהתקשרות החדשה (אינדקס) — נשאר.
 * שורת «לא נוצרה» של מסלול שנסגר — נסגרת (הקליטה החדשה יוצרת את מה שצריך מחדש).
 * ‼ עבודה של ההתקשרות עצמה (scope 'engagement': הקמה פנימית, ביקורת חודש ראשון, הרשאת
 * התשלום שלה) — לא עוברת, אלא נסגרת (דולגה, not_applicable): הקליטה החדשה יוצרת משלה, לפי
 * ההצעה החדשה. בלי זה המחולל היה רואה את «ביקורת חודש ראשון» הישנה כסימן שהקליטה כבר
 * הורכבה — ומדלג על הצילום ועל בקשות המשרד. אחר כך — המסלולים של ההתקשרויות הקודמות
 * נסגרים. מחזירה {moved, closedProblems, closedEngagementWork, closedRuns}.
 */
create or replace function public._carry_open_work_to_engagement(p_engagement_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  e        public.engagements%rowtype;
  s        record;
  o        record;
  v_moved  int := 0;
  v_probs  int := 0;
  v_eng_work int := 0;
  v_runs   int := 0;
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'engagement_not_found'); end if;

  for s in select st.id, st.step_type, st.flow_run_id, st.payload, st.scope,
                  oe.id as from_engagement_id, coalesce(oe.ended_at, oe.updated_at) as from_ended_at
             from public.onboarding_steps st
             join public.engagements oe on oe.id = st.engagement_id
            where st.client_id = e.client_id and oe.id <> e.id and oe.status in ('ended', 'cancelled')
              and st.status not in ('completed', 'verified', 'skipped', 'cancelled')
            order by st.created_at
            for update of st loop
    if s.payload ? 'creationProblem' then
      perform public._set_step_status(s.id, 'cancelled', 'system',
        'ההתקשרות הקודמת הסתיימה - השורה «לא נוצרה» נסגרה', jsonb_build_object('returning', true));
      v_probs := v_probs + 1;
      continue;
    end if;
    if s.scope = 'engagement' then
      -- ‼ הסיבה נכתבת לפני הסטטוס: דילוג בלי סיבה מוכרת אינו משחרר תלויים (168).
      update public.onboarding_steps set payload = payload || jsonb_build_object('skipReason', 'not_applicable') where id = s.id;
      perform public._set_step_status(s.id, 'skipped', 'system',
        'ההתקשרות הסתיימה - נסגר עם פתיחת הקליטה החדשה', jsonb_build_object('returning', true));
      v_eng_work := v_eng_work + 1;
      continue;
    end if;
    continue when s.step_type not in ('custom_request', 'authority_representation')
              and exists (select 1 from public.onboarding_steps x
                           where x.engagement_id = e.id and x.step_type = s.step_type and x.status <> 'cancelled');
    if s.flow_run_id is not null then
      delete from public.onboarding_step_dependencies where step_id = s.id and origin = 'flow';
    end if;
    -- ‼ carriedFrom — מאיזו התקשרות הבקשה עברה ומתי זו הסתיימה: המשרד מבחין בין ההתקשרויות.
    -- בקשה שפורסמה נשארת גלויה ללקוח, כי פורסמה לפני הקליטה החדשה (client_step_gate_open, 214 —
    -- הכרעה ב); טיוטה נשארת טיוטה. לא נוגעים ב-published_at ולא בגרסת התוכן: זו לא בקשה חדשה ללקוח.
    update public.onboarding_steps
       set engagement_id = e.id,
           flow_run_id = null, flow_stage_key = null, flow_item_key = null,
           payload = payload
             || jsonb_build_object('carriedFrom', jsonb_build_object('engagementId', s.from_engagement_id,
                                                                     'endedAt', s.from_ended_at))
             || case when s.flow_run_id is not null
                     then jsonb_build_object('detachedFromFlowRun', s.flow_run_id) else '{}'::jsonb end,
           status = case when status = 'locked' and public.onboarding_dependency_met(id) then 'pending' else status end
     where id = s.id;
    v_moved := v_moved + 1;
  end loop;

  for o in select id from public.engagements
            where client_id = e.client_id and id <> e.id and status in ('ended', 'cancelled') loop
    v_runs := v_runs + public._close_engagement_flow_runs(o.id, 'engagement_ended', true);
  end loop;
  return jsonb_build_object('ok', true, 'moved', v_moved, 'closedProblems', v_probs,
                            'closedEngagementWork', v_eng_work, 'closedRuns', v_runs);
end;
$$;

/**
 * נקרא מ-create_engagement_for_quotation (216) מיד אחרי שקליטה חדשה נפתחה, לפני המחולל.
 * לקוח שלא עזב ⇒ כלום. לקוח שחוזר ⇒ D1 + שורות בפעילות.
 */
create or replace function public._open_returning_intake(p_engagement_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  e      public.engagements%rowtype;
  c      public.clients%rowtype;
  v_end  timestamptz;
  v_res  jsonb;
  v_n    int;
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null or e.supersedes_engagement_id is not null then
    return jsonb_build_object('ok', true, 'returning', false);
  end if;
  v_end := public.previous_engagement_end(e.client_id, e.id);
  if v_end is null then return jsonb_build_object('ok', true, 'returning', false); end if;
  select * into c from public.clients where id = e.client_id;

  perform public.log_onboarding_event(e.user_id, null, e.id, 'note', 'system',
    coalesce(nullif(trim(coalesce(c.first_name, '')), ''), 'הלקוח') || ' חזר/ה אלינו - נפתחה קליטה חדשה. ההתקשרות הקודמת הסתיימה ב-'
      || to_char(v_end at time zone 'Asia/Jerusalem', 'DD.MM.YYYY') || ', והבקשות שלה נשארות ב«הושלמו».',
    jsonb_build_object('returning', true, 'previousEngagementEndedAt', v_end));

  v_res := public._carry_open_work_to_engagement(e.id);
  v_n := coalesce((v_res->>'moved')::int, 0);
  if v_n > 0 then
    perform public.log_onboarding_event(e.user_id, null, e.id, 'note', 'system',
      case when v_n = 1 then 'בקשה אחת שנשארה פתוחה מההתקשרות הקודמת צורפה לקליטה החדשה.'
           else v_n || ' בקשות שנשארו פתוחות מההתקשרות הקודמת צורפו לקליטה החדשה.' end,
      jsonb_build_object('returning', true, 'moved', v_n));
  end if;
  return jsonb_build_object('ok', true, 'returning', true) || (v_res - 'ok');
end;
$$;

-- ── 15 · 174 — בקשות מוחזקות עד האישור (D2) ─────────────────────────────────────
-- JF4 · "עוד לא נמכר כלום" — הגבול שבו בקשה נולדת מוחזקת (135). ‼ 217 (D2): גם לקוח
-- שחוזר — אין התקשרות נוכחית, ונשלחה לו הצעה (נשלחה/נצפתה). צר במכוון: לקוח פעיל עם
-- הצעה לעדכון הסכם — לא מוחזק.
create or replace function public.requests_held_until_approval(p_client_id text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.derive_lifecycle_stage(p_client_id) in ('lead', 'quoted')
      or (public.current_engagement_id(p_client_id) is null
          and (exists (select 1 from public.quotations q
                        where q.client_id = p_client_id and q.status in ('sent', 'viewed'))
               or exists (select 1 from public.quotations q
                            join public.leads l on l.id = q.lead_id
                           where l.converted_client_id = p_client_id and q.status in ('sent', 'viewed'))));
$function$;

-- 155 + 217 (D2): «pending» — אותו פרדיקט שמחזיק את הבקשות (requests_held_until_approval).
create or replace function public.client_intake_state(p_client_id text)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_eng   text;
begin
  v_eng := public.open_intake_engagement_id(p_client_id);
  if v_eng is not null then
    return jsonb_build_object('state', 'open', 'engagementId', v_eng);
  end if;
  if public.requests_held_until_approval(p_client_id) then
    return jsonb_build_object('state', 'pending', 'engagementId', null);
  end if;
  return jsonb_build_object('state', 'none', 'engagementId', null);
end;
$function$;

-- ── 16 · 174 — create_onboarding_request ────────────────────────────────────────
-- הגוף של 174 כפי שהוא, ועוד (‼ 217): (א) ההתקשרות — הקליטה הפתוחה או הנוכחית, לעולם
-- לא אחת שהסתיימה (בלי — לא משויכת, והאישור מאמץ); (ב) «כבר קיימת» — _step_type_taken
-- (סוג «לכל התקשרות»: פתוחה, או באותה התקשרות); (ג) החייאה רק של שורה מאותה התקשרות;
-- (ד) «ממתינה לאישור» לפי requests_held_until_approval (D2).
create or replace function public.create_onboarding_request(
  p_client_id text,
  p_step_type text,
  p_payload jsonb default '{}'::jsonb,
  p_due_date date default null::date,
  p_depends_on text default null::text,
  p_published boolean default true,
  p_required_for_close boolean default true,
  p_owner text default null::text,
  p_stage_id text default null::text
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  c      public.clients%rowtype;
  v_uid  uuid := auth.uid();
  v_eng  text;
  v_id   text;
  v_ball text;
  v_next int;
  v_dep  public.onboarding_steps%rowtype;
  v_status text := 'pending';
  v_err  text;
  v_ext_kind text;
  v_old  text;
  v_payload jsonb;
  v_hold boolean := false;
  v_stage text;
  v_eng_open text;
  v_intake text;
  v_required boolean;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  -- 173 · משתמש מחובר רשאי רק על לקוח שלו; בלי משתמש — מסלול מערכת (163).
  if v_uid is not null and c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  if not (p_step_type = any (public.request_creatable_step_types())) then
    return jsonb_build_object('ok', false, 'error', 'step_type_not_allowed');
  end if;

  if p_owner is not null and p_owner not in ('client','me','external') then
    return jsonb_build_object('ok', false, 'error', 'bad_owner');
  end if;

  if p_owner = 'external' then
    v_ext_kind := coalesce(p_payload->'externalParty'->>'kind', '');
    if v_ext_kind not in ('prev_accountant','other') then
      return jsonb_build_object('ok', false, 'error', 'missing_external_party');
    end if;
  end if;

  -- ‼ 217 (X-5): אישור אישי לא נוסף לבקשה על בן/בת הזוג — היא בדף של בעל הכרטיס, ואישור שם
  -- היה ניתן על ידיו במקום הנושא (§9). אותו כלל כמו update_onboarding_request (216) ו-_flow_materialize
  -- (שמפצלת את האישור למשימה של המשרד), כך שאף נתיב יצירה לא עוקף אותו.
  if coalesce(p_payload->>'subjectRole', '') = 'spouse' and public._flow_has_personal_confirm(p_payload) then
    return jsonb_build_object('ok', false, 'error', 'personal_confirm_for_subject');
  end if;

  if p_step_type = 'custom_request' then
    if coalesce(p_owner, 'client') = 'client' then
      v_err := public.validate_requirements(p_payload->'requirements');
      if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err); end if;
    elsif p_payload ? 'requirements'
          and coalesce(jsonb_array_length(p_payload->'requirements'), 0) > 0 then
      v_err := public.validate_requirements(p_payload->'requirements');
      if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err); end if;
    end if;
  end if;

  if p_stage_id is not null then
    if not exists (select 1 from public.journey_stages js
                    where js.id = p_stage_id and js.client_id = c.id) then
      return jsonb_build_object('ok', false, 'error', 'stage_not_found');
    end if;
  end if;

  -- ‼ 217: הקליטה הפתוחה, ואחריה ההתקשרות הנוכחית. לעולם לא התקשרות שהסתיימה (לקוח שחוזר):
  -- בלי התקשרות — הבקשה לא משויכת, ואישור ההצעה מאמץ אותה לקליטה החדשה.
  v_eng := coalesce(public.open_intake_engagement_id(c.id), public.current_engagement_id(c.id));

  -- ‼ 155 · הקשר הקליטה. שים לב שזה **אינו** v_eng: שם מחפשים קבוצה לשיוך
  -- השלב, וכאן שואלים אם יש קליטה פתוחה שאפשר בכלל לסגור.
  -- ‼ 217 (D2): «ממתינה» — אותו פרדיקט שמחזיק את הבקשה (גם לקוח שחוזר עם הצעה פתוחה).
  v_eng_open := public.open_intake_engagement_id(c.id);
  v_intake   := case when v_eng_open is not null then 'open'
                     when public.requests_held_until_approval(c.id) then 'pending'
                     else 'none' end;
  v_required := coalesce(p_required_for_close, true) and v_intake <> 'none';

  v_ball := case
    when p_owner = 'me' then 'me'
    when p_owner = 'client' then 'client'
    when p_owner = 'external' then
      case when v_ext_kind = 'prev_accountant' then 'prev_accountant' else 'external' end
    when p_step_type in ('client_documents','prev_accountant_details','custom_request')
      then 'client'
    else 'me'
  end;

  if p_depends_on is not null then
    select * into v_dep from public.onboarding_steps where id = p_depends_on and client_id = c.id;
    if v_dep.id is null then return jsonb_build_object('ok', false, 'error', 'dependency_not_found'); end if;
    if v_dep.status not in ('completed','verified','skipped') then v_status := 'locked'; end if;
  end if;

  -- בקשה פעילה מאותו סוג כבר קיימת — אין מה להוסיף, ומסך הקטלוג ממילא מסנן
  -- אותה. הבדיקה כאן היא בשביל מסך מיושן או שני חלונות פתוחים.
  -- ‼ 217: סוג «לכל התקשרות» (D4) — פתוחה, או באותה התקשרות; מה שהושלם בהתקשרות קודמת — היסטוריה.
  if p_step_type <> 'custom_request'
     and public._step_type_taken(c.id, p_step_type, v_eng) is not null then
    return jsonb_build_object('ok', false, 'error', 'step_type_exists');
  end if;

  select coalesce(max(sort_order), 0) + 10 into v_next
    from public.onboarding_steps where client_id = c.id;

  -- 135 / 173: לפני שנמכר משהו, "הוספתי בקשה" פירושו הכנה ולא שליחה. פרדיקט אחד.
  if p_published and public.requests_held_until_approval(c.id) then
    p_published := false;
    v_hold := true;
  end if;

  v_payload := coalesce(p_payload, '{}'::jsonb);

  -- JF25 · «קבלת חומרים» בלי רשימה = הקטלוג של היום, כמו במחולל. רשימה
  -- שנשלחה במפורש (גם ריקה במכוון אינה קיימת: ריק פירושו "לא נבחר") נשמרת.
  if p_step_type = 'materials_received'
     and (jsonb_typeof(v_payload->'checklist') <> 'array'
          or jsonb_array_length(v_payload->'checklist') = 0) then
    v_payload := v_payload || jsonb_build_object('checklist', public.default_materials_checklist());
  end if;

  -- JF3: published_at הוא הסימון היחיד לפרסום; אין יותר payload.published.
  v_payload := v_payload
    || case when v_hold then jsonb_build_object('heldUntilApproval', true) else '{}'::jsonb end;

  -- שורה מבוטלת מאותו סוג באותה התקשרות — מוחיים אותה (100). ‼ 217: רק מאותה התקשרות —
  -- שורה מבוטלת מהתקשרות קודמת היא היסטוריה שלה, ולא עוברת לחדשה.
  if p_step_type <> 'custom_request' then
    select id into v_old from public.onboarding_steps
     where client_id = c.id and step_type = p_step_type and status = 'cancelled'
       and engagement_id is not distinct from v_eng
     order by updated_at desc
     limit 1;
  end if;

  if v_old is not null then
    -- קשתות תלות ישנות יורדות במלואן: לשלב אפשרו כמה הורים, והטריגר על
    -- העמודה הבודדת אינו מנקה את מה שנוסף מעבר לה.
    delete from public.onboarding_step_dependencies where step_id = v_old;

    update public.onboarding_steps set
      engagement_id      = coalesce(v_eng, engagement_id),
      track              = public.onboarding_track_for(p_step_type),
      scope              = 'person',
      status             = v_status,
      ball               = v_ball,
      depends_on_step_id = p_depends_on,
      due_date           = p_due_date,
      sort_order         = v_next,
      payload            = v_payload,
      required_for_close = v_required,
      published_at       = case when p_published then now() else null end,
      stage_id           = p_stage_id,
      completed_by       = null,
      completed_at       = null,
      verified_at        = null,
      updated_at         = now()
    where id = v_old;

    if p_depends_on is not null then
      insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id)
      values (v_old, p_depends_on, c.user_id)
      on conflict do nothing;
    end if;

    v_id := v_old;
  else
    insert into public.onboarding_steps
      (user_id, engagement_id, client_id, step_type, track, scope, status, ball,
       depends_on_step_id, due_date, sort_order, payload, required_for_close,
       published_at, stage_id)
    values
      (c.user_id, v_eng, c.id, p_step_type, public.onboarding_track_for(p_step_type), 'person',
       v_status, v_ball, p_depends_on, p_due_date, v_next, v_payload,
       v_required,
       case when p_published then now() else null end,
       p_stage_id)
    returning id into v_id;
  end if;

  perform public.log_onboarding_event(c.user_id, v_id, v_eng, 'created', 'accountant',
    case when p_published then 'נוספה בקשה'
         when v_hold then 'נוספה בקשה - תפורסם כשההצעה תאושר'
         else 'נוספה בקשה כטיוטה' end,
    jsonb_build_object('stepType', p_step_type,
                       'owner', coalesce(p_owner, 'client'),
                       'revived', v_old is not null,
                       'intakeState', v_intake,
                       'requiredForClose', v_required));

  return jsonb_build_object('ok', true, 'stepId', v_id, 'status', v_status,
                            'heldUntilApproval', v_hold,
                            'intakeState', v_intake,
                            'requiredForClose', v_required,
                            'revived', v_old is not null);
end;
$function$;

-- ── 17 · 109 — שלב הייצוג: ההתקשרות הנוכחית בלבד ──────────────────────────────
-- הגוף של 109 כפי שהוא; ‼ 217: לא «ההתקשרות האחרונה» (אצל לקוח שחוזר — זו שהסתיימה, ואז
-- הייצוג נשאר מחוץ לקליטה החדשה ולשער הסגירה). בלי התקשרות נוכחית — לא משויך, ופתיחת
-- התקשרות מאמצת (engagements_adopt_rep_step / engagements_adopt_orphan_steps).
create or replace function public.ensure_representation_step(p_client_id text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c        public.clients%rowtype;
  r        public.representation_requests%rowtype;
  v_id     text;
  v_status text;
  v_ball   text;
  v_eng    text;
  v_sort   int;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return null; end if;

  select * into r from public.representation_requests
    where linked_client_id = p_client_id
    order by created_at desc limit 1;
  if r.id is null then return null; end if;

  select id into v_id from public.onboarding_steps
    where client_id = p_client_id and step_type = 'representation'
      and status <> 'cancelled' limit 1;
  if v_id is not null then return v_id; end if;

  -- אותה מפה בדיוק כמו ב-sync_representation_step. שינוי כאן מחייב שינוי שם.
  case r.status
    when 'pending_fill'         then v_status := 'waiting_client'; v_ball := 'client';
    when 'awaiting_accountant'  then v_status := 'in_progress';    v_ball := 'me';
    when 'pending_signature'    then v_status := 'waiting_client'; v_ball := 'client';
    when 'awaiting_stamp'       then v_status := 'in_progress';    v_ball := 'me';
    when 'awaiting_authorities' then v_status := 'in_progress';    v_ball := 'authority';
    when 'active'               then v_status := 'completed';      v_ball := 'me';
    else v_status := 'in_progress'; v_ball := 'me';
  end case;

  v_eng := public.current_engagement_id(p_client_id);

  -- ‼ ראשון ברשימה: הייצוג הוא שער הכניסה, וכל שאר הבקשות באות אחריו —
  -- גם בכרטיס וגם בדף הלקוח (שם הפריט היה נופל אחרון, כי לא היה לו שלב).
  select coalesce(min(sort_order), 1) - 1 into v_sort
    from public.onboarding_steps
    where client_id = p_client_id and status <> 'cancelled';

  -- published_at = now(): הבקשה כבר יצאה ללקוח, ולכן היא אינה טיוטה. בלי זה
  -- הכרטיס היה מציג "שינוי אחד שלא פורסם" על משהו שהלקוח כבר ראה.
  insert into public.onboarding_steps
    (user_id, engagement_id, client_id, required_for_close, step_type, track, scope,
     status, ball, sort_order, completion_method, completed_at, published_at)
  values
    (c.user_id, v_eng, p_client_id, true, 'representation', 'authorities', 'person',
     v_status, v_ball, v_sort, 'auto',
     case when v_status = 'completed' then coalesce(r.updated_at, now()) end,
     now())
  returning id into v_id;

  return v_id;
end;
$function$;

-- ── 18 · 135 — שחרור הבקשות המוחזקות: האימוץ לא נופל ───────────────────────────
-- הגוף של 135 כפי שהוא, ועוד שער אחד (‼ 217): סוג שמוגבל לאחד בהתקשרות וכבר יש כזה בה —
-- נשאר לא משויך, במקום שהאימוץ ייכשל (ואיתו כל השחרור).
create or replace function public.release_requests_held_until_approval(p_client_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c         public.clients%rowtype;
  v_eng     text;
  s         record;
  v_pub     int := 0;
  v_adopted int := 0;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;

  v_eng := public.current_engagement_id(p_client_id);

  -- שיוך בקשות יתומות (נוצרו כשעוד לא הייתה התקשרות). בלי זה
  -- onboarding_close_readiness, שסופרת לפי engagement_id, פשוט לא רואה אותן.
  if v_eng is not null then
    update public.onboarding_steps st
       set engagement_id = v_eng
     where st.client_id = p_client_id
       and st.engagement_id is null
       and st.status <> 'cancelled'
       and (st.step_type in ('custom_request', 'authority_representation')
            or not exists (select 1 from public.onboarding_steps x
                            where x.engagement_id = v_eng and x.step_type = st.step_type and x.status <> 'cancelled'));
    get diagnostics v_adopted = row_count;
  end if;

  -- ‼ רק המסומנות. שלב שהמחולל יצר לפני רגע הוא טיוטה שממתינה להחלטת הרו"ח,
  -- ואסור שאישור הלקוח יפרסם אותה בשמו.
  for s in
    select * from public.onboarding_steps
     where client_id = p_client_id
       and status <> 'cancelled'
       and published_at is null
       and coalesce((payload->>'heldUntilApproval')::boolean, false)
  loop
    update public.onboarding_steps
       set published_at = now(),
           payload = payload - 'published' - 'heldUntilApproval'
     where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, coalesce(s.engagement_id, v_eng),
      'status_changed', 'system',
      'הבקשה נפתחה ללקוח עם אישור ההצעה',
      jsonb_build_object('published', true, 'heldUntilApproval', true));
    v_pub := v_pub + 1;
  end loop;

  return jsonb_build_object('ok', true, 'published', v_pub, 'adopted', v_adopted);
end;
$function$;

-- ── 19 · 174 — _generate_step: התלות בקליטה הזו קודם ──────────────────────────
-- הגוף של 174 כפי שהוא; ‼ 217: «המכתב תלוי בשאלה» — השאלה של הקליטה הזו, לא שאלה
-- שהושלמה בהתקשרות קודמת (שהייתה פותחת את המכתב מיד).
create or replace function public._generate_step(
  p_user_id uuid, p_engagement_id text, p_client_id text, p_snapshot jsonb,
  p_step_type text, p_track text, p_scope text, p_ball text, p_payload jsonb,
  p_required_fallback boolean, p_dep_fallback text, p_dep_applies boolean,
  p_hold boolean, p_open_status text, p_due_override date, p_dry_run boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_dep_type text;
  v_dep      public.onboarding_steps%rowtype;
  v_status   text := coalesce(p_open_status, 'pending');
  v_id       text;
begin
  v_dep_type := public.journey_default_depends_on(p_snapshot, p_step_type, p_dep_fallback);
  if p_dep_applies and v_dep_type is not null then
    select * into v_dep from public.onboarding_steps
     where client_id = p_client_id and step_type = v_dep_type and status <> 'cancelled'
     order by (engagement_id is not distinct from p_engagement_id) desc, created_at desc limit 1;
    if v_dep.id is not null
       and not public.step_satisfies_dependency(v_dep.status, v_dep.payload) then
      v_status := 'locked';
    end if;
  end if;

  if not p_dry_run then
    insert into public.onboarding_steps
      (user_id, engagement_id, client_id, step_type, track, scope, status, ball,
       required_for_close, due_date, sort_order, depends_on_step_id, payload, published_at)
    values
      (p_user_id, p_engagement_id, p_client_id, p_step_type, p_track, p_scope, v_status, p_ball,
       public.journey_default_required(p_snapshot, p_step_type, p_required_fallback),
       coalesce(p_due_override, public.journey_default_due_date(p_snapshot, p_step_type)),
       public.journey_default_order(p_snapshot, p_step_type),
       case when p_dep_applies then v_dep.id end,
       coalesce(p_payload, '{}'::jsonb)
         -- JF3: published_at הוא הסימון היחיד לפרסום; אין יותר payload.published.
         || case when p_hold then jsonb_build_object('heldUntilApproval', true)
                 else '{}'::jsonb end,
       case when p_hold then null else now() end)
    returning id into v_id;
  end if;

  return jsonb_build_object('stepId', v_id, 'status', v_status,
                            'dependsOn', case when p_dep_applies and v_dep.id is not null then v_dep_type end);
end;
$function$;

-- ── 20 · דף הרו"ח הקודם: רשימת החומרים של המכתב הזה ──────────────────────────────
/**
 * בקשת «קבלת חומרים» של מכתב העברה: זו שתלויה בו, ואחריה זו שבאותה התקשרות, ואחריה
 * החדשה. ‼ עד כאן ארבע הדלתות לקחו «אחת של הלקוח» בלי סדר — אצל לקוח שחוזר הרו"ח הקודם
 * (שהקישור שלו עדיין חי) היה רואה ומסמן את הרשימה החדשה. בעדכון הסכם — החומרים עברו
 * להתקשרות החדשה והמכתב נשאר — הקשת עדיין מחברת ביניהם.
 */
create or replace function public._release_materials_step(p_letter_id text)
returns text language sql stable security definer set search_path to 'public' as $$
  select m.id
    from public.onboarding_steps l
    join public.onboarding_steps m
      on m.client_id = l.client_id and m.step_type = 'materials_received' and m.status <> 'cancelled'
   where l.id = p_letter_id
   order by (m.depends_on_step_id = l.id
             or exists (select 1 from public.onboarding_step_dependencies d
                         where d.step_id = m.id and d.depends_on_step_id = l.id)) desc,
            (m.engagement_id is not distinct from l.engagement_id) desc,
            m.created_at desc
   limit 1;
$$;

-- JF27 · דף הרו"ח הקודם קורא את החלון מ-due_date. הגוף של 168 כפי שהוא; ‼ 217: החומרים
-- של המכתב הזה (_release_materials_step).
create or replace function public.get_release_portal(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  s        public.onboarding_steps%rowtype;
  m        public.onboarding_steps%rowtype;
  c        public.clients%rowtype;
  p        public.profiles%rowtype;
  v_items  jsonb := '[]'::jsonb;
  v_done   int := 0;
  v_total  int := 0;
  v_bulk   int := 0;
  v_ups    jsonb := '[]'::jsonb;
  v_out    jsonb := '[]'::jsonb;
  v_due    date;
begin
  select * into s from public.onboarding_steps
   where step_type = 'release_letter' and payload->>'releaseToken' = p_token
     -- ‼ 165: מכתב שבוטל = הטוקן שלו מת. אותו תנאי בכל חמש הדלתות.
     and status <> 'cancelled' limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  select * into c from public.clients where id = s.client_id;
  select * into p from public.profiles where id = s.user_id;
  select * into m from public.onboarding_steps where id = public._release_materials_step(s.id);

  if m.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'key', x->>'key', 'label', x->>'label',
             'done', coalesce((x->>'done')::boolean, false),
             'optional', coalesce((x->>'optional')::boolean, (x->>'key') = 'additional_material'),
             'priority', coalesce((x->>'priority')::boolean, false),
             'declaredByRecipient', coalesce((x->>'declaredByRecipient')::boolean, false),
             'uploads', coalesce(jsonb_array_length(x->'documentIds'),
                                 case when x ? 'documentId' then 1 else 0 end))
             order by coalesce((x->>'priority')::boolean, false) desc, ord), '[]'::jsonb)
      into v_items
      from jsonb_array_elements(coalesce(m.payload->'checklist','[]'::jsonb)) with ordinality t(x, ord);
    select count(*) filter (where (x->>'done')::boolean), count(*)
      into v_done, v_total
      from jsonb_array_elements(v_items) x
     where not coalesce((x->>'optional')::boolean, false);
    v_bulk := coalesce(jsonb_array_length(m.payload->'bulkUploads'), 0);

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', x->>'documentId',
             'name', coalesce(nullif(x->>'fileName',''), 'קובץ'),
             'at', x->>'at') order by ord), '[]'::jsonb)
      into v_ups
      from jsonb_array_elements(coalesce(m.payload->'bulkUploads','[]'::jsonb)) with ordinality t(x, ord);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'key', x->>'key', 'label', x->>'label') order by ord), '[]'::jsonb)
    into v_out
    from jsonb_array_elements(coalesce(s.payload->'outstandingItems','[]'::jsonb)) with ordinality t(x, ord);

  v_due := s.due_date;

  return jsonb_build_object(
    'ok', true,
    'firmName', coalesce(p.firm_name, 'המשרד'),
    'branding', coalesce(p.branding, '{}'::jsonb),
    'clientName', trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')),
    'businessName', nullif(trim(coalesce(c.business_name,'')), ''),
    'prevAccountantName', nullif(trim(coalesce(c.prev_accountant_name,'')), ''),
    'subject', nullif(s.payload->>'releaseSubject',''),
    'body', nullif(s.payload->>'releaseBody',''),
    'sentAt', s.payload->>'releaseSentAt',
    'objectionDueDate', v_due::text,
    'objectionWindowPassed', (v_due is not null and v_due < current_date
                              and nullif(s.payload->>'prevAccountantResponseNote','') is null),
    'signed', (s.payload->>'prevAccountantSignedAt') is not null,
    'signedAt', s.payload->>'prevAccountantSignedAt',
    'signerName', s.payload->>'prevAccountantSignerName',
    'responseNote', nullif(s.payload->>'prevAccountantResponseNote',''),
    'respondedAt', s.payload->>'prevAccountantRespondedAt',
    'responderName', nullif(s.payload->>'prevAccountantResponderName',''),
    'materialsStepId', m.id,
    'materials', v_items,
    'materialsDone', v_done,
    'materialsTotal', v_total,
    'bulkUploads', v_bulk,
    'uploads', v_ups,
    'outstanding', v_out);
end;
$function$;

-- 166 כפי שהוא; ‼ 217: החומרים של המכתב הזה (_release_materials_step).
CREATE OR REPLACE FUNCTION public.release_portal_set_item(p_token text, p_key text, p_done boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s         public.onboarding_steps%rowtype;
  m         public.onboarding_steps%rowtype;
  v_item    jsonb;
  v_list    jsonb;
  v_remain  int;
  v_label   text;
  v_client  text;
begin
  select * into s from public.onboarding_steps
   where step_type = 'release_letter' and payload->>'releaseToken' = p_token
     -- ‼ 165: מכתב שבוטל = הטוקן שלו מת. אותו תנאי בכל חמש הדלתות.
     and status <> 'cancelled' limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  select * into m from public.onboarding_steps where id = public._release_materials_step(s.id);
  if m.id is null then return jsonb_build_object('ok', false, 'error', 'no_materials_step'); end if;

  select x into v_item
    from jsonb_array_elements(coalesce(m.payload->'checklist','[]'::jsonb)) x
   where x->>'key' = p_key limit 1;
  if v_item is null then return jsonb_build_object('ok', false, 'error', 'item_not_found'); end if;

  if coalesce((v_item->>'optional')::boolean, (v_item->>'key') = 'additional_material') then
    return jsonb_build_object('ok', false, 'error', 'not_markable');
  end if;

  if p_done then
    if coalesce((v_item->>'done')::boolean, false) then
      return jsonb_build_object('ok', true, 'noop', true);
    end if;
  else
    if not coalesce((v_item->>'declaredByRecipient')::boolean, false) then
      return jsonb_build_object('ok', false, 'error', 'not_yours');
    end if;
  end if;

  select jsonb_agg(
           case when (x->>'key') = p_key then
             case when p_done
               then x || jsonb_build_object('done', true, 'doneAt', to_jsonb(now()),
                                            'declaredByRecipient', true)
               else (x - 'doneAt' - 'declaredByRecipient') || jsonb_build_object('done', false)
             end
           else x end order by ord)
    into v_list
    from jsonb_array_elements(coalesce(m.payload->'checklist','[]'::jsonb)) with ordinality t(x, ord);

  select count(*) into v_remain
    from jsonb_array_elements(coalesce(v_list,'[]'::jsonb)) x
   where not coalesce((x->>'done')::boolean, false)
     and not coalesce((x->>'optional')::boolean, (x->>'key') = 'additional_material');

  update public.onboarding_steps
     set payload = payload || jsonb_build_object('checklist', coalesce(v_list, '[]'::jsonb)),
         status  = case when v_remain = 0 then 'completed' else 'in_progress' end,
         ball    = case when v_remain = 0 then 'me' else ball end,
         completion_method = case when v_remain = 0 then 'system' else completion_method end,
         completed_at = case when v_remain = 0 then now() else null end
   where id = m.id;

  v_label := coalesce(v_item->>'label', p_key);

  perform public.log_onboarding_event(m.user_id, m.id, m.engagement_id,
    'note', 'system',
    case when p_done
      then 'הרו״ח הקודם ציין שנשלח: ' || v_label
      else 'הרו״ח הקודם ביטל סימון: ' || v_label end,
    jsonb_build_object('actor', 'prev_accountant', 'key', p_key,
                       'done', p_done, 'remaining', v_remain));

  if v_remain = 0 then perform public.unlock_dependent_steps(m.id); end if;

  select nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '')
    into v_client from public.clients where id = m.client_id;

  perform public.queue_accountant_notification(
    m.user_id, 'prev_accountant_document_uploaded', m.client_id, m.id, null, null,
    jsonb_build_object('clientName', v_client,
                       'requestTitle', case when p_done then 'הרו״ח הקודם ציין מה נשלח'
                                                        else 'הרו״ח הקודם ביטל סימון' end,
                       'lastItem', v_label));

  return jsonb_build_object('ok', true, 'done', p_done, 'remaining', v_remain);
end;
$function$;

-- 166 כפי שהוא; ‼ 217: החומרים של המכתב הזה (_release_materials_step).
CREATE OR REPLACE FUNCTION public.release_portal_remove_upload(p_token text, p_document_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s public.onboarding_steps%rowtype; m public.onboarding_steps%rowtype;
  v_entry jsonb; v_keep jsonb := '[]'::jsonb; v_gone jsonb := '[]'::jsonb;
begin
  select * into s from public.onboarding_steps
   where step_type = 'release_letter' and payload->>'releaseToken' = p_token
     -- ‼ 165: מכתב שבוטל = הטוקן שלו מת. אותו תנאי בכל חמש הדלתות.
     and status <> 'cancelled' limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  select * into m from public.onboarding_steps where id = public._release_materials_step(s.id);
  if m.id is null then return jsonb_build_object('ok', false, 'error', 'no_step'); end if;
  select x into v_entry
    from jsonb_array_elements(coalesce(m.payload->'bulkUploads','[]'::jsonb)) x
   where x->>'documentId' = p_document_id limit 1;
  if v_entry is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select coalesce(jsonb_agg(x order by ord), '[]'::jsonb) into v_keep
    from jsonb_array_elements(coalesce(m.payload->'bulkUploads','[]'::jsonb)) with ordinality t(x, ord)
   where x->>'documentId' <> p_document_id;
  v_gone := coalesce(m.payload->'removedUploads','[]'::jsonb)
            || jsonb_build_array(v_entry || jsonb_build_object(
                 'removedAt', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                 'removedBy', 'prev_accountant'));
  update public.onboarding_steps
     set payload = m.payload || jsonb_build_object('bulkUploads', v_keep)
                             || jsonb_build_object('removedUploads', v_gone)
   where id = m.id;
  perform public.sync_prev_accountant_removed_label(p_document_id);
  return jsonb_build_object('ok', true, 'remaining', jsonb_array_length(v_keep));
end;
$function$;

-- 166 כפי שהוא; ‼ 217: החומרים של המכתב הזה (_release_materials_step).
CREATE OR REPLACE FUNCTION public.release_portal_mark_items(p_token text, p_keys jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s          public.onboarding_steps%rowtype;
  m          public.onboarding_steps%rowtype;
  v_keys     text[];
  v_list     jsonb;
  v_marked   int := 0;
  v_remain   int;
  v_labels   text;
  v_client   text;
begin
  select * into s from public.onboarding_steps
   where step_type = 'release_letter' and payload->>'releaseToken' = p_token
     -- ‼ 165: מכתב שבוטל = הטוקן שלו מת. אותו תנאי בכל חמש הדלתות.
     and status <> 'cancelled' limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  select * into m from public.onboarding_steps where id = public._release_materials_step(s.id);
  if m.id is null then return jsonb_build_object('ok', false, 'error', 'no_materials_step'); end if;

  select coalesce(array_agg(k), '{}') into v_keys
    from jsonb_array_elements_text(coalesce(p_keys, '[]'::jsonb)) k;
  if array_length(v_keys, 1) is null then
    return jsonb_build_object('ok', true, 'marked', 0);
  end if;

  select jsonb_agg(
           case
             when (x->>'key') = any(v_keys)
              and not coalesce((x->>'done')::boolean, false)
              and not coalesce((x->>'optional')::boolean, (x->>'key') = 'additional_material')
             then x || jsonb_build_object(
                    'done', true, 'doneAt', to_jsonb(now()), 'declaredByRecipient', true)
             else x
           end order by ord)
    into v_list
    from jsonb_array_elements(coalesce(m.payload->'checklist','[]'::jsonb)) with ordinality t(x, ord);

  select count(*) into v_marked
    from jsonb_array_elements(coalesce(v_list,'[]'::jsonb)) x
   where coalesce((x->>'declaredByRecipient')::boolean, false)
     and (x->>'key') = any(v_keys);

  select count(*) into v_remain
    from jsonb_array_elements(coalesce(v_list,'[]'::jsonb)) x
   where not coalesce((x->>'done')::boolean, false)
     and not coalesce((x->>'optional')::boolean, (x->>'key') = 'additional_material');

  select string_agg(x->>'label', ' · ') into v_labels
    from jsonb_array_elements(coalesce(v_list,'[]'::jsonb)) x
   where (x->>'key') = any(v_keys);

  update public.onboarding_steps
     set payload = payload || jsonb_build_object('checklist', coalesce(v_list, '[]'::jsonb)),
         status  = case when v_remain = 0 then 'completed' else 'in_progress' end,
         ball    = case when v_remain = 0 then 'me' else ball end,
         completion_method = case when v_remain = 0 then 'system' else completion_method end,
         completed_at = case when v_remain = 0 then now() else completed_at end
   where id = m.id;

  perform public.log_onboarding_event(m.user_id, m.id, m.engagement_id,
    case when v_remain = 0 then 'status_changed' else 'note' end, 'system',
    'הרו״ח הקודם ציין מה כלל המשלוח: ' || coalesce(v_labels, ''),
    jsonb_build_object('actor', 'prev_accountant', 'keys', to_jsonb(v_keys), 'remaining', v_remain));

  if v_remain = 0 then perform public.unlock_dependent_steps(m.id); end if;

  select nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '')
    into v_client from public.clients where id = m.client_id;

  perform public.queue_accountant_notification(
    m.user_id, 'prev_accountant_document_uploaded', m.client_id, m.id, null, null,
    jsonb_build_object('clientName', v_client,
                       'requestTitle', 'הרו״ח הקודם ציין מה נשלח',
                       'lastItem', coalesce(v_labels, '')));

  return jsonb_build_object('ok', true, 'marked', v_marked, 'remaining', v_remain);
end;
$function$;

-- ── 21 · 178 — סיום התקשרות סוגר גם את המסלולים שלה (D1) ─────────────────────────
-- הגוף של 178 כפי שהוא, ועוד סגירת המסלולים (‼ 217): לקוח שעזב לא מקבל עוד תזכורות
-- ומיילים «לבד» ממסלול של ההתקשרות שהסתיימה. הבקשות עצמן — לא נוגעים.
create or replace function public.end_engagement(p_engagement_id text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  e     public.engagements%rowtype;
  v_runs int := 0;
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

  -- ‼ 217 (D1): המסלולים של ההתקשרות נסגרים (closedBy 'engagement_ended').
  v_runs := public._close_engagement_flow_runs(e.id, 'engagement_ended', false);

  return jsonb_build_object('ok', true, 'engagementId', e.id, 'endedAt', now(), 'closedRuns', v_runs);
end;
$function$;

-- ══ ד · משימות פנימיות ישנות ובעלים של תבנית (docs: inv4 «internal-legacy») ══════
-- ‼ הכלל (_template_entry_owner, _step_template_owner) והסימון של שורות ישנות
-- (_mark_legacy_internal_tasks) ב-216 §9. כאן — שלושת הכותבים/מחילים מהייצור.

-- ── 22 · 111 — «שמור כתבנית» ────────────────────────────────────────────────────
-- הגוף של 111 כפי שהוא; ‼ 217: הבעלים לפי _step_template_owner (לא לפי הכדור לבדו), ומשימה
-- פנימית נשמרת כ«משימה של המשרד» (officeTask).
create or replace function public.save_request_template(
  p_step_id text, p_name text, p_description text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s       public.onboarding_steps%rowtype;
  v_uid   uuid := auth.uid();
  v_office uuid;
  v_id    text;
  v_eff   jsonb;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if nullif(trim(coalesce(p_name,'')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'missing_name');
  end if;

  select office_id into v_office from public.profiles where id = v_uid;
  if v_office is null then return jsonb_build_object('ok', false, 'error', 'no_office'); end if;

  v_eff := case when s.draft_payload is not null then public.merge_step_draft(s.payload, s.draft_payload)
                else s.payload end;

  insert into public.journey_templates (user_id, office_id, kind, name, description, entries)
  values (v_uid, v_office, 'request', trim(p_name),
          nullif(trim(coalesce(p_description,'')), ''),
          jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
            'key', 'e1',
            'stepType', s.step_type,
            'owner', public._step_template_owner(s.step_type, s.ball, v_eff),
            'officeTask', case when coalesce(v_eff->>'internalTask', '') = 'true' then true end,
            'requiredForClose', coalesce(s.required_for_close, true),
            'payload', public.template_payload_from_step(
              coalesce(s.draft_payload, s.payload))))))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'templateId', v_id);
end;
$function$;

-- ── 23 · 168 — «עדכן תבנית» ──────────────────────────────────────────────────────
-- הגוף של 168 כפי שהוא; ‼ 217: אותו כלל בעלים כמו «שמור כתבנית».
create or replace function public.update_request_template(p_template_id text, p_step_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s        public.onboarding_steps%rowtype;
  t        public.journey_templates%rowtype;
  v_uid    uuid := auth.uid();
  v_office uuid;
  v_entry  jsonb;
  v_id     text;
  v_eff    jsonb;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  select office_id into v_office from public.profiles where id = v_uid;
  if v_office is null then return jsonb_build_object('ok', false, 'error', 'no_office'); end if;

  select * into t from public.journey_templates where id = p_template_id;
  if t.id is null then return jsonb_build_object('ok', false, 'error', 'template_not_found'); end if;
  if t.office_id is not null and t.office_id <> v_office then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_eff := case when s.draft_payload is not null then public.merge_step_draft(s.payload, s.draft_payload)
                else s.payload end;
  v_entry := jsonb_strip_nulls(jsonb_build_object(
    'key', 'e1',
    'stepType', s.step_type,
    'owner', public._step_template_owner(s.step_type, s.ball, v_eff),
    'officeTask', case when coalesce(v_eff->>'internalTask', '') = 'true' then true end,
    'requiredForClose', coalesce(s.required_for_close, true),
    'payload', public.template_payload_from_step(coalesce(s.draft_payload, s.payload))));

  if t.office_id is null then
    -- מובנית: נשארת כפי שהיא, והמשרד מקבל עותק משלו שגובר עליה בתצוגה.
    -- עותק שכבר קיים מתעדכן במקום להיכפל.
    if t.seed_key is not null then
      select id into v_id from public.journey_templates
       where office_id = v_office and seed_key = t.seed_key limit 1;
    end if;
    if v_id is not null then
      update public.journey_templates
         set entries = jsonb_build_array(v_entry), updated_at = now()
       where id = v_id;
      return jsonb_build_object('ok', true, 'templateId', v_id, 'copiedFromSeed', true, 'updatedCopy', true);
    end if;
    insert into public.journey_templates (user_id, office_id, kind, name, description, entries, seed_key)
    values (v_uid, v_office, 'request', t.name, t.description, jsonb_build_array(v_entry), t.seed_key)
    returning id into v_id;
    return jsonb_build_object('ok', true, 'templateId', v_id, 'copiedFromSeed', true);
  end if;

  -- ‼ 216: הסימון הפנימי migratedFrom נשמר (ראו upsert_library_request).
  update public.journey_templates
     set entries = jsonb_build_array(v_entry || jsonb_strip_nulls(jsonb_build_object('migratedFrom', t.entries->0->'migratedFrom'))),
         updated_at = now()
   where id = t.id;

  return jsonb_build_object('ok', true, 'templateId', t.id);
end;
$function$;

-- ── 24 · 174 — החלת תבנית «מסע» ──────────────────────────────────────────────────
-- הגוף של 174 כפי שהוא, ועוד (‼ 217): הבעלים לפי _template_entry_owner (בעלים 'me' שנגזר
-- מהכדור אינו מסתיר בקשה ללקוח); משימה של המשרד נולדת מסומנת (internalTask); «כבר קיימת»
-- של סוג «לכל התקשרות» — בקליטה הזו בלבד (_step_type_taken).
create or replace function public.apply_journey_template(p_client_id text, p_template_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c        public.clients%rowtype;
  t        public.journey_templates%rowtype;
  v_uid    uuid := auth.uid();
  v_office uuid;
  e        jsonb;
  v_res    jsonb;
  v_added  int := 0;
  v_skip   int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_dup_id text;
  v_title  text;
  v_key    text;
  v_map    jsonb := '{}'::jsonb;
  v_stages jsonb := '{}'::jsonb;
  v_stage  text;
  v_dep_ids text[];
  v_owner  text;
  v_due    date;
  v_new    text;
  v_payload jsonb;
  v_deferred jsonb := '[]'::jsonb;
  d        jsonb;
  v_eng    text;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  select office_id into v_office from public.profiles where id = v_uid;
  select * into t from public.journey_templates
   where id = p_template_id
     and (office_id is null or (v_office is not null and office_id = v_office));
  if t.id is null then return jsonb_build_object('ok', false, 'error', 'template_not_found'); end if;
  -- 217: ההתקשרות שהבקשות ייווצרו בה — כמו create_onboarding_request.
  v_eng := coalesce(public.open_intake_engagement_id(c.id), public.current_engagement_id(c.id));

  for e in select * from jsonb_array_elements(t.entries) loop
    v_key := nullif(trim(coalesce(e->>'key','')), '');
    v_dup_id := null;

    -- JF14 · סוג שהיוצר אינו יודע ליצור (תבנית ישנה) — מדווח, לא נבלע.
    if not ((e->>'stepType') = any (public.request_creatable_step_types())) then
      v_skip := v_skip + 1;
      v_skipped := v_skipped || jsonb_build_object('key', v_key, 'stepType', e->>'stepType', 'reason', 'step_type_not_allowed');
      continue;
    end if;

    if (e->>'stepType') = 'custom_request' then
      v_title := coalesce(nullif(trim(e->'payload'->>'title'), ''),
                          nullif(trim(e->'payload'->>'clientTitle'), ''));
      if v_key is not null then
        select s.id into v_dup_id from public.onboarding_steps s
         where s.client_id = c.id and s.step_type = 'custom_request'
           and s.status <> 'cancelled'
           and s.payload->'templateOrigin'->>'templateId' = t.id
           and s.payload->'templateOrigin'->>'key' = v_key
         limit 1;
        if v_dup_id is null then
          select s.id into v_dup_id from public.onboarding_steps s
           where s.client_id = c.id and s.step_type = 'custom_request'
             and s.status <> 'cancelled'
             and coalesce(s.payload->'templateOrigin'->>'templateId', '') <> t.id
             and coalesce(nullif(trim(s.payload->>'title'), ''),
                          nullif(trim(s.payload->>'clientTitle'), '')) is not distinct from v_title
           limit 1;
        end if;
      else
        select s.id into v_dup_id from public.onboarding_steps s
         where s.client_id = c.id and s.step_type = 'custom_request'
           and s.status <> 'cancelled'
           and coalesce(nullif(trim(s.payload->>'title'), ''),
                        nullif(trim(s.payload->>'clientTitle'), '')) is not distinct from v_title
         limit 1;
      end if;
    else
      -- ‼ 217: סוג «לכל התקשרות» — רק פתוחה או בקליטה הזו; מה שהושלם בהתקשרות קודמת — היסטוריה.
      v_dup_id := public._step_type_taken(c.id, e->>'stepType', v_eng);
    end if;

    if v_dup_id is not null then
      -- הבקשה כבר קיימת: לא נוגעים בה, אבל תלות בה נפתרת אליה.
      if v_key is not null then v_map := v_map || jsonb_build_object(v_key, v_dup_id); end if;
      v_skip := v_skip + 1;
      v_skipped := v_skipped || jsonb_build_object('key', v_key, 'stepType', e->>'stepType', 'reason', 'exists', 'stepId', v_dup_id);
      continue;
    end if;

    v_stage := null;
    if nullif(trim(coalesce(e->>'stageTitle','')), '') is not null then
      if v_stages ? (e->>'stageTitle') then
        v_stage := v_stages->>(e->>'stageTitle');
      else
        select id into v_stage from public.journey_stages
         where client_id = c.id and title = e->>'stageTitle' limit 1;
        if v_stage is null then
          insert into public.journey_stages (user_id, client_id, title, sort_order)
          values (c.user_id, c.id, e->>'stageTitle',
                  coalesce((e->>'stageOrder')::int,
                           (select coalesce(max(sort_order), 0) + 10 from public.journey_stages where client_id = c.id)))
          returning id into v_stage;
        end if;
        v_stages := v_stages || jsonb_build_object(e->>'stageTitle', v_stage);
      end if;
    end if;

    -- ‼ 217 (D): בלי בעלים ברשומה — כמו קודם (לפי הסוג); עם בעלים — לפי הכלל האחד.
    v_owner := case when nullif(e->>'owner', '') is null then null else public._template_entry_owner(e) end;
    v_due := case when (e->>'dueInDays') is not null
                  then (current_date + ((e->>'dueInDays')::int)) end;

    v_payload := coalesce(e->'payload','{}'::jsonb);
    if v_key is not null and (e->>'stepType') = 'custom_request' then
      v_payload := v_payload || jsonb_build_object('templateOrigin',
        jsonb_build_object('templateId', t.id, 'key', v_key));
    end if;
    -- ‼ 217 (D): משימה של המשרד נולדת מסומנת — לא בדף של הלקוח ולא במייל.
    if (e->>'stepType') = 'custom_request' and v_owner = 'me'
       and coalesce(v_payload->>'messageOnly', '') <> 'true' then
      v_payload := v_payload || jsonb_build_object('internalTask', true);
    end if;

    v_res := public.create_onboarding_request(
               c.id, e->>'stepType', v_payload,
               p_due_date => v_due,
               p_depends_on => null,
               p_published => false,
               p_required_for_close => coalesce((e->>'requiredForClose')::boolean, true),
               p_owner => v_owner,
               p_stage_id => v_stage);

    if coalesce((v_res->>'ok')::boolean, false) then
      v_added := v_added + 1;
      v_new := v_res->>'stepId';
      if v_key is not null then
        v_map := v_map || jsonb_build_object(v_key, v_new);
      end if;
      if jsonb_typeof(e->'dependsOn') = 'array' and jsonb_array_length(e->'dependsOn') > 0 then
        v_deferred := v_deferred || jsonb_build_object('stepId', v_new, 'dependsOn', e->'dependsOn');
      end if;
    else
      v_skip := v_skip + 1;
      v_skipped := v_skipped || jsonb_build_object('key', v_key, 'stepType', e->>'stepType',
                                                   'reason', coalesce(v_res->>'error', 'failed'));
    end if;
  end loop;

  -- שלב שני: כל הרשומות קיימות, אפשר לפתור כל תלות — קדימה, אחורה, וגם לבקשה
  -- שכבר הייתה אצל הלקוח.
  for d in select * from jsonb_array_elements(v_deferred) loop
    select coalesce(array_agg(v_map->>k), '{}')
      into v_dep_ids
      from jsonb_array_elements_text(d->'dependsOn') k
     where v_map ? k;
    if array_length(v_dep_ids, 1) >= 1 then
      perform public.set_onboarding_step_dependencies(d->>'stepId', v_dep_ids);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'added', v_added, 'skipped', v_skip,
                            'skippedEntries', v_skipped, 'template', t.name);
end;
$function$;

-- ══ ה · אישור הייצוג באזור האישי — מה מסמנים (docs: inv4 «links-guide» §3 א–ג) ═══════════
-- עד כאן: הכרטיס בדף האישי אמר «מחפשים את הבקשה… ובוחרים אישור» (ביחיד), בעוד ששע״ם פותחת
-- שורה לכל רשות; ומאז 186 הנוסח נשמר עם התווים «\n» במקום ירידת שורה (E'…\\n…'). והלקוח לא
-- ידע אילו רשויות לסמן, ומי מבני הזוג מאשר באזור האישי שלו. מכאן: הדף מקבל approvals
-- (build_client_portal ב-216), והנוסח ברבים, עם ירידות שורה אמיתיות.

-- ── 25 · מי מאשר, ואת מה ────────────────────────────────────────────────────
/**
 * תוויות הרשויות לפי הסדר הקבוע (מס הכנסה, מע״מ, ניכויים), בלי כפילויות. מקבלת מערך מעורב:
 * מחרוזת של שע״ם («מע"מ»), שורה של שע״ם (systemCode / systemLabel), או מפתח רשות ('vat').
 * ‼ הסיווג של שע״ם — shaam_row_authority (205) בלבד; כאן רק השם והסדר שהלקוח רואה.
 */
create or replace function public._rep_approval_labels(p_items jsonb)
returns jsonb
language sql
immutable
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(l.label order by l.ord), '[]'::jsonb)
    from (values (1, 'incomeTax', 'מס הכנסה'), (2, 'vat', 'מע״מ'), (3, 'withholding', 'ניכויים')) l(ord, key, label)
   where l.key in (
     select case
              when jsonb_typeof(x) = 'object'
                then public.shaam_row_authority(x || jsonb_build_object('systemLabel', coalesce(x ->> 'systemLabel', x ->> 'screenLabel')))
              when x #>> '{}' in ('incomeTax', 'vat', 'withholding') then x #>> '{}'
              else public.shaam_row_authority(jsonb_build_object('systemLabel', x #>> '{}'))
            end
       from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) x);
$function$;

/**
 * [{person:'client'|'spouse', name, systems:['מס הכנסה','מע״מ',…], awaiting?:[…]}] — מה כל אחד
 * מבני הזוג מסמן באזור האישי שלו ברשות המסים. הלקוח קודם. '[]' ⇒ הדף בנוסח הכללי.
 * הבקשה: representation_request_for_client (204), רק כשהיא «ממתין לאישור הרשויות».
 * ① מה שהוזן בשע״ם — execution.shaam['person:…']: requestedSystems (208), ובהיעדרו שורות הבדיקה
 *    האחרונה שלא בוטלו; בלי רשות שהוסרה מהבקשה (replacement.removed). awaiting = השורות ששע״ם
 *    מציגה כממתינות לאישור הלקוח (shaam_row_awaits_client, 205).
 * ② בלי שום נתון משע״ם — ההיקף שנשמר על הבקשה (scope, 141; לפניו authorities = לנישום):
 *    מס הכנסה אצל מי שרשום/ה (tax_files, רק אחרי הכרעה — registered_spouse_verified), מע״מ
 *    וניכויים לפי targets (ni_targets_of — אותו כלל כמו targetsOf), בן/בת זוג רק אצל נשוי/אה.
 *    ‼ ביטוח לאומי אינו כאן — אינו באזור האישי ברשות המסים.
 * ‼ לעולם לא מנחשים: מי שרשום במס הכנסה לא הוכרע ⇒ '[]'. לא נקרא מהמרשם בכרטיס (זז עם הזמן).
 * ‼ שמות פרטיים בלבד — בלי ת.ז. ובלי מספרי תיק.
 * ‼ build_client_portal קוראת לה בכל דף של לקוח שממתין לרשויות: נתון פגום בשורה אחת ⇒ '[]',
 *   לעולם לא שגיאה (וגם הקריאה שם עטופה).
 */
create or replace function public._rep_approval_people(p_client_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  c          public.clients%rowtype;
  r          public.representation_requests%rowtype;
  v_out      jsonb := '[]'::jsonb;
  v_person   text;
  v_track    jsonb;
  v_src      jsonb;
  v_sys      jsonb;
  v_wait     jsonb;
  v_gone     jsonb;
  v_scope    jsonb;
  v_keys     jsonb;
  v_rec      jsonb;
  v_auth     text;
  v_married  boolean;
  v_spouse_known boolean;
  v_it       text;
  v_names    jsonb;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return '[]'::jsonb; end if;
  select * into r from public.representation_request_for_client(c.id);
  if r.id is null or r.status is distinct from 'awaiting_authorities' then return '[]'::jsonb; end if;

  v_married := coalesce(c.family_status = 'married', false);
  v_spouse_known := v_married
    or nullif(trim(coalesce(c.spouse_first_name, '')), '') is not null
    or nullif(trim(coalesce(c.spouse_name, '')), '') is not null;
  v_names := jsonb_build_object(
    'client', nullif(split_part(trim(coalesce(c.first_name, '')), ' ', 1), ''),
    'spouse', nullif(split_part(trim(coalesce(nullif(trim(coalesce(c.spouse_first_name, '')), ''), c.spouse_name, '')), ' ', 1), ''));

  -- ① שע״ם
  if jsonb_typeof(r.execution -> 'shaam') = 'object' then
    foreach v_person in array array['client', 'spouse'] loop
      v_track := r.execution -> 'shaam' -> ('person:' || v_person);
      continue when jsonb_typeof(v_track) is distinct from 'object';
      v_src := case
        when jsonb_typeof(v_track -> 'requestedSystems') = 'array' and jsonb_array_length(v_track -> 'requestedSystems') > 0
          then v_track -> 'requestedSystems'
        when jsonb_typeof(v_track -> 'systems') = 'array'
          then (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(v_track -> 'systems') x
                 where not public.shaam_rows_all_terminal(jsonb_build_array(x), null)) end;
      v_gone := public._rep_approval_labels(v_track #> '{replacement,removed}');
      select coalesce(jsonb_agg(t.l order by t.o), '[]'::jsonb) into v_sys
        from jsonb_array_elements_text(public._rep_approval_labels(v_src)) with ordinality t(l, o)
       where not (v_gone ? t.l);
      continue when jsonb_array_length(v_sys) = 0;
      v_wait := case when jsonb_typeof(v_track -> 'systems') = 'array'
                     then public._rep_approval_labels((select jsonb_agg(x) from jsonb_array_elements(v_track -> 'systems') x
                                                        where public.shaam_row_awaits_client(x))) end;
      v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'person', v_person, 'name', v_names ->> v_person, 'systems', v_sys,
        'awaiting', nullif(v_wait, '[]'::jsonb))));
    end loop;
  end if;
  if jsonb_array_length(v_out) > 0 then return v_out; end if;

  -- ② ההיקף שנשמר על הבקשה
  v_scope := case
    when jsonb_typeof(r.scope) = 'object' then r.scope
    when coalesce(cardinality(r.authorities), 0) > 0
      then (select jsonb_object_agg(a, '{"status":"in_process"}'::jsonb) from unnest(r.authorities) a
             where a in ('incomeTax', 'vat', 'withholding')) end;
  if v_scope is null then return '[]'::jsonb; end if;

  if jsonb_typeof(v_scope -> 'incomeTax') = 'object' and coalesce(v_scope -> 'incomeTax' ->> 'status', '') <> 'none' then
    if not v_spouse_known then
      v_it := 'client';
    elsif coalesce(c.registered_spouse_verified, false) then
      select case when f ->> 'owner' = 'spouse' then 'spouse' else 'client' end into v_it
        from jsonb_array_elements(case when jsonb_typeof(c.tax_files) = 'array' then c.tax_files else '[]'::jsonb end) f
       where f ->> 'authority' = 'income_tax' limit 1;
    end if;
    -- מי רשום/ה במס הכנסה טרם הוכרע ⇒ לא מנחשים.
    if v_it is null then return '[]'::jsonb; end if;
  end if;

  foreach v_person in array array['client', 'spouse'] loop
    continue when v_person = 'spouse' and not v_married and v_it is distinct from 'spouse';
    v_keys := case when v_it = v_person then '["incomeTax"]'::jsonb else '[]'::jsonb end;
    foreach v_auth in array array['vat', 'withholding'] loop
      v_rec := v_scope -> v_auth;
      continue when jsonb_typeof(v_rec) is distinct from 'object' or coalesce(v_rec ->> 'status', '') = 'none';
      continue when v_person = 'spouse' and not v_married;
      if public.ni_targets_of(v_rec) ? v_person then v_keys := v_keys || to_jsonb(v_auth); end if;
    end loop;
    v_sys := public._rep_approval_labels(v_keys);
    continue when jsonb_array_length(v_sys) = 0;
    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'person', v_person, 'name', v_names ->> v_person, 'systems', v_sys)));
  end loop;
  return v_out;
exception when others then
  return '[]'::jsonb;
end;
$function$;

/**
 * (H2.5b) שורת המשנה של כרטיס האישור כשהוא **נדרש** — לפי מי ששע״ם ממתינה לאישור שלו
 * (awaiting ב-_rep_approval_people), בדף של בעל הכרטיס: «…ממתינה לאישור שלך», «…לאישור של
 * רחל», «…לאישור שלך ושל רחל». אף אחד לא מסומן כממתין (או אין נתון) ⇒ null, והנוסח השמור
 * נשאר. ‼ אותו כלל כמו repApprovalRequiredWho (supabase/functions/_shared/repTemplates.ts),
 * שהתזכורת במייל משתמשת בו.
 */
create or replace function public._rep_approval_required_sub(p_people jsonb)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  with w as (
    select x ->> 'person' as person, nullif(trim(coalesce(x ->> 'name', '')), '') as name
      from jsonb_array_elements(case when jsonb_typeof(p_people) = 'array' then p_people else '[]'::jsonb end) x
     where jsonb_typeof(x -> 'awaiting') = 'array' and jsonb_array_length(x -> 'awaiting') > 0
       and x ->> 'person' in ('client', 'spouse'))
  select case
    when not exists (select 1 from w) then null
    else 'נדרש - רשות המסים ממתינה לאישור '
         || concat_ws(' ו',
              case when exists (select 1 from w where person = 'client') then 'שלך' end,
              (select 'של ' || coalesce(name, 'בן/בת הזוג') from w where person = 'spouse' limit 1))
  end;
$function$;

-- ── 26 · 186 — ensure_rep_client_approval_step: «את כל הבקשות», וירידות שורה אמיתיות ─────────
-- ‼ הגוף של 186 כפי שהוא; שינוי אחד — ברירת המחדל של clientNote: «מסמנים את כל הבקשות שבהן
--   המשרד מופיע כמייצג, ולוחצים «אישור ייצוג»» (זהה תו-בתו ל-REP_PORTAL_CARD_DEFAULTS.note
--   ול-REP_CLIENT_APPROVAL.note), ו-E'\n' במקום E'\\n' (שנשמר כלוכסן ו-n).
-- ‼ כרטיסים קיימים הם צילום ואינם משתנים כאן; ב-216 build_client_portal מציגה «\n» שנשמר
--   כירידת שורה — בלי לכתוב לשורה (ולכן גם בלי מייל).
CREATE OR REPLACE FUNCTION public.ensure_rep_client_approval_step(p_client_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c      public.clients%rowtype;
  v_id   text;
  v_eng  text;
  v_sort int;
  v_tpl  jsonb;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return null; end if;

  select id into v_id from public.onboarding_steps
    where client_id = p_client_id and step_type = 'rep_client_approval'
      and status <> 'cancelled' limit 1;
  if v_id is not null then return v_id; end if;

  if exists (select 1 from public.onboarding_steps
              where client_id = p_client_id and step_type = 'rep_client_approval'
                and status = 'cancelled') then
    return null;
  end if;

  select id into v_eng from public.engagements
    where client_id = p_client_id order by created_at desc limit 1;

  select coalesce(max(sort_order), 0) + 1 into v_sort
    from public.onboarding_steps
    where client_id = p_client_id and step_type = 'representation'
      and status <> 'cancelled';

  -- 186: נוסח המשרד ל"הסבר"/שורת-משנה/קישור, אם קיים. title/cta/linkUrl
  -- קבועים למטה ואינם נקראים מכאן — system-owned.
  select settings -> 'representation' -> 'templates' -> 'portalCard' into v_tpl
    from public.profiles where id = c.user_id;

  insert into public.onboarding_steps
    (user_id, engagement_id, client_id, required_for_close, step_type, track, scope,
     status, ball, sort_order, published_at, payload)
  values
    (c.user_id, v_eng, p_client_id, false, 'rep_client_approval', 'authorities', 'person',
     'pending', 'client', v_sort, now(),
     jsonb_build_object(
       'clientTitle', 'זירוז אישור הייצוג באזור האישי',
       'clientSub', coalesce(nullif(v_tpl ->> 'sub', ''),
         'אופציונלי - שתי דקות שמקצרות את ההמתנה לאישור הרשויות'),
       'clientNote', coalesce(nullif(v_tpl ->> 'note', ''),
         E'יש לך כבר משתמש באזור האישי של רשות המסים?\n\nכן - נכנסים בקישור, לוחצים \"לכניסה למערכת\" ומזדהים. מסמנים את כל הבקשות שבהן המשרד מופיע כמייצג, ולוחצים «אישור ייצוג». שתי דקות.\n\nלא - קודם צריך להירשם ולהזדהות מול רשות המסים. זה החלק שלוקח את הזמן, ובלעדיו אי אפשר לאשר.\n\nאם קיבלת מרשות המסים הודעת SMS על רישום מייצג - אפשר להיכנס ישירות מהקישור שבהודעה, וזה קצר יותר.'),
       'clientNoteAfter', coalesce(nullif(v_tpl ->> 'noteAfter', ''),
         'ואם לא הסתדר - אין בעיה. הייצוג ייכנס לתוקף גם בלי זה, זה פשוט לוקח כמה ימים יותר.'),
       'clientCta', 'אישרתי באזור האישי',
       'clientLinkUrl', 'https://www.gov.il/he/service/personal_area_taxes',
       'clientLinkLabel', coalesce(nullif(v_tpl ->> 'linkLabel', ''), 'לכניסה לאזור האישי')))
  returning id into v_id;

  perform public.log_onboarding_event(c.user_id, v_id, v_eng, 'created', 'system',
    'הבקשה נוצרה כשהייצוג הוגש לשע"ם', '{}'::jsonb);

  return v_id;
end;
$function$;

-- ── 27 · 201 — shaam_require_client_approval: כרטיס שבוטל וחוזר כחובה — כמו כרטיס חדש ─────────
-- ‼ הגוף של 201 כפי שהוא; שינוי אחד: כרטיס שהמשרד ביטל בעבר וחוזר עכשיו (שע״ם דורשת את
--   האישור) מקבל published_at = now(). הוא חוזר עכשיו — לא «פורסם» במועד הישן. בלי זה, בקליטה
--   חדשה שטרם פורסמה (השער לכל בקשה, client_step_gate_open, 214) הוא נראה כעבודה קודמת
--   ועבר את השער: בדף, ב«שלח מייל…» ובתזכורת — לפני שהמשרד פרסם את הקליטה (הכרעה א).
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
  if coalesce(s.payload ->> 'requiredBy', '') = 'shaam' then return v_id; end if;

  update public.onboarding_steps
     set required_for_close = true,
         published_at = coalesce(published_at, now()),
         ball = case when nullif(payload ->> 'clientDeclaredAt', '') is not null then ball else 'client' end,
         payload = payload || jsonb_build_object(
           'requiredBy', 'shaam',
           'requiredSince', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'optionalCopy', jsonb_build_object(
             'clientTitle', payload -> 'clientTitle',
             'clientSub', payload -> 'clientSub',
             'clientNoteAfter', payload -> 'clientNoteAfter'),
           'clientTitle', 'אישור הייצוג באזור האישי',
           -- ‼ 217 (H2.5b): מי ששע״ם ממתינה לאישור שלו — לא «שלך» קבוע (אצל זוג זו לעתים
           -- בת הזוג). בלי נתון — הנוסח הקבוע. הדף גוזר מחדש בכל טעינה (build_client_portal).
           'clientSub', coalesce(public._rep_approval_required_sub(public._rep_approval_people(p_client_id)),
                                 'נדרש - רשות המסים ממתינה לאישור שלך לבקשת הייצוג'),
           'clientNoteAfter', 'בלי האישור הזה רשות המסים לא תקלוט את הייצוג, והטיפול מולה לא יוכל להתקדם.'),
         updated_at = now()
   where id = v_id;

  perform public.log_onboarding_event(s.user_id, v_id, s.engagement_id, 'note', 'system',
    'שע״ם מציגה «ממתין לאישור לקוח» - אישור הלקוח באזור האישי נדרש כדי שהייצוג ייקלט',
    jsonb_build_object('source', 'shaam', 'requiredBy', 'shaam'));
  return v_id;
end;
$function$;

-- ── 11 · הרשאות ───────────────────────────────────────────────────────────
revoke all on function public._creation_problem_class(text) from public, anon, authenticated;
revoke all on function public._record_creation_problem(text, text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public._resolve_creation_problem(text, text, text, text) from public, anon, authenticated;
revoke all on function public._flow_record_creation_problem(public.flow_runs, jsonb, jsonb, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public._engagement_kind(text, text) from public, anon, authenticated;
revoke all on function public._onboarding_office_default_create(public.engagements, jsonb, uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.retry_request_creation(text) from public, anon;
revoke all on function public._flow_kind_waits(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public._flow_when_matches_kind(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public._kind_dependent_entries(uuid) from public, anon, authenticated;
revoke all on function public._kind_hold_entry(jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_kind_hold(text, text) from public, anon, authenticated;
revoke all on function public._release_kind_hold_safe(text, text) from public, anon, authenticated;
revoke all on function public.trg_release_kind_hold() from public, anon, authenticated;
revoke all on function public.retry_kind_hold(text) from public, anon;

grant execute on function public._creation_problem_class(text) to service_role;
grant execute on function public._record_creation_problem(text, text, jsonb, boolean) to service_role;
grant execute on function public._resolve_creation_problem(text, text, text, text) to service_role;
grant execute on function public._flow_record_creation_problem(public.flow_runs, jsonb, jsonb, text, text, text, boolean) to service_role;
grant execute on function public._engagement_kind(text, text) to service_role;
grant execute on function public._onboarding_office_default_create(public.engagements, jsonb, uuid, jsonb, boolean) to service_role;
grant execute on function public.retry_request_creation(text) to authenticated, service_role;
grant execute on function public._flow_kind_waits(jsonb, jsonb) to service_role;
grant execute on function public._flow_when_matches_kind(jsonb, jsonb) to service_role;
grant execute on function public._kind_dependent_entries(uuid) to service_role;
grant execute on function public._kind_hold_entry(jsonb, uuid, uuid) to service_role;
grant execute on function public.release_kind_hold(text, text) to service_role;
grant execute on function public._release_kind_hold_safe(text, text) to service_role;
grant execute on function public.retry_kind_hold(text) to authenticated, service_role;

-- ג · לקוח שחוזר
revoke all on function public.per_engagement_step_types() from public, anon, authenticated;
revoke all on function public.previous_engagement_end(text, text) from public, anon, authenticated;
revoke all on function public._intake_step_exists(text, text, text) from public, anon, authenticated;
revoke all on function public.step_removed_by_office(text, text, text) from public, anon, authenticated;
revoke all on function public._step_type_taken(text, text, text) from public, anon, authenticated;
revoke all on function public.client_process_published(text) from public, anon, authenticated;
revoke all on function public._close_engagement_flow_runs(text, text, boolean) from public, anon, authenticated;
revoke all on function public._carry_open_work_to_engagement(text) from public, anon, authenticated;
revoke all on function public._open_returning_intake(text) from public, anon, authenticated;
revoke all on function public._release_materials_step(text) from public, anon, authenticated;
grant execute on function public.per_engagement_step_types() to service_role;
grant execute on function public.previous_engagement_end(text, text) to service_role;
grant execute on function public._intake_step_exists(text, text, text) to service_role;
grant execute on function public.step_removed_by_office(text, text, text) to service_role;
grant execute on function public._step_type_taken(text, text, text) to service_role;
grant execute on function public.client_process_published(text) to service_role;
grant execute on function public._close_engagement_flow_runs(text, text, boolean) to service_role;
grant execute on function public._carry_open_work_to_engagement(text) to service_role;
grant execute on function public._open_returning_intake(text) to service_role;
grant execute on function public._release_materials_step(text) to service_role;
-- פונקציות הייצור שהוגדרו מחדש — אותן הרשאות כמו קודם (CREATE OR REPLACE שומר; כאן במפורש).
revoke execute on function public.requests_held_until_approval(text) from public, anon, authenticated;
grant  execute on function public.requests_held_until_approval(text) to service_role;
grant  execute on function public.client_intake_state(text) to authenticated, service_role;
revoke execute on function public.create_onboarding_request(text, text, jsonb, date, text, boolean, boolean, text, text) from public, anon;
grant  execute on function public.create_onboarding_request(text, text, jsonb, date, text, boolean, boolean, text, text) to authenticated, service_role;
revoke all on function public.ensure_representation_step(text) from public, anon, authenticated;
revoke all on function public._generate_step(uuid, text, text, jsonb, text, text, text, text, jsonb, boolean, text, boolean, boolean, text, date, boolean)
  from public, anon, authenticated;
grant  execute on function public._generate_step(uuid, text, text, jsonb, text, text, text, text, jsonb, boolean, text, boolean, boolean, text, date, boolean)
  to service_role;
revoke execute on function public.get_release_portal(text) from public;
grant  execute on function public.get_release_portal(text) to anon, authenticated, service_role;
revoke execute on function public.release_portal_set_item(text, text, boolean) from public;
grant  execute on function public.release_portal_set_item(text, text, boolean) to anon, authenticated, service_role;
revoke execute on function public.release_portal_remove_upload(text, text) from public;
grant  execute on function public.release_portal_remove_upload(text, text) to anon, authenticated, service_role;
revoke execute on function public.release_portal_mark_items(text, jsonb) from public;
grant  execute on function public.release_portal_mark_items(text, jsonb) to anon, authenticated, service_role;
revoke execute on function public.end_engagement(text, text) from public, anon;
grant  execute on function public.end_engagement(text, text) to authenticated, service_role;
-- ד
revoke execute on function public.save_request_template(text, text, text) from public, anon;
grant  execute on function public.save_request_template(text, text, text) to authenticated, service_role;
revoke execute on function public.update_request_template(text, text) from public, anon;
grant  execute on function public.update_request_template(text, text) to authenticated, service_role;
revoke execute on function public.apply_journey_template(text, text) from public, anon;
grant  execute on function public.apply_journey_template(text, text) to authenticated, service_role;

-- ה
revoke all on function public._rep_approval_labels(jsonb) from public, anon, authenticated;
revoke all on function public._rep_approval_people(text) from public, anon, authenticated;
revoke all on function public._rep_approval_required_sub(jsonb) from public, anon, authenticated;
grant execute on function public._rep_approval_labels(jsonb) to service_role;
grant execute on function public._rep_approval_people(text) to service_role;
grant execute on function public._rep_approval_required_sub(jsonb) to service_role;
revoke all on function public.ensure_rep_client_approval_step(text) from public, anon, authenticated;
grant  execute on function public.ensure_rep_client_approval_step(text) to service_role;
revoke all on function public.shaam_require_client_approval(text) from public, anon, authenticated;
grant  execute on function public.shaam_require_client_approval(text) to service_role;


-- ══ ז · צילום התעודה של בן/בת הזוג — המשרד בודק, לא בעל הכרטיס (G1.b, 04.10) ══════════════
--   עד כאן (208): ensure_shaam_identity_confirm_step יצרה גם לבן/בת הזוג בקשת «זה הצילום הנכון»
--   בדף של בעל הכרטיס — ובעל הכרטיס אישר במקום הנושא (§9: «בלי פקד שסוגר במקום הנושא»), וגם
--   מייל החתימה ביקש ממנו את זה. מכאן: אותו מנגנון כמו האישור האישי של בן/בת הזוג במסלולים
--   (215 _flow_materialize): משימה של המשרד — ball 'me', payload.personalConfirmFor='spouse' +
--   officeNote — ש-build_client_portal (216) ו-_client_announceable_steps (214) מדלגות עליה.
--   «התקבל האישור של {שם}» (advance_onboarding_step complete) ⇒ הטריגר כאן רושם את האישור
--   על הצילום (identity_docs.clientConfirmedAt, confirmedBy 'office') — ומשם ההגשה לשע״ם ממשיכה
--   כמו אחרי אישור של הלקוח (204: resume_shaam_submissions_for_client). הצילום של הלקוח עצמו — ללא שינוי.

-- payload של משימת המשרד מתוך בקשת האישור (חדשה, או קיימת שעוברת). ‼ requirements ריקות:
-- אין מה למלא בדף; clientResources נשארים — הצילום שהמשרד בודק.
create or replace function public._shaam_identity_spouse_office_payload(p_payload jsonb, p_first text, p_full text)
returns jsonb language sql immutable set search_path to 'public' as $$
  select (coalesce(p_payload, '{}'::jsonb) - 'published' - 'heldUntilApproval' - 'clientSub')
    || jsonb_build_object(
         'title', 'אישור אישי של ' || coalesce(nullif(trim(coalesce(p_first, '')), ''), 'בן/בת הזוג')
                  || ' — «צילום תעודה לרשות המסים»',
         'subjectRole', 'spouse',
         'personalConfirmFor', 'spouse',
         'officeNote', 'לאשר את צילום התעודה של ' || coalesce(nullif(trim(coalesce(p_full, '')), ''), 'בן/בת הזוג')
                       || ' — מול בן/בת הזוג או לפי המסמך',
         'requirements', '[]'::jsonb)
    || case when nullif(trim(coalesce(p_first, '')), '') is not null
            then jsonb_build_object('subjectName', trim(p_first)) else '{}'::jsonb end;
$$;

-- ── ז.1 · _shaam_identity_confirm (מ-208): הלקוח לא מאשר משימה של המשרד ─────────────────
create or replace function public._shaam_identity_confirm(p_step_id text, p_via text, p_new_document_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s        public.onboarding_steps%rowtype;
  r        public.representation_requests%rowtype;
  v_info   jsonb;
  v_person text;
  v_ids    text[];
  v_arr    jsonb;
  v_now    text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_reqs   jsonb;
  v_name   text;
  v_cat    text;
  v_client_name text;
begin
  select * into s from public.onboarding_steps where id = p_step_id for update;
  if s.id is null or not (s.payload ? 'shaamIdentity') then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  -- ‼ 217 · משימה של המשרד (הצילום של בן/בת הזוג): לא מאושרת ולא מוחלפת מהדף של בעל הכרטיס,
  -- גם בקריאה ישירה. המשרד מאשר ב«התקבל האישור» (_shaam_identity_office_confirmed).
  if s.payload ? 'personalConfirmFor' and p_via in ('client_confirmed', 'client_uploaded') then
    return jsonb_build_object('ok', false, 'error', 'office_confirms');
  end if;
  if s.status in ('completed','verified','skipped','cancelled') then return jsonb_build_object('ok', true, 'noop', true); end if;
  v_info := s.payload -> 'shaamIdentity';
  v_person := v_info ->> 'person';
  select * into r from public.representation_requests where id = v_info ->> 'requestId' for update;
  if r.id is null or r.linked_client_id <> s.client_id then return jsonb_build_object('ok', false, 'error', 'request_not_found'); end if;
  v_arr := case when jsonb_typeof(r.identity_docs -> v_person) = 'array' then r.identity_docs -> v_person else '[]'::jsonb end;

  if p_new_document_id is not null then
    -- צילום חדש מהלקוח: קטגוריה של תעודה, ורישום על האדם — מאושר כבר בהעלאה.
    select file_name, category into v_name, v_cat from public.documents
     where id = p_new_document_id and client_id = s.client_id;
    if v_name is null then return jsonb_build_object('ok', false, 'error', 'document_not_found'); end if;
    if coalesce(v_cat, 'other') not in ('id_card', 'drivers_license', 'passport') then
      update public.documents set category = 'id_card' where id = p_new_document_id;
    end if;
    if not exists (select 1 from jsonb_array_elements(v_arr) e where e ->> 'documentId' = p_new_document_id) then
      v_arr := v_arr || jsonb_build_array(jsonb_build_object(
        'documentId', p_new_document_id,
        'docKind', case when coalesce(v_info ->> 'kind', '') = 'passport' then 'passport' else 'idCard' end,
        'fileName', v_name, 'at', v_now, 'via', 'client_replacement', 'clientConfirmedAt', v_now));
    end if;
    v_ids := array[p_new_document_id];
  else
    select array_agg(x) into v_ids from jsonb_array_elements_text(coalesce(v_info -> 'documentIds', '[]'::jsonb)) x;
    select coalesce(jsonb_agg(case when e ->> 'documentId' = any(coalesce(v_ids, '{}'))
                                   then e || jsonb_build_object('clientConfirmedAt', v_now) else e end order by ord), '[]'::jsonb)
      into v_arr
      from jsonb_array_elements(v_arr) with ordinality t(e, ord);
  end if;

  update public.representation_requests
     set identity_docs = jsonb_set(coalesce(identity_docs, '{}'::jsonb), array[v_person], v_arr, true)
   where id = r.id;

  select coalesce(jsonb_agg(case when x ->> 'key' = 'identity_confirm'
                                 then x || jsonb_build_object('done', true,
                                        'value', case when p_via = 'client_uploaded' then 'הוחלף בצילום חדש' else 'אושר' end,
                                        'doneAt', v_now)
                                 else x end order by ord), '[]'::jsonb)
    into v_reqs
    from jsonb_array_elements(coalesce(s.payload -> 'requirements', '[]'::jsonb)) with ordinality t(x, ord);

  update public.onboarding_steps
     set status = 'completed', ball = 'me', completion_method = 'system', completed_at = now(), needs_attention = false,
         payload = payload || jsonb_build_object('requirements', v_reqs,
                     'shaamIdentity', v_info || jsonb_build_object('confirmedAt', v_now, 'confirmedVia', p_via,
                                                                  'confirmedDocumentIds', to_jsonb(coalesce(v_ids, '{}'))))
   where id = s.id;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'client',
    case when p_via = 'client_uploaded' then 'הלקוח העלה צילום תעודה חדש לרשות המסים'
         else 'הלקוח אישר שצילום התעודה שבתיק הוא שלו' end,
    jsonb_build_object('to', 'completed', 'via', p_via, 'documentIds', to_jsonb(coalesce(v_ids, '{}'))));

  select nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '') into v_client_name
    from public.clients where id = s.client_id;
  perform public.queue_accountant_notification(
    s.user_id, 'client_request_completed', s.client_id, s.id, null, null,
    jsonb_build_object('clientName', v_client_name,
      'requestTitle', coalesce(nullif(s.payload->>'clientTitle',''), 'צילום תעודה לרשות המסים'),
      'lastItem', case when p_via = 'client_uploaded' then 'הלקוח העלה צילום חדש' else 'הלקוח אישר את הצילום שבתיק' end));
  return jsonb_build_object('ok', true, 'completed', true);
end;
$function$;

-- ── ז.2 · ensure_shaam_identity_confirm_step (מ-208): לבן/בת הזוג — משימה של המשרד ─────────
create or replace function public.ensure_shaam_identity_confirm_step(p_request_id text, p_person text, p_kind text, p_label text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r        public.representation_requests%rowtype;
  c        public.clients%rowtype;
  s        public.onboarding_steps%rowtype;
  v_sel    jsonb;
  v_conf   jsonb;
  v_ids    jsonb;
  v_res    jsonb;
  v_key    text;
  v_name   text;
  v_payload jsonb;
  v_eng    text;
  v_sort   int;
  v_stage  text;
  v_first  text;
  v_full   text;
  -- ‼ 217 · בן/בת הזוג ⇒ משימה של המשרד, והתשובה אומרת את זה (לא «הלקוח יתבקש לאשר»).
  v_action text := case when p_person = 'spouse' then 'office_confirm' else 'confirm' end;
begin
  select * into r from public.representation_requests where id = p_request_id;
  if r.id is null then return jsonb_build_object('action', 'none', 'reason', 'no_request'); end if;
  select * into c from public.clients where id = r.linked_client_id;
  v_first := public.client_spouse_first_name(c.spouse_first_name, c.spouse_name);
  v_full := coalesce(nullif(trim(coalesce(c.spouse_first_name, '') || ' ' || coalesce(c.spouse_last_name, '')), ''),
                     nullif(trim(coalesce(c.spouse_name, '')), ''));
  v_sel := public.shaam_identity_documents_for(c.id, p_person, p_kind);
  if coalesce((v_sel ->> 'missing')::boolean, false) then return jsonb_build_object('action', 'missing'); end if;
  v_conf := public.shaam_confirmed_identity_documents_for(c.id, p_person, p_kind);
  if not coalesce((v_conf ->> 'missing')::boolean, false) then return jsonb_build_object('action', 'confirmed'); end if;

  v_key := r.id || ':' || p_person || ':' || p_kind;
  select jsonb_agg(x -> 'documentId' order by ord) into v_ids
    from jsonb_array_elements(v_sel -> 'documents') with ordinality t(x, ord);
  select jsonb_agg(jsonb_build_object('key', 'doc_' || ord, 'source', 'client',
           'documentId', x ->> 'documentId', 'fileName', x ->> 'fileName',
           'label', case when jsonb_array_length(v_sel -> 'documents') > 1 then 'הצילום שבתיק (' || ord || ')' else 'הצילום שבתיק' end)
           order by ord)
    into v_res
    from jsonb_array_elements(v_sel -> 'documents') with ordinality t(x, ord);

  select * into s from public.onboarding_steps
   where client_id = c.id and step_type = 'custom_request' and payload #>> '{shaamIdentity,key}' = v_key
     and status not in ('completed','verified','skipped','cancelled')
   order by created_at desc limit 1;
  if s.id is not null then
    -- פתוחה כבר: מעדכנים את הצילומים שהיא מציגה אם השתנו (המשרד צירף אחר).
    if (s.payload #> '{shaamIdentity,documentIds}') is distinct from v_ids then
      update public.onboarding_steps
         set payload = payload || jsonb_build_object('clientResources', v_res,
                         'shaamIdentity', (payload -> 'shaamIdentity') || jsonb_build_object('documentIds', v_ids)),
             updated_at = now()
       where id = s.id;
    end if;
    -- בקשה ישנה (208) לבן/בת הזוג שעדיין בדף של בעל הכרטיס ⇒ עוברת למשרד (כמו ההמרה בסוף הסעיף).
    if p_person = 'spouse' and not (s.payload ? 'personalConfirmFor') then
      update public.onboarding_steps
         set ball = 'me', needs_attention = false, published_at = coalesce(published_at, now()),
             payload = public._shaam_identity_spouse_office_payload(payload, v_first, v_full), updated_at = now()
       where id = s.id;
    end if;
    return jsonb_build_object('action', v_action, 'stepId', s.id, 'existing', true);
  end if;

  v_name := case when p_person = 'spouse'
                 then coalesce(nullif(trim(coalesce(c.spouse_first_name, '') || ' ' || coalesce(c.spouse_last_name, '')), ''), 'בן/בת הזוג')
                 else nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '') end;
  v_payload := jsonb_build_object(
    'shaamIdentity', jsonb_build_object('key', v_key, 'requestId', r.id, 'person', p_person, 'kind', p_kind,
                                        'label', p_label, 'documentIds', v_ids),
    'requiredBy', 'shaam',
    'clientTitle', 'צילום תעודה לרשות המסים' || case when p_person = 'spouse' then ' - ' || v_name else '' end,
    -- ‼ ללקוח — שם הסוג, לא הנוסח של שע״ם («… של הלקוח» בגוף שלישי).
    'clientSub', 'רשות המסים דורשת '
                 || case p_kind when 'passport' then 'צילום דרכון' when 'idOrPassport' then 'צילום תעודת זהות או דרכון'
                                when 'driverLicense' then 'צילום רישיון נהיגה' when 'idCard' then 'צילום תעודת זהות'
                                else 'צילום תעודת זהות או רישיון נהיגה' end
                 || case when p_person = 'spouse' then ' של ' || v_name else '' end
                 || ' כדי להשלים את הייצוג. '
                 || case when jsonb_array_length(v_sel -> 'documents') > 1
                         then 'אלה הצילומים שיש לנו בתיק - אשרו שהם '
                         else 'זה הצילום שיש לנו בתיק - אשרו שהוא ' end
                 || case when p_person = 'spouse' then 'של ' || v_name else 'שלכם' end || ', או העלו צילום אחר.',
    'clientResources', v_res,
    'requirements', jsonb_build_array(
      jsonb_build_object('key', 'identity_confirm', 'kind', 'confirm', 'label', 'זה הצילום הנכון', 'required', true),
      jsonb_build_object('key', 'identity_replacement', 'kind', 'file', 'label', 'צילום אחר במקומו', 'required', false)));

  select id into v_eng from public.engagements where client_id = c.id order by created_at desc limit 1;
  select coalesce(max(sort_order), 0) + 10 into v_sort
    from public.onboarding_steps where client_id = c.id and status <> 'cancelled';
  v_stage := public.derive_lifecycle_stage(c.id);
  if p_person = 'spouse' then
    -- ‼ 217 · משימה של המשרד: לא בדף ולא במייל, ולכן גם לא מוחזקת עד אישור ההצעה (כמו 215).
    insert into public.onboarding_steps
      (user_id, engagement_id, client_id, required_for_close, step_type, track, scope,
       status, ball, sort_order, payload, published_at)
    values
      (c.user_id, v_eng, c.id, false, 'custom_request', 'tools', 'person',
       'pending', 'me', v_sort, public._shaam_identity_spouse_office_payload(v_payload, v_first, v_full), now())
    returning * into s;
  else
    insert into public.onboarding_steps
      (user_id, engagement_id, client_id, required_for_close, step_type, track, scope,
       status, ball, sort_order, payload, published_at)
    values
      (c.user_id, v_eng, c.id, false, 'custom_request', 'tools', 'person',
       'pending', 'client', v_sort,
       v_payload || case when v_stage in ('lead', 'quoted') then jsonb_build_object('published', false, 'heldUntilApproval', true) else '{}'::jsonb end,
       case when v_stage in ('lead', 'quoted') then null else now() end)
    returning * into s;
  end if;
  perform public.log_onboarding_event(c.user_id, s.id, v_eng, 'created', 'system',
    'רשות המסים דורשת ' || coalesce(nullif(p_label, ''), 'צילום תעודה')
      || case when p_person = 'spouse'
              then ' של ' || coalesce(v_full, 'בן/בת הזוג') || ' - המשרד בודק את הצילום שבתיק'
              else ' - הלקוח מתבקש לאשר את הצילום שבתיק' end,
    jsonb_build_object('source', 'shaam', 'requestId', r.id, 'person', p_person, 'documentIds', v_ids));
  return jsonb_build_object('action', v_action, 'stepId', s.id, 'existing', false);
end;
$function$;

-- ── ז.3 · shaam_presign_client_actions (מ-208): מייל החתימה לא מבקש מבעל הכרטיס לאשר את הצילום של בן/בת הזוג
create or replace function public.shaam_presign_client_actions(p_request_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  r        public.representation_requests%rowtype;
  c        public.clients%rowtype;
  v_key    text;
  v_track  jsonb;
  v_person text;
  v_name   text;
  x        jsonb;
  v_out    jsonb := '[]'::jsonb;
begin
  select * into r from public.representation_requests where id = p_request_id;
  if r.id is null or jsonb_typeof(r.execution -> 'shaam') is distinct from 'object' then return v_out; end if;
  select * into c from public.clients where id = r.linked_client_id;
  if c.id is null then return v_out; end if;
  for v_key in select jsonb_object_keys(r.execution -> 'shaam') loop
    v_track := r.execution #> array['shaam', v_key];
    if v_track ? 'replacement' or nullif(v_track ->> 'requestNumber', '') is null
       or nullif(v_track ->> 'submittedAt', '') is not null then continue; end if;
    v_person := case when v_key = 'person:spouse' then 'spouse' else 'client' end;
    v_name := case when v_person = 'spouse'
                   then coalesce(nullif(trim(coalesce(c.spouse_first_name, '') || ' ' || coalesce(c.spouse_last_name, '')), ''), 'בן/בת הזוג')
                   else coalesce(nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''), '') end;
    for x in select value from jsonb_array_elements(public.shaam_creation_requirements(v_track)) loop
      if x ->> 'kind' not in ('idOrLicense', 'idCard', 'idOrPassport', 'passport', 'driverLicense') then continue; end if;
      if not coalesce((public.shaam_confirmed_identity_documents_for(c.id, v_person, x ->> 'kind') ->> 'missing')::boolean, false) then
        continue;
      end if;
      -- ‼ 217 · יש בתיק צילום של בן/בת הזוג ⇒ המשרד בודק אותו; לא מבקשים מבעל הכרטיס לאשר.
      -- (אין צילום ⇒ «העלו» נשאר: זו הבאת מסמך, לא אישור במקום הנושא.)
      if v_person = 'spouse'
         and not coalesce((public.shaam_identity_documents_for(c.id, v_person, x ->> 'kind') ->> 'missing')::boolean, false) then
        continue;
      end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'person', v_person, 'personName', v_name, 'label', x ->> 'label',
        'action', case when coalesce((public.shaam_identity_documents_for(c.id, v_person, x ->> 'kind') ->> 'missing')::boolean, false)
                       then 'upload' else 'confirm' end));
    end loop;
  end loop;
  return v_out;
end;
$function$;

-- ── ז.4 · «התקבל האישור של {שם}» ⇒ האישור נרשם על הצילום ──────────────────────────────────
--  ‼ ההגשה לשע״ם מעלה רק צילום מאושר (shaam_confirmed_identity_documents_for). המשרד סוגר את
--  המשימה בכפתור הרגיל (advance_onboarding_step complete/verify) — והטריגר רושם את האישור כאן,
--  בלי נתיב כתיבה נוסף בדפדפן. «אין צורך» (skip) אינו אישור.
create or replace function public._shaam_identity_office_confirmed(p_step_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s        public.onboarding_steps%rowtype;
  r        public.representation_requests%rowtype;
  v_info   jsonb;
  v_person text;
  v_ids    text[];
  v_arr    jsonb;
  v_now    text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_who    text;
begin
  select * into s from public.onboarding_steps where id = p_step_id for update;
  if s.id is null or not (s.payload ? 'shaamIdentity') or not (s.payload ? 'personalConfirmFor') then
    return jsonb_build_object('ok', false, 'error', 'step_not_found');
  end if;
  if s.status not in ('completed', 'verified') then return jsonb_build_object('ok', false, 'error', 'not_completed'); end if;
  v_info := s.payload -> 'shaamIdentity';
  if nullif(v_info ->> 'confirmedAt', '') is not null then return jsonb_build_object('ok', true, 'noop', true); end if;
  v_person := v_info ->> 'person';
  select * into r from public.representation_requests where id = v_info ->> 'requestId' for update;
  if r.id is null or r.linked_client_id <> s.client_id then return jsonb_build_object('ok', false, 'error', 'request_not_found'); end if;

  select array_agg(x) into v_ids from jsonb_array_elements_text(coalesce(v_info -> 'documentIds', '[]'::jsonb)) x;
  select coalesce(jsonb_agg(case when e ->> 'documentId' = any(coalesce(v_ids, '{}'))
                                      and nullif(e ->> 'clientConfirmedAt', '') is null
                                 then e || jsonb_build_object('clientConfirmedAt', v_now, 'confirmedBy', 'office')
                                 else e end order by ord), '[]'::jsonb)
    into v_arr
    from jsonb_array_elements(case when jsonb_typeof(r.identity_docs -> v_person) = 'array'
                                   then r.identity_docs -> v_person else '[]'::jsonb end) with ordinality t(e, ord);
  -- ‼ עדכון identity_docs מפעיל את ההמשך האוטומטי של ההגשה (204: resume_shaam_submissions_for_client).
  update public.representation_requests
     set identity_docs = jsonb_set(coalesce(identity_docs, '{}'::jsonb), array[v_person], v_arr, true)
   where id = r.id;
  update public.onboarding_steps
     set payload = payload || jsonb_build_object(
           'shaamIdentity', v_info || jsonb_build_object('confirmedAt', v_now, 'confirmedVia', 'office_confirmed',
                                                        'confirmedDocumentIds', to_jsonb(coalesce(v_ids, '{}'))))
   where id = s.id;

  v_who := coalesce(nullif(trim(coalesce(s.payload ->> 'subjectName', '')), ''), 'בן/בת הזוג');
  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'accountant',
    'המשרד אישר את צילום התעודה של ' || v_who || ' לרשות המסים',
    jsonb_build_object('via', 'office_confirmed', 'person', v_person, 'documentIds', to_jsonb(coalesce(v_ids, '{}'))));
  return jsonb_build_object('ok', true, 'confirmed', true);
end;
$function$;

create or replace function public.shaam_identity_office_confirm_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public._shaam_identity_office_confirmed(new.id);
  return new;
end;
$function$;

drop trigger if exists trg_shaam_identity_office_confirm on public.onboarding_steps;
create trigger trg_shaam_identity_office_confirm
  after update of status on public.onboarding_steps
  for each row
  when (new.step_type = 'custom_request' and new.payload ? 'shaamIdentity' and new.payload ? 'personalConfirmFor'
        and new.status in ('completed', 'verified') and old.status is distinct from new.status)
  execute function public.shaam_identity_office_confirm_trg();

-- ── ז.5 · ההמרה: בקשות אישור פתוחות של בן/בת הזוג (208) עוברות למשרד ─────────────────────────
--  ‼ רק פתוחה, רק בן/בת הזוג, רק כזו שטרם אושרה ושטרם הומרה. מה שהושלם — היסטוריה, לא נוגעים.
update public.onboarding_steps s
   set ball = 'me', needs_attention = false, published_at = coalesce(s.published_at, now()),
       payload = public._shaam_identity_spouse_office_payload(s.payload,
                   public.client_spouse_first_name(c.spouse_first_name, c.spouse_name),
                   coalesce(nullif(trim(coalesce(c.spouse_first_name, '') || ' ' || coalesce(c.spouse_last_name, '')), ''),
                            nullif(trim(coalesce(c.spouse_name, '')), ''))),
       updated_at = now()
  from public.clients c
 where c.id = s.client_id
   and s.step_type = 'custom_request'
   and s.payload ? 'shaamIdentity'
   and s.payload #>> '{shaamIdentity,person}' = 'spouse'
   and not (s.payload ? 'personalConfirmFor')
   and nullif(s.payload #>> '{shaamIdentity,confirmedAt}', '') is null
   and s.status not in ('completed', 'verified', 'skipped', 'cancelled');

-- ז
revoke all on function public._shaam_identity_spouse_office_payload(jsonb, text, text) from public, anon, authenticated;
grant execute on function public._shaam_identity_spouse_office_payload(jsonb, text, text) to service_role;
revoke all on function public._shaam_identity_confirm(text, text, text) from public, anon, authenticated;
revoke all on function public.ensure_shaam_identity_confirm_step(text, text, text, text) from public, anon, authenticated;
revoke all on function public.shaam_presign_client_actions(text) from public, anon, authenticated;
revoke all on function public._shaam_identity_office_confirmed(text) from public, anon, authenticated;
revoke all on function public.shaam_identity_office_confirm_trg() from public, anon, authenticated;
grant execute on function public._shaam_identity_office_confirmed(text) to service_role;

select public.assert_domain_function_invariants();
