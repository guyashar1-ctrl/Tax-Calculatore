// ─── הערכת מס: מהרו״ה לצפי ולהתאמות (27.10.2026, הדמיה מאושרת docs/proposals/2026-10-27-tax-estimate.html) ───────
// ‼ ארבעה שלבים: שאלון ← רו״ה מפייפרלס ← הצפי של הלקוח ← הערכה והמלצה. הקובץ הזה טהור: מהטיוטה ומהתשובות
//   נגזרים הצפי וההתאמות בכל חישוב — לא נשמרים בנפרד ולא נערכים ביד (כלל «היטל אינו מקור אמת»).
// ‼ הצפי הוא של הלקוח: המערכת מציעה לפי הקצב (ממוצע חודשי), והוא מאשר או קובע לכל חודש שנשאר. עד שענה —
//   החישוב לפי הקצב, מסומן כך. ההוצאות שהלקוח רואה — כמו בספרים; ההתאמות חלות על הצפי שאישר, רק במשרד.
import type { YearFact } from '../taxYear/types';
import type { Adjustment, EstimateDraft, IncomeLine } from './types';
import { recognizedOf, ruleFor } from './adjustmentRules';

export const FORECAST_ITEM = 'business.forecastMonths';
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const r0 = (n: number) => Math.round(n);
/** הצעה ללקוח — מעוגלת לאלף (המספר שהוא רואה ומאשר). */
export const r1000 = (n: number) => Math.round(n / 1000) * 1000;

/** תשובת הלקוח לבקשת הצפי — רשומה אחת ('record'). incM/expM — לכל חודש שנשאר, מהחודש שאחרי החתך. */
export interface ForecastAnswer {
  incA: 'ok' | 'chg';
  expA?: 'ok' | 'chg';
  incM?: number[];
  expM?: number[];
  /** עסק חדש (בלי חודשים בפועל): סכום לשנה. */
  incY?: number;
  expY?: number;
}

/** החודשים בפועל עד החתך — רק מה שנקלט. */
export function actualMonths(line: IncomeLine, cutoff: number) {
  return (line.months ?? []).filter(x => x.m >= 1 && x.m <= cutoff).sort((a, b) => a.m - b.m);
}

/** הקצב: ממוצע חודשי מהחודש הראשון עם נתונים ועד החתך (עסק שנפתח באמצע — רק החודשים שלו). */
export function pace(line: IncomeLine, cutoff: number): { income: number; expenses: number; months: number } | null {
  const ms = actualMonths(line, cutoff);
  const first = ms.find(x => x.income != null || x.expenses != null)?.m;
  if (!first) return null;
  const n = cutoff - first + 1;
  return { income: sum(ms.map(x => x.income ?? 0)) / n, expenses: sum(ms.map(x => x.expenses ?? 0)) / n, months: n };
}

/** ההצעה ללקוח לכל חודש שנשאר (לפי הקצב, מעוגל לאלף). */
export function suggestedMonths(line: IncomeLine, cutoff: number): { inc: number[]; exp: number[] } | null {
  const p = pace(line, cutoff);
  if (!p) return null;
  const rest = Math.max(0, 12 - cutoff);
  return { inc: Array(rest).fill(r1000(p.income)), exp: Array(rest).fill(r1000(p.expenses)) };
}

/** התשובה האחרונה של הלקוח לשורה (ממתינה או מאושרת — נכנסת לבד). */
export function forecastAnswerOf(facts: YearFact[], line: IncomeLine): { answer: ForecastAnswer; factId: string; at?: string } | null {
  const f = facts
    .filter(x => x.itemKey === FORECAST_ITEM && (x.status === 'accepted' || x.status === 'pending') && (!line.entityRef || !x.entityRef || x.entityRef === line.entityRef))
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))[0];
  const item = ((f?.value as { items?: unknown[] } | undefined)?.items ?? [])[0] as ForecastAnswer | undefined;
  return f && item && (item.incA === 'ok' || item.incA === 'chg') ? { answer: item, factId: f.id, at: f.createdAt?.slice(0, 10) } : null;
}

/** מהתשובה לצפי בפועל: הכנסות והוצאות (לפי הספרים) לחודשים שנשארו. */
export function forecastFromAnswer(line: IncomeLine, cutoff: number, a: ForecastAnswer): { income: number; expenses: number } | null {
  const s = suggestedMonths(line, cutoff);
  if (!s) return a.incY != null ? { income: a.incY, expenses: a.expY ?? 0 } : null;
  const p = pace(line, cutoff)!;
  const rest = Math.max(0, 12 - cutoff);
  const inc = a.incA === 'chg' && a.incM?.length === rest ? sum(a.incM) : p.income * rest;
  const exp = a.expA === 'chg' && a.expM?.length === rest ? sum(a.expM) : p.expenses * rest;
  return { income: inc, expenses: exp };
}

/**
 * ההתאמות לפי הנוהל — לכל קטגוריית הוצאה שיש לה כלל. לשנה: ההתאמה עד החתך מוכפלת באותו יחס כמו ההוצאות
 * (עד החתך ← לשנה), כי הצפי נשען על אותן הוצאות.
 */
export function adjustmentRows(line: IncomeLine, cutoffMonth: number) {
  return (line.bookCategories ?? []).map(c => {
    const rule = ruleFor(c.label);
    const recognized = rule ? recognizedOf(rule, c.toCutoff, cutoffMonth) : r0(c.toCutoff);
    return { label: c.label, book: r0(c.toCutoff), adj: r0(c.toCutoff) - recognized, recognized, rule };
  });
}

/** הטיוטה עם הצפי וההתאמות שנגזרים מהרו״ה ומתשובת הלקוח. שורה בלי רו״ה — כמו שהיא. */
export function deriveDraft(draft: EstimateDraft, facts: YearFact[], today: string): EstimateDraft {
  const cutoff = draft.cutoffMonth;
  const rest = Math.max(0, 12 - cutoff);
  let adjustments = draft.adjustments.filter(a => !a.auto);
  const lines = draft.lines.map(l => {
    if (l.source !== 'business' || !l.months?.length) return l;
    const p = pace(l, cutoff);
    const got = forecastAnswerOf(facts, l);
    const fc = got ? forecastFromAnswer(l, cutoff, got.answer) : p ? { income: p.income * rest, expenses: p.expenses * rest } : null;
    // ‼ ההתאמות: עד החתך מהקטגוריות; לשנה — באותו יחס כמו ההוצאות בספרים
    const ms = actualMonths(l, cutoff);
    const expToCutoff = sum(ms.map(x => x.expenses ?? 0));
    const factor = expToCutoff > 0 && fc ? (expToCutoff + fc.expenses) / expToCutoff : 1;
    for (const r of adjustmentRows(l, cutoff)) {
      if (!r.rule || r.adj === 0) continue;
      // ‼ קטגוריה שכבר יש לה תיאום ידני — לא מתאמים פעמיים (types.ts › Adjustment)
      if (adjustments.some(a => a.lineId === l.id && a.bookCategory === r.label)) continue;
      const a: Adjustment = { id: `auto-${l.id}-${r.label}`, person: l.person, lineId: l.id, bookCategory: r.label, amount: r0(r.adj * factor),
        reason: `${r.rule.label} — לפי הנוהל`, auto: { rule: r.rule.id, bookToCutoff: r.book, adjToCutoff: r.adj } };
      adjustments = [...adjustments, a];
    }
    if (!fc || rest === 0) return l;
    const side = { method: 'manual' as const, amount: r0(fc.income - fc.expenses), at: got?.at ?? today,
      assumption: got ? (got.answer.incA === 'chg' || got.answer.expA === 'chg' ? 'הצפי של הלקוח — שינה' : 'הצפי של הלקוח — אישר') : 'לפי הקצב עד שהלקוח יאשר' };
    return got
      ? { ...l, client: side, chosen: 'client' as const, turnoverForecast: r0(fc.income) }
      : { ...l, office: side, chosen: 'office' as const, turnoverForecast: r0(fc.income) };
  });
  return { ...draft, lines, adjustments };
}

/** הסכומים לכרטיס «הכנסות והוצאות»: עד החתך וצפי לשנה — לפי הספרים, והוצאות מוכרות אחרי ההתאמות. */
export function incomeExpenses(draft: EstimateDraft, line: IncomeLine) {
  const cutoff = draft.cutoffMonth;
  const ms = actualMonths(line, cutoff);
  const incTo = sum(ms.map(x => x.income ?? 0)), expTo = sum(ms.map(x => x.expenses ?? 0));
  const incYear = incTo + (cutoff < 12 ? line.turnoverForecast ?? 0 : 0);
  const profitRest = cutoff < 12 ? (line.chosen ? line[line.chosen]?.amount ?? 0 : 0) : 0;
  const expYear = incYear - (line.actualToCutoff ?? incTo - expTo) - profitRest;
  const adj = sum(draft.adjustments.filter(a => a.lineId === line.id).map(a => a.amount));
  const adjTo = sum(draft.adjustments.filter(a => a.lineId === line.id).map(a => a.auto?.adjToCutoff ?? 0));
  return { incTo, incYear, expTo, expYear, adj, adjTo, recognizedTo: expTo - adjTo, recognizedYear: expYear - adj };
}
