-- ═══════════════════════════════════════════════════════════════════════════
--  179 — כל מסמך חייב תווית: אכיפה בשרת, ותווית "לבדיקה" משותפת (D4)
-- ═══════════════════════════════════════════════════════════════════════════
--  הכרעת מוצר D4 (ספר הפערים, 09.09.2026): אין מצב שמור בלי תווית. העלאה
--  ידנית דורשת בחירה (כבר נאכף במסכי AddRequestDialog/TaskLinkedDocuments —
--  labelId חובה בטופס); מסמך שנוצר אוטומטית מקבל תווית קבועה, נגזרת מהסוג,
--  בלי לשאול. הפער היה בשני מקומות: (1) אין אכיפה בשרת — 12+ כותבים
--  (כולל העלאה מהדף האישי) יכלו לשמור בלי label_id; (2) delete_document_label
--  היא היחידה שיודעת ליצור/למצוא את תווית ה"לבדיקה" של משתמש — כל מקום אחר
--  שצריך נקודת נפילה בטוחה היה צריך לשכפל את הלוגיקה.
--
--  ‼ מה כאן, בקצרה:
--   1. ensure_reserved_document_label(uid) — אותה לוגיקת find-or-create
--      בדיוק שהייתה קבורה בתוך delete_document_label, כפונקציה עצמאית.
--      delete_document_label נשארת זהה בהתנהגות, רק קוראת לפונקציה החדשה.
--   2. יישור חד-פעמי: כל מסמך/תיקייה בלי label_id מקבלים את תווית ה"לבדיקה"
--      של המשתמש שלהם (נוצרת אם חסרה). 15 מסמכים בפרודקשן ביום הכתיבה.
--   3. documents.label_id הופכת ל-NOT NULL — השער הסמכותי. מכאן, כל כתיבה
--      שלא קובעת תווית נכשלת מיד ובבירור, בלי קשר לכמה כותבים יש בקוד.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① הפונקציה המשותפת — אותה לוגיקה כמו delete_document_label, בשם משלה ──
create or replace function public.ensure_reserved_document_label(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id text;
begin
  select id into v_id from public.document_labels
   where user_id = p_user_id and is_reserved = true limit 1;
  if v_id is null then
    insert into public.document_labels (user_id, name, sort_order, is_reserved)
    values (p_user_id, 'לבדיקה', 999, true)
    returning id into v_id;
  end if;
  return v_id;
end;
$function$;

revoke execute on function public.ensure_reserved_document_label(uuid) from public, anon, authenticated;
grant  execute on function public.ensure_reserved_document_label(uuid) to service_role;

-- delete_document_label קוראת לפונקציה המשותפת במקום הלוגיקה הכפולה.
create or replace function public.delete_document_label(p_label_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_label public.document_labels%rowtype;
  v_fallback_id text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;
  select * into v_label from public.document_labels where id = p_label_id;
  if v_label.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_label.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if v_label.is_reserved then return jsonb_build_object('ok', false, 'error', 'reserved_label'); end if;

  v_fallback_id := public.ensure_reserved_document_label(v_uid);

  update public.documents set label_id = v_fallback_id where label_id = p_label_id and user_id = v_uid;
  update public.document_folders set label_id = v_fallback_id where label_id = p_label_id and user_id = v_uid;
  delete from public.document_labels where id = p_label_id and user_id = v_uid;

  return jsonb_build_object('ok', true, 'reassignedTo', v_fallback_id);
end;
$function$;

revoke execute on function public.delete_document_label(text) from public, anon;
grant  execute on function public.delete_document_label(text) to authenticated;

-- ── ② יישור חד-פעמי: כל מסמך קיים בלי תווית מקבל את ה"לבדיקה" של בעליו ──
--  ‼ לא המצאה — "לבדיקה" היא בדיוק הדלי הקיים שהמוצר כבר משתמש בו לכל
--  מקרה של "צריך עין אנושית, לא סיווג אוטומטי ודאי" (95). מסמכים היסטוריים
--  בלי תווית הם בדיוק המקרה הזה: אין ראיה מספקת לסווג אותם רטרואקטיבית.
do $do$
declare
  r record;
  v_label text;
begin
  for r in select distinct user_id from public.documents where label_id is null loop
    v_label := public.ensure_reserved_document_label(r.user_id);
    update public.documents set label_id = v_label where user_id = r.user_id and label_id is null;
  end loop;
end
$do$;

-- ── ③ השער הסמכותי ──────────────────────────────────────────────────────
alter table public.documents alter column label_id set not null;

select public.assert_domain_function_invariants();
