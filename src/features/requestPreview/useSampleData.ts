// ─── טעינת הדוגמה — מטמון לפי הבקשה, כדי שמעבר בין מצבים לא יחכה פעמיים ───────────
import { useEffect, useRef, useState } from 'react';
import { loadRequestPreview, requestKey } from './api';
import type { PreviewData, PreviewRequest } from './types';

export type SampleState =
  | { phase: 'loading' }
  | { phase: 'ready'; data: PreviewData }
  | { phase: 'error'; message: string };

/**
 * ‼ תשובה שהגיעה אחרי שהבחירה כבר השתנתה — נזרקת (alive). בלי ניסיון חוזר אוטומטי: כשל מציג «נסו שוב».
 * המטמון חי כל עוד המגירה פתוחה, ואינו נשמר בין פתיחות — כך שינוי בנוסח שנשמר ייראה בפתיחה הבאה.
 */
export function useSampleData(request: PreviewRequest): { state: SampleState; retry: () => void } {
  const key = requestKey(request);
  const cache = useRef(new Map<string, PreviewData>());
  const requestRef = useRef(request);
  requestRef.current = request;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SampleState>(() => {
    const hit = cache.current.get(key);
    return hit ? { phase: 'ready', data: hit } : { phase: 'loading' };
  });

  useEffect(() => {
    const hit = cache.current.get(key);
    if (hit) { setState({ phase: 'ready', data: hit }); return; }
    let alive = true;
    setState({ phase: 'loading' });
    void loadRequestPreview(requestRef.current).then(r => {
      if (!alive) return;
      if (r.ok) { cache.current.set(key, r.data); setState({ phase: 'ready', data: r.data }); }
      else setState({ phase: 'error', message: r.message });
    });
    return () => { alive = false; };
  }, [key, attempt]);

  return { state, retry: () => setAttempt(a => a + 1) };
}
