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
          {/* סרגל השלבים — הטופס האמיתי מחולק לשלושה מסכים */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i === 0 ? brand.accent : brand.border }} />
            ))}
          </div>
          <div style={{ fontSize: 11, letterSpacing: '.08em', color: brand.muted, marginBottom: 8, textAlign: 'start' }}>
            שלב 1 מתוך 3 · הפרטים שלכם
          </div>
          <div style={{ fontSize: compact ? 21 : 25, fontWeight: 600, color: brand.ink, marginBottom: 8, letterSpacing: '-.02em' }}>נעים להכיר</div>
          <div style={{ fontSize: 14, color: brand.muted, lineHeight: 1.7, marginBottom: 18 }}>
            כדי ש{brand.firmName} יוכל לייצג אתכם מול רשויות המס, נאסוף כמה פרטים. לוקח כדקה.
          </div>

          {/* מפת התהליך — מוצגת ללקוח כדי שידע שיגיע אליו מייל נוסף */}
          <div style={{ background: brand.pageBg, borderRadius: brand.radius, padding: '12px 13px', marginBottom: 20, textAlign: 'start' }}>
            <div style={{ fontSize: 11, letterSpacing: '.06em', color: brand.muted, marginBottom: 9 }}>איך זה עובד</div>
            {[
              ['הפרטים שלכם', 'ממלאים כאן — וזהו'],
              ['רואה חשבון מגיש את הבקשה', 'אנחנו פותחים עבורכם בקשת ייצוג מול הרשויות'],
              ['נשאר רק לאשר את המייל', 'בימים הקרובים תקבלו מייל מרשות המסים. פותחים אותו, מאשרים את הייצוג — וסיימתם.'],
              ['הייצוג פעיל', 'מרגע האישור, אנחנו מטפלים עבורכם מול רשות המסים.'],
            ].map(([title, sub], i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', paddingBottom: i < 3 ? 8 : 0 }}>
                <div style={{
                  flex: '0 0 auto', width: 17, height: 17, borderRadius: '50%', marginTop: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 600,
                  background: i === 0 ? brand.ink : brand.border, color: i === 0 ? '#fff' : brand.muted,
                }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: i === 0 ? 700 : 500, color: i === 0 ? brand.ink : brand.muted }}>{title}</div>
                  <div style={{ fontSize: 11, color: brand.muted, lineHeight: 1.45 }}>{sub}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 10, textAlign: 'start' }}>
            {['שם פרטי', 'שם משפחה'].map(l => (
              <div key={l} style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: brand.muted, marginBottom: 4 }}>{l}</div>
                <div style={{ border: `1px solid ${brand.border}`, borderRadius: brand.radius, padding: '11px 13px', fontSize: 13, color: '#bbb', background: brand.cardBg }}>—</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22, textAlign: 'start' }}>
            {['תעודת זהות', 'תאריך לידה'].map(l => (
              <div key={l}>
                <div style={{ fontSize: 12, color: brand.muted, marginBottom: 4 }}>{l}</div>
                <div style={{ border: `1px solid ${brand.border}`, borderRadius: brand.radius, padding: '11px 13px', fontSize: 13, color: '#bbb', background: brand.cardBg }}>—</div>
              </div>
            ))}
          </div>

          <button disabled style={{ width: '100%', padding: compact ? '13px' : '15px', borderRadius: btnRadius, fontSize: compact ? 15 : 16, fontWeight: 600, fontFamily: 'inherit', cursor: 'default', ...btnStyle }}>
            המשך&nbsp;&nbsp;←
          </button>
          <div style={{ marginTop: 14, textAlign: 'center', fontSize: 11, color: brand.muted }}>מאובטח · פחות מדקה</div>
        </div>
      </div>
      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11.5, color: brand.muted }}>
        תצוגה מקדימה — המסך הראשון מתוך שלושה שהלקוח ממלא
      </div>
    </div>
  );
}
