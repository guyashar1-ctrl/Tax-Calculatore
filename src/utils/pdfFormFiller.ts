/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  Generic PDF Form Filler — Canvas-based Hebrew/LTR text rendering  ║
 * ╠══════════════════════════════════════════════════════════════════════╣
 * ║                                                                    ║
 * ║  Fills any PDF template by overlaying text as PNG images.          ║
 * ║  Solves the fundamental problem: pdf-lib cannot render Hebrew      ║
 * ║  (RTL) text natively. Instead, we render each field via an         ║
 * ║  offscreen <canvas>, which handles RTL/bidi perfectly, then        ║
 * ║  embed the canvas output as a PNG image at the correct position.   ║
 * ║                                                                    ║
 * ║  USAGE:                                                            ║
 * ║  ─────                                                             ║
 * ║  1. Create a FieldMap JSON describing each field's position.       ║
 * ║  2. Call fillPdfForm(templateUrl, fieldMap, data, signatures?)     ║
 * ║  3. Get back a Uint8Array of the filled PDF.                       ║
 * ║                                                                    ║
 * ║  FIELD TYPES:                                                      ║
 * ║  ────────────                                                      ║
 * ║  • "hebrew"   — RTL text, left-aligned at x. Canvas handles RTL.  ║
 * ║  • "ltr"      — LTR text (digits, email, dates), left-aligned.    ║
 * ║  • "centered" — LTR text centered at cx (for dashed number boxes).║
 * ║  • "checkbox" — V mark centered at (cx, cy).                      ║
 * ║  • "signature"— PNG image overlay at (x, y, w, h).                ║
 * ║                                                                    ║
 * ║  COORDINATE SYSTEM:                                                ║
 * ║  ──────────────────                                                ║
 * ║  PDF points: x=0 left edge, y=0 bottom edge. A4 = 595 × 842.     ║
 * ║  For text fields, y = the underline position on the form.          ║
 * ║  Text baseline sits ON this line, body extends above.              ║
 * ║                                                                    ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * @example
 * ```ts
 * import { fillPdfForm, FieldDefinition } from './pdfFormFiller';
 *
 * const fields: FieldDefinition[] = [
 *   { name: 'firstName', x: 435, y: 637, type: 'hebrew' },
 *   { name: 'idNumber',  x: 170, y: 637, type: 'ltr' },
 *   { name: 'tiqNumber', cx: 285, y: 280, type: 'centered' },
 *   { name: 'approve',   cx: 539, cy: 374, size: 9, type: 'checkbox' },
 *   { name: 'signature', x: 280, y: 335, w: 120, h: 35, type: 'signature' },
 * ];
 *
 * const data = { firstName: 'גיא', idNumber: '314667346', approve: true };
 * const signatures = { signature: 'data:image/png;base64,...' };
 *
 * const pdfBytes = await fillPdfForm('/templates/form.pdf', fields, data, signatures);
 * ```
 */

import { PDFDocument, rgb, PDFPage } from 'pdf-lib';

// ═══════════════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════════════

export interface FieldDefinition {
  /** Unique field name — must match a key in the data object */
  name: string;

  /**
   * Field type:
   * - "hebrew": RTL text rendered via canvas. Positioned left-aligned at x.
   * - "ltr": LTR text (digits, email, dates). Positioned left-aligned at x.
   * - "centered": LTR text centered horizontally at cx (for dashed number boxes).
   * - "checkbox": V checkmark centered at (cx, cy).
   * - "signature": PNG image overlay at (x, y) with dimensions (w, h).
   */
  type: 'hebrew' | 'ltr' | 'centered' | 'checkbox' | 'signature';

  /** Left edge x-coordinate (for hebrew/ltr fields) */
  x?: number;
  /** Baseline y-coordinate — the form underline where text sits */
  y?: number;
  /** Center x-coordinate (for centered/checkbox fields) */
  cx?: number;
  /** Center y-coordinate (for checkbox fields) */
  cy?: number;
  /** Width (for signature fields) */
  w?: number;
  /** Height (for signature fields) */
  h?: number;
  /** Checkbox size in pt (default 9) */
  size?: number;
  /** Font size override (default 10) */
  fontSize?: number;
}

export interface FillOptions {
  /** Font size for all text fields (default 10) */
  defaultFontSize?: number;
  /** Font family for canvas rendering (default 'Arial, sans-serif') */
  fontFamily?: string;
  /** Text color as hex (default '#000000') */
  textColor?: string;
  /** Canvas DPI scale factor for crisp rendering (default 3) */
  dpi?: number;
}

// ═══════════════════════════════════════════════════════════════════════
//  Canvas text renderer (runs in browser)
// ═══════════════════════════════════════════════════════════════════════

interface RenderedText {
  pngBytes: Uint8Array;
  width: number;
  height: number;
  baselineFromBottom: number;
}

/**
 * Renders a text string to a transparent PNG image using an offscreen canvas.
 * The canvas natively handles RTL/bidi, so Hebrew text renders correctly
 * without any manual character reversal.
 */
function renderTextToImage(
  text: string,
  options: {
    fontSize: number;
    fontFamily: string;
    color: string;
    rtl: boolean;
    dpi: number;
  }
): RenderedText {
  const { fontSize, fontFamily, color, rtl, dpi } = options;
  const fontSpec = `${fontSize * dpi}px ${fontFamily}`;

  // Measure text
  const mc = document.createElement('canvas');
  const mctx = mc.getContext('2d')!;
  mctx.font = fontSpec;
  const textWidth = Math.ceil(mctx.measureText(text).width / dpi);

  // Render
  const height = Math.ceil(fontSize * 1.4);
  const canvas = document.createElement('canvas');
  canvas.width = textWidth * dpi;
  canvas.height = height * dpi;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = fontSpec;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  const baselineY = Math.round(height * 0.78 * dpi);

  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = 'left';
  ctx.fillText(text, 0, baselineY);

  // Convert to PNG bytes
  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1];
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  return {
    pngBytes: bytes,
    width: textWidth,
    height,
    baselineFromBottom: height - height * 0.78,
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  Drawing helpers
// ═══════════════════════════════════════════════════════════════════════

function drawCheckmark(page: PDFPage, cx: number, cy: number, size: number) {
  const x = cx - size / 2;
  const y = cy - size / 2;
  page.drawLine({
    start: { x, y: y + size * 0.3 },
    end: { x: x + size * 0.35, y },
    thickness: 1.5,
    color: rgb(0, 0, 0),
  });
  page.drawLine({
    start: { x: x + size * 0.35, y },
    end: { x: x + size, y: y + size * 0.85 },
    thickness: 1.5,
    color: rgb(0, 0, 0),
  });
}

async function embedSignature(doc: PDFDocument, dataUrl: string) {
  const base64 = dataUrl.split(',')[1];
  if (!base64) return null;
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  try {
    return await doc.embedPng(bytes);
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  Main API
// ═══════════════════════════════════════════════════════════════════════

/**
 * Fills a PDF template with data according to a field map.
 *
 * @param templateUrl  URL or path to the PDF template (fetched via fetch())
 * @param fields       Array of field definitions with positions and types
 * @param data         Key-value map: field name → value (string for text, boolean for checkbox)
 * @param signatures   Optional key-value map: field name → data:image/png;base64,... string
 * @param options      Optional rendering options (font size, family, color)
 * @returns            Uint8Array of the filled PDF, ready for download or storage
 */
export async function fillPdfForm(
  templateUrl: string,
  fields: FieldDefinition[],
  data: Record<string, string | boolean | number>,
  signatures: Record<string, string> = {},
  options: FillOptions = {},
): Promise<Uint8Array> {
  const {
    defaultFontSize = 10,
    fontFamily = 'Arial, sans-serif',
    textColor = '#000000',
    dpi = 3,
  } = options;

  // Load template
  const res = await fetch(templateUrl);
  if (!res.ok) throw new Error(`Failed to load template: ${templateUrl} (${res.status})`);
  const templateBytes = await res.arrayBuffer();

  const doc = await PDFDocument.load(templateBytes);
  const page = doc.getPage(0);

  let filledCount = 0;

  for (const field of fields) {
    const value = data[field.name];

    // ── Checkbox ──────────────────────────────────────────────────────
    if (field.type === 'checkbox') {
      if (value && field.cx !== undefined && field.cy !== undefined) {
        drawCheckmark(page, field.cx, field.cy, field.size ?? 9);
        filledCount++;
      }
      continue;
    }

    // ── Signature ─────────────────────────────────────────────────────
    if (field.type === 'signature') {
      const sigUrl = signatures[field.name];
      if (sigUrl && field.x !== undefined && field.y !== undefined) {
        const img = await embedSignature(doc, sigUrl);
        if (img) {
          page.drawImage(img, {
            x: field.x,
            y: field.y,
            width: field.w ?? 130,
            height: field.h ?? 35,
          });
          filledCount++;
        }
      }
      continue;
    }

    // ── Text (hebrew / ltr / centered) ────────────────────────────────
    if (!value || typeof value === 'boolean') continue;
    const text = String(value);
    const fontSize = field.fontSize ?? defaultFontSize;
    const isHebrew = field.type === 'hebrew';

    const rendered = renderTextToImage(text, {
      fontSize,
      fontFamily,
      color: textColor,
      rtl: isHebrew,
      dpi,
    });

    const pngImage = await doc.embedPng(rendered.pngBytes);

    // Horizontal position
    let drawX: number;
    if (field.type === 'centered' && field.cx !== undefined) {
      drawX = field.cx - rendered.width / 2;
    } else {
      drawX = field.x ?? 0;
    }

    // Vertical: baseline aligns with form underline (field.y)
    const drawY = (field.y ?? 0) - rendered.baselineFromBottom;

    page.drawImage(pngImage, {
      x: drawX,
      y: drawY,
      width: rendered.width,
      height: rendered.height,
    });
    filledCount++;
  }

  return doc.save();
}

/**
 * Triggers a browser download of a PDF byte array.
 */
export function downloadPdf(pdfBytes: Uint8Array, fileName: string) {
  const buf = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(buf).set(pdfBytes);
  const blob = new Blob([buf], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
