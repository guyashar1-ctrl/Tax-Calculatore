// ─── מסך בדיקה ללשונית הקליטה ────────────────────────────────────────────────
// ‼ למה זה קיים: משתמש הבדיקות (e2e-test@firm.local) מסומן active=false
// ברשימת המורשים, ולכן ה-RLS מחזיר לו אפס שורות מכל טבלה — אי אפשר לבדוק את
// המסך מול נתוני אמת בלי להתחבר לחשבון של גיא. כאן מרכיבים את הלשונית עם
// נתונים מדומים שמשקפים בדיוק את מה שהמרכיב בשרת מייצר.
//
// פתיחה:  http://localhost:5173/?test-onboarding   (DEV בלבד)

import { useState } from 'react';
import type { Engagement, OnboardingEvent, OnboardingStep } from '../../types/onboarding';
import OnboardingTab from './OnboardingTab';
import ReleaseLetterDialog from '../quotations/ReleaseLetterDialog';
import OnboardingGrid from '../OnboardingGrid';

const CLIENT_ID = 'fixture-client';
const ENG_ID = 'fixture-eng';

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
  step({ id: 's1c', stepType: 'representation_upgrade', track: 'authorities', scope: 'person', status: 'pending', ball: 'me',
         dueDate: '2026-11-01',
         payload: { secondaryAuthorities: ['withholding'] } }),
  step({ id: 's2', stepType: 'release_letter', track: 'prev_accountant', scope: 'person', status: 'pending', ball: 'me' }),
  step({ id: 's3', stepType: 'materials_received', track: 'prev_accountant', scope: 'person', status: 'locked', ball: 'prev_accountant', dependsOnStepId: 's2',
         payload: { checklist: [
           { key: 'ledgers', label: 'כרטסות', done: true },
           { key: 'trial_balance', label: 'מאזן בוחן', done: false },
           { key: 'uniform_file', label: 'קובץ מבנה אחיד', done: false },
         ] } }),
  // ── פייפרלס: טריאז' שטרם נענה (השאלות מוצגות על השלב הזה) ──
  step({ id: 's4', stepType: 'paperless_invite', track: 'tools', scope: 'person', status: 'pending', ball: 'me',
         payload: { paperlessStatus: 'unknown', dataSource: 'unknown' } }),
  step({ id: 's5', stepType: 'paperless_connection', track: 'tools', scope: 'person', status: 'locked', ball: 'client', dependsOnStepId: 's4' }),
  // ── פייפרלס: מסלול העברה ממייצג אחר, אחרי טריאז' — כרטיס ההוראות ──
  step({ id: 's5b', stepType: 'paperless_connection', track: 'tools', scope: 'person', status: 'pending', ball: 'me',
         payload: { paperlessStatus: 'other_rep', dataSource: 'paperless' } }),
  // ── הרשאת תשלום: נעולה, עם דגל "דורש טיפול" ──
  step({ id: 's6', stepType: 'retainer_authorization', track: 'payment', scope: 'engagement', status: 'locked', ball: 'me', dependsOnStepId: 's5',
         needsAttention: true, dueDate: '2026-08-20',
         payload: { amount: 450, billingStartMonth: '2026-09' } }),
  // ── הרשאת תשלום: פתוחה, בלי קישור — "הכן מייל" חסום ──
  step({ id: 's6b', stepType: 'retainer_authorization', track: 'payment', scope: 'engagement', status: 'pending', ball: 'me',
         payload: { amount: 780, billingStartMonth: '2026-10' } }),
  // ── הרשאת תשלום: פתוחה, עם קישור — "הכן מייל" פעיל ──
  step({ id: 's6c', stepType: 'retainer_authorization', track: 'payment', scope: 'engagement', status: 'in_progress', ball: 'me',
         payload: { amount: 1200, billingStartMonth: '2026-09', authUrl: 'https://www.paperless.tax/authorize/demo-123' } }),
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
const GRID_CLIENTS = [
  { id: CLIENT_ID, firstName: 'שרון', lastName: 'מזרחי' },
  { id: 'grid-2', firstName: 'אבי', lastName: 'דהן' },
  { id: 'grid-3', firstName: 'תמר', lastName: 'בן-חיים' },
] as never[];

const GRID_ENGAGEMENTS: Engagement[] = [
  ENGAGEMENTS[0],
  { ...ENGAGEMENTS[0], id: 'eng-2', clientId: 'grid-2', approvedAt: '2026-07-01T09:00:00Z' },
  { ...ENGAGEMENTS[0], id: 'eng-3', clientId: 'grid-3', approvedAt: '2026-08-03T09:00:00Z' },
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
];

export default function TestOnboarding() {
  const [msg, setMsg] = useState('');
  // שני המצבים של מכתב השחרור: עם מייל לרו"ח הקודם (הכפתור פעיל) ובלעדיו
  // (הכפתור חסום עם הסיבה) — המצב השני הוא מקרה הקצה של המסלול.
  const [hasPrevEmail, setHasPrevEmail] = useState(true);
  // מצב בנייה מול מצב ניהול — אותה לשונית, לפני ואחרי פתיחת התהליך ללקוח.
  const [published, setPublished] = useState(true);
  const [showRelease, setShowRelease] = useState(false);
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
          {published ? 'הצג את מצב הבנייה (לפני פתיחה ללקוח)' : 'חזרה למצב ניהול'}
        </button>
      </div>
      <OnboardingTab
        clientId={CLIENT_ID}
        clientDisplayName="שרון מזרחי"
        engagements={published ? ENGAGEMENTS : ENGAGEMENTS_UNPUBLISHED}
        steps={STEPS}
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
      <h3 style={{ marginTop: '2rem' }}>הרשת — מסך הבוקר</h3>
      <div className="card" style={{ padding: '.5rem .7rem' }}>
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
