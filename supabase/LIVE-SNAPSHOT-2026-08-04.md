# צילום מצב של פונקציות ה-DB החיות — 2026-08-04

נכתב בשלב 0 של `docs/PLAN-unified-lifecycle.md`, לפני כל שינוי.
**מסד הנתונים הוא מקור האמת** (פרויקט `uoweoqtuiettozagwgdw`). המסמך הזה מתאר התנהגות
ומצביע על מה שחשוב — אין להסתמך עליו כעל נוסח מדויק. לשליפת הנוסח שרץ בפועל:

```sql
select pg_get_functiondef(oid) from pg_proc
where pronamespace = 'public'::regnamespace and proname = '<שם הפונקציה>';
```

## מה נמצא — ומה זה אומר לתוכנית

### 1. `refresh_lifecycle_stages()` — כבר מכיל את הכללים שהתוכנית ביקשה

הסדר בפועל (ראשון שמתקיים מנצח):

| תנאי | שלב |
|---|---|
| `lifecycle_stage = 'archived'` | `archived` (ארכוב ידני גובר) |
| קיים engagement בסטטוס `onboarding` | `onboarding` |
| קיים engagement בסטטוס `active`/`ended` | `active` |
| `representation_status = 'active'` | `active` |
| קיימת הצעה `approved` על הכרטיס | `onboarding` |
| קיימת הצעה `sent`/`viewed` דרך ליד שהומר לכרטיס | `quoted` |
| קיימת הצעה `sent`/`viewed` ישירות על הכרטיס | `quoted` |
| `merged_from_lead_id` מאוכלס ואין הצעה | `lead` |
| אחרת | לא נוגע |

**מסקנה:** סעיף א.2 בתוכנית כמעט מיותר — הכללים כבר נכונים. מה שחסר הוא **מתי** זה רץ.

### 2. ‼ הגילוי המרכזי: השלב מתעדכן פעם ביום בלבד

`cron.job` → `onboarding-attention-daily`, בשעה 05:15:
`select public.refresh_onboarding_attention(); select public.refresh_lifecycle_stages();`

זו הפונקציה היחידה שכותבת `lifecycle_stage`, והיא **גלובלית וללא ארגומנטים**.
כלומר: רו"ח ששולח הצעה היום ב-10:00 לא יראה את האדם עובר לעמודת "הצעה בחוץ" עד מחר בבוקר.

**זה סותר ישירות את דרישת "אפס סתירות" של המשפך** — ולכן שלב א' חייב להוסיף
רענון נקודתי בזמן אמת (פונקציה לכרטיס בודד + טריגרים על `quotations` ו-`engagements`).
הריצה היומית נשארת כרשת ביטחון.

### 3. `open_quotation_representation(p_quotation_id)` — כבר מוכן ללידה מוקדמת

סדר איתור הלקוח בתוכה: `q.client_id` → `leads.converted_client_id` → התאמת אימייל
(רק ללקוח שכבר יש לו בקשת ייצוג) → יצירת לקוח חדש.

- אם הכרטיס כבר קיים **ויש לו** `representation_request_id` → מסלול שימוש-חוזר: ממזגת רשויות,
  לא פותחת בקשה שנייה.
- אם הכרטיס קיים **ואין לו** בקשת ייצוג → ה-`else` מעדכן עליו `representation_status='pending_fill'`
  ובקשה חדשה. **זה בדיוק המסלול של כרטיס שנולד בשליחת ההצעה.**
- רצה רק כאשר `q.status = 'approved'`, ורק אם `representation.enabled`.

**מסקנה:** סעיף א.3 מתקיים כבר היום. יש לאמת בבדיקה, לא לשנות קוד.

### 4. `merge_leads_into_people(p_dry_run)` — לא מסוכנת ללידה מוקדמת

מדלגת על כל ליד עם `converted_client_id`. מכיוון ש-`ensure_client_for_quotation`
תאכלס את המצביע הזה, הפונקציה לא תיצור כרטיס שני. מתאימה גם ללא שינוי.

### 5. `mint_portal_token(p_client_id)` — דורשת `auth.uid()`

טובעת טוקן רק ללקוח של המשתמש המחובר. לכן **אי אפשר להשתמש בה מתוך פונקציה של
הלקוח הציבורי**; בלידה מוקדמת הטוקן ייטבע בתוך `ensure_client_for_quotation`
(שרצה בהקשר הרו"ח) — וזה גם הופך את הטביעה שבתוך `send-onboarding-email` למיותרת.

### 6. `get_client_portal(p_token)` — היום מותנית בקיום engagement

מחזירה `{ok, clientFirstName, firmName, branding, done, total, items[]}`.
עוברת על `onboarding_steps` בלבד. **אין לה מה להציג ללקוח שעדיין לא חתם** — היא
תחזיר רשימה ריקה. זה מה ששלב ב' מתקן.

הפריט `'אישור הצעת המחיר'` נוסף לדלי `done` רק אם קיים engagement.

### 7. `approve_quotation(p_token, p_signature, p_signer_name)`

תקינה כמו שתוארה בתוכנית. קוראת ל-`open_quotation_representation` ואז
ל-`create_engagement_for_quotation` בתוך `begin/exception when others then null` —
כלומר כשל בהרכבת הקליטה לא שובר את החתימה. מחזירה `onboardingToken` רק אם
`onboarding_status = 'pending'`.

## מצב הנתונים ברגע הצילום

| מדד | ערך |
|---|---|
| לקוחות | 16 (15 `active`, 1 `onboarding`) |
| לקוחות בשלב `lead`/`quoted` | 0 |
| לקוחות עם `merged_from_lead_id` | 0 |
| **לקוחות עם `portal_token`** | **0 מתוך 16** — הדף האישי נטבע לפי דרישה בלבד |
| לידים | 2, כולם עם `converted_client_id` |
| הצעות מחיר | 3, אחת ללא `client_id` |

## מוקש בקוד הדפדפן

`handleSendQuotation` (`src/App.tsx`) מעדכן את ההצעה מאובייקט מקומי אחרי השליחה.
אם השרת אכלס `client_id` בינתיים והאובייקט המקומי מחזיק `null` — העדכון ידרוס אותו.
כל קריאה ל-`ensure_client_for_quotation` חייבת למזג את ה-`clientId` שחזר לאובייקט
לפני `updateQuotation`.
