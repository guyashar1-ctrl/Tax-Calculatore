import { useCallback, useEffect, useRef, useState } from 'react';
import type { RepresentationRequest } from '../types';
import { supabase } from '../lib/supabase';
import { repRequestFromDb, repRequestToDb } from '../lib/dbMappers';

/**
 * ‼ signature_values מחזיקה את תמונות החתימות (base64). בייצור: 15 בקשות,
 * 3.16MB בעמודה הזו לעומת 29KB בכל שאר העמודות יחד — ובכל כניסה למערכת
 * הכול נטען, אף שרק מסך הבדיקה של בקשה אחת קורא אותה (RepresentationRequestReview).
 * במצב lean הרשימה נטענת בלעדיה, ו-hydrateRequest(id) משלים אותה לבקשה שנפתחה.
 * ‼ במצב lean אסור לרנדר את מסך הבדיקה לפני isHydrated(id): המסך ממזג את
 * החתימות הקיימות עם החדשות וכותב חזרה — בלי הידרציה הוא היה דורס אותן.
 */
const LEAN_COLUMNS = [
  'id', 'user_id', 'linked_client_id', 'client_name', 'client_email', 'authorities',
  'requested_docs', 'notes', 'status', 'submission', 'submitted_at', 'part_b',
  'signed_pdf_path', 'ocr_extracted', 'created_at', 'updated_at', 'onboarding_token',
  'onboarding_status', 'identification', 'onboarding_submitted_at', 'signers',
  'signature_setup', 'prefill', 'execution', 'scope', 'identity_docs',
  'signature_documents', 'spouse_onboarding_token',
].join(',');

export interface RepresentationRequestsOptions {
  /** לטעון את הרשימה בלי signature_values, ולהשלים לפי דרישה. ברירת מחדל: לא. */
  lean?: boolean;
}

export function useRepresentationRequests(userId: string | undefined, opts?: RepresentationRequestsOptions) {
  const lean = !!opts?.lean;
  const [requests, setRequests] = useState<RepresentationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** במצב lean: הבקשות שכבר הושלמו במלואן. במצב רגיל — כולן. */
  const hydratedRef = useRef<Set<string>>(new Set());
  const [, setHydratedTick] = useState(0);

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
        .select(lean ? LEAN_COLUMNS : '*')
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      hydratedRef.current = new Set();
      setRequests((data ?? []).map(repRequestFromDb));
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, lean]);

  /** השלמת בקשה אחת במלואה (כולל החתימות). במצב רגיל — כלום לעשות. */
  const hydrateRequest = useCallback(async (id: string): Promise<void> => {
    if (!lean || hydratedRef.current.has(id)) return;
    const { data, error } = await supabase
      .from('representation_requests').select('*').eq('id', id).maybeSingle();
    if (error || !data) return;
    const full = repRequestFromDb(data);
    hydratedRef.current.add(id);
    setRequests(prev => prev.some(r => r.id === id) ? prev.map(r => r.id === id ? full : r) : [...prev, full]);
    setHydratedTick(t => t + 1);
  }, [lean]);

  const isHydrated = useCallback((id: string): boolean => !lean || hydratedRef.current.has(id), [lean]);

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
    hydratedRef.current.add(inserted.id);   // insert().select() מחזיר שורה מלאה
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
    hydratedRef.current.add(updated.id);   // update().select() מחזיר שורה מלאה
    setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
    return updated;
  }

  async function deleteRequest(id: string): Promise<void> {
    const { error } = await supabase.from('representation_requests').delete().eq('id', id);
    if (error) throw error;
    hydratedRef.current.delete(id);
    setRequests(prev => prev.filter(r => r.id !== id));
  }

  return { requests, loading, error, addRequest, updateRequest, deleteRequest, hydrateRequest, isHydrated };
}
