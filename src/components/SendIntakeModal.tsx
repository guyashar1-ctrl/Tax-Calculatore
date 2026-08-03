// ─── שליחת שאלון יזומה מכרטיס הלקוח ─────────────────────────────────────────
// הרו"ח בוחר כתובת מייל (ברירת מחדל: מהכרטיס) והמערכת שולחת קישור שאלון ישיר
// (?intake=TOKEN) — בלי הליך ייצוג. הטוקן נוצר בצד השרת בשליחה הראשונה.

import { useState } from 'react';
import type { Client } from '../types';
import EmailPreviewDialog from './EmailActivity/EmailPreviewDialog';

interface Props {
  client: Client;
  onClose: () => void;
  onSent: (email: string) => void;
}

export default function SendIntakeModal({ client, onClose, onSent }: Props) {
  const [email, setEmail] = useState(client.email || '');
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  // ‼ הכפתור פותח תצוגה מקדימה ולא שולח: המייל יוצא רק מתוך החלון, אחרי
  // שהרו"ח ראה בדיוק מה הלקוח יקבל.
  const [previewTo, setPreviewTo] = useState<string | null>(null);

  function handlePreview() {
    const to = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      setError('כתובת המייל לא תקינה');
      return;
    }
    setError(null);
    setPreviewTo(to);
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card" style={{ width: 480, maxWidth: '100%', padding: '1.5rem' }}>
        {sentTo ? (
          <div style={{ textAlign: 'center', padding: '.5rem 0' }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>📨</div>
            <h3 style={{ margin: '0 0 .4rem' }}>השאלון נשלח!</h3>
            <p style={{ color: 'var(--gray-600)', fontSize: '.9rem', margin: 0 }}>
              נשלח אל <b dir="ltr">{sentTo}</b>. כשהלקוח יענה — התשובות יופיעו אוטומטית
              בתמונת המס שבכרטיס.
            </p>
            <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={onClose}>סגור</button>
          </div>
        ) : (
          <>
            <h3 style={{ marginTop: 0 }}>שליחת שאלון ללקוח</h3>
            <p style={{ color: 'var(--gray-600)', fontSize: '.88rem' }}>
              הלקוח יקבל מייל עם קישור אישי לשאלון ההיכרות/עדכון. הוא עונה רק על מה
              שרלוונטי, והתשובות נכנסות ישירות לכרטיס — שימושי כשידוע שהיה שינוי אצל הלקוח.
            </p>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '.35rem' }}>לאיזו כתובת לשלוח?</label>
            <input
              type="email"
              className="input"
              dir="ltr"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              placeholder="client@example.com"
              style={{ width: '100%' }}
              autoFocus
            />
            {error && <div style={{ color: 'var(--red)', fontSize: '.85rem', marginTop: '.4rem' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '.6rem', justifyContent: 'flex-start', marginTop: '1.1rem' }}>
              <button className="btn btn-primary" onClick={handlePreview} disabled={!email.trim()}>
                תצוגה מקדימה ושליחה
              </button>
              <button className="btn btn-secondary" onClick={onClose}>ביטול</button>
            </div>
          </>
        )}
      </div>

      {previewTo && (
        <EmailPreviewDialog
          heading="שאלון ללקוח — תצוגה מקדימה"
          body={{ stage: 'intake', clientId: client.id, email: previewTo }}
          onSent={() => { setSentTo(previewTo); onSent(previewTo); }}
          onClose={() => setPreviewTo(null)}
        />
      )}
    </div>
  );
}
