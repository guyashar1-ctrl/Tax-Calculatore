// ─── לשונית משימות של הלקוח ───────────────────────────────────────────────
// מקור העיצוב: מסך10.dc.html בפרויקט Claude Design, ואפיון §4.10.
//
// זו אינה רשימת המשימות הראשית בזעיר אנפין. בתוך כרטיס לקוח כבר יודעים
// מי הלקוח, ולכן אין עמודת לקוח, אין סרגל סינון ואין כותרות עמודות —
// נשארות שלוש עמודות: סימון, שם (עם הערה מתחתיו), ותאריך.
//
// הקיבוץ כאן הוא לפי "אצל מי הכדור" ולא לפי דחיפות, כי בכרטיס של לקוח
// יחיד השאלה היא "על מי אני מחכה", לא "מה בוער בכל התיקים".

import { useMemo } from 'react';
import {
  Client, Task, BallWith,
  TaskCategory, TaskProgress,
  BALL_WITH_COLOR,
} from '../../types';
import { formatDate } from '../../utils/dateFormat';
import { dueTone } from '../../utils/taskUtils';
import { CalmEmpty } from '../ui/States';
import Icon from '../ui/Icon';

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

/** הקבוצות ותוויות הפעולה שלהן — מה עושים עם קבוצה, לא מה היא */
const GROUPS: { key: BallWith | 'done'; title: string; hint?: string }[] = [
  { key: 'me', title: 'הכדור אצלי', hint: 'לעבוד' },
  { key: 'client', title: 'ממתין ללקוח', hint: 'להתקשר' },
  { key: 'authority', title: 'ברשויות' },
  { key: 'stuck', title: 'תקועות' },
  { key: 'done', title: 'הושלמו' },
];

export default function TasksActivityTab({
  client, tasks, onAddTask, onSelectTask, onToggleTaskDone,
}: Props) {
  const clientTasks = useMemo(
    () => tasks.filter(t => t.clientId === client.id),
    [tasks, client.id]
  );

  const byGroup = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of clientTasks) {
      const key = t.status === 'done' ? 'done' : t.ballWith;
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      });
    }
    return map;
  }, [clientTasks]);

  const openCount = clientTasks.filter(t => t.status !== 'done').length;

  return (
    <div className="cw-tab cw-tasks-activity ct-tasks">
      <div className="ct-head">
        <div className="ct-head-title">
          <span className="ct-title">משימות</span>
          <span className="ct-count">{openCount}</span>
        </div>
        <button className="ui-btn ui-btn-primary" onClick={onAddTask}>+ משימה</button>
      </div>

      {clientTasks.length === 0 ? (
        <CalmEmpty text="אין משימות פתוחות ללקוח הזה" action={{ label: '+ משימה', onClick: onAddTask }} />
      ) : (
        GROUPS.map(g => {
          const items = byGroup.get(g.key) ?? [];
          if (items.length === 0) return null;
          return (
            <div key={g.key} className="ct-group">
              <div className="ct-group-head">
                <span
                  className="ct-group-title"
                  style={{ color: g.key === 'done' ? 'var(--ink-3)' : BALL_WITH_COLOR[g.key as BallWith] }}
                >
                  {g.title}
                </span>
                <span className="ct-group-count">{items.length}</span>
                {g.hint && <span className="ct-group-hint">{g.hint}</span>}
              </div>

              {items.map(t => {
                const done = t.status === 'done';
                const tone = dueTone(t);
                return (
                  <div
                    key={t.id}
                    className={`ct-row ${done ? 'is-done' : ''}`}
                    onClick={() => onSelectTask(t.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter') onSelectTask(t.id); }}
                  >
                    <button
                      className={`task-check ${done ? 'is-done' : ''}`}
                      onClick={e => { e.stopPropagation(); onToggleTaskDone(t.id); }}
                      aria-label={done ? 'סימון כלא הושלמה' : 'סימון כהושלמה'}
                    >
                      {done && <Icon name="check" size={12} />}
                    </button>

                    <div className="ct-main">
                      <span className="ct-row-title">{t.title}</span>
                      {t.description && <span className="ct-row-note">{t.description}</span>}
                    </div>

                    <span className={`ct-date due due-${done ? 'normal' : tone}`}>
                      {t.dueDate ? formatDate(t.dueDate, 'list') : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
}
