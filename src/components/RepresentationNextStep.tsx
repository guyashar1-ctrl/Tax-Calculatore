// ─── שורת המצב של הבקשה ─────────────────────────────────────────────────────
// מבט אחד: אצל מי הכדור ומה השלב. בלי כפתורים — כל הפעולות יושבות במשבצת של
// הרשות שאליה הן שייכות, כדי שלא יהיו חצי פעולות למעלה וחצי למטה.

import { RepresentationRequest } from '../types';
import { getRequestSigners, effectiveSignStatus } from '../utils/repSigners';

interface Props {
  request: RepresentationRequest;
  niIncluded: boolean;
}

export default function RepresentationNextStep({ request, niIncluded }: Props) {
  const exec = request.execution || {};
  const ni = exec.nationalInsurance || {};
  const it = exec.incomeTax || {};
  const status = request.status;
  const pending = getRequestSigners(request).filter(s => effectiveSignStatus(request, s) === 'pending');

  let ball: 'me' | 'client' | 'authority' | 'done' = 'me';
  let title = '';
  let sub = '';

  if (status === 'pending_fill') {
    ball = 'client';
    title = 'ממתינים שהלקוח ימלא את פרטיו';
    sub = 'הקישור נשלח. כשימלא — הפרטים ייכנסו אוטומטית לכרטיס.';
  } else if (status === 'awaiting_accountant' && !(it.enteredAt && (!niIncluded || ni.enteredAt))) {
    title = 'להזין את פרטי הלקוח ברשויות';
    const left = [!it.enteredAt && 'מס הכנסה', niIncluded && !ni.enteredAt && 'ביטוח לאומי'].filter(Boolean);
    sub = `נשאר להזין ב: ${left.join(' ו-')}. הפרטים להעתקה בכרטיס שמתחת.`;
  } else if (status === 'awaiting_accountant') {
    title = 'להפיק את טופס ייפוי הכוח';
    sub = 'במשבצת מס הכנסה — העלאת הטופס וסימון אזורי החתימה.';
  } else if (status === 'pending_signature' && !exec.signatureEmailSentAt) {
    title = 'לשלוח ללקוח';
    sub = niIncluded
      ? 'במשבצת מס הכנסה. מייל אחד לחתימה ולאישור בביטוח הלאומי.'
      : 'במשבצת מס הכנסה — מייל עם קישור לחתימה.';
  } else if (status === 'pending_signature') {
    ball = 'client';
    title = 'ממתינים לחתימת הלקוח';
    sub = pending.length > 0 ? `ממתינים ל: ${pending.map(s => s.name || s.email).join(', ')}.` : 'כל החותמים חתמו.';
  } else if (status === 'awaiting_stamp') {
    title = request.signedPdfStoredId ? 'להגיש את הטופס בשע״ם' : 'לחתום ולהוסיף חותמת';
    sub = 'במשבצת מס הכנסה.';
  } else if (status === 'awaiting_authorities') {
    ball = 'authority';
    title = 'ממתינים לאישור הרשויות';
    sub = 'הטופס הוגש בשע״ם.';
  } else if (status === 'active') {
    ball = 'done';
    title = 'הייצוג פעיל';
    sub = niIncluded && !ni.confirmedAt
      ? 'מס הכנסה הושלם. בביטוח לאומי — ודאו שהלקוח אישר את האסמכתא.'
      : 'הלקוח מיוצג מול כל הרשויות שנבחרו.';
  }

  const tone = {
    me: { c: 'var(--blue)', label: 'הכדור אצלי' },
    client: { c: 'var(--gray-500)', label: 'הכדור אצל הלקוח' },
    authority: { c: 'var(--gray-500)', label: 'הכדור אצל הרשות' },
    done: { c: 'var(--ok, #17845b)', label: 'הושלם' },
  }[ball];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap',
      padding: '.7rem .9rem', marginBottom: '1rem',
      borderInlineStart: `3px solid ${tone.c}`,
      background: 'var(--gray-50)', borderRadius: 'var(--radius)',
    }}>
      <span style={{
        fontSize: '.7rem', fontWeight: 700, color: '#fff', background: tone.c,
        padding: '.1rem .5rem', borderRadius: 999, whiteSpace: 'nowrap',
      }}>{tone.label}</span>
      <strong style={{ fontSize: '.95rem', color: 'var(--gray-900, #111)' }}>{title}</strong>
      <span style={{ fontSize: '.82rem', color: 'var(--gray-600)' }}>{sub}</span>
    </div>
  );
}
