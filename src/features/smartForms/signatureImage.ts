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

/**
 * השוליים השקופים סביב הדיו בכל חתימה חתוכה — **תמיד** בדיוק הערך הזה, מכל צד
 * (גם כשהדיו נגע בקצה הקנבס). כך הייצוא יודע איפה הדיו בתוך התמונה ומניח
 * אותו על קו החתימה (exportPdf.signatureAnnotation).
 */
export const SIGNATURE_PAD_PX = 6;

/** חיתוך לדיו: פיקסל «דיו» = אטום מספיק וכהה מספיק (לא רקע לבן). */
export async function trimSignature(dataUrl: string, pad = SIGNATURE_PAD_PX): Promise<TrimmedSignature> {
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
  const inkW = maxX - minX + 1, inkH = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = inkW + pad * 2; out.height = inkH + pad * 2;
  const octx = out.getContext('2d');
  if (!octx) throw new Error('canvas');
  // רקע שקוף: רק הדיו עובר (פיקסלים בהירים נמחקים), כדי שהחתימה לא תכסה את הקו המודפס.
  const src = ctx.getImageData(minX, minY, inkW, inkH);
  for (let i = 0; i < src.data.length; i += 4) {
    const lum = src.data[i] * 0.3 + src.data[i + 1] * 0.59 + src.data[i + 2] * 0.11;
    if (lum >= 225) src.data[i + 3] = 0;
  }
  octx.putImageData(src, pad, pad);
  const url = out.toDataURL('image/png');
  return { png: dataUrlToBytes(url), dataUrl: url, width: out.width, height: out.height };
}
