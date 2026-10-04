// «נשלחו לאחרונה» — שורה אחת ליד כל מייל/תזכורת: כמה יצאו ומתי האחרון, וצפייה במה שיצא.
// ‼ הראיה היא היומן (email_messages) — לא ההגדרה. מתג דולק בלי שורה כאן
// פירושו שעוד לא היה למי לשלוח, וזה בדיוק מה שהשורה אומרת.
// ‼ «צפייה» מציגה את העותק שנשמר בשליחה (כמו ביומן) — לא נוסח משוחזר. לתזכורות
// שהנוסח שלהן קבוע בשרת זו הדרך היחידה לראות אותו בלי לשכפל אותו לקוד המסך.
import { useMemo, useState } from 'react';
import type { EmailMessage } from '../../../types/emailActivity';
import { emailRowState, isInternalEmailKind } from '../../../types/emailActivity';
import type { Client } from '../../../types';
import { supabase } from '../../../lib/supabase';
import { fetchEmailHtml } from '../../../hooks/useEmailMessages';
import SentEmailViewer from '../../EmailActivity/SentEmailViewer';
import { emailsFor, type MailQuery, type ResultTone, type RowEvent } from '../../../features/automation/automationList';

const DAY = 86_400_000;

// ‼ בלי html — גוף המייל נטען רק ב«צפייה» (fetchEmailHtml), כמו ביומן.
const MAIL_COLUMNS = 'id,user_id,client_id,request_id,resend_id,to_email,subject,kind,status,error,sent_at,delivered_at,opened_at,clicked_at,meta,created_at,updated_at,idempotency_key,step_id';
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
function mailFromDb(row: Record<string, unknown>): EmailMessage {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[camel(k)] = v === null ? undefined : v;
  return out as unknown as EmailMessage;
}

/**
 * המיילים של מנגנון אחד — שאילתה משלו, לא חלון של 200 המיילים האחרונים של
 * המשרד (שבו מנגנון נדיר «לא יצא מעולם»). null = לא נטען.
 * ‼ הסינון רץ גם בשרת וגם כאן (emailsFor): מסד מדומה מתעלם מחלק מהמסננים.
 */
export async function fetchEmails(q: MailQuery, opts: { limit: number; sinceDays?: number }): Promise<EmailMessage[] | null> {
  if (!q.kinds?.length && !q.internal) return [];
  let s = supabase.from('email_messages').select(MAIL_COLUMNS);
  s = q.kinds?.length ? s.in('kind', q.kinds) : s.or('kind.like.notify_*,kind.eq.weekly_backup');
  for (const k of q.excludeKinds ?? []) s = s.neq('kind', k);
  if (q.origin) s = s.contains('meta', { origin: q.origin });
  if (q.keyPrefix) s = s.like('idempotency_key', `${q.keyPrefix}%`);
  if (opts.sinceDays) s = s.gte('sent_at', new Date(Date.now() - opts.sinceDays * DAY).toISOString());
  const { data, error } = await s.order('sent_at', { ascending: false, nullsFirst: false }).limit(opts.limit);
  if (error) return null;
  return emailsFor(((data ?? []) as unknown as Record<string, unknown>[]).map(mailFromDb), q, isInternalEmailKind);
}
const fmt = (iso?: string) => iso
  ? new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
  : '';

export function sendsOf(messages: EmailMessage[], kinds: string[], days = 30): EmailMessage[] {
  if (!kinds.length) return [];
  const since = Date.now() - days * DAY;
  return messages
    .filter(m => !!m.kind && kinds.includes(m.kind))
    .filter(m => new Date(m.sentAt ?? m.createdAt ?? 0).getTime() >= since)
    .sort((a, b) => String(b.sentAt ?? b.createdAt ?? '').localeCompare(String(a.sentAt ?? a.createdAt ?? '')));
}

/**
 * מה השורה «נשלחו לאחרונה» אומרת. ‼ «נשלחו N» סופר רק מיילים שיצאו: «לא ידוע אם יצא»
 * (unknown) ו«לא הגיע» (נכשל/חזר) נספרים לחוד — לעולם לא כ«נשלחו».
 * last — המייל האחרון שיצא; בלעדיו, הניסיון האחרון.
 */
export function sentLineSummary(list: EmailMessage[]): {
  text: string; sent: number; unknown: number; failed: number; last?: EmailMessage; lastWentOut: boolean;
} {
  const tones = list.map(m => emailRowState(m).tone);
  const sentList = list.filter((_, i) => tones[i] === 'normal');
  const unknown = tones.filter(t => t === 'unknown').length;
  const failed = tones.filter(t => t === 'failed').length;
  const last = sentList[0] ?? list[0];
  const when = last ? fmt(last.sentAt ?? last.createdAt) : '';
  const text = sentList.length > 0
    ? `נשלחו ${sentList.length} ב-30 יום · אחרון ${when}`
    : list.length === 0 ? ''
    : `${list.length === 1 ? 'ניסיון שליחה אחד' : `${list.length} ניסיונות שליחה`} ב-30 יום · אחרון ${when}`;
  return { text, sent: sentList.length, unknown, failed, last, lastWentOut: sentList.length > 0 };
}

/** תג הספירה של מה שלא ידוע אם יצא / לא הגיע. ריק — אין. */
export function sentLineTags(sum: { unknown: number; failed: number }): { unknown?: string; failed?: string } {
  return {
    ...(sum.unknown > 0 ? { unknown: sum.unknown === 1 ? 'מייל אחד: לא ידוע אם יצא' : `${sum.unknown} מיילים: לא ידוע אם יצאו` } : {}),
    ...(sum.failed > 0 ? { failed: sum.failed === 1 ? 'אחד לא הגיע' : `${sum.failed} לא הגיעו` } : {}),
  };
}

export function SentLine({ messages, kinds, clients, emptyText = 'לא נשלח ב-30 הימים האחרונים' }: {
  messages: EmailMessage[] | null;
  kinds: string[];
  clients: Client[];
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<EmailMessage | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [noCopy, setNoCopy] = useState<string | null>(null);
  const list = useMemo(() => (messages ? sendsOf(messages, kinds) : []), [messages, kinds]);
  const nameOf = (id?: string) => {
    const c = id ? clients.find(x => x.id === id) : undefined;
    return c ? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() : '';
  };
  async function view(m: EmailMessage) {
    setNoCopy(null);
    if (m.html) { setViewing(m); return; }
    setLoadingId(m.id);
    const html = await fetchEmailHtml(m.id);
    setLoadingId(null);
    if (html) setViewing({ ...m, html });
    else setNoCopy(m.id);
  }
  if (messages === null) return null;
  if (list.length === 0) return emptyText ? <span className="of-sent is-none">{emptyText}</span> : null;
  const sum = sentLineSummary(list);
  const tags = sentLineTags(sum);
  const last = sum.last ?? list[0];
  const who = nameOf(last.clientId) || last.toEmail || '';
  return (
    <span className="of-sent">
      <button type="button" className="of-sent-btn" aria-expanded={open} onClick={() => setOpen(v => !v)}>
        {sum.text}{who ? ` · ${who}` : ''}
      </button>
      {tags.unknown && <> <span className="of-tag is-pending" data-tone="unknown">{tags.unknown}</span></>}
      {tags.failed && <> <span className="of-tag is-warn">{tags.failed}</span></>}
      {' · '}
      <button type="button" className="of-sent-btn" onClick={() => void view(last)} disabled={loadingId === last.id}>
        {loadingId === last.id ? 'טוען…' : sum.lastWentOut ? 'צפייה במה שיצא' : 'צפייה'}
      </button>
      {noCopy === last.id && <span className="of-sent-none"> · אין עותק שמור של המייל הזה</span>}
      {open && (
        <ul className="of-sent-list">
          {list.slice(0, 6).map(m => (
            <li key={m.id}>
              <span className="of-sent-when">{fmt(m.sentAt ?? m.createdAt)}</span>
              <span>{nameOf(m.clientId) || <bdi className="of-ltr">{m.toEmail}</bdi>}</span>
              {emailRowState(m).tone === 'failed' && <span className="of-tag is-warn">לא הגיע</span>}
              {emailRowState(m).tone === 'unknown' && <span className="of-tag is-pending" data-tone="unknown">לא ידוע אם יצא</span>}
              <button type="button" className="of-sent-btn" onClick={() => void view(m)}>צפייה</button>
            </li>
          ))}
        </ul>
      )}
      {viewing && <SentEmailViewer message={viewing} onClose={() => setViewing(null)} />}
    </span>
  );
}

// ─── «אוטומציות» · תוצאות של מנגנון שיוצא במייל (סבב 4) ──────────────────────

/** «לפני 5 דק׳» · «לפני 3 שע׳» · «2.10 · 14:05». */
export function fmtWhen(iso: string | undefined, now: number): string {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return '';
  const mins = Math.round((now - t) / 60_000);
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return `לפני ${mins} דק׳`;
  if (mins < 24 * 60) return `לפני ${Math.round(mins / 60)} שע׳`;
  const d = new Date(t);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', ...(sameYear ? {} : { year: '2-digit' }) })
    + ' · ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

export function RunDot({ tone }: { tone: ResultTone }) {
  return <span className={`of-run-dot is-${tone}`} aria-hidden="true" />;
}

/**
 * התוצאות האחרונות של מנגנון — כל שורה: מה קרה, למי, מתי, וצפייה בעותק שנשמר
 * (כשיש מייל). ‼ «לא הגיע» אינו «נשלח», ו«מתוזמן»/«לא נשלח — אין כתובת» הם
 * מצב אמיתי מ-client_notices, לא «עוד לא יצא».
 */
export function EventRuns({ list, clients, now, onOpenClient, empty, shown = 5, noteOf }: {
  list: RowEvent[];
  clients: Client[];
  now: number;
  /** האירוע עובר יחד עם הלקוח — כדי לנחות עליו (למשל המייל הזה ב«פעילות»). */
  onOpenClient?: (clientId: string, e: RowEvent) => void;
  empty: string;
  shown?: number;
  /** במקום נושא המייל — למשל איזו תזכורת (לחתום / לאשר בביטוח לאומי). */
  noteOf?: (e: RowEvent) => string | undefined;
}) {
  const [viewing, setViewing] = useState<EmailMessage | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [noCopy, setNoCopy] = useState<string | null>(null);
  async function view(m: EmailMessage) {
    setNoCopy(null);
    if (m.html) { setViewing(m); return; }
    setLoadingId(m.id);
    const html = await fetchEmailHtml(m.id);
    setLoadingId(null);
    if (html) setViewing({ ...m, html });
    else setNoCopy(m.id);
  }
  if (list.length === 0) return <p className="of-muted">{empty}</p>;
  return (
    <>
      <ul className="of-auto-runlist">
        {list.slice(0, shown).map(e => {
          const m = e.email;
          const c = e.clientId ? clients.find(x => x.id === e.clientId) : undefined;
          const who = c ? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() : '';
          const note = noteOf ? noteOf(e) : m?.subject ? `«${m.subject}»` : e.note;
          return (
            <li key={e.id}>
              <RunDot tone={e.tone} />
              <span className="of-auto-run-main">
                <span className="of-auto-run-label">{e.label}</span>
                {note && <span className="of-auto-run-note">{note}</span>}
                {m && noCopy === m.id && <span className="of-auto-run-note">אין עותק שמור של המייל הזה</span>}
              </span>
              <span className="of-auto-run-end">
                {who && e.clientId && onOpenClient
                  ? <button type="button" className="of-link" onClick={() => onOpenClient(e.clientId!, e)}
                      aria-label={`פתיחת ${who}`}>{who}</button>
                  : (who || m?.toEmail) ? <bdi className="of-ltr">{who || m?.toEmail}</bdi> : null}
                {!e.timeInLabel && <span className="of-auto-run-when">{fmtWhen(e.at, now)}</span>}
                {m && (
                  <button type="button" className="of-sent-btn" onClick={() => void view(m)} disabled={loadingId === m.id}>
                    {loadingId === m.id ? 'טוען…' : 'צפייה'}
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {viewing && <SentEmailViewer message={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}
