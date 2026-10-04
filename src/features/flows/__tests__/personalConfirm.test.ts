// ─── בדיקות: אישור אישי — מתי לבן/בת הזוג נפתחת משימה אליך ולא בקשה בדף ──────
// ‼ מה נעול כאן:
//   · כלל אחד (refHasPersonalConfirm) לבונה ולחלון ההפעלה — כמו _flow_has_personal_confirm.
//   · מסמך מהספרייה — תמיד כן: בקשת המסמך כוללת תמיד «עברתי על…», גם כשהמסמך
//     נמחק מהספרייה ועוד לא נטענה. חלון ההפעלה אמר «בדף של …» והשרת פתח משימה.
//   · בקשה מהספרייה — לפי הנוסח; נמחקה — לפי העותק בפריט.
//   · בקשה שיש בה גם קבצים/פרטים ('with_page'): החלק הזה נפתח בדף של בעל הכרטיס בשם בן/בת
//     הזוג, והאישור — משימה אליך (_flow_materialize: page + office). הטקסטים אמרו «לא בדף».
//   · בחלון «הפרטים השתנו» — השרת קודם (personalConfirm / pagePart); חסר — הספרייה.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { hasPersonalConfirm } from '../compile';
import type { FlowItem } from '../types';
import { buildDocumentRequestPayload } from '../../../lib/clientGuide';
import {
  buildLibraryLookup, hasPagePart, perPersonHint, personalConfirmOf, planSpouseText, refHasPagePart, refHasPersonalConfirm, refPersonalConfirm,
  spouseAddText, suggestionPersonalConfirm,
} from '../../../components/flows/builder/model';

const tplLib = (kind: string) => ({
  template: (id: string) => (id === 't1' ? { payload: { requirements: [{ key: 'r', kind, label: 'x' }] } } : undefined),
});
/** בקשה בספרייה עם כמה סוגי פריטים. */
const tplKinds = (...kinds: string[]) => ({
  template: (id: string) => (id === 't1'
    ? { payload: { requirements: kinds.map((kind, i) => ({ key: 'r' + i, kind, label: 'x' })) } } : undefined),
});
const tpl = { kind: 'template', templateId: 't1' } as { kind: string };

export const TESTS: TestCase[] = [
  test('מסמך מהספרייה — תמיד אישור אישי, גם בלי ספרייה טעונה', () => {
    equal(refHasPersonalConfirm({ kind: 'document', docId: 'd1' } as { kind: string }, null), true);
    equal(refHasPersonalConfirm({ kind: 'document', docId: 'gone' } as { kind: string }, tplLib('file')), true);
  }),

  test('הסיבה: בקשת המסמך שנבנית תמיד כוללת «עברתי על…»', () => {
    const p = buildDocumentRequestPayload({ id: 'd1', label: 'מדריך פתיחת תיק', path: '', url: '', fileName: '', at: '' });
    assert(hasPersonalConfirm(p), 'בלי זה הכלל «מסמך ⇒ כן» לא היה נכון');
  }),

  test('בקשה מהספרייה — לפי הנוסח: אישור ⇒ כן, רק קבצים ⇒ לא', () => {
    equal(refHasPersonalConfirm({ kind: 'template', templateId: 't1' } as { kind: string }, tplLib('confirm')), true);
    equal(refHasPersonalConfirm({ kind: 'template', templateId: 't1' } as { kind: string }, tplLib('file')), false);
    equal(refHasPersonalConfirm({ kind: 'template', templateId: 't1' } as { kind: string }, null), false, 'לא ידוע — לא מבטיחים משימה');
  }),

  test('בקשה שנמחקה מהספרייה — לפי העותק בפריט, כמו השרת', () => {
    const snap = { requirements: [{ key: 'r', kind: 'confirm', label: 'מאשר/ת' }] };
    equal(refHasPersonalConfirm({ kind: 'template', templateId: 'gone' } as { kind: string }, tplLib('file'), snap), true);
  }),

  test('בקשת מערכת ופעולה מול רשות — לא', () => {
    equal(refHasPersonalConfirm({ kind: 'system', stepType: 'client_documents' } as { kind: string }, tplLib('confirm')), false);
    equal(refHasPersonalConfirm({ kind: 'action', actionType: 'btl.sync_file' } as { kind: string }, tplLib('confirm')), false);
  }),

  test('בבונה: מסמך שנמחק מהספרייה עדיין «אישור אישי»', () => {
    const item: FlowItem = { key: 'a', ref: { kind: 'document', docId: 'gone' }, perPerson: true };
    equal(personalConfirmOf(item, buildLibraryLookup([], [])), 'only');
  }),

  test('קבצים + אישור אישי ⇒ with_page; רק אישור ⇒ only; בלי אישור ⇒ false', () => {
    equal(refPersonalConfirm(tpl, tplKinds('file', 'confirm')), 'with_page');
    equal(refPersonalConfirm(tpl, tplKinds('text', 'confirm')), 'with_page', 'גם פרטים, לא רק קבצים');
    equal(refPersonalConfirm(tpl, tplKinds('confirm', 'confirm')), 'only');
    equal(refPersonalConfirm(tpl, tplKinds('file')), false);
    equal(refPersonalConfirm({ kind: 'document', docId: 'd1' } as { kind: string }, null), 'only', 'מסמך — רק «פתיחה» ו«עברתי על…»');
  }),

  test('חלק בדף — כמו המסנן בשרת: פריט עם סוג שאינו confirm; בלי סוג — לא נספר', () => {
    equal(hasPagePart({ requirements: [{ kind: 'confirm' }, { label: 'בלי סוג' }] }), false);
    equal(hasPagePart({ requirements: [{ kind: 'select' }] }), true);
    equal(hasPagePart(undefined), false);
    equal(refHasPagePart(tpl, null, { requirements: [{ kind: 'file' }, { kind: 'confirm' }] }), true, 'נמחקה — לפי העותק');
    equal(refHasPagePart({ kind: 'document', docId: 'd1' } as { kind: string }, tplKinds('file')), false);
  }),

  test('«הפרטים השתנו»: השרת קודם; שדה חסר — לפי הספרייה', () => {
    equal(suggestionPersonalConfirm({ personalConfirm: true, pagePart: true }, false), 'with_page');
    equal(suggestionPersonalConfirm({ personalConfirm: true, pagePart: false }, 'with_page'), 'only', 'השרת גובר');
    equal(suggestionPersonalConfirm({ personalConfirm: false }, 'with_page'), false);
    equal(suggestionPersonalConfirm({ personalConfirm: true }, 'with_page'), 'with_page', 'שרת ישן בלי pagePart');
    equal(suggestionPersonalConfirm({}, 'only'), 'only');
    equal(suggestionPersonalConfirm({}, false), false);
  }),

  test('הטקסטים: with_page אומר שהקבצים בדף של בעל הכרטיס בשם בן/בת הזוג, והאישור — משימה אליך', () => {
    const add = spouseAddText('with_page', 'דני', 'רותם');
    assert(add.includes('בדף של דני') && add.includes('השם של רותם') && add.includes('משימה אליך'), add);
    assert(!add.includes('לא תיפתח בקשה בדף'), add);
    const plan = planSpouseText('with_page', 'דני');
    assert(plan.includes('בדף של דני') && plan.includes('משימה אליך'), plan);
    const hint = perPersonHint('with_page');
    assert(hint.includes('יופיע בדף של בעל הכרטיס') && hint.includes('משימה אליך'), hint);
    assert(!hint.includes('לא תיפתח בקשה בדף'), hint);
  }),

  test('הטקסטים: only — הנוסח הקודם (משימה, לא בדף); false — בדף של בעל הכרטיס', () => {
    equal(spouseAddText('only', 'דני', 'רותם'), 'תיפתח לך משימה להשיג את האישור האישי של רותם — לא בדף ולא במייל');
    equal(planSpouseText('only', 'דני'), ' · לבן/בת הזוג: משימה אליך להשיג את האישור האישי (אין לו/ה דף משלו)');
    assert(perPersonHint('only').includes('לא תיפתח בקשה בדף — תיפתח לך משימה'), perPersonHint('only'));
    equal(planSpouseText(false, 'דני'), ' · גם לבן/בת הזוג — בדף של דני');
    assert(spouseAddText(false, 'דני', 'רותם').startsWith('יופיע בדף של דני עם השם של רותם'), spouseAddText(false, 'דני', 'רותם'));
  }),
];
