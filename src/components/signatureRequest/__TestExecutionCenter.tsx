// ⚠ דף בדיקה — מרכז ביצוע הייצוג בכל מצביו, בלי לגעת בנתוני אמת.
// נטען רק כש-URL כולל ?test-exec=1.

import { useState } from 'react';
import { RepresentationRequest, RepresentationExecution } from '../../types';
import { EmailMessage } from '../../types/emailActivity';
import RepresentationExecutionCenter from '../RepresentationExecutionCenter';
import EmailStatusRow from '../EmailActivity/EmailStatusRow';
import { ClientEmailsList } from '../EmailActivity/ClientEmailsSection';

const MAIL_STATES: { label: string; msg: EmailMessage }[] = [
  { label: 'הגיע בלבד', msg: { id: 'm1', toEmail: 'ruti@example.com', kind: 'sign', status: 'delivered', sentAt: '2026-07-03T10:00:00.000Z', deliveredAt: '2026-07-03T10:00:05.000Z' } },
  { label: 'נכנס לחתום', msg: { id: 'm2', toEmail: 'ruti@example.com', kind: 'sign', status: 'clicked', sentAt: '2026-07-03T10:00:00.000Z', deliveredAt: '2026-07-03T10:00:05.000Z', openedAt: '2026-07-03T12:00:00.000Z', clickedAt: '2026-07-03T12:00:00.000Z' } },
  { label: 'מייל שאינו חתימה (הצעת מחיר)', msg: { id: 'm3', toEmail: 'ruti@example.com', kind: 'quotation', status: 'delivered', sentAt: '2026-07-03T10:00:00.000Z', deliveredAt: '2026-07-03T10:00:05.000Z' } },
];

// רשימת המיילים כפי שהיא נראית בכרטיס הלקוח — כולל מייל עם עותק שמור,
// מייל ישן בלי עותק, ומייל שחזר.
const CLIENT_MAILS: EmailMessage[] = [
  { id: 'c1', toEmail: 'ruti@example.com', kind: 'active', subject: 'הייצוג אושר — נתחיל לעבוד', status: 'opened', sentAt: '2026-07-20T09:30:00.000Z', deliveredAt: '2026-07-20T09:30:07.000Z', openedAt: '2026-07-20T11:02:00.000Z', html: '<html><body dir="rtl" style="font-family:Arial"><h1>הכול מוכן, רותי</h1><p>הייצוג שלכם מול רשויות המס אושר בהצלחה.</p></body></html>' },
  { id: 'c2', toEmail: 'ruti@example.com', kind: 'sign', subject: 'הטופס מוכן — נשאר רק לחתום', status: 'clicked', sentAt: '2026-07-03T10:00:00.000Z', deliveredAt: '2026-07-03T10:00:05.000Z', openedAt: '2026-07-03T12:00:00.000Z', clickedAt: '2026-07-03T12:01:00.000Z' },
  { id: 'c3', toEmail: 'ruti@old-address.com', kind: 'onboard', subject: 'ברוכים הבאים — נשאר רק לאמת את הזהות', status: 'bounced', sentAt: '2026-07-01T08:00:00.000Z' },
];

const BASE: RepresentationRequest = {
  id: 'test-exec-1',
  clientName: 'רותי לקוח',
  status: 'awaiting_accountant',
  createdAt: '2026-07-01T08:00:00.000Z',
  linkedClientId: 'client-1',
  signers: [
    { id: 'client', role: 'client', source: 'client_self', name: 'רותי לקוח', email: 'ruti@example.com', order: 1, signStatus: 'pending' },
    { id: 'spouse', role: 'spouse', source: 'spouse', name: 'דני לקוח', email: 'dani@example.com', order: 2, signStatus: 'pending' },
  ],
} as unknown as RepresentationRequest;

type Scenario = { key: string; label: string; req: RepresentationRequest };

const withSetup = {
  signatureSetup: { pdfFileName: 'ייפוי כוח 2279.pdf', pdfDocId: 'doc-1', fields: [], createdAt: '2026-07-02T10:00:00.000Z' },
};
const ni = (exec: RepresentationExecution) => exec;

const SCENARIOS: Scenario[] = [
  {
    key: 'no-form',
    label: '1. הטופס עוד לא הופק',
    req: { ...BASE, execution: ni({ incomeTax: { enteredAt: '2026-07-02T08:00:00.000Z' } }) },
  },
  {
    key: 'blocked',
    label: '2. הטופס מוכן, חסרה אסמכתא ב״ל (חסום)',
    req: { ...BASE, ...withSetup, execution: ni({ incomeTax: { enteredAt: '2026-07-02T08:00:00.000Z' }, nationalInsurance: { enteredAt: '2026-07-02T09:00:00.000Z' } }) } as RepresentationRequest,
  },
  {
    key: 'ready',
    label: '3. מוכן לשליחה',
    req: { ...BASE, ...withSetup, execution: ni({ incomeTax: { enteredAt: '2026-07-02T08:00:00.000Z' }, nationalInsurance: { enteredAt: '2026-07-02T09:00:00.000Z', referenceNumber: '73882698', deadline: '2028-01-01' } }) } as RepresentationRequest,
  },
  {
    key: 'sent',
    label: '4. נשלח ללקוח',
    req: { ...BASE, ...withSetup, execution: ni({ incomeTax: { enteredAt: '2026-07-02T08:00:00.000Z' }, signatureEmailSentAt: '2026-07-03T10:00:00.000Z', nationalInsurance: { enteredAt: '2026-07-02T09:00:00.000Z', referenceNumber: '73882698', deadline: '2028-01-01', instructionsSentAt: '2026-07-03T10:00:00.000Z', instructionsSentWith: 'signature' } }) } as RepresentationRequest,
  },
  {
    key: 'awaiting',
    label: '5. הוגש לשע״ם — ממתין לאישור',
    req: { ...BASE, ...withSetup, status: 'awaiting_authorities', signedPdfStoredId: 'doc-signed', execution: ni({ incomeTax: { enteredAt: '2026-07-02T08:00:00.000Z' }, signatureEmailSentAt: '2026-07-03T10:00:00.000Z', nationalInsurance: { enteredAt: '2026-07-02T09:00:00.000Z', referenceNumber: '73882698', deadline: '2028-01-01', instructionsSentAt: '2026-07-03T10:00:00.000Z', instructionsSentWith: 'signature', confirmedAt: '2026-07-05T10:00:00.000Z' } }) } as unknown as RepresentationRequest,
  },
  {
    // אחרי הסימון — כאן נבדק שהמייל ללקוח אינו יוצא מעצמו אלא בכפתור
    key: 'active',
    label: '6. הייצוג פעיל (עדכון ללקוח בבחירה)',
    req: { ...BASE, ...withSetup, status: 'active', signedPdfStoredId: 'doc-signed', execution: ni({ incomeTax: { enteredAt: '2026-07-02T08:00:00.000Z' }, signatureEmailSentAt: '2026-07-03T10:00:00.000Z', nationalInsurance: { enteredAt: '2026-07-02T09:00:00.000Z', referenceNumber: '73882698', deadline: '2028-01-01', instructionsSentAt: '2026-07-03T10:00:00.000Z', instructionsSentWith: 'signature', confirmedAt: '2026-07-05T10:00:00.000Z' } }) } as unknown as RepresentationRequest,
  },
];

export default function TestExecutionCenter() {
  // ?req=<id> — מריץ את התרחישים מול בקשה אמיתית, כדי לבדוק את התצוגה המקדימה
  // של המייל (שנבנית בשרת מהבקשה עצמה) בלי לשלוח דבר.
  const realRequestId = new URLSearchParams(window.location.search).get('req');
  const [key, setKey] = useState('ready');
  const [niIncluded, setNiIncluded] = useState(true);
  const [niSpouse, setNiSpouse] = useState(false);
  const sc = SCENARIOS.find(s => s.key === key)!;

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'Heebo, sans-serif', direction: 'rtl' }}>
      <h1>🧪 בדיקה: מרכז ביצוע הייצוג</h1>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {SCENARIOS.map(s => (
          <button key={s.key} className={`btn ${s.key === key ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setKey(s.key)}>
            {s.label}
          </button>
        ))}
        <button className="btn btn-secondary btn-sm" onClick={() => setNiIncluded(v => !v)}>
          ב״ל: {niIncluded ? 'כן' : 'לא'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setNiSpouse(v => !v)}>
          ב״ל גם לבן/בת הזוג: {niSpouse ? 'כן' : 'לא'}
        </button>
      </div>
      <RepresentationExecutionCenter
        key={`${key}-${niIncluded}-${niSpouse}`}
        request={realRequestId ? { ...sc.req, id: realRequestId } : sc.req}
        niIncluded={niIncluded}
        niCoversSpouse={niSpouse}
        onSaveExecution={() => {}}
        onProduce={() => {}}
        onStamp={() => {}}
        onMarkSentToShaam={() => {}}
        onMarkActive={() => {}}
        onSendToSigner={async () => null}
        userId={undefined}
      />

      <h2 style={{ marginTop: '2rem' }}>מיילים בכרטיס הלקוח</h2>
      <ClientEmailsList rows={CLIENT_MAILS} onChanged={() => {}} />

      <h2 style={{ marginTop: '2rem' }}>שורת מצב המייל</h2>
      {MAIL_STATES.map(m => (
        <div key={m.msg.id} style={{ marginBottom: '.6rem' }}>
          <div style={{ fontSize: '.78rem', color: 'var(--gray-500)', marginBottom: 3 }}>{m.label}</div>
          <EmailStatusRow message={m.msg} />
        </div>
      ))}
    </div>
  );
}
