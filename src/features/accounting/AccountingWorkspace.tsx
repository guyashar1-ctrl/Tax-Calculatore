import { useMemo, useRef, useState } from 'react';
import type { Client } from '../../types';
import type { Engagement } from '../../types/onboarding';
import type { AdditionalCharge } from '../../types/charges';
import { CHARGE_STATUS_LABELS } from '../../types/charges';
import { formatILS } from '../../utils/quotationCalc';
import { accountingAgreement, accountingName } from './accountingModel';
import { bookkeepingAgentPrompt, rulesVersionLabel } from './bookkeepingPrompt';
import './accountingWorkspace.css';

const matches = (c: Client, q: string) => !q || `${accountingName(c)} ${c.idNumber ?? ''}`.includes(q.trim());

export function BookkeepingWorkspace({ clients, loading = false, error = false, onHandbook, onOpenClient }: {
  clients: Client[]; loading?: boolean; error?: boolean; onHandbook: () => void; onOpenClient: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  // ‼ מועד ההכנה נקבע בלחיצה — הוא חלק מהפרומפט, כדי שיהיה ברור מתי הוכן ועל איזו גרסת כללים
  const [preparedAt, setPreparedAt] = useState<Date | null>(null);
  const [message, setMessage] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const ready = !loading && !error;
  const shown = useMemo(() => clients.filter(c => matches(c, query)), [clients, query]);
  const chosen = useMemo(() => ready ? clients.filter(c => selected.includes(c.id)) : [], [clients, selected, ready]);
  const prompt = useMemo(() => preparedAt && chosen.length ? bookkeepingAgentPrompt({ clients: chosen, preparedAt }) : '', [chosen, preparedAt]);
  const reset = () => { setPreparedAt(null); setMessage(''); };
  const toggle = (id: string) => { setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); reset(); };
  const allShown = shown.length > 0 && shown.every(c => selected.includes(c.id));
  async function copy() {
    const done = 'הועתק. הדביקו בשיחת Claude שיש לה גישה לפייפרלס.';
    try { await navigator.clipboard.writeText(prompt); setMessage(done); return; } catch { /* אין הרשאת לוח — מנסים דרך סימון הטקסט */ }
    area.current?.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { copied = false; }
    setMessage(copied ? done : 'הדפדפן חסם העתקה — הטקסט מסומן; העתיקו ב-Ctrl+C.');
  }
  return <section className="acw" aria-label="הנהלת חשבונות">
    <header className="acw-head"><div><h1>הנהלת חשבונות</h1><p>בוחרים לקוחות ומכינים פרומפט לשיחת Claude.</p></div><div className="acw-actions"><button type="button" onClick={onHandbook}>תורת הנהלת החשבונות</button></div></header>
    <p className="acw-note">הכפתור מעתיק הוראות בלבד. הוא לא מפעיל את Claude, לא בודק ממתינים ולא כותב לפייפרלס — Claude בודק את הממתינים בעצמו, ומציע לפני כל פעולה.</p>
    {loading ? <p role="status">טוען לקוחות…</p> : error ? <p role="alert">לא ניתן לטעון את הלקוחות. נסו לטעון מחדש.</p> : !clients.length ? <p role="status">אין לקוחות להצגה.</p> : <>
      <label className="acw-find"><span className="sr-only">חיפוש לקוח</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="חיפוש לקוח או ת.ז." /></label>
      {!shown.length ? <p role="status">לא נמצא לקוח. <button type="button" className="acw-inline" onClick={() => setQuery('')}>ניקוי החיפוש</button></p> :
      <table className="acw-table acw-records"><thead><tr><th className="acw-check"><input type="checkbox" aria-label="בחירת כל הלקוחות שמוצגים" checked={allShown} onChange={e => { const ids = shown.map(c => c.id); setSelected(prev => e.target.checked ? [...new Set([...prev, ...ids])] : prev.filter(id => !ids.includes(id))); reset(); }} /></th><th>לקוח</th><th>ממתינים</th><th>פעולה</th></tr></thead><tbody>{shown.map(c => <tr key={c.id}><td className="acw-check"><input type="checkbox" aria-label={`בחירת ${accountingName(c)}`} checked={selected.includes(c.id)} onChange={() => toggle(c.id)} /></td><th scope="row">{accountingName(c)}{c.idNumber && <small>{c.idNumber}</small>}</th><td data-label="ממתינים">נבדק בריצה</td><td data-label="פעולה"><button type="button" onClick={() => onOpenClient(c.id)}>לתיק הלקוח</button></td></tr>)}</tbody></table>}
    </>}
    <div className="acw-actions"><button type="button" className="acw-primary" disabled={!chosen.length} onClick={() => { setPreparedAt(new Date()); setMessage(''); }}>הכנת פרומפט לקלוד{chosen.length > 0 ? ` · ${chosen.length === 1 ? 'לקוח אחד' : chosen.length + ' לקוחות'}` : ''}</button>{selected.length > 0 && <button type="button" className="acw-inline" onClick={() => { setSelected([]); reset(); }}>ניקוי הבחירה</button>}</div>
    {prompt && <section className="acw-prompt" aria-label="הפרומפט שהוכן"><h2>פרומפט לשיחת Claude</h2><p>{chosen.map(accountingName).join(' · ')} · תורת המיון {rulesVersionLabel()}</p><textarea ref={area} readOnly rows={10} value={prompt} aria-label="הפרומפט לקלוד" /><button type="button" className="acw-primary" onClick={() => void copy()}>העתקת הפרומפט</button></section>}
    <p className="acw-status" role="status">{message}</p>
  </section>;
}

export function BillingWorkspace({ clients, engagements, charges, loading = false, error = false, onOpenClient }: {
  clients: Client[]; engagements: Engagement[]; charges: AdditionalCharge[]; loading?: boolean; error?: boolean; onOpenClient: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [only, setOnly] = useState<'all' | 'with' | 'without'>('all');
  const rows = useMemo(() => clients.map(client => ({ client, agreement: accountingAgreement(client, clients, engagements) })), [clients, engagements]);
  const hasAgreement = (a: ReturnType<typeof accountingAgreement>) => a.shared || a.beforeVat != null;
  const shown = rows.filter(r => matches(r.client, query) && (only === 'all' || (only === 'with') === hasAgreement(r.agreement)));
  return <section className="acw" aria-label="גבייה">
    <header className="acw-head"><div><h1>גבייה</h1><p>מחירי ההסכם, וקישור להסכם ולתשלומים של כל לקוח.</p></div><div className="acw-actions"><button type="button" disabled aria-describedby="acw-billing-off">בדיקת גבייה בפייפרלס</button></div></header>
    <p id="acw-billing-off" className="acw-note">הגבייה ובדיקת התשלומים בפייפרלס עוד לא חוברו. «נגבה», יתרה וכרטיס אינם ידועים כאן; הסכומים הם של ההסכם הנוכחי.</p>
    {loading ? <p role="status">טוען הסכמים ותשלומים…</p> : error ? <p role="alert">לא ניתן לטעון את ההסכמים והתשלומים. אין להסיק שאין הסכם או חוב.</p> : <>
      <div className="acw-actions acw-filters"><label className="acw-find"><span className="sr-only">חיפוש לקוח</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="חיפוש לקוח או ת.ז." /></label><label>הצגה<select value={only} onChange={e => setOnly(e.target.value as typeof only)}><option value="all">כל הלקוחות</option><option value="with">עם הסכם</option><option value="without">בלי הסכם</option></select></label></div>
      {shown.length > 0 && <table className="acw-table acw-records"><thead><tr><th>לקוח</th><th>ריטיינר לפני מע״מ</th><th>כולל מע״מ</th><th>נגבה / יתרה</th><th>כרטיס / תשלום</th><th>פעולה</th></tr></thead><tbody>{shown.map(({ client, agreement: a }) => <tr key={client.id}><th scope="row">{accountingName(client)}{a.shared && <small>ההסכם בכרטיס בן/בת הזוג — לא חיוב נוסף</small>}</th><td data-label="לפני מע״מ">{a.shared ? 'לפי הכרטיס המקושר' : a.beforeVat == null ? 'אין הסכם פעיל' : formatILS(a.beforeVat)}</td><td data-label="כולל מע״מ">{a.shared ? 'לא נספר שוב' : a.beforeVat == null ? '—' : a.withVat == null ? 'מע״מ לא נקבע בהסכם' : formatILS(a.withVat)}</td><td data-label="נגבה / יתרה">טרם אומת</td><td data-label="כרטיס / תשלום">טרם נבדק</td><td data-label="פעולה"><button type="button" className="acw-link" onClick={() => onOpenClient(a.ownerId ?? client.id)}>הסכם ותשלומים</button></td></tr>)}</tbody></table>}
      {!shown.length && <p role="status">{rows.length ? <>אין לקוחות שמתאימים לסינון. <button type="button" className="acw-inline" onClick={() => { setQuery(''); setOnly('all'); }}>ניקוי</button></> : 'אין לקוחות להצגה.'}</p>}
      {charges.length > 0 && <details><summary>חיובים חד־פעמיים · מהמעקב הקיים</summary><p>מצבי החיוב הרשומים במשרד אינם אימות תשלום בפייפרלס. חיובים אלה אינם משנים את הריטיינר.</p><table className="acw-table acw-records"><thead><tr><th>לקוח</th><th>שירות</th><th>סכום</th><th>מצב במשרד</th></tr></thead><tbody>{charges.map(ch => <tr key={ch.id}><th scope="row">{clients.find(c => c.id === ch.clientId) ? accountingName(clients.find(c => c.id === ch.clientId)!) : 'לקוח'}</th><td data-label="שירות">{ch.description}<small>{ch.dueTrigger || ch.dueDate}</small></td><td data-label="סכום">{ch.currency === 'ILS' ? formatILS(ch.amount) : `${ch.amount} ${ch.currency}`}</td><td data-label="מצב במשרד">{CHARGE_STATUS_LABELS[ch.status]}</td></tr>)}</tbody></table></details>}
    </>}
  </section>;
}
