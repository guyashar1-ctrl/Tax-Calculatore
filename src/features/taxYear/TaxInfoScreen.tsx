// ─── מסך שאלון ייעודי בדף האישי (13.10.2026) ─────────────────────────────────────
// ‼ גיא: השאלון היה «מוטמע» בתוך רשימת הבקשות. עכשיו — מסך משלו: שם התהליך והתקופה בראש, התקדמות,
//   «שמירה ויציאה» ו«חזרה לבקשות». אותה תשתית (TaxInfoFlow), אותו קישור, אותן הרשאות — לא מערכת נפרדת.
// ‼ הכתובת זוכרת שהשאלון פתוח (#q=<בקשה>): רענון חוזר לאותו מסך, «אחורה» בטלפון חוזר לבקשות.

import { useEffect, useRef, useState } from 'react';
import TaxInfoFlow from './TaxInfoFlow';
import './taxYear.css';

export const TAX_INFO_HASH = 'q=';
/** הבקשה שהכתובת אומרת שפתוחה — או null. */
export const openTaxInfoFromHash = (): string | null => {
  const m = typeof location !== 'undefined' ? location.hash.match(/(?:^#|&)q=([^&]+)/) : null;
  return m ? decodeURIComponent(m[1]) : null;
};

interface Props { stepId: string; token: string; label: string; sub?: string; onClose: () => void }

export default function TaxInfoScreen({ stepId, token, label, sub, onClose }: Props) {
  const [title, setTitle] = useState(label);
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // ‼ פתיחה = כניסה להיסטוריה; «אחורה» סוגר. רענון עם #q= פותח שוב (PublicPortalPage).
    if (openTaxInfoFromHash() !== stepId) history.pushState({ taxInfo: stepId }, '', `#${TAX_INFO_HASH}${encodeURIComponent(stepId)}`);
    const onPop = () => { if (openTaxInfoFromHash() !== stepId) onClose(); };
    window.addEventListener('popstate', onPop);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    head.current?.focus();
    return () => { window.removeEventListener('popstate', onPop); document.body.style.overflow = prev; };
  }, [stepId, onClose]);
  const close = () => {
    if (openTaxInfoFromHash() === stepId) history.back(); // popstate ⇒ onClose
    else onClose();
  };
  return (
    <div className="tis" role="dialog" aria-modal="true" aria-labelledby="tis-h" data-tax-info-screen={stepId}>
      <header className="tis-head">
        <button type="button" className="tis-back" onClick={close}>→ חזרה לבקשות</button>
        <div className="tis-titles">
          <h1 id="tis-h" ref={head} tabIndex={-1}>{title}</h1>
          <span className="tis-sub">{sub ?? 'התשובות נשמרות בכל שלב — אפשר לצאת ולחזור מאותו קישור'}</span>
        </div>
      </header>
      <main className="tis-body">
        <TaxInfoFlow stepId={stepId} token={token} onClose={close} onTitle={t => setTitle(t)} />
      </main>
    </div>
  );
}
