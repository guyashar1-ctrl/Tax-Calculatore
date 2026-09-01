# עובד אוטומציה מקומי — PIVO

תהליך Node שרץ על מחשב המשרד (לא בדפדפן, לא ב-Vercel, לא ב-Supabase Edge) ומבצע
משימות אוטומציה שנוצרו ב-PIVO. לארכיטקטורה המלאה:
`docs/PIVO-AUTOMATION-FOUNDATION.html`.

**דרישות:** Node 18+ ו-Google Chrome. `npm install` פעם אחת (playwright-core).

## מה הרו"ח רואה

בכותרת PIVO יש שתי נוריות: **שע״ם** ו**ביטוח לאומי**.

| מצב | מראה | מה לעשות |
|---|---|---|
| מחשב האוטומציה כבוי | אפור מעומעם, לא לחיץ | להפעיל את העובד (ראה למטה) |
| לא מחובר | אפור, לחיץ | ללחוץ — חלון שע״ם ייפתח |
| ממתין לאימות | כתום | להשלים אישור דיגיטלי + PIN **בחלון שנפתח** |
| מחובר | ירוק | כלום. לחיצה מתנתקת |

‼ הרו"ח **אינו** אמור לפתוח קובץ `.bat` או טרמינל בשגרה. לחיצה על "שע״ם"
היא שגורמת לעובד לפתוח את החלון. `launch-shaam-chrome.bat` נשאר ככלי שחזור
בלבד.

‼ האוטומציה לעולם אינה נוגעת בבחירת אישור, ב-PIN או ב-OTP. היא פותחת חלון
גלוי ועוצרת.

## הקמה חד-פעמית

1. להשיג את סוד העובד (רק פעם אחת, לא נחשף בשום מקום אחר):
   ```bash
   node scripts/print-worker-secret.mjs prod
   ```
2. להשיג את ה-`user_id` (uuid) שלך — מ-Supabase Studio → Authentication → Users,
   או משורת `clients` קיימת בטבלה.
3. להעתיק את הקובץ ולמלא:
   ```bash
   cp worker/.env.example worker/.env
   ```
   ולערוך את `worker/.env`: `PIVO_WORKER_SECRET`, `PIVO_USER_ID`.
   `worker/.env` לא נכנס ל-Git (מכוסה ב-`.gitignore` הראשי של הריפו).

4. להתקין את ההפעלה האוטומטית (פעם אחת):
   ```
   worker\install-autostart.bat
   ```
   יוצר קיצור דרך בתיקיית ה-Startup של המשתמש, כך שהעובד עולה בכל כניסה
   למחשב, בלי חלון שחור ובלי צעד ידני. הוא גם מפעיל אותו מיד.

   **למה Startup ולא שירות Windows:** אין צורך בהרשאות מנהל, והעובד *חייב*
   לרוץ בתוך הסשן של המשתמש — הוא פותח חלון Chrome גלוי שהרו"ח מתחבר בו.
   שירות שרץ ב-session 0 לא יכול להציג חלון בכלל.

   לביטול: `Win+R` → `shell:startup` → למחוק את הקיצור.

## הרצה

בשגרה — אין. העובד עולה לבד עם המחשב.

להרצה ידנית (פיתוח/אבחון):
```bash
cd worker
npm start
```

הרצה שקטה כמו בפרודקשן: `wscript worker\start-worker.vbs`
(הפלט נכתב ל-`worker\worker.log`).

או ישירות: `node worker/src/index.mjs`.

הפלט מדפיס כל תפיסת משימה, ההתקדמות שלה, והתוצאה. `Ctrl+C` עוצר בצורה
מסודרת — משימה שכבר בביצוע ממשיכה עד הסוף (או עד שהחכירה פוקעת, ואז נתפסת
מחדש בהרצה הבאה — ראה §"חוסן" למטה).

## מבנה

```
worker/
├── src/
│   ├── index.mjs        לולאת הרצה: heartbeat → claim → dispatch → report
│   ├── config.mjs        קורא worker/.env
│   ├── apiClient.mjs      עטיפת HTTP ל-edge function automation-worker
│   ├── dispatcher.mjs     מרשם ה-handlers — כאן אוטומציה חדשה נרשמת
│   ├── errors.mjs         NeedsHumanError / PermanentError
│   └── handlers/
│       └── devTestAutomation.mjs   הפעולה היחידה של אבן דרך 1
└── .env.example
```

## איך מוסיפים אוטומציה #2

1. ליצור `src/handlers/<שם>.mjs` שמייצא `actionType`, `preflight()` ו-`run(ctx, input)`.
   `run` מחזיר `{ result, facts?, artifacts? }`, או זורק `NeedsHumanError`/`PermanentError`
   (ראה `errors.mjs`) — כל שגיאה אחרת מטופלת כ-failed רגיל.
2. לרשום אותו ב-`dispatcher.mjs` (import + הוספה למערך `HANDLERS`).
3. זהו. הלולאה, החכירה, הדיווח וה-heartbeat כבר קיימים ומשותפים.

## חוסן — למה זה בטוח להרוג את התהליך באמצע

כל משימה נתפסת עם **חכירה** (lease) שפוקעת אחרי זמן קצוב. אם התהליך נהרג,
המחשב נרדם, או הרשת נופלת — אף אחד לא "משחרר" את המשימה בכוונה, אבל ברגע
שהחכירה פוקעת היא הופכת שוב לזמינה לתפיסה (על ידי אותו עובד בהרצה הבאה, או
עובד אחר). שום משימה לא נתקעת לצמיתות. ראה `supabase/150-automation-jobs.sql`
ו-`scripts/verify-automation-jobs.mjs` (מוכיח את זה על סביבת הבדיקות).

## אבטחה

- העובד מחזיק **רק** את `PIVO_WORKER_SECRET` — לא מפתח service-role, לא סיסמה,
  לא טוקן גישה למסד. הסוד הזה מוגבל ל-4 פעולות בלבד (claim/heartbeat/complete/fail)
  דרך ה-edge function `automation-worker`.
- העובד לעולם לא שומר עוגיות, טוקני סשן, PIN, OTP, או פרטי אישור דיגיטלי —
  גם באוטומציות עתידיות שכן פותחות דפדפן. אימות מול רשות ממשלתית תמיד ביד אדם.
- `worker/.env` מקומי בלבד ואינו נכנס ל-Git.
