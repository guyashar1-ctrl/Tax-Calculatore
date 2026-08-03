// ─── חישובי הצעת מחיר: סיכומים לפי תדירות, מע"מ, הנחות ──────────────────────
// כלל מה-PRD: לעולם לא מאחדים חיוב חודשי וחד־פעמי למספר אחד מטעה —
// לכן הסיכומים מוחזרים בנפרד לפי קטגוריה, ולצידם המע"מ של כל קטגוריה.

import type { Quotation, QuotationItem, ServiceCategory } from '../types/quotations';
import { DEFAULT_INSTALLMENTS } from '../types/quotations';

export interface CategoryTotal {
  // "המחיר המלא" לפני הנחות — העוגן שמוצג ללקוח לצד המחיר שאחרי ההנחה
  fullBeforeVat: number;
  discount: number;          // סך ההנחה בקטגוריה, לפני מע"מ, בסקאלת התצוגה
  beforeVat: number;
  vat: number;
  withVat: number;
}

export interface QuotationTotals {
  monthly: CategoryTotal;
  annual: CategoryTotal;
  oneTime: CategoryTotal;
  // יתרות שהריטיינר החודשי לא בלע ונגבות במועד מאוחר (הגשת הדוח וכו')
  deferred: CategoryTotal;
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

// המחיר "המלא" של שורה בסקאלת התצוגה (לתשלום/ליחידה) — העוגן שלפני ההנחה.
// כולל גם דריסת מחיר ידנית מתחת לקטלוג. בשורה שנפרסה ממחיר שנתי, המחיר המלא
// הוא השנתי (או הקטלוג — הגבוה מביניהם, כי בקטלוג של שורה שנפרסה שמור המחיר
// השנתי) חלקי מספר התשלומים — כך העוגן והמחיר הסופי באותה סקאלה.
export function itemOriginalPrice(item: QuotationItem): number {
  const qty = item.quantity || 1;
  // עוגן שנקבע ידנית על ידי הרו"ח גובר על כל חישוב אוטומטי
  if (item.displayFullPrice != null && item.displayFullPrice > 0) {
    return round2(item.displayFullPrice * qty);
  }
  if (item.priceBasis === 'annual' && item.annualPrice != null) {
    // בשורת יתרה העוגן החודשי הוא שנתי ÷ 12 ולא ÷ מספר התשלומים: מה שלא נגבה
    // בחודשי אינו הנחה אלא יתרה שתיגבה במועד. בלי זה העמוד מציג "הנחה 67%"
    // ובנשימה הבאה דורש את אותו סכום — וזה בדיוק מה שהמסלול הזה בא למנוע.
    const n = item.prorationMode === 'deferred' ? DEFAULT_INSTALLMENTS : clampInstallments(item.installments);
    return round2((Math.max(item.annualPrice, item.catalogPrice) * qty) / n);
  }
  return round2(Math.max(item.clientPrice, item.catalogPrice) * qty);
}

export function calcTotals(items: QuotationItem[], vatRate: number): QuotationTotals {
  const empty = (): CategoryTotal => ({ fullBeforeVat: 0, discount: 0, beforeVat: 0, vat: 0, withVat: 0 });
  const buckets: Record<'monthly' | 'annual' | 'oneTime', CategoryTotal> = {
    monthly: empty(), annual: empty(), oneTime: empty(),
  };
  const monthlyPeriod = empty();
  const monthlyOngoing = empty();
  const deferred = empty();
  const termsSeen = new Set<number>();
  let totalDiscount = 0;

  const add = (t: CategoryTotal, price: number, vat: number, full = price) => {
    t.fullBeforeVat = round2(t.fullBeforeVat + Math.max(full, price));
    t.discount = round2(t.discount + Math.max(0, full - price));
    t.beforeVat = round2(t.beforeVat + price);
    t.vat = round2(t.vat + vat);
    t.withVat = round2(t.withVat + price + vat);
  };

  for (const item of items) {
    const bucket = bucketFor(item.category);
    if (!bucket) continue;    // שירותים "כלולים" (0 ₪) אינם משתתפים בסיכום
    const price = itemFinalPrice(item);
    const full = itemOriginalPrice(item);
    const vat = item.vatFlag ? round2(price * (vatRate / 100)) : 0;
    add(buckets[bucket], price, vat, full);
    totalDiscount = round2(totalDiscount + itemDiscountAmount(item));

    if (bucket === 'monthly') {
      const plan = monthlyPlan(item);
      termsSeen.add(plan.installments);
      add(monthlyPeriod, round2(price * plan.installments), round2(vat * plan.installments), round2(full * plan.installments));
      const ongoingVat = item.vatFlag ? round2(plan.ongoingPerMonth * (vatRate / 100)) : 0;
      add(monthlyOngoing, plan.ongoingPerMonth, ongoingVat);
    }

    // היתרה נוספת מעל החישוב החודשי ולא במקומו: החיוב החודשי נשאר בדיוק כפי
    // שהיה, ורק מה שנמחל עד היום הופך לסכום גלוי במועד מאוחר.
    const def = itemDeferred(item, vatRate);
    if (def) {
      add(deferred, def.finalAmount, def.vat, def.balance);
      totalDiscount = round2(totalDiscount + def.discount);
    }
  }

  const installments = termsSeen.size === 1 ? [...termsSeen][0] : null;
  return {
    ...buckets, monthlyPeriod, monthlyOngoing, deferred, installments,
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

// פירוט ההנחה לפי תדירות — כל סקאלה בנפרד, כי "135 בחודש" ו-"450 על היתרה"
// אינם אותו סוג של כסף. נוסח אחד, כדי שהרו"ח בבונה והלקוח בעמוד יקראו בדיוק
// את אותו משפט. היתרה חייבת להופיע כאן: בלעדיה הפס מדבר על הנחה שלא מוסבר
// למה היא ניתנה.
export function discountSummaryParts(totals: QuotationTotals): string[] {
  return [
    totals.monthly.discount >= 1 ? `${formatILS(Math.round(totals.monthly.discount))} בכל חודש` : '',
    totals.annual.discount >= 1 ? `${formatILS(Math.round(totals.annual.discount))} בשנה` : '',
    totals.oneTime.discount >= 1 ? `${formatILS(Math.round(totals.oneTime.discount))} חד־פעמי` : '',
    totals.deferred.discount >= 1 ? `${formatILS(Math.round(totals.deferred.discount))} על היתרה` : '',
  ].filter(Boolean);
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

// המחיר שסוכם הוא המחיר — גם בשנה הבאה. אם הרו"ח קבע 250 ₪ לחודש, הלקוח
// משלם 250 ₪ גם בינואר, והשורה "החל מ..." כלל לא מופיעה. שינוי מחיר בשנה
// הבאה קורה רק כשהרו"ח מזין אותו במפורש בשדה "תשלום חודשי מהשנה הבאה".
// (עד 2026-07-30 המערכת גזרה זאת לבד — שנתי ÷ 12 — והפתיעה עם מחיר שאיש
// לא ביקש.)
export function monthlyPlan(item: QuotationItem): MonthlyPlan {
  const installments = clampInstallments(item.installments);
  const perPayment = itemFinalPrice(item);
  const qty = item.quantity || 1;
  const ongoingPerMonth = item.ongoingPrice != null && item.ongoingPrice > 0
    ? round2(item.ongoingPrice * qty)
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

// ─── יתרה לתשלום מאוחר ──────────────────────────────────────────────────────
// לקוח שנכנס בספטמבר משלם 4 תשלומים על דוח שנתי ששווה 1,800 ₪. "יחסי" גובה
// 600 ₪ ומוחל על 1,200 ₪ בלי שאיש יראה את זה; "פריסה מלאה" הופכת את החודשי
// ל-900 ₪ ומבריחה את הלקוח. כאן החודשי נשאר 150 ₪, והיתרה נגבית במועד —
// עם אפשרות להנחה בשקלים על היתרה בלבד.
//
// ‼ התכונה שמצדיקה את כל המבנה: בשנה הבאה אותה שורה היא 12 תשלומים, היתרה
// יוצאת אפס והסעיף נעלם לבדו — בלי אף הגדרה ובלי שיזכרו לכבות אותו.

export const DEFAULT_DEFERRED_TRIGGER = 'עם הגשת הדוח השנתי';

export interface DeferredBreakdown {
  totalValue: number;        // ערך השירות — אחרי ההנחה באחוזים של השורה
  includedInMonthly: number; // מה שהריטיינר בולע
  balance: number;           // יתרה לפני הנחה
  discount: number;          // הנחה על היתרה (₪)
  finalAmount: number;       // לתשלום במועד
  vat: number;
  withVat: number;
  trigger: string;           // הטריגר, עם ברירת המחדל כבר מוחלת
}

export interface DeferredBase {
  installments: number;      // מספר התשלומים שממנו נגזרת היתרה
  perPayment: number;        // התשלום החודשי שנבלע בריטיינר
  totalValue: number;
  includedInMonthly: number;
  balance: number;
}

// בסיס היתרה — גם כשאין מה לגבות בסופו של דבר. הבונה חייב להציג את היתרה
// על המסך תמיד (זה המספר שהרו"ח חישב בראש), גם כשהיא אפס וגם כשכולה הנחה,
// ולכן הוא לא יכול להסתמך על itemDeferred שמחזיר null בדיוק במקרים האלה.
export function deferredBase(item: QuotationItem): DeferredBase | null {
  if (item.prorationMode !== 'deferred') return null;
  if (item.priceBasis !== 'annual' || item.annualPrice == null) return null;

  const qty = item.quantity || 1;
  const afterPercent = item.discountPercent ? 1 - item.discountPercent / 100 : 1;
  const totalValue = round2(item.annualPrice * qty * afterPercent);
  const installments = clampInstallments(item.installments);
  // itemFinalPrice כבר כולל כמות והנחה באחוזים — אסור להכפיל אותן שוב
  const perPayment = itemFinalPrice(item);
  const includedInMonthly = round2(perPayment * installments);
  return {
    installments, perPayment, totalValue, includedInMonthly,
    balance: Math.max(0, round2(totalValue - includedInMonthly)),
  };
}

export function itemDeferred(item: QuotationItem, vatRate: number): DeferredBreakdown | null {
  const base = deferredBase(item);
  if (!base) return null;
  const { totalValue, includedInMonthly, balance } = base;

  // הרו"ח מזין את התוצאה — "שישלם 600" — וההנחה נגזרת ממנה. deferredDiscount
  // נשאר בתוקף להצעות שנשמרו לפני כן, ומשמש רק כשאין סכום גבייה מפורש.
  const finalAmount = item.deferredChargeAmount != null
    ? round2(Math.min(Math.max(0, item.deferredChargeAmount), balance))
    : round2(balance - Math.min(Math.max(0, item.deferredDiscount ?? 0), balance));
  const discount = round2(balance - finalAmount);
  if (finalAmount <= 0) return null;

  const vat = item.vatFlag ? round2(finalAmount * (vatRate / 100)) : 0;
  return {
    totalValue, includedInMonthly, balance, discount, finalAmount,
    vat, withVat: round2(finalAmount + vat),
    trigger: item.deferredTrigger?.trim() || DEFAULT_DEFERRED_TRIGGER,
  };
}

export interface DeferredGroup {
  trigger: string;
  lines: { item: QuotationItem; breakdown: DeferredBreakdown }[];
  total: CategoryTotal;
}

// קיבוץ לפי מועד הגבייה: כמה שורות שנגבות באותו מועד הן סכום אחד ללקוח,
// ומועדים שונים הם סכומים נפרדים — אחרת נוצר סכום שלא נגבה אף פעם כמות שהוא.
export function deferredGroups(items: QuotationItem[], vatRate: number): DeferredGroup[] {
  const groups: DeferredGroup[] = [];
  for (const item of items) {
    if (item.category === 'included') continue;
    const breakdown = itemDeferred(item, vatRate);
    if (!breakdown) continue;
    let g = groups.find(x => x.trigger === breakdown.trigger);
    if (!g) {
      g = { trigger: breakdown.trigger, lines: [], total: { fullBeforeVat: 0, discount: 0, beforeVat: 0, vat: 0, withVat: 0 } };
      groups.push(g);
    }
    g.lines.push({ item, breakdown });
    g.total.fullBeforeVat = round2(g.total.fullBeforeVat + breakdown.balance);
    g.total.discount = round2(g.total.discount + breakdown.discount);
    g.total.beforeVat = round2(g.total.beforeVat + breakdown.finalAmount);
    g.total.vat = round2(g.total.vat + breakdown.vat);
    g.total.withVat = round2(g.total.withVat + breakdown.withVat);
  }
  return groups;
}

// חמש השורות שהלקוח רואה מתחת לשורת השירות — אותו נוסח בעמוד וב-PDF.
// שורת ההנחה מופיעה רק כשיש הנחה. הסכומים מוחזרים כמספרים: ה-PDF מנסח מטבע
// אחרת (ש״ח, כי ל-₪ אין גליף בפונט העברי).
export function deferredDetailLines(b: DeferredBreakdown): { label: string; amount: number; negative?: boolean; strong?: boolean }[] {
  return [
    { label: 'ערך השירות', amount: b.totalValue },
    { label: 'כלול בשכר החודשי', amount: b.includedInMonthly },
    { label: 'יתרה', amount: b.balance },
    ...(b.discount >= 1 ? [{ label: 'הנחה על היתרה', amount: b.discount, negative: true }] : []),
    { label: `לתשלום ${b.trigger}`, amount: b.finalAmount, strong: true },
  ];
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
