import { useEffect, useState } from 'react';
import type { AdditionalCharge } from '../types/charges';
import { supabase } from '../lib/supabase';
import { chargeFromDb, chargeToDb } from '../lib/dbMappers';

export function useCharges(userId: string | undefined) {
  const [charges, setCharges] = useState<AdditionalCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setCharges([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('additional_charges')
        .select('*')
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setCharges((data ?? []).map(chargeFromDb));
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  async function addCharge(clientId: string, description: string, amount: number): Promise<AdditionalCharge> {
    if (!userId) throw new Error('Not signed in');
    const row = chargeToDb({ clientId, description, amount, currency: 'ILS', status: 'pending' }, userId);
    const { data, error } = await supabase.from('additional_charges').insert(row).select().single();
    if (error) throw error;
    const inserted = chargeFromDb(data);
    setCharges(prev => [inserted, ...prev]);
    return inserted;
  }

  /** מסמן שהבקשה נשלחה. הפונקציה הזו לא שולחת מייל בעצמה — ראה requestChargePayment ב-App.tsx. */
  function replaceCharge(updated: AdditionalCharge) {
    setCharges(prev => prev.map(x => x.id === updated.id ? updated : x));
  }

  return { charges, loading, error, addCharge, replaceCharge };
}
