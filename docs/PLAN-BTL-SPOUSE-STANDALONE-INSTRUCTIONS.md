# הוראות אישור ב"ל לבן/בת זוג שנוסף/ה לייצוג קיים — שליחה עצמאית

> נכתב 4.9.2026 מול HEAD `c74a0e4` (המיילסטון «ב"ל לפי אדם» חי בייצור). מסמך הכרעה בלבד:
> אין קוד, אין מיגרציה, אין קומיט. משלים את `PLAN-BTL-ADD-SPOUSE-REPRESENTATION.md`
> — ובמיוחד סוגר את «הכרעת מוצר שנשארה» §11.1 שם.
>
> לא נפתח מחדש: «בקש ייצוג» כותב target + טיוטת `taxFiles` + מסלול ביצוע ריק, בלי בקשה שנייה
> ובלי טוקן. המסמך הזה מוסיף רק את חוליית התקשורת שחסרה אחריו.

---

## 0 · השורה התחתונה

1. **התבנית כבר קיימת בשרת.** `send-onboarding-email` מכיר `stage:'ni_approve'` — מייל עצמאי
   עם האסמכתא בגדול, המועד האחרון, ושתי דרכי האישור (אתר/טלפון). **אף אחד לא קורא לו** —
   `LIFECYCLE-IMPLEMENTATION-PLAN.md:44` אף סימן אותו «ענף מת». הוא בדיוק מה שצריך, בשני פערים
   קטנים: הוא קורא תמיד את מסלול **הנישום** ושולח תמיד ל-`client_email`.
2. **`'standalone'` הוגדר בדיוק למקרה הזה** («במייל נפרד — השלמה בדיעבד») ואף אחד לא כותב אותו.
3. **המייל אינו יכול לצאת ברגע «בקש ייצוג».** התוכן היחיד שיש למבוטח לעשות איתו הוא **האסמכתא**,
   והיא נולדת רק אחרי שהרו"ח מזין את ייפוי הכוח בפורטל ב"ל. השרת עצמו מסרב לשלוח `ni_approve`
   בלי אסמכתא (`missing_reference_number`). לכן «שלח» הוא צעד **אחרי** ההזנה — לא אחרי הלחיצה.
4. **הנמען נפתר בשרת מהכרטיס** (`clients.spouse_email`), לא מגוף הבקשה — כמו ב-`send-step-email`.
   ולכן עריכת המייל בדיאלוג **כן** מעדכנת את הכרטיס (זה הבית הקבוע של הכתובת מאז מיגרציה 113),
   ולעולם לא נוגעת ב-`signers[]`.
5. **סימון «נשלח» נכתב רק אחרי תשובת 200 מ-Resend**, בשרת, באותה קריאה. כישלון ⇒ שורת `failed`
   ביומן, המסלול לא זז, וכפתור השליחה נשאר.

---

## 1 · תשתית המייל הקיימת — מה יש לנו

| רכיב | איפה | מה עושה | רלוונטי לנו |
|---|---|---|---|
| `send-onboarding-email` | `supabase/functions/send-onboarding-email/index.ts` | מיילי הייצוג ללקוח: `onboard`/`sign`/`active`/`intake`/`ni_approve` (+`sign_with_ni` נגזר). `preview:true` מחזיר את אותו HTML בלי לשלוח. שולח דרך Resend, רושם ב-`email_messages` (כולל ה-HTML), מפתח ייחודי אופציונלי | **הבסיס.** מוסיפים לו פרמטר `niRole` |
| `EmailPreviewDialog` | `src/components/EmailActivity/EmailPreviewDialog.tsx` | תצוגה מקדימה מהשרת (אותו גוף בקשה + `preview:true`), כפתור שליחה עם אותו גוף, `onSent`, מצב `readOnly`, `sendVia` חלופי | **השער.** מדיניות המייל (§4 ב-`EMAIL-POLICY.md`) מחייבת תצוגה מקדימה לכל מייל ידני |
| `email_messages` | טבלה (`schema-from-prod.sql:254`) | `user_id, client_id, request_id, to_email, subject, kind (טקסט חופשי), status, error, html, resend_id, idempotency_key (ייחודי לכל user), meta jsonb` | `kind:'ni_approve'` כבר מתויג בעברית (`EMAIL_KIND_LABEL`); `meta` ישמור `{niRole}` |
| `resend-webhook` | edge function | מעדכן `delivered/opened/clicked/bounced/complained` לפי `resend_id` | מעקב מסירה חינם — כולל «הוקפץ» שמצדיק «שלח שוב» |
| `useEmailMessages` + `EmailStatusRow` | hook + רכיב | 200 המיילים האחרונים של המשרד; שורת מצב עם «תזכורת» | מרכז הביצוע כבר מסנן לפי `requestId`+`kind` — נוסיף סינון `kind==='ni_approve'` |
| `scripts/deploy-edge-function.mjs` | סקריפט | `node scripts/deploy-edge-function.mjs <staging\|prod> send-onboarding-email` | הפריסה — קודם staging |
| שולח | `profiles.communication.senderEmail` ⇒ אחרת `onboarding@resend.dev`; `replyTo` מהפרופיל | אותו שולח לכל המיילים | אין שינוי |

**מה אין:** אין מנגנון שליחה לכתובת שרירותית מהדפדפן (בכוונה — `send-step-email` מתעלם מכתובת בגוף
הבקשה: «דפדפן שנפרץ לא יכול להסיט מייל של לקוח»). `intake` הוא החריג היחיד, וגם הוא מקבל `email`
רק כברירה עליונה. אנחנו הולכים עם המחמיר.

---

## 2 · מה נשלח היום לביטוח לאומי — ומה אפשר למחזר

### 2.1 המסלול החי: `'signature'`
`RepresentationExecutionCenter.handleSendAll` שולח `stage:'sign'` לכל חותם ממתין. בשרת, כשלבקשה יש
אסמכתא: `sign_with_ni` — שני כרטיסי פעולה ממוספרים (חתימה + אישור ב"ל), ו-`niKey` נבחר לפי
`signer.role` (בן/בת זוג ⇒ `nationalInsuranceSpouse`). אחרי הצלחה, הדפדפן חותם
`instructionsSentAt` + `instructionsSentWith:'signature'` על כל מסלול שיש לו אסמכתא.

‼ שני שערים שמסבירים את כל העיצוב: (א) אין `sign` בלי אסמכתא כשב"ל התבקש (`ni_reference_missing`);
(ב) אין כפתור שליחה ב-`NiTrack` — «שליחה נפרדת גורמת למבוטח לקבל שני מיילים על אותו תהליך».
שני השערים נכונים לתהליך הרגיל. **הם לא חלים** על בן/בת זוג שנוסף/ה אחרי שמייל החתימה כבר יצא —
לו/לה **אין** מייל חתימה (אין חותם, אין 2279), ולכן ההוראות העצמאיות הן המסלול היחיד, לא פיצול.

### 2.2 התבנית העצמאית: `'ni_approve'` (רדומה)
`send-onboarding-email/index.ts:70-75, 321-325`:

| חלק | תוכן |
|---|---|
| נושא | «פעולה נדרשת - אישור ייפוי הכוח בביטוח הלאומי» |
| כותרת | «נשאר צעד אחד בביטוח הלאומי, {שם פרטי}» |
| גוף | «הזנו עבורכם את ייפוי הכוח באתר הביטוח הלאומי. הביטוח הלאומי דורש שאתם תאשרו אותו בעצמכם…» |
| בלוק `niCardInner` | האסמכתא ב-40px, «⏳ יש לאשר עד {מועד}», א. באתר (קישור ישיר ל-`IshurIpuyKoachInfo.aspx`), ב. בטלפון 02-5393740 |
| CTA | «לאישור באתר הביטוח הלאומי» → אתר ב"ל |
| כותרת תחתונה | «אישור מול הביטוח הלאומי · כדקה» |
| קבצים מצורפים / קישור לדף האישי | **אין** — בכוונה (אתר חיצוני עם אסמכתא; ראה הערת «הקישור האחיד» בקוד) |

**הפערים לבן/בת זוג, וכולם בשרת:**
1. `niKey` — נקבע `nationalInsuranceSpouse` רק ב-`stage==='sign' && signerId`. ל-`ni_approve` תמיד הנישום.
2. `toEmail = reqRow.client_email` — תמיד הנישום.
3. `clientFirst` מ-`reqRow.client_name` — הפנייה בשם הנישום.
4. אין `idempotency_key` ואין חתימת `instructionsSentAt` — הענף מעולם לא חובר לתהליך.
5. `logClientId/logRequestId` תקינים כבר — השורה תופיע ביומן הלקוח ובכרטיס.

אין תבנית ב"ל אחרת. `NiApprovalNotice.tsx` הוא אותו תוכן במסך שאחרי החתימה — לא מייל.

---

## 3 · המייל של בן/בת הזוג — מקור האמת

| מקור | מי כותב | מה הוא |
|---|---|---|
| `clients.spouse_email` (`Client.spouseEmail`) | `submit_onboarding_full` (הלקוח ממלא, 113/148), `spouse_fill` (149), `PersonalContactsTab` (הרו"ח עורך), `seedClientFromEmbeddedSpouse` (150) | **הבית הקבוע** — מיגרציה 113: «כתובת שנאספה פעם אחת נקברה בבקשת ייצוג ישנה במקום לשבת בכרטיס לצד השם והת"ז» |
| `representation_requests.signers[role=spouse].email` | `RepresentationOnboardingDialog` (הרו"ח בהקמה), `signing-session.invite_spouse` (הנישום בשלב החתימה, `emailSource:'client'`) | **צילום לצורך החתימה.** 113 במפורש: «מה לא נגע: signers». אינו מסונכרן חזרה לכרטיס |
| `spouseClient.email` (כרטיס מקושר, 150) | הכרטיס של האדם עצמו | מקור האמת של אדם עם כרטיס — **מחוץ לתחום כאן**: `niEditable` שקר ⇒ אין «בקש ייצוג» ואין «שלח» מהכרטיס הזה בכלל |

`PersonQuickView.tsx:127` מציג את שני הראשונים זה מול זה כשורת השוואה — הם **יכולים** להיות שונים.

**הכרעה:** הנמען של ההוראות העצמאיות הוא `clients.spouse_email`, נפתר **בשרת**. הדיאלוג ממלא מראש
מהכרטיס; אם ריק — מציע את `signers[spouse].email` כברירת מילוי (עדיין נכתב לכרטיס לפני השליחה);
אם גם זה ריק — שדה ריק וחובה. עריכה בדיאלוג = `updateClient({spouseEmail})` רגיל (פרט קשר, לא עובדה
מנוהלת — אותו מסלול של `PersonalContactsTab`), **לפני** קריאת השליחה. לא נוגעים ב-`signers`.

---

## 4 · `instructionsSentWith:'standalone'` — מה זה אומר היום

`types/index.ts:1094-1095`: «איך הן הגיעו: יחד עם בקשת החתימה (רצוי), או במייל נפרד (השלמה בדיעבד)».

| | `'signature'` | `'standalone'` |
|---|---|---|
| כותב | `handleSendAll` (`ExecutionCenter:319-322`) בלבד | **אף אחד** |
| קורא | `NiTrack` שלב 3: `sentWithSignature` ⇒ «נכללו במייל בקשת החתימה - מייל אחד לשתי הפעולות» | `NiTrack` שלב 3: `instructionsSentAt` בלי `'signature'` ⇒ «נשלחו בנפרד ב-{תאריך}» — **הקורא כבר מוכן** |
| ספירת שלבים | `!!ni.instructionsSentAt` — אדיש לערך | זהה |
| בדיקות | `__TestExecutionCenter` — `'signature'` בלבד | אין |

הסמנטיקה המיועדת היא בדיוק שלנו: ההוראות יצאו במייל משלהן, אחרי ובנפרד מהחתימה. אין כותב רדום
ואין קוד חצי-בנוי — רק הטיפוס והקורא. הכותב היחיד שנכון להוסיף הוא **בשרת**, אחרי Resend.

---

## 5 · מחזור החיים המומלץ: לחיצה → הזנה → מייל

### 5.1 למה לא A ולא B כפי שנוסחו
- **A (דיאלוג מייל לפני יצירת ה-target)** — אין מה לשלוח: בלי אסמכתא המייל ריק מפעולה, השרת דוחה,
  והמייל היחיד האפשרי היה «נעדכן בהמשך» — ואז מייל שני עם האסמכתא. זה בדיוק הפיצול שהקוד הקיים
  נלחם בו («עדיף להיכשל מאשר לפצל את התהליך»).
- **B (target קודם, ואז «שלח» מיד)** — נכון בחצי הראשון, אבל «שלח מיד» נתקל באותו קיר.

### 5.2 C — הצעד השלישי נקשר לאסמכתא, לא ללחיצה
```
[1] «בקש ייצוג» (כרטיס ב"ל / דורש טיפול)
     → ConfirmDialog: «להוסיף את {שם} לייצוג בביטוח לאומי? ייפתח מסלול נפרד…»
     → handleAddNiTarget(clientId,'spouse')                 ← קיים, אידמפוטנטי
     → מצב: התבקש · נדרשת הזנה בפורטל ב״ל
[2] מרכז הביצוג → NiTrack «ב״ל - {שם}» → שלב 1 «סמן כהוזן», שלב 2 אסמכתא + מועד
     → מצב: הוזן · אסמכתא 73882698 · יש לשלוח הוראות אישור
[3] «שלח הוראות אישור ל-{שם}»  (NiTrack שלב 3 · וגם בדגל «דורש טיפול» · וגם בשורת «ייצוג» בכרטיס)
     → NiInstructionsDialog: זהות (שם · ת.ז. ממוסך) · אסמכתא · מועד · שדה מייל (ממולא מהכרטיס, ניתן לעריכה)
     → [המשך] → אם המייל שונה/חדש: updateClient({spouseEmail})
     → EmailPreviewDialog { requestId, stage:'ni_approve', niRole:'spouse' }   ← תצוגה מקדימה אמיתית מהשרת
     → [שלח] → השרת: Resend → 200 → יומן → חותם execution.nationalInsuranceSpouse.instructionsSentAt/With:'standalone'
     → מצב: נשלח ל-{email} · ממתינים לאישור {שם}
[4] המבוטח/ת מאשר/ת → «סמן כאושר» → confirmedAt → handleSaveExecution → ייצוג פעיל   ← קיים
```

‼ **מה לא משתנה:** `handleAddNiTarget`, `handleSaveExecution`, `handleSendAll`, השער `ni_reference_missing`,
ההיעדר של כפתור שליחה ב-`NiTrack` **כשמייל החתימה עוד לא יצא**. הכפתור החדש מופיע רק כשההוראות
לא יכולות לרכב על החתימה: `!sentWithSignature && referenceNumber && !instructionsSentAt &&
(exec.signatureEmailSentAt || אין חותם ממתין לתפקיד הזה)`.

### 5.3 כישלון וניסיון חוזר
| מצב | מה קורה | מה המשתמש רואה |
|---|---|---|
| Resend נכשל | שורת `failed` ביומן (בלי מפתח ייחודי — כמו `onboard`), `502 resend_failed`, **המסלול לא נחתם** | שגיאה בדיאלוג; הכפתור נשאר; שורת «נכשל» ברשימת המיילים |
| אין מייל בכרטיס | `400 no_spouse_email` (לא מגיעים לשם — הדיאלוג חוסם) | שדה חובה |
| אין אסמכתא | `400 missing_reference_number` (לא מגיעים — הכפתור לא מוצג) | — |
| כבר נשלח, בלי `force` | `{ok:true, alreadySent:true}` — לא שולח | — (שער כפילות שרת) |
| «שלח שוב» | `force:true` ⇒ שולח, שורה חדשה `r2`, `instructionsSentAt` **הראשון נשמר** | שתי שורות ביומן, «נשלחו בנפרד ב-{ראשון}» |
| הוקפץ (webhook) | `status:'bounced'` על השורה | «הוקפץ» + «שלח שוב» (מסלול `EmailStatusRow` הקיים) |
| לחיצה כפולה מהירה | UI: הכפתור נעול בזמן שליחה; `EmailPreviewDialog` מופע יחיד | — |

**על תביעה אטומית לפני השליחה:** `onboard` תובע (`representation_sent_at`) **לפני** Resend ומשחרר
בכישלון — דפוס מוכח (AT-3b). כאן הדרישה המפורשת היא «נשלח נכתב רק אחרי שליחה אמיתית», ולכן:
חותמים **אחרי** 200, ושער הכפילות הוא `alreadySent` + נעילת UI. החלון של שתי קריאות באותה שנייה
נשאר — זהה בדיוק ל-`sign` היום. אם גיא רוצה אפס-כפילות מוכח, החלופה היא תביעה על
`execution` עם `where …->>'instructionsSentAt' is null` ושחרור בכישלון — אותו קוד, סדר הפוך.

---

## 6 · המצבים המדויקים במשטח הבקשות («דורש טיפול») ובשורת «ייצוג»

אותו רזולבר לשניהם (`niRepresentationOf` + `niRepresentationAction`) — הדגל והשורה לא יסתרו זה את זה.

| # | ראיה | שורת «ייצוג» (`v · detail`) | דגל «דורש טיפול» — כותרת / למה | פעולה |
|---|---|---|---|---|
| 0 | אין target, אין תיק/תיק `none`, יש בקשה ללקוח | «אין ייצוג» | «{שם} אינו/ה מיוצג/ת בביטוח לאומי» / «הייצוג בביטוח לאומי הוא לכל אדם בנפרד — עדיין לא התבקש עבור {שם}.» | **בקש ייצוג** (`add`) |
| 1 | target/תיק `pending`, מסלול ריק | «בתהליך · טרם הוזן בביטוח לאומי» | «ייצוג בביטוח לאומי — {שם}» / «התבקש · נדרשת הזנה ידנית בפורטל ביטוח לאומי.» | **המשך במרכז הייצוג** (`continue`) |
| 2 | `enteredAt` בלי אסמכתא | «בתהליך · הוזן בביטוח לאומי · ממתין לאסמכתא» | … / «הוזן בפורטל — יש להזין את מספר האסמכתא.» | `continue` |
| **3** | `referenceNumber` בלי `instructionsSentAt` | «בתהליך · אסמכתא {מס׳}{ · עד {מועד}} · **יש לשלוח הוראות אישור**» | «ייצוג בביטוח לאומי — {שם}» / «**נדרש לשלוח בקשת ייצוג** — האסמכתא מוכנה, המבוטח/ת טרם קיבל/ה אותה.» | **שלח הוראות ל-{שם}** (`send`) — חדש |
| **4** | `instructionsSentAt` (`standalone`) | «בתהליך · **נשלח ל-{email}** · ממתינים לאישור {שם}» | «ייצוג בביטוח לאומי — {שם}» / «**נשלח ל-{email} · ממתינים לטיפול** {· נמסר / נפתח / הוקפץ}» | `continue` (+ «שלח שוב» במרכז הביצוע) |
| 4′ | `instructionsSentWith:'signature'` | «בתהליך · נשלח עם בקשת החתימה · ממתינים לאישור» | כנ"ל | `continue` |
| 5 | `confirmedAt` / תיק `active` | «ייצוג פעיל» | — (הדגל נעלם) | — |
| — | `spouseRepresentedElsewhere` / מקושר / בלי ת.ז. | «מיוצג/ת אצל רו״ח אחר» / דרך הכרטיס השני / «—» | — | — |

הניסוח של גיא («נדרש לשלוח בקשת ייצוג» ⇒ «נשלח ל-… · ממתינים לטיפול») נשמר — רק **מיקומו** זז
למצב 3→4, כי לפני האסמכתא אין מה לשלוח. מצב הכתובת (`{email}`) והמסירה (נמסר/נפתח/הוקפץ) נקראים
מ-`email_messages` (`request_id` + `kind:'ni_approve'` + `meta.niRole`), לא מהמסלול — כדי שהדגל
יגיד את האמת גם אם המייל הוקפץ.

---

## 7 · מקרי קצה

| מקרה | התנהגות |
|---|---|
| יש `spouseEmail` | ממולא מראש; «המשך» בלי שינוי לא כותב לכרטיס |
| אין `spouseEmail`, יש חותם בן/בת זוג עם מייל | הצעת מילוי מ-`signers[spouse].email`; בשליחה נכתב לכרטיס (הבית הקבוע) |
| אין אף כתובת | שדה חובה; אין «שלח» בלי כתובת. ‼ לא מוסיפים «נמסר ידנית» — זו הצהרה על שליחה שלא קרתה; הרו"ח שמסר בטלפון ממשיך ישר ל«סמן כאושר» כשהאישור נקלט |
| `spouseClientId` עם מייל אחר | `niEditable` שקר ⇒ אין «בקש ייצוג», אין «שלח» מהכרטיס הזה. ההוראות לאדם עם כרטיס יוצאות מהבקשה **שלו/ה**, מאותו מנגנון (`niRole:'client'` על הבקשה שלו/ה) — לא במהלך הזה |
| מייל לא תקין | `isValidEmail` (`utils/email.ts`) בדיאלוג; השרת בודק שוב (`bad_email`) |
| Resend נכשל | §5.3 — שום דבר לא נחתם |
| «שלח שוב» | `force:true`; שורה `r2`; החותמת הראשונה נשמרת; הכתובת נקראת מחדש מהכרטיס |
| הכתובת שונתה אחרי שליחה ראשונה | הדיאלוג ממלא מהכרטיס (הכתובת החדשה); השליחה החוזרת יוצאת אליה; השורה הישנה נשארת עם הכתובת הישנה (היסטוריה) |
| כבר יש מסלול פעיל/ממתין לבן/בת הזוג | `handleAddNiTarget` — כבר אידמפוטנטי; «שלח» מוצג רק במצב 3; `alreadySent` בשרת |
| בן/בת הזוג הוא/היא **חותם/ת** בבקשה שעוד לא נשלחה לחתימה | **אין** כפתור עצמאי — ההוראות ירכבו על מייל החתימה (`'signature'`), כמו היום |
| הנישום עצמו בלי הוראות (בקשה שנחתמה לפני שב"ל נוסף — המקרה של גיא/דין) | אותו מנגנון עם `niRole:'client'`: הנמען `reqRow.client_email`, המסלול `nationalInsurance`. עלות: אפס — זו ברירת המחדל של הענף הקיים |
| target/track/שליחה כפולים | target — `targetsOf` בדיקה; track — `if (!req.execution?.[key])`; שליחה — `alreadySent` + `force` + נעילת UI |

---

## 8 · שינויי סכימה / API

**סכימה: אפס. מיגרציה: אפס.** (`execution` jsonb, `email_messages.meta` jsonb, `clients.spouse_email` — הכול קיים.)

**Edge function — `send-onboarding-email`** (פריסה: `node scripts/deploy-edge-function.mjs staging send-onboarding-email`, ואז `prod`):
- גוף בקשה: `niRole?: 'client' | 'spouse'` — נקרא **רק** כש-`stage==='ni_approve'`; ברירת מחדל `'client'` (התנהגות הענף הקיים, ללא שינוי).
- `niRole==='spouse'` ⇒ `niKey='nationalInsuranceSpouse'`; `toEmail` מ-`clients.spouse_email` של `linked_client_id` (‼ לא מהגוף); ריק ⇒ `400 no_spouse_email`; `clientFirst` מ-`spouse_first_name` ⇒ אחרת המילה הראשונה של `spouse_name`.
- שער כפילות: `execution[niKey].instructionsSentAt` קיים ו-`!force` ⇒ `{ok:true, alreadySent:true}` בלי שליחה.
- מפתח ייחודי: `ni_approve:<requestId>:<niRole>` לשליחה ראשונה; `…:r<n>` ל-`force` (ספירה מ-`email_messages`, כמו `onboard`).
- אחרי 200 מ-Resend ורישום היומן (`kind:'ni_approve'`, `meta:{niRole}`): `update representation_requests set execution = jsonb_set(execution, '{<niKey>,instructionsSentAt}', now) || instructionsSentWith:'standalone'` — **רק אם עדיין ריק** (שליחה חוזרת לא דורסת). מחזיר `{ok, id, logged, stamped: boolean}`.
- `preview:true` — ללא שינוי (מחזיר HTML, לא כותב).

**צד לקוח:**
- `utils/niPersons.ts` — `niRepresentationOf`: פירוט למצבים 3/4/4′ (§6); `NiRepresentationAction.kind` מקבל `'send'` (תווית «שלח הוראות אישור»); תנאי `'send'`: `niEditable && referenceNumber && !instructionsSentAt && !sentWithSignature`. ‼ הרזולבר נשאר טהור — מצב המסירה (§6, `{email}`/נמסר) מגיע כפרמטר אופציונלי `niEmails?: EmailMessage[]` ולא מ-hook.
- `utils/authorityFlags.ts` — `niSpouseRepresentationFlag`: `why` לפי §6; `niAction` עובר כמו היום.
- `components/NiInstructionsDialog.tsx` (חדש, קטן) — זהות + אסמכתא + מועד + `EmailInput`; «המשך» ⇒ `updateClient` אם השתנה ⇒ פותח `EmailPreviewDialog` עם `{requestId, stage:'ni_approve', niRole}`; `onSent` ⇒ `reloadRequests` (המסלול נחתם בשרת — הדפדפן רק קורא מחדש).
- `RepresentationExecutionCenter.tsx` — `NiTrack` שלב 3: כפתור «שלח הוראות אישור» בתנאי §5.2; רשימת `niEmails = messages.filter(requestId && kind==='ni_approve' && meta.niRole===role)` עם `EmailStatusRow` (+ «שלח שוב» = `force`). ההערה «אין כאן כפתור שליחה» מתעדכנת: *אין כפתור כשהחתימה עוד לפנינו*.
- `TaxFileTab.tsx` — פרופ חדש `onSendNiInstructions?(role)`; בדגל ובשורת «ייצוג»: `kind==='send'` ⇒ פותח את הדיאלוג. `App.tsx`/`ClientWorkspace.tsx` — חיווט הפרופ + `niEmails` (מ-`useEmailMessages` שכבר קיים ב-App? — אם לא, `useClientActivity` כבר שולף `email_messages` לפי `client_id`; להעדיף מקור אחד).
- `types/emailActivity.ts` — ללא שינוי (`ni_approve` כבר מתויג).
- `docs/LIFECYCLE-IMPLEMENTATION-PLAN.md:44` — למחוק את סימון «ענף מת» (הערה בלבד).

---

## 9 · תוכנית מימוש ל-Sonnet

גדרות: אין סכימה, אין בקשה שנייה, אין נגיעה ב-`handleSendAll`/`handleAddNiTarget`/`handleSaveExecution`;
הנמען נפתר בשרת; «נשלח» נכתב רק אחרי 200; עברית בלבד; הוקים ב-`TaxFileTab` לפני כל `return` מותנה
(`hooks-after-institution-focus-return`).

1. **שרת קודם** — `send-onboarding-email`: `niRole`, נמען מהכרטיס, שער `alreadySent`, מפתח ייחודי, חתימת `execution` אחרי הצלחה. לפרוס ל-**staging**. לאמת ב-`curl`/סקריפט: `preview` מחזיר את שם בן/בת הזוג ואת האסמכתא של המסלול הנכון; שליחה ל-`delivered@resend.dev` (‼ מפתח Resend של staging פג — `staging-resend-key-invalid` — ולכן שם מאמתים רק את `failed` + אי-חתימה; ההצלחה מאומתת בפרודקשן על חשבון ה-E2E, `qa-e2e-sandbox-account`, עם `delivered@resend.dev`).
2. **בדיקת רגרסיה לשרת** — הרחבת `scripts/staging-test-email-policy.mjs` בשלוש טענות: `ni_approve` בלי `niRole` ⇒ הנישום (כמו קודם); `niRole:'spouse'` בלי `spouse_email` ⇒ `no_spouse_email`, `execution` לא זז; `alreadySent` כשיש חותמת ו-`!force`.
3. **`niPersons.ts`** — `'send'` + פירוטי §6 + פרמטר `niEmails`. בדיקות טהורות בפיקסצ'רים של `__TestTaxFileV6` (`COUPLE_REP_ENTERED`, `COUPLE_REP_SENT`, `COUPLE_REP_BOUNCED`).
4. **`authorityFlags.ts`** — ניסוחי §6.
5. **`NiInstructionsDialog.tsx`** — `Modal` + `EmailInput` + `isValidEmail`; «המשך» ⇒ `updateClient` בתנאי ⇒ `EmailPreviewDialog`.
6. **`RepresentationExecutionCenter.tsx`** — כפתור בשלב 3 + שורות `ni_approve` + «שלח שוב». `__TestExecutionCenter`: מקרה `spouse-standalone-ready` (אסמכתא, בלי חותם, `signatureEmailSentAt` קיים) ו-`spouse-standalone-sent`.
7. **חיווט** — `App`/`ClientWorkspace`/`TaxFileTab` (`onSendNiInstructions`, `niEmails`).
8. **QA בדפדפן** (harness `?test-taxfile&case=…` + מרכז ביצוע): מצב 3 מציג את הכפתור בשלושת המשטחים; הדיאלוג ממולא מ-`spouseEmail`; עריכה כותבת לכרטיס (להצליב במסד); תצוגה מקדימה מציגה את שם בן/בת הזוג ואת **האסמכתא שלו/ה** (לא של הנישום); שליחה ⇒ שורת `ni_approve` + חותמת `standalone` ⇒ מצב 4 בשלושת המשטחים ⇒ `RepresentationNextStep` «ממתינים לאישור: בן/בת הזוג»; כישלון מדומה (מייל לא תקין בצד השרת) ⇒ אין חותמת; «שלח שוב» ⇒ שורה שנייה, חותמת לא זזה; לקוח לא-נשוי ו-`single-ni` — ללא שינוי; מובייל 375; אפס שגיאות קונסולה.
9. **פריסה** — `deploy-edge-function.mjs prod send-onboarding-email` **לפני** ה-push של הקוד (הדפדפן הישן לא שולח `niRole` ⇒ השרת החדש מתנהג כמו הישן; להפך היה שובר).

**סיכוני רגרסיה לבדוק במפורש:** `ni_approve` בלי `niRole` זהה לפני/אחרי (הענף רדום, אבל בטוח);
`sign`/`sign_with_ni` לא נגעו; השער `ni_reference_missing` במקומו; אין כפתור עצמאי כשמייל החתימה
עוד לא יצא; `updateClient({spouseEmail})` לא מפעיל שום טריגר ייצוג (זה פרט קשר).

---

## 10 · מה נשאר להכרעת גיא (לא נפתר בקוד)

1. **תביעה לפני או חתימה אחרי** (§5.3) — הומלץ «אחרי», עם החלופה מפורטת.
2. **מייל «בקרוב» ברגע «בקש ייצוג»** — הומלץ **לא** (פיצול, בלי פעולה). אם בכל זאת: stage חדש `ni_notice`, בלי אסמכתא, בלי חתימת `instructionsSentAt` — הוא **אינו** ההוראות.
3. **«נמסר ידנית»** לבן/בת זוג בלי כתובת — הומלץ לא לסמן שליחה שלא קרתה; «סמן כאושר» נשאר הסיום.
