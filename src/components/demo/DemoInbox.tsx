// ─── תיבת ההדגמה — מה ספק הדואר המדומה קיבל ────────────────────────────────
// ‼ staging בלבד. כל מייל שהמערכת «שלחה» כאן נקלט ב-test_captured_emails במקום
// לצאת לאדם. רואים בדיוק מה היה יוצא: לאן, באיזו כותרת, ואיך נראה המייל.
import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { supabase } from '../../lib/supabase';

interface Captured {
  id: string; created_at: string; mode: 'delivered' | 'replay' | 'rejected' | 'conflict';
  status: number; to_emails: string[]; subject: string | null; html: string | null; idem_key: string | null;
}

const MODE_TEXT: Record<Captured['mode'], string> = {
  delivered: 'היה נשלח',
  replay: 'ניסיון חוזר — זוהה, לא נשלח שוב',
  rejected: 'כשל מדומה מהספק',
  conflict: 'כפילות שנחסמה',
};

const when = (iso: string) => new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function DemoInbox({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Captured[] | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase.from('test_captured_emails')
      .select('id,created_at,mode,status,to_emails,subject,html,idem_key')
      .order('created_at', { ascending: false }).limit(60)
      .then(({ data, error: e }) => {
        if (!alive) return;
        if (e) { setError(true); return; }
        setRows((data ?? []) as Captured[]);
      });
    return () => { alive = false; };
  }, []);

  const shown = rows?.find(r => r.id === open) ?? null;

  return (
    <Modal title="תיבת ההדגמה" onClose={onClose} width={900}>
      <p className="demo-inbox-note">
        מה שספק הדואר היה מקבל. בסביבת ההדגמה ספק הדואר מדומה — שום מייל כאן לא יצא לאיש.
      </p>
      {error && <p className="demo-inbox-note is-err">לא הצלחתי לטעון את התיבה.</p>}
      {!rows && !error && <p className="demo-inbox-note">טוען…</p>}
      {rows && rows.length === 0 && <p className="demo-inbox-note">עוד לא «נשלח» כלום.</p>}
      {rows && rows.length > 0 && (
        <div className={`demo-inbox${shown ? ' has-open' : ''}`}>
          <ul className="demo-inbox-list">
            {rows.map(r => (
              <li key={r.id}>
                <button type="button" className={`demo-inbox-row${r.id === open ? ' is-on' : ''}`} onClick={() => setOpen(r.id)}>
                  <span className="demo-inbox-subj">{r.subject || '(בלי כותרת)'}</span>
                  <span className="demo-inbox-meta">
                    {when(r.created_at)} · <bdi>{r.to_emails.join(', ')}</bdi>
                  </span>
                  <span className={`demo-tag is-${r.mode}`}>{MODE_TEXT[r.mode]}</span>
                </button>
              </li>
            ))}
          </ul>
          {shown && (
            <div className="demo-inbox-view">
              <button type="button" className="demo-btn demo-inbox-back" onClick={() => setOpen(null)}>→ לרשימה</button>
              <div className="demo-inbox-head">
                <b>{shown.subject}</b>
                <span>אל: <bdi>{shown.to_emails.join(', ')}</bdi> · {when(shown.created_at)}</span>
              </div>
              {shown.html
                ? <iframe title={shown.subject ?? 'מייל'} className="demo-inbox-frame" sandbox="" srcDoc={shown.html} />
                : <p className="demo-inbox-note">אין תוכן לתצוגה.</p>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
