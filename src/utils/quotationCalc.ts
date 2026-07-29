// ─── חישובי הצעת מחיר: סיכומים לפי תדירות, מע"מ, הנחות ──────────────────────
// כלל מה-PRD: לעולם לא מאחדים חיוב חודשי וחד־פעמי למספר אחד מטעה —
// לכן הסיכומים מוחזרים בנפרד לפי קטגוריה, ולצידם המע"מ של כל קטגוריה.

import type { Quotation, QuotationItem, ServiceCategory } from '../types/quotations';
import { DEFAULT_INSTALLMENTS } from '../types/quotations';

export interface CategoryTotal {
  beforeVat: number;
  vat: number;
  withVat: number;
}

export interface QuotationTotals {
  monthly: CategoryTotal;
  annual: CategoryTotal;
  oneTime: CategoryTotal;
  // מה שהלקוח באמת ישלם בתקופת הפריסה — 5 תשלומים ולא 12, אם נכנס באוגוסט
  monthlyPeriod: CategoryTotal;
  // התשלום החודשי אחרי תום התקופה (שנה מלאה) — כדי שהלקוח לא יופתע בינואר
  monthlyOngoing: CategoryTotal;
  installments: number | null;   // מספר התשלומים; null כשהשורות אינן אחידות
  hasPartialTerm: boolean;       // יש שורה חודשית שאינה 12 תשלומים
  changesAfterPeriod: boolean;   // התשלום החודשי ישתנה בתום התקופה
  totalDiscount: number;      // סך ההנחות שניתנו (לפני מע"מ), לכל הקטגוריות
  vatRate: number;
}

// מחיר שורה סופי לפני מע"מ: מחיר ליחידה × כמות × (1 - הנחה)
export function itemFinalPrice(item: QuotationItem): number {
  const gross = item.clientPrice * (item.quantity || 1);
  const discount = item.discountPercent ? gross * (item.discountPercent / 100) : 0;
  return round2(gross - discount);
}

// ההנחה בשורה כוללת גם דריסת מחיר ידנית מתחת למחיר הקטלוג.
// בשורה שתומחרה שנתית משווים למחיר השנתי ולא לתשלום הבודד — אחרת פריסה של
// 6,000 ₪ לחמישה תשלומים נראית כמו הנחה של 4,800 ₪.
export function itemDiscountAmount(item: QuotationItem): number {
  const qty = item.quantity || 1;
  const catalogGross = item.catalogPrice * qty;
  const discount = item.discountPercent ? 1 - item.discountPercent / 100 : 1;
  const comparable = item.priceBasis === 'annual' && item.annualPrice != null
    ? round2(item.annualPrice * qty * discount)
    : itemFinalPrice(item);
  return round2(Math.max(0, catalogGross - comparable));
}

export function calcTotals(items: QuotationItem[], vatRate: number): QuotationTotals {
  const empty = (): CategoryTotal => ({ beforeVat: 0, vat: 0, withVat: 0 });
  const buckets: Record<'monthly' | 'annual' | 'oneTime', CategoryTotal> = {
    monthly: empty(), annual: empty(), oneTime: empty(),
  };
  const monthlyPeriod = empty();
  const monthlyOngoing = empty();
  const termsSeen = new Set<number>();
  let totalDiscount = 0;

  const add = (t: CategoryTotal, price: number, vat: number) => {
    t.beforeVat = round2(t.beforeVat + price);
    t.vat = round2(t.vat + vat);
    t.withVat = round2(t.withVat + price + vat);
  };

  for (const item of items) {
    const bucket = bucketFor(item.category);
    if (!bucket) continue;    // שירותים "כלולים" (0 ₪) אינם משתתפים בסיכום
    const price = itemFinalPrice(item);
    const vat = item.vatFlag ? round2(price * (vatRate / 100)) : 0;
    add(buckets[bucket], price, vat);
    totalDiscount = round2(totalDiscount + itemDiscountAmount(item));

    if (bucket === 'monthly') {
      const plan = monthlyPlan(item);
      termsSeen.add(plan.installments);
      add(monthlyPeriod, round2(price * plan.installments), round2(vat * plan.installments));
      const ongoingVat = item.vatFlag ? round2(plan.ongoingPerMonth * (vatRate / 100)) : 0;
      add(monthlyOngoing, plan.ongoingPerMonth, ongoingVat);
    }
  }

  const installments = termsSeen.size === 1 ? [...termsSeen][0] : null;
  return {
    ...buckets, monthlyPeriod, monthlyOngoing, installments,
    hasPartialTerm: [...termsSeen].some(n => n !== DEFAULT_INSTALLMENTS),
    changesAfterPeriod: Math.abs(monthlyOngoing.withVat - buckets.monthly.withVat) >= 1,
    totalDiscount, vatRate,
  };
}

export function calcQuotationTotals(q: Pick<Quotation, 'items' | 'vatRate'>): QuotationTotals {
  return calcTotals(q.items, q.vatRate);
}

function bucketFor(category: ServiceCategory): 'monthly' | 'annual' | 'oneTime' | null {
  switch (category) {
    case 'monthly': return 'monthly';
    case 'annual': return 'annual';
    case 'one_time': return 'oneTime';
    case 'included': return null;
  }
}

// עיגול לשתי ספרות — מונע זנבות צפים (0.30000000000000004)
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatILS(n: number): string {
  return '₪' + n.toLocaleString('he-IL', { maximumFractionDigits: 2 });
}

// שם השורה כפי שהוא מוצג ללקוח. שורה עם שנת מס מקבלת את השנה בשמה, כדי
// שכמה דוחות של שנים פתוחות ייקראו כשורות נפרדות ולא כשכפול של אותו שירות.
export function itemDisplayName(item: { name: string; year?: number }): string {
  return item.year ? `${item.name} — שנת ${item.year}` : item.name;
}

// ─── פריסת תשלומים ──────────────────────────────────────────────────────────

export interface MonthlyPlan {
  installments: number;      // מספר התשלומים בפועל
  perPayment: number;        // סכום לתשלום בודד, לפני מע"מ, אחרי הנחה
  periodTotal: number;       // סך כל התשלומים בתקופה, לפני מע"מ
  ongoingPerMonth: number;   // התשלום החודשי לשנה מלאה — מה שיחויב אחר כך
  isPartialTerm: boolean;    // התקופה קצרה (או ארוכה) מ-12 חודשים
  changesAfter: boolean;     // התשלום ישתנה בתום התקופה
  startMonth?: string;       // 'YYYY-MM' של התשלום הראשון
  endMonth?: string;         // 'YYYY-MM' של התשלום האחרון
  nextMonth?: string;        // 'YYYY-MM' של החודש שאחרי התקופה
}

// שורה חודשית שאין לה מחיר שנתי מוגדר מתנהגת כמו קודם: המחיר הוא המחיר,
// 12 תשלומים, שום דבר לא משתנה בינואר.
export function monthlyPlan(item: QuotationItem): MonthlyPlan {
  const installments = clampInstallments(item.installments);
  const perPayment = itemFinalPrice(item);
  const qty = item.quantity || 1;
  const discount = item.discountPercent ? 1 - item.discountPercent / 100 : 1;
  const ongoingPerMonth = item.annualPrice != null && item.priceBasis === 'annual'
    ? round2((item.annualPrice * qty * discount) / DEFAULT_INSTALLMENTS)
    : perPayment;

  const startMonth = item.billingStartMonth;
  const endMonth = startMonth ? addMonths(startMonth, installments - 1) : undefined;
  const nextMonth = endMonth ? addMonths(endMonth, 1) : undefined;

  return {
    installments,
    perPayment,
    periodTotal: round2(perPayment * installments),
    ongoingPerMonth,
    isPartialTerm: installments !== DEFAULT_INSTALLMENTS,
    changesAfter: Math.abs(ongoingPerMonth - perPayment) >= 1,
    startMonth, endMonth, nextMonth,
  };
}

// גזירת התשלום החודשי מהמחיר השנתי. 'prorata' — הלקוח משלם את המחיר החודשי
// הרגיל, פשוט פחות פעמים. 'full' — אותו סכום שנתי נדחס לפחות תשלומים.
export function monthlyFromAnnual(annualPrice: number, installments: number, mode: 'prorata' | 'full'): number {
  const n = clampInstallments(installments);
  return round2(annualPrice / (mode === 'full' ? n : DEFAULT_INSTALLMENTS));
}

export function clampInstallments(n: number | undefined): number {
  if (!n || !Number.isFinite(n)) return DEFAULT_INSTALLMENTS;
  return Math.min(60, Math.max(1, Math.round(n)));
}

// ─── עבודה עם חודשים בפורמט 'YYYY-MM' ───

export function currentMonthKey(): string {
  return monthKey(new Date());
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

// כמה תשלומים נשארו עד סוף שנת הכספים, כולל חודש ההתחלה
export function monthsLeftInYear(ym: string): number {
  const m = Number(ym.split('-')[1]);
  return m >= 1 && m <= 12 ? 13 - m : DEFAULT_INSTALLMENTS;
}

const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export function formatMonth(ym: string | undefined, withYear = true): string {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  const name = MONTH_NAMES[m - 1];
  if (!name) return ym;
  return withYear ? `${name} ${y}` : name;
}

// "אוגוסט–דצמבר 2026" כשזו אותה שנה, אחרת "אוגוסט 2026 – מרץ 2027"
export function formatMonthRange(from: string | undefined, to: string | undefined): string {
  if (!from || !to) return '';
  if (from === to) return formatMonth(from);
  const sameYear = from.split('-')[0] === to.split('-')[0];
  return sameYear
    ? `${formatMonth(from, false)}–${formatMonth(to)}`
    : `${formatMonth(from)} – ${formatMonth(to)}`;
}
