// ─── בדיקות: השורה האחת בראש תיק המס (21.10.2026) ────────────────────────────
// ‼ החוזה: בלי לוכסנים (מגדר הכרטיס, ניטרלי כשלא ידוע), בלי «ממתי? טרם נרשם», ו«רשום על» רק כשהוכרע.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import type { IncomeTaxHouseholdState } from '../../../utils/personRepresentation';
import { familyPhrase, taxFileHeadline } from '../headline';

const card = (p: Partial<Client>) => ({
  firstName: 'דוד', lastName: 'כהן', familyStatus: 'married', incomeTaxType: 'employee', gender: 'male',
  spouseFirstName: 'רחל', taxFiles: [], ...p,
}) as unknown as Client;
const none: IncomeTaxHouseholdState = { represented: false, holder: 'none', registeredVerified: false };

export const TESTS: TestCase[] = [
  test('נשוי / נשואה / ניטרלי — עם השם הפרטי, בלי לוכסן', () => {
    equal(familyPhrase(card({})), 'נשוי לרחל');
    equal(familyPhrase(card({ gender: 'female', spouseFirstName: 'דוד' })), 'נשואה לדוד');
    equal(familyPhrase(card({ gender: null as never })), 'בנישואין לרחל');
    equal(familyPhrase(card({ familyStatus: 'single', gender: 'female' })), 'רווקה');
    for (const fs of ['single', 'married', 'divorced', 'widowed', 'singleParent'] as const)
      for (const g of ['male', 'female', null] as const)
        assert(!familyPhrase(card({ familyStatus: fs, gender: g as never })).includes('/'), `לוכסן: ${fs}/${g}`);
  }),
  test('השורה: סוג · מצב · תיק משותף — בלי «ממתי» ובלי «הכנסות:»', () => {
    const files = [{ authority: 'income_tax', owner: 'client', status: 'active' }] as never;
    const c = card({ taxFiles: files, registeredSpouseVerified: true });
    const h: IncomeTaxHouseholdState = { represented: true, holder: 'own', holderClient: c, registeredVerified: true };
    equal(taxFileHeadline(c, h), 'שכיר · נשוי לרחל · תיק משותף, רשום על דוד');
    const u = card({ taxFiles: files });
    equal(taxFileHeadline(u, { ...h, holderClient: u }), 'שכיר · נשוי לרחל · תיק משותף', '«רשום על» רק כשהוכרע');
    const line = taxFileHeadline(card({ marriageYear: undefined }), none);
    equal(line, 'שכיר · נשוי לרחל');
    assert(!/ממתי|טרם נרשם|הכנסות:/.test(line), line);
  }),
  test('בן/בת הזוג אצל רו״ח אחר — ניסוח ניטרלי', () => {
    equal(taxFileHeadline(card({ spouseRepresentedElsewhere: true }), none), 'שכיר · נשוי לרחל · לרחל רו״ח אחר');
  }),
];
