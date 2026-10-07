// ─── מסך הלקוחות — ספריית אנשים ─────────────────────────────────────────────
// V3.3, המקור החזותי המחייב: docs/prototypes/customers-v3-production-reference.html
// שני תפקידים בלבד: למצוא אדם קיים מהר, ולהתחיל לעבוד עם אדם חדש.
// בלי לשוניות שלב, בלי מסנני-על, בלי לוחות מחוונים — חיפוש ורשימה.
//
// לחיצה על שורה פותחת תצוגה מהירה (מגירה בדסקטופ, מסך מלא במובייל) —
// לא את התיק המלא. הכתובת ‎#/clients/p/{id}‎ נושאת את המצב, ולכן "אחורה"
// סוגר את התצוגה — קריטי במובייל.
//
// המסך הישן (ClientList) חי מאחורי הדגל settings.flags.personDirectory=false
// כמנגנון חירום, בדיוק כמו journeyUi. יוסר בשלב הניקוי.
//
// (226) לשונית שנייה, «אנשי קשר» — מי שאינו לקוח ואינו ליד (רו״ח אחר, עו״ד…). לא לשונית
// שלב: ישות אחרת, בהחלטת גיא (07.10.2026). החיפוש אחד לשתי הלשוניות.

import { useEffect, useMemo, useState } from 'react';
import type { Client, Task, NiTracking } from '../types';
import type { RepSendPhase } from '../utils/representationAction';
import type { Lead, Quotation } from '../types/quotations';
import type { OnboardingStep } from '../types/onboarding';
import type { AdditionalCharge } from '../types/charges';
import { buildPersonRows, searchPersonRows, type PersonRow } from '../utils/personDirectory';
import { nextActionForClient, clientStepsOf } from '../utils/nextActionForClient';
import { nextStepForClient, nextActionText } from '../utils/onboardingNext';
import { isStepOpen } from '../types/onboarding';
import { getClientOpenTasks } from '../utils/clientDerived';
import type { NextActionButton } from '../utils/journeyPresentation';
import Sheet from './ui/Sheet';
import PersonQuickView, { type QuickViewAction } from './PersonQuickView';
import AddChargeDialog from './AddChargeDialog';
import { useRecentDocuments } from '../hooks/useRecentDocuments';
import { useToast } from './ui/Toast';
import { isUnknownSendReply, sendErrorView } from '../types/emailActivity';
import ContactsPanel from '../features/contacts/ContactsPanel';
import { NEW_CONTACT_ID } from '../features/contacts/contactModel';
import type { ContactsApi } from '../features/contacts/useContacts';
import type { Meeting } from '../features/meetings/meetingModel';
import type { SplitCompanionResult } from '../lib/leadLink';
import { COMPANION_RELATION_LABELS } from '../../supabase/functions/_shared/meetingCore';

interface Props {
  clients: Client[];
  leads: Lead[];
  tasks: Task[];
  quotations: Quotation[];
  onboardingSteps: OnboardingStep[];
  /** מזהה האדם שהתצוגה המהירה שלו פתוחה — מגיע מהכתובת, לא ממצב מקומי. */
  quickViewId: string | null;
  onQuickView: (id: string | null) => void;
  onAdd: () => void;
  onOpenFullCase: (clientId: string) => void;
  /** "בקשת חומרים" — פותח את התיק המלא על לשונית המסע, שם יושב "+ בקשה". */
  onRequestMaterials: (clientId: string) => void;
  onOpenQuotation: (quotationId: string) => void;
  onNewQuotation: () => void;
  onNewQuotationForLead: (lead: Lead) => void;
  onOpenLead: (leadId: string) => void;
  onOpenRequest: (requestId: string) => void;
  onOpenTask: (taskId: string) => void;
  onOpenRepresentation: (clientId: string) => void;
  /** פותח RepresentationOnboardingDialog עבור כרטיס שעדיין אין לו שום
   *  בקשת ייצוג (156). נפרד מ-onOpenRepresentation, שרק מנווט לבקשה קיימת. */
  onStartRepresentation: (clientId: string) => void;
  /**
   * ‼ ההקשר של הכרטיס ל«מה קורה עכשיו»: ב"ל לפי אדם ומייל חתימה שטרם יצא.
   * בלעדיו התצוגה המהירה סתרה את לשונית «בקשות» (ב"ל שממתין למבוטח — «לטיפולך»).
   */
  repContextOf?: (clientId: string) => { niExecution?: { client?: NiTracking; spouse?: NiTracking }; repSendPhase?: RepSendPhase | null };
  /** שלב 4: "המשך טיפול" בליד שהגיע מקישור המילוי הציבורי — פותח את בורר המסלול. */
  onContinueLead: (lead: Lead) => void;
  /** מחיקת ליד שטרם הפך ללקוח. אין השפעה על כרטיס לקוח קיים. */
  onDeleteLead: (lead: Lead) => Promise<void>;
  /** חיובים חד-פעמיים — כל הרשומות, מכל הלקוחות (מקובצות פנימית לפי clientId). כולל חיובים שמקורם הצעת מחיר מאושרת. */
  charges: AdditionalCharge[];
  onAddCharge: (clientId: string, description: string, amount: number, dueDate: string) => Promise<void>;
  /** "שלח דרישת תשלום" — שולח מייל אמיתי ומסמן שהבקשה יצאה. */
  onRequestChargePayment: (charge: AdditionalCharge) => Promise<void>;
  /** "סמן כשולם" — סימון ידני בלבד. */
  onMarkChargePaid: (charge: AdditionalCharge) => Promise<void>;
  /** הפגישה הקרובה לכל לקוח/ליד — רמז בקצה השורה (features/meetings). */
  meetingCues?: Map<string, string>;
  /** «אנשי קשר» (226). בלי — אין לשונית. */
  contactsApi?: ContactsApi;
  /** (228) איש קשר עבר ללידים — לרענן את הלידים ולפתוח את הליד. */
  onContactMovedToLead?: (leadId: string) => void | Promise<void>;
  meetings?: Meeting[];
  /** «קבע פגישה» מליד (עם כל מי שבפנייה) או מאיש קשר. */
  onNewMeeting?: (preset: { leadId?: string; contactId?: string }) => void;
  /** «הפרד לליד נפרד» — אדם מהפנייה המשותפת נעשה ליד משלו. */
  onSplitCompanion?: (lead: Lead, email: string, name?: string) => Promise<SplitCompanionResult>;
}

const TAB_KEY = 'pivo.people.tab';

const STAGE_NOW_TITLE: Record<string, string> = {
  lead: 'ליד',
  quoted: 'הצעת מחיר',
  onboarding: 'תהליך קליטה',
  active: 'תיק פעיל',
  archived: 'ארכיון',
};

export default function PersonDirectory(p: Props) {
  const [query, setQuery] = useState('');
  const isContactId = (id: string | null) => !!id && (id === NEW_CONTACT_ID || !!p.contactsApi?.contacts.some(c => c.id === id));
  const [tabRaw, setTabRaw] = useState<'people' | 'contacts'>(() => {
    if (isContactId(p.quickViewId)) return 'contacts';
    try { return sessionStorage.getItem(TAB_KEY) === 'contacts' ? 'contacts' : 'people'; } catch { return 'people'; }
  });
  // ‼ קישור ישיר למגירה פותח את הלשונית שלה, גם אם נבחרה אחרת: איש קשר ⇒ «אנשי קשר»,
  //   לקוח/ליד (למשל הליד שנוצר בהפרדה) ⇒ «לקוחות ולידים».
  const tab = !p.contactsApi ? 'people'
    : isContactId(p.quickViewId) ? 'contacts'
      : p.quickViewId ? 'people' : tabRaw;
  const setTab = (t: 'people' | 'contacts') => {
    setTabRaw(t);
    try { sessionStorage.setItem(TAB_KEY, t); } catch { /* רק נוחות */ }
    if (p.quickViewId) p.onQuickView(null);
  };
  // מגירה שנפתחה מקישור קובעת את הלשונית גם אחרי שנסגרת — לא קופצים חזרה ללשונית אחרת.
  useEffect(() => {
    if (tab === tabRaw) return;
    setTabRaw(tab);
    try { sessionStorage.setItem(TAB_KEY, tab); } catch { /* רק נוחות */ }
  }, [tab, tabRaw]);
  const [splitNames, setSplitNames] = useState<Record<string, string>>({});
  const [splitBusy, setSplitBusy] = useState<string | null>(null);
  const [chargeDialogFor, setChargeDialogFor] = useState<Client | null>(null);
  const [chargeBusyId, setChargeBusyId] = useState<string | null>(null);
  const { showToast } = useToast();

  const rows = useMemo(
    () => buildPersonRows(p.clients, p.leads, p.charges, p.meetingCues),
    [p.clients, p.leads, p.charges, p.meetingCues],
  );
  const visible = useMemo(() => searchPersonRows(rows, query), [rows, query]);
  const selected = useMemo(
    () => (p.quickViewId ? rows.find(r => r.id === p.quickViewId) ?? null : null),
    [rows, p.quickViewId],
  );
  const newSelfIntakeCount = useMemo(
    () => rows.filter(r => r.kind === 'lead' && r.lead?.source === 'self_intake' && r.lead.status === 'new').length,
    [rows],
  );

  const { docs, loading: docsLoading } = useRecentDocuments(
    selected?.kind === 'client' ? selected.id : undefined,
  );

  /** מחיקת ליד מתוך התצוגה המהירה — פעולה הרסנית, לכן עם אישור. סוגר את
   *  התצוגה מיד אחרי שהמחיקה מצליחה, כדי לא להישאר על שורה שכבר נעלמה. */
  async function handleDeleteLead(lead: Lead) {
    const name = lead.fullName?.trim() || lead.businessName || 'הליד';
    if (!window.confirm(`למחוק את "${name}"? הפעולה אינה הפיכה.`)) return;
    await p.onDeleteLead(lead);
    p.onQuickView(null);
  }

  /** «הפרד לליד נפרד» — עם אישור, ואז פותחים את הליד החדש כדי שיראו מה נוצר. */
  async function handleSplit(lead: Lead, email: string, name: string) {
    if (!p.onSplitCompanion || splitBusy) return;
    const who = name || email;
    if (!window.confirm(`להפריד את ${who} לליד נפרד?\n${who} ייצא/תצא מהפנייה של ${lead.fullName} ויופיע/תופיע ברשימה בשורה משלו/ה. הפגישות שכבר נקבעו לא משתנות.`)) return;
    setSplitBusy(email);
    try {
      const r = await p.onSplitCompanion(lead, email, name || undefined);
      if (r.ok) {
        showToast(r.already ? `${who} כבר הופרד/ה — הנה הליד` : `נוצר ליד נפרד: ${who}`);
        p.onQuickView(r.leadId);
      } else if (r.error === 'is_client') {
        showToast(`${who} כבר לקוח/ה — לא נוצר ליד נוסף.`);
        if (r.clientId) p.onOpenFullCase(r.clientId);
      } else if (r.error === 'name_required') {
        showToast('כתבו שם לפני ההפרדה.');
      } else {
        showToast('ההפרדה לא הצליחה. שום דבר לא השתנה — נסו שוב.');
      }
    } finally {
      setSplitBusy(null);
    }
  }

  async function handleAddChargeSubmit(description: string, amount: number, dueDate: string) {
    if (!chargeDialogFor) return;
    await p.onAddCharge(chargeDialogFor.id, description, amount, dueDate);
    setChargeDialogFor(null);
    showToast('החיוב נוסף ללקוח');
  }

  /** ‼ chargeBusyId מונע פעולה כפולה מלחיצה כפולה — הכפתור המקביל ננעל עד שהשרת מגיב. */
  async function handleRequestChargePayment(charge: AdditionalCharge) {
    if (chargeBusyId) return;
    setChargeBusyId(charge.id);
    try {
      await p.onRequestChargePayment(charge);
      showToast('דרישת התשלום נשלחה');
    } catch (e) {
      // ‼ «לא ידוע אם יצאה» אינו «נכשלה». השרת השאיר אותה מסומנת כנשלחה (כדי שלא
      // תצא פעמיים) — אומרים את זה, ומה עושים.
      const msg = e instanceof Error ? e.message : '';
      showToast(isUnknownSendReply(msg)
        ? 'לא ידוע אם דרישת התשלום יצאה — ספק הדואר לא החזיר תשובה ברורה. כדי שלא תצא פעמיים היא לא תישלח שוב מכאן; כדאי לוודא עם הלקוח שקיבל אותה.'
        : sendErrorView(msg, { what: 'המייל עם דרישת התשלום', recipient: 'הלקוח' }).text);
    } finally {
      setChargeBusyId(null);
    }
  }

  async function handleMarkChargePaid(charge: AdditionalCharge) {
    if (chargeBusyId) return;
    setChargeBusyId(charge.id);
    try {
      await p.onMarkChargePaid(charge);
      showToast('החיוב סומן כשולם');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'סימון כשולם נכשל');
    } finally {
      setChargeBusyId(null);
    }
  }

  /* ‼ כלל צפיפות הפעולות: מתוך deriveNextAction נלקח לכל היותר כפתור אחד —
     הראשון. גם אם הפעולה הבאה תציע יותר כפתורים בעתיד, התצוגה המהירה לא
     מציגה אותם; העומק שייך לתיק המלא. */
  function mapButton(row: PersonRow, b: NextActionButton | undefined): QuickViewAction | null {
    if (!b) return null;
    const client = row.client;
    const run = () => {
      switch (b.action) {
        case 'newQuotation': {
          const lead = p.leads.find(l => l.convertedClientId === row.id);
          if (lead) p.onNewQuotationForLead(lead); else p.onNewQuotation();
          break;
        }
        case 'openQuotation': if (b.quotationId) p.onOpenQuotation(b.quotationId); break;
        case 'openTask': if (b.taskId) p.onOpenTask(b.taskId); break;
        case 'editLead': {
          const lead = p.leads.find(l => l.convertedClientId === row.id);
          if (lead) p.onOpenLead(lead.id);
          break;
        }
        case 'openRepresentation': if (client) p.onOpenRepresentation(client.id); break;
        case 'startRepresentation': if (client) p.onStartRepresentation(client.id); break;
        default: p.onOpenFullCase(row.id); break;
      }
    };
    return { label: b.label, run };
  }

  /** שלב 4: פרטי ההתאמה האפשרית להצגה בתצוגה המהירה, כולל פתיחת הכרטיס הקיים. */
  function matchInfoFor(row: PersonRow): { clientName: string; onOpen: () => void } | null {
    if (!row.possibleMatch || !row.matchClientId) return null;
    const client = p.clients.find(c => c.id === row.matchClientId);
    if (!client) return null;
    const name = `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim()
      || client.businessName || client.idNumber || '-';
    const clientId = client.id;
    return { clientName: name, onOpen: () => p.onOpenFullCase(clientId) };
  }

  /** כל תוכן התצוגה המהירה נגזר כאן; PersonQuickView רק מציג. */
  function quickViewContent(row: PersonRow) {
    if (row.kind === 'lead') {
      const lead = row.lead!;
      const leadQuotation = p.quotations
        .filter(q => q.leadId === lead.id)
        .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0];

      const now = lead.status === 'quoted'
        ? { title: 'הצעת מחיר', detail: 'ההצעה נשלחה - ממתינים לתשובת הלקוח' }
        : lead.status === 'closed'
          ? { title: 'ליד', detail: 'הליד סגור' }
          : {
              title: 'ליד',
              detail: lead.source === 'self_intake'
                ? 'התקבל מקישור מילוי פרטים - טרם טופל'
                : 'טרם נשלחה הצעה',
            };

      // ‼ Customers היא המשטח היחיד לליד שטרם הפך ללקוח — בין אם הגיע
      // מהקישור הציבורי ובין אם הוזן ידנית. "המשך טיפול" פותח תמיד את בורר
      // המסלול הקיים משלב 3; אין החזרה למסך הלידים הישן משום מקום כאן.
      // הצעה שכבר נשלחה היא היוצא היחיד — שם הפעולה היא לפתוח אותה עצמה.
      const primary: QuickViewAction = lead.status === 'quoted' && leadQuotation
        ? { label: 'פתח את ההצעה', run: () => p.onOpenQuotation(leadQuotation.id) }
        : { label: 'המשך טיפול', run: () => p.onContinueLead(lead) };

      return {
        now,
        // ‼ הכפתור היחיד שנוסף לליד (כלל שלושת הכפתורים): «קבע פגישה» — עם כל מי שבפנייה.
        quickAction: p.onNewMeeting && lead.email
          ? { label: 'קבע פגישה', run: () => p.onNewMeeting!({ leadId: lead.id }) } as QuickViewAction
          : null,
        onRequestMaterials: undefined,
        primary,
        charges: [] as AdditionalCharge[],
      };
    }

    const client = row.client!;
    const stage = client.lifecycleStage ?? 'active';
    const clientSteps = clientStepsOf(p.onboardingSteps, client.id);
    const rep = p.repContextOf?.(client.id);
    const na = nextActionForClient({
      client,
      lead: p.leads.find(l => l.convertedClientId === client.id),
      quotations: p.quotations,
      openTasks: getClientOpenTasks(client.id, p.tasks),
      steps: p.onboardingSteps,
      niExecution: rep?.niExecution,
      repSendPhase: rep?.repSendPhase,
    });

    let now: { title: string; detail?: string };
    let quickAction: QuickViewAction | null = null;

    if (stage === 'onboarding') {
      // בקליטה הפעולות חיות בשורות המסע עצמן (deriveNextAction מחזיר null
      // בכוונה) — כאן מציגים את השלב הבא ואת ההתקדמות, והעומק בתיק המלא.
      const next = nextStepForClient(clientSteps);
      const done = clientSteps.filter(s => !isStepOpen(s.status)).length;
      now = {
        title: STAGE_NOW_TITLE.onboarding,
        detail: next
          ? `${nextActionText(next)} · ${done} מתוך ${clientSteps.length} הושלמו`
          : 'הכול ממתין לצד אחר',
      };
      if (client.representationRequestId && client.representationStatus
        && client.representationStatus !== 'active') {
        quickAction = {
          label: 'פתח בקשת ייצוג',
          run: () => p.onOpenRequest(client.representationRequestId!),
        };
      }
    } else {
      // ‼ דחוף נראה דחוף: «· תקועה» / «· באיחור 3 ימים» ליד הכותרת (NextAction.flag).
      now = { title: STAGE_NOW_TITLE[stage] ?? stage, detail: na ? (na.flag ? `${na.headline} · ${na.flag}` : na.headline) : undefined };
      quickAction = mapButton(row, na?.buttons?.[0]);
    }

    // ‼ חיובים חד-פעמיים פתוחים גוברים על הפעולה תלוית-השלב (V3.3): מי שיש
    // לו עבודת תשלום פתוחה זה הדבר הכי דחוף, בלי קשר לאיפה במסע. הראשון
    // הפתוח (הישן ביותר, לא 'paid') הוא זה שמקבל את כפתור השורה — הפעולה
    // תלויה במצב שלו, בדיוק כמו בכרטיס שלו במקטע.
    const charges = row.charges;
    const firstOpen = charges.find(c => c.status !== 'paid');
    if (firstOpen?.status === 'pending') {
      quickAction = { label: 'שלח דרישת תשלום', run: () => handleRequestChargePayment(firstOpen) };
    } else if (firstOpen?.status === 'requested') {
      quickAction = { label: 'סמן כשולם', run: () => handleMarkChargePaid(firstOpen) };
    } else if (stage === 'active' && charges.length === 0 && !quickAction && na?.tone === 'calm') {
      // "+ חיוב נוסף" כפעולה משנית — רק ללקוח פעיל רגוע בלי חיוב קיים; כשיש
      // חיוב, ההוספה עוברת לכותרת המקטע "חיובים נוספים" ולא נשארת כאן.
      // ‼ «רגוע» באמת: הוא לא דורס את הפעולה של «מה קורה עכשיו» («פתח את
      // המשימה», «התחלת ייצוג»), ולא מוצג ליד משהו תקוע.
      quickAction = { label: '+ חיוב נוסף', run: () => setChargeDialogFor(client) };
    }

    return {
      now,
      quickAction,
      onRequestMaterials: () => p.onRequestMaterials(client.id),
      primary: { label: 'פתח תיק מלא', run: () => p.onOpenFullCase(client.id) } as QuickViewAction,
      charges,
    };
  }

  return (
    <div className="pd-page">
      {/* ‼ אנטומיה משותפת עם מסך המשימות (בלוק wp- ב-pivo-design.css).
          קודם הפעולה הראשית ישבה בתוך שורת החיפוש ולכן ירדה ל-130px,
          בעוד שבמשימות היא יושבת לצד הכותרת ב-20px — זו הייתה הקפיצה
          העיקרית במעבר בין שני הדפים. */}
      <header className="wp-head">
        <div className="wp-head-main">
          <h1 className="wp-title">לקוחות</h1>
          <p className="wp-sub">חפש אדם קיים או התחל לעבוד עם אדם חדש</p>
        </div>
        <div className="wp-actions">
          {tab === 'contacts'
            ? <button type="button" className="ui-btn ui-btn-primary" onClick={() => p.onQuickView(NEW_CONTACT_ID)}>+ איש קשר</button>
            : <button type="button" className="ui-btn ui-btn-primary" onClick={p.onAdd}>+ אדם חדש</button>}
        </div>
      </header>

      {p.contactsApi && (
        <div className="pd-tabs" role="tablist" aria-label="מי ברשימה">
          <button type="button" role="tab" className="pd-tab" aria-selected={tab === 'people'} onClick={() => setTab('people')}>
            לקוחות ולידים
          </button>
          <button type="button" role="tab" className="pd-tab" aria-selected={tab === 'contacts'} onClick={() => setTab('contacts')}>
            אנשי קשר <span className="pd-count">({p.contactsApi.contacts.length})</span>
          </button>
        </div>
      )}

      <div className="wp-tools">
        <div className="pd-search wp-search">
          <span className="pd-glass" aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={tab === 'contacts' ? 'חיפוש לפי שם, תפקיד, מקום עבודה, טלפון או מייל' : 'חיפוש לפי שם, ת״ז, טלפון או מייל'}
            autoComplete="off"
            aria-label={tab === 'contacts' ? 'חיפוש אנשי קשר' : 'חיפוש אנשים'}
          />
        </div>
      </div>

      {tab === 'contacts' && p.contactsApi && (
        <ContactsPanel api={p.contactsApi} clients={p.clients} leads={p.leads} meetings={p.meetings ?? []}
          meetingCues={p.meetingCues ?? new Map()} query={query}
          openId={isContactId(p.quickViewId) ? p.quickViewId : null} onOpen={p.onQuickView}
          onNewMeeting={contactId => p.onNewMeeting?.({ contactId })}
          onMovedToLead={p.onContactMovedToLead} />
      )}

      {tab === 'people' && <>
      {newSelfIntakeCount > 0 && (
        <div className="pd-notice">
          {newSelfIntakeCount === 1
            ? 'התקבלה הגשה חדשה מקישור מילוי הפרטים - ממתינה לטיפול.'
            : `התקבלו ${newSelfIntakeCount} הגשות חדשות מקישור מילוי הפרטים - ממתינות לטיפול.`}
        </div>
      )}

      <div className="pd-listhead">
        כל האנשים <span className="pd-count">({visible.length})</span>
      </div>

      <div>
        {visible.map(row => (
          <div
            key={`${row.kind}:${row.id}`}
            className="pd-row"
            role="button"
            tabIndex={0}
            onClick={() => p.onQuickView(row.id)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onQuickView(row.id); }
            }}
          >
            <div className="pd-person">
              <div className="pd-av">{row.initials}</div>
              <div>
                <div className="pd-nm">{row.name}</div>
                <div className="pd-meta">
                  {row.idNumber
                    ? <>ת.ז. <span className="num">{row.idNumber}</span></>
                    : <span className="num pd-ltr">{row.phone || row.email || '-'}</span>}
                </div>
              </div>
            </div>
            <div className="pd-contact">
              <span className="num pd-ltr">{row.phone || '-'}</span><br />
              <span className="pd-ltr">{row.email || '-'}</span>
            </div>
            <div>
              <span className={`pd-badge ${row.badge.cls}`}>{row.badge.label}</span>
              {row.possibleMatch && <span className="pd-match">ייתכן שקיים</span>}
            </div>
            <div className="pd-cue">{row.cue}</div>
            <div className="pd-arrow" aria-hidden="true">‹</div>
          </div>
        ))}
      </div>

      {visible.length === 0 && (
        <div className="pd-empty">
          <h3>לא מצאנו אדם מתאים</h3>
          <p>אפשר להוסיף אדם חדש או לשלוח לו קישור למילוי פרטים.</p>
        </div>
      )}
      </>}

      {tab === 'people' && selected && (() => {
        const content = quickViewContent(selected);
        return (
          <Sheet onClose={() => p.onQuickView(null)} ariaLabel="תצוגה מהירה">
            <PersonQuickView
              row={selected}
              now={content.now}
              docs={docs}
              docsLoading={docsLoading}
              quickAction={content.quickAction}
              onRequestMaterials={content.onRequestMaterials}
              primary={content.primary}
              possibleMatch={matchInfoFor(selected)}
              onDeleteLead={selected.kind === 'lead' ? () => handleDeleteLead(selected.lead!) : undefined}
              charges={content.charges}
              onAddCharge={selected.kind === 'client' ? () => setChargeDialogFor(selected.client!) : undefined}
              onRequestChargePayment={handleRequestChargePayment}
              onMarkChargePaid={handleMarkChargePaid}
              chargeBusyId={chargeBusyId}
              spouseClient={selected.client?.spouseClientId
                ? p.clients.find(c => c.id === selected.client!.spouseClientId)
                : undefined}
              companions={selected.kind === 'lead' && selected.lead!.companions?.length
                ? selected.lead!.companions.map(c => ({
                    email: c.email,
                    name: c.name ?? '',
                    relation: COMPANION_RELATION_LABELS[c.relation] ?? '',
                    typedName: splitNames[c.email] ?? '',
                    onTypeName: (v: string) => setSplitNames(n => ({ ...n, [c.email]: v })),
                    busy: splitBusy === c.email,
                    onSplit: p.onSplitCompanion
                      ? () => handleSplit(selected.lead!, c.email, (c.name || splitNames[c.email] || '').trim())
                      : undefined,
                  }))
                : undefined}
              splitFrom={selected.kind === 'lead' && selected.lead!.splitFromLeadId
                ? p.leads.find(l => l.id === selected.lead!.splitFromLeadId)?.fullName
                : undefined}
              onClose={() => p.onQuickView(null)}
            />
          </Sheet>
        );
      })()}

      {chargeDialogFor && (
        <AddChargeDialog
          clientName={`${chargeDialogFor.firstName ?? ''} ${chargeDialogFor.lastName ?? ''}`.trim() || 'הלקוח'}
          onCancel={() => setChargeDialogFor(null)}
          onSubmit={handleAddChargeSubmit}
        />
      )}
    </div>
  );
}
