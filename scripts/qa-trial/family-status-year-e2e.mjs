// QA דפדפן — מצב משפחתי לפי שנת המס (16.10.2026), מחשב 1280 וטלפון 390, בלי רשת לייצור.
// 1. ?test-family-year (לקוח דמה): עורך פרטי הלקוח — שדה «שנת הפטירה» ליד המצב, «ממתי? טרם נרשם», שנה עתידית נדחית;
//    אחרי שמירה «אלמן/ה · מ-2019», ההערכה ל-2025 בלי חוסם; מעבר לנשוי/אה ⇒ «שנת הנישואין»; המחשבון לפי השנה שנבחרה.
// 2. ?office-app (מסד מדומה): הערכת המס של אורית — «מה בדקנו» כולל «מצב משפחתי בשנת המס 2026»; התצוגה המהירה — «מצב משפחתי: … · ממתי?».
//   node scripts/qa-trial/family-status-year-e2e.mjs [baseUrl] [shotsDir]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire('C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json');
const { chromium } = require('playwright-core');
const [base = 'http://localhost:5174', shots = 'qa-shots/family-status-year'] = process.argv.slice(2);
mkdirSync(shots, { recursive: true });
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
let pass = 0, fail = 0;
const ok = (c, m, i = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && i ? ` — ${String(i).slice(0, 300)}` : ''}`); };

for (const [name, vp] of [['desktop', { width: 1280, height: 860 }], ['phone', { width: 390, height: 844 }]]) {
  console.log(`== ${name}`);
  const ctx = await b.newContext({ viewport: vp, ...(name === 'phone' ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  const errs = [], prodHits = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('request', r => { if (/uoweoqtuiettozagwgdw/.test(r.url())) prodHits.push(r.url()); });
  const noOverflow = async (where) => ok(!(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)), `${where}: בלי גלילה הצידה`);
  const shot = (n) => page.screenshot({ path: join(shots, `${name}-${n}.png`), fullPage: false });
  const text = (sel) => page.locator(sel).first().innerText();

  // ── 1. מסך הבדיקה ──
  await page.goto(`${base}/?test-family-year`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  ok((await text('[data-testid="display"]')).includes('אלמן/ה · ממתי? טרם נרשם'), 'בלי שנה: «אלמן/ה · ממתי? טרם נרשם»');
  ok((await page.locator('[data-testid="blocker-2025"]').count()) === 1, 'הערכה 2025: חוסם «מצב משפחתי ב-2025»');
  ok((await text('[data-testid="est-2025"]')).includes('חסר מידע'), '«מה בדקנו» 2025: חסר מידע');
  ok((await text('[data-testid="est-2026"]')).includes('לבדיקה ידנית'), '«מה בדקנו» 2026: לבדיקה (שנה לא נרשמה)');
  await shot('1-before'); await noOverflow('לפני');

  await page.locator('button:has-text("עריכת פרטי הלקוח")').click(); await page.waitForTimeout(500);
  const field = page.locator('[data-testid="family-status-year"]');
  ok(await field.count() === 1 && (await field.innerText()).includes('שנת הפטירה'), 'בעורך: «שנת הפטירה» ליד המצב המשפחתי');
  ok((await field.innerText()).includes('ממתי? טרם נרשם'), 'בעורך: חובה-רך — «ממתי? טרם נרשם»');
  await field.locator('input').fill('2030'); await page.waitForTimeout(200);
  ok((await field.innerText()).includes('שנה עתידית'), 'שנה עתידית מסומנת');
  await field.locator('input').fill('2019'); await page.waitForTimeout(200);
  ok(!(await field.innerText()).includes('שנה עתידית') && !(await field.innerText()).includes('טרם נרשם'), '2019 — תקין');
  await field.scrollIntoViewIfNeeded(); await shot('2-editor');
  await page.locator('button:has-text("שמור")').first().click(); await page.waitForTimeout(600);
  ok((await text('[data-testid="display"]')).includes('אלמן/ה · מ-2019'), 'אחרי שמירה: «אלמן/ה · מ-2019»');
  ok((await text('[data-testid="line-2025"]')).includes('מצב משפחתי בשנת המס 2025: אלמן/ה (לפי שנת הפטירה 2019)'), 'שורת 2025 לפי שנת הפטירה');
  ok((await page.locator('[data-testid="blocker-2025"]').count()) === 0 && (await text('[data-testid="est-2025"]')).includes('נבדק'), '2025: בלי חוסם, «נבדק»');
  await shot('3-after'); await noOverflow('אחרי');

  // מעבר לנשוי/אה — השדה מתחלף לשנת הנישואין
  await page.locator('button:has-text("עריכת פרטי הלקוח")').click(); await page.waitForTimeout(400);
  await page.locator('select').filter({ has: page.locator('option[value="widowed"]') }).first().selectOption('married'); await page.waitForTimeout(200);
  ok((await field.innerText()).includes('שנת הנישואין') && (await field.locator('input').inputValue()) === '', 'נשוי/אה ⇒ «שנת הנישואין», ריק');
  await field.locator('input').fill('2026');
  await page.locator('button:has-text("שמור")').first().click(); await page.waitForTimeout(600);
  ok((await text('[data-testid="display"]')).includes('נשוי/אה · מ-2026'), '«נשוי/אה · מ-2026»');
  ok((await text('[data-testid="line-2025"]')).includes('לא נשוי/אה (לפני הנישואין (2026))'), '2025: לא נשואים — לפני הנישואין');
  ok((await text('[data-testid="est-2026"]')).includes('5329'), '2026 — שנת הנישואין: בחירה משותף/נפרד (5329), עם מקור');

  // המחשבון — לפי השנה שנבחרה
  await page.locator('button:has-text("מחשבון מס")').click(); await page.waitForTimeout(800);
  ok((await text('[data-testid="calc-family-year"]')).includes('מצב משפחתי בשנת המס 2026: נשוי/אה'), 'מחשבון 2026: נשוי/אה');
  await page.locator('.calc-year select').selectOption('2025'); await page.waitForTimeout(500);
  ok((await text('[data-testid="calc-family-year"]')).includes('מצב משפחתי בשנת המס 2025: לא נשוי/אה'), 'מחשבון 2025: לא נשוי/אה');
  await shot('4-calculator');
  // ‼ המחשבון עצמו גולש הצידה בטלפון (553 מול 390) גם בלי השורות האלה — פער קיים, לא של השינוי. כאן: השורות החדשות בתוך המסך
  ok(await page.evaluate(() => [...document.querySelectorAll('[data-testid="calc-family-year"], .alert-warning')].every(e => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; })), 'מחשבון: שורת המצב המשפחתי והאזהרה בתוך המסך');

  // ── 2. אפליקציית ההדגמה ──
  await page.goto(`${base}/?office-app&fresh-taxyear`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
  await page.evaluate(() => { location.hash = '#/client/sample-4/taxfile'; }); await page.waitForTimeout(1800);
  // 16.10.2026 («כל עבודה היא בקשה»): «לבקשה ←» ⇒ שורת הבקשה הפתוחה, ההערכה בתוכה
    await page.locator('[data-section="works"] li[data-work="tax_estimate"] [data-tf-open-work]').first().click();
    await page.locator('[data-ty-inline] .te-panel').first().waitFor({ timeout: 20000 }).catch(() => {}); await page.waitForTimeout(1800);
  await page.evaluate(() => { const d = document.querySelector('#te-checks'); if (d) d.open = true; });
  const checks = await page.locator('#te-checks').innerText().catch(() => '');
  ok(checks.includes('מצב משפחתי בשנת המס 2026') && checks.includes('נשוי/אה (לפי המצב היום)'), 'אורית — «מה בדקנו»: מצב משפחתי בשנת המס 2026', checks.slice(0, 400));
  await page.locator('#te-checks').scrollIntoViewIfNeeded().catch(() => {}); await shot('5-estimate-checks'); await noOverflow('הערכה');

  await page.evaluate(() => { location.hash = '#/clients/p/sample-4'; }); await page.waitForTimeout(1500);
  const qv = page.locator('[data-testid="qv-family"]');
  // ‼ 25.10.2026: התצוגה המהירה בניסוח תיק המס («נשוי ל…»), בלי לוכסן ובלי «ממתי?» — השנה החסרה בתיק עצמו
  { const t = await qv.innerText().catch(() => 'אין');
    ok(await qv.count() === 1 && /מצב משפחתי: (נשוי|נשואה|בנישואין)/.test(t) && !t.includes('/') && !t.includes('ממתי'), 'תצוגה מהירה: «מצב משפחתי: נשוי ל…» בלי לוכסן ובלי «ממתי?»', t); }
  await shot('6-quickview');

  ok(errs.length === 0, 'אין שגיאות בקונסול', errs.join(' | '));
  ok(prodHits.length === 0, 'אפס פניות לייצור', prodHits.slice(0, 3).join(' '));
  await ctx.close();
}
await b.close();
console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
