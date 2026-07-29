// ─── הפקת PDF להצעת מחיר ────────────────────────────────────────────────────
// תואם לעמוד ההצעה: כותרת ממותגת, שירותים, סיכומים נפרדים, הערות, פרטי קשר.
// עברית/RTL דרך pdfHebrew (אותם פונטים של ייפוי הכוח). מיישר לימין ידנית.
// הערה: המטבע נכתב "ש״ח" ולא ₪ — הסימבול לא קיים בכל הפונטים העבריים.

import { PDFDocument, PDFPage, rgb, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { embedPdfFonts, layoutMixed, measureMixed, type PdfFonts } from './pdfHebrew';
import type { QuotationItem, FutureService } from '../types/quotations';
import { SERVICE_CATEGORY_LABELS } from '../types/quotations';
import { calcTotals, itemFinalPrice, itemDisplayName } from './quotationCalc';
import type { QuotationBrand } from '../components/quotations/quotationBranding';

export interface QuotationPdfData {
  quotationNumber: string;
  recipientName: string;
  businessName?: string;
  items: QuotationItem[];
  futureServices?: FutureService[];
  vatRate: number;
  notesForClient?: string;
  expiresAt?: string;
}

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 50;
const RIGHT = A4.w - MARGIN;   // קצה ימין (התחלת שורה ב-RTL)
const LEFT = MARGIN;

function money(n: number): string {
  return Math.round(n).toLocaleString('he-IL') + ' ש״ח';
}

function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return rgb(0.1, 0.1, 0.1);
  const int = parseInt(m[1], 16);
  return rgb(((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255);
}

export async function generateQuotationPdf(data: QuotationPdfData, brand: QuotationBrand): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts = await embedPdfFonts(doc);
  const ink = hexToRgb(brand.ink);
  const accent = hexToRgb(brand.accent);
  const gray = hexToRgb(brand.muted);
  const bodyGray = hexToRgb(brand.ink);
  const lineGray = hexToRgb(brand.border);

  let page = doc.addPage([A4.w, A4.h]);
  let y = A4.h - MARGIN;

  // ציור טקסט מיושר לימין (הטקסט מסתיים ב-RIGHT)
  const rtl = (text: string, size: number, color: RGB, yy: number, rightX = RIGHT) => {
    const segs = layoutMixed(text);
    const w = measureMixed(segs, size, fonts);
    drawColored(page, segs, rightX - w, yy, size, fonts, color);
  };
  // ציור טקסט מיושר לשמאל (מתחיל ב-LEFT) — למספרים
  const ltr = (text: string, size: number, color: RGB, yy: number, leftX = LEFT) => {
    const segs = layoutMixed(text);
    drawColored(page, segs, leftX, yy, size, fonts, color);
  };
  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) { page = doc.addPage([A4.w, A4.h]); y = A4.h - MARGIN; }
  };

  // ── כותרת ממותגת ──
  page.drawRectangle({ x: 0, y: A4.h - 5, width: A4.w, height: 5, color: accent });
  rtl(brand.firmName, 15, ink, y);
  ltr(`הצעה מס׳ ${data.quotationNumber}`, 9, gray, y + 2, LEFT);
  y -= 34;

  rtl(data.recipientName ? `${data.recipientName}, הצעת מחיר עבורך` : 'הצעת מחיר', 20, ink, y);
  y -= 20;
  if (data.businessName) { rtl(data.businessName, 11, gray, y); y -= 16; }
  y -= 8;

  const totals = calcTotals(data.items, data.vatRate);
  const priced = data.items.filter(i => i.category !== 'included');
  const included = data.items.filter(i => i.category === 'included');

  // ── שירותים ──
  sectionLine('השירותים שלנו');
  for (const item of priced) {
    ensureSpace(38);
    rtl(itemDisplayName(item), 11.5, ink, y);
    ltr(`${money(itemFinalPrice(item))}${item.vatFlag ? ' + מע״מ' : ''}`, 11.5, ink, y);
    y -= 15;
    const meta = `${SERVICE_CATEGORY_LABELS[item.category]}${item.billingType === 'per_unit' && item.quantity > 1 ? ` · ${item.quantity} × ${item.unitLabel || 'יחידה'}` : ''}${item.description ? ` · ${item.description}` : ''}`;
    rtl(meta, 8.5, gray, y);
    y -= 18;
  }

  if (included.length > 0) {
    y -= 6;
    sectionLine('כלול במחיר — ללא תוספת');
    for (const item of included) {
      ensureSpace(16);
      rtl(`•  ${itemDisplayName(item)}`, 10.5, bodyGray, y);
      y -= 15;
    }
  }

  // ── סיכום: לפני מע"מ, מע"מ בנפרד, סה"כ ──
  y -= 10;
  sectionLine('סיכום התמחור');
  const blocks: [string, typeof totals.monthly, string][] = [];
  if (totals.monthly.withVat > 0) blocks.push(['חודשי', totals.monthly, 'לחודש']);
  if (totals.annual.withVat > 0) blocks.push(['שנתי', totals.annual, 'לשנה']);
  if (totals.oneTime.withVat > 0) blocks.push(['חד־פעמי', totals.oneTime, '']);
  for (const [label, t, suffix] of blocks) {
    ensureSpace(62);
    rtl(label, 11.5, ink, y); y -= 15;
    rtl('לפני מע״מ', 9.5, gray, y); ltr(money(t.beforeVat), 9.5, gray, y); y -= 13;
    rtl(`מע״מ (${data.vatRate}%)`, 9.5, gray, y); ltr(money(t.vat), 9.5, gray, y); y -= 13;
    rtl(suffix ? `סה״כ ${suffix}` : 'סה״כ לתשלום', 11.5, ink, y);
    ltr(money(t.withVat), 12.5, accent, y);
    y -= 20;
  }
  rtl('חיוב חודשי, שנתי וחד־פעמי מוצגים בנפרד ואינם מאוחדים.', 8.5, gray, y);
  y -= 20;

  // ── שירותים עתידיים (מחירון ידוע מראש) ──
  const future = data.futureServices ?? [];
  if (future.length > 0) {
    ensureSpace(50);
    sectionLine('שירותים נוספים — אם וכאשר תצטרכו');
    rtl('אינם כלולים בהצעה. תחויבו רק אם וכאשר תבקשו אותם בפועל.', 8.5, gray, y);
    y -= 16;
    for (const fs of future) {
      ensureSpace(16);
      rtl(fs.name, 10.5, bodyGray, y);
      ltr(`${money(fs.price)}${fs.vatFlag ? ' + מע״מ' : ''}${fs.billingType === 'per_unit' ? ` / ${fs.unitLabel || 'יחידה'}` : ''}`, 10.5, bodyGray, y);
      y -= 15;
    }
    y -= 6;
  }

  // ── הערות ──
  if (data.notesForClient?.trim()) {
    ensureSpace(40);
    sectionLine('הערה');
    for (const line of wrapText(data.notesForClient, 95)) {
      ensureSpace(16);
      rtl(line, 10.5, bodyGray, y);
      y -= 15;
    }
    y -= 6;
  }

  // ── תוקף + פרטי קשר בתחתית ──
  ensureSpace(46);
  if (data.expiresAt) {
    const d = new Date(data.expiresAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
    rtl(`ההצעה בתוקף עד ${d}.`, 9.5, gray, y);
    y -= 20;
  }
  const contact = [brand.phone, brand.email, brand.address].filter(Boolean).join(' · ');
  if (contact) { rtl(contact, 9, gray, y); y -= 14; }

  return doc.save();

  function sectionLine(title: string) {
    ensureSpace(26);
    rtl(title, 9.5, accent, y);
    y -= 6;
    page.drawRectangle({ x: LEFT, y: y, width: A4.w - MARGIN * 2, height: 0.6, color: lineGray });
    y -= 16;
  }
}

// גרסה צבעונית של drawMixedVisual (המקורי מצייר בשחור בלבד)
function drawColored(page: PDFPage, segments: ReturnType<typeof layoutMixed>, x: number, y: number, size: number, fonts: PdfFonts, color: RGB) {
  let cx = x;
  for (const seg of segments) {
    const font = seg.rtl ? fonts.hebrew : fonts.latin;
    page.drawText(seg.text, { x: cx, y, size, font, color });
    cx += font.widthOfTextAtSize(seg.text, size);
  }
}

// עיטוף טקסט לפי אורך תווים משוער (עברית — פשוט לפי מילים)
function wrapText(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if ((line + ' ' + word).trim().length > maxChars) { if (line) out.push(line); line = word; }
      else line = (line + ' ' + word).trim();
    }
    if (line) out.push(line);
  }
  return out;
}

export function downloadPdf(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
