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

## אוטומציה — משימות מול רשויות

### INV-AUTO-01 · פעולה משנה ברשות: ניסיון אחד; «המשך» נכנס לתור רק כשהקודמת הסתיימה (לא מ«ממתין לך»)
- **SQL:** `create_automation_job` (max_attempts=1 לפעולה משנה, 196), `automation_job_followups` + `_release_automation_job_followups` / `_repoint_automation_job_followups` (270).
- **מוכיח:** `staging-test-job-followups-270.mjs` (F1–F9) · **בדיקה חיה:** INV-AUTO-01.

### INV-AUTO-02 · לחיצה חוזרת לא שולחת שוב מי שבדרך או שכבר הוזן/ה
- **קוד:** `runAllRows` / `runnableRows` (המצב נגזר מהמשימות בשרת, ונבדק שוב רגע לפני השליחה).
- **SQL:** `create_automation_job_after` מחזיר משימה פתוחה קיימת לאותו אדם (272).
- **מוכיח:** `runAll.test.ts`, F9 · **בדיקה חיה:** INV-AUTO-02.

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

### INV-REQ-02 · פייפרלס נפתח באישור ההצעה — גם בעסק חדש; רק החיבור לרשות המסים מחכה לפתיחת התיקים
- **הכלל:** הגבייה עוברת בפייפרלס (גיא, 23.10.2026), ולכן ההרשמה, החיבור והכרטיס לא מחכים לשום בקשה אחרת חוץ מהשרשרת של עצמם. «חיבור פייפרלס לרשות המסים» מחכה גם לחיבור וגם לפתיחת התיקים (מספרי הקצאה בלי תיק — אין). הסדר בדף ובמייל הראשון — פייפרלס ראשון — הוא נתון של המסלול (sortIndex), לא כלל בשרת.
- **SQL:** `generate_onboarding_steps` (בלי נעילה של `paperless_invite`, 289 §1), הטריגר `z_paperless_tax_authority_waits_for_files` (289 §2 — כל נתיבי היצירה, גם 132), `portal_lock_reason` (כל ההורים החוסמים).
- **קוד:** הטקסטים — `journeyDefaults.ts`, `FlowsPage.tsx` («בעסק חדש»), `businessSituation.ts`, `editModel.ts`. הסדר — `scripts/289-paperless-first-flow.mjs` (שמירה דרך `save_office_flow` עם `compileOnboarding`).
- **מי צורך:** `office_open_locked_step` («פתח עכשיו» מוחק את כל הקשתות), `requestGroups.ts` (מקבץ לפי סוג, לא לפי עמודת ההורה).
- **מוכיח:** `staging-test-new-business-234.mjs` (N1 — ההרשמה פתוחה; N2–N3 — שני הורים, נפתח רק כששניהם הושלמו, «פתח עכשיו»).

## אבטחה

### INV-SEC-01 · שום פונקציה חדשה לא פתוחה ל-anon מחוץ לרשימה
- **SQL:** `assert_domain_function_invariants`. פתיחה מכוונת (דף לקוח ציבורי) ⇒ מוסיפים לרשימת ההיתר שלה במיגרציה, עם סיבה. מ-284 (22.10.2026) הבדיקה ירוקה בייצור (שש פונקציות «מס» בדף האישי נוספו לרשימה אחרי שנבדק שהן מוגנות בטוקן). כל פונקציה חדשה בלי שורה ⇒ הבדיקה נכשלת.
- **בדיקה חיה:** INV-SEC-01.
