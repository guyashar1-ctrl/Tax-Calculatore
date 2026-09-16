// ─── שליחת קישור להשלמת פרטים — דיאלוג ──────────────────────────────────────
// docs/PLAN-REQUEST-PREREQUISITES-INFORMATION-COLLECTION.md §7.2 + 167 (נמען
// ≠ בעלות). הדיאלוג עצמו לא יוצר שום דבר בר-קיימא — רק מציג נמענים אפשריים
// וכתובת מייל. הקישור נוצר בשרת רק כשמבצעים פעולה שבאמת צריכה אותו: «שלח
// במייל» או «העתק קישור» (בדיוק לפי §7.2: כתובת נקבעת/נשמרת *לפני* היצירה;
// «העתק קישור» היא החלופה-בלי-מייל). פתיחה/סגירה/החלפת נמען לא יוצרות ולא
// מבטלות שום קישור — רק create_participant_link בפועל עושה זאת.
//
// ‼ 167: כשהנושא (של מי הפרטים) הוא בן/בת הזוג, יש שני נמענים אפשריים —
// הנושא עצמו, או בעל הכרטיס שממלא במקומו/ה. הבחירה משנה רק כתובת/שם; אותו
// step_id, אותו requirement_key/field_keys, אותה בקשה. כשיש נמען אחד בלבד
// (הנושא הוא בעל הכרטיס עצמו) אין ברירה להציג — בדיוק ההתנהגות מלפני 167.
import { useState } from 'react';
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

  // ‼ token/tokenRole משקפים קישור שכבר *נוצר בשרת*, לא את הבחירה הנוכחית
  // בלבד. כשtokenRole תואם ל-selectedRole אין צורך לקרוא לשרת שוב — העתקה
  // ואז שליחה לאותו נמען לא מסובבות את הקישור פעמיים.
  const [token, setToken] = useState<string | null>(null);
  const [tokenRole, setTokenRole] = useState<'client' | 'spouse' | null>(null);
  const [linkingFor, setLinkingFor] = useState<'copy' | 'send' | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [email, setEmail] = useState(selected.email);
  const [saving, setSaving] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [copied, setCopied] = useState(false);

  function selectRecipient(role: 'client' | 'spouse') {
    if (role === selectedRole) return;
    setSelectedRole(role);
    setEmail(recipients.find(r => r.role === role)?.email ?? '');
    setEmailError(null);
    setLinkError(null);
    setCopied(false);
  }

  const valid = isValidEmail(email);

  /** יוצר קישור בשרת — רק אם אין כבר קישור-שנוצר שתואם לנמען הזה. */
  async function ensureLink(role: 'client' | 'spouse', kind: 'copy' | 'send'): Promise<string | null> {
    if (token && tokenRole === role) return token;
    setLinkingFor(kind); setLinkError(null);
    const { data, error } = await supabase.rpc('create_participant_link', {
      p_step_id: stepId, p_recipient_role: role,
    });
    setLinkingFor(null);
    if (error || !data?.ok) { setLinkError('יצירת הקישור נכשלה. נסו שוב.'); return null; }
    const t = String(data.token);
    setToken(t); setTokenRole(role);
    return t;
  }

  async function handleSendEmail() {
    if (!valid) { setEmailError('נדרשת כתובת מייל תקינה.'); return; }
    setEmailError(null);
    if (email.trim() !== selected.email.trim()) {
      setSaving(true);
      try { await onSaveEmail(selectedRole, email.trim()); }
      catch (e) { setSaving(false); setEmailError(e instanceof Error ? e.message : 'שמירת הכתובת נכשלה.'); return; }
      setSaving(false);
    }
    const t = await ensureLink(selectedRole, 'send');
    if (!t) return;
    setPreviewing(true);
  }

  async function handleCopy() {
    const t = await ensureLink(selectedRole, 'copy');
    if (!t) return;
    const linkUrl = `${window.location.origin}${window.location.pathname}?participant=${t}`;
    try { await navigator.clipboard.writeText(linkUrl); } catch { /* בלי clipboard — הקישור עדיין נוצר, רק ההעתקה נכשלה */ }
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

  const busy = linkingFor !== null;

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

        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
            כתובת מייל של {selected.name || (selectedRole === 'spouse' ? 'בן/בת הזוג' : 'הלקוח')}
          </span>
          <EmailInput
            value={email}
            onChange={e => { setEmail(e.target.value); setEmailError(null); }}
            placeholder="name@example.com"
            disabled={saving || busy}
            autoFocus
          />
        </label>
        {emailError && <div style={{ color: 'var(--danger)', fontSize: 'var(--fs-13)' }}>{emailError}</div>}
        {linkError && <div style={{ color: 'var(--danger)', fontSize: 'var(--fs-13)' }}>{linkError}</div>}
        <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="ui-btn ui-btn-ghost" onClick={onClose}>ביטול</button>
          <button type="button" className="ui-btn" disabled={copied || busy} onClick={() => void handleCopy()}>
            {linkingFor === 'copy' ? 'יוצר קישור…' : copied ? 'הועתק ✓' : 'העתק קישור'}
          </button>
          <button type="button" className="ui-btn ui-btn-primary" disabled={!valid || saving || busy}
            onClick={() => void handleSendEmail()}>
            {linkingFor === 'send' ? 'יוצר קישור…' : saving ? 'שומר…' : 'שלח במייל'}
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
      </div>
    </Modal>
  );
}
