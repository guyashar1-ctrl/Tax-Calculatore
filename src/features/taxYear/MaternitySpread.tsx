// ─── «דמי לידה: פריסה בין שנות המס» — שורת המשרד (16.10.2026) ──────────────────────────
// ‼ הצעה בלבד: חלוקה יחסית לפי ימי הזכאות (maternity.ts). האם לבקש פריסה — הכרעה של המשרד (כדאיות = השוואת המס
//   בשתי השנים; המחקר: spreading-deferral-continuity-2026-10-16.md §3).
// ‼ C26 · אין עדיין מנגנון רב-שנתי: ההחלטה נרשמת לשנה הזו, ועותק שלה לשנה השנייה עם «לבדיקה בדוח של {שנה}» —
//   כך היא מופיעה כשנפתח הדוח של השנה השנייה. לא נבנה כאן מנגנון חדש.

import { useState } from 'react';
import type { Client } from '../../types';
import type { ItemStatus } from './picture';
import type { YearFact } from './types';
import { maternityAmountsOf, maternityPeriodOf, maternitySplit, type SpreadDecision } from './maternity';
import * as api from './api';

const he = (iso: string) => iso.split('-').reverse().join('.');
const nis = (n?: number) => (n === undefined ? '—' : `${n.toLocaleString('he-IL', { maximumFractionDigits: 1 })} ₪`);

export default function MaternitySpreadLine({ s, client, facts, year, stepId, busy, run }: {
  s: ItemStatus; client: Client; facts: YearFact[]; year: number; stepId: string; busy: boolean;
  run: (fn: () => Promise<unknown>, done?: string) => Promise<boolean>;
}) {
  const per = maternityPeriodOf(facts, s.subjectRole);
  const known = maternityAmountsOf(facts, s.subjectRole);
  const [amount, setAmount] = useState(known.amount !== undefined ? String(known.amount) : '');
  const [tax, setTax] = useState(known.tax !== undefined ? String(known.tax) : '');
  const [decision, setDecision] = useState<SpreadDecision['decision']>('spread');
  const [form116c, setForm116c] = useState<SpreadDecision['form116c']>('withReturn');
  const name = s.subjectRole === 'spouse' ? (client.spouseFirstName || client.spouse?.firstName || 'בן/בת הזוג') : (client.firstName || 'הלקוח');
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
  const split = per ? maternitySplit(per.from, per.to, num(amount), num(tax)) : null;
  const otherYear = split?.years.find(y => y.year !== year)?.year;

  if (!per || !split) {
    return (
      <div className="ty-row" data-maternity-spread>
        <div className="ty-main"><b>{s.item.label} · {name}</b><small>חסרים תאריכי הזכאות — מההודעה של ביטוח לאומי.</small></div>
      </div>
    );
  }

  const save = () => run(async () => {
    const value: SpreadDecision = { decision, from: per.from, to: per.to, totalDays: split.totalDays, years: split.years, form116c, otherYear: otherYear!, reviewInOtherYear: true };
    const fact = (y: number, note: string) => ({ taxYear: y, itemKey: s.item.key, subjectRole: s.subjectRole, periodKind: 'year', periodFrom: `${y}-01-01`, periodTo: `${y}-12-31`,
      answer: 'value', value, basis: 'actual', requestId: stepId, note });
    const r1 = await api.recordFact(client.id, fact(year, decision === 'spread' ? 'פריסת דמי לידה — לפי ימי הזכאות' : 'דמי לידה — בלי פריסה') as never) as { ok?: boolean; error?: string };
    if (r1 && r1.ok === false) return r1;
    // ‼ C26: אותה החלטה, לשנה השנייה — «לבדיקה» בדוח שלה (ההכנסה והמס המשויכים אליה, וחובת הדוח)
    return api.recordFact(client.id, fact(otherYear!, `לבדיקה בדוח של ${otherYear}: החלטת פריסת דמי לידה מהבקשה של ${year}`) as never);
  }, decision === 'spread'
    ? `נשמר: חלוקה לפי ימים לשתי השנים. לבדיקה גם בדוח של ${otherYear}.`
    : `נשמר: בלי פריסה — הכול בשנת הקבלה. נרשם גם לשנת ${otherYear}, לבדיקה.`);

  return (
    <div className="ty-row ty-mat" data-maternity-spread>
      <div className="ty-main">
        <b>{s.item.label} · {name}</b>
        <small>תקופת הזכאות <span dir="ltr" className="ty-ltr">{he(per.from)}–{he(per.to)}</span> · {split.totalDays} ימים: {split.years.map(y => `${y.days} ב-${y.year}`).join(', ')}</small>
        <div className="ty-mat-in">
          <label>שולם לפי האישור השנתי (₪)<input type="number" inputMode="decimal" dir="ltr" value={amount} onChange={e => setAmount(e.target.value)} data-mat-amount /></label>
          <label>מס שנוכה (₪)<input type="number" inputMode="decimal" dir="ltr" value={tax} onChange={e => setTax(e.target.value)} data-mat-tax /></label>
        </div>
        <table className="ty-mat-t" data-mat-split>
          <thead><tr><th>שנה</th><th>ימים</th><th>דמי לידה</th><th>מס שנוכה</th></tr></thead>
          <tbody>{split.years.map(y => <tr key={y.year}><td>{y.year}</td><td>{y.days}</td><td>{nis(y.amount)}</td><td>{nis(y.tax)}</td></tr>)}</tbody>
        </table>
        <div className="ty-mat-in">
          <label>ההחלטה
            <select value={decision} onChange={e => setDecision(e.target.value as SpreadDecision['decision'])} data-mat-decision>
              <option value="spread">לבקש פריסה — לפי ימי הזכאות</option>
              <option value="noSpread">בלי פריסה — הכול בשנת הקבלה</option>
            </select>
          </label>
          {decision === 'spread' && (
            <label>טופס 116ג
              <select value={form116c} onChange={e => setForm116c(e.target.value as SpreadDecision['form116c'])} data-mat-116c>
                <option value="filed">הוגש</option>
                <option value="withReturn">יצורף לדוח</option>
                <option value="notYet">עוד לא</option>
              </select>
            </label>
          )}
        </div>
        <small className="ty-mat-note">הכרעה שחוצה שנים: נשמרת גם לשנת {otherYear} ומסומנת שם «לבדיקה». חובה להגיש דוח לשתי השנים. הפרשים ששולמו מאוחר — לא מחולקים כאן.</small>
      </div>
      <div className="ty-side">
        <button type="button" className="btn btn-sm btn-primary" disabled={busy || !otherYear} onClick={() => void save()} data-mat-save>שמור החלטה</button>
      </div>
    </div>
  );
}
