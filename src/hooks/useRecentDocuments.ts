// ─── שלושת המסמכים האחרונים של לקוח — לתצוגה המהירה ─────────────────────────
// שאילתה קטנה וייעודית: DocumentManager טוען הכול, וכאן צריך רק תקציר.
// RLS מסנן לפי המשתמש; אין צורך ב-user_id מפורש (ראה useDocumentStore).

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface RecentDoc {
  id: string;
  fileName: string;
  uploadedAt: string;
}

export function useRecentDocuments(clientId?: string) {
  const [docs, setDocs] = useState<RecentDoc[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clientId) { setDocs([]); return; }
    let alive = true;
    setLoading(true);
    void supabase
      .from('documents')
      .select('id, file_name, uploaded_at')
      .eq('client_id', clientId)
      .order('uploaded_at', { ascending: false })
      .limit(3)
      .then(({ data, error }) => {
        if (!alive) return;
        setDocs(error ? [] : (data ?? []).map(r => ({
          id: String(r.id),
          fileName: String(r.file_name ?? ''),
          uploadedAt: String(r.uploaded_at ?? ''),
        })));
        setLoading(false);
      });
    return () => { alive = false; };
  }, [clientId]);

  return { docs, loading };
}
