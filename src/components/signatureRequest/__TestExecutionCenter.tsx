// דף בדיקה — מרכז ביצוע הייצוג בכל מצביו, בלי לגעת בנתוני אמת.
// נטען רק כש-URL כולל ?test-exec=1.

import { useState } from 'react';
import { RepresentationRequest, RepresentationExecution } from '../../types';
import { EmailMessage } from '../../types/emailActivity';
import RepresentationExecutionCenter from '../RepresentationExecutionCenter';
import type { RepApprovalStep } from '../../hooks/useRepApprovalStep';
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
  { id: 'c1', toEmail: 'ruti@example.com', kind: 'active', subject: 'הייצוג אושר - נתחיל לעבוד', status: 'opened', sentAt: '2026-07-20T09:30:00.000Z', deliveredAt: '2026-07-20T09:30:07.000Z', openedAt: '2026-07-20T11:02:00.000Z', html: '<html><body dir="rtl" style="font-family:Arial"><h1>הכול מוכן, רותי</h1><p>הייצוג שלכם מול רשויות המס אושר בהצלחה.</p></body></html>' },
  { id: 'c2', toEmail: 'ruti@example.com', kind: 'sign', subject: 'הטופס מוכן - נשאר רק לחתום', status: 'clicked', sentAt: '2026-07-03T10:00:00.000Z', deliveredAt: '2026-07-03T10:00:05.000Z', openedAt: '2026-07-03T12:00:00.000Z', clickedAt: '2026-07-03T12:01:00.000Z' },
  { id: 'c3', toEmail: 'ruti@old-address.com', kind: 'onboard', subject: 'ברוכים הבאים - נשאר רק לאמת את הזהות', status: 'bounced', sentAt: '2026-07-01T08:00:00.000Z' },
];

const BASE: RepresentationRequest = {
  id: 'test-exec-1',
  clientName: 'רותי לקוח',
  status: 'awaiting_accountant',
  createdAt: '2026-07-01T08:00:00.000Z',
  linkedClientId: 'client-1',
  // ‼ בלי זה המסך נופל על `request.authorities.includes(...)` — הפיקסטורה
  // דילגה על השדה, ולכן דף הבדיקה כולו לא עלה (נתפס ב-QA של 23.09.2026).
  authorities: ['incomeTax', 'nationalInsurance'],
  // ‼ signToken לכל חותם — בלעדיו "העתק קישור חתימה אישי" לא מופיע בשורה,
  // וזו בדיוק הפעולה שצריך לראות כאן.
  signers: [
    { id: 'client', role: 'client', source: 'client_self', name: 'רותי לקוח', email: 'ruti@example.com', order: 1, signStatus: 'pending', signToken: '11111111111111111111111111111111' },
    { id: 'spouse', role: 'spouse', source: 'spouse', name: 'דני לקוח', email: 'dani@example.com', order: 2, signStatus: 'pending', signToken: '22222222222222222222222222222222' },
  ],
} as unknown as RepresentationRequest;

/**
 * ‼ המקרה של הדסה ויאיר סלע (23.09.2026): לאחד מבני הזוג אין כתובת מייל,
 * ולכן אף מייל לא יצא אליו — ובכל זאת האסמכתא שלו קיימת. השורה חייבת לומר
 * את זה, והצעד "ההוראות הגיעו למבוטח" חייב להישאר פתוח.
 */
const SPOUSE_WITHOUT_EMAIL = [
  { id: 'client', role: 'client', source: 'client_self', name: 'הדסה סלע', email: 'yairselao@gmail.com', order: 1, signStatus: 'pending', signToken: '33333333333333333333333333333333' },
  { id: 'spouse', role: 'spouse', source: 'spouse', name: 'יאיר סלע', email: '', order: 2, signStatus: 'pending', signToken: '44444444444444444444444444444444' },
];

/* הנתיב המזורז בכל מצביו. ‼ מוזרק ולא נטען: המסך הזה רץ בלי מסד, ובלי
   הזרקה אי אפשר לראות כאן את השורה בכלל. במסך האמיתי המקור הוא
   onboarding_steps — ראה useRepApprovalStep. */
const REP_APPROVAL_STATES: Record<string, RepApprovalStep | null> = {
  none: null,
  pending: { id: 'ra1', status: 'pending', ball: 'client' },
  declared: { id: 'ra1', status: 'in_progress', ball: 'me', clientDeclaredAt: '2026-08-24T09:12:00.000Z' },
  done: { id: 'ra1', status: 'completed', ball: 'me', clientDeclaredAt: '2026-08-24T09:12:00.000Z' },
  // ‼ 201 · שע״ם הציגה «ממתין לאישור לקוח» — השלב הפך לחובה (shaam_require_client_approval).
  required: { id: 'ra1', status: 'pending', ball: 'client', requiredBy: 'shaam' },
};

const APPROVAL_LABELS: Record<string, string> = {
  none: 'אין נתיב מזורז',
  pending: 'ממתין ללקוח',
  declared: 'הלקוח דיווח',
  done: 'נסגר',
  required: 'נדרש (שע״ם)',
};

type Scenario = { key: string; label: string; req: RepresentationRequest };

const withSetup = {
  signatureSetup: { pdfFileName: 'ייפוי כוח 2279.pdf', pdfDocId: 'doc-1', fields: [], createdAt: '2026-07-02T10:00:00.000Z' },
};
const ni = (exec: RepresentationExecution) => exec;

// ── 201 · אחרי ההגשה לשע״ם — הדסה סלע, בקשה 2026538930 ─────────────────────
const SHAAM_SUBMITTED = '2026-09-23T20:42:35Z';
const shaamRow = (systemLabel: string, rawRequestState: string, rawSystemState: string, extra: Record<string, string> = {}) => ({
  systemLabel, rawRequestState, rawSystemState, clientName: 'סלע הדסה', fileNumber: '034605212',
  repType: 'ראשי', enteredAt: '23/09/2026', requestNumber: '2026538930', ...extra,
});
const SHAAM_BEFORE = {
  requestNumber: '2026538930', syncedAt: '2026-09-23T14:50:03Z', submittedAt: SHAAM_SUBMITTED,
  rawRequestState: 'המתנה למסמכים',
  systems: [shaamRow('מס הכנסה', 'המתנה למסמכים', ''), shaamRow('מעמ', 'המתנה למסמכים', ''), shaamRow('ניכויים', 'המתנה למסמכים', '', { fileNumber: 'לא קיים תיק' })],
};
const SHAAM_CONFIRMED = {
  ...SHAAM_BEFORE,
  suspensionEndsAt: '2026-10-06', suspensionEndsSource: 'submission_confirmation',
  submissionConfirmation: { text: 'בקשתך תיקלט במערכת ותמתין לסיום השהייה הצפויה להסתיים ביום 06/10/2026.', at: SHAAM_SUBMITTED },
};
const SHAAM_RECONCILED = {
  ...SHAAM_CONFIRMED,
  syncedAt: '2026-09-24T07:00:05Z', observedAt: '2026-09-24T07:00:00Z', rawRequestState: 'התקבלו המסמכים',
  suspensionEndsSource: 'request_list',
  systems: [
    shaamRow('מס הכנסה', 'התקבלו המסמכים', 'השהייה', { suspensionEndsRaw: '06/10/2026' }),
    shaamRow('מעמ', 'התקבלו המסמכים', 'השהייה'),
    shaamRow('ניכויים', 'התקבלו המסמכים', 'השהייה', { fileNumber: 'לא קיים תיק' }),
  ],
};
const shaamReq = (track: object, over: Partial<RepresentationRequest> = {}) => ({
  ...BASE, ...withSetup, status: 'awaiting_authorities', signedPdfStoredId: 'doc-signed', clientName: 'הדסה סלע',
  authorities: ['incomeTax'],
  scope: { incomeTax: { status: 'in_process', level: 'primary' }, vat: { status: 'in_process', level: 'primary' }, withholding: { status: 'in_process', level: 'primary' } },
  execution: { incomeTax: { enteredAt: '2026-09-23T09:00:00.000Z' }, signatureEmailSentAt: '2026-09-23T17:25:18.636Z', shaam: { 'person:client': track } },
  ...over,
}) as unknown as RepresentationRequest;

const SCENARIOS: Scenario[] = [
  { key: 'shaam-before', label: 'שע״ם א. הוגש - הצילום הישן (לפני 201)', req: shaamReq(SHAAM_BEFORE) },
  { key: 'shaam-confirmed', label: 'שע״ם ב. הוגש + צפי ממסך האישור', req: shaamReq(SHAAM_CONFIRMED) },
  { key: 'shaam-suspended', label: 'שע״ם ג. התקבלו המסמכים / השהייה', req: shaamReq(SHAAM_RECONCILED) },
  {
    key: 'shaam-client-approval', label: 'שע״ם ד. ממתין לאישור לקוח',
    req: shaamReq({ ...SHAAM_RECONCILED, clientApprovalRequiredAt: '2026-09-24T07:00:05Z', systems: [
      shaamRow('מס הכנסה', 'התקבלו המסמכים', 'ממתין לאישור לקוח'),
      shaamRow('מעמ', 'התקבלו המסמכים', 'השהייה'),
      shaamRow('ניכויים', 'התקבלו המסמכים', 'ממתין לפתיחת תיק', { fileNumber: 'לא קיים תיק' }),
    ] }),
  },
  {
    key: 'shaam-file-opening', label: 'שע״ם ה. ממתין לפתיחת תיק',
    req: shaamReq({ ...SHAAM_RECONCILED, systems: [
      shaamRow('מס הכנסה', 'מסמכים אושרו', 'נקלט בהצלחה'),
      shaamRow('ניכויים', 'מסמכים אושרו', 'ממתין לפתיחת תיק', { fileNumber: 'לא קיים תיק' }),
    ] }),
  },
  {
    key: 'shaam-accepted', label: 'שע״ם ו. נקלט בהצלחה',
    req: shaamReq({ ...SHAAM_RECONCILED, systems: [
      shaamRow('מס הכנסה', 'מסמכים אושרו', 'נקלט בהצלחה'), shaamRow('מעמ', 'מסמכים אושרו', 'נקלט בהצלחה'),
    ] }),
  },
  {
    key: 'shaam-docs', label: 'שע״ם ז. דרישת ת.ז./דרכון',
    req: shaamReq({ ...SHAAM_BEFORE, submittedAt: undefined, requiredDocuments: [
      { label: 'צילום תעודת זהות', required: true, kind: 'idCard', handling: 'requested' },
      { label: 'צילום דרכון', required: true, kind: 'passport', handling: 'exists' },
    ] }, { status: 'awaiting_stamp' }),
  },
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
    label: '5. הוגש לשע״ם - ממתין לאישור',
    req: { ...BASE, ...withSetup, status: 'awaiting_authorities', signedPdfStoredId: 'doc-signed', execution: ni({ incomeTax: { enteredAt: '2026-07-02T08:00:00.000Z' }, signatureEmailSentAt: '2026-07-03T10:00:00.000Z', nationalInsurance: { enteredAt: '2026-07-02T09:00:00.000Z', referenceNumber: '73882698', deadline: '2028-01-01', instructionsSentAt: '2026-07-03T10:00:00.000Z', instructionsSentWith: 'signature', confirmedAt: '2026-07-05T10:00:00.000Z' } }) } as unknown as RepresentationRequest,
  },
  {
    // ‼ האירוע של 23.09.2026 (הדסה סלע) כפיקסטורה: ייפוי הכוח נוצר **ידנית**
    // בפורטל ב"ל, PIVO מצאה אותו ויישבה אסמכתא + מועד, וביטוח לאומי אומרת
    // «ממתין לאישור». שני הדברים שנשברו נבדקים כאן ביחד: שני השדות חייבים
    // להציג את הערכים (ולא את ה-placeholder), והמסך חייב לומר «ממתין
    // לאישור» במקום להיראות כאילו הכול נסגר.
    // ‼ מעבר **מתרחיש 2 לתרחיש הזה** הוא הרפרודוקציה המדויקת: הרכיב כבר
    // עלה עם ni ריק, והערכים מגיעים אחריו — בדיוק כמו טעינת הבקשה במסך האמיתי.
    key: 'reconciled-pending',
    label: '7. יושב מב״ל - ממתין לאישור (אירוע 23.09)',
    req: { ...BASE, ...withSetup, execution: ni({
      incomeTax: { enteredAt: '2026-07-02T08:00:00.000Z' },
      nationalInsurance: {
        enteredAt: '2026-09-23T09:52:33.656Z',
        referenceNumber: '75165449',
        deadline: '2026-11-22',
        externalState: 'pending',
        rawExternalState: 'ממתין לאישור',
        syncedAt: '2026-09-23T09:52:33.656Z',
        foundExternally: true,
      },
    }) } as RepresentationRequest,
  },
  {
    // ‼ מצב שלא זוהה — הניסוח של ביטוח לאומי מוצג כמו שהוא, והמסך לא
    // מתקדם. הגבול שאסור להיסדק: «לא הבנתי» אינו «אושר».
    key: 'external-unknown',
    label: '8. ב״ל החזירה ניסוח לא מוכר',
    req: { ...BASE, ...withSetup, execution: ni({
      incomeTax: { enteredAt: '2026-07-02T08:00:00.000Z' },
      nationalInsurance: {
        enteredAt: '2026-09-23T09:52:33.656Z',
        referenceNumber: '75165449',
        deadline: '2026-11-22',
        externalState: 'unknown',
        rawExternalState: 'בהמתנה לאישור המבוטח',
        syncedAt: '2026-09-23T09:52:33.656Z',
      },
    }) } as RepresentationRequest,
  },
  {
    // ‼ האירוע של 23.09: ליאיר אין מייל, האסמכתא שלו קיימת ולא נמסרה.
    // השורה שלו חייבת להיות ⚠ עם "אסמכתא 75074203 טרם נמסרה", והצעד
    // "ההוראות הגיעו למבוטח" במסלול שלו חייב להישאר פתוח.
    key: 'spouse-no-email',
    label: '9. לבן/בת הזוג אין מייל (אירוע 23.09)',
    req: { ...BASE, ...withSetup, signers: SPOUSE_WITHOUT_EMAIL, execution: ni({
      incomeTax: { enteredAt: '2026-07-02T08:00:00.000Z' },
      signatureEmailSentAt: '2026-09-23T17:25:18.636Z',
      nationalInsurance: {
        enteredAt: '2026-09-23T09:52:33.656Z', referenceNumber: '75165449', deadline: '2026-11-22',
        externalState: 'pending', rawExternalState: 'ממתין לאישור', syncedAt: '2026-09-23T09:52:33.656Z',
        instructionsSentAt: '2026-09-23T17:25:18.636Z', instructionsSentWith: 'signature',
      },
      nationalInsuranceSpouse: {
        enteredAt: '2026-09-23T17:24:53.304Z', referenceNumber: '75074203', deadline: '2026-11-15',
        externalState: 'pending', rawExternalState: 'ממתין לאישור', syncedAt: '2026-09-23T17:24:53.304Z',
        foundExternally: true,
      },
    }) } as unknown as RepresentationRequest,
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
  // ?client=<id> — הנתיב המזורז ("זירוז אישור הייצוג") נטען מ-onboarding_steps
  // ולא מהבקשה, ולכן פיקסטורה לבדה לא מציגה אותו. מזהה אמיתי מראה את השורה
  // במצבה האמיתי: ממתין ללקוח, הלקוח דיווח, או סגור.
  // ‼ עם ?client= לא דורסים את הנתיב המזורז: שם רוצים בדיוק את מה שבמסד.
  const realClientId = new URLSearchParams(window.location.search).get('client');
  // ?scenario=<key> — פתיחה ישירה של מצב (ו-F5 שמחזיר אליו).
  const scenarioFromUrl = new URLSearchParams(window.location.search).get('scenario');
  const [key, setKey] = useState(scenarioFromUrl && SCENARIOS.some(s => s.key === scenarioFromUrl) ? scenarioFromUrl : 'ready');
  const [niIncluded, setNiIncluded] = useState(true);
  const [niSpouse, setNiSpouse] = useState(false);
  // ?approval=none|pending|declared|done — כדי שאפשר יהיה לפתוח מצב ישירות
  // (ולצלם אותו) בלי ללחוץ, למשל בדפדפן ללא-ראש.
  const approvalFromUrl = new URLSearchParams(window.location.search).get('approval');
  const [approval, setApproval] = useState(
    approvalFromUrl && approvalFromUrl in REP_APPROVAL_STATES ? approvalFromUrl : 'pending');
  const sc = SCENARIOS.find(s => s.key === key)!;

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'Heebo, sans-serif', direction: 'rtl' }}>
      <h1>בדיקה: מרכז ביצוע הייצוג</h1>
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
        {Object.keys(REP_APPROVAL_STATES).map(k => (
          <button key={k} className={`btn btn-sm ${approval === k ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setApproval(k)}>
            זירוז: {APPROVAL_LABELS[k]}
          </button>
        ))}
      </div>
      <RepresentationExecutionCenter
        key={`---`}
        request={{
          ...sc.req,
          ...(realRequestId ? { id: realRequestId } : {}),
          ...(realClientId ? { linkedClientId: realClientId } : {}),
        }}
        niIncluded={niIncluded}
        niCoversSpouse={niSpouse}
        onSaveExecution={() => {}}
        onProduce={() => {}}
        onStamp={() => {}}
        onMarkSentToShaam={() => {}}
        onMarkActive={() => {}}
        onSendToSigner={async () => null}
        userId={undefined}
        repApprovalOverride={realClientId ? undefined : REP_APPROVAL_STATES[approval]}
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
