#!/usr/bin/env node
// ─── מיקום חתימה על עמוד מסובב / עם CropBox — ה-PDF האמיתי, נמדד בפיקסלים ───
// burnSignaturesIntoPdf (utils/signaturePdf.ts) מקבל תיבה יחסית לעמוד *כפי שהוא
// מוצג*. כאן צורבים חתימה (מלבן שחור 3:1) על עמוד רגיל, מסובב 90/180/270 ועם
// CropBox מוזז, מרנדרים ב-pdfjs (שמיישם סיבוב וחיתוך בדיוק כמו התצוגה) ומודדים
// את גבולות הדיו מול התיבה שסומנה. סטייה מעל 1.5 נק' או חתימה שוכבת = כשל.
//
//   node scripts/test-signature-placement.mjs
import { createRequire } from 'module';
import http from 'http'; import fs from 'fs'; import path from 'path'; import os from 'os';
const REPO = process.cwd();
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pivo-sigplace-'));
const require = createRequire(REPO + '/worker/package.json');
const { chromium } = require('playwright-core');
const { build } = createRequire(REPO + '/package.json')('esbuild');
const SIG = JSON.stringify(path.join(REPO, 'src/utils/signaturePdf.ts').split(path.sep).join('/'));
fs.writeFileSync(path.join(TMP, 'entry.ts'), [
  "import { PDFDocument, degrees } from 'pdf-lib';",
  'import { burnSignaturesIntoPdf } from ' + SIG + ';',
  '(window as any).__lib = { PDFDocument, degrees, burnSignaturesIntoPdf };',
].join('\n'));
await build({ entryPoints: [path.join(TMP, 'entry.ts')], bundle: true, outfile: path.join(TMP, 'b.js'), platform: 'browser', format: 'iife', logLevel: 'warning', nodePaths: [REPO + '/node_modules'] });
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><body><script src="/b.js"></script></body>'); }
  if (u === '/b.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(fs.readFileSync(path.join(TMP, 'b.js'))); }
  if (u.startsWith('/fonts/')) { res.writeHead(200); return res.end(fs.readFileSync(path.join(REPO, 'public', u))); }
  if (u.startsWith('/pdfjs/')) { const f = path.join(REPO, 'node_modules/pdfjs-dist', u.slice(7)); if (fs.existsSync(f)) { res.writeHead(200, { 'content-type': f.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream' }); return res.end(fs.readFileSync(f)); } }
  res.writeHead(404); res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
page.on('pageerror', e => console.error('pageerror', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
const res = await page.evaluate(async () => {
  const { PDFDocument, degrees, burnSignaturesIntoPdf } = window.__lib;
  const pdfjs = await import('/pdfjs/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.mjs';
  // תמונת חתימה: מלבן שחור מלא 300x100 (יחס 3:1)
  const c = document.createElement('canvas'); c.width = 300; c.height = 100;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 300, 100);
  const png = c.toDataURL('image/png');
  const cases = [
    { name: 'plain', rot: 0 }, { name: 'rot90', rot: 90 }, { name: 'rot180', rot: 180 }, { name: 'rot270', rot: 270 },
    { name: 'cropbox', rot: 0, crop: [50, 60, 512, 672] }, { name: 'cropbox+rot90', rot: 90, crop: [50, 60, 512, 672] },
  ];
  // תיבה בתצוגה: x 10%, y 20%, רוחב 30%; גובה כך שהיחס בתצוגה יהיה 3:1
  const out = [];
  for (const cs of cases) {
    const doc = await PDFDocument.create();
    const p = doc.addPage([612, 792]);
    if (cs.crop) p.setCropBox(...cs.crop);
    p.setRotation(degrees(cs.rot));
    const bytes = await doc.save();
    const vis = cs.crop ? { w: cs.crop[2], h: cs.crop[3] } : { w: 612, h: 792 };
    const dW = cs.rot % 180 ? vis.h : vis.w, dH = cs.rot % 180 ? vis.w : vis.h;
    const wPct = 0.3, hPct = (0.3 * dW / 3) / dH;
    const field = { id: 'f1', signerId: 's', kind: 'signature', pageIndex: 0, xPct: 0.1, yPct: 0.2, widthPct: wPct, heightPct: hPct };
    const burned = await burnSignaturesIntoPdf(bytes.buffer, [field], { f1: { fieldId: 'f1', imageDataUrl: png, signedAt: '' } });
    const pdf = await pdfjs.getDocument({ data: burned }).promise;
    const pg = await pdf.getPage(1);
    const vp = pg.getViewport({ scale: 1 });
    const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    await pg.render({ canvas: cv, viewport: vp }).promise;
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) { const i = (y * cv.width + x) * 4; if (d[i] < 100) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); } }
    const exp = { x: 0.1 * cv.width, y: 0.2 * cv.height, w: wPct * cv.width, h: hPct * cv.height };
    out.push({ name: cs.name, view: [cv.width, cv.height], expected: [exp.x, exp.y, exp.w, exp.h].map(v => +v.toFixed(1)), got: [minX, minY, maxX - minX + 1, maxY - minY + 1],
      err: +Math.max(Math.abs(minX - exp.x), Math.abs(minY - exp.y), Math.abs(maxX + 1 - exp.x - exp.w), Math.abs(maxY + 1 - exp.y - exp.h)).toFixed(1),
      upright: (maxX - minX) > (maxY - minY) * 2 });
  }
  return out;
});
let failed = 0;
for (const r of res) { if (!(r.err <= 1.5 && r.upright)) failed++; console.log(`${r.err <= 1.5 && r.upright ? '✓' : '✗'} ${r.name.padEnd(14)} view ${r.view} expected ${r.expected} got ${r.got} maxErr ${r.err}pt upright ${r.upright}`); }
await browser.close(); server.close();
console.log(failed ? `\n${failed} כשלים` : '\nהחתימה נוחתת במקום שסומן בכל גיאומטריית עמוד');
process.exit(failed ? 1 : 0);
