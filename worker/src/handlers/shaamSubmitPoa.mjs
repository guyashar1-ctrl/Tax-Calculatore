// shaamSubmitPoa.mjs — «שלח טופס חתום לשע״ם»: מאתר את הבקשה לפי מספר
// הבקשה שנשמר, נכנס לשלב «טעינת מסמכים», מעלה את טופס ייפוי הכוח החתום
// וממשיך — ורק אחרי שהמסך הציג ראיה לקליטה, מדווח שהוגש.
//
// ‼ הכלל היחיד שאסור לפספס כאן: **«נשלח לשע״ם» אינו לחיצה.** הפעולה
// מחזירה `submitted: true` אך ורק כשהשורה מציגה את הקובץ והאשף התקדם
// לשלב הסיום. אחרת — needs_human, וההחלטה חוזרת לאדם. הטריגר בשרת (194)
// כותב `submittedAt` רק על הדגל הזה.
//
// ‼ אין כאן «הורד מ-PIVO, שמור לדיסק, בחר קובץ». הקובץ החתום נמשך דרך
// ה-edge function (get_document, בגבול ה-job) ונכתב ישירות לשדה הקובץ.

import { attach, detach } from '../browserSession.mjs';
import {
  openRepresentationSystem, openRequestForDocuments, uploadSignedForm,
  confirmDocumentsStep, currentWizardStep,
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

export async function preflight() {
  return { ok: true };
}

export async function run(ctx, input) {
  const submissionKey = String(input?.submissionKey ?? '');
  const role = input?.role;
  const requestNumber = String(input?.requestNumber ?? '').replace(/\D/g, '');
  const entityId = String(input?.entityId ?? '').replace(/\D/g, '');
  const documentId = String(input?.signedDocumentId ?? '');

  if (role !== 'client' && role !== 'spouse') {
    throw new PermanentError('לא נמסר תפקיד תקין (client/spouse) לפעולה הזו.', 'bad_subject_role');
  }
  if (!submissionKey) throw new PermanentError('לא נמסר מפתח הגשה.', 'missing_submission_key');
  if (!requestNumber) {
    throw new PermanentError(
      'לא נשמר מספר בקשה בשע״ם להגשה הזאת — אי אפשר לאתר את הבקשה הנכונה, ולא מנחשים.',
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

  // ‼ שער הכניסה — הקריטי ביותר מכל השלושה: שידור שכבר נוסה
  // ולא הוכרע לעולם לא משודר שוב מעצמו. קודם קוראים מה קרה שם.
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

    ctx.log(`מאתר בקשה ${requestNumber} ופותח את שלב טעינת המסמכים`);
    const opened = await openRequestForDocuments(page, { requestNumber, entityId });
    if (!opened.ok) {
      if (opened.reason === 'opened_wrong_request') {
        throw new PermanentError(
          `נפתחה בשע״ם בקשה אחרת (${opened.detail}) מזו שביקשנו (${requestNumber}) — עוצר.`,
          'opened_wrong_request',
        );
      }
      // ‼ לפני העלאה — אם לא ניתן לבסס שהשורות הן של הבקשה שלנו, עוצרים.
      // כאן המחיר של ניחוש הוא טופס חתום שנטען לתיק של אדם אחר.
      if (opened.reason === 'identity_mismatch' || opened.reason === 'cannot_attribute') {
        throw new NeedsHumanError(
          'לא הצלחתי לוודא שהבקשה שהוצגה ברשימה היא הבקשה של הלקוח הזה, ולכן לא טענתי ' +
          'את הטופס. שום דבר לא נשלח לשע״ם. אתרו את הבקשה ידנית ובדקו את מספרה בכרטיס.',
          'request_identity_unverified',
        );
      }
      if (opened.reason === 'request_not_found_in_list') {
        throw new NeedsHumanError(
          `בקשה ${requestNumber} לא נמצאה ברשימת הבקשות בתהליך. ייתכן שהיא כבר נקלטה או בוטלה — ` +
          'בדקו בשע״ם. אפשר להריץ «בדוק קבלת הייצוג» כדי לסנכרן מצב.',
          'request_not_found',
        );
      }
      const diag = await captureDiagnostics(page, 'איתור הבקשה');
      ctx.log('אבחון מסך:', JSON.stringify(diag));
      throw unknownScreenError('שידור הטופס לשע״ם', 'פתיחת הבקשה לטעינת מסמכים', diag);
    }

    // ‼ ה-checkpoint הקריטי ביותר בכל המילסטון: מיד אחריו
    // הקובץ עלול להיקלט בשע״ם. קריסה מכאן והלאה חייבת להיקרא
    // «לא ידוע אם נקלט» — ולעולם לא «ננסה שוב» (196).
    await progress.markExternalAttempt('upload_signed_form');

    ctx.log(`מעלה את הטופס החתום (${doc.buffer.length} בתים)`);
    const uploaded = await uploadSignedForm(page, {
      fileName: doc.fileName || 'ייפוי כוח חתום.pdf',
      buffer: doc.buffer,
    });
    if (!uploaded.ok) {
      const signal = await detectBlockingSignal(page);
      if (signal) throw blockingError(signal, 'טעינת הטופס החתום');
      if (uploaded.reason === 'upload_rejected') {
        throw new PermanentError(
          `שע״ם דחתה את הקובץ: ${uploaded.detail}`,
          'upload_rejected',
        );
      }
      const diag = await captureDiagnostics(page, 'טעינת מסמכים');
      ctx.log('אבחון מסך:', JSON.stringify(diag));
      // ‼ כבר אחרי markExternalAttempt ⇒ התוצאה אינה ודאית, גם אם
      // השלב נראה כמו כשל ניווט. עוצרים ומפנים לבדיקה.
      throw new NeedsHumanError(
        'שידור הטופס נעצר באמצע, ולא ידוע אם שע״ם קיבלה את הקובץ. ' +
        'לא נשדר שוב אוטומטית. הריצו «בדוק קבלת הייצוג» כדי לראות מה ' +
        'נקלט בפועל, ורק לפי זה החליטו אם לשדר שוב.',
        'ambiguous_submit_result',
      );
    }

    const confirmed = await confirmDocumentsStep(page);
    if (!confirmed.ok) {
      // ‼ המצב הדו-משמעי היחיד שחשוב באמת: הקובץ אולי נקלט ואולי לא.
      // לא מדווחים «נשלח», ולא מנסים להעלות שוב עיוור — הניסיון הבא
      // מתחיל מאיתור הבקשה ויראה אם הקובץ כבר שם.
      throw new NeedsHumanError(
        `הטופס הועלה אך לא זוהתה ראיה ברורה לקליטה (${confirmed.reason}${confirmed.detail ? ` · ${confirmed.detail}` : ''}). ` +
        'בדקו בחלון שע״ם: אם הקובץ מופיע והבקשה התקדמה — הריצו «בדוק קבלת הייצוג». ' +
        'PIVO לא יסמן «נשלח לשע״ם» בלי ראיה.',
        'ambiguous_submit_result',
      );
    }

    const step = await currentWizardStep(page);
    ctx.log(`הטופס נקלט · שלב נוכחי ${step} · ${confirmed.fileLine}`);
    return {
      result: {
        submissionKey, role, requestNumber,
        submitted: true,
        fileLine: confirmed.fileLine,
        summary: (confirmed.summary ?? '').slice(0, 400),
      },
      artifacts: [{ kind: 'poa_submitted', requestNumber, fileName: doc.fileName }],
    };
  } finally {
    await detach(conn.browser);
  }
}
