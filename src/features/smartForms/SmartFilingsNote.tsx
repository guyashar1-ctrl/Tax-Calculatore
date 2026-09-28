// ─── תיק המס · מה מבוקש מב"ל כרגע (הגשות 6101) ───────────────────────────
// ‼ המשטח המקצועי מתאר מצב ורק מצביע על העבודה (יסודות §3): כאן מופיע מה
// מבוקש ובאיזה שלב — לצד מה שב"ל מחזיק, ולא במקומו. הניהול עצמו ב«בקשות».

import { useEffect, useState } from 'react';
import { FILING_STATE_LABELS, loadClientFilings, type Filing } from './api';
import { BTL6101_PURPOSE_LABELS } from './btl6101/model';
import { formDate } from './btl6101/layout6101';
import './smartForms.css';

export default function SmartFilingsNote({ clientId, onOpenRequests }: { clientId: string; onOpenRequests?: () => void }) {
  const [filings, setFilings] = useState<Filing[]>([]);
  useEffect(() => {
    let alive = true;
    void loadClientFilings(clientId).then(f => { if (alive) setFilings(f); }).catch(() => { if (alive) setFilings([]); });
    return () => { alive = false; };
  }, [clientId]);

  const shown = filings.filter(f => !['closed', 'cancelled'].includes(f.state)
    || (f.state === 'closed' && f.closedAt && Date.now() - Date.parse(f.closedAt) < 90 * 86_400_000));
  if (!shown.length) return null;

  return (
    <div className="txf-sect" style={{ marginTop: '.5rem' }}>
      {shown.map(f => (
        <div key={f.id} style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline', flexWrap: 'wrap', fontSize: 'var(--fs-13)', padding: '.45rem .2rem' }}>
          <b>ביטוח לאומי · טופס 6101</b>
          <span className={`sf-badge ${f.state === 'closed' ? 'sf-b-verified' : 'sf-b-entered'}`}>{FILING_STATE_LABELS[f.state]}</span>
          <span style={{ color: 'var(--ink-3)' }}>
            מבוקש: {f.purposes.map(p => BTL6101_PURPOSE_LABELS[p]).join(' · ') || '—'}
            {f.submission?.submittedAt ? ` · הוגש ${formDate(f.submission.submittedAt)}` : ''}
            {f.submission?.reference ? ` · אסמכתא ${f.submission.reference}` : ''}
            {f.outcome?.status ? ` · תשובה: ${f.outcome.status === 'approved' ? 'אושר' : f.outcome.status === 'partial' ? 'אושר חלקית' : 'נדחה'}` : ''}
          </span>
          <span style={{ color: 'var(--ink-4)', fontSize: 'var(--fs-12)' }}>
            {f.state === 'closed' ? '' : 'המצב הרשום בב"ל לא משתנה עד תשובה רשמית'}
          </span>
          {onOpenRequests && <button type="button" className="ui-linkbtn" style={{ color: 'var(--accent)', fontSize: 'var(--fs-12)' }} onClick={onOpenRequests}>לבקשה ←</button>}
        </div>
      ))}
    </div>
  );
}
