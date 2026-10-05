// ─── «מה הלקוח רואה» בעורך הבקשה — הכרטיס האמיתי של הדף האישי, על הטיוטה ──────────────
// ‼ לא חיקוי: אותו PortalView שהלקוח רואה, במצב «דוגמה» (כל פעולה בו מקומית — לא נשלח ולא נשמר דבר),
// על מה שהשרת מצייר (preview_request_sample — STABLE, אסור בה כתיבה) מ-payload הטיוטה של הטופס.
// ‼ כל שינוי בטופס נשלח אחרי 400ms של שקט. בזמן הטעינה הכרטיס הקודם נשאר מעומעם — לא שלד מהבהב בכל הקלדה.
// ‼ כשל בטעינה אומר «לא הצלחתי לטעון את התצוגה» עם «נסו שוב» — לעולם לא תיבה ריקה.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { PortalView } from '../../../PublicPortalPage';
import { specProblemText } from '../../../../features/requestPreview/api';
import { useSampleData } from '../../../../features/requestPreview/useSampleData';
import type { PreviewData, PreviewRequest } from '../../../../features/requestPreview/types';
import '../../../../features/requestPreview/requestPreview.css';

export const LIVE_DEBOUNCE_MS = 400;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

const HEAD: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' };

export default function EditorLiveCard({ request, draft, onFull }: {
  request: PreviewRequest;
  /** הכרטיס מצויר מהטיוטה (בקשה חדשה, או שינויים שלא נשמרו) — ולא מהבקשה השמורה. */
  draft?: boolean;
  onFull: () => void;
}) {
  const debounced = useDebounced(request, LIVE_DEBOUNCE_MS);
  const { state, retry } = useSampleData(debounced);
  const last = useRef<PreviewData | null>(null);
  if (state.phase === 'ready') last.current = state.data;
  // ‼ קישור «המסך שנפתח» בכרטיס: בעורך אין מסך כזה בתוך הכרטיס — «תצוגה מלאה» היא המקום שבו רואים אותו.
  const onFullRef = useRef(onFull);
  onFullRef.current = onFull;
  const hooks = useMemo(() => ({ onOpenLinked: () => onFullRef.current() }), []);

  const data = state.phase === 'error' ? null : state.phase === 'ready' ? state.data : last.current;
  const pending = request !== debounced || state.phase === 'loading';
  const problems = (data?.specs ?? []).map(specProblemText).filter((x): x is string => !!x);

  const body = (() => {
    if (state.phase === 'error') {
      return (
        <div className="rp-problem" role="alert" data-testid="lb-live-error">
          <p>{state.message}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={retry}>נסו שוב</button>
        </div>
      );
    }
    if (!data) return <div className="rp-skel" aria-busy="true" data-testid="lb-live-loading"><span /><span /></div>;
    if (data.items.length === 0) {
      return <div className="rp-problem" data-testid="lb-live-nothing"><p>{problems[0] ?? 'הלקוח לא רואה את הבקשה הזאת בדף.'}</p></div>;
    }
    return (
      <>
        {problems.map(p => <p key={p} className="rp-hint rp-warn">{p}</p>)}
        <div className="rp-page pivo-light" data-testid="lb-live-card"
          style={{ opacity: pending ? 0.55 : 1, transition: 'opacity .15s ease' }}>
          <PortalView data={data} mode="sample" embed sampleHooks={hooks} />
        </div>
      </>
    );
  })();

  return (
    <div className="lb-live" data-testid="lb-live" style={{ display: 'grid', gap: 8, minWidth: 0 }}>
      <div style={HEAD}>
        <span className="rp-tags">
          <span className="rp-badge" data-testid="lb-live-badge">דוגמה — לא לקוח אמיתי</span>
          {draft && <span className="rp-badge is-draft" data-testid="lb-live-draft">טיוטה — לא נשמר</span>}
        </span>
        <button type="button" className="btn btn-ghost btn-sm rp-view" data-testid="lb-live-full" onClick={onFull}>תצוגה מלאה</button>
      </div>
      {body}
    </div>
  );
}
