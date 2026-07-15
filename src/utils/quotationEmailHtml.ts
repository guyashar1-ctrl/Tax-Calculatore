// מחולל ה-HTML של מייל ההצעה — מקור יחיד המשמש גם את התצוגה המקדימה בבונה
// וגם את השליחה בפועל (שלב 3), כדי שהמייל ייראה זהה למה שהוצג. RTL, table-based
// לתאימות Gmail/Outlook. לא מציג את כל הקטלוג — רק כרטיס סיכום, לפי ה-PRD.

import type { QuotationItem } from '../types/quotations';
import { calcTotals, formatILS } from './quotationCalc';
import type { QuotationBrand } from '../components/quotations/quotationBranding';

export interface QuotationEmailData {
  quotationNumber: string;
  recipientName: string;
  businessName?: string;
  items: QuotationItem[];
  vatRate: number;
  message?: string;          // הודעה אישית חופשית מהרו"ח
  quotationLink: string;     // קישור לעמוד ההצעה
  expiresAt?: string;
}

export function buildQuotationEmailHtml(data: QuotationEmailData, brand: QuotationBrand): string {
  const totals = calcTotals(data.items, data.vatRate);
  const firstName = (data.recipientName || '').trim().split(/\s+/)[0] || '';

  const logoBlock = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.firmName)}" style="max-height:40px;max-width:180px;" />`
    : `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
         <td style="width:38px;height:38px;border:1.5px solid ${brand.ink};border-radius:50%;text-align:center;vertical-align:middle;color:${brand.ink};font-size:15px;font-weight:600;">${esc(brand.monogram)}</td>
         <td style="padding-right:10px;color:${brand.ink};font-size:17px;font-weight:600;">${esc(brand.firmName)}</td>
       </tr></table>`;

  const summaryRows: string[] = [];
  if (totals.monthly.withVat > 0) summaryRows.push(priceRow('חודשי', totals.monthly.withVat, 'לחודש', brand.accent));
  if (totals.annual.withVat > 0) summaryRows.push(priceRow('שנתי', totals.annual.withVat, 'לשנה', brand.accent));
  if (totals.oneTime.withVat > 0) summaryRows.push(priceRow('חד־פעמי', totals.oneTime.withVat, '', brand.accent));

  const messageBlock = data.message?.trim()
    ? `<tr><td style="padding:0 40px 8px;">
         <div style="background:#FAFAF8;border-radius:12px;padding:16px 18px;font-size:14px;color:#4b4a44;line-height:1.7;white-space:pre-line;">${esc(data.message)}</div>
       </td></tr>`
    : '';

  const signatureBlock = brand.emailSignature?.trim()
    ? `<div style="font-size:13px;color:#6b6a63;line-height:1.7;white-space:pre-line;">${esc(brand.emailSignature)}</div>`
    : `<div style="font-size:13px;color:#6b6a63;">${esc(brand.firmName)}</div>`;

  const contactLine = [brand.phone, brand.email].filter((v): v is string => Boolean(v)).map(esc).join(' · ');
  const expiryLabel = data.expiresAt
    ? new Date(data.expiresAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return `<!DOCTYPE html>
<html dir="rtl" lang="he"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#F4F3EF;font-family:'${brand.font}',Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F3EF;padding:24px 0;"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.06);">

      <tr><td style="padding:32px 40px 0;">${logoBlock}</td></tr>

      <tr><td style="padding:24px 40px 4px;">
        <div style="font-size:24px;font-weight:700;letter-spacing:-.02em;">${firstName ? esc(firstName) + ', ' : ''}הצעת מחיר עבורך</div>
        <div style="font-size:15px;color:#6b6a63;line-height:1.6;padding-top:6px;">
          הכנו עבורך הצעה אישית לליווי חשבונאי${data.businessName ? ' עבור ' + esc(data.businessName) : ''}. הנה התמצית — לפרטים המלאים ולאישור, המשך לעמוד ההצעה.
        </div>
      </td></tr>

      <tr><td style="padding:20px 40px 4px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #EFEEE9;border-radius:12px;">
          <tr><td style="padding:14px 18px 6px;font-size:11px;font-weight:700;letter-spacing:.08em;color:#9a988f;">סיכום ההצעה · מס׳ ${esc(data.quotationNumber)}</td></tr>
          ${summaryRows.join('') || `<tr><td style="padding:6px 18px 16px;color:#9a988f;font-size:14px;">פרטי התמחור בעמוד ההצעה</td></tr>`}
          <tr><td style="padding:4px 18px 14px;font-size:11px;color:#b0aea4;">המחירים כוללים מע״מ (${data.vatRate}%). חיוב חודשי, שנתי וחד־פעמי מוצגים בנפרד.</td></tr>
        </table>
      </td></tr>

      ${messageBlock}

      <tr><td style="padding:20px 40px 8px;">
        <a href="${esc(data.quotationLink)}" style="display:block;background:${brand.accent};color:#ffffff;text-decoration:none;text-align:center;padding:15px;border-radius:11px;font-size:16px;font-weight:700;">
          צפייה ואישור ההצעה
        </a>
        <div style="text-align:center;padding-top:10px;font-size:12px;color:#9a988f;">
          ${expiryLabel ? 'ההצעה בתוקף עד ' + esc(expiryLabel) + '.' : 'לצפייה בפרטים המלאים ולאישור — לחיצה אחת.'}
        </div>
        <div style="text-align:center;padding-top:6px;font-size:11px;color:#b0aea4;">
          או העתק קישור זה: <span dir="ltr">${esc(data.quotationLink)}</span>
        </div>
      </td></tr>

      <tr><td style="padding:20px 40px 32px;border-top:1px solid #EFEEE9;">
        ${signatureBlock}
        ${contactLine ? `<div style="font-size:12px;color:#9a988f;padding-top:8px;">${contactLine}</div>` : ''}
      </td></tr>

    </table>
  </td></tr></table>
</body></html>`;
}

function priceRow(label: string, value: number, suffix: string, accent: string): string {
  return `<tr><td style="padding:7px 18px;">
    <table role="presentation" width="100%"><tr>
      <td style="font-size:14px;color:#4b4a44;font-weight:500;">${label}</td>
      <td align="left" style="font-size:17px;font-weight:700;color:${accent};direction:ltr;">${formatILS(Math.round(value))}${suffix ? ` <span style="font-size:11px;color:#9a988f;font-weight:500;">${suffix}</span>` : ''}</td>
    </tr></table>
  </td></tr>`;
}

function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}
