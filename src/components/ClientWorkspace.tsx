// ─── תיק לקוח — Workspace ─────────────────────────────────────────────────
// Header קבוע + 5 לשוניות. החלפה מלאה ל-ClientForm הישן.

import { useState, useEffect, useMemo } from 'react';
import { Client, Task, REPRESENTATION_STATUS_LABELS, REPRESENTATION_STATUS_BADGE, VATStatus, IncomeTaxType } from '../types';
import { ActivityEntry, ClientAlert, SHAAM_STATUS_BADGE } from '../types/clientWorkspace';
import { useEmployees } from '../hooks/useEmployees';
import { useDocumentDB } from '../hooks/useIndexedDB';
import { computeClientAlerts, getClientOpenTasks, getUpcomingDebts } from '../utils/clientDerived';
import OverviewTab from './clientTabs/OverviewTab';
import PersonalContactsTab from './clientTabs/PersonalContactsTab';
import TaxNITab from './clientTabs/TaxNITab';
import TaxProfileTab from './clientTabs/TaxProfileTab';
import DocumentsTab from './clientTabs/DocumentsTab';
import { useClientTaxSessions } from '../features/annualReport/useClientTaxSessions';
import TasksActivityTab from './clientTabs/TasksActivityTab';
import SendIntakeModal from './SendIntakeModal';

const VAT_LABELS: Record<VATStatus, string> = {
  authorizedDealer: 'עוסק מורשה',
  exemptDealer: 'עוסק פטור',
  none: 'אין מע״מ',
};

const IT_LABELS: Record<IncomeTaxType, string> = {
  employee: 'שכיר',
  selfEmployed: 'עצמאי',
  both: 'שכיר + עצמאי',
  rentalOnly: 'שכירות',
  other: 'אחר',
};

type TabId = 'overview' | 'personal' | 'tax' | 'taxProfile' | 'docs' | 'tasks';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'overview',   label: 'סקירה',                icon: '📋' },
  { id: 'personal',   label: 'פרטים אישיים וקשרים', icon: '👤' },
  { id: 'tax',        label: 'מיסוי וביטוח לאומי',  icon: '🏛️' },
  { id: 'taxProfile', label: 'פרופיל מס',            icon: '🧬' },
  { id: 'docs',       label: 'מסמכים',               icon: '📁' },
  { id: 'tasks',      label: 'משימות',               icon: '✅' },
];

interface Props {
  client: Client | null;
  clients: Client[];
  tasks: Task[];
  onSave: (client: Client) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
  onAddTaskForClient: (clientId: string) => void;
  onSelectTask: (id: string) => void;
  onToggleTaskDone: (id: string) => void;
  // הועבר מה-TaskBoard הראשי כדי להציג גם בלשונית של הלקוח
  onChangeTaskStatus: (id: string, progress: import('../types').TaskProgress | 'done') => void;
  onChangeTaskBall: (id: string, ball: import('../types').BallWith) => void;
  onChangeTaskCategory: (id: string, category: import('../types').TaskCategory) => void;
  onReorderTask: (id: string, targetProgress: import('../types').TaskProgress | 'done', beforeId: string | null) => void;
  onDeleteTask: (id: string) => void;
  // פתיחת הדוח השנתי לשנה מסוימת (מתוך תמונת המס בכרטיס)
  onOpenAnnualReport?: (clientId: string, taxYear: number) => void;
}

function newEmptyClient(): Client {
  const now = new Date().toISOString();
  return {
    id: '',
    idNumber: '', firstName: '', lastName: '',
    birthDate: '', gender: 'male',
    phone: '', email: '', city: '', address: '',
    incomeTaxType: 'employee', niType: 'employee', vatStatus: 'none',
    businessDescription: '', hasExemptFromWithholding: false,
    hasTaxCoordination: false, taxCoordinationDetails: '',
    familyStatus: 'single',
    spouseName: '', spouseIdNumber: '', spouseWorking: false, spouseIncome: 0,
    spouse: null, children: [],
    isNewImmigrant: false, aliyahYear: 0,
    isReturningResident: false, returningYear: 0,
    disabilityPercentage: 0, disabilityType: '',
    hasAcademicDegree: false, academicDegreeYear: 0, academicDegreeType: '',
    completedIdf: false, idfReleaseYear: 0,
    completedNationalService: false, nationalServiceYear: 0,
    qualifyingSettlementId: '', qualifyingSettlementOverride: false, qualifyingSettlementCreditPoints: 0,
    hasResidentialProperty: false, propertyAddress: '', numberOfProperties: 0,
    hasPension: false, pensionFundName: '',
    employeePensionPct: 0, employerPensionPct: 0,
    hasKupotGemel: false, hasKrenHashtalmut: false, krenHashtalmutMonthly: 0,
    notes: '',
    representationStatus: 'active',
    assignedAccountantId: 'emp-self',
    tags: [], additionalContacts: [], activity: [],
    createdAt: now, updatedAt: now,
  };
}

export default function ClientWorkspace({
  client: initialClient,
  clients,
  tasks,
  onSave,
  onCancel,
  onDelete,
  onAddTaskForClient,
  onSelectTask,
  onToggleTaskDone,
  onChangeTaskStatus,
  onChangeTaskBall,
  onChangeTaskCategory,
  onReorderTask,
  onDeleteTask,
  onOpenAnnualReport,
}: Props) {
  const isNew = !initialClient;
  const [client, setClient] = useState<Client>(initialClient ?? newEmptyClient());
  const [tab, setTab] = useState<TabId>('overview');
  const [docCategories, setDocCategories] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [intakeModalOpen, setIntakeModalOpen] = useState(false);

  const db = useDocumentDB();
  const { employees, findEmployee } = useEmployees();
  const { sessions: taxSessions, loading: taxSessionsLoading } = useClientTaxSessions(client.id || undefined);

  const openYear = onOpenAnnualReport && client.id
    ? (taxYear: number) => onOpenAnnualReport(client.id, taxYear)
    : undefined;

  useEffect(() => {
    if (initialClient) {
      setClient(initialClient);
      setDirty(false);
    } else {
      setClient(newEmptyClient());
      setDirty(false);
    }
  }, [initialClient?.id]);

  useEffect(() => {
    if (!client.id) return;
    let cancelled = false;
    db.getDocsByClient(client.id).then(docs => {
      if (cancelled) return;
      setDocCategories(new Set(docs.map(d => d.category)));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [client.id]);

  function update<K extends keyof Client>(key: K, value: Client[K]) {
    setClient(c => ({ ...c, [key]: value }));
    setDirty(true);
  }

  function patch(partial: Partial<Client>) {
    setClient(c => ({ ...c, ...partial }));
    setDirty(true);
  }

  function appendActivity(entry: Omit<ActivityEntry, 'id' | 'at'>) {
    const a: ActivityEntry = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      at: new Date().toISOString(),
      ...entry,
    };
    const next = [a, ...(client.activity ?? [])];
    setClient(c => ({ ...c, activity: next }));
    setDirty(true);
    // שמירה מיידית של פעילות (לא דורש "שמור")
    handleSaveImmediate({ ...client, activity: next });
  }

  // שינוי תיקי רשויות מתמונת המס (למשל החלפת בן הזוג הרשום) — נשמר מיד, בלי "שמור"
  function updateTaxFilesImmediate(files: import('../types').TaxFileInfo[]) {
    const next = { ...client, taxFiles: files };
    setClient(next);
    handleSaveImmediate(next);
  }

  function handleSaveImmediate(c: Client) {
    if (!c.id) return;  // ללקוח חדש אין שמירה מיידית
    onSave({ ...c, updatedAt: new Date().toISOString() });
    setDirty(false);
  }

  function handleSave() {
    const now = new Date().toISOString();
    const id = client.id || crypto.randomUUID();
    const c: Client = {
      ...client,
      id,
      createdAt: client.createdAt || now,
      updatedAt: now,
    };
    onSave(c);
    setClient(c);
    setDirty(false);
  }

  // ── חישובים נגזרים ──
  const alerts: ClientAlert[] = useMemo(
    () => computeClientAlerts(client, tasks, docCategories),
    [client, tasks, docCategories]
  );
  const openTasks = useMemo(() => getClientOpenTasks(client.id, tasks), [client.id, tasks]);
  const upcomingDebts = useMemo(() => getUpcomingDebts(client.id, tasks), [client.id, tasks]);

  const fullName = `${client.firstName} ${client.lastName}`.trim() || (isNew ? 'לקוח חדש' : '(ללא שם)');
  const status = client.representationStatus ?? 'active';
  const employee = findEmployee(client.assignedAccountantId);

  return (
    <div className="cw-root">
      {/* ─── Header קבוע ───────────────────────────────────────── */}
      <div className="cw-header">
        <div className="cw-header-top">
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>← לקוחות</button>

          <div className="cw-identity">
            <div className="cw-avatar">
              {`${client.firstName.charAt(0) || '?'}${client.lastName.charAt(0) || ''}`}
            </div>
            <div>
              <div className="cw-name">{fullName}</div>
              <div className="cw-id-row">
                {client.idNumber && <span className="mono-text">ת.ז. {client.idNumber}</span>}
                {client.phone && <span className="mono-text" dir="ltr">{client.phone}</span>}
                {client.city && <span>{client.city}</span>}
              </div>
            </div>
          </div>

          <div className="cw-header-actions">
            {dirty && <span className="cw-dirty-flag">שינויים לא שמורים</span>}
            {!isNew && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setIntakeModalOpen(true)}
                title="שליחת קישור שאלון היכרות/עדכון למייל הלקוח"
              >📨 שלח שאלון</button>
            )}
            <button className="btn btn-primary" onClick={handleSave} disabled={!dirty}>שמור</button>
            {!isNew && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => { if (confirm(`למחוק את ${fullName}?`)) onDelete(client.id); }}
                title="מחיקה"
              >🗑</button>
            )}
          </div>
        </div>

        {/* Header — chips & meta */}
        <div className="cw-header-chips">
          <span className={`badge ${REPRESENTATION_STATUS_BADGE[status]}`}>
            {REPRESENTATION_STATUS_LABELS[status]}
          </span>

          {employee ? (
            <span className="cw-emp-chip" title={employee.role}>
              <span className="cw-emp-dot" style={{ background: employee.color }}>{employee.initials}</span>
              {employee.name}
            </span>
          ) : (
            <span className="cw-emp-chip muted">ללא מטפל</span>
          )}

          <span className="cw-tax-chip">💼 {IT_LABELS[client.incomeTaxType]}</span>
          <span className="cw-tax-chip">📊 {VAT_LABELS[client.vatStatus]}</span>
          <span className="cw-tax-chip">🏥 ב״ל {client.niType === 'employee' ? 'שכיר' : client.niType === 'selfEmployed' ? 'עצמאי' : client.niType === 'employeeAndSE' ? 'משולב' : client.niType}</span>

          {client.shaamStatus && (
            <span className={`badge ${SHAAM_STATUS_BADGE[client.shaamStatus]}`}>
              שע״ם: {client.shaamStatus === 'active' ? 'פעיל' : client.shaamStatus === 'inactive' ? 'לא פעיל' : client.shaamStatus === 'pending' ? 'בטיפול' : 'לא ידוע'}
            </span>
          )}

          {(client.tags ?? []).map(t => <span key={t} className="cw-tag">#{t}</span>)}
        </div>

        {/* Header — alerts strip */}
        {alerts.length > 0 && (
          <div className="cw-alerts">
            {alerts.map(a => (
              <span key={a.kind} className={`cw-alert cw-alert-${a.level}`}>
                {a.text}
              </span>
            ))}
          </div>
        )}

        {/* Header — tabs */}
        <div className="cw-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`cw-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
              {t.id === 'tasks' && openTasks.length > 0 && (
                <span className="cw-tab-badge">{openTasks.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ─── תוכן הלשונית ─────────────────────────────────────── */}
      <div className="cw-body">
        {tab === 'overview' && (
          <OverviewTab
            client={client}
            tasks={tasks}
            alerts={alerts}
            openTasks={openTasks}
            upcomingDebts={upcomingDebts}
            onPinNote={(note) => update('pinnedNote', note)}
            onAddNote={(text) => appendActivity({ kind: 'note', text })}
            onGotoTab={(t) => setTab(t)}
            onSelectTask={onSelectTask}
            onToggleTaskDone={onToggleTaskDone}
            taxSessions={taxSessions}
            taxSessionsLoading={taxSessionsLoading}
            onOpenYear={openYear}
            onUpdateTaxFiles={updateTaxFilesImmediate}
          />
        )}

        {tab === 'personal' && (
          <PersonalContactsTab
            client={client}
            update={update}
            patch={patch}
            employees={employees}
          />
        )}

        {tab === 'tax' && (
          <TaxNITab
            client={client}
            update={update}
          />
        )}

        {tab === 'taxProfile' && (
          <TaxProfileTab
            client={client}
            sessions={taxSessions}
            loading={taxSessionsLoading}
            onOpenYear={openYear}
            onUpdateTaxFiles={updateTaxFilesImmediate}
          />
        )}

        {tab === 'docs' && (
          <DocumentsTab
            client={client}
            allClients={clients}
            onDocChange={() => {
              // ריענון רשימת קטגוריות
              db.getDocsByClient(client.id).then(docs =>
                setDocCategories(new Set(docs.map(d => d.category)))
              ).catch(() => {});
            }}
          />
        )}

        {tab === 'tasks' && (
          <TasksActivityTab
            client={client}
            clients={clients}
            tasks={tasks}
            onAddTask={() => onAddTaskForClient(client.id)}
            onSelectTask={onSelectTask}
            onToggleTaskDone={onToggleTaskDone}
            onChangeStatus={onChangeTaskStatus}
            onChangeBall={onChangeTaskBall}
            onChangeCategory={onChangeTaskCategory}
            onReorder={onReorderTask}
            onDeleteTask={onDeleteTask}
          />
        )}
      </div>

      {intakeModalOpen && (
        <SendIntakeModal
          client={client}
          onClose={() => setIntakeModalOpen(false)}
          onSent={(email) => appendActivity({ kind: 'manual', text: `📨 נשלח שאלון עדכון אל ${email}` })}
        />
      )}
    </div>
  );
}
