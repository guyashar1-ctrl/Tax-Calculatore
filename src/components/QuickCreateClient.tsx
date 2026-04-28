import { useState } from 'react';

export interface QuickClientBasics {
  firstName: string;
  lastName: string;
  idNumber: string;
  phone: string;
  email: string;
}

interface Props {
  onSave: (basics: QuickClientBasics) => Promise<void> | void;
  onCancel: () => void;
}

function isValidIdNumber(id: string): boolean {
  return /^\d{9}$/.test(id.trim());
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function QuickCreateClient({ onSave, onCancel }: Props) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (!firstName.trim()) return 'יש להזין שם פרטי';
    if (!lastName.trim()) return 'יש להזין שם משפחה';
    if (!idNumber.trim()) return 'יש להזין תעודת זהות';
    if (!isValidIdNumber(idNumber)) return 'תעודת זהות חייבת להכיל 9 ספרות';
    if (!phone.trim()) return 'יש להזין טלפון';
    if (!email.trim()) return 'יש להזין כתובת אימייל';
    if (!isValidEmail(email)) return 'כתובת אימייל לא תקינה';
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        idNumber: idNumber.trim(),
        phone: phone.trim(),
        email: email.trim(),
      });
    } catch (e) {
      const msg = extractErrorMessage(e);
      console.error('QuickCreateClient save failed:', e);
      setError(msg);
      setBusy(false);
    }
  }

  function extractErrorMessage(e: unknown): string {
    if (typeof e === 'string') return e;
    if (e && typeof e === 'object') {
      const obj = e as { message?: string; details?: string; hint?: string; code?: string };
      const parts = [obj.message, obj.details, obj.hint].filter(Boolean);
      if (parts.length > 0) return parts.join(' — ');
    }
    return 'שגיאה לא ידועה בשמירת הלקוח';
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form className="modal task-modal" onSubmit={handleSubmit}>
        <div className="modal-header">
          <h3>+ לקוח חדש</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>✕</button>
        </div>

        <div className="modal-body">
          <p style={{ color: 'var(--gray-600)', fontSize: '.9rem', marginBottom: '1rem' }}>
            מלא את הפרטים הבסיסיים. אחרי השמירה תוכל להיכנס לכרטיס ולהשלים את שאר השדות.
          </p>

          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="required">שם פרטי</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoFocus
                disabled={busy}
              />
            </div>

            <div className="form-group">
              <label className="required">שם משפחה</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={busy}
              />
            </div>

            <div className="form-group">
              <label className="required">תעודת זהות</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={9}
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="9 ספרות"
                disabled={busy}
              />
            </div>

            <div className="form-group">
              <label className="required">טלפון</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="050-1234567"
                disabled={busy}
              />
            </div>

            <div className="form-group span-full">
              <label className="required">אימייל</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                disabled={busy}
              />
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
            {busy ? 'שומר…' : 'שמור והמשך לכרטיס'}
          </button>
        </div>
      </form>
    </div>
  );
}
