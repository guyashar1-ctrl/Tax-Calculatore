import { useState } from 'react';
import {
  AuthorityRepresentations,
  RepAuthorityKind,
  RepLevel,
  REP_AUTHORITY_ORDER,
  REP_AUTHORITY_LABELS,
  REP_AUTHORITIES_WITH_LEVEL,
  REP_LEVEL_LABELS,
  FamilyStatus,
  FAMILY_STATUS_LABELS,
  FAMILY_STATUS_YEAR_LABELS,
  OnboardingPrefill,
} from '../types';
import { isValidIsraeliId } from '../utils/israeliId';

interface CreateResult { link: string; emailSent: boolean; emailError?: string; }

interface SpouseInput { name: string; email: string; idNumber?: string; }

export interface CreateRepresentationInput {
  name: string;
  email: string;
  areas: AuthorityRepresentations;
  spouse: SpouseInput | null;
  /** רק מה שהרו"ח בחר במפורש — קובע אילו שאלות לא יוצגו ללקוח. */
  prefill: OnboardingPrefill;
  /** false ⇒ מפיקים קישור בלבד; הרו"ח ישלח אותו בעצמו בוואטסאפ. */
  sendEmail: boolean;
}

interface Props {
  onCreate: (data: CreateRepresentationInput) => Promise<CreateResult>;
  onCancel: () => void;
  /** בודק אם המייל כבר בשימוש בייצוג פעיל/בתהליך. מחזיר הודעת חסימה, או null אם פנוי. */
  checkEmailConflict?: (email: string) => string | null;
  /** ערכי פתיחה — לזרימת "הפוך ליד ללקוח" מהצעת מחיר מאושרת. */
  initialName?: string;
  initialEmail?: string;
}

interface AreaState {
  selected: boolean;
  level: RepLevel;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

const hasLevel = (a: RepAuthorityKind) => REP_AUTHORITIES_WITH_LEVEL.includes(a);

const FAMILY_ORDER: FamilyStatus[] = ['single', 'married', 'divorced', 'widowed', 'singleParent'];

const CURRENT_YEAR = new Date().getFullYear();

export default function RepresentationOnboardingDialog({ onCreate, onCancel, checkEmailConflict, initialName, initialEmail }: Props) {
  const [name, setName] = useState(initialName ?? '');
  const [email, setEmail] = useState(initialEmail ?? '');
  // הגעה עם מייל ידוע (הפיכת ליד ללקוח) ⇒ שליחה במייל היא ברירת המחדל ההגיונית
  const [sendBy, setSendBy] = useState<'link' | 'email'>(initialEmail ? 'email' : 'link');
  // נפתח מראש רק כשהגענו לכאן עם פרטים ידועים (הפיכת ליד ללקוח)
  const [showDetails, setShowDetails] = useState(!!initialName);
  // '' = לא נבחר ⇒ הלקוח יישאל בטופס
  const [familyStatus, setFamilyStatus] = useState<FamilyStatus | ''>('');
  const [familyYear, setFamilyYear] = useState('');
  const [spouseName, setSpouseName] = useState('');
  const [spouseIdNumber, setSpouseIdNumber] = useState('');
  const [spouseEmail, setSpouseEmail] = useState('');
  const [sameSigningEmail, setSameSigningEmail] = useState(false);
  const [niCoversSpouse, setNiCoversSpouse] = useState(false);
  const [spouseBirthYear, setSpouseBirthYear] = useState('');
  const [areas, setAreas] = useState<Record<RepAuthorityKind, AreaState>>({
    incomeTax: { selected: true, level: 'primary' },
    withholding: { selected: false, level: 'primary' },
    vat: { selected: true, level: 'primary' },
    nationalInsurance: { selected: true, level: 'primary' },
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedKeys = REP_AUTHORITY_ORDER.filter(a => areas[a].selected);
  const emailConflict = checkEmailConflict && isValidEmail(email) ? checkEmailConflict(email) : null;
  const married = familyStatus === 'married';
  const yearLabel = familyStatus ? FAMILY_STATUS_YEAR_LABELS[familyStatus] : undefined;
  // הסימון נשמר גם אם מחליפים מצב משפחתי או מבטלים את ב"ל, ולכן הוא נגזר כאן
  // מכל התנאים במקום להתאפס בכל שינוי — כך חזרה ל"נשוי" לא מאבדת את הבחירה.
  const niForSpouse = married && areas.nationalInsurance.selected && niCoversSpouse;

  function toggleArea(a: RepAuthorityKind) {
    setAreas(prev => ({ ...prev, [a]: { ...prev[a], selected: !prev[a].selected } }));
  }

  function setLevel(a: RepAuthorityKind, level: RepLevel) {
    setAreas(prev => ({ ...prev, [a]: { ...prev[a], level } }));
  }

  function validate(): string | null {
    if (selectedKeys.length === 0) return 'יש לבחור לפחות רשות אחת לייצוג';
    // בשליחה במייל הכתובת היא תנאי; בקישור אין צורך בה כלל — הלקוח ימלא בעצמו.
    if (sendBy === 'email' && !email.trim()) return 'יש להזין כתובת מייל, או לעבור לשליחה בקישור';
    if (email.trim() && !isValidEmail(email)) return 'כתובת אימייל לא תקינה';
    if (emailConflict) return emailConflict;
    if (yearLabel && familyYear.trim()) {
      const y = Number(familyYear);
      if (!Number.isInteger(y) || y < 1900 || y > CURRENT_YEAR) return `${yearLabel} — יש להזין שנה תקינה`;
    }
    if (married && spouseIdNumber.trim() && !isValidIsraeliId(spouseIdNumber)) {
      return 'תעודת הזהות של בן/בת הזוג אינה תקינה';
    }
    if (married && spouseEmail.trim() && !isValidEmail(spouseEmail)) return 'כתובת אימייל של בן/בת הזוג לא תקינה';
    // בלי שם ות.ז. אי אפשר להזין ייפוי כוח בב"ל על שם בן/בת הזוג, ולכן אלה
    // הופכים לחובה ברגע שנלקח ייצוג גם עבורו/ה — ולא נשארים להשלמה בקישור.
    if (niForSpouse && !spouseName.trim()) {
      return 'ייצוג בב"ל לבן/בת הזוג — יש להזין את שמו/ה';
    }
    if (niForSpouse && !spouseIdNumber.trim()) {
      return 'ייצוג בב"ל לבן/בת הזוג — יש להזין את תעודת הזהות שלו/ה';
    }
    if (niForSpouse) {
      const by = Number(spouseBirthYear);
      if (!spouseBirthYear.trim() || !Number.isInteger(by) || by < 1900 || by > CURRENT_YEAR) {
        return 'ייצוג בב"ל לבן/בת הזוג — יש להזין שנת לידה תקינה';
      }
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    const built: AuthorityRepresentations = {};
    for (const a of selectedKeys) {
      built[a] = hasLevel(a)
        ? { status: 'in_process', level: areas[a].level }
        : { status: 'in_process' };
    }
    // ייצוג ב"ל לבן/בת הזוג תקף רק כשיש בן/בת זוג ידוע שאפשר להזין בב"ל
    if (niForSpouse) built.nationalInsurance = { ...built.nationalInsurance!, coversSpouse: true };

    const trimmedName = name.trim();
    const nameParts = trimmedName.split(/\s+/);
    const prefill: OnboardingPrefill = {};
    if (nameParts[0]) prefill.firstName = nameParts[0];
    if (nameParts.length > 1) prefill.lastName = nameParts.slice(1).join(' ');
    if (email.trim()) prefill.email = email.trim();
    if (familyStatus) prefill.familyStatus = familyStatus;
    if (yearLabel && familyYear.trim()) prefill.familyStatusYear = Number(familyYear);
    if (married && spouseName.trim()) prefill.spouseName = spouseName.trim();
    if (married && spouseIdNumber.trim()) prefill.spouseIdNumber = spouseIdNumber.trim();
    if (niForSpouse && spouseBirthYear.trim()) prefill.spouseBirthYear = Number(spouseBirthYear);

    // חותם שני נוצר רק אם ידוע שמו. אחרת — הלקוח יצהיר בטופס והחותם ייווצר אז.
    const spouse: SpouseInput | null = married && spouseName.trim()
      ? {
          name: spouseName.trim(),
          email: (sameSigningEmail ? email : spouseEmail).trim(),
          idNumber: spouseIdNumber.trim() || undefined,
        }
      : null;

    setBusy(true);
    setError(null);
    try {
      const res = await onCreate({
        name: trimmedName,
        email: email.trim(),
        areas: built,
        spouse,
        prefill,
        sendEmail: sendBy === 'email' && isValidEmail(email),
      });
      setResult(res);
    } catch (err) {
      console.error('Representation onboarding failed:', err);
      setError(extractErrorMessage(err));
      setBusy(false);
    }
  }

  function extractErrorMessage(e: unknown): string {
    if (typeof e === 'string') return e;
    if (e && typeof e === 'object') {
      const obj = e as { message?: string; details?: string; hint?: string };
      const parts = [obj.message, obj.details, obj.hint].filter(Boolean);
      if (parts.length > 0) return parts.join(' — ');
    }
    return 'שגיאה לא ידועה ביצירת בקשת הייצוג';
  }

  // ── מסך התוצאה: הקישור לשליחה ──────────────────────────────────────────
  if (result) {
    const greeting = name.trim() ? `היי ${name.trim()},` : 'היי,';
    const shareText =
      `${greeting}\n` +
      `כדי שאוכל להתחיל לטפל בייצוג שלך מול רשויות המס, יש למלא כמה פרטים בקישור המאובטח הבא:\n` +
      `${result.link}\n` +
      `לוקח פחות מדקה. תודה!`;
    const waHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    const canShare = typeof navigator !== 'undefined' && !!navigator.share;

    return (
      <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
        <div className="modal task-modal">
          <div className="modal-header">
            <h3>{'✓'} הקישור מוכן לשליחה</h3>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>{'✕'}</button>
          </div>
          <div className="modal-body">
            {result.emailSent && (
              <div style={{ padding: '.7rem .9rem', background: 'var(--green-light)', borderRadius: 'var(--radius)', color: 'var(--green-dark, var(--ok))', fontSize: '.9rem', marginBottom: '1rem' }}>
                {'\u{1F4E7}'} הקישור גם נשלח במייל אל <span dir="ltr">{email.trim()}</span>.
              </div>
            )}
            {!result.emailSent && result.emailError && (
              <div style={{ padding: '.7rem .9rem', background: 'var(--orange-light)', borderRadius: 'var(--radius)', color: 'var(--gray-800)', fontSize: '.85rem', marginBottom: '1rem', lineHeight: 1.6 }}>
                {'⚠'} המייל לא נשלח ({result.emailError}). אפשר לשלוח את הקישור בוואטסאפ.
              </div>
            )}

            <p style={{ fontSize: '.88rem', color: 'var(--gray-700)', lineHeight: 1.6, marginTop: 0 }}>
              שלחו את הקישור ללקוח. הוא ימלא שם, ת.ז., תאריך לידה, טלפון, מייל, כתובת ומצב משפחתי —
              והכל ייכנס אוטומטית לכרטיס שלו.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.6rem', margin: '1.1rem 0 .9rem' }}>
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="btn"
                style={{ background: '#25D366', color: '#fff', border: 'none', flex: '1 1 170px', justifyContent: 'center', textDecoration: 'none', fontWeight: 600 }}
              >
                {'\u{1F4AC}'} שליחה בוואטסאפ
              </a>
              {canShare && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: '1 1 130px', justifyContent: 'center' }}
                  onClick={() => { navigator.share({ text: shareText }).catch(() => {}); }}
                >
                  {'\u{1F4E4}'} שיתוף
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: '1 1 130px', justifyContent: 'center' }}
                onClick={async () => { try { await navigator.clipboard.writeText(result.link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ } }}
              >
                {copied ? '✓ הועתק' : '\u{1F517} העתקת קישור'}
              </button>
            </div>

            <input
              readOnly
              value={result.link}
              dir="ltr"
              style={{ width: '100%', textAlign: 'left', fontSize: '.78rem', fontFamily: 'var(--font-mono, monospace)' }}
              onFocus={e => e.currentTarget.select()}
            />
            <p style={{ fontSize: '.75rem', color: 'var(--gray-500)', marginBottom: 0 }}>הקישור ייחודי ללקוח זה ומאובטח.</p>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-primary" onClick={onCancel}>סיום</button>
          </div>
        </div>
      </div>
    );
  }

  // ── מסך היצירה ─────────────────────────────────────────────────────────
  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form className="modal task-modal" onSubmit={handleSubmit}>
        <div className="modal-header">
          <h3>{'\u{1F4E8}'} קישור ייצוג חדש</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>{'✕'}</button>
        </div>

        <div className="modal-body">
          {/* רשויות — הבחירה היחידה שנדרשת */}
          <label style={{ display: 'block', fontWeight: 600, fontSize: '.85rem', color: 'var(--gray-700)', marginBottom: '.5rem' }}>
            אילו רשויות לייצג? <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            {REP_AUTHORITY_ORDER.map(a => {
              const st = areas[a];
              return (
                <div
                  key={a}
                  onClick={() => !busy && toggleArea(a)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '.75rem',
                    padding: '.7rem .8rem',
                    border: `1px solid ${st.selected ? 'var(--blue)' : 'var(--gray-200)'}`,
                    background: st.selected ? 'var(--blue-light)' : 'var(--card)',
                    borderRadius: 'var(--radius)',
                    cursor: busy ? 'default' : 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={st.selected}
                    onChange={() => toggleArea(a)}
                    onClick={(e) => e.stopPropagation()}
                    disabled={busy}
                  />
                  <span style={{ flex: 1, fontSize: '.95rem', fontWeight: st.selected ? 600 : 400 }}>
                    {REP_AUTHORITY_LABELS[a]}
                  </span>
                  {hasLevel(a) ? (
                    <select
                      value={st.level}
                      onChange={(e) => setLevel(a, e.target.value as RepLevel)}
                      onClick={(e) => e.stopPropagation()}
                      disabled={busy || !st.selected}
                      style={{ width: 'auto', minWidth: 120 }}
                    >
                      <option value="primary">{REP_LEVEL_LABELS.primary}</option>
                      <option value="secondary">{REP_LEVEL_LABELS.secondary}</option>
                    </select>
                  ) : (
                    <span style={{ fontSize: '.78rem', color: 'var(--gray-500)' }}>{'ℹ'} ייצוג יחיד</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* איך הקישור מגיע ללקוח — הבחירה קובעת אם המייל נדרש */}
          <label style={{ display: 'block', fontWeight: 600, fontSize: '.85rem', color: 'var(--gray-700)', margin: '1.25rem 0 .5rem' }}>
            איך לשלוח ללקוח?
          </label>
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
            {([
              { key: 'link' as const, icon: '\u{1F517}', title: 'קישור לשליחה', sub: 'וואטסאפ, SMS או העתקה — בלי מייל' },
              { key: 'email' as const, icon: '\u{1F4E7}', title: 'שליחה במייל', sub: 'המערכת שולחת אוטומטית ללקוח' },
            ]).map(opt => {
              const sel = sendBy === opt.key;
              return (
                <div
                  key={opt.key}
                  onClick={() => !busy && setSendBy(opt.key)}
                  style={{
                    flex: '1 1 200px', padding: '.7rem .8rem', cursor: busy ? 'default' : 'pointer',
                    border: `1px solid ${sel ? 'var(--blue)' : 'var(--gray-200)'}`,
                    background: sel ? 'var(--blue-light)' : 'var(--card)',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  <div style={{ fontSize: '.92rem', fontWeight: sel ? 700 : 500 }}>{opt.icon} {opt.title}</div>
                  <div style={{ fontSize: '.75rem', color: 'var(--gray-500)', marginTop: 2 }}>{opt.sub}</div>
                </div>
              );
            })}
          </div>

          {sendBy === 'email' && (
            <div className="form-group" style={{ marginTop: '.75rem' }}>
              <label className="required">אימייל הלקוח</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
                dir="ltr"
                disabled={busy}
                autoFocus
                style={emailConflict ? { borderColor: 'var(--red)' } : undefined}
              />
              {emailConflict && (
                <div style={{ marginTop: '.4rem', fontSize: '.8rem', color: 'var(--red)', lineHeight: 1.5 }}>
                  {'⛔'} {emailConflict}
                </div>
              )}
              <div style={{ fontSize: '.78rem', color: 'var(--gray-500)', marginTop: '.35rem' }}>
                הקישור יוצג גם כאן בסוף, כדי שתוכל לשלוח אותו גם בוואטסאפ.
              </div>
            </div>
          )}

          {/* כל השאר אופציונלי — מה שלא ימולא כאן, הלקוח ימלא בקישור */}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginTop: '1.1rem', padding: 0 }}
            onClick={() => setShowDetails(v => !v)}
            disabled={busy}
          >
            {showDetails ? '▾' : '▸'} פרטים שכבר ידועים לי (לא חובה)
          </button>
          <div style={{ fontSize: '.78rem', color: 'var(--gray-500)', marginTop: '.25rem', lineHeight: 1.5 }}>
            כל מה שלא תמלא כאן — הלקוח ימלא בעצמו בקישור.
          </div>

          {showDetails && (
            <div style={{ marginTop: '.9rem', padding: '.85rem .9rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)', background: 'var(--gray-50)' }}>
              <div className="form-group">
                <label>שם הלקוח</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="שם פרטי ושם משפחה"
                  disabled={busy}
                />
              </div>

              <div className="form-group" style={{ marginTop: '.5rem' }}>
                <label>מצב משפחתי</label>
                <select
                  value={familyStatus}
                  onChange={(e) => { setFamilyStatus(e.target.value as FamilyStatus | ''); setFamilyYear(''); }}
                  disabled={busy}
                >
                  <option value="">{'—'} שהלקוח יבחר {'—'}</option>
                  {FAMILY_ORDER.map(f => (
                    <option key={f} value={f}>{FAMILY_STATUS_LABELS[f]}</option>
                  ))}
                </select>
                <div style={{ fontSize: '.75rem', color: 'var(--gray-500)', marginTop: 4 }}>
                  כפי שרשום בתעודת הזהות — הרשויות בודקות מול מרשם האוכלוסין.
                </div>
              </div>

              {yearLabel && (
                <div className="form-group" style={{ marginTop: '.5rem' }}>
                  <label>{yearLabel}</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={familyYear}
                    onChange={(e) => setFamilyYear(e.target.value)}
                    placeholder={`לדוגמה: ${CURRENT_YEAR - 5}`}
                    min={1900}
                    max={CURRENT_YEAR}
                    disabled={busy}
                  />
                </div>
              )}

              {married && (
                <div style={{ marginTop: '.75rem', paddingTop: '.75rem', borderTop: '1px solid var(--gray-200)' }}>
                  <div className="form-grid form-grid-2">
                    <div className="form-group">
                      <label>שם בן/בת הזוג</label>
                      <input type="text" value={spouseName} onChange={e => setSpouseName(e.target.value)} placeholder="שם פרטי ושם משפחה" disabled={busy} />
                    </div>
                    <div className="form-group">
                      <label>ת.ז. בן/בת הזוג</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={9}
                        dir="ltr"
                        value={spouseIdNumber}
                        onChange={e => setSpouseIdNumber(e.target.value.replace(/\D/g, ''))}
                        placeholder="9 ספרות"
                        disabled={busy}
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: '.78rem', color: 'var(--gray-500)', marginBottom: '.5rem' }}>
                    נשוי/אה {'←'} שני בני הזוג חותמים על ייפוי הכוח. מה שלא תמלא — הלקוח ימלא בקישור.
                  </div>

                  {/* חתימה ≠ ייצוג. בב"ל לכל מבוטח תיק נפרד, ולכן ייצוג של שני
                      בני הזוג הוא שני ייפויי כוח ושתי אסמכתאות — כאן בוחרים. */}
                  {areas.nationalInsurance.selected && (
                    <div style={{
                      padding: '.6rem .7rem', marginBottom: '.5rem', borderRadius: 'var(--radius)',
                      border: `1px solid ${niCoversSpouse ? 'var(--blue)' : 'var(--gray-200)'}`,
                      background: niCoversSpouse ? 'var(--blue-light)' : 'var(--gray-50)',
                    }}>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem', cursor: busy ? 'default' : 'pointer' }}>
                        <input type="checkbox" checked={niCoversSpouse} disabled={busy}
                          onChange={e => setNiCoversSpouse(e.target.checked)} style={{ marginTop: 3 }} />
                        <span>
                          <span style={{ fontSize: '.88rem', fontWeight: 600 }}>
                            {'🛡'} לקחת ייצוג בביטוח לאומי גם לבן/בת הזוג
                          </span>
                          <span style={{ display: 'block', fontSize: '.76rem', color: 'var(--gray-600)', lineHeight: 1.6, marginTop: 2 }}>
                            בביטוח לאומי לכל אחד תיק נפרד: יוזנו שני ייפויי כוח, יתקבלו שתי אסמכתאות,
                            וכל אחד יאשר את שלו. במס הכנסה ובמע"מ אין צורך — שם ייצוג אחד מכסה את התא המשפחתי.
                          </span>
                        </span>
                      </label>
                      {/* ארבעת השדות של "הוספת ייפוי כח מבוטח" בב"ל: ת.ז., שנת
                          לידה, שם פרטי ומשפחה. השם והת.ז. נאספים למעלה. */}
                      {niCoversSpouse && (
                        <div className="form-group" style={{ marginTop: '.6rem', marginBottom: 0 }}>
                          <label>שנת לידה של בן/בת הזוג</label>
                          <input
                            type="number" inputMode="numeric" dir="ltr"
                            value={spouseBirthYear}
                            onChange={e => setSpouseBirthYear(e.target.value)}
                            placeholder={`לדוגמה: ${CURRENT_YEAR - 40}`}
                            min={1900} max={CURRENT_YEAR} disabled={busy}
                          />
                          <div style={{ fontSize: '.75rem', color: 'var(--gray-500)', marginTop: 3 }}>
                            נדרשת בטופס ייפוי הכוח של הביטוח הלאומי.
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {spouseName.trim() && (
                    <>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: busy ? 'default' : 'pointer', fontSize: '.85rem', color: 'var(--gray-700)', margin: '.6rem 0' }}>
                        <input type="checkbox" checked={sameSigningEmail} onChange={e => setSameSigningEmail(e.target.checked)} disabled={busy || !email.trim()} />
                        {'✉'} שלח את שתי בקשות החתימה לאותו מייל
                      </label>
                      {!sameSigningEmail && (
                        <div className="form-group">
                          <label>אימייל של בן/בת הזוג</label>
                          <input type="email" value={spouseEmail} onChange={e => setSpouseEmail(e.target.value)} placeholder="spouse@example.com" dir="ltr" disabled={busy} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* מה ייווצר */}
          <div style={{
            marginTop: '1.25rem',
            padding: '.75rem .9rem',
            background: 'var(--gray-50)',
            borderRadius: 'var(--radius)',
            fontSize: '.83rem',
            color: 'var(--gray-700)',
          }}>
            <div style={{ fontWeight: 600, marginBottom: '.4rem' }}>{'✨'} מה ייווצר</div>
            <div>{'✓'} קישור אישי {sendBy === 'email' ? '— וגם יישלח במייל אוטומטית' : 'לשליחה בוואטסאפ'}</div>
            <div>{'✓'} כרטיס לקוח {name.trim() ? `— ${name.trim()}` : '— יקבל שם כשהלקוח ימלא'}</div>
            <div>
              {'✓'} {selectedKeys.length > 0
                ? `${selectedKeys.length} סטטוסי ייצוג "בתהליך": ${selectedKeys.map(a => REP_AUTHORITY_LABELS[a]).join(', ')}`
                : 'בחר רשויות כדי ליצור סטטוסי ייצוג'}
            </div>
            <div>{'✓'} משימה פנימית למעקב</div>
            {married && spouseName.trim() && <div>{'✓'} חותם שני — {spouseName.trim()}</div>}
            {niForSpouse && <div>{'✓'} ייצוג נפרד בביטוח לאומי לבן/בת הזוג — שתי אסמכתאות</div>}
          </div>

          {error && (
            <div style={{
              marginTop: '1rem',
              padding: '.65rem .85rem',
              background: 'var(--red-light)',
              color: 'var(--red)',
              borderRadius: 'var(--radius)',
              fontSize: '.875rem',
            }}>
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            ביטול
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !!emailConflict || selectedKeys.length === 0}>
            {busy ? 'מפיק…' : '\u{1F517} הפקת קישור'}
          </button>
        </div>
      </form>
    </div>
  );
}
