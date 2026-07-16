// ─── ליבת עיצוב המיילים ללקוח ───────────────────────────────────────────────
// מקור יחיד לכל מייל שהלקוח מקבל — הצעת מחיר, בקשת ייצוג (הזדהות/חתימה/אושר),
// שאלון, מכתב שחרור. הכל נגזר מטוקני העיצוב (brand) של הסטודיו: תבנית, צבעים,
// פונט, סגנון כותרת וכפתור, פינות. אין צבעים קשיחים — שינוי תבנית מתעדכן בכל מקום.

import type { QuotationBrand } from '../components/quotations/quotationBranding';

export function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

export function emailFont(brand: QuotationBrand): string {
  return `'${brand.font}',Arial,Helvetica,sans-serif`;
}

// גוון עדין כהה יותר מרקע העמוד — לכרטיסים פנימיים
export function emailTint(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return '#FAFAF8';
  const n = parseInt(m[1], 16);
  const r = Math.max(0, ((n >> 16) & 255) - 5), g = Math.max(0, ((n >> 8) & 255) - 5), b = Math.max(0, (n & 255) - 5);
  return `rgb(${r},${g},${b})`;
}

// כותרת ממותגת לפי סגנון (band / centered / minimal). tag = טקסט קטן בצד (אופציונלי).
export function emailHeaderRow(brand: QuotationBrand, tag?: string): string {
  const f = emailFont(brand);
  const mark = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.firmName)}" style="max-height:40px;max-width:180px;border:0;" />`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" dir="rtl"><tr>`
      + `<td style="width:38px;height:38px;border:1.5px solid ${brand.ink};border-radius:50%;text-align:center;vertical-align:middle;color:${brand.ink};font-family:${f};font-size:15px;font-weight:600;">${esc(brand.monogram)}</td>`
      + `<td style="padding-right:10px;color:${brand.ink};font-family:${f};font-size:17px;font-weight:600;">${esc(brand.firmName)}</td></tr></table>`;
  const markDark = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.firmName)}" style="max-height:38px;max-width:180px;border:0;" />`
    : `<span style="color:#ffffff;font-family:${f};font-size:17px;font-weight:600;">${esc(brand.firmName)}</span>`;
  const tagHtml = tag ? `<span style="font-family:${f};font-size:11.5px;color:${brand.muted};">${esc(tag)}</span>` : '';

  if (brand.headerStyle === 'band') {
    return `<tr><td style="background:${brand.ink};padding:22px 40px;">`
      + `<table role="presentation" width="100%"><tr><td>${markDark}</td>`
      + `<td align="left" style="font-family:${f};font-size:11.5px;color:rgba(255,255,255,.65);">${tag ? esc(tag) : ''}</td></tr></table></td></tr>`;
  }
  if (brand.headerStyle === 'centered') {
    return `<tr><td align="center" style="padding:30px 40px 6px;border-bottom:1px solid ${brand.border};">${mark}${tag ? `<div style="padding-top:8px;">${tagHtml}</div>` : ''}</td></tr>`;
  }
  return `<tr><td style="padding:30px 40px 0;"><table role="presentation" width="100%"><tr><td>${mark}</td><td align="left">${tagHtml}</td></tr></table></td></tr>`;
}

// כפתור CTA לפי סגנון (solid / outline / pill)
export function emailButton(brand: QuotationBrand, label: string, href: string): string {
  const f = emailFont(brand);
  const btnRad = brand.buttonStyle === 'pill' ? 999 : Math.max(brand.radius, 8);
  const inner = `<a href="${esc(href)}" style="display:block;padding:15px 20px;font-family:${f};font-size:16px;font-weight:700;text-decoration:none;text-align:center;border-radius:${btnRad}px;`;
  return brand.buttonStyle === 'outline'
    ? `${inner}color:${brand.accent};border:2px solid ${brand.accent};">${esc(label)}</a>`
    : `${inner}color:#ffffff;background:${brand.accent};">${esc(label)}</a>`;
}

export interface BrandedEmailContent {
  heading: string;
  bodyHtml: string;         // גוף — כבר HTML מוכן (השתמש ב-esc על טקסט משתמש)
  tag?: string;             // טקסט קטן בכותרת (מס' הצעה וכו')
  ctaLabel?: string;
  ctaHref?: string;
  footerNote?: string;      // הערה קטנה מתחת ל-CTA
  showLinkFallback?: boolean; // הצג את הקישור כטקסט (לג'ימייל)
  signature?: string;       // חתימת מייל; אם ריק — שם המשרד
}

// מעטפת מייל מלאה — כל צבע/פינה/פונט מטוקני העיצוב
export function buildBrandedEmail(brand: QuotationBrand, c: BrandedEmailContent): string {
  const f = emailFont(brand);
  const rad = brand.radius;
  const cta = c.ctaLabel && c.ctaHref
    ? `<tr><td style="padding:8px 40px 8px;">${emailButton(brand, c.ctaLabel, c.ctaHref)}`
      + (c.footerNote ? `<div style="text-align:center;padding-top:10px;font-family:${f};font-size:12px;color:${brand.muted};">${esc(c.footerNote)}</div>` : '')
      + (c.showLinkFallback ? `<div style="text-align:center;padding-top:6px;font-family:${f};font-size:11px;color:${brand.muted};">או העתק קישור זה: <span dir="ltr">${esc(c.ctaHref)}</span></div>` : '')
      + `</td></tr>`
    : '';
  const sig = c.signature?.trim() || brand.emailSignature?.trim() || brand.firmName;
  const contactLine = [brand.phone, brand.email].filter((v): v is string => Boolean(v)).map(esc).join(' · ');

  return `<!DOCTYPE html>
<html dir="rtl" lang="he"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:${brand.pageBg};font-family:${f};color:${brand.ink};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${brand.pageBg};padding:24px 0;"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${brand.cardBg};border:1px solid ${brand.border};border-radius:${rad + 4}px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.06);">
      ${emailHeaderRow(brand, c.tag)}
      <tr><td style="padding:${brand.headerStyle === 'minimal' ? '22' : '26'}px 40px 4px;">
        <div style="font-size:24px;font-weight:700;letter-spacing:-.02em;color:${brand.ink};">${esc(c.heading)}</div>
        <div style="font-size:15px;color:${brand.muted};line-height:1.65;padding-top:8px;">${c.bodyHtml}</div>
      </td></tr>
      ${cta}
      <tr><td style="padding:20px 40px 32px;border-top:1px solid ${brand.border};margin-top:8px;">
        <div style="font-family:${f};font-size:13px;color:${brand.muted};line-height:1.7;white-space:pre-line;">${esc(sig)}</div>
        ${contactLine ? `<div style="font-family:${f};font-size:12px;color:${brand.muted};padding-top:8px;">${contactLine}</div>` : ''}
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}
