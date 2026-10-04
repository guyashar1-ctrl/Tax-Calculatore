// ─── הנוסח בוואטסאפ עוקב אחרי כלל המייל (firstPageEmailKind) ─────────────────
import { test, equal, assert, type TestCase } from '../../testkit/tinyTest';
import { portalShareText, portalShareWelcome } from '../portalShareText';

export const TESTS: TestCase[] = [
  test('קליטה פתוחה ובלי מייל דף — «פתחנו… תהליך ההצטרפות»', () => {
    equal(portalShareWelcome(true, false), true);
    const t = portalShareText('דוד כהן', 'https://x/?portal=1', true);
    assert(t.startsWith('היי דוד,\nפתחנו לך דף אישי'), t);
    assert(t.includes('תהליך ההצטרפות'), t);
    assert(t.includes('\nhttps://x/?portal=1\n'), t);
  }),
  test('בלי קליטה פתוחה, או שכבר יצא מייל דף — נוסח ניטרלי', () => {
    equal(portalShareWelcome(false, false), false);
    equal(portalShareWelcome(true, true), false);
    const t = portalShareText('דוד כהן', 'L', false);
    assert(t.includes('יש לך דף אישי'), t);
    assert(!/פתחנו|הצטרפות/.test(t), t);
  }),
  test('בלי שם — «היי,»', () => {
    assert(portalShareText('  ', 'L', false).startsWith('היי,\n'), 'פתיחה');
  }),
];
