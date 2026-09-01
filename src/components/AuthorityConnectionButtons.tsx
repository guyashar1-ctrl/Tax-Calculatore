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

// ‼ אפור = מנותק · כתום = בהכנה/דרושה פעולה שלך · ירוק = **הסביבה מוכנה
// לאוטומציה**, כלומר כל ארבע השכבות מוכנות: פורטל שע״ם, מערכת גביית מס
// הכנסה, מע״מ ומגן. במסלול הרגיל אישור דיגיטלי ו-PIN מספיקים לכולן.
const PHASE_CLASS: Record<AuthorityPhase, string> = {
  worker_offline: 'is-off',
  shaam_disconnected: '',
  opening: 'is-pending',
  awaiting_shaam_auth: 'is-pending',
  awaiting_gmf_auth: 'is-pending',
  awaiting_vat_auth: 'is-pending',
  awaiting_nikui_auth: 'is-pending',
  ready: 'is-on',
};

const PHASE_TITLE: Record<AuthorityPhase, string> = {
  worker_offline:
    'מחשב האוטומציה אינו פעיל. יש להפעיל את העובד המקומי במחשב המשרד כדי להתחבר לשע״ם.',
  shaam_disconnected: 'לא מחובר לשע״ם · לחצו כדי לפתוח את חלון ההתחברות',
  opening: 'מכין את החיבור לשע״ם…',
  awaiting_shaam_auth: 'שלב 1 מתוך 4 — יש להשלים אישור דיגיטלי ו-PIN בחלון שע״ם',
  awaiting_gmf_auth: 'שלב 2 מתוך 4 — מערכת גביית מס הכנסה עדיין לא מוכנה',
  awaiting_vat_auth: 'שלב 3 מתוך 4 — מע״מ עדיין לא מוכנה',
  awaiting_nikui_auth: 'שלב 4 מתוך 4 — מגן (ניכויים) עדיין לא מוכנה',
  ready: 'שע״ם מוכן לאוטומציה · לחצו כדי להתנתק',
};

export default function AuthorityConnectionButtons({ userId }: Props) {
  const { shaam, connect, disconnect } = useAuthorityConnections(userId);
  const { phase } = shaam;

  // ‼ גם במצבי ההמתנה הכפתור לחיץ: הוא מריץ מחדש את זרימת החיבור ומחזיר את
  // החלון לנקודה הנכונה, למקרה שהרו"ח סגר אותו או איבד אותו מאחורי חלונות.
  const clickable = phase !== 'worker_offline' && phase !== 'opening';

  return (
    <div className="authconn">
      <button
        type="button"
        className={`authconn-btn ${PHASE_CLASS[phase]}`}
        disabled={shaam.busy || !clickable}
        title={shaam.message ? `${PHASE_TITLE[phase]} — ${shaam.message}` : PHASE_TITLE[phase]}
        aria-label={PHASE_TITLE[phase]}
        onClick={() => { void (phase === 'ready' ? disconnect() : connect()); }}
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
      {(phase === 'awaiting_shaam_auth' || phase === 'awaiting_gmf_auth'
        || phase === 'awaiting_vat_auth' || phase === 'awaiting_nikui_auth'
        || phase === 'worker_offline' || shaam.message) && (
        <span className="authconn-note">
          {shaam.message ?? PHASE_TITLE[phase]}
        </span>
      )}
    </div>
  );
}
