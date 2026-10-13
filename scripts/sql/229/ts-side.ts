import { ITEMS } from '@src/features/taxYear/catalog';
import { periodFor } from '@src/features/taxYear/asks';
import { followUpFor } from '@src/features/taxYear/documents';
import { legacyModelToFacts } from '@src/features/taxYear/transfer';
import { todayIso } from '@src/utils/dateFormat';
const items = Object.fromEntries(ITEMS.map(i => [i.key, i.kind]));
const periodCases: unknown[] = [];
for (const purpose of ['estimate', 'annual'] as const)
  for (const cutoff of [3, 9, 12])
    for (const it of ITEMS.filter((_, i) => i % 3 === 0 || ['business.forecast', 'capital.estimate', 'donations.changesSince', 'rent.income'].includes(_.key))) {
      const out = periodFor({ client: {} as never, taxYear: 2024, purpose, cutoffMonth: cutoff }, it);
      periodCases.push({ purpose, cutoff, year: 2024, item: it.key, kind: it.kind, out });
    }
const followCases: unknown[] = [];
for (const doc of ['form106', 'form867', 'fundAnnualCert', 'niAnnualCert', 'annualPnl', 'depreciationReport', 'foreignStatement', 'foreignTradeReport', 'foreignTaxCert', 'idCard', 'donationReceipts', 'saleContract'] as const)
  for (const [year, today] of [[2026, '2026-10-11'], [2025, '2026-10-11'], [2025, '2026-01-15'], [2024, '2024-12-31']] as const)
    followCases.push({ doc, year, today, out: followUpFor(doc, year, today).followUpOn });
const model = { taxYear: 2025, identity: {}, spouse: {}, income: { sources: ['salary', 'rental'], rentalGrossAnnual: 48000 }, deductionsCredits: { donationAmount: 2500, hasLifeInsurance: true } } as never;
const legacyFacts = legacyModelToFacts(model, { id: 'S', clientId: 'c1', taxYear: 2025 });
console.log(JSON.stringify({ items, periodCases, followCases, followUp106_2026: followUpFor('form106', 2026, todayIso()).followUpOn, legacyFacts }));
