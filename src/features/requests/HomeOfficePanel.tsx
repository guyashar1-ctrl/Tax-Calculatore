// ─── עבודה מהבית — הבדיקה והאישור במשרד (220) ──────────────────────────────
import './requestGroups.css';
// ‼ שלושה מספרים נפרדים, תמיד: היחס המחושב מהתשובות, ההצעה בתקרת המשרד (25%),
// והאחוז שהמשרד אישר. ועוד אישור רביעי ונפרד: «הוזן בפייפרלס». אף אחד לא נגזר
// בשקט מהאחר, ותשובה מקורית לא נכתבת מחדש.
// אותו רכיב בבקשת «פרטי העסק» ובתיק המס — מקום אחד לאישור.
import { useState } from 'react';
import HomeOfficeForm from './HomeOfficeForm';
import {
  deriveHomeOffice, formatPercent, homeOfficeLine, answersSourceText, HOME_OFFICE_CAP_PERCENT,
  type HomeOfficeHistory, type ValidHomeOffice,
} from './homeOffice';
import { approveHomeOffice, confirmHomeOfficeInPaperless, saveHomeOfficeAnswers } from './api';

const dateIL = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
};
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export interface HomeOfficePanelProps {
  clientId: string;
  clientFirstName: string;
  history: HomeOfficeHistory | null;
  loading?: boolean;
  /** קריאה שנכשלה — לא «אין נתונים». */
  loadError?: string | null;
  onReload?: () => void;
  /** אחרי פעולה — ההיסטוריה העדכנית מהשרת, ושהבקשות ירעננו (המצב שלהן נגזר בשרת). */
  onUpdated: (h: HomeOfficeHistory) => void;
}

export default function HomeOfficePanel({ clientId, clientFirstName, history, loading, loadError, onReload, onUpdated }: HomeOfficePanelProps) {
  const st = deriveHomeOffice(history);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ValidHomeOffice | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<'save' | 'approve' | 'paperless' | null>(null);
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null);
  const [approving, setApproving] = useState(false);
  const [pct, setPct] = useState('');
  const [from, setFrom] = useState(todayIso());
  const [note, setNote] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  if (loadError) {
    return (
      <div className="ho-panel">
        <p className="ho-err" role="alert">לא הצלחנו לקרוא את פרטי העבודה מהבית: {loadError}</p>
        {onReload && <button type="button" className="btn btn-sm btn-ghost" onClick={onReload}>לנסות שוב</button>}
      </div>
    );
  }
  if (!history) return <div className="ho-panel"><p className="ho-muted">{loading ? 'טוען…' : 'אין נתונים'}</p></div>;

  const latest = st.latest;
  const openApprove = (preset: number | null) => {
    setPct(preset === null ? '' : String(preset));
    setFrom(todayIso());
    setNote('');
    setApproving(true);
    setMsg(null);
  };

  async function save() {
    setTried(true);
    if (!draft) return;
    setBusy('save'); setMsg(null);
    const r = await saveHomeOfficeAnswers(clientId, draft);
    setBusy(null);
    if (!r.ok) { setMsg({ text: r.message, err: true }); return; }
    onUpdated({ answers: r.answers, approvals: r.approvals });
    setEditing(false); setTried(false);
    setMsg({ text: st.current ? 'התשובות עודכנו. האישור הקודם נשמר בהיסטוריה וממתין לבדיקה מחדש.' : 'התשובות נשמרו.', err: false });
  }

  async function approve() {
    if (!latest) return;
    const n = Number(pct.trim().replace(',', '.'));
    if (pct.trim() === '' || !Number.isFinite(n)) { setMsg({ text: 'צריך אחוז בין 0 ל-25.', err: true }); return; }
    setBusy('approve'); setMsg(null);
    const r = await approveHomeOffice(clientId, latest.id, n, from, note);
    setBusy(null);
    if (!r.ok) {
      setMsg({ text: r.message, err: true });
      if (r.answers && r.approvals) onUpdated({ answers: r.answers, approvals: r.approvals });
      return;
    }
    onUpdated({ answers: r.answers, approvals: r.approvals });
    setApproving(false);
    setMsg({ text: `אושר ${formatPercent(n)}. בפייפרלס עוד לא עודכן — לסמן כשתזין אותו שם.`, err: false });
  }

  async function markPaperless() {
    if (!st.current) return;
    setBusy('paperless'); setMsg(null);
    const r = await confirmHomeOfficeInPaperless(st.current.id);
    setBusy(null);
    if (!r.ok) {
      setMsg({ text: r.message, err: true });
      if (r.answers && r.approvals) onUpdated({ answers: r.answers, approvals: r.approvals });
      return;
    }
    onUpdated({ answers: r.answers, approvals: r.approvals });
    setMsg({ text: 'סומן שהאחוז הוזן בפייפרלס.', err: false });
  }

  const canApprove = st.phase === 'awaitingApproval' || st.phase === 'stale';
  const lastAppr = st.lastApproval;

  return (
    <div className="ho-panel" data-phase={st.phase}>
      <div className="ho-state">{homeOfficeLine(st)}</div>

      {latest && (
        <dl className="ho-facts">
          <div><dt>התשובות</dt><dd>
            {latest.has_dedicated_room
              ? `יש חדר שמשמש רק לעסק · ${latest.business_rooms} מתוך ${latest.total_rooms} חדרים`
              : 'אין חדר שמשמש רק לעסק'}
          </dd></div>
          <div><dt>מקור</dt><dd>{answersSourceText(latest)} · {dateIL(latest.created_at)}</dd></div>
          {latest.note && <div><dt>הערה</dt><dd className="ho-quote">{latest.note}</dd></div>}
          {latest.has_dedicated_room && (
            <div><dt>יחס מחושב</dt><dd>
              {formatPercent(st.ratio)}
              {st.aboveCap
                ? <> · <span className="ho-cap">מעל תקרת המשרד ({HOME_OFFICE_CAP_PERCENT}%) — הצעה: {formatPercent(st.proposed)}</span></>
                : <> · הצעה: {formatPercent(st.proposed)}</>}
            </dd></div>
          )}
          {lastAppr && (
            <div><dt>אושר</dt><dd>
              {formatPercent(lastAppr.approved_percent)} מ-{dateIL(lastAppr.effective_from)}
              {' · '}{dateIL(lastAppr.approved_at)}
              {st.phase === 'stale' && <span className="ho-stale"> · לתשובות קודמות</span>}
              {lastAppr.note && <span className="ho-muted"> · {lastAppr.note}</span>}
            </dd></div>
          )}
          {lastAppr && (
            <div><dt>בפייפרלס</dt><dd>
              {st.paperless === 'entered' ? `הוזן · ${dateIL(st.current?.paperless_entered_at)}`
                : st.paperless === 'stale' ? <span className="ho-stale">הוזן אחוז קודם — לא עדכני</span>
                : st.paperless === 'pending' ? 'טרם סומן שהוזן' : '—'}
            </dd></div>
          )}
        </dl>
      )}

      {st.aboveCap && canApprove && (
        <p className="ho-note">היחס לפי החדרים גבוה מ-{HOME_OFFICE_CAP_PERCENT}%. התשובה של {clientFirstName} נשמרת כמו שהיא; האחוז המאושר לא יעלה על התקרה.</p>
      )}
      {st.phase === 'stale' && (
        <p className="ho-note">התשובות השתנו אחרי האישור. האישור הקודם נשמר בהיסטוריה, אבל אינו עדכני עד שתאשר מחדש.</p>
      )}

      {approving && latest ? (
        <div className="ho-approve">
          <div className="ho-pair">
            <label className="ho-field">
              <span className="ho-label">אחוז מאושר (עד {HOME_OFFICE_CAP_PERCENT}%)</span>
              <input type="text" inputMode="decimal" dir="ltr" value={pct} disabled={busy !== null}
                onChange={e => setPct(e.target.value)} aria-label="אחוז מאושר" />
            </label>
            <label className="ho-field">
              <span className="ho-label">חל מתאריך</span>
              <input type="date" value={from} disabled={busy !== null} onChange={e => setFrom(e.target.value)} />
            </label>
          </div>
          <label className="ho-field">
            <span className="ho-label">הערה <span className="ho-opt">(לא חובה)</span></span>
            <input type="text" value={note} disabled={busy !== null} maxLength={1000} onChange={e => setNote(e.target.value)}
              placeholder="למשל: חדר קטן מהממוצע" />
          </label>
          <div className="ho-acts">
            <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => void approve()}>
              {busy === 'approve' ? 'שומר…' : 'אישור האחוז'}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy !== null} onClick={() => setApproving(false)}>ביטול</button>
          </div>
        </div>
      ) : editing ? (
        <div className="ho-approve">
          <HomeOfficeForm audience="office" initial={latest ? {
            hasDedicatedRoom: latest.has_dedicated_room, totalRooms: latest.total_rooms, businessRooms: latest.business_rooms, note: latest.note,
          } : null} disabled={busy !== null} onChange={setDraft} showErrors={tried} />
          <div className="ho-acts">
            <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => void save()}>
              {busy === 'save' ? 'שומר…' : 'שמירת התשובות'}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy !== null}
              onClick={() => { setEditing(false); setTried(false); }}>ביטול</button>
          </div>
        </div>
      ) : (
        <div className="ho-acts">
          {canApprove && (
            <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null}
              onClick={() => openApprove(st.proposed)}>בדיקה ואישור האחוז</button>
          )}
          {st.phase === 'approved' && st.paperless === 'pending' && (
            <button type="button" className="btn btn-sm btn-secondary" disabled={busy !== null} onClick={() => void markPaperless()}
              title="אישור ידני של המשרד — אין בדיקה מול פייפרלס">
              {busy === 'paperless' ? 'שומר…' : 'סמנתי: הוזן בפייפרלס'}
            </button>
          )}
          {st.phase === 'noRoom' && (
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy !== null} onClick={() => openApprove(0)}>
              אישור 0% (אין חדר בלעדי)
            </button>
          )}
          <button type="button" className="btn btn-sm btn-ghost" disabled={busy !== null}
            onClick={() => { setEditing(true); setDraft(null); setMsg(null); }}>
            {latest ? 'תיקון התשובות' : 'מילוי במקום הלקוח'}
          </button>
          {(history.answers.length > 1 || history.approvals.length > 0) && (
            <button type="button" className="ui-linkbtn ho-hist-btn" aria-expanded={showHistory}
              onClick={() => setShowHistory(v => !v)}>{showHistory ? 'הסתרת ההיסטוריה' : 'היסטוריה'}</button>
          )}
        </div>
      )}

      {msg && <p className={msg.err ? 'ho-err' : 'ho-ok'} role={msg.err ? 'alert' : 'status'}>{msg.text}</p>}

      {showHistory && (
        <ul className="ho-history">
          {[
            ...history.answers.map(a => ({ at: a.created_at, text: `${answersSourceText(a)}: ${a.has_dedicated_room ? `${a.business_rooms} מתוך ${a.total_rooms} חדרים (${formatPercent(a.ratio_percent)})` : 'אין חדר בלעדי'}${a.note ? ` · «${a.note}»` : ''}` })),
            ...history.approvals.map(x => ({ at: x.approved_at, text: `המשרד אישר ${formatPercent(x.approved_percent)} מ-${dateIL(x.effective_from)}${x.paperless_entered_at ? ` · הוזן בפייפרלס ${dateIL(x.paperless_entered_at)}` : ''}` })),
          ].sort((a, b) => b.at.localeCompare(a.at)).map((h, i) => (
            <li key={i}><span className="ho-muted">{dateIL(h.at)}</span> {h.text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
