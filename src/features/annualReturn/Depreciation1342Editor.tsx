// ─── דוח הפחת (נספח 1342) לעסק אחד — בתוך «אצלך» (30.10.2026, ההמחשה שאושרה) ───────────────────────────
// ‼ נכס משנה קודמת מגיע לבד (carryForward) — שם, תאריך, עלות ושיעור נעולים; המשרד מוסיף נכסים שנקנו השנה ומסמן נכס שיצא.
//   פחת השנה, הנצבר והיתרה — מחושבים (depreciation1342.ts). צר (טלפון / עמודה צרה) ⇒ כרטיס לכל נכס, בלי גלילה לרוחב.
import { useState } from 'react';
import { compute1342, DEP_RATES, type DepAsset, type DepTable } from './depreciation1342';

const nis = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;
const mmYYYY = (s?: string) => (s && /^\d{4}-\d{2}/.test(s) ? `${s.slice(5, 7)}/${s.slice(0, 4)}` : '—');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `a${Date.now()}${Math.random().toString(36).slice(2, 7)}`);

export default function Depreciation1342Editor({ year, table, carried, busy, onSave, onClose }: {
  year: number;
  /** מה שכבר נשמר בטיוטת הדוח */
  table?: DepTable;
  /** מהדוח של השנה הקודמת — כשעוד לא נשמר כלום השנה */
  carried?: DepTable;
  busy: boolean;
  onSave: (t: DepTable) => Promise<boolean>;
  onClose: () => void;
}) {
  const [t, setT] = useState<DepTable>(() => table ?? carried ?? { assets: [] });
  const [tried, setTried] = useState(false);
  const c = compute1342(t, year);
  // ‼ נכס שנקנה השנה — אין פחת שנצבר קודם (גם אם החודש שונה אחרי שהוקלד נצבר)
  const set = (id: string, patch: Partial<DepAsset>) => setT(x => ({ assets: x.assets.map(a => {
    if (a.id !== id) return a;
    const n = { ...a, ...patch };
    return !n.fromPrior && Number(n.acquired.slice(0, 4)) >= year ? { ...n, accumulated: 0 } : n;
  }) }));
  // נכס שנקנה לפני השנה (רישום ראשון במערכת) — צריך את הפחת שנצבר עד השנה
  const older = (a: DepAsset) => Number(a.acquired.slice(0, 4)) < year;
  const add = () => setT(x => ({ assets: [...x.assets, { id: uid(), name: '', acquired: `${year}-01`, cost: 0, rate: 0, accumulated: 0 }] }));
  const remove = (id: string) => setT(x => ({ assets: x.assets.filter(a => a.id !== id) }));
  const save = async (next: DepTable) => {
    setTried(true);
    if (!next.none && compute1342(next, year).problems.length) return;
    if (await onSave(next)) onClose();
  };
  const num = (v: string) => Number(v.replace(/[^\d.]/g, '')) || 0;

  const rateField = (a: DepAsset) => (
    <span className="dp-rate">
      <select aria-label="שיעור פחת" value={DEP_RATES.some(r => r.rate === a.rate) ? String(a.rate) : a.rate ? 'other' : ''}
        onChange={e => set(a.id, { rate: e.target.value === 'other' || e.target.value === '' ? 0 : Number(e.target.value) })} data-bad={tried && !(a.rate > 0) || undefined}>
        <option value="">שיעור…</option>
        {DEP_RATES.map(r => <option key={r.rate} value={r.rate}>{r.rate}% · {r.label}</option>)}
        <option value="other">אחר</option>
      </select>
      {!DEP_RATES.some(r => r.rate === a.rate) && <input aria-label="שיעור באחוזים" inputMode="decimal" className="dp-num dp-pct" value={a.rate || ''} placeholder="%" onChange={e => set(a.id, { rate: num(e.target.value) })} />}
    </span>
  );
  const disposedField = (a: DepAsset) => (
    <label className="dp-out">
      <input type="checkbox" checked={!!a.disposed} onChange={e => set(a.id, { disposed: e.target.checked ? `${year}-12` : undefined })} /> יצא השנה
      {a.disposed && <input type="month" aria-label="חודש היציאה" value={a.disposed} min={`${year}-01`} max={`${year}-12`} onChange={e => set(a.id, { disposed: e.target.value || undefined })} />}
    </label>
  );

  return (
    <div className="dp" data-dp>
      {t.none ? (
        <p className="dp-none">סומן: לעסק אין רכוש קבוע. <button type="button" className="aw-link" onClick={() => setT({ assets: [] })}>יש נכסים</button></p>
      ) : (
        <>
          {t.assets.length > 0 && (
            <div className="dp-wide">
              <table className="dp-table" aria-label={`דוח פחת ${year} — טופס 1342`}>
                <thead><tr><th>נכס</th><th>רכישה</th><th>עלות</th><th>שיעור</th><th>נצבר עד השנה</th><th>פחת השנה</th><th>יתרה</th><th /></tr></thead>
                <tbody>{c.rows.map(({ asset: a, year: y, remaining }) => (
                  <tr key={a.id} data-dp-asset={a.fromPrior ? 'prior' : 'new'}>
                    <td>{a.fromPrior ? <>{a.name} <span className="dp-carried">מהשנה הקודמת</span></> : <input aria-label="שם הנכס" value={a.name} placeholder="למשל: מחשב נייד" onChange={e => set(a.id, { name: e.target.value })} data-bad={tried && !a.name.trim() || undefined} />}</td>
                    <td>{a.fromPrior ? mmYYYY(a.acquired) : <input type="month" aria-label="חודש הרכישה" value={a.acquired} max={`${year}-12`} onChange={e => set(a.id, { acquired: e.target.value })} />}</td>
                    <td className="dp-n">{a.fromPrior ? nis(a.cost) : <input aria-label="עלות" inputMode="numeric" className="dp-num" value={a.cost || ''} placeholder="₪" onChange={e => set(a.id, { cost: num(e.target.value) })} data-bad={tried && !(a.cost > 0) || undefined} />}</td>
                    <td>{a.fromPrior ? `${a.rate}%` : rateField(a)}</td>
                    <td className="dp-n">{a.fromPrior || !older(a) ? nis(a.accumulated) : <input aria-label="פחת שנצבר עד השנה" inputMode="numeric" className="dp-num" value={a.accumulated || ''} placeholder="0" onChange={e => set(a.id, { accumulated: num(e.target.value) })} />}</td>
                    <td className="dp-n dp-calc">{nis(y)}</td>
                    <td className="dp-n">{nis(remaining)}</td>
                    <td>{a.fromPrior ? disposedField(a) : <button type="button" className="aw-link" onClick={() => remove(a.id)} aria-label="הסרת הנכס">הסרה</button>}</td>
                  </tr>
                ))}</tbody>
                <tfoot><tr><td colSpan={5}>סה״כ פחת השנה ← שורה 17 בנספח 1320</td><td className="dp-n dp-calc" data-dp-total>{nis(c.total)}</td><td colSpan={2} /></tr></tfoot>
              </table>
            </div>
          )}
          {t.assets.length > 0 && (
            <div className="dp-cards">
              {c.rows.map(({ asset: a, year: y, remaining }) => (
                <div key={a.id} className="dp-card" data-dp-asset={a.fromPrior ? 'prior' : 'new'}>
                  {a.fromPrior ? (
                    <div className="dp-card-h"><b>{a.name}</b><span className="dp-carried">מהשנה הקודמת</span></div>
                  ) : (
                    <div className="dp-fields">
                      <label>שם הנכס<input value={a.name} placeholder="למשל: מחשב נייד" onChange={e => set(a.id, { name: e.target.value })} data-bad={tried && !a.name.trim() || undefined} /></label>
                      <label>חודש הרכישה<input type="month" value={a.acquired} max={`${year}-12`} onChange={e => set(a.id, { acquired: e.target.value })} /></label>
                      <label>עלות<input inputMode="numeric" className="dp-num" value={a.cost || ''} placeholder="₪" onChange={e => set(a.id, { cost: num(e.target.value) })} data-bad={tried && !(a.cost > 0) || undefined} /></label>
                      <label>שיעור{rateField(a)}</label>
                      {older(a) && <label>פחת שנצבר עד השנה<input inputMode="numeric" className="dp-num" value={a.accumulated || ''} placeholder="0" onChange={e => set(a.id, { accumulated: num(e.target.value) })} /></label>}
                    </div>
                  )}
                  <dl>
                    {a.fromPrior && <><dt>עלות · שיעור</dt><dd>{nis(a.cost)} · {a.rate}%</dd></>}
                    <dt>נצבר עד השנה</dt><dd>{nis(a.accumulated)}</dd>
                    <dt>פחת השנה</dt><dd className="dp-calc">{nis(y)}</dd>
                    <dt>יתרה</dt><dd>{nis(remaining)}</dd>
                  </dl>
                  {a.fromPrior ? disposedField(a) : <button type="button" className="aw-link" onClick={() => remove(a.id)}>הסרת הנכס</button>}
                </div>
              ))}
              <p className="dp-sum">סה״כ פחת השנה: <b>{nis(c.total)}</b> ← שורה 17 ב-1320</p>
            </div>
          )}
          {!t.assets.length && <p className="dp-none">{carried ? 'כל הנכסים מהשנה הקודמת כבר הופחתו עד הסוף.' : 'אין עדיין נכסים. מוסיפים כל נכס פעם אחת — בשנים הבאות הוא עובר לבד.'}</p>}
        </>
      )}
      {tried && !t.none && c.problems.length > 0 && <p className="dp-err" role="alert">{c.problems.slice(0, 3).join(' · ')}</p>}
      <div className="dp-actions">
        {!t.none && <button type="button" className="btn btn-sm btn-ghost" onClick={add} data-dp-add>＋ נכס שנקנה השנה</button>}
        <button type="button" className="btn btn-sm btn-primary" disabled={busy || (!t.none && !t.assets.length)} onClick={() => void save(t)} data-dp-save>{busy ? 'שומר…' : 'שמירה'}</button>
        {!t.none && !t.assets.length && <button type="button" className="aw-link" disabled={busy} onClick={() => void save({ assets: [], none: true })} data-dp-none>אין לעסק רכוש קבוע</button>}
      </div>
    </div>
  );
}
