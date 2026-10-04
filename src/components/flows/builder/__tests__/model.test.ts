// ─── בדיקות: בונה המסלולים — מה שהשרת דוחה נעצר כבר במסך ─────────────────
// ‼ מה נעול כאן:
//   · פריט פעולה נכתב עם actionType (מה שהשרת קורא) — לא רק actionId.
//   · הבדיקות הנוספות מעתיקות את flow_definition_error: בקשת מערכת במסלול ידני,
//     בקשת מערכת בשלב מאוחר בקליטה, «לכל אדם» בקליטה, שלב/פריט אחרי פעולה.
//   · העברת פריט לשלב אחר מוחקת «אחרי» (אחרי — באותו שלב בלבד), גם אצל מי שחיכה לו.
//   · בקשת מערכת מוצעת רק לסוגים שעוד אין להם אותה.
//   · בקשה מהספרייה שאין בה מה למלא מסומנת לפני השמירה; סיבת דילוג תמיד בעברית.

import { test, equal, deepEqual, assert } from '../../../../testkit/tinyTest';
import type { TestCase } from '../../../../testkit/tinyTest';
import { validateFlow } from '../../../../features/flows/compile';
import type { FlowDefinition } from '../../../../features/flows/types';
import { skipReasonText } from '../../../../features/flows/api';
import { actionTypeOf } from '../../../../features/flows/types';
import {
  actionRef, allIssues, buildLibraryLookup, personalConfirmOf, dependentsOfItem, freeKindsForSystem, moveItemToStage, runsText,
  countsText, perPersonTag,
} from '../model';
import { BUILT_IN_VARIANTS } from '../../../../features/flows/compile';

const SHAAM = 'shaam.sync_income_tax_file';

const manual: FlowDefinition = {
  stages: [
    { key: 's1', name: 'פתיחה', opens: { after: 'start' }, delivery: 'approve', items: [
      { key: 'a', ref: { kind: 'template', templateId: 't1' } },
      { key: 'b', ref: { kind: 'document', docId: 'd1' }, after: 'a' },
      { key: 'act', ref: actionRef(SHAAM), mode: 'auto' },
    ] },
    { key: 's2', name: 'המשך', opens: { after: 'stage', stage: 's1' }, delivery: 'auto', items: [] },
  ],
};
/** המסמך שהפריט 'b' מצביע עליו — קיים בספרייה (מסמך שהוסר מסומן לפני השמירה). */
const DOCS = [{ id: 'd1', label: 'מדריך הוצאות', path: 'p/d1.pdf', url: 'https://x/d1.pdf', fileName: 'd1.pdf', at: '2026-10-01T00:00:00Z' }];

export const TESTS: TestCase[] = [
  test('פעולה: נכתבת עם actionType ו-actionId, ונקראת משניהם', () => {
    const r = actionRef(SHAAM) as unknown as Record<string, string>;
    equal(r.actionType, SHAAM);
    equal(r.actionId, SHAAM);
    equal(actionTypeOf({ kind: 'action', actionType: 'btl.sync_file' } as never), 'btl.sync_file');
  }),
  test('בקשה בספרייה בלי מה למלא — מסומנת לפני השמירה; עם פריטים — לא', () => {
    const tpl = (id: string, requirements: unknown[], owner?: 'client' | 'me') => ({
      id, name: id === 't1' ? 'ריקה' : 'מלאה', kind: 'request' as const, officeId: 'o', seedKey: null,
      entries: [{ stepType: 'custom_request', owner, payload: { requirements } }],
    });
    const lib = buildLibraryLookup([tpl('t1', []), tpl('t2', [{ id: 'q', kind: 'text', label: 'שם' }])], DOCS);
    const issues = allIssues(manual, 'manual', validateFlow, lib);
    assert(issues.some(i => i.itemKey === 'a' && /«ריקה»/.test(i.message)), 'צריך לסמן את הבקשה הריקה');
    const meLib = buildLibraryLookup([tpl('t1', [], 'me')], DOCS);
    deepEqual(allIssues(manual, 'manual', validateFlow, meLib), [], 'משימה של המשרד בלי פריטים — תקינה');
    const docs = (checklist: unknown[]) => buildLibraryLookup([{ id: 't1', name: 'מסמכים', kind: 'request', officeId: 'o', seedKey: null,
      entries: [{ stepType: 'client_documents', owner: 'client', payload: { checklist } }] }], DOCS);
    assert(allIssues(manual, 'manual', validateFlow, docs([])).some(i => i.itemKey === 'a'), 'מסמכים בלי רשימה במסלול שחוזר');
    deepEqual(allIssues(manual, 'manual', validateFlow, docs([{ key: 'k', label: 'תלוש' }])), [], 'עם רשימה — תקין');
    const onb: FlowDefinition = { stages: [{ ...manual.stages[0], delivery: 'hold', items: [manual.stages[0].items[0]] }] };
    deepEqual(allIssues(onb, 'quote_approved', validateFlow, docs([])), [], 'בקליטה — רשימת ברירת המחדל');
  }),
  test('מסלול שחוזר: סוג «אחד ללקוח» מסומן ולא ייווצר; בקשה חופשית — תקינה', () => {
    const lib = buildLibraryLookup([{ id: 't1', name: 'שאלון', kind: 'request', officeId: 'o', seedKey: null,
      entries: [{ stepType: 'intake_questionnaire', owner: 'client', payload: {} }] }], []);
    const issues = allIssues(manual, 'manual', validateFlow, lib);
    const hit = issues.find(i => i.itemKey === 'a');
    assert(!!hit && /פעם אחת ללקוח/.test(hit.message), 'צריך לסמן סוג שלא חוזר');
    equal(hit?.notCreated, 'נוצרת פעם אחת ללקוח');
  }),
  test('«גם לבן/בת הזוג» על בקשה עם אישור אישי — מותר (לבן/בת הזוג נפתחת משימה למשרד), ומזוהה', () => {
    const tpl = (kind: string) => buildLibraryLookup([{ id: 't1', name: 'בקשה', kind: 'request', officeId: 'o', seedKey: null,
      entries: [{ stepType: 'custom_request', owner: 'client', payload: { requirements: [{ key: 'r', kind, label: 'x' }] } }] }], []);
    const d: FlowDefinition = { stages: [{ ...manual.stages[0], items: [{ key: 'a', ref: { kind: 'template', templateId: 't1' }, perPerson: true }] }] };
    deepEqual(allIssues(d, 'manual', validateFlow, tpl('confirm')), [], 'לא חוסם שמירה');
    assert(personalConfirmOf(d.stages[0].items[0], tpl('confirm')) && !personalConfirmOf(d.stages[0].items[0], tpl('file')), 'מזוהה לפי סוג הפריט');
    deepEqual(allIssues(d, 'manual', validateFlow, tpl('file')), [], 'קובץ — תקין');
    assert(!allIssues(d, 'manual', validateFlow, tpl('confirm')).some(i => i.notCreated), 'לבעל הכרטיס היא כן נוצרת');
  }),
  test('סיבת דילוג: עברית, וגם קוד לא מוכר לא יוצא גולמי', () => {
    assert(!/no_requirements/.test(skipReasonText('no_requirements')), 'no_requirements');
    equal(skipReasonText('weird_code'), 'לא נוצרה');
    assert(!/[a-z_]{4,}/.test(skipReasonText('not_repeatable') + skipReasonText('personal_confirm')), 'הקודים החדשים בעברית');
  }),
  test('מסלול ידני תקין — אין מה לתקן', () => {
    deepEqual(allIssues(manual, 'manual', validateFlow), []);
  }),
  test('בקשת מערכת במסלול ידני נדחית', () => {
    const d: FlowDefinition = { stages: [{ ...manual.stages[0], items: [{ key: 'x', ref: { kind: 'system', stepType: 'client_documents' } }] }] };
    assert(allIssues(d, 'manual', validateFlow).some(i => i.itemKey === 'x'), 'צריך לסמן את בקשת המערכת');
  }),
  test('קליטה: בקשת מערכת בשלב מאוחר, ו«לכל אדם» — נדחים', () => {
    const d: FlowDefinition = { stages: [
      { key: 's1', name: 'א', opens: { after: 'start' }, delivery: 'hold', items: [{ key: 't', ref: { kind: 'template', templateId: 't1' }, perPerson: true }] },
      { key: 's2', name: 'ב', opens: { after: 'stage', stage: 's1' }, delivery: 'hold', items: [{ key: 'x', ref: { kind: 'system', stepType: 'client_documents' } }] },
    ] };
    const issues = allIssues(d, 'quote_approved', validateFlow);
    assert(issues.some(i => i.itemKey === 'x'), 'בקשת מערכת בשלב מאוחר');
    assert(issues.some(i => i.itemKey === 't'), '«לכל אדם» בקליטה');
  }),
  test('שלב שנפתח אחרי פעולה, ופריט שמחכה לפעולה — נדחים', () => {
    const d: FlowDefinition = { stages: [
      { ...manual.stages[0], items: [...manual.stages[0].items, { key: 'c', ref: { kind: 'template', templateId: 't2' }, after: 'act' }] },
      { ...manual.stages[1], opens: { after: 'item', item: 'act' } },
    ] };
    const issues = allIssues(d, 'manual', validateFlow);
    assert(issues.some(i => i.stageKey === 's2'), 'שלב אחרי פעולה');
    assert(issues.some(i => i.itemKey === 'c'), 'פריט אחרי פעולה');
  }),
  test('העברה לשלב אחר מוחקת «אחרי», גם אצל מי שחיכה', () => {
    const moved = moveItemToStage(manual, 'a', 's2');
    equal(moved.stages[0].items.find(i => i.key === 'b')?.after, undefined);
    equal(moved.stages[1].items[0].key, 'a');
    deepEqual(dependentsOfItem(manual, 'a'), ['פריט באותו שלב']);
  }),
  test('בקשת מערכת מוצעת רק לסוגים שעוד אין להם', () => {
    const d: FlowDefinition = { stages: [{ key: 's1', name: 'א', opens: { after: 'start' }, delivery: 'hold', items: [
      { key: 'x', ref: { kind: 'system', stepType: 'client_documents' }, when: { kinds: ['company', 'licensed_dealer'] } },
    ] }] };
    deepEqual(freeKindsForSystem(d, d.stages[0], 'client_documents'), ['exempt_dealer', 'tax_refund', 'representation_only']);
    equal(freeKindsForSystem(d, d.stages[0], 'release_letter').length, 5);
  }),
  test('נוסח «על מי זה חל» לפי מספר הריצות', () => {
    equal(runsText(undefined, 3), 'חל על לקוחות חדשים בלבד. אין כרגע לקוחות באמצע המסלול.');
    equal(runsText({ '2': 1 }, 2), 'חל על לקוחות חדשים בלבד. לקוח אחד באמצע ממשיך בגרסה 2 — אפשר לעדכן כל אחד מהכרטיס שלו.');
    equal(runsText({ '1': 2, '2': 3 }, 2), 'חל על לקוחות חדשים בלבד. 5 לקוחות באמצע ממשיכים בגרסה שבה התחילו (עד 2) — אפשר לעדכן כל אחד מהכרטיס שלו.');
  }),
  // ‼ (4.10.2026) ב«כולם» — «4 ללקוח» כששניים רק לחלק מהלקוחות נקרא כאילו כל לקוח מקבל 4.
  test('ספירת השלב: לכל לקוח מול לפי הלקוח', () => {
    const c = { client: 4, office: 1, external: 0, actionsAuto: 0, actionsManual: 0 };
    equal(countsText(c), '4 ללקוח · 1 לך');
    equal(countsText(c, 2), '2 לכל לקוח · עוד 2 לפי הלקוח · 1 לך');
    equal(countsText(c, 4), '4 ללקוח — לפי הלקוח · 1 לך');
    equal(countsText({ ...c, client: 0, office: 0 }), 'אין כאן כלום עדיין');
  }),

  // ‼ G:X-1 — אישור אישי של בן/בת הזוג הוא משימה אליך שמחזיקה את השלב; הכרטיס אומר את זה.
  test('«גם לבן/בת הזוג» על בקשה עם אישור אישי — משימה אליך', () => {
    equal(perPersonTag(false), 'גם לבן/בת הזוג');
    equal(perPersonTag('only'), 'לבן/בת הזוג: משימה אליך');
    equal(perPersonTag('with_page'), 'לבן/בת הזוג: קבצים בדף · האישור — משימה אליך');
  }),

  // ‼ A:X-3 — מצב בלי מסמכים יוצר «להעלות 0 מסמכים»; פריט בלי רשימה משלו נופל לרשימות הקבועות.
  test('מסמכים בקליטה: מצב בלי מסמכים נעצר לפני שמירה; פריט בלי רשימה — תקין', () => {
    const def = (variants?: unknown[]): FlowDefinition => ({ stages: [{ key: 's1', name: 'פתיחה', opens: { after: 'start' }, delivery: 'hold', items: [
      { key: 'client_documents', ref: { kind: 'system', stepType: 'client_documents' }, system: variants ? { variants: variants as never } : {} },
    ] }] });
    deepEqual(validateFlow(def(), { onboarding: true }), [], 'בלי רשימה משלו — הרשימות הקבועות');
    deepEqual(validateFlow(def(BUILT_IN_VARIANTS.client_documents), { onboarding: true }), [], 'הרשימות הקבועות עצמן');
    const emptied = BUILT_IN_VARIANTS.client_documents.map(v => (v.fact === null ? { ...v, items: [] } : v));
    const issues = validateFlow(def(emptied), { onboarding: true });
    equal(issues.length, 1);
    assert(/ברירת מחדל/.test(issues[0].message) && /בקשה ריקה/.test(issues[0].message), issues[0].message);
    const emptyState = BUILT_IN_VARIANTS.client_documents.map(v => (v.fact === 'has_prev' ? { ...v, items: [{ label: '  ' }] } : v));
    assert(/מסירים את המצב/.test(validateFlow(def(emptyState), { onboarding: true })[0]?.message ?? ''), 'מצב שאינו ברירת המחדל — אפשר להסיר');
    equal(BUILT_IN_VARIANTS.client_documents[BUILT_IN_VARIANTS.client_documents.length - 1].fact, null, 'הנופל־אחורה אחרון');
  }),
];
