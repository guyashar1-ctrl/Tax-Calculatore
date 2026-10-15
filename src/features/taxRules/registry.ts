// ─── גישה למרשם ושער החישוב ──────────────────────────────────────────────────
// ‼ ruleView — לתצוגה וללימוד: מחזיר ערך גם כשאין ערך לשנה המבוקשת, ומסמן זאת.
// ‼ gate — לחישוב: עובר רק כשלכל כלל יש ערך לשנה המדויקת, ביסוס רשמי (או נגזר
// מרשמי), computable, ותרחיש שידוע שהכלל חל עליו. במצב «המחשה» מותר גם ערך
// משני — עם סימון, ולעולם לא לשמירה בהערכה מאושרת.

import { RULES, ALL_RULES } from './rules';
import { SOURCES } from './sources';
import type { Basis, GateProblem, Rule, RuleValue, Scenario, ScenarioTag, Source, UsedRule } from './types';

export const BASIS_ORDER: Basis[] = ['primary', 'derived', 'secondary', 'unverified'];

// ‼ 14.10.2026 (גיא: «מקור משני» לא ברור) — התווית אומרת גם מה עושים עם הערך, לא רק מאיפה הוא
export const BASIS_LABEL: Record<Basis, string> = {
  primary: 'מקור רשמי',
  derived: 'חושב מהחוק · לבדוק מול פרסום',
  secondary: 'מקור לא רשמי · לאמת לפני הגשה',
  unverified: 'לא אומת · לא לחשב לפיו',
};

export interface RuleView {
  rule: Rule;
  /** הערך שנבחר — לשנה המבוקשת, או לשנה הקרובה שקודמת לה. */
  entry?: RuleValue;
  /** האם הערך שייך בדיוק לשנה שביקשו. */
  exactYear: boolean;
  source?: Source;
}

export function getRule(id: string): Rule | undefined {
  return RULES[id];
}

/** הערך לתצוגה: השנה המבוקשת, ואם אין — השנה האחרונה שקודמת לה (מסומן). */
export function ruleView(id: string, year: number): RuleView | undefined {
  const rule = RULES[id];
  if (!rule) return undefined;
  const sorted = [...rule.values].sort((a, b) => b.taxYear - a.taxYear);
  const exact = sorted.find(v => v.taxYear === year);
  const entry = exact ?? sorted.find(v => v.taxYear < year) ?? sorted[sorted.length - 1];
  return { rule, entry, exactYear: !!exact, source: entry ? SOURCES[entry.sourceId] : undefined };
}

/** הביסוס החלש ביותר בין כללים — מה שנושא ידע מציג כתג אחד. */
export function weakestBasis(ids: readonly string[], year: number): Basis {
  let worst = 0;
  for (const id of ids) {
    const v = ruleView(id, year);
    const b = v?.entry?.basis ?? 'unverified';
    const effective: Basis = v && !v.exactYear && b === 'primary' ? 'secondary' : b;
    worst = Math.max(worst, BASIS_ORDER.indexOf(effective));
  }
  return BASIS_ORDER[worst];
}

export type GateMode = 'calculation' | 'illustration';

/**
 * שער החישוב. מחזיר את הבעיות; רשימה ריקה = מותר.
 * ‼ במצב illustration ערך משני או ערך של שנה קודמת מותרים (ומדווחים כבעיה
 * «רכה» דרך softProblems), אבל unverified ו-computable:false נחסמים תמיד.
 */
export function gate(ids: readonly string[], year: number, scenario: Scenario, mode: GateMode = 'calculation'): { hard: GateProblem[]; soft: GateProblem[] } {
  const hard: GateProblem[] = [];
  const soft: GateProblem[] = [];
  for (const id of ids) {
    const rule = RULES[id];
    if (!rule) { hard.push({ kind: 'missingRule', ruleId: id }); continue; }
    if (!rule.computable) { hard.push({ kind: 'notComputable', ruleId: id }); continue; }
    for (const tag of rule.scope ?? []) {
      const known = scenario[tag];
      if (known === undefined) hard.push({ kind: 'unknownScenario', ruleId: id, tag });
      else if (known === false) hard.push({ kind: 'outOfScope', ruleId: id, tag });
    }
    const view = ruleView(id, year)!;
    if (!view.entry) { hard.push({ kind: 'noValueForYear', ruleId: id, year }); continue; }
    if (!view.exactYear) {
      const p: GateProblem = { kind: 'noValueForYear', ruleId: id, year, nearestYear: view.entry.taxYear };
      (mode === 'illustration' ? soft : hard).push(p);
    }
    const b = view.entry.basis;
    if (b === 'unverified') hard.push({ kind: 'weakBasis', ruleId: id, year, basis: b });
    else if (b === 'secondary') (mode === 'illustration' ? soft : hard).push({ kind: 'weakBasis', ruleId: id, year, basis: b });
  }
  return { hard, soft };
}

const TAG_LABEL: Record<ScenarioTag, string> = {
  selfEmployed: 'יש הכנסה מעסק', employee: 'יש משכורת', employerStudyFund: 'המעביד מפקיד לקרן השתלמות',
  noWorkIncome: 'אין הכנסת עבודה', under50: 'טרם מלאו 50 ב-1.1', age50plus: 'מלאו 50 ב-1.1',
  beneficialMember: 'עמית מוטב', notBeneficialMember: 'לא עמית מוטב', beforeRetirementAge: 'לפני גיל פרישה',
  insuredSalary: 'ההכנסה המבוטחת מהמשכורת (244/245)', uninsuredSalaryTrackA: 'ניכוי 5% על משכורת שאינה מבוטחת (מסלול א׳)',
  age50plusWithSalary: 'מגיל 50 עם משכורת (חלוקת התקרה בין עבודה להכנסה אחרת)', age50plusBeneficialTrackA: 'עמית מוטב מגיל 50 שבוחר במסלול א׳',
};

/** משפט אחד בעברית לכל בעיה — מה שהמסך מציג במקום תוצאה. */
export function describeProblem(p: GateProblem): string {
  const label = RULES[p.ruleId]?.label ?? p.ruleId;
  switch (p.kind) {
    case 'missingRule': return `הכלל «${p.ruleId}» לא קיים במרשם`;
    case 'notComputable': return `«${label}» הוא הסבר מקצועי, לא כלל לחישוב`;
    case 'outOfScope': return `«${label}» לא חל כאן (${TAG_LABEL[p.tag]} — לא)`;
    case 'unknownScenario': return `לא ידוע אם «${TAG_LABEL[p.tag]}» — נדרש כדי להשתמש ב«${label}»`;
    case 'noValueForYear': return p.nearestYear ? `אין ל«${label}» ערך לשנת ${p.year}; מוצג ערך ${p.nearestYear}` : `אין ל«${label}» ערך לשנת ${p.year}`;
    case 'weakBasis': return `«${label}» לשנת ${p.year}: ${BASIS_LABEL[p.basis]} — לא בסיס לחישוב`;
  }
}

/** ערך מספרי לשימוש פנימי בפונקציות החישוב — אחרי שהשער עבר. */
export function num(id: string, year: number): number {
  const v = ruleView(id, year)?.entry?.value;
  if (typeof v !== 'number') throw new Error(`הכלל ${id} אינו מספרי לשנת ${year}`);
  return v;
}

/** גרסת המרשם — נשמרת עם כל תמונת מצב, כדי לזהות «כלל השתנה מאז האישור». */
export const RULESET_VERSION: string = (() => {
  const s = JSON.stringify(ALL_RULES);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 'r' + (h >>> 0).toString(36);
})();

export function formatRuleValue(view: RuleView | undefined): string {
  const e = view?.entry;
  if (!e) return '—';
  if (typeof e.value === 'string') return e.value;
  switch (view.rule.unit) {
    case '₪': return e.value.toLocaleString('he-IL') + ' ₪';
    case 'rate': return +(e.value * 100).toFixed(2) + '%';
    case 'days': return e.value + ' ימים';
    default: return e.value.toLocaleString('he-IL');
  }
}

/** רשומת «מה נכנס לחישוב» לכלל אחד — כולל הערך עצמו, כדי לזהות שינוי אחר כך. */
export function usedRule(id: string, year: number): UsedRule {
  const e = ruleView(id, year)?.entry;
  return { ruleId: id, requestedYear: year, taxYear: e?.taxYear ?? year, basis: e?.basis ?? 'unverified', value: e?.value ?? null, sourceId: e?.sourceId ?? null };
}
