// עמוד ההצעה כפי שהלקוח רואה אותו — קומפוננטה משותפת לתצוגה המקדימה (בבונה
// ובסטודיו העיצוב) ולעמוד הציבורי (שלב 3). Mobile-first, אישור בלבד.
// כל הצבעים/פינות/כותרת/כפתור/פונט מגיעים מ-brand (טוקני עיצוב) — כך שהסטודיו
// שולט במראה בזמן אמת בלי לגעת בקוד.

import type { QuotationItem, ServiceCategory, FutureService } from '../../types/quotations';
import { SERVICE_CATEGORY_LABELS } from '../../types/quotations';
import type { QuotationBrand } from './quotationBranding';
import { calcTotals, itemFinalPrice, formatILS } from '../../utils/quotationCalc';

export interface QuotationWebViewData {
  quotationNumber: string;
  recipientName: string;
  businessName?: string;
  items: QuotationItem[];
  futureServices?: FutureService[];
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
  // גודל הלוגו נקבע בפרופיל המשרד; הרוחב גדל יחד עם הגובה כדי שלוגו רחב לא ייחתך
  const ls = brand.logoScale;
  const logoNode = brand.logoUrl
    ? <img src={brand.logoUrl} alt="" style={{ maxHeight: (compact ? 32 : 40) * ls, maxWidth: 170 * ls, objectFit: 'contain' }} />
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
          {/* יש לוגו ייעודי לרקע כהה — מציגים אותו כמו שהוא. אין כזה — מלבינים את
              הראשי כפתרון ביניים, מה שהופך אותו לצללית אחידה. */}
          {brand.logoOnDarkUrl || brand.logoUrl
            ? <img src={brand.logoOnDarkUrl || brand.logoUrl} alt="" style={{ maxHeight: (compact ? 30 : 38) * ls, maxWidth: 170 * ls, objectFit: 'contain', filter: brand.logoOnDarkUrl ? undefined : 'brightness(0) invert(1)' }} />
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
              {priced.map(item => <ServiceCard key={item.id} item={item} brand={brand} compact={compact} />)}
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
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {totals.monthly.withVat > 0 && <PriceBlock brand={brand} label="חודשי" t={totals.monthly} vatRate={data.vatRate} suffix="לחודש" compact={compact} />}
              {totals.annual.withVat > 0 && <PriceBlock brand={brand} label="שנתי" t={totals.annual} vatRate={data.vatRate} suffix="לשנה" compact={compact} />}
              {totals.oneTime.withVat > 0 && <PriceBlock brand={brand} label="חד־פעמי" t={totals.oneTime} vatRate={data.vatRate} suffix="" compact={compact} />}
              {priced.length === 0 && <div style={{ color: brand.muted, fontSize: 13.5 }}>—</div>}
            </div>
            <div style={{ marginTop: 14, fontSize: 11.5, color: brand.muted, lineHeight: 1.6 }}>
              חיובים חודשיים, שנתיים וחד־פעמיים מוצגים בנפרד ואינם מאוחדים.
            </div>
          </div>

          {/* מחירון שירותים עתידיים — שקיפות מלאה, בלי הפתעות */}
          {(data.futureServices?.length ?? 0) > 0 && (
            <div style={{ padding: `${compact ? 18 : 22}px ${pad}px`, borderTop: `1px solid ${brand.border}` }}>
              <SectionLabel brand={brand}>שירותים נוספים — אם וכאשר תצטרכו</SectionLabel>
              <div style={{ marginTop: 8, fontSize: 12.5, color: brand.muted, lineHeight: 1.6 }}>
                השירותים הבאים אינם כלולים בהצעה. אין צורך לעשות איתם דבר עכשיו — אבל כדי שלא תהיו מופתעים בהמשך, אלה המחירים הידועים מראש. תחויבו רק אם וכאשר תבקשו אותם בפועל.
              </div>
              <div style={{ marginTop: 12, borderRadius: brand.radius, border: `1px solid ${brand.border}`, overflow: 'hidden' }}>
                {data.futureServices!.map((fs, i) => (
                  <div key={fs.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: compact ? '10px 12px' : '11px 14px', borderTop: i ? `1px solid ${brand.border}` : 'none', background: i % 2 ? tint(brand.cardBg) : brand.cardBg }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500, color: brand.ink }}>{fs.name}</div>
                      {fs.description && <div style={{ fontSize: 11.5, color: brand.muted, marginTop: 2 }}>{fs.description}</div>}
                    </div>
                    <div style={{ textAlign: 'end', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: brand.ink, fontVariantNumeric: 'tabular-nums' }}>{formatILS(fs.price)}</span>
                      <span style={{ fontSize: 10.5, color: brand.muted, marginInlineStart: 4 }}>
                        {fs.vatFlag ? '+ מע״מ' : ''}{fs.billingType === 'per_unit' ? ` / ${fs.unitLabel || 'יחידה'}` : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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

function ServiceCard({ item, brand, compact }: { item: QuotationItem; brand: QuotationBrand; compact?: boolean }) {
  const finalBeforeVat = itemFinalPrice(item);
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
        <div style={{ fontSize: compact ? 15 : 16.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: brand.ink }}>{formatILS(Math.round(finalBeforeVat))}</div>
        <div style={{ fontSize: 10.5, color: brand.muted }}>{item.vatFlag ? '+ מע״מ' : 'ללא מע״מ'}</div>
      </div>
    </div>
  );
}

// סיכום לפי תדירות — לפני מע"מ, מע"מ בנפרד, וסה"כ לתשלום
function PriceBlock({ label, t, vatRate, suffix, brand, compact }: {
  label: string; t: { beforeVat: number; vat: number; withVat: number }; vatRate: number; suffix: string; brand: QuotationBrand; compact?: boolean;
}) {
  const line = (l: string, v: number, strong?: boolean) => (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '3px 0' }}>
      <span style={{ fontSize: strong ? 14 : 12.5, color: strong ? brand.ink : brand.muted, fontWeight: strong ? 600 : 400 }}>{l}</span>
      <span style={{ fontSize: strong ? (compact ? 16 : 17.5) : 12.5, fontWeight: strong ? 700 : 500, color: strong ? brand.accent : brand.muted, fontVariantNumeric: 'tabular-nums' }}>
        {formatILS(Math.round(v))}
      </span>
    </div>
  );
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: brand.ink, marginBottom: 4 }}>{label}</div>
      <div style={{ borderTop: `1px solid ${brand.border}`, paddingTop: 6 }}>
        {line('לפני מע״מ', t.beforeVat)}
        {line(`מע״מ (${vatRate}%)`, t.vat)}
        <div style={{ borderTop: `1px solid ${brand.border}`, marginTop: 5, paddingTop: 5 }}>
          {line(suffix ? `סה״כ ${suffix}` : 'סה״כ לתשלום', t.withVat, true)}
        </div>
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
