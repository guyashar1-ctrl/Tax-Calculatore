// ─── «מתי פותחים בקשות?» — כלל פתיחה בשפה פשוטה (הדמיה מאושרת, 05.10.2026) ──
// ‼ אותו מסלול בדיוק (office_flows) — כאן הוא נקרא ככלל: מתי, למי, מה נפתח ואיך זה
// מגיע ללקוח. הבונה המלא (שלבים, תלויות, גרסאות) נשאר מאחורי «עריכת הכלל». שום
// התנהגות לא משתנה בתצוגה הזו: הניסוח נגזר מהגדרת הכלל השמורה ומשערי המערכת.
// ‼ (5.10.2026) שם הבקשה/הקבוצה בכלל הוא כפתור שקט שפותח «צפייה» — מה הלקוח מקבל ממנה. פעולה מול רשות (אין לה
// כרטיס בדף של הלקוח) נשארת טקסט.
import { Fragment, useState } from 'react';
import type { RequestTemplate } from '../../../../lib/requestTemplates';
import type { FirmProfile } from '../../../../types/firmProfile';
import type { FlowDefinition, FlowItem, FlowStage, FlowTrigger } from '../../../../features/flows/types';
import { DELIVERY_LABELS } from '../../../../features/flows/types';
import { useBuilderPreview } from '../../../flows/builder/BuilderPreview';
import { previewTargetOfSubject } from '../../../flows/builder/previewTarget';
import { ruleLines, type RuleLine } from './ruleLines';
import '../../../flows/builder/builderPreview.css';

export { ruleLines } from './ruleLines';
export type { RuleLine, RulePart } from './ruleLines';

const TRIGGER_WHEN: Record<FlowTrigger, string> = {
  quote_approved: 'כאשר לקוח חדש מאשר הצעת מחיר',
  manual: 'כשמפעילים ללקוח — כאן, או מכרטיס הלקוח',
  annual: 'פעם בשנה, לשנת מס — כשמפעילים',
};

export function deliveryLine(st: FlowStage): string {
  const d = DELIVERY_LABELS[st.delivery];
  const rem = st.reminder ? ` · תזכורת אחרי ${st.reminder.afterDays} ימים, עד ${st.reminder.max} פעמים` : '';
  return `${d.short}${rem}`;
}

export default function RuleCard({ name, trigger, def, runsText, title, defaultOpen, templates, profile, onEdit, onStart }: {
  name: string;
  trigger: FlowTrigger;
  def: FlowDefinition;
  runsText: string;
  title: (i: FlowItem) => string;
  defaultOpen?: boolean;
  /** בקשות הספרייה — לעובדות של «צפייה». בלעדיהן: מהעותק השמור בפריט (השרת ממילא קורא את הספרייה). */
  templates?: readonly RequestTemplate[];
  /** פרופיל המשרד — ללשונית «במייל» שבמגירת «צפייה». */
  profile?: FirmProfile;
  onEdit: () => void;
  onStart?: () => void;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const preview = useBuilderPreview(profile);
  const stages = ruleLines(def, title);

  /** «א, ב וג» — כמו heList, אבל כל שם שיש לו כרטיס ללקוח הוא כפתור שקט. */
  const names = (l: RuleLine) => {
    if (l.parts.length === 0) return l.text;
    const last = l.parts.length - 1;
    return (
      <>
        {l.prefix}
        {l.parts.map((p, i) => {
          const target = previewTargetOfSubject(p.subject, { templates, title });
          return (
            <Fragment key={i}>
              {i > 0 && (i === last ? ' ו' : ', ')}
              {target
                ? <button type="button" className="bp-rule-name" aria-label={`צפייה: ${p.label}`} data-testid="rule-view"
                    onClick={() => preview.open(target)}>{p.label}</button>
                : p.label}
            </Fragment>
          );
        })}
      </>
    );
  };

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
                <div key={i} className="fr-line"><span className="fr-lead">{l.lead}</span><b>{names(l)}</b></div>
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
      {preview.node}
    </section>
  );
}
