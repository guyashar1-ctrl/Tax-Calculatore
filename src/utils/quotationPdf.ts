// ─── הפקת PDF להצעת מחיר ────────────────────────────────────────────────────
// תואם לעמוד ההצעה: כותרת ממותגת ושנת הליווי, מה ומתי משלמים, מה כלול, פירוט
// החישוב (פתוח — זה המסמך שנחתם), הערות, הסעיף השנתי, פרטי קשר.
// עברית/RTL דרך pdfHebrew (אותם פונטים של ייפוי הכוח). מיישר לימין ידנית.
// הערה: המטבע נכתב "ש״ח" ולא ₪ — הסימבול לא קיים בכל הפונטים העבריים.

import { PDFDocument, PDFPage, rgb, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { embedPdfFonts, layoutMixed, measureMixed, type PdfFonts } from './pdfHebrew';
import type { QuotationItem, FutureService, QuotationRepresentation } from '../types/quotations';
import { REP_AUTHORITY_LABELS, REP_AUTHORITY_ORDER } from '../types';
import {
  itemFinalPrice, itemOriginalPrice, itemAnnualAnchor, itemDisplayName, monthlyPlan,
  itemDeferred, deferredDetailLines, paymentSchedule, quotationSavings, quotationServiceYear, serviceYearClause, savingsHeadline, savingsLineValue,
} from './quotationCalc';
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
  const serviceYear = quotationServiceYear(data.items, data.expiresAt ?? data.approval?.approvedAt);
  if (serviceYear) { rtl(`הצעת ליווי לשנת המס ${serviceYear}`, 10.5, accent, y); y -= 16; }
  y -= 8;

  const priced = data.items.filter(i => i.category !== 'included');
  const included = data.items.filter(i => i.category === 'included');

  // ── מה ומתי משלמים — אותה תשובה כמו בראש עמוד ההצעה, כולל מע"מ ──
  const green = rgb(0.02, 0.47, 0.34);
  if (priced.length > 0) {
    sectionLine('מה ומתי משלמים');
    for (const r of paymentSchedule(data.items, data.vatRate)) {
      ensureSpace(36);
      rtl(r.label, 11.5, ink, y);
      ltr(money(r.amount), 14, r.deferred ? gray : ink, y);
      y -= 14;
      if (r.sub) { rtl(r.sub, 9, gray, y); y -= 12; }
      if (r.regular != null) { rtl(`במקום ${money(r.regular)}`, 9, green, y); y -= 12; }
      // בלי נקודתיים בין שני מספרים ("2027: 162") — מנוע ה-bidi מדביק אותם;
      // מקף עברי מפריד בין הרצפים ושומר על הסדר הנכון.
      if (r.changesTo) { rtl(`${r.changesTo.from} ־ ${money(r.changesTo.amount)} לחודש`, 9, ink, y); y -= 12; }
      y -= 6;
    }
    // אותה תיבה כמו בעמוד: הסכום הכולל ככותרת, וכל הנחה בשורה משלה
    const savings = quotationSavings(data.items, data.vatRate);
    const savingsTitle = savingsHeadline(savings, money);
    if (savingsTitle) {
      const lines = savings.lines.length > 1 ? savings.lines : [];
      const boxH = lines.length ? 24 + lines.length * 13 : 20;
      ensureSpace(boxH + 6);
      page.drawRectangle({ x: LEFT, y: y - boxH + 15, width: A4.w - MARGIN * 2, height: boxH, color: green, opacity: 0.1 });
      rtl(savingsTitle, 10.5, green, y, RIGHT - 6);
      y -= 15;
      for (const l of lines) {
        const v = savingsLineValue(l, money);
        rtl(l.name, 9, green, y, RIGHT - 6);
        ltr(v.regular ? `${v.text} (במקום ${v.regular})` : v.text, 9, green, y, LEFT + 6);
        y -= 13;
      }
      y -= 9;
    }
    if (priced.some(i => i.vatFlag)) { rtl('כל הסכומים כוללים מע״מ.', 8.5, gray, y); y -= 14; }
    y -= 8;
  }

  // ── מה כלול — שמות, תיאורים והערות; המחירים בסעיף הקודם ובפירוט ──
  if (priced.length + included.length > 0) {
    sectionLine('מה כלול');
    for (const item of [...priced, ...included]) {
      ensureSpace(30);
      rtl(itemDisplayName(item), 11, ink, y);
      y -= 14;
      const meta = [item.description, item.category === 'included' ? 'ללא תוספת תשלום' : ''].filter(Boolean).join(' · ');
      if (meta) { rtl(meta, 8.5, gray, y); y -= 12; }
      // ההערה שהרו"ח כתב לשורה מוצגת בעמוד ההצעה — ולכן חייבת להופיע גם במסמך
      // שנחתם, אחרת נחתם משהו אחר ממה שנקרא.
      if (item.clientNote?.trim()) {
        for (const line of wrapText(item.clientNote, 95)) {
          ensureSpace(14);
          rtl(line, 9, accent, y);
          y -= 12;
        }
      }
      y -= 4;
    }
    y -= 6;
  }

  // ── פירוט החישוב — לפני מע"מ; במסמך שנחתם הוא פתוח, בעמוד הוא מקופל ──
  if (priced.length > 0) {
    sectionLine('פירוט החישוב');
    for (const item of priced) {
      ensureSpace(30);
      const finalP = itemFinalPrice(item);
      const orig = itemOriginalPrice(item);
      const suffix = item.category === 'monthly' ? ' לחודש' : item.category === 'annual' ? ' לשנה' : ' חד־פעמי';
      rtl(itemDisplayName(item), 10, ink, y);
      const free = orig - finalP >= 1 && finalP < 0.5 && !itemDeferred(item, data.vatRate);
      ltr(free ? 'ללא עלות' : `${money(finalP)}${suffix}${item.vatFlag ? ' + מע״מ' : ''}`, 10, free ? green : ink, y);
      y -= 13;
      const def = itemDeferred(item, data.vatRate);
      // ‼ "במקום 120" נקרא כהנחה של 20 ₪, בזמן שההנחה ניתנה על השנה
      // (1,440 ← 1,200). בשורת יתרה הפירוט שמתחת אומר זאת במלואו.
      const annual = !def && orig - finalP >= 1 ? itemAnnualAnchor(item) : null;
      const plan = item.category === 'monthly' && item.priceBasis === 'annual' ? monthlyPlan(item) : null;
      const was = !def && orig - finalP >= 1
        ? annual && annual.list - annual.value >= 1
          ? `${money(annual.value)} לשנה במקום ${money(annual.list)}`
          : `במקום ${money(orig)}`
        : '';
      const meta = [
        plan ? `${plan.installments} תשלומים` : '',
        item.billingType === 'per_unit' && item.quantity > 1 ? `${item.quantity} × ${item.unitLabel || 'יחידה'}` : '',
        item.vatFlag ? '' : 'ללא מע״מ',
        was,
      ].filter(Boolean).join(' · ');
      if (meta) { rtl(meta, 8.5, gray, y); y -= 12; }
      if (def) {
        for (const r of deferredDetailLines(def, item.name)) {
          ensureSpace(14);
          const size = r.strong ? 9.5 : 9;
          const color = r.strong ? ink : r.negative ? green : gray;
          rtl(r.label, size, color, y);
          // המינוס בסוף ולא בהתחלה — מנוע ה-bidi הפשוט מזיז סימן שפותח שורה מעורבת
          ltr(r.negative ? `${money(r.amount)}-` : money(r.amount), size, color, y);
          y -= 12;
        }
      }
      y -= 5;
    }
    if (priced.some(i => i.vatFlag)) { rtl(`הסכומים בפירוט לפני מע״מ. מע״מ ${data.vatRate}% מתווסף אליהם.`, 8.5, gray, y); y -= 14; }
    y -= 8;
  }

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

  // ── תקופת ההצעה: השנה שהיא מתמחרת ותוקפה — חלק מהתנאים שהחתימה מאשרת ──
  const expiryText = data.expiresAt && !data.approval
    ? `ההצעה בתוקף עד ${new Date(data.expiresAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}.`
    : '';
  const termLines = [serviceYear ? serviceYearClause(serviceYear) : '', expiryText].filter(Boolean);
  if (termLines.length > 0) {
    ensureSpace(26 + termLines.length * 14);
    sectionLine('תקופת ההצעה');
    for (const line of termLines.flatMap(l => wrapText(l, 95))) {
      ensureSpace(14);
      rtl(line, 9.5, bodyGray, y);
      y -= 13;
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
  // מי אחראי על ההצעה ומה מספר הרישיון — נדרש על מסמך שיוצא ללקוח
  const who = [
    brand.accountantName && `${brand.representativeType || 'רואה חשבון'} ${brand.accountantName}`,
    brand.licenseNumber && `מספר מייצג ${brand.licenseNumber}`,
  ].filter(Boolean).join(' · ');
  const contact = [brand.phone, brand.email, brand.address, brand.website].filter(Boolean).join(' · ');
  // עמוד חדש רק כשיש מה להדפיס בו — אחרת נשאר עמוד ריק בסוף המסמך
  if (who || contact) ensureSpace(30);
  if (who) { rtl(who, 9, gray, y); y -= 13; }
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
