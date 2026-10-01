// ─── בדיקת איכות להמרת תמונות ל-PDF — רצה בדפדפן (dev server) ─────────────
// נטען מתוך scripts/qa/run-pdf-conversion-qa.mjs ב-page.evaluate. בונה תמונות
// בדיקה בדפדפן עצמו (JPEG בשמונת כיווני EXIF, PNG שקוף/פלטה/16 ביט, WebP, BMP,
// HEIC אמיתי), ממיר אותן דרך buildDocumentPdf, ופותח את ה-PDF שנוצר ב-pdfjs:
// משווה את מה שמופיע בדף למה שהיה צריך להופיע (מיושר, בלי חיתוך ומתיחה).
// ‼ לא חלק מהאתר — אף קובץ באתר לא מייבא אותו.

import { buildDocumentPdf, buildDocumentPdfVersions, ImageConversionError, sniffFormat, fitOnA4, type FocusRegion } from '../../src/utils/imageToPdf';
import { loadPdf } from '../../src/utils/pdfRender';
import UPNG from '@pdf-lib/upng';
import { PDFDocument, StandardFonts } from 'pdf-lib';

type Canvas = HTMLCanvasElement;
const A4S = 595.28, A4L = 841.89, MARGIN = 24;

function canvas(w: number, h: number): Canvas { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

/** «מסמך» אסימטרי: חץ למעלה, פינות מסומנות, טקסט קטן, מעבר גוונים — כל טעות כיוון/חיתוך נראית. */
function drawDoc(w: number, h: number, opts: { transparent?: boolean; light?: boolean } = {}): Canvas {
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  const u = Math.min(w, h) / 100;
  if (!opts.transparent) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); }
  const ink = opts.light ? '#ffffff' : '#1a1a1a';
  g.strokeStyle = opts.light ? '#ffffff' : '#c0392b'; g.lineWidth = u * 1.2; g.strokeRect(u, u, w - 2 * u, h - 2 * u);
  g.fillStyle = opts.light ? '#ffffff' : '#2e86de';
  g.beginPath(); g.moveTo(w / 2, h * 0.12); g.lineTo(w / 2 + u * 10, h * 0.28); g.lineTo(w / 2 - u * 10, h * 0.28); g.closePath(); g.fill();
  g.fillRect(w / 2 - u * 3, h * 0.28, u * 6, h * 0.18);
  g.fillStyle = opts.light ? '#ffffff' : '#27ae60'; g.fillRect(u * 3, u * 3, u * 12, u * 12);           // ירוק = שמאל-למעלה
  g.fillStyle = opts.light ? '#ffffff' : '#f39c12'; g.fillRect(w - u * 15, h - u * 15, u * 12, u * 12);  // כתום = ימין-למטה
  g.fillStyle = ink; g.textBaseline = 'top';
  g.font = `bold ${Math.round(u * 6)}px Arial`; g.fillText('TOP', u * 18, u * 4);
  const sizes = [0.9, 1.1, 1.4, 1.8, 2.4];
  let y = h * 0.55;
  for (const s of sizes) {
    g.font = `${Math.max(7, Math.round(u * s))}px Arial`;
    g.fillText(`ID 0-1234567-8 · ${Math.round(u * s)}px · The quick brown fox 0123456789 — תעודת זהות`, u * 4, y);
    y += u * s * 1.6;
  }
  if (!opts.transparent) {
    const grd = g.createLinearGradient(0, 0, w, 0); grd.addColorStop(0, '#000'); grd.addColorStop(1, '#fff');
    g.fillStyle = grd; g.fillRect(u * 4, h * 0.88, w - u * 8, u * 4);
  }
  return c;
}

const toBytes = async (c: Canvas, type: string, q?: number) =>
  new Uint8Array(await (await new Promise<Blob>(r => c.toBlob(b => r(b!), type, q))).arrayBuffer());

/** ממיר מ-D (איך שהתמונה צריכה להיראות) ל-S (איך שהיא נשמרת), כך ש-EXIF o מחזיר את D. */
function storedFor(d: Canvas, o: number): Canvas {
  const W = d.width, H = d.height;
  const swap = o >= 5;
  const s = canvas(swap ? H : W, swap ? W : H);
  const g = s.getContext('2d')!;
  switch (o) {
    case 2: g.setTransform(-1, 0, 0, 1, W, 0); break;
    case 3: g.setTransform(-1, 0, 0, -1, W, H); break;
    case 4: g.setTransform(1, 0, 0, -1, 0, H); break;
    case 5: g.setTransform(0, 1, 1, 0, 0, 0); break;
    case 6: g.setTransform(0, -1, 1, 0, 0, W); break;   // מוצג = סיבוב 90° עם השעון של השמור
    case 7: g.setTransform(0, -1, -1, 0, H, W); break;
    case 8: g.setTransform(0, 1, -1, 0, H, 0); break;
    default: break;
  }
  g.drawImage(d, 0, 0);
  return s;
}

/** מקטע EXIF עם תג כיוון — מוזרק מיד אחרי SOI. */
function withExif(jpeg: Uint8Array, o: number): Uint8Array {
  const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0, 0, 0, 1, 0x00, o, 0x00, 0x00, 0, 0, 0, 0];
  const payload = [...'Exif'].map(ch => ch.charCodeAt(0)).concat([0, 0], tiff);
  const len = payload.length + 2;
  const app1 = new Uint8Array([0xff, 0xe1, len >> 8, len & 0xff, ...payload]);
  const out = new Uint8Array(jpeg.length + app1.length);
  out.set(jpeg.subarray(0, 2), 0); out.set(app1, 2); out.set(jpeg.subarray(2), 2 + app1.length);
  return out;
}

/** PNG של 16 ביט לערוץ (RGB) — נבנה ידנית; zlib דרך CompressionStream של הדפדפן. */
async function png16From(px: Uint8ClampedArray, w: number, h: number): Promise<Uint8Array> {
  const raw = new Uint8Array((w * 6 + 1) * h);
  for (let y = 0, o = 0; y < h; y++) {
    raw[o++] = 0;
    for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; for (let k = 0; k < 3; k++) { raw[o++] = px[i + k]; raw[o++] = px[i + k]; } }
  }
  const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (d: Uint8Array) => { let c = 0xffffffff; for (const v of d) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t: string, d: Uint8Array) => {
    const out = new Uint8Array(12 + d.length); const v = new DataView(out.buffer);
    v.setUint32(0, d.length); for (let i = 0; i < 4; i++) out[4 + i] = t.charCodeAt(i); out.set(d, 8);
    v.setUint32(8 + d.length, crc(out.subarray(4, 8 + d.length))); return out;
  };
  const ihdr = new Uint8Array(13); const iv = new DataView(ihdr.buffer); iv.setUint32(0, w); iv.setUint32(4, h); ihdr[8] = 16; ihdr[9] = 2;
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', z), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0); const out = new Uint8Array(total); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** BMP של 24 ביט — דפדפנים מפענחים, אבל canvas לא מייצר. */
function bmpFrom(c: Canvas): Uint8Array {
  const w = c.width, h = c.height, row = Math.ceil(w * 3 / 4) * 4;
  const px = c.getContext('2d')!.getImageData(0, 0, w, h).data;
  const buf = new Uint8Array(54 + row * h); const v = new DataView(buf.buffer);
  buf[0] = 0x42; buf[1] = 0x4d; v.setUint32(2, buf.length, true); v.setUint32(10, 54, true);
  v.setUint32(14, 40, true); v.setInt32(18, w, true); v.setInt32(22, h, true); v.setUint16(26, 1, true); v.setUint16(28, 24, true);
  v.setUint32(34, row * h, true);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((h - 1 - y) * w + x) * 4, d = 54 + y * row + x * 3;
    buf[d] = px[s + 2]; buf[d + 1] = px[s + 1]; buf[d + 2] = px[s];
  }
  return buf;
}

function onBackground(c: Canvas, gray: number): Canvas {
  const o = canvas(c.width, c.height); const g = o.getContext('2d')!;
  g.fillStyle = `rgb(${gray},${gray},${gray})`; g.fillRect(0, 0, o.width, o.height); g.drawImage(c, 0, 0); return o;
}

/** מרנדר עמוד ומחזיר את התמונה בתוך המסגרת הצפויה, באותן מידות כמו `expect`. */
async function renderPageCrop(pdfBytes: Uint8Array, pageIndex: number, expect: Canvas, widthPx = 1400):
  Promise<{ crop: Canvas; page: Canvas; pageW: number; pageH: number }> {
  const { doc } = await loadPdf(pdfBytes);
  const page = await doc.getPage(pageIndex + 1);
  const vp1 = page.getViewport({ scale: 1 });
  const scale = widthPx / vp1.width;
  const vp = page.getViewport({ scale });
  const pc = canvas(Math.round(vp.width), Math.round(vp.height));
  await page.render({ canvasContext: pc.getContext('2d')!, viewport: vp, canvas: pc } as never).promise;
  const pageW = vp1.width, pageH = vp1.height;
  const k = Math.min((pageW - 2 * MARGIN) / expect.width, (pageH - 2 * MARGIN) / expect.height);
  const bw = expect.width * k, bh = expect.height * k;
  const bx = (pageW - bw) / 2, by = (pageH - bh) / 2;
  const crop = canvas(expect.width, expect.height);
  crop.getContext('2d')!.drawImage(pc, bx * scale, by * scale, bw * scale, bh * scale, 0, 0, expect.width, expect.height);
  return { crop, page: pc, pageW, pageH };
}

/** הבדל ממוצע (0..1) בין שתי תמונות, אחרי הקטנה לאותו גודל. */
function diff(a: Canvas, b: Canvas, size = 320): number {
  const k = size / Math.max(a.width, a.height);
  const w = Math.max(8, Math.round(a.width * k)), h = Math.max(8, Math.round(a.height * k));
  const pa = canvas(w, h), pb = canvas(w, h);
  pa.getContext('2d')!.drawImage(a, 0, 0, w, h); pb.getContext('2d')!.drawImage(b, 0, 0, w, h);
  const da = pa.getContext('2d')!.getImageData(0, 0, w, h).data, db = pb.getContext('2d')!.getImageData(0, 0, w, h).data;
  let s = 0; for (let i = 0; i < da.length; i += 4) s += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
  return s / (w * h * 3 * 255);
}

const thumb = (c: Canvas, max = 220) => {
  const k = max / Math.max(c.width, c.height); const t = canvas(Math.round(c.width * k), Math.round(c.height * k));
  t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height); return t.toDataURL('image/png');
};
/** חיתוך ברזולוציה מלאה של אזור הטקסט הקטן — לבדיקה בעין. */
const textCrop = (c: Canvas) => {
  const u = Math.min(c.width, c.height) / 100;
  const x = 0, y = Math.round(c.height * 0.55 - u), w = Math.min(c.width, Math.round(u * 70)), h = Math.round(u * 13);
  const t = canvas(w, h); t.getContext('2d')!.drawImage(c, x, y, w, h, 0, 0, w, h); return t.toDataURL('image/png');
};

/** APNG ממסגרות קנבס (acTL/fcTL/fdAT) — Chrome לא מייצר קבצים מונפשים בעצמו. */
async function apngFrom(frames: Canvas[]): Promise<Uint8Array> {
  const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (d: Uint8Array) => { let c = 0xffffffff; for (const v of d) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t: string, d: Uint8Array) => {
    const o = new Uint8Array(12 + d.length); const v = new DataView(o.buffer);
    v.setUint32(0, d.length); for (let i = 0; i < 4; i++) o[4 + i] = t.charCodeAt(i); o.set(d, 8);
    v.setUint32(8 + d.length, crc(o.subarray(4, 8 + d.length))); return o;
  };
  const chunksOf = (p: Uint8Array) => {
    const r: { t: string; d: Uint8Array }[] = []; const v = new DataView(p.buffer, p.byteOffset);
    for (let o = 8; o < p.length;) { const len = v.getUint32(o); r.push({ t: String.fromCharCode(...p.subarray(o + 4, o + 8)), d: p.subarray(o + 8, o + 8 + len) }); o += 12 + len; }
    return r;
  };
  const parsed = (await Promise.all(frames.map(f => toBytes(f, 'image/png')))).map(chunksOf);
  const ihdr = parsed[0].find(c => c.t === 'IHDR')!.d; const iv = new DataView(ihdr.buffer, ihdr.byteOffset);
  const w = iv.getUint32(0), h = iv.getUint32(4);
  let seq = 0;
  const fctl = () => { const d = new Uint8Array(26); const v = new DataView(d.buffer); v.setUint32(0, seq++); v.setUint32(4, w); v.setUint32(8, h); v.setUint16(20, 1); v.setUint16(22, 1); return chunk('fcTL', d); };
  const actl = new Uint8Array(8); new DataView(actl.buffer).setUint32(0, frames.length);
  const parts: Uint8Array[] = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('acTL', actl)];
  parsed.forEach((cs, i) => {
    parts.push(fctl());
    for (const c of cs.filter(x => x.t === 'IDAT')) {
      if (i === 0) parts.push(chunk('IDAT', c.d));
      else { const d = new Uint8Array(4 + c.d.length); new DataView(d.buffer).setUint32(0, seq++); d.set(c.d, 4); parts.push(chunk('fdAT', d)); }
    }
  });
  parts.push(chunk('IEND', new Uint8Array(0)));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** אזור מעמוד ב-PDF, ברזולוציית המקור — כמו בחלון ההשוואה. */
async function regionPng(pdfBytes: Uint8Array, r: FocusRegion, scale: number): Promise<string> {
  const { doc } = await loadPdf(pdfBytes);
  const page = await doc.getPage(r.page + 1);
  const full = page.getViewport({ scale });
  const x0 = Math.round(r.x * full.width), y0 = Math.round(r.y * full.height);
  const w = Math.max(1, Math.round(r.w * full.width)), h = Math.max(1, Math.round(r.h * full.height));
  const c = canvas(w, h);
  await page.render({ canvasContext: c.getContext('2d')!, viewport: page.getViewport({ scale, offsetX: -x0, offsetY: -y0 }), canvas: c } as never).promise;
  return c.toDataURL('image/png');
}

export interface QaCase {
  name: string; ok: boolean; detail: string; ms: number;
  pages?: number; bytes?: number; diffs?: number[]; expectThumb?: string; gotThumb?: string;
  pageThumb?: string; textExpect?: string; textGot?: string; notes?: string[]; lossless?: boolean;
  error?: { code: string; message: string; next: string };
}

export async function runPdfConversionQa(heicBase64: string): Promise<QaCase[]> {
  const out: QaCase[] = [];
  const MAXB = 30 * 1024 * 1024;

  async function convertCase(name: string, parts: Uint8Array[], expects: Canvas[], opts: { maxBytes?: number; maxDiff?: number; expectNote?: RegExp } = {}) {
    const t0 = performance.now();
    try {
      const r = await buildDocumentPdf(parts, { maxBytes: opts.maxBytes ?? MAXB });
      const diffs: number[] = []; let got: Canvas | null = null; let pageCanvas: Canvas | null = null;
      for (let i = 0; i < expects.length; i++) {
        const big = Math.max(expects[i].width, expects[i].height) > 2000 ? 1800 : 1400;
        const { crop, page } = await renderPageCrop(r.bytes, i, expects[i], big);
        diffs.push(diff(expects[i], crop));
        if (i === 0) { got = crop; pageCanvas = page; }
      }
      const maxDiff = opts.maxDiff ?? 0.04;
      const pagesOk = r.pageCount === expects.length;
      const noteOk = !opts.expectNote || r.notes.some(n => opts.expectNote!.test(n));
      out.push({
        name, ok: pagesOk && diffs.every(d => d <= maxDiff) && noteOk && r.bytes.length <= (opts.maxBytes ?? MAXB),
        detail: `${r.pageCount} עמ׳ · ${(r.bytes.length / 1048576).toFixed(2)}MB · הבדל ${diffs.map(d => (d * 100).toFixed(1) + '%').join(' / ')}${noteOk ? '' : ' · חסרה הערה'}`,
        ms: Math.round(performance.now() - t0), pages: r.pageCount, bytes: r.bytes.length, diffs,
        expectThumb: thumb(expects[0]), gotThumb: got ? thumb(got) : undefined, pageThumb: pageCanvas ? thumb(pageCanvas, 260) : undefined,
        notes: r.notes, lossless: r.lossless,
      });
      return r;
    } catch (e) {
      const err = e instanceof ImageConversionError ? { code: e.code, message: e.message, next: e.next } : { code: 'exception', message: String((e as Error)?.message ?? e), next: '' };
      out.push({ name, ok: false, detail: `נכשל: ${err.message}`, ms: Math.round(performance.now() - t0), error: err });
      return null;
    }
  }

  async function errorCase(name: string, parts: Uint8Array[], wantCode: string) {
    const t0 = performance.now();
    try {
      await buildDocumentPdf(parts, { maxBytes: MAXB });
      out.push({ name, ok: false, detail: 'הצליח — והיה צריך להיכשל', ms: Math.round(performance.now() - t0) });
    } catch (e) {
      const err = e instanceof ImageConversionError ? { code: e.code, message: e.message, next: e.next } : { code: 'exception', message: String(e), next: '' };
      out.push({ name, ok: err.code === wantCode && /[֐-׿]/.test(err.message) && !!err.next,
        detail: `${err.code}: ${err.message} → ${err.next}`, ms: Math.round(performance.now() - t0), error: err });
    }
  }

  // 1 · צילום טלפון 12MP, JPEG רגיל — וזום 1:1 על הטקסט הקטן ביותר (8px בתמונה)
  const phone = drawDoc(3024, 4032);
  const phoneJpg = await toBytes(phone, 'image/jpeg', 0.92);
  const pr = await convertCase('JPG · צילום טלפון 12MP (3024×4032)', [phoneJpg], [phone], { maxDiff: 0.03 });
  if (pr) {
    // רינדור ה-PDF ברזולוציה שבה התמונה חוזרת לגודלה המקורי, וחיתוך אותו אזור משני הצדדים.
    const { doc } = await loadPdf(pr.bytes);
    const page = await doc.getPage(1); const vp1 = page.getViewport({ scale: 1 });
    const k = Math.min((vp1.width - 2 * MARGIN) / phone.width, (vp1.height - 2 * MARGIN) / phone.height);
    const scale = 1 / k;   // נקודת PDF אחת ⇒ פיקסל מקור אחד
    const vp = page.getViewport({ scale });
    const pc = canvas(Math.round(vp.width), Math.round(vp.height));
    await page.render({ canvasContext: pc.getContext('2d')!, viewport: vp, canvas: pc } as never).promise;
    const bx = ((vp1.width - phone.width * k) / 2) * scale, by = ((vp1.height - phone.height * k) / 2) * scale;
    const u = phone.width / 100, y0 = Math.round(phone.height * 0.55 - u * 0.5), cw = Math.round(u * 62), ch = Math.round(u * 9);
    const a = canvas(cw, ch), b = canvas(cw, ch);
    a.getContext('2d')!.drawImage(phone, 0, y0, cw, ch, 0, 0, cw, ch);
    b.getContext('2d')!.drawImage(pc, bx, by + y0, cw, ch, 0, 0, cw, ch);
    const last = out[out.length - 1];
    last.textExpect = a.toDataURL('image/png'); last.textGot = b.toDataURL('image/png');
    last.detail += ` · זום 1:1 על הטקסט הקטן: הבדל ${(diff(a, b, 600) * 100).toFixed(1)}%`;
  }

  // 2 · שמונת כיווני EXIF
  const up = drawDoc(1200, 900);
  for (const o of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const stored = storedFor(up, o);
    const bytes = withExif(await toBytes(stored, 'image/jpeg', 0.95), o);
    await convertCase(`JPG · כיוון EXIF ${o}${o === 6 ? ' (טלפון לאורך)' : o === 3 ? ' (הפוך)' : o === 8 ? ' (שוכב)' : ''}`, [bytes], [up]);
  }

  // 3 · PNG צילום מסך עם טקסט קטן
  const shot = drawDoc(1170, 2532);
  await convertCase('PNG · צילום מסך (1170×2532), טקסט קטן', [await toBytes(shot, 'image/png')], [shot], { maxDiff: 0.02 });

  // 4 · שקיפות: תוכן כהה ⇒ רקע לבן; תוכן בהיר ⇒ רקע אפור
  const darkT = drawDoc(900, 1200, { transparent: true });
  await convertCase('PNG שקוף · תוכן כהה (⇐ רקע לבן)', [await toBytes(darkT, 'image/png')], [onBackground(darkT, 255)], { maxDiff: 0.02 });
  const lightT = drawDoc(900, 1200, { transparent: true, light: true });
  await convertCase('PNG שקוף · תוכן לבן (⇐ רקע אפור, התוכן נשאר גלוי)', [await toBytes(lightT, 'image/png')], [onBackground(lightT, 112)], { maxDiff: 0.02, expectNote: /רקע אפור/ });

  // 5 · PNG פלטה ו-16 ביט
  const pal = drawDoc(800, 600);
  const palRgba = pal.getContext('2d')!.getImageData(0, 0, 800, 600).data.buffer;
  await convertCase('PNG · פלטת צבעים (256)', [new Uint8Array(UPNG.encode([palRgba], 800, 600, 256))], [pal], { maxDiff: 0.05 });
  const d16 = drawDoc(600, 450);
  const px = d16.getContext('2d')!.getImageData(0, 0, 600, 450).data;
  const png16 = await png16From(px, 600, 450);
  await convertCase('PNG · 16 ביט לערוץ', [png16], [d16], { maxDiff: 0.03 });

  // 6 · WebP, BMP
  const wp = drawDoc(1600, 1200);
  const webp = await toBytes(wp, 'image/webp', 0.9);
  await convertCase(`WebP · ${sniffFormat(webp) === 'webp' ? 'אמיתי' : 'לא נוצר!'} (1600×1200)`, [webp], [wp], { maxDiff: 0.03 });
  const bm = drawDoc(640, 480);
  await convertCase('BMP · 24 ביט', [bmpFrom(bm)], [bm], { maxDiff: 0.02 });

  // 7 · HEIC אמיתי (example.heic של libheif)
  const heic = Uint8Array.from(atob(heicBase64), ch => ch.charCodeAt(0));
  {
    // הצפוי: פענוח עצמאי של אותו קובץ (התמונה הראשית) ישר מ-libheif, בלי שום קוד שלנו בדרך.
    // ‼ 211 · כל התמונות הראשיות שבקובץ — הראשית קודם. example.heic מכיל שתיים.
    const lib = (await import('libheif-js/libheif-wasm/libheif-bundle.mjs')).default();
    const imgs = new lib.HeifDecoder().decode(heic);
    const prim = imgs.find(i => i.is_primary()) ?? imgs[0];
    const expects: Canvas[] = [];
    for (const im of [prim, ...imgs.filter(i => i !== prim)]) {
      const w = im.get_width(), h = im.get_height();
      const target = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
      await new Promise(res => im.display(target, res));
      const e = canvas(w, h); const ctx = e.getContext('2d')!;
      const id = ctx.createImageData(w, h); id.data.set(target.data); ctx.putImageData(id, 0, 0);
      expects.push(e);
    }
    await convertCase(`HEIC · קובץ אמיתי עם ${expects.length} תמונות ⇒ ${expects.length} עמודים, מול פענוח עצמאי`, [heic], expects,
      { maxDiff: 0.02, expectNote: expects.length > 1 ? /תמונות/ : undefined });
  }

  // 8 · שני צדי תעודה ⇒ PDF אחד, לפי הסדר
  const front = drawDoc(1600, 1000), back = drawDoc(1000, 1600);
  const backStored = withExif(await toBytes(storedFor(back, 6), 'image/jpeg', 0.93), 6);
  await convertCase('שני צדדים · קדמי JPG + אחורי JPG מסובב ⇒ 2 עמודים בסדר', [await toBytes(front, 'image/jpeg', 0.93), backStored], [front, back]);

  // 9 · JPG + PDF קיים ⇒ עמודי ה-PDF נשמרים כמו שהם
  {
    const p = await PDFDocument.create(); const f = await p.embedFont(StandardFonts.Helvetica);
    const pg = p.addPage([A4S, A4L]); pg.drawText('EXISTING PDF PAGE', { x: 60, y: 700, size: 28, font: f });
    const pdfPart = new Uint8Array(await p.save());
    const j = drawDoc(1200, 1600);
    const t0 = performance.now();
    const r = await buildDocumentPdf([await toBytes(j, 'image/jpeg', 0.92), pdfPart], { maxBytes: MAXB });
    out.push({ name: 'JPG + קובץ PDF קיים ⇒ 2 עמודים', ok: r.pageCount === 2, detail: `${r.pageCount} עמ׳`, ms: Math.round(performance.now() - t0) });
  }

  // 10 · קצוות: תמונה זעירה, פנורמה קיצונית
  const tiny = drawDoc(60, 40);
  await convertCase('תמונה זעירה 60×40', [await toBytes(tiny, 'image/png')], [tiny], { maxDiff: 0.08 });
  const pano = drawDoc(4000, 500);
  await convertCase('פנורמה 4000×500 (בלי חיתוך)', [await toBytes(pano, 'image/jpeg', 0.92)], [pano], { maxDiff: 0.05 });

  // 11 · ‼ 211 · שתי גרסאות: מקור (תמיד, בלי אובדן כשאפשר) + גרסת הגשה רק כשצריך.
  // תקרה מוקטנת בכמה מקרים (מסומן בשם) — כדי לבדוק כל שלב בסולם בלי קבצים של 100MB.
  async function versionsCase(name: string, files: Uint8Array[], maxBytes: number,
    want: 'same' | 'auto' | 'review-recompressed' | 'review-downscaled' | 'too_large') {
    const t0 = performance.now();
    try {
      const v = await buildDocumentPdfVersions(files, { maxBytes });
      const sub = v.submission;
      const got = !sub ? 'same' : !sub.needsReview ? 'auto' : sub.mode === 'downscaled' ? 'review-downscaled' : 'review-recompressed';
      const checks: string[] = [];
      if (sub && sub.result.pageCount !== v.original.pageCount) checks.push('מספר עמודים שונה');
      if (sub && sub.result.bytes.length > maxBytes) checks.push('גרסת ההגשה מעל התקרה');
      if (!sub && v.original.bytes.length > maxBytes) checks.push('המקור מעל התקרה ובכל זאת «same»');
      if (sub?.mode === 'downscaled' && !sub.needsReview) checks.push('הקטנה עברה בלי בדיקה!');
      if (sub && !sub.focus.length) checks.push('אין אזורים להשוואה');
      const meta = sub ? sub.pagesMeta.map(p => `${p.srcW}×${p.srcH}⇠${p.outW}×${p.outH} q${Math.round(p.quality * 100)}`).join(', ') : '';
      const c: QaCase = {
        name, ok: got === want && !checks.length,
        detail: `מקור ${(v.original.bytes.length / 1048576).toFixed(2)}MB${v.original.lossless ? ' בלי אובדן' : ''} · ${got}${sub ? ` · הגשה ${(sub.result.bytes.length / 1048576).toFixed(2)}MB, ${meta}` : ''}${checks.length ? ' · ✗ ' + checks.join('; ') : ''}`,
        ms: Math.round(performance.now() - t0), notes: [...v.original.notes, ...(sub?.result.notes ?? [])],
      };
      if (sub?.focus[0]) {
        const r = sub.focus[0]; const m = sub.pagesMeta.find(p => p.page === r.page) ?? sub.pagesMeta[0];
        const scale = Math.min(12, m.srcW / fitOnA4(m.srcW, m.srcH).dw);
        c.textExpect = await regionPng(v.original.bytes, r, scale); c.textGot = await regionPng(sub.result.bytes, r, scale);
      }
      out.push(c);
    } catch (e) {
      const err = e instanceof ImageConversionError ? { code: e.code, message: e.message, next: e.next } : { code: 'exception', message: String((e as Error)?.message ?? e), next: '' };
      out.push({ name, ok: want === 'too_large' && err.code === 'too_large' && /מותר עד/.test(err.message), detail: `${err.code}: ${err.message} → ${err.next}`,
        ms: Math.round(performance.now() - t0), error: err });
    }
  }
  {
    // סריקת A4 ב-600dpi עם טקסט קטן — בלי אובדן, עומדת בתקרה ⇒ המקור הוא קובץ ההגשה.
    const W = 4961, H = 7016; const scan = drawDoc(W, H); const g = scan.getContext('2d')!;
    const img = g.getImageData(0, 0, W, H);
    for (let i = 0; i < img.data.length; i += 4) { const n = ((Math.random() - 0.5) * 22) | 0; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
    g.putImageData(img, 0, 0);
    const scanPng = await toBytes(scan, 'image/png');
    await versionsCase(`גרסאות · סריקת A4 600dpi (${(scanPng.length / 1048576).toFixed(0)}MB PNG) ⇒ המקור הוא גם קובץ ההגשה`, [scanPng], MAXB, 'same');
    // אותה סריקה, תקרה נמוכה מהמקור: פיקסלים שפוענחו ⇒ JPEG 95% ברזולוציה מלאה — אוטומטי.
    const limitAuto = 14 * 1048576;   // מתחת למקור (~21MB בלי אובדן), מעל JPEG 95%
    await versionsCase(`גרסאות · אותה סריקה, תקרה ${(limitAuto / 1048576).toFixed(1)}MB ⇒ JPEG 95% ברזולוציה מלאה, אוטומטי`, [scanPng], limitAuto, 'auto');
    // JPG מקורי מעל התקרה ⇒ דחיסה מחדש של JPEG מקורי — לא אוטומטי.
    const jpg = await toBytes(scan, 'image/jpeg', 0.99);
    await versionsCase(`גרסאות · JPG מקורי ${(jpg.length / 1048576).toFixed(1)}MB, תקרה ${(jpg.length * 0.8 / 1048576).toFixed(1)}MB ⇒ דחיסה מחדש, לבדיקה`, [jpg], Math.round(jpg.length * 0.8), 'review-recompressed');
    // תקרה שרק הקטנה עומדת בה ⇒ מוקטן — תמיד לבדיקה.
    await versionsCase(`גרסאות · תקרה ${(jpg.length * 0.25 / 1048576).toFixed(1)}MB ⇒ הקטנה ל-300dpi, תמיד לבדיקה`, [jpg], Math.round(jpg.length * 0.25), 'review-downscaled');
    // גם הקטנה לא עומדת ⇒ שגיאה גלויה עם מספרים — לא PDF «שעובר».
    await versionsCase('גרסאות · תקרה 0.2MB ⇒ «גדול מדי» גם אחרי הקטנה', [jpg], Math.round(0.2 * 1048576), 'too_large');
  }

  // 11ב · כמה פריימים בקובץ אחד — כל פריים עמוד; יותר מ-10 ⇒ הסבר. לעולם לא «הראשון» בשקט.
  {
    const fr = [0, 1, 2].map(i => { const c = drawDoc(900, 600); const g = c.getContext('2d')!; g.fillStyle = '#8e44ad'; g.font = 'bold 80px Arial'; g.fillText(`${i + 1}`, 420, 260); return c; });
    await convertCase('APNG · 3 פריימים ⇒ 3 עמודים, בסדר', [await apngFrom(fr)], fr, { maxDiff: 0.04, expectNote: /3 פריימים/ });
    const many = Array.from({ length: 12 }, () => drawDoc(200, 150));
    await errorCase('APNG · 12 פריימים ⇒ הסבר, לא «הראשון»', [await apngFrom(many)], 'too_many_frames');
  }

  // 12 · קבצים פגומים / לא נתמכים — הסבר ודרך להמשך, בלי PDF חלקי
  const goodJpg = await toBytes(drawDoc(800, 600), 'image/jpeg', 0.9);
  await errorCase('JPG קטוע (הועלה חצי)', [goodJpg.subarray(0, Math.floor(goodJpg.length * 0.6))], 'truncated');
  await errorCase('זבל עם סיומת jpg', [crypto.getRandomValues(new Uint8Array(4096))], 'unsupported');
  await errorCase('SVG', [new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>')], 'unsupported');
  await errorCase('TIFF (כרום לא פותח)', [new Uint8Array([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0, 0, 0, 0, 0])], 'unsupported');
  await errorCase('קובץ ריק', [new Uint8Array(0)], 'empty');
  await errorCase('HEIC פגום (חתוך)', [heic.subarray(0, 4000)], 'corrupt');
  await errorCase('שני צדדים כשהשני פגום ⇒ אין PDF חלקי', [goodJpg, goodJpg.subarray(0, 900)], 'truncated');
  return out;
}
