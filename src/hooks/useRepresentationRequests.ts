import { useCallback, useEffect, useRef, useState } from 'react';
import type { RepresentationRequest } from '../types';
import { supabase } from '../lib/supabase';
import { repRequestFromDb, repRequestToDb } from '../lib/dbMappers';
import {
  lookupOutcome, mergeListKeepingHydrated, resolveFetchedEntity, resolveListedEntity,
  type EntityResolution,
} from '../lib/routeEntity';

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
  /** התוצאה האחרונה של שליפת בקשה בודדת — «לא נמצאה» רק מכאן. */
  const [lookups, setLookups] = useState<Record<string, Exclude<EntityResolution, 'loading'>>>({});
  const listUserRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!userId) {
      setRequests([]);
      setLoading(false);
      return;
    }
    // ‼ משתמש אחר ⇒ כל מה שנשלף שייך לחשבון הקודם. אותו משתמש ⇒ שורות שכבר
    // נשלפו במלואן נשמרות (mergeListKeepingHydrated), גם אם הרשימה הגיעה אחריהן.
    if (listUserRef.current !== userId) {
      hydratedRef.current = new Set();
      setLookups({});
      listUserRef.current = userId;
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
      const list = (data ?? []).map(repRequestFromDb);
      setRequests(prev => mergeListKeepingHydrated(prev, list, hydratedRef.current));
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, lean]);

  /** השלמת בקשה אחת במלואה (כולל החתימות). במצב רגיל — כלום לעשות. */
  // ‼ תלויה ב-userId: ב-F5 המסך מבקש את הבקשה לפני שהזהות שוחזרה. שאילתה
  // כזאת רצה כאנונימי ו-RLS מחזיר «אין שורה» — לכן לא שולחים אותה בכלל, והפונקציה
  // מתחלפת (והקורא מריץ שוב) ברגע שהמשתמש מוכר.
  const hydrateRequest = useCallback(async (id: string): Promise<void> => {
    if (!lean || !userId || hydratedRef.current.has(id)) return;
    // ניסיון חוזר אחרי שגיאה חוזר ל«טוען» עד שתגיע תשובה חדשה.
    setLookups(prev => { if (!(id in prev)) return prev; const next = { ...prev }; delete next[id]; return next; });
    const res = await supabase
      .from('representation_requests').select('*').eq('id', id).maybeSingle();
    const outcome = lookupOutcome(res);
    setLookups(prev => ({ ...prev, [id]: outcome }));
    if (outcome !== 'found') return;
    const full = repRequestFromDb(res.data);
    hydratedRef.current.add(id);
    setRequests(prev => prev.some(r => r.id === id) ? prev.map(r => r.id === id ? full : r) : [...prev, full]);
    setHydratedTick(t => t + 1);
  }, [lean, userId]);

  const isHydrated = useCallback((id: string): boolean => !lean || hydratedRef.current.has(id), [lean]);

  /** מצב הבקשה שבכתובת — טוען / נמצאה / לא נמצאה / שגיאה (lib/routeEntity). */
  const requestResolution = (id: string): EntityResolution => {
    const present = requests.some(r => r.id === id);
    if (!lean) return resolveListedEntity({ signedIn: !!userId, listLoading: loading, listError: error, present });
    return resolveFetchedEntity({ signedIn: !!userId, ready: present && hydratedRef.current.has(id), lookup: lookups[id] });
  };

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

  /** קריאה מחדש של בקשה אחת אחרי שהשרת כתב עליה בעצמו (חתימת "נשלח" של
   *  מייל ההוראות ב-send-onboarding-email, או תנאי-קדם שמולאו דרך קישור
   *  משתתף) — אחרת העותק בדפדפן נשאר ישן. עובדת גם במצב lean: השורה
   *  המלאה שחוזרת מסומנת הודרתה, בדיוק כמו hydrateRequest.
   */
  const reloadRequest = useCallback(async (id: string): Promise<void> => {
    const { data, error } = await supabase.from('representation_requests').select('*').eq('id', id).maybeSingle();
    if (error || !data) return;
    const fresh = repRequestFromDb(data);
    hydratedRef.current.add(fresh.id);
    setLookups(prev => ({ ...prev, [fresh.id]: 'found' }));
    setRequests(prev => prev.some(r => r.id === fresh.id)
      ? prev.map(r => r.id === fresh.id ? fresh : r)
      : [...prev, fresh]);
    setHydratedTick(t => t + 1);
  }, []);

  return { requests, loading, error, addRequest, updateRequest, deleteRequest, hydrateRequest, isHydrated, reloadRequest, requestResolution };
}
