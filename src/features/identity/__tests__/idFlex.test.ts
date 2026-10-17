// ─── העלאת תעודה גמישה: תיוג, שלמות, ברירת מחדל וסדר העמודים (גיא, 16.10.2026) ─────────
import { test, equal, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import {
  completeText, defaultTag, idSetComplete, missingText, orderForPdf, partsManifest, partsSummary, setKindFor, tagOptions,
  type IdTag,
} from '../idFlex';

const jpg = { type: 'image/jpeg', name: 'a.jpg' };

export const TESTS: TestCase[] = [
  test('תמונה אחת של הכול ⇒ הסט שלם', () => {
    equal(idSetComplete('idCard', ['all']), true);
    equal(missingText('idCard', ['all']), null);
  }),
  test('קדמי+ספח ואחורי ⇒ שלם', () => {
    equal(idSetComplete('idCard', ['frontAppendix', 'back']), true);
    equal(idSetComplete('idCard', ['back', 'frontAppendix']), true);
  }),
  test('קדמי בלבד ⇒ «עוד חסר: אחורי, ספח»', () => {
    equal(idSetComplete('idCard', ['front']), false);
    equal(missingText('idCard', ['front']), 'עוד חסר: אחורי, ספח');
  }),
  test('קדמי ואחורי בלי ספח ⇒ «עוד חסר: ספח»; עם ספח ⇒ שלם', () => {
    equal(missingText('idCard', ['front', 'back']), 'עוד חסר: ספח');
    equal(idSetComplete('idCard', ['front', 'back', 'appendix']), true);
    equal(completeText('idCard'), 'הסט שלם: קדמי, אחורי וספח');
  }),
  test('בלי תמונות — אין שבב «חסר» ואין אישור', () => {
    equal(missingText('idCard', []), null);
    equal(idSetComplete('idCard', []), false);
  }),
  test('ברירת מחדל לפי הסדר: קדמי, אחורי, ספח, ואז עוד ספח', () => {
    const tags: IdTag[] = [];
    for (const expected of ['front', 'back', 'appendix', 'appendix'] as IdTag[]) {
      const t = defaultTag('idCard', tags, jpg);
      equal(t, expected);
      tags.push(t);
    }
  }),
  test('ברירת מחדל ממלאת את מה שחסר: אחרי «קדמי+ספח» — אחורי', () => {
    equal(defaultTag('idCard', ['frontAppendix'], jpg), 'back');
    equal(defaultTag('idCard', ['back'], jpg), 'front');
  }),
  test('קובץ PDF — סריקה — ברירת המחדל «הכול יחד»', () => {
    equal(defaultTag('idCard', [], { type: 'application/pdf', name: 'scan.pdf' }), 'all');
    equal(defaultTag('idCard', ['front'], { type: '', name: 'scan.PDF' }), 'all');
  }),
  test('רישיון נהיגה: קדמי ואחורי, בלי ספח; «שני הצדדים יחד» מספיק', () => {
    equal(missingText('driverLicense', ['front']), 'עוד חסר: אחורי');
    equal(idSetComplete('driverLicense', ['front', 'back']), true);
    equal(idSetComplete('driverLicense', ['all']), true);
    deepEqual(tagOptions('driverLicense').map(o => o.value), ['front', 'back', 'all']);
    equal(tagOptions('driverLicense')[2].label, 'שני הצדדים יחד');
  }),
  test('דרכון: עמוד אחד, בלי בחירה', () => {
    deepEqual(tagOptions('passport'), []);
    equal(defaultTag('passport', [], jpg), 'page');
    equal(idSetComplete('passport', ['page']), true);
    equal(idSetComplete('passport', []), false);
  }),
  test('«ת.ז. או רישיון» — ברירת המחדל תעודת זהות, והלקוח יכול לבחור רישיון', () => {
    equal(setKindFor('idOrLicense'), 'idCard');
    equal(setKindFor('idOrLicense', 'driverLicense'), 'driverLicense');
    equal(setKindFor('passport', 'driverLicense'), 'passport');
  }),
  test('סדר העמודים ב-PDF: קדמי לפני אחורי, ספח בסוף — גם כשצורפו הפוך', () => {
    const items = [{ tag: 'appendix' as IdTag, n: 'c' }, { tag: 'back' as IdTag, n: 'b' }, { tag: 'front' as IdTag, n: 'a' }];
    deepEqual(orderForPdf(items).map(x => x.n), ['a', 'b', 'c']);
    const combo = [{ tag: 'back' as IdTag, n: 'b' }, { tag: 'frontAppendix' as IdTag, n: 'fa' }];
    deepEqual(orderForPdf(combo).map(x => x.n), ['fa', 'b']);
  }),
  test('שני עמודי ספח נשארים בסדר הצירוף', () => {
    const items = [{ tag: 'appendix' as IdTag, n: 's1' }, { tag: 'front' as IdTag, n: 'f' }, { tag: 'appendix' as IdTag, n: 's2' }];
    deepEqual(orderForPdf(items).map(x => x.n), ['f', 's1', 's2']);
  }),
  test('ההרכב שנשמר: עמוד ⇒ מה הוא, ותקציר למשרד', () => {
    const m = partsManifest('idCard', [
      { tag: 'back', name: 'b.jpg', type: 'image/jpeg', size: 3 },
      { tag: 'frontAppendix', name: 'fa.jpg', type: 'image/jpeg', size: 5, rotation: 90 },
    ]);
    deepEqual(m.map(p => [p.page, p.part, p.tag]), [[1, 'קדמי + ספח יחד', 'frontAppendix'], [2, 'צד אחורי', 'back']]);
    equal(m[0].rotation, 90);
    equal(partsSummary(m), 'קדמי+ספח · אחורי');
    equal(partsSummary([{ part: 'צד קדמי' }]), 'צד קדמי');
    equal(partsSummary(null), '');
  }),
];
