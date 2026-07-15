// עמוד ההצעה כפי שהלקוח רואה אותו — קומפוננטת React משותפת לתצוגה המקדימה
// (בבונה) ולעמוד הציבורי (שלב 3). Mobile-first, מיתוג המשרד, אישור בלבד.
// אין דחייה/בקשת שינויים — לפי החלטת גיא, שינוי = ביטול והוצאת הצעה חדשה.

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
  compact?: boolean;              // תצוגת מובייל — ריווח וגדלים מוקטנים
  interactive?: boolean;         // בעמוד הציבורי: כפתור אישור פעיל
  status?: string;               // draft/sent/... — לשליטה בכפתור
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
  const pad = compact ? 20 : 40;
  const maxW = compact ? '100%' : 620;

  const priced = data.items.filter(i => i.category !== 'included');
  const included = data.items.filter(i => i.category === 'included');

  const isApproved = status === 'approved';
  const isDead = status === 'cancelled' || status === 'expired';

  const expiryDate = data.expiresAt ? new Date(data.expiresAt) : null;
  const expiryLabel = expiryDate
    ? expiryDate.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div style={{
      background: '#F4F3EF', minHeight: '100%', padding: compact ? 12 : 28,
      fontFamily: `'${brand.font}', system-ui, sans-serif`, color: '#1a1a1a', direction: 'rtl',
    }}>
      <div style={{ maxWidth: maxW, margin: '0 auto' }}>

        {/* כרטיס ראשי */}
        <div style={{ background: '#fff', borderRadius: 18, overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,.08)' }}>

          {/* header ממותג */}
          <div style={{ padding: `${pad}px ${pad}px ${pad - 8}px`, borderBottom: '1px solid #EFEEE9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: compact ? 20 : 30 }}>
              {brand.logoUrl
                ? <img src={brand.logoUrl} alt="" style={{ maxHeight: compact ? 30 : 38, maxWidth: 160, objectFit: 'contain' }} />
                : <>
                    <div style={{ width: compact ? 34 : 40, height: compact ? 34 : 40, borderRadius: '50%', border: `1.5px solid ${brand.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: compact ? 13 : 15, fontWeight: 600, color: brand.ink }}>{brand.monogram}</div>
                    <span style={{ fontSize: compact ? 15 : 17, fontWeight: 600, color: brand.ink }}>{brand.firmName}</span>
                  </>}
              <span style={{ marginInlineStart: 'auto', fontSize: 11.5, color: '#9a988f', fontVariantNumeric: 'tabular-nums' }}>
                הצעה מס׳ {data.quotationNumber}
              </span>
            </div>

            <div style={{ fontSize: compact ? 22 : 28, fontWeight: 700, letterSpacing: '-.02em', marginBottom: 6 }}>
              {data.recipientName ? `${greetingName(data.recipientName)}, נעים להכיר` : 'הצעת מחיר'}
            </div>
            <div style={{ fontSize: compact ? 14 : 15.5, color: '#6b6a63', lineHeight: 1.6 }}>
              הכנו עבורך הצעה אישית לליווי חשבונאי ומקצועי{data.businessName ? ` עבור ${data.businessName}` : ''}.
              כל הפרטים כאן למטה — שקוף, בלי אותיות קטנות.
            </div>

            {isApproved && (
              <div style={{ marginTop: 16, background: '#ecfdf5', color: '#065f46', borderRadius: 10, padding: '10px 14px', fontSize: 13.5, fontWeight: 600 }}>
                ✓ ההצעה אושרה. תודה! ניצור קשר להמשך התהליך.
              </div>
            )}
            {isDead && (
              <div style={{ marginTop: 16, background: '#f3f4f6', color: '#6b7280', borderRadius: 10, padding: '10px 14px', fontSize: 13.5, fontWeight: 600 }}>
                {status === 'expired' ? 'תוקף ההצעה פג. ניתן לפנות אלינו לחידוש.' : 'ההצעה בוטלה. לפרטים נוספים ניתן לפנות אלינו.'}
              </div>
            )}
          </div>

          {/* שירותים מתומחרים — כרטיסים */}
          <div style={{ padding: `${pad - 10}px ${pad}px` }}>
            <SectionLabel>השירותים שלנו</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {priced.length === 0 && (
                <div style={{ color: '#9a988f', fontSize: 13.5 }}>טרם נוספו שירותים להצעה.</div>
              )}
              {priced.map(item => (
                <ServiceCard key={item.id} item={item} vatRate={data.vatRate} accent={brand.accent} compact={compact} />
              ))}
            </div>

            {included.length > 0 && (
              <>
                <div style={{ height: 18 }} />
                <SectionLabel>כלול במחיר — ללא תוספת</SectionLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  {included.map(item => (
                    <div key={item.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#F4F3EF', borderRadius: 20, padding: '7px 13px', fontSize: 12.5, color: '#4b4a44', fontWeight: 500 }}>
                      <span style={{ color: brand.accent, fontWeight: 700 }}>✓</span>{item.name}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* תמחור — סיכומים נפרדים */}
          <div style={{ padding: `${pad - 14}px ${pad}px`, background: '#FAFAF8', borderTop: '1px solid #EFEEE9', borderBottom: '1px solid #EFEEE9' }}>
            <SectionLabel>סיכום התמחור</SectionLabel>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {totals.monthly.withVat > 0 && (
                <PriceRow label="חודשי" value={totals.monthly.withVat} vat={totals.monthly.vat} suffix="לחודש" accent={brand.accent} />
              )}
              {totals.annual.withVat > 0 && (
                <PriceRow label="שנתי" value={totals.annual.withVat} vat={totals.annual.vat} suffix="לשנה" accent={brand.accent} />
              )}
              {totals.oneTime.withVat > 0 && (
                <PriceRow label="חד־פעמי" value={totals.oneTime.withVat} vat={totals.oneTime.vat} suffix="" accent={brand.accent} />
              )}
              {priced.length === 0 && <div style={{ color: '#9a988f', fontSize: 13.5 }}>—</div>}
            </div>
            <div style={{ marginTop: 12, fontSize: 11.5, color: '#9a988f' }}>
              המחירים כוללים מע״מ ({data.vatRate}%). חיובים חודשיים, שנתיים וחד־פעמיים מוצגים בנפרד ואינם מאוחדים.
            </div>
          </div>

          {/* הערות הרו"ח */}
          {data.notesForClient?.trim() && (
            <div style={{ padding: `${pad - 12}px ${pad}px` }}>
              <SectionLabel>הערה אישית</SectionLabel>
              <div style={{ marginTop: 10, fontSize: 14, color: '#4b4a44', lineHeight: 1.75, whiteSpace: 'pre-line' }}>
                {data.notesForClient}
              </div>
            </div>
          )}

          {/* צעדים הבאים */}
          <div style={{ padding: `${pad - 12}px ${pad}px`, borderTop: '1px solid #EFEEE9' }}>
            <SectionLabel>מה קורה אחרי האישור</SectionLabel>
            <ol style={{ marginTop: 12, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13.5, color: '#4b4a44', lineHeight: 1.6 }}>
              <li>נפתח עבורך את התיק ונתחיל בהליך ייצוג מול הרשויות.</li>
              <li>נבקש כמה מסמכי זיהוי בסיסיים — הכל דיגיטלי, בלי ניירת.</li>
              <li>משם אנחנו מטפלים בהכול. נהיה זמינים לכל שאלה.</li>
            </ol>
          </div>

          {/* אישור */}
          <div style={{ padding: pad, background: brand.ink }}>
            <div style={{ color: '#fff', fontSize: compact ? 16 : 18, fontWeight: 600, marginBottom: 4 }}>
              מוכנים להתחיל?
            </div>
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 13, marginBottom: 16 }}>
              {expiryLabel ? `ההצעה בתוקף עד ${expiryLabel}.` : 'לאישור ההצעה — לחיצה אחת.'}
            </div>
            <button
              onClick={interactive && !isApproved && !isDead ? onApprove : undefined}
              disabled={!interactive || isApproved || isDead || approving}
              style={{
                width: '100%', padding: compact ? '13px' : '15px', borderRadius: 11, border: 'none',
                background: isApproved ? '#10b981' : brand.accent, color: '#fff',
                fontSize: compact ? 15 : 16, fontWeight: 700, fontFamily: 'inherit',
                cursor: interactive && !isApproved && !isDead && !approving ? 'pointer' : 'default',
                opacity: isDead ? 0.5 : 1,
              }}
            >
              {isApproved ? '✓ ההצעה אושרה' : approving ? 'מאשר…' : 'אישור ההצעה'}
            </button>
            {onDownloadPdf && (
              <button
                onClick={onDownloadPdf}
                style={{ width: '100%', marginTop: 10, padding: '11px', borderRadius: 11, border: '1px solid rgba(255,255,255,.25)', background: 'transparent', color: '#fff', fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}
              >
                הורדת ההצעה כ־PDF
              </button>
            )}
            {!interactive && (
              <div style={{ marginTop: 12, textAlign: 'center', color: 'rgba(255,255,255,.55)', fontSize: 11.5 }}>
                תצוגה מקדימה — כך הלקוח יראה את עמוד האישור
              </div>
            )}
          </div>
        </div>

        {/* footer — פרטי קשר */}
        <div style={{ textAlign: 'center', padding: '18px 12px', fontSize: 12, color: '#9a988f', lineHeight: 1.7 }}>
          <div style={{ fontWeight: 600, color: '#6b6a63' }}>{brand.firmName}</div>
          <div>{[brand.phone, brand.email].filter(Boolean).join(' · ')}</div>
          {brand.address && <div>{brand.address}</div>}
        </div>
      </div>
    </div>
  );
}

function greetingName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: '#9a988f' }}>
      {children}
    </div>
  );
}

function ServiceCard({ item, vatRate, accent, compact }: { item: QuotationItem; vatRate: number; accent: string; compact?: boolean }) {
  const finalBeforeVat = itemFinalPrice(item);
  const withVat = item.vatFlag ? finalBeforeVat * (1 + vatRate / 100) : finalBeforeVat;
  const perUnit = item.billingType === 'per_unit';
  return (
    <div style={{ border: '1px solid #EFEEE9', borderRadius: 12, padding: compact ? 14 : 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: compact ? 14.5 : 15.5, fontWeight: 600, marginBottom: 3 }}>{item.name}</div>
        {item.description && (
          <div style={{ fontSize: 12.5, color: '#8a897f', lineHeight: 1.55 }}>{item.description}</div>
        )}
        {item.clientNote && (
          <div style={{ fontSize: 12, color: accent, marginTop: 5 }}>{item.clientNote}</div>
        )}
        <div style={{ fontSize: 11, color: '#b0aea4', marginTop: 6 }}>
          {SERVICE_CATEGORY_LABELS[item.category]} · {CATEGORY_BLURB[item.category]}
          {perUnit && item.quantity > 1 ? ` · ${item.quantity} × ${item.unitLabel || 'יחידה'}` : ''}
        </div>
      </div>
      <div style={{ textAlign: 'end', whiteSpace: 'nowrap' }}>
        <div style={{ fontSize: compact ? 15 : 16.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatILS(Math.round(withVat))}</div>
        <div style={{ fontSize: 10.5, color: '#b0aea4' }}>כולל מע״מ</div>
      </div>
    </div>
  );
}

function PriceRow({ label, value, vat, suffix, accent }: { label: string; value: number; vat: number; suffix: string; accent: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '7px 0' }}>
      <div style={{ fontSize: 14, color: '#4b4a44', fontWeight: 500 }}>
        {label}
        <span style={{ fontSize: 11, color: '#b0aea4', marginInlineStart: 6 }}>(כולל מע״מ {formatILS(Math.round(vat))})</span>
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color: accent, fontVariantNumeric: 'tabular-nums' }}>
        {formatILS(Math.round(value))}
        {suffix && <span style={{ fontSize: 11.5, color: '#9a988f', fontWeight: 500, marginInlineStart: 3 }}>{suffix}</span>}
      </div>
    </div>
  );
}
