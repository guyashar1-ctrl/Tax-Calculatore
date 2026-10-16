// עזר משותף: קוד הפענוח של המוצר (מאוגד מ-src) + בניית PDF סינתטי בגופן קבוע (כמו הדפסת מסוף שע״ם).
// ‼ דוגמאות בלבד — שמות ומספרים מומצאים. ציור תו-תו מימין לשמאל, כדי ש-pdfjs יקבל עברית בסדר לוגי כמו בהדפסה האמיתית.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const ROOT = resolve('.');
export const FONT = 'C:/Windows/Fonts/cour.ttf';

export async function loadProductCode() {
  const { build } = await import(pathToFileURL(join(ROOT, 'node_modules/esbuild/lib/main.js')).href);
  const tmp = mkdtempSync(join(tmpdir(), 'shaam-parse-'));
  const src = (p) => JSON.stringify(join(ROOT, 'src/features/shaamFiling', p).split('\\').join('/'));
  writeFileSync(join(tmp, 'entry.ts'), `export * from ${src('parse/grid.ts')}; export * from ${src('parse/parseShaam.ts')}; export * from ${src('parse/batch.ts')}; export * from ${src('__fixtures__/terminal.ts')};`);
  await build({ entryPoints: [join(tmp, 'entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile: join(tmp, 'b.mjs'), logLevel: 'error' });
  const P = await import(pathToFileURL(join(tmp, 'b.mjs')).href);
  rmSync(tmp, { recursive: true, force: true });
  return P;
}

export async function makePdf(P, pagesLines) {
  const { PDFDocument } = await import(pathToFileURL(join(ROOT, 'node_modules/pdf-lib/cjs/index.js')).href);
  const fontkit = (await import(pathToFileURL(join(ROOT, 'node_modules/@pdf-lib/fontkit/dist/fontkit.umd.js')).href)).default;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setProducer('PIVO — דוגמה סינתטית (לא שע״ם)');
  pdf.setTitle('דוגמה — לא נתוני לקוח');
  const font = await pdf.embedFont(readFileSync(FONT), { subset: true });
  for (const lines of pagesLines) {
    const page = pdf.addPage([595.32, 841.92]);
    P.itemsToGrid(P.itemsFromLines(lines)).lines.forEach((line, k) => {
      for (let c = line.length - 1; c >= 0; c--) if (line[c] !== ' ') page.drawText(line[c], { x: c * 6, y: 820 - k * 12, size: 10, font });
    });
  }
  return Buffer.from(await pdf.save());
}
