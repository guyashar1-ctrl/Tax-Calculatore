// ─── איזו גרסה של ייפוי הכוח היא «הנוכחית» (01.10.2026) ──────────────────────
// גיא: «צפה בייפוי הכוח» — פעולה אחת שפותחת את הגרסה הרלוונטית והעדכנית:
// לפני חתימה, אחרי חתימת הלקוח, ואחרי חתימת המשרד והחותמת.
// ‼ טופס שהוחלף בעקבות הסרת רשות (208) אינו ב-signature_documents — הוא לעולם
// לא מוצג כאן כ«נוכחי». כשהוחלף ועוד אין חדש — אומרים את זה, בלי קובץ.
// ‼ «חתום על ידי הלקוח» אינו קובץ שמור: הוא הטופס + החתימות של הלקוח בלבד,
// מורכב לתצוגה (burnSignaturesIntoPdf). הקובץ הסופי נוצר רק בחתימה והחותמת.

import type { RepSignatureDocument, SignatureField, SignatureValue } from '../../types';

export type PoaVersionKind = 'final' | 'client_signed' | 'to_sign';

export interface PoaVersion {
  kind: PoaVersionKind;
  /** תווית קצרה לשורה: «לחתימה» / «חתום על ידי הלקוח» / «סופי». */
  label: string;
  /** משפט אחד: מה רואים, ומה עוד חסר. */
  caption: string;
  /** המסמך השמור שמוצג (הסופי, או הטופס שעליו מרכיבים). */
  documentId: string;
  /** להרכיב את חתימות הלקוח על הטופס לפני ההצגה. */
  burnClientSignatures: boolean;
  fileName: string;
}

/** שדות שהלקוח (או בן/בת הזוג) ממלא — לא של המשרד. */
export function clientFieldsOf(fields: SignatureField[]): SignatureField[] {
  return fields.filter(f => f.signerId !== 'accountant');
}

/** כל שדות הלקוח בטופס מולאו. */
export function clientSignedDoc(doc: RepSignatureDocument, values: Record<string, SignatureValue> | null | undefined): boolean {
  const mine = clientFieldsOf(doc.fields).filter(f => f.kind !== 'label' && f.kind !== 'check' && f.kind !== 'cross');
  return mine.length > 0 && mine.every(f => !!values?.[f.id]);
}

/**
 * @param doc            טופס נוכחי אחד (signatureDocumentsOf).
 * @param values         request.signatureValues.
 * @param allSignersDone כל החותמים חתמו (effectiveSignStatus) — לטפסים בלי שדות לקוח.
 * @param legacyFinalId  request.signedPdfStoredId — כשיש טופס יחיד.
 */
export function currentPoaVersion(args: {
  doc: RepSignatureDocument;
  values?: Record<string, SignatureValue> | null;
  allSignersDone: boolean;
  legacyFinalId?: string | null;
  clientName?: string;
}): PoaVersion {
  const { doc, values, allSignersDone, legacyFinalId, clientName } = args;
  const base = (doc.pdfFileName || 'ייפוי כוח').replace(/\.pdf$/i, '');
  const finalId = doc.signedPdfStoredId || legacyFinalId || null;
  if (finalId) {
    return {
      kind: 'final', label: 'סופי - חתום ומוחתם', documentId: finalId, burnClientSignatures: false,
      caption: 'חתום על ידי הלקוח ועל ידך, עם החותמת. זה הקובץ שמוגש לשע״ם.',
      fileName: `${base} - חתום.pdf`,
    };
  }
  if (clientSignedDoc(doc, values) || (allSignersDone && clientFieldsOf(doc.fields).length === 0)) {
    return {
      kind: 'client_signed', label: 'חתום על ידי הלקוח', documentId: doc.pdfDocId, burnClientSignatures: true,
      caption: `${clientName ? `החתימה של ${clientName} על הטופס` : 'הטופס עם חתימת הלקוח'}. החתימה והחותמת שלך עוד חסרות.`,
      fileName: `${base} - חתום על ידי הלקוח.pdf`,
    };
  }
  return {
    kind: 'to_sign', label: 'לחתימה - עוד לא נחתם', documentId: doc.pdfDocId, burnClientSignatures: false,
    caption: 'הטופס כפי שהגיע משע״ם, לפני חתימה.',
    fileName: `${base}.pdf`,
  };
}

/** מה מוצג כשאין טופס נוכחי — ולמה. */
export function noPoaReason(args: { replacementRequestNumber?: string | null; entered: boolean }): string {
  if (args.replacementRequestNumber) {
    return `הטופס הקודם בוטל יחד עם בקשה ${args.replacementRequestNumber}. טופס חדש יגיע משע״ם עם פתיחת הבקשה החדשה.`;
  }
  return args.entered ? 'הטופס יגיע משע״ם, ואזורי החתימה יסומנו אוטומטית.' : 'הטופס יגיע משע״ם אחרי פתיחת הבקשה.';
}
