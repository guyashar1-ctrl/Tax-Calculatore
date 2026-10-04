// ─── "עדכן את דף הלקוח" — הפעולה היחידה ברמת הדף ────────────────────────────
// ‼ המודל: ללקוח יש דף אישי אחד וקבוע לכל אורך הקשר, וכל הבקשות חיות עליו.
// הרו"ח עורך ומוסיף, ואז מפרסם את הדף **כיחידה אחת**. אין קישור לכל בקשה
// ואין מייל לכל בקשה — יש דף שהתעדכן.
//
// שלוש הבחירות כאן הן שלוש התשובות היחידות לשאלה "ומה עכשיו":
//   1. רק לעדכן            — הדף מתעדכן, ולא יוצא שום דבר. הלקוח יראה בכניסה הבאה.
//   2. לעדכן ולשלוח קישור  — מתעדכן, ואז נפתח מסלול השליחה הקיים של הקישור הקבוע.
//   3. העתק קישור          — אותו קישור קבוע ללוח, לוואטסאפ. בלי מייל.
//
// ‼ הפרסום עצמו קורה כאן, אחרי הבחירה, ולא לפניה — כדי ש"רק לעדכן" יהיה
// באמת הפעולה ולא "סגור בלי לשלוח" אחרי שכבר קרה משהו.
// ‼ שליחה לגורם חיצוני (רו"ח קודם) אינה חלק מזה ולא תיכנס לכאן: זה מייל
// עצמאי לאדם אחר, והוא נשלח מהבקשה שלו.

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import SendPortalDialog from './SendPortalDialog';
import InfoLines from '../ui/InfoLines';

type Choice = 'update' | 'send' | 'copy';

export default function PublishCasePrompt({
  clientId, clientName, clientEmail, pendingCount, pendingNames, onPublished, onClose, openIntake,
}: {
  clientId: string;
  clientName: string;
  clientEmail?: string;
  /** קליטה פתוחה — לנוסח בוואטסאפ (SendPortalDialog). */
  openIntake?: boolean;
  /** כמה שינויים ממתינים — נאמר מראש, כדי שהלחיצה לא תהיה באמונה. */
  pendingCount?: number;
  /** ‼ ובשמות: הפרסום הוא של הדף כולו, ולכן אומרים בדיוק מה ייכנס אליו. */
  pendingNames?: string[];
  /** נקרא מיד אחרי פרסום מוצלח, כדי שהמסך יציג את המצב החדש. */
  onPublished?: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<Choice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** פורסם, אבל אין ללקוח דבר חדש להודיע עליו — מייל «מה חדש» היה נכשל. */
  const [nothingNew, setNothingNew] = useState(false);
  /** «שליחת הקישור לדף» — המסלול הקיים (מייל עדכון בלי «חדש», או קישור לוואטסאפ). */
  const [sendingUpdate, setSendingUpdate] = useState(false);
  const hasEmail = !!clientEmail?.trim();

  /**
   * ‼ פרסום יכול להיות רק סידור מחדש או הסרה, או שלב «בדף, בלי מייל» — ואז אין
   * ללקוח שום דבר «חדש», והשרת ידחה מייל «מה חדש» (nothing_to_announce) אחרי
   * תצוגה מקדימה ריקה. שואלים את השרת לפני שפותחים אותה. תקלה בשאלה ⇒ פותחים
   * כרגיל, והחלון עצמו יגיד מה קרה.
   */
  async function hasSomethingNew(): Promise<boolean> {
    const { data, error: rpcError } = await supabase.rpc('client_notice_preview', { p_client_id: clientId, p_kind: 'new' });
    const res = data as { ok?: boolean; items?: unknown[] } | null;
    if (rpcError || !res?.ok || !Array.isArray(res.items)) return true;
    return res.items.length > 0;
  }

  async function publish(): Promise<boolean> {
    const { data, error: rpcError } = await supabase.rpc('publish_case_changes', { p_client_id: clientId });
    const res = data as { ok?: boolean; error?: string } | null;
    if (rpcError || !res?.ok) {
      // ‼ מיגרציה 135 — לפני אישור ההצעה הפרסום נדחה בשרת. זו אינה תקלה,
      // ולכן היא לא נאמרת כ"נסה שוב": אין מה לנסות עד שהלקוח יאשר.
      setError(res?.error === 'quotation_not_approved'
        ? 'ההצעה עוד לא אושרה. הבקשות מוכנות, והן ייפתחו ללקוח מעצמן ברגע שיאשר.'
        : 'העדכון נכשל. אפשר לנסות שוב.');
      return false;
    }
    onPublished?.();
    return true;
  }

  async function choose(choice: Choice) {
    setBusy(choice);
    setError(null);

    if (choice === 'copy') {
      // ‼ הקישור הקבוע — mint_portal_token מחזירה את אותו טוקן בכל קריאה,
      // ולכן זו העתקה ולא הנפקה. שום בקשה לא מקבלת כתובת משלה.
      const { data, error: rpcError } = await supabase.rpc('mint_portal_token', { p_client_id: clientId });
      const token = (data as string | null) ?? null;
      setBusy(null);
      if (rpcError || !token) { setError('לא הצלחתי להפיק את הקישור.'); return; }
      const url = `${window.location.origin}/?portal=${token}`;
      setLink(url);
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } catch {
        // דפדפן שחוסם את הלוח — הקישור מוצג למטה להעתקה ידנית.
      }
      return;
    }

    const ok = await publish();
    if (!ok) { setBusy(null); return; }
    if (choice === 'send') {
      const go = !hasEmail || await hasSomethingNew();
      setBusy(null);
      if (go) setSending(true); else setNothingNew(true);
      return;
    }
    setBusy(null);
    onClose();
  }

  if (sending || sendingUpdate) {
    return (
      <SendPortalDialog
        clientId={clientId}
        clientName={clientName}
        clientEmail={clientEmail}
        openIntake={openIntake}
        heading={sendingUpdate ? 'שליחת הקישור לדף' : hasEmail ? 'מייל על מה שפורסם' : 'הקישור לדף שפורסם'}
        // ‼ 214: מה שפורסם עכשיו הוא «חדש» — מייל «חדש» (נתפס בשרת, מסומן כנמסר), לא
        // ההתנהגות הישנה בלי מפתח ולא «תזכורת». כשאין מה להודיע — רק «עדכון»
        // (הקישור ומצב, בלי לסמן כלום כחדש), ורק אם הרו"ח בחר בו.
        emailKind={sendingUpdate ? 'update' : 'new'}
        // ‼ בלי מייל בכרטיס — נוחתים על «קישור לשליחה»; עם מייל — ישר לתצוגת המייל.
        initialMode={sendingUpdate ? undefined : hasEmail ? 'email' : 'link'}
        onClose={onClose}
        // ‼ לא סוגרים כאן: החלון מראה מה קרה (נשלח / כבר נשלח / לא ידוע), או את
        // הקישור כשאין מייל בכרטיס. רק מרעננים את המסך שמאחור.
        onSent={() => onPublished?.()}
      />
    );
  }

  const rowBtn: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '.15rem',
    textAlign: 'start', width: '100%', padding: '.6rem .75rem', font: 'inherit',
    border: '1px solid var(--hairline-2)', borderRadius: 'var(--radius)',
    background: 'transparent', color: 'var(--ink-1)', cursor: 'pointer',
  };
  const sub: React.CSSProperties = { fontSize: 'var(--fs-12)', color: 'var(--ink-3)' };
  // שם פרטי בכותרת ובהסברים — שם מלא ארוך שבר את ראש החלון.
  const firstName = clientName.trim().split(/\s+/)[0] || clientName;

  return (
    <div className="modal-backdrop" onClick={() => { if (!busy) onClose(); }}>
      <div className="modal" style={{ width: 460, maxWidth: '94vw' }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3 style={{ margin: 0, fontSize: 'var(--fs-16)' }}>פרסום בדף של {firstName}</h3>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="סגירה">✕</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '.55rem' }}>
          <InfoLines
            style={{ margin: 0, fontSize: 'var(--fs-13)', color: 'var(--ink-2)', lineHeight: 1.7 }}
            items={[
              pendingCount === 1
                ? `שינוי אחד ייכנס לדף האישי של ${firstName}`
                : pendingCount
                  ? `${pendingCount} שינויים ייכנסו לדף האישי של ${firstName}`
                  : `השינויים ייכנסו לדף האישי של ${firstName}`,
              'לדף יש כתובת אחת קבועה, והיא לא משתנה',
            ]} />
          {pendingNames && pendingNames.length > 0 && (
            <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 'var(--fs-13)', color: 'var(--ink-1)', lineHeight: 1.7 }}>
              {pendingNames.slice(0, 6).map((nm, i) => <li key={i}>{nm}</li>)}
              {pendingNames.length > 6 && <li>ועוד {pendingNames.length - 6}</li>}
            </ul>
          )}

          {error && (
            <div style={{
              padding: '.5rem .7rem', borderRadius: 'var(--radius)',
              background: 'var(--red-light)', color: 'var(--err)', fontSize: 'var(--fs-13)',
            }}>⚠ {error}</div>
          )}

          {nothingNew ? (
            <>
              <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ok, #17845b)' }}>
                ✓ פורסם. אין משהו חדש שמצדיק מייל.
              </div>
              <span style={sub}>{firstName} יראה את השינויים בדף בכניסה הבאה.</span>
              <button type="button" style={rowBtn} onClick={() => setSendingUpdate(true)}>
                <span style={{ fontWeight: 600 }}>שליחת הקישור לדף בכל זאת…</span>
                <span style={sub}>מייל עם הקישור ומה שעוד ממתין — בלי לסמן דבר כחדש. או קישור לוואטסאפ.</span>
              </button>
            </>
          ) : link ? (
            <>
              <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ok, #17845b)' }}>
                {copied ? '✓ הקישור הועתק' : 'הקישור מוכן להעתקה'}
              </div>
              <input readOnly value={link} dir="ltr" className="input"
                style={{ width: '100%', textAlign: 'left', fontSize: 'var(--fs-12)' }}
                onFocus={e => e.currentTarget.select()} />
            </>
          ) : (
            <>
              <button type="button" style={rowBtn} disabled={!!busy} onClick={() => void choose('update')}>
                <span style={{ fontWeight: 600 }}>{busy === 'update' ? 'מפרסם…' : 'רק לפרסם'}</span>
                <span style={sub}>לא נשלח מייל — הבקשות יחכו בדף, ו{firstName} יראה אותן בכניסה הבאה.</span>
              </button>

              <button type="button" style={rowBtn} disabled={!!busy} onClick={() => void choose('send')}>
                <span style={{ fontWeight: 600 }}>{busy === 'send' ? 'מפרסם…' : hasEmail ? 'לפרסם ולשלוח מייל' : 'לפרסם ולשלוח קישור'}</span>
                <span style={sub}>{hasEmail
                  ? 'אחרי הפרסום נפתח המייל לתצוגה מקדימה — בודקים ושולחים.'
                  : 'אין מייל בכרטיס — אחרי הפרסום מפיקים את הקישור לדף, לוואטסאפ.'}</span>
              </button>

              <button type="button" style={rowBtn} disabled={!!busy} onClick={() => void choose('copy')}>
                <span style={{ fontWeight: 600 }}>{busy === 'copy' ? 'מכין…' : 'רק להעתיק את הקישור'}</span>
                <span style={sub}>הקישור הקבוע ללוח — בלי לפרסם ובלי לשלוח.</span>
              </button>
            </>
          )}
        </div>

        <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={!!busy}>
            {link || nothingNew ? 'סיום' : 'ביטול'}
          </button>
        </div>
      </div>
    </div>
  );
}
