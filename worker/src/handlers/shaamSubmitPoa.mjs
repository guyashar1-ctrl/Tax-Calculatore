// shaamSubmitPoa.mjs — «שלח טופס חתום לשע״ם».
//
// ‼ 23.09.2026 · הזרימה האמיתית (צילומי מסך, בקשה 2026538930 של הדסה סלע):
//   רשימת «בקשות בתהליך» → שורת **מס הכנסה** של הבקשה → חץ «טעינת מסמכים»
//   → «פרטי התקשרות למיוצג <ת.ז.> - <שם>» (אימות זהות + קריאת מספר הבקשה)
//   → «המשך» (בלי לשנות דבר) → «טעינת מסמכים למיוצג <ת.ז.> - <שם>»
//   → «+» בשורת «טופס ייפוי כוח» → העלאת ה-PDF החתום הסופי
//   → (תיבת «אני מאשר את חתימת בן/ת הזוג», רק אם PIVO הוכיחה אותה)
//   → «המשך» **פעם אחת** → ראיה מהאשף (שלב 5).
//
// ‼ גבול הפעולה החיצונית: כל מה שלפני ה«+» הוא ניווט וקריאה. הסימן
// (markExternalAttempt) נרשם **לפני** ה«+» ולפני העלאת הקובץ. מכאן והלאה
// כל תקלה היא «לא ידוע אם נקלט» — בלי ניסיון חוזר (196).
//
// ‼ «נשלח לשע״ם» אינו לחיצה: `submitted: true` חוזר רק כשהקובץ מופיע בשורה
// והאשף עבר לשלב 5. הטריגר בשרת כותב submittedAt רק על הדגל הזה.
//
// ‼ הקובץ נמשך דרך ה-edge function (get_document, בגבול ה-job) ונכתב
// ישירות לשדה הקובץ — לא נשמר לדיסק.

import { attach, detach } from '../browserSession.mjs';
import {
  openRepresentationSystem, openRequestForDocuments, uploadSignedForm,
  confirmDocumentsStep, currentWizardStep, documentsStepPlan,
} from '../shaamRepresentationSession.mjs';
import { NeedsHumanError, PermanentError } from '../errors.mjs';
import { getDocument } from '../apiClient.mjs';
import {
  progressTracker, assertNotAlreadyAttempted, detectBlockingSignal, blockingError,
  captureDiagnostics, unknownScreenError,
} from '../shaamSafety.mjs';

export const actionType = 'shaam.submit_poa';

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
  documents_screen_identity_unverified: 'מסך טעינת המסמכים אינו מציג את ת.ז. ואת שם הלקוח',
  opened_wrong_request: 'נפתחה בשע״ם בקשה אחרת מזו שנשמרה ב-PIVO',
  request_number_not_on_screen: 'מספר הבקשה לא הוצג בבקשה שנפתחה, ולכן אי אפשר לאמת אותה',
  upload_action_not_found: 'פקד «טעינת מסמכים» לא נמצא בשורת הבקשה',
  upload_action_ambiguous: 'יותר מפקד אחד בשורה נראה כמו «טעינת מסמכים»',
  poa_already_uploaded: 'בשורת «טופס ייפוי כוח» כבר מופיע קובץ — לא מעלים קובץ נוסף',
  poa_row_not_found: 'שורת «טופס ייפוי כוח» לא נמצאה במסך טעינת המסמכים',
  poa_row_ambiguous: 'נמצאה יותר משורת «טופס ייפוי כוח» אחת',
  upload_opener_not_found: 'פקד ה-«+» של «טופס ייפוי כוח» לא נמצא',
  upload_opener_ambiguous: 'יותר מפקד «+» אחד בשורת «טופס ייפוי כוח»',
  spouse_checkbox_ambiguous: 'יותר מתיבת אישור אחת לחתימת בן/בת הזוג',
  spouse_checkbox_not_found: 'המסך מבקש לאשר את חתימת בן/בת הזוג, אבל תיבת האישור לא נמצאה',
  spouse_signature_not_proven: 'שע״ם מבקשת לאשר את חתימת בן/בת הזוג, ו-PIVO לא הוכיחה אותה בטופס החתום',
};

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

    // ── ההחלטה על מסך המסמכים — עדיין לפני כל נגיעה ────────────────────────
    const plan = documentsStepPlan(opened.documents, { spouseSignatureConfirmed });
    if (!plan.ok) {
      ctx.log(`עצירה לפני טעינה: ${plan.reason}`);
      throw new NeedsHumanError(
        `${BEFORE_TOUCH_STOPS[plan.reason] ?? plan.reason}. ${NOTHING_SENT}` +
        (plan.reason === 'poa_already_uploaded' ? ' הריצו «בדוק קבלת הייצוג» כדי לראות מה נקלט.' : ''),
        plan.reason === 'poa_already_uploaded' ? 'poa_already_uploaded' : 'request_identity_unverified',
      );
    }

    // ‼ הגבול: מכאן הקובץ עלול להיקלט בשע״ם. קריסה מכאן והלאה חייבת
    // להיקרא «לא ידוע אם נקלט» — ולעולם לא «ננסה שוב» (196).
    await progress.markExternalAttempt('upload_signed_form');

    ctx.log(`מעלה את הטופס החתום (${doc.buffer.length} בתים) לשורת «טופס ייפוי כוח»`);
    const uploaded = await uploadSignedForm(page, {
      fileName: doc.fileName || 'ייפוי כוח חתום.pdf',
      buffer: doc.buffer,
    });
    if (!uploaded.ok) {
      const signal = await detectBlockingSignal(page);
      if (signal) throw blockingError(signal, 'טעינת הטופס החתום');
      if (uploaded.reason === 'upload_rejected') {
        throw new PermanentError(`שע״ם דחתה את הקובץ: ${uploaded.detail}`, 'upload_rejected');
      }
      const diag = await captureDiagnostics(page, 'טעינת מסמכים');
      ctx.log('אבחון מסך:', JSON.stringify(diag));
      throw new NeedsHumanError(
        `שידור הטופס נעצר באמצע (${uploaded.reason}), ולא ידוע אם שע״ם קיבלה את הקובץ. ` +
        'לא נשדר שוב אוטומטית. הריצו «בדוק קבלת הייצוג» כדי לראות מה ' +
        'נקלט בפועל, ורק לפי זה החליטו אם לשדר שוב.',
        'ambiguous_submit_result',
      );
    }

    const confirmed = await confirmDocumentsStep(page, { checkSpouse: plan.checkSpouse });
    if (!confirmed.ok) {
      // ‼ הקובץ אולי נקלט ואולי לא. לא «נשלח», ולא מעלים שוב.
      throw new NeedsHumanError(
        `הטופס הועלה אך לא זוהתה ראיה ברורה לקליטה (${confirmed.reason}${confirmed.detail ? ` · ${confirmed.detail}` : ''}). ` +
        'בדקו בחלון שע״ם: אם הקובץ מופיע והבקשה התקדמה — הריצו «בדוק קבלת הייצוג». ' +
        'PIVO לא יסמן «נשלח לשע״ם» בלי ראיה, ולא יעלה את הקובץ שוב.',
        'ambiguous_submit_result',
      );
    }

    const step = await currentWizardStep(page);
    ctx.log(`הטופס נקלט · שלב נוכחי ${step} · ${confirmed.fileLine}`);
    return {
      result: {
        submissionKey, role,
        requestNumber: opened.requestNumber || requestNumber || '',
        submitted: true,
        spouseConfirmationChecked: plan.checkSpouse,
        fileLine: confirmed.fileLine,
        summary: (confirmed.summary ?? '').slice(0, 400),
      },
      artifacts: [{ kind: 'poa_submitted', requestNumber: opened.requestNumber || requestNumber || '', fileName: doc.fileName }],
    };
  } finally {
    await detach(conn.browser);
  }
}
