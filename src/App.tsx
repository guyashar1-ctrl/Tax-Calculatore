import { useState } from 'react';
import {
  Client,
  RepresentationRequest,
  RequestSubmission,
  AccountantPartB,
  Task,
} from './types';
import { ExtractedClientData } from './utils/geminiVision';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useDocumentDB } from './hooks/useIndexedDB';
import { SAMPLE_CLIENTS } from './data/sampleClients';
import { SAMPLE_TASKS } from './data/sampleTasks';
import ClientList from './components/ClientList';
import ClientForm from './components/ClientForm';
import TaxCalculator from './components/TaxCalculator';
import DocumentManager from './components/DocumentManager';
import TaxReferencePanel from './components/TaxReferencePanel';
import RepresentationRequestForm from './components/RepresentationRequestForm';
import RepresentationFillForm from './components/RepresentationFillForm';
import RepresentationRequestReview from './components/RepresentationRequestReview';
import MyDesk from './components/MyDesk';
import TasksPage from './components/TasksPage';
import TaskForm from './components/TaskForm';

type View =
  | 'myDesk'
  | 'tasks'
  | 'list'
  | 'form'
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
    completedIDF: false,
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
  const [clients, setClients] = useLocalStorage<Client[]>('crm_clients', SAMPLE_CLIENTS);
  const [requests, setRequests] = useLocalStorage<RepresentationRequest[]>('crm_representation_requests', []);
  const [tasks, setTasks] = useLocalStorage<Task[]>('crm_tasks', SAMPLE_TASKS);
  const [view, setView] = useState<View>('myDesk');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [taskModalState, setTaskModalState] = useState<{ task: Task | null; presetClientId?: string | null } | null>(null);
  const db = useDocumentDB();

  // ── ניהול משימות ───────────────────────────────────────────────────────
  function handleSaveTask(task: Task) {
    const now = new Date().toISOString();
    setTasks(prev => {
      const exists = prev.some(t => t.id === task.id);
      return exists
        ? prev.map(t => t.id === task.id ? { ...task, updatedAt: now } : t)
        : [...prev, { ...task, updatedAt: now }];
    });
    setTaskModalState(null);
  }

  function handleDeleteTask(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id));
    setTaskModalState(null);
  }

  function handleToggleTaskDone(id: string) {
    const now = new Date().toISOString();
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t;
      if (t.status === 'open') {
        return { ...t, status: 'done', completedAt: now, updatedAt: now };
      }
      return { ...t, status: 'open', completedAt: undefined, updatedAt: now };
    }));
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
    setSelectedId(null);
    setView('form');
  }

  function handleSave(client: Client) {
    setClients(prev => {
      const exists = prev.some(c => c.id === client.id);
      return exists
        ? prev.map(c => c.id === client.id ? client : c)
        : [...prev, client];
    });
    setSelectedId(client.id);
    setView('form');
  }

  function handleDelete(id: string) {
    const client = clients.find(c => c.id === id);
    setClients(prev => prev.filter(c => c.id !== id));
    // אם הלקוח קשור לבקשה — מחק גם אותה
    if (client?.representationRequestId) {
      setRequests(prev => prev.filter(r => r.id !== client.representationRequestId));
      // ומחק קבצים מ-IDB
      db.getDocsByClient(id).then(docs => {
        docs.forEach(d => db.deleteDoc(d.id));
      });
    }
    if (selectedId === id) {
      setSelectedId(null);
      setView('list');
    }
  }

  function handleOpenCalculator(client: Client) {
    setClients(prev => {
      const exists = prev.some(c => c.id === client.id);
      return exists ? prev.map(c => c.id === client.id ? client : c) : [...prev, client];
    });
    setSelectedId(client.id);
    setView('calculator');
  }

  function handleOpenDocuments(client: Client) {
    setClients(prev => {
      const exists = prev.some(c => c.id === client.id);
      return exists ? prev.map(c => c.id === client.id ? client : c) : [...prev, client];
    });
    setSelectedId(client.id);
    setView('documents');
  }

  function handleApplyExtractedData(data: ExtractedClientData) {
    if (!selectedId) return;
    setClients(prev => prev.map(c => {
      if (c.id !== selectedId) return c;
      const updated = { ...c };
      if (data.firstName) updated.firstName = data.firstName;
      if (data.lastName) updated.lastName = data.lastName;
      if (data.idNumber) updated.idNumber = data.idNumber;
      if (data.birthDate) updated.birthDate = data.birthDate;
      if (data.gender) updated.gender = data.gender;
      if (data.phone) updated.phone = data.phone;
      if (data.email) updated.email = data.email;
      if (data.city) updated.city = data.city;
      if (data.address) updated.address = data.address;
      updated.updatedAt = new Date().toISOString();
      return updated;
    }));
    setView('form');
  }

  function handleCancelForm() {
    setView('list');
    setSelectedId(null);
  }

  function handleLoadSamples() {
    setClients(prev => {
      const existingIds = new Set(prev.map(c => c.id));
      const newSamples = SAMPLE_CLIENTS.filter(s => !existingIds.has(s.id));
      return [...prev, ...newSamples];
    });
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
  function handleSaveRequest(req: RepresentationRequest) {
    const isNew = !requests.some(r => r.id === req.id);
    const now = new Date().toISOString();

    let finalReq = req;

    if (isNew) {
      // יצירת stub Client
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
      setClients(prev => [...prev, stubClient]);
      finalReq = { ...req, linkedClientId: stubClientId };
    }

    setRequests(prev => {
      const exists = prev.some(r => r.id === finalReq.id);
      return exists
        ? prev.map(r => r.id === finalReq.id ? { ...finalReq, updatedAt: now } : r)
        : [...prev, { ...finalReq, updatedAt: now }];
    });
    setSelectedRequestId(finalReq.id);
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
    setClients(prev => prev.map(c => {
      if (c.id !== req.linkedClientId) return c;
      return {
        ...c,
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
          ? `${c.notes}\n\nהערות הלקוח:\n${submission.notes}`
          : c.notes,
        representationStatus: 'awaiting_accountant',
        updatedAt: now,
      };
    }));

    // ── עדכון Request ──
    setRequests(prev => prev.map(r =>
      r.id === selectedRequestId
        ? { ...r, submission, status: 'awaiting_accountant', submittedAt: now, updatedAt: now }
        : r
    ));
    setView('requestReview');
  }

  /**
   * המייצג חתם וייפוי הכוח החתום נוצר. מעדכנים את הסטטוס ל-awaiting_authorities.
   */
  function handleAccountantSign(req: RepresentationRequest, partB: AccountantPartB, signedPdfStoredId: string) {
    const now = new Date().toISOString();
    setRequests(prev => prev.map(r =>
      r.id === req.id
        ? { ...r, partB, signedPdfStoredId, status: 'awaiting_authorities', updatedAt: now }
        : r
    ));
    setClients(prev => prev.map(c =>
      c.id === req.linkedClientId
        ? { ...c, representationStatus: 'awaiting_authorities', updatedAt: now }
        : c
    ));
  }

  /** ידנית — סימון לקוח כמיוצג פעיל לאחר אישור הרשויות */
  function handleMarkActive(req: RepresentationRequest) {
    const now = new Date().toISOString();
    setRequests(prev => prev.map(r =>
      r.id === req.id ? { ...r, status: 'active', updatedAt: now } : r
    ));
    setClients(prev => prev.map(c =>
      c.id === req.linkedClientId
        ? { ...c, representationStatus: 'active', updatedAt: now }
        : c
    ));
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
    // מחיקת ה-Client הקשור
    if (req?.linkedClientId) {
      setClients(prev => prev.filter(c => c.id !== req.linkedClientId));
    }
    setRequests(prev => prev.filter(r => r.id !== id));
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
    setView('myDesk');
    setSelectedId(null);
    setSelectedRequestId(null);
  }

  const openTasksCount = tasks.filter(t => t.status === 'open' && (t.ballWith === 'me' || t.ballWith === 'stuck')).length;

  const navTabs: { id: View; label: string; badge?: number }[] = [
    { id: 'myDesk', label: '🏠 על השולחן', badge: openTasksCount > 0 ? openTasksCount : undefined },
    { id: 'tasks', label: '✓ משימות' },
    { id: 'list', label: '👥 לקוחות' },
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
        </div>
      </header>

      <main className="main">
        {view === 'myDesk' && (
          <MyDesk
            tasks={tasks}
            clients={clients}
            onSelectTask={openEditTaskModal}
            onAddTask={() => openNewTaskModal()}
            onToggleDone={handleToggleTaskDone}
            onLoadSampleTasks={() => setTasks(prev => {
              const existing = new Set(prev.map(t => t.id));
              const toAdd = SAMPLE_TASKS.filter(t => !existing.has(t.id));
              return [...prev, ...toAdd];
            })}
          />
        )}

        {view === 'tasks' && (
          <TasksPage
            tasks={tasks}
            clients={clients}
            onSelectTask={openEditTaskModal}
            onAddTask={() => openNewTaskModal()}
            onToggleDone={handleToggleTaskDone}
          />
        )}

        {view === 'list' && (
          <ClientList
            clients={clients}
            requests={requests}
            onSelect={handleSelectClient}
            onAdd={handleAddNew}
            onDelete={handleDelete}
            onLoadSamples={handleLoadSamples}
            onAddRequest={handleAddRequest}
            onSelectRequest={handleSelectRequest}
          />
        )}

        {view === 'form' && (
          <ClientForm
            client={selectedClient}
            tasks={tasks}
            onSave={handleSave}
            onCancel={handleCancelForm}
            onOpenCalculator={handleOpenCalculator}
            onOpenDocuments={handleOpenDocuments}
            onAddTaskForClient={(clientId) => openNewTaskModal(clientId)}
            onSelectTask={openEditTaskModal}
            onToggleTaskDone={handleToggleTaskDone}
          />
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
        />
      )}
    </div>
  );
}
