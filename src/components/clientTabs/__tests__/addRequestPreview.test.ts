// ─── בדיקות: «צפייה» ב«＋ בקשה חדשה» ובקומפוזר ─────────────────────────────────────
// ‼ מה נעול כאן:
//   · מה שהקומפוזר יוצר (composerPayload) הוא הפונקציה הטהורה שהרכיב עצמו שולח, ו«צפייה» בנוסח מהספרייה מראה את
//     הפלט שלה — לא את ה-payload הגולמי של הנוסח: קובץ/קישור/הודעת-מלל שצורפו לנוסח אינם עוברים לבקשה, ולכן אינם בצפייה.
//   · החלון: כל פריט בקטלוג יושב בשורה עם «צפייה», ו«הוספה» שבמגירה קוראת לאותה פונקציה בדיוק כמו לחיצה על השורה
//     (startCatalogItem) — בלי נתיב יצירה שני. פריט שצריך קלט לפני היצירה מקבל «המשך להוספה…», והוא בדיוק מי שהפונקציה
//     מחזירה למסך קלט (ולא יוצרת).
//   · המגירה אחות של החלון (לא בתוכו) ועוצרת את הבועה — לחיצה בתוכה לא סוגרת את החלון.

import { test, equal, deepEqual, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { TemplateEntry } from '../../../lib/requestTemplates';
import {
  buildComposerPayload, composerFieldsFromContent, composerPayload, composerPreviewOfTemplate, composerProblem,
  type ComposerPayloadInput,
} from '../InlineComposer';
import { CATALOG_TYPES } from '../../../features/requestPreview/targets';
import DIALOG_RAW from '../AddRequestDialog.tsx?raw';
import COMPOSER_RAW from '../InlineComposer.tsx?raw';

const norm = (s: string) => s.replace(/\r\n/g, '\n');

/** קלט לבנייה: ברירות מחדל של בקשה חדשה ללקוח, עם דריסה. */
function input(over: Partial<ComposerPayloadInput> = {}, content: Record<string, unknown> | null = null): ComposerPayloadInput {
  return {
    ...composerFieldsFromContent(content, over.owner ?? 'client'),
    owner: 'client', edit: false, initialContent: undefined, subjectRole: undefined, subjectWho: 'בן/בת הזוג',
    ...over,
  };
}
const row = (label: string, over: Partial<ComposerPayloadInput['rows'][number]> = {}) =>
  ({ key: `k-${label}`, kind: 'file' as const, label, required: true, optionsText: '', maxFiles: '', ...over });

const REFS = [{ label: 'קוד מוסד', value: '123' }];

export const TESTS: TestCase[] = [
  test('composerPayload: בקשה ללקוח — שם, ניסוח, דרישות (חובה/רשות/בחירה/קבצים), בלי סימון פנימי', () => {
    const p = composerPayload(input({
      name: '  אישור בנק  ', clientSub: ' הסבר ', clientCta: ' להעלאה ',
      rows: [
        row('אישור ניהול חשבון'),
        row('הערה', { kind: 'text', required: false }),
        row('סוג עוסק', { kind: 'select', optionsText: 'עוסק מורשה, ,עוסק פטור' }),
        row('קבצים', { kind: 'files', maxFiles: '3' }),
        row('   '),
      ],
    }));
    deepEqual(p, {
      title: 'אישור בנק', clientTitle: 'אישור בנק', clientSub: 'הסבר', clientCta: 'להעלאה',
      requirements: [
        { key: 'k-אישור ניהול חשבון', kind: 'file', label: 'אישור ניהול חשבון', done: false },
        { key: 'k-הערה', kind: 'text', label: 'הערה', done: false, required: false },
        { key: 'k-סוג עוסק', kind: 'select', label: 'סוג עוסק', done: false, options: ['עוסק מורשה', 'עוסק פטור'] },
        { key: 'k-קבצים', kind: 'files', label: 'קבצים', done: false, maxFiles: 3 },
      ],
      autoAction: null,
    });
  }),

  test('composerPayload: ההסבר והמדריך מהנוסח עוברים ביצירה בבקשה ללקוח בלבד — וקובץ/קישור/הודעת-מלל לא', () => {
    const content = {
      title: 'נוסח', clientNote: 'הסבר', clientNoteAfter: 'אחרי', clientRefs: REFS, clientPhotoGuide: 'reserve_duty_claim',
      clientLinkUrl: 'https://x.example', clientResource: { url: 'https://f.example/a.pdf' }, clientResources: [{ key: 'a1' }], messageOnly: true,
    };
    const created = composerPayload(input({ name: 'נוסח', rows: [row('פריט')], initialContent: content }));
    deepEqual(Object.keys(created).sort(), ['autoAction', 'clientCta', 'clientNote', 'clientNoteAfter', 'clientPhotoGuide', 'clientRefs', 'clientSub', 'clientTitle', 'requirements', 'title']);
    equal(created.clientNote, 'הסבר');
    equal(created.clientLinkUrl, undefined);
    equal(created.clientResources, undefined);
    equal(created.messageOnly, undefined);
    // עריכה: המיזוג בשרת שומר את המפתחות — לא שולחים אותם שוב.
    const edited = composerPayload(input({ name: 'נוסח', rows: [row('פריט')], initialContent: content, edit: true }));
    equal(edited.clientNote, undefined);
    // משימה פנימית וגורם חיצוני לא נושאים הסבר ללקוח.
    equal(composerPayload(input({ owner: 'me', name: 'נוסח', initialContent: content })).clientNote, undefined);
    equal(composerPayload(input({ owner: 'external', name: 'נוסח', initialContent: content })).clientNote, undefined);
  }),

  test('composerPayload: «אני» — סימון פנימי ביצירה בלבד, בלי דרישות; גורם חיצוני — צד, נוסח מייל ו-null מפורש', () => {
    const me = composerPayload(input({ owner: 'me', name: 'לבדוק', rows: [row('פריט')] }));
    equal(me.internalTask, true);
    equal(me.requirements, undefined);
    equal(composerPayload(input({ owner: 'me', name: 'לבדוק', edit: true })).internalTask, undefined);
    const ext = composerPayload(input({
      owner: 'external', name: 'בקשה לרו״ח', extKind: 'other',
      extContact: { name: ' דנה ', email: 'd@x.example', phone: '' }, emailSubject: ' נושא ', emailBody: '', internalNote: '', auto: true,
    }));
    deepEqual(ext.externalParty, { kind: 'other', contact: { name: 'דנה', email: 'd@x.example', phone: undefined } });
    equal(ext.emailSubject, 'נושא');
    equal(ext.emailBody, null);
    deepEqual(ext.autoAction, { kind: 'email' });
    // «אוטומטי» רק לגורם חיצוני.
    deepEqual(composerPayload(input({ name: 'x', rows: [row('פריט')], auto: true })).autoAction, null);
  }),

  test('composerProblem / buildComposerPayload: אותו סדר בדיקות כמו ב-buildPayload — שם, פריט, בחירה, אישור של בן/בת הזוג', () => {
    equal(composerProblem(input({ name: '  ' })), 'צריך שם לבקשה - הוא גם מה שהלקוח יראה.');
    equal(composerProblem(input({ name: 'x', rows: [row('  ')] })), 'בקשת לקוח צריכה לפחות פריט אחד.');
    assert((composerProblem(input({ name: 'x', rows: [row('בחירה', { kind: 'select', optionsText: 'אחת' })] })) ?? '').includes('שתי אפשרויות'), 'בחירה עם אפשרות אחת');
    assert((composerProblem(input({ name: 'x', rows: [row('אישור', { kind: 'confirm' })], subjectRole: 'spouse', subjectWho: 'רונית' })) ?? '').includes('רונית'), 'אישור אישי של בן/בת הזוג');
    equal(composerProblem(input({ owner: 'me', name: 'x' })), null, 'משימה פנימית — אין דרישת פריט');
    equal(composerProblem(input({ name: 'x', rows: [row('פריט')] })), null);
    deepEqual(buildComposerPayload(input({ name: '' })), { error: 'צריך שם לבקשה - הוא גם מה שהלקוח יראה.' });
    equal((buildComposerPayload(input({ name: 'x', rows: [row('פריט')] })) as Record<string, unknown>).title, 'x');
  }),

  test('composerFieldsFromContent: השם לפי מי שרואה (clientTitle) — ובמשימה פנימית השם הפנימי; פריטים, גורם חיצוני, ריק', () => {
    const c = { title: 'פנימי', clientTitle: 'כפי שהלקוח רואה', requirements: [{ key: 'a', kind: 'text', label: 'ש', required: false, options: ['x', 'y'], maxFiles: 2 }] };
    equal(composerFieldsFromContent(c, 'client').name, 'כפי שהלקוח רואה');
    equal(composerFieldsFromContent(c, 'me').name, 'פנימי');
    equal(composerFieldsFromContent({ clientTitle: 'רק ללקוח' }, 'me').name, 'רק ללקוח');
    deepEqual(composerFieldsFromContent(c, 'client').rows, [{ key: 'a', kind: 'text', label: 'ש', required: false, optionsText: 'x, y', maxFiles: '2' }]);
    const ext = composerFieldsFromContent({ externalParty: { kind: 'other', contact: { name: 'ג', email: 'g@x.example' } }, emailSubject: 'נ', autoAction: { kind: 'email' } }, 'external');
    equal(ext.extKind, 'other');
    deepEqual(ext.extContact, { name: 'ג', email: 'g@x.example', phone: '' });
    equal(ext.emailSubject, 'נ');
    equal(ext.auto, true);
    const empty = composerFieldsFromContent(null, 'client');
    equal(empty.name, '');
    equal(empty.rows.length, 1);
    equal(empty.rows[0].label, '');
    equal(empty.extKind, 'prev_accountant');
    equal(empty.auto, false);
  }),

  test('composerPreviewOfTemplate: מה שייווצר מנוסח בספרייה ללא שינוי — לא ה-payload הגולמי', () => {
    const entry: TemplateEntry = {
      stepType: 'custom_request', owner: 'client',
      payload: {
        title: 'תביעת מילואים', clientSub: 'הסבר קצר', clientPhotoGuide: 'reserve_duty_claim', clientNote: 'הסבר',
        clientLinkUrl: 'https://www.btl.gov.il', clientResources: [{ key: 'a1', label: 'מדריך' }],
        requirements: [{ key: 'r1', kind: 'file', label: 'אישור מילואים', done: false }],
      },
    };
    const { owner, payload } = composerPreviewOfTemplate(entry);
    equal(owner, 'client');
    equal(payload.title, 'תביעת מילואים');
    equal(payload.clientTitle, 'תביעת מילואים');
    equal(payload.clientPhotoGuide, 'reserve_duty_claim', 'המדריך עובר (templateCarryOver)');
    equal(payload.clientNote, 'הסבר');
    equal(payload.clientLinkUrl, undefined, 'הקישור לא עובר בקומפוזר — ולכן לא בצפייה');
    equal(payload.clientResources, undefined, 'הקובץ לא עובר בקומפוזר — ולכן לא בצפייה');
    deepEqual(payload.requirements, [{ key: 'r1', kind: 'file', label: 'אישור מילואים', done: false }]);
    // אותה תוצאה בדיוק כמו שהקומפוזר עצמו בונה כשהוא נפתח עם התוכן הזה.
    const direct = composerPayload({
      ...composerFieldsFromContent(entry.payload, 'client'),
      owner: 'client', edit: false, initialContent: entry.payload, subjectRole: undefined, subjectWho: 'בן/בת הזוג',
    });
    deepEqual(payload, direct);
  }),

  test('composerPreviewOfTemplate: הבעלים כמו ב-OnboardingTab — הודעת מלל של המשרד ⇒ משימה פנימית; גורם חיצוני נשמר', () => {
    const msg = composerPreviewOfTemplate({ stepType: 'custom_request', owner: 'me', payload: { title: 'הודעה', messageOnly: true, clientNote: 'טקסט' } });
    equal(msg.owner, 'me');
    equal(msg.payload.internalTask, true);
    equal(msg.payload.clientNote, undefined);
    const ext = composerPreviewOfTemplate({ stepType: 'custom_request', owner: 'external', payload: { title: 'לרו״ח', externalParty: { kind: 'prev_accountant' } } });
    equal(ext.owner, 'external');
    deepEqual(ext.payload.externalParty, { kind: 'prev_accountant' });
    // נוסח בלי כלום — לא נופל; בלי דרישות (הקומפוזר היה פותח שורה ריקה וחוסם שמירה).
    const bare = composerPreviewOfTemplate(undefined);
    equal(bare.owner, 'client');
    equal(bare.payload.requirements, undefined);
  }),

  test('הקומפוזר: buildPayload הוא קריאה לפונקציה הטהורה, ו«צפייה» רק בבקשה ללקוח עם שם', () => {
    const src = norm(COMPOSER_RAW);
    assert(/function buildPayload\(\): [^\n]*\{\s*return buildComposerPayload\(composerInput\(\)\);\s*\}/.test(src), 'buildPayload מעביר לבנייה המשותפת');
    assert(/const \[init\] = useState\(\(\) => composerFieldsFromContent\(editContent, startOwner\)\);/.test(src), 'מצב הפתיחה מהפונקציה המשותפת');
    assert(/owner === 'client' && name\.trim\(\) && \(\s*<PreviewButton/.test(src), 'כפתור «צפייה» רק בבקשה ללקוח ועם שם');
    assert(/badge="טיוטה — לא נשמר"/.test(src), 'תג הטיוטה');
    assert(/payload: edit \? \{ \.\.\.\(editContent \?\? \{\}\), \.\.\.built \} : built/.test(src), 'בעריכה — המיזוג שהשרת עושה');
  }),

  test('החלון: כל פריט קטלוג בשורה עם «צפייה»; «הוספה» במגירה = אותה פונקציה כמו השורה (startCatalogItem), ובלי כפתור בתוך כפתור', () => {
    const src = norm(DIALOG_RAW);
    // מקור אחד לפעולה: השורה והמגירה.
    assert(/onClick=\{\(\) => startCatalogItem\(c\.type\)\}/.test(src), 'השורה קוראת ל-startCatalogItem');
    assert(/onClick: \(\) => \{ setPreview\(null\); startCatalogItem\(type\); \}/.test(src), 'המגירה סוגרת וקוראת לאותה פונקציה');
    assert(!/onClick=\{\(\) => \{\s*if \(c\.type === /.test(src), 'אין עוד טיפול ישן בתוך השורה');
    // כל שורה: עטיפה, כפתור פעולה, ו«צפייה» אחיו — לא בתוכו.
    assert(/<div key=\{c\.type\} style=\{rowWrap\}>\s*<button type="button" disabled=\{busy\} onClick=\{\(\) => startCatalogItem\(c\.type\)\} style=\{rowMain\}>/.test(src), 'שורת קטלוג');
    assert(/\(CATALOG_TYPES as readonly string\[\]\)\.includes\(c\.type\) && \(\s*<PreviewButton name=\{catalogTitle\(c\.type\)\} onClick=\{\(\) => openCatalogPreview\(c\.type\)\} \/>/.test(src), '«צפייה» לכל סוג קטלוג');
    assert(/<PreviewButton name=\{t\.name\} onClick=\{\(\) => openLibraryPreview\(t\)\} \/>/.test(src), '«צפייה» לכל בקשה מהספרייה');
    // הצפייה בספרייה: הפלט של הקומפוזר.
    assert(/const \{ owner, payload \} = composerPreviewOfTemplate\(firstEntry\(t\)\);/.test(src), 'ספרייה — מה שהקומפוזר יוצר');
    assert(/kind: 'draft', name: t\.name, stepType: 'custom_request', owner, payload/.test(src), 'יעד טיוטה');
    // הבקשה החופשית: הטיוטה היא מה שהטופס שולח.
    assert(/void create\('custom_request', customPayload\(\)\);/.test(src), 'הטופס שולח את customPayload');
    assert(/payload: customPayload\(\)/.test(src), 'וה«צפייה» מציגה אותו');
  }),

  test('החלון: «המשך להוספה» בדיוק לפריטים שהפונקציה מחזירה למסך קלט — ושאר הפריטים יוצרים ישירות', () => {
    const src = norm(DIALOG_RAW);
    const body = src.slice(src.indexOf('function startCatalogItem(type: string) {'));
    const fn = body.slice(0, body.indexOf('\n  }\n') + 5);
    const needsInput: string[] = [];
    for (const m of fn.matchAll(/if \(type === '(\w+)'\) \{ ([^}]*?); return; \}/g)) {
      if (/^(setMode|open\w*Mode)\(/.test(m[2])) needsInput.push(m[1]);
    }
    const declared = /const CATALOG_NEEDS_INPUT = new Set\(\[([^\]]*)\]\)/.exec(src)?.[1].match(/'(\w+)'/g)?.map(s => s.replace(/'/g, '')) ?? [];
    deepEqual([...needsInput].sort(), [...declared].sort());
    assert(needsInput.length === 4, 'ארבעה פריטים שצריכים קלט');
    // ויצירה ישירה לכל השאר — כולל ברירת המחדל מהתבנית.
    assert(/void create\(type, seedPayload\(type\)\);/.test(fn), 'ברירת מחדל: create מהתבנית');
    // הכפתור: «המשך…» רק כשצריך קלט.
    assert(/CATALOG_NEEDS_INPUT\.has\(type\) \? `המשך להוספה \$\{addTo\}` : `הוספה \$\{addTo\}`/.test(src), 'תווית לפי קלט');
    for (const t of CATALOG_TYPES) assert(src.includes(`type: '${t}'`), `פריט קטלוג ${t} קיים בחלון`);
  }),

  test('החלון: המגירה אחות של החלון ועוצרת את הבועה; הפרופיל נטען עם הטעינה; «הוספה» חסומה כשהפריט כבר אינו זמין', () => {
    const src = norm(DIALOG_RAW);
    assert(/<\/div>\s*\n\s*\{\/\*[^]*?\*\/\}\s*\{preview && \(\s*<div style=\{\{ display: 'contents' \}\} onClick=\{e => e\.stopPropagation\(\)\}>\s*<RequestPreviewSheet target=\{preview\.target\} profile=\{firm\} badge=\{preview\.badge\}\s*primary=\{previewPrimaryNow\} onClose=\{\(\) => setPreview\(null\)\} \/>/.test(src), 'המגירה אחרי החלון');
    assert(/supabase\.from\('profiles'\)\.select\('\*'\)\.limit\(1\)\.maybeSingle\(\)/.test(src), 'הפרופיל המלא');
    assert(/disabled: busy \|\| !available\.some\(c => c\.type === type\)/.test(src), 'בלי כפילות אם כבר אינו זמין');
    assert(!/selection=|onEdit=/.test(src.slice(src.indexOf('<RequestPreviewSheet'))), 'אין עריכה מתוך הצפייה בכרטיס לקוח');
  }),
];
