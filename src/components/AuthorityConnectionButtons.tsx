// ─── נוריות החיבור לרשויות — בכותרת, ליד "לקוחות"/"משימות" ──────────────────
// פקד מוצר, לא דיאגנוסטיקה. אפור = לא מחובר עכשיו · כתום = PIVO עצרה
// וממתינה לך, בחלון שאתה פתחת בלחיצה · ירוק = מחובר. ראה
// docs/SPEC-HEADER-CONNECTION-CONTROLS.md למפרט המלא.
//
// ‼ אין מצב חזותי רביעי. "מתחבר", "מחשב האוטומציה כבוי" ו"נכשל" הם כולם
// אפור — נבדלים בטקסט הרחיפה ובתוכן הפופאובר בלבד, לא בצבע. הבחנה חזותית
// בין "אפור נח" ל"אפור כבוי" נשקלה ונדחתה בכוונה: היא הייתה מלמדת שפה
// חזותית נוספת בשלב הזה, כשההסבר בלחיצה מספיק.
//
// ‼ לחיצה כשמנותקים מבקשת מהעובד המקומי לפתוח את חלון הרשות הייעודי. הרו"ח
// אינו אמור לפתוח קובץ .bat או טרמינל. האימות עצמו — אישור דיגיטלי ו-PIN
// בשע״ם, קוד משתמש וקוד חד-פעמי בביטוח לאומי — נעשה על ידו בחלון שנפתח.
// האוטומציה לעולם לא נוגעת בהם.
//
// ‼ שתי רשויות, שני חלונות, שתי נוריות עצמאיות. התנתקות מאחת אינה נוגעת
// בשנייה.
//
// ‼ אין טקסט קבוע ליד הכפתורים. ההסבר הנחוץ מופיע רק כשיש משהו לעשות
// (פופאובר עוגן, נפתח לבד בכניסה ל-needs_you/failed) או בלחיצה מפורשת
// (ready/offline). הכותרת נשארת שקטה במצב נח.

import { useEffect, useRef, useState } from 'react';
import { useAuthorityConnections } from '../hooks/useAuthorityConnections';
import type { AuthorityConnState, ConnPhase } from '../hooks/useAuthorityConnections';

interface Props {
  userId: string | undefined;
}

type Authority = 'shaam' | 'btl';

const AUTHORITY_LABEL: Record<Authority, string> = { shaam: 'שע״ם', btl: 'ביטוח לאומי' };

const PHASE_CLASS: Record<ConnPhase, string> = {
  idle: '',
  connecting: 'is-pending',
  needs_you: 'is-pending',
  ready: 'is-on',
  failed: '',
};

// ‼ הודעת "מה לעשות עכשיו" — בעלת המילים היא הכותרת, לא ה-worker (ראה
// worker/src/handlers/shaamConnect.mjs / btlConnect.mjs: הטקסט שם נשאר
// ללוגים בלבד ולא מוצג כאן). מפתח = job.errorCode.
const NEEDS_YOU_COPY: Record<string, string> = {
  awaiting_shaam_auth: 'בחלון שע״ם: בחרו אישור דיגיטלי והזינו PIN. PIVO תמשיך לבד.',
  awaiting_gmf_auth: 'בחלון שע״ם: הזינו את הסיסמה של מערכת גביית מס הכנסה. PIVO תמשיך לבד.',
  awaiting_vat_auth: 'בחלון שע״ם: הזינו את הסיסמה של מערכת מע״מ. PIVO תמשיך לבד.',
  awaiting_nikui_auth: 'בחלון שע״ם: הזינו את הסיסמה של מערכת מגן (ניכויים). PIVO תמשיך לבד.',
  awaiting_btl_auth: 'בחלון ביטוח לאומי: הזינו קוד משתמש וסיסמה, ואת הקוד שנשלח לנייד. PIVO תמשיך לבד.',
};
const NEEDS_YOU_FALLBACK: Record<Authority, string> = {
  shaam: 'חלון שע״ם ממתין לך.',
  btl: 'חלון ביטוח לאומי ממתין לך.',
};

function tooltipFor(authority: Authority, state: AuthorityConnState): string {
  if (state.workerOffline) return 'מחשב האוטומציה כבוי';
  switch (state.phase) {
    case 'idle':
      return authority === 'shaam'
        ? 'לא מחובר לשע״ם · לחיצה פותחת את חלון ההתחברות'
        : 'לא מחובר לביטוח לאומי · לחיצה פותחת את מערכת ייצוג לקוחות';
    case 'connecting':
      return authority === 'shaam' ? 'מתחבר לשע״ם…' : 'מתחבר לביטוח לאומי…';
    case 'needs_you':
      return authority === 'shaam' ? 'חלון שע״ם ממתין לך' : 'חלון ביטוח לאומי ממתין לך';
    case 'ready':
      return authority === 'shaam' ? 'מחובר לשע״ם' : 'מחובר לביטוח לאומי';
    case 'failed':
      return 'החיבור לא הצליח · לחיצה מנסה שוב';
  }
}

/** משפט ראשון, מקוצר — לא זורקים על הרו"ח בליטרל טכני שלם מהעובד. */
function firstSentence(text: string, max = 90): string {
  const cut = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return cut.length > max ? `${cut.slice(0, max - 1).trimEnd()}…` : cut;
}

interface PopoverProps {
  children: React.ReactNode;
  onClose: () => void;
}

function ConnPopover({ children, onClose }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="authconn-popover" role="status" ref={ref}>
      {children}
    </div>
  );
}

export default function AuthorityConnectionButtons({ userId }: Props) {
  const { shaam, btl, connect, disconnect, connectBtl, disconnectBtl } =
    useAuthorityConnections(userId);
  const [openPopover, setOpenPopover] = useState<Authority | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // ‼ מאותחל ל-'idle' ולא לפאזה הראשונה שחושבה: אם העמוד נטען מחדש באמצע
  // needs_you אמיתי (חלון עדיין פתוח וממתין), זו עדיין כניסה טרייה שראויה
  // לפופאובר, לא רק לרחף מעליה כדי לגלות.
  const prevPhase = useRef<{ shaam: ConnPhase; btl: ConnPhase }>({ shaam: 'idle', btl: 'idle' });

  // ‼ פופאובר נפתח לבד רק בכניסה ל-needs_you/failed, ונסגר לבד כשעוזבים
  // אותם — לא בכל poll. "הכניסה האחרונה מנצחת": אם שתי הרשויות נכנסות
  // למצב שדורש תשומת לב, השנייה משתלטת על הפתיחה האוטומטית, הראשונה
  // נשארת נגישה בלחיצה.
  useEffect(() => {
    (['shaam', 'btl'] as const).forEach((authority) => {
      const state = authority === 'shaam' ? shaam : btl;
      const prev = prevPhase.current[authority];
      const next = state.phase;
      if (prev !== next) {
        if (next === 'needs_you' || next === 'failed') {
          setOpenPopover(authority);
        } else {
          setOpenPopover((cur) => (cur === authority ? null : cur));
        }
      }
      prevPhase.current[authority] = next;
    });
  }, [shaam, btl]);

  // סגירה בלחיצה מחוץ לאזור הכפתורים/פופאובר.
  useEffect(() => {
    if (!openPopover) return;
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpenPopover(null);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [openPopover]);

  function handleClick(authority: Authority, state: AuthorityConnState) {
    if (state.busy) return;
    if (openPopover && openPopover !== authority) setOpenPopover(null);

    if (state.workerOffline) {
      setOpenPopover(authority);
      return;
    }
    if (state.phase === 'ready' || state.phase === 'needs_you') {
      setOpenPopover((cur) => (cur === authority ? null : authority));
      return;
    }
    if (state.phase === 'connecting') return;
    // idle או failed — לחיצה על העיגול עצמו מנסה להתחבר, בלי שער פופאובר.
    setOpenPopover(null);
    void (authority === 'shaam' ? connect() : connectBtl());
  }

  function renderPopoverContent(authority: Authority, state: AuthorityConnState) {
    if (state.workerOffline) {
      return (
        <p>מחשב האוטומציה כבוי. כשיופעל במחשב המשרד אפשר יהיה להתחבר מכאן.</p>
      );
    }
    if (state.phase === 'needs_you') {
      const text = (state.errorCode && NEEDS_YOU_COPY[state.errorCode]) ?? NEEDS_YOU_FALLBACK[authority];
      return (
        <>
          <p>{text}</p>
          <button
            type="button"
            className="authconn-popover-btn"
            onClick={() => { void (authority === 'shaam' ? connect() : connectBtl()); }}
          >
            הבא את החלון לחזית
          </button>
        </>
      );
    }
    if (state.phase === 'ready') {
      return (
        <>
          <p>{authority === 'shaam' ? 'מחובר לשע״ם' : 'מחובר לביטוח לאומי'}</p>
          <button
            type="button"
            className="authconn-popover-btn"
            onClick={() => {
              setOpenPopover(null);
              void (authority === 'shaam' ? disconnect() : disconnectBtl());
            }}
          >
            {authority === 'shaam' ? 'התנתק משע״ם' : 'התנתק מביטוח לאומי'}
          </button>
        </>
      );
    }
    if (state.phase === 'failed') {
      return (
        <>
          <p>{state.isTimeout ? 'מחשב האוטומציה לא הגיב.' : 'החיבור לא הצליח.'}</p>
          {!state.isTimeout && state.errorDetail && <p>{firstSentence(state.errorDetail)}</p>}
          <button
            type="button"
            className="authconn-popover-btn"
            onClick={() => {
              setOpenPopover(null);
              void (authority === 'shaam' ? connect() : connectBtl());
            }}
          >
            נסה שוב
          </button>
        </>
      );
    }
    return null;
  }

  function renderButton(authority: Authority, state: AuthorityConnState) {
    const label = AUTHORITY_LABEL[authority];
    const title = tooltipFor(authority, state);
    return (
      <div className="authconn-item">
        <button
          type="button"
          className={`authconn-btn ${PHASE_CLASS[state.phase]}`}
          disabled={state.busy}
          title={title}
          aria-label={title}
          aria-expanded={openPopover === authority}
          onClick={() => handleClick(authority, state)}
        >
          <span className={`authconn-dot${state.phase === 'connecting' ? ' is-pulse' : ''}`} aria-hidden="true" />
          <span>{label}</span>
        </button>
        {openPopover === authority && (
          <ConnPopover onClose={() => setOpenPopover(null)}>
            {renderPopoverContent(authority, state)}
          </ConnPopover>
        )}
      </div>
    );
  }

  return (
    <div className="authconn" ref={containerRef}>
      {renderButton('shaam', shaam)}
      {renderButton('btl', btl)}
    </div>
  );
}
