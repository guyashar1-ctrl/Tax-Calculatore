// עמוד ההצעה כפי שהלקוח רואה אותו — קומפוננטה משותפת לתצוגה המקדימה (בבונה
// ובסטודיו העיצוב) ולעמוד הציבורי (שלב 3). Mobile-first, אישור בלבד.
// כל הצבעים/פינות/כותרת/כפתור/פונט מגיעים מ-brand (טוקני עיצוב) — כך שהסטודיו
// שולט במראה בזמן אמת בלי לגעת בקוד.

import { useState } from 'react';
import type { QuotationItem, ServiceCategory, FutureService } from '../../types/quotations';
import { SERVICE_CATEGORY_LABELS } from '../../types/quotations';
import type { QuotationBrand } from './quotationBranding';
import {
  calcTotals, itemFinalPrice, itemOriginalPrice, formatILS, itemDisplayName,
  monthlyPlan, formatMonth, formatMonthRange,
} from '../../utils/quotationCalc';
import SignaturePad from '../SignaturePad';

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

// חתימת הלקוח שמאשרת את ההצעה — נשלחת יחד עם האישור ונשמרת כראיה
export interface ApprovalSignature {
  signatureDataUrl: string;
  signerName: string;
}

interface Props {
  data: QuotationWebViewData;
  brand: QuotationBrand;
  compact?: boolean;
  interactive?: boolean;
  status?: string;
  onApprove?: (sig: ApprovalSignature) => void;
  approving?: boolean;
  onDownloadPdf?: () => void;
}

const CATEGORY_BLURB: Record<ServiceCategory, string> = {
  monthly: 'תשלום חודשי קבוע',
  annual: 'תשלום שנתי',
  one_time: 'תשלום חד־פעמי',
  included: 'כלול ללא תוספת תשלום',
};

// תדירות ליד מחיר בשירותים העתידיים — בלי זה "₪350" נקרא כמחיר חד־פעמי
const CATEGORY_PRICE_SUFFIX: Record<ServiceCategory, string> = {
  monthly: 'לחודש',
  annual: 'לשנה',
  one_time: 'חד־פעמי',
  included: '',
};

export default function QuotationWebView({
  data, brand, compact, interactive, status, onApprove, approving, onDownloadPdf,
}: Props) {
  const totals = calcTotals(data.items, data.vatRate);
  const [signature, setSignature] = useState('');
  const [signerName, setSignerName] = useState('');
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
                      <span style={{ color: brand.accent, fontWeight: 700 }}>✓</span>{itemDisplayName(item)}
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
              {totals.monthly.withVat > 0 && (
                <PriceBlock brand={brand} label="חודשי" t={totals.monthly} vatRate={data.vatRate} suffix="לחודש" compact={compact}
                  footnote={<MonthlyTerms data={data} totals={totals} brand={brand} />} />
              )}
              {totals.annual.withVat > 0 && <PriceBlock brand={brand} label="שנתי" t={totals.annual} vatRate={data.vatRate} suffix="לשנה" compact={compact} />}
              {totals.oneTime.withVat > 0 && <PriceBlock brand={brand} label="חד־פעמי" t={totals.oneTime} vatRate={data.vatRate} suffix="" compact={compact} />}
              {priced.length === 0 && <div style={{ color: brand.muted, fontSize: 13.5 }}>—</div>}
            </div>
            {(() => {
              // סך ההטבה — כל תדירות בסקאלה שלה, בלי לאחד למספר אחד מטעה
              const parts = [
                totals.monthly.discount >= 1 ? `${formatILS(Math.round(totals.monthly.discount))} בכל חודש` : '',
                totals.annual.discount >= 1 ? `${formatILS(Math.round(totals.annual.discount))} בשנה` : '',
                totals.oneTime.discount >= 1 ? `${formatILS(Math.round(totals.oneTime.discount))} חד־פעמי` : '',
              ].filter(Boolean);
              if (parts.length === 0) return null;
              return (
                <div style={{ marginTop: 14, background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.3)', color: '#047857', borderRadius: brand.radius, padding: '12px 16px', fontSize: compact ? 13.5 : 14.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: compact ? 18 : 20 }}>🎁</span>
                  <span>החיסכון שלך בהצעה הזו: {parts.join(' · ')} <span style={{ fontWeight: 400, fontSize: 11.5 }}>(לפני מע״מ)</span></span>
                </div>
              );
            })()}
            <div style={{ marginTop: 14, fontSize: 11.5, color: brand.muted, lineHeight: 1.6 }}>
              חיובים חודשיים, שנתיים וחד־פעמיים מוצגים בנפרד ואינם מאוחדים. כל הסכומים הסופיים כוללים מע״מ.
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
                      <span style={{ fontSize: 11, fontWeight: 600, color: brand.ink, marginInlineStart: 4 }}>
                        {CATEGORY_PRICE_SUFFIX[fs.category] ? `${CATEGORY_PRICE_SUFFIX[fs.category]} ` : ''}
                      </span>
                      <span style={{ fontSize: 10.5, color: brand.muted }}>
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

          {/* אישור + חתימה */}
          <div style={{ padding: pad, background: brand.ink }}>
            <div style={{ color: '#fff', fontSize: compact ? 16 : 19, fontWeight: 600, marginBottom: 4 }}>מוכנים להתחיל?</div>
            <div style={{ color: 'rgba(255,255,255,.68)', fontSize: 13, marginBottom: 16 }}>
              {expiryLabel ? `ההצעה בתוקף עד ${expiryLabel}.` : 'חתימה קצרה — וההצעה מאושרת.'}
            </div>

            {!isApproved && !isDead && (
              <div style={{ background: '#fff', borderRadius: brand.radius + 2, padding: compact ? 14 : 18, marginBottom: 14, textAlign: 'start' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', marginBottom: 10 }}>אישור וחתימה</div>
                <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                  שם מלא של החותם
                  <input
                    value={signerName}
                    onChange={e => setSignerName(e.target.value)}
                    placeholder={data.recipientName}
                    style={{ display: 'block', width: '100%', marginTop: 4, padding: '9px 11px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }}
                  />
                </label>
                <SignaturePad value={signature} onChange={setSignature} height={compact ? 110 : 140} />
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, lineHeight: 1.6 }}>
                  החתימה מהווה אישור להצעת המחיר ולתנאיה כפי שמפורטים בעמוד זה.
                </div>
              </div>
            )}

            <ApproveButton
              brand={brand} compact={compact}
              isApproved={isApproved} isDead={isDead} approving={approving}
              enabled={!!interactive && !isApproved && !isDead && !approving && !!signature}
              needsSignature={!isApproved && !isDead && !signature}
              onClick={() => onApprove?.({ signatureDataUrl: signature, signerName: (signerName.trim() || data.recipientName).trim() })}
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

function ApproveButton({ brand, compact, isApproved, isDead, approving, enabled, needsSignature, onClick }: {
  brand: QuotationBrand; compact?: boolean; isApproved: boolean; isDead: boolean; approving?: boolean; enabled: boolean; needsSignature?: boolean; onClick?: () => void;
}) {
  const radius = brand.buttonStyle === 'pill' ? 999 : brand.radius;
  const base: React.CSSProperties = {
    width: '100%', padding: compact ? '13px' : '15px', borderRadius: radius,
    fontSize: compact ? 15 : 16, fontWeight: 700, fontFamily: 'inherit',
    cursor: enabled ? 'pointer' : 'default', opacity: isDead ? .5 : needsSignature ? .65 : 1,
  };
  const label = isApproved ? '✓ ההצעה אושרה' : approving ? 'מאשר…' : needsSignature ? 'חתמו למעלה כדי לאשר' : 'חתימה ואישור ההצעה';
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
  const original = itemOriginalPrice(item);
  // עוגן מחיר: מציגים את המחיר המלא מחוק לצד המחיר שאחרי ההנחה
  const hasDiscount = original - finalBeforeVat >= 1;
  const discountPct = hasDiscount ? Math.round((1 - finalBeforeVat / original) * 100) : 0;
  const perUnit = item.billingType === 'per_unit';
  return (
    <div style={{ border: `1px solid ${brand.border}`, borderRadius: brand.radius, padding: compact ? 14 : 16, display: 'flex', gap: 12, alignItems: 'flex-start', background: brand.cardBg }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: compact ? 14.5 : 15.5, fontWeight: 600, marginBottom: 3, color: brand.ink }}>{itemDisplayName(item)}</div>
        {item.description && <div style={{ fontSize: 12.5, color: brand.muted, lineHeight: 1.55 }}>{item.description}</div>}
        {item.clientNote && <div style={{ fontSize: 12, color: brand.accent, marginTop: 5 }}>{item.clientNote}</div>}
        <div style={{ fontSize: 11, color: brand.muted, marginTop: 6, opacity: .8 }}>
          {SERVICE_CATEGORY_LABELS[item.category]} · {CATEGORY_BLURB[item.category]}
          {perUnit && item.quantity > 1 ? ` · ${item.quantity} × ${item.unitLabel || 'יחידה'}` : ''}
        </div>
      </div>
      {/* סדר קריאה קבוע: מחיר מלא מחוק ← תגית הנחה ← מחיר סופי גדול */}
      <div style={{ textAlign: 'end', whiteSpace: 'nowrap' }}>
        {hasDiscount && (
          <>
            <div style={{ fontSize: 13, color: brand.muted, textDecoration: 'line-through', textDecorationColor: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
              {formatILS(Math.round(original))}
            </div>
            <div style={{ display: 'inline-block', margin: '3px 0', background: 'rgba(16,185,129,.12)', color: '#047857', borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 800 }}>
              הנחה {discountPct}%
            </div>
          </>
        )}
        <div style={{ fontSize: compact ? 17 : 19, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: hasDiscount ? '#047857' : brand.ink, letterSpacing: '-.01em' }}>
          {formatILS(Math.round(finalBeforeVat))}
        </div>
        <div style={{ fontSize: 10.5, color: brand.muted }}>{item.vatFlag ? '+ מע״מ' : 'ללא מע״מ'}</div>
      </div>
    </div>
  );
}

// פריסת התשלומים כפי שהלקוח צריך להבין אותה: כמה תשלומים, עד מתי, כמה בסך
// הכול — ובעיקר מה יקרה כשהתקופה תיגמר. בלי השורה האחרונה הלקוח מניח שהתשלום
// החודשי שראה הוא המחיר לתמיד, וזה מקור לוויכוח בהמשך.
function MonthlyTerms({ data, totals, brand }: {
  data: QuotationWebViewData; totals: ReturnType<typeof calcTotals>; brand: QuotationBrand;
}) {
  if (!totals.hasPartialTerm && !totals.changesAfterPeriod) return null;
  const monthlyItems = data.items.filter(i => i.category === 'monthly');
  const plans = monthlyItems.map(monthlyPlan);
  const first = plans[0];
  const range = first ? formatMonthRange(first.startMonth, first.endMonth) : '';

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${brand.border}`, fontSize: 12.5, color: brand.muted, lineHeight: 1.65 }}>
      {/* בלי סה"כ לתקופה — סכום שנתי מצטבר רק מגדיל את המספר בראש של הלקוח */}
      {totals.hasPartialTerm && totals.installments && (
        <div>
          <b style={{ color: brand.ink }}>{totals.installments} תשלומים</b>
          {range ? ` · ${range}` : ''}
        </div>
      )}
      {totals.changesAfterPeriod && (
        <div style={{ marginTop: 3 }}>
          {first?.nextMonth ? `החל מ${formatMonth(first.nextMonth)}` : 'לאחר מכן'}:{' '}
          <b style={{ color: brand.ink }}>{formatILS(Math.round(totals.monthlyOngoing.withVat))} לחודש</b> (12 תשלומים בשנה).
        </div>
      )}
    </div>
  );
}

// עוגן התנהגותי בסדר קבוע ובלתי ניתן לפספוס: מחיר מלא (מחוק) ← הנחה (שורה
// ירוקה בולטת) ← מחיר אחרי הנחה ← מע"מ ← "סה״כ לתשלום" ענק על רקע צבע המותג.
// ההנחה צריכה להרגיש כמו רווח של הלקוח, והמחיר הסופי — כמו השורה התחתונה.
function PriceBlock({ label, t, vatRate, suffix, brand, compact, footnote }: {
  label: string; t: { fullBeforeVat: number; discount: number; beforeVat: number; vat: number; withVat: number };
  vatRate: number; suffix: string; brand: QuotationBrand; compact?: boolean;
  footnote?: React.ReactNode;
}) {
  const hasDiscount = t.discount >= 1;
  const pct = hasDiscount ? Math.round((t.discount / t.fullBeforeVat) * 100) : 0;
  return (
    <div style={{ background: brand.cardBg, border: `1px solid ${brand.border}`, borderRadius: brand.radius, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
      <div style={{ padding: `${compact ? 10 : 12}px 16px 0`, fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', color: brand.muted }}>{label}</div>

      <div style={{ padding: `6px 16px ${compact ? 10 : 12}px` }}>
        {hasDiscount && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '3px 0' }}>
              <span style={{ fontSize: 13, color: brand.muted }}>מחיר מלא</span>
              <span style={{ fontSize: 15, color: brand.muted, textDecoration: 'line-through', textDecorationColor: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                {formatILS(Math.round(t.fullBeforeVat))}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(16,185,129,.1)', borderRadius: 8, padding: '6px 10px', margin: '3px -10px' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#047857' }}>🎁 הנחה {pct}%</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#047857', fontVariantNumeric: 'tabular-nums' }}>−{formatILS(Math.round(t.discount))}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0 2px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: brand.ink }}>מחיר אחרי הנחה</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: brand.ink, fontVariantNumeric: 'tabular-nums' }}>{formatILS(Math.round(t.beforeVat))}</span>
            </div>
          </>
        )}
        {!hasDiscount && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '3px 0' }}>
            <span style={{ fontSize: 13, color: brand.muted }}>מחיר</span>
            <span style={{ fontSize: 14.5, fontWeight: 600, color: brand.ink, fontVariantNumeric: 'tabular-nums' }}>{formatILS(Math.round(t.beforeVat))}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '2px 0' }}>
          <span style={{ fontSize: 12, color: brand.muted }}>+ מע״מ ({vatRate}%)</span>
          <span style={{ fontSize: 12.5, color: brand.muted, fontVariantNumeric: 'tabular-nums' }}>{formatILS(Math.round(t.vat))}</span>
        </div>
      </div>

      {/* השורה התחתונה — הכי גדולה בעמוד, על רקע צבע המותג */}
      <div style={{ background: alpha(brand.accent, .1), borderTop: `1.5px solid ${alpha(brand.accent, .35)}`, padding: `${compact ? 10 : 12}px 16px`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div>
          <div style={{ fontSize: compact ? 13.5 : 14.5, fontWeight: 700, color: brand.ink }}>סה״כ לתשלום{suffix ? ` ${suffix}` : ''}</div>
          <div style={{ fontSize: 10.5, color: brand.muted }}>כולל מע״מ</div>
        </div>
        <div style={{ fontSize: compact ? 22 : 26, fontWeight: 800, color: brand.accent, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em' }}>
          {formatILS(Math.round(t.withVat))}
        </div>
      </div>

      {footnote && <div style={{ padding: `0 16px ${compact ? 10 : 12}px` }}>{footnote}</div>}
    </div>
  );
}

// גוון שקוף של צבע המותג — לרקע שורת הסה"כ
function alpha(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// גוון עדין כהה יותר מרקע העמוד — לאזור הסיכום
function tint(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.max(0, ((n >> 16) & 255) - 6), g = Math.max(0, ((n >> 8) & 255) - 6), b = Math.max(0, (n & 255) - 6);
  return `rgb(${r},${g},${b})`;
}
