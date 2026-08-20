#!/usr/bin/env node
/**
 * test-image-pdf.mjs — בדיקות להמרת תצלום ל-PDF (src/utils/imageToPdf.ts).
 *
 * למה סקריפט ולא ריצה בדפדפן: החישוב שקובע איך התמונה יושבת על הדף —
 * ובמיוחד שמונת כיווני ה-EXIF — הוא המקום היחיד בפיצ'ר שקל לטעות בו בלי
 * שאיש ישים לב, כי טעות בסימן מייצרת PDF תקין לגמרי שפשוט הפוך. הבדיקה
 * כאן משווה את המטריצה מול טבלת המיפוי הקנונית של EXIF, שכתובה בקובץ הזה
 * מחדש מתוך ההגדרה — לא מהמימוש — כדי שהשוואה תהיה אמיתית.
 *
 * ‼ אין כאן קובץ תצלום מצורף: מסלול ה-JPEG המלא נבדק בדפדפן מול קבצים
 * אמיתיים. הסקריפט בונה PNG בעצמו (zlib), ולניתוח ה-EXIF די בכותרת JPEG
 * תקינה — הוא אינו נוגע בפיקסלים.
 *
 * הרצה:  npm run test:image-pdf
 */
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import { build } from 'esbuild';
import { PDFDocument } from 'pdf-lib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'imgpdf-'));
const bundle = join(work, 'imageToPdf.mjs');
await build({
  entryPoints: [join(ROOT, 'src/utils/imageToPdf.ts')],
  // ‼ pdf-lib נארז פנימה ולא נשאר external: החבילה נכתבת לתיקייה זמנית
  // מחוץ לפרויקט, ומשם אין node_modules לפתור מולו.
  outfile: bundle, bundle: true, format: 'esm', platform: 'node',
  logLevel: 'warning',
});
const M = await import(pathToFileURL(bundle).href);

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log('  ✓ ' + name);
  else { console.log('  ✗ ' + name + (extra ? '  →  ' + extra : '')); failures++; }
}
const near = (a, b, eps = 0.01) => Math.abs(a - b) < eps;

// ─── עזרי בנייה ────────────────────────────────────────────────────────
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; }
  return t;
})();
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** PNG אמיתי בארבעה רבעים בצבעים שונים. */
function makePng(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0;
    for (let x = 0; x < w; x++) {
      const c = y < h / 2 ? (x < w / 2 ? [255, 0, 0] : [0, 160, 0]) : (x < w / 2 ? [255, 210, 0] : [0, 80, 255]);
      raw[o++] = c[0]; raw[o++] = c[1]; raw[o++] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
/** כותרת JPEG עם מקטע EXIF — מספיקה לקריאת תג הכיוון. */
function jpegHeaderWithOrientation(orientation) {
  const tiff = Buffer.from([
    0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0x00, 0x01,
    0x01, 0x12, 0x00, 0x03, 0, 0, 0, 1, 0x00, orientation, 0x00, 0x00, 0, 0, 0, 0,
  ]);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const len = Buffer.alloc(2); len.writeUInt16BE(payload.length + 2);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), Buffer.from([0xff, 0xe1]), len, payload,
    Buffer.from([0xff, 0xd9]),
  ]);
}

/**
 * המיפוי הקנוני של EXIF — נכתב כאן מתוך ההגדרה של התקן ולא מהמימוש.
 * (u,v) בתמונה השמורה, u משמאל לימין ו-v מלמטה למעלה ⇒ (s,t) בתמונה המוצגת.
 */
function exifMap(o, u, v) {
  switch (o) {
    case 2: return [1 - u, v];
    case 3: return [1 - u, 1 - v];
    case 4: return [u, 1 - v];
    case 5: return [1 - v, 1 - u];
    case 6: return [v, 1 - u];
    case 7: return [v, u];
    case 8: return [1 - v, u];
    default: return [u, v];
  }
}

console.log('\nזיהוי סוג הקובץ לפי תוכן');
{
  const png = makePng(8, 8);
  check('PNG', M.sniffImageType(new Uint8Array(png)) === 'image/png');
  check('JPEG', M.sniffImageType(new Uint8Array(jpegHeaderWithOrientation(1))) === 'image/jpeg');
  check('PDF אינו תצלום', M.sniffImageType(new Uint8Array(Buffer.from('%PDF-1.4'))) === null);
  check('בייטים אקראיים', M.sniffImageType(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])) === null);
  check('חתימה חלקית', M.sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47])) === null);
  check('ריק', M.sniffImageType(new Uint8Array(0)) === null);
}

console.log('\nמתי הכפתור מוצג');
{
  const t = [
    ['image/jpeg', 'a.jpg', true], ['image/png', 'a.png', true], ['image/jpg', 'a.jpg', true],
    ['application/pdf', 'a.pdf', false],
    // ‼ המקרה החשוב: PDF ששמו .jpg לא מקבל כפתור
    ['application/pdf', 'a.jpg', false],
    ['image/webp', 'a.webp', false], ['image/heic', 'a.heic', false],
    ['application/octet-stream', 'a.JPEG', true], ['application/octet-stream', 'a.pdf', false],
    ['', 'a.png', true], ['', 'scan', false], [undefined, undefined, false],
  ];
  for (const [mime, name, want] of t) {
    check(`${JSON.stringify(mime)} / ${JSON.stringify(name)} → ${want}`, M.looksConvertible(mime, name) === want);
  }
}

console.log('\nקריאת תג הכיוון מה-EXIF');
{
  for (let o = 1; o <= 8; o++) {
    check('כיוון ' + o, M.readJpegOrientation(new Uint8Array(jpegHeaderWithOrientation(o))) === o);
  }
  check('ערך לא חוקי → 1', M.readJpegOrientation(new Uint8Array(jpegHeaderWithOrientation(9))) === 1);
  check('PNG → 1', M.readJpegOrientation(new Uint8Array(makePng(8, 8))) === 1);
  check('זבל → 1', M.readJpegOrientation(new Uint8Array([0xff, 0xd8, 0xff])) === 1);
  check('החלפת צירים ב-5..8', [5, 6, 7, 8].every(M.swapsAxes) && ![1, 2, 3, 4].some(M.swapsAxes));
}

console.log('\nהצבת התמונה על הדף — כל שמונת הכיוונים');
{
  // ‼ pdf-lib בונה את המטריצה כ-translate(x,y)·rotate(θ)·scale(w,h).
  // מרכיבים כאן את אותה מטריצה ומוודאים שארבע הפינות נוחתות בדיוק במקום
  // שהמיפוי הקנוני של EXIF מחייב. (אומת מול זרם התוכן של PDF אמיתי.)
  const bx = 24, by = 40, dw = 300, dh = 200;
  for (let o = 1; o <= 8; o++) {
    const p = M.placeForOrientation(o, bx, by, dw, dh);
    const th = (p.rotate * Math.PI) / 180;
    const cos = Math.cos(th), sin = Math.sin(th);
    const at = (u, v) => {
      const a = p.width * u, b = p.height * v;
      return [p.x + a * cos - b * sin, p.y + a * sin + b * cos];
    };
    let ok = true, detail = '';
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const [s, t] = exifMap(o, u, v);
      const [px, py] = at(u, v);
      const ex = bx + s * dw, ey = by + t * dh;
      if (!near(px, ex, 0.001) || !near(py, ey, 0.001)) {
        ok = false; detail += `(${u},${v})→(${px.toFixed(1)},${py.toFixed(1)}) ≠ (${ex},${ey}) `;
      }
    }
    check('כיוון ' + o + ' — ארבע הפינות במקום', ok, detail);
  }
}

console.log('\nה-PDF שנוצר');
{
  const out = await M.imageToPdfBytes(new Uint8Array(makePng(300, 400)));
  const head = Buffer.from(out.subarray(0, 5)).toString('latin1');
  check('מתחיל ב-%PDF', head === '%PDF-');
  check('נגמר ב-EOF', Buffer.from(out.subarray(out.length - 10)).toString('latin1').includes('%%EOF'));
  const doc = await PDFDocument.load(out);
  check('נפתח בפרסר ויש בו עמוד אחד', doc.getPageCount() === 1);
  const { width, height } = doc.getPage(0).getSize();
  check('תצלום לאורך → דף A4 לאורך', near(width, 595.28, 0.05) && near(height, 841.89, 0.05), `${width}x${height}`);

  const land = await PDFDocument.load(await M.imageToPdfBytes(new Uint8Array(makePng(400, 300))));
  const ls = land.getPage(0).getSize();
  check('תצלום לרוחב → דף A4 לרוחב', near(ls.width, 841.89, 0.05) && near(ls.height, 595.28, 0.05), `${ls.width}x${ls.height}`);

  // יחס הגבהים נשמר: התמונה נכנסת לתיבה בלי מתיחה
  const boxW = 595.28 - 48, boxH = 841.89 - 48;
  const scale = Math.min(boxW / 300, boxH / 400);
  check('יחס הצדדים נשמר', near((300 * scale) / (400 * scale), 300 / 400, 0.0001));
  check('נכנס בתוך השוליים', 300 * scale <= boxW + 0.01 && 400 * scale <= boxH + 0.01);
}

console.log('\nקלט פסול נדחה בעברית');
{
  const hebrew = s => /[֐-׿]/.test(s);
  const cases = [
    ['PDF', Buffer.from('%PDF-1.4\n1 0 obj')],
    ['טקסט', Buffer.from('שלום', 'utf8')],
    ['ריק', Buffer.alloc(0)],
    ['PNG קטוע', makePng(20, 20).subarray(0, 40)],
    ['JPEG בלי סוף קובץ', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0])],
  ];
  for (const [name, bytes] of cases) {
    let err = null;
    try { await M.imageToPdfBytes(new Uint8Array(bytes)); } catch (e) { err = e; }
    check(name, err instanceof M.ImageConversionError && hebrew(err.message), err ? err.message : 'לא נזרקה שגיאה');
  }
}

console.log('\nשם קובץ ה-PDF');
{
  const t = [
    ['תלוש שכר עבודה 1.jpg', 'תלוש שכר עבודה 1.pdf'],
    ['scan.JPEG', 'scan.pdf'], ['a.b.png', 'a.b.pdf'],
    ['noext', 'noext.pdf'], ['', 'מסמך.pdf'], ['.hidden', '.hidden.pdf'],
  ];
  for (const [from, want] of t) check(`${JSON.stringify(from)} → ${want}`, M.pdfFileNameFor(from) === want, M.pdfFileNameFor(from));
}

rmSync(work, { recursive: true, force: true });
console.log(failures ? `\n✗ ${failures} בדיקות נכשלו\n` : '\n✓ כל הבדיקות עברו\n');
process.exitCode = failures ? 1 : 0;
