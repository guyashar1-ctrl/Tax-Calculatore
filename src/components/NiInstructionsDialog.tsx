// ─── הוראות אישור ב"ל עצמאיות — דיאלוג שליחה ────────────────────────────────
// docs/PLAN-BTL-SPOUSE-REPRESENTATION-REQUEST.md §4.5. שני שלבים בחלון אחד:
// (א) אישור/עריכת הכתובת הקנונית — נכתבת לכרטיס לפני השליחה, בדיוק כמו
//     PersonalContactsTab; (ב) התצוגה המקדימה הרגילה (EmailPreviewDialog),
//     שהיא גם שער השליחה עצמו. אין כפתור "נמסר ידנית" — היעדר כתובת אינו
//     מייצר התקדמות, וההשלמה נגזרת מראיה (confirmedAt), לא מהצהרה כאן.
import { useState } from 'react';
import Modal from './ui/Modal';
import EmailInput from './ui/EmailInput';
import EmailPreviewDialog from './EmailActivity/EmailPreviewDialog';
import { isValidEmail } from '../utils/email';
import type { PersonRole } from '../types';

interface Props {
  personName: string;
  personRole: PersonRole;
  idNumberMasked?: string;
  referenceNumber?: string;
  deadline?: string;
  requestId: string;
  stepId?: string;
  /** הכתובת הקנונית הנוכחית — מהכרטיס (spouseEmail/email). */
  currentEmail: string;
  /** כותב את הכתובת החדשה לכרטיס — לא ל-signers, לא לבקשה. */
  onSaveEmail: (email: string) => Promise<void>;
  onClose: () => void;
  onSent: () => void;
}

export default function NiInstructionsDialog({
  personName, personRole, idNumberMasked, referenceNumber, deadline,
  requestId, stepId, currentEmail, onSaveEmail, onClose, onSent,
}: Props) {
  const [email, setEmail] = useState(currentEmail);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const valid = isValidEmail(email);

  async function handleContinue() {
    if (!valid) { setError('נדרשת כתובת מייל תקינה.'); return; }
    setError(null);
    if (email.trim() !== currentEmail.trim()) {
      setSaving(true);
      try {
        await onSaveEmail(email.trim());
      } catch (e) {
        setSaving(false);
        setError(e instanceof Error ? e.message : 'שמירת הכתובת נכשלה.');
        return;
      }
      setSaving(false);
    }
    setPreviewing(true);
  }

  if (previewing) {
    return (
      <EmailPreviewDialog
        heading={`הוראות אישור בביטוח לאומי — ${personName}`}
        body={{ requestId, stage: 'ni_approve', niRole: personRole, stepId }}
        onSent={onSent}
        onClose={onClose}
      />
    );
  }

  return (
    <Modal title={`שליחת הוראות אישור — ${personName}`} onClose={onClose} width={460}>
      <div style={{ display: 'grid', gap: '.9rem', fontSize: 'var(--fs-14)' }}>
        <div style={{ color: 'var(--ink-3)', lineHeight: 1.6 }}>
          {personName}{idNumberMasked ? ` · ת.ז. ${idNumberMasked}` : ''}
          {referenceNumber && <><br />אסמכתא {referenceNumber}</>}
          {deadline && <> · יש לאשר עד {new Date(deadline).toLocaleDateString('he-IL')}</>}
        </div>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
            כתובת מייל של {personName}
          </span>
          <EmailInput
            value={email}
            onChange={e => { setEmail(e.target.value); setError(null); }}
            placeholder="name@example.com"
            disabled={saving}
            autoFocus
          />
          {!currentEmail && (
            <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
              אין עדיין כתובת שמורה — הזנה כאן תישמר בכרטיס.
            </span>
          )}
        </label>
        {error && <div style={{ color: 'var(--danger)', fontSize: 'var(--fs-13)' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
          <button type="button" className="ui-btn ui-btn-ghost" onClick={onClose}>ביטול</button>
          <button type="button" className="ui-btn ui-btn-primary" disabled={!valid || saving}
            onClick={() => void handleContinue()}>
            {saving ? 'שומר…' : 'המשך'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
