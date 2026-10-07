// ─── בדיקות: אנשי קשר (226) ─────────────────────────────────────────────────
// ‼ מה נעול כאן:
//   · חיפוש לפי שם, תפקיד, מקום עבודה, מייל וטלפון (בכל פורמט) — לפי א״ב.
//   · מייל אחד = איש קשר אחד: כפילות נמצאת גם באותיות גדולות וברווחים.
//   · שמירה: שדה שנוקה נשלח כ-NULL (ולא נשאר הערך הישן), ומייל באותיות קטנות.

import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { searchContacts, duplicateContact, contactToDb, contactSubtitle, type Contact } from '../contactModel';

const LIST: Contact[] = [
  { id: '1', fullName: 'רונית אברהם', role: 'רו״ח', organization: 'אברהם ושות׳', email: 'ronit@avraham.example', phone: '03-5551234' },
  { id: '2', fullName: 'יעל ברק', role: 'עו״ד', organization: 'ברק ושות׳', email: 'Yael@Barak.example' },
  { id: '3', fullName: 'אבי דוד', role: 'יועץ/ת פנסיוני/ת', organization: 'הראל' },
];

export const TESTS: TestCase[] = [
  test('חיפוש: שם, תפקיד, מקום עבודה, מייל וטלפון', () => {
    deepEqual(searchContacts(LIST, 'רונית').map(c => c.id), ['1']);
    deepEqual(searchContacts(LIST, 'עו״ד').map(c => c.id), ['2']);
    deepEqual(searchContacts(LIST, 'הראל').map(c => c.id), ['3']);
    deepEqual(searchContacts(LIST, 'barak').map(c => c.id), ['2']);
    deepEqual(searchContacts(LIST, '+972 3 555').map(c => c.id), ['1']);
    deepEqual(searchContacts(LIST, '').map(c => c.id), ['3', '2', '1'], 'בלי חיפוש — לפי א״ב');
  }),
  test('כפילות לפי מייל — גם באותיות גדולות ורווחים, אבל לא מול עצמו', () => {
    equal(duplicateContact(LIST, ' yael@barak.EXAMPLE ')?.id, '2');
    equal(duplicateContact(LIST, 'yael@barak.example', '2'), undefined);
    equal(duplicateContact(LIST, ''), undefined);
  }),
  test('שמירה: ריק ⇒ NULL, מייל באותיות קטנות, רק מה שנמסר', () => {
    deepEqual(contactToDb({ fullName: ' דנה ', email: ' Dana@X.com ', role: '', organization: 'משרד' }),
      { full_name: 'דנה', email: 'dana@x.com', role: null, organization: 'משרד' });
    deepEqual(contactToDb({ phone: '' }), { phone: null });
  }),
  test('שורת משנה: תפקיד · מקום עבודה', () => {
    equal(contactSubtitle(LIST[0]), 'רו״ח · אברהם ושות׳');
    equal(contactSubtitle({ organization: 'הראל' }), 'הראל');
    assert(contactSubtitle({}) === '', 'ריק');
  }),
];
