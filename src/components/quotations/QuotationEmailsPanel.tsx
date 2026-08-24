// ─── כל המיילים של ההצעה, במקום אחד ─────────────────────────────────────────
// כלל: מייל שיצא ללקוח חייב להיות גלוי במקום שבו מסתכלים עליו. עד כה טאב
// המעקב הראה אבני דרך בלבד, וכדי לדעת אם מייל ההצעה בכלל הגיע — או אם קישור
// הייצוג יצא אחרי האישור — היה צריך לצאת ליומן הכללי של המשרד.
//
// שני מקורות, כי המיילים נרשמים אחרת: מיילי ההצעה נושאים meta.quotationId,
// ומיילי הייצוג שנפתחו מהאישור נושאים request_id של בקשת הייצוג.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { emailKindLabel, EmailMessage } from '../../types/emailActivity';
import SentEmailViewer from '../EmailActivity/SentEmailViewer';

interface Props {
  quotationId: string;
  /** בקשת הייצוג שנפתחה עם האישור — המיילים שלה שייכים לסיפור של ההצעה */
  representationRequestId?: string;
}

function toCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function fromDb(row: Record<string, unknown>): EmailMessage {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[toCamel(k)] = v === null ? undefined : v;
  return out as unknown as EmailMessage;
}

function fmt(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function QuotationEmailsPanel({ quotationId, representationRequestId }: Props) {
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const filters = [`meta->>quotationId.eq.${quotationId}`];
    if (representationRequestId) filters.push(`request_id.eq.${representationRequestId}`);
    const { data, error: err } = await supabase
      .from('email_messages')
      .select('*')
      .or(filters.join(','))
      .order('sent_at', { ascending: false });
    if (err) { setError(err.message); setLoading(false); return; }
    setMessages((data ?? []).map(fromDb));
    setError(null);
    setLoading(false);
  }, [quotationId, representationRequestId]);

  useEffect(() => { void load(); }, [load]);

  const panel: React.CSSProperties = {
    background: 'var(--card, #fff)', border: '1px solid var(--gray-200)', borderRadius: 12, padding: 14,
  };

  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>מיילים ללקוח</div>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => void load()} disabled={loading}>
          {loading ? 'טוען…' : 'רענון'}
        </button>
      </div>

      {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}
      {!loading && !error && messages.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>עדיין לא יצא מייל בהצעה הזו.</div>
      )}

      {messages.map(m => <EmailRow key={m.id} m={m} onChanged={() => void load()} />)}
    </div>
  );
}

function EmailRow({ m, onChanged }: { m: EmailMessage; onChanged: () => void }) {
  const [viewing, setViewing] = useState<EmailMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const failed = ['bounced', 'complained', 'failed'].includes(m.status);
  const opened = !!m.openedAt || ['opened', 'clicked'].includes(m.status);
  const delivered = !!m.deliveredAt || opened;

  /** אין עותק שמור (מייל ישן) ⇒ נמשך מ-Resend ונפתח באותה לחיצה. */
  async function view() {
    if (m.html) { setViewing(m); return; }
    setBusy(true);
    setErr(null);
    try {
      const { data, error } = await supabase.functions.invoke('backfill-email-html', { body: { messageId: m.id } });
      if (error || !data?.ok) setErr(data?.error === 'missing_read_key' ? 'חסר מפתח קריאה של Resend' : (data?.error || error?.message || 'לא הצלחתי לשלוף'));
      else if (!data.html) setErr('Resend לא מחזיק יותר את תוכן המייל');
      else { setViewing({ ...m, html: data.html }); onChanged(); }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  const chip = (label: string, on: boolean) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: on ? 'var(--ok, #17845b)' : 'var(--gray-400, #aaa)' }}>
      <span style={{ fontSize: '.7rem' }}>{on ? '✓' : '○'}</span>{label}
    </span>
  );

  return (
    <div style={{ padding: '.4rem 0', borderTop: '1px dashed var(--gray-100)' }}>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'baseline', fontSize: '.82rem' }}>
        <b>{emailKindLabel(m.kind)}</b>
        <span style={{ color: 'var(--gray-500)', fontSize: '.75rem' }}>{fmt(m.sentAt)}</span>
        <span style={{ color: 'var(--gray-500)', fontSize: '.75rem' }} dir="ltr">{m.toEmail}</span>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'flex', gap: '.5rem', fontSize: '.75rem' }}>
          {failed
            ? <span style={{ color: 'var(--red)' }}>{m.status === 'bounced' ? 'חזר - כתובת שגויה' : 'השליחה נכשלה'}</span>
            : <>{chip('הגיע', delivered)}{chip('נפתח', opened)}</>}
        </span>
        <button
          type="button"
          style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'var(--blue)', textDecoration: 'underline', cursor: 'pointer', fontSize: '.75rem' }}
          onClick={view} disabled={busy}
        >
          {busy ? 'פותח…' : 'צפייה'}
        </button>
      </div>
      {m.error && <div style={{ color: 'var(--red)', fontSize: '.72rem' }}>{m.error}</div>}
      {err && <div style={{ color: 'var(--red)', fontSize: '.72rem' }}>{err}</div>}
      {viewing && <SentEmailViewer message={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
