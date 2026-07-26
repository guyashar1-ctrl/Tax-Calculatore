// ─── דף שאלון עצמאי (?intake=TOKEN) ─────────────────────────────────────────
// קישור שנשלח יזום מכרטיס הלקוח — בלי הליך ייצוג ובלי שלב הזדהות (הטוקן עצמו
// הוא האישור, כמו בקישור הייצוג). עוטף את PublicIntake במעטפת ממותגת.

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { FirmBranding } from '../types/firmProfile';
import { deriveQuotationBrand } from './quotations/quotationBranding';
import PublicIntake from './PublicIntake';

interface Props {
  token: string;
}

interface IntakeInfo {
  clientName: string;
  firmName: string;
  branding: FirmBranding;
  sessionStatus: string | null;
}

type Phase = 'loading' | 'invalid' | 'intake' | 'done';

export default function PublicIntakePage({ token }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<IntakeInfo | null>(null);
  const [reopening, setReopening] = useState(false);
  // מפתח שמאלץ טעינה נקייה של השאלון אחרי פתיחה מחדש
  const [intakeRun, setIntakeRun] = useState(0);

  // הלקוח קיבל קישור עדכון אבל כבר מילא השנה — פותחים מחדש; התשובות נשמרות.
  async function handleReopen() {
    setReopening(true);
    try {
      const { data, error } = await supabase.rpc('reopen_intake', { p_token: token });
      if (error || data !== true) return;
      setIntakeRun(n => n + 1);
      setPhase('intake');
    } finally {
      setReopening(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('get_intake', { p_token: token });
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) { setPhase('invalid'); return; }
      setInfo({
        clientName: row.client_name || '',
        firmName: row.firm_name || 'המשרד',
        branding: row.branding || {},
        sessionStatus: row.session_status ?? null,
      });
      // שאלון שכבר הושלם — מסך תודה במקום שאלות מחדש
      if (row.session_status && row.session_status !== 'in_progress') setPhase('done');
      else setPhase('intake');
    })();
    return () => { cancelled = true; };
  }, [token]);

  // עיצוב אחיד — אותם טוקנים של עמוד ההצעה (מערכת העיצוב המרכזית)
  const brand = deriveQuotationBrand({ id: '', firmName: info?.firmName, branding: info?.branding ?? {}, communication: {}, settings: {} } as any);
  const ink = brand.ink;
  const accent = brand.accent;
  const monogram = brand.monogram;
  const logoUrl = brand.logoUrl;
  const firstName = (info?.clientName || '').trim().split(/\s+/)[0] || '';

  const page: React.CSSProperties = {
    minHeight: '100vh', background: brand.pageBg, display: 'flex', alignItems: 'flex-start',
    justifyContent: 'center', padding: '40px 16px', fontFamily: `'${brand.font}', sans-serif`, direction: 'rtl',
  };
  const card: React.CSSProperties = {
    width: 560, maxWidth: '100%', background: brand.cardBg, border: `1px solid ${brand.border}`,
    borderRadius: brand.radius + 4, padding: '34px 34px 26px', borderTop: `4px solid ${accent}`,
  };

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
          <div style={{ fontSize: 13, color: brand.muted, lineHeight: 1.6 }}>ייתכן שהקישור הועתק חלקית או שאינו פעיל עוד. פנו למשרד לקבלת קישור חדש.</div>
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
            <div style={{ fontSize: 18, fontWeight: 500, color: brand.ink, marginBottom: 5 }}>תודה{firstName ? `, ${firstName}` : ''}! 🎉</div>
            <div style={{ fontSize: 13, color: brand.muted, lineHeight: 1.6 }}>
              קיבלנו את כל הפרטים. {info?.firmName} יעבור עליהם ויחזור אליכם אם יידרש משהו נוסף. אפשר לסגור את החלון.
            </div>
            <button
              onClick={handleReopen}
              disabled={reopening}
              style={{
                marginTop: 18, padding: '10px 22px', borderRadius: brand.buttonStyle === 'pill' ? 999 : brand.radius, border: `1.5px solid ${ink}`,
                background: brand.cardBg, color: ink, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {reopening ? 'פותח…' : 'משהו השתנה? עדכון פרטים ←'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={card}>
        <Header />
        <PublicIntake
          key={intakeRun}
          token={token}
          firstName={firstName}
          ink={ink}
          onDone={() => setPhase('done')}
        />
      </div>
    </div>
  );
}
