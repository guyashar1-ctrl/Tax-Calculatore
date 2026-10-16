// ─── «ערכים לשנה» — לכל ערך בית אחד, בעמוד התחום שלו (15.10.2026) ──────────────────────────────
// ‼ גיא (15.10): «ערכים לפי נושא» היה עמוד-מגירה נפרד: מי שלמד שכר דירה לא הגיע ממנו למס רכישה, ומי שלמד מע״מ
//   לא ראה את תקרת עוסק פטור. עכשיו כל שורה מוצגת בתחום שלה, והעמוד הנפרד ירד (קישור ישן נוחת בהסבר «לאן עבר»).
// ‼ אין כאן ערכים — רק הפניות. שורה ישנה נשארת ב-data/taxKnowledge.ts; ערך מהמרשם נשאר ב-taxRules/rules.ts.
//   כך כל ערך מתוחזק במקום אחד, גם כשהוא מוצג בשני תחומים (shared).
// ‼ שורה ישנה שיש לה כבר ערך במרשם הכללים — לא מוצגת שוב (COVERED_ELSEWHERE), כדי שלא יהיו שני מספרים לאותו דבר.
// ‼ טהור — נבדק ב-node.

import { KNOWLEDGE_TOPICS, type KnowledgeTopic, type KnowledgeValue } from '../../data/taxKnowledge';
import { getRule } from '../taxRules/registry';
import type { DomainId } from '../taxArea/areaModel';

export type ValueRef =
  /** ערך ממרשם הכללים — מוצג עם הביסוס שלו לשנה. */
  | { kind: 'rule'; id: string; shared?: true }
  /** שורה מטבלת הערכים הישנה, כמו שהיא (תגים, הערה, סעיף). shared = הבית שלה בתחום אחר, וכאן היא מוצגת מאותו מקור. */
  | { kind: 'legacy'; group: string; key: string; shared?: true };

export interface ValueGroup {
  id: string;
  title: string;
  subtitle?: string;
  refs: ValueRef[];
  /** הערה קבועה לקבוצה — למשל «לא במרשם הכללים». */
  note?: string;
  insights?: string[];
  sources?: { label: string; url: string }[];
}

const L = (group: string, key: string, shared?: true): ValueRef => (shared ? { kind: 'legacy', group, key, shared } : { kind: 'legacy', group, key });
const R = (id: string): ValueRef => ({ kind: 'rule', id });
const legacyGroup = (id: string): KnowledgeTopic => {
  const g = KNOWLEDGE_TOPICS.find(t => t.id === id);
  if (!g) throw new Error(`no legacy group ${id}`);
  return g;
};
const all = (group: string, except: string[] = []) => legacyGroup(group).values.filter(v => !except.includes(v.key)).map(v => L(group, v.key));
const from = (group: string) => ({ insights: legacyGroup(group).insights, sources: legacyGroup(group).sources });

// ‼ סדר הקבוצות בתחום = סדר ההצגה. הסדר בתוך קבוצה = סדר השורות במקור, אלא אם נאמר אחרת.
export const DOMAIN_VALUES: Record<DomainId, ValueGroup[]> = {
  annual: [
    { id: 'capital', title: 'שיעורי מס על הכנסות הון', subtitle: 'רווח הון, דיבידנד וריבית — ליחיד',
      refs: [R('cap.gain.realRate'), R('cap.dividend.regularRate'), R('cap.dividend.substantialRate'), R('cap.interest.unlinkedRate'), R('cap.interest.linkedRealRate'), R('cap.interest.ownCompany')] },
    { id: 'reportDuty', title: 'מי חייב בדוח שנתי', subtitle: 'ספים שמחייבים הגשה',
      refs: [L('deadlines', 'annualThreshold'), R('core.foreignAssetsReport'), R('core.securitiesTurnoverReport')],
      sources: legacyGroup('deadlines').sources },
  ],
  credits: [
    { id: 'workGrant', title: legacyGroup('workGrant').title, subtitle: legacyGroup('workGrant').subtitle, refs: all('workGrant'), ...from('workGrant') },
  ],
  salary: [
    { id: 'car', title: legacyGroup('car').title, subtitle: legacyGroup('car').subtitle, refs: all('car'), ...from('car') },
    { id: 'payroll', title: 'שכר, ריבית וניכויים', subtitle: 'שכר מינימום, ריבית על הלוואה מהמעביד, ודיווח ניכויים',
      refs: [L('expenses', 'minWage'), L('expenses', 'interest3'), L('deadlines', 'withholding102')],
      sources: legacyGroup('expenses').sources },
  ],
  savings: [
    { id: 'retirement', title: legacyGroup('retirement').title, subtitle: legacyGroup('retirement').subtitle, refs: all('retirement'), ...from('retirement') },
    // ‼ שתי השורות האלה הוסתרו עם הקבוצה כולה כשפנסיה וקרן השתלמות עברו לנושאים (10.10) — אבל אין להן ערך במרשם.
    //   מוצגות כמו שהן, עם ההערה; לא «אומתו» מחדש בהעברה.
    { id: 'pensionExtra', title: 'תקרות שעוד לא במרשם הכללים', subtitle: 'מהטבלה הקודמת של פנסיה וגמל',
      note: 'השורות האלה לא עברו לנושאי הלימוד ולמרשם הכללים, ולכן אין להן ביסוס לכל ערך. לא נבדקו מחדש בהעברה — לאמת לפני שימוש.',
      refs: [L('pension', 'sec47Ceiling'), L('pension', 'severanceEmployer')], sources: legacyGroup('pension').sources },
  ],
  ni: [],
  advances: [
    { id: 'dueDays', title: 'מועדי תשלום מקדמות', refs: [R('it.advances.dueDay'), R('ni.advances.dueDay')] },
  ],
  business: [
    { id: 'vat', title: legacyGroup('vat').title, subtitle: legacyGroup('vat').subtitle, refs: all('vat'), ...from('vat') },
    { id: 'monthlyDeadlines', title: 'מועדי דיווח חודשיים', refs: [L('deadlines', 'vatAdvances15'), L('deadlines', 'pcn')], sources: legacyGroup('deadlines').sources },
    { id: 'expenseAmounts', title: 'סכומים בהוצאות מוכרות', subtitle: 'הסבר מלא לכל הוצאה — בכלי «הוצאות מוכרות»',
      refs: [L('expenses', 'gifts'), L('expenses', 'refreshments'), L('expenses', 'lodgingAbroad'), L('expenses', 'otherAbroad')] },
  ],
  companies: [
    { id: 'company', title: legacyGroup('company').title, subtitle: legacyGroup('company').subtitle,
      refs: [...all('company'), L('expenses', 'interest3', true)], ...from('company') },
  ],
  rent: [
    // ‼ «פטור שכ״ד למגורים» — מהמרשם (core.rentalExemption), במקום השורה הישנה שחזרה על אותו מספר.
    { id: 'realEstate', title: legacyGroup('realEstate').title, subtitle: legacyGroup('realEstate').subtitle,
      refs: [...all('realEstate', ['rentExempt']), R('core.rentalExemption'), L('deadlines', 'rent10')], ...from('realEstate') },
  ],
  wealth: [],
  reference: [],
};

/** שורות ישנות שלא מוצגות, כי יש להן כבר בית — עם מה שמכסה אותן. נבדק שכל שורה ישנה נמצאת או כאן או בבית אחד. */
export const COVERED_ELSEWHERE: Record<string, string> = {
  'pension.qualifyingSalary': 'rule:pen.qualifying.work',
  'pension.creditRate': 'rule:pen.credit.rate',
  'pension.beneficialCeiling': 'rule:pen.credit.extraCeiling',
  'pension.mandatory': 'rule:pen.mandatory.rates',
  'studyFund.seCeiling': 'rule:sf.se.ceiling',
  'studyFund.seExemptDeposit': 'rule:sf.se.exemptDeposit',
  'studyFund.salaryCeiling': 'rule:sf.mixed.maxDeterminingSalary',
  'realEstate.rentExempt': 'rule:core.rentalExemption',
  'deadlines.exemptDecl': 'legacy:vat.exemptDecl',
};
// ‼ התובנות של «פנסיה וגמל» ו«קרן השתלמות» הישנות — מכוסות בנושאי הלימוד (פנסיה לעצמאי, קרן השתלמות), ולא מוצגות.

/** לוח מועדים רוחבי — כל שורות המועדים, כל אחת עם התחום שבו היא חיה. ‼ אותן שורות, לא העתק. */
export const DEADLINE_HOME: Record<string, DomainId> = {
  vatAdvances15: 'business', withholding102: 'salary', pcn: 'business', rent10: 'rent', exemptDecl: 'business', annualThreshold: 'annual',
};

export function legacyRow(group: string, key: string): KnowledgeValue | undefined {
  return KNOWLEDGE_TOPICS.find(t => t.id === group)?.values.find(v => v.key === key);
}

/** הערך של שורה ישנה לשנה — יש רק 2025 ו-2026; לשנה אחרת undefined (ומוצג «אין ערך לשנה זו»). */
export function legacyValueFor(v: KnowledgeValue, year: number): string | undefined {
  return year === 2025 ? v.value2025 : year === 2026 ? v.value2026 : undefined;
}

export function refLabel(r: ValueRef): string {
  return r.kind === 'rule' ? getRule(r.id)?.label ?? r.id : legacyRow(r.group, r.key)?.label ?? `${r.group}.${r.key}`;
}

export const valueGroupsOf = (d: DomainId): ValueGroup[] => DOMAIN_VALUES[d] ?? [];
export const valueGroup = (d: DomainId, id: string): ValueGroup | undefined => valueGroupsOf(d).find(g => g.id === id);
export const valueCount = (g: ValueGroup) => g.refs.length;

export interface ValueHit { domain: DomainId; group: string; groupTitle: string; label: string }
/** חיפוש בערכים — כדי ש«מס רכישה» ימצא את «שכר דירה ונדל״ן» גם בלי לדעת איפה הערך גר. */
// ‼ כל המילים חייבות להופיע (לא «אחת מהן») — אחרת «מס רכישה» מחזיר כל ערך שיש בו «מס».
//   שורה שמתאימה — תוצאה משלה; קבוצה שרק הכותרת שלה מתאימה — תוצאה אחת לקבוצה, לא שורה לכל ערך בה.
export function searchValues(words: string[]): ValueHit[] {
  if (!words.length) return [];
  const all = (t: string) => words.every(w => t.includes(w));
  const out: ValueHit[] = [];
  for (const [d, groups] of Object.entries(DOMAIN_VALUES) as [DomainId, ValueGroup[]][]) {
    for (const g of groups) {
      const rows = g.refs.filter(r => !r.shared).map(refLabel).filter(all);
      for (const label of rows) out.push({ domain: d, group: g.id, groupTitle: g.title, label });
      if (rows.length === 0 && all(`${g.title} ${g.subtitle ?? ''}`)) out.push({ domain: d, group: g.id, groupTitle: g.title, label: g.title });
    }
  }
  return out;
}

/** «ערכים לפי נושא» הישן ← לאן עברה כל קבוצה (לקישור ישן ולהסבר בדף הבית). */
export const MOVED_GROUPS: { from: string; domain: DomainId; group?: string; item?: string }[] = [
  { from: 'פרישה ופיצויים', domain: 'savings', group: 'retirement' },
  { from: 'מע"מ ועוסקים', domain: 'business', group: 'vat' },
  { from: 'מס חברות, דיבידנד ורווחים כלואים', domain: 'companies', group: 'company' },
  { from: 'מקרקעין', domain: 'rent', group: 'realEstate' },
  { from: 'שווי שימוש ברכב', domain: 'salary', group: 'car' },
  { from: 'הוצאות מוכרות ושכר · הוצאות', domain: 'business', group: 'expenseAmounts' },
  { from: 'הוצאות מוכרות ושכר · שכר וריבית', domain: 'salary', group: 'payroll' },
  { from: 'מענק עבודה', domain: 'credits', group: 'workGrant' },
  { from: 'לוח מועדי דיווח', domain: 'reference', item: 'deadlines' },
];
