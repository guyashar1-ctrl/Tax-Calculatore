// ─── הערכת מס: רכיבים קטנים משותפים ────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { MONTH_HE } from './engine';
import type { Amount, AuthorityPeriod, Person } from './types';
import { isNum } from './types';

export const nis = (n?: number) => (n == null || !isFinite(n) ? '—' : `${Math.round(n).toLocaleString('he-IL')} ₪`);
export const he = (iso?: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const uid = () => Math.random().toString(36).slice(2, 10);
export const PERSON: Record<Person, string> = { client: 'הלקוח', spouse: 'בן/בת הזוג' };
export const perHe = (p: string) => `${p.slice(5)}/${p.slice(0, 4)}`;

export function NumField({ label, value, onChange, hint }: { label: string; value?: number; onChange: (v?: number) => void; hint?: string }) {
  const [txt, setTxt] = useState(value == null ? '' : String(value));
  useEffect(() => { setTxt(value == null ? '' : String(value)); }, [value]);
  return (
    <label className="te-field">{label}
      <input inputMode="decimal" value={txt} placeholder="חסר" onChange={e => { setTxt(e.target.value); const n = e.target.value.trim() === '' ? undefined : Number(e.target.value.replace(/[,\s₪]/g, '')); onChange(n != null && isNaN(n) ? value : n); }} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function AmountView({ a, prefix }: { a: Amount; prefix?: string }) {
  if (isNum(a)) return <span>{prefix}{nis(a.value)}{a.basis === 'officeDecision' && <span className="ty-chip violet">לפי רשומה מאושרת</span>}</span>;
  return <span className="te-nc">לא מחושב — {a.why}</span>;
}

export function DocPick({ docs, value, onChange }: { docs: { id: string; label: string; date?: string }[]; value?: string; onChange: (id?: string) => void }) {
  return (
    <label className="te-field">אסמכתה בתיק<select value={value ?? ''} onChange={e => onChange(e.target.value || undefined)}>
      <option value="">— הוזן ממסך הרשות, בלי קובץ —</option>
      {docs.map(d => <option key={d.id} value={d.id}>{d.label}{d.date ? ` · ${he(d.date)}` : ''}</option>)}
    </select><small>צילום מסך או תדפיס — להעלות ל«מסמכים» ולבחור כאן</small></label>
  );
}

export function Periods({ periods, year, cutoff, withPaid, onChange }: { periods: AuthorityPeriod[]; year: number; cutoff: number; withPaid?: boolean; onChange: (ps: AuthorityPeriod[]) => void }) {
  const [p, setP] = useState({ month: Math.max(1, cutoff), state: 'reported' as AuthorityPeriod['state'], turnover: undefined as number | undefined, paid: undefined as number | undefined, charged: undefined as number | undefined });
  const key = `${year}-${String(p.month).padStart(2, '0')}`;
  return (
    <>
      {periods.length > 0 && (
        <div className="te-table-wrap"><table className="te-table"><thead><tr><th>תקופה</th><th>מצב</th><th>מחזור</th>{withPaid && <><th>חיוב</th><th>שולם</th></>}<th /></tr></thead>
          <tbody>{[...periods].sort((a, b) => a.period.localeCompare(b.period)).map(x => (
            <tr key={x.period}><td>{perHe(x.period)}</td><td>{x.state === 'reported' ? 'דווח' : x.state === 'not_due' ? 'טרם הגיע המועד' : 'לא נקרא'}</td><td>{nis(x.turnover)}</td>{withPaid && <><td>{nis(x.charged)}</td><td>{nis(x.paid)}</td></>}
              <td><button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange(periods.filter(y => y.period !== x.period))}>הסר</button></td></tr>
          ))}</tbody></table></div>
      )}
      <div className="te-grid te-add">
        <label className="te-field">חודש סיום התקופה<select value={p.month} onChange={e => setP({ ...p, month: Number(e.target.value) })}>{MONTH_HE.slice(1).map((x, i) => <option key={i + 1} value={i + 1}>{x}</option>)}</select></label>
        <label className="te-field">מצב<select value={p.state} onChange={e => setP({ ...p, state: e.target.value as AuthorityPeriod['state'] })}><option value="reported">דווח</option><option value="not_due">טרם הגיע המועד</option><option value="unknown">לא נקרא</option></select></label>
        <NumField label="מחזור" value={p.turnover} onChange={v => setP({ ...p, turnover: v })} />
        {withPaid && <NumField label="חיוב" value={p.charged} onChange={v => setP({ ...p, charged: v })} />}
        {withPaid && <NumField label="שולם" value={p.paid} onChange={v => setP({ ...p, paid: v })} />}
        <div className="ty-actions"><button type="button" className="btn btn-sm btn-ghost" onClick={() => { onChange([...periods.filter(x => x.period !== key), { period: key, state: p.state, turnover: p.turnover, ...(withPaid ? { paid: p.paid, charged: p.charged } : {}) }]); setP({ ...p, turnover: undefined, paid: undefined, charged: undefined }); }}>הוסף תקופה</button></div>
      </div>
    </>
  );
}
