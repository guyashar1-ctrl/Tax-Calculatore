// ─── עורך inline של סקציה בכרטיס לקוח — מופעל מ-ValidationCard ──────────────
//
// מקבל את הסקציה (editTarget), נותן UI מינימלי לעריכת רשימה (שם/הוסף/הסר),
// ומפעיל onPatchClient בשמירה. לא תומך בכל שדות הכרטיס — רק במה שצריך
// לאשר את התשובה לשאלון. עריכה מפורטת (פרטי 106 וכו') נעשית בסקציה
// המלאה בכרטיס.

import { useState } from 'react';
import type { Client, Child, EmployerInfo, InvestmentAccount, BankAccountInfo, PensionFundInfo } from '../../types';
import type { CardEditSection } from './types';

interface Props {
  client: Client;
  editTarget: CardEditSection;
  onPatchClient: (partial: Partial<Client>) => Promise<void>;
  onClose: () => void;
}

export default function CardSectionEditor({ client, editTarget, onPatchClient, onClose }: Props) {
  if (editTarget === 'identity') return <IdentityEditor client={client} onPatch={onPatchClient} onClose={onClose} />;
  if (editTarget === 'children') return <ChildrenEditor client={client} onPatch={onPatchClient} onClose={onClose} />;
  if (editTarget === 'employers') return <EmployersEditor client={client} onPatch={onPatchClient} onClose={onClose} />;
  if (editTarget === 'investmentAccounts') return <InvestmentAccountsEditor client={client} onPatch={onPatchClient} onClose={onClose} />;
  if (editTarget === 'bankAccounts') return <BankAccountsEditor client={client} onPatch={onPatchClient} onClose={onClose} />;
  if (editTarget === 'pensionFunds') return <PensionFundsEditor client={client} onPatch={onPatchClient} onClose={onClose} />;
  return (
    <EditorShell title="לא נתמך עדיין" onClose={onClose}>
      <p style={{ color: 'var(--gray-600)' }}>
        עריכה inline של סקציה זו עדיין לא נתמכת. נא לפתוח את הסקציה ישירות בכרטיס הלקוח.
      </p>
    </EditorShell>
  );
}

// ─── עטיפת modal משותפת ────────────────────────────────────────────────────

function EditorShell({
  title, children, onClose, onSave, saving,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSave?: () => void;
  saving?: boolean;
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface-0)', borderRadius: 'var(--r-modal)', padding: '1.5rem',
          maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '17px' }}>{title}</h3>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '24px' }}>✕</button>
        </div>
        <div style={{ marginBottom: onSave ? '1.25rem' : 0 }}>{children}</div>
        {onSave && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', borderTop: '1px solid var(--gray-200)', paddingTop: '1rem' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>ביטול</button>
            <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
              {saving ? 'שומר…' : 'שמור ✓'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── עורך פרטי זיהוי ───────────────────────────────────────────────────────

function IdentityEditor({ client, onPatch, onClose }: { client: Client; onPatch: (p: Partial<Client>) => Promise<void>; onClose: () => void }) {
  const [firstName, setFirstName] = useState(client.firstName);
  const [lastName, setLastName] = useState(client.lastName);
  const [idNumber, setIdNumber] = useState(client.idNumber);
  const [birthDate, setBirthDate] = useState(client.birthDate || '');
  const [address, setAddress] = useState(client.address);
  const [city, setCity] = useState(client.city);
  const [familyStatus, setFamilyStatus] = useState<Client['familyStatus']>(client.familyStatus);
  const [isNewImmigrant, setIsNewImmigrant] = useState(client.isNewImmigrant);
  const [aliyahYear, setAliyahYear] = useState(client.aliyahYear || 0);
  const [isReturningResident, setIsReturningResident] = useState(client.isReturningResident);
  const [disabilityPercentage, setDisabilityPercentage] = useState(client.disabilityPercentage || 0);
  const [hasAcademicDegree, setHasAcademicDegree] = useState(client.hasAcademicDegree);
  const [academicDegreeYear, setAcademicDegreeYear] = useState(client.academicDegreeYear || 0);
  const [donationsAnnual, setDonationsAnnual] = useState(client.donationsAnnual ?? 0);
  const [lifeInsuranceAnnual, setLifeInsuranceAnnual] = useState(client.lifeInsuranceAnnual ?? 0);
  const [isFamilyCompanyMember, setIsFamilyCompanyMember] = useState(client.isFamilyCompanyMember ?? false);
  const [isForeignControllingShareholder, setIsForeignControllingShareholder] = useState(client.isForeignControllingShareholder ?? false);
  const [isKibbutzMember, setIsKibbutzMember] = useState(client.isKibbutzMember ?? false);
  const [isSubstantialShareholder, setIsSubstantialShareholder] = useState(client.isSubstantialShareholder ?? false);
  const [spouseName, setSpouseName] = useState(client.spouseName || '');
  const [spouseIdNumber, setSpouseIdNumber] = useState(client.spouseIdNumber || '');
  const [spouseWorking, setSpouseWorking] = useState(client.spouseWorking ?? false);
  const [completedIdf, setCompletedIdf] = useState(client.completedIdf ?? false);
  const [idfReleaseYear, setIdfReleaseYear] = useState(client.idfReleaseYear || 0);
  const [completedNationalService, setCompletedNationalService] = useState(client.completedNationalService ?? false);
  const [nationalServiceYear, setNationalServiceYear] = useState(client.nationalServiceYear || 0);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onPatch({
        firstName, lastName, idNumber, birthDate, address, city,
        familyStatus,
        spouseName, spouseIdNumber, spouseWorking,
        isNewImmigrant, aliyahYear, isReturningResident,
        disabilityPercentage,
        hasAcademicDegree, academicDegreeYear,
        completedIdf, idfReleaseYear, completedNationalService, nationalServiceYear,
        donationsAnnual, lifeInsuranceAnnual,
        isFamilyCompanyMember, isForeignControllingShareholder, isKibbutzMember,
        isSubstantialShareholder,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const sub = (t: string) => (
    <div style={{ gridColumn: '1 / -1', fontWeight: 600, fontSize: '13px', color: 'var(--gray-500)', borderBottom: '1px solid var(--gray-100)', paddingBottom: 4, marginTop: 8 }}>{t}</div>
  );

  return (
    <EditorShell title="עריכת פרטי הלקוח" onClose={onClose} onSave={handleSave} saving={saving}>
      <div className="form-grid form-grid-2">
        {sub('פרטי זיהוי')}
        <div className="form-group">
          <label>שם פרטי</label>
          <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div className="form-group">
          <label>שם משפחה</label>
          <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
        <div className="form-group">
          <label>ת.ז.</label>
          <input type="text" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} dir="ltr" maxLength={9} />
        </div>
        <div className="form-group">
          <label>תאריך לידה</label>
          <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} dir="ltr" />
        </div>
        <div className="form-group">
          <label>עיר</label>
          <input type="text" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="form-group">
          <label>כתובת</label>
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>

        {sub('משפחה ותושבות')}
        <div className="form-group">
          <label>מצב משפחתי</label>
          <select value={familyStatus} onChange={(e) => setFamilyStatus(e.target.value as Client['familyStatus'])}>
            <option value="single">רווק/ה</option>
            <option value="married">נשוי/אה</option>
            <option value="divorced">גרוש/ה</option>
            <option value="widowed">אלמן/ה</option>
            <option value="singleParent">הורה יחיד</option>
          </select>
        </div>
        <div className="form-group">
          <label>אחוז נכות מוכר</label>
          <input type="number" value={disabilityPercentage || ''} onChange={(e) => setDisabilityPercentage(Number(e.target.value) || 0)} min={0} max={100} />
        </div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={isNewImmigrant} onChange={(e) => setIsNewImmigrant(e.target.checked)} />
            עולה חדש/ה
          </label>
          {isNewImmigrant && (
            <input type="number" value={aliyahYear || ''} onChange={(e) => setAliyahYear(Number(e.target.value) || 0)} placeholder="שנת עלייה" />
          )}
        </div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={isReturningResident} onChange={(e) => setIsReturningResident(e.target.checked)} />
            תושב/ת חוזר/ת
          </label>
        </div>

        {familyStatus === 'married' && (
          <>
            {sub('בן/בת הזוג')}
            <div className="form-group">
              <label>שם בן/בת הזוג</label>
              <input type="text" value={spouseName} onChange={(e) => setSpouseName(e.target.value)} />
            </div>
            <div className="form-group">
              <label>ת.ז. בן/בת הזוג</label>
              <input type="text" value={spouseIdNumber} onChange={(e) => setSpouseIdNumber(e.target.value)} dir="ltr" maxLength={9} />
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={spouseWorking} onChange={(e) => setSpouseWorking(e.target.checked)} />
                בן/בת הזוג עובד/ת
              </label>
            </div>
          </>
        )}

        {sub('שירות')}
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={completedIdf} onChange={(e) => setCompletedIdf(e.target.checked)} />
            חייל/ת משוחרר/ת
          </label>
          {completedIdf && (
            <input type="number" value={idfReleaseYear || ''} onChange={(e) => setIdfReleaseYear(Number(e.target.value) || 0)} placeholder="שנת שחרור" />
          )}
        </div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={completedNationalService} onChange={(e) => setCompletedNationalService(e.target.checked)} />
            שירות לאומי
          </label>
          {completedNationalService && (
            <input type="number" value={nationalServiceYear || ''} onChange={(e) => setNationalServiceYear(Number(e.target.value) || 0)} placeholder="שנת סיום" />
          )}
        </div>

        {sub('השכלה וסכומים שנתיים')}
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={hasAcademicDegree} onChange={(e) => setHasAcademicDegree(e.target.checked)} />
            תואר אקדמי
          </label>
          {hasAcademicDegree && (
            <input type="number" value={academicDegreeYear || ''} onChange={(e) => setAcademicDegreeYear(Number(e.target.value) || 0)} placeholder="שנת קבלה" />
          )}
        </div>
        <div className="form-group">
          <label>תרומות שנתיות (₪)</label>
          <input type="number" value={donationsAnnual || ''} onChange={(e) => setDonationsAnnual(Number(e.target.value) || 0)} />
        </div>
        <div className="form-group">
          <label>ביטוח חיים שנתי (₪)</label>
          <input type="number" value={lifeInsuranceAnnual || ''} onChange={(e) => setLifeInsuranceAnnual(Number(e.target.value) || 0)} />
        </div>

        {sub('מצבים מיוחדים')}
        <div className="form-group span-full" style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={isFamilyCompanyMember} onChange={(e) => setIsFamilyCompanyMember(e.target.checked)} />
            חברה משפחתית
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={isForeignControllingShareholder} onChange={(e) => setIsForeignControllingShareholder(e.target.checked)} />
            בעל שליטה בחברה זרה
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={isKibbutzMember} onChange={(e) => setIsKibbutzMember(e.target.checked)} />
            חבר/ת קיבוץ
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={isSubstantialShareholder} onChange={(e) => setIsSubstantialShareholder(e.target.checked)} />
            בעל/ת מניות מהותי/ת (10%+)
          </label>
        </div>
      </div>
    </EditorShell>
  );
}

// ─── עורך ילדים ────────────────────────────────────────────────────────────

function ChildrenEditor({ client, onPatch, onClose }: { client: Client; onPatch: (p: Partial<Client>) => Promise<void>; onClose: () => void }) {
  const [list, setList] = useState<Child[]>(client.children ?? []);
  const [saving, setSaving] = useState(false);

  function addRow() {
    setList([...list, {
      id: `child-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      firstName: '', birthDate: '', birthYear: 0, hasDisability: false,
    }]);
  }
  function updateRow(id: string, patch: Partial<Child>) {
    setList(list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function removeRow(id: string) {
    setList(list.filter((c) => c.id !== id));
  }
  async function handleSave() {
    setSaving(true);
    try {
      const cleaned = list.map((c) => ({
        ...c,
        birthYear: c.birthDate ? Number(c.birthDate.slice(0, 4)) : c.birthYear,
      }));
      await onPatch({ children: cleaned });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <EditorShell title="עריכת רשימת ילדים" onClose={onClose} onSave={handleSave} saving={saving}>
      <p style={{ fontSize: '14px', color: 'var(--gray-600)', margin: '0 0 .75rem' }}>
        תאריך הלידה קובע את נקודות הזיכוי. סמנו נכות אם קיימת (זיכוי לפי סעיף 45).
      </p>
      {list.length === 0 && <p style={{ color: 'var(--gray-500)', fontSize: '14px' }}>אין ילדים ברשימה. לחץ "+ הוסף" כדי להוסיף.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
        {list.map((c) => (
          <div key={c.id} style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={c.firstName ?? ''}
              onChange={(ev) => updateRow(c.id, { firstName: ev.target.value })}
              placeholder="שם"
              className="cse-field" style={{ flex: 1, minWidth: 110 }}
            />
            <input
              type="date"
              value={c.birthDate ?? ''}
              onChange={(ev) => updateRow(c.id, { birthDate: ev.target.value })}
              dir="ltr"
              className="cse-field"
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '14px' }}>
              <input type="checkbox" checked={c.hasDisability} onChange={(ev) => updateRow(c.id, { hasDisability: ev.target.checked })} />
              נכות
            </label>
            <button type="button" onClick={() => removeRow(c.id)} className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}>🗑</button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={addRow} style={{ marginTop: '.75rem' }}>+ הוסף ילד/ה</button>
    </EditorShell>
  );
}

// ─── עורך קופות פנסיה ──────────────────────────────────────────────────────

function PensionFundsEditor({ client, onPatch, onClose }: { client: Client; onPatch: (p: Partial<Client>) => Promise<void>; onClose: () => void }) {
  const [list, setList] = useState<PensionFundInfo[]>(client.pensionFunds ?? []);
  const [saving, setSaving] = useState(false);

  function addRow() {
    setList([...list, {
      id: `pf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      institutionName: '', kind: 'new_pension', hasSelfDeposits: true,
    }]);
  }
  function updateRow(id: string, patch: Partial<PensionFundInfo>) {
    setList(list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function removeRow(id: string) {
    setList(list.filter((p) => p.id !== id));
  }
  async function handleSave() {
    setSaving(true);
    try {
      await onPatch({ pensionFunds: list, hasPension: list.length > 0 });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <EditorShell title="עריכת קופות פנסיה" onClose={onClose} onSave={handleSave} saving={saving}>
      <p style={{ fontSize: '14px', color: 'var(--gray-600)', margin: '0 0 .75rem' }}>
        קופה עם "הפקדה עצמאית" מייצרת דרישת אישור הפקדות שנתי.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
        {list.map((p) => (
          <div key={p.id} style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={p.institutionName}
              onChange={(ev) => updateRow(p.id, { institutionName: ev.target.value })}
              placeholder="מנורה, הראל, אלטשולר..."
              className="cse-field" style={{ flex: 1, minWidth: 130 }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '14px' }}>
              <input type="checkbox" checked={p.hasSelfDeposits ?? false} onChange={(ev) => updateRow(p.id, { hasSelfDeposits: ev.target.checked })} />
              הפקדה עצמאית
            </label>
            <button type="button" onClick={() => removeRow(p.id)} className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}>🗑</button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={addRow} style={{ marginTop: '.75rem' }}>+ הוסף קופה</button>
    </EditorShell>
  );
}

// ─── עורך מעבידים ──────────────────────────────────────────────────────────

function EmployersEditor({ client, onPatch, onClose }: { client: Client; onPatch: (p: Partial<Client>) => Promise<void>; onClose: () => void }) {
  const [list, setList] = useState<EmployerInfo[]>(client.employers ?? []);
  const [saving, setSaving] = useState(false);

  function addRow() {
    setList([...list, { id: `emp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: '' }]);
  }
  function updateRow(id: string, field: keyof EmployerInfo, value: string) {
    setList(list.map((e) => (e.id === id ? { ...e, [field]: value || undefined } : e)));
  }
  function removeRow(id: string) {
    setList(list.filter((e) => e.id !== id));
  }
  async function handleSave() {
    setSaving(true);
    try {
      await onPatch({ employers: list });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <EditorShell title="עריכת רשימת מעבידים" onClose={onClose} onSave={handleSave} saving={saving}>
      <p style={{ fontSize: '14px', color: 'var(--gray-600)', margin: '0 0 .75rem' }}>
        רק שם המעביד נדרש כאן. סכומי 106 (ברוטו, ניכוי, פנסיה) נערכים בסקציה המלאה בכרטיס.
      </p>
      {list.length === 0 && <p style={{ color: 'var(--gray-500)', fontSize: '14px' }}>אין מעבידים. לחץ "+ הוסף" כדי להוסיף.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
        {list.map((e) => (
          <div key={e.id} style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <input
              type="text"
              value={e.name}
              onChange={(ev) => updateRow(e.id, 'name', ev.target.value)}
              placeholder="שם המעביד"
              className="cse-field" style={{ flex: 1 }}
            />
            <input
              type="text"
              value={e.taxId ?? ''}
              onChange={(ev) => updateRow(e.id, 'taxId', ev.target.value)}
              placeholder="ע.מ (אופציונלי)"
              dir="ltr"
              className="cse-field" style={{ width: 120 }}
            />
            <button type="button" onClick={() => removeRow(e.id)} className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}>🗑</button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={addRow} style={{ marginTop: '.75rem' }}>+ הוסף מעביד</button>
    </EditorShell>
  );
}

// ─── עורך חשבונות השקעה ────────────────────────────────────────────────────

function InvestmentAccountsEditor({ client, onPatch, onClose }: { client: Client; onPatch: (p: Partial<Client>) => Promise<void>; onClose: () => void }) {
  const [list, setList] = useState<InvestmentAccount[]>(client.investmentAccounts ?? []);
  const [saving, setSaving] = useState(false);

  function addRow() {
    setList([...list, { id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, institutionName: '' }]);
  }
  function updateRow(id: string, field: 'institutionName', value: string) {
    setList(list.map((a) => (a.id === id ? { ...a, [field]: value } : a)));
  }
  function toggleClosed(id: string) {
    setList(list.map((a) => (a.id === id ? { ...a, isClosed: !a.isClosed } : a)));
  }
  function removeRow(id: string) {
    setList(list.filter((a) => a.id !== id));
  }
  async function handleSave() {
    setSaving(true);
    try {
      await onPatch({ investmentAccounts: list, hasInvestments: list.length > 0 });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <EditorShell title="עריכת חשבונות השקעה" onClose={onClose} onSave={handleSave} saving={saving}>
      <p style={{ fontSize: '14px', color: 'var(--gray-600)', margin: '0 0 .75rem' }}>
        כל חשבון = 867 נפרד בצ'ק-ליסט. סכומי ריבית/דיבידנד/רווחי הון נערכים בסקציה המלאה בכרטיס.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
        {list.map((a) => (
          <div key={a.id} style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <input
              type="text"
              value={a.institutionName}
              onChange={(ev) => updateRow(a.id, 'institutionName', ev.target.value)}
              placeholder="מיטב דש, IBI, אקסלנס..."
              className="cse-field" style={{ flex: 1 }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '14px' }}>
              <input type="checkbox" checked={a.isClosed ?? false} onChange={() => toggleClosed(a.id)} />
              נסגר
            </label>
            <button type="button" onClick={() => removeRow(a.id)} className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}>🗑</button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={addRow} style={{ marginTop: '.75rem' }}>+ הוסף חשבון</button>
    </EditorShell>
  );
}

// ─── עורך חשבונות בנק ──────────────────────────────────────────────────────

function BankAccountsEditor({ client, onPatch, onClose }: { client: Client; onPatch: (p: Partial<Client>) => Promise<void>; onClose: () => void }) {
  const [list, setList] = useState<BankAccountInfo[]>(client.bankAccounts ?? []);
  const [saving, setSaving] = useState(false);

  function addRow() {
    const isFirst = list.length === 0;
    setList([...list, { id: `bank-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, bankName: '', isPrimary: isFirst }]);
  }
  function updateRow(id: string, field: 'bankName', value: string) {
    setList(list.map((b) => (b.id === id ? { ...b, [field]: value } : b)));
  }
  function togglePrimary(id: string) {
    setList(list.map((b) => ({ ...b, isPrimary: b.id === id })));
  }
  function removeRow(id: string) {
    setList(list.filter((b) => b.id !== id));
  }
  async function handleSave() {
    setSaving(true);
    try {
      await onPatch({ bankAccounts: list });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <EditorShell title="עריכת חשבונות בנק" onClose={onClose} onSave={handleSave} saving={saving}>
      <p style={{ fontSize: '14px', color: 'var(--gray-600)', margin: '0 0 .75rem' }}>
        סמן חשבון אחד כראשי (לקבלת החזרי מס).
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
        {list.map((b) => (
          <div key={b.id} style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <input
              type="text"
              value={b.bankName}
              onChange={(ev) => updateRow(b.id, 'bankName', ev.target.value)}
              placeholder="בנק הפועלים, מזרחי..."
              className="cse-field" style={{ flex: 1 }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '14px' }}>
              <input type="radio" name="primaryBank" checked={b.isPrimary ?? false} onChange={() => togglePrimary(b.id)} />
              ראשי
            </label>
            <button type="button" onClick={() => removeRow(b.id)} className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}>🗑</button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={addRow} style={{ marginTop: '.75rem' }}>+ הוסף חשבון</button>
    </EditorShell>
  );
}
