// ─── איזה פריט נענה ברשומה מובנית, ואיך ישויות מהתיק מסוננות לתקופה (13.10.2026) ─────────
// ‼ טהור. מחבר בין הקטלוג (catalog.ts — מפתחות קבועים), הסכמות (records.ts) והתחולה (temporal.ts).

import type { Client } from '../../types';
import { cardDealerKind } from '../taxFile/editModel';
import type { RecordSchemaId, YearFact } from './types';
import { accountSpan, answeredRelevance, entityRelevance, propertySpan, type Period, type Relevance } from './temporal';

/** פריט ← סכמת רשומה. פריט אישור (confirm): «משהו השתנה» פותח את הרשומה עם מה שבתיק. פריט פרטים: הרשומה היא השאלה. */
export const RECORD_OF: Record<string, RecordSchemaId> = {
  'household.children': 'children', 'intake.children': 'children', 'intake.address': 'address',
  'salary.employers': 'employer', 'intake.employers': 'employer', 'salary.employerDetails': 'employer', 'intake.employerDetails': 'employer',
  'intake.business': 'business', 'intake.businessDetails': 'business',
  'rent.properties': 'property', 'intake.rentals': 'property', 'intake.propertyDetails': 'property', 'wealth.realEstate.details': 'property', 'wealth.realEstate.list': 'property',
  'capital.accounts': 'account', 'intake.investments': 'account', 'intake.accountDetails': 'account', 'wealth.securities.list': 'account',
  'intake.funds': 'fund', 'intake.fundDetails': 'fund', 'savings.fundDetails': 'fund', 'wealth.funds.list': 'fund',
  'intake.foreignDetails': 'foreign', 'foreign.sourceDetails': 'foreign', 'wealth.bank.foreign': 'foreign',
  'intake.bankAccount': 'bank', 'filing.refundAccount': 'bank',
  'business.vehicleDetails': 'vehicle', 'business.partners': 'partners', 'rent.coOwners': 'partners',
  'niBenefits.maternityPeriod': 'maternityPeriod', 'niBenefits.maternityAmounts': 'maternityAmounts',
  'intake.marriageYear': 'familyYear', 'intake.divorceYear': 'familyYear', 'intake.widowhoodYear': 'familyYear',
  'period.property': 'period', 'period.account': 'period', 'wealth.period.property': 'period', 'wealth.period.account': 'period',
};

/** פריטי התחולה — אחד לכל סוג ישות ולכל סוג בקשה. */
export const PERIOD_ITEM: Record<'property' | 'account', { annual: string; wealth: string }> = {
  property: { annual: 'period.property', wealth: 'wealth.period.property' },
  account: { annual: 'period.account', wealth: 'wealth.period.account' },
};
export const isPeriodItem = (key: string) => /^(wealth\.)?period\./.test(key);

/** פריטים שהרשימה שלהם מסוננת לתקופה (נכסים, חשבונות). */
const LIST_KIND: Record<string, 'property' | 'account'> = {
  'rent.properties': 'property', 'wealth.realEstate.list': 'property',
  'capital.accounts': 'account', 'wealth.securities.list': 'account',
};
export const listKindOf = (itemKey: string) => LIST_KIND[itemKey];

export interface EntityRel { ref: string; rel: Relevance; label: string }

/**
 * הנכסים או החשבונות שבתיק — כל אחד עם התחולה שלו לתקופה. תשובה מפורשת (פריט התחולה) גוברת על הכרטיס.
 * ‼ «ממתי» לא ידוע ⇒ 'unknown' ⇒ שואלים. מועד הבדיקה של התיק אינו תחולה.
 */
export function entitiesInPeriod(kind: 'property' | 'account', c: Client, period: Period, facts: YearFact[], taxYear: number, purpose: 'annual' | 'estimate' | 'wealth'): EntityRel[] {
  const periodKey = purpose === 'wealth' ? PERIOD_ITEM[kind].wealth : PERIOD_ITEM[kind].annual;
  if (kind === 'property') {
    return (c.properties ?? []).map(p => ({
      ref: p.id,
      rel: entityRelevance(period, propertySpan(p as never), answeredRelevance(facts, periodKey, p.id, taxYear)),
      label: [p.address, p.city].filter(Boolean).join(', ') || 'נכס',
    }));
  }
  return (c.investmentAccounts ?? []).map(a => ({
    ref: a.id,
    rel: entityRelevance(period, accountSpan(a as never), answeredRelevance(facts, periodKey, a.id, taxYear)),
    label: a.institutionName || 'חשבון',
  }));
}

/**
 * סוג העוסק של האדם לפי התיק (סוג עוסק / סיווג מע״מ) — או null. בן/בת זוג בלי נתונים ⇒ null (לא נופל).
 * ‼ «רשום כעוסק» ≠ «העסק רשום»: רשימת העסקים יכולה להיות ריקה גם כשהסוג ידוע (13.10.2026, גיא).
 */
export function dealerOf(c: Client, role: string) {
  const p = role === 'spouse' ? c.spouse : c;
  return p ? cardDealerKind(p as never) : null;
}
