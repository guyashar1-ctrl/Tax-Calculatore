#!/usr/bin/env node
// ─── בדיקה חזותית של טפסי הלקוח (4440, 821) — ה-PDF האמיתי, לא הקוד ─────────
// מייצא PDF לנתוני הדוגמה של כל טופס (ובשני מגדרים ל-4440), מרנדר כל עמוד
// (pdfjs + @napi-rs/canvas), ומשווה פיקסל-פיקסל מול הטופס הריק: כל פיקסל ששונה
// חייב ליפול בתוך מלבן של שדה פעיל. פיקסל מחוץ לשדה = ציור במקום שאינו שדה ⇒ נכשל.
// בנוסף: אין בעיות פריסה (טקסט שלא נכנס / ספרות), והקובץ דטרמיניסטי.
//
//   node scripts/test-smart-client-forms.mjs [outDir]

import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(process.cwd());
const OUT = resolve(process.argv[2] || mkdtempSync(join(tmpdir(), 'pivo-cf-')));
mkdirSync(OUT, { recursive: true });
const require = createRequire(join(ROOT, 'package.json'));
const { createCanvas } = require('@napi-rs/canvas');
const pdfjs = await import(pathToFileURL(join(ROOT, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);

const tmp = mkdtempSync(join(tmpdir(), 'pivo-cf-build-'));
const esc = (p) => JSON.stringify(p.split('\\').join('/'));
writeFileSync(join(tmp, 'entry.ts'), `
export { CLIENT_FORMS, renderClientForm, layoutClientForm } from ${esc(join(ROOT, 'src/features/smartForms/clientForms/registry.ts'))};
`);
await build({ entryPoints: [join(tmp, 'entry.ts')], bundle: true, outfile: join(tmp, 'node.mjs'), platform: 'node', format: 'esm', target: 'node20', logLevel: 'warning', nodePaths: [join(ROOT, 'node_modules')] });

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, ...rest) => {
  const u = String(url);
  if (u.startsWith('/fonts/') || u.startsWith('/templates/')) return new Response(readFileSync(join(ROOT, 'public', u)), { status: 200 });
  return realFetch(url, ...rest);
};
const M = await import(pathToFileURL(join(tmp, 'node.mjs')).href);

// חתימה סינתטית: דיו כהה עם שוליים שקופים של 6 פיקסלים (כמו trimSignature)
function signaturePng() {
  const c = createCanvas(312, 72);
  const g = c.getContext('2d');
  g.strokeStyle = '#111827'; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(8, 50);
  for (let i = 0; i < 8; i++) g.bezierCurveTo(20 + i * 36, 8, 34 + i * 36, 64, 44 + i * 36, 34);
  g.stroke(); g.beginPath(); g.moveTo(6, 64); g.lineTo(300, 60); g.stroke();
  return 'data:image/png;base64,' + c.toBuffer('image/png').toString('base64');
}

// חותמת סינתטית (כמו חותמת גומי סרוקה): מלבן מעוגל ושתי שורות קווים, בלי שוליים שקופים
function stampPng() {
  const c = createCanvas(360, 170);
  const g = c.getContext('2d');
  g.strokeStyle = '#1d3f8f'; g.lineWidth = 8; g.beginPath(); g.roundRect(6, 6, 348, 158, 24); g.stroke();
  g.lineWidth = 6; for (const y of [60, 105]) { g.beginPath(); g.moveTo(40, y); g.lineTo(320, y); g.stroke(); }
  return 'data:image/png;base64,' + c.toBuffer('image/png').toString('base64');
}

const SCALE = 3;
async function renderPages(bytes) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), standardFontDataUrl: join(ROOT, 'node_modules/pdfjs-dist/standard_fonts/') + '/', cMapUrl: join(ROOT, 'node_modules/pdfjs-dist/cmaps/') + '/', cMapPacked: true }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: SCALE });
    const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
    pages.push({ canvas, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, w: canvas.width, h: canvas.height, H: page.view[3] });
  }
  return pages;
}

let failures = 0;
const fail = (m) => { failures++; console.log('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

const CASES = [
  { key: 'ita-4440', name: '4440-male', data: {} },
  { key: 'ita-4440', name: '4440-female', data: { gender: 'female', firstName: 'ישראלה', spouseFirstName: 'ישראל', incBusiness: '1', incOther: '1', incOtherText: 'שכר דירה מנכס בחיפה' } },
  { key: 'vat-821', name: '821-home', data: {} },
  { key: 'vat-821', name: '821-rented', data: { bizAtHome: 'no', bizStreet: 'דרך העצמאות', bizHouse: '45', bizCity: 'חיפה', bizZip: '3303314', bizPhone: '04-8555123',
    mailSame: 'no', mailStreet: 'ת.ד. 1234', mailHouse: '', mailCity: 'חיפה', mailZip: '3101201', propKind: 'office', propKindOther: '', propTenure: 'rented',
    propParty: 'נכסי הכרמל בע"מ', propRent: '36000', activity: 'ייעוץ', industry: 'M', openDate: '2025-02-15', turnover: '1250000', employees: '4' } },
  // 251 · «לא קיים נכס» — אף תיבה בחלק הנכס אינה מצוירת
  { key: 'vat-821', name: '821-no-property', data: { propExists: 'no', propKind: '', propKindOther: '', propTenure: '', propParty: '', industry: 'H', activity: 'שליחויות', openDate: '2026-08-31', turnover: '40000' } },
];

for (const cs of CASES) {
  const def = M.CLIENT_FORMS[cs.key];
  const T = def.template;
  const d = { ...def.sample, ...cs.data };
  console.log(`\n── ${cs.name}`);
  const blank = await renderPages(new Uint8Array(readFileSync(join(ROOT, 'public', T.fileUrl))));
  const sig = signaturePng();
  const stamp = cs.key === 'vat-821' ? stampPng() : null;
  const { bytes, layout } = await M.renderClientForm(def, d, { signature: sig, stamp, date: new Date(Date.UTC(2026, 9, 15)) });
  const again = await M.renderClientForm(def, d, { signature: sig, stamp, date: new Date(Date.UTC(2026, 9, 15)) });
  if (stamp) { const st = layout.ops.find(o => o.fieldId === 'rep.stamp'); if (st) ok('חותמת המשרד בהצהרת המייצג'); else fail('אין פעולת חותמת'); }
  writeFileSync(join(OUT, `${cs.name}.pdf`), bytes);
  if (Buffer.compare(Buffer.from(bytes), Buffer.from(again.bytes)) === 0) ok('דטרמיניסטי (אותם ערכים ⇒ אותם בייטים)'); else fail('שני ייצואים שונים');
  if (layout.issues.length === 0) ok('אין בעיות פריסה'); else fail('בעיות פריסה: ' + layout.issues.map(i => i.message).join(' | '));
  const drawnIds = new Set(layout.ops.map(o => o.fieldId));
  const filled = await renderPages(bytes);
  for (let p = 0; p < filled.length; p++) {
    const A = blank[p], B = filled[p];
    writeFileSync(join(OUT, `${cs.name}-p${p + 1}.png`), B.canvas.toBuffer('image/png'));
    const boxes = T.fields.filter(f => f.page === p + 1 && drawnIds.has(f.id)).map(f => {
      const pad = f.kind === 'signature' ? 3 : 1.5;
      return { x0: (f.box.x - pad) * SCALE, x1: (f.box.x + f.box.w + pad) * SCALE, y0: (A.H - f.box.y - f.box.h - pad) * SCALE, y1: (A.H - f.box.y + pad) * SCALE };
    });
    let outside = 0, changed = 0; const where = [];
    for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
      const i = (y * A.w + x) * 4;
      const dlt = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]);
      if (dlt < 60) continue;
      changed++;
      if (!boxes.some(b => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1)) { outside++; if (where.length < 6) where.push(`(${(x / SCALE).toFixed(0)},${(A.H - y / SCALE).toFixed(0)})`); }
    }
    if (outside === 0) ok(`עמוד ${p + 1}: ${changed} פיקסלים שונו, כולם בתוך שדות`);
    else fail(`עמוד ${p + 1}: ${outside} פיקסלים מחוץ לשדות, למשל ${where.join(' ')}`);
  }
  // כל שדה חובה שיש לו ערך — צויר
  const missing = T.fields.filter(f => f.required === 'always' && def.isActive(f, d) && !drawnIds.has(f.id));
  if (missing.length === 0) ok('כל שדות החובה צוירו'); else fail('שדות חובה שלא צוירו: ' + missing.map(f => f.label).join(', '));
  if (cs.name === '821-no-property') {
    const propDrawn = layout.ops.filter(o => o.fieldId.startsWith('prop.'));
    if (propDrawn.length === 0) ok('«לא קיים נכס»: אין ציור בחלק הנכס'); else fail('צוירו תיבות נכס: ' + propDrawn.map(o => o.fieldId).join(','));
    const od = layout.ops.filter(o => o.fieldId === 'openDate').map(o => o.text).join('');
    if (od === '0826') ok('תאריך הפתיחה 31.08.2026 ⇒ 08|26 בתיבות'); else fail('תאריך הפתיחה בתיבות: ' + od);
    const act = layout.ops.find(o => o.fieldId === 'activity.1');
    if (act && /ענף: תחבורה/.test(act.text)) ok('הענף הכלכלי בשורת התיאור'); else fail('אין ענף בשורת התיאור: ' + (act && act.text));
  }
}

console.log(`\nפלט: ${OUT}`);
console.log(failures === 0 ? '\nהכול עבר.' : `\n${failures} כשלים.`);
process.exit(failures === 0 ? 0 : 1);
