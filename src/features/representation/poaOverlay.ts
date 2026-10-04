// ─── מקומות החתימה על ייפוי הכוח, לתצוגה לפני ואחרי חתימת הלקוח (04.10.2026) ──
// ‼ שלושה דברים שונים, ואסור לבלבל ביניהם:
//   1. המסמך המקורי — הקובץ כפי שהגיע משע״ם (או הועלה).
//   2. מקומות חתימה עתידיים — השדות ב-signature_documents. מצוירים **מעל** הקובץ
//      כמסגרת מקווקוות עם שם החותם; לא נצרבים עליו ואינם חתימה.
//   3. חתימות שבוצעו — נצרבות על הקובץ (burnSignaturesIntoPdf / הקובץ הסופי).
// ‼ אין כאן שום מיקום «לדוגמה»: כל מסגרת היא שדה אמיתי מאותו מסמך שנשלח לחתימה.

import type { RepSignatureDocument, RepSigner, SignatureValue } from '../../types';
import type { ViewerOverlay, ViewerOverlayBox } from '../../components/DocumentViewerDialog';
import type { PoaVersion } from './poaVersion';
import { placeLabel, placeTone, signerDisplayName } from './signatureReadiness';

const filled = (v?: SignatureValue) => !!v && (!!v.imageDataUrl || !!v.text);

export function poaOverlay(args: {
  doc: RepSignatureDocument;
  version: PoaVersion;
  signers: RepSigner[];
  values?: Record<string, SignatureValue> | null;
}): ViewerOverlay | null {
  const { doc, version, signers, values } = args;
  if (version.kind === 'final') return null;
  // ‼ «חתום על ידי הלקוח» מורכב עם חתימות הלקוח והסימונים הקבועים — מה שנשאר עתידי
  // הוא רק מה שעוד לא מולא (בפועל: החתימה והחותמת של המשרד).
  const pending = version.kind === 'to_sign' ? doc.fields
    : doc.fields.filter(f => f.signerId === 'accountant' || (f.signerId !== 'static' && !filled(values?.[f.id])));
  const boxes: ViewerOverlayBox[] = pending.map(f => ({
    id: f.id, pageIndex: f.pageIndex, xPct: f.xPct, yPct: f.yPct, widthPct: f.widthPct, heightPct: f.heightPct,
    label: placeLabel(f, signers), tone: placeTone(f.signerId, signers),
  }));

  const legend: ViewerOverlay['legend'] = [];
  const seen = new Set<string>();
  for (const b of boxes) {
    const f = pending.find(x => x.id === b.id)!;
    const key = f.signerId === 'static' ? 'static' : `${f.signerId}|${f.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const n = pending.filter(x => (f.signerId === 'static' ? x.signerId === 'static' : x.signerId === f.signerId && x.kind === f.kind)).length;
    const text = f.signerId === 'static' ? `סימון ✓ שהמשרד מוסיף לפני השליחה${n > 1 ? ` (${n})` : ''}`
      : f.signerId === 'accountant' ? 'המשרד: חתימה וחותמת — אחרי חתימת הלקוח'
      : `${signerDisplayName(f.signerId, signers)}: ${f.kind === 'signature' ? 'חתימה' : 'מילוי'}${n > 1 ? ` (${n} מקומות)` : ''}`;
    legend.push({ tone: b.tone, text });
  }
  const order = ['client', 'spouse', 'office', 'static'];
  legend.sort((a, b) => order.indexOf(a.tone) - order.indexOf(b.tone));

  const note = version.kind === 'client_signed'
    ? 'החתימות של הלקוח שעל הטופס הן החתימות בפועל. המסגרת המקווקוות היא המקום שבו יבואו החתימה והחותמת של המשרד.'
    : 'המסגרות המקווקוות הן המקומות שבהם ייחתם הטופס — הן לא חתימות ולא נשלחות כחלק מהקובץ.';
  return { boxes, legend, note };
}
