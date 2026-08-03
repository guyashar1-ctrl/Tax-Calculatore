// ─── תצוגה מקדימה של מייל ללקוח, ושליחה ממנה ───────────────────────────────
// כלל: שום מייל לא יוצא ללקוח בלי שהרו"ח ראה אותו קודם ולחץ שלח. התצוגה
// נבנית בשרת מאותו קוד שבונה את המייל האמיתי, ולכן מה שרואים כאן הוא המייל —
// לא שחזור שלו.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface Props {
  /** גוף הבקשה ל-send-onboarding-email (requestId/stage/signerId/clientId…). */
  body?: Record<string, unknown>;
  /**
   * מייל שנבנה כבר בדפדפן (תזכורת הצעת מחיר) — מוצג כמו שהוא, בלי קריאת
   * תצוגה מקדימה לשרת. הולך יד ביד עם sendVia.
   */
  preloaded?: Loaded;
  /** שליחה חלופית, כשהמייל לא יוצא דרך send-onboarding-email. null = הצליח. */
  sendVia?: () => Promise<string | null>;
  /** כותרת החלון — מה המייל הזה. */
  heading: string;
  onClose: () => void;
  /** נקרא אחרי שליחה מוצלחת. */
  onSent: () => void;
  /**
   * צפייה בלבד — כשהשליחה עצמה שייכת לכפתור אחר שגם מעדכן את מצב התהליך
   * (למשל מייל החתימה, שנשלח לכל החותמים ומסמן שההוראות לב"ל יצאו).
   */
  readOnly?: boolean;
}

interface Loaded { subject: string; to: string; from?: string; html: string; }

const ERROR_TEXT: Record<string, string> = {
  'no client email': 'אין כתובת מייל ללקוח בבקשה הזו.',
  'not found': 'הבקשה לא נמצאה.',
  unauthorized: 'ההתחברות פגה — יש להיכנס מחדש.',
  'signer not found': 'לא נמצא חותם עם כתובת מייל.',
  missing_reference_number: 'חסר מספר אסמכתא של הביטוח הלאומי.',
  resend_failed: 'שרת המייל דחה את השליחה.',
};

/**
 * supabase-js מחזיר על תשובה שאינה 2xx רק "non-2xx status code" ומסתיר את הגוף.
 * הסיבה האמיתית (אין מייל, חסרה אסמכתא) יושבת שם, ובלעדיה אי אפשר לתקן כלום.
 */
async function errText(data: any, error: any): Promise<string> {
  let body = data;
  const ctx = error && (error as { context?: Response }).context;
  if (!body && ctx && typeof ctx.json === 'function') {
    try { body = await ctx.clone().json(); } catch { /* גוף שאינו JSON */ }
  }
  const code = body?.error;
  return body?.detail?.message || (code && (ERROR_TEXT[code] || code)) || error?.message || 'הפעולה נכשלה';
}

export default function EmailPreviewDialog({ body, preloaded, sendVia, heading, onClose, onSent, readOnly }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(preloaded ?? null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (preloaded || !body) return;
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('send-onboarding-email', {
          body: { ...body, preview: true },
        });
        if (!alive) return;
        if (error || !data?.ok) setError(await errText(data, error));
        else setLoaded({ subject: data.subject, to: data.to, from: data.from, html: data.html });
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send() {
    setSending(true);
    setError(null);
    try {
      if (sendVia) {
        const failure = await sendVia();
        if (failure) { setError(failure); return; }
        setSent(true);
        onSent();
        return;
      }
      if (!body) { setError('אין מה לשלוח.'); return; }
      const { data, error } = await supabase.functions.invoke('send-onboarding-email', { body });
      if (error || !data?.ok) { setError(await errText(data, error)); return; }
      setSent(true);
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 760, maxWidth: '100%', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div className="modal-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>{heading}</h3>
            <div style={{ fontSize: '.78rem', color: 'var(--gray-500)', marginTop: 2 }}>
              {loaded
                ? <>אל <span dir="ltr">{loaded.to}</span> · נושא: {loaded.subject}</>
                : 'בונה את המייל…'}
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ flex: 1, overflow: 'hidden', background: 'var(--gray-100, #eee)', minHeight: 220 }}>
          {loaded ? (
            <iframe
              title="תצוגה מקדימה של המייל"
              srcDoc={loaded.html}
              sandbox=""
              style={{ width: '100%', height: '62vh', border: 'none', background: '#fff' }}
            />
          ) : (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--gray-500)', fontSize: '.9rem' }}>
              {error ? '' : 'טוען את המייל…'}
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: '.6rem .9rem', background: 'var(--red-light)', color: 'var(--red)', fontSize: '.85rem' }}>
            {error}
          </div>
        )}
        {sent && (
          <div style={{ padding: '.6rem .9rem', background: 'var(--green-light, #eaf6f1)', color: 'var(--ok, #17845b)', fontSize: '.85rem' }}>
            המייל נשלח{loaded ? <> אל <span dir="ltr">{loaded.to}</span></> : ''}. הוא מופיע ברשימת המיילים של הלקוח.
          </div>
        )}

        <div className="modal-footer">
          {loaded && !sent && (
            <button type="button" className="btn btn-secondary" onClick={() => {
              const w = window.open('', '_blank');
              if (w) { w.document.write(loaded.html); w.document.close(); }
            }}>פתיחה בכרטיסייה חדשה</button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>{sent || readOnly ? 'סגירה' : 'ביטול'}</button>
          {!sent && !readOnly && (
            <button type="button" className="btn btn-primary" disabled={!loaded || sending} onClick={send}>
              {sending ? 'שולח…' : 'שלח ללקוח'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
