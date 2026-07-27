// ─── מה נשלח ללקוח בבקשה הזו ────────────────────────────────────────────────
// יומן המיילים היה קיים רק כרשימה כלל-משרדית ב"פעילות מייל". כאן הוא מוצג
// בהקשר: מה נשלח ללקוח הספציפי, האם הגיע, האם נפתח — ומה בדיוק הוא ראה.

import { useMemo, useState } from 'react';
import { useEmailMessages } from '../../hooks/useEmailMessages';
import { supabase } from '../../lib/supabase';
import { EmailMessage } from '../../types/emailActivity';
import SentEmailViewer from './SentEmailViewer';

interface Props {
  userId: string | undefined;
  requestId: string;
}

const KIND_LABELS: Record<string, string> = {
  onboard: 'הזמנה למילוי פרטים',
  sign: 'בקשת חתימה',
  ni_approve: 'הוראות אישור בביטוח לאומי',
  active: 'אישור שהייצוג פעיל',
  intake: 'שאלון היכרות',
};

function fmt(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * שלבי חיי המייל. "נלחץ" מוצג רק כשיש נתון — מעקב לחיצות הוא הגדרה נפרדת
 * ב-Resend, ובלעדיה השלב הזה לעולם לא יתמלא ואין טעם להציג אותו כחסר.
 */
function Trail({ m }: { m: EmailMessage }) {
  const failed = ['bounced', 'complained', 'failed'].includes(m.status);
  if (failed) {
    return (
      <div style={{ fontSize: '.78rem', color: 'var(--red)' }}>
        ⚠ {m.status === 'bounced' ? 'המייל חזר — הכתובת כנראה שגויה' : m.error || 'השליחה נכשלה'}
      </div>
    );
  }
  const steps: { label: string; at?: string; done: boolean }[] = [
    { label: 'נשלח', at: m.sentAt, done: true },
    { label: 'הגיע לתיבה', at: m.deliveredAt, done: !!m.deliveredAt },
    { label: 'נפתח', at: m.openedAt, done: !!m.openedAt },
  ];
  if (m.clickedAt) steps.push({ label: 'נלחץ הקישור', at: m.clickedAt, done: true });

  return (
    <div style={{ display: 'flex', gap: '1.1rem', flexWrap: 'wrap' }}>
      {steps.map(s => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
          <span style={{
            width: 15, height: 15, borderRadius: '50%', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700,
            background: s.done ? 'var(--ok, #17845b)' : 'var(--gray-200)',
            color: s.done ? '#fff' : 'var(--gray-500)',
          }}>{s.done ? '✓' : ''}</span>
          <span style={{ fontSize: '.78rem', color: s.done ? 'var(--gray-800)' : 'var(--gray-400, #aaa)' }}>
            {s.label}{s.at ? ` · ${fmt(s.at)}` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function RequestEmailTimeline({ userId, requestId }: Props) {
  const { messages, loading, reload } = useEmailMessages(userId);
  const [viewing, setViewing] = useState<EmailMessage | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  /** מושך מ-Resend את גוף המייל הזה בלבד. */
  async function restore(messageId: string) {
    setRestoring(messageId);
    setNote(null);
    try {
      const { data, error } = await supabase.functions.invoke('backfill-email-html', { body: { messageId } });
      if (error || !data?.ok) {
        setNote(data?.error === 'missing_read_key'
          ? 'חסר מפתח קריאה של Resend בהגדרות השרת.'
          : (data?.error || error?.message || 'השחזור נכשל'));
      } else if (data.filled === 0) {
        setNote('Resend לא מחזיק יותר את תוכן המייל הזה.');
      } else {
        await reload();
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setRestoring(null);
    }
  }

  const rows = useMemo(
    () => messages.filter(m => m.requestId === requestId),
    [messages, requestId],
  );

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-header">
        <div className="card-title">📧 מה נשלח ללקוח</div>
      </div>
      <div className="card-body">
        {loading ? (
          <div style={{ color: 'var(--gray-500)', fontSize: '.85rem' }}>טוען…</div>
        ) : rows.length === 0 ? (
          <div style={{ color: 'var(--gray-500)', fontSize: '.85rem' }}>עדיין לא נשלחו מיילים בבקשה הזו.</div>
        ) : (
          rows.map(m => (
            <div key={m.id} style={{
              display: 'flex', gap: '.8rem', flexWrap: 'wrap', alignItems: 'flex-start',
              padding: '.7rem 0', borderTop: '1px solid var(--gray-100, #eee)',
            }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div style={{ fontSize: '.9rem', fontWeight: 600, color: 'var(--gray-900, #111)' }}>
                  {m.subject || KIND_LABELS[m.kind || ''] || 'מייל'}
                </div>
                <div style={{ fontSize: '.75rem', color: 'var(--gray-500)', margin: '2px 0 7px' }}>
                  {KIND_LABELS[m.kind || ''] || m.kind} · אל <span dir="ltr">{m.toEmail}</span>
                </div>
                <Trail m={m} />
              </div>
              <div style={{ flex: '0 0 auto', textAlign: 'left' }}>
                {m.html ? (
                  <button className="btn btn-secondary btn-sm" onClick={() => setViewing(m)}>👁 צפייה במייל</button>
                ) : (
                  <>
                    <button className="btn btn-secondary btn-sm" disabled={restoring === m.id}
                      onClick={() => restore(m.id)}>
                      {restoring === m.id ? 'משחזר…' : '⤓ שחזור המייל'}
                    </button>
                    <div style={{ fontSize: '.7rem', color: 'var(--gray-400, #aaa)', marginTop: 3 }}>נשלח לפני שנשמרו עותקים</div>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
        {note && (
          <div style={{ marginTop: ".6rem", padding: ".5rem .75rem", background: "var(--red-light)", color: "var(--red)", borderRadius: "var(--radius)", fontSize: ".82rem" }}>⚠ {note}</div>
        )}
      {viewing && <SentEmailViewer message={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
