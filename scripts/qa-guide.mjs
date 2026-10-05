#!/usr/bin/env node
// ─── בדיקת דפדפן: כרטיס «אישור הייצוג באזור האישי» + המדריך המצולם ─────────
// הדף האישי המדומה (‎?portal=demo&office-app‎, זוג: דוד — מע״מ, רחל — מס הכנסה
// ומע״מ) ב-360/390/1366: מה מסמנים, הנוסח «את כל הבקשות», שלב בכל פעם, מקלדת,
// הגדלה, «אישרתי»; ובמרכז הייצוג (‎?test-exec‎) — כפתור המדריך בשלב האישור.
//
// ‼ הכול בזיכרון: המסד המדומה (__fakeBackend) — שום בקשה לא יוצאת למסד או למייל.
// ‼ הצילומים היחידים שנבדקים הם העותקים המנוקים ב-public/guides/rep-approval
// (step-1..7.webp). המקורות אינם בפרויקט, והסקריפט הזה לא מכיר אותם.
//
// שימוש:  שרת פיתוח של ה-worktree רץ, ואז
//   node scripts/qa-guide.mjs
// משתנים: QA_BASE (ברירת מחדל http://localhost:5196/), QA_OUT (תיקיית צילומים,
// ברירת מחדל בתיקייה זמנית), CHROME_PATH, PLAYWRIGHT_FROM (package.json שלידו playwright-core).
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const REPO = process.cwd();
function loadPlaywright() {
  const from = [process.env.PLAYWRIGHT_FROM, join(REPO, 'worker/package.json'),
    'C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json'].filter(Boolean);
  for (const f of from) {
    try { return createRequire(f)('playwright-core'); } catch { /* הבא */ }
  }
  throw new Error('playwright-core לא נמצא — הגדירו PLAYWRIGHT_FROM');
}
const { chromium } = loadPlaywright();
const BASE = process.env.QA_BASE || 'http://localhost:5196/';
const OUT = process.env.QA_OUT || join(tmpdir(), 'pivo-qa-guide');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const results = [];
const ok = (name, cond, extra = '') => { results.push(`${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); };
const notFonts = list => list.filter(u => !/fonts\.(googleapis|gstatic)\.com/.test(u));

async function open({ width, height, query }) {
  const mobile = width < 500;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'he-IL' });
  const page = await ctx.newPage();
  const errors = []; const external = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + String(e).slice(0, 300)));
  page.on('request', r => { const u = r.url(); if (!u.startsWith('http://localhost') && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(r.method() + ' ' + u.slice(0, 120)); });
  page.on('dialog', d => d.accept());
  await page.goto(`${BASE}?${query}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  return { ctx, page, errors, external };
}
const overflow = page => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
/** שורת שע״ם במרכז ← «כל השלבים והפרטים». */
async function openShaamHistory(page) {
  await page.click('[data-testid="rc-row-shaam"] .rc-row-head[aria-expanded="false"]').catch(() => {});
  await page.waitForTimeout(150);
  await page.click('[data-testid="rc-row-shaam"] [data-testid="rc-history"] > summary').catch(() => {});
  await page.waitForTimeout(150);
}
const imgReady = page => page.waitForFunction(() => { const i = document.querySelector('.rag-imgbtn img'); return i && i.complete && i.naturalWidth > 0; });

// QA_ONLY=portal | exec — רק חלק אחד.
const ONLY = process.env.QA_ONLY || '';
const SIZES = ONLY === 'exec' ? [] : [[360, 740], [390, 844], [1366, 860]];
for (const [w, h] of SIZES) {
  const tag = String(w);
  const { page, errors, external, ctx } = await open({ width: w, height: h, query: 'portal=demo&office-app' });
  await page.waitForSelector('.rag-open', { timeout: 15000 });
  // הכרטיס = הקדמון הקרוב של כפתור המדריך שמכיל גם את הכותרת וגם את «אישרתי».
  const card = await page.evaluate(() => {
    let el = document.querySelector('.rag-open');
    while (el && !(/זירוז אישור הייצוג|אישור הייצוג באזור האישי/.test(el.textContent ?? '') && /אישרתי באזור האישי/.test(el.textContent ?? ''))) el = el.parentElement;
    return el?.textContent ?? '';
  });
  ok(`${tag} כרטיס: כותרת, מדריך, קישור, אתר, «אישרתי»`, /אישור הייצוג באזור האישי/.test(card) && /מדריך מצולם · 7 צעדים/.test(card)
    && /לכניסה לאזור האישי/.test(card) && /נפתח באתר gov\.il/.test(card) && /נדרשות כניסה והזדהות/.test(card) && /אישרתי באזור האישי/.test(card), card.replace(/\s+/g, ' ').slice(0, 120));
  ok(`${tag} נוסח: «את כל הבקשות», בלי «\\n» כטקסט`, /מסמן את כל הבקשות שלנו ולוחץ «אישור ייצוג»/.test(card) && !card.includes('\\n') && !/את הבקשה שבה/.test(card));
  const what = await page.$eval('[data-testid="rep-approval-what"]', e => e.innerText).catch(() => '');
  ok(`${tag} מה כל אחד מסמן באזור האישי — משפט פתיחה, ושורה לכל אחד`, /כל אחד נכנס לאזור האישי שלו, מסמן את כל הבקשות שלנו ולוחץ «אישור ייצוג»/.test(what) && /דוד: מע״מ/.test(what)
    && /רחל: מס הכנסה ומע״מ/.test(what) && !what.includes('\\n'), what.replace(/\s+/g, ' '));
  const whatBox = await page.$eval('[data-testid="rep-approval-what"]', e => { const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right) }; }).catch(() => null);
  ok(`${tag} הבלוק בתוך המסך`, !!whatBox && whatBox.l >= 0 && whatBox.r <= w, JSON.stringify(whatBox));
  const bareTitles = await page.evaluate(() => [...document.querySelectorAll('div, span, h3, h4, p')]
    .filter(e => e.children.length === 0 && (e.textContent ?? '').trim() === 'בקשה').length);
  ok(`${tag} אין כרטיס שכותרתו «בקשה» סתם`, bareTitles === 0, String(bareTitles));
  const href = await page.$eval('a[href*="personal_area_taxes"]', a => a.getAttribute('href')).catch(() => null);
  ok(`${tag} הקישור — היעד הרשמי`, href === 'https://www.gov.il/he/service/personal_area_taxes', String(href));
  const ov = await overflow(page);
  ok(`${tag} דף: בלי גלישה לרוחב`, ov.sw <= ov.cw, JSON.stringify(ov));
  await page.screenshot({ path: join(OUT, `portal-${tag}.png`), fullPage: true });

  await page.click('.rag-open');
  await page.waitForSelector('.rag[role="dialog"]');
  await page.waitForTimeout(350);
  await imgReady(page);
  ok(`${tag} פוקוס נכנס לחלון`, await page.evaluate(() => !!document.activeElement?.closest('.rag')));
  const imgs = await page.$$eval('.rag img', els => els.length);
  ok(`${tag} תמונה אחת בכל פעם`, imgs === 1, String(imgs));
  const src1 = await page.$eval('.rag-imgbtn img', i => i.getAttribute('src'));
  ok(`${tag} הצילום — העותק המנוקה`, /\/guides\/rep-approval\/step-1\.webp$/.test(String(src1)), String(src1));
  const s1 = await page.$eval('.rag', e => e.textContent);
  ok(`${tag} צעד 1: כותרת, הוראה, קישור כניסה`, /צעד 1 מתוך 7/.test(s1) && /פותחים את התפריט/.test(s1) && /עוד לא נכנסתם/.test(s1));
  const dims = await page.$eval('.rag', e => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
  ok(`${tag} גודל החלון`, w <= 560 ? dims.w === w : dims.w <= 540, JSON.stringify(dims));
  const foot = await page.$eval('.rag-foot', e => Math.round(e.getBoundingClientRect().bottom));
  ok(`${tag} הכפתורים בתוך המסך`, foot <= h, `${foot}/${h}`);
  await page.screenshot({ path: join(OUT, `guide-${tag}-s1.png`) });
  // RTL: חץ שמאלה = הבא
  for (let k = 0; k < 4; k++) await page.keyboard.press('ArrowLeft');
  const s5 = await page.$eval('.rag', e => e.innerText);
  ok(`${tag} צעד 5 נוקב ברשויות ובשמות`, /צעד 5 מתוך 7/.test(s5) && /מסמנים ✓ את כל הבקשות של המייצג שלנו/.test(s5)
    && /דוד: מע״מ/.test(s5) && /רחל: מס הכנסה ומע״מ/.test(s5) && /כל אחד באזור האישי שלו/.test(s5) && /מייצג אחר — לא מסמנים/.test(s5), s5.replace(/\s+/g, ' ').slice(0, 200));
  await imgReady(page);
  await page.screenshot({ path: join(OUT, `guide-${tag}-s5.png`) });
  await page.keyboard.press('ArrowLeft');
  const s6 = await page.$eval('.rag', e => e.textContent);
  ok(`${tag} צעד 6 — «אחרי שסימנתם את כל הבקשות שלנו»`, /צעד 6 מתוך 7/.test(s6) && /אחרי שסימנתם את כל הבקשות שלנו, לוחצים «אישור ייצוג»/.test(s6));
  await page.keyboard.press('ArrowRight');
  // הגדלה ממוקדת
  await imgReady(page);
  await page.click('.rag-imgbtn');
  await page.waitForSelector('.rag-zoom-scroll img');
  await page.waitForTimeout(300);
  const z = await page.$eval('.rag-zoom-scroll', e => ({ sl: Math.round(e.scrollLeft), st: Math.round(e.scrollTop), cw: e.clientWidth, iw: e.querySelector('img').getBoundingClientRect().width }));
  ok(`${tag} הגדלה בגודל מלא`, Math.round(z.iw) === 735, JSON.stringify(z));
  if (w < 700) ok(`${tag} הגדלה ממוקדת על תיבת הסימון`, z.sl > 200, JSON.stringify(z));
  await page.keyboard.press('Escape');
  ok(`${tag} Esc סוגר רק את ההגדלה`, !!(await page.$('.rag[role="dialog"]')) && !(await page.$('.rag-zoom')));
  await page.keyboard.press('ArrowRight');
  const s4 = await page.$eval('.rag-count', e => e.textContent);
  ok(`${tag} מקלדת: חץ ימינה = הקודם`, /צעד 4/.test(s4), s4);
  await page.click('.rag-dot >> nth=6');
  const s7 = await page.$eval('.rag', e => e.textContent);
  ok(`${tag} צעד אחרון — תוצאה ותנאי התיק, ו«אישרתי» הוא דיווח`, /אם כבר קיים תיק — הייצוג נקלט/.test(s7) && /ממתין לפתיחת התיק/.test(s7) && /עוד לא אומר שהייצוג פעיל/.test(s7) && /סיום/.test(s7));
  const ovg = await overflow(page);
  ok(`${tag} מדריך: בלי גלישה לרוחב`, ovg.sw <= ovg.cw, JSON.stringify(ovg));
  await page.click('.rag-btn.is-primary');
  await page.waitForTimeout(200);
  ok(`${tag} «סיום» סוגר ומחזיר פוקוס לכפתור`, !(await page.$('.rag')) && !!(await page.evaluate(() => document.activeElement?.classList.contains('rag-open'))));
  if (w === 390) {
    // «אישרתי» — דיווח שמחזיר למשרד, לא «הושלם»
    await page.click('button:has-text("אישרתי באזור האישי")');
    await page.waitForTimeout(1200);
    const txt = await page.evaluate(() => document.body.textContent);
    const writes = await page.evaluate(() => (window.__officeWrites ?? []).map(x => x.what));
    ok('390 «אישרתי» → בטיפול המשרד, «בודקים שהאישור נקלט»', /בודקים שהאישור נקלט אצל רשות המסים/.test(txt) && writes.includes('rpc.portal_submit_step'), writes.join(','));
    await page.screenshot({ path: join(OUT, 'portal-390-after.png'), fullPage: true });
  }
  ok(`${tag} אין שגיאות קונסול`, errors.length === 0, errors.join(' | ').slice(0, 300));
  const ext = notFonts(external);
  ok(`${tag} אין פניות חיצוניות (מלבד גופנים)`, ext.length === 0, ext.join(' | ').slice(0, 300));
  await ctx.close();
}

// ── מרכז הייצוג (מסך הבדיקה ‎?test-exec‎) — כפתור המדריך בשלב האישור ─────────
for (const [w, h] of (ONLY === 'portal' ? [] : [[390, 844], [1366, 860]])) {
  const tag = `exec-${w}`;
  const { page, errors, ctx } = await open({ width: w, height: h, query: 'test-exec&scenario=shaam-suspended&approval=pending' });
  await page.waitForSelector('[data-testid="rc-waiting-authorities"]', { timeout: 15000 }).catch(() => {});
  const heroBtn = await page.$('[data-testid="rc-waiting-authorities"] .rag-open');
  ok(`${tag} «מה עכשיו»: כפתור המדריך ליד «הבקשה מופיעה בדף האישי»`, !!heroBtn && /מדריך מצולם · 7 צעדים/.test(await heroBtn.textContent()));
  // השלב עצמו — בתוך «כל השלבים והפרטים» של שורת שע״ם
  await openShaamHistory(page);
  await page.waitForTimeout(250);
  const side = await page.evaluate(() => {
    const t = [...document.querySelectorAll('.rc-step-side')].find(e => /אישור הייצוג באזור האישי/.test(e.textContent ?? ''));
    return t ? { text: t.textContent ?? '', btn: !!t.querySelector('.rag-open') } : null;
  });
  ok(`${tag} השלב «אישור הייצוג באזור האישי» — «זירוז» כשורת משנה, עם המדריך`, !!side && side.btn && /אופציונלי/.test(side.text) && /זירוז/.test(side.text) && !/זירוז אישור הייצוג/.test(side.text), side ? side.text.replace(/\s+/g, ' ').slice(0, 160) : 'לא נמצא');
  await page.screenshot({ path: join(OUT, `${tag}.png`), fullPage: true });
  if (heroBtn) {
    await heroBtn.click();
    await page.waitForSelector('.rag[role="dialog"]');
    const s = await page.$eval('.rag', e => e.textContent);
    ok(`${tag} המדריך נפתח (צעד 1, קישור כניסה)`, /צעד 1 מתוך 7/.test(s) && /לכניסה לאזור האישי/.test(s));
    const ov = await overflow(page);
    ok(`${tag} בלי גלישה לרוחב`, ov.sw <= ov.cw, JSON.stringify(ov));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    ok(`${tag} Esc סוגר`, !(await page.$('.rag')));
  }
  // נדרש (שע״ם): אותו שם, «חובה», בלי «זירוז»
  await page.goto(`${BASE}?test-exec&scenario=shaam-client-approval&approval=required`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await openShaamHistory(page);
  await page.waitForTimeout(250);
  const req = await page.evaluate(() => {
    const t = [...document.querySelectorAll('.rc-step-side')].find(e => /אישור הייצוג באזור האישי/.test(e.textContent ?? ''));
    return t ? t.textContent ?? '' : '';
  });
  ok(`${tag} נדרש: אותו שם, «חובה», בלי «זירוז»`, /חובה/.test(req) && !/זירוז/.test(req), req.replace(/\s+/g, ' ').slice(0, 160));
  ok(`${tag} אין שגיאות קונסול`, errors.length === 0, errors.join(' | ').slice(0, 300));
  await ctx.close();
}

await browser.close();
console.log(results.join('\n'));
console.log(`\nצילומים: ${OUT}`);
const failed = results.filter(r => r.startsWith('✗')).length;
console.log(`${results.length - failed} עברו, ${failed} נכשלו`);
if (failed) process.exit(1);
