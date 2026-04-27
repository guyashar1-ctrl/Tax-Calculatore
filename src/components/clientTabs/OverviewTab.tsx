// ─── לשונית סקירה ─────────────────────────────────────────────────────────
// כרטיסי סטטוס, חובות קרובים, משימות פתוחות, פעילות + הוסף הערה, הערה מוצמדת.

import { useState } from 'react';
import { Client, Task, BALL_WITH_LABELS, BALL_WITH_BADGE, TASK_CATEGORY_LABELS } from '../../types';
import { ClientAlert, ACTIVITY_ICON, ACTIVITY_LABELS } from '../../types/clientWorkspace';
import { shortDate, relativeTime } from '../../utils/clientDerived';

interface Props {
  client: Client;
  tasks: Task[];
  alerts: ClientAlert[];
  openTasks: Task[];
  upcomingDebts: Task[];
  onPinNote: (text: string) => void;
  onAddNote: (text: string) => void;
  onGotoTab: (tab: 'overview' | 'personal' | 'tax' | 'docs' | 'tasks') => void;
  onSelectTask: (id: string) => void;
  onToggleTaskDone: (id: string) => void;
}

export default function OverviewTab({
  client,
  alerts,
  openTasks,
  upcomingDebts,
  onPinNote,
  onAddNote,
  onGotoTab,
  onSelectTask,
  onToggleTaskDone,
}: Props) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(client.pinnedNote ?? '');
  const [quickNote, setQuickNote] = useState('');
  const recentActivity = (client.activity ?? []).slice(0, 8);

  function saveNote() {
    onPinNote(noteDraft.trim());
    setEditingNote(false);
  }

  function submitQuickNote() {
    const txt = quickNote.trim();
    if (!txt) return;
    onAddNote(txt);
    setQuickNote('');
  }

  return (
    <div className="cw-overview">
      {/* ── שורה עליונה: כרטיסי סטטוס מהירים ── */}
      <div className="cw-stat-row">
        <button className="cw-stat-card" onClick={() => onGotoTab('tasks')}>
          <div className="cw-stat-num">{openTasks.length}</div>
          <div className="cw-stat-label">משימות פתוחות</div>
        </button>
        <button className="cw-stat-card warn" onClick={() => onGotoTab('tasks')} disabled={upcomingDebts.length === 0}>
          <div className="cw-stat-num">{upcomingDebts.length}</div>
          <div className="cw-stat-label">חובות קרובים</div>
        </button>
        <button className="cw-stat-card" onClick={() => onGotoTab('tax')}>
          <div className="cw-stat-num">{client.shaamStatus === 'active' ? '✓' : client.shaamStatus === 'inactive' ? '✗' : '?'}</div>
          <div className="cw-stat-label">שע״ם</div>
        </button>
      </div>

      {/* ── הערה מוצמדת ── */}
      <div className="cw-section pin-section">
        <div className="cw-section-head">
          <span>📌 הערה מוצמדת</span>
          {!editingNote && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setNoteDraft(client.pinnedNote ?? ''); setEditingNote(true); }}>
              {client.pinnedNote ? 'עריכה' : 'הוסף'}
            </button>
          )}
        </div>
        {editingNote ? (
          <div className="cw-pin-edit">
            <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} rows={3} placeholder="הערה חשובה שתופיע תמיד בראש התיק..."  />
            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingNote(false)}>בטל</button>
              <button className="btn btn-primary btn-sm" onClick={saveNote}>שמור הערה</button>
            </div>
          </div>
        ) : client.pinnedNote ? (
          <div className="cw-pin-text">{client.pinnedNote}</div>
        ) : (
          <div className="cw-empty">אין הערה מוצמדת</div>
        )}
      </div>

      {/* ── חובות קרובים ── */}
      <div className="cw-section">
        <div className="cw-section-head">
          <span>⏰ חובות קרובים (21 יום)</span>
          <button className="btn btn-ghost btn-sm" onClick={() => onGotoTab('tasks')}>לכל המשימות ←</button>
        </div>
        {upcomingDebts.length === 0 ? (
          <div className="cw-empty">אין חובות קרובים</div>
        ) : (
          <ul className="cw-task-list">
            {upcomingDebts.slice(0, 5).map(t => (
              <li key={t.id} className="cw-task-row" onClick={() => onSelectTask(t.id)}>
                <input
                  type="checkbox"
                  checked={false}
                  onClick={e => { e.stopPropagation(); onToggleTaskDone(t.id); }}
                  onChange={() => {}}
                />
                <span className="cw-task-title">{t.title}</span>
                <span className={`badge badge-gray cl-mini-badge`}>{TASK_CATEGORY_LABELS[t.category]}</span>
                <span className="cw-task-due">{shortDate(t.dueDate)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── משימות פתוחות + פעילות ── */}
      <div className="cw-grid-2">
        <div className="cw-section">
          <div className="cw-section-head">
            <span>✅ משימות פתוחות</span>
            <span className="cw-section-count">{openTasks.length}</span>
          </div>
          {openTasks.length === 0 ? (
            <div className="cw-empty">אין משימות פתוחות</div>
          ) : (
            <ul className="cw-task-list">
              {openTasks.slice(0, 6).map(t => (
                <li key={t.id} className="cw-task-row" onClick={() => onSelectTask(t.id)}>
                  <input
                    type="checkbox"
                    checked={false}
                    onClick={e => { e.stopPropagation(); onToggleTaskDone(t.id); }}
                    onChange={() => {}}
                  />
                  <span className="cw-task-title">{t.title}</span>
                  <span className={`badge ${BALL_WITH_BADGE[t.ballWith]} cl-mini-badge`}>{BALL_WITH_LABELS[t.ballWith]}</span>
                  {t.dueDate && <span className="cw-task-due">{shortDate(t.dueDate)}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="cw-section">
          <div className="cw-section-head">
            <span>📜 פעילות אחרונה</span>
          </div>

          {/* הוספת הערה מהירה — נכנסת לציר הפעילות */}
          <div className="cw-quick-note">
            <input
              type="text"
              value={quickNote}
              onChange={e => setQuickNote(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitQuickNote(); }}
              placeholder="📝 כתוב הערה ולחץ Enter..."
              disabled={!client.id}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={submitQuickNote}
              disabled={!client.id || !quickNote.trim()}
            >הוסף</button>
          </div>

          {recentActivity.length === 0 ? (
            <div className="cw-empty">אין פעילות עדיין</div>
          ) : (
            <ul className="cw-activity-list">
              {recentActivity.map(a => (
                <li key={a.id} className="cw-activity-row">
                  <span className="cw-act-icon" title={ACTIVITY_LABELS[a.kind]}>{ACTIVITY_ICON[a.kind]}</span>
                  <div className="cw-act-body">
                    <div className="cw-act-text">{a.text}</div>
                    <div className="cw-act-meta">
                      {a.authorName ? `${a.authorName} · ` : ''}{relativeTime(a.at)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── התראות מסכמות ── */}
      {alerts.length > 0 && (
        <div className="cw-section">
          <div className="cw-section-head"><span>🚨 התראות</span></div>
          <div className="cw-alert-grid">
            {alerts.map(a => (
              <div key={a.kind} className={`cw-alert-card cw-alert-${a.level}`}>
                <div className="cw-alert-text">{a.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
