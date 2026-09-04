import { useState, useMemo, useEffect } from 'react';
import {
  Client,
  IncomeTaxType,
  NIType,
  RepresentationRequest,
  RepresentationStatus,
  REPRESENTATION_STATUS_LABELS,
  REPRESENTATION_STATUS_BADGE,
  Task,
  VATStatus,
  AuthorityRepresentations,
  RepAreaStatus,
  REP_AUTHORITY_ORDER,
  REP_AUTHORITY_SHORT,
  REP_AUTHORITY_LABELS,
  REP_AREA_STATUS_LABELS,
  REP_LEVEL_LABELS,
  LifecycleStage,
  LIFECYCLE_STAGE_LABELS,
} from '../types';
import { ShaamStatus } from '../types/clientWorkspace';
import type { Engagement, OnboardingStep } from '../types/onboarding';
import ClientsOnboardingSection from './ClientsOnboardingSection';
import type { Lead } from '../types/quotations';
import Icon from './ui/Icon';
import ClientDeleteDialog from './ClientDeleteDialog';
import { EmptyState } from './ui/States';
import { useEmployees } from '../hooks/useEmployees';
import {
  getClientOpenTasks,
  getUpcomingDebts,
  isWithholdingExpired,
} from '../utils/clientDerived';
import { representationState } from '../lib/clientState';

const IT_LABELS: Record<IncomeTaxType, string> = {
  employee: 'שכיר',
  selfEmployed: 'עצמאי',
  both: 'שכיר + עצמאי',
  rentalOnly: 'שכירות',
  other: 'אחר',
};

const IT_BADGE: Record<IncomeTaxType, string> = {
  employee: 'badge-blue',
  selfEmployed: 'badge-green',
  both: 'badge-purple',
  rentalOnly: 'badge-orange',
  other: 'badge-gray',
};

const NI_LABELS: Record<NIType, string> = {
  employee: 'שכיר',
  selfEmployed: 'עצמאי',
  nonQualifying: 'לא עונה',
  employeeAndSE: 'שכיר+עצמאי',
  passive: 'פסיבי',
  pensioner: 'פנסיונר',
};

const VAT_LABELS: Record<VATStatus, string> = {
  authorizedDealer: 'עוסק מורשה',
  exemptDealer: 'עוסק פטור',
  none: 'פטור',     // אם אין רישום מע"מ — מוצג כ"פטור" לפי הוראת המשתמש
};

const VAT_BADGE: Record<VATStatus, string> = {
  authorizedDealer: 'badge-green',
  exemptDealer: 'badge-blue',
  none: 'badge-gray',
};

const NI_BADGE: Record<NIType, string> = {
  employee: 'badge-blue',
  selfEmployed: 'badge-green',
  employeeAndSE: 'badge-purple',
  nonQualifying: 'badge-gray',
  passive: 'badge-gray',
  pensioner: 'badge-orange',
};

// ── מחווני ייצוג לפי רשות ──
const REP_DOT: Record<RepAreaStatus, { dot: string; bg: string; fg: string }> = {
  active: { dot: 'var(--ok)', bg: 'var(--chip-green-bg)', fg: 'var(--ok)' },
  in_process: { dot: 'var(--warn)', bg: 'var(--chip-amber-bg)', fg: 'var(--chip-amber-tx)' },
  none: { dot: 'transparent', bg: 'var(--gray-50)', fg: 'var(--gray-500)' },
};

/** מצב ייצוג כולל נגזר מהמרשם לפי רשות: מיוצג רק אם כל הרשויות פעילות. */
function deriveOverallRep(reps?: AuthorityRepresentations): 'active' | 'in_process' | null {
  if (!reps) return null;
  const entries = Object.values(reps).filter(Boolean) as { status: RepAreaStatus }[];
  if (entries.length === 0) return null;
  return entries.every(e => e.status === 'active') ? 'active' : 'in_process';
}

// שלב הכרטיס כתווית קטנה. "לקוח פעיל" הוא המצב הצפוי ולכן חסר תווית —
// צבע וסימן רק כשהם אומרים משהו (§4.5).
const STAGE_BADGE: Partial<Record<LifecycleStage, string>> = {
  lead: 'badge-gray',
  quoted: 'badge-purple',
  onboarding: 'badge-blue',
  archived: 'badge-gray',
};

type SortField = 'name' | 'idNumber' | 'city' | 'phone' | 'email' | 'status' | 'assignee' | 'tasks';
type SortDir = 'asc' | 'desc';

interface Props {
  clients: Client[];
  requests: RepresentationRequest[];
  tasks: Task[];
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  /** העברה לארכיון — האלטרנטיבה שמוצעת ראשונה בדיאלוג המחיקה */
  onArchive?: (id: string) => Promise<void>;
  onLoadSamples: () => void;
  onAddRequest: () => void;
  onSelectRequest: (id: string) => void;
  /** מזהה הליד לפי מזהה הלקוח — לכרטיס שעדיין בשלב "ליד" */
  leadIdByClient?: Map<string, string>;
  /** פתיחת הליד במסך הלידים */
  onOpenLead?: (leadId: string) => void;
  /** דלוק ⇒ כל שורה פותחת את דף המסע, והלידים חיים כאן ולא במסך ההצעות. */
  journeyUi?: boolean;
  /** פאנל הלידים, מוזרק מהאב — כדי שהוא יחיה במסך הלקוחות ולא במסך ההצעות. */
  leadsPanel?: React.ReactNode;
  /**
   * דלוק ⇒ המשתמש ביקש "ליד חדש". ‼ הפאנל מוצג רק בלשונית הלידים, ולכן בלי
   * המעבר הזה הכפתור פותח טופס במקום שאינו על המסך — נראה כאילו לא קרה כלום.
   */
  newLeadRequested?: boolean;
  /** שלבי הקליטה של כל הלקוחות — לתצוגת המעקב "בקליטה". */
  onboardingSteps?: OnboardingStep[];
  engagements?: Engagement[];
  /** פתיחת כרטיס הלקוח ישר בלשונית הקליטה. */
  onOpenOnboarding?: (clientId: string) => void;
  /** ליד שטרם קיבל הצעה — אין לו כרטיס, ולכן הוא מוצג מכאן בטאב הלידים. */
  leads?: Lead[];
  onNewLead?: () => void;
  onNewQuotation?: () => void;
}

const STATUS_ORDER: Record<RepresentationStatus, number> = {
  awaiting_accountant: 0,
  awaiting_stamp: 1,
  pending_fill: 2,
  pending_signature: 3,
  awaiting_authorities: 4,
  active: 5,
};

export default function ClientList({
  clients,
  requests,
  tasks,
  onSelect,
  onAdd,
  onDelete,
  onArchive,
  onLoadSamples,
  onAddRequest,
  onSelectRequest,
  leadIdByClient,
  onOpenLead,
  journeyUi,
  leadsPanel, newLeadRequested,
  onboardingSteps,
  engagements,
  onOpenOnboarding,
  leads,
  onNewLead,
  onNewQuotation,
}: Props) {
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Client | null>(null);
  const [sortField, setSortField] = useState<SortField>('status');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // ── פילטרים מורחבים ──
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [vatFilter, setVatFilter] = useState<'all' | VATStatus>('all');
  const [itFilter, setItFilter] = useState<'all' | IncomeTaxType>('all');
  const [niFilter, setNiFilter] = useState<'all' | NIType>('all');
  const [shaamFilter, setShaamFilter] = useState<'all' | ShaamStatus>('all');
  // ‼ הטאב הוא הסינון. 'default' = רשימת העבודה: כל מי שאינו ליד ואינו בארכיון.
  // הבחירה נזכרת כדי שהמסך לא יתאפס בכל כניסה.
  /* ‼ 'onboarding' אינו לשונית עוד — הקליטה חיה במקטע העליון בלבד. ערך שמור
     מהגרסה הקודמת נופל חזרה ל"הכל", אחרת המסך היה נפתח על לשונית שאינה
     קיימת ומציג רשימה ריקה. */
  const [stageFilter, setStageFilter] = useState<'default' | LifecycleStage>(() => {
    const saved = localStorage.getItem('crm_clients_tab');
    return saved === 'quoted' || saved === 'active' || saved === 'lead' ? saved : 'default';
  });
  function switchTab(next: 'default' | LifecycleStage) {
    setStageFilter(next);
    localStorage.setItem('crm_clients_tab', next);
  }
  useEffect(() => {
    if (newLeadRequested && journeyUi) switchTab('lead');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newLeadRequested, journeyUi]);
  const [openRowMenu, setOpenRowMenu] = useState<string | null>(null);
  const [openTasksOnly, setOpenTasksOnly] = useState(false);

  // לחיצה מחוץ לתפריט השורה סוגרת אותו — אחרת הוא נשאר פתוח על שורה
  // אחת בזמן שקוראים שורה אחרת.
  useEffect(() => {
    if (!openRowMenu) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest('.cl-row-menu-wrap')) setOpenRowMenu(null);
    }
    const id = setTimeout(() => document.addEventListener('click', onDocClick), 0);
    return () => { clearTimeout(id); document.removeEventListener('click', onDocClick); };
  }, [openRowMenu]);
  const [upcomingDebtsOnly, setUpcomingDebtsOnly] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { employees, findEmployee } = useEmployees();

  const getStatus = (c: Client): RepresentationStatus => c.representationStatus ?? 'active';
  const getStage = (c: Client): LifecycleStage => c.lifecycleStage ?? 'active';

  /* ‼ ציר אחד לכל הלשוניות הראשיות: שלב החיים שעל הכרטיס, ותו לא.
     קודם "בקליטה" נספר לפי שלבים פתוחים בפועל — ציר אחר לגמרי — ולכן אותו
     אדם נספר פעמיים (פעיל *וגם* בקליטה), והלשוניות לא חילקו את האוכלוסייה.
     הצורך התפעולי ("למי יש בקשה פתוחה") לא נעלם: הוא יושב בשורה נפרדת
     מתחת ללשוניות, ומסומן במפורש כתצוגה תפעולית ולא כשלב חיים. */
  const stageCounts = useMemo(() => {
    const m: Record<string, number> = { quoted: 0, onboarding: 0, active: 0, lead: 0, archived: 0 };
    for (const c of clients) {
      const st = c.lifecycleStage ?? 'active';
      if (st in m) m[st] += 1;
    }
    return m;
  }, [clients]);

  /* ‼ נספר לפי ההתקשרות — בדיוק כמו מקטע "לקוחות בתהליך" שמעל. שני מספרים
     שנספרים אחרת על אותו מסך הם שני מספרים שסותרים זה את זה. */
  const onboardingCount = useMemo(
    () => new Set((engagements ?? []).filter(e => e.status === 'onboarding').map(e => e.clientId)).size,
    [engagements]);

  // ‼ ליד שטרם קיבל הצעה אין לו כרטיס לקוח, ולכן הוא לא יופיע בטבלה. בלי
  // הרשימה הזו הוא היה נעלם מהמסך לגמרי כשהמשפך ירד.
  const cardlessLeads = useMemo(
    () => (leads ?? []).filter(l => !l.convertedClientId && l.status !== 'closed'),
    [leads]);

  /* חמש לשוניות שמחלקות את האוכלוסייה בלי חפיפה, ו"הכל" שסוכם אותן.
     ארכיון מופיע רק כשיש בו מישהו — לשונית ריקה קבועה היא רעש. */
  const totalPeople = clients.length + cardlessLeads.length;
  const TABS: { key: 'default' | LifecycleStage; label: string; count?: number }[] = [
    { key: 'lead', label: 'לידים', count: stageCounts.lead + cardlessLeads.length },
    { key: 'quoted', label: 'בהצעה', count: stageCounts.quoted },
    { key: 'active', label: 'לקוחות פעילים', count: stageCounts.active },
    ...(stageCounts.archived > 0
      ? [{ key: 'archived' as LifecycleStage, label: 'ארכיון', count: stageCounts.archived }]
      : []),
    { key: 'default', label: 'הכל', count: totalPeople },
  ];

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  // ── מטריקות לכל לקוח (לעמודות + פילטרים) ──
  const metricsByClient = useMemo(() => {
    const map = new Map<string, {
      openTasksCount: number;
      upcomingDebtsCount: number;
      withholdingExpired: boolean;
    }>();
    for (const c of clients) {
      map.set(c.id, {
        openTasksCount: getClientOpenTasks(c.id, tasks).length,
        upcomingDebtsCount: getUpcomingDebts(c.id, tasks).length,
        withholdingExpired: isWithholdingExpired(c).expired,
      });
    }
    return map;
  }, [clients, tasks]);

  // איש הקשר הראשי — אם תוסף מסומן ראשי משתמשים בו, אחרת הנישום עצמו.
  function getPrimaryContact(c: Client): { name: string; phone: string; email: string; isClient: boolean } {
    const primary = (c.additionalContacts ?? []).find(ac => ac.isPrimary);
    if (primary) {
      return {
        name: primary.name,
        phone: primary.phone || '',
        email: primary.email || '',
        isClient: false,
      };
    }
    return {
      name: `${c.firstName} ${c.lastName}`.trim(),
      phone: c.phone || '',
      email: c.email || '',
      isClient: true,
    };
  }

  const filtered = useMemo(() => {
    let list = clients.filter(c => {
      if (employeeFilter !== 'all' && c.assignedAccountantId !== employeeFilter) return false;
      if (vatFilter !== 'all' && c.vatStatus !== vatFilter) return false;
      if (itFilter !== 'all' && c.incomeTaxType !== itFilter) return false;
      if (niFilter !== 'all' && c.niType !== niFilter) return false;
      if (shaamFilter !== 'all' && (c.shaamStatus ?? 'unknown') !== shaamFilter) return false;

      const m = metricsByClient.get(c.id);
      if (openTasksOnly && (!m || m.openTasksCount === 0)) return false;
      if (upcomingDebtsOnly && (!m || m.upcomingDebtsCount === 0)) return false;

      const q = search.toLowerCase().trim();
      const stage = getStage(c);

      if (stageFilter === 'default') {
        /* ‼ "הכל" פירושו כל האנשים במערכת — כולל לידים וארכיון. עד כה הוא
           החריג את שניהם, ולכן הראה 11 בזמן שבמערכת 13 אנשים והלשוניות
           סיכמו למספר אחר. לשונית ששמה "הכל" ומראה חלק היא לשונית ששקרה. */
      } else if (stage !== stageFilter) {
        return false;
      }

      if (!q) return true;
      const pc = getPrimaryContact(c);
      return (
        c.firstName.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q) ||
        c.idNumber.includes(q) ||
        (c.phone || '').includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.city || '').toLowerCase().includes(q) ||
        pc.phone.includes(q) ||
        pc.email.toLowerCase().includes(q) ||
        pc.name.toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      let cmp = 0;
      const ma = metricsByClient.get(a.id);
      const mb = metricsByClient.get(b.id);
      switch (sortField) {
        case 'name':
          cmp = `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'he');
          break;
        case 'idNumber':
          cmp = a.idNumber.localeCompare(b.idNumber);
          break;
        case 'city':
          cmp = (a.city || '').localeCompare(b.city || '', 'he');
          break;
        case 'phone':
          cmp = getPrimaryContact(a).phone.localeCompare(getPrimaryContact(b).phone);
          break;
        case 'email':
          cmp = getPrimaryContact(a).email.localeCompare(getPrimaryContact(b).email);
          break;
        case 'status':
          cmp = STATUS_ORDER[getStatus(a)] - STATUS_ORDER[getStatus(b)];
          break;
        case 'assignee':
          cmp = (findEmployee(a.assignedAccountantId)?.name || '').localeCompare(
            findEmployee(b.assignedAccountantId)?.name || '', 'he');
          break;
        case 'tasks':
          cmp = (ma?.openTasksCount ?? 0) - (mb?.openTasksCount ?? 0);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [
    clients, search, sortField, sortDir,
    employeeFilter, vatFilter, itFilter, niFilter, shaamFilter, stageFilter,
    openTasksOnly, upcomingDebtsOnly, metricsByClient,
  ]);

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return <span className="sort-icon inactive">⇅</span>;
    return <span className="sort-icon active">{sortDir === 'asc' ? '▲' : '▼'}</span>;
  };

  /* ‼ הטבלה מציגה את כל מי שהלשונית מכילה, ולא רק "מיוצג פעיל".
     הפיצול הקודם הוא שיצר את הסתירה: הכרטיס שמעל הציג לקוחות בתהליך,
     והטבלה מתחתיו הכריזה "אין עדיין לקוחות ברשימה" — כי היא סיננה החוצה
     בדיוק את אותם אנשים. שתי רשימות באותו מסך על שתי אוכלוסיות שונות. */
  const activeList = filtered;

  function handleRowClick(c: Client) {
    // ‼ כניסה אחת: לחיצה על אדם פותחת את המסע שלו, בכל שלב חיים. עד כה
    // אותה לחיצה נחתה בשלושה מקומות שונים — מסך הלידים, מרכז הייצוג או
    // הכרטיס — וגיא היה צריך לזכור לאן כל לקוח לוקח אותו. שני היעדים
    // האחרים נגישים מתוך המסע בלחיצה אחת.
    if (journeyUi) { onSelect(c.id); return; }

    // כרטיס שעדיין ליד — מקומו במסך הלידים, שם יושבת כל השיחה איתו
    if (getStage(c) === 'lead' && onOpenLead) {
      const leadId = leadIdByClient?.get(c.id);
      if (leadId) { onOpenLead(leadId); return; }
    }
    // ‼ 'in_process' ולא `status !== 'active'`: לקוח שמעולם לא נפתח לו ייצוג
    // נפל קודם ל-'active' כברירת מחדל, וזה טשטש בין "מיוצג" ל"אין ייצוג".
    if (representationState(c) === 'in_process' && c.representationRequestId) {
      onSelectRequest(c.representationRequestId);
    } else {
      onSelect(c.id);
    }
  }

  const requestById = useMemo(() => new Map(requests.map(r => [r.id, r])), [requests]);

  const activeAdvancedCount =
    (employeeFilter !== 'all' ? 1 : 0) +
    (vatFilter !== 'all' ? 1 : 0) +
    (itFilter !== 'all' ? 1 : 0) +
    (niFilter !== 'all' ? 1 : 0) +
    (shaamFilter !== 'all' ? 1 : 0) +
    /* ‼ בחירת לשונית אינה "פילטר מתקדם" — היא הניווט הראשי של המסך.
       ספירתה כאן צבעה את הכפתור והציגה "(1)" בכל לשונית שאינה "הכל". */
    (openTasksOnly ? 1 : 0) +
    (upcomingDebtsOnly ? 1 : 0);

  /* האם המסך מצומצם כרגע — חיפוש, פילטר מתקדם, או לשונית שאינה "הכל".
     קובע אם הריקנות היא "אין תוצאות" (עם דרך חזרה) או "אין כאן אף אחד". */
  const isNarrowed = search.trim() !== '' || activeAdvancedCount > 0 || stageFilter !== 'default';

  function clearAdvanced() {
    setEmployeeFilter('all');
    setVatFilter('all');
    setItFilter('all');
    setNiFilter('all');
    setShaamFilter('all');
    setStageFilter('default');
    setOpenTasksOnly(false);
    setUpcomingDebtsOnly(false);
  }

  return (
    <div className="client-list-page">
      {/* ראש עמוד אחד בשפה אחת — אותה כותרת של המשימות, המסמכים והתיק,
          ובראש המסך ולא באמצעו. המשפט מתחת הוא מה שהמסך מבטיח. */}
      <div className="pg-head">
        <div className="pg-head-main">
          <div className="pg-title">לקוחות</div>
          {/* ‼ משפט המצב הוא היחיד שמדווח מספרים בראש המסך. מקטע הקליטה
              נושא את המונה שלו בכותרת שלו, ואין רצועת מחוונים. */}
          <div className="pg-status">{`${filtered.length} אנשים · אדם אחד לכל אורך המסע`}</div>
        </div>
        <div className="pg-actions">
          {/* טעינת דוגמאות היא כלי פיתוח ולא פעולה של רואה חשבון —
              מוצגת רק כשאין לקוחות בכלל, וכקישור שקט */}
          {clients.length === 0 && (
            <button className="ui-linkbtn" onClick={onLoadSamples}>טען לקוחות לדוגמה</button>
          )}
          {/* ‼ הכניסה למשפך היא גם הכניסה ליצירה: ליד והצעה נפתחים מכאן ולא
              ממסך אחר, אחרת הריכוז נשבר במקום הראשון שבו הוא נדרש. */}
          {onNewLead && <button className="btn btn-secondary" onClick={onNewLead}>+ ליד</button>}
          {onNewQuotation && <button className="btn btn-secondary" onClick={onNewQuotation}>+ הצעה</button>}
          <button className="btn btn-secondary" onClick={onAddRequest}>בקשת ייצוג</button>
          <button className="btn btn-primary" onClick={onAdd}>+ לקוח חדש</button>
        </div>
      </div>

      {/* ── לקוחות בתהליך ──────────────────────────────────────────────────
          התצוגה התפעולית היחידה לקליטה. יושבת מעל הלשוניות ולא בתוכן, כי
          היא אינה שלב חיים אלא העבודה של הבוקר. הלשוניות שמתחת שייכות
          לטבלה. ראה docs/DECISIONS-CLIENTS-ONBOARDING-SECTION.md. */}
      {onboardingSteps && engagements && onOpenOnboarding && (
        <ClientsOnboardingSection
          clients={clients}
          steps={onboardingSteps}
          engagements={engagements}
          onOpen={onOpenOnboarding}
        />
      )}

      <div className="cl-list-header">
        <div style={{ display: 'flex', gap: '.15rem', flexWrap: 'wrap' }}>
          {TABS.map(t => {
            const on = stageFilter === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => switchTab(t.key)}
                aria-pressed={on}
                /* ‼ cl-stage-tab ולא רק inline: זו לשונית הניווט הראשית של
                   המסך, והיא צריכה שטח נגיעה הגון בטלפון (ראה index.css). */
                className="cl-stage-tab"
                style={{
                  padding: '.45rem .7rem', border: 'none', background: 'transparent',
                  borderBottom: `2px solid ${on ? 'var(--accent)' : 'transparent'}`,
                  color: on ? 'var(--ink-1)' : 'var(--ink-3)',
                  fontWeight: on ? 600 : 500, fontSize: 'var(--fs-14)',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {t.label}{t.count !== undefined ? ` · ${t.count}` : ''}
              </button>
            );
          })}
        </div>
      </div>

      {(<>
      {/* Search + advanced toggle */}
      <div className="cl-search-row">
        <div className="search-input-wrap" style={{ flex: 1 }}>
          <span className="search-icon"><Icon name="search" size={14} /></span>
          <input
            type="text"
            placeholder="חיפוש לפי שם, ת.ז., עיר, טלפון, אימייל..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {/* ‼ הכפתור "בקליטה (N)" ירד: הוא שכפל את הלשונית שלידו והציג אותו
            מספר בשני מקומות. המבט התפעולי עצמו לא נעלם — הוא יושב מתחת
            ללשוניות, מסומן במפורש כתצוגה תפעולית ולא כשלב חיים. */}
        <button
          className={`btn ${showAdvanced || activeAdvancedCount > 0 ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setShowAdvanced(s => !s)}
        >
          פילטרים מתקדמים{activeAdvancedCount > 0 ? ` (${activeAdvancedCount})` : ''}
        </button>
        {activeAdvancedCount > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={clearAdvanced}>נקה</button>
        )}
      </div>

      {showAdvanced && (
        <div className="cl-advanced">
          <div className="cl-adv-row">
            <label>שלב
              <select value={stageFilter} onChange={e => setStageFilter(e.target.value as 'default' | LifecycleStage)}>
                <option value="default">ללא לידים וארכיון</option>
                <option value="lead">{LIFECYCLE_STAGE_LABELS.lead}</option>
                <option value="quoted">{LIFECYCLE_STAGE_LABELS.quoted}</option>
                <option value="onboarding">{LIFECYCLE_STAGE_LABELS.onboarding}</option>
                <option value="active">{LIFECYCLE_STAGE_LABELS.active}</option>
                <option value="archived">{LIFECYCLE_STAGE_LABELS.archived}</option>
              </select>
            </label>
            <label>עובד מטפל
              <select value={employeeFilter} onChange={e => setEmployeeFilter(e.target.value)}>
                <option value="all">הכל</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
            <label>מע״מ
              <select value={vatFilter} onChange={e => setVatFilter(e.target.value as 'all' | VATStatus)}>
                <option value="all">הכל</option>
                <option value="authorizedDealer">עוסק מורשה</option>
                <option value="exemptDealer">עוסק פטור</option>
                <option value="none">אין</option>
              </select>
            </label>
            <label>מס הכנסה
              <select value={itFilter} onChange={e => setItFilter(e.target.value as 'all' | IncomeTaxType)}>
                <option value="all">הכל</option>
                <option value="employee">שכיר</option>
                <option value="selfEmployed">עצמאי</option>
                <option value="both">שכיר + עצמאי</option>
                <option value="rentalOnly">שכירות</option>
                <option value="other">אחר</option>
              </select>
            </label>
            <label>ביטוח לאומי
              <select value={niFilter} onChange={e => setNiFilter(e.target.value as 'all' | NIType)}>
                <option value="all">הכל</option>
                <option value="employee">שכיר</option>
                <option value="selfEmployed">עצמאי</option>
                <option value="employeeAndSE">שכיר+עצמאי</option>
                <option value="nonQualifying">לא עונה להגדרה</option>
                <option value="passive">פסיבי</option>
                <option value="pensioner">פנסיונר</option>
              </select>
            </label>
            <label>הרשאת שע״ם
              <select value={shaamFilter} onChange={e => setShaamFilter(e.target.value as 'all' | ShaamStatus)}>
                <option value="all">הכל</option>
                <option value="active">פעילה</option>
                <option value="inactive">לא פעילה</option>
                <option value="pending">בטיפול</option>
                <option value="unknown">לא ידוע</option>
              </select>
            </label>
          </div>
          <div className="cl-adv-toggles">
            <label className="checkbox-row">
              <input type="checkbox" checked={openTasksOnly} onChange={e => setOpenTasksOnly(e.target.checked)} />
              משימות פתוחות
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={upcomingDebtsOnly} onChange={e => setUpcomingDebtsOnly(e.target.checked)} />
              חובות קרובים (21 יום)
            </label>
          </div>
        </div>
      )}

      {clients.length === 0 ? (
        <EmptyState
          headline="עוד אין לקוחות"
          sentence="לקוח חדש נפתח עם חמישה פרטים בלבד - את שאר התיק משלימים אחר כך."
          action={{ label: '+ לקוח חדש', onClick: onAdd }}
          quietLink={{ label: 'טען לקוחות לדוגמה', onClick: onLoadSamples }}
        />
      ) : (
        <>
          {/* ‼ הלידים חיים כאן, במסך הלקוחות — הם שלב במסע ולא עולם נפרד.
              הפאנל עצמו מוזרק מהאב כדי לא לשכפל את לוגיקת העריכה שלו. */}
          {journeyUi && stageFilter === 'lead' && leadsPanel}

          {/* ליד שאין לו עדיין כרטיס לקוח — מוצג רק בטאב שלו, ומוביל לעריכה. */}
          {!journeyUi && stageFilter === 'lead' && cardlessLeads.length > 0 && (
            <div className="card" style={{ padding: '.5rem .7rem', marginBottom: '.6rem', display: 'grid', gap: '.3rem' }}>
              <span style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)' }}>
                לידים שטרם נשלחה להם הצעה · {cardlessLeads.length}
              </span>
              {cardlessLeads.map(l => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => onOpenLead?.(l.id)}
                  style={{
                    display: 'flex', gap: '.5rem', alignItems: 'baseline', textAlign: 'start',
                    border: 'none', background: 'transparent', cursor: 'pointer', padding: '.2rem 0',
                  }}
                >
                  <strong style={{ fontSize: 'var(--fs-14)' }}>{l.fullName}</strong>
                  <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
                    {[l.businessName, l.phone].filter(Boolean).join(' · ')}
                  </span>
                </button>
              ))}
            </div>
          )}


          {/* ‼ הודעת הריקנות מדברת בשם הטבלה שמתחתיה בלבד. הנוסח הקודם
              ("אין עדיין לקוחות ברשימה") הופיע גם כשלקוחות בתהליך היו גלויים
              מעליה — כי הטבלה סיננה החוצה בדיוק אותם. מסך שסותר את עצמו. */}
          {activeList.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">
                {isNarrowed ? 'אין תוצאות לסינון הזה' : 'אין כאן אף אחד'}
              </div>
              <div className="empty-state-desc">
                {isNarrowed
                  ? 'אפשר לנקות את הסינון ולראות את כולם.'
                  : onboardingCount > 0
                    ? `${onboardingCount} בתהליך קליטה - הם מופיעים במקטע שלמעלה.`
                    : 'אדם שנשלחה לו הצעה מופיע כאן עם התווית "בהצעה".'}
              </div>
              {isNarrowed && (
                <button
                  className="ui-linkbtn"
                  onClick={() => { setSearch(''); clearAdvanced(); }}
                >נקה סינון</button>
              )}
            </div>
          ) : (
          <div className="card" style={{ overflow: 'hidden' }}>
          <div className="table-wrap">
            <table className="client-table client-table-dense">
              <thead>
                <tr>
                  <th className="th-sortable" onClick={() => toggleSort('name')}>
                    <span>שם</span> {sortIcon('name')}
                  </th>
                  <th className="th-sortable col-id" onClick={() => toggleSort('idNumber')}>
                    <span>ת.ז.</span> {sortIcon('idNumber')}
                  </th>
                  <th className="th-sortable hide-mobile" onClick={() => toggleSort('city')}>
                    <span>עיר</span> {sortIcon('city')}
                  </th>
                  <th className="th-sortable hide-mobile" onClick={() => toggleSort('phone')}>
                    <span>טלפון</span> {sortIcon('phone')}
                  </th>
                  <th className="th-sortable hide-mobile col-email" onClick={() => toggleSort('email')}>
                    <span>אימייל</span> {sortIcon('email')}
                  </th>
                  <th className="hide-mobile">
                    <span>מ״ה · ב״ל · מע״מ</span>
                  </th>
                  <th className="th-sortable hide-mobile col-owner" onClick={() => toggleSort('assignee')}>
                    <span>מטפל</span> {sortIcon('assignee')}
                  </th>
                  <th className="th-sortable" onClick={() => toggleSort('tasks')} style={{ width: 80 }}>
                    <span>משימות</span> {sortIcon('tasks')}
                  </th>
                  <th className="hide-mobile col-shaam" style={{ width: 60 }}>שע״ם</th>
                  <th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {activeList.map(client => {
                  const status = getStatus(client);
                  const lifeStage = getStage(client);
                  const fullName = `${client.firstName} ${client.lastName}`.trim() || '(ללא שם)';
                  const m = metricsByClient.get(client.id);
                  const employee = findEmployee(client.assignedAccountantId);
                  const repBadgeForNonActive = representationState(client) === 'in_process';
                  const overallRep = deriveOverallRep(client.authorityRepresentations ?? undefined);
                  const linkedReq = client.representationRequestId ? requestById.get(client.representationRequestId) : undefined;
                  const idSubmitted = linkedReq?.onboardingStatus === 'submitted' && status !== 'active';
                  const pc = getPrimaryContact(client);
                  // אם הראשי הוא לא הנישום, נציג שם של הראשי כדי שגיא יבין את מי הוא רואה
                  const primaryNote = !pc.isClient ? pc.name : '';

                  return (
                    <tr key={client.id} className={`client-row ${getStage(client) === 'archived' ? 'is-archived' : ''}`} onClick={() => handleRowClick(client)}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                          <div className="client-avatar-sm">
                            {`${(client.firstName || '').charAt(0) || '?'}${(client.lastName || '').charAt(0) || ''}`}
                          </div>
                          <div>
                            <div className="client-table-name">{fullName}</div>
                            <div className="client-table-badges">
                              {overallRep === 'in_process' && (
                                <span className="badge badge-orange" style={{ fontSize: '12px', padding: '.05rem .35rem' }}>טרם מיוצג</span>
                              )}
                              {overallRep === 'active' && (
                                <span className="badge badge-green" style={{ fontSize: '12px', padding: '.05rem .35rem' }}>מיוצג</span>
                              )}
                              {overallRep === null && repBadgeForNonActive && (
                                <span className={`badge ${REPRESENTATION_STATUS_BADGE[status]}`} style={{ fontSize: '12px', padding: '.05rem .35rem' }}>
                                  {REPRESENTATION_STATUS_LABELS[status]}
                                </span>
                              )}
                              {/* שלב הכרטיס. "לקוח פעיל" הוא המצב הצפוי ואינו מסומן;
                                  ליד וארכיון מגיעים לכאן רק דרך חיפוש מפורש, והתווית
                                  מסבירה מיד למה השורה נראית אחרת. */}
                              {STAGE_BADGE[lifeStage] && (
                                <span className={`badge ${STAGE_BADGE[lifeStage]} cl-mini-badge`}>
                                  {LIFECYCLE_STAGE_LABELS[lifeStage]}
                                </span>
                              )}
                              {idSubmitted && (
                                <span className="badge badge-green cl-mini-badge" title="הלקוח השלים את פרטי ההזדהות">פרטי זיהוי התקבלו</span>
                              )}
                              {client.qualifyingSettlementId && <span className="badge badge-purple cl-mini-badge">ישוב מזכה</span>}
                              {client.disabilityPercentage > 0 && <span className="badge badge-orange cl-mini-badge">נכות {client.disabilityPercentage}%</span>}
                              {client.isNewImmigrant && <span className="badge badge-blue cl-mini-badge">עולה</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="mono-text col-id">{client.idNumber || '-'}</td>
                      <td className="hide-mobile">{client.city || '-'}</td>
                      <td className="mono-text hide-mobile" dir="ltr" style={{ textAlign: 'right' }}>
                        {pc.phone ? (
                          <span title={primaryNote ? `איש קשר ראשי: ${primaryNote}` : ''}>
                            {pc.phone}
                            {primaryNote && <span className="cl-primary-mark">· {primaryNote}</span>}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="mono-text hide-mobile col-email" dir="ltr" style={{ textAlign: 'right' }}>
                        {pc.email ? (
                          <span title={primaryNote ? `איש קשר ראשי: ${primaryNote}` : ''}>{pc.email}</span>
                        ) : '-'}
                      </td>
                      <td className="hide-mobile">
                        {/* התוויות "מ״ה: · ב״ל: · מע״מ:" חזרו בכל שורה — 21 פעמים
                            על מסך של שבעה לקוחות. הן עברו לכותרת העמודה, וסדר
                            הערכים הוא שנושא את המשמעות. */}
                        <div className="cl-tax-chips" style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                          <span className={`badge ${IT_BADGE[client.incomeTaxType]} cl-mini-badge`}>{IT_LABELS[client.incomeTaxType]}</span>
                          <span className="cl-tax-sep">·</span>
                          <span className={`badge ${NI_BADGE[client.niType]} cl-mini-badge`}>{NI_LABELS[client.niType]}</span>
                          <span className="cl-tax-sep">·</span>
                          <span className={`badge ${VAT_BADGE[client.vatStatus]} cl-mini-badge`}>{VAT_LABELS[client.vatStatus]}</span>
                        </div>
                        {client.authorityRepresentations && Object.keys(client.authorityRepresentations).length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                            <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>ייצוג</span>
                            {REP_AUTHORITY_ORDER.map(a => {
                              const rep = client.authorityRepresentations?.[a];
                              const st: RepAreaStatus = rep?.status ?? 'none';
                              const c = REP_DOT[st];
                              const title = `${REP_AUTHORITY_LABELS[a]}: ${REP_AREA_STATUS_LABELS[st]}${rep?.level ? ` (${REP_LEVEL_LABELS[rep.level]})` : ''}`;
                              return (
                                <span
                                  key={a}
                                  title={title}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '12px', padding: '1px 6px', borderRadius: 20, background: c.bg, color: c.fg }}
                                >
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: st === 'none' ? 'transparent' : c.dot, border: st === 'none' ? '1.5px solid #B4B2A9' : 'none' }} />
                                  {REP_AUTHORITY_SHORT[a]}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="hide-mobile col-owner">
                        {employee ? (
                          <div className="cl-emp-chip" title={employee.role}>
                            <span className="cl-emp-dot" style={{ background: employee.color }}>{employee.initials}</span>
                            <span style={{ fontSize: '12px' }}>{employee.name}</span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--gray-400)', fontSize: '12px' }}>לא הוקצה</span>
                        )}
                      </td>
                      <td>
                        {m && m.openTasksCount > 0 ? (
                          <div className="cl-metric-cell">
                            <span className={`cl-metric-num ${m.upcomingDebtsCount > 0 ? 'warn' : ''}`}>{m.openTasksCount}</span>
                            {m.upcomingDebtsCount > 0 && <span className="cl-metric-tag">{m.upcomingDebtsCount}</span>}
                          </div>
                        ) : <span className="cl-metric-zero">-</span>}
                      </td>
                      <td className="hide-mobile col-shaam" style={{ textAlign: 'center' }}>
                        {/* רק חריגה מסומנת. "פעיל" הוא המצב הצפוי ולא צריך סימן (§4.5) */}
                        {/* ‼ הטקסט נושא את הנושא שלו. "לא פעיל" בעמודה צרה נקרא כשלב חיים של
                            האדם, בזמן שהוא מדבר על הרשאת שע"ם בלבד. */}
                        {client.shaamStatus === 'inactive' && <span className="cl-flag">שע״ם לא פעיל</span>}
                        {client.shaamStatus === 'pending' && <span className="cl-flag cl-flag-warn">שע״ם בטיפול</span>}
                      </td>
                      {/* ‼ פעולה ראשית אחת בשורה — הפתיחה — וכל השאר מתחת ל-⋯.
                          עד כה ישבה כאן רק מחיקה: הפעולה ההרסנית הייתה היחידה
                          שאפשר היה להגיע אליה מהשורה, וכל השאר דרשו כניסה לכרטיס. */}
                      <td onClick={e => e.stopPropagation()}>
                        <div className="cl-row-menu-wrap">
                          <button
                            className="ui-icon-btn row-menu-btn ui-hover-actions"
                            onClick={() => setOpenRowMenu(openRowMenu === client.id ? null : client.id)}
                            title="פעולות נוספות"
                            aria-label={`פעולות עבור ${fullName}`}
                            aria-expanded={openRowMenu === client.id}
                          >⋯</button>

                          {openRowMenu === client.id && (
                            <div className="row-menu" onClick={e => e.stopPropagation()}>
                              <button className="pill-menu-item" onClick={() => { setOpenRowMenu(null); onSelect(client.id); }}>
                                פתח את המסע
                              </button>
                              {leadIdByClient?.get(client.id) && onOpenLead && (
                                <button className="pill-menu-item" onClick={() => { setOpenRowMenu(null); onOpenLead(leadIdByClient.get(client.id)!); }}>
                                  פתח את פרטי הליד
                                </button>
                              )}
                              {client.representationRequestId && (
                                <button className="pill-menu-item" onClick={() => { setOpenRowMenu(null); onSelectRequest(client.representationRequestId!); }}>
                                  מרכז הייצוג
                                </button>
                              )}
                              <span className="row-menu-sep" aria-hidden="true" />
                              {onArchive && getStage(client) !== 'archived' && (
                                <button className="pill-menu-item" onClick={async () => { setOpenRowMenu(null); await onArchive(client.id); }}>
                                  העבר לארכיון
                                </button>
                              )}
                              <button
                                className="pill-menu-item row-menu-danger"
                                onClick={() => { setOpenRowMenu(null); setPendingDelete(client); }}
                              >
                                מחיקת כרטיס
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </div>
          )}
        </>
      )}
      </>)}

      {pendingDelete && (
        <ClientDeleteDialog
          client={pendingDelete}
          tasks={tasks}
          onArchive={onArchive && getStage(pendingDelete) !== 'archived'
            ? async () => { await onArchive(pendingDelete.id); setPendingDelete(null); }
            : undefined}
          onDelete={() => { onDelete(pendingDelete.id); setPendingDelete(null); }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
