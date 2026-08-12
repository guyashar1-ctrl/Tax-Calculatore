// ─── "חיוב נוסף" — הוספת פריט כספי חד-פעמי מעבר לריטיינר ────────────────────
// המקור החזותי המחייב: docs/prototypes/customers-v3-production-reference.html
//
// ‼ החיוב נכתב רק בלחיצה על "הוסף חיוב" — לא תוך כדי הקלדה. ביטול לפני זה
// אינו יוצר כלום, בדיוק כמו "אדם חדש" (NewPersonDialog).

import { useState } from 'react';
import Modal from './ui/Modal';

interface Props {
  clientName: string;
  onCancel: () => void;
  onSubmit: (description: string, amount: number) => Promise<void>;
}

export default function AddChargeDialog({ clientName, onCancel, onSubmit }: Props) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    const trimmed = description.trim();
    const num = Number(amount);
    if (!trimmed) { setError('צריך להזין עבור מה החיוב'); return; }
    if (!amount.trim() || !Number.isFinite(num) || num <= 0) { setError('צריך להזין סכום תקין וגדול מאפס'); return; }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed, num);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : 'שגיאה בהוספת החיוב');
    }
  }

  const footer = (
    <>
      <button type="button" className="ui-btn ui-btn-ghost" onClick={onCancel} disabled={busy}>ביטול</button>
      <div style={{ flex: 1 }} />
      <button type="button" className="ui-btn ui-btn-primary" onClick={handleSubmit} disabled={busy}>
        {busy ? 'מוסיף…' : 'הוסף חיוב'}
      </button>
    </>
  );

  return (
    <Modal title="חיוב נוסף" onClose={onCancel} footer={footer} width={500}>
      <p style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: 0, marginBottom: 16 }}>
        הוסף סכום חד־פעמי מעבר לריטיינר — עבור {clientName}
      </p>
      <div className="np-form">
        <div className="np-field np-field-full">
          <label>עבור מה החיוב?</label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="לדוגמה: הצהרת הון / אישור מיוחד / תוספת לדוח"
            autoFocus
            disabled={busy}
          />
        </div>
        <div className="np-field">
          <label>סכום</label>
          <input
            value={amount}
            onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            inputMode="decimal"
            placeholder="0"
            disabled={busy}
          />
        </div>
        <div className="np-field">
          <label>מצב</label>
          <input value="ממתין לתשלום" readOnly disabled />
        </div>
      </div>
      <div className="pd-small" style={{ marginTop: 12 }}>
        החיוב נשמר כפריט כספי פשוט. אם אחר כך צריך הצעה, חתימה או חומרים — אפשר להתחיל תהליך מתוך התיק המלא.
      </div>
      {error && <div className="np-error">{error}</div>}
    </Modal>
  );
}
