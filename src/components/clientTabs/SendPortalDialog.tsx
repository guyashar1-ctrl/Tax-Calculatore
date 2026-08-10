// ─── שליחת הדף האישי ללקוח ──────────────────────────────────────────────────
// ‼ הכרעת D4 (docs/EMAIL-POLICY.md §9): פרסום דף הלקוח ושליחת המייל הם שתי
// החלטות נפרדות. החלון הזה שולח בלבד — הפרסום קורה קודם, ב"עדכן את דף
// הלקוח" (publish_case_changes), ואחריו PublishCasePrompt שואל אם לשלוח.
// הפרמטר beforeSend שאיחד פרסום ושליחה הוסר במכוון — לא להחזיר אותו.

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import EmailPreviewDialog from '../EmailActivity/EmailPreviewDialog';

export type SendPortalMode = 'link' | 'email';

interface Props {
  clientId: string;
  clientName: string;
  /** בלי מייל בכרטיס אין מסלול "שליחה במייל" — נשאר הקישור. */
  clientEmail?: string;
  /** איך להיפתח. ברירת המחדל נגזרת מקיום המייל. */
  initialMode?: SendPortalMode;
  /** כותרת החלון — "פתיחת התהליך" בבנייה, "שליחה ללקוח" אחר כך. */
  heading?: string;
  onClose: () => void;
  /** נקרא אחרי שהקישור הופק או שהמייל יצא. */
  onSent?: () => void;
}

export default function SendPortalDialog({
  clientId, clientName, clientEmail, initialMode, heading, onClose, onSent,
}: Props) {
  const hasEmail = !!clientEmail?.trim();
  const [mode, setMode] = useState<SendPortalMode>(initialMode ?? (hasEmail ? 'email' : 'link'));
  const [stage, setStage] = useState<'choose' | 'link' | 'email'>('choose');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function go() {
    setBusy(true);
    setError(null);
    if (mode === 'email') {
      setBusy(false);
      setStage('email');
      return;
    }
    const { data, error: rpcError } = await supabase.rpc('mint_portal_token', { p_client_id: clientId });
    const token = (data as string | null) ?? null;
    setBusy(false);
    if (rpcError || !token) { setError('לא הצלחתי להנפיק קישור ללקוח.'); return; }
    setLink(`${window.location.origin}/?portal=${token}`);
    setStage('link');
    onSent?.();
  }

  // ── שליחה במייל — אותו חלון תצוגה מקדימה של כל שאר המיילים ──
  if (stage === 'email') {
    return (
      <EmailPreviewDialog
        heading="מייל פתיחת התהליך"
        fn="send-process-open-email"
        editable
        body={{ clientId }}
        onSent={() => onSent?.()}
        onClose={onClose}
      />
    );
  }

  // ── הקישור מוכן ──
  if (stage === 'link') {
    const first = clientName.trim().split(/\s+/)[0] || '';
    const shareText =
      `${first ? `היי ${first},` : 'היי,'}\n` +
      `פתחנו לך דף אישי שבו מרוכז כל תהליך ההצטרפות — מה כבר הושלם, מה בטיפולנו, ומה ממתין לך:\n` +
      `${link}\n` +
      `הדף מתעדכן מעצמו, אפשר לחזור אליו מאותו קישור בכל שלב.`;
    const waHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

    return (
      <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="modal task-modal">
          <div className="modal-header">
            <h3>✓ הקישור מוכן לשליחה</h3>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
          </div>
          <div className="modal-body">
            <p style={{ fontSize: 'var(--fs-14)', color: 'var(--ink-2)', lineHeight: 1.6, marginTop: 0 }}>
              זהו הקישור הקבוע של {clientName || 'הלקוח'}. הוא לא משתנה, ומציג בכל רגע את המצב העדכני —
              אפשר לשלוח אותו שוב בהמשך במקום להסביר מה נשאר.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.6rem', margin: '1.1rem 0 .9rem' }}>
              <a href={waHref} target="_blank" rel="noopener noreferrer" className="btn"
                style={{
                  background: '#25D366', color: '#fff', border: 'none', flex: '1 1 170px',
                  justifyContent: 'center', textDecoration: 'none', fontWeight: 600,
                }}>
                💬 שליחה בוואטסאפ
              </a>
              <button type="button" className="btn btn-secondary" style={{ flex: '1 1 130px', justifyContent: 'center' }}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  } catch { /* הדפדפן חסם את הלוח — הקישור מוצג למטה להעתקה ידנית */ }
                }}>
                {copied ? 'הועתק' : '🔗 העתקת קישור'}
              </button>
            </div>
            <input readOnly value={link} dir="ltr"
              style={{ width: '100%', textAlign: 'left', fontSize: 'var(--fs-13)', fontFamily: 'var(--font-mono, monospace)' }}
              onFocus={e => e.currentTarget.select()} />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-primary" onClick={onClose}>סיום</button>
          </div>
        </div>
      </div>
    );
  }

  // ── הבחירה ──
  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal task-modal">
        <div className="modal-header">
          <h3>{heading ?? 'שליחה ללקוח'}</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>✕</button>
        </div>

        <div className="modal-body">
          <label style={{
            display: 'block', fontWeight: 600, fontSize: 'var(--fs-13)',
            color: 'var(--ink-2)', marginBottom: '.5rem',
          }}>
            איך לשלוח ללקוח?
          </label>
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
            {([
              { key: 'link' as const, icon: '🔗', title: 'קישור לשליחה', sub: 'וואטסאפ, SMS או העתקה — בלי מייל' },
              { key: 'email' as const, icon: '📧', title: 'שליחה במייל', sub: hasEmail ? `אל ${clientEmail}` : 'אין מייל בכרטיס הלקוח' },
            ]).map(opt => {
              const disabled = opt.key === 'email' && !hasEmail;
              const sel = mode === opt.key;
              return (
                <div key={opt.key}
                  onClick={() => { if (!busy && !disabled) setMode(opt.key); }}
                  style={{
                    flex: '1 1 200px', padding: '.7rem .8rem',
                    cursor: busy || disabled ? 'default' : 'pointer',
                    opacity: disabled ? .5 : 1,
                    border: `1px solid ${sel ? 'var(--accent)' : 'var(--hairline-1)'}`,
                    borderRadius: 'var(--radius)',
                  }}>
                  <div style={{ fontSize: 'var(--fs-14)', fontWeight: sel ? 600 : 400 }}>{opt.icon} {opt.title}</div>
                  <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: 2 }} dir={opt.key === 'email' && hasEmail ? 'ltr' : undefined}>
                    {opt.sub}
                  </div>
                </div>
              );
            })}
          </div>

          <p style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', lineHeight: 1.6, marginBottom: 0 }}>
            {mode === 'email'
              ? 'המייל ייפתח לתצוגה מקדימה עם רשימת מה שממתין לו — אפשר לערוך לפני השליחה.'
              : 'הקישור יופק ויוצג כאן, מוכן להדבקה בוואטסאפ.'}
          </p>

          {error && (
            <div style={{
              marginTop: '1rem', padding: '.65rem .85rem', color: 'var(--danger, var(--err))',
              borderRadius: 'var(--radius)', fontSize: 'var(--fs-14)',
            }}>{error}</div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>ביטול</button>
          <button type="button" className="btn btn-primary" onClick={() => void go()} disabled={busy}>
            {busy ? 'רגע…' : mode === 'email' ? '📧 שליחה ללקוח במייל' : '🔗 הפקת קישור'}
          </button>
        </div>
      </div>
    </div>
  );
}
