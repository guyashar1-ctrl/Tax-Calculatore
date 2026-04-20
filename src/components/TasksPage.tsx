import { useMemo, useState } from 'react';
import {
  Task,
  Client,
  TaskCategory,
  BallWith,
  TaskStatus,
  TASK_CATEGORY_LABELS,
  BALL_WITH_LABELS,
} from '../types';
import TaskCard from './TaskCard';

interface Props {
  tasks: Task[];
  clients: Client[];
  onSelectTask: (id: string) => void;
  onAddTask: () => void;
  onToggleDone: (id: string) => void;
}

type StatusFilter = TaskStatus | 'all';
type BallFilter = BallWith | 'all';
type CategoryFilter = TaskCategory | 'all';

export default function TasksPage({ tasks, clients, onSelectTask, onAddTask, onToggleDone }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [ballFilter, setBallFilter] = useState<BallFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [search, setSearch] = useState('');

  const clientMap = useMemo(() => {
    const m = new Map<string, Client>();
    clients.forEach(c => m.set(c.id, c));
    return m;
  }, [clients]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks
      .filter(t => statusFilter === 'all' ? true : t.status === statusFilter)
      .filter(t => ballFilter === 'all' ? true : t.ballWith === ballFilter)
      .filter(t => categoryFilter === 'all' ? true : t.category === categoryFilter)
      .filter(t => {
        if (!q) return true;
        const client = clientMap.get(t.clientId);
        const clientName = client ? `${client.firstName} ${client.lastName}`.toLowerCase() : '';
        return (
          t.title.toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q) ||
          clientName.includes(q)
        );
      })
      .sort((a, b) => {
        // סגורות — לפי completedAt יורד
        if (a.status === 'done' && b.status === 'done') {
          return (b.completedAt || '').localeCompare(a.completedAt || '');
        }
        if (a.status === 'done') return 1;
        if (b.status === 'done') return -1;
        // פתוחות — דחוף קודם, אחר כך דד-ליין עולה, אחר כך FIFO
        if (a.priority !== b.priority) return a.priority === 'urgent' ? -1 : 1;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return a.createdAt.localeCompare(b.createdAt);
      });
  }, [tasks, statusFilter, ballFilter, categoryFilter, search, clientMap]);

  const categoryOptions: CategoryFilter[] = [
    'all',
    'income_tax', 'ni', 'withholdings',
    'vat_report', 'withholdings_report',
    'audit', 'cutoff', 'economic_work',
    'client_onboarding', 'authority_contact', 'other',
  ];

  return (
    <div className="tasks-page">
      <div className="desk-header">
        <div>
          <h2 className="desk-title">משימות</h2>
          <div className="desk-subtitle">{filtered.length} משימות</div>
        </div>
        <button className="btn btn-primary" onClick={onAddTask}>+ משימה חדשה</button>
      </div>

      <div className="tasks-filters">
        <input
          type="text"
          placeholder="🔍 חיפוש משימה, לקוח, תיאור..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="tasks-search"
        />

        <div className="filter-group">
          <label>סטטוס:</label>
          <div className="filter-chips">
            {(['open', 'done', 'all'] as StatusFilter[]).map(s => (
              <button
                key={s}
                className={`chip ${statusFilter === s ? 'active' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'open' ? 'פתוחות' : s === 'done' ? 'סגורות' : 'הכל'}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <label>כדור:</label>
          <div className="filter-chips">
            <button
              className={`chip ${ballFilter === 'all' ? 'active' : ''}`}
              onClick={() => setBallFilter('all')}
            >
              הכל
            </button>
            {(['me', 'client', 'authority', 'stuck'] as BallWith[]).map(b => (
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
          <label>קטגוריה:</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
            className="filter-select"
          >
            {categoryOptions.map(c => (
              <option key={c} value={c}>
                {c === 'all' ? 'כל הקטגוריות' : TASK_CATEGORY_LABELS[c as TaskCategory]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">לא נמצאו משימות</div>
          <div className="empty-state-subtitle">נסה לשנות פילטרים או ליצור משימה חדשה</div>
        </div>
      ) : (
        <div className="task-list">
          {filtered.map(t => (
            <TaskCard
              key={t.id}
              task={t}
              client={clientMap.get(t.clientId) ?? null}
              showBallWith
              onClick={() => onSelectTask(t.id)}
              onToggleDone={() => onToggleDone(t.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
