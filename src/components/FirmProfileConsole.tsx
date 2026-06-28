import { useMemo, useState } from 'react';
import {
  FirmProfile,
  FirmBranding,
  FirmCommunication,
  BrandTheme,
  BRAND_THEMES,
  REP_TYPE_OPTIONS,
  FONT_OPTIONS,
  deriveMonogram,
} from '../types/firmProfile';

interface Props {
  profile: FirmProfile;
  onSave: (p: FirmProfile) => Promise<void> | void;
}

type Section = 'identity' | 'branding' | 'contact' | 'signature';

const ACTIVE_NAV: { id: Section; label: string; icon: string }[] = [
  { id: 'identity', label: 'זהות', icon: 'ti-id-badge-2' },
  { id: 'branding', label: 'מותג', icon: 'ti-palette' },
  { id: 'contact', label: 'פרטי קשר', icon: 'ti-address-book' },
  { id: 'signature', label: 'חתימת מייל', icon: 'ti-signature' },
];

const SOON_GROUPS: { group: string; items: { label: string; icon: string }[] }[] = [
  {
    group: 'תקשורת ואוטומציה',
    items: [
      { label: 'ערוצי תקשורת', icon: 'ti-messages' },
      { label: 'תבניות מייל', icon: 'ti-mail-cog' },
      { label: 'אוטומציות', icon: 'ti-bolt' },
    ],
  },
  {
    group: 'חוויות לקוח',
    items: [
      { label: 'עמודי הזדהות', icon: 'ti-user-check' },
      { label: 'בקשות מסמכים', icon: 'ti-file-upload' },
      { label: 'חתימה דיגיטלית', icon: 'ti-writing-sign' },
      { label: 'פורטל לקוחות', icon: 'ti-layout-dashboard' },
    ],
  },
  {
    group: 'מערכת',
    items: [{ label: 'צוות והרשאות', icon: 'ti-users-group' }],
  },
];

const ACCENT = '#4F46E5';

export default function FirmProfileConsole({ profile, onSave }: Props) {
  const [draft, setDraft] = useState<FirmProfile>(profile);
  const [section, setSection] = useState<Section>('identity');
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // השוואה ללא שדות שהשרת מנהל (updated_at משתנה בכל שמירה) — אחרת dirty לעולם לא מתאפס.
  const editableJson = (p: FirmProfile) => {
    const { updatedAt: _u, createdAt: _c, ...rest } = p as FirmProfile & { updatedAt?: string; createdAt?: string };
    return JSON.stringify(rest);
  };
  const dirty = editableJson(draft) !== editableJson(profile);

  const updTop = <K extends keyof FirmProfile>(key: K, val: FirmProfile[K]) =>
    setDraft(d => ({ ...d, [key]: val }));
  const updBranding = <K extends keyof FirmBranding>(key: K, val: FirmBranding[K]) =>
    setDraft(d => ({ ...d, branding: { ...d.branding, [key]: val } }));
  const updComm = <K extends keyof FirmCommunication>(key: K, val: FirmCommunication[K]) =>
    setDraft(d => ({ ...d, communication: { ...d.communication, [key]: val } }));

  const theme = BRAND_THEMES.find(t => t.id === (draft.branding.theme ?? 'monochrome')) ?? BRAND_THEMES[0];
  const monogram = (draft.branding.monogram || deriveMonogram(draft.firmName)).slice(0, 2);
  const previewAccent = draft.branding.accentColor || theme.accent;

  const completeness = useMemo(() => {
    const checks = [
      draft.firmName, draft.representativeNumber, draft.representativeType,
      draft.email, draft.phone, draft.branding.theme,
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

  return (
    <div dir="rtl" style={{ fontFamily: 'var(--font-sans)' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 500 }}>פרופיל המשרד</div>
          <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginTop: 2 }}>מקור האמת לזהות ולמיתוג של כל חוויות הלקוח</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--gray-600)', background: 'var(--gray-100)', padding: '5px 10px', borderRadius: 20 }}>
            <i className="ti ti-circle-check" style={{ fontSize: 14, color: ACCENT }} aria-hidden="true" />
            הפרופיל {completeness}% מוגדר
          </span>
          <button className="btn btn-primary" onClick={handleSave} disabled={busy || !dirty}>
            {busy ? 'שומר…' : dirty ? 'שמירה' : savedAt ? '✓ נשמר' : 'שמור'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: '.65rem .85rem', background: 'var(--red-light)', color: 'var(--red)', borderRadius: 'var(--radius)', fontSize: '.875rem' }}>{error}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '184px 1fr', gap: 18, alignItems: 'start' }}>

        {/* nav rail */}
        <div style={{ border: '0.5px solid var(--gray-200)', borderRadius: 12, padding: 10, background: 'white' }}>
          <div style={navGroupLabel}>המשרד</div>
          {ACTIVE_NAV.map(item => {
            const active = section === item.id;
            return (
              <div
                key={item.id}
                onClick={() => setSection(item.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', borderRadius: 8,
                  cursor: 'pointer', fontSize: 13, marginBottom: 2,
                  background: active ? 'rgba(79,70,229,.10)' : 'transparent',
                  color: active ? ACCENT : 'var(--gray-600)',
                  fontWeight: active ? 500 : 400,
                }}
              >
                <i className={`ti ${item.icon}`} style={{ fontSize: 16 }} aria-hidden="true" />
                {item.label}
              </div>
            );
          })}

          {SOON_GROUPS.map(g => (
            <div key={g.group}>
              <div style={navGroupLabel}>{g.group}</div>
              {g.items.map(it => (
                <div key={it.label} title="בקרוב — עדיין לא פעיל" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', color: 'var(--gray-400)', fontSize: 12.5 }}>
                  <i className={`ti ${it.icon}`} style={{ fontSize: 15 }} aria-hidden="true" />
                  {it.label}
                  <span style={{ marginInlineStart: 'auto', fontSize: 9, background: 'var(--gray-100)', color: 'var(--gray-500)', padding: '1px 5px', borderRadius: 6 }}>בקרוב</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {section === 'identity' && (
            <>
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 58, height: 58, borderRadius: '50%', border: `1.5px solid ${theme.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 500, color: theme.ink }}>{monogram}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 500 }}>{draft.firmName || 'שם המשרד'}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
                      {draft.representativeNumber ? `מספר מייצג ${draft.representativeNumber}` : 'מספר מייצג —'} · {draft.representativeType || 'רואה חשבון'}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--gray-400)' }} title="העלאת לוגו תתאפשר בשלב עמודי הלקוח">
                    <i className="ti ti-photo" style={{ fontSize: 14, verticalAlign: -2, marginLeft: 4 }} aria-hidden="true" />לוגו · בקרוב
                  </span>
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

              <ClientPreview firmName={draft.firmName} monogram={monogram} ink={theme.ink} accent={previewAccent} />
            </>
          )}

          {section === 'branding' && (
            <>
              <div style={card}>
                <div style={cardTitle}>ערכת מותג</div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
                  {BRAND_THEMES.map(t => {
                    const sel = (draft.branding.theme ?? 'monochrome') === t.id;
                    return (
                      <div key={t.id} onClick={() => updBranding('theme', t.id as BrandTheme)} style={{ cursor: 'pointer', textAlign: 'center' }}>
                        <div style={{ width: 38, height: 38, borderRadius: 9, background: t.ink, border: sel ? `2px solid ${ACCENT}` : '2px solid transparent', boxShadow: sel ? `0 0 0 2px white inset` : 'none' }} />
                        <div style={{ fontSize: 10.5, color: sel ? ACCENT : 'var(--gray-500)', marginTop: 4, fontWeight: sel ? 500 : 400 }}>{t.label}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={grid2}>
                  <Field label="צבע אקסנט">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="color" value={draft.branding.accentColor || theme.accent} onChange={e => updBranding('accentColor', e.target.value)} style={{ width: 36, height: 32, padding: 2, cursor: 'pointer' }} />
                      <input value={draft.branding.accentColor || theme.accent} onChange={e => updBranding('accentColor', e.target.value)} dir="ltr" style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }} />
                    </div>
                  </Field>
                  <Field label="טיפוגרפיה">
                    <select value={draft.branding.font ?? FONT_OPTIONS[0]} onChange={e => updBranding('font', e.target.value)}>
                      {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </Field>
                  <Field label="מונוגרמה (ראשי תיבות)">
                    <input value={draft.branding.monogram ?? ''} onChange={e => updBranding('monogram', e.target.value)} placeholder={deriveMonogram(draft.firmName)} maxLength={2} />
                  </Field>
                </div>
              </div>
              <ClientPreview firmName={draft.firmName} monogram={monogram} ink={theme.ink} accent={previewAccent} />
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
            <div style={card}>
              <div style={cardTitle}>חתימת מייל</div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 8 }}>תופיע בתחתית כל מייל שנשלח ללקוח.</div>
              <textarea
                rows={4}
                value={draft.communication.emailSignature ?? ''}
                onChange={e => updComm('emailSignature', e.target.value)}
                placeholder={'בברכה,\nגיא ישר, רו״ח\nמשרד רואי חשבון גיא ישר · 03-1234567'}
                style={{ width: '100%', resize: 'vertical' }}
              />
              {draft.communication.emailSignature?.trim() && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 10.5, letterSpacing: '.05em', color: 'var(--gray-400)', marginBottom: 6 }}>תצוגה מקדימה</div>
                  <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '12px 14px', fontSize: 12.5, lineHeight: 1.7, color: 'var(--gray-700)', whiteSpace: 'pre-line' }}>
                    {draft.communication.emailSignature}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 12, color: 'var(--gray-600)', display: 'block' }}>
      {label}
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  );
}

function ClientPreview({ firmName, monogram, ink, accent }: { firmName?: string; monogram: string; ink: string; accent: string }) {
  return (
    <div style={{ border: '0.5px solid var(--gray-200)', borderRadius: 12, padding: 12, background: 'var(--gray-50)' }}>
      <div style={{ fontSize: 10.5, letterSpacing: '.05em', color: 'var(--gray-400)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
        <i className="ti ti-eye" style={{ fontSize: 13 }} aria-hidden="true" />תצוגה מקדימה · עמוד לקוח
      </div>
      <div style={{ maxWidth: 320, background: '#fff', border: '1px solid #E7E6E1', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', border: `1.5px solid ${ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 500, color: ink }}>{monogram}</div>
          <span style={{ fontSize: 11, color: ink }}>{firmName || 'משרד רואי חשבון'}</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 500, color: '#111', marginBottom: 3 }}>נעים להכיר</div>
        <div style={{ fontSize: 11.5, color: '#6B6B68', marginBottom: 12 }}>נשאר רק לאמת את הזהות.</div>
        <div style={{ background: ink, color: '#fff', borderRadius: 8, padding: '9px', textAlign: 'center', fontSize: 12, fontWeight: 500 }}>המשך</div>
        <div style={{ height: 3, width: 40, background: accent, borderRadius: 3, margin: '12px auto 0' }} />
      </div>
    </div>
  );
}

const navGroupLabel: React.CSSProperties = { fontSize: 10.5, letterSpacing: '.06em', color: 'var(--gray-400)', padding: '12px 8px 4px' };
const card: React.CSSProperties = { border: '0.5px solid var(--gray-200)', borderRadius: 12, padding: 18, background: 'white' };
const cardTitle: React.CSSProperties = { fontSize: 13.5, fontWeight: 500, marginBottom: 14 };
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };

function extractErr(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const o = e as { message?: string; details?: string; hint?: string };
    const parts = [o.message, o.details, o.hint].filter(Boolean);
    if (parts.length) return parts.join(' — ');
  }
  return 'שגיאה בשמירת הפרופיל';
}
