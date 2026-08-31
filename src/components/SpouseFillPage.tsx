// ─── הדף של בן/בת הזוג (?spousefill=) ────────────────────────────────────────
//
// נולד מ«אין לי מושג, בלי אשתי/בעלי אני אבוד/ה» שבטופס הקליטה: הלקוח נדרש
// לת.ז., תאריך לידה ומספר רישיון/דרכון **של אדם אחר**, ולרוב הוא לא יודע
// אותם בעל פה. במקום להיתקע — קישור משלו/ה, לחלק שלו/ה בלבד.
//
// ‼ מסך אחד ולא אשף: זה בסך הכול שלושה שדות וצילום. אשף בן ארבעה שלבים על
//   ארבעה פרטים הוא בירוקרטיה, לא הכוונה.
// ‼ הדף אינו מגיש את הבקשה ואינו נוגע בשום שדה של הלקוח — הוא כותב את
//   המפתחות של בן/בת הזוג בלבד (מיגרציה 149). הלקוח כבר סיים בדרכו.
// ‼ השם אינו נשאל כאן: הלקוח מילא אותו, ואי אפשר להתבלבל עליו. שאלה שכבר
//   נענתה, שנשאלת שוב, נקראת כאילו לא סמכו על התשובה הראשונה.

import { useEffect, useState } from 'react';
import ClientPageState from './ui/ClientPageState';
import { supabase } from '../lib/supabase';
import {
  AuthorityRepresentations,
  ONBOARDING_SECONDARY_LABELS,
  OnboardingSecondaryType,
} from '../types';
import { shaamSubmissions } from '../utils/repScope';
import { docKindFor, docKindPrompt, type IdentityDocsMap } from '../utils/identityEvidence';
import { FirmBranding } from '../types/firmProfile';
import { deriveQuotationBrand } from './quotations/quotationBranding';
import { isValidIsraeliId } from '../utils/israeliId';

interface Props {
  token: string;
}

interface Info {
  firmName: string;
  branding: FirmBranding;
  clientName: string;
  spouseName: string;
  spouseFirstName: string;
  scope: AuthorityRepresentations;
  alreadySubmitted: boolean;
  docs: IdentityDocsMap;
}

const SECONDARY_ORDER: OnboardingSecondaryType[] = ['parentId', 'driverLicense', 'passport'];

type Phase = 'loading' | 'invalid' | 'form' | 'done';

export default function SpouseFillPage({ token }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<Info | null>(null);
  const [idNumber, setIdNumber] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [secondaryType, setSecondaryType] = useState<OnboardingSecondaryType>('parentId');
  const [secondaryValue, setSecondaryValue] = useState('');
  const [docs, setDocs] = useState<IdentityDocsMap>({});
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: e } = await supabase.rpc('get_spouse_onboarding', { p_token: token });
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (e || !row) { setPhase('invalid'); return; }
      setInfo({
        firmName: row.firm_name || 'המשרד',
        branding: row.branding || {},
        clientName: row.client_name || '',
        spouseName: row.spouse_name || '',
        spouseFirstName: row.spouse_first_name || '',
        scope: (row.scope || {}) as AuthorityRepresentations,
        alreadySubmitted: !!row.already_submitted,
        docs: (row.identity_docs || {}) as IdentityDocsMap,
      });
      setDocs((row.identity_docs || {}) as IdentityDocsMap);
      setPhase(row.already_submitted ? 'done' : 'form');
    })();
    return () => { cancelled = true; };
  }, [token]);

  const brand = deriveQuotationBrand({
    id: '', firmName: info?.firmName, branding: info?.branding ?? {},
    communication: {}, settings: {},
  } as never);
  const ink = brand.ink;
  const accent = brand.accent;
  const logoUrl = brand.logoUrl;
  const btnRadius = brand.buttonStyle === 'pill' ? 999 : brand.radius;

  // למה מבקשים ממנו/ה בכלל — נגזר מאותו מקור אמת של מסך הרו"ח.
  const mySub = info
    ? shaamSubmissions(info.scope, {
        married: true, clientName: info.clientName, spouseName: info.spouseName,
      }).find(s => s.target === 'spouse')
    : undefined;

  const docKind = docKindFor(secondaryType);
  const haveDoc = (docs.spouse ?? []).length > 0;
  const greet = (info?.spouseFirstName || info?.spouseName || '').trim().split(/\s+/)[0] || '';

  async function uploadDoc(file: File) {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('token', token);
      body.append('person', 'spouse');
      body.append('docKind', docKind);
      body.append('file', file);
      const { data, error: fnErr } = await supabase.functions.invoke('onboarding-upload-id', { body });
      if (fnErr || !data?.ok) {
        const code = data?.error;
        setError(
          code === 'too_large' ? 'הקובץ גדול מדי - עד 10MB'
            : code === 'type_not_allowed' ? 'אפשר לצרף תמונה או PDF בלבד'
              : code === 'rate_limited' ? 'הועלו יותר מדי קבצים. נסו שוב בעוד שעה'
                : 'ההעלאה לא הצליחה. נסו שוב, ואם זה חוזר - פנו למשרד.',
        );
        return;
      }
      setDocs(prev => ({
        ...prev,
        spouse: [...(prev.spouse ?? []), { documentId: data.documentId, docKind, fileName: file.name }],
      }));
    } finally {
      setUploading(false);
    }
  }

  function validate(): string | null {
    if (!/^\d{9}$/.test(idNumber.trim())) return 'יש להזין 9 ספרות בתעודת הזהות';
    if (!isValidIsraeliId(idNumber.trim())) return 'מספר תעודת הזהות אינו תקין - בדקו שוב';
    if (!birthDate) return 'יש להזין תאריך לידה';
    if (new Date(birthDate) > new Date()) return 'תאריך הלידה לא יכול להיות בעתיד';
    if (!secondaryValue.trim()) return `יש להזין ${ONBOARDING_SECONDARY_LABELS[secondaryType]}`;
    if (!haveDoc) return `יש לצרף ${docKindPrompt(docKind)}`;
    return null;
  }

  async function submit() {
    const v = validate();
    if (v) { setError(v); return; }
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('submit_spouse_onboarding', {
      p_token: token,
      p_id_number: idNumber.trim(),
      p_birth_date: birthDate,
      p_secondary_type: secondaryType,
      p_secondary_value: secondaryValue.trim(),
    });
    setBusy(false);
    if (e || data === false) {
      setError('השליחה לא הצליחה. נסו שוב, ואם זה חוזר - פנו למשרד.');
      return;
    }
    setPhase('done');
  }

  if (phase === 'loading') return <ClientPageState quiet body="רגע…" />;
  if (phase === 'invalid') {
    return <ClientPageState mark="🔗" title="הקישור אינו תקף"
      body="ייתכן שהקישור הועתק חלקית. בקשו מבן/בת הזוג לשלוח אותו שוב." />;
  }

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

  const Header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 30 }}>
      {logoUrl
        ? <img src={logoUrl} alt={info?.firmName || ''} style={{ maxHeight: 36, maxWidth: 150, objectFit: 'contain' }} />
        : <span style={{ fontSize: 12.5, color: ink }}>{info?.firmName}</span>}
      <span style={{ marginInlineStart: 'auto', fontSize: 11, color: '#6B6B68' }}>מאובטח</span>
    </div>
  );

  if (phase === 'done') {
    return (
      <div style={page}>
        <div style={card}>
          {Header}
          <div style={{ fontSize: 34, marginBottom: 10 }}>{'✓'}</div>
          <div style={{ fontSize: 24, fontWeight: 500, color: '#111', marginBottom: 8 }}>
            תודה{greet ? `, ${greet}` : ''}!
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.7, color: '#6B6B68' }}>
            הפרטים שלכם הגיעו ל{info?.firmName}. אין צורך בשום פעולה נוספת מצדכם -
            {info?.clientName ? ` ${info.clientName.split(/\s+/)[0]} כבר השלים/ה את השאר.` : ' השאר כבר טופל.'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={card}>
        {Header}

        <div style={{ fontSize: 24, fontWeight: 500, color: '#111', marginBottom: 6 }}>
          שלום{greet ? ` ${greet}` : ''}
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.7, color: '#6B6B68', marginBottom: 22 }}>
          {info?.clientName ? `${info.clientName} ממלא/ת ` : 'ממלאים כרגע '}
          טופס ייצוג מול רשויות המס אצל {info?.firmName}, ולא ידע/ה את הפרטים שלכם בעל פה.
          {mySub
            ? ` מכיוון שיש על שמכם תיק (${mySub.authoritiesLabel}), הרישום ברשויות נעשה גם על הפרטים שלכם.`
            : ''}
          {' '}שלושה שדות וצילום - וזהו.
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={label}>תעודת זהות
            <input style={inputStyle} inputMode="numeric" maxLength={9} dir="ltr" value={idNumber}
              onChange={e => setIdNumber(e.target.value.replace(/\D/g, ''))} placeholder="9 ספרות" />
          </label>
        </div>

        <div style={{ marginBottom: 22 }}>
          <label style={label}>תאריך לידה
            <input style={inputStyle} type="date" value={birthDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={e => setBirthDate(e.target.value)} />
          </label>
        </div>

        <div style={{ marginBottom: 22 }}>
          <div style={{ ...label, marginBottom: 8 }}>
            אמצעי זיהוי נוסף <span style={{ color: '#9A9A95' }}>- בחרו אחד</span>
          </div>
          <div style={{ display: 'flex', gap: 7, marginBottom: 12 }}>
            {SECONDARY_ORDER.map(t => {
              const sel = secondaryType === t;
              const short = t === 'parentId' ? 'ת.ז. הורה' : t === 'driverLicense' ? 'רישיון נהיגה' : 'דרכון';
              return (
                <div key={t} onClick={() => setSecondaryType(t)}
                  style={{
                    flex: 1, textAlign: 'center', cursor: 'pointer', fontSize: 12.5, fontWeight: sel ? 500 : 400,
                    padding: '8px 6px', borderRadius: 8,
                    background: sel ? ink : '#fff', color: sel ? '#fff' : '#6B6B68',
                    border: sel ? `1px solid ${ink}` : '1px solid #E3E2DD',
                  }}>
                  {short}
                </div>
              );
            })}
          </div>
          <input style={inputStyle} dir="ltr" value={secondaryValue}
            onChange={e => setSecondaryValue(e.target.value)}
            placeholder={ONBOARDING_SECONDARY_LABELS[secondaryType]} />
        </div>

        <div style={{
          marginBottom: 20, padding: '14px 14px 12px', borderRadius: 10,
          border: `1px solid ${haveDoc ? '#CFE3D4' : '#E3E2DD'}`,
          background: haveDoc ? '#F5FAF6' : '#fff',
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 2 }}>
            {docKindPrompt(docKind)}
          </div>
          <div style={{ fontSize: 12.5, color: '#6B6B68', marginBottom: 10 }}>
            הרשויות מבקשות לראות את התעודה עצמה, לא רק את המספר. צילום מהטלפון מספיק.
          </div>
          {(docs.spouse ?? []).map(d => (
            <div key={d.documentId} style={{ fontSize: 12.5, color: '#2E7D53', marginBottom: 6 }}>
              {'✓'} {d.fileName || 'הקובץ התקבל'}
            </div>
          ))}
          <label style={{
            display: 'inline-block', cursor: uploading ? 'default' : 'pointer',
            border: `1px solid ${ink}`, borderRadius: btnRadius, padding: '9px 16px',
            fontSize: 13.5, color: ink, opacity: uploading ? 0.6 : 1,
          }}>
            {uploading ? 'מעלה…' : haveDoc ? 'צירוף קובץ נוסף' : 'צילום או קובץ'}
            <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
              disabled={uploading}
              onChange={e => { const f = e.target.files?.[0]; if (f) void uploadDoc(f); e.target.value = ''; }} />
          </label>
        </div>

        {error && (
          <div style={{ fontSize: 13, color: '#B4433B', marginBottom: 14, lineHeight: 1.6 }}>{error}</div>
        )}

        <button type="button" disabled={busy} onClick={() => void submit()}
          style={{
            width: '100%', border: 'none', borderRadius: btnRadius, padding: '13px 16px',
            fontSize: 15, fontWeight: 500, color: '#fff', background: accent,
            cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
          }}>
          {busy ? 'שולח…' : 'שליחת הפרטים'}
        </button>

        <div style={{ fontSize: 12, color: '#9A9A95', lineHeight: 1.5, marginTop: 14, textAlign: 'center' }}>
          הפרטים מוצפנים ומשמשים אך ורק להקמת הייצוג מול רשויות המס.
        </div>
      </div>
    </div>
  );
}
