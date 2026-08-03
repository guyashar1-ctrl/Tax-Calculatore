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
  createdAt: '2026-08-01T09:00:00Z',
  updatedAt: '2026-08-01T09:00:00Z',
}];

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
];

const EVENTS: OnboardingEvent[] = [
  { id: 'e1', userId: 'fixture-user', stepId: 's8', engagementId: ENG_ID, type: 'status_changed', actor: 'accountant', note: 'הזיהוי הושלם', meta: {}, at: '2026-08-02T10:00:00Z' },
  { id: 'e2', userId: 'fixture-user', stepId: 's1', engagementId: ENG_ID, type: 'status_changed', actor: 'client', note: 'הלקוח מילא את פרטי הייצוג', meta: {}, at: '2026-08-01T14:30:00Z' },
  { id: 'e3', userId: 'fixture-user', engagementId: ENG_ID, type: 'created', actor: 'system', note: 'מסלול הקליטה הורכב מההצעה שאושרה', meta: { stepsCreated: 9 }, at: '2026-08-01T09:00:00Z' },
];

export default function TestOnboarding() {
  const [msg, setMsg] = useState('');
  return (
    <div style={{ padding: '1.5rem', maxWidth: 980, margin: '0 auto' }} dir="rtl">
      <h2 style={{ marginBottom: '.3rem' }}>בדיקת לשונית הקליטה — נתונים מדומים</h2>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: '1rem' }}>
        לא מחובר למסד. פעולות מדפיסות את מה שהיה נשלח לשרת. {msg && <strong> · {msg}</strong>}
      </div>
      <OnboardingTab
        clientId={CLIENT_ID}
        engagements={ENGAGEMENTS}
        steps={STEPS}
        events={EVENTS}
        advance={async (stepId, action, payload) => {
          setMsg(`advance(${stepId}, ${action}, ${JSON.stringify(payload ?? {})})`);
          return { ok: true };
        }}
        refresh={() => setMsg('refresh()')}
      />
    </div>
  );
}
