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
import { buildPersonRows, searchPersonRows, type PersonRow } from '../utils/personDirectory';
import { nextActionForClient, clientStepsOf } from '../utils/nextActionForClient';
import { nextStepForClient, NEXT_ACTION } from '../utils/onboardingNext';
import { isStepOpen } from '../types/onboarding';
import { getClientOpenTasks } from '../utils/clientDerived';
import type { NextActionButton } from '../utils/journeyPresentation';
import Sheet from './ui/Sheet';
import PersonQuickView, { type QuickViewAction } from './PersonQuickView';
import { useRecentDocuments } from '../hooks/useRecentDocuments';

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

  const rows = useMemo(() => buildPersonRows(p.clients, p.leads), [p.clients, p.leads]);
  const visible = useMemo(() => searchPersonRows(rows, query), [rows, query]);
  const selected = useMemo(
    () => (p.quickViewId ? rows.find(r => r.id === p.quickViewId) ?? null : null),
    [rows, p.quickViewId],
  );

  const { docs, loading: docsLoading } = useRecentDocuments(
    selected?.kind === 'client' ? selected.id : undefined,
  );

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
          : { title: 'ליד', detail: 'טרם נשלחה הצעה' };
      const quickAction: QuickViewAction | null =
        lead.status === 'closed' ? null
          : lead.status === 'quoted' && leadQuotation
            ? { label: 'פתח את ההצעה', run: () => p.onOpenQuotation(leadQuotation.id) }
            : { label: 'שלח הצעת מחיר', run: () => p.onNewQuotationForLead(lead) };
      return {
        now,
        quickAction,
        onRequestMaterials: undefined,
        primary: { label: 'פתח את הליד', run: () => p.onOpenLead(lead.id) } as QuickViewAction,
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

    return {
      now,
      quickAction,
      onRequestMaterials: () => p.onRequestMaterials(client.id),
      primary: { label: 'פתח תיק מלא', run: () => p.onOpenFullCase(client.id) } as QuickViewAction,
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
            <div><span className={`pd-badge ${row.badge.cls}`}>{row.badge.label}</span></div>
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
              onClose={() => p.onQuickView(null)}
            />
          </Sheet>
        );
      })()}
    </div>
  );
}
