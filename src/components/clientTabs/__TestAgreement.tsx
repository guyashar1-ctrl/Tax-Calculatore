// ─── מסך בדיקה — הסכם ותשלומים ─────────────────────────────────────────────
// מרכיב את AgreementPaymentsTab האמיתי מול נתונים מדומים, כדי להשוות אותו
// למקור המאושר docs/prototypes/client-agreement-payments.html בלי לגעת
// בנתוני אמת. פיתוח בלבד — מקומפל החוצה מהאתר החי.
//
// ?test-agreement           — לקוח רגיל עם חיובים פתוחים
// &s=clean                  — שום דבר לגבות (מצב הייחוס לתקרת הצפיפות)
// &s=awaiting               — הצעה ממתינה לאישור הלקוח
// &s=upcoming               — חידוש שאושר וטרם נכנס לתוקף
// &s=renewed                — אחרי שהחידוש נכנס לתוקף (יש התקשרויות קודמות)
// &s=none                   — בלי התקשרות

import { useState } from 'react';
import type { Client } from '../../types';
import type { Engagement } from '../../types/onboarding';
import type { Quotation, QuotationItem } from '../../types/quotations';
import type { AdditionalCharge } from '../../types/charges';
import AgreementPaymentsTab from './AgreementPaymentsTab';

const CLIENT = {
  id: 'c1', firstName: 'ישראל', lastName: 'ישראלי',
  businessName: 'ישראל ישראלי הובלות',
} as unknown as Client;

const ITEMS: QuotationItem[] = [
  { id: 'i1', name: 'הנהלת חשבונות', category: 'monthly', billingType: 'fixed',
    quantity: 1, catalogPrice: 250, clientPrice: 250, vatFlag: true },
  { id: 'i2', name: 'דוח שנתי', year: 2026, category: 'monthly', billingType: 'fixed',
    quantity: 1, catalogPrice: 150, clientPrice: 150, vatFlag: true,
    priceBasis: 'annual', annualPrice: 1800, installments: 5, prorationMode: 'deferred' },
  ...['תוכנת הנהלת חשבונות', 'תכנון מס רבעוני', 'ליווי עסקי שוטף',
      'המלצה פנסיונית', 'ייעוץ שוטף בטלפון', 'טיפול בקנסות ובדרישות'].map((name, n) => ({
    id: `inc${n}`, name, category: 'included' as const, billingType: 'fixed' as const,
    quantity: 1, catalogPrice: 0, clientPrice: 0, vatFlag: false,
  })),
];

const Q1 = {
  id: 'q1', clientId: 'c1', quotationNumber: '2026-0043', revision: 1, status: 'approved',
  kind: 'engagement', items: ITEMS, futureServices: [], vatRate: 18, events: [],
  approvedAt: '2026-08-04T09:00:00Z',
} as unknown as Quotation;

const Q_SENT = {
  id: 'q9', clientId: 'c1', quotationNumber: '2026-0051', revision: 1, status: 'sent',
  kind: 'engagement', items: [], futureServices: [], vatRate: 18, events: [],
} as unknown as Quotation;

const Q_RENEWAL = {
  id: 'q2', clientId: 'c1', quotationNumber: '2026-0051', revision: 1, status: 'approved',
  kind: 'engagement', effectiveFrom: '2027-01-01', items: ITEMS, futureServices: [],
  vatRate: 18, events: [], approvedAt: '2026-11-24T09:00:00Z',
} as unknown as Quotation;

const ENG_CURRENT: Engagement = {
  id: 'e1', clientId: 'c1', quotationId: 'q1', status: 'active',
  monthlyTotal: 365, billingStartMonth: '2026-08', effectiveFrom: '2026-08-01',
  approvedAt: '2026-08-04T09:00:00Z', createdAt: '2026-08-04T09:00:00Z',
};
const ENG_UPCOMING: Engagement = {
  id: 'e2', clientId: 'c1', quotationId: 'q2', status: 'scheduled',
  monthlyTotal: 410, billingStartMonth: '2027-01', effectiveFrom: '2027-01-01',
  approvedAt: '2026-11-24T09:00:00Z', supersedesEngagementId: 'e1', createdAt: '2026-11-24T09:00:00Z',
};
// ‼ "אחרי חידוש" נצפה ממועד שכבר עבר את תאריך התוקף — אחרת הבורר (בצדק)
// לא יראה בהסכם עתידי את ההסכם הנוכחי. הסיפור: הסכם קודם מאוגוסט 2025,
// והחידוש נכנס לתוקף בינואר 2026.
const ENG_ENDED: Engagement = {
  ...ENG_CURRENT, status: 'ended',
  effectiveFrom: '2025-08-01', billingStartMonth: '2025-08', endedAt: '2025-12-31T22:00:00Z',
};
const ENG_NOW_ACTIVE: Engagement = {
  ...ENG_UPCOMING, status: 'active',
  effectiveFrom: '2026-01-01', billingStartMonth: '2026-01',
};

const CHARGES: AdditionalCharge[] = [
  { id: 'ch1', clientId: 'c1', description: 'השלמה לדוח שנתי 2026', amount: 1050,
    currency: 'ILS', status: 'pending', sourceType: 'quotation', sourceQuotationId: 'q1',
    sourceItemId: 'i2', dueTrigger: 'עם הגשת הדוח השנתי' },
  { id: 'ch2', clientId: 'c1', description: 'מעבר מעוסק פטור למורשה', amount: 350,
    currency: 'ILS', status: 'requested', sourceType: 'quotation', sourceQuotationId: 'q1',
    sourceItemId: 'i9', dueDate: '2026-09-15' },
];
const PAID: AdditionalCharge[] = [
  { id: 'p1', clientId: 'c1', description: 'פתיחת תיקים ברשויות', amount: 300,
    currency: 'ILS', status: 'paid', sourceType: 'quotation', sourceQuotationId: 'q1',
    sourceItemId: 'i7', paidAt: '2026-08-06T09:00:00Z' },
  { id: 'p2', clientId: 'c1', description: 'אישור רו״ח מיוחד', amount: 200,
    currency: 'ILS', status: 'paid', sourceType: 'manual', paidAt: '2026-09-02T09:00:00Z' },
];

type Scenario = 'default' | 'clean' | 'awaiting' | 'upcoming' | 'renewed' | 'none';

export default function TestAgreement() {
  const initial = (new URLSearchParams(window.location.search).get('s') ?? 'default') as Scenario;
  const [sc, setSc] = useState<Scenario>(initial);
  const [charges, setCharges] = useState<AdditionalCharge[]>([...CHARGES, ...PAID]);

  const engagements =
    sc === 'none' ? []
    : sc === 'upcoming' ? [ENG_CURRENT, ENG_UPCOMING]
    : sc === 'renewed' ? [ENG_ENDED, ENG_NOW_ACTIVE]
    : [ENG_CURRENT];

  const quotations =
    sc === 'none' ? []
    : sc === 'awaiting' ? [Q1, Q_SENT]
    : sc === 'upcoming' || sc === 'renewed' ? [Q1, Q_RENEWAL]
    : [Q1];

  const visible =
    sc === 'none' ? []
    : sc === 'clean' || sc === 'awaiting' || sc === 'upcoming' || sc === 'renewed'
      ? charges.filter(c => c.status === 'paid')
      : charges;

  return (
    <div style={{ background: 'var(--canvas)', minHeight: '100vh', padding: '24px 0' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 26px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {(['default', 'clean', 'awaiting', 'upcoming', 'renewed', 'none'] as Scenario[]).map(s => (
            <button key={s} onClick={() => setSc(s)}
              style={{
                padding: '4px 10px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                border: `1px solid ${sc === s ? 'var(--accent)' : 'var(--hairline-1)'}`,
                background: sc === s ? 'var(--accent)' : 'var(--surface-0)',
                color: sc === s ? '#fff' : 'var(--ink-3)',
              }}>{s}</button>
          ))}
        </div>
        <AgreementPaymentsTab
          client={CLIENT}
          quotations={quotations}
          engagements={engagements}
          charges={visible}
          onMarkChargePaid={async (c) => {
            const next = { ...c, status: 'paid' as const, paidAt: new Date().toISOString() };
            setCharges(prev => prev.map(x => x.id === c.id ? next : x));
            return next;
          }}
          onNewQuotation={(kind) => window.alert(`בונה ההצעות ייפתח · כוונה: ${kind}`)}
        />
      </div>
    </div>
  );
}
