// ─── בדיקות: הוספה ומחיקה של תבנית הצעה (4.10.2026) ─────────────────────────
// ‼ מה נעול כאן:
//   · «תבניות הצעה» אפשרו רק עריכה — משרד חדש לא יכול היה ליצור תבנית או
//     להסיר אחת. ההוספה והמחיקה כבר היו בשכבת הנתונים (useQuotationCatalog).
//   · תבנית חדשה: «מותאם אישית», בסוף הרשימה, פעילה, בלי מחירון «אם וכאשר».

import { test, equal, deepEqual, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { newTemplateDraft } from '../templateDraft';
import SETTINGS_SOURCE from '../QuotationSettings.tsx?raw';

export const TESTS: TestCase[] = [
  test('תבנית ראשונה: סדר 1, מותאם אישית, פעילה', () => {
    const d = newTemplateDraft([], '  ליווי בסיסי ', ['s1', 's2']);
    deepEqual(d, { name: 'ליווי בסיסי', kind: 'custom', serviceIds: ['s1', 's2'], futureServiceIds: [], displayOrder: 1, active: true });
  }),

  test('נכנסת בסוף הרשימה', () => {
    equal(newTemplateDraft([{ displayOrder: 3 }, { displayOrder: 7 }, { displayOrder: 5 }], 'x', []).displayOrder, 8);
  }),

  test('רשימת השירותים מועתקת, לא משותפת', () => {
    const ids = ['a'];
    const d = newTemplateDraft([], 'x', ids);
    ids.push('b');
    deepEqual(d.serviceIds, ['a']);
  }),

  test('המסך מחובר: «＋ תבנית» מוסיף, והמחיקה בחלון העריכה בלבד', () => {
    assert(SETTINGS_SOURCE.includes('＋ תבנית'), 'כפתור ההוספה');
    assert(/catalog\.addTemplate\(newTemplateDraft\(/.test(SETTINGS_SOURCE), 'הוספה דרך newTemplateDraft');
    assert(/onDelete=\{editing !== 'new' \? async \(\) => \{ await catalog\.deleteTemplate\(editing\.id\)/.test(SETTINGS_SOURCE), 'מחיקה רק לתבנית קיימת');
  }),
];
