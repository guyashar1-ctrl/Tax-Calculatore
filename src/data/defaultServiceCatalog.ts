// ─── קטלוג ברירת המחדל של המשרד — נזרע פעם אחת למשתמש חדש ───────────────────
// המחירים מה-PRD (2026-07). אחרי הזריעה גיא עורך הכל מתוך הגדרות המשרד —
// הקובץ הזה לא נטען שוב אלא אם הקטלוג ריק לגמרי.

import type { ServiceCatalogItem, QuotationTemplate, QuotationTemplateKind } from '../types/quotations';

// seedKey מזהה שירות לצורך שיוך לתבניות בזמן הזריעה בלבד — לא נשמר ב-DB
export interface SeedService extends Omit<ServiceCatalogItem, 'id'> {
  seedKey: string;
}

export const DEFAULT_SERVICES: SeedService[] = [
  // ─── חודשי ───
  {
    seedKey: 'bookkeeping_exempt',
    name: 'הנהלת חשבונות — עוסק פטור',
    category: 'monthly',
    description: 'ניהול שוטף של הנהלת החשבונות, כולל דיווחים תקופתיים',
    defaultPrice: 80, vatFlag: true, billingType: 'fixed',
    includeByDefault: false, active: true, displayOrder: 10,
  },
  {
    seedKey: 'bookkeeping_licensed',
    name: 'הנהלת חשבונות — עוסק מורשה',
    category: 'monthly',
    description: 'ניהול שוטף של הנהלת החשבונות, כולל דיווחי מע"מ ומקדמות',
    defaultPrice: 350, vatFlag: true, billingType: 'fixed',
    includeByDefault: false, active: true, displayOrder: 20,
  },
  {
    seedKey: 'payroll',
    name: 'חשבות שכר',
    category: 'monthly',
    description: 'הפקת תלושי שכר ודיווחים למוסדות',
    defaultPrice: 80, vatFlag: true, billingType: 'per_unit', unitLabel: 'עובד',
    includeByDefault: false, active: true, displayOrder: 30,
  },
  {
    seedKey: 'paperless',
    name: 'תוכנת הנהלת חשבונות',
    category: 'monthly',
    description: 'סריקה, שמירה וניהול דיגיטלי של החשבוניות והקבלות — ללא ניירת',
    defaultPrice: 10, vatFlag: true, billingType: 'fixed',
    includeByDefault: true, active: true, displayOrder: 35,
  },
  // ─── שנתי ───
  {
    seedKey: 'annual_exempt',
    name: 'דוח שנתי — עוסק פטור',
    category: 'annual',
    description: 'הכנה והגשה של הדוח השנתי למס הכנסה',
    defaultPrice: 1400, vatFlag: true, billingType: 'fixed',
    includeByDefault: false, active: true, displayOrder: 40,
  },
  {
    seedKey: 'annual_licensed',
    name: 'דוח שנתי — עוסק מורשה',
    category: 'annual',
    description: 'הכנה והגשה של הדוח השנתי למס הכנסה',
    defaultPrice: 1800, vatFlag: true, billingType: 'fixed',
    includeByDefault: false, active: true, displayOrder: 50,
  },
  {
    // לקוח שמגיע עם שנים פתוחות — כל שנה מתומחרת כשורה נפרדת בבונה ההצעות
    seedKey: 'annual_prior_year',
    name: 'דוח שנתי — שנה פתוחה',
    category: 'annual',
    description: 'הכנה והגשה של דוח שנתי לשנה שטרם דווחה',
    defaultPrice: 1800, vatFlag: true, billingType: 'fixed',
    includeByDefault: false, active: true, displayOrder: 55,
  },
  // ─── חד־פעמי ───
  {
    seedKey: 'open_files',
    name: 'פתיחת תיקים ברשויות',
    category: 'one_time',
    description: 'פתיחת תיקים במס הכנסה, מע"מ וביטוח לאומי',
    defaultPrice: 300, vatFlag: true, billingType: 'fixed',
    includeByDefault: false, active: true, displayOrder: 60,
  },
  {
    seedKey: 'close_files',
    name: 'סגירת תיקים ברשויות',
    category: 'one_time',
    description: 'סגירה מסודרת של התיקים בכל הרשויות',
    defaultPrice: 300, vatFlag: true, billingType: 'fixed',
    includeByDefault: false, active: true, displayOrder: 70,
  },
  {
    seedKey: 'exempt_to_licensed',
    name: 'מעבר מעוסק פטור לעוסק מורשה',
    category: 'one_time',
    description: 'טיפול מלא בשינוי הסיווג מול הרשויות',
    defaultPrice: 200, vatFlag: true, billingType: 'fixed',
    includeByDefault: false, active: true, displayOrder: 80,
  },
  {
    seedKey: 'capital_declaration_first',
    name: 'הצהרת הון ראשונה',
    category: 'one_time',
    description: 'הכנה והגשה של הצהרת הון ראשונה',
    defaultPrice: 1200, vatFlag: true, billingType: 'fixed',
    includeByDefault: false, active: true, displayOrder: 90,
  },
  {
    seedKey: 'capital_declaration_subsequent',
    name: 'הצהרת הון שנייה ואילך',
    category: 'one_time',
    description: 'הכנה והגשה של הצהרת הון, כולל השוואה להצהרה קודמת',
    defaultPrice: 2000, vatFlag: true, billingType: 'fixed',
    includeByDefault: false, active: true, displayOrder: 100,
  },
  {
    seedKey: 'special_certificate',
    name: 'אישור מיוחד',
    category: 'one_time',
    description: 'הפקת אישור רו"ח לפי דרישה (בנק, מכרז וכד\')',
    defaultPrice: 200, vatFlag: true, billingType: 'fixed',
    includeByDefault: false, active: true, displayOrder: 110,
  },
  // ─── כלול במחיר (0 ₪) ───
  {
    seedKey: 'quarterly_tax_planning',
    name: 'תכנון מס רבעוני',
    category: 'included',
    description: 'בחינה רבעונית של חבות המס והמקדמות',
    defaultPrice: 0, vatFlag: false, billingType: 'fixed',
    includeByDefault: true, active: true, displayOrder: 120,
  },
  {
    seedKey: 'business_guidance',
    name: 'ליווי עסקי',
    category: 'included',
    description: 'ליווי והכוונה עסקית שוטפת',
    defaultPrice: 0, vatFlag: false, billingType: 'fixed',
    includeByDefault: true, active: true, displayOrder: 130,
  },
  {
    seedKey: 'pension_recommendation',
    name: 'המלצה פנסיונית',
    category: 'included',
    description: 'בחינת ההפקדות הפנסיוניות והמלצה לניצול הטבות מס',
    defaultPrice: 0, vatFlag: false, billingType: 'fixed',
    includeByDefault: true, active: true, displayOrder: 140,
  },
  {
    seedKey: 'ongoing_consultation',
    name: 'ייעוץ שוטף',
    category: 'included',
    description: 'זמינות לשאלות ולייעוץ לאורך כל השנה',
    defaultPrice: 0, vatFlag: false, billingType: 'fixed',
    includeByDefault: true, active: true, displayOrder: 150,
  },
  {
    seedKey: 'fines_handling',
    name: 'טיפול בקנסות',
    category: 'included',
    description: 'טיפול בכל הנוגע לקנסות מול הרשויות, לרבות פנייה לביטולם או להקטנתם במידת הצורך',
    defaultPrice: 0, vatFlag: false, billingType: 'fixed',
    includeByDefault: true, active: true, displayOrder: 160,
  },
];

const INCLUDED_KEYS = [
  'quarterly_tax_planning', 'business_guidance', 'pension_recommendation',
  'ongoing_consultation', 'fines_handling',
];

// שירותים שנוספו לקטלוג אחרי הגרסה הראשונה. משתמש שכבר נזרע לא עובר זריעה
// חוזרת, ולכן אלה מתווספים לו בהשלמה חד־פעמית (ראה useQuotationCatalog).
export const TOP_UP_SEED_KEYS = ['paperless', 'fines_handling', 'annual_prior_year'];

export interface SeedTemplate {
  name: string;
  kind: QuotationTemplateKind;
  serviceSeedKeys: string[];
  displayOrder: number;
}

export const DEFAULT_TEMPLATES: SeedTemplate[] = [
  {
    name: 'עוסק פטור',
    kind: 'exempt_dealer',
    serviceSeedKeys: ['bookkeeping_exempt', 'paperless', 'annual_exempt', 'open_files', ...INCLUDED_KEYS],
    displayOrder: 10,
  },
  {
    name: 'עוסק מורשה',
    kind: 'licensed_dealer',
    serviceSeedKeys: ['bookkeeping_licensed', 'paperless', 'annual_licensed', 'open_files', ...INCLUDED_KEYS],
    displayOrder: 20,
  },
  {
    name: 'חברה',
    kind: 'company',
    serviceSeedKeys: ['bookkeeping_licensed', 'paperless', 'payroll', 'annual_licensed', ...INCLUDED_KEYS],
    displayOrder: 30,
  },
  {
    // אין שירות קבוע להחזר מס — המחיר נקבע פר תיק; התבנית קיימת כנקודת פתיחה
    name: 'החזר מס',
    kind: 'tax_refund',
    serviceSeedKeys: [],
    displayOrder: 40,
  },
  {
    name: 'ייצוג בלבד',
    kind: 'representation_only',
    serviceSeedKeys: ['open_files'],
    displayOrder: 50,
  },
];

// ממיר שירות זריעה לאובייקט תבנית — משמש את ה-hook בזמן הזריעה
export function buildTemplateRows(
  templates: SeedTemplate[],
  serviceIdBySeedKey: Record<string, string>,
): Omit<QuotationTemplate, 'id'>[] {
  return templates.map(t => ({
    name: t.name,
    kind: t.kind,
    serviceIds: t.serviceSeedKeys
      .map(k => serviceIdBySeedKey[k])
      .filter((id): id is string => Boolean(id)),
    displayOrder: t.displayOrder,
    active: true,
  }));
}
