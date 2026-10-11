// ─── ההצעה כפי שהלקוח קורא אותה: שנה, מה ומתי משלמים, כמה חסך ────────────────
// ‼ גיא, 11.10.2026: "המייל ממש מבולגן והלקוח לא יבין כלום". העמוד עוצב מחדש
// סביב שתי שאלות — מה אני מקבל, וכמה ומתי יורד לי מהחשבון — וכל שנה מתומחרת
// מחדש. הבדיקות נועלות את המספרים שהלקוח רואה בהצעה מההקלטה (אוקטובר,
// ₪236 לחודש, ₪1,062 עם ההגשה) ואת כללי השנה.
import { test, equal, assert } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import type { QuotationItem } from '../../types/quotations';
import { paymentSchedule, quotationSavings, quotationServiceYear, serviceYearClause, savingsSentence, formatILS } from '../quotationCalc';

const VAT = 18;
const base = { billingType: 'fixed' as const, quantity: 1, vatFlag: true };

// ליווי 50 ₪ + דוח שנתי 1,800 ₪ (150 ₪ × 3 תשלומים, אוקטובר–דצמבר), סוכם שייגבו 900 מהיתרה
const RETAINER: QuotationItem = { ...base, id: 'r', name: 'ליווי', category: 'monthly', catalogPrice: 50, clientPrice: 50, installments: 3, billingStartMonth: '2026-10' };
const REPORT: QuotationItem = {
  ...base, id: 'd', name: 'דוח שנתי', category: 'monthly', catalogPrice: 1800, clientPrice: 150, year: 2026,
  priceBasis: 'annual', annualPrice: 1800, installments: 3, billingStartMonth: '2026-10',
  prorationMode: 'deferred', deferredChargeAmount: 900,
};
const VIDEO = [RETAINER, REPORT];

export const TESTS: TestCase[] = [
  test('ההצעה מההקלטה: ₪236 לחודש ו-₪1,062 עם הגשת הדוח, כולל מע"מ', () => {
    const rows = paymentSchedule(VIDEO, VAT);
    equal(rows.map(r => r.label).join(' | '), 'כל חודש | עם הגשת הדוח השנתי');
    equal(Math.round(rows[0].amount), 236);
    equal(rows[0].sub, '3 תשלומים · אוקטובר–דצמבר 2026');
    equal(Math.round(rows[1].amount), 1062);
    assert(rows[1].deferred === true, 'היתרה מסומנת "לא נגבה עכשיו"');
    // החודשי לא משתנה בינואר — ולכן אין שורה שמתחייבת למחיר של 2027
    equal(rows[0].changesTo, undefined);
  }),

  test('ההנחה מוצגת פעם אחת, כוללת מע"מ, ושייכת לשורה שקיבלה אותה', () => {
    const s = quotationSavings(VIDEO, VAT);
    equal(s.lines.length, 1);
    equal(s.lines[0].name, 'דוח שנתי - שנת 2026');
    equal(Math.round(s.total), 531); // 450 ₪ הנחה על היתרה + 18%
  }),

  test('הנחה על ריטיינר נספרת על התשלומים שבהצעה, לא כהנחה לחודש אחד', () => {
    const r: QuotationItem = { ...RETAINER, catalogPrice: 450, clientPrice: 400, installments: 12 };
    const s = quotationSavings([r], VAT);
    equal(Math.round(s.total), Math.round(50 * 12 * 1.18));
    // ‼ ללקוח: "₪59 בכל חודש", לא "₪708" שנקרא כהנחה חד־פעמית
    equal(savingsSentence(s, formatILS), 'קיבלת הנחה של ₪59 בכל חודש על ליווי');
  }),

  test('שנת ההצעה היא שנת החיוב הראשון, גם בהצעה שנשלחת בדצמבר לינואר', () => {
    equal(quotationServiceYear(VIDEO), 2026);
    equal(quotationServiceYear([{ ...RETAINER, billingStartMonth: '2027-01' }], '2026-12-20T00:00:00Z'), 2027);
  }),

  test('בלי חודש חיוב — שנת המס של השורה החוזרת, ואחריה שנת התוקף', () => {
    const annual: QuotationItem = { ...base, id: 'a', name: 'דוח שנתי', category: 'annual', catalogPrice: 1800, clientPrice: 1800, year: 2027 };
    equal(quotationServiceYear([annual]), 2027);
    equal(quotationServiceYear([{ ...annual, year: undefined }], '2026-11-02T00:00:00Z'), 2026);
  }),

  test('השלמת שנים פתוחות בלבד אינה "הצעה לשנה" — אין מה לחדש', () => {
    const catchup: QuotationItem[] = [2023, 2024].map(y => ({ ...base, id: `c${y}`, name: 'דוח שנתי', category: 'one_time' as const, catalogPrice: 1800, clientPrice: 1500, year: y }));
    equal(quotationServiceYear(catchup, '2026-10-20T00:00:00Z'), undefined);
  }),

  test('תשלום אחר מינואר מופיע רק כשהרו"ח הזין אותו במפורש', () => {
    const rows = paymentSchedule([{ ...RETAINER, ongoingPrice: 80 }], VAT);
    equal(rows[0].changesTo?.from, 'החל מינואר 2027');
    equal(Math.round(rows[0].changesTo?.amount ?? 0), Math.round(80 * 1.18));
  }),

  test('הסעיף השנתי אומר שהעדכון קורה גם כשלא השתנה דבר', () => {
    const c = serviceYearClause(2026);
    assert(c.includes('לשנת 2026'), c);
    assert(c.includes('גם כשלא השתנה דבר'), c);
    assert(!/מחיר|התייקר|הצמד/.test(c), 'אין בסעיף מילים שמרמזות על התייקרות');
  }),
];
