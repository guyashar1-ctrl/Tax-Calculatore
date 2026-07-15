import { useEffect, useState } from 'react';
import type { Quotation, QuotationEvent, QuotationEventType } from '../types/quotations';
import { supabase } from '../lib/supabase';
import { quotationFromDb, quotationToDb } from '../lib/dbMappers';

export function useQuotations(userId: string | undefined) {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setQuotations([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('quotations')
        .select('*')
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setQuotations((data ?? []).map(quotationFromDb));
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // יצירת טיוטה. quotation_number לא נשלח — נקבע ב-DB מהמונה השנתי (2026-001)
  async function addQuotation(q: Omit<Quotation, 'id' | 'quotationNumber'>): Promise<Quotation> {
    if (!userId) throw new Error('Not signed in');
    const withCreatedEvent: Partial<Quotation> = {
      ...q,
      events: [...(q.events ?? []), event('created')],
    };
    const row = quotationToDb(withCreatedEvent, userId, true);
    const { data, error } = await supabase.from('quotations').insert(row).select().single();
    if (error) throw error;
    const inserted = quotationFromDb(data);
    setQuotations(prev => [inserted, ...prev]);
    return inserted;
  }

  async function updateQuotation(q: Quotation): Promise<Quotation> {
    const row = quotationToDb(q);
    delete row.id;
    delete row.user_id;
    delete row.created_at;
    const { data, error } = await supabase
      .from('quotations')
      .update(row)
      .eq('id', q.id)
      .select()
      .single();
    if (error) throw error;
    const updated = quotationFromDb(data);
    setQuotations(prev => prev.map(x => x.id === updated.id ? updated : x));
    return updated;
  }

  // ביטול — הדרך היחידה "לשנות" הצעה שנשלחה: מבטלים ומוציאים חדשה
  async function cancelQuotation(q: Quotation, note?: string): Promise<Quotation> {
    return updateQuotation({
      ...q,
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      events: [...q.events, event('cancelled', note)],
    });
  }

  // מחיקה מותרת רק לטיוטות — הצעה שנשלחה נשארת בהיסטוריה (מבטלים במקום)
  async function deleteDraft(q: Quotation): Promise<void> {
    if (q.status !== 'draft') throw new Error('רק טיוטה ניתנת למחיקה — הצעה שנשלחה מבטלים');
    const { error } = await supabase.from('quotations').delete().eq('id', q.id);
    if (error) throw error;
    setQuotations(prev => prev.filter(x => x.id !== q.id));
  }

  return { quotations, loading, error, addQuotation, updateQuotation, cancelQuotation, deleteDraft };
}

function event(type: QuotationEventType, note?: string): QuotationEvent {
  return { type, at: new Date().toISOString(), ...(note ? { note } : {}) };
}
