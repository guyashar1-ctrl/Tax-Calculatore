// ─── צדדי תעודה: מתי אפשר לאשר, ובאיזה סדר נבנה ה-PDF (גיא, 12.10.2026) ─────────
import { test, equal } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { idMissingText, idOrderedFiles, idReady, idSlotsFor, defaultIdMode, type IdParts } from '../idSides';

const f = (name: string) => ({ file: new File(['x'], name, { type: 'image/jpeg' }) });

export const TESTS: TestCase[] = [
  test('צד קדמי לבד — אי אפשר לאשר, ונאמר שנשאר האחורי', () => {
    const p: IdParts = { front: f('front.jpg') };
    equal(idReady('sides', p), false);
    equal(idMissingText('sides', p, 'idCard'), 'נשאר להוסיף את הצד האחורי');
  }),
  test('צד אחורי לבד — נשאר הקדמי', () => {
    equal(idMissingText('sides', { back: f('b.jpg') }, 'idCard'), 'נשאר להוסיף את הצד הקדמי');
  }),
  test('שני הצדדים — אפשר לאשר, והסדר קדמי ואז אחורי (גם כשהאחורי נוסף ראשון)', () => {
    const p: IdParts = { back: f('back.jpg'), front: f('front.jpg') };
    equal(idReady('sides', p), true);
    equal(idOrderedFiles('sides', p).map(x => x.name).join(','), 'front.jpg,back.jpg');
  }),
  test('ספח נכנס אחרי שני הצדדים', () => {
    const p: IdParts = { extra: f('x.jpg'), back: f('b.jpg'), front: f('a.jpg') };
    equal(idOrderedFiles('sides', p).map(x => x.name).join(','), 'a.jpg,b.jpg,x.jpg');
  }),
  test('קובץ אחד עם שני הצדדים — מספיק לבדו', () => {
    equal(idReady('single', { single: f('both.jpg') }), true);
    equal(idOrderedFiles('single', { single: f('both.jpg'), front: f('ignored.jpg') }).map(x => x.name).join(','), 'both.jpg');
  }),
  test('דרכון — עמוד אחד כברירת מחדל; רישיון — שני צדדים בלי ספח', () => {
    equal(defaultIdMode('passport'), 'single');
    equal(idSlotsFor('driverLicense', 'sides').join(','), 'front,back');
    equal(idSlotsFor('idCard', 'sides').join(','), 'front,back,extra');
  }),
];
