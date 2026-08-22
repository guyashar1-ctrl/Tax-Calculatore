// ─── מסך בדיקה — בונה הצעות המחיר ───────────────────────────────────────────
// מרכיב את QuotationBuilder האמיתי מול קטלוג ותבניות מדומים, כדי להשוות אותו
// למקור המאושר docs/prototypes/quotation-builder-exception-based.html בלי
// לגעת בנתוני אמת. פיתוח בלבד.
//
// ?test-builder            — הצעה חדשה לליד (עוסק מורשה, אוגוסט)
// &s=jan                   — התחלה בינואר (אין יתרת דוח)
// &s=onetime               — הצעה לשירות חד־פעמי ללקוח קיים
// &s=renewal               — עדכון התקשרות ללקוח עם הסכם קיים

import type { Client } from '../../types';
import type { Engagement } from '../../types/onboarding';
import type { Lead, Quotation, QuotationTemplate, ServiceCatalogItem, QuotationKind } from '../../types/quotations';
import QuotationBuilder from './QuotationBuilder';

const svc = (
  id: string, name: string, category: ServiceCatalogItem['category'],
  defaultPrice: number, displayOrder: number,
): ServiceCatalogItem => ({
  id, name, category, defaultPrice, vatFlag: category !== 'included' || defaultPrice > 0,
  billingType: 'fixed', includeByDefault: category === 'included', active: true, displayOrder,
});

const SERVICES: ServiceCatalogItem[] = [
  svc('bk', 'הנהלת חשבונות', 'monthly', 250, 10),
  svc('bk_ex', 'הנהלת חשבונות — עוסק פטור', 'monthly', 80, 20),
  svc('payroll', 'חשבות שכר', 'monthly', 80, 30),
  svc('annual', 'דוח שנתי', 'annual', 1800, 40),
  svc('annual_prior', 'דוח שנתי — שנה פתוחה', 'annual', 1800, 50),
  svc('open_files', 'פתיחת תיקים ברשויות', 'one_time', 300, 60),
  svc('to_licensed', 'מעבר מעוסק פטור לעוסק מורשה', 'one_time', 200, 70),
  svc('capital1', 'הצהרת הון ראשונה', 'one_time', 1200, 80),
  svc('capital2', 'הצהרת הון שנייה ואילך', 'one_time', 2000, 90),
  svc('cert', 'אישור מיוחד', 'one_time', 200, 100),
  svc('paperless', 'תוכנת הנהלת חשבונות', 'included', 30, 110),
  svc('quarterly', 'תכנון מס רבעוני', 'included', 0, 120),
  svc('biz', 'ליווי עסקי', 'included', 0, 130),
  svc('pension', 'המלצה פנסיונית', 'included', 0, 140),
  svc('advice', 'ייעוץ שוטף', 'included', 0, 150),
  svc('fines', 'טיפול בקנסות', 'included', 0, 160),
];

const INCLUDED = ['paperless', 'quarterly', 'biz', 'pension', 'advice', 'fines'];

const TEMPLATES: QuotationTemplate[] = [
  {
    id: 't_lic', name: 'עוסק מורשה', kind: 'licensed_dealer',
    serviceIds: ['bk', 'annual', ...INCLUDED],
    futureServiceIds: ['capital1', 'capital2', 'cert'],
    displayOrder: 10, active: true,
  },
  {
    id: 't_ex', name: 'עוסק פטור', kind: 'exempt_dealer',
    serviceIds: ['bk_ex', 'annual', ...INCLUDED],
    futureServiceIds: ['to_licensed', 'capital1', 'cert'],
    displayOrder: 20, active: true,
  },
  {
    id: 't_co', name: 'חברה', kind: 'company',
    serviceIds: ['bk', 'payroll', 'annual', ...INCLUDED],
    futureServiceIds: ['capital1', 'cert'],
    displayOrder: 30, active: true,
  },
];

const LEAD: Lead = {
  id: 'l1', fullName: 'ישראל ישראלי', businessName: 'ישראל ישראלי הובלות',
  email: 'israel@example.co.il', phone: '0501234567', dealerType: 'licensed', status: 'new',
};

const CLIENT = {
  id: 'c1', firstName: 'יובל', lastName: 'גרוסמן', businessName: 'גרוסמן עיצובים',
  email: 'yuval@example.co.il', representationStatus: 'active',
} as unknown as Client;

const CURRENT_Q = {
  id: 'q_cur', clientId: 'c1', quotationNumber: '2026-016', revision: 1, status: 'approved',
  kind: 'engagement', vatRate: 18, futureServices: [], events: [],
  items: [
    { id: 'a', name: 'הנהלת חשבונות', category: 'monthly', billingType: 'fixed', quantity: 1,
      catalogPrice: 250, clientPrice: 250, vatFlag: true, billingStartMonth: '2026-08', installments: 5 },
    { id: 'b', name: 'דוח שנתי', year: 2026, category: 'monthly', billingType: 'fixed', quantity: 1,
      catalogPrice: 150, clientPrice: 150, vatFlag: true, priceBasis: 'annual', annualPrice: 1800,
      installments: 5, prorationMode: 'deferred' },
  ],
} as unknown as Quotation;

const ENGAGEMENT: Engagement = {
  id: 'e1', clientId: 'c1', quotationId: 'q_cur', status: 'active',
  monthlyTotal: 400, billingStartMonth: '2026-08', effectiveFrom: '2026-08-01',
};

export default function TestBuilder() {
  const p = new URLSearchParams(window.location.search);
  const s = p.get('s') ?? '';
  const kind: QuotationKind = s === 'onetime' ? 'one_time' : 'engagement';
  const forClient = s === 'onetime' || s === 'renewal';

  return (
    <div style={{ background: 'var(--canvas)', minHeight: '100vh' }}>
      <QuotationBuilder
        profile={null}
        services={SERVICES}
        templates={TEMPLATES}
        leads={[LEAD]}
        clients={[CLIENT]}
        existing={null}
        initialLeadId={forClient ? undefined : 'l1'}
        initialClientId={forClient ? 'c1' : undefined}
        initialKind={kind}
        currentEngagement={forClient ? ENGAGEMENT : undefined}
        existingQuotations={[CURRENT_Q]}
        checkRepEmailConflict={() => null}
        onSaveDraft={async () => { window.alert('שמירת טיוטה'); }}
        onSend={async (_payload, isTest) => { window.alert(isTest ? 'מייל בדיקה' : 'שליחה ללקוח'); return { ok: true }; }}
        onBack={() => window.alert('חזרה')}
      />
    </div>
  );
}
