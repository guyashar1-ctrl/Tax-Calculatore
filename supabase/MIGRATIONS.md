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
| 45 | `onboarding_not_a_task_45` | `open_quotation_representation()` כבר לא יוצרת את המשימה "להשלים ייצוג" — שלב הייצוג בקליטה הוא מקור האמת. משימות קיימות לא נגעו |
| 46a | `paperless_not_applicable_46a_column_and_dep` | `clients.paperless_status` + `onboarding_dependency_met` מכיר בסיבה `not_applicable` |
| 46b | `paperless_not_applicable_46b_set_path` | `set_paperless_path` — המסלול הרביעי "לא יעבוד עם פייפרלס", והרשאת התשלום הופכת להסדר ידני בלי תלות |
| 46c | `paperless_not_applicable_46c_advance` | `advance_onboarding_step` — דילוג בסיבה `not_applicable` מותר גם כשיש הרשאה פתוחה |
| 46d | `composer_reads_paperless_fact_46d` | המרכיב קורא את `clients.paperless_status`; שלב שנוצר עם תלות שכבר הושלמה נולד `pending` ולא `locked` |
| 47 | `intake_questionnaire_step_47` + `intake_closes_step_47b` | שלב "שאלון פתיחת תיק" (מסלול פנימי, scope=person), `add_intake_questionnaire_step()`, ו-`close_intake_step_for_client()` שנקראת מ-`save_intake_answer` כשהלקוח מסיים |
| 48 | `client_portal_48a_token_and_mint` + `client_portal_48b_get_portal` | הדף האישי (`?portal=`): `clients.portal_token`, `mint_portal_token()` לרו"ח, ו-`get_client_portal()` ציבורית שמחזירה תמונה מסוננת — פעולות הלקוח, מה שבטיפול המשרד, והושלם. המסלול הפנימי לעולם לא נחשף |

| 49 | `client_born_at_quote_49` + `precreated_client_has_no_representation_49b` | `ensure_client_for_quotation()` — כרטיס לקוח וטוקן דף אישי נולדים בשליחת ההצעה, עם דדופליקציה לפי אימייל/טלפון. `derive_lifecycle_stage()` ככלל יחיד, `refresh_lifecycle_stage_for()` וטריגרים על `quotations`/`engagements` — כי עד כה השלב התעדכן רק ב-05:15. הכרטיס שנולד מהצעה נוצר עם `representation_status = null`. הנוסח המלא גם ב-`49-client-born-at-quote.sql` |
| 50 | `portal_knows_whole_journey_50` | `get_client_portal()` מכיר גם לקוח שטרם חתם: מציג את ההצעה כפעולה, ומחזיר `journeyStage` (quote / identity / setup / active) לפס השלבים בדף האישי |
| 51 | `request_catalog_51a_step_types` + `request_catalog_51b_composer` + `portal_request_catalog_51c` | קטלוג הבקשות: שני סוגי שלב חדשים — `client_documents` (רשימת מסמכים עם ספירה) ו-`prev_accountant_details` (הלקוח מוסר את פרטי הקודם, ומכתב השחרור תלוי בזה). ניסוח דו-קולי ב-`payload.clientTitle/clientSub/clientCta`, ו-`payload.published=false` מסתיר בקשה מהלקוח. רשימת החומרים מהרו"ח הקודם הורחבה לשמונה פריטים. הנוסח: `51-request-catalog.sql`, `51b-portal-request-catalog.sql` |
| 52 | `process_publish_gate_52` + `portal_publish_gate_52b` | שער הפרסום: `engagements.process_published_at` ו-`publish_onboarding_process()`. עד שהרו"ח פותח את התהליך בבונה, הדף האישי מציג רק את מסלול הזהות (ייפוי הכוח נפתח מיד בחתימה) ושורת "אנחנו מכינים את המשך התהליך". התקשרויות קיימות מולאו-לאחור כמפורסמות |
| 53 | `portal_submit_step_53` + `portal_inline_client_forms_53b` | הלקוח ממלא בדף האישי: `portal_submit_step()` מקבלת את טוקן הדף (לא מזהה לקוח) ומרשה לערוך **רק** `prev_accountant_details` — הפרטים נשפכים לכרטיס ב-coalesce, השלב נסגר ומכתב השחרור נפתח. `get_client_portal()` מחזירה `actionKind='portal'` עם `kind` ו-`checklist` כדי שהמסמכים יוצגו כרשימה ולא כמספר |
| 54 | `quotation_view_tracking_54` | `mark_quotation_viewed()` רושמת **כל** פתיחה ולא רק את הראשונה — עם חלון של 30 דקות, כדי שרענון דף לא ינפח את הציר. הצעה שאושרה/פגה כבר לא נספרת כנצפית |
| 55 | `close_onboarding_55` + `long_tail_steps_dont_block_activation_55b` | `onboarding_close_readiness()` בודקת ריטיינר / מכתב שחרור (כולל חלון כלל 16) / שאלון, ו-`close_onboarding()` סוגרת — או כופה עם סיבה ביומן. `advance_onboarding_step()` כבר לא נחסמת מהפעלת ההתקשרות ע"י `representation_upgrade` ו-`first_month_review`, שהם זנב ארוך שיכול להימשך חודשים |

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
