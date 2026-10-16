// ─── הדוח השנתי (1301): ממסמך המקור, לנתון, לשדה ולבדיקה ─────────────────────
// ‼ לא מאמר: ארבעה צעדים שחוזרים על עצמם בכל מסמך, ושלושה כלים — «איזה נספח צריך», כרטיס לכל מסמך מקור
//   ו«איתור שדה לפי קוד» (בקשת גיא, 12.10.2026). אפשר לעבוד לפיו ביד, בלי שום אוטומציה.
// ‼ שנה 2025 — הקטלוג והמדריך של 2025. טופס לשנה אחרת = קטלוג חדש (ראו «עדכניות ותחזוקה»).

import { useMemo, useState } from 'react';
import catalogJson from '../../taxForms/data/form1301-2025.catalog.json';
import { Sec, Quiz, type TopicBodyProps, type TocItem } from './shared';
import { Glossary, Thinking, Mistakes, SolveFirst, Legend, ClaimTag } from './lesson';
import { ANNUAL_LESSON } from './lessonsReports';
import { SOURCE_DOCS, ANNEX_NEEDS } from '../sourceDocs';
import { ROLE_SHORT, docLabel, explainOf, findFields } from '../formMap/model';

export const ANNUAL_TOC: TocItem[] = [
  { id: 'ar-flow', label: 'ארבעת הצעדים', view: 'learn' }, { id: 'ar-gloss', label: 'מושגי יסוד', view: 'learn' },
  { id: 'ar-annex', label: 'איזה נספח צריך', view: 'learn' }, { id: 'ar-docs', label: 'ממסמך לשדה', view: 'learn' },
  { id: 'ar-code', label: 'איתור שדה לפי קוד', view: 'learn' }, { id: 'ar-think', label: 'איך חושבים', view: 'learn' },
  { id: 'ar-spouses', label: 'בני זוג: נפרד או מאוחד', view: 'learn' },
  { id: 'ar-ex', label: 'דוגמאות פתורות', view: 'learn' }, { id: 'ar-mis', label: 'טעויות נפוצות', view: 'learn' },
  { id: 'ar-quiz', label: 'תרגול', view: 'learn' },
  { id: 'ar-manual', label: 'הכנת הדוח ביד', view: 'apply' }, { id: 'ar-set', label: 'סט ההגשה ופירוט', view: 'apply' },
];

type CatField = { id: string; part: string; section: string | null; codes: { registered?: string | null; spouse?: string | null; joint?: string | null } | null; label: string; instruction?: string | null; documents?: string[]; guidePage?: number; note?: string };
const CATALOG = catalogJson as unknown as { parts: { part: string; title: string }[]; fields: CatField[] };
const PART_TITLE = Object.fromEntries(CATALOG.parts.map(p => [p.part, p.title]));

const STEPS = [
  { t: 'זיהוי', d: 'מי הנפיק, לאיזו שנה, על שם מי (לקוח / בן־בת זוג), ואם זה אישור מתוקן — מאיזה תאריך.' },
  { t: 'עובדה', d: 'איזה סכום, ומה הוא: הכנסה, מס שנוכה או הפקדה. על איזה בסיס — שולם, נצבר, לפני/אחרי החזרים.' },
  { t: 'שדה', d: 'קוד אחד ב-1301 או בנספח, בטור של האדם הנכון. סכום שעובר לשני מקומות — מסמנים במפורש.' },
  { t: 'בדיקה', d: 'התאמה למקור שני (106 מול שאילתה, ב״ל מול INTV, 867 מול הברוקר), שאותו סכום לא נספר פעמיים, ותיעוד מה שחסר.' },
];

function AnnexFinder() {
  const [on, setOn] = useState<Set<string>>(new Set(['salary']));
  const picked = ANNEX_NEEDS.filter(a => on.has(a.id));
  return (
    <div className="kn-page" style={{ gap: 10 }}>
      <fieldset className="kn-checks">
        <legend className="kn-small"><strong>מה יש ללקוח השנה?</strong> (אפשר לסמן כמה)</legend>
        {ANNEX_NEEDS.map(a => (
          <label key={a.id} className="kn-check"><input type="checkbox" checked={on.has(a.id)} onChange={e => setOn(s => { const n = new Set(s); if (e.target.checked) n.add(a.id); else n.delete(a.id); return n; })} /> {a.label}</label>
        ))}
      </fieldset>
      <div aria-live="polite">
        {picked.length === 0 ? <p className="kn-small kn-muted">סמנו מצב כדי לראות אילו טפסים ונספחים נדרשים.</p> : (
          <ul className="kn-annex-list">
            {picked.flatMap(a => a.forms.map(f => (
              <li key={a.id + f.form}><strong>{f.form}</strong> <ClaimTag status={f.status} /><span className="kn-small kn-muted"> — {f.why}</span></li>
            )))}
            <li className="kn-xs kn-muted">תמיד: 1301 עצמו, ואישורי ניכוי במקור לכל סכום שנוכה. בהגשה מקוונת מלאה — נספחים ששודרו (6111, 1399י, 1322, 1324) לא מצרפים שוב.</li>
          </ul>
        )}
      </div>
    </div>
  );
}

function DocCards() {
  const [id, setId] = useState(SOURCE_DOCS[0].id);
  const d = SOURCE_DOCS.find(x => x.id === id)!;
  return (
    <div className="kn-page" style={{ gap: 10 }}>
      <label className="kn-field kn-doc-pick" htmlFor="ar-doc">מסמך
        <select id="ar-doc" value={id} onChange={e => setId(e.target.value)}>{SOURCE_DOCS.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select>
      </label>
      <div className="kn-doc-tabs" role="tablist" aria-label="מסמכי מקור">
        {SOURCE_DOCS.map(x => <button key={x.id} type="button" role="tab" aria-selected={x.id === id} className={x.id === id ? 'is-on' : ''} onClick={() => setId(x.id)}>{x.title.split(' — ')[0]}</button>)}
      </div>
      <div className="kn-doc" aria-live="polite">
        <h3 className="kn-doc-title">{d.title}</h3>
        <p className="kn-small" style={{ margin: 0 }}>{d.what}</p>
        <p className="kn-xs kn-muted" style={{ margin: 0 }}>מי מנפיק: {d.issuer}</p>
        <div><strong className="kn-small">1. זיהוי</strong><ul className="kn-small">{d.identify.map(x => <li key={x}>{x}</li>)}</ul></div>
        <div><strong className="kn-small">2 ו-3. מה במסמך ⇐ לאיזה שדה</strong>
          <div className="kn-tbl-wrap"><table className="kn-tbl">
            <thead><tr><th>מה במסמך</th><th>קוד (רשום/בן־בת זוג)</th><th>הערה</th><th /></tr></thead>
            <tbody>{d.rows.map(r => <tr key={r.what}><td>{r.what}</td><td style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{r.code}</td><td className="kn-xs">{r.note ?? ''}</td><td><ClaimTag status={r.status} /></td></tr>)}</tbody>
          </table></div>
        </div>
        <div><strong className="kn-small">4. בדיקת המשרד</strong><ul className="kn-small">{d.check.map(x => <li key={x}>{x}</li>)}</ul></div>
        <div className="kn-two">
          <div><strong className="kn-small">טעויות נפוצות</strong><ul className="kn-small">{d.mistakes.map(x => <li key={x}>{x}</li>)}</ul></div>
          <div><strong className="kn-small">כשהמסמך חסר או חלקי</strong><ul className="kn-small">{d.missing.map(x => <li key={x}>{x}</li>)}</ul></div>
        </div>
        <p className="kn-xs kn-muted" style={{ margin: 0 }}>איך מבקשים: {d.askAs}</p>
      </div>
    </div>
  );
}

// ‼ 16.10: חיפוש אחד עם מפת הטופס (formMap/model.findFields) — כל הטפסים, קוד או מילים; הכרטיס כאן מקוצר,
//   והסימון על הטופס עצמו — במפת הטופס בעמוד «דוח שנתי».
function CodeSearch() {
  const [q, setQ] = useState('');
  const hits = useMemo(() => findFields(q, 12), [q]);
  return (
    <div className="kn-page" style={{ gap: 10 }}>
      <label className="kn-field" htmlFor="ar-code-q">קוד שדה (למשל 172) או מילה (למשל «תרומות»)
        <input id="ar-code-q" className="kn-search" inputMode="search" value={q} onChange={e => setQ(e.target.value)} placeholder="172" />
      </label>
      <p className="kn-xs kn-muted" style={{ margin: 0 }}>אותו חיפוש כמו במפת הטופס (מס › ידע מקצועי › דוח שנתי) — שם רואים גם את השדה מסומן על הטופס.</p>
      <div aria-live="polite">
        {q.trim() && hits.length === 0 && <p className="kn-small kn-muted">לא נמצא בטפסים במפה (1301, הנספחים ו-1219).</p>}
        {hits.length > 1 && <p className="kn-xs kn-muted">נמצאו {hits.length} התאמות — לא בוחרים אחת בשקט; לבדוק את הטופס, האדם והחלק.</p>}
        {hits.map(h => {
          const f = h.field; const ex = explainOf(f);
          return (
            <div key={`${h.slug}.${f.key}.${h.code}.${h.role}`} className="kn-code-hit">
              <div className="kn-spread"><strong>{f.label}</strong><span className="kn-xs kn-muted">{h.formId}{h.taxYear ? `/${h.taxYear}` : ''}{f.part && h.slug === '1301' ? ` · חלק ${f.part}` : ''}{f.section && h.slug === '1301' ? `, סעיף ${f.section}` : ''}{h.page ? ` · עמ׳ ${h.page}` : ' · לא מסומן בטופס'}</span></div>
              {h.slug === '1301' && f.part && <span className="kn-xs kn-muted">{PART_TITLE[f.part] ?? ''}</span>}
              {f.codes.length > 0 && <span className="kn-small" dir="rtl">קודים: {f.codes.map((c, n) => <span key={c.code}>{n ? ' · ' : ''}{ROLE_SHORT[c.role] || 'קוד'} <b dir="ltr">{c.code}</b></span>)}{h.code && ROLE_SHORT[h.role] ? <> · הקוד שחיפשת: <b>{ROLE_SHORT[h.role]}</b></> : null}</span>}
              {ex.what && <span className="kn-small">{ex.what}</span>}
              {f.documents.length ? <span className="kn-xs">מסמכים: {f.documents.map(docLabel).join(' · ')}</span> : null}
              {f.guidePage ? <span className="kn-xs kn-muted">בחוברת «דע זכויותיך וחובותיך» 2025: עמ׳ {f.guidePage - 2}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const QUIZ = [
  { q: 'שכיר־עצמאי: ב-106 — 045 = 6,000, 248 = 15,600. אישור הקרן מראה גם הפקדה פרטית של 10,000. מה רושמים ב-135?', options: [{ text: '31,600 — כל מה שבאישור', right: false }, { text: '10,000 — רק ההפקדה הפרטית', right: true }, { text: '16,000 — העובד והפרטי', right: false }], why: 'הפקדות דרך המשכורת כבר ב-106 (045, 248). ב-135 רק מה ששולם כעמית עצמאי — אחרת הטבה כפולה, וגם חישוב «עמית מוטב» נפגע.', level: 'יישום' as const },
  { q: 'דמי לידה של עצמאית — לאיזה שדה?', options: [{ text: '150/170 עם הכנסת העסק', right: false }, { text: '250/270', right: true }, { text: '194/196', right: false }], why: 'גמלה בשל הכנסה כעצמאי — 250/270, בנפרד מהעסק (המדריך עמ׳ 29 עד 30). 194/196 — לשכיר שהגמלה לא ב-106.', level: 'יסוד' as const },
  { q: 'דוח 2024: עצמאי שילם לב״ל 20,000 וקיבל השנה החזר של 3,000 על 2022. מה ב-030?', options: [{ text: '17,000', right: false }, { text: '20,000', right: true }, { text: '23,000', right: false }], why: 'עד 2024 — לפי התשלומים בפועל, בלי להפחית החזרים לשנים קודמות (פס״ד קירשבלום, הוראת ביצוע 03/2023). מ-2025 — מפחיתים החזרים שהתקבלו באותה שנה.', level: 'יישום' as const },
  { q: 'ריבית מפיקדון — המס שנוכה בבנק נרשם ב…', options: [{ text: '040', right: false }, { text: '042', right: false }, { text: '043', right: true }], why: '043 — מס מפיקדונות וחיסכון (גם אם חלק הוחזר). 040 — ני״ע, דיבידנד ורווח הון. 042 — משכורת (106).', level: 'יסוד' as const },
  { q: 'ללקוח עם IBKR יש רק סיכום רווח שנתי בדולרים. מה עושים?', options: [{ text: 'ממירים בשער ממוצע ורושמים ב-1322', right: false }, { text: 'מבקשים Flex Query ברמת המנה; עד אז הדוח חלקי', right: true }, { text: 'רושמים רק את הדיבידנד', right: false }], why: 'מכירה בלי ניכוי בישראל — שורה לכל מכירה ב-1325, בשער לכל עסקה. סיכום נטו מסתיר גם את סכום המכירות (256).', level: 'מתקדם' as const },
];

export default function AnnualReturnBody({ view }: TopicBodyProps) {
  const learn = view !== 'apply';
  const apply = view !== 'learn';
  return (
    <>
      {learn && <>
        <Sec id="ar-flow" title="ארבעה צעדים לכל מסמך">
          <ol className="kn-steps4">{STEPS.map((s, i) => <li key={s.t}><span className="kn-step-n">{i + 1}</span><strong>{s.t}</strong><span className="kn-small">{s.d}</span></li>)}</ol>
          <p className="kn-small">מה שמקל: ב-106 מודפס ליד חלק מהסכומים <b>קוד השדה ב-1301</b> שהסכום עובר אליו (המדריך, פרק ג סעיף 3) <ClaimTag status="verified" />. ממפים לפי קוד, לא לפי מספר הסעיף — מספרי הסעיפים זזים בין השנים.</p>
          <Legend />
        </Sec>
        <Sec id="ar-gloss" title="מושגי יסוד"><Glossary terms={ANNUAL_LESSON.glossary} year={2025} /></Sec>
        <Sec id="ar-annex" title="איזה טופס ונספח צריך?"><AnnexFinder /></Sec>
        <Sec id="ar-docs" title="ממסמך המקור לשדה — מסמך אחר מסמך"><DocCards /></Sec>
        <Sec id="ar-code" title="איתור שדה לפי קוד"><CodeSearch /></Sec>
        <Sec id="ar-think" title="איך חושבים כשמכינים דוח"><Thinking steps={ANNUAL_LESSON.thinking} year={2025} /></Sec>
        <Sec id="ar-spouses" title="בני זוג — נפרד או מאוחד, במספרים">
          <p className="kn-small">ברירת המחדל בחוק היא <b>מאוחד</b>: כל ההכנסה של שניהם היא הכנסת בן הזוג הרשום (סעיף 65) <ClaimTag status="verified" />. <b>נפרד</b> הוא זכות שבן הזוג השני תובע על הכנסתו מיגיעה אישית — רק בתנאי סעיף 66; כשיש מקור הכנסה משותף, רק אם שלושת התנאים של 66(ד) מתקיימים <ClaimTag status="verified" />. «הרשות מחילה את הזול מבין השניים» כתוב במדריך, לא בחוק — לכן ההפרש אינו חיסכון של המשרד <ClaimTag status="verified" />.</p>
          <div className="kn-tbl-wrap"><table className="kn-tbl"><thead><tr><th /><th>מאוחד</th><th>נפרד</th></tr></thead><tbody>
            <tr><td>מדרגות המס</td><td>טבלה אחת, על ההכנסה של שניהם, אצל הרשום</td><td>טבלה לכל אחד, על ההכנסה שלו</td></tr>
            <tr><td>נקודות זיכוי</td><td>של הרשום, ובמקום הנקודות האישיות של השני — 1.75 (בלי ילדים) או 2 «בן זוג עובד» (סעיף 38); חצי נקודה לאישה רק כשהיא הרשומה. <b>אין נקודות ילדים לאף אחד</b> — ילדים רק מעלים את 1.75 ל-2 <ClaimTag status="verified" /></td><td>לכל אחד את שלו; נקודות ילדים לפי טור ההורה, כנגד המס על היגיעה שלו בלבד</td></tr>
            <tr><td>הכנסה נמוכה של בן הזוג</td><td>עד פי 5 מנקודות 38 — לא נכללת, והנקודות לא ניתנות (38(ב))</td><td>—</td></tr>
            <tr><td>מס יסף</td><td>סף אחד על ההכנסה המשותפת <ClaimTag status="interpretation" /></td><td>לכל אחד <ClaimTag status="interpretation" /></td></tr>
            <tr><td>שכירות, ריבית, דיבידנד</td><td>אצל הרשום</td><td>לבעל ההכנסה הגבוהה מיגיעה אישית — אלא רכוש מלפני הנישואים או מירושה, לבקשתו</td></tr>
          </tbody></table></div>
          <SolveFirst level="מתקדם" status="interpretation" title="כששניהם עובדים — נפרד תמיד עדיף?"
            facts={<>2026. היא (הרשומה) 90,000, הוא 26,000. שכירים, בלי ילדים. אין מקור משותף.</>}
            ask="איזה חישוב יחול, ומה המס?"
            steps={[{ label: 'נפרד — היא (2.75 נקודות)', value: '1,249' }, { label: 'נפרד — הוא (2.25 נקודות; לא מנוצלות במלואן)', value: '0' }, { label: 'מאוחד — 116,000 בטבלה אחת, 2.75 + 1.75 נקודות', value: '0' }]}
            answer="מאוחד — 0. בנפרד נקודות הזיכוי שלו הולכות לאיבוד. לכן מחשבים את שתי הדרכים ולא מניחים."
            note="חושב עצמאית לפי המחקר (research/spouses-joint-separate-numeric) — אין דוגמה רשמית שמשווה. אותו חישוב בהערכת המס, בבדיקה «נפרד או מאוחד»." />
          <p className="kn-small"><b>נקודות ילדים במאוחד — הוכרע:</b> אין, לאף אחד מבני הזוג, גם כשהמאוחד חובה (66(ד)). סעיף 66(ג) הוא «ההוראות שיחולו על החישוב הנפרד»; המדריך 2025 כותב פעמיים «רק בחישוב נפרד»; הוראת ביצוע 3/2015 — כך <ClaimTag status="verified" />. סיכון שנשאר: טענה שהרשום זכאי לטור הילדים שלו גם במאוחד — בלי מקור, וכל מסמכי הרשות סותרים אותה.</p>
          <p className="kn-small"><b>מי הרשום</b> — עובדה ברשומות מס הכנסה (סעיף 64ב), לא הסקה: ברירת המחדל היא מי שהכנסתו עלתה על חצי משל שניהם שנתיים קודם, או בחירה. בהערכת המס הרשום נלקח רק כשאושר מול שע״ם (בתיק המס, בשלב «הפרטים הוזנו בשע״ם»). כשלא אושר — מחשבים לשני הכיוונים; אם התוצאה זהה, ממשיכים; אם לא — «לא הוכרע» עם הסכום לכל כיוון <ClaimTag status="verified" />.</p>
        </Sec>
        <Sec id="ar-ex" title="דוגמאות פתורות">
          <SolveFirst level="יישום" status="verified" title="שכיר שהוא גם עצמאי — פנסיה בלי כפילות"
            facts={<>106: 045 = 6,000 · 244 = 120,000 · 248 = 15,600. אישור הקרן: הפקדות עובד 6,000, מעסיק 15,600, פרטי 10,000.</>}
            ask="מה נרשם ב-045, 244, 248 ו-135?"
            steps={[{ label: '045 — מ-106', value: '6,000' }, { label: '244 ו-248 — מ-106', value: '120,000 · 15,600' }, { label: '135 — רק ההפקדה הפרטית', value: '10,000' }]}
            answer="135 = 10,000. 31,600 היה סופר את הפקדות השכיר פעמיים."
            note="ההגדרות רשמיות (המדריך עמ׳ 63, 66, 71); שיטת ההתאמה — פרשנות." />
          <SolveFirst level="יישום" status="verified" title="דמי ב״ל של עצמאי — 2024 מול 2025"
            facts={<>שולמו השנה 20,000 (בלי בריאות). התקבל השנה החזר של 3,000 בעד 2022.</>}
            ask="מה ב-030 בדוח 2024, ומה בדוח 2025 (אותם מספרים)?"
            steps={[{ label: '2024 — התשלומים בפועל (קירשבלום)', value: '20,000' }, { label: '2025 — תשלומים פחות החזרים', value: '17,000' }, { label: 'ניכוי 52% (המחשב)', value: '10,400 / 8,840' }]}
            answer="2024: 20,000. 2025: 17,000. החזר גדול מהתשלומים ב-2025 — 52% מההפרש הוא הכנסה ב-250/270."
            note="עע״מ 624/20 (1.5.2022); הוראות ביצוע 03/2023, 07/2025, 08/2026; תיקון 266 (מ-2025); המדריך 2025 עמ׳ 65. החזר ב-2025 בעד תשלום שלפני 2025 — הכלל החדש חל (מקזזים). שנים קודמות לא נפתחות." />
        </Sec>
        <Sec id="ar-mis" title="טעויות נפוצות"><Mistakes items={ANNUAL_LESSON.mistakes} year={2025} /></Sec>
        <Sec id="ar-quiz" title="תרגול"><Quiz items={QUIZ} /></Sec>
      </>}
      {apply && <>
        <Sec id="ar-manual" title="הכנת הדוח ביד — גם בלי המערכת">
          <ol className="kn-small kn-manual">
            <li><b>שאלון ומסמכים.</b> מה היה השנה (משכורת, עסק, שכירות, השקעות, חו״ל, תרומות, ב״ל) — ובקשת המסמכים לפי «איזה נספח צריך». חסר ≠ אפס: מה שלא הגיע מסומן «חסר».</li>
            <li><b>זיהוי ועובדה.</b> לכל מסמך — ארבעת הצעדים. רושמים עם מקור, אדם ושנה; מסמך שנקרא בשאילתה — עם תאריך השליפה.</li>
            <li><b>מיפוי לקודים.</b> לפי הכרטיסים למעלה. סכום שעובר לשני מקומות — מסומן.</li>
            <li><b>בדיקת כפילויות.</b> 106 מול 194/196 · 106 (045/248) מול 135 · 106 (036) מול ביטוח חיים · שורות תרומה ב-106 מול 037.</li>
            <li><b>נספחים.</b> 1320 לכל עסק, 1321, 1322/1325, 1324, 1344, 1342 — לפי הצורך.</li>
            <li><b>בדיקת סבירות.</b> חישוב מס משוער מול המקדמות והניכויים; פער גדול — לחזור לשלב 2.</li>
            <li><b>סט ההגשה.</b> ראו למטה. חתימת בן הזוג הרשום.</li>
            <li><b>שידור והגשה.</b> «הגשה מקוונת לדוח ששודר עם מסמכים»; אחרת — העתק חתום עם ברקוד למשרד השומה ואישור הגשה על השני.</li>
            <li><b>שמירה.</b> אישור ההגשה, הקבצים שהועלו בפועל, ומסמכי המקור — 7 שנים (מסמך חתום דיגיטלית — כקובץ החתום).</li>
          </ol>
          <p className="kn-xs kn-muted">במערכת: הכנת 1301 וקובץ השידור — בסבב הבא. היום: איסוף ובדיקה בבקשת «דוח שנתי» בתיק המס, והשאר לפי הרשימה הזו.</p>
        </Sec>
        <Sec id="ar-set" title="סט ההגשה ו«נספח פירוטים»">
          <div className="kn-two">
            <div><strong className="kn-small">חבילת ההגשה (לפקיד השומה)</strong><ul className="kn-small"><li>1301 חתום, נספחים שלא שודרו, אסמכתאות נדרשות</li><li>במקום אישורי ניכוי (שאינם משכר): «אישור מייצג» עם רשימה מפורטת — מקוריים נשמרים <ClaimTag status="verified" /></li><li>חסר נספח מהרשימה — הדוח עלול להיחשב «סתמי»; חסר מסמך אחר — הנתון לא נלקח בחשבון <ClaimTag status="verified" /></li></ul></div>
            <div><strong className="kn-small">תיק המשרד ועותק הלקוח</strong><ul className="kn-small"><li>«נספח פירוטים»: שורה לכל קוד — רכיבים (מסמך, מנפיק, אדם, שנה, סכום), התאמות, סכום לשדה, סטטוס <ClaimTag status="interpretation" /></li><li>אין חובה רשמית למכתב נלווה או לתוכן עניינים — נוהג טוב; הרשימה חייבת לשקף קבצים שהועלו בפועל</li><li>ללקוח — הסבר פשוט, בלי פרטי אדם אחר</li></ul></div>
          </div>
        </Sec>
      </>}
    </>
  );
}
