import { useEffect, useRef, useState } from 'react';
import {
  Client,
  RepresentationRequest,
  RepresentationExecution,
  RequestSubmission,
  AccountantPartB,
  Task,
  TaskCategory,
  TaskProgress,
  BallWith,
  AuthorityKind,
  AuthorityRepresentations,
  RepAuthorityKind,
  RepSigner,
  SignatureSetup,
  SignatureValue,
  RepresentationStatus,
  REPRESENTATION_STATUS_LABELS,
  DEFAULT_REQUESTED_DOCS,
  REP_AUTHORITY_LABELS,
} from './types';
import { ExtractedClientData } from './utils/geminiVision';
import { useDocumentDB } from './hooks/useIndexedDB';
import { useTheme } from './hooks/useTheme';
import { PivoMark } from './components/PivoMark';
import Icon from './components/ui/Icon';
import { supabase } from './lib/supabase';
import { useClients } from './hooks/useClients';
import { useTasks } from './hooks/useTasks';
import { useRepresentationRequests } from './hooks/useRepresentationRequests';
import { useFirmProfile } from './hooks/useFirmProfile';
import { useFailedNotifications } from './hooks/useFailedNotifications';
import { useLeads } from './hooks/useLeads';
import { useQuotations } from './hooks/useQuotations';
import { useQuotationCatalog } from './hooks/useQuotationCatalog';
import QuotationsPipeline from './components/quotations/QuotationsPipeline';
import QuotationBuilder, { type SaveDraftPayload } from './components/quotations/QuotationBuilder';
import ReleaseLetterDialog from './components/quotations/ReleaseLetterDialog';
import { deriveQuotationBrand } from './components/quotations/quotationBranding';
import { buildQuotationEmailHtml } from './utils/quotationEmailHtml';
import { generateQuotationPdf } from './utils/quotationPdf';
import type { Lead, Quotation } from './types/quotations';
import FirmProfileConsole from './components/FirmProfileConsole';
import type { FirmProfile } from './types/firmProfile';
import { SAMPLE_CLIENTS } from './data/sampleClients';
import { SAMPLE_TASKS } from './data/sampleTasks';
import ClientList from './components/ClientList';
import ClientWorkspace from './components/ClientWorkspace';
import TaxCalculator from './components/TaxCalculator';
import DocumentManager from './components/DocumentManager';
import { enrichClientsWithWorkspace } from './data/sampleClientWorkspace';
import TaxCenter from './features/taxCenter/TaxCenter';
import { buildQuarterlyFreshnessTask, markFreshnessCreationAttempted, quarterlyTaskExists } from './data/freshnessTask';
import RepresentationRequestForm from './components/RepresentationRequestForm';
import RepresentationFillForm from './components/RepresentationFillForm';
import RepresentationRequestReview from './components/RepresentationRequestReview';
import MyDesk from './components/MyDesk';
import TaskBoard from './components/TaskBoard';
import TaskForm from './components/TaskForm';
import LoginScreen from './components/LoginScreen';
import NoAccessScreen from './components/NoAccessScreen';
import QuickCreateClient, { QuickClientBasics } from './components/QuickCreateClient';
import RepresentationOnboardingDialog, { CreateRepresentationInput } from './components/RepresentationOnboardingDialog';
import OnboardingPage from './components/OnboardingPage';
import PublicIntakePage from './components/PublicIntakePage';
import PublicQuotationPage from './components/PublicQuotationPage';
import TestSignaturePage from './components/signatureRequest/__TestSignaturePage';
import TestSigningRoom from './components/signatureRequest/__TestSigningRoom';
import TestExecutionCenter from './components/signatureRequest/__TestExecutionCenter';
import TestRepDocs from './components/signatureRequest/__TestRepDocs';
import PublicSignPage from './components/PublicSignPage';
import ErrorBoundary from './components/ErrorBoundary';
import LegacyMigrationBanner from './components/LegacyMigrationBanner';
import FailedNotificationsBanner from './components/FailedNotificationsBanner';
import { useAuth } from './hooks/useAuth';
import AnnualReport from './features/annualReport/AnnualReport';

type View =
  | 'myDesk'
  | 'tasks'
  | 'list'
  | 'form'
  | 'calculator'
  | 'documents'
  | 'reference'
  | 'annualReport'
  | 'firmProfile'
  | 'requestNew'
  | 'requestReview'
  | 'requestFill'
  | 'quotations'
  | 'quotationBuilder';

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
  // דפי בדיקה של עורך החתימה — פיתוח בלבד. מקומפלים החוצה מהאתר החי.
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-sig')) {
    return <TestSignaturePage />;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-signroom')) {
    return <TestSigningRoom />;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-exec')) {
    return <TestExecutionCenter />;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-repdocs')) {
    return <TestRepDocs />;
  }
  // עמוד הזדהות ציבורי ללקוח — נטען ללא התחברות לפי טוקן.
  if (typeof window !== 'undefined') {
    // הדפים שהלקוח רואה נשארים תמיד בהירים — הם נושאים את מיתוג המשרד,
    // נשלחים במייל ולעיתים מודפסים. מצב כהה הוא העדפה פנימית של המשרד בלבד.
    const asClientPage = (node: JSX.Element) => (
      <div className="pivo-light public-page-shell">{node}</div>
    );
    const onboardToken = new URLSearchParams(window.location.search).get('onboard');
    if (onboardToken) return asClientPage(<OnboardingPage token={onboardToken} />);
    // עמוד חתימה ציבורי — קישור אישי לכל חותם (נישום / בן זוג).
    const signToken = new URLSearchParams(window.location.search).get('sign');
    if (signToken) return asClientPage(<PublicSignPage token={signToken} />);
    // שאלון עצמאי — נשלח יזום מכרטיס הלקוח, בלי הליך ייצוג.
    const intakeToken = new URLSearchParams(window.location.search).get('intake');
    if (intakeToken) return asClientPage(<PublicIntakePage token={intakeToken} />);
    // עמוד הצעת מחיר ציבורי — קישור מאובטח לפי טוקן.
    const quoteToken = new URLSearchParams(window.location.search).get('quote');
    if (quoteToken) return asClientPage(<PublicQuotationPage token={quoteToken} />);
  }

  const { user, loading: authLoading, authorized, displayName, avatarUrl, signOut } = useAuth();

  const { clients, addClient, updateClient, deleteClient: removeClient, bulkAddClients } = useClients(user?.id);
  const { tasks, loading: tasksLoading, addTask, updateTask, bulkUpdateTasks, deleteTask: removeTask, bulkAddTasks, reloadTasks } = useTasks(user?.id);

  // בתחילת כל רבעון (ינואר/אפריל/יולי/אוקטובר) נוצרת אוטומטית משימת בדיקת
  // עדכניות של מרכז הידע — פעם אחת לרבעון (זיהוי לפי תגית בכותרת + נעילת מודול
  // נגד ההרכבה הכפולה של StrictMode + אינדקס ייחודי במסד כרשת אחרונה).
  useEffect(() => {
    if (!user || tasksLoading) return;
    if (quarterlyTaskExists(tasks)) return;
    if (!markFreshnessCreationAttempted()) return;
    void addTask(buildQuarterlyFreshnessTask()).catch(() => { /* ניסיון חוזר בכניסה הבאה */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, tasksLoading]);
  const { requests, addRequest, updateRequest, deleteRequest: removeRequest } = useRepresentationRequests(user?.id);
  const { profile: firmProfile, saveProfile } = useFirmProfile(user?.id);
  const { leads, addLead, updateLead, deleteLead } = useLeads(user?.id);
  const { quotations, addQuotation, updateQuotation, cancelQuotation, deleteQuotation } = useQuotations(user?.id);
  const { services: catalogServices, templates: quotationTemplates } = useQuotationCatalog(user?.id);
  const failedNotifications = useFailedNotifications(user?.id);

  /**
   * רשת הביטחון של התראות ההתקדמות. השרת רושם כל אירוע אצל הלקוח (חתימה על
   * הצעה, מילוי פרטי ייצוג, חתימה על ייפוי כוח) בתור, והדפדפן של הלקוח מבקש
   * לרוקן אותו מיד. לקוח שסגר את החלון באותה שנייה משאיר את ההתראה בתור —
   * וכאן היא נשלחת. רץ פעם אחת בכל טעינה, ואינו חוסם כלום.
   */
  const notifyFlushed = useRef(false);
  useEffect(() => {
    if (!user || !authorized || notifyFlushed.current) return;
    notifyFlushed.current = true;
    void supabase.functions.invoke('notify-accountant', { body: {} });
  }, [user, authorized]);

  /**
   * רשת ביטחון לאוטומציה של אישור ההצעה. האישור עצמו יוצר את הלקוח ואת בקשת
   * הייצוג בצד השרת, אבל שני דברים תלויים בדפדפן ועלולים להיכשל שם: שליחת
   * המייל (הלקוח סגר את הטאב לפני שהבקשה יצאה) והפקת הסכם ההתקשרות (PDF).
   * שניהם מושלמים כאן בכניסה הבאה של הרו"ח, ושניהם אידמפוטנטיים.
   *
   * ‼ הסימון "נשלח" כבר לא נעשה כאן. השרת תובע את השליחה על ההצעה עצמה לפני
   * שהוא פונה לרסנד, ולכן שני מסלולים שרצים יחד לא יכולים לשלוח פעמיים. כשהשרת
   * מחזיר alreadySent הוא אומר שמישהו הקדים — אין מה לכתוב, הערך כבר במסד.
   */
  const autoRepHandled = useRef(new Set<string>());
  useEffect(() => {
    if (!user) return;
    for (const q of quotations) {
      if (q.status !== 'approved' || !q.representationRequestId) continue;
      if (autoRepHandled.current.has(q.id)) continue;
      autoRepHandled.current.add(q.id);
      if (q.clientId) void saveEngagementContract(q, q.clientId);
      if (q.representationSentAt) continue;
      void (async () => {
        try {
          const { data, error } = await supabase.functions.invoke('send-onboarding-email', {
            body: { requestId: q.representationRequestId },
          });
          const failure = error?.message || (data?.ok ? null : (data?.detail?.message || data?.error || 'שגיאה לא ידועה'));
          if (failure) {
            await updateQuotation({ ...q, representationError: failure });
          } else if (!data?.alreadySent) {
            await updateQuotation({ ...q, representationSentAt: new Date().toISOString(), representationError: undefined });
          }
        } catch { /* יימשך בכניסה הבאה */ }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, quotations]);

  const { theme, toggleTheme } = useTheme();
  const [view, setView] = useState<View>('tasks');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  // לשונית הפתיחה של כרטיס הלקוח — נקבעת רק כשהגיעו אליו בשביל דבר מסוים
  const [clientInitialTab, setClientInitialTab] = useState<'overview' | 'dossier' | 'docs' | 'tasks' | undefined>(undefined);
  const [editingQuotationId, setEditingQuotationId] = useState<string | null>(null);
  const [newQuotationLeadId, setNewQuotationLeadId] = useState<string | null>(null);
  const [convertingQuotation, setConvertingQuotation] = useState<Quotation | null>(null);
  const [releaseFor, setReleaseFor] = useState<{ clientId: string; clientName: string; businessName?: string; prevAccountant: { name?: string; email?: string; phone?: string } } | null>(null);
  const [taskModalState, setTaskModalState] = useState<{ task: Task | null; presetClientId?: string | null } | null>(null);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  // בחירה מוקדמת לדוח השנתי (מתוך "פתח ←" בתמונת המס של הכרטיס)
  const [annualReportSelection, setAnnualReportSelection] = useState<{ clientId: string; taxYear: number } | null>(null);
  // תפריט החשבון נפתח מהאווטאר — כדי ש"המשרד" ו"התנתק" לא יתפסו מקום בסרגל
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const db = useDocumentDB();

  useEffect(() => {
    if (!accountMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Element;
      if (!target.closest('.header-account')) setAccountMenuOpen(false);
    }
    const t = setTimeout(() => document.addEventListener('click', onDocClick), 0);
    return () => { clearTimeout(t); document.removeEventListener('click', onDocClick); };
  }, [accountMenuOpen]);

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
    setClientInitialTab(undefined);
    setView('form');
  }

  /** כרטיס הלקוח ישר על המסמכים — מהמסך של בקשת הייצוג. */
  function handleOpenClientDocs(clientId: string) {
    setSelectedId(clientId);
    setClientInitialTab('docs');
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
    setShowOnboarding(true);
  }

  /**
   * מחזיר התנגשות אם המייל כבר שייך ללקוח שנמצא בתהליך ייצוג או שכבר מיוצג.
   * מייל הוא "המזהה" של הלקוח בתהליך הייצוג — אסור לפתוח שתי בקשות לאותו מייל.
   */
  function repEmailConflict(email: string): { status: RepresentationStatus; name: string } | null {
    const norm = email.trim().toLowerCase();
    if (!norm) return null;
    const client = clients.find(c => (c.email || '').trim().toLowerCase() === norm && !!c.representationStatus);
    if (client) {
      return { status: client.representationStatus!, name: `${client.firstName} ${client.lastName}`.trim() || email.trim() };
    }
    const req = requests.find(r => (r.clientEmail || '').trim().toLowerCase() === norm);
    if (req) return { status: req.status, name: req.clientName || email.trim() };
    return null;
  }

  /** הודעה בעברית להצגה כשמנסים לפתוח בקשת ייצוג למייל שכבר בשימוש. */
  function repEmailConflictMessage(email: string): string | null {
    const c = repEmailConflict(email);
    if (!c) return null;
    return c.status === 'active'
      ? `${c.name} כבר מיוצג/ת עם המייל הזה — אין צורך בבקשת ייצוג נוספת.`
      : `כבר קיימת בקשת ייצוג בתהליך למייל הזה (${c.name} — ${REPRESENTATION_STATUS_LABELS[c.status]}). אפשר להמשיך את התהליך מלשונית הלקוחות.`;
  }

  /**
   * נקודת הכניסה לייצוג: הרו"ח בוחר רשויות ומקבל קישור לשליחה בוואטסאפ.
   * שם ומייל אינם חובה — מה שלא הוזן כאן, הלקוח ממלא בעצמו בקישור.
   * המערכת יוצרת: לקוח ("טרם מיוצג") + התקשרות ייצוג + משימה פנימית
   * + מרשם ייצוג "בתהליך" לכל רשות שנבחרה.
   */
  async function handleCreateRepresentation(data: CreateRepresentationInput): Promise<{ link: string; emailSent: boolean; emailError?: string; clientId: string }> {
    const { name, email, areas, spouse, prefill, sendEmail } = data;
    // שער בטיחות: לא פותחים בקשה כפולה לאותו מייל (גם אם ה-UI כבר חוסם).
    // בלי מייל אין מה לבדוק — הזיהוי ייקבע כשהלקוח ימלא.
    if (email) {
      const conflictMsg = repEmailConflictMessage(email);
      if (conflictMsg) throw new Error(conflictMsg);
    }
    const nameParts = name.trim().split(/\s+/).filter(Boolean);
    const clientId = crypto.randomUUID();
    const reqId = crypto.randomUUID();
    const onboardingToken = crypto.randomUUID().replace(/-/g, '');
    const now = new Date().toISOString();
    const selectedKeys = Object.keys(areas) as RepAuthorityKind[];

    // כרטיס בלי שם צריך תווית זמנית שאפשר לזהות ברשימה — הזמן מבדיל בין
    // כמה קישורים שהופקו באותו יום. submit_onboarding_full דורס אותה בשם האמיתי.
    const placeholderLabel = new Date().toLocaleString('he-IL', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    const displayFirstName = nameParts[0] || 'ממתין למילוי';
    const displayLastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : (nameParts[0] ? '' : placeholderLabel);

    // חותמים: הנישום תמיד; בן/בת הזוג נוסף אם ידוע שהלקוח נשוי. לכל חותם טוקן
    // ומצב נפרד. שם/מייל ריקים מתמלאים ב-submit_onboarding_full כשהלקוח ממלא.
    const signers: RepSigner[] = [
      { id: 'client', role: 'client', name: name.trim(), email, signStatus: 'pending', signToken: crypto.randomUUID().replace(/-/g, '') },
    ];
    if (spouse) {
      signers.push({ id: 'spouse', role: 'spouse', name: spouse.name, email: spouse.email, signStatus: 'pending', signToken: crypto.randomUUID().replace(/-/g, '') });
    }

    // 1. לקוח חדש — מסומן "ממתין" עם מרשם הייצוג לפי רשות
    const client = makeEmptyClient(clientId, {
      firstName: displayFirstName,
      lastName: displayLastName,
      email,
      representationStatus: 'pending_fill',
      representationRequestId: reqId,
      authorityRepresentations: areas,
      ...(prefill.familyStatus ? { familyStatus: prefill.familyStatus } : {}),
      ...(prefill.familyStatusYear && prefill.familyStatus === 'married'  ? { marriageYear: prefill.familyStatusYear } : {}),
      ...(prefill.familyStatusYear && prefill.familyStatus === 'divorced' ? { divorceYear: prefill.familyStatusYear } : {}),
      ...(prefill.familyStatusYear && prefill.familyStatus === 'widowed'  ? { widowhoodYear: prefill.familyStatusYear } : {}),
      ...(spouse ? { spouseName: spouse.name } : {}),
      ...(spouse?.idNumber ? { spouseIdNumber: spouse.idNumber } : {}),
      notes: 'נוצר אוטומטית מבקשת ייצוג. ממתין להשלמת התהליך.',
    });
    await addClient(client);

    // 2. התקשרות ייצוג. טופס 2279א'5 (שע"ם) מכסה רק מ"ה/ניכויים/מע"מ —
    //    ביטוח לאומי הוא ייצוג נפרד ולכן נשמר רק במרשם הלקוח, לא ברשויות הבקשה.
    const shaamAuthorities = selectedKeys.filter(k => k !== 'nationalInsurance') as unknown as AuthorityKind[];
    const request: RepresentationRequest = {
      id: reqId,
      linkedClientId: clientId,
      clientName: name.trim(),
      clientEmail: email,
      authorities: shaamAuthorities,
      requestedDocs: DEFAULT_REQUESTED_DOCS.map(d => ({ ...d })),
      notes: '',
      status: 'pending_fill',
      createdAt: now,
      updatedAt: now,
      submission: null,
      submittedAt: null,
      partB: null,
      signedPdfStoredId: null,
      ocrExtracted: null,
      onboardingToken,
      onboardingStatus: 'pending',
      identification: null,
      onboardingSubmittedAt: null,
      prefill,
      signers,
    };
    await addRequest(request);

    // 3. משימה פנימית למעקב התהליך
    const areaLabels = selectedKeys.map(a => REP_AUTHORITY_LABELS[a]).join(', ');
    const task: Task = {
      id: crypto.randomUUID(),
      clientId,
      category: 'institutions',
      title: name.trim() ? `להשלים ייצוג — ${name.trim()}` : 'להשלים ייצוג — ממתין שהלקוח ימלא',
      description: `בקשת ייצוג חדשה. רשויות: ${areaLabels}.`,
      ballWith: 'me',
      status: 'open',
      progress: 'new',
      priority: 'normal',
      createdAt: now,
      updatedAt: now,
    };
    await addTask(task);

    // שליחת מייל אוטומטית ללקוח (הכל נקרא מ-Firm Profile בצד-שרת). לא חוסם — אם נכשל, הקישור הידני זמין.
    // בלי כתובת מייל מדלגים בשקט: הקישור נשלח בוואטסאפ, וזו אינה תקלה.
    const link = `${window.location.origin}/?onboard=${onboardingToken}`;
    if (!sendEmail) return { link, emailSent: false, clientId };
    let emailSent = false;
    let emailError: string | undefined;
    try {
      // מגבלת זמן — שהחלון לא ייתקע על "יוצר…" אם שרת המייל איטי/לא מגיב.
      // force — שליחה יזומה מהחלון. אין לה מה להתנגש בתביעה האוטומטית של השרת.
      const invoke = supabase.functions.invoke('send-onboarding-email', { body: { requestId: reqId, force: true } });
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('פג הזמן לשליחת המייל')), 12000));
      const { data: res, error } = await Promise.race([invoke, timeout]);
      if (error) emailError = error.message;
      else if (res?.ok) emailSent = true;
      else emailError = res?.detail?.message || res?.error || 'שגיאה לא ידועה';
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e);
    }
    return { link, emailSent, emailError, clientId };
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
    await reloadTasks();
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
    await reloadTasks();
  }

  /**
   * הרו"ח סיים לסמן את אזורי החתימה על ה-PDF ("הפקת טופס") — שומרים את ההגדרה,
   * עוברים ל"נשלח לחתימה", ושולחים לכל חותם קישור חתימה אישי למייל שלו.
   */
  async function handleProduceFormWithSetup(req: RepresentationRequest, setup: SignatureSetup) {
    // ודא שלכל חותם יש טוקן חתימה (בקשות ותיקות נוצרו לפני שהיו טוקנים)
    const signers: RepSigner[] = (req.signers && req.signers.length > 0
      ? req.signers
      : [{ id: 'client', role: 'client' as const, name: req.clientName || '', email: req.clientEmail || '', signStatus: 'pending' as const }]
    ).map(s => s.signToken ? s : { ...s, signToken: crypto.randomUUID().replace(/-/g, '') });

    await updateRequest({ ...req, signers, signatureSetup: setup, status: 'pending_signature' });
    const linkedClient = clients.find(c => c.id === req.linkedClientId);
    if (linkedClient) {
      await updateClient({ ...linkedClient, representationStatus: 'pending_signature' });
    }
    await reloadTasks();
    // ‼ בכוונה לא נשלח מייל כאן. הפקת הטופס והשליחה ללקוח הן שתי פעולות נפרדות:
    // שליחה אוטומטית בשלב הזה יצאה לפני שהוזנה אסמכתת ב"ל, והלקוח קיבל מייל
    // חלקי ואז עוד אחד מלא. השליחה נעשית מכפתור אחד מפורש במסך הבקשה.
  }

  /** נשמר ה-PDF הסופי (חתימות + חותמת צרובות) — עדיין בסטטוס awaiting_stamp עד "נשלח לשע"ם" */
  async function handleSaveSignedPdf(req: RepresentationRequest, values: Record<string, SignatureValue>, signedPdfStoredId: string) {
    await updateRequest({ ...req, signatureValues: values, signedPdfStoredId });
  }

  /**
   * מעקב ביצוע הייצוג מול הרשויות. כשהלקוח מאשר בב"ל, מרשם הייצוג של הלקוח
   * מתעדכן ל-active — ייצוג ב"ל נפרד מהליך שע"ם ולכן גם מסתיים בנפרד ממנו.
   */
  async function handleSaveExecution(req: RepresentationRequest, execution: RepresentationExecution) {
    await updateRequest({ ...req, execution });
    const linkedClient = clients.find(c => c.id === req.linkedClientId);
    const niRegistered = linkedClient?.authorityRepresentations?.nationalInsurance;
    // כשהייצוג נלקח גם לבן/בת הזוג, הוא פעיל רק אחרי ששניהם אישרו — אישור אחד
    // מותיר את התיק השני בלי ייצוג בפועל, וסימון "פעיל" היה מסתיר את זה.
    const niConfirmed = !!execution.nationalInsurance?.confirmedAt
      && (!niRegistered?.coversSpouse || !!execution.nationalInsuranceSpouse?.confirmedAt);
    if (linkedClient && niConfirmed && niRegistered && niRegistered.status !== 'active') {
      await updateClient({
        ...linkedClient,
        authorityRepresentations: {
          ...linkedClient.authorityRepresentations,
          nationalInsurance: { ...niRegistered, status: 'active' },
        },
      });
    }
  }

  /** הרו"ח מסמן שהטופס הוגש לשע"ם: awaiting_stamp → awaiting_authorities */
  async function handleMarkSentToShaam(req: RepresentationRequest) {
    await updateRequest({ ...req, status: 'awaiting_authorities' });
    const linkedClient = clients.find(c => c.id === req.linkedClientId);
    if (linkedClient) {
      await updateClient({ ...linkedClient, representationStatus: 'awaiting_authorities' });
    }
    await reloadTasks();
  }

  /**
   * הרשויות אישרו — הלקוח הופך למיוצג פעיל: כל הרשויות במרשם → active.
   * ‼ בכוונה לא נשלח מייל כאן. עד היום יצא ללקוח מייל "הייצוג אושר" מעצם
   * הסימון, בלי שהרו"ח ידע שנשלח ובלי שראה אותו. השליחה עברה לכפתור מפורש
   * בשלב 7 של מרכז הביצוע, עם תצוגה מקדימה לפניה.
   */
  async function handleMarkActive(req: RepresentationRequest) {
    await updateRequest({ ...req, status: 'active' });
    const linkedClient = clients.find(c => c.id === req.linkedClientId);
    if (linkedClient) {
      const reps = { ...(linkedClient.authorityRepresentations || {}) } as AuthorityRepresentations;
      for (const k of Object.keys(reps) as RepAuthorityKind[]) {
        const r = reps[k];
        if (r) reps[k] = { ...r, status: 'active' };
      }
      await updateClient({ ...linkedClient, representationStatus: 'active', authorityRepresentations: reps });
    }
    await reloadTasks();
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

  // ─── הצעות מחיר ולידים ─────────────────────────────────────────────────────

  const editingQuotation = editingQuotationId ? quotations.find(q => q.id === editingQuotationId) ?? null : null;

  function handleNewQuotation() {
    setEditingQuotationId(null);
    setNewQuotationLeadId(null);
    setView('quotationBuilder');
  }

  function handleOpenQuotation(q: Quotation) {
    setEditingQuotationId(q.id);
    setNewQuotationLeadId(null);
    setView('quotationBuilder');
  }

  /** הצעה חדשה שנפתחת מכרטיס ליד — הנמען ממולא מראש */
  function handleNewQuotationForLead(lead: Lead) {
    setEditingQuotationId(null);
    setNewQuotationLeadId(lead.id);
    setView('quotationBuilder');
  }

  /**
   * שומר טיוטת הצעה (יוצר/מעדכן) ומחזיר את ההצעה השמורה. אם הנמען "ליד חדש" —
   * יוצר קודם רשומת ליד ומקשר. ליד הופך ללקוח רק אחרי אישור ההצעה (שלב 4).
   */
  async function persistQuotation(payload: SaveDraftPayload): Promise<Quotation> {
    let leadId: string | undefined;
    let clientId: string | undefined;

    if (payload.recipient.kind === 'new') {
      const lead = await addLead({
        fullName: payload.recipient.fullName,
        phone: payload.recipient.phone,
        email: payload.recipient.email,
        businessName: payload.recipient.businessName,
        dealerType: payload.recipient.dealerType,
        hasPreviousAccountant: payload.recipient.hasPreviousAccountant,
        prevAccountantName: payload.recipient.prevAccountantName,
        prevAccountantEmail: payload.recipient.prevAccountantEmail,
        prevAccountantPhone: payload.recipient.prevAccountantPhone,
        status: 'new',
      });
      leadId = lead.id;
    } else if (payload.recipient.kind === 'lead') {
      leadId = payload.recipient.id;
    } else {
      clientId = payload.recipient.id;
    }

    const existing = payload.id ? quotations.find(q => q.id === payload.id) : undefined;
    if (existing) {
      return updateQuotation({
        ...existing,
        leadId: leadId ?? existing.leadId,
        clientId: clientId ?? existing.clientId,
        items: payload.items,
        futureServices: payload.futureServices,
        vatRate: payload.vatRate,
        emailSubject: payload.emailSubject,
        emailMessage: payload.emailMessage,
        notesForClient: payload.notesForClient,
        internalNotes: payload.internalNotes,
        templateId: payload.templateId,
        expiresAt: payload.expiresAt,
        representation: payload.representation,
        events: [...existing.events, { type: 'edited', at: new Date().toISOString() }],
      });
    }
    return addQuotation({
      leadId, clientId, revision: 1, status: 'draft',
      items: payload.items,
      futureServices: payload.futureServices,
      vatRate: payload.vatRate,
      emailSubject: payload.emailSubject,
      emailMessage: payload.emailMessage,
      notesForClient: payload.notesForClient,
      internalNotes: payload.internalNotes,
      templateId: payload.templateId,
      expiresAt: payload.expiresAt,
      representation: payload.representation,
      events: [],
    });
  }

  async function handleSaveQuotationDraft(payload: SaveDraftPayload) {
    const saved = await persistQuotation(payload);
    setEditingQuotationId(saved.id);
  }

  /**
   * שולח הצעה ללקוח (או מייל בדיקה לרו"ח). שומר קודם, מקפיא snapshot ברגע השליחה,
   * מייצר טוקן ציבורי, ובונה את ה-HTML באותו מחולל של התצוגה המקדימה — כדי
   * שהמייל יהיה זהה למה שהוצג. מחזיר תוצאה להצגה בבונה.
   */
  async function handleSendQuotation(payload: SaveDraftPayload, isTest: boolean): Promise<{ ok: boolean; error?: string; link?: string }> {
    const saved = await persistQuotation(payload);
    const token = saved.publicToken || crypto.randomUUID().replace(/-/g, '');
    const link = `${window.location.origin}/?quote=${token}`;
    const now = new Date().toISOString();

    const brand = deriveQuotationBrand(firmProfile);
    const ctx: Record<string, string> = {
      '{{clientName}}': payload.recipient.fullName,
      '{{businessName}}': payload.recipient.businessName || payload.recipient.fullName,
      '{{quotationNumber}}': saved.quotationNumber,
      '{{quotationLink}}': link,
    };
    const applyPlaceholders = (s: string) => Object.entries(ctx).reduce((acc, [k, v]) => acc.split(k).join(v ?? ''), s);
    const subject = applyPlaceholders(payload.emailSubject || 'הצעת מחיר');
    const html = buildQuotationEmailHtml({
      quotationNumber: saved.quotationNumber,
      recipientName: payload.recipient.fullName,
      businessName: payload.recipient.businessName,
      items: payload.items,
      vatRate: payload.vatRate,
      message: applyPlaceholders(payload.emailMessage || ''),
      quotationLink: link,
      expiresAt: payload.expiresAt,
    }, brand);

    // שולחים קודם — ורק אם המייל יצא בהצלחה מסמנים "נשלחה" ומקפיאים snapshot.
    // כך הצעה לא תיתקע במצב "נשלחה" בלי שהמייל באמת יצא.
    let res: { ok?: boolean; error?: string; detail?: { message?: string } } | null = null;
    try {
      const { data, error } = await supabase.functions.invoke('send-quotation-email', {
        body: { quotationId: saved.id, isTest, html, subject },
      });
      if (error) return { ok: false, error: error.message, link };
      res = data;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e), link };
    }
    if (!res?.ok) return { ok: false, error: res?.detail?.message || res?.error || 'שגיאה לא ידועה', link };

    const snapshot: NonNullable<Quotation['snapshot']> = {
      frozenAt: now, quotationNumber: saved.quotationNumber, revision: saved.revision,
      recipientName: payload.recipient.fullName, recipientEmail: payload.recipient.email,
      businessName: payload.recipient.businessName, items: payload.items,
      futureServices: payload.futureServices, vatRate: payload.vatRate,
      notesForClient: payload.notesForClient, emailSubject: payload.emailSubject,
      emailMessage: payload.emailMessage, firmName: firmProfile?.firmName,
      // ההגדרה מוקפאת יחד עם ההצעה: מה שהלקוח ראה ואישר הוא הייצוג שייפתח,
      // גם אם הטיוטה תיערך אחר כך.
      representation: payload.representation,
    };
    if (!isTest) {
      await updateQuotation({
        ...saved, status: 'sent', sentAt: now, publicToken: token, snapshot,
        events: [...saved.events, { type: 'sent', at: now }],
      });
    } else if (!saved.publicToken) {
      await updateQuotation({
        ...saved, publicToken: token,
        events: [...saved.events, { type: 'test_email_sent', at: now }],
      });
    }
    return { ok: true, link };
  }

  /**
   * הצעה אושרה → הפיכת הליד ללקוח והמשך לתהליך הייצוג הקיים.
   * אם הליד כבר הומר — פשוט קופצים לכרטיס הלקוח. אחרת פותחים את דיאלוג
   * הייצוג הקיים (ממולא מראש) — כדי לא לשכפל את מנגנון יצירת הייצוג.
   */
  function handleConvertQuotation(q: Quotation) {
    const lead = q.leadId ? leads.find(l => l.id === q.leadId) : undefined;
    if (lead?.convertedClientId) {
      // רשת ביטחון: אם ההסכם לא נשמר בהמרה (למשל כשל רגעי) — ניסיון חוזר שקט
      if (q.status === 'approved') void saveEngagementContract(q, lead.convertedClientId);
      setSelectedId(lead.convertedClientId);
      setView('form');
      return;
    }
    if (q.clientId) {   // הצעה ללקוח קיים — כבר לקוח; שומרים הסכם וישר לכרטיס
      if (q.status === 'approved') void saveEngagementContract(q, q.clientId);
      setSelectedId(q.clientId);
      setView('form');
      return;
    }
    setConvertingQuotation(q);
  }

  /** פתיחת מכתב שחרור לרו"ח קודם — רק אם לליד יש רו"ח קודם והוא כבר הומר ללקוח. */
  function handleReleaseLetter(q: Quotation) {
    const lead = q.leadId ? leads.find(l => l.id === q.leadId) : undefined;
    const clientId = lead?.convertedClientId || q.clientId;
    if (!clientId) return;
    const client = clients.find(c => c.id === clientId);
    setReleaseFor({
      clientId,
      clientName: client ? `${client.firstName} ${client.lastName}`.trim() : (lead?.fullName ?? ''),
      businessName: lead?.businessName,
      prevAccountant: { name: lead?.prevAccountantName, email: lead?.prevAccountantEmail, phone: lead?.prevAccountantPhone },
    });
  }

  /** תזכורת — שליחה חוזרת של אותה הצעה שנשלחה, עם אותו קישור ותוכן. */
  async function handleRemindQuotation(q: Quotation): Promise<{ ok: boolean; error?: string }> {
    if (!q.publicToken) return { ok: false, error: 'להצעה אין קישור ציבורי — שלח אותה קודם.' };
    const link = `${window.location.origin}/?quote=${q.publicToken}`;
    const brand = deriveQuotationBrand(firmProfile);
    const snap = q.snapshot;
    const html = buildQuotationEmailHtml({
      quotationNumber: q.quotationNumber,
      recipientName: snap?.recipientName ?? '',
      businessName: snap?.businessName,
      items: snap?.items ?? q.items,
      vatRate: snap?.vatRate ?? q.vatRate,
      message: snap?.emailMessage ?? q.emailMessage ?? '',
      quotationLink: link,
      expiresAt: q.expiresAt,
    }, brand);
    const subject = q.emailSubject || snap?.emailSubject || 'תזכורת — הצעת מחיר';
    try {
      const { data: res, error } = await supabase.functions.invoke('send-quotation-email', {
        body: { quotationId: q.id, isTest: false, html, subject },
      });
      if (error) return { ok: false, error: error.message };
      if (!res?.ok) return { ok: false, error: res?.detail?.message || res?.error || 'שגיאה' };
      await updateQuotation({ ...q, events: [...q.events, { type: 'reminder_sent', at: new Date().toISOString() }] });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /** onCreate של דיאלוג הייצוג בזרימת ההמרה — יוצר ייצוג ואז מקשר ליד+הצעה ללקוח. */
  async function handleCreateRepresentationFromQuotation(data: CreateRepresentationInput) {
    const res = await handleCreateRepresentation(data);
    const q = convertingQuotation;
    if (q) {
      if (q.leadId) {
        const lead = leads.find(l => l.id === q.leadId);
        if (lead) await updateLead({ ...lead, status: 'converted', convertedClientId: res.clientId });
      }
      await updateQuotation({
        ...q, clientId: res.clientId,
        events: [...q.events, { type: 'lead_converted', at: new Date().toISOString() }],
      });
      await saveEngagementContract(q, res.clientId);
    }
    return res;
  }

  /**
   * ההצעה החתומה נשמרת כ"הסכם התקשרות" במסמכי הלקוח החדש — PDF שכולל את חתימת
   * הלקוח, שם החותם ומועד האישור. כישלון כאן לא עוצר את ההמרה — ההסכם ניתן
   * להורדה ידנית מטאב המעקב של ההצעה.
   */
  async function saveEngagementContract(q: Quotation, clientId: string) {
    if (q.status !== 'approved') return;
    try {
      // כבר נשמר בעבר — לא מפיקים ומעלים שוב (הקריאה זולה, ההפקה יקרה)
      const { data: already } = await supabase
        .from('documents').select('id').eq('id', `engagement-${q.id}`).maybeSingle();
      if (already) return;
      const snap = q.snapshot;
      const bytes = await generateQuotationPdf({
        quotationNumber: q.quotationNumber,
        recipientName: snap?.recipientName ?? '',
        businessName: snap?.businessName,
        items: snap?.items ?? q.items,
        futureServices: snap?.futureServices ?? q.futureServices,
        vatRate: snap?.vatRate ?? q.vatRate,
        notesForClient: snap?.notesForClient ?? q.notesForClient,
        representation: snap?.representation ?? q.representation,
        approval: {
          signatureDataUrl: q.approvalSignature,
          signerName: q.approvalSignerName,
          approvedAt: q.approvedAt,
        },
      }, deriveQuotationBrand(firmProfile));
      await db.saveDoc({
        id: `engagement-${q.id}`,
        clientId,
        fileName: `הסכם התקשרות — הצעה ${q.quotationNumber}.pdf`,
        fileType: 'application/pdf',
        fileSize: bytes.byteLength,
        category: 'engagement_contract',
        year: 'general',
        uploadedAt: new Date().toISOString(),
        description: `הצעת מחיר ${q.quotationNumber} שאושרה ונחתמה${q.approvalSignerName ? ` על ידי ${q.approvalSignerName}` : ''} — נשמרה אוטומטית עם פתיחת הלקוח`,
        notes: '',
        fileData: bytes.slice().buffer,
      });
    } catch (e) {
      // ההמרה עצמה הצליחה — רק שמירת ההסכם נכשלה; לא חוסמים את הזרימה
      console.warn('שמירת הסכם ההתקשרות במסמכי הלקוח נכשלה:', e);
    }
  }

  // פירורי הלחם ירדו מהמעטפת (§4.1) — כל מסך נושא בעצמו את ההקשר שלו,
  // וכרטיס הלקוח מציג קישור חזרה משלו.

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
  // מחובר אך טרם הושלמה בדיקת ההרשאה
  if (authorized === null) {
    return <div className="app-loading">בודק הרשאה…</div>;
  }
  // מחובר אך אינו ברשימת המורשים — חוסמים ומאפשרים התנתקות בלבד
  if (!authorized) {
    return <NoAccessScreen email={user.email ?? ''} onSignOut={signOut} />;
  }

  const openTasksCount = tasks.filter(t => t.status === 'open' && (t.ballWith === 'me' || t.ballWith === 'stuck')).length;

  // הסרגל נושא רק את שלושת המקומות שבהם העבודה חיה (§4.1).
  // "ידע מס" יושב באשכול הכלים בקצה, מופרד בקו — הוא עזר, לא מקום עבודה (D9).
  // דוח 1301 ירד מהסרגל לגמרי: נכנסים אליו מכרטיס הלקוח, כי דוח תמיד שייך
  // ללקוח מסוים ואין משמעות לפתוח אותו "סתם" (D13).
  const navTabs: { id: View; label: string; badge?: number }[] = [
    { id: 'tasks', label: 'משימות', badge: openTasksCount > 0 ? openTasksCount : undefined },
    { id: 'list', label: 'לקוחות' },
    { id: 'quotations', label: 'הצעות ולידים' },
  ];

  return (
    <div className="app">
      <header className="header">
        {/* אלמנט שאפשר ללחוץ עליו חייב להיות נגיש גם במקלדת (§6.4) */}
        <button type="button" className="header-logo" onClick={goHome} aria-label="חזרה למשימות">
          <span className="brand-lockup">
            <PivoMark size={28} />
            <span className="brand-wordmark">PIVO</span>
          </span>
        </button>

        <nav className="main-nav">
          {navTabs.map(t => (
            <button
              key={t.id}
              onClick={() => {
                setView(t.id);
                setSelectedId(null);
                setSelectedRequestId(null);
                setEditingQuotationId(null);
              }}
              className={`nav-tab ${view === t.id ? 'active' : ''}`}
              aria-current={view === t.id ? 'page' : undefined}
            >
              {t.label}
              {t.badge !== undefined && (
                <span className="nav-badge">{t.badge}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="header-actions">
          {/* אשכול הכלים — מופרד מהניווט בקו, כדי שיהיה ברור שזה לא מקום עבודה */}
          <button
            type="button"
            className={`header-tool-link ${view === 'reference' ? 'is-active' : ''}`}
            onClick={() => {
              setView('reference');
              setSelectedId(null);
              setSelectedRequestId(null);
              setEditingQuotationId(null);
            }}
          >
            ידע מס
          </button>

          <span className="header-divider" aria-hidden="true" />

          <div className="header-account">
            <button
              type="button"
              className={`header-user ${accountMenuOpen ? 'is-open' : ''}`}
              title={displayName || user.email || ''}
              aria-label="חשבון והגדרות"
              aria-expanded={accountMenuOpen}
              onClick={() => setAccountMenuOpen(v => !v)}
            >
              {avatarUrl ? (
                <img className="header-user-avatar" src={avatarUrl} alt="" />
              ) : (
                <span className="header-user-avatar">
                  {(displayName || user.email || '?').slice(0, 1).toUpperCase()}
                </span>
              )}
            </button>

            {accountMenuOpen && (
              <div className="account-menu">
                <div className="account-menu-id">
                  <div className="account-menu-name">{displayName || user.email}</div>
                  <div className="account-menu-firm">{firmProfile?.firmName || 'גיא ישר · רואה חשבון'}</div>
                </div>
                <button
                  type="button"
                  className="account-menu-item"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    setView('firmProfile');
                    setSelectedId(null);
                    setSelectedRequestId(null);
                  }}
                >
                  פרופיל המשרד
                </button>
                {/* מצב כהה הוא העדפה, לא פעולה — מקומו בתפריט ולא בסרגל (§4.1) */}
                <button
                  type="button"
                  className="account-menu-item account-menu-toggle"
                  role="menuitemcheckbox"
                  aria-checked={theme === 'dark'}
                  onClick={toggleTheme}
                >
                  <Icon name="moon" size={14} />
                  <span>מצב כהה</span>
                  <span className={`account-switch ${theme === 'dark' ? 'is-on' : ''}`} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="account-menu-item"
                  onClick={async () => { setAccountMenuOpen(false); await signOut(); }}
                >
                  התנתקות
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="main">
        <ErrorBoundary resetKey={view}>
        <LegacyMigrationBanner knownClientIds={new Set(clients.map(c => c.id))} />
        <FailedNotificationsBanner failures={failedNotifications} />
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
            onUpdateTask={updateTask}
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
            onOpenAnnualReport={(clientId, taxYear) => {
              setAnnualReportSelection({ clientId, taxYear });
              setView('annualReport');
            }}
            initialTab={clientInitialTab}
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
          <TaxCenter
            onBack={() => setView('list')}
            freshnessTaskExists={quarterlyTaskExists(tasks)}
            onCreateFreshnessTask={() => { if (!quarterlyTaskExists(tasks)) void addTask(buildQuarterlyFreshnessTask()); }}
          />
        )}

        {view === 'annualReport' && (
          <AnnualReport
            clients={clients}
            userId={user?.id}
            onUpdateClient={updateClient}
            initialSelection={annualReportSelection}
            onConsumeInitialSelection={() => setAnnualReportSelection(null)}
          />
        )}

        {view === 'quotations' && (
          <QuotationsPipeline
            quotations={quotations}
            leads={leads}
            clients={clients}
            onNew={handleNewQuotation}
            onOpen={handleOpenQuotation}
            onConvert={handleConvertQuotation}
            onRelease={handleReleaseLetter}
            onRemind={handleRemindQuotation}
            onCancel={async q => { await cancelQuotation(q); }}
            onDelete={async q => {
              await deleteQuotation(q);
              // ההצעה שנמחקה עלולה להיות זו שפתוחה בבונה — מנקים את הבחירה
              if (editingQuotationId === q.id) setEditingQuotationId(null);
            }}
            onSaveLead={async l => { await updateLead(l); }}
            onCreateLead={async l => { await addLead(l); }}
            onDeleteLead={async l => { await deleteLead(l.id); }}
            onNewQuotationForLead={handleNewQuotationForLead}
          />
        )}

        {view === 'quotationBuilder' && (
          <QuotationBuilder
            profile={firmProfile}
            services={catalogServices}
            templates={quotationTemplates}
            leads={leads}
            clients={clients}
            existing={editingQuotation}
            initialLeadId={newQuotationLeadId ?? undefined}
            existingQuotations={quotations}
            checkRepEmailConflict={repEmailConflictMessage}
            onSaveDraft={handleSaveQuotationDraft}
            onSend={handleSendQuotation}
            onBack={() => { setEditingQuotationId(null); setView('quotations'); }}
          />
        )}

        {view === 'firmProfile' && (
          firmProfile ? (
            <FirmProfileConsole
              profile={firmProfile}
              clients={clients}
              onSave={async (p: FirmProfile) => { await saveProfile(p); }}
            />
          ) : (
            <div className="app-loading">טוען את פרופיל המשרד…</div>
          )
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
              onProduceWithSetup={handleProduceFormWithSetup}
              onSaveSignedPdf={handleSaveSignedPdf}
              onMarkSentToShaam={handleMarkSentToShaam}
              onSign={handleAccountantSign}
              onMarkActive={handleMarkActive}
              onDelete={handleDeleteRequest}
              onOpenFill={handleOpenFill}
              onOpenClientDocs={handleOpenClientDocs}
              niIncluded={!!clients.find(c => c.id === selectedRequest.linkedClientId)?.authorityRepresentations?.nationalInsurance}
              niCoversSpouse={!!clients.find(c => c.id === selectedRequest.linkedClientId)?.authorityRepresentations?.nationalInsurance?.coversSpouse}
              onSaveExecution={handleSaveExecution}
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
        </ErrorBoundary>
      </main>

      {/* סרגל ניווט תחתון — מופיע רק במסכי טלפון */}
      <nav className="mobile-nav">
        {navTabs.map(t => (
          <button
            key={t.id}
            type="button"
            className={`mobile-nav-item ${view === t.id || (t.id === 'list' && view === 'form') ? 'active' : ''}`}
            onClick={() => {
              setView(t.id);
              setSelectedId(null);
              setSelectedRequestId(null);
              setEditingQuotationId(null);
            }}
          >
            <span className="mobile-nav-label">{t.label}</span>
            {t.badge !== undefined && <span className="mobile-nav-badge">{t.badge}</span>}
          </button>
        ))}
      </nav>

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

      {showOnboarding && (
        <RepresentationOnboardingDialog
          onCreate={handleCreateRepresentation}
          onCancel={() => setShowOnboarding(false)}
          checkEmailConflict={repEmailConflictMessage}
        />
      )}

      {releaseFor && (
        <ReleaseLetterDialog
          clientId={releaseFor.clientId}
          clientName={releaseFor.clientName}
          businessName={releaseFor.businessName}
          prevAccountant={releaseFor.prevAccountant}
          brand={deriveQuotationBrand(firmProfile)}
          onClose={() => setReleaseFor(null)}
        />
      )}

      {convertingQuotation && (() => {
        const lead = convertingQuotation.leadId ? leads.find(l => l.id === convertingQuotation.leadId) : undefined;
        return (
          <RepresentationOnboardingDialog
            initialName={lead?.fullName ?? convertingQuotation.snapshot?.recipientName ?? ''}
            initialEmail={lead?.email ?? convertingQuotation.snapshot?.recipientEmail ?? ''}
            onCreate={handleCreateRepresentationFromQuotation}
            onCancel={() => setConvertingQuotation(null)}
            checkEmailConflict={repEmailConflictMessage}
          />
        );
      })()}
    </div>
  );
}
