// ─── «הדוחות שלך» בדף האישי (280; «הדבר הבא» — סימון על הבקשה ברשימה, PublicPortalPage) ─────────────────────────────────────────────
// ההדמיה המאושרת: docs/proposals/2026-10-21-tax-area-reimagined.html (#portal).
// ‼ הצבעים — של המשרד (משתני CSS שהדף מעביר), לא של PIVO. תגי המצב בצבעים קבועים (אצלך / אצלנו / הוגש / אין).
// ‼ אין כאן שום פנייה לשרת: הנתונים מגיעים מ-PortalActions.loadFilings (חי / דוגמה / תצוגה במשרד).

import { useId, useMemo, useState } from 'react';
import { buildFilingCards, type FilingRow, type FilingYearCard, type PortalFilingsData } from './portalFilingsModel';
import './portalFilings.css';

function Row({ row }: { row: FilingRow }) {
  return (
    <div className={`pf-ob${row.muted ? ' is-muted' : ''}`}>
      <div className="pf-what">
        <b>{row.title}</b>
        <div className="pf-pp">{row.person}</div>
        {row.pill && <span className={`pf-pill is-${row.pill.tone}`}>{row.pill.text}</span>}
      </div>
      <div className="pf-when">
        {row.when && <><b className="pf-num">{row.when.main}</b>{row.when.sub && <span>{row.when.sub}</span>}</>}
      </div>
    </div>
  );
}

function YearCard({ card }: { card: FilingYearCard }) {
  const [open, setOpen] = useState(card.openByDefault);
  const id = useId();
  return (
    <div className={`pf-ycard${open ? ' is-open' : ''}`}>
      <button type="button" className="pf-yhead" aria-expanded={open} aria-controls={`${id}-f`} onClick={() => setOpen(o => !o)}>
        <b className="pf-num" dir="ltr">{card.label}</b>
        <span className="pf-sum">{card.summary}</span>
        {card.allFiled && <span className="pf-pill is-done pf-check" aria-hidden="true">✓</span>}
        <svg className="pf-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <div className="pf-fold" id={`${id}-f`}>
        <div aria-hidden={!open}>
          {card.rows.map(r => <Row key={r.key} row={r} />)}
        </div>
      </div>
    </div>
  );
}

/** «הדוחות שלך» — לכל שנה: מה, של מי, עד מתי, ומה המצב. בלי שורות — הקטע לא מוצג. */
export function PortalFilingsSection({ data, fallbackFirstName }: { data: PortalFilingsData | null; fallbackFirstName: string }) {
  const { header, cards } = useMemo(() => buildFilingCards(data, fallbackFirstName), [data, fallbackFirstName]);
  const id = useId();
  if (!cards.length) return null;
  return (
    <section className="pf-sec" aria-labelledby={`${id}-h`} data-testid="portal-filings">
      <div className="pf-ph">
        <h2 id={`${id}-h`}>הדוחות שלך</h2>
        {header && <span>{header}</span>}
      </div>
      {cards.map(c => <YearCard key={c.key} card={c} />)}
    </section>
  );
}
