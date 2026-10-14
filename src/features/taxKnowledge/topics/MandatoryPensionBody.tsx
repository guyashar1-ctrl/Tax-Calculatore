// ─── פנסיית חובה לעצמאים — מספר החובה מול תקרת ההטבה ─────────────────────────
// ‼ 11.10.2026: «ללמוד» — מושגים, איך חושבים, חישוב החובה בשתי מדרגות, דוגמאות
// פתורות (כולל הקשר להטבת המס), טעויות ותרגול; «בתיק» — מה עושים ביד.
// התוכן והסטטוס של כל טענה — lessonsMore.ts.

import { useState } from 'react';
import { ruleView, num } from '../../taxRules/registry';
import { pensionTrackA } from '../../taxRules/calc';
import { RV, fmtNis } from '../RuleBits';
import { Sec, Quiz, NumField, type TopicBodyProps, type TocItem } from './shared';
import { Glossary, Thinking, Mistakes, SolveFirst, ClaimTag, Legend } from './lesson';
import { MANDATORY_LESSON } from './lessonsMore';

export const MANDATORY_TOC: TocItem[] = [
  { id: 'mp-0', label: 'מושגי יסוד', view: 'learn' }, { id: 'mp-1', label: 'חובה מול הטבה', view: 'learn' },
  { id: 'mp-think', label: 'איך חושבים', view: 'learn' }, { id: 'mp-2', label: 'מחשבון', view: 'learn' },
  { id: 'mp-ex', label: 'דוגמאות פתורות', view: 'learn' }, { id: 'mp-3', label: 'מי חייב ומי פטור', view: 'learn' },
  { id: 'mp-mis', label: 'טעויות נפוצות', view: 'learn' }, { id: 'mp-8', label: 'תרגול', view: 'learn' },
  { id: 'mp-4', label: 'מה עושים בתיק', view: 'apply' },
];

// ‼ הדוגמאות לשנת 2025: מחצית השכר הממוצע והשיעורים רשמיים מהמדריך. ב-2026 מחצית
// השכר הממוצע נגזרת מנתון ב״ל — טובה להמחשה, לא לדוגמה פתורה.
const EX_YEAR = 2025;
const pctOf = (id: string, y: number) => `${+(num(id, y) * 100).toFixed(2)}%`;

/** החובה בשתי מדרגות: שיעור מופחת עד מחצית השכר הממוצע, גבוה מעליה ועד השכר הממוצע. מעל — אין. */
function obligation(income: number, half: number, lowRate: number, highRate: number) {
  const lowBase = Math.min(Math.max(income, 0), half);
  const highBase = Math.min(Math.max(income - half, 0), half);
  const low = Math.round(lowBase * lowRate);
  const high = Math.round(highBase * highRate);
  return { lowBase, highBase, low, high, total: low + high, above: Math.max(income - 2 * half, 0) };
}
const ob = (income: number) => obligation(income, num('pen.mandatory.halfWage', EX_YEAR), num('pen.mandatory.lowRate', EX_YEAR), num('pen.mandatory.highRate', EX_YEAR));

export default function MandatoryPensionBody({ year, view }: TopicBodyProps) {
  const [income, setIncome] = useState(120_000);
  const hv = ruleView('pen.mandatory.halfWage', year);
  const half = typeof hv?.entry?.value === 'number' ? hv.entry.value : 0;
  const lowRate = Number(ruleView('pen.mandatory.lowRate', year)?.entry?.value ?? 0);
  const highRate = Number(ruleView('pen.mandatory.highRate', year)?.entry?.value ?? 0);
  const live = obligation(income, half, lowRate, highRate);
  const weak = !hv?.exactYear || hv?.entry?.basis !== 'primary' || !ruleView('pen.mandatory.lowRate', year)?.exactYear;
  const learn = view !== 'apply';
  const apply = view !== 'learn';

  const halfEx = num('pen.mandatory.halfWage', EX_YEAR);
  const ex1 = ob(60_000), ex2 = ob(120_000), ex3 = ob(200_000);
  const ex4 = pensionTrackA({ year: EX_YEAR, nonWorkIncome: 120_000, deposits: ex2.total, scenario: { noWorkIncome: true, under50: true, beneficialMember: false } }).value;

  return (
    <>
      {learn && <>
        <Sec id="mp-0" title="מושגי יסוד">
          <p className="kn-small kn-muted" style={{ margin: 0 }}>שבעה מושגים. החשוב שבהם: מחצית השכר הממוצע — הגבול בין שתי המדרגות.</p>
          <Glossary terms={MANDATORY_LESSON.glossary} year={EX_YEAR} />
          <Legend />
        </Sec>

        <Sec id="mp-1" title="חובה מול הטבה — שני מספרים שונים">
          <p className="kn-oneliner">עצמאי חייב להפקיד לקצבה לפחות שיעור מינימלי מהכנסתו, עד גובה השכר הממוצע. זה <strong>מספר החובה</strong> — לא התקרה שמעניקה הטבת מס, שגבוהה ממנו בהרבה.</p>
          <div className="kn-three">
            <div className="kn-box"><span className="kn-eyebrow">חובה</span><strong>כמה חייבים</strong><span className="kn-small">לפי חוק פנסיה חובה לעצמאים. נמדד במחצית השכר הממוצע. <ClaimTag status="verified" /></span></div>
            <div className="kn-box"><span className="kn-eyebrow now">הטבה</span><strong>כמה כדאי</strong><span className="kn-small">ניכוי וזיכוי לפי פקודת מס הכנסה, עד התקרות של נושא «פנסיה לעצמאי». <ClaimTag status="verified" /></span></div>
            <div className="kn-box"><span className="kn-eyebrow later">בפועל</span><strong>אותה הפקדה</strong><span className="kn-small">מה שמופקד בשביל החובה מקבל גם את ההטבה. הפקדה מעל החובה — רק בגלל ההטבה. <ClaimTag status="interpretation" /></span></div>
          </div>
        </Sec>

        <Sec id="mp-think" title="איך חושבים על פנסיית חובה">
          <p className="kn-small kn-muted" style={{ margin: 0 }}>קודם האם החובה חלה, אחר כך כמה, ורק בסוף — אם כדאי יותר.</p>
          <Thinking steps={MANDATORY_LESSON.thinking} year={EX_YEAR} />
        </Sec>

        <Sec id="mp-2" title="כמה חייבים להפקיד">
          <p className="kn-small kn-muted" style={{ margin: 0 }}><RV id="pen.mandatory.rates" year={year} />. מחצית השכר הממוצע: <RV id="pen.mandatory.halfWage" year={year} /> בשנה.</p>
          <div className="kn-sim">
            <NumField id="mp-inc" label="הכנסה חייבת בהפקדה (שנתי)" value={income} onChange={setIncome} max={250_000} step={500} />
            <div className="kn-page" style={{ gap: 8 }}>
              <div className="kn-two">
                <div className="kn-box"><span className="kn-eyebrow">חובה</span><span className="kn-big">{fmtNis(live.total)}</span><span className="kn-xs kn-muted">{fmtNis(live.low)} בשיעור <RV id="pen.mandatory.lowRate" year={year} /> + {fmtNis(live.high)} בשיעור <RV id="pen.mandatory.highRate" year={year} /></span></div>
                <div className="kn-box"><span className="kn-eyebrow now">בלי חובה</span><span className="kn-big">{fmtNis(live.above)}</span><span className="kn-xs kn-muted">ההכנסה שמעל השכר הממוצע. תקרת ההטבות — ראו «פנסיה לעצמאי».</span></div>
              </div>
              {weak && <p className="kn-soft">מחצית השכר הממוצע ל-{year} — חושבה מנתון ב״ל, לא מהמדריך. המחשה בלבד.</p>}
            </div>
          </div>
        </Sec>

        <Sec id="mp-ex" title="דוגמאות פתורות">
          <p className="kn-small kn-muted" style={{ margin: 0 }}>מהקל לקשה, לפי ערכי {EX_YEAR} (המדריך הרשמי). מחצית השכר הממוצע: {fmtNis(halfEx)}; השכר הממוצע: {fmtNis(2 * halfEx)}.</p>
          <div className="kn-solves">
            <SolveFirst level="יסוד" status="verified" title="1. הכנסה במדרגה הראשונה"
              facts={<>עצמאי בן 35, הכנסה שנתית מהעסק {fmtNis(60_000)}.</>}
              ask="כמה הוא חייב להפקיד לקצבה?"
              steps={[
                { label: `כל ההכנסה מתחת ל-${fmtNis(halfEx)}`, value: fmtNis(ex1.lowBase) },
                { label: `× ${pctOf('pen.mandatory.lowRate', EX_YEAR)}`, value: fmtNis(ex1.low) },
                { label: 'מדרגה שנייה', value: fmtNis(ex1.high) },
              ]}
              answer={<>{fmtNis(ex1.total)} בשנה.</>} />
            <SolveFirst level="יישום" status="verified" title="2. הכנסה בשתי המדרגות"
              facts={<>עצמאית בת 42, הכנסה שנתית {fmtNis(120_000)}.</>}
              ask="כמה היא חייבת להפקיד?"
              steps={[
                { label: `מדרגה ראשונה: ${fmtNis(ex2.lowBase)} × ${pctOf('pen.mandatory.lowRate', EX_YEAR)}`, value: fmtNis(ex2.low) },
                { label: `מדרגה שנייה: (120,000 − ${fmtNis(halfEx)}) × ${pctOf('pen.mandatory.highRate', EX_YEAR)}`, value: fmtNis(ex2.high) },
                { label: 'סה״כ', value: fmtNis(ex2.total) },
              ]}
              answer={<>{fmtNis(ex2.total)} בשנה — לא {pctOf('pen.mandatory.highRate', EX_YEAR)} מכל ההכנסה ({fmtNis(120_000 * num('pen.mandatory.highRate', EX_YEAR))}).</>} />
            <SolveFirst level="מתקדם" status="verified" title="3. הכנסה מעל השכר הממוצע"
              facts={<>עצמאי בן 50, הכנסה שנתית {fmtNis(200_000)}.</>}
              ask="על איזה חלק מההכנסה יש חובה, וכמה?"
              steps={[
                { label: 'מדרגה ראשונה (עד מחצית השכר הממוצע)', value: fmtNis(ex3.low) },
                { label: `מדרגה שנייה — רק עד השכר הממוצע (${fmtNis(ex3.highBase)})`, value: fmtNis(ex3.high) },
                { label: `מעל ${fmtNis(2 * halfEx)} — בלי חובה`, value: fmtNis(ex3.above) },
              ]}
              answer={<>{fmtNis(ex3.total)} בשנה. זה גם הסכום המרבי של החובה ב-{EX_YEAR}, לכל הכנסה גבוהה יותר.</>} />
            {ex4 && <SolveFirst level="מתקדם" status="verified" title="4. החובה מול הטבת המס"
              facts={<>העצמאית מדוגמה 2: בלי משכורת, מתחת לגיל 50, לא עמית מוטבת. היא הפקידה בדיוק את החובה — {fmtNis(ex2.total)}.</>}
              ask="כמה מההפקדה מנוכה, וכמה עובר לזיכוי? האם «מיצתה את ההטבה»?"
              steps={[
                { label: `מסלול א׳: ניכוי בסיסי ${pctOf('pen.trackA.baseRate', EX_YEAR)} × 120,000`, value: fmtNis(ex4.baseDeduction) },
                { label: `תוספת: ההפקדה לא עולה על ${pctOf('pen.trackA.extraThreshold', EX_YEAR)} מההכנסה`, value: fmtNis(ex4.extraDeduction) },
                { label: 'ניכוי', value: fmtNis(ex4.deduction) },
                { label: 'עובר לחישוב הזיכוי', value: fmtNis(ex4.toCredit) },
              ]}
              answer={<>ניכוי {fmtNis(ex4.deduction)}, ו-{fmtNis(ex4.toCredit)} לזיכוי. היא <strong>לא</strong> מיצתה את ההטבה: הפקדה גבוהה מ-{pctOf('pen.trackA.extraThreshold', EX_YEAR)} מההכנסה הייתה מזכה בתוספת ניכוי.</>}
              note="החישוב לפי נושא «פנסיה לעצמאי» (מסלול א׳, מדריך 2025). תקרת הזיכוי לא מחושבת כאן." />}
          </div>
        </Sec>

        <Sec id="mp-3" title="מי חייב, מי פטור, ומה אם לא מפקידים">
          <div className="kn-two">
            <div className="kn-box"><strong>גיל <ClaimTag status="verified" /></strong><span className="kn-small">מגיל 21 ועד גיל פרישה מוקדמת. מי שמלאו לו 55 ביום 1.1.2017 — פטור.</span></div>
            <div className="kn-box"><strong>הפקדות כשכיר <ClaimTag status="open" /></strong><span className="kn-small">«הפקדות כשכיר מנוכות מהחובה», «פטור מלא כשההפקדה כשכיר מגיעה לסכום מסוים» — טענות במסמכי המשרד, לא נבדקו במקור רשמי.</span></div>
            <div className="kn-box"><strong>קנס <ClaimTag status="verified" /></strong><span className="kn-small"><RV id="pen.mandatory.fine" year={EX_YEAR} /> (מדריך 2025), אחרי התראה שלא נענתה. צמוד למדד לפי החוק.</span></div>
            <div className="kn-box"><strong>סכום מעודכן ואכיפה <ClaimTag status="open" /></strong><span className="kn-small">הודעה על הקנס המוצמד ל-2025 ול-2026 לא נמצאה. היקף האכיפה בפועל — לא אומת.</span></div>
          </div>
        </Sec>

        <Sec id="mp-mis" title="טעויות נפוצות">
          <Mistakes items={MANDATORY_LESSON.mistakes} year={EX_YEAR} />
        </Sec>

        <Sec id="mp-8" title="תרגול">
          <Quiz items={[
            { level: 'יסוד', q: 'פנסיית חובה וקרן השתלמות — האם הפקדה לקרן השתלמות נספרת לחובה?', options: [{ text: 'כן', right: false }, { text: 'לא — החובה היא לקופת גמל לקצבה', right: true }], why: 'החובה היא להפקיד לקצבה.' },
            { level: 'יסוד', q: 'עצמאי בן 20. האם החובה חלה עליו?', options: [{ text: 'כן', right: false }, { text: 'לא — היא מתחילה בגיל 21', right: true }], why: 'החובה מגיל 21 ועד גיל פרישה מוקדמת.' },
            { level: 'יישום', q: `הכנסה ${fmtNis(100_000)} ב-${EX_YEAR}. איזה חישוב נכון?`, options: [{ text: `${pctOf('pen.mandatory.highRate', EX_YEAR)} × 100,000`, right: false }, { text: `${pctOf('pen.mandatory.lowRate', EX_YEAR)} עד ${fmtNis(halfEx)}, ו-${pctOf('pen.mandatory.highRate', EX_YEAR)} על השאר`, right: true }], why: `שתי מדרגות. כאן: ${fmtNis(ob(100_000).total)}.` },
            { level: 'יישום', q: 'לקוח הפקיד את מלוא החובה. האם קיבל את מלוא הטבת המס?', options: [{ text: 'כן', right: false }, { text: 'לא בהכרח — תקרת ההטבה היא חישוב אחר', right: true }], why: 'ראו דוגמה 4: בהכנסה של 120,000 החובה נמוכה מסף התוספת בניכוי.' },
            { level: 'מתקדם', q: 'לקוחה שכירה־עצמאית: המעביד מפקיד לה לפנסיה. האם מקזזים את זה מהחובה כעצמאית?', options: [{ text: 'כן, זה הכלל', right: false }, { text: 'לא הוכרע — מציגים את שני המספרים ולא מקזזים', right: true }], why: 'הקיזוז הוא טענה במסמכי המשרד שלא נבדקה במקור רשמי.' },
          ]} />
        </Sec>
      </>}

      {apply && (
        <Sec id="mp-4" title="מה עושים בתיק">
          <div className="kn-inform">
            <div><b>בדוח השנתי</b><span>אין שדה לחובה עצמה. ההפקדה נרשמת בסעיפי הפנסיה (ניכוי וזיכוי) — ראו «פנסיה לעצמאי».</span></div>
            <div><b>בשאלון ללקוח</b><span>תאריך לידה, הכנסה צפויה מהעסק, אישור שנתי מכל קופה לקצבה, והאם יש גם משכורת.</span></div>
            <div><b>בחישוב</b><span>החובה מחושבת לפי מחצית השכר הממוצע של השנה. ב-2026 הנתון נגזר — המחשה בלבד. קיזוז הפקדות כשכיר — לא.</span></div>
          </div>
          <ol className="kn-small kn-steps">
            <li>לבדוק שהחובה חלה: גיל 21 ומעלה, לפני גיל פרישה מוקדמת, ולא מי שמלאו לו 55 ביום 1.1.2017.</li>
            <li>לחשב את החובה לפי ההכנסה הצפויה מהעסק, בשתי המדרגות.</li>
            <li>לבקש מהלקוח את האישור השנתי מהקופה, ולהשוות את ההפקדות כעצמאי לחובה.</li>
            <li>אם יש גם משכורת — להציג את ההפקדות כשכיר בנפרד, בלי לקזז, ולסמן שהשאלה פתוחה.</li>
            <li>בנפרד מהחובה: לבדוק אם כדאי להפקיד יותר בגלל הטבת המס, לפי נושא «פנסיה לעצמאי».</li>
            <li>לומר ללקוח מה חובה ומה כדאי — שני משפטים נפרדים.</li>
          </ol>
        </Sec>
      )}
    </>
  );
}
