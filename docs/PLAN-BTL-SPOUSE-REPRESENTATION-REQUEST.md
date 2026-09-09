# ייצוג ביטוח לאומי לאדם נוסף — כבקשה במשטח «בקשות» · תוכנית מימוש

> **מקור האמת למימוש** של המיילסטון הבא. עודכן 9.9.2026 אחרי הכרעות המוצר
> הסופיות, מול HEAD `b0aff44`. מממש את `docs/PRODUCT-REQUESTS-WORKFLOW-FOUNDATION.md`
> עבור המקרה הראשון: ביטוח לאומי לאדם נוסף (בן/בת זוג, או הנישום עצמו) כשללקוח
> כבר יש בקשת ייצוג. **מחליף** את `handleAddNiTarget`, **מכיל** את
> `docs/PLAN-BTL-SPOUSE-STANDALONE-INSTRUCTIONS.md` (המייל כפי שתוכנן שם; הבעלות
> עליו עוברת לבקשה). אין כאן הכרעות מוצר פתוחות.
>
> לא נפתח מחדש: כרטיס ב"ל בתיק המס (154), סדר הראיות ב-`niRepresentationOf`,
> בית מסלולי הביצוע (`execution.nationalInsurance*`), בקשת הייצוג ומחזורה.

---

## 0 · ההכרעות שסגורות — ואיך הן מתורגמות

| # | הכרעה | בתוכנית |
|---|---|---|
| 1 | תיק המס מתאר; «בקשות» מנהל | «בקש ייצוג» יוצר בקשה (§2.3); תיק המס משקף (§4.3) |
| 2 | בעלים ≠ נושא | `owner = client_id` (גיא); `payload.subjectRole='spouse'`, `subjectName` (§2.1) |
| 3 | גיא רואה את הבקשה בדף האישי, הנושא חד-משמעי, בלי דף לדין | ענף ב-`build_client_portal` (§2.6) |
| 4 | גירושין מחוץ לתחולה | אין שום אוטומציה על `family_status` (§2.4 ‼) |
| 5 | היסטוריה אינה נכתבת מחדש | ההורה לא נפתח; בן חדש לכל מחזור; צילום בסגירה (§2.4) |
| 6 | הורה/בן | קינון כשההורה פתוח; עצמאי כשסגור (§4.1) |
| 7 | התכנסות כניסות | RPC אחד, אינדקס ייחודיות על הפתוחים (§2.2, §2.3) |
| 8 | מחזור הבקשה | ששת המצבים, פעולה ראשית אחת, דלת למרכז הביצוע (§2.4, §4.1) |
| 9 | המייל שייך לבקשה | `stepId` בשליחה, `email_messages.step_id`, מצב נגזר (§3, §4.5) |
| 10 | «בקשות» = המדד | שורה תמיד; הפירוט במרכז הביצוע (§4.1) |

---

## 1 · מה בונים, במשפט לכל שכבה

| שכבה | נוסף | מוחלף |
|---|---|---|
| מסד | סוג שלב `authority_representation`; אינדקס ייחודיות (בעלים, רשות, נושא) לפתוחים; RPC `request_authority_representation`; טריגר סנכרון; ענף בדף האישי; מילוי-לאחור | — |
| שרת מייל | `send-onboarding-email`: `niRole`+`stepId`, נמען מהכרטיס, `email_messages.step_id`, חתימת `standalone` אחרי 200 | — |
| דפדפן | כרטיס בקשה ב«בקשות»; פריט קטלוג; דיאלוג הוראות; דלת באבן-הדרך; `'send'` בתיק המס | `handleAddNiTarget` ⇒ קריאת RPC |

---

## 2 · מסד · מיגרציה `157-authority-representation-request.sql`

### 2.1 השלב
```
onboarding_steps
  step_type          = 'authority_representation'
  track              = 'authorities'                  (onboarding_track_for)
  scope              = 'person'
  client_id          = הבעלים (גיא)
  ball               = me | client                    (נגזר, §2.4)
  required_for_close = false                          (זירוז; ניתן לסמן; השרת כופה false מחוץ לקליטה)
  published_at       = now()                          (אין טיוטה — הפריט בדף הוא תצוגה)
  payload = {
    authority:               'national_insurance',   -- בהמשך 'vat' | 'withholding'
    subjectRole:             'client' | 'spouse',    -- הזהות (PersonRole)
    subjectName:             'דין וולוצקי ישר',      -- צילום לתצוגה
    representationRequestId: '95a77090…',            -- ההורה
    title:                   'ייצוג בביטוח לאומי — דין וולוצקי ישר',
    -- נכתב בסגירה (§2.4): referenceNumber, deadline, instructionsSentAt,
    --                     instructionsSentWith, confirmedAt
  }
```
- `onboarding_track_for`: `when 'authority_representation' then 'authorities'`.
- `create_onboarding_request`: **לא** מקבל את הסוג (יצירה רק דרך §2.3).
- `advance_onboarding_step`: זמין ל-`cancel`(עם סיבה)/`note`/`set_due` בלבד;
  `complete`/`reopen` על הסוג הזה ⇒ `{ok:false, error:'derived_step'}` — המצב נגזר.
- `portal_submit_step`: לא ברשימת ההיתר.
- `onboarding_close_readiness`: הסוג **לא** ברשימת ההתעלמות (מוצג ⇒ רשאי לחסום
  אם סומן `required`).

### 2.2 ייחודיות
```sql
drop index if exists onboarding_steps_person_type_idx;
create unique index onboarding_steps_person_type_idx
  on public.onboarding_steps (client_id, step_type)
  where scope = 'person' and status <> 'cancelled'
    and step_type not in ('custom_request', 'authority_representation');

drop index if exists onboarding_steps_engagement_type_idx;
create unique index onboarding_steps_engagement_type_idx
  on public.onboarding_steps (engagement_id, step_type)
  where engagement_id is not null
    and step_type not in ('custom_request', 'authority_representation');

-- זהות העבודה: בעלים + רשות + נושא, פתוח אחד בלבד
create unique index onboarding_steps_authority_subject_open_idx
  on public.onboarding_steps (client_id, (payload->>'authority'), (payload->>'subjectRole'))
  where step_type = 'authority_representation'
    and status not in ('completed','verified','skipped','cancelled');
```

### 2.3 ה-RPC — נקודת ההתכנסות
```sql
create or replace function public.request_authority_representation(
  p_client_id text, p_authority text, p_subject_role text, p_source text default null
) returns jsonb  -- {ok, stepId, created, reason?}
```
טרנזקציה אחת (מחליפה את שלוש הכתיבות הלא-אטומיות מהדפדפן):
1. **הרשאה**: `auth.uid() = clients.user_id`.
2. **תקפות** (כל כשל ⇒ `{ok:false, reason}` ואפס כתיבות):
   `p_authority='national_insurance'` (`bad_authority`); `p_subject_role in ('client','spouse')`;
   `representation_request_id is not null` (`no_representation` — הדפדפן מציע «פתח ייצוג»);
   ל-`spouse`: `family_status='married'` (`not_married`), `spouse_client_id is null`
   (`linked_subject` — מבקשים מהכרטיס שלו/ה), `spouse_represented_elsewhere is not true`
   (`represented_elsewhere`).
3. **כבר פעיל**: `tax_files[authority, owner]='active'` או `execution.<track>.confirmedAt`
   ⇒ `already_active`.
4. **אידמפוטנטיות**: שלב פתוח לפי האינדקס ⇒ `{ok:true, stepId, created:false}`.
5. **כתיבות**:
   - `authority_representations.nationalInsurance`: `targets` מנורמל (חסר ⇒ `['client']`;
     `coversSpouse=true` ⇒ `['client','spouse']` והדגל מוסר) + `p_subject_role`;
     רשומה חסרה ⇒ `{status:'in_process', targets:[role]}`; `status` קיים לא זז.
   - `tax_files`: שורה ל-(רשות, בעלים=role) נוצרת (בלי `fileNumber`) או מקודמת
     מ-`'none'` ל-`'pending'`, דרך `record_manual_fact_change(p_client_id, 'taxFiles',
     'ייצוג בביטוח לאומי — {subjectName}', {display:'אין ייצוג'}, {display:'בתהליך', patch:{taxFiles}}, null)`.
   - `representation_requests.execution`: `jsonb_set(execution, '{<track>}', '{}')` רק אם חסר.
     **לא** `status`, **לא** `scope`, **לא** `signers`, **לא** טוקן.
   - `insert onboarding_steps` (§2.1), `status`/`ball` נגזרים מיד (§2.4),
     `sort_order` אחרי שלב הייצוג, `engagement_id` = ההתקשרות הנוכחית אם קיימת.
   - `log_onboarding_event('created','accountant','נפתחה בקשת ייצוג ב"ל ל{subjectName}',
     {authority, subjectRole, source: p_source})` — `p_source ∈ ('tax_file','catalog')`, תיעוד בלבד.
6. `{ok:true, stepId, created:true}`.

### 2.4 טריגר הסנכרון — המצב נגזר, לא נכתב
`public.sync_authority_representation_steps(p_client_id)`: לכל שלב מהסוג של
הלקוח שאינו `cancelled`, קורא את המסלול לפי `(authority, subjectRole)` —
לב"ל `execution->'nationalInsurance'` / `'nationalInsuranceSpouse'` — ואת
`tax_files[owner]`, ומחשב:

| # | ראיה | `status` | `ball` | משפט המצב על הכרטיס |
|---|---|---|---|---|
| 1 | מסלול ריק | `pending` | me | «נדרשת הזנה בפורטל ב״ל» |
| 2 | `enteredAt` | `in_progress` | me | «הייצוג הוזן · ממתינים לאסמכתא» |
| 3 | `referenceNumber` ∧ ¬`instructionsSentAt` | `in_progress` | me | «אסמכתא {מס׳} · עד {מועד} · נדרש לשלוח הוראות אישור» |
| 4 | `instructionsSentAt` | `waiting_client` | client | «נשלח ל-{email} · ממתינים לאישור {subjectName}» (`'signature'` ⇒ «נשלח עם בקשת החתימה») |
| 5 | `confirmedAt` ∨ `tax_files[owner]='active'` | `completed` | — | «ייצוג פעיל» |
| — | `deadline < today` ∧ ¬`confirmedAt` | `blocked` + `needs_attention` | me | «האסמכתא פגה — נדרשת הזנה מחדש» |

כותב רק בשינוי. ב-`completed`: `completion_method='auto'`, `completed_at`
(אם ריק, `coalesce(confirmedAt, now())`), **צילום** `referenceNumber, deadline,
instructionsSentAt, instructionsSentWith, confirmedAt` ל-`payload`,
`log_onboarding_event(status_changed,'system')`, `unlock_dependent_steps`.
מופעל מ: `after update of execution on representation_requests` ⇒ `linked_client_id`;
`after update of authority_representations, tax_files on clients` ⇒ `id`.
כותב **רק** ל-`onboarding_steps` — אין רקורסיה.

‼ **אין שום טריגר על `family_status`.** שינוי מצב משפחתי אינו מבטל, מעביר או
סוגר בקשה (הכרעה 4). בקשה פתוחה לבן/בת זוג שכבר אינו/ה מוצג/ת בתיק המס נשארת
פתוחה עד שהרו"ח מבטל אותה ידנית עם סיבה — ומטופלת בעתיד כחלק מפיצול כרטיסים.

‼ **ההורה לא זז.** שום דבר כאן לא נוגע ב-`representation_requests.status`;
`rep_requests_guard_status` ממשיך לאכוף `active` סופי.

### 2.5 מילוי-לאחור (קדימה בלבד, אידמפוטנטי)
לכל בקשת ייצוג עם `linked_client_id`, לכל `role` ב-`targetsOf(nationalInsurance)`
של הכרטיס — אם אין שלב ל-(לקוח, ב"ל, role): ליצור (בלי לגעת בכרטיס/ב-`execution`)
ולהריץ סנכרון. **לגיא/דין**: שלב `pending` «נדרשת הזנה בפורטל ב״ל» מופיע ב«בקשות»
מיד עם ההחלה — הלחיצה שלו כבר נרשמה; אין צורך בלחיצה נוספת. שלב לנישום שכבר
`active` נוצר **סגור** (`completed_at = coalesce(confirmedAt, request.updated_at)`)
עם `subjectName` = שם הלקוח. `domain_consistency_report()` מקבל: מסלולים בלי
שלב / שלבים בלי מסלול.

### 2.6 הדף האישי — הבעלים רואה, הנושא חד-משמעי, בלי פקד שסוגר
ענף `when 'authority_representation'` ב-`build_client_portal`, `key = 'authrep_'||s.id`,
`label = payload.title` (הנושא בכותרת, תמיד):

| מצב השלב | דלי | `kind` | תוכן |
|---|---|---|---|
| `pending` / `in_progress` (מצבים 1–2) | `office` | — | sub: «בטיפול המשרד — הזנת הייצוג בביטוח לאומי» |
| מצב 3 (אסמכתא, טרם נשלח) | `office` | — | sub: «האסמכתא התקבלה — נשלח ל{subjectName} הוראות אישור» |
| מצב 4 (נשלח) | `office` | `message` | note: «האסמכתא של {subjectName}: {מס׳} · לאשר עד {מועד} · באתר ביטוח לאומי או בטלפון {NI_PHONE}. אם ההודעה לא הגיעה — אפשר להעביר לה/לו את ההוראות.» + `linkUrl` לאתר ב"ל, `linkLabel` |
| `blocked` | `office` | — | sub: «האסמכתא פגה — נזין מחדש» |
| `completed` | `done` | — | label: «{title} · אושר» |
| `cancelled` | — | — | לא מופיע |

‼ **אין** `action`/`declare`: גיא אינו יכול «לאשר» במקום דין; ההשלמה נגזרת מראיה.
‼ **אין** טוקן/דף לדין. הקישור בפריט הוא לאתר ב"ל (חיצוני, עם אסמכתא) — אותו
קישור שבמייל. אם `kind:'message'` בדף אינו מציג `linkUrl` — להוסיף תמיכה
ב-`linkUrl/linkLabel` לפריט `message` (הרחבה קטנה, לא סוג חדש).
‼ בדיקת דף: `scripts/staging-test-requests-v2.mjs` מקבל טענה שהפריט מופיע
בדלי הנכון, ושאין לו `actionKind`.

### 2.7 אימות ב-staging (`execute_sql` — בלוק DO לא נקלט ב-`apply_migration`)
`scripts/staging-test-authority-representation.mjs`:
1. יצירה ⇒ `created:true`; targets/tax_files/execution/step; **`representation_requests.status`,
   `scope`, `signers`, טוקנים לא זזו**; `representation_status` לא זז; `build_client_portal`
   מכיל פריט `office` בלי `actionKind`.
2. יצירה חוזרת (וגם משתי «כניסות») ⇒ `created:false`, אותו `stepId`, אפס שורות.
3. `tax_files` ב-`'none'` ⇒ `'pending'` + שורת `tax_fact_changes`.
4. `coversSpouse:true` ⇒ מנורמל ל-`targets`.
5. סנכרון: כל שורה בטבלת §2.4, כולל `blocked` ו-`completed` עם צילום.
6. `already_active`, `no_representation`, `not_married`, `linked_subject`,
   `represented_elsewhere` — מוחזרים, אפס כתיבות.
7. סגור ⇒ בקשה חוזרת = **שלב שני**; הראשון לא נכתב מחדש.
8. `cancel` עם סיבה ⇒ נשאר `cancelled`; הסנכרון לא מחיה.
9. `advance('complete')`/`('reopen')` ⇒ `derived_step`.
10. `close_onboarding_if_ready`: ברירת מחדל אינו חוסם; `required` בקליטה פתוחה ⇒ חוסם.
11. `family_status` ⇒ `'divorced'` ⇒ **שום שינוי** בשלב.
12. מילוי-לאחור ×2 = אותן שורות.
+ `staging-test-domain-invariants.mjs`, `requests-v2`, `close-rules`, `required-model` — ללא שינוי.

---

## 3 · שרת המייל · `send-onboarding-email`
כמו `PLAN-BTL-SPOUSE-STANDALONE-INSTRUCTIONS.md` §8, עם שינוי הבעלות:
- גוף: `niRole?: 'client'|'spouse'`, **`stepId?: string`** — נקראים רק ב-`stage:'ni_approve'`.
- נמען: `spouse` ⇒ `clients.spouse_email`; `client` ⇒ `client_email`. **לא** מגוף הבקשה.
  ריק ⇒ `400 no_recipient_email` (הדפדפן מונע — §4.5).
- `stepId` מאומת: `client_id = linked_client_id`, `step_type='authority_representation'`,
  `payload.subjectRole = niRole`, `payload.authority='national_insurance'`; אי-התאמה ⇒ `400 step_mismatch`.
- `clientFirst` מ-`spouse_first_name` ⇒ אחרת המילה הראשונה של `spouse_name`.
- שער כפילות: `execution.<track>.instructionsSentAt` קיים ∧ `!force` ⇒ `{ok:true, alreadySent:true}`.
- אחרי 200: `email_messages` עם `step_id`, `request_id`, `kind:'ni_approve'`,
  `meta:{niRole}`, מפתח `ni_approve:<requestId>:<niRole>[:r<n>]`; ואז
  `update representation_requests set execution = jsonb_set(…instructionsSentAt=now, instructionsSentWith='standalone')`
  **רק אם ריק** ⇒ טריגר §2.4 ⇒ `waiting_client`. **אין** `advance('email_sent')` מהדפדפן.
- כישלון Resend ⇒ שורת `failed` (בלי מפתח ייחודי), `502`, **שום דבר לא נחתם**.
- `preview:true` — ללא כתיבה.
- פריסה: `node scripts/deploy-edge-function.mjs staging send-onboarding-email` ⇒ אימות
  ⇒ `prod` **לפני** ה-push של הדפדפן (דפדפן ישן לא שולח `niRole` — השרת מתנהג כמו קודם).

---

## 4 · דפדפן

### 4.1 «בקשות» — `AuthorityRepresentationCard` (`OnboardingTab.tsx`)
- `CLIENT_FACING_TYPES` ⇐ הסוג (מוצג ב«מה אני צריך מהלקוח»); **לא** ב-`AUTO_OFFICE_TYPES`/`EXECUTION_OWNED_TYPES`.
- קינון: `buildClientFacingRows` — כשקיים שלב `representation` **פתוח** לאותו לקוח,
  הבן מקונן תחתיו (לפי `payload.representationRequestId`); אחרת עומד לבד.
- הכרטיס: כותרת `payload.title` (הנושא בכותרת); משפט המצב מטבלת §2.4; **פעולה
  ראשית אחת**: מצבים 1–2 ⇒ «למרכז הייצוג ←»; מצב 3 ⇒ «שלח הוראות אישור ל-{שם}»;
  מצב 4 ⇒ «שלח שוב» (משני) + «למרכז הייצוג ←»; `blocked` ⇒ «למרכז הייצוג ←».
  שורות `EmailStatusRow` ל-`email_messages` עם `step_id` זה (נמסר/נפתח/הוקפץ).
  ⋯ ⇒ ביטול עם סיבה, הערה, מועד. **בלי** «הלקוח השלים», **בלי** סימון ידני.
- אבן-הדרך «בקשת ייצוג · הושלמה» מקבלת «למרכז הייצוג ←» (`onOpenRepresentation`).
- ניווט מתיק המס: חדש `onOpenRequestStep(stepId)` ⇒ לשונית «בקשות» + `gotoStep`.

### 4.2 «＋ בקשה חדשה» (`AddRequestDialog.tsx`)
פריט קטלוג `authority_representation` — «ייצוג ברשות — לאדם», `once:false`:
- זמינות **מאותו רזולבר** של תיק המס: `niPersons(client, spouseClient)` × `niRepresentationOf`
  × `niRepresentationAction` ⇒ צירופים עם `kind:'add'`. ריק ⇒ מושבת עם הסיבה
  («כל בני הבית מיוצגים בביטוח לאומי» / «אין בקשת ייצוג — פתח ייצוג» ⇒ `onStartRepresentation`).
- בחירת נושא (רדיו: שם + ת.ז. ממוסך + תפקיד), רשות (ב"ל; אחרות מושבתות «בהמשך»).
  «צור» ⇒ RPC עם `p_source='catalog'` ⇒ `onCreated` ⇒ `gotoStep`.
- `AddRequestDialog` מקבל `client`/`spouseClient` (היום `clientId`) — דרך `OnboardingTab`.

### 4.3 תיק המס (`TaxFileTab.tsx`, `niPersons.ts`, `authorityFlags.ts`, `App.tsx`)
- `handleAddNiTarget` ⇒ `handleRequestAuthorityRepresentation(clientId, 'national_insurance', role)`:
  `ConfirmDialog` («להוסיף את {שם} לייצוג בביטוח לאומי? תיפתח בקשה: הזנה בפורטל
  ב״ל, אסמכתא, ואישור של {שם}.») ⇒ RPC `p_source='tax_file'` ⇒ `refreshClient` +
  רענון שלבים ⇒ `onOpenRequestStep(stepId)`. כשל ⇒ הודעה ליד הכפתור (`b0aff44`);
  `already_active`/`created:false` ⇒ ניווט לשלב הקיים.
- `niRepresentationOf`: פרמטר אופציונלי `openStep?: OnboardingStep` — `blocked` ⇒
  `detail:'האסמכתא פגה — נדרשת הזנה מחדש'`. סדר הראיות לא משתנה.
- `niRepresentationAction`: `'send'` («שלח הוראות אישור») במצב 3; `'continue'`
  מנווט לבקשה (`onOpenRequestStep`), לא למרכז הביצוע.
- `niSpouseRepresentationFlag`: `requestExists = !!openStep` ⇒ «בטיפול» בלי כפתור;
  `niAction` רק כשאין שלב.
- `AlignmentStatusView` ⇒ `computeAuthorityFlags(client, steps, spouseClient, niExecution)` (השלמת חיווט).

### 4.4 מרכז הביצוע (`RepresentationExecutionCenter.tsx`)
- `NiTrack` שלב 3: «שלח הוראות אישור» כש-`referenceNumber ∧ ¬instructionsSentAt ∧ ¬sentWithSignature ∧
  (exec.signatureEmailSentAt ∨ אין חותם ממתין לתפקיד)` — פותח **אותו** דיאלוג (§4.5) עם `stepId` לפי `subjectRole`.
- ההערה «אין כאן כפתור שליחה» ⇒ «אין כשהחתימה עוד לפנינו».
- `handleSaveExecution`: `confirmedAt` ⇒ `taxFiles[NI, owner].repStatus='active'` אם השורה קיימת. הטריגר סוגר את השלב.

### 4.5 `NiInstructionsDialog.tsx` (חדש) — כולל המקרה בלי כתובת
- זהות (שם, תפקיד, ת.ז. ממוסך), אסמכתא, מועד, `EmailInput` ממולא מ-`clients.spouseEmail`
  ⇒ ברירת מילוי `signers[spouse].email` ⇒ ריק.
- **אין כתובת**: השדה חובה, ריק ⇒ «המשך» מושבת עם «אין כתובת מייל ל{שם} — הזן/י
  כאן; היא תישמר בכרטיס». ‼ לא מסמנים דבר, לא «נמסר ידנית».
- «המשך» ⇒ אם השתנה: `updateClient({spouseEmail})` (הכתובת הקנונית, אותו מסלול
  של `PersonalContactsTab`; `signers` לא נוגעים) ⇒ `EmailPreviewDialog
  {requestId, stage:'ni_approve', niRole, stepId}` ⇒ `onSent` ⇒ רענון בקשות + שלבים.
- «שלח שוב» = `force:true`; הכתובת נקראת מחדש מהכרטיס.

### 4.6 בדיקות דפדפן (harness)
- `__TestOnboarding`/`__TestJourney`: הסוג בכל מצב (1–5, `blocked`), מקונן תחת
  ייצוג פתוח ועומד לבד אחרי אבן-דרך; דלת באבן-הדרך; `EmailStatusRow` נמסר/הוקפץ.
- `__TestTaxFileV6`: `couple-rep-legacy-none`/`couple-rep-stuck` — הלחיצה מדמה RPC;
  הדגל «בטיפול»; `'send'` בפיקסצ'ר עם אסמכתא; `couple-rep-norequest` — «פתח ייצוג».
- `__TestAddRequestDialog`: הפריט זמין/מושבת לפי המצב; בחירת נושא.
- `__TestPortalPreview`: הפריט של גיא בכל דלי, בלי `actionKind`.

---

## 5 · סדר הביצוע ל-Sonnet

גדרות: אין נגיעה ב-`representation_requests.status/scope/signers/tokens`; אין
`declare`/`action` בדף לפריט הזה; אין כתיבת `status` של השלב מהדפדפן; הנמען נפתר
בשרת; «נשלח» רק אחרי 200; אין אוטומציה על `family_status`; עברית; הוקים ב-`TaxFileTab`
לפני `return` מותנה; `git add` על קבצים מפורשים בלבד.

1. **מיגרציה 157** ⇒ staging (`execute_sql`) ⇒ §2.7 ירוק ⇒ סוויטות קיימות ללא שינוי.
2. **`send-onboarding-email`** (§3) ⇒ staging ⇒ `preview` + כישלון-בלי-חתימה (מפתח
   Resend של staging פג) ⇒ פרודקשן (מסירה אמיתית ל-`delivered@resend.dev` על חשבון
   ה-E2E בלבד).
3. **דפדפן** §4.1→§4.5; typecheck + build.
4. **QA** §4.6 + harness: תיק המס והקטלוג מתכנסים לאותו `stepId`; לחיצה כפולה/שני
   חלונות ⇒ שלב אחד; ביטול + בקשה חוזרת ⇒ שני שלבים ב«עבר»; מייל ⇒ `waiting_client`
   + שורה על הכרטיס; בלי כתובת ⇒ חסום, אחרי הזנה ⇒ נשמר בכרטיס ונשלח; «שלח שוב»;
   הוקפץ; דף אישי בכל מצב; מובייל 375; אפס שגיאות קונסולה. **על נתוני אמת**: קריאה
   בלבד — לגיא/דין השלב נולד מהמילוי-לאחור; ההזנה בפורטל היא של גיא.
5. **קומיט אחד** (דפדפן + מיגרציה + סקריפט); push; פריסה; אימות דרך ה-API;
   **ואז** מיגרציה 157 לפרודקשן (`execute_sql`, אחרי בדיקת דריפט של העמודות/פונקציות
   שהיא קוראת) ⇒ `domain_consistency_report()` ⇒ הכרטיס של גיא מציג את הבקשה של דין.
6. **תיעוד**: `supabase/MIGRATIONS.md` (157); `PLAN-BTL-SPOUSE-STANDALONE-INSTRUCTIONS.md`
   מקבל בראשו «הבעלות עברה לבקשה — ראה PLAN-BTL-SPOUSE-REPRESENTATION-REQUEST.md»;
   `LIFECYCLE-IMPLEMENTATION-PLAN.md:44` מוריד את «ענף מת».

**סיכוני רגרסיה לבדוק במפורש**: שני האינדקסים המוחרגים; טריגר על `clients` כותב רק
ל-`onboarding_steps`; `sync_representation_step` לא נוגע בבן; `close_onboarding_if_ready`
עם בן `required=false`; `build_client_portal` — `limit 1` על בקשת הייצוג לא משתנה;
לקוח לא-נשוי / `single-ni` / `couple-rep-norequest` ללא שינוי; `handleMarkActive`
(דילוג על ב"ל) נכון; הטריגר רץ על כל `update execution` (תדירות ידנית נמוכה).

---

## 6 · מחוץ למיילסטון (מתועד, לא מתוכנן כאן)
בנים גם לקליטה הראשונה; מע״מ/ניכויים לאדם דרך `shaamEntries`; ביטול ייצוג
(הורה + בנים); **פיצול כרטיסים/גירושין** — אירוע מחזור-חיים נפרד שיהיה הבעלים של
העברת הבקשות וההיסטוריה; דף אישי לנושא — מותנה בזהות.
