// ─── בדיקות: צירוף בקשה מאוחרת לשלב, ועצירה ─────────────────────────────────
// ‼ מה נעול כאן:
//   · בקשה שעוד לא פורסמה מסומנת «טיוטה», והחלון לא מבטיח עליה דף או מייל — הצירוף
//     לא מפרסם ולא שולח, וגם «פרסם בדף» אחר כך לא שולח.
//   · «השלב מחכה גם לה» מונה גם שלבים שמעבר לשלב ריק / שלא חל / שכולו רשות —
//     השרת מחזיק גם אותם (_flow_rearc_locked). שלב «אחרי פריט» לא מחכה לבקשה שצורפה.
//   · מסלול בעצירה: אין «מייל אוטומטי» עכשיו — רק אחרי «חידוש…».
//   · «מחכה לאישורך» ובקשה שכבר בדף — נשארת בדף; טיוטה בשלב אוטומטי — במייל האוטומטי הבא.
//   · «עובר הלאה» לפי השרת (counts.gates) בכל סוגי המסלולים.

import { test, equal, deepEqual, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { RunStage } from '../../../features/flows/api';
import { REPEATABLE_STEP_TYPES } from '../../../features/flows/compile';
import { attachLines, heldByAddedText, lateCandidates, PAUSED_LINE, stageClientLine, stageDeliveryLines, stagePassesThrough, stagesHeldBy } from '../runSummary';

const counts = (total: number): RunStage['counts'] =>
  ({ total, done: 0, client: 0, office: 0, external: 0, unannounced: 0, drafts: 0, awaitingStage: 0 });
const stage = (key: string, opens: RunStage['opens'], state: RunStage['state'], total = 1, extra: Partial<RunStage> = {}): RunStage =>
  ({ key, name: key.toUpperCase(), opens, delivery: 'approve', notifyOffice: false, state, counts: counts(total), actions: null, ...extra });
const joined = (ls: { label?: string; text: string }[]) => ls.map(l => `${l.label ?? ''} ${l.text}`).join(' | ');

export const TESTS: TestCase[] = [
  test('בקשה מאוחרת שלא פורסמה (null) — «טיוטה»; שפורסמה, או נתון ישן בלי העמודה — לא', () => {
    const base = { stepType: 'custom_request', status: 'waiting_client', createdAt: '2026-09-05T00:00:00Z', payload: {} };
    const c = lateCandidates([
      { id: 'draft', ...base, publishedAt: null },
      { id: 'pub', ...base, publishedAt: '2026-09-05T00:01:00Z' },
      { id: 'nofield', ...base },
    ], { startedAt: '2026-09-01T08:00:00Z' }, REPEATABLE_STEP_TYPES, s => s.id);
    deepEqual(c.map(x => [x.id, x.draft]), [['draft', true], ['pub', false], ['nofield', false]]);
  }),

  test('צירוף טיוטה לשלב «מייל אוטומטי»: אומרים «טיוטה» ו«פרסם בדף», לא מבטיחים מייל', () => {
    const st = stage('a', { after: 'start' }, 'open', 1, { delivery: 'auto' });
    const t = joined(attachLines(st, { paused: false, drafts: 1, published: 0 }));
    assert(t.includes('טיוטה') && t.includes('«פרסם בדף»'), t);
    assert(!t.includes('יוצא לבד') && !t.includes('מייל אוטומטי'), t);
    assert(t.includes('לא תופיע בדף'), t);
  }),

  test('טיוטה בשלב «מייל אוטומטי»: אחרי הפרסום — במייל האוטומטי הבא, או ב«שלח מייל…»', () => {
    const st = stage('a', { after: 'start' }, 'open', 1, { delivery: 'auto' });
    const t = joined(attachLines(st, { paused: false, drafts: 1, published: 0 }));
    assert(t.includes('הפרסום עצמו לא שולח') && t.includes('תיכלל במייל האוטומטי הבא') && t.includes('«שלח מייל…»'), t);
    assert(!t.includes('שולחים ב«שלח מייל…»'), 'לא «רק ב«שלח מייל…»» — הבא האוטומטי כולל אותה: ' + t);
    const many = joined(attachLines(st, { paused: false, drafts: 2, published: 0 }));
    assert(many.includes('הן ייכללו במייל האוטומטי הבא'), many);
    const paused = joined(attachLines(st, { paused: true, drafts: 1, published: 0 }));
    assert(paused.includes('(אחרי «חידוש…»)'), paused);
  }),

  test('טיוטה בשלב «בדף מיד, מייל כשתשלח» — הנוסח הקודם: הפרסום לא שולח, שולחים ב«שלח מייל…»', () => {
    const t = joined(attachLines(stage('a', { after: 'start' }, 'open', 1, { delivery: 'approve' }), { paused: false, drafts: 1, published: 0 }));
    assert(t.includes('גם הפרסום עצמו לא שולח מייל — שולחים ב«שלח מייל…»'), t);
    assert(!t.includes('המייל האוטומטי'), t);
  }),

  test('«מחכה לאישורך» ובקשה שכבר בדף: נשארת בדף — לא «לא מופיע בדף עד שתאשר»', () => {
    const st = stage('a', { after: 'start' }, 'open', 1, { delivery: 'hold' });
    const ls = attachLines(st, { paused: false, drafts: 0, published: 1 });
    const t = joined(ls);
    assert(!t.includes('לא מופיע בדף עד שתאשר'), t);
    assert(t.includes('נשארת בדף') && t.includes('«שלח מייל…»'), t);
    equal(ls[0].label, 'כבר בדף:');
    const many = joined(attachLines(st, { paused: false, drafts: 0, published: 2 }));
    assert(many.includes('נשארות בדף') && many.includes('עליהן'), many);
  }),

  test('«מחכה לאישורך», טיוטה ובקשה שבדף יחד — הבקשה שבדף נשארת, הטיוטה עד «פרסם בדף»', () => {
    const ls = attachLines(stage('a', { after: 'start' }, 'open', 1, { delivery: 'hold' }), { paused: false, drafts: 1, published: 1 });
    deepEqual(ls.map(l => l.label), ['מה שכבר בדף:', 'עדיין טיוטה:']);
    assert(ls[1].text.includes('עד «פרסם בדף»'), ls[1].text);
  }),

  test('צירוף טיוטה לשלב «רק בדף»: גם אחרי הפרסום — בלי מייל', () => {
    const t = joined(attachLines(stage('a', { after: 'start' }, 'open', 1, { delivery: 'page' }), { paused: false, drafts: 2, published: 0 }));
    assert(/טיוטות/.test(t) && /לא ייצא גם אחר כך/.test(t), t);
  }),

  // ‼ (4.10.2026, B:X-2) שורה אחת: מה קורה בדף ואם יוצא מייל — בלי «נשארת בדף» פעמיים ובלי «הודעה אליך».
  test('בקשה שכבר בדף, מסלול פעיל — שורה אחת: נשארת בדף, והמייל לפי השלב', () => {
    const st = stage('a', { after: 'start' }, 'open', 1, { delivery: 'auto', reminder: { afterDays: 7, max: 2 }, notifyOffice: true });
    const ls = attachLines(st, { paused: false, drafts: 0, published: 1 });
    deepEqual(ls, [{ label: 'כבר בדף:', text: 'נשארת בדף; מייל עליה יוצא לבד תוך כמה דקות' }]);
    const t = joined(ls);
    assert(!t.includes('הודעה אליך') && !t.includes('בכרטיס הלקוח'), t);
    equal(attachLines({ delivery: 'approve' }, { paused: false, drafts: 0, published: 2 })[0].text, 'נשארות בדף; מייל עליהן — כשתלחץ «שלח מייל…»');
    equal(attachLines({ delivery: 'page' }, { paused: false, drafts: 0, published: 1 })[0].text, 'נשארת בדף; בלי מייל ובלי תזכורות — השלב «רק בדף»');
  }),

  test('מסלול בעצירה: בלי «מייל אוטומטי» עכשיו — אחרי «חידוש…»', () => {
    const st = stage('a', { after: 'start' }, 'open', 1, { delivery: 'auto' });
    const t = joined(attachLines(st, { paused: true, drafts: 0, published: 1 }));
    assert(!t.includes('יוצא לבד'), t);
    assert(t.includes('«חידוש…»'), t);
  }),

  test('טיוטה ובקשה שבדף יחד — כל אחת בשורה משלה', () => {
    const ls = attachLines(stage('a', { after: 'start' }, 'open', 1, { delivery: 'approve' }), { paused: false, drafts: 1, published: 1 });
    deepEqual(ls.map(l => l.label), ['מה שכבר בדף:', 'עדיין טיוטה:']);
  }),

  test('«השלב מחכה גם לה»: גם מעבר לשלב ריק / שלא חל / שעובר הלאה; לא «אחרי פריט»', () => {
    const stages = [
      stage('a', { after: 'start' }, 'open'),
      stage('b', { after: 'stage', stage: 'a' }, 'waiting', 0),          // ריק — עובר הלאה
      stage('c', { after: 'stage', stage: 'b' }, 'waiting'),
      stage('d', { after: 'stage', stage: 'c' }, 'waiting'),             // אחרי שלב עם בקשות — לא ישירות
      stage('e', { after: 'stage', stage: 'a' }, 'not_applicable', 0),   // לא חל — לא נמנה, אבל עובר הלאה
      stage('f', { after: 'stage', stage: 'e' }, 'waiting'),
      stage('g', { after: 'item', item: 'i1' }, 'waiting'),
    ];
    const pass = (s: RunStage) => s.state === 'not_applicable' || s.counts.total === 0;
    deepEqual(stagesHeldBy(stages, 'a', pass).map(s => s.key), ['b', 'c', 'f']);
  }),

  test('«השלב מחכה גם לה»: ישיר בלבד כשאין שלב שעובר הלאה; מעגל לא נתקע', () => {
    const stages = [
      stage('a', { after: 'stage', stage: 'c' }, 'open'),
      stage('b', { after: 'stage', stage: 'a' }, 'waiting'),
      stage('c', { after: 'stage', stage: 'b' }, 'waiting'),
    ];
    deepEqual(stagesHeldBy(stages, 'a', () => false).map(s => s.key), ['b']);
    deepEqual(stagesHeldBy(stages, 'a', () => true).map(s => s.key), ['b', 'c']);
  }),

  test('עובר הלאה לפי השרת (gates): שלב עם בקשות רשות בלבד עובר הלאה גם במסלול שנתי', () => {
    // שנתי: A → B (רק רשות) → C. הבקשה שצורפה ל-A מחזיקה גם את C (_flow_gate_steps).
    const stages = [
      stage('a', { after: 'start' }, 'open'),
      stage('b', { after: 'stage', stage: 'a' }, 'waiting', 2, { counts: { ...counts(2), gates: 0 } }),
      stage('c', { after: 'stage', stage: 'b' }, 'waiting', 1, { counts: { ...counts(1), gates: 1 } }),
    ];
    deepEqual(stagesHeldBy(stages, 'a', s => stagePassesThrough(s, () => false)).map(s => s.key), ['b', 'c']);
  }),

  test('עובר הלאה: gates>0 לא עובר גם כשהגיבוי אומר כן; בלי gates (שרת ישן) — ריק / לא חל / הגיבוי', () => {
    const withGates = stage('b', { after: 'stage', stage: 'a' }, 'waiting', 2, { counts: { ...counts(2), gates: 1 } });
    equal(stagePassesThrough(withGates, () => true), false);
    equal(stagePassesThrough(stage('b', { after: 'start' }, 'waiting', 0), () => false), true, 'ריק');
    equal(stagePassesThrough(stage('b', { after: 'start' }, 'not_applicable', 3), () => false), true, 'לא חל');
    equal(stagePassesThrough(stage('b', { after: 'start' }, 'waiting', 2), () => true), true, 'שרת ישן — הגיבוי');
    equal(stagePassesThrough(stage('b', { after: 'start' }, 'waiting', 2)), false);
  }),

  // ‼ (4.10.2026, B6) בשורה — מילה אחת; המשפט המלא פעם אחת, בתיבה שבפתיחה.
  test('עצירה: בשורה «בעצירה» בלבד', () => {
    equal(PAUSED_LINE, 'בעצירה');
  }),
  // ‼ (4.10.2026, B3) «ללקוח:» בכרטיס — המצב, לא ההגדרה; ובלי «בכרטיס הלקוח» (כבר בו).
  test('«ללקוח:» בשלב פתוח — מה שבדף כבר בדף; «מחכה לאישורך» רק על מה שעוד טיוטה', () => {
    const open = (delivery: RunStage['delivery'], c: Partial<RunStage['counts']>) =>
      stage('a', { after: 'start' }, 'open', 3, { delivery, counts: { ...counts(3), ...c } });
    equal(stageClientLine(open('hold', { client: 2, unannounced: 2 })), 'בדף · מייל כשתלחץ «שלח מייל…»', 'פורסם — לא «לא מופיע בדף עד שתאשר»');
    equal(stageClientLine(open('hold', { drafts: 2 })), 'מה שמחכה לאישורך — לא בדף עד «פרסם בדף»');
    equal(stageClientLine(open('approve', { client: 1 })), 'בדף', 'הכול כבר במייל — אין מה לומר על מייל');
    equal(stageClientLine(open('auto', { unannounced: 1 })), 'בדף · מייל יוצא לבד תוך כמה דקות');
    equal(stageClientLine(open('auto', { unannounced: 1 }), { paused: true }), 'בדף · בעצירה — מייל לא יוצא לבד עד «חידוש…»');
    equal(stageClientLine(open('page', { client: 1, unannounced: 1 })), 'רק בדף — בלי מייל ובלי תזכורות');
    equal(stageClientLine({ ...open('approve', { unannounced: 1 }), reminder: { afterDays: 5, max: 2 } }), 'בדף · מייל כשתלחץ «שלח מייל…» · תזכורת אחרי 5 ימים, עד 2 פעמים');
  }),

  test('«ללקוח:» בשלב הבא — מה יקרה כשייפתח; שלב שהושלם — בלי שורה', () => {
    const w = (delivery: RunStage['delivery']) => stageClientLine(stage('b', { after: 'stage', stage: 'a' }, 'waiting', 1, { delivery }));
    equal(w('hold'), 'כשייפתח — לא בדף עד «פרסם בדף»');
    equal(w('approve'), 'כשייפתח — מייל כשתלחץ «שלח מייל…»');
    equal(w('auto'), 'כשייפתח — מייל יוצא לבד תוך כמה דקות');
    equal(w('page'), 'כשייפתח — רק בדף ובלי מייל');
    equal(stageClientLine(stage('c', { after: 'start' }, 'done')), null);
    for (const d of ['approve', 'auto', 'hold', 'page'] as const) {
      const all = [...stageDeliveryLines({ delivery: d, reminder: null }), w(d) ?? ''].join(' ');
      assert(!all.includes('בכרטיס הלקוח'), `${d}: ${all}`);
    }
  }),
  // ‼ (4.10.2026, B5) עדכון לגרסה חדשה: בקשת חובה שנוספת לשלב פתוח מעכבת את מה שאחריו — כמו בצירוף.
  test('עדכון: בקשת חובה בשלב פתוח — אילו שלבים יחכו לה; רשות / שלב שלא פתוח / לא ידוע — בלי משפט', () => {
    const stages = [
      stage('a', { after: 'start' }, 'open'),
      stage('b', { after: 'stage', stage: 'a' }, 'waiting'),
      stage('c', { after: 'stage', stage: 'a' }, 'waiting'),
      stage('d', { after: 'stage', stage: 'b' }, 'waiting'),
    ];
    const pass = () => false;
    equal(heldByAddedText(stages, 'a', true, pass), '«B», «C» ייפתחו רק כשגם היא תסתיים');
    equal(heldByAddedText(stages, 'a', false, pass), null, 'רשות');
    equal(heldByAddedText(stages, 'a', undefined, pass), null, 'לא ידוע אם חובה');
    equal(heldByAddedText(stages, 'b', true, pass), null, 'שלב שעוד לא נפתח');
    equal(heldByAddedText(stages, 'zz', true, pass), null, 'שלב שאין בגרסה של הלקוח');
  }),
];
