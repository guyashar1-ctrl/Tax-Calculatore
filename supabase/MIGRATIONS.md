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

## מהלך "המסע הוא הכרטיס" (2026-08-05) — `docs/PLAN-JOURNEY-CENTER.md`

| # | שם המיגרציה | מה היא עושה |
|---|---|---|
| 56 | `journey_custom_request_and_order_56` | סוג שלב `custom_request` (בקשה חופשית: `payload.requirements[]` עם `kind` ∈ confirm/text/file), מסלול `custom`, ועמודת `sort_order` עם מילוי-לאחור לפי סדר היצירה — עד כה לא היה ניתן לסדר בקשות. הנוסח: `56-journey-foundation.sql` |
| 57 | `journey_portal_custom_and_uploads_57` | `get_client_portal()` מכבד `sort_order`, מחזיר בקשות חופשיות, ומסמן `canUpload` + `key` לכל פריט מסמך כדי שיהיה כנגד מה להעלות. תיעוד השינוי: `57-portal-custom-and-uploads.sql` |
| 58 | `journey_portal_submit_custom_58` | `portal_submit_step()` מקבל תשובות לבקשה חופשית (אישור/טקסט), ונחסם על שלב לא-מפורסם או נעול. דרישת `file` נסגרת רק דרך ה-Edge Function |
| 59 | `journey_release_portal_59` | דף הרו"ח הקודם: `mint_release_token()`, `get_release_portal()`, `release_portal_sign()`. **הכרעת גיא: הלקוח אינו חותם על מכתב השחרור — הרו"ח הקודם חותם ומעלה את החומרים, הלקוח מכותב.** טביעת הטוקן גם פותחת את שלב החומרים, שעד כה נשאר נעול ולא היה לאן להעלות. הנוסח: `59-release-portal.sql` |
| 60 | `journey_link_health_covers_portal_and_release_60` | `public_link_health()` מכסה שישה סוגי קישורים במקום ארבעה — נוספו `portal` ו-`release` |
| 61 | `dump_function_defs_helper_61` | `__dump_function_defs()` — עזר קריאה בלבד ל-`scripts/dump-live-functions.mjs`, כדי שהארכיון המקומי לא ייפול שוב מאחורי המסד |
| 62 | `journey_create_reorder_publish_request_62` | `create_onboarding_request()` (הוספת בקשה ידנית, רשימת סוגים סגורה — הייצוג אינו בה כי הוא מסונכרן מהטריגר), `reorder_onboarding_steps()` (הסדר שהרו"ח קובע הוא מה שהלקוח רואה), `publish_onboarding_request()` (חשיפת טיוטה ללקוח), ו-`onboarding_track_for()` כמיפוי יחיד. הנוסח: `62-add-reorder-publish-request.sql` |
| 63 | `journey_custom_request_is_multi_instance_63` | שני האינדקסים הייחודיים החריגו את `custom_request`. הם אכפו "שלב אחד מכל סוג" כדי שהמרכיב לא ייצור כפילויות — אבל בקשה חופשית היא רב-פעמית מעצם טבעה. **התגלה בבדיקה בדפדפן**, כשהבקשה החופשית השנייה נדחתה ב-duplicate key |

| 64 | `journey_templates_64` | טבלת `journey_templates` + `save_journey_template()` / `apply_journey_template()`. **הכרעת גיא: מערכת תבניות אחת ולא שתיים** — תבנית מסע היא סט של בקשות, וכל בקשה נושאת את הניסוח שלה. מסך "תבניות מייל" הנפרד בוטל, והמייל נגזר מ-`clientTitle`/`clientSub`/`clientCta` של הבקשה. הנוסח: `64-journey-templates.sql` |
| 65 | `journey_template_dedupes_custom_by_title_65` | החלה חוזרת של תבנית מזהה בקשה חופשית לפי הכותרת ולא לפי הסוג. **התגלה בבדיקה בדפדפן**: `custom_request` רב-פעמי (63), ולכן בדיקת "קיים לפי סוג" עקפה אותו והחלה שנייה שכפלה את הבקשה |

## התראות למשרד (2026-08-05)

| # | שם המיגרציה | מה היא עושה |
|---|---|---|
| 66 | `office_notifications_66_gate_and_queue` | `accountant_notifications.suppressed_at` (התראה שנרשמה וההגדרה כיבתה — נשארת כתיעוד, לא נשלפת שוב) ו-`step_id` עם FK מדורג; האינדקס החלקי מדלג על מושתקות. `queue_accountant_notification()` — נקודת הכניסה היחידה לרישום התראה, ולכן אירוע עתידי הוא קריאה אחת. `user_id_for_public_token()` מכירה גם את טוקן הדף האישי ואת טוקן דף השחרור, כדי שהתראה תצא מיד ולא רק בכניסה הבאה של הרו"ח |
| 66b | `office_notifications_66b_new_events` | `portal_submit_step` / `release_portal_sign` / `close_onboarding` רושמות התראה בסוף פעולה מוצלחת: `client_request_completed`, `release_letter_signed`, `onboarding_closed`. שאר הגוף לא נגע |

**מי מחליט אם המייל יוצא:** `supabase/functions/_shared/accountantNotifications.ts` —
קטלוג משותף לאתר ולשרת. הוא מייצר את תיבות הסימון בלשונית "התראות למשרד"
במסך המשרד, והוא גם השער ב-`notify-accountant`. ההגדרות נשמרות ב-
`profiles.settings.accountantNotifications`, ורק סטיות מברירת המחדל נשמרות —
כך שינוי ברירת מחדל בעתיד יחול גם על מי שלא נגע בה.

**להוסיף אירוע התראה חדש:** רשומה בקטלוג + קריאה ל-`queue_accountant_notification`
מהמקום שבו האירוע קורה + בונה מייל ב-`notify-accountant` לפי אותו `kind`.
תיבת הסימון נולדת לבד. אין קוד UI להוסיף.

**Edge Function חדשה:** `portal-upload-document` (verify_jwt=false) — העלאת קובץ
מדף ציבורי. `tokenKind=portal` ללקוח, `tokenKind=release` לרו"ח הקודם. מגבילה
10MB ורשימת סוגים סגורה, כותבת ל-bucket `client-documents`, יוצרת רשומת מסמך,
מסמנת את הפריט, רושמת ביומן, ומעבירה כדור כשהכול הגיע.

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

## תיקיות במסמכי הלקוח (2026-08-05)

| # | שם המיגרציה | מה היא עושה |
|---|---|---|
| 67 | `document_folders_67` | טבלת `document_folders` (תיקייה לכל לקוח, `parent_id` לתת-תיקיות, אינדקס ייחודי על שם באותה רמה) ו-`documents.folder_id`. מסמך בלי `folder_id` יושב ברמה הראשית — בדיוק כמו קודם. מחיקת תיקייה **אינה מוחקת קבצים**: `on delete set null` מחזיר אותם לרמה הראשית, ותת-תיקיות נגררות ב-cascade. הקובץ ב-Storage לא זז — הנתיב נשאר `<user_id>/<client_id>/<doc_id>`, והתיקייה היא ארגון לוגי בלבד, ולכן שינוי שם או העברה אינם נוגעים בבייטים. הנוסח: `67-document-folders.sql` |

## הדף האישי — ההצעה והייצוג כשלבים (2026-08-09)

| # | שם המיגרציה | מה היא עושה |
|---|---|---|
| 74 | `portal_parallel_view_74` | שינוי ניסוח ב-`get_client_portal` בלבד. `"אישור הצעת המחיר"` → `"הצעת המחיר אושרה"` (אבן דרך, לא מטלה); שורות הייצוג מקבלות `label` קבוע `"ייפוי הכוח"` ו-`sub` שמתאר גם מה נסגר וגם מה קורה עכשיו (`"נחתם על ידך — עכשיו בבדיקה ובחתימה אצלנו"` / `"נחתם והוגש לרשויות המס — ממתינים לאישור"`), וכך גם המתנה לחתימת בן/בת הזוג. נדרש כי הדף מאחד את הדליים `office` ו-`done` למקטע אחד ("במקביל") — כל שורה חייבת לעמוד בפני עצמה. המבנה, הדליים והלוגיקה זהים ל-`live-2026-08-07`. הנוסח: `74-portal-parallel-view.sql` |
| 75 | `portal_representation_standalone_75` | `get_client_portal` בונה את שורת הייצוג מ-`representation_requests` עצמה (`v_rep_item`) ולא רק מהלולאה על השלבים — בקשת ייצוג שנפתחה לבדה (בלי הצעה והתקשרות) כבר לא מציגה דף ריק, ו-`journeyStage` מזהה את המצב הזה כ-`identity`. **הוחלה חיה ב-2026-08-09 מחוץ לטבלת המיגרציות** (דרך כלי ההחלה של אותו יום); מתועדת כאן בדיעבד. הנוסח: `75-portal-representation-standalone.sql` |

## מהלך "מרכז התיק" (2026-08-09 ואילך)

| # | שם המיגרציה | מה היא עושה |
|---|---|---|
| 76 | `76-template-applies-as-draft` | `apply_journey_template` מחשבת אם דף הלקוח חשוף כרגע (אותו כלל כמו `get_client_portal`: אין התקשרות ⇒ חשוף; יש ⇒ רק אחרי `process_published_at`) ומעבירה `p_published => not v_exposed` — תבנית שמוחלת על דף חשוף יוצרת **טיוטות** שגיא פותח במפורש, ולעולם לא חושפת בקשות בשקט (הכרעת D4, `docs/EMAIL-POLICY.md` §9). לפני פרסום התהליך אין שינוי בהתנהגות. אומתה ב-Staging על שלושת המצבים (מפורסם ⇒ טיוטה; לא מפורסם ⇒ רגיל; בלי התקשרות ⇒ טיוטה) ו-`public_link_health()` ירוק אחרי ההחלה. ההגדרה שנדרסה: `live-2026-08-09/apply_journey_template.sql`. הנוסח: `76-template-applies-as-draft.sql` |
| 77 | `77-published-column-model` | מצב הפרסום פר-בקשה עובר ממוסכמת `payload.published` לעמודות אמיתיות: `onboarding_steps.published_at` (null = טיוטה; ברירת מחדל `now()` כדי שכל מסלולי היצירה הקיימים יתנהגו בדיוק כמו היום) ו-`draft_payload` (שכבת עריכה עתידית לבקשה שפורסמה — עדיין לא בשימוש). מילוי-לאחור לפי המוסכמה, ואז: `get_client_portal` ו-`portal_submit_step` קוראים את העמודה (הוחלפו בשיטת string-replace על ההגדרה החיה עם שומר כישלון); `create_onboarding_request`, `publish_onboarding_request`, `add_intake_questionnaire_step` כותבים אותה **ומתחזקים את המראה** `payload.published` עד שה-UI ופונקציית ההעלאה יעברו לעמודה. אינווריאנט נאכף בסוף המיגרציה: `published_at is null ⇔ payload.published='false'`. אומתה ב-Staging (22 לקוחות, אפס הבדל בפלט הפורטל + מחזור טיוטה מלא) ובפרודקשן (3 פורטלים זהים, 46 שלבים עומדים באינווריאנט, `public_link_health()` ירוק). הנוסח: `77-published-column-model.sql` |
| 78 | `78-multi-parent-dependencies` | תלות מרובת-הורים: טבלת `onboarding_step_dependencies` (מקור אמת חדש, RLS כמו השלבים) + מילוי-לאחור מהעמודה; טריגר `trg_sync_step_dependency` מסנכרן את העמודה הישנה לטבלה כך שכל הכותבים הקיימים ממשיכים לעבוד; `onboarding_dependency_met` דורשת שכל ההורים (איחוד טבלה+עמודה) מולאו, באותם כללי ריכוך; `unlock_dependent_steps` משחררת ילדים משני המקורות רק כשהכול מולא; ו-RPC חדש `set_onboarding_step_dependencies(p_step_id, p_depends_on[])` — עריכת תלויות אחרי יצירה, עם דחיית מעגלים (CTE רקורסיבי), נעילה/שחרור בין pending⇄locked בלבד, ויומן. אומתה ב-Staging (10 בדיקות: הורה כפול חוסם עד שהאחרון מושלם, מעגל נדחה, נעילה-מחדש, cascade) ובפרודקשן (10=10 קשתות, קישורים ירוקים). הנוסח: `78-multi-parent-dependencies.sql` |
| 79 | `79-journey-stages` | שלבי-על בתיק: טבלת `journey_stages` (שם, סדר, RLS כמו התבניות, ניהול ישיר דרך PostgREST) + `onboarding_steps.stage_id` (רשות; `on delete set null` — מחיקת שלב-על מחזירה בקשות לשלב ברירת-המחדל הנגזר מ-track בצד התצוגה, בלי backfill). לשלב-על **אין** עמודת סטטוס — פעיל/הושלם/עתידי נגזר תמיד מהבקשות שבתוכו. שיוך בקשה לשלב רק דרך RPC `set_onboarding_step_stage` (מוסכמת "אין UPDATE ישיר על onboarding_steps"), עם אימות שהשלב שייך לאותו לקוח. אומתה ב-Staging (יצירה, שיוך, דחיית שלב של לקוח אחר, מחיקה שמאפסת ולא מוחקת) ובפרודקשן (קישורים ירוקים). הנוסח: `79-journey-stages.sql` |
| 80 | `80-portal-preview` | תצוגה מקדימה אמיתית של הדף האישי: הגוף של `get_client_portal` עובר (בניתוח string-replace על ההגדרה החיה, עם שומרי כישלון) לפונקציית ליבה `build_client_portal(p_client_id, p_mode)`; `get_client_portal(p_token)` הופכת לעטיפה דקה — התנהגות זהה, הוכח בהשוואת פלט לפני/אחרי; ו-`get_client_portal_preview(p_client_id, p_mode)` חדשה לרו"ח המחובר בלבד (בעלות נאכפת): `live` = מה שהלקוח רואה עכשיו, `preview` = אחרי פרסום — טיוטות נכנסות ומסומנות `draft:true`, בלי שער הפרסום ובלי שורת "אנחנו מכינים". הליבה חסומה לקריאה ישירה. אומתה ב-Staging (עטיפה=ליבה על 22 לקוחות; טיוטה נראית רק ב-preview ומסומנת; משתמש זר ⇒ forbidden) ובפרודקשן (3 פורטלים זהים, קישורים ירוקים). הנוסח: `80-portal-preview.sql` |
| 81 | `81-publish-case-changes` | הכרעת D4 בצד השרת: `publish_case_changes(p_client_id)` — פרסום בלבד, אפס מיילים. פותחת תהליך שטרם נפתח (דרך `publish_onboarding_process` הקיימת), מחילה עריכות ממתינות מ-`draft_payload` בעזרת `merge_step_draft` (תוכן מהטיוטה, מצב — done/value/documentId — מהחי לפי key, כך שעריכת נוסח לעולם לא דורסת התקדמות של הלקוח), וחושפת טיוטות (`published_at`). אומתה ב-Staging בתרחיש מלא: לקוח השלים דרישה בין העריכה לפרסום — הכותרת החדשה פורסמה וההשלמה נשמרה; הפורטל הציג את הישן עד הפרסום ואת החדש אחריו. `public_link_health()` ירוק בפרודקשן. הנוסח: `81-publish-case-changes.sql` |
| 82 | `82-composer-and-input-types` | שחרור 6+7 של מרכז התיק, צד השרת: `ball` מקבל `external`; `validate_requirements` (סוגי קלט: confirm/text/email/phone/number/date/select+options/file/files+maxFiles, ולכל אחד `required`); `create_onboarding_request` נוספו `p_owner` (client/me/external — משימת "אני" בלי דרישות, גורם חיצוני עם `payload.externalParty`) ו-`p_stage_id` (החתימה הישנה הוסרה ב-DROP — לקח ממיגרציה 68); `update_onboarding_request` חדשה — טיוטה נערכת במקום, בקשה שפורסמה נערכת אל `draft_payload`; `portal_submit_step` הוחלפה — אימות פר-סוג (bad_email/bad_phone/bad_number/bad_date/bad_choice) ו**השלמה לפי דרישות חובה בלבד** (רשות לא חוסמת; תלויות נפתחות כשכל החובה הושלמו); `build_client_portal` (ניתוח עם שומרים) — ספירה לפי חובה, `canUpload` גם ל-files, ופלט דרישות עם required/options/maxFiles/fileCount. Edge Function `portal-upload-document` v2: קיבול `files` מרובה עם documentIds ותקרת maxFiles, שער פרסום לפי העמודה, והשלמה לפי חובה. אומתה ב-Staging (15 בדיקות RPC + העלאה כפולה אמיתית ב-curl, שלישית נדחית בתקרה) ובפרודקשן (קישורים ירוקים + לולאה מלאה בדפדפן על לקוח הבדיקה). הנוסח: `82-composer-and-input-types.sql` |
| 83 | `83-automatic-tasks` | הכרעת D3: משימות אוטומטיות שנחמשות רק בפרסום ומתבצעות בדיוק פעם אחת. `execute_automatic_step` — שער הערכה (autoAction=email, לא-טיוטה, סטטוס פתוח, כל התלויות, שער פרסום התהליך, **דרישת-קשר לגורם חיצוני** — נבדקת תמיד, אינה תלות) שמפרסם `net.http_post` פנימי ל-`send-step-email` (דפוס מיגרציה 72, נרשם בתור ויוצא אחרי commit); `claim_auto_execution`/`release_auto_execution` — התביעה האטומית ושחרורה על כישלון (service_role בלבד); `unlock_dependent_steps` יורה על ילד שנפתח; `publish_case_changes` מעריך-מחדש אחרי חימוש ומחזיר `autoQueued`. Edge `send-step-email` v13: מסלול סוד פנימי, נמען חיצוני מהכרטיס/ידני בלי קישור הפורטל, מפתח `auto:step:<id>`, אירוע `actor=system` "בוצע אוטומטית". אומתה ב-Staging (8 בדיקות) ובפרודקשן במסירה אמיתית ל-delivered@resend.dev על לקוח הבדיקה (delivered; פרסום חוזר autoQueued=0). מנגנון מייל הייצוג לא נגע. הנוסח: `83-automatic-tasks.sql` |
| 84 | `84-templates-v2` | תבנית מסע שומרת את התהליך כולו: מפתח יחסי לכל רשומה (`key`), שלב-על (`stageTitle`/`stageOrder`), בעלים (`owner` נגזר מהכדור/מהגורם), תלויות כמפתחות יחסיים כולל **מרובות-הורים** (`dependsOn[]`), תצורת דרישות מלאה (kind, required, options, maxFiles), `autoAction`, `externalParty`, `requiredForClose`, ותאריך יעד יחסי (`dueInDays`). מצב ריצה (`autoExecutedAt`/`autoError`, ערכים שהתקבלו) נשאר מחוץ לתבנית. ההחלה **תמיד יוצרת טיוטות** (`p_published => false`) ולכן גם אוטומציה שנשמרה אינה חמושה עד "עדכן את דף הלקוח"; מפתחות התלות ממופים למזהים החדשים, שלב-על נוצר לפי שם (ולא משוכפל), והדדופליקציה הקיימת נשמרת. תאימות לאחור מלאה: רשומות v1 (בלי key/stage/owner) מוחלות כמו קודם — נבדק על תבנית v1 אמיתית. אומתה ב-Staging (round-trip מלא + החלה חוזרת ללא שכפול) ובפרודקשן (E2E: 15 רשומות, 15 טיוטות, שתי תלויות רב-הוריות מופו). הנוסח: `84-templates-v2.sql` |
| 85 | `85-fix-dependency-edge-rewrite` | **תיקון באג שהתגלה ב-E2E:** `set_onboarding_step_dependencies` מחקה את כל הקשתות והסתמכה על טריגר הסנכרון שיכתוב מחדש את קשת ההורה הראשון — אבל טריגר לא יורה כש-UPDATE אינו משנה ערך, ולכן כשההורה הראשון נשאר אותו הורה הקשת שלו נעלמה. האכיפה לא נפגעה (`onboarding_dependency_met` מאחדת טבלה+עמודה), אבל שורת "ממתין ל:" הציגה הורה אחד במקום שניים. התיקון: כותבים את **כל** ההורים לטבלה במפורש (`on conflict do nothing`), והטריגר נשאר לכותבים הישנים. כולל מילוי-לאחור לקשתות חסרות. אומתה ב-Staging (אותו הורה ראשון ⇒ 2 קשתות; ניקוי מלא ⇒ 0) ובפרודקשן דרך הממשק. הנוסח: `85-fix-dependency-edge-rewrite.sql` |
| 86 | `86-template-entry-identity` | **תיקון חוסם-שחרור:** זהות בקשה חופשית בהחלת תבנית נקבעה לפי הכותרת (ירושה ממיגרציה 65), ולכן תבנית v2 עם שתי בקשות שונות באותה כותרת יצרה אחת בלבד — הפרה של נאמנות ה-round-trip. מעכשיו כל רשומת v2 נושאת `key` יציב, וההחלה חותמת אותו על הבקשה שנוצרה (`payload.templateOrigin = {templateId, key}`); **הזהות היא (מזהה תבנית, מפתח)**, לא הכותרת. הכותרת נשארת נפילה-אחורה מול שורות שאינן חתומות על ידי אותה תבנית — כך תבנית עדיין לא מכפילה בקשה שגיא יצר ידנית, אך שתי תאומות מאותה תבנית אינן בולעות זו את זו. תבניות v1 (בלי `key`) — התנהגות זהה לקודם, לפי כותרת; התבנית החיה בפרודקשן לא נכתבה מחדש. `save_journey_template` מנקה `templateOrigin` כדי שחותמת ישנה לא תיכנס לתבנית חדשה. גם קריסת רשומות ללא כותרת נפתרה מאותו שורש. שער רגרסיה חדש: `scripts/staging-test-journey-templates.mjs` (23 טענות). הנוסח: `86-template-entry-identity.sql` |
| 87 | `87-derive-lifecycle-stage-onboarding-fallback` | **תיקון "בקליטה" תקוע:** `derive_lifecycle_stage` נפלה, כשאף איתות חי לא תאם, לערך `lifecycle_stage` הנוכחי כמו שהוא (`else c.lifecycle_stage`) — כך מחיקת בקשת הייצוג היחידה של אדם הייתה משאירה אותו "בקליטה" לנצח, כי שום מקום אחר בקוד לא כותב `'onboarding'` ישירות (הערך נכתב רק על ידי הפונקציה הזו עצמה בעבר). נוסף תנאי אחד: `when c.lifecycle_stage = 'onboarding' then 'lead'` — רק לערך המאוחסן `'onboarding'`, לא ל-`'active'`/`'quoted'`/`'lead'` (אלה יכולים להיות ערך מכוון, כמו שחזור מארכיון שכותב `'active'` ישירות). אומת בקריאות read-only בפרודקשן לפני ההחלה: כל 9 הלקוחות במצב `active` וכל 9 ב-`onboarding` כבר תואמים איתות חי אמיתי — אפס לקוחות קיימים הושפעו. אומת ב-Staging: מחיקת הבקשה היחידה של לקוח הופכת אותו ל-`lead` מיד ("חדש · ממתין לטיפול" במסך הלקוחות), ייצוג בתהליך נשאר `onboarding`, ולקוחות `active` נשארים `active`. הנוסח: `87-derive-lifecycle-stage-onboarding-fallback.sql` |
| 90 | `90-tax-fact-reconciliation` | **M1 — בעלות והתאמה על עובדות מקצועיות בתיק המס.** טבלה חדשה `tax_fact_changes` (מעברים בלבד — pending/accepted/rejected; `clients` נשאר הערך המקובל, אפס עמודות חדשות שם). שלוש פונקציות security definer: `propose_tax_facts` (שאלון/יישור קו/יבוא — לעולם לא כותבת ל-clients, כל הצעה נוחתת pending; אינדקס ייחודי חלקי על (client_id,field_key) where pending הופך הצעה חוזרת לרענון ולא לשכפול), `accept_tax_fact_change`/`reject_tax_fact_change` (מסמנות בלבד — הכתיבה בפועל ל-clients נשארת בצד הלקוח דרך updateClient() הטיפוסי הקיים, ורק אחרי הצלחתה מסמנים accepted; לא נבנה מנוע jsonb-לעמודות-מוקלדות גנרי), ו-`record_manual_fact_change` (עריכת רו"ח נכנסת ישר כ-accepted — היא כבר ההחלטה הסופית; מקור מתחרה שיגיע אחר כך נופל ל-pending ולא דורס אותה). RLS: SELECT בלבד; כל שינוי status עובר רק דרך הפונקציות (כמו onboarding_steps). אומת ב-Staging (21 טענות: הצעה לא כותבת, אישור כותב, דחייה נשמרת ולא מוחקת, עריכה ידנית accepted מיידי, מקור מתחרה לא דורס ערך ידני, אידמפוטנטיות של הצעה חוזרת, בעלות) ובפרודקשן (טבלה קיימת, `public_link_health()` ירוק). שער רגרסיה חדש: `scripts/staging-test-tax-fact-reconciliation.mjs`. הנוסח: `90-tax-fact-reconciliation.sql` **‼ הוחלף חלקית ב-91 — ראה שם: הכתיבה-בשני-שלבים דרך הצד הלקוח לא הייתה אטומית.** |
| 91 | `91-tax-fact-transactions` | **תיקון אטומיות (בעקבות סקירה).** הבעיה: `accept_tax_fact_change`/`record_manual_fact_change` ב-90 רק סימנו status; הכתיבה בפועל ל-`clients` קרתה בצד הלקוח, בקריאת רשת נפרדת — לא אטומי (כישלון בין השתיים משאיר עובדה מקובלת בלי סטטוס תואם). הפתרון: פונקציית פנימית חדשה `_tax_fact_field_op` — allowlist קשיח (לא SQL דינמי) של 32 מפתחות מקצועיים מוכרים, כל אחד ממופה לעמודת `clients` ספציפית וטיפוסה (קריאה/כתיבה+`field_meta`); לא נגישה מ-`authenticated` (revoke מלא). `accept_tax_fact_change` ו-`record_manual_fact_change` נכתבו מחדש: קריאת הערך הנוכחי, **בדיקת עדכניות** (משווה מול `old_value.patch` שנשמר בהצעה — אם הערך המקובל כבר השתנה, נדחה כ-`stale_conflict` ולא נדרס בשקט), כתיבת `clients`+`field_meta`, וסימון הסטטוס/ההיסטוריה — הכל בקריאת RPC אחת; בלוק EXCEPTION בגוף הפונקציה = SAVEPOINT אוטומטי, כל כשל (כולל מפתח לא מוכר) מגלגל הכל אחורה. גם `CardSectionEditor` (עורך "עדכן בכרטיס" בתוך השאלון, ב-`Questionnaire.onPatchClient`) עבר לנתיב הזה עבור שדות מקצועיים — זיהוי/קשר ממשיכים ב-`updateClient()` הרגיל. אומת ב-Staging (32 טענות חדשות: אטומיות אישור/עריכה ידנית, כשל מאולץ לא משאיר כתיבה חלקית, הצעה מיושנת נדחית, allowlist מלא כולל מפתח לא מוכר, ובעלות אמיתית מול משתמש שני שנוצר לצורך הבדיקה — כולל RLS בפועל דרך `set role authenticated`) ובפרודקשן (`get_advisors` — רק אזהרות security-definer צפויות, שום דבר חדש). שערי רגרסיה: `scripts/staging-test-tax-fact-atomicity.mjs` (החדש) + `scripts/staging-test-tax-fact-reconciliation.mjs` (הישן, עדיין ירוק). הנוסח: `91-tax-fact-transactions.sql` |
| 92 | `92-institution-alignment` | **M2 — יישור קו מול הרשויות.** יכולת אחת בשלושה הקשרי מחזור-חיים, לא שלושה מימושים. שני שלבי-על חדשים ב-`onboarding_steps`: `institution_alignment_{btl,vat,income}` (allowlist סגור ⇒ ערך ייעודי לכל מוסד, לא `institution_alignment`+key, כדי שאינדקס הייחודיות הקיים לפי (client_id,step_type) ימשיך לעבוד) ו-`opening_call` (לקליטה חדשה בלבד, תלוי בשלושתם דרך `onboarding_step_dependencies` — multi-parent קיים, לא נבנה מנגנון תלות שני). `scope='person'` — בדיוק מה שמאפשר "הקמת תיק במערכת"/"יישור קו מחדש" ללקוח בלי `engagement_id`. פונקציה חדשה `ensure_institution_alignment_steps(client_id, engagement_id, include_opening_call)` — אידמפוטנטית כמו `generate_onboarding_steps`, יוצרת `journey_stage` משותף "יישור קו מול הרשויות" + שלושת שלבי המוסדות (+ opening_call לקליטה). `reopen_institution_alignment(step_id)` — "ריצה מחדש" שמצלמת payload נוכחי ל-`payload.history` ואז קוראת ל-`advance_onboarding_step('reopen')` הקיימת — לא פותחת קליטה חדשה, לא משכפלת לוגיקת סטטוס/יומן. 17 עמודות מקצועיות חדשות על `clients` (יתרות/עיסוקים/פרטי תיק/הרשאות חיוב לכל רשות בנפרד — לא מוסקות זו מזו) + הרחבת ה-allowlist של M1 (`_tax_fact_field_op`) בעמודות האלה ובשמונה עמודות קיימות שנשארו בכוונה מחוץ ל-allowlist ב-M1 (`vatFrequency`,`pitAdvancePercent/Frequency`,`bookStatus`,`withholdingRate`,`hasExemptFromWithholding`,`niAdvanceMonthly`,`taxOfficeName`) — "יהפכו למנוהלים כש-M2 יבנה את מקור יישור הקו", בדיוק כפי שתועד בדוח M1. בקשת לקוח (הרשאת חיוב חסרה) ממשיכה להשתמש ב-`create_onboarding_request` הקיימת (`p_published=false`) — אין מנגנון טיוטה שני. אומת ב-Staging (יצירה אידמפוטנטית, נעילה/שחרור multi-parent אמיתיים, reopen שומר היסטוריה ומאפס סטטוס, regression מלא של M1/אטומיות עדיין ירוק) ובפרודקשן (`get_advisors` — רק אזהרות security-definer צפויות). הנוסח: `92-institution-alignment.sql` |
| 93 | `93-institution-alignment-onboarding-trigger` | **M2 המשך — יישור קו נכנס אוטומטית לקליטה חדשה.** `create_engagement_for_quotation` היא נקודת החוט היחידה שבה קליטה נפתחת (אישור הצעת מחיר); התוספת היחידה בשלושת ה-return points שלה שכבר קוראים ל-`generate_onboarding_steps`+`add_intake_questionnaire_step`: קריאה שלישית ל-`ensure_institution_alignment_steps(client_id, engagement_id, true)` — אידמפוטנטית, ולכן בטוחה בכל נתיב (חוזה קיים, מרוץ על conflict, יצירה חדשה) בלי לשנות שום דבר אחר בפונקציה. לצד זה: תיקון פערי טיפוסים שהתגלו במימוש ה-UI — `vatFrequency`/`pitAdvanceFrequency` הם enum (`'monthly'|'bi_monthly'`) לא טקסט חופשי, ו-`bookStatus` הוא enum (`'kosher'|'rejected'|'unknown'`) — הרכיב ב-React ממפה תוויות עברית לערכים הנכונים לפני ההצעה ל-M1; ו-`FieldSource` (types/clientWorkspace.ts) קיבל `'institution_alignment'` כדי ש-field_meta.source שכותב `_tax_fact_field_op` יהיה תואם טיפוסים בצד הלקוח. אומת ב-Staging: שער רגרסיה חדש `scripts/staging-test-institution-alignment.mjs` (26 טענות — יצירה אוטומטית בקליטה חדשה, הקמת תיק במערכת בלי קליטה מזויפת, אידמפוטנטיות, התקדמות/ריצה-מחדש/היסטוריה, עובדה מקצועית דרך M1 + קונפליקט לא נדרס, הרשאות חיוב מע״מ/מס הכנסה עצמאיות, טיוטת בקשה לא-גלויה→גלויה אחרי פרסום, הבהרה על שיחת הפתיחה, בעלות) — כולם ירוקים; שערי הרגרסיה הקיימים של M1/תבניות (`staging-test-tax-fact-reconciliation.mjs`, `staging-test-tax-fact-atomicity.mjs`, `staging-test-tax-fact-legacy-writers.mjs`, `staging-test-journey-templates.mjs`) עדיין ירוקים ללא שינוי. הנוסח: `93-institution-alignment-onboarding-trigger.sql` |
| 94 | `94-institution-alignment-fidelity` | **M2 תיקון נאמנות (בעקבות סקירת Product/UX על 774f4fa).** שני נתונים שב-92 נשמרו רק ב-`payload.collected` ("לתיעוד בלבד") מוכרזים עובדות מקצועיות מאושרות, באותה צורה בדיוק כמו שאר 17 העמודות: `ni_income_basis_monthly` (בסיס הכנסה למקדמות — ביטוח לאומי) ו-`income_tax_reporting_status` (מצב דיווחים — מס הכנסה, טקסט חופשי לפי הערך שמופיע ב-134 מקדמות, לא enum סגור). `_tax_fact_field_op` נכתבה מחדש עם שני ענפים נוספים בלבד (35→37) — אין עריכה במיגרציות 92/93 שכבר הוחלו. בצד ה-React: השדות מקבלים `governedKey` ומנותבים דרך propose/accept כמו כל שדה אחר; `TaxFileTab.tsx` מציג אותם בפירוט המורחב (ביטוח לאומי/מס הכנסה בהתאמה) עם פרובננס "מקור: יישור קו מול הרשויות" כשמקורם משם. לצד זה, אותה סקירה דרשה תיקון UX נפרד (לא סכמה): מסך המיקוד של מוסד משתלט כעת על כל גוף לשונית הקליטה (state מנוהל ב-OnboardingTab, לא ב-InstitutionAlignmentGroup) — רשימת הבקשות/ציר הזמן/פס הפרסום נעלמים לגמרי בזמן מיקוד, עם כותרת מוסד גלויה וניסוח חזרה תלוי-הקשר (`חזרה לקליטה`/`חזרה להקמת התיק`/`חזרה לתהליך`, נגזר מ-`client.lifecycleStage`+קיום התקשרות היסטורית). אומת ב-Staging: 6 טענות חדשות ב-`scripts/staging-test-institution-alignment.mjs` (T16/T17 — שני השדות עוברים דרך M1, קונפליקט על אחד מהם לא נדרס) + הרצה מלאה של כל 32 הטענות הקודמות עדיין ירוקות; שערי M1 (`staging-test-tax-fact-atomicity.mjs` 32, `staging-test-tax-fact-reconciliation.mjs` 21, `staging-test-tax-fact-legacy-writers.mjs` 9) ו-`staging-test-journey-templates.mjs` (23) — כולם ירוקים ללא שינוי. הנוסח: `94-institution-alignment-fidelity.sql` |

| 95 | `95-documents-labels-and-links` | **M3 חלק א — מסמכים: תוויות מקצועיות, שנה על תיקיות, קישור רב-לקוחי.** "מערכת קבצים רגילה + שכבת מטא-דאטה מקצועית דקה": כל מסמך/תיקייה מקבלים תווית אחת בלבד (לא תגיות מרובות — `tags`/`status` הקיימים בטבלה נשארים כפי שהם, לא בשימוש, לא נמחקים) ושדה שנה. טבלה חדשה `document_labels` (תוויות מנוהלות-משרד, RLS לפי `user_id`, מחיקה ישירה חסומה — רק דרך RPC) + עמודות `label_id`/`year` על `documents`/`document_folders`. טבלת קישור חדשה `document_clients` (מסמך אחד יכול להיות מקושר לכמה לקוחות; התיקייה עצמה נשארת חד-לקוחית). מילוי-לאחור שמרני: לכל משתמש עם מסמכים/תיקיות קיימים נוצרת תווית שמורה `'לבדיקה'` (ברירת מחדל ל-legacy שטרם סווג — לא מנחשים תווית מקצועית), ותיקיות קיימות ללא שנה מקבלות `'כללי'`. RPC חדש `delete_document_label` — תווית שמורה לעולם לא נמחקת; תווית רגילה עם פריטים משויכים מעבירה אותם ל-`'לבדיקה'` לפני המחיקה. שכבת ההרשאה השנייה (`require_authorized`, ממיגרציה 15) מורחבת לשתי הטבלאות החדשות. הנוסח: `95-documents-labels-and-links.sql` |
| 96 | `96-document-link-ownership` | **תיקון פער בעלות, בעקבות שער השחרור של M3.** המדיניות שנוצרה ב-95 על טבלאות הקישור בדקה רק ש-`user_id` בשורה הנכתבת הוא המשתמש המחובר — לא שהמסמך/הלקוח/המשימה שאליהם השורה מצביעה שייכים לו גם הם. התוצאה: משתמש אחד יכול היה לכתוב שורת קישור שמצביעה על מסמך של משתמש אחר ולתלות אותו על לקוח של אותו משתמש אחר — כתיבה חוצת-בעלות שמזהמת את התצוגה של המשתמש השני (אין דליפת קריאה: `documents` עצמה מסוננת לפי בעלות, כך שהצד המותקף לא רואה תוכן זר). התיקון: מדיניות ה-INSERT על `document_clients` נדרשת גם `exists` על `documents`/`clients` בבעלות הכותב; מדיניות ה-INSERT על `document_task_links` (טבלה שקדמה ל-95 אך נכנסה לשימוש בפועל רק דרכה) נדרשת `exists` על `documents`/`tasks` בבעלות הכותב (`tasks.client_id` יכול להיות `null` — משימה פנימית — ולכן הבדיקה היא על בעלות המשימה, לא על הלקוח שלה). אין שינוי התנהגות לשימוש תקין: המסך תמיד מקשר פריטים של אותו משתמש; פונקציות קצה עם service role (`portal-upload-document`) עוקפות RLS ואינן מושפעות. אומת ב-`scripts/staging-test-document-security.mjs` (כתיבה חוצת-בעלות נדחית, קריאה/מחיקה של קישור זר נדחות, בעלים אמיתי יכול למחוק). הנוסח: `96-document-link-ownership.sql` |

## מהלך "בקשה/דף לקוח מאוחדים" — אבטחת טוקן וניסוח (2026-08-14)

| # | שם המיגרציה | מה היא עושה |
|---|---|---|
| 97 | `97-portal-token-hardening` | **הקשחת אבטחה, בעקבות בדיקת אבטחה יזומה לפני איחוד הדף האישי.** ארבע עמודות חדשות ב-`clients`: `portal_token_expires_at`/`portal_token_last_used_at`/`intake_token_expires_at`/`intake_token_last_used_at` (כולן רשות, בלי תוקף כפוי כברירת מחדל — החלטת עיצוב מכוונת, מתועדת בקובץ). `rotate_portal_token(p_client_id)` — RPC חדש להנפקת טוקן חדש שמבטל את הקודם מיידית (כפתור "קישור חדש ללקוח" ב-`SendPortalDialog`). `get_client_portal`, `portal_submit_step`, `resolve_intake_token`, `start_intake` נבדקות מול תוקף ומתעדות שימוש אחרון. גם `index.html` קיבל `<meta name="referrer" content="no-referrer">` — דף ציבורי נושא טוקן ב-URL, וקישור חיצוני היה מדליף אותו ב-Referer. אומת ב-Staging וב-Production דרך `scripts/staging-test-portal-security.mjs` (13 טענות: רוטציה מבטלת טוקן ישן, בידוד בין לקוחות, סינון דליים, scoping טוקן חתימה, תפוגת הצעת מחיר). הנוסח: `97-portal-token-hardening.sql` |
| 99 | `99-portal-future-steps` | **הדף האישי מציג גם את מה שייפתח בהמשך — הכרעת מוצר מאושרת (2026-08-15, `docs/prototypes/requests-v2-approved.html`).** עד כה שלב נעול נשלח מהשרת בדלי `future` ונזרק בדפדפן, ולכן הלקוח לא ידע שיש המשך: "הרשאה לחיוב חודשי" פשוט הופיעה יום אחד כאילו צצה משום מקום. מעכשיו שלב **שפורסם** ונעול מוצג בשמו האמיתי, עם נעילה ועם משפט שאומר מה יפתח אותו. פונקציה חדשה `portal_lock_reason(step_id)` — מרכיבה "ייפתח אחרי «X»" מכל ההורים **שעדיין חוסמים** (איחוד `onboarding_step_dependencies` + עמודת `depends_on_step_id`), בניסוח ללקוח (`clientTitle`) ולא בכותרת הפנימית. `build_client_portal` נכתבה מחדש באותה חתימה בדיוק (ולכן ה-ACL נשמר) עם ארבעה שינויים: `client_documents` ו-`prev_accountant_details` במצב נעול עוברים מ-`action` ל-`future` — **סגירת פער אמיתי**, כי עד היום הם הציגו ללקוח כפתור פעולה על שלב שהשרת דוחה (`portal_submit_step` → `'locked'`), ובמסלול ההעלאה אף הצליחו לפתוח אותו בדלת האחורית (`portal-upload-document` אינו בודק `locked`); `custom_request` ו-`retainer_authorization` הנעולים קיבלו את משפט הסיבה; `intake_questionnaire` נעול קיבל ייצוג. ‼ הגבול שלא זז: טיוטה (`published_at is null`) עדיין אינה מגיעה ללקוח כלל — הסינון בשאילתת הלולאה לא נגע. `future` נשאר מחוץ ל-`total` בכוונה, אחרת `journeyStage` היה זז לכל לקוח שיש לו המשך מתוכנן. אומת ב-Staging: שער רגרסיה חדש `scripts/staging-test-requests-v2.mjs` (25 טענות — טיוטה נסתרת, נעול מוצג בלי אחיזה לפעולה, סיבת נעילה, פתיחה אוטומטית, תלות מרובת-הורים, חסימת שרת, גורם חיצוני, תבנית עם תלות, פתיחה מחדש, תאימות לאחור) + `staging-test-portal-security.mjs` (13) ו-`staging-test-journey-templates.mjs` (23) ו-`staging-test-required-model.mjs` (31, אחרי `seed-staging`) — כולם ירוקים. **אומת ב-Production (2026-08-15):** לפני ההחלה אומת שאין דריפט (md5 של ההגדרה החיה `24645f61f4011e1146e03a5ad1eab24c`, זהה לבסיס של 98; נתיב החזרה הוא גוף הפונקציה שב-`98-portal-tax-status-update-label.sql`). אחרי ההחלה, על 18 הלקוחות בפועל: 18/18 דפים נבנים בלי שגיאה, 0 טיוטות דלפו, 0 פריטי `future` נושאים אחיזה לפעולה, 0 שלבים נעולים ב-`action`, ההרשאות על `build_client_portal` נשארו ריקות (anon/authenticated/public), ושומר ה-`locked` ב-`portal_submit_step` במקומו. שני לקוחות אמיתיים (אילן, יובל) מציגים מעכשיו «הרשאת התשלום החודשי — ייפתח אחרי חיבור לפייפרלס»; לשניהם אין טוקן דף אישי מונפק, ולכן אף לקוח לא נחשף בפועל עד שגיא ישלח קישור. הנוסח: `99-portal-future-steps.sql` |
| 98 | `98-portal-tax-status-update-label` | **תיקון ניסוח, בעקבות בדיקת דפדפן אמיתית מול המסך המאוחד.** `build_client_portal` החזירה ללקוח את הניסוח הישן "שאלון פתיחת התיק" לשלב `intake_questionnaire` (גם bucket=done וגם bucket=action), בעוד ש"תיק מס" אצל הרו"ח כבר עבר לניסוח המאושר "עדכן סטטוס מיסויי" (830ec4c). שינוי מילולי בלבד — שתי מחרוזות בתוך אותו case, שום שינוי בלוגיקה/בדליים/בהרשאות. אומת ב-Staging וב-Production: כל 13 טענות `staging-test-portal-security.mjs` עדיין ירוקות (לא נגעו בלוגיקה), ובדפדפן אמיתי מול `?portal=` חי — התווית מוצגת "עדכון סטטוס מיסויי". הנוסח: `98-portal-tax-status-update-label.sql` |

## מהלך "מסך הבקשות המאוחד" (2026-08-16)

| # | שם המיגרציה | מה היא עושה |
|---|---|---|
| 101 | `101-unified-process-staging` | **החוזה טיוטה→פרסום מתרחב גם לסידור ולהסרה.** עד כה `reorder_onboarding_steps` כתבה `sort_order` ישירות ו-`advance('cancel')` ביטלה מיד — כלומר גיא שינה סדר או הסיר בקשה, ודף הלקוח השתנה מתחת לידיו בלי שאישר. שתי עמודות חדשות: `pending_sort_order` ו-`pending_cancel`, ושתיהן **אינן נוגעות במצב `live` של `build_client_portal`** — אפס סיכון לדף החי. חמש פונקציות: `stage_onboarding_steps_order` (סדר ממתין), `set_onboarding_step_pending_cancel` (הסרה ממתינה; דלת-מגן `not_published` — על טיוטה משתמשים ב-`advance('cancel')` הרגילה), `discard_case_changes` ("בטל שינויים" — מאפס סדר/הסרה/`draft_payload`, **ולא מוחק טיוטות שמעולם לא פורסמו**), `publish_case_changes` (מחילה סדר והסרה לפני חשיפת הטיוטות), ו-`build_client_portal` במצב `preview` בלבד ממיין לפי `coalesce(pending_sort_order, sort_order)` ומסמן `removing:true`. הנוסח: `101-unified-process-staging.sql` |
| 102 | `102-representation-lifecycle` | **אין מייל ייצוג אוטומטי מהמסד.** `approve_quotation` הפסיקה לפרסם `net.http_post` ל-`send-onboarding-email`: ההעברה לטופס הייצוג כבר קורית בדפדפן של הלקוח דרך ה-`onboardingToken` שהפונקציה מחזירה, ומייל שני היה כפילות שגורמת ללקוח לחשוב שהוא פספס משהו. `send-onboarding-email` עצמה נשארת — "שלח מייל שוב" ומיילים לחותמים ולבן/בת זוג ממשיכים לעבוד. לצד זה `flag_missing_representation_links` עברה לסמנטיקה כנה: היא בודקת בקשת ייצוג שנשארה `pending_fill` מעל 24 שעות ("הלקוח לא סיים למלא"), ולא `representation_sent_at is null` שמאז השינוי כמעט תמיד נכון. הנוסח: `102-representation-lifecycle.sql` |
| 103 | `103-paperless-honest-retainer` | **פייפרלס — אין קישור הרשאה שני ללקוח.** ההרשאה לחיוב חודשי נוצרת אצל גיא בתוך פייפרלס, והלקוח מתבקש כרטיס בכניסה הבאה שלו לשם. לכן ענף `retainer_authorization` ב-`build_client_portal` הפסיק לייצר פריט `bucket:'action'` עם `actionKind:'external'` — נעול נשאר `future` עם סיבת נעילה, ופתוח הופך לפריט מידע (`bucket:'office'`) בניסוח רגוע. ‼ המערכת אינה יודעת אם הכרטיס הוזן בפועל — אין אירוע כזה מפייפרלס, ולכן ההשלמה נשארת ידנית ולא הומצאה סימולציה. הנוסח: `103-paperless-honest-retainer.sql` |
| 104 | `104-fix-publish-case-changes-auto-eval` | **תיקון רגרסיה שהתגלה בשער הבדיקות.** 101 כתבה מחדש את `publish_case_changes` על בסיס גרסת מיגרציה 81, ובכך הפילה בשקט את לולאת ההערכה-מחדש שמיגרציה 83 הוסיפה — משימות אוטומטיות היו נחמשות בפרסום אך לא נורות, ו-`autoQueued` חזר ריק. הבאג נתפס אך ורק בגלל ש-`staging-test-email-policy.mjs` AT-6 קיים. הפונקציה נכתבה מחדש כאיחוד של שתיהן: סדר והסרה מ-101, לולאת `execute_automatic_step` ו-`autoQueued` מ-83. הנוסח: `104-fix-publish-case-changes-auto-eval.sql` |
| 105 | `105-close-gate-ignores-hidden-office-steps` | **שער סגירת הקליטה מתעלם מעבודה פנימית שהמסך כבר לא מציג.** מסך הבקשות הפסיק להציג את הכרטיסים הפנימיים האוטומטיים (הקמה פנימית, הכרת הלקוח, ביקורת חודש ראשון, שדרוג ייצוג, שיחת פתיחה, פתיחת תיקים, ייבוא ואימות נתונים) — הם הפכו אותו ללוח מטלות של המשרד. `onboarding_close_readiness` המשיכה לספור אותם כחוסמים, כלומר "סגור קליטה" נכשל בגלל פריט שאין למשתמש שום דרך לראות או לסמן. חסימה שאי אפשר לפתור אינה שער. התוספת: תנאי `step_type not in (…)` אחד, ברשימה **זהה בדיוק** לזו שירדה מהמסך ולא רחבה ממנה. ‼ מה שממשיך לחסום: יישור קו מול הרשויות (מוצג ככרטיס "יישור קו ללקוח"), כל בקשה מהלקוח, ומשימה פנימית שהרו"ח הוסיף בעצמו. `required_for_close` ברמת השלב ממשיך לעבוד כרגיל לכל שאר הסוגים. מקבילה ב-TypeScript: `LEGACY_AUTO_OFFICE_TYPES` ב-`src/types/onboarding.ts`, ושער הזהות בין המסך לשרת (`staging-test-required-model.mjs`) עודכן יחד איתה. אומת ב-Staging: שלוש טענות חדשות ב-`staging-test-close-rules.mjs` — הפנימיים לא חוסמים, יישור קו כן חוסם, בקשת לקוח כן חוסמת. הנוסח: `105-close-gate-ignores-hidden-office-steps.sql` |
| 106 | `106-paperless-ownership` | **פייפרלס — בעלות נכונה על שלושת השלבים, והלקוח מאשר בעצמו שנרשם.** עד כה `paperless_invite` לא הגיע לדף הלקוח כלל (`when 'paperless_invite' then continue`), ו-`paperless_connection` הוצג לו ככפתור יוצא לפייפרלס **בלי שום דרך לומר "נרשמתי"** — ולכן הרו״ח היה צריך לנחש מתי הלקוח סיים. הבעלות מתהפכת: `paperless_invite` → `ball='client'` ("הרשמה לפייפרלס", עם קישור ההרשמה של המשרד וכפתור "נרשמתי לפייפרלס" בדף האישי), `paperless_connection` → `ball='me'` ("חיבור לפייפרלס" — נכנסים לחשבון ומשלימים, ושם פייפרלס מבקשת את פרטי האשראי; הלקוח רואה `bucket:'office'` בלי שום פקד), ו-`retainer_authorization` נפתחת אחרי (2) כמו קודם. ארבעה חלקים: `build_client_portal` (שני ענפי הפייפרלס נכתבים מחדש; נעול ⇒ `future` ולא `office`, כדי לא להבטיח "בימים הקרובים ניכנס" בזמן שהכדור עדיין אצל הלקוח), `portal_submit_step` (רשימת ההיתר נפתחת ל-`paperless_invite` — אותה שרשרת סיום בדיוק כמו `prev_accountant_details`: השלמה, יומן, `unlock_dependent_steps`, `queue_accountant_notification`), `generate_onboarding_steps` (החלפה נקודתית עם שומר, **ניתנת להרצה חוזרת**), ומילוי-לאחור ל-`ball` ולניסוח על שורות פתוחות קיימות. **אין מנוע שני ואין מצב חדש** — הבעלות היא עמודת `ball`, הפתיחה היא `unlock_dependent_steps`, וההשלמה של הלקוח היא `portal_submit_step`. אומתה ב-Staging מקצה לקצה בדפדפן: הלקוח אישר → שלב 2 נפתח והוצג לו כ"בטיפול המשרד" בלי פקד; ניסיון שלו להשלים את 2 הוחזר `not_client_editable` ואת 3 `locked`; הרו״ח לחץ "סיימתי" → שלב 3 נפתח. הנוסח: `106-paperless-ownership.sql` |

## ‼ 2026-08-16 — דריפט בין staging לפרודקשן שגרם לתקלה בייצור

**מה קרה.** מיגרציה 106 התקינה בפרודקשן את `portal_submit_step` על בסיס הנוסח
שבקובץ `97-portal-token-hardening.sql`. הנוסח הזה קורא ל-`c.portal_token_expires_at`
ול-`c.portal_token_last_used_at` — **ובפרודקשן העמודות האלה לא היו קיימות**, כי
מיגרציה 97 מעולם לא הוחלה שם (היא הוחלה ב-staging בלבד). התוצאה: כל כתיבה מהדף
האישי החזירה `42703: record "c" has no field "portal_token_expires_at"` — לא רק
אישור הפייפרלס אלא גם מענה על בקשה חופשית ומסירת פרטי הרו״ח הקודם.

**למה staging לא תפס את זה.** ב-staging העמודות קיימות, ולכן הבדיקה מקצה לקצה
עברה שם במלואה. הדריפט היה בכיוון ההפוך מהרגיל: **הפרודקשן היה מאחור**, ולא
ה-staging.

**התיקון.** 97 הוחלה על הפרודקשן (כל שינוייה אדיטיביים: ארבע עמודות nullable בלי
תפוגה כפויה, ו-`rotate_portal_token` שגם הוא היה חסר שם — כלומר כפתור "חדש קישור
לקוח" היה שבור בפרודקשן מאז ומעולם), ואז 106 הוחלה מחדש מעליה כדי להחזיר את ענף
`paperless_invite`. חלון התקלה: 12:44–14:08 UTC. אפס כתיבות של לקוחות נרשמו בו,
כלומר שום נתון לא אבד — מי שניסה קיבל הודעת שגיאה וניסה שוב אחר כך.

**מה ללמוד מזה.** לפני שמעתיקים גוף פונקציה מקובץ מיגרציה אל הפרודקשן — לוודא
שכל מה שהיא נשענת עליו (עמודות, פונקציות עזר) באמת קיים שם. הבדיקה הנכונה היא
`scripts/staging-verify-schema.mjs` בכיוון הפוך, או שאילתת `information_schema`
נקודתית על העמודות שהפונקציה קוראת.

## 110 · בן/בת הזוג הם חלק מהקליטה של משק הבית (2026-08-17)

| # | שם המיגרציה | מה היא עושה |
|---|---|---|
| 110 | `spouse_household_onboarding_110` | עמודות `clients.spouse_first_name/spouse_last_name/spouse_birth_year` + מילוי-לאחור מפיצול `spouse_name`; `submit_onboarding_full` עם שדות בן/זוג מפוצלים (פרמטרים חדשים עם ברירת מחדל — UI ישן ממשיך לעבוד), עדיפות אחידה ללקוח על מצב משפחתי ופרטי בן/זוג, ביטול ירושת המייל של הנישום לחותם בן/הזוג, והסרת חותם בן/זוג ממתין כשהלקוח מתקן ל"לא נשוי"; `get_onboarding` ממזג את נתוני הכרטיס לתוך ה-prefill; `open_quotation_representation` — אותם שינויים בצד ההצעה; `build_client_portal` — פריט "חתימת בן/בת הזוג" הופך לפעולה שפותחת את מסך הבחירה (יחד / קישור אישי) דרך הטוקן של הנישום בלבד. הוחלה על staging ועל הפרודקשן. הנוסח: `110-spouse-household-onboarding.sql` |

**‼ הטלאי של `build_client_portal` (סעיף ה בקובץ) לא נקלט דרך מנגנון המיגרציות** —
בלוק ה-DO רץ בהצלחה רק בהרצה ישירה (execute_sql) בשתי הסביבות. אם מריצים את
הקובץ שוב, להריץ את סעיף ה בנפרד ולוודא בשאילתת `position(...)` שהטקסט הוחלף.

## 115 · מסלול הרו"ח הקודם — השאלה ללקוח נוצרת תמיד (2026-08-18)

| # | שם המיגרציה | מה היא עושה |
|---|---|---|
| 115 | `115-prev-accountant-always-ask.sql` | שלושה טלאים על הפונקציות החיות (pg_get_functiondef + replace, עם בדיקת position שנכשלת בקול): `generate_onboarding_steps` — בקשת `prev_accountant_details` נוצרת תמיד כשיש רו"ח קודם; כשיש כבר אימייל בכרטיס היא בקשת אישור בלבד (`required_for_close=false`, כותרת "לאשר את פרטי רואה החשבון הקודם") ואינה נועלת את מכתב השחרור. `portal_submit_step` — היפוך ה-coalesce: הערכים שהלקוח שלח גוברים על הכרטיס (זה מסך האישור/תיקון). `build_client_portal` — הפריט מקבל `prefill` עם הפרטים הקיימים למילוי-מראש. **הוחלה על staging ועל הפרודקשן (2026-08-18).** |

**‼ להריץ דרך execute_sql ולא apply_migration** (בלוקי DO — ראה הלקח של 101/110),
ולאמת אחרי ההרצה ששלוש ההחלפות נקלטו בשאילתת `position(...)` על שלוש הפונקציות.

**אימות ההחלה בפרודקשן (2026-08-18).** אחרי ההרצה הושוו טביעות ה-md5 של שלוש
הפונקציות בין הפרודקשן לסביבת הבדיקות — **זהות לחלוטין**, כלומר שתי הסביבות
מריצות בדיוק את הקוד שנבדק:
`generate_onboarding_steps` 934368293317aad16c808465d576a658 ·
`portal_submit_step` 6d65415d10c3308c8d77945c2561b9c8 ·
`build_client_portal` 95760f483019f4a679729697638eca8a.
לפני ההחלה נשמרו טביעות המצב הקודם לצורך שחזור: 0e34be0fc3b26ce9ec39def25aec751b ·
1f0757ed8cc56f7ee8aee39aa5bcceda · 700d20e56b03fa93023cedf2db45f36e.
המיגרציה אינה כותבת שום שורה (CREATE OR REPLACE בלבד) — אומת שאף רשומת לקוח
לא נגעה בזמן ההחלה.

## 116 · מסלול הרו"ח הקודם — פחות עבודה לנמען (2026-08-18)

| # | שם המיגרציה | מה היא עושה |
|---|---|---|
| 116 | `116-prev-accountant-handoff-lite.sql` | `get_release_portal` — מחזירה `priority` על כל פריט (וממיינת חשובים ראשונים כבר בשרת, כדי שהמייל, הדף והכרטיס יציגו סדר זהה), `bulkUploads` (מספר הקבצים שהגיעו בלי שיוך) ו-`objectionWindowPassed` (חלון ההתייחסות עבר בלי שנמסרה מניעה — **תצוגה בלבד**, אינו סוגר שלב). פונקציה חדשה `release_portal_mark_items(p_token, p_keys)` — "מה כלל המשלוח": הרו"ח הקודם מסמן מה שלח, והפריטים שסומן מקבלים `done` + `declaredByRecipient`; לעולם אינה מבטלת סימון קיים, אינה נוגעת בפריט רשות, וסוגרת את שלב החומרים רק כשלא נשאר אף פריט חובה פתוח. הרשאה ל-anon+authenticated אחרי `revoke ... from public`. **הוחלה על staging ועל הפרודקשן (2026-08-18).** |

**אימות ההחלה בפרודקשן (2026-08-18).** הורצה דרך `execute_sql` (לא apply_migration).
אחרי ההרצה הושוו טביעות ה-md5 של שתי הפונקציות בין הפרודקשן לסביבת הבדיקות —
**זהות לחלוטין**: `get_release_portal` 11b8c2e2fd46d45cc5656e4c7aad47e7 ·
`release_portal_mark_items` 8fa925d54d5f603783d25ff43cf886b1.
טביעת המצב הקודם של `get_release_portal` בפרודקשן, לצורך שחזור:
59ee1fa4bda6761ef272e30f8076fb74 (`release_portal_mark_items` לא הייתה קיימת שם).

**‼ הערה על ההשוואה הראשונה.** ההרצה הראשונה הודבקה עם הערות העברית של הקובץ
וייצרה גוף פונקציה שונה מ-staging (ההערות נשמרות ב-`pg_get_functiondef`), למרות
שההתנהגות זהה. הוחל שוב בלי אותן הערות כדי ששתי הסביבות יהיו בית-בבית —
**md5 שונה אינו בהכרח התנהגות שונה, אבל השוואה שאינה זהה מאבדת את ערכה כראיה.**

**נבדק בפועל מול הפרודקשן החי (2026-08-18)** על חשבון ה-sandbox
(`86bd219b-…`, הלקוח "רותי לקוח") — 18 בדיקות API, כולן עברו: קריאת הפורטל עם
`priority`/`bulkUploads`/`objectionWindowPassed`, דחיית טוקן לא תקין, העלאה
מרוכזת (`__unfiled__`) שמעלה את מונה הקבצים ו**אינה** סוגרת שום פריט, סימון
"מה כלל המשלוח" (1 סומן → 5 נותרו), אי-כפילות בסימון חוזר, נתיב הדילוג
(רשימה ריקה), ודחיית טוקן לא תקין ב-mark_items. הדף `?release=` נטען מול
הפרודקשן והציג 2 מתוך 7 בלי שגיאות קונסול. **כל השינויים שוחזרו** — השלב חזר
ל-1/7 `waiting_client`, קובץ הבדיקה נמחק מהאחסון ומטבלת המסמכים, ושלושת אירועי
היומן ושלוש ההתראות הממתינות נמחקו.

**‼ התנגשות מספור 115.** בריפו קיימים שני קבצים עם המספר 115:
`115-prev-accountant-always-ask.sql` (הוחל על staging ועל הפרודקשן, מתועד למעלה)
ו-`115-prev-accountant-handoff.sql` מ-2026-08-17 (הוחל, לא תועד) — תוצאה של שני
סשנים מקבילים. **שני הקבצים כבר הוחלו, ולכן אין לשנות את מספרם**: המספר הוא
הדרך היחידה לזהות בדיעבד מה רץ ומתי. הקובץ הזה הוא 116, והמספר הפנוי הבא הוא 117.

**‼ שינוי ב-Edge Function שנלווה למיגרציה.** `portal-upload-document` קיבלה מסלול
העלאה מרוכזת (`itemKey=__unfiled__` עם טוקן release): הקובץ נשמר במסמכי הלקוח
ונרשם ב-`payload.bulkUploads`, ו**אינו מסמן שום פריט כהתקבל ואינו סוגר את השלב**.
הוחלה על staging (גרסה 5, `verify_jwt=false` נשמר). אומת בדפדפן: אחרי העלאה
מוצלחת הצ'קליסט נשאר 0 מתוך 8.

**בפרודקשן היא כבר חיה — גרסה 12, מאז הקומיט `ceedff6`.** ‼ Edge Functions
**אינן** דורשות החלה ידנית: `.github/workflows/deploy-edge-functions.yml` מריץ
`supabase functions deploy --project-ref uoweoqtuiettozagwgdw` בכל push ל-master,
ולכן הן מגיעות לפרודקשן יחד עם הקוד. מה שכן דורש החלה ידנית הוא SQL בלבד
(פונקציות מסד, עמודות, טריגרים) — וזה מה שהלדג'ר הזה מתעד. אומת אמפירית:
העלאה מרוכזת מול הפרודקשן החזירה `unfiled: true` בלי שנפרסה שם ידנית.

---

## 117 — «חומרים מרו״ח קודם» שהוסרה אינה נולדת מחדש

**קובץ:** `117-prev-accountant-stays-removed.sql` · **מוחל על:** staging ✔ · פרודקשן ✔ (2026-08-20)

טלאי יחיד על `generate_onboarding_steps`: התנאי `if v_has_prev then` קיבל בדיקה
נוספת — לא ליצור את שלבי הרו״ח הקודם כשקיימת להם גרסה **מבוטלת** אצל הלקוח.

**למה זה נדרש.** הבדיקה הקיימת בכל שלב היא `status <> 'cancelled'`, כלומר שלב
מבוטל אינו נחשב קיים והמחולל יוצר אותו שוב. והמחולל **רץ שוב על התקשרות קיימת**:
`create_engagement_for_quotation` לוקחת את מסלול `existed=true` ומריצה אותו,
ו-`approve_quotation` קוראת לה גם כשההצעה כבר מאושרת. לכן לקוח שפתח שוב את קישור
ההצעה ולחץ "אישור" היה מחזיר בקשה שהמשרד הסיר ביודעין. ביטול הוא החלטה של המשרד,
והדרך היחידה חזרה היא הוספה ידנית מ"+ בקשה" — שם הבקשה זמינה תמיד.

**אימות (dry-run על staging, בתוך בלוק שהתגלגל אחורה — לא שונו נתונים):**

| מצב הלקוח | שלבי רו״ח קודם שתוכננו | ציפייה |
|---|---|---|
| שלושת השלבים קיימים | 0 | אין כפילות (כמו קודם) |
| שלושתם בוטלו | **0** | ‼ ההתנהגות החדשה — לא חוזרים |
| אחד חסר, אף אחד לא בוטל | 1 | אין רגרסיה — חסר עדיין נוצר |

**טביעות md5 של `generate_onboarding_steps`:**
לפני ההחלה (שתי הסביבות זהות): `934368293317aad16c808465d576a658`.
אחרי ההחלה, פרודקשן ו-staging **זהים**: `eabae8839f35071953ad3eb0d1669717`.
הרצה יבשה על ארבע התקשרויות אמיתיות בפרודקשן החזירה `ok=true` בלי שגיאה.

**‼ הערות העברית נכתבו בשתי פעימות.** ההרצה הראשונה על staging הודבקה עם הערה
מתועתקת (לטינית) כדי לעקוף חשש קידוד, ואז הוחלפה בהערה העברית של הקובץ — כדי
שההשוואה מול הפרודקשן תהיה זהה לחלוטין. מי שמריץ את הקובץ מהריפו מקבל את
הגרסה העברית ישירות. המספר הפנוי הבא הוא 118.

---

## 130 — חיבור פייפרלס לרשות המסים

**קובץ:** `130-paperless-tax-authority.sql` · **מוחל על:** staging ✔ · פרודקשן ✔ (2026-08-25)

סוג שלב חדש, `paperless_tax_authority` — הפעולה שגורמת לחשבוניות לקבל מספר
הקצאה. נוצר אוטומטית **לעוסק מורשה ולחברה בלבד**, תלוי בשלב «חיבור לפייפרלס»,
והכדור בו אצל **הלקוח** (ההזדהות מול רשות המסים היא בת"ז ובקוד הקבוע שלו —
זו הפעולה היחידה ברצף הפייפרלס שאיננו יכולים לעשות בשמו).

**מה השתנה:** אילוץ `step_type` (תוספת ערך), `onboarding_track_for` (→ tools),
ושלושה טלאי-עוגן על `generate_onboarding_steps`, `build_client_portal`
ו-`portal_submit_step`, ועוד אחד על `create_onboarding_request` (רשימת ההיתר
של הקטלוג).

**מקור הזכאות:** `quotation_templates.kind in ('licensed_dealer','company')`
דרך `quotations.template_id`, ובהיעדר תבנית — `clients.dealer_type in
('licensed','company')`. אין אף אחד מהם ⇒ לא נוצר, והבקשה זמינה תמיד ידנית
מ"+ בקשה חדשה". ‼ שתי העמודות אומתו כקיימות בפרודקשן לפני ההחלה.

**הדף האישי:** פריט `kind='declare'` — הוראות (`note`/`noteAfter`), קישור
למדריך של פייפרלס, וכפתור הצהרה. `declare` הוא סוג פריט **גנרי** בדף האישי,
לא משהו ייעודי לפייפרלס: כל בקשה שהיא "לך תעשה במקום אחר, ותגיד לנו".

**החידוש התקופתי לא מומש** (הכרעת גיא — קודם החיבור הראשון). מה שכן נשמר הוא
`payload.connectedAt` בשעת ההצהרה, כדי שהמדידה של שלושת החודשים תהיה אפשרית
ביום שהחידוש ייבנה בלי מיגרציית נתונים.

**אימות:**

| מה נבדק | staging | פרודקשן |
|---|---|---|
| הרצה יבשה — עוסק מורשה | ‏`paperless_tax_authority` מתוכנן ✔ | ✔ |
| הרצה יבשה — עוסק פטור | לא מתוכנן ✔ | ✔ |
| `ok=true` בכל ההתקשרויות | ✔ | ✔ (3/3) |
| הדף האישי — נעול / פעולה / הושלם | נבדק בדפדפן ✔ | — |
| הצהרת הלקוח סוגרת + יומן + התראה | נבדק בדפדפן ✔ | — |

**טביעות md5 אחרי ההחלה — פרודקשן ו-staging זהים:**
`generate_onboarding_steps` = `5295b7418da95be0c6aed529da0d0d70`,
`build_client_portal` = `5829b915512267f986c45477809d9ca5`,
`portal_submit_step` = `47431f967cbd11de5e5b31df4629c3aa`,
`onboarding_track_for` = `224a768e012fdc80632f091f4565e060`.
‼ `create_onboarding_request` **אינה** זהה בין הסביבות — הדריפט קדם ל-130
(פרודקשן 7,125 תווים מול 4,848 ב-staging), והטלאי הוחל על כל סביבה בנפרד.

המספר הפנוי הבא הוא 131.

---

## 132 — הבקשה נולדת גם כשלקוח *הופך* לעוסק מורשה

**קובץ:** `132-paperless-tax-authority-on-becoming-licensed.sql` · **מוחל על:** staging ✔ · פרודקשן ✔ (2026-08-25)

130 יצרה את השלב רק בשעת הקליטה. עוסק פטור שהופך למורשה חודש אחרי כן אינו
עובר בשום מחולל, ולכן הבקשה לא הייתה מגיעה אליו לעולם.

**‼ למה לא לפי "שירותים עתידיים" בהצעה.** «מעבר מעוסק פטור לעוסק מורשה»
יושב ב-`futureServices` של **כל** הצעת עוסק פטור — הוא פריט מחירון בתבנית
`exempt_dealer`, לא סימן על לקוח מסוים. שימוש בו היה שולח את הבקשה לכל
עוסק פטור, בניגוד להכרעה. הראיה שכן מעידה היא `clients.vat_status =
'authorizedDealer'` (או `dealer_type`) — מה שהמשרד מעדכן כשהסיווג משתנה.

**מה נוסף:** `sync_paperless_tax_authority_step(client_id)` שיוצרת את
הבקשה כשהתנאים מתקיימים, טריגר `sync_paperless_tax_authority_trg` על
`clients` (‏`AFTER INSERT OR UPDATE OF dealer_type, vat_status`), והרחבת
`generate_onboarding_steps` כך ששני המסלולים קוראים את אותן שלוש הראיות.
דפוס הטריגר מועתק מ-`sync_representation_upgrade_step`.

**שלושת השערים בפונקציה:** קיימת בקשה מאותו סוג ב**כל** סטטוס (כולל
מבוטל) ⇒ לא נוגעים; אין רצף פייפרלס או `paperless_status='not_applicable'`
⇒ אין מה לחבר; לא עוסק מורשה/חברה ⇒ לא מנחשים.

**אימות ב-staging** (לקוח עוסק פטור עם רצף פייפרלס, הוחזר לקדמותו אחרי):

| מה נבדק | תוצאה |
|---|---|
| עדכון `vat_status` ל-`authorizedDealer` | הבקשה נוצרה, `pending`, הכדור אצל הלקוח, תלויה בשלב החיבור ✔ |
| שינוי הלוך-ושוב על אותו לקוח | לא נוצרה כפילות ✔ |
| הבקשה בוטלה ואז שינוי חוזר | **לא** נולדה מחדש ✔ |

**בקאפיל בפרודקשן** (הרצת הפונקציה על כל 20 הלקוחות, בבקשת גיא):
`created` 1 · `not_licensed` 4 · `no_paperless` 15. הבקשה היחידה שנוצרה
נבדקה מול `build_client_portal` והוחזרה כפריט `action` תקין.

‼ **המחולל המלא לא הורץ בבקאפיל, במכוון.** `generate_onboarding_steps`
יוצרת גם `client_documents`, `internal_setup` ו-`first_month_review`
חסרים, ומחזירה סוגים שאינם מוגנים בכלל 117 — כלומר בקשה שהמשרד ביטל
הייתה חוזרת. הבקאפיל הממוקד עושה רק את מה שהתבקש.

‼ המספר 131 נתפס באותו יום על ידי סשן מקביל (`131-rep-client-approval.sql`).
המספר הפנוי הבא הוא 133.

---

## 131 · אישור המייצג באזור האישי (`rep_client_approval`)

הלקוח מאשר את המשרד כמייצג באזור האישי של רשות המסים, במקום להמתין
לקליטה האוטומטית בשע"ם. הבקשה נולדת מ-`sync_representation_step` ברגע
שהבקשה עוברת ל-`awaiting_authorities`, ונסגרת לבד כשהיא עוברת ל-`active`.

‼ **`required_for_close = false` הוא חלק מההגדרה, לא ברירת מחדל.** זירוז
אינו תנאי: הקליטה תקרה בכל מקרה, ולקוח שנתקע בהזדהות מול רשות המסים לא
אמור לחסום סגירת קליטה. גם ההוספה הידנית מהקטלוג כופה `false` ולא מכבדת
את המתג בחלון — התנהגות זהה ליצירה האוטומטית חשובה יותר.

‼ **`portal_submit_step` מחזיר `completed: false`.** ההצהרה של הלקוח
מעבירה את הכדור (`ball='me'`, `needs_attention`) ומשאירה את השלב פתוח —
אין לנו גישה לאזור האישי שלו ואין דרך לאמת שהאישור נקלט. הסגירה היא של
הרו"ח, או אוטומטית כשהייצוג הופך לפעיל.

‼ **`published_at = now()` ביצירה.** הבקשה נולדת מפעולה של הרו"ח ("נשלח
לשע"ם") ברגע שבו הוא רוצה שהלקוח יראה אותה; טיוטה שממתינה ל"שלח ללקוח"
הייתה מבטלת את הזירוז.

‼ **`clientLinkLabel` — שדה חדש בכל בקשה.** הדף האישי הקשיח "למדריך
המלא" על כל קישור יוצא. זה נכון למדריך ושקר כשהקישור מוביל לאתר שבו
הפעולה עצמה מתבצעת. `build_client_portal` מעביר אותו כ-`linkLabel`,
והדף נופל חזרה ל"למדריך המלא" בהיעדרו — כל הבקשות הקיימות לא השתנו.

**בקאפיל:** נוצרה בקשה לכל לקוח שכבר ב-`awaiting_authorities`. בפרודקשן:
2 (דן רכס, אריאל רכס). ב-staging: 2.

‼ לשניהם **אין `portal_token`** — הדף האישי מעולם לא נפתח להם, והם אינם
לקוחות התקשרות (0 engagements). הבקשה קיימת ותוצג, אבל היא לא תגיע אליהם
עד שיישלח להם קישור לדף האישי.

---

## 133 · מקף רגיל גם בטקסט שנולד בתוך פונקציות המסד

6b2ebcb יישר את המחרוזות הגלויות בקוד ה-TS (כולל ה-Edge Functions), ו-128/129
יישרו את מה שכבר נשמר בטבלאות. נשאר פער שלישי שאיש לא סרק: טקסט שנוצר **בתוך
הגדרות הפונקציות ב-SQL**. הוא לא יושב בקוד ולא בטבלה, ולכן שני הסבבים הקודמים
פספסו אותו.

הדוגמה שהובילה לכאן: `build_client_portal` מייצרת "נחתם והוגש לרשויות המס —
ממתינים לאישור" — הכיתוב שכל לקוח שהייצוג שלו הוגש רואה בדף האישי שלו.

**היקף:** 40 מחרוזות ב-21 פונקציות בפרודקשן (44 ב-25 ב-staging, שכולל גם את
`split_prev_accountant_material_items` שבפרודקשן כבר עודכן). 36 מופעים
בהערות SQL **לא נגעו** — אותה הכרעה כמו ב-codemod המקורי.

‼ **שני מקרים שאינם פיסוק ובכל זאת הוחלפו,** כי הם טקסט גלוי:
`release_portal_respond` — הקו המפריד בין תשובה לתשובה של הרו"ח הקודם
("— — —" ⇐ "- - -"); `open_quotation_representation` — `coalesce(v_labels,'—')`
כסימן ל"אין ערך" ⇐ `'-'`, כמו ב-`ClientList` וב-`DocumentsWorkspace`.

‼ **למה codemod ולא רשימת עוגנים.** 40 עוגנים בעברית שכל אחד חייב להיות זהה
תו-בתו למה שבמסד = 40 הזדמנויות לטעות שתעבור בשקט. במקום זה סורק שמבחין בין
מחרוזת להערה, ושלוש בדיקות שנופלות בקול: מקף ארוך בקוד חשוף עוצר; ההגדרה
החדשה חייבת להיות זהה לישנה בכל תו שאינו מקף; ואחרי ההחלה קוראים מהמסד מחדש
ומאמתים אפס מקפים במחרוזות ומספר זהה של מקפים בהערות. בסוף רצה סריקה שנייה
בלתי-תלויה על כל הסכימה.

‼ **מה שכבר נשלח לא נגעו בו.** המיגרציה נוגעת בהגדרות הפונקציות בלבד — כלומר
בטקסט שייווצר מכאן והלאה. אף גוף מכתב, אף עותק מייל שמור ואף שורת יומן קיימת
אינם משוכתבים כאן.

**מה נשאר בנתונים (לא נגעו — הכרעה של גיא):** שורות שנכתבו בעבר על ידי אותן
פונקציות. בפרודקשן: `onboarding_events.note` (30), `tasks.title` (12),
`tasks.description` (2). שלוש שורות ב-`accountant_notifications` נבדקו —
כולן `suppressed`, כלומר לא נשלחו ולא יישלחו. `onboarding_steps.payload`
בפרודקשן נקי לגמרי, ולכן הדף האישי של הלקוח נקי גם בנתונים.
