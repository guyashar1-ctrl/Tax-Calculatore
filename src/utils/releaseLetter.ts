// ─── מכתב שחרור לרו"ח קודם ───────────────────────────────────────────────────
// רלוונטי רק כשהליד עובר מרו"ח אחר. מכין מייל (הרו"ח בודק ושולח, לא אוטומטי),
// ואחרי השליחה נשמר PDF של המייל במסמכי הלקוח — כך שרואים בדיוק מה נשלח,
// ממי (כתובת המשרד) ולאן (מייל הרו"ח הקודם), עם הנושא, התוכן והתאריך.

import { PDFDocument, rgb, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { embedPdfFonts, layoutMixed, measureMixed } from './pdfHebrew';
import type { QuotationBrand } from '../components/quotations/quotationBranding';
import { esc, emailFont, emailHeaderRow } from './brandedEmail';

export interface ReleaseContext {
  clientName: string;
  businessName?: string;
  prevAccountantName?: string;
}

export function defaultReleaseSubject(ctx: ReleaseContext): string {
  return `בקשת העברת חומרים — ${ctx.clientName}`;
}

export function defaultReleaseBody(ctx: ReleaseContext, firmName: string): string {
  const to = ctx.prevAccountantName?.trim() ? ctx.prevAccountantName.trim() : 'רו״ח הנכבד';
  const who = ctx.businessName?.trim() ? `${ctx.clientName} (${ctx.businessName})` : ctx.clientName;
  return [
    `לכבוד ${to},`,
    '',
    `הלקוח ${who} עבר לטיפול משרדנו.`,
    'נודה להעברת החומרים הרלוונטיים לצורך המשך הטיפול השוטף, ובכללם:',
    '• מאזני בוחן ודוחות כספיים אחרונים',
    '• דוחות שהוגשו לרשויות (מס הכנסה, מע״מ, ניכויים)',
    '• כרטסות הנהלת חשבונות',
    '• כל מסמך נוסף הדרוש להמשך הייצוג',
    '',
    'תודה על שיתוף הפעולה.',
    '',
    'בברכה,',
    firmName,
  ].join('\n');
}

// HTML ממותג לשליחה בפועל — נגזר במלואו מטוקני העיצוב (אותה שפה של כל המיילים).
export function buildReleaseEmailHtml(bodyText: string, brand: QuotationBrand): string {
  const f = emailFont(brand);
  const contact = [brand.phone, brand.email].filter((v): v is string => Boolean(v)).map(esc).join(' · ');
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${brand.pageBg};font-family:${f};color:${brand.ink};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${brand.pageBg};padding:24px 0;"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${brand.cardBg};border:1px solid ${brand.border};border-radius:${brand.radius + 4}px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.06);">
      ${emailHeaderRow(brand)}
      <tr><td style="padding:${brand.headerStyle === 'minimal' ? '20' : '24'}px 40px 26px;font-family:${f};font-size:14.5px;line-height:1.8;color:${brand.ink};white-space:pre-line;">${esc(bodyText)}</td></tr>
      ${contact ? `<tr><td style="padding:0 40px 28px;"><div style="border-top:1px solid ${brand.border};padding-top:14px;font-family:${f};font-size:12px;color:${brand.muted};">${contact}</div></td></tr>` : ''}
    </table>
  </td></tr></table>
</body></html>`;
}

// PDF שמשקף את המייל שנשלח — כותרות מאת/אל/תאריך/נושא ואז גוף המכתב.
export async function generateReleaseEmailPdf(rec: {
  from: string; to: string; date: string; subject: string; bodyText: string;
}, brand: QuotationBrand): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts = await embedPdfFonts(doc);
  const ink = hexToRgb(brand.ink);
  const accent = hexToRgb(brand.accent);
  const gray = hexToRgb(brand.muted);
  const A4 = { w: 595.28, h: 841.89 };
  const M = 50, RIGHT = A4.w - M;

  let page = doc.addPage([A4.w, A4.h]);
  let y = A4.h - M;
  const rtl = (text: string, size: number, color: RGB, yy: number) => {
    const segs = layoutMixed(text);
    const w = measureMixed(segs, size, fonts);
    let cx = RIGHT - w;
    for (const seg of segs) { const f = seg.rtl ? fonts.hebrew : fonts.latin; page.drawText(seg.text, { x: cx, y: yy, size, font: f, color }); cx += f.widthOfTextAtSize(seg.text, size); }
  };
  const ensure = (need: number) => { if (y - need < M) { page = doc.addPage([A4.w, A4.h]); y = A4.h - M; } };

  page.drawRectangle({ x: 0, y: A4.h - 5, width: A4.w, height: 5, color: accent });
  rtl(brand.firmName, 15, ink, y); y -= 30;
  rtl('מכתב שחרור — רו״ח קודם', 12, accent, y); y -= 22;

  // בלוק כותרות המייל
  for (const [label, val] of [['מאת', rec.from], ['אל', rec.to], ['תאריך', rec.date], ['נושא', rec.subject]]) {
    ensure(18);
    rtl(`${label}: ${val}`, 10.5, gray, y);
    y -= 17;
  }
  y -= 6;
  page.drawRectangle({ x: M, y, width: A4.w - M * 2, height: 0.6, color: hexToRgb(brand.border) });
  y -= 18;

  // גוף המכתב
  for (const paragraph of rec.bodyText.split('\n')) {
    for (const line of wrap(paragraph, 92)) {
      ensure(16);
      rtl(line || ' ', 11, ink, y);
      y -= 16;
    }
  }
  return doc.save();
}

function wrap(text: string, maxChars: number): string[] {
  if (!text) return [''];
  const out: string[] = []; let line = '';
  for (const word of text.split(/\s+/)) {
    if ((line + ' ' + word).trim().length > maxChars) { if (line) out.push(line); line = word; }
    else line = (line + ' ' + word).trim();
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}

function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return rgb(0.1, 0.1, 0.1);
  const int = parseInt(m[1], 16);
  return rgb(((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255);
}

