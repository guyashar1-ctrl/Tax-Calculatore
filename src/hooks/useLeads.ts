import { useEffect, useState } from 'react';
import type { Lead } from '../types/quotations';
import { supabase } from '../lib/supabase';
import { leadFromDb, leadToDb } from '../lib/dbMappers';

export function useLeads(userId: string | undefined) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLeads([]);
      setLoading(false);
      return;
    }
    let cancelled = false;

    async function fetchLeads(showLoading: boolean) {
      if (showLoading) setLoading(true);
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setLeads((data ?? []).map(leadFromDb));
      setError(null);
      setLoading(false);
    }

    fetchLeads(true);

    // ‼ הגשה עצמית מהקישור הציבורי (שלב 4) יכולה להגיע בזמן שהטאב ברקע —
    // בלי realtime, רענון קטן בחזרה לטאב הוא הדרך היחידה לגלות אותה בזמן סביר.
    function onVisible() {
      if (document.visibilityState === 'visible') fetchLeads(false);
    }
    document.addEventListener('visibilitychange', onVisible);

    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible); };
  }, [userId]);

  async function addLead(lead: Omit<Lead, 'id'>): Promise<Lead> {
    if (!userId) throw new Error('Not signed in');
    const row = leadToDb(lead as Partial<Lead>, userId);
    const { data, error } = await supabase.from('leads').insert(row).select().single();
    if (error) throw error;
    const inserted = leadFromDb(data);
    setLeads(prev => [inserted, ...prev]);
    return inserted;
  }

  /**
   * עדכון חלקי — נכתבות רק העמודות שנמסרו. מסך שמחזיר את הליד המלא מסכן
   * את עצמו: עותק מיושן בדפדפן (למשל converted_client_id של לקוח שנמחק)
   * נשלח בחזרה ומפיל את השמירה על מפתח זר, גם כשהמשתמש רק תיקן טלפון.
   */
  async function updateLead(lead: Partial<Lead> & { id: string }): Promise<Lead> {
    const row = leadToDb(lead);
    delete row.id;
    delete row.user_id;
    delete row.created_at;
    const { data, error } = await supabase
      .from('leads')
      .update(row)
      .eq('id', lead.id)
      .select()
      .single();
    if (error) throw error;
    const updated = leadFromDb(data);
    setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
    return updated;
  }

  async function deleteLead(id: string): Promise<void> {
    const { error } = await supabase.from('leads').delete().eq('id', id);
    if (error) throw error;
    setLeads(prev => prev.filter(l => l.id !== id));
  }

  return { leads, loading, error, addLead, updateLead, deleteLead };
}
