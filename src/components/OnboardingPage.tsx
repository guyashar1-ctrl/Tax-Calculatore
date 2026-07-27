import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  OnboardingSecondaryType,
  ONBOARDING_SECONDARY_LABELS,
  AUTHORITY_LABELS,
  AuthorityKind,
  OnboardingPrefill,
  FamilyStatus,
  FAMILY_STATUS_LABELS,
  FAMILY_STATUS_YEAR_LABELS,
} from '../types';
import { FirmBranding } from '../types/firmProfile';
import { deriveQuotationBrand } from './quotations/quotationBranding';
import SignaturePad from './SignaturePad';
import PublicIntake from './PublicIntake';

interface Props {
  token: string;
}

interface OnboardingInfo {
  clientName: string;
  firmName: string;
  branding: FirmBranding;
  alreadySubmitted: boolean;
  status: string;
  authorities: AuthorityKind[];
  alreadySigned: boolean;
  prefill: OnboardingPrefill;
  knownFirstName: string;
  knownLastName: string;
  knownEmail: string;
  niIncluded: boolean;
}

type Phase = 'loading' | 'invalid' | 'form' | 'done' | 'already' | 'sign' | 'signed' | 'signLinkSent' | 'intake' | 'intakeDone';

const SECONDARY_ORDER: OnboardingSecondaryType[] = ['parentId', 'driverLicense', 'passport'];

const FAMILY_ORDER: FamilyStatus[] = ['single', 'married', 'divorced', 'widowed', 'singleParent'];

const CURRENT_YEAR = new Date().getFullYear();

/**
 * ספרת ביקורת של ת.ז. ישראלית. תופס שגיאות הקלדה לפני שהמספר מגיע לרשויות —
 * שם תיקון דורש הגשה מחדש של כל בקשת הייצוג.
 */
function isValidIsraeliId(id: string): boolean {
  const digits = id.padStart(9, '0');
  if (!/^\d{9}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const step = Number(digits[i]) * ((i % 2) + 1);
    sum += step > 9 ? step - 9 : step;
  }
  return sum % 10 === 0;
}

export default function OnboardingPage({ token }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<OnboardingInfo | null>(null);
  const [step, setStep] = useState(1);
  // ── פרטים אישיים ──
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [secondaryType, setSecondaryType] = useState<OnboardingSecondaryType>('parentId');
  const [secondaryValue, setSecondaryValue] = useState('');
  // ── פרטי קשר ──
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  // ── מצב משפחתי ──
  const [familyStatus, setFamilyStatus] = useState<FamilyStatus | ''>('');
  const [familyYear, setFamilyYear] = useState('');
  const [spouseName, setSpouseName] = useState('');
  const [spouseEmail, setSpouseEmail] = useState('');
  const [spouseIdNumber, setSpouseIdNumber] = useState('');

  const [signature, setSignature] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('get_onboarding', { p_token: token });
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) {
        setPhase('invalid');
        return;
      }
      const st: string = row.status || 'pending_fill';
      const prefill: OnboardingPrefill = row.prefill || {};
      setInfo({
        clientName: row.client_name || '',
        firmName: row.firm_name || 'המשרד',
        branding: row.branding || {},
        alreadySubmitted: !!row.already_submitted,
        status: st,
        authorities: (row.authorities || []) as AuthorityKind[],
        alreadySigned: !!row.already_signed,
        prefill,
        knownFirstName: row.known_first_name || '',
        knownLastName: row.known_last_name || '',
        knownEmail: row.known_email || '',
        niIncluded: !!row.ni_included,
      });
      // מה שהרו"ח כבר מילא נכנס כערך פתיחה; מה שלא — נשאר ריק והלקוח ימלא.
      if (prefill.firstName) setFirstName(prefill.firstName);
      if (prefill.lastName) setLastName(prefill.lastName);
      if (prefill.email) setEmail(prefill.email);
      if (prefill.familyStatus) setFamilyStatus(prefill.familyStatus);
      if (prefill.familyStatusYear) setFamilyYear(String(prefill.familyStatusYear));
      // בזרימת החתימה החדשה (יש הגדרת PDF) — החתימה נעשית בקישור האישי, לא כאן.
      if (st === 'pending_signature' && row.has_setup) setPhase('signLinkSent');
      else if (st === 'pending_signature' && !row.already_signed) setPhase('sign');
      else if (row.already_submitted || row.already_signed || ['awaiting_stamp', 'awaiting_authorities', 'active'].includes(st)) {
        // הזיהוי הושלם — אם שאלון ההיכרות עוד לא הסתיים, ממשיכים אליו באותו קישור
        const { data: intake } = await supabase.rpc('get_intake', { p_token: token });
        if (cancelled) return;
        const irow = Array.isArray(intake) ? intake[0] : intake;
        const intakeDone = irow?.session_status && irow.session_status !== 'in_progress';
        if (intakeDone) setPhase(row.already_signed ? 'signed' : 'already');
        else setPhase('intake');
      }
      else setPhase('form');
    })();
    return () => { cancelled = true; };
  }, [token]);

  // עיצוב אחיד — אותם טוקנים של עמוד ההצעה, כדי שהמראה יהיה זהה בשני העמודים
  const brand = deriveQuotationBrand({
    id: '', firmName: info?.firmName, branding: info?.branding ?? {},
    communication: {}, settings: {},
  } as any);
  const ink = brand.ink;
  const accent = brand.accent;
  const monogram = brand.monogram;
  const logoUrl = brand.logoUrl;
  const btnRadius = brand.buttonStyle === 'pill' ? 999 : brand.radius;
  const ctaStyle: React.CSSProperties = brand.buttonStyle === 'outline'
    ? { background: 'transparent', color: ink, border: `1.5px solid ${ink}` }
    : { background: accent, color: '#fff', border: 'none' };
  // שם לפנייה אישית. בקישור שהופק בלי שם — הלקוח שהקליד זה עתה, אחרת מהבקשה.
  const greetName = (firstName || info?.clientName || '').trim().split(/\s+/)[0] || '';

  const yearLabel = familyStatus ? FAMILY_STATUS_YEAR_LABELS[familyStatus] : undefined;
  // הרו"ח כבר קבע את המצב המשפחתי (ואת השנה, אם נדרשת) ⇒ אין מה לשאול בשלב 3.
  const familyStepDone = !!info?.prefill.familyStatus
    && (!FAMILY_STATUS_YEAR_LABELS[info.prefill.familyStatus] || !!info.prefill.familyStatusYear)
    && info.prefill.familyStatus !== 'married';
  const lastStep = familyStepDone ? 2 : 3;

  function validateStep(s: number): string | null {
    if (s === 1) {
      if (!firstName.trim()) return 'יש להזין שם פרטי';
      if (!lastName.trim()) return 'יש להזין שם משפחה';
      if (!/^\d{9}$/.test(idNumber.trim())) return 'תעודת זהות חייבת להכיל 9 ספרות';
      if (!isValidIsraeliId(idNumber.trim())) return 'מספר תעודת הזהות אינו תקין — בדקו שוב';
      if (!birthDate) return 'יש להזין תאריך לידה';
      if (new Date(birthDate) > new Date()) return 'תאריך הלידה לא יכול להיות בעתיד';
      if (!secondaryValue.trim()) return `יש להזין ${ONBOARDING_SECONDARY_LABELS[secondaryType]}`;
    }
    if (s === 2) {
      if (!/^[\d\-+\s()]{9,}$/.test(phone.trim())) return 'יש להזין מספר טלפון תקין';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'יש להזין כתובת מייל תקינה';
      if (!city.trim()) return 'יש להזין עיר מגורים';
      if (!address.trim()) return 'יש להזין כתובת (רחוב ומספר)';
    }
    if (s === 3) {
      if (!familyStatus) return 'יש לבחור מצב משפחתי';
      if (yearLabel) {
        const y = Number(familyYear);
        if (!familyYear.trim()) return `יש להזין ${yearLabel}`;
        if (!Number.isInteger(y) || y < 1900 || y > CURRENT_YEAR) return `${yearLabel} — יש להזין שנה תקינה`;
      }
      if (familyStatus === 'married') {
        if (!spouseName.trim()) return 'יש להזין את שם בן/בת הזוג';
        if (!spouseIdNumber.trim()) return 'יש להזין את תעודת הזהות של בן/בת הזוג';
        if (!isValidIsraeliId(spouseIdNumber.trim())) return 'תעודת הזהות של בן/בת הזוג אינה תקינה';
        if (spouseEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(spouseEmail.trim())) return 'כתובת המייל של בן/בת הזוג אינה תקינה';
      }
    }
    return null;
  }

  function handleNext() {
    const v = validateStep(step);
    if (v) { setError(v); return; }
    setError(null);
    if (step >= lastStep) { handleSubmit(); return; }
    setStep(step + 1);
  }

  async function handleSubmit() {
    for (let s = 1; s <= lastStep; s++) {
      const v = validateStep(s);
      if (v) { setError(v); setStep(s); return; }
    }
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('submit_onboarding_full', {
      p_token: token,
      p_first_name: firstName.trim(),
      p_last_name: lastName.trim(),
      p_id_number: idNumber.trim(),
      p_birth_date: birthDate,
      p_secondary_type: secondaryType,
      p_secondary_value: secondaryValue.trim(),
      p_phone: phone.trim(),
      p_email: email.trim(),
      p_city: city.trim(),
      p_address: address.trim(),
      p_family_status: familyStatus || null,
      p_family_status_year: yearLabel && familyYear.trim() ? Number(familyYear) : null,
      p_spouse_name: familyStatus === 'married' ? spouseName.trim() : null,
      p_spouse_email: familyStatus === 'married' ? spouseEmail.trim() : null,
      p_spouse_id_number: familyStatus === 'married' ? spouseIdNumber.trim() : null,
    });
    if (error || data === false) {
      setError('אירעה שגיאה בשליחה. נסו שוב, או פנו למשרד.');
      setBusy(false);
      return;
    }
    // הזיהוי הושלם — ממשיכים ישר לשאלון ההיכרות, בלי קישור נוסף
    setBusy(false);
    setPhase('intake');
  }

  async function handleSubmitSignature() {
    if (!signature) { setError('נא לחתום על הטופס'); return; }
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('submit_signature', { p_token: token, p_signature: signature });
    if (error || data === false) {
      setError('אירעה שגיאה בשליחה. נסו שוב, או פנו למשרד.');
      setBusy(false);
      return;
    }
    setPhase('signed');
  }

  // ── styles ──
  const page: React.CSSProperties = {
    minHeight: '100vh', background: brand.pageBg, display: 'flex', alignItems: 'flex-start',
    justifyContent: 'center', padding: '40px 16px', fontFamily: `'${brand.font}', sans-serif`, direction: 'rtl',
  };
  const card: React.CSSProperties = {
    width: 460, maxWidth: '100%', background: brand.cardBg, border: `1px solid ${brand.border}`,
    borderRadius: brand.radius + 4, padding: '34px 34px 26px',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: brand.cardBg, border: `1px solid ${brand.border}`,
    borderRadius: Math.min(brand.radius, 12), padding: '11px 13px', fontSize: 14, color: '#1A1A1A', marginTop: 6,
  };
  const label: React.CSSProperties = { fontSize: 12.5, color: '#6B6B68', display: 'block' };

  function Header() {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 30 }}>
        {logoUrl ? (
          <img src={logoUrl} alt={info?.firmName || ''} style={{ maxHeight: 36 * brand.logoScale, maxWidth: 150 * brand.logoScale, objectFit: 'contain' }} />
        ) : (
          <>
            <div style={{ width: 30, height: 30, borderRadius: '50%', border: `1.5px solid ${ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ink, fontWeight: 500, fontSize: 12 }}>{monogram}</div>
            <span style={{ fontSize: 12.5, color: ink }}>{info?.firmName}</span>
          </>
        )}
        <span style={{ marginInlineStart: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6B6B68' }}>🔒 מאובטח</span>
      </div>
    );
  }

  if (phase === 'loading') {
    return <div style={page}><div style={{ ...card, textAlign: 'center', color: '#6B6B68' }}>טוען…</div></div>;
  }

  if (phase === 'invalid') {
    return (
      <div style={page}>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 6, color: '#111' }}>הקישור אינו תקין</div>
          <div style={{ fontSize: 13.5, color: '#6B6B68', lineHeight: 1.6 }}>ייתכן שהקישור פג או שגוי. אנא פנו למשרד לקבלת קישור חדש.</div>
        </div>
      </div>
    );
  }

  if (phase === 'already') {
    return (
      <div style={page}>
        <div style={card}>
          <Header />
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: ink, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: '#fff', fontSize: 22 }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 500, color: '#111', marginBottom: 5 }}>הפרטים כבר התקבלו</div>
            <div style={{ fontSize: 13, color: '#6B6B68', lineHeight: 1.6 }}>תודה{greetName ? `, ${greetName}` : ''}. כבר קיבלנו את פרטי ההזדהות שלכם. אפשר לסגור את החלון.</div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'intake') {
    return (
      <div style={page}>
        <div style={{ ...card, width: 560 }}>
          <Header />
          <PublicIntake
            token={token}
            firstName={firstName}
            ink={ink}
            onDone={() => setPhase('intakeDone')}
          />
        </div>
      </div>
    );
  }

  if (phase === 'intakeDone') {
    return (
      <div style={page}>
        <div style={{ ...card, width: 520 }}>
          <Header />
          <div style={{ textAlign: 'center', padding: '4px 0 18px' }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: ink, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: '#fff', fontSize: 22 }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 500, color: '#111', marginBottom: 5 }}>קיבלנו הכול{greetName ? `, ${greetName}` : ''}! 🎉</div>
            <div style={{ fontSize: 13, color: '#6B6B68', lineHeight: 1.6 }}>
              {info?.firmName} כבר מטפל בפתיחת הייצוג מול הרשויות.
            </div>
          </div>

          {/* השלב הקריטי: בלי המייל הבא הייצוג לא נכנס לתוקף */}
          <div style={{ border: `1.5px solid ${accent}`, borderRadius: 10, padding: '15px 16px', marginBottom: 18 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: '#111', marginBottom: 7 }}>
              📩 בקרוב יגיע אליכם מייל נוסף — חשוב לפתוח אותו
            </div>
            <div style={{ fontSize: 13, color: '#6B6B68', lineHeight: 1.75 }}>
              אחרי שנזין את הפרטים ברשויות, נשלח לכם מייל שבו תתבקשו:
            </div>
            <div style={{ fontSize: 13, color: '#6B6B68', lineHeight: 1.8, paddingTop: 8 }}>
              <div>• <strong style={{ color: '#111' }}>מס הכנסה</strong> — לחתום דיגיטלית על טופס ייפוי הכוח (בלחיצה, מהטלפון).</div>
              {info?.niIncluded && (
                <div style={{ paddingTop: 4 }}>
                  • <strong style={{ color: '#111' }}>ביטוח לאומי</strong> — לאשר את ייפוי הכוח מול הביטוח הלאומי, באתר שלהם או בטלפון. נשלח לכם מספר אסמכתא והוראות מדויקות.
                </div>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#9A9A95', lineHeight: 1.6, paddingTop: 10, borderTop: '1px solid #F0EFEB', marginTop: 11 }}>
              עד שלא תשלימו את שני אלה, הייצוג עדיין לא בתוקף מול הרשויות.
            </div>
          </div>

          <ProcessMap current={3} />

          <div style={{ textAlign: 'center', fontSize: 12, color: '#9A9A95' }}>אפשר לסגור את החלון.</div>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div style={page}>
        <div style={card}>
          <Header />
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: ink, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: '#fff', fontSize: 22 }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 500, color: '#111', marginBottom: 5 }}>תודה{greetName ? `, ${greetName}` : ''}. קיבלנו את הפרטים.</div>
            <div style={{ fontSize: 13, color: '#6B6B68', lineHeight: 1.6 }}>{info?.firmName} יכין את בקשת הייצוג ויחזור אליכם בהקדם. אפשר לסגור את החלון.</div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'sign') {
    const authList = (info?.authorities || []).map(a => AUTHORITY_LABELS[a]).filter(Boolean).join(', ');
    return (
      <div style={page}>
        <div style={card}>
          <Header />
          <div style={{ fontSize: 11, letterSpacing: '.08em', color: '#9A9A95', marginBottom: 8 }}>חתימה על ייפוי כוח</div>
          <div style={{ fontSize: 24, fontWeight: 500, color: '#111', marginBottom: 6 }}>כמעט סיימנו{greetName ? `, ${greetName}` : ''}</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: '#6B6B68', marginBottom: 20 }}>
            בחתימתכם אתם מייפים את כוחו של {info?.firmName} לייצג אתכם מול {authList || 'רשויות המס'}. החתימה מאובטחת ומשמשת אך ורק לטופס ייפוי הכוח.
          </div>
          <div style={{ ...label, marginBottom: 8 }}>חתמו כאן</div>
          <SignaturePad value={signature} onChange={setSignature} />
          {error && (
            <div style={{ marginTop: 16, padding: '10px 12px', background: '#FCEBEB', color: '#A32D2D', borderRadius: 9, fontSize: 12.5 }}>{error}</div>
          )}
          <button onClick={handleSubmitSignature} disabled={busy}
            style={{ width: '100%', marginTop: 20, ...ctaStyle, borderRadius: btnRadius, padding: 13, fontSize: 14.5, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'שולח…' : 'שליחת החתימה'}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'signLinkSent') {
    return (
      <div style={page}>
        <div style={card}>
          <Header />
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 26, marginBottom: 10 }}>✉️</div>
            <div style={{ fontSize: 18, fontWeight: 500, color: '#111', marginBottom: 5 }}>הטופס מוכן לחתימה</div>
            <div style={{ fontSize: 13, color: '#6B6B68', lineHeight: 1.6 }}>
              שלחנו לכל חותם קישור חתימה אישי למייל. פתחו את המייל מ{info?.firmName || 'המשרד'} ולחצו על הכפתור כדי לחתום על הטופס.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'signed') {
    return (
      <div style={page}>
        <div style={card}>
          <Header />
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: ink, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: '#fff', fontSize: 22 }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 500, color: '#111', marginBottom: 5 }}>תודה{greetName ? `, ${greetName}` : ''}. קיבלנו את החתימה.</div>
            <div style={{ fontSize: 13, color: '#6B6B68', lineHeight: 1.6 }}>{info?.firmName} ישלים את התהליך מול רשויות המס ויחזור אליכם. אפשר לסגור את החלון.</div>
          </div>
        </div>
      </div>
    );
  }


  // phase === 'form' — טופס רב-שלבי. במסך טלפון שלושה מסכים קצרים עדיפים על
  // טופס אחד ארוך: פחות גלילה, ושגיאה מסומנת ליד השדה שגרם לה.
  const stepTitles = ['הפרטים שלכם', 'איך נשיג אתכם', 'מצב משפחתי'];
  const fieldBox = { marginBottom: 16 } as React.CSSProperties;

  function Progress() {
    return (
      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {Array.from({ length: lastStep }, (_, i) => i + 1).map(n => (
          <div key={n} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: n <= step ? accent : '#E3E2DD',
          }} />
        ))}
      </div>
    );
  }

  /**
   * מפת התהליך כולו. מוצגת בכניסה ובסיום — הלקוח צריך לדעת מראש שיגיע אליו
   * מייל נוסף, אחרת הוא חושב שסיים ולא פותח אותו, והייצוג נתקע.
   */
  function ProcessMap({ current }: { current: 1 | 3 }) {
    const niStep = info?.niIncluded
      ? 'לחתום על ייפוי הכוח למס הכנסה, ולאשר את ייפוי הכוח בביטוח הלאומי'
      : 'לחתום על ייפוי הכוח למס הכנסה';
    const steps = [
      { n: 1, title: 'הפרטים שלכם', text: 'ממלאים כאן — כדקה' },
      { n: 2, title: `${info?.firmName || 'המשרד'} מזין ברשויות`, text: 'אנחנו פותחים את בקשות הייצוג' },
      { n: 3, title: 'מייל נוסף אליכם', text: niStep },
      { n: 4, title: 'הייצוג פעיל', text: 'מכאן אנחנו מטפלים בכל מול הרשויות' },
    ];
    return (
      <div style={{ background: '#F7F6F3', borderRadius: 10, padding: '14px 15px', marginBottom: 24 }}>
        <div style={{ fontSize: 11.5, letterSpacing: '.06em', color: '#9A9A95', marginBottom: 11 }}>איך זה עובד</div>
        {steps.map(s => {
          const done = s.n < current;
          const now = s.n === current;
          return (
            <div key={s.n} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', paddingBottom: s.n < 4 ? 10 : 0 }}>
              <div style={{
                flex: '0 0 auto', width: 19, height: 19, borderRadius: '50%', marginTop: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10.5, fontWeight: 700,
                background: done || now ? ink : '#E3E2DD',
                color: done || now ? '#fff' : '#8A8A85',
              }}>
                {done ? '✓' : s.n}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: now ? 700 : 500, color: now ? '#111' : '#6B6B68' }}>
                  {s.title}{now && s.n === 3 ? ' — שימו לב' : ''}
                </div>
                <div style={{ fontSize: 11.5, color: '#9A9A95', lineHeight: 1.5 }}>{s.text}</div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={card}>
        <Header />
        <Progress />
        <div style={{ fontSize: 11, letterSpacing: '.08em', color: '#9A9A95', marginBottom: 8 }}>
          שלב {step} מתוך {lastStep} · {stepTitles[step - 1]}
        </div>

        {step === 1 && (
          <>
            <div style={{ fontSize: 24, fontWeight: 500, color: '#111', marginBottom: 6 }}>נעים להכיר{greetName ? `, ${greetName}` : ''}</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: '#6B6B68', marginBottom: 20 }}>
              כדי ש{info?.firmName || 'המשרד'} יוכל לייצג אתכם מול רשויות המס, נאסוף את הפרטים הנדרשים. לוקח כדקה.
            </div>

            <ProcessMap current={1} />

            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <label style={{ ...label, flex: 1 }}>שם פרטי
                <input style={inputStyle} value={firstName} onChange={e => setFirstName(e.target.value)}
                  placeholder="ישראל" autoComplete="given-name" />
              </label>
              <label style={{ ...label, flex: 1 }}>שם משפחה
                <input style={inputStyle} value={lastName} onChange={e => setLastName(e.target.value)}
                  placeholder="ישראלי" autoComplete="family-name" />
              </label>
            </div>

            <div style={fieldBox}>
              <label style={label}>תעודת זהות
                <input style={inputStyle} inputMode="numeric" maxLength={9} value={idNumber}
                  onChange={e => setIdNumber(e.target.value.replace(/\D/g, ''))} placeholder="9 ספרות" dir="ltr" />
              </label>
            </div>

            <div style={{ marginBottom: 22 }}>
              <label style={label}>תאריך לידה
                <input style={inputStyle} type="date" value={birthDate} max={new Date().toISOString().slice(0, 10)}
                  onChange={e => setBirthDate(e.target.value)} />
              </label>
            </div>

            <div style={{ marginBottom: 22 }}>
              <div style={{ ...label, marginBottom: 8 }}>אמצעי זיהוי נוסף <span style={{ color: '#9A9A95' }}>— בחרו אחד</span></div>
              <div style={{ display: 'flex', gap: 7, marginBottom: 12 }}>
                {SECONDARY_ORDER.map(t => {
                  const sel = secondaryType === t;
                  const short = t === 'parentId' ? 'ת.ז. הורה' : t === 'driverLicense' ? 'רישיון נהיגה' : 'דרכון';
                  return (
                    <div key={t} onClick={() => setSecondaryType(t)}
                      style={{ flex: 1, textAlign: 'center', cursor: 'pointer', fontSize: 12.5, fontWeight: sel ? 500 : 400,
                        padding: '8px 6px', borderRadius: 8,
                        background: sel ? ink : '#fff', color: sel ? '#fff' : '#6B6B68',
                        border: sel ? `1px solid ${ink}` : '1px solid #E3E2DD' }}>
                      {short}
                    </div>
                  );
                })}
              </div>
              <input style={inputStyle} value={secondaryValue} onChange={e => setSecondaryValue(e.target.value)}
                placeholder={ONBOARDING_SECONDARY_LABELS[secondaryType]} />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ fontSize: 24, fontWeight: 500, color: '#111', marginBottom: 6 }}>איך נשיג אתכם?</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: '#6B6B68', marginBottom: 26 }}>
              הפרטים האלה נדרשים לטופס ייפוי הכוח, ודרכם נעדכן אתכם בהתקדמות.
            </div>

            <div style={fieldBox}>
              <label style={label}>טלפון נייד
                <input style={inputStyle} type="tel" inputMode="tel" dir="ltr" value={phone}
                  onChange={e => setPhone(e.target.value)} placeholder="050-1234567" autoComplete="tel" />
              </label>
            </div>

            <div style={fieldBox}>
              <label style={label}>כתובת מייל
                <input style={inputStyle} type="email" inputMode="email" dir="ltr" value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="israel@example.com" autoComplete="email" />
              </label>
            </div>

            <div style={fieldBox}>
              <label style={label}>עיר מגורים
                <input style={inputStyle} value={city} onChange={e => setCity(e.target.value)}
                  placeholder="תל אביב" autoComplete="address-level2" />
              </label>
            </div>

            <div style={{ marginBottom: 22 }}>
              <label style={label}>רחוב ומספר בית
                <input style={inputStyle} value={address} onChange={e => setAddress(e.target.value)}
                  placeholder="הרצל 10, דירה 3" autoComplete="street-address" />
              </label>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div style={{ fontSize: 24, fontWeight: 500, color: '#111', marginBottom: 6 }}>מצב משפחתי</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: '#6B6B68', marginBottom: 22 }}>
              המצב המשפחתי קובע איך מתנהל תיק המס שלכם ברשויות.
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ ...label, marginBottom: 8 }}>אני</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {FAMILY_ORDER.map(f => {
                  const sel = familyStatus === f;
                  return (
                    <div key={f} onClick={() => { setFamilyStatus(f); setFamilyYear(''); }}
                      style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: sel ? 500 : 400,
                        padding: '9px 14px', borderRadius: 8,
                        background: sel ? ink : '#fff', color: sel ? '#fff' : '#6B6B68',
                        border: sel ? `1px solid ${ink}` : '1px solid #E3E2DD' }}>
                      {FAMILY_STATUS_LABELS[f]}
                    </div>
                  );
                })}
              </div>
            </div>

            {yearLabel && (
              <div style={fieldBox}>
                <label style={label}>{yearLabel}
                  <input style={inputStyle} inputMode="numeric" maxLength={4} dir="ltr" value={familyYear}
                    onChange={e => setFamilyYear(e.target.value.replace(/\D/g, ''))} placeholder={String(CURRENT_YEAR - 5)} />
                </label>
              </div>
            )}

            {familyStatus === 'married' && (
              <div style={{ marginTop: 6, paddingTop: 16, borderTop: '1px solid #F0EFEB' }}>
                <div style={{ fontSize: 12.5, color: '#6B6B68', lineHeight: 1.6, marginBottom: 14 }}>
                  {'\u{1F491}'} כששני בני הזוג נשואים, שניהם חותמים על ייפוי הכוח.
                </div>
                <div style={fieldBox}>
                  <label style={label}>שם מלא של בן/בת הזוג
                    <input style={inputStyle} value={spouseName} onChange={e => setSpouseName(e.target.value)}
                      placeholder="שם פרטי ושם משפחה" />
                  </label>
                </div>
                <div style={fieldBox}>
                  <label style={label}>תעודת זהות של בן/בת הזוג
                    <input style={inputStyle} inputMode="numeric" maxLength={9} dir="ltr" value={spouseIdNumber}
                      onChange={e => setSpouseIdNumber(e.target.value.replace(/\D/g, ''))} placeholder="9 ספרות" />
                  </label>
                </div>
                <div style={{ marginBottom: 22 }}>
                  <label style={label}>מייל של בן/בת הזוג <span style={{ color: '#9A9A95' }}>— לא חובה</span>
                    <input style={inputStyle} type="email" inputMode="email" dir="ltr" value={spouseEmail}
                      onChange={e => setSpouseEmail(e.target.value)} placeholder="אם ריק — נשלח הכל אליכם" />
                  </label>
                </div>
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, background: '#F7F6F3', borderRadius: 9, padding: '10px 12px', marginBottom: 22 }}>
          <span style={{ color: accent, marginTop: 1 }}>{'\u{1F6E1}'}</span>
          <span style={{ fontSize: 11.5, lineHeight: 1.5, color: '#6B6B68' }}>הפרטים מוצפנים ומשמשים אך ורק להקמת הייצוג מול רשויות המס. לא יועברו לאף גורם אחר.</span>
        </div>

        {error && (
          <div style={{ marginBottom: 16, padding: '10px 12px', background: '#FCEBEB', color: '#A32D2D', borderRadius: 9, fontSize: 12.5 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          {step > 1 && (
            <button type="button" onClick={() => { setError(null); setStep(step - 1); }} disabled={busy}
              style={{ flex: '0 0 auto', background: 'transparent', color: ink, border: `1px solid #E3E2DD`,
                borderRadius: btnRadius, padding: '13px 18px', fontSize: 14.5, cursor: busy ? 'default' : 'pointer' }}>
              חזרה
            </button>
          )}
          <button type="button" onClick={handleNext} disabled={busy}
            style={{ flex: 1, ...ctaStyle, borderRadius: btnRadius, padding: 13, fontSize: 14.5, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'שולח…' : step >= lastStep ? 'שליחה ואימות' : 'המשך'}
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: 22, paddingTop: 16, borderTop: '1px solid #F0EFEB', fontSize: 11, color: '#9A9A95' }}>
          {info?.firmName}
        </div>
      </div>
    </div>
  );
}
