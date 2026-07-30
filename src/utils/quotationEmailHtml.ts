// מחולל ה-HTML של מייל ההצעה — מקור יחיד לתצוגה המקדימה בסטודיו/בבונה ולשליחה,
// כדי שהמייל ייראה זהה למה שהוצג. RTL, table-based לתאימות Gmail/Outlook.
// כל הצבעים/פינות/כותרת/כפתור/פונט מגיעים מטוקני העיצוב (brand) — כך שהמייל
// משתנה במלואו יחד עם תבנית העיצוב שנבחרה בסטודיו.

import type { QuotationItem } from '../types/quotations';
import { calcTotals, formatILS, monthlyPlan, formatMonth, formatMonthRange } from './quotationCalc';
import type { QuotationBrand } from '../components/quotations/quotationBranding';

export interface QuotationEmailData {
  quotationNumber: string;
  recipientName: string;
  businessName?: string;
  items: QuotationItem[];
  vatRate: number;
  message?: string;
  quotationLink: string;
  expiresAt?: string;
}

export function buildQuotationEmailHtml(data: QuotationEmailData, brand: QuotationBrand): string {
  const totals = calcTotals(data.items, data.vatRate);
  const firstName = (data.recipientName || '').trim().split(/\s+/)[0] || '';
  const f = `'${brand.font}',Arial,Helvetica,sans-serif`;
  const rad = brand.radius;
  const btnRad = brand.buttonStyle === 'pill' ? 999 : Math.max(rad, 8);
  const cardTint = tint(brand.pageBg);

  // ── כותרת לפי סגנון ──
  // אותה בחירת לוגו כמו ב-designSystem: PNG למייל, גרסה בהירה לרצועה כהה,
  // ודילוג על SVG — תוכנות מייל אינן מציגות אותו.
  const emailSafe = (...c: (string | undefined)[]) => c.find(u => !!u && !/\.svg(\?|#|$)/i.test(u));
  const emailLogo = emailSafe(brand.emailLogoUrl, brand.logoUrl);
  // רצועה כהה: רק לוגו שיועד לרקע כהה. תוכנות מייל לא תומכות ב-filter:invert,
  // ולכן נפילה ללוגו הרגיל = לוגו כהה על רקע כהה (בלתי קריא). אין → שם בלבן.
  const darkLogo = emailSafe(brand.logoOnDarkUrl);
  const logoH = Math.round(40 * brand.logoScale);
  const logoHDark = Math.round(38 * brand.logoScale);
  const logoW = Math.round(180 * brand.logoScale);
  const brandMark = emailLogo
    ? `<img src="${esc(emailLogo)}" alt="${esc(brand.firmName)}" style="max-height:${logoH}px;max-width:${logoW}px;border:0;" />`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" dir="rtl"><tr>`
      + `<td style="width:38px;height:38px;border:1.5px solid ${brand.ink};border-radius:50%;text-align:center;vertical-align:middle;color:${brand.ink};font-size:15px;font-weight:600;">${esc(brand.monogram)}</td>`
      + `<td style="padding-right:10px;color:${brand.ink};font-size:17px;font-weight:600;">${esc(brand.firmName)}</td>`
      + `</tr></table>`;
  const brandMarkOnDark = darkLogo
    ? `<img src="${esc(darkLogo)}" alt="${esc(brand.firmName)}" style="max-height:${logoHDark}px;max-width:${logoW}px;border:0;" />`
    : `<span style="color:#ffffff;font-size:17px;font-weight:600;">${esc(brand.firmName)}</span>`;
  const numTag = `<span style="font-size:11.5px;color:${brand.muted};">הצעה מס׳ ${esc(data.quotationNumber)}</span>`;

  let header: string;
  if (brand.headerStyle === 'band') {
    header = `<tr><td style="background:${brand.ink};padding:22px 40px;">`
      + `<table role="presentation" width="100%"><tr><td>${brandMarkOnDark}</td>`
      + `<td align="left" style="font-size:11.5px;color:rgba(255,255,255,.65);">הצעה מס׳ ${esc(data.quotationNumber)}</td></tr></table></td></tr>`;
  } else if (brand.headerStyle === 'centered') {
    header = `<tr><td align="center" style="padding:30px 40px 6px;border-bottom:1px solid ${brand.border};">`
      + brandMark + `<div style="padding-top:8px;">${numTag}</div></td></tr>`;
  } else {
    header = `<tr><td style="padding:30px 40px 0;">`
      + `<table role="presentation" width="100%"><tr><td>${brandMark}</td><td align="left">${numTag}</td></tr></table></td></tr>`;
  }

  // ── כפתור CTA לפי סגנון ──
  const ctaInner = `<a href="${esc(data.quotationLink)}" style="display:block;padding:15px 20px;font-family:${f};font-size:16px;font-weight:700;text-decoration:none;text-align:center;border-radius:${btnRad}px;`;
  const cta = brand.buttonStyle === 'outline'
    ? `${ctaInner}color:${brand.accent};border:2px solid ${brand.accent};">צפייה ואישור ההצעה</a>`
    : `${ctaInner}color:#ffffff;background:${brand.accent};">צפייה ואישור ההצעה</a>`;

  // פריסת תשלומים חלקית מוזכרת כבר במייל — הלקוח לא אמור לגלות בעמוד ההצעה
  // שהמספר שראה במייל תקף רק לחמישה חודשים.
  const monthlyTerms = (() => {
    if (totals.monthly.withVat <= 0 || (!totals.hasPartialTerm && !totals.changesAfterPeriod)) return '';
    const first = data.items.filter(i => i.category === 'monthly').map(monthlyPlan)[0];
    const parts: string[] = [];
    // בלי סה"כ לתקופה — סכום מצטבר רק מגדיל את המספר בראש של הלקוח
    if (totals.hasPartialTerm && totals.installments) {
      const range = first ? formatMonthRange(first.startMonth, first.endMonth) : '';
      parts.push(`${totals.installments} תשלומים${range ? ` (${range})` : ''}`);
    }
    if (totals.changesAfterPeriod) {
      const from = first?.nextMonth ? `החל מ${formatMonth(first.nextMonth)}` : 'לאחר מכן';
      parts.push(`${from}: ${formatILS(Math.round(totals.monthlyOngoing.withVat))} לחודש`);
    }
    return parts.join(' · ');
  })();

  const summaryRows: string[] = [];
  if (totals.monthly.withVat > 0) summaryRows.push(priceBlock('חודשי', totals.monthly, 'לחודש', data.vatRate, brand, monthlyTerms));
  if (totals.annual.withVat > 0) summaryRows.push(priceBlock('שנתי', totals.annual, 'לשנה', data.vatRate, brand));
  if (totals.oneTime.withVat > 0) summaryRows.push(priceBlock('חד־פעמי', totals.oneTime, '', data.vatRate, brand));

  const messageBlock = data.message?.trim()
    ? `<tr><td style="padding:0 40px 8px;"><div style="background:${cardTint};border-radius:${rad}px;padding:16px 18px;font-family:${f};font-size:14px;color:${brand.ink};line-height:1.7;white-space:pre-line;">${esc(data.message)}</div></td></tr>`
    : '';

  const signatureBlock = brand.emailSignature?.trim()
    ? `<div style="font-family:${f};font-size:13px;color:${brand.muted};line-height:1.7;white-space:pre-line;">${esc(brand.emailSignature)}</div>`
    : `<div style="font-family:${f};font-size:13px;color:${brand.muted};">${esc(brand.firmName)}</div>`;

  const contactLine = [brand.phone, brand.email].filter((v): v is string => Boolean(v)).map(esc).join(' · ');
  const expiryLabel = data.expiresAt
    ? new Date(data.expiresAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return `<!DOCTYPE html>
<html dir="rtl" lang="he"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:${brand.pageBg};font-family:${f};color:${brand.ink};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${brand.pageBg};padding:24px 0;"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${brand.cardBg};border:1px solid ${brand.border};border-radius:${rad + 4}px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.06);">

      ${header}

      <tr><td style="padding:${brand.headerStyle === 'minimal' ? '22' : '26'}px 40px 4px;">
        <div style="font-size:24px;font-weight:700;letter-spacing:-.02em;color:${brand.ink};">${firstName ? esc(firstName) + ', ' : ''}הצעת מחיר עבורך</div>
        <div style="font-size:15px;color:${brand.muted};line-height:1.6;padding-top:6px;">
          הכנו עבורך הצעה אישית לליווי חשבונאי${data.businessName ? ' עבור ' + esc(data.businessName) : ''}. הנה התמצית — לפרטים המלאים ולאישור, המשך לעמוד ההצעה.
        </div>
      </td></tr>

      <tr><td style="padding:20px 40px 4px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${brand.border};border-radius:${rad}px;background:${cardTint};">
          <tr><td style="padding:14px 18px 6px;font-size:11px;font-weight:700;letter-spacing:.08em;color:${brand.muted};">סיכום ההצעה · מס׳ ${esc(data.quotationNumber)}</td></tr>
          ${summaryRows.join('') || `<tr><td style="padding:6px 18px 16px;color:${brand.muted};font-size:14px;">פרטי התמחור בעמוד ההצעה</td></tr>`}
          <tr><td style="padding:4px 18px 14px;font-size:11px;color:${brand.muted};">המחירים כוללים מע״מ (${data.vatRate}%). חיוב חודשי, שנתי וחד־פעמי מוצגים בנפרד.</td></tr>
        </table>
      </td></tr>

      ${messageBlock}

      <tr><td style="padding:20px 40px 8px;">
        ${cta}
        <div style="text-align:center;padding-top:10px;font-size:12px;color:${brand.muted};">
          ${expiryLabel ? 'ההצעה בתוקף עד ' + esc(expiryLabel) + '.' : 'לצפייה בפרטים המלאים ולאישור — לחיצה אחת.'}
        </div>
        <div style="text-align:center;padding-top:6px;font-size:11px;color:${brand.muted};">
          או העתק קישור זה: <span dir="ltr">${esc(data.quotationLink)}</span>
        </div>
      </td></tr>

      <tr><td style="padding:20px 40px 32px;border-top:1px solid ${brand.border};">
        ${signatureBlock}
        ${contactLine ? `<div style="font-size:12px;color:${brand.muted};padding-top:8px;">${contactLine}</div>` : ''}
      </td></tr>

    </table>
  </td></tr></table>
</body></html>`;
}

// עוגן התנהגותי זהה לעמוד ההצעה: מחיר מלא (מחוק) ← הנחה (שורה ירוקה) ←
// מחיר אחרי הנחה ← מע"מ ← שורת "סה״כ לתשלום" גדולה על רקע צבע המותג.
// הכול table-based עם צבעי רקע ישירים — לתאימות Gmail/Outlook.
function priceBlock(
  label: string,
  t: { fullBeforeVat: number; discount: number; beforeVat: number; vat: number; withVat: number },
  suffix: string,
  vatRate: number,
  brand: QuotationBrand,
  terms?: string,
): string {
  const hasDiscount = t.discount >= 1;
  const pct = hasDiscount ? Math.round((t.discount / t.fullBeforeVat) * 100) : 0;
  // dir כמאפיין HTML (לא רק CSS) — ג'ימייל מכבד אותו גם כשהוא מקצץ סגנונות
  const row = (l: string, v: string, lStyle = '', vStyle = '') => `<tr>
      <td dir="rtl" align="right" style="font-size:12.5px;color:${brand.muted};padding:3px 0;text-align:right;${lStyle}">${l}</td>
      <td dir="ltr" align="left" style="font-size:13px;color:${brand.muted};padding:3px 0;text-align:left;${vStyle}">${v}</td>
    </tr>`;
  // שורות "קופסה" (הנחה / סה"כ) — td אחד ברוחב מלא עם טבלה פנימית, כדי שלא
  // ייראו כשתי קופסאות מנותקות בג'ימייל (שני td עם פינות עגולות לא מתחברים).
  const boxRow = (inner: string, boxStyle: string, padTop = '3px') => `<tr><td colspan="2" style="padding-top:${padTop};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" style="${boxStyle}"><tr>${inner}</tr></table>
    </td></tr>`;
  const discountRows = hasDiscount
    ? row('מחיר מלא', formatILS(Math.round(t.fullBeforeVat)),
        '', 'text-decoration:line-through;font-size:14px;')
      + boxRow(
        `<td dir="rtl" align="right" style="padding:6px 10px;font-size:13px;font-weight:700;color:#047857;text-align:right;">🎁 הנחה ${pct}%</td>
         <td dir="ltr" align="left" style="padding:6px 10px;font-size:14px;font-weight:800;color:#047857;text-align:left;white-space:nowrap;">−${formatILS(Math.round(t.discount))}</td>`,
        'background:#e6f7f0;border-radius:8px;')
      + row('מחיר אחרי הנחה', formatILS(Math.round(t.beforeVat)),
        `font-weight:600;color:${brand.ink};`, `font-weight:700;color:${brand.ink};font-size:14px;`)
    : row('מחיר', formatILS(Math.round(t.beforeVat)), '', `font-weight:600;color:${brand.ink};`);
  const accentBg = mixWithWhite(brand.accent, 0.9);
  return `<tr><td dir="rtl" style="padding:10px 18px 12px;">
    <div dir="rtl" style="font-size:11.5px;font-weight:700;letter-spacing:.06em;color:${brand.muted};padding-bottom:4px;text-align:right;">${label}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" style="border-top:1px solid ${brand.border};">
      ${discountRows}
      ${row(`+ מע״מ (${vatRate}%)`, formatILS(Math.round(t.vat)))}
      ${boxRow(
        `<td dir="rtl" align="right" style="padding:10px 14px;text-align:right;">
           <div style="font-size:14px;font-weight:700;color:${brand.ink};text-align:right;">סה״כ לתשלום${suffix ? ` ${suffix}` : ''}</div>
           <div style="font-size:10.5px;color:${brand.muted};text-align:right;">כולל מע״מ</div>
         </td>
         <td dir="ltr" align="left" style="padding:10px 14px;font-size:24px;font-weight:800;color:${brand.accent};text-align:left;white-space:nowrap;">${formatILS(Math.round(t.withVat))}</td>`,
        `background:${accentBg};border:1.5px solid ${brand.accent};border-radius:10px;`, '6px')}
    </table>
    ${terms ? `<div dir="rtl" style="font-size:11.5px;color:${brand.muted};padding-top:6px;line-height:1.6;text-align:right;">${esc(terms)}</div>` : ''}
  </td></tr>`;
}

// ערבוב צבע המותג עם לבן — רקע בהיר לשורת הסה"כ שעובד בכל תוכנת מייל
function mixWithWhite(hex: string, ratio: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return '#f4f4f2';
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * ratio);
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// גוון עדין כהה יותר מרקע העמוד — לכרטיסי הסיכום/ההודעה בתוך המייל
function tint(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return '#FAFAF8';
  const n = parseInt(m[1], 16);
  const r = Math.max(0, ((n >> 16) & 255) - 5), g = Math.max(0, ((n >> 8) & 255) - 5), b = Math.max(0, (n & 255) - 5);
  return `rgb(${r},${g},${b})`;
}

function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}
