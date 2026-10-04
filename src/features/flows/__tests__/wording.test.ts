// ─── בדיקות: ניסוח שהמשרד רואה במסלולים ובאוטומציות ──────────────────────────
// ‼ מה נעול כאן:
//   · «ריצה»/«ריצות» הוא מונח פנימי — בטקסט שהמשתמש רואה אומרים «הפעלה» / «המסלול
//     אצל הלקוח». הסריקה עוברת על כל מחרוזת וטקסט JSX בקוד (לא על הערות) — כך
//     גם טקסט חדש שייכתב כאן ייתפס.
//   · «רק בדף» (הגדרת שלב: אף פעם לא מייל) אינו אותו ניסוח כמו הסימן בשורת הבקשה
//     «בדף, בלי מייל» (עוד לא יצא מייל) — שתי משמעויות הפוכות.
//   · המייל האוטומטי: בלי מספר דקות (המועד הוא «לא לפני»); כנשלח נרשם רק מה שנפתח
//     לבד, ושאר מה שבדף רק מוזכר — כמו המייל עצמו (send-process-open-email).
//   · מה שבשלב שעוד לא נפתח כבר בדף תחת «בהמשך» — לא «מופיע כשהשלב נפתח».

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import type * as TS from 'typescript';
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { AUTO_MAIL_RECORDED, DELIVERIES, DELIVERY_LABELS, TRIGGER_LABELS } from '../types';
import { rowStateFor } from '../../../utils/requestPresentation';

const ROOT = process.cwd();
// ‼ נטען בזמן הריצה מהפרויקט (לא מאוגד לתוך הבדיקות) — אותו מהדר שבודק את הקוד.
const ts = createRequire(join(ROOT, 'package.json'))('typescript') as typeof TS;

/** איפה טקסט המסלולים והאוטומציות חי. */
const TARGETS = [
  'src/components/flows',
  'src/features/flows',
  'src/features/automation',
  'src/components/clientTabs/AuthorityCheckPanel.tsx',
];

/** «ריצה», «הריצה», «שהריצה», «לריצה», «ריצות»… — אבל לא «מריצים» ולא «להריץ». */
const RUN_WORD = /(^|[^א-ת])[הבלמשו]{0,2}ריצ(ה|ות)([^א-ת]|$)/;

function sourceFiles(path: string): string[] {
  const abs = join(ROOT, path);
  if (!statSync(abs).isDirectory()) return [abs];
  const out: string[] = [];
  for (const name of readdirSync(abs)) {
    if (name === '__tests__') continue;
    const p = join(abs, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(relative(ROOT, p)));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** כל מחרוזת, קטע של תבנית וטקסט JSX — הערות אינן צמתים, ולכן לא נכללות. */
function visibleTexts(fileName: string, source: string): { text: string; line: number }[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: { text: string; line: number }[] = [];
  const visit = (n: TS.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n)
      || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) || ts.isJsxText(n)) {
      out.push({ text: n.text, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

export const TESTS: TestCase[] = [
  test('הסורק: מחרוזת, תבנית וטקסט JSX נתפסים; הערה — לא', () => {
    const src = [
      '// הריצה בהערה',
      'const a = "בכל ריצה";',
      'const b = `שנה — ${x} ריצות`;',
      'const c = <p>אחרי שהריצה הקודמת</p>;',
      'const d = <p title="לריצה">{/* ריצה בהערת JSX */}מריצים בלחיצה</p>;',
    ].join('\n');
    const hits = visibleTexts('probe.tsx', src).filter(t => RUN_WORD.test(t.text)).map(t => t.line);
    equal(hits.join(','), '2,3,4,5', 'שורה 1 היא הערה; «מריצים» אינו «ריצה»');
  }),

  test('בלי «ריצה» בטקסט שהמשרד רואה — מסלולים, אוטומציות ובדיקת הרשויות', () => {
    const files = TARGETS.flatMap(sourceFiles);
    assert(files.length > 10, `נמצאו רק ${files.length} קבצים — הנתיבים זזו?`);
    const bad: string[] = [];
    for (const f of files) {
      for (const t of visibleTexts(f, readFileSync(f, 'utf8'))) {
        if (RUN_WORD.test(t.text)) bad.push(`${relative(ROOT, f).replace(/\\/g, '/')}:${t.line} «${t.text.trim().slice(0, 70)}»`);
      }
    }
    assert(bad.length === 0, `«ריצה» בטקסט גלוי — כותבים «הפעלה» / «המסלול אצל הלקוח»:\n        ${bad.join('\n        ')}`);
  }),

  test('«רק בדף» בבונה ≠ «בדף, בלי מייל» בשורת הבקשה', () => {
    const pill = rowStateFor({ kind: 'waiting', tone: 'gray', waitingOn: 'client', status: 'waiting_client', unsent: true }).text;
    assert(DELIVERY_LABELS.page.short !== pill, `אותו ניסוח לשתי משמעויות: «${pill}»`);
    for (const d of DELIVERIES) assert(DELIVERY_LABELS[d].short !== pill, `${d}: «${pill}» שמור לשורת הבקשה`);
    equal(DELIVERY_LABELS.page.short, 'רק בדף');
    assert(/בלי מייל/.test(DELIVERY_LABELS.page.long) && /בלי תזכורות/.test(DELIVERY_LABELS.page.long), 'הארוך אומר גם בלי תזכורות');
  }),

  test('המייל האוטומטי: בלי «2 דקות», ומה שנרשם בו כנשלח — רק מה שנפתח לבד', () => {
    for (const d of DELIVERIES) {
      for (const [k, v] of Object.entries(DELIVERY_LABELS[d])) {
        assert(!/2\s*דקות|שתי דקות|כ[־-]2/.test(v), `${d}.${k}: «${v}»`);
      }
    }
    const mail = DELIVERY_LABELS.auto.mail;
    equal(mail, 'מייל אחד מרוכז יוצא לבד תוך כמה דקות מהפתיחה');
    assert(/תוך כמה דקות/.test(mail), 'מועד בלי מספר');
    // ‼ מה נרשם כנשלח — פירוט, בפתיחת השורה באוטומציות (AUTO_MAIL_RECORDED), לא בבחירה בבונה.
    assert(!/נרשם/.test(mail), 'בבחירה — רק מתי יוצא המייל');
    assert(/רק מה שנפתח לבד/.test(AUTO_MAIL_RECORDED), 'כנשלח — רק מה שנפתח לבד');
    assert(AUTO_MAIL_RECORDED.includes('«ועוד דברים שממתינים לכם בדף»'), 'שאר מה שבדף — רק מוזכר, בשם הבלוק שבמייל');
    assert(!/לא נכלל/.test(AUTO_MAIL_RECORDED), '«מה שמחכה לאישורך לא נכלל» לא היה נכון — הוא מוזכר בבלוק');
  }),

  test('מה שבשלב שעוד לא נפתח — כבר בדף תחת «בהמשך»', () => {
    for (const d of ['approve', 'auto', 'page'] as const) {
      const p = DELIVERY_LABELS[d].page;
      assert(p.includes('«בהמשך»'), `${d}: «${p}»`);
      assert(!/מיד כשהשלב נפתח/.test(p), `${d}: לא «מופיע מיד כשהשלב נפתח»`);
    }
    assert(/לא מופיע בדף/.test(DELIVERY_LABELS.hold.page), '«מחכה לאישורך» — לא בדף עד הפרסום');
  }),

  test('טריגר שנתי: «הפעלה», לא «ריצה»', () => {
    assert(!RUN_WORD.test(TRIGGER_LABELS.annual.hint), TRIGGER_LABELS.annual.hint);
    assert(/הפעלה נפרדת/.test(TRIGGER_LABELS.annual.hint), TRIGGER_LABELS.annual.hint);
  }),
];
