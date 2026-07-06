// ─── טעינת תיקי השנה של לקוח לתצוגה בכרטיס ──────────────────────────────────

import { useEffect, useState } from 'react';
import type { AnnualReportSession } from './types';
import { listSessionsForClient } from './repository';

export function useClientTaxSessions(clientId: string | undefined) {
  const [sessions, setSessions] = useState<AnnualReportSession[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clientId) { setSessions([]); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const list = await listSessionsForClient(clientId);
        if (!cancelled) setSessions(list);
      } catch {
        if (!cancelled) setSessions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  return { sessions, loading };
}
