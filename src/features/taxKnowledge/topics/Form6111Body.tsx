// ─── 6111 ומילון סיווג ההוצאות ───────────────────────────────────────────────
// ‼ המילון הוא כלי עבודה: לחפש קטגוריה, לראות ארבע הכרעות נפרדות, ולהעתיק לפייפרלס. אין כאן שינוי בפייפרלס
//   ואין שידור — יצירת קובץ 6111 אינה שידור (הכנת הקובץ — בסבב הדוח השנתי).

import { useMemo, useState } from 'react';
import { Sec, Quiz, type TopicBodyProps, type TocItem } from './shared';
import { Glossary, Thinking, Mistakes, Legend, ClaimTag } from './lesson';
import { FORM6111_LESSON } from './lessonsReports';
import { DICTIONARY, DICT_GROUP_HE, DICTIONARY_TAX_YEAR, dictionaryTsv, type DictGroup } from '../expenseDictionary';

export const FORM6111_TOC: TocItem[] = [
  { id: 'f6-what', label: 'מה זה 6111', view: 'learn' }, { id: 'f6-gloss', label: 'מושגי יסוד', view: 'learn' },
  { id: 'f6-who', label: 'מי חייב', view: 'learn' }, { id: 'f6-struct', label: 'מבנה הקודים', view: 'learn' },
  { id: 'f6-think', label: 'איך מסווגים', view: 'learn' }, { id: 'f6-mis', label: 'טעויות נפוצות', view: 'learn' },
  { id: 'f6-quiz', label: 'תרגול', view: 'learn' },
  { id: 'f6-dict', label: 'מילון הסיווג', view: 'apply' }, { id: 'f6-split', label: 'פיצול ושימוש מעורב', view: 'apply' },
];

const STRUCT = [
  ['הכנסות', '1010 עד 1090', '1000'], ['עלות המכירות', '1306 עד 1450', '1300'], ['הוצאות מכירה', '3011 עד 3190', '3000'],
  ['הוצאות הנהלה וכלליות', '3511 עד 3690', '3500'], ['מימון', '5010 עד 5190', '5000 / 5100'], ['הכנסות והוצאות אחרות', '5210 עד 5390', '5200 / 5300'],
  ['רווח לפני מס', '—', '6666 (עובר ל-100)'], ['דוח התאמה למס', '100 עד 600', '370 · 400 · 500'], ['מאזן (חובה לחברה)', '7110 עד 9980', '8888 = 9999'],
];

function Dictionary() {
  const [q, setQ] = useState('');
  const [g, setG] = useState<DictGroup | ''>('');
  const [msg, setMsg] = useState('');
  const shown = useMemo(() => {
    const w = q.trim().toLowerCase();
    return DICTIONARY.filter(e => (!g || e.group === g) && (!w || `${e.name} ${e.examples} ${e.code6111} ${e.key}`.toLowerCase().includes(w)));
  }, [q, g]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(dictionaryTsv(shown)); setMsg(`הועתקו ${shown.length} שורות — להדביק בגיליון`); }
    catch { setMsg('ההעתקה נחסמה בדפדפן — לסמן את הטבלה ולהעתיק ידנית'); }
  };
  return (
    <div className="kn-page" style={{ gap: 10 }}>
      <div className="kn-row" style={{ alignItems: 'flex-end' }}>
        <label className="kn-field" htmlFor="f6-q" style={{ flex: '1 1 220px' }}>חיפוש (שם, ספק, קוד)
          <input id="f6-q" className="kn-search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="למשל: Claude, דלק, 3680" />
        </label>
        <label className="kn-field" htmlFor="f6-g" style={{ flex: '1 1 180px' }}>קבוצה
          <select id="f6-g" value={g} onChange={e => setG(e.target.value as DictGroup | '')}><option value="">הכול</option>{(Object.keys(DICT_GROUP_HE) as DictGroup[]).map(k => <option key={k} value={k}>{DICT_GROUP_HE[k]}</option>)}</select>
        </label>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy()}>העתק לטבלה ({shown.length})</button>
      </div>
      {msg && <p className="kn-xs kn-muted" role="status" style={{ margin: 0 }}>{msg}</p>}
      <p className="kn-xs kn-muted" style={{ margin: 0 }}>קודי {DICTIONARY_TAX_YEAR}. «המלצה» = מיפוי מקצועי מוצע כאשר אין קוד ייעודי. בודקים את מהות העסקה; המשרד קובע אחידות בשמות ובמיפוי. שם בפייפרלס — יתווסף כשתתקבל רשימת הקטגוריות.</p>
      <div className="kn-dict" aria-live="polite">
        {shown.map(e => (
          <details key={e.key} className="kn-dict-row">
            <summary>
              <span className="kn-dict-name">{e.name}<span className="kn-xs kn-muted"> · {e.examples}</span></span>
              <span className="kn-dict-code">{e.code6111}</span>
            </summary>
            <div className="kn-dict-body kn-small">
              <div><span className="kn-muted">קוד 6111:</span> <span>{e.code6111}</span> <ClaimTag status={e.codeStatus} />{e.line1320 ? <span className="kn-muted"> · 1320 שורה {e.line1320}</span> : null}</div>
              <div><span className="kn-muted">מס הכנסה:</span> {e.incomeTax}</div>
              <div><span className="kn-muted">מע״מ תשומות:</span> {e.vat} <ClaimTag status={e.ruleStatus} /></div>
              {e.note && <div className="kn-muted">{e.note}</div>}
              
            </div>
          </details>
        ))}
        {!shown.length && <p className="kn-small kn-muted">לא נמצא. «לא מסווג — לבדיקה» הוא המקום לעסקה לא ברורה.</p>}
      </div>
    </div>
  );
}

const QUIZ = [
  { q: 'מנוי Claude לעבודת המשרד — מה הקוד ב-6111?', options: [{ text: '3620 פרסום', right: false }, { text: '3680 משרדיות', right: true }, { text: '8050 מחשבים', right: false }], why: 'מנוי שוטף לתוכנה הוא הוצאה, לא נכס. בטופס אין קוד ל-SaaS — המלצת המחקר 3680, עד החלטת המשרד.', level: 'יסוד' as const },
  { q: 'חשבונית אחת מ-Google: Ads ו-Workspace. איך מסווגים?', options: [{ text: 'כולה פרסום', right: false }, { text: 'מפצלים: Ads לפרסום, Workspace לתוכנה', right: true }, { text: 'כולה תוכנה', right: false }], why: 'הסיווג לפי מהות כל שורה, לא לפי הספק.', level: 'יישום' as const },
  { q: 'עסק ללא חריג, שמחזורו הרלוונטי לחובת 6111 הוא 255,000 ₪ לפני מע״מ בשיעור 18%: האם הוא מעל הסף?', options: [{ text: 'כן — כולל מע״מ זה 300,900', right: true }, { text: 'לא — מתחת ל-256,410 שבטופס', right: false }, { text: 'תלוי בהכרעת המשרד', right: false }], why: '255,000 × 1.18 = 300,900 ₪, מעל 300,000 כולל מע״מ. בשאלה הוגדר שזה המחזור הרלוונטי; בתיק אמיתי בודקים גם את השנה והחריגים.', level: 'מתקדם' as const },
];

export default function Form6111Body({ view }: TopicBodyProps) {
  const learn = view !== 'apply';
  const apply = view !== 'learn';
  return (
    <>
      {learn && <>
        <Sec id="f6-what" title="מה זה 6111">
          <p className="kn-small">«דוחות כספיים מקודדים»: רווח והפסד, דוח התאמה למס, ובחברה גם מאזן — בקודים קבועים. נספח לדוח השנתי של עסק, ומשודר מקוון בלבד <ClaimTag status="verified" />. הוא אינו מחליף דוחות כספיים למי שנדרש להם <ClaimTag status="verified" />.</p>
          <p className="kn-small">הסדר הטבעי: כל הוצאה בספרים נרשמת במלואה בקוד שלה; מה שאינו מוכר — מוחזר בדוח ההתאמה (110 הוצאות עודפות, 183 תרומות, 190 אחרות), ולא מוקטן מהקוד <ClaimTag status="interpretation" />.</p>
          <Legend />
        </Sec>
        <Sec id="f6-gloss" title="מושגי יסוד"><Glossary terms={FORM6111_LESSON.glossary} year={DICTIONARY_TAX_YEAR} /></Sec>
        <Sec id="f6-who" title="מי חייב — ומה עדיין לא ברור"><p className="kn-small"><b>בדיוק 300,000 ₪:</b> המדריך ודף השירות מציגים חובה מעל הסף; הטופס והבהרותיו מציגים פטור מתחת לסף. נקודת השוויון מחייבת בירור מתועד או החלטה להגיש מרצון. אין זו אי־ודאות בכל הסף או בכל נושא 6111. <ClaimTag status="interpretation" /></p>
          <div className="kn-tbl-wrap"><table className="kn-tbl"><thead><tr><th>מקור (2025)</th><th>הסף</th><th /></tr></thead><tbody>
            <tr><td>החוק — סעיף 240ב(ג) ו-(ד)(1)</td><td>חייב: מי שמנהל כפולה או רישום ממוחשב כלשהו. הפטור לפי מחזור — קביעה מנהלית, בלי מספר בחוק</td><td><ClaimTag status="verified" /></td></tr>
            <tr><td>הגדרת «מחזור» (הוראות ניהול פנקסים)</td><td>«לרבות מסים עקיפים» — כלומר <b>כולל</b> מע״מ</td><td><ClaimTag status="verified" /></td></tr>
            <tr><td>המדריך, פרק ב — <b>הכלל המחייב</b></td><td>מחזור עד 300,000 ₪ כולל מע״מ — פטור</td><td><ClaimTag status="verified" /></td></tr>
            <tr><td>טופס 1301 (256,410) ומבנה הקובץ (254,777)</td><td>תוויות המרה ישנות: ÷1.17 ו-÷1.1775 (2015). ההמרה ל-18%: 254,237</td><td><ClaimTag status="interpretation" /></td></tr>
            <tr><td>איזו שנה קובעת</td><td>משווים את שנת הדוח, השנה הקודמת וחודשי הפעילות; כשהתוצאה משתנה, משלימים בירור של הגדרת ניהול פנקסים. הגשה מרצון אינה קביעה שחייבים.</td><td><ClaimTag status="interpretation" /></td></tr>
          </tbody></table></div>
          <p className="kn-small">בעבודה: מחשבים את שתי הקריאות של השנה; אם אחת מהן מעל 300,000 כולל מע״מ — משדרים (שידור בלי חובה אינו עבירה; אי־שידור כשחייבים — כן). מחזור פטור ממע״מ או בשיעור אפס — מחברים את המחזור בפועל, לא ÷1.18. חקלאים לפי תוספת י״ב — פטורים <ClaimTag status="verified" />. עסק זעיר — מתחת לסף מבחינה מספרית <ClaimTag status="interpretation" />.</p>
          <p className="kn-small"><b>יצירת קובץ אינה שידור.</b> קובץ שהוכן הוא טיוטה עד שמשודר עם הדוח; בשידור מקוון מלא — לא מדפיסים ולא מצרפים, והקליטה מאושרת אוטומטית <ClaimTag status="verified" />.</p>
        </Sec>
        <Sec id="f6-struct" title="מבנה הקודים">
          <div className="kn-tbl-wrap"><table className="kn-tbl"><thead><tr><th>חלק</th><th>טווח</th><th>סיכום</th></tr></thead>
            <tbody>{STRUCT.map(r => <tr key={r[0]}><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td></tr>)}</tbody></table></div>
          <p className="kn-xs kn-muted">טופס 6111 לשנת 2025 (מעודכן 11.2025) ומבנה הקובץ (28.05.2026): רשימת הקודים זהה ל-2024. בטופס מודפס 2570 למענקים — בקובץ 5270 <ClaimTag status="verified" />.</p>
        </Sec>
        <Sec id="f6-think" title="איך מסווגים"><Thinking steps={FORM6111_LESSON.thinking} year={DICTIONARY_TAX_YEAR} /></Sec>
        <Sec id="f6-mis" title="טעויות נפוצות"><Mistakes items={FORM6111_LESSON.mistakes} year={DICTIONARY_TAX_YEAR} /></Sec>
        <Sec id="f6-quiz" title="תרגול"><Quiz items={QUIZ} /></Sec>
      </>}
      {apply && <>
        <Sec id="f6-dict" title="מילון הסיווג — לפייפרלס ולמשרד"><Dictionary /></Sec>
        <Sec id="f6-split" title="פיצול, שימוש מעורב וחילופי שנים">
          <ul className="kn-small">
            <li><b>פיצול לפי מהות:</b> קבלת סופר עם דלק, כיבוד ומוצרים פרטיים; חשבון סלולר עם חבילה ותשלום על מכשיר — שורה לכל מהות.</li>
            <li><b>שימוש מעורב:</b> מס הכנסה ומע״מ נבדקים בנפרד. במע״מ, כשאפשר לקבוע את יחס השימוש העסקי מנכים לפי היחס. רק כשלא ניתן לקבוע את היחס ולא נקבע יחס מתאים בידי המנהל, תקנה 18 מאפשרת ⅔ כשעיקר השימוש עסקי או ¼ כשעיקרו אינו עסקי, בכפוף לזכאות לניכוי תשומות. שומרים את שתי החלטות הסיווג בנפרד <ClaimTag status="verified" />.</li>
            <li><b>נכס מול הוצאה:</b> חיים ארוכים או השבחה — נכס; תיקון שמחזיר למצב הקודם — הוצאה. אין להחליף את מבחן נכס/הוצאה בסף שקלי פנימי. מדיניות מהותיות משרדית אינה מעניקה ניכוי בניגוד לדין; מתעדים מה נרכש ולאיזו תקופה <ClaimTag status="interpretation" />.</li>
            <li><b>עוסק פטור:</b> אין קיזוז תשומות בכלל — עמודת המע״מ «אין» ברמת העסק.</li>
            <li><b>שנה חדשה:</b> המילון לפי שנת מס; סכומים משתנים (1,380, 240, תקרות לינה) נבדקים בכל שנה — בלי לשכתב את השנה הקודמת.</li>
            <li><b>החלטות ברמת העסק והשנה</b> (לא לכל קבלה): עלות מכר מול הנהלה וכלליות, אחוז משרד ביתי, דרגת המע״מ ברכב ובנייד, מזומן או מצטבר.</li>
          </ul>
        </Sec>
      </>}
    </>
  );
}
