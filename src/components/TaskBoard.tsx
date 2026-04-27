import { useMemo, useState, useEffect } from 'react';
import {
  Task,
  Client,
  TaskCategory,
  TaskProgress,
  BallWith,
  TASK_CATEGORY_LABELS,
  TASK_CATEGORY_BADGE,
  TASK_PROGRESS_LABELS,
  BALL_WITH_LABELS,
  BALL_WITH_ICON,
} from '../types';
import { formatDueDate, isOverdue } from '../utils/taskUtils';

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
  onLoadSampleTasks?: () => void;
}

type GroupKey = 'new' | 'in_progress' | 'done';

const GROUPS: { key: GroupKey; label: string }[] = [
  { key: 'new', label: 'משימות חדשות' },
  { key: 'in_progress', label: 'משימות בתהליך' },
  { key: 'done', label: 'הושלמו' },
];

const CATEGORY_OPTIONS: TaskCategory[] = [
  'annual_report', 'institutions', 'management', 'economic_work',
  'personal_report', 'cutoff', 'wealth_declaration', 'ongoing',
  'discussions', 'special_approval', 'not_selected',
];

const BALL_OPTIONS: BallWith[] = ['me', 'client', 'authority', 'stuck'];

function groupOf(t: Task): GroupKey {
  if (t.status === 'done') return 'done';
  return t.progress === 'in_progress' ? 'in_progress' : 'new';
}

const AVATAR_COLORS = [
  { bg: '#dbeafe', fg: '#1d4ed8' },
  { bg: '#fef3c7', fg: '#b45309' },
  { bg: '#fce7f3', fg: '#be185d' },
  { bg: '#dcfce7', fg: '#15803d' },
  { bg: '#e0e7ff', fg: '#4338ca' },
  { bg: '#fee2e2', fg: '#b91c1c' },
  { bg: '#f3e8ff', fg: '#7e22ce' },
  { bg: '#ccfbf1', fg: '#0f766e' },
];
function avatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
function initials(firstName: string, lastName: string): string {
  const a = (firstName || '').trim().charAt(0);
  const b = (lastName || '').trim().charAt(0);
  return (a + b) || '?';
}

export default function TaskBoard({
  tasks, clients,
  onSelectTask, onAddTask, onToggleDone,
  onChangeStatus, onChangeBall, onChangeCategory,
  onReorder, onSelectClient, onDeleteTask, onLoadSampleTasks,
}: Props) {
  const [search, setSearch] = useState('');
  const [ballFilter, setBallFilter] = useState<BallWith | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<TaskCategory | 'all'>('all');
  const [collapsed, setCollapsed] = useState<Set<GroupKey>>(new Set(['done']));
  const [openMenu, setOpenMenu] = useState<{ taskId: string; kind: 'status' | 'ball' | 'cat' } | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<{ taskId: string; position: 'before' | 'after' } | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<GroupKey | null>(null);

  // סגירת תפריטים בלחיצה מחוץ — בעזרת document listener, לא דרך bubbling
  useEffect(() => {
    if (!openMenu) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Element;
      if (!target.closest('.pill-menu') && !target.closest('button.status-pill') && !target.closest('button.ball-pill') && !target.closest('button.category-pill')) {
        setOpenMenu(null);
      }
    }
    // רישום בטיק הבא כדי לא לתפוס את הקליק הפותח
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
  }, [tasks, search, ballFilter, categoryFilter, clientMap]);

  const byGroup = useMemo(() => {
    const map: Record<GroupKey, Task[]> = { new: [], in_progress: [], done: [] };
    for (const t of filtered) map[groupOf(t)].push(t);
    const sortFn = (a: Task, b: Task): number => {
      const ao = a.sortOrder, bo = b.sortOrder;
      if (ao !== undefined && bo !== undefined) return ao - bo;
      if (ao !== undefined) return -1;
      if (bo !== undefined) return 1;
      if (a.priority !== b.priority) return a.priority === 'urgent' ? -1 : 1;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return a.createdAt.localeCompare(b.createdAt);
    };
    map.new.sort(sortFn);
    map.in_progress.sort(sortFn);
    map.done.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
    return map;
  }, [filtered]);

  function toggleCollapse(g: GroupKey) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }
  function handleDragEnd() {
    setDraggedId(null);
    setDragOver(null);
    setDragOverGroup(null);
  }
  function handleRowDragOver(e: React.DragEvent, t: Task) {
    if (!draggedId || draggedId === t.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const position: 'before' | 'after' = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setDragOver({ taskId: t.id, position });
    setDragOverGroup(groupOf(t));
  }
  function handleRowDrop(e: React.DragEvent, t: Task) {
    e.preventDefault();
    if (!draggedId || draggedId === t.id) { handleDragEnd(); return; }
    const targetGroup = groupOf(t);
    const position = dragOver?.taskId === t.id ? dragOver.position : 'after';
    const groupTasks = byGroup[targetGroup].filter(x => x.id !== draggedId);
    const idx = groupTasks.findIndex(x => x.id === t.id);
    const insertBeforeId = position === 'before'
      ? groupTasks[idx]?.id ?? null
      : groupTasks[idx + 1]?.id ?? null;
    onReorder(draggedId, targetGroup, insertBeforeId);
    handleDragEnd();
  }
  function handleGroupDragOver(e: React.DragEvent, g: GroupKey) {
    if (!draggedId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverGroup(g);
  }
  function handleGroupDrop(e: React.DragEvent, g: GroupKey) {
    e.preventDefault();
    if (!draggedId) return;
    onReorder(draggedId, g, null);
    handleDragEnd();
  }

  const totalCount = tasks.length;

  return (
    <div className="tasks-page">
      <div className="desk-header">
        <div>
          <h2 className="desk-title">משימות</h2>
          <div className="desk-subtitle">
            {filtered.length} {filtered.length === 1 ? 'משימה' : 'משימות'}
            {filtered.length !== totalCount && ` מתוך ${totalCount}`}
          </div>
        </div>
        <button className="btn btn-primary" onClick={onAddTask}>+ משימה חדשה</button>
      </div>

      <div className="board-filters">
        <input
          type="text"
          placeholder="🔍 חיפוש משימה, לקוח, תיאור..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="tasks-search"
        />

        <div className="filter-group">
          <label>כדור:</label>
          <div className="filter-chips">
            <button
              className={`chip ${ballFilter === 'all' ? 'active' : ''}`}
              onClick={() => setBallFilter('all')}
            >הכל</button>
            {BALL_OPTIONS.map(b => (
              <button
                key={b}
                className={`chip ${ballFilter === b ? 'active' : ''}`}
                onClick={() => setBallFilter(b)}
              >
                {BALL_WITH_LABELS[b]}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <label>סוג:</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as TaskCategory | 'all')}
            className="filter-select"
          >
            <option value="all">כל הסוגים</option>
            {CATEGORY_OPTIONS.map(c => (
              <option key={c} value={c}>{TASK_CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
      </div>

      {totalCount === 0 && (
        <div className="empty-state">
          <div className="empty-state-title">אין עדיין משימות במערכת</div>
          <div className="empty-state-subtitle">צור משימה חדשה או טען דוגמאות</div>
          <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem', justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={onAddTask}>+ משימה חדשה</button>
            {onLoadSampleTasks && (
              <button className="btn btn-secondary" onClick={onLoadSampleTasks}>📥 טען דוגמאות</button>
            )}
          </div>
        </div>
      )}

      {GROUPS.map(g => {
        const items = byGroup[g.key];
        const isCollapsed = collapsed.has(g.key);
        const isDragTarget = dragOverGroup === g.key && items.length === 0;
        return (
          <div
            key={g.key}
            className={`board-group board-group-${g.key} ${isDragTarget ? 'board-group-drop' : ''}`}
            onDragOver={(e) => items.length === 0 && handleGroupDragOver(e, g.key)}
            onDrop={(e) => items.length === 0 && handleGroupDrop(e, g.key)}
          >
            <div className="board-group-header" onClick={() => toggleCollapse(g.key)}>
              <span className={`board-group-arrow ${isCollapsed ? 'collapsed' : ''}`}>▾</span>
              <span className={`board-group-title status-pill status-pill-${g.key}`}>{g.label}</span>
              <span className="board-group-count">{items.length}</span>
            </div>

            {!isCollapsed && (
              <div className="board-table">
                <div className="board-row board-row-header">
                  <div className="bc bc-handle"></div>
                  <div className="bc bc-check"></div>
                  <div className="bc bc-title">משימה</div>
                  <div className="bc bc-status">סטטוס</div>
                  <div className="bc bc-client">לקוח</div>
                  <div className="bc bc-date">דד-ליין</div>
                  <div className="bc bc-desc">תיאור</div>
                  <div className="bc bc-ball">הכדור אצל</div>
                  <div className="bc bc-cat">סוג</div>
                  <div className="bc bc-actions"></div>
                </div>

                {items.length === 0 ? (
                  <div className="board-empty-row">אין משימות בקבוצה זו{draggedId ? ' — גרור לכאן כדי להעביר' : ''}</div>
                ) : (
                  items.map(t => {
                    const client = clientMap.get(t.clientId) ?? null;
                    const overdue = isOverdue(t);
                    const clientLabel = client
                      ? `${client.firstName} ${client.lastName}`.trim() || client.idNumber
                      : 'לקוח לא ידוע';
                    const av = client ? avatarColor(client.id) : AVATAR_COLORS[0];
                    const initialsLabel = client ? initials(client.firstName, client.lastName) : '?';
                    const done = t.status === 'done';
                    const currentStatus: TaskProgress | 'done' = done ? 'done' : (t.progress || 'new');
                    const isDragging = draggedId === t.id;
                    const isDropTarget = dragOver?.taskId === t.id;
                    const menuForThis = openMenu?.taskId === t.id ? openMenu.kind : null;

                    return (
                      <div
                        key={t.id}
                        className={`board-row ${done ? 'row-done' : ''} ${isDragging ? 'row-dragging' : ''} ${isDropTarget ? `row-drop-${dragOver?.position}` : ''}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, t.id)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => handleRowDragOver(e, t)}
                        onDrop={(e) => handleRowDrop(e, t)}
                        onClick={() => onSelectTask(t.id)}
                      >
                        <div className="bc bc-handle" title="גרור כדי להעביר">⋮⋮</div>

                        <div className="bc bc-check">
                          <button
                            className="task-check"
                            onClick={(e) => { e.stopPropagation(); onToggleDone(t.id); }}
                            aria-label={done ? 'סימון כלא הושלמה' : 'סימון כהושלמה'}
                            title={done ? 'סימון כלא הושלמה' : 'סימון כהושלמה'}
                          >
                            {done && <span className="check-mark">✓</span>}
                          </button>
                        </div>

                        <div className="bc bc-title">
                          {t.priority === 'urgent' && !done && <span className="urgent-dot" title="דחוף" aria-label="דחוף" />}
                          <span className="task-title-text">{t.title}</span>
                        </div>

                        <div className="bc bc-status" onClick={(e) => e.stopPropagation()}>
                          <button
                            className={`status-pill status-pill-${currentStatus}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenu(menuForThis === 'status' ? null : { taskId: t.id, kind: 'status' });
                            }}
                          >
                            {currentStatus === 'done' ? 'הושלמה' : TASK_PROGRESS_LABELS[currentStatus]}
                          </button>
                          {menuForThis === 'status' && (
                            <div className="pill-menu" onClick={(e) => e.stopPropagation()}>
                              {(['new', 'in_progress', 'done'] as const).map(s => (
                                <button
                                  key={s}
                                  className={`pill-menu-item status-pill status-pill-${s}`}
                                  onClick={() => { onChangeStatus(t.id, s); setOpenMenu(null); }}
                                >
                                  {s === 'done' ? 'הושלמה' : TASK_PROGRESS_LABELS[s]}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="bc bc-client" onClick={(e) => e.stopPropagation()}>
                          {client ? (
                            <button
                              className="client-chip"
                              onClick={() => onSelectClient(client.id)}
                              title={`פתח את כרטיס ${clientLabel}`}
                            >
                              <span className="task-avatar" style={{ background: av.bg, color: av.fg }}>
                                {initialsLabel}
                              </span>
                              <span className="client-chip-name">{clientLabel}</span>
                            </button>
                          ) : (
                            <span className="client-chip client-chip-missing">לקוח לא ידוע</span>
                          )}
                        </div>

                        <div className="bc bc-date">
                          {t.dueDate ? (
                            <span className={`date-chip ${overdue && !done ? 'date-chip-overdue' : ''}`}>
                              📅 {formatDueDate(t.dueDate)}
                            </span>
                          ) : (
                            <span className="date-chip date-chip-none">—</span>
                          )}
                        </div>

                        <div className="bc bc-desc" title={t.description || ''}>
                          {t.description || <span className="muted">—</span>}
                        </div>

                        <div className="bc bc-ball" onClick={(e) => e.stopPropagation()}>
                          <button
                            className={`ball-pill ball-pill-${t.ballWith}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenu(menuForThis === 'ball' ? null : { taskId: t.id, kind: 'ball' });
                            }}
                          >
                            <span>{BALL_WITH_ICON[t.ballWith]}</span>
                            <span>{BALL_WITH_LABELS[t.ballWith]}</span>
                          </button>
                          {menuForThis === 'ball' && (
                            <div className="pill-menu" onClick={(e) => e.stopPropagation()}>
                              {BALL_OPTIONS.map(b => (
                                <button
                                  key={b}
                                  className={`pill-menu-item ball-pill ball-pill-${b}`}
                                  onClick={() => { onChangeBall(t.id, b); setOpenMenu(null); }}
                                >
                                  <span>{BALL_WITH_ICON[b]}</span>
                                  <span>{BALL_WITH_LABELS[b]}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="bc bc-cat" onClick={(e) => e.stopPropagation()}>
                          <button
                            className={`category-pill ${TASK_CATEGORY_BADGE[t.category]}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenu(menuForThis === 'cat' ? null : { taskId: t.id, kind: 'cat' });
                            }}
                          >
                            {TASK_CATEGORY_LABELS[t.category]}
                          </button>
                          {menuForThis === 'cat' && (
                            <div className="pill-menu pill-menu-wide" onClick={(e) => e.stopPropagation()}>
                              {CATEGORY_OPTIONS.map(c => (
                                <button
                                  key={c}
                                  className={`pill-menu-item category-pill ${TASK_CATEGORY_BADGE[c]}`}
                                  onClick={() => { onChangeCategory(t.id, c); setOpenMenu(null); }}
                                >
                                  {TASK_CATEGORY_LABELS[c]}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="bc bc-actions">
                          {onDeleteTask && (
                            <button
                              className="row-delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('למחוק את המשימה?')) onDeleteTask(t.id);
                              }}
                              title="מחיקה"
                            >
                              ✕
                            </button>
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
    </div>
  );
}
