# תוכנית: «צפייה» — לראות בקשה בדיוק כפי שהלקוח יקבל אותה

> **מעמד:** תוכנית מחייבת למימוש (05.10.2026). נכתבה אחרי חקירה בקוד ובדפדפן, בלי שינוי קוד אפליקציה.
> **מבצע:** Sonnet — מימוש, בדיקות והכנה לשחרור. **אין** פריסה, דחיפה ל-master או שינוי בייצור בלי אישור מפורש של גיא.
> **בסיס:** `origin/master` 7d73d96 (219 ו-220 בייצור). Worktree: `C:/Users/guyas/pivo-wt/request-preview`,
> ענף `plan/request-preview` (מכיל את המסמך הזה). שרתים ב-`.claude/launch.json` של התיקייה הראשית:
> `request-preview` (5210, ‎--mode officeux‎, מסד מדומה) · `request-preview-staging` (5211, staging).
> ראיות מהחקירה: `docs/evidence/request-preview-2026-10-05/` (מוחרג מגיט; עותק בתיקייה הראשית).

---

## 1. הבעיה והתוצאה הנדרשת

**הבעיה (גיא):** בספריית הבקשות רואים שם ושורת תיאור, אבל אי אפשר להבין מה הלקוח באמת יקבל.
«אישור הייצוג באזור האישי» מופיע כשורת טקסט — למרות שהבקשה כוללת הוראות, קישור, כפתור הצהרה ומדריך מצולם של 7 צעדים.
זה נכון לכל סוגי הבקשות והמסמכים.

**התוצאה:** מכל שורה בספרייה (ובכל מקום שבו בוחרים בקשה) — «צפייה» פותחת תצוגה נאמנה של מה שהלקוח מקבל:
הכרטיס בדף האישי עם הטקסט, התמונות, המסמכים, השדות והכפתורים; המייל שמפנה אליו; המסמכים שמצורפים;
והמסך הנפרד שהכפתור פותח (כשיש). הכול על **נתוני דוגמה מסומנים**, בלי לשלוח, לשמור, לחתום או להפעיל דבר.
הספרייה עצמה נשארת רשימה נקייה לסריקה.

---

## 2. ממצאים מאומתים (קוד + דפדפן)

נבדק ב-`?office-app` (מסד מדומה) על הקוד של `origin/master`, ב-1280 וב-390, בכרום ללא-ראש (playwright-core מ-`worker/node_modules`).
צילומים: `lib-1280.png`, `lib-rep-open-1280.png`, `lib-390.png`, `editor-1280.png`, `portal-demo-1280.png`,
`portalcard-1280.png`, `case-requests-1280.png`, `case-howlooks-1280.png`, `case-addrequest-1280.png`, `test-portal-preview.png`.

| # | פער | ראיה |
|---|---|---|
| G1 | **אין שום דרך לראות את תוכן הבקשה מהספרייה.** שורה = שם + שורת meta + פעולה אחת (עריכה / «מתי נפתחת?» / «הוספה לכלל ←»). ילדי קבוצה בלי פעולה (למשל «אישור הייצוג באזור האישי», «ייצוג ברשות») — שורה מתה. | `LibraryPage.tsx`, `library/GroupEntry.tsx`; `lib-rep-open-1280.png` |
| G2 | **התצוגות המקדימות הקיימות מסתירות את התוכן.** במצב תצוגה (`PreviewCtx`/`inert`) בקשה שנפתחת בלחיצה — בקשה חופשית, מסמכים, רו״ח קודם, פרטי העסק — מציגה רק כפתור אפור; השדות, רשימת המסמכים, ההוראות והמספרים להעתקה לעולם לא נראים. כך גם ב«הדף של X» וב«איך זה ייראה» בתיק הלקוח. | `PublicPortalPage.tsx` `ActionItem` (שורות 586–600); `test-portal-preview.png`, `case-howlooks-1280.png` |
| G3 | **«מה הלקוח רואה» בעורך הבקשה הוא חיקוי** — כותרת/שורה/כפתור שנבנו ביד (`lb-preview`), לא הכרטיס האמיתי. יתיישן בנפרד. | `library/RequestEditor.tsx` שורות 220–265; `editor-1280.png` |
| G4 | **«איפה עורכים» שגוי לכרטיס האישור באזור האישי.** בספרייה: «נוסח קבוע של המערכת». בפועל השורה, ההסבר, משפט הסיום ותווית הקישור נערכים ב«מיילים» ← «אישור הייצוג באזור האישי (כרטיס בדף הלקוח)», ושם יש התצוגה המקדימה היחידה שמשתמשת ברכיב האמיתי. | `RepresentationSettingsSection.tsx` 396–416; `portalcard-1280.png` |
| G5 | **טקסט גלוי של בקשות מערכת קיים ב-2–3 עותקים**: גוף SQL (`ensure_rep_client_approval_step` ב-217, המחולל `generate_onboarding_steps` ב-216), TS (`REP_CLIENT_APPROVAL`, `paperlessTaxAuthorityPayload` ב-`types/onboarding.ts`), ו-`REP_PORTAL_CARD_DEFAULTS` ב-`_shared/repTemplates.ts`. תצוגה שנבנית מהעותקים ב-TS תשקר כשהם נפרדים. | הקבצים הנ״ל; זיכרון `visible-text-three-surfaces` |
| G6 | **מה שהלקוח רואה נבנה כולו בשרת** — `build_client_portal` (220, ~760 שורות): לכל סוג ומצב — דלי, תווית, שורת משנה, סוג כרטיס, שדות, קבצים, קישורים, ברירות מחדל. הדפדפן רק מצייר. כל תצוגה שלא עוברת בו היא העתק. | `supabase/220-business-details-home-office.sql` 676–1434 |
| G7 | **«＋ בקשה חדשה» בתיק הלקוח** — שם + שורת רמז; אין דרך לראות לפני שמוסיפים. כך גם בבונה הכללים (AddSheet). | `AddRequestDialog.tsx`; `case-addrequest-1280.png` |
| G8 | **מיילים:** התצוגה בבונה (`consolidatedMailSample`) משתמשת בתבנית האמיתית אבל מעתיקה את המעטפת מהשולח; התצוגה של מיילי הייצוג ב«מיילים» היא חיקוי (`rs-mail`). | `flows/builder/mailSample.ts`, `RepresentationSettingsSection.tsx` 380–394 |
| G9 | **קבוצה (בקשה מורכבת)** מציגה רשימת ילדים, בלי תמונה של מה הלקוח רואה לאורך התהליך. | `GroupEntry.tsx` |
| G10 | **מסכים שהכפתור פותח** (`?onboard=` מילוי וחתימת ייפוי כוח, `?sign=`, `?intake=`, `?release=` לרו״ח הקודם, `?sign-form=` 6101) — אין להם שום תצוגה במשרד. מסכי `?test-*` קיימים רק ב-DEV. | `App.tsx` 412–546 |
| G11 | הדגמת `?portal=demo` נבנית ב-TS מדומה (`__fakeBackend.ts` `demoPortal`) — טובה להדגמה, לא ראיה לנאמנות. | `__fakeBackend.ts` 352–400 |

**מה כן עובד (נבדק):** הספרייה בטלפון בלי גלילה אופקית (390 = 390); אפס שגיאות קונסול בכל המסכים שנבדקו;
המדריך המצולם נפתח גם במצב תצוגה; מסכי ההדגמה לא פונים לייצור (רק fonts.googleapis.com).

---

## 3. מה קיים ונשתמש בו (בלי העתק שני)

| # | רכיב / מקור | למה הוא הבסיס |
|---|---|---|
| R1 | `PortalView({data, preview, embed})` ב-`PublicPortalPage.tsx` | הדף האישי כבר מופרד מהטעינה — מקבל נתונים ומצייר. אותו רכיב ישמש לצפייה. |
| R2 | `build_client_portal` (220) | מקור התוכן היחיד של הדף. נוציא ממנו את ענפי הסוגים לפונקציה משותפת (§6.1) — והדף האמיתי והצפייה יעברו באותו קוד. |
| R3 | `_flow_item_spec(user, item, repeatable)` (215) | הפונקציה היחידה בשרת שהופכת פריט בספרייה (תבנית / מסמך / בקשת מערכת) ל-סוג + payload + בעלים — כולל המרה במסלול שחוזר וסימון משימה פנימית. |
| R4 | `ui/Sheet.tsx` | מגירה בצד (מחשב) / יריעה במסך מלא (טלפון), פוקוס כלוא, Esc, כתובת שקובעת — «אחורה» בטלפון סוגר. |
| R5 | `features/requests/requestGroups.ts` | מקור אחד לקבוצות — `groupPortalItems` יקבץ את פריטי הדוגמה בדיוק כמו בדף האמיתי. |
| R6 | `portal/RepApprovalGuide.tsx` + `public/guides/rep-approval/step-1..7.webp` | המדריך המצולם — כבר נפתח במצב תצוגה. |
| R7 | `_shared/stepTemplates.ts` + `utils/brandedEmail` + `consolidatedMailSample` | נוסחי המייל (כולל נוסח המשרד) והמעטפת הממותגת. |
| R8 | `features/links/linkDestinations.ts` | לאן כל כפתור מוביל; קישור אישי מוצג רק כדוגמה ממוסכת. |
| R9 | `lib/demoIsolation.ts`, `staging-dryrun-flows.mjs --tests`, `prod-dryrun-6101-migrations.mjs --files`, `verify-migration-functions.mjs`, ספק המייל המדומה ב-staging | בידוד הדגמה, הרצת SQL מתבטלת, השוואת גופים. |

---

## 4. ההכרעות (נלקחו — אין לפתוח מחדש)

| # | הכרעה | נימוק |
|---|---|---|
| D1 | **התוכן לצפייה נבנה בשרת, באותו קוד של הדף האמיתי** — רפקטור של `build_client_portal` לפונקציה `_portal_step_items`, ופונקציית צפייה חדשה שקוראת לה עם רשומות וירטואליות. **לא** מראה ב-TS. | עקרון 1; G5–G6. |
| D2 | **פונקציית הצפייה היא STABLE** — Postgres עצמו אוסר בה כל כתיבה. **לא** «ליצור לקוח זמני ולגלגל אחורה». | עקרון 6 מובטח במבנה, לא בזהירות. טריגרים קיימים קוראים ל-`net.http_post`; גלגול אחורה הוא מלכודת לעתיד. |
| D3 | **ה-payload של הדוגמה מגיע מנתיב היצירה האמיתי:** פריט בספרייה ← `_flow_item_spec`; בקשה שה-payload שלה נבנה בדפדפן (הרשאה לחיוב, שליחת מסמכים, בקשה חופשית, טיוטה בעורך) ← אותה פונקציית בנייה ב-TS שהיצירה משתמשת בה; בקשת מערכת שהשרת יוצר ← פונקציית payload שמוצאת מהיוצר (גוף מילה במילה) ונקראת גם ממנו. | בלי עותק שלישי של הטקסט. |
| D4 | **לדף האישי שלושה מצבים**: `live` (הלקוח, עם טוקן) · `sample` (צפייה בספרייה: הכול נפתח, אפשר להקליד וללחוץ, שום דבר לא נשמר) · `officeView` (תיק אמיתי במשרד: הכול נפתח לקריאה, שדות ושליחה כבויים). כל קריאה לשרת עוברת דרך `PortalActions` מוזרק; ב-`sample` אין רשת בכלל. | מתקן גם את G2 בתצוגות הקיימות («הדף של X», «איך זה ייראה») כמעט בלי עלות. |
| D5 | **נתוני דוגמה קבועים בשרת:** «ישראל ישראלי», בת זוג «ישראלה ישראלי», «ישראלי ייעוץ (דוגמה)», רו״ח קודם «רו״ח לדוגמה», אסמכתה `A-0000-0000`. מיתוג ושם המשרד — האמיתיים של המשרד (שלו, לא של לקוח). תג קבוע בראש התצוגה: «דוגמה — לא לקוח אמיתי». | עקרון 2. |
| D6 | **שורה בספרייה:** כפתור משני שקט «צפייה» (אייקון עין + מילה) **בכל** שורה — בקשה, בקשת מערכת, כותרת קבוצה, ילד בקבוצה, מסמך — באותו מקום (לפני הפעולה הקיימת; כשאין פעולה — לבד). גם לחיצה על שם הבקשה פותחת. הפעולה הקיימת נשארת. | עקרונות 7–8; מילה ולא רק אייקון — משתמש לא טכני. |
| D7 | **מעטפת:** `ui/Sheet` — מגירה ~640px במחשב, מסך מלא בטלפון. הכתובת נושאת את מה שפתוח (`view:…`, §5.3) — רענון שומר, «אחורה» סוגר. | R4. |
| D8 | **לשוניות בתוך הצפייה, רק כשרלוונטיות:** «בדף הלקוח» (תמיד) · «במייל» · «מסמכים» · «המסך שנפתח». כל לשונית אומרת במשפט אחד מה היא ולמי. | עקרון 5 — לא להציג מייל כאילו הוא הדף. |
| D9 | **מצבים (וריאנטים)** נבחרים בצ׳יפים מעל התצוגה, עד 3 צירים: מצב הבקשה («ממתין ללקוח» / «אחרי שהלקוח שלח» / «הושלם» / «בהמשך»), אדם («לקוח יחיד» / «זוג»), וציר ייחודי לסוג (למשל «זירוז» / «רשות המסים ממתינה — חובה»). ברירת מחדל = מה שהלקוח רואה כשהבקשה נפתחת. | עקרון 2 בלי עומס. |
| D10 | **בקשה מורכבת = «התהליך»:** הקבוצה כפי שהלקוח רואה אותה ברגע שנבחר («בהתחלה» … «הושלם»), ומתחת הבקשות לפי הסדר — מי עושה, מה הלקוח רואה, «צפייה» לכל אחת (נכנסים פנימה ו«‹ חזרה לתהליך»). אין כרטיסים כפולים. | עקרון 3. |
| D11 | **«＋ בקשה חדשה» ובונה הכללים** מקבלים את אותו «צפייה» ואותה מגירה; בתיק הלקוח הכפתור הראשי בתחתית — «הוספה ל{שם}» — ממשיך את נתיב ההוספה הקיים. הצפייה תמיד על דוגמה (הדף האמיתי של הלקוח כבר זמין ב«איך זה ייראה»). | עקרון 8. |
| D12 | **מסמך שנוצר לכל לקוח** (ייפוי כוח, מכתב העברה כ-PDF, 6101) — הסבר במשפט; דוגמה רק אם נוצרת באותו מחולל, עם סימן מים «דוגמה», ובלי רשת. קובץ מספריית המשרד — נפתח האמיתי. קובץ מהתיק של לקוח — «נפתח רק אצל הלקוח». | עקרון 4. |
| D13 | **עריכה וצפייה מופרדות:** המגירה לקריאה בלבד, הכותרת «צפייה». בתחתית — הפעולה האמיתית במקומה: «עריכה» (עורך הספרייה) / «עריכת הנוסח ב«מיילים» ←» / «מתי נפתחת? ←» / «הוספה לכלל ←». בקשה בלי עריכה — עדיין נצפית. | עקרון 7; G4. |
| D14 | **מספר מיגרציה: 222.** 221 שמור לתוכנית המקבילה «תביעת מילואים» (`docs/PLAN-RESERVE-DUTY-CLAIM.md`, worktree `pivo-wt/reserve-duty-claim`), שגם היא מגדירה מחדש את `build_client_portal` (גוף 220 + שורת `photoGuide` בענף `custom_request`). ראה §6.0. לבדוק שוב לפני מיזוג (`migration-number-collisions`). | שתי תוכניות על אותה פונקציה — מי שנוחת שני בונה על הגוף של הראשון. |

**אין הכרעה עסקית פתוחה.**

---

## 5. החוויה

### 5.1 במחשב

```
שורה בספרייה (ללא שינוי במבנה — רק «צפייה»):
│ אישור תנאי שכר טרחה   [בקשה אחת]                          [◉ צפייה] [עריכה] │
│ הלקוח רואה: אישור תנאי ההתקשרות · הלקוח מאשר · בשימוש ב: …                │
ילד בקבוצה בלי פעולה (היום — שורה מתה):
│ אישור הייצוג באזור האישי                               הלקוח   [◉ צפייה]   │

מגירה (Sheet, צד ימין, ~640px):
┌───────────────────────────────────────────────────────────────┐
│ ✕  צפייה · אישור הייצוג באזור האישי                            │
│    בקבוצה «ייצוג מול הרשויות» · הלקוח מבצע · נפתחת לבד אחרי ההגשה│
│    [דוגמה — לא לקוח אמיתי]                                     │
│ [ בדף הלקוח ] [ במייל ] [ מסמכים ]                              │
│ מצב: (ממתין ללקוח) (אחרי «אישרתי») (הושלם)                     │
│ לקוח: (יחיד) (זוג)       רשות המסים: (זירוז) (ממתינה — חובה)    │
│ ┌──────────── PortalView · sample ────────────┐               │
│ │ שלום ישראל,  …  [כרטיס מלא, מדריך מצולם,     │               │
│ │ כפתור כניסה, «אישרתי באזור האישי»]           │               │
│ └──────────────────────────────────────────────┘               │
│ ───────────────────────────────────────────────────────────── │
│ [עריכת הנוסח ב«מיילים» ←]                    מתי נפתחת? ←     │
└───────────────────────────────────────────────────────────────┘
```

- בדף הלקוח מוצג **רק** הפריט שנצפה (וקבוצתו כשהוא חלק מקבוצה, כמו אצל הלקוח), בתוך מסגרת הדף האמיתית (לוגו, «שלום ישראל,», שורת «ממתין לך»).
- לחיצה על פעולה של הלקוח (שליחה, «אישרתי», העלאה) → מתחת לכפתור: «בתצוגה לדוגמה — כאן הלקוח היה שולח. לא נשמר ולא נשלח דבר.» המצב לא משתנה; רוצים לראות «אחרי» — בוחרים מצב.
- קישור חיצוני ציבורי (gov.il, מדריך פייפרלס, ב״ל) נפתח בלשונית חדשה. קישור לטוקן (`?onboard=`/`?sign=`/`?intake=`) עובר ללשונית «המסך שנפתח».
- טעינה: שלד; כשל: «לא הצלחתי לטעון את התצוגה» + «נסו שוב» — לעולם לא מגירה ריקה. בקשה שלא תיווצר כמו שהיא (`library_item_missing`, `not_repeatable`, משימה פנימית) — המשפט מ-`skipReasonText`/`serverErrorText` במקום כרטיס.

### 5.2 בטלפון (360/390)
- «צפייה» נשאר בשורה (השורות כבר נשברות לשתי שורות — הכפתורים בשורה התחתונה, כמו היום).
- המגירה = מסך מלא: כותרת דביקה עם «‹ ספרייה», שם ותג «דוגמה»; לשוניות כפקד מקטעים שגולל אופקית; צירי המצב כשורת צ׳יפים שגוללת אופקית (ציר עם יותר מ-4 ערכים — רשימה נפתחת); הדף ברוחב מלא (הוא נבנה לטלפון); פעולות בתחתית דביקה; «אחורה» של המכשיר סוגר.
- בלי גלילה אופקית של העמוד; יעדי מגע ≥ 44px; הסרגל התחתון של האפליקציה לא מסתיר את התחתית הדביקה.

### 5.3 כתובת
`#/firm/library` עם focus `view:<target>[@<variant>]`, לפי מנגנון ה-focus הקיים של `LibraryPage`:
`view:template:<id>` · `view:system:<stepType>` · `view:group:<key>` · `view:doc:<docId>` · `view:catalog:<type>`.
בתיק הלקוח וב-AddRequestDialog — מצב מקומי (לא חובה בכתובת), אבל אותה מגירה.

### 5.4 בקשה מורכבת («התהליך»)
```
צפייה · פייפרלס                                [דוגמה — לא לקוח אמיתי]
רגע בתהליך: (בהתחלה) (אחרי ההרשמה) (בהקמה אצלנו) (הושלם)
┌ הקבוצה בדף הלקוח, ברגע שנבחר (PortalView · sample) ┐
└────────────────────────────────────────────────────┘
הבקשות בתהליך, לפי הסדר:
 1  הרשמה לפייפרלס       הלקוח            [◉ צפייה]
 2  פרטי העסק            הלקוח ← המשרד    [◉ צפייה]
 3  הקמת העסק בפייפרלס   המשרד · הלקוח רואה «בטיפול המשרד»  [◉ צפייה]
 4  הסדרת התשלום         המשרד והלקוח · כשיש תשלום חודשי    [◉ צפייה]
 5  חיבור לרשות המסים    הלקוח · לעוסק מורשה ולחברה          [◉ צפייה]
מתי פותחים את הקבוצה? ←
```
ה«מתי» וה«מי» — מאותה פונקציה שהספרייה משתמשת בה היום (`kidsOf` יוצא מ-`LibraryPage` אל `libraryModel.ts`).

---

## 6. הארכיטקטורה

### 6.0 תיאום עם «תביעת מילואים» (חובה לפני שלב א׳)

התוכנית המקבילה (`docs/PLAN-RESERVE-DUTY-CLAIM.md`) מוסיפה: מיגרציה 221 (`build_client_portal` = 220 + `'photoGuide', nullif(s.payload->>'clientPhotoGuide','')` בענף `custom_request`),
`src/components/portal/photoGuides.ts` + רכיב מדריך מצולם גנרי שמחולץ מ-`RepApprovalGuide`, ותיקון ב-`InlineComposer` (העותק מהספרייה מעביר `clientNote`/`clientNoteAfter`/`clientRefs`/`clientPhotoGuide`).
- **הבסיס של הגוף «מילה במילה»** = ההגדרה האחרונה של `build_client_portal` בין `origin/master` לענף של תביעת המילואים. אם 221 כבר במאסטר — הבסיס הוא 221 (כולל `photoGuide`), ו-P.1 משווה מולו. אם עדיין לא — לעשות rebase על הענף שלה לפני A1, או לעצור ולשאול את גיא איזה נוחת קודם. **לא** לשכפל את השורה ידנית בגוף אחר.
- **מדריכים מצולמים בצפייה** — אוטומטי: הפריט מגיע מאותו בונה, ו-`PortalView` מצייר את המדריך. בדיקת הדפדפן (§10.3) מוודאת שכל תמונה במדריך נטענת (200).
- **«＋ בקשה חדשה» עם תבנית מהספרייה** — ה-payload לצפייה הוא הפלט של `buildPayload` של `InlineComposer` (לייצא כפונקציה טהורה אם צריך), **לא** ה-payload הגולמי של התבנית. אחרת, אם הקומפוזר משמיט שדות, הצפייה תראה יותר ממה שנוצר בפועל.

### 6.1 שרת — מיגרציה `supabase/222-request-preview.sql`

1. **`_portal_rep_item(req representation_requests) returns jsonb`** — ענפי `req.status` שלפני הלולאה, מילה במילה.
2. **`_portal_step_items(s onboarding_steps, c clients, p profiles, req representation_requests, p_rep_item jsonb, p_ctx jsonb default '{}') returns jsonb`**
   → `{items, repSeen, prevOpen, prevDone}`. הגוף = `case s.step_type … end case` מההגדרה האחרונה (§6.0 — 220, או 221 אם תביעת המילואים נחתה) **מילה במילה**; `v_items := v_items || x` כותב למערך מקומי; כל `continue` הופך ל-`return` של מה שנצבר עד אותה נקודה (‼ בענף `identity` נוסף פריט **לפני** ה-`continue`).
   שלושה «תפרים» מפורשים בלבד, ובכולם `p_ctx = '{}'` ⇒ התנהגות זהה:
   `p_ctx ? 'approvals'` במקום `_rep_approval_people(c.id)` · `p_ctx->>'lockReason'` לפני `portal_lock_reason(s.id)` · `p_ctx ? 'homeOffice'` במקום הקריאה מ-`client_home_office_answers`.
   `STABLE SECURITY DEFINER`, `revoke all … from public, anon, authenticated` (פנימית).
3. **`build_client_portal`** — אותו גוף; הלולאה קוראת ל-`_portal_step_items(s, c, p, req, v_rep_item, '{}')`. הדילוג של «לקוח שחוזר», מיזוג הטיוטה ודגלי `draft/removing/edited` נשארים בחוץ. **פלט זהה תו-בתו** (בדיקה P.1).
4. **פונקציות payload שמוצאות מהיוצרים** (גוף מילה במילה, היוצר קורא להן):
   - `_rep_client_approval_payload(p_user_id uuid)` מתוך `ensure_rep_client_approval_step` (217).
   - הטלאי של «חובה» מתוך `shaam_require_client_approval` (217) — `_rep_client_approval_required_patch(p_payload jsonb, p_people jsonb)` אם הוא ביטוי טהור; אחרת הווריאנט משתמש באותם מפתחות ו-P.2 מוכיח.
   - מהמחולל (`generate_onboarding_steps`, 216 משורה 515): ה-payload של `client_documents`, `prev_accountant_details`, `paperless_invite`, `paperless_connection`, `paperless_tax_authority`, `retainer_authorization` → `_onboarding_system_payload(p_step_type text, p_inputs jsonb)`; המחולל קורא לה עם הקלטים שלו, הצפייה עם קלטי דוגמה.
     אם הוצאה ממחולל מסוים מסוכנת מדי — לא מוציאים, והצפייה משתמשת בנתיב `system` של `_flow_item_spec` + וריאנט; **P.2 חייבת לעבור לאותו סוג** או שהסוג נרשם כפער בדוח.
5. **`preview_request_sample(p_request jsonb) returns jsonb`** — `STABLE SECURITY DEFINER`, `auth.uid()` חובה ו-`public.is_authorized()`; `grant execute to authenticated` בלבד.
   קלט:
   ```json
   { "samples": [ { "key": "a",
                    "ref": {"kind":"template","templateId":"…"} | {"kind":"document","docId":"…"} | {"kind":"system","stepType":"…"} | null,
                    "stepType": "custom_request", "payload": { },      // רק כש-ref ריק: payload שנבנה בדפדפן בנתיב היצירה
                    "repeatable": false, "status": "pending", "ball": "client", "patch": { }, "lockReason": "…" } ],
     "persona": { "couple": false },
     "rep": { "status": "pending_fill", "spousePending": false, "niReference": false, "approvals": "single|couple|none" } }
   ```
   עבודה: `p` = הפרופיל של המשתמש (מיתוג, קישור ההזמנה לפייפרלס, קבצי המשרד); `c`/`req` = `jsonb_populate_record` מנתוני הדוגמה (D5, טוקנים = `'sample'`); לכל דגימה — payload לפי D3, `|| patch`; `s` = רשומה וירטואלית (`id = 'sample-'||key`, `published_at = now()`); `_portal_step_items`.
   פלט = צורת `PortalData` + `sample: true` + `specs: [{key, ok, reason, stepType, title, owner, internal}]`.
   ‼ תבנית של משרד אחר — `_library_template` מחזיר ריק ⇒ `library_item_missing` (P.4).

### 6.2 הדף האישי — מצבים ופעולות

- `src/components/portal/portalActions.ts`: `interface PortalActions { mode; submitStep; uploadDocument; submitBusinessDetails; confirmOpened; notifyAccountant; openLinked(kind) }`;
  `livePortalActions(token)` (הקוד הקיים, מועבר כמות שהוא) · `samplePortalActions({ onSimulated, onOpenLinked })` — **בלי שום import מ-supabase**.
- `PublicPortalPage.tsx`: `PreviewCtx` (בוליאני) מוחלף ב-`PortalModeCtx` + `PortalActionsCtx`. כל `supabase.rpc('portal_submit_step')`, `supabase.functions.invoke('portal-upload-document')`, `portalSubmitBusinessDetails`, `confirmOpened`, `flushAccountantNotifications` — דרך הפעולות.
  - `sample`: פתיחה/הרחבה/הקלדה עובדות; שליחה → `{ok:true, simulated:true}` + ההודעה מ-§5.1; העלאה — לא פותחת בורר קבצים, מציגה את ההודעה; קובץ מספריית המשרד — נפתח; קובץ מהתיק (`documentId`) — «נפתח רק אצל הלקוח»; קישור טוקן → `openLinked`.
  - `officeView` (מה שהיום `preview || !token`): הכול נפתח לקריאה (רשימות, הוראות, שדות עם הערכים), שדות ושליחה כבויים, תגי טיוטה/יוסר/נערך כמו היום.
  - `live`: ללא שינוי התנהגות. הדף הציבורי (`?portal=`) תמיד `live`.
- `PortalView` מקבל `mode` במקום `preview`; `preview` נשאר כ-alias ל-`officeView` עד שכל הקוראים עוברים.

### 6.3 מודול הצפייה — `src/features/requestPreview/`

| קובץ | תפקיד |
|---|---|
| `registry.ts` | רשומה לכל סוג/מקור (טבלה §7): `clientSees: 'page'|'officeLine'|'nothing'|'separateLink'`, `variants`, `moments` (לקבוצות), `emails`, `documents`, `linkedPage`, `editAt`. ‼ אין בו טקסט שהלקוח רואה — רק בחירת מצבים ומפתחות. |
| `targets.ts` | `PreviewTarget` + המרה ל/מ focus (`view:…`) + `targetOfLibraryRow/GroupKid/Doc/CatalogItem`. |
| `api.ts` | `loadRequestPreview(target, variant, draftPayload?)` → `preview_request_sample`; שגיאות מוקלדות. |
| `RequestPreviewSheet.tsx` | המגירה: כותרת, תג, לשוניות, צירי מצב, `PortalView mode="sample"`, תחתית פעולות. |
| `ProcessPreview.tsx` | בקשה מורכבת (§5.4). |
| `MailPreview.tsx` | לשונית «במייל» — HTML ב-`iframe srcdoc` עם `sandbox=""` (אין ניווט, אין סגנונות דולפים). |
| `DocsPreview.tsx` | לשונית «מסמכים» (D12). |
| `LinkedPagePreview.tsx` | לשונית «המסך שנפתח» (שלב ב׳, §9). |

### 6.4 מיילים (לשונית «במייל»)
- **«המייל שמפנה לדף»** — `consolidatedMailSample(profile, {requests:[clientTitle], first})` עם ציר «מייל ראשון / לקוח שכבר יש לו דף». משפט קבוע מעל: «המייל לא מכיל את הבקשה — הוא מפנה לדף. יוצא כשלוחצים «שלח מייל…», או לבד אם כלל הפתיחה מוגדר כך.» (טקסט ה«לבד» — `DELIVERY_LABELS`).
- **תזכורת** (`portal_reminder`) — אותה מעטפת.
- **מסמך שנשלח** — `documents_sent`.
- **ייצוג** (`rep_onboard`, `rep_sign`, `rep_ni_approve`, `rep_active`, `rep_prerequisites`) — שלב א׳: «הנוסח נערך ב«מיילים» ←» שפותח את `RepMessageDrawer` הקיים (לא חיקוי נוסף). שלב ב׳: אם ההרכבה בשולח ניתנת להוצאה ל-`_shared` כקוד טהור — משתמשים בה בשני המקומות ומוחקים את `rs-mail`.
- **גורם חיצוני** (מכתב העברה לרו״ח הקודם) — מסומן «נשלח לרו״ח הקודם — לא ללקוח», מהתבנית האמיתית (`utils/releaseLetter`).

### 6.5 מסמכים (לשונית «מסמכים»)
- קובץ מספריית המשרד (`resources[].url`, `resourceUrl`) — שם + «פתיחה» (הקובץ האמיתי).
- דרישת העלאה (מסמכים מהלקוח, שדה קובץ) — «הלקוח מעלה כאן: …» (מה שמצויר בדף).
- נוצר לכל לקוח — לפי D12: ייפוי כוח (טופס הרשות, ממולא מהפרטים וחתום), מכתב העברה, 6101. דוגמה רק בתנאי D12; עד אז — הסבר.

### 6.6 מקומות נוספים (D11)
- `AddRequestDialog` — «צפייה» לכל פריט בקטלוג ובספרייה; פריטים שה-payload שלהם נבנה בדפדפן (`bank_debit` ← `buildBankDebitPayload` עם שלוש הרשויות; `send_document` ← `buildSendDocumentsPayload` עם קובץ לדוגמה מהספרייה) שולחים את ה-payload ב-`samples[].payload`.
- בונה הכללים (`flows/builder/AddSheet.tsx`, `ItemSheet.tsx`) — «צפייה» לכל פריט מהספרייה.
- `RuleCard` («כללי פתיחה») — שם בקשה/קבוצה לחיץ לאותה מגירה (עדיפות נמוכה).
- `RequestEditor` — `lb-preview` (G3) יוצא; במקומו כרטיס אמיתי אחד (`PortalView mode="sample"`) מה-payload של הטיוטה (debounce ‏400ms) + «תצוגה מלאה» שפותח את המגירה עם תג «טיוטה — לא נשמר».
- `InlineComposer` (בקשה חופשית בתיק) — אותו כרטיס חי (עדיפות נמוכה).

### 6.7 הדגמה (`?office-app`)
`__fakeBackend.ts` מחזיר ל-`preview_request_sample` פלט **שנלכד מ-staging** (`src/components/office/__fixtures__/requestPreview.json`, נוצר ב-`scripts/capture-request-preview-fixtures.mjs`). מפתח בלי לכידה → שגיאה מפורשת «אין דוגמה בהדגמה», לא ציור מומצא.

---

## 7. מיפוי סוגי הבקשות

מקור הטבלה: ענפי `build_client_portal` (220), `REQUEST_GROUPS`, `CATALOG` ב-`AddRequestDialog`, `PORTAL_STEP_TYPES`.
«דלי» = איפה הלקוח רואה את זה בדף: פעולה (מה צריך ממך) · משרד (בטיפול המשרד) · בהמשך · הושלם.

| מקור / סוג | מה הלקוח רואה | צירי מצב (ברירת מחדל ראשונה) | במייל | מסמכים | המסך שנפתח | איפה עורכים |
|---|---|---|---|---|---|---|
| תבנית ספרייה — `custom_request` רגילה | כרטיס פעולה: כותרת, שורה, הוראות (`clientNote`), מספרים להעתקה (`clientRefs`), משפט סיום, שדות (אישור/טקסט/מייל/טלפון/מספר/תאריך/בחירה/קובץ/קבצים), כפתור | ממתין · הושלם · בהמשך | מפנה לדף | קובץ/קישור אם יש | — | עורך הספרייה |
| — עם חומר עזר (`clientResource`/`clientLinkUrl`) | כרטיס «מדריך»: פתיחה + «עברתי על…» | ממתין · הושלם | מפנה לדף | הקובץ האמיתי | — | עורך הספרייה |
| — הודעה (`messageOnly`) | «הודעה מהמשרד», בלי פקד | פתוחה בלבד | מפנה לדף | — | — | עורך הספרייה |
| — בעלים «המשרד» (`internalTask`) | **כלום** — «משימה של המשרד, לא מופיעה ללקוח» | — | — | — | — | עורך הספרייה |
| — עם «אישור» במסלול לזוג | לבעל הכרטיס כרגיל; לבן/בת הזוג — לא נפתחת (`personal_confirm`) | יחיד · זוג | מפנה לדף | — | — | עורך הספרייה |
| תבנית — `client_documents` | רשימת מסמכים להעלאה, «0 מתוך N התקבלו», הערת «נדרש על ידי רשות המסים» | ממתין · חלק התקבל · הושלם · **במסלול שנתי** (`repeatable=true` ⇒ בקשה חופשית עם שדות קובץ) | מפנה לדף | «הלקוח מעלה» | — | עורך הספרייה / פריט בקליטה (`editsInIntake`) |
| מסמך מהספרייה (מדף «מסמכים») | `_document_request_payload` ⇒ כרטיס «מדריך» עם הקובץ | ממתין · נפתח | «שלחנו לך מסמך» (`documents_sent`) | הקובץ האמיתי | — | מדף «מסמכים» |
| `send_document` (קטלוג) | «מסמכים מהמשרד»: שורה לכל קובץ + המלל | חדש · נפתח | `documents_sent` | קובץ ספרייה — פתיחה; קובץ מהתיק — «רק אצל הלקוח» | — | בחלון השליחה |
| `bank_debit` (קטלוג) | בקשה חופשית: אסמכתה לכל רשות + קודי מוסד להעתקה | ממתין · הושלם | מפנה לדף | «הלקוח מעלה» | — | בחלון ההוספה |
| `intake_questionnaire` | כרטיס «עדכון סטטוס מיסויי» + «להמשך» | ממתין · הושלם · בהמשך | מפנה לדף | — | השאלון (`?intake=`) — שלב ב׳ | נוסח קבוע |
| קבוצת ייצוג — `representation` | «מילוי פרטים וייפוי כוח» ← «חתימה» ← «חתימת בן/בת הזוג» ← «ייפוי הכוח» (משרד) ← «הוגש לרשויות» ← «הייצוג אושר» | רגעים: מילוי · חתימה · בבדיקה אצלנו · הוגש · פעיל; יחיד · זוג | `rep_onboard`, `rep_sign`, `rep_active` (בנוסח ב«מיילים») | ייפוי כוח — נוצר לכל לקוח (D12) | מילוי (`?onboard=`), חתימה (`?sign=`) — שלב ב׳ | «מיילים» (מיילי ייצוג) |
| — `authority_representation` (ב״ל לאדם) | משרד: «בטיפול המשרד — הזנת הייצוג בביטוח לאומי»; ממתין ללקוח: הודעה עם אסמכתה, תאריך יעד וקישור לב״ל | בטיפולנו · ממתין לאישור הלקוח · אושר; לקוח · בן/בת זוג | `rep_ni_approve` | — | אתר ב״ל (חיצוני) | נוסח קבוע |
| — `rep_client_approval` | כרטיס הצהרה: מה כל אדם מסמן, מדריך מצולם 7 צעדים, «לכניסה לאזור האישי», «אישרתי באזור האישי», «אין לך משתמש…» | ממתין · אחרי «אישרתי» · הושלם; יחיד · זוג; **זירוז · חובה** | תזכורת לאזור האישי | — | gov.il (חיצוני) | **«מיילים» ← כרטיס בדף הלקוח** (G4) |
| — `representation_upgrade` | **כלום** | — | — | — | — | — |
| — `file_opening` | משרד: «פתיחת התיקים ברשויות — בטיפולנו» | בטיפולנו · הושלם | — | — | — | — |
| קבוצת פייפרלס — `paperless_invite` | הרשמה: קישור ההזמנה של המשרד + שם העסק + «נרשמתי לפייפרלס» | **אין חשבון** · יש לו חשבון («קישור חשבון הפייפרלס למשרד») · מייצג קודם (ללקוח — כלום) · לא רלוונטי (כלום) · הושלם | מפנה לדף | — | פייפרלס (חיצוני) | נוסח קבוע + קישור ההזמנה ב«מיילים» |
| — `business_details` | טופס «פרטי העסק» + שאלון עבודה מהבית | ממתין · בבדיקה אצלנו · הושלם | מפנה לדף | — | — | נוסח קבוע |
| — `paperless_connection` | משרד: «בימים הקרובים ניכנס…»; מייצג קודם: «העברת החשבון אלינו» | בהמשך · בטיפולנו · הושלם | — | — | — | נוסח קבוע |
| — `retainer_authorization` | משרד: «אנחנו מסדירים…» → פעולה ללא פקד: «הזנת כרטיס אשראי בפייפרלס» + חיוב אימות 1 ₪ → משרד: «פרטי הכרטיס התקבלו» | לפני · נדרש כרטיס · הכרטיס הוזן · הושלם; הסדר ידני ⇒ כלום | — | — | — | נוסח קבוע |
| — `paperless_tax_authority` | הצהרה: שלבי החיבור, «ביצעתי את החיבור», מדריך פייפרלס | ממתין · הושלם; רק לעוסק מורשה וחברה | מפנה לדף | — | מדריך פייפרלס (חיצוני) | נוסח קבוע |
| קבוצת העברת טיפול — `prev_accountant_details` | טופס שם/מייל/טלפון, מילוי מראש | ממתין · הושלם; לקוח שחוזר (`askAgain` — בלי מילוי מראש) | מפנה לדף | — | — | עורך הספרייה (נוסח מוכן) |
| — `release_letter` | ללקוח: שורת משרד אחת «קבלת החומרים מרואה החשבון הקודם» | בתהליך · התקבלו | **מייל לרו״ח הקודם** (מסומן: לא ללקוח) | מכתב ההעברה — נוצר לכל לקוח (D12) | הדף של הרו״ח הקודם (`?release=`) — שלב ב׳ | «מיילים» ← המכתב לרו״ח הקודם |
| — `materials_received` | מקופל לאותה שורה | — | — | — | — | — |
| `smart_form_btl6101` (קטלוג) | **לא בדף** — קישור חתימה אישי (`?sign-form=`) | — | — | הטופס — נוצר לכל לקוח (D12) | דף החתימה — שלב ב׳ | ניהול תבנית 6101 |
| `identity_confirm` (צילום תעודה לשע״ם, `shaamIdentity`) | «צילום תעודה לרשות המסים»: הצילום שבתיק + «זה הצילום שלי» / העלאה אחרת | ממתין · הושלם; בן/בת זוג ⇒ ללקוח כלום | — | הצילום — «נפתח רק אצל הלקוח» | — | נוצר מהייצוג |
| סוגים פנימיים (`data_import`, `data_verification`, `internal_setup`, `kyc_identification`, `first_month_review`, `institution_alignment_*`, `opening_call`) | **כלום** | — | — | — | — | — |

---

## 8. היקף השינויים

**חדש:** `supabase/222-request-preview.sql` · `scripts/sql/test-222-request-preview.sql` · `src/components/portal/portalActions.ts` ·
`src/features/requestPreview/*` (§6.3) + `__tests__/registry.test.ts`, `__tests__/portalModes.test.ts` ·
`scripts/capture-request-preview-fixtures.mjs` · `scripts/qa-request-preview.mjs` · `src/components/office/__fixtures__/requestPreview.json`.

**משתנה:** `PublicPortalPage.tsx` (מצבים + פעולות; בלי שינוי התנהגות ב-`live`) · `LibraryPage.tsx`, `library/GroupEntry.tsx`, `library/libraryModel.ts` (`kidsOf` → מודל משותף; תיקון G4), `library/RequestEditor.tsx` (G3), `ClientDocumentsSection.tsx` (מסמך — «צפייה») ·
`clientTabs/AddRequestDialog.tsx` · `flows/builder/AddSheet.tsx`/`ItemSheet.tsx` · `office/pages/flows/RuleCard.tsx` (נמוך) ·
`clientTabs/PortalPreviewPanel.tsx`, `ClientPagePreviewDialog.tsx`, `office/RepresentationSettingsSection.tsx` (`preview` → `mode="officeView"`/`"sample"`) ·
`__fakeBackend.ts` · `CLAUDE.md` §12.5 + §12.6 חדש · `docs/testing.md`.
**בדיקות קיימות שחייבות עדכון:** `staging-test-single-source.mjs` בדיקה E (הענפים עוברים ל-`_portal_step_items`) · `portal/__tests__/portalView.test.ts` (ביטויים על המקור) · כל סקריפט שקורא את גוף `build_client_portal` (לחפש `build_client_portal` ב-`scripts/`).

**לא נוגעים:** `portal_submit_step` וכל פונקציות ההגשה; פרסום, מייל, תזכורות, אוטומציות; המחולל — מעבר להוצאת payload מילה במילה; `SPEC.md`; `חומרים/`.

---

## 9. משימות ביצוע (לפי הסדר)

כל משימה נסגרת רק כשהקריטריונים שלה נבדקו בפועל.

**שלב 0 — הכנה**
- 0.1 `git fetch`; אם `origin/master` זז — rebase של `plan/request-preview`; ענף עבודה `feature/request-preview`. לוודא את המספר ואת בסיס הגוף (D14, §6.0). לא לגעת בתיקייה הראשית (סשנים מקבילים — `git add` רק לקבצים שלך).
- 0.2 להפעיל `request-preview` (5210) ו-`request-preview-staging` (5211); לאמת בדפדפן שהספרייה נטענת בשניהם.

**שלב א׳ — שרת** (קבלה: P.1–P.6 עוברות ב-staging בהרצה מתבטלת)
- A1 `_portal_rep_item` + `_portal_step_items` + `build_client_portal` חדש (§6.1.1–3).
- A2 פונקציות ה-payload של היוצרים (§6.1.4), והיוצרים קוראים להן.
- A3 `preview_request_sample` (§6.1.5).
- A4 `scripts/sql/test-222-request-preview.sql` (§10.2) והרצה: `node scripts/staging-dryrun-flows.mjs --tests scripts/sql/test-222-request-preview.sql` — וגם `test-notices-flows.sql`, `test-r4-engine.sql`, `test-r4-notices.sql`, `test-220-business-details.sql`.

**שלב ב׳ — הדף האישי** (קבלה: `live` זהה; `sample` בלי רשת; `officeView` מראה תוכן)
- B1 `portalActions.ts` + מעבר כל הקריאות. B2 `PortalModeCtx` ושלושת המצבים. B3 עדכון `PortalPreviewPanel`, `ClientPagePreviewDialog`, `RepresentationSettingsSection`, `__TestPortalPreview`.
- B4 בדפדפן: `?portal=demo&office-app` (live מדומה) — שליחה עדיין עובדת כמו היום; «הדף של דוד» — בקשה חופשית נפתחת ורואים את השדות, שדות כבויים.

**שלב ג׳ — מודול הצפייה והספרייה** (קבלה: §10.3)
- C1 `registry.ts`, `targets.ts`, `api.ts`. C2 `RequestPreviewSheet` (§5.1–5.3). C3 `ProcessPreview` (§5.4). C4 `MailPreview`, `DocsPreview`.
- C5 «צפייה» בכל שורות הספרייה ובמדף «מסמכים» (D6) + focus `view:…`. C6 תיקון G4 בשורת «אישור הייצוג באזור האישי» («הנוסח נערך ב«מיילים» ←»).
- C7 `RequestEditor` — כרטיס אמיתי במקום `lb-preview` (G3).
- C8 לכידת הדוגמאות + הדגמה (§6.7).

**שלב ד׳ — מקומות בחירה** (קבלה: אותה מגירה, אותו תוכן)
- D1 `AddRequestDialog` (+ «הוספה ל{שם}»). D2 בונה הכללים. D3 `RuleCard` ו-`InlineComposer` (אם הזמן מאפשר — אחרת לדוח כפער).

**שלב ה׳ — «המסך שנפתח»** (קבלה: הרכיב האמיתי מצויר על נתוני דוגמה, בלי רשת)
אותו דפוס כמו `PortalView`: להפריד טעינה מתצוגה ולהזריק פעולות. נתוני הדוגמה כאן הם קלט (שם, רשויות, היקף), לא טקסט — מותר שיהיו ב-TS.
- E1 `OnboardingPage` (מילוי וחתימה על ייפוי הכוח) + `PublicSignPage` — עדיפות ראשונה (קבוצת הייצוג).
- E2 `PublicReleasePage` (הרו״ח הקודם — מסומן «גורם חיצוני»). E3 `PublicIntakePage` (המסך הראשון של השאלון). E4 `PublicSmartFormSignPage`.
- מסך שלא הושלם — הלשונית מציגה משפט כן: «בלחיצה נפתח מסך נפרד: …» + מה נשאל בו, **ונרשם בדוח כפער**. לא צילום מסך (יתיישן).

**שלב ו׳ — עיגון** (§11) **ושלב ז׳ — הכנה לשחרור** (§12).

---

## 10. בדיקות

### 10.1 יחידה (`npm run test:unit`)
- **כיסוי** (`registry.test.ts`): כל סוג ב-`PORTAL_STEP_TYPES`, כל `CATALOG` ב-`AddRequestDialog`, כל חבר ב-`REQUEST_GROUPS`, וכל `OnboardingStepType` — יש לו רשומה, או `clientSees:'nothing'` עם נימוק. מפתחות וריאנטים ייחודיים; לכל רשומה `emails`/`documents` מוצהרים (גם ריקים).
- **בלי רשת בדוגמה** (`portalModes.test.ts`): ב-`PublicPortalPage.tsx` אין `supabase.` מחוץ ל-`portalActions.ts`; `samplePortalActions` לא מייבא את `lib/supabase`; הדף הציבורי (`PublicPortalPage`) לא יכול לקבל `sample`.
- **כתובות:** `targets` הלוך-חזור לכל סוג יעד.

### 10.2 SQL — `scripts/sql/test-222-request-preview.sql` (staging, מתבטל)
- **P.1 זהות הדף:** לפני החלת 222 — טבלה זמנית עם `build_client_portal(id,'live')` ו-`(id,'preview')` לכל לקוח; אחרי — השוואה. **אפס הבדלים.**
- **P.2 דוגמה = אמת:** לקוח QA בתוך העסקה; לכל רשומה × וריאנט עיקרי — יוצרים שלב אמיתי בנתיב האמיתי (`create_onboarding_request` מתבנית — וגם עם הפלט של `buildPayload` של הקומפוזר, הנתיב של «＋ בקשה חדשה»; `ensure_rep_client_approval_step`; `shaam_require_client_approval`; המחולל ל-QA; `_flow_materialize` לפריט מערכת), ומשווים את הפריט שלו ב-`build_client_portal` לפריט מ-`preview_request_sample`. נרמול: `key`/`actionValue`/`stepId`/טוקנים/שמות. **שוויון.**
- **P.3 אין כתיבה:** `provolatile = 's'` ל-`preview_request_sample` ול-`_portal_step_items`; ספירות `clients`, `onboarding_steps`, `onboarding_events`, `email_messages`, `client_step_notice_state`, `automation_jobs`, `net.http_request_queue` לפני ואחרי 50 קריאות — זהות.
- **P.4 הרשאות:** anon — אין הרשאה; משתמש לא מורשה — נדחה; תבנית של משרד אחר — `library_item_missing`; הפלט בלי טוקנים אמיתיים (רק `'sample'`).
- **P.5 קצוות:** `not_repeatable`, `library_item_missing`, משימה פנימית (`internal: true`, אפס פריטים), וריאנט לא מוכר — שגיאה ברורה.
- **P.6 היוצרים:** אחרי הוצאת ה-payload — `staging-test-onboarding-roundtrip.mjs real` + `synthetic` ו-`test-r4-engine.sql` ללא שינוי.

### 10.3 דפדפן — `scripts/qa-request-preview.mjs` (playwright-core, staging 5211 + `?office-app` 5210)
- לכל שורה בספרייה (בקשות, ילדי קבוצות, קבוצות, מסמכים): «צפייה» נפתח; תג «דוגמה»; לפחות פריט אחד או משפט «לא מופיע ללקוח»; כל לשונית וכל וריאנט מתחלפים; אפס שגיאות קונסול.
- **מלכודת רשת:** בזמן הצפייה וכל הלחיצות בתוכה — כשל על כל בקשה ל-`portal_submit_step`, `portal_submit_business_details`, `functions/v1/portal-upload-document`, `portal-open-document`, `send-*`, `notify-accountant`, וכל RPC שמתחיל ב-`create_|save_|upsert_|delete_|publish_|advance_|set_|approve_|confirm_`. מותר: `preview_request_sample`, קריאות טעינה, קבצים ציבוריים של המשרד, גופנים.
- **הלקוח באמת רואה את זה:** ב-staging, לקוח QA עם אותה בקשה — צילום של `?portal=<token>` ב-390 מול הצפייה ב-390 (אותו וריאנט): זהים חוץ משם, תג וכותרת המגירה.
- **מסלולים מלאים במחשב ובטלפון (1280 / 390 / 360):** (1) «אישור הייצוג באזור האישי» → מדריך 7 צעדים (כל תמונה 200) → «זוג» → «חובה» → «אישרתי» (הודעת הדגמה) → «עריכת הנוסח ב«מיילים» ←» נוחת על העורך הנכון. (2) «פייפרלס» → «צפייה» בקבוצה → רגעים → צפייה בילד וחזרה. (3) בקשה חופשית עם שדות → הקלדה → שליחה (הדגמה) → «הושלם». (4) מסמך מהמדף → הקובץ נפתח. (5) «＋ בקשה חדשה» אצל לקוח QA → «צפייה» → «הוספה ל{שם}» → הבקשה נוצרה כטיוטה (כמו היום) → «איך זה ייראה» מציג אותה עם התוכן פתוח. (6) רענון עם `view:` בכתובת — המגירה חוזרת; «אחורה» בטלפון סוגר.
- בלי גלילה אופקית; יעדי מגע ≥ 44px; מצב כהה במשרד (הדף בפנים נשאר בהיר); פוקוס חוזר לכפתור «צפייה» אחרי סגירה.
- **רגרסיה:** הספרייה (חיפוש, אינדקס אותיות, «בשימוש ב»), העורך, «הדף של X», `?portal=demo` שליחה אמיתית במדומה, בונה הכללים.
- אחרי הסוויטה ב-staging: `email_messages`, `onboarding_steps`, `onboarding_events` של משתמש הבדיקה — אותן ספירות כמו לפני (חוץ מהטיוטה שבמסלול 5, שמבוטלת בסוף).

---

## 11. עיגון — כל סוג בקשה עתידי חייב להשתלב

### 11.1 `CLAUDE.md`
שורה ב-§12.4 (צ'קליסט), אחרי סעיף 8:
```
9. **צפייה** — לסוג/תבנית/מסמך יש רשומה ב-`features/requestPreview/registry.ts` עם המצבים, המיילים, המסמכים והמסך שנפתח; «צפייה» בספרייה מראה בדיוק את מה שהלקוח מקבל (`preview_request_sample` → `_portal_step_items`, אותו קוד כמו הדף). בדיקת הכיסוי נופלת על סוג בלי רשומה.
```
שורה בטבלה §12.5:
```
| מה הלקוח רואה בבקשה — בדף, בצפייה בספרייה ובתצוגות במשרד | ענף ב-`_portal_step_items` (222) — **המקום היחיד**; `build_client_portal` ו-`preview_request_sample` קוראים לו. רשומה ב-`features/requestPreview/registry.ts`. פעולה חדשה בדף — רק דרך `PortalActions` (`portal/portalActions.ts`), עם התנהגות `sample` שלא פונה לרשת | `run-unit-tests.mjs` (registry, portalModes), `test-222-request-preview.sql` (P.1–P.5), `scripts/qa-request-preview.mjs` |
```
ומקטע קצר §12.6 «צפייה» — שלושת המצבים (D4), «דוגמה מסומנת», «אין בצפייה שליחה/שמירה/חתימה/אישור/אוטומציה», ו«בקשה חדשה = ענף + רשומה + וריאנטים + P.2».

### 11.2 `docs/testing.md`
מקטע «צפייה בבקשה» עם שלוש השכבות מ-§10 ואיך מריצים כל אחת.

### 11.3 אכיפה
בדיקת הכיסוי (10.1) ו-P.2 הן השער: סוג חדש בלי רשומה או בלי שוויון דוגמה↔אמת — נכשל.

---

## 12. הכנה לשחרור (לא לבצע פריסה)

1. `npx tsc --noEmit` · `npm run test:unit` · `vite build`.
2. staging מתבטל: `staging-dryrun-flows.mjs --tests …` (§9 A4) — הכול עובר.
3. **החלה על staging — רק אחרי אישור קצר של גיא.** לפני: גיבוי הגדרות הפונקציות שמשתנות (`build_client_portal`, `ensure_rep_client_approval_step`, `shaam_require_client_approval`, `generate_onboarding_steps`) ל-`docs/evidence/request-preview-2026-10-05/staging-before-222.json`. אחרי: `verify-migration-functions.mjs supabase/222-request-preview.sql` (staging), `staging-test-onboarding-roundtrip.mjs real|synthetic`, `staging-test-single-source.mjs` (E המעודכנת), `capture-request-preview-fixtures.mjs`, `qa-request-preview.mjs`.
4. **ייצור — הכנה בלבד:** `prod-dryrun-6101-migrations.mjs --files supabase/222-request-preview.sql` עם בדיקת P.1 על כל לקוחות הייצור (הכול מתבטל — קריאה בלבד בפועל). לוודא שהעמודות שהפונקציות קוראות קיימות בייצור (`prod-behind-staging-drift`).
5. סדר השחרור לכשיאושר: גיבוי (`prod-backup-before-migration.mjs`) → 222 (`prod-apply-migration.mjs`) → `verify-migration-functions.mjs supabase/222-request-preview.sql --prod` + `verify-migration-ownership.mjs --target=prod` → האתר (push ל-master — באישור) → בדיקה חיה של הספרייה (קריאה בלבד). **אין** פונקציות Edge לפרוס, **אין** cron.
6. דוח לגיא (עברית): מה נבנה, מה נבדק ואיך (צילומים 1280/390/360), מה לא נבדק (מכשיר אמיתי, משתמש חדש אמיתי), פערים שנשארו (למשל מסך בשלב ה׳ שלא הושלם), ומה דרוש לשחרור.

---

## 13. סיכונים ומה מחוץ להיקף

- **הרפקטור נוגע בפונקציה של כל דף לקוח.** ההגנה: גוף מילה במילה, P.1 על כל לקוחות staging ובהרצה מתבטלת על הייצור, ושלושה תפרים בלבד.
- **הוצאת payload מהמחולל** — מילה במילה; P.6. אם סוג מסוים מסוכן — לא מוציאים, P.2 מכריעה, והפער נרשם.
- **שינוי בתצוגות במשרד (D4 `officeView`)** — הרואה במשרד יראה עכשיו את תוכן הבקשות (שקודם הוסתר). זה מכוון; לציין בדוח.
- **מחוץ להיקף:** שינוי נוסחים; שינוי פרסום/מייל/תזכורות; תצוגה על נתוני לקוח אמיתי בספרייה; עורך חזותי לבקשות; ייצוא PDF של הצפייה.
