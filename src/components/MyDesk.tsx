import { useMemo, useState } from 'react';
import { Task, Client } from '../types';
import { bucketMyDeskTasks } from '../utils/taskUtils';
import TaskCard from './TaskCard';

interface Props {
  tasks: Task[];
  clients: Client[];
  onSelectTask: (id: string) => void;
  onAddTask: () => void;
  onToggleDone: (id: string) => void;
  onLoadSampleTasks?: () => void;
}

export default function MyDesk({ tasks, clients, onSelectTask, onAddTask, onToggleDone, onLoadSampleTasks }: Props) {
  const buckets = useMemo(() => bucketMyDeskTasks(tasks), [tasks]);
  const clientMap = useMemo(() => {
    const m = new Map<string, Client>();
    clients.forEach(c => m.set(c.id, c));
    return m;
  }, [clients]);

  const totalOnDesk =
    buckets.urgent.length +
    buckets.thisWeek.length +
    buckets.stuck.length +
    buckets.backlog.length;

  return (
    <div className="desk-page">
      <div className="desk-header">
        <div>
          <h2 className="desk-title">על השולחן שלי</h2>
          <div className="desk-subtitle">
            {totalOnDesk === 0
              ? 'אין משימות פתוחות אצלך — שולחן נקי 🎉'
              : `${totalOnDesk} משימות ממתינות לטיפולך`}
          </div>
        </div>
        <button className="btn btn-primary" onClick={onAddTask}>+ משימה חדשה</button>
      </div>

      {tasks.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-title">אין עדיין משימות במערכת</div>
          <div className="empty-state-subtitle">צור משימה חדשה, או טען נתוני דוגמה כדי לראות איך נראה שולחן עבודה עם תוכן</div>
          <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem', justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={onAddTask}>+ משימה חדשה</button>
            {onLoadSampleTasks && (
              <button className="btn btn-secondary" onClick={onLoadSampleTasks}>📥 טען דוגמאות</button>
            )}
          </div>
        </div>
      )}

      {tasks.length > 0 && totalOnDesk === 0 && (
        <div className="empty-state">
          <div className="empty-state-title">שולחן נקי 🎉</div>
          <div className="empty-state-subtitle">כל המשימות הפתוחות נמצאות אצל הלקוח, הרשות, או סגורות</div>
        </div>
      )}

      <DeskGroup
        title="דחוף — טפל עכשיו"
        color="red"
        icon="🔴"
        tasks={buckets.urgent}
        clientMap={clientMap}
        onSelectTask={onSelectTask}
        onToggleDone={onToggleDone}
        onAddTask={onAddTask}
      />

      <DeskGroup
        title="השבוע"
        color="orange"
        icon="📅"
        tasks={buckets.thisWeek}
        clientMap={clientMap}
        onSelectTask={onSelectTask}
        onToggleDone={onToggleDone}
        onAddTask={onAddTask}
      />

      <DeskGroup
        title="תקועות — צריך חשיבה"
        color="purple"
        icon="🟡"
        tasks={buckets.stuck}
        clientMap={clientMap}
        onSelectTask={onSelectTask}
        onToggleDone={onToggleDone}
        onAddTask={onAddTask}
      />

      <DeskGroup
        title="שאר המשימות"
        color="blue"
        icon="⏳"
        tasks={buckets.backlog}
        clientMap={clientMap}
        onSelectTask={onSelectTask}
        onToggleDone={onToggleDone}
        onAddTask={onAddTask}
      />
    </div>
  );
}

interface DeskGroupProps {
  title: string;
  color: 'red' | 'orange' | 'purple' | 'blue' | 'green';
  icon: string;
  tasks: Task[];
  clientMap: Map<string, Client>;
  onSelectTask: (id: string) => void;
  onToggleDone: (id: string) => void;
  onAddTask: () => void;
}

function DeskGroup({ title, color, icon, tasks, clientMap, onSelectTask, onToggleDone, onAddTask }: DeskGroupProps) {
  const [collapsed, setCollapsed] = useState(false);
  if (tasks.length === 0) return null;

  return (
    <section className={`task-group task-group-${color}`}>
      <header
        className="task-group-header"
        onClick={() => setCollapsed(c => !c)}
      >
        <span className={`task-group-arrow ${collapsed ? 'collapsed' : ''}`}>▾</span>
        <span className="task-group-icon">{icon}</span>
        <span className="task-group-title">{title}</span>
        <span className="task-group-count">{tasks.length}</span>
      </header>

      {!collapsed && (
        <div className="task-group-body">
          {tasks.map(t => (
            <TaskCard
              key={t.id}
              task={t}
              client={clientMap.get(t.clientId) ?? null}
              onClick={() => onSelectTask(t.id)}
              onToggleDone={() => onToggleDone(t.id)}
            />
          ))}
          <button className="task-quick-add" onClick={onAddTask}>
            <span>+</span>
            <span>הוסף משימה</span>
          </button>
        </div>
      )}
    </section>
  );
}
