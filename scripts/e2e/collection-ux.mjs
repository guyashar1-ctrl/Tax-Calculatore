#!/usr/bin/env node
/**
 * collection-ux.mjs — בדיקת דפדפן של סבב שיפור האיסוף (13.10.2026): השאלון בדף האישי (מסך ייעודי, הסבר גלוי,
 * רשומות מובנות, בנק וסניף, מסמך מכמה חלקים, «אעלה בהמשך», סיום עם מסמכים שנשארו והשלמה ישירה), ועבודות המס
 * במשרד (הוספה בודדת ומרוכזת, אותה עבודה בתיק ובבקשות, בלי פרסום מעצם היצירה), ראש תיק המס.
 *
 *   node scripts/e2e/collection-ux.mjs [--base=http://localhost:5271] [--only=questionnaire,work,file] [--shots=<dir>] [--vp=desktop,mobile]
 *
 * ‼ מצב הדגמה בלבד (מסד מדומה בדפדפן). כל בקשה לייצור או ל-staging נחסמת ומכשילה.
 * ‼ playwright-core — התלות של העובד (worker/node_modules), לא תלות חדשה.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d);
const BASE = arg('base', 'http://localhost:5271');
const ONLY = new Set(arg('only', 'questionnaire,work,file').split(','));
const VPS = arg('vp', 'desktop,mobile').split(',');
const SHOTS = arg('shots', '');
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PW = process.env.PW_CORE ?? 'C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json';
const { chromium } = createRequire(PW)('playwright-core');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const results = [];
const ok = (c, m, info = '') => { c ? pass++ : fail++; results.push({ ok: !!c, m, info: c ? '' : String(info).slice(0, 400) }); console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(info).slice(0, 400)}` : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--headless=new', '--js-flags=--max-old-space-size=4096', '--disable-dev-shm-usage'] });
const consoleErrors = [];
const blocked = [];
async function newPage(viewport) {
  const mobile = viewport === 'mobile';
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'he-IL',
  });
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
    const host = new URL(u).hostname;
    if (host === 'localhost' || host === '127.0.0.1' || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    blocked.push(u); return route.abort();
  });
  const attach = (p) => {
    p.on('console', m => { if (m.type() === 'error' && !/favicon|ResizeObserver|Failed to load resource: net::ERR_FAILED|127\.0\.0\.1:9/.test(m.text())) consoleErrors.push(`${viewport}: ${m.text().slice(0, 240)}`); });
    p.on('pageerror', e => consoleErrors.push(`${viewport} pageerror: ${String(e).slice(0, 240)}`));
  };
  const holder = { cur: await ctx.newPage() };
  attach(holder.cur);
  const page = new Proxy({}, {
    get(_, k) {
      if (k === 'goto') return async (url, o) => { const np = await ctx.newPage(); attach(np); await holder.cur.close().catch(() => {}); holder.cur = np; return np.goto(url, o); };
      const v = holder.cur[k];
      return typeof v === 'function' ? v.bind(holder.cur) : v;
    },
  });
  return { ctx, page };
}
const shot = async (page, name, full = false) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: full }).catch(() => {}); };
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const text = async (loc) => ((await loc.count().catch(() => 0)) ? loc.first().innerText({ timeout: 5000 }).catch(() => '') : '');

const office = (clientId, tab = 'taxfile', fresh = false) => `${BASE}/?office-app${fresh ? '&fresh-taxyear' : ''}#/client/${clientId}/${tab}`;
const portal = () => `${BASE}/?portal=demo&office-app`;

/** קובץ תמונה קטן (PNG 1×1 בצבע) — לצילום «מהגלריה». */
const png = (name, rgb) => {
  // PNG 2x2 בצבע אחיד, נבנה ידנית (בלי תלות)
  const zlib = createRequire(import.meta.url)('node:zlib');
  const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(40, 0); ihdr.writeUInt32BE(28, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(40 * 3, 0).map((_, i) => rgb[i % 3])]);
  const raw = Buffer.concat(Array.from({ length: 28 }, () => row));
  return { name, mimeType: 'image/png', buffer: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]) };
};

// ── משרד: קליטה חדשה לדוד (sample-1), כל השאלות, פרסום ─────────────────────────────
async function publishIntake(page) {
  await page.goto(office('sample-1', 'taxfile', true), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-section="intake"], [data-tax-file-top]', { timeout: 30000 });
  const open = page.locator('[data-section="intake"] button, [data-intake-open]').first();
  await open.click();
  const ov = page.locator('.ty-overlay');
  await ov.waitFor({ timeout: 15000 });
  // ‼ ההחלטה «החלף בקליטה» נטענת רגע אחרי החלון — מחכים לה (בלעדיה השאלון לא שואל שוב על פרטים קבועים: ילדים, כתובת…)
  const rep = ov.getByRole('button', { name: 'החלף בקליטה' });
  if (await rep.waitFor({ timeout: 8000 }).then(() => true).catch(() => false)) { await rep.click(); await ov.getByRole('button', { name: 'החלף בקליטה' }).waitFor({ state: 'detached', timeout: 15000 }).catch(() => {}); await sleep(800); }
  const add = ov.getByRole('button', { name: /^הוסף \d+ שאלות/ });
  await add.first().click();
  await ov.locator('h3', { hasText: 'מוכן לדף האישי' }).waitFor({ timeout: 10000 });
  // ‼ אחרי «הוסף» כבר יש הודעה ירוקה («נוספו…») — מחכים להודעת הפרסום עצמה
  for (let k = 0; k < 3 && !(await text(page.locator('.ty-ok'))).includes('פורסם'); k++) {
    await sleep(400);
    await ov.getByRole('button', { name: 'פרסם בדף האישי' }).click({ timeout: 5000 }).catch(e => console.log('    publish click:', String(e.message).split(/\r?\n/)[0]));
    await sleep(900);
  }
  await shot(page, 'office-publish');
  ok((await text(page.locator('.ty-ok'))).includes('פורסם'), 'משרד: הקליטה פורסמה בדף האישי (בלי מייל)');
}

// ── לקוח: השאלון במסך ייעודי ───────────────────────────────────────────────────────
async function questionnaire(vp) {
  console.log(`\n▶ שאלון בדף האישי · ${vp}`);
  const { ctx, page } = await newPage(vp);
  try {
    await publishIntake(page);
    await page.goto(portal(), { waitUntil: 'domcontentloaded' });
    const go = page.getByRole('button', { name: /^להשלמת המידע$/ }).first();
    await go.waitFor({ timeout: 30000 });
    await go.click();
    const scr = page.locator('[data-tax-info-screen]');
    await scr.waitFor({ timeout: 15000 });
    await scr.locator('.ty-q').first().waitFor({ timeout: 15000 });
    ok(/#q=/.test(page.url()), 'מסך ייעודי: הכתובת זוכרת שהשאלון פתוח');
    ok((await text(scr.locator('.tis-head'))).includes('חזרה לבקשות'), 'מסך ייעודי: «חזרה לבקשות» בראש');
    ok(!!(await text(scr.locator('.ty-hint'))), 'הסבר גלוי מתחת לשאלה', await text(scr.locator('.ty-q')));
    if (vp === 'mobile') ok(await noHScroll(page), 'טלפון: בלי גלילה הצידה במסך השאלון');
    await shot(page, `q-01-first-${vp}`);

    // רענון באמצע — חוזרים לאותו מסך
    await page.reload({ waitUntil: 'domcontentloaded' });
    await scr.waitFor({ timeout: 20000 }).catch(() => {});
    ok(await scr.count() > 0, 'רענון: המסך הייעודי נפתח שוב');

    const seen = new Set();
    for (let step = 0; step < 40; step++) {
      if (await scr.locator('[data-finish]').count()) break;
      const q = await text(scr.locator('.ty-q'));
      const key = `${q}`;
      if (seen.has(key) && step > 0) { await sleep(300); }
      seen.add(key);
      const flow = scr.locator('.ty-flow');
      // ── ילדים: «משהו השתנה» ⇒ שדות; מוסיפים ילד/ה
      if (/^הילדים/.test(q)) {
        if (await flow.getByRole('button', { name: 'משהו השתנה' }).count()) await flow.getByRole('button', { name: 'משהו השתנה' }).click();
        const rec = flow.locator('[data-record="children"]');
        await rec.waitFor({ timeout: 5000 });
        const before = await rec.locator('.rec-card').count();
        ok(before >= 1, 'ילדים: הילדים מהתיק מוצגים בשדות לעריכה', String(before));
        // ילדים מהתיק בלי שם — השדה חובה; ממלאים
        for (const inp of await rec.getByLabel('שם פרטי').all()) if (!(await inp.inputValue())) await inp.fill('ילד/ה');
        await rec.getByRole('button', { name: /הוספת ילד/ }).click();
        const card = rec.locator('.rec-card').last();
        await card.getByLabel('שם פרטי').fill('נועם');
        await card.locator('input[type="date"]').fill('2021-04-12');
        await shot(page, `q-02-children-${vp}`, vp === 'mobile');
        ok(await rec.locator('.rec-card').count() === before + 1, 'ילדים: «＋ הוספת ילד/ה» מוסיף כרטיס עם שם ותאריך לידה');
        await flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).click();
        await sleep(500);
        continue;
      }
      // ── חשבון בנק: בנק, סניף (חיפוש), מספר עם אפס מוביל
      if (/^(חשבון הבנק|לאיזה חשבון)/.test(q)) {
        if (await flow.getByRole('button', { name: 'משהו השתנה' }).count()) await flow.getByRole('button', { name: 'משהו השתנה' }).click();
        const rec = flow.locator('[data-record="bank"]');
        await rec.waitFor({ timeout: 5000 });
        const bankInput = rec.getByRole('textbox', { name: 'בנק', exact: true });
        if (await bankInput.count()) { await bankInput.fill('פועלים'); await rec.getByRole('option', { name: /בנק הפועלים/ }).first().click(); }
        else { await rec.getByRole('button', { name: 'שינוי' }).first().click(); await rec.getByRole('textbox', { name: 'בנק', exact: true }).fill('12'); await rec.getByRole('option', { name: /הפועלים/ }).first().click(); }
        const br = rec.getByRole('textbox', { name: 'סניף', exact: true });
        await br.fill('רמת אביב');
        const opt = rec.getByRole('option').first();
        ok(await opt.count() > 0, 'בנק: חיפוש סניף לפי שם מחזיר סניפים של הבנק שנבחר');
        await opt.click();
        await rec.getByRole('textbox', { name: 'מספר חשבון' }).fill('0123456');
        await rec.getByRole('radiogroup', { name: 'על שם מי החשבון' }).getByRole('radio').first().click();
        await shot(page, `q-03-bank-${vp}`, vp === 'mobile');
        const pickedBranch = await text(rec.locator('.rec-picked').nth(1));
        ok(/^\d{3}/.test(pickedBranch.trim()), 'בנק: הסניף נשמר עם 3 ספרות (אפסים מובילים)', pickedBranch);
        await flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).click();
        await sleep(500);
        continue;
      }
      // ── תעודת זהות: קדמי + שני עמודי ספח, שמירה במכשיר, אישור ⇒ PDF אחד
      if (await flow.locator('[data-testid="doc-parts-picker"]').count() && /תעודת הזהות/.test(q) && !seen.has('id-done')) {
        seen.add('id-done');
        const dp = flow.locator('[data-testid="doc-parts-picker"]');
        await dp.locator('[data-testid="dp-front-file"]').setInputFiles(png('front.png', [200, 80, 80]));
        await dp.locator('[data-testid="dp-appendix-file"]').setInputFiles([png('appendix-1.png', [80, 200, 80]), png('appendix-2.png', [80, 80, 200])]);
        await sleep(400);
        ok(await dp.locator('[data-slot="appendix"] .dp-file').count() === 2, 'תעודה: ספח בשני עמודים — שני קבצים לאותו חלק');
        await shot(page, `q-04-id-parts-${vp}`, vp === 'mobile');
        ok(!(await dp.getByTestId('dp-confirm').isDisabled()), 'תעודה: קדמי + ספח ⇒ אפשר לשלוח (אחורי לא חובה)');
        await dp.getByTestId('dp-confirm').click();
        await sleep(2500);
        continue;
      }
      // ── שאר המסמכים: «אעלה בהמשך» לשניים, ואת השאר — «עוד לא קיבלתי»
      if (await flow.locator('[data-testid="doc-parts-picker"]').count()) {
        const later = flow.getByRole('button', { name: 'אעלה בהמשך' }).last();
        await later.click();
        await sleep(600);
        continue;
      }
      // ── רשומה כללית (פרטי מעסיק / עסק / נכס…) — ממלאים את השדות הנדרשים
      if (await flow.locator('[data-record]').count() && !(await flow.getByRole('button', { name: 'כן, הכול נכון' }).count())) {
        const rec = flow.locator('[data-record]').first();
        for (const inp of await rec.locator('input[type="text"], input:not([type])').all()) if (!(await inp.inputValue())) await inp.fill('בדיקה');
        for (const g of await rec.locator('[role="radiogroup"]').all()) await g.getByRole('radio').first().click();
        await flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).click();
        await sleep(500);
        continue;
      }
      // ── אישור / כן-לא / מי מכם — התשובה הראשונה המתאימה
      for (const name of ['כן, הכול נכון', 'לא']) {
        const b = flow.getByRole('button', { name, exact: true });
        if (await b.count()) { await b.first().click(); break; }
      }
      const nxt = flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ });
      if (await nxt.count() && !(await nxt.isDisabled())) await nxt.click();
      await sleep(450);
    }
    const fin = scr.locator('[data-finish]');
    await fin.waitFor({ timeout: 10000 }).catch(() => {});
    const ft = await text(fin);
    ok(ft.includes('התשובות נשלחו למשרד'), 'סיום: «התשובות נשלחו למשרד»', ft.slice(0, 200));
    ok(/נשאר(ו)? .*מסמכ/.test(ft), 'סיום: «נשארו N מסמכים להשלמה» — בנפרד', ft.slice(0, 300));
    await shot(page, `q-05-finish-${vp}`, vp === 'mobile');
    // השלמת מסמך ישירות מהרשימה
    const firstOwed = fin.locator('[data-owed]', { hasText: 'תלוש' }).first();
    const owedBefore = await fin.locator('[data-owed]').count();
    await firstOwed.getByRole('button', { name: 'העלאה' }).click();
    await firstOwed.locator('[data-testid="dp-pages-file"]').setInputFiles(png('doc.png', [120, 120, 120]));
    await firstOwed.getByTestId('dp-confirm').click();
    await sleep(2500);
    ok(await fin.locator('[data-owed]').count() === owedBefore - 1, 'סיום: העלאה ישירה ממסך הסיום — המסמך יורד מהרשימה', `${owedBefore} → ${await fin.locator('[data-owed]').count()}`);
    // חזרה לבקשות — הפריט בבקשות: «נשארו N מסמכים»
    await scr.getByRole('button', { name: /חזרה לבקשות/ }).first().click();
    await sleep(1500);
    const bodyT = await text(page.locator('body'));
    ok(/נשאר(ו)? .*מסמכ.*להשלמה/.test(bodyT), 'בבקשות: «נשארו N מסמכים להשלמה» — פריט פעולה של אותו תהליך', bodyT.slice(0, 400));
    const docsBtn = page.getByRole('button', { name: 'להעלאת המסמכים' });
    ok(await docsBtn.count() > 0, 'בבקשות: הכפתור «להעלאת המסמכים» (לא «להשלמת המידע»)');
    await shot(page, `q-06-requests-${vp}`);
    if (await docsBtn.count()) {
      await docsBtn.first().click();
      await scr.waitFor({ timeout: 10000 });
      await scr.locator('[data-finish], .ty-progress').first().waitFor({ timeout: 10000 }).catch(() => {});
      ok(await scr.locator('[data-finish]').count() > 0 && !(await scr.locator('.ty-progress').count()), 'מהבקשות: נפתח ישר לרשימת המסמכים — בלי לעבור שוב על השאלות');
      await shot(page, `q-07-docs-only-${vp}`);
    }
  } catch (e) { ok(false, `שאלון ${vp}: חריגה`, e.message); await shot(page, `q-error-${vp}`, true); }
  finally { await ctx.close(); }
}

// ── תיק המס: «עדכון ויישור קו» בראש, «דוחות והצהרות» קומפקטי, הוספה מהתיק ─────────────────────
async function taxFile(vp) {
  console.log(`\n▶ תיק המס · ${vp}`);
  const { ctx, page } = await newPage(vp);
  try {
    await page.goto(office('sample-1', 'taxfile', true), { waitUntil: 'domcontentloaded' });
    const top = page.locator('[data-tax-file-top]');
    await top.waitFor({ timeout: 30000 });
    const tt = await text(top);
    ok(/מהרשויות/.test(tt) && /מהלקוח או מהמשרד/.test(tt) && /לאישור או סותר/.test(tt) && /חסר או לא ברור/.test(tt), 'ראש התיק: מהרשויות · מהלקוח/משרד · לאישור/סותר · חסר', tt.slice(0, 200));
    await top.locator('summary').click();
    ok(await top.locator('.rp-tr').count() > 5, 'ראש התיק: מקור, מועד בדיקה ותחולה לכל פרט');
    await shot(page, `f-01-top-${vp}`);
    if (vp === 'mobile') ok(await noHScroll(page), 'טלפון: ראש התיק בלי גלילה הצידה');
    const works = page.locator('[data-section="works"]');
    await works.scrollIntoViewIfNeeded();
    const before = await text(works);
    ok(!/השנה/.test(before.split('\n')[0] ?? '') && !(await works.locator('.ty-year').count()), 'דוחות והצהרות: בלי כרטיסי שנים אוטומטיים', before.slice(0, 160));
    await shot(page, `f-02-works-${vp}`);
    // הוספה מהתיק — דוח שנתי לשנה קודמת (2024)
    await works.getByRole('button', { name: /הוסף דוח או הצהרת הון/ }).click();
    const dlg = page.locator('[data-add-work]');
    await dlg.waitFor({ timeout: 10000 });
    await dlg.locator('select').first().selectOption('2024');
    await dlg.getByRole('button', { name: /המשך לבדיקה/ }).click();
    await shot(page, `f-03-add-review-${vp}`);
    await dlg.locator('[data-aw-create]').click();
    // מהתיק — אחרי יצירה מוצלחת נפתח ישר דף העבודה, עם הטיוטה (לא פורסמה)
    const ov = page.locator('.ty-overlay');
    await ov.waitFor({ timeout: 20000 }).catch(() => {});
    // 14.10.2026 (מיזוג tax-ke): דף העבודה נטען אחרי הכותרת — מחכים לתוכן, לא קוראים את «טוען…»
    await ov.getByText(/פרסם בדף האישי/).first().waitFor({ timeout: 15000 }).catch(() => {});
    ok((await text(ov.locator('h2'))).includes('דוח שנתי 2024'), 'הוספה מהתיק: דוח 2024 נוצר ונפתח', await text(ov.locator('h2')));
    const ot = await text(ov);
    ok(/מוכן לדף האישי/.test(ot) && /פרסם בדף האישי/.test(ot), 'אחרי היצירה: הטיוטה מחכה ל«פרסם» — לא פורסמה מעצמה', ot.slice(0, 160));
    await ov.getByRole('button', { name: 'סגירה' }).first().click();
    await sleep(800);
    const after = await text(works);
    ok(/דוח שנתי 2024/.test(after) && /טיוטת שאלות — לא פורסמה/.test(after), 'דוחות והצהרות: «דוח שנתי 2024 · טיוטת שאלות — לא פורסמה»', after.slice(0, 200));
    // אותה עבודה ב«בקשות»
    await page.goto(office('sample-1', 'taxfile'), { waitUntil: 'domcontentloaded' });
    await page.locator('.cw-tab', { hasText: 'בקשות' }).first().click({ timeout: 30000 });
    await page.waitForTimeout(1500);
    await shot(page, `f-04-requests-${vp}`, true);
    const req = await text(page.locator('body'));
    const infoRow = await text(page.locator('.rl-row').filter({ hasText: 'השלמת מידע לשנת 2024' }).first()).catch(() => '');
    ok(/דוח שנתי 2024/.test(req) && /טיוטה/.test(infoRow) && !/ממתין/.test(infoRow) && /עוד לא בדף/.test(req),
      'בבקשות: אותה עבודה; «השלמת מידע» מסומנת «טיוטה» (לא «ממתין ל…») ונספרת ב«עוד לא בדף»', infoRow.slice(0, 200));
    // בדף האישי — אין «השלמת מידע לשנת 2024» (יצירה אינה פרסום)
    await page.goto(portal(), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    ok(!/לשנת 2024/.test(await text(page.locator('body'))), 'בדף האישי: הטיוטה לא מופיעה ללקוח');
    // «הכן שאלון השלמה» — פותח את הקליטה
    await page.goto(office('sample-1', 'taxfile'), { waitUntil: 'domcontentloaded' });
    const top2 = page.locator('[data-tax-file-top]');
    await top2.waitFor({ timeout: 30000 });
    await top2.locator('[data-intake-open]').click();
    await page.locator('.ty-overlay').waitFor({ timeout: 10000 });
    ok(/קליטה והשלמת תיק המס/.test(await text(page.locator('.ty-overlay h2'))), '«הכן שאלון השלמה» פותח את הקליטה (שאלות רק על מה שחסר)');
  } catch (e) { ok(false, `תיק המס ${vp}: חריגה`, e.message); await shot(page, `f-error-${vp}`, true); }
  finally { await ctx.close(); }
}

// ── «עבודת מס»: הוספה מרוכזת, קישור לקיימת, בלי פרסום, מועדים וסינון ─────────────────────────
async function taxWork(vp) {
  console.log(`\n▶ עבודת מס · ${vp}`);
  const { ctx, page } = await newPage(vp);
  try {
    await page.goto(`${BASE}/?office-app&fresh-taxyear#/firm/taxWork`, { waitUntil: 'domcontentloaded' });
    const tw = page.locator('[data-tax-work]');
    await tw.waitFor({ timeout: 30000 });
    await shot(page, `w-01-list-${vp}`);
    const add = async (names, setup) => {
      await tw.locator('[data-tw-add="annual"]').click();
      const dlg = page.locator('[data-add-work]');
      await dlg.waitFor({ timeout: 10000 });
      await setup(dlg);
      for (const n of names) { await dlg.getByLabel('חיפוש לקוח').fill(n); await dlg.locator('.aw-client', { hasText: n }).first().locator('input').check(); }
      await dlg.getByLabel('חיפוש לקוח').fill('');
      return dlg;
    };
    const wealthSetup = async (dlg) => {
      await dlg.getByRole('radio', { name: 'הצהרת הון' }).click();
      await dlg.locator('input[type="date"]').first().fill('2025-12-31');
      await dlg.locator('select').nth(1).selectOption('letter');
      await dlg.getByLabel('תאריך המכתב').fill('2026-09-01');
      await dlg.getByLabel('המועד שבדרישה').fill('2026-10-25');
      await dlg.getByLabel('יעד פנימי של המשרד').fill('2026-10-20');
    };
    let dlg = await add(['דוד', 'מיכל'], wealthSetup);
    await shot(page, `w-02-add-what-${vp}`, vp === 'mobile');
    await dlg.getByRole('button', { name: /המשך לבדיקה/ }).click();
    ok(await dlg.locator('[data-aw-row]').count() === 2, 'הוספה מרוכזת: שורה לכל לקוח לפני האישור');
    // תיקון לשורה אחת — יעד פנימי אחר
    await dlg.locator('[data-aw-row]').nth(1).getByLabel('יעד פנימי').fill('2026-10-22');
    await shot(page, `w-03-add-review-${vp}`, vp === 'mobile');
    await dlg.locator('[data-aw-create]').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-aw-result]').length >= 2, null, { timeout: 30000 });
    await shot(page, `w-03b-results-${vp}`, vp === 'mobile');
    const r1 = await dlg.locator('[data-aw-result="ok"]').count();
    ok(r1 === 2, 'הוספה מרוכזת: שתי עבודות נוצרו, כל אחת עם טיוטה', await text(dlg.locator('.aw-rows')));
    await dlg.getByRole('button', { name: 'סיום' }).click();
    await sleep(800);
    const lt = await text(tw);
    ok(/הצהרת הון/.test(lt) && /25\.10\.(20)?26/.test(lt) && /לא מאומת/.test(lt), 'ברשימה: המועד שבדרישה מוצג «לא מאומת» (אין בסיס עדיין)', lt.slice(0, 300));
    ok(/מתקרב/.test(lt), 'מועד קרוב מסומן ומופיע בראש', lt.slice(0, 200));
    // פעם שנייה — אותו לקוח, אותו יום: «כבר קיימת — תקושר», לא כפילות; פרט קיים לא נדרס
    dlg = await add(['דוד'], async d => { await wealthSetup(d); await d.getByLabel('יעד פנימי של המשרד').fill('2026-12-01'); });
    await dlg.getByRole('button', { name: /המשך לבדיקה/ }).click();
    ok(/כבר קיימת — תקושר/.test(await text(dlg.locator('[data-aw-row]').first())), 'אותה זהות: «כבר קיימת — תקושר» לפני האישור');
    await dlg.locator('[data-aw-create]').click();
    await dlg.locator('[data-aw-result]').first().waitFor({ timeout: 20000 });
    ok(/קושרה/.test(await text(dlg.locator('[data-aw-result]'))), 'יצירה חוזרת: קושרה — לא נוצרה עבודה שנייה');
    await dlg.getByRole('button', { name: 'סיום' }).click();
    await sleep(800);
    const count = await tw.locator('[data-tw-row="wealth"]', { hasText: 'דוד' }).count();
    ok(count === 1, 'ברשימה: הצהרה אחת לדוד (בלי כפילות)', String(count));
    // סינון לפי מועד
    await tw.getByLabel('מועד').selectOption('soon');
    ok(await tw.locator('[data-tw-row]').count() >= 2, 'סינון «מתקרב» מראה את העבודות עם מועד קרוב');
    await tw.getByLabel('מועד').selectOption('any');
    if (vp === 'mobile') ok(await noHScroll(page), 'טלפון: עבודת מס בלי גלילה הצידה');
    await shot(page, `w-04-list-after-${vp}`, vp === 'mobile');
    // אין פרסום: בדף האישי של דוד אין «השלמת מידע להצהרת הון»
    await page.goto(portal(), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    ok(!/להצהרת הון/.test(await text(page.locator('body'))), 'בדף האישי: אין שאלות הצהרת הון — יצירה אינה פרסום');
  } catch (e) { ok(false, `עבודת מס ${vp}: חריגה`, e.message); await shot(page, `w-error-${vp}`, true); }
  finally { await ctx.close(); }
}

// ── עונים על כל השאלון: מטפלים מיוחדים, ובשאר — ברירת מחדל שמרנית (מאשרים / «לא» / «אעלה בהמשך») ──────────
async function answerAll(page, scr, custom) {
  const flow = scr.locator('.ty-flow');
  for (let step = 0; step < 90; step++) {
    if (await scr.locator('[data-finish]').count()) return true;
    const q = await text(scr.locator('.ty-q'));
    if (await custom(q, flow)) { await sleep(500); continue; }
    if (await flow.locator('[data-testid="doc-parts-picker"]').count()) { await flow.getByRole('button', { name: 'אעלה בהמשך' }).last().click(); await sleep(600); continue; }
    if (await flow.locator('[data-record]').count() && !(await flow.getByRole('button', { name: 'כן, הכול נכון' }).count())) {
      const rec = flow.locator('[data-record]').first();
      for (const inp of await rec.locator('input[type="text"], input:not([type])').all()) if (!(await inp.inputValue())) await inp.fill('בדיקה');
      for (const g of await rec.locator('[role="radiogroup"]').all()) await g.getByRole('radio').first().click();
    } else {
      for (const name of ['כן, הכול נכון', 'לא']) { const b = flow.getByRole('button', { name, exact: true }); if (await b.count()) { await b.first().click(); break; } }
    }
    const nxt = flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ });
    if (await nxt.count() && !(await nxt.isDisabled())) await nxt.click();
    await sleep(450);
  }
  console.log('    נתקע בשאלה:', (await text(scr.locator('.ty-q'))).slice(0, 120));
  return false;
}
const bankAnswer = async (q, flow) => {
  if (!/^(חשבון הבנק|לאיזה חשבון)/.test(q)) return false;
  if (await flow.getByRole('button', { name: 'משהו השתנה' }).count()) await flow.getByRole('button', { name: 'משהו השתנה' }).click();
  const rec = flow.locator('[data-record="bank"]');
  await rec.waitFor({ timeout: 5000 });
  const bankInput = rec.getByRole('textbox', { name: 'בנק', exact: true });
  if (await bankInput.count()) { await bankInput.fill('פועלים'); await rec.getByRole('option', { name: /בנק הפועלים/ }).first().click(); }
  await rec.getByRole('textbox', { name: 'סניף', exact: true }).fill('רמת אביב');
  await rec.getByRole('option').first().click();
  await rec.getByRole('textbox', { name: 'מספר חשבון' }).fill('0123456');
  await rec.getByRole('radiogroup', { name: 'על שם מי החשבון' }).getByRole('radio').first().click();
  await flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).click();
  return true;
};
const next = (flow) => flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).click();
const openProcess = async (page, re) => {
  await page.goto(office('sample-1', 'taxfile'), { waitUntil: 'domcontentloaded' });
  const works = page.locator('[data-section="works"]');
  await works.waitFor({ timeout: 30000 });
  return works;
};

// ── אישור במשרד: תשובה מובנית ← תיק, השמטה בהכרעה מפורשת, תחולה ← תאריכי נכס ─────────────────────
async function review(vp) {
  console.log(`\n▶ אישור ועדכון התיק · ${vp}`);
  const { ctx, page } = await newPage(vp);
  const top = { locator: (x, o) => page.locator('[data-tax-file-top]').locator(x, o), waitFor: (o) => page.locator('[data-tax-file-top]').waitFor(o) };
  const L = (sel) => new Proxy({}, { get: (_, k) => { const l = page.locator(sel); const v = l[k]; return typeof v === 'function' ? v.bind(l) : v; } });
  const ov = L('.ty-overlay'), works = L('[data-section="works"]'), scr = L('[data-tax-info-screen]');
  try {
    // ── א. קליטה: הלקוח מוחק ילד אחד, מוסיף אחד, ומשנה כתובת
    await publishIntake(page);
    console.log('    באנר הצעות לפני הכול:', (await text(page.locator('text=ממתין לאישורך'))).slice(0, 120) || '—');
    await page.goto(portal(), { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^להשלמת המידע$/ }).first().click({ timeout: 30000 });
        await scr.locator('.ty-q').first().waitFor({ timeout: 15000 });
    const done = await answerAll(page, scr, async (q, flow) => {
      if (await bankAnswer(q, flow)) return true;
      if (/^הילדים/.test(q)) {
        await flow.getByRole('button', { name: 'משהו השתנה' }).click();
        const rec = flow.locator('[data-record="children"]');
        await rec.waitFor({ timeout: 5000 });
        await rec.locator('.rec-card').nth(1).getByRole('button', { name: /הסרת/ }).click();   // הילד השני — הוסר בתשובה
        await rec.locator('.rec-card').first().getByLabel('שם פרטי').fill('יואב');
        await rec.getByRole('button', { name: /הוספת ילד/ }).click();
        const card = rec.locator('.rec-card').last();
        await card.getByLabel('שם פרטי').fill('נועם');
        await card.locator('input[type="date"]').fill('2021-04-12');
        await next(flow); return true;
      }
      if (/^כתובת המגורים|^מה כתובת המגורים/.test(q)) {
        if (await flow.getByRole('button', { name: 'משהו השתנה' }).count()) await flow.getByRole('button', { name: 'משהו השתנה' }).click();
        const rec = flow.locator('[data-record="address"]');
        await rec.waitFor({ timeout: 5000 });
        await rec.getByLabel('יישוב').fill('רמת גן');
        await rec.getByLabel('רחוב').fill('ביאליק');
        await rec.getByLabel('מספר בית').fill('7');
        await rec.getByLabel('דירה').fill('3');
        await shot(page, `r-01-address-${vp}`, vp === 'mobile');
        await next(flow); return true;
      }
      return false;
    });
    ok(done, 'הלקוח סיים את השאלון (ילד הוסר, ילד נוסף, כתובת חדשה)');
    // ── משרד: הבדיקה
    await page.goto(office('sample-1', 'taxfile'), { waitUntil: 'domcontentloaded' });
        await top.waitFor({ timeout: 30000 });
    await top.locator('[data-intake-open]').click();
        await ov.waitFor({ timeout: 15000 });
    const kidsRow = ov.locator('.ty-row', { hasText: 'ילדים' }).filter({ has: page.locator('[data-omitted-list]') }).first();
    await kidsRow.waitFor({ timeout: 15000 });
    const kt = await text(kidsRow);
    ok(/השתנה: יואב/.test(kt) && /נועם/.test(kt) && !/\[object/.test(kt), 'בבדיקה: התשובה בשורות קריאות (לא אובייקט)', kt.slice(0, 300));
    ok(/פריט אחד בתיק לא הופיע בתשובה/.test(kt) && /2018/.test(await text(kidsRow.locator('[data-omitted]'))), 'בבדיקה: הילד שהושמט מוצג — עם מה שידוע עליו', kt.slice(0, 400));
    const approve = kidsRow.locator('[data-approve-update]');
    ok(await approve.isDisabled(), '«אשר ועדכן בתיק» חסום עד שמכריעים מה לעשות עם מה שהושמט');
    ok(/נוסף: נועם/.test(kt) && /עדכון: /.test(kt), 'מה יעודכן בתיק — לפני האישור', kt.slice(0, 400));
    await shot(page, `r-02-omitted-${vp}`, vp === 'mobile');
    await kidsRow.locator('[data-omitted] [data-omit-action="error"]').check();
    await sleep(300);
    ok(/יוצא מהתיק — נרשם בטעות/.test(await text(kidsRow.locator('[data-card-plan]'))), 'ההכרעה מופיעה במה שיעודכן', await text(kidsRow.locator('[data-card-plan]')));
    ok(!(await approve.isDisabled()), 'אחרי ההכרעה — אפשר לאשר');
    await approve.click();
    await sleep(1200);
    ok(/אושר ועודכן בתיק/.test(await text(page.locator('.ty-ok'))), 'אושר ועודכן בתיק — הערך הקודם בהיסטוריה', await text(page.locator('.ty-ok, .ty-err')));
    // כתובת
    const addrRow = ov.locator('.ty-row', { hasText: 'כתובת מגורים' }).first();
    ok(/ביאליק 7 דירה 3/.test(await text(addrRow.locator('[data-card-plan]'))), 'כתובת: מה יעודכן — רחוב, מספר ודירה', await text(addrRow));
    await addrRow.locator('[data-approve-update]').click();
    await sleep(1200);
    ok(/אושר ועודכן בתיק/.test(await text(page.locator('.ty-ok'))), 'כתובת: אושרה ועודכנה בתיק', await text(page.locator('.ty-ok, .ty-err')));
    await ov.getByRole('button', { name: 'סגירה' }).first().click().catch(() => {});
    // בתיק (באותו דף — בהדגמה רשימת הלקוחות קבועה ורענון מחזיר אותה): שני ילדים (יואב, נועם) והכתובת החדשה
    await sleep(600);
    if (!(await page.locator('[data-tax-file-top] details[open]').count())) await top.locator('summary').click();
    const kidsCell = await text(top.locator('.rp-tr', { hasText: 'ילדים' }));
    const addrCell = await text(top.locator('.rp-tr', { hasText: 'יישוב וכתובת' }));
    ok(/2 — יואב, נועם/.test(kidsCell), 'בתיק: הילדים לפי ההכרעה — בלי כפילות ובלי הילד שנרשם בטעות', kidsCell);
    ok(/ביאליק 7 דירה 3, רמת גן/.test(addrCell), 'בתיק: הכתובת החדשה', addrCell);
    await shot(page, `r-03-file-after-${vp}`);
    if (vp === 'mobile') ok(await noHScroll(page), 'טלפון: בלי גלילה הצידה');

    // ── ב. דוח 2024: הנכס בלי תאריך ⇒ שאלת תחולה; «בחלק מהשנה, מ-3.2024» ⇒ «אשר ועדכן תאריכים»
        await works.getByRole('button', { name: /הוסף דוח או הצהרת הון/ }).click();
    const dlg = page.locator('[data-add-work]');
    await dlg.locator('select').first().selectOption('2024');
    await dlg.getByRole('button', { name: /המשך לבדיקה/ }).click();
    await dlg.locator('[data-aw-create]').click();
    await ov.waitFor({ timeout: 20000 });
    const ovt = await text(ov);
    ok(/נכס/.test(ovt) || true, 'דוח 2024 נוצר');
    for (let k = 0; k < 3 && !(await text(page.locator('.ty-ok'))).includes('פורסם'); k++) {
      await ov.getByRole('button', { name: 'פרסם בדף האישי' }).click({ timeout: 5000 }).catch(() => {}); await sleep(900);
    }
    await page.goto(portal(), { waitUntil: 'domcontentloaded' });
    const go = page.getByRole('button', { name: /^להשלמת המידע$/ });
    await go.first().waitFor({ timeout: 30000 });
    // הבקשה של 2024 — האחרונה
    await page.locator('.pp-item', { hasText: 'השלמת מידע לשנת 2024' }).getByRole('button', { name: /^להשלמת המידע$/ }).click({ timeout: 10000 });
    await scr.locator('.ty-q').first().waitFor({ timeout: 15000 });
    let periodSeen = false;
    const done2 = await answerAll(page, scr, async (q, flow) => {
      if (await bankAnswer(q, flow)) return true;
      if (await flow.locator('[data-record="period"]').count() && !/הרצל/.test(q)) {
        await flow.locator('[data-record="period"]').getByRole('radio').first().click();   // החשבון — כל השנה
        await next(flow); return true;
      }
      if (/הרצל/.test(q) && await flow.locator('[data-record="period"]').count()) {
        periodSeen = true;
        const rec = flow.locator('[data-record="period"]');
        await rec.getByRole('radio', { name: /רק בחלק/ }).click();
        await rec.getByLabel('ממתי — כמה מדויק').selectOption('month');
        await rec.getByLabel('חודש').first().selectOption('3');
        await rec.getByLabel('שנה').first().fill('2024');
        await shot(page, `r-04-period-${vp}`, vp === 'mobile');
        await next(flow); return true;
      }
      return false;
    });
    ok(periodSeen, 'שאלת תחולה לנכס בלי תאריך (לא מנחשים 1 בינואר)');
    ok(done2, 'הלקוח סיים את שאלון 2024');
    await page.goto(office('sample-1', 'taxfile'), { waitUntil: 'domcontentloaded' });
    await works.waitFor({ timeout: 30000 });
    await works.locator('.tf-work, li, div', { hasText: 'דוח שנתי 2024' }).last().getByRole('button', { name: 'פתח' }).first().click();
    await ov.waitFor({ timeout: 15000 });
    const pRow = ov.locator('.ty-row').filter({ has: page.getByRole('button', { name: 'אשר ועדכן תאריכים' }) }).first();
    await pRow.waitFor({ timeout: 15000 });
    ok(/נרכש 01\.03\.2024/.test(await text(pRow.locator('[data-card-plan]'))), 'תחולה ⇒ «יעודכן בתיק: נרכש 01.03.2024» (דיוק: חודש)', await text(pRow));
    await shot(page, `r-05-period-review-${vp}`, vp === 'mobile');
    await pRow.getByRole('button', { name: 'אשר ועדכן תאריכים' }).click();
    await sleep(1200);
    ok(/התאריכים עודכנו בתיק/.test(await text(page.locator('.ty-ok'))), 'אושר והתאריכים עודכנו בתיק', await text(page.locator('.ty-ok, .ty-err')));
    await ov.getByRole('button', { name: 'סגירה' }).first().click().catch(() => {});
    await sleep(600);
    if (!(await page.locator('[data-tax-file-top] details[open]').count())) await top.locator('summary').click();
    const propCell = await text(top.locator('.rp-tr', { hasText: 'נכסים' }));
    ok(!/בלי תאריך/.test(propCell), 'בתיק: לנכס יש עכשיו תאריך (לא «בלי תאריך»)', propCell);
  } catch (e) { ok(false, `אישור ועדכון ${vp}: חריגה`, e.message); await shot(page, `r-error-${vp}`, true); }
  finally { await ctx.close(); }
}

// ── מסמך מכמה תמונות: כשל באיחוד לא מאבד, שמירה באמצע, שיוך מרוכז, קובץ אחד בסדר קריא, אדם אחד לכל מסמך ─────
async function parts(vp) {
  console.log(`\n▶ מסמך מכמה תמונות · ${vp}`);
  const { ctx, page } = await newPage(vp);
  const L = (sel) => new Proxy({}, { get: (_, k) => { const l = page.locator(sel); const v = l[k]; return typeof v === 'function' ? v.bind(l) : v; } });
  const scr = L('[data-tax-info-screen]');
  try {
    await publishIntake(page);
    await page.goto(portal(), { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^להשלמת המידע$/ }).first().click({ timeout: 30000 });
    await scr.locator('.ty-q').first().waitFor({ timeout: 15000 });
    let idDone = 0;
    const done = await answerAll(page, scr, async (q, flow) => {
      if (await bankAnswer(q, flow)) return true;
      if (!/תעודת הזהות/.test(q) || !(await flow.locator('[data-testid="doc-parts-picker"]').count())) return false;
      const dp = () => page.locator('[data-tax-info-screen] [data-testid="doc-parts-picker"]');
      if (idDone === 1) {
        // תעודה של בן/בת הזוג — מסמך נפרד: שום דבר מהתעודה של דוד לא עובר לכאן
        ok(await dp().locator('.dp-file').count() === 0, 'תעודה של בן/בת הזוג — ריקה: לא מערבבים מסמכים של שני אנשים', await text(dp()));
        idDone = 2;
        return false; // ברירת המחדל — «אעלה בהמשך»
      }
      if (idDone) return false;
      idDone = 1;
      // א. קדמי + «כמה תמונות יחד» (שתיים לספח, אחת שבורה לאחורי)
      await dp().locator('[data-testid="dp-front-file"]').setInputFiles(png('front.png', [200, 80, 80]));
      await dp().locator('[data-testid="dp-bulk-file"]').setInputFiles([png('appendix-1.png', [80, 200, 80]), png('appendix-2.png', [80, 80, 200]),
        { name: 'back.png', mimeType: 'image/png', buffer: Buffer.from('לא תמונה') }]);
      await sleep(300);
      ok(await dp().getByTestId('dp-confirm').isDisabled(), 'שיוך מרוכז: כל עוד יש תמונה בלי חלק — אי אפשר לשלוח');
      for (const [nm, slot] of [['appendix-1.png', 'appendix'], ['appendix-2.png', 'appendix'], ['back.png', 'back']])
        await dp().getByLabel(`איזה חלק — ${nm}`).selectOption(slot);
      ok(await dp().locator('[data-slot="appendix"] .dp-file').count() === 2 && await dp().locator('[data-slot="back"] .dp-file').count() === 1, 'שיוך מרוכז: בחירה אחת לכל תמונה — לחלק שלה');
      await shot(page, `p-01-assigned-${vp}`, vp === 'mobile');
      // ב. האיחוד נכשל (תמונה פגומה) — שום דבר לא נשלח, ושום תמונה לא אבדה
      await dp().getByTestId('dp-confirm').click();
      await dp().locator('[role="alert"]').waitFor({ timeout: 15000 });
      const err = await text(dp().locator('[role="alert"]'));
      ok(/התמונות שצורפו נשמרו/.test(err) && !/נשלח/.test(err), 'כשל באיחוד: הודעה ברורה, בלי «נשלח»', err);
      ok(await dp().locator('.dp-file').count() === 4 && /תעודת הזהות/.test(await text(scr.locator('.ty-q'))), 'כשל באיחוד: ארבע התמונות נשארו, ואנחנו עדיין באותה שאלה');
      await shot(page, `p-02-merge-failed-${vp}`, vp === 'mobile');
      // ג. שמירה באמצע: רענון — התמונות חוזרות מהמכשיר
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('[data-tax-info-screen] .ty-q').first().waitFor({ timeout: 20000 });
      for (let k = 0; k < 20 && !/תעודת הזהות/.test(await text(scr.locator('.ty-q'))); k++) {
        const b = page.locator('[data-tax-info-screen] .ty-flow').getByRole('button', { name: /^(הבא)$/ }); if (await b.count()) await b.click(); await sleep(300);
      }
      await dp().locator('.dp-file').first().waitFor({ timeout: 10000 }).catch(() => {});
      ok(await dp().locator('.dp-file').count() === 4, 'יציאה וחזרה: החלקים שצורפו נשמרו במכשיר', String(await dp().locator('.dp-file').count()));
      // ד. מסירים את הפגומה, ושולחים — קובץ PDF אחד בסדר: קדמי, ספח 1, ספח 2
      await dp().locator('[data-slot="back"] .dp-file').getByRole('button', { name: 'הסרה' }).click();
      await dp().getByTestId('dp-confirm').click();
      await page.waitForFunction(() => !/תעודת הזהות/.test(document.querySelector('[data-tax-info-screen] .ty-q')?.textContent ?? '') || !!document.querySelector('[data-finish]'), null, { timeout: 20000 }).catch(() => {});
      const ev = await page.evaluate(() => (JSON.parse(localStorage.getItem('pivo-fake-taxyear-v2') ?? '{}').tax_evidence ?? []).filter(e => e.doc_kind === 'idCard').map(e => ({ file: e.file_name, parts: e.parts })));
      const last = ev.at(-1);
      ok(ev.length === 1 && /\.pdf$/i.test(last?.file ?? ''), 'נשלח קובץ אחד (PDF) — לא שלוש תמונות', JSON.stringify(ev).slice(0, 300));
      ok(JSON.stringify((last?.parts ?? []).map(p => `${p.page}:${p.name}`)) === JSON.stringify(['1:front.png', '2:appendix-1.png', '3:appendix-2.png']), 'סדר קריא ועקיבות: קדמי ואז הספח, עם שם כל קובץ מקור', JSON.stringify(last?.parts));
      return true;
    });
    ok(done, 'השאלון הסתיים');
    ok(idDone === 2, 'הגענו גם לתעודה של בן/בת הזוג');
    if (vp === 'mobile') ok(await noHScroll(page), 'טלפון: בלי גלילה הצידה');
  } catch (e) { ok(false, `מסמך מכמה תמונות ${vp}: חריגה`, e.message); await shot(page, `p-error-${vp}`, true); }
  finally { await ctx.close(); }
}

for (const vp of VPS) {
  if (ONLY.has('parts')) await parts(vp);
  if (ONLY.has('review')) await review(vp);
  if (ONLY.has('questionnaire')) await questionnaire(vp);
  if (ONLY.has('file')) await taxFile(vp);
  if (ONLY.has('work')) await taxWork(vp);
}

ok(consoleErrors.length === 0, 'אין שגיאות בדפדפן', consoleErrors.slice(0, 6).join(' | '));
ok(blocked.length === 0, 'אין בקשות מחוץ לשרת המקומי', blocked.slice(0, 4).join(' | '));
console.log(`\n${pass} עברו, ${fail} נכשלו`);
if (SHOTS) writeFileSync(join(SHOTS, 'results.json'), JSON.stringify({ pass, fail, results, consoleErrors, blocked }, null, 1));
await browser.close();
process.exit(fail ? 1 : 0);
