// ─── «בדוק אם נקלט» — אחרי ההגשה לשע״ם, כפתור אחד לכל הגשה ──────────────────
// ‼ 29.10.2026 (ליאת): אותו כפתור בשורת «ייצוג מול הרשויות» ב«בקשות» ובשורת מס הכנסה
// בתיק המס — קריאה בלבד, דרך ShaamNextActionButton (חיבור, מחשב עבודה, עצירה).
// ‼ כל הגשה עטופה ב-.shaam-check-item שמקבל את היישור של העמודה: בלי זה הכפתור
// התיישר לפי הטקסט שמתחתיו ולא לפי הקצה, ולא עמד מתחת לכפתור של ביטוח לאומי.

import type { Client, RepresentationRequest } from '../types';
import { shaamSubmissions, requestScope, peopleFromClient } from '../utils/repScope';
import { submissionItOwner } from '../features/representation/repPreparation';
import { shaamRepresentationAction } from '../features/taxFile/shaamRepresentationAction';
import ShaamNextActionButton from './ShaamNextActionButton';

export const SHAAM_RECEIPT_CHECK_LABEL = 'בדוק אם נקלט';

interface Props {
  request: RepresentationRequest;
  linkedClient: Client;
  /** הבדיקה הסתיימה — הקורא מרענן את הבקשה והכרטיס. */
  onChanged?: () => void;
  className?: string;
  errorClassName?: string;
}

export default function ShaamReceiptCheck({
  request, linkedClient, onChanged, className = 'btn btn-sm', errorClassName = 'rep-track-next-err',
}: Props) {
  if (request.status !== 'awaiting_authorities') return null;
  const people = peopleFromClient(linkedClient);
  const checks = shaamSubmissions(requestScope(request, linkedClient), people, submissionItOwner(request, linkedClient))
    .map(sub => ({ sub, action: shaamRepresentationAction(request.status, request.execution?.shaam?.[sub.key], true) }))
    .filter(x => x.action?.kind === 'check');
  if (checks.length === 0) return null;
  return (
    <>
      {checks.map(({ sub, action }) => (
        <div key={sub.key} className="shaam-check-item">
          {checks.length > 1 && sub.title && <div className="shaam-check-who">{sub.title}</div>}
          <ShaamNextActionButton
            request={request} linkedClient={linkedClient} submission={sub}
            action={action ? { ...action, label: SHAAM_RECEIPT_CHECK_LABEL } : action}
            tracking={request.execution?.shaam?.[sub.key]} married={people.married}
            onChanged={onChanged} className={className} errorClassName={errorClassName}
          />
        </div>
      ))}
    </>
  );
}
