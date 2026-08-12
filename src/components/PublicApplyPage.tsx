// ─── דף מילוי הפרטים הציבורי (?apply=TOKEN) ─────────────────────────────────
// קישור משרדי קבוע ("+ אדם חדש → שליחת קישור למילוי פרטים", שלב 4). מודע
// למינימום: שם מלא ואימייל בלבד. שולח דרך submit-application — לא נוגע
// ב-RPC ציבורי, ולא נכתב ישירות ל-leads (בלי מדיניות anon insert).
//
// ‼ הצלחה תמיד נראית אותו דבר — גם אם המייל כבר קיים כלקוח, גם אם ההגשה
//   כפולה. הדף לא יודע ולא צריך לדעת. ההתאמה נבדקת ומוצגת רק לרו"ח המחובר.

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { FirmBranding } from '../types/firmProfile';
import { deriveQuotationBrand } from './quotations/quotationBranding';

interface Props {
  token: string;
}

interface ApplyInfo {
  firmName: string;
  branding: FirmBranding;
}

type Phase = 'loading' | 'invalid' | 'form' | 'sending' | 'done';

export default function PublicApplyPage({ token }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<ApplyInfo | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState(''); // מלכודת דבורים — נשאר ריק אצל אדם אמיתי
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.functions.invoke('submit-application', {
        body: { action: 'resolve', token },
      });
      if (cancelled) return;
      if (error || !data?.ok) { setPhase('invalid'); return; }
      setInfo({ firmName: data.firmName || '', branding: data.branding || {} });
      setPhase('form');
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = fullName.trim();
    const mail = email.trim();
    if (!name) { setFieldError('נא למלא שם מלא'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { setFieldError('כתובת אימייל לא תקינה'); return; }
    setFieldError(null);
    setPhase('sending');
    const { data, error } = await supabase.functions.invoke('submit-application', {
      body: { action: 'submit', token, fullName: name, email: mail, hp: website },
    });
    if (error || !data?.ok) {
      setFieldError('לא הצלחנו לשלוח כרגע. אפשר לנסות שוב בעוד רגע.');
      setPhase('form');
      return;
    }
    setPhase('done');
  }

  const brand = deriveQuotationBrand({
    id: '', firmName: info?.firmName, branding: info?.branding ?? {}, communication: {}, settings: {},
  } as any);
  const ink = brand.ink;
  const accent = brand.accent;
  const monogram = brand.monogram;
  const logoUrl = brand.logoUrl;
  const firstName = fullName.trim().split(/\s+/)[0] || '';

  const page: React.CSSProperties = {
    minHeight: '100vh', background: brand.pageBg, display: 'flex', alignItems: 'flex-start',
    justifyContent: 'center', padding: '40px 16px', fontFamily: `'${brand.font}', sans-serif`, direction: 'rtl',
  };
  const card: React.CSSProperties = {
    width: 440, maxWidth: '100%', background: brand.cardBg, border: `1px solid ${brand.border}`,
    borderRadius: brand.radius + 4, padding: '30px 28px 26px', borderTop: `4px solid ${accent}`,
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', height: 46, borderRadius: brand.radius, border: `1px solid ${brand.border}`,
    padding: '0 14px', fontSize: 15, fontFamily: 'inherit', color: brand.ink, background: '#fff',
    outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = { fontSize: 13, color: brand.muted, marginBottom: 6, display: 'block' };

  function Header() {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
        {logoUrl ? (
          <img src={logoUrl} alt={info?.firmName} style={{ maxHeight: 40 * brand.logoScale, maxWidth: 180 * brand.logoScale, objectFit: 'contain' }} />
        ) : (
          <>
            <div style={{ width: 34, height: 34, borderRadius: '50%', border: `1.5px solid ${ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: ink }}>{monogram}</div>
            <div style={{ fontSize: 14, color: ink }}>{info?.firmName}</div>
          </>
        )}
      </div>
    );
  }

  if (phase === 'loading') {
    return <div style={page}><div style={{ ...card, textAlign: 'center', color: brand.muted }}>טוען…</div></div>;
  }

  if (phase === 'invalid') {
    return (
      <div style={page}>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 500, color: brand.ink, marginBottom: 5 }}>הקישור אינו תקין</div>
          <div style={{ fontSize: 13, color: brand.muted, lineHeight: 1.6 }}>ייתכן שהקישור הועתק חלקית או שהוחלף בקישור חדש. אפשר לפנות למשרד ולבקש קישור עדכני.</div>
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
            <div style={{ fontSize: 18, fontWeight: 500, color: brand.ink, marginBottom: 5 }}>תודה{firstName ? `, ${firstName}` : ''}!</div>
            <div style={{ fontSize: 13, color: brand.muted, lineHeight: 1.6 }}>
              קיבלנו את הפרטים. {info?.firmName || 'המשרד'} יחזור אליך בהקדם. אפשר לסגור את החלון.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={card}>
        <Header />
        <div style={{ fontSize: 16, fontWeight: 500, color: brand.ink, marginBottom: 4 }}>יצירת קשר</div>
        <div style={{ fontSize: 13, color: brand.muted, marginBottom: 20, lineHeight: 1.5 }}>
          שם ואימייל מספיקים כדי שנתחיל — נחזור אליך בהקדם.
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>שם מלא</label>
            <input
              style={inputStyle}
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              disabled={phase === 'sending'}
              autoFocus
              maxLength={120}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>אימייל</label>
            <input
              type="email"
              style={{ ...inputStyle, direction: 'ltr', textAlign: 'right' }}
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={phase === 'sending'}
              maxLength={254}
            />
          </div>
          {/* מלכודת דבורים — מוסתר מעין אדם, נגיש לבוטים שממלאים כל שדה בטופס */}
          <div aria-hidden="true" style={{ position: 'absolute', left: -9999, top: -9999, opacity: 0, height: 0, overflow: 'hidden' }}>
            <label htmlFor="apply-website">אתר</label>
            <input id="apply-website" tabIndex={-1} autoComplete="off"
              value={website} onChange={e => setWebsite(e.target.value)} />
          </div>
          {fieldError && <div style={{ fontSize: 12.5, color: '#c0392b', marginBottom: 10 }}>{fieldError}</div>}
          <button
            type="submit"
            disabled={phase === 'sending'}
            style={{
              width: '100%', height: 46, marginTop: 6,
              borderRadius: brand.buttonStyle === 'pill' ? 999 : brand.radius,
              border: 'none', background: accent, color: '#fff',
              fontSize: 15, fontWeight: 600, cursor: phase === 'sending' ? 'default' : 'pointer',
              fontFamily: 'inherit', opacity: phase === 'sending' ? 0.7 : 1,
            }}
          >
            {phase === 'sending' ? 'שולח…' : 'שליחה'}
          </button>
        </form>
      </div>
    </div>
  );
}
