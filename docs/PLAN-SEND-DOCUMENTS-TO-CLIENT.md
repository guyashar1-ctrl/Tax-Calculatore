# תוכנית ביצוע — שליחת מסמכים ללקוח: מכל מקור, כמה בבת אחת, ומלל חופשי

> **מסמך למבצע (Opus).** כל מה שצריך נמצא כאן: הכרעות סגורות, מצב קיים, שלבי ביצוע, QA,
> ופריסה עד דחיפה למסטר. לפני הכל — לקרוא את `CLAUDE.md` של הפרויקט (עברית, RTL,
> חובת QA בדפדפן לפני "סיימתי").

---

## הכרעות של גיא — סגורות, לא לפתוח מחדש

1. **שלושה מקורות למסמך, דיאלוג אחד**: ספריית המשרד (כמו היום) · התיקייה של הלקוח ·
   העלאה חדשה מהמחשב (שנשמרת בתיקיית הלקוח ונשלחת ממנה — פעולה אחת, קובץ אחד, בלי כפילות).
2. **כמה מסמכים בבקשה אחת** — למשל שני קבצים בשליחה אחת.
3. **צפייה והורדה מספיקות**: אין חתימה ואין הצהרת "עברתי על המסמך". **פתיחת הקבצים היא
   מה שסוגר את הבקשה** (כשכולם נפתחו — הבקשה הושלמה). זה משנה במודע את הכרעת מיגרציה 108
   (שם `reviewed` היה הסוגר) — עבור בקשות **חדשות** בלבד; בקשות שכבר נשלחו לא נוגעים.
4. **מלל חופשי בלי שום כפתור**: הודעה מהמשרד מופיעה בדף האישי ככרטיס מידע שקט, בלי פקד.
   היא יורדת מהדף כשגיא סוגר/מבטל אותה מהצד שלו (הפקדים הקיימים בלשונית הבקשות).
   אפשר גם לצרף מלל לכל שליחת מסמכים (שדה אחד, לא חובה).
5. **חווית משתמש לפני הכל**: "זה אמור להיות קל יותר משליחת מייל". מסך אחד, מינימום שדות,
   בלי פקדים חדשים שהם חובה, בלי רעש. ראה memory: ui-decluttering-goal.

---

## רקע — איפה זה חי היום

**צד הרו"ח** — [src/components/clientTabs/AddRequestDialog.tsx](../src/components/clientTabs/AddRequestDialog.tsx),
מצב `mode === 'document'` ("שליחת מסמך ללקוח"): select יחיד מספריית המשרד, ויצירת
`custom_request` עם ה-payload מ-`buildDocumentRequestPayload` שב-
[src/lib/clientGuide.ts](../src/lib/clientGuide.ts):

```
title, clientTitle, clientSub, clientCta,
clientResource: <doc.id>            // מזהה בספריית המשרד בלבד
requirements: [opened (רשות), reviewed (חובה — הסוגר)]
```

**ספריית המשרד** — `profiles.settings.client_documents` (קבצים ציבוריים ב-bucket
`firm-resources`). הקישור **נפתר בשרת בכל רינדור** דרך `office_document_url(profile_id, doc_id)`
(מיגרציה 112) — לא צילום מרגע השליחה.

**תיקיית הלקוח** — טבלת `documents` + bucket **פרטי** `client-documents`
(נתיב `<user_id>/<client_id>/<doc_id>`, RLS). צד הרו"ח:
[src/hooks/useDocumentStore.ts](../src/hooks/useDocumentStore.ts)
(`getDocsByClient` — מטא בלבד; העלאה/תיקיות/תוויות M3),
מוצג ב-[DocumentsWorkspace.tsx](../src/components/clientTabs/DocumentsWorkspace.tsx).

**הדף האישי** — [src/components/PublicPortalPage.tsx](../src/components/PublicPortalPage.tsx).
נבנה מ-`build_client_portal(client_id, mode)` (SQL, SECURITY DEFINER). פריט עם
`kind:'guide'` + `resourceUrl` מצויר ככפתור פתיחה; לחיצה רושמת `opened` דרך
`portal_submit_step(p_token, p_step_id, p_data)`. הזיהוי בכל הדף הציבורי הוא
`clients.portal_token` בלבד.

**העלאה מהדף הציבורי** — Edge Function
[portal-upload-document](../supabase/functions/portal-upload-document/index.ts):
פותר את הטוקן ללקוח, מוודא שהשלב שלו ומפורסם, כותב ל-Storage ול-`documents`,
מסמן דרישה, משלים שלב, רושם ביומן ומתריע. **זו התבנית לפונקציה החדשה** (בכיוון ההפוך).

**מיגרציות**: האחרונה כרגע `143-multiple-poa-documents.sql`. ‼ לפני עריכת פונקציות SQL
חיות — למשוך את ההגדרה **מהמסד החי**, לא מהקובץ המקומי (הקבצים המקומיים עשויים לפגר;
ראה `scripts/dump-live-functions.mjs` ו-memory: prod-behind-staging-drift,
visible-text-three-surfaces). ‼ בלוקי `DO` דרך apply_migration מדווחים הצלחה בלי להחיל
(memory: apply-migration-do-block-quirk) — להריץ ישירות ולאמת.

---

## משימה 1 — סכמת payload חדשה לבקשת מסמכים

מבנה חדש, לצד הישן (תאימות לאחור מלאה — `clientResource` יחיד ממשיך לעבוד בדיוק כמו היום):

```
title:            נגזר אוטומטית (ראה משימה 3)
clientTitle:      = title
clientSub:        'מסמכים מהמשרד' / המלל אם קצר — לשיקול ניסוח
message:          string | undefined      // המלל החופשי, כמו שהוקלד
messageOnly:      true | undefined        // הודעה בלי קבצים
clientResources: [                        // ריק/חסר בהודעת מלל
  { key: 'a1', source: 'office', officeId: <doc.id>, label },
  { key: 'a2', source: 'client', documentId: <uuid>, label, fileName },
]
requirements: [                           // אחת לכל קובץ; ריק בהודעת מלל
  { key: 'a1', kind: 'confirm', label: 'פתיחת <label>', done: false, required: true },
  ...
]
```

הפתיחה של כל קובץ מסמנת את הדרישה שלו (`portal_submit_step` עם ה-key), וכשכולן
מסומנות — השלב מושלם דרך המנגנון הקיים. אין שום דרישת "עברתי".

## משימה 2 — שרת: מיגרציה 144

קובץ `supabase/144-send-documents-multi-source.sql`, שלושה שינויים:

1. **`create_onboarding_request`** — לאפשר `custom_request` עם `requirements` ריק כאשר
   `payload.messageOnly = true` (היום נחסם ב-`no_requirements`).
2. **`build_client_portal`** — בענף `custom_request`:
   - כשיש `clientResources`: לפלוט `kind:'guide'` עם מערך `resources:
     [{key, label, url?, documentId?, fileName?}]` — פריטי `office` מקבלים `url` דרך
     `office_document_url` (כמו היום); פריטי `client` מקבלים `documentId` בלבד
     (ה-URL נבנה בדפדפן מול הפונקציה החדשה — SQL לא יכול לחתום URL).
     `note` = `message`. בהשלמה — הפריט ממשיך לשאת את `resources` כדי להופיע
     תחת «מסמכים שימושיים».
   - כש-`messageOnly`: לפלוט כרטיס בסגנון `info` הקיים — כותרת + המלל, **בלי**
     `actionKind` ובלי cta. ‼ **לא נספר** ב-`v_done`/`v_total` — אין לו "השלמה",
     והוא לא צריך לתקוע את "X מתוך Y" של הלקוח לנצח.
   - הענף הישן (`clientResource` יחיד) — לא נוגעים בו.
3. **`portal_submit_step`** — לוודא שסימון דרישת `confirm` בבקשה כזו משלים את השלב
   כשכל הדרישות סומנו (סביר שכבר עובד — מיגרציה 58; לאמת, לא להניח).

## משימה 3 — צד הרו"ח: הדיאלוג

לבנות מחדש את `mode === 'document'` ב-AddRequestDialog — **מסך אחד**:

- **"מה שולחים"** — רשימת צ'קבוקסים של ספריית המשרד (כמו היום, רק מרובה), ומתחתיה
  שתי פעולות שקטות: **"מהתיקייה של הלקוח"** (נפתחת רשימה מקומפקטת של מסמכי הלקוח —
  `getDocsByClient`, שם + תאריך, חיפוש אם יש הרבה) ו-**"העלאה מהמחשב"**
  (`<input type=file multiple>` מוסתר; כל קובץ עולה מיד דרך מנגנון ההעלאה הקיים של
  useDocumentStore אל שורש תיקיית הלקוח עם תווית ברירת המחדל «לבדיקה» ושנה «כללי» —
  בלי לשאול כלום; גיא מתייק אחר-כך אם ירצה).
- כל מה שנבחר מוצג כשורות פשוטות עם ✕ להסרה.
- **"כמה מילים ללקוח (לא חובה)"** — textarea אחת.
- השדות המשותפים (`<Shared>`) — כמו שהם.
- ולידציה: לפחות קובץ אחד **או** מלל. שום שדה אחר אינו חובה.
- **כותרת אוטומטית**: קובץ אחד ⇒ שם הקובץ/label; כמה ⇒ `N מסמכים מהמשרד`;
  מלל בלבד ⇒ `הודעה ללקוח`.
- לעדכן את ה-hint בקטלוג (שורת `send_document`): כבר לא רק "מספריית המשרד".

`buildDocumentRequestPayload` הישן נשאר לתאימות קריאה בלבד; בנייה חדשה — פונקציה חדשה
(למשל `buildSendDocumentsPayload`) באותו קובץ lib.

## משימה 4 — נקודת כניסה מתיקיית הלקוח

ב-DocumentsWorkspace: פעולת **"שליחה ללקוח"** על מסמך (במקום שבו יושבות שאר פעולות
המסמך הקיימות — לא להמציא UI חדש). לחיצה פותחת את **אותו** AddRequestDialog במצב
document עם הקובץ כבר מסומן. אותה זרימה, אותו RPC — בלי מסלול שני.

## משימה 5 — Edge Function חדשה: `portal-open-document`

בתבנית של portal-upload-document (verify_jwt=false, service role):

- **GET** עם `token`, `stepId`, `docId` (query params — כדי ש-`<a href>` רגיל יעבוד
  בלי חסימת popup).
- ולידציה: הטוקן ⇒ לקוח; השלב של אותו לקוח, מפורסם, לא מבוטל; `docId` מופיע
  ב-`clientResources` של השלב (הטוקן לא פותח שום קובץ אחר!); רשומת `documents`
  שייכת לאותו לקוח.
- יוצרת **signed URL** קצר-מועד (5 דקות) על `client-documents` ומחזירה **302** אליו.
- רושמת את הפתיחה: `portal_submit_step` עם ה-key של הקובץ (best effort — כישלון
  ברישום לא מונע את הפתיחה), וזה מה שמשלים את השלב כשהכול נפתח.
- רשת ביטחון: מגבלת קצב פשוטה כמו בהעלאה.

## משימה 6 — צד הלקוח (PublicPortalPage)

- `kind:'guide'` עם `resources[]`: שורת קובץ לכל פריט — `office` ⇒ קישור ישיר
  ל-`url` (לחיצה רושמת דרך `portal_submit_step` כמו היום); `client` ⇒ קישור אל
  `https://<project>.supabase.co/functions/v1/portal-open-document?token=…&stepId=…&docId=…`
  (הרישום קורה בשרת). קובץ שנפתח מקבל ✓ שקט. הכרטיס נסגר מעצמו כשכולם נפתחו.
- הודעת מלל (`info` בלי actionKind): כרטיס שקט עם הכותרת והטקסט, שום פקד —
  בסגנון כרטיס המידע הקיים (`retainer_info`).
- «מסמכים שימושיים»: היום מסונן לפי `resourceUrl`; להרחיב כך שגם פריט שהושלם עם
  `resources[]` יופיע שם (כל קובץ שורה). קבצים פרטיים ממשיכים להיפתח דרך הפונקציה
  (חתימה חדשה בכל לחיצה — זה בסדר).
- הודעת מלל **לא** נכנסת ל"מסמכים שימושיים" ולא ל"הושלמו" — היא פשוט נעלמת כשגיא
  סוגר אותה.

---

## מה לא לשבור

- בקשות `clientResource` ישנות (מדריך הוצאות מוכרות שכבר נשלח) — נפתחות ונסגרות
  בדיוק כמו היום, כולל «מסמכים שימושיים».
- `client_documents` (מסמכים **מ**הלקוח), בקשה חופשית, הרשאת חיוב, תבניות — לא נוגעים.
- ספריית המשרד במסך המשרד (FirmProfileConsole) — לא נוגעים.
- `portal-upload-document` — לא נוגעים.
- אין מיילים חדשים: הדף האישי הוא היחידה (memory: one-client-page-not-many-emails).
  התראות ההתקדמות לגיא עוברות במנגנון הקיים (queue_accountant_notification) אם וכפי
  שכבר קורה לבקשות — לא להוסיף סוג התראה חדש בסבב הזה.

## סדר ביצוע

1. מיגרציה 144 (על **staging** קודם) + עדכון `supabase/MIGRATIONS.md`.
2. Edge Function `portal-open-document` + פריסה ל-staging.
3. lib: `buildSendDocumentsPayload` + טיפוסים ב-`types/onboarding.ts` אם צריך.
4. AddRequestDialog — המסך החדש.
5. DocumentsWorkspace — "שליחה ללקוח".
6. PublicPortalPage — resources + כרטיס הודעה.
7. QA מלא על staging (למטה).
8. פריסה לפרודקשן: מיגרציה 144 על המסד החי (‼ לוודא שהעמודות/פונקציות שהיא קוראת
   קיימות שם — memory: prod-behind-staging-drift), פריסת הפונקציה, ואז commit + push.

## כללי פרויקט שחובה לכבד

- **בלי dependencies חדשים.**
- **עברית, RTL** — לבדוק ששורות הקבצים והצ'קים לא נשברים בכיוון.
- **QA על חשבון ה-E2E בלבד** (memory: qa-e2e-sandbox-account) — לא על התיקים של גיא.
- `git add` על קבצים ספציפיים בלבד (memory: concurrent-sessions-git-add).
- הערות קוד רק ל"למה", בסגנון הקיים.
- typecheck + `vite build` לפני commit — אבל build ירוק **אינו** QA.

## QA — לפני שמדווחים "סיימתי"

להריץ עם `preview_start name="dev"` (הפורט האמיתי ב-preview_logs). בדיקות מול staging.

**שליחה:**
1. ספרייה בלבד: לסמן שני מסמכי ספרייה, לשלוח. בדף האישי — כרטיס אחד עם שתי שורות
   קבצים. לפתוח את הראשון — ✓ ו"1 מתוך 2"; לפתוח את השני — הבקשה נסגרת ועוברת
   ל"הושלמו", והקבצים מופיעים ב"מסמכים שימושיים".
2. מהתיקייה של הלקוח: לבחור מסמך קיים, לשלוח, לפתוח מהדף האישי — הקובץ **הנכון**
   נפתח (signed URL), הדרישה מסומנת, הבקשה נסגרת.
3. העלאה מהמחשב: להעלות PDF מהדיאלוג — לוודא שהוא מופיע בתיקיית הלקוח (תווית
   «לבדיקה»), נשלח, ונפתח מהדף האישי.
4. מעורב + מלל: קובץ ספרייה + קובץ תיקייה + "כמה מילים" — המלל מוצג על הכרטיס.
5. מלל בלבד: כרטיס שקט בדף האישי, **בלי אף כפתור**, לא נספר ב"X מתוך Y". ביטול
   הבקשה אצל הרו"ח מעלים אותו.

**אבטחה (חובה):**
6. `portal-open-document` עם טוקן של לקוח אחר / docId שלא בבקשה / שלב לא מפורסם —
   403/404, לא קובץ.

**רגרסיה:**
7. בקשת מדריך ישנה (clientResource) — נפתחת ונסגרת כמו קודם.
8. "מסמכים מהלקוח", בקשה חופשית, העלאת קובץ מהדף האישי — עובדים.
9. `read_console_messages` עם onlyErrors — נקי; וגם לוגים של הפונקציה החדשה.

צילומי מסך: הדיאלוג החדש (שלושת המקורות), כרטיס רב-קבצים בדף האישי, כרטיס הודעת מלל,
ו"מסמכים שימושיים" אחרי השלמה.

## סיום — פריסה ודחיפה למסטר

1. מיגרציה 144 על פרודקשן + `MIGRATIONS.md` מעודכן.
2. `portal-open-document` פרוסה לפרודקשן.
3. commit (קבצים ספציפיים, הודעה בעברית בסגנון הקומיטים האחרונים) + **push למסטר** —
   וורסל מפרסם את crm.yasharcpa.co.il. לאמת דרך ה-API של וורסל שהפריסה הצליחה
   (memory: deploy-flow-vercel — לא לדגום את הדומיין בלופ).
4. דיווח לגיא בעברית: מה השתנה, מה נבדק, צילומי מסך.
