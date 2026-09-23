// ─── «2 עיסוקים ›» — חשיפה הדרגתית של עיסוקי ביטוח לאומי ─────────────────────
// ‼ סגור: הספירה בלבד, כמו כל ערך אחר בכרטיס. פתוח: רשימה קומפקטית — שם
// העיסוק כפי שביטוח לאומי קורא לו, ותקופה מלאה. לא טבלה ולא טופס: פירוט קל
// שיושב מתחת לערך, בכפיפות לו. אין צורך במסך המפורט כדי להבין מה הם.

import { useState } from 'react';
import type { NiOccupation } from '../../types';
import {
  niOccupationLabel, niOccupationPeriod, niOccupationsForDisplay,
} from '../../features/nationalInsurance/niOccupations';

export default function NiOccupationsDisclosure({ summary, occupations }: { summary: string; occupations: NiOccupation[] }) {
  const [open, setOpen] = useState(false);
  if (occupations.length === 0) return <div className="v">{summary}</div>;
  const list = niOccupationsForDisplay(occupations);
  return (
    <div className="v txf-occ">
      <button type="button" className="txf-occ-toggle" aria-expanded={open}
        onClick={() => setOpen(o => !o)} title={open ? 'הסתר פירוט' : 'הצג את העיסוקים והתקופות'}>
        <span>{summary}</span>
        <span className={`txf-occ-chev${open ? ' is-open' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <ul className="txf-occ-list">
          {list.map((o, i) => {
            const p = niOccupationPeriod(o);
            return (
              <li key={o.id ?? i}>
                <span className="txf-occ-name">{niOccupationLabel(o)}</span>
                {p.unknown ? (
                  <span className="txf-occ-period">תקופה לא ידועה</span>
                ) : (
                  <span className="txf-occ-period">
                    <span dir="ltr">{p.from}</span>
                    {' עד '}
                    {p.ongoing ? <span className="txf-occ-open">היום</span> : <span dir="ltr">{p.to}</span>}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
