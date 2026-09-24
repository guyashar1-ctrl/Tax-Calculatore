// ─── כתובת שמצביעה על ישות שעדיין לא מוצגת — טוען / לא נמצא / שגיאה ─────────
// ‼ «לא נמצא» מוצג רק על תשובה שהסתיימה (lib/routeEntity). עד אז — «טוען»,
// ושגיאת רשת נאמרת כשגיאה ולא מתחפשת ל«לא נמצא».

import type { EntityResolution } from '../lib/routeEntity';

interface Props {
  state: Exclude<EntityResolution, 'found'>;
  /** למשל «הבקשה לא נמצאה». */
  notFoundTitle: string;
  onBack: () => void;
  onRetry?: () => void;
}

export default function RouteEntityFallback({ state, notFoundTitle, onBack, onRetry }: Props) {
  if (state === 'loading') {
    return <div className="empty-state" aria-busy="true"><div className="empty-state-title">טוען…</div></div>;
  }
  return (
    <div className="empty-state">
      <div className="empty-state-title">
        {state === 'error' ? 'הטעינה נכשלה - בדקו את החיבור לאינטרנט ונסו שוב' : notFoundTitle}
      </div>
      <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'center' }}>
        {state === 'error' && onRetry && (
          <button className="btn btn-primary" onClick={onRetry}>נסו שוב</button>
        )}
        <button className={`btn ${state === 'error' && onRetry ? 'btn-secondary' : 'btn-primary'}`} onClick={onBack}>חזרה לרשימה</button>
      </div>
    </div>
  );
}
