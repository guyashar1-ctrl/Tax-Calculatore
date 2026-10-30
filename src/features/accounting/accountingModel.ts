import type { Client } from '../../types';
import type { Engagement } from '../../types/onboarding';
import { resolveBillingOwnership } from '../../utils/billingOwnership';
import { round2 } from '../../utils/quotationCalc';
import { accountingName } from './bookkeepingPrompt';

export { accountingName };

/** סכומי ההסכם בלבד — לא תצפית בפייפרלס ולא יתרה היסטורית של חודש. */
export function accountingAgreement(client: Client, clients: Client[], engagements: Engagement[]) {
  const owner = resolveBillingOwnership(client, clients.find(c => c.id === client.spouseClientId), engagements);
  const e = owner.engagement;
  const beforeVat = e?.monthlyTotal ?? null;
  const withVat = e?.monthlyTotalWithVat ?? (beforeVat != null && e?.vatRateAtSigning != null
    ? round2(beforeVat * (1 + e.vatRateAtSigning / 100)) : null);
  return { ownerId: owner.ownerClient?.id, shared: owner.owner === 'spouse', beforeVat, withVat };
}

