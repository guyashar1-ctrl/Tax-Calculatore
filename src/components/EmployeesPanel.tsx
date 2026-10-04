// ─── עובדי המשרד ─────────────────────────────────────────────────────────────
// רשימה, וחלון אחד להוספה ולעריכה — נפתח לפי בקשה (קודם טופס «עובד חדש» ישב
// תמיד מתחת לרשימה). כל שמירה כאן נכתבת מיד לטבלת העובדים ומחכה לתשובה:
// כשל מוצג בחלון, והחלון לא נסגר עד שהשמירה הצליחה.
import { useState } from 'react';
import { Employee } from '../types/clientWorkspace';
import { useEmployees } from '../hooks/useEmployees';
import { Client } from '../types';
import Modal from './ui/Modal';
import ConfirmDialog from './ui/ConfirmDialog';
import { extractErr } from './office/useOfficeDraft';

// צבעי זיהוי של עובדים — נשמרים במסד ומוצגים גם מחוץ למסך, לכן ערכים קבועים
const PRESET_COLORS = [
  '#3f5f8f', '#2e7d5b', '#b07515', '#6b4a87',
  '#b34141', '#17767c', '#a4406a', '#5c8a2e',
  '#7c5aa0', '#0f7a72',
];

interface Props {
  clients: Client[];
}

function makeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0].charAt(0) + parts[1].charAt(0);
}

function Avatar({ e, size = 34 }: { e: Pick<Employee, 'color' | 'initials'>; size?: number }) {
  return (
    <span className="emp-card-avatar" aria-hidden="true"
      style={{ background: e.color, width: size, height: size, flexShrink: 0 }}>{e.initials}</span>
  );
}

export default function EmployeesPanel({ clients }: Props) {
  const { employees, loading, error, saveEmployee, deleteEmployee } = useEmployees();
  const [editing, setEditing] = useState<Partial<Employee> | null>(null);
  const [removing, setRemoving] = useState<Employee | null>(null);
  const [removeErr, setRemoveErr] = useState<string | null>(null);

  const counts = new Map<string, number>();
  for (const c of clients) {
    if (c.assignedAccountantId) counts.set(c.assignedAccountantId, (counts.get(c.assignedAccountantId) ?? 0) + 1);
  }

  async function doRemove(e: Employee) {
    setRemoveErr(null);
    try {
      await deleteEmployee(e.id);
      setRemoving(null);
    } catch (err) {
      setRemoving(null);
      setRemoveErr(`המחיקה של ${e.name} נכשלה: ${extractErr(err)}`);
    }
  }

  return (
    <div>
      <div className="of-sec-head" style={{ marginBottom: 10 }}>
        <div>
          <p className="of-sec-sub" style={{ margin: 0 }}>
            {loading ? 'טוען…' : `${employees.length} עובדים · המטפל בכל לקוח נבחר מהרשימה הזו`}
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm"
          onClick={() => setEditing({ name: '', role: '', initials: '', color: PRESET_COLORS[employees.length % PRESET_COLORS.length] })}>
          ＋ עובד
        </button>
      </div>

      {error && <div className="of-error-box" role="alert">טעינת העובדים נכשלה: {error}</div>}
      {removeErr && <div className="of-error-box" role="alert">{removeErr}</div>}

      {!loading && employees.length === 0 && !error ? (
        <div className="of-empty">עוד לא נוספו עובדים.</div>
      ) : (
        <ul className="of-rows">
          {employees.map(e => {
            const n = counts.get(e.id) ?? 0;
            return (
              <li key={e.id} className="of-row">
                <Avatar e={e} />
                <div className="of-row-main">
                  <div className="of-row-title">{e.name}</div>
                  <div className="of-row-meta">{e.role} · {n === 0 ? 'אין לקוחות מוקצים' : n === 1 ? 'לקוח אחד' : `${n} לקוחות`}</div>
                </div>
                <div className="of-row-end">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(e)}>עריכה</button>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
                    onClick={() => { setRemoveErr(null); setRemoving(e); }}>מחיקה</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <EmployeeDialog initial={editing} existing={!!editing.id}
          onClose={() => setEditing(null)}
          onSave={async (emp) => { await saveEmployee(emp); setEditing(null); }} />
      )}

      {removing && (
        <ConfirmDialog
          title="מחיקת עובד"
          message={(counts.get(removing.id) ?? 0) > 0
            ? <>ל{removing.name} מוקצים {counts.get(removing.id)} לקוחות. אחרי המחיקה הם יופיעו כ«ללא מטפל». שום לקוח לא נמחק.</>
            : <>למחוק את {removing.name} מרשימת העובדים?</>}
          confirmLabel="מחיקה"
          onConfirm={() => void doRemove(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

function EmployeeDialog({ initial, existing, onClose, onSave }: {
  initial: Partial<Employee>;
  existing: boolean;
  onClose: () => void;
  onSave: (e: Employee) => Promise<void>;
}) {
  const [d, setD] = useState<Partial<Employee>>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const ok = !!d.name?.trim() && !!d.role?.trim();
  const initials = ((d.initials && d.initials.trim()) || makeInitials(d.name || ' ')).slice(0, 2);

  async function submit() {
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await onSave({
        id: d.id || `emp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: d.name!.trim(),
        role: d.role!.trim(),
        initials,
        color: d.color || PRESET_COLORS[0],
      });
    } catch (e) {
      setErr(`השמירה נכשלה: ${extractErr(e)}`);
      setBusy(false);
    }
  }

  return (
    <Modal title={existing ? `עריכת ${initial.name}` : 'עובד חדש'} onClose={onClose} dirty={dirty && !busy} width={460}
      footer={<>
        <button type="button" className="ui-btn ui-btn-ghost" onClick={onClose} disabled={busy}>ביטול</button>
        <button type="button" className="ui-btn ui-btn-primary" onClick={() => void submit()} disabled={busy || !ok}>
          {busy ? 'שומר…' : existing ? 'שמירה' : 'הוספה'}
        </button>
      </>}>
      <div className="of-fields" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <label className="of-field">
          <span className="of-field-label">שם מלא</span>
          <input value={d.name ?? ''} data-autofocus onChange={e => setD(v => ({ ...v, name: e.target.value }))} />
        </label>
        <label className="of-field">
          <span className="of-field-label">תפקיד</span>
          <input value={d.role ?? ''} onChange={e => setD(v => ({ ...v, role: e.target.value }))} placeholder="רו״ח / מנה״ח / מתמחה" />
        </label>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
          <label className="of-field" style={{ width: 130 }}>
            <span className="of-field-label">ראשי תיבות</span>
            <input value={d.initials ?? ''} maxLength={2} placeholder={d.name ? makeInitials(d.name) : ''}
              onChange={e => setD(v => ({ ...v, initials: e.target.value }))} />
          </label>
          <Avatar e={{ color: d.color || PRESET_COLORS[0], initials }} size={38} />
        </div>
        <div className="of-field">
          <span className="of-field-label">צבע</span>
          <div className="emp-color-row" role="radiogroup" aria-label="צבע">
            {PRESET_COLORS.map(c => (
              <button key={c} type="button" role="radio" aria-checked={d.color === c}
                className={`emp-color-swatch ${d.color === c ? 'sel' : ''}`} style={{ background: c }}
                onClick={() => setD(v => ({ ...v, color: c }))} aria-label={`צבע ${c}`} />
            ))}
          </div>
        </div>
      </div>
      {err && <div className="of-error-box" role="alert">{err}</div>}
    </Modal>
  );
}
