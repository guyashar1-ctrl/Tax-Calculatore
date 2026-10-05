// ─── בדיקות: «כללי פתיחה» — שם הבקשה/הקבוצה בכלל הוא «צפייה» (D3, 5.10.2026) ──────────────
// ‼ מה נעול כאן:
//   · הניסוח של הכלל לא השתנה (text), ונוסף לו מי ומה בכל שם (parts) — בקשה, קבוצה (פעם אחת), פעולה.
//   · שם עם כרטיס ללקוח הוא כפתור שקט; פעולה מול רשות נשארת טקסט — ההחלטה היא previewTargetOfSubject (null = טקסט).
//   · הפיסוק של הרשימה זהה ל-heList: «א, ב וג», ו«פותחים גם» נשאר טקסט לפני השמות.
// ‼ הרינדור עצמו (כפתורים בדף) נבדק בדפדפן; כאן הניסוח טהור ומבנה הכרטיס נקרא כמקור — בלי לטעון את מגירת «צפייה».

import { test, assert, equal, deepEqual, type TestCase } from '../../../../../testkit/tinyTest';
import type { FlowDefinition, FlowItem } from '../../../../../features/flows/types';
import { previewTargetOfSubject } from '../../../../flows/builder/previewTarget';
import { ruleLines } from '../ruleLines';
import CARD_RAW from '../RuleCard.tsx?raw';

const CARD = CARD_RAW.replace(/\r\n/g, '\n');

const title = (i: FlowItem) => ({ t1: 'אישורי ניכוי', t2: 'דוח שנתי', d1: 'מדריך הוצאות', a1: 'קריאת התיק בביטוח לאומי' } as Record<string, string>)[i.key] ?? i.key;

const def: FlowDefinition = {
  stages: [{
    key: 's1', name: 'פתיחה', opens: { after: 'start' }, delivery: 'approve',
    items: [
      { key: 't1', ref: { kind: 'template', templateId: 'tpl-1' } },
      { key: 't2', ref: { kind: 'template', templateId: 'tpl-2' } },
      { key: 'd1', ref: { kind: 'document', docId: 'doc_1' } },
      { key: 'p1', ref: { kind: 'system', stepType: 'paperless_invite' } },
      { key: 'p2', ref: { kind: 'system', stepType: 'business_details' } },
      { key: 'a1', ref: { kind: 'action', actionId: 'btl.sync_file', actionType: 'btl.sync_file' } },
    ],
  }],
};

const emptyDef: FlowDefinition = { stages: [{ key: 's', name: 'ריק', opens: { after: 'start' }, delivery: 'approve', items: [] }] };

export const TESTS: TestCase[] = [
  test('הניסוח של הכלל זהה: פותחים א, ב וג; הקבוצה בשורת התנאי של פייפרלס — ופעם אחת', () => {
    const [{ lines }] = ruleLines(def, title);
    const line = lines.find(l => l.lead === 'פותחים');
    assert(line, 'שורת «פותחים»');
    equal(line.text, 'אישורי ניכוי, דוח שנתי, מדריך הוצאות וקריאת התיק בביטוח לאומי');
    equal(line.prefix, '');
    equal(line.parts.length, 4);
    const gated = lines.find(l => l.lead.startsWith('אם '));
    assert(gated, 'שורת התנאי של פייפרלס');
    equal(gated.text, 'פותחים גם קבוצת פייפרלס');
    equal(gated.prefix, 'פותחים גם ');
    equal(gated.text, gated.prefix + gated.parts.map(p => p.label).join(''), 'text = prefix + השמות');
    equal(lines.flatMap(l => l.parts).filter(p => p.subject.kind === 'group').length, 1, 'שני פריטי פייפרלס — קבוצה אחת');
  }),

  test('כל שם נושא את מה שהוא פותח: בקשה/מסמך ← פריט, קבוצה ← מפתח הקבוצה, פעולה ← פריט פעולה', () => {
    const [{ lines }] = ruleLines(def, title);
    const parts = lines.flatMap(l => l.parts);
    deepEqual(parts.map(p => p.label), ['אישורי ניכוי', 'דוח שנתי', 'מדריך הוצאות', 'קריאת התיק בביטוח לאומי', 'קבוצת פייפרלס']);
    const group = parts.find(p => p.subject.kind === 'group');
    assert(group && group.subject.kind === 'group', 'קבוצה');
    equal(group.subject.group, 'paperless');
    const action = parts[3].subject;
    assert(action.kind === 'item' && action.item.ref.kind === 'action', 'פעולה');
  }),

  test('מי הופך לכפתור: בקשה, מסמך וקבוצה — כן; פעולה מול רשות — לא (נשארת טקסט)', () => {
    const [{ lines }] = ruleLines(def, title);
    const parts = lines.flatMap(l => l.parts);
    const clickable = parts.map(p => [p.label, previewTargetOfSubject(p.subject, { title }) !== null]);
    deepEqual(clickable, [
      ['אישורי ניכוי', true], ['דוח שנתי', true], ['מדריך הוצאות', true], ['קריאת התיק בביטוח לאומי', false], ['קבוצת פייפרלס', true],
    ]);
    const group = previewTargetOfSubject(parts[4].subject, { title });
    assert(group && group.kind === 'group' && group.group === 'paperless', 'קבוצה ← יעד קבוצה');
  }),

  test('שלב בלי בקשות: המשפט כמו קודם, בלי שמות', () => {
    const [{ lines }] = ruleLines(emptyDef, title);
    equal(lines[0].text, 'אין עדיין בקשות בשלב הזה');
    deepEqual(lines[0].parts, []);
  }),

  test('הכרטיס: שם = כפתור שקט עם «צפייה: …», פיסוק כמו heList, פעולה — טקסט; והפרופיל והספרייה עוברים למגירה', () => {
    assert(CARD.includes('previewTargetOfSubject(p.subject, { templates, title })'), 'ההחלטה מהמפה — אחת');
    assert(CARD.includes('aria-label={`צפייה: ${p.label}`}') && CARD.includes('data-testid="rule-view"'), 'כפתור עם שם נגיש');
    assert(CARD.includes("i === last ? ' ו' : ', '"), 'הפיסוק: «, » ו«ו» לפני האחרון');
    assert(CARD.includes('{l.prefix}'), '«פותחים גם» נשאר טקסט');
    assert(/<\/button>\s*:\s*p\.label\}/.test(CARD), 'בלי יעד — השם כטקסט');
    assert(CARD.includes('useBuilderPreview(profile)') && CARD.includes('{preview.node}'), 'המגירה מרונדרת בכרטיס');
    assert(CARD.includes('export { ruleLines } from'), 'הניסוח נשאר זמין מהכרטיס');
  }),
];
