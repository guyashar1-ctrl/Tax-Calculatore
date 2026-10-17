// ─── עוסק פטור או עוסק מורשה — לפי המחזור ולפי הענף (16.10.2026) ──────────────────────────
// ‼ בקשת גיא (16.10): «ענפים מסוימים יהיו מסווגים כעוסק מורשה אוטומטית… לתת לזה מענה גם בטופס 821 וגם בידע מס».
//   מקורות: חוק מע״מ ס׳ 1 ו-31(3) (נבו), תקנות הרישום תקנות 13–15 (נוסח 10.12.2024), שאלות ותשובות רשות המסים
//   (התקרה לשנת 2026 — במרשם: vat.exemptCeiling), רשימת הענפים של רשות המסים (591). פירוט ומפת טענות:
//   docs/tax-foundation/research/vat-dealer-classification-2026-10-16.md. המיפוי ענף ⇒ חובת מורשה הוא **פרשנות**.
// ‼ אותו מנוע כמו בטופס 821: dealerKindOf / licensedRuleOf — מה שהנושא מסביר הוא מה שהטופס עושה.

import { useMemo, useState } from 'react';
import { Sec, Quiz, type TopicBodyProps, type TocItem } from './shared';
import { ClaimTag, Legend, Glossary, Thinking, Mistakes, type Lesson } from './lesson';
import { RV } from '../RuleBits';
import { LICENSED_BY_BRANCH, REG13_TEXT, VAT_BRANCHES, VAT_BRANCHES_CHECKED_AT, SECTION_LABEL, licensedRuleOf, searchBranches, type Reg13Group } from '../../../data/vatBranches';
import { num } from '../../taxRules/registry';

export const DEALER_TOC: TocItem[] = [
  { id: 'dt-0', label: 'מה ההבדל', view: 'learn' }, { id: 'dt-1', label: 'התקרה', view: 'learn' },
  { id: 'dt-2', label: 'מי מורשה בכל מקרה', view: 'learn' }, { id: 'dt-3', label: 'ענף ⇒ סיווג', view: 'learn' },
  { id: 'dt-4', label: 'עסק חדש: איך מעריכים מחזור', view: 'learn' }, { id: 'dt-5', label: 'חריגה באמצע השנה', view: 'learn' },
  { id: 'dt-6', label: 'מה פתוח', view: 'learn' }, { id: 'dt-8', label: 'תרגול', view: 'learn' },
  { id: 'dt-7', label: 'מה עושים בתיק ובטופס 821', view: 'apply' },
];

export const DEALER_LESSON: Lesson = {
  mustKnow: [
    { text: '«עוסק פטור» הוא עוסק שמחזור העסקאות שלו בכל עסקיו אינו עולה על {{vat.exemptCeiling}} לשנה (סעיף 1 לחוק מע״מ). עסקאותיו פטורות ממע״מ (31(3)) — והוא אינו מקזז מס תשומות.', status: 'verified' },
    { text: 'תקנה 13 לתקנות הרישום: שמונה קבוצות נרשמות כעוסק מורשה גם כשהמחזור מתחת לתקרה — מקצועות חופשיים, רופאים, בתי ספר לנהיגה, בתי ספר וגנים, סוחרי/מתווכי מקרקעין ורכב, חברות ואגודות שיתופיות.', status: 'verified' },
    { text: 'הענף בטופס 821 ובמסך «פתיחת תיק» הוא קוד מרשימת רשות המסים (591 ענפים, הסיווג האחיד של הלמ״ס). הרשימה אינה אומרת מי פטור ומי מורשה — זה נגזר מהמקצוע (תקנה 13) ומהמחזור.', status: 'verified' },
    { text: 'איזה קוד ענף «הוא» מקצוע חופשי — פרשנות של המשרד: עורך דין, רואה חשבון, יועץ מס, אדריכל, מהנדס, רופא, פסיכולוג — ברור; הדרכה, בריאות אחרת, השכרת רכב — תלוי בפרטים.', status: 'interpretation' },
    { text: 'עסק שטרם החל: המחזור לרישום הוא הסכום המשוער לשנה הבאה כאילו יפעל כל השנה (תקנה 14(ב)).', status: 'verified' },
    { text: 'עוסק פטור מצהיר על המחזור בפועל עד 31 בינואר (תקנה 15). חרג מהתקרה — נרשם כמורשה.', status: 'verified' },
  ],
  action: { text: 'בטופס 821 בוחרים ענף מהרשימה; PIVO מציג «לפי הענף: עוסק מורשה» או «לפי המחזור: פטור/מורשה (תקרה {{vat.exemptCeiling}})», ושומר את הסוג בכרטיס העסק. המשרד מכריע כשהענף «מותנה».', status: 'interpretation' },
  glossary: [
    { term: 'מחזור עסקאות', plain: 'סך העסקאות בכל עסקי העוסק, לפי חוק מע״מ, בלי המע״מ. עסק חלקי בשנה — ממוצע חודשי כפול 12 (תקנה 14(א)).', where: 'חוק מע״מ ס׳ 1; תקנות הרישום 14', status: 'verified' },
    { term: 'עוסק פטור', plain: 'מחזור עד {{vat.exemptCeiling}}: לא גובה מע״מ, לא מקזז תשומות, מצהיר פעם בשנה. אינו «פטור ממס הכנסה» — זה סיווג במע״מ בלבד.', where: 'ס׳ 1, 31(3)', status: 'verified' },
    { term: 'עוסק מורשה', plain: 'גובה מע״מ בעסקאותיו, מקזז תשומות, מדווח תקופתית. מי שבתקנה 13 — מורשה גם במחזור קטן.', where: 'תקנה 13', status: 'verified' },
    { term: 'עוסק זעיר (מע״מ)', plain: 'הגדרה ישנה בחוק מע״מ, נמחקה. לא לבלבל עם «בעל עסק זעיר» במס הכנסה (87ב–87ז) — זה מסלול של מס הכנסה, והתקרה שלו היא אותו סכום.', where: 'חוק מע״מ ס׳ 1', status: 'verified' },
    { term: 'ענף כלכלי', plain: 'קוד 3–4 ספרות מהסיווג האחיד של הלמ״ס 2011, כפי שרשות המסים משתמשת בו («ענפים כלכליים»). לדוגמה 6910 שירותים משפטיים, 6921 ראיית חשבון, 5320 שירותי בלדרות.', where: 'misim.gov.il/mm_anafim', status: 'verified' },
    { term: 'תקנה 6א', plain: 'שירותים שבהם המס משולם על ידי מקבל השירות (למשל שירותים מסוימים למלכ״ר ולמוסד כספי). נותן שירות כזה נרשם כמורשה «לגבי אותם שירותים בלבד».', where: 'תקנות מע״מ 6א; תקנה 13(1) סיפה', status: 'verified' },
  ],
  thinking: [
    { q: 'מה המקצוע או העיסוק בפועל — לא רק הקוד?', why: 'תקנה 13 מדברת על מקצועות (עורך דין, רופא, סוכן ביטוח…). הקוד הוא עזר לזיהוי; העיסוק קובע.', status: 'verified' },
    { q: 'הוא באחת מקבוצות 13(1)–(6)?', why: 'אם כן — מורשה, בלי לבדוק מחזור. שימו לב לסייגים: הדרכה מקרית (עד 30 ימי הדרכה בשנה) אינה «בית ספר»; מורה פרטי ליחידים אינו בית ספר.', status: 'interpretation' },
    { q: 'אם לא — מה המחזור המשוער לשנה מלאה?', why: 'עד {{vat.exemptCeiling}} — פטור; מעל — מורשה. עסק חדש: לפי התחזית לשנה שלמה (תקנה 14(ב)).', status: 'verified' },
    { q: 'יש שיקול להירשם כמורשה מרצון?', why: 'לקוחות עסקיים שרוצים לקזז מע״מ, או תשומות גדולות בהקמה — שיקול עסקי של הלקוח עם המשרד; אינו חובה ואינו נגזר אוטומטית.', status: 'interpretation' },
    { q: 'מה קורה אם יחרוג במהלך השנה?', why: 'חובת רישום כמורשה; לפי «ערכים לשנה» במערכת — מהעסקה שחצתה את התקרה, לא מתחילת השנה הבאה. מקור רשמי מפורש — פתוח.', status: 'open' },
  ],
  mistakes: [
    { wrong: 'רואה חשבון עם מחזור 60,000 ₪ נרשם כעוסק פטור.', right: 'תקנה 13(1): רואה חשבון נרשם כמורשה בלי קשר למחזור.', status: 'verified' },
    { wrong: 'קוד הענף קובע את המעמד.', right: 'הקוד מתאר את הפעילות; המעמד נקבע לפי תקנה 13 (מקצוע) או לפי המחזור. בענפים «מותנים» המשרד מכריע.', status: 'interpretation' },
    { wrong: '«עוסק פטור» = פטור ממס הכנסה או מביטוח לאומי.', right: 'הפטור הוא ממע״מ בלבד. מס הכנסה וב״ל — לפי ההכנסה.', status: 'verified' },
    { wrong: 'עסק שנפתח באוקטובר עם 30,000 ₪ עד סוף השנה הוא פטור.', right: 'לרישום מעריכים מחזור לשנה מלאה (תקנה 14(ב)); 30,000 ברבעון הם כ-120 אלף בשנה — על גבול התקרה.', status: 'verified' },
  ],
};

const GROUPS: Reg13Group[] = ['13(1)', '13(2)', '13(3)', '13(4)', '13(5)', '13(6)'];

export default function DealerTypeBody({ year }: TopicBodyProps) {
  const ceiling = useMemo(() => { try { return num('vat.exemptCeiling', year); } catch { return num('vat.exemptCeiling', 2026); } }, [year]);
  const [q, setQ] = useState('');
  const hits = useMemo(() => searchBranches(q, 12), [q]);
  const [turnover, setTurnover] = useState(90000);
  const [code, setCode] = useState('');
  const rule = licensedRuleOf(code);
  const verdict = rule?.level === 'mandatory' ? 'עוסק מורשה — לפי הענף (תקנה ' + rule.group + ')' : turnover > ceiling ? 'עוסק מורשה — לפי המחזור' : 'עוסק פטור — לפי המחזור' + (rule?.level === 'conditional' ? ' · לבדוק: ' + rule.note : '');
  const byGroup = useMemo(() => {
    const m: Record<string, { code: string; name: string; level: string; note: string }[]> = {};
    for (const [c, r] of Object.entries(LICENSED_BY_BRANCH)) (m[r.group] ??= []).push({ code: c, name: VAT_BRANCHES.find(b => b.code === c)?.name ?? '', level: r.level, note: r.note });
    for (const g of Object.keys(m)) m[g].sort((a, b) => a.code.localeCompare(b.code));
    return m;
  }, []);

  return (
    <>
      <Legend />
      <Sec id="dt-0" title="מה ההבדל בין עוסק פטור לעוסק מורשה">
        <p>במע״מ יש שני מעמדות לעוסק יחיד. <b>עוסק פטור</b> — מחזור העסקאות שלו בכל עסקיו אינו עולה על <RV id="vat.exemptCeiling" year={year} /> לשנה (סעיף 1 לחוק); עסקאותיו פטורות ממע״מ (31(3)), הוא אינו גובה מע״מ מלקוחותיו ואינו מקזז מס תשומות, ומצהיר פעם בשנה על המחזור. <b>עוסק מורשה</b> — גובה מע״מ, מקזז תשומות ומדווח תקופתית. <ClaimTag status="verified" /></p>
        <p>המעמד נקבע בשני שלבים: קודם <b>מי אתה</b> (תקנה 13 — מקצועות ועיסוקים שנרשמים כמורשה בכל מקרה), ורק אחר כך <b>כמה</b> (המחזור מול התקרה). <ClaimTag status="verified" /></p>
      </Sec>
      <Sec id="dt-1" title="התקרה">
        <p>התקרה היא הסכום בהגדרת «עוסק פטור»: <RV id="vat.exemptCeiling" year={year} />. זה אותו סכום שמשמש את מסלול «בעל עסק זעיר» במס הכנסה (87ב(1) מפנה אליו) — אבל שני המסלולים נפרדים: עוסק מורשה יכול להיות בעל עסק זעיר, ועוסק פטור אינו בהכרח. <ClaimTag status="verified" /></p>
      </Sec>
      <Sec id="dt-2" title="מי נרשם כמורשה בלי קשר למחזור (תקנה 13)">
        <p>«עוסק הנמנה על אחת מהקבוצות המנויות להלן ירשום אותו המנהל כעוסק מורשה גם אם על פי סכום מחזור עסקותיו או מספר המועסקים בעסק הוא היה נחשב כעוסק זעיר»: <ClaimTag status="verified" /></p>
        <ol className="kn-list">
          {GROUPS.map(g => <li key={g}><b>תקנה {g}</b> — {REG13_TEXT[g]}</li>)}
          <li><b>תקנה 13(7)–(8)</b> — חברה רשומה ואגודה שיתופית (צורת ההתאגדות, לא ענף; טופס 821 כאן הוא לעוסק יחיד).</li>
        </ol>
      </Sec>
      <Sec id="dt-3" title="מהענף לסיווג — מה PIVO מסמן, ולמה זו פרשנות">
        <p>רשימת הענפים של רשות המסים ({VAT_BRANCHES.length} ענפים, נבדקה {VAT_BRANCHES_CHECKED_AT}) מתארת פעילות, לא מעמד. המשרד מיפה ענפים לקבוצות של תקנה 13: <b>מחייב</b> — הענף הוא בדיוק המקצוע שבתקנה; <b>מותנה</b> — תלוי בפרטי העיסוק, והמשרד מכריע. <ClaimTag status="interpretation" /></p>
        {GROUPS.map(g => (
          <details key={g} className="kn-details">
            <summary>תקנה {g} · {byGroup[g]?.length ?? 0} ענפים</summary>
            <table className="kn-table"><tbody>
              {(byGroup[g] ?? []).map(r => (
                <tr key={r.code}><td dir="ltr">{r.code}</td><td>{r.name}</td><td>{r.level === 'mandatory' ? 'מחייב' : 'מותנה'}</td><td>{r.note}</td></tr>
              ))}
            </tbody></table>
          </details>
        ))}
        <div className="kn-field">
          <label htmlFor="dt-search">אתר ענף — מילה או קוד</label>
          <input id="dt-search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="לדוגמה: ייעוץ, 6920, שליחויות" />
        </div>
        {q.trim() && (
          <ul className="kn-list">
            {hits.length === 0 && <li>לא נמצא.</li>}
            {hits.map(b => { const r = licensedRuleOf(b.code); return <li key={b.code}><span dir="ltr">{b.code}</span> · {b.name} <span className="kn-muted">({SECTION_LABEL[b.section]})</span>{r ? <> — <b>{r.level === 'mandatory' ? 'מורשה לפי תקנה ' + r.group : 'מותנה (תקנה ' + r.group + ')'}</b>: {r.note}</> : ' — לפי המחזור'}</li>; })}
          </ul>
        )}
      </Sec>
      <Sec id="dt-4" title="עסק חדש: איך מעריכים את המחזור לרישום">
        <p>עסק שטרם החל למכור — לפי הסכום המשוער בשנת המס הבאה כאילו יפעל בכל אותה שנה (תקנה 14(ב)). עסק שפעל רק חלק מהשנה שחלפה — ממוצע חודשי כפול 12 (14(א)). לכן בטופס 821 שואלים «מחזור שנתי משוער» ולא «כמה תרוויח עד סוף השנה». <ClaimTag status="verified" /></p>
        <div className="kn-field"><label htmlFor="dt-t">מחזור שנתי משוער (₪)</label><input id="dt-t" type="number" dir="ltr" min={0} step={1000} value={turnover} onChange={e => setTurnover(Number(e.target.value) || 0)} /></div>
        <div className="kn-field"><label htmlFor="dt-c">קוד ענף (לא חובה)</label><input id="dt-c" dir="ltr" value={code} onChange={e => setCode(e.target.value.trim())} placeholder="6921" /></div>
        <p className="kn-result" data-dt-verdict>{verdict} <span className="kn-muted">(תקרה {ceiling.toLocaleString('he-IL')} ₪)</span> <ClaimTag status={rule ? 'interpretation' : 'verified'} /></p>
      </Sec>
      <Sec id="dt-5" title="חריגה מהתקרה באמצע השנה">
        <p>עוסק פטור שחצה את התקרה חייב להירשם כעוסק מורשה. לפי «ערכים לשנה» במערכת (מקור משני) — מהעסקה שחצתה את התקרה, לא מתחילת השנה הבאה; פרסום רשמי מפורש לא אותר. עד 31 בינואר מצהיר עוסק פטור על המחזור בפועל בשנה שחלפה (תקנה 15). <ClaimTag status="open" /></p>
      </Sec>
      <Sec id="dt-6" title="מה פתוח">
        <ul className="kn-list">
          <li>תקנה 6א — אילו שירותים בדיוק (רשימת המקצועות שבה) ואיך זה פוגש עוסק פטור שנותן גם שירותים אחרים.</li>
          <li>מועד המעבר למורשה אחרי חריגה — האם מהעסקה החורגת; רשות המסים — לא נמצא דף שירות מפורש.</li>
          <li>המיפוי ענף ⇒ תקנה 13 לענפים «מותנים» (הדרכה, בריאות אחרת, נדל״ן בבעלות, השכרת רכב) — פרשנות; לעדכן אחרי מקרה אמיתי.</li>
          <li>רישום מרצון כמורשה מתחת לתקרה — זכות ושיקולים (קיזוז תשומות) — לא נחקר כאן.</li>
        </ul>
      </Sec>
      <Sec id="dt-8" title="תרגול">
        <Quiz items={[
          { q: 'מתווכת נדל״ן עם מחזור צפוי של 70,000 ₪ — איך נרשמת?', options: [{ text: 'עוסקת פטורה — המחזור מתחת לתקרה', right: false }, { text: 'עוסקת מורשית — תקנה 13(5)', right: true }], why: 'מתווך מקרקעין נרשם כמורשה בלי קשר למחזור.', level: 'יסוד' },
          { q: 'שליח עצמאי (5320) עם 40,000 ₪ בשנה?', options: [{ text: 'עוסק פטור', right: true }, { text: 'עוסק מורשה', right: false }], why: 'אינו בקבוצות תקנה 13; מתחת לתקרה ⇒ פטור.', level: 'יסוד' },
          { q: 'מורה ליוגה שמלמדת חוג קבוע ל-12 תלמידות, 50,000 ₪ בשנה?', options: [{ text: 'פטורה — פחות מהתקרה', right: false }, { text: 'מורשית — הדרכה לקבוצות של 5 ומעלה (13(4))', right: true }], why: 'הדרכה לספורט לקבוצות של חמישה ומעלה היא «בית ספר» לעניין התקנה; הדרכה מקרית (עד 30 ימי הדרכה בשנה) — לא.', level: 'מתקדם' },
        ]} />
      </Sec>
      <Sec id="dt-7" title="מה עושים בתיק ובטופס 821">
        <ul className="kn-list">
          <li>בטופס 821 (בקשה ללקוח או «מילוי עכשיו» במשרד) בוחרים <b>ענף</b> מהרשימה הרשמית; ענף שחייב ברישום כמורשה מסומן כבר ברשימה.</li>
          <li>PIVO מציג ליד המצב «לפי הענף: עוסק מורשה (תקנה …)» או «לפי המחזור: פטור/מורשה (תקרה …)». בענף «מותנה» — הערה, והמשרד מכריע לפי העיסוק בפועל.</li>
          <li>הסוג נשמר בכרטיס העסק (עוסק פטור / מורשה) ו«סוג עוסק» בכרטיס הלקוח מושלם כשריק. בכרטיס ← עסקים אפשר לשנות ענף וסוג ביד.</li>
          <li>במסך «פתיחת תיק» של רשות המסים ממלאים את אותו ענף; «סוג עוסק» שם נגזר אוטומטית מהמחזור — כשהענף מחייב מורשה, בוחרים מורשה.</li>
        </ul>
      </Sec>
      <Glossary terms={DEALER_LESSON.glossary} year={year} />
      <Thinking steps={DEALER_LESSON.thinking} year={year} />
      <Mistakes items={DEALER_LESSON.mistakes} year={year} />
    </>
  );
}
