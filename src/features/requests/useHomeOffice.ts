// ─── ההיסטוריה של עבודה מהבית ללקוח אחד (220) ───────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { loadHomeOffice } from './api';
import type { HomeOfficeHistory } from './homeOffice';

export interface HomeOfficeLoad {
  history: HomeOfficeHistory | null;
  loading: boolean;
  /** קריאה שנכשלה — לא «אין נתונים». */
  error: string | null;
  reload: () => void;
  /** אחרי פעולה שהחזירה את המצב המעודכן — בלי קריאה נוספת. */
  setHistory: (h: HomeOfficeHistory) => void;
}

export function useHomeOffice(clientId: string | undefined, refreshKey?: unknown): HomeOfficeLoad {
  const [history, setHistory] = useState<HomeOfficeHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    setLoading(true);
    void loadHomeOffice(clientId).then(r => {
      if (!alive) return;
      setLoading(false);
      if (r.ok) { setHistory({ answers: r.answers ?? [], approvals: r.approvals ?? [] }); setError(null); }
      else setError(r.message);
    });
    return () => { alive = false; };
  }, [clientId, refreshKey, tick]);
  const reload = useCallback(() => setTick(t => t + 1), []);
  return { history, loading, error, reload, setHistory };
}
