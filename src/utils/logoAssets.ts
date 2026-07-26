// ─── נכסי לוגו: קריאת ערכת מותג מכווצת + המרת SVG ל-PNG ─────────────────────
// שני הכלים כאן קיימים כדי שאפשר יהיה להעלות את קבצי ערכת המותג כמו שהם:
//   1. ערכת מותג מגיעה כקובץ ZIP עם עשרות וריאציות — קוראים אותו בדפדפן
//      ומציגים לבחירה, במקום לדרוש חילוץ ידני והעלאה קובץ-קובץ.
//   2. קובצי הלוגו הם SVG עם טקסט חי (לא קווי מתאר). זה מצוין באתר, אבל תוכנות
//      מייל לא מציגות SVG כלל — ולכן ממירים ל-PNG, תוך הטמעת הפונטים בתוך ה-SVG
//      לפני הרסטור, אחרת הדפדפן מרנדר בפונט ברירת מחדל והלוגו יוצא שגוי.

export interface BrandKitEntry {
  path: string;      // הנתיב המלא בתוך הארכיון, למשל brand/logos/logo-white.svg
  name: string;      // שם הקובץ בלבד
  folder: string;    // התיקייה בתוך הארכיון — משמשת לקיבוץ בתצוגה
  bytes: Uint8Array;
  mime: string;
  size: number;
}

const IMAGE_MIME: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export function mimeForFileName(name: string): string | undefined {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext ? IMAGE_MIME[ext] : undefined;
}

// ─── ZIP ────────────────────────────────────────────────────────────────────
// מימוש מינימלי של קריאת ZIP. הדפדפן יודע לפרוס deflate דרך DecompressionStream,
// כך שאין צורך בספרייה חיצונית.

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/** מחלץ את קובצי התמונה מתוך ארכיון ZIP. מתעלם מתיקיות וממה שאינו תמונה. */
export async function readBrandKitZip(file: File): Promise<BrandKitEntry[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(buf.buffer);

  // סוף הספרייה המרכזית — נסרק מהסוף, כי בסופו יכולה להיות הערה באורך משתנה
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66_000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('הקובץ אינו ארכיון ZIP תקין');

  const entryCount = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true); // תחילת הספרייה המרכזית

  const out: BrandKitEntry[] = [];
  const decoder = new TextDecoder('utf-8');

  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break;
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const rawSize = view.getUint32(ptr + 24, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    // כלי הכיווץ של וינדוס כותב לוכסן הפוך בניגוד לתקן — מנרמלים כדי שהקיבוץ
    // לתיקיות יעבוד לא משנה במה הערכה נארזה
    const path = decoder.decode(buf.subarray(ptr + 46, ptr + 46 + nameLen)).replace(/\\/g, '/');
    ptr += 46 + nameLen + extraLen + commentLen;

    if (path.endsWith('/')) continue;
    const name = path.split('/').pop() || path;
    const mime = mimeForFileName(name);
    if (!mime) continue;

    // הכותרת המקומית — אורכי השם וה-extra שלה עשויים להיות שונים מאלה שבספרייה
    if (view.getUint32(localOffset, true) !== 0x04034b50) continue;
    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);

    let bytes: Uint8Array;
    if (method === 0) bytes = raw.slice();
    else if (method === 8) bytes = await inflateRaw(raw);
    else continue; // שיטת דחיסה שהדפדפן לא תומך בה

    const segments = path.split('/');
    out.push({
      path,
      name,
      folder: segments.slice(0, -1).join('/') || '/',
      bytes,
      mime,
      size: rawSize || bytes.length,
    });
  }

  return out;
}

export function entryToFile(entry: BrandKitEntry): File {
  return new File([entry.bytes as BlobPart], entry.name, { type: entry.mime });
}

export function entryToObjectUrl(entry: BrandKitEntry): string {
  return URL.createObjectURL(new Blob([entry.bytes as BlobPart], { type: entry.mime }));
}

// ─── SVG → PNG ──────────────────────────────────────────────────────────────

/** שמות משפחות הפונטים שמוזכרות ב-SVG (font-family="Manrope, sans-serif") */
function fontFamiliesInSvg(svg: string): string[] {
  const found = new Set<string>();
  for (const m of svg.matchAll(/font-family\s*[:=]\s*["']?([^"';)]+)/gi)) {
    const first = m[1].split(',')[0].replace(/["']/g, '').trim();
    // משפחות גנריות אינן צריכות הטמעה
    if (first && !/^(sans-serif|serif|monospace|system-ui|inherit)$/i.test(first)) found.add(first);
  }
  return [...found];
}

async function toBase64(bytes: ArrayBuffer): Promise<string> {
  const arr = new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i += 0x8000) {
    bin += String.fromCharCode(...arr.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/**
 * מוריד מ-Google Fonts את הפונטים שה-SVG משתמש בהם ומטמיע אותם בתוכו כ-base64.
 * בלי זה, רסטור של SVG בקנבס מרנדר בפונט ברירת המחדל של המערכת.
 * אם ההורדה נכשלת — מחזירים את ה-SVG כמו שהוא, ההמרה עדיין תעבוד (בפונט אחר).
 */
async function embedFonts(svg: string): Promise<string> {
  const families = fontFamiliesInSvg(svg);
  if (families.length === 0) return svg;

  const query = families.map(f => `family=${encodeURIComponent(f)}:wght@300;400;500;600;700`).join('&');
  let css: string;
  try {
    const res = await fetch(`https://fonts.googleapis.com/css2?${query}&display=swap`);
    if (!res.ok) return svg;
    css = await res.text();
  } catch {
    return svg;
  }

  // לכל @font-face: המשפחה, המשקל, ה-URL וטווח התווים. מטמיעים רק לטינית ועברית
  // כדי לא לנפח את הקובץ בעשרות טווחים שלא בשימוש.
  const faces: string[] = [];
  for (const block of css.split('@font-face').slice(1)) {
    const family = block.match(/font-family:\s*'([^']+)'/)?.[1];
    const weight = block.match(/font-weight:\s*(\d+)/)?.[1] ?? '400';
    const url = block.match(/url\((https:[^)]+)\)/)?.[1];
    const range = block.match(/unicode-range:([^;]+)/)?.[1] ?? '';
    if (!family || !url) continue;
    const isLatin = /U\+0000-00FF/.test(range);
    const isHebrew = /U\+0590/.test(range);
    if (!isLatin && !isHebrew) continue;
    try {
      const b64 = await toBase64(await (await fetch(url)).arrayBuffer());
      faces.push(`@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;src:url(data:font/woff2;base64,${b64}) format('woff2');}`);
    } catch {
      // פונט בודד שלא נטען — ממשיכים עם השאר
    }
  }
  if (faces.length === 0) return svg;

  const style = `<style type="text/css">${faces.join('')}</style>`;
  // מעדיפים להיכנס לתוך <defs> קיים; אחרת מיד אחרי תג ה-svg הפותח
  if (/<defs\s*>/.test(svg)) return svg.replace(/<defs\s*>/, `<defs>${style}`);
  if (/<defs\s*\/>/.test(svg)) return svg.replace(/<defs\s*\/>/, `<defs>${style}</defs>`);
  return svg.replace(/(<svg[^>]*>)/, `$1<defs>${style}</defs>`);
}

/** מידות ה-viewBox או width/height של ה-SVG, לשמירת יחס הגובה-רוחב */
function svgSize(svg: string): { w: number; h: number } {
  const vb = svg.match(/viewBox\s*=\s*["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/i);
  if (vb) return { w: parseFloat(vb[1]), h: parseFloat(vb[2]) };
  const w = parseFloat(svg.match(/\swidth\s*=\s*["']([\d.]+)/i)?.[1] ?? '600');
  const h = parseFloat(svg.match(/\sheight\s*=\s*["']([\d.]+)/i)?.[1] ?? '250');
  return { w, h };
}

export interface RasterResult {
  file: File;
  width: number;
  height: number;
  fontsEmbedded: boolean;
}

/**
 * ממיר קובץ SVG ל-PNG שקוף ברוחב מבוקש. משמש בעיקר ללוגו המייל.
 * targetWidth הוא הרוחב בפיקסלים בפועל — 720 נותן תצוגה חדה גם במסכי רטינה
 * כשהלוגו מוצג ברוחב 180 במייל.
 */
export async function svgFileToPng(file: File, targetWidth = 720): Promise<RasterResult> {
  const original = await file.text();
  const withFonts = await embedFonts(original);
  const fontsEmbedded = withFonts !== original;

  const { w, h } = svgSize(original);
  const scale = targetWidth / w;
  const outW = Math.round(targetWidth);
  const outH = Math.max(1, Math.round(h * scale));

  const url = URL.createObjectURL(new Blob([withFonts], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('לא הצלחתי לפתוח את קובץ ה-SVG'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('הדפדפן לא אפשר ציור על קנבס');
    ctx.drawImage(img, 0, 0, outW, outH);

    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('ההמרה ל-PNG נכשלה');

    const pngName = file.name.replace(/\.svg$/i, '') + '.png';
    return { file: new File([blob], pngName, { type: 'image/png' }), width: outW, height: outH, fontsEmbedded };
  } finally {
    URL.revokeObjectURL(url);
  }
}
