-- ─── 133 · אישור המייצג — צעד בתוך הייצוג, לא בקשה עצמאית ──────────────────
-- המשך ל-131. השלב עצמו אינו משתנה: אותו step_type, אותו טריגר, אותה סגירה
-- אוטומטית. מה שמשתנה הוא **איפה הרו"ח רואה אותו** ו**איך הוא מנוסח ללקוח**.
--
-- ‼ מה זז ב-UI (מחוץ למיגרציה, בקוד): השורה ירדה ממשטח הבקשות בכרטיס הלקוח
-- ועברה לבלוק "מס הכנסה" שבמרכז ביצוע הייצוג, כצעד ביניים בין "נשלח לשע״ם"
-- ל"הייצוג פעיל". הסיבה: זה קיצור דרך בתוך תהליך הייצוג, לא משימה עצמאית —
-- ושורה במשטח *וגם* שורה במרכז הביצוע היו שני מקומות לאותו דבר.
--
-- ‼ מה שהמיגרציה כן משנה — הניסוח ללקוח:
--   1. "זירוז אישור הייצוג באזור האישי" במקום "אישור המייצג באזור האישי".
--      הפועל הראשון בכותרת אומר מה זה נותן לו. "אישור המייצג" נקרא כדרישה.
--   2. "(אופציונלי)" בגוף הכותרת המשנית. ההכרעה מ-131 הייתה שזה זירוז ולא
--      תנאי; עד עכשיו זה נאמר רק ב-clientNoteAfter, כלומר אחרי שקרא הכול.
--
-- ‼ אין כאן שינוי מבנה, אין עמודה חדשה, ואין נגיעה בסטייט-משין. הזרימה
-- נשארת: הגשה לשע"ם ⇒ נוצר · הצהרת לקוח ⇒ כדור לרו"ח (לא נסגר) · סימון
-- "מיוצג פעיל" ⇒ נסגר.

-- ── 1. הניסוח החדש ביצירה ──────────────────────────────────────────────────
do $do$
declare
  v_src text := pg_get_functiondef('public.ensure_rep_client_approval_step(text)'::regprocedure);
  v_new text;
begin
  if position('זירוז אישור הייצוג' in v_src) > 0 then
    raise notice '133: הניסוח כבר עודכן - מדלגים';
    return;
  end if;

  v_new := replace(v_src,
    $q$'clientTitle', 'אישור המייצג באזור האישי',
       'clientSub', 'שלוש דקות שמקצרות את ההמתנה לאישור הרשויות',$q$,
    $q$'clientTitle', 'זירוז אישור הייצוג באזור האישי',
       'clientSub', 'אופציונלי - שלוש דקות שמקצרות את ההמתנה לאישור הרשויות',$q$);
  if v_new = v_src then raise exception '133: הכותרת לא נמצאה ב-ensure_rep_client_approval_step'; end if;

  execute v_new;
end $do$;

-- ── 2. ברירות המחדל בדף האישי מיושרות לאותו ניסוח ──────────────────────────
-- ‼ אלה ה-fallback בלבד (coalesce על payload ריק). בקשה אמיתית תמיד נושאת
-- clientTitle משלה — אבל שתי ברירות מחדל שונות באותו מסך הן באג ממתין.
do $do$
declare
  v_src text := pg_get_functiondef('public.build_client_portal(text,text)'::regprocedure);
  v_new text;
begin
  if position('זירוז אישור הייצוג' in v_src) > 0 then
    raise notice '133: הדף האישי כבר מעודכן - מדלגים';
    return;
  end if;

  v_new := replace(v_src,
    $q$'אישור המייצג באזור האישי'$q$,
    $q$'זירוז אישור הייצוג באזור האישי'$q$);
  if v_new = v_src then raise exception '133: ברירת המחדל לא נמצאה בדף האישי'; end if;

  execute v_new;
end $do$;

do $do$
declare
  v_src text := pg_get_functiondef('public.portal_submit_step(text,text,jsonb)'::regprocedure);
  v_new text;
begin
  if position('זירוז אישור הייצוג' in v_src) > 0 then
    raise notice '133: portal_submit_step כבר מעודכן - מדלגים';
    return;
  end if;

  v_new := replace(v_src,
    $q$'אישור המייצג באזור האישי'$q$,
    $q$'זירוז אישור הייצוג באזור האישי'$q$);
  if v_new = v_src then raise exception '133: ברירת המחדל לא נמצאה ב-portal_submit_step'; end if;

  execute v_new;
end $do$;

-- ── 3. הבקשות שכבר קיימות ──────────────────────────────────────────────────
-- ‼ רק בקשות שנושאות בדיוק את הניסוח שהמערכת כתבה. אם המשרד ערך את הכותרת
-- בעצמו — זו ההחלטה שלו, ולא דורסים אותה.
update public.onboarding_steps
   set payload = payload
       || jsonb_build_object(
            'clientTitle', 'זירוז אישור הייצוג באזור האישי',
            'clientSub', 'אופציונלי - שלוש דקות שמקצרות את ההמתנה לאישור הרשויות')
 where step_type = 'rep_client_approval'
   and payload->>'clientTitle' = 'אישור המייצג באזור האישי'
   and payload->>'clientSub' = 'שלוש דקות שמקצרות את ההמתנה לאישור הרשויות';
