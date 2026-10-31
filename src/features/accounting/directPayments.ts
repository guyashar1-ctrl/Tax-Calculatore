import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

/**
 * «שולם» ידני לחודש ריטיינר (317) — ללקוח בלי אשראי בפייפרלס, שמשלם ישירות.
 * ‼ הסימון של הרו״ח הוא הראיה היחידה; חודש מסומן נספר «נגבה» ולא עובר להגשת הדוח.
 */
export interface DirectPayment { clientId: string; month: string; amount: number | null; paidAt: string }

export function useDirectPayments() {
  const [rows, setRows] = useState<DirectPayment[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('retainer_direct_payments').select('client_id,month,amount,paid_at');
    if (error) { setUnavailable(true); return; }
    setUnavailable(false);
    setRows((data ?? []).map(r => ({ clientId: String(r.client_id), month: String(r.month), amount: r.amount == null ? null : Number(r.amount), paidAt: String(r.paid_at) })));
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** מחזיר false כשהשמירה נכשלה — המסך לא מציג «שולם» בלי שורה. */
  const mark = useCallback(async (clientId: string, month: string, amount: number | null) => {
    setBusy(month);
    try {
      // ‼ upsert על (לקוח, חודש) — לחיצה כפולה לא יוצרת שורה שנייה
      const { error } = await supabase.from('retainer_direct_payments')
        .upsert({ client_id: clientId, month, amount }, { onConflict: 'client_id,month', ignoreDuplicates: true });
      await load();
      return !error;
    } finally { setBusy(null); }
  }, [load]);

  const unmark = useCallback(async (clientId: string, month: string) => {
    setBusy(month);
    try {
      const { error } = await supabase.from('retainer_direct_payments').delete().eq('client_id', clientId).eq('month', month);
      await load();
      return !error;
    } finally { setBusy(null); }
  }, [load]);

  return { rows, unavailable, busy, mark, unmark };
}
