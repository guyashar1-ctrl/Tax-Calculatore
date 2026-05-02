// ⚠ דף בדיקה זמני — לא חלק מהמוצר. משמש לאימות העורך בלי לעבור התחברות.
// יוסר לאחר אימות. נטען רק כש-URL כולל ?test-sig=1.

import { useState } from 'react';
import { Client, SignatureRequest } from '../../types';
import SignatureRequestEditor from './SignatureRequestEditor';

const MOCK_CLIENT = {
  id: 'test-client',
  firstName: 'גיא',
  lastName: 'ישר',
  idNumber: '000000000',
  birthDate: '1985-01-01',
  gender: 'male',
  phone: '052-1234567',
  email: 'guy@example.com',
  address: 'הרצל 1',
  city: 'תל אביב',
  familyStatus: 'single',
  spouseName: '',
  spouseIdNumber: '',
  spouseWorking: false,
  spouseIncome: 0,
  children: [],
  isNewImmigrant: false,
  aliyahYear: 0,
  isReturningResident: false,
  returningYear: 0,
  disabilityPercentage: 0,
  disabilityType: '',
  hasAcademicDegree: false,
  academicDegreeYear: 0,
  academicDegreeType: '',
  completedIdf: false,
  idfReleaseYear: 0,
  completedNationalService: false,
  nationalServiceYear: 0,
  hasResidentialProperty: false,
  propertyAddress: '',
  numberOfProperties: 0,
  qualifyingSettlementId: '',
  qualifyingSettlementCreditPoints: 0,
  qualifyingSettlementOverride: false,
  incomeTaxType: 'employee',
  niType: 'employee',
  vatStatus: 'none',
  representationStatus: 'active',
  additionalContacts: [
    { id: 'c1', role: 'בן/בת זוג', name: 'דנה ישראלי', email: 'dana@example.com', phone: '050-9876543' },
    { id: 'c2', role: 'עו״ד', name: 'משה כהן', email: 'cohen@law.com' },
  ],
};

export default function TestSignaturePage() {
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState<SignatureRequest | null>(null);

  return (
    <div style={{ padding: '2rem', fontFamily: 'Heebo, sans-serif' }}>
      <h1>🧪 בדיקה: עורך מסמך לחתימה</h1>
      <p style={{ color: '#6b7280' }}>
        דף בדיקה זמני (ללא התחברות). הוסיפו <code>?test-sig=1</code> לכתובת.
      </p>

      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem' }}>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>פתח עורך</button>
      </div>

      {saved && (
        <div style={{ background: '#fff7ed', border: '1px solid #f59e0b', padding: '1rem', borderRadius: 8, marginBottom: '1rem' }}>
          <strong>נשמר:</strong>
          <pre style={{ direction: 'ltr', textAlign: 'left', fontSize: '.75rem', marginTop: '.5rem' }}>
            {JSON.stringify(saved, null, 2)}
          </pre>
        </div>
      )}

      {open && (
        <SignatureRequestEditor
          client={MOCK_CLIENT as unknown as Client}
          taskId="test-task-1"
          initial={saved ?? undefined}
          onSave={(req) => { setSaved(req); setOpen(false); }}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  );
}
