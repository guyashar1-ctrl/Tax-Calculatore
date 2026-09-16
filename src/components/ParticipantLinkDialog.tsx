// ─── שליחת קישור להשלמת פרטים — דיאלוג ──────────────────────────────────────
// docs/PLAN-REQUEST-PREREQUISITES-INFORMATION-COLLECTION.md §7.2 + 167 (נמען
// ≠ בעלות). יוצר את הקישור (סקופ-שלב, תפוגה, נמען) ברגע שנבחר נמען, ואז נותן
// שתי דרכים להעביר אותו הלאה: מייל (אותו שער תצוגה-מקדימה/שליחה כמו הוראות
// האישור) או העתקה ידנית. שתיהן מובילות לאותו קישור — אין שתי זהויות שונות
// לאותה עבודה.
//
// ‼ 167: כשהנושא (של מי הפרטים) הוא בן/בת הזוג, יש שני נמענים אפשריים —
// הנושא עצמו, או בעל הכרטיס שממלא במקומו/ה. הבחירה משנה רק כתובת/שם; אותו
// step_id, אותו requirement_key/field_keys, אותה בקשה. כשיש נמען אחד בלבד
// (הנושא הוא בעל הכרטיס עצמו) אין ברירה להציג — בדיוק ההתנהגות מלפני 167.
import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import EmailInput from './ui/EmailInput';
import EmailPreviewDialog from './EmailActivity/EmailPreviewDialog';
import { isValidEmail } from '../utils/email';
import { supabase } from '../lib/supabase';
import type { PrerequisitePerson } from './PrerequisiteGate';

interface Props {
  /** של מי הפרטים — לעולם לא משתנה לפי נמען, ומופיע תמיד בכותרת ובתוכן המייל. */
  subjectName: string;
  subjectRole: 'client' | 'spouse';
  missingLabels: string[];
  requestId: string;
  stepId: string;
  /** נמען אחד (הנושא בלבד) או שניים (הנושא + בעל הכרטיס). */
  recipients: PrerequisitePerson[];
  defaultRecipientRole: 'client' | 'spouse';
  onSaveEmail: (role: 'client' | 'spouse', email: string) => Promise<void>;
  onClose: () => void;
  /** נקרא אחרי שליחה במייל או העתקת קישור — הקישור כבר קיים בשני המקרים. */
  onDone: () => void;
}

export default function ParticipantLinkDialog({
  subjectName, subjectRole, missingLabels, requestId, stepId, recipients, defaultRecipientRole,
  onSaveEmail, onClose, onDone,
}: Props) {
  const initialRole = recipients.some(r => r.role === defaultRecipientRole) ? defaultRecipientRole : recipients[0].role;
  const [selectedRole, setSelectedRole] = useState<'client' | 'spouse'>(initialRole);
  const selected = recipients.find(r => r.role === selectedRole) ?? recipients[0];

  const [token, setToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(true);
  const [createError, setCreateError] = useState<string | null>(null);
  const [email, setEmail] = useState(selected.email);
  const [saving, setSaving] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [copied, setCopied] = useState(false);

  // ‼ הקישור נוצר-מחדש בכל בחירת נמען: create_participant_link מבטל אוטומטית
  // את הקישור הפעיל הקודם (step_id יחיד) — "החלפת נמען" ו"שליחה חוזרת" הם
  // אותו מנגנון בדיוק, בלי לוגיקת ביטול נפרדת.
  useEffect(() => {
    let cancelled = false;
    setCreating(true); setCreateError(null); setToken(null); setCopied(false);
    (async () => {
      const { data, error } = await supabase.rpc('create_participant_link', {
        p_step_id: stepId, p_recipient_role: selectedRole,
      });
      if (cancelled) return;
      if (error || !data?.ok) { setCreateError('יצירת הקישור נכשלה. נסו שוב.'); setCreating(false); return; }
      setToken(String(data.token));
      setCreating(false);
    })();
    return () => { cancelled = true; };
  }, [stepId, selectedRole]);

  function selectRecipient(role: 'client' | 'spouse') {
    if (role === selectedRole) return;
    setSelectedRole(role);
    setEmail(recipients.find(r => r.role === role)?.email ?? '');
    setEmailError(null);
  }

  const valid = isValidEmail(email);
  const linkUrl = token
    ? `${window.location.origin}${window.location.pathname}?participant=${token}`
    : '';

  async function handleSendEmail() {
    if (!valid) { setEmailError('נדרשת כתובת מייל תקינה.'); return; }
    setEmailError(null);
    if (email.trim() !== selected.email.trim()) {
      setSaving(true);
      try { await onSaveEmail(selectedRole, email.trim()); }
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
        heading={`השלמת פרטים — ${subjectName}`}
        body={{ requestId, stage: 'prerequisites', niRole: subjectRole, recipientRole: selectedRole, stepId }}
        onSent={onDone}
        onClose={onClose}
      />
    );
  }

  return (
    <Modal title={`קישור להשלמת הפרטים של ${subjectName}`} onClose={onClose} width={460}>
      <div style={{ display: 'grid', gap: '.9rem', fontSize: 'var(--fs-14)' }}>
        {missingLabels.length > 0 && (
          <div style={{ color: 'var(--ink-3)', lineHeight: 1.6 }}>נדרשים: {missingLabels.join(', ')}</div>
        )}

        {recipients.length > 1 && (
          <div style={{ display: 'grid', gap: '.4rem' }}>
            <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>למי לשלוח?</span>
            {recipients.map(r => (
              <label key={r.role} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer' }}>
                <input type="radio" name="participant-recipient" checked={r.role === selectedRole}
                  onChange={() => selectRecipient(r.role)} />
                <span>{r.name || (r.role === 'spouse' ? 'בן/בת הזוג' : 'הלקוח')}</span>
              </label>
            ))}
          </div>
        )}

        {creating && <div style={{ color: 'var(--ink-3)' }}>יוצר קישור…</div>}
        {createError && <div style={{ color: 'var(--danger)', fontSize: 'var(--fs-13)' }}>{createError}</div>}

        {token && (
          <>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
                כתובת מייל של {selected.name || (selectedRole === 'spouse' ? 'בן/בת הזוג' : 'הלקוח')}
              </span>
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
