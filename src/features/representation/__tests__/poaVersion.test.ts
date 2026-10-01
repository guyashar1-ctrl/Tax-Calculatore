// ─── «צפייה בייפוי הכוח» — איזו גרסה נפתחת (01.10.2026) ───────────────────────
import { test, equal } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { currentPoaVersion, noPoaReason, clientSignedDoc } from '../poaVersion';
import type { RepSignatureDocument, SignatureField } from '../../../types';

const field = (id: string, signerId: string, kind: SignatureField['kind'] = 'signature'): SignatureField =>
  ({ id, signerId, kind, pageIndex: 0, xPct: 0, yPct: 0, widthPct: 0.1, heightPct: 0.05 });
const DOC: RepSignatureDocument = {
  key: 'person:client', title: 'מס הכנסה, מע"מ, ניכויים', pdfDocId: 'form-1', pdfFileName: 'ייפוי כוח.pdf',
  fields: [field('c1', 'client'), field('c2', 'client', 'text'), field('a1', 'accountant'), field('l1', 'client', 'label')],
  createdAt: '2026-09-28T10:00:00Z',
};
const v = (id: string) => ({ fieldId: id, signedAt: '2026-09-29T10:00:00Z', imageDataUrl: 'data:' });

export const TESTS: TestCase[] = [
  test('לפני חתימה ⇒ הטופס כפי שהגיע משע״ם', () => {
    const r = currentPoaVersion({ doc: DOC, values: {}, allSignersDone: false });
    equal(r.kind, 'to_sign');
    equal(r.documentId, 'form-1');
    equal(r.burnClientSignatures, false);
  }),
  test('הלקוח חתם על כל השדות שלו (לא על של המשרד) ⇒ «חתום על ידי הלקוח», מורכב לתצוגה', () => {
    const vals = { c1: v('c1'), c2: v('c2') };
    equal(clientSignedDoc(DOC, vals), true);
    const r = currentPoaVersion({ doc: DOC, values: vals, allSignersDone: true, clientName: 'עידו' });
    equal(r.kind, 'client_signed');
    equal(r.burnClientSignatures, true);
    equal(r.documentId, 'form-1');
  }),
  test('חתימה חלקית של הלקוח ⇒ עדיין «לחתימה»', () => {
    equal(currentPoaVersion({ doc: DOC, values: { c1: v('c1') }, allSignersDone: false }).kind, 'to_sign');
  }),
  test('חתום ומוחתם ⇒ הקובץ הסופי — גם כשהוא שמור רק ברמת הבקשה (טופס יחיד)', () => {
    equal(currentPoaVersion({ doc: { ...DOC, signedPdfStoredId: 'final-1' }, values: {}, allSignersDone: true }).documentId, 'final-1');
    const legacy = currentPoaVersion({ doc: DOC, values: {}, allSignersDone: true, legacyFinalId: 'final-req' });
    equal(legacy.kind, 'final');
    equal(legacy.documentId, 'final-req');
  }),
  test('טופס שבוטל בגלל הסרת רשות ⇒ אין «נוכחי», והסבר עם מספר הבקשה', () => {
    const t = noPoaReason({ replacementRequestNumber: '2026544926', entered: true });
    equal(/2026544926/.test(t) && /בוטל/.test(t), true);
    equal(/יגיע משע״ם/.test(noPoaReason({ entered: false })), true);
  }),
];
