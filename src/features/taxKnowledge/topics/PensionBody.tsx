// ─── פנסיה לעצמאי: מסלול א׳, מסלול ב׳ וזיכוי ─────────────────────────────────
// הקושי: אותה הפקדה יכולה לקבל ניכוי (שווה כמו המס השולי) או זיכוי (35% קבוע),
// והניכוי עצמו מחושב באחד משני מסלולים. לכן המבנה כאן הוא החלטה, לא טבלה.
// ‼ 11.10.2026: הנושא מלמד מהבסיס — מושגים, איך חושבים, דוגמאות פתורות, טעויות ותרגול
// («ללמוד»), ומה עושים בתיק («בתיק»). התוכן הטקסטואלי והסטטוס של כל טענה — lessons.ts.

import { useMemo, useState } from 'react';
import { pensionTrackA, beneficialMember } from '../../taxRules/calc';
import { num } from '../../taxRules/registry';
import { RV, Problems, fmtNis } from '../RuleBits';
import { Sec, Quiz, NumField, type TopicBodyProps, type TocItem } from './shared';
import { Glossary, Thinking, Mistakes, SolveFirst, ClaimTag, Legend } from './lesson';
import { PENSION_LESSON } from './lessons';

export const PENSION_TOC: TocItem[] = [
  { id: 'pn-0', label: 'מושגי יסוד', view: 'learn' }, { id: 'pn-2', label: 'שלושה מנגנונים', view: 'learn' },
  { id: 'pn-think', label: 'איך חושבים', view: 'learn' }, { id: 'pn-3', label: 'באיזה מסלול?', view: 'learn' },
  { id: 'pn-4', label: 'מחשבון מסלול א׳', view: 'learn' }, { id: 'pn-ex', label: 'דוגמאות פתורות', view: 'learn' },
  { id: 'pn-5', label: 'ניכוי או זיכוי', view: 'learn' }, { id: 'pn-6', label: 'חריגים', view: 'learn' },
  { id: 'pn-mis', label: 'טעויות נפוצות', view: 'learn' }, { id: 'pn-8', label: 'תרגול', view: 'learn' },
  { id: 'pn-7', label: 'מה עושים בתיק', view: 'apply' },
];

type Ans = 'yes' | 'no' | undefined;

function Choice({ q, value, onChange }: { q: string; value: Ans; onChange: (v: Ans) => void }) {
  return (
    <div className="kn-box">
      <strong className="kn-small">{q}</strong>
      <div className="kn-choice" role="group" aria-label={q}>
        <button type="button" className="btn btn-secondary btn-sm" aria-pressed={value === 'yes'} onClick={() => onChange('yes')}>כן</button>
        <button type="button" className="btn btn-secondary btn-sm" aria-pressed={value === 'no'} onClick={() => onChange('no')}>לא</button>
      </div>
    </div>
  );
}

// ‼ הדוגמאות הפתורות מחושבות מהמרשם לשנת המדריך הרשמי (2025) — לא מספרים בטקסט.
const EX_YEAR = 2025;
const A = (income: number, deposits: number) => pensionTrackA({ year: EX_YEAR, nonWorkIncome: income, deposits, scenario: { noWorkIncome: true, under50: true, beneficialMember: false } }).value;
const pctOf = (id: string) => `${+(num(id, EX_YEAR) * 100).toFixed(2)}%`;
const RATES = [0.1, 0.2, 0.31, 0.35, 0.47];

/** כמה שווה 1,000 ₪ שמנוכים, מול 1,000 ₪ שמקבלים עליהם זיכוי — לפי מדרגה. */
function WorthBars() {
  const credit = num('pen.credit.rate', EX_YEAR);
  const max = Math.max(...RATES, credit);
  return (
    <div className="kn-worth" role="img" aria-label="שווי ניכוי של 1,000 ₪ לפי מדרגת מס, מול זיכוי של 35%">
      {RATES.map(r => (
        <div key={r} className="kn-worth-row">
          <span className="kn-xs">מדרגה {Math.round(r * 100)}%</span>
          <span className="kn-worth-track">
            <span className="kn-worth-bar ded" style={{ inlineSize: `${(r / max) * 100}%` }}>{fmtNis(1000 * r)}</span>
          </span>
          <span className="kn-xs kn-muted">{r > credit ? 'ניכוי שווה יותר' : r < credit ? 'זיכוי שווה יותר' : 'שווה'}</span>
        </div>
      ))}
      <div className="kn-worth-row">
        <span className="kn-xs"><strong>זיכוי</strong></span>
        <span className="kn-worth-track"><span className="kn-worth-bar cred" style={{ inlineSize: `${(credit / max) * 100}%` }}>{fmtNis(1000 * credit)}</span></span>
        <span className="kn-xs kn-muted">בכל מדרגה</span>
      </div>
    </div>
  );
}

export default function PensionBody({ year, ctx, view }: TopicBodyProps) {
  const [salary, setSalary] = useState<Ans>(ctx?.mixed ? 'yes' : undefined);
  const [age50, setAge50] = useState<Ans>(undefined);
  const [deposits, setDeposits] = useState(ctx?.selfEmployedPension || 17_000);
  const [income, setIncome] = useState(100_000);
  const [dep, setDep] = useState(14_500);

  const bm = useMemo(() => beneficialMember({ year, pensionDeposits: deposits }, 'illustration'), [year, deposits]);
  const isBm = bm.ok && bm.value ? bm.value.reached : undefined;
  const trackA = useMemo(() => pensionTrackA({ year, nonWorkIncome: income, deposits: dep, scenario: { noWorkIncome: true, under50: true, beneficialMember: false } }, 'illustration'), [year, income, dep]);

  let verdict: string | null = null;
  if (salary && age50 && isBm !== undefined) {
    if (isBm) verdict = 'עמית מוטב ← הניכוי לפי מסלול ב׳ (שני רבדים). ייתכן שמסלול א׳ עדיף — מסמנים 233/234. הערכת המס מחשבת את מסלול ב׳ ומציגה את החלופה.';
    else if (age50 === 'yes') verdict = salary === 'yes' ? 'לא עמית מוטב, מלאו 50 ויש משכורת ← מסלול א׳ בשיעורים המוגדלים. התקרות בשקלים (11,508 ו-18,084) קבועות ולא קטנות בגלל המשכורת; על משכורת שאינה מבוטחת — 7.5% עד 5,820 (47(ב)(2)). מחושב בהערכת המס. חריג אחד: משכורת מעל 291,000 עם חלק לא מבוטח — לא מחושב.' : 'לא עמית מוטב, מלאו 50 ואין משכורת ← מסלול א׳ בשיעורים המוגדלים, בתוך אותן תקרות בשקלים. מחושב בהערכת המס.';
    else if (salary === 'yes') verdict = 'לא עמית מוטב, ויש משכורת ← מסלול א׳; המשכורת מקטינה את ההכנסה המזכה. על המשכורת שאינה מבוטחת — ניכוי 5% (47(ב)(2)). הערכת המס מחשבת כשידועה ההכנסה המבוטחת (244/245).';
    else verdict = 'לא עמית מוטב, אין משכורת וטרם מלאו 50 ← מסלול א׳. אפשר לחשב במחשבון למטה.';
  }

  const learn = view !== 'apply';
  const apply = view !== 'learn';
  const ex1 = A(100_000, 10_000), ex2 = A(100_000, 14_500), ex3 = A(200_000, 25_000);
  const ceilNonWork = num('pen.qualifying.nonWork', EX_YEAR);

  return (
    <>
      {learn && <>
        <Sec id="pn-0" title="מושגי יסוד">
          <p className="kn-small kn-muted" style={{ margin: 0 }}>תשעה מושגים שחוזרים בכל הנושא. מי שמכיר אותם — יכול לדלג ל«שלושה מנגנונים».</p>
          <Glossary terms={PENSION_LESSON.glossary} year={year} />
          <Legend />
        </Sec>

        <Sec id="pn-2" title="שלושה מנגנונים שלא מתערבבים">
          <div className="kn-three">
            <div className="kn-box"><span className="kn-eyebrow">חובה</span><strong>פנסיית חובה</strong><span className="kn-small">מינימום שחייבים להפקיד. מספר שונה לגמרי מתקרת ההטבה.</span></div>
            <div className="kn-box"><span className="kn-eyebrow now">ניכוי</span><strong>מקטין את ההכנסה</strong><span className="kn-small">שווה כמו המס השולי: במדרגה גבוהה — יותר.</span></div>
            <div className="kn-box"><span className="kn-eyebrow later">זיכוי</span><strong>מקטין את המס</strong><span className="kn-small"><RV id="pen.credit.rate" year={year} /> קבוע, בלי קשר למדרגה. בהכנסה נמוכה הוא לפעמים עדיף.</span></div>
          </div>
        </Sec>

        <Sec id="pn-think" title="איך חושבים על הפקדה לפנסיה של עצמאי">
          <p className="kn-small kn-muted" style={{ margin: 0 }}>הסדר שבו רו״ח עובר על הנתונים. כל שאלה עונה על «למה» — כדי לדעת מה לחפש גם במקרה שלא מופיע כאן.</p>
          <Thinking steps={PENSION_LESSON.thinking} year={year} />
        </Sec>

        <Sec id="pn-3" title="באיזה מסלול הלקוח?">
          <div className="kn-three">
            <Choice q="יש ללקוח משכורת השנה?" value={salary} onChange={setSalary} />
            <Choice q="מלאו לו 50 ביום 1.1 של שנת המס?" value={age50} onChange={setAge50} />
            <div className="kn-box">
              <NumField id="pn-bm" label="כל ההפקדות לקצבה לטובתו השנה (כולל מעביד)" value={deposits} onChange={setDeposits} max={60_000} step={100} />
              {bm.ok && bm.value
                ? <span className="kn-small">רף עמית מוטב: {fmtNis(bm.value.threshold)} → {bm.value.reached ? 'עמית מוטב' : `לא, חסרים ${fmtNis(bm.value.missing)}`}</span>
                : <Problems problems={bm.problems} />}
              <Problems problems={bm.ok ? bm.problems : []} soft />
            </div>
          </div>
          <div className="kn-explain" aria-live="polite">{verdict ?? 'ענו על שלוש השאלות כדי לראות את המסלול.'}</div>
          <p className="kn-xs kn-muted" style={{ margin: 0 }}>האם רכיב הפיצויים של המעביד נספר ברף — לא הוכרע. הפקדות לא עוברות בין בני זוג לצורך עמית מוטב.</p>
        </Sec>

        <Sec id="pn-4" title="מחשבון מסלול א׳ — למי שאין לו משכורת">
          <p className="kn-small kn-muted" style={{ margin: 0 }}>{year === 2025 ? 'ערכי 2025 מהמדריך הרשמי.' : `שנת ${year}: חלק מהערכים נגזרים ולא רשמיים — המחשה בלבד.`} הדוגמאות מהמדריך: הכנסה 100,000 והפקדה 10,000 ← ניכוי 7,000; הפקדה 14,500 ← ניכוי 9,500.</p>
          <div className="kn-sim">
            <div className="kn-page" style={{ gap: 12 }}>
              <NumField id="pn-inc" label="הכנסה חייבת שאינה מעבודה" value={income} onChange={setIncome} max={250_000} step={500} />
              <NumField id="pn-dep" label="הפקדה לקצבה כעצמאי" value={dep} onChange={setDep} max={40_000} step={100} />
              <div className="kn-row"><button type="button" className="btn btn-secondary btn-sm" onClick={() => { setIncome(100_000); setDep(10_000); }}>דוגמה 1</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => { setIncome(100_000); setDep(14_500); }}>דוגמה 2</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => { setIncome(200_000); setDep(25_000); }}>מעל התקרה</button></div>
            </div>
            <div className="kn-page" style={{ gap: 10 }}>
              {trackA.ok && trackA.value ? (
                <>
                  <div className="kn-two">
                    <div className="kn-box"><span className="kn-eyebrow now">ניכוי</span><span className="kn-big">{fmtNis(trackA.value.deduction)}</span><span className="kn-xs kn-muted">בסיס {fmtNis(trackA.value.baseDeduction)} + תוספת {fmtNis(trackA.value.extraDeduction)}</span></div>
                    <div className="kn-box"><span className="kn-eyebrow later">לזיכוי (35%)</span><span className="kn-big">{fmtNis(trackA.value.toCredit)}</span><span className="kn-xs kn-muted">היתרה עוברת לחישוב הזיכוי, עד התקרה שלו (לא מחושב כאן)</span></div>
                  </div>
                  <div className="kn-explain">הכנסה מזכה {fmtNis(trackA.value.qualifying)}{income > trackA.value.qualifying ? ` (התקרה — ההכנסה מעליה לא נספרת)` : ''}. {pctOf('pen.trackA.baseRate')} ממנה מנוכים. ההפקדה מעל {pctOf('pen.trackA.extraThreshold')} מזכה בתוספת של עד {pctOf('pen.trackA.extraRate')} — כאן {fmtNis(trackA.value.extraDeduction)}.</div>
                  <Problems problems={trackA.problems} soft />
                </>
              ) : <Problems problems={trackA.problems} />}
            </div>
          </div>
        </Sec>

        <Sec id="pn-ex" title="דוגמאות פתורות">
          <p className="kn-small kn-muted" style={{ margin: 0 }}>מהקל לקשה. לפי ערכי {EX_YEAR} (המדריך הרשמי). כדאי לנסות לפתור לפני שפותחים את הפתרון.</p>
          <div className="kn-solves">
            {ex1 && <SolveFirst level="יסוד" status="verified" title="1. עצמאי שמפקיד מתחת ל-12%"
              facts={<>עצמאי בן 40, בלי משכורת, הכנסה חייבת מהעסק 100,000 ₪. הפקיד כעמית עצמאי 10,000 ₪. ההפקדות לקצבה לטובתו מתחת לרף עמית מוטב.</>}
              ask="כמה מנוכה, וכמה עובר לזיכוי?"
              steps={[
                { label: 'מסלול', value: 'א׳ — אין משכורת, מתחת ל-50, לא עמית מוטב' },
                { label: `הכנסה מזכה (עד ${fmtNis(ceilNonWork)})`, value: fmtNis(ex1.qualifying) },
                { label: `ניכוי בסיסי: ${pctOf('pen.trackA.baseRate')} × ${fmtNis(ex1.qualifying)}`, value: fmtNis(ex1.baseDeduction) },
                { label: `תוספת: ההפקדה (10%) לא עולה על ${pctOf('pen.trackA.extraThreshold')}`, value: fmtNis(ex1.extraDeduction) },
                { label: 'ההפקדה פחות הניכוי', value: `${fmtNis(10_000)} − ${fmtNis(ex1.deduction)} = ${fmtNis(ex1.toCredit)}` },
              ]}
              answer={<>ניכוי {fmtNis(ex1.deduction)}; {fmtNis(ex1.toCredit)} עוברים לחישוב הזיכוי.</>}
              note="הדוגמה מופיעה במדריך הרשמי לשנת 2025." />}
            {ex2 && <SolveFirst level="יישום" status="verified" title="2. הפקדה גבוהה — התוספת"
              facts={<>אותו עצמאי, אבל הפקיד 14,500 ₪ (14.5% מההכנסה).</>}
              ask="כמה מנוכה עכשיו?"
              steps={[
                { label: 'ניכוי בסיסי', value: fmtNis(ex2.baseDeduction) },
                { label: `החלק שמעל ${pctOf('pen.trackA.extraThreshold')}: 14,500 − 12,000`, value: fmtNis(14_500 - 12_000) },
                { label: `תוספת — עד ${pctOf('pen.trackA.extraRate')} מההכנסה (4,000), כאן`, value: fmtNis(ex2.extraDeduction) },
                { label: 'סה״כ ניכוי', value: fmtNis(ex2.deduction) },
              ]}
              answer={<>ניכוי {fmtNis(ex2.deduction)}; {fmtNis(ex2.toCredit)} לזיכוי.</>}
              note="למה ההפקדה מעל 12% מקבלת תוספת: כדי לעודד הפקדה גבוהה — הניכוי עולה עד 11% מההכנסה המזכה." />}
            {ex3 && <SolveFirst level="מתקדם" status="verified" title="3. הכנסה מעל התקרה"
              facts={<>עצמאית בת 45, בלי משכורת, הכנסה חייבת 200,000 ₪. הפקידה 25,000 ₪. ההפקדות לטובתה ({fmtNis(25_000)}) מתחת לרף עמית מוטב של {EX_YEAR}.</>}
              ask="מה בסיס החישוב, וכמה מנוכה?"
              steps={[
                { label: 'ההכנסה המזכה נעצרת בתקרה', value: `min(200,000, ${fmtNis(ceilNonWork)}) = ${fmtNis(ex3.qualifying)}` },
                { label: `ניכוי בסיסי: ${pctOf('pen.trackA.baseRate')}`, value: fmtNis(ex3.baseDeduction) },
                { label: `סף התוספת: ${pctOf('pen.trackA.extraThreshold')} × ${fmtNis(ex3.qualifying)}`, value: fmtNis(Math.round(ex3.qualifying * num('pen.trackA.extraThreshold', EX_YEAR))) },
                { label: 'תוספת: הנמוך מבין העודף לבין 4% מההכנסה המזכה', value: fmtNis(ex3.extraDeduction) },
                { label: 'סה״כ ניכוי', value: fmtNis(ex3.deduction) },
              ]}
              answer={<>ניכוי {fmtNis(ex3.deduction)}; {fmtNis(ex3.toCredit)} לזיכוי (עד תקרת הזיכוי, שלא מחושבת כאן).</>}
              note="הטעות הנפוצה: לחשב 7% מ-200,000. התקרה חלה על ההכנסה, לא על ההפקדה." />}
          </div>
        </Sec>

        <Sec id="pn-5" title="ניכוי או זיכוי — מה שווה יותר">
          <div className="kn-prose">
            <p>אפשר לפצל הפקדה כעמית עצמאי בין סעיף 53 (ניכוי) לסעיף 76 (זיכוי). כך נראה ההבדל על 1,000 ₪:</p>
          </div>
          <WorthBars />
          <div className="kn-prose">
            <p><strong>במדרגה נמוכה מ-35% הזיכוי עשוי להיות שווה יותר</strong>, ובמדרגה גבוהה — הניכוי. המדריך מציין שבהכנסה חייבת נמוכה מ-269,280 ₪ (2025) כדאי לשקול רישום לזיכוי. <ClaimTag status="verified" /></p>
            <p>כשרושמים בסעיף 53, החלק שלא נוכה עובר אוטומטית לחישוב הזיכוי. רישום בסעיף 76 בלבד — רק זיכוי. <ClaimTag status="verified" /></p>
            <p>לזיכוי יש תקרה אחת, <b>משותפת לפנסיה ולביטוח חיים</b> (45א(ד)): 7% מהכנסת עבודה ועוד 5% מהכנסה אחרת, ולא פחות מ-2,268. הפנסיה ממלאת אותה קודם, וביטוח החיים מקבל את היתרה — כך פרסמה רשות המסים. לכן שכיר שמפקיד 6% ממשכורת של יותר מכ-136,000 לא מקבל זיכוי על ריסק פרטי. התקרה לא מחושבת במחשבון כאן, אבל מחושבת בהערכת המס, עם ההסבר <ClaimTag status="verified" />.</p>
            <p>עמית מוטב — תקרה אחרת (45א(ה)): בלי הכנסה מבוטחת 5% מההכנסה החייבת עד 232,800, בלי תקרה נפרדת לביטוח חיים; עם הכנסה מבוטחת — 7% ממנה ועוד 5% מהשאר. <b>פתוח:</b> האם ביטוח החיים נכנס גם לחלק שאינו מבוטח. הערכת המס מחשבת את החלק שאינו שנוי במחלוקת ומציגה את ההפרש בנפרד <ClaimTag status="open" />.</p>
          </div>
        </Sec>

        <Sec id="pn-6" title="חריגים ומה שלא מחושב כאן">
          <div className="kn-two">
            <div className="kn-box"><strong>גיל 50 <ClaimTag status="verified" /></strong><span className="kn-small"><RV id="pen.trackA.age50" year={year} /></span></div>
            <div className="kn-box"><strong>מסלול ב׳ — עמית מוטב <ClaimTag status="verified" /></strong><span className="kn-small"><RV id="pen.trackB" year={year} /></span></div>
            <div className="kn-box"><strong>עד 31.12 <ClaimTag status="verified" /></strong><span className="kn-small">ההפקדה בשנת המס בפועל. הפקדה רטרואקטיבית לא מזכה לשנה שעברה.</span></div>
            <div className="kn-box"><strong>טענות מהמסמך הפנימי</strong><span className="kn-small">«רף עמית מוטב כ-21,300» — לא תואם למדריך 2025 (<RV id="pen.beneficial.threshold" year={2025} />). «16.5% לכל עצמאי» — תלוי בגיל ובתשלום לאובדן כושר עבודה.</span></div>
          </div>
        </Sec>

        <Sec id="pn-mis" title="טעויות נפוצות">
          <Mistakes items={PENSION_LESSON.mistakes} year={year} />
        </Sec>

        <Sec id="pn-8" title="תרגול">
          <Quiz items={[
            { level: 'יסוד', q: 'מה מוריד ישירות את המס עצמו?', options: [{ text: 'ניכוי', right: false }, { text: 'זיכוי', right: true }], why: 'ניכוי מקטין את ההכנסה החייבת; זיכוי מקטין את המס.' },
            { level: 'יסוד', q: 'לקוח שכיר בלבד, והמעביד מפקיד לו לפנסיה. האם «פנסיה לעצמאי» חל עליו?', options: [{ text: 'כן', right: false }, { text: 'לא — ההפקדות דרך המשכורת נרשמות בסעיפי השכיר', right: true }], why: 'הנושא הזה עוסק בהפקדה כעמית עצמאי. מה שעבר דרך המשכורת מופיע ב-106.' },
            { level: 'יישום', q: 'עצמאי בלי משכורת, הכנסה 100,000, הפקיד 14,500 לקצבה. כמה ינוכה?', options: [{ text: '7,000', right: false }, { text: '9,500', right: true }, { text: '14,500', right: false }], why: '7% בסיס, ועוד 2.5% כי ההפקדה (14.5%) עולה על 12% ב-2.5%. היתרה (5,000) — לזיכוי.' },
            { level: 'יישום', q: 'עצמאית במדרגת מס של 20%. מה שווה יותר על אותה הפקדה?', options: [{ text: 'ניכוי', right: false }, { text: 'זיכוי של 35%', right: true }], why: 'ניכוי שווה כמו המס השולי (20%); זיכוי — 35%.' },
            { level: 'מתקדם', q: 'עצמאי שמלאו לו 52 ב-1.1, בלי משכורת ולא עמית מוטב, הכנסה 100,000, הפקיד 14,500 לקצבה. כמה ינוכה?', options: [{ text: '9,500', right: false }, { text: '10,500', right: true }, { text: '14,500', right: false }], why: 'מגיל 50 הבסיס 10.5% (10,500). התוספת ניתנת רק על מה שמעל הבסיס ועוד 5% לזיכוי (15.5%), וכאן ההפקדה מתחת. השיעורים המוגדלים נשארים בתוך אותן תקרות בשקלים.' },
            { level: 'מתקדם', q: 'בני זוג: הוא הפקיד 20,000 לקצבה, היא 10,000. האם הוא עמית מוטב ב-2025?', options: [{ text: 'כן — ביחד 30,000', right: false }, { text: 'לא — 20,000 מתחת לרף, וההפקדות שלה לא נספרות', right: true }], why: `הרף (${num('pen.beneficial.threshold', 2025).toLocaleString('he-IL')} ב-2025) נבדק לכל אדם בנפרד.` },
          ]} />
        </Sec>
      </>}

      {apply && (
        <Sec id="pn-7" title="מה עושים בתיק">
          <div className="kn-inform">
            <div><b>בשאלון ללקוח</b><span>אישור שנתי מכל קופה (לקצבה), תשלום לאובדן כושר עבודה, תאריך לידה, והאם יש גם משכורת.</span></div>
            <div><b>בטופס 1301 (2025)</b><span>סעיף 53 — 135/180 (ניכוי). סעיף 76 — 268/269 (זיכוי). סעיפים 58 ו־59 — הכנסה מבוטחת והפקדות מעביד מה-106.</span></div>
            <div><b>בחישוב</b><span>מסלול א׳ ומסלול ב׳, משכורת מבוטחת ושאינה מבוטחת, וגיל 50 עם משכורת ובלעדיה — מחושבים בהערכת המס, יחד עם התקרה המשותפת לביטוח חיים. לא מחושב: משכורת מעל 291,000 עם חלק לא מבוטח מגיל 50, ועמית מוטב בן 50 שבוחר מסלול א׳ — המערכת מציגה «אין תוצאה» לתרחיש הזה ולא מספר חלקי.</span></div>
          </div>
          <ol className="kn-small kn-steps">
            <li>לבקש מהלקוח את האישור השנתי מכל קופה לקצבה, ולוודא שההפקדות שם הן כעמית עצמאי.</li>
            <li>להפריד מה שהופקד דרך המשכורת (106) — הוא לא נכנס לסעיף 53.</li>
            <li>לבדוק תאריך לידה ומשכורת, ולסכם את כל ההפקדות לקצבה מול רף עמית מוטב.</li>
            <li>לחשב את הניכוי (מסלול א׳ בלי משכורת), ולהחליט אם לרשום חלק לזיכוי לפי המדרגה.</li>
            <li>לפני דצמבר: להציע השלמת הפקדה, ולומר במפורש מה מוסבר ומה מחושב.</li>
          </ol>
        </Sec>
      )}
    </>
  );
}
