# הוספת ייצוג ב"ל לבן/בת הזוג כשללקוח כבר יש ייצוג — הכרעה הנדסית

> נכתב 3.9.2026 מול HEAD `b496240`. מסמך הכרעה בלבד: אין קוד, אין מיגרציה, אין קומיט.
> משלים את `docs/PLAN-BTL-PER-PERSON.md` (כרטיס ב"ל דו-אישי, לא מחויב עדיין)
> ואת `docs/PLAN-BTL-REPRESENTATION-PER-PERSON.md` (מצב הייצוג פר-אדם).
>
> לא נפתח מחדש: כרטיס ב"ל אחד, בלוק לכל אדם. לא מאוחד: מצב הייצוג של הלקוח ושל בן/בת הזוג.

---

## 1 · מחזור החיים המדויק של ייצוג ב"ל היום

ב"ל נבדל מכל שאר הרשויות: **הוא אינו חלק מצינור ה-2279/שע״ם.** זו העובדה שמכריעה את כל המסמך.

| שלב | מי כותב | לאן |
|---|---|---|
| בקשה נפתחת | `RepresentationOnboardingDialog` / `QuotationRepresentationEditor` / `open_quotation_representation` | `clients.authority_representations.nationalInsurance = {status:'in_process', targets:[...]}`, ו-`representation_requests.scope` (תמונה היסטורית, נכתבת פעם אחת) |
| הזנה בפורטל ב"ל | `RepresentationExecutionCenter` → `NiTrack` | `execution.nationalInsurance.enteredAt` / `.nationalInsuranceSpouse.enteredAt` |
| אסמכתא + מועד | אותו מסלול | `.referenceNumber`, `.deadline` |
| הוראות למבוטח | `handleSendAll` בלבד — רוכבות על מייל החתימה | `.instructionsSentAt`, `.instructionsSentWith:'signature'` |
| המבוטח אישר | לחיצה ידנית «סמן כאושר» | `.confirmedAt` |
| הייצוג פעיל | `App.handleSaveExecution` (`App.tsx:1491`) | `authority_representations.nationalInsurance.status='active'` — **רק כאשר כל מסלול שהתבקש מאושר** |

מה ש-ב"ל **אינו** מפעיל, ואומת בקוד:
- `shaamSubmissions` (`utils/repScope.ts:259`) סופר רק `incomeTax|vat|withholding` — ב"ל אינו יוצר הגשת שע״ם ואינו יוצר טופס 2279.
- `identityRequirements` (`utils/identityEvidence.ts:63`) מדלג על ב"ל במפורש — אין דרישת צילום תעודה.
- `saveRepresentationRequest` (`App.tsx:1131`) שומר `authorities = shaamAuthorities` — ב"ל **מוסר** מהמערך.
- `signers` נגזרים מהנישום + בן/בת הזוג לצורך חתימה על 2279, לא מב"ל.

ולכן: **ייצוג ב"ל מיוצג בשלמותו בשני מקומות — `targets` על הכרטיס, ו-`execution.nationalInsurance*` על הבקשה.** הוא אינו נוגע במסמכים, בחותמים, בטוקנים ובזהות.

עוד עובדה מכרעת: מרכז הביצוע גוזר את המסלולים מ**הכרטיס החי**, לא מ-`scope`:
```
const niTargets = linkedClient ? targetsOf(linkedClient.authorityRepresentations, 'nationalInsurance') : null;
const niTargetsSpouse = niTargets ? niTargets.includes('spouse') : !!niCoversSpouse;   // ExecutionCenter:210
```
ומרכז הביצוע מוצג גם אחרי `status='active'` (אין שום שער `status === 'active'` ב-`RepresentationRequestReview`). יתרה מזו, `RepresentationNextStep` כבר יודע לנסח בדיוק את המצב שאנחנו רוצים:
> «הייצוג פעיל · מס הכנסה הושלם. בביטוח לאומי ממתינים לאישור: בן/בת הזוג.»

כלומר המכונה הקיימת כבר יודעת לתאר "בקשה פעילה + מסלול ב"ל של אדם אחד עדיין פתוח". אין צורך להמציא אותה.

---

## 2 · למה ה-API הקיימים אינם יכולים להוסיף את בן/בת הזוג

| API | מה הוא עושה | למה הוא פסול כאן |
|---|---|---|
| `handleAttachRepresentation` (`App.tsx:1260`) | דורס `authorityRepresentations` שלם, מאפס `representationStatus='pending_fill'`, מייצר `reqId` חדש ומחליף את `representationRequestId` | מוחק סטטוסים ואסמכתאות קיימים, מגלגל את הלקוח אחורה ל"בקליטה" (`derive_lifecycle_stage`), ומייתם את הבקשה הישנה |
| `handleCreateRepresentation` | יוצר **לקוח חדש** + בקשה | לא רלוונטי ללקוח קיים |
| `open_quotation_representation` (מיגרציה 26/110) | מאחד רשויות לבקשה קיימת, אבל **לפי מפתח רשות בלבד**: `where not (authority_representations ? k)` | מפתח `nationalInsurance` כבר קיים ⇒ הרשומה נשארת כמות שהיא, ו-`targets` החדשים נזרקים בשקט |
| `AddRequestDialog` / קטלוג הבקשות | מוציא ייצוג במפורש (`AddRequestDialog.tsx:32`) | אין פריט קטלוג לייצוג |
| `updateClient` גנרי | כותב כרטיס | קיים ותקין — זו בדיוק הדלת שנשתמש בה (§5) |

---

## 3 · ניתוח A / B / C

### A · הרחבת הבקשה הקיימת במסלול ב"ל נוסף
מוסיפים `'spouse'` ל-`targets` ומתחילים לכתוב `execution.nationalInsuranceSpouse`.

- **מודל נתונים:** אפס שינוי סכימה. שני שדות jsonb קיימים.
- **מחזור חיים:** ללא נגיעה. `sync_representation_step` מופעל רק על `update of status` בבקשה — לא נוגעים בסטטוס. `derive_lifecycle_stage` קורא `representation_status` — לא נוגעים בו.
- **תאימות לאחור:** מלאה. `targets` חסר עדיין `['client']`, `coversSpouse` עדיין מתורגם ב-`targetsOf`.
- **מרכז הביצוע:** עמודת `NiTrack` שנייה נדלקת מיד, כי היא נגזרת מהכרטיס החי.
- **סמנטיקת השלמה:** `handleSaveExecution` כבר דורש אישור לכל מסלול שהתבקש — הוספת מסלול פשוט מוסיפה תנאי.
- **סיכון שחיתות:** נמוך. השדה היחיד שמשתנה הוא `targets`; `scope` (התמונה ההיסטורית) נשאר כמות שהוא, בדיוק כפי שהוא מתועד.
- **מיגרציה:** אין.
- **זהות:** נשמרת — `role` הוא `'client'|'spouse'`, אותו אוצר מילים של כל הפרויקט.
- **חור יחיד:** `instructionsSentAt` נכתב רק ב-`handleSendAll`, שרץ על חותמים ממתינים. לבן/בת זוג שנוסף/ה לבקשה שכבר נחתמה אין למי לשלוח ⇒ שלב 3 יישאר פתוח (3/4). ‼ אינו חוסם: `handleSaveExecution` בודק `confirmedAt` בלבד.

### B · בקשת ייצוג נפרדת לבן/בת הזוג
בקשה שנייה תחת אותו לקוח.

**נופל.** אין אילוץ ייחודיות ב-DB (רק `reps_client_id_idx`), ולכן הנזק היה שקט:
1. **שלב הייצוג משותף.** `ensure_representation_step` (109) מחפש `client_id + step_type='representation'` ומחזיר את הקיים; `sync_representation_step` (31) מעדכן `where client_id = new.linked_client_id and step_type='representation'` — **בלי זהות בקשה**. הבקשה השנייה תדרוס את מצב השלב של הראשונה.
2. **הדף האישי נחטף.** `build_client_portal` (75/107/108) ו-`set_paperless_path`/מדריך/ספריית מסמכים (101/103/106/112) כולם עושים `where linked_client_id = c.id order by created_at desc limit 1` — **הבקשה החדשה ביותר מנצחת**. בקשה חדשה ב-`pending_fill` הייתה מציגה ללקוח «מילוי פרטים וייפוי כוח» מחדש, עם טוקן חדש, ו-`submit_onboarding_full` היה כותב מחדש את פרטי הכרטיס.
3. **קישור יחיד.** `clients.representation_request_id` הוא שדה בודד; `handleOpenClientRepresentation`, `ClientList`, `PersonDirectory` כולם מנווטים אליו.
4. **סטטוס יחיד.** `clients.representation_status` בודד; בקשה שנייה ב-`pending_fill` הייתה מחזירה את הלקוח ל-`onboarding` ב-`derive_lifecycle_stage`.
5. **מיזוג ההצעה** מחפש `c.representation_request_id is not null` ומאחד לתוכו — התנהגות בלתי צפויה עם שתיים.

הפיכת B לבטוחה מחייבת זהות-בקשה בשלבים, בפורטל ובמחזור החיים — מהלך גדול בהרבה מהבעיה.

### C · פעולה מפורשת «הוסף בן/בת זוג לייצוג קיים»
- בפועל, אחרי §1, **הפעולה הבטוחה אינה נוגעת בבקשה כלל.** מרכז הביצוע קורא `targets` מהכרטיס, ולכן כל מה שנדרש הוא תיקון ממוקד על הכרטיס. C ⇒ A, עם עטיפה של פעולה מוצרית אחת עם שם, אישור, ורישום.
- זה גם מה שמוסיף את מה ש-A החשוף חסר: **עקבות**. יצירת שורת `taxFiles` לבן/בת הזוג עוברת דרך `record_manual_fact_change` (המפתח `taxFiles` נמצא ב-`GOVERNED_FACT_KEYS`) ולכן מייצרת שורת פעילות אמיתית — «תיקי רשויות», עם לפני/אחרי.

---

## 4 · המודל המומלץ

**C, כתיקון ממוקד על הכרטיס — לא על הבקשה.** זהו המודל הקטן ביותר שמשמר בעלות ומחזור חיים נכונים.

הפעולה כותבת **שני דברים בלבד**, שניהם בצורות קיימות:

1. `authority_representations.nationalInsurance.targets` — הוספת `'spouse'` (ואם אין רשומה: `{status:'in_process', targets:['spouse']}`). זה מה שמדליק את מסלול הביצוע.
2. `tax_files[]` — שורה `{authority:'national_insurance', owner:'spouse', repStatus:'pending'}` דרך מסלול העובדות המנוהלות. זה מה שנותן ראיה פר-אדם (המקור הראשון שהרזולבר קורא), ומייצר את שורת הביקורת.

**אף אחד מאלה לא נוגע:** שורת הבקשה, `scope`, `status` של הבקשה, `representation_status`, `representation_request_id`, שלבי הקליטה, הדף האישי, החותמים, המסמכים, הטוקנים, מחזור החיים.

---

## 5 · שינויי סכימה / API נדרשים

**סכימה: אפס. מיגרציה: אפס.**

API אחד חדש בצד הלקוח (אין RPC חדש, אין edge function):

```ts
// src/App.tsx — ליד handleAttachRepresentation, ובמפורש נפרד ממנו.
async function handleAddNiTarget(clientId: string, role: 'client' | 'spouse'): Promise<void>
```
מה הוא עושה, לפי הסדר:
1. קורא את הכרטיס. אם `targetsOf(...,'nationalInsurance')` כבר מכיל את התפקיד — יוצא בלי לכתוב (אידמפוטנטי).
2. `updateClient` עם `authorityRepresentations` שבו רק `nationalInsurance` הוחלף: `targets` מנורמל דרך `targetsOf` (כדי שרשומת `coversSpouse` ישנה תיכתב כ-`targets` מפורש) + התפקיד החדש. `status` **נשאר כמות שהוא**; רשומה חסרה נולדת `in_process`.
3. אם אין שורת `taxFiles` ל-`(national_insurance, owner=role)` — מוסיף אחת עם `repStatus:'pending'` דרך `recordManualEdit('taxFiles', 'מספר תיק — ביטוח לאומי (בן/בת הזוג)', …)`, בלי `fileNumber` (‼ לעולם לא נגזר מת.ז.).

זמינות הפעולה (נגזרת, לא נשמרת):
- `familyStatus === 'married'` **וגם** `role='spouse'` עדיין לא ב-`targets`
- **וגם** בן/בת הזוג אינו מיוצג/ת דרך כרטיס מקושר (`resolvePersonAuthority(...).source !== 'spouse'`) ואינו `spouseRepresentedElsewhere`

---

## 6 · התנהגות שורת «ייצוג» בבלוק בן/בת הזוג

הרזולבר (`utils/niPersons.ts`) מכריע לפי הסדר: `taxFiles[owner]` → מסלול הביצוע של אותו תפקיד → `authorityRepresentations` → כרטיס מקושר → «—».

| מצב | ערך השורה | הפעולה בשורה |
|---|---|---|
| מאושר (`taxFiles=active` או `execution.*.confirmedAt`) | «ייצוג פעיל» (tone ok) | — |
| מסלול פתוח (`enteredAt`/`referenceNumber` בלי `confirmedAt`) | «בתהליך» + פירוט («אסמכתא 73882698 · עד 12.10») | «המשך במרכז הייצוג →» (`onOpenRepresentation`) |
| ב-`targets` אבל בלי מסלול עדיין | «בתהליך» | «המשך במרכז הייצוג →» |
| **אין ייצוג, ולללקוח יש כבר בקשה** ← המקרה שנפתר כאן | «אין ייצוג» | **«הוסף לייצוג ב״ל»** → `handleAddNiTarget(clientId,'spouse')`, ואז ניווט למרכז הייצוג |
| אין ייצוג, ואין לללקוח שום בקשה | «אין ייצוג» | «בקש ייצוג» → זרימת `onStartRepresentation` הקיימת, עם ב"ל מסומן לשניהם |
| מיוצג/ת דרך הכרטיס המקושר | «כבר מיוצג/ת · הושג בקליטה של X» | — |
| מיוצג/ת אצל רו״ח אחר | «מיוצג/ת אצל רו״ח אחר» | — |
| נשוי/אה, אין ת.ז. ואין ראיה | «—» | — (הפעולה זמינה; ההזנה בפורטל ב"ל תדרוש ת.ז.) |

‼ הפעולה יושבת **בתוך התא של אותו אדם** — לא בכותרת הכרטיס. אין פקד ברמת-כרטיס שמעורפל לגבי מי.

**דיאלוג אישור לפני הכתיבה** (טקסט מוצע): «להוסיף את {שם} לייצוג בביטוח לאומי? ייפתח מסלול נפרד: הזנה בפורטל ב״ל, אסמכתא, ואישור של המבוטח/ת עצמו/ה.» — הכתיבה משנה מרשם ייצוג, ולכן היא מאושרת ולא נגררת מלחיצה אחת.

---

## 7 · תאימות לאחור

- `targets` חסר ⇒ `['client']` — נשמר; הכתיבה עוברת דרך `targetsOf` ולכן רשומת `coversSpouse` ישנה מנורמלת בכתיבה הראשונה, בלי לשנות משמעות.
- `scope` על הבקשה לא זז — הוא ממשיך לענות «מה ביקשנו בפתיחה».
- בקשות בלי `execution.nationalInsuranceSpouse` (כלומר כל הבקשות בייצור היום) ממשיכות להיקרא בדיוק כמו קודם.
- הכרטיס בייצור שכבר מחזיק `owner:client repStatus:active` + `owner:spouse repStatus:none` נקרא נכון בלי שום שינוי נתונים.

---

## 8 · מיגרציה / backfill

**לא נדרש.** נבדק בייצור: 6 רשומות ב"ל `active` — **כולן** בלי `targets` (⇒ `['client']` חד-משמעי); 7 `in_process`. אף בקשה אינה מחזיקה `execution.nationalInsuranceSpouse`. אין ולו רשומה אחת של `active` עם שני יעדים, כלומר אין נתון קיים שהתצוגה החדשה תסמן אחרת.

נפרד ולא חלק מהמהלך: 4 בקשות עם `nationalInsurance.confirmedAt` שאין להן שורת `taxFiles` תואמת. §10 שלב 7 מיישר את זה קדימה בלבד (בלי backfill).

---

## 9 · האם `handleMarkActive` חייב להשתנות — כן

`App.handleMarkActive` (`App.tsx:1530`) מסמן **כל** מפתח רשות כ-`active` כשהרו"ח מסמן «הרשויות אישרו». זו אמירה על קליטת 2279 בשע״ם — ולב"ל אין שום קשר אליה.

התוצאה היום: לקוח עם `targets:['client','spouse']` שסומן «פעיל» מקבל `nationalInsurance.status='active'` **בלי שאף מבוטח אישר אסמכתא**. זה לא רק עניין תצוגה:
- `resolvePersonAuthority` / `spousePersonAuthorities` יקראו את בן/בת הזוג כמיוצג/ת;
- `spouseTargetBlocked` בדיאלוג הייצוג **יחסום** בחירת בן/בת הזוג — כלומר נתון שקרי חוסם את הפעולה המתקנת.

הקוד עצמו כבר מכריע נגד זה, ב-`handleSaveExecution`: «ייצוג ב"ל נפרד מהליך שע"ם ולכן גם מסתיים בנפרד ממנו». `handleMarkActive` סותר את ההכרעה הזו.

**התיקון:** `handleMarkActive` ידלג על `nationalInsurance` — ב"ל הופך ל-`active` אך ורק דרך `handleSaveExecution`, לפי אישורים פר-אדם. השפעה על נתונים קיימים: אפס (הפונקציה משנה רק ריצות עתידיות). השפעה נראית: לקוח שב"ל התבקש עבורו ומעולם לא נרשם לו אישור יוצג «בתהליך» במקום «מיוצג» — וזו האמת.

בנוסף, כשמירת בטיחות בתצוגה: הרזולבר לא יסמוך על `status:'active'` ברמת-רשומה עבור תפקיד מסוים אלא אם `targetsOf` הוא **בדיוק** התפקיד הזה. שתי הגנות, שתיהן נדרשות.

---

## 10 · תוכנית מימוש ל-Sonnet

גדרות: אין סכימה חדשה, אין בקשה שנייה, אין נגיעה ב-`handleAttachRepresentation`, אין קטלוג חדש; עברית בלבד; הוקים ב-`TaxFileTab` לפני כל `return` מותנה.

1. **לחייב את 154 קודם.** קומיט אחד של תשעת הקבצים הפתוחים (ראה `PLAN-BTL-REPRESENTATION-PER-PERSON.md` §A), דחיפה, אימות פריסה דרך ה-API. להחיל את `154-btl-per-person.sql` גם על staging.
2. **`utils/niPersons.ts`** — הרזולבר לפי הסדר של §6, כולל הכלל «`active` ברמת-רשומה נסמך רק כש-`targetsOf` הוא בדיוק התפקיד». להוסיף `kind`/`detail` ל-`NiRepresentationLine`, ופונקציה טהורה `niRepresentationAction(person, client, ctx)` שמחזירה `'add'|'continue'|'start'|null`.
3. **`App.tsx`** — `handleAddNiTarget(clientId, role)` בדיוק כמו §5 (אידמפוטנטי, נורמליזציה דרך `targetsOf`, שורת `taxFiles` דרך `recordManualEdit`). להעביר אותו + `onOpenRepresentation` + `onStartRepresentation` דרך `ClientWorkspace` ל-`TaxFileTab`, יחד עם `niExecution` (שני ה-`NiTracking` של הבקשה המקושרת).
4. **`App.handleMarkActive`** — לדלג על `nationalInsurance` (§9), עם הערה שמצטטת את ההכרעה הקיימת ב-`handleSaveExecution`.
5. **`utils/authorityRows.ts`** — שורת «ייצוג» של כל אדם נושאת `v`/`tone`/`detail` מהרזולבר ושדה `niAction` אופציונלי (ב"ל בלבד).
6. **`TaxFileTab.tsx`** — בענף שני-האנשים: `.ui-linkbtn` בתוך תא «ייצוג» לפי `niAction`; `'add'` פותח דיאלוג אישור קצר (`ui/Modal` הקיים) ואז קורא ל-handler ומנווט למרכז הייצוג. הענף של אדם יחיד לא משתנה.
7. **`App.handleSaveExecution`** — כשנכתב `confirmedAt` לתפקיד, לעדכן גם `taxFiles[NI, owner=role].repStatus='active'` אם השורה קיימת (לא ליצור). קדימה בלבד, בלי backfill.
8. **`utils/authorityFlags.ts`** — דגל `niSpouseNotRepresented`: נשוי + הלקוח `active` + בן/בת הזוג `none` + לא `elsewhere`; `severity:'medium'`, `actions:['task']`, ללא בקשת לקוח. נעלם מעצמו כשהתפקיד עובר ל-`pending/active/elsewhere`.
9. **בדיקות** — `__TestTaxFileV6.tsx`: `couple-rep-split` (המקרה מהייצור), `couple-rep-add` (בקשה קיימת, ב"ל ללקוח בלבד ⇒ «הוסף לייצוג ב״ל»), `couple-rep-pending-spouse`, `couple-rep-norequest`, `couple-rep-elsewhere`. `handleAddNiTarget` — בדיקת אידמפוטנטיות ונרמול `coversSpouse` דרך המסך.
10. **QA בדפדפן** — לכל תרחיש: הערך, הפעולה, שהאישור כותב `targets` ושורת `taxFiles` בלבד (להצליב מול המסד), שמרכז הביצוע מציג `NiTrack` שני מיד, ש-`RepresentationNextStep` אומר «ממתינים לאישור: בן/בת הזוג», שהדגל מופיע רק ב-`couple-rep-split`, מובייל 375, ושלקוח לא-נשוי ו-`single-ni` לא השתנו. אפס שגיאות קונסולה.

**סיכוני רגרסיה לבדוק במפורש:** דילוג `handleMarkActive` על ב"ל (הצגה של «בתהליך» היכן שהיה «מיוצג»); נרמול `coversSpouse` ל-`targets` בכתיבה הראשונה; `spouseTargetBlocked` בדיאלוג — שלא ייחסם אחרי ההוספה; ושהפעולה אינה מופיעה כשבן/בת הזוג מיוצג/ת דרך כרטיס מקושר.

---

## 11 · הכרעות מוצר שנשארו (ולא נפתרות בקוד)

1. **הוראות ב"ל לבן/בת זוג שנוסף/ה לבקשה חתומה.** אין שליחה עצמאית — `instructionsSentWith:'standalone'` מוגדר בטיפוס ואף אחד לא כותב אותו. כרגע: הרו"ח מוסר את האסמכתא ידנית ומסמן «אושר». האם לבנות שליחה עצמאית, או להשאיר ידני?
2. **`taxFiles` של 4 הבקשות המאושרות** ללא שורה תואמת — תיקון נתונים, לא קוד.
3. **`spouseRepresentedElsewhere`** — האם להציג «מיוצג/ת אצל רו״ח אחר» בבלוק ב"ל, או «—».
