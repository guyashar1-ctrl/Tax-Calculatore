// ─── שליחת קישור להשלמת פרטים — דיאלוג ──────────────────────────────────────
// docs/PLAN-REQUEST-PREREQUISITES-INFORMATION-COLLECTION.md §7.2. יוצר את
// הקישור (סקופ-שלב, תפוגה) ברגע הפתיחה, ואז נותן שתי דרכים להעביר אותו הלאה:
// מייל (אותו שער תצוגה-מקדימה/שליחה כמו הוראות האישור) או העתקה ידנית. שתיהן
// מובילות לאותו קישור — אין שתי זהויות שונות לאותה עבודה.
import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import EmailInput from './ui/EmailInput';
import EmailPreviewDialog from './EmailActivity/EmailPreviewDialog';
import { isValidEmail } from '../utils/email';
import { supabase } from '../lib/supabase';
import type { PersonRole } from '../types';

interface Props {
  personName: string;
  personRole: PersonRole;
  missingLabels: string[];
  requestId: string;
  stepId: string;
  currentEmail: string;
  onSaveEmail: (email: string) => Promise<void>;
  onClose: () => void;
  /** נקרא אחרי שליחה במייל או העתקת קישור — הקישור כבר קיים בשני המקרים. */
  onDone: () => void;
}

export default function ParticipantLinkDialog({
  personName, personRole, missingLabels, requestId, stepId, currentEmail,
  onSaveEmail, onClose, onDone,
}: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(true);
  const [createError, setCreateError] = useState<string | null>(null);
  const [email, setEmail] = useState(currentEmail);
  const [saving, setSaving] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('create_participant_link', { p_step_id: stepId });
      if (cancelled) return;
      if (error || !data?.ok) { setCreateError('יצירת הקישור נכשלה. נסו שוב.'); setCreating(false); return; }
      setToken(String(data.token));
      setCreating(false);
    })();
    return () => { cancelled = true; };
  }, [stepId]);

  const valid = isValidEmail(email);
  const linkUrl = token
    ? `${window.location.origin}${window.location.pathname}?participant=${token}`
    : '';

  async function handleSendEmail() {
    if (!valid) { setEmailError('נדרשת כתובת מייל תקינה.'); return; }
    setEmailError(null);
    if (email.trim() !== currentEmail.trim()) {
      setSaving(true);
      try { await onSaveEmail(email.trim()); }
      catch (e) { setSaving(false); setEmailError(e instanceof Error ? e.message : 'שמירת הכתובת נכשלה.'); return; }
      setSaving(false);
    }
    setPreviewing(true);
  }

  async function handleCopy() {
    try { await navigator.clipboard.writeText(linkUrl); } catch { /* בלי clipboard — הקישור עדיין מוצג להעתקה ידנית */ }
    setCopied(true);
  }

  if (previewing) {
    return (
      <EmailPreviewDialog
        heading={`השלמת פרטים — ${personName}`}
        body={{ requestId, stage: 'prerequisites', niRole: personRole, stepId }}
        onSent={onDone}
        onClose={onClose}
      />
    );
  }

  return (
    <Modal title={`קישור להשלמת פרטים — ${personName}`} onClose={onClose} width={460}>
      <div style={{ display: 'grid', gap: '.9rem', fontSize: 'var(--fs-14)' }}>
        <div style={{ color: 'var(--ink-3)', lineHeight: 1.6 }}>
          {personName}
          {missingLabels.length > 0 && <><br />נדרשים: {missingLabels.join(', ')}</>}
        </div>

        {creating && <div style={{ color: 'var(--ink-3)' }}>יוצר קישור…</div>}
        {createError && <div style={{ color: 'var(--danger)', fontSize: 'var(--fs-13)' }}>{createError}</div>}

        {token && (
          <>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>כתובת מייל של {personName}</span>
              <EmailInput
                value={email}
                onChange={e => { setEmail(e.target.value); setEmailError(null); }}
                placeholder="name@example.com"
                disabled={saving}
                autoFocus
              />
            </label>
            {emailError && <div style={{ color: 'var(--danger)', fontSize: 'var(--fs-13)' }}>{emailError}</div>}
            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="ui-btn ui-btn-ghost" onClick={onClose}>ביטול</button>
              <button type="button" className="ui-btn" disabled={copied} onClick={() => void handleCopy()}>
                {copied ? 'הועתק ✓' : 'העתק קישור'}
              </button>
              <button type="button" className="ui-btn ui-btn-primary" disabled={!valid || saving}
                onClick={() => void handleSendEmail()}>
                {saving ? 'שומר…' : 'שלח במייל'}
              </button>
            </div>
            {copied && (
              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
                הקישור הועתק ללוח. אפשר לסגור ולהעביר אותו בכל דרך.
                <div style={{ marginTop: 4 }}>
                  <button type="button" className="ui-btn ui-btn-sm" onClick={onDone}>סגירה</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
