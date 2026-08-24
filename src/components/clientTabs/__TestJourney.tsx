// ─── מסך בדיקה לדף המסע ──────────────────────────────────────────────────────
// ‼ למה זה קיים: משתמש הבדיקות מסומן active=false ברשימת המורשים, ולכן ה-RLS
// מחזיר לו אפס שורות; ובשרת הפיתוח מוזרקים לקוחות דוגמה שכולם "פעיל" בלי
// התקשרות, בלי הצעה ובלי בקשות. כאן מרכיבים את דף המסע עם נתונים מדומים
// לכל אחד מחמשת המצבים — בלי לגעת בנתוני אמת ובלי לשלוח דבר.
//
// פתיחה:  http://localhost:5173/?test-journey   (DEV בלבד)

import { useState } from 'react';
import type { Client, Task } from '../../types';
import type { Engagement, OnboardingStep } from '../../types/onboarding';
import type { Quotation, Lead } from '../../types/quotations';
import type { EmailMessage } from '../../types/emailActivity';
import type { AnnualReportSession } from '../../features/annualReport/types';
import JourneyTab from './JourneyTab';

const CLIENT_ID = 'fixture-journey-client';

// ?theme=light|dark — קיבוע ערכה לצילומי מסך ללא-ראש (אין App שמפעיל useTheme).
{
  const t = /[?&]theme=(light|dark)/.exec(window.location.search)?.[1];
  if (t) document.documentElement.dataset.theme = t;
}

const baseClient: Client = {
  id: CLIENT_ID,
  firstName: 'אילן',
  lastName: 'סימנטוב',
  idNumber: '029384756',
  phone: '054-8823001',
  email: 'ilan.s@example.invalid',
  city: 'תל אביב',
  incomeTaxType: 'selfEmployed',
  niType: 'selfEmployed',
  vatStatus: 'authorizedDealer',
  vatFrequency: 'bi_monthly',
  pitAdvanceFrequency: 'monthly',
  taxFiles: [{ id: 'tf1', authority: 'deductions', fileNumber: '9114', owner: 'client', repStatus: 'active' }],
  notes: '',
  activity: [
    { id: 'a1', kind: 'note', text: 'שיחת טלפון ראשונה', at: '2026-08-02T08:00:00Z' },
    { id: 'a2', kind: 'note', text: 'הליד נוצר', at: '2026-08-02T07:30:00Z' },
  ],
  pinnedNote: 'אילן מעדיף שיחות אחרי 17:00. החשבונות מגיעים מהמנהלת שלו, מיכל.',
  lifecycleStage: 'active',
} as unknown as Client;

const LEAD: Lead = {
  id: 'fixture-lead',
  fullName: 'טל אביטן',
  phone: '054-7781122',
  email: 'tal@example.invalid',
  businessName: 'סטודיו אביטן · עיצוב גרפי ומיתוג',
  dealerType: 'exempt',
  status: 'new',
  hasPreviousAccountant: false,
  businessTransfer: false,
  referralSource: 'המלצה של אילן סימנטוב',
  notes: 'הנהלת חשבונות שוטפת + דוח שנתי; שאל על חשבות שכר לעובדת אחת.',
  convertedClientId: CLIENT_ID,
  createdAt: '2026-08-02T07:30:00Z',
  updatedAt: '2026-08-03T10:00:00Z',
};

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

const QUOTE_VIEWED: Quotation = {
  id: 'fixture-q1', clientId: CLIENT_ID, quotationNumber: '1047', revision: 1,
  status: 'viewed', items: [], futureServices: [], vatRate: 18,
  sentAt: daysAgo(4), firstViewedAt: daysAgo(2), expiresAt: daysAhead(9),
  representation: { authorities: ['incomeTax'] } as unknown as Quotation['representation'],
  events: [
    { type: 'created', at: daysAgo(5) },
    { type: 'sent', at: daysAgo(4) },
    { type: 'reminder_sent', at: daysAgo(1) },
    { type: 'viewed', at: daysAgo(2) },
  ],
  createdAt: daysAgo(5), updatedAt: daysAgo(1),
};

const QUOTE_EXPIRED: Quotation = {
  ...QUOTE_VIEWED, id: 'fixture-q2', quotationNumber: '1031',
  status: 'sent', firstViewedAt: undefined,
  sentAt: daysAgo(50), expiresAt: daysAgo(40),
  events: [{ type: 'created', at: daysAgo(51) }, { type: 'sent', at: daysAgo(50) }],
};

const EMAILS: EmailMessage[] = [{
  id: 'fixture-mail-1', kind: 'quotation', status: 'opened',
  toEmail: 'ilan.s@example.invalid', subject: 'הצעת מחיר ממשרד גיא ישר',
  sentAt: daysAgo(4), deliveredAt: daysAgo(4), openedAt: daysAgo(2),
  clientId: CLIENT_ID,
} as unknown as EmailMessage];

const TASKS: Task[] = [
  { id: 't1', clientId: CLIENT_ID, title: 'להגיש דוח 102 לחודש יולי', status: 'open', ballWith: 'me', progress: 'new', category: 'institutions', dueDate: daysAgo(3), createdAt: daysAgo(20) },
  { id: 't2', clientId: CLIENT_ID, title: 'לחדש אישור ניכוי במקור', status: 'open', ballWith: 'me', progress: 'new', category: 'ongoing', dueDate: daysAhead(4), createdAt: daysAgo(10) },
  { id: 't3', clientId: CLIENT_ID, title: 'לקבל אישורי תרומות 2025', status: 'open', ballWith: 'client', progress: 'new', category: 'annual_report', dueDate: daysAhead(26), createdAt: daysAgo(8) },
] as unknown as Task[];

const SESSIONS: AnnualReportSession[] = [
  {
    id: 's1', clientId: CLIENT_ID, taxYear: 2025, status: 'in_progress',
    createdAt: daysAgo(30), updatedAt: daysAgo(2),
    model: {
      income: { sources: ['business'] },
      meta: {
        docStatuses: { d1: 'received', d2: 'received', d3: 'requested', d4: 'pending' },
        unknownQuestions: ['q17'],
      },
    },
  },
  {
    id: 's2', clientId: CLIENT_ID, taxYear: 2024, status: 'mapping_done',
    createdAt: daysAgo(400), updatedAt: daysAgo(360),
    model: {
      income: { sources: ['business'] },
      meta: { docStatuses: { d1: 'received', d2: 'received' }, unknownQuestions: [] },
    },
  },
] as unknown as AnnualReportSession[];

const ENGAGEMENT: Engagement = {
  id: 'fixture-eng', clientId: CLIENT_ID, quotationId: 'fixture-q1', status: 'active',
  monthlyTotal: 1180, billingStartMonth: '2025-09',
  approvedAt: daysAgo(400), activatedAt: daysAgo(340), processPublishedAt: daysAgo(399),
};

const STEPS: OnboardingStep[] = [
  { id: 'st1', clientId: CLIENT_ID, engagementId: 'fixture-eng', stepType: 'client_documents', title: 'אישורי תרומות 2025', status: 'waiting_client', ball: 'client', payload: { published: true }, sortOrder: 1 },
  { id: 'st2', clientId: CLIENT_ID, engagementId: 'fixture-eng', stepType: 'custom_request', title: 'עדכון תמונת מס - מחזור 2026', status: 'pending', ball: 'me', payload: { published: false }, sortOrder: 2 },
  { id: 'st3', clientId: CLIENT_ID, engagementId: 'fixture-eng', stepType: 'representation', title: 'ייפוי כוח', status: 'completed', ball: 'me', payload: {}, sortOrder: 0 },
  // ‼ M2 — יישור קו: btl הושלם, vat/income פתוחים, opening_call נעול עד ששלושתם יושלמו.
  { id: 'ial-btl', clientId: CLIENT_ID, engagementId: 'fixture-eng', stepType: 'institution_alignment_btl', status: 'completed', ball: 'me', payload: { institution: 'btl', checkedAt: '2026-08-01T09:00:00Z', collected: { niBalance: 0, niAdvanceMonthly: 2150 } }, sortOrder: 3 },
  { id: 'ial-vat', clientId: CLIENT_ID, engagementId: 'fixture-eng', stepType: 'institution_alignment_vat', status: 'pending', ball: 'me', payload: { institution: 'vat' }, sortOrder: 4 },
  { id: 'ial-income', clientId: CLIENT_ID, engagementId: 'fixture-eng', stepType: 'institution_alignment_income', status: 'pending', ball: 'me', payload: { institution: 'income' }, sortOrder: 5 },
  { id: 'ial-call', clientId: CLIENT_ID, engagementId: 'fixture-eng', stepType: 'opening_call', status: 'locked', ball: 'me', payload: { clarifications: [] }, sortOrder: 6 },
] as unknown as OnboardingStep[];

/** לתרחיש הלקוח הוותיק/הפעיל — שלושתם הושלמו, כדי לבדוק את "בצע יישור קו מחדש". */
const STEPS_ALIGNED_DONE: OnboardingStep[] = [
  ...STEPS,
].map(s => (s.stepType.startsWith('institution_alignment_')
  ? { ...s, status: 'completed', payload: { ...s.payload, checkedAt: '2026-06-01T09:00:00Z' } }
  : s)) as unknown as OnboardingStep[];

/** לקוח ותיק במשרד באמצע יישור קו — בלי engagement, בלי בקשות אחרות. בודק "חזרה להקמת התיק". */
const STEPS_EXISTING_OFFICE_MIDWAY: OnboardingStep[] = [
  { id: 'ial-btl', clientId: CLIENT_ID, stepType: 'institution_alignment_btl', status: 'pending', ball: 'me', payload: { institution: 'btl' }, sortOrder: 0 },
  { id: 'ial-vat', clientId: CLIENT_ID, stepType: 'institution_alignment_vat', status: 'pending', ball: 'me', payload: { institution: 'vat' }, sortOrder: 1 },
  { id: 'ial-income', clientId: CLIENT_ID, stepType: 'institution_alignment_income', status: 'pending', ball: 'me', payload: { institution: 'income' }, sortOrder: 2 },
] as unknown as OnboardingStep[];

type Scenario = 'lead' | 'leadClosed' | 'quoted' | 'quotedExpired' | 'onboarding' | 'active' | 'activeQuiet' | 'existingOffice';

const SCENARIOS: { key: Scenario; label: string }[] = [
  { key: 'lead', label: 'ליד' },
  { key: 'leadClosed', label: 'ליד · לא רלוונטי' },
  { key: 'quoted', label: 'הצעה · נצפתה' },
  { key: 'quotedExpired', label: 'הצעה · פג תוקף' },
  { key: 'onboarding', label: 'קליטה' },
  { key: 'active', label: 'לקוח פעיל' },
  { key: 'activeQuiet', label: 'לקוח פעיל · שקט' },
  { key: 'existingOffice', label: 'לקוח ותיק במשרד (M2)' },
];

export default function TestJourney() {
  // ?test-journey&sc=onboarding פותח ישר בתרחיש — לצילום מסך ללא-ראש.
  const [sc, setSc] = useState<Scenario>(() => {
    const m = /[?&]sc=([a-zA-Z]+)/.exec(window.location.search);
    return m && SCENARIOS.some(s => s.key === m[1]) ? (m[1] as Scenario) : 'lead';
  });

  const isLead = sc === 'lead' || sc === 'leadClosed';
  const isQuoted = sc === 'quoted' || sc === 'quotedExpired';
  const quiet = sc === 'activeQuiet';

  const client: Client = {
    ...baseClient,
    lifecycleStage: isLead ? 'lead' : isQuoted ? 'quoted' : sc === 'onboarding' ? 'onboarding' : 'active',
    ...(isLead ? { firstName: 'טל', lastName: 'אביטן' } : {}),
  };

  const quotations = isQuoted
    ? [sc === 'quotedExpired' ? QUOTE_EXPIRED : QUOTE_VIEWED]
    : sc === 'lead' || sc === 'leadClosed' ? [] : [{ ...QUOTE_VIEWED, status: 'approved' as const, approvedAt: daysAgo(400) }];

  const tasks = quiet ? [] : isLead ? [TASKS[2]] : TASKS;
  const openTasks = tasks.filter(t => t.status === 'open');
  const steps = sc === 'onboarding' ? STEPS : sc === 'active' || quiet ? STEPS_ALIGNED_DONE
    : sc === 'existingOffice' ? STEPS_EXISTING_OFFICE_MIDWAY : [];

  return (
    <div className="app" style={{ minHeight: '100vh' }}>
      <div style={{ padding: '.6rem .9rem', display: 'flex', gap: '.35rem', flexWrap: 'wrap', borderBottom: '1px solid var(--hairline-1)' }}>
        {SCENARIOS.map(s => (
          <button
            key={s.key}
            type="button"
            className={`btn btn-sm ${sc === s.key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSc(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="main" style={{ padding: '1rem' }}>
        <JourneyTab
          client={client}
          tasks={tasks}
          alerts={quiet || isLead ? [] : [{ kind: 'withholding_expired', level: 'danger', text: 'אישור ניכוי במקור פג תוקף' } as never]}
          openTasks={openTasks}
          upcomingDebts={openTasks.filter(t => t.ballWith === 'me')}
          quotations={quotations as Quotation[]}
          engagements={sc === 'onboarding' || sc === 'active' || quiet ? [ENGAGEMENT] : []}
          steps={steps}
          events={[]}
          advance={async () => ({ ok: true })}
          onClientPersisted={() => {}}
          lead={sc === 'leadClosed' ? { ...LEAD, status: 'closed' } : isLead ? LEAD : undefined}
          onEditLead={() => alert('עריכת ליד (בדיקה)')}
          onNewQuotation={() => alert('בנה הצעה (בדיקה)')}
          onOpenQuotation={() => alert('פתח הצעה (בדיקה)')}
          emailsOverride={EMAILS}
          onPinNote={() => {}}
          onAddNote={() => {}}
          onGotoTab={() => {}}
          onSelectTask={() => alert('פתח משימה (בדיקה)')}
          taxSessions={quiet || isLead ? [] : SESSIONS}
          onOpenYear={() => alert('פתח שנה (בדיקה)')}
        />
      </div>
    </div>
  );
}
