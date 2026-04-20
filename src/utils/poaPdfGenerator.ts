/**
 * יצירת PDF חתום של טופס 2279א'5 — ייפוי כוח לייצוג ראשי
 *
 * נטען טמפלט מ-/templates/poa_2279a5.pdf, מוטבע פונט עברי, ונכתבים מעליו
 * הנתונים שמולאו ע"י הלקוח (חלק א') והמייצג (חלק ב'), כולל חתימות.
 *
 * הקואורדינטות הן הערכה — ניתן לכוון אותן ב-FIELD_POSITIONS.
 * עמוד A4: 595.275 × 841.89 pt, ציר Y מתחיל מלמטה.
 */

import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { RepresentationRequest, AuthorityKind } from '../types';

const TEMPLATE_URL = '/templates/poa_2279a5.pdf';
const FONT_URL = '/fonts/NotoSans-Regular.ttf';

const PAGE_HEIGHT = 841.89;

/**
 * קואורדינטות (x, y) לכל שדה — ניתנות לכוונון. y הוא מלמטה.
 *
 * כוונון לפי רשת קליברציה על טופס 2279א'5 (ציר X אדום שמאל→ימין 0-595,
 * ציר Y כחול מלמטה→למעלה 0-842):
 *
 *   תיבות הספרות בחלק ב' (שורות הקווקו):
 *     LEFT edge ≈ 220, RIGHT edge ≈ 350 → center x ≈ 285
 *     מספר תיק מס הכנסה  baseline y ≈ 280
 *     מספר עוסק מע"מ     baseline y ≈ 258
 *     מספר תיק ניכויים   baseline y ≈ 236
 *
 *   צ'קבוקסים (מרכז הריבוע):
 *     ☐ רישום מיוצג         cx=103, cy=296
 *     ☐ אני/אנחנו מאשר SMS  cx=539, cy=374
 *     ☐ אני מאשר ייפוי כוח  cx=539, cy=176
 *
 * drawLTR/drawHebrew עם anchor:'right' → x הוא הקצה הימני של הטקסט.
 * לכן עבור תיבות הספרות המרוכזות משתמשים ב-drawLTRCentered (מצב center).
 */
const FIELDS = {
  // ─── חלק א' — מולא ע"י הלקוח ────────────────────────────────────────────
  // שורה 1: אני, הח"מ — שם פרטי | שם משפחה | מספר זהות | טלפון נייד
  firstName:       { x: 535, y: 637, anchor: 'right' as const },
  lastName:        { x: 415, y: 637, anchor: 'right' as const },
  idNumber:        { x: 265, y: 637, anchor: 'right' as const },
  phone:           { x: 145, y: 637, anchor: 'right' as const },
  // שורה 2: כתובת | כתובת דואר אלקטרוני
  address:         { x: 535, y: 605, anchor: 'right' as const },
  email:           { x: 235, y: 605, anchor: 'right' as const },
  // שורה 3 (אופציונלי): פרטי בן/בת זוג
  spouseFirstName: { x: 535, y: 560, anchor: 'right' as const },
  spouseLastName:  { x: 350, y: 560, anchor: 'right' as const },
  spouseIdNumber:  { x: 160, y: 560, anchor: 'right' as const },
  // שורה 4: שם המייצג | סוג המייצג | מספר מייצג
  representativeName:   { x: 420, y: 530, anchor: 'right' as const },
  representativeType:   { x: 270, y: 530, anchor: 'right' as const },
  representativeNumber: { x: 120, y: 530, anchor: 'right' as const },
  // אישור SMS / מייל — מרכז הריבוע cx=539, cy=374 (גודל ריבוע ≈9pt → פינה שמאלית תחתונה 534.5, 369.5)
  smsCheckbox: { x: 535, y: 370, size: 9 },
  // שורת תחתית של חלק א': תאריך | חתימת בן זוג רשום | חתימת בן/בת זוג
  partAClientDate:      { x: 530, y: 345, anchor: 'right' as const },
  // החתימה הדיגיטלית של הלקוח (תמונה)
  partAClientSignature: { x: 280, y: 335, w: 120, h: 35 },

  // ─── חלק ב' — מולא ע"י המייצג ────────────────────────────────────────────
  // שמות הנישום/עוסק/מנכה — בצד ימין של כל שורה (right-anchored)
  taxpayerName:          { x: 530, y: 280, anchor: 'right' as const },
  dealerName:            { x: 530, y: 258, anchor: 'right' as const },
  withholdingPayerName:  { x: 530, y: 236, anchor: 'right' as const },
  // תיבות הספרות (קווקו) בחלק ב' — מרוכזות בין x=220 ל-x=350, center x=285
  // משתמשים ב-anchor:'center' כדי לכוון את הספרות למרכז תיבת הקווקו
  incomeTaxFileNumber:   { x: 285, y: 280, anchor: 'center' as const },
  vatDealerNumber:       { x: 285, y: 258, anchor: 'center' as const },
  withholdingFileNumber: { x: 285, y: 236, anchor: 'center' as const },
  // ☐ רישום מיוצג — מרכז cx=103, cy=296 → פינה שמאלית תחתונה x=98.5, y=291.5
  registrationCheckbox:    { x: 99, y: 292, size: 9 },
  // ☐ אני מאשר שייפוי הכוח המקורי — מרכז cx=539, cy=176 → פינה x=534.5, y=171.5
  originalConfirmCheckbox: { x: 535, y: 172, size: 9 },
  // שורת תחתית של חלק ב': תאריך | שם המשרד | חתימה וחותמת
  partBDate:      { x: 530, y: 150, anchor: 'right' as const },
  firmName:       { x: 330, y: 150, anchor: 'right' as const },
  partBAccountantSignature: { x: 30, y: 140, w: 130, h: 35 },
};

const TEXT_SIZE = 9;
const TEXT_COLOR = rgb(0, 0, 0);

let cachedFontBytes: ArrayBuffer | null = null;
let cachedTemplateBytes: ArrayBuffer | null = null;

async function loadAsset(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.arrayBuffer();
}

async function getTemplateBytes(): Promise<ArrayBuffer> {
  if (!cachedTemplateBytes) cachedTemplateBytes = await loadAsset(TEMPLATE_URL);
  return cachedTemplateBytes;
}

async function getFontBytes(): Promise<ArrayBuffer> {
  if (!cachedFontBytes) cachedFontBytes = await loadAsset(FONT_URL);
  return cachedFontBytes;
}

// ─── ציור טקסט על טופס RTL ──────────────────────────────────────────────────
//
// pdf-lib מצייר תווים תמיד משמאל לימין (LTR).
// לכן עבור טקסט עברי או מעורב צריך לעשות היפוך תווים מלא:
// כשהקורא סורק את הטופס מימין לשמאל, הוא פוגש את התווים בסדר הנכון.
//
// שלוש פונקציות ציור:
//   drawHebrew      – היפוך מלא + יישור ימני. לשדות עבריים (שם, כתובת, שם משרד).
//   drawLTR         – ללא היפוך, יישור ימני. לספרות/לטינית (ת.ז., טלפון, מייל, תאריך).
//   drawLTRCentered – ללא היפוך, מרכוז. לתיבות ספרות (מספרי תיק בחלק ב').

/**
 * הופך את סדר כל התווים (full visual reversal).
 * "רחוב הרצל 15, תל אביב" → "ביבא לת ,51 לצרה בוחר"
 * כשנצייר את זה LTR, קורא RTL יקרא: "רחוב הרצל 15, תל אביב"
 */
function reverseForRTL(text: string): string {
  return [...text].reverse().join('');
}

/** ציור טקסט עברי (כולל מעורב) — היפוך מלא + יישור ימני */
function drawHebrew(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size = TEXT_SIZE) {
  if (!text) return;
  const visual = reverseForRTL(text);
  const width = font.widthOfTextAtSize(visual, size);
  page.drawText(visual, { x: x - width, y, size, font, color: TEXT_COLOR });
}

/** ציור טקסט LTR (ספרות, לטינית, תאריכים) — ללא היפוך, יישור ימני */
function drawLTR(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size = TEXT_SIZE) {
  if (!text) return;
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: x - width, y, size, font, color: TEXT_COLOR });
}

/**
 * ציור טקסט LTR מרוכז — x הוא מרכז התיבה.
 * משמש לתיבות ספרות (קווקו) בחלק ב', שם רוצים את הספרות במרכז התיבה.
 */
function drawLTRCentered(page: PDFPage, text: string, cx: number, y: number, font: PDFFont, size = TEXT_SIZE) {
  if (!text) return;
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: cx - width / 2, y, size, font, color: TEXT_COLOR });
}

function drawCheckmark(page: PDFPage, x: number, y: number, size = 10) {
  // צייר V פשוט (שני קווים)
  page.drawLine({
    start: { x, y: y + size * 0.2 },
    end: { x: x + size * 0.4, y },
    thickness: 1.2,
    color: TEXT_COLOR,
  });
  page.drawLine({
    start: { x: x + size * 0.4, y },
    end: { x: x + size, y: y + size * 0.8 },
    thickness: 1.2,
    color: TEXT_COLOR,
  });
}

async function embedSignature(doc: PDFDocument, dataUrl: string) {
  if (!dataUrl) return null;
  // dataUrl format: data:image/png;base64,xxxx
  const base64 = dataUrl.split(',')[1];
  if (!base64) return null;
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return doc.embedPng(bytes);
}

function formatHebrewDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('he-IL'); // dd.mm.yyyy
}

function authoritiesNote(authorities: AuthorityKind[]): string {
  // הערה קצרה שמופיעה ליד שדות חלק ב' לציון אילו רשויות נבחרו
  const labels = {
    incomeTax: 'מס הכנסה',
    vat: 'מע"מ',
    withholding: 'ניכויים',
  } as const;
  return authorities.map(a => labels[a]).join(' / ');
}

export interface PdfGenerationInput {
  request: RepresentationRequest;
}

export async function generateSignedPoaPdf({ request }: PdfGenerationInput): Promise<Uint8Array> {
  if (!request.submission) throw new Error('אין נתוני מילוי של הלקוח');
  if (!request.partB) throw new Error('המייצג עדיין לא מילא את חלק ב\'');

  const [templateBytes, fontBytes] = await Promise.all([
    getTemplateBytes(),
    getFontBytes(),
  ]);

  const doc = await PDFDocument.load(templateBytes);
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes);
  const page = doc.getPage(0);

  const sub = request.submission;
  const part = request.partB;

  // ─── חלק א' — נתוני הלקוח ─────────────────────────────────────────────
  // שדות עבריים → drawHebrew (היפוך מלא)
  // שדות LTR (ספרות, לטינית, תאריכים) → drawLTR (ללא היפוך)
  drawHebrew(page, sub.firstName, FIELDS.firstName.x, FIELDS.firstName.y, font);
  drawHebrew(page, sub.lastName,  FIELDS.lastName.x,  FIELDS.lastName.y,  font);
  drawLTR(page, sub.idNumber,     FIELDS.idNumber.x,  FIELDS.idNumber.y,  font);
  drawLTR(page, sub.phone,        FIELDS.phone.x,     FIELDS.phone.y,     font);

  const fullAddress = [sub.address, sub.city].filter(Boolean).join(', ');
  drawHebrew(page, fullAddress, FIELDS.address.x, FIELDS.address.y, font);
  drawLTR(page, sub.email,     FIELDS.email.x,   FIELDS.email.y,   font);

  // שורת המייצג (נמשך מחלק ב')
  drawHebrew(page, part.firmName,             FIELDS.representativeName.x,   FIELDS.representativeName.y,   font);
  drawHebrew(page, part.representativeType,   FIELDS.representativeType.x,   FIELDS.representativeType.y,   font);
  drawLTR(page, part.representativeNumber,    FIELDS.representativeNumber.x, FIELDS.representativeNumber.y, font);

  if (sub.allowSmsEmail) {
    drawCheckmark(page, FIELDS.smsCheckbox.x, FIELDS.smsCheckbox.y, FIELDS.smsCheckbox.size);
  }

  // תאריך + חתימת לקוח
  drawLTR(page, formatHebrewDate(sub.signedAt), FIELDS.partAClientDate.x, FIELDS.partAClientDate.y, font);
  const clientSig = await embedSignature(doc, sub.signatureDataUrl);
  if (clientSig) {
    page.drawImage(clientSig, {
      x: FIELDS.partAClientSignature.x,
      y: FIELDS.partAClientSignature.y,
      width: FIELDS.partAClientSignature.w,
      height: FIELDS.partAClientSignature.h,
    });
  }

  // ─── חלק ב' — נתוני המייצג ─────────────────────────────────────────────
  const fullName = `${sub.firstName} ${sub.lastName}`.trim();
  // שמות נישום/עוסק/מנכה — right-anchored בצד ימין של כל שורה (x≈530)
  // מספרי תיק — מרוכזים בתוך תיבות הקווקו (center x≈285) באמצעות drawLTRCentered
  if (request.authorities.includes('incomeTax')) {
    drawHebrew(page, fullName, FIELDS.taxpayerName.x, FIELDS.taxpayerName.y, font);
    if (part.incomeTaxFileNumber) {
      drawLTRCentered(page, part.incomeTaxFileNumber, FIELDS.incomeTaxFileNumber.x, FIELDS.incomeTaxFileNumber.y, font);
    }
  }
  if (request.authorities.includes('vat')) {
    drawHebrew(page, fullName, FIELDS.dealerName.x, FIELDS.dealerName.y, font);
    if (part.vatDealerNumber) {
      drawLTRCentered(page, part.vatDealerNumber, FIELDS.vatDealerNumber.x, FIELDS.vatDealerNumber.y, font);
    }
  }
  if (request.authorities.includes('withholding')) {
    drawHebrew(page, fullName, FIELDS.withholdingPayerName.x, FIELDS.withholdingPayerName.y, font);
    if (part.withholdingFileNumber) {
      drawLTRCentered(page, part.withholdingFileNumber, FIELDS.withholdingFileNumber.x, FIELDS.withholdingFileNumber.y, font);
    }
  }

  // צ'קבוקס "רישום מיוצג"
  drawCheckmark(page, FIELDS.registrationCheckbox.x, FIELDS.registrationCheckbox.y, FIELDS.registrationCheckbox.size);
  // צ'קבוקס "אני מאשר שייפוי הכוח המקורי..."
  drawCheckmark(page, FIELDS.originalConfirmCheckbox.x, FIELDS.originalConfirmCheckbox.y, FIELDS.originalConfirmCheckbox.size);

  // תאריך + שם משרד + חתימת מייצג
  drawLTR(page, formatHebrewDate(part.signedAt), FIELDS.partBDate.x, FIELDS.partBDate.y, font);
  drawHebrew(page, part.firmName, FIELDS.firmName.x, FIELDS.firmName.y, font);

  const accSig = await embedSignature(doc, part.signatureDataUrl);
  if (accSig) {
    page.drawImage(accSig, {
      x: FIELDS.partBAccountantSignature.x,
      y: FIELDS.partBAccountantSignature.y,
      width: FIELDS.partBAccountantSignature.w,
      height: FIELDS.partBAccountantSignature.h,
    });
  }

  // הערה קטנה בתחתית — אילו רשויות נבחרו (חיווי לרו"ח)
  const note = `רשויות: ${authoritiesNote(request.authorities)}`;
  drawHebrew(page, note, 555, 25, font, 7);

  // למניעת אזהרה
  void PAGE_HEIGHT;

  return doc.save();
}

/** המרה ל-ArrayBuffer "טהור" (לא Shared) — פתרון לאי-תאימות טיפוסים בסביבות מסוימות */
export function toPureArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

/** הורדה ישירה של ה-PDF על ידי המשתמש */
export function downloadPdfBytes(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([toPureArrayBuffer(bytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
