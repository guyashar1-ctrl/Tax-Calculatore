// ─── «מס» בדפדפן — עבודות לקוחות, הסרה בכל מצב, ידע מקצועי לפי תחום (14.10.2026) ──────────────────
// ‼ על שרת ההדגמה בלבד (?office-app — מסד מדומה בזיכרון הדפדפן). שום דבר לא נשלח ולא נשמר במסד אמיתי.
// המסלול, במחשב ובטלפון:
//   1. כניסה ל«מס»: במחשב — מסילה ועמוד; בטלפון — הרשימה קודם, «› מס» חוזר אליה.
//   2. «עבודת מס» כבר לא בתפריט החשבון; הקישור הישן נוחת ב«עבודות לקוחות».
//   3. עבודה שנפתחה בטעות (טיוטה) — «הסר…» ⇒ «למחוק» ⇒ נעלמת, והמונה במסילה חוזר.
//   4. טיוטה שבוחרים לבטל ⇒ ב«בוטלו» עם הסיבה ⇒ «החזר…» ⇒ חוזרת לפתוחות.
//   5. עבודה שפורסמה ללקוח ⇒ אין «למחוק», רק ביטול ⇒ יורדת מהדף האישי ⇒ החזרה מחזירה אותה לדף.
//   6. ידע מקצועי: תחום ⇒ נושא ⇒ שמונה שלבים; «מה מבקשים מהלקוח» מהשאלון; «לעבודות בתיקים» חוזר לעבודה.
//   7. מקלדת: Escape סוגר רק את חלון ההסרה; הפוקוס עובר לכותרת השלב. בלי גלילה הצידה ובלי שגיאות קונסול.
//   node scripts/e2e/tax-area.mjs [--base=http://localhost:5261] [--vp=desktop,mobile,small] [--shots=dir]   (small = 360)

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d);
const BASE = arg('base', 'http://localhost:5261');
const VPS = arg('vp', 'desktop,mobile,small').split(',');
const SHOTS = arg('shots', '');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PW = process.env.PW_CORE ?? 'C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json';
const { chromium } = createRequire(PW)('playwright-core');

let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(info).slice(0, 400)}` : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: CHROME, headless: true });

async function newPage(vp) {
  const mobile = vp !== 'desktop';
  const ctx = await browser.newContext({
    viewport: vp === 'small' ? { width: 360, height: 740 } : mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'he-IL',
  });
  await ctx.route('**/*', route => {
    const u = route.request().url(); const host = new URL(u).hostname;
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
    return host === 'localhost' || host === '127.0.0.1' || u.startsWith('data:') || u.startsWith('blob:') ? route.continue() : route.abort();
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !/favicon|ResizeObserver|net::ERR_FAILED/.test(m.text())) errs.push(m.text().slice(0, 240)); });
  page.on('pageerror', e => errs.push('pageerror: ' + String(e).slice(0, 240)));
  return { ctx, page, errs };
}
const shot = async (page, name, full = false) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: full }).catch(() => {}); };
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const text = async (loc) => ((await loc.count().catch(() => 0)) ? loc.first().innerText({ timeout: 5000 }).catch(() => '') : '');
const go = async (page, hash, fresh = false) => {
  await page.goto(`${BASE}/?office-app${fresh ? '&fresh-taxyear' : ''}#${hash}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-tax-area]').waitFor({ timeout: 30000 });
  await sleep(900);
};
const railCount = async (page, key) => (await text(page.locator(`[data-rail="${key}"] .ta-count`))).trim() || '0';

/** «＋ דוח שנתי» לדוד — טיוטה בלבד, בלי פרסום. */
async function addAnnual(page, name, year) {
  const tw = page.locator('[data-tax-work]');
  await tw.locator('[data-tw-add="annual"]').click();
  const dlg = page.locator('[data-add-work]');
  await dlg.waitFor({ timeout: 10000 });
  if (year) await dlg.locator('select').first().selectOption(String(year)).catch(() => {});
  await dlg.getByLabel('חיפוש לקוח').fill(name);
  await dlg.locator('.aw-client', { hasText: name }).first().locator('input').check();
  await dlg.getByRole('button', { name: /המשך לבדיקה/ }).click();
  await dlg.locator('[data-aw-create]').click();
  await dlg.locator('[data-aw-result]').first().waitFor({ timeout: 20000 });
  await dlg.getByRole('button', { name: 'סיום' }).click();
  await sleep(900);
}
const removeDialog = (page) => page.locator('[data-remove-work]');

async function run(vp) {
  console.log(`\n▶ «מס» · ${vp}`);
  const { ctx, page, errs } = await newPage(vp);
  const mobile = vp !== 'desktop';
  try {
    // ── 1. כניסה ──
    await go(page, '/tax', true);
    if (mobile) {
      ok(!(await page.locator('.tax-area .pg-pane').isVisible()) && await page.locator('.ta-rail').isVisible(), 'טלפון: «מס» נפתח ברשימה');
      await shot(page, `m-01-list-${vp}`);
      await page.locator('[data-rail="work-annual"]').click(); await sleep(500);
      ok(await page.locator('[data-tax-work][data-section="annual"]').isVisible() && !(await page.locator('.ta-rail').isVisible()), 'טלפון: בחירה פותחת את העמוד במסך מלא');
      await page.locator('.tc-back').first().click(); await sleep(400);
      ok(await page.locator('.ta-rail').isVisible(), 'טלפון: «› מס» חוזר לרשימה');
      await page.locator('[data-rail="work-annual"]').click(); await sleep(500);
    } else {
      ok(await page.locator('.ta-rail').isVisible() && await page.locator('[data-tax-work][data-section="all"]').isVisible(), 'מחשב: מסילה ו«כל העבודות»');
      const rail = (await page.locator('.ta-rail .pg-rail-item').allInnerTexts()).map(x => x.replace(/\s+/g, ' ').trim());
      ok(['כל העבודות', 'קליטה והשלמת תיק', 'דוחות שנתיים', 'הצהרות הון'].every(l => rail.some(r => r.startsWith(l))), 'במסילה: כניסה לכל סוג עבודה', rail.join(' | '));
      await shot(page, `d-01-work-all-${vp}`);
      await page.locator('[data-rail="work-annual"]').click(); await sleep(500);
    }
    ok((await page.evaluate(() => location.hash)) === '#/tax/work/annual', 'הכתובת: ‎#/tax/work/annual‎');
    const head = await text(page.locator('.tw-head'));
    ok(head.includes('דוחות שנתיים') && head.includes('＋ דוח שנתי') && head.includes('ללמוד את התחום: דוח שנתי'), 'בראש העמוד: מה זו העבודה, איך פותחים, ואיפה לומדים', head.slice(0, 300));
    ok(/אין עבודות מהסוג הזה/.test(await text(page.locator('.tw-empty'))), 'מצב ריק: אומר מה עושים', await text(page.locator('.tw-empty')));

    // ── 2. הישן: לא בתפריט, והקישור נוחת כאן ──
    ok(!(await page.locator('button', { hasText: /^עבודת מס$/ }).count()), 'אין יותר כפתור «עבודת מס» נפרד');
    ok(await page.locator('nav button, header button').filter({ hasText: /^מס$/ }).count() > 0, 'בסרגל: «מס»');

    // ── 3. נפתחה בטעות ⇒ מחיקה ──
    await addAnnual(page, 'דוד');
    const rowD = page.locator('[data-tw-row="annual"]', { hasText: 'דוד' });
    ok(await rowD.count() === 1, 'העבודה נוספה לרשימה');
    const before = await railCount(page, 'work-annual');
    await rowD.first().locator('[data-tw-remove]').click();
    const dlg = removeDialog(page);
    await dlg.waitFor({ timeout: 10000 });
    await dlg.locator('[data-rw-confirm]').waitFor({ timeout: 10000 });
    const dt = await text(dlg);
    ok(dt.includes('למחוק') && dt.includes('לבטל ולשמור בהיסטוריה') && dt.includes('נמחק') && dt.includes('דבר לא יצא מהמשרד'), 'טיוטה: אפשר למחוק, והחלון אומר שדבר לא יצא', dt.slice(0, 400));
    ok(dt.includes('אין מייל ללקוח'), 'החלון אומר שאין מייל ללקוח');
    ok(await page.evaluate(() => document.activeElement?.hasAttribute('data-rw-confirm')), 'מקלדת: הפוקוס על כפתור הפעולה');
    await shot(page, `${vp}-02-remove-delete`);
    if (mobile) ok(await noHScroll(page), 'טלפון: חלון ההסרה בלי גלילה הצידה');
    await page.keyboard.press('Escape'); await sleep(300);
    ok(!(await dlg.count()), 'Escape סוגר את החלון בלי לשנות');
    await rowD.first().locator('[data-tw-remove]').click();
    await dlg.locator('[data-rw-confirm]').waitFor({ timeout: 10000 });
    await dlg.locator('[data-rw-confirm]').click(); await sleep(900);
    ok(/נמחקה/.test(await text(page.locator('.ty-ok'))), 'אחרי המחיקה: הודעה ברורה', await text(page.locator('.ty-ok')));
    ok(await rowD.count() === 0, 'העבודה נעלמה מהרשימה');
    ok(Number(await railCount(page, 'work-annual')) === Number(before) - 1, 'המונה במסילה ירד', `${before} → ${await railCount(page, 'work-annual')}`);

    // ── 4. טיוטה שמבטלים ⇒ «בוטלו» ⇒ «החזר» ──
    await addAnnual(page, 'דוד');
    await rowD.first().locator('[data-tw-remove]').click();
    await dlg.locator('[data-rw-confirm]').waitFor({ timeout: 10000 });
    await dlg.getByText('לבטל ולשמור בהיסטוריה').click();
    await dlg.getByLabel(/למה/).fill('נפתח לשנה הלא נכונה');
    ok((await text(dlg.locator('[data-rw-confirm]'))).includes('בטל'), 'בחירה בביטול משנה את הכפתור ל«בטל את העבודה»');
    await dlg.locator('[data-rw-confirm]').click(); await sleep(900);
    ok(await rowD.count() === 0, 'בוטלה — יורדת מהפתוחות');
    await page.locator('[data-tw-state="cancelled"]').click(); await sleep(300);
    const cancelledRow = page.locator('[data-tw-bucket="cancelled"]', { hasText: 'דוד' });
    ok(await cancelledRow.count() === 1 && /נפתח לשנה הלא נכונה/.test(await text(cancelledRow)), '«בוטלו»: השורה עם הסיבה', await text(cancelledRow));
    await shot(page, `${vp}-03-cancelled`);
    await cancelledRow.first().locator('[data-tw-restore]').click();
    await dlg.locator('[data-rw-confirm]').waitFor({ timeout: 10000 });
    ok(/החזרת העבודה/.test(await text(dlg)), 'חלון ההחזרה');
    await dlg.locator('[data-rw-confirm]').click(); await sleep(900);
    ok(/הוחזרה/.test(await text(page.locator('.ty-ok'))) && await rowD.count() === 1, 'החזרה: חוזרת לפתוחות');

    // ── 5. פורסמה ללקוח ⇒ רק ביטול ⇒ יורדת מהדף ⇒ החזרה ──
    await rowD.first().getByRole('button', { name: /^פתח/ }).click();
    const ov = page.locator('.ty-overlay');
    await ov.waitFor({ timeout: 15000 });
    // ‼ עבודה חדשה נולדת עם טיוטת שאלות — «לפרסם עכשיו» מביא לכפתור הפרסום; בלי טיוטה — «הוסף N שאלות»
    const toPublish = ov.getByRole('button', { name: /^לפרסם עכשיו$|^הוסף \d+ שאלות/ });
    await toPublish.first().waitFor({ timeout: 15000 });
    await toPublish.first().click();
    await ov.getByRole('button', { name: 'פרסם בדף האישי' }).first().waitFor({ timeout: 10000 });
    for (let k = 0; k < 3 && !(await text(ov.locator('.ty-ok'))).includes('פורסם'); k++) { await ov.getByRole('button', { name: 'פרסם בדף האישי' }).first().click().catch(() => {}); await sleep(900); }
    ok((await text(ov.locator('.ty-ok'))).includes('פורסם'), 'השאלות פורסמו בדף האישי (הדגמה, בלי מייל)', await text(ov.locator('.ty-ok')));
    // מה הלקוח רואה עכשיו — שורה שמזהה את העבודה הזו בדף האישי
    const portalItems = async () => {
      await page.goto(`${BASE}/?portal=demo&office-app`, { waitUntil: 'domcontentloaded' }); await sleep(2500);
      return (await text(page.locator('body'))).split('\n').map(l => l.trim()).filter(l => /2025/.test(l) && /(דוח|השלמת מידע)/.test(l));
    };
    const shown = await portalItems();
    ok(shown.length > 0, 'הדף האישי: העבודה שפורסמה מוצגת ללקוח', shown.join(' | '));
    await go(page, '/tax/work/annual');
    await rowD.first().getByRole('button', { name: /^פתח/ }).click();
    await ov.waitFor({ timeout: 15000 });
    // הסרה מתוך דף העבודה עצמו
    await ov.locator('[data-ty-remove]').click();
    await dlg.locator('[data-rw-confirm]').waitFor({ timeout: 10000 });
    const ct = await text(dlg);
    ok(!ct.includes('למחוק') && ct.includes('לא נמחקת') && /שאלות פתוחות נסגרות/.test(ct), 'פורסמה: אין מחיקה — רק ביטול, והשאלות הפתוחות נסגרות', ct.slice(0, 400));
    await shot(page, `${vp}-04-remove-cancel`);
    await page.keyboard.press('Escape'); await sleep(300);
    ok(!(await dlg.count()) && await ov.isVisible(), 'Escape סוגר רק את חלון ההסרה — דף העבודה נשאר');
    await ov.locator('[data-ty-remove]').click();
    await dlg.locator('[data-rw-confirm]').waitFor({ timeout: 10000 });
    await dlg.locator('[data-rw-confirm]').click(); await sleep(1200);
    ok(!(await ov.count()), 'אחרי ביטול מדף העבודה — הדף נסגר');
    ok(/בוטלה/.test(await text(page.locator('.ty-ok'))), 'וההודעה מופיעה ברשימה', await text(page.locator('.ty-ok')));
    // הדף האישי
    const afterCancel = await portalItems();
    ok(shown.every(l => !afterCancel.includes(l)), 'הדף האישי: העבודה שבוטלה כבר לא מוצגת', afterCancel.join(' | '));
    await go(page, '/tax/work/annual');
    await page.locator('[data-tw-state="cancelled"]').click(); await sleep(300);
    await cancelledRow.first().locator('[data-tw-restore]').click();
    await dlg.locator('[data-rw-confirm]').waitFor({ timeout: 10000 });
    await dlg.locator('[data-rw-confirm]').click(); await sleep(900);
    const afterRestore = await portalItems();
    ok(shown.every(l => afterRestore.includes(l)), 'אחרי החזרה: העבודה חוזרת לדף האישי', afterRestore.join(' | '));

    // ── 6. ידע מקצועי ──
    await go(page, '/tax/learn');
    if (mobile && !(await page.locator('[data-domain-card]').first().isVisible())) { await page.locator('[data-rail="learn-home"]').click(); await sleep(400); }
    ok(await page.locator('[data-domain-card]').count() >= 8, 'ידע מקצועי: כרטיס לכל תחום');
    await shot(page, `${vp}-05-learn-home`);
    await page.locator('[data-domain-card="savings"]').click(); await sleep(500);
    ok((await page.evaluate(() => location.hash)) === '#/tax/learn/savings', 'הכתובת: ‎#/tax/learn/savings‎');
    const dp = await text(page.locator('[data-domain="savings"]'));
    ok(dp.includes('מתי רלוונטי') && dp.includes('מה מבקשים מהלקוח') && dp.includes('פנסיה לעצמאי') && dp.includes('העבודה בתיקים'), 'עמוד תחום: מה, מתי, לימוד, מה מבקשים, עבודה', dp.slice(0, 400));
    ok(!/שמיש · עם פערים|מקור משני\b/.test(dp), 'בלי התוויות הלא ברורות');
    await shot(page, `${vp}-06-domain`);
    await page.locator('[data-domain-item="pensionSE"]').click(); await sleep(700);
    const st = await text(page.locator('[data-kn-state]'));
    ok(/אפשר ללמוד|בבירור/.test(st) && /(ממקור|חושבו|לא אומת|רשמי)/.test(st), 'מצב הנושא במילים: מה אפשר ומה הביסוס', st);
    const stages = await page.locator('[data-stage-btn]').allInnerTexts();
    ok(stages.length >= 7, 'מסלול הלימוד: שלבים', stages.join(' | '));
    const secs = {};
    const visible = await page.locator('[data-stage-btn]').evaluateAll(bs => bs.map(b => b.dataset.stageBtn));
    ok(!visible.includes('read'), 'פנסיה לעצמאי: אין שלב «מסמכים» — אין לו תוכן בנושא (לא כופים שמונה שלבים)', visible.join());
    ok(/שאלות מקצועיות פתוחות/.test(st), 'מצב הנושא: «שאלות מקצועיות פתוחות», לא «נקודות לבדיקה»', st);
    for (const s of ['what', 'ask', 'calc', 'except', 'next']) {
      await page.locator(`[data-stage-btn="${s}"]`).first().click(); await sleep(250);
      secs[s] = await page.locator('.kn-topic .kn-sec').count();
      if (s === 'ask') ok(/פנסיה|קרן השתלמות|הפקד/.test(await text(page.locator('.kn-asks'))), '«מה מבקשים מהלקוח»: מהשאלון', (await text(page.locator('.kn-asks'))).slice(0, 200));
      if (s === 'calc') { await shot(page, `${vp}-07-topic-calc`); ok(await page.locator('[data-kn-gaps-note]').count() === 1, '«איך מחשבים»: השאלות הפתוחות מוצגות גם כאן'); }
      if (s === 'except') ok(/אלה לא הערות קריאה/.test(await text(page.locator('[data-kn-gaps]'))), '«חריגים ושאלות פתוחות»: פער מוצג כשאלה שלא הוכרעה');
    }
    ok(secs.calc > 0 && secs.next > 0 && secs.what >= 1, 'כל שלב מציג את הסעיפים שלו', JSON.stringify(secs));
    ok(await page.evaluate(() => document.activeElement?.classList.contains('kn-stage-h')), 'מקלדת: אחרי מעבר שלב הפוקוס בכותרת השלב');
    await page.locator('[data-stage-next]').click(); await sleep(250);
    ok((await page.locator('.kn-topic').getAttribute('data-stage')) === 'practice', '«הבא» מתקדם לשלב הבא');
    await page.locator('[data-stage-btn="next"]').first().click(); await sleep(250);
    const wl = page.locator('#kn-clients button', { hasText: 'דוחות שנתיים' });
    ok(await wl.count() > 0, '«מה עושים בתיק»: קישור לעבודות מהסוג הזה');
    await wl.first().click(); await sleep(600);
    ok((await page.evaluate(() => location.hash)) === '#/tax/work/annual', 'מהידע לעבודה — עמוד הדוחות');
    await page.goBack(); await sleep(700);
    ok((await page.evaluate(() => location.hash)) === '#/tax/learn/savings/pensionSE' && await page.locator('[data-topic="pensionSE"]').count() === 1, '«אחורה» בדפדפן חוזר לנושא');
    // היררכיה בתפריט: תחום פתוח אחד, הנושאים שלו בקבוצה, הנבחר מסומן; מעבר לתחום הבא
    if (mobile) { await page.locator('.tc-back').first().click(); await sleep(400); }
    const rail = await page.evaluate(() => ({
      open: [...document.querySelectorAll('.ta-dom-row[aria-expanded="true"]')].map(b => b.dataset.rail),
      closed: document.querySelectorAll('.ta-dom-row[aria-expanded="false"]').length,
      subs: [...document.querySelectorAll('.ta-domain.is-open .ta-sub .ta-sub-item')].map(b => b.dataset.rail),
      current: document.querySelector('.ta-sub-item[aria-current="page"]')?.dataset.rail,
      subOutside: document.querySelectorAll('.ta-sub-item:not(.ta-domain.is-open .ta-sub-item)').length,
    }));
    ok(rail.open.join() === 'learn-savings' && rail.closed === 8, 'תפריט: תחום פתוח אחד (aria-expanded), השאר סגורים', JSON.stringify(rail));
    ok(rail.subs.length === 3 && rail.subOutside === 0, 'תפריט: נושאי התחום בתוך הקבוצה שלו בלבד', JSON.stringify(rail));
    ok(rail.current === 'learn-savings-pensionSE', 'תפריט: הנושא הנבחר מסומן (aria-current)', rail.current);
    const indent = await page.evaluate(() => { const d = document.querySelector('.ta-dom-row .pg-rail-name').getBoundingClientRect(); const s = document.querySelector('.ta-sub-item .ta-sub-name').getBoundingClientRect(); return Math.round(d.right - s.right); });
    ok(indent >= 12, 'תפריט: הנושאים מוזחים פנימה מהתחום', `${indent}px`);
    await shot(page, `${vp}-08-rail-open`);
    await page.locator('[data-rail="learn-ni"]').click(); await sleep(500);
    if (mobile) { await page.locator('.tc-back').first().click(); await sleep(400); }
    const rail2 = await page.evaluate(() => [...document.querySelectorAll('.ta-dom-row[aria-expanded="true"]')].map(b => b.dataset.rail).join());
    ok(rail2 === 'learn-ni' && await page.locator('[data-rail="learn-savings-pensionSE"]').count() === 0, 'מעבר לתחום הבא: הקודם נסגר והחדש נפתח');
    await page.locator('[data-rail="learn-ni-ni"]').click(); await sleep(500);
    ok((await page.evaluate(() => location.hash)) === '#/tax/learn/ni/ni', 'בחירת תת-נושא (כלי) בתחום החדש');
    if (mobile) ok(await noHScroll(page), 'טלפון: תפריט ותת-נושא בלי גלילה הצידה');
    // קישורים ישנים
    for (const [old, want] of [['/reference', '#/tax/learn'], ['/firm/taxWork', '#/tax/work'], ['/tax/learn/pensionSE', '#/tax/learn/pensionSE']]) {
      // כמו סימנייה שמורה: טעינה חדשה של הדף (מעבר באותו מסמך משנה רק את ה-# ולא טוען מחדש)
      await page.goto('about:blank');
      await page.goto(`${BASE}/?office-app#${old}`, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-tax-area]').waitFor({ timeout: 30000 }); await sleep(700);
      const h = await page.evaluate(() => location.hash);
      const okPage = old === '/tax/learn/pensionSE' ? await page.locator('[data-topic="pensionSE"]').count() === 1 : true;
      ok(h.startsWith(want) && okPage, `קישור ישן ‎#${old}‎ נוחת ב«מס»`, `${h}`);
    }
    // «הדוח השנתי» ו«טופס 1301» — אותו תחום
    await go(page, '/tax/learn/annual');
    if (mobile && !(await page.locator('[data-domain="annual"]').isVisible())) { await page.locator('[data-rail="learn-annual"]').click(); await sleep(400); }
    const ann = await text(page.locator('[data-domain="annual"]'));
    ok(ann.includes('הכנת הדוח: מהמסמך לשדה') && ann.includes('טופס 1301 לשנה — שדות ומוכנות'), 'דוח שנתי: שני פריטים בשמות שאומרים את התפקיד', ann.slice(0, 300));
    if (mobile) ok(await noHScroll(page), 'טלפון: עמוד תחום בלי גלילה הצידה');

    ok(errs.length === 0, 'בלי שגיאות קונסול', errs.slice(0, 4).join(' | '));
  } catch (e) {
    ok(false, `${vp}: חריגה`, e.message);
    await shot(page, `${vp}-error`, true);
  } finally { await ctx.close(); }
}

for (const vp of VPS) await run(vp);
await browser.close();
console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
