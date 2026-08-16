import { useCallback, useEffect, useState } from 'react';
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
      const loaded = (data ?? []).map(quotationFromDb);
      setQuotations(loaded);
      setError(null);
      setLoading(false);

      // סימון אוטומטי של הצעות שפג תוקפן (נשלחו/נצפו אך עבר מועד התוקף)
      const now = Date.now();
      const stale = loaded.filter(q =>
        (q.status === 'sent' || q.status === 'viewed') &&
        q.expiresAt && new Date(q.expiresAt).getTime() < now);
      if (stale.length > 0) void expireStale(stale);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  /**
   * משיכה שקטה — בלי מצב טעינה, כדי שהמסך לא יהבהב בכל פעימה.
   * ‼ הצפייה והאישור של הלקוח קורים בדף שלו ונכתבים בשרת; ההצעה שבזיכרון
   * הרו"ח לא יודעת עליהם. זו הדרך שבה "נשלחה" הופך ל"אושרה" על המסך הפתוח.
   */
  const refreshQuotations = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('quotations')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return;
    setQuotations((data ?? []).map(quotationFromDb));
  }, [userId]);

  async function expireStale(stale: Quotation[]) {
    for (const q of stale) {
      try {
        const updated = quotationFromDb((await supabase
          .from('quotations')
          .update({
            status: 'expired',
            events: [...q.events, { type: 'expired', at: new Date().toISOString() }],
          })
          .eq('id', q.id).select().single()).data);
        setQuotations(prev => prev.map(x => x.id === updated.id ? updated : x));
      } catch { /* לא חוסם — סימון תוקף הוא נוחות תצוגה */ }
    }
  }

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

  // מחיקה סופית של הצעה. הדרך המומלצת להצעה שנשלחה היא ביטול (נשאר תיעוד),
  // אבל הרו"ח רשאי למחוק גם אותה — למשל הצעות בדיקה. הסכם ההתקשרות שנשמר
  // במסמכי הלקוח אינו נמחק יחד איתה; הוא מסמך של הלקוח.
  async function deleteQuotation(q: Quotation): Promise<void> {
    const { error } = await supabase.from('quotations').delete().eq('id', q.id);
    if (error) throw error;
    setQuotations(prev => prev.filter(x => x.id !== q.id));
  }

  return { quotations, loading, error, addQuotation, updateQuotation, cancelQuotation, deleteQuotation, refreshQuotations };
}

function event(type: QuotationEventType, note?: string): QuotationEvent {
  return { type, at: new Date().toISOString(), ...(note ? { note } : {}) };
}
