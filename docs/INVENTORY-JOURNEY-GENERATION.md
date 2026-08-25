# מלאי החוקים שמרכיבים את מסע הלקוח

> נכתב 2026-08-25, לקראת ההחלטה להעביר את ברירת המחדל של הבקשות לשליטת המשרד.
> **מקור:** ההגדרות החיות בפרודקשן (`pg_get_functiondef`), לא קבצי הריפו.
> הפונקציה המרכזית עברה שישה טלאים מאז 70 ואין לה הגדרה שלמה אחת בריפו —
> כל עבודה עליה חייבת להתחיל מקריאה מהמסד.

## 0. מי יוצר מסע — ארבעה־עשר מנגנונים

| # | מנגנון | מתי רץ | איפה |
|---|---|---|---|
| 1 | `create_engagement_for_quotation` | אישור הצעת מחיר | `supabase/118` |
| 2 | ↳ `generate_onboarding_steps` | בתוך (1) — וגם בכל כניסה חוזרת לאותה הצעה, כל עוד ההתקשרות ב-`onboarding` | חי; בסיס `70`, טלאים `106·115·117·130·132` |
| 3 | ↳ `add_intake_questionnaire_step` | בתוך (1), ללא תנאי | `77` + `73` |
| 4 | ↳ `ensure_institution_alignment_steps` | בתוך (1), ללא תנאי | `92` / `93` |
| 5 | `ensure_representation_step` + טריגר | כשנוצרת בקשת ייצוג בכל מסלול | `109` |
| 6 | `sync_representation_step` (טריגר) | כל שינוי סטטוס בבקשת ייצוג | `131` |
| 7 | `ensure_rep_client_approval_step` | כשהייצוג מגיע ל-`awaiting_authorities` | `131` |
| 8 | `sync_representation_upgrade_step` | ייצוג משני | `70` |
| 9 | `sync_paperless_tax_authority_step` + טריגר על `clients` | שינוי ב-`dealer_type` / `vat_status` | `132` |
| 10 | `set_paperless_path` | כשהמשרד קובע את מסלול הפייפרלס | `46` |
| 11 | `createPrevAccountantTrack` | כפתור «חומרים מרו״ח קודם» | `src/lib/prevAccountantTrack.ts` |
| 12 | `PAPERLESS_SEQUENCE` | פריט קטלוג «רצף פייפרלס» | `src/components/clientTabs/AddRequestDialog.tsx` |
| 13 | `buildBankDebitPayload` | פריט קטלוג «הרשאה בבנק» | `src/lib/bankDebitRequest.ts` |
| 14 | `apply_journey_template` | «מתבנית» | `84` / `86` |

**‼ שלושה מהם חיים בקוד הדפדפן ולא בשרת** (11–13). כל נוסח שעובר לשליטת המשרד
חייב לכסות את שני המשטחים, אחרת אותה בקשה תיראה אחרת לפי מאיפה נוצרה.

---

## 1–3. סוגי הבקשות · התנאי · התלות

`C` = מוצג במשטח הבקשות · `M` = אבן דרך · `X` = פנימי, לא מוצג · `E` = מסך אחר

| סוג | תנאי היצירה | תלוי ב־ | כדור | חוסם סגירה | תצוגה |
|---|---|---|---|---|---|
| `representation` | יש בקשת ייצוג (מההצעה או ישירה) | — | נגזר מסטטוס הבקשה | כן | M |
| `kyc_identification` | יש ייצוג | — | משרד | מוחרג בשער | X |
| `file_opening` | `v_new_business` | — | משרד | מוחרג בשער | X |
| `client_documents` | **תמיד** | — | לקוח | כן | C |
| `prev_accountant_details` | יש רו״ח קודם · ואף אחד משלושת שלבי הרו״ח הקודם לא בוטל | — | לקוח | **רק כשאין מייל בכרטיס** | C |
| `release_letter` | אותו בלוק | `prev_accountant_details` — **רק כשאין מייל** | משרד (נמען חיצוני) | כן, למעט שעבר תאריך יעד | C |
| `materials_received` | אותו בלוק | `release_letter` | רו״ח קודם | כן | C |
| `paperless_invite` | (שירות חודשי **או** שם פריט מכיל «הנהלת חשבונות»/«פייפרלס»/`paperless`) **וגם** `paperless_status <> 'not_applicable'` | — | **לקוח** | כן | C |
| `paperless_connection` | אותו תנאי | `paperless_invite` | **משרד** | כן | C |
| `paperless_tax_authority` | אותו תנאי **וגם** עוסק מורשה/חברה **וגם** לא בוטל בעבר | `paperless_connection` | לקוח | כן | C |
| `retainer_authorization` | יש סכום חודשי | `paperless_connection` (אם קיים) | משרד | כן | C |
| `internal_setup` | **תמיד** | — | משרד | מוחרג בשער | X |
| `first_month_review` | **תמיד** (יעד: אישור + 30 יום) | — | משרד | לא | X |
| `intake_questionnaire` | **תמיד** — מחוץ למחולל | — | משרד | לא | C כשמפורסם |
| `institution_alignment_btl/vat/income` | **תמיד** — מחוץ למחולל | — | משרד | לא | E |
| `opening_call` | רק ב-`p_include_opening_call` | — | משרד | מוחרג בשער | X |
| `data_import` | מסלול נתונים = תוכנה אחרת | `paperless_connection` | משרד | — | X |
| `data_verification` | מסלול נתונים ∈ {תוכנה אחרת, פייפרלס} | `data_import` אחרת `paperless_connection` | משרד | — | X |
| `rep_client_approval` | הייצוג הוגש לשע״ם · נסגר לבד כשהוא פעיל | — | לקוח | לא | E |
| `representation_upgrade` | ייצוג משני | — | משרד | לא | X |
| `custom_request` · `send_document` | ידני בלבד | לבחירה | לבחירה | לבחירה | C |

### העובדות שמהן נגזרים התנאים

| עובדה | איך היא מחושבת |
|---|---|
| `v_has_monthly` | קיים פריט `category = 'monthly'` בהצעה |
| `v_has_paperless` | שם פריט מכיל «הנהלת חשבונות» / «פייפרלס» / `paperless` — **התאמת מחרוזת** |
| `v_needs_paperless` | `(monthly או paperless)` וגם `clients.paperless_status <> 'not_applicable'` |
| `v_licensed` | `quotation_templates.kind ∈ {licensed_dealer, company}` — ואם אין תבנית: `clients.dealer_type ∈ {licensed, company}` או `clients.vat_status = 'authorizedDealer'` |
| `v_has_rep` | `quotations.representation_request_id` או `clients.representation_request_id` |
| `v_has_prev` | `clients.has_previous_accountant`, אחרת מהליד המקושר, אחרת מהליד שעל ההצעה. `null ⇒ false` |
| `v_new_business` | `clients.business_transfer IS NOT NULL` וגם `= false` וגם אין רו״ח קודם |
| `v_needs_prevdet` | `clients.prev_accountant_email` ריק |

---

## 4. וריאציות תוכן לפי מצב הלקוח

### `client_documents` — שלוש רשימות (השאלה המרכזית)

| הענף | התנאי בפועל | הפריטים |
|---|---|---|
| עסק חדש | `business_transfer = false` **ומולא במפורש** ואין רו״ח קודם | תעודת עוסק · צילום ת.ז. · אישור ניהול חשבון בנק |
| מגיע מרו״ח אחר | יש רו״ח קודם | אישור ניהול חשבון בנק · דוח שנתי אחרון · טופס 106 |
| ברירת מחדל | כל השאר — **כולל כשהשדה לא מולא** | צילום ת.ז. · אישור ניהול חשבון בנק |

הכותרת והשורה המסבירה **מחושבות מהרשימה** ואינן נוסח כתוב:
`clientTitle = 'להעלות N מסמכים'`, `clientSub = התוויות מחוברות ב־' · '`, `clientCta = 'להעלאה'`.

### `prev_accountant_details` — שתי גרסאות נוסח

| מתי | כותרת | הסבר | כפתור | חוסם סגירה |
|---|---|---|---|---|
| אין מייל בכרטיס | פרטי רואה החשבון הקודם שלך | שם, אימייל וטלפון - כדי שנפנה אליו בשמך | למילוי | כן |
| יש מייל | לאשר את פרטי רואה החשבון הקודם | הפרטים שאצלנו מוצגים למילוי מראש - רק לוודא שהם נכונים | לאישור | לא |

**‼ הנוסח הזה כפול** — קיים גם ב-SQL (המחולל) וגם ב-`prevAccountantTrack.ts`.

### רשימות קבועות שאינן משתנות לפי מצב

`materials_received` — 8 פריטים · `file_opening` — 3 · `internal_setup` — 3 ·
`data_import` — 2 · `data_verification` — 4 · `retainer_authorization` — סכום ו־חודש
מההתקשרות, ו-`method='manual_arrangement'` כשאין פייפרלס.

---

## 5. עבודה פנימית שנוצרת תמיד ואינה בקשה

`internal_setup` · `kyc_identification` · `first_month_review` · `file_opening` ·
`opening_call` · `data_import` · `data_verification` · `representation_upgrade`

מסוננים ממשטח הבקשות ב-`LEGACY_AUTO_OFFICE_TYPES`
(`src/types/onboarding.ts:796`) ומוחרגים משער הסגירה ב-`onboarding_close_readiness`
(`supabase/105`). `institution_alignment_*` ו-`rep_client_approval` מנוהלים במסכים אחרים.

---

## 6. מה אסור שיהפוך לתצורה חופשית

| מה | למה |
|---|---|
| `representation` · `rep_client_approval` | נגזרים ממכונת המצבים של `representation_requests`. הדף האישי קורא משם ישירות — כיבוי היה יוצר סתירה בין שני משטחים |
| בעלות (`ball`) לפי סוג | `paperless_connection` חייב להישאר אצל המשרד (שם מזינים אשראי); `paperless_tax_authority` חייב להישאר אצל הלקוח (הזדהות בת.ז. ובקוד קבוע). החלפה יוצרת בקשה שהצד המקבל אינו יכול לבצע |
| התלויות | `unlock_dependent_steps` והדף האישי נשענים עליהן. תלות שגויה = בקשה שלא תיפתח לעולם |
| `published` / `published_at` | האינווריאנט של טיוטה־מול־פרסום (D3, מיגרציה 77). פרסום הוא מעשה מפורש לכל לקוח |
| סכום ההרשאה החודשית | מגיע מההתקשרות. עריכה = הבטחה ללקוח שסותרת את ההצעה שאישר |
| ארבעת הסעיפים הנגזרים במכתב ההעברה | סוכמו עם הלקוח |
| `paperless_status = 'not_applicable'` | עובדה על הלקוח, לא ברירת מחדל של משרד |

---

## 7. איפה כל חוק יושב היום

| החוק | המקום |
|---|---|
| תנאי היצירה + רשימות ברירת המחדל + הנוסחים | גוף `generate_onboarding_steps` בפרודקשן |
| שאלון + יישור קו | `add_intake_questionnaire_step`, `ensure_institution_alignment_steps` |
| מצב הייצוג | טריגרים על `representation_requests` |
| מסלול הפייפרלס | `set_paperless_path` |
| «מה חוסם סגירה» | `onboarding_close_readiness` + עמודת `required_for_close` |
| «מה מוצג במשטח» | `src/utils/clientFacingRows.ts` + `src/types/onboarding.ts` |
| נוסח רצף הפייפרלס / רו״ח קודם / הרשאה בבנק כשנוצרים ידנית | קוד הדפדפן |
| תבניות | טבלת `journey_templates` |

---

## 8. תבניות שהופכות מיותרות

| תבנית | מצב |
|---|---|
| «מעבר מרו״ח אחר» (משרד, 8 רשומות) | נבלעת במלואה — 6 מהמחולל תחת «יש רו״ח קודם», אחת עבודה פנימית, שתיים בקשות שהמשרד מוסיף |
| «מסמכים מהלקוח» (מובנית) | מיותרת — הופכת לווריאציות של אותה בקשה |
| «פרטי הרו״ח הקודם» (מובנית) | מיותרת — שתי גרסאות הנוסח הופכות לווריאציות |

נשאר שימוש אחד לתבניות: **העתקה בין לקוחות** («כמו אצל דנה»), שאינו מה שברירת המחדל עושה.

---

## מצב הייצור (2026-08-25)

3 התקשרויות, כולן ב-`onboarding` · 84 שלבים חיים · 13 לקוחות עם שלבים · 20 לקוחות.
16 שלבים עם `sort_order = 0`. **היקף המיגרציה קטן** — זה החלון הנוח לשינוי.
