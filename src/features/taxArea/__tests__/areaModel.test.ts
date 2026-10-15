// ─── בדיקות: «מס» — שני מרחבים, כניסה לכל סוג עבודה ולכל תחום, וכתובות ישנות (14.10.2026) ───────
// ‼ מה נעול כאן:
//   · שני המרחבים בשמות שאי אפשר לבלבל, ולכל סוג עבודה ולכל תחום — כניסה משלו.
//   · «הדוח השנתי» ו«טופס 1301» באותו תחום, עם תפקיד שונה ושם שאומר אותו.
//   · כל נושא לימוד וכל כלי שייכים לתחום אחד בדיוק — אין כניסה כפולה ואין פריט יתום.
//   · כתובת ישנה (‎#/reference‎, ‎learn/<topic>‎, ‎#/firm/taxWork‎) נוחתת במקום הנכון, לא בשגיאה.

import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { DOMAINS, DOMAIN_BY_ID, MODE_LABEL, WORK_SECTIONS, domainOf, formatAreaPath, itemOf, parseAreaPath } from '../areaModel';
import { TOPICS } from '../../taxKnowledge/topics';
import { TOOLS } from '../../taxCenter/taxCenterNav';
import { AREAS } from '../../taxYear/catalog';
import { formatRoute, parseHash } from '../../../lib/appRoute';

export const TESTS: TestCase[] = [
  test('שני מרחבים, בשמות שונים לגמרי', () => {
    equal(MODE_LABEL.work, 'עבודות לקוחות');
    equal(MODE_LABEL.learn, 'ידע מקצועי');
  }),

  test('לכל סוג עבודה כניסה משלו, עם הסבר ואיך פותחים; «כל העבודות» היא סקירה', () => {
    const ids = WORK_SECTIONS.map(s => s.id);
    equal(ids[0], 'all');
    for (const k of ['intake', 'annual', 'wealth'] as const) assert(ids.includes(k), k);
    for (const s of WORK_SECTIONS) {
      assert(s.lead.length > 15, `הסבר: ${s.id}`);
      assert(s.howToOpen.length > 10, `איך פותחים: ${s.id}`);
      if (s.domain) assert(!!DOMAIN_BY_ID[s.domain], `תחום קיים: ${s.id}`);
    }
  }),

  test('כל נושא לימוד וכל כלי — בתחום אחד בדיוק', () => {
    const seen = new Map<string, string>();
    for (const d of DOMAINS) for (const i of d.items) {
      assert(!seen.has(i.id), `${i.id} מופיע פעמיים (${seen.get(i.id)}, ${d.id})`);
      seen.set(i.id, d.id);
    }
    for (const t of TOPICS) assert(seen.has(t.id), `נושא בלי תחום: ${t.id}`);
    for (const t of TOOLS) assert(seen.has(t.key), `כלי בלי תחום: ${t.key}`);
  }),

  test('«הדוח השנתי» ו«טופס 1301» — אותו תחום, שני תפקידים, שמות שאומרים אותם', () => {
    equal(domainOf('annualReturn'), 'annual');
    equal(domainOf('map1301'), 'annual');
    const [a, b] = DOMAIN_BY_ID.annual.items;
    assert(a.label !== b.label, "line 47");
    assert(a.label.includes('הכנת הדוח'), a.label);
    assert(b.label.includes('1301') && b.label.includes('מוכנות'), b.label);
  }),

  test('לכל תחום: מה זה ומתי, ותחומי השאלון קיימים', () => {
    const areaIds = new Set(AREAS.map(a => a.id) as string[]);
    for (const d of DOMAINS) {
      assert(d.what.length > 20 && d.when.length > 10, d.id);
      assert(d.items.length > 0, `תחום ריק: ${d.id}`);
      for (const a of d.catalogAreas) assert(areaIds.has(a) || a.startsWith('w'), `${d.id}: ${a}`);
    }
  }),

  test('הכתובת: הלוך וחזור', () => {
    for (const raw of ['work/all', 'work/annual', 'work/wealth', 'learn', 'learn/savings', 'learn/savings/pensionSE', 'learn/annual/map1301']) {
      equal(formatAreaPath(parseAreaPath(raw)), raw, raw);
    }
    equal(itemOf(parseAreaPath('learn/annual/map1301'))?.kind, 'tool');
    equal(itemOf(parseAreaPath('learn/savings'))?.kind, undefined);
  }),

  test('קישור ישן לנושא בלי תחום נוחת בתחום שלו; קטע לא מוכר — בראש המרחב', () => {
    deepEqual(parseAreaPath('learn/pensionSE'), { mode: 'learn', domain: 'savings', item: 'pensionSE' });
    deepEqual(parseAreaPath('learn/nosuch'), { mode: 'learn' });
    deepEqual(parseAreaPath('learn/savings/wizard'), { mode: 'learn', domain: 'savings' });
    deepEqual(parseAreaPath('work/nosuch'), { mode: 'work', section: 'all' });
    deepEqual(parseAreaPath(''), { mode: 'work', section: 'all' });
  }),

  test('בכתובת של האפליקציה: ‎#/tax/…‎, ו«ידע מס» ו«עבודת מס» הישנים נוחתים בפנים', () => {
    const r = parseHash('#/tax/learn/savings/pensionSE');
    equal(r.view, 'reference');
    equal(r.taxPath, 'learn/savings/pensionSE');
    equal(formatRoute({ view: 'reference', taxPath: 'work/annual' }), '/tax/work/annual');
    equal(parseHash('#/reference').view, 'reference');
    equal(parseHash('#/reference').taxPath, 'learn');
    const old = parseHash('#/firm/taxWork');
    equal(old.view, 'reference');
    equal(old.taxPath, 'work');
  }),
];
