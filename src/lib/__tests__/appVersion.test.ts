// ─── בדיקות: זיהוי גרסה חדשה של האפליקציה ──────────────────────────────────
// ‼ 23.09.2026: לשונית שנפתחה לפני פריסת 55d306e המשיכה להריץ את הקוד הישן.

import { test, equal } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import { mainBundleName, isNewVersionAvailable } from '../appVersion';

const SERVED = '<script type="module" crossorigin src="/assets/index-byIHpDcT.js"></script><link rel="stylesheet" href="/assets/index-Pc8L7dhu.css">';

export const TESTS: TestCase[] = [
  test('שם ה-bundle נקרא מה-HTML ומכתובת הסקריפט', () => {
    equal(mainBundleName(SERVED), 'index-byIHpDcT.js');
    equal(mainBundleName('https://crm.yasharcpa.co.il/assets/index-BZjrTmJM.js'), 'index-BZjrTmJM.js');
    equal(mainBundleName('<html>אין סקריפט</html>'), null);
  }),
  test('לשונית עם bundle ישן ⇒ יש גרסה חדשה', () => {
    equal(isNewVersionAvailable('index-BZjrTmJM.js', SERVED), true);
  }),
  test('אותו bundle, או HTML שלא נקרא ⇒ לא מטרידים', () => {
    equal(isNewVersionAvailable('index-byIHpDcT.js', SERVED), false);
    equal(isNewVersionAvailable('index-byIHpDcT.js', ''), false);
    equal(isNewVersionAvailable(null, SERVED), false);
  }),
];
