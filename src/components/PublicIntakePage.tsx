// ─── דף שאלון עצמאי (?intake=TOKEN) ─────────────────────────────────────────
// קישור שנשלח יזום מכרטיס הלקוח — בלי הליך ייצוג ובלי שלב הזדהות (הטוקן עצמו
// הוא האישור, כמו בקישור הייצוג). עוטף את PublicIntake במעטפת ממותגת.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { FirmBranding } from '../types/firmProfile';
import { deriveQuotationBrand } from './quotations/quotationBranding';
import PublicIntake, { PublicIntakeView, type IntakeInitial } from './PublicIntake';
import SampleSimulatedNote from './linkedScreens/SampleNote';
import { samplePublicIntakePageActions } from './linkedScreens/sampleIntakeActions';
import type { SimulatedResult } from './linkedScreens/sampleActions';

interface Props {
  token: string;
}

export interface IntakeInfo {
  clientName: string;
  firmName: string;
  branding: FirmBranding;
  sessionStatus: string | null;
}

type Phase = 'loading' | 'invalid' | 'intake' | 'done';

/** כל מה שהדף עושה מול העולם. בעמוד האמיתי — השרת; בתצוגה לדוגמה — פעולה שאינה נוגעת בכלום. */
export interface PublicIntakePageActions {
  /** הלקוח קיבל קישור עדכון אבל כבר מילא השנה — פותחים מחדש; התשובות נשמרות. */
  reopen(): Promise<{ status: 'reopened' } | { status: 'failed' } | SimulatedResult>;
}

export function livePublicIntakePageActions(token: string): PublicIntakePageActions {
  return {
    async reopen() {
      const { data, error } = await supabase.rpc('reopen_intake', { p_token: token });
      if (error || data !== true) return { status: 'failed' };
      return { status: 'reopened' };
    },
  };
}

/** כל מה שהדף צריך כדי להיצייר — בלי טעינה ובלי רשת. */
export interface PublicIntakePageData {
  info: IntakeInfo;
  phase: 'intake' | 'done';
  /**
   * ההפעלה של השאלון — רק בתצוגה לדוגמה. בעמוד האמיתי השאלון טוען אותה בעצמו
   * (start_intake), ולכן חסר כאן.
   */
  initial?: IntakeInitial;
}

export default function PublicIntakePage({ token }: Props) {
  const [loaded, setLoaded] = useState<PublicIntakePageData | 'loading' | 'invalid'>('loading');
  const actions = useMemo(() => livePublicIntakePageActions(token), [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('get_intake', { p_token: token });
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) { setLoaded('invalid'); return; }
      const info: IntakeInfo = {
        clientName: row.client_name || '',
        firmName: row.firm_name || 'המשרד',
        branding: row.branding || {},
        sessionStatus: row.session_status ?? null,
      };
      // שאלון שכבר הושלם — מסך תודה במקום שאלות מחדש
      setLoaded({ info, phase: row.session_status && row.session_status !== 'in_progress' ? 'done' : 'intake' });
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (loaded === 'loading') return <IntakeShell state="loading" />;
  if (loaded === 'invalid') return <IntakeShell state="invalid" />;
  return <PublicIntakePageView data={loaded} token={token} actions={actions} />;
}

/** מעטפת הדף בזמן טעינה / קישור לא תקין — ממותגת כמו שאר הדף, אבל עוד אין מיתוג להציג. */
function IntakeShell({ state }: { state: 'loading' | 'invalid' }) {
  const brand = deriveQuotationBrand({ id: '', firmName: undefined, branding: {}, communication: {}, settings: {} } as any);
  const page: React.CSSProperties = {
    minHeight: '100vh', background: brand.pageBg, display: 'flex', alignItems: 'flex-start',
    justifyContent: 'center', padding: '40px 16px', fontFamily: `'${brand.font}', sans-serif`, direction: 'rtl',
  };
  const card: React.CSSProperties = {
    width: 560, maxWidth: '100%', background: brand.cardBg, border: `1px solid ${brand.border}`,
    borderRadius: brand.radius + 4, padding: '34px 34px 26px', borderTop: `4px solid ${brand.accent}`,
  };
  if (state === 'loading') {
    return <div style={page}><div style={{ ...card, textAlign: 'center', color: brand.muted }}>טוען…</div></div>;
  }
  return (
    <div style={page}>
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 500, color: brand.ink, marginBottom: 5 }}>הקישור אינו תקין</div>
        <div style={{ fontSize: 13, color: brand.muted, lineHeight: 1.6 }}>ייתכן שהקישור הועתק חלקית או שאינו פעיל עוד. פנו למשרד לקבלת קישור חדש.</div>
      </div>
    </div>
  );
}

export type PublicIntakePageViewProps = { data: PublicIntakePageData } & (
  | { mode?: 'live'; token: string; actions: PublicIntakePageActions }
  /** בתצוגה לדוגמה אפשר להשמיט את `actions` — ברירת המחדל לא נוגעת בכלום; `data.initial` חובה. */
  | { mode: 'sample'; actions?: PublicIntakePageActions }
);

/**
 * דף השאלון עצמו, בלי טעינה: כל הנתונים נכנסים ב-`data` וכל מה שיוצא החוצה עובר
 * ב-`actions`. כך אותו דף בדיוק משמש את הקישור האמיתי ואת «צפייה» במשרד.
 */
export function PublicIntakePageView(props: PublicIntakePageViewProps) {
  const actions: PublicIntakePageActions = props.actions ?? samplePublicIntakePageActions;
  const info = props.data.info;
  const initial = props.data.initial;
  const [phase, setPhase] = useState<Phase>(props.data.phase);
  const [reopening, setReopening] = useState(false);
  // מפתח שמאלץ טעינה נקייה של השאלון אחרי פתיחה מחדש
  const [intakeRun, setIntakeRun] = useState(0);
  const [simulated, setSimulated] = useState(false);

  // הלקוח קיבל קישור עדכון אבל כבר מילא השנה — פותחים מחדש; התשובות נשמרות.
  async function handleReopen() {
    setReopening(true);
    setSimulated(false);
    try {
      const res = await actions.reopen();
      if (res.status === 'simulated') { setSimulated(true); return; }
      if (res.status === 'failed') return;
      setIntakeRun(n => n + 1);
      setPhase('intake');
    } finally {
      setReopening(false);
    }
  }

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
            {simulated && <SampleSimulatedNote />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={card}>
        <Header />
        {props.mode === 'sample' ? (
          initial && (
            <PublicIntakeView
              mode="sample"
              key={intakeRun}
              initial={initial}
              firstName={firstName}
              ink={ink}
              onDone={() => setPhase('done')}
            />
          )
        ) : (
          <PublicIntake
            key={intakeRun}
            token={props.token}
            firstName={firstName}
            ink={ink}
            onDone={() => setPhase('done')}
          />
        )}
      </div>
    </div>
  );
}
