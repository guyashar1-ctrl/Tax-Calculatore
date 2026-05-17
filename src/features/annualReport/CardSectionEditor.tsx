// ─── עורך inline של סקציה בכרטיס לקוח — מופעל מ-ValidationCard ──────────────
//
// מקבל את הסקציה (editTarget), נותן UI מינימלי לעריכת רשימה (שם/הוסף/הסר),
// ומפעיל onPatchClient בשמירה. לא תומך בכל שדות הכרטיס — רק במה שצריך
// לאשר את התשובה לשאלון. עריכה מפורטת (פרטי 106 וכו') נעשית בסקציה
// המלאה בכרטיס.

import { useState } from 'react';
import type { Client, EmployerInfo, InvestmentAccount, BankAccountInfo } from '../../types';
import type { CardEditSection } from './types';

interface Props {
  client: Client;
  editTarget: CardEditSection;
  onPatchClient: (partial: Partial<Client>) => Promise<void>;
  onClose: () => void;
}

export default function CardSectionEditor({ client, editTarget, onPatchClient, onClose }: Props) {
  if (editTarget === 'identity') return <IdentityEditor client={client} onPatch={onPatchClient} onClose={onClose} />;
  if (editTarget === 'employers') return <EmployersEditor client={client} onPatch={onPatchClient} onClose={onClose} />;
  if (editTarget === 'investmentAccounts') return <InvestmentAccountsEditor client={client} onPatch={onPatchClient} onClose={onClose} />;
  if (editTarget === 'bankAccounts') return <BankAccountsEditor client={client} onPatch={onPatchClient} onClose={onClose} />;
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
          background: 'white', borderRadius: 8, padding: '1.5rem',
          maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{title}</h3>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.5rem' }}>✕</button>
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
  const [address, setAddress] = useState(client.address);
  const [city, setCity] = useState(client.city);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onPatch({ firstName, lastName, idNumber, address, city });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <EditorShell title="✏ עריכת פרטי זיהוי" onClose={onClose} onSave={handleSave} saving={saving}>
      <div className="form-grid form-grid-2">
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
          <label>עיר</label>
          <input type="text" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="form-group span-full">
          <label>כתובת</label>
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
      </div>
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
    <EditorShell title="✏ עריכת רשימת מעבידים" onClose={onClose} onSave={handleSave} saving={saving}>
      <p style={{ fontSize: '.85rem', color: 'var(--gray-600)', margin: '0 0 .75rem' }}>
        רק שם המעביד נדרש כאן. סכומי 106 (ברוטו, ניכוי, פנסיה) נערכים בסקציה המלאה בכרטיס.
      </p>
      {list.length === 0 && <p style={{ color: 'var(--gray-500)', fontSize: '.9rem' }}>אין מעבידים. לחץ "+ הוסף" כדי להוסיף.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
        {list.map((e) => (
          <div key={e.id} style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <input
              type="text"
              value={e.name}
              onChange={(ev) => updateRow(e.id, 'name', ev.target.value)}
              placeholder="שם המעביד"
              style={{ flex: 1, padding: '.5rem .75rem', border: '1px solid var(--gray-200)', borderRadius: 6 }}
            />
            <input
              type="text"
              value={e.taxId ?? ''}
              onChange={(ev) => updateRow(e.id, 'taxId', ev.target.value)}
              placeholder="ע.מ (אופציונלי)"
              dir="ltr"
              style={{ width: 120, padding: '.5rem .75rem', border: '1px solid var(--gray-200)', borderRadius: 6 }}
            />
            <button type="button" onClick={() => removeRow(e.id)} className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }}>🗑</button>
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
    <EditorShell title="✏ עריכת חשבונות השקעה" onClose={onClose} onSave={handleSave} saving={saving}>
      <p style={{ fontSize: '.85rem', color: 'var(--gray-600)', margin: '0 0 .75rem' }}>
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
              style={{ flex: 1, padding: '.5rem .75rem', border: '1px solid var(--gray-200)', borderRadius: 6 }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '.85rem' }}>
              <input type="checkbox" checked={a.isClosed ?? false} onChange={() => toggleClosed(a.id)} />
              נסגר
            </label>
            <button type="button" onClick={() => removeRow(a.id)} className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }}>🗑</button>
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
    <EditorShell title="✏ עריכת חשבונות בנק" onClose={onClose} onSave={handleSave} saving={saving}>
      <p style={{ fontSize: '.85rem', color: 'var(--gray-600)', margin: '0 0 .75rem' }}>
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
              style={{ flex: 1, padding: '.5rem .75rem', border: '1px solid var(--gray-200)', borderRadius: 6 }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '.85rem' }}>
              <input type="radio" name="primaryBank" checked={b.isPrimary ?? false} onChange={() => togglePrimary(b.id)} />
              🔑 ראשי
            </label>
            <button type="button" onClick={() => removeRow(b.id)} className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }}>🗑</button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={addRow} style={{ marginTop: '.75rem' }}>+ הוסף חשבון</button>
    </EditorShell>
  );
}
