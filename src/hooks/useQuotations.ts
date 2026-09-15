import { useCallback, useEffect, useState } from 'react';
import type { Quotation, QuotationEvent, QuotationEventType, QuotationStatus } from '../types/quotations';
import { QUOTATION_STATUS_LABELS } from '../types/quotations';
import { supabase } from '../lib/supabase';
import { quotationFromDb, quotationToDb } from '../lib/dbMappers';
import { keepIfSame } from './useLivePulse';

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
      // ‼ סימון תוקף קורה בשרת בלבד (expire_stale_quotations, 166): ה-WHERE שם
      // נוגע רק בהצעות sent/viewed שעבר מועדן, ולכן אינו יכול לדרוס אישור
      // שהלקוח נתן בין הטעינה לכתיבה — מה שהכתיבה הישנה מהדפדפן, מתוך צילום
      // ישן של השורה, כן יכלה לעשות (C3). כישלון כאן אינו חוסם: התצוגה
      // גוזרת «פג תוקף» בעצמה (deriveQuotationStatus ב-dbMappers).
      const { error: expireErr } = await supabase.rpc('expire_stale_quotations');
      if (expireErr) console.warn('[quotations] expire_stale_quotations:', expireErr.message);
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
    // ‼ פעימה שלא שינתה דבר לא מחליפה את המערך — ראה keepIfSame.
    const next = (data ?? []).map(quotationFromDb);
    setQuotations(prev => keepIfSame(prev, next));
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
    // «פג תוקף» שנגזר לתצוגה (בלי אירוע expired בשורה) אינו נכתב מהדפדפן —
    // אחרת שמירת תזכורת/עריכה הייתה מהדהדת אותו על אישור שהגיע בינתיים.
    if (q.status === 'expired' && !q.events.some(e => e.type === 'expired')) delete row.status;
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
  // ‼ 171: הביטול נעשה בשרת, על המצב האמיתי של השורה — לא על העותק שבמסך.
  // הצעה שכבר אושרה אינה ניתנת לביטול (זו סיום התקשרות); השרת מחזיר את
  // המצב העדכני, והמסך מתעדכן אליו במקום לדרוס אישור חתום.
  async function cancelQuotation(q: Quotation, note?: string): Promise<Quotation> {
    const { data, error } = await supabase.rpc('cancel_quotation', { p_quotation_id: q.id, p_note: note ?? null });
    if (error) throw error;
    const res = data as { ok: boolean; error?: string; status?: string; quotation?: Record<string, unknown> };
    if (!res.ok) {
      await refreshQuotations();
      const label = res.status ? (QUOTATION_STATUS_LABELS[res.status as QuotationStatus] ?? res.status) : '';
      throw new Error(res.error === 'not_cancellable' ? `ההצעה כבר במצב «${label}» ואינה ניתנת לביטול` : 'ביטול ההצעה נכשל');
    }
    const updated = quotationFromDb(res.quotation as Record<string, unknown>);
    setQuotations(prev => prev.map(x => x.id === updated.id ? updated : x));
    return updated;
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
