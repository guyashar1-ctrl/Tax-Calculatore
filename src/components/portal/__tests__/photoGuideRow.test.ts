// ─── בדיקות מבנה: מדריך מצולם בדף האישי — הפתיחה לא משלימה, והמדריך נפתח גם במשרד (221) ──
// ‼ מה נעול כאן:
//   · פתיחת המדריך והקישור לאתר הם קריאה וניווט בלבד: בקבצי המדריך ובשורה בדף אין קריאה לשרת
//     (rpc / portal_submit_step / fetch / supabase). הבקשה מושלמת רק בתשובה של הלקוח.
//   · השורה בדף: אחרי ההסבר ולפני השאלה, כפתור המדריך + קישור משני לאתר (target=_blank, noopener),
//     אינרטי בתצוגה המקדימה (והמדריך נפתח שם), ומפתח לא מוכר ⇒ כלום.
//   · בקשה חופשית נפתחת גם בתצוגה במשרד (אחרת אי אפשר לראות את ההסבר והמדריך בתצוגה המקדימה);
//     שאר הסוגים נשארים כבויים שם.
//   · Esc במדריך לא סוגר חלון שמתחתיו (עורך הבקשה בספרייה), וההגדלה והשלבים בלי תמונה בטוחים.
//   · אישור הייצוג ממשיך לעבוד דרך אותו רכיב גנרי: עטיפה דקה עם אותם exports.

import { test, assert, equal } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import PAGE_RAW from '../../PublicPortalPage.tsx?raw';
import PHOTO_RAW from '../PhotoGuide.tsx?raw';
import DIALOG_RAW from '../PhotoGuideDialog.tsx?raw';
import REGISTRY_RAW from '../photoGuides.ts?raw';
import CARRY_RAW from '../TemplateCarryNote.tsx?raw';
import REP_RAW from '../RepApprovalGuide.tsx?raw';
import CSS_RAW from '../portalPage.css?raw';
import REP_CSS_RAW from '../repApprovalGuide.css?raw';
import * as Rep from '../RepApprovalGuide';

const norm = (s: string) => s.replace(/\r\n/g, '\n');
const PAGE = norm(PAGE_RAW);
const PHOTO = norm(PHOTO_RAW);
const REP = norm(REP_RAW);

/** הגוף של פונקציה אחת בדף (עד הפונקציה הבאה ברמה העליונה). */
function body(name: string): string {
  const start = PAGE.indexOf(`function ${name}(`);
  assert(start >= 0, `לא נמצאה ${name}`);
  const next = PAGE.slice(start + 10).search(/\n(\/\*\*|export )?(default )?function /);
  return next < 0 ? PAGE.slice(start) : PAGE.slice(start, start + 10 + next);
}

const SERVER_CALL = /supabase|\.rpc\(|portal_submit_step|fetch\(|XMLHttpRequest|sendBeacon/;

export const TESTS: TestCase[] = [
  test('פתיחת המדריך והקישור לאתר לא קוראים לשרת — לא בקבצי המדריך ולא בשורה בדף', () => {
    for (const [name, src] of [['PhotoGuide', PHOTO], ['PhotoGuideDialog', norm(DIALOG_RAW)], ['photoGuides', norm(REGISTRY_RAW)], ['TemplateCarryNote', norm(CARRY_RAW)]] as const) {
      assert(!SERVER_CALL.test(src), `${name}: קריאה לשרת`);
    }
    const row = body('PhotoGuideRow');
    assert(!SERVER_CALL.test(row), 'PhotoGuideRow: קריאה לשרת');
    assert(!/onDone|reload|flushAccountantNotifications/.test(row), 'PhotoGuideRow: לא מעדכן את הדף ולא מדווח');
  }),

  test('השורה בדף: מפתח מהשרת, כפתור מדריך, קישור משני לאתר (target=_blank, noopener), אינרטי במשרד', () => {
    const row = body('PhotoGuideRow');
    assert(/photoGuideFor\(item\.photoGuide\)/.test(row), 'המפתח מהשרת נפתר ברישום');
    assert(/if \(!guide\) return null;/.test(row), 'מפתח לא מוכר ⇒ כלום');
    assert(/<PhotoGuideButton steps=\{guide\.steps\.length\}/.test(row), 'כפתור «מדריך מצולם · N צעדים»');
    assert(/href=\{guide\.entry\.url\} target="_blank" rel="noopener noreferrer"/.test(row), 'קישור לאתר בלשונית חדשה');
    assert(/\{guide\.siteLabel\} ↗/.test(row), 'התווית «לאזור האישי בביטוח לאומי ↗»');
    assert(/previewMode\s*\?\s*<span className="pp-site-link is-inert"/.test(row), 'בתצוגה המקדימה — span אינרטי');
    assert(/<LinkHostNote url=\{guide\.entry\.url\} extra="נדרשות כניסה והזדהות"/.test(row), 'לאן הקישור מוביל');
    assert(/entryInert=\{previewMode\}/.test(row), 'המדריך נפתח גם בתצוגה המקדימה, והקישורים שבתוכו אינרטיים');
    assert(!/clientLinkUrl|linkUrl/.test(row), '‼ לא clientLinkUrl — שם הבקשה הופכת לחומר עזר שנסגר בפתיחה');
    assert(!/background: accent/.test(row), 'הקישור הוא כפתור משני (מסגרת), לא מילוי — המילוי הוא «שליחה»');
  }),

  test('בכרטיס הפתוח: ההסבר, אחריו המדריך, ואחריו השאלה', () => {
    const open = body('ActionItem');
    const a = open.indexOf('<RequestGuide ');
    const b = open.indexOf('<PhotoGuideRow ');
    const c = open.indexOf('<CustomRequestBlock ');
    assert(a > 0 && b > a && c > b, `סדר: RequestGuide=${a}, PhotoGuideRow=${b}, CustomRequestBlock=${c}`);
    assert(/open && inPage && item\.kind === 'custom' && item\.actionValue/.test(open), 'רק בבקשה חופשית פתוחה');
    equal(/photoGuide/.test(body('DeclareBlock')), false, 'אישור הייצוג (declare) לא נגע');
  }),

  test('בקשה חופשית נפתחת גם בתצוגה במשרד; מסמכים ורו״ח קודם — כבויים שם', () => {
    const open = body('ActionItem');
    assert(/expandable && \(previewMode && item\.kind !== 'custom'/.test(open), 'רק kind=custom עוקף את הכיבוי');
    assert(/aria-expanded=\{open\}/.test(open), 'מצב הפתיחה מוכרז');
    // הפקדים שבתוך הבקשה כבויים בתצוגה (previewMode) — כך פתיחה בקריאה בלבד.
    const custom = body('CustomRequestBlock');
    assert(/disabled=\{busyKey === r\.key \|\| previewMode\}/.test(custom) && /disabled=\{previewMode \|\| busyKey === r\.key/.test(custom), 'השאלה והשליחה כבויות בתצוגה');
  }),

  test('PortalItem נושא photoGuide כמפתח בלבד', () => {
    assert(/photoGuide\?: string;/.test(PAGE), 'השדה בטיפוס');
  }),

  test('הרכיב הגנרי: Esc לא נבלע על ידי חלון שמתחת, ובצעד בלי תמונה אין הגדלה ואין הסתייגות על צילום', () => {
    assert(/window\.addEventListener\('keydown', h, true\)/.test(PHOTO) && /window\.removeEventListener\('keydown', h, true\)/.test(PHOTO), 'מאזין בשלב הלכידה');
    assert(/e\.key === 'Escape'[\s\S]{0,400}e\.stopPropagation\(\)/.test(PHOTO), 'Esc עוצר את ההתפשטות');
    assert(/const figure = img && \(\s*<>\s*<figure/.test(PHOTO), 'figure רק לצעד עם צילום');
    assert(/<\/figure>\s*<p className="rag-fine">\{fine\}<\/p>\s*<\/>\s*\);/.test(PHOTO), 'ההסתייגות על הצילומים רק בצעד עם צילום — באותו גוש עם ה-figure');
    // צעד עם צילום ועם נוסח להעתקה: הצילום קודם (איפה לוחצים), ואחריו הנוסח וההוראות. אחרת — הסדר כמו תמיד.
    assert(/const figureFirst = !!\(img && step\.copy\);/.test(PHOTO), 'figureFirst רק כשיש גם צילום וגם נוסח');
    assert(/\{figureFirst && figure\}\s*\{step\.copy && <CopyBox[^>]*\/>\}\s*\{step\.extra && [\s\S]{0,160}\{!figureFirst && figure\}/.test(PHOTO), 'הסדר: צילום ← נוסח ← שורת משנה; בלי נוסח: שורת משנה ← צילום');
    assert(/\{zoom && img && \(/.test(PHOTO), 'ההגדלה רק עם צילום');
    assert(/if \(i \+ 1 < n && steps\[i \+ 1\]\.image\)/.test(PHOTO), 'טעינה מראש רק לצעד עם צילום');
    assert(/step\.link && \(/.test(PHOTO) && /entryInert/.test(PHOTO), 'קישור בצעד, אינרטי בתצוגה במשרד');
    // ‼ StrictMode קורא לפונקציית העדכון פעמיים — אסור לשנות ref בתוכה.
    assert(/setI\(v => Math\.min\(n - 1, v \+ 1\)\)/.test(PHOTO) && /setI\(v => Math\.max\(0, v - 1\)\)/.test(PHOTO), 'עדכוני הצעד טהורים');
  }),

  test('נוסח להעתקה: תיבה עם הטקסט וכפתור «העתקת הנוסח» — בדפדפן בלבד, עם דרך חלופית, והטקסט ניתן לסימון', () => {
    assert(/function CopyBox\(/.test(PHOTO), 'CopyBox קיים');
    assert(/\{step\.copy && <CopyBox key=\{i\} label=\{step\.copy\.label\} text=\{step\.copy\.text\} \/>\}/.test(PHOTO), 'מוצג רק בצעד שיש לו copy, ומתאפס בין צעדים');
    assert(/navigator\.clipboard\.writeText\(text\)/.test(PHOTO), 'Clipboard API');
    assert(/document\.execCommand\('copy'\)/.test(PHOTO), 'דרך חלופית (textarea + execCommand)');
    assert(/range\.selectNodeContents\(textRef\.current\)/.test(PHOTO), 'אם גם זה נכשל — מסמנים את הנוסח להעתקה ידנית');
    assert(/העתקת הנוסח/.test(PHOTO) && /הועתק ✓/.test(PHOTO), 'הכפתור והאישור');
    assert(/window\.clearTimeout\(timer\.current\)/.test(PHOTO) && /useEffect\(\(\) => \(\) => window\.clearTimeout\(timer\.current\), \[\]\)/.test(PHOTO), 'הטיימר מנוקה');
    const css = norm(REP_CSS_RAW);
    assert(/\.rag-copy-text \{[^}]*user-select: text/.test(css), 'הנוסח ניתן לסימון');
    assert(/\.rag-copy-btn:active \{ transform: scale\(\.97\); \}/.test(css), 'משוב לחיצה');
    assert(/@media \(pointer: coarse\) \{ \.rag-copy-btn \{ min-height: 44px; \} \}/.test(css), 'מטרה של 44px במגע');
  }),

  test('אישור הייצוג — עטיפה דקה על הרכיב הגנרי, עם אותם exports ואותם צעדים', () => {
    assert(/import PhotoGuide, \{ PhotoGuideButton, type PhotoGuideStep \} from '\.\/PhotoGuide'/.test(REP), 'משתמש ברכיב הגנרי');
    assert(!/createPortal|useEffect|useState/.test(REP), 'אין עוד לוגיקת חלון בקובץ');
    equal(typeof Rep.default, 'function');
    equal(typeof Rep.RepApprovalGuideButton, 'function');
    equal(Rep.REP_APPROVAL_GUIDE_LENGTH, 7);
    equal(Rep.REP_APPROVAL_GUIDE_STEPS.length, 7);
    for (const n of ['repApprovalGuideSteps', 'repApprovalCard', 'repApprovalSummary', 'repApprovalNoteMore', 'repApprovalPeople', 'hebrewList', 'REP_APPROVAL_GUIDE_GENERIC_NOTE'] as const) {
      assert(n in Rep, `export חסר: ${n}`);
    }
    // כל שבעת הצעדים של אישור הייצוג נושאים צילום — והמספור שלהם step-1..7 כמו קודם.
    assert(Rep.REP_APPROVAL_GUIDE_STEPS.every(s => s.w > 0 && s.h > 0 && s.alt.length > 10), 'כל הצעדים עם צילום');
    assert(/guides\/rep-approval\/step-\$\{i \+ 1\}\.webp/.test(REP), 'הנתיב של צילומי אישור הייצוג לא השתנה');
  }),

  test('CSS: שורת המדריך נשברת לשורות בטלפון, וכפתור הקישור עם משוב לחיצה ומטרה נוחה', () => {
    const css = norm(CSS_RAW);
    assert(/\.pp-photo-row \{[^}]*flex-wrap: wrap/.test(css), 'flex-wrap');
    assert(/\.pp-site-link:active:not\(\.is-inert\) \{ transform: scale\(\.97\); \}/.test(css), 'משוב לחיצה');
    assert(/@media \(hover: hover\) and \(pointer: fine\) \{ \.pp-site-link:hover/.test(css), 'hover רק בעכבר');
    assert(/@media \(pointer: coarse\) \{[^}]*min-height: 44px/.test(css), 'מטרה של 44px במגע');
    assert(/@media \(prefers-reduced-motion: reduce\)[^}]*\.pp-site-link/.test(css), 'תנועה מופחתת');
    assert(!/transition: all/.test(css), 'לא transition: all');
  }),
];
