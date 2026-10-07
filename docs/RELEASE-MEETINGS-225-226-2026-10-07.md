# שחרור 225 + 226 — פגישות ב-Google Meet, אנשים בפנייה ואנשי קשר (07.10.2026)

## מה שוחרר
- **225** `meetings`, `google_calendar_connections`, `google_calendar_status()` — זימון מהיומן של
  המשרד; הדפדפן לא כותב פגישות ולא קורא את מפתח Google.
- **226** `leads.companions` + `split_from_lead_id`, `split_lead_companion`, `contacts`,
  טריגר `carry_lead_companions` על `clients`, אינדקס על `meetings.guests`.
- **פונקציות:** `calendar-meeting` ו-`google-calendar-connect` (גרסה 1, מהקבצים, דרך
  `deploy-edge-functions.yml` ריצה 78). `fake-google-calendar` לא נפרסה.
- **אתר:** master `9151de7`, Vercel `dpl_HUWFspFNzVGaUawGU3T9FQkFFA4U` READY, `crm.yasharcpa.co.il`.
  הגרסה הקודמת לחזרה מיידית: `dpl_Fk23QSwDto6VjFbJAFcqLAnE2VX5` (`c634a73`).
- התיעוד: `docs/MEETINGS-GOOGLE-CALENDAR.md`.

## מספור
223/224 שוחררו באותו בוקר ל-NI (`RELEASE-NI-SUBJECT-223-224-2026-10-07.md`) ⇒ הענף מוזג עם master
והמיגרציות מוספרו מחדש ל-225/226 (כל ההפניות בקוד ובתיעוד).

## איך הוחל
- גיבוי: סכימה `backup_r225_20261007` (טבלת `leads`, 5 שורות) — הטבלה הקיימת היחידה שמשתנה.
  אפשר למחוק כשגיא מרוצה.
- 225 (20261007140540) ו-226 (20261007140613) דרך `apply_migration`. ‼ בלי שורות
  `drop … if exists` שבקבצים: הכלי נתקע על אישור לכל drop (ניסיון ראשון של 225 נכשל בפסק זמן,
  ונבדק שלא הוחל דבר), והאובייקטים לא היו קיימים בייצור — אותה תוצאה.
- אימות: 3 הטבלאות קיימות ובבעלות `postgres`; מדיניות 2 על `meetings`, 5 על `contacts`, 0 על
  `google_calendar_connections` (RLS פעיל, אין הרשאה לדפדפן); לדפדפן אין INSERT ל-`meetings`;
  `google_calendar_status()` בלי משתמש ⇒ `{"connected": false}`; 5/5 לידים זהים לגיבוי.

## לפני כן — סביבת הבדיקות מול Google האמיתי
חיבור «PIVO Staging» (כתובת החזרה של staging בלבד): חיבור, «פנוי?», פגישת בדיקה אחת עם גיא
כמשתתף יחיד — נוצרה עם Meet ונמחקה. תיקון: בחירת חשבון במקום רמז מכתובת ה-PIVO (`c9f5778`).

## מה נשאר
1. **מפתחות Google לייצור** (גיא): חיבור «PIVO» נפרד בפרויקט PIVO עם כתובת החזרה של הייצור בלבד
   (`https://uoweoqtuiettozagwgdw.supabase.co/functions/v1/google-calendar-connect`), והסודות
   `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` בפרויקט `uoweoqtuiettozagwgdw`.
   עד אז «חיבור יומן Google» באתר עונה «החיבור ל-Google עוד לא הוגדר בשרת».
2. חיבור היומן באתר, וזימון ניסיון לכתובת נוספת של גיא — כולל שינוי מועד וביטול.
3. המסכים המחוברים באתר החי לא נבדקו בדפדפן (צריך כניסה של גיא); אותו קוד נבדק בהדגמה ובמסד.
