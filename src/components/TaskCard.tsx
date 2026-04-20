import {
  Task,
  Client,
  TASK_CATEGORY_LABELS,
  TASK_CATEGORY_BADGE,
  BALL_WITH_LABELS,
  BALL_WITH_ICON,
} from '../types';
import { formatDueDate, formatCreatedAt, isOverdue } from '../utils/taskUtils';

interface Props {
  task: Task;
  client: Client | null;
  showClient?: boolean;
  showBallWith?: boolean;
  onClick?: () => void;
  onToggleDone?: () => void;
}

/** צבע אווטאר לפי hash של מזהה הלקוח */
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

export default function TaskCard({
  task,
  client,
  showClient = true,
  showBallWith = true,
  onClick,
  onToggleDone,
}: Props) {
  const overdue = isOverdue(task);
  const done = task.status === 'done';
  const clientLabel = client
    ? `${client.firstName} ${client.lastName}`.trim() || client.idNumber
    : 'לקוח לא ידוע';
  const avatar = client ? avatarColor(client.id) : AVATAR_COLORS[0];
  const initialsLabel = client ? initials(client.firstName, client.lastName) : '?';

  // מצב — קו צבע בצד הכרטיס (לפי מצב המשימה)
  const strip = done
    ? 'task-strip-done'
    : task.priority === 'urgent' || overdue
    ? 'task-strip-urgent'
    : task.ballWith === 'stuck'
    ? 'task-strip-stuck'
    : task.ballWith === 'client'
    ? 'task-strip-client'
    : task.ballWith === 'authority'
    ? 'task-strip-authority'
    : 'task-strip-me';

  return (
    <div
      className={`task-row ${done ? 'task-done' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div className={`task-strip ${strip}`} />

      <button
        className="task-check"
        onClick={(e) => { e.stopPropagation(); onToggleDone?.(); }}
        aria-label={done ? 'סימון כלא בוצע' : 'סימון כבוצע'}
        title={done ? 'סימון כלא בוצע' : 'סימון כבוצע'}
      >
        {done && <span className="check-mark">✓</span>}
      </button>

      {task.priority === 'urgent' && !done && (
        <span className="priority-flag" title="דחוף">❗</span>
      )}

      <div className="task-title-col">
        <div className="task-title">{task.title}</div>
        {task.description && (
          <div className="task-desc">{task.description}</div>
        )}
      </div>

      {showClient && (
        <div className="task-client-col" title={clientLabel}>
          <div
            className="task-avatar"
            style={{ background: avatar.bg, color: avatar.fg }}
          >
            {initialsLabel}
          </div>
          <span className="task-client-name">{clientLabel}</span>
        </div>
      )}

      <span
        className={`category-pill ${TASK_CATEGORY_BADGE[task.category]}`}
        title={TASK_CATEGORY_LABELS[task.category]}
      >
        {TASK_CATEGORY_LABELS[task.category]}
      </span>

      {showBallWith && (
        <span className={`ball-pill ball-pill-${task.ballWith}`}>
          <span>{BALL_WITH_ICON[task.ballWith]}</span>
          <span>{BALL_WITH_LABELS[task.ballWith]}</span>
        </span>
      )}

      <div className="task-date-col">
        {task.dueDate ? (
          <span className={`date-pill ${overdue ? 'date-pill-overdue' : 'date-pill-due'}`}>
            📅 {formatDueDate(task.dueDate)}
          </span>
        ) : (
          <span className="date-pill date-pill-created">
            נוצר {formatCreatedAt(task.createdAt)}
          </span>
        )}
      </div>
    </div>
  );
}
