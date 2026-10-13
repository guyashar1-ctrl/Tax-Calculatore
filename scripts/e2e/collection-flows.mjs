#!/usr/bin/env node
/**
 * collection-flows.mjs — בדיקת דפדפן של חבילת איסוף הנתונים: קליטה, דוח שנתי, הצהרת הון ראשונה והמשך.
 *
 * בכל מסלול: משרד → פרסום → לקוח (תשובות, מסמך, «אין לי עדיין», שמירה וחזרה) → «החזר לתיקון» → אישור →
 * עדכון התיק. במחשב (1440) ובטלפון (390, הדמיית מגע — לא מכשיר אמיתי).
 *
 * יעדים:
 *   --target=demo     שרת הפיתוח במצב הדגמה (מסד מדומה, דוד כהן sample-1, טוקן דף אישי 'demo'). ברירת מחדל: http://localhost:5243
 *   --target=staging  הבנייה לפרסום (vite build --mode staging) שמוגשת מקומית, מול המסד של staging, עם לקוח בדיקה
 *                     שנוצר ונמחק בסוף. ראו scripts/e2e/staging-session.mjs (כניסה בלי סיסמה, ניקוי).
 *
 *   node scripts/e2e/collection-flows.mjs --target=demo [--base=http://localhost:5243] [--only=intake,annual,wealth,followup] [--shots=<dir>]
 *
 * ‼ playwright-core כבר מותקן כתלות של העובד (worker/node_modules) — לא תלות חדשה. נתיב אחר: PW_CORE=<.../package.json>.
 * ‼ כל בקשה לייצור (uoweoqtuiettozagwgdw) נחסמת ומכשילה את הבדיקה. ב-staging מותר רק המארח של staging.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d);
const TARGET = arg('target', 'demo');
const BASE = arg('base', TARGET === 'demo' ? 'http://localhost:5243' : 'http://localhost:4744');
const ONLY = new Set(arg('only', 'intake,annual,wealth,followup,office,legacy,isolation').split(','));
const SHOTS = arg('shots', '');
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PW = process.env.PW_CORE ?? 'C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json';
const { chromium } = createRequire(PW)('playwright-core');
const PROD = 'uoweoqtuiettozagwgdw';
const STAGING = 'evdfxjqrkgugssfrdoxd';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const results = [];
const ok = (c, m, info = '') => { c ? pass++ : fail++; results.push({ ok: !!c, m, info: c ? '' : String(info).slice(0, 300) }); console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(info).slice(0, 300)}` : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── סביבה ────────────────────────────────────────────────────────────────────
/** staging: הכנה (לקוח בדיקה, טוקן, סשן) ממודול נפרד — כדי שמצב הדגמה לא ייגע בסודות. */
const env = TARGET === 'staging' ? await (await import('./staging-session.mjs')).prepare() : {
  officeUrl: (clientId, tab = 'taxfile') => `${BASE}/?office-app&fresh-taxyear#/client/${clientId}/${tab}`,
  officeUrlKeep: (clientId, tab = 'taxfile') => `${BASE}/?office-app#/client/${clientId}/${tab}`,
  portalUrl: () => `${BASE}/?portal=demo&office-app`,
  intakeUrl: () => `${BASE}/?intake=demo-intake&office-app`,
  clientId: 'sample-1', otherClientId: 'sample-2', clientName: 'דוד', spouseName: 'רחל',
  initContext: async () => {}, cleanup: async () => ({ left: 0 }),
};

// ‼ שרת הפיתוח טוען אלפי מודולים בכל ניווט; בלי ערימה גדולה הכרום ללא-ראש קרס באמצע (Target crashed) בנקודות אקראיות.
//   ‼ ובמצב ה-headless הישן של playwright הדף קרס בסיום שאלון בדף האישי — גם עם ערימה גדולה; במצב «new» של כרום — יציב.
const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--headless=new', '--js-flags=--max-old-space-size=4096', '--disable-dev-shm-usage'] });
const consoleErrors = [];
const httpErrors = [];
const blocked = [];
async function newPage(viewport, { client = false } = {}) {
  const mobile = viewport === 'mobile';
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'he-IL',
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  // ‼ לקוח — במכשיר משלו, בלי סשן המשרד (גם אמין יותר: הזרקת הסשן בכל טעינה מחזירה אסימון ישן אחרי רענון)
  if (!client) await env.initContext(ctx);
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.includes(PROD)) { blocked.push(u); return route.abort(); }
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
    const host = new URL(u).hostname;
    if (host === 'localhost' || host === '127.0.0.1' || u.startsWith('data:') || u.startsWith('blob:') || (TARGET === 'staging' && host.includes(STAGING))) return route.continue();
    blocked.push(u); return route.abort();
  });
  const attach = (p) => {
    p.on('console', m => { if (m.type() === 'error' && !/favicon|ResizeObserver|Failed to load resource: net::ERR_FAILED/.test(m.text())) consoleErrors.push(`${viewport}: ${m.text().slice(0, 240)}`); });
    p.on('pageerror', e => consoleErrors.push(`${viewport} pageerror: ${String(e).slice(0, 240)}`));
    p.on('crash', () => consoleErrors.push(`${viewport}: הדף קרס (${p.url()})`));
    p.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) httpErrors.push(`${viewport}: ${r.status()} ${r.request().method()} ${r.url().replace(/[?#].*$/, '').slice(-120)} @ ${p.url().replace(/(portal|intake)=[^&#]+/, '$1=…').slice(-90)} [${client ? 'לקוח' : 'משרד'}]`); });
    if (process.env.E2E_DEBUG) { p.on('console', m => { if (/Maximum update depth|Too many re-renders|[mem]/.test(m.text())) console.log('    [page]', m.text().slice(0, 200)); }); p.addInitScript(() => { setInterval(() => console.log('[mem]', Math.round((performance).memory?.usedJSHeapSize / 1e6), document.querySelectorAll('*').length), 400); }); }
  };
  // ‼ לשונית חדשה לכל ניווט (אותו פרופיל — המסד המדומה באחסון המקומי נשמר): שרת הפיתוח טוען אלפי מודולים בכל
  //   טעינה, והזיכרון בלשונית אחת הצטבר עד קריסה (Target crashed) אחרי כעשר טעינות. בבנייה לפרסום — אותו דבר, בזול.
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
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false }).catch(() => {}); };
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
// ‼ טקסט של רכיב שאולי לא קיים — בודקים מיד (count), לא ממתינים 30 שניות: ההמתנה הארוכה על רכיב חסר בדף התודה
//   הפילה את הכרום ללא-ראש («Target crashed») — בחלונית הגלויה אותו מצב יציב.
const text = async (loc) => ((await loc.count().catch(() => 0)) ? loc.first().innerText({ timeout: 5000 }).catch(() => '') : '');

// ── משרד ─────────────────────────────────────────────────────────────────────
async function openTaxFile(page, fresh = false) {
  await page.goto(fresh ? env.officeUrl(env.clientId) : env.officeUrlKeep(env.clientId), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-section="intake"]', { timeout: 30000 });
}
/** פותח את דף התהליך מכרטיס בתיק המס. */
async function openProcess(page, which, opts = {}) {
  if (which === 'intake') {
    const sec = page.locator('[data-section="intake"]');
    await sec.scrollIntoViewIfNeeded();
    await sec.getByRole('button', { name: /^(התחל|פתח|קליטה חדשה)$/ }).first().click();
  } else if (which === 'annual') {
    const year = page.locator('.ty-year').filter({ has: page.locator('h4', { hasText: String(opts.year) }) }).first();
    await year.scrollIntoViewIfNeeded();
    await year.locator('.ty-line', { hasText: 'דוח שנתי' }).getByRole('button', { name: /^(התחל|פתח)$/ }).click();
  } else if (which === 'wealth') {
    const w = page.locator('.ty-year').filter({ has: page.locator('h4', { hasText: 'הצהרות הון' }) });
    await w.scrollIntoViewIfNeeded();
    const line = w.locator('.ty-line', { hasText: `ליום ${opts.asOf.split('-').reverse().join('.')}` });
    if (await line.count()) await line.getByRole('button', { name: 'פתח' }).click();
    else { await w.locator('input[type="date"]').fill(opts.asOf); await w.getByRole('button', { name: 'התחל הכנה' }).click(); }
  }
  await page.waitForSelector('.ty-overlay .ty-label', { timeout: 20000 });
  return page.locator('.ty-overlay');
}
const nowBox = (ov) => ov.locator('.ty-now');
async function waitIdle(ov) { await ov.page().waitForTimeout(250); await ov.locator('button[disabled]').first().waitFor({ state: 'detached', timeout: 8000 }).catch(() => {}); await ov.page().waitForTimeout(300); }
async function goNow(ov, go) {
  // «אחר כך» → «להכין עכשיו» / «לפרסם עכשיו» / «להשלים עכשיו»
  const label = go === 'ask' ? 'להכין עכשיו' : go === 'publish' ? 'לפרסם עכשיו' : 'להשלים עכשיו';
  const b = ov.locator('.ty-later').getByRole('button', { name: label });
  if (await b.count()) { await b.first().click(); await waitIdle(ov); return true; }
  return false;
}
/** מכין ומפרסם את כל השאלות המוצעות. מחזיר את מספר השאלות שפורסמו. */
async function prepareAndPublish(ov, { uncheck = [] } = {}) {
  let box = nowBox(ov);
  if (!(await text(box)).match(/שאלות? ל|שאלה אחת ל/)) await goNow(ov, 'ask');
  box = nowBox(ov);
  for (const u of uncheck) { const cb = box.locator('label.ty-check', { hasText: u }).locator('input'); if (await cb.count()) await cb.first().uncheck(); }
  const add = box.getByRole('button', { name: /^הוסף .*לבקשה «השלמת מידע»$/ });
  if (!(await add.count())) return 0;
  const n = Number(((await text(add)).match(/\d+/) ?? ['1'])[0]);
  await add.click(); await waitIdle(ov);
  let pub = nowBox(ov).getByRole('button', { name: 'פרסם בדף האישי' });
  if (!(await pub.count())) { await goNow(ov, 'publish'); pub = nowBox(ov).getByRole('button', { name: 'פרסם בדף האישי' }); }
  await pub.click(); await waitIdle(ov);
  return n;
}
async function closeProcess(page) { await page.locator('.ty-overlay .ty-head').getByRole('button', { name: 'סגירה' }).click(); await page.waitForTimeout(400); }

// ── הלקוח ────────────────────────────────────────────────────────────────────
async function openPortalItem(page, label) {
  await page.goto(env.portalUrl(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction((l) => document.body.innerText.includes(l), label, { timeout: 30000 });
  const card = page.locator('div', { has: page.getByText(label, { exact: true }) }).filter({ has: page.getByRole('button', { name: 'להשלמת המידע' }) }).last();
  await card.getByRole('button', { name: 'להשלמת המידע' }).click();
  await page.waitForSelector('.ty-flow', { timeout: 15000 });
  return page.locator('.ty-flow');
}
const pdfBytes = (s) => Buffer.from(`%PDF-1.4\n% QAE2E ${s}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);
/**
 * עונה על השאלות לפי חוקים (מילה בכותרת → פעולה). מחזיר יומן של מה שנענה.
 * פעולות: confirm | changed:<טקסט> | yes | no | notSure | who:<none|client|spouse|both> | amount:<n> | text:<t> | choice:<label> | file | unavailable | saveExit
 */
async function answerFlow(page, rules, { stopAfter = Infinity } = {}) {
  const log = [];
  for (let step = 0; step < 60 && log.length < stopAfter; step++) {
    const flow = page.locator('.ty-flow');
    if (process.env.E2E_DEBUG) console.log('    [loop]', step, (await text(flow.locator('.ty-q').first())).slice(0, 40), await flow.count());
    if (await flow.locator('.ty-q', { hasText: 'תודה!' }).count()) { log.push({ done: true }); break; }
    const title = (await text(flow.locator('.ty-q').first())).trim();
    // ‼ אותה שאלה לכל אחד מבני הזוג — «השאלה על …» מבדיל ביניהן
    const who = (await text(flow.locator('.ty-q-sub', { hasText: 'השאלה על' }).first())).trim();
    if (await flow.locator('.ty-done-mark').count()) { await flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).click(); await sleep(300); continue; }
    const rule = rules.find(r => title.includes(r[0]));
    if (process.env.E2E_DEBUG) console.log('    [q]', title.slice(0, 70), '→', rule?.[1] ?? '(ברירת מחדל)');
    // ברירת מחדל לפי סוג השאלה: מסמך → «אין לי עדיין», אישור → «כן, הכול נכון», סכום → 0, כן/לא → «לא», טקסט → «בדיקה», בחירה → הראשונה
    const firstChoice = (await text(flow.locator('.ty-choice').first())).trim();
    const act = rule ? rule[1]
      : (await flow.locator('input[type="file"]').count()) ? 'unavailable'
      : (await flow.getByRole('button', { name: 'כן, הכול נכון' }).count()) ? 'confirm'
      : (await flow.locator('input[type="number"]').count()) ? 'amount:0'
      : (await flow.locator('.ty-choice', { hasText: /^לא$/ }).count()) ? 'no'
      : (await flow.locator('textarea').count()) ? 'text:בדיקה'
      : firstChoice ? `choice:${firstChoice}` : 'no';
    if (act === 'saveExit') { await flow.getByRole('button', { name: 'שמירה ויציאה' }).click(); await sleep(500); log.push({ title, who, act }); break; }
    const [kind, val] = act.split(/:(.*)/s);
    if (kind === 'confirm') await flow.getByRole('button', { name: 'כן, הכול נכון' }).click();
    else if (kind === 'changed') { await flow.getByRole('button', { name: 'משהו השתנה' }).click(); await flow.locator('textarea').fill(val); }
    else if (kind === 'yes') await flow.locator('.ty-choice', { hasText: /^כן$/ }).click();
    else if (kind === 'no') { const no = flow.locator('.ty-choice', { hasText: /^לא$/ }); await no.first().click(); }
    else if (kind === 'notSure') await flow.locator('.ty-choice', { hasText: 'לא בטוח' }).click();
    else if (kind === 'who') { const map = { none: /^לא$/, both: 'כן — שנינו', client: `כן — ${env.clientName}`, spouse: `כן — ${env.spouseName}` }; await flow.locator('.ty-choice', { hasText: map[val] }).first().click(); }
    else if (kind === 'amount') await flow.locator('input[type="number"]').fill(val);
    else if (kind === 'text') await flow.locator('textarea').fill(val);
    else if (kind === 'choice') await flow.locator('.ty-choice', { hasText: val }).first().click();
    else if (kind === 'unavailable') { await flow.getByRole('button', { name: 'אין לי עדיין' }).click(); await flow.locator('.ty-field input').fill('עוד לא קיבלתי').catch(() => {}); }
    else if (kind === 'file') {
      await flow.locator('input[type="file"]').setInputFiles({ name: `${title.slice(0, 20)}.pdf`, mimeType: 'application/pdf', buffer: pdfBytes(title.slice(0, 20)) });
      await page.waitForFunction((t) => !document.querySelector('.ty-flow .ty-q')?.textContent?.includes(t) || !!document.querySelector('.ty-flow .ty-err'), title, { timeout: 20000 }).catch(() => {});
      const err = await text(flow.locator('.ty-err'));
      log.push({ title, who, act, err }); continue;
    }
    log.push({ title, who, act });
    const next = flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ });
    await next.click();
    // ‼ מול שרת אמיתי השליחה לוקחת זמן: ממתינים שהשאלה תתחלף (או תודה / שגיאה) — אחרת נקראת השאלה הקודמת
    await page.waitForFunction((t) => { const q = document.querySelector('.ty-flow .ty-q')?.textContent ?? ''; return q !== t || !!document.querySelector('.ty-flow .ty-err'); }, title, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(250);
    const err = await text(flow.locator('.ty-err'));
    if (err) { log[log.length - 1].err = err; break; }
  }
  return log;
}

// ── מסלולים ──────────────────────────────────────────────────────────────────
async function flowIntake(viewport) {
  console.log(`\n▶ קליטה והשלמת תיק המס (${viewport})`);
  const { ctx, page } = await newPage(viewport);
  await openTaxFile(page, viewport === 'desktop');
  let ov = await openProcess(page, 'intake');
  ok((await text(ov.locator('h2'))).includes('קליטה והשלמת תיק המס'), 'הקליטה נפתחה מתיק המס, בלי דוח שנתי');
  // ‼ 236 · שאלון ישן פתוח — בחירה מפורשת במסך, ו«החלף בקליטה» מוריד אותו מהדף האישי
  const legacy = ov.locator('[data-legacy-intake]');
  let replacedLegacy = false;
  if (await legacy.count()) {
    ok((await text(legacy)).includes('להחליף אותו בקליטה') && (await text(legacy)).includes('להשאיר אותו'), 'שאלון ישן פתוח — המשרד רואה בחירה ברורה (להחליף / להשאיר)', await text(legacy));
    await legacy.getByRole('button', { name: 'החלף בקליטה' }).click();
    await ov.locator('.ty-ok').first().waitFor({ timeout: 15000 }).catch(() => {});
    const msg = await text(ov.locator('.ty-ok'));
    ok(msg.includes('הוחלף') && !(await ov.locator('[data-legacy-intake]').count()), '«החלף בקליטה» — השאלון הישן הוחלף, והבחירה ירדה מהמסך', msg);
    replacedLegacy = true;
  } else ok(false, 'אין שאלון ישן פתוח ללקוח הבדיקה — לא נבדקה ההחלפה');
  // השאלון המלא וההסתעפויות — לפני השליחה
  await ov.locator('details.ty-details summary', { hasText: 'השאלון' }).click();
  await ov.locator('.qm').first().waitFor({ timeout: 10000 }).catch(() => {});
  const qm = await text(ov.locator('.qm'));
  ok(qm.includes('ללקוח הזה') && qm.includes('רק על ישות חדשה'), 'המשרד רואה את השאלון ללקוח הזה ואת ההסתעפויות (ישות חדשה)', qm.slice(0, 200));
  await ov.locator('.qm-seg').getByRole('button', { name: 'השאלון המלא' }).click();
  ok((await text(ov.locator('.qm'))).includes('תעודת זהות עם הספח'), 'השאלון המלא — כולל מסמכים ו«המשרד אחר כך»');
  await ov.locator('details.ty-details summary', { hasText: 'השאלון' }).click();
  const manual = ov.locator('details.ty-details summary', { hasText: 'איך עושים את זה ביד' });
  ok(await manual.count() > 0, 'יש «איך עושים את זה ביד» לקליטה', String(await manual.count()));
  if (await manual.count()) { await manual.first().click(); const mt = await text(ov.locator('details.ty-details', { has: page.locator('summary', { hasText: 'איך עושים את זה ביד' }) })); ok(mt.includes('יישור קו') && mt.includes('עדכון התיק'), 'העבודה ביד: עדכון התיק ויישור קו מוסברים', mt.slice(0, 200)); await manual.first().click(); }
  if (viewport === 'mobile') ok(await noHScroll(page), 'טלפון: דף התהליך בלי גלילה הצידה');
  const n1 = await prepareAndPublish(ov);
  ok(n1 > 0, `פורסמו ${n1} שאלות קליטה`);
  ok((await text(ov.locator('.ty-ok'))).includes('פורסם'), 'הודעת פרסום (המייל — ב«שלח בקשות»)');
  await shot(page, `intake-office-${viewport}`);
  await closeProcess(page);

  // הלקוח: חלק, «שמירה ויציאה», חזרה, והמשך
  let flow = await openPortalItem(page, 'השלמת פרטים לתיק המס');
  ok(true, 'הלקוח רואה בדף האישי «השלמת פרטים לתיק המס»');
  if (replacedLegacy) ok(!(await page.evaluate(() => document.body.innerText)).includes('עדכון סטטוס מיסויי'), 'השאלון הישן כבר לא בדף האישי — שאלון אחד ללקוח');
  if (viewport === 'mobile') ok(await noHScroll(page), 'טלפון: הדף האישי בלי גלילה הצידה');
  const rules = [
    ['תעודת הזהות שלך', 'file'], ['תעודת הזהות של', 'unavailable'],
    ['מחוץ לישראל', 'who:spouse'], ['קריפטו', 'yes'], ['עצמאי', 'who:none'], ['כשכיר', 'who:none'],
    ['הילדים — זה מה שידוע', 'confirm'], ['המצב המשפחתי — זה מה שידוע', 'confirm'], ['תלוש השכר', 'unavailable'],
  ];
  const part = await answerFlow(page, rules, { stopAfter: 3 });
  await page.locator('.ty-flow').getByRole('button', { name: 'שמירה ויציאה' }).click().catch(() => {});
  await sleep(500);
  ok(part.length >= 3 && part.every(x => !x.err), `ענה על ${part.length} שאלות ויצא`, JSON.stringify(part));
  flow = await openPortalItem(page, 'השלמת פרטים לתיק המס');
  const resumeTitle = (await text(flow.locator('.ty-q').first())).trim();
  const resumeWho = (await text(flow.locator('.ty-q-sub', { hasText: 'השאלה על' }).first())).trim();
  ok(!part.some(x => x.title && x.title === resumeTitle && (x.who ?? '') === resumeWho), 'חזרה מאותו קישור — לשאלה הראשונה שלא נענתה, לא מההתחלה', `${resumeTitle} ${resumeWho}`);
  const rest = await answerFlow(page, rules);
  ok(rest.some(x => x.done) && rest.every(x => !x.err), `סיום: «תודה! התשובות נשלחו למשרד» (${rest.length - 1} שאלות נוספות)`, JSON.stringify(rest.filter(x => x.err)));
  ok([...part, ...rest].some(x => x.act === 'file'), 'הועלה מסמך מהדף האישי');
  await shot(page, `intake-portal-${viewport}`);

  // המשרד: בדיקה — «אין שינוי» במרוכז, «החזר ללקוח» לתשובה אחת, אישור מסמך
  await openTaxFile(page);
  ov = await openProcess(page, 'intake');
  ok((await text(nowBox(ov))).includes('לבדוק את מה ש'), 'המשרד: «לבדוק את מה ש… מסר»');
  const bulk = nowBox(ov).getByRole('button', { name: 'אשר את כולם' });
  if (await bulk.count()) { await bulk.first().click(); await waitIdle(ov); }
  // החזרה לתיקון — על «קריפטו»
  const cryptoRow = nowBox(ov).locator('.ty-row', { hasText: 'מטבעות דיגיטליים' }).first();
  if (await cryptoRow.count()) {
    await cryptoRow.getByRole('button', { name: 'החזר ללקוח' }).click();
    await cryptoRow.locator('input[aria-label="מה צריך לתקן"]').fill('נא לפרט באיזה ארנק או זירה');
    await cryptoRow.getByRole('button', { name: /^החזר$/ }).click(); await waitIdle(ov);
    ok((await text(ov.locator('.ty-ok'))).includes('הוחזר'), '«החזר ללקוח» — התשובה נדחתה עם הערה, והשאלה חזרה לטיוטה');
  } else ok(false, 'שורת «מטבעות דיגיטליים» לבדיקה לא נמצאה');
  // מסמך: «של מי?» ו«לשנה הנכונה?» ואז אישור
  const doc = nowBox(ov).locator('.ty-row', { hasText: 'תעודת זהות' }).first();
  if (await doc.count()) {
    const sels = doc.locator('select');
    await sels.nth(0).selectOption('match'); await sels.nth(1).selectOption('match');
    await doc.getByRole('button', { name: 'אשר מסמך' }).click(); await waitIdle(ov);
    ok(true, 'אישור מסמך אחרי «של מי» ו«לשנה»');
  } else ok(false, 'המסמך שהועלה לא הגיע לבדיקה');
  // שאר התשובות — אחת אחת
  for (let k = 0; k < 12; k++) {
    const b = nowBox(ov).getByRole('button', { name: /^אשר$/ });
    if (!(await b.count())) break;
    await b.first().click(); await waitIdle(ov);
  }
  // הטיוטה עם התיקון — לפרסם; ושאלות ההמשך (מקור חדש בחו״ל לבן הזוג)
  const later = await text(ov.locator('.ty-later'));
  await goNow(ov, 'publish');
  if (await nowBox(ov).getByRole('button', { name: 'פרסם בדף האישי' }).count()) { await nowBox(ov).getByRole('button', { name: 'פרסם בדף האישי' }).click(); await waitIdle(ov); }
  ok(true, `טיוטת התיקון פורסמה (${later.slice(0, 80)})`);
  await goNow(ov, 'ask');
  const askTxt = await text(nowBox(ov));
  ok(askTxt.includes('המקור החדש בחו״ל') || askTxt.includes('מקור חדש בחו״ל'), '«כן» לחו״ל בלי מקור בתיק ⇒ שאלת פרטים על «המקור החדש» (לא רק התראה)', askTxt.slice(0, 300));
  await prepareAndPublish(ov);
  await closeProcess(page);

  // הלקוח: רואה את בקשת התיקון, מתקן, ועונה על פרטי המקור החדש
  flow = await openPortalItem(page, 'השלמת פרטים לתיק המס');
  const all = await answerFlow(page, [['קריפטו', 'yes'], ['באיזו מדינה', 'text:ארה״ב, חשבון השקעות ב-Interactive Brokers']]);
  ok(all.some(x => x.title?.includes('קריפטו')), 'הלקוח ענה שוב על השאלה שהוחזרה');
  await page.goto(env.portalUrl());
  await sleep(500);

  // המשרד: הוספת המקור החדש לתיק עם אותו מזהה, ו«עדכן בתיק» לקריפטו
  await openTaxFile(page);
  ov = await openProcess(page, 'intake');
  for (let k = 0; k < 6; k++) { const b = nowBox(ov).getByRole('button', { name: /^אשר$/ }); if (!(await b.count())) break; await b.first().click(); await waitIdle(ov); }
  const addLine = nowBox(ov).locator('.ty-row', { hasText: 'מקור חדש בחו״ל' }).first();
  if (await addLine.count()) {
    const inputs = addLine.locator('input');
    await inputs.nth(0).fill('Interactive Brokers'); await inputs.nth(1).fill('ארה״ב');
    await addLine.getByRole('button', { name: /^הוסף לתיק/ }).click(); await waitIdle(ov);
    ok((await text(ov.locator('.ty-ok'))).includes('נוסף לתיק'), '«הוסף לתיק» — המקור נכנס לכרטיס עם אותו מזהה');
  } else {
    await goNow(ov, 'office');
    const off = nowBox(ov).locator('.ty-row', { hasText: 'מקור חדש בחו״ל' }).first();
    ok(await off.count() > 0, 'משימה «להוסיף לתיק» למקור החדש', (await text(nowBox(ov))).slice(0, 300));
    if (await off.count()) { const inputs = off.locator('input'); await inputs.nth(0).fill('Interactive Brokers'); await inputs.nth(1).fill('ארה״ב'); await off.getByRole('button', { name: /^הוסף לתיק/ }).click(); await waitIdle(ov);
      ok((await text(ov.locator('.ty-ok'))).includes('נוסף לתיק') && !(await nowBox(ov).locator('.ty-row', { hasText: 'מקור חדש בחו״ל' }).locator('input').count()), '«הוסף לתיק» הצליח — המקור בכרטיס עם אותו מזהה, והמשימה נעלמה', await text(ov.locator('.ty-err'))); }
  }
  await goNow(ov, 'office');
  const flag = nowBox(ov).locator('.ty-row', { hasText: 'מטבעות דיגיטליים' }).first();
  if (await flag.count()) { await flag.getByRole('button', { name: 'עדכן בתיק' }).click(); await waitIdle(ov); ok((await text(ov.locator('.ty-ok'))).includes('עודכן בתיק'), '«עדכן בתיק» — תשובה מאושרת נכנסה לכרטיס עם המקור'); }
  else ok(false, 'משימת «עדכן בתיק» לקריפטו לא נמצאה', (await text(nowBox(ov))).slice(0, 300));
  // מקור המידע: «נמסר בידי הלקוח» ≠ «נבדק ברשות»
  await ov.locator('details.ty-details summary', { hasText: 'מה ידוע' }).click();
  const known = await text(ov.locator('details.ty-details', { has: page.locator('summary', { hasText: 'מה ידוע' }) }));
  ok(known.includes('נמסר בידי הלקוח') || known.includes('אומת במסמך'), 'מקור המידע מוצג לכל פריט ידוע (לקוח / מסמך / רשות)', known.slice(0, 200));
  await shot(page, `intake-done-${viewport}`);
  await closeProcess(page);
  await ctx.close();
}

async function flowAnnual(viewport) {
  console.log(`\n▶ דוח שנתי 2025 (${viewport})`);
  const { ctx, page } = await newPage(viewport);
  await openTaxFile(page);
  let ov = await openProcess(page, 'annual', { year: 2025 });
  ok((await text(ov.locator('h2'))).includes('דוח שנתי 2025'), 'הדוח השנתי נפתח');
  if (viewport === 'mobile') ok(await noHScroll(page), 'טלפון: דף הדוח השנתי בלי גלילה הצידה');
  const n = await prepareAndPublish(ov);
  ok(n > 0, `פורסמו ${n} שאלות לשנה`);
  await shot(page, `annual-office-${viewport}`);
  await closeProcess(page);
  await openPortalItem(page, 'השלמת מידע לשנת 2025');
  if (viewport === 'mobile') ok(await noHScroll(page), 'טלפון: הדף האישי (דוח שנתי) בלי גלילה הצידה');
  await shot(page, `annual-portal-${viewport}`);
  const log = await answerFlow(page, [['טופס 106', 'file'], ['867', 'unavailable'], ['זה מה שידוע לנו', 'confirm']]);
  ok(log.some(x => x.done) && log.every(x => !x.err), `הלקוח השלים (${log.length - 1} תשובות)`, JSON.stringify(log.filter(x => x.err)));
  await openTaxFile(page);
  ov = await openProcess(page, 'annual', { year: 2025 });
  ok((await text(nowBox(ov))).includes('לבדוק'), 'המשרד: יש תשובות לבדוק');
  const doc = nowBox(ov).locator('.ty-row', { hasText: 'טופס 106' }).first();
  if (await doc.count()) {
    await doc.getByRole('button', { name: 'החזר ללקוח' }).click();
    await doc.locator('input[aria-label="מה צריך לתקן"]').fill('הקובץ חתוך — נא להעלות את כל העמודים');
    await doc.getByRole('button', { name: /^החזר$/ }).click(); await waitIdle(ov);
    ok((await text(ov.locator('.ty-ok'))).includes('הוחזר'), '106 הוחזר ללקוח עם הערה');
    await goNow(ov, 'publish');
    if (await nowBox(ov).getByRole('button', { name: 'פרסם בדף האישי' }).count()) { await nowBox(ov).getByRole('button', { name: 'פרסם בדף האישי' }).click(); await waitIdle(ov); }
  } else ok(false, '106 שהועלה לא הגיע לבדיקה');
  await closeProcess(page);
  const flow = await openPortalItem(page, 'השלמת מידע לשנת 2025');
  ok((await text(flow.locator('.ty-correction'))).includes('הקובץ חתוך'), 'הלקוח רואה «המשרד ביקש לתקן: …» מעל השאלה');
  await answerFlow(page, [['טופס 106', 'file']]);
  await openTaxFile(page);
  ov = await openProcess(page, 'annual', { year: 2025 });
  const doc2 = nowBox(ov).locator('.ty-row', { hasText: 'טופס 106' }).first();
  if (await doc2.count()) { const s = doc2.locator('select'); await s.nth(0).selectOption('match'); await s.nth(1).selectOption('match'); await doc2.getByRole('button', { name: 'אשר מסמך' }).click(); await waitIdle(ov); ok(true, 'המסמך המתוקן אושר'); }
  else ok(false, 'המסמך המתוקן לא הגיע');
  const bulk = nowBox(ov).getByRole('button', { name: 'אשר את כולם' });
  while (await bulk.count()) { await bulk.first().click(); await waitIdle(ov); }
  ok(true, 'אישור מרוכז של «אין שינוי» ו«לא»');
  await closeProcess(page);
  // «בקשות»: שורות הדוח ו«השלמת מידע»
  // ‼ הלשוניות של הלקוח לא משנות כתובת — לוחצים על «בקשות»
  await openTaxFile(page);
  await page.getByRole('tab', { name: 'בקשות' }).or(page.getByRole('button', { name: /^בקשות/ })).first().click();
  await page.waitForTimeout(2500);
  const req = await page.evaluate(() => document.body.innerText);
  ok(req.includes('דוח שנתי 2025') && req.includes('השלמת מידע'), '«בקשות»: שורות «דוח שנתי 2025» ו«↳ השלמת מידע»');
  await ctx.close();
}

/** ראשונה ואז המשך — באותו פרופיל דפדפן (בהדגמה המסד המדומה יושב באחסון המקומי של הפרופיל). */
async function flowWealthBoth(viewport, which) {
  const S = await newPage(viewport);
  try {
    if (which.has('wealth')) await flowWealth(viewport, '2025-12-31', 'first', S).catch(e => ok(false, 'הצהרת הון ראשונה נעצרה', e.stack ?? e));
    if (which.has('followup')) await flowWealth(viewport, '2026-06-30', 'followup', S).catch(e => ok(false, 'הצהרת הון בהמשך נעצרה', e.stack ?? e));
  } finally { await S.ctx.close(); }
}
async function flowWealth(viewport, asOf, kindExpect, S) {
  console.log(`\n▶ הצהרת הון ליום ${asOf} — ${kindExpect === 'followup' ? 'המשך' : 'ראשונה'} (${viewport})`);
  const { page } = S;
  await openTaxFile(page);
  let ov = await openProcess(page, 'wealth', { asOf });
  const sub = await text(ov.locator('.ty-sub'));
  ok(sub.includes(kindExpect === 'followup' ? 'הצהרת המשך' : 'הצהרה ראשונה'), `סוג ההצהרה: ${kindExpect === 'followup' ? 'המשך' : 'ראשונה'}`, sub);
  if (viewport === 'mobile') ok(await noHScroll(page), `טלפון: דף הצהרת ההון (${kindExpect === 'followup' ? 'המשך' : 'ראשונה'}) בלי גלילה הצידה`);
  if (kindExpect === 'followup') {
    await ov.locator('.ty-note', { hasText: 'ההצהרה הקודמת במערכת' }).first().waitFor({ timeout: 10000 }).catch(() => {});
    const note = await text(ov.locator('.ty-note', { hasText: 'ההצהרה הקודמת במערכת' }));
    ok(note.includes('נתונים מאושרים') && note.includes('לא מועתקים'), 'המשך: ההצהרה הקודמת במערכת היא הבסיס, בלי העתקה ליום החדש', note);
    await goNow(ov, 'ask');
    const askTxt = await text(nowBox(ov));
    ok(askTxt.includes('בהצהרה הקודמת:'), 'המשך: השאלה ללקוח מציגה מה הוצהר בקודמת («בהצהרה הקודמת: …»)', askTxt.slice(0, 300));
  }
  const n = await prepareAndPublish(ov);
  ok(n > 0, `פורסמו ${n} שאלות הון`);
  if (kindExpect === 'followup') {
    await ov.locator('details.ty-details summary', { hasText: 'השאלון' }).click();
    await ov.locator('.qm').first().waitFor({ timeout: 10000 }).catch(() => {});
    const qm = await text(ov.locator('.qm'));
    ok(qm.includes('מאז ההצהרה הקודמת'), 'המשך: השאלות הן «מה השתנה מאז ההצהרה הקודמת»', qm.slice(0, 200));
  }
  await closeProcess(page);
  await openPortalItem(page, 'השלמת מידע להצהרת הון');
  if (viewport === 'mobile') ok(await noHScroll(page), 'טלפון: הדף האישי (הצהרת הון) בלי גלילה הצידה');
  await shot(page, `wealth-${kindExpect}-portal-${viewport}`);
  const log = await answerFlow(page, [['מזומן', 'amount:5000'], ['באילו בנקים', 'text:לאומי, דיסקונט'], ['אילו חשבונות נפתחו', 'text:לא נפתח ולא נסגר'], ['אישור יתרות', 'file']]);
  ok(log.some(x => x.done) && log.every(x => !x.err), `הלקוח השלים (${log.length - 1} תשובות)`, JSON.stringify(log.filter(x => x.err)));
  await openTaxFile(page);
  ov = await openProcess(page, 'wealth', { asOf });
  const bulk = nowBox(ov).getByRole('button', { name: 'אשר את כולם' });
  while (await bulk.count()) { await bulk.first().click(); await waitIdle(ov); }
  for (let k = 0; k < 10; k++) { const b = nowBox(ov).getByRole('button', { name: /^אשר$/ }); if (!(await b.count())) break; await b.first().click(); await waitIdle(ov); }
  ok(true, 'התשובות אושרו');
  // סיכום המשרד ליום ההצהרה — נדל״ן (כדי שלהצהרת ההמשך יהיה בסיס)
  if (kindExpect === 'first') {
    await goNow(ov, 'office');
    const tot = nowBox(ov).locator('.ty-row', { hasText: 'יתרות הבנקים ליום ההצהרה' }).first();
    if (await tot.count()) { await tot.locator('input').first().fill('84000'); await tot.getByRole('button', { name: 'שמור' }).click(); await waitIdle(ov); ok(true, 'סיכום המשרד ליום ההצהרה נשמר'); }
    else ok(false, 'שורת סיכום המשרד לא נמצאה', (await text(nowBox(ov))).slice(0, 300));
  }
  await closeProcess(page);
}

/** ניהול המשרד › «עבודת מס»: הכניסה מהכותרת, מצב לכל לקוח, מה חסר, מה ממתין לבדיקה, הבא; פתיחת התהליך, תיק המס והמסמכים. */
async function flowOffice(viewport) {
  console.log(`\n▶ ניהול המשרד › עבודת מס (${viewport})`);
  const { ctx, page } = await newPage(viewport);
  const who = TARGET === 'demo' ? 'דוד' : env.run;
  try {
    // הכנה: קליטה עם תשובות שממתינות לבדיקה, ודוח שנתי שעוד לא הוכן
    await openTaxFile(page, TARGET === 'demo');
    let ov = await openProcess(page, 'intake');
    const legacy = ov.locator('[data-legacy-intake]');
    if (await legacy.count()) { await legacy.getByRole('button', { name: 'החלף בקליטה' }).click(); await ov.locator('.ty-ok').first().waitFor({ timeout: 15000 }).catch(() => {}); }
    const n = await prepareAndPublish(ov);
    ok(n > 0, `הכנה: פורסמו ${n} שאלות קליטה`);
    await closeProcess(page);
    await openProcess(page, 'annual', { year: 2025 });
    await closeProcess(page);
    await openPortalItem(page, 'השלמת פרטים לתיק המס');
    const part = await answerFlow(page, [['תעודת הזהות שלך', 'file']], { stopAfter: 2 });
    await page.locator('.ty-flow').getByRole('button', { name: 'שמירה ויציאה' }).click().catch(() => {});
    ok(part.length >= 2 && part.every(x => !x.err), `הכנה: הלקוח ענה על ${part.length} ויצא`, JSON.stringify(part));

    // הכניסה — כמו משתמש: «חשבון והגדרות» › «עבודת מס»
    await page.goto(env.officeUrlKeep(env.clientId), { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'חשבון והגדרות' }).click({ timeout: 30000 });
    await page.getByRole('button', { name: 'עבודת מס' }).first().click();
    await page.locator('[data-tax-work]').waitFor({ timeout: 30000 });
    ok(true, 'הכניסה: «חשבון והגדרות» › «עבודת מס» — העמוד נפתח');
    ok(await page.locator('.of-nav-item', { hasText: 'עבודת מס' }).count() > 0, 'ב«המשרד» — «עבודת מס» ראשון בתפריט העמודים');
    if (viewport === 'mobile') ok(await noHScroll(page), 'טלפון: «עבודת מס» בלי גלילה הצידה');
    const intakeRow = page.locator('[data-tw-row="intake"]', { hasText: who }).first();
    await intakeRow.waitFor({ timeout: 20000 });
    const it = await text(intakeRow);
    ok(it.includes('קליטה והשלמת תיק המס') && it.includes('חסר אצל הלקוח') && it.includes('ממתין לבדיקתך') && it.includes('לבדוק'),
      'קליטה: מצב, מה חסר, מה ממתין לבדיקתך, והפעולה הבאה', it.slice(0, 300));
    await intakeRow.locator('.tw-missing summary').click();
    ok((await intakeRow.locator('.tw-missing li').count()) > 0, '«מה חסר» — רשימת השאלות הפתוחות');
    const annualRow = page.locator('[data-tw-row="annual"]', { hasText: who }).first();
    ok((await text(annualRow)).includes('להכין שאלות'), 'דוח שנתי שלא הוכן — «להכין שאלות»', await text(annualRow));
    await page.locator('.tw-kind', { hasText: 'דוח שנתי' }).click();
    ok(!(await page.locator('[data-tw-row="intake"]', { hasText: who }).count()) && (await page.locator('[data-tw-row="annual"]', { hasText: who }).count()) > 0, 'סינון «דוח שנתי» — רק דוחות');
    await page.locator('.tw-kind', { hasText: 'הכול' }).click();
    await shot(page, `office-taxwork-${viewport}`);
    // פתיחה ישירה של התהליך
    await page.locator('[data-tw-row="intake"]', { hasText: who }).first().getByRole('button', { name: 'פתח את התהליך' }).click();
    const ovh = page.locator('.ty-overlay h2');
    await ovh.waitFor({ timeout: 20000 });
    ok((await text(ovh)).includes('קליטה והשלמת תיק המס'), '«פתח את התהליך» — אותו דף תהליך כמו מהתיק');
    await closeProcess(page);
    // מסמכים ותיק המס של הלקוח
    await page.locator('[data-tw-row="intake"]', { hasText: who }).first().getByRole('button', { name: 'מסמכים' }).click();
    await page.waitForTimeout(2500);
    // ‼ לשוניות הלקוח הן כפתורים (cw-tab), הפעילה מסומנת active; הכתובת — ‎/docs‎
    ok((await page.locator('button.cw-tab.active', { hasText: 'מסמכים' }).count()) > 0 && (await page.evaluate(() => location.hash)).endsWith('/docs'), '«מסמכים» — תיק הלקוח נפתח בלשונית המסמכים');
    await page.getByRole('button', { name: 'חשבון והגדרות' }).click();
    await page.getByRole('button', { name: 'עבודת מס' }).first().click();
    await page.locator('[data-tw-row="intake"]', { hasText: who }).first().getByRole('button', { name: 'תיק המס' }).click();
    await page.locator('[data-section="intake"]').waitFor({ timeout: 30000 }).catch(() => {});
    ok((await page.locator('[data-section="intake"]').count()) > 0, '«תיק המס» — תיק הלקוח נפתח בתיק המס');
  } finally { await ctx.close(); }
}

/** הקישור הישן אחרי «החלף בקליטה»: «הוחלף» והפניה לדף האישי; לשונית שכבר פתוחה — נחסמת בשרת; התשובות נשמרות. */
async function flowLegacyLink(viewport) {
  console.log(`\n▶ הקישור הישן לשאלון אחרי «החלף בקליטה» (${viewport})`);
  const { ctx, page } = await newPage(viewport);
  try {
    // המשרד פותח קליטה (בהדגמה — מאפס את המצב)
    await openTaxFile(page, TARGET === 'demo');
    // הלקוח פותח את הקישור הישן בלשונית משלו, וענה על שאלה אחת — לפני ההחלפה
    // staging: הלקוח בפרופיל דפדפן נפרד, בלי סשן המשרד. בהדגמה — אותו פרופיל (המסד המדומה יושב באחסון שלו)
    const C = TARGET === 'staging' ? await newPage(viewport, { client: true }) : null;
    const tab = C ? C.page : await ctx.newPage();
    await tab.goto(env.intakeUrl(), { waitUntil: 'domcontentloaded' });
    await tab.getByText('מה היה לך בשנת המס').first().waitFor({ timeout: 30000 });
    await tab.locator('button[aria-pressed]', { hasText: 'כשכיר' }).first().click();
    await tab.getByRole('button', { name: /^(המשך|נתחיל|סיום)/ }).first().click();
    await tab.waitForFunction(() => !document.body.innerText.includes('מה היה לך בשנת המס'), null, { timeout: 15000 }).catch(() => {});
    ok(!(await text(tab.locator('body'))).includes('מה היה לך בשנת המס'), 'לפני ההחלפה: השאלון הישן עובד — תשובה נשמרה ועבר לשאלה הבאה');
    // המשרד מחליף
    const ov = await openProcess(page, 'intake');
    const legacy = ov.locator('[data-legacy-intake]');
    ok(await legacy.count() > 0, 'השאלון הישן פתוח — המשרד רואה את הבחירה');
    if (await legacy.count()) { await legacy.getByRole('button', { name: 'החלף בקליטה' }).click(); await ov.locator('.ty-ok').first().waitFor({ timeout: 15000 }).catch(() => {}); }
    ok((await text(ov.locator('.ty-ok'))).includes('הוחלף'), '«החלף בקליטה» הצליח');
    // המסלול הפעיל: הקליטה מתפרסמת בדף האישי — לשם מפנה ההודעה בקישור הישן
    const nPub = await prepareAndPublish(ov);
    ok(nPub > 0, `הקליטה פורסמה בדף האישי (${nPub} שאלות)`);
    await closeProcess(page);
    // הלשונית שכבר פתוחה: עוד תשובה ⇒ השרת דוחה ⇒ «הוחלף»
    const btn = tab.locator('button[aria-pressed]').first();
    if (await btn.count()) await btn.click();
    const radio = tab.locator('input[type="radio"]');
    if (await radio.count()) await radio.first().check();
    const inputs = tab.locator('input.input');
    if (await inputs.count()) await inputs.first().fill('1');
    const yes = tab.getByRole('button', { name: /^כן$/ });
    if (await yes.count()) await yes.first().click();
    await tab.getByRole('button', { name: /^(המשך|נתחיל|סיום)/ }).first().click({ timeout: 10000 }).catch(() => {});
    await tab.locator('[data-intake-replaced]').waitFor({ timeout: 15000 }).catch(() => {});
    ok(await tab.locator('[data-intake-replaced]').count() > 0, 'לשונית שהייתה פתוחה: התשובה נדחתה בשרת ומוצג «השאלון הזה הוחלף»', (await text(tab.locator('body'))).slice(0, 200));
    // פתיחה מחדש של הקישור
    await tab.reload({ waitUntil: 'domcontentloaded' });
    await tab.locator('[data-intake-replaced]').waitFor({ timeout: 20000 }).catch(() => {});
    const rep = await text(tab.locator('[data-intake-replaced]'));
    ok(rep.includes('השאלון הזה הוחלף') && rep.includes('נשמר') && !(await tab.getByText('מה היה לך בשנת המס').count()), 'הקישור הישן: «הוחלף», «מה שכבר ענית נשמר», בלי שאלות', rep.slice(0, 200));
    if (viewport === 'mobile') ok(await noHScroll(tab), 'טלפון: מסך «הוחלף» בלי גלילה הצידה');
    await shot(tab, `legacy-replaced-${viewport}`);
    const link = tab.getByRole('link', { name: /לדף האישי/ });
    ok(await link.count() > 0 && (await link.getAttribute('href') ?? '').includes('portal='), '«לדף האישי ←» — הפניה למסלול הפעיל');
    if (await link.count()) {
      const href = await link.getAttribute('href');
      await tab.goto(TARGET === 'demo' ? `${href}&office-app` : href, { waitUntil: 'domcontentloaded' });
      await tab.waitForTimeout(3000);
      const portalTxt = await text(tab.locator('body'));
      ok(!portalTxt.includes('עדכון סטטוס מיסויי') && /שלום|השלמת פרטים/.test(portalTxt), 'הדף האישי נפתח — בלי השאלון הישן', portalTxt.slice(0, 200));
      // ומשם — לתהליך הפעיל: «השלמת פרטים לתיק המס» נפתחת עם השאלה הראשונה
      // אותה דרך כמו openPortalItem: הכרטיס עם «להשלמת המידע»
      const card = tab.locator('div', { has: tab.getByText('השלמת פרטים לתיק המס', { exact: true }) }).filter({ has: tab.getByRole('button', { name: 'להשלמת המידע' }) }).last();
      await card.getByRole('button', { name: 'להשלמת המידע' }).click({ timeout: 15000 }).catch(() => {});
      await tab.locator('.ty-flow').first().waitFor({ timeout: 20000 }).catch(() => {});
      ok((await tab.locator('.ty-flow .ty-q').count()) > 0, 'מהדף האישי — לתהליך הפעיל: «השלמת פרטים לתיק המס» נפתחת עם שאלה', (await text(tab.locator('body'))).slice(0, 200));
      if (viewport === 'mobile') ok(await noHScroll(tab), 'טלפון: התהליך הפעיל בלי גלילה הצידה');
    }
    if (TARGET === 'staging') {
      const kept = await env.sql(`select count(*)::int n from public.annual_report_answers a join public.annual_report_sessions s on s.id = a.session_id where s.client_id = '${env.clientId}'`);
      ok(kept[0].n >= 1, `התשובה שניתנה לפני ההחלפה נשמרה (${kept[0].n})`);
    }
    if (!C) await tab.close();
    // שאלון ישן שלא הוחלף (לקוח אחר) — ממשיך לעבוד כרגיל
    if (env.intakeUrlOther) {
      const other = await (C ? C.ctx : ctx).newPage();
      await other.goto(env.intakeUrlOther(), { waitUntil: 'domcontentloaded' });
      await other.getByText('מה היה לך בשנת המס').first().waitFor({ timeout: 30000 }).catch(() => {});
      await other.locator('button[aria-pressed]', { hasText: 'כשכיר' }).first().click().catch(() => {});
      await other.getByRole('button', { name: /^(המשך|נתחיל|סיום)/ }).first().click().catch(() => {});
      await other.waitForFunction(() => !document.body.innerText.includes('מה היה לך בשנת המס'), null, { timeout: 15000 }).catch(() => {});
      const ot = await text(other.locator('body'));
      ok(!ot.includes('מה היה לך בשנת המס') && !ot.includes('השאלון הזה הוחלף'), 'שאלון ישן שלא הוחלף (לקוח אחר) — נפתח, שומר ועובר לשאלה הבאה', ot.slice(0, 160));
      await other.close();
    } else console.log('  (הדגמה: אין לקוח שני עם שאלון ישן — נבדק ב-staging ובבידוד)');
    if (C) await C.ctx.close();
  } finally { await ctx.close(); }
}

async function flowIsolation() {
  console.log('\n▶ בידוד ומניעת כפילויות');
  const { ctx, page } = await newPage('desktop');
  await openTaxFile(page);
  // ‼ בלי 236 (staging לפני האישור) — הבדיקה על הדוח השנתי; עם 236 — גם על הקליטה
  const which = ONLY.has('intake') ? 'intake' : 'annual';
  const ov = await openProcess(page, which, { year: 2025 });
  const h = await text(ov.locator('h2'));
  const sub = await text(ov.locator('.ty-sub'));
  await closeProcess(page);
  await openProcess(page, which, { year: 2025 });
  ok((await text(page.locator('.ty-overlay h2'))) === h && (await text(page.locator('.ty-overlay .ty-sub'))) === sub, `«התחל/פתח» שוב — אותה בקשה (${which === 'intake' ? 'קליטה אחת ללקוח' : 'דוח אחד לשנה'})`);
  await closeProcess(page);
  if (env.otherClientId) {
    await page.goto(env.officeUrlKeep(env.otherClientId), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-section="intake"]', { timeout: 30000 });
    const t = await text(page.locator('[data-section="intake"]'));
    ok(!t.includes('ממתין ללקוח') && !t.includes('יש תשובות לבדוק'), 'לקוח אחר: אין לו את הקליטה של הלקוח הראשון', t);
  }
  await ctx.close();
}

// ── הרצה ─────────────────────────────────────────────────────────────────────
try {
  console.log(`יעד: ${TARGET} · ${BASE}`);
  for (const vp of arg('vp', 'desktop,mobile').split(',')) {
    if (ONLY.has('intake')) await flowIntake(vp).catch(e => ok(false, `קליטה (${vp}) נעצרה`, e.stack ?? e));
    if (ONLY.has('annual')) await flowAnnual(vp).catch(e => ok(false, `דוח שנתי (${vp}) נעצר`, e.stack ?? e));
    if (ONLY.has('wealth') || ONLY.has('followup')) await flowWealthBoth(vp, ONLY);
    if (ONLY.has('office')) await flowOffice(vp).catch(e => ok(false, `עבודת מס (${vp}) נעצרה`, e.stack ?? e));
    if (ONLY.has('legacy')) await flowLegacyLink(vp).catch(e => ok(false, `הקישור הישן (${vp}) נעצר`, e.stack ?? e));
  }
  if (ONLY.has('isolation')) await flowIsolation().catch(e => ok(false, 'בידוד נעצר', e.stack ?? e));
  ok(blocked.length === 0, `אין פנייה לשרת חוץ או לייצור (${blocked.length})`, blocked.slice(0, 5).join(' | '));
  ok(consoleErrors.length === 0, `אין שגיאות בדפדפן (${consoleErrors.length})`, [...consoleErrors.slice(0, 3), ...httpErrors.slice(0, 5)].join(' | '));
  if (httpErrors.length) console.log('  בקשות שנכשלו:', [...new Set(httpErrors)].slice(0, 12).join('\n    '));
} finally {
  const cl = await env.cleanup().catch(e => ({ error: String(e) }));
  if (TARGET === 'staging') ok(!cl.error && cl.left === 0, `ניקוי staging: אין שאריות (${JSON.stringify(cl)})`);
  await browser.close();
  if (SHOTS) writeFileSync(join(SHOTS, 'results.json'), JSON.stringify({ target: TARGET, base: BASE, pass, fail, results, consoleErrors, httpErrors, blocked }, null, 2));
  console.log(`\n${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
}
