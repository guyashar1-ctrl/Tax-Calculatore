-- 295 · הצהרת הון שהוגשה לפי 154 («הענות») — «הוגשה», לא דרישה פתוחה (25.10.2026, גיא)
-- ‼ ב-154 הטקסט «הענות 22/07/2020» = ההצהרה הוגשה בתאריך הזה. עד עכשיו מצב הון נגזר רק מקבוצת רשימת
--   AHZM, ולכן שורה מ-154 (בלי קבוצה) הייתה תמיד «פתוחה» — גם כשהוגשה. עכשיו: תאריך הגשה בשורה ⇒ 'filed'.
--   רשימות AHZM לא מושפעות: שורה מקבוצת «לא הגישו» אינה נושאת תאריך הגשה.
-- התאום בדפדפן: shaamStatus ב-src/features/shaamFiling/planShaam.ts.
-- חזרה: scripts/sql/295/rollback-295.sql (הגוף של 250).

create or replace function public._shaam_status(p_kind text, p jsonb, p_group text) returns text language sql immutable as $$
  select case
    when p_kind = 'annual' then case when nullif(p->>'filedOn', '') is not null then 'filed'
                                     when (p->>'required')::boolean is true and coalesce((p->>'noAssessment')::boolean, false) is false then 'open'
                                     else 'context' end
    else case when p_group in ('filed_fine', 'filed_no_fine') or nullif(p->>'filedOn', '') is not null then 'filed' else 'open' end
  end
$$;
