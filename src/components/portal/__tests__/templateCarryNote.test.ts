// ─── בדיקות: «מצורף ללקוח» — מה שבקשה מהספרייה נושאת ללקוח (221) ────────────────
// ‼ מה נעול כאן:
//   · השורה אומרת רק מה שבאמת מצורף: הסבר (clientNote / clientNoteAfter / clientRefs) ומדריך מצולם
//     שהמפתח שלו מוכר. מפתח לא מוכר — לא נאמר שיש מדריך (הדף לא יציג אותו).
//   · «הצגה» פותחת את המדריך בקריאה בלבד (entryInert); הרכיב מחובר לקומפוזר בכרטיס ולעורך בספרייה.
//   · הקומפוזר מעביר לבקשה את ארבעת המפתחות — רק ביצירה ורק בבקשה ללקוח.

import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { templateCarryParts, templateCarryText } from '../TemplateCarryNote';
import { PHOTO_GUIDES } from '../photoGuides';
import { TEMPLATE_CARRY_KEYS, templateCarryOver } from '../../../lib/requestTemplates';
import COMPOSER_RAW from '../../clientTabs/InlineComposer.tsx?raw';
import EDITOR_RAW from '../../office/pages/library/RequestEditor.tsx?raw';
import CARRY_RAW from '../TemplateCarryNote.tsx?raw';

const norm = (s: string) => s.replace(/\r\n/g, '\n');
const G = PHOTO_GUIDES.reserve_duty_claim;

export const TESTS: TestCase[] = [
  test('הטקסט: הסבר · מדריך מצולם (7 צעדים) — כל חלק רק אם קיים', () => {
    equal(templateCarryText(templateCarryParts({ clientNote: 'הסבר', clientPhotoGuide: 'reserve_duty_claim' })), 'מצורף ללקוח: הסבר · מדריך מצולם (7 צעדים)');
    equal(templateCarryText(templateCarryParts({ clientPhotoGuide: 'reserve_duty_claim' })), 'מצורף ללקוח: מדריך מצולם (7 צעדים)');
    equal(templateCarryText(templateCarryParts({ clientNoteAfter: 'אחרי' })), 'מצורף ללקוח: הסבר');
    equal(templateCarryText(templateCarryParts({ clientRefs: [{ label: 'קוד', value: '1' }] })), 'מצורף ללקוח: הסבר');
    equal(templateCarryText(templateCarryParts({ clientNote: 'הסבר', clientPhotoGuide: 'reserve_duty_claim' }), 'מצורף ללקוח מהספרייה:'),
      'מצורף ללקוח מהספרייה: הסבר · מדריך מצולם (7 צעדים)');
    equal(templateCarryParts({ clientPhotoGuide: 'reserve_duty_claim' }).guide, G);
  }),

  test('אין מה לצרף ⇒ אין שורה; מפתח לא מוכר או ריק לא נחשב מדריך', () => {
    for (const c of [null, undefined, {}, { clientNote: '   ' }, { clientNote: '', clientNoteAfter: '' }, { clientRefs: [] },
      { clientPhotoGuide: 'nope' }, { clientPhotoGuide: '' }, { clientPhotoGuide: 'constructor' }, { title: 'משהו' }]) {
      equal(templateCarryText(templateCarryParts(c as Record<string, unknown> | null | undefined)), null, JSON.stringify(c));
    }
    // הסבר + מפתח לא מוכר ⇒ רק «הסבר».
    equal(templateCarryText(templateCarryParts({ clientNote: 'x', clientPhotoGuide: 'nope' })), 'מצורף ללקוח: הסבר');
  }),

  test('templateCarryOver: ארבעת המפתחות בלבד, ריקים נשמטים, null ⇒ {}', () => {
    deepEqual([...TEMPLATE_CARRY_KEYS], ['clientNote', 'clientNoteAfter', 'clientRefs', 'clientPhotoGuide']);
    const refs = [{ label: 'קוד מוסד', value: '123' }];
    deepEqual(templateCarryOver({
      title: 'x', clientTitle: 'y', clientSub: 'z', clientCta: 'c', requirements: [{ key: 'r1' }], autoAction: null,
      clientNote: 'הסבר', clientNoteAfter: 'אחרי', clientRefs: refs, clientPhotoGuide: 'reserve_duty_claim', clientLinkUrl: 'https://x.example',
    }), { clientNote: 'הסבר', clientNoteAfter: 'אחרי', clientRefs: refs, clientPhotoGuide: 'reserve_duty_claim' });
    deepEqual(templateCarryOver({ clientNote: '', clientNoteAfter: '   ', clientRefs: [], clientPhotoGuide: '' }), {});
    deepEqual(templateCarryOver({ clientNote: 5 as unknown as string, clientRefs: 'x' as unknown as [] }), {}, 'סוג לא צפוי — לא עובר');
    deepEqual(templateCarryOver(null), {});
    deepEqual(templateCarryOver(undefined), {});
    deepEqual(templateCarryOver({ clientNote: '  הסבר עם רווחים  ' }), { clientNote: '  הסבר עם רווחים  ' }, 'הערך המקורי, לא קצוץ');
  }),

  test('הקומפוזר: מעביר את המפתחות רק ביצירה ורק בבקשה ללקוח, ומציג שורה «מצורף ללקוח מהספרייה»', () => {
    const src = norm(COMPOSER_RAW);
    assert(/\.\.\.\(!edit && owner === 'client' \? templateCarryOver\(initialContent\) : \{\}\),/.test(src), 'מיזוג ב-buildPayload');
    assert(/<TemplateCarryNote content=\{editContent\} lead=\{edit \? 'מצורף ללקוח:' : 'מצורף ללקוח מהספרייה:'\} \/>/.test(src), 'השורה בקומפוזר');
    assert(/owner === 'client' && \(\s*<TemplateCarryNote/.test(src), 'רק בבקשה ללקוח');
    // המיזוג נמצא לפני requirements ואינו דורס שדה שהקומפוזר כותב.
    const iCarry = src.indexOf('templateCarryOver(initialContent)');
    const iReq = src.indexOf('...(requirements.length ? { requirements } : {}),');
    assert(iCarry > 0 && iReq > iCarry, 'סדר המיזוג');
  }),

  test('עורך הספרייה: שורת «מצורף» ו«הצגה» בתוך «מה הלקוח רואה», והמפתח לא נערך', () => {
    const src = norm(EDITOR_RAW);
    assert(/<TemplateCarryNote content=\{orig\} \/>/.test(src), 'השורה בעורך');
    const iFieldset = src.indexOf('מה הלקוח רואה</legend>');
    const iNote = src.indexOf('<TemplateCarryNote');
    assert(iFieldset > 0 && iNote > iFieldset, 'בתוך «מה הלקוח רואה»');
    assert(/const payload: Record<string, unknown> = \{ \.\.\.orig \};/.test(src), 'ה-payload נשמר כולו (המפתח עובר)');
    assert(!/clientPhotoGuide/.test(src), 'אין שדה לעריכת המפתח');
  }),

  test('«הצגה» פותחת את המדריך בקריאה בלבד', () => {
    const src = norm(CARRY_RAW);
    assert(/<PhotoGuideDialog guide=\{parts\.guide\} onClose=\{\(\) => setOpen\(false\)\} entryInert \/>/.test(src), 'entryInert');
    assert(/>הצגה<\/button>/.test(src), 'הכפתור «הצגה»');
    assert(/parts\.guide && \(\s*<button/.test(src), 'כפתור רק כשיש מדריך מוכר');
  }),
];
