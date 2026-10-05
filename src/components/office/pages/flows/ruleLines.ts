// ─── שורות «כללי פתיחה» — הניסוח של הכלל, טהור ───────────────────────────────────────
// ‼ בנפרד מהכרטיס (RuleCard) כדי שהבדיקות יטענו רק את הניסוח — בלי מגירת «צפייה» ושרשרת המסכים שלה.
// כל שם בשורה נושא גם מה הוא פותח ב«צפייה» (parts), והטקסט (text) נשאר בדיוק כמו שהיה.

import type { FlowDefinition, FlowItem, FlowStage } from '../../../../features/flows/types';
import { heList, isEmptyWhen, whenParts } from '../../../../features/flows/conditions';
import { opensLabel, systemGate } from '../../../../features/flows/preview';
import { officeGroupOf, REQUEST_GROUPS } from '../../../../features/requests/requestGroups';
import type { OnboardingStepType } from '../../../../types/onboarding';
import type { RuleSubject } from '../../../flows/builder/previewTarget';

/** שם אחד בשורה (בקשה או קבוצה) והדבר שהוא פותח ב«צפייה». */
export interface RulePart { label: string; subject: RuleSubject }
/** text = prefix + «א, ב וג»; parts — אותם שמות, כל אחד עם מה שהוא פותח. */
export interface RuleLine { lead: string; text: string; prefix: string; parts: RulePart[] }

/** שם הפריט בכלל — ובקשת מערכת שחלק מקבוצה: שם הקבוצה (פעם אחת). */
function itemLabel(it: FlowItem, title: (i: FlowItem) => string): RulePart & { groupKey?: string } {
  if (it.ref.kind === 'system') {
    const g = officeGroupOf({ stepType: it.ref.stepType as OnboardingStepType, payload: {} }, true);
    if (g) return { label: `קבוצת ${REQUEST_GROUPS[g].title}`, groupKey: g, subject: { kind: 'group', group: g } };
  }
  return { label: title(it), subject: { kind: 'item', item: it } };
}

/** שורות הכלל: «פותחים …», «אם … — פותחים גם …», «אחר כך …». */
export function ruleLines(def: FlowDefinition, title: (i: FlowItem) => string): { stage: FlowStage; lines: RuleLine[] }[] {
  return def.stages.map((st, si) => {
    const base: RulePart[] = [];
    const cond = new Map<string, RulePart[]>();
    const seenGroups = new Set<string>();
    for (const it of st.items) {
      const { label, groupKey, subject } = itemLabel(it, title);
      const part: RulePart = { label, subject };
      if (groupKey) { if (seenGroups.has(groupKey)) continue; seenGroups.add(groupKey); }
      // שער קבוע של בקשת מערכת (פייפרלס, רו״ח קודם, ייצוג) + התנאי שבפריט.
      const gate = it.ref.kind === 'system' ? systemGate(it.ref.stepType, {}).rule : null;
      // ‼ השער הקבוע והתנאי שבפריט אומרים לפעמים אותו דבר («כשההצעה כוללת ייצוג») — פעם אחת.
      const parts = [...new Set([...(gate ? [gate] : []), ...(isEmptyWhen(it.when) ? [] : whenParts(it.when))])];
      if (!parts.length) { base.push(part); continue; }
      const key = parts.join(', ');
      cond.set(key, [...(cond.get(key) ?? []), part]);
    }
    const lead = si === 0 && st.opens.after === 'start' ? 'פותחים'
      : st.opens.after === 'start' ? 'פותחים גם' : opensLabel(st, def, title);
    const lines: RuleLine[] = [];
    if (base.length) lines.push({ lead, text: heList(base.map(p => p.label)), prefix: '', parts: base });
    // «כשההצעה כוללת ייצוג» ⇒ «אם ההצעה כוללת ייצוג»; «לעוסק מורשה» נשאר כמו שהוא.
    for (const [k, ps] of cond) lines.push({ lead: k.startsWith('כש') ? `אם ${k.slice(2)}` : k, text: `פותחים גם ${heList(ps.map(p => p.label))}`, prefix: 'פותחים גם ', parts: ps });
    if (!base.length && !cond.size) lines.push({ lead, text: 'אין עדיין בקשות בשלב הזה', prefix: '', parts: [] });
    return { stage: st, lines };
  });
}
