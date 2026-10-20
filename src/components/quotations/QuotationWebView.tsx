// עמוד ההצעה כפי שהלקוח רואה אותו — קומפוננטה משותפת לתצוגה המקדימה (בבונה
// ובסטודיו העיצוב) ולעמוד הציבורי (שלב 3). Mobile-first, אישור בלבד.
// כל הצבעים/פינות/כותרת/כפתור/פונט מגיעים מ-brand (טוקני עיצוב) — כך שהסטודיו
// שולט במראה בזמן אמת בלי לגעת בקוד.
//
// ‼ מבנה העמוד (גיא, 11.10.2026): הלקוח שואל שתי שאלות — "מה אני מקבל" ו"כמה
// ומתי יורד לי מהחשבון". כל כסף מוצג פעם אחת: "מה ומתי משלמים" כולל מע"מ,
// ההנחה בשורה אחת, ופירוט החישוב (לפני מע"מ) מקופל ב"איך חושב". רשימת השירותים
// בלי מחירים. עד אז אותו כסף הוצג שלוש פעמים, בשלושה מספרים שונים.

import { useState } from 'react';
import type { QuotationItem, ServiceCategory, FutureService, QuotationRepresentation } from '../../types/quotations';
import type { RepAuthorityKind } from '../../types';
import { REP_AUTHORITY_ORDER } from '../../types';
import type { QuotationBrand } from './quotationBranding';
import {
  itemFinalPrice, itemOriginalPrice, itemAnnualAnchor, formatILS, itemDisplayName,
  monthlyPlan, itemDeferred, deferredDetailLines,
  paymentSchedule, quotationSavings, quotationServiceYear, serviceYearClause, savingsHeadline, savingsLineValue,
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
  /** ‼ האישור נכשל בשרת. חייב להיראות: אחרת הלקוח לוחץ ולא קורה כלום. */
  approveError?: string;
  onDownloadPdf?: () => void;
  /** קישור השלמת פרטי הייצוג — הלקוח מועבר אליו אוטומטית מיד לאחר האישור. */
  nextStepLink?: string;
  /** המעבר האוטומטי כבר רץ — רק אז מבטיחים ללקוח שהמסך יתחלף מעצמו */
  nextStepAuto?: boolean;
}

// תדירות ליד מחיר — בלי זה "₪350" נקרא כמחיר חד־פעמי
const CATEGORY_PRICE_SUFFIX: Record<ServiceCategory, string> = {
  monthly: 'לחודש',
  annual: 'לשנה',
  one_time: 'חד־פעמי',
  included: '',
};

const GREEN = '#047857';
const GREEN_BG = 'rgba(16,185,129,.1)';

export default function QuotationWebView({
  data, brand, compact, interactive, status, onApprove, approving, approveError, onDownloadPdf, nextStepLink, nextStepAuto,
}: Props) {
  const repAuthorities = representationAuthorities(data.representation);
  const hasRep = repAuthorities.length > 0;
  const [signature, setSignature] = useState('');
  const [signerName, setSignerName] = useState('');
  const pad = compact ? 20 : 40;
  const maxW = compact ? '100%' : 600;
  const cardRadius = brand.radius + 4;
  const font = `'${brand.font}', system-ui, sans-serif`;

  const priced = data.items.filter(i => i.category !== 'included');
  const included = data.items.filter(i => i.category === 'included');
  const year = quotationServiceYear(data.items, data.expiresAt);

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

  const introPadTop = brand.headerStyle === 'minimal' ? 4 : compact ? 18 : 24;
  const bodyText = { fontSize: compact ? 13.5 : 14.5, color: brand.ink, lineHeight: 1.7 } as const;

  return (
    <div style={{ background: brand.pageBg, minHeight: '100%', padding: compact ? 12 : 24, fontFamily: font, color: brand.ink, direction: 'rtl' }}>
      <div style={{ maxWidth: maxW, margin: '0 auto' }}>
        <div style={{ background: brand.cardBg, borderRadius: cardRadius, overflow: 'hidden', boxShadow: '0 12px 44px rgba(0,0,0,.09)', border: `1px solid ${brand.border}` }}>

          <Header />

          {/* פתיח */}
          <div style={{ padding: `${introPadTop}px ${pad}px ${compact ? 18 : 24}px` }}>
            {year && (
              <div style={{ display: 'inline-block', marginBottom: 10, padding: '3px 11px', borderRadius: 999, background: alpha(brand.accent, .1), color: brand.accent, fontSize: 12, fontWeight: 600 }}>
                הצעת ליווי לשנת המס {year}
              </div>
            )}
            <div style={{ fontSize: compact ? 22 : 28, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1.2 }}>
              {firstName ? `${firstName}, זו ההצעה שהכנתי עבורך` : 'ההצעה שהכנתי עבורך'}
            </div>
            <div style={{ fontSize: compact ? 13.5 : 15, color: brand.muted, lineHeight: 1.6, marginTop: 6 }}>
              מבוססת על מה שסיכמנו ומותאמת לצרכים של {data.businessName || 'העסק שלך'}.
            </div>

            {isApproved && (
              <div style={{ marginTop: 16, background: GREEN_BG, color: '#065f46', borderRadius: brand.radius, padding: '11px 15px', fontSize: 13.5, fontWeight: 600 }}>
                {/* בלי קישור השלמה אין צעד נוסף ללקוח — למשל כשכבר השלים
                    את פרטי הזיהוי בתהליך ייצוג קודם. */}
                {hasRep && nextStepLink
                  ? 'ההצעה אושרה. תודה - נשאר צעד אחד קצר.'
                  : 'ההצעה אושרה. תודה - אצור איתך קשר להמשך.'}
              </div>
            )}
            {isDead && (
              <div style={{ marginTop: 16, background: 'rgba(0,0,0,.04)', color: brand.muted, borderRadius: brand.radius, padding: '11px 15px', fontSize: 13.5, fontWeight: 600 }}>
                {status === 'expired' ? 'תוקף ההצעה פג. אפשר לפנות אליי לחידוש.' : 'ההצעה בוטלה. אפשר לפנות אליי לפרטים.'}
              </div>
            )}
          </div>

          {/* מה ומתי משלמים */}
          <div style={{ padding: `0 ${compact ? 14 : pad - 8}px` }}>
            <PaymentSummary items={data.items} vatRate={data.vatRate} brand={brand} compact={compact} />
          </div>

          {/* מה כלול — שמות, תיאורים והערות; בלי מחירים */}
          <div style={{ padding: `${compact ? 22 : 28}px ${pad}px 4px` }}>
            <SectionLabel brand={brand}>מה כלול</SectionLabel>
            {priced.length === 0 && included.length === 0 && (
              <div style={{ color: brand.muted, fontSize: 13.5, marginTop: 8 }}>טרם נוספו שירותים להצעה.</div>
            )}
            <div style={{ marginTop: 6 }}>
              {[...priced, ...included].map((item, i) => (
                <div key={item.id} style={{ display: 'flex', gap: 10, padding: '11px 0', borderTop: i ? `1px solid ${brand.border}` : 'none' }}>
                  <span aria-hidden style={{ color: brand.accent, fontWeight: 700, lineHeight: 1.5 }}>✓</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: compact ? 14 : 15, fontWeight: 600, lineHeight: 1.5 }}>{itemDisplayName(item)}</div>
                    {item.category === 'included' && (
                      <div style={{ fontSize: 12, fontWeight: 600, color: GREEN, lineHeight: 1.5 }}>ללא תוספת תשלום</div>
                    )}
                    {item.description && <div style={{ fontSize: 12.5, color: brand.muted, lineHeight: 1.55 }}>{item.description}</div>}
                    {item.clientNote && <div style={{ fontSize: 12.5, color: brand.accent, marginTop: 3, lineHeight: 1.55 }}>{item.clientNote}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {data.notesForClient?.trim() && (
            <div style={{ padding: `${compact ? 14 : 18}px ${pad}px 0` }}>
              <SectionLabel brand={brand}>הערה אישית</SectionLabel>
              <div style={{ ...bodyText, marginTop: 8, whiteSpace: 'pre-line' }}>{data.notesForClient}</div>
            </div>
          )}

          {/* מחירון "אם וכאשר" — תמיד מקופל: עצם קיום השורה הוא השקיפות, בלי
              קיר מחירים שלא ביקשו ליד רגע ההחלטה. */}
          {(data.futureServices?.length ?? 0) > 0 && (
            <FutureServices services={data.futureServices!} brand={brand} compact={compact} pad={pad} />
          )}

          {/* צעדים הבאים */}
          <div style={{ padding: `${compact ? 20 : 26}px ${pad}px ${compact ? 22 : 28}px` }}>
            <SectionLabel brand={brand}>מה קורה אחרי האישור</SectionLabel>
            <ol style={{ margin: '10px 0 0', paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.5, color: brand.ink, lineHeight: 1.6 }}>
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
            <div style={{ fontSize: 13, color: brand.muted, marginTop: 12, lineHeight: 1.6 }}>
              לכל שאלה אפשר לפנות אליי ישירות בטלפון או בוואטסאפ.
            </div>
          </div>

          {/* אישור + חתימה */}
          <div style={{ padding: pad, background: brand.ink }}>
            <div style={{ color: '#fff', fontSize: compact ? 16 : 19, fontWeight: 600, marginBottom: 4 }}>לאישור ההצעה</div>
            <div style={{ color: 'rgba(255,255,255,.68)', fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
              {expiryLabel ? `ההצעה בתוקף עד ${expiryLabel}.` : 'חתימה כאן, ואתחיל בעבודה.'}
            </div>

            {!isApproved && !isDead && (
              <div style={{ background: '#fff', borderRadius: brand.radius + 2, padding: compact ? 14 : 18, marginBottom: 14, textAlign: 'start' }}>
                <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                  שם מלא של החותם
                  <input
                    value={signerName}
                    onChange={e => setSignerName(e.target.value)}
                    placeholder={data.recipientName}
                    style={{ display: 'block', width: '100%', marginTop: 4, padding: '10px 11px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 16, fontFamily: 'inherit', boxSizing: 'border-box' }}
                  />
                </label>
                <SignaturePad value={signature} onChange={setSignature} height={compact ? 110 : 140} />
                <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 10, lineHeight: 1.6 }}>
                  {year && <>{serviceYearClause(year)}<br /></>}
                  החתימה מהווה אישור להצעה ולתנאיה כפי שמפורטים בעמוד זה.
                </div>
              </div>
            )}

            {/* הצעד הבא קורה מעצמו: המסך מודיע שאושר ומעביר את הלקוח להשלמת
                הפרטים. הקישור נשאר גלוי כרשת ביטחון — דפדפן שחוסם ניווט אוטומטי,
                או לקוח שחזר לעמוד מאוחר יותר. המייל נשלח במקביל, לתיעוד. */}
            {isApproved && nextStepLink && (
              <div style={{ background: '#fff', borderRadius: brand.radius + 2, padding: compact ? 14 : 18, marginBottom: 14, textAlign: 'start' }}>
                <div style={{ fontSize: compact ? 14.5 : 15.5, fontWeight: 600, color: '#1f2937', marginBottom: 5 }}>
                  {nextStepAuto ? 'ההצעה אושרה - מעביר אותך להשלמת הפרטים' : 'נשאר צעד אחד - פרטי הזיהוי'}
                </div>
                <div style={{ fontSize: 12.5, color: '#6b7280', lineHeight: 1.65, marginBottom: 12 }}>
                  {nextStepAuto
                    ? 'עוד רגע ייפתח מסך קצר להשלמת פרטי הזיהוי. לוקח פחות מדקה.'
                    : 'נשאר להשלים מסך קצר של פרטי זיהוי - פחות מדקה. שלחתי לך את הקישור גם במייל.'}
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
            {approveError && (
              <div role="alert" style={{ marginTop: 10, padding: '10px 12px', borderRadius: brand.radius, background: 'rgba(220,38,38,.16)', border: '1px solid rgba(248,113,113,.5)', color: '#fecaca', fontSize: 13, lineHeight: 1.6, textAlign: 'center' }}>
                {approveError}
              </div>
            )}
            {onDownloadPdf && (
              <button onClick={onDownloadPdf} style={{ width: '100%', marginTop: 10, padding: '11px', borderRadius: brand.buttonStyle === 'pill' ? 999 : brand.radius, border: '1px solid rgba(255,255,255,.28)', background: 'transparent', color: '#fff', fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}>
                הורדת ההצעה כ־PDF
              </button>
            )}
            {!interactive && (
              <div style={{ marginTop: 12, textAlign: 'center', color: 'rgba(255,255,255,.5)', fontSize: 11.5 }}>תצוגה מקדימה - כך הלקוח יראה את עמוד האישור</div>
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

// "מה ומתי משלמים" — הסכום החודשי, החד־פעמי ומה שנגבה מאוחר, כל אחד בשורה
// אחת וכולל מע"מ; ההנחה בשורה ירוקה אחת; הפירוט המלא נפתח לפי בקשה.
function PaymentSummary({ items, vatRate, brand, compact }: {
  items: QuotationItem[]; vatRate: number; brand: QuotationBrand; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rows = paymentSchedule(items, vatRate);
  const savings = quotationSavings(items, vatRate);
  const savingsTitle = savingsHeadline(savings, formatILS);
  const priced = items.filter(i => i.category !== 'included');
  const anyVat = priced.some(i => i.vatFlag);
  if (priced.length === 0) return null;

  const rowPad = compact ? '12px 14px' : '14px 18px';
  return (
    <div style={{ border: `1px solid ${brand.border}`, borderRadius: brand.radius + 2, overflow: 'hidden', background: brand.cardBg }}>
      <div style={{ padding: compact ? '10px 14px' : '11px 18px', fontSize: 12, fontWeight: 600, color: brand.muted, borderBottom: `1px solid ${brand.border}`, background: tint(brand.pageBg) }}>
        מה ומתי משלמים
      </div>
      {rows.map((r, i) => (
        <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: rowPad, borderTop: i ? `1px solid ${brand.border}` : 'none' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: compact ? 14.5 : 15.5, fontWeight: 600 }}>{r.label}</div>
            {r.sub && <div style={{ fontSize: 12, color: brand.muted, marginTop: 1 }}>{r.sub}</div>}
            {r.changesTo && <div style={{ fontSize: 12, color: brand.ink, marginTop: 2 }}>{r.changesTo.from}: {formatILS(Math.round(r.changesTo.amount))} לחודש</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, whiteSpace: 'nowrap' }}>
            {r.regular != null && (
              <s style={{ fontSize: 13, color: brand.muted, fontVariantNumeric: 'tabular-nums' }}>{formatILS(Math.round(r.regular))}</s>
            )}
            <span style={{ fontSize: compact ? 21 : 24, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em', color: r.deferred ? brand.muted : brand.ink }}>
              {formatILS(Math.round(r.amount))}
            </span>
          </div>
        </div>
      ))}
      {/* ‼ כל הנחה בשורה משלה (גיא, 20.10.2026): "קיבלת הנחה בסך הכול" לא אמר
          על מה, ושירות שניתן ללא עלות נעלם מהעמוד. הסכום הכולל הוא הכותרת. */}
      {savingsTitle && (
        <div style={{ padding: compact ? '11px 14px' : '13px 18px', background: GREEN_BG, color: GREEN, borderTop: `1px solid ${brand.border}` }}>
          <div style={{ fontSize: compact ? 14.5 : 15.5, fontWeight: 700 }}>{savingsTitle}</div>
          {savings.lines.length > 1 && (
            <div style={{ marginTop: 6 }}>
              {savings.lines.map(l => {
                const v = savingsLineValue(l, formatILS);
                return (
                  <div key={l.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '2px 0', fontSize: 13 }}>
                    <span>{l.name}</span>
                    <span style={{ whiteSpace: 'nowrap', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {v.regular && <s style={{ fontWeight: 400, opacity: .75, marginInlineEnd: 6 }}>{v.regular}</s>}
                      {v.text}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, minHeight: 44, padding: compact ? '8px 14px' : '8px 18px', background: 'transparent', border: 'none', borderTop: `1px solid ${brand.border}`, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'start' }}
      >
        <span style={{ fontSize: 12, color: brand.muted }}>{anyVat ? 'כל הסכומים כוללים מע״מ' : ''}</span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: brand.accent }}>{open ? 'הסתרת הפירוט ▲' : 'איך חושב ▼'}</span>
      </button>
      {open && (
        <div style={{ padding: compact ? '4px 14px 12px' : '4px 18px 14px', borderTop: `1px solid ${brand.border}`, background: tint(brand.cardBg) }}>
          {priced.map((item, i) => <BreakdownRow key={item.id} item={item} vatRate={vatRate} brand={brand} first={i === 0} />)}
          {anyVat && (
            <div style={{ fontSize: 11.5, color: brand.muted, marginTop: 10 }}>
              הסכומים בפירוט לפני מע״מ. מע״מ {vatRate}% מתווסף אליהם.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// שורת שירות בפירוט: המחיר בשורה, ההנחה עליו, ובשורת יתרה — הדרך מהמחיר
// המלא לסכום שנגבה במועד. זה הנוסח שגיא מקריא ללקוח בטלפון.
function BreakdownRow({ item, vatRate, brand, first }: { item: QuotationItem; vatRate: number; brand: QuotationBrand; first: boolean }) {
  const final = itemFinalPrice(item);
  const original = itemOriginalPrice(item);
  const deferred = itemDeferred(item, vatRate);
  const spread = item.category === 'monthly' && item.priceBasis === 'annual' ? monthlyPlan(item) : null;
  // ‼ "במקום 120" ליד 100 נקרא כהנחה של 20 ₪, בזמן שההנחה ניתנה על השנה —
  // בשורה שתומחרה שנתית מציגים את העוגן השנתי. בשורת יתרה הפירוט אומר זאת במלואו.
  const annual = !deferred && original - final >= 1 ? itemAnnualAnchor(item) : null;
  const discounted = !deferred && original - final >= 1;
  const yearly = discounted && annual && annual.list - annual.value >= 1 ? annual : null;
  const free = discounted && final < 0.5;
  const was = yearly
    ? `${formatILS(Math.round(yearly.value))} לשנה במקום ${formatILS(Math.round(yearly.list))}`
    : discounted && !free
      ? `הנחה ${formatILS(Math.round(original - final))}${item.category === 'monthly' ? ' לחודש' : ''}`
      : null;
  // התדירות כבר כתובה ליד המחיר; כאן רק מה שהיא לא אומרת
  const meta = [
    spread ? `${spread.installments} תשלומים` : '',
    item.billingType === 'per_unit' && item.quantity > 1 ? `${item.quantity} × ${item.unitLabel || 'יחידה'}` : '',
    item.vatFlag ? '' : 'ללא מע״מ',
  ].filter(Boolean).join(' · ');
  return (
    <div style={{ padding: '10px 0', borderTop: first ? 'none' : `1px dashed ${brand.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: brand.ink }}>{itemDisplayName(item)}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: free ? GREEN : brand.ink, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {discounted && !yearly && (
            <s style={{ fontWeight: 400, color: brand.muted, marginInlineEnd: 6 }}>{formatILS(Math.round(original))}</s>
          )}
          {free ? 'ללא עלות' : `${formatILS(Math.round(final))} ${CATEGORY_PRICE_SUFFIX[item.category]}`}
        </span>
      </div>
      {meta && <div style={{ fontSize: 11.5, color: brand.muted, marginTop: 1 }}>{meta}</div>}
      {was && <div style={{ fontSize: 12, color: GREEN, marginTop: 2 }}>{was}</div>}
      {deferred && (
        <div style={{ marginTop: 6 }}>
          {deferredDetailLines(deferred, item.name).map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '1px 0', fontSize: 12.5, fontVariantNumeric: 'tabular-nums', fontWeight: r.strong ? 600 : 400, color: r.strong ? brand.ink : r.negative ? GREEN : brand.muted }}>
              <span>{r.label}</span>
              <span>{r.negative ? '−' : ''}{formatILS(Math.round(r.amount))}</span>
            </div>
          ))}
        </div>
      )}
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
  const [open, setOpen] = useState(false);
  return (
    <div style={{ padding: `${compact ? 16 : 20}px ${pad}px 0` }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'start',
          background: 'transparent', cursor: 'pointer', minHeight: 44,
          border: `1px solid ${brand.border}`, borderRadius: brand.radius,
          padding: compact ? '10px 14px' : '12px 16px', fontFamily: 'inherit', color: brand.ink,
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: compact ? 13.5 : 14, fontWeight: 600 }}>
            שירותים נוספים לפי צורך · {services.length}
          </span>
          <span style={{ display: 'block', fontSize: 11.5, color: brand.muted, marginTop: 2, lineHeight: 1.5 }}>
            אינם כלולים בהצעה. המחירים ידועים מראש, למקרה שתצטרך.
          </span>
        </span>
        <span style={{ fontSize: 11, color: brand.muted }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ marginTop: 8, borderRadius: brand.radius, border: `1px solid ${brand.border}`, overflow: 'hidden' }}>
          {services.map((fs, i) => (
            <div key={fs.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 10, rowGap: 2, padding: compact ? '10px 12px' : '11px 14px', borderTop: i ? `1px solid ${brand.border}` : 'none' }}>
              <div style={{ flex: '1 1 180px', minWidth: 0 }}>
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
      )}
    </div>
  );
}

function SectionLabel({ children, brand }: { children: React.ReactNode; brand: QuotationBrand }) {
  return <div style={{ fontSize: 12, fontWeight: 600, color: brand.muted }}>{children}</div>;
}

// גוון שקוף של צבע המותג
function alpha(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// גוון עדין כהה יותר מהרקע — לכותרת הסיכום ולפירוט
function tint(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.max(0, ((n >> 16) & 255) - 6), g = Math.max(0, ((n >> 8) & 255) - 6), b = Math.max(0, (n & 255) - 6);
  return `rgb(${r},${g},${b})`;
}
