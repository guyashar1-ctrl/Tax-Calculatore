// תצוגה מקדימה של בקשת הייצוג (עמוד ההזדהות) בסטודיו העיצוב — משקפת את אותם
// טוקני עיצוב של עמוד ההצעה, כדי שהרו"ח יראה איך שני העמודים ייראו יחד.

import type { QuotationBrand } from './quotationBranding';

export default function RepresentationPreview({ brand, compact }: { brand: QuotationBrand; compact?: boolean }) {
  const pad = compact ? 22 : 40;
  const font = `'${brand.font}', system-ui, sans-serif`;
  const cardRadius = brand.radius + 4;
  const btnRadius = brand.buttonStyle === 'pill' ? 999 : brand.radius;
  const btnStyle: React.CSSProperties = brand.buttonStyle === 'outline'
    ? { background: 'transparent', color: brand.ink, border: `1.5px solid ${brand.ink}` }
    : { background: brand.accent, color: '#fff', border: 'none' };

  const ls = brand.logoScale;
  const logo = brand.logoUrl
    ? <img src={brand.logoUrl} alt="" style={{ maxHeight: (compact ? 30 : 38) * ls, maxWidth: 160 * ls, objectFit: 'contain' }} />
    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 36, height: 36, borderRadius: '50%', border: `1.5px solid ${brand.ink}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: brand.ink }}>{brand.monogram}</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: brand.ink }}>{brand.firmName}</span>
      </span>;

  const centered = brand.headerStyle !== 'minimal';

  return (
    <div style={{ background: brand.pageBg, minHeight: '100%', padding: compact ? 16 : 40, fontFamily: font, direction: 'rtl' }}>
      <div style={{ maxWidth: compact ? '100%' : 460, margin: '0 auto', background: brand.cardBg, border: `1px solid ${brand.border}`, borderRadius: cardRadius, overflow: 'hidden', boxShadow: '0 12px 44px rgba(0,0,0,.09)' }}>
        {brand.headerStyle === 'band' ? (
          <div style={{ background: brand.ink, padding: `${compact ? 16 : 20}px ${pad}px` }}>
            {/* ראה הערה זהה ב-QuotationWebView */}
            {brand.logoOnDarkUrl || brand.logoUrl
              ? <img src={brand.logoOnDarkUrl || brand.logoUrl} alt="" style={{ maxHeight: 34 * ls, maxWidth: 160 * ls, objectFit: 'contain', filter: brand.logoOnDarkUrl ? undefined : 'brightness(0) invert(1)' }} />
              : <span style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>{brand.firmName}</span>}
          </div>
        ) : (
          <div style={{ padding: `${pad}px ${pad}px 0`, textAlign: centered ? 'center' : 'start' }}>{logo}</div>
        )}

        <div style={{ padding: `${compact ? 18 : 24}px ${pad}px ${pad}px`, textAlign: centered ? 'center' : 'start' }}>
          <div style={{ height: 3, width: 44, background: brand.accent, borderRadius: 3, margin: centered ? '0 auto 16px' : '4px 0 16px' }} />
          <div style={{ fontSize: compact ? 21 : 25, fontWeight: 700, color: brand.ink, marginBottom: 8, letterSpacing: '-.02em' }}>נעים להכיר</div>
          <div style={{ fontSize: 14, color: brand.muted, lineHeight: 1.7, marginBottom: 22 }}>
            שמחים שבחרתם בנו. כדי שנתחיל לייצג אתכם מול רשויות המס, נשאר רק לאמת כמה פרטי זיהוי — פחות מדקה, מאובטח.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22, textAlign: 'start' }}>
            {['מספר תעודת זהות', 'תאריך הנפקת התעודה'].map(l => (
              <div key={l}>
                <div style={{ fontSize: 12, color: brand.muted, marginBottom: 4 }}>{l}</div>
                <div style={{ border: `1px solid ${brand.border}`, borderRadius: brand.radius, padding: '11px 13px', fontSize: 13, color: '#bbb', background: brand.cardBg }}>—</div>
              </div>
            ))}
          </div>

          <button disabled style={{ width: '100%', padding: compact ? '13px' : '15px', borderRadius: btnRadius, fontSize: compact ? 15 : 16, fontWeight: 700, fontFamily: 'inherit', cursor: 'default', ...btnStyle }}>
            המשך&nbsp;&nbsp;←
          </button>
          <div style={{ marginTop: 14, textAlign: 'center', fontSize: 11, color: brand.muted }}>מאובטח · פחות מדקה</div>
        </div>
      </div>
      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11.5, color: brand.muted }}>תצוגה מקדימה — כך הלקוח יראה את עמוד ההזדהות</div>
    </div>
  );
}
