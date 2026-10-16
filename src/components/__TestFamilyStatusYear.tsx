// ─── מסך בדיקה (DEV בלבד): מצב משפחתי לפי שנת המס ──────────────────────────
// ?test-family-year — לקוח דמה (לא לקוח אמיתי) אלמן בלי שנה. עורך הכרטיס (CardSectionEditor «פרטי הלקוח»),
// התצוגה «אלמן/ה · מ-…», «מה בדקנו» של הערכת המס ל-2025 ול-2026, והמחשבון — כולם מאותה פונקציה.
// בלי רשת: השמירה מעדכנת את הלקוח המקומי בלבד.

import { useState } from 'react';
import type { Client } from '../types';
import CardSectionEditor from '../features/annualReport/CardSectionEditor';
import { ChecksList } from '../features/taxEstimate/AuthorityView';
import { computeEstimate } from '../features/taxEstimate/engine';
import type { EstimateDraft } from '../features/taxEstimate/types';
import { familyStatusDisplay, familyStatusForYear } from '../utils/familyStatusYear';
import TaxCalculator from './TaxCalculator';

const SAMPLE: Client = {
  id: 'sample-family-year', firstName: 'ישראל', lastName: 'ישראלי (דוגמה)', idNumber: '000000018', gender: 'male', familyStatus: 'widowed',
  birthDate: '1975-04-01', city: 'תל אביב', address: 'הרצל 1', phone: '', email: '', children: [{ id: 'k1', firstName: 'נועה', birthDate: '2014-06-01', birthYear: 2014, hasDisability: false }],
  employers: [], businesses: [], properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], bankAccounts: [], fieldMeta: {}, spouse: null,
  incomeTaxType: 'employee', niType: 'employee', isNewImmigrant: false, aliyahYear: 0, isReturningResident: false, disabilityPercentage: 0,
  hasAcademicDegree: false, academicDegreeYear: 0, completedIdf: false, idfReleaseYear: 0, completedNationalService: false, nationalServiceYear: 0,
  qualifyingSettlementId: '',
} as unknown as Client;

const draft = (year: number, preparedOn: string): EstimateDraft => ({
  cutoffMonth: 12, preparedOn, oneOffs: [], adjustments: [], payments: [], savings: [], reconciliations: [], decisions: [], vat: { via: 'manual', periods: [] },
  lines: [{ id: 's', person: 'client', source: 'salary', label: 'משכורת', actualToCutoff: 200_000 }],
  it: { via: 'manual', readOn: `${year}-12-31`, method: 'none', frequency: 1, periods: [] }, ni: { via: 'manual', readOn: `${year}-12-31`, paidToCutoff: 0 },
});

export default function TestFamilyStatusYear() {
  const [client, setClient] = useState<Client>(SAMPLE);
  const [editing, setEditing] = useState(false);
  const [calc, setCalc] = useState(false);
  const est = (year: number, prepared: string) => computeEstimate(draft(year, prepared), { client, taxYear: year });
  const y25 = est(2025, '2026-02-01'), y26 = est(2026, '2026-10-16');
  if (calc) return <div dir="rtl" style={{ padding: 16 }}><TaxCalculator client={client} onBack={() => setCalc(false)} /></div>;
  return (
    <div dir="rtl" style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
      <p className="ty-chip amber">דוגמה — לא לקוח אמיתי</p>
      <h2>מצב משפחתי לפי שנת המס</h2>
      <div className="pd-regline" data-testid="display">מצב משפחתי: <b>{familyStatusDisplay(client)}</b></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
        <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>עריכת פרטי הלקוח</button>
        <button type="button" className="btn" onClick={() => setCalc(true)}>מחשבון מס</button>
      </div>
      {[2025, 2026].map(y => (
        <section key={y} data-testid={`est-${y}`} style={{ marginTop: 16 }}>
          <h3>הערכת מס {y}</h3>
          <p className="ty-note" data-testid={`line-${y}`}>{familyStatusForYear(client, y).line}</p>
          {(y === 2025 ? y25 : y26).blockers.filter(b => b.code === 'family_status_year').map(b => <p key={b.code} className="ty-note" style={{ whiteSpace: 'normal', color: '#92400e' }} data-testid={`blocker-${y}`}>להשלים לפני אישור: {b.text}</p>)}
          <ChecksList checks={((y === 2025 ? y25 : y26).checks ?? []).filter(c => c.id === 'family-year')} />
        </section>
      ))}
      {editing && (
        <CardSectionEditor client={client} editTarget="identity" onClose={() => setEditing(false)}
          onPatchClient={async p => setClient(c => ({ ...c, ...p }))} />
      )}
    </div>
  );
}
