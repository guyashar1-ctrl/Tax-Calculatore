#!/usr/bin/env node
// ─── בדיקה חזותית של טופס 6101 — ה-PDF האמיתי, לא הקוד ──────────────────────
// מייצא PDF לכל תרחיש סינתטי (fixtures.ts), מרנדר כל עמוד (pdfjs בכרום),
// מצלם תקריבים של אזורים צפופים ושל כל חתימה, ומשווה פיקסל-פיקסל מול הטופס
// הריק: כל פיקסל ששונה חייב ליפול בתוך מלבן של שדה ממופה. פיקסל שונה מחוץ
// לשדה = ציור במקום שאינו שדה (סטייה) ⇒ הבדיקה נכשלת.
//
//   node scripts/test-smart-form-6101.mjs [outDir]
//
// ‼ תלויות: esbuild (של vite) ו-playwright-core (של worker/) — שתיהן כבר מותקנות.

import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(process.cwd());
const OUT = resolve(process.argv[2] || mkdtempSync(join(tmpdir(), 'pivo-6101-')));
mkdirSync(OUT, { recursive: true });
const require = createRequire(join(ROOT, 'worker', 'package.json'));
const { chromium } = require('playwright-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// ── 1 · בנדל לנוד: פתרון → פריסה → ייצוא ──
const tmp = mkdtempSync(join(tmpdir(), 'pivo-6101-build-'));
const esc = (p) => JSON.stringify(p.split('\\').join('/'));
const S = (p) => esc(join(ROOT, 'src', p));
writeFileSync(join(tmp, 'node-entry.ts'), `
import { PDFDocument } from 'pdf-lib';
import { resolve6101 } from ${S('features/smartForms/btl6101/resolve.ts')};
import { layout6101 } from ${S('features/smartForms/btl6101/layout6101.ts')};
import { BTL6101_TEMPLATE } from ${S('features/smartForms/btl6101/template.ts')};
import { FX_CLIENTS } from ${S('features/smartForms/btl6101/fixtures.ts')};
import { exportSmartForm, makeMeasure, createMeasure } from ${S('features/smartForms/exportPdf.ts')};
import { embedPdfFonts } from ${S('utils/pdfHebrew.ts')};
export { resolve6101, layout6101, BTL6101_TEMPLATE, FX_CLIENTS, exportSmartForm, makeMeasure, createMeasure, embedPdfFonts, PDFDocument };
`);
await build({ entryPoints: [join(tmp, 'node-entry.ts')], bundle: true, outfile: join(tmp, 'node.mjs'), platform: 'node', format: 'esm', target: 'node20', logLevel: 'warning', nodePaths: [join(ROOT, 'node_modules')] });

// fetch של הפונטים/התבנית מהדיסק (כמו scripts/test-pdf-edit.mjs)
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, ...rest) => {
  const u = String(url);
  if (u.startsWith('/fonts/') || u.startsWith('/templates/')) {
    const bytes = readFileSync(join(ROOT, 'public', u));
    return new Response(bytes, { status: 200 });
  }
  return realFetch(url, ...rest);
};
const M = await import(pathToFileURL(join(tmp, 'node.mjs')).href);
const T = M.BTL6101_TEMPLATE;
const templateBytes = new Uint8Array(readFileSync(join(ROOT, 'public', T.fileUrl)));

// ── 2 · שרת קטן: pdfjs + בנדל דפדפן של חיתוך החתימה ──
await build({ entryPoints: [join(ROOT, 'src/features/smartForms/signatureImage.ts')], bundle: true, outfile: join(tmp, 'sig.js'), platform: 'browser', format: 'esm', logLevel: 'warning' });
const files = new Map();
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><body></body>'); }
  if (u === '/sig.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(readFileSync(join(tmp, 'sig.js'))); }
  if (files.has(u)) { res.writeHead(200, { 'content-type': 'application/pdf' }); return res.end(files.get(u)); }
  if (u.startsWith('/pdfjs/')) {
    const f = join(ROOT, 'node_modules/pdfjs-dist', u.slice(7));
    if (existsSync(f)) { res.writeHead(200, { 'content-type': f.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream' }); return res.end(readFileSync(f)); }
  }
  res.writeHead(404); res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(base + '/');

// ── 3 · חתימות סינתטיות בקנבס ברוחב מסך (כמו SignaturePad), ואז חיתוך לדיו ──
const sigs = await page.evaluate(async () => {
  const { trimSignature } = await import('/sig.js');
  const draw = (seed) => {
    const c = document.createElement('canvas'); c.width = 900; c.height = 180;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 900, 180);
    g.strokeStyle = '#111827'; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(260, 120);
    for (let i = 0; i < 9; i++) g.bezierCurveTo(280 + i * 38, 40 + ((i * seed) % 5) * 12, 300 + i * 38, 150 - ((i + seed) % 4) * 14, 320 + i * 38, 110);
    g.stroke(); g.beginPath(); g.moveTo(250, 135); g.lineTo(640, 128); g.stroke();
    return c.toDataURL('image/png');
  };
  const out = {};
  for (const [role, seed] of [['client', 3], ['spouse', 7]]) {
    const t = await trimSignature(draw(seed));
    out[role] = { b64: t.dataUrl.split(',')[1], w: t.width, h: t.height };
  }
  let emptyThrows = false;
  try { const c = document.createElement('canvas'); c.width = 300; c.height = 100; await trimSignature(c.toDataURL()); } catch { emptyThrows = true; }
  out.emptyThrows = emptyThrows;
  return out;
});
const signatures = {
  client: new Uint8Array(Buffer.from(sigs.client.b64, 'base64')),
  spouse: new Uint8Array(Buffer.from(sigs.spouse.b64, 'base64')),
};
writeFileSync(join(OUT, 'signature-client-trimmed.png'), signatures.client);

// ── 4 · תרחישים ──
const AS_OF = '2026-09-28';
const SCENARIOS = [
  { name: 'A-full-report', client: 'full', purposes: ['multi_year_report', 'update_details'], entered: { maritalSinceMonth: '08', declarationDate: AS_OF }, flags: {}, sign: ['client'] },
  { name: 'B-start-spouse-employees', client: 'full', purposes: ['start', 'spouse_in_business', 'stop_employees'],
    entered: { startDate: '2026-10-01', hoursBand: '20_plus', monthlyIncome: '9500', spouseFromDate: '2026-10-01', spouseSharePct: '25', spouseWeeklyHours: '12', stopEmployeesDate: '2026-08-31', declarationDate: AS_OF, refuseDigital: true },
    flags: { contactNotOwn: true }, extra: { altContactLastName: 'אלמוג', altContactFirstName: 'עידו', altContactIdNumber: '3456787' }, sign: ['client', 'spouse'] },
  { name: 'C-change', client: 'full', purposes: ['change'], entered: { hoursBefore: '12', changeToDate: '2026-07-01', hoursAfter: '25', incomeAfter: '14800', declarationDate: AS_OF }, flags: {}, sign: ['client'] },
  { name: 'D-end', client: 'full', purposes: ['end'], entered: { endDate: '2026-08-31', currentOccupation: 'שכירה', currentOccupationFrom: '2026-09-01', declarationDate: AS_OF }, flags: { separateMailing: true },
    extra: { mailRecipient: 'נועה אלמוג', mailStreet: 'ת.ד. 4521', mailCity: 'תל אביב - יפו', mailZip: '6104502' }, sign: ['client'] },
  { name: 'E-long-overflow', client: 'long', purposes: ['multi_year_report'], entered: { declarationDate: AS_OF }, flags: {}, sign: ['client'],
    occExtra: { 1: { nonWorkIncome: '3200', nonWorkIncomeBasis: 'monthly', nonWorkSource: 'דמי אבטלה — המוסד לביטוח לאומי' } } },
  { name: 'F-gaps', client: 'gaps', purposes: ['change'], entered: {}, flags: {}, sign: [] },
];

/**
 * מה בדיוק צריך להיות איפה — לכל ספרה התא המודפס שלה, לכל ✗ הריבוע, לכל שדה
 * טקסט המלבן והיישור, ולכל חתימה התיבה ויחס הדיו המקורי. נמדד מול הרינדור.
 */
function alignmentTargets(lay, sig) {
  const out = [];
  const seenText = new Set();
  for (const op of lay.ops) {
    if (op.kind === 'appendix') continue;
    const f = T.fields.find(x => x.id === op.fieldId);
    if (!f) continue;
    if (op.kind === 'check') out.push({ kind: 'check', page: op.page, id: op.fieldId, rect: op.box });
    else if (op.kind === 'signature') {
      // ‼ יחס הדיו עצמו — בלי השוליים השקופים (SIGNATURE_PAD_PX = 6 מכל צד)
      if (sig[op.signer]) out.push({ kind: 'signature', page: op.page, id: op.fieldId, rect: op.box, line: op.line, aspect: (sigs[op.signer].w - 12) / (sigs[op.signer].h - 12) });
    } else if (f.kind === 'digits') {
      const c = f.cells.findIndex((x, i) => i < f.cells.length - 1 && op.x > x && op.x < f.cells[i + 1]);
      out.push({ kind: 'digit', page: op.page, id: `${op.fieldId}#${c + 1}`, rect: { x: f.cells[c], y: f.box.y, w: f.cells[c + 1] - f.cells[c], h: f.box.h } });
    } else if (!seenText.has(op.fieldId)) {
      seenText.add(op.fieldId);
      out.push({ kind: 'text', page: op.page, id: op.fieldId, rect: f.box, align: f.align ?? 'right', pad: f.box.h >= 14 ? 2.5 : 1, line: f.line });
    }
  }
  return out;
}

const results = [];
for (const sc of SCENARIOS) {
  const client = M.FX_CLIENTS[sc.client];
  const entered = { ...sc.entered, ...(sc.extra ?? {}) };
  let r = M.resolve6101({ client, purposes: sc.purposes, entered, asOf: AS_OF, flags: sc.flags });
  if (sc.occExtra) {
    const occ = r.data.occupations.map((o, i) => ({ ...o, ...(sc.occExtra[i] ?? {}) }));
    r = M.resolve6101({ client, purposes: sc.purposes, entered: { ...entered, occupations: occ }, asOf: AS_OF, flags: sc.flags });
  }
  const measure = await M.createMeasure();
  const lay = M.layout6101(r.data, sc.purposes, measure);
  const sig = Object.fromEntries(sc.sign.map(s => [s, signatures[s]]));
  const bytes = await M.exportSmartForm(templateBytes, T, lay, { signatures: sig, meta: { title: `6101 ${sc.name}` } });
  writeFileSync(join(OUT, `${sc.name}.pdf`), bytes);
  files.set(`/${sc.name}.pdf`, bytes);
  const again = await M.exportSmartForm(templateBytes, T, lay, { signatures: sig, meta: { title: `6101 ${sc.name}` } });
  const deterministic = Buffer.compare(Buffer.from(bytes), Buffer.from(again)) === 0;
  const activeBoxes = [...new Set(lay.ops.filter(o => o.kind !== 'appendix').map(o => o.fieldId))]
    .map(id => T.fields.find(f => f.id === id)).filter(Boolean).map(f => ({ page: f.page, ...f.box }));
  results.push({ name: sc.name, pages: lay.pageCount, issues: lay.issues, blockers: r.issues.filter(i => i.severity === 'blocker').map(i => i.message),
    warnings: r.issues.filter(i => i.severity !== 'blocker').map(i => i.message), deterministic, activeBoxes,
    targets: alignmentTargets(lay, sig) });
}

// מסגרות ניפוי: כל מלבני המלאי על הטופס הריק
{
  const dbg = await M.exportSmartForm(templateBytes, T, { ops: [], issues: [], pageCount: 3 }, { debugBoxes: T.fields });
  writeFileSync(join(OUT, 'Z-inventory-boxes.pdf'), dbg);
  files.set('/Z-inventory-boxes.pdf', dbg);
}
files.set('/blank.pdf', templateBytes);

// ‼ קובץ טופס אחר (גם «אותו טופס» שנשמר מחדש) — הייצוא מסרב, לא ממלא «בערך».
let templateGuard = false;
{
  const other = await M.PDFDocument.load(templateBytes);
  other.setTitle('6101 re-saved');
  const otherBytes = await other.save();
  try {
    await M.exportSmartForm(otherBytes, T, results.length ? { ops: [], issues: [], pageCount: 3 } : { ops: [], issues: [], pageCount: 3 });
  } catch (e) { templateGuard = /המיפוי אינו חל/.test(e.message); }
}

// ── 5 · רינדור + השוואה מול הריק ──
const SCALE = 2;
async function renderAndDiff(name, boxes) {
  return page.evaluate(async ({ name, boxes, SCALE }) => {
    const pdfjs = await import('/pdfjs/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.mjs';
    const load = async (u) => pdfjs.getDocument({ data: new Uint8Array(await (await fetch(u)).arrayBuffer()), standardFontDataUrl: '/pdfjs/standard_fonts/' }).promise;
    const doc = await load(`/${name}.pdf`);
    const blank = await load('/blank.pdf');
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i);
      const vp = pg.getViewport({ scale: SCALE });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      let outside = 0, inside = 0; const outsideAt = [];
      if (i <= blank.numPages) {
        const bp = await blank.getPage(i);
        const bc = document.createElement('canvas'); bc.width = vp.width; bc.height = vp.height;
        await bp.render({ canvasContext: bc.getContext('2d'), viewport: vp }).promise;
        const a = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const b = bc.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const mine = boxes.filter(x => x.page === i);
        const TOL = 2.5; // נק' — הנשך של גופנים (ירידות, קווי X) סביב המלבן
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
          const k = (y * c.width + x) * 4;
          if (Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]) < 60) continue;
          const px = x / SCALE, py = 792 - y / SCALE;
          if (mine.some(m => px >= m.x - TOL && px <= m.x + m.w + TOL && py >= m.y - TOL && py <= m.y + m.h + TOL)) inside++;
          else { outside++; if (outsideAt.length < 12) outsideAt.push([+px.toFixed(1), +py.toFixed(1)]); }
        }
      }
      pages.push({ page: i, png: c.toDataURL('image/png').split(',')[1], inside, outside, outsideAt });
    }
    return pages;
  }, { name, boxes, SCALE });
}

const summary = [];
for (const r of results) {
  const pages = await renderAndDiff(r.name, r.activeBoxes);
  for (const p of pages) writeFileSync(join(OUT, `${r.name}-p${p.page}.png`), Buffer.from(p.png, 'base64'));
  summary.push({ ...r, activeBoxes: undefined, diff: pages.map(p => ({ page: p.page, inside: p.inside, outside: p.outside, outsideAt: p.outsideAt })) });
}
for (const name of ['Z-inventory-boxes']) {
  const pages = await renderAndDiff(name, []);
  for (const p of pages) writeFileSync(join(OUT, `${name}-p${p.page}.png`), Buffer.from(p.png, 'base64'));
}

// ── 6 · תקריבים (סקאלה 4) ──
const CLOSEUPS = [
  ['B-start-spouse-employees', 1, 'identity-marital', { x: 46, y: 440, w: 516, h: 160 }],
  ['B-start-spouse-employees', 1, 'address-phones-email', { x: 46, y: 330, w: 516, h: 100 }],
  ['B-start-spouse-employees', 1, 'altcontact-refuse', { x: 46, y: 250, w: 516, h: 80 }],
  ['B-start-spouse-employees', 2, 'section4', { x: 46, y: 230, w: 516, h: 215 }],
  ['B-start-spouse-employees', 2, 'spouse-signature', { x: 330, y: 278, w: 150, h: 34 }],
  ['B-start-spouse-employees', 3, 'client-signature-date', { x: 46, y: 468, w: 516, h: 50 }],
  ['A-full-report', 2, 'occupations-table', { x: 46, y: 540, w: 516, h: 180 }],
  ['A-full-report', 1, 'bank-mailing', { x: 46, y: 80, w: 516, h: 150 }],
  ['C-change', 2, 'change-rows', { x: 46, y: 322, w: 516, h: 52 }],
  ['D-end', 2, 'end-row', { x: 46, y: 236, w: 516, h: 50 }],
  ['D-end', 1, 'mailing', { x: 46, y: 180, w: 516, h: 50 }],
  ['E-long-overflow', 1, 'long-names', { x: 46, y: 540, w: 516, h: 60 }],
  ['E-long-overflow', 1, 'long-address-email', { x: 46, y: 330, w: 516, h: 100 }],
  ['E-long-overflow', 2, 'table-and-appendix-note', { x: 46, y: 540, w: 516, h: 180 }],
];
for (const [name, pg, label, r] of CLOSEUPS) {
  const png = await page.evaluate(async ({ name, pg, r }) => {
    const pdfjs = await import('/pdfjs/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.mjs';
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await (await fetch(`/${name}.pdf`)).arrayBuffer()), standardFontDataUrl: '/pdfjs/standard_fonts/' }).promise;
    const p = await doc.getPage(pg);
    const S = 4;
    const vp = p.getViewport({ scale: S, offsetX: -r.x * S, offsetY: -(792 - r.y - r.h) * S });
    const c = document.createElement('canvas'); c.width = r.w * S; c.height = r.h * S;
    await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    return c.toDataURL('image/png').split(',')[1];
  }, { name, pg, r });
  writeFileSync(join(OUT, `zoom-${name}-p${pg}-${label}.png`), Buffer.from(png, 'base64'));
}

// ── 6ב · מדידת יישור: הדיו מול התא/הריבוע/התיבה המודפסים (סקאלה 6 ⇒ ‎1/6 נק') ──
// ‼ «בפנים» לבד (סעיף 5) לא מוכיח דיוק: ספרה יכולה לשבת בתוך השדה ועדיין לא
// באמצע התא. כאן כל רכיב נמדד מול הגיאומטריה שלו.
const AS = 6;
const LIMITS = {
  digitDx: 0.3, digitDy: 0.9,       // ספרה: מרכז הדיו מול מרכז התא (אופטי)
  checkD: 0.35,                      // ✗: מרכז מול מרכז הריבוע
  textClear: 0.3,                    // טקסט: מרווח מינימלי מקצוות השדה
  textCenterDx: 0.5,                 // טקסט ממורכז: מרכז מול מרכז
  textPadErr: 1.0,                   // טקסט מיושר: המרווח מהקצה מול הריפוד שנקבע
  sigLine: 0.35, sigAspect: 0.03,    // חתימה: הדיו 0.5 נק' מעל הקו (±), בלי מתיחה
  lineClear: 0.2,                    // שדה-קו: הדיו לא נוגע בקו המודפס
};
async function measureInk(name, pageNo, rects) {
  return page.evaluate(async ({ name, pageNo, rects, AS }) => {
    const pdfjs = await import('/pdfjs/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.mjs';
    const load = async (u) => pdfjs.getDocument({ data: new Uint8Array(await (await fetch(u)).arrayBuffer()), standardFontDataUrl: '/pdfjs/standard_fonts/' }).promise;
    const draw = async (u) => {
      const pg = await (await load(u)).getPage(pageNo);
      const vp = pg.getViewport({ scale: AS });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      return c.getContext('2d').getImageData(0, 0, c.width, c.height);
    };
    const a = await draw(`/${name}.pdf`);
    const b = await draw('/blank.pdf');
    const W = a.width, H = a.height;
    return rects.map(r => {
      const m = 1.5; // נק' — מעבר לתיבה, כדי שגלישה תימדד ולא תיחתך
      const x0 = Math.max(0, Math.floor((r.x - m) * AS)), x1 = Math.min(W, Math.ceil((r.x + r.w + m) * AS));
      const y0 = Math.max(0, Math.floor((792 - r.y - r.h - m) * AS)), y1 = Math.min(H, Math.ceil((792 - r.y + m) * AS));
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const k = (y * W + x) * 4;
        const d = Math.abs(a.data[k] - b.data[k]) + Math.abs(a.data[k + 1] - b.data[k + 1]) + Math.abs(a.data[k + 2] - b.data[k + 2]);
        if (d < 120) continue;
        n++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      if (!n) return null;
      // פיקסלים ⇒ נקודות PDF (y עולה)
      return { left: minX / AS, right: (maxX + 1) / AS, top: 792 - minY / AS, bottom: 792 - (maxY + 1) / AS, n };
    });
  }, { name, pageNo, rects, AS });
}

const audit = [];
for (const r of results) {
  for (const pg of [...new Set(r.targets.map(t => t.page))]) {
    const ts = r.targets.filter(t => t.page === pg);
    const ink = await measureInk(r.name, pg, ts.map(t => t.rect));
    ts.forEach((t, i) => {
      const k = ink[i];
      const row = { scenario: r.name, page: pg, kind: t.kind, id: t.id };
      if (!k) { audit.push({ ...row, fail: 'אין דיו' }); return; }
      const cx = (k.left + k.right) / 2, cy = (k.top + k.bottom) / 2;
      const rcx = t.rect.x + t.rect.w / 2, rcy = t.rect.y + t.rect.h / 2;
      // ‼ בשדה-קו הרצפה היא הקו המודפס (t.line), לא תחתית התיבה
      const clear = Math.min(k.left - t.rect.x, t.rect.x + t.rect.w - k.right, t.line != null ? 99 : k.bottom - t.rect.y, t.rect.y + t.rect.h - k.top);
      const lineClear = t.line != null ? k.bottom - t.line : null;
      if (t.kind === 'digit') {
        const dx = cx - rcx, dy = cy - rcy;
        audit.push({ ...row, dx, dy, clear, fail: Math.abs(dx) > LIMITS.digitDx || Math.abs(dy) > LIMITS.digitDy || clear < LIMITS.textClear ? 'ספרה לא במרכז התא' : '' });
      } else if (t.kind === 'check') {
        const dx = cx - rcx, dy = cy - rcy;
        audit.push({ ...row, dx, dy, clear, fail: Math.abs(dx) > LIMITS.checkD || Math.abs(dy) > LIMITS.checkD || clear < 0 ? '✗ לא במרכז הריבוע' : '' });
      } else if (t.kind === 'text') {
        const dx = t.align === 'center' ? cx - rcx
          : t.align === 'right' ? (t.rect.x + t.rect.w - k.right) - t.pad : (k.left - t.rect.x) - t.pad;
        const lim = t.align === 'center' ? LIMITS.textCenterDx : LIMITS.textPadErr;
        audit.push({ ...row, align: t.align, dx, dy: cy - rcy, clear, lineClear,
          fail: clear < LIMITS.textClear ? 'נוגע בקצה השדה' : lineClear != null && lineClear < LIMITS.lineClear ? 'נוגע בקו' : Math.abs(dx) > lim ? 'יישור אופקי' : '' });
      } else if (t.kind === 'signature') {
        const bottom = t.line != null ? k.bottom - (t.line + 0.5) : k.bottom - t.rect.y;
        const aspect = (k.right - k.left) / (k.top - k.bottom);
        const aErr = Math.abs(aspect / t.aspect - 1);
        audit.push({ ...row, bottom, aspect, aErr, clear: Math.min(k.left - t.rect.x, t.rect.x + t.rect.w - k.right, t.rect.y + t.rect.h - k.top),
          fail: Math.abs(bottom) > LIMITS.sigLine || aErr > LIMITS.sigAspect || k.top > t.rect.y + t.rect.h + 0.2 ? 'חתימה' : '' });
      }
    });
  }
}
writeFileSync(join(OUT, 'alignment-report.json'), JSON.stringify(audit, (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v), 1));

// תקריבים עם קווי עזר: מרכז כל תא (כחול) ומלבן השדה (סגול) מעל הרינדור
async function guidedCrop(name, pg, label, r, targets) {
  const png = await page.evaluate(async ({ name, pg, r, targets }) => {
    const pdfjs = await import('/pdfjs/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.mjs';
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await (await fetch(`/${name}.pdf`)).arrayBuffer()), standardFontDataUrl: '/pdfjs/standard_fonts/' }).promise;
    const p = await doc.getPage(pg);
    const S = 6;
    const vp = p.getViewport({ scale: S, offsetX: -r.x * S, offsetY: -(792 - r.y - r.h) * S });
    const c = document.createElement('canvas'); c.width = r.w * S; c.height = r.h * S;
    const g = c.getContext('2d');
    await p.render({ canvasContext: g, viewport: vp }).promise;
    const X = (x) => (x - r.x) * S, Y = (y) => (r.y + r.h - y) * S;
    g.lineWidth = 1;
    for (const t of targets) {
      g.strokeStyle = 'rgba(160, 32, 240, 0.55)';
      g.strokeRect(X(t.rect.x), Y(t.rect.y + t.rect.h), t.rect.w * S, t.rect.h * S);
      if (t.kind !== 'text') {
        g.strokeStyle = 'rgba(0, 150, 255, 0.8)';
        const cx = X(t.rect.x + t.rect.w / 2), cy = Y(t.rect.y + t.rect.h / 2);
        g.beginPath(); g.moveTo(cx, cy - 8); g.lineTo(cx, cy + 8); g.moveTo(cx - 8, cy); g.lineTo(cx + 8, cy); g.stroke();
      }
    }
    return c.toDataURL('image/png').split(',')[1];
  }, { name, pg, r, targets });
  writeFileSync(join(OUT, `guide-${name}-p${pg}-${label}.png`), Buffer.from(png, 'base64'));
}
const GUIDED = [
  ['B-start-spouse-employees', 1, 'id-marital-spouse', { x: 46, y: 440, w: 516, h: 160 }],
  ['B-start-spouse-employees', 1, 'phones-email-altcontact', { x: 46, y: 270, w: 516, h: 110 }],
  ['A-full-report', 1, 'bank', { x: 46, y: 80, w: 516, h: 70 }],
  ['B-start-spouse-employees', 2, 'start-spouse-signature', { x: 46, y: 270, w: 516, h: 175 }],
  ['B-start-spouse-employees', 3, 'declaration-signature', { x: 46, y: 440, w: 516, h: 90 }],
  ['A-full-report', 2, 'occupations', { x: 46, y: 560, w: 516, h: 100 }],
];
for (const [name, pg, label, r] of GUIDED) {
  const res = results.find(x => x.name === name);
  const ts = res.targets.filter(t => t.page === pg && t.rect.x < r.x + r.w && t.rect.x + t.rect.w > r.x && t.rect.y < r.y + r.h && t.rect.y + t.rect.h > r.y);
  await guidedCrop(name, pg, label, r, ts);
}

await browser.close();
server.close();

// ── 7 · סיכום ──
let failed = 0;
console.log(`\nתיקיית הפלט: ${OUT}\n`);
console.log(`חתימה חתוכה: ${sigs.client.w}×${sigs.client.h}px · חתימה ריקה נדחית: ${sigs.emptyThrows ? 'כן' : 'לא'} · קובץ טופס אחר נדחה: ${templateGuard ? 'כן' : 'לא'}`);
if (!sigs.emptyThrows) failed++;
if (!templateGuard) failed++;
for (const s of summary) {
  const outside = s.diff.reduce((a, d) => a + d.outside, 0);
  const ok = outside === 0 && s.issues.length === 0 && s.deterministic;
  if (!ok && s.name !== 'F-gaps') failed++;
  console.log(`${ok ? '✓' : (s.name === 'F-gaps' ? '·' : '✗')} ${s.name}: ${s.pages} עמ' · פיקסלים שונים בתוך שדות ${s.diff.map(d => d.inside).join('/')} · מחוץ לשדות ${outside}` +
    `${s.deterministic ? '' : ' · ‼ לא דטרמיניסטי'}${s.issues.length ? ` · בעיות פריסה: ${s.issues.map(i => i.message).join(' | ')}` : ''}`);
  for (const d of s.diff) if (d.outside) console.log(`    עמ' ${d.page}: ${JSON.stringify(d.outsideAt)}`);
  if (s.blockers.length) console.log(`    חוסמים: ${s.blockers.join(' | ')}`);
  if (s.warnings.length) console.log(`    אזהרות: ${s.warnings.join(' | ')}`);
}
{
  const by = (k) => audit.filter(a => a.kind === k);
  const max = (xs, f) => xs.length ? Math.max(...xs.map(a => Math.abs(f(a) ?? 0))) : 0;
  const d = by('digit'), c = by('check'), t = by('text'), s = by('signature');
  console.log(`\nיישור (סקאלה ${AS}, ‎1/${AS} נק'): ${d.length} ספרות · מרכז אופקי עד ${max(d, a => a.dx).toFixed(2)} · אנכי עד ${max(d, a => a.dy).toFixed(2)} נק'` +
    ` | ${c.length} ✗ · עד ${Math.max(max(c, a => a.dx), max(c, a => a.dy)).toFixed(2)} נק'` +
    ` | ${t.length} שדות טקסט · מרווח מינימלי מהקצה ${t.length ? Math.min(...t.map(a => a.clear ?? 99)).toFixed(2) : '-'} נק', מהקו ${Math.min(...t.filter(a => a.lineClear != null).map(a => a.lineClear)).toFixed(2)} נק'` +
    ` | ${s.length} חתימות · סטייה מ«0.5 מעל הקו» עד ${max(s, a => a.bottom).toFixed(2)} נק', עיוות עד ${(max(s, a => a.aErr) * 100).toFixed(1)}%`);
  const bad = audit.filter(a => a.fail);
  for (const b of bad.slice(0, 25)) console.log(`  ✗ ${b.scenario} עמ' ${b.page} ${b.id}: ${b.fail} ${JSON.stringify({ dx: b.dx, dy: b.dy, clear: b.clear, bottom: b.bottom, aErr: b.aErr })}`);
  if (bad.length) failed++;
}
if (errors.length) { console.log('שגיאות דפדפן:', errors); failed++; }
console.log(failed ? `\n${failed} כשלים` : '\nהכול עבר');
process.exit(failed ? 1 : 0);
