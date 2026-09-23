// ─── בדיקות: מתי מותר לאשר את חתימת בן/ת הזוג בשע״ם ─────────────────────────
// ‼ התיבה «אני מאשר את חתימת בן/ת הזוג על טופס ייפוי הכוח» היא הצהרה של
// המייצג. הדגל נשלח לעובד רק כשהטופס החתום עצמו מוכיח אותה.

import type { Client, RepresentationRequest, RepSignatureDocument } from '../../../types';
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { spouseSignatureProof } from '../shaamSpouseConfirmation';
import { FORM_2279_TEMPLATE } from '../shaamRepresentation';

/** הבקשה של הדסה סלע כפי שהיא שמורה בפרודקשן (23.09.2026), בלי התמונות. */
function hadassa() {
  const T = FORM_2279_TEMPLATE;
  const doc: RepSignatureDocument = {
    key: 'person:client', title: 'הדסה סלע · מס הכנסה, מע"מ',
    pdfDocId: 'poa-pdf-9cec3ac2-person-client', pdfFileName: 'ייפוי כח לחתימה הדס וסלע.pdf',
    createdAt: '2026-09-23T09:29:34.644Z',
    signedPdfStoredId: 'signed-poa-9cec3ac2-person-client',
    fields: [
      { id: 'f-client', signerId: 'client', kind: 'signature', pageIndex: 0, ...T.registeredSigner },
      { id: 'f-spouse', signerId: 'spouse', kind: 'signature', pageIndex: 0, ...T.otherSpouse },
      { id: 'f-stamp', signerId: 'accountant', kind: 'stamp', pageIndex: 0, ...T.accountantStamp },
    ],
  } as unknown as RepSignatureDocument;
  const request = {
    id: '9cec3ac2',
    signers: [
      { id: 'client', role: 'client', name: 'הדסה סלע', signStatus: 'signed' },
      { id: 'spouse', role: 'spouse', name: 'יאיר סלע', signStatus: 'signed' },
    ],
    signatureValues: {
      'f-client': { fieldId: 'f-client', imageDataUrl: 'data:image/png;base64,x', signedAt: '2026-09-23T18:07:37.511Z' },
      'f-spouse': { fieldId: 'f-spouse', imageDataUrl: 'data:image/png;base64,x', signedAt: '2026-09-23T18:28:13.336Z' },
      'f-stamp': { fieldId: 'f-stamp', imageDataUrl: 'data:image/png;base64,x', signedAt: '2026-09-23T18:38:05.787Z' },
    },
  } as unknown as RepresentationRequest;
  const client = {
    firstName: 'הדסה', lastName: 'סלע', idNumber: '034605212', gender: 'male',
    familyStatus: 'married', spouseName: 'יאיר סלע', spouseIdNumber: '036693828',
    registeredSpouseVerified: true,
    taxFiles: [{ id: 'tf-rep-incomeTax', authority: 'income_tax', owner: 'client', fileNumber: '034605212' }],
  } as unknown as Client;
  return { doc, request, client };
}

export const TESTS: TestCase[] = [
  test('15 · הדסה סלע — נשואים, הדסה רשומה, שתי חתימות + חותמת בתיבות הנכונות ⇒ מוכח', () => {
    const { doc, request, client } = hadassa();
    const r = spouseSignatureProof(request, client, doc, true);
    assert(r.ok, r.reason ?? '');
  }),

  test('9 · חסרה חתימת בן/בת הזוג ⇒ לא מוכח', () => {
    const { doc, request, client } = hadassa();
    const values = { ...request.signatureValues };
    delete values['f-spouse'];
    const r = spouseSignatureProof({ ...request, signatureValues: values }, client, doc, true);
    equal(r.ok, false);
    assert((r.reason ?? '').includes('בן/בת הזוג'), r.reason ?? '');
  }),

  test('9ב · בן/בת הזוג לא מסומן/ת כחותם/ת ⇒ לא מוכח', () => {
    const { doc, request, client } = hadassa();
    const signers = request.signers!.map(s => s.id === 'spouse' ? { ...s, signStatus: 'pending' } : s);
    equal(spouseSignatureProof({ ...request, signers } as RepresentationRequest, client, doc, true).ok, false);
  }),

  test('10 · לא הוכרע מי רשום/ה במ"ה ⇒ לא מוכח', () => {
    const { doc, request, client } = hadassa();
    equal(spouseSignatureProof(request, { ...client, taxFiles: [] } as Client, doc, true).ok, false);
    equal(spouseSignatureProof(request, { ...client, registeredSpouseVerified: false } as Client, doc, true).ok, false);
  }),

  test('10ב · הרשום/ה חתם/ה בתיבה השמאלית (לא «בן זוג רשום») ⇒ לא מוכח', () => {
    const { doc, request, client } = hadassa();
    const flipped = { ...client, taxFiles: [{ ...client.taxFiles![0], owner: 'spouse' }] } as Client;
    const r = spouseSignatureProof(request, flipped, doc, true);
    equal(r.ok, false);
    assert((r.reason ?? '').includes('בן זוג רשום'), r.reason ?? '');
  }),

  test('חסרה חותמת/חתימת מייצג, או אין PDF סופי ⇒ לא מוכח', () => {
    const { doc, request, client } = hadassa();
    const values = { ...request.signatureValues };
    delete values['f-stamp'];
    equal(spouseSignatureProof({ ...request, signatureValues: values }, client, doc, true).ok, false);
    equal(spouseSignatureProof(request, client, { ...doc, signedPdfStoredId: null }, true).ok, false);
  }),

  test('לא נשואים ⇒ אין מה לאשר', () => {
    const { doc, request, client } = hadassa();
    equal(spouseSignatureProof(request, client, doc, false).ok, false);
  }),
];
