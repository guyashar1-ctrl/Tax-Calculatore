// דף בדיקה — הנגישות למסמכים של לקוח שנמצא בתהליך ייצוג, בלי לגעת בנתוני אמת.
// נטען רק כש-URL כולל ?test-repdocs=1.
//
// שלושה דברים נבדקים כאן:
//   1. שורת "בתהליך ייצוג" ברשימת הלקוחות — כפתור "כרטיס" פותח את הכרטיס
//      ולא את מסך הבקשה.
//   2. מסך בקשת הייצוג — כפתור "מסמכי הלקוח" מוביל לכרטיס עם לשונית המסמכים.
//   3. הכלל "רק ייפוי הכוח העדכני מוצג" — withoutSupersededPoa.

import { useState } from 'react';
import { Client, RepresentationRequest } from '../../types';
import { StoredDoc, withoutSupersededPoa } from '../../hooks/useIndexedDB';
import ClientList from '../ClientList';
import ClientWorkspace from '../ClientWorkspace';
import RepresentationRequestReview from '../RepresentationRequestReview';

const REQ_ID = 'req-test-docs';
const CLIENT_ID = 'client-test-docs';

const CLIENT = {
  id: CLIENT_ID,
  idNumber: '000000000',
  firstName: 'בדיקה',
  lastName: 'בתהליך',
  email: 'test@example.com',
  phone: '',
  city: '',
  address: '',
  birthDate: '',
  gender: 'male',
  incomeTaxType: 'employee',
  niType: 'employee',
  vatStatus: 'none',
  familyStatus: 'single',
  children: [],
  tags: [],
  additionalContacts: [],
  activity: [],
  representationStatus: 'awaiting_accountant',
  representationRequestId: REQ_ID,
  authorityRepresentations: { incomeTax: { status: 'in_process', level: 'primary' } },
  createdAt: '2026-07-01T08:00:00.000Z',
  updatedAt: '2026-07-01T08:00:00.000Z',
} as unknown as Client;

const REQUEST = {
  id: REQ_ID,
  linkedClientId: CLIENT_ID,
  clientName: 'בדיקה בתהליך',
  clientEmail: 'test@example.com',
  authorities: ['incomeTax'],
  requestedDocs: [],
  notes: '',
  status: 'awaiting_accountant',
  createdAt: '2026-07-01T08:00:00.000Z',
  updatedAt: '2026-07-01T08:00:00.000Z',
  submission: null,
  submittedAt: null,
  partB: null,
  signedPdfStoredId: null,
  ocrExtracted: null,
  onboardingStatus: 'submitted',
  identification: null,
  onboardingSubmittedAt: '2026-07-02T08:00:00.000Z',
  signers: [
    { id: 'client', role: 'client', name: 'בדיקה בתהליך', email: 'test@example.com', order: 1, signStatus: 'pending' },
  ],
} as unknown as RepresentationRequest;

const doc = (id: string, description: string): StoredDoc => ({
  id,
  clientId: CLIENT_ID,
  fileName: `${description}.pdf`,
  fileType: 'application/pdf',
  fileSize: 1024,
  category: 'other',
  year: 'general',
  uploadedAt: '2026-07-02T08:00:00.000Z',
  description,
  notes: '',
  fileData: new ArrayBuffer(0),
  _remote: true,
});

const UNSIGNED = doc(`poa-pdf-${REQ_ID}`, 'טופס ייפוי כוח — לחתימה');
const SIGNED = doc(`signed-poa-${REQ_ID}`, 'ייפוי כוח חתום (כל החותמים + חותמת המשרד)');
const CONTRACT = doc('engagement-q-1', 'הצעת מחיר שאושרה ונחתמה');

export default function TestRepDocs() {
  const [log, setLog] = useState<string[]>([]);
  const [screen, setScreen] = useState<'list' | 'review' | 'card'>('list');
  const push = (s: string) => setLog(l => [`${new Date().toLocaleTimeString('he-IL')} — ${s}`, ...l]);

  const beforeSign = [UNSIGNED, CONTRACT];
  const afterSign = [UNSIGNED, SIGNED, CONTRACT];

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'Heebo, sans-serif', direction: 'rtl' }}>
      <h1>בדיקה: מסמכים של לקוח בתהליך ייצוג</h1>

      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem' }}>
        <button className={`btn btn-sm ${screen === 'list' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setScreen('list')}>
          1. רשימת הלקוחות
        </button>
        <button className={`btn btn-sm ${screen === 'review' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setScreen('review')}>
          2. מסך בקשת הייצוג
        </button>
        <button className={`btn btn-sm ${screen === 'card' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setScreen('card')}>
          3. הכרטיס כפי שנפתח מהכפתור (לשונית מסמכים)
        </button>
      </div>

      {/* 3. כלל ההחלפה — לפני ואחרי שנוצר ייפוי כוח חתום */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><div className="card-title">מה מוצג ברשימת המסמכים</div></div>
        <div className="card-body" style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div id="docs-before">
            <div style={{ fontWeight: 600, fontSize: '.85rem', marginBottom: '.3rem' }}>לפני החתימה</div>
            {withoutSupersededPoa(beforeSign).map(d => <div key={d.id} style={{ fontSize: '.8rem' }}>• {d.description}</div>)}
          </div>
          <div id="docs-after">
            <div style={{ fontWeight: 600, fontSize: '.85rem', marginBottom: '.3rem' }}>אחרי שנוצר ייפוי כוח חתום</div>
            {withoutSupersededPoa(afterSign).map(d => <div key={d.id} style={{ fontSize: '.8rem' }}>• {d.description}</div>)}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><div className="card-title">מה נלחץ</div></div>
        <div className="card-body" style={{ fontSize: '.82rem', minHeight: 40 }}>
          {log.length === 0 ? <span style={{ color: 'var(--gray-500)' }}>עדיין לא נלחץ דבר</span> : log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>

      {screen === 'list' ? (
        <ClientList
          clients={[CLIENT]}
          requests={[REQUEST]}
          tasks={[]}
          onSelect={id => push(`onSelect (כרטיס הלקוח) — ${id}`)}
          onAdd={() => push('onAdd')}
          onDelete={id => push(`onDelete — ${id}`)}
          onLoadSamples={() => push('onLoadSamples')}
          onAddRequest={() => push('onAddRequest')}
          onSelectRequest={id => push(`onSelectRequest (מסך הבקשה) — ${id}`)}
        />
      ) : screen === 'card' ? (
        <ClientWorkspace
          client={CLIENT}
          clients={[CLIENT]}
          tasks={[]}
          initialTab="docs"
          onSave={() => push('onSave')}
          onCancel={() => push('onCancel')}
          onDelete={id => push(`onDelete — ${id}`)}
          onAddTaskForClient={id => push(`onAddTaskForClient — ${id}`)}
          onSelectTask={id => push(`onSelectTask — ${id}`)}
          onToggleTaskDone={id => push(`onToggleTaskDone — ${id}`)}
          onChangeTaskStatus={() => push('onChangeTaskStatus')}
          onChangeTaskBall={() => push('onChangeTaskBall')}
          onChangeTaskCategory={() => push('onChangeTaskCategory')}
          onReorderTask={() => push('onReorderTask')}
          onDeleteTask={id => push(`onDeleteTask — ${id}`)}
        />
      ) : (
        <RepresentationRequestReview
          request={REQUEST}
          onBack={() => push('onBack')}
          onProduceWithSetup={() => push('onProduceWithSetup')}
          onSaveSignedPdf={() => push('onSaveSignedPdf')}
          onMarkSentToShaam={() => push('onMarkSentToShaam')}
          onSign={() => push('onSign')}
          onMarkActive={() => push('onMarkActive')}
          onDelete={id => push(`onDelete — ${id}`)}
          onOpenFill={id => push(`onOpenFill — ${id}`)}
          onOpenClientDocs={id => push(`onOpenClientDocs (כרטיס + לשונית מסמכים) — ${id}`)}
          niIncluded={false}
          onSaveExecution={() => push('onSaveExecution')}
        />
      )}
    </div>
  );
}
