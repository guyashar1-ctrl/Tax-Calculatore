// מחולל ה-HTML של מייל ההצעה — מקור יחיד לתצוגה המקדימה בסטודיו/בבונה ולשליחה,
// כדי שהמייל ייראה זהה למה שהוצג.
//
// המעטפת היא buildBrandedEmail המשותפת (supabase/functions/_shared/designSystem)
// — אותה מעטפת שנשלחת בבקשות הייצוג. עד 2026-07-30 היה כאן HTML מקומי משלו,
// והוא נפל ל-LTR בג'ימייל: ג'ימייל מסיר את <html>/<body> ואיתם את dir="rtl",
// ורק כיוון שיושב על כל td/div שורד. במקום לתקן פעמיים — יש מעטפת אחת.
// כאן נשאר רק מה שייחודי להצעה: כרטיס סיכום התמחור וההודעה האישית.

import type { QuotationItem } from '../types/quotations';
import { calcTotals, formatILS, monthlyPlan, formatMonth, formatMonthRange } from './quotationCalc';
import type { QuotationBrand } from '../components/quotations/quotationBranding';
import { buildBrandedEmail, emailFont, emailTint, esc } from './brandedEmail';

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
  const f = emailFont(brand);
  const rad = brand.radius;
  const cardTint = emailTint(brand.pageBg);

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

  const summaryCard = `<tr><td dir="rtl" align="right" style="text-align:right;padding:20px 40px 4px;">
    <table dir="rtl" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${brand.border};border-radius:${rad}px;background:${cardTint};">
      <tr><td dir="rtl" align="right" style="text-align:right;padding:14px 18px 6px;font-family:${f};font-size:11px;font-weight:700;letter-spacing:.08em;color:${brand.muted};">סיכום ההצעה · מס׳ ${esc(data.quotationNumber)}</td></tr>
      ${summaryRows.join('') || `<tr><td dir="rtl" align="right" style="text-align:right;padding:6px 18px 16px;font-family:${f};color:${brand.muted};font-size:14px;">פרטי התמחור בעמוד ההצעה</td></tr>`}
      <tr><td dir="rtl" align="right" style="text-align:right;padding:4px 18px 14px;font-family:${f};font-size:11px;color:${brand.muted};">כל הסכומים הסופיים כוללים מע״מ (${data.vatRate}%). חיוב חודשי, שנתי וחד־פעמי מוצגים בנפרד.</td></tr>
    </table>
  </td></tr>`;

  const messageBlock = data.message?.trim()
    ? `<tr><td dir="rtl" align="right" style="text-align:right;padding:12px 40px 4px;">
        <div dir="rtl" style="background:${cardTint};border-radius:${rad}px;padding:16px 18px;font-family:${f};font-size:14px;color:${brand.ink};line-height:1.7;white-space:pre-line;text-align:right;">${esc(data.message)}</div>
      </td></tr>`
    : '';

  const expiryLabel = data.expiresAt
    ? new Date(data.expiresAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return buildBrandedEmail(brand, {
    heading: `${firstName ? esc(firstName) + ', ' : ''}הצעת מחיר עבורך`,
    bodyHtml: `הכנו עבורך הצעה אישית לליווי חשבונאי${data.businessName ? ' עבור ' + esc(data.businessName) : ''}. הנה התמצית — לפרטים המלאים ולאישור, המשך לעמוד ההצעה.`,
    tag: `הצעה מס׳ ${data.quotationNumber}`,
    extraHtml: summaryCard + messageBlock,
    ctaLabel: 'צפייה ואישור ההצעה',
    ctaHref: data.quotationLink,
    footerNote: expiryLabel ? `ההצעה בתוקף עד ${expiryLabel}.` : 'לצפייה בפרטים המלאים ולאישור — לחיצה אחת.',
    showLinkFallback: true,
  });
}

// עוגן התנהגותי זהה לעמוד ההצעה: מחיר מלא (מחוק) ← הנחה (שורה ירוקה) ←
// מחיר אחרי הנחה ← מע"מ ← שורת "סה״כ לתשלום" גדולה על רקע צבע המותג.
// כיוון ויישור יושבים על כל td — ג'ימייל מסיר סגנונות מהאב, לא מהתא.
function priceBlock(
  label: string,
  t: { fullBeforeVat: number; discount: number; beforeVat: number; vat: number; withVat: number },
  suffix: string,
  vatRate: number,
  brand: QuotationBrand,
  terms?: string,
): string {
  const f = emailFont(brand);
  const hasDiscount = t.discount >= 1;
  const pct = hasDiscount ? Math.round((t.discount / t.fullBeforeVat) * 100) : 0;
  const row = (l: string, v: string, lStyle = '', vStyle = '') => `<tr>
      <td dir="rtl" align="right" style="font-family:${f};font-size:12.5px;color:${brand.muted};padding:3px 0;text-align:right;${lStyle}">${l}</td>
      <td dir="ltr" align="left" style="font-family:${f};font-size:13px;color:${brand.muted};padding:3px 0;text-align:left;white-space:nowrap;${vStyle}">${v}</td>
    </tr>`;
  // שורות "קופסה" (הנחה / סה"כ) — טבלה פנימית ברוחב מלא, כדי שלא ייראו כשתי
  // קופסאות מנותקות (שני td עם פינות עגולות אינם מתחברים בג'ימייל).
  const boxRow = (inner: string, boxStyle: string, padTop = '3px') => `<tr><td dir="rtl" colspan="2" style="padding-top:${padTop};">
      <table dir="rtl" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${boxStyle}"><tr>${inner}</tr></table>
    </td></tr>`;
  const discountRows = hasDiscount
    ? row('מחיר מלא', formatILS(Math.round(t.fullBeforeVat)), '', 'text-decoration:line-through;font-size:14px;')
      + boxRow(
        `<td dir="rtl" align="right" style="font-family:${f};padding:6px 10px;font-size:13px;font-weight:700;color:#047857;text-align:right;">🎁 הנחה ${pct}%</td>
         <td dir="ltr" align="left" style="font-family:${f};padding:6px 10px;font-size:14px;font-weight:800;color:#047857;text-align:left;white-space:nowrap;">−${formatILS(Math.round(t.discount))}</td>`,
        'background:#e6f7f0;border-radius:8px;')
      + row('מחיר אחרי הנחה', formatILS(Math.round(t.beforeVat)),
        `font-weight:600;color:${brand.ink};`, `font-weight:700;color:${brand.ink};font-size:14px;`)
    : row('מחיר', formatILS(Math.round(t.beforeVat)), '', `font-weight:600;color:${brand.ink};`);
  const accentBg = mixWithWhite(brand.accent, 0.9);
  return `<tr><td dir="rtl" align="right" style="text-align:right;padding:10px 18px 12px;">
    <div dir="rtl" style="font-family:${f};font-size:11.5px;font-weight:700;letter-spacing:.06em;color:${brand.muted};padding-bottom:4px;text-align:right;">${label}</div>
    <table dir="rtl" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${brand.border};">
      ${discountRows}
      ${row(`+ מע״מ (${vatRate}%)`, formatILS(Math.round(t.vat)))}
      ${boxRow(
        `<td dir="rtl" align="right" style="padding:10px 14px;text-align:right;">
           <div style="font-family:${f};font-size:14px;font-weight:700;color:${brand.ink};text-align:right;">סה״כ לתשלום${suffix ? ` ${suffix}` : ''}</div>
           <div style="font-family:${f};font-size:10.5px;color:${brand.muted};text-align:right;">כולל מע״מ</div>
         </td>
         <td dir="ltr" align="left" style="font-family:${f};padding:10px 14px;font-size:24px;font-weight:800;color:${brand.accent};text-align:left;white-space:nowrap;">${formatILS(Math.round(t.withVat))}</td>`,
        `background:${accentBg};border:1.5px solid ${brand.accent};border-radius:10px;`, '6px')}
    </table>
    ${terms ? `<div dir="rtl" style="font-family:${f};font-size:11.5px;color:${brand.muted};padding-top:6px;line-height:1.6;text-align:right;">${esc(terms)}</div>` : ''}
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
