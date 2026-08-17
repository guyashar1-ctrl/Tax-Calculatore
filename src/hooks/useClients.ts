import { useCallback, useEffect, useState } from 'react';
import type { Client, LifecycleStage } from '../types';
import { supabase } from '../lib/supabase';
import { clientFromDb, clientToDb } from '../lib/dbMappers';
import { SAMPLE_CLIENTS } from '../data/sampleClients';
import { enrichClientsWithWorkspace } from '../data/sampleClientWorkspace';

// DEV-only local brand-QA seed (see DEV_BYPASS_AUTHZ in useAuth). Compiled out of prod builds.
// ‼ ?real-clients מכבה רק את ההזרקה ומשאיר את מעקף ההרשאה: בלי זה אי אפשר
// לבדוק מקומית זרימה שכותבת למסד, כי לקוחות הדמה אינם שייכים לחשבון ולכן כל
// קריאה לשרת עליהם חוזרת כ"אין הרשאה".
const DEV_SEED = import.meta.env.DEV
  && import.meta.env.VITE_DEV_BYPASS_AUTHZ === 'true'
  && !(typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('real-clients'));
const DEV_CLIENTS = DEV_SEED ? enrichClientsWithWorkspace(SAMPLE_CLIENTS) : [];

export function useClients(userId: string | undefined) {
  const [clients, setClients] = useState<Client[]>(DEV_CLIENTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (DEV_SEED) { setClients(DEV_CLIENTS); setLoading(false); return; }
    if (!userId) {
      setClients([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setClients((data ?? []).map(clientFromDb));
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  /**
   * ‼ lifecycle_stage נגזר בשרת (טריגר על quotations/engagements), ולכן שליחת
   * הצעה משנה את שלב הכרטיס בלי שהדפדפן כתב אליו כלום. בלי המשיכה הזו הכרטיס
   * נשאר על הערך שנטען בכניסה למערכת — וכך דף המסע הציג "לבנות הצעת מחיר"
   * דקות אחרי שההצעה כבר נשלחה, עד שהמשתמש רענן את הדף.
   * משמשת גם כשהכרטיס נולד בשרת (ensure_client_for_quotation) ועדיין אינו
   * ברשימה המקומית — ולכן מוסיפה ולא רק מחליפה.
   */
  async function refreshClient(id: string): Promise<Client | null> {
    if (DEV_SEED) return null;
    const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
    if (error || !data) return null;
    const fresh = clientFromDb(data);
    setClients(prev => prev.some(c => c.id === fresh.id)
      ? prev.map(c => c.id === fresh.id ? fresh : c)
      : [...prev, fresh]);
    return fresh;
  }

  /** משיכה שקטה של כל הרשימה — בלי מצב טעינה, לשימוש הפעימה החיה. */
  const refreshClients = useCallback(async () => {
    if (DEV_SEED || !userId) return;
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) return;
    setClients((data ?? []).map(clientFromDb));
  }, [userId]);

  async function addClient(client: Client): Promise<Client> {
    if (!userId) throw new Error('Not signed in');
    const row = clientToDb(client, userId);
    const { data, error } = await supabase.from('clients').insert(row).select().single();
    if (error) {
      console.error('addClient failed:', error, 'row sent:', row);
      throw error;
    }
    const inserted = clientFromDb(data);
    setClients(prev => [...prev, inserted]);
    return inserted;
  }

  async function updateClient(client: Client): Promise<Client> {
    const row = clientToDb(client);
    delete row.id;
    delete row.user_id;
    delete row.created_at;
    const { data, error } = await supabase
      .from('clients')
      .update(row)
      .eq('id', client.id)
      .select()
      .single();
    if (error) throw error;
    const updated = clientFromDb(data);
    setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
    return updated;
  }

  /**
   * העברה לארכיון והחזרה ממנו — הכתיבה היחידה של lifecycle_stage מהדפדפן.
   * כותבת את העמודה הזו בלבד, ולכן אינה יכולה לדרוס שדה אחר בכרטיס.
   * החזרה מארכיון נכתבת כ-'active'; ריצת refresh_lifecycle_stages היומית
   * תדייק אותה לשלב האמיתי (למשל 'onboarding') אם צריך.
   */
  async function setClientLifecycleStage(id: string, stage: LifecycleStage): Promise<void> {
    const { data, error } = await supabase
      .from('clients')
      .update({ lifecycle_stage: stage })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    const updated = clientFromDb(data);
    setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
  }

  /**
   * מציב לקוח שכבר נכתב בשרת (למשל דרך RPC טרנזקציוני כמו
   * accept_tax_fact_change/record_manual_fact_change) בקאש המקומי, בלי
   * כתיבה נוספת. מיועד לכיווץ סטייל אחרי כתיבה שקרתה מחוץ ל-updateClient.
   */
  function applyClientLocally(client: Client): void {
    setClients(prev => prev.map(c => c.id === client.id ? client : c));
  }

  async function deleteClient(id: string): Promise<void> {
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) throw error;
    setClients(prev => prev.filter(c => c.id !== id));
  }

  async function bulkAddClients(toAdd: Client[]): Promise<Client[]> {
    if (!userId) throw new Error('Not signed in');
    if (toAdd.length === 0) return [];
    const rows = toAdd.map(c => clientToDb(c, userId));
    const { data, error } = await supabase.from('clients').insert(rows).select();
    if (error) throw error;
    const inserted = (data ?? []).map(clientFromDb);
    setClients(prev => [...prev, ...inserted]);
    return inserted;
  }

  return {
    clients, loading, error, addClient, updateClient, deleteClient, bulkAddClients,
    setClientLifecycleStage, applyClientLocally, refreshClient, refreshClients,
  };
}
