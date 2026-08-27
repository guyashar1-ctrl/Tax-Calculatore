// ─── טופסי ה-2279 של הבקשה ────────────────────────────────────────────────────
//
// עד כה לבקשה היה טופס אחד: `signatureSetup` יחיד ו-`signedPdfStoredId` יחיד.
// זה מספיק כשכל הרשויות שייכות לאותו תיק, אבל מע"מ וניכויים מוגשים בנפרד לכל
// אדם, ובחלק ב' של הטופס יש שורת «שם העוסק» אחת — שני תיקי מע"מ לא נכנסים
// לטופס אחד.
//
// ‼ כלל התאימות, ובמקום אחד: **אין רשימה ⇒ מסמך יחיד מהשדות הישנים**. בקשה
// שנוצרה לפני המהלך ממשיכה לעבוד בלי מיגרציה ובלי פרשנות חדשה. בקשה חדשה
// כותבת גם את הרשימה וגם ממשיכה לשקף את המסמך הראשון בשדות הישנים, כדי שכל
// הקוראים שלהם (get_onboarding.has_setup, submit_signature, מסכי סטטוס)
// ימשיכו לעבוד בלי לדעת עליה.

import type {
  RepresentationRequest, RepSignatureDocument, SignatureField, SignatureValue,
} from '../types';

/** המסמכים של הבקשה. תמיד מחזיר רשימה — ריקה רק כשטרם הופק דבר. */
export function signatureDocumentsOf(req: RepresentationRequest): RepSignatureDocument[] {
  if (req.signatureDocuments && req.signatureDocuments.length) return req.signatureDocuments;
  const s = req.signatureSetup;
  if (!s) return [];
  return [{
    key: 'incomeTax',
    title: 'ייפוי כוח',
    pdfDocId: s.pdfDocId,
    pdfFileName: s.pdfFileName,
    fields: s.fields,
    createdAt: s.createdAt,
    signedPdfStoredId: req.signedPdfStoredId ?? null,
  }];
}

/** כל השדות של כל המסמכים, כרשימה אחת. */
export function allFieldsOf(req: RepresentationRequest): SignatureField[] {
  return signatureDocumentsOf(req).flatMap(d => d.fields);
}

/**
 * האם החותם השלים את **כל** המסמכים.
 *
 * ‼ הבדיקה הזאת היא הלב של המעבר לריבוי מסמכים: `signStatus` הוא ברמת
 * הבקשה, ולכן חתימה על המסמך הראשון הייתה מסמנת את החותם כגמור ומקדמת את
 * הבקשה כולה ל"ממתין לחותמת" בזמן שנשארו טפסים לא-חתומים.
 */
export function signerCompletedAll(
  req: RepresentationRequest,
  signerId: string,
  values: Record<string, SignatureValue> | undefined | null,
): boolean {
  const mine = allFieldsOf(req).filter(f => f.signerId === signerId);
  if (!mine.length) return true;
  return mine.every(f => {
    const v = values?.[f.id];
    return !!v && (!!v.imageDataUrl || !!v.text);
  });
}

/** מזהה ה-PDF במאגר המסמכים. ‼ ייחודי למסמך — קבוע-לבקשה היה דורס בין טפסים. */
export function pdfDocIdFor(requestId: string, key: string): string {
  return key === 'incomeTax' ? `poa-pdf-${requestId}` : `poa-pdf-${requestId}-${key.replace(/[^a-z0-9]+/gi, '-')}`;
}

/** מזהה ה-PDF החתום הסופי של מסמך. אותה הצמדה לשם הישן במסמך הראשון. */
export function signedDocIdFor(requestId: string, key: string): string {
  return key === 'incomeTax' ? `signed-poa-${requestId}` : `signed-poa-${requestId}-${key.replace(/[^a-z0-9]+/gi, '-')}`;
}

/** כל המסמכים הוחתמו והוטבעה עליהם חותמת. */
export function allDocumentsStamped(req: RepresentationRequest): boolean {
  const docs = signatureDocumentsOf(req);
  return docs.length > 0 && docs.every(d => !!d.signedPdfStoredId);
}

/**
 * מיזוג המסמך הראשון בחזרה לשדות הישנים. נקרא בכל כתיבה של הרשימה, כדי
 * שהתאימות לא תישען על זכירה נקודתית בכל מקום קריאה.
 */
export function withLegacyMirror(docs: RepSignatureDocument[]): Partial<RepresentationRequest> {
  const first = docs[0];
  return {
    signatureDocuments: docs,
    signatureSetup: first
      ? { pdfDocId: first.pdfDocId, pdfFileName: first.pdfFileName, fields: first.fields, createdAt: first.createdAt }
      : null,
    signedPdfStoredId: first?.signedPdfStoredId ?? null,
  };
}
