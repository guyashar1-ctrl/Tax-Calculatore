// ─── בדיקות: פריטים פתוחים (10.10.2026) ─────────────────────────────────────
// ‼ פריט שלא נסגר חייב להגיד מה נבדק, על מה הוא משפיע ומה המערכת עושה בינתיים;
// פריט שנסגר חייב הכרעה. הפניות לנושא ולכללים חייבות להתקיים — אחרת הפריט
// מצביע על משהו שהשתנה בלי שמישהו עדכן אותו.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { OPEN_ITEMS, openItemProblems } from '../openItems';
import { ALL_RULES } from '../rules';
import { TOPICS } from '../../taxKnowledge/topics';

export const TESTS: TestCase[] = [
  test('כל פריט עומד בדרישות: מה נבדק, על מה משפיע, בינתיים, הכרעה כשנסגר', () => {
    const bad = OPEN_ITEMS.map(i => ({ id: i.id, p: openItemProblems(i) })).filter(x => x.p.length > 0);
    equal(JSON.stringify(bad), '[]');
  }),
  test('מזהים ייחודיים, והפניות לנושא ולכללים קיימות', () => {
    equal(new Set(OPEN_ITEMS.map(i => i.id)).size, OPEN_ITEMS.length);
    const topicIds = new Set(TOPICS.map(t => t.id));
    const ruleIds = new Set(ALL_RULES.map(r => r.id));
    for (const i of OPEN_ITEMS) {
      if (i.topicId) assert(topicIds.has(i.topicId), `${i.id}: נושא לא קיים ${i.topicId}`);
      for (const r of i.ruleIds ?? []) assert(ruleIds.has(r), `${i.id}: כלל לא קיים ${r}`);
    }
  }),
  test('פריט שלא נסגר מפרט לפחות שני מקורות שנבדקו או מקור אחד עם מה שנמצא', () => {
    for (const i of OPEN_ITEMS.filter(x => x.status !== 'closed')) {
      assert(i.checked.length >= 1 && i.checked.every(c => c.source.length > 5 && c.found.length > 3), `${i.id}: «מה נבדק» ריק או חלקי`);
      assert(i.missing.length > 10, `${i.id}: «מה חסר» לא מפורט`);
    }
  }),
  test('פער פתוח חוסם חישוב, לא איסוף: לכל פריט שלא נסגר כתוב מה נאסף בכל זאת', () => {
    for (const i of OPEN_ITEMS.filter(x => x.status !== 'closed')) assert(!!i.collection && i.collection.length > 5, `${i.id}: חסר «איסוף מידע»`);
  }),
  test('פריט חסום לא מצביע על כלל שמסומן לחישוב', () => {
    for (const i of OPEN_ITEMS.filter(x => x.status !== 'closed' && x.meanwhile === 'blocked')) {
      for (const id of i.ruleIds ?? []) {
        const r = ALL_RULES.find(x => x.id === id)!;
        assert(!r.computable, `${i.id}: הכלל ${id} מסומן לחישוב למרות שהפריט חסום`);
      }
    }
  }),
];
