// ─── «מה מבקשים מהלקוח» — תצוגה אחת, בשני מקומות (15.10.2026) ─────────────────────────────────────
// ‼ גיא (15.10): בעמוד התחום הוצגו כמויות («12 שאלות · 3 מסמכים») בלי דרך לראות אותן. עכשיו הכמויות הן שורות שנפתחות
//   במקום, ובתוכן השאלות והמסמכים עצמם — באותו רכיב ומאותו מקור (learnPath.askAreasView) שמשמש את שלב «מה מבקשים מהלקוח»
//   במסלול הלימוד. הכותרת והפירוט נגזרים מאותה רשימה, ולכן לא יכולים לסתור.
// ‼ זה הקטלוג הכללי של השאלון, לא תשובות של לקוח מסוים: ליד כל פריט כתוב למי הוא מיועד ומתי הוא נשאל (רק כללים שכבר קיימים).
// ‼ נפתח ונסגר במקום — אין ניווט, ולכן אין מה לאבד: ההקשר, הגלילה והחזרה נשארים כמו שהיו.

import { useState } from 'react';
import { countsText, sumCounts, type ClientAskArea } from './learnPath';
import './learnPath.css';

interface Props {
  areas: ClientAskArea[];
  /** רמת הכותרת של כל תחום — מתחת לכותרת הסעיף שמכיל את הרכיב. */
  level: 3 | 4;
  /** נפתח במלואו או סגור (שורה לכל תחום). */
  startOpen?: 'all' | 'none';
  idPrefix: string;
  /** כשנפתח מתוך תיק לקוח — לאן הולכים לראות את התשובות שלו. */
  client?: { name: string; onOpen: () => void } | null;
}

export default function ClientAsksPanel({ areas, level, startOpen = 'none', idPrefix, client = null }: Props) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(startOpen === 'all' ? areas.map(a => a.id) : []));
  const allOpen = areas.length > 0 && areas.every(a => open.has(a.id));
  const toggle = (id: string) => setOpen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const H = `h${level}` as 'h3' | 'h4';
  if (areas.length === 0) return null;
  return (
    <div className="kn-asks-panel" data-asks-panel>
      <p className="kn-xs kn-muted kn-asks-note">
        זה הקטלוג הכללי של השאלון — לא תשובות של לקוח מסוים. לא כל פריט נשלח לכל לקוח: ליד כל אחד כתוב למי הוא מיועד ומתי הוא נשאל.
        {client ? <> התשובות והקבצים של {client.name} — בתיק המס שלו. <button type="button" className="kn-link" onClick={client.onOpen}>לתיק של {client.name}</button></>
          : <> התשובות והקבצים של לקוח מסוים — בתיק המס שלו, בעבודה שנפתחה לו.</>}
      </p>
      <div className="kn-asks-bar">
        <span className="kn-small" data-asks-total>בסך הכול: {countsText(sumCounts(areas))}</span>
        {areas.length > 1 && (
          <button type="button" className="kn-link" onClick={() => setOpen(allOpen ? new Set() : new Set(areas.map(a => a.id)))} data-asks-toggle-all>
            {allOpen ? 'סגור הכול' : 'פתח הכול'}
          </button>
        )}
      </div>
      {areas.map(a => {
        const isOpen = open.has(a.id);
        const panelId = `${idPrefix}-${a.id}`;
        return (
          <div key={a.id} className={`kn-ask-area${isOpen ? ' is-open' : ''}`} data-ask-area={a.id}>
            <H className="kn-ask-h">
              <button type="button" className="kn-ask-toggle" aria-expanded={isOpen} aria-controls={panelId} onClick={() => toggle(a.id)}>
                <svg className="kn-ask-chev" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span className="kn-ask-title">{a.title}{a.parts1301.length ? <small> · 1301 חלק {a.parts1301.join(', ')}</small> : null}</span>
                <span className="kn-ask-n" data-ask-count>{countsText(a.counts)}</span>
              </button>
            </H>
            <ul className="kn-ask-list" id={panelId} hidden={!isOpen}>
              {a.asks.map(x => (
                <li key={x.key}>
                  <div className="kn-ask-main">
                    <span>{x.question ?? x.label}</span>
                    <span className="kn-ask-tags">
                      {x.doc && <span className="kn-tag">מסמך: {x.doc}</span>}
                      {x.byOffice && <span className="kn-tag is-office">המשרד ממלא</span>}
                    </span>
                  </div>
                  <div className="kn-ask-meta">{[x.audience, ...x.conditions].filter(Boolean).join(' · ')}</div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
