// טעינת החובות שנקלטו (shaam_filing_list) — לכל המשרד או ללקוח אחד.
import { useCallback, useEffect, useState } from 'react';
import { listObligations } from './api';
import type { Obligation, SourceSummary } from './model';

export function useObligations(clientId?: string) {
  const [obligations, setObligations] = useState<Obligation[] | null>(null);
  const [sources, setSources] = useState<SourceSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await listObligations(clientId);
      if (!r?.ok) throw new Error('load_failed');
      setObligations(r.obligations ?? []);
      setSources(r.sources ?? []);
    } catch (e) { setErr((e as Error).message); }
  }, [clientId]);
  useEffect(() => { void load(); }, [load]);
  return { obligations, sources, err, load };
}
