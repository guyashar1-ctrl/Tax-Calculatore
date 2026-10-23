// ─── תחולה בזמן: האם ישות מהתיק שייכת לשנת המס או ליום ההצהרה (13.10.2026) ──────────
// ‼ חוזה משותף לאיסוף, לדוח השנתי, להצהרת ההון ולהערכת המס (docs/TAX-FILE-TEMPORAL-RELEVANCE-2026-10-13.md).
// ‼ לא מנחשים: תאריך חסר ⇒ 'unknown', ושואלים שאלה ממוקדת. «שנה בלבד» אינו 1 בינואר — הוא השנה כולה.
// ‼ מועד בדיקה (fieldMeta.syncedAt) אינו תחולה: אישור היום לא אומר שהנתון היה נכון בשנה קודמת.

import type { YearFact } from './types';

export type DatePrecision = 'day' | 'month' | 'year' | 'approx' | 'unknown';

/** תאריך עם דיוק ידוע. `date` בפורמט YYYY-MM-DD; בדיוק חלקי — היום/החודש הראשונים, ו-precision אומר כמה לסמוך. */
export interface DatedValue { date?: string; precision: DatePrecision; /** A known boundary, without inventing an exact date. */ beforeYear?: number }

/** תקופה שאליה שואלים: שנת מס (1.1–31.12), חלק משנה (הערכה עד החתך) או יום אחד (הצהרת הון / קליטה). */
export interface Period { from: string; to: string }

export const yearPeriod = (y: number): Period => ({ from: `${y}-01-01`, to: `${y}-12-31` });
export const dayPeriod = (iso: string): Period => ({ from: iso, to: iso });

/** הטווח שהתאריך יכול לציין, לפי הדיוק. 'approx' — שנה לכל כיוון; 'unknown' — אין טווח. */
export function dateRange(v: DatedValue | undefined): { lo: string; hi: string } | null {
  if (!v || !v.date || v.precision === 'unknown') return null;
  const y = Number(v.date.slice(0, 4));
  if (!y) return null;
  if (v.precision === 'day') return { lo: v.date, hi: v.date };
  if (v.precision === 'month') {
    const m = Number(v.date.slice(5, 7)) || 1;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const mm = String(m).padStart(2, '0');
    return { lo: `${y}-${mm}-01`, hi: `${y}-${mm}-${String(last).padStart(2, '0')}` };
  }
  if (v.precision === 'year') return { lo: `${y}-01-01`, hi: `${y}-12-31` };
  return { lo: `${y - 1}-01-01`, hi: `${y + 1}-12-31` }; // approx
}

export type Relevance = 'in' | 'out' | 'unknown';

/**
 * האם ישות שהתחילה ב-`start` והסתיימה ב-`end` קיימת בתקופה.
 * ‼ «לא ידוע» כשהתשובה תלויה בתאריך שלא ידוע מספיק: התחלה לא ידועה כשלא ידוע שהסתיימה לפני התקופה,
 *   או טווח של תאריך שחוצה את גבול התקופה.
 * ‼ `startKnownBefore` — בתיק יש סיבה לדעת שהישות קיימת מלפני (למשל דוח קודם שאושר) — לא מנחשים אותה מהיום.
 */
export function relevanceFor(period: Period, start?: DatedValue, end?: DatedValue | 'open'): Relevance {
  const s = dateRange(start);
  const e = end === 'open' ? null : dateRange(end);
  const endOpen = end === 'open' || end === undefined;
  // הסתיים לפני תחילת התקופה — בוודאות
  if (e && e.hi < period.from) return 'out';
  // התחיל אחרי סוף התקופה — בוודאות
  if (s && s.lo > period.to) return 'out';
  // התחלה ידועה כמוקדמת לסוף התקופה, וסיום ידוע כמאוחר לתחילתה (או שעדיין פעיל) ⇒ בתקופה
  const startOk = !!s && s.hi <= period.to;
  const endOk = endOpen ? (end === 'open') : !!e && e.lo >= period.from;
  if (startOk && endOk) return 'in';
  return 'unknown';
}

// ── מהכרטיס ────────────────────────────────────────────────────────────────────
// ‼ השדות בכרטיס נוצרו לאורך שנים בלי דיוק: purchaseYear (שנה), startDate (תאריך מלא, לפעמים רק שנה),
//   closedYear (שנה). הממירים כאן לא מוסיפים מידע — רק מתרגמים את מה שיש לדיוק המתאים.

const fromYear = (y?: number): DatedValue | undefined => (y ? { date: `${y}-01-01`, precision: 'year' } : undefined);
const fromIso = (iso?: string, precision?: DatePrecision): DatedValue | undefined => {
  if (!iso) return undefined;
  if (/^\d{4}$/.test(iso)) return { date: `${iso}-01-01`, precision: 'year' };
  if (/^\d{4}-\d{2}$/.test(iso)) return { date: `${iso}-01`, precision: 'month' };
  return { date: iso.slice(0, 10), precision: precision ?? 'day' };
};

export interface EntitySpan { start?: DatedValue; end?: DatedValue | 'open' }

type PropertyLike = { purchaseYear?: number; purchaseDate?: string; purchasePrecision?: DatePrecision; soldDate?: string; soldPrecision?: DatePrecision; isSold?: boolean };
type AccountLike = { openedDate?: string; openedPrecision?: DatePrecision; isClosed?: boolean; closedYear?: number; closedDate?: string };
type EmployerLike = { startDate?: string; endDate?: string };
type BusinessLike = { startYear?: number; isClosed?: boolean; closedYear?: number };

export function propertySpan(p: PropertyLike): EntitySpan {
  const start = fromIso(p.purchaseDate, p.purchasePrecision) ?? fromYear(p.purchaseYear);
  // ‼ נכס שסומן «נמכר» בלי תאריך — הסיום לא ידוע (לא «פתוח» ולא «היום»)
  const end: EntitySpan['end'] = p.soldDate ? fromIso(p.soldDate, p.soldPrecision) : p.isSold ? { precision: 'unknown' } : 'open';
  return { start, end };
}
export function accountSpan(a: AccountLike): EntitySpan {
  const start = fromIso(a.openedDate, a.openedPrecision);
  const end: EntitySpan['end'] = a.closedDate ? fromIso(a.closedDate) : a.isClosed ? (fromYear(a.closedYear) ?? { precision: 'unknown' }) : 'open';
  return { start, end };
}
export function employerSpan(e: EmployerLike): EntitySpan {
  return { start: fromIso(e.startDate), end: e.endDate ? fromIso(e.endDate) : 'open' };
}
export function businessSpan(b: BusinessLike): EntitySpan {
  return { start: fromYear(b.startYear), end: b.isClosed ? (fromYear(b.closedYear) ?? { precision: 'unknown' }) : 'open' };
}

/**
 * התשובה של הלקוח (או המשרד) לשאלת התחולה של ישות (`period.<kind>`) — גוברת על הכרטיס לתקופה הזו.
 * ‼ רק עובדה מאושרת או ממתינה לאותה ישות ולאותה שנה; 'unsure' לא סוגר כלום.
 */
export function answeredRelevance(facts: YearFact[], itemKey: string, entityRef: string, taxYear: number): Relevance | null {
  const f = facts.filter(x => x.itemKey === itemKey && x.entityRef === entityRef && x.taxYear === taxYear && (x.status === 'accepted' || x.status === 'pending'))
    .sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === 'accepted' ? -1 : 1))[0];
  if (!f) return null;
  if (f.answer === 'no' || f.answer === 'not_applicable') return 'out';
  const v = (f.value ?? {}) as { inPeriod?: string };
  if (v.inPeriod === 'all' || v.inPeriod === 'part') return 'in';
  if (v.inPeriod === 'after' || v.inPeriod === 'before') return 'out';
  return null;
}

/** הישות קיימת בתקופה? תשובה מפורשת לתקופה גוברת; אחרת — מהכרטיס. */
export function entityRelevance(period: Period, span: EntitySpan, explicit: Relevance | null): Relevance {
  return explicit ?? relevanceFor(period, span.start, span.end);
}

/** תיאור קצר לתחולה — לשורות «זה מה שידוע לנו» ולמשרד. */
export function spanText(span: EntitySpan, words: { from: string; to: string }): string {
  const fmt = (v?: DatedValue) => {
    if (!v || !v.date || v.precision === 'unknown') return '';
    const [y, m, d] = v.date.split('-');
    if (v.precision === 'year') return y;
    if (v.precision === 'approx') return `בערך ${y}`;
    if (v.precision === 'month') return `${m}/${y}`;
    return `${d}.${m}.${y}`;
  };
  const s = fmt(span.start);
  const e = span.end === 'open' || !span.end ? '' : fmt(span.end) || 'תאריך לא ידוע';
  return [s && `${words.from} ${s}`, e && `${words.to} ${e}`].filter(Boolean).join(' · ');
}

/** התקופה שאליה שואלים — לפי תכלית הבקשה. */
export function periodOfRequest(purpose: 'estimate' | 'annual' | 'wealth' | 'intake', taxYear: number, opts: { cutoffMonth?: number; asOfDate?: string }): Period {
  if ((purpose === 'wealth' || purpose === 'intake') && opts.asOfDate) return dayPeriod(opts.asOfDate);
  if (purpose === 'estimate') {
    const m = opts.cutoffMonth ?? 12;
    const last = new Date(Date.UTC(taxYear, m, 0)).getUTCDate();
    return { from: `${taxYear}-01-01`, to: `${taxYear}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}` };
  }
  return yearPeriod(taxYear);
}

/** «בשנת 2025» / «ביום 31.12.2025» — לשאלות. */
export function periodWords(p: Period): string {
  if (p.from === p.to) return `ביום ${p.to.split('-').reverse().join('.')}`;
  if (p.from.endsWith('-01-01') && p.to.endsWith('-12-31') && p.from.slice(0, 4) === p.to.slice(0, 4)) return `בשנת ${p.from.slice(0, 4)}`;
  return `בין ${p.from.split('-').reverse().join('.')} ל-${p.to.split('-').reverse().join('.')}`;
}

