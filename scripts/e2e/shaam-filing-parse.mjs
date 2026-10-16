// פענוח רשימות שע״ם דרך pdfjs אמיתי — (א) ה-PDF האמיתיים מתיקיית הראיות (פנימית, לא בריפו), (ב) PDF סינתטיים
// שנבנים כאן מהדוגמאות (גופן Courier New, 6pt לתו — כמו הדפסת המסוף) ונקראים בחזרה. (ב) גם מייצר קבצי הדגמה ל-QA.
//   node scripts/e2e/shaam-filing-parse.mjs [--evidence <תיקיית הראיות>] [--out <תיקייה לקבצי הדגמה>]
// ‼ הבדיקות על הקובץ האמיתי לא מדפיסות ולא שומרות שמות או מספרי תיק.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve('.');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const EVIDENCE = arg('--evidence') ?? resolve(ROOT, '../../../docs/evidence/shaam-filing-monitor-2026-10-16');
const OUT = arg('--out');

const pdfjs = await import(pathToFileURL(join(ROOT, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
const { loadProductCode, makePdf: makePdfWith, FONT } = await import(pathToFileURL(join(ROOT, 'scripts/e2e/shaam-filing-pdf.mjs')).href);
const P = await loadProductCode();

let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${info}` : ''}`); };

async function readPdf(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    pages.push(P.parseGrid(P.itemsToGrid(tc.items.filter(it => typeof it.str === 'string').map(it => ({ x: it.transform[4], y: it.transform[5], width: it.width, str: it.str, dir: it.dir })))));
  }
  return pages;
}

// ── (א) הקבצים האמיתיים ─────────────────────────────────────────────────────
console.log('\n── קבצי הראיות האמיתיים (שע״ם, 15–16.10.2026)');
const ahzm = join(EVIDENCE, 'original-ahzm-unfiled-no-fine.pdf'), idom = join(EVIDENCE, 'original-idom-1-5.pdf');
if (!existsSync(ahzm) || !existsSync(idom)) {
  console.log(`  ⚠ תיקיית הראיות לא נמצאה (${EVIDENCE}) — דילוג. העבירו --evidence <תיקייה>.`);
} else {
  const [w] = await readPdf(readFileSync(ahzm));
  ok(w.status === 'ok' && w.kind === 'wealth' && w.group === 'unfiled_no_fine', 'הצהרת הון: זוהתה רשימת «לא הגישו ולא חייבים בקנס»', JSON.stringify([w.status, w.group, w.problems]));
  ok(w.page === 1 && w.pageTotal === 1, 'דף 1 מתוך 1');
  ok(w.producedAt === '2026-10-16T01:05:49', 'זמן ההפקה כפי שמופיע', w.producedAt);
  ok(w.rows.length === 1, 'שורה אחת', String(w.rows.length));
  const r = w.rows[0] ?? {};
  ok(/^0\d{8}$/.test(r.fileNumber ?? ''), 'מספר תיק — 9 ספרות עם אפס מוביל (נשמר כמחרוזת)');
  ok(r.yearShown === '2025' && r.legalDue === '2026-11-30' && r.problems?.length === 0, 'שנה 2025 כפי שמופיעה, מועד 30.11.2026', JSON.stringify([r.yearShown, r.legalDue, r.problems]));
  ok(/ו\/או/.test(r.name ?? '') && (r.name ?? '').split(' ').length >= 4, 'השם נקרא בסדר הנכון (תיק משותף, «ו/או»)');
  ok(r.office === '45' && r.fileType === '52', 'פקיד שומה וסוג תיק');
  const pages = await readPdf(readFileSync(idom));
  ok(pages.length === 1 && pages[0].status === 'legacy_annual' && pages[0].rows.length === 0, 'הקובץ השנתי הישן: «חסר סימון חבות», אף שורה לא חוזרת', JSON.stringify([pages[0]?.status, pages[0]?.rows?.length]));
  ok(/7 שורות לא נקלטו/.test(pages[0].problems[0] ?? ''), 'ההודעה אומרת כמה שורות לא נקלטו', pages[0].problems[0]);
  ok(pages[0].taxYear === 2025 && pages[0].producedOn === '2026-10-15', 'שנת המס ותאריך ההפקה נקראו');
}

// ── (ב) PDF סינתטיים — נבנים בגופן קבוע ונקראים בחזרה ─────────────────────────
const makePdf = (pages) => makePdfWith(P, pages);

if (!existsSync(FONT)) {
  console.log('\n  ⚠ אין Courier New במחשב — דילוג על הקבצים הסינתטיים');
} else {
  console.log('\n── PDF סינתטיים (דוגמה) — בנייה וקריאה חוזרת דרך pdfjs');
  const annual = await makePdf([P.idomPage({ year: 2025, rows: P.ANNUAL_SAMPLE_ROWS })]);
  const [a] = await readPdf(annual);
  const open = a.rows.filter(r => r.required === true && !r.filedOn && !r.noAssessment);
  ok(a.status === 'ok' && a.taxYear === 2025, 'דוח שנתי (צילום 19, דוגמה) — נקרא', JSON.stringify([a.status, a.problems]));
  ok(JSON.stringify(open.map(r => r.legalDue)) === JSON.stringify(['2026-10-31', '2026-11-30', '2026-11-30']), '3 פתוחות: 31.10, 30.11, 30.11', JSON.stringify(open.map(r => [r.fileNumber, r.legalDue])));
  ok(a.rows.filter(r => r.filedOn).length === 2 && a.rows.find(r => r.noAssessment), 'שתי הגשות רשומות ו«ש״מ לא קיימת»');
  const legacy = (await readPdf(await makePdf([P.idomLegacyPage()])))[0];
  ok(legacy.status === 'legacy_annual', 'מסלול ישן — «חסר סימון חבות»', legacy.status);
  const multi = await readPdf(await makePdf([1, 2].map(n => P.ahzmPage({ group: 'unfiled_fine', page: n, total: 2, rows: [{ file: `00000${n}018`.slice(-9), name: 'דוגמה רב עמודי', year: '2025', due: '31.12.2026' }] }))));
  ok(multi.length === 2 && multi.every(p => p.status === 'ok' && p.group === 'unfiled_fine') && multi[1].page === 2 && multi[1].pageTotal === 2, 'PDF רב-עמודי — שני עמודים, «דף 2 מתוך 2»');
  const empty = (await readPdf(await makePdf([P.ahzmPage({ group: 'unfiled_fine', rows: [], empty: true })])))[0];
  ok(empty.status === 'empty_confirmed' && empty.group === 'unfiled_fine', '«אין תיקים שבקשת» — נבדקה וריקה');

  if (OUT) {
    // קבצי הדגמה ל-QA — לקוחות הדוגמה של מסד ההדגמה (sampleClients: דוד כהן 123456789, רחל 987654321, מיכל לוי 234567890…)
    mkdirSync(OUT, { recursive: true });
    const demo = {
      '1-annual-2025.pdf': [P.idomPage({ year: 2025, rows: [
        { file: '123456789', name: 'כהן דוד ו/או רחל', required: true, due: '31/10/2026', ft: '30', branch: '10', office: '39' },
        { file: '234567890', name: 'לוי מיכל', required: true, due: '30/11/2026', ft: '42', branch: '03', office: '24' },
        { file: '345678901', name: 'אברהם יוסי ו/או שרה', required: true, due: '30/09/2026', filed: '07/06/2026', section: '00', ft: '52', branch: '01', office: '45' },
        { file: '456789012', name: 'שפירא אורית ו/או עמית', required: true, due: '30/11/2026', ft: '42', branch: '02', office: '24' },
        { file: '999999998', name: 'לקוח לא מוכר', required: true, due: '30/11/2026', ft: '42', branch: '02', office: '24' },
        { file: '678901234', name: 'חוסין מוחמד', due: '30/04/2026', section: '14', ft: '91', branch: '17', office: '21' },
        { file: '567890123', name: 'שם אחר לגמרי', required: true, due: '30/11/2026', ft: '42', branch: '02', office: '24' },
      ] })],
      '2-wealth-unfiled-no-fine.pdf': [P.ahzmPage({ group: 'unfiled_no_fine', rows: [
        { file: '234567890', name: 'לוי מיכל', year: '2025', due: '30.11.2026' },
        { file: '123456789', name: 'כהן דוד ו/או רחל', year: '2025', due: '' },
      ] })],
      '3-wealth-unfiled-fine-empty.pdf': [P.ahzmPage({ group: 'unfiled_fine', rows: [], empty: true })],
      '4-wealth-filed-fine.pdf': [P.ahzmPage({ group: 'filed_fine', rows: [{ file: '123456789', name: 'כהן דוד ו/או רחל', year: '2022', due: '31.05.2023' }] })],
      '5-annual-2025-later.pdf': [P.idomPage({ year: 2025, produced: '20/10/2026', rows: [
        { file: '123456789', name: 'כהן דוד ו/או רחל', required: true, due: '31/10/2026', filed: '18/10/2026', section: '00', ft: '30', branch: '10', office: '39' },
        { file: '234567890', name: 'לוי מיכל', required: true, due: '31/01/2027', ft: '42', branch: '03', office: '24' },
      ] })],
      '6-old-route-annual.pdf': [P.idomLegacyPage()],
    };
    for (const [name, pages] of Object.entries(demo)) writeFileSync(join(OUT, name), await makePdf(pages));
    writeFileSync(join(OUT, '7-not-shaam.pdf'), await makePdf([[[[0, 'חשבונית מס 1001']], [[0, 'סה"כ לתשלום 100']]]]));
    writeFileSync(join(OUT, '8-broken.pdf'), Buffer.from('%PDF-1.7\nזה לא PDF באמת'));
    console.log(`\n  קבצי הדגמה נכתבו ל-${OUT}`);
  }
}
console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
