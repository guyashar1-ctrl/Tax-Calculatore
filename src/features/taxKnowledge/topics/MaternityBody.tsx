// ─── דמי לידה: סיווג, מס במקור ופריסה (16.10.2026) ──────────────────────────────────────────────
// ‼ בקשת גיא (16.10): «התייחסות לדמי לידה ופריסה של דמי לידה, והסבר מפורט בידע מס במקום הרלוונטי». לפי מסלול ההסבר שלנו:
//   מה זה ולמי ← באיזה שדה ← דוגמה פתורה ← חריגים ומה פתוח ← מסמכים ← 116ג צעד-צעד ← מה עושים בתיק ← מקורות.
// ‼ רק ממה שנחקר (docs/tax-foundation/research/ni-benefits-withholding-2026-10-16.md R04/R05/C16/C21,
//   spreading-deferral-continuity-2026-10-16.md §2–§3, מפת העקיבות §9.2). אין כאן דין חדש; מה שלא הוכרע — «פתוח», במפורש.
// ‼ הדוגמה הפתורה — נייר העבודה של גיא (מספרי תרגיל, לא נתוני לקוח). שם המעסיק בהודעת ב״ל הוסתר בתמונה עצמה.

import { useMemo, useState } from 'react';
import { Sec, Quiz, type TopicBodyProps, type TocItem } from './shared';
import { ClaimTag, Legend, Glossary, Thinking, Mistakes, type Lesson } from './lesson';

export const MATERNITY_LESSON: Lesson = {
  mustKnow: [
    { text: 'דמי לידה הם הכנסה חייבת; ב״ל מנכה מהם מס ודמי ביטוח. מענק לידה — פטור, ואינו כאן.', status: 'verified' },
    { text: 'עצמאית — 250/270; שכירה שב״ל שילם לה ישירות — 194/196; שולם דרך המעסיק — כבר ב-106 (158/172), לא מוסיפים שוב.', status: 'verified' },
    { text: 'המס שב״ל ניכה — 040 (וכשבתוך 106 — 042).', status: 'interpretation' },
    { text: 'ב-2025 חובה לסמן בדוח «מבקש/ת פריסת דמי לידה» — כן או לא.', status: 'verified' },
    { text: 'תקופה שחוצה שנה: אפשר לשייך לכל שנה את החלק לפי ימי הזכאות בה (גם המס). 105 ימים אינם קבועים.', status: 'verified' },
    { text: 'פריסה קדימה מחייבת דוח גם לשנה הבאה. פורסים רק כשזה משתלם.', status: 'verified' },
  ],
  action: { text: 'לבקש את האישור השנתי ואת הודעת החישוב של ב״ל, לסווג לשדה, ובתקופה שחוצה שנה — לחשב את שתי החלופות ולמלא 116ג אם פורסים.', status: 'interpretation' },
  glossary: [
    { term: 'תקופת הזכאות', plain: 'הימים שבעדם משולמים דמי הלידה — «מ… עד…» בהודעת ב״ל. 105 או 56 ימים לפי האכשרה, ועם הארכות.', status: 'verified' },
    { term: 'פריסה קדימה / אחורה', plain: 'קדימה — חלק מהסכום שהתקבל השנה עובר לשנה הבאה; אחורה — לשנה הקודמת.', where: 'טופס 116ג חלק ג׳', status: 'verified' },
    { term: '116ג', plain: 'בקשה לפריסה. בדמי לידה מסמנים סוג 9; מצרפים לדוח כמסמך, לא כנספח משודר.', status: 'verified' },
    { term: 'הפרשי דמי לידה', plain: 'תשלום נוסף אחרי חישוב מחדש — בעיקר לעצמאית אחרי שומה. לכל תשלום תאריך וסכום משלו.', status: 'interpretation' },
  ],
  thinking: [
    { q: 'דרך מי שולם — ב״ל ישירות או המעסיק?', why: 'דרך המעסיק — כבר ב-106; ישירות — שדה נפרד (194 לשכירה, 250 לעצמאית).', status: 'verified' },
    { q: 'התקופה חוצה שנה?', why: 'רק אז יש מה לפרוס. התאריכים — מהודעת ב״ל.', status: 'verified' },
    { q: 'בשנת הקבלה ההכנסה במדרגה גבוהה יותר?', why: 'פורסים כשסך המס בשתי השנים יורד; לשים לב לנקודות זיכוי שלא ינוצלו.', status: 'interpretation' },
  ],
  mistakes: [
    { wrong: 'לרשום דמי לידה של עצמאית עם הכנסת העסק (150/170).', right: '250/270 — שדה נפרד.', status: 'verified' },
    { wrong: 'לחלק לפי 105 ימים תמיד.', right: 'לפי ימי הזכאות שבהודעת ב״ל — 56, 105 או יותר עם הארכות.', status: 'verified' },
    { wrong: 'לפרוס קדימה ולשכוח את הדוח של השנה הבאה.', right: 'פריסה קדימה = דוח חובה לכל שנת פריסה.', status: 'verified' },
  ],
};

export const MATERNITY_TOC: TocItem[] = [
  { id: 'ml-what', label: 'מה זה ולמי רלוונטי', view: 'learn' },
  { id: 'ml-field', label: 'באיזה שדה בדוח', view: 'learn' },
  { id: 'ml-ex', label: 'דוגמה פתורה: לידה שחוצה שנה', view: 'learn' },
  { id: 'ml-exc', label: 'חריגים ומה פתוח', view: 'learn' },
  { id: 'ml-docs', label: 'מסמכים ומה מבקשים', view: 'learn' },
  { id: 'ml-quiz', label: 'תרגול', view: 'learn' },
  { id: 'ml-116c', label: 'איך ממלאים 116ג — צעד אחר צעד', view: 'apply' },
  { id: 'ml-do', label: 'מה עושים בתיק', view: 'apply' },
  { id: 'ml-src', label: 'העמקה ומקורות', view: 'learn' },
];

const DAY = 864e5;
const parse = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(`${s}T00:00:00Z`) : NaN);
/** ימי זכאות בכל שנה — כולל שני הקצוות, כמו בדוגמאות הרשמיות ובנייר העבודה. */
export function splitByYear(from: string, to: string, amount: number, tax: number): { year: number; days: number; income: number; tax: number }[] {
  const a = parse(from), b = parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return [];
  const total = Math.round((b - a) / DAY) + 1;
  const out: { year: number; days: number; income: number; tax: number }[] = [];
  for (let y = new Date(a).getUTCFullYear(); y <= new Date(b).getUTCFullYear(); y++) {
    const s = Math.max(a, Date.UTC(y, 0, 1)), e = Math.min(b, Date.UTC(y, 11, 31));
    const days = Math.round((e - s) / DAY) + 1;
    out.push({ year: y, days, income: Math.round((amount * days / total) * 10) / 10, tax: Math.round((tax * days / total) * 10) / 10 });
  }
  return out;
}

const IMG = '/forms/2025/116c/examples';
const nis = (n: number) => n.toLocaleString('he-IL', { maximumFractionDigits: 1 });

const QUIZ = [
  { q: 'עצמאית קיבלה דמי לידה מב״ל. לאיזה שדה ב-1301?', options: [{ text: '150/170 — עם הכנסת העסק', right: false }, { text: '250/270', right: true }, { text: '194/196', right: false }], why: 'גמלה בשל הכנסה כעצמאית — 250/270, בנפרד מהעסק. 194/196 — לשכירה שהגמלה לא נכללה ב-106.', level: 'יסוד' as const },
  { q: 'תקופת הזכאות מ-1.11.2024 עד 13.2.2025, ושולם הכול בנובמבר 2024. כמה מהסכום משויך ל-2024 אם מבקשים פריסה?', options: [{ text: 'הכול — שנת הקבלה', right: false }, { text: '61/105', right: true }, { text: 'חצי', right: false }], why: 'ימי הזכאות ב-2024 (מ-1.11 עד 31.12, כולל שני הקצוות) = 61 מתוך 105. גם המס שנוכה מתחלק באותו יחס. זו הדוגמה ב«דע זכויותיך» 2025.', level: 'יישום' as const },
  { q: 'ביקשה פריסה קדימה ל-2026. מה זה מחייב?', options: [{ text: 'כלום — הסימון מספיק', right: false }, { text: 'דוח שנתי גם ל-2026', right: true }, { text: 'דוח מתוקן ל-2025', right: false }], why: 'בפריסה קדימה חובה להגיש דוח לכל שנה שאליה יוחסה ההכנסה — גם מי שלא חייבת בדוח (הצהרה 1 בטופס 116ג).', level: 'יסוד' as const },
];

export default function MaternityBody({ year, view }: TopicBodyProps) {
  const learn = view !== 'apply';
  const apply = view !== 'learn';
  // מחשבון: ברירת המחדל — נייר העבודה של גיא
  const [from, setFrom] = useState('2023-12-08');
  const [to, setTo] = useState('2024-03-21');
  const [amount, setAmount] = useState(39_942);
  const [tax, setTax] = useState(256);
  const rows = useMemo(() => splitByYear(from, to, amount, tax), [from, to, amount, tax]);
  const totalDays = rows.reduce((n, r) => n + r.days, 0);

  return (
    <>
      {learn && <>
        <Sec id="ml-what" title="מה זה ולמי רלוונטי">
          <ul className="kn-small">
            <li>דמי לידה מביטוח לאומי הם <b>הכנסה חייבת</b>. ב״ל מנכה מהם מס הכנסה ודמי ביטוח (חוק ב״ל ס׳ 53(ד)). <ClaimTag status="verified" /></li>
            <li><b>מענק לידה</b> — פטור, ואינו כאן: הוא בחלק י (הכנסות פטורות). <ClaimTag status="verified" /></li>
            <li><b>התקופה אינה תמיד 105 ימים:</b> 105 ימים (15 שבועות) באכשרה של 10 מתוך 14 חודשים או 15 מתוך 22; 56 ימים (8 שבועות) באכשרה של 6 מתוך 14. ויש הארכות — לידה מרובה (3 שבועות לכל ילד נוסף), אשפוז יולדת (עד 4 שבועות), אשפוז הילד, ומ-1.4.2026 גם מוגבלות מורכבת. <ClaimTag status="verified" /></li>
            <li><b>יום הזכאות הראשון</b> — לפי הפסקת העבודה, ולא לפני 53 ימים (חופשה מלאה) או 28 ימים (חלקית) לפני הלידה. <ClaimTag status="verified" /></li>
            <li><b>הסכום:</b> הגבוה מבין ממוצע 3 החודשים (÷ 90) או 6 החודשים (÷ 180) שלפני הפסקת העבודה; מקסימום 1,752.33 ₪ ליום (ערך מאתר ב״ל, 2026). <ClaimTag status="verified" /></li>
            <li><b>עצמאית — בשני שלבים:</b> תחילה לפי המקדמות או השומה הקודמת, ואחרי השומה לשנת הפסקת העבודה — חישוב מחדש, ולכן לעיתים <b>הפרשים</b> בשנה מאוחרת. לידה בינואר-פברואר — הבסיס נפרס על שתי שנות מס. <ClaimTag status="verified" /></li>
          </ul>
          <p className="kn-small"><b>למי זה רלוונטי:</b> כל לקוחה (או לקוח) שקיבלה דמי לידה השנה. <b>הפריסה</b> — רק כשתקופת הזכאות חוצה שנת מס, ורק כשהיא משתלמת (ראו «חריגים»).</p>
          <Glossary terms={MATERNITY_LESSON.glossary} year={year} />
          <Legend />
        </Sec>

        <Sec id="ml-field" title="באיזה שדה בדוח">
          <div className="kn-tbl-wrap">
            <table className="kn-tbl">
              <thead><tr><th>מצב</th><th>ההכנסה</th><th>המס שנוכה</th></tr></thead>
              <tbody>
                <tr><td>עצמאית</td><td><b dir="ltr">250</b> / <b dir="ltr">270</b> (בן/בת הזוג) <ClaimTag status="verified" /></td><td><b dir="ltr">040</b> <ClaimTag status="interpretation" /></td></tr>
                <tr><td>שכירה — ב״ל שילם ישירות (לא דרך המעסיק)</td><td><b dir="ltr">194</b> / <b dir="ltr">196</b> <ClaimTag status="verified" /></td><td><b dir="ltr">040</b> <ClaimTag status="interpretation" /></td></tr>
                <tr><td>שולם דרך המעסיק — מופיע ב-106</td><td><b dir="ltr">158</b> / <b dir="ltr">172</b> — כבר בתוך 106; לא מוסיפים שוב <ClaimTag status="verified" /></td><td><b dir="ltr">042</b> (מ-106) <ClaimTag status="verified" /></td></tr>
                <tr><td>עסק זעיר</td><td><b dir="ltr">250</b> / <b dir="ltr">270</b> — מחוץ למחזור ובלי ניכוי 30% <ClaimTag status="verified" /></td><td><b dir="ltr">040</b> <ClaimTag status="interpretation" /></td></tr>
              </tbody>
            </table>
          </div>
          <ul className="kn-small">
            <li><b>סימון «מבקש/ת פריסת דמי לידה לשנה הבאה»</b> (1301/2025, חלק א׳ סעיף 17): ב-2025 <b>חובה</b> לסמן כן או לא כשהתקבלו דמי לידה — ב״ל מעביר את הנתון ישירות לרשות (מדריך 1301 עמ׳ 6). <ClaimTag status="verified" /></li>
            <li>040 למס מדמי לידה (ולא 042) — <b>פרשנות חזקה</b>: 042 מוגדר «מצ״ב טופסי 106», ומילואים ופגיעה בעבודה מפורשים ב-040. <ClaimTag status="interpretation" /></li>
            <li>עצמאית: בב״ל חודשי הלידה <b>אינם</b> חודשי עיסוק לפריסת ההכנסה שלה; אבל לצורך הטבות הפנסיה במס הכנסה הם <b>כן</b> נחשבים חודשי עבודה. אין שדה בדוח שמקבל «0». <ClaimTag status="verified" /></li>
          </ul>
          <strong className="kn-small">איך חושבים</strong>
          <Thinking steps={MATERNITY_LESSON.thinking} year={year} />
          <p className="kn-xs kn-muted">על הטופס עצמו: מס › ידע מקצועי › דוח שנתי — לחצו על 250, 194, 040 או על סימון הפריסה בעמ׳ 1; משם «טופס קשור: 116ג».</p>
        </Sec>

        <Sec id="ml-ex" title="דוגמה פתורה: לידה שחוצה שנה">
          <p className="kn-small">נייר העבודה של המשרד (מספרי תרגיל): עצמאית וגם שכירה. תקופת הזכאות לפי הודעת ב״ל — <b>08.12.2023 עד 21.03.2024</b>, 105 ימים. דמי לידה <b>39,942 ₪</b>, מס שנוכה <b>256 ₪</b>.</p>
          <div className="kn-tbl-wrap">
            <table className="kn-tbl">
              <thead><tr><th>שנה</th><th>ימי זכאות</th><th>הכנסה משויכת</th><th>מס משויך</th></tr></thead>
              <tbody>
                <tr><td>2023</td><td>24 (מ-8.12 עד 31.12, כולל שני הקצוות)</td><td>39,942 × 24/105 = <b>9,129.6</b></td><td>256 × 24/105 = <b>58.5</b></td></tr>
                <tr><td>2024</td><td>81 (31 + 29 בשנה מעוברת + 21)</td><td>39,942 × 81/105 = <b>30,812.4</b></td><td>256 × 81/105 = <b>197.5</b></td></tr>
              </tbody>
            </table>
          </div>
          <ul className="kn-small">
            <li>החלוקה <b>יחסית לימי הזכאות בכל שנה</b>, וגם המס שנוכה מתחלק באותו יחס — כך בחוזר 2/2022 (סעיף 7) ובדוגמה ב«דע זכויותיך» 2025 (61/105 ו-44/105). <ClaimTag status="verified" /></li>
            <li><b>105 אינו קבוע:</b> המונה והמכנה הם ימי הזכאות שבהודעת ב״ל — 56 באכשרה חלקית, ויותר עם הארכות. <ClaimTag status="verified" /></li>
            <li>עיגול (59 ו-197 בטופס): אין כלל עיגול רשמי; «חצי מעלה» לשנה הראשונה והשארית לשנייה — סביר. <ClaimTag status="interpretation" /></li>
          </ul>
          <figure className="kn-fig" style={{ margin: '8px 0' }}>
            <img src={`${IMG}/btl-notice.webp`} alt="הודעת ב״ל «תביעה לתשלום הפרשי דמי לידה»: תקופה מ-08.12.2023 עד 21.03.2024, 105 ימים, 39,942 ₪ (שם המעסיק הוסתר)" loading="lazy" style={{ maxWidth: '100%', border: '1px solid var(--bd)', borderRadius: 8 }} />
            <figcaption className="kn-xs kn-muted">הודעת החישוב של ב״ל — מכאן התאריכים «מ… עד…» ומספר הימים. בסיס משולב: 23,886 מעסק ו-10,350 משכר (שם המעסיק הוסתר).</figcaption>
          </figure>
          <figure className="kn-fig" style={{ margin: '8px 0' }}>
            <img src={`${IMG}/btl-annual.webp`} alt="אישור שנתי למס הכנסה לשנת 2023 — תקבולי אמהות: 39,942 ₪ ברוטו, 256 ₪ מס" loading="lazy" style={{ maxWidth: '100%', border: '1px solid var(--bd)', borderRadius: 8 }} />
            <figcaption className="kn-xs kn-muted">האישור השנתי של ב״ל — הסכום ברוטו והמס שנוכה.</figcaption>
          </figure>
          <div className="kn-box" data-ml-calc>
            <strong className="kn-small">מחשבון — חלוקה לפי ימי הזכאות</strong>
            <div className="kn-row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <label className="kn-field">מתאריך<input type="date" value={from} onChange={e => setFrom(e.target.value)} data-ml-from /></label>
              <label className="kn-field">עד תאריך<input type="date" value={to} onChange={e => setTo(e.target.value)} data-ml-to /></label>
              <label className="kn-field">דמי לידה (₪)<input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(+e.target.value || 0)} data-ml-amount /></label>
              <label className="kn-field">מס שנוכה (₪)<input type="number" inputMode="decimal" value={tax} onChange={e => setTax(+e.target.value || 0)} data-ml-tax /></label>
            </div>
            {rows.length ? (
              <table className="kn-tbl" data-ml-result>
                <thead><tr><th>שנה</th><th>ימים</th><th>הכנסה</th><th>מס</th></tr></thead>
                <tbody>{rows.map(r => <tr key={r.year} data-ml-year={r.year}><td>{r.year}</td><td>{r.days}</td><td>{nis(r.income)}</td><td>{nis(r.tax)}</td></tr>)}</tbody>
              </table>
            ) : <p className="kn-small kn-muted">יש להזין תאריכים תקינים (עד ≥ מ).</p>}
            <p className="kn-xs kn-muted" style={{ margin: 0 }}>סה״כ {totalDays} ימי זכאות. התאריכים — מהודעת ב״ל; הפרשים ששולמו מאוחר — כל תשלום בנפרד (ראו «חריגים»). המחשבון מראה את החלוקה, לא אם כדאי לפרוס.</p>
          </div>
        </Sec>

        <Sec id="ml-exc" title="חריגים ומה פתוח">
          <ul className="kn-small">
            <li><b>מתי הפריסה כדאית:</b> רק כשבשנת הקבלה ההכנסה (עם דמי הלידה) מגיעה למדרגה גבוהה מבשנה האחרת. משווים את <b>סך המס בשתי השנים</b> בשתי החלופות — הכול בשנת הקבלה מול חלוקה לפי ימים — ושמים לב לנקודות זיכוי שלא ינוצלו בשנה חלשה. בלי הכנסה צפויה בשנה האחרת — אין על מה לחשב. <ClaimTag status="interpretation" /></li>
            <li><b>עם דחיית נקודת זיכוי ללידה (116ד)</b> — שתי ההחלטות מעבירות מס לאותה שנה; לחשב אותן יחד. <ClaimTag status="interpretation" /></li>
            <li><b>קדימה מול אחורה:</b> קדימה — מסמנים «כן» בדוח של שנת הקבלה ומצרפים 116ג; בשנה העוקבת מדווחים את החלק שלה. אחורה — אין סימון ב-1301: מגישים או מתקנים את הדוח של השנה הקודמת עם החלק המשויך ומצרפים 116ג. <ClaimTag status="interpretation" /></li>
            <li><b>מי שלא חייבת בדוח:</b> הפריסה נעשית דרך בקשת החזר לשתי השנים, או שהיא בוחרת במסלול החייבים ומתחייבת בדוח לשנה העוקבת (חוזר 2/2022, סעיף 7.1ב). <ClaimTag status="verified" /></li>
            <li><b>מילואים:</b> לפי החוזר (סעיף 7א) — פריסה אחורה בלבד, ולא קדימה. <ClaimTag status="interpretation" /></li>
            <li><b>שכירה וגם עצמאית — 250 או 194?</b> לא נמצא מקור שמכריע. הצעה: לפצל לפי חלקי הבסיס בהודעת ב״ל (בדוגמה 23,886 מעסק מול 10,350 משכר); כשהאישור של ב״ל מסווג אחרת — הוא גובר. <ClaimTag status="open" /></li>
            <li><b>הפרשי דמי לידה</b> ששולמו בשנה אחרת (בעיקר לעצמאית אחרי שומה) — אין הוראה מפורשת. לכל תשלום — תאריך, תקופה וסכום בנפרד; לא לפצל אוטומטית. <ClaimTag status="open" /></li>
            <li><b>030 מדמי הביטוח שנוכו מדמי הלידה</b> — שאילתת DF מציגה אותם, האישור השנתי לא; לא מוסיפים אוטומטית. <ClaimTag status="open" /></li>
          </ul>
          <strong className="kn-small">טעויות נפוצות</strong>
          <Mistakes items={MATERNITY_LESSON.mistakes} year={year} />
        </Sec>

        <Sec id="ml-docs" title="מסמכים ומה מבקשים">
          <ul className="kn-small">
            <li><b>אישור שנתי למס הכנסה — «תקבולי אמהות»</b> (ברוטו ומס שנוכה). המשרד יכול להפיק אותו ב«מערכת ייצוג לקוחות» של ב״ל. <ClaimTag status="interpretation" /></li>
            <li><b>הודעת החישוב של ב״ל</b> עם התקופה («מ… עד…») ומספר הימים — מהלקוחה. מאיפה בדיוק מורידים אותה באזור האישי — <ClaimTag status="open" />.</li>
            <li><b>116ג חתום</b> — כשמבקשים פריסה.</li>
          </ul>
          <p className="kn-small"><b>הנוסח ללקוחה:</b> «ההודעה מביטוח לאומי על חישוב דמי הלידה — עם התאריכים "מ… עד…" ומספר הימים».</p>
        </Sec>

        <Sec id="ml-quiz" title="תרגול"><Quiz items={QUIZ} /></Sec>
      </>}

      {apply && <>
        <Sec id="ml-116c" title="איך ממלאים 116ג — צעד אחר צעד">
          <p className="kn-small">טופס 116ג (12.2023) — «בקשה לפריסה על-פי סעיף 8(ג)». לדמי לידה זו <b>הקלה מנהלית</b> לפי חוזר 2/2022 (סעיף 7) — לא סעיף 8(ג) עצמו; ולכן לכתוב «8(ג)» ולא «8ג» (שהוא סעיף אחר). הטופס אינו נספח משודר — מצרפים אותו לדוח כמסמך. <ClaimTag status="verified" /></p>
          <ol className="kn-small" data-ml-steps>
            <li><b>חלק א׳</b> — פרטי המבקשת.</li>
            <li><b>חלק ב׳</b> — מסמנים <b>9 «דמי לידה / מילואים מביטוח לאומי»</b>. שם המשלם: ביטוח לאומי. סכום ההכנסה — מהאישור השנתי; תאריך התשלום; התקופה — «תאריך התחלה» ו«תאריך סיום» מהודעת ב״ל.</li>
            <li><b>חלק ג׳</b> — מקיפים <b>«קדימה»</b> או <b>«אחורה»</b>. לכל שנה: שנת הפריסה, <b>חלק ההכנסה המיוחס</b> (לפי ימי הזכאות), והכנסה ודאית או צפויה באותה שנה (הערה 10 — עם מסמכים מאמתים).</li>
            <li><b>חלק ד׳</b> — הצהרה 1: בפריסה קדימה — דוח שנתי לכל אחת משנות הפריסה.</li>
            <li><b>חתימה</b>, ומצרפים לדוח של שנת הקבלה (או במהלך השנה, בתיאום מס). «הוגשה בקשה» אינו «ניתן אישור».</li>
          </ol>
          <figure className="kn-fig" style={{ margin: '8px 0' }}>
            <img src={`${IMG}/116c-filled.webp`} alt="טופס 116ג מולא בתרגיל: סעיף 9 מסומן, «קדימה» מוקף, 9,130 ל-2023 ו-30,812 ל-2024" loading="lazy" style={{ maxWidth: '100%', border: '1px solid var(--bd)', borderRadius: 8 }} />
            <figcaption className="kn-xs kn-muted">מהתרגיל: חלקים ב׳ ו-ג׳ — סעיף 9, «קדימה», 9,130 ל-2023 ו-30,812 ל-2024. זו בקשה שמולאה, לא אישור.</figcaption>
          </figure>
          <p className="kn-xs kn-muted">הטופס הרשמי עם סימון על כל שדה: מס › ידע מקצועי › דוח שנתי › «נספחים נוספים…» › 116ג.</p>
        </Sec>

        <Sec id="ml-do" title="מה עושים בתיק">
          <ol className="kn-small">
            <li>לשאול: התקבלו דמי לידה? התקופה (מ… עד…), תאריך התשלום, האם דרך המעסיק (ב-106), שכירה או עצמאית, והכנסה צפויה בשנה האחרת.</li>
            <li>לבקש את האישור השנתי ואת הודעת החישוב.</li>
            <li>לסווג לשדה (250/270, 194/196 או 158/172) ואת המס ל-040 (או 042 כשב-106).</li>
            <li>תקופה שחוצה שנה: לחשב את שתי החלופות, להחליט, ולסמן בדוח «מבקש/ת פריסה» — כן או לא (חובה ב-2025).</li>
            <li>בפריסה: למלא 116ג, לצרף, ולרשום משימה — <b>«דוח חובה לשנה הבאה»</b> עם החלק המשויך והמס. המערכת עוד לא זוכרת את זה לבד.</li>
          </ol>
        </Sec>
      </>}

      {learn && (
        <Sec id="ml-src" title="העמקה ומקורות">
          <ul className="kn-small">
            <li>מדריך 1301 לשנת 2025 — עמ׳ 6 (סימון הפריסה, חובה), עמ׳ 11 ו-12 (250/270, 194/196). <ClaimTag status="verified" /></li>
            <li>«דע זכויותיך וחובותיך» 2025 — עמ׳ 21 (סעיף 17) ועמ׳ 30 (דמי לידה ומילואים, הדוגמה 61/105). <ClaimTag status="verified" /></li>
            <li>חוזר מס הכנסה 2/2022 «סעיף 8(ג) — פריסת הכנסה», סעיפים 7 ו-7א (עדכון 07.04.2024). <ClaimTag status="interpretation" /> מקור משני (עותק).</li>
            <li>טופס 116ג, גרסה 12.2023, ודברי ההסבר (סעיף 9). <ClaimTag status="verified" /></li>
            <li>חוק ביטוח לאומי ס׳ 50 (תקופות), 53(ד) (ניכוי מס); אתר ב״ל — דמי לידה (ערכי 2026). <ClaimTag status="verified" /></li>
            <li>המחקר: <code>docs/tax-foundation/research/ni-benefits-withholding-2026-10-16.md</code> (R04, R05, C16, C21) ו-<code>spreading-deferral-continuity-2026-10-16.md</code> (§2 ו-§3).</li>
          </ul>
        </Sec>
      )}
    </>
  );
}
