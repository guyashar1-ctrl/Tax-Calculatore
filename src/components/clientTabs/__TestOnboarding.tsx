// ─── מסך בדיקה ללשונית הקליטה ────────────────────────────────────────────────
// ‼ למה זה קיים: משתמש הבדיקות (e2e-test@firm.local) מסומן active=false
// ברשימת המורשים, ולכן ה-RLS מחזיר לו אפס שורות מכל טבלה — אי אפשר לבדוק את
// המסך מול נתוני אמת בלי להתחבר לחשבון של גיא. כאן מרכיבים את הלשונית עם
// נתונים מדומים שמשקפים בדיוק את מה שהמרכיב בשרת מייצר.
//
// פתיחה:  http://localhost:5173/?test-onboarding   (DEV בלבד)

import { useState } from 'react';
import type { Client } from '../../types';
import type { Engagement, OnboardingEvent, OnboardingStep } from '../../types/onboarding';
import type { Quotation } from '../../types/quotations';
import OnboardingTab from './OnboardingTab';
import ReleaseLetterDialog from '../quotations/ReleaseLetterDialog';
import OnboardingGrid from '../OnboardingGrid';
import ClientsOnboardingSection from '../ClientsOnboardingSection';

const CLIENT_ID = 'fixture-client';
const ENG_ID = 'fixture-eng';

const FIXTURE_CLIENT = {
  id: CLIENT_ID, firstName: 'שרון', lastName: 'מזרחי', idNumber: '029384756',
  phone: '054-8823001', email: 'sharon.m@example.invalid', city: 'תל אביב',
  incomeTaxType: 'selfEmployed', niType: 'selfEmployed', vatStatus: 'authorizedDealer',
  lifecycleStage: 'onboarding',
} as unknown as Client;

// ?theme=light|dark — קיבוע ערכה לצילומי מסך ללא-ראש (אין App שמפעיל useTheme).
{
  const t = /[?&]theme=(light|dark)/.exec(window.location.search)?.[1];
  if (t) document.documentElement.dataset.theme = t;
}

const ENGAGEMENTS: Engagement[] = [{
  id: ENG_ID,
  userId: 'fixture-user',
  clientId: CLIENT_ID,
  quotationId: 'fixture-quote',
  status: 'onboarding',
  monthlyTotal: 450,
  billingStartMonth: '2026-09',
  approvedAt: '2026-08-01T09:00:00Z',
  processPublishedAt: '2026-08-01T09:05:00Z',
  createdAt: '2026-08-01T09:00:00Z',
  updatedAt: '2026-08-01T09:00:00Z',
}];

/** אותה התקשרות לפני שהרו"ח פתח את התהליך — כאן הלשונית נכנסת למצב בנייה. */
const ENGAGEMENTS_UNPUBLISHED: Engagement[] = [
  { ...ENGAGEMENTS[0], processPublishedAt: undefined },
];

/* ההצעה שממנה נולדה ההתקשרות — המקור לאבן-הדרך "הצעת מחיר · אושרה".
   רק השדות שהמסך באמת קורא; שאר ההצעה אינה רלוונטית לבדיקה הזאת. */
const QUOTATIONS = [{
  id: 'fixture-quote',
  clientId: CLIENT_ID,
  quotationNumber: 'Q-2026-018',
  revision: 1,
  status: 'approved',
  items: [], futureServices: [], vatRate: 18, events: [],
  approvedAt: '2026-08-01T08:40:00Z',
  approvalSignerName: 'שרון מזרחי',
} as unknown as Quotation];

function step(p: Partial<OnboardingStep> & Pick<OnboardingStep, 'id' | 'stepType' | 'track' | 'scope' | 'status' | 'ball'>): OnboardingStep {
  return {
    userId: 'fixture-user',
    engagementId: ENG_ID,
    clientId: CLIENT_ID,
    dependsOnStepId: null,
    dueDate: null,
    needsAttention: false,
    payload: {},
    completionMethod: 'manual',
    completedBy: null,
    completedAt: null,
    verifiedAt: null,
    createdAt: '2026-08-01T09:00:00Z',
    updatedAt: '2026-08-01T09:00:00Z',
    ...p,
  } as OnboardingStep;
}

const STEPS: OnboardingStep[] = [
  step({ id: 's1', stepType: 'representation', track: 'authorities', scope: 'person', status: 'waiting_client', ball: 'client' }),
  // ── שדרוג לייצוג ראשי: תזכורת שהגיע מועדה, ותזכורת שעוד לפניה ──
  step({ id: 's1b', stepType: 'representation_upgrade', track: 'authorities', scope: 'person', status: 'pending', ball: 'me',
         dueDate: '2026-07-15', needsAttention: true,
         payload: { secondaryAuthorities: ['incomeTax', 'vat'] } }),
  step({ id: 's2', stepType: 'release_letter', track: 'prev_accountant', scope: 'person', status: 'pending', ball: 'me' }),
  step({ id: 's3', stepType: 'materials_received', track: 'prev_accountant', scope: 'person', status: 'locked', ball: 'prev_accountant', dependsOnStepId: 's2',
         payload: { checklist: [
           { key: 'ledgers', label: 'כרטסות', done: true },
           { key: 'trial_balance', label: 'מאזן בוחן', done: false },
           { key: 'uniform_file', label: 'קובץ מבנה אחיד', done: false },
         ] } }),
  // ── פייפרלס: טריאז' שטרם נענה (השאלות מוצגות על השלב הזה) ──
  // ‼ הבעלות ממיגרציה 106: ההרשמה של הלקוח, החיבור של המשרד.
  step({ id: 's4', stepType: 'paperless_invite', track: 'tools', scope: 'person', status: 'pending', ball: 'client',
         payload: { paperlessStatus: 'unknown', dataSource: 'unknown',
                    clientTitle: 'הרשמה לפייפרלס', clientCta: 'נרשמתי לפייפרלס' } }),
  step({ id: 's5', stepType: 'paperless_connection', track: 'tools', scope: 'person', status: 'locked', ball: 'me', dependsOnStepId: 's4',
         payload: { clientTitle: 'חיבור לפייפרלס' } }),
  /* ── הרשאת תשלום: נעולה עד חיבור הפייפרלס ──
     ‼ זה מקרה־הייחוס של אב-הטיפוס: בקשה תלויה שיורדת לתוך כרטיס ההורה
     ונקראת כצעד ההמשך שלו. שלבים כפולים מאותו סוג הוסרו מהפיקסטורה —
     המסד אוסר אותם (אינדקס ייחודי על client_id/engagement_id + step_type),
     ולכן פיקסטורה עם שלוש הרשאות תשלום בדקה מסך שלא קיים בפרודקשן. */
  step({ id: 's6', stepType: 'retainer_authorization', track: 'payment', scope: 'engagement', status: 'locked', ball: 'me', dependsOnStepId: 's5',
         needsAttention: true, dueDate: '2026-08-20',
         payload: { amount: 450, billingStartMonth: '2026-09' } }),
  step({ id: 's7', stepType: 'internal_setup', track: 'internal', scope: 'engagement', status: 'pending', ball: 'me',
         payload: { checklist: [
           { key: 'file_numbers', label: 'מספרי תיקים בכרטיס', done: false },
           { key: 'assignee', label: 'שיוך מטפל', done: true },
         ] } }),
  step({ id: 's8', stepType: 'kyc_identification', track: 'internal', scope: 'person', status: 'completed', ball: 'me', completedAt: '2026-08-02T10:00:00Z' }),
  step({ id: 's9', stepType: 'first_month_review', track: 'review', scope: 'engagement', status: 'pending', ball: 'me', dueDate: '2026-09-01' }),
  // ── שתי הבקשות החדשות: מסמכים מהלקוח, ופרטי הרו"ח הקודם ──
  step({ id: 's10', stepType: 'client_documents', track: 'tools', scope: 'person', status: 'waiting_client', ball: 'client',
         payload: {
           checklist: [
             { key: 'bank_confirm', label: 'אישור ניהול חשבון בנק', done: true },
             { key: 'last_return', label: 'דוח שנתי אחרון', done: false },
             { key: 'form106', label: 'טופס 106', done: false },
           ],
           clientTitle: 'להעלות 3 מסמכים',
           clientSub: 'אישור ניהול חשבון בנק · דוח שנתי אחרון · טופס 106',
           clientCta: 'להעלאה',
         } }),
  step({ id: 's11', stepType: 'prev_accountant_details', track: 'prev_accountant', scope: 'person', status: 'waiting_client', ball: 'client',
         payload: {
           clientTitle: 'פרטי רואה החשבון הקודם שלך',
           clientSub: 'שם, אימייל וטלפון — כדי שנפנה אליו בשמך',
           clientCta: 'למילוי',
         } }),
];

const EVENTS: OnboardingEvent[] = [
  { id: 'e1', userId: 'fixture-user', stepId: 's8', engagementId: ENG_ID, type: 'status_changed', actor: 'accountant', note: 'הזיהוי הושלם', meta: {}, at: '2026-08-02T10:00:00Z' },
  { id: 'e2', userId: 'fixture-user', stepId: 's1', engagementId: ENG_ID, type: 'status_changed', actor: 'client', note: 'הלקוח מילא את פרטי הייצוג', meta: {}, at: '2026-08-01T14:30:00Z' },
  { id: 'e3', userId: 'fixture-user', engagementId: ENG_ID, type: 'created', actor: 'system', note: 'מסלול הקליטה הורכב מההצעה שאושרה', meta: { stepsCreated: 9 }, at: '2026-08-01T09:00:00Z' },
];

// ── נתונים לרשת: שלושה לקוחות בשלושה מצבים שונים ──
/* ‼ חמישה לקוחות ולא שלושה — כדי שמקטע "לקוחות בתהליך" ייבדק על **כל ארבע**
   דרגות העדיפות. ארבע מהן לא היו מיוצגות כאן קודם, ובלעדיהן המיון נבדק על
   מחצית מהמקרים. grid-6 הוא לקוח שהקליטה שלו נסגרה — הוא חייב **לא** להופיע. */
/* ‼ סוג התיק מכוסה בכל חמשת הענפים: מורשה · פטור · חברה · ללא רישום מע״מ ·
   בלי שדה בכלל. שני האחרונים חייבים לא להציג כלום. */
const GRID_CLIENTS = [
  { id: CLIENT_ID, firstName: 'שרון', lastName: 'מזרחי', representationStatus: 'awaiting_authorities', vatStatus: 'authorizedDealer' },
  { id: 'grid-2', firstName: 'אבי', lastName: 'דהן', representationStatus: 'pending_fill', type: 'company', vatStatus: 'authorizedDealer' },
  { id: 'grid-3', firstName: 'תמר', lastName: 'בן-חיים', representationStatus: 'active', vatStatus: 'exemptDealer' },
  { id: 'grid-4', firstName: 'דנה', lastName: 'אלמוג', representationStatus: 'active', vatStatus: 'none' },
  { id: 'grid-5', firstName: 'יוסי', lastName: 'קרן', representationStatus: 'active' },
  { id: 'grid-6', firstName: 'נועה', lastName: 'שגב', representationStatus: 'active' },
] as never[];

const GRID_ENGAGEMENTS: Engagement[] = [
  ENGAGEMENTS[0],
  { ...ENGAGEMENTS[0], id: 'eng-2', clientId: 'grid-2', approvedAt: '2026-07-01T09:00:00Z' },
  { ...ENGAGEMENTS[0], id: 'eng-3', clientId: 'grid-3', approvedAt: '2026-08-03T09:00:00Z' },
  { ...ENGAGEMENTS[0], id: 'eng-4', clientId: 'grid-4', approvedAt: '2026-07-25T09:00:00Z' },
  { ...ENGAGEMENTS[0], id: 'eng-5', clientId: 'grid-5', approvedAt: '2026-08-06T09:00:00Z' },
  // קליטה שנסגרה — status 'active'. נשארו לה שלבי רשות פתוחים בכוונה.
  { ...ENGAGEMENTS[0], id: 'eng-6', clientId: 'grid-6', status: 'active', approvedAt: '2026-06-01T09:00:00Z' },
];

function gstep(clientId: string, engagementId: string, p: Partial<OnboardingStep> & Pick<OnboardingStep, 'id' | 'stepType' | 'track' | 'scope' | 'status' | 'ball'>): OnboardingStep {
  return { ...step(p), clientId, engagementId } as OnboardingStep;
}

const OLD = '2026-07-20T09:00:00Z';   // עברו יותר משבוע ⇒ צהוב
const NEW = '2026-08-04T09:00:00Z';

const GRID_STEPS: OnboardingStep[] = [
  ...STEPS,
  // אבי — תקוע אצל הרו"ח הקודם, ומסמכים חלקיים
  gstep('grid-2', 'eng-2', { id: 'g2a', stepType: 'release_letter', track: 'prev_accountant', scope: 'person', status: 'waiting_client', ball: 'prev_accountant', needsAttention: true, updatedAt: OLD }),
  gstep('grid-2', 'eng-2', { id: 'g2b', stepType: 'client_documents', track: 'tools', scope: 'person', status: 'waiting_client', ball: 'client', updatedAt: OLD,
    payload: { checklist: [
      { key: 'a', label: 'אישור ניהול חשבון', done: true },
      { key: 'b', label: 'דוח שנתי', done: true },
      { key: 'c', label: 'טופס 106', done: false }] } }),
  gstep('grid-2', 'eng-2', { id: 'g2c', stepType: 'paperless_connection', track: 'tools', scope: 'person', status: 'completed', ball: 'client' }),
  gstep('grid-2', 'eng-2', { id: 'g2d', stepType: 'retainer_authorization', track: 'payment', scope: 'engagement', status: 'waiting_client', ball: 'client', updatedAt: OLD }),
  // תמר — נרשמה לפייפרלס, הכדור עבר אליי
  gstep('grid-3', 'eng-3', { id: 'g3a', stepType: 'client_documents', track: 'tools', scope: 'person', status: 'completed', ball: 'client' }),
  gstep('grid-3', 'eng-3', { id: 'g3b', stepType: 'paperless_connection', track: 'tools', scope: 'person', status: 'pending', ball: 'me', updatedAt: NEW }),
  gstep('grid-3', 'eng-3', { id: 'g3c', stepType: 'retainer_authorization', track: 'payment', scope: 'engagement', status: 'locked', ball: 'me', dependsOnStepId: 'g3b' }),
  gstep('grid-3', 'eng-3', { id: 'g3d', stepType: 'release_letter', track: 'prev_accountant', scope: 'person', status: 'skipped', ball: 'me' }),
  // דנה — הכול אצל הלקוח, שום דבר תקוע ⇒ דרגה 3
  gstep('grid-4', 'eng-4', { id: 'g4a', stepType: 'client_documents', track: 'tools', scope: 'person', status: 'waiting_client', ball: 'client', updatedAt: NEW }),
  gstep('grid-4', 'eng-4', { id: 'g4b', stepType: 'paperless_invite', track: 'tools', scope: 'person', status: 'waiting_client', ball: 'client', updatedAt: NEW }),
  gstep('grid-4', 'eng-4', { id: 'g4c', stepType: 'first_month_review', track: 'internal', scope: 'engagement', status: 'completed', ball: 'me', requiredForClose: false }),
  // יוסי — הכול נעול, אין מה לעשות ⇒ דרגה 4
  gstep('grid-5', 'eng-5', { id: 'g5a', stepType: 'representation', track: 'authorities', scope: 'person', status: 'completed', ball: 'me' }),
  gstep('grid-5', 'eng-5', { id: 'g5b', stepType: 'retainer_authorization', track: 'payment', scope: 'engagement', status: 'locked', ball: 'me', dependsOnStepId: 'g5c' }),
  gstep('grid-5', 'eng-5', { id: 'g5c', stepType: 'paperless_connection', track: 'tools', scope: 'person', status: 'locked', ball: 'client' }),
  // נועה — הקליטה נסגרה, ונשאר לה שלב רשות פתוח. אסור שתופיע במקטע.
  gstep('grid-6', 'eng-6', { id: 'g6a', stepType: 'first_month_review', track: 'internal', scope: 'engagement', status: 'pending', ball: 'me', requiredForClose: false }),
];

export default function TestOnboarding() {
  const [msg, setMsg] = useState('');
  // שני המצבים של מכתב השחרור: עם מייל לרו"ח הקודם (הכפתור פעיל) ובלעדיו
  // (הכפתור חסום עם הסיבה) — המצב השני הוא מקרה הקצה של המסלול.
  const [hasPrevEmail, setHasPrevEmail] = useState(true);
  // מסך "תהליך" אחד קבוע (המודל המאוחד) — אין יותר מצב בנייה נפרד; המתג
  // הזה בודק רק אם התהליך כבר נשלח ללקוח (process_published_at) או לא —
  // זה עדיין קובע את הצ'יפ "דף הלקוח פעיל" ואת שער התצוגה בפורטל.
  // ?test-onboarding&builder פותח ישר במצב "טרם נשלח" — לצילום מסך ללא-ראש.
  const [published, setPublished] = useState(!window.location.search.includes('builder'));
  const [showRelease, setShowRelease] = useState(false);
  // המסך המאוחד רץ תמיד ב-embedded (כמו בייצור, בתוך דף המסע). מצב לא-מוטבע
  // הוא מסך ישן ונפרד (ClientWorkspace.tsx) שלא נגעתי בו — נשאר לבדיקת רגרסיה.
  const [embedded, setEmbedded] = useState(true);
  /* ‼ שני מצבי הייצוג — פתוח (כרטיס פעיל) מול הושלם (אבן-דרך שקטה מעל
     פייפרלס). המתג הזה הוא הדרך היחידה לראות את שניהם על אותה פיקסטורה. */
  const [repDone, setRepDone] = useState(false);
  const steps = repDone
    ? STEPS.map(s => (s.stepType === 'representation'
        ? { ...s, status: 'completed' as const, ball: 'me' as const,
            completedAt: '2026-08-04T11:00:00Z' }
        : s))
    : STEPS;
  return (
    <div style={{ padding: '1.5rem', maxWidth: 980, margin: '0 auto' }} dir="rtl">
      <h2 style={{ marginBottom: '.3rem' }}>בדיקת לשונית הקליטה — נתונים מדומים</h2>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: '1rem' }}>
        לא מחובר למסד. פעולות מדפיסות את מה שהיה נשלח לשרת. {msg && <strong> · {msg}</strong>}
      </div>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button type="button" className="btn btn-sm btn-secondary"
          onClick={() => setHasPrevEmail(v => !v)}>
          {hasPrevEmail ? 'הסתר את מייל הרו״ח הקודם' : 'החזר את מייל הרו״ח הקודם'}
        </button>
        <button type="button" className="btn btn-sm btn-secondary"
          onClick={() => setPublished(v => !v)}>
          {published ? 'הצג לפני שנשלח ללקוח' : 'חזרה למצב שנשלח'}
        </button>
        <button type="button" className="btn btn-sm btn-secondary"
          onClick={() => setEmbedded(v => !v)}>
          {embedded ? 'עבור למסך הישן (לא מוטבע)' : 'חזרה למסך המאוחד (מוטבע)'}
        </button>
        <button type="button" className="btn btn-sm btn-secondary"
          onClick={() => setRepDone(v => !v)}>
          {repDone ? 'החזר את הייצוג למצב פתוח' : 'סמן את הייצוג כהושלם'}
        </button>
      </div>
      <OnboardingTab
        clientId={CLIENT_ID}
        client={FIXTURE_CLIENT}
        onClientPersisted={() => setMsg('onClientPersisted()')}
        clientDisplayName="שרון מזרחי"
        clientEmail="sharon.m@example.invalid"
        embedded={embedded}
        engagements={published ? ENGAGEMENTS : ENGAGEMENTS_UNPUBLISHED}
        steps={steps}
        quotations={QUOTATIONS}
        events={EVENTS}
        advance={async (stepId, action, payload) => {
          setMsg(`advance(${stepId}, ${action}, ${JSON.stringify(payload ?? {})})`);
          return { ok: true };
        }}
        refresh={() => setMsg('refresh()')}
        prevAccountant={{
          name: 'רו״ח דנה כהן',
          email: hasPrevEmail ? 'dana@prev-firm.example' : undefined,
          phone: '03-1234567',
        }}
        onPrepareReleaseLetter={(stepId) => { setMsg(`פתיחת מכתב שחרור לשלב ${stepId}`); setShowRelease(true); }}
        repStatusLabel="בקשת ייצוג · ממתין למילוי הלקוח"
        onOpenRepresentation={() => setMsg('קפיצה למרכז הייצוג')}
      />
      <h3 style={{ marginTop: '2rem' }}>מקטע "לקוחות בתהליך" — ראש מסך הלקוחות</h3>
      <ClientsOnboardingSection
        clients={GRID_CLIENTS}
        steps={GRID_STEPS}
        engagements={GRID_ENGAGEMENTS}
        onOpen={(id) => setMsg(`פתיחת דף המסע של ${id}`)}
      />

      <h3 style={{ marginTop: '2rem' }}>הרשת — מסך הבוקר</h3>
      {/* overflow-x — הטבלה רחבה מ-375px, ובלעדיו היא גוררת את כל העמוד
          לגלילה אופקית ושוברת צילומי מובייל של החלקים שמעליה. */}
      <div className="card" style={{ padding: '.5rem .7rem', overflowX: 'auto' }}>
        <OnboardingGrid
          clients={GRID_CLIENTS}
          steps={GRID_STEPS}
          engagements={GRID_ENGAGEMENTS}
          onOpen={(id) => setMsg(`פתיחת מרכז השליטה של ${id}`)}
        />
      </div>

      {showRelease && (
        <ReleaseLetterDialog
          clientId={CLIENT_ID}
          clientName="שרון מזרחי"
          businessName="שרון מזרחי — ייעוץ"
          clientEmail="sharon@example.com"
          prevAccountant={{ name: 'רו״ח דנה כהן', email: 'dana@prev-firm.example', phone: '03-1234567' }}
          brand={{
            firmName: 'גיא ישר · רואה חשבון', email: 'guy@example.com', phone: '03-0000000',
            pageBg: '#f8f7f5', cardBg: '#ffffff', border: '#e2e4e7', ink: '#25282d',
            muted: '#63686f', accent: '#3f5f8f', radius: 8, headerStyle: 'minimal',
          } as never}
          onSent={(x) => setMsg(`נשלח · ${x.materialKeys.length} חומרים · התנגדות עד ${x.objectionDueDate}`)}
          onClose={() => setShowRelease(false)}
        />
      )}
    </div>
  );
}
