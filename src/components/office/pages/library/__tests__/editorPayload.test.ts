// ─── בדיקות: «מה הלקוח רואה» בעורך הבקשה — הכרטיס האמיתי על הטיוטה (C7, 5.10.2026) ───────
// ‼ מה נעול כאן:
//   · ה-payload של הטיוטה נבנה באותה פונקציה ששמירה משתמשת בה (buildEditorPayload) — מה שרואים הוא מה שיישמר.
//   · בקשה לצפייה מהטיוטה היא בדיוק הבקשה שרישום ה«draft» בונה (viewOf) — בלי בנייה שנייה.
//   · הכרטיס אינו חיקוי: הוא PortalView במצב sample, על תשובת השרת; כשל — «נסו שוב»; ובלי שום כתיבה.
//   · «תצוגה מלאה» נפתחת מחוץ לחלון העורך (בלי אירועי חלון שזולגים), עם תווית «טיוטה — לא נשמר» רק על טיוטה.

import { createElement } from 'react';
// ‼ גרסת הדפדפן של הרינדור הסטטי (ראה portalModes.test.ts). בלי הצהרת טיפוסים.
// @ts-expect-error TS7016 — אין הצהרת טיפוסים ל-react-dom/server.browser
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { test, assert, equal, deepEqual, type TestCase } from '../../../../../testkit/tinyTest';
import { buildEditorPayload, derivedDocumentsTitle, keptItems, type EditorListEntry, type EditorPayloadInput } from '../editorPayload';
import { viewOf } from '../../../../../features/requestPreview/registry';
import { requestKey } from '../../../../../features/requestPreview/api';
import { LIVE_DEBOUNCE_MS } from '../EditorLiveCard';
import EditorLiveCard from '../EditorLiveCard';
import EDITOR_RAW from '../RequestEditor.tsx?raw';
import LIVE_RAW from '../EditorLiveCard.tsx?raw';

const EDITOR = EDITOR_RAW.replace(/\r\n/g, '\n');
const LIVE = LIVE_RAW.replace(/\r\n/g, '\n');

const item = (key: string, label: string, kind = 'confirm', rest: Record<string, unknown> = {}): EditorListEntry => ({ key, label, kind, rest });
const base = (over: Partial<EditorPayloadInput> = {}): EditorPayloadInput => ({
  orig: {}, custom: true, showCopy: true, derivedCopy: false, listKey: 'requirements',
  name: 'אישורי ניכוי', clientTitle: '', clientSub: '', clientCta: '', items: [], ...over,
});

export const TESTS: TestCase[] = [
  test('בקשה חופשית: השם הוא הכותרת, וכותרת/כפתור ריקים מקבלים ברירת מחדל — כמו שהשמירה כותבת', () => {
    const p = buildEditorPayload(base({ items: [item('a', 'צילום תעודת זהות', 'file')] }));
    equal(p.title, 'אישורי ניכוי');
    equal(p.clientTitle, 'אישורי ניכוי', 'בלי כותרת ללקוח — השם');
    equal(p.clientSub, '');
    equal(p.clientCta, 'למילוי');
    deepEqual(p.requirements, [{ required: true, key: 'a', kind: 'file', label: 'צילום תעודת זהות', done: false }]);
  }),

  test('נוסח שהמשרד כתב גובר על ברירות המחדל, ורווחים נחתכים', () => {
    const p = buildEditorPayload(base({ clientTitle: '  להעלות אישורים ', clientSub: ' שתי דקות ', clientCta: ' להעלאה ', items: [item('a', ' א ')] }));
    equal(p.clientTitle, 'להעלות אישורים');
    equal(p.clientSub, 'שתי דקות');
    equal(p.clientCta, 'להעלאה');
    equal((p.requirements as { label: string }[])[0].label, 'א');
  }),

  test('שורה בלי שם אינה פריט; שדות שהעורך לא עורך (חובה, אפשרויות) עוברים', () => {
    const items = [item('a', 'א', 'select', { required: false, options: ['x'] }), item('b', '   '), item('c', 'ג', 'text')];
    equal(keptItems(items).length, 2);
    const p = buildEditorPayload(base({ items }));
    deepEqual(p.requirements, [
      { required: false, options: ['x'], key: 'a', kind: 'select', label: 'א', done: false },
      { required: true, key: 'c', kind: 'text', label: 'ג', done: false },
    ]);
  }),

  test('ה-payload השמור עובר כמות שהוא — מה שהעורך לא עורך (מדריך מצולם, הסבר) נשמר ונשלח לצפייה', () => {
    const orig = { clientExplainer: 'הסבר', clientGuideUrl: 'https://x.test/g', extra: { a: 1 } };
    const p = buildEditorPayload(base({ orig, items: [item('a', 'א')] }));
    equal(p.clientExplainer, 'הסבר');
    equal(p.clientGuideUrl, 'https://x.test/g');
    deepEqual(p.extra, { a: 1 });
    deepEqual(orig, { clientExplainer: 'הסבר', clientGuideUrl: 'https://x.test/g', extra: { a: 1 } }, 'הקלט לא משתנה');
  }),

  test('בקשת מסמכים: הכותרת והשורה נגזרות מהרשימה (אחד / כמה), גם כשהנוסח אינו נערך', () => {
    const one = buildEditorPayload(base({
      custom: false, showCopy: false, derivedCopy: true, listKey: 'checklist', orig: { clientTitle: 'ישן', clientCta: 'להעלאה' },
      items: [item('a', 'צילום ת״ז')],
    }));
    equal(one.clientTitle, 'להעלות מסמך אחד');
    equal(one.clientSub, 'צילום ת״ז');
    equal(one.clientCta, 'להעלאה', 'הכפתור המקורי נשמר');
    equal('title' in one, false, 'לא בקשה חופשית — אין title');
    deepEqual(one.checklist, [{ key: 'a', label: 'צילום ת״ז', done: false }]);
    const three = buildEditorPayload(base({
      custom: false, showCopy: false, derivedCopy: true, listKey: 'checklist', items: [item('a', 'א'), item('b', 'ב'), item('c', 'ג')],
    }));
    equal(three.clientTitle, 'להעלות 3 מסמכים');
    equal(three.clientSub, 'א · ב · ג');
    equal(derivedDocumentsTitle(1), 'להעלות מסמך אחד');
    equal(derivedDocumentsTitle(4), 'להעלות 4 מסמכים');
  }),

  test('בקשה של המשרד (בלי נוסח ללקוח): אין שדות נוסח — רק השם והפריטים', () => {
    const p = buildEditorPayload(base({ showCopy: false, items: [item('a', 'לבדוק')] }));
    equal(p.title, 'אישורי ניכוי');
    equal('clientTitle' in p, false);
    equal('clientCta' in p, false);
  }),

  test('הצפייה החיה שולחת בדיוק את מה שהשמירה כותבת: דוגמה אחת מסוג «draft» עם אותו payload ואותו בעלים', () => {
    const payload = buildEditorPayload(base({ items: [item('a', 'א', 'file')] }));
    const req = viewOf({ kind: 'draft', name: '', stepType: 'custom_request', owner: 'client', payload }).build({});
    equal(req.samples.length, 1);
    const s = req.samples[0];
    equal(s.stepType, 'custom_request');
    equal(s.owner, 'client');
    deepEqual(s.payload, payload);
    equal(s.ref, undefined, 'בלי ref — השרת לא קורא ספרייה, הוא מצייר את הטיוטה');
    // שם התצוגה אינו חלק מהבקשה: הקלדת השם בלבד (בלי שינוי ב-payload) לא יוצרת בקשה חדשה לשרת.
    const again = viewOf({ kind: 'draft', name: 'שם אחר', stepType: 'custom_request', owner: 'client', payload }).build({});
    equal(requestKey(again), requestKey(req));
  }),

  test('העורך: שמירה והצפייה החיה בונים מאותו draftPayload, והחיקוי הישן הוסר', () => {
    assert(EDITOR.includes("import { writeEditorFields } from './editorPayload'"), 'כותב אחד');
    assert((EDITOR.match(/writeEditorFields\(/g) ?? []).length === 1, 'נקרא פעם אחת (useMemo) — לא עותק בשמירה');
    assert(/const payload: Record<string, unknown> = \{ \.\.\.orig \};\n\s*return writeEditorFields\(payload, /.test(EDITOR), 'העותק של השמור — והעורך כותב עליו');
    assert(/const payload = draftPayload;/.test(EDITOR), 'שמירה קוראת את draftPayload');
    assert(/viewOf\(\{ kind: 'draft'/.test(EDITOR), 'בקשת הצפייה מ-viewOf — לא נגזרת מחדש');
    assert(!EDITOR.includes('lb-preview-title') && !EDITOR.includes('previewTitle'), 'אין חיקוי בנוי ביד');
    assert(EDITOR.includes('<EditorLiveCard request={liveRequest} draft={showingDraft} onFull={openFull} />'), 'הכרטיס החי');
    // ‼ בלי שינויים — הבקשה השמורה (כמו המגירה), לא מה ש«שמירה» הייתה כותבת (ברירות מחדל כמו «למילוי»).
    assert(/const savedLive = template && !dirty \? savedRequest : null;\n\s*const showingDraft = !savedLive;/.test(EDITOR), 'בלי שינויים — לא טיוטה');
    assert(EDITOR.includes('const v = viewOf(targetOfTemplate(template));') && EDITOR.includes('return v.build(v.defaults);'), 'הבקשה השמורה מאותו מבט כמו המגירה');
  }),

  test('«תצוגה מלאה»: מחוץ לחלון העורך; טיוטה מסומנת «לא נשמר», בקשה שמורה בלי שינוי — כמות שהיא', () => {
    const modalEnd = EDITOR.indexOf('</Modal>');
    const sheet = EDITOR.indexOf('<RequestPreviewSheet');
    assert(modalEnd > 0 && sheet > modalEnd, 'המגירה אחרי סגירת Modal — אח שלו, לא בתוכו');
    assert(EDITOR.includes("badge={full.draft ? 'טיוטה — לא נשמר' : undefined}"), 'תווית רק על טיוטה');
    assert(/if \(template && !dirty\) \{ setFull\(\{ target: targetOfTemplate\(template\), draft: false \}\)/.test(EDITOR), 'שמורה ← יעד הבקשה');
    assert(/kind: 'draft', name: name\.trim\(\) \|\| 'בקשה חדשה', stepType, owner, payload: draftPayload/.test(EDITOR), 'שינויים ← טיוטה');
    assert(!/onEdit=/.test(EDITOR.slice(sheet, sheet + 400)), 'בעורך אין «עריכה» מהמגירה — כבר עורכים');
  }),

  test('הכרטיס החי: PortalView במצב sample, דיבאונס 400ms, כשל = «נסו שוב», ובלי שום פנייה לרשת מלבד הקריאה הקוראת', () => {
    equal(LIVE_DEBOUNCE_MS, 400);
    assert(LIVE.includes('mode="sample"') && LIVE.includes('<PortalView'), 'הדף האמיתי במצב דוגמה');
    assert(LIVE.includes('useSampleData(debounced)'), 'הטעינה דרך useSampleData (loadRequestPreview) על הערך המושהה');
    assert(LIVE.includes('נסו שוב') && LIVE.includes('role="alert"'), 'כשל נאמר ויש דרך להתאושש');
    assert(LIVE.includes('lb-live-loading') && LIVE.includes('aria-busy'), 'בטעינה — שלד');
    assert(LIVE.includes('specProblemText'), 'בקשה בלי פריטים — המשפט של השרת (משימה של המשרד וכד׳)');
    for (const forbidden of ['.rpc(', 'fetch(', 'supabase', '.insert(', '.update(', '.delete(', 'upsert', 'localStorage']) {
      assert(!LIVE.includes(forbidden), `בכרטיס החי אין ${forbidden}`);
    }
  }),

  test('רינדור ראשון של הכרטיס: שלד (לא תיבה ריקה), התווית «דוגמה», והכפתור «תצוגה מלאה»', () => {
    const html = renderToStaticMarkup(createElement(EditorLiveCard, {
      request: { samples: [{ key: 'a', stepType: 'custom_request', payload: { title: 'א' }, owner: 'client' }] },
      onFull: () => {},
    }));
    assert(html.includes('data-testid="lb-live-loading"'), 'שלד בטעינה');
    assert(html.includes('דוגמה — לא לקוח אמיתי'), 'תווית');
    assert(html.includes('תצוגה מלאה'), 'כפתור');
    assert(!html.includes('lb-live-card'), 'עוד אין כרטיס');
  }),
];
