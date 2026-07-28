// ─── שורת מייל בתוך שלב בתהליך ──────────────────────────────────────────────
// המיילים הוצגו בכרטיס נפרד, ולכן היה צריך לקפוץ בין מקומות כדי לדעת אם מה
// שהשלב מדבר עליו בכלל יצא ונקרא. כאן השורה צמודה לשלב שהיא שייכת אליו.

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { EmailMessage } from '../../types/emailActivity';
import SentEmailViewer from './SentEmailViewer';

interface Props {
  message: EmailMessage;
  /** הערה קטנה מתחת לשורה — למשל שהמייל משותף לשתי הרשויות. */
  note?: string;
  /** שולח שוב את אותו מייל. null = הצלחה. חסר ⇒ אין תזכורת בשורה הזו. */
  onRemind?: () => Promise<string | null>;
  onChanged?: () => void;
}

function fmt(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function EmailStatusRow({ message, note, onRemind, onChanged }: Props) {
  const [viewing, setViewing] = useState<EmailMessage | null>(null);
  const [busy, setBusy] = useState<'view' | 'remind' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const failed = ['bounced', 'complained', 'failed'].includes(message.status);
  const delivered = !!message.deliveredAt;
  const opened = !!message.openedAt || ['opened', 'clicked'].includes(message.status);

  /** אין עותק שמור ⇒ נמשך מ-Resend ונפתח מיד, באותה לחיצה. */
  async function view() {
    if (message.html) { setViewing(message); return; }
    setBusy('view');
    setErr(null);
    try {
      const { data, error } = await supabase.functions.invoke('backfill-email-html', { body: { messageId: message.id } });
      if (error || !data?.ok) setErr(data?.error === 'missing_read_key' ? 'חסר מפתח קריאה של Resend' : (data?.error || error?.message || 'לא הצלחתי לשלוף'));
      else if (!data.html) setErr('Resend לא מחזיק יותר את תוכן המייל');
      else { setViewing({ ...message, html: data.html }); onChanged?.(); }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }

  async function remind() {
    if (!onRemind) return;
    setBusy('remind');
    setErr(null);
    const e = await onRemind();
    if (e) setErr(e); else onChanged?.();
    setBusy(null);
  }

  const chip = (label: string, on: boolean) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: on ? 'var(--ok, #17845b)' : 'var(--gray-400, #aaa)' }}>
      <span style={{ fontSize: '.7rem' }}>{on ? '✓' : '○'}</span>{label}
    </span>
  );

  // קישורי טקסט ולא כפתורים — פעולות משניות שאסור שיתחרו בפעולה של השלב
  const link: React.CSSProperties = {
    background: 'none', border: 'none', padding: 0, font: 'inherit',
    color: 'var(--blue)', textDecoration: 'underline', cursor: 'pointer',
  };

  return (
    <div style={{
      background: 'var(--gray-50)', borderRadius: 'var(--radius)',
      padding: '.45rem .6rem', fontSize: '.76rem', lineHeight: 1.7,
    }}>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: 'var(--gray-700)' }}>✉ {fmt(message.sentAt)}</span>
        {failed ? (
          <span style={{ color: 'var(--red)' }}>⚠ {message.status === 'bounced' ? 'חזר — כתובת שגויה' : 'השליחה נכשלה'}</span>
        ) : (
          <>
            {chip('הגיע', delivered)}
            {chip('נפתח', opened)}
          </>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" style={link} onClick={view} disabled={busy === 'view'}>
          {busy === 'view' ? 'פותח…' : 'צפייה'}
        </button>
        {onRemind && (
          <>
            <span style={{ color: 'var(--gray-300, #ccc)' }}>·</span>
            <button type="button" style={link} onClick={remind} disabled={busy === 'remind'}>
              {busy === 'remind' ? 'שולח…' : 'תזכורת'}
            </button>
          </>
        )}
      </div>
      {note && <div style={{ color: 'var(--gray-500)', fontSize: '.72rem' }}>{note}</div>}
      {err && <div style={{ color: 'var(--red)', fontSize: '.72rem' }}>⚠ {err}</div>}
      {viewing && <SentEmailViewer message={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
