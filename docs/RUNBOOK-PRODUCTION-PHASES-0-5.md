# ספר הרצה — העלאת שלבים 0–5 לפרודקשן

**נכתב 2026-08-08. ענף `redesign/design-package-phases-0-5`.**
‼ שום שלב כאן לא בוצע. המסמך הוא ההוראה המדויקת לרגע שגיא יאשר.

פרויקט הפרודקשן: `uoweoqtuiettozagwgdw` · Vercel: `accountant-crm` (master).

---

## 0 · לפני שנוגעים בכלום

```bash
npm run verify:close-rules          # חייב: 29/29
npx tsc --noEmit                    # חייב: נקי
npm run build                       # חייב: עובר
npm run staging:check               # חייב: evdfxjqrkgugssfrdoxd (לא פרודקשן)
npm run staging:test                # חייב: 33 · 31 · 32 · 37 — אפס כשלים
git rev-parse HEAD                  # לרשום — זו נקודת החזרה
```

‼ `staging:test` יסתיים תקין וידפיס **"2 חוליות נדחו במכוון"**. זה תקין
ומכוון — מסירת המייל החיצונית לא נבדקה, ראה סעיף 6.5 והמסמך
`docs/EMAIL-POLICY.md §8.2`.

**גיבוי:** להוריד גיבוי מלא של המסד מלוח הבקרה של Supabase
(Database → Backups) **לפני** ההרצה הראשונה. זו רשת הביטחון היחידה
למילוי לאחור של מיגרציה 68.

**לרשום את קו הבסיס** (משמש להשוואה בסוף):
```sql
select
  (select count(*) from public.clients)            as clients,      -- צפוי 16
  (select count(*) from public.engagements)        as engagements,  -- צפוי 3
  (select count(*) from public.onboarding_steps)   as steps,        -- צפוי 33
  (select count(*) from public.email_messages)     as emails,       -- צפוי 101
  public.public_link_health()                      as links;        -- allHealthy: true

select e.id, public.onboarding_close_readiness(e.id) as readiness
from public.engagements e order by e.created_at;
-- צפוי: שלוש שורות, ready=false, חוסמים 6 / 8 / 6
```

---

## 1 · מיגרציות — חמש, בסדר הזה

‼ **72 אינה כאן.** היא מפעילה קריאה ל-Edge Function שעדיין לא נפרסה.

| סדר | קובץ | מה |
|---|---|---|
| 1 | `supabase/68-onboarding-required-for-close.sql` | העמודה + מילוי לאחור + `create_onboarding_request` + `onboarding_close_readiness` |
| 2 | `supabase/69-template-required-flag.sql` | `save_journey_template` · `apply_journey_template` |
| 3 | `supabase/70-generator-explicit-required.sql` | `generate_onboarding_steps` · `sync_representation_upgrade_step` |
| 4 | `supabase/71-set-step-required.sql` | `set_onboarding_step_required` (חדשה) |
| 5 | `supabase/73-intake-questionnaire-optional.sql` | `add_intake_questionnaire_step` |

**אחרי כל מיגרציה:**
```sql
select public.public_link_health();   -- allHealthy חייב להישאר true
```

**אחרי 68 — מבחן ההתאמה (חוסם):**
```sql
select e.id, public.onboarding_close_readiness(e.id) as readiness
from public.engagements e order by e.created_at;
```
רשימות החוסמים ו-`ready` **חייבות להיות זהות לקו הבסיס** (6 / 8 / 6, ready=false).
כל הפרש ⇒ **עצור וגלגל לאחור** (סעיף 5).

**אחרי 68 — שער החתימה הכפולה (חוסם):**
```sql
select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='create_onboarding_request';
-- חייב להחזיר 1. שתיים ⇒ "הוספת בקשה" שבורה. עצור.
```

**אחרי 70:**
```sql
select step_type, required_for_close from public.onboarding_steps
 where step_type in ('first_month_review','representation_upgrade');
-- כל השורות החדשות שייווצרו מכאן: false. שורות קיימות לא משתנות.
```

---

## 2 · פריסת הפרונט ופונקציות השרת

1. מיזוג `redesign/design-package-phases-0-5` → `master` עם `--no-ff`, ודחיפה.
2. **Vercel** בונה מ-master אוטומטית — לעקוב עד `READY`.
3. **GitHub Actions → "Deploy Edge Functions"** רץ אוטומטית (הענף נוגע ב-`supabase/functions/**`) ומפרסם את **כל** הפונקציות. לעקוב עד ירוק.
   - אזהרה צפויה בפלט על `supabase/supabase/functions/_shared/...` — מתועדת בוורקפלו, הקובץ כן נארז.

**מצב הביניים בטוח:** בין המיזוג לבין מיגרציה 72, אישור הצעה מתנהג כמו היום —
לא נשלח מייל ייצוג אוטומטי. הפרונט החדש כבר לא מכיל את מנגנון 24 השעות, ולכן
אישור שנוחת בחלון הזה לא יקבל קישור אוטומטית. **לבדוק אחרי 72 אם היה אישור
בחלון הזה, ולשלוח ידנית מכרטיס הלקוח.**

---

## 3 · הסודות — לפני 72

```sql
-- קיים כבר; לא נוגעים בו, לא מחליפים אותו, לא מציגים אותו:
select name from vault.secrets order by name;   -- quotation_reminder_cron_secret

-- כתובת הפונקציות של הפרודקשן. נוצרת פעם אחת:
select vault.create_secret(
  'https://uoweoqtuiettozagwgdw.supabase.co',
  'functions_base_url',
  'כתובת בסיס ל-Edge Functions בסביבה הזאת');
```

`internal_send_secret` **נוצר אוטומטית ע"י מיגרציה 72** אם אינו קיים — אין
צורך לייצר אותו ידנית ואין להדפיס אותו.

**אימות אחרי 72:**
```sql
select name from vault.secrets order by name;
-- צפוי: functions_base_url, internal_send_secret, quotation_reminder_cron_secret

select public.verify_internal_send_secret('לא-הסוד') as must_be_false;   -- false
```

---

## 4 · מיגרציה 72 — מפעילה את השליחה האוטומטית

```
supabase/72-auto-representation-send.sql
```

עושה: `verify_internal_send_secret` · `approve_quotation` עם בלוק שליחה
תוספתי בסוף · `flag_missing_representation_links` · מוסיפה קריאה למשימה
היומית הקיימת `onboarding-attention-daily` (לא יוצרת משימה חדשה).

**אימות הפעלה — בלי לשלוח מייל ניסיון (§19.3a):**
```sql
-- 1. הבלוק אכן בפונקציה
select position('internal_send_secret' in pg_get_functiondef(
  'public.approve_quotation(text,text,text)'::regprocedure)) > 0 as hook_present;

-- 2. המשימה היומית קיבלה את הקריאה
select command like '%flag_missing_representation_links%' as job_updated
from cron.job where jobname = 'onboarding-attention-daily';

-- 3. אין כשלים בתור של pg_net
select count(*) from net._http_response where status_code >= 400;
```

‼ **אין להריץ אישור ניסיון בפרודקשן ואין ליצור לקוח או תהליך.**
ההוכחה ההתנהגותית נעשית ב-staging.

---

## 5 · רולבק — מהיר לאיטי

| # | מה מכבים | פקודה | השפעה |
|---|---|---|---|
| 1 | **רק השליחה האוטומטית** | `CREATE OR REPLACE` של `approve_quotation` מ-`supabase/live-2026-08-07/approve_quotation.sql` | אישורים ממשיכים לעבוד, מיילים מפסיקים לצאת. שאר המערכת לא נוגעת. **הכי מהיר, וברוב המקרים מספיק.** |
| 2 | הפרונט | `git revert -m 1 <merge-commit>` + דחיפה | Vercel מחזיר את הממשק הקודם. ‼ הריוורט מחזיר גם את קוד הפונקציות — לבצע את שלב 1 **לפני**, אחרת יישאר hook שקורא לפונקציה בלי ענף הסוד |
| 3 | התנהגות בלבד | `profiles.settings.flags.journeyUi = false` / `onboardingTab = false` | בלי פריסה בכלל |
| 4 | המסד | ראה למטה | אחרון, ורק אם הפונקציות עצמן מתנהגות רע |

**רולבק מסד מלא (נוסה ואומת ב-staging):**
```sql
drop function if exists public.create_onboarding_request(text,text,jsonb,date,text,boolean,boolean);
-- שחזור מ-supabase/live-2026-08-07/: create_onboarding_request, onboarding_close_readiness,
-- save_journey_template, apply_journey_template, generate_onboarding_steps,
-- sync_representation_upgrade_step, add_intake_questionnaire_step, approve_quotation
drop function if exists public.set_onboarding_step_required(text, boolean);
drop function if exists public.flag_missing_representation_links();
drop function if exists public.verify_internal_send_secret(text);
alter table public.onboarding_steps drop column required_for_close;
delete from vault.secrets where name in ('internal_send_secret','functions_base_url');
```
העמודה אינה נקראת בשום מקום אחר, והפרונט סובל את היעדרה.

---

## 6 · בדיקת עשן אחרי הפריסה — קריאה בלבד

‼ **בלי ליצור לקוח, בלי להריץ תהליך, בלי לשלוח מייל.**

1. כניסה כגיא → מסך המשימות ומסך הלקוחות נטענים עם המספרים האמיתיים.
2. פתיחת **לקוח אמיתי אחד** בקריאה בלבד — דף המסע נטען בלי שגיאה.
3. ```sql
   select public.public_link_health();          -- allHealthy: true
   select count(*) from public.email_messages;  -- זהה לקו הבסיס
   select e.id, public.onboarding_close_readiness(e.id) from public.engagements e;
   -- שלוש השורות: ready=false, חוסמים 6/8/6 — כמו לפני
   ```
4. מסך "המשרד" ← התראות: שתי הרשומות החדשות מופיעות —
   `representation_link_missing` (דלוקה) ו-`quotation_expiry_reminder` (**כבויה**,
   בקבוצה "מיילים אוטומטיים ללקוח" עם האזהרה).
5. שער §19.3a (סעיף 4 למעלה).
6. קונסול נקי; הקילל-סוויץ' `journeyUi` כבוי ודלוק — שניהם עובדים.
7. השוואה סופית: 16 לקוחות · 3 התקשרויות · 33 שלבים · 101 מיילים — **ללא שינוי**.

### 6.5 · החוליה שלא נבדקה — מה לעשות עם האישור האמיתי הראשון

מסירת המייל בפועל דרך Resend **לא נבדקה בסביבת הבדיקות** (הפרדת סודות
מכוונת). זה הסיכון השיורי היחיד שנשאר פתוח בעלייה הזאת, ולכן **האישור
האמיתי הראשון אחרי מיגרציה 72 נצפה בזמן אמת**:

```sql
-- מיד אחרי האישור הראשון (עד דקה):
select id, representation_sent_at, left(representation_error, 200) as err
  from public.quotations where approved_at > now() - interval '1 hour';

select to_email, kind, status, left(error, 200) as err, created_at
  from public.email_messages order by created_at desc limit 3;

select status_code, left(content::text, 200) as body
  from net._http_response order by id desc limit 3;
```

**מה תקין:** `representation_sent_at` מלא · `representation_error` ריק ·
שורת מייל אחת `status='sent'` · `status_code = 200`.

**אם `representation_error` מלא ו-`representation_sent_at` ריק** — המסירה
נכשלה, התביעה שוחררה, והמייל **לא יצא**. זה בדיוק המצב שהמנגנון מתוכנן
אליו: אין כפילות, אין נזק, והרו"ח רואה את הכשל בכרטיס. הפעולה: לשלוח ידנית
מכרטיס הלקוח. אין צורך ברולבק.

**אם שני השדות מלאים** — סתירה שלא אמורה לקרות. לעצור, לבצע רולבק 1
(סעיף 5), ולדווח.

‼ **גם כאן: אין ליזום אישור ניסיון.** ממתינים לאישור אמיתי שמגיע מעצמו.

---

## 7 · מה משתנה בפרודקשן, במדויק

- **עמודה אחת:** `onboarding_steps.required_for_close`
- **שמונה פונקציות מוחלפות:** `create_onboarding_request`, `onboarding_close_readiness`,
  `save_journey_template`, `apply_journey_template`, `generate_onboarding_steps`,
  `sync_representation_upgrade_step`, `approve_quotation`, `add_intake_questionnaire_step`
- **שלוש חדשות:** `set_onboarding_step_required`, `verify_internal_send_secret`,
  `flag_missing_representation_links`
- **שני סודות חדשים** — הקיים לא משתנה, לא מוחלף ולא נחשף
- **שורה אחת** נוספת למשימה היומית הקיימת
- **שלוש פונקציות שרת** מתעדכנות: `send-onboarding-email`, `quotation-reminders`,
  `_shared/accountantNotifications.ts`

**לא משתנה:** אין מחיקה, אין שינוי סכימה הרסני, אין נגיעה בטוקנים ציבוריים,
במסמכים, בחתימות או בהיסטוריית המיילים.
