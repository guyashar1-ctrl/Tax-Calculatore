import { useState } from 'react';
import {
  Client,
  RepresentationRequest,
  RequestSubmission,
  AccountantPartB,
  Task,
  TaskCategory,
  TaskProgress,
  BallWith,
} from './types';
import { ExtractedClientData } from './utils/geminiVision';
import { useDocumentDB } from './hooks/useIndexedDB';
import { useClients } from './hooks/useClients';
import { useTasks } from './hooks/useTasks';
import { useRepresentationRequests } from './hooks/useRepresentationRequests';
import { SAMPLE_CLIENTS } from './data/sampleClients';
import { SAMPLE_TASKS } from './data/sampleTasks';
import ClientList from './components/ClientList';
import ClientWorkspace from './components/ClientWorkspace';
import EmployeesPanel from './components/EmployeesPanel';
import TaxCalculator from './components/TaxCalculator';
import DocumentManager from './components/DocumentManager';
import { enrichClientsWithWorkspace } from './data/sampleClientWorkspace';
import TaxReferencePanel from './components/TaxReferencePanel';
import RepresentationRequestForm from './components/RepresentationRequestForm';
import RepresentationFillForm from './components/RepresentationFillForm';
import RepresentationRequestReview from './components/RepresentationRequestReview';
import MyDesk from './components/MyDesk';
import TaskBoard from './components/TaskBoard';
import TaskForm from './components/TaskForm';
import LoginScreen from './components/LoginScreen';
import QuickCreateClient, { QuickClientBasics } from './components/QuickCreateClient';
import TestSignaturePage from './components/signatureRequest/__TestSignaturePage';
import LegacyMigrationBanner from './components/LegacyMigrationBanner';
import { useAuth } from './hooks/useAuth';

type View =
  | 'myDesk'
  | 'tasks'
  | 'list'
  | 'form'
  | 'employees'
  | 'calculator'
  | 'documents'
  | 'reference'
  | 'requestNew'
  | 'requestReview'
  | 'requestFill';

/** יוצר Client חדש עם ערכי ברירת מחדל */
function makeEmptyClient(id: string, partial: Partial<Client> = {}): Client {
  const now = new Date().toISOString();
  return {
    id,
    idNumber: '',
    firstName: '',
    lastName: '',
    birthDate: '',
    gender: 'male',
    phone: '',
    email: '',
    city: '',
    address: '',
    incomeTaxType: 'employee',
    vatStatus: 'none',
    businessDescription: '',
    hasExemptFromWithholding: false,
    niType: 'employee',
    hasTaxCoordination: false,
    taxCoordinationDetails: '',
    familyStatus: 'single',
    spouseName: '',
    spouseIdNumber: '',
    spouseWorking: false,
    spouseIncome: 0,
    spouse: null,
    children: [],
    isNewImmigrant: false,
    aliyahYear: 0,
    isReturningResident: false,
    returningYear: 0,
    disabilityPercentage: 0,
    disabilityType: '',
    hasAcademicDegree: false,
    academicDegreeYear: 0,
    academicDegreeType: '',
    completedIdf: false,
    idfReleaseYear: 0,
    completedNationalService: false,
    nationalServiceYear: 0,
    qualifyingSettlementId: '',
    qualifyingSettlementOverride: false,
    qualifyingSettlementCreditPoints: 0,
    hasResidentialProperty: false,
    propertyAddress: '',
    numberOfProperties: 0,
    hasPension: false,
    pensionFundName: '',
    employeePensionPct: 0,
    employerPensionPct: 0,
    hasKupotGemel: false,
    hasKrenHashtalmut: false,
    krenHashtalmutMonthly: 0,
    notes: '',
    representationStatus: 'active',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

/** מוסכמת שמות קבצים: "שם_משפחה שם_פרטי סוג מסמך.ext" */
function standardFileName(lastName: string, firstName: string, docLabel: string, originalName: string): string {
  const ext = (originalName.split('.').pop() || '').toLowerCase();
  // נקיון תווים בעייתיים
  const clean = (s: string) => s.replace(/[\\/:*?"<>|]/g, '').trim();
  const ln = clean(lastName) || 'לקוח';
  const fn = clean(firstName);
  const label = clean(docLabel);
  const baseName = [ln, fn, label].filter(Boolean).join(' ');
  return ext ? `${baseName}.${ext}` : baseName;
}

export default function App() {
  // ⚠ זמני: דף בדיקה של עורך החתימה ללא התחברות. יוסר לאחר אימות.
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-sig')) {
    return <TestSignaturePage />;
  }

  const { user, loading: authLoading, displayName, avatarUrl, signOut } = useAuth();

  const { clients, addClient, updateClient, deleteClient: removeClient, bulkAddClients } = useClients(user?.id);
  const { tasks, addTask, updateTask, bulkUpdateTasks, deleteTask: removeTask, bulkAddTasks } = useTasks(user?.id);
  const { requests, addRequest, updateRequest, deleteRequest: removeRequest } = useRepresentationRequests(user?.id);

  const [view, setView] = useState<View>('tasks');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [taskModalState, setTaskModalState] = useState<{ task: Task | null; presetClientId?: string | null } | null>(null);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const db = useDocumentDB();

  // ── ניהול משימות ───────────────────────────────────────────────────────
  async function handleSaveTask(task: Task) {
    const exists = tasks.some(t => t.id === task.id);
    if (exists) {
      await updateTask(task);
    } else {
      await addTask(task);
    }
    setTaskModalState(null);
  }

  async function handleDeleteTask(id: string) {
    await removeTask(id);
    setTaskModalState(null);
  }

  async function handleToggleTaskDone(id: string) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const now = new Date().toISOString();
    const updated: Task = t.status === 'open'
      ? { ...t, status: 'done', completedAt: now }
      : { ...t, status: 'open', progress: t.progress || 'in_progress', completedAt: undefined };
    await updateTask(updated);
  }

  /** שינוי סטטוס ישיר מהלוח — new/in_progress/done */
  async function handleChangeTaskStatus(id: string, status: TaskProgress | 'done') {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const now = new Date().toISOString();
    const updated: Task = status === 'done'
      ? { ...t, status: 'done', completedAt: t.completedAt || now }
      : { ...t, status: 'open', progress: status, completedAt: undefined };
    await updateTask(updated);
  }

  async function handleChangeTaskBall(id: string, ball: BallWith) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    await updateTask({ ...t, ballWith: ball });
  }

  async function handleChangeTaskCategory(id: string, category: TaskCategory) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    await updateTask({ ...t, category });
  }

  /**
   * גרירה ושחרור של משימה:
   * - targetStatus הוא 'new' | 'in_progress' | 'done' (קבוצת היעד)
   * - beforeId = המשימה שאליה נעצור *לפניה* (null = לסוף הקבוצה)
   * משנה גם סטטוס (אם לא תואם) וגם sortOrder של משימות באותה קבוצה.
   */
  async function handleReorderTask(id: string, targetStatus: TaskProgress | 'done', beforeId: string | null) {
    const moving = tasks.find(t => t.id === id);
    if (!moving) return;
    const now = new Date().toISOString();

    const updatedMoving: Task = targetStatus === 'done'
      ? { ...moving, status: 'done', completedAt: moving.completedAt || now }
      : { ...moving, status: 'open', progress: targetStatus, completedAt: undefined };

    const inGroup = tasks
      .filter(t => t.id !== id)
      .filter(t => {
        if (targetStatus === 'done') return t.status === 'done';
        return t.status === 'open' && (t.progress || 'new') === targetStatus;
      })
      .sort((a, b) => {
        const ao = a.sortOrder, bo = b.sortOrder;
        if (ao !== undefined && bo !== undefined) return ao - bo;
        if (ao !== undefined) return -1;
        if (bo !== undefined) return 1;
        return a.createdAt.localeCompare(b.createdAt);
      });

    const idx = beforeId === null ? inGroup.length : inGroup.findIndex(t => t.id === beforeId);
    const insertAt = idx === -1 ? inGroup.length : idx;
    const nextGroup = [...inGroup.slice(0, insertAt), updatedMoving, ...inGroup.slice(insertAt)];

    const updates: Task[] = nextGroup.map((t, i) => ({ ...t, sortOrder: (i + 1) * 10 }));
    await bulkUpdateTasks(updates);
  }

  function openNewTaskModal(presetClientId?: string) {
    setTaskModalState({ task: null, presetClientId });
  }

  function openEditTaskModal(id: string) {
    const task = tasks.find(t => t.id === id);
    if (task) setTaskModalState({ task });
  }

  const selectedClient = selectedId ? clients.find(c => c.id === selectedId) ?? null : null;
  const selectedRequest = selectedRequestId ? requests.find(r => r.id === selectedRequestId) ?? null : null;

  function handleSelectClient(id: string) {
    setSelectedId(id);
    setView('form');
  }

  function handleAddNew() {
    setShowCreateClient(true);
  }

  async function handleCreateClient(basics: QuickClientBasics) {
    const draft = makeEmptyClient(crypto.randomUUID(), {
      firstName: basics.firstName,
      lastName: basics.lastName,
      idNumber: basics.idNumber,
      phone: basics.phone,
      email: basics.email,
    });
    const inserted = await addClient(draft);
    setShowCreateClient(false);
    setSelectedId(inserted.id);
    setView('form');
  }

  async function handleSave(client: Client) {
    const exists = clients.some(c => c.id === client.id);
    if (exists) {
      await updateClient(client);
    } else {
      await addClient(client);
    }
    setSelectedId(client.id);
    setView('form');
  }

  async function handleDelete(id: string) {
    const client = clients.find(c => c.id === id);
    if (client?.representationRequestId) {
      try { await removeRequest(client.representationRequestId); } catch { /* ignore */ }
      db.getDocsByClient(id).then(docs => {
        docs.forEach(d => db.deleteDoc(d.id));
      });
    }
    await removeClient(id);
    if (selectedId === id) {
      setSelectedId(null);
      setView('list');
    }
  }

  async function handleApplyExtractedData(data: ExtractedClientData) {
    if (!selectedId) return;
    const c = clients.find(x => x.id === selectedId);
    if (!c) return;
    const updated: Client = { ...c };
    if (data.firstName) updated.firstName = data.firstName;
    if (data.lastName) updated.lastName = data.lastName;
    if (data.idNumber) updated.idNumber = data.idNumber;
    if (data.birthDate) updated.birthDate = data.birthDate;
    if (data.gender) updated.gender = data.gender;
    if (data.phone) updated.phone = data.phone;
    if (data.email) updated.email = data.email;
    if (data.city) updated.city = data.city;
    if (data.address) updated.address = data.address;
    await updateClient(updated);
    setView('form');
  }

  function handleCancelForm() {
    setView('list');
    setSelectedId(null);
  }

  async function handleLoadSamples() {
    const existingIds = new Set(clients.map(c => c.id));
    const enriched = enrichClientsWithWorkspace(SAMPLE_CLIENTS);
    const newSamples = enriched.filter(s => !existingIds.has(s.id));
    if (newSamples.length === 0) return;
    await bulkAddClients(newSamples);
  }

  async function handleLoadSampleTasks() {
    const existing = new Set(tasks.map(t => t.id));
    const toAdd = SAMPLE_TASKS.filter(t => !existing.has(t.id));
    if (toAdd.length === 0) return;
    await bulkAddTasks(toAdd);
  }

  // ─── Representation requests ───────────────────────────────────────────────

  function handleAddRequest() {
    setSelectedRequestId(null);
    setView('requestNew');
  }

  function handleSelectRequest(id: string) {
    setSelectedRequestId(id);
    setView('requestReview');
  }

  /**
   * שמירת בקשה. אם זו בקשה חדשה — יוצרים גם stub Client עם status = 'pending_fill'
   * וקושרים ביניהם.
   */
  async function handleSaveRequest(req: RepresentationRequest) {
    const isNew = !requests.some(r => r.id === req.id);

    if (isNew) {
      // 1. יוצרים stub Client עם reqId משוייך
      const stubClientId = crypto.randomUUID();
      const nameParts = (req.clientName || '').trim().split(/\s+/);
      const stubClient = makeEmptyClient(stubClientId, {
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
        email: req.clientEmail,
        representationStatus: 'pending_fill',
        representationRequestId: req.id,
        notes: 'נוצר אוטומטית מבקשת ייצוג. ממתין למילוי הלקוח.',
      });
      const insertedClient = await addClient(stubClient);
      // 2. יוצרים את הבקשה עם linkedClientId
      const finalReq = { ...req, linkedClientId: insertedClient.id };
      await addRequest(finalReq);
      setSelectedRequestId(finalReq.id);
    } else {
      await updateRequest(req);
      setSelectedRequestId(req.id);
    }
    setView('requestReview');
  }

  function handleOpenFill(id: string) {
    setSelectedRequestId(id);
    setView('requestFill');
  }

  /**
   * הלקוח שלח את הטופס. מעדכנים:
   * 1. את הבקשה — submission, status = awaiting_accountant
   * 2. את ה-Client הקשור — מילוי שדות, status = awaiting_accountant
   * 3. שמות הקבצים שהועלו → מוסכמת השמות
   */
  async function handleSubmitFill(submission: RequestSubmission) {
    if (!selectedRequestId) return;
    const req = requests.find(r => r.id === selectedRequestId);
    if (!req) return;
    const now = new Date().toISOString();

    // ── עדכון שמות הקבצים ב-IndexedDB וקישור ל-Client האמיתי ──
    try {
      const storedDocs = await db.getDocsByClient(`req-${req.id}`);
      for (const stored of storedDocs) {
        const matchingDoc = req.requestedDocs.find(d =>
          submission.uploadedDocs.some(u => u.docItemId === d.id && u.storedDocId === stored.id)
        );
        const docLabel = matchingDoc?.label || stored.description;
        const newName = standardFileName(submission.lastName, submission.firstName, docLabel, stored.fileName);
        await db.saveDoc({
          ...stored,
          clientId: req.linkedClientId, // העברה ל-clientId האמיתי
          fileName: newName,
          description: docLabel,
        });
      }
    } catch {
      // ignore
    }

    // ── עדכון Client ──
    const linkedClient = clients.find(c => c.id === req.linkedClientId);
    if (linkedClient) {
      await updateClient({
        ...linkedClient,
        firstName: submission.firstName,
        lastName: submission.lastName,
        idNumber: submission.idNumber,
        birthDate: submission.birthDate,
        gender: submission.gender,
        phone: submission.phone,
        email: submission.email,
        city: submission.city,
        address: submission.address,
        notes: submission.notes
          ? `${linkedClient.notes}\n\nהערות הלקוח:\n${submission.notes}`
          : linkedClient.notes,
        representationStatus: 'awaiting_accountant',
      });
    }

    // ── עדכון Request ──
    await updateRequest({ ...req, submission, status: 'awaiting_accountant', submittedAt: now });
    setView('requestReview');
  }

  /**
   * המייצג חתם וייפוי הכוח החתום נוצר. מעדכנים את הסטטוס ל-awaiting_authorities.
   */
  async function handleAccountantSign(req: RepresentationRequest, partB: AccountantPartB, signedPdfStoredId: string) {
    await updateRequest({ ...req, partB, signedPdfStoredId, status: 'awaiting_authorities' });
    const linkedClient = clients.find(c => c.id === req.linkedClientId);
    if (linkedClient) {
      await updateClient({ ...linkedClient, representationStatus: 'awaiting_authorities' });
    }
  }

  /** ידנית — סימון לקוח כמיוצג פעיל לאחר אישור הרשויות */
  async function handleMarkActive(req: RepresentationRequest) {
    await updateRequest({ ...req, status: 'active' });
    const linkedClient = clients.find(c => c.id === req.linkedClientId);
    if (linkedClient) {
      await updateClient({ ...linkedClient, representationStatus: 'active' });
    }
  }

  async function handleDeleteRequest(id: string) {
    const req = requests.find(r => r.id === id);
    // מחיקת קבצים גם תחת req- וגם תחת clientId
    try {
      const oldFiles = await db.getDocsByClient(`req-${id}`);
      const linkedFiles = req?.linkedClientId ? await db.getDocsByClient(req.linkedClientId) : [];
      await Promise.all([...oldFiles, ...linkedFiles].map(d => db.deleteDoc(d.id)));
    } catch {
      // ignore
    }
    if (req?.linkedClientId) {
      try { await removeClient(req.linkedClientId); } catch { /* ignore */ }
    }
    await removeRequest(id);
    setSelectedRequestId(null);
    setView('list');
  }

  const breadcrumb =
    view === 'form'
      ? selectedClient ? `${selectedClient.firstName} ${selectedClient.lastName}` : 'לקוח חדש'
      : view === 'calculator' && selectedClient
      ? `${selectedClient.firstName} ${selectedClient.lastName} — מחשבון מס`
      : view === 'documents' && selectedClient
      ? `${selectedClient.firstName} ${selectedClient.lastName} — מסמכים`
      : view === 'reference'
      ? 'מדריך מס'
      : view === 'requestNew'
      ? selectedRequest ? 'עריכת בקשת ייצוג' : 'בקשת ייצוג חדשה'
      : view === 'requestReview'
      ? `בקשת ייצוג — ${selectedRequest?.clientName || selectedRequest?.clientEmail || ''}`
      : view === 'requestFill'
      ? 'מילוי בקשת ייצוג'
      : null;

  function goHome() {
    setView('tasks');
    setSelectedId(null);
    setSelectedRequestId(null);
  }

  if (authLoading) {
    return <div className="app-loading">טוען…</div>;
  }
  if (!user) {
    return <LoginScreen />;
  }

  const openTasksCount = tasks.filter(t => t.status === 'open' && (t.ballWith === 'me' || t.ballWith === 'stuck')).length;

  const navTabs: { id: View; label: string; badge?: number }[] = [
    { id: 'tasks', label: '✓ משימות', badge: openTasksCount > 0 ? openTasksCount : undefined },
    { id: 'list', label: '👥 לקוחות' },
    { id: 'employees', label: '🧑‍💼 עובדים' },
    { id: 'reference', label: '📚 מדריך מס' },
  ];

  return (
    <div className="app">
      <header className="header">
        <div className="header-logo" onClick={goHome}>
          📊 CRM רואה חשבון
        </div>

        <nav className="main-nav">
          {navTabs.map(t => (
            <button
              key={t.id}
              onClick={() => {
                setView(t.id);
                setSelectedId(null);
                setSelectedRequestId(null);
              }}
              className={`nav-tab ${view === t.id ? 'active' : ''}`}
            >
              {t.label}
              {t.badge !== undefined && (
                <span className="nav-badge">{t.badge}</span>
              )}
            </button>
          ))}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginRight: 'auto' }}>
          {breadcrumb && (
            <div className="header-nav">
              <span
                style={{ cursor: 'pointer', color: 'var(--gray-400)' }}
                onClick={() => { setView('list'); setSelectedId(null); setSelectedRequestId(null); }}
              >
                לקוחות
              </span>
              <span>›</span>
              <span className="header-breadcrumb">{breadcrumb}</span>
            </div>
          )}

          <div className="header-user" title={user.email ?? ''}>
            {avatarUrl ? (
              <img className="header-user-avatar" src={avatarUrl} alt="" />
            ) : (
              <span className="header-user-avatar">
                {(displayName || user.email || '?').slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="header-user-name">{displayName || user.email}</span>
          </div>

          <button
            type="button"
            className="header-logout-btn"
            onClick={async () => { await signOut(); }}
          >
            התנתק
          </button>
        </div>
      </header>

      <main className="main">
        <LegacyMigrationBanner knownClientIds={new Set(clients.map(c => c.id))} />
        {view === 'myDesk' && (
          <MyDesk
            tasks={tasks}
            clients={clients}
            onSelectTask={openEditTaskModal}
            onAddTask={() => openNewTaskModal()}
            onToggleDone={handleToggleTaskDone}
            onLoadSampleTasks={handleLoadSampleTasks}
          />
        )}

        {view === 'tasks' && (
          <TaskBoard
            tasks={tasks}
            clients={clients}
            onSelectTask={openEditTaskModal}
            onAddTask={() => openNewTaskModal()}
            onToggleDone={handleToggleTaskDone}
            onChangeStatus={handleChangeTaskStatus}
            onChangeBall={handleChangeTaskBall}
            onChangeCategory={handleChangeTaskCategory}
            onReorder={handleReorderTask}
            onSelectClient={handleSelectClient}
            onDeleteTask={handleDeleteTask}
            onLoadSampleTasks={handleLoadSampleTasks}
          />
        )}

        {view === 'list' && (
          <ClientList
            clients={clients}
            requests={requests}
            tasks={tasks}
            onSelect={handleSelectClient}
            onAdd={handleAddNew}
            onDelete={handleDelete}
            onLoadSamples={handleLoadSamples}
            onAddRequest={handleAddRequest}
            onSelectRequest={handleSelectRequest}
          />
        )}

        {view === 'form' && (
          <ClientWorkspace
            client={selectedClient}
            clients={clients}
            tasks={tasks}
            onSave={handleSave}
            onCancel={handleCancelForm}
            onDelete={handleDelete}
            onAddTaskForClient={(clientId) => openNewTaskModal(clientId)}
            onSelectTask={openEditTaskModal}
            onToggleTaskDone={handleToggleTaskDone}
            onChangeTaskStatus={handleChangeTaskStatus}
            onChangeTaskBall={handleChangeTaskBall}
            onChangeTaskCategory={handleChangeTaskCategory}
            onReorderTask={handleReorderTask}
            onDeleteTask={handleDeleteTask}
          />
        )}

        {view === 'employees' && (
          <EmployeesPanel clients={clients} />
        )}

        {view === 'calculator' && (
          selectedClient ? (
            <TaxCalculator
              client={selectedClient}
              onBack={() => setView('form')}
            />
          ) : (
            <div className="empty-state">
              <div className="empty-state-title">הלקוח לא נמצא</div>
              <button className="btn btn-primary" onClick={() => { setView('list'); setSelectedId(null); }}>חזרה לרשימה</button>
            </div>
          )
        )}

        {view === 'documents' && (
          selectedClient ? (
            <DocumentManager
              client={selectedClient}
              allClients={clients}
              onBack={() => setView('form')}
              onApplyExtractedData={handleApplyExtractedData}
            />
          ) : (
            <div className="empty-state">
              <div className="empty-state-title">הלקוח לא נמצא</div>
              <button className="btn btn-primary" onClick={() => { setView('list'); setSelectedId(null); }}>חזרה לרשימה</button>
            </div>
          )
        )}

        {view === 'reference' && (
          <TaxReferencePanel
            onBack={() => setView('list')}
          />
        )}

        {view === 'requestNew' && (
          <RepresentationRequestForm
            request={selectedRequest}
            onSave={handleSaveRequest}
            onCancel={() => { setView('list'); setSelectedRequestId(null); }}
            onOpenFill={handleOpenFill}
          />
        )}

        {view === 'requestReview' && (
          selectedRequest ? (
            <RepresentationRequestReview
              request={selectedRequest}
              onBack={() => { setView('list'); setSelectedRequestId(null); }}
              onSign={handleAccountantSign}
              onMarkActive={handleMarkActive}
              onDelete={handleDeleteRequest}
              onOpenFill={handleOpenFill}
            />
          ) : (
            <div className="empty-state">
              <div className="empty-state-title">הבקשה לא נמצאה</div>
              <button className="btn btn-primary" onClick={() => { setView('list'); setSelectedRequestId(null); }}>חזרה לרשימה</button>
            </div>
          )
        )}

        {view === 'requestFill' && (
          selectedRequest ? (
            <RepresentationFillForm
              request={selectedRequest}
              onSubmit={handleSubmitFill}
              onCancel={() => setView('requestReview')}
            />
          ) : (
            <div className="empty-state">
              <div className="empty-state-title">הבקשה לא נמצאה</div>
              <button className="btn btn-primary" onClick={() => { setView('list'); setSelectedRequestId(null); }}>חזרה לרשימה</button>
            </div>
          )
        )}
      </main>

      {taskModalState && (
        <TaskForm
          task={taskModalState.task}
          clients={clients}
          presetClientId={taskModalState.presetClientId}
          onSave={handleSaveTask}
          onCancel={() => setTaskModalState(null)}
          onDelete={handleDeleteTask}
          onUpdateClient={updateClient}
        />
      )}

      {showCreateClient && (
        <QuickCreateClient
          onSave={handleCreateClient}
          onCancel={() => setShowCreateClient(false)}
        />
      )}
    </div>
  );
}
