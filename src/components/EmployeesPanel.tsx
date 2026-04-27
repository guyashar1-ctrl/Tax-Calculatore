// ─── ניהול עובדי המשרד ────────────────────────────────────────────────────
// יצירה, עריכה, מחיקה. ה-id נוצר אוטומטית. שדות: שם, תפקיד, ראשי תיבות, צבע.

import { useState } from 'react';
import { Employee } from '../types/clientWorkspace';
import { useEmployees } from '../hooks/useEmployees';
import { Client } from '../types';

const PRESET_COLORS = [
  '#2563eb', '#059669', '#d97706', '#7c3aed',
  '#dc2626', '#0891b2', '#be185d', '#65a30d',
  '#9333ea', '#0d9488',
];

interface Props {
  clients: Client[];
}

function makeInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0].charAt(0) + parts[1].charAt(0);
}

export default function EmployeesPanel({ clients }: Props) {
  const { employees, saveEmployee, deleteEmployee } = useEmployees();
  const [editing, setEditing] = useState<Employee | null>(null);
  const [draft, setDraft] = useState<Partial<Employee>>({ name: '', role: '', initials: '', color: PRESET_COLORS[0] });

  function startEdit(e: Employee) {
    setEditing(e);
    setDraft(e);
  }

  function startNew() {
    setEditing(null);
    setDraft({ name: '', role: '', initials: '', color: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)] });
  }

  function save() {
    if (!draft.name || !draft.role) return;
    const initials = (draft.initials && draft.initials.trim()) || makeInitials(draft.name);
    const e: Employee = {
      id: editing?.id || `emp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: draft.name.trim(),
      role: draft.role.trim(),
      initials: initials.slice(0, 2),
      color: draft.color || PRESET_COLORS[0],
    };
    saveEmployee(e);
    startNew();
  }

  function remove(id: string) {
    const assigned = clients.filter(c => c.assignedAccountantId === id).length;
    const msg = assigned > 0
      ? `${assigned} לקוחות מוקצים לעובד הזה. למחוק בכל זאת? (הם יוצגו כ"ללא מטפל")`
      : 'למחוק את העובד?';
    if (!confirm(msg)) return;
    deleteEmployee(id);
    if (editing?.id === id) startNew();
  }

  const counts = new Map<string, number>();
  for (const c of clients) {
    if (c.assignedAccountantId) counts.set(c.assignedAccountantId, (counts.get(c.assignedAccountantId) ?? 0) + 1);
  }

  return (
    <div className="emp-page">
      <div className="cl-list-header">
        <div>
          <h1 className="cl-list-title">עובדי המשרד</h1>
          <p className="cl-list-sub">{employees.length} עובדים · המטפל בכל לקוח נבחר מהרשימה הזו</p>
        </div>
      </div>

      <div className="emp-grid">
        {employees.map(e => {
          const count = counts.get(e.id) ?? 0;
          return (
            <div key={e.id} className="emp-card">
              <div className="emp-card-head">
                <span className="emp-card-avatar" style={{ background: e.color }}>{e.initials}</span>
                <div className="emp-card-name">
                  <div className="emp-card-fullname">{e.name}</div>
                  <div className="emp-card-role">{e.role}</div>
                </div>
              </div>
              <div className="emp-card-meta">
                <span className="emp-count-pill">{count} לקוחות</span>
              </div>
              <div className="emp-card-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => startEdit(e)}>עריכה</button>
                <button className="btn btn-ghost btn-sm" onClick={() => remove(e.id)} style={{ color: 'var(--red)' }}>מחק</button>
              </div>
            </div>
          );
        })}

        <div className="emp-card emp-card-add" onClick={startNew}>
          <div className="emp-add-plus">+</div>
          <div className="emp-add-text">הוסף עובד</div>
        </div>
      </div>

      <div className="cw-section emp-form-card">
        <div className="cw-section-head">
          <span>{editing ? `עריכת ${editing.name}` : '+ עובד חדש'}</span>
          {editing && <button className="btn btn-ghost btn-sm" onClick={startNew}>ביטול עריכה</button>}
        </div>
        <div className="form-grid form-grid-4">
          <div className="form-group">
            <label className="required">שם מלא</label>
            <input type="text" value={draft.name || ''} onChange={e => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="required">תפקיד</label>
            <input type="text" value={draft.role || ''} onChange={e => setDraft({ ...draft, role: e.target.value })} placeholder="רו״ח / מנה״ח / מתמחה" />
          </div>
          <div className="form-group">
            <label>ראשי תיבות (2 תווים)</label>
            <input type="text" maxLength={2} value={draft.initials || ''} onChange={e => setDraft({ ...draft, initials: e.target.value })} placeholder={draft.name ? makeInitials(draft.name) : ''} />
          </div>
          <div className="form-group">
            <label>תצוגה מקדימה</label>
            <span className="emp-card-avatar" style={{ background: draft.color, marginTop: '.2rem', width: 38, height: 38 }}>
              {(draft.initials || makeInitials(draft.name || ' ')).slice(0, 2)}
            </span>
          </div>
          <div className="form-group span-full">
            <label>צבע אווטאר</label>
            <div className="emp-color-row">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`emp-color-swatch ${draft.color === c ? 'sel' : ''}`}
                  style={{ background: c }}
                  onClick={() => setDraft({ ...draft, color: c })}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginTop: '.75rem', display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={save} disabled={!draft.name || !draft.role}>
            {editing ? 'עדכן' : 'הוסף עובד'}
          </button>
        </div>
      </div>
    </div>
  );
}
