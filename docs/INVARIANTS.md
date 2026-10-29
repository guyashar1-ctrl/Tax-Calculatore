# כללים חוצי-מסכים — רשימה מחייבת

נוצר 21.10.2026 אחרי המקרה של ליאת ואוריה ברנשטיין: שינוי במסך אחד (269 — הסרת השער «מי רשום» לפני ההזנה בשע״ם) שבר בשקט כלל שחי בקובץ אחר (218 — מי חותם/ת ב«בן זוג רשום»). הכלל לא היה כתוב בשום מקום, ולכן אף אחד לא חיפש אותו.

**מה נכנס לכאן:** רק כללים עסקיים שחוצים קבצים או שכבות (מסך ↔ שרת ↔ עובד) — לא כל הערה ‼ בקוד. היעד: 20–40 כללים.

**איך משתמשים:**
- **לפני שמשנים או מסירים כלל, שער או ברירת מחדל:** מריצים `node scripts/who-depends.mjs <מונח>` על מה שמשתנה, ומדביקים את הפלט בהצעה ובקומיט תחת «כלל קיים שמשתנה» (WORKING-AGREEMENT §4א).
- **כלל שנפגע:** מעדכנים כאן באותו קומיט — הכלל, איפה הוא חי, ואיזו בדיקה מוכיחה אותו.
- **כלל עם «בדיקה חיה»:** נבדק בנתונים האמיתיים ב-`scripts/prod-invariants-check.mjs` (קריאה בלבד). זה רץ לפני כל push, ואחרי כל מיגרציה בייצור.

תבנית: **מזהה · הכלל במשפט אחד** · היכן בקוד · היכן ב-SQL · מי צורך · מה מוכיח.

---

## ייצוג — שע״ם, בן/בת הזוג הרשום/ה, חתימות

### INV-REP-01 · הרשום/ה במס הכנסה: ראיה משע״ם > הכרעה מאומתת בכרטיס > מי שהוזן/ה
- **הכלל:** מי בן/בת הזוג הרשום/ה נקבע לפי הראיה משע״ם (המשפט «הוחלף מספר התיק» בהודעת היצירה). אם אין ראיה, לפי ההכרעה המאומתת בכרטיס (`registered_spouse_verified` + הבעלים של תיק מ"ה). אחרת, מי שהוזן/ה. כל למידה נרשמת ב«פעילות».
- **קוד:** `features/annualReport/profile.ts` (`registeredOwnerOf`), `RepresentationExecutionCenter.tsx` (`confirmRegistered`, `regAuto`).
- **SQL:** `_rep_shaam_registered_from_notice`, `_rep_registered_signer`, `_rep_learn_registered_spouse` (271/274).
- **מי צורך:** מקומות החתימה (INV-REP-02), `shaamSpouseConfirmation.ts` (אישור חתימת בן/בת הזוג בשידור), `_rep_approval_people` (במסלול לפני שנפתחה בקשה).
- **מוכיח:** `staging-test-registered-271.mjs` (R1–R6).

### INV-REP-02 · ב«חתימת בן זוג רשום» (טופס 2279) חותם/ת הרשום/ה — לא בהכרח מי שהוזן/ה
- **הכלל:** אצל זוג, בהגשה שנושאת מס הכנסה, התיבה האמצעית (x≈0.393) שייכת לרשום/ה, והשמאלית (x≈0.130) לבן/בת הזוג השני/ה.
- **SQL:** `_rep_prepare_signature_document` → `_rep_build_2279_fields(_rep_registered_signer(...))` (218 + 271).
- **קוד:** `shaamSpouseConfirmation.ts` (השידור לשע״ם בודק את אותו כלל ועוצר אם הוא מופר).
- **מוכיח:** `staging-test-registered-271.mjs` (R2, R4) · **בדיקה חיה:** `prod-invariants-check` INV-REP-02.

### INV-REP-03 · אחרי שבקשה עם מס הכנסה נפתחה בשע״ם — מס הכנסה נשאר בה
- **הכלל:** הכרעה מאוחרת לגבי מי רשום/ה לא מפצלת את מס הכנסה להגשה חדשה ולא מציעה בקשה שנייה. הנעילה חלה גם על סימון «הוזן ידנית» שנשמר עם המערכים שלו (מ-274).
- **קוד:** `submissionItOwner` (`features/representation/repPreparation.ts`). כל קריאה ל-`shaamSubmissions` עוברת דרכו (מרכז הייצוג, נתוני רשות, סקירת בקשה, `repSubmissions`).
- **SQL:** `_rep_approval_people` — אחרי ההגשה נשען על המעקב (`execution.shaam`), לא על הכרטיס.
- **מוכיח:** `runAll.test.ts` (271/274), `staging-test-registered-271.mjs` (R7) · **בדיקה חיה:** INV-REP-03.
- ‼ **פתוח:** סימון ידני ישן (לפני 274, בלי מערכים) עדיין נופל להכרעה בכרטיס.

### INV-REP-04 · בקשת הייצוג מבקשת תעודה מזהה אחת לאדם; רישיון של עסק חדש — ב«מסמכים מהלקוח»
- **קוד:** `utils/identityEvidence.ts` (`identityRequirements`).
- **SQL:** `ensure_identity_document_requests` (בלי ערכת עסק חדש, 269), `generate_onboarding_steps` (פריט `drivers_license` לעסק חדש), `sync_identity_docs_to_client_documents` (סוגר את הפריט כשהגיע).
- **מוכיח:** `newBusinessTrack.test.ts`, `staging-test-new-business-234.mjs` (N1, N6, N8, N9).

### INV-REP-05 · ב״ל — «עבור מי» = `targets`; בן/בת זוג רק אצל נשוי/אה או כשהמסלול כבר התחיל
- **קוד:** `utils/repScope.ts` (`targetsOf`), `features/representation/runAllPlan.ts`, מרכז הייצוג (`niTargetsSpouse`).
- **SQL:** `ni_targets_of` (212).
- ‼ **מימוש כפול** (TS + SQL) בלי בדיקת התאמה ביניהם — שינוי באחד מחייב את השני.

### INV-REP-06 · מחיקת בקשת ייצוג סוגרת את השורות הפתוחות שלה ב«בקשות» — ולא נוגעת ברשות
- **הכלל:** מוחקים בקשת ייצוג רק דרך `delete_representation_request` (294), ולא ב-delete ישיר. באותה פעולה נסגרות מיד (`cancelled`) השורות הפתוחות שמצביעות עליה (`representationRequestId` / `shaamIdentity.requestId` / `requestId`), וגם «בקשת ייצוג» ו«זירוז אישור», אם לא נשארה לכרטיס בקשה אחרת. שורה שהושלמה נשארת היסטוריה. שום דבר לא מבוטל אצל הרשות.
- **קוד:** `useRepresentationRequests.deleteRequest`, `App.handleDeleteRequest` (קודם השרת, אחריו הקבצים). רשת ביטחון: `OnboardingTab.removalKindOf` — «בקשת ייצוג» בלי `representationRequestId` בכרטיס מקבלת הסרה רגילה ב-⋯.
- **מוכיח:** `scripts/sql/test-294-delete-representation-request.sql` (D.1–D.5, ב-staging).

### INV-REP-07 · ב״ל לכל אדם עם אסמכתא = שורה ב«בקשות»; בן/בת זוג בלי מייל — דרך הדף, ו«נשלח» רק ממייל שנשא את האסמכתא
- **הכלל:** אסמכתא בביצוע (`execution.nationalInsurance[Spouse].referenceNumber`) פותחת שלב «ייצוג ברשות» לאדם שברשימת ב״ל, אם אין לו שלב פתוח (זהות: כרטיס + סוג + רשות + נושא) — גם בקליטה ראשונה (296). מי שכבר אישר — לא נפתח. בן/בת זוג בלי מייל משלו: האישור מופיע בדף של בעל הכרטיס («מה צריך מ{שם}»), נכלל במייל הדף ולא בקבוצה נפרדת שדורשת כתובת; `instructionsSentAt` נרשם לו/ה רק כשמייל דף שנשלח נשא את הפריט ואת מספר האסמכתא שלו/ה (`instructionsSentWith='page'`). הכרעת גיא 25.10.2026.
- **SQL:** `_ensure_ni_steps_from_execution` (מהטריגר `tg_sync_authority_rep_from_execution`), `_ni_spouse_page_ready`, `_ni_mark_page_delivered` (מ-`complete_client_notice`), ההזרקות ב-`_portal_step_items`, `_client_announceable_steps`, `client_ready_to_send`.
- **קוד:** `authRepRowModel.viaPage` + `niViaPage` ב-`OnboardingTab` (אותו תנאי: `spouse` ו-`spouseEmail` ריק), הכרטיס «מה צריך מ…» ב-`send-process-open-email`.
- **מוכיח:** `scripts/test-296-ni-spouse-page.mjs` (22 בדיקות), `scripts/staging-test-296-ni-page-email.mjs` (מקצה לקצה, מסלול בדיקה), `requestsLaneRound5.test.ts` (296).

### INV-REP-08 · «אישרתי» בב״ל מהדף = הצהרה + בדיקה, לא סגירה
- **הכלל:** «אישרתי» בכרטיס ב״ל בדף (גם «{שם} אישר/ה» לבן/בת הזוג) רושם `clientDeclaredAt` על הבקשה של אותו אדם, שורה ביומן, ומכניס בדיקת ב״ל (קריאה בלבד) לתור — או «המשך» אחרי בדיקה פתוחה של האדם השני. הבקשה **לא** נסגרת מההצהרה; רק אישור שהבדיקה מצאה (`confirmedAt`) סוגר. בדיקה שרצה אחרי ההצהרה ולא מצאה ⇒ בדף «עוד לא רואים», במשרד אדום. לחיצה חוזרת בתוך 2 דקות לא מוסיפה בדיקה. הכרעת גיא 25.10.2026.
- **SQL:** `_portal_ni_declare` (299, לא חשופה ל-anon), ההזרקות ב-`portal_submit_step` וב-`_portal_step_items` (`actionKind/actionValue/declaredAt/declareState`).
- **קוד:** `NiApprovalBlock` ב-`PublicPortalPage` (הכפתור רק כשהשרת שלח `actionValue`), `niLinePersons` ב-`OnboardingTab`.
- **מוכיח:** `scripts/test-299-ni-client-declared.mjs` (16 בדיקות).

## אוטומציה — משימות מול רשויות

### INV-AUTO-01 · פעולה משנה ברשות: ניסיון אחד; «המשך» נכנס לתור רק כשהקודמת הסתיימה (לא מ«ממתין לך»)
- **SQL:** `create_automation_job` (max_attempts=1 לפעולה משנה, 196), `automation_job_followups` + `_release_automation_job_followups` / `_repoint_automation_job_followups` (270).
- **מוכיח:** `staging-test-job-followups-270.mjs` (F1–F9) · **בדיקה חיה:** INV-AUTO-01.

### INV-AUTO-02 · לחיצה חוזרת לא שולחת שוב מי שבדרך או שכבר הוזן/ה
- **קוד:** `runAllRows` / `runnableRows` (המצב נגזר מהמשימות בשרת, ונבדק שוב רגע לפני השליחה).
- **SQL:** `create_automation_job_after` מחזיר משימה פתוחה קיימת לאותו אדם (272).
- **מוכיח:** `runAll.test.ts`, F9 · **בדיקה חיה:** INV-AUTO-02.

### INV-AUTO-04 · פעולה שממתינה מאחורי «פתיחה» לא יוצאת כשהפתיחה נכשלה
- **הכלל:** משימה שנכנסה לתור מאחורי `shaam.ensure_capability` / `shaam.connect` / `btl.connect` (create_automation_job_after) משתחררת רק אם הפתיחה הצליחה; פתיחה שנכשלה ⇒ הממתינה `skipped` עם הסיבה, ולא נוצרת משימה שתיעצר על אותו מסך. שרשרת של שתי פעולות עצמאיות (בדיקת ב״ל של אדם ואז של השני) משתחררת גם בכישלון. ליאת, 26.10.2026.
- **SQL:** `_release_automation_job_followups` (301).
- **מוכיח:** `scripts/test-301-followup-after-failed-opening.mjs` (5 בדיקות).

### INV-AUTO-03 · קלט לעובד בהזנת ייצוג — ממקום אחד
- **קוד:** `features/representation/repAutomationInputs.ts`. הכפתור הבודד בשע״ם, הכפתור הבודד בב״ל ו«הפעל הכול» קוראים ממנו.

## הבדיקה היומית

### INV-OPS-01 · הכללים עם «בדיקה חיה» נבדקים כל יום, והפרה נראית ב«משימות»
- **SQL:** `pivo_invariant_violations()` (המקום היחיד של הבדיקות), `run_invariant_check()` — pg_cron `invariant-check-daily` ב-05:30 UTC; רישום ב-`invariant_check_runs`; הפרה ⇒ משימה דחופה אחת למשרד («בדיקת מערכת: …»), בלי מייל (282/283).
- **סקריפט:** `scripts/prod-invariants-check.mjs` קורא לאותה פונקציה (לפני כל push ואחרי מיגרציה).
- **מוכיח:** `staging-test-invariant-check-282.mjs` (D1–D4).

## בקשות — הדף האישי של הלקוח

### INV-REQ-01 · «טיוטה» במשרד = פריט בדף אחרי «פרסם בדף»
- **הכלל:** כל בקשה שהמשרד מסמן עליה «טיוטה» (ונספרת ב«N בקשות עוד לא בדף») מופיעה ב«איך זה ייראה», ואחרי הפרסום מופיעה בדף האמיתי של הלקוח. בקשה שהדף מציג רק במצב מסוים — הפרסום מביא אותה למצב הזה.
- **קוד:** `isDraftStep` + `portalShowsStep` (`types/onboarding.ts`, `OnboardingTab.tsx`), המגש `NoticeTray.tsx`.
- **SQL:** `_portal_step_items` (הענף של כל סוג), `build_client_portal` ('preview' / 'live'), `publish_case_changes`. «עדכון סטטוס מס»: הטריגר `onboarding_steps_intake_published_waits` — פורסם ⇒ `waiting_client` (276).
- **מי צורך:** `sync_intake_step_from_sessions` (פתיחה מחדש של שאלון שפורסם ⇒ ממתין ללקוח), `requestAttention.ts` (אצל מי הכדור).
- **מוכיח:** `staging-test-draft-reaches-page-276.mjs` (D1–D2 לכל סוג, Q1–Q2). (בלי בדיקה חיה: הטריגר מונע את המצב התקוע.)

### INV-REQ-03 · «הזנתי את הכרטיס» בפייפרלס = הצהרה של הלקוח; «הוזן» — רק המשרד
- **הכלל:** הלחיצה בדף רושמת `cardDeclaredAt` על שלב התשלום (גם כשהוא נעול — לפני בדיקת locked, ולשלב הזה בלבד), שורה ביומן ו-needs_attention; הכרטיס יורד ל«בטיפולנו». `cardEnteredAt` נכתב רק מ«הכרטיס נקלט ✓» במשרד (אין חיבור לפייפרלס). הסדר ידני — לא ניתן לסימון. גיא, 26.10.2026.
- **SQL:** `_portal_paperless_card_declare` (302, לא חשופה), ההפניה ב-`portal_submit_step`, הענפים ב-`_portal_step_items` (retainer_card).
- **קוד:** `stepAttention` (retainer_authorization ⇒ «לטיפולך»), `ConnectionBody` ו-`RetainerStepCard` ב-`OnboardingTab`.
- **מוכיח:** `scripts/test-302-paperless-card-declared.mjs` (11 בדיקות), `requestsLaneRound5.test.ts` (302).

### INV-REQ-02 · פייפרלס נפתח באישור ההצעה — גם בעסק חדש; רק החיבור לרשות המסים מחכה לפתיחת התיקים
- **הכלל:** הגבייה עוברת בפייפרלס (גיא, 23.10.2026), ולכן ההרשמה, החיבור והכרטיס לא מחכים לשום בקשה אחרת חוץ מהשרשרת של עצמם. «חיבור פייפרלס לרשות המסים» מחכה גם לחיבור וגם לפתיחת התיקים (מספרי הקצאה בלי תיק — אין). הסדר בדף ובמייל הראשון — פייפרלס ראשון — הוא נתון של המסלול (sortIndex), לא כלל בשרת.
- **SQL:** `generate_onboarding_steps` (בלי נעילה של `paperless_invite`, 289 §1), הטריגר `z_paperless_tax_authority_waits_for_files` (289 §2 — כל נתיבי היצירה, גם 132), `portal_lock_reason` (כל ההורים החוסמים).
- **קוד:** הטקסטים — `journeyDefaults.ts`, `FlowsPage.tsx` («בעסק חדש»), `businessSituation.ts`, `editModel.ts`. הסדר — `scripts/289-paperless-first-flow.mjs` (שמירה דרך `save_office_flow` עם `compileOnboarding`).
- **מי צורך:** `office_open_locked_step` («פתח עכשיו» מוחק את כל הקשתות), `requestGroups.ts` (מקבץ לפי סוג, לא לפי עמודת ההורה).
- **מוכיח:** `staging-test-new-business-234.mjs` (N1 — ההרשמה פתוחה; N2–N3 — שני הורים, נפתח רק כששניהם הושלמו, «פתח עכשיו»).

### INV-REQ-03 · מה שהושלם הוא היסטוריה — גם הייצוג, במשרד ובדף הלקוח; רק ייצוג פתוח ננעץ ראשון
- **הכלל:** קבוצה או בקשה שהושלמו כולן אינן תופסות מקום בין מה שפתוח (גיא, 19.10) — הן יורדות ל«הושלמו» בלשונית «בקשות» במשרד ול«מה שכבר סיימנו» בדף הלקוח. הייצוג ננעץ ראשון כל עוד יש בו משהו פתוח (23.10); כשהושלם — יורד כמו כל השאר (גיא: 24.10 בדף, 25.10 במשרד — «ככלל במערכת», לא תיקון למסך אחד). ב«הושלמו» הייצוג ראשון לפי `GROUP_ORDER`.
- **קוד:** `groupPinsFirst` (`features/requests/requestGroups.ts`) — המקום היחיד שמחליט מה ננעץ, לשני המשטחים. דף: `portalPinnedGroup` → `PortalView` (`PublicPortalPage.tsx`) — `DoneFold` (אותו רכיב לדף החי, לצפייה בספרייה ולתצוגה במשרד). משרד: `OnboardingTab.tsx` — `ordered` / `completedGroupNodes`. משטח חדש שמציג קבוצות — קורא ל-`groupPinsFirst`, לא `key === 'representation'`.
- **מוכיח:** `run-unit-tests.mjs requestGroups` («ייצוג פתוח ננעץ בראש; ייצוג שהושלם לא ננעץ» · «המשרד: אותו כלל»).

## אבטחה

### INV-UX-01 · שאלונים מציגים מידע קיים לאישור ומבקשים רק השלמות
- **החלטת גיא, 23.10.2026:** חוויית משתמש מרבית לאורך כל השאלון. נתון קיים מוצג לאישור/תיקון; אין הקלדה חוזרת או המצאת נתון חסר. כל אדם ותקופת הדוח נשמרים בנפרד.
- **קוד:** `taxYear/knownClient.ts`, `knownPrefill.ts`, `records.ts`, `AnnualFlow.tsx`, `flowDraft.ts`. שאלת ישות חדשה נשארת נפרדת מנתוני ישות קיימת.
- **SQL:** 293 — הקשר קריאה מוגבל לסכמות השאלון, דרך הרשאות הדף הקיימות. תשובות וטיוטות נשמרות.
- **מוכיח:** `knownClient.test.ts`, `knownPrefill.test.ts`, `staging-test-known-information-293.mjs`, `e2e/known-information.mjs`, `e2e/annual-r2.mjs`.

### INV-SEC-01 · שום פונקציה חדשה לא פתוחה ל-anon מחוץ לרשימה
- **SQL:** `assert_domain_function_invariants`. פתיחה מכוונת (דף לקוח ציבורי) ⇒ מוסיפים לרשימת ההיתר שלה במיגרציה, עם סיבה. מ-284 (22.10.2026) הבדיקה ירוקה בייצור (שש פונקציות «מס» בדף האישי נוספו לרשימה אחרי שנבדק שהן מוגנות בטוקן). כל פונקציה חדשה בלי שורה ⇒ הבדיקה נכשלת.
- **בדיקה חיה:** INV-SEC-01.

### INV-UX-02 · ריכוז העבודות שומר את מצב הרשות, שנת העבודה והקשר החזרה (27.10.2026)
- הוראת גיא: להשלים את עבודות הלקוחות לפי המחשת ב׳, עם מועדים, סטטוסים, שע״ם והקישור לידע ולתיק. הוראה זו מעדכנת את הסרת קישור הידע מהסקירה מ-21.10 ואת ברירת המחדל «אצלי».
- עד היום: סקירת בקשות עם «אצלי» כברירת מחדל, והחובות האחרות ביריעת שע״ם. מעכשיו: סוג העבודה הוא המסנן הראשי, ברירת המחדל הכול/כולם; חובות מזוהות ובקשות מוצגות יחד. איחור נשאר גלוי גם במסנן אחריות אחר.
- מחברים חובה לבקשה רק בקישור שרת מפורש (ולאותו לקוח וסוג); שם ושנה אינם הוכחה. שתי רשומות רשות לבני זוג אינן נמחקות כי הן מצביעות על אותה בקשה.
- state הנוכחי מהשרת קובע אם הוגש. filedOn היסטורי או השלמה במשרד אינם הוכחת הגשה נוכחית. ביטול קליטה מעדכן גם את הרשימה וגם את סיכום העונה.
- שנת הצהרת ההון ברשימה אינה יום ההצהרה. החובה נשארת גלויה גם כשעוד אי אפשר לפתוח בקשה בלי היום המפורש. מקור/ארכה/מועד שנמסר/יעד פנימי נשמרים לפי workMeta; לא ממציאים מועד.
- פתיחת ידע שומרת לקוח, שנה/יום, סוג, חיפוש, היסטוריה פתוחה ושורת חזרה. שנת הטופס אינה מוחלפת בשקט: מפת 2025 אינה מציגה עובדות לקוח של 2024/2026, וחומר לשנה אחרת מסומן לעיון בלבד.
- צרכנים: WorkOverview, workHubModel, workOverviewModel, TaxArea, App, ClientWorkspace, FormMap. אין שינוי בלוגיקת הקליטה/פתיחת הבקשות בשרת, בפרסום, בשליחה או ב-DB ייצור. בדיקות: workHub/workOverview, יחידה מלאה, staging305, ובדיקות דפדפן CUA בנתוני דמה.


## INV-OFFICE-BOOKS-01 · מקור מיון תפעולי אחד

- **הכלל:** תורת הנהלת החשבונות במשרד ובידע המקצועי משתמשת באותם נתונים ב-features/bookkeeping/handbookData.ts. מיפוי המחקר ב-expenseDictionary.ts אינו מילון מתחרה לפייפרלס. מדיניות משרד אינה אימות של כלל מס.
- **בית:** מספר קוד לבדו אינו מספיק; השם וסימון «עבודה מהבית» קובעים. אחוז הלקוח תלוי בתקופה ואישור, ומשני אינו אחוז הבית. אין חישוב/כתיבה לפייפרלס בעמוד זה.
- **פעולות:** קטלוג «פעולות ואוטומציות» מתעד את המנגנונים הקיימים; פעולה מתוכננת אינה handler ואינה יכולה לייצר משימה. הרצה בפועל נשארת בהקשר לקוח. הגדרות תזכורות ממשיכות להשתמש בטיוטת המשרד ובשמירה הקיימת.
- **מוכיח:** handbook.test.ts, actionGuide.test.ts, officeModel.test.ts; בדיקת ממשק מקומית על נתוני דמה.
