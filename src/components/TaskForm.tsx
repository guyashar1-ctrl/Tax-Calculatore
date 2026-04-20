import { useState, useEffect } from 'react';
import {
  Task,
  Client,
  TaskCategory,
  BallWith,
  TaskPriority,
  TASK_CATEGORY_LABELS,
  BALL_WITH_LABELS,
  BALL_WITH_ICON,
} from '../types';

interface Props {
  task: Task | null;                     // null = יצירה חדשה
  clients: Client[];
  presetClientId?: string | null;        // אם נפתח מתוך תיק לקוח — נעול
  onSave: (task: Task) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
}

function blankTask(clientId: string): Task {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    clientId,
    category: 'income_tax',
    title: '',
    description: '',
    ballWith: 'me',
    status: 'open',
    priority: 'normal',
    createdAt: now,
    updatedAt: now,
  };
}

const CATEGORIES: TaskCategory[] = [
  'income_tax', 'ni', 'withholdings',
  'vat_report', 'withholdings_report',
  'audit', 'cutoff', 'economic_work',
  'client_onboarding', 'authority_contact',
  'other',
];

const BALL_OPTIONS: BallWith[] = ['me', 'client', 'authority', 'stuck'];

export default function TaskForm({ task, clients, presetClientId, onSave, onCancel, onDelete }: Props) {
  const [data, setData] = useState<Task>(
    task ?? blankTask(presetClientId ?? clients[0]?.id ?? '')
  );

  useEffect(() => {
    if (task) setData(task);
  }, [task]);

  const isEditing = !!task;
  const isLocked = !!presetClientId;

  function upd<K extends keyof Task>(key: K, val: Task[K]) {
    setData(d => ({ ...d, [key]: val, updatedAt: new Date().toISOString() }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data.clientId) {
      alert('יש לבחור לקוח');
      return;
    }
    if (!data.title.trim()) {
      alert('יש למלא כותרת למשימה');
      return;
    }
    onSave({ ...data, title: data.title.trim() });
  }

  const clientOptions = [...clients].sort((a, b) =>
    `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'he')
  );

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal task-modal" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <h3>{isEditing ? 'עריכת משימה' : 'משימה חדשה'}</h3>
            <button type="button" className="btn btn-ghost btn-icon" onClick={onCancel}>✕</button>
          </div>

          <div className="modal-body">
            <div className="form-grid form-grid-2">
              <div className="form-group span-full">
                <label className="required">כותרת</label>
                <input
                  type="text"
                  value={data.title}
                  onChange={(e) => upd('title', e.target.value)}
                  placeholder="לדוגמה: להכין דוח שנתי 2024"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="required">לקוח</label>
                <select
                  value={data.clientId}
                  onChange={(e) => upd('clientId', e.target.value)}
                  disabled={isLocked}
                >
                  {!isLocked && <option value="">— בחר —</option>}
                  {clientOptions.map(c => (
                    <option key={c.id} value={c.id}>
                      {`${c.lastName} ${c.firstName}`.trim() || c.idNumber || 'ללא שם'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>קטגוריה</label>
                <select value={data.category} onChange={(e) => upd('category', e.target.value as TaskCategory)}>
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{TASK_CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>אצל מי הכדור</label>
                <div className="ball-select">
                  {BALL_OPTIONS.map(b => (
                    <button
                      type="button"
                      key={b}
                      className={`ball-option ${data.ballWith === b ? 'active' : ''}`}
                      onClick={() => upd('ballWith', b)}
                    >
                      <span>{BALL_WITH_ICON[b]}</span>
                      <span>{BALL_WITH_LABELS[b]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>דחיפות</label>
                <select value={data.priority} onChange={(e) => upd('priority', e.target.value as TaskPriority)}>
                  <option value="normal">רגיל</option>
                  <option value="urgent">דחוף</option>
                </select>
              </div>

              <div className="form-group span-full">
                <label>דד-ליין (אופציונלי)</label>
                <input
                  type="date"
                  value={data.dueDate || ''}
                  onChange={(e) => upd('dueDate', e.target.value || undefined)}
                />
              </div>

              <div className="form-group span-full">
                <label>תיאור / פרטים</label>
                <textarea
                  value={data.description || ''}
                  onChange={(e) => upd('description', e.target.value)}
                  rows={4}
                  placeholder="פרטים נוספים, הקשר, מה צריך לעשות..."
                />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            {isEditing && onDelete && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  if (confirm('למחוק את המשימה?')) {
                    onDelete(data.id);
                  }
                }}
              >
                מחיקה
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-secondary" onClick={onCancel}>ביטול</button>
            <button type="submit" className="btn btn-primary">
              {isEditing ? 'שמירה' : 'יצירה'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
