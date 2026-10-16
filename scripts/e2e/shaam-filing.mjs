// ─── «הפקת דוחות משע״ם והעלאה» בדפדפן — מסך הבדיקה על מסד מדומה (16.10.2026) ─────────────────────────
// ‼ ?test-office — מסד מדומה בזיכרון הדפדפן; שום דבר לא נשלח ולא נשמר במסד אמיתי. כל בקשה שאינה localhost — נחסמת.
// המסלול, במחשב (1280) ובטלפון (390, 360):
//   מדריך (צילומים נטענו, סימונים, הגדלה, Escape) · קובץ מהמסלול הישן · קובץ לא קשור / פגום / צילום · קליטה (זוהו, לבדיקה,
//   קבוצה שלא נבדקה) · שמירה לתיקים · ייבוא חוזר (ללא שינוי) · «פתח בקשה» · «פתח בקשות לכולם» עם יום הצהרה · קובץ חדש
//   (הוגש ⇒ מסומן על הבקשה, מועד חדש) · קובץ ישן (לא דורס) · קבוצה ריקה · היסטוריה ובקשת עותק · שיוך ידני / «לא שלנו» ·
//   «מרשימות שע״ם» בתיק הלקוח · בלי גלילה הצידה ובלי שגיאות קונסול.
//   node scripts/e2e/shaam-filing.mjs [--base=http://localhost:5175] [--vp=desktop,mobile,small] [--shots=dir] [--surface=app|harness]
// ‼ --surface=app (ברירת מחדל): המקומות האמיתיים בהדגמה — ‎?office-app#/tax/work‎ (המקטע בראש «כל העבודות») ותיק המס
//   (‎#/client/<id>/taxfile‎ ← «דוחות והצהרות»). --surface=harness: מסך הבדיקה ‎/src/features/shaamFiling/__dev/?test-office‎.
//   ‼ שני המצבים — שרת פיתוח בלבד (המסד המדומה קיים רק בו); «בקשות» של הלקוח נקראות מהמסד המדומה בתוך הדף.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d);
const BASE = arg('base', 'http://localhost:5175');
const VPS = arg('vp', 'desktop,mobile,small').split(',');
const SHOTS = arg('shots', '');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PW = process.env.PW_CORE ?? 'C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json';
const { chromium } = createRequire(PW)('playwright-core');
const SAMPLES = resolve('src/features/shaamFiling/__dev/samples');
const S = (n) => join(SAMPLES, n);
const SURFACE = arg('surface', 'app');
const URL_ = SURFACE === 'harness' ? `${BASE}/src/features/shaamFiling/__dev/index.html?test-office` : `${BASE}/?office-app#/tax/work`;

let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(info).slice(0, 400)}` : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: CHROME, headless: true });

for (const vp of VPS) {
  console.log(`\n── ${vp}`);
  const mobile = vp !== 'desktop';
  const ctx = await browser.newContext({
    viewport: vp === 'small' ? { width: 360, height: 740 } : mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'he-IL',
  });
  const blocked = [];
  await ctx.route('**/*', route => {
    const u = route.request().url(); const host = new URL(u).hostname;
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
    if (host === 'localhost' || host === '127.0.0.1' || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    blocked.push(u); return route.abort();
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${vp}-${name}.png`), fullPage: false }); };
  const text = async (sel) => (await page.locator(sel).first().innerText().catch(() => '')) ?? '';
  const count = (sel) => page.locator(sel).count();
  const noHScroll = async (where) => ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${where}: בלי גלילה הצידה`,
    await page.evaluate(() => `${document.documentElement.scrollWidth} > ${window.innerWidth}`));
  const upload = async (names) => { await page.setInputFiles('[data-sf-file-input]', names.map(n => n.includes('/') || n.includes('\\') ? n : S(n))); await page.waitForSelector('[data-sf-review]', { timeout: 15000 }); await sleep(400); };
  const cancel = async () => { await page.getByRole('button', { name: 'ביטול' }).first().click(); await sleep(200); };
  const save = async () => { await page.click('[data-sf-save]'); await page.waitForSelector('[data-sf-saved]', { timeout: 15000 }); await sleep(500); };

  // ── ניווט: «כל העבודות» ⇄ תיק המס (באפליקציה — שינוי כתובת בתוך הדף, המסד המדומה נשמר) ──
  const openWork = async () => {
    if (SURFACE === 'harness') return;
    await page.evaluate(() => { location.hash = '#/tax/work'; });
    await page.waitForSelector('[data-shaam-filing-panel]', { timeout: 30000 }); await sleep(500);
  };
  const clientRows = async (id, { stay = false } = {}) => {
    if (SURFACE === 'harness') { await page.selectOption('[data-dev-client-pick]', id); await sleep(900); return text('[data-sf-client-rows]'); }
    await page.evaluate((cid) => { location.hash = `#/client/${cid}/taxfile`; }, id);
    await page.waitForSelector('[data-sf-client-rows]', { timeout: 30000 }); await sleep(600);
    const out = await text('[data-sf-client-rows]');
    if (!stay) await openWork();
    return out;
  };
  // «בקשות» של הלקוח — ישירות מהמסד המדומה (אותו מודול supabase שהאפליקציה משתמשת בו)
  const steps = (cid) => page.evaluate(async (c) => {
    const m = await import('/src/lib/supabase.ts');
    const { data } = await m.supabase.from('onboarding_steps').select('*').eq('client_id', c);
    const office = ['annual_return', 'wealth_declaration'];
    return (data ?? []).filter(s => [...office, 'custom_request', 'info_collection'].includes(s.step_type)).map(s =>
      `${s.step_type} · ${s.payload?.taxYear ?? s.payload?.asOfDate ?? s.payload?.title ?? ''} · ${s.status} · ${office.includes(s.step_type) ? 'עבודת משרד' : s.published_at ? 'פורסם ללקוח' : 'טיוטה — לא פורסם'}${s.payload?.work?.shaamFiled ? ' · הוגש לפי שע״ם' : ''}`).join('\n');
  }, cid);

  await page.goto(URL_);
  await page.waitForSelector('[data-shaam-filing-panel]', { timeout: 30000 });
  await sleep(600);
  ok(await count('[data-sf-drop]') === 1, 'המקטע עולה: כותרת, «העלאת PDF», אזור גרירה');
  await noHScroll('מצב פתיחה');
  await shot('01-start');

  // ── מדריך ──
  await page.click('[data-sf-guide-toggle]');
  await page.waitForSelector('[data-sf-guide]');
  const imgOk = () => page.evaluate(() => [...document.querySelectorAll('[data-sf-step-body] img')].every(i => i.complete && i.naturalWidth > 0));
  await sleep(500);
  ok(await imgOk(), 'מדריך: צילום הצעד הראשון נטען');
  ok(await count('[data-sf-step-body] svg rect') === 1 && /אפשרות 4/.test(await text('.shf-marks')), 'צעד 1: סימון אחד, על אפשרות 4, עם הסבר כתוב');
  await page.click('[data-sf-step="a3"]'); await sleep(300);
  ok(/צילום ביניים/.test(await text('[data-sf-step-body]')) && await count('[data-sf-step-body] svg rect') === 3, 'צעד 3: תווית «צילום ביניים», שלושה סימונים');
  await page.click('[data-sf-step="a4"]'); await sleep(400);
  ok(await imgOk() && await count('[data-sf-step-body] svg rect') === 5, 'צעד 4 (צילום 19): חמישה סימונים — כותרות, שורה עם ח, PF8');
  await shot('02-guide');
  await page.click('[data-sf-zoom]'); await sleep(300);
  ok(await count('[data-sf-zoom-open]') === 1, 'לחיצה על הצילום — הגדלה');
  await shot('03-zoom');
  await page.keyboard.press('Escape'); await sleep(200);
  ok(await count('[data-sf-zoom-open]') === 0, 'Escape סוגר את ההגדלה');
  await page.click('[data-sf-step="save"]'); await sleep(300);
  ok(/ממתין לאימות/.test(await text('[data-sf-step-body]')) && !/מדפיס את כל/.test(await text('[data-sf-step-body]')), 'שמירת ה-PDF — «ממתין לאימות», בלי טענה ש-PrtScrn מדפיס הכול');
  await page.click('[data-sf-guide-tab="wealth"]'); await sleep(400);
  ok(await imgOk() && /ארבע הקבוצות/.test(await text('.shf-marks')), 'הצהרות הון: צילום 20 עם ארבע הקבוצות');
  await page.click('[data-sf-step="w4"]'); await sleep(400);
  ok(/נבדקה וריקה בדוגמה זו/.test(await text('[data-sf-step-body]')), 'צילום 27: «הקבוצה נבדקה וריקה בדוגמה זו»');
  await noHScroll('מדריך');
  await page.click('[data-sf-guide-toggle]');

  // ── קובץ ישן / לא קשור / פגום / צילום ──
  await upload(['6-old-route-annual.pdf']);
  ok(/חסר סימון חבות/.test(await text('[data-sf-file]')) && await count('[data-sf-plan]') === 0, 'מסלול ישן: «חסר סימון חבות», אף שורה לא מוצגת כחייבת');
  ok(await page.locator('[data-sf-save]').isDisabled(), 'מסלול ישן: «שמירה לתיקים» כבויה');
  await shot('04-legacy');
  await cancel();
  await upload(['7-not-shaam.pdf', '8-broken.pdf', resolve('public/guides/shaam-filing/12.png')]);
  const files = await page.locator('[data-sf-file]').allInnerTexts();
  ok(files.length === 3 && /לא רשימה משע״ם/.test(files[0]) && /פגום/.test(files[1]) && /צילום מסך/.test(files[2]), 'לא קשור / פגום / צילום — כל אחד עם הסבר', JSON.stringify(files));
  ok(await page.locator('[data-sf-save]').isDisabled(), 'בלי שורות — אין שמירה');
  await cancel();

  // ── קליטה ושמירה ──
  await upload(['1-annual-2025.pdf', '2-wealth-unfiled-no-fine.pdf']);
  const counts = await text('[data-sf-counts]');
  ok(/זוהו 7/.test(counts) && /לבדיקה 2/.test(counts) && /חדשים 9/.test(counts), 'תצוגת קליטה: זוהו 7, חדשים 9, לבדיקה 2', counts);
  ok(await count('[data-sf-unchecked="unfiled_fine"]') === 1, 'הקבוצה השנייה של הון — «לא נבדקה»');
  ok(/עמודים 1 מתוך 1/.test(await text('[data-sf-coverage]')), 'כיסוי: «עמודים 1 מתוך 1»');
  await noHScroll('תצוגת קליטה');
  await shot('05-review');
  await save();
  ok(/7 שורות מזוהות/.test(await text('[data-sf-saved]')) && /2 לבדיקה/.test(await text('[data-sf-saved]')), 'נשמר: 7 מזוהות, 2 לבדיקה (לא נכתבו לתיק)', await text('[data-sf-saved]'));
  ok(await count('[data-sf-open-row-item]') === 5, '5 שורות «חייב · טרם נפתח»', String(await count('[data-sf-open-row-item]')));
  ok(await count('[data-sf-review-row]') === 2, 'רשימת «לבדיקה»: 2');
  await shot('06-saved');

  // ── ייבוא חוזר ──
  await upload(['1-annual-2025.pdf', '2-wealth-unfiled-no-fine.pdf']);
  const again = await text('[data-sf-counts]');
  ok(/חדשים 0/.test(again) && /ללא שינוי 9/.test(again), 'אותם קבצים שוב — חדשים 0, ללא שינוי 9', again);
  await save();
  ok(await count('[data-sf-open-row-item]') === 5, 'אין כפילות — עדיין 5 שורות');

  // ── «פתח בקשה» ──
  await page.locator('[data-sf-open-one]').first().click();
  await page.waitForSelector('[data-sf-open-dialog]');
  await shot('07-open-one');
  await page.click('[data-sf-open-run]');
  await page.waitForSelector('[data-sf-open-result]', { timeout: 15000 });
  ok(await page.locator('[data-sf-open-result="ok"]').count() === 1, '«פתח בקשה» — נפתחה, השאלות בטיוטה');
  await page.getByRole('button', { name: 'סגירה' }).last().click(); await sleep(600);
  ok(await count('[data-sf-open-row-item]') === 4, 'השורה ירדה מ«טרם נפתח» (4)');
  const steps1 = await steps('sample-1');
  ok(/annual_return · 2025/.test(steps1) && !/info_collection[^\n]*פורסם ללקוח/.test(steps1), 'ב«בקשות» של דוד: דוח 2025 נפתח, שאלות הלקוח לא פורסמו', steps1);

  // ── «פתח בקשות לכולם» — הון דורש יום הצהרה ──
  await page.click('[data-sf-open-all]');
  await page.waitForSelector('[data-sf-open-dialog]');
  ok(/חסר יום הצהרה/.test(await text('[data-sf-open-run]')), 'הון בלי יום הצהרה — לא נפתח בשקט («חסר יום הצהרה»)');
  while (await count('[data-sf-asof-fill]')) { await page.locator('[data-sf-asof-fill]').first().click(); await sleep(100); }
  await shot('08-open-all');
  await page.click('[data-sf-open-run]');
  await page.waitForFunction(() => document.querySelectorAll('[data-sf-open-result]').length >= 4, null, { timeout: 20000 });
  ok(await page.locator('[data-sf-open-result="ok"]').count() === 4, 'פתיחה מרוכזת — 4 נפתחו');
  await page.getByRole('button', { name: 'סגירה' }).last().click(); await sleep(600);
  ok(await count('[data-sf-open-row-item]') === 0, 'אין יותר «טרם נפתח»');

  // ── קובץ חדש: הוגש + ארכה; ואחריו קובץ ישן ──
  await upload(['5-annual-2025-later.pdf']);
  ok(/עודכנו 2/.test(await text('[data-sf-counts]')), 'קובץ מ-20.10: שני עדכונים', await text('[data-sf-counts]'));
  await save();
  { const s1 = await steps('sample-1'); ok(/annual_return · 2025 · [^\n]*הוגש לפי שע״ם/.test(s1) && !/annual_return · 2025 · completed/.test(s1), 'הבקשה של דוד: מסומן «הוגש לפי שע״ם», לא נסגרה', s1); }
  { const m = await clientRows('sample-2'); ok(/נדרש להגיש עד 31\.01\.2027/.test(m), 'מיכל: המועד החדש 31.01.2027 בתיק', m); }
  await upload(['1-annual-2025.pdf']);
  const old = await text('[data-sf-counts]');
  ok(/מקובץ ישן 2/.test(old), 'הקובץ מ-15.10 אחרי זה מ-20.10 — «ישן מהקיים», לא דורס', old);
  await cancel();

  // ── קבוצה ריקה, היסטוריה ועותק ──
  await upload(['3-wealth-unfiled-fine-empty.pdf', '4-wealth-filed-fine.pdf']);
  ok(/נבדקה וריקה/.test(await text('[data-sf-coverage]')) && await count('[data-sf-unchecked="unfiled_fine"]') === 0, '«אין תיקים שבקשת» — הקבוצה נבדקה וריקה');
  await save();
  await page.click('[data-sf-history] summary'); await sleep(300);
  const hist = await page.locator('[data-sf-history-row]').allInnerTexts();
  ok(hist.some(h => /הצהרת הון — שנה כפי שמופיעה בשע״ם: 2022/.test(h) && /חייב בקנס/.test(h)), 'היסטוריה: הצהרת הון 2022, חייב בקנס כסימון', JSON.stringify(hist));
  await page.locator('[data-sf-copy]').first().click();
  await page.waitForSelector('[data-sf-history-row="requested"]', { timeout: 10000 });
  ok(true, '«בקש עותק» ⇒ «בקשת עותק ממתינה»');
  { const s1 = await steps('sample-1'); ok(/עותק הצהרת ההון שהוגשה — 2022[^\n]*טיוטה — לא פורסם/.test(s1), 'בקשת העותק — בקשת מסמך קיימת, לא פורסמה', s1); }
  await shot('09-history');

  // ── לבדיקה: שיוך ידני ו«לא שלנו» ──
  const unk = page.locator('[data-sf-review-row="unmatched"]').first();
  await unk.locator('input[type=search]').fill('נטשה'); await sleep(200);
  await unk.locator('select').first().selectOption('sample-5'); await sleep(200);
  await unk.getByRole('button', { name: 'שייך לתיק' }).click(); await sleep(1000);
  ok(await count('[data-sf-review-row="unmatched"]') === 0, 'שיוך ידני ⇒ יוצא מ«לבדיקה»');
  { const n = await clientRows('sample-5'); ok(/דוח שנתי — שנת מס 2025/.test(n) && /חייב/.test(n), 'ובתיק של הכרטיס שנבחר — «דוח שנתי 2025 · חייב» (קושר לבקשה קיימת אם יש)', n); }
  await page.locator('[data-sf-review-row="name_mismatch"]').getByRole('button', { name: 'לא שלנו' }).click(); await sleep(800);
  ok(await count('[data-sf-review-row]') === 0, '«לא שלנו» ⇒ יוצא מהרשימה');

  // ── תיק הלקוח ──
  const cr = await clientRows('sample-1', { stay: true });
  ok(/מרשימות שע״ם/.test(cr) && /דוח שנתי — שנת מס 2025/.test(cr) && /מקור: שע״ם/.test(cr), 'תיק דוד: «מרשימות שע״ם» עם הכותרת והמקור', cr);
  await page.locator('[data-sf-client-rows]').scrollIntoViewIfNeeded();
  await noHScroll('תיק לקוח');
  await shot('10-client');

  // ── מעקב שוטף מול קליטה ──
  await openWork();
  await upload(['2-wealth-unfiled-no-fine.pdf']);
  await page.getByRole('radio', { name: 'קליטה / יישור קו' }).click(); await sleep(200);
  ok(await count('[data-sf-unchecked="filed_no_fine"]') === 1 && await count('[data-sf-unchecked]') === 1 && await count('[data-sf-recent]') === 2, 'קליטה / יישור קו — «הגישו ולא חייבים» לא נבדקה; שתיים נבדקו בהעלאה קודמת', String(await count('[data-sf-unchecked]')));
  await cancel();

  ok(errors.length === 0, 'בלי שגיאות קונסול', errors.join(' | '));
  ok(blocked.length === 0, 'אין בקשות מחוץ ל-localhost', blocked.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
