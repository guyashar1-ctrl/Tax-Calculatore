// ─── מסמך מקור ← הנתון ← השדה (כרטיס לכל מסמך) — בנושא «הכנת הדוח» ובעמוד «דוח שנתי» (‎learn/annual/d/<id>‎) ─────
// ‼ רכיב אחד לשני המקומות: אותו כרטיס, אותם קישורים. 26.10.2026 (ההמחשה שאושרה, docs/proposals/2026-10-24-knowledge-codex):
//   קוד בשורה הוא קישור — קוד שמוביל לסעיף אחד (קודם בטפסים שבשורה, אחרת ב-1301) פותח אותו בטופס; כמה — את הבחירה (‎c/<קוד>‎);
//   מספר טופס במפה פותח את הטופס. בלי התאמה — טקסט, לא ניחוש.

import { Fragment, useState, type ReactNode } from 'react';
import { ClaimTag } from './lesson';
import { SOURCE_DOCS } from '../sourceDocs';
import { MAP_FORMS, findFields, type CodeHit } from '../formMap/model';
import { formatAreaPath, type AreaPath } from '../../taxArea/areaModel';

const href = (p: AreaPath) => `#/tax/${formatAreaPath(p)}`;
const formHref = (form: string) => href({ mode: 'learn', domain: 'annual', form });
// ‼ 6111 אינו במפה כטופס עם שדות — עמודים בלבד (formMap/printed.ts)
const FORM_LINKS = new Set([...MAP_FORMS.filter(f => f.domain === 'annual').map(f => f.slug), '6111']);
/** שורה שעוסקת בהטבת יישוב — הקישור לכלי היישובים (כמו בסעיף ב-1301). */
const settlementRow = (code: string, what: string) => code.includes('093/193') || /הטבת יישוב/.test(what);

function fieldsWithCode(code: string): CodeHit[] {
  return [...new Map(findFields(code).filter(h => h.field.codes.some(c => c.code === code)).map(h => [`${h.slug}/${h.field.key}`, h])).values()];
}

/** הקודים שבשורה — כקישורים. */
export function codeLinks(str: string): ReactNode[] {
  const named = MAP_FORMS.filter(f => f.slug.length === 4 && str.includes(f.slug)).map(f => f.slug);
  return str.split(/(\b\d{3,4}\b)/).map((s, i) => {
    if (s.length === 4 && FORM_LINKS.has(s)) return <bdi key={i}><a className="kn-link" href={formHref(s)} data-doc-form={s}>{s}</a></bdi>;
    if (!/^\d{3}$/.test(s)) return /^\d{4}$/.test(s) ? <bdi key={i}>{s}</bdi> : <Fragment key={i}>{s}</Fragment>;
    const all = fieldsWithCode(s);
    const inRow = all.filter(h => named.includes(h.slug));
    const matches = inRow.length ? inRow : all.filter(h => h.slug === '1301');
    if (!matches.length) return <bdi key={i}>{s}</bdi>;
    const to = matches.length === 1
      ? href({ mode: 'learn', domain: 'annual', form: matches[0].slug, field: matches[0].field.key, mark: s })
      : href({ mode: 'learn', domain: 'annual', code: s });
    return <bdi key={i}><a className="kn-link" href={to} data-doc-code={s}>{s}</a></bdi>;
  });
}

// ‼ מקורות המיפוי לכל מסמך — מההמחשה שאושרה (research-context, DocumentSources), כלשונם
const DA = 'https://taxes2025.mag.calltext.co.il/magazine/150';
const I26 = 'https://www.gov.il/BlobFolder/policy/inst-08-2026/he/IncomeTax_inst-08-2026.pdf';
function DocumentSources({ id }: { id: string }) {
  return (
    <details className="kn-doc-src" data-doc-sources>
      <summary className="kn-small">מקורות והיקף הבדיקה</summary>
      <p className="kn-xs">המיפוי הוא לשנת 2025. בודקים את המסמך, האדם והשנה בפועל; אישור אינו מוכיח לבדו זכאות לכל הטבה.</p>
      {id === '106' ? <>
        <p className="kn-xs">הטקסט המאונדקס של הטופס הרשמי והסבריו נקרא. לא נטענת בדיקה חזותית של קובץ 106 מלא שהורד בסבב זה.</p>
        <p className="kn-xs"><a href="https://www.gov.il/BlobFolder/service/itc-106/he/IncomeTax_106.pdf" target="_blank" rel="noreferrer">טופס 106 והסבריו ↗</a></p>
      </> : id === 'btl-se' || id === 'btl-benefits' ? <>
        <p className="kn-xs">הוראת ביצוע 08/2026: סעיפים 3.4.1, 3.5 ו־3.5.1 ו־9.11, לפי סוג התשלום. החזר דמי ביטוח והחזר גמלה ביתר הם אירועים שונים.</p>
        <p className="kn-xs"><a href={I26} target="_blank" rel="noreferrer">להוראת הביצוע ↗</a></p>
      </> : id === '867' ? <>
        <p className="kn-xs">מקור המנפיק מאשר את סוגי האישורים ודרך הפקתם לשנת 2025. אין בכך טענה שנבדק חזותית כל מבנה של 867 בכל בנק.</p>
        <p className="kn-xs"><a href="https://www.leumi.co.il/he/Tax_Clearance" target="_blank" rel="noreferrer">לאומי — אישורי המס לשנת 2025 ↗</a></p>
      </> : id === 'rent' ? <>
        <p className="kn-xs"><a href="https://www.capitax.co.il/Attachments/26102004.pdf" target="_blank" rel="noreferrer">ביטוח לאומי — חוזר 1314 בצילום נגיש ↗</a></p>
        <p className="kn-xs">הפטור המוסבר תלוי בהשכרה פסיבית למגורים; לא כלל לכל הכנסה מנדל״ן.</p>
      </> : null}
      <p className="kn-xs"><a href={DA} target="_blank" rel="noreferrer">מדריך רשות המסים 2025 — הכנסות, ניכויים וזיכויים ↗</a></p>
    </details>
  );
}

/** הכרטיסים. selected/onSelect — כשהמסמך בכתובת (עמוד «דוח שנתי»); בלי — בחירה מקומית (בנושא). */
export default function DocCards({ selected, onSelect, idPrefix = 'ar' }: { selected?: string; onSelect?: (id: string) => void; idPrefix?: string }) {
  const [local, setLocal] = useState(SOURCE_DOCS[0].id);
  const id = selected && SOURCE_DOCS.some(x => x.id === selected) ? selected : local;
  const pick = (next: string) => { setLocal(next); onSelect?.(next); };
  const d = SOURCE_DOCS.find(x => x.id === id)!;
  return (
    <div className="kn-page" style={{ gap: 10 }} data-doc-card={d.id}>
      <label className="kn-field kn-doc-pick" htmlFor={`${idPrefix}-doc`}>מסמך
        <select id={`${idPrefix}-doc`} value={id} onChange={e => pick(e.target.value)}>{SOURCE_DOCS.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select>
      </label>
      <div className="kn-doc-tabs" role="tablist" aria-label="מסמכי מקור">
        {SOURCE_DOCS.map(x => <button key={x.id} type="button" role="tab" aria-selected={x.id === id} className={x.id === id ? 'is-on' : ''} onClick={() => pick(x.id)}>{x.title.split(' — ')[0]}</button>)}
      </div>
      <div className="kn-doc" aria-live="polite">
        <h3 className="kn-doc-title">{d.title}</h3>
        <p className="kn-small" style={{ margin: 0 }}>{d.what}</p>
        <p className="kn-xs kn-muted" style={{ margin: 0 }}>מי מנפיק: {d.issuer}</p>
        <div><strong className="kn-small">1. זיהוי</strong><ul className="kn-small">{d.identify.map(x => <li key={x}>{x}</li>)}</ul></div>
        <div><strong className="kn-small">2 ו-3. מה במסמך ⇐ לאיזה שדה</strong>
          <div className="kn-tbl-wrap"><table className="kn-tbl">
            <thead><tr><th>מה במסמך</th><th>קוד (רשום/בן־בת זוג)</th><th>הערה</th><th /></tr></thead>
            <tbody>{d.rows.map(r => (
              <tr key={r.what}>
                <td>{r.what}{settlementRow(r.code, r.what) && <> <a className="kn-link kn-xs" href={href({ mode: 'learn', domain: 'credits', item: 'settlements' })} data-doc-settlements>לבדיקת היישוב ונתוני ההטבה ←</a></>}</td>
                <td style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{codeLinks(r.code)}</td>
                <td className="kn-xs">{r.note ?? ''}</td>
                <td><ClaimTag status={r.status} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
        <div><strong className="kn-small">4. בדיקת המשרד</strong><ul className="kn-small">{d.check.map(x => <li key={x}>{x}</li>)}</ul></div>
        <div className="kn-two">
          <div><strong className="kn-small">טעויות נפוצות</strong><ul className="kn-small">{d.mistakes.map(x => <li key={x}>{x}</li>)}</ul></div>
          <div><strong className="kn-small">כשהמסמך חסר או חלקי</strong><ul className="kn-small">{d.missing.map(x => <li key={x}>{x}</li>)}</ul></div>
        </div>
        <p className="kn-xs kn-muted" style={{ margin: 0 }}>איך מבקשים: {d.askAs}</p>
        <DocumentSources id={d.id} />
      </div>
    </div>
  );
}
