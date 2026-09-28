# קוד המסך «בקשות בתהליך» של שע״ם — צילום מ-28.09.2026

קוד האפליקציה של «מערכת לרישום ייצוג» (`/srmyzgipuykoach`), כפי שנקרא מהדף
הפתוח בזמן בדיקה **לקריאה בלבד**, בלשונית נפרדת בחלון האוטומציה. לא בוצעה שום
פעולה בשע״ם כדי לקבל אותם. אין כאן נתוני לקוחות — רק קוד ותבניות.

| קובץ | מה יש בו |
|---|---|
| `process-controller.js` | `chackSinunim` — איך נבנה «סינון לפי : מספר ישות + מספר בקשה» (כל שדה מלא מוסיף סינון); `shlifatIpkHamtana` — מה נשלח לשרת (`misMuzag`, `asmahta`, תאריכים, מצבים); `nikuy` («ניקוי») מאפס את הטופס; דפדוף של **80** בקשות לשליפה (`lIsnH[...*80+81]`, «בקשות נוספות») |
| `process.html` | «סינון לפי : {{vm.sinunBy}}» ב-`p.fontbold` עם `ng-show`; `txt-no-resultes="vm.txtNoResultes"` — הטקסט «לא נמצאו רשומות מתאימות» מגיע **מהשרת** (`oIhRespText`) |
| `izugimPeilimIpkBeHamtana-controller.js`, `izugim-peilim.js` | המסך «תיקים למיוצג» (לחיצה על שם הלקוח): ייצוגים פעילים + בקשות בתהליך לישות אחת (`ShlifatIpkBeHamtana/shlifaIzugimPeilimAndIpk`) |

מה שנצפה חי ולא כתוב כאן בקוד (ההתנהגות של השרת):
- חיפוש לפי «מספר בקשה» מוצא רק בקשות מ~30 הימים האחרונים; לפי ישות — הכול.
- הטבלה (Kendo) מחזיקה את כל השורות שהשרת החזיר, עם קודים (ראה
  `../shaam-requests-grid-2026-09-28.json`).

אם שע״ם תשנה את המסך — לצלם מחדש ולעדכן יחד עם
`worker/src/shaamRepresentationSession.mjs` (`findRequestRows`, `readListState`).

## שלבים 1–3 של «בקשה חדשה» (אימות ישות → בקשה → פרטי התקשרות)

נקראו באותו אופן (קריאה בלבד, GET לקבצים הסטטיים), כדי לאמת את מה שהעובד עושה
כשלוחצים «הזן ייפוי כוח בשע״ם» — מסלול שעד 28.09 נבנה מהקלטות מסך ולא רץ חי.

| קובץ | מה יש בו |
|---|---|
| `imut.template.html`, `imut.controller.js` | שלב 1: «מספר הישות» + «המשך» ⇒ `checkYeshut`; רק אז מופיע `#imutToshavIsrael` (תאריך לידה + רדיו «ת.ז הורה» / «מספר רישיון נהיגה» / «מספר דרכון ישראלי») ו«המשך» שני ⇒ `checkImut`. קוד 0 בבדיקה הראשונה (יש ייצוג פעיל) ⇒ דילוג ישר לשלב 2 |
| `hazanatBakasha.template.html`, `hazanatBakasha.controller.js` | שלב 2: שורות div (תיבת סימון, תיק, בורר Kendo). «אישור» ⇒ `checkTikeyMas` ⇒ חלונית «לידיעתך,» ⇒ «אישור» בחלונית ⇒ `createNewIpkRec` (**כאן נוצרת הבקשה**) |
| `pirteyHitkashrut.template.html`, `pirteyHitkashrut.controller.js` | שלב 3: טלפון מיוצג (קידומת + 7 ספרות) — חובה אם אין מאומת; טלפון בן/ת זוג — חובה רק ב-`chovatChatimatBz`; תיבת ההסכמה; «שמירה» ⇒ `updatePirteyHitkashrut` ⇒ `window.open(טופס)` |
| `shaam-pdf-viewer.js` | `getUrlPDF` — כתובת הטופס (`/ShaamPdfStreamerApi/api/getpdftoview?...`) |
| `JSGeneralFuncs.js`, `JSconstsAndEnum.js` | `checkDateIsValid` (DD/MM/YYYY), הודעות («אין התאמה בנתונים», «לא ניתן להמשיך בתהליך האימות…») |
| `shaam-ui/*.html` | תבניות רכיבי המסך: שדה ת.ז. (`updateOn: 'blur'`), בורר תאריך Kendo, רדיו בתוך `<label>`, תיבת סימון, `button[btntype]`, בורר Kendo, חלונית bootstrap |
| `menu.json` | «בקשה חדשה» = `#/imut` |

‼ **האימות שנעשה:** הקוד האמיתי של האפליקציה (Angular, Kendo, ui-router ורכיבי
shaam-ui) הורץ במחשב, בדפדפן, מול **שרת מדומה**, והעובד הריץ עליו את הזרימה
כולה — 20 תרחישים (רווק/נשוי, חובת טלפון בן/ת זוג, שלושה אמצעי זיהוי, דחיית
אימות, טיפול מטה, שגיאת תיק, קידומת לא ברשימה, פרטים מאומתים, בקשה קיימת). קוד
צד-שלישי (Kendo) אינו נשמר כאן; `shaam-create-steps.test.mjs` נועץ את העובד
בתבניות ובבקרים שכאן.
