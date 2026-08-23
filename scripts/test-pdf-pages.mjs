#!/usr/bin/env node
/**
 * test-pdf-pages.mjs — בדיקות למודל עמודי ה-PDF (src/utils/pdfPages.ts).
 *
 * למה סקריפט: סדר עמודים, סיבוב והסרה הם בדיוק סוג הבאג ש"נשמר בהצלחה"
 * ומתגלה רק כשמישהו פותח את הקובץ אצל הרשות. כאן נבנים מסמכי מקור עם
 * תוכן מזוהה בכל עמוד, נבנה פלט, ואז הפלט *נקרא מחדש* ומוודאים שכל עמוד
 * הוא בדיוק זה שהיה אמור להיות — לא רק שמספר העמודים נכון.
 *
 * הרצה:  npm run test:pdf-pages
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'pdfpages-'));
const bundle = join(work, 'pdfPages.mjs');
await build({
  entryPoints: [join(ROOT, 'src/utils/pdfPages.ts')],
  outfile: bundle, bundle: true, format: 'esm', platform: 'node', logLevel: 'warning',
});
const M = await import(pathToFileURL(bundle).href);

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log('  ✓ ' + name);
  else { console.log('  ✗ ' + name + (extra ? '  →  ' + extra : '')); failures++; }
}

/**
 * מסמך מקור שבו כל עמוד נושא מזהה ייחודי בטקסט, ומידות ייחודיות —
 * כך אפשר לזהות בפלט בדיוק איזה עמוד נחת איפה.
 */
async function makeSource(tag, pageCount, opts = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    // רוחב ייחודי לכל עמוד — חתימה נוספת מעבר לטקסט
    const page = doc.addPage([300 + i, 500]);
    page.drawText(`${tag}${i + 1}`, { x: 20, y: 400, size: 36, font, color: rgb(0, 0, 0) });
    if (opts.baseRotation) page.setRotation({ type: 'degrees', angle: opts.baseRotation });
  }
  return new Uint8Array(await doc.save());
}

/** מחלץ מכל עמוד בפלט את המזהה שלו + סיבוב + מידות. */
async function readOut(bytes) {
  const doc = await PDFDocument.load(bytes);
  const out = [];
  for (let i = 0; i < doc.getPageCount(); i++) {
    const p = doc.getPage(i);
    const { width, height } = p.getSize();
    out.push({ rotation: p.getRotation().angle, width: Math.round(width), height: Math.round(height) });
  }
  return out;
}

const A = await makeSource('A', 3);          // A1 A2 A3  (רוחב 300,301,302)
const B = await makeSource('B', 2);          // B1 B2      (רוחב 300,301)
const R = await makeSource('R', 1, { baseRotation: 180 });

console.log('\nזיהוי PDF לפי תוכן');
check('PDF אמיתי', M.isPdfBytes(A));
check('טקסט אינו PDF', !M.isPdfBytes(new TextEncoder().encode('שלום')));
check('ריק', !M.isPdfBytes(new Uint8Array(0)));
check('JPEG אינו PDF', !M.isPdfBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])));
check('כותרת אחרי זבל מותרת', M.isPdfBytes(new Uint8Array([0, 0, 0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])));

console.log('\nמתי מוצעת הפעולה');
check('mime pdf', M.looksLikePdf('application/pdf', 'a.pdf') === true);
check('תמונה לא', M.looksLikePdf('image/jpeg', 'a.jpg') === false);
check('תמונה ששמה pdf. לא', M.looksLikePdf('image/jpeg', 'a.pdf') === false);
check('octet-stream לפי סיומת', M.looksLikePdf('application/octet-stream', 'a.PDF') === true);
check('octet-stream בלי סיומת', M.looksLikePdf('application/octet-stream', 'scan') === false);

console.log('\nתוכנית פתיחה');
const sources = [{ docId: 'A', label: 'A', pageCount: 3 }, { docId: 'B', label: 'B', pageCount: 2 }];
let plan = M.buildInitialPlan(sources);
check('סדר פתיחה = כל המקור הראשון ואז השני',
  plan.map(p => `${p.sourceId}${p.sourceIndex}`).join(',') === 'A0,A1,A2,B0,B1',
  plan.map(p => `${p.sourceId}${p.sourceIndex}`).join(','));
check('מזהים ייחודיים', new Set(plan.map(p => p.id)).size === 5);

console.log('\nסידור מחדש');
{
  const ids = plan.map(p => p.id);
  const moved = M.movePage(plan, ids[4], 1);          // B2 → משבצת 2
  check('העברה אחורה', moved.map(p => `${p.sourceId}${p.sourceIndex}`).join(',') === 'A0,B1,A1,A2,B0',
    moved.map(p => `${p.sourceId}${p.sourceIndex}`).join(','));
  const fwd = M.movePage(plan, ids[0], 4);            // A1 → הסוף
  check('העברה קדימה', fwd.map(p => `${p.sourceId}${p.sourceIndex}`).join(',') === 'A1,A2,B0,B1,A0',
    fwd.map(p => `${p.sourceId}${p.sourceIndex}`).join(','));
  check('אותו מקום = ללא שינוי', M.movePage(plan, ids[2], 2) === plan);
  check('מעבר לגבול נחתך', M.movePage(plan, ids[0], 99).map(p => p.id).pop() === ids[0]);
  check('מזהה לא קיים לא משנה דבר', M.movePage(plan, 'nope', 0) === plan);
}

console.log('\nסיבוב');
{
  const id = plan[0].id;
  let r = M.rotatePage(plan, id, 1);
  check('רבע', r[0].rotation === 90);
  r = M.rotatePage(r, id, 1); check('חצי', r[0].rotation === 180);
  r = M.rotatePage(r, id, 1); check('שלושה רבעים', r[0].rotation === 270);
  r = M.rotatePage(r, id, 1); check('סיבוב מלא חוזר לאפס', r[0].rotation === 0);
  check('אחורה מאפס = 270', M.rotatePage(plan, id, -1)[0].rotation === 270);
  check('שאר העמודים לא זזו', M.rotatePage(plan, id, 1).slice(1).every(p => p.rotation === 0));
}

console.log('\nהסרה');
{
  const removed = M.removePage(plan, plan[1].id);
  check('עמוד ירד', removed.length === 4);
  check('הסדר נשמר', removed.map(p => `${p.sourceId}${p.sourceIndex}`).join(',') === 'A0,A2,B0,B1');
}

const bytesMap = new Map([['A', A], ['B', B]]);

console.log('\nהפלט — סדר אמיתי בקובץ שנוצר');
{
  // A1 → B1 → A2 → B2 → A3  (הדוגמה מהאפיון)
  const ids = plan.map(p => p.id);
  const order = [ids[0], ids[3], ids[1], ids[4], ids[2]];
  const woven = order.map(id => plan.find(p => p.id === id));
  const out = await M.buildPdfFromPlan(woven, bytesMap);
  const pages = await readOut(out);
  check('חמישה עמודים', pages.length === 5, String(pages.length));
  // רוחב מזהה את עמוד המקור: A→300,301,302  B→300,301
  check('סדר משוזר נכון', pages.map(p => p.width).join(',') === '300,300,301,301,302',
    pages.map(p => p.width).join(','));
  check('הפלט נפתח בפרסר', (await PDFDocument.load(out)).getPageCount() === 5);
}

console.log('\nהפלט — סיבוב נצרב בקובץ');
{
  let p2 = M.rotatePage(plan, plan[0].id, 1);       // A1 ברבע
  p2 = M.rotatePage(p2, p2[4].id, 2);               // B2 בחצי
  const out = await M.buildPdfFromPlan(p2, bytesMap);
  const pages = await readOut(out);
  check('עמוד ראשון 90', pages[0].rotation === 90, String(pages[0].rotation));
  check('עמוד אחרון 180', pages[4].rotation === 180, String(pages[4].rotation));
  check('שאר העמודים 0', [1, 2, 3].every(i => pages[i].rotation === 0));
}

console.log('\nהפלט — סיבוב מצטרף לסיבוב שכבר בעמוד');
{
  const rPlan = M.rotatePage(M.buildInitialPlan([{ docId: 'R', label: 'R', pageCount: 1 }]), 'R:0', 1);
  const out = await M.buildPdfFromPlan(rPlan, new Map([['R', R]]));
  const pages = await readOut(out);
  check('180 במקור + 90 מהמשתמש = 270', pages[0].rotation === 270, String(pages[0].rotation));
}

console.log('\nהפלט — עמוד שהוסר באמת נעדר');
{
  const without = M.removePage(plan, plan[1].id);   // בלי A2 (רוחב 301 של A)
  const out = await M.buildPdfFromPlan(without, bytesMap);
  const pages = await readOut(out);
  check('ארבעה עמודים', pages.length === 4);
  check('הרצף בלי העמוד שהוסר', pages.map(p => p.width).join(',') === '300,302,300,301',
    pages.map(p => p.width).join(','));
}

console.log('\nהפלט — המקורות לא השתנו');
{
  const beforeA = Buffer.from(A).toString('base64');
  const beforeB = Buffer.from(B).toString('base64');
  await M.buildPdfFromPlan(plan, bytesMap);
  check('מקור A זהה בית-בבית', Buffer.from(A).toString('base64') === beforeA);
  check('מקור B זהה בית-בבית', Buffer.from(B).toString('base64') === beforeB);
}

console.log('\nכשלים נעצרים לפני שמירה');
{
  const hebrew = s => /[֐-׿]/.test(s);
  const cases = [
    ['תוכנית ריקה', [], bytesMap],
    ['מקור חסר', plan, new Map([['A', A]])],
    ['מקור שאינו PDF', plan, new Map([['A', A], ['B', new TextEncoder().encode('not a pdf')]])],
    ['מקור ריק', plan, new Map([['A', A], ['B', new Uint8Array(0)]])],
  ];
  for (const [name, pl, map] of cases) {
    let err = null;
    try { await M.buildPdfFromPlan(pl, map); } catch (e) { err = e; }
    check(name, err instanceof M.PdfPlanError && hebrew(err.message), err ? err.message : 'לא נזרקה שגיאה');
  }
  let err = null;
  const bad = [{ id: 'x', sourceId: 'A', sourceIndex: 99, rotation: 0 }];
  try { await M.buildPdfFromPlan(bad, bytesMap); } catch (e) { err = e; }
  check('עמוד מחוץ לטווח', err instanceof M.PdfPlanError, err ? err.message : 'לא נזרקה שגיאה');
}

console.log('\nמסמך גדול');
{
  const big = await makeSource('X', 60);
  const bigPlan = M.buildInitialPlan([{ docId: 'X', label: 'X', pageCount: 60 }]);
  const reversed = bigPlan.slice().reverse();
  const t0 = process.hrtime.bigint();
  const out = await M.buildPdfFromPlan(reversed, new Map([['X', big]]));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const pages = await readOut(out);
  check('60 עמודים', pages.length === 60);
  check('הסדר הפוך במדויק', pages.map(p => p.width).join(',') ===
    Array.from({ length: 60 }, (_, i) => 300 + (59 - i)).join(','));
  check(`נבנה תוך ${Math.round(ms)}ms`, ms < 8000, `${Math.round(ms)}ms`);
  // ‼ העתקה אחת לכל מקור ולא לכל עמוד — אחרת הקובץ מתנפח פי כמה
  check('הגודל סביר', out.byteLength < big.byteLength * 3,
    `${out.byteLength} מול מקור ${big.byteLength}`);
}

console.log('\nשם ברירת מחדל');
check('מיזוג', M.defaultOutputName('דוח שנתי.pdf', true) === 'דוח שנתי - מאוחד', M.defaultOutputName('דוח שנתי.pdf', true));
check('ארגון', M.defaultOutputName('דוח שנתי.pdf', false) === 'דוח שנתי - ערוך');
check('בלי סיומת', M.defaultOutputName('סריקה', true) === 'סריקה - מאוחד');
check('שם ריק', M.defaultOutputName('', true) === 'מסמך - מאוחד');

rmSync(work, { recursive: true, force: true });
console.log(failures ? `\n✗ ${failures} בדיקות נכשלו\n` : '\n✓ כל הבדיקות עברו\n');
process.exitCode = failures ? 1 : 0;
