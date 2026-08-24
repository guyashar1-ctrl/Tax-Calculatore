// מודול מרכז התקשורת — עצמאי. כרגע מוטמע ב-Firm Profile, אך ניתן לקדם
// למסך עליון מלא בלי שינוי: פשוט לרנדר <EmailActivityModule userId={...} /> במקום אחר.
import { useMemo, useState } from 'react';
import { useEmailMessages } from '../../hooks/useEmailMessages';
import { supabase } from '../../lib/supabase';
import { EmailMessage, EmailStatus, EMAIL_STATUS_LABEL, EMAIL_STATUS_STYLE } from '../../types/emailActivity';
import SentEmailViewer from './SentEmailViewer';

interface Props {
  userId: string;
  clientId?: string; // סינון אופציונלי — למשל בכרטיס לקוח בעתיד
}

function fmtTime(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function StatusChip({ status }: { status: EmailStatus }) {
  const s = EMAIL_STATUS_STYLE[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: s.fg, fontSize: 'var(--fs-12)' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />
      {EMAIL_STATUS_LABEL[status]}
    </span>
  );
}

export default function EmailActivityModule({ userId, clientId }: Props) {
  const { messages, loading, error, reload } = useEmailMessages(userId);
  const [viewing, setViewing] = useState<EmailMessage | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillNote, setBackfillNote] = useState<{ ok: boolean; text: string } | null>(null);

  /** מושך מ-Resend את גוף המיילים שנשלחו לפני שהמערכת התחילה לשמור עותק. */
  async function handleBackfill() {
    setBackfilling(true);
    setBackfillNote(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('backfill-email-html', { body: { limit: 200 } });
      if (fnErr || !data?.ok) {
        const detail = data?.error === 'missing_read_key'
          ? 'חסר מפתח קריאה של Resend בהגדרות השרת.'
          : (data?.detail || data?.error || fnErr?.message || 'הפעולה נכשלה');
        setBackfillNote({ ok: false, text: detail });
        return;
      }
      const parts = [`שוחזרו ${data.filled} מיילים`];
      if (data.remaining > 0) parts.push(`נותרו ${data.remaining} - אפשר להריץ שוב`);
      if (data.failures?.length) parts.push(`${data.failures.length} לא נמצאו ב-Resend`);
      setBackfillNote({ ok: true, text: parts.join(' · ') });
      await reload();
    } catch (e) {
      setBackfillNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBackfilling(false);
    }
  }

  const rows = useMemo(
    () => (clientId ? messages.filter(m => m.clientId === clientId) : messages),
    [messages, clientId],
  );

  const stats = useMemo(() => {
    const isDelivered = (m: EmailMessage) => ['delivered', 'opened', 'clicked'].includes(m.status);
    const isOpened = (m: EmailMessage) => !!m.openedAt || ['opened', 'clicked'].includes(m.status);
    const isFailed = (m: EmailMessage) => ['bounced', 'complained', 'failed'].includes(m.status);
    return {
      total: rows.length,
      delivered: rows.filter(isDelivered).length,
      opened: rows.filter(isOpened).length,
      failed: rows.filter(isFailed).length,
    };
  }, [rows]);

  // כמה מהמיילים ברשימה עדיין בלי עותק שמור
  const missingHtml = useMemo(() => rows.filter(m => !m.html && m.resendId).length, [rows]);

  const stat = (label: string, val: number, color?: string) => (
    <div style={{ background: 'var(--gray-50, #F1EFE8)', borderRadius: 8, padding: '10px 14px', minWidth: 84 }}>
      <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)' }}>{label}</div>
      <div style={{ fontSize: 'var(--fs-20)', fontWeight: 500, color: color || 'inherit' }}>{val}</div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 'var(--fs-14)', fontWeight: 500 }}>פעילות מייל</div>
        <button className="btn btn-ghost btn-sm" onClick={reload} disabled={loading}>{loading ? '…' : '↻ רענון'}</button>
      </div>
      <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginBottom: 14 }}>
        כל מייל שנשלח מהמערכת. סטטוסי מסירה/פתיחה מתעדכנים בזמן אמת מ-Resend.
      </div>

      {error && <div style={{ padding: '.6rem .8rem', background: 'var(--red-light)', color: 'var(--red)', borderRadius: 8, fontSize: '.85rem', marginBottom: 12 }}>{error}</div>}

      {/* מיילים שנשלחו לפני שהמערכת התחילה לשמור עותק — ניתן למשוך אותם מ-Resend */}
      {missingHtml > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '.6rem .8rem', background: 'var(--gray-50, #F1EFE8)', borderRadius: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 'var(--fs-13)', color: 'var(--gray-700)', flex: 1, minWidth: 200 }}>
            ל-{missingHtml} מיילים ישנים אין עותק שמור. אפשר למשוך אותם מ-Resend.
          </span>
          <button className="btn btn-secondary btn-sm" onClick={handleBackfill} disabled={backfilling}>
            {backfilling ? 'מושך…' : '⤓ שחזור תוכן'}
          </button>
        </div>
      )}
      {backfillNote && (
        <div style={{ padding: '.55rem .8rem', borderRadius: 8, fontSize: '.85rem', marginBottom: 12,
                      background: backfillNote.ok ? 'var(--green-light, #eaf6f1)' : 'var(--red-light)',
                      color: backfillNote.ok ? 'var(--ok, #17845b)' : 'var(--red)' }}>
          {backfillNote.ok ? '✓ ' : '⚠ '}{backfillNote.text}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        {stat('נשלחו', stats.total)}
        {stat('נמסרו', stats.delivered, 'var(--ok)')}
        {stat('נפתחו', stats.opened, 'var(--info)')}
        {stat('נכשלו', stats.failed, 'var(--err)')}
      </div>

      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--ink-4)', borderTop: '1px solid var(--hairline-2)', fontSize: 'var(--fs-13)' }}>
          {loading ? 'טוען…' : 'עדיין לא נשלחו מיילים.'}
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-13)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--hairline-1)', color: 'var(--ink-4)', fontSize: 'var(--fs-12)' }}>
                  <th style={{ textAlign: 'right', padding: '9px 12px', fontWeight: 500 }}>נמען</th>
                  <th style={{ textAlign: 'right', padding: '9px 8px', fontWeight: 500 }}>נושא</th>
                  <th style={{ textAlign: 'right', padding: '9px 8px', fontWeight: 500 }}>סטטוס</th>
                  <th style={{ textAlign: 'right', padding: '9px 8px', fontWeight: 500 }}>נשלח</th>
                  <th style={{ textAlign: 'right', padding: '9px 8px', fontWeight: 500 }}>המייל</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(m => (
                  <tr key={m.id} style={{ borderBottom: '0.5px solid var(--gray-100, #eee)' }}>
                    <td style={{ padding: '10px 12px' }} dir="ltr" align="right">{m.toEmail}</td>
                    <td style={{ padding: '10px 8px' }}>{m.subject || '-'}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <StatusChip status={m.status} />
                      {m.error && <div style={{ fontSize: 'var(--fs-12)', color: 'var(--err)', marginTop: 3 }}>{m.error}</div>}
                    </td>
                    <td style={{ padding: '10px 8px', color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>{fmtTime(m.sentAt)}</td>
                    <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>
                      {m.html ? (
                        <button className="btn btn-secondary btn-sm" onClick={() => setViewing(m)}>צפייה</button>
                      ) : (
                        <span style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-400)' }} title="נשלח לפני שהמערכת התחילה לשמור עותק">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 'var(--fs-12)', color: 'var(--gray-400)' }}>
        ↩ עמודת "תשובות" תתווסף כשנחבר את Gmail (שלב עתידי).
      </div>

      {viewing && <SentEmailViewer message={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
