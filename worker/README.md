# עובד אוטומציה מקומי — PIVO

תהליך Node שרץ על מחשב המשרד (לא בדפדפן, לא ב-Vercel, לא ב-Supabase Edge) ומבצע
משימות אוטומציה שנוצרו ב-PIVO. אבן דרך 1 מוכיחה רק את **הצנרת** — יצירת
משימה → תפיסה → ביצוע → דיווח חזרה — בלי לגעת בשע״ם או בכל רשות אמיתית.
לארכיטקטורה המלאה: `docs/PIVO-AUTOMATION-FOUNDATION.html`.

**אפס תלויות.** Node 18+ מספיק (יש בו `fetch` מובנה). שום `npm install` נדרש.

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

## הרצה

```bash
cd worker
npm start
```

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
