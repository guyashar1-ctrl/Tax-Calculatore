// ─── לשונית משימות ────────────────────────────────────────────────────────
// משתמש ב-TaskBoard הראשי כדי להציג את משימות הלקוח ב-3 עמודות עם גרירה,
// בדיוק כמו במסך המשימות הראשי. הערות וציר פעילות נמצאים בלשונית הסקירה.

import { useMemo } from 'react';
import {
  Client, Task,
  TaskCategory, TaskProgress, BallWith,
} from '../../types';
import TaskBoard from '../TaskBoard';

interface Props {
  client: Client;
  clients: Client[];
  tasks: Task[];
  onAddTask: () => void;
  onSelectTask: (id: string) => void;
  onToggleTaskDone: (id: string) => void;
  onChangeStatus: (id: string, status: TaskProgress | 'done') => void;
  onChangeBall: (id: string, ball: BallWith) => void;
  onChangeCategory: (id: string, category: TaskCategory) => void;
  onReorder: (id: string, target: TaskProgress | 'done', beforeId: string | null) => void;
  onDeleteTask: (id: string) => void;
}

export default function TasksActivityTab({
  client, clients, tasks,
  onAddTask, onSelectTask, onToggleTaskDone,
  onChangeStatus, onChangeBall, onChangeCategory, onReorder, onDeleteTask,
}: Props) {
  // משימות הלקוח בלבד (TaskBoard מנהל פילטרים פנימיים שלו)
  const clientTasks = useMemo(
    () => tasks.filter(t => t.clientId === client.id),
    [tasks, client.id]
  );

  return (
    <div className="cw-tab cw-tasks-activity">
      <TaskBoard
        tasks={clientTasks}
        clients={clients}
        onSelectTask={onSelectTask}
        onAddTask={onAddTask}
        onToggleDone={onToggleTaskDone}
        onChangeStatus={onChangeStatus}
        onChangeBall={onChangeBall}
        onChangeCategory={onChangeCategory}
        onReorder={onReorder}
        onSelectClient={() => { /* כבר בתיק שלו, לא ניווט נוסף */ }}
        onDeleteTask={onDeleteTask}
      />
    </div>
  );
}
