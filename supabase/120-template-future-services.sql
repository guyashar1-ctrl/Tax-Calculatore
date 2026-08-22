-- ─── 120: מחירון "אם וכאשר" שייך לתבנית ─────────────────────────────────────
--
-- עד היום בונה ההצעות סימן כברירת מחדל את *כל* השירותים החד־פעמיים שבקטלוג,
-- וההצעה יצאה עם מחירון ארוך שאיש לא בחר. מעכשיו כל תבנית נושאת רשימה קצרה
-- ורלוונטית לסוג הלקוח, והרו"ח יכול לשנות אותה להצעה הזאת בלבד.
--
-- ‼ מילוי לאחור לפי שם השירות ולא לפי מזהה: הקטלוג נזרע לכל משתמש בנפרד
-- ולכן המזהים שונים בין חשבונות, ואין ב-service_catalog עמודת seed_key שאפשר
-- להיאחז בה. השם הוא מפתח הצירוף היחיד שקיים.
--   · נבדק מול הייצור לפני ההרצה: כל שישה השירותים החד־פעמיים בכל החשבונות
--     נושאים בדיוק את שמות הזריעה — אפס שינויי שם.
--   · כשל אינו הרסני: שירות ששמו שונה פשוט לא יימצא, התבנית תישאר ריקה,
--     והמסך יאמר "לא יצורף מחירון". הרו"ח בוחר בלחיצה אחת.
--
-- ‼ מגבלה ידועה: התנאי future_service_ids = '[]' מגן על בחירה קיימת (נבדק),
-- אבל אינו יודע להבחין בין "טרם מולא" לבין "המשרד ניקה במכוון". הרצה חוזרת
-- של המיגרציה תמלא מחדש רשימה שרוקנה בכוונה. מיגרציה רצה פעם אחת לסביבה,
-- ולכן זה תיאורטי — ומתועד כאן כדי שלא יופתעו ממנו.

alter table public.quotation_templates
  add column if not exists future_service_ids jsonb not null default '[]'::jsonb;

comment on column public.quotation_templates.future_service_ids is
  'שירותים שמוצעים כמחירון "אם וכאשר" בהצעה שנבנית מהתבנית. ריק = לא יצורף מחירון.';

-- מילוי לאחור: לכל תבנית קיימת, השירותים החד־פעמיים הרלוונטיים לסוג שלה.
with wanted(kind, service_name) as (
  values
    ('exempt_dealer',   'מעבר מעוסק פטור לעוסק מורשה'),
    ('exempt_dealer',   'הצהרת הון ראשונה'),
    ('exempt_dealer',   'אישור מיוחד'),
    ('licensed_dealer', 'הצהרת הון ראשונה'),
    ('licensed_dealer', 'הצהרת הון שנייה ואילך'),
    ('licensed_dealer', 'אישור מיוחד'),
    ('company',         'הצהרת הון ראשונה'),
    ('company',         'אישור מיוחד'),
    ('representation_only', 'אישור מיוחד')
)
update public.quotation_templates t
   set future_service_ids = coalesce(sub.ids, '[]'::jsonb)
  from (
    select tt.id as template_id,
           jsonb_agg(s.id order by s.display_order) as ids
      from public.quotation_templates tt
      join wanted w on w.kind = tt.kind
      join public.service_catalog s
        on s.user_id = tt.user_id
       and s.name = w.service_name
       and s.category = 'one_time'
       and s.active
     group by tt.id
  ) sub
 where t.id = sub.template_id
   and t.future_service_ids = '[]'::jsonb;
