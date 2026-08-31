import { useState } from 'react';
import {
  AuthorityRepresentations,
  RepAuthorityKind,
  RepLevel,
  REP_AUTHORITY_ORDER,
  REP_AUTHORITY_LABELS,
  REP_AUTHORITIES_WITH_LEVEL,
  REP_AUTHORITIES_WITH_TARGETS,
  REP_LEVEL_LABELS,
  RepTarget,
  FamilyStatus,
  FAMILY_STATUS_LABELS,
  FAMILY_STATUS_YEAR_LABELS,
  OnboardingPrefill,
} from '../types';
import { scopeLines } from '../utils/repScope';
import { isValidIsraeliId } from '../utils/israeliId';
import { isValidEmail } from '../utils/email';
import EmailInput from './ui/EmailInput';
import InfoLines from './ui/InfoLines';

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
  /** הלקוח עובר מרו"ח אחר — נרשם על הכרטיס, וממנו נגזר מכתב השחרור. */
  hasPreviousAccountant: boolean;
  prevAccountant?: { name?: string; email?: string; phone?: string };
}

interface Props {
  onCreate: (data: CreateRepresentationInput) => Promise<CreateResult>;
  onCancel: () => void;
  /** בודק אם המייל כבר משויך לאדם אחר. מחזיר הודעה מייעצת בלבד — לא חוסמת. */
  checkEmailConflict?: (email: string) => string | null;
  /** ערכי פתיחה — לזרימת "הפוך ליד ללקוח" מהצעת מחיר מאושרת. */
  initialName?: string;
  initialEmail?: string;
  /**
   * הלקוח עובר מרו"ח אחר. הרו"ח הקודם עדיין תופס את מקום המייצג הראשי
   * ברשויות, ולכן הייצוג נפתח כמייצג משני עד לשחרורו.
   * זהו ערך פתיחה בלבד — בדיאלוג עצמו אפשר לסמן ולבטל.
   */
  isTransfer?: boolean;
  /** פרטי הרו"ח הקודם שכבר ידועים (מהליד) — ערכי פתיחה לשדות. */
  initialPrevAccountant?: { name?: string; email?: string; phone?: string };
  /**
   * רשויות שכבר קיים להן ייצוג — של האדם עצמו, או של הזוג דרך בן/בת הזוג
   * המקושר/ת (150). מוצג כשורת מידע קבועה ולא כצ'קבוקס: הרו"ח לא אמור
   * לזכור מאיפה זה הגיע, ולא מבקשים את זה שוב. ‼ מחושב מראש ע"י הקורא
   * (App.tsx) ולא כאן — הדיאלוג לא צריך לדעת על כרטיסים מקושרים בעצמו.
   */
  alreadyRepresented?: Partial<Record<RepAuthorityKind, string>>;
}

interface AreaState {
  selected: boolean;
  level: RepLevel;
  /** מע"מ/ניכויים בלבד — עבור מי. תמיד לפחות אחד כשהרשות מסומנת. */
  targets: RepTarget[];
}

const hasLevel = (a: RepAuthorityKind) => REP_AUTHORITIES_WITH_LEVEL.includes(a);

const FAMILY_ORDER: FamilyStatus[] = ['single', 'married', 'divorced', 'widowed', 'singleParent'];

const CURRENT_YEAR = new Date().getFullYear();

export default function RepresentationOnboardingDialog({
  onCreate, onCancel, checkEmailConflict, initialName, initialEmail, isTransfer = false, initialPrevAccountant,
  alreadyRepresented,
}: Props) {
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
  const [spouseBirthYear, setSpouseBirthYear] = useState('');
  // ‼ ברירת המחדל היא הלקוח — כך זה ברוב התיקים, וכך זה נולד עד היום ממילא.
  const [registeredSpouse, setRegisteredSpouse] = useState<'client' | 'spouse'>('client');
  const [transfer, setTransfer] = useState(isTransfer);
  const [prevAcc, setPrevAcc] = useState({
    name: initialPrevAccountant?.name ?? '',
    email: initialPrevAccountant?.email ?? '',
    phone: initialPrevAccountant?.phone ?? '',
  });
  // ‼ ראשי גם במעבר מרו"ח אחר (הכרעת גיא 2026-08-18): במעבר נקי אין סיבה
  // להמתין כמשני. משני נרשמים רק כשנשארת אצל הקודם עבודה חוסמת (דוח שנתי /
  // הצהרת הון) — וזה נגזר במכתב העברת הטיפול, לא כאן. אפשר לשנות ידנית.
  const [areas, setAreas] = useState<Record<RepAuthorityKind, AreaState>>(() => ({
    incomeTax: { selected: true, level: 'primary', targets: ['client'] },
    withholding: { selected: false, level: 'primary', targets: ['client'] },
    vat: { selected: true, level: 'primary', targets: ['client'] },
    // ‼ ברירת המחדל ללקוח נשוי: ייצוג בב"ל לשני בני הזוג (הכרעה 2026-08-17,
    // נשמרת אחרי שב"ל הצטרף ל-"עבור מי" ב-31.8) — הצ'יפים מוצגים רק כשיש
    // בן/בת זוג ידוע (showTargets), אז ברירת המחדל כאן נראית רק אז.
    nationalInsurance: { selected: true, level: 'primary', targets: ['client', 'spouse'] },
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [copied, setCopied] = useState(false);

  // ‼ רשות שכבר מיוצגת (alreadyRepresented) לעולם לא נכנסת ל-selectedKeys —
  // גם אם הצ'קבוקס שלה איכשהו מסומן ב-state: אין לה שורת בחירה בכלל,
  // ואי אפשר לבקש אותה שוב מהמסך הזה.
  const selectedKeys = REP_AUTHORITY_ORDER.filter(a => areas[a].selected && !alreadyRepresented?.[a]);
  const emailConflict = checkEmailConflict && isValidEmail(email) ? checkEmailConflict(email) : null;
  const married = familyStatus === 'married';
  const yearLabel = familyStatus ? FAMILY_STATUS_YEAR_LABELS[familyStatus] : undefined;
  // "לא נשוי" מפורש מכבה את שאלת בן/בת הזוג; מצב לא ידוע ('') משאיר את ברירת
  // המחדל פעילה — אם הלקוח יצהיר בקישור שהוא נשוי, הייצוג יכסה את שניהם.
  const notMarriedExplicit = familyStatus !== '' && familyStatus !== 'married';
  /** ב"ל לבן/בת הזוג — לתקציר "מה ייווצר" בלבד; הבחירה עצמה חיה ב-areas.nationalInsurance.targets. */
  const niForSpouse = areas.nationalInsurance.selected && !notMarriedExplicit
    && areas.nationalInsurance.targets.includes('spouse');
  // שאלת בן/בת הזוג הרשום/ה רלוונטית רק כשמייצגים במס הכנסה — התיק המשפחתי
  // האחד הוא שם, ובמע"מ/ניכויים/ב"ל התיקים אישיים.
  const incomeTaxSelected = areas.incomeTax.selected;

  /**
   * מתי מוצגת שאלת "עבור מי" — רק כשידוע שיש בן/בת זוג.
   *
   * ‼ בכוונה **לא** מוצג במצב משפחתי לא-ידוע, בניגוד לצ'קבוקס הב"ל: רוב
   * הבקשות הן ליחיד, ושאלה שמופיעה בכל אחת מהן הייתה מייקרת את ברירת המחדל
   * כדי לשרת מיעוט. מאז שהמצב המשפחתי הוא השאלה הראשונה במסך (31.8) הסימון
   * "נשוי" נמצא במרחק לחיצה אחת מכאן, ובאותה זרימה — ולא מאחורי מקטע מקופל.
   */
  const spouseKnown = married || !!spouseName.trim();

  function showTargets(a: RepAuthorityKind): boolean {
    return areas[a].selected && REP_AUTHORITIES_WITH_TARGETS.includes(a) && spouseKnown;
  }

  /** "מה ייווצר" מדבר באותו דקדוק של עמוד הבקשה ושל מרכז הביצוע. */
  const summaryLines = scopeLines(
    Object.fromEntries(selectedKeys.map(a => [a, {
      status: 'in_process' as const,
      ...(REP_AUTHORITIES_WITH_TARGETS.includes(a) ? { targets: notMarriedExplicit ? ['client' as RepTarget] : areas[a].targets } : {}),
    }])),
    { married: spouseKnown, clientName: name.trim(), spouseName: spouseName.trim() },
  );

  function toggleArea(a: RepAuthorityKind) {
    setAreas(prev => ({ ...prev, [a]: { ...prev[a], selected: !prev[a].selected } }));
  }

  function setLevel(a: RepAuthorityKind, level: RepLevel) {
    setAreas(prev => ({ ...prev, [a]: { ...prev[a], level } }));
  }

  /**
   * הדלקה/כיבוי של אדם ברשות. ‼ אי אפשר לכבות את האחרון: רשות מסומנת בלי
   * אף אדם היא בקשה שאי אפשר להגיש. במקום שגיאה אחרי הלחיצה — הלחיצה
   * האחרונה פשוט לא נענית.
   */
  function toggleTarget(a: RepAuthorityKind, t: RepTarget) {
    setAreas(prev => {
      const cur = prev[a].targets;
      const next = cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t];
      if (next.length === 0) return prev;
      return { ...prev, [a]: { ...prev[a], targets: next } };
    });
  }

  // סימון המעבר גורר את הרמה איתו: כל עוד הרו"ח הקודם לא שוחרר הוא המייצג
  // הראשי ברשויות, ואנחנו נכנסים כמשניים. הרמה נשארת ניתנת לשינוי ידני אחרי כן.
  // ‼ המתג כבר לא נוגע ברמת הייצוג: מעבר נפתח ראשי בדיוק כמו לקוח חדש.
  // מה שהוא כן קובע — פרטי הרו"ח הקודם ומכתב העברת הטיפול שייוולד מהם.
  function toggleTransfer(on: boolean) {
    setTransfer(on);
  }

  function validate(): string | null {
    if (selectedKeys.length === 0) return 'יש לבחור לפחות רשות אחת לייצוג';
    // בשליחה במייל הכתובת היא תנאי; בקישור אין צורך בה כלל — הלקוח ימלא בעצמו.
    if (sendBy === 'email' && !email.trim()) return 'יש להזין כתובת מייל, או לעבור לשליחה בקישור';
    if (email.trim() && !isValidEmail(email)) return 'כתובת אימייל לא תקינה';
    // ‼ emailConflict הוא מייעץ בלבד — מייל הוא פרט קשר, לא זיהוי אדם, ולכן
    // לעולם לא חוסם המשך (ייתכן בן משפחה שחולק אותו מייל).
    if (transfer && prevAcc.email.trim() && !isValidEmail(prevAcc.email)) {
      return 'כתובת המייל של הרו״ח הקודם אינה תקינה';
    }
    if (yearLabel && familyYear.trim()) {
      const y = Number(familyYear);
      if (!Number.isInteger(y) || y < 1900 || y > CURRENT_YEAR) return `${yearLabel} - יש להזין שנה תקינה`;
    }
    if (married && spouseIdNumber.trim() && !isValidIsraeliId(spouseIdNumber)) {
      return 'תעודת הזהות של בן/בת הזוג אינה תקינה';
    }
    if (married && spouseEmail.trim() && !isValidEmail(spouseEmail)) return 'כתובת אימייל של בן/בת הזוג לא תקינה';
    // ‼ פרטי בן/בת הזוג אינם חוסמים שליחה (הכרעה 2026-08-17): מה שהרו"ח לא
    // יודע — הלקוח ממלא בעצמו בקישור, כולל ארבעת שדות ייפוי הכוח בב"ל.
    // רק ערך שהוזן בפועל נבדק שהוא תקין.
    if (spouseBirthYear.trim()) {
      const by = Number(spouseBirthYear);
      if (!Number.isInteger(by) || by < 1900 || by > CURRENT_YEAR) {
        return 'שנת הלידה של בן/בת הזוג אינה תקינה';
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
      // ‼ נכתב תמיד ובמפורש, גם כשהוא ['client'] — כדי שבקשה חדשה תאמר מה
      // ביקשה, ולא תסתמך על אותה נפילה-לאחור שנועדה לבקשות ישנות.
      if (REP_AUTHORITIES_WITH_TARGETS.includes(a)) {
        built[a] = { ...built[a]!, targets: notMarriedExplicit ? ['client'] : areas[a].targets };
      }
    }

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
    if (married && spouseBirthYear.trim()) prefill.spouseBirthYear = Number(spouseBirthYear);
    // ‼ נשלח רק כשהוא באמת נגזר ממשהו: זוג נשוי עם שם, וייצוג במ"ה. אחרת אין
    // תיק משפחתי להצביע עליו, ושליחת 'client' הייתה נראית כהכרעה שלא נעשתה.
    if (married && incomeTaxSelected && spouseName.trim()) {
      prefill.registeredSpouse = registeredSpouse;
    }

    // חותם שני נוצר רק אם ידוע שמו. אחרת — הלקוח יצהיר בטופס והחותם ייווצר אז.
    // מייל ריק הוא מצב תקין: הזוג יבחר בשלב החתימה אם לחתום יחד או לקבל קישור.
    const spouse: SpouseInput | null = married && spouseName.trim()
      ? {
          name: spouseName.trim(),
          email: spouseEmail.trim(),
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
        hasPreviousAccountant: transfer,
        prevAccountant: transfer ? {
          name: prevAcc.name.trim() || undefined,
          email: prevAcc.email.trim() || undefined,
          phone: prevAcc.phone.trim() || undefined,
        } : undefined,
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
      if (parts.length > 0) return parts.join(' - ');
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
              <div style={{ padding: '.7rem .9rem', background: 'transparent', borderRadius: 'var(--radius)', color: 'var(--success-text)', fontSize: 'var(--fs-14)', marginBottom: '1rem' }}>
                {'\u{1F4E7}'} הקישור גם נשלח במייל אל <span dir="ltr">{email.trim()}</span>.
              </div>
            )}
            {!result.emailSent && result.emailError && (
              <div style={{ padding: '.7rem .9rem', background: 'transparent', borderRadius: 'var(--radius)', color: 'var(--ink-1)', fontSize: 'var(--fs-13)', marginBottom: '1rem', lineHeight: 1.6 }}>
                <InfoLines items={[
                  `⚠ המייל לא נשלח (${result.emailError})`,
                  'אפשר לשלוח את הקישור בוואטסאפ',
                ]} />
              </div>
            )}

            <InfoLines
              style={{ fontSize: 'var(--fs-14)', color: 'var(--ink-2)', lineHeight: 1.6, marginTop: 0 }}
              items={[
                'שלחו את הקישור ללקוח',
                'הוא ימלא שם, ת.ז., תאריך לידה, טלפון, מייל, כתובת ומצב משפחתי',
                'הכל ייכנס אוטומטית לכרטיס שלו',
              ]} />

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
                {copied ? 'הועתק' : '\u{1F517} העתקת קישור'}
              </button>
            </div>

            <input
              readOnly
              value={result.link}
              dir="ltr"
              style={{ width: '100%', textAlign: 'left', fontSize: 'var(--fs-13)', fontFamily: 'var(--font-mono, monospace)' }}
              onFocus={e => e.currentTarget.select()}
            />
            <p style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginBottom: 0 }}>הקישור ייחודי ללקוח זה ומאובטח.</p>
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
          {/* ── מצב משפחתי — השאלה הראשונה ────────────────────────────────────
              ‼ הכרעת גיא (31.8): היא נשאלת **לפני** הרשויות, כי היא זו שפותחת
              את "עבור מי" בתוך שורת הרשות. קודם היא ישבה במקטע המקופל שמתחת,
              ולכן מי שרצה לסמן תיק על שם בן/בת הזוג היה צריך לגלול למטה, לפתוח
              מקטע, לבחור — ולחזור למעלה לרשויות. עכשיו זה קורה בזרימה אחת.
              "שהלקוח יבחר" נשאר ברירת המחדל: לרוב באמת לא יודעים. */}
          <div style={{
            padding: '.7rem .8rem', marginBottom: '1.1rem',
            border: `1px solid ${familyStatus ? 'var(--accent)' : 'var(--hairline-1)'}`,
            borderRadius: 'var(--radius)',
          }}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: 'var(--fs-13)', color: 'var(--ink-2)', marginBottom: '.4rem' }}>
              מצב משפחתי
            </label>
            <select
              value={familyStatus}
              onChange={(e) => { setFamilyStatus(e.target.value as FamilyStatus | ''); setFamilyYear(''); }}
              disabled={busy}
            >
              <option value="">{'-'} שהלקוח יבחר {'-'}</option>
              {FAMILY_ORDER.map(f => (
                <option key={f} value={f}>{FAMILY_STATUS_LABELS[f]}</option>
              ))}
            </select>
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
            <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: '.4rem', lineHeight: 1.5 }}>
              {married
                ? 'בכל רשות שהתיק בה אישי אפשר לסמן עכשיו על שם מי הוא.'
                : 'כפי שרשום בתעודת הזהות. אם נשוי - ייפתח בכל רשות "עבור מי".'}
            </div>
          </div>

          {/* ‼ השאלה הזאת נשאלת לפני הרשויות ולא אחריהן: היא זו שקובעת אם
              נכנסים כמייצג ראשי או משני, והיא זו שמולידה את מכתב השחרור.
              קודם היא נגזרה מהליד בלבד — ובבקשת ייצוג ישירה לא היה איפה לסמן. */}
          <div style={{
            padding: '.7rem .8rem', marginBottom: '1.1rem',
            border: `1px solid ${transfer ? 'var(--accent)' : 'var(--hairline-1)'}`,
            borderRadius: 'var(--radius)',
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '.6rem', cursor: busy ? 'default' : 'pointer' }}>
              <input type="checkbox" checked={transfer} disabled={busy}
                onChange={e => toggleTransfer(e.target.checked)} />
              <span style={{ fontSize: 'var(--fs-15)', fontWeight: transfer ? 600 : 400 }}>
                הלקוח עובר מרו״ח אחר
              </span>
            </label>
            {transfer ? (
              <div style={{ marginTop: '.6rem' }}>
                <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', lineHeight: 1.55, marginBottom: '.5rem' }}>
                  הייצוג נפתח כמייצג ראשי גם במעבר. אם במכתב העברת הטיפול יסומן
                  שנשארו אצל הקודם דוח שנתי או הצהרת הון - הרישום יירד למשני עד השלמתם.
                </div>
                <div className="form-group">
                  <label>שם הרו״ח הקודם (לא חובה)</label>
                  <input type="text" value={prevAcc.name} disabled={busy}
                    onChange={e => setPrevAcc(v => ({ ...v, name: e.target.value }))}
                    placeholder="שם רואה החשבון או המשרד" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem', marginTop: '.5rem' }}>
                  <div className="form-group">
                    <label>מייל</label>
                    <EmailInput value={prevAcc.email} disabled={busy}
                      onChange={e => setPrevAcc(v => ({ ...v, email: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>טלפון</label>
                    <input type="tel" value={prevAcc.phone} disabled={busy} dir="ltr" style={{ textAlign: 'right' }}
                      onChange={e => setPrevAcc(v => ({ ...v, phone: e.target.value }))} />
                  </div>
                </div>
                <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: '.5rem', lineHeight: 1.5 }}>
                  מה שלא ידוע כאן - אפשר לבקש מהלקוח בדף האישי, ומכתב העברת הטיפול ייבנה ממנו.
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', marginTop: '.4rem', lineHeight: 1.5 }}>
                לקוח חדש לגמרי - נכנסים כמייצג ראשי, בלי מכתב לרו״ח קודם.
              </div>
            )}
          </div>

          {/* רשויות — הבחירה היחידה שנדרשת */}
          <label style={{ display: 'block', fontWeight: 600, fontSize: 'var(--fs-13)', color: 'var(--ink-2)', marginBottom: '.5rem' }}>
            אילו רשויות לייצג? <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            {REP_AUTHORITY_ORDER.map(a => {
              const already = alreadyRepresented?.[a];
              if (already) {
                // ‼ שורת מידע קבועה, לא צ'קבוקס: אין כאן החלטה לקבל, ואין
                // מה לבטל. "כבר מיוצג" הוא עובדה שנקבעה בכרטיס אחר.
                return (
                  <div key={a} style={{
                    display: 'flex', alignItems: 'center', gap: '.75rem',
                    padding: '.7rem .8rem', border: '1px solid var(--hairline-1)',
                    borderRadius: 'var(--radius)', background: 'var(--surface-2)',
                  }}>
                    <span style={{ fontSize: 'var(--fs-15)' }}>{'✓'}</span>
                    <span style={{ flex: 1, fontSize: 'var(--fs-15)' }}>
                      {REP_AUTHORITY_LABELS[a]}
                      <span style={{ display: 'block', fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: 2 }}>
                        כבר מיוצג/ת {'·'} {already} {'·'} אין צורך בבקשה נוספת
                      </span>
                    </span>
                  </div>
                );
              }
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
                    border: `1px solid ${st.selected ? 'var(--accent)' : 'var(--hairline-1)'}`,
                    background: 'transparent',
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
                  <span style={{ flex: 1, fontSize: 'var(--fs-15)', fontWeight: st.selected ? 600 : 400 }}>
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
                    <span style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)' }}>{'ℹ'} ייצוג יחיד</span>
                  )}

                  {/* ‼ "עבור מי" יושב **בתוך** שורת הרשות ולא במקטע נפרד: בחירת
                      מע"מ ובחירת האדם הן החלטה אחת, ופיצולן לשני מקומות במסך
                      היה מזמין בקשה שסומנה לאדם הלא נכון. מופיע רק כשיש בכלל
                      שאלה — לקוח לא-נשוי רואה בדיוק את המסך של אתמול. */}
                  {showTargets(a) && (
                    <div
                      style={{ flexBasis: '100%', display: 'flex', gap: '.35rem', flexWrap: 'wrap', alignItems: 'center', paddingInlineStart: '1.7rem' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>עבור מי?</span>
                      {(['client', 'spouse'] as RepTarget[]).map(t => {
                        const on = st.targets.includes(t);
                        return (
                          <button
                            key={t}
                            type="button"
                            disabled={busy}
                            onClick={() => toggleTarget(a, t)}
                            className={`rep-who${on ? ' is-on' : ''}`}
                          >
                            {on ? '✓ ' : ''}{t === 'spouse' ? (spouseName.trim() || 'בן/בת הזוג') : (name.trim() || 'הלקוח/ה')}
                          </button>
                        );
                      })}
                      {st.targets.length === 2 && (
                        <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>{'·'} שתי הגשות נפרדות בשע״ם</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ‼ אין כאן יותר צ'קבוקס נפרד לביטוח לאומי (31.8): הוא הצטרף לצ'יפי
              "עבור מי" בתוך שורת הרשות שלמעלה, בדיוק כמו מע"מ וניכויים —
              אותו מודל בדיוק, לא מודל שלישי. */}

          {/* איך הקישור מגיע ללקוח — הבחירה קובעת אם המייל נדרש */}
          <label style={{ display: 'block', fontWeight: 600, fontSize: 'var(--fs-13)', color: 'var(--ink-2)', margin: '1.25rem 0 .5rem' }}>
            איך לשלוח ללקוח?
          </label>
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
            {([
              { key: 'link' as const, icon: '\u{1F517}', title: 'קישור לשליחה', sub: 'וואטסאפ, SMS או העתקה - בלי מייל' },
              { key: 'email' as const, icon: '\u{1F4E7}', title: 'שליחה במייל', sub: 'המערכת שולחת אוטומטית ללקוח' },
            ]).map(opt => {
              const sel = sendBy === opt.key;
              return (
                <div
                  key={opt.key}
                  onClick={() => !busy && setSendBy(opt.key)}
                  style={{
                    flex: '1 1 200px', padding: '.7rem .8rem', cursor: busy ? 'default' : 'pointer',
                    border: `1px solid ${sel ? 'var(--accent)' : 'var(--hairline-1)'}`,
                    background: 'transparent',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  <div style={{ fontSize: 'var(--fs-14)', fontWeight: sel ? 600 : 400 }}>{opt.icon} {opt.title}</div>
                  <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: 2 }}>{opt.sub}</div>
                </div>
              );
            })}
          </div>

          {sendBy === 'email' && (
            <div className="form-group" style={{ marginTop: '.75rem' }}>
              <label className="required">אימייל הלקוח</label>
              <EmailInput
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
                disabled={busy}
                autoFocus
              />
              {emailConflict && (
                <div style={{ marginTop: '.4rem', fontSize: 'var(--fs-13)', color: 'var(--chip-blue-tx)', lineHeight: 1.5 }}>
                  {emailConflict}
                </div>
              )}
              <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', marginTop: '.35rem' }}>
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
          <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', marginTop: '.25rem', lineHeight: 1.5 }}>
            כל מה שלא תמלא כאן - הלקוח ימלא בעצמו בקישור.
          </div>

          {showDetails && (
            <div style={{ marginTop: '.9rem', padding: '.85rem .9rem', border: '1px solid var(--hairline-1)', borderRadius: 'var(--radius)', background: 'var(--surface-2)' }}>
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


              {married && (
                <div style={{ marginTop: '.75rem', paddingTop: '.75rem', borderTop: '1px solid var(--hairline-1)' }}>
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
                  <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', marginBottom: '.5rem' }}>
                    נשוי/אה {'←'} שני בני הזוג חותמים על ייפוי הכוח. מה שלא תמלא - הלקוח ימלא בקישור.
                  </div>

                  <div className="form-grid form-grid-2">
                    <div className="form-group">
                      {/* אחד מארבעת שדות "הוספת ייפוי כח מבוטח" בב"ל. לא חובה —
                          הלקוח משלים בקישור מה שלא ידוע כאן. */}
                      <label>שנת לידה של בן/בת הזוג</label>
                      <input
                        type="number" inputMode="numeric" dir="ltr"
                        value={spouseBirthYear}
                        onChange={e => setSpouseBirthYear(e.target.value)}
                        placeholder={`לדוגמה: ${CURRENT_YEAR - 40}`}
                        min={1900} max={CURRENT_YEAR} disabled={busy}
                      />
                    </div>
                    <div className="form-group">
                      {/* לא חובה: מייל של בן/בת הזוג נדרש רק אם יבחרו לשלוח לו/לה
                          קישור חתימה נפרד — והבחירה הזאת נעשית בשלב החתימה. */}
                      <label>אימייל של בן/בת הזוג</label>
                      <EmailInput value={spouseEmail} onChange={e => setSpouseEmail(e.target.value)} placeholder="spouse@example.com" disabled={busy} />
                    </div>
                  </div>
                  <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: '.35rem', lineHeight: 1.5 }}>
                    גם אלה לא חובה. בלי מייל - הלקוח יבחר בשלב החתימה אם לחתום יחד או לשלוח קישור אישי.
                  </div>

                  {/* ‼ נשאל כאן ולא מאוחר יותר (הכרעת גיא 2026-08-20), אבל
                      כ**כוונה ולא כידיעה** (2026-08-27): בפתיחת הבקשה עוד לא
                      ראינו מה רשום בפועל במ"ה. התשובה נשמרת מסומנת "טרם אומת",
                      וההכרעה נעשית בשלב "הפרטים הוזנו בשע״ם" שבמרכז ביצוע
                      הייצוג — שם רואים את הרשום האמיתי. */}
                  {incomeTaxSelected && (
                    <div className="form-group" style={{ marginTop: '.75rem' }}>
                      <label>מי יהיה בן/בת הזוג הרשום/ה במס הכנסה?</label>
                      <select
                        value={registeredSpouse}
                        onChange={e => setRegisteredSpouse(e.target.value as 'client' | 'spouse')}
                        disabled={busy}
                      >
                        <option value="client">{name.trim() || 'הלקוח/ה'}</option>
                        <option value="spouse">{spouseName.trim() || 'בן/בת הזוג'}</option>
                      </select>
                      <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: '.35rem', lineHeight: 1.5 }}>
                        במס הכנסה יש תיק אחד לתא המשפחתי, ומספרו הוא ת.ז. של בן/בת הזוג
                        הרשום/ה. כל ההתנהלות מול מ"ה תהיה בת.ז. הזו.
                        <br />
                        זו הכוונה שלך, לא בדיקה מול מ"ה - השם יסומן <b>«טרם אומת»</b> בכל
                        המערכת. כשתזינו את הפרטים בשע״ם תראו מי רשום באמת, ותכריעו שם בלחיצה.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* מה ייווצר */}
          <div style={{
            marginTop: '1.25rem',
            padding: '.75rem .9rem',
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius)',
            fontSize: 'var(--fs-13)',
            color: 'var(--ink-2)',
          }}>
            <div style={{ fontWeight: 600, marginBottom: '.4rem' }}>{'✨'} מה ייווצר</div>
            <div>{'✓'} קישור אישי {sendBy === 'email' ? '- וגם יישלח במייל אוטומטית' : 'לשליחה בוואטסאפ'}</div>
            <div>{'✓'} כרטיס לקוח {name.trim() ? `- ${name.trim()}` : '- יקבל שם כשהלקוח ימלא'}</div>
            {/* ‼ הרשויות כבר לא נמנות כרשימה שטוחה: שורה לכל רשות עם "עבור מי",
                באותו דקדוק שילווה את הבקשה בעמוד שלה ובמרכז הביצוע. */}
            {selectedKeys.length === 0 && <div>{'✓'} בחר רשויות כדי ליצור סטטוסי ייצוג</div>}
            {selectedKeys.length > 0 && !spouseKnown && (
              /* ליחיד אין "עבור מי" — שורה לכל רשות הייתה מוסיפה אורך בלי מידע */
              <div>{'✓'} {selectedKeys.length} סטטוסי ייצוג "בתהליך": {selectedKeys.map(a => REP_AUTHORITY_LABELS[a]).join(', ')}</div>
            )}
            {selectedKeys.length > 0 && spouseKnown && summaryLines.map(l => (
              <div key={l.authority}>
                {'✓'} {l.authorityLabel} {'·'} <b>{l.whoLabel}</b>
              </div>
            ))}
            <div>{'✓'} משימה פנימית למעקב</div>
            {married && spouseName.trim() && <div>{'✓'} חותם שני - {spouseName.trim()}</div>}
            {married && !spouseName.trim() && <div>{'✓'} חותם שני - הלקוח ימלא את פרטי בן/בת הזוג בקישור</div>}
            {niForSpouse && (
              <div>{'✓'} ייצוג נפרד בביטוח לאומי לבן/בת הזוג {married ? '' : '(אם הלקוח נשוי) '}- שתי אסמכתאות</div>
            )}
            {/* ‼ מוצג לשתי הבחירות ולא רק ל"בן/בת הזוג": מאז שהשדה הוא כוונה
                ולא ידיעה, גם "ע״ש הלקוח" הוא נתון שטרם אומת — וצריך לומר את זה. */}
            {married && incomeTaxSelected && spouseName.trim() && (
              <div>
                {'✓'} תיק מס הכנסה ע״ש {registeredSpouse === 'spouse' ? spouseName.trim() : (name.trim() || 'הלקוח/ה')} -
                בן/בת הזוג הרשום/ה · טרם אומת מול מ"ה
              </div>
            )}
          </div>

          {error && (
            <div style={{
              marginTop: '1rem',
              padding: '.65rem .85rem',
              background: 'transparent',
              color: 'var(--danger)',
              borderRadius: 'var(--radius)',
              fontSize: 'var(--fs-14)',
            }}>
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            ביטול
          </button>
          {/* בשליחה במייל הכפתור גם מפיק וגם שולח — הכתוב מתאר את הפעולה שתקרה */}
          <button type="submit" className="btn btn-primary" disabled={busy || selectedKeys.length === 0}>
            {sendBy === 'email'
              ? (busy ? 'שולח…' : '\u{1F4E7} שליחה ללקוח במייל')
              : (busy ? 'מפיק…' : '\u{1F517} הפקת קישור')}
          </button>
        </div>
      </form>
    </div>
  );
}
