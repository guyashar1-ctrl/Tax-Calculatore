// ─── המשפך: כל אדם, בעמודה של השלב שבו הוא נמצא ─────────────────────────────
// ‼ אדם אחד = כרטיס אחד. ליד שכבר נולד לו כרטיס מיוצג על ידי הכרטיס בלבד,
// אחרת אותו בן אדם היה נספר פעמיים במסך אחד.
//
// ‼ המשפך אינו רשימת לקוחות. עמודת "פעילים" מציגה מונה ומדגם — מי שמחפש
// לקוח מסוים עובר לתצוגת הרשימה, ומי שמסתכל כאן שואל "מה זז ומה תקוע".

import { useMemo } from 'react';
import type { Client, LifecycleStage } from '../types';
import { LIFECYCLE_STAGE_LABELS, REPRESENTATION_STATUS_LABELS } from '../types';
import type { Lead, Quotation } from '../types/quotations';
import { LEAD_STATUS_LABELS } from '../types/quotations';
import type { Engagement, OnboardingStep } from '../types/onboarding';
import { STEP_BALL_LABELS, STEP_TYPE_LABELS, isStepOpen } from '../types/onboarding';
import { NEXT_ACTION, summarizeClientOnboarding } from '../utils/onboardingNext';

interface Props {
  clients: Client[];
  leads: Lead[];
  quotations: Quotation[];
  onboardingSteps: OnboardingStep[];
  engagements: Engagement[];
  showClosed: boolean;
  onToggleClosed: () => void;
  onOpenClient: (id: string) => void;
  onOpenOnboarding: (clientId: string) => void;
  onOpenLead: (leadId: string) => void;
}

/** כרטיס במשפך: שם, מה הפעולה הבאה, ואצל מי הכדור. שלוש שורות, לא יותר. */
interface FunnelCard {
  key: string;
  name: string;
  line: string;
  ball?: string;
  tone?: 'mine' | 'warn' | 'stuck';
  onOpen: () => void;
}

const COLUMNS: { stage: LifecycleStage; label: string }[] = [
  { stage: 'lead',       label: LIFECYCLE_STAGE_LABELS.lead },
  { stage: 'quoted',     label: LIFECYCLE_STAGE_LABELS.quoted },
  { stage: 'onboarding', label: LIFECYCLE_STAGE_LABELS.onboarding },
  { stage: 'active',     label: LIFECYCLE_STAGE_LABELS.active },
];

const ACTIVE_PREVIEW = 6;

function clientName(c: Client): string {
  return `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || '(ללא שם)';
}

/** כמה ימים נשארו לתוקף ההצעה. שלילי = כבר פגה. */
function daysLeft(iso?: string): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

export default function ClientsFunnel({
  clients, leads, quotations, onboardingSteps, engagements,
  showClosed, onToggleClosed, onOpenClient, onOpenOnboarding, onOpenLead,
}: Props) {
  const summaries = useMemo(
    () => new Map(summarizeClientOnboarding(onboardingSteps).map(s => [s.clientId, s])),
    [onboardingSteps],
  );

  const engByClient = useMemo(() => {
    const m = new Map<string, Engagement>();
    for (const e of engagements) {
      const prev = m.get(e.clientId);
      if (!prev || (e.approvedAt ?? '') < (prev.approvedAt ?? '')) m.set(e.clientId, e);
    }
    return m;
  }, [engagements]);

  // ההצעה החיה של כל לקוח — היא שמסבירה למה הוא יושב בעמודת "בהצעה"
  const openQuoteByClient = useMemo(() => {
    const m = new Map<string, Quotation>();
    for (const q of quotations) {
      if (q.status !== 'sent' && q.status !== 'viewed') continue;
      if (!q.clientId) continue;
      const prev = m.get(q.clientId);
      if (!prev || (q.sentAt ?? '') > (prev.sentAt ?? '')) m.set(q.clientId, q);
    }
    return m;
  }, [quotations]);

  const columns = useMemo(() => {
    const byStage = new Map<LifecycleStage, FunnelCard[]>(
      COLUMNS.map(c => [c.stage, [] as FunnelCard[]]),
    );

    for (const c of clients) {
      const stage = (c.lifecycleStage ?? 'active') as LifecycleStage;
      if (stage === 'archived') continue;
      const bucket = byStage.get(stage);
      if (!bucket) continue;

      if (stage === 'onboarding') {
        const s = summaries.get(c.id);
        const step = s?.stuck ?? s?.next ?? null;
        const eng = engByClient.get(c.id);
        const from = eng?.approvedAt ?? eng?.createdAt;
        const days = from ? Math.floor((Date.now() - new Date(from).getTime()) / 86400000) : null;
        const mine = !!step && step.ball === 'me' && isStepOpen(step.status) && step.status !== 'locked';
        bucket.push({
          key: c.id,
          name: clientName(c),
          line: step
            ? (s?.stuck ? STEP_TYPE_LABELS[step.stepType] : mine ? NEXT_ACTION[step.stepType] : STEP_TYPE_LABELS[step.stepType])
            : 'כל השלבים סגורים',
          ball: step
            ? `${STEP_BALL_LABELS[step.ball]}${days === null ? '' : days === 0 ? ' · היום' : ` · ${days} ימים`}`
            : undefined,
          tone: s?.stuck ? 'stuck' : mine ? 'mine' : undefined,
          onOpen: () => onOpenOnboarding(c.id),
        });
        continue;
      }

      if (stage === 'quoted') {
        const q = openQuoteByClient.get(c.id);
        const left = daysLeft(q?.expiresAt);
        bucket.push({
          key: c.id,
          name: clientName(c),
          line: q?.status === 'viewed' ? 'ההצעה נצפתה, טרם נחתמה' : 'ההצעה נשלחה',
          ball: left === null ? undefined
            : left < 0 ? 'התוקף פג'
            : left === 0 ? 'התוקף פג היום'
            : `בתוקף עוד ${left} ימים`,
          tone: left !== null && left <= 3 ? 'warn' : undefined,
          onOpen: () => onOpenClient(c.id),
        });
        continue;
      }

      // ליד שכבר יש לו כרטיס, ופעילים.
      // ‼ לקוח פעיל שהייצוג שלו עדיין בתהליך מוצג כאן באותו ניסוח שבו הוא
      // מוצג ברשימה. אחרת אותו אדם היה "לקוח פעיל" במסך אחד ו"דורש הפקת
      // טופס" בשני, ושני המסכים היו נראים כאילו הם חלוקים.
      const repOpen = !!c.representationStatus && c.representationStatus !== 'active';
      bucket.push({
        key: c.id,
        name: clientName(c),
        line: stage === 'lead'
          ? 'טרם נשלחה הצעה'
          : repOpen ? REPRESENTATION_STATUS_LABELS[c.representationStatus!] : 'לקוח פעיל',
        onOpen: () => onOpenClient(c.id),
      });
    }

    // לידים שעוד לא נולד להם כרטיס. עם converted_client_id הכרטיס כבר מייצג
    // אותם, ולכן הם לא נספרים כאן שוב.
    const leadBucket = byStage.get('lead')!;
    for (const l of leads) {
      if (l.convertedClientId) continue;
      if (l.status === 'converted') continue;
      if (l.status === 'closed' && !showClosed) continue;
      leadBucket.push({
        key: `lead-${l.id}`,
        name: l.fullName || '(ליד ללא שם)',
        line: LEAD_STATUS_LABELS[l.status],
        onOpen: () => onOpenLead(l.id),
      });
    }

    return byStage;
  }, [clients, leads, summaries, engByClient, openQuoteByClient, showClosed,
      onOpenClient, onOpenOnboarding, onOpenLead]);

  const closedLeads = leads.filter(l => !l.convertedClientId && l.status === 'closed').length;

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 .7rem', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '17px', fontWeight: 500 }}>המשפך</span>
        <span style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
          · כל אדם, בשלב שבו הוא נמצא
        </span>
        {closedLeads > 0 && (
          <button className="btn-link" onClick={onToggleClosed} style={{ fontSize: '12.5px' }}>
            {showClosed ? 'הסתרת לידים סגורים' : `הצגת ${closedLeads} לידים סגורים`}
          </button>
        )}
      </div>

      <div className="funnel-grid">
        {COLUMNS.map(col => {
          const cards = columns.get(col.stage) ?? [];
          const isActive = col.stage === 'active';
          const shown = isActive ? cards.slice(0, ACTIVE_PREVIEW) : cards;
          return (
            <section key={col.stage} className="funnel-col">
              <header className="funnel-col-head">
                <span>{col.label}</span>
                <span className="funnel-count">{cards.length}</span>
              </header>

              {cards.length === 0 ? (
                <p className="funnel-empty">—</p>
              ) : (
                shown.map(card => (
                  <button
                    key={card.key}
                    type="button"
                    className={`funnel-card${card.tone ? ` is-${card.tone}` : ''}`}
                    onClick={card.onOpen}
                  >
                    <span className="funnel-card-name">{card.name}</span>
                    <span className="funnel-card-line">{card.line}</span>
                    {card.ball && <span className="funnel-card-ball">{card.ball}</span>}
                  </button>
                ))
              )}

              {isActive && cards.length > shown.length && (
                <p className="funnel-more">ועוד {cards.length - shown.length} — בתצוגת הרשימה</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
