// דף בדיקה — מחזור חיי בקשת הייצוג בשע״ם (194), בכל מצביו.
// נטען רק כש-URL כולל ?test-shaam-rep=1. פיתוח בלבד, בלי מסד ובלי נתוני אמת.
//
// ‼ למה דף משלו ולא הרחבה של ?test-exec: שם הפיקסטורה היא בקשה בלי כרטיס
// מקושר ובלי היקף, ולכן אין בה בכלל הגשות שע״ם. כאן הפיקסטורה היא זוג נשוי
// עם מס הכנסה + מע"מ + ביטוח לאומי — בדיוק המקרה שההקלטה מתעדת.

import { useEffect, useState } from 'react';
import type {
  Client, RepresentationRequest, RepresentationExecution, RepresentationStatus,
} from '../types';
import RepresentationExecutionCenter from './RepresentationExecutionCenter';
import {
  shaamSubmissionsOf, preflightShaamSubmission, shaamSystemsOf, shaamProgressLine,
  buildForm2279Fields, form2279BothSign, SHAAM_SYSTEM_SCREEN_LABELS,
  type ShaamRequestTracking,
} from '../features/representation/shaamRepresentation';
import { shaamPersonFacts } from '../features/representation/shaamPersonFacts';
import { peopleFromClient } from '../utils/repScope';
import SigningRoom from './signatureRequest/SigningRoom';
import ShaamStopNotice from './ShaamStopNotice';
import { shaamStopState } from '../features/representation/shaamJobSafety';
import type { AutomationJob } from '../types/automation';
import type { Signer, SignatureField } from '../types';

/** ‼ אותו היקף כמו בהקלטה: מ"ה למשק הבית, מע"מ להדסה, ב"ל לשניהם. */
const SCOPE = {
  incomeTax: { status: 'in_process' as const },
  vat: { status: 'in_process' as const, targets: ['client' as const] },
  nationalInsurance: { status: 'in_process' as const, targets: ['client' as const, 'spouse' as const] },
};

const CLIENT: Client = {
  id: 'test-client-1',
  firstName: 'הדסה', lastName: 'סלע',
  idNumber: '034605212', birthDate: '1985-10-30',
  phone: '0524409230', email: 'hadassa@example.test',
  city: 'פתח תקווה', address: 'הגדוד העברי 29',
  familyStatus: 'married',
  spouseName: 'יאיר סלע', spouseFirstName: 'יאיר', spouseLastName: 'סלע',
  spouseIdNumber: '036693828', spouseEmail: 'yair@example.test',
  spousePhone: '0501234567',
  taxFiles: [{ id: 'f-it', authority: 'income_tax', fileNumber: '034605212', owner: 'client', repStatus: 'none' }],
  registeredSpouseVerified: true,
  authorityRepresentations: SCOPE,
} as unknown as Client;

const BASE: RepresentationRequest = {
  id: 'test-shaam-1',
  linkedClientId: CLIENT.id,
  clientName: 'הדסה סלע',
  clientEmail: 'hadassa@example.test',
  authorities: ['incomeTax', 'vat'],
  requestedDocs: [], notes: '',
  status: 'awaiting_accountant',
  createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-23T08:00:00.000Z',
  submission: null, submittedAt: null, partB: null, signedPdfStoredId: null, ocrExtracted: null,
  scope: SCOPE,
  signers: [
    { id: 'client', role: 'client', name: 'הדסה סלע', email: 'hadassa@example.test', signStatus: 'pending' },
    { id: 'spouse', role: 'spouse', name: 'יאיר סלע', email: 'yair@example.test', signStatus: 'pending' },
  ],
  identification: {
    firstName: 'הדסה', lastName: 'סלע', idNumber: '034605212', birthDate: '1985-10-30',
    secondaryType: 'parentId', secondaryValue: '067574996',
    phone: '0524409230', email: 'hadassa@example.test',
    city: 'פתח תקווה', address: 'הגדוד העברי 29',
    familyStatus: 'married', familyStatusYear: 2011,
    spouseName: 'יאיר סלע', spouseFirstName: 'יאיר', spouseLastName: 'סלע',
    spouseIdNumber: '036693828', spouseBirthDate: '1985-01-01',
    spouseSecondaryType: 'parentId', spouseSecondaryValue: '011111118',
    spousePhone: '0501234567',
  },
} as unknown as RepresentationRequest;

const TRACK_NONE: RepresentationExecution = {};
const TRACK_CREATED: RepresentationExecution = {
  shaam: {
    'person:client': {
      requestNumber: '2026538930', createdAt: '2026-09-23T09:20:00.000Z',
      formDocumentId: 'poa-pdf-test-shaam-1-person-client',
      formFileName: 'ייפוי כוח לחתימה - הדסה סלע.pdf',
      formFetchedAt: '2026-09-23T09:28:00.000Z',
    } satisfies ShaamRequestTracking,
  },
};
const TRACK_SUSPENDED: RepresentationExecution = {
  shaam: {
    'person:client': {
      ...TRACK_CREATED.shaam!['person:client'],
      submittedAt: '2026-09-23T10:05:00.000Z',
      syncedAt: '2026-09-23T10:30:00.000Z',
      rawRequestState: 'התקבלו המסמכים',
      systems: [
        { systemLabel: 'מס הכנסה', rawRequestState: 'התקבלו המסמכים', rawSystemState: 'השהיה', suspensionEndsRaw: '24/09/2026' },
        { systemLabel: 'מעמ', rawRequestState: 'התקבלו המסמכים', rawSystemState: 'ממתין לפתיחת התיק' },
      ],
    },
  },
};
const TRACK_AWAITING_CLIENT: RepresentationExecution = {
  shaam: {
    'person:client': {
      ...TRACK_SUSPENDED.shaam!['person:client'],
      systems: [
        { systemLabel: 'מס הכנסה', rawRequestState: 'מסמכים בטעינה', rawSystemState: 'ממתין:91-לאישור לקוח,כל השאר-לפתיחת התיק' },
      ],
    },
  },
};
const TRACK_ACTIVE: RepresentationExecution = {
  shaam: {
    'person:client': {
      ...TRACK_SUSPENDED.shaam!['person:client'],
      systems: [
        { systemLabel: 'מס הכנסה', rawRequestState: 'מסמכים אושרו', rawSystemState: 'נקלט בהצלחה' },
        { systemLabel: 'מעמ', rawRequestState: 'מסמכים אושרו', rawSystemState: 'נקלט בהצלחה' },
      ],
    },
  },
};

// ‼ המקרה האמיתי של הדסה סלע (23.09.2026): «בדוק» מצא את השורות בשע״ם,
// אבל מספר הבקשה לא נחשף ברשימה.
const TRACK_FOUND_NO_NUMBER: RepresentationExecution = {
  shaam: {
    'person:client': {
      syncedAt: '2026-09-23T13:00:00.000Z',
      rawRequestState: 'המתנה למסמכים',
      systems: [
        { systemLabel: 'מס הכנסה', rawRequestState: 'המתנה למסמכים', rawSystemState: 'ממתין', clientName: 'הדסה סלע' },
        { systemLabel: 'מעמ', rawRequestState: 'המתנה למסמכים', rawSystemState: 'ממתין', clientName: 'הדסה סלע' },
      ],
    },
  },
};

/**
 * מסמך החתימה כפי שהוא נראה אחרי ההכנה האוטומטית (194): הטופס שהובא
 * משע״ם, ואזורי החתימה שנבנו מהתבנית שנמדדה. `signed` ⇒ גם נחתם ונצרב.
 */
const shaamDoc = (signed: boolean) => [{
  key: 'person:client',
  title: 'הדסה סלע · מס הכנסה, מע"מ',
  pdfDocId: 'poa-pdf-test-shaam-1-person-client',
  pdfFileName: 'ייפוי כוח לחתימה - הדסה סלע.pdf',
  fields: buildForm2279Fields('client', true),
  createdAt: '2026-09-23T09:29:00.000Z',
  signedPdfStoredId: signed ? 'signed-poa-test-shaam-1-person-client' : null,
}];

interface Scenario {
  key: string;
  label: string;
  status: RepresentationStatus;
  execution: RepresentationExecution;
  /** לקוח חלופי — לבדיקת «חסר טלפון בן/בת זוג». */
  client?: Client;
  /** מסמכי החתימה של הבקשה בתרחיש הזה. */
  docs?: ReturnType<typeof shaamDoc>;
  /** החותמים כבר חתמו — כדי ששלב «חתמתי והוספתי חותמת» ייראה נכון. */
  signed?: boolean;
}

const SCENARIOS: Scenario[] = [
  { key: 'new', label: '1 · טרם נפתחה בקשה', status: 'awaiting_accountant', execution: TRACK_NONE },
  {
    key: 'missing-phone', label: '2 · חסר טלפון בן/בת זוג',
    status: 'awaiting_accountant', execution: TRACK_NONE,
    client: { ...CLIENT, spousePhone: '' } as Client,
  },
  { key: 'found-no-number', label: '2ב · נמצאה בשע״ם בלי מספר בקשה', status: 'awaiting_accountant', execution: TRACK_FOUND_NO_NUMBER },
  { key: 'created', label: '3 · הבקשה נפתחה והטופס הובא', status: 'pending_signature', execution: TRACK_CREATED, docs: shaamDoc(false) },
  { key: 'stamped', label: '4 · נחתם והוחתם - מוכן לשידור', status: 'awaiting_stamp', execution: TRACK_CREATED, docs: shaamDoc(true), signed: true },
  { key: 'suspended', label: '5 · שודר · השהיה + ממתין לפתיחת תיק', status: 'awaiting_authorities', execution: TRACK_SUSPENDED, docs: shaamDoc(true), signed: true },
  { key: 'client', label: '6 · ממתין לאישור הלקוח', status: 'awaiting_authorities', execution: TRACK_AWAITING_CLIENT, docs: shaamDoc(true), signed: true },
  { key: 'active', label: '7 · נקלט בכל המערכים', status: 'active', execution: TRACK_ACTIVE, docs: shaamDoc(true), signed: true },
];

/**
 * אימות חזותי של אזורי החתימה — **בחדר החתימה האמיתי**, על טופס
 * 2279 אמיתי שהופק בשע״ם.
 *
 * ‼ לא ציור משלי של מלבנים: זה הרכיב שהרו"ח והלקוח רואים בפועל,
 * עם אותו רינדור ואותו חישוב מיקום. ה-PDF נטען מכתובת שנמסרת
 * ב-?pdf= — בפיתוח מצביעים אותה על טופס אמיתי שהורד משע״ם.
 */
/**
 * כל מצבי העצירה במסך אחד — כדי לראות שהניסוח ברור,
 * ש«נסה שוב» אינו הפעולה הראשית כשזה מסוכן, ושאין שום ז׳רגון טכני.
 */
const STOP_CASES: { label: string; job: AutomationJob }[] = [
  { label: 'תוצאה לא ידועה (שידור)', job: { errorCode: 'external_outcome_unknown', progress: { externalAttempt: { at: 'x', stage: 'upload_signed_form' } }, needsHuman: 'הפעולה מול שע״ם נעצרה באמצע, ולא ידוע אם שע״ם קלטה אותה.' } as unknown as AutomationJob },
  { label: 'חסימה/אבטחה', job: { errorCode: 'shaam_too_many_attempts', progress: {}, needsHuman: 'שע״ם הציגה הודעה שנראית כמו מגבלת גישה.' } as unknown as AutomationJob },
  { label: 'מסך לא מזוהה', job: { errorCode: 'shaam_unexpected_screen', progress: {}, needsHuman: 'המסך בשע״ם אינו זה שצפינו לו בשלב «אימות ישות».' } as unknown as AutomationJob },
  { label: 'אימות ישות נדחה', job: { errorCode: 'entity_verification_failed', progress: {}, needsHuman: 'שע״ם לא אישרה את פרטי אימות הישות.' } as unknown as AutomationJob },
  { label: 'נעצר לפני שנגענו', job: { errorCode: 'worker_stopped_before_external', progress: {}, needsHuman: 'לא בוצעה שום פנייה לרשות.' } as unknown as AutomationJob },
  { label: 'אין חיבור', job: { errorCode: 'awaiting_shaam_auth', progress: {}, needsHuman: 'חלון שע״ם אינו מחובר.' } as unknown as AutomationJob },
].map(c => ({ ...c, job: { ...c.job, status: 'needs_human', actionType: 'shaam.submit_poa' } as AutomationJob }));

function StopStatesPreview() {
  const [confirming, setConfirming] = useState<string | null>(null);
  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <div className="card-header"><div className="card-title">כשהאוטומציה נעצרת — מה הרו"ח רואה</div></div>
      <div className="card-body">
        {STOP_CASES.map(c => {
          const stop = shaamStopState(c.job);
          if (!stop) return null;
          return (
            <div key={c.label} style={{ padding: '.6rem 0', borderBottom: '1px solid var(--hairline-1)' }}>
              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-4)' }}>{c.label}</div>
              <ShaamStopNotice
                stop={stop}
                workerMessage={c.job.needsHuman}
                className="rep-track-next-err"
                confirming={confirming === c.label}
                onAskConfirm={() => setConfirming(c.label)}
                onCancelConfirm={() => setConfirming(null)}
                onConfirmRetry={() => setConfirming(null)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Form2279SigningCheck() {
  const url = new URLSearchParams(location.search).get('pdf');
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [err, setErr] = useState('');
  const [registered, setRegistered] = useState<'client' | 'spouse'>('client');

  useEffect(() => {
    if (!url) return;
    let alive = true;
    fetch(url).then(r => r.arrayBuffer())
      .then(b => { if (alive) setBytes(b); })
      .catch(e => { if (alive) setErr(String(e)); });
    return () => { alive = false; };
  }, [url]);

  if (!url) {
    return (
      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-header"><div className="card-title">אזורי חתימה על טופס 2279 אמיתי</div></div>
        <div className="card-body" style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)' }}>
          הוסיפו <code>&amp;pdf=&lt;כתובת של טופס 2279&gt;</code> לכתובת כדי לראות את
          אזורי החתימה האוטומטיים על הטופס האמיתי, בחדר החתימה האמיתי.
        </div>
      </div>
    );
  }
  if (err) return <div className="card"><div className="card-body">טעינת ה-PDF נכשלה: {err}</div></div>;
  if (!bytes) return <div className="card"><div className="card-body">טוען…</div></div>;

  const fields: SignatureField[] = buildForm2279Fields(registered, true);
  const signers: Signer[] = [
    { id: 'client', source: 'manual', name: 'הדסה סלע', email: '', order: 1 },
    { id: 'spouse', source: 'manual', name: 'יאיר סלע', email: '', order: 2 },
    { id: 'accountant', source: 'manual', name: 'אני - רו"ח', email: '', order: 3 },
  ];

  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--fs-13)' }}>מי הרשום/ה במס הכנסה?</span>
        <button className={`btn btn-sm ${registered === 'client' ? 'btn-green' : 'btn-secondary'}`}
          onClick={() => setRegistered('client')}>הדסה (הלקוחה)</button>
        <button className={`btn btn-sm ${registered === 'spouse' ? 'btn-green' : 'btn-secondary'}`}
          onClick={() => setRegistered('spouse')}>יאיר (בן הזוג)</button>
      </div>
      <SigningRoom
        key={registered}
        pdfBytes={bytes.slice(0)}
        pdfFileName="טופס 2279 משע״ם"
        fields={fields}
        signers={signers}
        activeSignerId="accountant"
        title="אימות אזורי חתימה על טופס 2279 אמיתי"
        adjustable
        onComplete={() => {}}
        onCancel={() => {}}
      />
    </div>
  );
}

export default function TestShaamRepresentation() {
  const [key, setKey] = useState(SCENARIOS[0].key);
  const sc = SCENARIOS.find(s => s.key === key)!;
  const client = sc.client ?? CLIENT;
  const req: RepresentationRequest = {
    ...BASE, status: sc.status, execution: sc.execution,
    ...(sc.docs ? { signatureDocuments: sc.docs, signatureSetup: {
      pdfDocId: sc.docs[0].pdfDocId, pdfFileName: sc.docs[0].pdfFileName,
      fields: sc.docs[0].fields, createdAt: sc.docs[0].createdAt,
    }, signedPdfStoredId: sc.docs[0].signedPdfStoredId } : {}),
    ...(sc.signed ? { signers: BASE.signers!.map(x => ({ ...x, signStatus: 'signed' as const })) } : {}),
  } as RepresentationRequest;

  const people = peopleFromClient(client);
  const submissions = shaamSubmissionsOf(req, client, 'client', people);

  return (
    <div style={{ padding: '1.2rem', maxWidth: 1100, margin: '0 auto', direction: 'rtl' }}>
      <h1 style={{ fontSize: '1.2rem' }}>בדיקה · ייצוג מול שע״ם</h1>
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', margin: '.8rem 0 1.2rem' }}>
        {SCENARIOS.map(s => (
          <button key={s.key} className={`btn btn-sm ${s.key === key ? 'btn-green' : 'btn-secondary'}`}
            onClick={() => setKey(s.key)}>{s.label}</button>
        ))}
      </div>

      {/* ── מה הקוד גוזר, בלי קשר למסך ─────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><div className="card-title">מה נגזר מ-PIVO</div></div>
        <div className="card-body" style={{ fontSize: 'var(--fs-13)', lineHeight: 1.8 }}>
          {submissions.map(sub => {
            const facts = shaamPersonFacts(req, client, sub.target);
            const pre = preflightShaamSubmission(sub, facts, client, people.married);
            const t = sc.execution.shaam?.[sub.key];
            return (
              <div key={sub.key} style={{ marginBottom: '.8rem' }}>
                <div style={{ fontWeight: 600 }}>{sub.key} · {sub.personName}</div>
                <div>מערכים שייבחרו בשע״ם: {shaamSystemsOf(sub).map(s => SHAAM_SYSTEM_SCREEN_LABELS[s]).join(', ') || '—'}</div>
                <div>מספרי תיק: {Object.entries(pre.fileNumbers).map(([k, v]) => `${k}=${v || '—'}`).join(' · ')}</div>
                <div>שני בני הזוג חותמים: {form2279BothSign(sub, people.married) ? 'כן' : 'לא'}</div>
                <div>אזורי חתימה: {buildForm2279Fields('client', form2279BothSign(sub, people.married))
                  .map(f => `${f.signerId}/${f.kind}`).join(' · ')}</div>
                <div style={{ color: pre.ok ? 'var(--success)' : 'var(--danger, #c00)' }}>
                  preflight: {pre.ok ? 'עובר' : pre.issues.map(i => i.message).join(' · ')}
                </div>
                <div style={{ color: 'var(--ink-3)' }}>מצב: {shaamProgressLine(t).text}</div>
              </div>
            );
          })}
        </div>
      </div>

      <RepresentationExecutionCenter
        key={key}
        request={req}
        linkedClient={client}
        niIncluded
        niCoversSpouse
        onSaveExecution={() => {}}
        onProduce={() => {}}
        onStamp={() => {}}
        onMarkSentToShaam={() => {}}
        onMarkActive={() => {}}
        onSendToSigner={async () => null}
        userId={undefined}
        repApprovalOverride={null}
      />

      <StopStatesPreview />
      <Form2279SigningCheck />
    </div>
  );
}
