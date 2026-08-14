import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FirmProfile,
  FirmBranding,
  FirmCommunication,
  LogoSurface,
  REP_TYPE_OPTIONS,
  deriveMonogram,
} from '../types/firmProfile';
import LogoAssetsPanel, { type LogoUploadRequest } from './LogoAssetsPanel';
import { Client } from '../types';
import EmployeesPanel from './EmployeesPanel';
import EmailActivityModule from './EmailActivity/EmailActivityModule';
import QuotationSettings from './quotations/QuotationSettings';
import QuotationDesignStudio from './quotations/QuotationDesignStudio';
import { deriveQuotationBrand } from './quotations/quotationBranding';
import { supabase } from '../lib/supabase';
import { FIRM_PRIVATE_BUCKET, downloadPrivateDataUrl } from '../utils/privateAsset';
import {
  defaultTemplate,
  PLACEHOLDERS_BY_KIND,
  STEP_EMAIL_KIND_LABELS,
  type StepEmailKind,
} from '../../supabase/functions/_shared/stepTemplates.ts';
import {
  ACCOUNTANT_NOTIFICATIONS,
  NOTIFICATION_GROUPS,
  NOTIFICATION_SETTINGS_KEY,
  readNotificationPrefs,
  isNotificationEnabled,
} from '../../supabase/functions/_shared/accountantNotifications.ts';

const LOGO_BUCKET = 'firm-logos';           // לוגו — ציבורי (מוטבע במיילים ללקוחות)
const SIGN_BUCKET = FIRM_PRIVATE_BUCKET;     // חתימה/חותמת — פרטי, גישה מאומתת בלבד
const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2MB
const LOGO_MIME = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];

interface Props {
  profile: FirmProfile;
  clients: Client[];
  onSave: (p: FirmProfile) => Promise<void> | void;
}

type Section = 'identity' | 'branding' | 'design' | 'contact' | 'signature' | 'communication' | 'notifications' | 'paperless' | 'emailActivity' | 'quotations' | 'employees';

// אייקוני הניווט כ-SVG מוטמע. (הפרויקט לא טוען את פונט Tabler, ולכן ה-<i class="ti">
// שהיו כאן קודם פשוט לא הוצגו — זה מחליף אותם באייקונים שבאמת נראים.)
const ICON_PATHS: Record<string, string> = {
  identity: 'M4 5h16v14H4z M10 11a2 2 0 1 0 4 0a2 2 0 0 0 -4 0 M8.5 16.5c.4-1.3 1.8-2 3.5-2s3.1.7 3.5 2',
  branding: 'M12 21a9 9 0 1 1 0-18 8 8 0 0 1 8 8h-3.5a2.5 2.5 0 0 0 0 5H18a2 2 0 0 1 0 5z M7.5 10.5h.01 M11 7.5h.01 M15 9h.01',
  design: 'M4 20s3 .8 5-1.2c1.5-1.5 1-4 3-5l7-7-2-2-7 7c-1 2-3.5 1.5-5 3-2 2-1 5.2-1 5.2z',
  contact: 'M6 3h13v18H6z M6 3v18 M11 10a2 2 0 1 0 4 0a2 2 0 0 0 -4 0 M10.5 16c.3-1.1 1.4-1.7 2.5-1.7s2.2.6 2.5 1.7',
  signature: 'M3 19c3 0 5-2 6-5s2-6 4-6 2 3 0 6-4 4-6 4c3 0 6 1 8 1s3-1 3-1',
  communication: 'M8 9h8 M8 13h5 M4 5h16v11H9l-5 4z',
  bell: 'M10 5a2 2 0 1 1 4 0 7 7 0 0 1 4 6v3a4 4 0 0 0 2 3H4a4 4 0 0 0 2-3v-3a7 7 0 0 1 4-6 M9 17v1a3 3 0 0 0 6 0v-1',
  emailActivity: 'M3 6h18v12H3z M3 7l9 6 9-6',
  quotations: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 13h6 M9 17h4',
  employees: 'M9 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1 M17.5 5.2a3 3 0 0 1 0 5.6 M21 20v-1a4 4 0 0 0-3-3.85',
  mailCog: 'M3 6h18v7 M3 7l9 6 9-6 M17.5 19a2 2 0 1 0 4 0a2 2 0 0 0 -4 0',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  userCheck: 'M9 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1 M16 12.5l2 2 4-4',
  fileUpload: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M12 17v-5 M9.5 14.5 12 12l2.5 2.5',
  dashboard: 'M4 4h7v7H4z M13 4h7v4h-7z M13 10h7v10h-7z M4 13h7v7H4z',
  shieldLock: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M12 11v3',
  photo: 'M4 5h16v14H4z M8.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M4 16l4.5-4.5 3 3L15 11l5 5',
  trash: 'M4 7h16 M10 11v6 M14 11v6 M5.5 7l1 13h11l1-13 M9 7V4h6v3',
  stamp: 'M9 10V6.5a3 3 0 0 1 6 0V10 M5 14h14v3.5H5z M4 20.5h16',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11.5v4.5 M12 8h.01',
};

function NavIcon({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={ICON_PATHS[name] ?? ''} />
    </svg>
  );
}

const ACTIVE_NAV: { id: Section; label: string; icon: string }[] = [
  { id: 'identity', label: 'זהות', icon: 'identity' },
  { id: 'branding', label: 'מותג', icon: 'branding' },
  { id: 'design', label: 'עיצוב עמודי לקוח', icon: 'design' },
  { id: 'contact', label: 'פרטי קשר', icon: 'contact' },
  { id: 'signature', label: 'חתימת מייל', icon: 'signature' },
  { id: 'communication', label: 'ערוצי תקשורת', icon: 'communication' },
  { id: 'notifications', label: 'התראות למשרד', icon: 'bell' },
  { id: 'paperless', label: 'פייפרלס ותקשורת', icon: 'mailCog' },
  { id: 'emailActivity', label: 'פעילות מייל', icon: 'emailActivity' },
  { id: 'quotations', label: 'הצעות מחיר', icon: 'quotations' },
];

const SOON_GROUPS: { group: string; items: { label: string; icon: string }[] }[] = [
  {
    group: 'תקשורת ואוטומציה',
    items: [
      // ‼ "תבניות מייל" ירד מכאן ולא נבנה כמסך נפרד (הכרעת גיא 2026-08-05):
      // הנוסח יושב על הבקשה עצמה, והמייל נגזר ממנו. מנהלים את התבניות מכפתור
      // "תבניות" בדף המסע של כל לקוח. מסך שני היה מקור אמת שני שסותר אותו.
      { label: 'אוטומציות', icon: 'bolt' },
    ],
  },
  {
    group: 'חוויות לקוח',
    items: [
      { label: 'עמודי הזדהות', icon: 'userCheck' },
      { label: 'בקשות מסמכים', icon: 'fileUpload' },
      { label: 'חתימה דיגיטלית', icon: 'signature' },
      { label: 'פורטל לקוחות', icon: 'dashboard' },
    ],
  },
  {
    group: 'מערכת',
    items: [{ label: 'הרשאות ותפקידים', icon: 'shieldLock' }],
  },
];

const ACCENT = 'var(--br)';

export default function FirmProfileConsole({ profile, clients, onSave }: Props) {
  const [draft, setDraft] = useState<FirmProfile>(profile);
  const [section, setSection] = useState<Section>('identity');
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState<LogoSurface | null>(null);
  const [stampBusy, setStampBusy] = useState(false);
  const [sigBusy, setSigBusy] = useState(false);
  // תצוגת החתימה/חותמת מהדלי הפרטי — data URL שנפתר מהנתיב (download מאומת)
  const [stampSrc, setStampSrc] = useState<string | undefined>(undefined);
  const [sigSrc, setSigSrc] = useState<string | undefined>(undefined);

  // כל מקום-לוגו שמור בזוג שדות משלו (כתובת + נתיב), כדי שאפשר יהיה להחליף
  // ולמחוק כל אחד בנפרד מבלי לגעת באחרים.
  const LOGO_FIELDS: Record<LogoSurface, { url: keyof FirmBranding; path: keyof FirmBranding; prefix: string }> = {
    app: { url: 'logoUrl', path: 'logoPath', prefix: 'logo' },
    dark: { url: 'logoOnDarkUrl', path: 'logoOnDarkPath', prefix: 'logo-dark' },
    email: { url: 'emailLogoUrl', path: 'emailLogoPath', prefix: 'logo-email' },
  };

  async function handleLogoUpload({ surface, file }: LogoUploadRequest) {
    const fields = LOGO_FIELDS[surface];
    setError(null);
    setLogoBusy(surface);
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      // כל העלאה מקבלת שם ייחודי, ולכן אין צורך ב-upsert. חשוב שלא יהיה: מדיניות
      // האבטחה של הדלי חוסמת בקשות upsert ומחזירה "new row violates RLS policy".
      const path = `${profile.id}/${fields.prefix}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(LOGO_BUCKET)
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
      const prevPath = draft.branding[fields.path] as string | undefined;
      setDraft(d => ({ ...d, branding: { ...d.branding, [fields.url]: pub.publicUrl, [fields.path]: path } }));
      if (prevPath && prevPath !== path) {
        await supabase.storage.from(LOGO_BUCKET).remove([prevPath]);
      }
    } catch (e) {
      setError(extractErr(e));
    } finally {
      setLogoBusy(null);
    }
  }

  function handleLogoScale(scale: number) {
    setDraft(d => ({ ...d, branding: { ...d.branding, logoScale: scale } }));
  }

  async function handleLogoRemove(surface: LogoSurface) {
    const fields = LOGO_FIELDS[surface];
    setError(null);
    setLogoBusy(surface);
    try {
      const prevPath = draft.branding[fields.path] as string | undefined;
      if (prevPath) await supabase.storage.from(LOGO_BUCKET).remove([prevPath]);
      setDraft(d => ({ ...d, branding: { ...d.branding, [fields.url]: undefined, [fields.path]: undefined } }));
    } catch (e) {
      setError(extractErr(e));
    } finally {
      setLogoBusy(null);
    }
  }

  async function handleStampFile(file: File | null) {
    if (!file) return;
    setError(null);
    if (!LOGO_MIME.includes(file.type)) {
      setError('פורמט לא נתמך — יש להעלות PNG, JPG, SVG או WEBP');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setError('הקובץ גדול מדי — עד 2MB');
      return;
    }
    setStampBusy(true);
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const path = `${profile.id}/stamp-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(SIGN_BUCKET)
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const prevPath = draft.branding.stampPath;
      // דלי פרטי — שומרים נתיב בלבד, לא כתובת ציבורית. התצוגה נגזרת מהנתיב.
      setDraft(d => ({ ...d, branding: { ...d.branding, stampUrl: undefined, stampPath: path } }));
      setStampSrc(await downloadPrivateDataUrl(path));
      if (prevPath && prevPath !== path) {
        await supabase.storage.from(SIGN_BUCKET).remove([prevPath]);
      }
    } catch (e) {
      setError(extractErr(e));
    } finally {
      setStampBusy(false);
    }
  }

  async function handleStampRemove() {
    setError(null);
    setStampBusy(true);
    try {
      const prevPath = draft.branding.stampPath;
      if (prevPath) await supabase.storage.from(SIGN_BUCKET).remove([prevPath]);
      setDraft(d => ({ ...d, branding: { ...d.branding, stampUrl: undefined, stampPath: undefined } }));
      setStampSrc(undefined);
    } catch (e) {
      setError(extractErr(e));
    } finally {
      setStampBusy(false);
    }
  }

  async function handleSignatureFile(file: File | null) {
    if (!file) return;
    setError(null);
    if (!LOGO_MIME.includes(file.type)) {
      setError('פורמט לא נתמך — יש להעלות PNG, JPG, SVG או WEBP');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setError('הקובץ גדול מדי — עד 2MB');
      return;
    }
    setSigBusy(true);
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const path = `${profile.id}/signature-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(SIGN_BUCKET)
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const prevPath = draft.branding.signaturePath;
      // דלי פרטי — שומרים נתיב בלבד, לא כתובת ציבורית. התצוגה נגזרת מהנתיב.
      setDraft(d => ({ ...d, branding: { ...d.branding, signatureUrl: undefined, signaturePath: path } }));
      setSigSrc(await downloadPrivateDataUrl(path));
      if (prevPath && prevPath !== path) {
        await supabase.storage.from(SIGN_BUCKET).remove([prevPath]);
      }
    } catch (e) {
      setError(extractErr(e));
    } finally {
      setSigBusy(false);
    }
  }

  async function handleSignatureRemove() {
    setError(null);
    setSigBusy(true);
    try {
      const prevPath = draft.branding.signaturePath;
      if (prevPath) await supabase.storage.from(SIGN_BUCKET).remove([prevPath]);
      setDraft(d => ({ ...d, branding: { ...d.branding, signatureUrl: undefined, signaturePath: undefined } }));
      setSigSrc(undefined);
    } catch (e) {
      setError(extractErr(e));
    } finally {
      setSigBusy(false);
    }
  }

  // השוואה ללא שדות שהשרת מנהל (updated_at משתנה בכל שמירה), ובאופן אדיש לסדר
  // המפתחות — כי jsonb ב-Postgres מחזיר מפתחות בסדר אחר ואחרת dirty לעולם לא מתאפס.
  const editableJson = (p: FirmProfile) => {
    const { updatedAt: _u, createdAt: _c, ...rest } = p as FirmProfile & { updatedAt?: string; createdAt?: string };
    return stableStringify(rest);
  };
  const dirty = editableJson(draft) !== editableJson(profile);

  // הטיוטה מאמצת את הפרופיל השמור כשאין שינויים פתוחים (אחרי שמירה, או אם
  // הפרופיל התעדכן ממקום אחר). כך אין מצב של שתי אמיתות על אותה רשומה.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!dirtyRef.current) setDraft(profile);
  }, [profile]);

  const updTop = <K extends keyof FirmProfile>(key: K, val: FirmProfile[K]) =>
    setDraft(d => ({ ...d, [key]: val }));
  const updBranding = <K extends keyof FirmBranding>(key: K, val: FirmBranding[K]) =>
    setDraft(d => ({ ...d, branding: { ...d.branding, [key]: val } }));
  const updComm = <K extends keyof FirmCommunication>(key: K, val: FirmCommunication[K]) =>
    setDraft(d => ({ ...d, communication: { ...d.communication, [key]: val } }));

  const monogram = (draft.branding.monogram || deriveMonogram(draft.firmName)).slice(0, 2);
  // צבעי העיצוב האמיתיים של עמודי הלקוח — מהמערכת המרכזית (כולל תבנית הסטודיו)
  const clientBrand = deriveQuotationBrand(draft);
  const logoUrl = draft.branding.logoUrl;
  const stampPath = draft.branding.stampPath;
  const signaturePath = draft.branding.signaturePath;

  // פותרים את החתימה/חותמת מהדלי הפרטי לפי הנתיב (download מאומת), כשמשתנה הנתיב
  useEffect(() => {
    let cancelled = false;
    downloadPrivateDataUrl(stampPath).then(src => { if (!cancelled) setStampSrc(src); });
    return () => { cancelled = true; };
  }, [stampPath]);
  useEffect(() => {
    let cancelled = false;
    downloadPrivateDataUrl(signaturePath).then(src => { if (!cancelled) setSigSrc(src); });
    return () => { cancelled = true; };
  }, [signaturePath]);

  const completeness = useMemo(() => {
    const checks = [
      draft.firmName, draft.representativeNumber, draft.representativeType,
      draft.email, draft.phone, draft.branding.docDesign?.preset,
      draft.communication.emailSignature, draft.website,
    ];
    const filled = checks.filter(v => v && String(v).trim()).length;
    return Math.round((filled / checks.length) * 100);
  }, [draft]);

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      await onSave(draft);
      setSavedAt(Date.now());
    } catch (e) {
      setError(extractErr(e));
    } finally {
      setBusy(false);
    }
  }

  // כל הלשוניות למעט אלו שאינן עורכות את הפרופיל חולקות את אותה טיוטה ואת
  // אותו כפתור שמירה — מקור אמת אחד למסך.
  const editsProfile = section !== 'employees' && section !== 'emailActivity';

  return (
    <div dir="rtl">
      {/* כותרת דביקה — מצב השמירה והשמירה עצמה תמיד בהישג יד */}
      <div className="pg-head fp-head">
        <div className="pg-head-main">
          <div className="pg-title pg-title-lg">המשרד</div>
          <div className="pg-status">מקור האמת לזהות, למיתוג ולצוות של כל חוויות הלקוח</div>
        </div>
        {editsProfile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SaveState dirty={dirty} busy={busy} savedAt={savedAt} completeness={completeness} />
            <button className="btn btn-primary" onClick={handleSave} disabled={busy || !dirty}>
              {busy ? 'שומר…' : 'שמירת שינויים'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: '.65rem .85rem', background: 'var(--red-light)', color: 'var(--red)', borderRadius: 'var(--radius)', fontSize: '.875rem' }}>{error}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '184px 1fr', gap: 18, alignItems: 'start' }}>

        {/* מסילת הניווט. הפריטים היו ‎<div onClick>‎ ולכן לא היו נגישים
            במקלדת; עכשיו הם כפתורים. הסימון הפעיל הוא קו וּמשקל — לא
            רחצה בסגול שלא קיים בשום מקום אחר במוצר. */}
        <nav className="fp-rail" aria-label="ניווט בפרופיל המשרד">
          <div className="fp-rail-group">המשרד</div>
          {ACTIVE_NAV.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              aria-current={section === item.id ? 'page' : undefined}
              className={`fp-rail-item ${section === item.id ? 'is-active' : ''}`}
            >
              <NavIcon name={item.icon} />
              {item.label}
            </button>
          ))}

          <div className="fp-rail-group">צוות</div>
          <button
            type="button"
            onClick={() => setSection('employees')}
            aria-current={section === 'employees' ? 'page' : undefined}
            className={`fp-rail-item ${section === 'employees' ? 'is-active' : ''}`}
          >
            <NavIcon name="employees" />
            עובדים
          </button>

          {SOON_GROUPS.map(g => (
            <div key={g.group}>
              <div className="fp-rail-group">{g.group}</div>
              {g.items.map(it => (
                <div key={it.label} title="בקרוב — עדיין לא פעיל" className="fp-rail-soon">
                  <NavIcon name={it.icon} />
                  {it.label}
                  <span className="fp-rail-soon-tag">בקרוב</span>
                </div>
              ))}
            </div>
          ))}
        </nav>

        {/* content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {section === 'identity' && (
            <>
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {logoUrl ? (
                    <img src={logoUrl} alt="לוגו המשרד" style={{ width: 58, height: 58, borderRadius: 10, objectFit: 'contain', border: '1px solid var(--gray-200)', background: 'var(--card)' }} />
                  ) : (
                    <div style={{ width: 58, height: 58, borderRadius: '50%', border: `1.5px solid ${clientBrand.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--fs-17)', fontWeight: 500, color: clientBrand.ink }}>{monogram}</div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 'var(--fs-15)', fontWeight: 500 }}>{draft.firmName || 'שם המשרד'}</div>
                    <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginTop: 2 }}>
                      {draft.representativeNumber ? `מספר מייצג ${draft.representativeNumber}` : 'מספר מייצג —'} · {draft.representativeType || 'רואה חשבון'}
                    </div>
                  </div>
                  <button className="btn" onClick={() => setSection('branding')} style={{ fontSize: 'var(--fs-12)', padding: '5px 10px' }}>
                    <NavIcon name="photo" size={14} />{logoUrl ? 'החלף לוגו' : 'הוסף לוגו'}
                  </button>
                </div>
              </div>

              <div style={card}>
                <div style={cardTitle}>זהות</div>
                <div style={grid2}>
                  <Field label="שם המשרד (תצוגה)"><input value={draft.firmName ?? ''} onChange={e => updTop('firmName', e.target.value)} placeholder="משרד רואי חשבון…" /></Field>
                  <Field label="שם משפטי"><input value={draft.legalName ?? ''} onChange={e => updTop('legalName', e.target.value)} placeholder="שם רשום" /></Field>
                  <Field label="מספר מייצג"><input value={draft.representativeNumber ?? ''} onChange={e => updTop('representativeNumber', e.target.value)} dir="ltr" style={{ textAlign: 'right' }} /></Field>
                  <Field label="סוג מייצג">
                    <select value={draft.representativeType ?? REP_TYPE_OPTIONS[0]} onChange={e => updTop('representativeType', e.target.value)}>
                      {REP_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </Field>
                </div>
              </div>

              <DesignStudioPointer brand={clientBrand} onOpen={() => setSection('design')} />
            </>
          )}

          {section === 'branding' && (
            <>
              <LogoAssetsPanel
                branding={draft.branding}
                darkBg={clientBrand.ink}
                firmName={clientBrand.firmName}
                busySurface={logoBusy}
                onUpload={handleLogoUpload}
                onRemove={handleLogoRemove}
                onScaleChange={handleLogoScale}
                onError={setError}
              />

              <div style={card}>
                <div style={cardTitle}>חותמת המשרד</div>
                <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginBottom: 14 }}>
                  תוטבע על טפסי ייפוי הכוח החתומים, באזור החתימה של המייצג. מומלץ PNG עם רקע שקוף.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 96, height: 96, borderRadius: 'var(--r-panel)', border: '1px dashed var(--hairline-1)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                    {stampSrc
                      ? <img src={stampSrc} alt="חותמת" style={{ maxWidth: '86%', maxHeight: '86%', objectFit: 'contain' }} />
                      : <span style={{ color: 'var(--gray-400)', display: 'inline-flex' }}><NavIcon name="stamp" size={26} /></span>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                    <label className="btn btn-primary" style={{ cursor: stampBusy ? 'default' : 'pointer', opacity: stampBusy ? 0.6 : 1 }}>
                      {stampBusy ? 'מעלה…' : stampPath ? 'החלף חותמת' : 'העלה חותמת'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        style={{ display: 'none' }}
                        disabled={stampBusy}
                        onChange={e => { const f = e.target.files?.[0] ?? null; void handleStampFile(f); e.target.value = ''; }}
                      />
                    </label>
                    {stampPath && (
                      <button className="btn" onClick={() => void handleStampRemove()} disabled={stampBusy} style={{ fontSize: 'var(--fs-13)' }}>
                        <NavIcon name="trash" size={14} />הסר חותמת
                      </button>
                    )}
                    <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-400)' }}>PNG · JPG · SVG · WEBP · עד 2MB</div>
                  </div>
                </div>
              </div>

              {/* צבעים/פונטים/תבניות חיים בסטודיו העיצוב בלבד — כאן רק נכסי מותג.
                  (סעיף "ערכת מותג" הישן הוסר: הוא הגדיר צבעים במקביל לסטודיו והציג
                  ערכים שלא תאמו את מה שהלקוח באמת רואה.) */}
              <div style={card}>
                <div style={cardTitle}>מונוגרמה</div>
                <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginBottom: 14 }}>
                  ראשי התיבות שמוצגים ללקוח כשאין לוגו. אם ריק — נגזר משם המשרד.
                </div>
                <div style={{ maxWidth: 220 }}>
                  <input value={draft.branding.monogram ?? ''} onChange={e => updBranding('monogram', e.target.value)} placeholder={deriveMonogram(draft.firmName)} maxLength={2} />
                </div>
              </div>
              <DesignStudioPointer brand={clientBrand} onOpen={() => setSection('design')} />
            </>
          )}

          {section === 'contact' && (
            <div style={card}>
              <div style={cardTitle}>פרטי קשר</div>
              <div style={grid2}>
                <Field label="אימייל ראשי"><input value={draft.email ?? ''} onChange={e => updTop('email', e.target.value)} dir="ltr" style={{ textAlign: 'right' }} placeholder="office@example.co.il" /></Field>
                <Field label="טלפון"><input value={draft.phone ?? ''} onChange={e => updTop('phone', e.target.value)} dir="ltr" style={{ textAlign: 'right' }} placeholder="03-1234567" /></Field>
                <Field label="אתר"><input value={draft.website ?? ''} onChange={e => updTop('website', e.target.value)} dir="ltr" style={{ textAlign: 'right' }} placeholder="example.co.il" /></Field>
                <Field label="כתובת"><input value={draft.address ?? ''} onChange={e => updTop('address', e.target.value)} placeholder="רחוב, עיר" /></Field>
              </div>
            </div>
          )}

          {section === 'signature' && (
            <>
            <div style={card}>
              <div style={cardTitle}>החתימה הדיגיטלית שלי</div>
              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginBottom: 14 }}>
                תמונת החתימה שלך (סריקה או צילום, רצוי PNG עם רקע שקוף). בחדר החתימה תוכל להוסיף אותה בלחיצה על כל מקום שדורש את חתימתך — בלי לצייר מחדש.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 150, height: 80, borderRadius: 'var(--r-panel)', border: '1px dashed var(--hairline-1)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                  {sigSrc
                    ? <img src={sigSrc} alt="חתימה" style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }} />
                    : <span style={{ color: 'var(--gray-400)', display: 'inline-flex' }}><NavIcon name="signature" size={26} /></span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                  <label className="btn btn-primary" style={{ cursor: sigBusy ? 'default' : 'pointer', opacity: sigBusy ? 0.6 : 1 }}>
                    {sigBusy ? 'מעלה…' : signaturePath ? 'החלף חתימה' : 'העלה חתימה'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      style={{ display: 'none' }}
                      disabled={sigBusy}
                      onChange={e => { const f = e.target.files?.[0] ?? null; void handleSignatureFile(f); e.target.value = ''; }}
                    />
                  </label>
                  {signaturePath && (
                    <button className="btn" onClick={() => void handleSignatureRemove()} disabled={sigBusy} style={{ fontSize: 'var(--fs-13)' }}>
                      <NavIcon name="trash" size={14} />הסר חתימה
                    </button>
                  )}
                  <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-400)' }}>החותמת נשמרת בלשונית "מותג".</div>
                </div>
              </div>
            </div>
            <div style={card}>
              <div style={cardTitle}>חתימת מייל</div>
              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginBottom: 8 }}>תופיע בתחתית כל מייל שנשלח ללקוח.</div>
              <textarea
                rows={4}
                value={draft.communication.emailSignature ?? ''}
                onChange={e => updComm('emailSignature', e.target.value)}
                placeholder={'בברכה,\nגיא ישר, רו״ח\nמשרד רואי חשבון גיא ישר · 03-1234567'}
                style={{ width: '100%', resize: 'vertical' }}
              />
              {draft.communication.emailSignature?.trim() && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 'var(--fs-12)', letterSpacing: '.05em', color: 'var(--gray-400)', marginBottom: 6 }}>תצוגה מקדימה</div>
                  <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '12px 14px', fontSize: 'var(--fs-13)', lineHeight: 1.7, color: 'var(--gray-700)', whiteSpace: 'pre-line' }}>
                    {draft.communication.emailSignature}
                  </div>
                </div>
              )}
            </div>
            </>
          )}

          {section === 'communication' && (
            <div style={card}>
              <div style={cardTitle}>ערוצי תקשורת</div>
              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginBottom: 14 }}>
                מכאן נשלחים המיילים ללקוחות. השם שיוצג הוא שם המשרד; התשובות יגיעו לכתובת ה-Reply-To.
              </div>
              <div style={grid2}>
                <Field label="כתובת שולח (From)">
                  <input value={draft.communication.senderEmail ?? ''} onChange={e => updComm('senderEmail', e.target.value)} dir="ltr" style={{ textAlign: 'right' }} placeholder="ברירת מחדל: כתובת מערכת" />
                </Field>
                <Field label="כתובת לתשובות (Reply-To)">
                  <input value={draft.communication.replyTo ?? ''} onChange={e => updComm('replyTo', e.target.value)} dir="ltr" style={{ textAlign: 'right' }} placeholder={draft.email || 'office@example.co.il'} />
                </Field>
              </div>
              <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--gray-50)', borderRadius: 8, fontSize: 'var(--fs-12)', color: 'var(--gray-600)', lineHeight: 1.6 }}>
                <NavIcon name="info" size={14} />
                כדי לשלוח מכתובת שולח משלך צריך לאמת את הדומיין אצל ספק המייל. עד אז נשלח מכתובת מערכת עם שם המשרד שלך והתשובות אליך. כשתאמת דומיין — פשוט עדכן כאן, בלי שינוי קוד.
              </div>
            </div>
          )}

          {section === 'notifications' && (
            <OfficeNotificationsSection profile={draft} onChangeProfile={setDraft} />
          )}

          {section === 'paperless' && (
            <PaperlessCommSection profile={draft} onChangeProfile={setDraft} />
          )}

          {section === 'emailActivity' && (
            <div style={card}><EmailActivityModule userId={profile.id} /></div>
          )}

          {section === 'design' && (
            <QuotationDesignStudio
              profile={draft}
              onChange={dd => setDraft(d => ({ ...d, branding: { ...d.branding, docDesign: dd } }))}
            />
          )}

          {section === 'quotations' && (
            <QuotationSettings profile={draft} onChangeProfile={setDraft} />
          )}

          {section === 'employees' && (
            <EmployeesPanel clients={clients} />
          )}

        </div>
      </div>
    </div>
  );
}

// ───────────────────────── התראות למשרד ─────────────────────────
// ‼ המסך נגזר מהקטלוג המשותף ולא מרשימה שכתובה כאן. אירוע חדש שנוסף לקטלוג
// מקבל תיבת סימון לבד, בלי לגעת בקובץ הזה — וזו בדיוק הנקודה: מקום אחד
// שמחליט מה קיים, מה כתוב עליו, ומה ברירת המחדל שלו.
//
// נשמר רק מה שגיא שינה בפועל: תיבה שחוזרת לברירת המחדל נמחקת מההגדרות. כך
// שינוי ברירת מחדל בעתיד יחול גם על מי שלא נגע בה.

function OfficeNotificationsSection({ profile, onChangeProfile }: { profile: FirmProfile; onChangeProfile: (p: FirmProfile) => void }) {
  const settings = profile.settings ?? {};
  const prefs = readNotificationPrefs(settings);

  const toggle = (kind: string, on: boolean) => {
    const def = ACCOUNTANT_NOTIFICATIONS.find(n => n.kind === kind);
    const next = { ...prefs };
    if (def && on === def.defaultOn) delete next[kind];
    else next[kind] = on;
    onChangeProfile({ ...profile, settings: { ...settings, [NOTIFICATION_SETTINGS_KEY]: next } });
  };

  const onCount = ACCOUNTANT_NOTIFICATIONS.filter(n => isNotificationEnabled(settings, n.kind)).length;
  const destination = (profile.email ?? '').trim();

  return (
    <div style={card}>
      <div style={cardTitle}>התראות למשרד</div>
      <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginBottom: 18, lineHeight: 1.7 }}>
        אילו אירועים שולחים לך מייל. אלה ההתראות אליך בלבד — המיילים ללקוחות
        אינם מושפעים מכאן.
        {destination
          ? <> נשלחות אל <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{destination}</span>, מהלשונית "פרטי קשר".</>
          : <> <span style={{ color: 'var(--red)' }}>אין כתובת אימייל במשרד — בלעדיה שום התראה לא תישלח. יש למלא אותה בלשונית "פרטי קשר".</span></>}
        {' '}דולקות כרגע: {onCount} מתוך {ACCOUNTANT_NOTIFICATIONS.length}.
      </div>

      {NOTIFICATION_GROUPS.map(group => {
        const items = ACCOUNTANT_NOTIFICATIONS.filter(n => n.group === group);
        if (items.length === 0) return null;
        // ‼ קבוצה שהנמען שלה הוא הלקוח מסומנת אחרת. כל השאר במסך הזה הם
        // מיילים אלייך; מתג ששולח ללקוח בלי שתאשר כל פעם חייב להיראות
        // שונה, אחרת הוא נדלק בטעות בתוך רשימה של התראות פנימיות.
        const toClient = items.some(n => n.audience === 'client');
        return (
          <div key={group} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: 'var(--gray-500)', marginBottom: 8 }}>{group}</div>
            {toClient && (
              <div style={{
                padding: '8px 10px', marginBottom: 8, borderRadius: 8,
                background: 'var(--amber-50, #FFF8EC)', border: '1px solid var(--warn)',
                fontSize: 'var(--fs-12)', color: 'var(--ink-2)', lineHeight: 1.6,
              }}>
                ‼ המתגים כאן שולחים מייל <strong>ללקוח עצמו</strong>, אוטומטית ובלי לשאול אותך בכל פעם.
                כבויים כברירת מחדל.
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {items.map(n => {
                const on = isNotificationEnabled(settings, n.kind);
                return (
                  <label key={n.kind} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={e => toggle(n.kind, e.target.checked)}
                      style={{ marginTop: 3, width: 15, height: 15, flexShrink: 0, accentColor: ACCENT }}
                    />
                    <span>
                      <span style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-1)' }}>{n.label}</span>
                      <span style={{ display: 'block', fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginTop: 2, lineHeight: 1.6 }}>{n.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}

      <div style={{ padding: '10px 12px', background: 'var(--gray-50)', borderRadius: 8, fontSize: 'var(--fs-12)', color: 'var(--gray-600)', lineHeight: 1.6 }}>
        <NavIcon name="info" size={14} />
        אירוע שכיביתָ עדיין נרשם ביומן ההתקדמות של הלקוח — רק המייל לא יוצא.
        השינויים נשמרים עם כפתור השמירה למעלה.
      </div>
    </div>
  );
}

// ───────────────────────── פייפרלס ותקשורת הקליטה ─────────────────────────
// ‼ קישור ההזמנה הוא הגדרה של המשרד ולא קבוע בקוד: הוא נושא את מזהה המייצג,
// והוא מה שמקשר את החשבון החדש של הלקוח אלינו. משרד אחר — קישור אחר.
//
// עורך מבוקר על אותה טיוטה של המסך — בלי שמירה משלו, כמו לשונית ההצעות.

const TEMPLATE_EDITORS: StepEmailKind[] = ['process_open', 'paperless_invite', 'retainer_request', 'intake_questionnaire', 'step_reminder'];

const TEMPLATE_HINT: Record<string, string> = {
  process_open: 'נשלח בלחיצה על "שלח ללקוח" בכרטיס הלקוח. רשימת מה שממתין ללקוח נבנית מהדף האישי עצמו — אין צורך לפרט אותה בנוסח.',
  paperless_invite: 'נשלח מכרטיס הלקוח, בשלב "הזמנה לפייפרלס". הקישור עצמו נוסף ככפתור בסוף המייל.',
  retainer_request: 'נשלח בשלב "הרשאה לתשלום חודשי", אחרי שהוזן קישור ההרשאה מפייפרלס.',
  intake_questionnaire: 'נשלח בשלב "עדכון סטטוס מיסויי". קישור השאלון האישי נוסף ככפתור בסוף המייל.',
  step_reminder: 'נשלח בלחיצה על "הכן תזכורת", בשלב שממתין ללקוח יותר מדי זמן.',
};

interface CommTemplate { subject?: string; body?: string }

function PaperlessCommSection({ profile, onChangeProfile }: { profile: FirmProfile; onChangeProfile: (p: FirmProfile) => void }) {
  const settings = profile.settings ?? {};
  const paperless = (settings.paperless as { inviteUrl?: string } | undefined) ?? {};
  const templates = (settings.commTemplates as Record<string, CommTemplate> | undefined) ?? {};
  const inviteUrl = paperless.inviteUrl ?? '';
  const urlInvalid = inviteUrl.trim() !== '' && !inviteUrl.trim().startsWith('https://');

  const patchSettings = (patch: Record<string, unknown>) =>
    onChangeProfile({ ...profile, settings: { ...settings, ...patch } });

  const setTemplate = (kind: StepEmailKind, patch: CommTemplate) =>
    patchSettings({ commTemplates: { ...templates, [kind]: { ...(templates[kind] ?? {}), ...patch } } });

  const resetTemplate = (kind: StepEmailKind) => {
    const next = { ...templates };
    delete next[kind];
    patchSettings({ commTemplates: next });
  };

  return (
    <>
      <div style={card}>
        <div style={cardTitle}>קישור ההזמנה לפייפרלס</div>
        <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginBottom: 14 }}>
          הקישור מהחשבון שלך בפייפרלס, שדרכו לקוח חדש פותח חשבון ומתחבר אליך כמייצג. הוא מוטמע במייל ההזמנה שנשלח מכרטיס הלקוח.
        </div>
        <div style={{ maxWidth: 460 }}>
          <input
            value={inviteUrl}
            onChange={e => patchSettings({ paperless: { ...paperless, inviteUrl: e.target.value } })}
            dir="ltr"
            style={{ textAlign: 'left', width: '100%' }}
            placeholder="https://www.paperless.tax/invite?rid=Rtb0kamvcs7"
          />
          {urlInvalid && (
            <div style={{ marginTop: 6, fontSize: 'var(--fs-12)', color: 'var(--red)' }}>
              הקישור חייב להתחיל ב-https://
            </div>
          )}
        </div>
      </div>

      {TEMPLATE_EDITORS.map(kind => {
        const base = defaultTemplate(kind);
        const saved = templates[kind] ?? {};
        const overridden = saved.subject !== undefined || saved.body !== undefined;
        return (
          <div key={kind} style={card}>
            <details>
              <summary style={{ cursor: 'pointer' }}>
                <span style={{ fontSize: 'var(--fs-14)', fontWeight: 600, color: 'var(--ink-1)' }}>
                  {STEP_EMAIL_KIND_LABELS[kind]}
                </span>
                <span style={{ fontSize: 'var(--fs-12)', color: overridden ? 'var(--chip-amber-tx)' : 'var(--gray-400)', marginInlineStart: 8 }}>
                  {overridden ? 'נוסח מותאם' : 'נוסח ברירת מחדל'}
                </span>
              </summary>

              <div style={{ marginTop: 14, maxWidth: 640 }}>
                <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginBottom: 10 }}>
                  {TEMPLATE_HINT[kind]} אפשר לערוך גם לכל שליחה בנפרד, בחלון התצוגה המקדימה.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {PLACEHOLDERS_BY_KIND[kind].map(p => (
                    <span key={p} style={{ fontSize: 11.5, background: 'var(--gray-100)', color: 'var(--gray-600)', padding: '3px 8px', borderRadius: 6, fontFamily: 'monospace', direction: 'ltr' }}>{p}</span>
                  ))}
                </div>

                <Field label="נושא המייל">
                  <input
                    value={saved.subject ?? base.subject}
                    onChange={e => setTemplate(kind, { subject: e.target.value })}
                  />
                </Field>
                <div style={{ marginTop: 12 }}>
                  <Field label="גוף המייל">
                    <textarea
                      rows={10}
                      value={saved.body ?? base.body}
                      onChange={e => setTemplate(kind, { body: e.target.value })}
                      style={{ width: '100%', resize: 'vertical' }}
                    />
                  </Field>
                </div>

                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button className="btn" disabled={!overridden} onClick={() => resetTemplate(kind)} style={{ fontSize: 'var(--fs-13)' }}>
                    שחזר ברירת מחדל
                  </button>
                  <span style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)' }}>
                    השינויים נשמרים עם כפתור השמירה למעלה.
                  </span>
                </div>
              </div>
            </details>
          </div>
        );
      })}
    </>
  );
}

/** מצב השמירה של המסך — נקרא במבט: יש שינויים / נשמר / כמה מוגדר */
function SaveState({ dirty, busy, savedAt, completeness }: { dirty: boolean; busy: boolean; savedAt: number | null; completeness: number }) {
  const chip: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-12)',
    padding: '5px 11px', borderRadius: 20, whiteSpace: 'nowrap', fontWeight: 500,
  };
  if (busy) return <span style={{ ...chip, background: 'var(--gray-100)', color: 'var(--gray-600)' }}>שומר…</span>;
  if (dirty) return (
    <span style={{ ...chip, background: 'var(--orange-light)', color: 'var(--chip-amber-tx)' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--orange)' }} />
      שינויים שלא נשמרו
    </span>
  );
  if (savedAt) return <span style={{ ...chip, background: 'var(--green-light)', color: 'var(--chip-green-tx)' }}>נשמר</span>;
  return (
    <span style={{ ...chip, background: 'var(--gray-100)', color: 'var(--gray-600)' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT }} />
      הפרופיל {completeness}% מוגדר
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-600)', display: 'block' }}>
      {label}
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  );
}

/** מצביע לסטודיו העיצוב — במקום מיני-תצוגה כפולה (וקפואה) של עמוד הלקוח.
 *  מציג את צבעי העיצוב האמיתיים מהמערכת המרכזית; לחיצה פותחת את הסטודיו. */
function DesignStudioPointer({ brand, onOpen }: { brand: ReturnType<typeof deriveQuotationBrand>; onOpen: () => void }) {
  return (
    <div
      onClick={onOpen}
      style={{ borderTop: '1px solid var(--hairline-2)', padding: '14px 0', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'start', fontFamily: 'inherit' }}
    >
      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
        <span style={{ width: 26, height: 26, borderRadius: 7, background: brand.ink }} />
        <span style={{ width: 26, height: 26, borderRadius: 7, background: brand.accent }} />
        <span style={{ width: 26, height: 26, borderRadius: 7, background: brand.pageBg, border: '1px solid var(--hairline-1)' }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 'var(--fs-13)', fontWeight: 500 }}>עיצוב עמודי הלקוח והמיילים</div>
        <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginTop: 2 }}>
          תצוגה מקדימה חיה ועריכה מלאה — תבניות, צבעים, פונטים וכפתורים
        </div>
      </div>
      <span style={{ color: ACCENT, fontSize: 'var(--fs-13)', fontWeight: 500, whiteSpace: 'nowrap' }}>לסטודיו ←</span>
    </div>
  );
}


const card: React.CSSProperties = { borderTop: '1px solid var(--hairline-2)', padding: '16px 0 18px' };
const cardTitle: React.CSSProperties = { fontSize: 'var(--fs-14)', fontWeight: 600, color: 'var(--ink-1)', marginBottom: 14 };
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };

/** JSON יציב — ממיין מפתחות רקורסיבית, כדי שהשוואת שינוי לא תושפע מסדר מפתחות של jsonb. */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const obj = v as Record<string, unknown>;
  return '{' + Object.keys(obj).sort().map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

function extractErr(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const o = e as { message?: string; details?: string; hint?: string };
    const parts = [o.message, o.details, o.hint].filter(Boolean);
    if (parts.length) return parts.join(' — ');
  }
  return 'שגיאה בשמירת הפרופיל';
}
