// ─── «פתיחת תיקים» של עסק חדש: מה שנקבע בהערכת המקדמות (30.10.2026) ─────────────────────────────────────────
// ‼ הדמיה מאושרת docs/proposals/2026-10-30-tax-estimate-simple.html: «השיעור — לפתיחת התיק במס הכנסה, וההכנסה הצפויה —
//   לטופס 6101». כאן רק מוצג מההערכה שאושרה (taxEstimate/api.ts); בטופס 6101 ההכנסה נכנסת לבד (resolve6101).
import { useEffect, useState } from 'react';
import { latestNewBusinessEstimate, newBusinessFigures } from './api';

export default function NewBusinessAdvancesNote({ clientId }: { clientId: string }) {
  const [f, setF] = useState<ReturnType<typeof newBusinessFigures> | null>(null);
  useEffect(() => {
    let live = true;
    void latestNewBusinessEstimate(clientId).then(v => { if (live) setF(v ? newBusinessFigures(v) : null); });
    return () => { live = false; };
  }, [clientId]);
  if (!f || (f.itRate == null && !f.monthlyIncome)) return null;
  return (
    <p className="rl-facts" data-nb-advances>
      מהערכת המקדמות{f.at ? ` (${f.at.slice(8, 10)}.${f.at.slice(5, 7)})` : ''}:
      {f.itRate != null ? ` מס הכנסה — לפחות ${f.itRate}% מהמחזור` : ''}
      {f.monthlyIncome ? ` · הכנסה צפויה ${f.monthlyIncome.toLocaleString('he-IL')} ₪ בחודש (נכנסת לטופס 6101)` : ''}
    </p>
  );
}
