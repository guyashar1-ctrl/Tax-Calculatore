// ─── הערכת מס: מהרו״ה לצפי ולהתאמות (27.10.2026, הדמיה מאושרת docs/proposals/2026-10-27-tax-estimate.html) ───────
// ‼ ארבעה שלבים: שאלון ← רו״ה מפייפרלס ← הצפי של הלקוח ← הערכה והמלצה. הקובץ הזה טהור: מהטיוטה ומהתשובות
//   נגזרים הצפי וההתאמות בכל חישוב — לא נשמרים בנפרד ולא נערכים ביד (כלל «היטל אינו מקור אמת»).
// ‼ הצפי הוא של הלקוח: המערכת מציעה לפי הקצב (ממוצע חודשי), והוא מאשר או קובע לכל חודש שנשאר. עד שענה —
//   החישוב לפי הקצב, מסומן כך. ההוצאות שהלקוח רואה — כמו בספרים; ההתאמות חלות על הצפי שאישר, רק במשרד.
import type { YearFact } from '../taxYear/types';
import type { Client } from '../../types';
import type { Adjustment, EstimateDraft, IncomeLine } from './types';
import { recognizedOf, ruleFor } from './adjustmentRules';
import { businessSituationOf } from '../../utils/businessSituation';
import { cardAdvances } from './prefill';

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
  /** 30.10.2026 · עסק חדש: החודש שבו מתחיל (YYYY-MM). */
  start?: string;
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

// ── 30.10.2026 · הערכת מס פשוטה (docs/proposals/2026-10-30-tax-estimate-simple.html) ─────────────────────────────
// ‼ גם אלה נגזרים בכל חישוב מהתשובות — לא נשמרים ביד: משכורת בערך, ביטוח לאומי בערך, ועסק חדש.

/** תשובה אחרונה לפריט ולאדם (ממתינה או מאושרת — נכנסת לבד). */
function latest(facts: YearFact[], itemKey: string, role: string): YearFact | undefined {
  return facts.filter(f => f.itemKey === itemKey && f.subjectRole === role && f.answer === 'value' && (f.status === 'accepted' || f.status === 'pending'))
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))[0];
}

/**
 * עסק חדש — המשרד פותח את התיקים (מצב העסק בכרטיס), עוד אין מקדמות במס הכנסה ואין רו״ה. המקדמות נקבעות לשנה מלאה של העסק:
 * המקדמה היא אחוז מהמחזור, ולכן השנה המלאה נותנת את השיעור הנכון; בב״ל — הסכום לחודש.
 */
export function isNewBusiness(client: Pick<Client, 'businessTransfer' | 'hasPreviousAccountant' | 'pitAdvancePercent'>, draft: Pick<EstimateDraft, 'lines'>): boolean {
  return businessSituationOf(client) === 'new' && client.pitAdvancePercent == null && !draft.lines.some(l => l.source === 'business' && l.months?.length);
}

/**
 * שורה נגזרת — במקומה אם כבר קיימת. ‼ הסדר נשמר: גרסה שמורה ונגזרת שוב חייבת לצאת זהה, אחרת «ההמלצה בדף» נראית
 *   כאילו השתנתה (השוואת התוצאות בין הגרסה המאושרת לחישוב שעל המסך).
 */
const upsert = (lines: IncomeLine[], line: IncomeLine) => (lines.some(l => l.id === line.id) ? lines.map(l => (l.id === line.id ? line : l)) : [...lines, line]);

/**
 * 30.10.2026 · «קרא שוב» ליד המקדמה: קריאה מהרשות שבכרטיס, חדשה (או באותו יום) מזו שבטיוטה — נכנסת לחישוב.
 * ‼ מה שנקלט ביד בטיוטה (תקופות 134, תשלומים בב״ל) נשמר; מתעדכנים רק השיעור/המקדמה ומועד הבדיקה.
 */
export function withCardAdvances(draft: EstimateDraft, client: Client): EstimateDraft {
  const card = cardAdvances(client);
  const newer = (c?: { readOn?: string }, d?: { readOn?: string }) => !!c?.readOn && (!d?.readOn || c.readOn >= d.readOn);
  return {
    ...draft,
    ...(card.it && newer(card.it, draft.it) ? { it: { ...draft.it, ...card.it, periods: draft.it.periods } } : {}),
    ...(card.ni && newer(card.ni, draft.ni) ? { ni: { ...draft.ni, ...card.ni } } : {}),
    ...(card.niSpouse && draft.niSpouse && newer(card.niSpouse, draft.niSpouse) ? { niSpouse: { ...draft.niSpouse, ...card.niSpouse } } : {}),
  };
}

/** מהתשובות לטיוטה: משכורת וב״ל בערך, ועסק חדש (שורה, צפי לשנה מלאה, שיטת מקדמה). */
export function withClientAnswers(draft0: EstimateDraft, facts: YearFact[], client: Client, today: string): EstimateDraft {
  const draft = withCardAdvances(draft0, client);
  const cutoff = draft.cutoffMonth;
  let lines = draft.lines;
  for (const p of ['client', 'spouse'] as const) {
    const sal = latest(facts, 'salary.estimate', p);
    const s = ((sal?.value as { items?: { monthly?: unknown; months?: unknown }[] } | undefined)?.items ?? [])[0];
    const monthly = Number(s?.monthly), months = Math.min(12, Math.max(0, Math.round(Number(s?.months))));
    if (sal && monthly > 0 && months > 0) {
      // ‼ התשובה היא «בערך, לשנה» — מתחלקת שווה בין מה שעבר למה שנשאר. משכורת מהתיק בלי סכום — מוחלפת בה
      const year = monthly * months, to = r0((year * cutoff) / 12);
      lines = upsert(lines.filter(l => !(l.source === 'salary' && l.person === p && l.actualToCutoff == null && l.id !== `sal-est-${p}`)), {
        id: `sal-est-${p}`, person: p, source: 'salary', label: 'משכורת', actualToCutoff: to, actualFrom: 'client', actualSource: { factId: sal.id, provenance: 'client' },
        client: { method: 'manual', amount: r0(year - to), assumption: `${monthly.toLocaleString('he-IL')} ₪ בחודש × ${months} חודשים — לפי הלקוח`, at: sal.createdAt?.slice(0, 10) ?? today }, chosen: 'client',
      });
    }
    const ni = latest(facts, 'niBenefits.estimate', p);
    const amt = Number(ni?.value);
    if (ni && amt > 0) {
      lines = upsert(lines, {
        id: `ni-est-${p}`, person: p, source: 'other', label: 'מביטוח לאומי', actualToCutoff: r0(amt), actualFrom: 'client', actualSource: { factId: ni.id, provenance: 'client' },
        client: { method: 'none', assumption: 'מה שהתקבל השנה — לפי הלקוח', at: ni.createdAt?.slice(0, 10) ?? today }, chosen: 'client',
      });
    }
  }
  // ‼ כבר לא עסק חדש (נפתח תיק עם מקדמות, או נקלט רו״ה) — בלי השורה הזמנית ובלי הסימון שנשמר בגרסה קודמת
  if (!isNewBusiness(client, { lines })) return { ...draft, lines: lines.filter(l => l.id !== 'biz-new'), newBusiness: undefined };
  if (!lines.some(l => l.source === 'business')) {
    lines = [...lines, { id: 'biz-new', person: 'client', source: 'business', label: 'העסק החדש', period: { actual: 'out', forecast: 'in' } }];
  }
  let start: string | undefined;
  lines = lines.map(l => {
    if (l.source !== 'business' || l.months?.length) return l;
    const got = forecastAnswerOf(facts, l);
    const a = got?.answer;
    if (a?.start) start = a.start;
    const base = { ...l, actualToCutoff: l.actualToCutoff ?? 0, turnoverToCutoff: l.turnoverToCutoff ?? 0, actualFrom: l.actualFrom ?? ('client' as const) };
    if (!got || a?.incY == null) return base;
    const side = { method: 'manual' as const, amount: r0(a.incY - (a.expY ?? 0)), at: got.at ?? today, assumption: 'שנה מלאה של העסק — לפי הלקוח' };
    return { ...base, client: side, chosen: 'client' as const, turnoverForecast: r0(a.incY) };
  });
  const it = draft.it.method === 'unknown' || draft.it.method === 'none' ? { ...draft.it, method: 'turnoverRate' as const, ratePct: undefined } : draft.it;
  return { ...draft, lines, it, newBusiness: { ...(start ? { start } : {}) } };
}

/** הטיוטה עם הצפי וההתאמות שנגזרים מהרו״ה ומתשובת הלקוח. שורה בלי רו״ה — כמו שהיא. */
export function deriveDraft(draft0: EstimateDraft, facts: YearFact[], today: string, client?: Client): EstimateDraft {
  const draft = client ? withClientAnswers(draft0, facts, client, today) : draft0;
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
