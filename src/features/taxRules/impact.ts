// ─── השפעה של שינוי בכלל ─────────────────────────────────────────────────────
// שני כיוונים:
//   ruleUsage      — כלל השתנה: איפה הוא בשימוש (נושאים, חישובים, שדות 1301).
//   reviewNeeded   — תוצאה שמורה (הערכה שאושרה, תשובה שחושבה): האם משהו
//                    שנכנס אליה השתנה מאז. ‼ מחזיר הסבר בלבד — לא מחשב מחדש
//                    ולא משנה את מה שאושר. ההחלטה לחשב מחדש היא של המשרד.

import { RULES } from './rules';
import { SOURCES } from './sources';
import { ruleView, formatRuleValue, BASIS_LABEL } from './registry';
import { CALC_RULES } from './calc';
import type { UsedRule } from './types';
import { TOPICS, FIELD_MAP_SOURCE, type Form1301Ref } from '../taxKnowledge/topics';
import { AVAILABLE, type Availability } from '../taxKnowledge/availability';

export interface RuleUsage {
  ruleId: string;
  topics: { id: string; title: string }[];
  calcs: { id: string; label: string }[];
  /** שדות 1301 שהנושאים המושפעים מפנים אליהם, ושנת המיפוי שלהם. */
  form1301: (Form1301Ref & { topicId: string; mapSourceId: string })[];
  /** רכיבים נוספים שנשענים על הכלל ואינם נושא, חישוב רשום או שדה (מנוע, תיק המס, שאלונים, ב״ל). */
  consumers: RuleConsumer[];
}

export type ConsumerKind = 'knowledge' | 'lesson' | 'engine' | 'taxFile' | 'questionnaire' | 'form1301' | 'ni';
/** requires — רכיב שקיים רק כשהיכולת שוחררה (בשחרור הידע אין מנוע הערכה ושנות מס). */
export interface RuleConsumer { kind: ConsumerKind; path: string; what: string; requires?: keyof Availability }

export const CONSUMER_KIND_LABEL: Record<ConsumerKind, string> = {
  knowledge: 'דף ידע', lesson: 'שיעור', engine: 'מנוע הערכת מס', taxFile: 'תיק המס', questionnaire: 'שאלון', form1301: 'מפת 1301', ni: 'ביטוח לאומי',
};

/**
 * מי עוד נשען על כללים — לפי קידומת המזהה. ‼ ruleUsage מוצא רק נושאים, CALC_RULES ושדות 1301;
 * מנוע ההערכה, תיק המס והשאלונים קוראים את הכללים בעקיפין, ולכן נרשמים כאן ביד.
 * עסק זעיר: docs/tax-foundation/micro/micro-business-research-2026-10-11.md, סעיף 5.
 */
export const RULE_CONSUMERS: { prefix: string; consumers: RuleConsumer[] }[] = [
  { prefix: 'micro.', consumers: [
    { kind: 'knowledge', path: 'src/features/taxKnowledge/topics/MicroBusinessBody.tsx', what: 'דף העסק הזעיר: מחשבון, דוגמאות פתורות, טבלת מצבים ותהליך המשרד' },
    { kind: 'lesson', path: 'src/features/taxKnowledge/topics/lessonsMore.ts', what: 'MICRO_LESSON: בקצרה, מושגים, טעויות ותרגול' },
    { kind: 'engine', path: 'src/features/taxEstimate/engine.ts', what: 'מסלול עסק זעיר בהערכה: המחזור פחות הניכוי, בלי 47א, 87ד(ג) וצינון', requires: 'taxEstimate' },
    { kind: 'taxFile', path: 'src/features/taxYear/', what: 'מצב העסק הזעיר לשנה: רישום ותאריכו, סוג תיק, מסלול שנבחר, היסטוריית ניכוי ושנות צינון', requires: 'taxYear' },
    { kind: 'questionnaire', path: 'src/features/taxYear/catalog.ts', what: 'business.microRegistration, business.microTrack, business.microExclusions, business.microCoordination', requires: 'taxYear' },
    { kind: 'form1301', path: 'src/features/taxForms/form1301.ts', what: 'סימוני חלק א׳ סעיף 4, 238/239 מול התקרה, 150, חסימת 030/089; גם coverage1301.ts (F010, F011)' },
    { kind: 'ni', path: 'src/features/nationalInsurance/', what: 'בסיס דמי הביטוח לעסק זעיר: ההכנסה בשומה, בלי 47א (פרשנות)' },
  ] },
];

export function ruleUsage(ruleId: string): RuleUsage {
  const topics = TOPICS.filter(t => t.ruleIds.includes(ruleId));
  return {
    ruleId,
    topics: topics.map(t => ({ id: t.id, title: t.title })),
    calcs: Object.entries(CALC_RULES).filter(([, c]) => c.ruleIds.includes(ruleId)).map(([id, c]) => ({ id, label: c.label })),
    form1301: topics.flatMap(t => t.form1301.map(f => ({ ...f, topicId: t.id, mapSourceId: FIELD_MAP_SOURCE }))),
    consumers: RULE_CONSUMERS.filter(c => ruleId.startsWith(c.prefix)).flatMap(c => c.consumers).filter(c => !c.requires || AVAILABLE[c.requires]),
  };
}

export type ReviewKind = 'valueChanged' | 'basisChanged' | 'sourceChanged' | 'exactYearPublished' | 'ruleRemoved';

export interface ReviewReason {
  kind: ReviewKind;
  ruleId: string;
  taxYear: number;
  /** משפט בעברית למשרד: מה השתנה ומה זה אומר. */
  text: string;
}

const show = (v: number | string | null, unit?: string) =>
  v === null ? '—' : typeof v === 'string' ? (v.length > 60 ? v.slice(0, 60) + '…' : v) : unit === 'rate' ? +(v * 100).toFixed(2) + '%' : v.toLocaleString('he-IL');

/**
 * מה השתנה מאז שהתוצאה נשמרה. רשימה ריקה = אין צורך בבדיקה.
 * ‼ לא נוגע בתוצאה עצמה. המסך מציג «נדרשת בדיקה» עם ההסבר.
 */
export function reviewNeeded(saved: readonly UsedRule[]): ReviewReason[] {
  const out: ReviewReason[] = [];
  for (const u of saved) {
    const rule = RULES[u.ruleId];
    if (!rule) { out.push({ kind: 'ruleRemoved', ruleId: u.ruleId, taxYear: u.taxYear, text: `הכלל «${u.ruleId}» כבר לא במרשם — לבדוק אם התוצאה עדיין נכונה.` }); continue; }
    const now = ruleView(u.ruleId, u.requestedYear);
    const e = now?.entry;
    // ערך לשנה עצמה פורסם אחרי שהתוצאה נשמרה על ערך של שנה קודמת.
    if (u.taxYear !== u.requestedYear && now?.exactYear && e) {
      out.push({ kind: 'exactYearPublished', ruleId: u.ruleId, taxYear: u.requestedYear, text: `«${rule.label}»: התוצאה נשמרה לפי ערך ${u.taxYear}; עכשיו יש ערך ל-${u.requestedYear} (${formatRuleValue(now)}).` });
      continue;
    }
    const sameYear = rule.values.find(v => v.taxYear === u.taxYear);
    if (!sameYear) { out.push({ kind: 'ruleRemoved', ruleId: u.ruleId, taxYear: u.taxYear, text: `«${rule.label}»: הערך לשנת ${u.taxYear} שעליו נשענה התוצאה הוסר מהמרשם.` }); continue; }
    if (sameYear.value !== u.value) {
      out.push({ kind: 'valueChanged', ruleId: u.ruleId, taxYear: u.taxYear, text: `«${rule.label}» לשנת ${u.taxYear}: ${show(u.value, rule.unit)} ← ${show(sameYear.value, rule.unit)}.` });
    } else if (sameYear.basis !== u.basis) {
      out.push({ kind: 'basisChanged', ruleId: u.ruleId, taxYear: u.taxYear, text: `«${rule.label}» לשנת ${u.taxYear}: הערך לא השתנה, הביסוס השתנה — ${BASIS_LABEL[u.basis]} ← ${BASIS_LABEL[sameYear.basis]}.` });
    } else if (u.sourceId && sameYear.sourceId !== u.sourceId) {
      out.push({ kind: 'sourceChanged', ruleId: u.ruleId, taxYear: u.taxYear, text: `«${rule.label}» לשנת ${u.taxYear}: אותו ערך, ממקור אחר — ${SOURCES[sameYear.sourceId]?.label ?? sameYear.sourceId}.` });
    }
  }
  return out;
}

/** האם שינוי מחייב בדיקה מקצועית (ערך או שנה) או שהוא לידיעה בלבד (מקור/ביסוס). */
export function reviewSeverity(reasons: readonly ReviewReason[]): 'none' | 'info' | 'review' {
  if (reasons.length === 0) return 'none';
  return reasons.some(r => r.kind === 'valueChanged' || r.kind === 'exactYearPublished' || r.kind === 'ruleRemoved') ? 'review' : 'info';
}
