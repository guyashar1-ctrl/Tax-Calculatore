// סטודיו העיצוב — עורך את מראה עמוד ההצעה ובקשת הייצוג עם תצוגה מקדימה חיה.
// בוחרים תבנית, מכווננים צבעים/פונט/כותרת/כפתור/פינות, ורואים בזמן אמת בדיוק
// מה שהלקוח יראה — בהצעה, בבקשת הייצוג ובמייל, בדסקטופ ובמובייל.

import { useMemo, useState } from 'react';
import type { FirmProfile, FirmDocDesign } from '../../types/firmProfile';
import {
  DESIGN_PRESETS, FONT_CHOICES,
  HEADER_STYLE_LABELS, BUTTON_STYLE_LABELS, CORNER_STYLE_LABELS,
  type HeaderStyle, type ButtonStyle, type CornerStyle,
} from '../../data/quotationDesignPresets';
import { deriveQuotationBrand } from './quotationBranding';
import QuotationWebView, { type QuotationWebViewData } from './QuotationWebView';
import RepresentationPreview from './RepresentationPreview';
import { buildQuotationEmailHtml } from '../../utils/quotationEmailHtml';

interface Props {
  profile: FirmProfile;
  onSaveProfile: (p: FirmProfile) => Promise<void> | void;
}

type Surface = 'quotation' | 'representation' | 'email';
type Device = 'desktop' | 'mobile';

const SAMPLE: QuotationWebViewData = {
  quotationNumber: '2026-000',
  recipientName: 'ישראל ישראלי',
  businessName: 'ישראל ישראלי בע״מ',
  vatRate: 18,
  items: [
    { id: '1', name: 'הנהלת חשבונות — עוסק מורשה', description: 'ניהול שוטף כולל דיווחי מע״מ ומקדמות', category: 'monthly', billingType: 'fixed', quantity: 1, catalogPrice: 350, clientPrice: 350, vatFlag: true },
    { id: '2', name: 'חשבות שכר', category: 'monthly', billingType: 'per_unit', unitLabel: 'עובד', quantity: 2, catalogPrice: 80, clientPrice: 80, vatFlag: true },
    { id: '3', name: 'דוח שנתי — עוסק מורשה', category: 'annual', billingType: 'fixed', quantity: 1, catalogPrice: 1800, clientPrice: 1800, vatFlag: true, clientNote: 'כולל תיאום מס' },
    { id: '4', name: 'פתיחת תיקים ברשויות', category: 'one_time', billingType: 'fixed', quantity: 1, catalogPrice: 300, clientPrice: 300, vatFlag: true },
    { id: '5', name: 'תכנון מס רבעוני', category: 'included', billingType: 'fixed', quantity: 1, catalogPrice: 0, clientPrice: 0, vatFlag: false },
    { id: '6', name: 'ייעוץ שוטף', category: 'included', billingType: 'fixed', quantity: 1, catalogPrice: 0, clientPrice: 0, vatFlag: false },
  ],
  notesForClient: 'שמחים על ההזדמנות ללוות אתכם. ההצעה מותאמת בדיוק לצרכים שסיכמנו בשיחה.',
};

export default function QuotationDesignStudio({ profile, onSaveProfile }: Props) {
  const [draft, setDraft] = useState<FirmDocDesign>(profile.branding?.docDesign ?? { preset: 'minimal-light' });
  const [surface, setSurface] = useState<Surface>('quotation');
  const [device, setDevice] = useState<Device>('desktop');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(profile.branding?.docDesign ?? { preset: 'minimal-light' });

  // מותג חי מהטיוטה — כך שהתצוגה מתעדכנת מיד עם כל שינוי
  const liveBrand = useMemo(() => deriveQuotationBrand({
    ...profile, branding: { ...profile.branding, docDesign: draft },
  }), [profile, draft]);

  const emailHtml = useMemo(() => buildQuotationEmailHtml({
    quotationNumber: SAMPLE.quotationNumber, recipientName: SAMPLE.recipientName,
    businessName: SAMPLE.businessName, items: SAMPLE.items, vatRate: SAMPLE.vatRate,
    message: 'שמחים על ההזדמנות ללוות אתכם — מצורפת הצעה אישית.', quotationLink: '#',
    expiresAt: undefined,
  }, liveBrand), [liveBrand]);

  const set = <K extends keyof FirmDocDesign>(key: K, val: FirmDocDesign[K]) =>
    setDraft(d => ({ ...d, [key]: val }));

  function applyPreset(id: string) {
    // בחירת תבנית מאפסת כיוונונים אישיים — נקודת פתיחה נקייה
    setDraft({ preset: id });
  }

  async function handleSave() {
    setBusy(true);
    try {
      await onSaveProfile({ ...profile, branding: { ...profile.branding, docDesign: draft } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setBusy(false); }
  }

  const previewMaxW = device === 'mobile' ? 400 : '100%';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: 18, alignItems: 'start' }}>

      {/* ── בקרות ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={ctlCard}>
          <div style={ctlTitle}>תבנית עיצוב</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {DESIGN_PRESETS.map(p => {
              const sel = draft.preset === p.id && !hasOverrides(draft);
              return (
                <button key={p.id} onClick={() => applyPreset(p.id)} title={p.description}
                  style={{ textAlign: 'start', padding: 8, borderRadius: 10, cursor: 'pointer', background: 'white', border: sel ? `2px solid ${p.accent}` : '1px solid var(--gray-200)', fontFamily: 'inherit' }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                    <span style={{ width: 22, height: 22, borderRadius: 5, background: p.ink }} />
                    <span style={{ width: 22, height: 22, borderRadius: 5, background: p.accent }} />
                    <span style={{ width: 22, height: 22, borderRadius: 5, background: p.pageBg, border: '1px solid var(--gray-200)' }} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{p.label}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={ctlCard}>
          <div style={ctlTitle}>צבעים</div>
          <ColorField label="צבע אקסנט (כפתורים, מחירים)" value={liveBrand.accent} onChange={v => set('accent', v)} />
          <ColorField label="צבע כהה (כותרות, רקע אישור)" value={liveBrand.ink} onChange={v => set('ink', v)} />
          <ColorField label="רקע העמוד" value={liveBrand.pageBg} onChange={v => set('pageBg', v)} />
        </div>

        <div style={ctlCard}>
          <div style={ctlTitle}>טיפוגרפיה וסגנון</div>
          <Field label="פונט">
            <select value={liveBrand.font} onChange={e => set('font', e.target.value)}>
              {FONT_CHOICES.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
            </select>
          </Field>
          <Field label="סגנון כותרת">
            <select value={liveBrand.headerStyle} onChange={e => set('headerStyle', e.target.value as HeaderStyle)}>
              {(Object.keys(HEADER_STYLE_LABELS) as HeaderStyle[]).map(k => <option key={k} value={k}>{HEADER_STYLE_LABELS[k]}</option>)}
            </select>
          </Field>
          <Field label="סגנון כפתור">
            <select value={liveBrand.buttonStyle} onChange={e => set('buttonStyle', e.target.value as ButtonStyle)}>
              {(Object.keys(BUTTON_STYLE_LABELS) as ButtonStyle[]).map(k => <option key={k} value={k}>{BUTTON_STYLE_LABELS[k]}</option>)}
            </select>
          </Field>
          <Field label="פינות">
            <select value={cornerOf(draft, liveBrand.radius)} onChange={e => set('corner', e.target.value as CornerStyle)}>
              {(Object.keys(CORNER_STYLE_LABELS) as CornerStyle[]).map(k => <option key={k} value={k}>{CORNER_STYLE_LABELS[k]}</option>)}
            </select>
          </Field>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={busy || !dirty}>
            {busy ? 'שומר…' : saved ? '✓ נשמר' : dirty ? 'שמירת העיצוב' : 'נשמר'}
          </button>
          {dirty && <button className="btn btn-ghost btn-sm" onClick={() => setDraft(profile.branding?.docDesign ?? { preset: 'minimal-light' })}>ביטול שינויים</button>}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--gray-500)', lineHeight: 1.6 }}>
          העיצוב חל על עמוד ההצעה, בקשת הייצוג והמייל ללקוח. הלוגו והחתימה נערכים בלשוניות <b>מותג</b> ו<b>חתימת מייל</b>.
        </div>
      </div>

      {/* ── תצוגה מקדימה חיה ── */}
      <div style={{ position: 'sticky', top: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <div className="tabs" style={{ margin: 0 }}>
            <button className={`tab ${surface === 'quotation' ? 'active' : ''}`} onClick={() => setSurface('quotation')}>הצעת מחיר</button>
            <button className={`tab ${surface === 'representation' ? 'active' : ''}`} onClick={() => setSurface('representation')}>בקשת ייצוג</button>
            <button className={`tab ${surface === 'email' ? 'active' : ''}`} onClick={() => setSurface('email')}>מייל</button>
          </div>
          {surface !== 'email' && (
            <div className="tabs" style={{ margin: 0, marginInlineStart: 'auto' }}>
              <button className={`tab ${device === 'desktop' ? 'active' : ''}`} onClick={() => setDevice('desktop')}>🖥️ דסקטופ</button>
              <button className={`tab ${device === 'mobile' ? 'active' : ''}`} onClick={() => setDevice('mobile')}>📱 מובייל</button>
            </div>
          )}
        </div>

        <div style={{ border: '1px solid var(--gray-200)', borderRadius: 14, overflow: 'hidden', background: liveBrand.pageBg, height: 'calc(100vh - 150px)', minHeight: 560 }}>
          <div style={{ height: '100%', overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: previewMaxW, maxWidth: '100%', transition: 'width .2s' }}>
              {surface === 'quotation' && <QuotationWebView data={SAMPLE} brand={liveBrand} compact={device === 'mobile'} />}
              {surface === 'representation' && <RepresentationPreview brand={liveBrand} compact={device === 'mobile'} />}
              {surface === 'email' && <iframe title="email-preview" srcDoc={emailHtml} style={{ width: '100%', height: '100%', border: 'none', minHeight: 560 }} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function hasOverrides(d: FirmDocDesign): boolean {
  return Boolean(d.accent || d.ink || d.pageBg || d.cardBg || d.font || d.headerStyle || d.buttonStyle || d.corner);
}

function cornerOf(d: FirmDocDesign, radius: number): CornerStyle {
  if (d.corner) return d.corner;
  return radius <= 6 ? 'sharp' : radius >= 18 ? 'soft' : 'rounded';
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 12, color: 'var(--gray-600)', display: 'block', marginBottom: 10 }}>
      {label}
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="color" value={toHex(value)} onChange={e => onChange(e.target.value)} style={{ width: 40, height: 32, padding: 2, cursor: 'pointer', border: '1px solid var(--gray-300)', borderRadius: 6 }} />
        <input value={value} onChange={e => onChange(e.target.value)} dir="ltr" style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12.5 }} />
      </div>
    </Field>
  );
}

function toHex(v: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((v || '').trim());
  return m ? '#' + m[1] : '#000000';
}

const ctlCard: React.CSSProperties = { border: '1px solid var(--gray-200)', borderRadius: 12, padding: 14, background: 'white' };
const ctlTitle: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, marginBottom: 12, color: 'var(--gray-700)' };
