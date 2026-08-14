// ─── משימות — שלושה דליים ────────────────────────────────────────────────
// מקור UX מחייב: docs/prototypes/tasks-v3-final.html. שלושה דליים קבועים:
// לטיפולי (רשימה שטוחה אחת, בלי חדש/בתהליך — סדר ידני + הצמדת תאריך שהגיע),
// ממתין לאחרים (תצוגה נגזרת בלבד — לא נשמרת בטבלה נפרדת), הושלמו.
// ‼ קליטות אינן משימות רגילות: שורה אחת נגזרת ללקוח (לא נשמרת), ראה
// utils/onboardingNext.ts — כדי שהתקדמות בקליטה לא תיצור עשרות משימות.

import { useMemo, useState } from 'react';
import type { Task, Client } from '../types';
import { TASK_CATEGORY_LABELS } from '../types';
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
  onReorderOpen: (id: string, beforeId: string | null) => void;
  onSelectClient: (id: string) => void;
  onboardingSteps: OnboardingStep[];
  onOpenOnboarding: (clientId: string) => void;
  quotations: Quotation[];
  onOpenQuotation?: (id: string) => void;
  onLoadSampleTasks?: () => void;
}

// ‼ אין כאן onToggleDone/onDeleteTask/onRemindStep בכוונה. ברפרנס השורה היא
// טקסט בלבד — סימון בוצע, מחיקה והכנת תזכורת חיים במגירה שנפתחת בלחיצה
// (אצלנו: מודל המשימה, ולשונית הקליטה). שורה שנושאת צ'קבוקס וכפתור מחיקה
// הופכת רשימה שקטה לטבלה, וזה בדיוק מה שהמקור נמנע ממנו.

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
  tasks, clients, onSelectTask, onAddTask,
  onReorderOpen, onSelectClient, onboardingSteps, onOpenOnboarding, quotations, onOpenQuotation,
  onLoadSampleTasks,
}: Props) {
  const db = useDocumentStore();
  const [bucket, setBucket] = useState<BucketKey>('mine');
  const [search, setSearch] = useState('');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const [reqModal, setReqModal] = useState<{ clientId: string; title: string; year: string; labelId: string } | null>(null);
  const [reqLabels, setReqLabels] = useState<DocumentLabel[]>([]);
  const [reqBusy, setReqBusy] = useState(false);
  const [reqError, setReqError] = useState('');

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
    setReqError('');
    try {
      const { data, error } = await supabase.rpc('create_onboarding_request', {
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
      // ‼ ה-RPC מחזיר {ok:false,error} בלי לזרוק — בלי הבדיקה המודל נסגר
      // כאילו הבקשה נוצרה, והיא לעולם לא הייתה מגיעה ללקוח.
      const res = data as { ok?: boolean; error?: string } | null;
      if (error || !res?.ok) {
        setReqError(error?.message ?? res?.error ?? 'יצירת הבקשה נכשלה.');
        return;
      }
      setReqModal(null);
    } catch (e) {
      setReqError(e instanceof Error ? e.message : 'יצירת הבקשה נכשלה.');
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

  const mineCount = orderedOpen.length + journeyMine.length;
  const waitingCount = journeyWaiting.length + waitingQuotations.length;

  /** שורה במבנה הרפרנס: ידית · (כותרת+תג / לקוח·תווית / מה הלאה) · זנב. */
  function Row({ id, title, pill, meta, next, onOpen, draggable: drag }: {
    id: string; title: string; pill?: { text: string; tone: 'late' | 'today' | 'wait' | 'done' };
    meta: string; next?: React.ReactNode; onOpen: () => void; draggable?: boolean;
  }) {
    return (
      <div
        className="tw-row"
        onClick={onOpen}
        draggable={drag}
        onDragStart={drag ? () => setDraggedId(id) : undefined}
        onDragOver={drag ? (e) => e.preventDefault() : undefined}
        onDrop={drag ? () => handleDrop(id) : undefined}
      >
        <div className="tw-grip" aria-hidden="true">{drag ? '⋮⋮' : ''}</div>
        <div>
          <div className="tw-title">
            {title}
            {pill && <span className={`tw-pill is-${pill.tone}`}>{pill.text}</span>}
          </div>
          <div className="tw-meta">{meta}</div>
          {next && <div className="tw-next">{next}</div>}
        </div>
        <div className="tw-tail">
          {drag && (
            <div className="tw-movers">
              <button type="button" aria-label="הקדם" onClick={(e) => { e.stopPropagation(); moveBy(id, -1); }}>▲</button>
              <button type="button" aria-label="אחר" onClick={(e) => { e.stopPropagation(); moveBy(id, 1); }}>▼</button>
            </div>
          )}
          <span className="tw-chev" aria-hidden="true">‹</span>
        </div>
      </div>
    );
  }

  return (
    <div className="tasks-page tw-wrap">
      <div className="tw-head">
        <div>
          <div className="pg-title">משימות</div>
          <div className="tw-sub">מה דורש ממני טיפול, ומה עדיין מחכה לאחרים.</div>
        </div>
        <div className="tw-head-btn">
          <button type="button" className="ui-btn ui-btn-primary" onClick={() => setAddMenuOpen(true)}>+ חדש</button>
        </div>
      </div>

      <div className="tw-views" role="tablist">
        {([
          { k: 'mine' as const, label: 'לטיפולי', n: mineCount },
          { k: 'waiting' as const, label: 'ממתין לאחרים', n: waitingCount },
          { k: 'done' as const, label: 'הושלמו', n: doneFiltered.length },
        ]).map(v => (
          <button key={v.k} type="button" role="tab" aria-selected={bucket === v.k}
            className={`tw-view ${bucket === v.k ? 'is-on' : ''}`} onClick={() => setBucket(v.k)}>
            {v.label}<span className="tw-vcount">{v.n}</span>
          </button>
        ))}
      </div>

      <div className="tw-tools">
        <input
          type="text"
          placeholder="חפש משימה או לקוח…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="tw-search inp"
          aria-label="חיפוש משימות"
        />
      </div>

      {bucket === 'mine' && (
        <>
          <div className="cw-section tw-list">
            {mineCount === 0 ? (
              <EmptyState headline="אין משימות פתוחות" sentence={search.trim() ? `לא נמצאה משימה שתואמת ל״${search.trim()}״.` : undefined} />
            ) : (
              <>
                {/* ‼ שורה נגזרת אחת לכל קליטה — לא משימה שמורה, ולכן אינה נגררת. */}
                {journeyMine.map(sum => (
                  <Row
                    key={`j-${sum.clientId}`}
                    id={`j-${sum.clientId}`}
                    title={`קליטת ${clientName(clientMap.get(sum.clientId))}`}
                    pill={sum.bucket === 'stuck' ? { text: 'תקוע', tone: 'late' } : undefined}
                    meta={`${clientName(clientMap.get(sum.clientId))} · קליטה`}
                    next={<>עכשיו: {journeyLine(sum)} · {sum.done} מתוך {sum.total} הושלמו</>}
                    onOpen={() => onOpenOnboarding(sum.clientId)}
                  />
                ))}
                {orderedOpen.map(t => {
                  const c = clientMap.get(t.clientId);
                  const rank = dueRank(t);
                  return (
                    <Row
                      key={t.id}
                      id={t.id}
                      draggable
                      title={t.title || 'ללא כותרת'}
                      pill={rank === 0 ? { text: 'באיחור', tone: 'late' } : rank === 1 ? { text: 'היום', tone: 'today' } : undefined}
                      meta={`${t.clientId === 'system' ? 'כללי' : clientName(c)} · ${TASK_CATEGORY_LABELS[t.category]}`}
                      next={t.dueDate ? <>יעד: {formatDueDate(t.dueDate)}</> : undefined}
                      onOpen={() => onSelectTask(t.id)}
                    />
                  );
                })}
              </>
            )}
          </div>
          <div className="tw-hint">
            אפשר לגרור כדי לקבוע סדר — מה שלמעלה הוא מה שבחרת לקדם. תאריך שהגיע קופץ לראש מעצמו.
          </div>
        </>
      )}

      {bucket === 'waiting' && (
        <>
          <div className="cw-section tw-list">
            {waitingCount === 0 ? (
              <EmptyState headline="אין מה שממתין כרגע" sentence="פריטים שהכדור שלהם אצל הלקוח, רשות, או ממתינים לאישור — יופיעו כאן." />
            ) : (
              <>
                {journeyWaiting.map(sum => (
                  <Row
                    key={sum.clientId}
                    id={sum.clientId}
                    title={sum.next ? STEP_TYPE_LABELS[sum.next.stepType] : 'קליטה בהמתנה'}
                    pill={{ text: 'ממתין ללקוח', tone: 'wait' }}
                    meta={`${clientName(clientMap.get(sum.clientId))} · קליטה`}
                    next={<>{sum.done} מתוך {sum.total} הושלמו</>}
                    onOpen={() => onOpenOnboarding(sum.clientId)}
                  />
                ))}
                {waitingQuotations.map(qt => (
                  <Row
                    key={qt.id}
                    id={qt.id}
                    title={`הצעת מחיר ${qt.quotationNumber ? `#${qt.quotationNumber}` : ''}`.trim()}
                    pill={{ text: 'ממתין לאישור', tone: 'wait' }}
                    meta={`${clientName(clientMap.get(qt.clientId ?? ''))} · מסחרי`}
                    next={qt.sentAt ? <>נשלחה {relativeTime(qt.sentAt)}</> : undefined}
                    onOpen={() => (onOpenQuotation ? onOpenQuotation(qt.id) : qt.clientId && onSelectClient(qt.clientId))}
                  />
                ))}
              </>
            )}
          </div>
          <div className="tw-hint">
            אלה אינם על השולחן שלך — הם נגזרים ממה שכבר נשלח וממתין לתשובה. אין מה לעשות בהם עד שיחזור משהו.
          </div>
        </>
      )}

      {bucket === 'done' && (
        <div className="cw-section tw-list">
          {doneFiltered.length === 0 ? (
            <EmptyState headline="אין משימות שהושלמו" />
          ) : (
            doneFiltered.map(t => {
              const c = clientMap.get(t.clientId);
              return (
                <Row
                  key={t.id}
                  id={t.id}
                  title={t.title || 'ללא כותרת'}
                  pill={{ text: 'הושלם', tone: 'done' }}
                  meta={`${t.clientId === 'system' ? 'כללי' : clientName(c)} · ${TASK_CATEGORY_LABELS[t.category]}`}
                  next={t.completedAt ? <>הושלם {relativeTime(t.completedAt)}</> : undefined}
                  onOpen={() => onSelectTask(t.id)}
                />
              );
            })
          )}
        </div>
      )}

      {/* ‼ במובייל הכפתור בראש העמוד מוסתר והפעולה עוברת לכפתור צף — כמו במקור. */}
      <button type="button" className="tw-fab" aria-label="חדש" onClick={() => setAddMenuOpen(true)}>+</button>

      {addMenuOpen && (
        <div className="modal-backdrop" onClick={() => setAddMenuOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>מה תרצה ליצור?</h3>
            <div className="tw-choice">
              <button type="button" onClick={() => { setAddMenuOpen(false); onAddTask(); }}>
                <b>משימה</b><span>משהו שאתה צריך לעשות</span>
              </button>
              <button type="button" onClick={() => openRequestModal()}>
                <b>בקשת מסמכים</b><span>בקשה מהלקוח — נכנסת לדף הלקוח ול״ממתין לאחרים״</span>
              </button>
            </div>
            <div className="foot">
              <button type="button" className="btn" onClick={() => setAddMenuOpen(false)}>ביטול</button>
            </div>
          </div>
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
            {reqError && <div style={{ color: 'var(--err)', fontSize: 'var(--fs-12)', marginTop: '.4rem' }}>{reqError}</div>}
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
