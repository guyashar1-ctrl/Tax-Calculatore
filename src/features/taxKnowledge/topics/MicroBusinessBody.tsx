// ─── עסק זעיר — מהבסיס ועד הביצוע במשרד ───────────────────────────────────────
// ‼ 11.10.2026: נבנה מחדש לפי המחקר המאומת (docs/tax-foundation/micro/micro-business-research-2026-10-11.md).
// מסלול של מס הכנסה בלבד (87ב עד 87ז, מ-1.1.2024). המעמד במע״מ אינו קלט — לא מסיקים ממנו.
// כל מספר נשלף מהמרשם או מחושב ב-microBusiness(). «30%» ו«70%» מופיעים רק כציטוט מהטופס ומהמדריך.
// לכל טענה — מאומת / פרשנות / פתוח. תוכן «בקצרה», מושגים וטעויות — lessonsMore.ts.

import { useMemo, useState } from 'react';
import { microBusiness, type MicroYear } from '../../taxRules/calc';
import { num } from '../../taxRules/registry';
import { OPEN_ITEMS, STATUS_LABEL, MEANWHILE_LABEL } from '../../taxRules/openItems';
import { RV, Problems, fmtNis } from '../RuleBits';
import { Sec, Quiz, NumField, type TopicBodyProps, type TocItem } from './shared';
import { Glossary, Thinking, Mistakes, SolveFirst, ClaimTag, Legend, type ClaimStatus } from './lesson';
import { MICRO_LESSON } from './lessonsMore';

export const MICRO_TOC: TocItem[] = [
  { id: 'mb-0', label: 'מושגי יסוד', view: 'learn' }, { id: 'mb-1', label: 'מה זה המסלול', view: 'learn' },
  { id: 'mb-el', label: 'מי זכאי', view: 'learn' }, { id: 'mb-30', label: 'מה הניכוי מחליף', view: 'learn' },
  { id: 'mb-to', label: 'מה נכלל במחזור', view: 'learn' }, { id: 'mb-think', label: 'איך חושבים', view: 'learn' },
  { id: 'mb-2', label: 'מחשבון', view: 'learn' }, { id: 'mb-ov', label: 'חריגה מהתקרה', view: 'learn' },
  { id: 'mb-cool', label: 'צינון', view: 'learn' }, { id: 'mb-rep', label: 'מקוצר מול מלא', view: 'learn' },
  { id: 'mb-ni', label: 'מקדמות וב״ל', view: 'learn' }, { id: 'mb-ex', label: 'דוגמאות פתורות', view: 'learn' },
  { id: 'mb-tbl', label: 'השוואת מצבים', view: 'learn' }, { id: 'mb-3', label: 'מה ידוע ומה לא', view: 'learn' },
  { id: 'mb-mis', label: 'טעויות נפוצות', view: 'learn' }, { id: 'mb-8', label: 'תרגול', view: 'learn' },
  { id: 'mb-4', label: 'מה עושים בתיק', view: 'apply' }, { id: 'mb-5', label: 'בטופס 1301', view: 'apply' },
];

// ‼ המסלול התחיל ב-2024; למרשם יש ערכים ל-2024 עד 2026. שנה אחרת — מוצגת הקרובה, עם הסבר.
const YEARS = [2024, 2025, 2026] as const;
const LATEST = YEARS[YEARS.length - 1];
const pickYear = (y: number) => ((YEARS as readonly number[]).includes(y) ? y : y > LATEST ? LATEST : YEARS[0]);

const ceilingOf = (y: number) => num('micro.turnoverCeiling', y);
const pct = (y: number) => `${+(num('micro.normativeRate', y) * 100).toFixed(2)}%`;
const M = (input: Parameters<typeof microBusiness>[0]) => microBusiness(input).value;
/** סכום מדויק עם אגורות כשיש — 87ד(ג) ב-2026 אינו מספר עגול, ולא מעגלים אותו בשקט. */
const fmtExact = (n: number) => n.toLocaleString('he-IL', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }) + ' ₪';
const joinYears = (ys: number[]) => ys.join(' ו-');

type Reg = 'yes' | 'no' | 'unknown';
type Hist = 'deducted' | 'notDeducted' | 'noIncome' | 'unknown';

function toHistory(h: Record<number, Hist>): MicroYear[] {
  return Object.entries(h).filter(([, v]) => v !== 'unknown').map(([year, v]) => ({ year: +year, deducted: v === 'deducted', hadBusinessIncome: v !== 'noIncome' }));
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; t: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="kn-field">
      <span>{label}</span>
      <div className="kn-choice" role="group" aria-label={label}>
        {options.map(o => <button key={o.v} type="button" className="btn btn-secondary btn-sm" aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.t}</button>)}
      </div>
    </div>
  );
}

/** מה המערכת יודעת לבדוק, ומה עוד לא — כל שורה עם מקור או עם הסיבה שאין. */
const CHECKS: { t: string; d: string; status: ClaimStatus }[] = [
  { t: 'תקרת המחזור לפי שנה', d: '2024 ו-2025 — מהחוק והמדריכים; 2026 — משאלות ותשובות של רשות המסים («כ-», עודכן 24.02.2026). נבדק במחשבון.', status: 'verified' },
  { t: 'מה נכלל במחזור', d: 'התקנות לפי 87ז(א) (תשפ״ו-2025) נקראו: פיצויי נזק עקיף ומענקים — מ-2026, ולפי בקשה גם ל-2024 ול-2025. דמי לידה ומילואים — לא במחזור.', status: 'verified' },
  { t: 'הכנסות נוספות', d: 'הזכאות לניכוי לא תלויה בהן — 87ה לא מזכיר משכורת. הפטור מדוח — כן: כל ההכנסות מהסוגים שבתקנה 2, ובלי סייג מתקנה 3 (כולל בן הזוג).', status: 'verified' },
  { t: 'ניכוי דמי ביטוח לאומי (47א)', d: 'לא חל — 87ד(א) מבטל אותו, וגם תיקון 345(ב)(1)(א) לחוק הב״ל.', status: 'verified' },
  { t: 'חריגה (87ד(ג)) — הסכום', d: 'עד שיעור הניכוי כפול תקרת «עוסק פטור» — לא כפול המחזור — למי שהיה רשום בתחילת השנה. נבדק במחשבון.', status: 'verified' },
  { t: 'חריגה — שילוב עם הוצאות בפועל', d: 'אסור לפי הקריאה הסבירה; החוק לא אומר במפורש ואין פרסום רשמי.', status: 'interpretation' },
  { t: 'צינון — «שתיים» בחוק ו«שלוש» במדריכים', d: 'אותה תקופה בספירה שונה: החוק — שתי השנים שאחרי שנת היציאה; המדריכים — שלוש שנים כולל שנת היציאה. דברי ההסבר: «שנתיים נוספות». דוגמה: ניכה 2024, לא ניכה 2025 ⇒ אין 30% ב-2026 וב-2027, חוזר ב-2028. קריאה מילולית של המדריך (חסום גם 2028) — החוק גובר.', status: 'verified' },
  { t: 'בסיס ביטוח לאומי', d: 'אין ניכוי 52% לבעל עסק זעיר — כתוב בסוף 345(ב)(1)(א) (מאומת). שהבסיס הוא «ההכנסה בשומה» = 70% מהמחזור — קריאה חזקה (דברי ההסבר: «כפל ניכוי»), לא כתוב במפורש; הנחיה של ב״ל לא אותרה. בהערכת המס — לא מחושב בלי השלמה מאושרת.', status: 'interpretation' },
];

export default function MicroBusinessBody({ year, view }: TopicBodyProps) {
  const Y = pickYear(year);
  const learn = view !== 'apply';
  const apply = view !== 'learn';

  // ── מחשבון ──
  const [calcYear, setCalcYear] = useState<number>(Y);
  const [turnover, setTurnover] = useState(90_000);
  const [actual, setActual] = useState(20_000);
  const [reg, setReg] = useState<Reg>('yes');
  const [opened, setOpened] = useState<'yes' | 'no'>('no');
  const [hist, setHist] = useState<Record<number, Hist>>({});
  const prevYears = YEARS.filter(y => y < calcYear);
  const history = useMemo(() => toHistory(Object.fromEntries(YEARS.filter(y => y < calcYear).map(y => [y, hist[y] ?? 'unknown']))), [hist, calcYear]);
  const r = useMemo(() => microBusiness({ year: calcYear, turnover, registeredAtYearStart: reg === 'yes' ? true : reg === 'no' ? false : undefined, history }), [calcYear, turnover, reg, history]);
  const cool = num('micro.coolingYears', calcYear);
  const prevDeducted = hist[calcYear - 1] === 'deducted';
  const nextBlocked = joinYears(Array.from({ length: cool }, (_, i) => calcYear + 1 + i));
  const histMissing = prevYears.some(y => (hist[y] ?? 'unknown') === 'unknown');

  // ── דוגמאות (מחושבות מהמרשם) ──
  const c25 = ceilingOf(2025), c26 = ceilingOf(2026);
  const e1 = M({ year: 2026, turnover: 100_000, registeredAtYearStart: true });
  const e2 = M({ year: 2026, turnover: c26 });
  const e3reg = M({ year: 2025, turnover: 130_000, registeredAtYearStart: true });
  const e3no = M({ year: 2025, turnover: 130_000, registeredAtYearStart: false });
  const e4 = M({ year: 2026, turnover: 150_000, registeredAtYearStart: true });
  const e5 = M({ year: 2026, turnover: 90_000, registeredAtYearStart: true, history: [{ year: 2024, deducted: true, hadBusinessIncome: true }, { year: 2025, deducted: false, hadBusinessIncome: true }] });
  const e7 = M({ year: 2026, turnover: 110_000, registeredAtYearStart: true });
  const q1 = M({ year: 2026, turnover: 80_000 });
  const cap25 = e3reg?.deduction ?? 0, cap26 = e2?.deduction ?? 0;
  const niBase = 100_000 - (M({ year: 2026, turnover: 100_000 })?.deduction ?? 0);
  const openItems = OPEN_ITEMS.filter(i => i.topicId === 'microBusiness' && i.status !== 'closed');

  return (
    <>
      {learn && <>
        <p className="kn-oneliner">מסלול של <strong>מס הכנסה בלבד</strong>: יחיד רשום שמחזורו עד <RV id="micro.turnoverCeiling" year={Y} /> מנכה <RV id="micro.normativeRate" year={Y} /> מהמחזור במקום הוצאות בפועל. פטור מדוח שנתי — רק בתנאים, לא בגלל שהמחזור קטן. המעמד במע״מ לא קובע דבר במסלול הזה.</p>
        {year !== Y && <p className="kn-soft">{year < YEARS[0] ? `המסלול התחיל ב-1.1.2024; בשנת ${year} אין עסק זעיר. מוצגים ערכי ${Y}.` : `ערכי ${year} לא הוזנו; מוצגים ערכי ${Y}.`}</p>}

        <Sec id="mb-0" title="מושגי יסוד">
          <Glossary terms={MICRO_LESSON.glossary} year={Y} />
          <Legend />
        </Sec>

        <Sec id="mb-1" title="מה זה המסלול — ומה הוא לא">
          <div className="kn-prose">
            <p>פרק שמיני לחלק ד׳ בפקודה (סעיפים 87ב עד 87ז) נוסף בחוק ההתייעלות הכלכלית 2023, ותחילתו בהכנסות מ-1.1.2024. לכן שנת המס הראשונה היא 2024, ולא 2025. <ClaimTag status="verified" /></p>
            <p><strong>מס הכנסה בלבד.</strong> התקרה שאולה מהגדרת «עוסק פטור» בחוק מע״מ — <strong>הסכום</strong>, לא המעמד. עוסק מורשה יכול להיות בעל עסק זעיר, ועוסק פטור אינו בהכרח בעל עסק זעיר. הדיווח למע״מ לא משתנה. <ClaimTag status="verified" /></p>
          </div>
          <p className="kn-small" style={{ margin: 0 }}>בתיק מבחינים בין חמישה דברים, ואף אחד מהם לא נגזר מהאחר: <ClaimTag status="interpretation" /></p>
          <div className="kn-tbl-wrap"><table className="kn-tbl">
            <thead><tr><th>מה</th><th>מה זה</th><th>איך יודעים</th></tr></thead>
            <tbody>
              <tr><td>זכאות</td><td>מחזור עד התקרה, ובלי סייג מ-87ה(א)</td><td>נגזר מהמחזור ומהעובדות</td></tr>
              <tr><td>רישום ברשות</td><td>נרשם או בוטל, <strong>ומתי</strong> — קובע את 87ד(ג)</td><td>צילום מהאזור האישי או משע״ם</td></tr>
              <tr><td>סוג תיק</td><td>44 או אחר — קובע אם אפשר דיווח מקוצר</td><td>צילום מהאזור האישי או משע״ם</td></tr>
              <tr><td>מסלול בדוח לשנה</td><td>ניכוי נורמטיבי · «שלא להחיל» · 87ד(ג) · ספרים</td><td>החלטה לשנה, מתועדת בתיק</td></tr>
              <tr><td>מעמד במע״מ</td><td>פטור או מורשה — נפרד לגמרי</td><td>תיק מע״מ; לא מסיקים ממנו עסק זעיר</td></tr>
            </tbody>
          </table></div>
        </Sec>

        <Sec id="mb-el" title="מי זכאי, ורישום וביטול">
          <div className="kn-prose">
            <p><strong>ההגדרה (87ב):</strong> יחיד תושב ישראל, שמחזור העסקאות שלו בשנת המס עד <RV id="micro.turnoverCeiling" year={Y} />, ושרשום כבעל עסק זעיר לפי 87ג. <ClaimTag status="verified" /></p>
            <p><strong>מי לא זכאי לניכוי (87ה(א)) — מספיק אחד:</strong> <ClaimTag status="verified" /></p>
          </div>
          <ul className="kn-small" style={{ margin: 0, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <li>מעסיק עובדים (87ה(א)(1)).</li>
            <li>לא מנהל פנקסים קבילים (87ה(א)(2)). חובת ניהול הספרים לא השתנתה במסלול.</li>
            <li>יש לו הכנסה מהעסק ממי שמעסיק אותו באותה שנה כשכיר (87ה(א)(4)).</li>
            <li>יותר מרבע מההכנסות מקרוב או ממעסיק לשעבר (87ה(א)(6)).</li>
            <li>ועוד סייגים באותו סעיף: הכנסה שאינה מיגיעה אישית, חבר בתאגיד שקוף, בעל שליטה; וסוגים שייקבעו בתקנות (87ה(א)(8)).</li>
          </ul>
          <p className="kn-small" style={{ margin: 0 }}>«חבר קיבוץ» מופיע כחריג במדריכי רשות המסים ובמסך הרישום, אבל בסיס חוקי לא אותר. «שותף בשותפות» — אין חריג מפורש בחוק. <ClaimTag status="open" /></p>
          <div className="kn-two">
            <div className="kn-box">
              <strong className="kn-small">רישום (87ג(א))</strong>
              <span className="kn-small">עוסק פטור נרשם <strong>אוטומטית</strong>, אלא אם ביקש שלא. כל אחר מגיש בקשה — עד מועד הגשת הדוח, או בתוך הדוח. לפי שאלות ותשובות, בקשת רישום — עד 25.12. <ClaimTag status="verified" /></span>
              <span className="kn-xs kn-muted">בבקשה מצהירים על מחזור צפוי מתחת לתקרה. מי שצופה חריגה כבר ברישום — לא זכאי לרישום.</span>
            </div>
            <div className="kn-box">
              <strong className="kn-small">ביטול (87ג(ב), (ג))</strong>
              <span className="kn-small">הנישום רשאי לבטל עד אותו מועד. פקיד השומה מבטל כשהמחזור מעל התקרה, כשאין עמידה בתנאי 87ה, או לפי בקשה. <ClaimTag status="verified" /></span>
              <span className="kn-xs kn-muted">«שלא להחיל» לשנה אחת (סימון בדוח) אינו ביטול רישום.</span>
            </div>
          </div>
          <div className="kn-prose">
            <p><strong>פטור מדוח שנתי (תקנות הפטור, 1 עד 3) — ארבעה תנאים, כולם:</strong> (1) בקשה מקוונת לפטור עד תום שנת המס; (2) הצהרה על המחזור הצפוי <strong>במהלך</strong> השנה, כלומר תיאום מס; (3) הצהרה על המחזור בפועל עד 31.3 בשנה שאחריה; (4) תשלום עד 31.3. בנוסף, כל ההכנסות מהסוגים שבתקנה 2, ואף סייג מתקנה 3 — וחלק מהסייגים בודקים גם את <strong>בן או בת הזוג</strong> (למשל שליטה בחברה, נכסים בחו״ל מעל הסף, חיוב במס יסף). פקיד השומה רשאי תמיד לדרוש דוח (תקנה 6). <ClaimTag status="verified" /></p>
            <p>תקנה 3(א)(5) — מי שהיה חייב בדוח בשנה הקודמת — על פניה שוללת פטור בשנת המעבר; בפועל רשות המסים מאפשרת דיווח מקוצר למי שעבר. פטור מפורש לא נמצא, ולכן לא מבטיחים. <ClaimTag status="open" /></p>
          </div>
        </Sec>

        <Sec id="mb-30" title="מה הניכוי מחליף, ומה נשאר">
          <div className="kn-two">
            <div className="kn-box">
              <span className="kn-eyebrow">במקום</span>
              <span className="kn-small">הוצאות בפועל ופחת — סעיפים 17 עד 27 (87ד(א)). <ClaimTag status="verified" /></span>
              <span className="kn-small">ניכוי דמי ביטוח לאומי לפי 47א — לא חל. בטופס: בלי 030/089. <ClaimTag status="verified" /></span>
              <span className="kn-small">פחת שלא נוכה: במכירת ציוד מהעסק הוא מובא בחשבון בחישוב השבח או רווח ההון (87ד(ב)). <ClaimTag status="verified" /></span>
            </div>
            <div className="kn-box">
              <span className="kn-eyebrow now">נשאר</span>
              <span className="kn-small">קרן השתלמות (17(5א)) — לא הוחרגה. בדיווח המקוצר אין לה שדה, ולכן בפועל נוכה רק בדוח מלא. <ClaimTag status="verified" /></span>
              <span className="kn-small">פנסיה בדוח מלא — הכללים הרגילים (45א, 47), כי לא הוחרגו. <ClaimTag status="interpretation" /></span>
              <span className="kn-small">פנסיה בדיווח המקוצר — זיכוי 35% על ההפקדה, עד 5% מההכנסה החייבת, רק כשזו ההכנסה היחידה. <ClaimTag status="verified" /></span>
              <span className="kn-small">קיזוז הפסד מועבר משנים קודמות — מותר בדוח מלא (שדה 279). <ClaimTag status="verified" /></span>
            </div>
          </div>
          <p className="kn-xs kn-muted" style={{ margin: 0 }}>השיעור נקבע בחוק; שר האוצר רשאי לשנות אותו בצו (87ז(ב)). צו כזה לא נמצא.</p>
        </Sec>

        <Sec id="mb-to" title="מה נכלל במחזור">
          <ul className="kn-small" style={{ margin: 0, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <li>מחזור העסקאות לפי חוק מע״מ, בלי מע״מ. <ClaimTag status="verified" /></li>
            <li><strong>לא במחזור:</strong> דמי לידה, שמירת היריון ודמי מילואים מביטוח לאומי. לא נספרים לתקרה, ואין עליהם ניכוי — מדווחים בנפרד. <ClaimTag status="verified" /></li>
            <li><strong>מ-2026 במחזור:</strong> פיצויי נזק עקיף ומענקים ששולמו דרך רשות המסים (תקנות לפי 87ז(א), תשפ״ו-2025). ל-2024 ול-2025 — רק לפי בקשה. <ClaimTag status="verified" /></li>
            <li><strong>חריג ל-2026:</strong> מי שחרג מהתקרה רק בגלל פיצויי מלחמה — לפי רשות המסים עדיין בעל עסק זעיר, «רק במסגרת הדוח השנתי ובשנת 2026 בלבד»: הניכוי על המחזור במע״מ בלבד, והפיצוי מדווח בנפרד. <ClaimTag status="verified" /></li>
            <li>עסק שנפתח באמצע השנה — האם התקרה מחושבת באופן יחסי: לא פורסם כלל. <ClaimTag status="open" /></li>
          </ul>
        </Sec>

        <Sec id="mb-think" title="איך חושבים על עסק זעיר">
          <Thinking steps={MICRO_LESSON.thinking} year={Y} />
        </Sec>

        <Sec id="mb-2" title="מחשבון: ניכוי, חריגה וצינון">
          <div className="kn-sim">
            <div className="kn-page" style={{ gap: 12 }}>
              <label className="kn-field" htmlFor="mb-y">שנת המס
                <select id="mb-y" value={calcYear} onChange={e => { setCalcYear(+e.target.value); setHist({}); }}>{YEARS.map(y => <option key={y} value={y}>{y}</option>)}</select>
              </label>
              <NumField id="mb-t" label="מחזור בשנה (בלי מילואים ולידה)" value={turnover} onChange={setTurnover} max={200_000} step={500} />
              <NumField id="mb-a" label="הוצאות בפועל" value={actual} onChange={setActual} max={150_000} step={500} />
              <Choice label="רשום כבעל עסק זעיר ב-1.1 של השנה?" value={reg} onChange={setReg} options={[{ v: 'yes', t: 'כן' }, { v: 'no', t: 'לא — נרשם אחר כך' }, { v: 'unknown', t: 'לא ידוע' }]} />
              <Choice label="העסק נפתח השנה, באמצע השנה?" value={opened} onChange={setOpened} options={[{ v: 'no', t: 'לא' }, { v: 'yes', t: 'כן' }]} />
              {prevYears.map(py => (
                <label key={py} className="kn-field" htmlFor={`mb-h${py}`}>מה היה ב-{py}?
                  <select id={`mb-h${py}`} value={hist[py] ?? 'unknown'} onChange={e => setHist(h => ({ ...h, [py]: e.target.value as Hist }))}>
                    <option value="unknown">לא ידוע</option>
                    <option value="deducted">ניכה {pct(py)} (ניכוי רגיל)</option>
                    <option value="notDeducted">הכנסה מעסק בלי ניכוי (ויתור או חריגה)</option>
                    <option value="noIncome">לא הייתה הכנסה מעסק</option>
                  </select>
                </label>
              ))}
            </div>
            <div className="kn-page" style={{ gap: 8 }}>
              {r.ok && r.value ? (() => {
                const v = r.value;
                const taxNorm = turnover - v.deduction, taxActual = Math.max(turnover - actual, 0);
                return <>
                  <span className="kn-xs kn-muted">תקרה ל-{calcYear}: {fmtNis(v.ceiling)} · מחזור {turnover <= v.ceiling ? 'בתקרה' : 'מעל התקרה'}</span>
                  {v.mode === 'regular' && <>
                    <div className="kn-two">
                      <div className="kn-box"><span className="kn-eyebrow">נורמטיבי</span><span className="kn-big">{fmtExact(v.deduction)}</span><span className="kn-xs kn-muted">הכנסה חייבת {fmtExact(taxNorm)}</span></div>
                      <div className="kn-box"><span className="kn-eyebrow now">בפועל («שלא להחיל»)</span><span className="kn-big">{fmtNis(actual)}</span><span className="kn-xs kn-muted">הכנסה חייבת {fmtNis(taxActual)}</span></div>
                    </div>
                    <p className="kn-small" style={{ margin: 0 }}>{actual > v.deduction ? 'ההוצאות בפועל גבוהות מהניכוי — אפשר «שלא להחיל» השנה.' : 'הניכוי הנורמטיבי גבוה או שווה — המסלול עדיף מבחינת הניכוי.'} <ClaimTag status="verified" /></p>
                    {actual > v.deduction && prevDeducted && <div className="kn-gaps"><strong>צינון: </strong>ב-{calcYear - 1} ניכה. ויתור ב-{calcYear}, כשיש הכנסה מעסק, חוסם את {nextBlocked} (87ה(ב)). <ClaimTag status="verified" /></div>}
                  </>}
                  {v.mode === 'exceeded87dc' && <>
                    <div className="kn-two">
                      <div className="kn-box"><span className="kn-eyebrow">ניכוי מוגבל (87ד(ג))</span><span className="kn-big">{fmtExact(v.deduction)}</span><span className="kn-xs kn-muted">הכנסה חייבת {fmtExact(taxNorm)}</span></div>
                      <div className="kn-box"><span className="kn-eyebrow now">הוצאות בפועל על כל המחזור</span><span className="kn-big">{fmtNis(actual)}</span><span className="kn-xs kn-muted">הכנסה חייבת {fmtNis(taxActual)}</span></div>
                    </div>
                    <p className="kn-small" style={{ margin: 0 }}>עדיף: <strong>{actual > v.deduction ? 'הוצאות בפועל' : 'הניכוי המוגבל'}</strong>. אחד מהשניים — לא משלבים. <ClaimTag status="interpretation" /> השנה: דוח מלא, בלי דיווח מקוצר. <ClaimTag status="interpretation" /></p>
                    {prevDeducted && <div className="kn-gaps"><strong>צינון: </strong>שנת 87ד(ג) נחשבת «לא ניכה». ב-{calcYear - 1} ניכה, ולכן {nextBlocked} חסומות (87ה(ב)). <ClaimTag status="verified" /></div>}
                  </>}
                  {v.mode === 'exceededNoRelief' && <>
                    <div className="kn-box"><span className="kn-eyebrow now">הוצאות בפועל בלבד</span><span className="kn-big">{fmtNis(actual)}</span><span className="kn-xs kn-muted">הכנסה חייבת {fmtNis(taxActual)}</span></div>
                    {prevDeducted && <div className="kn-gaps"><strong>צינון: </strong>ב-{calcYear - 1} ניכה, וב-{calcYear} יש הכנסה מעסק בלי ניכוי — {nextBlocked} חסומות (87ה(ב)). <ClaimTag status="verified" /></div>}
                  </>}
                  {v.mode === 'blockedCooling' && v.coolingBlockedBy && <>
                    <div className="kn-box"><strong className="kn-small">צינון — אין ניכוי ב-{calcYear}</strong><span className="kn-small">ניכה ב-{v.coolingBlockedBy.deductedIn}, וב-{v.coolingBlockedBy.notDeductedIn} הייתה הכנסה מעסק בלי ניכוי. לכן {v.coolingBlockedBy.notDeductedIn + 1} ו-{v.coolingBlockedBy.notDeductedIn + 2} חסומות (87ה(ב)). מנכים הוצאות בפועל: {fmtNis(actual)}. <ClaimTag status="verified" /></span><span className="kn-xs kn-muted">המדריכים כותבים «שלוש השנים הבאות» — סתירה שלא הוכרעה. <ClaimTag status="open" /></span></div>
                  </>}
                  {v.open.map(o => <p key={o} className="kn-soft" style={{ margin: 0 }}>{o} <ClaimTag status="open" /></p>)}
                  {opened === 'yes' && <p className="kn-soft" style={{ margin: 0 }}>שנת פתיחה: ההשוואה היא לתקרה השנתית המלאה. האם התקרה יחסית — לא הוכרע; המשרד מכריע. <ClaimTag status="open" /></p>}
                  {histMissing && <p className="kn-xs kn-muted" style={{ margin: 0 }}>שנה קודמת «לא ידוע» — לא נבדק בה צינון.</p>}
                </>;
              })() : <Problems problems={r.problems} />}
            </div>
          </div>
          <p className="kn-xs kn-muted" style={{ margin: 0 }}>המחשבון בודק מחזור, רישום בתחילת השנה וצינון. הסייגים של 87ה(א), הפטור מדוח והמעמד במע״מ — לא נבדקים כאן; המעמד במע״מ אינו קלט בכלל.</p>
        </Sec>

        <Sec id="mb-ov" title="חריגה מהתקרה (87ד(ג))">
          <div className="kn-prose">
            <p>יחיד שהיה <strong>רשום כבעל עסק זעיר בתחילת שנת המס</strong> וחדל להיות בעל עסק זעיר באותה שנה — רשאי לנכות את סכום הניכוי, אבל לא יותר מ-<RV id="micro.exceededCap" year={Y} /> <strong>מתקרת «עוסק פטור»</strong> — לא מהמחזור: {fmtExact(cap25)} ב-2024 וב-2025, {fmtExact(cap26)} ב-2026. <ClaimTag status="verified" /></p>
            <p>התנאים במסלול הזה מצומצמים: רק שלא מתקיימים 87ה(א)(2) (פנקסים), (4) (הכנסה מהמעסיק השנה), (6) (רבע מקרוב או ממעסיק לשעבר) ו-87ה(ב) (צינון). <ClaimTag status="verified" /> לכן מי שמעסיק עובדים, למשל, לא נשלל כאן. <ClaimTag status="interpretation" /> אין «מרווח סבילות»: גם חריגה קטנה מוציאה מהמסלול הרגיל. <ClaimTag status="verified" /></p>
            <p><strong>לא משלבים:</strong> או הניכוי המוגבל, או הוצאות בפועל על <strong>כל</strong> המחזור — לא הניכוי המוגבל ועוד הוצאות על מה שמעל התקרה. זו הקריאה הסבירה; החוק לא אומר במפורש ואין פרסום רשמי. <ClaimTag status="interpretation" /></p>
            <p><strong>דוח מלא:</strong> בשנה הזו הוא כבר לא «בעל עסק זעיר», ולכן אין דיווח מקוצר ואין פטור מדוח. <ClaimTag status="interpretation" /> בשידור המקוון, לפי מדריכי 2024 ו-2025, מחזור מעל התקרה עם סימון «עסק זעיר» נחסם בשדות 238/239 — דרך מקוונת לדרוש את הניכוי המוגבל לא נמצאה. טיפול ידני. <ClaimTag status="open" /></p>
            <p><strong>נרשם באמצע השנה ואחר כך חרג:</strong> לפי לשון החוק («רשום בתחילת שנת המס») — אין ניכוי מוגבל, רק הוצאות בפועל. האם רישום מאמצע השנה חל מתחילתה — לא הוכרע. <ClaimTag status="open" /></p>
            <p><strong>השנה שאחרי:</strong> הזכאות נבדקת לפי המחזור של כל שנה, ולכן אפשר לחזור לניכוי — אלא אם ניכה בשנה שלפני שנת החריגה. אז שנת החריגה נחשבת «לא ניכה», ומתחיל צינון. <ClaimTag status="verified" /></p>
          </div>
        </Sec>

        <Sec id="mb-cool" title="צינון (87ה(ב))">
          <div className="kn-prose">
            <p>מי שניכה בשנה X, ובשנה X+1 הייתה לו הכנסה מעסק והוא לא ניכה — לא יוכל לנכות גם ב-<RV id="micro.coolingYears" year={Y} /> שנות המס שאחרי X+1. «לא ניכה» כולל ויתור («שלא להחיל») וגם שנת 87ד(ג). <ClaimTag status="verified" /></p>
            <p>אין צינון כשלא ניכה בשנה שלפני, או כשבשנת אי־הניכוי לא הייתה הכנסה מעסק. בשנה הראשונה במסלול אין שנה קודמת עם ניכוי, ולכן חריגה בה לא מפעילה צינון. <ClaimTag status="interpretation" /></p>
          </div>
          <div className="kn-gaps"><strong>«שתיים» מול «שלוש» — אותה תקופה: </strong>החוק (87ה(ב), ס״ח 3045 עמ׳ 173) — «בשתי שנות המס שלאחר» שנת אי־הניכוי; דברי ההסבר (הצ״ח 1612, עמ׳ 934) — «שנתיים נוספות». מדריכי 2024 ו-2025 (פרק ב׳ 2.2) — «שלוש השנים הבאות», כלומר שנת היציאה ועוד שתיים. ניכה 2024, לא ניכה 2025 (עם הכנסה מעסק) ⇒ 2025, 2026 ו-2027 בלי 30%; חוזר ב-2028. קריאה מילולית של המדריך הייתה חוסמת גם את 2028 — החוק גובר. <ClaimTag status="verified" /></div>
        </Sec>

        <Sec id="mb-rep" title="דיווח מקוצר מול דוח מלא">
          <div className="kn-tbl-wrap"><table className="kn-tbl kn-tbl-wide">
            <thead><tr><th></th><th>דיווח מקוצר</th><th>דוח מלא עם ניכוי <RV id="micro.normativeRate" year={Y} /></th></tr></thead>
            <tbody>
              <tr><td>למי</td><td>תיק מסוג 44, כל תנאי הפטור מתקיימים <ClaimTag status="verified" /></td><td>מי שחייב בדוח מסיבה אחרת, או שאין לו תיק 44 — עדיין רשאי לנכות <ClaimTag status="verified" /></td></tr>
              <tr><td>סוג תיק</td><td>44. אי אפשר לעבור ל-44 כשיש סוג תיק אחר בגלל הכנסות שאינן מהעסק</td><td>לא נדרש 44</td></tr>
              <tr><td>מה מגישים</td><td>מחזור בפועל, גמלאות ב״ל, אישורי פנסיה, ניכוי במקור (857), ותשלום. המס: שיעור התיאום × (המחזור פחות הניכוי)</td><td>טופס 1301: סימון «בעל עסק זעיר» בחלק א׳; שדה 150 = 70% מהמחזור שבשדה 238 <ClaimTag status="verified" /></td></tr>
              <tr><td>מועד</td><td>31.3 בשנה שאחרי. לשנת 2025 הוארך עד 31.8.2026 <ClaimTag status="verified" /></td><td>מועד הדוח הרגיל</td></tr>
              <tr><td>נקודות זיכוי</td><td>דרך תיאום המס; הטבה שלא מומשה — בבקשה להחזר מס או בדוח מלא</td><td>בדוח</td></tr>
              <tr><td>פנסיה</td><td>זיכוי 35% עד 5% מההכנסה החייבת, כשזו ההכנסה היחידה</td><td>כללים רגילים <ClaimTag status="interpretation" /></td></tr>
              <tr><td>קרן השתלמות</td><td>אין שדה</td><td>17(5א) נשמר <ClaimTag status="interpretation" /></td></tr>
              <tr><td>בלי דיווח עד המועד</td><td>עובר לדוח מלא, ומועבר ל«עסק רגיל» (לפי שאלות ותשובות)</td><td>—</td></tr>
            </tbody>
          </table></div>
          <div className="kn-prose">
            <p><strong>תיאום מס:</strong> ההצהרה על המחזור הצפוי היא תנאי לפטור, ונעשית <strong>במהלך</strong> השנה. ההכנסה מהעסק מחושבת בו כמו משכורת ממשרה נוספת, ולכן לפי שיעור שולי; השיעור נקבע בתיאום האחרון, ואפשר לעדכן כמה פעמים. <ClaimTag status="verified" /></p>
            <p><strong>המועד האחרון לתיאום — סותר:</strong> 25.12 (שקף, וגם המועד לבקשת רישום לפי שאלות ותשובות), 30.12 (מדריך 2025), 31.12 (שאלות ותשובות). במשרד: דד-ליין פנימי <strong>25.12</strong>. <ClaimTag status="open" /></p>
            <p>«מקדמות במקום תיאום» — בלי תיאום אין פטור מדוח. מתאים רק כשמראש בוחרים דוח מלא עם ניכוי. <ClaimTag status="interpretation" /></p>
          </div>
        </Sec>

        <Sec id="mb-ni" title="מקדמות, הצהרת הון וביטוח לאומי">
          <div className="kn-prose">
            <p><strong>מקדמות מס הכנסה:</strong> 87ו נותן לפקיד השומה <strong>סמכות</strong> לפטור — לא פטור אוטומטי בחוק. בפועל, לפי רשות המסים, בעל עסק זעיר «לא יחויב באופן אוטומטי», ויש מערכת לתשלום מקדמה מרצון (או בשע״ם). מקדמות ששולמו כעצמאי לפני המעבר מועברות. <ClaimTag status="verified" /></p>
            <p><strong>הצהרת הון:</strong> לא נדרשת אוטומטית; רשות המסים רשאית לדרוש. <ClaimTag status="verified" /></p>
            <p><strong>ביטוח לאומי:</strong> אין ניכוי 52% לבעל עסק זעיר — התיקון לסעיף 345(ב)(1)(א) אומר זאת במפורש («ובלבד שלא חלות עליו ההוראות לעניין סכום הניכוי לבעל עסק זעיר»). <ClaimTag status="verified" /> הבסיס עצמו — «ההכנסה בשומה», כלומר המחזור פחות הניכוי: מחזור {fmtNis(100_000)} ⇒ בסיס {fmtNis(niBase)}. זו קריאה חזקה אבל לא לשון מפורשת, ואין הנחיה של ב״ל — לכן בהערכת המס דמי הביטוח של עסק זעיר לא מחושבים עד שהמשרד משלים סכום (משומת ב״ל) או מחיל במפורש 70%, עם מקור ואישור. <ClaimTag status="interpretation" /></p>
          </div>
        </Sec>

        <Sec id="mb-ex" title="דוגמאות פתורות">
          <p className="kn-small kn-muted" style={{ margin: 0 }}>המספרים מחושבים מהמרשם לשנה שבכל דוגמה. כדאי לנסות לפתור לפני שפותחים את הפתרון.</p>
          <div className="kn-solves">
            {e1 && <SolveFirst level="יסוד" status="verified" title="1. ניכוי רגיל"
              facts={<>2026. מעצבת גרפית, רשומה מ-1.1. מחזור {fmtNis(100_000)}, הוצאות בפועל {fmtNis(15_000)}.</>}
              ask="מה הניכוי, ומה ההכנסה החייבת?"
              steps={[
                { label: `מחזור עד ${fmtNis(e1.ceiling)}?`, value: e1.eligibleByTurnover ? 'כן' : 'לא' },
                { label: `ניכוי: ${pct(2026)} × 100,000`, value: fmtExact(e1.deduction) },
                { label: 'הכנסה חייבת', value: fmtExact(100_000 - e1.deduction) },
                { label: 'הוצאות בפועל ו-47א', value: 'לא נכנסים' },
              ]}
              answer={<>ניכוי {fmtExact(e1.deduction)}; הכנסה חייבת {fmtExact(100_000 - e1.deduction)}. ההוצאות בפועל ({fmtNis(15_000)}) לא נכנסות, ואין ניכוי 47א.</>}
              note="הזכאות כאן נבדקה לפי המחזור. בתיק בודקים גם את הסייגים של 87ה(א)." />}
            {e2 && <SolveFirst level="יסוד" status="verified" title="2. בדיוק בתקרה"
              facts={<>2026. מחזור {fmtNis(c26)} בדיוק.</>}
              ask="זכאי? כמה מנכים?"
              steps={[
                { label: 'מחזור ≤ התקרה', value: e2.eligibleByTurnover ? 'כן' : 'לא' },
                { label: `ניכוי: ${pct(2026)} × המחזור`, value: fmtExact(e2.deduction) },
              ]}
              answer={<>זכאי — התנאי הוא «עד», כולל. ניכוי {fmtExact(e2.deduction)}. במסך אפשר לעגל, בחישוב שומרים את הערך המדויק.</>} />}
            {e3reg && e3no && <SolveFirst level="מתקדם" status="verified" title="3. מעל התקרה — תלוי ברישום"
              facts={<>2025. יועץ עצמאי. מחזור {fmtNis(130_000)}, הוצאות בפועל {fmtNis(15_000)}. תקרת 2025: {fmtNis(c25)}.</>}
              ask={<>כמה מותר לנכות — אם היה רשום ב-1.1.2025, ואם לא?</>}
              steps={[
                { label: 'מחזור מול התקרה', value: 'מעל' },
                { label: `רשום ב-1.1: ${pct(2025)} × התקרה (87ד(ג))`, value: fmtExact(e3reg.deduction) },
                { label: 'רשום ב-1.1: הוצאות בפועל', value: fmtNis(15_000) },
                { label: 'לא רשום ב-1.1', value: 'הוצאות בפועל בלבד' },
              ]}
              answer={<>רשום מתחילת השנה: רשאי לנכות {fmtExact(e3reg.deduction)} — יותר מ-{fmtNis(15_000)} בפועל — בדוח מלא, בכפוף לתנאי 87ד(ג). לא {fmtNis(e3reg.normativeExpenses)} ({pct(2025)} מהמחזור): התקרה היא על הניכוי. לא היה רשום מתחילת השנה: {fmtNis(15_000)} בפועל בלבד. נרשם באמצע השנה — לא הוכרע.</>}
              note="ההגשה המקוונת חוסמת מחזור מעל התקרה עם סימון «עסק זעיר» — דרישת הניכוי המוגבל בטיפול ידני (פתוח)." />}
            {e4 && <SolveFirst level="מתקדם" status="interpretation" title="4. חריגה: לא משלבים"
              facts={<>2026, רשום מ-1.1. מחזור {fmtNis(150_000)}. מקרה א: הוצאות בפועל {fmtNis(20_000)}. מקרה ב: {fmtNis(50_000)}.</>}
              ask="מה ההכנסה החייבת בכל מקרה?"
              steps={[
                { label: 'ניכוי מוגבל', value: fmtExact(e4.deduction) },
                { label: 'א: הניכוי המוגבל גבוה מ-20,000 ⇒ הכנסה', value: fmtExact(150_000 - e4.deduction) },
                { label: 'ב: 50,000 בפועל גבוה ⇒ הכנסה', value: fmtNis(100_000) },
              ]}
              answer={<>א: {fmtExact(150_000 - e4.deduction)}. ב: {fmtNis(100_000)}. לא מוסיפים לניכוי המוגבל הוצאות בפועל על {fmtNis(150_000 - c26)} שמעל התקרה.</>}
              note="איסור השילוב הוא הקריאה הסבירה של 87ד(ג) — לא כתוב בחוק. מציגים שתי חלופות נפרדות." />}
            {e5 && <SolveFirst level="מתקדם" status="verified" title="5. צינון אחרי חריגה"
              facts={<>ב-2024 ניכה. ב-2025 חרג מהתקרה ונוכה לו הניכוי המוגבל (87ד(ג)). ב-2026 המחזור {fmtNis(90_000)}.</>}
              ask="מותר לו לנכות ב-2026?"
              steps={[
                { label: 'שנת 87ד(ג) נחשבת', value: '«לא ניכה»' },
                { label: 'ניכה ב-2024, לא ניכה ב-2025 עם הכנסה מעסק', value: 'צינון' },
                { label: 'שנים חסומות', value: e5.coolingBlockedBy ? `${e5.coolingBlockedBy.notDeductedIn + 1}, ${e5.coolingBlockedBy.notDeductedIn + 2}` : '—' },
                { label: 'ב-2026', value: e5.mode === 'blockedCooling' ? 'אין ניכוי' : 'ניכוי' },
              ]}
              answer={<>לא. 2026 ו-2027 חסומות, ומ-2028 אפשר לחזור. עד אז — הוצאות בפועל.</>}
              note="«שלוש השנים» במדריכים = 2025 (שנת היציאה), 2026 ו-2027 — אותה תקופה כמו בחוק. 2028 מותרת לפי החוק; קריאה מילולית של המדריך הייתה חוסמת גם אותה — החוק גובר." />}
            <SolveFirst level="יישום" status="interpretation" title="6. מחזור קטן ומשכורת"
              facts={<>עצמאית עם מחזור {fmtNis(60_000)}, וגם שכירה עם משכורת.</>}
              ask="זכאית לניכוי? פטורה מדוח?"
              steps={[
                { label: 'מחזור בתקרה', value: 'כן' },
                { label: 'משכורת שוללת את הניכוי?', value: 'לא (87ה)' },
                { label: 'משכורת מאותו מעסיק שמשלם לעסק?', value: 'שולל — 87ה(א)(4)' },
                { label: 'פטור מדוח', value: 'לפי תקנות 2 ו-3' },
              ]}
              answer={<>לניכוי — כן, כל עוד ההכנסה בעסק אינה ממי שמעסיק אותה. לפטור מדוח — רק אם המשכורת מהסוגים שבתקנה 2, אין סייג מתקנה 3 (גם של בן הזוג), ויש תיק 44, תיאום ודיווח מקוצר. לא מבטיחים פטור לפני שבודקים.</>} />
            {e7 && <SolveFirst level="יישום" status="verified" title="7. דמי מילואים"
              facts={<>2026. מחזור {fmtNis(110_000)}, ועוד דמי מילואים מב״ל {fmtNis(20_000)}.</>}
              ask="מה נבדק מול התקרה, ומה הניכוי?"
              steps={[
                { label: 'מחזור לתקרה', value: fmtNis(110_000) },
                { label: `ניכוי: ${pct(2026)} × 110,000`, value: fmtExact(e7.deduction) },
                { label: 'דמי המילואים', value: 'בנפרד, בלי ניכוי' },
              ]}
              answer={<>המחזור {fmtNis(110_000)} — בתקרה. ניכוי {fmtExact(e7.deduction)}. ה-{fmtNis(20_000)} מדווחים בנפרד ואין עליהם ניכוי.</>} />}
          </div>
        </Sec>

        <Sec id="mb-tbl" title="השוואת מצבים">
          <div className="kn-tbl-wrap"><table className="kn-tbl kn-tbl-wide">
            <thead><tr><th>מצב</th><th>הניכוי</th><th>הדיווח</th><th>מה עושים</th><th>מעמד</th></tr></thead>
            <tbody>
              <tr><td>מחזור עד התקרה</td><td><RV id="micro.normativeRate" year={Y} /> מהמחזור, או «שלא להחיל» והוצאות בפועל</td><td>מקוצר בתיק 44 כשכל התנאים מתקיימים; אחרת דוח מלא עם סימון</td><td>תיאום מוקדם, מעקב מחזור, דיווח ותשלום עד 31.3</td><td><ClaimTag status="verified" /></td></tr>
              <tr><td>תחזית לחריגה במהלך השנה</td><td>עוד לא נקבע — החריגה בפועל קובעת</td><td>צפוי דוח מלא</td><td>לעדכן תיאום, לשקול מקדמה מרצון, להכין את שתי החלופות, להזהיר על צינון</td><td><ClaimTag status="interpretation" /></td></tr>
              <tr><td>חרג בפועל, רשום ב-1.1</td><td>עד {fmtExact(cap26)} ב-2026 ({fmtExact(cap25)} ב-2024 וב-2025), או הוצאות בפועל על כל המחזור — לא שילוב</td><td>דוח מלא; אין נתיב מקוון ידוע</td><td>טיפול ידני מול פקיד השומה, ותיעוד</td><td><ClaimTag status="verified" /> החוק · <ClaimTag status="open" /> השידור</td></tr>
              <tr><td>חרג, נרשם באמצע השנה</td><td>הוצאות בפועל (לפי לשון החוק)</td><td>דוח מלא</td><td>הוצאות בפועל, עם הערה; לברר עם פקיד השומה</td><td><ClaimTag status="open" /></td></tr>
              <tr><td>חרג רק בגלל פיצויי מלחמה (2026)</td><td>על המחזור במע״מ בלבד; הפיצוי בנפרד</td><td>דוח מלא</td><td>להפריד את הפיצוי</td><td><ClaimTag status="verified" /></td></tr>
              <tr><td>שנת צינון</td><td>אין ניכוי — הוצאות בפועל</td><td>דוח מלא</td><td>לתעד את השנים החסומות בתיק</td><td><ClaimTag status="verified" /> הצינון · <ClaimTag status="interpretation" /> הדיווח</td></tr>
              <tr><td>אחרי שנת חריגה, שוב בתקרה</td><td>ניכוי רגיל — אלא אם ניכה בשנה שלפני החריגה (אז צינון)</td><td>לפי התנאים</td><td>לבדוק היסטוריה בינואר</td><td><ClaimTag status="verified" /></td></tr>
            </tbody>
          </table></div>
        </Sec>

        <Sec id="mb-3" title="מה ידוע ומה לא">
          <div className="kn-two">
            {CHECKS.map(c => <div key={c.t} className="kn-box"><strong className="kn-small">{c.t} <ClaimTag status={c.status} /></strong><span className="kn-small">{c.d}</span></div>)}
          </div>
          <details className="kn-details">
            <summary>שאלות פתוחות ומה המערכת עושה בינתיים ({openItems.length})</summary>
            <div className="kn-two">
              {openItems.map(i => (
                <div key={i.id} className="kn-box">
                  <strong className="kn-small">{i.title.replace(/^עסק זעיר — /, '')}</strong>
                  <span className="kn-xs kn-muted">{STATUS_LABEL[i.status]} · בינתיים: {MEANWHILE_LABEL[i.meanwhile]}</span>
                  <span className="kn-small"><strong>חסר: </strong>{i.missing}</span>
                  <span className="kn-small"><strong>מה המערכת עושה: </strong>{i.meanwhileText}</span>
                </div>
              ))}
            </div>
          </details>
        </Sec>

        <Sec id="mb-mis" title="טעויות נפוצות">
          <Mistakes items={MICRO_LESSON.mistakes} year={Y} />
        </Sec>

        <Sec id="mb-8" title="תרגול">
          <Quiz items={[
            { level: 'יסוד', q: `2026. מחזור ${fmtNis(80_000)}, הוצאות בפועל ${fmtNis(10_000)}. מה הניכוי במסלול?`, options: [{ text: fmtNis(10_000), right: false }, { text: fmtExact(q1?.deduction ?? 0), right: true }, { text: 'שניהם', right: false }], why: `${pct(2026)} מהמחזור, במקום ההוצאות בפועל — לא בנוסף להן.` },
            { level: 'יישום', q: `2025. רשום מ-1.1, מחזור ${fmtNis(130_000)}, הוצאות בפועל ${fmtNis(15_000)}. מה הניכוי המרבי?`, options: [{ text: fmtNis(15_000), right: false }, { text: fmtExact(cap25), right: true }, { text: fmtNis(e3reg?.normativeExpenses ?? 0), right: false }], why: `87ד(ג): עד ${pct(2025)} מתקרת «עוסק פטור» (${fmtNis(c25)}), לא מהמחזור. בדוח מלא.` },
            { level: 'יישום', q: 'נרשם ביוני 2026 וחרג מהתקרה. מה מציגים?', options: [{ text: 'ניכוי מוגבל — ודאי', right: false }, { text: 'הוצאות בפועל, עם הערה ש-87ד(ג) לא הוכרע', right: true }], why: 'החוק מדבר על «רשום בתחילת שנת המס». רישום מאמצע השנה — לא הוכרע.' },
            { level: 'מתקדם', q: 'ניכה ב-2024. ב-2025 ביקש «שלא להחיל», והייתה לו הכנסה מעסק. מאיזו שנה יוכל לנכות שוב?', options: [{ text: '2026', right: false }, { text: '2028', right: true }, { text: '2029', right: false }], why: 'לפי 87ה(ב): 2026 ו-2027 חסומות. המדריכים כותבים «שלוש השנים הבאות» — ואז אולי 2029; הסתירה לא הוכרעה.' },
            { level: 'יישום', q: `עוסק מורשה במע״מ, מחזור ${fmtNis(90_000)}, רשום כבעל עסק זעיר. מה נכון?`, options: [{ text: 'לא יכול להיות עסק זעיר — הוא עוסק מורשה', right: false }, { text: 'יכול; המעמד במע״מ לא משתנה', right: true }], why: 'התקרה שאולה מהגדרת «עוסק פטור» — הסכום בלבד, לא המעמד.' },
            { level: 'מתקדם', q: 'לקוח במחזור קטן שואל אם הוא פטור מדוח שנתי. מה עונים?', options: [{ text: '«כן, כי המחזור קטן»', right: false }, { text: '«רק בתיק 44, עם תיאום, דיווח מקוצר ותשלום עד 31.3, ובלי סייג — גם של בן הזוג»', right: true }], why: 'הפטור מותנה בתקנות 1 עד 3; פקיד השומה רשאי תמיד לדרוש דוח.' },
          ]} />
        </Sec>
      </>}

      {apply && <>
        <Sec id="mb-4" title="מה עושים בתיק — לוח השנה של המשרד">
          <p className="kn-small kn-muted" style={{ margin: 0 }}>התהליך ביד. המערכת אוספת בשנת המס את הרישום, המסלול, הסייגים ואישור התיאום; ההגשה עצמה — ביד. <ClaimTag status="interpretation" /></p>
          <div className="kn-tbl-wrap"><table className="kn-tbl kn-tbl-wide">
            <thead><tr><th>מתי</th><th>מה עושים</th><th>ראיה בתיק</th></tr></thead>
            <tbody>
              <tr><td>ינואר</td><td>לבדוק רישום ותאריכו, סוג תיק והיסטוריית ניכוי (צינון). לעדכן את התקרה לשנה. לבחור מסלול לשנה — מקוצר, דוח מלא עם ניכוי, או ספרים — ולתעד את הנימוק.</td><td>צילום מהאזור האישי או משע״ם; ההחלטה לשנה</td></tr>
              <tr><td>תחילת השנה, ובכל שינוי בתחזית</td><td>תיאום מס לפי המחזור הצפוי; לבחור מעסיק עיקרי לנקודות הזיכוי. דד-ליין פנימי לתיאום ולבקשת רישום: 25.12.</td><td>אישור תיאום עם תאריך ושיעור</td></tr>
              <tr><td>במהלך השנה</td><td>מעקב מחזור מול התקרה (ב-2026 כולל פיצויים; בלי מילואים ולידה). תחזית מעל התקרה — להתריע: 87ד(ג) רק אם רשום מ-1.1, אין מקוצר, דוח מלא, השוואה בין החלופות, צינון. לשקול מקדמה מרצון.</td><td>מחזור מצטבר ותחזית</td></tr>
              <tr><td>עד 31.3 (לשנת 2025: עד 31.8.2026)</td><td>דיווח מקוצר: מחזור, גמלאות ב״ל, אישורי פנסיה, ניכוי במקור (857), ותשלום. בלי דיווח — עובר לדוח מלא.</td><td>אישור הגשה ותשלום</td></tr>
              <tr><td>דוח מלא</td><td>סימון «בעל עסק זעיר» בחלק א׳; שדה 150 = 70% מ-238; בלי 030/089; קיזוז הפסד מועבר מותר (279).</td><td>הדוח שהוגש</td></tr>
              <tr><td>חריגה (87ד(ג))</td><td>טיפול ידני מול פקיד השומה. במקרה הראשון — לבדוק את הדרך ולתעד אותה. <ClaimTag status="open" /></td><td>תכתובת עם פקיד השומה</td></tr>
            </tbody>
          </table></div>
          <div className="kn-gaps"><strong>לא מסיקים ולא מבטיחים:</strong> עסק זעיר מהמעמד במע״מ · פטור מדוח לפני שבדקו תיק 44, תיאום והסייגים (גם של בן הזוג) · ניכוי מוגבל למי שנרשם באמצע השנה · שהדוח המקוון יקבל 87ד(ג).</div>
        </Sec>

        <Sec id="mb-5" title="בטופס 1301">
          <div className="kn-inform">
            <div><b>חלק א׳, סעיף 4</b><span>שתי תיבות: «זכאי לניכוי 30%» ו«למרות שנרשמתי… שלא להחיל השנה». הסימון מופיע כבר במדריך 2024; טופס 1301 לשנת 2024 עצמו לא נבדק. בטופס הרגיל לשנת 2025 — שדה 255 עם 441/442/443 (פרשנות). <ClaimTag status="interpretation" /></span></div>
            <div><b>שדות</b><span>מחזור ב-238/239; שדה 150 = 70% מ-238 (המדריך בודק התאמה ביניהם); בלי 030/089; 279 מותר. <ClaimTag status="verified" /></span></div>
            <div><b>חריגה</b><span>בשידור, מחזור מעל התקרה עם סימון זעיר נחסם. 87ד(ג) — אין נתיב מקוון ידוע; טיפול ידני. <ClaimTag status="open" /></span></div>
          </div>
        </Sec>
      </>}
    </>
  );
}
