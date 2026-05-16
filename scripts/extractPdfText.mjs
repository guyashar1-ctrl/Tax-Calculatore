// Extract text from a PDF using pdfjs-dist (Node legacy build).
// Usage: node scripts/extractPdfText.mjs <pdfPath> [outPath]

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');

async function extract(pdfPath, outPath) {
  const data = new Uint8Array(readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const lines = new Map();
    for (const item of tc.items) {
      const y = Math.round(item.transform[5]);
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y).push({ x: item.transform[4], s: item.str });
    }
    const sorted = [...lines.entries()].sort((a, b) => b[0] - a[0]);
    const pageText = sorted
      .map(([, arr]) =>
        arr.sort((a, b) => a.x - b.x).map((p) => p.s).join('')
      )
      .join('\n');
    out.push(`\n===== PAGE ${i} =====\n${pageText}`);
  }

  const allText = out.join('\n');
  if (outPath) writeFileSync(outPath, allText, 'utf8');
  else process.stdout.write(allText);
}

const [pdfArg, outArg] = process.argv.slice(2);
if (!pdfArg) {
  console.error('Usage: node scripts/extractPdfText.mjs <pdfPath> [outPath]');
  process.exit(1);
}
extract(resolve(pdfArg), outArg ? resolve(outArg) : undefined).catch((e) => {
  console.error(e);
  process.exit(1);
});
