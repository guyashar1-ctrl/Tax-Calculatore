// ─── משימות — שלושה דליים ────────────────────────────────────────────────
// מקור UX מחייב: docs/prototypes/tasks-v3-final.html. שלושה דליים קבועים:
// לטיפולי (רשימה שטוחה אחת, בלי חדש/בתהליך — סדר ידני + הצמדת תאריך שהגיע),
// ממתין לאחרים (תצוגה נגזרת בלבד — לא נשמרת בטבלה נפרדת), הושלמו.
// ‼ קליטות אינן משימות רגילות: שורה אחת נגזרת ללקוח (לא נשמרת), ראה
// utils/onboardingNext.ts — כדי שהתקדמות בקליטה לא תיצור עשרות משימות.

import { useMemo, useState } from 'react';
import type { Task, Client } from '../types';
import { BALL_WITH_LABELS, BALL_WITH_COLOR } from '../types';
import type { OnboardingStep } from '../types/onboarding';
import { STEP_TYPE_LABELS } from '../types/onboarding';
import { summarizeClientOnboarding, NEXT_ACTION, type ClientOnboardingSummary } from '../utils/onboardingNext';
import type { Quotation } from '../types/quotations';
import { formatDueDate, daysLate } from '../utils/taskUtils';
import { relativeTime } from '../utils/clientDerived';
import { useDocumentStore, type DocumentLabel } from '../hooks/useDocumentStore';
import { AVAILABLE_YEARS } from '../data/taxData';
import { supabase } from '../lib/supabase';
import { EmptyState } from './ui/States';

interface Props {
  tasks: Task[];
  clients: Client[];
  onSelectTask: (id: string) => void;
  onAddTask: (presetClientId?: string) => void;
  onToggleDone: (id: string) => void;
  onDeleteTask?: (id: string) => void;
  onReorderOpen: (id: string, beforeId: string | null) => void;
  onSelectClient: (id: string) => void;
  onboardingSteps: OnboardingStep[];
  onOpenOnboarding: (clientId: string) => void;
  quotations: Quotation[];
  onOpenQuotation?: (id: string) => void;
  /** הכנת מייל תזכורת לשלב תקוע. חסר ⇒ הכפתור לא מוצג. */
  onRemindStep?: (step: OnboardingStep, clientId: string) => void;
  onLoadSampleTasks?: () => void;
}

type BucketKey = 'mine' | 'waiting' | 'done';

function clientName(c?: Client): string {
  if (!c) return 'לקוח ללא שם';
  return `${c.firstName} ${c.lastName}`.trim() || 'לקוח ללא שם';
}

function dueRank(t: Task): 0 | 1 | 2 {
  if (!t.dueDate) return 2;
  const late = daysLate(t.dueDate) > 0;
  if (late) return 0;
  const today = new Date().toISOString().slice(0, 10);
  return t.dueDate === today ? 1 : 2;
}

/** לטיפולי הוא רשימה שטוחה אחת: תאריך שהגיע קופץ למעלה, אבל לא הורס את
 * הסדר הידני מתחתיו — ברגע שהתאריך חולף להיות רלוונטי, הסדר הישן חוזר. */
function orderedOpenTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const r = dueRank(a) - dueRank(b);
    if (r !== 0) return r;
    if (a.sortOrder !== undefined && b.sortOrder !== undefined && a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    if (a.sortOrder !== undefined && b.sortOrder === undefined) return -1;
    if (a.sortOrder === undefined && b.sortOrder !== undefined) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

function journeyLine(sum: ClientOnboardingSummary): string {
  if (sum.bucket === 'stuck' && sum.stuck) {
    const name = STEP_TYPE_LABELS[sum.stuck.stepType];
    if (sum.stuck.status === 'blocked') return `${name} — חסום`;
    if (sum.stuck.status === 'failed') return `${name} — נכשל`;
    return `${name} — דורש תשומת לב`;
  }
  if (sum.next) return NEXT_ACTION[sum.next.stepType];
  return 'הכול סגור';
}

export default function TasksWorkspace({
  tasks, clients, onSelectTask, onAddTask, onToggleDone, onDeleteTask,
  onReorderOpen, onSelectClient, onboardingSteps, onOpenOnboarding, quotations, onOpenQuotation,
  onRemindStep, onLoadSampleTasks,
}: Props) {
  const db = useDocumentStore();
  const [bucket, setBucket] = useState<BucketKey>('mine');
  const [search, setSearch] = useState('');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const [reqModal, setReqModal] = useState<{ clientId: string; title: string; year: string; labelId: string } | null>(null);
  const [reqLabels, setReqLabels] = useState<DocumentLabel[]>([]);
  const [reqBusy, setReqBusy] = useState(false);

  const clientMap = useMemo(() => {
    const m = new Map<string, Client>();
    clients.forEach(c => m.set(c.id, c));
    return m;
  }, [clients]);

  const knownClientIds = useMemo(() => new Set(clients.map(c => c.id)), [clients]);
  const summaries = useMemo(
    () => summarizeClientOnboarding(onboardingSteps).filter(s => knownClientIds.has(s.clientId)),
    [onboardingSteps, knownClientIds]
  );
  const journeyMine = useMemo(() => summaries.filter(s => s.bucket === 'stuck' || s.bucket === 'mine'), [summaries]);
  const journeyWaiting = useMemo(() => summaries.filter(s => s.bucket === 'others'), [summaries]);
  const waitingQuotations = useMemo(
    () => quotations.filter(q => q.clientId && (q.status === 'sent' || q.status === 'viewed')),
    [quotations]
  );

  const openTasks = useMemo(() => tasks.filter(t => t.status === 'open'), [tasks]);
  const doneTasks = useMemo(
    () => [...tasks.filter(t => t.status === 'done')]
      .sort((a, b) => (b.completedAt || b.updatedAt || '').localeCompare(a.completedAt || a.updatedAt || '')),
    [tasks]
  );

  const q = search.trim().toLowerCase();
  const matches = (t: Task) => {
    if (!q) return true;
    const c = clientMap.get(t.clientId);
    return t.title.toLowerCase().includes(q) || (c && clientName(c).toLowerCase().includes(q));
  };

  const orderedOpen = useMemo(() => orderedOpenTasks(openTasks).filter(matches), [openTasks, q, clientMap]);
  const doneFiltered = useMemo(() => doneTasks.filter(matches), [doneTasks, q, clientMap]);

  async function openRequestModal(presetClientId?: string) {
    setAddMenuOpen(false);
    const labels = await db.getLabels();
    setReqLabels(labels);
    const reserved = labels.find(l => l.isReserved);
    setReqModal({ clientId: presetClientId ?? '', title: '', year: String(new Date().getFullYear()), labelId: reserved?.id ?? '' });
  }

  async function confirmRequest() {
    if (!reqModal || !reqModal.clientId || !reqModal.title.trim() || !reqModal.year || !reqModal.labelId) return;
    setReqBusy(true);
    try {
      await supabase.rpc('create_onboarding_request', {
        p_client_id: reqModal.clientId,
        p_step_type: 'custom_request',
        p_payload: {
          title: reqModal.title.trim(),
          clientTitle: reqModal.title.trim(),
          documentYear: reqModal.year,
          documentLabelId: reqModal.labelId,
          requirements: [{ key: 'doc', kind: 'file', label: reqModal.title.trim(), done: false }],
        },
        p_due_date: null,
        p_depends_on: null,
        p_published: false,
        p_required_for_close: false,
        p_owner: 'client',
        p_stage_id: null,
      });
      setReqModal(null);
    } finally {
      setReqBusy(false);
    }
  }

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) { setDraggedId(null); return; }
    const idx = orderedOpen.findIndex(t => t.id === targetId);
    const beforeId = idx === -1 ? null : orderedOpen[idx].id;
    onReorderOpen(draggedId, beforeId);
    setDraggedId(null);
  }
  function moveBy(id: string, dir: -1 | 1) {
    const idx = orderedOpen.findIndex(t => t.id === id);
    if (idx === -1) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= orderedOpen.length) return;
    const beforeId = dir === -1 ? orderedOpen[targetIdx].id : (orderedOpen[targetIdx + 1]?.id ?? null);
    onReorderOpen(id, beforeId);
  }

  const totalCount = tasks.length;

  if (totalCount === 0 && summaries.length === 0) {
    return (
      <div className="tasks-page">
        <EmptyState
          headline="עוד אין משימות"
          sentence="משימה קושרת אותך ללקוח ומסמנת אצל מי הכדור — אצלך, אצלו, או אצל הרשות."
          action={{ label: '+ משימה חדשה', onClick: () => onAddTask() }}
          quietLink={onLoadSampleTasks ? { label: 'טען משימות לדוגמה', onClick: onLoadSampleTasks } : undefined}
        />
      </div>
    );
  }

  return (
    <div className="tasks-page">
      <div className="pg-head">
        <div className="pg-head-main">
          <div className="pg-title">משימות</div>
          <div className="pg-status">{openTasks.length} לטיפולי</div>
        </div>
        <div className="pg-actions" style={{ position: 'relative' }}>
          <button type="button" className="ui-btn ui-btn-primary" onClick={() => setAddMenuOpen(o => !o)}>+ חדש ▾</button>
          {addMenuOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setAddMenuOpen(false)} />
              <div className="ial-doc-menu" style={{ zIndex: 11 }}>
                <button type="button" onClick={() => { setAddMenuOpen(false); onAddTask(); }}>משימה</button>
                <button type="button" onClick={() => openRequestModal()}>בקשת מסמכים</button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="board-filters">
        <div className="board-search-wrap">
          <input
            type="text"
            placeholder="חיפוש משימה, לקוח…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="tasks-search"
            aria-label="חיפוש משימות"
          />
        </div>
      </div>

      <div className="filter-chips" role="tablist" style={{ margin: '.6rem 0' }}>
        <button type="button" className={`btn btn-sm ${bucket === 'mine' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setBucket('mine')}>
          לטיפולי {openTasks.length + journeyMine.length ? `(${openTasks.length + journeyMine.length})` : ''}
        </button>
        <button type="button" className={`btn btn-sm ${bucket === 'waiting' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setBucket('waiting')}>
          ממתין לאחרים {journeyWaiting.length + waitingQuotations.length ? `(${journeyWaiting.length + waitingQuotations.length})` : ''}
        </button>
        <button type="button" className={`btn btn-sm ${bucket === 'done' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setBucket('done')}>
          הושלמו {doneTasks.length ? `(${doneTasks.length})` : ''}
        </button>
      </div>

      {bucket === 'mine' && (
        <div>
          {journeyMine.length > 0 && (
            <div className="cw-section" style={{ marginBottom: '.8rem' }}>
              <div className="cw-section-head"><span>קליטות בתהליך</span></div>
              {journeyMine.map(sum => (
                <div key={sum.clientId} className="cw-kv-row" style={{ cursor: 'pointer' }} onClick={() => onOpenOnboarding(sum.clientId)}>
                  <strong>{clientName(clientMap.get(sum.clientId))}</strong>
                  <span style={{ flex: 1, color: sum.bucket === 'stuck' ? 'var(--err)' : 'var(--ink-2)', fontWeight: sum.bucket === 'stuck' ? 600 : undefined }}>
                    {journeyLine(sum)}
                  </span>
                  <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>{sum.done}/{sum.total}</span>
                  {sum.bucket === 'stuck' && onRemindStep && sum.stuck && sum.stuck.ball !== 'me' && (
                    <button type="button" className="btn btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); onRemindStep(sum.stuck!, sum.clientId); }}>
                      הכן תזכורת
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {orderedOpen.length === 0 ? (
            <EmptyState headline="אין משימות פתוחות" sentence={search.trim() ? `לא נמצאה משימה שתואמת ל״${search.trim()}״.` : undefined} />
          ) : (
            <div className="cw-section">
              {orderedOpen.map(t => {
                const c = clientMap.get(t.clientId);
                const late = t.dueDate ? daysLate(t.dueDate) > 0 : false;
                return (
                  <div
                    key={t.id}
                    className="cw-kv-row"
                    draggable
                    onDragStart={() => setDraggedId(t.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(t.id)}
                    style={{ gap: '.5rem', alignItems: 'center' }}
                  >
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      <button type="button" className="ui-linkbtn" style={{ fontSize: 'var(--fs-12)', padding: 0, lineHeight: 1 }} onClick={() => moveBy(t.id, -1)} aria-label="הזז למעלה">▲</button>
                      <button type="button" className="ui-linkbtn" style={{ fontSize: 'var(--fs-12)', padding: 0, lineHeight: 1 }} onClick={() => moveBy(t.id, 1)} aria-label="הזז למטה">▼</button>
                    </span>
                    <input type="checkbox" checked={false} onChange={() => onToggleDone(t.id)} aria-label="סמן כהושלם" />
                    <span style={{ flex: 1, cursor: 'pointer' }} onClick={() => onSelectTask(t.id)}>
                      <div style={{ fontWeight: 600 }}>{t.title || 'ללא כותרת'}</div>
                      <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
                        {t.clientId === 'system' ? 'כללי' : clientName(c)}
                        {c && (
                          <button type="button" className="ui-linkbtn" style={{ marginInlineStart: '.4rem' }} onClick={(e) => { e.stopPropagation(); onSelectClient(t.clientId); }}>לתיק ←</button>
                        )}
                      </div>
                    </span>
                    <span style={{ fontSize: 'var(--fs-12)', color: BALL_WITH_COLOR[t.ballWith] }}>{BALL_WITH_LABELS[t.ballWith]}</span>
                    {t.dueDate && (
                      <span style={{ fontSize: 'var(--fs-12)', color: late ? 'var(--err)' : 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                        {formatDueDate(t.dueDate)}
                      </span>
                    )}
                    {onDeleteTask && (
                      <button type="button" className="ui-icon-btn" onClick={() => onDeleteTask(t.id)} aria-label="מחיקה">✕</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {bucket === 'waiting' && (
        <div className="cw-section">
          {journeyWaiting.length === 0 && waitingQuotations.length === 0 ? (
            <EmptyState headline="אין מה שממתין כרגע" sentence="פריטים שהכדור שלהם אצל הלקוח, רשות, או ממתינים לאישור — יופיעו כאן." />
          ) : (
            <>
              {journeyWaiting.map(sum => (
                <div key={sum.clientId} className="cw-kv-row" style={{ cursor: 'pointer' }} onClick={() => onOpenOnboarding(sum.clientId)}>
                  <strong>{clientName(clientMap.get(sum.clientId))}</strong>
                  <span style={{ flex: 1, color: 'var(--ink-3)' }}>{sum.next ? STEP_TYPE_LABELS[sum.next.stepType] : '—'}</span>
                  <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>{sum.done}/{sum.total}</span>
                </div>
              ))}
              {waitingQuotations.map(qt => (
                <div key={qt.id} className="cw-kv-row" style={{ cursor: 'pointer' }}
                  onClick={() => (onOpenQuotation ? onOpenQuotation(qt.id) : qt.clientId && onSelectClient(qt.clientId))}>
                  <strong>{clientName(clientMap.get(qt.clientId ?? ''))}</strong>
                  <span style={{ flex: 1, color: 'var(--ink-3)' }}>ממתין לאישור הצעת מחיר {qt.quotationNumber ? `#${qt.quotationNumber}` : ''}</span>
                  <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>{qt.sentAt ? relativeTime(qt.sentAt) : ''}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {bucket === 'done' && (
        <div className="cw-section">
          {doneFiltered.length === 0 ? (
            <EmptyState headline="אין משימות שהושלמו" />
          ) : (
            doneFiltered.map(t => {
              const c = clientMap.get(t.clientId);
              return (
                <div key={t.id} className="cw-kv-row" style={{ opacity: .75 }}>
                  <span style={{ flex: 1, cursor: 'pointer' }} onClick={() => onSelectTask(t.id)}>
                    <div style={{ fontWeight: 600, textDecoration: 'line-through' }}>{t.title || 'ללא כותרת'}</div>
                    <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>{t.clientId === 'system' ? 'כללי' : clientName(c)}</div>
                  </span>
                  <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>{t.completedAt ? relativeTime(t.completedAt) : ''}</span>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => onToggleDone(t.id)}>פתח מחדש</button>
                </div>
              );
            })
          )}
        </div>
      )}

      {reqModal && (
        <div className="modal-backdrop" onClick={() => !reqBusy && setReqModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>בקשת מסמכים מהלקוח</h3>
            <div className="csub">קיצור דרך לבקשת לקוח רגילה — טיוטה, לא נשלחת אוטומטית.</div>
            <label className="lbl required">לקוח</label>
            <select className="inp" value={reqModal.clientId} onChange={e => setReqModal({ ...reqModal, clientId: e.target.value })}>
              <option value="">— בחר —</option>
              {[...clients].sort((a, b) => clientName(a).localeCompare(clientName(b), 'he')).map(c => (
                <option key={c.id} value={c.id}>{clientName(c)}</option>
              ))}
            </select>
            <label className="lbl required">מה לבקש?</label>
            <input className="inp" value={reqModal.title} onChange={e => setReqModal({ ...reqModal, title: e.target.value })} />
            <label className="lbl">שנה למסמך שיתקבל</label>
            <select className="inp" value={reqModal.year} onChange={e => setReqModal({ ...reqModal, year: e.target.value })}>
              {['כללי', ...AVAILABLE_YEARS.map(String)].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <label className="lbl">תווית למסמך שיתקבל</label>
            <select className="inp" value={reqModal.labelId} onChange={e => setReqModal({ ...reqModal, labelId: e.target.value })}>
              <option value="">בחר תווית…</option>
              {reqLabels.filter(l => !l.isReserved).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <div className="foot">
              <button type="button" className="btn btn-primary" disabled={reqBusy || !reqModal.clientId || !reqModal.title.trim() || !reqModal.labelId}
                onClick={confirmRequest}>{reqBusy ? 'יוצר…' : 'צור בקשה'}</button>
              <button type="button" className="btn" onClick={() => setReqModal(null)} disabled={reqBusy}>ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
