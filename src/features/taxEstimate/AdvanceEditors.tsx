// ─── הערכת מס: מקדמות לכל רשות ולכל אדם, והשלמות לתקופות שעברו ─────────────────
// ‼ השיעור השוטף וההשלמה החד־פעמית נפרדים. השלמה מחושבת רק מרשומה עם שיטה, תחולה, ביסוס ואישור —
//   ונשענת על התקופות והתשלומים בפועל. אין כאן שינוי מקדמה ברשות.
import { useState } from 'react';
import { MONTH_HE } from './engine';
import { AmountView, DocPick, NumField, PERSON, Periods, he, nis, perHe, today, uid } from './parts';
import type { AuthorityAdvance, CatchUp, ItAdvanceSetup, NiAdvanceSetup, NiOverride, Person } from './types';

type Docs = { id: string; label: string; date?: string }[];

/** יתרה: «חוב» / «זכות» במקום סימן מינוס (שגם מתהפך בעברית). */
function BalanceView({ a }: { a: AuthorityAdvance['balanceAtCurrent'] }) {
  if (!('value' in a)) return <AmountView a={a} />;
  return <span>{a.value > 0 ? `חוב ${nis(a.value)}` : a.value < 0 ? `זכות ${nis(-a.value)}` : 'מאוזן'}</span>;
}

/** תוצאת מקדמה אחת — המומלץ מול היום, היתרות, וההסבר במספרים. */
export function AdvanceResult({ a }: { a: AuthorityAdvance }) {
  const fmt = (v?: number) => (v == null ? '—' : a.unit === '%' ? `${v}%` : nis(v));
  return (
    <div className="te-adv">
      <p className="te-adv-head">
        <b>{a.authority === 'it' ? 'מס הכנסה' : 'ביטוח לאומי'}{a.person === 'spouse' ? ` · ${PERSON.spouse}` : ''}</b>
        {a.recommended != null ? <span>מומלץ <b>{fmt(a.recommended)}</b>{a.unit !== '%' ? '' : ' מהמחזור'}{a.current != null ? ` (היום ${fmt(a.current)})` : ''}</span> : <span className="te-nc">אין מקדמה מומלצת — {a.method === 'unknown' ? 'שיטת המקדמה לא ידועה' : 'אין חישוב'}</span>}
      </p>
      {a.belowChangeThreshold && <p className="ty-note">השינוי קטן מ-10% — אין עילה לתיקון בב״ל.</p>}
      <div className="te-calc">
        <div><span>{a.authority === 'it' ? 'מס שנובע מהעסק, אחרי ניכוי מלקוחות' : 'דמי ביטוח לשנה'}</span><b><AmountView a={a.annualDue} /></b></div>
        <div><span>שולם לתקופות עד החתך</span><b>{nis(a.paidPast)}</b></div>
        {a.paidFuture > 0 && <div><span>שולם מראש לתקופות שאחרי החתך</span><b>{nis(a.paidFuture)}</b></div>}
        <div><span>יתרה בסוף השנה — במקדמה הנוכחית</span><b><BalanceView a={a.balanceAtCurrent} /></b></div>
        <div><span>יתרה בסוף השנה — במקדמה המומלצת</span><b><BalanceView a={a.balanceAtRecommended} /></b></div>
        <div><span>השלמה חד־פעמית לתקופות שעברו</span><b><AmountView a={a.catchUp} /></b></div>
        <div><span>ריבית והצמדה</span><b><AmountView a={a.interestLinkage} /></b></div>
        <div><span>קנס</span><b><AmountView a={a.fine} /></b></div>
      </div>
      {a.catchUpLines && a.catchUpLines.length > 0 && (
        <div className="te-table-wrap"><table className="te-table"><thead><tr><th>תקופה</th><th>לפי ההשלמה</th><th>שולם/חויב</th><th>הפרש</th></tr></thead>
          <tbody>{a.catchUpLines.map(l => <tr key={l.period}><td>{/^\d{4}-\d{2}$/.test(l.period) ? perHe(l.period) : l.period}</td><td>{nis(l.due)}</td><td>{nis(l.paid)}</td><td>{nis(l.diff)}</td></tr>)}</tbody></table></div>
      )}
      {a.schedule.length > 0 && (
        <div className="te-table-wrap"><table className="te-table"><thead><tr><th>תקופה</th><th>במקדמה הנוכחית</th><th>במומלצת</th></tr></thead>
          <tbody>{a.schedule.map(s => <tr key={s.period}><td>{perHe(s.period)}</td><td>{nis(s.current)}</td><td>{nis(s.recommended)}</td></tr>)}</tbody></table></div>
      )}
      {a.explain.length > 0 && (
        <details className="te-explain"><summary>איך חושב — לבדיקה ביד</summary><ol>{a.explain.map((e, i) => <li key={i}>{e}</li>)}</ol></details>
      )}
    </div>
  );
}

export function ItSetupEditor({ setup, onChange, year, cutoff, docs }: { setup: ItAdvanceSetup; onChange: (s: ItAdvanceSetup) => void; year: number; cutoff: number; docs: Docs }) {
  return (
    <>
      <div className="te-grid">
        <label className="te-field">נבדק בתאריך<input type="date" value={setup.readOn ?? ''} onChange={e => onChange({ ...setup, readOn: e.target.value || undefined })} /></label>
        <label className="te-field">שיטה<select value={setup.method} onChange={e => onChange({ ...setup, method: e.target.value as ItAdvanceSetup['method'] })}>
          <option value="unknown">לא ידוע</option><option value="turnoverRate">אחוז מהמחזור</option><option value="fixed">סכום קבוע</option><option value="none">אין מקדמות</option>
        </select></label>
        {setup.method === 'turnoverRate' && <NumField label="שיעור נוכחי (%)" value={setup.ratePct} onChange={v => onChange({ ...setup, ratePct: v })} />}
        {setup.method === 'fixed' && <NumField label="סכום לתקופה" value={setup.fixedPerPeriod} onChange={v => onChange({ ...setup, fixedPerPeriod: v })} />}
        <label className="te-field">תדירות<select value={setup.frequency} onChange={e => onChange({ ...setup, frequency: Number(e.target.value) as 1 | 2 })}><option value={1}>חודשי</option><option value={2}>דו־חודשי</option></select></label>
        <DocPick docs={docs} value={setup.evidence?.documentId} onChange={id => onChange({ ...setup, evidence: id ? { documentId: id } : setup.evidence?.note ? { note: setup.evidence.note } : undefined, via: id ? 'upload' : setup.via })} />
      </div>
      {setup.evidence?.note && <small className="te-src">מקור: {setup.evidence.note}{setup.readOn ? '' : ' — לאשר מול מסך 134 ולרשום תאריך בדיקה'}</small>}
      <Periods periods={setup.periods} year={year} cutoff={cutoff} withPaid onChange={ps => onChange({ ...setup, periods: ps })} />
    </>
  );
}

export function NiSetupEditor({ setup, onChange, year, cutoff, docs }: { setup: NiAdvanceSetup; onChange: (s: NiAdvanceSetup) => void; year: number; cutoff: number; docs: Docs }) {
  const [mon, setMon] = useState<{ month: number; paid?: number }>({ month: Math.max(1, cutoff) });
  const m = MONTH_HE[cutoff];
  const ps = [...(setup.periods ?? [])].sort((a, b) => a.period.localeCompare(b.period));
  return (
    <>
      <div className="te-grid">
        <label className="te-field">נבדק בתאריך<input type="date" value={setup.readOn ?? ''} onChange={e => onChange({ ...setup, readOn: e.target.value || undefined })} /></label>
        <NumField label="מקדמה חודשית נוכחית" value={setup.monthlyAdvance} onChange={v => onChange({ ...setup, monthlyAdvance: v })} />
        <NumField label="הכנסה חודשית שעליה נשענת המקדמה" value={setup.basisMonthlyIncome} onChange={v => onChange({ ...setup, basisMonthlyIncome: v })} />
        <NumField label={`שולם עד סוף ${m} (סה״כ)`} value={setup.paidToCutoff} onChange={v => onChange({ ...setup, paidToCutoff: v })} hint="או לפי חודש למטה — נדרש להשלמה שאינה מינואר" />
        <DocPick docs={docs} value={setup.evidence?.documentId} onChange={id => onChange({ ...setup, evidence: id ? { documentId: id } : undefined, via: id ? 'upload' : setup.via })} />
      </div>
      {setup.source?.note && <small className="te-src">מקור: {setup.source.note}{setup.readOn ? '' : ' — לאשר מול אתר ב״ל ולרשום תאריך בדיקה'}</small>}
      {ps.length > 0 && (
        <div className="te-table-wrap"><table className="te-table"><thead><tr><th>חודש</th><th>שולם</th><th /></tr></thead>
          <tbody>{ps.map(x => <tr key={x.period}><td>{perHe(x.period)}</td><td>{nis(x.paid)}</td><td><button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange({ ...setup, periods: ps.filter(y => y.period !== x.period) })}>הסר</button></td></tr>)}</tbody></table></div>
      )}
      <div className="te-grid te-add">
        <label className="te-field">חודש<select value={mon.month} onChange={e => setMon({ ...mon, month: Number(e.target.value) })}>{MONTH_HE.slice(1).map((x, i) => <option key={i + 1} value={i + 1}>{x}</option>)}</select></label>
        <NumField label="שולם בחודש" value={mon.paid} onChange={v => setMon({ ...mon, paid: v })} />
        <div className="ty-actions"><button type="button" className="btn btn-sm btn-ghost" disabled={mon.paid == null} onClick={() => { const k = `${year}-${String(mon.month).padStart(2, '0')}`; onChange({ ...setup, periods: [...ps.filter(x => x.period !== k), { period: k, paid: mon.paid }] }); setMon({ ...mon, paid: undefined }); }}>הוסף תשלום חודשי</button></div>
      </div>
    </>
  );
}

const CU_METHOD: Record<CatchUp['method'], string> = {
  rateOnReportedTurnover: 'שיעור חדש × המחזור שדווח בכל תקופה, פחות מה שחויב',
  monthlyDifference: 'מקדמה חודשית חדשה פחות מה ששולם בכל חודש',
  manualAmount: 'סכום שנקבע (למשל בדרישת הרשות)',
};

/** רשומות השלמה לרשות ולאדם: שיטה, תחולה, ביסוס, אסמכתה ואישור. עריכה אחרי אישור מבטלת את האישור. */
export function CatchUpEditor({ list, authority, person, year, cutoff, docs, onChange }: {
  list: CatchUp[]; authority: 'it' | 'ni'; person: Person; year: number; cutoff: number; docs: Docs; onChange: (list: CatchUp[]) => void;
}) {
  const mine = list.filter(c => c.authority === authority && c.person === person);
  const methods: CatchUp['method'][] = authority === 'it' ? ['rateOnReportedTurnover', 'manualAmount'] : ['monthlyDifference', 'manualAmount'];
  const [v, setV] = useState<{ from: number; method: CatchUp['method']; newValue?: number; amount?: number; justification: string; doc?: string }>({ from: 1, method: methods[0], justification: '' });
  const put = (c: CatchUp) => onChange([...list.filter(x => x.id !== c.id), c]);
  return (
    <div className="te-line">
      <p className="ty-label">השלמה לתקופות שעברו</p>
      <p className="ty-note">רק כשהרשות דרשה או כשהמשרד החליט להשלים — נפרד מהשיעור השוטף. נשען על התקופות והתשלומים שנקראו למעלה.</p>
      {mine.map(c => (
        <div key={c.id} className="te-row">
          <span>מ{MONTH_HE[Number(c.effectiveFrom.slice(5, 7))]} · {CU_METHOD[c.method]}{c.newValue != null ? ` · ${authority === 'it' ? `${c.newValue}%` : nis(c.newValue)}` : ''}{c.amount != null ? ` · ${nis(c.amount)}` : ''} · {c.justification}
            {c.approvedAt ? <span className="ty-chip green">אושר {he(c.approvedAt)}</span> : <span className="ty-chip amber">ממתין לאישור</span>}</span>
          <span className="ty-actions">
            {!c.approvedAt && <button type="button" className="btn btn-sm btn-primary" disabled={!c.justification.trim()} onClick={() => put({ ...c, approvedAt: today() })}>אשר השלמה</button>}
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange(list.filter(x => x.id !== c.id))}>הסר</button>
          </span>
        </div>
      ))}
      <div className="te-grid te-add">
        <label className="te-field">חל מתקופה<select value={v.from} onChange={e => setV({ ...v, from: Number(e.target.value) })}>{MONTH_HE.slice(1, cutoff + 1).map((x, i) => <option key={i + 1} value={i + 1}>{x} {year}</option>)}</select></label>
        <label className="te-field">שיטה<select value={v.method} onChange={e => setV({ ...v, method: e.target.value as CatchUp['method'] })}>{methods.map(k => <option key={k} value={k}>{CU_METHOD[k]}</option>)}</select></label>
        {v.method !== 'manualAmount' ? <NumField label={authority === 'it' ? 'שיעור חדש (%)' : 'מקדמה חודשית חדשה'} value={v.newValue} onChange={x => setV({ ...v, newValue: x })} />
          : <NumField label="סכום ההשלמה" value={v.amount} onChange={x => setV({ ...v, amount: x })} />}
        <label className="te-field">ביסוס<input value={v.justification} onChange={e => setV({ ...v, justification: e.target.value })} placeholder="למשל: הודעת פקיד השומה מ-15.07 על שיעור 16.3% מיולי" /></label>
        <DocPick docs={docs} value={v.doc} onChange={doc => setV({ ...v, doc })} />
        <div className="ty-actions"><button type="button" className="btn btn-sm btn-ghost" disabled={!v.justification.trim() || (v.method === 'manualAmount' ? v.amount == null : v.newValue == null)}
          onClick={() => { put({ id: uid(), authority, person, effectiveFrom: `${year}-${String(v.from).padStart(2, '0')}`, method: v.method, newValue: v.method === 'manualAmount' ? undefined : v.newValue, amount: v.method === 'manualAmount' ? v.amount : undefined, justification: v.justification.trim(), source: v.doc ? { documentId: v.doc } : undefined }); setV({ ...v, newValue: undefined, amount: undefined, justification: '', doc: undefined }); }}>רשום השלמה</button></div>
      </div>
    </div>
  );
}

/**
 * דמי ב״ל לעסק זעיר — השלמה מקצועית. ‼ אין ניכוי 52% (מאומת); «70% מהמחזור» — קריאה של החוק. בלי רשומה מאושרת
 * עם שיטה/סכום וביסוס אין מספר, והאישור נחסם.
 */
export function NiOverrideEditor({ list, person, docs, onChange }: { list: NiOverride[]; person: Person; docs: Docs; onChange: (list: NiOverride[]) => void }) {
  const mine = list.filter(o => o.person === person);
  const [v, setV] = useState<{ method: NiOverride['method']; amount?: number; justification: string; doc?: string }>({ method: 'manualAmount', justification: '' });
  const put = (o: NiOverride) => onChange([...list.filter(x => x.id !== o.id), o]);
  return (
    <div className="te-line">
      <p className="ty-label">עסק זעיר — דמי ב״ל</p>
      <p className="ty-note">אין ניכוי 52% לבעל עסק זעיר (סעיף 345(ב)(1)(א) — מאומת). שהבסיס הוא 70% מהמחזור — קריאה של החוק, לא כתוב בו, ואין הנחיה של ב״ל. לכן דמי הביטוח לא מחושבים עד השלמה מאושרת.</p>
      {mine.map(o => (
        <div key={o.id} className="te-row">
          <span>{o.method === 'manualAmount' ? `סכום שנתי ${nis(o.amount)}` : '70% מהמחזור, בלי ניכוי 52%'} · {o.justification}
            {o.approvedAt ? <span className="ty-chip green">אושר {he(o.approvedAt)}</span> : <span className="ty-chip amber">ממתין לאישור</span>}</span>
          <span className="ty-actions">
            {!o.approvedAt && <button type="button" className="btn btn-sm btn-primary" disabled={!o.justification.trim()} onClick={() => put({ ...o, approvedAt: today() })}>אשר</button>}
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange(list.filter(x => x.id !== o.id))}>הסר</button>
          </span>
        </div>
      ))}
      {!mine.length && (
        <div className="te-grid te-add">
          <label className="te-field">שיטה<select value={v.method} onChange={e => setV({ ...v, method: e.target.value as NiOverride['method'] })}>
            <option value="manualAmount">סכום שנתי (משומת ב״ל / ממקדמות)</option><option value="assessedIncome70">להחיל 70% מהמחזור, בלי ניכוי 52%</option>
          </select></label>
          {v.method === 'manualAmount' && <NumField label="דמי ביטוח לשנה" value={v.amount} onChange={x => setV({ ...v, amount: x })} />}
          <label className="te-field">מקור וביסוס<input value={v.justification} onChange={e => setV({ ...v, justification: e.target.value })} placeholder="למשל: שומת ב״ל ל-2025 / החלטת המשרד אחרי בדיקה" /></label>
          <DocPick docs={docs} value={v.doc} onChange={doc => setV({ ...v, doc })} />
          <div className="ty-actions"><button type="button" className="btn btn-sm btn-ghost" disabled={!v.justification.trim() || (v.method === 'manualAmount' && v.amount == null)}
            onClick={() => { put({ id: uid(), person, method: v.method, amount: v.method === 'manualAmount' ? v.amount : undefined, justification: v.justification.trim(), source: v.doc ? { documentId: v.doc } : undefined }); setV({ method: 'manualAmount', justification: '' }); }}>רשום השלמה</button></div>
        </div>
      )}
    </div>
  );
}
