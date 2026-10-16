// ─── «מרשימות שע״ם» בתיק הלקוח — לשילוב ב«דוחות והצהרות» של תיק המס (16.10.2026) ──────────────────
// ‼ מצב נגזר על התיק — לא בקשה: «דוח שנתי — שנת מס 2025 — נדרש להגיש עד 31.10.2026 · מקור: שע״ם, נקלט ב-…».
//   פעולה אחת: «פתח בקשה» (טיוטה מוחזקת, בלי פרסום ובלי מייל) או «לבקשה ←» כשכבר נפתחה.
// ‼ מוצגת רק השורה של הלקוח (עמוד ושורה ברשימה) — לא הקובץ המשרדי. בלי חובות — הרכיב לא מציג כלום.

import { useState } from 'react';
import type { Client } from '../../types';
import { useObligations } from './useObligations';
import { obligationDueText, obligationTitle, sourceText, stateLine, stepIsOpen, type Obligation } from './model';
import OpenRequestsDialog from './OpenRequestsDialog';
import { HistoryRow } from './ShaamFilingPanel';
import './shaamFiling.css';

export interface ClientObligationRowsProps {
  client: Client;
  onOpenRequests?: (clientId: string, stepId: string) => void;
  onChanged?: () => void;
}

export default function ClientObligationRows({ client, onOpenRequests, onChanged }: ClientObligationRowsProps) {
  const { obligations, load } = useObligations(client.id);
  const [opening, setOpening] = useState<Obligation[] | null>(null);
  const rows = (obligations ?? []).filter(o => o.state !== 'dismissed' && o.state !== 'needs_review');
  if (!rows.length) return null;
  const open = rows.filter(o => o.state === 'open');
  const filed = rows.filter(o => o.state === 'history' || o.state === 'filed_per_shaam');
  const context = rows.filter(o => o.state === 'context');
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="shf-client" data-sf-client-rows>
      <h4 className="shf-client-h">מרשימות שע״ם</h4>
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
