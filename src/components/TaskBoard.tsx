import { useMemo, useState, useEffect } from 'react';
import {
  Task,
  Client,
  TaskCategory,
  TaskProgress,
  BallWith,
  TASK_CATEGORY_LABELS,
  TASK_PROGRESS_LABELS,
  BALL_WITH_LABELS,
  BALL_WITH_COLOR,
} from '../types';
import {
  formatDueDate, dueTone, lateLabel,
  taskGroupOf, groupTasks, TaskGroupKey,
  groupTasksByStage, TASK_STAGE_ORDER, TASK_STAGE_LABELS, TASK_STAGE_HINTS, compareTasks,
} from '../utils/taskUtils';
import { FilterChip } from './ui/Chips';
import { GroupHeader, EmptyState, CalmEmpty } from './ui/States';
import ConfirmDialog from './ui/ConfirmDialog';
import { useToast } from './ui/Toast';
import Icon from './ui/Icon';

interface Props {
  tasks: Task[];
  clients: Client[];
  onSelectTask: (id: string) => void;
  onAddTask: () => void;
  onToggleDone: (id: string) => void;
  onChangeStatus: (id: string, progress: TaskProgress | 'done') => void;
  onChangeBall: (id: string, ball: BallWith) => void;
  onChangeCategory: (id: string, category: TaskCategory) => void;
  onReorder: (id: string, targetProgress: TaskProgress | 'done', beforeId: string | null) => void;
  onSelectClient: (id: string) => void;
  onDeleteTask?: (id: string) => void;
  /** עדכון משימה שלם — משמש להצמדה (priority) */
  onUpdateTask?: (task: Task) => void;
  onLoadSampleTasks?: () => void;
}

const CATEGORY_OPTIONS: TaskCategory[] = [
  'annual_report', 'institutions', 'management', 'economic_work',
  'personal_report', 'cutoff', 'wealth_declaration', 'ongoing',
  'discussions', 'special_approval', 'not_selected',
];

const BALL_OPTIONS: BallWith[] = ['me', 'client', 'authority', 'stuck'];

/** רמז קצר לכל קבוצה — מה עושים איתה, לא מה היא */
const COLLAPSE_KEY = 'pivo_tasks_collapsed';
const PIN_KEY = 'pivo_tasks_pinned';

export default function TaskBoard({
  tasks, clients,
  onSelectTask, onAddTask, onToggleDone,
  onChangeStatus, onChangeBall, onChangeCategory,
  onReorder, onSelectClient, onDeleteTask, onLoadSampleTasks,
}: Props) {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [ballFilter, setBallFilter] = useState<BallWith | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<TaskCategory | 'all'>('all');
  // סינון לפי לקוח — כמו מסנן האדם במונדיי
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try { const raw = localStorage.getItem(PIN_KEY); if (raw) return new Set(JSON.parse(raw) as string[]); } catch { /* default */ }
    return new Set<string>();
  });
  // "הושלמו" מקופלת כברירת מחדל (D24) — היא תיעוד, לא עבודה
  const [collapsed, setCollapsed] = useState<Set<TaskGroupKey>>(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw) return new Set(JSON.parse(raw) as TaskGroupKey[]);
    } catch { /* ברירת מחדל */ }
    return new Set<TaskGroupKey>(['done']);
  });
  const [openMenu, setOpenMenu] = useState<{ taskId: string; kind: 'ball' | 'row' } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<{ taskId: string; position: 'before' | 'after' } | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<TaskGroupKey | null>(null);
  void dragOverGroup;

  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed])); } catch { /* אחסון חסום */ }
  }, [collapsed]);

  // סגירת תפריטים בלחיצה מחוץ — בעזרת document listener, לא דרך bubbling
  useEffect(() => {
    if (!openMenu) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Element;
      if (!target.closest('.pill-menu') && !target.closest('button.ball-pill') && !target.closest('button.row-menu-btn')) {
        setOpenMenu(null);
      }
    }
    const t = setTimeout(() => document.addEventListener('click', onDocClick), 0);
    return () => { clearTimeout(t); document.removeEventListener('click', onDocClick); };
  }, [openMenu]);

  const clientMap = useMemo(() => {
    const m = new Map<string, Client>();
    clients.forEach(c => m.set(c.id, c));
    return m;
  }, [clients]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter(t => {
      if (ballFilter !== 'all' && t.ballWith !== ballFilter) return false;
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
      if (clientFilter !== 'all' && t.clientId !== clientFilter) return false;
      if (q) {
        const client = clientMap.get(t.clientId);
        const clientName = client ? `${client.firstName} ${client.lastName}`.toLowerCase() : '';
        if (
          !t.title.toLowerCase().includes(q) &&
          !(t.description || '').toLowerCase().includes(q) &&
          !clientName.includes(q)
        ) return false;
      }
      return true;
    });
  }, [tasks, search, ballFilter, categoryFilter, clientFilter, clientMap]);

  // הקיבוץ מגיע מ-taskUtils — אותו קיבוץ בדיוק משמש גם את לשונית המשימות בכרטיס הלקוח
  const byGroup = useMemo(() => groupTasks(filtered), [filtered]);
  // תצוגה שנייה — קיבוץ לפי שלב. שלוש קבוצות קבועות שתמיד מוצגות.
  const [boardView, setBoardView] = useState<'stage' | 'client'>('stage');
  const byStage = useMemo(() => groupTasksByStage(filtered), [filtered]);

  /* מוצמדות — מקטע קבוע בראש המסך, בכל תצוגה. הצמדה עונה על "מה אני
     עושה היום"; הקיבוץ עונה על "איך אני מעיין בשאר". שתי שאלות נפרדות,
     ולכן המקטע לא מתחלף עם התצוגה. */
  const pinned = useMemo(() => filtered.filter(t => pinnedIds.has(t.id) && t.status !== 'done').sort(compareTasks), [filtered, pinnedIds]);

  /* קיבוץ לפי לקוח — ככה העבודה מתקבצת בפועל: מתיישבים ועושים את כל
     מה שיש לדוד כהן, כי התיק שלו כבר פתוח. הלקוח עם הכי הרבה פתוחות
     ראשון; לקוח בלי משימות לא מופיע בכלל. */
  const byClient = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of filtered) {
      const arr = m.get(t.clientId); if (arr) arr.push(t); else m.set(t.clientId, [t]);
    }
    return [...m.entries()]
      .map(([id, list]) => ({
        id,
        label: (() => {
          const c = clientMap.get(id);
          return c ? `${c.firstName} ${c.lastName}`.trim() || c.idNumber : (id === 'system' ? 'משימות מערכת' : 'לקוח לא ידוע');
        })(),
        open: list.filter(t => t.status !== 'done').length,
        list: [...list].sort(compareTasks),
      }))
      .sort((a, b) => b.open - a.open || a.label.localeCompare(b.label, 'he'));
  }, [filtered, clientMap]);

  /* רשימת הלקוחות למסנן — נגזרת מכלל המשימות ולא מהמסוננות, אחרת
     בחירת לקוח הייתה מרוקנת את הרשימה שממנה בחרת אותו. */
  const clientsWithTasks = useMemo(() => {
    const ids = new Set(tasks.map(t => t.clientId));
    return [...ids].map(id => {
      const c = clientMap.get(id);
      return { id, label: c ? `${c.firstName} ${c.lastName}`.trim() || c.idNumber : (id === 'system' ? 'משימות מערכת' : 'לקוח לא ידוע') };
    }).sort((a, b) => a.label.localeCompare(b.label, 'he'));
  }, [tasks, clientMap]);

  const totalCount = tasks.length;

  function clearFilters() {
    setSearch(''); setBallFilter('all'); setCategoryFilter('all'); setClientFilter('all');
  }

  /** הצמדה/ביטול — קליק אחד, בלי דיאלוג.
      נשמר מקומית ולא במסד: השדה priority אינו ממופה כלל ב-dbMappers, ולכן
      הצמדה דרכו הייתה נראית עובדת ונעלמת ברענון. וגם לגופו של עניין —
      "מה אני עושה היום" הוא עניין אישי ליום ולמכשיר, לא נתון של המשימה. */
  function togglePin(t: Task) {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(t.id)) next.delete(t.id); else next.add(t.id);
      try { localStorage.setItem(PIN_KEY, JSON.stringify([...next])); } catch { /* אחסון חסום */ }
      return next;
    });
  }

  function toggleCollapse(g: TaskGroupKey) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g); else next.add(g);
      return next;
    });
  }

  /** השלמה הפיכה — במקום לשאול "בטוח?" לפני, נותנים "ביטול" אחרי (§5.5) */
  function completeTask(t: Task) {
    onToggleDone(t.id);
    showToast(t.status === 'done'
      ? { message: 'המשימה הוחזרה לפתוחות' }
      : { message: 'המשימה הושלמה', actionLabel: 'ביטול', onAction: () => onToggleDone(t.id) });
  }

  // ─── גרירה ───────────────────────────────────────────────────────────────
  // הקבוצות החדשות נגזרות מהנתונים (תאריך יעד, מצב הכדור) ולא נשמרות כשדה,
  // ולכן גרירה בין קבוצות מתורגמת לשינוי הנתון שבאמת קובע את השיוך:
  // "הושלמו" → סטטוס, "תקועות" → מצב הכדור. בתוך קבוצה — סדר ידני, כמו קודם.
  function handleDragStart(e: React.DragEvent, id: string) {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }
  function handleDragEnd() {
    setDraggedId(null); setDragOver(null); setDragOverGroup(null);
  }
  function applyGroupChange(task: Task, target: TaskGroupKey) {
    const from = taskGroupOf(task);
    if (from === target) return;
    if (target === 'done') { onChangeStatus(task.id, 'done'); return; }
    if (target === 'stuck') { onChangeBall(task.id, 'stuck'); return; }
    // חזרה לקבוצת עבודה: אם הייתה סגורה — לפתוח; אם הייתה תקועה — הכדור חוזר אליי
    if (from === 'done') onChangeStatus(task.id, task.progress || 'new');
    if (from === 'stuck') onChangeBall(task.id, 'me');
  }
  function handleRowDragOver(e: React.DragEvent, t: Task) {
    if (!draggedId || draggedId === t.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const position: 'before' | 'after' = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setDragOver({ taskId: t.id, position });
    setDragOverGroup(taskGroupOf(t));
  }
  function handleRowDrop(e: React.DragEvent, t: Task) {
    e.preventDefault();
    const dragged = tasks.find(x => x.id === draggedId);
    if (!dragged || dragged.id === t.id) { handleDragEnd(); return; }
    const targetGroup = taskGroupOf(t);
    applyGroupChange(dragged, targetGroup);
    if (taskGroupOf(dragged) === targetGroup) {
      const position = dragOver?.taskId === t.id ? dragOver.position : 'after';
      const list = byGroup[targetGroup].filter(x => x.id !== dragged.id);
      const idx = list.findIndex(x => x.id === t.id);
      const beforeId = position === 'before' ? list[idx]?.id ?? null : list[idx + 1]?.id ?? null;
      onReorder(dragged.id, dragged.status === 'done' ? 'done' : (dragged.progress || 'new'), beforeId);
    }
    handleDragEnd();
  }
  // גרירה בין קבוצות תחזור כשהקיבוץ לפי לקוח יתמוך בהעברה
  // @ts-expect-error שמור לשימוש עתידי
  function handleGroupDrop(e: React.DragEvent, g: TaskGroupKey) {
    e.preventDefault();
    const dragged = tasks.find(x => x.id === draggedId);
    if (dragged) applyGroupChange(dragged, g);
    handleDragEnd();
  }

  // ─── מצב ריק אמיתי — עוד לא נוצרה אף משימה ───────────────────────────────
  if (totalCount === 0) {
    return (
      <div className="tasks-page">
        <EmptyState
          headline="עוד אין משימות"
          sentence="משימה קושרת אותך ללקוח ומסמנת אצל מי הכדור — אצלך, אצלו, או אצל הרשות."
          action={{ label: '+ משימה חדשה', onClick: onAddTask }}
          quietLink={onLoadSampleTasks ? { label: 'טען משימות לדוגמה', onClick: onLoadSampleTasks } : undefined}
        />
      </div>
    );
  }

  const nothingMatches = filtered.length === 0;

  return (
    <div className="tasks-page">
      <div className="board-filters">
        {/* שתי דרכים להסתכל על אותן משימות: "מה דחוף" ו"איפה זה עומד".
            מתג, לא טאבים — זו אותה רשימה, רק מסודרת אחרת. */}
        <div className="qp-switch board-view-switch" role="tablist" aria-label="סידור המשימות">
          <button
            type="button" role="tab" aria-selected={boardView === 'stage'}
            className={boardView === 'stage' ? 'is-active' : ''}
            onClick={() => setBoardView('stage')}
          >
            שלב
          </button>
          <button
            type="button" role="tab" aria-selected={boardView === 'client'}
            className={boardView === 'client' ? 'is-active' : ''}
            onClick={() => setBoardView('client')}
          >
            לקוח
          </button>
        </div>

        {/* סינון לפי לקוח — כמו מסנן האדם במונדיי. מוצגים רק לקוחות
            שיש להם משימות, כדי שהרשימה לא תתארך עם כל לקוח חדש. */}
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="filter-select"
          aria-label="סינון לפי לקוח"
        >
          <option value="all">כל הלקוחות</option>
          {clientsWithTasks.map(c => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
        <div className="board-search-wrap">
          <Icon name="search" size={14} className="board-search-icon" />
          <input
            type="text"
            placeholder="חיפוש משימה, לקוח, תיאור…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="tasks-search"
            aria-label="חיפוש משימות"
          />
        </div>

        <div className="filter-chips" role="group" aria-label="סינון לפי מצב הכדור">
          <FilterChip active={ballFilter === 'all'} onClick={() => setBallFilter('all')}>הכל</FilterChip>
          {BALL_OPTIONS.map(b => (
            <FilterChip key={b} active={ballFilter === b} onClick={() => setBallFilter(b)} removable>
              {BALL_WITH_LABELS[b]}
            </FilterChip>
          ))}
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as TaskCategory | 'all')}
          className="filter-select"
          aria-label="סינון לפי סוג משימה"
        >
          <option value="all">כל הסוגים</option>
          {CATEGORY_OPTIONS.map(c => (
            <option key={c} value={c}>{TASK_CATEGORY_LABELS[c]}</option>
          ))}
        </select>

        {/* הספירה מופיעה רק כשהיא אומרת משהו — כלומר כשמשהו סונן */}
        {filtered.length !== totalCount && (
          <span className="board-filter-count">{filtered.length} מתוך {totalCount}</span>
        )}

        <button className="ui-btn ui-btn-primary board-add" onClick={onAddTask}>+ משימה חדשה</button>
      </div>

      {nothingMatches && (
        <EmptyState
          headline="אין משימות שמתאימות"
          sentence={search.trim() ? `לא נמצאה משימה שתואמת ל״${search.trim()}״.` : undefined}
          quietLink={{ label: 'נקה סינון', onClick: clearFilters }}
        />
      )}

      {/* "מוצמדות" נכנס כקבוצה ראשונה בתוך אותה לולאה — כך השורה מצוירת
          פעם אחת בקוד, וכל מה שנכון לשורה רגילה נכון גם למוצמדת. */}
      {!nothingMatches && [
        ...(pinned.length > 0 ? [{
          k: 'pinned',
          label: 'מוצמדות',
          hint: pinned.length > 7 ? 'הרבה מוצמדות — שווה לשחרר כמה' : 'מה שאני עושה היום',
          items: pinned,
        }] : []),
        ...(boardView === 'stage'
          ? TASK_STAGE_ORDER.map(k => ({ k: k as string, label: TASK_STAGE_LABELS[k], hint: TASK_STAGE_HINTS[k], items: byStage[k] }))
          : byClient.map(c => ({ k: c.id, label: c.label, hint: `${c.open} פתוחות`, items: c.list }))),
      ].map(({ k, label, hint, items }) => {
        // בתצוגת השלבים כל הקבוצות מוצגות תמיד, גם ריקות: "בתהליך: ריק"
        // הוא מידע, וקבוצה שנעלמת שוברת את המפה שהעין בנתה.
        const key = k as TaskGroupKey;
        const isCollapsed = collapsed.has(key);

        return (
          <div key={k} className={`board-group board-group-${k}`}>
            <GroupHeader
              title={label}
              count={items.length}
              hint={hint}
              collapsed={isCollapsed}
              onToggle={() => toggleCollapse(key)}
            />

            {!isCollapsed && (
              <div className="board-table">
                {items.length === 0 ? (
                  <CalmEmpty text={draggedId ? 'שחרר כאן כדי להעביר' : 'אין משימות בקבוצה זו'} />
                ) : (
                  items.map(t => {
                    const client = clientMap.get(t.clientId) ?? null;
                    const isSystemTask = t.clientId === 'system';
                    const clientLabel = client
                      ? `${client.firstName} ${client.lastName}`.trim() || client.idNumber
                      : isSystemTask ? 'משימת מערכת' : 'לקוח לא ידוע';
                    const done = t.status === 'done';
                    const currentStatus: TaskProgress | 'done' = done ? 'done' : (t.progress || 'new');
                    const tone = dueTone(t);
                    const late = tone === 'late' ? lateLabel(t.dueDate) : null;
                    const isDragging = draggedId === t.id;
                    const dropHere = dragOver?.taskId === t.id;
                    const menuForThis = openMenu?.taskId === t.id ? openMenu.kind : null;

                    return (
                      <div
                        key={t.id}
                        className={`board-row ${done ? 'row-done' : ''} ${isDragging ? 'row-dragging' : ''} ${dropHere ? `row-drop-${dragOver!.position}` : ''}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, t.id)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => handleRowDragOver(e, t)}
                        onDrop={(e) => handleRowDrop(e, t)}
                        onClick={() => onSelectTask(t.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter') onSelectTask(t.id); }}
                      >
                        <div className="bc bc-handle" title="גרירה לשינוי סדר"><Icon name="drag" size={14} /></div>

                        <div className="bc bc-check" onClick={(e) => e.stopPropagation()}>
                          <button
                            className={`task-check ${done ? 'is-done' : ''}`}
                            onClick={() => completeTask(t)}
                            aria-label={done ? 'סימון כלא הושלמה' : 'סימון כהושלמה'}
                            title={done ? 'החזרה לפתוחות' : 'סימון כהושלמה'}
                          >
                            {done && <Icon name="check" size={12} />}
                          </button>
                        </div>

                        <div className="bc bc-title">
                          <span className="task-title-text">{t.title}</span>
                        </div>

                        <div className="bc bc-client" onClick={(e) => e.stopPropagation()}>
                          {client ? (
                            <button
                              className="client-chip"
                              onClick={() => onSelectClient(client.id)}
                              title={`פתח את כרטיס ${clientLabel}`}
                            >
                              <span className="client-chip-name">{clientLabel}</span>
                            </button>
                          ) : (
                            <span className="client-chip client-chip-missing">{clientLabel}</span>
                          )}
                        </div>

                        {/* התאריך לבדו נושא את האיחור — אין נקודה, אין שורה שנייה (D2/D5) */}
                        <div className="bc bc-date">
                          {t.dueDate ? (
                            <span className={`due due-${tone}`} title={late || undefined}>
                              {formatDueDate(t.dueDate)}
                            </span>
                          ) : (
                            <span className="due due-none">ללא תאריך</span>
                          )}
                        </div>

                        <div className="bc bc-ball" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="ball-word"
                            style={{ color: BALL_WITH_COLOR[t.ballWith] }}
                            onClick={() => setOpenMenu(menuForThis === 'ball' ? null : { taskId: t.id, kind: 'ball' })}
                            title="שינוי מצב הכדור"
                          >
                            {BALL_WITH_LABELS[t.ballWith]}
                          </button>
                          {menuForThis === 'ball' && (
                            <div className="pill-menu" onClick={(e) => e.stopPropagation()}>
                              {BALL_OPTIONS.map(b => (
                                <button
                                  key={b}
                                  className={`pill-menu-item ${t.ballWith === b ? 'is-current' : ''}`}
                                  style={{ color: BALL_WITH_COLOR[b] }}
                                  onClick={() => { onChangeBall(t.id, b); setOpenMenu(null); }}
                                >
                                  {BALL_WITH_LABELS[b]}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="bc bc-actions ui-hover-actions" onClick={(e) => e.stopPropagation()}>
                          {/* הצמדה — קליק אחד. מוצמדת נשארת גלויה גם בלי
                              מעבר עכבר, אחרת אי אפשר לראות מה מוצמד. */}
                          {!done && (
                            <button
                              className={`ui-icon-btn pin-btn ${pinnedIds.has(t.id) ? 'is-pinned' : ''}`}
                              onClick={() => togglePin(t)}
                              aria-pressed={pinnedIds.has(t.id)}
                              aria-label={pinnedIds.has(t.id) ? 'ביטול הצמדה' : 'הצמדה'}
                              title={pinnedIds.has(t.id) ? 'ביטול הצמדה' : 'הצמדה'}
                            >
                              📌
                            </button>
                          )}
                          <button
                            className="ui-icon-btn"
                            onClick={() => onSelectTask(t.id)}
                            aria-label="עריכת המשימה"
                            title="עריכה"
                          >
                            <Icon name="edit" size={14} />
                          </button>
                          <button
                            className="ui-icon-btn row-menu-btn"
                            aria-label="סטטוס וסוג"
                            title="סטטוס וסוג"
                            onClick={() => setOpenMenu(menuForThis === 'row' ? null : { taskId: t.id, kind: 'row' })}
                          >
                            <Icon name="chevron-down" size={14} />
                          </button>
                          {onDeleteTask && (
                            <button
                              className="ui-icon-btn is-danger"
                              onClick={() => setPendingDelete(t)}
                              aria-label="מחיקת המשימה"
                              title="מחיקה"
                            >
                              <Icon name="close" size={14} />
                            </button>
                          )}
                          {menuForThis === 'row' && (
                            <div className="pill-menu row-menu" onClick={(e) => e.stopPropagation()}>
                              <div className="row-menu-label">סטטוס</div>
                              {(['new', 'in_progress', 'done'] as const).map(s => (
                                <button
                                  key={s}
                                  className={`pill-menu-item ${currentStatus === s ? 'is-current' : ''}`}
                                  onClick={() => { onChangeStatus(t.id, s); setOpenMenu(null); }}
                                >
                                  {s === 'done' ? 'הושלמה' : TASK_PROGRESS_LABELS[s]}
                                </button>
                              ))}
                              <div className="row-menu-label">סוג</div>
                              {CATEGORY_OPTIONS.map(c => (
                                <button
                                  key={c}
                                  className={`pill-menu-item ${t.category === c ? 'is-current' : ''}`}
                                  onClick={() => { onChangeCategory(t.id, c); setOpenMenu(null); }}
                                >
                                  {TASK_CATEGORY_LABELS[c]}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}

      {pendingDelete && (
        <ConfirmDialog
          title="מחיקת משימה"
          message={<>למחוק את ״{pendingDelete.title}״? הפעולה אינה הפיכה.</>}
          confirmLabel="מחיקה"
          onConfirm={() => { onDeleteTask?.(pendingDelete.id); setPendingDelete(null); showToast('המשימה נמחקה'); }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
