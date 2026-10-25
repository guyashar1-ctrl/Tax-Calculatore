// ─── חתימה + חותמת המשרד על טופס ייפוי הכוח שהלקוחות חתמו ─────────────────────
// ‼ מקור אחד לחדר החתימה של הרו"ח: מרכז הייצוג (RepresentationRequestReview) והשורה
// ב«בקשות» (StampAndSendShaam) צורבים ושומרים בדיוק אותו PDF, באותו מזהה ובאותה תווית.

import type { RepresentationRequest, RepSignatureDocument, SignatureField, SignatureValue } from '../../types';
import type { useDocumentDB } from '../../hooks/useIndexedDB';
import type { SavedMarks } from '../../components/signatureRequest/SigningRoom';
import { burnSignaturesIntoPdf } from '../../utils/signaturePdf';
import { toPureArrayBuffer } from '../../utils/poaPdfGenerator';
import { downloadPrivateDataUrl } from '../../utils/privateAsset';
import { signedDocIdFor } from '../../utils/repDocuments';

type DocDB = Pick<ReturnType<typeof useDocumentDB>, 'getDoc' | 'saveDoc' | 'ensureSystemLabel'>;

export interface StampRoomState {
  doc: RepSignatureDocument;
  pdfBytes: ArrayBuffer;
  marks: SavedMarks;
}

/** חותמת/חתימה מהדלי הפרטי כ-dataURL. pdf-lib תומך ב-PNG/JPG בלבד — SVG מדולג. */
export async function loadBrandingImage(path?: string): Promise<string | undefined> {
  if (!path || /\.svg$/i.test(path)) return undefined;
  return downloadPrivateDataUrl(path);
}

export interface Branding { signaturePath?: string; stampPath?: string }

/** טוען את הטופס שהלקוחות חתמו ואת החתימה והחותמת השמורות — מה שחדר החתימה צריך. */
export async function loadStampRoom(db: DocDB, doc: RepSignatureDocument, branding?: Branding | null): Promise<StampRoomState> {
  const stored = await db.getDoc(doc.pdfDocId);
  if (!stored || stored.fileData.byteLength === 0) throw new Error('ה-PDF שהועלה לא נמצא במאגר המסמכים');
  const [signature, stamp] = await Promise.all([
    loadBrandingImage(branding?.signaturePath),
    loadBrandingImage(branding?.stampPath),
  ]);
  return { doc, pdfBytes: stored.fileData, marks: { signature, stamp } };
}

/**
 * צורב את החתימות והחותמת, שומר את ה-PDF הסופי במאגר המסמכים, ומחזיר את הערכים
 * והמסמכים המעודכנים. ‼ רק המסמך הזה מסומן כהוחתם — הסטטוס מתקדם כשכולם הוחתמו.
 * fields = השדות כפי שהם אחרי גרירה/שינוי גודל בחדר החתימה, ולכן הם שנצרבים.
 */
export async function stampAndStore(
  db: DocDB,
  request: RepresentationRequest,
  docs: RepSignatureDocument[],
  room: StampRoomState,
  values: Record<string, SignatureValue>,
  fields?: SignatureField[],
): Promise<{ values: Record<string, SignatureValue>; docs: RepSignatureDocument[]; pdf: ArrayBuffer }> {
  const target = room.doc;
  const merged = { ...(request.signatureValues || {}), ...values };
  const burned = await burnSignaturesIntoPdf(room.pdfBytes.slice(0), fields || target.fields, merged);
  const storedId = signedDocIdFor(request.id, target.key);
  const many = docs.length > 1;
  // ‼ D4 (179): מסמך שנוצר אוטומטית מקבל תווית מערכת קבועה.
  const labelId = await db.ensureSystemLabel('ייפוי כוח חתום');
  const pdf = toPureArrayBuffer(burned);
  await db.saveDoc({
    id: storedId,
    clientId: request.linkedClientId,
    fileName: `${request.clientName || 'לקוח'} - ייפוי כוח חתום${many ? ` - ${target.title}` : ''}.pdf`,
    fileType: 'application/pdf',
    fileSize: burned.byteLength,
    category: 'other',
    year: 'general',
    labelId,
    uploadedAt: new Date().toISOString(),
    description: `ייפוי כוח חתום (כל החותמים + חותמת המשרד)${many ? ` - ${target.title}` : ''}`,
    notes: '',
    fileData: pdf,
  });
  return {
    values: merged,
    docs: docs.map(d => (d.key === target.key ? { ...d, signedPdfStoredId: storedId } : d)),
    pdf,
  };
}
