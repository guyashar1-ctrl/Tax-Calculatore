// ─── ראש תיק המס: שורה אחת + ⋯, ופס «לאישורך» רק כשיש (21.10.2026) ─────────────
// ‼ 21.10.2026 (גיא: «מה זה זהות ורשויות?»): במקום כרטיס המשפט, כרטיס בן/בת הזוג ו«זהות ורשויות» (ReconcilePanel):
//   · השורה — taxFileHeadline; מתחת «נבדק מול הרשויות DD.MM» רק כשהייתה בדיקה.
//   · ⋯ — «בדיקה מול הרשויות» (יישור הקו), «פתיחת כרטיס ל{בן/בת הזוג}», «תצוגה מפורטת».
//   · פס כתום «N עדכונים לאישורך» — רק כש-N>0; «לבדוק» פותח את «הצעות לעדכון» / «דורש טיפול» שמתחת (אותו מקור).
//   · ‼ אין מונה «חסרים» ואין «השלם עם הלקוח»: חסר מוצג «חסר» בתוך הסעיף, ונשאל בשאלון של הדוח או ההערכה.

import { useEffect, useRef, useState } from 'react';
import type { Client } from '../../types';
import type { IncomeTaxHouseholdState } from '../../utils/personRepresentation';
import { spouseNameOnCard } from '../annualReport/profile';
import { taxFileHeadline } from './headline';
import './headline.css';

interface Props {
  client: Client;
  household: IncomeTaxHouseholdState;
  alignedAt?: string | null;
  /** הצעות לעדכון + ממצאים פתוחים מול הרשויות — מה שמחכה להחלטת המשרד. */
  toApprove: number;
  onShowPending: () => void;
  onRunAlignment?: () => void;
  alignBusy?: boolean;
  onOpenDetailed?: () => void;
  onCreateSpouseClient?: () => Promise<void> | void;
  onOpenSpouseClient?: (clientId: string) => void;
}

const ddmm = (iso: string) => { const [, m, d] = iso.slice(0, 10).split('-'); return `${d}.${m}`; };

export default function TaxFileHeadline({ client: c, household, alignedAt, toApprove, onShowPending, onRunAlignment, alignBusy, onOpenDetailed, onCreateSpouseClient, onOpenSpouseClient }: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btnRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey, true);
    window.setTimeout(() => wrapRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus(), 0);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const pick = (fn: () => void) => () => { setOpen(false); btnRef.current?.focus(); fn(); };

  const spouseFirst = (spouseNameOnCard(c).split(/\s+/)[0] ?? '') || 'בן או בת הזוג';
  const linked = !!c.spouseClientId;
  const spouseItem = c.familyStatus !== 'married' ? null
    : linked ? (onOpenSpouseClient ? { label: `פתיחת הכרטיס של ${spouseFirst}`, run: () => onOpenSpouseClient(c.spouseClientId!) } : null)
    : onCreateSpouseClient ? {
        label: creating ? 'פותח…' : `פתיחת כרטיס ל${spouseFirst}`,
        run: () => { setCreating(true); void Promise.resolve(onCreateSpouseClient()).finally(() => setCreating(false)); },
      }
    : null;
  const hasMenu = !!(onRunAlignment || spouseItem || onOpenDetailed);
  const sub = alignBusy ? 'בודק מול הרשויות…' : alignedAt ? `נבדק מול הרשויות ${ddmm(alignedAt)}` : '';

  return (
    <>
      <section className="txf-headline" data-tax-file-top aria-label="תיק המס בשורה">
        <div className="txf-headline-t">
          <b data-tf-headline>{taxFileHeadline(c, household)}</b>
          {sub && <small data-tf-aligned>{sub}</small>}
        </div>
        {hasMenu && (
          <div className="ob-menu-wrap" ref={wrapRef}>
            <button ref={btnRef} type="button" className={`txf-headline-more${open ? ' is-open' : ''}`}
              aria-haspopup="menu" aria-expanded={open} aria-label="עוד פעולות על התיק" data-tf-more
              onClick={() => setOpen(o => !o)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
              </svg>
            </button>
            <div className="ob-menu" role="menu" hidden={!open} aria-label="פעולות על התיק">
              {onRunAlignment && (
                <button type="button" role="menuitem" className="ob-menu-item" disabled={alignBusy} data-run-alignment
                  onClick={pick(onRunAlignment)}>{alignBusy ? 'בודק…' : 'בדיקה מול הרשויות'}</button>
              )}
              {spouseItem && (
                <button type="button" role="menuitem" className="ob-menu-item" disabled={creating} data-tf-spouse-card
                  onClick={pick(spouseItem.run)}>{spouseItem.label}</button>
              )}
              {onOpenDetailed && (
                <button type="button" role="menuitem" className="ob-menu-item" data-tf-detailed
                  onClick={pick(onOpenDetailed)}>תצוגה מפורטת</button>
              )}
            </div>
          </div>
        )}
      </section>
      {toApprove > 0 && (
        <div className="txf-approve" role="status" data-tf-approve>
          <span className="txf-approve-t">{toApprove === 1 ? 'עדכון אחד לאישורך' : `${toApprove} עדכונים לאישורך`}</span>
          <button type="button" className="ui-btn ui-btn-sm" onClick={onShowPending}>לבדוק</button>
        </div>
      )}
    </>
  );
}
