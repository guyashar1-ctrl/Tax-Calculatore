import { useEffect, useState } from 'react';
import type { RepresentationRequest } from '../types';
import { supabase } from '../lib/supabase';
import { repRequestFromDb, repRequestToDb } from '../lib/dbMappers';

export function useRepresentationRequests(userId: string | undefined) {
  const [requests, setRequests] = useState<RepresentationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setRequests([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('representation_requests')
        .select('*')
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setRequests((data ?? []).map(repRequestFromDb));
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  async function addRequest(req: RepresentationRequest): Promise<RepresentationRequest> {
    if (!userId) throw new Error('Not signed in');
    const row = repRequestToDb(req, userId);
    const { data, error } = await supabase
      .from('representation_requests')
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    const inserted = repRequestFromDb(data);
    setRequests(prev => [...prev, inserted]);
    return inserted;
  }

  async function updateRequest(req: RepresentationRequest): Promise<RepresentationRequest> {
    const row = repRequestToDb(req);
    delete row.id;
    delete row.user_id;
    delete row.created_at;
    const { data, error } = await supabase
      .from('representation_requests')
      .update(row)
      .eq('id', req.id)
      .select()
      .single();
    if (error) throw error;
    const updated = repRequestFromDb(data);
    setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
    return updated;
  }

  async function deleteRequest(id: string): Promise<void> {
    const { error } = await supabase.from('representation_requests').delete().eq('id', id);
    if (error) throw error;
    setRequests(prev => prev.filter(r => r.id !== id));
  }

  return { requests, loading, error, addRequest, updateRequest, deleteRequest };
}
