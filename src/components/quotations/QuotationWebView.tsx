// עמוד ההצעה כפי שהלקוח רואה אותו — קומפוננטה משותפת לתצוגה המקדימה (בבונה
// ובסטודיו העיצוב) ולעמוד הציבורי (שלב 3). Mobile-first, אישור בלבד.
// כל הצבעים/פינות/כותרת/כפתור/פונט מגיעים מ-brand (טוקני עיצוב) — כך שהסטודיו
// שולט במראה בזמן אמת בלי לגעת בקוד.

import { useState } from 'react';
import type { QuotationItem, ServiceCategory, FutureService, QuotationRepresentation } from '../../types/quotations';
import { SERVICE_CATEGORY_LABELS } from '../../types/quotations';
import type { RepAuthorityKind } from '../../types';
import { REP_AUTHORITY_ORDER } from '../../types';
import type { QuotationBrand } from './quotationBranding';
import {
  calcTotals, itemFinalPrice, itemOriginalPrice, formatILS, itemDisplayName,
  monthlyPlan, formatMonth, formatMonthRange,
  itemDeferred, deferredGroups, deferredDetailLines,
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
  /** הייצוג שהאישור יפתח. מכתיב את סעיף ההסבר ואת נוסח ההסכמה שליד החתימה. */
  representation?: QuotationRepresentation;
}

/** הרשויות שנבחרו, בסדר התצוגה הקבוע */
export function representationAuthorities(rep?: QuotationRepresentation): RepAuthorityKind[] {
  if (!rep?.enabled) return [];
  return REP_AUTHORITY_ORDER.filter(a => !!rep.areas?.[a]);
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
  /** קישור השלמת פרטי הייצוג — הלקוח מועבר אליו אוטומטית מיד לאחר האישור. */
  nextStepLink?: string;
  /** המעבר האוטומטי כבר רץ — רק אז מבטיחים ללקוח שהמסך יתחלף מעצמו */
  nextStepAuto?: boolean;
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
  data, brand, compact, interactive, status, onApprove, approving, onDownloadPdf, nextStepLink, nextStepAuto,
}: Props) {
  const totals = calcTotals(data.items, data.vatRate);
  const repAuthorities = representationAuthorities(data.representation);
  const hasRep = repAuthorities.length > 0;
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
            <div style={{ fontSize: compact ? 23 : 30, fontWeight: 600, letterSpacing: '-.02em', marginBottom: 7, lineHeight: 1.15 }}>
              {firstName ? `${firstName}, זו ההצעה שהכנתי עבורך.` : 'ההצעה שהכנתי עבורך.'}
            </div>
            <div style={{ fontSize: compact ? 14 : 15.5, color: brand.muted, lineHeight: 1.7 }}>
              ההצעה מבוססת על מה שסיכמנו ומותאמת לצרכים של {data.businessName || 'העסק שלך'}.
            </div>

            {isApproved && (
              <div style={{ marginTop: 16, background: 'rgba(16,185,129,.1)', color: '#065f46', borderRadius: brand.radius, padding: '11px 15px', fontSize: 13.5, fontWeight: 600 }}>
                {/* בלי קישור השלמה אין צעד נוסף ללקוח — למשל כשכבר השלים
                    את פרטי הזיהוי בתהליך ייצוג קודם. */}
                {hasRep && nextStepLink
                  ? 'ההצעה אושרה. תודה — נשאר צעד אחד קצר.'
                  : 'ההצעה אושרה. תודה — אצור איתך קשר להמשך.'}
              </div>
            )}
            {isDead && (
              <div style={{ marginTop: 16, background: 'rgba(0,0,0,.04)', color: brand.muted, borderRadius: brand.radius, padding: '11px 15px', fontSize: 13.5, fontWeight: 600 }}>
                {status === 'expired' ? 'תוקף ההצעה פג. אפשר לפנות אליי לחידוש.' : 'ההצעה בוטלה. אפשר לפנות אליי לפרטים.'}
              </div>
            )}
          </div>

          {/* שירותים */}
          <div style={{ padding: `0 ${pad}px ${compact ? 18 : 24}px` }}>
            <SectionLabel brand={brand}>מה תקבל במסגרת הליווי</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {priced.length === 0 && <div style={{ color: brand.muted, fontSize: 13.5 }}>טרם נוספו שירותים להצעה.</div>}
              {priced.map(item => <ServiceCard key={item.id} item={item} brand={brand} compact={compact} vatRate={data.vatRate} />)}
            </div>

            {included.length > 0 && (
              <>
                <div style={{ height: 18 }} />
                <SectionLabel brand={brand}>כלול בליווי — ללא תוספת תשלום</SectionLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  {included.map(item => (
                    <div key={item.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: brand.pageBg, borderRadius: 999, padding: '7px 14px', fontSize: 12.5, color: brand.ink, fontWeight: 500, border: `1px solid ${brand.border}` }}>
                      <span style={{ color: brand.accent, fontWeight: 600 }}>✓</span>{itemDisplayName(item)}
                      {/* שירות כלול שיש לו מחיר — הערך מוצג מחוק, אחרת ההטבה
                          שקופה ללקוח והוא לא יודע שקיבל משהו */}
                      {itemFinalPrice(item) >= 1 && (
                        <span style={{ color: brand.muted, textDecoration: 'line-through', textDecorationColor: '#dc2626', fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}>
                          {formatILS(Math.round(itemFinalPrice(item)))}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* שני משפטים בלבד: איך מתחילים, ומי איש הקשר. ההערה האישית פר-לקוח
              נכנסת ביניהם כשהיא קיימת. בלי סיסמאות ובלי הבטחות שיווקיות. */}
          <div style={{ padding: `${compact ? 4 : 6}px ${pad}px ${compact ? 18 : 24}px`, display: 'flex', flexDirection: 'column', gap: compact ? 16 : 18 }}>
            <div>
              <SectionLabel brand={brand}>איך מתחילים</SectionLabel>
              <div style={{ marginTop: 9, fontSize: compact ? 13.5 : 14.5, color: brand.ink, opacity: .88, lineHeight: 1.75 }}>
                בתחילת הדרך אבדוק את התיק שלך, אשלים כל מה שנדרש ואוודא שהכול מסודר להמשך.
              </div>
            </div>
            {data.notesForClient?.trim() && (
              <div>
                <SectionLabel brand={brand}>הערה אישית</SectionLabel>
                <div style={{ marginTop: 9, fontSize: compact ? 13.5 : 14.5, color: brand.ink, opacity: .88, lineHeight: 1.75, whiteSpace: 'pre-line' }}>
                  {data.notesForClient}
                </div>
              </div>
            )}
            <div>
              <SectionLabel brand={brand}>איש הקשר שלך</SectionLabel>
              <div style={{ marginTop: 9, fontSize: compact ? 13.5 : 14.5, color: brand.ink, opacity: .88, lineHeight: 1.75 }}>
                אני אהיה איש הקשר שלך לאורך כל הדרך.
                לכל שאלה או התלבטות אפשר לפנות אליי ישירות בטלפון או בוואטסאפ.
              </div>
            </div>
          </div>

          {/* תמחור */}
          <div style={{ padding: `${compact ? 18 : 22}px ${pad}px`, background: tint(brand.pageBg), borderTop: `1px solid ${brand.border}`, borderBottom: `1px solid ${brand.border}` }}>
            <SectionLabel brand={brand}>סיכום התמחור</SectionLabel>
            <div style={{ marginTop: 9, fontSize: compact ? 13 : 14, color: brand.ink, opacity: .88, lineHeight: 1.7 }}>
              זה המחיר שסיכמנו, והוא כולל את כל השירותים המפורטים בהצעה.
            </div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {totals.monthly.withVat > 0 && (
                <PriceBlock brand={brand} label="חודשי" t={totals.monthly} vatRate={data.vatRate} suffix="לחודש" compact={compact}
                  footnote={<MonthlyTerms data={data} totals={totals} brand={brand} />} />
              )}
              {totals.annual.withVat > 0 && <PriceBlock brand={brand} label="שנתי" t={totals.annual} vatRate={data.vatRate} suffix="לשנה" compact={compact} />}
              {totals.oneTime.withVat > 0 && <PriceBlock brand={brand} label="חד־פעמי" t={totals.oneTime} vatRate={data.vatRate} suffix="" compact={compact} />}
              {/* ‼ יתרה לתשלום מאוחר היא בלוק נפרד ולעולם לא חלק מ"חד־פעמי":
                  "חד־פעמי" נקרא כמשהו שמשלמים עכשיו, וזה בדיוק מה שזה לא.
                  קבוצה לכל מועד גבייה — הדוח השנתי והצהרת ההון אינם אותו תשלום. */}
              {deferredGroups(data.items, data.vatRate).map(g => (
                <PriceBlock key={g.trigger} brand={brand} label={`לתשלום ${g.trigger}`} t={g.total}
                  vatRate={data.vatRate} suffix="" compact={compact}
                  footnote={
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${brand.border}`, fontSize: 12.5, color: brand.muted, lineHeight: 1.65 }}>
                      לא נגבה עכשיו. הסכום ייגבה {g.trigger}, ואינו חלק מהתשלום החודשי.
                    </div>
                  } />
              ))}
              {priced.length === 0 && <div style={{ color: brand.muted, fontSize: 13.5 }}>—</div>}
            </div>
            {(() => {
              // סך ההטבה — כל תדירות בסקאלה שלה, בלי לאחד למספר אחד מטעה
              const parts = [
                totals.monthly.discount >= 1 ? `${formatILS(Math.round(totals.monthly.discount))} בכל חודש` : '',
                totals.annual.discount >= 1 ? `${formatILS(Math.round(totals.annual.discount))} בשנה` : '',
                totals.oneTime.discount >= 1 ? `${formatILS(Math.round(totals.oneTime.discount))} חד־פעמי` : '',
                totals.deferred.discount >= 1 ? `${formatILS(Math.round(totals.deferred.discount))} על היתרה` : '',
              ].filter(Boolean);
              if (parts.length === 0) return null;
              return (
                <div style={{ marginTop: 14, background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.25)', color: '#047857', borderRadius: brand.radius, padding: '11px 15px', fontSize: compact ? 13 : 14, fontWeight: 600 }}>
                  ההנחה שסיכמנו: {parts.join(' · ')} <span style={{ fontWeight: 400, fontSize: 11.5 }}>(לפני מע״מ)</span>
                </div>
              );
            })()}
            <div style={{ marginTop: 14, fontSize: 11.5, color: brand.muted, lineHeight: 1.6 }}>
              חיוב חודשי, שנתי וחד־פעמי מוצגים בנפרד{totals.deferred.withVat > 0 ? ', וכך גם סכום שנגבה במועד מאוחר' : ''}. הסכומים הסופיים כוללים מע״מ.
            </div>
          </div>

          {/* מחירון שירותים עתידיים — מקופל כברירת מחדל.
              השקיפות מסופקת ע"י עצם קיום השורה ("מחירון · N שירותים"), בלי
              שקיר של מחירים שלא ביקשו ידרוך על רגע ההחלטה. עד 3 שירותים —
              נשאר פתוח; לקפל שלוש שורות זו התחכמות מיותרת. */}
          {(data.futureServices?.length ?? 0) > 0 && (
            <FutureServices services={data.futureServices!} brand={brand} compact={compact} pad={pad} />
          )}

          {/* צעדים הבאים */}
          <div style={{ padding: `${compact ? 18 : 22}px ${pad}px`, borderTop: `1px solid ${brand.border}` }}>
            <SectionLabel brand={brand}>מה קורה אחרי האישור</SectionLabel>
            <ol style={{ marginTop: 12, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13.5, color: brand.ink, opacity: .85, lineHeight: 1.65 }}>
              {hasRep ? (
                <>
                  <li>מיד עם האישור תועבר למסך קצר להשלמת פרטי הזיהוי.</li>
                  <li>אכין את המסמכים ואשלח לך אותם לחתימה דיגיטלית.</li>
                  <li>משם הטיפול עליי.</li>
                </>
              ) : (
                <>
                  <li>אפתח את התיק ואתחיל בטיפול.</li>
                  <li>אבקש ממך כמה מסמכי זיהוי בסיסיים.</li>
                  <li>משם הטיפול עליי.</li>
                </>
              )}
            </ol>
          </div>

          {/* אישור + חתימה */}
          <div style={{ padding: pad, background: brand.ink }}>
            <div style={{ color: '#fff', fontSize: compact ? 16 : 19, fontWeight: 600, marginBottom: 4 }}>לאישור ההצעה</div>
            <div style={{ color: 'rgba(255,255,255,.68)', fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
              {expiryLabel ? `ההצעה בתוקף עד ${expiryLabel}.` : 'חתימה כאן, ואתחיל בעבודה.'}
            </div>

            {!isApproved && !isDead && (
              <div style={{ background: '#fff', borderRadius: brand.radius + 2, padding: compact ? 14 : 18, marginBottom: 14, textAlign: 'start' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', marginBottom: 10 }}>אישור וחתימה</div>
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

            {/* הצעד הבא קורה מעצמו: המסך מודיע שאושר ומעביר את הלקוח להשלמת
                הפרטים. הקישור נשאר גלוי כרשת ביטחון — דפדפן שחוסם ניווט אוטומטי,
                או לקוח שחזר לעמוד מאוחר יותר. המייל נשלח במקביל, לתיעוד. */}
            {isApproved && nextStepLink && (
              <div style={{ background: '#fff', borderRadius: brand.radius + 2, padding: compact ? 14 : 18, marginBottom: 14, textAlign: 'start' }}>
                <div style={{ fontSize: compact ? 14.5 : 15.5, fontWeight: 600, color: '#1f2937', marginBottom: 5 }}>
                  {nextStepAuto ? 'ההצעה אושרה — מעביר אותך להשלמת הפרטים' : 'נשאר צעד אחד — פרטי הזיהוי'}
                </div>
                <div style={{ fontSize: 12.5, color: '#6b7280', lineHeight: 1.65, marginBottom: 12 }}>
                  {nextStepAuto
                    ? 'עוד רגע ייפתח מסך קצר להשלמת פרטי הזיהוי. לוקח פחות מדקה.'
                    : 'נשאר להשלים מסך קצר של פרטי זיהוי — פחות מדקה. שלחתי לך את הקישור גם במייל.'}
                </div>
                <a
                  href={nextStepLink}
                  style={{
                    display: 'block', textAlign: 'center', textDecoration: 'none',
                    padding: compact ? '12px' : '14px',
                    borderRadius: brand.buttonStyle === 'pill' ? 999 : brand.radius,
                    background: brand.accent, color: '#fff',
                    fontSize: compact ? 14.5 : 15.5, fontWeight: 600,
                  }}
                >
                  {nextStepAuto ? 'להמשך עכשיו ←' : 'להשלמת הפרטים ←'}
                </a>
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
          {/* מי אחראי על ההצעה ומה מספר הרישיון שלו — זו זהות המשרד מול
              הלקוח, ועד עכשיו היא לא הגיעה לשום מסמך שנשלח החוצה. */}
          {(brand.accountantName || brand.licenseNumber) && (
            <div>
              {[
                brand.accountantName && `${brand.representativeType || 'רואה חשבון'} ${brand.accountantName}`,
                brand.licenseNumber && `מספר מייצג ${brand.licenseNumber}`,
              ].filter(Boolean).join(' · ')}
            </div>
          )}
          <div>{[brand.phone, brand.email].filter(Boolean).join(' · ')}</div>
          {brand.address && <div>{brand.address}</div>}
          {brand.website && <div dir="ltr">{brand.website}</div>}
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
    fontSize: compact ? 15 : 16, fontWeight: 600, fontFamily: 'inherit',
    cursor: enabled ? 'pointer' : 'default', opacity: isDead ? .5 : needsSignature ? .65 : 1,
  };
  const label = isApproved ? 'ההצעה אושרה' : approving ? 'מאשר…' : needsSignature ? 'יש לחתום למעלה' : 'אישור ההצעה';
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

// מחירון "אם וכאשר" — שורה מתקפלת. שם השירות הוא הבולט בשורה והמחיר רגוע
// לצידו: הסעיף נועד להרגיע ("לא תופתע"), לא להציג עוד מחירים.
function FutureServices({ services, brand, compact, pad }: {
  services: FutureService[]; brand: QuotationBrand; compact?: boolean; pad: number;
}) {
  const alwaysOpen = services.length <= 3;
  const [open, setOpen] = useState(alwaysOpen);

  const list = (
    <div style={{ marginTop: 12, borderRadius: brand.radius, border: `1px solid ${brand.border}`, overflow: 'hidden' }}>
      {services.map((fs, i) => (
        <div key={fs.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: compact ? '10px 12px' : '11px 14px', borderTop: i ? `1px solid ${brand.border}` : 'none', background: i % 2 ? tint(brand.cardBg) : brand.cardBg }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: brand.ink }}>{fs.name}</div>
            {fs.description && <div style={{ fontSize: 11.5, color: brand.muted, marginTop: 2 }}>{fs.description}</div>}
          </div>
          <div style={{ textAlign: 'end', whiteSpace: 'nowrap', color: brand.muted }}>
            <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatILS(fs.price)}</span>
            <span style={{ fontSize: 11, marginInlineStart: 4 }}>
              {CATEGORY_PRICE_SUFFIX[fs.category] ? `${CATEGORY_PRICE_SUFFIX[fs.category]} ` : ''}
              {fs.vatFlag ? '+ מע״מ' : ''}{fs.billingType === 'per_unit' ? ` / ${fs.unitLabel || 'יחידה'}` : ''}
            </span>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ padding: `${compact ? 18 : 22}px ${pad}px`, borderTop: `1px solid ${brand.border}` }}>
      {alwaysOpen ? (
        <>
          <SectionLabel brand={brand}>שירותים נוספים</SectionLabel>
          <div style={{ marginTop: 8, fontSize: 12.5, color: brand.muted, lineHeight: 1.6 }}>
            אינם כלולים בהצעה. תחויב רק אם תבקש אותם.
          </div>
          {list}
        </>
      ) : (
        <>
          <button
            onClick={() => setOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'start',
              background: open ? 'transparent' : tint(brand.pageBg), cursor: 'pointer',
              border: `1px solid ${brand.border}`, borderRadius: brand.radius,
              padding: compact ? '12px 14px' : '14px 16px', fontFamily: 'inherit', color: brand.ink,
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: compact ? 13.5 : 14.5, fontWeight: 600 }}>
                מחירון שירותים נוספים · {services.length} שירותים
              </span>
              <span style={{ display: 'block', fontSize: 11.5, color: brand.muted, marginTop: 2, lineHeight: 1.5 }}>
                אינם כלולים בהצעה. המחירים ידועים מראש, למקרה שתצטרך.
              </span>
            </span>
            <span style={{ fontSize: 11, color: brand.muted }}>{open ? '▲' : '▼'}</span>
          </button>
          {open && list}
        </>
      )}
    </div>
  );
}

function SectionLabel({ children, brand }: { children: React.ReactNode; brand: QuotationBrand }) {
  return <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: brand.muted }}>{children}</div>;
}

function ServiceCard({ item, brand, compact, vatRate }: { item: QuotationItem; brand: QuotationBrand; compact?: boolean; vatRate: number }) {
  const finalBeforeVat = itemFinalPrice(item);
  const deferred = itemDeferred(item, vatRate);
  const original = itemOriginalPrice(item);
  // עוגן מחיר: מציגים את המחיר המלא מחוק לצד המחיר שאחרי ההנחה
  const hasDiscount = original - finalBeforeVat >= 1;
  const discountPct = hasDiscount ? Math.round((1 - finalBeforeVat / original) * 100) : 0;
  const perUnit = item.billingType === 'per_unit';
  // שורה שתומחרה שנתית ונגבית חודשית — מציינים כמה תשלומים, ולא את הסכום
  // השנתי. החלטת גיא: הלקוח רואה מחיר אחד, מה שהוא משלם בחודש.
  const spread = item.category === 'monthly' && item.priceBasis === 'annual' ? monthlyPlan(item) : null;
  return (
    <div style={{ border: `1px solid ${brand.border}`, borderRadius: brand.radius, padding: compact ? 14 : 16, background: brand.cardBg }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: compact ? 14.5 : 15.5, fontWeight: 600, marginBottom: 3, color: brand.ink }}>{itemDisplayName(item)}</div>
          {item.description && <div style={{ fontSize: 12.5, color: brand.muted, lineHeight: 1.55 }}>{item.description}</div>}
          {item.clientNote && <div style={{ fontSize: 12, color: brand.accent, marginTop: 5 }}>{item.clientNote}</div>}
          <div style={{ fontSize: 11, color: brand.muted, marginTop: 6, opacity: .8 }}>
            {SERVICE_CATEGORY_LABELS[item.category]} · {spread
              ? `${spread.installments} תשלומים`
              : CATEGORY_BLURB[item.category]}
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
              <div style={{ display: 'inline-block', margin: '3px 0', background: 'rgba(16,185,129,.12)', color: '#047857', borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>
                הנחה {discountPct}%
              </div>
            </>
          )}
          <div style={{ fontSize: compact ? 17 : 19, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: hasDiscount ? '#047857' : brand.ink, letterSpacing: '-.01em' }}>
            {formatILS(Math.round(finalBeforeVat))}
          </div>
          <div style={{ fontSize: 10.5, color: brand.muted }}>{item.vatFlag ? '+ מע״מ' : 'ללא מע״מ'}</div>
        </div>
      </div>
      {deferred && <DeferredDetail b={deferred} brand={brand} compact={compact} />}
    </div>
  );
}

// פירוט היתרה מתחת לשורת השירות: מה שווה השירות, מה כבר כלול בחודשי, ומה
// נשאר לתשלום. חמש שורות בדיוק — זה הנוסח שגיא מקריא ללקוח בטלפון.
function DeferredDetail({ b, brand, compact }: {
  b: NonNullable<ReturnType<typeof itemDeferred>>; brand: QuotationBrand; compact?: boolean;
}) {
  const rows = deferredDetailLines(b);
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${brand.border}` }}>
      {rows.map(r => (
        <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '2px 0' }}>
          <span style={{
            fontSize: compact ? 12 : 12.5,
            fontWeight: r.strong ? 600 : 400,
            color: r.strong ? brand.ink : r.negative ? '#047857' : brand.muted,
          }}>{r.label}</span>
          <span style={{
            fontSize: compact ? 12.5 : 13,
            fontWeight: r.strong ? 600 : 400,
            fontVariantNumeric: 'tabular-nums',
            color: r.strong ? brand.ink : r.negative ? '#047857' : brand.muted,
          }}>{r.negative ? '−' : ''}{formatILS(Math.round(r.amount))}</span>
        </div>
      ))}
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
      <div style={{ padding: `${compact ? 10 : 12}px 16px 0`, fontSize: 11.5, fontWeight: 600, letterSpacing: '.06em', color: brand.muted }}>{label}</div>

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
              <span style={{ fontSize: 13, fontWeight: 600, color: '#047857' }}>הנחה {pct}%</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#047857', fontVariantNumeric: 'tabular-nums' }}>−{formatILS(Math.round(t.discount))}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0 2px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: brand.ink }}>מחיר אחרי הנחה</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: brand.ink, fontVariantNumeric: 'tabular-nums' }}>{formatILS(Math.round(t.beforeVat))}</span>
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
          <div style={{ fontSize: compact ? 13.5 : 14.5, fontWeight: 600, color: brand.ink }}>סה״כ לתשלום{suffix ? ` ${suffix}` : ''}</div>
          <div style={{ fontSize: 10.5, color: brand.muted }}>כולל מע״מ</div>
        </div>
        <div style={{ fontSize: compact ? 22 : 26, fontWeight: 600, color: brand.accent, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em' }}>
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
