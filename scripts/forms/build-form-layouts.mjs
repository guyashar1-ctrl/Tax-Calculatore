// ─── מפת הטופס — בניית עמודי הטופס הרשמי ומיקומי השדות (16.10.2026) ─────────────────────────────
// ‼ מקור: ה-PDF הרשמי של רשות המסים (public/forms/2025/pdf, הורד מ-gov.il ב-16.10.2026). לא מציירים בניחוש:
//   סימון = קוד שמודפס בטופס (שכבת הטקסט) + התיבה הסגורה שהוא יושב בתוכה (שכבת הווקטור).
//   קוד שמופיע כמה פעמים ואין דרך להכריע — «ambiguous», לא מצויר. קוד שלא נמצא — «missing».
// הרצה: node scripts/forms/build-form-layouts.mjs   (מוסיף --overlay <dir> לצילומי בדיקה עם הסימונים)
// פלט: public/forms/2025/<slug>/p<N>.webp · src/features/taxForms/data/form<slug>-2025.layout.json

import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createRequire } from 'module';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const require = createRequire(path.join(ROOT, 'package.json'));
const { createCanvas } = require('@napi-rs/canvas');
const PDFJS = path.join(ROOT, 'node_modules/pdfjs-dist/');
const PDF_DIR = path.join(ROOT, 'public/forms/2025/pdf');
const DATA = path.join(ROOT, 'src/features/taxForms/data');
const SCALE = 2;
const overlayIdx = process.argv.indexOf('--overlay');
const OVERLAY = overlayIdx > 0 ? process.argv[overlayIdx + 1] : null;

const BASE = 'https://www.gov.il/BlobFolder/service/reporting-and-payment-2025-annual-tax-report-for-individuals/he/Service_Pages_Income_tax_annual-report-2026_';
const catalog1301 = JSON.parse(fs.readFileSync(path.join(DATA, 'form1301-2025.catalog.json'), 'utf8'));
const annexes = JSON.parse(fs.readFileSync(path.join(DATA, 'annexes-2025.catalog.json'), 'utf8')).annexes;
// 116ג אינו בקטלוג הנספחים — קטלוג משלו (form116c.catalog.json), מפתחות ‎116c.<n>‎ כמו ב-model.ts
const cat116c = JSON.parse(fs.readFileSync(path.join(DATA, 'form116c.catalog.json'), 'utf8')).fields;
const annexLabelFields = (id, slug) => (annexes.find(a => a.formId === id)?.fields ?? []).map((f, n) => ({ key: `${slug}.${n + 1}`, label: f.label, kind: f.kind, part: f.section, code: f.code })).filter(f => !f.code);
const annexCodes = id => annexes.find(a => a.formId === id).fields.flatMap(f => (f.code ? String(f.code).split('/') : []));

/** קבוצות קודים של אותו שדה — כדי להכריע בין מופעים לפי השכן (רשום / בן זוג / שניהם באותה שורה). */
const siblings1301 = new Map();
for (const f of catalog1301.fields) {
  const cs = f.codes ? Object.values(f.codes).filter(Boolean) : [];
  for (const c of cs) siblings1301.set(c, [...(siblings1301.get(c) ?? []), ...cs.filter(x => x !== c)]);
}

const FORMS = [
  { slug: '1301', formId: '1301', title: 'טופס 1301 — דין וחשבון על ההכנסות בארץ ובחו״ל', url: `${BASE}itc1301-2025.pdf`, codes: [...siblings1301.keys()], siblings: siblings1301,
    // ‼ 16.10 (סבב 2): תיבות סימון ופרטים בלי קוד מודפס — לפי התווית שלידן (labelPass)
    labelFields: catalog1301.fields.filter(f => !f.codes).map(f => ({ key: f.id, label: f.label, kind: f.kind, part: f.part })) },
  { slug: '1320', formId: '1320', title: 'נספח א (1320) — הכנסה מעסק או ממשלח יד', url: `${BASE}1320-2025.pdf`, codes: [], labelFields: annexLabelFields('1320', '1320') },
  { slug: '1321', formId: '1321', title: 'נספח ב (1321) — הכנסה שאינה מעסק', url: `${BASE}1321-2025.pdf`, codes: [], labelFields: annexLabelFields('1321', '1321') },
  { slug: '1322', formId: '1322', title: 'נספח ג (1322) — רווח הון מניירות ערך סחירים', url: `${BASE}1322-2025.pdf`, codes: annexCodes('1322'), codePages: [1], labelFields: annexLabelFields('1322', '1322') },
  { slug: '1324', formId: '1324', title: 'נספח ד (1324) — הכנסות מחו״ל ומס ששולם עליהן', url: `${BASE}1324-2025.pdf`, codes: annexCodes('1324'), labelFields: annexLabelFields('1324', '1324') },
  { slug: '1399y', formId: '1399י', title: '1399י — הודעה על מכירת נכס (ליחיד)', url: `${BASE}1399y-2025.pdf`, codes: annexCodes('1399י'),
    // עמ׳ 2 = דברי הסבר; הקודים בעמ׳ 1 מודפסים גדולים (11–12.3), ההפניות להערות קטנות — מסננים
    codePages: [1], minH: 10.5, labelFields: annexLabelFields('1399י', '1399y') },
  { slug: '1344', formId: '1344', title: '1344 — הפסדים מועברים', url: `${BASE}itc1344-2025.pdf`, codes: [], labelFields: annexLabelFields('1344', '1344') },
  { slug: '1343', formId: '1343', title: '1343 — ניכוי נוסף בשל פחת', url: `${BASE}1343-2025.pdf`, codes: [], labelFields: annexLabelFields('1343', '1343') },
  { slug: '1342', formId: '1342', title: '1342 — פרטים על נכסים לפחת', url: `${BASE}itc1342.pdf`, codes: [], labelFields: annexLabelFields('1342', '1342') },
  { slug: '119', formId: '119', title: '119 — בקשה להקלה במס לבעל תואר אקדמי / תעודת מקצוע', url: `${BASE}annual-report-2026_itc119n.pdf`, codes: [], pages: 1, labelFields: annexLabelFields('119', '119') },
  // 116ד הרגיל סרוק (אין שכבת טקסט) — עמוד ורשימה, בלי סימון
  { slug: '116d', formId: '116ד', title: '116ד — דחיית נקודת זיכוי בגין ילד שנולד', url: 'https://www.gov.il/BlobFolder/service/reporting-and-payment-2025-annual-tax-report-for-individuals/he/Service_Pages_Income_tax_itc116d.pdf', codes: [], labelFields: annexLabelFields('116ד', '116d') },
  // ‼ 16.10: פריסת דמי לידה (C21/C24/C25) — 116ג, גרסה 12.2023, עמ׳ 1 הטופס, עמ׳ 2 דברי ההסבר
  { slug: '116c', formId: '116ג', title: '116ג — בקשה לפריסה על-פי סעיף 8(ג)', url: 'https://www.gov.il/BlobFolder/service/itc-request-spread-income-over-number-years/he/Service_Pages_Income_tax_itc116c.pdf', codes: [], pages: 2, codePages: [1], splitRuns: true,
    labelFields: cat116c.map((f, n) => ({ key: `116c.${n + 1}`, label: f.printed ?? f.label, kind: f.kind, part: f.section })) },
  { slug: '134', formId: '134', title: '134 — הפקדות מעביד עודפות ואובדן כושר עבודה', url: `${BASE}itc134-2025.pdf`, codes: [], labelFields: annexLabelFields('134', '134') },
  // 1219: עמ׳ 1–7 הם הטופס, 8–15 דברי ההסבר. הקודים — כפולות של 10 (10…800), בשורת הסיכום של כל סעיף (רוחב הטבלה).
  { slug: '1219', formId: '1219', title: 'טופס 1219 — הצהרת הון', url: 'https://www.gov.il/BlobFolder/service/itc1219/he/Service_Pages_Income_tax_itc1219.pdf', pages: 7, maxBoxW: 560, rowFallback: true, minH: 10.55, codeXMax: 160, codeRule: s => /^\d{2,3}$/.test(s) && +s % 10 === 0 && +s >= 10 && +s <= 800 },
];

const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const r4 = n => Math.round(n * 10000) / 10000;

async function readPage(page, maxW) {
  const vp = page.getViewport({ scale: 1 });
  const H = vp.height; const vb = page.view;
  const tc = await page.getTextContent();
  const items = tc.items.filter(it => it.str?.trim()).map(it => {
    const [, , , d, e, f] = it.transform;
    const h = it.height || Math.abs(d);
    // ‼ «1 8 1» — קוד שמודפס בריווח אותיות (סעיף 72)
    const raw = it.str.trim();
    return { s: /^\d(\s+\d){1,2}$/.test(raw) ? raw.replace(/\s+/g, '') : raw, x: e - vb[0], y: H - (f - vb[1]) - h, w: it.width, h };
  });
  // ‼ «1 8 1» כשלוש ספרות נפרדות באותה שורה — מאחדים לקוד אחד
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (!/^\d$/.test(a.s)) continue;
    const run = [a];
    for (let j = i + 1; j < items.length && run.length < 3; j++) {
      const b = items[j]; const last = run[run.length - 1];
      if (/^\d$/.test(b.s) && Math.abs(b.y - last.y) < 1.5 && Math.abs(b.x - (last.x + last.w)) < 4) run.push(b); else break;
    }
    if (run.length === 3) items.push({ s: run.map(r => r.s).join(''), x: run[0].x, y: run[0].y, w: run[2].x + run[2].w - run[0].x, h: run[0].h });
  }
  const ol = await page.getOperatorList();
  const rects = []; const wide = []; const squares = [];
  let ctm = [1, 0, 0, 1, 0, 0]; const stack = [];
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i]; const a = ol.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = mul(ctm, a);
    else if (fn === OPS.constructPath && a[2]) {
      const mm = a[2];
      const pts = [[mm[0], mm[1]], [mm[2], mm[1]], [mm[0], mm[3]], [mm[2], mm[3]]].map(([x, y]) => [ctm[0] * x + ctm[2] * y + ctm[4] - vb[0], H - (ctm[1] * x + ctm[3] * y + ctm[5] - vb[1])]);
      const xs = pts.map(p => p[0]); const ys = pts.map(p => p[1]);
      const r = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      if (r.w >= 8 && r.h >= 6 && r.w <= maxW && r.h <= 60) rects.push(r);
      if (r.w > 400 && r.h >= 6) wide.push(r);
      if (r.w >= 4 && r.w <= 13 && r.h >= 4 && r.h <= 13 && Math.abs(r.w - r.h) < 2.5) squares.push(r);
    }
  }
  return { W: vp.width, H, items, rects, wide, squares };
}

/** התיבה הקטנה ביותר שמרכז הקוד בתוכה ושהקוד נכנס בה כולו (בסובלנות). */
function boxOf(tok, rects) {
  const cx = tok.x + tok.w / 2; const cy = tok.y + tok.h / 2;
  const inside = rects.filter(r => r.x - 0.5 <= tok.x && tok.x + tok.w <= r.x + r.w + 0.5 && r.y <= cy && cy <= r.y + r.h && r.x <= cx && cx <= r.x + r.w);
  inside.sort((a, b) => a.w * a.h - b.w * b.h);
  return inside[0] ?? null;
}

/** 1219: קוד בשורת טבלה שאין סביבו מלבן סגור — רצועה ברוחב הטבלה, בגובה השורה. */
function rowBand(tok, wide) {
  const t = wide.filter(r => r.x <= tok.x && tok.x + tok.w <= r.x + r.w);
  if (!t.length) return null;
  const x0 = Math.min(...t.map(r => r.x)); const x1 = Math.max(...t.map(r => r.x + r.w));
  return { x: x0, y: tok.y - tok.h * 0.2, w: x1 - x0, h: tok.h * 1.8 };
}

// ── מעבר התוויות (16.10, סבב 2): שדה בלי קוד מודפס — לפי מילות התווית שלו בטופס ─────────────────────────
// ‼ התאמה רק כשהיא חד-משמעית: לפחות 60% ממילות התווית (ולפחות 2) בפריט טקסט אחד או בשורה אחת, ובלי מתחרה קרוב
//   במקום אחר. תיבת סימון — הריבוע הצמוד מימין לתווית; כן/לא — התווית עם הריבועים שבשורה; אחר — התא שהתווית בתוכו.
//   מה שלא חד-משמעי — labelUnplaced (ברשימה), לא מצויר.
const STOP = new Set(['של', 'את', 'על', 'או', 'לי', 'אם', 'כי', 'גם', 'עם', 'זה', 'זו', 'לא', 'כן', 'ו', 'ה', 'ב', 'ל', 'מ']);
const norm = (t) => t.replace(/[״"”“'׳`()\[\]{}:;.,!?\-–—/\\_*•%₪]/g, ' ').replace(/\s+/g, ' ').trim();
const toks = (t) => [...new Set(norm(t).split(' ').filter(w => w.length >= 2 && !STOP.has(w)))];
function linesOf(items) {
  const sorted = [...items].sort((a, b) => (a.y + a.h) - (b.y + b.h));
  const lines = [];
  for (const it of sorted) {
    const base = it.y + it.h;
    const l = lines.find(x => Math.abs(x.base - base) < 2.5);
    if (l) l.items.push(it); else lines.push({ base, items: [it] });
  }
  for (const l of lines) { l.items.sort((a, b) => b.x - a.x); l.text = l.items.map(i => i.s).join(' '); }
  return lines;
}
/** מקטעים רציפים בשורה: פריטים שהרווח ביניהם קטן מ-12 נק׳ (מימין לשמאל). */
function runsOf(items) {
  const out = []; let cur = [];
  for (const it of items) { const prev = cur[cur.length - 1]; if (prev && prev.x - (it.x + it.w) > 12) { out.push(cur); cur = []; } cur.push(it); }
  if (cur.length) out.push(cur);
  return out;
}
const bboxOf = (arr) => { const x0 = Math.min(...arr.map(a => a.x)); const y0 = Math.min(...arr.map(a => a.y)); return { x: x0, y: y0, w: Math.max(...arr.map(a => a.x + a.w)) - x0, h: Math.max(...arr.map(a => a.y + a.h)) - y0 }; };
function labelPass(form, pageData) {
  const out = []; const unplaced = [];
  const cands = pageData.flatMap(pd => {
    const lines = linesOf(pd.items.filter(i => /[\u0590-\u05FF]/.test(i.s)));
    return [...pd.items.filter(i => /[\u0590-\u05FF]/.test(i.s)).map(i => ({ pd, items: [i], t: toks(i.s), lvl: 'item' })),
      ...lines.map(l => ({ pd, items: l.items, t: toks(l.text), lvl: 'line' })),
      // ‼ 116ג: תווית שמודפסת מילה-מילה, באותה שורה עם תווית שכנה — מקטע רציף בשורה (רווח קטן מ-12 נק׳)
      ...(form.splitRuns ? lines.flatMap(l => runsOf(l.items)).filter(r => r.length > 1).map(r => ({ pd, items: r, t: toks(r.map(i => i.s).join(' ')), lvl: 'line' })) : [])];
  });
  for (const f of form.labelFields ?? []) {
    const L = toks(f.label.replace(/«?בן הזוג הרשום»?|בן\/בת הזוג/g, ' '));
    if (L.length < 1) { unplaced.push({ field: f.key, why: 'noLabel' }); continue; }
    // ‼ התאמה צריכה «ראש» משותף — אחרת כותרת זהות כללית מתאימה לשורת שותף
    const head = L.find(w => w.length >= 3 && !/^\d+$/.test(w)) ?? L[0];
    const headOf = (t) => t.find(w => w.length >= 3 && !/^\d+$/.test(w)) ?? t[0];
    const scored = cands.map(c => { const hit = L.filter(w => c.t.includes(w)).length; return { c, hit, sc: hit / L.length, prec: c.t.length ? hit / c.t.length : 0 }; })
      // או שהמילה הראשונה של התווית בטקסט, או שהמילה הראשונה של הטקסט בתווית וההתאמה הדוקה (התווית בקטלוג מוסיפה הקשר: «פרטי המסייע - …»)
      .filter(x => x.c.t.includes(head) || (L.includes(headOf(x.c.t)) && x.prec >= 0.75))
      .filter(x => x.hit >= Math.min(2, L.length) && x.sc >= 0.6 && x.prec >= (x.c.lvl === 'line' ? 0.6 : 0.5))
      .sort((a, b) => b.sc - a.sc || b.prec - a.prec || (a.c.lvl === 'item' ? -1 : 1));
    if (!scored.length) { unplaced.push({ field: f.key, why: 'noMatch' }); continue; }
    const top = scored[0];
    const at = (x) => { const b = bboxOf(x.c.items); return { p: x.c.pd.n, y: b.y, x: b.x }; };
    const tp = at(top);
    let rivals = scored.filter(x => x !== top && x.sc >= top.sc - 0.1 && (at(x).p !== tp.p || Math.abs(at(x).y - tp.y) > 4));
    let pick = top;
    // שני טורים (רשום / בן זוג): «בן הזוג הרשום» — הטור הימני, «בן/בת הזוג» — השמאלי
    if (rivals.length) {
      const both = [top, ...rivals].filter(x => x.sc === top.sc);
      const reg = /בן הזוג הרשום/.test(f.label), sp = /בן\/בת הזוג/.test(f.label) && !reg;
      if ((reg || sp) && both.length === 2) { pick = both.sort((a, b) => bboxOf(b.c.items).x - bboxOf(a.c.items).x)[reg ? 0 : 1]; rivals = []; }
    }
    if (rivals.length) { unplaced.push({ field: f.key, why: 'ambiguous', where: [pick, ...rivals].slice(0, 4).map(x => `p${at(x).p}:${Math.round(at(x).x)},${Math.round(at(x).y)}`) }); continue; }
    const { pd } = pick.c; const lb = bboxOf(pick.c.items);
    const cy = lb.y + lb.h / 2;
    const sameLine = pd.squares.filter(q => Math.abs(q.y + q.h / 2 - cy) < 6);
    let box = lb; let how = 'text';
    if (f.kind === 'checkbox') {
      const right = sameLine.filter(q => q.x >= lb.x + lb.w - 3 && q.x - (lb.x + lb.w) < 22).sort((a, b) => a.x - b.x)[0];
      if (right) { box = bboxOf([lb, right]); how = 'check'; }
    } else if (f.kind === 'yesno') {
      const opts = sameLine.filter(q => q.x < lb.x && lb.x - q.x < 150);
      if (opts.length) { box = bboxOf([lb, ...opts]); how = 'row'; }
    } else {
      const cell = pd.rects.filter(r => r.x <= lb.x + 1 && lb.x + lb.w <= r.x + r.w + 1 && r.y <= cy && cy <= r.y + r.h && r.w < lb.w * 8).sort((a, b) => a.w * a.h - b.w * b.h)[0];
      if (cell) { box = cell; how = 'cell'; }
    }
    // ‼ סימון שיוצא מהעמוד — לא סימון
    if (box.x < 0 || box.y < 0 || box.x + box.w > pd.W || box.y + box.h > pd.H) { unplaced.push({ field: f.key, why: 'outside' }); continue; }
    out.push({ field: f.key, page: pd.n, how, score: Math.round(pick.sc * 100) / 100,
      box: [r4((box.x - 1.5) / pd.W), r4((box.y - 1.5) / pd.H), r4((box.w + 3) / pd.W), r4((box.h + 3) / pd.H)],
      label: [r4(lb.x / pd.W), r4(lb.y / pd.H), r4(lb.w / pd.W), r4(lb.h / pd.H)] });
  }
  // ‼ שני שדות שונים על אותה תווית מודפסת — רק הטוב נשאר; חריג: זוג רשום/בן זוג באותה שורה (אותה תווית בלי מילות התפקיד)
  const role = (k) => norm((form.labelFields.find(f => f.key === k)?.label ?? '').replace(/«?בן הזוג הרשום»?|בן\/בת הזוג/g, ' '));
  const byLabel = new Map();
  for (const a of out) { const k = `${a.page}|${a.label.join(',')}`; byLabel.set(k, [...(byLabel.get(k) ?? []), a]); }
  const drop = new Set();
  for (const g of byLabel.values()) {
    if (g.length < 2 || new Set(g.map(a => role(a.field))).size === 1) continue;
    const best = [...g].sort((a, b) => b.score - a.score)[0];
    const tie = g.filter(a => a !== best && a.score === best.score);
    for (const a of g) if (a !== best || tie.length) { drop.add(a); unplaced.push({ field: a.field, why: 'shared' }); }
  }
  return { out: out.filter(a => !drop.has(a)), unplaced };
}

/** קוד אמיתי עומד לבד; «בשדה 271» בתוך משפט — לא. בודקים טקסט עברי צמוד באותה שורה. */
function isolated(tok, items) {
  return !items.some(o => o !== tok && /[֐-׿]/.test(o.s) && Math.abs((o.y + o.h) - (tok.y + tok.h)) < 2.5
    && (Math.abs(o.x - (tok.x + tok.w)) < 5 || Math.abs(tok.x - (o.x + o.w)) < 5));
}

async function build(form) {
  const file = path.join(PDF_DIR, `${form.slug}.pdf`);
  const bytes = fs.readFileSync(file);
  const doc = await getDocument({ data: new Uint8Array(bytes), verbosity: 0, cMapUrl: PDFJS + 'cmaps/', cMapPacked: true, standardFontDataUrl: PDFJS + 'standard_fonts/' }).promise;
  const nPages = Math.min(doc.numPages, form.pages ?? doc.numPages);
  const outImg = path.join(ROOT, 'public/forms/2025', form.slug);
  fs.mkdirSync(outImg, { recursive: true });
  const pages = []; const tokens = []; const pageData = [];
  for (let n = 1; n <= nPages; n++) {
    const page = await doc.getPage(n);
    const { W, H, items, rects, wide, squares } = await readPage(page, form.maxBoxW ?? 340);
    pageData.push({ n, W, H, items, rects, squares });
    const vp = page.getViewport({ scale: SCALE });
    const canvas = createCanvas(Math.round(vp.width), Math.round(vp.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
    fs.writeFileSync(path.join(outImg, `p${n}.webp`), await canvas.encode('webp', 80));
    pages.push({ n, w: r4(W), h: r4(H), img: `/forms/2025/${form.slug}/p${n}.webp`, textLayer: items.length > 10 });
    const isCode = form.codeRule ?? (s => /^\d{2,3}$/.test(s));
    for (const it of items) if (isCode(it.s) && it.h >= (form.minH ?? 0) && it.x <= (form.codeXMax ?? 1e9) && (!form.codePages || form.codePages.includes(n))) tokens.push({ ...it, page: n, W, H, box: boxOf(it, rects) ?? (form.rowFallback ? rowBand(it, wide) : null), alone: isolated(it, items), canvas, ctx });
  }
  const wanted = form.codeRule ? [...new Set(tokens.filter(t => t.box && t.alone).map(t => t.s))] : [...new Set(form.codes)];
  const anchors = []; const ambiguous = []; const missing = [];
  const place = (code, t, how) => anchors.push({
    code, page: t.page, how,
    box: how === 'box' ? [r4(t.box.x / t.W), r4(t.box.y / t.H), r4(t.box.w / t.W), r4(t.box.h / t.H)] : [r4((t.x - 2) / t.W), r4((t.y - 2) / t.H), r4((t.w + 4) / t.W), r4((t.h + 4) / t.H)],
    label: [r4(t.x / t.W), r4(t.y / t.H), r4(t.w / t.W), r4(t.h / t.H)],
  });
  const pending = [];
  for (const code of wanted) {
    const cands = tokens.filter(t => t.s === code);
    const boxed = cands.filter(t => t.box);
    const alone = cands.filter(t => t.alone);
    if (!cands.length) missing.push(code);
    else if (boxed.length === 1) place(code, boxed[0], 'box');
    else if (!boxed.length && cands.length === 1) place(code, cands[0], 'label');
    else if (!boxed.length && alone.length === 1) place(code, alone[0], 'label');
    else if (form.codeRule && boxed.length > 1) boxed.forEach(t => place(code, t, 'box')); // 1219: קוד שמודפס פעמיים (סיכום) — שני הסימונים
    else pending.push({ code, cands: boxed.length ? boxed : cands });
  }
  // הכרעה לפי שכן: קוד אחר של אותו שדה (רשום / בן זוג / שניהם) כבר מוקם — המופע באותו עמוד ובאותה שורה.
  for (const p of pending) {
    const sibs = (form.siblings?.get(p.code) ?? []).flatMap(c => anchors.filter(a => a.code === c));
    const near = p.cands.filter(t => sibs.some(a => a.page === t.page && Math.abs(a.label[1] * t.H - t.y) < 12));
    // שדה שחוזר בכמה שורות באותה עמודה (1399י «4-6. יתרת הוצאות השבחה 1, 2, 3») — כל המופעים שבעמודה אחת, כשהם הרוב
    const col = p.cands.filter(t => p.cands.filter(o => o.page === t.page && Math.abs(o.x - t.x) < 3).length >= 2);
    const colPage = new Set(col.map(t => t.page));
    if (near.length === 1) place(p.code, near[0], near[0].box ? 'box' : 'label');
    else if (!form.siblings && colPage.size === 1 && col.length >= 2 && col.length > p.cands.length / 2) col.forEach(t => place(p.code, t, t.box ? 'box' : 'label'));
    else ambiguous.push({ code: p.code, where: p.cands.map(t => `p${t.page}:${Math.round(t.x)},${Math.round(t.y)}${t.box ? '' : '(text)'}`) });
  }
  // ‼ שני קודים שונים באותה תיבה (טבלה שהתא בה אינו מלבן סגור) — רצועה בגובה השורה של כל קוד, עד קצה התיבה
  const byBox = new Map();
  for (const a of anchors) if (a.how === 'box') { const k = `${a.page}|${a.box.join(',')}`; byBox.set(k, [...(byBox.get(k) ?? []), a]); }
  for (const group of byBox.values()) {
    if (new Set(group.map(a => a.code)).size < 2) continue;
    for (const a of group) { const [bx] = a.box; const [lx, ly, lw, lh] = a.label; a.how = 'row'; a.box = [bx, r4(ly - lh * 0.35), r4(lx + lw - bx + 0.004), r4(lh * 1.7)]; }
  }
  const lp = form.labelFields ? labelPass(form, pageData.filter(pd => !form.codePages || form.codePages.includes(pd.n))) : { out: [], unplaced: [] };
  anchors.sort((a, b) => a.page - b.page || a.label[1] - b.label[1] || b.label[0] - a.label[0]);
  const layout = {
    formId: form.formId, slug: form.slug, taxYear: 2025, title: form.title,
    source: { url: form.url, fetchedOn: '2026-10-16', sha256: createHash('sha256').update(bytes).digest('hex'), pdf: `/forms/2025/pdf/${form.slug}.pdf`, pagesInPdf: doc.numPages },
    method: 'קוד מודפס בשכבת הטקסט של ה-PDF הרשמי + התיבה הסגורה שהוא בתוכה (how=box); בלי תיבה — סביב הקוד עצמו (how=label)',
    pages: pages.map(({ n, w, h, img, textLayer }) => ({ n, w, h, img, textLayer })),
    anchors, ambiguous, missing,
    labelMethod: 'שדה בלי קוד מודפס — לפי מילות התווית בשכבת הטקסט (≥60%, חד-משמעי); check = הריבוע מימין לתווית, row = התווית עם ריבועי כן/לא, cell = התא, text = התווית בלבד',
    labelAnchors: lp.out, labelUnplaced: lp.unplaced,
  };
  fs.writeFileSync(path.join(DATA, `form${form.slug}-2025.layout.json`), JSON.stringify(layout, null, 1) + '\n');
  if (OVERLAY) {
    fs.mkdirSync(OVERLAY, { recursive: true });
    for (let n = 1; n <= nPages; n++) {
      const t0 = tokens.find(t => t.page === n);
      const page = await doc.getPage(n); const vp = page.getViewport({ scale: SCALE });
      const canvas = t0?.canvas ?? createCanvas(Math.round(vp.width), Math.round(vp.height));
      const ctx = canvas.getContext('2d');
      if (!t0) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise; }
      for (const a of anchors.filter(x => x.page === n)) {
        const [x, y, w, h] = a.box;
        ctx.strokeStyle = a.how === 'row' ? 'rgba(20,150,60,.95)' : a.how === 'box' ? 'rgba(220,30,30,.9)' : 'rgba(30,90,220,.95)'; ctx.lineWidth = 3;
        ctx.strokeRect(x * canvas.width, y * canvas.height, w * canvas.width, h * canvas.height);
        ctx.fillStyle = 'rgba(220,30,30,1)'; ctx.font = 'bold 18px sans-serif';
        ctx.fillText(a.code, x * canvas.width + 2, y * canvas.height - 2);
      }
      for (const a of lp.out.filter(x => x.page === n)) {
        const [x, y, w, h] = a.box;
        ctx.strokeStyle = 'rgba(200,0,200,.9)'; ctx.lineWidth = 2.5;
        ctx.strokeRect(x * canvas.width, y * canvas.height, w * canvas.width, h * canvas.height);
        ctx.fillStyle = 'rgba(200,0,200,1)'; ctx.font = 'bold 15px sans-serif';
        ctx.fillText(a.field, x * canvas.width - 44, y * canvas.height + 13);
      }
      fs.writeFileSync(path.join(OVERLAY, `${form.slug}-p${n}.png`), await canvas.encode('png'));
    }
  }
  console.log(`${form.slug}: pages ${nPages}/${doc.numPages} · anchors ${anchors.length} (box ${anchors.filter(a => a.how === 'box').length}) · ambiguous ${ambiguous.length} ${ambiguous.map(a => a.code).join(',')} · missing ${missing.length} ${missing.join(',')} · labels ${lp.out.length}/${(form.labelFields ?? []).length} (${lp.unplaced.map(u => u.field + ':' + u.why).join(' ')})`);
}

const only = process.argv.slice(2).filter(a => !a.startsWith('--') && a !== OVERLAY);
for (const f of FORMS) if (!only.length || only.includes(f.slug)) await build(f);
