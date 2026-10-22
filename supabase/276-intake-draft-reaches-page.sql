-- ═══════════════════════════════════════════════════════════════════════════
-- 276 · «עדכון סטטוס מס»: טיוטה שפורסמה מגיעה לדף (22.10.2026)
-- ‼ ההכרעה: גיא 22.10 («מאשר את ההצעה כולה») — INV-REQ-01 ב-docs/INVARIANTS.md.
--
-- עד היום: הדף הציג את השאלון רק ב-waiting_client, והפרסום (publish_case_changes) לא העביר אותו
--   לשם — שאלון שפורסם נשאר pending ומוסתר, ו«איך זה ייראה» לא הראה אותו כלל. המשרד סימן «טיוטה»
--   וספר אותו ב«N בקשות עוד לא בדף». אצל לקוח אחד הוא נשאר מוסתר מ-12.10.
-- מעכשיו:
--   1. טריגר: שאלון שפורסם (בכל נתיב — פרסום, יצירה מפורסמת, פתיחה מחדש) ונמצא ב-pending ⇒
--      waiting_client והכדור אצל הלקוח. זה הכלל ש-sync_intake_step_from_sessions כבר הניח בפתיחה
--      מחדש («פורסם ⇒ ממתין ללקוח»).
--   2. _portal_step_items: טיוטה (published_at ריק — קיים רק בצפייה) מוצגת כפריט השאלון, בלי קישור
--      (הקישור נולד בפרסום, tg_mint_intake_token_on_publish).
--   3. נתונים (ייצור בלבד, לפי מזהה): השאלון של ליאת ברנשטיין (טיוטה) ושל אמיר ויסמרק (פורסם 12.10
--      ומעולם לא הוצג) מוסרים — גיא הוציא את «עדכון סטטוס מס» מהקליטה. ב-staging המזהים לא קיימים.
-- ‼ הזרקה לגוף החי (כמו 260): עוגן של שורה אחת, פעם אחת בדיוק; ריצה חוזרת מדלגת לפי «276 ·».
-- בדיקה: scripts/staging-test-draft-reaches-page-276.mjs. חזרה: 276-rollback.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. פורסם ⇒ ממתין ללקוח ──
create or replace function public.tg_intake_published_waits_for_client()
returns trigger language plpgsql set search_path = public as $$
begin
  -- 276 · שאלון שפורסם ולא התחיל — אצל הלקוח, לא «לטיפולך»; אחרת הדף לא מציג אותו.
  if new.step_type = 'intake_questionnaire' and new.published_at is not null and new.status = 'pending' then
    new.status := 'waiting_client';
    new.ball := 'client';
  end if;
  return new;
end $$;
revoke all on function public.tg_intake_published_waits_for_client() from public, anon, authenticated;

drop trigger if exists onboarding_steps_intake_published_waits on public.onboarding_steps;
create trigger onboarding_steps_intake_published_waits
  before insert or update of published_at, status on public.onboarding_steps
  for each row when (new.step_type = 'intake_questionnaire')
  execute function public.tg_intake_published_waits_for_client();

-- ── 2. הטיוטה נראית ב«איך זה ייראה» ──
do $mig$
declare
  v_def text := pg_get_functiondef('public._portal_step_items'::regproc);
  v_anchor constant text := $a$elsif s.status = 'waiting_client' and c.intake_token is not null then$a$;
  v_new constant text := $a$elsif s.status in ('pending', 'in_progress', 'waiting_client')
            and (c.intake_token is not null or s.published_at is null) then  -- 276 · טיוטה מוצגת בצפייה, בלי קישור$a$;
  v_n int;
begin
  if position('276 ·' in v_def) > 0 then
    raise notice '276: already applied';
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then
    raise exception '276: anchor found % times (expected 1)', v_n;
  end if;
  execute replace(v_def, v_anchor, v_new);
end
$mig$;

-- ── 3. ליאת ואמיר — השאלון יוצא (ייצור; ב-staging אין שורות כאלה) ──
do $data$
declare
  r record;
begin
  for r in
    select id from public.onboarding_steps
     where id in ('6fe327ed9f2441d0991a1fe1f035e52a',   -- ליאת ברנשטיין · טיוטה מ-20.10
                  '6e334375382548ea9fb256ab82dee0db')   -- אמיר ויסמרק · פורסם 12.10, מעולם לא הוצג
       and step_type = 'intake_questionnaire'
       and status not in ('completed', 'verified', 'skipped', 'cancelled')
  loop
    perform public._set_step_status(r.id, 'cancelled', 'accountant',
      'הוסר: «עדכון סטטוס מס» הוצא מהקליטה (החלטת גיא 22.10)', jsonb_build_object('migration', 276));
  end loop;
end
$data$;
