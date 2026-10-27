// ─── «פתח בקשה» / «פתח בקשות לכולם» — מחובה שנקלטה לבקשת דוח/הון במנגנון הקיים (16.10.2026) ─────────
// ‼ אותה יצירה כמו «הוספת דוח או הצהרת הון» (createWork → upsert_tax_work + טיוטת שאלות), ואחריה קישור החובה לבקשה.
//   יצירה אינה פרסום ואינה מייל: הבקשה נוצרת כטיוטה מוחזקת; «פרסם בדף» — ב«בקשות» של הלקוח.
// ‼ הצהרת הון: שע״ם מציג שנה בלבד. יום ההצהרה נבחר כאן במפורש — לא מומר מהשנה בשקט.
// ‼ כשל חלקי: כל שורה בנפרד; «נסה שוב» רק לשורות שנכשלו (השרת אידמפוטנטי — עבודה קיימת מקושרת, לא נוצרת שנייה).

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Client } from '../../types';
import { createWork } from '../taxYear/workCreate';
import { linkObligationStep } from './api';
import { dmy, obligationDueText, obligationTitle, toWorkRow, type Obligation } from './model';

interface Props {
  obligations: Obligation[];
  clients: Client[];
  onClose: () => void;
  onDone: (opened: { obligationId: string; clientId: string; stepId: string }[]) => void;
  onOpenRequests?: (clientId: string, stepId: string) => void;
}
type Res = { ok: boolean; stepId?: string; created?: boolean; error?: string } | 'running';

const ERR: Record<string, string> = { client_not_found: 'הכרטיס לא נמצא', forbidden: 'אין הרשאה לכרטיס', step_mismatch: 'הבקשה לא תואמת לחובה', bad_date: 'תאריך לא תקין', bad_year: 'שנה לא תקינה' };

export default function OpenRequestsDialog({ obligations, clients, onClose, onDone, onOpenRequests }: Props) {
  const byId = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const [asOf, setAsOf] = useState<Record<string, string>>({});
  const [res, setRes] = useState<Record<string, Res>>({});
  const [busy, setBusy] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>('input[data-sf-asof], button:not([disabled])')?.focus();
    return () => { document.body.style.overflow = overflow; if (opener?.isConnected) opener.focus(); };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); if (!busy) onClose(); return; }
      if (e.key !== 'Tab') return;
      const nodes = [...(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]') ?? [])].filter(n => n.offsetParent !== null);
      if (!nodes.length) return;
      if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes[nodes.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === nodes[nodes.length - 1]) { e.preventDefault(); nodes[0].focus(); }
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [busy, onClose]);
  const nameOf = (o: Obligation) => { const c = o.clientId ? byId.get(o.clientId) : undefined; return c ? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() : o.clientName ?? 'לקוח'; };
  const needDate = (o: Obligation) => o.kind === 'wealth' && !asOf[o.id];
  const ready = obligations.filter(o => !needDate(o));
  const done = obligations.length > 0 && obligations.every(o => { const r = res[o.id]; return r && r !== 'running' && r.ok; });

  const run = async (only?: Set<string>) => {
    setBusy(true);
    const opened: { obligationId: string; clientId: string; stepId: string }[] = [];
    for (const o of obligations) {
      if (only && !only.has(o.id)) continue;
      const prev = res[o.id];
      if (prev && prev !== 'running' && prev.ok) continue;
      const row = toWorkRow(o, asOf[o.id]);
      const c = o.clientId ? byId.get(o.clientId) : undefined;
      if (!row || !c) { if (!row && o.kind === 'wealth') continue; setRes(x => ({ ...x, [o.id]: { ok: false, error: c ? 'bad_row' : 'client_not_found' } })); continue; }
      setRes(x => ({ ...x, [o.id]: 'running' }));
      let r: Res;
      try {
        const w = await createWork(row, c);
        // ‼ גם כשהטיוטה נכשלה, הבקשה עצמה קיימת — מקשרים אותה, ומציגים שהטיוטה נכשלה
        if (w.stepId) {
          const l = await linkObligationStep(o.id, w.stepId);
          r = l.ok ? { ok: w.ok, stepId: w.stepId, created: w.created, error: w.ok ? undefined : `הבקשה נפתחה, טיוטת השאלות נכשלה (${w.error ?? ''})` } : { ok: false, stepId: w.stepId, error: l.error };
          if (l.ok) opened.push({ obligationId: o.id, clientId: c.id, stepId: w.stepId });
        } else r = { ok: false, error: w.error };
      } catch (e) { r = { ok: false, error: (e as Error).message }; }
      setRes(x => ({ ...x, [o.id]: r }));
    }
    setBusy(false);
    if (opened.length) onDone(opened);
  };
  const failed = obligations.filter(o => { const r = res[o.id]; return r && r !== 'running' && !r.ok; });

  return (
    <div className="modal-backdrop shf-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal shf-modal" role="dialog" aria-modal="true" aria-labelledby="shf-open-h" data-sf-open-dialog ref={panel}>
        <div className="modal-head">
          <h3 id="shf-open-h">{obligations.length === 1 ? 'פתיחת בקשה' : `פתיחת ${obligations.length} בקשות`}</h3>
          <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={onClose} aria-label="סגירה">✕</button>
        </div>
        <div className="modal-body shf-modal-body">
          <p className="shf-note">נפתחת עבודה ב«בקשות» של כל לקוח, עם המועד מהרשימה (מסומן «נמסר, לא מאומת» עד שמצרפים אסמכתה), ו<b>טיוטת שאלות</b> ללקוח. הלקוח לא רואה כלום ולא יוצא מייל עד שמפרסמים בדף — ב«בקשות» של הלקוח. עבודה שכבר קיימת לאותה שנה — מקושרת, לא נפתחת שנייה.</p>
          {obligations.some(o => o.kind === 'wealth') && (
            <p className="shf-note">בהצהרת הון שע״ם מציג שנה בלבד. בחרו את <b>היום שאליו ההצהרה</b> (כפי שכתוב במכתב הדרישה).</p>
          )}
          <ul className="shf-open-rows">
            {obligations.map(o => {
              const r = res[o.id];
              return (
                <li key={o.id} className="shf-open-row" data-sf-open-row={o.id}>
                  <div className="shf-open-head">
                    <b>{nameOf(o)}</b>
                    <span className="shf-muted">{obligationTitle(o)} · {obligationDueText(o)}</span>
                  </div>
                  {o.kind === 'wealth' && (
                    <div className="shf-open-date">
                      <label>ההצהרה ליום
                        <input type="date" dir="ltr" value={asOf[o.id] ?? ''} disabled={busy || (!!r && r !== 'running' && r.ok)} onChange={e => setAsOf(x => ({ ...x, [o.id]: e.target.value }))} data-sf-asof={o.id} />
                      </label>
                      {!asOf[o.id] && /^\d{4}$/.test(o.yearShown) && (
                        <button type="button" className="shf-link" onClick={() => setAsOf(x => ({ ...x, [o.id]: `${o.yearShown}-12-31` }))} data-sf-asof-fill={o.id}>
                          31.12.{o.yearShown} — אם זה מה שבמכתב
                        </button>
                      )}
                      {asOf[o.id] && <span className="shf-muted">ליום {dmy(asOf[o.id])}</span>}
                    </div>
                  )}
                  <div className="shf-open-res" aria-live="polite">
                    {r === 'running' && <span className="shf-muted">פותח…</span>}
                    {r && r !== 'running' && (r.ok
                      ? <><span className="shf-chip green" data-sf-open-result="ok">{r.created ? 'נפתחה · השאלות בטיוטה' : 'קושרה לבקשה קיימת'}</span>{r.stepId && o.clientId && onOpenRequests && <button type="button" className="shf-link" onClick={() => onOpenRequests(o.clientId!, r.stepId!)}>לבקשה ←</button>}</>
                      : <span className="shf-chip red" data-sf-open-result="fail">{r.stepId ? (r.error ?? 'נכשל') : (ERR[r.error ?? ''] ?? `נכשל${r.error ? ` (${r.error})` : ''}`)}</span>)}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="modal-foot shf-modal-foot">
          {done ? <button type="button" className="btn btn-primary" onClick={onClose}>סגירה</button> : failed.length ? (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run(new Set(failed.map(o => o.id)))}>נסה שוב ({failed.length})</button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={busy || !ready.length} onClick={() => void run()} data-sf-open-run>
              {busy ? 'פותח…' : ready.length === obligations.length ? (obligations.length === 1 ? 'פתח בקשה' : `פתח ${obligations.length} בקשות`) : `פתח ${ready.length} מתוך ${obligations.length} (חסר יום הצהרה)`}
            </button>
          )}
          {!done && <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>ביטול</button>}
        </div>
      </div>
    </div>
  );
}
