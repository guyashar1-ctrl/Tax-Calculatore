import { useState, useEffect } from 'react';
import {
  Task,
  Client,
  SignatureRequest,
  TaskCategory,
  BallWith,
  TaskPriority,
  TaskProgress,
  TASK_CATEGORY_LABELS,
  TASK_PROGRESS_LABELS,
  BALL_WITH_LABELS,
  BALL_WITH_COLOR,

} from '../types';
import { SelectPills } from './ui/Chips';
import Icon from './ui/Icon';
import ConfirmDialog from './ui/ConfirmDialog';
import { formatDate } from '../utils/dateFormat';
import LinkedDocsWidget from './LinkedDocsWidget';
import TaskLinkedDocuments from './TaskLinkedDocuments';
import SignatureRequestEditor from './signatureRequest/SignatureRequestEditor';

interface Props {
  task: Task | null;                     // null = יצירה חדשה
  clients: Client[];
  presetClientId?: string | null;        // אם נפתח מתוך תיק לקוח — נעול
  onSave: (task: Task) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
  // אם המשתמש מסמן "שמור גם באנשי הקשר של הלקוח" בתוך עורך החתימה — נשמור גם את הלקוח
  onUpdateClient?: (client: Client) => void;
}

function blankTask(clientId: string): Task {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    clientId,
    category: 'not_selected',
    title: '',
    description: '',
    ballWith: 'me',
    status: 'open',
    progress: 'new',
    priority: 'normal',
    createdAt: now,
    updatedAt: now,
  };
}

const CATEGORIES: TaskCategory[] = [
  'annual_report', 'institutions', 'management', 'economic_work',
  'personal_report', 'cutoff', 'wealth_declaration', 'ongoing',
  'discussions', 'special_approval', 'not_selected',
];

const BALL_OPTIONS: BallWith[] = ['me', 'client', 'authority', 'stuck'];
const PROGRESS_OPTIONS: TaskProgress[] = ['new', 'in_progress'];

// משימה בלי לקוח היא לגיטימית (חידוש רישיון, דיווח של המשרד עצמו), אבל היא
// חייבת להיות בחירה ולא שכחה — ולכן ערך נפרד בתפריט ולא סתם "ריק".
// 'system' הוא המזהה שהאפליקציה נותנת ל-client_id ריק במסד (ראה dbMappers).
const INTERNAL = 'system';

export default function TaskForm({ task, clients, presetClientId, onSave, onCancel, onDelete, onUpdateClient }: Props) {
  // ‼ בלי ברירת מחדל ללקוח הראשון ברשימה: משימה שנשמרת על לקוח אקראי גרועה
  // ממשימה שדורשת בחירה.
  const [data, setData] = useState<Task>(task ?? blankTask(presetClientId ?? ''));
  const [showSignatureEditor, setShowSignatureEditor] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; client?: string }>({});
  const [confirmState, setConfirmState] = useState<'delete' | 'discard' | 'removeSig' | null>(null);

  useEffect(() => {
    if (task) setData(task);
  }, [task]);

  // יציאה עם שינויים שלא נשמרו שואלת לפני שהיא מוחקת עבודה (§3.11)
  function requestClose() {
    if (dirty) { setConfirmState('discard'); return; }
    onCancel();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); requestClose(); }
      // ⌘/Ctrl+Enter שומר בלי לחפש את הכפתור בעכבר (§6.4)
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        (document.getElementById('task-form') as HTMLFormElement | null)?.requestSubmit();
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  });

  const isEditing = !!task;
  const isLocked = !!presetClientId;
  const linkedClient = clients.find(c => c.id === data.clientId);
  // משימה פנימית אינה תלויה בלקוח — ולכן גם אין לה תיק מסמכים או מסמך לחתימה
  const hasClient = !!data.clientId && data.clientId !== INTERNAL;
  const sigReq = data.signatureRequest;

  function upd<K extends keyof Task>(key: K, val: Task[K]) {
    setDirty(true);
    setData(d => ({ ...d, [key]: val, updatedAt: new Date().toISOString() }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // שגיאה נכתבת ליד השדה שגרם לה, לא בחלונית של הדפדפן (§4.4)
    const next: { title?: string; client?: string } = {};
    if (!data.clientId) next.client = 'חובה';
    if (!data.title.trim()) next.title = 'חובה';
    setErrors(next);
    if (Object.keys(next).length) return;
    onSave({ ...data, title: data.title.trim() });
  }

  const clientOptions = [...clients].sort((a, b) =>
    `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'he')
  );

  return (
    <div className="modal-backdrop" onClick={requestClose}>
      <div className="modal task-modal" role="dialog" aria-modal="true"
           aria-label={isEditing ? 'עריכת משימה' : 'משימה חדשה'}
           onClick={(e) => e.stopPropagation()}>
        <form id="task-form" onSubmit={handleSubmit}>
          <div className="modal-header">
            <h3>{isEditing ? 'עריכת משימה' : 'משימה חדשה'}</h3>
            <button type="button" className="ui-icon-btn" onClick={requestClose} aria-label="סגירה">
              <Icon name="close" />
            </button>
          </div>

          <div className="modal-body">
            <div className="form-grid form-grid-2">
              <div className="form-group span-full">
                <label className="required">כותרת</label>
                <input
                  type="text"
                  className={errors.title ? 'field-missing' : ''}
                  value={data.title}
                  onChange={(e) => upd('title', e.target.value)}
                  placeholder="לדוגמה: להכין דוח שנתי 2024"
                  aria-invalid={!!errors.title}
                  autoFocus
                />
                {errors.title && <span className="field-error">{errors.title}</span>}
              </div>

              <div className="form-group">
                <label className="required">לקוח</label>
                <select
                  className={errors.client ? 'field-missing' : ''}
                  value={data.clientId}
                  onChange={(e) => {
                    if (e.target.value) setErrors(prev => ({ ...prev, client: undefined }));
                    upd('clientId', e.target.value);
                  }}
                  disabled={isLocked}
                  aria-invalid={!!errors.client}
                >
                  {!isLocked && <option value="">— בחר —</option>}
                  {clientOptions.map(c => (
                    <option key={c.id} value={c.id}>
                      {`${c.lastName} ${c.firstName}`.trim() || c.idNumber || 'ללא שם'}
                    </option>
                  ))}
                  {!isLocked && <option value={INTERNAL}>— משימה פנימית (ללא לקוח) —</option>}
                </select>
                {errors.client && <span className="field-error">חובה לבחור לקוח, או לסמן שזו משימה פנימית</span>}
                {!errors.client && data.clientId === INTERNAL && (
                  <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
                    לא תופיע בכרטיס של אף לקוח.
                  </span>
                )}
              </div>

              <div className="form-group">
                <label>סוג משימה</label>
                <select value={data.category} onChange={(e) => upd('category', e.target.value as TaskCategory)}>
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{TASK_CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>סטטוס</label>
                <select
                  value={data.status === 'done' ? 'done' : (data.progress || 'new')}
                  onChange={(e) => {
                    const v = e.target.value;
                    const now = new Date().toISOString();
                    setDirty(true);
                    if (v === 'done') {
                      setData(d => ({ ...d, status: 'done', completedAt: d.completedAt || now, updatedAt: now }));
                    } else {
                      setData(d => ({ ...d, status: 'open', progress: v as TaskProgress, completedAt: undefined, updatedAt: now }));
                    }
                  }}
                >
                  {PROGRESS_OPTIONS.map(p => (
                    <option key={p} value={p}>{TASK_PROGRESS_LABELS[p]}</option>
                  ))}
                  <option value="done">הושלמה</option>
                </select>
              </div>

              <div className="form-group">
                <label>הכדור אצל</label>
                {/* גלולה שחורה — הבחירה משנה את מה שנשמר, לא את מה שמוצג (D1) */}
                <SelectPills
                  label="הכדור אצל"
                  size="sm"
                  value={data.ballWith}
                  onChange={(b) => upd('ballWith', b)}
                  options={BALL_OPTIONS.map(b => ({
                    value: b,
                    label: BALL_WITH_LABELS[b],
                    color: BALL_WITH_COLOR[b],
                  }))}
                />
              </div>

              <div className="form-group">
                <label>דחיפות</label>
                <select value={data.priority} onChange={(e) => upd('priority', e.target.value as TaskPriority)}>
                  <option value="normal">רגיל</option>
                  <option value="urgent">דחוף</option>
                </select>
              </div>

              <div className="form-group span-full">
                <label>תאריך יעד</label>
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

              {/* מסמכים מקושרים למשימה — נשמרים בתיק המסמכים של הלקוח */}
              {hasClient && (
              <div className="form-group span-full">
                <label>מסמכים מקושרים</label>
                <LinkedDocsWidget
                  clientId={data.clientId}
                  linkKey={`task:${data.id}`}
                  linkLabel={`מסמך משימה — ${data.title || 'ללא כותרת'}`}
                  defaultCategory="other"
                  compact
                />
              </div>
              )}

              {/* קישור למסמך שכבר קיים בתיק המסמכים (M3) — נפרד מהצירוף הישיר למעלה */}
              {hasClient && (
              <div className="form-group span-full">
                <label>מסמכים מהתיק</label>
                <TaskLinkedDocuments clientId={data.clientId} taskId={data.id} taskTitle={data.title} />
              </div>
              )}

              {/* בקשת חתימה על PDF — שלב 1 (ללא שליחה אמיתית עדיין) */}
              {hasClient && (
              <div className="form-group span-full">
                <label>מסמך לחתימה</label>
                {sigReq ? (
                  <div className="task-sig-summary">
                    <div className="task-sig-line">
                      <strong>{sigReq.pdfFileName || '(אין PDF)'}</strong>
                      <span className="task-sig-meta">
                        {sigReq.signers.length} חותמים · {sigReq.fields.length} סימונים
                        {sigReq.requireOrder ? ' · בסדר חתימה' : ' · במקביל'}
                      </span>
                    </div>
                    <div className="task-sig-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowSignatureEditor(true)}
                        disabled={!data.clientId}
                      >ערוך</button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--red)' }}
                        onClick={() => setConfirmState('removeSig')}
                      >הסר</button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowSignatureEditor(true)}
                    disabled={!data.clientId}
                  >
                    הוסף מסמך לחתימה
                  </button>
                )}
              </div>
              )}
            </div>
          </div>

          <div className="modal-footer">
            {isEditing && onDelete && (
              <button type="button" className="ui-linkbtn task-delete-link" onClick={() => setConfirmState('delete')}>
                מחיקת המשימה
              </button>
            )}
            <div style={{ flex: 1 }} />
            {/* מתי נוצרה ומתי נסגרה — שורה שקטה, לא שדה בטופס (§4.4) */}
            {isEditing && (
              <span className="task-meta-line">
                נוצרה {formatDate(data.createdAt, 'form')}
                {data.completedAt ? ` · הושלמה ${formatDate(data.completedAt, 'form')}` : ''}
              </span>
            )}
            <button type="button" className="ui-btn ui-btn-ghost" onClick={requestClose}>ביטול</button>
            <button type="submit" className="ui-btn ui-btn-primary">
              {isEditing ? 'שמירה' : 'יצירה'}
            </button>
          </div>
        </form>
      </div>

      {showSignatureEditor && (
        <SignatureRequestEditor
          client={linkedClient}
          taskId={data.id}
          initial={data.signatureRequest}
          onSave={(req: SignatureRequest, updatedClient) => {
            setData(d => ({ ...d, signatureRequest: req, updatedAt: new Date().toISOString() }));
            if (updatedClient && onUpdateClient) onUpdateClient(updatedClient);
            setShowSignatureEditor(false);
          }}
          onCancel={() => setShowSignatureEditor(false)}
        />
      )}

      {confirmState === 'delete' && (
        <ConfirmDialog
          title="מחיקת משימה"
          message={<>למחוק את ״{data.title || 'המשימה'}״? הפעולה אינה הפיכה.</>}
          confirmLabel="מחיקה"
          onConfirm={() => { setConfirmState(null); onDelete?.(data.id); }}
          onCancel={() => setConfirmState(null)}
        />
      )}

      {confirmState === 'discard' && (
        <ConfirmDialog
          title="לצאת בלי לשמור?"
          message="השינויים שעשית במשימה יאבדו."
          confirmLabel="צא בלי לשמור"
          cancelLabel="הישאר"
          onConfirm={() => { setConfirmState(null); onCancel(); }}
          onCancel={() => setConfirmState(null)}
        />
      )}

      {confirmState === 'removeSig' && (
        <ConfirmDialog
          title="הסרת בקשת חתימה"
          message="להסיר את בקשת החתימה מהמשימה? הסימונים שהגדרת על המסמך יימחקו."
          confirmLabel="הסרה"
          onConfirm={() => {
            setConfirmState(null);
            setDirty(true);
            setData(d => ({ ...d, signatureRequest: undefined, updatedAt: new Date().toISOString() }));
          }}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}
