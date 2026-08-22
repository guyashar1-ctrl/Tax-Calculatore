// ─── תיק לקוח — Workspace ─────────────────────────────────────────────────
// Header קבוע + לשוניות. החלפה מלאה ל-ClientForm הישן.
//
// ‼ מספר הלשוניות תלוי בקילל-סוויץ': עם journeyUi דלוק (ברירת המחדל) —
// ארבע לשוניות סביב "המסע"; כבוי — חמש הלשוניות הישנות חוזרות, כולל "קליטה".

import { useState, useEffect, useMemo, useRef } from 'react';
import { Client, Task, REPRESENTATION_STATUS_LABELS, REPRESENTATION_STATUS_BADGE, LifecycleStage, LIFECYCLE_STAGE_LABELS } from '../types';
import { ActivityEntry, ClientAlert } from '../types/clientWorkspace';
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
import TasksActivityTab from './clientTabs/TasksActivityTab';
import AddRequestDialog from './clientTabs/AddRequestDialog';
import ClientDossierTab from './clientTabs/ClientDossierTab';
import ClientCockpitTab from './clientTabs/ClientCockpitTab';
import JourneyTab from './clientTabs/JourneyTab';
import OnboardingTab from './clientTabs/OnboardingTab';
import TaxFileTab from './clientTabs/TaxFileTab';
import type { Engagement, OnboardingEvent, OnboardingStep } from '../types/onboarding';
import { isStepOpen, stepAwaitsMe } from '../types/onboarding';
import type { Lead, QuotationKind } from '../types/quotations';
import type { AdvanceResult } from '../hooks/useOnboarding';
import { GOVERNED_FACT_KEYS, GOVERNED_FIELD_LABELS, governedValuesEqual } from '../types/taxFacts';
import { recordManualFactChange } from '../lib/taxFacts';
import { clientFromDb } from '../lib/dbMappers';
import AgreementPaymentsTab from './clientTabs/AgreementPaymentsTab';
import ActivityTab from './clientTabs/ActivityTab';
import InfoLines from './ui/InfoLines';

// ארבע לשוניות קבועות — יכולת חדשה בעתיד נכנסת כקטע בתוך "התיק" או אות
// במרכז השליטה, אף פעם לא כלשונית (ראה הצעת הארכיטקטורה שאושרה 15.07.2026).
// "קליטה" היא היוצא מן הכלל: היא מופיעה רק כשיש ללקוח קליטה בפועל, ונעלמת
// כשהיא נגמרת — לשונית מתה בכל לקוח היא בדיוק מה שהכלל הזה בא למנוע.
//
// ‼ M3 — חריגה שנייה, מודעת: "הסכם ותשלומים" ו"פעילות" נוספות כלשוניות מלאות,
// לא כקטעים. docs/prototypes/README.md (הוקפא 2026-08-14, cc2878e) קובע
// אותן כאזורים מאושרים שווי-משקל ל"תיק מס"/"מסמכים" — שתיהן כבר לשוניות —
// בתוך client-case-simplified-exploration-v3-final2.html (טאבים process/tax/
// docs/pay/log). המקור הזה חדש ומחייב יותר מהכלל מ-15.07; לא בוטל, לא נסתר.
export type TabId = 'overview' | 'dossier' | 'docs' | 'tasks' | 'onboarding' | 'journey' | 'taxfile' | 'pay' | 'log';

// שמות הלשוניות נושאים את המשמעות; האייקון ירד (§3.16)
const TABS: { id: TabId; label: string }[] = [
  { id: 'overview',   label: 'מרכז שליטה' },
  { id: 'dossier',    label: 'התיק' },
  { id: 'onboarding', label: 'בקשות' },   // אותו משטח כמו journey — שם אחד לשניהם
  { id: 'docs',       label: 'מסמכים' },
  { id: 'tasks',      label: 'משימות' },
];

// ‼ חמש לשוניות עמיתות, בדיוק כמו במקור המאושר
// (client-case-simplified-exploration-v3-final2.html · תהליך/תיק מס/מסמכים/
// הסכם ותשלומים/פעילות). שתי לשוניות ירדו מהשורה:
//
// · "התיק" — היא הציגה את עצמה כרשומה מקצועית שנייה לצד "תיק מס", והרו"ח
//   נאלץ לבחור בין שתיהן. היכולת עצמה לא נמחקה: היא נפתחת כפעולה משנית
//   מתוך "תיק מס", שם היא באמת נחוצה (עריכת פרטים).
// · "משימות" — עבודת המשרד חיה במסך המשימות הגלובלי. כפילות של מנהל
//   משימות בתוך הכרטיס פיצלה את תור העבודה לשניים. במקומה קישור הקשרי
//   שפותח את המשימות מסוננות ללקוח הזה.
//
// ‼ הלשונית נקראת "בקשות" (ולא "המסע"/"תהליך"). זה משטח קבוע לכל אורך הקשר
// עם הלקוח — הבקשות ממשיכות להיווצר גם שנה אחרי הקליטה — ו"תהליך" תיאר משהו
// שמתחיל ונגמר. השם הוא האובייקט שעל המסך: בקשה.
const JOURNEY_TABS: { id: TabId; label: string }[] = [
  { id: 'journey',  label: 'בקשות' },
  { id: 'taxfile',  label: 'תיק מס' },
  { id: 'docs',     label: 'מסמכים' },
  { id: 'pay',      label: 'הסכם ותשלומים' },
  { id: 'log',      label: 'פעילות' },
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
  onOpenReleaseLetter?: (clientId: string, stepId: string, mode?: 'letter' | 'follow_up') => void;
  /** קפיצה למרכז הייצוג של הלקוח — מהכרטיס, בלי לעבור דרך מסך הלקוחות. */
  onOpenRepresentation?: (clientId: string) => void;
  // ─── דף המסע ───
  /** כבוי ⇒ חמש הלשוניות הישנות חוזרות (settings.flags.journeyUi=false). */
  journeyUi?: boolean;
  quotations?: import('../types/quotations').Quotation[];
  onOpenQuotation?: (quotationId: string) => void;
  onNewQuotation?: (clientId: string, kind: QuotationKind) => void;
  /** רשומת הליד שממנה נולד הכרטיס — «מה ידוע עליו» ומצב «לא רלוונטי». */
  lead?: Lead;
  onEditLead?: (leadId: string) => void;
  // ─── M3: הסכם ותשלומים ───
  charges?: import('../types/charges').AdditionalCharge[];
  onMarkChargePaid?: (charge: import('../types/charges').AdditionalCharge) => Promise<import('../types/charges').AdditionalCharge>;
  /** פתיחת מסך המשימות הגלובלי מסונן ללקוח הזה — במקום לשונית משימות בכרטיס. */
  onOpenClientTasks?: (clientId: string) => void;
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
  charges,
  onMarkChargePaid,
  onOpenClientTasks,
}: Props) {
  const isNew = !initialClient;
  const [client, setClient] = useState<Client>(initialClient ?? newEmptyClient());
  // לקוח חדש נוחת ישר ב"תיק" — שם ממלאים את הפרטים
  const [tab, setTab] = useState<TabId>(initialTab ?? (initialClient ? 'overview' : 'dossier'));
  /** תיקייה שהמסך צריך לפתוח בלשונית המסמכים — נקבעת בקיצור ממסך הקליטה. */
  const [docsFolderId, setDocsFolderId] = useState<string | null>(null);
  // ‼ ברענון ישיר של הכתובת הלקוח עוד לא נטען מהמסד ברינדור הראשון, ולכן
  // ברירת המחדל נפלה על "התיק" כאילו זה לקוח חדש. מתקנים פעם אחת כשהוא מגיע,
  // ורק אם המשתמש עוד לא בחר לשונית בעצמו.
  const tabPickedByUser = useRef(!!initialTab);
  const [docCategories, setDocCategories] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [intakeModalOpen, setIntakeModalOpen] = useState(false);

  const db = useDocumentDB();
  const { employees, findEmployee } = useEmployees();
  const { sessions: taxSessions, loading: taxSessionsLoading } = useClientTaxSessions(client.id || undefined);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    function onDoc(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    const t = setTimeout(() => document.addEventListener('click', onDoc), 0);
    return () => { clearTimeout(t); document.removeEventListener('click', onDoc); };
  }, [moreOpen]);
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

  // פתיחת שנת דוח ספציפית — נקרא מהקשר (שורת "תהליך"/מרכז שליטה הישן),
  // לא מ-CTA קבוע בכותרת. ראה docs/prototypes/README.md.
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

  /**
   * ‼ המסך מחזיק עותק עריכה משלו, ולכן משיכה חדשה של הלקוח מ-App לא הגיעה
   * לכאן — כרטיס פתוח המשיך להציג "ליד" גם אחרי שהלקוח אישר את ההצעה.
   * שני השדות האלה נכתבים בשרת בלבד (שלב החיים נגזר מההצעה, מצב הייצוג
   * מתהליך הייצוג) ואינם ניתנים לעריכה במסך — ולכן אפשר לאמץ אותם בבטחה
   * מבלי לגעת בשדות שהמשתמש עורך כרגע ובלי לאבד עריכה פתוחה.
   */
  const serverStage = initialClient?.lifecycleStage;
  const serverRepStatus = initialClient?.representationStatus;
  useEffect(() => {
    if (!initialClient?.id) return;
    setClient(c => (c.lifecycleStage === serverStage && c.representationStatus === serverRepStatus)
      ? c
      : { ...c, lifecycleStage: serverStage, representationStatus: serverRepStatus });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialClient?.id, serverStage, serverRepStatus]);

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

  /**
   * ‼ "התיק" (ClientDossierTab/PersonalContactsTab/TaxNITab/TaxFilesSection)
   * הוא מסך עריכה מלאה ישן — שדות עם update()/patch() ישירות, בלי לעבור דרך
   * useTaxFacts. חלק מהם הם עובדות מקצועיות שהתאמה מנהלת (GOVERNED_FACT_KEYS,
   * אותה רשימה בדיוק כמו allowlist השרת ועורך "עדכן בכרטיס" בשאלון).
   * כתיבה ישירה שלהן דרך updateClient() הרגילה הייתה עוקפת את ההיסטוריה,
   * את provenance של field_meta, ואת ההגנה מפני דריסה שקטה — בדיוק מה
   * שהתגלה כפער בביקורת. לכן: בזמן השמירה, שדות מנוהלים שהשתנו מאז
   * הטעינה עוברים בנפרד דרך record_manual_fact_change (הרו"ח הוא הסמכות
   * הסופית — נכנס ישר כ-accepted), ומוצאים מתוך השמירה הרגילה כדי שלא
   * ייכתבו פעמיים. לקוח חדש (עדיין לא קיים ב-DB) מדלג על זה לגמרי —
   * אין עדיין עובדה מקובלת להגן עליה, וה-RPC ממילא ידרוש שורת clients קיימת.
   */
  function handleSave() {
    const now = new Date().toISOString();
    const id = client.id || crypto.randomUUID();
    const c: Client = {
      ...client,
      id,
      createdAt: client.createdAt || now,
      updatedAt: now,
    };

    const initialClientRec = initialClient as unknown as Record<string, unknown> | null;
    const cRec = c as unknown as Record<string, unknown>;
    const changedGoverned = (!isNew && initialClientRec)
      ? Array.from(GOVERNED_FACT_KEYS).filter((k) => !governedValuesEqual(initialClientRec[k], cRec[k]))
      : [];

    if (changedGoverned.length > 0) {
      const patch: Record<string, unknown> = {};
      changedGoverned.forEach((k) => { patch[k] = cRec[k]; });
      const labels = changedGoverned.map((k) => GOVERNED_FIELD_LABELS[k] ?? k);
      void recordManualFactChange(
        id, 'dossier-edit', `עדכון בתיק · ${labels.join(', ')}`,
        'לפני העדכון', 'עודכן בתיק', patch,
      ).then((res) => {
        if (!res.ok) { console.error('[dossier] כתיבת עובדה מנוהלת נכשלה:', res.error); return; }
        // ה-field_meta האמיתי (provenance) נכתב רק בתוך ה-RPC — לא בעותק
        // המקומי שכבר היה בזיכרון. מציבים אותו בחזרה כשהתשובה חוזרת, כדי
        // שהמסך יראה "מקור: ידני" בלי לדרוש רענון מלא.
        if (res.client) setClient((prev) => ({ ...prev, fieldMeta: clientFromDb(res.client!).fieldMeta }));
      });
    }

    // שדות מנוהלים שכבר נכתבו אטומית למעלה מוצאים מהאובייקט שהולך ל-onSave
    // הרגילה (undefined = objectToRow מדלגת על העמודה) — לא כותבים אותם פעמיים.
    //
    // ‼ field_meta מוצא תמיד, בלי תנאי — לא רק כשיש שינוי מנוהל. אף שדה
    // בתיק לא כותב אליו ישירות (הוא provenance שנקרא, לא נערך), ולכן העותק
    // המקומי הוא תמיד רק מה שנטען פעם אחת ועלול כבר להתיישן. אם לא מוציאים
    // אותו כאן, השמירה הרגילה — שרצה *בלי המתנה* מקבילית לקריאת ה-RPC
    // האטומית למעלה — עלולה לדרוס את ה-field_meta העדכני שה-RPC כתב הרגע
    // בעותק הישן שהיה בזיכרון לפני הלחיצה על "שמור". זה בדיוק מה שקרה
    // בבדיקה בדפדפן: הערך התעדכן נכון, אבל source='manual' נמחק ברגע אחריו.
    const plainClient: Client = { ...c };
    const plainClientRec = plainClient as unknown as Record<string, unknown>;
    changedGoverned.forEach((k) => { plainClientRec[k] = undefined; });
    plainClientRec.fieldMeta = undefined;

    onSave(plainClient);
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

  const clientCharges = useMemo(
    () => (charges ?? []).filter(c => c.clientId === client.id),
    [charges, client.id]);
  const clientSteps = useMemo(
    () => (onboardingSteps ?? []).filter(s => s.clientId === client.id && s.status !== 'cancelled'),
    [onboardingSteps, client.id]);
  /** ההתקשרות הפעילה — קובעת אם התהליך כבר פורסם ללקוח (מצב "טיוטה"). */
  const activeEngagement = useMemo(
    () => (engagements ?? []).find(e => e.clientId === client.id && e.status !== 'cancelled'),
    [engagements, client.id]);
  /** תג תשומת-לב על "הסכם ותשלומים" — מועד תשלום שהגיע ועדיין לא סומן שולם. */
  const overdueChargeCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return clientCharges.filter(c => c.status !== 'paid' && c.dueDate && c.dueDate <= today).length;
  }, [clientCharges]);

  useEffect(() => {
    // בזמן טעינה עוד לא יודעים אם יש קליטה — לא מפילים את הלשונית מוקדם מדי
    if (!journeyUi && tab === 'onboarding' && !hasOnboarding && !onboardingLoading) setTab('overview');
  }, [journeyUi, tab, hasOnboarding, onboardingLoading]);

  // ‼ קישורי עומק ישנים (#/client/x/overview, /onboarding, /tasks) ממשיכים
  // לעבוד — הם נוחתים על המסע, שבלע את שלושתם. בלי זה כל קישור שמור נשבר.
  //
  // נחיתת ברירת המחדל (מאושר, M1) חיה באותו אפקט ולא באפקט נפרד בכוונה:
  // תחת הכפלת האפקטים של StrictMode בפיתוח, שני אפקטים עם setTab מתחרים
  // עלולים "לנצח" זה את זה בסבב השני (ה-ref החד-פעמי כבר נצרך, האפקט השני
  // עדיין קורא tab הישן וגובר). אפקט אחד עם תנאי אחד הוא אידמפוטנטי משני
  // הסבבים ולא רגיש לסדר. לקוח פעיל/בארכיון כבר עבר קליטה — "המסע" נגמר
  // בשבילו, ונוחתים ישר על "תיק מס". מי שעדיין ליד/בהצעה/בקליטה בפועל נוחת
  // על "המסע", ששם השלב הבא שלו. קישור עומק מפורש (initialTab) לא נבחן מול
  // שלב החיים — הוא ממשיך להתנקז ל"המסע" כמו קודם.
  useEffect(() => {
    if (!journeyUi) {
      // ‼ pay/log קיימות רק ב-JOURNEY_TABS. בלי ההחזרה הזו, מי שכיבה את
      // הקילל-סוויץ' בזמן שהוא עומד עליהן היה נתקע על לשונית שאין לה כפתור.
      if (tab === 'journey' || tab === 'pay' || tab === 'log') setTab('overview');
      return;
    }
    if (tab !== 'overview' && tab !== 'onboarding') return;
    if (!tabPickedByUser.current && initialClient?.id) {
      const stage = initialClient.lifecycleStage ?? 'active';
      setTab(stage === 'active' || stage === 'archived' ? 'taxfile' : 'journey');
    } else {
      setTab('journey');
    }
  }, [journeyUi, tab, initialClient?.id]);

  const fullName = `${client.firstName} ${client.lastName}`.trim() || (isNew ? 'לקוח חדש' : '(ללא שם)');
  const status = client.representationStatus ?? 'active';
  // מי שרק קיבל הצעה עדיין לא נמצא בשום תהליך ייצוג — תג "מיוצג פעיל" עליו
  // יסתור את שלב החיים שמוצג לידו.
  const stage = client.lifecycleStage ?? 'active';
  const showRepBadge = !!client.representationStatus || (stage !== 'lead' && stage !== 'quoted');
  const employee = findEmployee(client.assignedAccountantId);
  const hasHeaderChips = !!employee || (client.tags ?? []).length > 0
    || (!isNew && openTasks.length > 0 && !!onOpenClientTasks);

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
              {/* ‼ שלב החיים/מצב הייצוג יושב על שורת השם ולא ברצועה שמתחת:
                  הוא תכונה של האדם, וברצועה הוא היה לרוב הדייר היחיד —
                  פס אפור שלם שנושא שתי מילים. ראה cw-header-chips למטה. */}
              <div className="cw-name-line">
                <div className="cw-name">{fullName}</div>
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
              </div>
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

          {/* ‼ הכותרת נושאת זהות בלבד, בלי CTA קבוע — כמו האסמכתא המאושרת
              (client-case-simplified-exploration-v3-final2.html: h1+badge+
              cmeta, שום כפתור). "התחל דוח שנתי" הוסר: הדוח השנתי אינו בעל
              מידע מקצועי קבוע — הוא צרכן של תיק המס. רענון מידע מהלקוח עובר
              דרך "עדכן סטטוס מיסויי" (תיק מס) או תהליך/בקשה, לא CTA ראשי
              כאן. "שמור" מופיע רק כשבאמת יש מה לשמור; ארכיון/מחיקה בתפריט
              פעולות נדירות. ראה docs/prototypes/README.md + סבב ההתכנסות. */}
          <div className="cw-header-actions">
            {dirty && (
              <>
                <span className="cw-dirty-flag">שינויים לא שמורים</span>
                <button className="ui-btn ui-btn-ghost" onClick={handleSave}>שמור</button>
              </>
            )}

            {!isNew && (
              <div className="cw-more" ref={moreRef}>
                <button
                  type="button"
                  className="ui-icon-btn"
                  aria-label="פעולות נוספות"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen(o => !o)}
                  title="פעולות נוספות"
                >⋯</button>
                {moreOpen && (
                  <div className="cw-more-menu">
                    {onSetLifecycleStage && (
                      <button type="button" onClick={() => { setMoreOpen(false); setConfirmArchive(true); }}>
                        {isArchived ? 'החזר מארכיון' : 'העבר לארכיון'}
                      </button>
                    )}
                    <button type="button" className="is-danger" onClick={() => { setMoreOpen(false); setConfirmDelete(true); }}>
                      מחיקת הלקוח
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ‼ שורת השבבים קוצצה לשלב החיים בלבד. סיווג מס הכנסה, מע״מ, ביטוח
            לאומי, שע״ם ותיק מ"ה ע"ש מי — כולם חיים ב"תיק מס" תחת "מצב מול
            הרשויות", שם הם הרשומה המקצועית ולא קישוט. הצגתם גם בקליפה
            שכפלה את אותה עובדה בשני מקומות והכריחה את העין לסרוק שבע
            תוויות לפני שהגיעה לעבודה.
            ‼ ומאז שהסטטוס עלה לשורת השם, לרוב הלקוחות לא נשאר בה כלום —
            ולכן היא מוצגת רק כשיש בה תוכן. רצועה אפורה ריקה קוראת כמו
            אזור שנשבר, לא כמו שקט. */}
        {hasHeaderChips && (
          <div className="cw-header-chips">
            {employee && (
              <span className="cw-emp-chip" title={employee.role}>
                <span className="cw-emp-dot" style={{ background: employee.color }}>{employee.initials}</span>
                {employee.name}
              </span>
            )}

            {(client.tags ?? []).map(t => <span key={t} className="cw-tag">#{t}</span>)}

            {/* משימות הלקוח — קיצור הקשרי אל תור העבודה הגלובלי, לא מנהל
                משימות שני בתוך הכרטיס. */}
            {!isNew && openTasks.length > 0 && onOpenClientTasks && (
              <button type="button" className="cw-tasks-link" onClick={() => onOpenClientTasks(client.id)}>
                {openTasks.length} משימות פתוחות ←
              </button>
            )}
          </div>
        )}

        {/* Header — tabs */}
        <div className="cw-tabs">
          {visibleTabs.map(t => (
            <button
              key={t.id}
              /* ‼ "התיק" הוא מסך-משנה של "תיק מס" ולא לשונית. בלי השורה הזו
                 אף לשונית לא הייתה מודגשת בזמן העריכה, והרו"ח היה מאבד את
                 התשובה לשאלה "איפה אני". */
              className={`cw-tab ${tab === t.id || (t.id === 'taxfile' && tab === 'dossier') ? 'active' : ''}`}
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
              {t.id === 'pay' && overdueChargeCount > 0 && (
                <span className="cw-tab-dot is-stuck" title={`${overdueChargeCount} תשלומים שמועדם הגיע`}>
                  {overdueChargeCount}
                </span>
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
            onNewQuotation={onNewQuotation ? () => onNewQuotation(client.id, 'engagement') : undefined}
            lead={lead}
            onEditLead={onEditLead}
            onOpenRepresentation={onOpenRepresentation ? () => onOpenRepresentation(client.id) : undefined}
            onPrepareReleaseLetter={onOpenReleaseLetter
              ? (stepId, mode) => onOpenReleaseLetter(client.id, stepId, mode) : undefined}
            repStatusLabel={client.representationStatus ? REPRESENTATION_STATUS_LABELS[client.representationStatus] : undefined}
            repStatus={client.representationStatus ?? undefined}
            onPinNote={(note) => update('pinnedNote', note)}
            onAddNote={(text) => appendActivity({ kind: 'note', text })}
            onGotoTab={(t) => { if (t === 'tasks') { onOpenClientTasks?.(client.id); return; } setTab(t); }}
            taxSessions={taxSessions}
            taxSessionsLoading={taxSessionsLoading}
            onOpenYear={openYear}
            onSelectTask={onSelectTask}
            onClientPersisted={(updated) => { setClient(updated); setDirty(false); }}
          />
        )}

        {tab === 'taxfile' && (
          <TaxFileTab
            client={client}
            onClientPersisted={(updated) => { setClient(updated); setDirty(false); }}
            onSendQuestionnaire={() => setIntakeModalOpen(true)}
            onOpenDetails={() => setTab('dossier')}
          />
        )}

        {tab === 'pay' && (
          <AgreementPaymentsTab
            client={client}
            quotations={quotations ?? []}
            engagements={engagements ?? []}
            charges={clientCharges}
            onMarkChargePaid={onMarkChargePaid ?? (async (c) => c)}
            onNewQuotation={onNewQuotation ? (kind) => onNewQuotation(client.id, kind) : undefined}
          />
        )}

        {tab === 'log' && (
          <ActivityTab
            client={client}
            clientSteps={clientSteps}
            events={onboardingEvents ?? []}
            quotations={quotations ?? []}
            charges={clientCharges}
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
            onGotoTab={(t) => { if (t === 'tasks') { onOpenClientTasks?.(client.id); return; } setTab(t); }}
            onSelectTask={onSelectTask}
            taxSessions={taxSessions}
            taxSessionsLoading={taxSessionsLoading}
            onOpenYear={openYear}
          />
        )}

        {/* ‼ "התיק" אינה לשונית עמיתה יותר — נכנסים אליה מתוך "תיק מס". ולכן
            היא חייבת דרך חזרה משלה: מסך בלי כפתור חזרה הוא מסך שנתקעים בו. */}
        {tab === 'dossier' && (
          <div className="cw-subscreen-back">
            <button type="button" className="ui-linkbtn" onClick={() => setTab('taxfile')}>
              <Icon name="chevron-start" size={13} /> חזרה לתיק מס
            </button>
          </div>
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
            client={client}
            onClientPersisted={(updated) => { setClient(updated); setDirty(false); }}
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
              ? (stepId, mode) => onOpenReleaseLetter(client.id, stepId, mode)
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
            quotations={quotations ?? []}
            onOpenDocuments={(folderId) => {
              tabPickedByUser.current = true;
              setDocsFolderId(folderId ?? null);
              setTab('docs');
            }}
          />
        )}

        {tab === 'docs' && (
          <DocumentsTab
            client={client}
            allClients={clients}
            initialFolderId={docsFolderId}
            onDocChange={() => {
              // ריענון רשימת קטגוריות
              db.getDocsByClient(client.id).then(docs =>
                setDocCategories(new Set(docs.map(d => d.category)))
              ).catch(() => {});
            }}
          />
        )}

        {/* ‼ רק במסלול הישן (journeyUi כבוי). במוצר המאושר עבודת המשרד חיה
            במסך המשימות הגלובלי, והכרטיס מוביל לשם מסונן — לא מחזיק מנהל
            משימות שני משלו. */}
        {!journeyUi && tab === 'tasks' && (
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

      {/* ‼ "עדכון סטטוס מס" מתיק המס — נקודת כניסה שנייה ליכולת אחת.
          פותח את אותו AddRequestDialog של «הוסף בקשה» עם הסוג מסומן מראש,
          ולכן נוצרת אותה בקשה מאוחדת (create_onboarding_request) שמופיעה
          ללקוח בדף האישי. קודם כאן ישב SendIntakeModal ששלח מייל ישיר עם
          ‎?intake=TOKEN‎ — ערוץ תקשורת שני ללקוח שעקף את מודל הבקשות. */}
      {intakeModalOpen && client.id && (
        <AddRequestDialog
          clientId={client.id}
          steps={clientSteps}
          processPublished={!!activeEngagement?.processPublishedAt}
          prevAccountantEmail={client.prevAccountantEmail}
          presetType="intake_questionnaire"
          onClose={() => setIntakeModalOpen(false)}
          onCreated={() => { setIntakeModalOpen(false); refreshOnboarding?.(); }}
        />
      )}

      {confirmArchive && (
        <ConfirmDialog
          title={isArchived ? 'החזרה מארכיון' : 'העברה לארכיון'}
          message={isArchived
            ? <>להחזיר את ״{fullName}״ לרשימת הלקוחות?</>
            : <InfoLines items={[
                <>להעביר את ״{fullName}״ לארכיון?</>,
                'הכרטיס יוסתר מהרשימה',
                'שום נתון לא נמחק',
              ]} />}
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
