// ─── בדיקות: מפת הביצוע — רגעים, ענפים, ומה מקבל כל סוג לקוח ──────────────
// ‼ מה נעול כאן:
//   · הסדר נגזר מ«נפתח» (עומק השרשרת) — לא ממיקום ברשימה. שלבים עם אותו
//     «נפתח» הם רגע אחד (במקביל). מעגל או הפניה שנמחקה לא מפילים את המפה.
//   · «מה מקבל»: כשהכול ידוע — אותה תשובה כמו whenMatches (WHEN_CASES); כשרק
//     הסוג ידוע — תנאי עובדה הם «תלוי», לא «לא נפתח».
//   · השער הקבוע של בקשת מערכת נבדק דרך systemGate עצמו, לא עותק.
//   · בתוך שלב: «לכל הלקוחות» קודם, קבוצה לכל תנאי, «אחרי» מקונן תחת ההורה
//     כשהם באותה קבוצה — וכל פריט מוצג פעם אחת בדיוק, גם במעגל.
import { test, equal, deepEqual, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { heList, onlyPhrase, whenMatches, whenParts, whenVerdict, whyNot } from '../conditions';
import {
  defaultOpensForNewStage, detachedMoments, exclusiveWhen, flowMoments, groupStageItems, itemVerdict, lanePartners, lensFacts,
  momentLanes, stageDepths, systemVerdict,
  type ItemNode,
} from '../preview';
import type { FlowDefinition, FlowItem, FlowStage } from '../types';
import { WHEN_CASES } from './whenCases';

const tpl = (key: string, extra: Partial<FlowItem> = {}): FlowItem => ({ key, ref: { kind: 'template', templateId: key }, ...extra });
const st = (key: string, opens: FlowStage['opens'], items: FlowItem[] = [], extra: Partial<FlowStage> = {}): FlowStage =>
  ({ key, name: key, opens, delivery: 'approve', items, ...extra });

// סדר הרשימה מבולגן בכוונה: הסדר האמיתי נגזר רק מ«נפתח».
const def: FlowDefinition = { stages: [
  st('late', { after: 'stage', stage: 'mid' }),
  st('a', { after: 'start' }, [tpl('a1'), tpl('a2')]),
  st('mid', { after: 'stage', stage: 'a' }),
  st('b', { after: 'start' }),
  st('byItem', { after: 'item', item: 'a2' }),
  st('mid2', { after: 'stage', stage: 'a' }),
] };
const title = (i: FlowItem) => i.key;
const keysOf = (ns: ItemNode[]): string[] => ns.flatMap(n => [n.item.key, ...keysOf(n.children)]);

export const TESTS: TestCase[] = [
  test('רגעים: לפי עומק השרשרת, לא לפי מיקום ברשימה', () => {
    const ms = flowMoments(def, { onboarding: false, title });
    deepEqual(ms.map(m => m.stageKeys), [['a', 'b'], ['mid', 'mid2'], ['byItem'], ['late']]);
    deepEqual(ms.map(m => m.depth), [0, 1, 1, 2]);
    equal(ms[0].label, 'כשהמסלול מתחיל');
    equal(ms[1].label, 'אחרי שהשלב «a» הושלם');
    equal(ms[2].label, 'אחרי שהבקשה «a2» הושלמה');
    equal(ms[2].waitsFor?.stageKey, 'a');
    equal(flowMoments(def, { onboarding: true, title })[0].label, 'באישור ההצעה');
  }),
  test('רגעים: מעגל והפניה שנמחקה — המפה לא קורסת, כל שלב מופיע פעם אחת', () => {
    const bad: FlowDefinition = { stages: [
      st('x', { after: 'stage', stage: 'y' }), st('y', { after: 'stage', stage: 'x' }),
      st('z', { after: 'item', item: 'gone' }),
    ] };
    const ms = flowMoments(bad, { onboarding: false, title });
    deepEqual(ms.flatMap(m => m.stageKeys).sort(), ['x', 'y', 'z']);
    equal(stageDepths(bad).size, 3);
    equal(ms.find(m => m.stageKeys.includes('z'))?.label, 'אחרי שהבקשה «פריט שהוסר» הושלמה');
  }),
  test('שלב חדש נפתח אחרי הרגע האחרון — לא אחרי מה שאחרון ברשימה', () => {
    const d: FlowDefinition = { stages: [st('deep', { after: 'stage', stage: 'first' }), st('first', { after: 'start' })] };
    deepEqual(defaultOpensForNewStage(d), { after: 'stage', stage: 'deep' });
    deepEqual(defaultOpensForNewStage({ stages: [] }), { after: 'start' });
  }),
  test('«מה מקבל»: כשהכול ידוע — זהה ל-whenMatches בכל המקרים המשותפים', () => {
    for (const c of WHEN_CASES) equal(whenVerdict(c.when, c.facts, 'all').state === 'on', whenMatches(c.when, c.facts), c.name);
  }),
  test('«מה מקבל»: רק הסוג ידוע — עובדה היא «תלוי», סוג אחר הוא «לא»', () => {
    const lf = lensFacts({ t: 'kind', kind: 'exempt_dealer' });
    equal(whenVerdict({ facts: [{ key: 'married', is: true }] }, lf.facts, lf.known).state, 'depends');
    const off = whenVerdict({ kinds: ['licensed_dealer', 'company'] }, lf.facts, lf.known);
    equal(off.state, 'off');
    equal(off.why, 'רק לעוסק מורשה וחברה');
    // ‼ «עוסק מורשה או חברה» נגזר מהסוג — ידוע.
    equal(whenVerdict({ facts: [{ key: 'licensed', is: true }] }, lf.facts, lf.known).state, 'off');
    equal(whenVerdict({ kinds: ['company'] }, {}, new Set()).state, 'depends', '«כולם» — שום דבר לא מעומעם');
  }),
  test('שער קבוע בקליטה: דרך systemGate — פייפרלס לרשות המסים לא לעוסק פטור, רו״ח קודם תלוי', () => {
    const ex = lensFacts({ t: 'kind', kind: 'exempt_dealer' });
    equal(systemVerdict('paperless_tax_authority', ex).state, 'off');
    equal(systemVerdict('prev_accountant_details', ex).state, 'depends');
    equal(systemVerdict('client_documents', ex).state, 'on');
    equal(systemVerdict('paperless_tax_authority', lensFacts({ t: 'kind', kind: 'company' })).state, 'depends');
    equal(systemVerdict('representation', lensFacts({ t: 'sample', i: 3 })).state, 'off', 'החזר מס — בלי ייצוג בהצעה');
  }),
  test('פריט: שלב שלא חל גובר; בקשת מערכת נבדקת רק בקליטה', () => {
    const stage = st('s', { after: 'start' }, [], { when: { kinds: ['company'] } });
    const sys: FlowItem = { key: 'p', ref: { kind: 'system', stepType: 'paperless_tax_authority' } };
    const ex = lensFacts({ t: 'kind', kind: 'exempt_dealer' });
    equal(itemVerdict(stage, tpl('x'), false, ex).why, 'רק לחברה');
    equal(itemVerdict(st('s2', { after: 'start' }), sys, true, ex).state, 'off');
    equal(itemVerdict(st('s2', { after: 'start' }), sys, false, ex).state, 'on');
  }),
  test('ענפים בתוך שלב: «לכל הלקוחות» קודם, קבוצה לכל תנאי, שער קבוע בתווית', () => {
    const s = st('s', { after: 'start' }, [
      tpl('c1', { when: { kinds: ['company'] } }),
      tpl('all1'),
      { key: 'prev', ref: { kind: 'system', stepType: 'prev_accountant_details' }, when: { kinds: ['licensed_dealer', 'company'] } },
      tpl('c2', { when: { kinds: ['company'] } }),
      { key: 'rep', fixed: true, ref: { kind: 'system', stepType: 'representation' }, when: { facts: [{ key: 'rep', is: true }] } },
    ]);
    const gs = groupStageItems(s, true);
    deepEqual(gs.map(g => g.label), ['לכל הלקוחות', 'רק לחברה', 'רק לעוסק מורשה וחברה, כשיש רו״ח קודם', 'רק כשההצעה כוללת ייצוג']);
    deepEqual(gs[1].nodes.map(n => n.item.key), ['c1', 'c2']);
    equal(gs[0].conditional, false);
    equal(groupStageItems(s, false)[2].label, 'רק לעוסק מורשה וחברה', 'מחוץ לקליטה — בלי השער');
  }),
  test('«אחרי»: מקונן תחת ההורה באותה קבוצה; מקבוצה אחרת — הפניה', () => {
    const s = st('s', { after: 'start' }, [
      tpl('kid', { after: 'root' }), tpl('root'), tpl('grand', { after: 'kid' }),
      tpl('other', { after: 'root', when: { kinds: ['company'] } }),
    ]);
    const gs = groupStageItems(s, false);
    deepEqual(gs[0].nodes.map(n => n.item.key), ['root']);
    deepEqual(keysOf(gs[0].nodes), ['root', 'kid', 'grand']);
    equal(gs[0].size, 3);
    equal(gs[1].nodes[0].afterOutside, 'root');
  }),
  test('«אחרי» במעגל — כל פריט מוצג פעם אחת', () => {
    const s = st('s', { after: 'start' }, [tpl('x', { after: 'y' }), tpl('y', { after: 'x' }), tpl('z')]);
    const shown = keysOf(groupStageItems(s, false).flatMap(g => g.nodes)).sort();
    deepEqual(shown, ['x', 'y', 'z']);
  }),
  test('ניסוח: רשימה בעברית ו«למה לא»', () => {
    equal(heList(['א']), 'א');
    equal(heList(['א', 'ב', 'ג']), 'א, ב וג');
    equal(whyNot({ kinds: ['licensed_dealer', 'company'] }, { kind: 'exempt_dealer' }), 'רק לעוסק מורשה וחברה');
    equal(onlyPhrase(whenParts({ kinds: ['exempt_dealer', 'licensed_dealer', 'company', 'representation_only'], facts: [{ key: 'has_prev', is: true }] })),
      'לכולם חוץ מהחזר מס, כשמגיע מרו״ח אחר', 'חסר סוג אחד — «חוץ מ», בלי «רק»');
    equal(onlyPhrase([]), 'לכל הלקוחות');
    assert(!/undefined/.test(whyNot({ facts: [{ key: 'no_prev_email', is: false }] }, { no_prev_email: true }) ?? ''), 'כל עובדה מנוסחת');
  }),
  test('במקביל או חלופות: ענפים שסותרים זה את זה — «או», לא «במקביל»', () => {
    assert(exclusiveWhen({ kinds: ['exempt_dealer'] }, { kinds: ['licensed_dealer', 'company'] }), 'סוגים זרים');
    assert(!exclusiveWhen({ kinds: ['licensed_dealer', 'company'] }, { kinds: ['company'] }), 'חפיפה חלקית — יכולים יחד');
    assert(!exclusiveWhen(undefined, { kinds: ['company'] }), 'שלב לכולם — יכול עם כל ענף');
    assert(exclusiveWhen({ facts: [{ key: 'married', is: true }] }, { facts: [{ key: 'married', is: false }] }), 'עובדה הפוכה');
    // כמו קליטה ב-staging: שלב לכולם, ושני ענפים לפי סוג.
    const ss = [st('all', { after: 'start' }), st('ex', { after: 'start' }, [], { when: { kinds: ['exempt_dealer'] } }),
      st('lic', { after: 'start' }, [], { when: { kinds: ['licensed_dealer', 'company'] } }), st('m', { after: 'start' }, [], { when: { facts: [{ key: 'married', is: true }] } })];
    const lanes = momentLanes(ss);
    deepEqual(lanes.map(l => l.stageKeys), [['all'], ['ex', 'lic'], ['m']]);
    deepEqual(lanes.map(l => [l.alt, l.byKind]), [[false, false], [true, true], [false, false]]);
    deepEqual(lanePartners(ss, lanes, 0), []);
    deepEqual(lanePartners(ss, lanes, 1), [['all']]);
    deepEqual(lanePartners(ss, lanes, 2), [['all'], ['ex', 'lic']]);
  }),
  test('במקביל: «עם מי» מדלג על ענף שלא ייתכן יחד', () => {
    const ss = [st('ex', { after: 'start' }, [], { when: { kinds: ['exempt_dealer'] } }),
      st('lic', { after: 'start' }, [], { when: { kinds: ['licensed_dealer'] } }),
      st('exM', { after: 'start' }, [], { when: { kinds: ['exempt_dealer'], facts: [{ key: 'married', is: true }] } })];
    const lanes = momentLanes(ss);
    deepEqual(lanes.map(l => l.stageKeys), [['ex', 'lic'], ['exM']]);
    deepEqual(lanePartners(ss, lanes, 1), [['ex']], 'לא «במקביל» לעוסק מורשה');
  }),
  test('רגע שלא מחכה לרגע שמעליו — מסומן; שרשרת — לא', () => {
    const ms = flowMoments(def, { onboarding: false, title });
    // [a,b] → [mid,mid2] (אחרי a) → [byItem] (אחרי a2, בשלב a) → [late] (אחרי mid)
    deepEqual([...detachedMoments(ms)], [ms[2].key, ms[3].key], 'byItem מחכה ל-a, לא ל-mid; late מחכה ל-mid, לא ל-byItem');
    const chain: FlowDefinition = { stages: [st('x', { after: 'start' }), st('y', { after: 'stage', stage: 'x' }), st('z', { after: 'stage', stage: 'y' })] };
    equal(detachedMoments(flowMoments(chain, { onboarding: false, title })).size, 0);
  }),
  test('«מה מקבל»: «עוסק מורשה או חברה» ידוע רק לסוגים שקובעים אותו', () => {
    const rep = lensFacts({ t: 'kind', kind: 'representation_only' });
    equal(whenVerdict({ facts: [{ key: 'licensed', is: true }] }, rep.facts, rep.known).state, 'depends', 'ייצוג בלבד יכול להיות עוסק מורשה');
    equal(systemVerdict('paperless_tax_authority', lensFacts({ t: 'kind', kind: 'tax_refund' })).state, 'depends');
    equal(whenVerdict({ facts: [{ key: 'licensed', is: true }] }, lensFacts({ t: 'kind', kind: 'company' }).facts, lensFacts({ t: 'kind', kind: 'company' }).known).state, 'on');
  }),
];
