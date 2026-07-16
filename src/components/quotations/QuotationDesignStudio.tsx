// סטודיו העיצוב — עורך את מראה עמודי הלקוח והמיילים עם תצוגה מקדימה חיה.
//
// ★ ארכיטקטורה: הסטודיו הוא עורך *מבוקר* (controlled). אין לו טיוטה משלו ואין
// לו כפתור שמירה — הוא קורא וכותב אל הטיוטה היחידה של מסך "המשרד", והשמירה
// המרכזית שם מטפלת בכל. כך אי אפשר שהעיצוב ייצא מסנכרון או יידרס.

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
  /** הטיוטה המשותפת של מסך המשרד — מקור האמת היחיד */
  profile: FirmProfile;
  /** מעדכן את העיצוב בתוך אותה טיוטה */
  onChange: (docDesign: FirmDocDesign) => void;
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
  futureServices: [
    { id: 'f1', name: 'הצהרת הון ראשונה', category: 'one_time', price: 1200, vatFlag: true, billingType: 'fixed' },
    { id: 'f2', name: 'מעבר מעוסק פטור לעוסק מורשה', category: 'one_time', price: 200, vatFlag: true, billingType: 'fixed' },
  ],
  notesForClient: 'שמחים על ההזדמנות ללוות אתכם. ההצעה מותאמת בדיוק לצרכים שסיכמנו בשיחה.',
};

export default function QuotationDesignStudio({ profile, onChange }: Props) {
  const [surface, setSurface] = useState<Surface>('quotation');
  const [device, setDevice] = useState<Device>('desktop');

  const dd: FirmDocDesign = profile.branding?.docDesign ?? {};

  // המותג החי נגזר ישירות מהטיוטה — לכן כל שינוי מופיע מיד, וגם שאר
  // הלשוניות (זהות/מותג) רואות בדיוק את אותו דבר.
  const brand = useMemo(() => deriveQuotationBrand(profile), [profile]);

  const emailHtml = useMemo(() => buildQuotationEmailHtml({
    quotationNumber: SAMPLE.quotationNumber, recipientName: SAMPLE.recipientName,
    businessName: SAMPLE.businessName, items: SAMPLE.items, vatRate: SAMPLE.vatRate,
    message: 'שמחים על ההזדמנות ללוות אתכם — מצורפת הצעה אישית.', quotationLink: '#',
  }, brand), [brand]);

  const set = <K extends keyof FirmDocDesign>(key: K, val: FirmDocDesign[K]) =>
    onChange({ ...dd, [key]: val });

  // בחירת תבנית מאפסת כיוונונים אישיים — נקודת פתיחה נקייה
  const applyPreset = (id: string) => onChange({ preset: id });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(272px, 320px) 1fr', gap: 20, alignItems: 'start' }}>

      {/* ── בקרות ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Group title="תבנית עיצוב" hint="נקודת פתיחה — אפשר לכוונן כל פרט אחריה">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {DESIGN_PRESETS.map(p => {
              const selected = dd.preset === p.id && !hasOverrides(dd);
              return (
                <button
                  key={p.id} onClick={() => applyPreset(p.id)} title={p.description}
                  aria-pressed={selected}
                  style={{
                    textAlign: 'start', padding: 9, borderRadius: 10, cursor: 'pointer',
                    background: 'white', fontFamily: 'inherit',
                    border: selected ? `1.5px solid ${p.accent}` : '1px solid var(--gray-200)',
                    boxShadow: selected ? `0 0 0 3px ${p.accent}22` : 'none',
                    transition: 'box-shadow .12s, border-color .12s',
                  }}
                >
                  <span style={{ display: 'flex', gap: 4, marginBottom: 7 }}>
                    <span style={{ width: 20, height: 20, borderRadius: 5, background: p.ink }} />
                    <span style={{ width: 20, height: 20, borderRadius: 5, background: p.accent }} />
                    <span style={{ width: 20, height: 20, borderRadius: 5, background: p.pageBg, border: '1px solid var(--gray-200)' }} />
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, display: 'block' }}>{p.label}</span>
                </button>
              );
            })}
          </div>
        </Group>

        <Group title="צבעים">
          <ColorField label="אקסנט — כפתורים ומחירים" value={brand.accent} onChange={v => set('accent', v)} />
          <ColorField label="כהה — כותרות ומשטח האישור" value={brand.ink} onChange={v => set('ink', v)} />
          <ColorField label="רקע העמוד" value={brand.pageBg} onChange={v => set('pageBg', v)} last />
        </Group>

        <Group title="טיפוגרפיה וסגנון">
          <Field label="פונט">
            <select value={brand.font} onChange={e => set('font', e.target.value)}>
              {FONT_CHOICES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="כותרת">
            <select value={brand.headerStyle} onChange={e => set('headerStyle', e.target.value as HeaderStyle)}>
              {(Object.keys(HEADER_STYLE_LABELS) as HeaderStyle[]).map(k => <option key={k} value={k}>{HEADER_STYLE_LABELS[k]}</option>)}
            </select>
          </Field>
          <Field label="כפתור">
            <select value={brand.buttonStyle} onChange={e => set('buttonStyle', e.target.value as ButtonStyle)}>
              {(Object.keys(BUTTON_STYLE_LABELS) as ButtonStyle[]).map(k => <option key={k} value={k}>{BUTTON_STYLE_LABELS[k]}</option>)}
            </select>
          </Field>
          <Field label="פינות" last>
            <select value={cornerOf(dd, brand.radius)} onChange={e => set('corner', e.target.value as CornerStyle)}>
              {(Object.keys(CORNER_STYLE_LABELS) as CornerStyle[]).map(k => <option key={k} value={k}>{CORNER_STYLE_LABELS[k]}</option>)}
            </select>
          </Field>
        </Group>

        <p style={{ fontSize: 11.5, color: 'var(--gray-500)', lineHeight: 1.65, margin: 0 }}>
          העיצוב חל על עמוד ההצעה, בקשת הייצוג וכל מייל ללקוח. הלוגו והחתימה נערכים
          בלשוניות <b>מותג</b> ו<b>חתימת מייל</b>. השינויים נשמרים עם כפתור השמירה למעלה.
        </p>
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

        <div style={{ border: '1px solid var(--gray-200)', borderRadius: 14, overflow: 'hidden', background: brand.pageBg, height: 'calc(100vh - 190px)', minHeight: 540 }}>
          <div style={{ height: '100%', overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: device === 'mobile' && surface !== 'email' ? 400 : '100%', maxWidth: '100%', transition: 'width .2s' }}>
              {surface === 'quotation' && <QuotationWebView data={SAMPLE} brand={brand} compact={device === 'mobile'} />}
              {surface === 'representation' && <RepresentationPreview brand={brand} compact={device === 'mobile'} />}
              {surface === 'email' && <iframe title="email-preview" srcDoc={emailHtml} style={{ width: '100%', height: '100%', border: 'none', minHeight: 540 }} />}
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

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section style={{ border: '1px solid var(--gray-200)', borderRadius: 12, padding: 14, background: 'white' }}>
      <h3 style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--gray-700)', margin: 0 }}>{title}</h3>
      {hint && <p style={{ fontSize: 11, color: 'var(--gray-500)', margin: '3px 0 0' }}>{hint}</p>}
      <div style={{ marginTop: 12 }}>{children}</div>
    </section>
  );
}

function Field({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <label style={{ fontSize: 12, color: 'var(--gray-600)', display: 'block', marginBottom: last ? 0 : 10 }}>
      {label}
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  );
}

function ColorField({ label, value, onChange, last }: { label: string; value: string; onChange: (v: string) => void; last?: boolean }) {
  return (
    <Field label={label} last={last}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="color" value={toHex(value)} onChange={e => onChange(e.target.value)}
          style={{ width: 38, height: 32, padding: 2, cursor: 'pointer', border: '1px solid var(--gray-300)', borderRadius: 6, flexShrink: 0 }} />
        <input value={value} onChange={e => onChange(e.target.value)} dir="ltr"
          style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }} />
      </div>
    </Field>
  );
}

function toHex(v: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((v || '').trim());
  return m ? '#' + m[1] : '#000000';
}
