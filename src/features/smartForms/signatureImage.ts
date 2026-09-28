// ─── חתימה כתמונה: חיתוך לגבולות הדיו ─────────────────────────────────────
// ‼ SignaturePad מחזיר קנבס ברוחב המסך וגובה 180 — רוב התמונה שוליים ריקים.
// בלי חיתוך, «התאמה למלבן» מקטינה את השוליים יחד עם הדיו, והחתימה יוצאת
// זעירה (במיוחד בקו החתימה של בן/בת הזוג, 104×16 נק'). החיתוך לדיו + שוליים
// קטנים שומר את יחס הגובה-רוחב של החתימה עצמה.

export class EmptySignatureError extends Error {
  constructor() { super('החתימה ריקה'); }
}

export interface TrimmedSignature {
  png: Uint8Array;
  dataUrl: string;
  width: number;
  height: number;
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('טעינת החתימה נכשלה'));
    img.src = src;
  });
}

/** חיתוך לדיו: פיקסל «דיו» = אטום מספיק וכהה מספיק (לא רקע לבן). */
export async function trimSignature(dataUrl: string, pad = 6): Promise<TrimmedSignature> {
  const img = await loadImage(dataUrl);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      const lum = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
      if (a > 24 && lum < 225) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new EmptySignatureError();
  const x0 = Math.max(0, minX - pad), y0 = Math.max(0, minY - pad);
  const x1 = Math.min(width, maxX + pad + 1), y1 = Math.min(height, maxY + pad + 1);
  const out = document.createElement('canvas');
  out.width = x1 - x0; out.height = y1 - y0;
  const octx = out.getContext('2d');
  if (!octx) throw new Error('canvas');
  // רקע שקוף: רק הדיו עובר (פיקסלים בהירים נמחקים), כדי שהחתימה לא תכסה את הקו המודפס.
  const src = ctx.getImageData(x0, y0, out.width, out.height);
  for (let i = 0; i < src.data.length; i += 4) {
    const lum = src.data[i] * 0.3 + src.data[i + 1] * 0.59 + src.data[i + 2] * 0.11;
    if (lum >= 225) src.data[i + 3] = 0;
  }
  octx.putImageData(src, 0, 0);
  const url = out.toDataURL('image/png');
  return { png: dataUrlToBytes(url), dataUrl: url, width: out.width, height: out.height };
}
