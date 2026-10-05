// ─── בדיקות: «צפייה» בבונה המסלולים (D2, 5.10.2026) ──────────────────────────────────────
// ‼ מה נעול כאן:
//   · מפה אחת מפריט במסלול ליעד: בקשה ← targetOfTemplate, מסמך ← doc, בקשת מערכת ← system, פעולה מול רשות ← אין
//     «צפייה» (אין לה כרטיס בדף של הלקוח).
//   · בקשה שנמחקה מהספרייה עדיין נפתחת (השרת אומר «נמחק מהספרייה») — לא נעלמת ולא ריקה.
//   · Esc סוגר רק את המגירה: FlSheet מגיב ל-Esc רק כחלון העליון (ui.tsx), והמגירה נפתחת אחרי היריעה המארחת.
//   · «צפייה» לא מקוננת בתוך כפתור השורה, ואין «צפייה» במדף הפעולות.

import { test, assert, equal, deepEqual, type TestCase } from '../../../../testkit/tinyTest';
import type { RequestTemplate } from '../../../../lib/requestTemplates';
import type { FlowItem } from '../../../../features/flows/types';
import { previewTargetOfItem, previewTargetOfSubject, systemPreviewTarget, EMPTY_PROFILE } from '../previewTarget';
import UI_RAW from '../ui.tsx?raw';
import ADD_RAW from '../AddSheet.tsx?raw';
import ITEM_RAW from '../ItemSheet.tsx?raw';
import HOOK_RAW from '../BuilderPreview.tsx?raw';

const ADD = ADD_RAW.replace(/\r\n/g, '\n');
const ITEM = ITEM_RAW.replace(/\r\n/g, '\n');
const HOOK = HOOK_RAW.replace(/\r\n/g, '\n');
const UI = UI_RAW.replace(/\r\n/g, '\n');

const tpl = (id: string, name: string, payload: Record<string, unknown>, extra: Partial<RequestTemplate> = {}): RequestTemplate => ({
  id, name, kind: 'request', officeId: 'o1', seedKey: null,
  entries: [{ stepType: 'custom_request', owner: 'client', payload }], ...extra,
});
const reqs = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `r${i}`, kind: 'confirm', label: `פריט ${i}` }));
const titleOf = (i: FlowItem) => `שם:${i.key}`;
const itemOf = (ref: FlowItem['ref'], extra: Partial<FlowItem> = {}): FlowItem => ({ key: 'k1', ref, ...extra });

export const TESTS: TestCase[] = [
  test('פריט מהספרייה ← יעד של בקשה, עם עובדות לצירי המצב מהרשימה', () => {
    const t = tpl('t1', 'אישורי ניכוי', { requirements: reqs(3) });
    const target = previewTargetOfItem(itemOf({ kind: 'template', templateId: 't1' }), { templates: [t], title: titleOf });
    assert(target && target.kind === 'template', 'יעד בקשה');
    equal(target.templateId, 't1');
    equal(target.name, 'אישורי ניכוי', 'השם מהספרייה, לא מהכותרת של המסלול');
    equal(target.facts.listLength, 3);
    equal(target.facts.internal, false);
  }),

  test('פריט שמצביע על נוסח מוכן שהמשרד החליף — נמצא דרך overrides', () => {
    const office = tpl('t-office', 'עותק המשרד', { requirements: reqs(2) }, { overrides: ['seed-1'] });
    const target = previewTargetOfItem(itemOf({ kind: 'template', templateId: 'seed-1' }), { templates: [office], title: titleOf });
    assert(target && target.kind === 'template', 'יעד בקשה');
    equal(target.templateId, 't-office');
  }),

  test('בלי רשימת בקשות: העובדות מהעותק השמור בפריט (snapshot), והשרת קורא את הספרייה לפי המזהה', () => {
    const target = previewTargetOfItem(
      itemOf({ kind: 'template', templateId: 't9' }, { snapshot: { stepType: 'custom_request', title: 'x', payload: { requirements: reqs(4), clientResource: 'r' } } }),
      { title: titleOf });
    assert(target && target.kind === 'template', 'יעד בקשה');
    equal(target.templateId, 't9');
    equal(target.name, 'שם:k1', 'השם מהכותרת של הפריט');
    equal(target.facts.listLength, 4);
    equal(target.facts.hasResource, true);
  }),

  test('בקשה שנמחקה מהספרייה ועוד במסלול: עדיין יעד (השרת אומר «נמחק מהספרייה») — לא null', () => {
    const target = previewTargetOfItem(itemOf({ kind: 'template', templateId: 'gone' }), { templates: [tpl('t1', 'א', {})], title: titleOf });
    assert(target && target.kind === 'template', 'יעד בקשה');
    equal(target.templateId, 'gone');
    equal(target.facts.listLength, 0);
  }),

  test('מסמך ← doc; בקשת מערכת ← system; השם מכותרת הפריט במסלול', () => {
    deepEqual(previewTargetOfItem(itemOf({ kind: 'document', docId: 'doc_1' }), { title: titleOf }), { kind: 'doc', docId: 'doc_1', name: 'שם:k1' });
    deepEqual(previewTargetOfItem(itemOf({ kind: 'system', stepType: 'paperless_invite' }), { title: titleOf }),
      { kind: 'system', stepType: 'paperless_invite', name: 'שם:k1' });
  }),

  test('בקשת מערכת שיש לה נוסח בספרייה («מסמכים מהלקוח») ← השורה שבספרייה, עם הרשימה — לא «0 מסמכים»', () => {
    const seed = tpl('seed-docs', 'מסמכים מהלקוח', {}, { officeId: null, seedKey: 'client_documents',
      entries: [{ stepType: 'client_documents', owner: 'client', payload: { checklist: reqs(2) } }] });
    const viaItem = previewTargetOfItem(itemOf({ kind: 'system', stepType: 'client_documents' }), { templates: [seed, tpl('t1', 'א', {})], title: titleOf });
    assert(viaItem && viaItem.kind === 'template', 'השורה שבספרייה');
    equal(viaItem.templateId, 'seed-docs');
    equal(viaItem.facts.listLength, 2);
    // אותו כלל בבחירה (AddSheet) ובפריט (ItemSheet / כלל פתיחה)
    deepEqual(systemPreviewTarget('client_documents', 'x', [seed]), viaItem);
    // בלי נוסח בספרייה (פייפרלס, שירות של המערכת) או בלי רשימה — יעד מערכת
    deepEqual(systemPreviewTarget('paperless_invite', 'הרשמה', [seed]), { kind: 'system', stepType: 'paperless_invite', name: 'הרשמה' });
    deepEqual(systemPreviewTarget('client_documents', 'x'), { kind: 'system', stepType: 'client_documents', name: 'x' });
    // עותק של המשרד לאותו סוג (אותו seedKey) — גם הוא השורה
    const copy = tpl('office-docs', 'מסמכים מהלקוח', {}, { seedKey: 'client_documents',
      entries: [{ stepType: 'client_documents', owner: 'client', payload: { checklist: reqs(3) } }] });
    const viaCopy = systemPreviewTarget('client_documents', 'x', [copy]);
    assert(viaCopy.kind === 'template' && viaCopy.templateId === 'office-docs', 'העותק של המשרד');
    // בקשה חופשית שנקראת באותו שם אינה «השורה» של הסוג
    deepEqual(systemPreviewTarget('client_documents', 'x', [tpl('t2', 'מסמכים מהלקוח', { requirements: reqs(1) })]),
      { kind: 'system', stepType: 'client_documents', name: 'x' });
  }),

  test('פעולה מול רשות: אין «צפייה» — הלקוח לא רואה אותה', () => {
    equal(previewTargetOfItem(itemOf({ kind: 'action', actionId: 'a', actionType: 'btl.sync_file' }), { title: titleOf }), null);
    equal(previewTargetOfSubject({ kind: 'item', item: itemOf({ kind: 'action', actionId: 'a', actionType: 'btl.sync_file' }) }, { title: titleOf }), null);
  }),

  test('נושא של כלל: קבוצה ← יעד קבוצה עם שמה; פריט ← כמו פריט', () => {
    const g = previewTargetOfSubject({ kind: 'group', group: 'paperless' }, { title: titleOf });
    assert(g && g.kind === 'group', 'יעד קבוצה');
    equal(g.group, 'paperless');
    equal(g.name, 'פייפרלס');
    const it = previewTargetOfSubject({ kind: 'item', item: itemOf({ kind: 'document', docId: 'd' }) }, { title: titleOf });
    equal(it?.kind, 'doc');
  }),

  test('Esc סוגר רק את המגירה: FlSheet מגיב רק כחלון העליון, והמגירה נפתחת אחרי היריעה המארחת (פורטל בסוף ה-body)', () => {
    assert(UI.includes(`document.querySelectorAll('[role="dialog"][aria-modal="true"]')`)
      && UI.includes('dialogs[dialogs.length - 1] !== ref.current'), 'ui.tsx: רק החלון העליון מטפל ב-Esc');
    assert(UI.includes('createPortal(') && UI.includes('document.body'), 'היריעה — פורטל לסוף ה-body');
    assert(!ADD.includes('guard') && !ITEM.includes('guard'), 'אין משמר נוסף ביריעות — מקור אחד ב-ui.tsx');
  }),

  test('הפרופיל הריק משפיע רק על המייל: אין בו נתוני משרד', () => {
    deepEqual(EMPTY_PROFILE.settings, {});
    equal(EMPTY_PROFILE.id, '');
  }),

  test('AddSheet: «צפייה» בכל שורה בשלושה סוגי פריט (בקשת מערכת · בקשה · מסמך), לא בפעולות; «הוספה» בתחתית המגירה', () => {
    assert((ADD.match(/<PreviewButton /g) ?? []).length === 3, 'שלוש שורות: מערכת, בקשה, מסמך');
    assert(ADD.includes('systemPreviewTarget(r.sys!.t, r.name, templates)') && ADD.includes('preview.open(targetOfTemplate(t),')
      && ADD.includes("{ kind: 'doc', docId: d.id, name: d.label }"), 'המפה של שלושת הסוגים');
    const actions = ADD.slice(ADD.indexOf("shelf === 'actions' && ("));
    assert(!actions.includes('PreviewButton'), 'במדף הפעולות אין «צפייה»');
    assert(actions.includes('אין לה «צפייה»'), 'ובמדף נאמר למה');
    assert(ADD.includes('{preview.node}'), 'המגירה מרונדרת');
    assert((ADD.match(/className="bp-pick"/g) ?? []).length === 3, '«צפייה» לצד השורה ולא בתוכה');
    assert(ADD.includes("disabled: here === 'כבר בשלב'"), 'פריט שכבר בשלב — «הוספה» כבויה');
  }),

  test('ItemSheet: «צפייה» בשני המבנים (קבוע/רגיל), ו«עריכה» במגירה רק כשיש לאן', () => {
    assert(ITEM.includes('previewTargetOfItem(item, { templates, title })'), 'מפה אחת');
    assert((ITEM.match(/\{viewRow\}/g) ?? []).length === 2, 'בשתי היריעות');
    assert((ITEM.match(/\{preview\.node\}/g) ?? []).length === 2, 'מגירה בשתיהן');
    assert(ITEM.includes('canEditSource = !!onOpen && (isSystem || inLibrary)'), 'בלי לאן — בלי «עריכה»');
  }),

  test('ההוק: המגירה בלי רשת משלה (הפוקוס חוזר ל«צפייה» דרך FlSheet)', () => {
    assert(HOOK.includes('<RequestPreviewSheet key={targetKey(opened.target)}'), 'המגירה של «צפייה»');
    assert(!HOOK.includes('supabase') && !HOOK.includes('fetch('), 'ההוק אינו פונה לרשת');
  }),
];
