// ─── תיק לקוח — Workspace ─────────────────────────────────────────────────
// Header קבוע + לשוניות. החלפה מלאה ל-ClientForm הישן.
//
// ‼ מספר הלשוניות תלוי בקילל-סוויץ': עם journeyUi דלוק (ברירת המחדל) —
// ארבע לשוניות סביב "המסע"; כבוי — חמש הלשוניות הישנות חוזרות, כולל "קליטה".

import { useState, useEffect, useMemo, useRef } from 'react';
import { Client, Task, REPRESENTATION_STATUS_LABELS, REPRESENTATION_STATUS_BADGE, VATStatus, IncomeTaxType, LifecycleStage, LIFECYCLE_STAGE_LABELS } from '../types';
import { ActivityEntry, ClientAlert, SHAAM_STATUS_BADGE } from '../types/clientWorkspace';
import { useEmployees } from '../hooks/useEmployees';
import { useDocumentDB } from '../hooks/useIndexedDB';
import { computeClientAlerts, getClientOpenTasks, getUpcomingDebts } from '../utils/clientDerived';
// הלשוניות הישנות הוחלפו ב-ClientCockpitTab + ClientDossierTab; הטפסים
// המלאים נגישים מתוך "התיק". הקבצים עצמם נמחקו — לא היה להם אף מייבא.
import Icon from './ui/Icon';
import ConfirmDialog from './ui/ConfirmDialog';
import ClientDeleteDialog from './ClientDeleteDialog';
import DocumentsTab from './clientTabs/DocumentsTab';
import { useClientTaxSessions } from '../features/annualReport/useClientTaxSessions';
import { registeredFileInfo } from '../features/annualReport/profile';
import TasksActivityTab from './clientTabs/TasksActivityTab';
import SendIntakeModal from './SendIntakeModal';
import ClientDossierTab from './clientTabs/ClientDossierTab';
import ClientCockpitTab from './clientTabs/ClientCockpitTab';
import JourneyTab from './clientTabs/JourneyTab';
import OnboardingTab from './clientTabs/OnboardingTab';
import type { Engagement, OnboardingEvent, OnboardingStep } from '../types/onboarding';
import { isStepOpen, stepAwaitsMe } from '../types/onboarding';
import type { Lead } from '../types/quotations';
import type { AdvanceResult } from '../hooks/useOnboarding';

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

// ארבע לשוניות קבועות — יכולת חדשה בעתיד נכנסת כקטע בתוך "התיק" או אות
// במרכז השליטה, אף פעם לא כלשונית (ראה הצעת הארכיטקטורה שאושרה 15.07.2026).
// "קליטה" היא היוצא מן הכלל: היא מופיעה רק כשיש ללקוח קליטה בפועל, ונעלמת
// כשהיא נגמרת — לשונית מתה בכל לקוח היא בדיוק מה שהכלל הזה בא למנוע.
export type TabId = 'overview' | 'dossier' | 'docs' | 'tasks' | 'onboarding' | 'journey';

// שמות הלשוניות נושאים את המשמעות; האייקון ירד (§3.16)
const TABS: { id: TabId; label: string }[] = [
  { id: 'overview',   label: 'מרכז שליטה' },
  { id: 'dossier',    label: 'התיק' },
  { id: 'onboarding', label: 'קליטה' },
  { id: 'docs',       label: 'מסמכים' },
  { id: 'tasks',      label: 'משימות' },
];

// ‼ המבנה החדש: ארבע לשוניות. "המסע" בולע את מרכז השליטה ואת הקליטה — שתיהן
// ענו על אותה שאלה במקומות שונים. "משימות" נשארת בנפרד בכוונה (הכרעת גיא
// 2026-08-05): עבודת משרד היא לא בקשת-מסע, ולכל אחת מסך משלה. "התיק" ו"מסמכים"
// נשארים כי הם מחסני עובדות ולא תהליך. הישן חי מאחורי flags.journeyUi=false.
const JOURNEY_TABS: { id: TabId; label: string }[] = [
  { id: 'journey',  label: 'המסע' },
  { id: 'dossier',  label: 'התיק' },
  { id: 'docs',     label: 'מסמכים' },
  { id: 'tasks',    label: 'משימות' },
];

interface Props {
  client: Client | null;
  clients: Client[];
  tasks: Task[];
  onSave: (client: Client) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
  /** העברה לארכיון והחזרה ממנו — הכתיבה היחידה של שלב הכרטיס מהמסך */
  onSetLifecycleStage?: (id: string, stage: LifecycleStage) => Promise<void>;
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
  // לשונית הפתיחה — למי שהגיע לכאן בשביל דבר מסוים (למשל מסמכי הייצוג)
  initialTab?: TabId;
  // ─── קליטה ───
  /** כבוי ⇒ הלשונית לא קיימת (settings.flags.onboardingTab=false). */
  onboardingEnabled?: boolean;
  engagements?: Engagement[];
  onboardingSteps?: OnboardingStep[];
  onboardingEvents?: OnboardingEvent[];
  onboardingLoading?: boolean;
  advanceOnboardingStep?: (stepId: string, action: string, payload?: Record<string, unknown>) => Promise<AdvanceResult>;
  /** טעינה מחדש של הקליטה — אחרי פעולות שאינן עוברות דרך advance. */
  refreshOnboarding?: () => void;
  /** פתיחת חלון מכתב השחרור לרו"ח הקודם, משלב הקליטה של הלקוח. */
  onOpenReleaseLetter?: (clientId: string, stepId?: string) => void;
  /** קפיצה למרכז הייצוג של הלקוח — מהכרטיס, בלי לעבור דרך מסך הלקוחות. */
  onOpenRepresentation?: (clientId: string) => void;
  // ─── דף המסע ───
  /** כבוי ⇒ חמש הלשוניות הישנות חוזרות (settings.flags.journeyUi=false). */
  journeyUi?: boolean;
  quotations?: import('../types/quotations').Quotation[];
  onOpenQuotation?: (quotationId: string) => void;
  onNewQuotation?: (clientId: string) => void;
  /** רשומת הליד שממנה נולד הכרטיס — «מה ידוע עליו» ומצב «לא רלוונטי». */
  lead?: Lead;
  onEditLead?: (leadId: string) => void;
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
  onSetLifecycleStage,
  onAddTaskForClient,
  onSelectTask,
  onToggleTaskDone,
  onChangeTaskStatus,
  onChangeTaskBall,
  onChangeTaskCategory,
  onReorderTask,
  onDeleteTask,
  onOpenAnnualReport,
  initialTab,
  onboardingEnabled,
  engagements,
  onboardingSteps,
  onboardingEvents,
  onboardingLoading,
  advanceOnboardingStep,
  refreshOnboarding,
  onOpenReleaseLetter,
  onOpenRepresentation,
  journeyUi,
  quotations,
  onOpenQuotation,
  onNewQuotation,
  lead,
  onEditLead,
}: Props) {
  const isNew = !initialClient;
  const [client, setClient] = useState<Client>(initialClient ?? newEmptyClient());
  // לקוח חדש נוחת ישר ב"תיק" — שם ממלאים את הפרטים
  const [tab, setTab] = useState<TabId>(initialTab ?? (initialClient ? 'overview' : 'dossier'));
  // ‼ ברענון ישיר של הכתובת הלקוח עוד לא נטען מהמסד ברינדור הראשון, ולכן
  // ברירת המחדל נפלה על "התיק" כאילו זה לקוח חדש. מתקנים פעם אחת כשהוא מגיע,
  // ורק אם המשתמש עוד לא בחר לשונית בעצמו.
  const tabPickedByUser = useRef(!!initialTab);
  const correctedDefaultTab = useRef(false);
  const [docCategories, setDocCategories] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [intakeModalOpen, setIntakeModalOpen] = useState(false);

  const db = useDocumentDB();
  const { employees, findEmployee } = useEmployees();
  const { sessions: taxSessions, loading: taxSessionsLoading } = useClientTaxSessions(client.id || undefined);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);

  const isArchived = (client.lifecycleStage ?? 'active') === 'archived';

  async function toggleArchive() {
    if (!onSetLifecycleStage || !client.id) return;
    // החזרה מארכיון נכתבת כ'לקוח פעיל'; חישוב השלב היומי בשרת ידייק אותה
    // אם האדם בעצם בקליטה או בהצעה.
    const next: LifecycleStage = isArchived ? 'active' : 'archived';
    setArchiveBusy(true);
    try {
      await onSetLifecycleStage(client.id, next);
      setClient(c => ({ ...c, lifecycleStage: next }));
      setConfirmArchive(false);
    } finally {
      setArchiveBusy(false);
    }
  }

  /**
   * קריאה אחת לדוח השנתי — והיא אומרת גם מה מצבו (D13).
   * "התחל" כשאין דוח, "המשך {שנה}" כשיש דוח פתוח, "פתח {שנה}" כשהוא סגור.
   */
  const annualCta = (() => {
    const defaultYear = new Date().getFullYear() - 1;
    const open = taxSessions.find(s => s.status === 'in_progress' || s.status === 'review');
    if (open) return { year: open.taxYear, label: `המשך דוח ${open.taxYear}` };
    const latest = taxSessions[0];
    if (latest) return { year: latest.taxYear, label: `פתח דוח ${latest.taxYear}` };
    return { year: defaultYear, label: 'התחל דוח שנתי' };
  })();

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

  // עדכון מקטעי "התיק" — נשמר מיד, בלי כפתור "שמור" (מסך עבודה, לא טופס)
  async function patchAndSaveImmediate(partial: Partial<Client>) {
    const next = { ...client, ...partial };
    setClient(next);
    if (next.id) handleSaveImmediate(next);
    else setDirty(true); // לקוח חדש — נשמר בכפתור "שמור" אחרי מילוי החובה
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

  // הלשונית "קליטה" קיימת רק ללקוח שיש לו התקשרות או שלבי קליטה בפועל
  const hasOnboarding = !!onboardingEnabled && !!advanceOnboardingStep && !!client.id && (
    (engagements ?? []).some(e => e.clientId === client.id) ||
    (onboardingSteps ?? []).some(s => s.clientId === client.id && s.status !== 'cancelled')
  );
  const visibleTabs = useMemo(
    () => journeyUi
      ? JOURNEY_TABS
      : TABS.filter(t => t.id !== 'onboarding' || hasOnboarding),
    [journeyUi, hasOnboarding]);

  // ── התג על לשונית «המסע» ──────────────────────────────────────────────────
  // ‼ סופר רק מה שאפשר לעשות עכשיו. תג שסופר גם שלבים נעולים מבטיח עבודה
  // שהמסך עצמו חוסם, ואז לומדים להתעלם ממנו — וזה בדיוק מה שהתג בא למנוע.
  const journeyBadge = useMemo(() => {
    const mine = (onboardingSteps ?? []).filter(s => s.clientId === client.id);
    return {
      n: mine.filter(stepAwaitsMe).length,
      stuck: mine.some(s => isStepOpen(s.status)
        && (s.status === 'blocked' || s.status === 'failed' || !!s.needsAttention)),
    };
  }, [onboardingSteps, client.id]);

  useEffect(() => {
    // בזמן טעינה עוד לא יודעים אם יש קליטה — לא מפילים את הלשונית מוקדם מדי
    if (!journeyUi && tab === 'onboarding' && !hasOnboarding && !onboardingLoading) setTab('overview');
  }, [journeyUi, tab, hasOnboarding, onboardingLoading]);

  // ‼ קישורי עומק ישנים (#/client/x/overview, /onboarding, /tasks) ממשיכים
  // לעבוד — הם נוחתים על המסע, שבלע את שלושתם. בלי זה כל קישור שמור נשבר.
  useEffect(() => {
    if (journeyUi && (tab === 'overview' || tab === 'onboarding')) setTab('journey');
    if (!journeyUi && tab === 'journey') setTab('overview');
  }, [journeyUi, tab]);

  useEffect(() => {
    if (correctedDefaultTab.current || tabPickedByUser.current) return;
    if (!initialClient?.id) return;         // עוד לא נטען — מחכים
    correctedDefaultTab.current = true;
    setTab(journeyUi ? 'journey' : 'overview');
  }, [initialClient?.id, journeyUi]);

  const fullName = `${client.firstName} ${client.lastName}`.trim() || (isNew ? 'לקוח חדש' : '(ללא שם)');
  const status = client.representationStatus ?? 'active';
  // מי שרק קיבל הצעה עדיין לא נמצא בשום תהליך ייצוג — תג "מיוצג פעיל" עליו
  // יסתור את שלב החיים שמוצג לידו.
  const stage = client.lifecycleStage ?? 'active';
  const showRepBadge = !!client.representationStatus || (stage !== 'lead' && stage !== 'quoted');
  const employee = findEmployee(client.assignedAccountantId);
  const regFile = registeredFileInfo(client);

  return (
    <div className="cw-root">
      {/* ─── Header קבוע ───────────────────────────────────────── */}
      <div className="cw-header">
        <div className="cw-header-top">
          <button className="ui-linkbtn cw-back" onClick={onCancel}>
            <Icon name="chevron-start" size={13} /> לקוחות
          </button>

          <div className="cw-identity">
            <div className="cw-avatar">
              {`${client.firstName.charAt(0) || '?'}${client.lastName.charAt(0) || ''}`}
            </div>
            <div>
              <div className="cw-name">{fullName}</div>
              <div className="cw-id-row">
                {client.idNumber && <span className="mono-text">ת.ז. {client.idNumber}</span>}
                {client.phone && <span className="mono-text ltr-isolate">{client.phone}</span>}
                {client.city && <span>{client.city}</span>}
              </div>
              {/* בקשת ייצוג בתהליך — שורה שקטה אחת, לא כרטיס ולא לוח מחוונים (§4.13).
                  "ממתין לבדיקתך" נצבע כי אז הכדור אצלי ואף אחד לא יזכיר לי.
                  ‼ כשיש לאן — השורה היא קישור למרכז הייצוג. סטטוס שרק מדווח
                  ולא מוביל לפעולה שולח את הרו"ח לחפש את הדרך במסך אחר. */}
              {status !== 'active' && (
                onOpenRepresentation ? (
                  <button
                    type="button"
                    className={`cw-rep-line ${status === 'awaiting_accountant' || status === 'awaiting_stamp' ? 'is-mine' : ''}`}
                    onClick={() => onOpenRepresentation(client.id)}
                    style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer', textAlign: 'start' }}
                    title="למרכז הייצוג"
                  >
                    בקשת ייצוג · {REPRESENTATION_STATUS_LABELS[status]} ←
                  </button>
                ) : (
                  <div className={`cw-rep-line ${status === 'awaiting_accountant' || status === 'awaiting_stamp' ? 'is-mine' : ''}`}>
                    בקשת ייצוג · {REPRESENTATION_STATUS_LABELS[status]}
                  </div>
                )
              )}
            </div>
          </div>

          <div className="cw-header-actions">
            {dirty && <span className="cw-dirty-flag">שינויים לא שמורים</span>}

            {/* שליחת השאלון ירדה מדרגת "כפתור" — היא מסלול משנה ולא צריכה
                להתחרות עם הדוח השנתי על תשומת הלב (D13) */}
            {!isNew && (
              <button
                className="ui-linkbtn"
                onClick={() => setIntakeModalOpen(true)}
                title="שליחת קישור שאלון היכרות/עדכון למייל הלקוח"
              >שלח שאלון</button>
            )}

            {!isNew && (
              <button
                className="ui-btn ui-btn-ghost"
                onClick={() => onAddTaskForClient(client.id)}
              >+ משימה</button>
            )}

            {/* קריאה אחת לדוח השנתי, והיא אומרת גם איפה הוא עומד (D13) */}
            {!isNew && openYear && (
              <button
                className="ui-btn ui-btn-primary"
                onClick={() => openYear(annualCta.year)}
                title="פתיחת הדוח השנתי של הלקוח"
              >{annualCta.label}</button>
            )}

            <button className="ui-btn ui-btn-ghost" onClick={handleSave} disabled={!dirty}>שמור</button>

            {/* פעולה נדירה — ולכן שקטה, ליד המחיקה ולא לצדה של פעולה יומיומית */}
            {!isNew && onSetLifecycleStage && (
              <button
                className="ui-linkbtn"
                onClick={() => setConfirmArchive(true)}
                title={isArchived
                  ? 'החזרת הכרטיס לרשימת הלקוחות'
                  : 'הסתרת הכרטיס מרשימת הלקוחות — בלי למחוק כלום'}
              >{isArchived ? 'החזר מארכיון' : 'העבר לארכיון'}</button>
            )}

            {!isNew && (
              <button
                className="ui-icon-btn is-danger"
                onClick={() => setConfirmDelete(true)}
                aria-label={`מחיקת ${fullName}`}
                title="מחיקה"
              ><Icon name="close" size={14} /></button>
            )}
          </div>
        </div>

        {/* Header — chips & meta */}
        <div className="cw-header-chips">
          {isArchived && (
            <span className="badge badge-gray" title="הכרטיס מוסתר מרשימת הלקוחות. שום נתון לא נמחק.">
              {LIFECYCLE_STAGE_LABELS.archived}
            </span>
          )}

          {showRepBadge ? (
            <span className={`badge ${REPRESENTATION_STATUS_BADGE[status]}`}>
              {REPRESENTATION_STATUS_LABELS[status]}
            </span>
          ) : (
            <span className="badge badge-gray">{LIFECYCLE_STAGE_LABELS[stage]}</span>
          )}

          {/* העוגן: על שם מי רץ תיק מס הכנסה — תמיד מול העיניים, בכל לשונית */}
          {regFile && (
            <span
              className="cw-tax-chip"
              title="בן/בת הזוג הרשום/ה — כל ההתנהלות מול מס הכנסה בת.ז. הזו. ניתן לשינוי בלשונית התיק."
              style={{
                fontWeight: 600,
                background: regFile.owner === 'spouse' ? 'var(--chip-amber-bg)' : undefined,
                color: regFile.owner === 'spouse' ? 'var(--warn)' : undefined,
                border: regFile.owner === 'spouse' ? '1px solid var(--chip-amber-bd)' : undefined,
              }}
            >
              תיק מ"ה ע"ש {regFile.name}
              {regFile.idNumber ? ` · ${regFile.idNumber}` : ''}
            </span>
          )}

          {employee ? (
            <span className="cw-emp-chip" title={employee.role}>
              <span className="cw-emp-dot" style={{ background: employee.color }}>{employee.initials}</span>
              {employee.name}
            </span>
          ) : (
            <span className="cw-emp-chip muted">ללא מטפל</span>
          )}

          <span className="cw-tax-chip">{IT_LABELS[client.incomeTaxType]}</span>
          <span className="cw-tax-chip">{VAT_LABELS[client.vatStatus]}</span>
          <span className="cw-tax-chip">ב״ל {client.niType === 'employee' ? 'שכיר' : client.niType === 'selfEmployed' ? 'עצמאי' : client.niType === 'employeeAndSE' ? 'משולב' : client.niType}</span>

          {client.shaamStatus && (
            <span className={`badge ${SHAAM_STATUS_BADGE[client.shaamStatus]}`}>
              שע״ם: {client.shaamStatus === 'active' ? 'פעיל' : client.shaamStatus === 'inactive' ? 'לא פעיל' : client.shaamStatus === 'pending' ? 'בטיפול' : 'לא ידוע'}
            </span>
          )}

          {(client.tags ?? []).map(t => <span key={t} className="cw-tag">#{t}</span>)}
        </div>

        {/* Header — alerts strip.
            במרכז השליטה אותם מספרים כבר מופיעים בסימני המצב, ובפירוט רב
            יותר. "6 משימות פתוחות" שלוש פעמים באותו מסך — בשורה הזו,
            בסימן, ובבאדג' של הטאב — הוא בדיוק מה שהכלל "כל מספר פעם אחת"
            בא למנוע. ולכן כאן היא מוצגת רק כשהמרכז לא פתוח. */}
        {alerts.length > 0 && tab !== 'overview' && (
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
          {visibleTabs.map(t => (
            <button
              key={t.id}
              className={`cw-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => { tabPickedByUser.current = true; setTab(t.id); }}
            >
              <span>{t.label}</span>
              {t.id === 'tasks' && openTasks.length > 0 && (
                <span className="cw-tab-badge">{openTasks.length}</span>
              )}
              {/* ‼ העיגול המלא הוא היחיד במסך. הוא שמור למה שדורש אותי עכשיו
                  — תג המשימות נשאר שטוח ואפור, אחרת שוב אין לעין לאן ללכת. */}
              {t.id === 'journey' && journeyBadge.n > 0 && (
                <span
                  className={`cw-tab-dot ${journeyBadge.stuck ? 'is-stuck' : ''}`}
                  title={journeyBadge.stuck
                    ? `${journeyBadge.n} דברים אצלך · יש משהו תקוע`
                    : `${journeyBadge.n} דברים מחכים לך`}
                >{journeyBadge.n}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ─── תוכן הלשונית ─────────────────────────────────────── */}
      <div className="cw-body">
        {tab === 'journey' && (
          <JourneyTab
            client={client}
            tasks={tasks}
            alerts={alerts}
            openTasks={openTasks}
            upcomingDebts={upcomingDebts}
            quotations={quotations ?? []}
            engagements={engagements ?? []}
            steps={onboardingSteps ?? []}
            events={onboardingEvents ?? []}
            onboardingLoading={onboardingLoading}
            onboardingEnabled={onboardingEnabled}
            advance={advanceOnboardingStep ?? (async () => ({ ok: false, message: 'הקליטה מכובה.' }))}
            refreshOnboarding={refreshOnboarding}
            onOpenQuotation={onOpenQuotation}
            onNewQuotation={onNewQuotation ? () => onNewQuotation(client.id) : undefined}
            lead={lead}
            onEditLead={onEditLead}
            onOpenRepresentation={onOpenRepresentation ? () => onOpenRepresentation(client.id) : undefined}
            onPrepareReleaseLetter={onOpenReleaseLetter ? (stepId) => onOpenReleaseLetter(client.id, stepId) : undefined}
            repStatusLabel={client.representationStatus ? REPRESENTATION_STATUS_LABELS[client.representationStatus] : undefined}
            repStatus={client.representationStatus ?? undefined}
            onPinNote={(note) => update('pinnedNote', note)}
            onAddNote={(text) => appendActivity({ kind: 'note', text })}
            onGotoTab={(t) => setTab(t)}
            taxSessions={taxSessions}
            taxSessionsLoading={taxSessionsLoading}
            onOpenYear={openYear}
            onSelectTask={onSelectTask}
          />
        )}

        {tab === 'overview' && (
          <ClientCockpitTab
            client={client}
            tasks={tasks}
            alerts={alerts}
            openTasks={openTasks}
            upcomingDebts={upcomingDebts}
            onPinNote={(note) => update('pinnedNote', note)}
            onAddNote={(text) => appendActivity({ kind: 'note', text })}
            onGotoTab={(t) => setTab(t)}
            onSelectTask={onSelectTask}
            taxSessions={taxSessions}
            taxSessionsLoading={taxSessionsLoading}
            onOpenYear={openYear}
          />
        )}

        {tab === 'dossier' && (
          <ClientDossierTab
            client={client}
            update={update}
            patch={patch}
            patchAndSave={patchAndSaveImmediate}
            employees={employees}
            sessions={taxSessions}
            isNew={isNew}
          />
        )}

        {tab === 'onboarding' && hasOnboarding && advanceOnboardingStep && (
          <OnboardingTab
            clientId={client.id}
            engagements={engagements ?? []}
            steps={onboardingSteps ?? []}
            events={onboardingEvents ?? []}
            loading={onboardingLoading}
            advance={advanceOnboardingStep}
            refresh={refreshOnboarding}
            prevAccountant={{
              name: client.prevAccountantName,
              email: client.prevAccountantEmail,
              phone: client.prevAccountantPhone,
            }}
            onPrepareReleaseLetter={onOpenReleaseLetter
              ? (stepId) => onOpenReleaseLetter(client.id, stepId)
              : undefined}
            repStatusLabel={client.representationStatus
              ? `בקשת ייצוג · ${REPRESENTATION_STATUS_LABELS[status]}`
              : undefined}
            repStatus={client.representationStatus ?? undefined}
            onOpenRepresentation={onOpenRepresentation
              ? () => onOpenRepresentation(client.id)
              : undefined}
            clientDisplayName={`${client.firstName} ${client.lastName ?? ''}`.trim()}
            clientEmail={client.email}
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
          onSent={(email) => appendActivity({ kind: 'manual', text: `נשלח שאלון עדכון אל ${email}` })}
        />
      )}

      {confirmArchive && (
        <ConfirmDialog
          title={isArchived ? 'החזרה מארכיון' : 'העברה לארכיון'}
          message={isArchived
            ? <>להחזיר את ״{fullName}״ לרשימת הלקוחות?</>
            : <>להעביר את ״{fullName}״ לארכיון? הכרטיס יוסתר מהרשימה. שום נתון לא נמחק.</>}
          confirmLabel={archiveBusy
            ? 'רגע…'
            : isArchived ? 'החזר מארכיון' : 'העבר לארכיון'}
          tone="normal"
          onConfirm={() => { void toggleArchive(); }}
          onCancel={() => setConfirmArchive(false)}
        />
      )}

      {confirmDelete && (
        <ClientDeleteDialog
          client={client}
          tasks={tasks}
          onArchive={onSetLifecycleStage && !isArchived
            ? async () => { await toggleArchive(); setConfirmDelete(false); }
            : undefined}
          onDelete={() => { setConfirmDelete(false); onDelete(client.id); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
