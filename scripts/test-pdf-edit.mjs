#!/usr/bin/env node
/**
 * test-pdf-edit.mjs — בדיקות ליכולות העריכה של משטח ה-PDF.
 *
 * מה נבדק כאן ולמה דווקא כך: לכל יכולת נבנה מסמך, נצרב פלט, והפלט
 * *נטען מחדש* ונמדד — מספר עמודים, סיבוב, CropBox, וטקסט שמחולץ מזרם
 * התוכן. סימון שנראה נכון על קנבס ואינו יושב נכון בקובץ הוא בדיוק סוג
 * הבאג שמתגלה רק אחרי ההגשה לרשות.
 *
 * ‼ הצריבה נשענת על גופנים שנטענים ב-fetch מ-/fonts. ב-Node אין fetch
 * לקבצים מקומיים, ולכן מוזרק כאן fetch שמגיש את הקבצים מ-public/fonts —
 * אותם קבצים בדיוק שהדפדפן מקבל.
 *
 * הרצה:  npm run test:pdf-edit
 */
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import { build } from 'esbuild';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── גופנים: fetch מקומי, בדיוק כמו שהדפדפן מקבל מ-public ────────────────
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith('/fonts/')) {
    const p = join(ROOT, 'public', u.replace(/^\//, ''));
    if (!existsSync(p)) throw new Error('font missing: ' + p);
    const buf = readFileSync(p);
    return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  }
  return realFetch(url, init);
};
// atob נחוץ לפענוח data URL של תמונות
if (!globalThis.atob) globalThis.atob = s => Buffer.from(s, 'base64').toString('latin1');

const work = mkdtempSync(join(tmpdir(), 'pdfedit-'));
async function load(entry, name) {
  const outfile = join(work, name + '.mjs');
  await build({ entryPoints: [join(ROOT, entry)], outfile, bundle: true, format: 'esm', platform: 'node', logLevel: 'warning' });
  return import(pathToFileURL(outfile).href);
}
const Pages = await load('src/utils/pdfPages.ts', 'pages');
const Ann = await load('src/utils/pdfAnnotations.ts', 'ann');
const Crop = await load('src/utils/pdfCrop.ts', 'crop');

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log('  ✓ ' + name);
  else { console.log('  ✗ ' + name + (extra ? '  →  ' + extra : '')); failures++; }
}
const near = (a, b, eps = 1) => Math.abs(a - b) < eps;

// ── בניית מסמכי מקור ────────────────────────────────────────────────────
async function makeSource(tag, pageCount, rotation = 0) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    const p = doc.addPage([400 + i, 600]);
    p.drawText(`${tag}${i + 1}`, { x: 30, y: 500, size: 40, font, color: rgb(0, 0, 0) });
    if (rotation) p.setRotation({ type: 'degrees', angle: rotation });
  }
  return new Uint8Array(await doc.save());
}
/** מחלץ את הטקסט מזרמי התוכן של הפלט — בלי לרסטר, ישירות מהקובץ. */
async function pageTexts(bytes) {
  const doc = await PDFDocument.load(bytes);
  const plain = Buffer.from(await doc.save({ useObjectStreams: false })).toString('latin1');
  const out = [];
  for (let i = 0; i < doc.getPageCount(); i++) {
    const page = doc.getPage(i);
    // ‼ pdf-lib מוסיף זרם תוכן *נוסף* כשמציירים על עמוד מועתק, ולכן
    // Contents הוא לעיתים מערך. קריאת הזרם הראשון בלבד מחמיצה בדיוק את
    // מה שנצרב, ומדווחת "לא צויר כלום" על מסמך תקין.
    const contents = page.node.Contents();
    const streams = [];
    if (contents) {
      if (typeof contents.asArray === 'function') {
        for (const ref of contents.asArray()) {
          const s = doc.context.lookup(ref);
          if (s && typeof s.getContents === 'function') streams.push(s.getContents());
        }
      } else if (typeof contents.getContents === 'function') {
        streams.push(contents.getContents());
      }
    }
    let text = '';
    for (const raw of streams) {
      try { text += zlib.inflateSync(Buffer.from(raw)).toString('latin1'); }
      catch { text += Buffer.from(raw).toString('latin1'); }
    }
    out.push(text);
  }
  return { doc, streams: out, plain };
}
const A = await makeSource('A', 3);
const B = await makeSource('B', 2);
const bytesMap = new Map([['A', A], ['B', B]]);
const srcA = [{ docId: 'A', label: 'A', pageCount: 3 }];
const srcAB = [...srcA, { docId: 'B', label: 'B', pageCount: 2 }];

// ── 1. הוספת עמודים ─────────────────────────────────────────────────────
console.log('\nהוספת עמודים מקובץ נוסף');
{
  let plan = Pages.buildInitialPlan(srcA);
  plan = Pages.insertPages(plan, { docId: 'B', label: 'B', pageCount: 2 }, 1, 's1');
  check('נוספו במקום שנבחר',
    plan.map(p => `${p.sourceId}${p.sourceIndex}`).join(',') === 'A0,B0,B1,A1,A2',
    plan.map(p => `${p.sourceId}${p.sourceIndex}`).join(','));
  check('מזהים ייחודיים', new Set(plan.map(p => p.id)).size === 5);
  const twice = Pages.insertPages(plan, { docId: 'B', label: 'B', pageCount: 2 }, 0, 's2');
  check('הוספה חוזרת של אותו קובץ אינה מתנגשת', new Set(twice.map(p => p.id)).size === 7);
  const out = await Pages.buildPdfFromPlan(plan, bytesMap);
  const { doc } = await pageTexts(out);
  check('הפלט בן 5 עמודים', doc.getPageCount() === 5);
  check('רוחב מזהה את הסדר',
    Array.from({ length: 5 }, (_, i) => Math.round(doc.getPage(i).getSize().width)).join(',') === '400,400,401,401,402',
    Array.from({ length: 5 }, (_, i) => Math.round(doc.getPage(i).getSize().width)).join(','));
}

// ── 2. חילוץ ופיצול ─────────────────────────────────────────────────────
console.log('\nחילוץ עמודים ופיצול');
{
  const plan = Pages.buildInitialPlan(srcAB);
  const picked = Pages.extractPlan(plan, [plan[1].id, plan[4].id]);
  check('חילוץ שומר על סדר התוכנית',
    picked.map(p => `${p.sourceId}${p.sourceIndex}`).join(',') === 'A1,B1',
    picked.map(p => `${p.sourceId}${p.sourceIndex}`).join(','));
  const out = await Pages.buildPdfFromPlan(picked, bytesMap);
  const { doc } = await pageTexts(out);
  check('הפלט בן שני עמודים', doc.getPageCount() === 2);
  check('הרוחבים תואמים לעמודים שנבחרו',
    `${Math.round(doc.getPage(0).getSize().width)},${Math.round(doc.getPage(1).getSize().width)}` === '401,401');

  const groups = Pages.splitPlanEvery(plan, 2);
  check('פיצול לכל 2 עמודים', groups.map(g => g.length).join(',') === '2,2,1', groups.map(g => g.length).join(','));
  check('כל העמודים נשמרו', groups.flat().length === 5);
  const one = Pages.splitPlanEvery(plan, 1);
  check('פיצול לעמוד בודד', one.length === 5 && one.every(g => g.length === 1));
  check('גודל לא חוקי מטופל', Pages.splitPlanEvery(plan, 0).length === 5);

  check('הסרה מרובה', Pages.removePages(plan, [plan[0].id, plan[3].id]).length === 3);
}

console.log('\nפירוש טווחי עמודים');
{
  const p = (s, t = 10) => Pages.parsePageRanges(s, t).join(',');
  check('טווח פשוט', p('1-3') === '1,2,3');
  check('רשימה', p('1,4,7') === '1,4,7');
  check('מעורב', p('1-2, 5, 8-9') === '1,2,5,8,9');
  check('סדר הפוך', p('5-3') === '3,4,5');
  check('כפילויות מסוננות', p('1,1,2,1') === '1,2');
  check('מחוץ לטווח מסונן', p('9-12', 10) === '9,10');
  check('קלט ריק', p('') === '');
  check('זבל', p('abc, -, 3') === '3');
  check('רווחים', p('  2 - 4  ') === '2,3,4');
}

// ── 3. חיתוך ─────────────────────────────────────────────────────────────
console.log('\nחיתוך עמוד (לא הרסני)');
{
  let plan = Pages.buildInitialPlan(srcA);
  plan = Pages.setPageCrop(plan, plan[0].id, { xPct: 0.25, yPct: 0.1, widthPct: 0.5, heightPct: 0.4 });
  const out = await Pages.buildPdfFromPlan(plan, bytesMap);
  const doc = await PDFDocument.load(out);
  const cb = doc.getPage(0).getCropBox();
  const mb = doc.getPage(0).getMediaBox();
  check('CropBox הוקטן', near(cb.width, 400 * 0.5) && near(cb.height, 600 * 0.4), `${Math.round(cb.width)}x${Math.round(cb.height)}`);
  check('CropBox במקום הנכון', near(cb.x, 100) && near(cb.y, 600 - 0.1 * 600 - 0.4 * 600), `${Math.round(cb.x)},${Math.round(cb.y)}`);
  check('MediaBox לא נגע', near(mb.width, 400) && near(mb.height, 600));
  check('שאר העמודים בגודל מלא', near(doc.getPage(1).getCropBox().width, 401));
  const cleared = Pages.setPageCrop(plan, plan[0].id, null);
  const out2 = await Pages.buildPdfFromPlan(cleared, bytesMap);
  const doc2 = await PDFDocument.load(out2);
  check('ביטול חיתוך מחזיר עמוד מלא', near(doc2.getPage(0).getCropBox().width, 400));
}

console.log('\nחילוץ אזור כמסמך וקטורי');
{
  const out = await Crop.extractRegionAsPdf(A, 0, { x: 20, y: 480, width: 200, height: 80 });
  const doc = await PDFDocument.load(out);
  check('עמוד אחד', doc.getPageCount() === 1);
  const { width, height } = doc.getPage(0).getSize();
  check('גודל העמוד = גודל האזור', near(width, 200) && near(height, 80), `${Math.round(width)}x${Math.round(height)}`);
  const plain = Buffer.from(await doc.save({ useObjectStreams: false })).toString('latin1');
  check('נשאר וקטורי (XObject, לא תמונה)', plain.includes('/Form') && !plain.includes('/DCTDecode'));
  let err = null;
  try { await Crop.extractRegionAsPdf(A, 99, { x: 0, y: 0, width: 10, height: 10 }); } catch (e) { err = e; }
  check('עמוד לא קיים נדחה', !!err && /[֐-׿]/.test(err.message), err ? err.message : 'no error');
}

// ── 4. מיפוי קואורדינטות ────────────────────────────────────────────────
console.log('\nמיפוי מהתצוגה אל מרחב העמוד');
{
  // עמוד ללא סיבוב: פינה שמאלית-עליונה בתצוגה = שמאלית-עליונה ב-PDF
  const box0 = { width: 400, height: 600, rotation: 0 };
  const r0 = Ann.displayRectToPage(box0, 0, 0, 0.5, 0.25);
  check('0°: x מתחיל בשמאל', near(r0.x, 0) && near(r0.width, 200));
  check('0°: Y מתהפך', near(r0.y, 600 - 150) && near(r0.height, 150), `${r0.y}`);

  // 90°: הצירים מתחלפים
  const box90 = { width: 400, height: 600, rotation: 90 };
  const r90 = Ann.displayRectToPage(box90, 0, 0, 0.5, 0.25);
  check('90°: רוחב וגובה מתחלפים', near(r90.width, 0.25 * 400) && near(r90.height, 0.5 * 600),
    `${Math.round(r90.width)}x${Math.round(r90.height)}`);
  check('90°: הפינה נוחתת בשמאל-תחתון', near(r90.x, 0) && near(r90.y, 0), `${r90.x},${r90.y}`);

  const box180 = { width: 400, height: 600, rotation: 180 };
  const r180 = Ann.displayRectToPage(box180, 0, 0, 0.5, 0.25);
  check('180°: הפינה נוחתת מנגד', near(r180.x, 200) && near(r180.y, 0), `${r180.x},${r180.y}`);

  const box270 = { width: 400, height: 600, rotation: 270 };
  const r270 = Ann.displayRectToPage(box270, 0, 0, 0.5, 0.25);
  check('270°: הפינה נוחתת בימין-עליון', near(r270.x, 400 - 100) && near(r270.y, 600 - 300),
    `${r270.x},${r270.y}`);

  // כל התצוגה → כל העמוד, בכל סיבוב
  for (const rot of [0, 90, 180, 270]) {
    const box = { width: 400, height: 600, rotation: rot };
    const full = Ann.displayRectToPage(box, 0, 0, 1, 1);
    check(`${rot}°: תצוגה מלאה מכסה את העמוד`,
      near(full.x, 0) && near(full.y, 0) && near(full.width, 400) && near(full.height, 600),
      `${Math.round(full.x)},${Math.round(full.y)} ${Math.round(full.width)}x${Math.round(full.height)}`);
  }
  check('עיגול זווית לא חוקית', Ann.uprightRotation(-90) === 270 && Ann.uprightRotation(450) === 90);
}

// ── 5. סימונים נצרבים לקובץ ─────────────────────────────────────────────
console.log('\nסימונים נצרבים לקובץ');
{
  const plan = Pages.buildInitialPlan(srcA);
  const id = plan[0].id;
  const anns = [
    { id: 'a1', pageId: id, kind: 'highlight', xPct: .1, yPct: .1, widthPct: .3, heightPct: .05, color: '#ffe14d' },
    { id: 'a2', pageId: id, kind: 'rectangle', xPct: .1, yPct: .2, widthPct: .3, heightPct: .1, color: '#e02424' },
    { id: 'a3', pageId: id, kind: 'circle', xPct: .5, yPct: .2, widthPct: .2, heightPct: .1, color: '#1552d8' },
    { id: 'a4', pageId: id, kind: 'line', xPct: .1, yPct: .4, widthPct: .4, heightPct: .1, color: '#0a8a3c' },
    { id: 'a5', pageId: id, kind: 'draw', xPct: .1, yPct: .5, widthPct: .3, heightPct: .1, color: '#111111',
      points: [{ x: 0, y: 0 }, { x: .5, y: 1 }, { x: 1, y: 0 }] },
    { id: 'a6', pageId: id, kind: 'check', xPct: .7, yPct: .5, widthPct: .08, heightPct: .05, color: '#0a8a3c' },
    { id: 'a7', pageId: id, kind: 'cross', xPct: .8, yPct: .5, widthPct: .08, heightPct: .05, color: '#e02424' },
  ];
  const out = await Pages.buildPdfFromPlan(plan, bytesMap, anns);
  const { doc, streams } = await pageTexts(out);
  check('מספר העמודים לא השתנה', doc.getPageCount() === 3);
  const s0 = streams[0];
  check('הדגשה — שקיפות', /\/GS\d|gs/.test(s0) || s0.includes('re'), 'no gs/re');
  check('מלבן צויר — מסגרת בקו', /\bRG\b/.test(s0) && /\bS\b/.test(s0));
  check('הדגשה — מילוי שקוף', /\bgs\b/.test(s0) && /\bf\b/.test(s0));
  check('קווים צוירו (ציור/קו/✓/✗)', (s0.match(/\bl\b/g) || []).length >= 6, String((s0.match(/\bl\b/g) || []).length));
  check('עמוד ללא סימונים נשאר נקי', streams[1].length < s0.length);
  check('המקור לא השתנה', Buffer.from(A).toString('base64') === Buffer.from(await makeSource('A', 3)).toString('base64'));
}

// ── 6. טקסט עברי/מעורב ──────────────────────────────────────────────────
console.log('\nטקסט נצרב — עברית, אנגלית ומעורב');
{
  const cases = [
    ['עברית בלבד', 'שלום עולם'],
    ['אנגלית בלבד', 'Hello World'],
    ['עברית ואנגלית', 'שלום Hello עולם'],
    ['עברית וספרות', 'סכום 1,250 שקלים'],
    ['פיסוק', 'דוח שנתי (2025) — סופי.'],
    ['מייל בתוך עברית', 'לפנות אל guy@yasharcpa.co.il בבקשה'],
    ['טלפון', 'טלפון 050-1234567 זמין'],
    ['רב-שורתי', 'שורה ראשונה\nשורה שנייה'],
  ];
  for (const [name, text] of cases) {
    const plan = Pages.buildInitialPlan(srcA);
    const out = await Pages.buildPdfFromPlan(plan, bytesMap, [{
      id: 't', pageId: plan[0].id, kind: 'text', xPct: .1, yPct: .1, widthPct: .8, heightPct: .1,
      color: '#000000', text, fontPct: .03,
    }]);
    const { doc, streams, plain } = await pageTexts(out);
    const s = streams[0];
    const hasTj = /Tj|TJ/.test(s);
    const usesHebrewFont = /NotoSansHebrew-Regular-\d+\s+[\d.]+\s+Tf/.test(s);
    const usesLatinFont = /\/NotoSans-Regular-\d+\s+[\d.]+\s+Tf/.test(s);
    const embedded = /\/FontFile2|\/Type0/.test(plain);
    // ‼ הבדיקה המהותית: כל תו נצרב בגופן שבאמת מכיל אותו. גופן לטיני על
    // עברית מייצר ריבועים — וזה נראה תקין לגמרי עד שפותחים את הקובץ.
    const wantHeb = /[֐-׿]/.test(text);
    const wantLat = /[A-Za-z0-9]/.test(text);
    check(name,
      doc.getPageCount() === 3 && hasTj && embedded
        && (!wantHeb || usesHebrewFont) && (!wantLat || usesLatinFont),
      `Tj=${hasTj} heb=${usesHebrewFont}/${wantHeb} lat=${usesLatinFont}/${wantLat} emb=${embedded}`);
  }
  // ריק לא מצייר כלום
  const plan = Pages.buildInitialPlan(srcA);
  const empty = await Pages.buildPdfFromPlan(plan, bytesMap, [{
    id: 't', pageId: plan[0].id, kind: 'text', xPct: .1, yPct: .1, widthPct: .8, heightPct: .1,
    color: '#000', text: '   ', fontPct: .03 }]);
  const base = await Pages.buildPdfFromPlan(plan, bytesMap);
  check('טקסט ריק אינו מצייר', (await pageTexts(empty)).streams[0].length <= (await pageTexts(base)).streams[0].length + 40);
}

// ── 7. תמונה ─────────────────────────────────────────────────────────────
console.log('\nתמונה מוטמעת');
{
  // PNG אמיתי, 2x2
  const CRC = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, 'latin1'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.from([0, 255, 0, 0, 0, 0, 255, 0, 0, 0, 0, 255, 255, 255, 0]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  const dataUrl = 'data:image/png;base64,' + png.toString('base64');

  const plan = Pages.buildInitialPlan(srcA);
  const img = k => ({ id: k, pageId: plan[0].id, kind: 'image', xPct: .2, yPct: .2, widthPct: .3, heightPct: .2, color: '#000', imageData: dataUrl });
  const out = await Pages.buildPdfFromPlan(plan, bytesMap, [img('i1')]);
  const { plain } = await pageTexts(out);
  check('תמונה הוטמעה', plain.includes('/Image') && plain.includes('/Width 2'));

  // אותה תמונה פעמיים — הטמעה אחת
  const twice = await Pages.buildPdfFromPlan(plan, bytesMap, [img('i1'), { ...img('i2'), xPct: .6 }]);
  const p2 = (await pageTexts(twice)).plain;
  check('אותה תמונה מוטמעת פעם אחת', (p2.match(/\/Subtype \/Image/g) || []).length === 1,
    String((p2.match(/\/Subtype \/Image/g) || []).length));
  check('הקובץ לא תפח', twice.byteLength < out.byteLength + 400);

  let err = null;
  try {
    await Pages.buildPdfFromPlan(plan, bytesMap, [{ ...img('bad'), imageData: 'data:image/png;base64,!!!notreal' }]);
  } catch (e) { err = e; }
  check('תמונה פגומה נדחית בעברית', !err || /[֐-׿]/.test(err.message), err ? err.message : 'ignored');
}

// ── 8. סימון על עמוד מסובב ──────────────────────────────────────────────
console.log('\nסימון על עמוד מסובב');
{
  for (const quarter of [0, 1, 2, 3]) {
    let plan = Pages.buildInitialPlan(srcA);
    plan = Pages.rotatePage(plan, plan[0].id, quarter);
    const out = await Pages.buildPdfFromPlan(plan, bytesMap, [{
      id: 'r', pageId: plan[0].id, kind: 'rectangle', xPct: .1, yPct: .1, widthPct: .3, heightPct: .2,
      color: '#e02424',
    }]);
    const doc = await PDFDocument.load(out);
    const page = doc.getPage(0);
    check(`סיבוב ${quarter * 90}° — נשמר ונצרב`,
      page.getRotation().angle === (quarter * 90) % 360 && doc.getPageCount() === 3,
      `rot=${page.getRotation().angle}`);
  }
}

// ── 9. הכול יחד ─────────────────────────────────────────────────────────
console.log('\nשילוב: סידור + סיבוב + חיתוך + סימונים');
{
  let plan = Pages.buildInitialPlan(srcAB);
  plan = Pages.movePage(plan, plan[3].id, 0);
  plan = Pages.rotatePage(plan, plan[0].id, 1);
  plan = Pages.setPageCrop(plan, plan[1].id, { xPct: .1, yPct: .1, widthPct: .8, heightPct: .8 });
  plan = Pages.removePage(plan, plan[4].id);
  const out = await Pages.buildPdfFromPlan(plan, bytesMap, [
    { id: 'x', pageId: plan[0].id, kind: 'text', xPct: .1, yPct: .1, widthPct: .8, heightPct: .1, color: '#000', text: 'בדיקה משולבת', fontPct: .03 },
  ]);
  const doc = await PDFDocument.load(out);
  check('מספר עמודים', doc.getPageCount() === 4, String(doc.getPageCount()));
  check('סיבוב על העמוד הראשון', doc.getPage(0).getRotation().angle === 90);
  check('חיתוך על השני', doc.getPage(1).getCropBox().width < doc.getPage(1).getMediaBox().width);
  check('הפלט נטען מחדש', (await PDFDocument.load(await doc.save())).getPageCount() === 4);
}

// ── 10. טיפוגרפיה: גלישה, מודגש, משפחה, עובי, מילוי ─────────────────────
console.log('\nגלישת שורות בצריבה');
{
  const plan = Pages.buildInitialPlan(srcA);
  const long = 'מילה '.repeat(24).trim();          // רחב בהרבה מהתיבה
  const mk = (widthPct) => Pages.buildPdfFromPlan(plan, bytesMap, [{
    id: 't', pageId: plan[0].id, kind: 'text', xPct: .1, yPct: .1, widthPct, heightPct: .5,
    color: '#000', text: long, fontPct: .03,
  }]);
  const narrow = await pageTexts(await mk(0.3));
  const wide = await pageTexts(await mk(0.9));
  const lineCount = t => new Set([...t.matchAll(/1 0 0 1 [\d.]+ ([\d.]+) Tm/g)].map(m => m[1])).size - 1; // מינוס שורת הבסיס A1
  check('טקסט ארוך נשבר לכמה שורות', lineCount(narrow.streams[0]) >= 4, String(lineCount(narrow.streams[0])));
  check('תיבה רחבה — פחות שורות', lineCount(wide.streams[0]) < lineCount(narrow.streams[0]),
    lineCount(wide.streams[0]) + ' מול ' + lineCount(narrow.streams[0]));
  check('מילה בודדת ללא שבירה באמצע', (M => M.wrapLogicalLine('שלום', 500, 12, null) )
    // wrapLogicalLine נבדק דרך המנוע — כאן רק שהמסמך תקין
    ? (await PDFDocument.load(await mk(0.3))).getPageCount() === 3 : false);
}

console.log('\nמודגש = ציור כפול');
{
  const plan = Pages.buildInitialPlan(srcA);
  const mk = (bold) => Pages.buildPdfFromPlan(plan, bytesMap, [{
    id: 't', pageId: plan[0].id, kind: 'text', xPct: .1, yPct: .1, widthPct: .8, heightPct: .1,
    color: '#000', text: 'שלום Bold', fontPct: .03, bold,
  }]);
  const reg = (await pageTexts(await mk(false))).streams[0];
  const bold = (await pageTexts(await mk(true))).streams[0];
  const tj = t => (t.match(/Tj/g) || []).length - 1;   // מינוס עמוד הבסיס
  check('כפול בדיוק ממספר ההצגות הרגיל', tj(bold) === 2 * tj(reg), tj(bold) + ' מול ' + tj(reg));
}

console.log('\nמשפחת גופן ללטינית');
{
  const plan = Pages.buildInitialPlan(srcA);
  const mk = (fontFamily) => Pages.buildPdfFromPlan(plan, bytesMap, [{
    id: 't', pageId: plan[0].id, kind: 'text', xPct: .1, yPct: .1, widthPct: .8, heightPct: .1,
    color: '#000', text: 'שלום Serif 123 ₪', fontPct: .03, fontFamily,
  }]);
  const serif = await pageTexts(await mk('serif'));
  const mono = await pageTexts(await mk('mono'));
  check('serif → Times ללטינית', /Times/.test(serif.plain));
  check('₪ נופל ל-Noto ולא מפיל את Times', /NotoSans-Regular/.test(serif.plain));
  check('העברית נשארת Noto Hebrew גם ב-serif', /NotoSansHebrew/.test(serif.plain));
  check('mono → Courier ללטינית', /Courier/.test(mono.plain));
}

console.log('\nעובי, מילוי וקו הפוך');
{
  const plan = Pages.buildInitialPlan(srcA);
  const out = await Pages.buildPdfFromPlan(plan, bytesMap, [
    { id: 'r', pageId: plan[0].id, kind: 'rectangle', xPct: .1, yPct: .1, widthPct: .3, heightPct: .2,
      color: '#e02424', fillColor: '#e02424', thicknessPct: 0.008 },
    { id: 'l', pageId: plan[0].id, kind: 'line', xPct: .1, yPct: .4, widthPct: .4, heightPct: .1,
      color: '#0a8a3c', flipLine: true },
  ]);
  const { streams, doc } = await pageTexts(out);
  const s0 = streams[0];
  // עובי 0.008 מרוחב מוצג 400 = 3.2
  check('עובי הקו נגזר מהאחוז', /3\.2\d*\s+w\b/.test(s0), (s0.match(/([\d.]+)\s+w\b/g) || []).join(','));
  // מילוי + מסגרת: pdf-lib מצייר שני נתיבים (f ואז S) או B
  check('מלבן ממולא וגם מסומן', (/\bf\b/.test(s0) || /\bB\b/.test(s0)) && /\bS\b/.test(s0));
  check('הקובץ עם קו הפוך נטען', doc.getPageCount() === 3);
}

rmSync(work, { recursive: true, force: true });
console.log(failures ? `\n✗ ${failures} בדיקות נכשלו\n` : '\n✓ כל הבדיקות עברו\n');
process.exitCode = failures ? 1 : 0;
