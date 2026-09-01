// מסך בדיקה (?test-startrep) — כניסת "התחלת ייצוג" ללקוח קיים בלי שום בקשת
// ייצוג (156, 157). מרכיב את ClientWorkspace המלא עם כרטיס "הדסה סלע": נשואה,
// יש לה עסק, לבעלה אין עסק, ואין לה representationStatus בכלל — בדיוק
// התרחיש שדווח. ‼ בררר שלב חיים/סטטוס ייצוג כדי לבדוק את כל הענפים
// (ליד/הצעה/פעיל, עם/בלי ייצוג בתהליך) בלי לבנות כמה כרטיסים.

import { useState } from 'react';
import type { Client, LifecycleStage, RepresentationStatus } from '../types';
import type { Quotation } from '../types/quotations';
import ClientWorkspace from './ClientWorkspace';
import RepresentationOnboardingDialog, { CreateRepresentationInput } from './RepresentationOnboardingDialog';

const STAGES: LifecycleStage[] = ['lead', 'quoted', 'active'];
const REP_STATES: { key: string; label: string; value: RepresentationStatus | undefined }[] = [
  { key: 'none', label: 'אין ייצוג בכלל', value: undefined },
  { key: 'pending', label: 'ייצוג בתהליך (pending_fill)', value: 'pending_fill' },
  { key: 'active', label: 'ייצוג פעיל', value: 'active' },
];

const HADASSA: Client = {
  id: 'fixture-hadassa', idNumber: '203456789', firstName: 'הדסה', lastName: 'סלע',
  birthDate: '1985-03-10', gender: 'female',
  phone: '0521234567', email: 'hadassa@example.test', city: 'רעננה', address: '',
  incomeTaxType: 'selfEmployed', niType: 'selfEmployed', vatStatus: 'authorizedDealer',
  businessDescription: 'עיצוב גרפי - עצמאית', hasExemptFromWithholding: false,
  hasTaxCoordination: false, taxCoordinationDetails: '',
  familyStatus: 'married',
  spouseName: 'אבי סלע', spouseIdNumber: '', spouseWorking: true, spouseIncome: 15000,
  spouseFirstName: 'אבי', spouseLastName: 'סלע',
  spouse: null, children: [],
  isNewImmigrant: false, aliyahYear: 0,
  isReturningResident: false, returningYear: 0,
  disabilityPercentage: 0, disabilityType: '',
  hasAcademicDegree: false, academicDegreeYear: 0, academicDegreeType: '',
  completedIdf: false, idfReleaseYear: 0,
  completedNationalService: false, nationalServiceYear: 0,
  qualifyingSettlementId: '', qualifyingSettlementOverride: false, qualifyingSettlementCreditPoints: 0,
  hasResidentialProperty: false, propertyAddress: '', numberOfProperties: 0,
  hasPension: false, pensionFundName: '',
  employeePensionPct: 0, employerPensionPct: 0,
  hasKupotGemel: false, hasKrenHashtalmut: false, krenHashtalmutMonthly: 0,
  notes: '',
  assignedAccountantId: 'emp-self',
  tags: [], additionalContacts: [], activity: [],
  // ‼ בדיוק התרחיש שדווח: ליד, בלי representationStatus, בלי הצעה — מעולם
  // לא נפתח לה ייצוג. lifecycleStage/representationStatus נשלטים בבדיקה.
  lifecycleStage: 'lead',
  createdAt: '2026-06-01T08:00:00.000Z', updatedAt: '2026-06-01T08:00:00.000Z',
} as unknown as Client;

// ‼ (157) הצעה "נשלחה" בלי אישור — כדי לבדוק ששלב 'quoted' לא מסתיר ייצוג
// שכבר בתהליך משלו מאחורי "ההצעה נשלחה וטרם נצפתה".
const SENT_QUOTATION: Quotation = {
  id: 'q-hadassa-1', clientId: HADASSA.id, quotationNumber: 'Q-1001', revision: 1,
  status: 'sent', items: [], futureServices: [], vatRate: 18, events: [],
  sentAt: '2026-08-20T08:00:00.000Z',
} as unknown as Quotation;

export default function TestStartRepresentation() {
  const [client, setClient] = useState<Client>(HADASSA);
  const [pending, setPending] = useState<Client | null>(null);
  const [sent, setSent] = useState<CreateRepresentationInput | null>(null);
  const [log, setLog] = useState<string[]>([]);

  return (
    <div style={{ direction: 'rtl' }}>
      <div id="tst-controls" style={{ padding: '.75rem 1rem', background: 'var(--surface-2)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: 13 }}>
        <div>
          <b>שלב חיים:</b>{' '}
          {STAGES.map(s => (
            <label key={s} style={{ marginInlineEnd: 10 }}>
              <input type="radio" name="stage" checked={client.lifecycleStage === s}
                onChange={() => setClient(c => ({ ...c, lifecycleStage: s }))} /> {s}
            </label>
          ))}
        </div>
        <div>
          <b>סטטוס ייצוג:</b>{' '}
          {REP_STATES.map(r => (
            <label key={r.key} style={{ marginInlineEnd: 10 }}>
              <input type="radio" name="repstatus"
                checked={(client.representationStatus ?? undefined) === r.value}
                onChange={() => setClient(c => ({ ...c, representationStatus: r.value }))} /> {r.label}
            </label>
          ))}
        </div>
      </div>
      <div id="tst-log" style={{ padding: '.5rem 1rem', background: 'var(--surface-2)', fontSize: 12 }}>
        {log.length === 0 ? '(אין אירועים עדיין)' : log.join(' · ')}
      </div>
      <ClientWorkspace
        client={client}
        clients={[client]}
        tasks={[]}
        onSave={setClient}
        onCancel={() => {}}
        onDelete={() => {}}
        onAddTaskForClient={() => {}}
        onSelectTask={() => {}}
        onToggleTaskDone={() => {}}
        onChangeTaskStatus={() => {}}
        onChangeTaskBall={() => {}}
        onChangeTaskCategory={() => {}}
        onReorderTask={() => {}}
        onDeleteTask={() => {}}
        journeyUi={true}
        onboardingEnabled={true}
        engagements={[]}
        onboardingSteps={[]}
        onboardingEvents={[]}
        onOpenRepresentation={(id) => setLog(l => [...l, `onOpenRepresentation(${id}) - ניווט לבקשה קיימת, לא אמור לקרות כאן`])}
        onStartRepresentation={(id) => {
          setLog(l => [...l, `onStartRepresentation(${id})`]);
          setPending(client);
        }}
        quotations={client.lifecycleStage === 'quoted' ? [SENT_QUOTATION] : []}
      />
      {pending && (
        <RepresentationOnboardingDialog
          onCreate={async (data) => {
            setSent(data);
            setPending(null);
            return { link: 'https://example.test/?onboard=demo', emailSent: false };
          }}
          onCancel={() => setPending(null)}
          initialName={`${pending.firstName} ${pending.lastName}`.trim()}
          initialEmail={pending.email || undefined}
          alreadyRepresented={{}}
        />
      )}
      {sent && (
        <pre id="tst-sent-payload" style={{ margin: '1rem', padding: '1rem', background: 'var(--surface-2)', fontSize: 12, direction: 'ltr' }}>
          {JSON.stringify(sent, null, 2)}
        </pre>
      )}
    </div>
  );
}
