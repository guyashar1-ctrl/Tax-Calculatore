// shaamSubmitPoa.mjs — «שלח טופס חתום לשע״ם».
//
// ‼ 23.09.2026 · הזרימה האמיתית (צילומי מסך, בקשה 2026538930 של הדסה סלע):
//   רשימת «בקשות בתהליך» → שורת **מס הכנסה** של הבקשה → חץ «טעינת מסמכים»
//   → «פרטי התקשרות למיוצג <ת.ז.> - <שם>» (אימות זהות + קריאת מספר הבקשה)
//   → «המשך» (בלי לשנות דבר) → «טעינת מסמכים למיוצג <ת.ז.> - <שם>»
//   → «+» בכל שורה ששע״ם מציגה → העלאת PDF לכל שורה
//   → (תיבת «אני מאשר את חתימת בן/ת הזוג», רק אם PIVO הוכיחה אותה)
//   → «המשך» **פעם אחת** → ראיה מהאשף (שלב 5).
//
// ‼ 204 · שע״ם עשויה לדרוש מסמך נוסף מלבד הטופס: «תצלום תעודת זהות או רישיון
// נהיגה» או «צילום דרכון» (ועוד שניים שאינם מסמך מזהה). הדרישה שייכת לאדם
// שהת.ז. שלו בכותרת המסך — לא לתפקיד שנמסר למשימה. הבחירה במסמך המקומי
// נעשית **בשרת** (get_identity_document), לפי אותו אדם ואותו סוג בלבד.
// כשחסר מסמך — עוצרים **לפני** כל נגיעה, והמשימה מסתיימת (failed עם קוד
// `awaiting_required_documents`) כדי לא לתפוס את מקום השידור הבא. השרת (204)
// יוצר משימה חדשה אחת בדיוק כשהמסמך הנכון מגיע, והיא מתחילה מההתחלה וקוראת
// שוב את המסך החי.
//
// ‼ גבול הפעולה החיצונית: כל מה שלפני בחירת הקובץ הראשון הוא ניווט וקריאה.
// הסימן (markExternalAttempt) נרשם **לפני** בחירת הקובץ הראשון. מכאן והלאה
// כל תקלה היא «לא ידוע אם נקלט» — בלי ניסיון חוזר (196).
//
// ‼ «נשלח לשע״ם» אינו לחיצה: `submitted: true` חוזר רק כשכל הקבצים מופיעים
// בשורות שלהם והאשף עבר לשלב 5. הטריגר בשרת כותב submittedAt רק על הדגל הזה.
//
// ‼ הקבצים נמשכים דרך ה-edge function (בגבול ה-job) ונכתבים ישירות לשדה
// הקובץ — לא נשמרים לדיסק.

import { attach, detach } from '../browserSession.mjs';
import {
  openRepresentationSystem, openRequestForDocuments, uploadIntoSlot, openSlotUploadDialog,
  inspectSlotDialog, confirmDocumentsStep, currentWizardStep, documentsStepPlan,
  documentsSubmissionDecision, SHAAM_DOC_SLOTS, slotForLabel,
} from '../shaamRepresentationSession.mjs';
import { NeedsHumanError, PermanentError } from '../errors.mjs';
import { getDocument, getIdentityDocument } from '../apiClient.mjs';
import {
  progressTracker, assertNotAlreadyAttempted, detectBlockingSignal, blockingError,
  captureDiagnostics, unknownScreenError,
} from '../shaamSafety.mjs';

export const actionType = 'shaam.submit_poa';

/**
 * ‼ שומר ההפעלה של המקרה החי הראשון — **זמני**.
 * שורות 2–5 במסך «טעינת מסמכים» טרם נצפו גלויות בהרצה חיה; ההתנהגות שלהן
 * נגזרת מקוד האפליקציה של שע״ם. עד שמקרה אמיתי אחד יאומת, כשמופיעה שורה
 * נוספת — העובד מזהה, מסווג, משייך לאדם, בוחר את המסמך, בודק את הדיאלוג
 * (תצוגה בלבד), מדווח את תוכנית ההעלאה — ו**עוצר לפני שמעלה**. זה לא כשל
 * ולא «חסר מסמך»: המשימה מסתיימת בקוד `first_live_verification`.
 * שידור של טופס בלבד (בלי שורה נוספת) אינו מושפע.
 * להסרה: רק אחרי אימות חי של מקרה אחד, בשינוי קוד מכוון (לא הגדרה).
 */
export const EXTRA_DOCUMENT_UPLOAD_LIVE_VERIFIED = false;

const NOT_READY =
  'מערכת רישום הייצוג בשע״ם אינה מוכנה. לחצו על "שע״ם" בכותרת, השלימו את ' +
  'ההתחברות, ואז הריצו שוב.';

const NOTHING_SENT = 'שום קובץ לא נטען ושום דבר לא נשלח לשע״ם.';

/** עצירות לפני הנגיעה — מה לומר לרו"ח על כל אחת. */
const BEFORE_TOUCH_STOPS = {
  ambiguous_request: 'לא ניתן לקבוע בוודאות איזו בקשה בשע״ם היא של ההגשה הזאת',
  identity_mismatch: 'השורות ברשימה אינן של הלקוח הזה',
  cannot_attribute: 'אי אפשר לשייך את שורות הרשימה ללקוח הזה',
  opened_request_identity_mismatch: 'הבקשה שנפתחה בשע״ם אינה מציגה את ת.ז. ואת שם הלקוח',
  documents_screen_identity_unverified: 'מסך טעינת המסמכים אינו מציג בוודאות את ת.ז. ואת שם הלקוח',
  opened_wrong_request: 'נפתחה בשע״ם בקשה אחרת מזו שנשמרה ב-PIVO',
  request_number_not_on_screen: 'מספר הבקשה לא הוצג בבקשה שנפתחה, ולכן אי אפשר לאמת אותה',
  upload_action_not_found: 'פקד «טעינת מסמכים» לא נמצא בשורת הבקשה',
  upload_action_ambiguous: 'יותר מפקד אחד בשורה נראה כמו «טעינת מסמכים»',
  poa_already_uploaded: 'בשורת «טופס ייפוי כוח» כבר מופיע קובץ — לא מעלים קובץ נוסף',
  row_already_populated: 'בשורת מסמך נוסף כבר מופיע קובץ שלא אנחנו העלינו — לא נוגעים',
  poa_row_not_found: 'שורת «טופס ייפוי כוח» לא נמצאה במסך טעינת המסמכים',
  poa_row_ambiguous: 'נמצאה יותר משורת «טופס ייפוי כוח» אחת',
  document_row_ambiguous: 'אותה שורת מסמך מופיעה יותר מפעם אחת במסך',
  document_row_not_found: 'שורת המסמך לא נמצאה במסך',
  upload_opener_not_found: 'פקד ה-«+» של שורת המסמך לא נמצא',
  upload_opener_ambiguous: 'יותר מפקד «+» אחד בשורת המסמך',
  spouse_checkbox_ambiguous: 'יותר מתיבת אישור אחת לחתימת בן/בת הזוג',
  continue_not_found: 'כפתור «המשך» לא נמצא (או מושבת) במסך',
  continue_ambiguous: 'נמצא יותר מכפתור «המשך» אחד גלוי',
  continue_label_mismatch: 'הכפתור שסומן «המשך» אינו נושא את הטקסט «המשך»',
  contact_step_error: 'במסך פרטי ההתקשרות מוצגת שגיאה',
  not_on_documents_step: 'המסך אינו מסך טעינת המסמכים',
  upload_dialog_not_open: 'דיאלוג הטעינה של השורה לא נפתח',
  upload_dialog_mismatch: 'נפתח דיאלוג טעינה של שורה אחרת (או יותר מדיאלוג אחד)',
  file_input_ambiguous: 'בדיאלוג יותר משדה קובץ פעיל אחד',
  file_input_not_found: 'שדה הקובץ בדיאלוג לא נמצא',
  upload_button_not_found: 'כפתור «טעינת קובץ» לא נמצא בדיאלוג',
  close_button_not_found: 'כפתור «סגירה» לא נמצא בדיאלוג',
  close_click_failed: 'הלחיצה על «סגירה» בדיאלוג נכשלה',
  row_changed_after_inspect: 'שורת המסמך השתנתה אחרי בדיקת הדיאלוג',
  spouse_checkbox_not_found: 'המסך מבקש לאשר את חתימת בן/בת הזוג, אבל תיבת האישור לא נמצאה',
  spouse_signature_not_proven: 'שע״ם מבקשת לאשר את חתימת בן/בת הזוג, ו-PIVO לא הוכיחה אותה בטופס החתום',
};

const KIND_TEXT = { idOrLicense: 'צילום תעודת זהות או רישיון נהיגה', passport: 'צילום דרכון' };

/** מה נדרש, ממי — לשורה בהודעה לרו"ח. */
const slotLine = (x) => `${KIND_TEXT[x.slot.kind] ?? x.slot.label}${x.result?.personName ? ` של ${x.result.personName}` : ''}`;

/** עצירה מבוקרת לפני נגיעה, שמסיימת את המשימה (failed) — לא «דרוש אדם». */
function documentsStop(code, slots) {
  const lines = slots.map(slotLine).join(', ');
  const text = {
    awaiting_required_documents:
      `שע״ם דורשת לבקשה הזאת גם ${lines}, והמסמך עדיין לא אצלנו. נפתחה ללקוח בקשת מסמך ` +
      '(«נדרש על ידי רשות המסים להשלמת הייצוג»). כשהמסמך יגיע — השידור ימשיך מעצמו, פעם אחת. ',
    needs_document_assignment:
      'שע״ם דורשת מסמך מזהה נוסף, אבל לא ניתן לקבוע בוודאות של מי הוא: הת.ז. בכותרת הבקשה בשע״ם ' +
      'אינה תואמת בדיוק לאדם אחד בכרטיס. בדקו את מספרי הזהות בכרטיס. ',
    document_not_pdf_convertible:
      `שע״ם דורשת ${lines} כקובץ PDF, והקובץ שיש לנו בפורמט שאי אפשר להמיר (למשל HEIC/WEBP). ` +
      'צרפו צילום בפורמט JPEG, PNG או PDF. ',
    required_document_unavailable:
      `שע״ם דורשת ${lines}, ולא הצלחתי לקרוא את המסמך מתיק הלקוח. `,
    first_live_verification:
      `עצירת אימות ראשון (לא תקלה): שע״ם מציגה שורה נוספת — ${lines}. המסמך נמצא והתוכנית ` +
      'נשמרה, אבל העלאה אוטומטית של מסמך נוסף עוד לא אומתה מול שע״ם החיה. השלימו את ההגשה ' +
      'ידנית בשע״ם לפי התוכנית שבמרכז הייצוג, ואז «שודר ידנית - סמנו כנשלח». ',
  }[code] ?? '';
  return new PermanentError(`${text}${NOTHING_SENT}`, code);
}

export async function preflight() {
  return { ok: true };
}

export async function run(ctx, input) {
  const submissionKey = String(input?.submissionKey ?? '');
  const role = input?.role;
  const requestNumber = String(input?.requestNumber ?? '').replace(/\D/g, '');
  const entityId = String(input?.entityId ?? '').replace(/\D/g, '');
  const documentId = String(input?.signedDocumentId ?? '');
  const personName = String(input?.personName ?? '').trim();
  const spouseSignatureConfirmed = input?.spouseSignatureConfirmed === true;

  if (role !== 'client' && role !== 'spouse') {
    throw new PermanentError('לא נמסר תפקיד תקין (client/spouse) לפעולה הזו.', 'bad_subject_role');
  }
  if (!submissionKey) throw new PermanentError('לא נמסר מפתח הגשה.', 'missing_submission_key');
  // ‼ ת.ז. **ושם** נדרשים תמיד — גם כשיש מספר בקשה: הבקשה שנפתחת נבדקת
  // מולם לפני כל העלאה.
  if (!entityId || !personName) {
    throw new PermanentError(
      'חסרים ת.ז. או שם לאימות הבקשה בשע״ם — אי אפשר לוודא שזו הבקשה הנכונה, ולא מנחשים.',
      'missing_request_number',
    );
  }
  if (!documentId) {
    throw new PermanentError('לא נמסר מזהה הטופס החתום.', 'missing_signed_document');
  }
  // ‼ קו הגנה שני נגד שידור כפול.
  if (input?.alreadySubmittedAt) {
    throw new PermanentError(
      `הטופס של ההגשה הזאת כבר שודר לשע״ם (${input.alreadySubmittedAt}) — לא משדרים פעמיים.`,
      'already_submitted',
    );
  }

  // ‼ שער הכניסה: שידור שכבר נוסה ולא הוכרע לעולם לא משודר שוב מעצמו.
  const progress = progressTracker(ctx);
  assertNotAlreadyAttempted(progress, {
    operation: 'שידור טופס ייפוי הכוח',
    howToCheck: 'הריצו «בדוק קבלת הייצוג» — היא קוראת בלבד ותגיד אם שע״ם כבר קיבלה את הטופס.',
  });

  const doc = await getDocument(ctx.workerId, ctx.job.id, documentId);
  if (!doc?.ok || !doc.buffer?.length) {
    throw new PermanentError(
      `לא הצלחתי לקרוא את הטופס החתום מתיק הלקוח (${doc?.error ?? 'unknown'}).`,
      'signed_document_unavailable',
    );
  }

  const conn = await attach();
  if (!conn.ok) throw new NeedsHumanError(NOT_READY, 'awaiting_shaam_auth');

  try {
    const page = conn.page;

    const blocked = await detectBlockingSignal(page);
    if (blocked) throw blockingError(blocked, 'שידור הטופס לשע״ם');

    const open = await openRepresentationSystem(page);
    if (!open.ok) {
      if (open.reason === 'login_required') throw new NeedsHumanError(NOT_READY, 'awaiting_shaam_auth');
      const diag = await captureDiagnostics(page, 'פתיחת מערכת רישום הייצוג');
      ctx.log('אבחון מסך:', JSON.stringify(diag));
      throw unknownScreenError('שידור הטופס לשע״ם', 'פתיחת מערכת רישום הייצוג', diag);
    }

    ctx.log(requestNumber
      ? `מאתר בקשה ${requestNumber} (שורת מס הכנסה) ופותח «טעינת מסמכים»`
      : 'מאתר את הבקשה לפי ישות ושם (שורת מס הכנסה) ופותח «טעינת מסמכים»');
    const opened = await openRequestForDocuments(page, { requestNumber, entityId, expectedClientName: personName });

    // ‼ מספר הבקשה נקרא מהמסך שנפתח — נשמר מיד, גם אם עוצרים אחר כך.
    if (opened.requestNumber && opened.requestNumber !== requestNumber) {
      ctx.log(`מספר הבקשה בשע״ם (מהמסך שנפתח): ${opened.requestNumber}`);
      await progress.set({ requestNumber: opened.requestNumber });
    }

    if (!opened.ok) {
      ctx.log(`עצירה לפני טעינה: ${opened.reason}${opened.detail ? ` · ${opened.detail}` : ''} (שלב ${opened.step ?? '?'})`);
      const signal = await detectBlockingSignal(page);
      if (signal) throw blockingError(signal, 'פתיחת הבקשה בשע״ם');
      if (opened.reason === 'request_not_found_in_list') {
        throw new NeedsHumanError(
          `הבקשה ${requestNumber || 'של הלקוח'} לא נמצאה ברשימת הבקשות בתהליך. ייתכן שהיא כבר נקלטה או בוטלה — ` +
          `בדקו בשע״ם, או הריצו «בדוק קבלת הייצוג». ${NOTHING_SENT}`,
          'request_not_found',
        );
      }
      if (BEFORE_TOUCH_STOPS[opened.reason]) {
        throw new NeedsHumanError(
          `${BEFORE_TOUCH_STOPS[opened.reason]}${opened.detail ? ` (${opened.detail})` : ''}. ${NOTHING_SENT}`,
          'request_identity_unverified',
        );
      }
      const diag = await captureDiagnostics(page, `פתיחת הבקשה (${opened.reason})`);
      ctx.log('אבחון מסך:', JSON.stringify(diag));
      throw unknownScreenError('שידור הטופס לשע״ם', `פתיחת הבקשה לטעינת מסמכים (${opened.reason})`, diag);
    }

    // ── מה שע״ם מציגה — מדווח ל-PIVO לפני כל החלטה. קריאה בלבד ─────────────
    // ‼ 204 · השרת קורא את זה (shaamDocuments): ממפה את הת.ז. שבכותרת לאדם,
    // פותח ללקוח בקשת מסמך כשחסר, ושומר את הדרישה על ההגשה.
    const docsState = opened.documents;
    const observed = (docsState.rows ?? []).map((r) => {
      const slot = slotForLabel(r.label);
      return { slotId: slot?.id ?? null, kind: slot?.kind ?? 'unknown', label: r.label, hasFile: r.hasFile, required: r.required };
    });
    const extraObserved = observed.filter((r) => r.kind !== 'poa');
    if (extraObserved.length) ctx.log(`שע״ם דורשת מסמכים נוספים: ${extraObserved.map((r) => r.label).join(', ')}`);
    await progress.set({
      shaamDocuments: {
        observedAt: new Date().toISOString(),
        entityId: docsState.headerEntityId ?? null,
        rows: observed,
      },
    });

    // ── ההחלטה על מסך המסמכים — עדיין לפני כל נגיעה ────────────────────────
    const plan = documentsStepPlan(docsState, { spouseSignatureConfirmed });
    if (!plan.ok) {
      ctx.log(`עצירה לפני טעינה: ${plan.reason}${plan.detail ? ` · ${plan.detail}` : ''}`);
      if (plan.reason === 'unsupported_required_document' || plan.reason === 'unknown_document_row') {
        throw new PermanentError(
          `שע״ם דורשת בבקשה הזאת מסמך שאינו מסמך מזהה (${plan.detail}). האוטומציה לא מעלה אותו — ` +
          `יש להשלים את ההגשה ידנית בשע״ם. ${NOTHING_SENT}`,
          'unsupported_required_document',
        );
      }
      throw new NeedsHumanError(
        `${BEFORE_TOUCH_STOPS[plan.reason] ?? plan.reason}${plan.detail ? ` (${plan.detail})` : ''}. ${NOTHING_SENT}` +
        (plan.reason === 'poa_already_uploaded' ? ' הריצו «בדוק קבלת הייצוג» כדי לראות מה נקלט.' : ''),
        plan.reason === 'poa_already_uploaded' ? 'poa_already_uploaded' : 'request_identity_unverified',
      );
    }

    // ── המסמכים הנוספים: מה יש לנו, לאדם שבכותרת בלבד (בשרת) ─────────────────
    const resolved = await Promise.all(plan.extraSlots.map(async (slot) => {
      const r = await getIdentityDocument(ctx.workerId, ctx.job.id, { entityId: plan.entityId, slotKind: slot.kind });
      return { slot, result: r ?? { ok: false, error: 'no_response' } };
    }));
    const decision = documentsSubmissionDecision(resolved, { extraUploadVerified: EXTRA_DOCUMENT_UPLOAD_LIVE_VERIFIED });
    const planReport = (evidence = []) => ({
      entityId: plan.entityId,
      decision: decision.ok ? 'upload' : decision.code,
      slots: resolved.map((x) => ({
        slotId: x.slot.id, kind: x.slot.kind, label: x.slot.label,
        status: x.result?.ok ? 'ready' : (x.result?.error ?? 'unknown'),
        person: x.result?.person ?? null,
        personName: x.result?.personName ?? null,
        docKind: x.result?.docKind ?? null,
        sourceDocumentIds: x.result?.sourceDocumentIds ?? [],
        pageCount: x.result?.pageCount ?? null,
        fileName: x.result?.fileName ?? null,
        dialog: evidence.find((e) => e.slotId === x.slot.id) ?? null,
      })),
      at: new Date().toISOString(),
    });

    if (!decision.ok && decision.code !== 'first_live_verification') {
      await progress.set({ shaamDocumentsPlan: planReport() });
      ctx.log(`עצירה לפני טעינה: ${decision.code}`);
      throw documentsStop(decision.code, decision.slots);
    }

    // ── בדיקת הדיאלוג של כל שורה נוספת — תצוגה בלבד, לפני הנגיעה ────────────
    const evidence = [];
    for (const x of resolved) {
      const seen = await inspectSlotDialog(page, x.slot);
      if (!seen.ok) {
        ctx.log(`עצירה לפני טעינה: ${seen.reason} (${x.slot.label})`);
        await progress.set({ shaamDocumentsPlan: planReport(evidence) });
        throw new NeedsHumanError(
          `${BEFORE_TOUCH_STOPS[seen.reason] ?? seen.reason} — «${x.slot.label}». ${NOTHING_SENT}`,
          'request_identity_unverified',
        );
      }
      evidence.push({ slotId: x.slot.id, dialog: seen.dialog, title: seen.title });
    }

    if (!decision.ok) {
      // first_live_verification — ראה EXTRA_DOCUMENT_UPLOAD_LIVE_VERIFIED.
      await progress.set({ shaamDocumentsPlan: planReport(evidence) });
      ctx.log('עצירת אימות ראשון: שורה נוספת זוהתה, המסמך נמצא, התוכנית נשמרה — לא מעלים');
      throw documentsStop('first_live_verification', decision.slots);
    }
    await progress.set({ shaamDocumentsPlan: planReport(evidence) });

    // ── «+» ⇒ דיאלוג «טופס ייפוי כוח» — תצוגה בלבד, עדיין לפני הנגיעה ──────
    const poaSlot = SHAAM_DOC_SLOTS[0];
    const dlg = await openSlotUploadDialog(page, poaSlot);
    if (!dlg.ok) {
      ctx.log(`עצירה לפני טעינה: ${dlg.reason}${dlg.detail ? ` · ${dlg.detail}` : ''}`);
      throw new NeedsHumanError(
        `${BEFORE_TOUCH_STOPS[dlg.reason] ?? dlg.reason}${dlg.detail ? ` (${dlg.detail})` : ''}. ${NOTHING_SENT}`,
        dlg.reason === 'poa_already_uploaded' ? 'poa_already_uploaded' : 'request_identity_unverified',
      );
    }

    // ‼ הגבול: בחירת הקובץ מעלה אותו מיד לאחסון זמני של שע״ם (autoUpload).
    // קריסה מכאן והלאה חייבת להיקרא «לא ידוע אם נקלט» — ולעולם לא «ננסה שוב» (196).
    await progress.markExternalAttempt('upload_signed_form');

    const unknownAfterTouch = async (reason, detail) => {
      const signal = await detectBlockingSignal(page);
      if (signal) throw blockingError(signal, 'טעינת המסמכים');
      if (reason === 'upload_rejected') throw new PermanentError(`שע״ם דחתה את הקובץ: ${detail}`, 'upload_rejected');
      const diag = await captureDiagnostics(page, 'טעינת מסמכים');
      ctx.log('אבחון מסך:', JSON.stringify(diag));
      throw new NeedsHumanError(
        `השידור נעצר באמצע (${reason}), ולא ידוע אם שע״ם קיבלה את הקבצים. ` +
        'לא נשדר שוב אוטומטית. הריצו «בדוק קבלת הייצוג» כדי לראות מה ' +
        'נקלט בפועל, ורק לפי זה החליטו אם לשדר שוב.',
        'ambiguous_submit_result',
      );
    };

    ctx.log(`מעלה את הטופס החתום (${doc.buffer.length} בתים) לשורת «טופס ייפוי כוח»`);
    const uploaded = await uploadIntoSlot(page, poaSlot, {
      fileName: doc.fileName || 'ייפוי כוח חתום.pdf',
      buffer: doc.buffer,
      inputIndex: dlg.inputIndex,
    });
    if (!uploaded.ok) await unknownAfterTouch(uploaded.reason, uploaded.detail);

    // ‼ כל שורה נוספת — אותו מסלול בדיוק: הדיאלוג שלה, קובץ PDF אחד, V בשורה.
    for (const x of decision.uploads) {
      const d = await openSlotUploadDialog(page, x.slot);
      if (!d.ok) await unknownAfterTouch(d.reason, x.slot.label);
      ctx.log(`מעלה ${x.result.fileName} (${x.result.pageCount} עמודים) לשורת «${x.slot.label}»`);
      const u = await uploadIntoSlot(page, x.slot, { fileName: x.result.fileName, buffer: x.result.buffer, inputIndex: d.inputIndex });
      if (!u.ok) await unknownAfterTouch(u.reason, u.detail);
    }

    const confirmed = await confirmDocumentsStep(page, {
      checkSpouse: plan.checkSpouse, entityId, expectedClientName: personName,
      expectedSlotIds: [poaSlot.id, ...decision.uploads.map((x) => x.slot.id)],
    });
    if (!confirmed.ok) {
      // ‼ הקבצים אולי נקלטו ואולי לא. לא «נשלח», ולא מעלים שוב.
      throw new NeedsHumanError(
        `המסמכים הועלו אך לא זוהתה ראיה ברורה לקליטה (${confirmed.reason}${confirmed.detail ? ` · ${confirmed.detail}` : ''}). ` +
        'בדקו בחלון שע״ם: אם הקבצים מופיעים והבקשה התקדמה — הריצו «בדוק קבלת הייצוג». ' +
        'PIVO לא יסמן «נשלח לשע״ם» בלי ראיה, ולא יעלה את הקבצים שוב.',
        'ambiguous_submit_result',
      );
    }

    const step = await currentWizardStep(page);
    ctx.log(`המסמכים נקלטו · שלב נוכחי ${step} · ${confirmed.fileLine}`);
    return {
      result: {
        submissionKey, role,
        requestNumber: opened.requestNumber || requestNumber || '',
        submitted: true,
        spouseConfirmationChecked: plan.checkSpouse,
        statusLines: confirmed.statusLines ?? [],
        fileLine: confirmed.fileLine,
        documents: confirmed.documents ?? [],
        summary: (confirmed.summary ?? '').slice(0, 400),
      },
      artifacts: [{ kind: 'poa_submitted', requestNumber: opened.requestNumber || requestNumber || '', fileName: doc.fileName }],
    };
  } finally {
    await detach(conn.browser);
  }
}
