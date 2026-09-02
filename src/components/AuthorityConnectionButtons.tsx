// ─── נוריות החיבור לרשויות — בכותרת, ליד "לקוחות"/"משימות" ──────────────────
// פקד מוצר, לא דיאגנוסטיקה. אפור = לא מחובר · כתום = ממתין לך · ירוק = מחובר.
//
// ‼ לחיצה כשמנותקים מבקשת מהעובד המקומי לפתוח את חלון הרשות הייעודי. הרו"ח
// אינו אמור לפתוח קובץ .bat או טרמינל. האימות עצמו — אישור דיגיטלי ו-PIN
// בשע״ם, קוד משתמש וקוד חד-פעמי בביטוח לאומי — נעשה על ידו בחלון שנפתח.
// האוטומציה לעולם לא נוגעת בהם.
//
// ‼ שתי רשויות, שני חלונות, שתי נוריות עצמאיות. התנתקות מאחת אינה נוגעת
// בשנייה.
//
// ‼ "מחשב האוטומציה כבוי" מוצג במפורש ולא כהיעלמות של הכפתור: כפתור שנעלם
// לא מסביר למה, וזה בדיוק המצב שבו צריך הסבר.

import { useAuthorityConnections } from '../hooks/useAuthorityConnections';
import type { AuthorityPhase, BtlPhase } from '../hooks/useAuthorityConnections';

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

// ‼ שכבת אימות אחת בלבד, ולכן אין כאן "שלב 2 מתוך 4": או שהחלון ממתין
// להזנה שלך, או שהמערכת פתוחה.
const BTL_PHASE_CLASS: Record<BtlPhase, string> = {
  worker_offline: 'is-off',
  btl_disconnected: '',
  opening: 'is-pending',
  awaiting_btl_auth: 'is-pending',
  ready: 'is-on',
};

const BTL_PHASE_TITLE: Record<BtlPhase, string> = {
  worker_offline:
    'מחשב האוטומציה אינו פעיל. יש להפעיל את העובד המקומי במחשב המשרד כדי להתחבר לביטוח לאומי.',
  btl_disconnected: 'לא מחובר לביטוח לאומי · לחצו כדי לפתוח את מערכת ייצוג לקוחות',
  opening: 'פותח את חלון ביטוח לאומי…',
  awaiting_btl_auth: 'החלון פתוח וממתין לך — יש להזין קוד משתמש ואת הקוד החד-פעמי לנייד',
  ready: 'ביטוח לאומי מחובר · לחצו כדי להתנתק',
};

export default function AuthorityConnectionButtons({ userId }: Props) {
  const { shaam, btl, connect, disconnect, connectBtl, disconnectBtl } =
    useAuthorityConnections(userId);
  const { phase } = shaam;
  const btlPhase = btl.phase;

  // ‼ גם במצבי ההמתנה הכפתור לחיץ: הוא מריץ מחדש את זרימת החיבור ומחזיר את
  // החלון לנקודה הנכונה, למקרה שהרו"ח סגר אותו או איבד אותו מאחורי חלונות.
  const clickable = phase !== 'worker_offline' && phase !== 'opening';
  const btlClickable = btlPhase !== 'worker_offline' && btlPhase !== 'opening';

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

      <button
        type="button"
        className={`authconn-btn ${BTL_PHASE_CLASS[btlPhase]}`}
        disabled={btl.busy || !btlClickable}
        title={btl.message ? `${BTL_PHASE_TITLE[btlPhase]} — ${btl.message}` : BTL_PHASE_TITLE[btlPhase]}
        aria-label={BTL_PHASE_TITLE[btlPhase]}
        onClick={() => { void (btlPhase === 'ready' ? disconnectBtl() : connectBtl()); }}
      >
        <span className="authconn-dot" aria-hidden="true" />
        <span>ביטוח לאומי</span>
      </button>

      {/* ‼ הודעת "מה לעשות עכשיו" מוצגת בכותרת ולא רק ב-tooltip: הרו"ח לא
          ינחש שצריך לרחף מעל כפתור אפור כדי לגלות שהמחשב כבוי.
          ‼ הודעה אחת בלבד — של הרשות שממתינה לפעולה. שתי הודעות זו לצד זו
          בכותרת הצרה היו דוחקות את הניווט. */}
      {(() => {
        const note =
          shaam.message
          ?? (phase === 'awaiting_shaam_auth' || phase === 'awaiting_gmf_auth'
            || phase === 'awaiting_vat_auth' || phase === 'awaiting_nikui_auth'
            || phase === 'worker_offline' ? PHASE_TITLE[phase] : null)
          ?? btl.message
          ?? (btlPhase === 'awaiting_btl_auth' ? BTL_PHASE_TITLE[btlPhase] : null);
        return note ? <span className="authconn-note">{note}</span> : null;
      })()}
    </div>
  );
}
