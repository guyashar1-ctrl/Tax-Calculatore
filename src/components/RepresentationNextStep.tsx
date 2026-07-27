// ─── "מה עכשיו" — הפעולה היחידה שנדרשת ברגע זה ────────────────────────────
// מסך הבקשה הציג חמישה כרטיסים באותה עוצמה, והפעולה הנכונה הייתה מפוזרת בין
// הסרגל העליון לכרטיסים. כאן יש מקום אחד שאומר: באיזה שלב אנחנו, מה נשאר לי
// לעשות, ומה כבר נעשה — עם כפתור אחד בלבד.

import { useState } from 'react';
import {
  RepresentationRequest,
  RepresentationExecution,
  RepSigner,
} from '../types';
import { getRequestSigners, effectiveSignStatus } from '../utils/repSigners';

interface Props {
  request: RepresentationRequest;
  niIncluded: boolean;
  onboardingLink: string;
  /** פותח את עורך הפקת הטופס (העלאת PDF + סימון אזורי חתימה) */
  onProduce: () => void;
  /** פותח את חדר החתימה של הרו"ח (חתימה + חותמת) */
  onStamp: () => void;
  onMarkSentToShaam: () => void;
  onMarkActive: () => void;
  /** שולח לחותם יחיד. מחזיר הודעת שגיאה בעברית, או null בהצלחה. */
  onSendToSigner: (signer: RepSigner) => Promise<string | null>;
  onSaveExecution: (execution: RepresentationExecution) => Promise<void> | void;
}

function fmt(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('he-IL');
}

export default function RepresentationNextStep({
  request, niIncluded, onboardingLink, onProduce, onStamp,
  onMarkSentToShaam, onMarkActive, onSendToSigner, onSaveExecution,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const exec = request.execution || {};
  const ni = exec.nationalInsurance || {};
  const it = exec.incomeTax || {};
  const status = request.status;
  const signers = getRequestSigners(request);
  const pendingSigners = signers.filter(s => effectiveSignStatus(request, s) === 'pending');

  // הזנה ברשויות הושלמה — תנאי להפקת הטופס
  const enteredEverywhere = !!it.enteredAt && (!niIncluded || !!ni.enteredAt);
  // בלי אסמכתא, מייל החתימה ייצא בלי חלק הביטוח הלאומי
  const niRefMissing = niIncluded && !ni.referenceNumber;

  async function handleSendAll() {
    setBusy(true);
    setNote(null);
    const failures: string[] = [];
    for (const s of pendingSigners) {
      const err = await onSendToSigner(s);
      if (err) failures.push(`${s.name || s.email}: ${err}`);
    }
    if (failures.length > 0) {
      setNote({ kind: 'err', text: failures.join(' · ') });
      setBusy(false);
      return;
    }
    const now = new Date().toISOString();
    await onSaveExecution({
      ...exec,
      signatureEmailSentAt: now,
      ...(niIncluded && ni.referenceNumber && !ni.instructionsSentAt
        ? { nationalInsurance: { ...ni, instructionsSentAt: now, instructionsSentWith: 'signature' as const } }
        : {}),
    });
    setNote({
      kind: 'ok',
      text: `נשלח ל-${pendingSigners.map(s => s.email).join(', ')}`,
    });
    setBusy(false);
  }

  // ── מה השלב, מה אני עושה, ומה הכפתור ──
  let tag = '';
  let title = '';
  let youDo = '';
  let action: React.ReactNode = null;
  let waiting = false;

  if (status === 'pending_fill') {
    tag = 'הכדור אצל הלקוח';
    title = 'ממתינים שהלקוח ימלא את פרטיו';
    youDo = 'אין מה לעשות כרגע. אם הלקוח מתעכב — שלחו לו שוב את הקישור.';
    waiting = true;
    action = (
      <button className="btn btn-secondary" onClick={async () => {
        try { await navigator.clipboard.writeText(onboardingLink); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
      }}>
        {copied ? '✓ הועתק' : '🔗 העתקת הקישור ללקוח'}
      </button>
    );
  } else if (status === 'awaiting_accountant' && !enteredEverywhere) {
    const left = [!it.enteredAt && 'מס הכנסה (שע״ם)', niIncluded && !ni.enteredAt && 'ביטוח לאומי'].filter(Boolean);
    tag = 'הכדור אצלי';
    title = 'להזין את פרטי הלקוח ברשויות';
    youDo = `הפרטים מוכנים להעתקה בכרטיס שמתחת. נשאר להזין ב: ${left.join(' ו-')}. אחרי ההזנה — לסמן שם מה בוצע.`;
    action = (
      <button className="btn btn-primary btn-lg" onClick={() => {
        document.getElementById('rep-authority-data')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }}>
        ⬇ לנתונים להעתקה
      </button>
    );
  } else if (status === 'awaiting_accountant') {
    tag = 'הכדור אצלי';
    title = 'להפיק את טופס ייפוי הכוח';
    youDo = 'העלו את טופס ייפוי הכוח וסמנו איפה כל אחד חותם. הטופס לא נשלח בשלב הזה — השליחה היא פעולה נפרדת.';
    action = <button className="btn btn-green btn-lg" onClick={onProduce}>📄 העלה טופס וסמן אזורי חתימה</button>;
  } else if (status === 'pending_signature' && !exec.signatureEmailSentAt) {
    tag = 'הכדור אצלי';
    title = 'לשלוח ללקוח';
    youDo = niIncluded
      ? `מייל אחד ל${pendingSigners.length > 1 ? 'כל חותם' : 'לקוח'}: קישור לחתימה על ייפוי הכוח, ומתחתיו האסמכתא והוראות האישור בביטוח הלאומי.`
      : `מייל אחד ל${pendingSigners.length > 1 ? 'כל חותם' : 'לקוח'} עם קישור לחתימה על ייפוי הכוח.`;
    action = (
      <>
        <button className="btn btn-green btn-lg" onClick={handleSendAll} disabled={busy || niRefMissing || pendingSigners.length === 0}>
          {busy ? 'שולח…' : `📧 שלח ללקוח${pendingSigners.length > 1 ? ` (${pendingSigners.length} חותמים)` : ''}`}
        </button>
        {niRefMissing && (
          <div style={{ marginTop: '.6rem', padding: '.55rem .8rem', background: 'var(--orange-light)', borderRadius: 'var(--radius)', fontSize: '.85rem', color: 'var(--gray-800)', lineHeight: 1.6 }}>
            ⚠ חסום עד שתזינו את מספר האסמכתא מביטוח לאומי — אחרת הלקוח יקבל מייל בלי חלק הב״ל, ותצטרכו לשלוח לו עוד אחד.
            {' '}
            <button className="btn btn-ghost btn-sm" style={{ padding: 0, textDecoration: 'underline' }}
              onClick={() => document.getElementById('rep-execution')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              להזנת האסמכתא
            </button>
          </div>
        )}
      </>
    );
  } else if (status === 'pending_signature') {
    tag = 'הכדור אצל הלקוח';
    title = 'ממתינים לחתימת הלקוח';
    youDo = `נשלח ב-${fmt(exec.signatureEmailSentAt)}. ${pendingSigners.length > 0 ? `ממתינים ל: ${pendingSigners.map(s => s.name).join(', ')}.` : 'כל החותמים חתמו.'}`;
    waiting = true;
    action = (
      <button className="btn btn-secondary" onClick={handleSendAll} disabled={busy || pendingSigners.length === 0}>
        {busy ? 'שולח…' : '📧 שלח תזכורת'}
      </button>
    );
  } else if (status === 'awaiting_stamp') {
    tag = 'הכדור אצלי';
    title = 'לחתום ולהוסיף חותמת';
    youDo = 'כל החותמים חתמו. נשאר להוסיף את החתימה והחותמת שלכם ולהפיק את הטופס הסופי.';
    action = <button className="btn btn-green btn-lg" onClick={onStamp}>✍️ חתום + הוסף חותמת</button>;
    if (request.signedPdfStoredId) {
      youDo = 'הטופס החתום מוכן. אחרי ההגשה בשע״ם — סמנו כאן.';
      action = <button className="btn btn-green btn-lg" onClick={onMarkSentToShaam}>📤 נשלח לשע"ם</button>;
    }
  } else if (status === 'awaiting_authorities') {
    tag = 'הכדור אצל הרשות';
    title = 'ממתינים לאישור הרשויות';
    youDo = 'הטופס הוגש. כשהייצוג יאושר בשע״ם — סמנו כאן.';
    waiting = true;
    action = <button className="btn btn-green" onClick={onMarkActive}>✓ סמן כמיוצג פעיל</button>;
  } else if (status === 'active') {
    tag = 'הושלם';
    title = 'הייצוג פעיל';
    youDo = niIncluded && !ni.confirmedAt
      ? 'מס הכנסה הושלם. בביטוח לאומי — ודאו שהלקוח אישר את האסמכתא, וסמנו בכרטיס הביצוע.'
      : 'הכול הושלם. הלקוח מיוצג מול כל הרשויות שנבחרו.';
  }

  const accent = waiting ? 'var(--gray-400, #9aa)' : status === 'active' ? 'var(--ok, #17845b)' : 'var(--blue)';

  return (
    <div className="card" style={{ marginBottom: '1rem', borderColor: accent, borderWidth: 2 }}>
      <div className="card-body" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div style={{ fontSize: '.72rem', letterSpacing: '.06em', color: accent, fontWeight: 700, marginBottom: '.25rem' }}>
            {tag}
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--gray-900, #111)', marginBottom: '.35rem' }}>
            {title}
          </div>
          <div style={{ fontSize: '.88rem', color: 'var(--gray-600)', lineHeight: 1.7 }}>{youDo}</div>
        </div>
        {action && <div style={{ flex: '0 0 auto', alignSelf: 'center' }}>{action}</div>}
      </div>
      {note && (
        <div className="card-body" style={{ paddingTop: 0 }}>
          <div style={{
            padding: '.55rem .8rem', borderRadius: 'var(--radius)', fontSize: '.85rem',
            background: note.kind === 'ok' ? 'var(--green-light, #eaf6f1)' : 'var(--red-light)',
            color: note.kind === 'ok' ? 'var(--ok, #17845b)' : 'var(--red)',
          }}>
            {note.kind === 'ok' ? '✓ ' : '⚠ '}{note.text}
          </div>
        </div>
      )}
    </div>
  );
}
