// ─── «מתי פותחים בקשות?» — כלל פתיחה בשפה פשוטה (הדמיה מאושרת, 05.10.2026) ──
// ‼ אותו מסלול בדיוק (office_flows) — כאן הוא נקרא ככלל: מתי, למי, מה נפתח ואיך זה
// מגיע ללקוח. הבונה המלא (שלבים, תלויות, גרסאות) נשאר מאחורי «עריכת הכלל». שום
// התנהגות לא משתנה בתצוגה הזו: הניסוח נגזר מהגדרת הכלל השמורה ומשערי המערכת.
import { useState } from 'react';
import type { FlowDefinition, FlowItem, FlowStage, FlowTrigger } from '../../../../features/flows/types';
import { DELIVERY_LABELS } from '../../../../features/flows/types';
import { heList, isEmptyWhen, whenParts } from '../../../../features/flows/conditions';
import { opensLabel, systemGate } from '../../../../features/flows/preview';
import { officeGroupOf, REQUEST_GROUPS } from '../../../../features/requests/requestGroups';
import type { OnboardingStepType } from '../../../../types/onboarding';

export interface RuleLine { lead: string; text: string }

const TRIGGER_WHEN: Record<FlowTrigger, string> = {
  quote_approved: 'כאשר לקוח חדש מאשר הצעת מחיר',
  manual: 'כשמפעילים ללקוח — כאן, או מכרטיס הלקוח',
  annual: 'פעם בשנה, לשנת מס — כשמפעילים',
};

/** שם הפריט בכלל — ובקשת מערכת שחלק מקבוצה: שם הקבוצה (פעם אחת). */
function itemLabel(it: FlowItem, title: (i: FlowItem) => string): { label: string; groupKey?: string } {
  if (it.ref.kind === 'system') {
    const g = officeGroupOf({ stepType: it.ref.stepType as OnboardingStepType, payload: {} }, true);
    if (g) return { label: `קבוצת ${REQUEST_GROUPS[g].title}`, groupKey: g };
  }
  return { label: title(it) };
}

/** שורות הכלל: «פותחים …», «אם … — פותחים גם …», «אחר כך …». */
export function ruleLines(def: FlowDefinition, title: (i: FlowItem) => string): { stage: FlowStage; lines: RuleLine[] }[] {
  return def.stages.map((st, si) => {
    const base: string[] = [];
    const cond = new Map<string, string[]>();
    const seenGroups = new Set<string>();
    for (const it of st.items) {
      const { label, groupKey } = itemLabel(it, title);
      if (groupKey) { if (seenGroups.has(groupKey)) continue; seenGroups.add(groupKey); }
      // שער קבוע של בקשת מערכת (פייפרלס, רו״ח קודם, ייצוג) + התנאי שבפריט.
      const gate = it.ref.kind === 'system' ? systemGate(it.ref.stepType, {}).rule : null;
      // ‼ השער הקבוע והתנאי שבפריט אומרים לפעמים אותו דבר («כשההצעה כוללת ייצוג») — פעם אחת.
      const parts = [...new Set([...(gate ? [gate] : []), ...(isEmptyWhen(it.when) ? [] : whenParts(it.when))])];
      if (!parts.length) { base.push(label); continue; }
      const key = parts.join(', ');
      cond.set(key, [...(cond.get(key) ?? []), label]);
    }
    const lead = si === 0 && st.opens.after === 'start' ? 'פותחים'
      : st.opens.after === 'start' ? 'פותחים גם' : opensLabel(st, def, title);
    const lines: RuleLine[] = [];
    if (base.length) lines.push({ lead, text: heList(base) });
    // «כשההצעה כוללת ייצוג» ⇒ «אם ההצעה כוללת ייצוג»; «לעוסק מורשה» נשאר כמו שהוא.
    for (const [k, labels] of cond) lines.push({ lead: k.startsWith('כש') ? `אם ${k.slice(2)}` : k, text: `פותחים גם ${heList(labels)}` });
    if (!base.length && !cond.size) lines.push({ lead, text: 'אין עדיין בקשות בשלב הזה' });
    return { stage: st, lines };
  });
}

export function deliveryLine(st: FlowStage): string {
  const d = DELIVERY_LABELS[st.delivery];
  const rem = st.reminder ? ` · תזכורת אחרי ${st.reminder.afterDays} ימים, עד ${st.reminder.max} פעמים` : '';
  return `${d.short}${rem}`;
}

export default function RuleCard({ name, trigger, def, runsText, title, defaultOpen, onEdit, onStart }: {
  name: string;
  trigger: FlowTrigger;
  def: FlowDefinition;
  runsText: string;
  title: (i: FlowItem) => string;
  defaultOpen?: boolean;
  onEdit: () => void;
  onStart?: () => void;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const stages = ruleLines(def, title);
  return (
    <section className="rg-group fr-rule" data-open={open ? 'true' : 'false'} aria-label={name}>
      <button type="button" className="rg-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="rg-namecol">
          <span className="rg-name">{name}</span>
          <span className="rg-hint">{TRIGGER_WHEN[trigger]}</span>
        </span>
        <span className="rg-tag is-mine">פעיל · {runsText}</span>
        <span className="rg-chev" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
        </span>
      </button>
      {open && (
        <div className="fr-body">
          {stages.map(({ stage, lines }) => (
            <div key={stage.key} className="fr-stage">
              {stages.length > 1 && <div className="fr-stage-name">{stage.name}</div>}
              {lines.map((l, i) => (
                <div key={i} className="fr-line"><span className="fr-lead">{l.lead}</span><b>{l.text}</b></div>
              ))}
              <div className="fr-reach">
                <span className="fr-reach-k">הגעה ללקוח</span>
                <span className="fr-reach-v">{deliveryLine(stage)}</span>
              </div>
            </div>
          ))}
          <div className="fr-acts">
            <button type="button" className="btn btn-sm btn-secondary" onClick={onEdit}>עריכת הכלל</button>
            {onStart && <button type="button" className="btn btn-sm btn-ghost" onClick={onStart}>הפעלה ללקוחות…</button>}
          </div>
        </div>
      )}
    </section>
  );
}
