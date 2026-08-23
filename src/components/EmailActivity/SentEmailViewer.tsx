// צפייה במייל שנשלח, בדיוק כפי שהלקוח ראה אותו.
// מרונדר ב-iframe עם sandbox ריק: זה HTML שיצא לצד שלישי, ואין סיבה לתת לו
// להריץ סקריפטים או לגעת באפליקציה.

import { EmailMessage } from '../../types/emailActivity';
import { EMAIL_PREVIEW_SANDBOX, withExternalLinks } from '../../utils/emailPreviewHtml';

function fmtTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function SentEmailViewer({ message, onClose }: { message: EmailMessage; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 760, maxWidth: '100%', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div className="modal-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>{message.subject || 'מייל שנשלח'}</h3>
            <div style={{ fontSize: '.78rem', color: 'var(--gray-500)', marginTop: 2 }}>
              אל <span dir="ltr">{message.toEmail}</span> · {fmtTime(message.sentAt)}
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', background: 'var(--gray-100, #eee)' }}>
          <iframe
            title="תצוגת המייל שנשלח"
            srcDoc={withExternalLinks(message.html)}
            sandbox={EMAIL_PREVIEW_SANDBOX}
            style={{ width: '100%', height: '70vh', border: 'none', background: '#fff' }}
          />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={() => {
            const w = window.open('', '_blank');
            if (w) { w.document.write(message.html || ''); w.document.close(); }
          }}>פתיחה בכרטיסייה חדשה</button>
          <button type="button" className="btn btn-primary" onClick={onClose}>סגירה</button>
        </div>
      </div>
    </div>
  );
}
