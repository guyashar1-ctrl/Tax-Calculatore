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

import { useMemo, useState } from 'react';
import type { Client, Task } from '../types';
import type { Lead, Quotation } from '../types/quotations';
import type { OnboardingStep } from '../types/onboarding';
import type { AdditionalCharge } from '../types/charges';
import { buildPersonRows, searchPersonRows, type PersonRow } from '../utils/personDirectory';
import { nextActionForClient, clientStepsOf } from '../utils/nextActionForClient';
import { nextStepForClient, NEXT_ACTION } from '../utils/onboardingNext';
import { isStepOpen } from '../types/onboarding';
import { getClientOpenTasks } from '../utils/clientDerived';
import type { NextActionButton } from '../utils/journeyPresentation';
import Sheet from './ui/Sheet';
import PersonQuickView, { type QuickViewAction } from './PersonQuickView';
import AddChargeDialog from './AddChargeDialog';
import { useRecentDocuments } from '../hooks/useRecentDocuments';
import { useToast } from './ui/Toast';

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
  /** שלב 4: "המשך טיפול" בליד שהגיע מקישור המילוי הציבורי — פותח את בורר המסלול. */
  onContinueLead: (lead: Lead) => void;
  /** מחיקת ליד שטרם הפך ללקוח. אין השפעה על כרטיס לקוח קיים. */
  onDeleteLead: (lead: Lead) => Promise<void>;
  /** חיובים נוספים — כל הרשומות, מכל הלקוחות (מקובצות פנימית לפי clientId). */
  charges: AdditionalCharge[];
  onAddCharge: (clientId: string, description: string, amount: number) => Promise<void>;
  /** "שלח דרישת תשלום" — שולח מייל אמיתי ומסמן שהבקשה יצאה. */
  onRequestChargePayment: (charge: AdditionalCharge) => Promise<void>;
}

const STAGE_NOW_TITLE: Record<string, string> = {
  lead: 'ליד',
  quoted: 'הצעת מחיר',
  onboarding: 'תהליך קליטה',
  active: 'תיק פעיל',
  archived: 'ארכיון',
};

export default function PersonDirectory(p: Props) {
  const [query, setQuery] = useState('');
  const [chargeDialogFor, setChargeDialogFor] = useState<Client | null>(null);
  const [chargeSendingId, setChargeSendingId] = useState<string | null>(null);
  const { showToast } = useToast();

  const rows = useMemo(
    () => buildPersonRows(p.clients, p.leads, p.charges),
    [p.clients, p.leads, p.charges],
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

  async function handleAddChargeSubmit(description: string, amount: number) {
    if (!chargeDialogFor) return;
    await p.onAddCharge(chargeDialogFor.id, description, amount);
    setChargeDialogFor(null);
    showToast('החיוב נוסף ללקוח');
  }

  /** ‼ chargeSendingId מונע שליחה כפולה מלחיצה כפולה — הכפתור המקביל ננעל עד שהשרת מגיב. */
  async function handleRequestChargePayment(charge: AdditionalCharge) {
    if (chargeSendingId) return;
    setChargeSendingId(charge.id);
    try {
      await p.onRequestChargePayment(charge);
      showToast('דרישת התשלום נשלחה');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'שליחת דרישת התשלום נכשלה');
    } finally {
      setChargeSendingId(null);
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
      || client.businessName || client.idNumber || '—';
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
        ? { title: 'הצעת מחיר', detail: 'ההצעה נשלחה — ממתינים לתשובת הלקוח' }
        : lead.status === 'closed'
          ? { title: 'ליד', detail: 'הליד סגור' }
          : {
              title: 'ליד',
              detail: lead.source === 'self_intake'
                ? 'התקבל מקישור מילוי פרטים — טרם טופל'
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
        quickAction: null,
        onRequestMaterials: undefined,
        primary,
        charges: [] as AdditionalCharge[],
      };
    }

    const client = row.client!;
    const stage = client.lifecycleStage ?? 'active';
    const clientSteps = clientStepsOf(p.onboardingSteps, client.id);
    const na = nextActionForClient({
      client,
      lead: p.leads.find(l => l.convertedClientId === client.id),
      quotations: p.quotations,
      openTasks: getClientOpenTasks(client.id, p.tasks),
      steps: p.onboardingSteps,
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
          ? `${NEXT_ACTION[next.stepType]} · ${done} מתוך ${clientSteps.length} הושלמו`
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
      now = { title: STAGE_NOW_TITLE[stage] ?? stage, detail: na?.headline };
      quickAction = mapButton(row, na?.buttons?.[0]);
    }

    // ‼ חיובים נוספים גוברים על הפעולה תלוית-השלב (V3.3): מי שממתין לתשלום
    // הוא הדבר הכי דחוף, בלי קשר לאיפה האדם נמצא במסע. הראשון עם 'pending'
    // הוא זה שמקבל את כפתור השורה — חיוב שכבר נשלח אין לו כפתור "מת".
    const charges = row.charges;
    const firstPending = charges.find(c => c.status === 'pending');
    if (firstPending) {
      quickAction = { label: 'שלח דרישת תשלום', run: () => handleRequestChargePayment(firstPending) };
    } else if (stage === 'active' && charges.length === 0) {
      // "+ חיוב נוסף" כפעולה משנית — רק ללקוח פעיל רגוע בלי חיוב קיים; כשיש
      // חיוב, ההוספה עוברת לכותרת המקטע "חיובים נוספים" ולא נשארת כאן.
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
      <h1 className="pd-h1">לקוחות</h1>
      <div className="pd-intro">חפש אדם קיים או התחל לעבוד עם אדם חדש</div>

      <div className="pd-searchline">
        <div className="pd-search">
          <span className="pd-glass" aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="חיפוש לפי שם, ת״ז, טלפון או מייל"
            autoComplete="off"
            aria-label="חיפוש אנשים"
          />
        </div>
        <button type="button" className="pd-primary" onClick={p.onAdd}>+ אדם חדש</button>
      </div>

      {newSelfIntakeCount > 0 && (
        <div className="pd-notice">
          {newSelfIntakeCount === 1
            ? 'התקבלה הגשה חדשה מקישור מילוי הפרטים — ממתינה לטיפול.'
            : `התקבלו ${newSelfIntakeCount} הגשות חדשות מקישור מילוי הפרטים — ממתינות לטיפול.`}
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
                    : <span className="num pd-ltr">{row.phone || row.email || '—'}</span>}
                </div>
              </div>
            </div>
            <div className="pd-contact">
              <span className="num pd-ltr">{row.phone || '—'}</span><br />
              <span className="pd-ltr">{row.email || '—'}</span>
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

      {selected && (() => {
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
              chargeSendingId={chargeSendingId}
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
