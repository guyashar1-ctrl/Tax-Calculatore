# קוד המקור של «מערכת לרישום ייצוג» בשע״ם — צילום מ-23.09.2026

הקבצים כאן הם קוד האפליקציה של שע״ם עצמה (תבניות Angular ובקרים), כפי שנקראו
מתוך הדף הפתוח בשע״ם (GET לקבצים הסטטיים / `$templateCache`) בזמן סשן העבודה
על שידור ייפוי הכוח, 23.09.2026. **קריאה בלבד** — שום פעולה לא בוצעה בשע״ם כדי
לקבל אותם. הקבצים הסטטיים מוגנים בכרטיס חכם, ולכן אי אפשר להוריד אותם מחדש בלי
סשן מאומת.

למה הם בריפו: זה מקור האמת למסך «טעינת מסמכים» (שלב 4), ובעיקר ל-5 השורות
הקבועות של המסמכים. `SHAAM_DOC_SLOTS` ב-`worker/src/shaamRepresentationSession.mjs`
נבדק מולם (`worker/test/shaam-documents-step.test.mjs`) — אם שע״ם תשנה את הרשימה,
צריך לצלם מחדש ולעדכן את שני המקומות יחד.

| קובץ | מה יש בו |
|---|---|
| `uploadKasafot.controller.js` | `fileList` — 5 שורות קבועות, `isShow` לפי `mismachimNidrashim[0..3]`; `hemshech()` חוסם עד שכל שורה גלויה נטענה, ושולח את כל הקבצים בקריאה אחת (`uploadToKasafot/GetFile`, `idMismach` לכל קובץ) |
| `uploadKasafot.template.html` | `div.BoxA` לכל שורה (`label.required` + `<u>UploadName</u>` + `input.icon.plus`), חמישה דיאלוגים עם `name` קבוע, כל אחד `shaam-file-upload` עם `allowed-file-extentions="['pdf']"` |
| `shaam-window-open-close.*` | הדיאלוג מקבל `id="{{vm.name}}"` — כלומר `#dialogTeinatTzilumTz` וכו' |
| `shaam-file-upload.*` | בדיקת סיומת (לא-PDF ⇒ «סוג הקובץ אינו נתמך»), גודל, `.divbutton2 a` לקובץ שנטען |
| `pirteyHitkashrut.controller.js` | במסלול «טעינת מסמכים» מבקשה קיימת: `shlifatPirteyHitkashrut` (קריאה) ⇒ `oMismachimNidrashim` מהשרת |
| `hazanatBakasha.controller.js` | `w()` — מתי כל שורה מופיעה (תיק מ"ה ממתין לפתיחה / נפטר / אפוטרופוס / תושב חוץ) |
| `returnUpload.*`, `JSconstsAndEnum.js` | מסך האישור (שלב 5) וקבועים |

‼ שורה 2 («תצלום תעודת זהות או רישיון נהיגה») ושורה 5 («צילום דרכון») **טרם
נצפו גלויות** בהרצה חיה. ההתנהגות שלהן נגזרת מהקוד הזה, ולכן ההעלאה של מסמך
נוסף חסומה במקרה החי הראשון (`EXTRA_DOCUMENT_UPLOAD_LIVE_VERIFIED`).
