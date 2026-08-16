// ─── בוחר תווית מקצועית, עם יצירה במקום ─────────────────────────────────────
// התוויות מנוהלות ברמת המשרד (document_labels שייכת למשתמש, לא ללקוח), ולכן
// תווית שנוצרת כאן — אצל כל לקוח — מופיעה מיד בכל שאר הלקוחות והמסכים.
//
// ‼ בלי היצירה-במקום הזו המסך היה מבוי סתום: אחרי המיגרציה קיימת רק התווית
// השמורה 'לבדיקה', והיא מסוננת החוצה במודלי הבקשה — כלומר היה שדה חובה בלי
// אף ערך חוקי לבחור בו.

import { useState } from 'react';
import { useDocumentStore, type DocumentLabel } from '../../hooks/useDocumentStore';

const NEW = '__new_label__';

interface Props {
  value: string;
  labels: DocumentLabel[];
  onChange: (labelId: string) => void;
  /** נקראת עם התווית שנוצרה, כדי שההורה יוסיף אותה לרשימה שלו. */
  onCreated: (label: DocumentLabel) => void;
  /** האם להציג את התווית השמורה ('לבדיקה') כאפשרות. */
  includeReserved?: boolean;
  className?: string;
  placeholder?: string;
}

export default function LabelSelect({
  value, labels, onChange, onCreated,
  includeReserved = true, className = 'inp', placeholder = 'בחר תווית…',
}: Props) {
  const db = useDocumentStore();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const options = includeReserved ? labels : labels.filter(l => !l.isReserved);
  const regular = options.filter(l => !l.isReserved);
  const reserved = options.filter(l => l.isReserved);

  function cancel() {
    setCreating(false);
    setName('');
    setError('');
  }

  async function create() {
    const clean = name.trim();
    if (!clean) return;
    const existing = labels.find(l => l.name === clean);
    if (existing) { onChange(existing.id); cancel(); return; }
    setBusy(true);
    setError('');
    try {
      const label = await db.createLabel(clean);
      onCreated(label);
      onChange(label.id);
      cancel();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(/duplicate|unique/i.test(msg) ? 'כבר קיימת תווית בשם הזה.' : 'יצירת התווית נכשלה.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <select
        className={className}
        value={creating ? NEW : value}
        onChange={e => {
          if (e.target.value === NEW) { setCreating(true); setError(''); return; }
          setCreating(false);
          onChange(e.target.value);
        }}
      >
        {!value && <option value="">{placeholder}</option>}
        {regular.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        {reserved.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        <option value={NEW}>+ תווית חדשה…</option>
      </select>

      {creating && (
        <div style={{ display: 'flex', gap: '.4rem', marginTop: '.4rem', width: '100%' }}>
          <input
            className="inp" style={{ flex: 1, marginTop: 0 }} autoFocus
            placeholder="שם התווית" value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); void create(); }
              if (e.key === 'Escape') cancel();
            }}
          />
          <button type="button" className="btn btn-sm btn-primary" disabled={busy || !name.trim()} onClick={create}>
            {busy ? 'יוצר…' : 'צור'}
          </button>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={cancel}>ביטול</button>
        </div>
      )}
      {creating && !error && (
        <div className="csub" style={{ marginTop: '.3rem', width: '100%' }}>
          התווית תתווסף לרשימת התוויות של המשרד — אצל כל הלקוחות.
        </div>
      )}
      {error && (
        <div style={{ color: 'var(--err)', fontSize: 'var(--fs-12)', marginTop: '.3rem', width: '100%' }}>{error}</div>
      )}
    </>
  );
}
