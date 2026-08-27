// דף בדיקה (?test-regspouse) — מחזור החיים של "בן/בת הזוג הרשום/ה במס הכנסה".
//
// הכוונה נרשמת בפתיחת הייצוג ומסומנת «טרם אומת מול מ"ה». ההכרעה נעשית פעם
// אחת, בתוך שלב "הפרטים הוזנו בשע״ם" שבמרכז הביצוע — הרגע שבו הרו"ח פותח את
// הבקשה בשע״ם ורואה מי רשום שם באמת. אין מסך אימות שני.
//
// התרחישים שנבדקים כאן:
//   1. כוונה = הלקוח   → שע״ם מאשר את הלקוח
//   2. כוונה = בן הזוג → שע״ם מאשר את בן הזוג
//   3. כוונה = הלקוח   → מתברר שבן הזוג הוא הרשום
//   4. כוונה = בן הזוג → מתברר שהלקוח הוא הרשום
//   5. לקוח ותיק — אין תיק מ"ה ואיש לא נשאל. חייב להישאל, ואסור שתופיע
//      הצהרה «X הוא בן הזוג הרשום» לפני שהכריעו.
//   6. לקוח ותיק ששלב שע״ם שלו כבר סומן — משלים רק את ההכרעה החסרה, ותאריך
//      הסימון המקורי נשאר.
//
// המצב נשמר ב-localStorage כדי שרענון יראה מה נטען מחדש — סימולציה של
// טעינת כרטיס שכבר אומת. הפרסיסטנטיות האמיתית היא בעמודה במסד.

import { useState } from 'react';
import { Client, RepresentationRequest, TaxFileInfo } from '../types';
import RepresentationRequestReview from './RepresentationRequestReview';
import PersonQuickView from './PersonQuickView';
import TaxFilesSection from './clientTabs/TaxFilesSection';
import { buildPersonRows } from '../utils/personDirectory';

const REQ_ID = 'req-test-regspouse';
const CLIENT_ID = 'client-test-regspouse';
const STORE_KEY = 'test-regspouse-client';

// intent=null מדמה לקוח ותיק: אין תיק מ"ה בכרטיס, ואיש מעולם לא נשאל.
function baseClient(intent: 'client' | 'spouse' | null): Client {
  return {
    id: CLIENT_ID,
    idNumber: '314667346',
    firstName: 'יאיר',
    lastName: 'סלע',
    email: 'test@example.com',
    phone: '',
    city: '',
    address: '',
    birthDate: '',
    gender: 'male',
    incomeTaxType: 'employee',
    niType: 'employee',
    vatStatus: 'none',
    familyStatus: 'married',
    spouseName: 'מיכל סלע',
    spouseIdNumber: '022321673',
    children: [],
    tags: [],
    additionalContacts: [],
    activity: [],
    representationStatus: 'awaiting_accountant',
    representationRequestId: REQ_ID,
    authorityRepresentations: { incomeTax: { status: 'in_process', level: 'primary' } },
    taxFiles: intent === null ? [] : [
      {
        id: 'tf-it',
        authority: 'income_tax',
        owner: intent,
        fileNumber: intent === 'spouse' ? '022321673' : '314667346',
        repStatus: 'pending',
      },
    ],
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-01T08:00:00.000Z',
  } as unknown as Client;
}

// ‼ onboardingToken + onboardingStatus='submitted' — בלעדיהם מרכז הביצוע
// (ושלב "הפרטים הוזנו בשע״ם" שבתוכו) כלל לא מוצג.
const REQUEST = {
  id: REQ_ID,
  linkedClientId: CLIENT_ID,
  clientName: 'יאיר סלע',
  clientEmail: 'test@example.com',
  authorities: ['incomeTax', 'vat', 'withholding'],
  // ‼ ההיקף ההיסטורי: מ"ה למשק הבית, מע"מ לבן/בת הזוג בלבד, ניכויים לשניהם
  scope: {
    incomeTax: { status: 'in_process', level: 'primary' },
    vat: { status: 'in_process', level: 'primary', targets: ['spouse'] },
    withholding: { status: 'in_process', level: 'primary', targets: ['client', 'spouse'] },
    nationalInsurance: { status: 'in_process', coversSpouse: true },
  },
  requestedDocs: [],
  notes: '',
  status: 'awaiting_accountant',
  createdAt: '2026-08-01T08:00:00.000Z',
  updatedAt: '2026-08-01T08:00:00.000Z',
  submission: null,
  submittedAt: null,
  partB: null,
  signedPdfStoredId: null,
  ocrExtracted: null,
  onboardingToken: 'testtoken',
  onboardingStatus: 'submitted',
  identification: { idNumber: '314667346', firstName: 'יאיר', lastName: 'סלע' },
  onboardingSubmittedAt: '2026-08-02T08:00:00.000Z',
  execution: {},
  signers: [
    { id: 'client', role: 'client', name: 'יאיר סלע', email: 'test@example.com', signStatus: 'pending' },
  ],
} as unknown as RepresentationRequest;

export default function TestRegisteredSpouse() {
  // ‼ ‎?intent=spouse|client|legacy&verified=1‎ — כדי שאפשר יהיה לצלם כל מצב בלי ללחוץ
  const [client, setClient] = useState<Client>(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.has('intent') || q.has('verified')) {
      const i = q.get('intent');
      const c = baseClient(i === 'spouse' ? 'spouse' : i === 'legacy' ? null : 'client');
      return q.get('verified') === '1' ? { ...c, registeredSpouseVerified: true } : c;
    }
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw) as Client;
    } catch { /* אין מצב שמור — מתחילים מהתרחיש הראשון */ }
    return baseClient('client');
  });
  const [request, setRequest] = useState<RepresentationRequest>(() => (
    new URLSearchParams(window.location.search).get('entered') === '1'
      ? { ...REQUEST, execution: { incomeTax: { enteredAt: '2026-08-27T08:00:00.000Z' } } }
      : REQUEST
  ));

  function save(next: Client) {
    setClient(next);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* לא חוסם */ }
  }

  function reset(intent: 'client' | 'spouse' | null) {
    save(baseClient(intent));
    setRequest(REQUEST);
  }

  // מחקה בדיוק את handleConfirmRegisteredSpouse ב-App
  function confirmRegistered(_clientId: string, owner: 'client' | 'spouse') {
    const ownerId = (owner === 'spouse' ? client.spouseIdNumber : client.idNumber)?.trim();
    const files = (client.taxFiles ?? []).map((f): TaxFileInfo => (f.authority === 'income_tax'
      ? {
          ...f,
          owner,
          ...(ownerId && (!f.fileNumber || f.fileNumber === client.idNumber || f.fileNumber === client.spouseIdNumber)
            ? { fileNumber: ownerId }
            : {}),
        }
      : f));
    // ללקוח ותיק אין עדיין תיק מ"ה — ההכרעה יוצרת אותו, כמו ב-App
    const next = files.length ? files : [{
      id: 'tf-it', authority: 'income_tax' as const, owner,
      fileNumber: ownerId, repStatus: 'pending' as const,
    }];
    save({ ...client, taxFiles: next, registeredSpouseVerified: true });
  }

  const itFile = (client.taxFiles ?? []).find(f => f.authority === 'income_tax');

  return (
    <div style={{ direction: 'rtl' }}>
      <div style={{ padding: '.6rem 1rem', background: 'var(--surface-2)', fontSize: 13, display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => reset('client')}>כוונה: הלקוח</button>
        <button className="btn btn-secondary btn-sm" onClick={() => reset('spouse')}>כוונה: בן הזוג</button>
        {/* מקפיץ את הבקשה לשלב שבו נפתח פאנל חלק ב' — שם נבדק שלא נשאלת שוב אותה שאלה */}
        <button className="btn btn-secondary btn-sm" onClick={() => setRequest(r => ({ ...r, status: 'awaiting_stamp' }))}>
          קפוץ לחתימת המייצג
        </button>
        {/* לקוח ותיק: אין תיק מ"ה, השדה מעולם לא אותחל (NULL) */}
        <button className="btn btn-secondary btn-sm" onClick={() => reset(null)}>לקוח ותיק</button>
        {/* נתון מלפני המהלך: השלב סומן, אבל אף אחד לא הכריע מי הרשום */}
        <button className="btn btn-secondary btn-sm" onClick={() => {
          save(baseClient(null));
          setRequest(r => ({ ...r, status: 'awaiting_accountant', execution: { incomeTax: { enteredAt: '2026-08-10T08:00:00.000Z' } } }));
        }}>ותיק + הוזן כבר</button>
        <span id="tst-state">
          מצב: {client.registeredSpouseVerified ? 'אומת' : 'טרם אומת'} · ע״ש {itFile?.owner ?? '—'} ·
          מספר {itFile?.fileNumber ?? '—'} · הוזן בשע״ם: {request.execution?.incomeTax?.enteredAt ? 'כן' : 'לא'}
        </span>
      </div>

      {/* שני המשטחים בכרטיס הלקוח שמציגים את בן הזוג הרשום — כאן רק מסמנים.
          ‎?only=exec‎ מסתיר אותם, כדי לצלם את מרכז הביצוע בלי לגלול. */}
      <div style={{ display: new URLSearchParams(window.location.search).get('only') === 'exec' ? 'none' : 'flex', gap: '1rem', padding: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 420px', minWidth: 380 }}>
          <TaxFilesSection client={client} update={(k, v) => save({ ...client, [k]: v })} />
        </div>
        <div style={{ flex: '1 1 360px', minWidth: 320, background: 'var(--surface-1)', borderRadius: 'var(--radius)' }}>
          <PersonQuickView
            row={buildPersonRows([client], [])[0]}
            now={{ title: 'בתהליך ייצוג' }}
            docs={[]}
            docsLoading={false}
            quickAction={null}
            primary={{ label: 'פתח תיק מלא', run: () => {} }}
            onClose={() => {}}
          />
        </div>
      </div>

      <RepresentationRequestReview
        request={request}
        onBack={() => {}}
        onProduceWithSetup={() => {}}
        onSaveSignedPdf={() => {}}
        onMarkSentToShaam={() => {}}
        onSign={() => {}}
        onMarkActive={() => {}}
        onDelete={() => {}}
        onOpenFill={() => {}}
        onOpenClientDocs={() => {}}
        niIncluded={false}
        onSaveExecution={(_req, execution) => setRequest(r => ({ ...r, execution }))}
        linkedClient={client}
        onConfirmRegisteredSpouse={confirmRegistered}
      />
    </div>
  );
}
