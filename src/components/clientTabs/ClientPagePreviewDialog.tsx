// ─── תצוגה מקדימה של הדף האישי — מהמקור, לא מחיקוי ──────────────────────────
// מרנדר את PortalView (אותו רכיב שהלקוח רואה) על נתונים מ-get_client_portal_preview:
// "אחרי פרסום" — כולל טיוטות מסומנות ובלי שער הפרסום; "עכשיו" — בדיוק מה
// שהלקוח רואה ברגע זה. הפעולות כבויות: הרו"ח מסתכל, לא פועל בשם הלקוח.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { PortalView, PortalData } from '../PublicPortalPage';

export type PortalPreviewMode = 'preview' | 'live';
type Mode = PortalPreviewMode;

const ERRORS: Record<string, string> = {
  client_not_found: 'הלקוח לא נמצא.',
  forbidden: 'אין הרשאה ללקוח הזה.',
};

/**
 * שליפת הדף האישי — משותפת לדיאלוג ולפאנל המוטבע במסך "תהליך". שני הצרכנים
 * מרנדרים את אותו PortalView בדיוק על אותם נתונים; ההבדל היחיד הוא העטיפה.
 *
 * ‼ refreshKey — הפאנל המוטבע קבוע על המסך לצד הבקשות, ולכן שליפה חד-פעמית
 * בכניסה ללשונית הפכה אותו לשקר: מוסיפים בקשה, והחלון שאמור להוכיח שהיא
 * הגיעה ללקוח ממשיך להראות את התמונה מלפני ההוספה. הצרכן מעביר חתימה של
 * מצב הבקשות, וכל שינוי בה שולף מחדש. הדיאלוג נפתח וסוגר, ולכן אינו צריך.
 */
export function usePortalPreview(clientId: string, mode: PortalPreviewMode, refreshKey?: string) {
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const { data: res, error: rpcError } = await supabase.rpc('get_client_portal_preview', {
        p_client_id: clientId, p_mode: mode,
      });
      if (cancelled) return;
      setLoading(false);
      const row = res as (PortalData & { ok?: boolean; error?: string }) | null;
      if (rpcError || !row?.ok) {
        setError(ERRORS[row?.error ?? ''] ?? 'לא הצלחתי לטעון את הדף.');
        return;
      }
      setData(row);
    })();
    return () => { cancelled = true; };
  }, [clientId, mode, refreshKey]);

  return { data, error, loading };
}

export default function ClientPagePreviewDialog({ clientId, clientName, onClose }: {
  clientId: string;
  clientName: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>('preview');
  const { data, error, loading } = usePortalPreview(clientId, mode);

  const draftCount = mode === 'preview'
    ? (data?.items ?? []).filter(i => i.draft).length
    : 0;

  const pill = (active: boolean): React.CSSProperties => ({
    font: 'inherit', fontSize: 'var(--fs-12)', fontWeight: 600, cursor: 'pointer',
    padding: '.25rem .7rem', borderRadius: 999,
    border: `1px solid ${active ? 'var(--accent)' : 'var(--bd)'}`,
    color: active ? '#fff' : 'var(--ink-2)',
    background: active ? 'var(--accent)' : 'transparent',
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 660, maxWidth: '96vw' }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3 style={{ margin: 0 }}>הדף האישי של {clientName}</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="סגירה">✕</button>
        </div>
        <div className="modal-body" style={{ padding: 0, display: 'grid', gap: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap',
            padding: '.6rem .9rem', borderBottom: '1px solid var(--bd)',
          }}>
            <button type="button" style={pill(mode === 'preview')} aria-pressed={mode === 'preview'}
              onClick={() => setMode('preview')}>אחרי פרסום</button>
            <button type="button" style={pill(mode === 'live')} aria-pressed={mode === 'live'}
              onClick={() => setMode('live')}>מה שהלקוח רואה עכשיו</button>
            <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
              {mode === 'preview'
                ? (draftCount > 0 ? `כולל ${draftCount} טיוטות שסומנו · הפעולות כבויות` : 'הפעולות כבויות בתצוגה')
                : 'המצב החי - בדיוק מה שנטען אצלו'}
            </span>
          </div>
          <div className="pivo-light" style={{ maxHeight: '68vh', overflowY: 'auto' }}>
            {loading && (
              <div style={{ padding: '2.2rem', textAlign: 'center', color: 'var(--ink-3)' }}>טוען…</div>
            )}
            {!loading && error && (
              <div role="alert" style={{ padding: '2.2rem', textAlign: 'center', color: 'var(--err)' }}>⚠ {error}</div>
            )}
            {!loading && !error && data && (
              <PortalView data={data} preview embed />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
