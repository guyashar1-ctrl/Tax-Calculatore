// ─── נוריות החיבור לרשויות — בכותרת, ליד "לקוחות"/"משימות" ──────────────────
// פקד מוצר, לא דיאגנוסטיקה. אפור = לא מחובר · כתום = ממתין לך · ירוק = מחובר.
//
// ‼ לחיצה כשמנותקים מבקשת מהעובד המקומי לפתוח את חלון שע״ם הייעודי. הרו"ח
// אינו אמור לפתוח קובץ .bat או טרמינל. בחירת האישור וה-PIN נעשים על ידו
// בחלון שנפתח — האוטומציה לעולם לא נוגעת בהם.
//
// ‼ "מחשב האוטומציה כבוי" מוצג במפורש ולא כהיעלמות של הכפתור: כפתור שנעלם
// לא מסביר למה, וזה בדיוק המצב שבו צריך הסבר.

import { useAuthorityConnections } from '../hooks/useAuthorityConnections';
import type { AuthorityPhase } from '../hooks/useAuthorityConnections';

interface Props {
  userId: string | undefined;
}

const PHASE_CLASS: Record<AuthorityPhase, string> = {
  worker_offline: 'is-off',
  disconnected: '',
  opening: 'is-pending',
  awaiting_auth: 'is-pending',
  connected: 'is-on',
};

const PHASE_TITLE: Record<AuthorityPhase, string> = {
  worker_offline:
    'מחשב האוטומציה אינו פעיל. יש להפעיל את העובד המקומי במחשב המשרד כדי להתחבר לשע״ם.',
  disconnected: 'לא מחובר לשע״ם · לחצו כדי לפתוח את חלון ההתחברות',
  opening: 'פותח את חלון שע״ם…',
  awaiting_auth: 'חלון שע״ם ממתין לך — יש להשלים אישור דיגיטלי ו-PIN בחלון',
  connected: 'מחובר לשע״ם · לחצו כדי להתנתק',
};

export default function AuthorityConnectionButtons({ userId }: Props) {
  const { shaam, connect, disconnect } = useAuthorityConnections(userId);
  const { phase } = shaam;

  const clickable = phase === 'disconnected' || phase === 'connected' || phase === 'awaiting_auth';

  return (
    <div className="authconn">
      <button
        type="button"
        className={`authconn-btn ${PHASE_CLASS[phase]}`}
        disabled={shaam.busy || !clickable}
        title={shaam.message ? `${PHASE_TITLE[phase]} — ${shaam.message}` : PHASE_TITLE[phase]}
        aria-label={PHASE_TITLE[phase]}
        onClick={() => { void (phase === 'connected' ? disconnect() : connect()); }}
      >
        <span className="authconn-dot" aria-hidden="true" />
        <span>שע״ם</span>
      </button>

      {/* עדיין לא ממומש — מוצג כדי שהמקום יהיה קיים ומובן. */}
      <button
        type="button"
        className="authconn-btn"
        disabled
        title="ביטוח לאומי — החיבור האוטומטי ייבנה בהמשך"
        aria-label="ביטוח לאומי — החיבור האוטומטי ייבנה בהמשך"
      >
        <span className="authconn-dot" aria-hidden="true" />
        <span>ביטוח לאומי</span>
      </button>

      {/* ‼ הודעת "מה לעשות עכשיו" מוצגת בכותרת ולא רק ב-tooltip: הרו"ח לא
          ינחש שצריך לרחף מעל כפתור אפור כדי לגלות שהמחשב כבוי. */}
      {(phase === 'awaiting_auth' || phase === 'worker_offline' || shaam.message) && (
        <span className="authconn-note">
          {shaam.message ?? PHASE_TITLE[phase]}
        </span>
      )}
    </div>
  );
}
