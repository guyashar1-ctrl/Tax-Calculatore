// ─── דמי לידה שחוצים שנת מס — הצעת חלוקה יחסית לפי ימים (16.10.2026) ─────────────────
// ‼ המקור: חוזר 2/2022 §7 וטופס 116ג סעיף 9 (docs/tax-foundation/research/spreading-deferral-continuity-2026-10-16.md §3):
//   ההכנסה **והמס שנוכה** משויכים לכל שנה לפי ימי הזכאות בה, «לבקשת הזכאי/ת». 105 ימים אינם קבועים — לפי התאריכים בפועל.
// ‼ זו הצעה למשרד, לא החלטה: האם לבקש פריסה (וכדאיות — השוואת המס בשתי השנים) — הכרעה של המשרד.
// ‼ הפרשים ששולמו מאוחר — פתוח במחקר; לא מפוצלים כאן אוטומטית.
// ‼ טהור (בלי React) — נבדק ב-node.

import type { YearFact } from './types';

const DAY = 86_400_000;
const utc = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };

/** ימים קלנדריים כולל שני הקצוות (08.12–31.12 = 24). */
export function daysInclusive(from: string, to: string): number {
  return Math.round((utc(to) - utc(from)) / DAY) + 1;
}

/** התקופה חוצה את 31.12 של אחת השנים שבה. */
export function crossesYearEnd(from: string, to: string): boolean {
  return !!from && !!to && from.slice(0, 4) !== to.slice(0, 4) && to >= from;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface MaternitySplit {
  totalDays: number;
  years: { year: number; days: number; amount?: number; tax?: number }[];
}

/**
 * חלוקה יחסית לפי ימים בין השנים שבתקופה. עיגול לעשירית; השנה האחרונה מקבלת את השארית — כך שסך החלקים
 * שווה בדיוק לסכום ולמס שבאישור (דוגמת גיא: 105 ימים, 39,942 ⇒ 9,129.6 + 30,812.4; מס 256 ⇒ 58.5 + 197.5).
 */
export function maternitySplit(from: string, to: string, amount?: number, tax?: number): MaternitySplit | null {
  if (!from || !to || to < from) return null;
  const totalDays = daysInclusive(from, to);
  const y1 = Number(from.slice(0, 4)), y2 = Number(to.slice(0, 4));
  const years: MaternitySplit['years'] = [];
  for (let y = y1; y <= y2; y++) {
    const a = y === y1 ? from : `${y}-01-01`;
    const b = y === y2 ? to : `${y}-12-31`;
    years.push({ year: y, days: daysInclusive(a, b) });
  }
  const share = (total: number | undefined, i: number) => {
    if (total === undefined || !Number.isFinite(total)) return undefined;
    if (i < years.length - 1) return round1(total * years[i].days / totalDays);
    return round1(total - years.slice(0, -1).reduce((s, _, k) => s + round1(total * years[k].days / totalDays), 0));
  };
  years.forEach((x, i) => { x.amount = share(amount, i); x.tax = share(tax, i); });
  return { totalDays, years };
}

type Rec = { items?: Record<string, unknown>[] };
const latest = (facts: YearFact[], key: string, role: string) => facts
  .filter(f => f.itemKey === key && f.subjectRole === role && (f.status === 'accepted' || f.status === 'pending') && f.answer === 'value')
  .sort((a, b) => (b.status === 'accepted' ? 1 : 0) - (a.status === 'accepted' ? 1 : 0) || b.createdAt.localeCompare(a.createdAt))[0];

/** תקופת הזכאות של האדם (מאושרת קודם; אחרת זו שממתינה לבדיקה). */
export function maternityPeriodOf(facts: YearFact[], role: string): { from: string; to: string } | null {
  const r = (latest(facts, 'niBenefits.maternityPeriod', role)?.value as Rec | undefined)?.items?.[0];
  const from = String(r?.from ?? ''), to = String(r?.to ?? '');
  return from && to ? { from, to } : null;
}

/** הסכום והמס מהאישור השנתי (מה שהלקוח מסר או המשרד הזין). */
export function maternityAmountsOf(facts: YearFact[], role: string): { amount?: number; tax?: number } {
  const r = (latest(facts, 'niBenefits.maternityAmounts', role)?.value as Rec | undefined)?.items?.[0];
  const num = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v));
  return { amount: num(r?.amount), tax: num(r?.tax) };
}

/** ההחלטה שנשמרת על פריט הפריסה — בשנה הזו, ועותק «לבדיקה» בשנה השנייה (C26: בלי מנגנון רב-שנתי חדש). */
export interface SpreadDecision {
  decision: 'spread' | 'noSpread';
  from: string; to: string; totalDays: number;
  years: MaternitySplit['years'];
  /** טופס 116ג — הוגש / יצורף לדוח / עוד לא. */
  form116c: 'filed' | 'withReturn' | 'notYet';
  /** השנה השנייה שבה ההחלטה חלה — שם היא מסומנת «לבדיקה». */
  otherYear: number;
  reviewInOtherYear: true;
}
