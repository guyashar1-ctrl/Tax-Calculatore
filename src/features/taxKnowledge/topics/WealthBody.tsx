// ─── הצהרת הון והשוואת הון ───────────────────────────────────────────────────
// ‼ 11.10.2026: חומרי הקורס של גיא נבדקו מול טופס 1219 ודברי ההסבר, הודעות הרשות,
// טבלאות המחיה ומבקר המדינה (docs/tax-foundation/wealth/). 92 טענות: 41 מאומתות,
// 26 פרשנות, 19 פתוחות, 6 שגויות — השגויות לא נכנסו, הפתוחות מסומנות.
// «ללמוד» — מושגים, רישום והשוואה; «בתיק» — התהליך הידני, השאלון ותבניות טיוטה.
// ‼ 230: בקשת «הצהרת הון» קיימת בתיק המס — איסוף, בדיקה ובסיס הרישום. מילוי 1219, השוואה
// והגשה — ביד. כללי רישום הם מקצועיים (עם סטטוס); רק העדפות אמיתיות מוצגות כהחלטת משרד.

import { useMemo, useState } from 'react';
import { wealthDeadline } from '../../taxRules/calc';
import { RV, Problems, fmtNis } from '../RuleBits';
import { Sec, Quiz, type TopicBodyProps, type TocItem } from './shared';
import { Glossary, Thinking, Mistakes, SolveFirst, ClaimTag, Legend, type ClaimStatus } from './lesson';
import { WEALTH_LESSON } from './lessons';
import { WEALTH_PARTS, WEALTH_GENERAL_RULES } from '../wealthFormGuide';
import { AVAILABLE, NOT_RELEASED } from '../availability';

export const WEALTH_TOC: TocItem[] = [
  { id: 'wd-0', label: 'מושגי יסוד', view: 'learn' }, { id: 'wd-2', label: 'מועד', view: 'learn' },
  { id: 'wd-3', label: 'מבנה הטופס', view: 'learn' }, { id: 'wd-fields', label: 'שדה אחר שדה', view: 'learn' }, { id: 'wd-think', label: 'איך חושבים', view: 'learn' },
  { id: 'wd-4', label: 'איך רושמים', view: 'learn' }, { id: 'wd-5', label: 'השוואת הון', view: 'learn' },
  { id: 'wd-mis', label: 'טעויות נפוצות', view: 'learn' }, { id: 'wd-8', label: 'תרגול', view: 'learn' },
  { id: 'wd-6', label: 'התהליך ביד', view: 'apply' }, { id: 'wd-q', label: 'השאלון', view: 'apply' },
  { id: 'wd-prof', label: 'כללי רישום', view: 'apply' }, { id: 'wd-t', label: 'תבניות (טיוטה)', view: 'apply' },
  { id: 'wd-dec', label: 'החלטות משרד', view: 'apply' },
];

const PARTS = [
  { k: 'א׳', t: 'רכוש והתחייבויות פרטיים', d: 'נדל״ן בארץ ובחו״ל, חשבונות (גם דיגיטליים ובשליטתך שלא על שמך), נכסים דיגיטליים, מזומן, קופות וביטוחים, ני״ע, הלוואות שנתת, רכב, תכשיטים ואספנות, תכולת בית; הלוואות מבנקים ומאחרים', f: 'שדות 10 עד 220' },
  { k: 'ב׳', t: 'השקעה בעסק שנערך בו מאזן', d: 'חשבון הון, חו״ז, הלוואות לעסק ומהעסק — לעסק, לשותפות ולחברה (מניות בערך הנקוב)', f: 'שדות 300 עד 460' },
  { k: 'ג׳', t: 'עסק שלא נערך בו מאזן', d: 'נספח לכל עסק: קופה, לקוחות, מלאי, בנקים, ני״ע, חייבים, רכוש קבוע (עלות ותאריך רכישה); התחייבויות; ההון הנקי וחלקך בו', f: 'שדות 500 עד 770' },
  { k: 'ד׳', t: 'פרטים נוספים', d: 'כספות, ייפוי כוח או נאמנות על נכסי אחרים, רכוש שאינו בבעלותך, והון נטו מהצהרה קודמת (לא בהצהרה ראשונה)', f: 'סה״כ הון נטו: שדה 800' },
];

/** התהליך ביד, מהדרישה ועד אישור ההגשה — מחקר 11.10.2026, סעיף ו. */
const STEPS: { t: string; who: string; check: string; out: string; status: ClaimStatus }[] = [
  { t: 'קבלת הדרישה', who: 'משרד', check: 'יום ההצהרה; מועד ההגשה; מי נדרש; האם בן/בת הזוג מגיש/ה בנפרד', out: 'רשומת עבודה עם שני התאריכים', status: 'verified' },
  { t: 'בדיקת היסטוריה', who: 'משרד', check: 'ראשונה או המשך; ההון נטו הקודם; באיזה בסיס נערכה (טופס ישן בשווי שוק?)', out: 'סוג השאלון', status: 'interpretation' },
  { t: 'פנייה ללקוח', who: 'משרד', check: 'מכתב ושאלון; בהצהרת המשך — הנתונים הקודמים מצורפים', out: 'פנייה שנשלחה, עם תאריך', status: 'interpretation' },
  { t: 'איסוף ומעקב', who: 'לקוח ומשרד', check: 'רשימת חוסרים לפי סעיף; תזכורת לפי תאריך יעד פנימי', out: 'רשימת חוסרים ריקה', status: 'interpretation' },
  { t: 'מילוי', who: 'משרד', check: 'עלות, ברוטו, 1 ₪, אפסים, נספחים, שקלים שלמים', out: 'טיוטה', status: 'verified' },
  { t: 'בדיקת סבירות', who: 'משרד', check: 'אישור לכל חשבון; משיכת יתר במינוס; כל סעיף בבסיס שנקבע לו; כל עסק בנספח', out: 'טיוטה מאושרת', status: 'interpretation' },
  { t: 'השוואה (בהצהרת המשך)', who: 'משרד', check: 'קודם גישור בסיס (הקודמת מחושבת מחדש), ואז השינוי האמיתי; טבלה לכל שנה; תוספת ריבית, הצמדה ושכר דירה; בלי כפילויות עם לוחות 1 עד 4', out: 'גיליון השוואה והסברים, או החלטה מתועדת לא להכין', status: 'interpretation' },
  { t: 'שיחה עם הלקוח', who: 'משרד ולקוח', check: 'הלקוח מאשר כל סעיף; הסברים להפרש', out: 'הערות מתועדות', status: 'interpretation' },
  { t: 'החתמה', who: 'לקוח', check: 'חתימה של אחד מבני הזוג לפחות; חתימה מרחוק לפי הכללים', out: 'טופס חתום (והצהרת שלמות — לפי החלטת המשרד)', status: 'verified' },
  { t: 'הגשה', who: 'משרד', check: 'צירוף מסמכים לכל סעיף; עד 31.12.2026 — מקוון, סריקה בפניות או דלפק; מ-1.1.2027 — מקוון בלבד', out: '—', status: 'verified' },
  { t: 'אישור הגשה', who: 'משרד', check: 'הודעת הגשה במערכת, או אישור הגשה על העתק בדלפק', out: 'האישור בתיק — הראיה היחידה ל«הוגש»', status: 'verified' },
  { t: 'מעקב', who: 'משרד', check: 'פניות מפקיד השומה; השלמת מסמכים במערכת', out: 'ההון נטו ותאריכו נשמרים בתיק לפעם הבאה', status: 'interpretation' },
];

/** השאלון — ראשונה מול המשך. ‼ טיוטה: אין עדיין בקשה במערכת; השאלות ינוסחו כפריטים כשתיבנה. */
const QUESTIONS: { g: string; q: string; when: string; docs: string; next: string }[] = [
  { g: 'משק הבית', q: 'האם אתם נשואים וגרים יחד? מי הילדים, ומה תאריכי הלידה?', when: 'תמיד', docs: '—', next: 'שינוי מצב משפחתי או לידה; ילד שעבר את גיל 18 יוצא' },
  { g: 'משק הבית', q: 'האם בן/בת הזוג מגיש/ה הצהרה נפרדת?', when: 'אם נשואים', docs: 'הצהרה חתומה של בן/בת הזוג', next: 'אותו דבר' },
  { g: 'נדל״ן', q: 'יש לכם, או למי מבני הבית, דירה, קרקע, חנות או נכס בבנייה — בארץ או בחו״ל? איך נרכש?', when: 'תמיד', docs: 'חוזה, נסח, קבלות על מס רכישה, עו״ד ותיווך, חשבוניות שיפוץ; צו ירושה או מסמכי מתנה; לוח תשלומים לקבלן', next: 'נכס חדש או נמכר; שיפוצים מאז; תשלומים לקבלן' },
  { g: 'בנקים', q: 'באילו בנקים, בתי השקעות וארנקים דיגיטליים יש לכם חשבון, בארץ ובחו״ל? יש חשבון בשליטתכם שלא על שמכם?', when: 'תמיד', docs: 'אישור יתרות ליום ההצהרה, לכל חשבון ולכל מטבע', next: 'חשבון חדש או סגור' },
  { g: 'קריפטו', q: 'החזקתם מטבע דיגיטלי או NFT?', when: 'תמיד', docs: 'קובץ יתרות מהבורסה, כתובות ארנק, דוח עלות', next: 'קניות ומכירות מאז' },
  { g: 'מזומן', q: 'כמה מזומן (שקלים ומט״ח) היה בבית או בכספת ביום ההצהרה?', when: 'תמיד — «0» הוא תשובה', docs: 'הצהרת הלקוח', next: 'אותו דבר' },
  { g: 'קופות', q: 'אילו קופות, פנסיה, השתלמות, גמל וביטוח עם חיסכון יש לכל אחד, כולל הילדים?', when: 'תמיד', docs: 'אישור להצהרת הון מכל גוף, עם פיצול עובד/מעסיק', next: 'ניוד או משיכה מאז' },
  { g: 'ני״ע', q: 'תיקי השקעות בבנק, אצל ברוקר זר או בקופת גמל להשקעה?', when: 'תמיד', docs: 'תדפיס עלות מהמוסד', next: 'אותו דבר' },
  { g: 'הלוואות שנתתם', q: 'הלוויתם כסף למישהו שעוד לא החזיר?', when: 'תמיד', docs: 'הסכם או הצהרה, ותיעוד ההעברה', next: 'הלוואות שנפרעו' },
  { g: 'רכב', q: 'רכב, אופנוע, סירה? רשום בספרי העסק?', when: 'תמיד; העסק — רק אם יש עסק', docs: 'רישיון רכב, הסכם קנייה, אסמכתת תשלום; כרטיס פחת', next: 'רכב חדש או נמכר' },
  { g: 'תכשיטים ותכולה', q: 'תכשיטים, זהב, אוספים, אומנות; רשימת תכולה עם עלות ותאריך', when: 'תמיד; הסף — לפי החלטת המשרד', docs: 'רשימה, או דוח שמאי מהביטוח', next: 'רק מה שנקנה מאז' },
  { g: 'חובות', q: 'הלוואות, משכנתאות, הלוואות ממשפחה או מחברים?', when: 'תמיד', docs: 'פירוט משכנתאות ויתרות הלוואות ליום ההצהרה; הסכם והעברה', next: 'פירעונות מאז' },
  { g: 'עסקים', q: 'מניות בחברה, או שותפות בעסק עם מאזן? עסק בלי מאזן — קופה, לקוחות, מלאי, ציוד, ספקים, הלוואות, חלקכם באחוזים', when: 'אם יש', docs: 'מאזן חתום; ספירת מלאי, רשימות לקוחות וספקים, כרטיס פחת, דיווח מע״מ לחודש ההצהרה', next: 'אותו דבר' },
  { g: 'חלק ד׳', q: 'כספת? ייפוי כוח, נאמנות או זכות חתימה בחשבון של אחר? רכוש של אחרים אצלכם?', when: 'תמיד', docs: 'רשימות עם פרטי הבעלים', next: 'אותו דבר' },
  { g: 'להשוואה', q: 'ירושות, מתנות, זכיות, פיצויים או מכירת נכס מאז ההצהרה הקודמת? מתנות שנתתם, הלוואות לילדים בגירים?', when: 'רק בהצהרת המשך', docs: 'צווים, חוזים, תדפיסים', next: '—' },
  { g: 'להשוואה', q: 'כמה נפשות בכל שנה; שכירות או בעלות; שכר דירה, ריבית והצמדה ששולמו', when: 'רק בהצהרת המשך', docs: 'חוזה שכירות, אישורי ריבית מהבנק', next: '—' },
];

/** כללי רישום — מקצועיים, לא העדפות משרד (professional-rules-2026-10-11.md). מה שפתוח
 *  מוכרע בתיק על ידי רו"ח ומתועד בבקשה («בסיס הרישום»); אין «מדיניות» שמכריעה במקומו. */
const PROFESSIONAL: { t: string; rule: string; status: ClaimStatus; open?: string; ex: string }[] = [
  { t: 'קופות, פנסיה, השתלמות, ביטוח עם חיסכון', rule: 'סכום כל ההפקדות, בלי רווחים — כלשון הטופס. «כל ההפקדות» כולל מעסיק ופיצויים (פרשנות).', status: 'verified',
    open: 'האם פקיד השומה מקבל «חלק העובד בלבד» — נוהג בלי מקור רשמי.', ex: 'שכיר: הפקדות עובד 80,000, מעסיק 100,000, פיצויים 60,000 → 240,000 ₪.' },
  { t: 'רכוש קבוע בעסק בלי מאזן', rule: 'עלות מקורית ותאריך רכישה; לא עלות מופחתת.', status: 'verified', ex: 'מחשב שנקנה ב-12,000 ונפחת ל-4,000 → 12,000 ₪.' },
  { t: 'נכסים שנקנו במט״ח', rule: 'עלות במט״ח, ובשקלים לפי השער ביום התשלום.', status: 'verified', ex: 'מניות ב-10,000$ בשער 3.6 → 36,000 ₪, גם אם השער היום 3.7.' },
  { t: 'יתרות בנק ומזומן במט״ח', rule: 'היתרה במט״ח לפי התדפיס ליום ההצהרה.', status: 'verified',
    open: 'באיזה שער מתרגמים — הטופס לא קובע. הנוהג: שער יציג ליום ההצהרה, עם הערה בנספח.', ex: '5,000€ בחשבון ביום ההצהרה.' },
  { t: 'הלוואות ומשכנתאות', rule: 'קרן בלבד, בלי ריבית שטרם שולמה; נכס בתשלומים — מחיר מלא והיתרה כחוב.', status: 'verified',
    open: 'הפרשי הצמדה על הקרן. כל דרך תקינה רק אם ההשוואה מוסיפה את ההצמדה בהתאם (שולמה או נצברה).', ex: 'משכנתא: קרן 600,000 פחות החזרי קרן 90,000 → 510,000 ₪.' },
  { t: 'תכולה, תכשיטים ואספנות', rule: 'פריט־פריט בעלות ותאריך. אין סף רשמי.', status: 'verified',
    open: 'מאיזה סכום מפרטים פריט קטן — שיקול מהותיות של רו״ח בתיק, לא כלל.', ex: 'ערך כינון מפוליסת ביטוח — רק אומדן, ועם גילוי שזה אומדן.' },
  { t: 'רכב', rule: 'רכב פרטי — חלק א׳ בעלות; רכב ברכוש הקבוע של עסק בלי מאזן — חלק ג׳; לא פעמיים.', status: 'verified',
    open: 'רכב צמוד או ליסינג — אם לגלות בחלק ד׳ 3.', ex: 'רכב שנתבע עליו פחת בעסק → חלק ג׳ בלבד.' },
  { t: 'ילדים קטינים ונכסים משותפים', rule: 'ילדים שבשנת המס טרם מלאו להם 18; נכס משותף לבני הזוג — פעם אחת במלואו; עם אחר — לפי החלק.', status: 'verified', ex: 'חשבון משותף עם הורה: החלק שלך בחלק א׳, והחשבון כולו בחלק ד׳ 2 (זכות חתימה).' },
  { t: 'הצהרה קודמת בבסיס אחר', rule: 'בחלק ד׳ 4 — ההון נטו כפי שהוצהר. הנוכחית — לפי הטופס. בהשוואה: גישור בסיס, ואז השינוי האמיתי; הפרש הבסיס בנפרד, עם הסבר וראיה.', status: 'interpretation',
    open: 'נוהל רשמי לתיקון הצהרה — לא נמצא. נכס שלא הוצהר בקודמת הוא השמטה, לא שינוי בסיס: לבירור רו״ח.', ex: 'הקודמת: קופות לפי חלק העובד 200,000; הנוכחית לפי כל ההפקדות. הקודמת מחושבת מחדש ל-410,000, והפרש 210,000 מוצג כהפרש בסיס — לא כגידול הון.' },
];

/** החלטות של המשרד עצמו — העדפות עבודה, לא כללי רישום. */
const DECISIONS = [
  { q: 'להכין השוואת הון ביוזמת המשרד בכל הצהרת המשך?', ex: 'לקוח עם הצהרה ב-2021 ודרישה ל-2025 — מכינים גיליון השוואה גם בלי שהרשות ביקשה?', rec: 'כן, כבדיקה פנימית לפני ההחתמה. לרשות — רק הסברים עובדתיים, ורק כשרו״ח מחליט לצרף.' },
  { q: 'יעד פנימי ללקוח', ex: 'מועד רשמי 14.1 — מתי לבקש את כל החומר?', rec: '45 יום לפני המועד הרשמי, ותזכורת אחרי 14 ו-30 יום. היעד נרשם בבקשה, בנפרד מהמועד הרשמי.' },
  { q: 'השוואה כשירות נפרד?', ex: 'במחירון («המשרד › הצעות מחיר») יש «הצהרת הון ראשונה» ו«שנייה ואילך». השוואת הון — כלולה, או שורה שלישית?', rec: 'שורה נפרדת, כדי שהשוואה תהיה בחירה גלויה ולא תוספת שקטה.' },
  { q: 'הצהרת שלמות של הלקוח', ex: 'שני בני הזוג חותמים, או אחד? לצרף להגשה?', rec: 'שני בני הזוג, ולשמור בתיק בלבד.' },
];

// הדוגמה הפתורה — מספרים להמחשה (מחקר 11.10.2026, סעיף ג). ‼ הוצאות המחיה מטבלת 2023 —
// לבדוק מול הטבלה הרשמית; בעבודה אמיתית לוקחים את הטבלה של כל שנה.
const EX = { prev: 600_000, cur: 760_000, tax: 120_000, ni: 75_000, income: 900_000, childAllowance: 9_000, gift: 40_000, table: 176_304, years: 3, interest: 12_000 };

export default function WealthBody({ view }: TopicBodyProps) {
  const [demand, setDemand] = useState('2026-09-14');
  const [asOf, setAsOf] = useState('2025-12-31');
  const r = useMemo(() => wealthDeadline({ demandDate: demand, asOfDate: asOf }), [demand, asOf]);
  const he = (iso?: string) => iso ? iso.split('-').reverse().join('.') : '';
  const learn = view !== 'apply';
  const apply = view !== 'learn';

  const growth = EX.cur - EX.prev, uses = EX.tax + EX.ni, sources = EX.income + EX.childAllowance + EX.gift;
  const left = sources - (growth + uses), needed = EX.table * EX.years + EX.interest * EX.years, gap = needed - left;

  return (
    <>
      {learn && <>
        <Sec id="wd-0" title="מושגי יסוד">
          <p className="kn-small kn-muted" style={{ margin: 0 }}>אחד־עשר מושגים. השוואת הון נשענת על כולם — כדאי לעבור עליהם לפני «השוואת הון».</p>
          <Glossary terms={WEALTH_LESSON.glossary} year={2025} />
          <Legend />
        </Sec>

        <Sec id="wd-2" title="מועד הגשה — מה שבמכתב">
          <div className="kn-sim">
            <div className="kn-page" style={{ gap: 12 }}>
              <label className="kn-field" htmlFor="wd-demand">תאריך מכתב הדרישה<input id="wd-demand" type="date" value={demand} onChange={e => setDemand(e.target.value)} /></label>
              <label className="kn-field" htmlFor="wd-asof">יום ההצהרה (ההצהרה נכונה ליום)<input id="wd-asof" type="date" value={asOf} onChange={e => setAsOf(e.target.value)} /></label>
            </div>
            <div className="kn-page" style={{ gap: 8 }}>
              {r.ok && r.value ? (
                <div className="kn-box"><span className="kn-eyebrow">המועד במכתב לא יכול להיות לפני</span><span className="kn-big">{he(r.value)}</span><span className="kn-xs kn-muted"><RV id="wealth.deadlineDays" year={2025} /> מהמאוחר מבין תאריך הדרישה ויום ההצהרה (סעיף 135(1)(א)). זו רצפה לבקרה — המועד המחייב הוא זה שכתוב בדרישה.</span></div>
              ) : <Problems problems={r.problems} />}
              <p className="kn-small" style={{ margin: 0 }}>בלי מכתב דרישה אין מועד מחייב. ארכה — לבקשת הנישום, או ארכה כללית שהרשות מפרסמת לתקופה מסוימת (למשל הצהרות 2023–2024 שמועדן חל בין 1.2.2026 ל-29.6.2026 הוארכו עד 30.6.2026). <ClaimTag status="verified" /> ארכה «אוטומטית» קבועה עם הדוח השנתי לא נמצאה. <ClaimTag status="open" /></p>
              <p className="kn-small" style={{ margin: 0 }}>מועד שחל בשבת או בחג — לא נמצא כלל שדוחה מועד שכתוב במכתב. <ClaimTag status="open" /> הספירה מתאריך הדרישה ולא מיום הקבלה <ClaimTag status="interpretation" />.</p>
            </div>
          </div>
        </Sec>

        <Sec id="wd-3" title="מבנה טופס 1219">
          <div className="kn-page" style={{ gap: 8 }}>
            {PARTS.map(p => (
              <details key={p.k} className="kn-box">
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>חלק {p.k} · {p.t}</summary>
                <p className="kn-small" style={{ margin: '6px 0 0' }}>{p.d}</p>
                <p className="kn-xs kn-muted" style={{ margin: 0 }}>{p.f}</p>
              </details>
            ))}
          </div>
        </Sec>

        <Sec id="wd-fields" title="טופס 1219 שדה אחר שדה — ממסמך לשורה">
          <p className="kn-small">הטופס החדש («מעודכן ל-12.2024»), שנקרא במלואו עם דברי ההסבר. לכל שדה: מה רושמים, איזה מסמך מבקשים, מה בודקים ומה הטעות הנפוצה. <span className="kn-xs kn-muted">«חדש» = סעיף שנוסף בטופס החדש.</span></p>
          <details className="kn-details"><summary><strong className="kn-small">כללים שחלים על כל שדה</strong></summary>
            <ul className="kn-small">{WEALTH_GENERAL_RULES.map(g => <li key={g.text}>{g.text} <ClaimTag status={g.status} /></li>)}</ul>
          </details>
          {WEALTH_PARTS.map(p => (
            <details key={p.id} className="kn-details" open={p.id === 'a' || undefined}>
              <summary><strong className="kn-small">{p.title}</strong> <span className="kn-xs kn-muted">שדות {p.fields}</span></summary>
              <p className="kn-xs kn-muted" style={{ margin: '4px 0' }}>{p.intro}</p>
              <div className="kn-dict">{p.rows.map(r => (
                <details key={p.id + r.field} className="kn-dict-row">
                  <summary><span className="kn-dict-name">{r.title}{r.isNew ? <span className="kn-xs" style={{ color: 'var(--br)' }}> · חדש</span> : null}</span><span className="kn-dict-code">{r.field}</span></summary>
                  <div className="kn-dict-body kn-small">
                    <div><span className="kn-muted">רושמים:</span> {r.record} <ClaimTag status={r.status} /></div>
                    <div><span className="kn-muted">מבקשים מהלקוח:</span> {r.doc}</div>
                    <div><span className="kn-muted">בודקים:</span> {r.check}</div>
                    {r.mistake && <div><span className="kn-muted">טעות נפוצה:</span> {r.mistake}</div>}
                    <div className="kn-xs kn-muted">טופס 1219: {r.page}</div>
                  </div>
                </details>
              ))}</div>
            </details>
          ))}
          <p className="kn-xs kn-muted">מספור השדות במערכת המקוונת (מקוון בלבד מ-1.1.2027) לא נבדק — דורש הזדהות <ClaimTag status="open" />.</p>
        </Sec>
        <Sec id="wd-think" title="איך חושבים — סדר העבודה">
          <Thinking steps={WEALTH_LESSON.thinking} year={2025} />
        </Sec>

        <Sec id="wd-4" title="איך רושמים">
          <div className="kn-page" style={{ gap: 6 }}>
            <p className="kn-small" style={{ margin: 0 }}><strong>כללי:</strong> <RV id="wealth.costBasis" year={2025} /></p>
            <p className="kn-small" style={{ margin: 0 }}><strong>פרטים מדברי ההסבר:</strong> <RV id="wealth.recordingDetails" year={2025} /></p>
            <p className="kn-small" style={{ margin: 0 }}><strong>קופות:</strong> <RV id="wealth.funds" year={2025} /> <ClaimTag status="verified" /> «רק חלק העובד» — נוהג בלי מקור רשמי <ClaimTag status="open" /></p>
            <p className="kn-small" style={{ margin: 0 }}><strong>רכוש קבוע בעסק בלי מאזן:</strong> <RV id="wealth.businessAssets" year={2025} /></p>
            <p className="kn-small" style={{ margin: 0 }}><strong>מט״ח:</strong> <RV id="wealth.foreignCurrency" year={2025} /> — השער ליתרות בנק: <ClaimTag status="open" /></p>
            <p className="kn-small" style={{ margin: 0 }}><strong>חובות:</strong> <RV id="wealth.liabilities" year={2025} /></p>
            <p className="kn-small" style={{ margin: 0 }}><strong>הצהרה קודמת בבסיס אחר:</strong> <RV id="wealth.basisChange" year={2025} /> — הגישור בהשוואה: <ClaimTag status="interpretation" /></p>
            <p className="kn-small" style={{ margin: 0 }}><strong>ני״ע:</strong> <RV id="wealth.securities" year={2025} /></p>
            <p className="kn-small" style={{ margin: 0 }}><strong>הגשה:</strong> <RV id="wealth.onlineSystem" year={2025} /> · <strong>מ-2027:</strong> <RV id="wealth.onlineSystem" year={2027} /></p>
            <p className="kn-small" style={{ margin: 0 }}><strong>מתי «הוגשה»:</strong> <RV id="wealth.filedEvidence" year={2025} /></p>
          </div>
        </Sec>

        <Sec id="wd-5" title="השוואת הון">
          <div className="kn-prose">
            <p><RV id="wealth.comparison" year={2025} /></p>
            <p><strong>טבלאות המחיה:</strong> <RV id="wealth.livingTables" year={2023} /></p>
          </div>
          <div className="kn-inform">
            <div><b>1. גידול בהון</b><span>הון נטו עכשיו פחות הון נטו בהצהרה הקודמת — אחרי שהקודמת חושבה מחדש לבסיס של הנוכחית. הפרש הבסיס מוצג בנפרד, לא כגידול.</span></div>
            <div><b>2. ועוד שימושים</b><span>מס, ביטוח לאומי, ריבית והצמדה, מתנות שנתת — כסף שיצא ולא נשאר.</span></div>
            <div><b>3. פחות מקורות</b><span>הכנסות שדווחו ותקבולים פטורים. הלוואה אינה מקור.</span></div>
            <div><b>4. מה שנשאר למחיה</b><span>משווים להוצאות המחיה מהטבלה, ועוד שכר דירה, ריבית והצמדה בפועל.</span></div>
          </div>
          <p className="kn-xs kn-muted" style={{ margin: 0 }}>אין נוסחה רשמית; זה המבנה המעשי מהפסיקה ומהחומרים. <ClaimTag status="interpretation" /> מוסכמת הסימן: כאן חיובי = לא מוסבר (בפתרון של הקורס הסימן הפוך).</p>
          <div className="kn-solves">
            <SolveFirst level="יישום" status="interpretation" title="השוואה בין שתי הצהרות"
              facts={<>זוג ושני ילדים קטנים (4 נפשות). הון נטו ב-31.12.2021: {fmtNis(EX.prev)}; ב-31.12.2024: {fmtNis(EX.cur)}. שלוש שנים. מס ששולם {fmtNis(EX.tax)}, ביטוח לאומי {fmtNis(EX.ni)}. הכנסה חייבת {fmtNis(EX.income)}, קצבת ילדים {fmtNis(EX.childAllowance)}, מתנה מתועדת {fmtNis(EX.gift)}. ריבית משכנתא {fmtNis(EX.interest)} לשנה. גרים בדירה שלהם.</>}
              ask="האם יש גידול הון שלא מוסבר?"
              steps={[
                { label: 'גידול בהון', value: `${fmtNis(EX.cur)} − ${fmtNis(EX.prev)} = ${fmtNis(growth)}` },
                { label: 'שימושים (מס וביטוח לאומי)', value: fmtNis(uses) },
                { label: 'מקורות', value: fmtNis(sources) },
                { label: 'נשאר למחיה: מקורות פחות (גידול + שימושים)', value: fmtNis(left) },
                { label: `טבלת מחיה × ${EX.years} שנים (לדוגמה: ${fmtNis(EX.table)} לשנה)`, value: fmtNis(EX.table * EX.years) },
                { label: 'ועוד ריבית ששולמה (לא בטבלה)', value: fmtNis(EX.interest * EX.years) },
                { label: 'מחיה נדרשת פחות מה שנשאר', value: fmtNis(gap) },
              ]}
              answer={gap <= 0 ? <>נשארו {fmtNis(-gap)} מעבר לטבלה — אין גידול לא מוסבר.</> : <>{fmtNis(gap)} לא מוסברים.</>}
              note="הסכום מהטבלה להמחשה בלבד (לוח 1 של 2023, לפי עשירון ההכנסה ו-4 נפשות). בעבודה אמיתית: טבלה לכל שנה, בלי «הצמדה 2%», ובלי לנטרל שכר דירה." />
          </div>
        </Sec>

        <Sec id="wd-mis" title="טעויות נפוצות">
          <Mistakes items={WEALTH_LESSON.mistakes} year={2025} />
        </Sec>

        <Sec id="wd-8" title="תרגול">
          <Quiz items={[
            { level: 'יסוד', q: 'לקוח קיבל דירה בירושה. איך היא נרשמת?', options: [{ text: 'לפי השווי היום', right: false }, { text: '1 ₪, והנכס מופיע', right: true }, { text: 'לא נרשמת — לא שילם עליה', right: false }], why: 'ירושה ומתנה — 1 ₪ לפי דברי ההסבר לטופס. הנכס חייב להופיע, אחרת יופיע בעתיד כגידול לא מוסבר.' },
            { level: 'יישום', q: 'דירה על הנייר ב-2,000,000 ₪; שולמו 800,000 ועוד 60,000 מס רכישה ושכר טרחה. מה נרשם?', options: [{ text: 'נכס 860,000, בלי חוב', right: false }, { text: 'נכס 2,060,000; חוב לקבלן 1,200,000', right: true }], why: 'במחיר הכולל ועם העלויות הנלוות; היתרה לקבלן — בהתחייבויות.' },
            { level: 'יישום', q: 'זוג גר בשכירות ב-5,000 ₪ לחודש. האם השכירות כבר בתוך טבלת המחיה?', options: [{ text: 'כן', right: false }, { text: 'לא — מוסיפים 60,000 ₪ לשנה לפי החוזה', right: true }], why: 'הטבלאות הרשמיות לא כוללות שכר דירה, ריבית והצמדה.' },
            { level: 'מתקדם', q: 'בהשוואה יצאו 60,000 ₪ לא מוסברים. התברר שהלקוח קיבל ירושה של 50,000 ₪ שהופקדה בבנק. מה עושים?', options: [{ text: 'מוסיפים 50,000 למקורות, עם צו ירושה ותדפיס; נשארים 10,000 לבדיקה', right: true }, { text: 'שום דבר — הירושה כבר רשומה ב-1 ₪', right: false }], why: 'הרישום ב-1 ₪ הוא בהצהרה; בהשוואה הירושה היא מקור כספי שצריך להוכיח.' },
          ]} />
        </Sec>
      </>}

      {apply && <>
        <Sec id="wd-6" title="התהליך ביד — מהדרישה ועד אישור ההגשה">
          {AVAILABLE.wealthRequest
            ? <p className="kn-small kn-muted" style={{ margin: 0 }}>בתיק המס: «הצהרות הון › התחל הכנה» (או «＋ בקשה חדשה › שנת מס › הצהרת הון»). המערכת מנהלת את שלבים 1 עד 4 ואת בדיקת התשובות; מילוי, השוואה, החתמה והגשה — ביד, לפי הסדר הזה, בכל משרד.</p>
            : <p className="kn-small kn-muted" style={{ margin: 0 }}>בקשת «הצהרת הון» במערכת — {NOT_RELEASED}. בינתיים כל השלבים ביד, לפי הסדר הזה, בכל משרד.</p>}
          <div className="kn-tbl-wrap">
            <table className="kn-tbl kn-tbl-wide">
              <thead><tr><th>#</th><th>שלב</th><th>מי</th><th>מה בודקים</th><th>מה יוצא / ראיה</th></tr></thead>
              <tbody>{STEPS.map((s, i) => <tr key={s.t}><td className="n">{i + 1}</td><td>{s.t} <ClaimTag status={s.status} /></td><td>{s.who}</td><td>{s.check}</td><td>{s.out}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="kn-gaps"><strong>אסור לסמן «הושלם» בלי ראיה:</strong> «הוגש» בלי הודעת הגשה · «נחתם» בלי טופס חתום בתיק · «מסמכים התקבלו» כשחסר אישור לחשבון שהוצהר · «ארכה ניתנה» בלי מסמך · «אין הפרש» בלי גיליון השוואה שמור.</div>
        </Sec>

        <Sec id="wd-q" title="השאלון — הצהרה ראשונה והצהרת המשך">
          <p className="kn-small kn-muted" style={{ margin: 0 }}>בראשונה — שואלים על הכול. בהמשך — מציגים את הנתון מההצהרה הקודמת ושואלים רק מה השתנה, ומוסיפים את שאלות ההשוואה. {AVAILABLE.wealthRequest
            ? 'השאלון המלא, עם התנאים לכל שאלה ומה כבר ידוע ללקוח מסוים — בבקשת «הצהרת הון» › «השאלון». כאן הסקירה.'
            : `השאלון המלא ללקוח מסוים, בתוך בקשת «הצהרת הון» — ${NOT_RELEASED}. כאן הסקירה.`} <ClaimTag status="interpretation" /></p>
          <div className="kn-tbl-wrap">
            <table className="kn-tbl kn-tbl-wide">
              <thead><tr><th>נושא</th><th>השאלה ללקוח</th><th>מתי שואלים</th><th>מסמכים</th><th>בהצהרת המשך</th></tr></thead>
              <tbody>{QUESTIONS.map((q, i) => <tr key={i}><td>{q.g}</td><td>{q.q}</td><td>{q.when}</td><td>{q.docs}</td><td>{q.next}</td></tr>)}</tbody>
            </table>
          </div>
        </Sec>

        <Sec id="wd-prof" title="כללי רישום — מקצועיים, עם סטטוס">
          <p className="kn-small kn-muted" style={{ margin: 0 }}>אלה אינם העדפות משרד. מה שמסומן «פתוח» מוכרע בתיק על ידי רו״ח, ונרשם בבקשה («בסיס הרישום»). כלל פתוח לא עוצר את האיסוף מהלקוח.</p>
          <div className="kn-tbl-wrap">
            <table className="kn-tbl kn-tbl-wide">
              <thead><tr><th>סעיף</th><th>הכלל</th><th>מה פתוח</th><th>דוגמה</th></tr></thead>
              <tbody>{PROFESSIONAL.map(r => <tr key={r.t}><td>{r.t}</td><td>{r.rule} <ClaimTag status={r.status} /></td><td>{r.open ? <>{r.open} <ClaimTag status="open" /></> : '—'}</td><td>{r.ex}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="kn-gaps"><strong>לא ממשיכים טעות.</strong> את הנתונים והבסיס של ההצהרה הקודמת שומרים להשוואה. אם הבסיס משתנה — רושמים בבקשה את ההסבר ומי אישר, ובהשוואה מציגים את הפרש הבסיס בנפרד. נכס שהיה ולא הוצהר — עוצרים לבירור.</div>
        </Sec>

        <Sec id="wd-t" title="תבניות משרד — טיוטה לאישור">
          <p className="kn-small kn-muted" style={{ margin: 0 }}>נוסחים מקוריים, בהשראת החומרים ולא העתקה שלהם. לפני שימוש — אישור שלך לנקודות שמסומנות.</p>
          <details className="kn-box">
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>מכתב ללקוח: «הצהרת הון ליום …»</summary>
            <div className="kn-prose kn-small" style={{ marginTop: 6 }}>
              <p>{'{שם}'} שלום, רשות המסים ביקשה ממך ומבן/בת הזוג הצהרת הון: רשימה של כל הנכסים והחובות שלכם ושל ילדיכם שבשנת {'{שנה}'} טרם מלאו להם 18, בארץ ובחו״ל, נכון ל-{'{יום ההצהרה}'}. ההצהרה צריכה להגיע לרשות עד {'{מועד}'}.</p>
              <p><strong>למה חשוב לדייק.</strong> ההצהרה תשמש בעתיד בסיס להשוואה. נכס שלא יירשם עכשיו עלול להיראות בהמשך כמו כסף שאין לו הסבר — גם דברים קטנים, וגם מה שקיבלתם במתנה או בירושה.</p>
              <p><strong>מה נבקש</strong> (רק מה שרלוונטי, נכון ליום ההצהרה): אישורי יתרות מכל חשבון; אישור להצהרת הון מכל קופה; מסמכי נדל״ן ועלויות נלוות; רישיון רכב ומסמכי קנייה; הלוואות שנתתם או לקחתם; קובץ יתרות למטבעות דיגיטליים; רשימת תכשיטים ותכולה; מזומן בבית, כספות ונכסים של אחרים. {'{בהצהרת המשך: מצורפים הנתונים מההצהרה הקודמת — סמנו רק מה השתנה.}'}</p>
              <p>נשמח לקבל את החומר עד {'{תאריך יעד פנימי}'}, כדי שיישאר זמן לבדוק, לשאול ולהחתים לפני המועד.</p>
              <p className="kn-xs"><strong>לאישורך:</strong> האם להזכיר קנס איחור (בלי סכום); לא לכתוב «דרישה שגרתית» כשהדרישה במסגרת ביקורת.</p>
            </div>
          </details>
          <details className="kn-box">
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>הצהרת שלמות ואחריות של הלקוח</summary>
            <div className="kn-prose kn-small" style={{ marginTop: 6 }}>
              <p>1. מסרתי למשרד את כל המידע והמסמכים על הנכסים וההתחייבויות שלי, של בן/בת זוגי ושל ילדינו שבשנת {'{שנה}'} טרם מלאו להם 18, בארץ ובחו״ל, נכון ל-{'{יום ההצהרה}'}.</p>
              <p>2. עברתי על ההצהרה. לפי מיטב ידיעתי היא מלאה ונכונה, והאחריות לנכונותה ולשלמותה היא שלי.</p>
              <p>3. במיוחד בדקתי: חשבונות בכל מוסד (גם דיגיטליים, וגם בשליטתי שלא על שמי), מזומן, נכסים דיגיטליים, הלוואות שנתתי או לקחתי, מתנות וירושות, כספות, ונכסים שאני מחזיק/ה בשביל אחרים או כמיופה כוח או נאמן.</p>
              <p>4. ידוע לי שהמשרד ערך את ההצהרה לפי המידע שמסרתי, ולא ביצע ביקורת או בדיקה עצמאית.</p>
              <p>5. אם אגלה פרט חסר או שגוי — אודיע למשרד מיד.</p>
              <p className="kn-xs"><strong>לאישורך:</strong> ניסוח סעיף 4; להחתים את שני בני הזוג או אחד; לשמור בתיק בלבד (מומלץ) או לצרף להגשה.</p>
            </div>
          </details>
        </Sec>

        <Sec id="wd-dec" title="החלטות של המשרד">
          <p className="kn-small kn-muted" style={{ margin: 0 }}>רק העדפות עבודה — לא כללי רישום. ליד כל אחת דוגמה והצעה. כל עוד לא נקבעה הגדרה, שום דבר מזה לא מופעל אוטומטית — בוחרים בכל תיק.</p>
          <div className="kn-inform">
            {DECISIONS.map(d => <div key={d.q}><b>{d.q}</b><span>{d.ex}</span><span>הצעה: {d.rec}</span></div>)}
          </div>
        </Sec>
      </>}
    </>
  );
}
