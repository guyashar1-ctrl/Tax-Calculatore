// ─── סיבוב תמונה לפני בניית ה-PDF (הועבר מ-DocPartsPicker, 16.10.2026) ─────────────────────────
import { canPreviewInBrowser } from './idSides';

export async function rotateImage(f: File, deg: number): Promise<File> {
  if (!deg || !canPreviewInBrowser(f)) return f;
  const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  const swap = deg === 90 || deg === 270;
  const c = document.createElement('canvas');
  c.width = swap ? bmp.height : bmp.width; c.height = swap ? bmp.width : bmp.height;
  const g = c.getContext('2d')!;
  g.translate(c.width / 2, c.height / 2); g.rotate((deg * Math.PI) / 180); g.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.95));
  return blob ? new File([blob], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : f;
}
