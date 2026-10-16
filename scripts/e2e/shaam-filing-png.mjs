// קריאה/כתיבה של PNG בלי תלות (zlib בלבד) — להשחרה אמיתית של פרטים בצילומי המדריך (הפיקסלים עצמם מוחלפים,
// לא שכבת HTML מעליהם). תומך ב-PNG 8 ביט, RGB/RGBA, בלי שזירה — כמו צילומי המסך של ווינדוס.
import { inflateSync, deflateSync } from 'node:zlib';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not png');
  let off = 8, w = 0, h = 0, depth = 0, ctype = 0, inter = 0; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; inter = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || ![2, 6].includes(ctype) || inter) throw new Error(`unsupported png depth=${depth} type=${ctype} interlace=${inter}`);
  const bpp = ctype === 6 ? 4 : 3, stride = w * bpp, raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) { const s = x * bpp, d = (y * w + x) * 4; px[d] = line[s]; px[d + 1] = line[s + 1]; px[d + 2] = line[s + 2]; px[d + 3] = bpp === 4 ? line[s + 3] : 255; }
    prev = line;
  }
  return { width: w, height: h, data: px };
}

export function encodePng({ width, height, data }) {
  const stride = width * 3, raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 1; // Sub
    for (let x = 0; x < width; x++) for (let k = 0; k < 3; k++) {
      const cur = data[(y * width + x) * 4 + k], left = x ? data[(y * width + x - 1) * 4 + k] : 0;
      raw[y * (stride + 1) + 1 + x * 3 + k] = (cur - left) & 0xff;
    }
  }
  const chunk = (type, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), d]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** מילוי מלבן [x, y, w, h] בצבע אחיד (ברירת מחדל — שחור, כמו רקע המסוף). */
export function fill(img, [x, y, w, h], rgb = [0, 0, 0]) {
  for (let yy = Math.max(0, y); yy < Math.min(img.height, y + h); yy++)
    for (let xx = Math.max(0, x); xx < Math.min(img.width, x + w); xx++) { const d = (yy * img.width + xx) * 4; img.data[d] = rgb[0]; img.data[d + 1] = rgb[1]; img.data[d + 2] = rgb[2]; img.data[d + 3] = 255; }
}

/** האם כל המלבן בצבע אחיד — לאימות שההשחרה נצרבה בקובץ. */
export function isSolid(img, [x, y, w, h], rgb = [0, 0, 0]) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const d = (yy * img.width + xx) * 4; if (img.data[d] !== rgb[0] || img.data[d + 1] !== rgb[1] || img.data[d + 2] !== rgb[2]) return false; }
  return true;
}

export function crop(img, [x, y, w, h]) {
  const out = { width: w, height: h, data: Buffer.alloc(w * h * 4) };
  for (let yy = 0; yy < h; yy++) img.data.copy(out.data, yy * w * 4, ((y + yy) * img.width + x) * 4, ((y + yy) * img.width + x + w) * 4);
  return out;
}
