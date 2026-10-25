-- 301 · פעולה שממתינה מאחורי «פתיחה» (רישום ייצוג / התחברות) לא יוצאת כשהפתיחה נכשלה.
-- (ליאת, 26.10.2026 00:39–00:44, גיא: «יש באג»)
--
-- מאז aabec552 (25.10) הפעולה מול שע״ם נכנסת לתור מאחורי משימת הפתיחה
-- (create_automation_job_after) כדי לחסוך את ההמתנה. השחרור (270) קורה כשהמשימה
-- שלפניה מסתיימת — גם בכישלון. זה נכון לשרשרת של שתי פעולות עצמאיות (בדיקת ב״ל של ליאת
-- ואז של אוריה), אבל לא לשרשרת שבה הראשונה היא תנאי לשנייה: «רישום ייצוג» לא נפתח
-- (הדף בשע״ם נשאר ריק), ובדיקת הקליטה שוחררה ונעצרה על אותו דף ריק.
-- מעכשיו: משימת פתיחה (shaam.ensure_capability / shaam.connect / btl.connect) שנכשלה ⇒
-- הממתינות מאחוריה מסומנות 'skipped' עם הסיבה, ולא יוצאות. הכפתור מציג את כישלון הפתיחה,
-- ולחיצה נוספת מתחילה מחדש (פתיחה ⇒ פעולה).
-- ‼ שרשרת רגילה (פעולה אחרי פעולה) — ללא שינוי: משתחררת גם בכישלון.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public._r301_patch(p_fn regprocedure, p_old text, p_new text)
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_fn);
  v_n int;
begin
  p_old := replace(p_old, E'\r', '');
  p_new := replace(p_new, E'\r', '');
  if position(p_new in v_def) > 0 then return; end if;   -- כבר הוחל
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_n <> 1 then
    raise exception '301: anchor count % (expected 1) in %: %', v_n, p_fn, left(p_old, 120);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$$;

select public._r301_patch('public._release_automation_job_followups()'::regprocedure,
  $o$    if exists (select 1 from public.automation_jobs j$o$,
  $n$    -- 301 · הפתיחה נכשלה ⇒ מה שחיכה לה לא יוצא (היה נעצר על אותו מסך).
    if new.status = 'failed' and new.action_type in ('shaam.ensure_capability', 'shaam.connect', 'btl.connect') then
      update public.automation_job_followups
         set status = 'skipped', note = 'הפתיחה לפני הפעולה נכשלה — הפעולה לא יצאה', updated_at = now()
       where id = f.id;
      continue;
    end if;
    if exists (select 1 from public.automation_jobs j$n$);

drop function public._r301_patch(regprocedure, text, text);
