// ─── בדיקות: שם בן/בת הזוג נקרא מהשדות החדשים ───────────────────────────────
// ‼ אחרי שמחקו את השם בתיק המס, השורה המשיכה להציג את השם הישן מתוך
// האובייקט `client.spouse`. השדות החדשים (פרטי/משפחה/«שם בן/בת הזוג») קובעים.

import { test, equal } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { spouseDisplayName, spouseNameOnCard } from '../profile';

const legacy = { firstName: 'רחל', lastName: 'ישנה' };
const c = (over: Partial<Client>) => ({ firstName: 'דוד', lastName: 'כהן', ...over }) as unknown as Client;

export const TESTS: TestCase[] = [
  test('פרטי + משפחה גוברים על השרשור ועל האובייקט הישן', () => {
    equal(spouseDisplayName(c({ spouseFirstName: 'מיכל', spouseLastName: 'כהן', spouseName: 'מ כ', spouse: legacy as never })), 'מיכל כהן');
  }),
  test('רק «שם בן/בת הזוג» — הוא השם', () => {
    equal(spouseDisplayName(c({ spouseName: 'מיכל כהן', spouse: legacy as never })), 'מיכל כהן');
  }),
  test('השם נמחק בתיק המס ⇒ לא חוזר מהעותק הישן', () => {
    equal(spouseNameOnCard(c({ spouseFirstName: '', spouseLastName: '', spouseName: '', spouse: legacy as never })), '');
    equal(spouseDisplayName(c({ spouseName: '', spouse: legacy as never })), 'בן/בת הזוג');
  }),
  test('כרטיס ישן שלא נשמרו בו השדות החדשים ⇒ האובייקט הישן עדיין משמש', () => {
    equal(spouseDisplayName(c({ spouse: legacy as never })), 'רחל ישנה');
  }),
  test('אין שם בכלל ⇒ «בן/בת הזוג»', () => {
    equal(spouseDisplayName(c({})), 'בן/בת הזוג');
  }),
];
