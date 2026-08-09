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
