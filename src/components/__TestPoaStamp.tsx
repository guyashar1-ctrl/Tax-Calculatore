// דף בדיקה (?test-poastamp) — חתימת הרו"ח + חותמת על **כמה טפסים ברצף**.
//
// בקשה של משק בית מולידה טופס לכל הגשה בשע״ם, וכל אחד נחתם ונצרב בנפרד.
// מה שנבדק כאן:
//   · הכפתור אומר על איזה טופס חותמים עכשיו וכמה נשארו
//   · כל צריבה נשמרת למסמך **שלה** ולא דורסת את קודמו
//   · החתימות והחותמת נופלות על הטופס הנכון (מאמתים בטקסט ה-PDF שנוצר)
//   · הסטטוס מתקדם רק כשכל הטפסים נצרבו
//
// ‼ מריץ את מסך הבקשה האמיתי, לא העתק שלו: מה שנבדק כאן הוא הקוד שרץ בייצור.

import { useState } from 'react';
import { RepresentationRequest, RepSignatureDocument, SignatureValue, Client } from '../types';
import RepresentationRequestReview from './RepresentationRequestReview';
import { withLegacyMirror, signatureDocumentsOf } from '../utils/repDocuments';

const REQ_ID = 'req-poastamp';
const CLIENT_ID = 'client-poastamp';

/** PDF חד-עמודי אמיתי עם טקסט מזהה — נחשף לבדיקת הצריבה מהקונסולה. */
export function makePdf(tag: string): ArrayBuffer {
  const content = `BT /F1 22 Tf 60 700 Td (${tag}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
    + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf).buffer;
}

const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const CLIENT = {
  id: CLIENT_ID, idNumber: '314667346', firstName: 'יאיר', lastName: 'סלע',
  email: 'stamp@example.test', phone: '', city: '', address: '', birthDate: '', gender: 'male',
  incomeTaxType: 'employee', niType: 'employee', vatStatus: 'none',
  familyStatus: 'married', spouseName: 'מיכל סלע', spouseIdNumber: '022321673',
  registeredSpouseVerified: true,
  children: [], tags: [], additionalContacts: [], activity: [],
  representationStatus: 'awaiting_stamp', representationRequestId: REQ_ID,
  authorityRepresentations: {
    incomeTax: { status: 'in_process', level: 'primary' },
    vat: { status: 'in_process', level: 'primary', targets: ['spouse'] },
  },
  taxFiles: [
    { id: 'tf-it', authority: 'income_tax', owner: 'spouse', fileNumber: '022321673', repStatus: 'pending' },
    { id: 'tf-vat', authority: 'vat', owner: 'spouse', fileNumber: '557001122', repStatus: 'pending' },
  ],
  createdAt: '2026-08-01T08:00:00.000Z', updatedAt: '2026-08-01T08:00:00.000Z',
} as unknown as Client;

const DOCS: RepSignatureDocument[] = [
  {
    key: 'person:client', title: 'יאיר סלע · ניכויים',
    pdfDocId: `poa-pdf-${REQ_ID}`, pdfFileName: 'poa-it.pdf', createdAt: '2026-08-02T08:00:00.000Z',
    signedPdfStoredId: null,
    fields: [
      { id: 'f-it-client', signerId: 'client', kind: 'signature', pageIndex: 0, xPct: 0.10, yPct: 0.70, widthPct: 0.25, heightPct: 0.06 },
      { id: 'f-it-spouse', signerId: 'spouse', kind: 'signature', pageIndex: 0, xPct: 0.45, yPct: 0.70, widthPct: 0.25, heightPct: 0.06 },
      { id: 'f-it-acc', signerId: 'accountant', kind: 'stamp', pageIndex: 0, xPct: 0.10, yPct: 0.85, widthPct: 0.20, heightPct: 0.08 },
    ],
  },
  {
    key: 'person:spouse', title: 'מיכל סלע · מס הכנסה, מע"מ',
    pdfDocId: `poa-pdf-${REQ_ID}-person-spouse`, pdfFileName: 'poa-vat.pdf', createdAt: '2026-08-02T08:00:00.000Z',
    signedPdfStoredId: null,
    fields: [
      { id: 'f-vat-client', signerId: 'client', kind: 'signature', pageIndex: 0, xPct: 0.10, yPct: 0.70, widthPct: 0.25, heightPct: 0.06 },
      { id: 'f-vat-spouse', signerId: 'spouse', kind: 'signature', pageIndex: 0, xPct: 0.45, yPct: 0.70, widthPct: 0.25, heightPct: 0.06 },
      { id: 'f-vat-acc', signerId: 'accountant', kind: 'stamp', pageIndex: 0, xPct: 0.10, yPct: 0.85, widthPct: 0.20, heightPct: 0.08 },
    ],
  },
];

const BASE = {
  id: REQ_ID, linkedClientId: CLIENT_ID, clientName: 'יאיר סלע', clientEmail: 'stamp@example.test',
  authorities: ['incomeTax', 'vat'], requestedDocs: [], notes: '',
  status: 'awaiting_stamp',
  createdAt: '2026-08-01T08:00:00.000Z', updatedAt: '2026-08-01T08:00:00.000Z',
  submission: null, submittedAt: null, partB: null, ocrExtracted: null,
  onboardingToken: 'stamptoken', onboardingStatus: 'submitted',
  identification: { idNumber: '314667346', firstName: 'יאיר', lastName: 'סלע' },
  onboardingSubmittedAt: '2026-08-02T08:00:00.000Z',
  execution: { incomeTax: { enteredAt: '2026-08-03T08:00:00.000Z' } },
  scope: {
    incomeTax: { status: 'in_process', level: 'primary' },
    vat: { status: 'in_process', level: 'primary', targets: ['spouse'] },
  },
  // שני החותמים כבר חתמו על שני הטפסים — נשארה החתימה והחותמת של הרו"ח
  signers: [
    { id: 'client', role: 'client', name: 'יאיר סלע', email: 'stamp@example.test', signStatus: 'signed' },
    { id: 'spouse', role: 'spouse', name: 'מיכל סלע', email: '', signStatus: 'signed' },
  ],
  signatureValues: {
    'f-it-client': { fieldId: 'f-it-client', imageDataUrl: SIG },
    'f-it-spouse': { fieldId: 'f-it-spouse', imageDataUrl: SIG },
    'f-vat-client': { fieldId: 'f-vat-client', imageDataUrl: SIG },
    'f-vat-spouse': { fieldId: 'f-vat-spouse', imageDataUrl: SIG },
  },
  ...withLegacyMirror(DOCS),
} as unknown as RepresentationRequest;

export default function TestPoaStamp() {
  // ‼ ‎?stamped=0|1|2‎ — כמה טפסים כבר נצרבו, לבדיקת התוויות והמונה בכל מצב.
  const [request, setRequest] = useState<RepresentationRequest>(() => {
    const n = Number(new URLSearchParams(window.location.search).get('stamped') || 0);
    const docs = DOCS.map((d, i) => ({ ...d, signedPdfStoredId: i < n ? `signed-${d.key}` : null }));
    return { ...BASE, ...withLegacyMirror(docs) } as RepresentationRequest;
  });

  const poaDocs = signatureDocumentsOf(request);

  return (
    <div style={{ direction: 'rtl' }}>
      <div id="tst-state" style={{ padding: '.6rem 1rem', background: 'var(--surface-2)', fontSize: 13 }}>
        סטטוס: {request.status} · נצרבו: {poaDocs.filter(d => d.signedPdfStoredId).length}/{poaDocs.length}
        {' · '}{poaDocs.map(d => `${d.title}=${d.signedPdfStoredId || '—'}`).join(' | ')}
      </div>
      <RepresentationRequestReview
        request={request}
        onBack={() => {}}
        onProduceWithSetup={() => {}}
        onSaveSignedPdf={(_r, values: Record<string, SignatureValue>, docs: RepSignatureDocument[]) => {
          // מחקה את handleSaveSignedPdf ב-App
          setRequest(r => ({ ...r, signatureValues: values, ...withLegacyMirror(docs) } as RepresentationRequest));
        }}
        onMarkSentToShaam={() => {}}
        onSign={() => {}}
        onMarkActive={() => {}}
        onDelete={() => {}}
        onOpenFill={() => {}}
        onOpenClientDocs={() => {}}
        niIncluded={false}
        onSaveExecution={() => {}}
        linkedClient={CLIENT}
      />
    </div>
  );
}
