# טפסים חכמים שהלקוח ממלא וחותם — 4440 ו-821

> 15.10.2026 · ענף `feature/smart-forms-4440-821` (worktree `C:/Users/guyas/pivo-wt/smart-forms-4440-821`, על origin/master 554d432)
> · מיגרציה 247. בקשת גיא: «כמו 6101», מתווסף מ«בקשות» של הלקוח, מה שבכרטיס ממולא, השאר בשאלון לפי
> עיצוב השאלונים, הלקוח רואה את הטופס המלא וחותם. ובהמשך (אותו יום): **מה שנענה בשאלון ושיש לו בית בכרטיס
> נשמר בכרטיס** — בלי כפילויות.

## 1 · ההבדל מ-6101

| | 6101 | 4440 / 821 |
|---|---|---|
| מי ממלא | המשרד (מסך עבודה) | הלקוח בדף האישי (שאלון), המשרד יכול להשלים |
| חתימה | במשרד או קישור חתימה | בדף האישי, אחרי צפייה בטופס המלא |
| מה הלקוח רואה | שורה שקטה «בטיפול המשרד» | פעולה «מילוי וחתימה» (שאלה/קבוצה אחת למסך) |
| תשובה שיש לה בית בכרטיס | לא נכתבת לכרטיס (החלטה 29.09) | **נכתבת לכרטיס** בשרת, עם היסטוריה (החלטה 15.10) |

מה משותף: `smart_form_filings` / `_revisions` / `_events`, `_smart_form_template`, `smart_form_advance` (הגשה, תשובה,
סגירה, ביטול), `smart_form_attach_signed_pdf`, מנוע הפריסה והייצוא (`layout.ts`, `exportPdf.ts`), דף התצוגה
`SmartFormPreview`, צריבת החתימה.

## 2 · מקור נתונים אחד

- **כרטיס** (`clients`): השרת מחשב «מה בכרטיס» (`_scf_card`) — זהות, טלפונים, כתובת (פירוק רחוב/מספר), בן/בת זוג,
  עסק (העסק הפעיל הראשון ב-`businesses`), חשבון הבנק הראשי, פקיד שומה. הדפדפן אינו מחשב את זה.
- **תשובה לשדה שיש לו בית בכרטיס** ⇒ `_scf_apply` כותב לעמודה/ל-jsonb בכרטיס, `field_meta.<key>` (`via=<טופס>`,
  `by=client|office`) ושורת `tax_fact_changes` (`source='prerequisite'`, ערכים לפני/אחרי). זהות (שם, ת.ז.) — רק
  השלמה של ריק; תיקון זהות — במשרד.
- **תשובה שאין לה בית** (תאריך הפרידה, מקורות הכנסה בשנה האחרונה, מחזור משוער, מספר מועסקים, פרטי הנכס…) ⇒
  `smart_form_revisions.values`. נראית בפאנל הבקשה במשרד ובטופס עצמו.
- **הצילום לחתימה** נבנה **בשרת** (כרטיס ∪ תשובות) בלחיצה «לצפייה בטופס»; הטביעה מחושבת בשרת כמו ב-6101
  (`template_sha256|mapping|purposes|data`). החתימה נדחית אם התוכן השתנה.

## 3 · מחזור חיים

`waiting_client_info` (הלקוח ממלא) → **הכנה** → `awaiting_signatures` → חתימה → `signed` → (המשרד מפיק את הקובץ החתום
אוטומטית בפתיחה) → `submitted` → `result_received` → `closed`. תשובה/תיקון לפני חתימה מחזירים את הגרסה לטיוטה.
ביטול — `smart_form_advance('cancel')`.

## 4 · מגבלות ידועות (גלויות למשרד וללקוח)

- **4440 דורש אישור עו״ד** («יחתום עליו בפני עו״ד»). החתימה בדף האישי מכינה את התצהיר; אישור העו״ד אינו ממולא.
- **4440 — חתימת בן/בת הזוג** אינה נאספת בגרסה זו (הטופס מאפשר תצהיר נפרד לכל אחד); עמודת בן/בת הזוג
  ממולאת בפרטי הזיהוי בלבד, וההכנסות שלו/ה — אם הלקוח מסר.
- **821** — עוסק יחיד בלבד; עמוד 2 (מנהלי חברה / שותפות) ו«עסק בהקמה», «הצהרת המייצג» ו«לשימוש המשרד» אינם
  ממופים.
- עריכת מיפוי על גבי הטופס (מנהל התבניות של 6101) — לא בסבב הזה; התבניות מוצגות בספרייה לצפייה.

## 5 · מצב (15.10.2026, סוף הסבב)

**מומש ונבדק ב-staging. לא בקומיט, לא באתר. 247 הוחלה רק ב-staging** (החלה חוזרת נבדקה — מדלגת).

קבצים: `supabase/247-smart-client-forms.sql` (+ `scripts/sql/247/rollback-247.sql`), `src/features/smartForms/clientForms/*`
(types, format, ita4440, vat821, registry, api, CfFields, ClientFormScreen, ClientFormPanel, ClientFormTemplateView, hash, css,
`__tests__/clientForms.test.ts`), `public/templates/ita-4440-12.2009.pdf` + `vat-821.pdf`, ועריכות ב-`PublicPortalPage.tsx`,
`OnboardingTab.tsx`, `AddRequestDialog.tsx`, `ClientDocumentsSection.tsx`, `requestPreview/{targets,registry,DocsPreview}`, `smartForms/types.ts`.

| בדיקה | תוצאה |
|---|---|
| `node scripts/run-unit-tests.mjs clientForms` | 11/11 — כולל השוואת מפתחות הקוד ל-`_scf_spec` במיגרציה |
| `node scripts/run-unit-tests.mjs` (הכול) | 1,774/0 |
| `npx tsc --noEmit` · `vite build` | נקי · `ClientFormScreen` בצ'אנק נפרד (10KB) |
| `node scripts/test-smart-client-forms.mjs` | 4 תרחישים: דטרמיניסטי, אין בעיות פריסה, אפס דיו מחוץ לשדות, כל חובה צויר |
| `node scripts/staging-test-smart-client-forms.mjs` | 47/47 מול staging (מנקה אחריו) |
| `node scripts/staging-test-smart-form-6101.mjs` | 77/77 — 6101 לא נפגע |
| דפדפן (playwright, staging) | משרד 1280: קטלוג → פאנל → «מילוי עכשיו» חלקי → אחרי חתימה: PDF במסמכים, «סימון כהוגש». לקוח 390 (4440), 360 (821), 1280: מלא → צפייה → תיקון → חתימה → «נחתם». פאנל משרד ב-390. בלי גלישה לרוחב ובלי שגיאות (מלבד 401 מוכר ב-staging בטעינה). |

תיקונים שהבדיקה בדפדפן מצאה ותוקנו: הרשאת `authenticated` לפונקציות הדף (כמו `get_client_portal` — רו"ח מחובר שפותח קישור),
טלפון בפורמט 052-…, «מה בטופס» לפי נושא, «מילוי עכשיו» רק על החסר ושמירה חלקית, הצעת «על שם מי הנכס», והצגת כתובת העסק כש«מהבית».

לקוחות דמה שנשארו ב-staging לצפייה: `qascf4440` (הוגש), `qascf821` (נחתם), `qascfg` (ממתין, הושלם חלקית במשרד).
מדריך: `docs/release-guides/2026-10-15-smart-forms-4440-821/index.html` (עצמאי, נבדק לבד ב-1280/390/360).

**פריסה (כשתאושר):** 247 קודם (חזרה בטרנזקציה מתגלגלת + בדיקת גופים), ואז האתר. האתר הקודם מול 247 — לא מושפע
(ענפים חדשים בלבד; `_portal_step_items` מקבל ענף רק ל-`smartForm.clientFill`).

## 6 · שחרור לייצור — מוכן, ממתין לאישור הפריסה (15.10.2026)

נבדק לפני (כולם בלי שינוי בייצור):
- **סדר מול 246** (`pivo-wt/request-removal`, לא בקומיט, לא הוחלה): 246 מחליפה רק את `smart_form_advance`; 247 לא נוגעת בה
  וקוראת רק לפעולות שלא השתנו (cancel בלי scope, record_submission, record_result, close). **כל סדר תקין במסד.** בקוד — שתיהן
  עורכות את `OnboardingTab.tsx`: מי שנכנס שני ממזג (השורה של טופס לקוח: `menu={null}`).
- `node scripts/prod-check-247-ready.mjs` — 32/32 (פונקציות וחתימות, 31 עמודות, ערכי CHECK, העוגנים פעם אחת, אין 247, אין הגשות).
- חזרה בייצור (נבטלה): `prod-dryrun-6101-migrations --files supabase/247-smart-client-forms.sql,scripts/sql/247/dry-run-checks.sql` ⇒ DRY_RUN_OK
  (סימון אחד בכל אחד מארבעת הגופים, 20 פונקציות, הרשאות, תבניות).
- חזרה על ההחזרה (נבטלה): `…--files scripts/sql/247/dry-run-rollback-pre.sql,supabase/247…,dry-run-checks.sql,scripts/sql/247/rollback-247.sql,scripts/sql/247/dry-run-rollback-post.sql`
  ⇒ ארבעת הגופים חזרו בייט-בבייט.
- ‼ מה שהחזרה תפסה: `_portal_step_items` בייצור מערבב CRLF ו-LF (שורות 245). העוגן מותאם עכשיו לשורה עצמה, לא לגוף.

סדר הפריסה (כשגיא מאשר):
1. `node scripts/prod-apply-migration.mjs supabase/247-smart-client-forms.sql` ⇒ `node scripts/prod-check-247-ready.mjs --after`.
2. מיזוג `feature/smart-forms-4440-821` ל-master (origin/master = 554d432, בלי פיצול) ו-push ⇒ Vercel; אימות ב-API (READY + alias).
3. בדיקה חיה: «＋ בקשה חדשה» אצל לקוח בדיקה — הפריטים מופיעים; הפאנל נפתח.

התאוששות: אתר — `dpl_nqw687rK9VwzcJG3u4nb1ZQP8Ecd` (554d432). מסד — `scripts/sql/247/rollback-247.sql` (נעצר אם יש הגשות 4440/821).
האתר הנוכחי מול 247 ממשיך לעבוד (רק ענפים חדשים; 6101 לא משתנה).

## 7 · בייצור (15.10.2026, באישור גיא)

- **מסד:** 247 הוחלה בייצור (`prod-apply-migration`, נרשמה כ-20261015193727). `prod-check-247-ready --after` — 32/32; 23 הפונקציות
  החדשות/המעודכנות זהות בייט-בבייט ל-staging שנבדק. גיבוי לפני: `C:/Users/guyas/PIVO/backups/smart-forms-247-20261015/`.
- **עשן בייצור (נבטל):** `node scripts/smoke-247-rolled-back.mjs --prod` — פתיחה כבעלים (אידמפוטנטית), הדף כ-anon (פריט, «מה בכרטיס»,
  זהות מוגנת, שמירה לכרטיס ולהגשה, הכנה, טביעה שגויה נדחית, חתימה), תצוגת משרד חסומה ל-anon, הכרטיס/ההיסטוריה/השורה — הכול עבר; 0 שאריות.
- **אתר:** master 554d432 ⇒ 789a527 (fast-forward), Vercel — ראה הרשומה למטה.
