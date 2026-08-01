// ─── הפקת PDF להצעת מחיר ────────────────────────────────────────────────────
// תואם לעמוד ההצעה: כותרת ממותגת, שירותים, סיכומים נפרדים, הערות, פרטי קשר.
// עברית/RTL דרך pdfHebrew (אותם פונטים של ייפוי הכוח). מיישר לימין ידנית.
// הערה: המטבע נכתב "ש״ח" ולא ₪ — הסימבול לא קיים בכל הפונטים העבריים.

import { PDFDocument, PDFPage, rgb, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { embedPdfFonts, layoutMixed, measureMixed, type PdfFonts } from './pdfHebrew';
import type { QuotationItem, FutureService, QuotationRepresentation } from '../types/quotations';
import { SERVICE_CATEGORY_LABELS } from '../types/quotations';
import { REP_AUTHORITY_LABELS, REP_AUTHORITY_ORDER } from '../types';
import { calcTotals, itemFinalPrice, itemOriginalPrice, itemDisplayName, monthlyPlan, formatMonth, formatMonthRange } from './quotationCalc';
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
  /** הייצוג שהאישור פותח — נדפס כסעיף בהסכם, כי החתימה מאשרת גם אותו */
  representation?: QuotationRepresentation;
  // כשההצעה אושרה ונחתמה — ה-PDF כולל את החתימה והופך להסכם התקשרות
  approval?: {
    signatureDataUrl?: string;
    signerName?: string;
    approvedAt?: string;
  };
}

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 50;
const RIGHT = A4.w - MARGIN;   // קצה ימין (התחלת שורה ב-RTL)
const LEFT = MARGIN;

function money(n: number): string {
  return Math.round(n).toLocaleString('he-IL') + ' ש״ח';
}

// תווים שאין להם גליף בפונטים של ה-PDF מוחלפים בשקילים ASCII שקיימים בפונט
// הלטיני. חשוב שההחלפה לא תכניס תו עברי לשורה לטינית בלבד — אחרת השורה
// נכנסת למנוע ה-bidi בלי סיבה, וכתובת המייל בתחתית המסמך מתהפכת.
// סוגריים מוסרים כי המנוע הפשוט אינו משקף אותם בטקסט מעורב.
function pdfSafe(s: string): string {
  return s
    .replace(/[—–]/g, '-')
    .replace(/\s*[·•]\s*/g, ' - ')
    .replace(/[✓✔]\s*/g, '')
    .replace(/−/g, '-')
    .replace(/[()]/g, '');
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
    const segs = layoutMixed(pdfSafe(text));
    const w = measureMixed(segs, size, fonts);
    drawColored(page, segs, rightX - w, yy, size, fonts, color);
  };
  // ציור טקסט מיושר לשמאל (מתחיל ב-LEFT) — למספרים
  const ltr = (text: string, size: number, color: RGB, yy: number, leftX = LEFT) => {
    const segs = layoutMixed(pdfSafe(text));
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

  rtl(data.recipientName ? `${data.recipientName}, זו ההצעה שהכנתי עבורך.` : 'הצעת מחיר', 18, ink, y);
  y -= 20;
  if (data.businessName) { rtl(data.businessName, 11, gray, y); y -= 16; }
  y -= 8;

  const totals = calcTotals(data.items, data.vatRate);
  const priced = data.items.filter(i => i.category !== 'included');
  const included = data.items.filter(i => i.category === 'included');

  // ── שירותים ──
  sectionLine('מה תקבל במסגרת הליווי');
  for (const item of priced) {
    ensureSpace(38);
    rtl(itemDisplayName(item), 11.5, ink, y);
    // עוגן מחיר: כשיש הנחה מציינים את המחיר המלא לצד המחיר שאחרי ההנחה
    const orig = itemOriginalPrice(item);
    const finalP = itemFinalPrice(item);
    const before = orig - finalP >= 1 ? ` (במקום ${money(orig)})` : '';
    ltr(`${money(finalP)}${item.vatFlag ? ' + מע״מ' : ''}${before}`, 11.5, ink, y);
    y -= 15;
    const meta = `${SERVICE_CATEGORY_LABELS[item.category]}${item.billingType === 'per_unit' && item.quantity > 1 ? ` · ${item.quantity} × ${item.unitLabel || 'יחידה'}` : ''}${item.description ? ` · ${item.description}` : ''}`;
    rtl(meta, 8.5, gray, y);
    y -= 18;
  }

  if (included.length > 0) {
    y -= 6;
    sectionLine('כלול בליווי — ללא תוספת תשלום');
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
  const green = rgb(0.02, 0.47, 0.34);
  for (const [label, t, suffix] of blocks) {
    ensureSpace(88);
    rtl(label, 11.5, ink, y); y -= 15;
    // סדר קבוע כמו בעמוד ובמייל: מחיר מלא ← הנחה ← אחרי הנחה ← מע"מ ← סה"כ
    if (t.discount >= 1) {
      rtl('מחיר מלא', 9.5, gray, y); ltr(money(t.fullBeforeVat), 9.5, gray, y); y -= 13;
      rtl(`הנחה ${Math.round((t.discount / t.fullBeforeVat) * 100)}%`, 10.5, green, y); ltr(`${money(t.discount)}-`, 10.5, green, y); y -= 14;
      rtl('מחיר אחרי הנחה', 10, ink, y); ltr(money(t.beforeVat), 10, ink, y); y -= 13;
    } else {
      rtl('מחיר', 9.5, gray, y); ltr(money(t.beforeVat), 9.5, gray, y); y -= 13;
    }
    rtl(`+ מע״מ (${data.vatRate}%)`, 9.5, gray, y); ltr(money(t.vat), 9.5, gray, y); y -= 15;
    // שורת הסה"כ — פס מודגש בצבע המותג, המספר הגדול בעמוד
    page.drawRectangle({ x: LEFT, y: y - 5, width: A4.w - MARGIN * 2, height: 22, color: accent, opacity: 0.09 });
    rtl(suffix ? `סה״כ לתשלום ${suffix} (כולל מע״מ)` : 'סה״כ לתשלום (כולל מע״מ)', 11.5, ink, y);
    ltr(money(t.withVat), 15, accent, y);
    y -= 22;
    // תנאי הפריסה מודפסים מתחת לסכום החודשי — זה מה שיישאר בידי הלקוח
    if (label === 'חודשי') {
      for (const line of monthlyTermLines(data, totals)) {
        ensureSpace(16);
        rtl(line, 9, gray, y);
        y -= 13;
      }
    }
    y -= 4;
  }
  rtl('חיוב חודשי, שנתי וחד־פעמי מוצגים בנפרד. הסכומים הסופיים כוללים מע״מ.', 8.5, gray, y);
  y -= 20;

  // ── שירותים עתידיים (מחירון ידוע מראש) ──
  const future = data.futureServices ?? [];
  if (future.length > 0) {
    ensureSpace(50);
    sectionLine('שירותים נוספים');
    rtl('אינם כלולים בהצעה. תחויב רק אם תבקש אותם.', 8.5, gray, y);
    y -= 16;
    const fsSuffix: Record<string, string> = { monthly: ' לחודש', annual: ' לשנה', one_time: ' חד־פעמי', included: '' };
    for (const fs of future) {
      ensureSpace(16);
      rtl(fs.name, 10.5, bodyGray, y);
      ltr(`${money(fs.price)}${fsSuffix[fs.category] ?? ''}${fs.vatFlag ? ' + מע״מ' : ''}${fs.billingType === 'per_unit' ? ` / ${fs.unitLabel || 'יחידה'}` : ''}`, 10.5, bodyGray, y);
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

  // ── ייצוג מול הרשויות ──
  // סעיף בהסכם, לא קישוט: החתימה על ההצעה היא גם ההסכמה לפתוח את הייצוג,
  // ולכן היקפו והגבלותיו חייבים להיות כתובים במסמך שנחתם.
  const repAuthorities = data.representation?.enabled
    ? REP_AUTHORITY_ORDER.filter(a => !!data.representation!.areas?.[a])
    : [];
  if (repAuthorities.length > 0) {
    ensureSpace(70);
    sectionLine('ייצוג מול רשויות המס');
    const hasNi = repAuthorities.includes('nationalInsurance');
    const names = repAuthorities.map(a => REP_AUTHORITY_LABELS[a]).join(', ');
    const lines = [
      `אישור ההצעה כולל פתיחת הליך ייצוג מול: ${names}.`,
      'לצורך הרישום כמייצג נדרשים פרטי זיהוי וחתימה על ייפוי כוח, שיישלחו בקישור מאובטח.',
      hasNi
        ? 'ייצוג בביטוח הלאומי מחייב טופס נפרד ואישור של המבוטח עצמו מול הביטוח הלאומי.'
        : '',
      'ייפוי הכוח מוגבל לייצוג בענייני מס בלבד. אין בו הרשאה לגשת לחשבון הבנק או לבצע פעולות כספיות, וניתן לבטלו בכל עת.',
    ].filter(Boolean);
    for (const line of lines) {
      for (const wrapped of wrapText(line, 95)) {
        ensureSpace(16);
        rtl(wrapped, 9.5, bodyGray, y);
        y -= 13;
      }
    }
    y -= 8;
  }

  // ── אישור וחתימת הלקוח — הופך את המסמך להסכם התקשרות ──
  if (data.approval && (data.approval.signatureDataUrl || data.approval.signerName)) {
    ensureSpace(60);
    sectionLine('אישור וחתימת הלקוח');
    const when = data.approval.approvedAt
      ? new Date(data.approval.approvedAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
      : '';
    rtl(
      `ההצעה אושרה ונחתמה${data.approval.signerName ? ` על ידי ${data.approval.signerName}` : ''}${when ? ` בתאריך ${when}` : ''}.`,
      10.5, bodyGray, y,
    );
    y -= 16;
    rtl('מסמך זה, בצירוף החתימה, מהווה הסכם התקשרות בין הצדדים.', 9, gray, y);
    y -= 18;
    if (data.approval.signatureDataUrl) {
      try {
        const png = await doc.embedPng(data.approval.signatureDataUrl);
        const w = 150;
        const h = (png.height / png.width) * w;
        ensureSpace(h + 12);
        page.drawRectangle({ x: RIGHT - w - 10, y: y - h - 8, width: w + 20, height: h + 16, borderColor: lineGray, borderWidth: 0.8 });
        page.drawImage(png, { x: RIGHT - w, y: y - h, width: w, height: h });
        y -= h + 22;
      } catch { /* חתימה שאינה PNG תקין — הטקסט לבדו מתעד את האישור */ }
    }
  }

  // ── תוקף + פרטי קשר בתחתית ──
  ensureSpace(46);
  if (data.expiresAt && !data.approval) {
    const d = new Date(data.expiresAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
    rtl(`ההצעה בתוקף עד ${d}.`, 9.5, gray, y);
    y -= 20;
  }
  // מי אחראי על ההצעה ומה מספר הרישיון — נדרש על מסמך שיוצא ללקוח
  const who = [
    brand.accountantName && `${brand.representativeType || 'רואה חשבון'} ${brand.accountantName}`,
    brand.licenseNumber && `מספר מייצג ${brand.licenseNumber}`,
  ].filter(Boolean).join(' · ');
  if (who) { rtl(who, 9, gray, y); y -= 13; }
  const contact = [brand.phone, brand.email, brand.address, brand.website].filter(Boolean).join(' · ');
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

// שורות תנאי הפריסה: כמה תשלומים, עד מתי, וכמה יעלה אחרי התקופה
function monthlyTermLines(data: QuotationPdfData, totals: ReturnType<typeof calcTotals>): string[] {
  if (!totals.hasPartialTerm && !totals.changesAfterPeriod) return [];
  const first = data.items.filter(i => i.category === 'monthly').map(monthlyPlan)[0];
  const out: string[] = [];
  // בלי סה"כ לתקופה — סכום מצטבר רק מגדיל את המספר בראש של הלקוח
  if (totals.hasPartialTerm && totals.installments) {
    const range = first ? formatMonthRange(first.startMonth, first.endMonth) : '';
    out.push(`${totals.installments} תשלומים${range ? ` · ${range}` : ''}`);
  }
  if (totals.changesAfterPeriod) {
    // בלי נקודתיים בין שני מספרים ("2027: 162") — מנוע ה-bidi מדביק אותם;
    // מקף עברי מפריד בין הרצפים ושומר על הסדר הנכון.
    const from = first?.nextMonth ? `החל מ${formatMonth(first.nextMonth)}` : 'לאחר מכן';
    out.push(`${from} ־ ${money(totals.monthlyOngoing.withVat)} לחודש, 12 תשלומים בשנה.`);
  }
  return out;
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
