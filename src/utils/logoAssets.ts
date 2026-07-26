// ─── המרת SVG ל-PNG ──────────────────────────────────────────────────────────
// קובצי הלוגו בערכות מותג הם לרוב SVG עם טקסט חי (לא קווי מתאר). זה מצוין באתר,
// אבל תוכנות מייל לא מציגות SVG כלל — ולכן ממירים ל-PNG, תוך הטמעת הפונטים בתוך
// ה-SVG לפני הרסטור, אחרת הדפדפן מרנדר בפונט ברירת מחדל והלוגו יוצא שגוי.


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
