// ─── נוריות החיבור לרשויות — בכותרת, ליד "לקוחות"/"משימות" ──────────────────
// אפור = לא מחובר · ירוק = מחובר. לחיצה מחברת; כשמחוברים, לחיצה מציעה
// להתנתק.
//
// ‼ "התחברות" כאן פותחת את חלון הדפדפן הייעודי בלבד. בחירת האישור הדיגיטלי
// וה-PIN נעשים על ידי הרו"ח בחלון עצמו — האוטומציה לעולם לא נוגעת בהם.
//
// ‼ ביטוח לאומי מוצג בכוונה ללא פונקציונליות בשלב הזה (הכרעת גיא): רואים
// אותו בעיצוב, ומממשים בהמשך.

import { useAuthorityConnections } from '../hooks/useAuthorityConnections';

interface Props {
  userId: string | undefined;
}

export default function AuthorityConnectionButtons({ userId }: Props) {
  const { shaam, connectShaam, disconnectShaam } = useAuthorityConnections(userId);

  const shaamTitle = shaam.workerOffline
    ? 'מחשב האוטומציה אינו פעיל — הפעילו את העובד המקומי'
    : shaam.connected
      ? 'מחובר לשע״ם · לחצו כדי להתנתק'
      : 'לא מחובר לשע״ם · לחצו כדי לפתוח את חלון ההתחברות';

  return (
    <div className="authconn">
      <button
        type="button"
        className={`authconn-btn ${shaam.connected ? 'is-on' : ''}`}
        disabled={shaam.busy || shaam.workerOffline}
        title={shaamTitle}
        aria-label={shaamTitle}
        onClick={() => { void (shaam.connected ? disconnectShaam() : connectShaam()); }}
      >
        <span className="authconn-dot" aria-hidden="true" />
        <span>שע״ם</span>
      </button>

      {/* עדיין לא ממומש — מוצג כדי לראות את העיצוב במקומו. */}
      <button
        type="button"
        className="authconn-btn"
        disabled
        title="ביטוח לאומי — יחובר בהמשך"
        aria-label="ביטוח לאומי — יחובר בהמשך"
      >
        <span className="authconn-dot" aria-hidden="true" />
        <span>ביטוח לאומי</span>
      </button>

      {shaam.pendingMessage && <span className="authconn-note">{shaam.pendingMessage}</span>}
    </div>
  );
}
