// ─── מחיר והנחה בהצעה: שתי החלטות, ומה הלקוח רואה מכל אחת ────────────────────
// ‼ גיא, 20.10.2026: "לפעמים זה מבלבל אם שיניתי את המחיר או שאני עושה הנחה".
// שינוי מחיר לא מוצג ללקוח כהנחה; הנחה מוצגת עם המחיר הרגיל, בשורה משלה;
// שירות ללא עלות לא נעלם מהעמוד.
import { test, equal, assert } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import type { QuotationItem } from '../../types/quotations';
import {
  itemFinalPrice, paymentSchedule, quotationSavings, savingsHeadline, savingsLineValue, formatILS,
} from '../quotationCalc';
import { readPriceDiscount, priceDiscountPatch, withPrice, discountedPrice } from '../quotationDiscount';

const VAT = 18;
const base = { billingType: 'fixed' as const, quantity: 1, vatFlag: true };
const OPEN: QuotationItem = { ...base, id: 'o', name: 'פתיחת תיקים ברשויות', category: 'one_time', catalogPrice: 300, clientPrice: 300 };
const BOOKS: QuotationItem = { ...base, id: 'b', name: 'הנהלת חשבונות', category: 'monthly', catalogPrice: 100, clientPrice: 100, installments: 3, billingStartMonth: '2026-10' };
const REPORT: QuotationItem = {
  ...base, id: 'd', name: 'דוח שנתי', category: 'monthly', catalogPrice: 1800, clientPrice: 150, year: 2026,
  priceBasis: 'annual', annualPrice: 1800, installments: 3, billingStartMonth: '2026-10',
  prorationMode: 'deferred', deferredChargeAmount: 500,
};
const apply = (item: QuotationItem, patch: Partial<QuotationItem>): QuotationItem => ({ ...item, ...patch });

export const TESTS: TestCase[] = [
  test('שינוי מחיר בלבד אינו הנחה — הלקוח רואה רק את המחיר החדש', () => {
    const cheaper = apply(OPEN, priceDiscountPatch({ price: 200, mode: 'none', value: 0 }));
    equal(itemFinalPrice(cheaper), 200);
    equal(quotationSavings([cheaper], VAT).lines.length, 0);
    equal(paymentSchedule([cheaper], VAT)[0].regular, undefined);
  }),

  test('ללא עלות: המחיר הרגיל נשמר כעוגן, והשירות מופיע בתיבת ההנחות', () => {
    const free = apply(OPEN, priceDiscountPatch({ price: 300, mode: 'free', value: 0 }));
    equal(itemFinalPrice(free), 0);
    const s = quotationSavings([free], VAT);
    equal(s.lines.length, 1);
    assert(s.lines[0].free === true, 'מסומן ללא עלות');
    equal(Math.round(s.lines[0].regular ?? 0), 354);
    equal(savingsHeadline(s, formatILS), 'פתיחת תיקים ברשויות - ללא עלות עבורך (במקום ₪354)');
    equal(readPriceDiscount(free).mode, 'free');
  }),

  test('כמה הנחות: הסכום הכולל בכותרת, וכל הנחה בשורה משלה', () => {
    const free = apply(OPEN, priceDiscountPatch({ price: 300, mode: 'free', value: 0 }));
    const s = quotationSavings([BOOKS, REPORT, free], VAT);
    equal(s.lines.map(l => l.name).join(' | '), 'דוח שנתי - שנת 2026 | פתיחת תיקים ברשויות');
    equal(savingsHeadline(s, formatILS), `קיבלת הנחות בסך ${formatILS(Math.round(s.total))}`);
    const v = savingsLineValue(s.lines[1], formatILS);
    equal(v.text, 'ללא עלות');
    equal(v.regular, '₪354');
  }),

  test('הנחה בשקלים ובאחוזים נקראת חזרה כמו שהוזנה', () => {
    const ils = apply(BOOKS, priceDiscountPatch({ price: 100, mode: 'ils', value: 20 }));
    equal(itemFinalPrice(ils), 80);
    const back = readPriceDiscount(ils);
    equal(`${back.mode}:${back.price}:${back.value}`, 'ils:100:20');
    const pct = apply(BOOKS, priceDiscountPatch({ price: 100, mode: 'pct', value: 25 }));
    equal(itemFinalPrice(pct), 75);
    equal(readPriceDiscount(pct).mode, 'pct');
    equal(discountedPrice({ price: 100, mode: 'pct', value: 150 }), 0);
  }),

  test('שינוי המחיר שומר את ההנחה שכבר ניתנה', () => {
    const disc = apply(BOOKS, priceDiscountPatch({ price: 100, mode: 'ils', value: 20 }));
    const raised = apply(disc, withPrice(disc, 120));
    equal(itemFinalPrice(raised), 100);
    equal(readPriceDiscount(raised).price, 120);
  }),

  test('המחיר הרגיל מחוק ליד הסכום ב"מה ומתי משלמים", כולל מע"מ', () => {
    const disc = apply(BOOKS, priceDiscountPatch({ price: 100, mode: 'ils', value: 20 }));
    const row = paymentSchedule([disc], VAT)[0];
    equal(Math.round(row.amount), 94);
    equal(Math.round(row.regular ?? 0), 118);
    // ריטיינר בלי הנחה — בלי מחיר מחוק
    equal(paymentSchedule([BOOKS], VAT)[0].regular, undefined);
  }),
];
