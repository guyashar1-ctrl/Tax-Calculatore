-- 140 — האימות הוא עובדה חיובית, לא היעדר סימון
--
-- ‼ באג אמיתי שהתגלה על לקוח בפרודקשן: מיגרציה 139 סימנה "טרם אומת"
-- (`registered_spouse_unverified = true`) רק בפתיחת ייצוג חדשה. לכל לקוח
-- ותיק העמודה נשארה NULL, והקוד קרא NULL כ"לא צריך לאמת" — כלומר בדיוק
-- הלקוחות שמעולם לא נשאלו הם אלה שלא נשאלו גם עכשיו. גרוע מכך: השלב
-- שהושלם הצהיר «X הוא בן הזוג הרשום במס הכנסה» על סמך ברירת המחדל, בלי
-- שאיש קבע את זה.
--
-- הבוליאני ההפוך לא יכול להבחין בין ארבעת המצבים האמיתיים:
--   ותיק שלא ידוע · כוונה שנרשמה וטרם אומתה · אומת=הלקוח · אומת=בן/בת הזוג
-- כי גם "ותיק" וגם "אומת" נפלו לאותו צד.
--
-- לכן העמודה הופכת לחיובית: `registered_spouse_verified = true` נכתב אך ורק
-- כשהרו"ח הכריע בפועל בשלב "הפרטים הוזנו בשע״ם". NULL/false = טרם אומת,
-- ומכסה גם לקוחות ותיקים וגם כוונה שנרשמה. מי הרשום ממשיך להיקרא מ-
-- `tax_files[income_tax].owner`, שנשאר מקור האמת היחיד.

alter table public.clients
  add column if not exists registered_spouse_verified boolean;

-- מילוי-לאחור מלא: כל שורה שהספיקה לעבור את מסלול האישור של 139.
-- בפועל אין כאלה (העמודה של 139 נשארה NULL בכל השורות), וזה בסדר.
update public.clients
   set registered_spouse_verified = true
 where registered_spouse_unverified = false
   and registered_spouse_verified is null;

comment on column public.clients.registered_spouse_verified is
  'בן/בת הזוג הרשום/ה במס הכנסה נקבע/ה בפועל מול שע״ם. NULL/false = טרם אומת, כולל לקוחות ותיקים.';

-- ‼ 139 נשארת בסכימה כדי שלשונית ישנה שעוד רצה בדפדפן לא תיפול על כתיבה
-- לעמודה שנעלמה. הקוד אינו קורא ואינו כותב אותה יותר.
comment on column public.clients.registered_spouse_unverified is
  'הוחלף ב-registered_spouse_verified (מיגרציה 140). לא נקרא ולא נכתב יותר - אל תסתמכו עליו.';
