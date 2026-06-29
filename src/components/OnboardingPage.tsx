import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  OnboardingSecondaryType,
  ONBOARDING_SECONDARY_LABELS,
} from '../types';
import { BRAND_THEMES, deriveMonogram, FirmBranding } from '../types/firmProfile';

interface Props {
  token: string;
}

interface OnboardingInfo {
  clientName: string;
  firmName: string;
  branding: FirmBranding;
  alreadySubmitted: boolean;
}

type Phase = 'loading' | 'invalid' | 'form' | 'done' | 'already';

const SECONDARY_ORDER: OnboardingSecondaryType[] = ['parentId', 'driverLicense', 'passport'];

export default function OnboardingPage({ token }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<OnboardingInfo | null>(null);
  const [idNumber, setIdNumber] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [secondaryType, setSecondaryType] = useState<OnboardingSecondaryType>('parentId');
  const [secondaryValue, setSecondaryValue] = useState('');
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
      setInfo({
        clientName: row.client_name || '',
        firmName: row.firm_name || 'המשרד',
        branding: row.branding || {},
        alreadySubmitted: !!row.already_submitted,
      });
      setPhase(row.already_submitted ? 'already' : 'form');
    })();
    return () => { cancelled = true; };
  }, [token]);

  const theme = BRAND_THEMES.find(t => t.id === (info?.branding.theme ?? 'monochrome')) ?? BRAND_THEMES[0];
  const ink = theme.ink;
  const accent = info?.branding.accentColor || theme.accent;
  const monogram = (info?.branding.monogram || deriveMonogram(info?.firmName)).slice(0, 2);
  const firstName = (info?.clientName || '').trim().split(/\s+/)[0] || '';

  function validate(): string | null {
    if (!/^\d{9}$/.test(idNumber.trim())) return 'תעודת זהות חייבת להכיל 9 ספרות';
    if (!birthDate) return 'יש להזין תאריך לידה';
    if (!secondaryValue.trim()) return `יש להזין ${ONBOARDING_SECONDARY_LABELS[secondaryType]}`;
    return null;
  }

  async function handleSubmit() {
    const v = validate();
    if (v) { setError(v); return; }
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('submit_onboarding', {
      p_token: token,
      p_id_number: idNumber.trim(),
      p_birth_date: birthDate,
      p_secondary_type: secondaryType,
      p_secondary_value: secondaryValue.trim(),
    });
    if (error || data === false) {
      setError('אירעה שגיאה בשליחה. נסו שוב, או פנו למשרד.');
      setBusy(false);
      return;
    }
    setPhase('done');
  }

  // ── styles ──
  const page: React.CSSProperties = {
    minHeight: '100vh', background: '#F1F0EC', display: 'flex', alignItems: 'flex-start',
    justifyContent: 'center', padding: '40px 16px', fontFamily: "'Heebo', sans-serif", direction: 'rtl',
  };
  const card: React.CSSProperties = {
    width: 460, maxWidth: '100%', background: '#fff', border: '1px solid #E7E6E1',
    borderRadius: 16, padding: '34px 34px 26px',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: '#fff', border: '1px solid #E3E2DD',
    borderRadius: 9, padding: '11px 13px', fontSize: 14, color: '#1A1A1A', marginTop: 6,
  };
  const label: React.CSSProperties = { fontSize: 12.5, color: '#6B6B68', display: 'block' };

  function Header() {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 30 }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', border: `1.5px solid ${ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ink, fontWeight: 500, fontSize: 12 }}>{monogram}</div>
        <span style={{ fontSize: 12.5, color: ink }}>{info?.firmName}</span>
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
            <div style={{ fontSize: 13, color: '#6B6B68', lineHeight: 1.6 }}>תודה{firstName ? `, ${firstName}` : ''}. כבר קיבלנו את פרטי ההזדהות שלכם. אפשר לסגור את החלון.</div>
          </div>
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
            <div style={{ fontSize: 18, fontWeight: 500, color: '#111', marginBottom: 5 }}>תודה{firstName ? `, ${firstName}` : ''}. קיבלנו את הפרטים.</div>
            <div style={{ fontSize: 13, color: '#6B6B68', lineHeight: 1.6 }}>{info?.firmName} יכין את בקשת הייצוג ויחזור אליכם בהקדם. אפשר לסגור את החלון.</div>
          </div>
        </div>
      </div>
    );
  }

  // phase === 'form'
  return (
    <div style={page}>
      <div style={card}>
        <Header />
        <div style={{ fontSize: 11, letterSpacing: '.08em', color: '#9A9A95', marginBottom: 8 }}>אימות זהות</div>
        <div style={{ fontSize: 24, fontWeight: 500, color: '#111', marginBottom: 6 }}>נעים להכיר{firstName ? `, ${firstName}` : ''}</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: '#6B6B68', marginBottom: 26 }}>
          כדי שנתחיל לייצג אתכם מול רשויות המס, נשאר רק לאמת את הזהות. לוקח פחות מדקה.
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={label}>תעודת זהות
            <input style={inputStyle} inputMode="numeric" maxLength={9} value={idNumber}
              onChange={e => setIdNumber(e.target.value.replace(/\D/g, ''))} placeholder="9 ספרות" />
          </label>
        </div>

        <div style={{ marginBottom: 22 }}>
          <label style={label}>תאריך לידה
            <input style={inputStyle} type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} />
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

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, background: '#F7F6F3', borderRadius: 9, padding: '10px 12px', marginBottom: 22 }}>
          <span style={{ color: accent, marginTop: 1 }}>🛡</span>
          <span style={{ fontSize: 11.5, lineHeight: 1.5, color: '#6B6B68' }}>הפרטים מוצפנים ומשמשים אך ורק להקמת הייצוג מול רשויות המס. לא יועברו לאף גורם אחר.</span>
        </div>

        {error && (
          <div style={{ marginBottom: 16, padding: '10px 12px', background: '#FCEBEB', color: '#A32D2D', borderRadius: 9, fontSize: 12.5 }}>{error}</div>
        )}

        <button onClick={handleSubmit} disabled={busy}
          style={{ width: '100%', background: ink, color: '#fff', border: 'none', borderRadius: 10, padding: 13, fontSize: 14.5, fontWeight: 500, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
          {busy ? 'שולח…' : 'שליחה ואימות'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 22, paddingTop: 16, borderTop: '1px solid #F0EFEB', fontSize: 11, color: '#9A9A95' }}>
          {info?.firmName}
        </div>
      </div>
    </div>
  );
}
