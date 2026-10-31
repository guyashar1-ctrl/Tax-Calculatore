import { useMemo, useRef, useState } from 'react';
import type { Client } from '../../types';
import type { Engagement } from '../../types/onboarding';
import type { AdditionalCharge } from '../../types/charges';
import { formatILS } from '../../utils/quotationCalc';
import { accountingAgreement, accountingName } from './accountingModel';
import { bookkeepingAgentPrompt, rulesVersionLabel } from './bookkeepingPrompt';
import { clientLedger, dueAtFiling, monthLabel, monthShort, periodToMonth, retainerClientFor, type RetainerSnapshot } from './billingLedger';
import { matchPendingRows, readAgo, usePaperlessRead, type PendingReading } from './paperlessReads';
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
  const pendingRead = usePaperlessRead<PendingReading>('paperless.read_pending');
  const reading = pendingRead.latest?.data ?? null;
  const pending = useMemo(() => reading ? matchPendingRows(reading.clients, clients) : null, [reading, clients]);
  const countOf = (id: string) => pending?.byClient.get(id)?.all ?? 0;
  // ‼ אחרי בדיקה — מי שממתין למעלה; אחרת הסדר הקיים
  const shown = useMemo(() => clients.filter(c => matches(c, query))
    .sort((a, b) => (pending ? countOf(b.id) - countOf(a.id) : 0)), [clients, query, pending]);
  const waiting = pending ? clients.filter(c => countOf(c.id) > 0) : [];
  const chosen = useMemo(() => ready ? clients.filter(c => selected.includes(c.id)) : [], [clients, selected, ready]);
  const prompt = useMemo(() => preparedAt && chosen.length ? bookkeepingAgentPrompt({ clients: chosen, preparedAt, pending: pending && pendingRead.latest ? { readAt: pendingRead.latest.readAt, countOf } : undefined }) : '', [chosen, preparedAt, pending]);
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
    <header className="acw-head"><div><h1>הנהלת חשבונות</h1><p className="acw-sub" role="status">{pendingStatus(pendingRead, reading)}</p></div>
      <div className="acw-actions"><button type="button" className="acw-primary" disabled={pendingRead.busy || pendingRead.unavailable} onClick={() => void pendingRead.start()}>{pendingRead.busy ? 'בודק…' : 'בדיקת ממתינים'}</button><button type="button" onClick={onHandbook}>תורת הנהלת החשבונות</button></div></header>
    {pendingRead.failed && <p className="acw-alert" role="alert">הבדיקה האחרונה לא הושלמה: {pendingRead.failed}</p>}
    {reading && (reading.filtered || (reading.badge != null && reading.badge !== reading.total)) && <p className="acw-alert">בפייפרלס מופיע {reading.badge ?? '—'} בתפריט ו-{reading.total} בטבלה{reading.filtered ? ' (הטבלה הייתה מסוננת)' : ''} — כדאי לבדוק שוב.</p>}
    {loading ? <p role="status">טוען לקוחות…</p> : error ? <p role="alert">לא ניתן לטעון את הלקוחות. נסו לטעון מחדש.</p> : !clients.length ? <p role="status">אין לקוחות להצגה.</p> : <>
      <label className="acw-find"><span className="sr-only">חיפוש לקוח</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="חיפוש לקוח או ת.ז." /></label>
      {waiting.length > 0 && <p className="acw-quick"><button type="button" className="acw-inline" onClick={() => { setSelected(waiting.map(c => c.id)); reset(); }}>בחירת כל מי שממתין ({waiting.length})</button></p>}
      {!shown.length ? <p role="status">לא נמצא לקוח. <button type="button" className="acw-inline" onClick={() => setQuery('')}>ניקוי החיפוש</button></p> :
      <table className="acw-table acw-records"><thead><tr><th className="acw-check"><input type="checkbox" aria-label="בחירת כל הלקוחות שמוצגים" checked={allShown} onChange={e => { const ids = shown.map(c => c.id); setSelected(prev => e.target.checked ? [...new Set([...prev, ...ids])] : prev.filter(id => !ids.includes(id))); reset(); }} /></th><th>לקוח</th><th>ממתינים</th><th>פעולה</th></tr></thead><tbody>{shown.map(c => <tr key={c.id}><td className="acw-check"><input type="checkbox" aria-label={`בחירת ${accountingName(c)}`} checked={selected.includes(c.id)} onChange={() => toggle(c.id)} /></td><th scope="row">{accountingName(c)}{c.idNumber && <small>{c.idNumber}</small>}</th><td data-label="ממתינים">{!pending ? '—' : countOf(c.id) > 0 ? <b>{countOf(c.id)}</b> : <span className="acw-muted">0</span>}</td><td data-label="פעולה"><button type="button" onClick={() => onOpenClient(c.id)}>לתיק הלקוח</button></td></tr>)}</tbody></table>}
      {pending && pending.unmatched.length > 0 && <p className="acw-muted acw-small">בפייפרלס גם: {pending.unmatched.map(r => `${r.name} (${r.all})`).join(' · ')} — לא זוהו ב-PIVO.</p>}
    </>}
    <p className="acw-note">הפרומפט מועתק לשיחת Claude. הכפתור לא מפעיל את Claude ולא כותב לפייפרלס.</p>
    <div className="acw-actions"><button type="button" className="acw-primary" disabled={!chosen.length} onClick={() => { setPreparedAt(new Date()); setMessage(''); }}>הכנת פרומפט לקלוד{chosen.length > 0 ? ` · ${chosen.length === 1 ? 'לקוח אחד' : chosen.length + ' לקוחות'}` : ''}</button>{selected.length > 0 && <button type="button" className="acw-inline" onClick={() => { setSelected([]); reset(); }}>ניקוי הבחירה</button>}</div>
    {prompt && <section className="acw-prompt" aria-label="הפרומפט שהוכן"><h2>פרומפט לשיחת Claude</h2><p>{chosen.map(accountingName).join(' · ')} · תורת המיון {rulesVersionLabel()}</p><textarea ref={area} readOnly rows={10} value={prompt} aria-label="הפרומפט לקלוד" /><button type="button" className="acw-primary" onClick={() => void copy()}>העתקת הפרומפט</button></section>}
    <p className="acw-status" role="status">{message}</p>
  </section>;
}

type Sort = 'amount_desc' | 'amount_asc' | 'name';

export function BillingWorkspace({ clients, engagements, charges, loading = false, error = false, onOpenClient }: {
  clients: Client[]; engagements: Engagement[]; charges: AdditionalCharge[]; loading?: boolean; error?: boolean; onOpenClient: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('amount_desc');
  const [picked, setPicked] = useState<string[]>([]);
  const read = usePaperlessRead<RetainerSnapshot>('paperless.read_retainer');
  const snapshot = read.latest?.data ?? null;
  const period = periodToMonth(snapshot?.period ?? null);
  // ‼ רק מי שיש לו הסכם משלו (גיא 31.10). בן/בת זוג שמכוסה בהסכם של השני — לא שורה נוספת.
  const rows = useMemo(() => clients.map(client => {
    const agreement = accountingAgreement(client, clients, engagements);
    const retainer = retainerClientFor(snapshot, client.idNumber);
    const ledger = clientLedger({ engagements, clientId: client.id, snapshot, retainer });
    return { client, agreement, retainer, ledger, due: dueAtFiling(charges, client.id, ledger) };
  }).filter(r => !r.agreement.shared && r.agreement.beforeVat != null), [clients, engagements, charges, snapshot]);
  const shown = rows.filter(r => matches(r.client, query)).sort((a, b) => sort === 'name'
    ? accountingName(a.client).localeCompare(accountingName(b.client), 'he')
    : (sort === 'amount_desc' ? -1 : 1) * ((a.agreement.beforeVat ?? 0) - (b.agreement.beforeVat ?? 0)));
  const chosen = rows.filter(r => picked.includes(r.client.id));
  const allShown = shown.length > 0 && shown.every(r => picked.includes(r.client.id));
  const status = read.open
    ? (read.open.status === 'needs_human' ? 'חלון הפייפרלס במחשב המשרד לא מחובר — התחברו בו, והבדיקה תמשיך לבד.' : 'בודק בפייפרלס…')
    : read.latest ? `נבדק ${readAgo(read.latest.readAt)}${period ? ` · חודש הגבייה בפייפרלס: ${monthLabel(period)}` : ''}` : 'עוד לא נבדק בפייפרלס.';
  return <section className="acw" aria-label="גבייה">
    <header className="acw-head"><div><h1>גבייה</h1><p className="acw-sub" role="status">{status}</p></div>
      <div className="acw-actions"><button type="button" className="acw-primary" disabled={read.busy || read.unavailable} onClick={() => void read.start()}>{read.busy ? 'בודק…' : 'בדיקה בפייפרלס'}</button></div></header>
    {read.failed && <p className="acw-alert" role="alert">הבדיקה האחרונה לא הושלמה: {read.failed}</p>}
    {loading ? <p role="status">טוען הסכמים…</p> : error ? <p role="alert">לא ניתן לטעון את ההסכמים. אין להסיק שאין הסכם או חוב.</p> : !rows.length ? <p role="status">אין לקוחות עם הסכם תשלום.</p> : <>
      <div className="acw-actions acw-filters"><label className="acw-find"><span className="sr-only">חיפוש לקוח</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="חיפוש לקוח או ת.ז." /></label>
        <label>מיון<select value={sort} onChange={e => setSort(e.target.value as Sort)}><option value="amount_desc">סכום — מהגבוה</option><option value="amount_asc">סכום — מהנמוך</option><option value="name">שם</option></select></label></div>
      {!shown.length ? <p role="status">לא נמצא לקוח. <button type="button" className="acw-inline" onClick={() => setQuery('')}>ניקוי</button></p> :
      <table className="acw-table acw-records acw-billing"><thead><tr>
        <th className="acw-check"><input type="checkbox" aria-label="בחירת כל הלקוחות שמוצגים" checked={allShown} onChange={e => { const ids = shown.map(r => r.client.id); setPicked(p => e.target.checked ? [...new Set([...p, ...ids])] : p.filter(id => !ids.includes(id))); }} /></th>
        <th>לקוח</th><th>חודשי</th><th>כרטיס</th><th>{period ? monthLabel(period) : 'החודש'}</th><th>עם הגשת הדוח</th><th><span className="sr-only">פעולה</span></th></tr></thead>
        <tbody>{shown.map(({ client, agreement: a, retainer, ledger, due }) => {
          const cur = ledger.current;
          const mismatch = retainer?.amountBeforeVat != null && a.beforeVat != null && Math.abs(retainer.amountBeforeVat - a.beforeVat) >= 0.01;
          return <tr key={client.id}>
            <td className="acw-check"><input type="checkbox" aria-label={`בחירת ${accountingName(client)}`} checked={picked.includes(client.id)} onChange={() => setPicked(p => p.includes(client.id) ? p.filter(x => x !== client.id) : [...p, client.id])} /></td>
            <th scope="row">{accountingName(client)}</th>
            <td data-label="חודשי">{formatILS(a.beforeVat!)} <small>+ מע״מ{a.withVat != null ? ` · ${formatILS(a.withVat)}` : ''}</small>{mismatch && <small className="acw-warn">בפייפרלס {formatILS(retainer!.amountBeforeVat!)}</small>}</td>
            <td data-label="כרטיס">{!snapshot ? '—' : !retainer ? <span className="acw-muted">לא בריטיינר</span> : retainer.cardEntered ? <span className="acw-ok">הוזן</span> : <span className="acw-warn">לא הוזן</span>}</td>
            <td data-label={period ? monthLabel(period) : 'החודש'}>{!cur || cur.state === 'unknown' ? '—' : cur.state === 'charged' ? <span className="acw-ok">נגבה{cur.charged != null ? ` ${formatILS(cur.charged)}` : ''}</span> : cur.state === 'open' ? 'טרם נגבה' : <span className="acw-warn">לא נגבה</span>}</td>
            <td data-label="עם הגשת הדוח">{due.total > 0 ? <>{formatILS(due.total)}{due.unpaidMonths.length > 0 && <small>{due.fromCharges > 0 ? `${formatILS(due.fromCharges)} + ` : ''}{due.unpaidMonths.map(m => monthShort(m.month)).join(', ')} לא נגבו</small>}</> : '—'}</td>
            <td data-label="פעולה"><button type="button" className="acw-link" onClick={() => onOpenClient(a.ownerId ?? client.id)}>הסכם ותשלומים</button></td>
          </tr>;
        })}</tbody></table>}
      <div className="acw-collect">
        <span>{chosen.length ? `נבחרו ${chosen.length} · ${formatILS(chosen.reduce((s, r) => s + (r.agreement.beforeVat ?? 0), 0))} + מע״מ` : 'סמנו לקוחות לגבייה'}</span>
        <button type="button" className="acw-primary" disabled aria-describedby="acw-collect-off">{`גבייה${period ? ` ל${monthShort(period)}` : ''}`}</button>
        <small id="acw-collect-off">הגבייה תופעל בגבייה הראשונה שנעשה יחד.</small>
      </div>
    </>}
  </section>;
}

function pendingStatus(read: { open: { status: string } | null; latest: { readAt: string } | null }, reading: PendingReading | null): string {
  if (read.open) return read.open.status === 'needs_human' ? 'חלון הפייפרלס במחשב המשרד לא מחובר — התחברו בו, והבדיקה תמשיך לבד.' : 'בודק ממתינים בפייפרלס…';
  if (!read.latest || !reading) return 'עוד לא נבדק מי ממתין בפייפרלס.';
  const people = reading.clients.length;
  return `נבדק ${readAgo(read.latest.readAt)} · ${reading.total} מסמכים ממתינים${people ? ` אצל ${people === 1 ? 'לקוח אחד' : people + ' לקוחות'}` : ''}`;
}
