# מיגרציות מחזור חיי הלקוח — 29 עד 38

כל המיגרציות הוחלו על הפרויקט החי (`uoweoqtuiettozagwgdw`) דרך Supabase, ולכן
הנוסח המדויק שרץ שמור בטבלת `supabase_migrations.schema_migrations`.
הקבצים המקומיים (`29-…sql`, `30-…sql`, `31-…sql`, `32-…sql`) מכסים את השלבים
הראשונים; 33–38 הוחלו ישירות ומופיעים כאן לתיעוד.

**לשליפת הנוסח שרץ בפועל:**
```sql
select name, array_to_string(statements, E'\n;\n')
from supabase_migrations.schema_migrations
where name like '%onboarding%' or name like '%engagement%' or name like '%paperless%'
order by version;
```

| # | שם המיגרציה | מה היא עושה |
|---|---|---|
| 29 | `email_idempotency_29` | `email_messages.idempotency_key` + `step_id` + אינדקס ייחודי חלקי — מניעת שליחה כפולה |
| 30 | `engagements_and_onboarding_steps_30` | הטבלאות `engagements` / `onboarding_steps` / `onboarding_events`, `tasks.onboarding_step_id`, RLS |
| 31a | `onboarding_engine_31a_helpers` | `log_onboarding_event`, `onboarding_dependency_met`, `unlock_dependent_steps` |
| 31b | `onboarding_engine_31b_composer` | `generate_onboarding_steps`, `create_engagement_for_quotation` |
| 31c | `onboarding_engine_31c_advance_and_hooks` | `advance_onboarding_step` (אכיפת התלות), טריגר סנכרון הייצוג, חיבור ל-`approve_quotation` |
| 32 | `public_link_health_check` | `public_link_health()` — בדיקת כל הקישורים הציבוריים אחרי כל שינוי |
| 33 | `paperless_migration_paths_33` | `set_paperless_path()` — שני מסלולי ההגירה לפייפרלס, ושלבי ייבוא/אימות |
| 34 | `onboarding_attention_34` | `refresh_onboarding_attention()` + תזמון יומי. מסמן ולא שולח |
| 35 | `prev_accountant_on_client_35` | עמודות הרו"ח הקודם/העסק על `clients`, והעתקה חד-פעמית מהלידים |
| 36 | `composer_reads_client_facts_36` | המרכיב קורא מהכרטיס ולא מהליד; מסלול "פתיחת תיקים" לעסק חדש |
| 37 | `copy_lead_facts_on_engagement_37` | `copy_lead_facts_to_client()` — העתקה בכל המרה חדשה, לא רק במילוי-לאחור |
| 38 | `one_person_one_record_38` | `clients.lifecycle_stage` + `merged_from_lead_id`, `refresh_lifecycle_stages()`, `merge_leads_into_people()` |
| 39 | `representation_upgrade_step_39` | `sync_representation_upgrade_step()` — שלב "שדרוג לייצוג ראשי" נפתח ונסגר מעצמו |
| 40 | `rep_upgrade_trigger_on_insert_40` | הטריגר של 39 חל גם ביצירת כרטיס, לא רק בעדכון |
| 44 | `onboarding_autofill_44` | `autofill_internal_setup()` — מספרי תיקים ושיוך מטפל נסגרים לבד ממה שכבר ידוע. אינה נוגעת ב-`kyc_identification` (חתימה רגולטורית נשארת ידנית) |

> 41–43 שייכות למהלך "יתרה לתשלום בהצעות" ולא לקליטה.

## כללי הבטיחות שנשמרו בכולן

- **תוספתי בלבד.** לא נמחקה טבלה, לא נמחקה עמודה, לא שונה שם, ולא זז אף מזהה.
- **טבלת `leads` שלמה.** האיחוד נעשה דרך המצביע הקיים `leads.converted_client_id`,
  ולכן כל הקוד הקיים ממשיך לעבוד ולא נוצרות כפילויות.
- **דוח יבש לפני כל מילוי-לאחור** (`p_dry_run => true`), ואימות ספירות לפני ואחרי.
- **`public_link_health()` הורצה אחרי כל מיגרציה** — 15 קישורים ציבוריים, כולם נפתחים.

## ביטול (rollback)

1. **דגל תצוגה** — `profiles.settings.flags.onboardingTab = false` מכבה את כל מסכי
   הקליטה בלי לגעת בנתונים.
2. **הסרת התוספות** — הטבלאות החדשות עצמאיות:
   ```sql
   drop table if exists public.onboarding_events, public.onboarding_steps, public.engagements cascade;
   alter table public.tasks drop column if exists onboarding_step_id;
   ```
   העמודות שנוספו ל-`clients` ו-`email_messages` אינן מזיקות ואפשר להשאירן.
3. **פונקציות** — `approve_quotation` חוזרת לנוסח שלפני 31c (שמור ב-26-…sql +
   היסטוריית המיגרציות); שאר הפונקציות החדשות אינן נקראות משום מקום אחר.
