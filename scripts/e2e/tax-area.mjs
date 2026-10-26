// ─── «מס» בדפדפן — עבודות, מפת הטופס, ידע מקצועי (14.10 · 16.10 · עיצוב מחדש 21.10.2026) ──────────────
// ‼ על שרת ההדגמה בלבד (?office-app — מסד מדומה בזיכרון הדפדפן). שום דבר לא נשלח ולא נשמר במסד אמיתי.
// ‼ 21.10: בלי מסילה ובלי רשימת טלפון — מתג «עבודות לקוח | ידע מקצועי» בראש, והעמוד גלוי תמיד (גם בטלפון).
// המסלול, במחשב ובטלפון:
//   1. כניסה ל«מס»: מתג גלוי, מסך «עבודות» גלוי, בלי מסילה; המתג עובר בין המרחבים וחוזר לעמוד האחרון.
//   2. «עבודת מס» כבר לא בתפריט החשבון; הקישור הישן נוחת ב«עבודות לקוחות».
//   3. «עבודות» = סקירה בלבד: לשוניות אצלי/אצל הלקוח/הכול, איחור ראשון ובכל לשונית, «בוטלו», חיפוש, יריעת שע״ם,
//      סינון ‎#/tax/work/annual‎ עם תג; שורה ⇒ «בקשות» של הלקוח.
//   4. מפת הטופס (16.10): 1301 הרשמי, סימון על כל שדה, הסבר ליד השדה, «אתר שדה לפי קוד», נספחים, מצב לקוח, 1219, טלפון.
//   5. «ידע מקצועי» נפתח בשאלה (AskHome): תוצאות מקומיות בזמן הקלדה, Enter ⇒ תשובה (בהדגמה: לא זמינה), דוגמאות, עדכון הידע.
//   6. ידע מקצועי: תחום ⇒ נושא ⇒ שלבים (פירורים, לא מסילה); «מה מבקשים מהלקוח» מהשאלון; «לעבודות בתיקים» חוזר לעבודה.
//   7. ערכים לשנה בתחום (15.10): בית אחד לכל ערך, תחומים חדשים, קישור ישן, חיפוש, לוח מועדים, שנה בלי ערך.
//   8. מקלדת: הפוקוס עובר לכותרת השלב. בלי גלילה הצידה ובלי שגיאות קונסול.
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

/** בהירות יחסית 0..1 מ-rgb(a). */
const lum = (c) => { const m = String(c).match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0]; return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };

async function newPage(vp, colorScheme = 'light') {
  const mobile = vp !== 'desktop';
  const ctx = await browser.newContext({
    viewport: vp === 'small' ? { width: 360, height: 740 } : mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'he-IL', colorScheme,
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

// ── עבודות דוגמה להדגמה (16.10.2026) ──────────────────────────────────────────────────────────────
// ‼ «עבודות לקוחות» היא סקירה בלבד — אין ממנה «＋ דוח שנתי». זורעים עבודות לאחסון המקומי שממנו המסד המדומה משחזר
//   (__fakeTaxYear.ts, ‎pivo-fake-taxyear-v2‎). sample-1 דוד כהן · sample-2 מיכל לוי · sample-4 אורית שפירא · sample-5 נטשה גולדברג.
const iso = (d) => d.toISOString().slice(0, 10);
function taxWorkSeed(today = new Date()) {
  const plus = (n) => iso(new Date(today.getTime() + n * 864e5));
  const at = new Date(today.getTime() - 5 * 864e5).toISOString();
  const step = (id, client, type, status, payload, extra = {}) => ({
    id, user_id: 'test-firm', engagement_id: null, client_id: client, step_type: type, status, ball: 'me', track: 'internal', scope: 'person',
    depends_on_step_id: null, due_date: null, needs_attention: false, completion_method: 'manual', created_at: at, updated_at: at, payload, ...extra,
  });
  const work = (due) => ({ work: { deadline: { status: 'verified', due, source: 'publication' } } });
  return [
    step('seed-ar-david', 'sample-1', 'annual_return', 'in_progress', { purpose: 'annual', taxYear: 2025, title: 'דוח שנתי 2025', ...work(plus(-12)) }),
    step('seed-ar-michal', 'sample-2', 'annual_return', 'in_progress', { purpose: 'annual', taxYear: 2025, title: 'דוח שנתי 2025', ...work(plus(9)) }),
    step('seed-wd-orit', 'sample-4', 'wealth_declaration', 'in_progress', { purpose: 'wealth', asOfDate: '2025-12-31', taxYear: 2025, kind: 'first', title: 'הצהרת הון ליום 31.12.2025', internalTarget: plus(60) }),
    step('seed-ar-natasha', 'sample-5', 'annual_return', 'cancelled', { purpose: 'annual', taxYear: 2024, title: 'דוח שנתי 2024', removal: { reason: 'נפתח בטעות', at } }),
  ];
}

/** לפני טעינת הדף: מחליף את שורות שנת המס באחסון ההדגמה בעבודות הדוגמה. */
const seedScript = (steps) => `try { localStorage.setItem('pivo-fake-taxyear-v2', ${JSON.stringify(JSON.stringify({ steps }))}); } catch (e) {}`;

async function run(vp) {
  console.log(`\n▶ «מס» · ${vp}`);
  // ‼ פרקים 1–3 עם עבודות הדוגמה; מפרק 4 — הקשר נקי, כי הזריעה מחליפה גם את תשובות השאלון של ההדגמה
  let { ctx, page, errs } = await newPage(vp);
  await ctx.addInitScript(seedScript(taxWorkSeed()));
  const mobile = vp !== 'desktop';
  try {
    // ── 1. כניסה ── (21.10: מתג בראש, בלי מסילה; העמוד גלוי תמיד, גם בטלפון)
    await go(page, '/tax');
    const modesEl = page.locator('.ta2-modes');
    ok(await modesEl.isVisible() && await modesEl.locator('[data-mode="work"]').isVisible() && await modesEl.locator('[data-mode="learn"]').isVisible(), 'מתג «עבודות לקוח | ידע מקצועי» גלוי בראש', await text(modesEl));
    ok(await page.locator('.ta-rail, [data-rail], .tc-back').count() === 0, 'אין מסילה, אין «› מס» ואין רשימת טלפון');
    ok((await modesEl.locator('[data-mode="work"]').getAttribute('aria-pressed')) === 'true' && await page.locator('[data-work-overview][data-section="all"]').isVisible(), `${mobile ? 'טלפון' : 'מחשב'}: מסך «עבודות» גלוי מיד (אין צורך לבחור כלום)`);
    if (mobile) ok(await noHScroll(page), 'טלפון: כניסה בלי גלילה הצידה');
    await shot(page, `${vp}-00-entry`);
    await modesEl.locator('[data-mode="learn"]').click(); await sleep(500);
    ok((await page.evaluate(() => location.hash)) === '#/tax/learn' && await page.locator('[data-ask-home]').isVisible() && !(await page.locator('[data-work-overview]').count()), 'המתג ← «ידע מקצועי»: נפתח בשאלה');
    await modesEl.locator('[data-mode="work"]').click(); await sleep(500);
    ok((await page.evaluate(() => location.hash)) === '#/tax/work/all' && await page.locator('[data-work-overview]').isVisible(), 'המתג חזרה ← «עבודות»');

    // ── 2. הישן: לא בתפריט ──
    ok(!(await page.locator('button', { hasText: /^עבודת מס$/ }).count()), 'אין יותר כפתור «עבודת מס» נפרד');
    ok(await page.locator('nav button, header button').filter({ hasText: /^מס$/ }).count() > 0, 'בסרגל: «מס»');

    // ── 3. «עבודות» — סקירה בלבד: אצלי / אצל הלקוח / הכול (הכרעת גיא 16.10 · עיצוב מחדש 21.10) ──
    const wo = page.locator('[data-work-overview]');
    const tabN = async (t) => Number((await text(wo.locator(`[data-wo-tab="${t}"] .wov-n`))).trim());
    const rowsOf = async (t) => { await wo.locator(`[data-wo-tab="${t}"]`).click(); await sleep(250); return wo.locator('[data-wo-row]'); };
    ok((await wo.locator('[data-wo-tab="mine"]').getAttribute('aria-pressed')) === 'true', 'ברירת המחדל: «אצלי»');
    const nAll = await tabN('all'), nMine = await tabN('mine'), nClient = await tabN('client');
    ok(nAll === 3 && nMine + nClient === nAll, 'המספרים: הכול = 3 עבודות פתוחות (דוד, מיכל, אורית) = אצלי + אצל הלקוח', `${nMine}/${nClient}/${nAll}`);
    ok(await wo.locator('[data-wo-row]').count() === nMine, 'אצלי: כמות השורות = המספר שעל הלשונית', `${await wo.locator('[data-wo-row]').count()} מול ${nMine}`);
    ok(!(await wo.getByRole('button', { name: /^＋|הסר…|^פתח$|פרסם/ }).count()), 'אין פעולות בסקירה: לא «＋», לא «פתח», לא «הסר», לא «פרסם»');
    ok((await wo.locator('[data-wo-group]').first().getAttribute('data-wo-group')) === 'overdue', 'אצלי: «באיחור» הוא הקבוצה הראשונה');
    const late = await text(wo.locator('[data-wo-group="overdue"] [data-wo-row]').first());
    ok(/דוד כהן/.test(late) && /באיחור 1[23] ימים/.test(late), 'באיחור — דוד, עם מספר הימים', late.replace(/\n/g, ' · '));
    ok(await wo.locator('[data-wo-row][data-wo-due="overdue"]').count() === 1 && (await wo.locator('[data-wo-row]').first().getAttribute('data-wo-due')) === 'overdue', 'השורה הראשונה ברשימה היא זו שבאיחור');
    await shot(page, `${vp}-01-work-overview`);
    // איחור מוצג בכל לשונית; עבודה בלי איחור — רק בלשונית של מי שהכדור אצלו
    await rowsOf('client');
    const clientRows = await wo.locator('[data-wo-row]').evaluateAll(r => r.map(x => `${x.dataset.woBucket}/${x.dataset.woDue}`));
    ok(clientRows.every(x => x.startsWith('client/') || x.endsWith('/overdue')) && /דוד כהן/.test(await text(wo)), 'אצל הלקוח: רק מה שאצלו — ועבודה באיחור (דוד) מוצגת גם כאן', clientRows.join());
    await rowsOf('all');
    ok(await wo.locator('[data-wo-row]').count() === nAll, '«הכול»: שלוש העבודות הפתוחות', await wo.locator('[data-wo-row]').count());
    ok(!(await wo.locator('[data-wo-bucket="cancelled"], [data-wo-bucket="done"]').count()), 'שבוטלו / הושלמו אינן ברשימה הראשית');
    // «בוטלו» — מאחורי הקישור הקטן בתחתית, עם הסיבה
    const cancelBtn = wo.locator('[data-wo-closed="cancelled"]');
    ok(await cancelBtn.count() === 1 && /\(1\)/.test(await text(cancelBtn)), 'בתחתית: «בוטלו (1)»', await text(cancelBtn));
    await cancelBtn.click(); await sleep(300);
    const canc = await text(wo.locator('ul[aria-label="בוטלו"]'));
    ok(/נטשה/.test(canc) && await wo.locator('ul[aria-label="בוטלו"] [data-wo-bucket="cancelled"]').count() === 1, '«בוטלו»: העבודה שבוטלה (נטשה) מוצגת', canc);
    if (/נפתח בטעות/.test(canc)) ok(true, '«בוטלו»: הסיבה מוצגת בשורה');
    else console.log('  · «בוטלו»: הסיבה אינה מוצגת בשורה במסך החדש (ה-bucket מציג רק את השלב) — לא נבדקת');
    await cancelBtn.click(); await sleep(200);
    ok(!(await wo.locator('ul[aria-label="בוטלו"]').count()), 'לחיצה נוספת סוגרת את «בוטלו»');
    // חיפוש לפי לקוח
    await rowsOf('all');
    await wo.locator('[data-wo-q]').fill('מיכל'); await sleep(250);
    ok(await wo.locator('[data-wo-row]').count() === 1 && /מיכל/.test(await text(wo.locator('[data-wo-row]').first())), 'חיפוש לפי שם לקוח');
    await wo.locator('[data-wo-q]').fill('בלה בלה בלה'); await sleep(250);
    ok(await wo.locator('[data-wo-row]').count() === 0 && await wo.locator('[data-wo-empty]').count() === 1, 'חיפוש בלי תוצאה: הודעה ריקה, לא מסך שבור', await text(wo.locator('[data-wo-empty]')));
    await wo.locator('[data-wo-q]').fill(''); await sleep(250);
    // יריעת «עדכון משע״ם»
    const shaamBtn = wo.locator('[data-wo-shaam]');
    if (await shaamBtn.count()) {
      await shaamBtn.click(); await sleep(600);
      ok(await page.locator('[data-wo-sheet]').isVisible(), 'שע״ם: הכפתור פותח יריעה');
      await shot(page, `${vp}-01b-shaam-sheet`);
      if (mobile) ok(await noHScroll(page), 'טלפון: יריעת שע״ם בלי גלילה הצידה');
      await page.keyboard.press('Escape'); await sleep(300);
      ok(!(await page.locator('[data-wo-sheet]').count()), 'Esc סוגר את היריעה');
    } else console.log('  · כפתור שע״ם לא מוצג בהדגמה — לא נבדק');
    if (mobile) ok(await noHScroll(page), 'טלפון: סקירה בלי גלילה הצידה');
    // סוג אחד: קישור ישן ‎#/tax/work/annual‎ — הסקירה מסוננת, עם תג שאפשר להסיר
    await go(page, '/tax/work/annual');
    await rowsOf('all');
    ok(await page.locator('[data-work-overview][data-section="annual"] [data-wo-section-chip]').count() === 1, '‎#/tax/work/annual‎: תג הסינון «דוחות שנתיים»', await text(page.locator('[data-wo-section-chip]')));
    ok(await page.locator('[data-work-overview][data-section="annual"] [data-wo-row]').count() === 2, '‎#/tax/work/annual‎: רק הדוחות השנתיים (2)');
    if (mobile) ok(await noHScroll(page), 'טלפון: סקירה מסוננת בלי גלילה הצידה');
    // שורה ⇒ «בקשות» של הלקוח
    await page.locator('[data-wo-row]', { hasText: 'מיכל' }).first().click(); await sleep(1500);
    const h = await page.evaluate(() => location.hash);
    // ‼ מאז שהכתובת נושאת את הבקשה שבמיקוד (‎…/journey/<step>‎) — גם היא בסדר
    ok(/^#\/client\/sample-2\/journey(\/[^/]+)?$/.test(h), 'לחיצה על שורה פותחת את «בקשות» של הלקוח', h);
    await page.locator('.cw-tab.active').waitFor({ timeout: 15000 }).catch(() => {});
    const tabOn = await text(page.locator('.cw-tab.active'));
    ok(/^בקשות/.test(tabOn.trim()), 'הלשונית הפעילה: «בקשות»', tabOn);
    await shot(page, `${vp}-02-client-requests`);
    await page.goBack(); await sleep(900);
    ok((await page.evaluate(() => location.hash)) === '#/tax/work/annual', '«אחורה» חוזר לסקירה');
    // התג מסיר את הסינון ← «הכול»
    await page.locator('[data-wo-section-chip]').click(); await sleep(500);
    ok((await page.evaluate(() => location.hash)) === '#/tax/work/all' && await page.locator('[data-work-overview][data-section="all"]').isVisible() && !(await page.locator('[data-wo-section-chip]').count()), 'לחיצה על התג מסירה את הסינון ← «הכול»');

    // ── 4. מפת הטופס — 1301 עם סימון על כל שדה (16.10) ──
    const prevErrs = errs.slice();
    await ctx.close();
    ({ ctx, page, errs } = await newPage(vp));
    errs.push(...prevErrs);
    await go(page, '/tax/learn/annual', true);
    const fm = page.locator('[data-form-map="1301"]');
    ok(await fm.isVisible(), 'דוח שנתי: הטופס עצמו בעמוד התחום');
    const secOrder = await page.locator('[data-domain="annual"] .ta-sec-h').allInnerTexts();
    ok(secOrder[0]?.startsWith('הטופס') && secOrder.includes('מה מבקשים מהלקוח') && secOrder.indexOf('ללמוד לעומק') > secOrder.indexOf('מה מבקשים מהלקוח'), 'סדר העמוד: הטופס ← ערכים ← מה מבקשים ← ללמוד לעומק', secOrder.join(' | '));
    const imgOk = async () => page.locator('[data-form-map] .fm-page img').first().evaluate(i => i.complete && i.naturalWidth > 0).catch(() => false);
    await sleep(800);
    ok(await imgOk(), 'עמוד 1 של הטופס הרשמי נטען (תמונה)');
    // עמוד 1: תיבות סימון ופרטים בלי קוד מודפס — לפי התווית שלידן (סבב 2)
    const p1Labels = await fm.locator('.fm-mk.by-label').count();
    ok(p1Labels >= 55, 'עמוד 1: שדות בלי קוד מסומנים לפי התווית (מקווקו)', p1Labels);
    const f050 = fm.locator('.fm-mk.by-label[data-marker$="-L-F050"]');
    await f050.scrollIntoViewIfNeeded(); await f050.click(); await sleep(400);
    ok(/עוסק פטור/.test(await text(page.locator('[data-fm-detail]'))) && /בלי קוד/.test(await text(page.locator('[data-fm-detail] .fm-detail-top'))), 'תיבת «עוסק פטור» (בלי קוד): ההסבר נפתח');
    await shot(page, `${vp}-03a-form-page1-labels`);
    if (mobile) { await page.locator('[data-fm-detail] .fm-x').click(); await sleep(300); }
    await fm.locator('[data-fm-page="2"]').click(); await sleep(700);
    ok(await imgOk() && await fm.locator('.fm-mk').count() >= 90, 'עמוד 2: התמונה והסימונים (≥90)', await fm.locator('.fm-mk').count());
    await shot(page, `${vp}-03-form-page2`);
    // לחיצה על שדה
    const m158 = fm.locator('[data-code="158"]');
    await m158.scrollIntoViewIfNeeded(); await m158.click(); await sleep(400);
    const det = page.locator('[data-fm-detail]');
    const dt = await text(det);
    ok(/ממשכורת/.test(dt) && /מה ממלאים/.test(dt) && /מאיפה המידע מגיע/.test(dt) && /טופס 106/.test(dt) && /בן הזוג הרשום/.test(dt), 'שדה 158: מה ממלאים, מאיפה (טופס 106), למי', dt.slice(0, 300));
    ok((await m158.getAttribute('aria-pressed')) === 'true', 'הסימון הנבחר מסומן (aria-pressed)');
    if (mobile) {
      await sleep(300);
      const r = await det.boundingBox();
      const vh = page.viewportSize().height;
      ok(r && r.y > vh * 0.3 && r.y + r.height <= vh + 1, 'טלפון: ההסבר נפתח כגיליון מלמטה, הטופס גלוי מעליו', JSON.stringify(r));
    }
    await shot(page, `${vp}-04-field-158`);
    // ללמוד לעומק
    await det.locator('[data-fm-learn]').first().click(); await sleep(900);
    ok(/^#\/tax\/learn\/[a-z]+\/[A-Za-z0-9]+$/.test(await page.evaluate(() => location.hash)) && await page.locator('[data-topic]').count() === 1, '«ללמוד לעומק» פותח את הנושא', await page.evaluate(() => location.hash));
    await page.goBack(); await sleep(900);
    // אתר שדה לפי קוד — כל ההתאמות
    const find = page.locator('[data-form-map] [data-fm-find]').first();
    await find.fill('40'); await sleep(300);
    // ‼ 26.10: רשימה אחת — התאמות בטופס הזה (בלי שם הטופס), ובטפסים אחרים «נמצא בטופס X: …»
    const hits = await page.locator('[data-fm-hit]').evaluateAll(e => e.map(x => `${x.dataset.fmHit} ${x.innerText}`));
    ok(hits.length >= 3 && hits.some(x => /^1301:/.test(x)) && hits.some(x => /1399י/.test(x)) && hits.some(x => /1219/.test(x)), 'קוד «40»: כל ההתאמות (1301, 1399י, 1219) — לא אחת בשקט', hits.map(x => x.replace(/\n/g, ' ')).join(' || '));
    await shot(page, `${vp}-05-find-code`);
    await find.fill('42'); await sleep(300);
    const h42 = page.locator('[data-fm-hit="1301:042"]');
    ok(await h42.count() === 1, '«42» מוצא את 042 (בלי האפס)');
    await h42.click(); await sleep(700);
    ok(await page.locator('[data-form-map] [data-fm-page="4"]').getAttribute('aria-pressed') === 'true' && (await page.locator('[data-form-map] [data-code="042"]').getAttribute('aria-pressed')) === 'true', 'תוצאה ⇒ עמוד 4 והשדה מסומן');
    ok(/נוכה במקור ממשכורת/.test(await text(det)), 'ההסבר של 042', (await text(det)).slice(0, 160));
    await find.fill(''); await sleep(200);
    if (mobile) { await det.locator('.fm-x').click(); await sleep(300); ok(!(await det.evaluate(d => d.classList.contains('is-open'))), 'טלפון: ✕ סוגר את הגיליון'); }
    // בלי סימון — ברשימה, עם הסיבה
    const un = page.locator('[data-fm-unplaced]').first();
    const nUn = Number(await un.getAttribute('data-fm-unplaced'));
    ok(nUn > 20 && nUn < 80, 'שדות שלא אותרו בוודאות — ברשימה מתחת לטופס, לא מצוירים', nUn);
    // הגדלה וגרירה
    await fm.locator('[data-fm-zoom="in"]').click(); await fm.locator('[data-fm-zoom="in"]').click(); await sleep(300);
    const z = await fm.locator('[data-fm-stage]').evaluate(s => ({ sw: s.scrollWidth, cw: s.clientWidth }));
    ok(z.sw > z.cw * 1.8, 'הגדלה ×2: הטופס רחב מהחלון — גוררים כדי לזוז', JSON.stringify(z));
    if (mobile) {
      await fm.locator('[data-fm-stage]').evaluate(s => { s.scrollLeft = 200; s.scrollTop = 300; });
      const movedOk = await fm.locator('[data-fm-stage]').evaluate(s => s.scrollLeft !== 0 && s.scrollTop > 0);
      ok(movedOk && await noHScroll(page), 'טלפון: הטופס זז בתוך החלון, והעמוד עצמו בלי גלילה הצידה');
      await shot(page, `${vp}-06-zoom`);
    }
    await fm.locator('[data-fm-zoom="out"]').click(); await fm.locator('[data-fm-zoom="out"]').click(); await sleep(200);
    // נספח עם קודים — 1324
    await fm.locator('[data-fm-form="1324"]').click(); await sleep(600);
    const n1324 = await page.locator('[data-form-map="1324"] .fm-mk').count();
    ok(n1324 >= 30, 'נספח 1324: סימונים על הנספח הרשמי', n1324);
    // נספח בלי קודים — לפי התוויות; 116ד סרוק — בלי סימון בכלל
    await page.locator('[data-form-map] [data-fm-more]').selectOption('1320'); await sleep(600);
    const n1320 = await page.locator('[data-form-map="1320"] .fm-mk.by-label').count();
    ok(n1320 >= 25 && n1320 === await page.locator('[data-form-map="1320"] .fm-mk').count(), '1320 (בלי קודים): השורות מסומנות לפי התווית', n1320);
    await page.locator('[data-form-map] [data-fm-more]').selectOption('119'); await sleep(600);
    ok(await page.locator('[data-form-map="119"] .fm-mk').count() >= 3, '119 (תואר אקדמי) — חדש במפה');
    await page.locator('[data-form-map] [data-fm-more]').selectOption('116d'); await sleep(600);
    ok(await page.locator('[data-form-map="116d"] .fm-mk').count() === 0 && /סרוק/.test(await text(page.locator('[data-form-map="116d"] .fm-legend'))), '116ד: הטופס הרשמי סרוק — עמוד ורשימה, בלי סימון בניחוש');
    // ‼ 16.10 דמי לידה: 116ג במפה (לפי התוויות), סוג 9 עם הסבר ונושא; 250 ב-1301 מפנה ל-116ג
    await page.locator('[data-form-map] [data-fm-more]').selectOption('116c'); await sleep(600);
    const n116 = await page.locator('[data-form-map="116c"] .fm-mk.by-label').count();
    ok(n116 >= 20, '116ג: השדות מסומנים לפי התוויות', n116);
    await page.locator('[data-marker="116c-1-L-116c.16"]').click(); await sleep(400);
    const d116 = await text(page.locator('[data-fm-detail]'));
    ok(/דמי לידה/.test(d116) && /ימי הזכאות/.test(d116) && await page.locator('[data-fm-detail] [data-fm-learn="maternity"]').count() === 1, '116ג סוג 9: מה ממלאים (לפי ימי הזכאות) ו«ללמוד לעומק» — דמי לידה', d116.slice(0, 160));
    await shot(page, `${vp}-05b-116c`);
    if (mobile) { await page.locator('[data-fm-detail] .fm-x').click(); await sleep(300); }
    await page.locator('[data-form-map] [data-fm-form="1301"]').click(); await sleep(400);
    await page.locator('[data-form-map] [data-fm-page="2"]').click(); await sleep(500);
    await page.locator('[data-form-map] [data-code="250"]').first().scrollIntoViewIfNeeded(); await page.locator('[data-form-map] [data-code="250"]').first().click(); await sleep(400);
    ok(await page.locator('[data-fm-detail] [data-fm-related="116c"]').count() === 1 && await page.locator('[data-fm-detail] [data-fm-learn="maternity"]').count() === 1, '250: «טופס קשור: 116ג» ונושא «דמי לידה»');
    await page.locator('[data-fm-detail] [data-fm-related="116c"] button').click(); await sleep(600);
    ok(await page.locator('[data-form-map="116c"]').count() === 1, 'הקישור פותח את 116ג במפה');
    if (mobile && await page.locator('[data-fm-detail].is-open').count()) { await page.locator('[data-fm-detail] .fm-x').click(); await sleep(300); }
    await page.locator('[data-form-map] [data-fm-form="1301"]').click(); await sleep(400);
    // מצב שדות אצל לקוח
    // ‼ אורית (sample-4) — בהדגמה יש לה עובדות 2025 שהמשרד אישר (106, ספרים); דוד (sample-1) — תשובה מהדף שממתינה לבדיקה
    await page.locator('[data-form-map] [data-fm-client]').selectOption('sample-4'); await sleep(1500);
    ok(/אושר במשרד/.test(await text(page.locator('[data-fm-summary]'))), 'אורית: «אושר במשרד» מתשובות השאלון', await text(page.locator('[data-fm-summary]')));
    await page.locator('[data-form-map] [data-fm-page="2"]').click(); await sleep(400);
    await page.locator('[data-form-map] [data-code="158"]').click(); await sleep(300);
    ok((await page.locator('[data-fm-client-state]').getAttribute('data-fm-client-state')) === 'approved', 'אורית, 158: «אושר במשרד» (106 שאושר)', await text(page.locator('[data-fm-client-state]')));
    ok(await page.locator('[data-form-map] .fm-mk.st-approved').count() > 0, 'סימון ירוק כהה לשדה שאושר');
    await shot(page, `${vp}-07a-approved`);
    if (mobile) { await page.locator('[data-fm-detail] .fm-x').click(); await sleep(300); }
    await page.locator('[data-form-map] [data-fm-client]').selectOption('sample-1'); await sleep(1500);
    ok(await page.locator('[data-fm-summary]').isVisible() && /חסר/.test(await text(page.locator('[data-fm-summary]'))), 'בחירת לקוח: סיכום אושר / תשובה / לאישור / חסר', await text(page.locator('[data-fm-summary]')));
    await page.locator('[data-form-map] [data-fm-page="2"]').click(); await sleep(400);
    ok(await page.locator('[data-form-map] .fm-mk[class*="st-"]').count() > 50, 'הסימונים צבועים לפי המצב אצל הלקוח');
    await page.locator('[data-form-map] [data-code="158"]').click(); await sleep(300);
    const cs = await text(page.locator('[data-fm-client-state]'));
    ok(cs.length > 0 && !/object Object/.test(cs) && (await page.locator('[data-fm-client-state]').getAttribute('data-fm-client-state')) !== 'approved', 'דוד, 158: מהכרטיס («לאישור») — «עבדת כשכיר?» אינו הסכום', cs);
    await shot(page, `${vp}-07-client-state`);
    if (mobile) ok(await noHScroll(page), 'טלפון: מפת הטופס בלי גלילה הצידה');
    // בקרת הטופס — הכלי הקודם, מקופל
    await go(page, '/tax/learn/annual/map1301');
    ok(await page.locator('[data-form-map="1301"]').count() === 1 && await page.locator('[data-map-control]').count() === 1, 'מסך «הטופס מול תיק לקוח ובקרה»: המפה + הבקרה הקודמת מקופלת');
    // הצהרת הון — 1219
    await go(page, '/tax/learn/wealth');
    const w = page.locator('[data-form-map="1219"]');
    ok(await w.isVisible() && await w.locator('.fm-mk').count() >= 5, 'הצהרת הון: טופס 1219 עם סימון על שורות הסיכום');
    await w.locator('[data-code="30"]').click(); await sleep(400);
    ok(/בנקים/.test(await text(page.locator('[data-fm-detail]'))) && /חשוב לזכור/.test(await text(page.locator('[data-fm-detail]'))), '1219 שורה 30: מה רושמים, מסמך, בדיקה ו«חשוב לזכור»');
    await shot(page, `${vp}-08-wealth-1219`);
    if (mobile) ok(await noHScroll(page), 'טלפון: הצהרת הון בלי גלילה הצידה');

    // ── 5. «ידע מקצועי» נפתח בספרייה, עם החיפוש בראשה (25.10; קודם — בשאלה, 21.10) ──
    await go(page, '/tax/learn');
    const askIn = page.locator('[data-ask-input]');
    ok(await page.locator('[data-ask-home]').isVisible() && await askIn.isVisible(), 'ידע מקצועי: נפתח בתיבת שאלה');
    ok(await page.locator('[data-domain-card]').count() >= 8, 'ידע מקצועי: כרטיס לכל תחום');
    ok(await page.locator('[data-ask-start]').count() === 5 && await page.locator('[data-book-item]').count() > 10 && await page.locator('[data-ask-inbox]').isVisible() && await page.locator('[data-ask-update]').isVisible(), 'בדף הבית: «להתחיל מכאן», המחברות עם הנושאים והכלים, «מה אני לומד» ו«עדכון הידע»');
    if (mobile) ok(await noHScroll(page), 'טלפון: דף הבית של הידע בלי גלילה הצידה');
    await shot(page, `${vp}-05-learn-home`);
    // בזמן הקלדה — מה כתוב אצלנו, מיד וללא Enter
    await askIn.fill('קרן השתלמות לעוסק זעיר'); await sleep(600);
    ok(await page.locator('[data-ask-hit^="microBusiness."]').count() > 0, 'הקלדה «קרן השתלמות לעוסק זעיר»: תוצאה מקומית מהנושא «עסק זעיר» (בלי Enter)', (await page.locator('[data-ask-hit]').evaluateAll(e => e.map(x => x.dataset.askHit))).join());
    ok(await page.locator('[data-ask-unavailable], [data-ask-answer], [data-ask-thinking]').count() === 0 && await page.locator('[data-domain-card]').count() === 0, 'לפני Enter: אין תשובה מנוסחת, וכרטיסי התחומים פינו מקום');
    await shot(page, `${vp}-05b-ask-typing`);
    if (mobile) ok(await noHScroll(page), 'טלפון: תוצאות בזמן הקלדה בלי גלילה הצידה');
    await page.locator('[data-ask-hit^="microBusiness."]').first().click(); await sleep(800);
    // ‼ 26.10.2026: התוצאה נפתחת בשלב שהכלל כתוב בו (‎…/microBusiness/<שלב>‎), והקטע מסומן
    ok(/^#\/tax\/learn\/[a-z]+\/microBusiness(\/[a-z0-9-]+)?$/.test(await page.evaluate(() => location.hash)) && await page.locator('[data-topic="microBusiness"]').count() === 1, 'לחיצה על תוצאה פותחת את הנושא «עסק זעיר»', await page.evaluate(() => location.hash));
    // ‼ 22.10: תשובה מנוסחת כבויה (AVAILABLE.askAi) — אין כפתור «קבל תשובה», ו-Enter לא מחליף את מה שכתוב אצלנו
    await go(page, '/tax/learn');
    ok(await page.locator('[data-ask-go]').count() === 0, 'אין כפתור «קבל תשובה» כשהתשובה המנוסחת כבויה');
    await askIn.fill('קרן השתלמות לעוסק זעיר'); await askIn.press('Enter'); await sleep(800);
    ok(await page.locator('[data-ask-hit]').count() > 0 && await page.locator('[data-ask-unavailable], [data-ask-answer], [data-ask-thinking]').count() === 0, 'Enter: מה שכתוב אצלנו נשאר — בלי «לא זמין» ובלי המתנה', await text(page.locator('.ak-results')));
    await shot(page, `${vp}-05c-ask-enter`);
    await page.locator('.ak-clear').click(); await sleep(300);
    ok(await askIn.inputValue() === '' && await page.locator('[data-domain-card]').count() >= 8, '✕ מנקה את השאלה וחוזר לתחומים');
    // שאלה בלי שום כלל — אומרים את זה במקום ריק
    await askIn.fill('זזזזזז קקקקקק'); await sleep(500);
    ok(/לא נמצא אצלנו/.test(await text(page.locator('.ak-results'))), 'בלי כלל: «לא נמצא אצלנו» ו-Enter שומר לעדכון הבא', await text(page.locator('.ak-results')));
    await page.locator('.ak-clear').click(); await sleep(300);
    // «להתחיל מכאן» — פותח את הכלי עצמו
    await page.locator('[data-ask-start]', { hasText: 'הוצאות מוכרות' }).click(); await sleep(800);
    ok(/\/expenses$/.test(await page.evaluate(() => location.hash)), '«להתחיל מכאן»: «הוצאות מוכרות» פותח את הכלי', await page.evaluate(() => location.hash));
    // חיפוש: נושאים וכלים קודם, וקוד סעיף פותח את הטופס על הסעיף
    await go(page, '/tax/learn');
    await askIn.fill('יישובים'); await sleep(500);
    ok(await page.locator('[data-ask-item="settlements"]').count() === 1, 'חיפוש «יישובים»: הכלי ברשימת «נושאים וכלים»');
    await askIn.fill('158'); await sleep(500);
    const f158 = page.locator('[data-ask-field^="1301:158"]').first();
    ok(await f158.count() === 1, 'חיפוש «158»: הסעיף בטופס 1301');
    await f158.click(); await sleep(1200);
    ok(/\/tax\/learn\/annual\/c\/158$/.test(await page.evaluate(() => location.hash)) && await page.locator('[data-fm-detail] [data-fm-field]').count() > 0, 'לחיצה על הסעיף: הטופס נפתח וההסבר של 158 מוצג', await page.evaluate(() => location.hash));
    // ערך לשנה בזמן הקלדה
    await go(page, '/tax/learn');
    await askIn.fill('מס רכישה'); await sleep(500);
    const rv = page.locator('[data-ask-value]');
    if (await rv.count()) {
      ok(/מס רכישה/.test(await text(rv.first())) && /שכר דירה ונדל״ן/.test(await text(rv.first())), 'הקלדה «מס רכישה»: ערך לשנה בתחום שכר דירה ונדל״ן', await text(rv.first()));
      await shot(page, `${vp}-12-search`);
      await rv.first().click(); await sleep(800);
      const gr = page.locator('[data-value-group] .kn-ask-toggle[aria-expanded="true"]');
      ok(/^#\/tax\/learn\/rent\/v\/[A-Za-z]+$/.test(await page.evaluate(() => location.hash)) && await gr.count() === 1, 'ערך לשנה מהתוצאות נוחת בקבוצה הפתוחה בתחום', await page.evaluate(() => location.hash));
    } else ok(await page.locator('[data-ask-hit]').count() > 0, 'הקלדה «מס רכישה»: אין ערך לשנה — לפחות תוצאה מקומית אחת');
    for (const [w, dl] of [['שווי שימוש', 'שכירים ושכר'], ['עוסק פטור', 'עסק']]) {
      await go(page, '/tax/learn');
      await askIn.fill(w); await sleep(500);
      const vt = await page.locator('[data-ask-value]').allInnerTexts();
      ok(vt.some(x => x.includes(dl)) || (await page.locator('[data-ask-hit]').count()) > 0, `הקלדה «${w}»: ערך לשנה בתחום «${dl}» (או לפחות תוצאה מקומית)`, vt.join(' || '));
    }
    // «עדכון הידע» — חלון עם שלוש שורות תוכנית
    await go(page, '/tax/learn');
    if (!(await page.locator('[data-ask-run]').count())) { await page.locator('.ak-clear').click(); await sleep(300); } // אותה כתובת ⇒ אין טעינה מחדש; השאלה האחרונה עוד בתיבה
    await page.locator('[data-ask-run]').click(); await sleep(500);
    ok(await page.locator('[data-ask-plan]').isVisible() && await page.locator('[data-ask-plan] > div').count() === 3 && await page.locator('[data-ask-copy]').isVisible(), '«עדכן עכשיו»: חלון עם שלוש שורות תוכנית וכפתור «העתק את הפרומט»', await text(page.locator('[data-ask-plan]')));
    await shot(page, `${vp}-05d-ask-update`);
    if (mobile) ok(await noHScroll(page), 'טלפון: חלון העדכון בלי גלילה הצידה');
    await page.keyboard.press('Escape'); await sleep(400);
    ok(!(await page.locator('[data-ask-plan]').count()), 'Esc סוגר את חלון העדכון');
    ok(await page.locator('[data-ask-inbox-input]').isVisible(), '«מה אני לומד»: שדה ההוספה גלוי');

    // ── 6. ידע מקצועי: תחום ← נושא ← שלבים ──
    await go(page, '/tax/learn');
    await page.locator('[data-domain-card="savings"]').click(); await sleep(500);
    ok((await page.evaluate(() => location.hash)) === '#/tax/learn/savings', 'הכתובת: ‎#/tax/learn/savings‎');
    const dp = await text(page.locator('[data-domain="savings"]'));
    ok(dp.includes('מתי רלוונטי') && dp.includes('מה מבקשים מהלקוח') && dp.includes('ללמוד לעומק') && dp.includes('פנסיה לעצמאי') && dp.includes('העבודות אצל הלקוחות'), 'עמוד תחום: מה, מתי, מה מבקשים, ללמוד לעומק, עבודות', dp.slice(0, 400));
    ok(!/שמיש · עם פערים|מקור משני\b/.test(dp), 'בלי התוויות הלא ברורות');
    await shot(page, `${vp}-06-domain`);
    await page.locator('[data-domain-item="pensionSE"]').click(); await sleep(700);
    const st = await text(page.locator('[data-kn-state]'));
    ok(/אפשר ללמוד|בבירור/.test(st) && /(ממקור|חושבו|לא אומת|רשמי)/.test(st), 'מצב הנושא במילים: מה אפשר ומה הביסוס', st);
    // ‼ 26.10.2026: שלושה מצבים (ללמוד · הסיכום · יישום בתיק), יחידות ושלב אחד בכל פעם — במקום שמונה שלבים
    ok(await page.locator('[data-kn-mode]').count() === 3 && await page.locator('[data-kn-unit]').count() === 3, 'נושא: שלושה מצבים ושלוש יחידות לימוד');
    ok(/שאלות מקצועיות פתוחות/.test(st), 'מצב הנושא: «שאלות מקצועיות פתוחות», לא «נקודות לבדיקה»', st);
    await page.locator('[data-kn-open="asks"]').first().click(); await sleep(300);
    ok(/פנסיה|קרן השתלמות|הפקד/.test(await text(page.locator('[role="dialog"] .kn-asks'))), '«מה מבקשים מהלקוח»: מהשאלון', (await text(page.locator('[role="dialog"]'))).slice(0, 200));
    await page.keyboard.press('Escape'); await sleep(250);
    await page.locator('[data-kn-open="gaps"]').first().click(); await sleep(300);
    ok(/שעוד לא הוכרעה במקור רשמי/.test(await text(page.locator('[data-kn-gaps]'))), '«שאלות פתוחות»: פער מוצג כשאלה שלא הוכרעה');
    await page.keyboard.press('Escape'); await sleep(250);
    await page.locator('[data-kn-unit="2"]').click(); await sleep(400);
    ok(await page.locator('[data-view="lesson"] .kn-sec').count() === 1 && /\/pensionSE\/pn-3$/.test(await page.evaluate(() => location.hash)), 'יחידה 2: שלב אחד, והשלב בכתובת', await page.evaluate(() => location.hash));
    await shot(page, `${vp}-07-topic-calc`);
    ok(await page.evaluate(() => document.activeElement?.classList.contains('kn-lesson-h')), 'מקלדת: אחרי מעבר שלב הפוקוס בכותרת השלב');
    await page.locator('[data-stage-next]').click(); await sleep(300);
    ok(/\/pensionSE\/pn-4$/.test(await page.evaluate(() => location.hash)), '«לשלב הבא» מתקדם לשלב הבא');
    await page.locator('[data-kn-mode="apply"]').first().click(); await sleep(300);
    const wl = page.locator('#kn-clients button', { hasText: 'דוחות שנתיים' });
    ok(await wl.count() > 0, '«מה עושים בתיק»: קישור לעבודות מהסוג הזה');
    await wl.first().click(); await sleep(600);
    ok((await page.evaluate(() => location.hash)) === '#/tax/work/annual', 'מהידע לעבודה — עמוד הדוחות');
    await page.goBack(); await sleep(700);
    ok((await page.evaluate(() => location.hash)) === '#/tax/learn/savings/pensionSE/apply' && await page.locator('[data-topic="pensionSE"][data-view="apply"]').count() === 1, '«אחורה» בדפדפן חוזר לנושא — לאותו מצב');
    // פירורים במקום מסילה: «ידע מקצועי › תחום», ושנת המס בפירורים
    const crumbs = page.locator('.ta2-crumbs');
    const crumbTxt = await crumbs.locator('.kn-crumb').allInnerTexts();
    ok(await crumbs.isVisible() && crumbTxt.join('|') === 'ידע מקצועי|פנסיה, השתלמות ופרישה', 'נושא: פירורים «ידע מקצועי › תחום»', crumbTxt.join('|'));
    ok(await crumbs.locator('.ta2-year select').isVisible() && await page.locator('.ta-rail, [data-rail], .tc-back').count() === 0, 'שנת המס בפירורים, ואין מסילה');
    await shot(page, `${vp}-08-crumbs`);
    await crumbs.locator('.kn-crumb', { hasText: 'פנסיה, השתלמות ופרישה' }).click(); await sleep(500);
    ok((await page.evaluate(() => location.hash)) === '#/tax/learn/savings' && await page.locator('[data-domain="savings"]').isVisible(), 'פירור התחום ← עמוד התחום');
    ok((await page.locator('.ta2-crumbs .kn-crumb').allInnerTexts()).join('|') === 'ידע מקצועי' && await page.locator('.ta2-crumbs .ta2-year select').isVisible(), 'בעמוד תחום: פירור «ידע מקצועי» ושנת מס');
    await page.locator('.ta2-crumbs .kn-crumb').click(); await sleep(500);
    ok((await page.evaluate(() => location.hash)) === '#/tax/learn' && await page.locator('[data-ask-home]').isVisible(), 'פירור «ידע מקצועי» ← דף הבית של הידע');
    await page.locator('[data-domain-card="ni"]').click(); await sleep(500);
    ok((await page.evaluate(() => location.hash)) === '#/tax/learn/ni' && await page.locator('[data-domain="ni"]').isVisible(), 'כרטיס תחום «ביטוח לאומי» ← עמוד התחום');
    await page.locator('[data-domain-item="ni"]').click(); await sleep(500);
    ok((await page.evaluate(() => location.hash)) === '#/tax/learn/ni/ni' && await page.locator('.ta2-crumbs .ta2-year select').isVisible(), 'כלי «שיעורים ותקרות»: כתובת, פירורים ושנת מס');
    if (mobile) ok(await noHScroll(page), 'טלפון: כלי בתחום בלי גלילה הצידה');
    // המתג זוכר היכן היית בכל מרחב
    await page.locator('.ta2-modes [data-mode="work"]').click(); await sleep(500);
    ok((await page.evaluate(() => location.hash)).startsWith('#/tax/work') && await page.locator('[data-work-overview]').isVisible(), 'מתג ← «עבודות»');
    await page.locator('.ta2-modes [data-mode="learn"]').click(); await sleep(500);
    ok((await page.evaluate(() => location.hash)) === '#/tax/learn/ni/ni', 'מתג חזרה ← «ידע מקצועי» באותו כלי שהיית בו');
    await page.locator('.ta2-modes [data-mode="learn"]').click(); await sleep(500);
    ok((await page.evaluate(() => location.hash)) === '#/tax/learn', 'לחיצה על «ידע מקצועי» כשכבר שם ← דף הבית של הידע');
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
    const ann = await text(page.locator('[data-domain="annual"]'));
    ok(ann.includes('הכנת הדוח: מהמסמך לשדה') && ann.includes('בקרת הטופס') && await page.locator('[data-domain="annual"] [data-form-map]').count() === 1, 'דוח שנתי: הטופס, הבקרה ו«ללמוד לעומק»', ann.slice(0, 300));
    if (mobile) ok(await noHScroll(page), 'טלפון: עמוד תחום בלי גלילה הצידה');

    // ── 7. «ערכים לשנה» — לכל ערך בית אחד בתחום שלו (15.10.2026) ──
    const openDomain = async (d) => {
      await go(page, `/tax/learn/${d}`);
      return page.locator(`[data-domain="${d}"]`);
    };
    const rentP = await openDomain('rent');
    ok(await rentP.locator('[data-values-panel="rent"]').count() === 1, 'שכר דירה: סעיף «ערכים לשנה» בעמוד התחום');
    ok(/טרם נכתב/.test(await text(rentP.locator('[data-learn-gap]'))), 'שכר דירה: אין מסלול לימוד — נאמר בשקט, בלי להמציא');
    const reGroup = rentP.locator('[data-value-group="realEstate"]');
    const reBtn = reGroup.locator('.kn-ask-toggle');
    ok(await rentP.locator('#kn-val-rent-realEstate').isHidden() && (await reBtn.getAttribute('aria-expanded')) === 'false', 'הערכים סגורים כברירת מחדל — העמוד נשאר סקירה');
    ok(/\d+ ערכים/.test(await text(reBtn)), 'בכותרת הקבוצה: כמה ערכים יש בה', await text(reBtn));
    await reBtn.click(); await sleep(250);
    const reText = await text(rentP.locator('#kn-val-rent-realEstate'));
    ok((await reBtn.getAttribute('aria-expanded')) === 'true' && reText.includes('מס רכישה - דירה יחידה') && reText.includes('תקרת שווי מכירה לפטור'), 'פתיחה במקום: מס רכישה ומס שבח בתחום שכר דירה ונדל״ן', reText.slice(0, 200));
    const rentRule = rentP.locator('[data-value-row="rule.core.rentalExemption"]');
    ok(await rentRule.count() === 1 && /5,654|5654/.test(await text(rentRule)) && await rentRule.locator('.kn-basis').count() === 1, 'פטור שכ״ד — מהמרשם, עם תג ביסוס', await text(rentRule));
    ok(await rentP.locator('[data-value-row="realEstate.rentExempt"]').count() === 0, 'השורה הישנה של פטור שכ״ד לא מוצגת שוב (אותו מספר פעם אחת)');
    ok(await rentP.locator('[data-value-row="deadlines.rent10"]').count() === 1, 'מועד תשלום 10% — בתחום שכר דירה');
    await shot(page, `${vp}-09-rent-values`);
    await reBtn.focus(); await page.keyboard.press('Enter'); await sleep(200);
    const closedByKey = (await reBtn.getAttribute('aria-expanded')) === 'false';
    await page.keyboard.press('Space'); await sleep(200);
    ok(closedByKey && (await reBtn.getAttribute('aria-expanded')) === 'true', 'מקלדת: Enter סוגר, רווח פותח, aria-expanded מתעדכן');
    // רגרסיה: «מה מבקשים מהלקוח» (התיקון מ-15.10) עדיין נפתח עם השאלות עצמן
    await rentP.locator('[data-ask-area="rent"] .kn-ask-toggle').click(); await sleep(250);
    ok(await rentP.locator('[data-ask-area="rent"] .kn-ask-list li').count() > 3, '«מה מבקשים מהלקוח» עדיין נפתח עם השאלות והמסמכים');
    if (mobile) ok(await noHScroll(page), 'טלפון: ערכים פתוחים בלי גלילה הצידה');

    // תחומים חדשים: חברות ושכירים
    const coP = await openDomain('companies');
    await coP.locator('[data-value-group="company"] .kn-ask-toggle').click(); await sleep(250);
    const coText = await text(coP);
    ok(coText.includes('רווחים כלואים') && coText.includes('מס חברות') && /טרם נכתב/.test(coText), 'חברות ובעלי שליטה: ערכים + «טרם נכתב»', coText.slice(0, 300));
    ok(await coP.locator('[data-ask-area="companies"]').count() === 1, 'חברות: «חברות בשליטה» מהשאלון — היה בלי בית');
    ok(await coP.locator('[data-domain-work="annual"]').count() === 1, 'חברות: קישור לעבודות אצל הלקוחות');
    await shot(page, `${vp}-10-companies`);
    const saP = await openDomain('salary');
    await saP.locator('[data-value-group="car"] .kn-ask-toggle').click(); await sleep(250);
    // 25.10.2026: השם לפי התקנות — «מחיר מתואם לצרכן», לא «מחיר מחירון»
    ok((await text(saP)).includes('תקרת מחיר מתואם לצרכן'), 'שכירים ושכר: שווי שימוש ברכב');
    // ‼ 16.10: מה שחסר — גלוי ומקופל, לא מוסתר ולא נראה כמו כלי שעובד
    ok(Number(await saP.locator('[data-planned-tools]').getAttribute('data-planned-tools')) >= 2, 'שכירים: «כלים שעוד לא נבנו» (תחשיבי שכר, רכב)');
    const bizP = await openDomain('business');
    const pt = bizP.locator('[data-planned-topics]');
    await pt.locator('summary').click(); await sleep(200);
    ok(/חשבוניות ישראל/.test(await text(pt)) && /טרם נכתב/.test(await text(pt)) && /מחקר חדש/.test(await text(pt)), 'עסק: «חשבוניות ישראל» — טרם נכתב, עם מצב מחקר');

    // קישור ישיר לקבוצה: נפתחת, והפוקוס עליה
    await go(page, '/tax/learn/savings/v/pensionExtra'); await sleep(300);
    const pe = page.locator('[data-value-group="pensionExtra"]');
    ok((await pe.locator('.kn-ask-toggle').getAttribute('aria-expanded')) === 'true', 'קישור ‎learn/savings/v/pensionExtra‎ פותח את הקבוצה');
    ok(await page.evaluate(() => !!document.activeElement?.closest('[data-value-group="pensionExtra"]')), 'הפוקוס על הקבוצה שנפתחה');
    const peText = await text(pe);
    // 25.10.2026: שתי השורות נבדקו מול לוחות העזר — תקרת השכר לתגמולים ותקרת הפיצויים, כל אחת עם מקור
    ok(peText.includes('לתגמולים') && peText.includes('לפיצויים') && /מקור ובדיקה/.test(peText), 'הפקדות מעסיק: שתי התקרות גלויות, עם מקור', peText.slice(0, 300));
    ok((await text(page.locator('[data-domain="savings"]'))).includes('פרישה ופיצויים'), 'פנסיה, השתלמות ופרישה: פרישה ופיצויים');

    // קישור ישן ל«ערכים לפי נושא»: דף הבית של הידע, עם שורת הסבר אחת
    await page.goto('about:blank');
    await page.goto(`${BASE}/?office-app#/tax/learn/reference/topics`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-tax-area]').waitFor({ timeout: 30000 }); await sleep(800);
    ok(await page.locator('[data-ask-home]').isVisible() && /עברו לעמודי התחומים/.test(await text(page.locator('.ak-moved'))), 'קישור ישן: דף הבית של הידע, עם הערה «ערכים לפי נושא עברו לעמודי התחומים»', await text(page.locator('.ak-moved')));
    await shot(page, `${vp}-11-moved`);
    // ועכשיו הקישור הישיר לקבוצה בתחום החדש
    await go(page, '/tax/learn/rent/v/realEstate'); await sleep(300);
    ok((await page.locator('[data-value-group="realEstate"] .kn-ask-toggle').getAttribute('aria-expanded')) === 'true', 'קישור ‎learn/rent/v/realEstate‎ פותח את «מקרקעין» בתחום שכר דירה ונדל״ן');

    // ‼ 16.10 מצב משפחתי בשנת המס — פסקה בתחום «נקודות זיכוי ומדרגות»
    const crP = await openDomain('credits');
    const famNote = crP.locator('[data-domain-note="familyYear"]');
    // 25.10.2026: שנת הגירושין/הפטירה הוכרעה לפי סעיף 41 — אין עוד נקודה «פתוחה»
    ok(await famNote.locator('li').count() === 5 && await famNote.locator('.kn-claim.open').count() === 0 && /41/.test(await text(famNote)), 'נקודות זיכוי: «מצב משפחתי בשנת המס» — חמש נקודות, שנת השינוי לפי סעיף 41');
    if (mobile) ok(await noHScroll(page), 'טלפון: עמוד נקודות זיכוי בלי גלילה הצידה');
    await famNote.scrollIntoViewIfNeeded(); await shot(page, `${vp}-16-family-year`);
    // ‼ 16.10 דמי לידה: נושא בתחום «ביטוח לאומי», הפניה מ«דוח שנתי» ומ«שכירים», ומסלול לימוד מלא
    for (const d of ['annual', 'salary']) {
      const dp = await openDomain(d);
      ok(await dp.locator('[data-see-also-item="maternity"]').count() === 1, `${d}: «ללמוד לעומק» מפנה לדמי לידה בתחום «ביטוח לאומי»`);
    }
    await page.locator('[data-see-also-item="maternity"]').click(); await sleep(800);
    ok((await page.evaluate(() => location.hash)) === '#/tax/learn/ni/maternity' && await page.locator('[data-topic="maternity"]').count() === 1, 'ההפניה נוחתת בנושא, בתחום שלו');
    // ‼ 26.10.2026: יחידות ושלב אחד בכל פעם — כל שלב בכתובת משלו
    ok(await page.locator('[data-kn-unit]').count() >= 3 && await page.locator('[data-kn-fixed-year="2025"]').count() >= 1, 'דמי לידה: יחידות לימוד, ושנת מס 2025 קבועה');
    const mlGo = async (s) => { await go(page, `/tax/learn/ni/maternity/${s}`); await page.locator(`[data-section="${s}"], [data-view="apply"]`).first().waitFor({ timeout: 15000 }); };
    await mlGo('ml-what');
    ok(/מענק לידה/.test(await text(page.locator('#ml-what'))), '«מה זה»: גם מה לא כאן (מענק לידה פטור)');
    await mlGo('ml-ex');
    const calcT = await text(page.locator('[data-ml-result]'));
    ok(/9,129\.6/.test(calcT) && /30,812\.4/.test(calcT) && /58\.5/.test(calcT) && /197\.5/.test(calcT), 'מחשבון: נייר העבודה — 24/81 ימים', calcT);
    ok(await page.locator('#ml-ex img').evaluateAll(a => a.length === 2 && a.every(i => i.complete && i.naturalWidth > 0)), 'הדוגמה: הודעת ב״ל והאישור השנתי נטענו');
    await page.locator('[data-ml-from]').fill('2024-11-01'); await page.locator('[data-ml-to]').fill('2025-02-13'); await sleep(300);
    ok((await page.locator('[data-ml-result] [data-ml-year]').evaluateAll(r => r.map(x => x.children[1].textContent).join('/'))) === '61/44', 'מחשבון: הדוגמה מ«דע זכויותיך» — 61/44');
    await shot(page, `${vp}-14-maternity-calc`);
    await mlGo('ml-exc');
    ok(await page.locator('#ml-exc .kn-claim, #ml-exc [class*="claim"]').count() > 0 && /250 או 194/.test(await text(page.locator('#ml-exc'))), '«חריגים»: המקרה המשולב — פתוח, במפורש');
    await mlGo('ml-116c');
    ok(await page.locator('[data-ml-steps] li').count() === 5 && await page.locator('#ml-116c img').evaluate(i => i.complete && i.naturalWidth > 0), '116ג צעד אחר צעד, עם הטופס שמולא');
    await shot(page, `${vp}-15-maternity-116c`);
    await mlGo('ml-src');
    ok(/חוזר מס הכנסה 2\/2022/.test(await text(page.locator('#ml-src'))), '«מקורות»: הסעיף של הנושא מוצג');
    if (mobile) ok(await noHScroll(page), 'טלפון: נושא דמי לידה בלי גלילה הצידה');

    // לוח המועדים הרוחבי
    await go(page, '/tax/learn/reference/deadlines');
    ok(await page.locator('[data-deadline]').count() === 6, 'לוח מועדים: כל שש השורות');
    await shot(page, `${vp}-13-deadlines`);
    await page.locator('[data-deadline-home="salary"]').click(); await sleep(700);
    ok((await page.evaluate(() => location.hash)) === '#/tax/learn/salary', 'מועד ← התחום שלו');

    // שנה בלי עמודה בטבלה הישנה
    await openDomain('business');
    const yearSel = page.locator('.ta2-crumbs .ta2-year select');
    ok(await yearSel.isVisible(), 'בורר שנת המס בפירורים של התחום');
    await yearSel.selectOption('2024'); await sleep(300);
    await page.locator('[data-value-group="vat"] .kn-ask-toggle').click(); await sleep(250);
    ok(/אין ערך ל-2024/.test(await text(page.locator('[data-value-group="vat"]'))), 'שנה 2024: «אין ערך לשנה זו», לא ערך של שנה אחרת');
    if (mobile) ok(await noHScroll(page), 'טלפון: עמוד עסק בלי גלילה הצידה');

    ok(errs.length === 0, 'בלי שגיאות קונסול', errs.slice(0, 4).join(' | '));

    // ── 9. מצב כהה — מפת הטופס והסקירה ──
    const dark = await newPage(vp, 'dark');
    await dark.ctx.addInitScript(seedScript(taxWorkSeed()));
    try {
      const dp2 = dark.page;
      await go(dp2, '/tax/work/all');
      ok((await dp2.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'מצב כהה: הממשק כהה');
      const woC = await dp2.locator('[data-wo-row]').first().evaluate(el => { const c = getComputedStyle(el); return { bg: c.backgroundColor, fg: c.color }; });
      ok(lum(woC.bg) < 0.2 && lum(woC.fg) > 0.5, 'מצב כהה: שורות הסקירה כהות והטקסט בהיר', JSON.stringify(woC));
      await shot(dp2, `${vp}-20-dark-overview`);
      await go(dp2, '/tax/learn/annual');
      await dp2.locator('[data-form-map] [data-fm-client]').selectOption('sample-1'); await sleep(800);
      await dp2.locator('[data-form-map] [data-fm-page="2"]').click(); await sleep(500);
      await dp2.locator('[data-form-map] [data-code="158"]').scrollIntoViewIfNeeded(); await dp2.locator('[data-form-map] [data-code="158"]').click(); await sleep(500);
      const dc = await dp2.locator('[data-fm-detail]').evaluate(el => { const c = getComputedStyle(el); const pEl = el.querySelector('.fm-p'); return { bg: c.backgroundColor, fg: pEl ? getComputedStyle(pEl).color : '' }; });
      ok(lum(dc.bg) < 0.2 && lum(dc.fg) > 0.5, 'מצב כהה: ההסבר קריא (רקע כהה, טקסט בהיר)', JSON.stringify(dc));
      ok(await dp2.locator('[data-form-map] .fm-page img').first().evaluate(i => i.complete && i.naturalWidth > 0), 'מצב כהה: הטופס עצמו נשאר לבן וקריא (תמונה)');
      if (mobile) ok(await noHScroll(dp2), 'מצב כהה, טלפון: בלי גלילה הצידה');
      await shot(dp2, `${vp}-21-dark-form`);
      ok(dark.errs.length === 0, 'מצב כהה: בלי שגיאות קונסול', dark.errs.slice(0, 3).join(' | '));
    } finally { await dark.ctx.close(); }
  } catch (e) {
    ok(false, `${vp}: חריגה`, e.message);
    await shot(page, `${vp}-error`, true);
  } finally { await ctx.close(); }
}

for (const vp of VPS) await run(vp);
await browser.close();
console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
