// ─── קרן השתלמות לעצמאי ולשכיר־עצמאי ─────────────────────────────────────────
// הקושי בנושא: שתי תקרות שאינן מדברות זו עם זו, ותקרה שהמעביד כבר «ניצל».
// לכן ההמחשה המרכזית היא שני פסים בקנה מידה — תקרת ההכנסה ופיצול ההפקדה.

import { useMemo, useState } from 'react';
import { studyFundLimit } from '../../taxRules/calc';
import { ruleView, num } from '../../taxRules/registry';
import { RV, Problems, fmtNis } from '../RuleBits';
import { Sec, Quiz, Walk, NumField, type TopicBodyProps, type TocItem } from './shared';
import { Glossary, Thinking, Mistakes, SolveFirst, Legend } from './lesson';
import { STUDY_FUND_LESSON } from './lessons';

export const STUDY_FUND_TOC: TocItem[] = [
  { id: 'sf-0', label: 'מושגי יסוד', view: 'learn' }, { id: 'sf-2', label: 'איך זה עובד', view: 'learn' },
  { id: 'sf-think', label: 'איך חושבים', view: 'learn' }, { id: 'sf-3', label: 'מחשבון', view: 'learn' },
  { id: 'sf-4', label: 'דוגמאות פתורות', view: 'learn' }, { id: 'sf-5', label: 'המקרה המשולב', view: 'learn' },
  { id: 'sf-6', label: 'חריגים', view: 'learn' }, { id: 'sf-mis', label: 'טעויות נפוצות', view: 'learn' },
  { id: 'sf-8', label: 'תרגול', view: 'learn' }, { id: 'sf-7', label: 'מה עושים בתיק', view: 'apply' },
];

const RATES = [0.2, 0.31, 0.35, 0.47];

// ‼ הדוגמאות והתרגול מחושבים מהמרשם לשנה של דוגמת המדריך — לא מספרים בטקסט,
// כדי שעדכון כלל לא ישאיר דוגמה ישנה בלי שאיש ישים לב.
const EX_YEAR = 2025;
const ex = (b: number, s: number, d: number) => studyFundLimit({ year: EX_YEAR, businessIncome: b, employerDeterminingSalary: s, deposit: d }).value;
const n = (x: number | undefined) => (x ?? 0).toLocaleString('he-IL');

export default function StudyFundBody({ year, ctx, view }: TopicBodyProps) {
  const [biz, setBiz] = useState(195_000);
  const [sal, setSal] = useState(ctx?.mixed ? 72_000 : 0);
  const [dep, setDep] = useState(ctx?.selfEmployedStudyFund || 9_000);
  const [rate, setRate] = useState(0.31);
  // ‼ ההמחשה מותרת גם על ערך משני (2026), עם סימון; חישוב בתיק — לא.
  const r = useMemo(() => studyFundLimit({ year, businessIncome: biz, employerDeterminingSalary: sal, deposit: dep }, 'illustration'), [year, biz, sal, dep]);
  const exemptView = ruleView('sf.se.exemptDeposit', year);
  const exempt = typeof exemptView?.entry?.value === 'number' ? exemptView.entry.value : 0;

  const v = r.value;
  const deducted = v?.deducted ?? 0;
  const exemptOnly = Math.max(0, Math.min(dep, exempt) - deducted);
  const none = Math.max(0, dep - Math.max(exempt, deducted));
  const depScale = Math.max(dep, exempt) * 1.08 || 1;

  // הדוגמה של המדריך הרשמי — המשכורת הקובעת המרבית
  const maxSal = (() => { try { return num('sf.mixed.maxDeterminingSalary', 2025); } catch { return 0; } })();
  const example = (b: number, s: number, d: number) => { setBiz(b); setSal(s); setDep(d); document.getElementById('sf-3')?.scrollIntoView({ block: 'start' }); };

  const e1 = ex(120_000, 0, 9_000), e2 = ex(195_000, 72_000, 9_000);
  const fullDed = ex(10_000_000, 0, 0)?.maxDeduction ?? 0;
  const e3 = ex(250_000, maxSal, fullDed);
  const q1 = ex(250_000, 120_000, 0), q2 = ex(100_000, 0, 12_000);
  const pct = +(num('sf.se.rate', EX_YEAR) * 100).toFixed(2) + '%';

  const walkSal = ctx?.mixed ? 72_000 : maxSal;
  const walkBiz = ctx?.mixed ? 193_950 : 200_000;
  const walk = studyFundLimit({ year: 2025, businessIncome: walkBiz, employerDeterminingSalary: walkSal }).value;
  const learn = view !== 'apply';
  const apply = view !== 'learn';
  const ceil = (() => { try { return num('sf.se.ceiling', EX_YEAR); } catch { return 0; } })();
  const big = ex(400_000, 0, 20_000);

  return (
    <>
      {learn && <>
      <Sec id="sf-0" title="מושגי יסוד">
        <p className="kn-small kn-muted" style={{ margin: 0 }}>שישה מושגים שחוזרים בנושא. מי שמכיר אותם — יכול לדלג ל«איך זה עובד».</p>
        <Glossary terms={STUDY_FUND_LESSON.glossary} year={year} />
        <Legend />
      </Sec>

      <Sec id="sf-2" title="איך זה עובד">
        <div className="kn-two">
          <div className="kn-box"><span className="kn-eyebrow now">עכשיו · בשנת ההפקדה</span><strong>ניכוי מההכנסה החייבת</strong>
            <p className="kn-small" style={{ margin: 0 }}>עד <RV id="sf.se.rate" year={year} /> מ«ההכנסה הקובעת» — ההכנסה החייבת מהעסק — עד תקרה של <RV id="sf.se.ceiling" year={year} /> בשנה. שווה בכסף: הניכוי כפול שיעור המס השולי.</p></div>
          <div className="kn-box"><span className="kn-eyebrow later">בעתיד · במשיכה</span><strong>פטור ממס רווחי הון</strong>
            <p className="kn-small" style={{ margin: 0 }}>רווחים על «הפקדה מוטבת» פטורים במשיכה כדין. תקרת ההפקדה המוטבת: <RV id="sf.se.exemptDeposit" year={year} /> בשנה — ממקור משני, לא לחישוב.</p></div>
        </div>
        <div className="kn-prose">
          <p><strong>שני המספרים לא מדברים זה עם זה.</strong> הפקדה מעל מרחב הניכוי לא מורידה מס היום, אבל עשויה ליהנות מהפטור. הפקדה מעל התקרה המוטבת — לא נהנית מכלום.</p>
          <p>מי שגם שכיר, והמעביד מפקיד לו לקרן, «השתמש» בחלק מהתקרה. אותה תקרה לא ניתנת פעמיים.</p>
        </div>
      </Sec>

      <Sec id="sf-think" title="איך חושבים על הפקדה לקרן השתלמות">
        <p className="kn-small kn-muted" style={{ margin: 0 }}>הסדר שבו עוברים על הנתונים, ולמה כל שאלה חשובה.</p>
        <Thinking steps={STUDY_FUND_LESSON.thinking} year={year} />
      </Sec>

      <Sec id="sf-3" title="מחשבון להמחשה">
        <p className="kn-small kn-muted" style={{ margin: 0 }}>משנים נתונים ורואים לאן הולך כל שקל. שנת מס {year}.{ctx ? ` מולא לפי התיק של ${ctx.name} במה שידוע; השאר — להשלים.` : ''}</p>
        <div className="kn-sim">
          <div className="kn-page" style={{ gap: 12 }}>
            <NumField id="sf-biz" label="הכנסה חייבת מהעסק" value={biz} onChange={setBiz} max={350_000} step={50} />
            <NumField id="sf-sal" label="משכורת שהמעביד מפקיד עליה לקרן (0 = אין)" value={sal} onChange={setSal} max={200_000} step="any" />
            <NumField id="sf-dep" label="הפקדה שלך כעצמאי בשנה" value={dep} onChange={setDep} max={30_000} step="any" />
            <label className="kn-field" htmlFor="sf-rate">שיעור המס השולי (להמחשת שווי הניכוי)
              <select id="sf-rate" value={rate} onChange={e => setRate(+e.target.value)}>{RATES.map(x => <option key={x} value={x}>{Math.round(x * 100)}%</option>)}</select>
            </label>
          </div>
          <div className="kn-page" style={{ gap: 12 }}>
            {!r.ok || !v ? <Problems problems={r.problems} /> : (
              <>
                <div>
                  <div className="kn-small" style={{ marginBottom: 4 }}><strong>תקרת ההכנסה הקובעת</strong> · {fmtNis(v.ceiling)}</div>
                  <div className="kn-bar" role="img" aria-label={`מתוך ${fmtNis(v.ceiling)}: המעביד ${fmtNis(v.usedByEmployer)}, בסיס הניכוי ${fmtNis(v.cap)}`}>
                    <span className="kn-seg-emp" style={{ flexBasis: `${(v.usedByEmployer / v.ceiling) * 100}%` }}>{v.usedByEmployer / v.ceiling > 0.18 ? 'המעביד' : ''}</span>
                    <span className="kn-seg-base" style={{ flexBasis: `${(v.cap / v.ceiling) * 100}%` }}>{v.cap / v.ceiling > 0.2 ? 'בסיס הניכוי' : ''}</span>
                  </div>
                  <div className="kn-legend" style={{ marginTop: 6 }}><span><i className="kn-seg-emp" />המעביד כבר «השתמש»</span><span><i className="kn-seg-base" />בסיס הניכוי שלך</span><span><i />לא בשימוש</span></div>
                </div>
                <div>
                  <div className="kn-small" style={{ marginBottom: 4 }}><strong>ההפקדה שלך</strong></div>
                  <div className="kn-bar" role="img" aria-label={`הפקדה ${fmtNis(dep)}: מנוכה ${fmtNis(deducted)}, פטור בעתיד בלבד ${fmtNis(exemptOnly)}, בלי הטבה ${fmtNis(none)}`}>
                    <span className="kn-seg-now" style={{ flexBasis: `${(deducted / depScale) * 100}%` }}>{deducted / depScale > 0.14 ? fmtNis(deducted) : ''}</span>
                    <span className="kn-seg-later" style={{ flexBasis: `${(exemptOnly / depScale) * 100}%` }}>{exemptOnly / depScale > 0.14 ? fmtNis(exemptOnly) : ''}</span>
                    <span className="kn-seg-none" style={{ flexBasis: `${(none / depScale) * 100}%` }}>{none / depScale > 0.12 ? fmtNis(none) : ''}</span>
                  </div>
                  <div className="kn-legend" style={{ marginTop: 6 }}><span><i className="kn-seg-now" />מנוכה עכשיו</span><span><i className="kn-seg-later" />פטור בעתיד בלבד (משני)</span><span><i className="kn-seg-none" />בלי הטבה</span></div>
                </div>
                <div className="kn-explain" aria-live="polite">
                  {sal > 0 ? `המעביד כבר מפקיד על ${fmtNis(sal)}, ולכן מהתקרה נשארו ${fmtNis(Math.max(0, v.ceiling - v.usedByEmployer))}. ` : 'אין מעביד שמפקיד לקרן — כל התקרה פתוחה. '}
                  {v.cap === biz ? `ההכנסה מהעסק (${fmtNis(biz)}) קטנה יותר, ולכן היא הבסיס. ` : 'זה פחות מההכנסה מהעסק, ולכן זה הבסיס. '}
                  <strong>מרחב הניכוי: {fmtNis(v.maxDeduction)}.</strong> מתוך ההפקדה, <strong>{fmtNis(deducted)}</strong> מנוכים עכשיו — חיסכון של כ-{fmtNis(deducted * rate)} בשיעור {Math.round(rate * 100)}%
                  {exemptOnly ? <>; <strong>{fmtNis(exemptOnly)}</strong> נהנים רק מהפטור בעתיד</> : null}
                  {none ? <>; <strong>{fmtNis(none)}</strong> מעל התקרה המוטבת — בלי הטבה</> : null}.
                </div>
                <Problems problems={r.problems} soft />
              </>
            )}
          </div>
        </div>
      </Sec>

      <Sec id="sf-4" title="דוגמאות פתורות">
        <p className="kn-xs kn-muted" style={{ margin: 0 }}>לפי ערכי {EX_YEAR} (דוגמת המדריך הרשמי). כדאי לנסות לפתור לפני שפותחים את הפתרון; «לפתוח במחשבון» מציב את הנתונים בשנה שבחרת.</p>
        <div className="kn-solves">
          {big && <SolveFirst level="יסוד" status="verified" title="1. הכנסה גבוהה, אין מעביד"
            facts={<>עצמאי בלבד, הכנסה חייבת מהעסק 400,000 ₪. הפקיד לקרן 20,000 ₪.</>}
            ask="כמה מנוכה, ומה קורה ליתרה?"
            steps={[
              { label: 'ההכנסה הקובעת נעצרת בתקרה', value: `min(400,000, ${fmtNis(ceil)}) = ${fmtNis(big.cap)}` },
              { label: `ניכוי מרבי: ${pct} × ${fmtNis(big.cap)}`, value: fmtNis(big.maxDeduction) },
              { label: 'מנוכה מתוך ההפקדה', value: fmtNis(big.deducted) },
              { label: 'יתרה שלא מנוכה', value: fmtNis(20_000 - big.deducted) },
            ]}
            answer={<>{fmtNis(big.deducted)} מנוכים. היתרה ({fmtNis(20_000 - big.deducted)}) לא מורידה מס השנה; עד התקרה המוטבת ({fmtNis(exempt)}) הרווחים עליה עשויים להיות פטורים במשיכה.</>}
            note="הטעות הנפוצה: 4.5% מ-400,000. התקרה חלה על ההכנסה הקובעת." />}
          {e2 && <SolveFirst level="יישום" status="verified" title="2. שכירה־עצמאית"
            facts={<>המעביד מפקיד לה לקרן על משכורת של 72,000 ₪. ההכנסה מהעסק 195,000 ₪. הפקידה כעצמאית 9,000 ₪.</>}
            ask="מה בסיס הניכוי שלה כעצמאית, וכמה מנוכה?"
            steps={[
              { label: 'מה שנשאר מהתקרה', value: `${fmtNis(e2.ceiling)} − ${fmtNis(e2.usedByEmployer)} = ${fmtNis(e2.ceiling - e2.usedByEmployer)}` },
              { label: 'סכום התקרה: הנמוך מבינו לבין ההכנסה מהעסק', value: fmtNis(e2.cap) },
              { label: `ניכוי מרבי: ${pct}`, value: fmtNis(e2.maxDeduction) },
              { label: 'מנוכה מתוך 9,000', value: fmtNis(e2.deducted) },
            ]}
            answer={<>בסיס {fmtNis(e2.cap)}; מנוכים {fmtNis(e2.deducted)}{9_000 > e2.deducted ? <>, והיתרה ({fmtNis(9_000 - e2.deducted)}) — רק פטור בעתיד</> : null}.</>} />}
        </div>
        <div className="kn-three">
          <div className="kn-box"><strong>עצמאית בלבד</strong><span className="kn-small kn-muted">הכנסה 120,000 · אין מעביד · מפקידה 9,000</span><span className="kn-small">הבסיס הוא ההכנסה. {n(e1?.deducted)} מנוכים; {n(9_000 - (e1?.deducted ?? 0))} — רק לפטור בעתיד.</span><button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => example(120_000, 0, 9_000)}>לפתוח במחשבון</button></div>
          <div className="kn-box"><strong>שכירה־עצמאית</strong><span className="kn-small kn-muted">המעביד מפקיד על 72,000 · הכנסה 195,000 · מפקידה 9,000</span><span className="kn-small">נשארו {n(e2 ? e2.ceiling - e2.usedByEmployer : 0)} מהתקרה; ההכנסה נמוכה יותר — {n(e2?.deducted)} מנוכים.</span><button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => example(195_000, 72_000, 9_000)}>לפתוח במחשבון</button></div>
          <div className="kn-box"><strong>משכורת גבוהה (דוגמת המדריך)</strong><span className="kn-small kn-muted">המעביד מפקיד על {fmtNis(maxSal)} · הכנסה 250,000 · מפקידה {n(fullDed)}</span><span className="kn-small">נשארו {n(e3?.cap)} בלבד: {n(e3?.deducted)} מנוכים; השאר פטור בעתיד בלבד.</span><button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => example(250_000, maxSal, fullDed)}>לפתוח במחשבון</button></div>
        </div>
      </Sec>

      <Sec id="sf-5" title="המקרה המשולב, צעד אחר צעד">
        <p className="kn-small kn-muted" style={{ margin: 0 }}>{ctx?.mixed ? `עם הנתונים המשוערים של ${ctx.name}.` : 'הדוגמה מהמדריך הרשמי של רשות המסים לשנת 2025.'}</p>
        {walk && <Walk steps={[
          { title: 'מה המעביד כבר «השתמש»', value: fmtNis(walkSal), note: 'המשכורת שהמעביד הפקיד עליה לקרן. בטופס 106 מול קוד 218/219, ובדוח בסעיף 52.' },
          { title: 'כמה נשאר מהתקרה', value: `${fmtNis(walk.ceiling)} − ${fmtNis(walkSal)} = ${fmtNis(walk.ceiling - walk.usedByEmployer)}`, note: 'התקרה השנתית של «הכנסה קובעת» פחות המשכורת.' },
          { title: 'משווים להכנסה מהעסק', value: `min(${fmtNis(walkBiz)}, ${fmtNis(walk.ceiling - walk.usedByEmployer)}) = ${fmtNis(walk.cap)}`, note: 'זה «סכום התקרה» — הבסיס לניכוי כעצמאי.' },
          { title: 'הניכוי המרבי', value: `${fmtNis(walk.cap)} × 4.5% = ${fmtNis(walk.maxDeduction)}`, note: ctx?.mixed ? 'זה מרחב ההפקדה שמוריד מס השנה.' : 'כמו בדוגמה במדריך: 4,718 ₪.' },
          { title: 'ומה עם הפקדה גבוהה יותר?', value: `עד ${fmtNis(exempt)}`, note: 'מעל מרחב הניכוי ההפקדה לא מורידה מס היום. עד התקרה המוטבת הרווחים עשויים להיות פטורים (מקור משני).' },
        ]} />}
      </Sec>

      <Sec id="sf-6" title="חריגים, מלכודות וטענות שנבדקו">
        <div className="kn-two">
          <div className="kn-box"><strong>עד 31.12</strong><span className="kn-small">הפקדה בינואר שייכת לשנה הבאה. אין הפקדה רטרואקטיבית.</span></div>
          <div className="kn-box"><strong>משיכה פטורה</strong><span className="kn-small"><RV id="sf.liquidity" year={year} /></span></div>
          <div className="kn-box"><strong>ממתי נספר הוותק?</strong><span className="kn-small">תאריך ההפקדה או תחילת השנה — <RV id="sf.seniorityStart" year={year} />. לא להבטיח ללקוח תאריך.</span></div>
          <div className="kn-box"><strong>«שעון ותק» — קרן חדשה בסכום סמלי כל שנה</strong><span className="kn-small">מופיע בחומרי המשרד. אין עמדה רשמית שנבדקה — שאלה לבדיקה, לא המלצה.</span></div>
          <div className="kn-box is-no"><strong>לא כפרקטיקה: פיצול לכמה קרנות ופדיון בשנים נפרדות «כדי שלא יצליבו»</strong><span className="kn-small">התקרה היא לפי היחיד והשנה, לא לפי קופה. הסתמכות על היעדר הצלבה אינה זכות. PIVO יתריע על הפקדה מעל התקרה ולא יציע פיצול.</span></div>
        </div>
      </Sec>

      <Sec id="sf-mis" title="טעויות נפוצות">
        <Mistakes items={STUDY_FUND_LESSON.mistakes} year={year} />
      </Sec>
      </>}

      {apply && (
      <Sec id="sf-7" title="מה עושים בתיק">
        <div className="kn-inform">
          <div><b>בשאלון ללקוח</b><span>«יש לך קרן השתלמות כעצמאי? באיזו שנה הפקדת לראשונה?» ואישור הפקדה שנתי מהקרן.</span></div>
          <div><b>בטופס 1301 (2025)</b><span>סעיף 51, שדות 136/137 — הסכום ששולם.</span><span>סעיף 52, שדות 218/219 — משכורת שבשלה המעביד שילם לקרן.</span></div>
          <div><b>בחישוב</b><span>«סכום התקרה» = הנמוך מבין ההכנסה מהעסק, לבין התקרה פחות המשכורת הקובעת; כפול <RV id="sf.se.rate" year={2025} />.</span></div>
        </div>
        <ol className="kn-small" style={{ margin: 0, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--txc)' }}>
          <li>לברר אם הלקוח גם שכיר, ומה המשכורת הקובעת (106 או תלושים).</li>
          <li>לשאול על קרן קיימת ועל שנת ההפקדה הראשונה.</li>
          <li>לפני דצמבר: להציע הפקדה עד מרחב הניכוי, ולומר במפורש מה נהנה רק מהפטור.</li>
          <li>בדוח: לבקש אישור הפקדה ולרשום בסעיפים 51 ו־52.</li>
        </ol>
      </Sec>
      )}

      {learn && (
      <Sec id="sf-8" title="תרגול">
        <Quiz items={[
          { level: 'יסוד', q: 'מה מוריד מס כבר השנה — הניכוי או הפטור?', options: [{ text: 'הניכוי', right: true }, { text: 'הפטור', right: false }], why: 'הניכוי מקטין את ההכנסה החייבת בשנת ההפקדה. הפטור חל רק במשיכה כדין, על הרווחים.' },
          { level: 'יישום', q: 'עצמאית שהמעביד שלה מפקיד לקרן על 120,000 ₪, והכנסתה מהעסק 250,000 ₪. מה בסיס הניכוי שלה כעצמאית?', options: [{ text: '250,000 — כל ההכנסה מהעסק', right: false }, { text: `${n(q1?.cap)} — התקרה פחות המשכורת`, right: true }, { text: `${n(q1?.ceiling)} — התקרה המלאה`, right: false }], why: `הנמוך מבין ההכנסה מהעסק לבין התקרה פחות 120,000. ניכוי מרבי: ${n(q1?.maxDeduction)} ₪.` },
          { level: 'יישום', q: `עצמאי בלבד, הכנסה 100,000 ₪, הפקיד 12,000 ₪. מה קורה ל-${n(12_000 - (q2?.deducted ?? 0))} ₪ שמעל ${n(q2?.deducted)}?`, options: [{ text: 'לא מנוכים, אבל עשויים ליהנות מהפטור בעתיד', right: true }, { text: 'מנוכים בשנה הבאה', right: false }, { text: 'חייבים במס מיד', right: false }], why: `הניכוי הוא ${pct} מ-100,000 = ${n(q2?.deducted)}. השאר לא מוריד מס היום, ועד התקרה המוטבת נהנה מהפטור במשיכה.` },
          { level: 'מתקדם', q: 'לקוח מציע לפצל הפקדות לשלוש קרנות ולפדות כל אחת בשנה אחרת, «כדי שלא יצליבו». מה עונים?', options: [{ text: 'זה תכנון לגיטימי שחוסך מס', right: false }, { text: 'התקרה לפי היחיד והשנה; זה לא מקנה זכות, ו-PIVO לא ממליץ על זה', right: true }], why: 'ההצעה נשענת על היעדר בקרה, לא על זכות.' },
        ]} />
      </Sec>
      )}
    </>
  );
}
