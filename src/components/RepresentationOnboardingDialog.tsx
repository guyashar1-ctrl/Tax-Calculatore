import { useState } from 'react';
import {
  AuthorityRepresentations,
  RepAuthorityKind,
  RepLevel,
  REP_AUTHORITY_ORDER,
  REP_AUTHORITY_LABELS,
  REP_AUTHORITIES_WITH_LEVEL,
  REP_LEVEL_LABELS,
} from '../types';

interface Props {
  onCreate: (data: { name: string; email: string; areas: AuthorityRepresentations }) => Promise<void> | void;
  onCancel: () => void;
}

interface AreaState {
  selected: boolean;
  level: RepLevel;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

const hasLevel = (a: RepAuthorityKind) => REP_AUTHORITIES_WITH_LEVEL.includes(a);

export default function RepresentationOnboardingDialog({ onCreate, onCancel }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [areas, setAreas] = useState<Record<RepAuthorityKind, AreaState>>({
    incomeTax: { selected: true, level: 'primary' },
    withholding: { selected: false, level: 'primary' },
    vat: { selected: true, level: 'primary' },
    nationalInsurance: { selected: true, level: 'primary' },
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedKeys = REP_AUTHORITY_ORDER.filter(a => areas[a].selected);

  function toggleArea(a: RepAuthorityKind) {
    setAreas(prev => ({ ...prev, [a]: { ...prev[a], selected: !prev[a].selected } }));
  }

  function setLevel(a: RepAuthorityKind, level: RepLevel) {
    setAreas(prev => ({ ...prev, [a]: { ...prev[a], level } }));
  }

  function validate(): string | null {
    if (!name.trim()) return 'יש להזין שם לקוח';
    if (!email.trim()) return 'יש להזין אימייל';
    if (!isValidEmail(email)) return 'כתובת אימייל לא תקינה';
    if (selectedKeys.length === 0) return 'יש לבחור לפחות רשות אחת לייצוג';
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    const built: AuthorityRepresentations = {};
    for (const a of selectedKeys) {
      built[a] = hasLevel(a)
        ? { status: 'in_process', level: areas[a].level }
        : { status: 'in_process' };
    }
    setBusy(true);
    setError(null);
    try {
      await onCreate({ name: name.trim(), email: email.trim(), areas: built });
    } catch (err) {
      console.error('Representation onboarding failed:', err);
      setError(extractErrorMessage(err));
      setBusy(false);
    }
  }

  function extractErrorMessage(e: unknown): string {
    if (typeof e === 'string') return e;
    if (e && typeof e === 'object') {
      const obj = e as { message?: string; details?: string; hint?: string };
      const parts = [obj.message, obj.details, obj.hint].filter(Boolean);
      if (parts.length > 0) return parts.join(' — ');
    }
    return 'שגיאה לא ידועה ביצירת בקשת הייצוג';
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form className="modal task-modal" onSubmit={handleSubmit}>
        <div className="modal-header">
          <h3>📨 בקשת ייצוג חדשה</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>✕</button>
        </div>

        <div className="modal-body">
          {/* פרטי הלקוח */}
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="required">שם הלקוח</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="שם פרטי ושם משפחה"
                autoFocus
                disabled={busy}
              />
            </div>
            <div className="form-group">
              <label className="required">אימייל</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
                dir="ltr"
                disabled={busy}
              />
            </div>
          </div>

          {/* רשויות לבקשת ייצוג */}
          <div style={{ marginTop: '1.25rem' }}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '.85rem', color: 'var(--gray-700)', marginBottom: '.5rem' }}>
              רשויות לבקשת ייצוג <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
              {REP_AUTHORITY_ORDER.map(a => {
                const st = areas[a];
                return (
                  <div
                    key={a}
                    onClick={() => !busy && toggleArea(a)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '.75rem',
                      padding: '.6rem .8rem',
                      border: `1px solid ${st.selected ? 'var(--blue)' : 'var(--gray-200)'}`,
                      background: st.selected ? 'var(--blue-light)' : 'white',
                      borderRadius: 'var(--radius)',
                      cursor: busy ? 'default' : 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={st.selected}
                      onChange={() => toggleArea(a)}
                      onClick={(e) => e.stopPropagation()}
                      disabled={busy}
                    />
                    <span style={{ flex: 1, fontSize: '.95rem', fontWeight: st.selected ? 600 : 400 }}>
                      {REP_AUTHORITY_LABELS[a]}
                    </span>
                    {hasLevel(a) ? (
                      <select
                        value={st.level}
                        onChange={(e) => setLevel(a, e.target.value as RepLevel)}
                        onClick={(e) => e.stopPropagation()}
                        disabled={busy || !st.selected}
                        style={{ width: 'auto', minWidth: 130 }}
                      >
                        <option value="primary">{REP_LEVEL_LABELS.primary}</option>
                        <option value="secondary">{REP_LEVEL_LABELS.secondary}</option>
                      </select>
                    ) : (
                      <span style={{ fontSize: '.78rem', color: 'var(--gray-500)' }}>ℹ ייצוג יחיד — ללא סוג</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* מה ייווצר */}
          <div style={{
            marginTop: '1.25rem',
            padding: '.75rem .9rem',
            background: 'var(--gray-50)',
            borderRadius: 'var(--radius)',
            fontSize: '.83rem',
            color: 'var(--gray-700)',
          }}>
            <div style={{ fontWeight: 600, marginBottom: '.4rem' }}>✨ מה ייווצר אוטומטית בשליחה</div>
            <div>✓ כרטיס לקוח חדש — מסומן "טרם מיוצג"</div>
            <div>✓ התקשרות ייצוג למעקב התהליך</div>
            <div>✓ משימה פנימית: "להשלים ייצוג{name.trim() ? ` — ${name.trim()}` : ''}"</div>
            <div>
              ✓ {selectedKeys.length > 0
                ? `${selectedKeys.length} סטטוסי ייצוג "בתהליך": ${selectedKeys.map(a => REP_AUTHORITY_LABELS[a]).join(', ')}`
                : 'בחר רשויות כדי ליצור סטטוסי ייצוג'}
            </div>
          </div>

          {error && (
            <div style={{
              marginTop: '1rem',
              padding: '.65rem .85rem',
              background: 'var(--red-light)',
              color: 'var(--red)',
              borderRadius: 'var(--radius)',
              fontSize: '.875rem',
            }}>
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            ביטול
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'יוצר…' : '📨 שליחה'}
          </button>
        </div>
      </form>
    </div>
  );
}
