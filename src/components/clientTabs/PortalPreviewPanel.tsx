// ─── פאנל תצוגה מוטבע — "מה הלקוח רואה עכשיו" ────────────────────────────────
// ‼ אזור צד קבוע במסך "תהליך" המאוחד, לא דיאלוג: הפרוטוטייפ המאושר מראה את
// זה תמיד, לא רק בלחיצה. ברירת המחדל היא "live" — המצב האמיתי שהלקוח רואה
// עכשיו, בלי שום דבר תיאורטי. "אחרי העדכון" (preview) הוא מתג נפרד, לא שני
// דברים על המסך בו-זמנית: usePortalPreview כבר משותף עם הדיאלוג
// (ClientPagePreviewDialog.tsx), אז אין שכפול לוגיקה — רק עטיפה אחרת.

import { usePortalPreview, type PortalPreviewMode } from './ClientPagePreviewDialog';
import { PortalView } from '../PublicPortalPage';

export default function PortalPreviewPanel({ clientId, mode, onModeChange }: {
  clientId: string;
  mode: PortalPreviewMode;
  onModeChange: (m: PortalPreviewMode) => void;
}) {
  const { data, error, loading } = usePortalPreview(clientId, mode);

  const draftCount = mode === 'preview' ? (data?.items ?? []).filter(i => i.draft).length : 0;
  const removingCount = mode === 'preview' ? (data?.items ?? []).filter(i => i.removing).length : 0;

  const pill = (active: boolean): React.CSSProperties => ({
    font: 'inherit', fontSize: 'var(--fs-12)', fontWeight: 600, cursor: 'pointer',
    padding: '.2rem .6rem', borderRadius: 999,
    border: `1px solid ${active ? 'var(--accent)' : 'var(--bd)'}`,
    color: active ? '#fff' : 'var(--ink-2)',
    background: active ? 'var(--accent)' : 'transparent',
  });

  return (
    <div className="cw-section" style={{ position: 'sticky', top: '1rem' }}>
      <div className="cw-section-head">
        <span>מה הלקוח רואה {mode === 'live' ? 'עכשיו' : 'אחרי העדכון'}</span>
      </div>
      <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginBottom: '.5rem' }}>
        <button type="button" style={pill(mode === 'live')} aria-pressed={mode === 'live'}
          onClick={() => onModeChange('live')}>
          חי · עכשיו
        </button>
        <button type="button" style={pill(mode === 'preview')} aria-pressed={mode === 'preview'}
          onClick={() => onModeChange('preview')}>
          אחרי עדכון
        </button>
      </div>
      <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginBottom: '.5rem' }}>
        {mode === 'live'
          ? 'זה הדף האמיתי — לא תצוגה תיאורטית.'
          : (draftCount || removingCount)
            ? [
                draftCount > 0 ? `${draftCount} יתווספו` : null,
                removingCount > 0 ? `${removingCount} יוסרו` : null,
              ].filter(Boolean).join(' · ') + ' — אחרי "עדכן את דף הלקוח"'
            : 'אין שינויים ממתינים — זהה למה שהלקוח כבר רואה.'}
      </div>
      <div className="pivo-light" style={{
        border: '1px solid var(--bd)', borderRadius: 'var(--r-panel, .7rem)',
        maxHeight: '70vh', overflowY: 'auto',
      }}>
        {loading && (
          <div style={{ padding: '1.6rem', textAlign: 'center', color: 'var(--ink-3)' }}>טוען…</div>
        )}
        {!loading && error && (
          <div role="alert" style={{ padding: '1.6rem', textAlign: 'center', color: 'var(--err)' }}>⚠ {error}</div>
        )}
        {!loading && !error && data && (
          <PortalView data={data} preview={mode === 'preview'} embed />
        )}
      </div>
    </div>
  );
}
