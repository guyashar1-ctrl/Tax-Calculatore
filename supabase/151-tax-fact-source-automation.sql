-- ─── 151: 'automation' כמקור מוכר בעובדות מקצועיות מוצעות ───────────────────
-- החלטת מוצר מאושרת (יסוד האוטומציה, 31.8.2026): תוצאה של בדיקה אוטומטית
-- מול רשות (שע״ם/ב״ל וכו') היא הצעה כמו כל מקור אחר — לעולם לא כתיבה ישירה
-- ל-clients. בלי הערך הזה ב-source, propose_tax_facts היה דוחה כל ניסיון
-- כזה על ה-CHECK, ואוטומציה עתידית הייתה חייבת להתחזות ל-'import' כדי לעבוד.
--
-- ‼ M1 (העובד הראשון, dev.test_automation) לא מייצר עובדה מקצועית בכלל —
-- הערך הזה נוסף עכשיו כדי שהאוטומציה האמיתית הבאה (אישור ניכוי מס במקור)
-- לא תצטרך מיגרציית CHECK משלה. ראה גם types/taxFacts.ts ו-types/clientWorkspace.ts,
-- ששני האוצרות של המקורות שם צריכים להישאר תואמים (ראה ההערה שם).

alter table public.tax_fact_changes drop constraint if exists tax_fact_changes_source_check;
alter table public.tax_fact_changes add constraint tax_fact_changes_source_check
  check (source in ('questionnaire', 'manual', 'institution_alignment', 'import', 'automation'));

-- propose_tax_facts מאמת p_source בתוך גוף הפונקציה, לא רק ב-CHECK של הטבלה
-- (בכוונה: 'manual' מותר בטבלה אבל לא כאן — היא עוברת רק דרך
-- record_manual_fact_change). בלי התיקון הזה כל קריאה עם source='automation'
-- הייתה נדחית כ-invalid_source לפני שמגיעה בכלל ל-insert. אותה טכניקת
-- הזרקה טקסטואלית מאומתת דו-כיוונית כמו במיגרציה 146 — הפונקציה ~כ-2KB
-- ולא שווה סיכון של השמטה שקטה בהעתקה ידנית של הגדרה מחדש.
--
-- ‼ הערה לעתיד (M3): propose_tax_facts קורא auth.uid() ומצפה לסשן מחובר —
-- עובד אוטומטי שמתאמת מול edge function דרך service_role אין לו auth.uid().
-- כדי שהעובד המקומי יוכל להציע עובדה בפועל יידרש נתיב קריאה נפרד (למשל
-- וריאנט עם p_user_id, מוגבל ל-service_role) — לא נפתר כאן, ומכוון בלבד.

do $do$
declare
  v_def text;
  v_new text;
  v_anchor    constant text := $anchor$questionnaire', 'institution_alignment', 'import'$anchor$;
  v_new_list  constant text := $anchor$questionnaire', 'institution_alignment', 'import', 'automation'$anchor$;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'propose_tax_facts';

  if v_def is null then
    raise exception '151: propose_tax_facts לא נמצאה';
  end if;

  if position('automation' in v_def) > 0 then
    raise notice '151: הענף כבר קיים, מדלג';
    return;
  end if;

  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '151: העוגן אינו יחיד — התיקון נעצר';
  end if;

  v_new := replace(v_def, v_anchor, v_new_list);

  if length(v_new) <> length(v_def) + (length(v_new_list) - length(v_anchor)) then
    raise exception '151: אורך לא תואם אחרי ההזרקה';
  end if;

  execute v_new;
  raise notice '151: propose_tax_facts עודכנה — automation מותר כעת';
end
$do$;
