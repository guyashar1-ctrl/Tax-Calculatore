// «מבנה» — המפה הכוללת: שלושה מקומות, ארבעה פעלים, ואיפה כל דבר מוגדר.
import { useState } from 'react';
import { Icon, Chip } from './ui';
import { LIBRARY } from './flowModel';

type Tab = 'library' | 'flows' | 'client';

const VERBS: { name: string; tone: 'gray' | 'blue' | 'pink' | 'amber'; line: string }[] = [
  { name: 'פתיחה', tone: 'gray', line: 'הבקשה קיימת אצל הלקוח. הוא עוד לא רואה אותה.' },
  { name: 'פרסום', tone: 'blue', line: 'מופיעה בדף האישי של הלקוח. שום מייל לא יוצא.' },
  { name: 'מייל', tone: 'amber', line: 'הודעה אחת מרוכזת לכל נמען — רק על מה שחדש בשבילו.' },
  { name: 'פעולה מול רשות', tone: 'pink', line: 'PIVO עובדת בשע״ם או בב״ל — תמיד בלחיצה שלך.' },
];

const WHERE: { what: string; define: string; act: string; see: string }[] = [
  { what: 'בקשה או מסמך', define: 'ספרייה', act: 'מסלול, או «＋ בקשה» אצל לקוח', see: 'לשונית «בקשות» · הדף האישי' },
  { what: 'מתי ובאיזה סדר', define: 'מסלולים', act: 'האירוע שמתחיל אותו (אישור הצעה), או ידנית מהלקוח', see: 'רצועת המסלול בלשונית «בקשות»' },
  { what: 'מייל ללקוח', define: 'מיילים (הנוסח) · מסלול (מתי)', act: 'לבד, או «שלח» במגש אצל הלקוח', see: 'מיילים ← מה נשלח · «פעילות» אצל הלקוח' },
  { what: 'תזכורת ללקוח', define: 'בתוך השלב במסלול', act: 'לבד, מרוכזת, עד פעמיים', see: 'מיילים ← מה נשלח' },
  { what: 'פעולה מול רשות', define: 'אוטומציות (מה קיים)', act: 'לחיצה בכרטיס הלקוח', see: 'אוטומציות ← הרצות · כרטיס הלקוח' },
  { what: 'חיבור לשע״ם / ב״ל', define: 'חיבורים', act: 'הכפתור בכותרת', see: 'הכפתור בכותרת · חיבורים' },
];

const BEFORE = ['פרטי המשרד', 'צוות', 'בקשות ללקוחות', 'מסמכים', 'הצעות מחיר', 'מיילים', 'תזכורות והתראות', 'אוטומציות', 'חיבורים'];
const AFTER: { name: string; sub?: string; isNew?: boolean }[] = [
  { name: 'פרטי המשרד' },
  { name: 'צוות' },
  { name: 'ספרייה', sub: 'בקשות · מסמכים', isNew: true },
  { name: 'מסלולים', sub: 'מתי, באיזה סדר, ומה קורה לבד', isNew: true },
  { name: 'הצעות מחיר' },
  { name: 'מיילים', sub: 'נוסחים · מה יוצא לבד · אליך · מה נשלח' },
  { name: 'אוטומציות וחיבורים', sub: 'חיבור · פעולות מול רשות · הרצות' },
];
const MOVES: [string, string][] = [
  ['«בקשות ללקוחות» — חמש רשימות, אחת לכל סוג לקוח', 'מסלול אחד, עם תנאי לפי סוג הלקוח'],
  ['«תבניות שמורות», «תבניות מסע», «בקשה מתבנית»', 'ספרייה (בקשה בודדת) או מסלול שמתחיל ידנית'],
  ['«מסמכים» במשרד, ורשימת מסמכים נסתרת בחלון ההוספה', 'ספרייה ← מסמכים, ורשימות מסמכים בתוך הבקשה'],
  ['«ייצוג — מה מסומן מראש» (לא חל על לקוח מהצעה)', 'הגדרת הפריט «בקשת ייצוג» בספרייה'],
  ['תזכורות ללקוח בעמוד נפרד', 'בתוך השלב, ליד מה שהן מזכירות'],
  ['«התראות אליך» בעמוד התזכורות', 'מיילים ← אליך, ו«הודעה אליך כשהושלם» בשלב'],
  ['תזכורת לפני שהצעה פוקעת', 'הצעות מחיר'],
  ['«אוטומציות» ו«חיבורים» בשני עמודים', 'עמוד אחד: קודם החיבור, אחריו מה אפשר להפעיל'],
];

const CLIENT_CHANGES: { name: string; line: string }[] = [
  { name: 'לשונית «בקשות»', line: 'רצועת מסלול אחת למעלה (שלב, מה ממתין ולמי), ומגש «מוכן לשליחה» אחד. בלי קופסת «עוד לא הגיע» נפרדת.' },
  { name: 'הוספת בקשה', line: 'אותה יריעה מכל מקום — מהבקשות, מהמסמכים, מתיק המס — שנפתחת מהספרייה.' },
  { name: 'לשונית «מסמכים»', line: '«בקש מסמך» ו«שליחה ללקוח» יוצרים בקשה אמיתית ומראים מיד אם היא בדף ואם נשלח מייל.' },
  { name: 'הדף האישי', line: 'לא משתנה במבנה: בקשות פתוחות, שלבים שיגיעו, מסמכים, מה הושלם.' },
];

export default function MapView({ go }: { go: (t: Tab) => void }) {
  const [showReal, setShowReal] = useState(false);
  const reqCount = LIBRARY.filter(e => e.shelf === 'request').length;
  const docCount = LIBRARY.filter(e => e.shelf === 'document').length;
  return (
    <div className="fd-map">
      <section className="fd-trio" aria-label="שלושה מקומות">
        <button type="button" className="fd-trio-card" onClick={() => go('library')}>
          <span className="fd-trio-ic"><Icon name="lib" size={20} /></span>
          <span className="fd-trio-name">ספרייה</span>
          <span className="fd-trio-q">מה אפשר לבקש ולשלוח</span>
          <span className="fd-trio-meta">{reqCount} בקשות · {docCount} מסמכים</span>
        </button>
        <span className="fd-trio-arrow" aria-hidden="true">←</span>
        <button type="button" className="fd-trio-card" onClick={() => go('flows')}>
          <span className="fd-trio-ic"><Icon name="flow" size={20} /></span>
          <span className="fd-trio-name">מסלולים</span>
          <span className="fd-trio-q">מתי, באיזה סדר, ומה קורה לבד</span>
          <span className="fd-trio-meta">כשזה קורה ← מה יקרה אחר כך</span>
        </button>
        <span className="fd-trio-arrow" aria-hidden="true">←</span>
        <button type="button" className="fd-trio-card" onClick={() => go('client')}>
          <span className="fd-trio-ic"><Icon name="person" size={20} /></span>
          <span className="fd-trio-name">אצל הלקוח</span>
          <span className="fd-trio-q">מה קרה ומה ממתין, ולמי</span>
          <span className="fd-trio-meta">«בקשות» בכרטיס · הדף האישי</span>
        </button>
      </section>
      <p className="fd-lead">כל דבר מוגדר במקום אחד. מסלול לא מעתיק בקשה — הוא מצביע עליה. מה שקורה אצל לקוח לא משנה את המסלול.</p>

      <section className="fd-block" aria-labelledby="fd-verbs">
        <h2 id="fd-verbs" className="fd-h2">ארבעה דברים שונים</h2>
        <ul className="fd-verbs">
          {VERBS.map(v => (
            <li key={v.name}><Chip tone={v.tone}>{v.name}</Chip><span>{v.line}</span></li>
          ))}
        </ul>
        <p className="fd-note">«בקשת ייצוג» היא מה שהלקוח ממלא וחותם. ההגשה לרשות היא פעולה נפרדת שממתינה לך.</p>
      </section>

      <section className="fd-block" aria-labelledby="fd-where">
        <h2 id="fd-where" className="fd-h2">איפה מגדירים, איפה זה קורה, איפה רואים</h2>
        <div className="fd-where" role="table" aria-label="איפה מגדירים, איפה זה קורה, איפה רואים">
          <div className="fd-where-row is-head" role="row">
            <span role="columnheader">מה</span><span role="columnheader">מגדירים</span><span role="columnheader">קורה</span><span role="columnheader">רואים</span>
          </div>
          {WHERE.map(w => (
            <div className="fd-where-row" role="row" key={w.what}>
              <span role="cell" className="fd-where-what">{w.what}</span>
              <span role="cell" data-l="מגדירים">{w.define}</span>
              <span role="cell" data-l="קורה">{w.act}</span>
              <span role="cell" data-l="רואים">{w.see}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="fd-block" aria-labelledby="fd-office">
        <h2 id="fd-office" className="fd-h2">המשרד — לפני ואחרי</h2>
        <div className="fd-nav-compare">
          <div>
            <div className="fd-cap">היום · {BEFORE.length} עמודים</div>
            <ol className="fd-navlist is-before">{BEFORE.map(b => <li key={b}>{b}</li>)}</ol>
          </div>
          <div>
            <div className="fd-cap">מוצע · {AFTER.length} עמודים</div>
            <ol className="fd-navlist">
              {AFTER.map(a => (
                <li key={a.name}>
                  <span>{a.name}{a.isNew && <Chip tone="blue">חדש</Chip>}</span>
                  {a.sub && <small>{a.sub}</small>}
                </li>
              ))}
            </ol>
          </div>
        </div>
        <ul className="fd-moves">
          {MOVES.map(([from, to]) => (
            <li key={from}><span className="fd-move-from">{from}</span><span className="fd-move-arrow" aria-hidden="true">←</span><span className="fd-move-to">{to}</span></li>
          ))}
        </ul>
      </section>

      <section className="fd-block" aria-labelledby="fd-client">
        <h2 id="fd-client" className="fd-h2">המסכים אצל הלקוח</h2>
        <ul className="fd-changes">
          {CLIENT_CHANGES.map(c => <li key={c.name}><b>{c.name}</b><span>{c.line}</span></li>)}
        </ul>
        <button type="button" className="fd-btn" onClick={() => go('client')}>לראות אצל לקוח לדוגמה ←</button>
      </section>

      <section className="fd-block">
        <button type="button" className="fd-disclose" aria-expanded={showReal} onClick={() => setShowReal(v => !v)}>
          {showReal ? '−' : '+'} מה קיים היום, ומה כאן רק מדומה
        </button>
        {showReal && (
          <div className="fd-real">
            <div><b>קיים היום ונשאר:</b> כל סוגי הבקשות בספרייה, תנאים לפי סוג לקוח ועובדות מההצעה, תלות שפותחת בקשה, טיוטה ← פרסום, הדף האישי האחד, המייל המרוכז, פעולות מול רשות, ומניעת בקשה כפולה בשרת.</div>
            <div><b>מדומה בהדגמה:</b> שלבים עם הגדרת מסירה ותזכורת, מייל שמפרט רק את מה שחדש, עדכון מאוחר מרוכז בסוף היום, עצירה וחידוש, גרסאות למסלול, וכל המיילים — שום דבר לא נשלח.</div>
            <div><b>הפער החשוב היום:</b> המייל המרוכז מפרט את כל מה שממתין (לא רק חדש), ושום דבר בשרת לא מונע שליחה כפולה של אותו מייל.</div>
          </div>
        )}
      </section>
    </div>
  );
}
