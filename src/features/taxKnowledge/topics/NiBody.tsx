// ─── ביטוח לאומי לעצמאי ─────────────────────────────────────────────────────
// הקושי: ההכנסה לב״ל אינה ההכנסה החייבת במס, וחלק מדמי הביטוח עצמם מופחת
// ממנה — לכן הנוסחה הרשמית נראית מוזרה. המחשבון מראה אותה צעד אחר צעד.
// ‼ 11.10.2026: «ללמוד» — מושגים, איך חושבים, דוגמאות פתורות, טעויות ותרגול;
// «בתיק» — מה עושים ביד. התוכן והסטטוס של כל טענה — lessonsMore.ts.

import { useMemo, useState } from 'react';
import { niSelfEmployedQuarter } from '../../taxRules/calc';
import { RV, Problems, fmtNis } from '../RuleBits';
import { Sec, Quiz, NumField, type TopicBodyProps, type TocItem } from './shared';
import { ruleView, num } from '../../taxRules/registry';
import { Glossary, Thinking, Mistakes, SolveFirst, ClaimTag, Legend } from './lesson';
import { NI_LESSON } from './lessonsMore';

/** ערך חודשי מהמרשם (לשנה, או האחרון שקדם לה) — לאזהרות בלבד, לא לחישוב. */
const niMonthly = (id: string, year: number, fallback: number) => { const e = ruleView(id, year)?.entry; return typeof e?.value === 'number' ? e.value : fallback; };

export const NI_TOC: TocItem[] = [
  { id: 'ni-0', label: 'מושגי יסוד', view: 'learn' }, { id: 'ni-2', label: 'על איזו הכנסה', view: 'learn' },
  { id: 'ni-think', label: 'איך חושבים', view: 'learn' }, { id: 'ni-3', label: 'מחשבון רבעוני', view: 'learn' },
  { id: 'ni-ex', label: 'דוגמאות פתורות', view: 'learn' }, { id: 'ni-4', label: 'מקדמות ושומה סופית', view: 'learn' },
  { id: 'ni-5', label: 'מה לא מחושב', view: 'learn' }, { id: 'ni-mis', label: 'טעויות נפוצות', view: 'learn' },
  { id: 'ni-7', label: 'תרגול', view: 'learn' }, { id: 'ni-6', label: 'מה עושים בתיק', view: 'apply' },
];

// ‼ ערכי ב״ל במרשם קיימים רק ל-2026, בביסוס רשמי (דף השיעורים ודף החישוב של ב״ל).
// לכן גם המחשבון וגם הדוגמאות מחושבים לשנה הזו — לא מספרים בטקסט.
const EX_YEAR = 2026;
const Q = (monthly: number) => niSelfEmployedQuarter({ year: EX_YEAR, quarterlyIncome: monthly * 3 }).value;
const pct = (id: string) => `${+(num(id, EX_YEAR) * 100).toFixed(2)}%`;
const n = (x: number) => x.toLocaleString('he-IL', { maximumFractionDigits: 1 });

/**
 * ‼ ב״ל מפרסמת את הנוסחה הרבעונית רק למעל הסף. מתחת לסף calc מחשב הכנסה ÷ (1 + מופחת×0.52)
 * — נגזר מאותו כלל, לא מפורסם, ותלוי גם בהכנסה המזערית שלא נבדקת כאן — לכן אין תוצאה.
 */
const belowThreshold = (r: { base: number; regularPart: number }) => r.regularPart === 0 && r.base < num('ni.se.reducedThreshold', EX_YEAR) * 3;

export default function NiBody({ year, view }: TopicBodyProps) {
  const [monthly, setMonthly] = useState(12_000);
  const r = useMemo(() => niSelfEmployedQuarter({ year: EX_YEAR, quarterlyIncome: monthly * 3 }), [monthly]);
  const learn = view !== 'apply';
  const apply = view !== 'learn';

  const ex1 = Q(12_000), ex2 = Q(25_000), exOld = Q(8_000);
  const m3 = num('ni.se.reducedThreshold', EX_YEAR) * 3;
  const z = num('ni.se.deductionShare', EX_YEAR);
  const t1 = num('ni.se.lowRateNi', EX_YEAR), t2 = num('ni.se.highRateNi', EX_YEAR);

  return (
    <>
      {learn && <>
        {year !== EX_YEAR && <p className="kn-soft">הערכים בנושא הזה לשנת {EX_YEAR} — ערכי {year} לא הוזנו למרשם.</p>}

        <Sec id="ni-0" title="מושגי יסוד">
          <p className="kn-small kn-muted" style={{ margin: 0 }}>המושגים שחוזרים בכל הנושא. מי שמכיר אותם — יכול לדלג ל«על איזו הכנסה».</p>
          <Glossary terms={NI_LESSON.glossary} year={EX_YEAR} />
          <Legend />
        </Sec>

        <Sec id="ni-2" title="על איזו הכנסה מחושב">
          <div className="kn-prose">
            <p>לפי סעיף 345 לחוק, ההכנסה של עצמאי נקבעת לפי <strong>השומה הסופית</strong> במס הכנסה — <strong>לפני</strong> פטורים, ניכויים וזיכויים — ואחרי שמפחיתים: <ClaimTag status="verified" /></p>
            <ul style={{ margin: 0, paddingInlineStart: 18 }}><li><RV id="ni.se.deductionShare" year={EX_YEAR} /> מדמי הביטוח הלאומי (לא בריאות);</li><li>חלק מההפקדה לקופת גמל — הסכום שנקבע במס הכנסה.</li></ul>
            <p>לכן הכנסה לב״ל ≠ הכנסה חייבת, ואי אפשר להעתיק אחוז ממס הכנסה.</p>
          </div>
          <div className="kn-three">
            <div className="kn-box"><span className="kn-eyebrow">מס הכנסה</span><strong>הכנסה חייבת</strong><span className="kn-small">אחרי ניכויים (פנסיה, קרן השתלמות) ולפני זיכויים. עליה מדרגות המס.</span></div>
            <div className="kn-box"><span className="kn-eyebrow now">ב״ל</span><strong>בסיס לדמי ביטוח</strong><span className="kn-small">לפני פטורים, ניכויים וזיכויים, פחות <RV id="ni.se.deductionShare" year={EX_YEAR} /> מדמי הביטוח הלאומי ופחות חלק מקופת הגמל.</span></div>
            <div className="kn-box"><span className="kn-eyebrow later">למה מעגל</span><strong>הבסיס תלוי בתשלום</strong><span className="kn-small">כדי לדעת את הבסיס צריך את דמי הביטוח, וכדי לדעת את דמי הביטוח צריך את הבסיס. <ClaimTag status="interpretation" /></span></div>
          </div>
        </Sec>

        <Sec id="ni-think" title="איך חושבים על ביטוח לאומי של עצמאי">
          <p className="kn-small kn-muted" style={{ margin: 0 }}>הסדר שבו עוברים על הנתונים. כל שאלה עונה על «למה» — כדי לזהות גם מקרה שלא מופיע כאן.</p>
          <Thinking steps={NI_LESSON.thinking} year={EX_YEAR} />
        </Sec>

        <Sec id="ni-3" title="מחשבון רבעוני — הנוסחה של ב״ל">
          <p className="kn-small kn-muted" style={{ margin: 0 }}>בסיס = (הכנסה לרבעון + סף×3×0.52×(רגיל − מופחת)) ÷ (1 + רגיל×0.52). לעצמאי שזה עיסוקו היחיד, לפני גיל פרישה, עם בסיס מעל הסף. דוגמת ב״ל: 12,000 לחודש ← בסיס 34,690 ← 3,864 לרבעון.</p>
          <div className="kn-sim">
            <div className="kn-page" style={{ gap: 12 }}>
              <NumField id="ni-m" label="הכנסה חודשית (לפני הפחתות)" value={monthly} onChange={setMonthly} max={60_000} step={100} />
              <div className="kn-row">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMonthly(12_000)}>דוגמת ב״ל: 12,000</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMonthly(25_000)}>25,000</button>
              </div>
            </div>
            <div className="kn-page" style={{ gap: 10 }}>
              {r.ok && r.value && belowThreshold(r.value) ? (
                <div className="kn-blocked" role="status"><strong>אין תוצאה: </strong>הבסיס מתחת לסף השיעור המופחת (<RV id="ni.se.reducedThreshold" year={EX_YEAR} /> לחודש). ב״ל מפרסמת נוסחה רק למעל הסף; מתחת לו הבסיס נגזר (הכנסה ÷ (1 + שיעור מופחת × 52%)) ותלוי גם בהכנסה המזערית — לכן לא מוצג כתוצאה. <ClaimTag status="open" /></div>
              ) : r.ok && r.value ? (
                <>
                  <div className="kn-tbl-wrap"><table className="kn-tbl"><tbody>
                    <tr><td>הכנסה לרבעון</td><td className="n">{fmtNis(monthly * 3)}</td></tr>
                    <tr><td>בסיס לדמי ביטוח (אחרי ההפחתה)</td><td className="n">{fmtNis(r.value.base)}</td></tr>
                    <tr><td>בשיעור מופחת</td><td className="n">{fmtNis(r.value.reducedPart)}</td></tr>
                    <tr><td>בשיעור רגיל</td><td className="n">{fmtNis(r.value.regularPart)}</td></tr>
                    <tr><td>ביטוח לאומי</td><td className="n">{fmtNis(r.value.ni)}</td></tr>
                    <tr><td>ביטוח בריאות</td><td className="n">{fmtNis(r.value.health)}</td></tr>
                    <tr><td><strong>סה״כ לרבעון</strong></td><td className="n"><strong>{fmtNis(r.value.total)}</strong></td></tr>
                  </tbody></table></div>
                  {monthly > niMonthly('ni.se.maxIncome', EX_YEAR, Infinity) && <p className="kn-soft">מעל ההכנסה המרבית החייבת — המחשבון לא מגביל לתקרה. התוצאה לא נכונה כאן.</p>}
                </>
              ) : <Problems problems={r.problems} />}
            </div>
          </div>
        </Sec>

        <Sec id="ni-ex" title="דוגמאות פתורות">
          <p className="kn-small kn-muted" style={{ margin: 0 }}>מהקל לקשה, לפי ערכי {EX_YEAR} (ב״ל, מקור רשמי). כדאי לנסות לפתור לפני שפותחים את הפתרון.</p>
          <div className="kn-solves">
            {ex1 && <SolveFirst level="יסוד" status="verified" title="1. הדוגמה של ב״ל"
              facts={<>עצמאי בגיל העבודה, זה עיסוקו היחיד. ההכנסה שלו לב״ל — 12,000 ₪ לחודש, לפני ההפחתה.</>}
              ask="כמה ישלם לרבעון?"
              steps={[
                { label: 'הכנסה לרבעון', value: fmtNis(36_000) },
                { label: `בסיס: (36,000 + ${n(m3)}×${z}×(${pct('ni.se.highRateNi')} − ${pct('ni.se.lowRateNi')})) ÷ (1 + ${pct('ni.se.highRateNi')}×${z})`, value: fmtNis(ex1.base) },
                { label: 'עד הסף (3 חודשים)', value: fmtNis(ex1.reducedPart) },
                { label: 'מעל הסף', value: fmtNis(ex1.regularPart) },
                { label: `לאומי: ${pct('ni.se.lowRateNi')} ו-${pct('ni.se.highRateNi')}`, value: fmtNis(ex1.ni) },
                { label: `בריאות: ${pct('ni.se.lowRateHealth')} ו-${pct('ni.se.highRateHealth')}`, value: fmtNis(ex1.health) },
              ]}
              answer={<>{fmtNis(ex1.total)} לרבעון — כמו בדף של ב״ל.</>}
              note="הבסיס נמוך מההכנסה כי חלק מדמי הביטוח הלאומי מופחת ממנה. בגלל זה מחלקים ב-(1 + רגיל×0.52) ולא סתם מכפילים." />}
            {ex1 && ex2 && <SolveFirst level="יישום" status="verified" title="2. הכנסה גבוהה יותר"
              facts={<>עצמאית שההכנסה שלה לב״ל 25,000 ₪ לחודש.</>}
              ask="כמה תשלם לרבעון, וכמה בממוצע לחודש?"
              steps={[
                { label: 'הכנסה לרבעון', value: fmtNis(75_000) },
                { label: 'בסיס אחרי ההפחתה', value: fmtNis(ex2.base) },
                { label: 'בשיעור מופחת — אותו סף כמו בדוגמה 1', value: fmtNis(ex2.reducedPart) },
                { label: 'בשיעור רגיל — כל השאר', value: fmtNis(ex2.regularPart) },
                { label: 'לאומי + בריאות', value: `${fmtNis(ex2.ni)} + ${fmtNis(ex2.health)}` },
              ]}
              answer={<>{fmtNis(ex2.total)} לרבעון; בערך {fmtNis(ex2.total / 3)} לחודש.</>}
              note={<>ההכנסה גדלה פי {n(25_000 / 12_000)}, אבל התשלום גדל פי {n(ex2.total / ex1.total)} — כי כמעט כל התוספת בשיעור הרגיל.</>} />}
            {ex1 && exOld && <SolveFirst level="מתקדם" status="interpretation" title="3. מקדמה מול שומה סופית"
              facts={<>ב״ל גובה מעצמאי מקדמה לפי ההכנסה האחרונה שידועה לו: 8,000 ₪ לחודש. בפועל ההכנסה השנה 12,000 ₪ לחודש, והוא לא ביקש תיקון.</>}
              ask="כמה חסר בשנה, ומתי זה יתברר? והאם מותר היה לבקש תיקון?"
              steps={[
                { label: 'לרבעון לפי 8,000 לחודש', value: fmtNis(exOld.total) },
                { label: 'לרבעון לפי 12,000 לחודש', value: fmtNis(ex1.total) },
                { label: 'החסר לרבעון', value: fmtNis(ex1.total - exOld.total) },
                { label: 'החסר לשנה (4 רבעונים)', value: fmtNis((ex1.total - exOld.total) * 4) },
                { label: `השינוי בהכנסה: 50%, מעל ${pct('ni.advances.changeThreshold')}`, value: 'מותר לבקש תיקון' },
              ]}
              answer={<>כ-{fmtNis((ex1.total - exOld.total) * 4)} לשנה, לפני הצמדה. בלי תיקון — זה יתברר בשומה הסופית. עם תיקון — ב״ל מחשב מחדש את כל השנה ומחייב את ההפרש לחודשים שעברו בנפרד.</>}
              note="בשומה הסופית ההפרש לכל חודש צמוד מהמועד של אותה מקדמה (מקור משני). האם בתיקון באמצע השנה נוספים הצמדה או קנס — לא אומת." />}
          </div>
        </Sec>

        <Sec id="ni-4" title="מקדמות, תיקון ושומה סופית">
          <div className="kn-two">
            <div className="kn-box"><strong>על מה נשענת המקדמה <ClaimTag status="verified" /></strong><span className="kn-small"><RV id="ni.advances.basis" year={EX_YEAR} /></span></div>
            <div className="kn-box"><strong>תיקון מקדמות <ClaimTag status="verified" /></strong><span className="kn-small"><RV id="ni.advances.change" year={EX_YEAR} /></span></div>
            <div className="kn-box"><strong>מתי נגבה <ClaimTag status="verified" /></strong><span className="kn-small"><RV id="ni.payment.day" year={EX_YEAR} /></span></div>
            <div className="kn-box"><strong>תיקון — גם לחודשים שעברו? <ClaimTag status="verified" /></strong><span className="kn-small"><RV id="ni.advances.retroScope" year={EX_YEAR} /></span></div>
          </div>
          <p className="kn-small" style={{ margin: 0 }}>ב״ל מזהיר שתיקון הכנסה עשוי להשפיע על זכאות וגובה גמלאות. הקטנת מקדמה אינה חיסכון — ההפרש מתיישב בשומה הסופית. ההשוואה המלאה מול מס הכנסה — בנושא «מקדמות והערכת מס».</p>
        </Sec>

        <Sec id="ni-5" title="מה לא מחושב כאן">
          <ul className="kn-small" style={{ margin: 0, paddingInlineStart: 18 }}>
            <li>בסיס מתחת לסף השיעור המופחת — הנוסחה הרבעונית לא מתאימה לו, ולכן אין תוצאה. <ClaimTag status="open" /></li>
            <li>הכנסה מזערית (<RV id="ni.se.minIncome" year={EX_YEAR} /> לחודש) ותקרת ההכנסה (<RV id="ni.se.maxIncome" year={EX_YEAR} />). <ClaimTag status="open" /></li>
            <li>מי שהגיע לגיל פרישה, מתחת לגיל 18, או מקבל קצבת אזרח ותיק — שיעורים אחרים. <ClaimTag status="open" /></li>
            <li>עיסוקים מעורבים (שכיר ועצמאי) ועסק משותף לבני זוג. <ClaimTag status="open" /></li>
          </ul>
          <div className="kn-box kn-small">
            <strong>עצמאית בחופשת לידה (R05)</strong>
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>
              <li>דמי הלידה אינם חלק מבסיס דמי הביטוח של העסק. ב״ל מנכה מהם במקור בשיעור עובד, ולא גובה מקדמות בחודשי הלידה <ClaimTag status="verified" />.</li>
              <li>חודשים אחרי הלידה בלי עבודה ובלי דמי לידה: כל עוד לא הודיעה לב״ל שהפסיקה לעבוד — היא עצמאית, ומחויבת לפחות בהכנסה המזערית (סעיף 5 לחוק) <ClaimTag status="verified" />. אחרי הודעה: נשואה לבן זוג מבוטח — פטורה; אחרת — כמי שאינו עובד (266 ₪ לחודש ב-2026) <ClaimTag status="verified" />.</li>
              <li>בדוח: דמי הלידה — 250 (עצמאית). דמי ביטוח שנוכו מדמי הלידה — לא מוסיפים ל-030 אוטומטית; אין מקור שמכיר בכך <ClaimTag status="open" />.</li>
            </ul>
          </div>
        </Sec>

        <Sec id="ni-mis" title="טעויות נפוצות">
          <Mistakes items={NI_LESSON.mistakes} year={EX_YEAR} />
        </Sec>

        <Sec id="ni-7" title="תרגול">
          <Quiz items={[
            { level: 'יסוד', q: 'מאילו דמי ביטוח מפחיתים חלק מההכנסה לב״ל?', options: [{ text: 'מדמי הביטוח הלאומי בלבד', right: true }, { text: 'גם מדמי ביטוח הבריאות', right: false }], why: `ההפחתה (${pct('ni.se.deductionShare')}) היא רק מדמי הביטוח הלאומי.` },
            { level: 'יסוד', q: 'עצמאי הקטין את ההכנסה המוצהרת לב״ל באמצע השנה. האם הוא חסך כסף?', options: [{ text: 'כן, דמי הביטוח ירדו', right: false }, { text: 'לא בהכרח — ההפרש מתיישב בשומה הסופית', right: true }], why: 'המקדמה היא תשלום על החשבון; החיוב הסופי נקבע לפי השומה.' },
            { level: 'יישום', q: 'אפשר לבקש תיקון מקדמות בב״ל כשההכנסה עלתה ב-5%?', options: [{ text: 'כן', right: false }, { text: `לא — רק בשינוי של ${pct('ni.advances.changeThreshold')} לפחות`, right: true }], why: 'לפי טופס בל/672 ודף «תיקון מקדמות»: פעם ברבעון, ורק בשינוי מספיק.' },
            { level: 'יישום', q: 'ההכנסה החייבת במס של עצמאי ירדה כי הפקיד הרבה לפנסיה. האם ההכנסה לב״ל ירדה באותו סכום?', options: [{ text: 'כן', right: false }, { text: 'לא — ב״ל מתחיל מההכנסה לפני ניכויים, ומפחית רק חלק מקופת הגמל', right: true }], why: 'סעיף 345: לפני פטורים, ניכויים וזיכויים; מופחת רק החלק שנקבע במס הכנסה.' },
            { level: 'מתקדם', q: 'עצמאי עם הכנסה של 6,000 ₪ לחודש. מה המחשבון יציג?', options: [{ text: 'סכום לפי הנוסחה הרבעונית', right: false }, { text: '«אין תוצאה» — הבסיס מתחת לסף', right: true }], why: `מתחת לסף הבסיס הוא הכנסה ÷ (1 + ${pct('ni.se.lowRateNi')}×${z}); הנוסחה הרבעונית של ב״ל מניחה בסיס מעל הסף. בסיס נכון ב-${EX_YEAR}: ${fmtNis(18_000 / (1 + t1 * z))} לרבעון, לעומת ${fmtNis((18_000 + m3 * z * (t2 - t1)) / (1 + t2 * z))} בנוסחה.` },
          ]} />
        </Sec>
      </>}

      {apply && (
        <Sec id="ni-6" title="מה עושים בתיק">
          <div className="kn-inform">
            <div><b>בתיק המס</b><span>מקדמה חודשית, בסיס דמי ביטוח לתקופה ורשימת ההכנסות (הצהרה ושומה) — כבר נקראים מב״ל לכל אדם.</span></div>
            <div><b>בטופס 1301 (2025)</b><span>סעיף 54, שדות 030/089 — דמי הביטוח הלאומי ששולמו בפועל על הכנסה שאינה מעבודה. הניכוי (<RV id="ni.se.deductionShare" year={EX_YEAR} />) מחושב במערכת. לא במסלול עסק זעיר.</span></div>
            <div><b>בחישוב</b><span>רבעון לעצמאי בגיל העבודה, מעל הסף — מחושב. מתחת לסף, מזערית, תקרה, גיל פרישה ומעורב — «אין תוצאה».</span></div>
          </div>
          <ol className="kn-small kn-steps">
            <li>לבדוק בתיק המס מה ב״ל יודע: המקדמה החודשית והכנסה שלפיה היא נגבית.</li>
            <li>להשוות להכנסה בספרים מתחילת השנה, לפני ניכויים אישיים.</li>
            <li>לחשב את הרבעון לפי ההכנסה בפועל, ולוודא שהבסיס מעל הסף ומתחת לתקרה.</li>
            <li>אם השינוי <RV id="ni.advances.changeThreshold" year={EX_YEAR} /> או יותר — להציע ללקוח תיקון, ולהסביר שתיקון מחשב מחדש את כל השנה ושההפרש לחודשים שעברו יחויב בנפרד.</li>
            <li>אם מקטינים — לומר במפורש שזה לא חיסכון, ושהקטנה עלולה להשפיע על גמלאות.</li>
            <li>בדוח השנתי — לרשום בסעיף 54 את מה ששולם בפועל בשנה, לפי האישור השנתי מב״ל.</li>
          </ol>
        </Sec>
      )}
    </>
  );
}
