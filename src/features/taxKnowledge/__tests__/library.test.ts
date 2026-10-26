import { assert, deepEqual, equal, test, type TestCase } from '../../../testkit/tinyTest';
import { advanceTrail, DOMAINS, formatAreaPath, itemOf, parseAreaPath, returnTargetOf } from '../../taxArea/areaModel';
import { entryPath, LIBRARY_ENTRIES, LIBRARY_TOOLS } from '../libraryModel';
import { TOPICS } from '../topics';
import { learningUnitsOf, topicViewOf } from '../learnPath';

export const TESTS: TestCase[] = [
  test('כניסה מתיק יכולה לפתוח יישום, אבל בחירה מפורשת בלימוד תמיד פותחת את המפה', () => {
    const toc = [{ id: 'intro', label: 'מושגי יסוד' }, { id: 'do', label: 'מה עושים בתיק' }];
    equal(topicViewOf(null, true, true, toc).view, 'apply');
    equal(topicViewOf('plan', true, true, toc).view, 'plan');
    equal(topicViewOf('summary', true, true, toc).view, 'summary');
    equal(topicViewOf('intro', true, true, toc).view, 'lesson');
    deepEqual(learningUnitsOf('future-topic', toc).flatMap(u => u.ids), ['intro']);
  }),
  test('כל נושא מקצועי קיים נשאר נגיש בספרייה, פעם אחת', () => {
    equal(new Set(LIBRARY_ENTRIES.map(e => e.id)).size, LIBRARY_ENTRIES.length);
    for (const t of TOPICS) {
      const e = LIBRARY_ENTRIES.find(e => !e.domain && e.id === t.id);
      assert(e, `נושא חסר: ${t.id}`);
      equal(itemOf(parseAreaPath(formatAreaPath(entryPath(e!))))?.id, t.id);
    }
  }),
  test('הספרייה אינה מחליפה את כלי העבודה במחברות: כל כלי נשאר באינדקס הכלים', () => {
    const existing = DOMAINS.flatMap(d => d.items.filter(i => i.kind === 'tool' && !['map1301', 'maintenance'].includes(i.id)));
    deepEqual(LIBRARY_TOOLS.map(t => t.id).sort(), existing.map(t => t.id).sort());
    for (const t of LIBRARY_TOOLS) equal(itemOf(parseAreaPath(`learn/${t.domain}/${t.id}`))?.id, t.id);
  }),
  test('כלים וטפסים הם כתובות יציבות, גם ברענון ובהעתקה', () => {
    for (const directory of ['tools', 'forms'] as const) {
      const p = { mode: 'learn' as const, directory };
      deepEqual(parseAreaPath(formatAreaPath(p)), p);
    }
  }),
  test('טופס ← לימוד ← סיכום ← חזרה משמר את הסעיף המדויק', () => {
    const form = 'learn/annual/f/1301/F117/201';
    let trail = advanceTrail([], form);
    trail = advanceTrail(trail, 'learn/savings/pensionSE');
    trail = advanceTrail(trail, 'learn/savings/pensionSE/summary');
    equal(returnTargetOf(trail), form);
  }),
  test('כניסה מכלים לכלי וחזרה אינה מאבדת את אינדקס הכלים', () => {
    const trail = advanceTrail(advanceTrail([], 'learn/tools'), 'learn/business/expenses');
    equal(returnTargetOf(trail), 'learn/tools');
  }),
];
