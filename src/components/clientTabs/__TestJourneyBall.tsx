// ─── מסך בדיקה: מה מחכה לי אצל הלקוח הזה ────────────────────────────────────
// ‼ למה זה קיים: התג על לשונית «המסע» נולד ב-ClientWorkspace ולא ב-JourneyTab,
// ולכן __TestJourney לא יכול להראות אותו. וגם — בונה התהליך מוצג רק כשיש
// התקשרות שטרם נפתחה ללקוח, מצב שאין לאף לקוח דוגמה בשרת הפיתוח.
// כאן מרכיבים את הכרטיס האמיתי עם נתונים מדומים, בלי לגעת בנתוני אמת.
//
// פתיחה:  http://localhost:5173/?test-journeyball   (DEV בלבד)

import { useState } from 'react';
import type { Client, RepresentationStatus } from '../../types';
import type { Engagement, OnboardingStep } from '../../types/onboarding';
import ClientWorkspace from '../ClientWorkspace';

const CLIENT_ID = 'fixture-ball-client';

const CLIENT = {
  id: CLIENT_ID,
  firstName: 'בדיקה', lastName: 'בדיקה',
  idNumber: '314667346', phone: '0526549229', email: 'bdika@example.invalid',
  city: 'תל אביב',
  incomeTaxType: 'selfEmployed', niType: 'selfEmployed', vatStatus: 'authorizedDealer',
  taxFiles: [], notes: '', activity: [],
  lifecycleStage: 'onboarding',
  representationStatus: 'awaiting_accountant',
  createdAt: '2026-08-09T06:00:00Z',
} as unknown as Client;

const ENGAGEMENT: Engagement = {
  id: 'fixture-eng-ball', clientId: CLIENT_ID, quotationId: 'fixture-q', status: 'active',
  monthlyTotal: 500, approvedAt: '2026-08-09T06:05:00Z',
  // ‼ בלי processPublishedAt — זה מה שמפעיל את בונה התהליך
};

const step = (
  id: string, stepType: string, status: string, ball: string,
) => ({ id, clientId: CLIENT_ID, engagementId: 'fixture-eng-ball', stepType, status, ball, payload: {}, sortOrder: 0 }) as unknown as OnboardingStep;

// אותו תמהיל כמו אצל "בדיקה בדיקה" במסד: תשעה שלבים עם ball='me', שניים מהם
// נעולים — כדי שיהיה אפשר לראות שהתג סופר שבעה ולא תשעה.
const STEPS: OnboardingStep[] = [
  step('s1', 'representation', 'in_progress', 'me'),
  step('s2', 'representation_upgrade', 'pending', 'me'),
  step('s3', 'kyc_identification', 'pending', 'me'),
  step('s4', 'client_documents', 'pending', 'client'),
  step('s5', 'prev_accountant_details', 'pending', 'client'),
  step('s6', 'release_letter', 'locked', 'me'),
  step('s7', 'materials_received', 'locked', 'prev_accountant'),
  step('s8', 'paperless_invite', 'pending', 'me'),
  step('s9', 'paperless_connection', 'locked', 'client'),
  step('s10', 'retainer_authorization', 'locked', 'me'),
  step('s11', 'first_month_review', 'pending', 'me'),
  step('s12', 'intake_questionnaire', 'pending', 'me'),
  step('s13', 'internal_setup', 'pending', 'me'),
];

const REP_STATES: RepresentationStatus[] = [
  'pending_fill', 'awaiting_accountant', 'pending_signature',
  'awaiting_stamp', 'awaiting_authorities', 'active',
];

export default function TestJourneyBall() {
  const [rep, setRep] = useState<RepresentationStatus>('awaiting_accountant');
  const [published, setPublished] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const push = (s: string) => setLog(l => [s, ...l].slice(0, 5));

  return (
    <div className="app" style={{ minHeight: '100vh' }}>
      <div style={{ padding: '.6rem .9rem', display: 'flex', gap: '.35rem', flexWrap: 'wrap', borderBottom: '1px solid var(--hairline-1)', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>מצב הייצוג:</span>
        {REP_STATES.map(s => (
          <button key={s} type="button" className={`btn btn-sm ${rep === s ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setRep(s)}>{s}</button>
        ))}
        <span style={{ width: '1rem' }} />
        <button type="button" className={`btn btn-sm ${published ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setPublished(v => !v)}>
          {published ? 'התהליך נפתח ללקוח' : 'בונה התהליך'}
        </button>
        <button type="button" className={`btn btn-sm ${stuck ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setStuck(v => !v)}>
          {stuck ? 'יש שלב תקוע' : 'שום דבר לא תקוע'}
        </button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }} id="ball-log">{log[0] ?? ''}</span>
      </div>
      <div className="main">
        <ClientWorkspace
          // הכרטיס מחזיק עותק פנימי של הלקוח ולא מסתנכרן מחדש; key מאלץ הרכבה
          // מחדש, כדי שכפתורי הבדיקה באמת יחליפו מצב.
          key={`${rep}-${published}-${stuck}`}
          client={{ ...CLIENT, representationStatus: rep }}
          clients={[CLIENT]}
          tasks={[]}
          journeyUi
          onboardingEnabled
          engagements={[published ? { ...ENGAGEMENT, processPublishedAt: '2026-08-09T07:00:00Z' } : ENGAGEMENT]}
          onboardingSteps={stuck
            ? STEPS.map(s => (s.id === 's8' ? { ...s, status: 'blocked' } as OnboardingStep : s))
            : STEPS}
          onboardingEvents={[]}
          advanceOnboardingStep={async () => ({ ok: true })}
          onOpenRepresentation={id => push(`נפתח מרכז הייצוג — ${id}`)}
          onSave={() => push('onSave')}
          onCancel={() => push('onCancel')}
          onDelete={() => push('onDelete')}
          onAddTaskForClient={() => push('onAddTaskForClient')}
          onSelectTask={() => push('onSelectTask')}
          onToggleTaskDone={() => push('onToggleTaskDone')}
          onChangeTaskStatus={() => push('onChangeTaskStatus')}
          onChangeTaskBall={() => push('onChangeTaskBall')}
          onChangeTaskCategory={() => push('onChangeTaskCategory')}
          onReorderTask={() => push('onReorderTask')}
          onDeleteTask={() => push('onDeleteTask')}
        />
      </div>
    </div>
  );
}
