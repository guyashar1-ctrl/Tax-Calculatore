// ─── חישובי הצעת מחיר: סיכומים לפי תדירות, מע"מ, הנחות ──────────────────────
// כלל מה-PRD: לעולם לא מאחדים חיוב חודשי וחד־פעמי למספר אחד מטעה —
// לכן הסיכומים מוחזרים בנפרד לפי קטגוריה, ולצידם המע"מ של כל קטגוריה.

import type { Quotation, QuotationItem, ServiceCategory } from '../types/quotations';

export interface CategoryTotal {
  beforeVat: number;
  vat: number;
  withVat: number;
}

export interface QuotationTotals {
  monthly: CategoryTotal;
  annual: CategoryTotal;
  oneTime: CategoryTotal;
  totalDiscount: number;      // סך ההנחות שניתנו (לפני מע"מ), לכל הקטגוריות
  vatRate: number;
}

// מחיר שורה סופי לפני מע"מ: מחיר ליחידה × כמות × (1 - הנחה)
export function itemFinalPrice(item: QuotationItem): number {
  const gross = item.clientPrice * (item.quantity || 1);
  const discount = item.discountPercent ? gross * (item.discountPercent / 100) : 0;
  return round2(gross - discount);
}

// ההנחה בשורה כוללת גם דריסת מחיר ידנית מתחת למחיר הקטלוג
export function itemDiscountAmount(item: QuotationItem): number {
  const catalogGross = item.catalogPrice * (item.quantity || 1);
  return round2(Math.max(0, catalogGross - itemFinalPrice(item)));
}

export function calcTotals(items: QuotationItem[], vatRate: number): QuotationTotals {
  const empty = (): CategoryTotal => ({ beforeVat: 0, vat: 0, withVat: 0 });
  const buckets: Record<'monthly' | 'annual' | 'oneTime', CategoryTotal> = {
    monthly: empty(), annual: empty(), oneTime: empty(),
  };
  let totalDiscount = 0;

  for (const item of items) {
    const bucket = bucketFor(item.category);
    if (!bucket) continue;    // שירותים "כלולים" (0 ₪) אינם משתתפים בסיכום
    const price = itemFinalPrice(item);
    const vat = item.vatFlag ? round2(price * (vatRate / 100)) : 0;
    buckets[bucket].beforeVat = round2(buckets[bucket].beforeVat + price);
    buckets[bucket].vat = round2(buckets[bucket].vat + vat);
    buckets[bucket].withVat = round2(buckets[bucket].withVat + price + vat);
    totalDiscount = round2(totalDiscount + itemDiscountAmount(item));
  }

  return { ...buckets, totalDiscount, vatRate };
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
