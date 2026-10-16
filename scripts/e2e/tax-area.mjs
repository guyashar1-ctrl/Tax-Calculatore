// ─── «מס» בדפדפן — סקירת עבודות, מפת הטופס, ידע מקצועי לפי תחום (14.10 · 16.10.2026) ──────────────────
// ‼ על שרת ההדגמה בלבד (?office-app — מסד מדומה בזיכרון הדפדפן). שום דבר לא נשלח ולא נשמר במסד אמיתי.
// המסלול, במחשב ובטלפון:
//   1. כניסה ל«מס»: במחשב — מסילה ועמוד; בטלפון — הרשימה קודם, «› מס» חוזר אליה.
//   2. «עבודת מס» כבר לא בתפריט החשבון; הקישור הישן נוחת ב«עבודות לקוחות».
//   3. «עבודות לקוחות» = סקירה בלבד (16.10): איחורים, «בוטלו», חיפוש; שורה ⇒ «בקשות» של הלקוח. (הסרה/החזרה — ב«בקשות».)
//   4. מפת הטופס (16.10): 1301 הרשמי, סימון על כל שדה, הסבר ליד השדה, «אתר שדה לפי קוד», נספחים, מצב לקוח, 1219, טלפון.
//   6. ידע מקצועי: תחום ⇒ נושא ⇒ שמונה שלבים; «מה מבקשים מהלקוח» מהשאלון; «לעבודות בתיקים» חוזר לעבודה.
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
const railCount = async (page, key) => (await text(page.locator(`[data-rail="${key}"] .ta-count`))).trim() || '0';

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
    // ── 1. כניסה ──
    await go(page, '/tax');
    if (mobile) {
      ok(!(await page.locator('.tax-area .pg-pane').isVisible()) && await page.locator('.ta-rail').isVisible(), 'טלפון: «מס» נפתח ברשימה');
      await shot(page, `m-01-list-${vp}`);
      await page.locator('[data-rail="work-all"]').click(); await sleep(500);
      ok(await page.locator('[data-work-overview][data-section="all"]').isVisible() && !(await page.locator('.ta-rail').isVisible()), 'טלפון: בחירה פותחת את הסקירה במסך מלא');
      await page.locator('.tc-back').first().click(); await sleep(400);
      ok(await page.locator('.ta-rail').isVisible(), 'טלפון: «› מס» חוזר לרשימה');
      await page.locator('[data-rail="work-all"]').click(); await sleep(500);
    } else {
      ok(await page.locator('.ta-rail').isVisible() && await page.locator('[data-work-overview][data-section="all"]').isVisible(), 'מחשב: מסילה וסקירת «כל העבודות»');
    }

    // ── 2. הישן: לא בתפריט ──
    ok(!(await page.locator('button', { hasText: /^עבודת מס$/ }).count()), 'אין יותר כפתור «עבודת מס» נפרד');
    ok(await page.locator('nav button, header button').filter({ hasText: /^מס$/ }).count() > 0, 'בסרגל: «מס»');

    // ── 3. «עבודות לקוחות» — סקירה בלבד (הכרעת גיא 16.10) ──
    const wo = page.locator('[data-work-overview]');
    const head = await text(wo.locator('.ta-page-head'));
    ok(/העבודה עצמה ב«בקשות» של הלקוח/.test(head), 'בראש הסקירה: העבודה עצמה ב«בקשות» של הלקוח', head.slice(0, 200));
    ok(await wo.locator('[data-wo-row]').count() === 3, 'שלוש עבודות פתוחות (דוד, מיכל, אורית)', await wo.locator('[data-wo-row]').count());
    ok(!(await wo.getByRole('button', { name: /^＋|הסר…|^פתח$|פרסם/ }).count()), 'אין פעולות בסקירה: לא «＋», לא «פתח», לא «הסר», לא «פרסם»');
    const first = await text(wo.locator('[data-wo-row]').first());
    ok(/דוד כהן/.test(first) && /באיחור 1[23] ימים/.test(first), 'באיחור — ראשון, עם מספר הימים', first.replace(/\n/g, ' · '));
    ok(/באיחור/.test(await text(wo.locator('[data-wo-alert="overdue"]'))) && /מתקרב/.test(await text(wo.locator('[data-wo-alert="soon"]'))), 'התראות: באיחור ומתקרב');
    await shot(page, `${vp}-01-work-overview`);
    await wo.locator('[data-wo-state="cancelled"]').click(); await sleep(300);
    const canc = await text(wo.locator('[data-wo-bucket="cancelled"]'));
    ok(/נטשה/.test(canc) && /נפתח בטעות/.test(canc), '«בוטלו»: העבודה שבוטלה עם הסיבה', canc);
    await wo.locator('[data-wo-state="open"]').click(); await sleep(200);
    await wo.locator('[data-wo-q]').fill('מיכל'); await sleep(200);
    ok(await wo.locator('[data-wo-row]').count() === 1, 'חיפוש לפי שם לקוח');
    await wo.locator('[data-wo-q]').fill(''); await sleep(200);
    if (mobile) ok(await noHScroll(page), 'טלפון: סקירה בלי גלילה הצידה');
    // סוג אחד: קישור ישן ‎#/tax/work/annual‎ — הסקירה מסוננת
    await go(page, '/tax/work/annual');
    ok(await page.locator('[data-work-overview][data-section="annual"] [data-wo-row]').count() === 2, '‎#/tax/work/annual‎: רק הדוחות השנתיים (2)');
    if (!mobile) ok(Number(await railCount(page, 'work-annual')) === 2, 'המונה במסילה = מספר השורות');
    // שורה ⇒ «בקשות» של הלקוח
    await page.locator('[data-wo-row]', { hasText: 'מיכל' }).first().click(); await sleep(1500);
    const h = await page.evaluate(() => location.hash);
    ok(h === '#/client/sample-2/journey', 'לחיצה על שורה פותחת את «בקשות» של הלקוח', h);
    const tabOn = await text(page.locator('.cw-tab.active'));
    ok(/^בקשות/.test(tabOn.trim()), 'הלשונית הפעילה: «בקשות»', tabOn);
    await shot(page, `${vp}-02-client-requests`);
    await page.goBack(); await sleep(900);
    ok((await page.evaluate(() => location.hash)) === '#/tax/work/annual', '«אחורה» חוזר לסקירה');

    // ── 4. מפת הטופס — 1301 עם סימון על כל שדה (16.10) ──
    const prevErrs = errs.slice();
    await ctx.close();
    ({ ctx, page, errs } = await newPage(vp));
    errs.push(...prevErrs);
    await go(page, '/tax/learn/annual', true);
    if (mobile && !(await page.locator('[data-domain="annual"]').isVisible())) { await page.locator('[data-rail="learn-annual"]').click(); await sleep(400); }
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
    const hits = await page.locator('[data-fm-hit]').allInnerTexts();
    ok(hits.length >= 3 && hits.some(x => /1301/.test(x)) && hits.some(x => /1399י/.test(x)) && hits.some(x => /1219/.test(x)), 'קוד «40»: כל ההתאמות (1301, 1399י, 1219) — לא אחת בשקט', hits.map(x => x.replace(/\n/g, ' ')).join(' || '));
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
    if (mobile && !(await page.locator('[data-domain="wealth"]').isVisible())) { await page.locator('[data-rail="learn-wealth"]').click(); await sleep(400); }
    const w = page.locator('[data-form-map="1219"]');
    ok(await w.isVisible() && await w.locator('.fm-mk').count() >= 5, 'הצהרת הון: טופס 1219 עם סימון על שורות הסיכום');
    await w.locator('[data-code="30"]').click(); await sleep(400);
    ok(/בנקים/.test(await text(page.locator('[data-fm-detail]'))) && /טעות נפוצה/.test(await text(page.locator('[data-fm-detail]'))), '1219 שורה 30: מה רושמים, מסמך, בדיקה וטעות נפוצה');
    await shot(page, `${vp}-08-wealth-1219`);
    if (mobile) ok(await noHScroll(page), 'טלפון: הצהרת הון בלי גלילה הצידה');

    // ── 6. ידע מקצועי ──
    await go(page, '/tax/learn');
    if (mobile && !(await page.locator('[data-domain-card]').first().isVisible())) { await page.locator('[data-rail="learn-home"]').click(); await sleep(400); }
    ok(await page.locator('[data-domain-card]').count() >= 8, 'ידע מקצועי: כרטיס לכל תחום');
    await shot(page, `${vp}-05-learn-home`);
    await page.locator('[data-domain-card="savings"]').click(); await sleep(500);
    ok((await page.evaluate(() => location.hash)) === '#/tax/learn/savings', 'הכתובת: ‎#/tax/learn/savings‎');
    const dp = await text(page.locator('[data-domain="savings"]'));
    ok(dp.includes('מתי רלוונטי') && dp.includes('מה מבקשים מהלקוח') && dp.includes('ללמוד לעומק') && dp.includes('פנסיה לעצמאי') && dp.includes('העבודות אצל הלקוחות'), 'עמוד תחום: מה, מתי, מה מבקשים, ללמוד לעומק, עבודות', dp.slice(0, 400));
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
    ok(rail.open.join() === 'learn-savings' && rail.closed === 10, 'תפריט: תחום פתוח אחד (aria-expanded), השאר סגורים', JSON.stringify(rail));
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
    ok(ann.includes('הכנת הדוח: מהמסמך לשדה') && ann.includes('בקרת הטופס') && await page.locator('[data-domain="annual"] [data-form-map]').count() === 1, 'דוח שנתי: הטופס, הבקרה ו«ללמוד לעומק»', ann.slice(0, 300));
    if (mobile) ok(await noHScroll(page), 'טלפון: עמוד תחום בלי גלילה הצידה');

    // ── 7. «ערכים לשנה» — לכל ערך בית אחד בתחום שלו (15.10.2026) ──
    const openDomain = async (d) => {
      await go(page, `/tax/learn/${d}`);
      if (mobile && !(await page.locator(`[data-domain="${d}"]`).isVisible())) { await page.locator(`[data-rail="learn-${d}"]`).click(); await sleep(400); }
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
    ok((await reBtn.getAttribute('aria-expanded')) === 'true' && reText.includes('מס רכישה - דירה יחידה') && reText.includes('תקרת פטור שבח'), 'פתיחה במקום: מס רכישה ומס שבח בתחום שכר דירה ונדל״ן', reText.slice(0, 200));
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
    ok((await text(saP)).includes('תקרת מחיר מחירון'), 'שכירים ושכר: שווי שימוש ברכב');
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
    ok(peText.includes('תקרת סעיף 47') && peText.includes('לפיצויים') && /לא במרשם/.test(peText), 'שתי השורות שהוסתרו — גלויות, עם ההערה שלא במרשם', peText.slice(0, 300));
    ok((await text(page.locator('[data-domain="savings"]'))).includes('פרישה ופיצויים'), 'פנסיה, השתלמות ופרישה: פרישה ופיצויים');

    // קישור ישן ל«ערכים לפי נושא»
    await page.goto('about:blank');
    await page.goto(`${BASE}/?office-app#/tax/learn/reference/topics`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-tax-area]').waitFor({ timeout: 30000 }); await sleep(800);
    if (mobile && !(await page.locator('[data-moved]').isVisible())) { await page.locator('[data-rail="learn-home"]').click(); await sleep(400); }
    const moved = page.locator('[data-moved]');
    ok(await moved.isVisible() && await moved.locator('[data-moved-to]').count() >= 8, 'קישור ישן: «ערכים לפי נושא עברו לתחומים» עם קישור לכל נושא');
    await shot(page, `${vp}-11-moved`);
    await moved.locator('[data-moved-to="rent/realEstate"]').click(); await sleep(700);
    ok((await page.evaluate(() => location.hash)) === '#/tax/learn/rent/v/realEstate' && (await page.locator('[data-value-group="realEstate"] .kn-ask-toggle').getAttribute('aria-expanded')) === 'true', 'מהקישור הישן ל«מקרקעין» — הקבוצה פתוחה בתחום');

    // חיפוש מוצא ערכים
    await go(page, '/tax/learn');
    if (mobile && !(await page.locator('#ta-q').isVisible())) { await page.locator('[data-rail="learn-home"]').click(); await sleep(400); }
    await page.locator('#ta-q').fill('מס רכישה'); await sleep(300);
    const hit = page.locator('[data-value-hit="rent/realEstate"]');
    ok(await hit.count() > 0, 'חיפוש «מס רכישה» מוצא את שכר דירה ונדל״ן');
    await shot(page, `${vp}-12-search`);
    await hit.first().click(); await sleep(700);
    ok((await page.evaluate(() => location.hash)) === '#/tax/learn/rent/v/realEstate', 'תוצאת חיפוש נוחתת בקבוצה');
    await go(page, '/tax/learn');
    if (mobile && !(await page.locator('#ta-q').isVisible())) { await page.locator('[data-rail="learn-home"]').click(); await sleep(400); }
    await page.locator('#ta-q').fill('שבח'); await sleep(300);
    ok(await page.locator('[data-planned-hit="rent"]').count() > 0, 'חיפוש «שבח» מוצא גם את מה שעוד לא נבנה (מחשבון מס שבח — טרם נכתב)');
    for (const [w, d] of [['שווי שימוש', 'salary'], ['עוסק פטור', 'business']]) {
      await go(page, '/tax/learn');
      if (mobile && !(await page.locator('#ta-q').isVisible())) { await page.locator('[data-rail="learn-home"]').click(); await sleep(400); }
      await page.locator('#ta-q').fill(w); await sleep(300);
      ok(await page.locator(`[data-value-hit^="${d}/"]`).count() > 0, `חיפוש «${w}» ← ${d}`);
    }
    // כרטיס «ערך מפתח» מוביל לתחום
    await page.locator('#ta-q').fill(''); await sleep(200);
    await page.locator('[data-keyval="פטור שכר דירה"]').click(); await sleep(700);
    ok((await page.evaluate(() => location.hash)) === '#/tax/learn/rent/v/realEstate', 'כרטיס «פטור שכר דירה» מוביל לערכים בתחום');

    // ‼ 16.10 מצב משפחתי בשנת המס — פסקה בתחום «נקודות זיכוי ומדרגות»
    const crP = await openDomain('credits');
    const famNote = crP.locator('[data-domain-note="familyYear"]');
    ok(await famNote.locator('li').count() === 5 && await famNote.locator('.kn-claim.open').count() === 1 && /5329/.test(await text(famNote)), 'נקודות זיכוי: «מצב משפחתי בשנת המס» — חמש נקודות, שנת הגירושין/פטירה פתוחה');
    if (mobile) ok(await noHScroll(page), 'טלפון: עמוד נקודות זיכוי בלי גלילה הצידה');
    await famNote.scrollIntoViewIfNeeded(); await shot(page, `${vp}-16-family-year`);
    // ‼ 16.10 דמי לידה: נושא בתחום «ביטוח לאומי», הפניה מ«דוח שנתי» ומ«שכירים», ומסלול לימוד מלא
    for (const d of ['annual', 'salary']) {
      const dp = await openDomain(d);
      ok(await dp.locator('[data-see-also-item="maternity"]').count() === 1, `${d}: «ללמוד לעומק» מפנה לדמי לידה בתחום «ביטוח לאומי»`);
    }
    await page.locator('[data-see-also-item="maternity"]').click(); await sleep(800);
    ok((await page.evaluate(() => location.hash)) === '#/tax/learn/ni/maternity' && await page.locator('[data-topic="maternity"]').count() === 1, 'ההפניה נוחתת בנושא, בתחום שלו');
    const mlStages = await page.locator('[data-stage-btn]').evaluateAll(b => b.map(x => x.dataset.stageBtn).join(','));
    ok(mlStages === 'what,ask,read,calc,except,next,practice,sources', 'דמי לידה: כל שמונת השלבים', mlStages);
    ok(/מענק לידה/.test(await text(page.locator('#ml-what'))), '«מה זה»: גם מה לא כאן (מענק לידה פטור)');
    await page.locator('[data-stage-btn="calc"]').first().click(); await sleep(300);
    const calcT = await text(page.locator('[data-ml-result]'));
    ok(/9,129\.6/.test(calcT) && /30,812\.4/.test(calcT) && /58\.5/.test(calcT) && /197\.5/.test(calcT), 'מחשבון: נייר העבודה — 24/81 ימים', calcT);
    ok(await page.locator('#ml-ex img').evaluateAll(a => a.length === 2 && a.every(i => i.complete && i.naturalWidth > 0)), 'הדוגמה: הודעת ב״ל והאישור השנתי נטענו');
    await page.locator('[data-ml-from]').fill('2024-11-01'); await page.locator('[data-ml-to]').fill('2025-02-13'); await sleep(300);
    ok((await page.locator('[data-ml-result] [data-ml-year]').evaluateAll(r => r.map(x => x.children[1].textContent).join('/'))) === '61/44', 'מחשבון: הדוגמה מ«דע זכויותיך» — 61/44');
    await shot(page, `${vp}-14-maternity-calc`);
    await page.locator('[data-stage-btn="except"]').first().click(); await sleep(300);
    ok(await page.locator('#ml-exc .kn-claim, #ml-exc [class*="claim"]').count() > 0 && /250 או 194/.test(await text(page.locator('#ml-exc'))), '«חריגים»: המקרה המשולב — פתוח, במפורש');
    await page.locator('[data-stage-btn="next"]').first().click(); await sleep(300);
    ok(await page.locator('[data-ml-steps] li').count() === 5 && await page.locator('#ml-116c img').evaluate(i => i.complete && i.naturalWidth > 0), '116ג צעד אחר צעד, עם הטופס שמולא');
    await shot(page, `${vp}-15-maternity-116c`);
    await page.locator('[data-stage-btn="sources"]').first().click(); await sleep(300);
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
    const yearSel = mobile ? page.locator('.ta-val-year select') : page.locator('.pg-rail-year select');
    ok(await yearSel.isVisible(), mobile ? 'טלפון: בורר שנה ליד «ערכים לשנה»' : 'מחשב: בורר השנה במסילה');
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
      if (mobile && !(await dp2.locator('[data-work-overview]').isVisible())) { await dp2.locator('[data-rail="work-all"]').click(); await sleep(500); }
      ok((await dp2.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'מצב כהה: הממשק כהה');
      const woC = await dp2.locator('[data-wo-row]').first().evaluate(el => { const c = getComputedStyle(el); return { bg: c.backgroundColor, fg: c.color }; });
      ok(lum(woC.bg) < 0.2 && lum(woC.fg) > 0.5, 'מצב כהה: שורות הסקירה כהות והטקסט בהיר', JSON.stringify(woC));
      await shot(dp2, `${vp}-20-dark-overview`);
      await go(dp2, '/tax/learn/annual');
      if (mobile && !(await dp2.locator('[data-domain="annual"]').isVisible())) { await dp2.locator('[data-rail="learn-annual"]').click(); await sleep(400); }
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
