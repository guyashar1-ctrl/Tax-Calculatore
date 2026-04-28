import { useEffect, useState } from 'react';
import type { Client } from '../types';
import { supabase } from '../lib/supabase';
import { clientFromDb, clientToDb } from '../lib/dbMappers';

export function useClients(userId: string | undefined) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

  return { clients, loading, error, addClient, updateClient, deleteClient, bulkAddClients };
}
