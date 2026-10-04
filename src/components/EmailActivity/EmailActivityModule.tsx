// ─── יומן המיילים של המשרד ───────────────────────────────────────────────────
// כל מייל שיצא מהמערכת: על איזה לקוח, למי, מה, מתי, ואם הגיע.
// ‼ הלקוח בשורה הוא הקשר העבודה: לחיצה עליו פותחת את הכרטיס שלו. כתובת המייל
// לבדה לא אומרת לרו"ח על מי מדובר.
// ‼ הרשימה כאן היא 200 המיילים האחרונים (useEmailMessages). הספירות הן שלהם.
import { useMemo, useState } from 'react';
import { useEmailMessages } from '../../hooks/useEmailMessages';
import { supabase } from '../../lib/supabase';
import {
  EmailMessage, EmailStatus, EMAIL_STATUS_LABEL, EMAIL_STATUS_STYLE, emailMessageLabel, isInternalEmailKind,
  isFailedEmailStatus, isUnknownEmailStatus, emailRowState,
} from '../../types/emailActivity';
import type { Client } from '../../types';
import { matchesFilter, type ActivityFilter } from '../office/pages/activityFilter';
import SentEmailViewer from './SentEmailViewer';

interface Props {
  userId: string;
  clientId?: string;
  /** לשם הלקוח בשורה. בלי רשימה — מוצגת הכתובת בלבד. */
  clients?: Client[];
  onOpenClient?: (clientId: string) => void;
  /** סינון שהגיע מעמוד אחר («מה יצא ←»). */
  filter?: ActivityFilter | null;
  onClearFilter?: () => void;
}

// ‼ «לא ידוע אם יצאו» הוא סינון נפרד מ«נכשלו»: מייל שאולי הגיע אינו כישלון.
type View = 'all' | 'failed' | 'unknown' | 'clients' | 'office';

function fmtTime(iso?: string): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function StatusChip({ status }: { status: EmailStatus }) {
  const s = EMAIL_STATUS_STYLE[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: s.fg, fontSize: 'var(--fs-12)', whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />
      {EMAIL_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * סיבת הקפצה בעברית — ספק המייל מחזיר אנגלית. מה שלא מוכר מוצג כמו שהוא
 * (והמקור תמיד ברחיפה).
 */
const BOUNCE_HE: [RegExp, string][] = [
  [/mailbox (does not exist|not found|unavailable)|no such user|user unknown|address.*(not|does not) exist/i, 'תיבת הדואר לא קיימת — כדאי לבדוק את הכתובת'],
  [/mailbox (is )?full|quota/i, 'תיבת הדואר מלאה'],
  [/domain.*(not found|does not exist)|no mx|dns/i, 'הדומיין של הכתובת לא קיים'],
  [/spam|blocked|rejected|blacklist/i, 'השרת של הנמען חסם את המייל'],
];
function bounceReason(raw: string): string {
  for (const [re, he] of BOUNCE_HE) if (re.test(raw)) return he;
  return raw;
}

export default function EmailActivityModule({ userId, clientId, clients = [], onOpenClient, filter = null, onClearFilter }: Props) {
  // יומן המשרד — כאן כן מושכים את הגוף: «צפייה» מוצגת רק כשיש עותק שמור.
  const { messages, loading, error, reload } = useEmailMessages(userId, { clientId, withHtml: true });
  const [viewing, setViewing] = useState<EmailMessage | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillNote, setBackfillNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [view, setView] = useState<View>('all');
  const [q, setQ] = useState('');

  const nameOf = useMemo(() => {
    const m = new Map(clients.map(c => [c.id, `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim()]));
    return (id?: string) => (id ? m.get(id) : undefined);
  }, [clients]);

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

  const base = useMemo(
    () => (clientId ? messages.filter(m => m.clientId === clientId) : messages).filter(m => matchesFilter(m, filter)),
    [messages, clientId, filter],
  );
  const failedCount = base.filter(m => isFailedEmailStatus(m.status)).length;
  const unknownCount = base.filter(m => isUnknownEmailStatus(m.status)).length;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return base.filter(m => {
      if (view === 'failed' && !isFailedEmailStatus(m.status)) return false;
      if (view === 'unknown' && !isUnknownEmailStatus(m.status)) return false;
      if (view === 'office' && !isInternalEmailKind(m.kind)) return false;
      if (view === 'clients' && isInternalEmailKind(m.kind)) return false;
      if (!needle) return true;
      const hay = [m.toEmail, m.subject, nameOf(m.clientId), emailMessageLabel(m)].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [base, view, q, nameOf]);

  const missingHtml = useMemo(() => base.filter(m => !m.html && m.resendId).length, [base]);

  // הסינון «לא ידוע אם יצאו» מופיע רק כשיש כאלה — לא עוד כפתור ריק ברוב הימים.
  const VIEWS: { id: View; label: string }[] = [
    { id: 'all', label: 'הכל' },
    { id: 'failed', label: failedCount ? `נכשלו · ${failedCount}` : 'נכשלו' },
    ...(unknownCount > 0 || view === 'unknown'
      ? [{ id: 'unknown' as View, label: unknownCount ? `לא ידוע אם יצאו · ${unknownCount}` : 'לא ידוע אם יצאו' }]
      : []),
    { id: 'clients', label: 'ללקוחות' },
    { id: 'office', label: 'למשרד' },
  ];

  return (
    <div>
      {filter && (
        <p className="of-note" style={{ marginTop: 0, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1 }}>מסנן: <b>{filter.label}</b> · {base.length} מיילים</span>
          {onClearFilter && <button type="button" className="of-link" onClick={onClearFilter}>הצגת הכל</button>}
        </p>
      )}

      <div className="of-filters">
        <div className="of-seg" role="group" aria-label="סינון">
          {VIEWS.map(v => (
            <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)}>{v.label}</button>
          ))}
        </div>
        <input className="of-search" type="search" value={q} onChange={e => setQ(e.target.value)}
          placeholder="חיפוש לקוח, כתובת או נושא" aria-label="חיפוש ביומן" />
        <button className="btn btn-ghost btn-sm" onClick={() => void reload()} disabled={loading}>{loading ? 'טוען…' : 'רענון'}</button>
      </div>

      {error && <div className="of-error-box" role="alert">טעינת היומן נכשלה: {error}</div>}

      {missingHtml > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 12px' }} className="of-quiet">
          <span style={{ flex: 1, minWidth: 200 }}>ל-{missingHtml} מיילים ישנים אין עותק שמור לצפייה.</span>
          <button className="btn btn-secondary btn-sm" onClick={handleBackfill} disabled={backfilling}>
            {backfilling ? 'מושך…' : 'שחזור התוכן מ-Resend'}
          </button>
        </div>
      )}
      {backfillNote && (
        <div className={backfillNote.ok ? 'of-note' : 'of-error-box'} style={{ margin: '0 0 12px' }}>
          {backfillNote.text}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="of-empty" style={{ borderTop: '1px solid var(--hairline-2)' }}>
          {loading ? 'טוען…' : messages.length === 0 ? 'עדיין לא נשלחו מיילים.' : 'אין מיילים שמתאימים לסינון.'}
        </div>
      ) : (
        <div role="table" aria-label="מיילים שנשלחו">
          <div className="of-mail of-mail-head" role="row">
            <span role="columnheader">לקוח / נמען</span>
            <span role="columnheader">מייל</span>
            <span role="columnheader">מצב</span>
            <span role="columnheader">נשלח</span>
          </div>
          {rows.map(m => {
            const name = nameOf(m.clientId);
            const internal = isInternalEmailKind(m.kind);
            return (
              <div key={m.id} className="of-mail of-mail-row" role="row">
                <div className="of-mail-who" role="cell">
                  {internal ? <span className="of-mail-client">למשרד</span>
                    : name && m.clientId && onOpenClient
                      ? <button type="button" className="of-link of-mail-client" onClick={() => onOpenClient(m.clientId!)}>{name}</button>
                      : name ? <span className="of-mail-client">{name}</span> : null}
                  <span className="of-mail-addr">{m.toEmail}</span>
                </div>
                <div className="of-mail-subj" role="cell">
                  {m.subject || '-'}
                  {(() => {
                    const kind = internal ? 'התראה למשרד' : emailMessageLabel(m);
                    // סוג שחוזר על הנושא (או «מייל» כללי) אינו מוסיף מידע
                    return kind !== 'מייל' && kind !== m.subject ? <span className="of-mail-kind">{kind}</span> : null;
                  })()}
                </div>
                <div className="of-mail-status" role="cell">
                  <span>
                    <StatusChip status={m.status} />
                    {/* ‼ לא ידוע אם יצא — הסיבה והצעד הבטוח בכתום, לא טקסט הספק באדום. */}
                    {isUnknownEmailStatus(m.status)
                      ? <span style={{ display: 'block', fontSize: 'var(--fs-12)', color: 'var(--warn)', marginTop: 3 }}>{emailRowState(m).hint}</span>
                      : m.error && <span style={{ display: 'block', fontSize: 'var(--fs-12)', color: 'var(--err)', marginTop: 3, overflowWrap: 'anywhere' }} title={m.error}>{bounceReason(m.error)}</span>}
                  </span>
                  {m.html
                    ? <button className="btn btn-ghost btn-sm" onClick={() => setViewing(m)}>צפייה</button>
                    : null}
                </div>
                <div className="of-mail-when" role="cell">{fmtTime(m.sentAt)}</div>
              </div>
            );
          })}
        </div>
      )}

      <p className="of-muted" style={{ marginTop: 10 }}>
        מוצגים {messages.length} המיילים האחרונים. מיילים של לקוח מסוים מופיעים גם בכרטיס שלו.
      </p>

      {viewing && <SentEmailViewer message={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
