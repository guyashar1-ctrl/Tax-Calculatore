// ─── שער תנאי-קדם — מקור יחיד לגזירה ולפעולה ────────────────────────────────
// docs/PLAN-REQUEST-PREREQUISITES-INFORMATION-COLLECTION.md (165, 167). עוטף
// כל משטח שמציע פעולת ביצוע לבקשת ייצוג-ברשות — כרטיס «בקשות» (OnboardingTab)
// **וגם** מרכז ביצוע הייצוג (RepresentationExecutionCenter): כל עוד
// step.payload.prerequisites.missing לא ריק, ה-children (פקדי הביצוע עצמם —
// הזנה בפורטל, אסמכתא, מועד, שליחת הוראות אישור) לא מוצגים בכלל, רק המסך
// הזה. אחרת מרכז הביצוע היה משטח עוקף: תנאי-הקדם נאכפים בכרטיס אבל לא שם.
//
// ‼ אין כאן היגיון תנאי-קדם משלה — רק קריאה של step.payload.prerequisites
// (הנגזר בשרת) ושתי הפעולות הקיימות: complete_request_prerequisites (RPC)
// ו-ParticipantLinkDialog (קישור-משתתף). מסך שני שרוצה לאכוף את הגבול הזה
// עוטף את הפקדים שלו כאן ולא מממש שוב את הגזירה/הטופס/הדיאלוג.
//
// ‼ 167 (נמען ≠ בעלות): הבקשה שייכת תמיד לכרטיס הבעלים; הנושא (subjectRole)
// הוא של מי הפרטים, לא משתנה לעולם. קישור-המשתתף יכול להישלח לנושא עצמו או
// לבעל הכרטיס (שממלא במקומו/ה) — זו רק כתובת אחרת לאותה עבודה בדיוק, ולכן
// שני האנשים (client/spouse) מועברים לכאן ומטה, לא רק "מי שממלא".

import { useState } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import { isStepOpen, type OnboardingStep } from '../types/onboarding';
import { supabase } from '../lib/supabase';
import ParticipantLinkDialog from './ParticipantLinkDialog';

// ‼ תוויות זהות למרשם requirements_for_step ב-SQL — לתצוגה בלבד.
export const PREREQUISITE_FIELD_LABELS: Record<string, string> = {
  spouseFirstName: 'שם פרטי', spouseLastName: 'שם משפחה',
  spouseIdNumber: 'תעודת זהות', spouseBirthYear: 'שנת לידה',
  firstName: 'שם פרטי', lastName: 'שם משפחה', idNumber: 'תעודת זהות', birthDate: 'תאריך לידה',
};
const PREREQUISITE_FIELD_KIND: Record<string, 'text' | 'idNumber' | 'year' | 'date'> = {
  spouseFirstName: 'text', spouseLastName: 'text', spouseIdNumber: 'idNumber', spouseBirthYear: 'year',
  firstName: 'text', lastName: 'text', idNumber: 'idNumber', birthDate: 'date',
};

interface StepPrerequisites {
  missing?: string[];
  required?: string[];
  link?: {
    sentAt?: string | null; openedAt?: string | null; expiresAt?: string | null;
    recipientRole?: 'client' | 'spouse' | null;
  } | null;
}

/** זהות אדם על הכרטיס — לתצוגה, לברירת נמען, ולשמירת מייל. */
export interface PrerequisitePerson {
  role: 'client' | 'spouse';
  name: string;
  email: string;
}

const noteStyle: CSSProperties = { fontSize: 'var(--fs-13)', color: 'var(--ink-3)', lineHeight: 1.6 };

interface Props {
  step: OnboardingStep;
  /** ערכי השדות הקנוניים הקיימים היום — למילוי מראש של הטופס. */
  currentValues: Record<string, string | undefined>;
  /** בעל הכרטיס — נמען אפשרי גם כשהנושא הוא בן/בת הזוג. */
  client: PrerequisitePerson;
  /** בן/בת הזוג — נמען אפשרי כשהוא/היא הנושא. חסר/ריק כשאין בן/בת זוג בכלל. */
  spouse: PrerequisitePerson;
  onSaveEmail: (role: 'client' | 'spouse', email: string) => Promise<void>;
  /** נקרא אחרי שמירה מוצלחת (משרד) או פתיחת/סגירת קישור-משתתף — לרענון המסך. */
  onChanged?: () => void;
  /** פקדי הביצוע עצמם — מוצגים רק כשאין תנאי-קדם חסרים. */
  children: ReactNode;
}

export default function PrerequisiteGate({ step, currentValues, client, spouse, onSaveEmail, onChanged, children }: Props) {
  const open = isStepOpen(step.status);
  const prereqs = step.payload?.prerequisites as StepPrerequisites | undefined;
  const missing = prereqs?.missing ?? [];
  const required = prereqs?.required ?? [];
  const gated = open && missing.length > 0;

  const [filling, setFilling] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  if (!gated) return <>{children}</>;

  const subjectRole: 'client' | 'spouse' = step.payload?.subjectRole === 'spouse' ? 'spouse' : 'client';
  const subject = subjectRole === 'spouse' ? spouse : client;
  const subjectName = subject.name || String(step.payload?.subjectName ?? 'הנושא');
  // ‼ 167: נמען אפשרי שני קיים רק כשהנושא הוא בן/בת הזוג — כשהנושא הוא בעל
  // הכרטיס עצמו, אין "עוד מישהו" לבחור, וזה בדיוק מה שהיה לפני 167.
  const recipients: PrerequisitePerson[] = subjectRole === 'spouse' ? [spouse, client] : [client];

  const linkRecipientRole = prereqs?.link?.recipientRole ?? subjectRole;
  const sentToSubject = linkRecipientRole === subjectRole;
  const recipientPerson = linkRecipientRole === 'spouse' ? spouse : client;

  function startFilling() {
    setValues(Object.fromEntries(required.map(k => [k, currentValues[k] ?? ''])));
    setFormError(null);
    setFilling(true);
  }

  async function submitPrereqs() {
    setBusy(true); setFormError(null);
    const { data, error } = await supabase.rpc('complete_request_prerequisites', {
      p_step_id: step.id, p_values: values,
    });
    setBusy(false);
    if (error || !data?.ok) {
      const reason = (data as { reason?: string } | null)?.reason;
      setFormError(reason === 'invalid_value' ? 'אחד השדות אינו תקין — בדקו את הפורמט.' : 'השמירה נכשלה. נסו שוב.');
      return;
    }
    setFilling(false);
    onChanged?.();
  }

  return (
    <>
      <div style={noteStyle}>
        {`נדרשים פרטים מ${subjectName} כדי להמשיך — חסר: ${missing.map(k => PREREQUISITE_FIELD_LABELS[k] ?? k).join(', ')}.`}
      </div>
      {prereqs?.link?.sentAt && !filling && (
        <div style={{ ...noteStyle, marginTop: '.25rem' }}>
          {sentToSubject
            ? `נשלח ל${subjectName} להשלמת הפרטים שלו/שלה`
            : `נשלח ל${recipientPerson.name || 'הנמען'} להשלמת הפרטים של ${subjectName}`}
          {` · ${new Date(prereqs.link.sentAt).toLocaleDateString('he-IL')}${prereqs.link.openedAt ? ' · נפתח' : ''} — טרם הוגש.`}
        </div>
      )}

      {!filling && (
        <div style={{ marginTop: '.55rem', display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-sm btn-primary" onClick={startFilling}>
            מלא פרטים עכשיו
          </button>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setLinkOpen(true)}>
            {prereqs?.link?.sentAt ? 'שלח שוב' : 'שלח להשלמת פרטים'}
          </button>
        </div>
      )}

      {filling && (
        <div style={{ marginTop: '.55rem', display: 'grid', gap: '.55rem' }}>
          {required.map(key => (
            <label key={key} style={{ display: 'grid', gap: 2, fontSize: 'var(--fs-13)' }}>
              <span style={{ color: 'var(--ink-3)' }}>{PREREQUISITE_FIELD_LABELS[key] ?? key}</span>
              <input className="input"
                type={PREREQUISITE_FIELD_KIND[key] === 'date' ? 'date' : 'text'}
                inputMode={PREREQUISITE_FIELD_KIND[key] === 'idNumber' || PREREQUISITE_FIELD_KIND[key] === 'year' ? 'numeric' : undefined}
                dir={PREREQUISITE_FIELD_KIND[key] === 'date' ? 'ltr' : undefined}
                value={values[key] ?? ''}
                onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))} />
            </label>
          ))}
          {formError && <div className="txf-qt-err">{formError}</div>}
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void submitPrereqs()}>
              {busy ? 'שומר…' : 'שמירה'}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy}
              onClick={() => { setFilling(false); setFormError(null); }}>
              ביטול
            </button>
          </div>
        </div>
      )}

      {linkOpen && (
        <ParticipantLinkDialog
          subjectName={subjectName}
          subjectRole={subjectRole}
          missingLabels={missing.map(k => PREREQUISITE_FIELD_LABELS[k] ?? k)}
          requestId={String(step.payload?.representationRequestId ?? '')}
          stepId={step.id}
          recipients={recipients}
          defaultRecipientRole={linkRecipientRole}
          onSaveEmail={onSaveEmail}
          onClose={() => setLinkOpen(false)}
          onDone={() => { setLinkOpen(false); onChanged?.(); }}
        />
      )}
    </>
  );
}
