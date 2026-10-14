// ─── מקדמות והערכת מס לפי חודש חתך — נושא מחקר פתוח ─────────────────────────
// ‼ לא תוכן סופי. מה שכאן: המושגים שהתשתית חייבת להבחין ביניהם, ומה ידוע
// ומה לא ידוע על שינוי מקדמות בכל רשות. זרימת ההערכה עצמה — src/features/taxEstimate (שלב 3).
// ‼ 11.10.2026: הנושא מלמד, אבל קודם כול מראה מה פתוח (מ-openItems — מקור אחד).
// הדוגמאות מלמדות סדר חשיבה ותאריכים; היכן שאין מקור — הדוגמה נגמרת ב«לא הוכרע»,
// ולא בכלל שהומצא. התוכן והסטטוס — lessonsMore.ts.

import { useState } from 'react';
import { RV, fmtNis } from '../RuleBits';
import { Sec, Quiz, type TopicBodyProps, type TocItem } from './shared';
import { Glossary, Thinking, Mistakes, SolveFirst, ClaimTag, Legend } from './lesson';
import { ADVANCES_LESSON } from './lessonsMore';
import { OPEN_ITEMS, STATUS_LABEL, MEANWHILE_LABEL } from '../../taxRules/openItems';
import { niSelfEmployedQuarter } from '../../taxRules/calc';
import { num } from '../../taxRules/registry';
import { AVAILABLE, NOT_RELEASED } from '../availability';

export const ADVANCES_TOC: TocItem[] = [
  { id: 'ad-open', label: 'מה פתוח', view: 'learn' }, { id: 'ad-0', label: 'מושגי יסוד', view: 'learn' },
  { id: 'ad-2', label: 'חודש חתך', view: 'learn' }, { id: 'ad-3', label: 'ארבעה תאריכים', view: 'learn' },
  { id: 'ad-think', label: 'איך חושבים', view: 'learn' }, { id: 'ad-4', label: 'מס הכנסה מול ב״ל', view: 'learn' },
  { id: 'ad-ex', label: 'דוגמאות פתורות', view: 'learn' }, { id: 'ad-mis', label: 'טעויות נפוצות', view: 'learn' },
  { id: 'ad-8', label: 'תרגול', view: 'learn' },
  { id: 'ad-7', label: 'מה עושים בתיק', view: 'apply' }, { id: 'ad-5', label: 'לפני שמחשבים', view: 'apply' },
  { id: 'ad-6', label: 'מקרי קבלה', view: 'apply' },
];

const MONTHS = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];

// ‼ כל הכללים של מקדמות במרשם הם לשנת 2026 (פרק ח במדריך 2025 מתאר את מקדמות 2026).
const EX_YEAR = 2026;
const niQ = (monthly: number) => niSelfEmployedQuarter({ year: EX_YEAR, quarterlyIncome: monthly * 3 }).value;
const pctOf = (id: string) => `${+(num(id, EX_YEAR) * 100).toFixed(2)}%`;

export default function AdvancesBody({ year, view }: TopicBodyProps) {
  const [cutoff, setCutoff] = useState(9);
  // ‼ חודש החתך (עד מתי נתוני אמת) ≠ החודש שבו שינוי המקדמה נכנס לתוקף. הערכה
  // שהוכנה באוקטובר על נתונים עד ספטמבר יכולה לשנות מקדמה מנובמבר — או ממועד אחר.
  const [effective, setEffective] = useState(11);
  const y = year;
  const past = effective - 1;
  const learn = view !== 'apply';
  const apply = view !== 'learn';
  const openItems = OPEN_ITEMS.filter(i => i.topicId === 'advances' && i.status !== 'closed');

  // דוגמה 2 — תחזית: 9 חודשים של 20,000, ועסקה חד־פעמית של 60,000 במרץ.
  const actual = 9 * 20_000 + 60_000;
  const naive = actual / 9 * 12;
  const right = actual + 3 * 20_000;
  // דוגמה 3 — ב״ל: מקדמה לפי 8,000 לחודש, בפועל 12,000; המקדמה החדשה מנובמבר.
  const qOld = niQ(8_000), qNew = niQ(12_000);
  const perMonthGap = qOld && qNew ? (qNew.total - qOld.total) / 3 : 0;

  return (
    <>
      {learn && <>
        <Sec id="ad-open" title="מה פתוח — לפני הכול">
          <p className="kn-small" style={{ margin: 0 }}>זה נושא מחקר. חלק מהשאלות החשובות בו <strong>לא הוכרעו</strong>, והמערכת לא מחשבת לפיהן. כדאי לדעת אותן לפני שלומדים את השאר. <ClaimTag status="open" /></p>
          <div className="kn-two">
            {openItems.map(i => (
              <div key={i.id} className="kn-box">
                <strong className="kn-small">{i.title}</strong>
                <span className="kn-xs kn-muted">{STATUS_LABEL[i.status]} · בינתיים: {MEANWHILE_LABEL[i.meanwhile]}</span>
                <span className="kn-small"><strong>חסר: </strong>{i.missing}</span>
                <span className="kn-small"><strong>מה המערכת עושה: </strong>{i.meanwhileText}</span>
              </div>
            ))}
          </div>
        </Sec>

        <Sec id="ad-0" title="מושגי יסוד">
          <p className="kn-small kn-muted" style={{ margin: 0 }}>חמשת המושגים הראשונים הם של שיטת העבודה במשרד; השאר — של הרשויות.</p>
          <Glossary terms={ADVANCES_LESSON.glossary} year={EX_YEAR} />
          <Legend />
        </Sec>

        <Sec id="ad-2" title="חודש חתך: אמת מול תחזית">
          <p className="kn-oneliner">הערכת מס שנתית = נתוני אמת עד <strong>חודש החתך</strong> + תחזית מאושרת לשאר השנה. אחר כך משווים למקדמות — <strong>בנפרד</strong> במס הכנסה ובביטוח לאומי, כי המנגנונים שונים.</p>
          <label className="kn-field" htmlFor="ad-cut" style={{ maxWidth: 320 }}>חודש החתך
            <select id="ad-cut" value={cutoff} onChange={e => setCutoff(+e.target.value)}>{MONTHS.slice(0, 11).map((m, i) => <option key={m} value={i + 1}>{m} (חודש {i + 1})</option>)}</select>
          </label>
          <div className="kn-months" role="img" aria-label={`${cutoff} חודשי נתוני אמת ו-${12 - cutoff} חודשי תחזית`}>
            {MONTHS.map((m, i) => <span key={m} className={i < cutoff ? 'actual' : 'forecast'}>{m}</span>)}
          </div>
          <div className="kn-legend"><span><i style={{ background: 'var(--ok-bg)' }} />נתוני אמת (ספרים סגורים)</span><span><i />תחזית</span></div>
          <div className="kn-prose">
            <p><strong>התחזית אינה ממוצע.</strong> היא נבנית מהערכת הלקוח ומהערכת המשרד, עם עונתיות, שינויים צפויים ואירועים חד־פעמיים. אירוע חד־פעמי לא מוכפל בקצב שנתי. כל הנחה נשמרת עם מקור, והמשרד מאשר את התרחיש שמשמש לחישוב. <ClaimTag status="interpretation" /></p>
            <p>חודש ריק אינו אפס. רווח והפסד מפייפרלס נשמר לפני תיאומי מס; התיאומים — בנפרד.</p>
          </div>
        </Sec>

        <Sec id="ad-3" title="ארבעה תאריכים שונים">
          <div className="kn-two">
            <div className="kn-box"><strong>חודש החתך</strong><span className="kn-small">עד מתי נתוני ההכנסה הם אמת. קובע רק מה אמת ומה תחזית.</span></div>
            <div className="kn-box"><strong>תאריך ההערכה</strong><span className="kn-small">מתי ההערכה הוכנה ואושרה. נשמר עם גרסת הכללים. בדרך כלל אחרי החתך — ספרי ספטמבר נסגרים באוקטובר.</span></div>
            <div className="kn-box"><strong>מועד תחילת השינוי במקדמה</strong><span className="kn-small">מאיזה חודש המקדמה החדשה חלה ברשות. נקבע לפי הבקשה והטיפול ברשות — לא לפי חודש החתך.</span></div>
            <div className="kn-box"><strong>תאריך בדיקת היתרות</strong><span className="kn-small">מתי נקראו המקדמות והתשלומים ברשות. תשלום שבוצע אחרי החתך נספר פעם אחת — לפי תאריך הבדיקה, לא שוב בתחזית.</span></div>
          </div>
          <p className="kn-xs kn-muted" style={{ margin: 0 }}>ההבחנה בין ארבעת התאריכים היא שיטת העבודה של המשרד, לא כלל של רשות. <ClaimTag status="interpretation" /></p>
        </Sec>

        <Sec id="ad-think" title="איך חושבים על הערכה ומקדמות">
          <p className="kn-small kn-muted" style={{ margin: 0 }}>הסדר שבו עוברים מהספרים להמלצה ללקוח. השאלה שעדיין פתוחה מסומנת — לא מדלגים עליה.</p>
          <Thinking steps={ADVANCES_LESSON.thinking} year={EX_YEAR} />
        </Sec>

        <Sec id="ad-4" title="מס הכנסה מול ביטוח לאומי">
          <div className="kn-two">
            <div className="kn-field">חודש החתך (נבחר למעלה)<output>{MONTHS[cutoff - 1]} — נתוני אמת עד סופו</output></div>
            <label className="kn-field" htmlFor="ad-eff">המקדמה החדשה חלה מחודש
              <select id="ad-eff" value={effective} onChange={e => setEffective(+e.target.value)}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
            </label>
          </div>
          {effective <= cutoff && <p className="kn-xs kn-muted" style={{ margin: 0 }}>השינוי חל לפני סוף תקופת הנתונים — אפשרי (למשל בקשה שהוגשה מוקדם), אבל ההערכה עצמה עדיין נשענת על הנתונים עד {MONTHS[cutoff - 1]}.</p>}
          <div className="kn-page" style={{ gap: 6 }}>
            <div className="kn-small"><strong>מס הכנסה</strong> — המקדמה החדשה חלה מ{MONTHS[effective - 1]}. על החודשים שלפניו אין דרישה כשהלקוח ביקש את ההעלאה: אפשר להשלים מרצון, ואין ריבית או קנס בתוך השנה <ClaimTag status="verified" />. הגדלה בידי פקיד השומה (180(ב)) — האם נדרשים גם החודשים שעברו, לא פורסם <ClaimTag status="open" />.</div>
            <div className="kn-months" role="img" aria-label={`מס הכנסה: ${past} חודשים שאפשר להשלים מרצון, ${13 - effective} חודשים במקדמה החדשה`}>
              {MONTHS.map((m, i) => <span key={m} className={i < past ? 'unknownretro' : 'newrate'}>{m}</span>)}
            </div>
            <div className="kn-small"><strong>ביטוח לאומי</strong> — התיקון חל מינואר: גם החודשים שלפני {MONTHS[effective - 1]} מחושבים מחדש, וההפרש מחויב בנפרד («הגדלת מקדמות») <ClaimTag status="verified" />. הצמדה מהמועדים המקוריים — צפויה <ClaimTag status="interpretation" />; ריבית — אין; קנס — רק אם החיוב לא שולם במועד שב״ל קבע <ClaimTag status="open" />.</div>
            <div className="kn-months" role="img" aria-label={`ביטוח לאומי: ${past} חודשים שבהם צפויה השלמה, ${13 - effective} חודשים במקדמה החדשה`}>
              {MONTHS.map((m, i) => <span key={m} className={i < past ? 'catchup' : 'newrate'}>{m}</span>)}
            </div>
            <div className="kn-legend"><span><i className="newrate" />תשלום שוטף חדש</span><span><i className="catchup" />השלמה צפויה לחודשים שעברו</span><span><i className="unknownretro" />מס הכנסה: השלמה מרצון, לא חובה</span></div>
          </div>

          <div className="kn-box kn-small">
            <strong>אם משנים מקדמה — ארבעה דברים נפרדים, לא אחד</strong>
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>
              <li><strong>הפרש (הקרן):</strong> בב״ל — חיוב «הגדלת מקדמות» = ההפרש × החודשים שעברו, במועד שב״ל קובע. במס הכנסה — אין דרישה; השלמה מרצון = הפרש השיעור × המחזור שכבר דווח.</li>
              <li><strong>הצמדה:</strong> בב״ל — צפויה מהמועד המקורי של כל חודש (תקנה 6(ב)); לא אושרה ברשות ולא מחושבת. במס הכנסה — אין בתוך השנה; על יתרה אחרי 31.12 — לפי 187.</li>
              <li><strong>ריבית:</strong> בב״ל — אין, אלא בהסדר תשלומים. במס הכנסה — 4% על יתרה מ-1.1, עם הקלה (187א): תשלום עד 31.1 — פטור מלא; בפברואר — חצי; במרץ — רבע.</li>
              <li><strong>קנס:</strong> בב״ל — רק אם החיוב לא שולם במועדו (364). במס הכנסה — אין על השלמה; קנס 190(א)(1) רק על מקדמה שנדרשה ולא שולמה יותר מ-7 ימים; 0.2% לשבוע אינו חל על מקדמות.</li>
              <li><strong>פתוח:</strong> הגדלה בידי פקיד השומה (180(ב)) — האם נשלחת דרישה גם לחודשים שעברו. בודקים במכתב ההגדלה וב-134. מקדמה לפי סכום קבוע — ההשלמה = הפרש הסכום × התקופות.</li>
            </ul>
            <span className="kn-xs kn-muted">מקורות: פקודה 175, 180, 187, 187א, 190 (ויקיטקסט) ומדריך 2025 סעיף 10ד; תקנות המקדמות 6(ב), חוק הביטוח הלאומי 345, 364, 368(ב); שאלות ותשובות ב״ל וטופס 672. <ClaimTag status="verified" /></span>
          </div>

          <div className="kn-tbl-wrap"><table className="kn-tbl kn-tbl-wide">
            <thead><tr><th>רכיב</th><th>מס הכנסה</th><th>ביטוח לאומי</th></tr></thead>
            <tbody>
              <tr><td>על מה נשענת המקדמה</td><td><RV id="it.advances.methods" year={y} /></td><td><RV id="ni.advances.basis" year={y} /></td></tr>
              <tr><td>שינוי — מי ומתי</td><td><RV id="it.advances.increase" year={y} /><div className="kn-xs kn-muted" style={{ marginTop: 4 }}><RV id="it.advances.reduce" year={y} /></div></td><td><RV id="ni.advances.change" year={y} /></td></tr>
              <tr><td>תשלום שוטף חדש</td><td>מהחודש שבו השינוי חל ברשות — לפי השיעור החדש</td><td>לפי ההכנסה המעודכנת, בהוראת הקבע (<RV id="ni.payment.day" year={y} />)</td></tr>
              <tr><td>חודשים שעברו</td><td><RV id="it.advances.voluntaryIncreaseRetro" year={y} /></td><td><RV id="ni.advances.retroScope" year={y} /></td></tr>
              <tr><td>קנס</td><td><RV id="it.advances.latePayment" year={y} /><div className="kn-xs kn-muted" style={{ marginTop: 4 }}><RV id="it.lateFine" year={y} /></div></td><td rowSpan={2}><RV id="ni.advances.charges" year={y} /></td></tr>
              <tr><td>ריבית והצמדה</td><td><RV id="it.advances.unjustifiedReduction" year={y} /><div className="kn-xs kn-muted" style={{ marginTop: 4 }}><RV id="it.advances.yearEndBalance" year={y} /></div></td></tr>
              <tr><td>קיזוז וגבייה</td><td><RV id="it.advances.withholdingOffset" year={y} /></td><td>חוב — לא נגבה בהוראת הקבע בלי הסכמה; תשלום בהסדר נושא ריבית</td></tr>
              <tr><td>זכות ביתרה</td><td><RV id="it.refund" year={y} /></td><td>מוחזרת אחרי השומה הסופית; הפרש קטן מ-90 ₪ לשנה לא מוחזר ולא נגבה (נוסח משני)</td></tr>
              <tr><td>האם זה חיסכון</td><td><RV id="it.advances.notSaving" year={y} /></td><td>לא — דחייה עד השומה הסופית; הקטנה עלולה להשפיע על גמלאות בינתיים</td></tr>
            </tbody>
          </table></div>
          <p className="kn-small" style={{ margin: 0 }}><strong>אומדן מול חיוב:</strong> כל מה שהמשרד מחשב לפני שהרשות מחייבת הוא אומדן. החיוב בפועל — רק אחרי פעולה מורשית ובדיקה חוזרת ברשות, עם אסמכתה. זכות ברשות אינה החזר מיידי לבנק.</p>
        </Sec>

        <Sec id="ad-ex" title="דוגמאות פתורות">
          <p className="kn-small kn-muted" style={{ margin: 0 }}>מהקל לקשה. בדוגמה האחרונה חלק אחד עדיין פתוח — והוא מסומן, כי כך נראית תשובה נכונה כשאין מקור.</p>
          <div className="kn-solves">
            <SolveFirst level="יסוד" status="interpretation" title="1. ארבעה תאריכים"
              facts={<>ספרי ספטמבר נסגרו ב-12 באוקטובר. ב-15 באוקטובר המשרד הכין הערכה ואישר אותה. ב-20 באוקטובר נקראו המקדמות ברשויות. הבקשה לשינוי הוגשה, וב״ל עדכן את המקדמה מנובמבר.</>}
              ask="מה חודש החתך, תאריך ההערכה, תאריך בדיקת היתרות ומועד תחילת השינוי?"
              steps={[
                { label: 'חודש החתך — הספרים האחרונים שסגורים', value: 'ספטמבר' },
                { label: 'תאריך ההערכה — מתי הוכנה ואושרה', value: '15.10' },
                { label: 'תאריך בדיקת היתרות — מתי נקראו המקדמות', value: '20.10' },
                { label: 'מועד תחילת השינוי — מה שהרשות קבעה', value: 'נובמבר' },
              ]}
              answer={<>ארבעה תאריכים שונים. נובמבר לא «נגזר» מספטמבר — הוא נקבע ברשות. אם ב״ל היה מעדכן מדצמבר, ההערכה לא משתנה; רק מספר החודשים שעברו גדל.</>} />
            <SolveFirst level="יישום" status="interpretation" title="2. תחזית שאינה ממוצע"
              facts={<>עסק מרוויח {fmtNis(20_000)} בחודש, בלי עונתיות. במרץ הייתה גם עסקה חד־פעמית של {fmtNis(60_000)}. חודש החתך: ספטמבר.</>}
              ask="מה ההכנסה השנתית הצפויה?"
              steps={[
                { label: 'נתוני אמת עד ספטמבר: 9 × 20,000 + 60,000', value: fmtNis(actual) },
                { label: 'הטעות: ממוצע × 12', value: fmtNis(naive) },
                { label: 'נכון: תחזית לשלושת החודשים שנותרו, בלי העסקה החד־פעמית', value: fmtNis(3 * 20_000) },
                { label: 'אמת + תחזית', value: fmtNis(right) },
              ]}
              answer={<>{fmtNis(right)}. הממוצע מנפח את השנה ב-{fmtNis(naive - right)}, כי הוא מכפיל את העסקה החד־פעמית.</>}
              note="שיטת התחזית היא החלטת משרד, לא כלל של רשות. במקרה אמיתי — גם עונתיות, חוזים שהסתיימו וחוזים חדשים." />
            {qOld && qNew && <SolveFirst level="מתקדם" status="interpretation" title="3. תיקון בב״ל באמצע השנה"
              facts={<>ב״ל גובה מעצמאי מקדמה לפי 8,000 ₪ לחודש. באוקטובר הספרים מראים 12,000 ₪ לחודש מתחילת השנה. הוגש תיקון, וב״ל עדכן את המקדמה מנובמבר. (ערכי {EX_YEAR}, לפי הנוסחה הרבעונית של ב״ל.)</>}
              ask="מותר לתקן? מה המקדמה החדשה, ומה יקרה לינואר עד אוקטובר?"
              steps={[
                { label: `השינוי בהכנסה: 50%, מעל ${pctOf('ni.advances.changeThreshold')}`, value: 'מותר' },
                { label: 'מקדמה חודשית לפי 8,000 (רבעון ÷ 3)', value: fmtNis(qOld.total / 3) },
                { label: 'מקדמה חודשית לפי 12,000 (רבעון ÷ 3)', value: fmtNis(qNew.total / 3) },
                { label: 'ההפרש לכל חודש שעבר', value: fmtNis(perMonthGap) },
                { label: 'ינואר עד אוקטובר: 10 חודשים', value: fmtNis(perMonthGap * 10) },
              ]}
              answer={<>מנובמבר {fmtNis(qNew.total / 3)} לחודש. על ינואר עד אוקטובר — חיוב נפרד של «הגדלת מקדמות», כ-{fmtNis(perMonthGap * 10)}. בנפרד: הצמדה מהמועדים המקוריים — צפויה, לא מחושבת; ריבית — אין; קנס — רק אם לא משלמים במועד החיוב. בלי ההגדלה ההפרש היה נגבה בשומה הסופית, עם הצמדה עד יום החישוב.</>}
              note="החישוב מחדש של כל השנה והחיוב הנפרד — תקנה 6(ב) וחוזר ב״ל (רשמי). חלוקת הרבעון ל-3 היא קירוב שלנו לחיוב החודשי." />}
            <SolveFirst level="מתקדם" status="interpretation" title="4. העלאה במס הכנסה — חודשים שעברו"
              facts={<>מקדמת מס הכנסה לפי שיעור מהמחזור: 5%. המחזור מינואר עד אוקטובר — {fmtNis(400_000)}. לבקשת הלקוח השיעור הועלה ל-7% מנובמבר.</>}
              ask="האם הלקוח חייב בהפרש לינואר עד אוקטובר? מה יעלה לו אם לא ישלים עכשיו?"
              steps={[
                { label: 'ההפרש לחודשים שעברו: 2% × 400,000', value: fmtNis(400_000 * 0.02) },
                { label: 'דרישה לחודשים שעברו בהעלאה לבקשת הלקוח', value: 'אין — השלמה מרצון' },
                { label: 'ריבית, הצמדה וקנס בתוך השנה', value: '0' },
                { label: 'אם נשאר חוב בסוף השנה ומשלמים עד 31.1', value: 'פטור מלא (187א)' },
                { label: 'אם פקיד השומה הגדיל לפי 180(ב)', value: 'לבדוק במכתב — פתוח' },
              ]}
              answer={<>אין חיוב לחודשים שעברו. {fmtNis(400_000 * 0.02)} הם חלק מהיתרה הצפויה לשנה: אפשר להשלים עכשיו, או עד 31.1 — באותה עלות. השלמה בתוך השנה חוסכת רק אם הוקטנה מקדמה השנה (190(א)(2)) או שהעסק לא דווח (190(א)(4)).</>}
              note="פקודה 175, 187, 187א, 190 (ויקיטקסט) ומדריך 2025 סעיף 10ד. ההשלמה היא תשלום על חשבון השנה — לא «הוצאה שנחסכה»." />
          </div>
        </Sec>

        <Sec id="ad-mis" title="טעויות נפוצות">
          <Mistakes items={ADVANCES_LESSON.mistakes} year={EX_YEAR} />
        </Sec>

        <Sec id="ad-8" title="תרגול">
          <Quiz items={[
            { level: 'יסוד', q: 'ספרי אוגוסט נסגרו בספטמבר, וההערכה הוכנה באוקטובר. מה חודש החתך?', options: [{ text: 'אוגוסט', right: true }, { text: 'ספטמבר', right: false }, { text: 'אוקטובר', right: false }], why: 'חודש החתך הוא החודש האחרון שהספרים שלו סגורים. אוקטובר הוא תאריך ההערכה.' },
            { level: 'יסוד', q: 'האם הקטנת מקדמה במס הכנסה היא חיסכון במס?', options: [{ text: 'כן', right: false }, { text: 'לא — רק דחייה; הקטנה לא מוצדקת עולה בריבית והצמדה', right: true }], why: 'המס נקבע בדוח. הקטנה לא מוצדקת — ריבית והפרשי הצמדה מאמצע השנה (סעיף 190).' },
            { level: 'יישום', q: 'עצמאי שילם מקדמה לב״ל ב-22 באוקטובר, אחרי חודש החתך (ספטמבר). איך סופרים אותה?', options: [{ text: 'פעם אחת, לפי תאריך בדיקת היתרות', right: true }, { text: 'גם בנתוני האמת וגם בתחזית', right: false }], why: 'תשלום נספר פעם אחת. תאריך הבדיקה קובע מה כבר שולם.' },
            { level: 'יישום', q: 'ב״ל עדכן מקדמה כלפי מעלה מנובמבר. מה יקרה לינואר עד אוקטובר?', options: [{ text: 'כלום — השינוי רק מכאן והלאה', right: false }, { text: 'חישוב מחדש של כל השנה, וחיוב נפרד על ההפרש', right: true }], why: 'התיקון חל מינואר (ב״ל) — «הגדלת מקדמות» כחיוב נפרד. הצמדה צפויה; ריבית אין; קנס רק אם לא משלמים במועד החיוב.' },
            { level: 'מתקדם', q: 'לקוח שואל: «אם נעלה את שיעור המקדמה במס הכנסה מנובמבר, יחייבו אותי על החודשים שעברו?» מה עונים?', options: [{ text: '«כן, עם ריבית מינואר»', right: false }, { text: '«בהעלאה לבקשתך — לא. אפשר להשלים מרצון; תשלום עד 31.1 פוטר מריבית. אם פקיד השומה יגדיל — נבדוק במכתב»', right: true }], why: 'השלמה מרצון אינה דרישה; ריבית רק על יתרה מ-1.1 (187), עם הקלת 187א. דרישה בהגדלה לפי 180(ב) — לא פורסמה.' },
            { level: 'מתקדם', q: 'מקדמת מס הכנסה שולמה באיחור של שבועיים. מה חל עליה?', options: [{ text: 'קנס פיגורים של 0.2% לשבוע', right: false }, { text: 'קנס בגובה הפרשי הצמדה וריבית — 190(א)(1), כי האיחור מעל 7 ימים', right: true }], why: 'קנס הפיגורים 0.2% לשבוע חל על מס לפי דוח או שומה — לא על מקדמות. על מקדמה שנדרשה ואוחרה יותר מ-7 ימים — 190(א)(1).' },
          ]} />
        </Sec>
      </>}

      {apply && <>
        <Sec id="ad-7" title="מה עושים בתיק">
          {AVAILABLE.taxEstimate
            ? <p className="kn-small kn-muted" style={{ margin: 0 }}>ההערכה במערכת: בתיק הלקוח › «תיק מס» › הערכת מס לשנה › «הערכת המס» — נתוני אמת עד החתך, תחזית, קריאת 134 וב״ל, מקדמה מומלצת וגרסה מאושרת. לכל שינוי מקדמה — ארבע שורות נפרדות: הפרש, הצמדה, ריבית וקנס, כל אחת במעמד שלה (מחושב / צפוי — לא אושר ברשות / הסבר בלבד). אפשר לעבוד גם ביד לפי הסדר הזה.</p>
            : <p className="kn-small kn-muted" style={{ margin: 0 }}>הערכת מס במערכת — {NOT_RELEASED}. בינתיים עובדים ביד לפי הסדר הזה: נתוני אמת עד החתך, תחזית, קריאת 134 וב״ל, ומקדמה מומלצת. לכל שינוי — ההפרש, ההצמדה, הריבית והקנס בנפרד, ולכל אחד מקור.</p>}
          <div className="kn-inform">
            <div><b>בטופס 1301 (2025)</b><span>חלק טו — מחזור למקדמות, מקדמות וניכוי במקור (שדה 294 ועוד).</span></div>
            <div><b>מחוץ לדוח</b><span>מקדמות נקבעות ומשולמות במהלך השנה — במס הכנסה ובב״ל, כל רשות לחוד.</span></div>
            <div><b>הרשאה</b><span>אין הרשאה לשנות מקדמות מהמערכת. פעולה ברשות — ביד, ואחריה קריאה חוזרת ואסמכתה.</span></div>
          </div>
          <ol className="kn-small kn-steps">
            <li>לסגור ספרים עד חודש החתך, ולרשום את החודש.</li>
            <li>לבנות תחזית לכל חודש שנותר, עם הנחה ומקור לכל אחד. לסמן אירועים חד־פעמיים — לא להכפיל אותם.</li>
            <li>לקרוא את המקדמות והתשלומים בכל רשות, ולרשום את תאריך הבדיקה.</li>
            <li>להשוות בנפרד: במס הכנסה — שיעור או סכום, מול המס הצפוי; בב״ל — ההכנסה שלפיה נגבה, מול ההכנסה בפועל (תיקון רק בשינוי של <RV id="ni.advances.changeThreshold" year={EX_YEAR} /> לפחות).</li>
            <li>אם משנים: לחשב את ההפרש לחודשים שעברו — בב״ל חיוב, במס הכנסה השלמה מרצון — ולכתוב בנפרד הצמדה, ריבית וקנס. בהגדלה של פקיד השומה — לבדוק במכתב.</li>
            <li>להציג ללקוח אומדן, עם מה שפתוח. להסביר שהקטנה אינה חיסכון.</li>
            <li>אחרי פעולה ברשות — לקרוא שוב את החיוב, ולשמור אסמכתה.</li>
          </ol>
        </Sec>

        <Sec id="ad-5" title="מה עוד פתוח לפני שמחשבים">
          <ul className="kn-small" style={{ margin: 0, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li>מס הכנסה: הגדלה בידי פקיד השומה (180(ב)) — האם נדרשים גם החודשים שעברו (הוראת ביצוע 4/94 לא פורסמה). צווי הגדלת מקדמות ל-2025 ול-2026 (סעיף 181א) — לא נמצאו.</li>
            <li>ביטוח לאומי: קנס על «הגדלת מקדמות» — לא פורסם אם נגבה מהמועדים המקוריים. ההצמדה — צפויה, ולא מחושבת כי תלויה במדד.</li>
            <li><strong>איך מכריעים:</strong> תנאי התחולה והחיובים — ממקורות רשמיים (חוק, תקנות, חוזרים והנחיות). דוגמה אנונימית מהמשרד מאמתת רק את ההתנהגות במקרה שלה, ומשמשת להצלבה — לא כהכרעה כללית.</li>
            <li>אין הרשאה לשנות מקדמות מהמערכת. אחרי פעולה מורשית — קריאה חוזרת של החיוב ושמירת אסמכתה.</li>
          </ul>
        </Sec>

        <Sec id="ad-6" title="מקרי קבלה לשלב ההערכה">
          <div className="kn-two">
            {['חתך ספטמבר, הערכה באוקטובר, שינוי מנובמבר — שלושה מועדים שונים', 'עסק שנפתח באמצע השנה', 'אירוע חד־פעמי שלא מוכפל', 'ניכוי במקור מלקוחות', 'תשלום מקדמה אחרי החתך — נספר פעם אחת', 'הגדלה שיוצרת השלמה — בנפרד לכל רשות', 'הקטנה שאינה החזר מיידי', 'השפעה אפשרית של תיקון הכנסה בב״ל על גמלאות'].map(t => (
              <div key={t} className="kn-box"><span className="kn-small">{t}</span></div>
            ))}
          </div>
        </Sec>
      </>}
    </>
  );
}
