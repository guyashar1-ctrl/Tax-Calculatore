// ─── «מרשימות שע״ם» בתיק הלקוח — לשילוב ב«דוחות והצהרות» של תיק המס (16.10.2026) ──────────────────
// ‼ מצב נגזר על התיק — לא בקשה: «דוח שנתי — שנת מס 2025 — נדרש להגיש עד 31.10.2026 · מקור: שע״ם, נקלט ב-…».
//   פעולה אחת: «פתח בקשה» (טיוטה מוחזקת, בלי פרסום ובלי מייל) או «לבקשה ←» כשכבר נפתחה.
// ‼ מוצגת רק השורה של הלקוח (עמוד ושורה ברשימה) — לא הקובץ המשרדי. בלי חובות — הרכיב לא מציג כלום.

import { useEffect, useState } from 'react';
import type { Client } from '../../types';
import { useObligations } from './useObligations';
import { dmy, obligationDueText, obligationTitle, sourceText, stateLine, stepIsOpen, type Obligation } from './model';
import { filingSummaryText, gmf154Filing } from './fromGmf154';
import { useAutomationJob } from '../../hooks/useAutomationJobs';
import { SHAAM_SYNC_INCOME_TAX_ACTION_TYPE } from '../../types/automation';
import OpenRequestsDialog from './OpenRequestsDialog';
import { HistoryRow } from './ShaamFilingPanel';
import './shaamFiling.css';

export interface ClientObligationRowsProps {
  client: Client;
  onOpenRequests?: (clientId: string, stepId: string) => void;
  onChanged?: () => void;
  /** כמה חובות פתוחות מוצגות — כדי ש«אין דוח או הצהרה פתוחים» שמעליהן לא יסתור אותן. */
  onOpenCount?: (n: number) => void;
}

export default function ClientObligationRows({ client, onOpenRequests, onChanged, onOpenCount }: ClientObligationRowsProps) {
  const { obligations, load } = useObligations(client.id);
  const [opening, setOpening] = useState<Obligation[] | null>(null);
  const rows = (obligations ?? []).filter(o => o.state !== 'dismissed' && o.state !== 'needs_review');
  const openCount = rows.filter(o => o.state === 'open').length;
  useEffect(() => { onOpenCount?.(openCount); }, [openCount, onOpenCount]);
  // ‼ 22.10.2026: הסיכום של קריאת 154 («כל הדוחות הנדרשים הוגשו · נבדק …») יושב כאן — לא בכרטיס מס הכנסה.
  const { job } = useAutomationJob(client.id || undefined, SHAAM_SYNC_INCOME_TAX_ACTION_TYPE);
  const filing = job?.status === 'succeeded' ? gmf154Filing(job.result) : null;
  const checkedOn = filing ? dmy((job?.finishedAt ?? job?.updatedAt ?? '').slice(0, 10)) : '';
  const summary = filing ? [filingSummaryText(filing), checkedOn && `נבדק ${checkedOn}`].filter(Boolean).join(' · ') : '';
  if (!rows.length && !summary) return null;
  const open = rows.filter(o => o.state === 'open');
  const filed = rows.filter(o => o.state === 'history' || o.state === 'filed_per_shaam');
  const context = rows.filter(o => o.state === 'context');
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="shf-client" data-sf-client-rows>
      <h4 className="shf-client-h">מרשימות שע״ם</h4>
      {summary && <p className="shf-muted" style={{ margin: '0 0 .4rem' }} data-gmf154-summary>שע״ם · {summary}</p>}
      <ul className="shf-rows">
        {open.map(o => {
          const live = !!o.stepId && stepIsOpen(o.stepStatus);
          const late = !!o.legalDue && o.legalDue < today;
          return (
            <li key={o.id} className={`shf-row${late ? ' is-overdue' : ''}`} data-sf-client-row="open">
              <span className="shf-row-main">
                <b>{obligationTitle(o)}{o.role === 'spouse' ? ' · בן/בת הזוג' : ''}</b>
                <small className={late ? 'shf-late' : undefined}>{obligationDueText(o)}{o.fine ? ' · חייב בקנס (סימון בשע״ם)' : ''}</small>
                <small className="shf-muted">{sourceText(o)}</small>
              </span>
              <span className="shf-row-act">
                <span className={`shf-chip${live ? '' : ' blue'}`}>{stateLine(o)}</span>
                {live && onOpenRequests
                  ? <button type="button" className="shf-link" onClick={() => onOpenRequests(client.id, o.stepId!)}>לבקשה ←</button>
                  : <button type="button" className="btn btn-sm btn-secondary" onClick={() => setOpening([o])} data-sf-client-open={o.id}>פתח בקשה</button>}
              </span>
            </li>
          );
        })}
        {filed.map(o => <HistoryRow key={o.id} o={o} onOpenRequests={onOpenRequests} onDone={() => void load()} showClient={false} />)}
        {context.map(o => (
          <li key={o.id} className="shf-row is-quiet" data-sf-client-row="context">
            <span className="shf-row-main"><b>{obligationTitle(o)}</b><small>{obligationDueText(o)}</small><small className="shf-muted">{sourceText(o)}</small></span>
          </li>
        ))}
      </ul>
      {opening && (
        <OpenRequestsDialog obligations={opening} clients={[client]} onClose={() => { setOpening(null); void load(); }}
          onDone={() => { void load(); onChanged?.(); }} />
      )}
    </div>
  );
}
