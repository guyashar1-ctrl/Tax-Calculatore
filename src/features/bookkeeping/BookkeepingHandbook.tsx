import { useId, useMemo, useState } from 'react';
import { OFFICE_HANDBOOK } from './handbookData';
import { filterHandbook, handbookTsv } from './model';
import './handbook.css';

/** אותו רכיב ואותו מקור נתונים גם במשרד וגם בידע המקצועי. אין כאן חישוב או כתיבה לפייפרלס. */
export default function BookkeepingHandbook() {
  const id = useId();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [message, setMessage] = useState('');
  const groups = useMemo(() => [...new Set(OFFICE_HANDBOOK.rows.map(r => r.group))], []);
  const shown = useMemo(() => filterHandbook(OFFICE_HANDBOOK.rows, query, group), [query, group]);
  async function copy() {
    try { await navigator.clipboard.writeText(handbookTsv(shown)); setMessage('הטבלה הועתקה — אפשר להדביק בגיליון.'); }
    catch { setMessage('הדפדפן חסם העתקה. אפשר לסמן את הטבלה ולהעתיק ידנית.'); }
  }
  return <div className="bk-handbook" dir="rtl">
    <div className="bk-toolbar">
      <label className="bk-search" htmlFor={id + '-q'}>חיפוש בטבלת המיון
        <input id={id + '-q'} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="למשל: קלוד, דלק, משרדיות, 3680" />
      </label>
      <label htmlFor={id + '-group'}>תחום הוצאה
        <select id={id + '-group'} value={group} onChange={e => setGroup(e.target.value)}>
          <option value="">כל התחומים</option>{groups.map(g => <option key={g}>{g}</option>)}
        </select>
      </label>
      <button type="button" className="bk-copy" onClick={() => void copy()}>העתקת הטבלה</button>
    </div>
    <p className="bk-count" role="status">{shown.length} מתוך {OFFICE_HANDBOOK.rows.length} שורות מיון{message && ' · ' + message}</p>
    {shown.length > 0 && <p className="bk-mobile-hint">אפשר לגלול את הטבלה לצדדים.</p>}
    {shown.length > 0 ? <div className="bk-table-wrap" role="region" aria-label="טבלת תורת הנהלת החשבונות" tabIndex={0}>
      <table className="bk-table">
        <caption className="sr-only">מהות ההוצאה, המיון בפייפרלס ואופן ההכרה</caption>
        <thead><tr><th scope="col">הוצאה ודוגמאות</th><th scope="col">המיון לבחירה</th><th scope="col">משני</th><th scope="col">אופן ההכרה</th><th scope="col">דגש</th></tr></thead>
        <tbody>{shown.map(r => <tr key={r.id}>
          <th scope="row">{r.when}<small>{r.examples}</small></th>
          <td>{r.code && <bdi className="bk-code">{r.code}</bdi>} {r.name}</td>
          <td>{r.secondary}</td><td>{r.recognition.text}</td><td>{r.note}</td>
        </tr>)}
        </tbody>
      </table>
    </div> : <div className="bk-empty">לא נמצאה התאמה. נסו מהות הוצאה אחרת או ניקוי הסינון.<button type="button" className="bk-text-button" onClick={() => { setQuery(""); setGroup(""); }}>ניקוי חיפוש וסינון</button></div>}
    <details className="bk-notes"><summary>משרד ביתי — תזכורת קצרה</summary>
      <ul><li><b>חשמל:</b> מיון ראשי שמפעיל את אחוז המשרד הביתי המוגדר ללקוח לתקופה.</li>
      <li><b>חשמל 100%:</b> מיון ראשי להוצאה עסקית בלעדית שאושרה, בלי הפחתת בית. אין צורך במשני לאחוז הבית.</li>
      <li>מזינים את מלוא החשבונית. לדוגמה ללא קיזוז מע״מ: 1,000 ₪ ואחוז בית 25% — הוצאה מיוחסת 250 ₪. מע״מ נבדק בנפרד; לא מפחיתים שוב בהערכת המס.</li>
      <li>אחוז חסר דורש בירור; 0% מפורש פירושו שאין חלק עסקי בחשבון הביתי המשותף.</li></ul>
    </details>
    <details className="bk-notes"><summary>ציוד קל, ספקים וקודים משניים</summary>
      <ul><li><b>משרדיות:</b> ציוד מתכלה. <b>ציוד קל:</b> פריט לשימוש חוזר עד 500 ₪ לפריט, לפי בסיס העלות הרלוונטי. זהו כלל משרדי; אין לפצל נכס כדי לרדת מהסף.</li>
      <li>משני בוחרים רק לפי הטבלה — למשל סוג ספק בתוכנות, רכב או נסיעה. לא פותחים משני לכל ספק; חריגים נשמרים בתיק הלקוח.</li>
      <li>ספק מזהים לפי המסמך והזהות המשפטית. מסווגים לפי מה שנרכש; בודקים מספר חשבונית ותקופת שירות לפני קביעה שיש כפילות.</li></ul>
    </details>
    <p className="bk-footnote">מדיניות המיון המשרדית · עודכנה ב־29.10.2026 · סיווג, מס תשומות והתאמה למס נבדקים בנפרד. ההנחיות אינן משנות הגדרות בפייפרלס.</p>
  </div>;
}
