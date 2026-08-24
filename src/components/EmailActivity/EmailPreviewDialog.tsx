// ─── תצוגה מקדימה של מייל ללקוח, ושליחה ממנה ───────────────────────────────
// כלל: שום מייל לא יוצא ללקוח בלי שהרו"ח ראה אותו קודם ולחץ שלח. התצוגה
// נבנית בשרת מאותו קוד שבונה את המייל האמיתי, ולכן מה שרואים כאן הוא המייל —
// לא שחזור שלו.

import { useEffect, useState } from 'react';
import { EMAIL_PREVIEW_SANDBOX, withExternalLinks } from '../../utils/emailPreviewHtml';
import { supabase } from '../../lib/supabase';
import InfoLines from '../ui/InfoLines';

interface Props {
  /** גוף הבקשה לפונקציה (requestId/stage/signerId/clientId/stepId…). */
  body?: Record<string, unknown>;
  /** פונקציית השרת שבונה ושולחת. ברירת מחדל — מייל הייצוג. */
  fn?: string;
  /**
   * עריכה לפני שליחה — נושא וגוף. התצוגה נבנית מחדש בשרת אחרי כל עריכה,
   * ולכן מה שרואים אחרי "עדכון התצוגה" הוא בדיוק מה שיישלח.
   */
  editable?: boolean;
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
  /**
   * נוסח ששמור על הבקשה עצמה (נושא/גוף של בקשה לגורם חיצוני). נטען לתוך
   * התצוגה המקדימה הראשונה, ומשם ממשיך כרגיל — אפשר לערוך לפני השליחה.
   * ‼ שדה ריק אינו נשלח כדריסה: השרת מפרש '' כ"נושא ריק" ולא כ"אין ערך",
   * ובקשה ששמור לה רק נושא הייתה יוצאת בלי גוף בכלל.
   */
  initialOverrides?: { subject?: string; body?: string };
}

interface Loaded { subject: string; to: string; from?: string; html: string; bodyText?: string; }

const ERROR_TEXT: Record<string, string> = {
  'no client email': 'אין כתובת מייל ללקוח בבקשה הזו.',
  'not found': 'הבקשה לא נמצאה.',
  unauthorized: 'ההתחברות פגה - יש להיכנס מחדש.',
  'signer not found': 'לא נמצא חותם עם כתובת מייל.',
  missing_reference_number: 'חסר מספר אסמכתא של הביטוח הלאומי.',
  resend_failed: 'שרת המייל דחה את השליחה.',
  bad_kind: 'סוג המייל אינו מוכר.',
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

export default function EmailPreviewDialog({ body, fn, editable, preloaded, sendVia, heading, onClose, onSent, readOnly, initialOverrides }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(preloaded ?? null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // הטיוטה נטענת מהתצוגה המקדימה הראשונה — הנוסח שהשרת באמת מייצר.
  const [draftSubject, setDraftSubject] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [dirty, setDirty] = useState(false);

  const fnName = fn ?? 'send-onboarding-email';
  const overrides = editable ? { subject: draftSubject, body: draftBody } : undefined;

  async function loadPreview(withOverrides?: { subject: string; body: string }) {
    if (!body) return;
    try {
      const { data, error } = await supabase.functions.invoke(fnName, {
        body: { ...body, preview: true, ...(withOverrides ? { overrides: withOverrides } : {}) },
      });
      if (error || !data?.ok) { setError(await errText(data, error)); return; }
      setError(null);
      setLoaded({ subject: data.subject, to: data.to, from: data.from, html: data.html, bodyText: data.bodyText });
      if (!withOverrides) {
        setDraftSubject(data.subjectText ?? data.subject ?? '');
        setDraftBody(data.bodyText ?? '');
      }
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    if (preloaded || !body) return;
    let alive = true;
    (async () => {
      try {
        /* רק שדות שיש בהם תוכן. השרת ממזג overrides ?? saved ?? base, ולכן
           מפתח חסר נופל לנוסח הנגזר — בדיוק ההתנהגות של בקשה בלי נוסח שמור. */
        const seeded: { subject?: string; body?: string } = {};
        if (initialOverrides?.subject?.trim()) seeded.subject = initialOverrides.subject;
        if (initialOverrides?.body?.trim()) seeded.body = initialOverrides.body;
        const hasSeed = Object.keys(seeded).length > 0;
        const { data, error } = await supabase.functions.invoke(fnName, {
          body: { ...body, preview: true, ...(hasSeed ? { overrides: seeded } : {}) },
        });
        if (!alive) return;
        if (error || !data?.ok) setError(await errText(data, error));
        else {
          setLoaded({ subject: data.subject, to: data.to, from: data.from, html: data.html, bodyText: data.bodyText });
          setDraftSubject(data.subjectText ?? data.subject ?? '');
          setDraftBody(data.bodyText ?? '');
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshPreview() {
    setRefreshing(true);
    await loadPreview({ subject: draftSubject, body: draftBody });
    setRefreshing(false);
  }

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
      const { data, error } = await supabase.functions.invoke(fnName, {
        body: { ...body, ...(overrides ? { overrides } : {}) },
      });
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

        {editable && loaded && !sent && (
          <div style={{ padding: '.7rem .9rem', borderBottom: '1px solid var(--hairline-2)', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            <label style={{ fontSize: '.78rem', color: 'var(--gray-600)' }}>
              נושא המייל
              <input
                value={draftSubject}
                onChange={e => { setDraftSubject(e.target.value); setDirty(true); }}
                style={{ marginTop: 3, width: '100%' }}
              />
            </label>
            <label style={{ fontSize: '.78rem', color: 'var(--gray-600)' }}>
              גוף המייל
              <textarea
                rows={7}
                value={draftBody}
                onChange={e => { setDraftBody(e.target.value); setDirty(true); }}
                style={{ marginTop: 3, width: '100%', resize: 'vertical' }}
              />
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <button type="button" className="btn btn-sm btn-secondary" disabled={refreshing || !dirty}
                onClick={() => void refreshPreview()}>
                {refreshing ? 'מרענן…' : 'עדכון התצוגה'}
              </button>
              <span style={{ fontSize: '.75rem', color: dirty ? 'var(--warn, #b26a00)' : 'var(--gray-500)' }}>
                {dirty ? 'התצוגה למטה עדיין מציגה את הנוסח הקודם.' : 'התצוגה למטה היא המייל שיישלח.'}
              </span>
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflow: 'hidden', background: 'var(--gray-100, #eee)', minHeight: 220 }}>
          {loaded ? (
            <iframe
              title="תצוגה מקדימה של המייל"
              srcDoc={withExternalLinks(loaded.html)}
              sandbox={EMAIL_PREVIEW_SANDBOX}
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
          <InfoLines
            style={{ padding: '.6rem .9rem', background: 'var(--green-light, #eaf6f1)', color: 'var(--ok, #17845b)', fontSize: '.85rem' }}
            items={[
              loaded ? <>המייל נשלח אל <span dir="ltr">{loaded.to}</span></> : 'המייל נשלח',
              'הוא מופיע ברשימת המיילים של הלקוח',
            ]} />
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
