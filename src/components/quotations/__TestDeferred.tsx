// ─── מסך בדיקה ליתרה לתשלום מאוחר ────────────────────────────────────────────
// ‼ למה זה קיים: הצעה עם יתרה נבנית בתוך הבונה, נשמרת במסד ונשלחת — כלומר
// אי אפשר לראות אותה בלי לייצר נתוני אמת. כאן מרכיבים את עמוד ההצעה עם הצעה
// מדומה, כדי לבדוק את המספרים ואת התצוגה בלי לגעת במסד.
//
// פתיחה:  http://localhost:5173/?test-deferred   (DEV בלבד)
//
// התרחיש (השורה האמיתית של גיא): לקוח שנכנס באוגוסט. ריטיינר 450 ₪, דוח שנתי
// שמחירו 1,800 ₪ עם הנחה של 20%, שנגבה 150 ₪ בחודש על פני 5 תשלומים, וסוכם
// שייגבו על היתרה 500 ₪.
//
// השורות שחייבות להופיע בפירוט, בדיוק בסדר הזה:
//   מחיר דוח שנתי             1,800
//   הנחה 20%                   -360
//   ערך אחרי הנחה             1,440
//   כלול בשכר החודשי             600
//   יתרה                         840
//   הנחה על היתרה               -340
//   לתשלום עם הגשת הדוח השנתי    500
// סך ההנחה על השורה: 360 + 340 = 700 ₪.
//
// השורה השלישית היא אותה שורה בדיוק בשנה הבאה (12 תשלומים) — היא חייבת
// להיראות בלי שום סעיף יתרה. זו ההוכחה שהסעיף נעלם מעצמו.

import type { QuotationItem } from '../../types/quotations';
import { itemDeferred, formatILS } from '../../utils/quotationCalc';
import { fallbackBrand } from './quotationBranding';
import QuotationWebView, { type QuotationWebViewData } from './QuotationWebView';

const VAT_RATE = 18;

const RETAINER: QuotationItem = {
  id: 'fx-retainer',
  name: 'ליווי חשבונאי חודשי',
  description: 'הנהלת חשבונות, דיווחים שוטפים וזמינות לשאלות',
  category: 'monthly',
  billingType: 'fixed',
  quantity: 1,
  catalogPrice: 450,
  clientPrice: 450,
  vatFlag: true,
  installments: 5,
  billingStartMonth: '2026-08',
};

const DEFERRED: QuotationItem = {
  id: 'fx-deferred',
  name: 'דוח שנתי',
  description: 'הכנת הדוח השנתי והגשתו',
  category: 'monthly',
  billingType: 'fixed',
  quantity: 1,
  catalogPrice: 1800,
  clientPrice: 150,
  discountPercent: 20,
  vatFlag: true,
  year: 2026,
  priceBasis: 'annual',
  annualPrice: 1800,
  installments: 5,
  billingStartMonth: '2026-08',
  prorationMode: 'deferred',
  // הרו"ח הזין את התוצאה — "שישלם 500" — וההנחה (340 ₪) נגזרת ממנה
  deferredChargeAmount: 500,
  clientNote: 'היתרה נגבית פעם אחת, עם ההגשה.',
};

// אותה שורה, שנה אחר כך: 12 תשלומים ⇒ אין יתרה ⇒ אין סעיף
const DEFERRED_FULL_YEAR: QuotationItem = {
  ...DEFERRED,
  id: 'fx-deferred-12',
  year: 2027,
  installments: 12,
  clientNote: undefined,
};

const ONE_TIME: QuotationItem = {
  id: 'fx-onetime',
  name: 'פתיחת תיקים ברשויות',
  description: 'מס הכנסה, מע״מ וביטוח לאומי',
  category: 'one_time',
  billingType: 'fixed',
  quantity: 1,
  catalogPrice: 600,
  clientPrice: 600,
  vatFlag: true,
};

const ITEMS: QuotationItem[] = [RETAINER, DEFERRED, DEFERRED_FULL_YEAR, ONE_TIME];

const DATA: QuotationWebViewData = {
  quotationNumber: 'TEST-001',
  recipientName: 'דנה לוי',
  businessName: 'דנה לוי עיצוב פנים',
  items: ITEMS,
  vatRate: VAT_RATE,
  expiresAt: '2026-08-10T20:59:00Z',
};

export default function TestDeferred() {
  const guy = itemDeferred(DEFERRED, VAT_RATE);
  const nextYear = itemDeferred(DEFERRED_FULL_YEAR, VAT_RATE);
  const rows: [string, string, string][] = guy ? [
    [`מחיר ${DEFERRED.name}`, formatILS(guy.listPrice), '1,800'],
    ['הנחה 20%', `−${formatILS(guy.percentDiscount)}`, '−360'],
    ['ערך אחרי הנחה', formatILS(guy.totalValue), '1,440'],
    ['כלול בשכר החודשי', formatILS(guy.includedInMonthly), '600'],
    ['יתרה', formatILS(guy.balance), '840'],
    ['הנחה על היתרה', `−${formatILS(guy.discount)}`, '−340'],
    ['לתשלום עם ההגשה', formatILS(guy.finalAmount), '500'],
    ['סך ההנחה על השורה', formatILS(guy.totalDiscount), '700'],
  ] : [];

  return (
    <div dir="rtl">
      <div style={{ padding: '1rem 1.5rem', maxWidth: 980, margin: '0 auto' }}>
        <h2 style={{ marginBottom: '.3rem' }}>בדיקת יתרה לתשלום מאוחר — נתונים מדומים</h2>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: '.8rem', lineHeight: 1.7 }}>
          לקוח שנכנס באוגוסט: ריטיינר 450 ₪ × 5, דוח שנתי שמחירו 1,800 ₪ עם הנחה של 20% (360 ₪),
          כלומר 1,440 ₪ — מהם 600 ₪ כלולים בחודשי (5 × 120 ₪). היתרה 840 ₪, וסוכם שייגבו ממנה 500 ₪ —
          כלומר עוד 340 ₪ הנחה, וסך הכול 700 ₪ הנחה על השורה.
          שורת 2027 היא אותה שורה ב-12 תשלומים — ולכן אסור שיופיע לה סעיף יתרה.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, fontSize: 13, marginBottom: '1rem' }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>שורת 2026 (5 תשלומים) — מול הצפוי</div>
            {rows.map(([label, amount, expected]) => {
              const ok = amount.replace(/[₪−-]/g, '') === expected.replace(/[₪−-]/g, '');
              return (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, minWidth: 300 }}>
                  <span style={{ color: 'var(--ink-3)' }}>{label}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', color: ok ? undefined : 'var(--red)' }}>
                    {amount}{ok ? ' ✓' : ` ‼ צפוי ${expected}`}
                  </span>
                </div>
              );
            })}
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>שורת 2027 (12 תשלומים)</div>
            <div style={{ color: nextYear ? 'var(--red)' : 'var(--green, #059669)' }}>
              {nextYear ? `‼ נותרה יתרה של ${formatILS(nextYear.finalAmount)} — שגיאה` : '✓ אין יתרה — הסעיף נעלם מעצמו'}
            </div>
          </div>
        </div>
      </div>
      <div className="pivo-light">
        <QuotationWebView data={DATA} brand={fallbackBrand()} status="sent" />
      </div>
    </div>
  );
}
