// ─── מסך בדיקה למקטע הקליטות בשולחן ──────────────────────────────────────────
// ‼ למה זה קיים: משתמש הבדיקות (e2e-test@firm.local) מסומן active=false ברשימת
// המורשים, ולכן ה-RLS מחזיר לו אפס שורות — אין לו קליטות בכלל. הנתונים כאן
// מדמים משרד עם שישה לקוחות בקליטה בו-זמנית, שזה בדיוק המצב שהמקטע נבנה בשבילו
// ושאי אפשר להגיע אליו בנתוני אמת היום.
//
// פתיחה:  http://localhost:5173/?test-desk   (DEV בלבד)

import { useState } from 'react';
import type { Client } from '../types';
import type { Engagement, OnboardingStep, OnboardingStepType, OnboardingTrack, OnboardingBall, OnboardingStepStatus } from '../types/onboarding';
import OnboardingWaitingSection from './OnboardingWaitingSection';
import OnboardingClientsTable from './OnboardingClientsTable';

let seq = 0;
function step(
  clientId: string,
  stepType: OnboardingStepType,
  track: OnboardingTrack,
  status: OnboardingStepStatus,
  ball: OnboardingBall,
  extra: Partial<OnboardingStep> = {},
): OnboardingStep {
  seq += 1;
  return {
    id: `s${seq}`,
    userId: 'fixture-user',
    engagementId: `eng-${clientId}`,
    clientId,
    stepType,
    track,
    scope: 'person',
    status,
    ball,
    dependsOnStepId: undefined,
    dueDate: undefined,
    needsAttention: false,
    payload: {},
    completionMethod: 'manual',
    createdAt: `2026-08-0${(seq % 9) + 1}T09:00:00Z`,
    updatedAt: '2026-08-04T09:00:00Z',
    ...extra,
  };
}

const CLIENTS = [
  { id: 'c1', firstName: 'אילן', lastName: 'סימנטוב' },
  { id: 'c2', firstName: 'שרון', lastName: 'כהן' },
  { id: 'c3', firstName: 'יריב', lastName: 'רכס' },
  { id: 'c4', firstName: 'מיכל', lastName: 'לוי' },
  { id: 'c5', firstName: 'דוד', lastName: 'אברהם' },
  { id: 'c6', firstName: 'נטע', lastName: 'גולדברג' },
] as unknown as Client[];

const STEPS: OnboardingStep[] = [
  // c1 — בדיוק המצב של הלקוח האמיתי היום: שישה שלבים פתוחים, ההרשאה נעולה
  // ומסומנת "דורש טיפול". בגרסה הקודמת זה היה שש שורות על השולחן.
  step('c1', 'representation', 'authorities', 'in_progress', 'me'),
  step('c1', 'kyc_identification', 'internal', 'pending', 'me'),
  step('c1', 'paperless_invite', 'tools', 'pending', 'me'),
  step('c1', 'paperless_connection', 'tools', 'locked', 'client'),
  step('c1', 'internal_setup', 'internal', 'pending', 'me'),
  step('c1', 'first_month_review', 'review', 'pending', 'me'),
  step('c1', 'retainer_authorization', 'payment', 'locked', 'me',
       { needsAttention: true, payload: { amount: 252, billingStartMonth: '2026-08' } }),

  // c2 — הכדור אצלי, מסלול רו"ח קודם
  step('c2', 'representation', 'authorities', 'completed', 'me'),
  step('c2', 'release_letter', 'prev_accountant', 'pending', 'me'),
  step('c2', 'materials_received', 'prev_accountant', 'locked', 'prev_accountant'),
  step('c2', 'paperless_connection', 'tools', 'completed', 'me'),
  step('c2', 'internal_setup', 'internal', 'completed', 'me'),

  // c3 — הכדור אצלי, כמעט גמור
  step('c3', 'representation', 'authorities', 'verified', 'me'),
  step('c3', 'paperless_connection', 'tools', 'completed', 'me'),
  step('c3', 'retainer_authorization', 'payment', 'verified', 'me'),
  step('c3', 'internal_setup', 'internal', 'pending', 'me'),

  // c4 — תקוע: הלקוח לא הגיב שבוע
  step('c4', 'representation', 'authorities', 'completed', 'me'),
  step('c4', 'paperless_invite', 'tools', 'waiting_client', 'client', { needsAttention: true }),
  step('c4', 'paperless_connection', 'tools', 'locked', 'client'),

  // c5 — ממתין לאחרים: הכול אצל הלקוח או הרשות
  step('c5', 'representation', 'authorities', 'in_progress', 'authority'),
  step('c5', 'paperless_invite', 'tools', 'waiting_client', 'client'),

  // c6 — ממתין לאחרים: הרו"ח הקודם
  step('c6', 'release_letter', 'prev_accountant', 'waiting_client', 'prev_accountant'),
  step('c6', 'materials_received', 'prev_accountant', 'locked', 'prev_accountant'),
];

// התקשרות לכל לקוח, עם ותק שונה — כדי שעמודת "בקליטה" תראה טווח אמיתי.
const ENGAGEMENTS: Engagement[] = CLIENTS.map((c, i) => ({
  id: `eng-${c.id}`,
  userId: 'fixture-user',
  clientId: c.id,
  status: 'onboarding',
  approvedAt: new Date(Date.now() - (i * 6 + 2) * 86400000).toISOString(),
  createdAt: new Date(Date.now() - (i * 6 + 2) * 86400000).toISOString(),
}));

export default function TestDesk() {
  const [msg, setMsg] = useState('');
  return (
    <div style={{ padding: '1.5rem', maxWidth: 980, margin: '0 auto' }} dir="rtl">
      <h2 style={{ marginBottom: '.3rem' }}>בדיקת מקטע הקליטות בשולחן — נתונים מדומים</h2>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: '1rem' }}>
        שישה לקוחות בקליטה · 22 שלבים · {msg && <strong>{msg}</strong>}
      </div>
      <OnboardingWaitingSection
        steps={STEPS}
        clients={CLIENTS}
        onOpen={id => setMsg(`פתיחת קליטה של ${id}`)}
        onRemind={(s, id) => setMsg(`הכנת תזכורת — ${s.stepType} של ${id}`)}
      />

      <h3 style={{ margin: '2rem 0 .5rem', fontSize: 17, fontWeight: 500 }}>
        תצוגת המעקב — "בקליטה" במסך הלקוחות
      </h3>
      <div className="card" style={{ overflow: 'hidden', padding: '.4rem .6rem' }}>
        <OnboardingClientsTable
          clients={CLIENTS}
          steps={STEPS}
          engagements={ENGAGEMENTS}
          onOpen={id => setMsg(`פתיחת קליטה של ${id}`)}
        />
      </div>
    </div>
  );
}
