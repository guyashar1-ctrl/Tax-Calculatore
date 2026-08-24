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
  clientId, clientName, clientEmail, pendingCount, onPublished, onClose,
}: {
  clientId: string;
  clientName: string;
  clientEmail?: string;
  /** כמה שינויים ממתינים — נאמר מראש, כדי שהלחיצה לא תהיה באמונה. */
  pendingCount?: number;
  /** נקרא מיד אחרי פרסום מוצלח, כדי שהמסך יציג את המצב החדש. */
  onPublished?: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<Choice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function publish(): Promise<boolean> {
    const { data, error: rpcError } = await supabase.rpc('publish_case_changes', { p_client_id: clientId });
    const res = data as { ok?: boolean; error?: string } | null;
    if (rpcError || !res?.ok) {
      setError('העדכון נכשל. אפשר לנסות שוב.');
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
    setBusy(null);
    if (!ok) return;
    if (choice === 'send') { setSending(true); return; }
    onClose();
  }

  if (sending) {
    return (
      <SendPortalDialog
        clientId={clientId}
        clientName={clientName}
        clientEmail={clientEmail}
        heading="שליחת הקישור לדף המעודכן"
        onClose={onClose}
        onSent={onClose}
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

  return (
    <div className="modal-backdrop" onClick={() => { if (!busy) onClose(); }}>
      <div className="modal" style={{ width: 460, maxWidth: '94vw' }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3 style={{ margin: 0, fontSize: 'var(--fs-16)' }}>עדכון דף הלקוח</h3>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="סגירה">✕</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '.55rem' }}>
          <InfoLines
            style={{ margin: 0, fontSize: 'var(--fs-13)', color: 'var(--ink-2)', lineHeight: 1.7 }}
            items={[
              pendingCount === 1
                ? `שינוי אחד ממתין - הוא ייכנס לדף האישי של ${clientName}`
                : pendingCount
                  ? `${pendingCount} שינויים ממתינים - הם ייכנסו לדף האישי של ${clientName}`
                  : `השינויים ייכנסו לדף האישי של ${clientName}`,
              'לדף יש כתובת אחת קבועה, והיא לא משתנה',
            ]} />

          {error && (
            <div style={{
              padding: '.5rem .7rem', borderRadius: 'var(--radius)',
              background: 'var(--red-light)', color: 'var(--err)', fontSize: 'var(--fs-13)',
            }}>⚠ {error}</div>
          )}

          {link ? (
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
                <span style={{ fontWeight: 600 }}>{busy === 'update' ? 'מעדכן…' : 'רק לעדכן'}</span>
                <span style={sub}>הדף מתעדכן. לא נשלח שום דבר - הלקוח יראה בכניסה הבאה.</span>
              </button>

              <button type="button" style={rowBtn} disabled={!!busy} onClick={() => void choose('send')}>
                <span style={{ fontWeight: 600 }}>{busy === 'send' ? 'מעדכן…' : 'לעדכן ולשלוח קישור'}</span>
                <span style={sub}>מתעדכן, ואז נפתחת השליחה - מייל או וואטסאפ, לאותו קישור קבוע.</span>
              </button>

              <button type="button" style={rowBtn} disabled={!!busy} onClick={() => void choose('copy')}>
                <span style={{ fontWeight: 600 }}>{busy === 'copy' ? 'מכין…' : 'העתק קישור'}</span>
                <span style={sub}>הקישור הקבוע ללוח, בלי לשלוח ובלי לעדכן.</span>
              </button>
            </>
          )}
        </div>

        <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={!!busy}>
            {link ? 'סיום' : 'ביטול'}
          </button>
        </div>
      </div>
    </div>
  );
}
