// ─── מיילים שנשלחו ללקוח — קטע בכרטיס הלקוח ────────────────────────────────
// כלל: מייל שיצא ללקוח חייב להיות גלוי במקום שבו מסתכלים על הלקוח, ולא רק
// ביומן הכללי של המשרד. בלי זה מיילים יוצאים בלי שיודעים עליהם.

import { useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useEmailMessages } from '../../hooks/useEmailMessages';
import { emailKindLabel, EmailMessage } from '../../types/emailActivity';
import { belongsToClientCard } from '../../utils/clientEmailFilter';
import SentEmailViewer from './SentEmailViewer';
import { supabase } from '../../lib/supabase';

function fmt(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function Row({ m, onChanged }: { m: EmailMessage; onChanged: () => void }) {
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
    <div style={{ padding: '.4rem 0', borderBottom: '1px dashed var(--gray-100)' }}>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'baseline', fontSize: '.82rem' }}>
        <b>{emailKindLabel(m.kind)}</b>
        <span style={{ color: 'var(--gray-500)', fontSize: '.75rem' }}>{fmt(m.sentAt)}</span>
        <span style={{ color: 'var(--gray-500)', fontSize: '.75rem' }} dir="ltr">{m.toEmail}</span>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'flex', gap: '.5rem', fontSize: '.75rem' }}>
          {failed
            ? <span style={{ color: 'var(--red)' }}>{m.status === 'bounced' ? 'חזר — כתובת שגויה' : 'השליחה נכשלה'}</span>
            : <>{chip('הגיע', delivered)}{chip('נפתח', opened)}</>}
        </span>
        <button
          type="button"
          onClick={view}
          disabled={busy}
          style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: '.78rem', color: 'var(--blue)', textDecoration: 'underline', cursor: 'pointer', minHeight: 44 }}
        >
          {busy ? 'פותח…' : 'צפייה במייל'}
        </button>
      </div>
      {m.subject && <div style={{ fontSize: '.75rem', color: 'var(--gray-500)' }}>{m.subject}</div>}
      {err && <div style={{ fontSize: '.75rem', color: 'var(--red)' }}>{err}</div>}
      {viewing && <SentEmailViewer message={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

export default function ClientEmailsSection(
  { clientId, emails, since }: { clientId: string; emails?: (string | undefined)[]; since?: string },
) {
  const { user } = useAuth();
  const { messages, loading, reload } = useEmailMessages(user?.id);

  // התאמה גם לפי כתובת: מיילים ישנים נשמרו בלי שיוך ללקוח, וגם בקשות חתימה
  // נשמרות לפעמים על הבקשה בלבד — בלי זה הם היו נעלמים מהכרטיס.
  const addresses = useMemo(
    () => new Set((emails ?? []).filter(Boolean).map(e => e!.trim().toLowerCase())),
    [emails],
  );

  const rows = useMemo(
    () => messages.filter(m => belongsToClientCard(m, { clientId, addresses, since })),
    [messages, clientId, addresses, since],
  );

  return <ClientEmailsList rows={rows} loading={loading} onChanged={reload} />;
}

/** התצוגה בלבד — כדי שאפשר יהיה לבדוק אותה עם נתונים מדומים.
 *  bare ⇒ בלי מעטפת וכותרת — כשהרשימה יושבת בתוך מקטע מתקפל שכבר נושא אותן. */
export function ClientEmailsList({ rows, loading, onChanged, bare }: { rows: EmailMessage[]; loading?: boolean; onChanged: () => void; bare?: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? rows : rows.slice(0, 5);

  const body = rows.length === 0 ? (
    <div className="cw-empty">{loading ? 'טוען…' : 'לא נשלח ללקוח הזה אף מייל מהמערכת.'}</div>
  ) : (
    <>
      {shown.map(m => <Row key={m.id} m={m} onChanged={onChanged} />)}
      {rows.length > shown.length && (
        <button className="btn btn-ghost btn-sm" style={{ marginTop: '.3rem' }} onClick={() => setShowAll(true)}>
          הצג עוד {rows.length - shown.length}
        </button>
      )}
    </>
  );

  if (bare) return body;

  return (
    <div className="cw-section">
      <div className="cw-section-head">
        <span>מיילים שנשלחו ללקוח</span>
        {rows.length > 0 && <span style={{ fontSize: '.75rem', color: 'var(--gray-400)' }}>{rows.length}</span>}
      </div>
      {body}
    </div>
  );
}
