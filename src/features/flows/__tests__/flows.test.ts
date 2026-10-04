// ─── בדיקות: מסלולים — תנאים, תרגום מסלול הקליטה, בדיקת מבנה, ותשובת ספק הדואר ─
// ‼ מה נעול כאן:
//   · התנאים מחזירים בדיוק את מה שהשרת מחזיר (אותם מקרים רצים מול flow_when_matches).
//   · התרגום לחמש הרשימות: סוג מסונן לפי «רק ל…», בקשת משרד שומרת את מפתח הרשומה
//     (בו המחולל מזהה בקשה שכבר נוצרה), ופריט קבוע/פעולה לא נכנסים.
//   · בקשת מערכת עם תנאי עובדה / פעמיים לאותו סוג / שלבים במעגל — נדחים לפני השמירה.
//   · תשובה של ספק הדואר שאי אפשר לדעת ממנה אם המייל יצא — «לא ידוע», לעולם לא «נכשל».

import { test, equal, deepEqual, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { whenMatches, whyNot } from '../conditions';
import { compileOnboarding, validateFlow, type LibraryLookup } from '../compile';
import type { FlowDefinition } from '../types';
import { WHEN_CASES } from './whenCases';
import { classifyResendResponse, testTransportAllowed } from '../../../../supabase/functions/_shared/resendResult';

const lib: LibraryLookup = {
  template: (id) => id === 't1'
    ? { name: 'אישור שכר טרחה', stepType: 'custom_request', payload: { title: 'אישור שכר טרחה' } }
    : undefined,
  document: (id) => id === 'd1' ? { name: 'מדריך', payload: { title: 'מדריך', clientResource: 'd1' } } : undefined,
};

const onboarding: FlowDefinition = {
  stages: [{
    key: 's1', name: 'אחרי אישור ההצעה', opens: { after: 'start' }, delivery: 'hold',
    items: [
      { key: 'representation', fixed: true, ref: { kind: 'system', stepType: 'representation' } },
      { key: 'client_documents', ref: { kind: 'system', stepType: 'client_documents' } },
      { key: 'prev_accountant_details', ref: { kind: 'system', stepType: 'prev_accountant_details' },
        when: { kinds: ['licensed_dealer', 'company'] } },
      { key: 'release_letter', ref: { kind: 'system', stepType: 'release_letter' }, after: 'prev_accountant_details',
        when: { kinds: ['licensed_dealer', 'company'] } },
      { key: 'fee_ack-1', ref: { kind: 'template', templateId: 't1' }, when: { facts: [{ key: 'married', is: true }] },
        optional: true },
      { key: 'car-1~2', entryKey: 'car-1', ref: { kind: 'template', templateId: 't1' }, when: { kinds: ['company'] } },
      { key: 'guide', ref: { kind: 'document', docId: 'd1' }, dueInDays: 7 },
    ],
  }],
};

export const TESTS: TestCase[] = [
  test('תנאים: כל המקרים המשותפים', () => {
    for (const c of WHEN_CASES) equal(whenMatches(c.when, c.facts), c.expect, c.name);
  }),
  test('תנאים: «למה לא» מסביר את הראשון שלא מתקיים', () => {
    equal(whyNot({ kinds: ['company'] }, { kind: 'licensed_dealer' }), 'רק לחברה');
    equal(whyNot({ facts: [{ key: 'married', is: true }] }, {}), 'רק כשנשוי/אה');
    equal(whyNot(null, {}), null);
  }),
  test('תרגום: סוג לקוח מסנן; פריט קבוע לא נכנס', () => {
    const c = compileOnboarding(onboarding, lib);
    deepEqual(c.exempt_dealer.map(e => e.key), ['client_documents', 'fee_ack-1', 'guide']);
    deepEqual(c.company.map(e => e.key), ['client_documents', 'prev_accountant_details', 'release_letter', 'fee_ack-1', 'car-1', 'guide']);
    equal(c.company.some(e => e.stepType === 'representation'), false, 'הייצוג נוצר מההצעה, לא מהרשימה');
  }),
  test('תרגום: «אחרי» של בקשת מערכת ⇒ dependsOn לפי סוג', () => {
    const c = compileOnboarding(onboarding, lib);
    equal(c.company.find(e => e.key === 'release_letter')?.dependsOn, 'prev_accountant_details');
  }),
  test('תרגום: בקשת משרד — מפתח הרשומה המקורי, templateId, תנאי עובדה, רשות', () => {
    const c = compileOnboarding(onboarding, lib);
    const car = c.company.find(e => e.key === 'car-1');
    assert(car, 'car-1 קיים');
    equal(car.templateId, 't1');
    equal(car.flowItemKey, 'car-1~2');
    const fee = c.company.find(e => e.key === 'fee_ack-1');
    equal(fee?.requiredForClose, false, 'רשות ⇒ לא חוסם סגירה');
    deepEqual(fee?.when, { facts: [{ key: 'married', is: true }] });
    equal(c.company.find(e => e.key === 'guide')?.documentId, 'd1');
    equal(c.company.find(e => e.key === 'guide')?.dueInDays, 7);
  }),
  test('תרגום: מספור מחדש כמו שמירה במסך הישן', () => {
    const c = compileOnboarding(onboarding, lib);
    deepEqual(c.exempt_dealer.map(e => e.sortIndex), [10, 20, 30]);
  }),
  test('בדיקת מבנה: מסלול תקין עובר', () => {
    deepEqual(validateFlow(onboarding, { onboarding: true }), []);
  }),
  test('בדיקת מבנה: בקשת מערכת עם תנאי עובדה נדחית בקליטה', () => {
    const bad: FlowDefinition = { stages: [{ ...onboarding.stages[0], items: [
      { key: 'x', ref: { kind: 'system', stepType: 'client_documents' }, when: { facts: [{ key: 'married', is: true }] } }] }] };
    equal(validateFlow(bad, { onboarding: true }).length > 0, true);
  }),
  test('בדיקת מבנה: אותה בקשת מערכת פעמיים לאותו סוג', () => {
    const bad: FlowDefinition = { stages: [{ ...onboarding.stages[0], items: [
      { key: 'a', ref: { kind: 'system', stepType: 'client_documents' } },
      { key: 'b', ref: { kind: 'system', stepType: 'client_documents' }, when: { kinds: ['company'] } }] }] };
    equal(validateFlow(bad, { onboarding: true }).some(i => /פעמיים/.test(i.message)), true);
  }),
  test('בדיקת מבנה: שלבים במעגל', () => {
    const bad: FlowDefinition = { stages: [
      { key: 'a', name: 'א', opens: { after: 'stage', stage: 'b' }, delivery: 'approve', items: [] },
      { key: 'b', name: 'ב', opens: { after: 'stage', stage: 'a' }, delivery: 'approve', items: [] }] };
    equal(validateFlow(bad, { onboarding: false }).some(i => /מעגל/.test(i.message)), true);
  }),
  test('ספק הדואר: הצלחה עם מזהה', () => {
    deepEqual(classifyResendResponse(200, { id: 'abc' }), { outcome: 'sent', id: 'abc' });
  }),
  test('ספק הדואר: רשת / 5xx / 409 ⇒ לא ידוע (לעולם לא «נכשל»)', () => {
    equal(classifyResendResponse(null, null, new Error('timeout')).outcome, 'unknown');
    equal(classifyResendResponse(502, {}).outcome, 'unknown');
    equal(classifyResendResponse(409, { name: 'concurrent_idempotent_requests' }).outcome, 'unknown');
    equal(classifyResendResponse(409, { name: 'invalid_idempotent_request' }).outcome, 'unknown');
    equal(classifyResendResponse(200, {}).outcome, 'unknown', '2xx בלי מזהה');
  }),
  test('ספק הדואר: דחייה ודאית ⇒ נכשל', () => {
    equal(classifyResendResponse(422, { name: 'validation_error' }).outcome, 'failed');
    equal(classifyResendResponse(401, {}).outcome, 'failed');
    equal(classifyResendResponse(429, {}).outcome, 'failed');
  }),
  test('מסלול הבדיקה: רק עם משתנה + כותרת + לא בייצור', () => {
    equal(testTransportAllowed('log', 'log', 'https://evdfxjqrkgugssfrdoxd.supabase.co', 'uoweoqtuiettozagwgdw'), true);
    equal(testTransportAllowed('log', null, 'https://evdfxjqrkgugssfrdoxd.supabase.co', 'uoweoqtuiettozagwgdw'), false);
    equal(testTransportAllowed(undefined, 'log', 'https://evdfxjqrkgugssfrdoxd.supabase.co', 'uoweoqtuiettozagwgdw'), false);
    equal(testTransportAllowed('log', 'log', 'https://uoweoqtuiettozagwgdw.supabase.co', 'uoweoqtuiettozagwgdw'), false);
  }),
];
