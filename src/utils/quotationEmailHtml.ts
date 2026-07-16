// מחולל ה-HTML של מייל ההצעה — מקור יחיד לתצוגה המקדימה בסטודיו/בבונה ולשליחה,
// כדי שהמייל ייראה זהה למה שהוצג. RTL, table-based לתאימות Gmail/Outlook.
// כל הצבעים/פינות/כותרת/כפתור/פונט מגיעים מטוקני העיצוב (brand) — כך שהמייל
// משתנה במלואו יחד עם תבנית העיצוב שנבחרה בסטודיו.

import type { QuotationItem } from '../types/quotations';
import { calcTotals, formatILS } from './quotationCalc';
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
  const brandMark = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.firmName)}" style="max-height:40px;max-width:180px;border:0;" />`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" dir="rtl"><tr>`
      + `<td style="width:38px;height:38px;border:1.5px solid ${brand.ink};border-radius:50%;text-align:center;vertical-align:middle;color:${brand.ink};font-size:15px;font-weight:600;">${esc(brand.monogram)}</td>`
      + `<td style="padding-right:10px;color:${brand.ink};font-size:17px;font-weight:600;">${esc(brand.firmName)}</td>`
      + `</tr></table>`;
  const brandMarkOnDark = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.firmName)}" style="max-height:38px;max-width:180px;border:0;" />`
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

  const summaryRows: string[] = [];
  if (totals.monthly.withVat > 0) summaryRows.push(priceBlock('חודשי', totals.monthly, 'לחודש', data.vatRate, brand));
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

// סיכום לפי תדירות — לפני מע"מ, מע"מ בנפרד, וסה"כ (זהה לעמוד ההצעה ול-PDF)
function priceBlock(
  label: string,
  t: { beforeVat: number; vat: number; withVat: number },
  suffix: string,
  vatRate: number,
  brand: QuotationBrand,
): string {
  const small = (l: string, v: number) => `<tr>
      <td style="font-size:12.5px;color:${brand.muted};padding:2px 0;">${l}</td>
      <td align="left" style="font-size:12.5px;color:${brand.muted};direction:ltr;padding:2px 0;">${formatILS(Math.round(v))}</td>
    </tr>`;
  return `<tr><td style="padding:10px 18px 4px;">
    <div style="font-size:13px;font-weight:700;color:${brand.ink};padding-bottom:4px;">${label}</div>
    <table role="presentation" width="100%" style="border-top:1px solid ${brand.border};">
      ${small('לפני מע״מ', t.beforeVat)}
      ${small(`מע״מ (${vatRate}%)`, t.vat)}
      <tr>
        <td style="font-size:14px;font-weight:600;color:${brand.ink};border-top:1px solid ${brand.border};padding-top:5px;">${suffix ? `סה״כ ${suffix}` : 'סה״כ לתשלום'}</td>
        <td align="left" style="font-size:17px;font-weight:700;color:${brand.accent};direction:ltr;border-top:1px solid ${brand.border};padding-top:5px;">${formatILS(Math.round(t.withVat))}</td>
      </tr>
    </table>
  </td></tr>`;
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
