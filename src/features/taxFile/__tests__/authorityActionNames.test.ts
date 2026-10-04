// ─── בדיקות: לפעולת קריאה אחת יש שם אחד ────────────────────────────────────
// ‼ אותה קריאה נקראה בשלושה שמות: «עדכן נתונים משע״ם» בתיק המס, «עדכון נתוני
// תיק…» באוטומציות ו«קריאת תיק…» במסלולים. הכפתור בתיק המס נקרא מ-FLOW_ACTION_NAMES.

import { test, equal } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { AUTHORITY_AUTOMATION } from '../authorityAutomation';
import { FLOW_ACTION_NAMES } from '../../flows/types';
import { SHAAM_SYNC_INCOME_TAX_ACTION_TYPE, BTL_SYNC_FILE_ACTION_TYPE } from '../../../types/automation';
import btlPanel from '../../../components/authorities/BtlPortalRecordPanel.tsx?raw';
import btl6101 from '../../smartForms/btl6101/Btl6101Lifecycle.tsx?raw';

export const TESTS: TestCase[] = [
  test('כפתורי הקריאה בתיק המס = השם במסלולים ובאוטומציות', () => {
    equal(AUTHORITY_AUTOMATION.income_tax!.actionLabel, FLOW_ACTION_NAMES[SHAAM_SYNC_INCOME_TAX_ACTION_TYPE]);
    equal(AUTHORITY_AUTOMATION.national_insurance!.actionLabel, FLOW_ACTION_NAMES[BTL_SYNC_FILE_ACTION_TYPE]);
    equal(AUTHORITY_AUTOMATION.income_tax!.actionLabel, 'קריאת תיק מס הכנסה מהשע״ם');
    equal(AUTHORITY_AUTOMATION.national_insurance!.actionLabel, 'קריאת התיק בביטוח לאומי');
  }),
  test('טקסטים שמפנים לכפתור משתמשים באותו שם', () => {
    for (const src of [String(btlPanel), String(btl6101)]) {
      equal(src.includes('עדכן נתונים מביטוח לאומי'), false);
      equal(src.includes(`«${FLOW_ACTION_NAMES[BTL_SYNC_FILE_ACTION_TYPE]}»`), true);
    }
  }),
];
