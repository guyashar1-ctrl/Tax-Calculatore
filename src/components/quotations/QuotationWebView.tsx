// עמוד ההצעה כפי שהלקוח רואה אותו — קומפוננטה משותפת לתצוגה המקדימה (בבונה
// ובסטודיו העיצוב) ולעמוד הציבורי (שלב 3). Mobile-first, אישור בלבד.
// כל הצבעים/פינות/כותרת/כפתור/פונט מגיעים מ-brand (טוקני עיצוב) — כך שהסטודיו
// שולט במראה בזמן אמת בלי לגעת בקוד.

import type { QuotationItem, ServiceCategory } from '../../types/quotations';
import { SERVICE_CATEGORY_LABELS } from '../../types/quotations';
import type { QuotationBrand } from './quotationBranding';
import { calcTotals, itemFinalPrice, formatILS } from '../../utils/quotationCalc';

export interface QuotationWebViewData {
  quotationNumber: string;
  recipientName: string;
  businessName?: string;
  items: QuotationItem[];
  vatRate: number;
  notesForClient?: string;
  expiresAt?: string;
}

interface Props {
  data: QuotationWebViewData;
  brand: QuotationBrand;
  compact?: boolean;
  interactive?: boolean;
  status?: string;
  onApprove?: () => void;
  approving?: boolean;
  onDownloadPdf?: () => void;
}

const CATEGORY_BLURB: Record<ServiceCategory, string> = {
  monthly: 'תשלום חודשי קבוע',
  annual: 'תשלום שנתי',
  one_time: 'תשלום חד־פעמי',
  included: 'כלול ללא תוספת תשלום',
};

export default function QuotationWebView({
  data, brand, compact, interactive, status, onApprove, approving, onDownloadPdf,
}: Props) {
  const totals = calcTotals(data.items, data.vatRate);
  const pad = compact ? 22 : 44;
  const maxW = compact ? '100%' : 640;
  const cardRadius = brand.radius + 4;
  const font = `'${brand.font}', system-ui, sans-serif`;

  const priced = data.items.filter(i => i.category !== 'included');
  const included = data.items.filter(i => i.category === 'included');

  const isApproved = status === 'approved';
  const isDead = status === 'cancelled' || status === 'expired';

  const expiryDate = data.expiresAt ? new Date(data.expiresAt) : null;
  const expiryLabel = expiryDate
    ? expiryDate.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const firstName = greetingName(data.recipientName);

  // ─── כותרת לפי סגנון ───
  const logoNode = brand.logoUrl
    ? <img src={brand.logoUrl} alt="" style={{ maxHeight: compact ? 32 : 40, maxWidth: 170, objectFit: 'contain' }} />
    : (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
        <span style={{ width: compact ? 36 : 42, height: compact ? 36 : 42, borderRadius: '50%', border: `1.5px solid ${brand.ink}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: compact ? 14 : 16, fontWeight: 600, color: brand.ink }}>{brand.monogram}</span>
        <span style={{ fontSize: compact ? 15 : 17, fontWeight: 600, color: brand.ink }}>{brand.firmName}</span>
      </span>
    );

  function Header() {
    if (brand.headerStyle === 'band') {
      return (
        <div style={{ background: brand.ink, padding: `${compact ? 18 : 24}px ${pad}px`, display: 'flex', alignItems: 'center', gap: 10 }}>
          {brand.logoUrl
            ? <img src={brand.logoUrl} alt="" style={{ maxHeight: compact ? 30 : 38, maxWidth: 170, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
            : <>
                <span style={{ width: compact ? 34 : 40, height: compact ? 34 : 40, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,.85)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: compact ? 13 : 15, fontWeight: 600, color: '#fff' }}>{brand.monogram}</span>
                <span style={{ fontSize: compact ? 15 : 17, fontWeight: 600, color: '#fff' }}>{brand.firmName}</span>
              </>}
          <span style={{ marginInlineStart: 'auto', fontSize: 11.5, color: 'rgba(255,255,255,.6)', fontVariantNumeric: 'tabular-nums' }}>הצעה מס׳ {data.quotationNumber}</span>
        </div>
      );
    }
    if (brand.headerStyle === 'centered') {
      return (
        <div style={{ padding: `${pad}px ${pad}px ${compact ? 14 : 20}px`, textAlign: 'center', borderBottom: `1px solid ${brand.border}` }}>
          <div style={{ display: 'inline-flex', justifyContent: 'center' }}>{logoNode}</div>
          <div style={{ fontSize: 11.5, color: brand.muted, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>הצעה מס׳ {data.quotationNumber}</div>
        </div>
      );
    }
    // minimal
    return (
      <div style={{ padding: `${pad}px ${pad}px ${compact ? 10 : 14}px`, display: 'flex', alignItems: 'center', gap: 10 }}>
        {logoNode}
        <span style={{ marginInlineStart: 'auto', fontSize: 11.5, color: brand.muted, fontVariantNumeric: 'tabular-nums' }}>הצעה מס׳ {data.quotationNumber}</span>
      </div>
    );
  }

  const introPadTop = brand.headerStyle === 'minimal' ? 0 : compact ? 16 : 22;

  return (
    <div style={{ background: brand.pageBg, minHeight: '100%', padding: compact ? 12 : 28, fontFamily: font, color: brand.ink, direction: 'rtl' }}>
      <div style={{ maxWidth: maxW, margin: '0 auto' }}>
        <div style={{ background: brand.cardBg, borderRadius: cardRadius, overflow: 'hidden', boxShadow: '0 12px 44px rgba(0,0,0,.09)', border: `1px solid ${brand.border}` }}>

          <Header />

          {/* פתיח */}
          <div style={{ padding: `${introPadTop}px ${pad}px ${compact ? 20 : 28}px` }}>
            <div style={{ fontSize: compact ? 23 : 30, fontWeight: 700, letterSpacing: '-.02em', marginBottom: 7, lineHeight: 1.15 }}>
              {firstName ? `${firstName}, נעים להכיר` : 'הצעת מחיר'}
            </div>
            <div style={{ fontSize: compact ? 14 : 15.5, color: brand.muted, lineHeight: 1.65 }}>
              הכנו עבורך הצעה אישית לליווי חשבונאי ומקצועי{data.businessName ? ` עבור ${data.businessName}` : ''}.
              כל הפרטים כאן למטה — שקוף, בלי אותיות קטנות.
            </div>

            {isApproved && (
              <div style={{ marginTop: 16, background: 'rgba(16,185,129,.1)', color: '#065f46', borderRadius: brand.radius, padding: '11px 15px', fontSize: 13.5, fontWeight: 600 }}>
                ✓ ההצעה אושרה. תודה! ניצור קשר להמשך התהליך.
              </div>
            )}
            {isDead && (
              <div style={{ marginTop: 16, background: 'rgba(0,0,0,.04)', color: brand.muted, borderRadius: brand.radius, padding: '11px 15px', fontSize: 13.5, fontWeight: 600 }}>
                {status === 'expired' ? 'תוקף ההצעה פג. ניתן לפנות אלינו לחידוש.' : 'ההצעה בוטלה. לפרטים נוספים ניתן לפנות אלינו.'}
              </div>
            )}
          </div>

          {/* שירותים */}
          <div style={{ padding: `0 ${pad}px ${compact ? 18 : 24}px` }}>
            <SectionLabel brand={brand}>השירותים שלנו</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {priced.length === 0 && <div style={{ color: brand.muted, fontSize: 13.5 }}>טרם נוספו שירותים להצעה.</div>}
              {priced.map(item => <ServiceCard key={item.id} item={item} vatRate={data.vatRate} brand={brand} compact={compact} />)}
            </div>

            {included.length > 0 && (
              <>
                <div style={{ height: 18 }} />
                <SectionLabel brand={brand}>כלול במחיר — ללא תוספת</SectionLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  {included.map(item => (
                    <div key={item.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: brand.pageBg, borderRadius: 999, padding: '7px 14px', fontSize: 12.5, color: brand.ink, fontWeight: 500, border: `1px solid ${brand.border}` }}>
                      <span style={{ color: brand.accent, fontWeight: 700 }}>✓</span>{item.name}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* תמחור */}
          <div style={{ padding: `${compact ? 18 : 22}px ${pad}px`, background: tint(brand.pageBg), borderTop: `1px solid ${brand.border}`, borderBottom: `1px solid ${brand.border}` }}>
            <SectionLabel brand={brand}>סיכום התמחור</SectionLabel>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {totals.monthly.withVat > 0 && <PriceRow brand={brand} label="חודשי" value={totals.monthly.withVat} vat={totals.monthly.vat} suffix="לחודש" />}
              {totals.annual.withVat > 0 && <PriceRow brand={brand} label="שנתי" value={totals.annual.withVat} vat={totals.annual.vat} suffix="לשנה" />}
              {totals.oneTime.withVat > 0 && <PriceRow brand={brand} label="חד־פעמי" value={totals.oneTime.withVat} vat={totals.oneTime.vat} suffix="" />}
              {priced.length === 0 && <div style={{ color: brand.muted, fontSize: 13.5 }}>—</div>}
            </div>
            <div style={{ marginTop: 12, fontSize: 11.5, color: brand.muted }}>
              המחירים כוללים מע״מ ({data.vatRate}%). חיובים חודשיים, שנתיים וחד־פעמיים מוצגים בנפרד ואינם מאוחדים.
            </div>
          </div>

          {/* הערה */}
          {data.notesForClient?.trim() && (
            <div style={{ padding: `${compact ? 18 : 22}px ${pad}px` }}>
              <SectionLabel brand={brand}>הערה אישית</SectionLabel>
              <div style={{ marginTop: 10, fontSize: 14, color: brand.ink, lineHeight: 1.75, whiteSpace: 'pre-line', opacity: .85 }}>{data.notesForClient}</div>
            </div>
          )}

          {/* צעדים הבאים */}
          <div style={{ padding: `${compact ? 18 : 22}px ${pad}px`, borderTop: `1px solid ${brand.border}` }}>
            <SectionLabel brand={brand}>מה קורה אחרי האישור</SectionLabel>
            <ol style={{ marginTop: 12, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13.5, color: brand.ink, opacity: .85, lineHeight: 1.6 }}>
              <li>נפתח עבורך את התיק ונתחיל בהליך ייצוג מול הרשויות.</li>
              <li>נבקש כמה מסמכי זיהוי בסיסיים — הכל דיגיטלי, בלי ניירת.</li>
              <li>משם אנחנו מטפלים בהכול. נהיה זמינים לכל שאלה.</li>
            </ol>
          </div>

          {/* אישור */}
          <div style={{ padding: pad, background: brand.ink }}>
            <div style={{ color: '#fff', fontSize: compact ? 16 : 19, fontWeight: 600, marginBottom: 4 }}>מוכנים להתחיל?</div>
            <div style={{ color: 'rgba(255,255,255,.68)', fontSize: 13, marginBottom: 16 }}>
              {expiryLabel ? `ההצעה בתוקף עד ${expiryLabel}.` : 'לאישור ההצעה — לחיצה אחת.'}
            </div>
            <ApproveButton
              brand={brand} compact={compact}
              isApproved={isApproved} isDead={isDead} approving={approving}
              enabled={!!interactive && !isApproved && !isDead && !approving}
              onClick={onApprove}
            />
            {onDownloadPdf && (
              <button onClick={onDownloadPdf} style={{ width: '100%', marginTop: 10, padding: '11px', borderRadius: brand.buttonStyle === 'pill' ? 999 : brand.radius, border: '1px solid rgba(255,255,255,.28)', background: 'transparent', color: '#fff', fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}>
                הורדת ההצעה כ־PDF
              </button>
            )}
            {!interactive && (
              <div style={{ marginTop: 12, textAlign: 'center', color: 'rgba(255,255,255,.5)', fontSize: 11.5 }}>תצוגה מקדימה — כך הלקוח יראה את עמוד האישור</div>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: '18px 12px', fontSize: 12, color: brand.muted, lineHeight: 1.7 }}>
          <div style={{ fontWeight: 600 }}>{brand.firmName}</div>
          <div>{[brand.phone, brand.email].filter(Boolean).join(' · ')}</div>
          {brand.address && <div>{brand.address}</div>}
        </div>
      </div>
    </div>
  );
}

function ApproveButton({ brand, compact, isApproved, isDead, approving, enabled, onClick }: {
  brand: QuotationBrand; compact?: boolean; isApproved: boolean; isDead: boolean; approving?: boolean; enabled: boolean; onClick?: () => void;
}) {
  const radius = brand.buttonStyle === 'pill' ? 999 : brand.radius;
  const base: React.CSSProperties = {
    width: '100%', padding: compact ? '13px' : '15px', borderRadius: radius,
    fontSize: compact ? 15 : 16, fontWeight: 700, fontFamily: 'inherit',
    cursor: enabled ? 'pointer' : 'default', opacity: isDead ? .5 : 1,
  };
  const label = isApproved ? '✓ ההצעה אושרה' : approving ? 'מאשר…' : 'אישור ההצעה';
  const style: React.CSSProperties = isApproved
    ? { ...base, background: '#10b981', color: '#fff', border: 'none' }
    : brand.buttonStyle === 'outline'
      ? { ...base, background: 'transparent', color: '#fff', border: '1.5px solid #fff' }
      : { ...base, background: brand.accent, color: '#fff', border: 'none' };
  return <button onClick={enabled ? onClick : undefined} disabled={!enabled} style={style}>{label}</button>;
}

function greetingName(fullName: string): string {
  return (fullName || '').trim().split(/\s+/)[0] || '';
}

function SectionLabel({ children, brand }: { children: React.ReactNode; brand: QuotationBrand }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: brand.muted }}>{children}</div>;
}

function ServiceCard({ item, vatRate, brand, compact }: { item: QuotationItem; vatRate: number; brand: QuotationBrand; compact?: boolean }) {
  const finalBeforeVat = itemFinalPrice(item);
  const withVat = item.vatFlag ? finalBeforeVat * (1 + vatRate / 100) : finalBeforeVat;
  const perUnit = item.billingType === 'per_unit';
  return (
    <div style={{ border: `1px solid ${brand.border}`, borderRadius: brand.radius, padding: compact ? 14 : 16, display: 'flex', gap: 12, alignItems: 'flex-start', background: brand.cardBg }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: compact ? 14.5 : 15.5, fontWeight: 600, marginBottom: 3, color: brand.ink }}>{item.name}</div>
        {item.description && <div style={{ fontSize: 12.5, color: brand.muted, lineHeight: 1.55 }}>{item.description}</div>}
        {item.clientNote && <div style={{ fontSize: 12, color: brand.accent, marginTop: 5 }}>{item.clientNote}</div>}
        <div style={{ fontSize: 11, color: brand.muted, marginTop: 6, opacity: .8 }}>
          {SERVICE_CATEGORY_LABELS[item.category]} · {CATEGORY_BLURB[item.category]}
          {perUnit && item.quantity > 1 ? ` · ${item.quantity} × ${item.unitLabel || 'יחידה'}` : ''}
        </div>
      </div>
      <div style={{ textAlign: 'end', whiteSpace: 'nowrap' }}>
        <div style={{ fontSize: compact ? 15 : 16.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: brand.ink }}>{formatILS(Math.round(withVat))}</div>
        <div style={{ fontSize: 10.5, color: brand.muted }}>כולל מע״מ</div>
      </div>
    </div>
  );
}

function PriceRow({ label, value, vat, suffix, brand }: { label: string; value: number; vat: number; suffix: string; brand: QuotationBrand }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '7px 0' }}>
      <div style={{ fontSize: 14, color: brand.ink, fontWeight: 500 }}>
        {label}
        <span style={{ fontSize: 11, color: brand.muted, marginInlineStart: 6 }}>(כולל מע״מ {formatILS(Math.round(vat))})</span>
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color: brand.accent, fontVariantNumeric: 'tabular-nums' }}>
        {formatILS(Math.round(value))}
        {suffix && <span style={{ fontSize: 11.5, color: brand.muted, fontWeight: 500, marginInlineStart: 3 }}>{suffix}</span>}
      </div>
    </div>
  );
}

// גוון עדין כהה יותר מרקע העמוד — לאזור הסיכום
function tint(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.max(0, ((n >> 16) & 255) - 6), g = Math.max(0, ((n >> 8) & 255) - 6), b = Math.max(0, (n & 255) - 6);
  return `rgb(${r},${g},${b})`;
}
