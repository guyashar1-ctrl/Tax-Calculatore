#!/usr/bin/env node
/**
 * work-as-request.mjs — «כל עבודה היא בקשה» (16.10.2026): בדיקת דפדפן של המסלול המלא, במחשב ובטלפון.
 *
 * ‼ 21.10.2026 · מוחלף בחלקו: «השלם עם הלקוח» ו«זהות ורשויות» ירדו מתיק המס (אין יותר «קליטה» כעבודה נפרדת —
 *   הכרטיס מושלם בשאלון ההערכה/הדוח). שלבים 1–2 כאן נכשלים במכוון; המסלול הנוכחי: annual-v2.mjs, annual-purge.mjs.
 *
 *   תיק המס (שורת מצב אחת · «השלם עם הלקוח» · «זהות ורשויות») → שורת הקליטה ב«בקשות» נפתחת במקום, עם העבודה בתוכה
 *   → (254) השאלון כבר אצל הלקוח — בלי «הוסף שאלות» ובלי «פרסם», **בלי מייל**; שורה אחת (בלי «↳ השלמת מידע»), שבב מצב
 *   ושלושת הצעדים בשורה → הלקוח עונה בדף האישי → קישור ישיר לשורה (‎#/client/<id>/journey/<stepId>‎; קישור לבן נוחת בהורה)
 *   → בדיקת משרד (אישור, «החזר ללקוח») → אישור לתיק («עדכן בתיק») → עץ השאלון → הסרה דרך ⋯ של השורה.
 *   גם: הספרייה כעמוד אחד (בקשות / מסמכים / פגישות כמקטעים).
 *
 *   node scripts/e2e/work-as-request.mjs --target=demo [--base=http://localhost:5302] [--widths=1280,390,360] [--shots=<dir>]
 *   node scripts/e2e/work-as-request.mjs --target=staging --base=http://localhost:4746   (בנייה --mode staging שמוגשת מקומית)
 *
 * ‼ playwright-core — התלות של העובד (worker/node_modules), לא תלות חדשה. נתיב אחר: PW_CORE=<.../package.json>.
 * ‼ כל בקשה לייצור (uoweoqtuiettozagwgdw) נחסמת ומכשילה את הבדיקה. ב-staging מותר רק המארח של staging; בסוף — ניקוי וסריקת שאריות.
 * ‼ «פרסם בדף» אינו מייל: ב-staging נבדק שאין שורה ב-email_messages ללקוח הבדיקה.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d);
const TARGET = arg('target', 'demo');
const BASE = arg('base', TARGET === 'demo' ? 'http://localhost:5302' : 'http://localhost:4746');
const WIDTHS = arg('widths', '1280,390,360').split(',').map(Number);
/** מצב כהה (prefers-color-scheme: dark) — תיק המס, שורת הבקשה והספרייה, בכל רוחב. */
const DARK = !process.argv.includes('--no-dark');
/** staging: להשאיר את לקוח הבדיקה (עם עובדה מאושרת) לבדיקה של סשן אחר; הלקוח השני נמחק. */
const KEEP = process.argv.includes('--keep');
const SHOTS = arg('shots', '');
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PW = process.env.PW_CORE ?? 'C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json';
const { chromium } = createRequire(PW)('playwright-core');
const PROD = 'uoweoqtuiettozagwgdw';
const STAGING = 'evdfxjqrkgugssfrdoxd';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

// ‼ 16.10.2026 · staging: רוחב אחד לכל לקוח בדיקה. המסלול משנה את מצב הלקוח (עונה, מאשר, מסיר ומשחזר) — הרצה של
//   כמה רוחבות על אותו לקוח התחילה את ה-390/360 ממצב «הכול כבר נענה» ונכשלה. לכן כל רוחב — תהליך נפרד עם לקוח חדש.
if (TARGET === 'staging' && WIDTHS.length > 1 && !process.env.WAR_CHILD) {
  let failed = 0;
  for (const w of WIDTHS) {
    const args = process.argv.slice(2).filter(a => !a.startsWith('--widths=') && !a.startsWith('--shots='));
    if (SHOTS) args.push(`--shots=${join(SHOTS, String(w))}`);
    console.log(`
══ staging · ${w}px · לקוח בדיקה חדש ══`);
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args, `--widths=${w}`], { stdio: 'inherit', env: { ...process.env, WAR_CHILD: '1' } });
    if (r.status !== 0) failed++;
  }
  console.log(`
staging: ${WIDTHS.length - failed}/${WIDTHS.length} רוחבות עברו`);
  process.exit(failed ? 1 : 0);
}

let pass = 0, fail = 0;
const results = [];
const ok = (c, m, info = '') => { c ? pass++ : fail++; results.push({ ok: !!c, m, info: c ? '' : String(info).slice(0, 400) }); console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(info).slice(0, 400)}` : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const env = TARGET === 'staging' ? await (await import('./staging-session.mjs')).prepare() : {
  officeUrl: (clientId, tab = 'taxfile') => `${BASE}/?office-app&fresh-taxyear#/client/${clientId}/${tab}`,
  officeUrlKeep: (clientId, tab = 'taxfile') => `${BASE}/?office-app#/client/${clientId}/${tab}`,
  portalUrl: () => `${BASE}/?portal=demo&office-app`,
  libraryUrl: () => `${BASE}/?office-app#/firm/library`,
  clientId: 'sample-1', clientName: 'דוד', spouseName: 'רחל',
  initContext: async () => {}, cleanup: async () => ({ left: 0 }), emailsFor: async () => 0,
};
if (TARGET === 'staging') {
  // «פרסם בדף» אינו מייל — סופרים שורות ביומן המיילים של לקוח הבדיקה; הספרייה — של משתמש הבדיקה ב-staging
  env.emailsFor = async () => (await env.sql(`select count(*)::int n from public.email_messages where client_id = '${env.clientId}'`))[0]?.n ?? -1;
  env.libraryUrl = () => `${BASE}/#/firm/library`;
}
const keepUrl = (tail) => (env.officeUrlKeep ? env.officeUrlKeep(env.clientId, tail) : `${BASE}/#/client/${env.clientId}/${tail}`);

const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--headless=new', '--js-flags=--max-old-space-size=4096', '--disable-dev-shm-usage', '--disable-gpu'] });
const consoleErrors = [];
const blocked = [];
async function newCtx(width, { client = false, dark = false } = {}) {
  const mobile = width < 700;
  const ctx = await browser.newContext({ colorScheme: dark ? 'dark' : 'light',
    viewport: { width, height: mobile ? 800 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'he-IL',
    permissions: ['clipboard-read', 'clipboard-write'],
  });
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
    p.on('console', m => { if (m.type() === 'error' && !/favicon|ResizeObserver|Failed to load resource: net::ERR_FAILED/.test(m.text())) consoleErrors.push(`${width}: ${(m.args().length > 1 ? m.text() : m.text()).slice(0, 240)}`); if (process.env.E2E_DEBUG && /same key/.test(m.text())) console.log('    [dupkey]', m.text().slice(0, 1500)); });
    p.on('pageerror', e => consoleErrors.push(`${width} pageerror: ${String(e).slice(0, 240)}`));
  };
  // ‼ לשונית חדשה לכל ניווט (אותו פרופיל — המסד המדומה באחסון המקומי נשמר): שרת הפיתוח טוען אלפי מודולים,
  //   והכרום ללא-ראש קרס בסוף שאלון בלשונית אחת שהצטבר בה זיכרון («Target crashed») — כמו ב-collection-flows.mjs.
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
/**
 * צילום. marks — [בורר, תווית]: הראשון נגלל למרכז, ומיקומי כולם (ביחס לחלון) נשמרים ב-<name>.json — למספרים במדריך החזותי.
 */
const shot = async (page, name, full = false, marks = []) => {
  if (!SHOTS) return;
  if (marks.length) await page.locator(marks[0][0]).first().evaluate(e => e.scrollIntoView({ block: 'center' })).catch(() => {});
  if (marks.length) await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: full }).catch(() => {});
  if (!marks.length) return;
  const vp = page.viewportSize();
  const boxes = [];
  for (const [sel, label] of marks) { const b = await page.locator(sel).first().boundingBox().catch(() => null); if (b) boxes.push({ label, x: b.x / vp.width, y: b.y / vp.height, w: b.width / vp.width, h: b.height / vp.height }); }
  writeFileSync(join(SHOTS, `${name}.json`), JSON.stringify({ vp, boxes }));
};
const shotEl = async (loc, name) => { if (SHOTS) await loc.screenshot({ path: join(SHOTS, `${name}.png`) }).catch(() => {}); };
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const text = async (loc) => ((await loc.count().catch(() => 0)) ? loc.first().innerText({ timeout: 5000 }).catch(() => '') : '');
async function waitIdle(scope) { await scope.page().waitForTimeout(250); await scope.locator('button[disabled]').first().waitFor({ state: 'detached', timeout: 10000 }).catch(() => {}); await scope.page().waitForTimeout(350); }
async function go(page, url) { await page.goto(url, { waitUntil: 'domcontentloaded' }); }

// ── «בקשות»: השורה של העבודה ───────────────────────────────────────────────────
const workRow = (page, name) => page.locator('.rl-row', { has: page.locator('.rl-name', { hasText: name }) }).first();
async function inlineOf(page, name) {
  const row = workRow(page, name);
  await row.waitFor({ timeout: 30000 });
  if (!(await row.locator('[data-ty-inline]').count())) await row.locator('.rl-hit').first().click();
  await row.locator('[data-ty-inline] .ty-label, [data-ty-inline] .ty-note').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);
  return row.locator('[data-ty-inline]').first();
}
const nowBox = (w) => w.locator('.ty-now');
async function goLater(w, kind) {
  const label = kind === 'ask' ? 'להכין עכשיו' : kind === 'publish' ? 'לפרסם עכשיו' : 'להשלים עכשיו';
  const b = w.locator('.ty-later').getByRole('button', { name: label });
  if (await b.count()) { await b.first().click(); await waitIdle(w); return true; }
  return false;
}
async function prepareAndPublish(w, { viaPage = false } = {}) {
  let box = nowBox(w);
  await box.waitFor({ timeout: 20000 }).catch(() => {});
  if (!/שאלות? ל|שאלה אחת ל/.test(await text(box))) await goLater(w, 'ask');
  box = nowBox(w);
  const add = box.getByRole('button', { name: /^הוסף .*לבקשה «השלמת מידע»$/ });
  // ‼ עבודה שנפתחה עם טיוטת שאלות (AddTaxWorkDialog) — אין «הוסף», ישר «מוכן לדף האישי: N שאלות»
  let n;
  if (await add.count()) { n = Number(((await text(add)).match(/d+/) ?? ['1'])[0]); await add.click(); await waitIdle(w); }
  else if (await nowBox(w).locator('[data-ty-publish]').count() || await w.locator('.ty-later').getByRole('button', { name: 'לפרסם עכשיו' }).count()) {
    if (!(await nowBox(w).locator('[data-ty-publish]').count())) await goLater(w, 'publish');
    n = Number(((await text(nowBox(w).locator('h3'))).match(/(\d+)\s*שאל/) ?? [0, '1'])[1]);
  } else return { n: 0, flash: '' };
  // ‼ מול שרת אמיתי הפאנל מתחלף אחרי הטעינה מחדש — ממתינים לכפתור, לא קוראים מיד
  if (viaPage) {
    // ‼ 249: «פרסם בדף» בכרטיס «הדף של …» — אותו נתיב שרת של «פרסם את השאלות בדף» (publish_tax_info)
    const pageBtn = w.page().locator('button', { hasText: /^פרסם בדף$/ }).first();
    await pageBtn.waitFor({ timeout: 20000 }).catch(() => {});
    if (await pageBtn.count()) {
      await pageBtn.click();
      // ‼ חלון הבחירה: רק «רק לפרסם» — לעולם לא «לפרסם ולשלוח מייל»
      const onlyPublish = w.page().locator('button, [role=button]', { hasText: /^רק לפרסם/ }).first();
      await onlyPublish.waitFor({ timeout: 8000 }).catch(() => {});
      if (await onlyPublish.count()) await onlyPublish.click();
      await w.page().waitForTimeout(3500);
    }
    return { n, label: 'פרסם בדף (כרטיס הדף)', flash: '', pagePublished: true, viaPage: true, err: await text(w.locator('.ty-err')) };
  }
  let pub = nowBox(w).locator('[data-ty-publish]');
  await pub.first().waitFor({ timeout: 20000 }).catch(() => {});
  if (!(await pub.count())) { await goLater(w, 'publish'); pub = nowBox(w).locator('[data-ty-publish]'); await pub.first().waitFor({ timeout: 20000 }).catch(() => {}); }
  const label = (await text(pub)).trim();
  await pub.click();
  await w.locator('.ty-ok', { hasText: /פורסם|נשמר כמפורסם/ }).first().waitFor({ timeout: 20000 }).catch(() => {});
  // ‼ מול שרת אמיתי הלחיצה נפלה פעם על רינדור מחדש (הכפתור התחלף) — ניסיון אחד נוסף, רק אם הפאנל עדיין מציע פרסום
  if (!/פורסם|נשמר כמפורסם/.test(await text(w.locator('.ty-ok'))) && await nowBox(w).locator('[data-ty-publish]').count()) {
    await nowBox(w).locator('[data-ty-publish]').click();
    await w.locator('.ty-ok', { hasText: /פורסם|נשמר כמפורסם/ }).first().waitFor({ timeout: 20000 }).catch(() => {});
  }
  const flash = await text(w.locator('.ty-ok'));
  // ‼ שער הדף (clientPageGate): לקוח שהדף שלו עוד לא פורסם — השאלות נשמרות כמפורסמות, ומופיעות אחרי «פרסם בדף»
  //   בכרטיס «הדף של …» (גם הוא בלי מייל: «הפרסום לא שולח מייל»).
  let pagePublished = false;
  if (/נשמר כמפורסם/.test(flash)) {
    const pageBtn = w.page().locator('button', { hasText: /^פרסם בדף$/ }).first();
    if (await pageBtn.count()) { await pageBtn.click(); await w.page().waitForTimeout(2500); pagePublished = true; }
  }
  return { n, label, flash, pagePublished, err: await text(w.locator('.ty-err')) };
}

// ── הלקוח ───────────────────────────────────────────────────────────────────
async function openPortalItem(page, label) {
  await go(page, env.portalUrl());
  await page.waitForFunction((l) => document.body.innerText.includes(l), label, { timeout: 30000 });
  const card = page.locator('.pp-item', { has: page.getByText(label, { exact: true }) }).first();
  await card.getByRole('button', { name: /^(להשלמת המידע|להעלאת המסמכים)$/ }).click();
  await page.waitForSelector('.ty-flow', { timeout: 15000 });
  return { card, flow: page.locator('.ty-flow') };
}
// ‼ תמונה קטנה ותקינה (PNG) — PDF מזויף הפיל את הכרום ללא-ראש בעיבוד המסמך בדף
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/D/Ft6HmVAAAAAElFTkSuQmCC', 'base64');
/** אותו מנגנון כמו collection-flows.mjs: כלל לפי מילה בכותרת, אחרת ברירת מחדל לפי סוג השאלה. */
async function answerFlow(page, rules) {
  const log = [];
  for (let step = 0; step < 70; step++) {
    const flow = page.locator('.ty-flow');
    if (await flow.locator('.ty-q', { hasText: /תודה!|התשובות נשלחו למשרד/ }).count()) { log.push({ done: true }); break; }
    const title = (await text(flow.locator('.ty-q').first())).trim();
    if (await flow.locator('.ty-done-mark').count()) { await flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).click(); await sleep(300); continue; }
    // ‼ שאלות עם שדות ייעודיים — כללים קבועים בכל סבב (חשבון בנק, פרטי עסק)
    const rule = [...rules, ['להעביר החזר', 'bankForeign'], ['באיזו שנה', 'year'], ['פרטי העסק', 'bizRecord'], ['היה בבעלותכם', 'periodYes'], ['היה קיים', 'periodYes']].find(r => title.includes(r[0]));
    if (rule?.[1] === 'stop') { log.push({ title, act: 'stop' }); break; }
    if (process.env.E2E_DEBUG) console.log('    [q]', title.slice(0, 60));
    const firstChoice = (await text(flow.locator('.ty-choice').first())).trim();
    // ‼ 19.10.2026 · מסך רשת (גם בדוח השנתי): כלל «tiles:מפתח,מפתח» — מסמנים אותם; בלי כלל — «אין לנו אף אחד מאלה»
    const act = rule ? rule[1]
      : (await flow.locator('.ty-tile[data-tile="none"]').count()) ? 'tiles:none'
      : (await flow.locator('input[type="file"]').count()) ? 'unavailable'
      : (await flow.getByRole('button', { name: 'כן, הכול נכון' }).count()) ? 'confirm'
      : (await flow.locator('input[type="number"]').count()) ? 'amount:0'
      : (await flow.locator('.ty-choice', { hasText: /^לא$/ }).count()) ? 'no'
      : (await flow.locator('textarea').count()) ? 'text:בדיקה'
      : firstChoice ? `choice:${firstChoice}` : 'no';
    const [kind, val] = act.split(/:(.*)/s);
    if (kind === 'confirm') await flow.getByRole('button', { name: 'כן, הכול נכון' }).click();
    else if (kind === 'tiles') { for (const k of val.split(',')) { await flow.locator(`.ty-tile[data-tile="${k}"]`).first().click(); await page.waitForTimeout(120); } }
    else if (kind === 'yes') await flow.locator('.ty-choice', { hasText: /^כן$/ }).click();
    else if (kind === 'no') await flow.locator('.ty-choice', { hasText: /^לא$/ }).first().click();
    else if (kind === 'who') { const map = { none: /^לא$/, both: 'כן — שנינו', client: `כן — ${env.clientName}`, spouse: `כן — ${env.spouseName}` }; await flow.locator('.ty-choice', { hasText: map[val] }).first().click(); }
    else if (kind === 'amount') await flow.locator('input[type="number"]').fill(val);
    else if (kind === 'text') await flow.locator('textarea').fill(val);
    else if (kind === 'choice') await flow.locator('.ty-choice', { hasText: val }).first().click();
    else if (kind === 'bankForeign') {
      // חשבון בנק: שדות ייעודיים (לא טקסט חופשי) — «חשבון בחו״ל», כדי לא לתלות את הבדיקה ברשימת הסניפים
      await flow.locator('button', { hasText: 'חשבון בחו״ל' }).first().click();
      await flow.getByLabel('מדינה').fill('ארה״ב'); await flow.getByLabel('שם הבנק').fill('Chase'); await flow.getByLabel('IBAN או מספר חשבון').fill('US00TEST');
      await flow.locator('[role=radiogroup], [role=group]', { hasText: 'על שם מי החשבון' }).locator('button').first().click();
    }
    else if (kind === 'year') await flow.getByLabel('שנה').fill('2015');
    else if (kind === 'periodYes') await flow.locator('button', { hasText: /^כן — / }).first().click();
    else if (kind === 'bizRecord') {
      // פרטי העסק: שדות ייעודיים (שם, תחום, איך רשום) — לא טקסט חופשי
      await flow.getByLabel('שם העסק').fill('בדיקה QA'); await flow.getByLabel('במה העסק עוסק').fill('ייעוץ');
      const kindBtn = flow.locator('button', { hasText: 'עוסק מורשה' }).first(); if ((await kindBtn.getAttribute('aria-pressed')) !== 'true') await kindBtn.click().catch(() => {});
    }
    else if (kind === 'unavailable') { await flow.locator('.ty-choice', { hasText: 'עוד לא קיבלתי את המסמך' }).first().click(); await flow.locator('.ty-field input').fill('מהמעסיק').catch(() => {}); }
    else if (kind === 'file') {
      // ‼ פעם אחת בלבד לכל שאלה: «קובץ אחד שמכיל הכול», העלאה ואישור. לא התקדם — «עוד לא קיבלתי» (בלי לולאה)
      if (!log.some(x => x.title === title && x.act === 'file')) {
        const single = flow.getByRole('button', { name: 'יש לי קובץ אחד שמכיל הכול' });
        if (await single.count()) { await single.first().click(); await page.waitForTimeout(300); }
        await flow.locator('input[type="file"]').first().setInputFiles({ name: 'id.png', mimeType: 'image/png', buffer: PNG });
        await page.waitForTimeout(800);
        const confirm = flow.locator('[data-testid=dp-confirm]');
        if (await confirm.count() && await confirm.first().isEnabled()) await confirm.first().click().catch(() => {});
        await page.waitForFunction((t) => !document.querySelector('.ty-flow .ty-q')?.textContent?.includes(t) || !!document.querySelector('.ty-flow .ty-err'), title, { timeout: 20000 }).catch(() => {});
        log.push({ title, act, err: await text(flow.locator('.ty-err')) }); continue;
      }
      await flow.locator('.ty-choice', { hasText: 'עוד לא קיבלתי את המסמך' }).first().click();
      log.push({ title, act: 'unavailable(after file)' });
    }
    log.push({ title, act });
    // ‼ «כן, הכול נכון» במסך האישור המקובץ כבר שולח ומתקדם — לחיצה נוספת על «הבא» נופלת על המסך הבא (מסך הרשת) בלי תשובה
    if (kind === 'confirm') { await page.waitForFunction((t) => (document.querySelector('.ty-flow .ty-q')?.textContent ?? '') !== t, title, { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(250); continue; }
    await flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).click();
    await page.waitForFunction((t) => { const q = document.querySelector('.ty-flow .ty-q')?.textContent ?? ''; return q !== t || !!document.querySelector('.ty-flow .ty-err'); }, title, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(250);
    const err = await text(flow.locator('.ty-err'));
    if (err) { log[log.length - 1].err = err; break; }
  }
  return log;
}

// ── המסלול ───────────────────────────────────────────────────────────────────
async function run(width) {
  const tag = `${width}`;
  console.log(`\n▶ «כל עבודה היא בקשה» — ${width}px`);
  const { ctx, page } = await newCtx(width);
  try {
    // 1 · תיק המס — משפט אחד
    await go(page, env.officeUrl(env.clientId));
    await page.waitForSelector('[data-rp-status]', { timeout: 40000 });
    const status = (await text(page.locator('[data-rp-status]'))).replace(/\s+/g, ' ');
    ok(/(חסר|חסרים)/.test(status) && /לאישור/.test(status) && /מהרשויות/.test(status), `[${tag}] תיק המס מתחיל בשורת מצב אחת: «${status}»`);
    ok(await page.locator('.rp-grid, .rp-cell').count() === 0, `[${tag}] ארבעת המונים וההסבר הארוך ירדו`);
    // ‼ סבב 2 (גיא): שורת המצב היא הכותרת של «זהות ורשויות» — לא שתי כותרות. שני כפתורים זה לצד זה.
    const top = page.locator('[data-tax-file-top]');
    ok((await text(top.locator('.rp-title'))).trim() === 'זהות ורשויות' && await page.locator('.txf-secthead', { hasText: /זהות ורשויות|^פרטי הנישום|^פרטי העסק|^מול הרשויות/ }).count() === 0,
      `[${tag}] כותרת אחת «זהות ורשויות» — שורת המצב בתוכה, בלי כותרת שנייה מתחת`);
    const b1 = await top.locator('[data-intake-open]').boundingBox(), b2 = await top.locator('[data-run-alignment]').boundingBox();
    ok(!!b1 && !!b2 && Math.abs(b1.y - b2.y) < 6 && (await text(top.locator('[data-intake-open]'))).includes('השלם עם הלקוח') && (await text(top.locator('[data-run-alignment]'))).includes('יישור קו'),
      `[${tag}] «השלם עם הלקוח» ו«בצע יישור קו» — זה לצד זה`);
    ok(await top.locator('.btn-primary').count() === 1, `[${tag}] כפתור ראשי אחד («השלם עם הלקוח»); «תצוגה מפורטת» — קישור משני`);
    ok(await page.locator('.txf-blank button').count() === 0, `[${tag}] אין כפתור יישור קו שני ברשויות`);
    ok(await page.locator('.txf-row, [data-row-id="identity"], .txf-trow').filter({ hasText: 'פרטים אישיים' }).count() > 0 || (await text(page.locator('.txf-root'))).includes('פרטים אישיים'), `[${tag}] «פרטים אישיים» — שורה מקופלת`);
    if (width < 700) ok(await noHScroll(page), `[${tag}] טלפון: תיק המס בלי גלילה הצידה`);
    await shot(page, `01-taxfile-${tag}`, false, [['[data-tax-file-top]', 'שורת המצב'], ['[data-intake-open]', 'השלם עם הלקוח'], ['[data-run-alignment]', 'בצע יישור קו']]);
    await shotEl(page.locator('[data-tax-file-top]'), `01b-taxfile-top-${tag}`);

    // 2 · «השלם עם הלקוח» → שורת הקליטה ב«בקשות», פתוחה, עם העבודה בתוכה
    await page.locator('[data-intake-open]').click();
    const row = workRow(page, 'קליטה והשלמת תיק המס');
    await row.locator('[data-ty-inline]').waitFor({ timeout: 30000 });
    ok(true, `[${tag}] «השלם עם הלקוח» נחת בשורת הקליטה ב«בקשות», והעבודה נפתחה בתוך השורה`);
    ok(await page.locator('.ty-overlay').count() === 0, `[${tag}] אין מסך תהליך שלישי (אין שכבה על כל המסך)`);
    const stepId = ((await row.getAttribute('id')) ?? '').replace('ob-step-', '');
    ok(!!stepId, `[${tag}] לשורה יש מזהה בקשה`, stepId);
    let w = row.locator('[data-ty-inline]');
    await w.locator('.ty-label').first().waitFor({ timeout: 20000 });
    // שאלון ישן פתוח — «החלף בקליטה» (כמו קודם, עכשיו בתוך השורה)
    const legacy = w.locator('[data-legacy-intake]');
    await legacy.waitFor({ timeout: 6000 }).catch(() => {});
    if (await legacy.count()) {
      await legacy.getByRole('button', { name: 'החלף בקליטה' }).click(); await waitIdle(w);
      ok(/הוחלף/.test(await text(w.locator('.ty-ok'))), `[${tag}] שאלון ישן — «החלף בקליטה» מתוך השורה`);
    }
    if (width < 700) ok(await noHScroll(page), `[${tag}] טלפון: השורה הפתוחה בלי גלילה הצידה`);
    await shot(page, `02-request-row-open-${tag}`, false, [[`#ob-step-${stepId} .rl-line`, 'שורת הבקשה'], [`#ob-step-${stepId} .ty-inline-head`, 'העבודה בתוך השורה']]);

    // 3 · 254 · ההיכרות נשלחת לבד: אין «הוסף שאלות» ואין «פרסם» — השאלון כבר בדף של הלקוח, בלי מייל
    await page.waitForFunction(sel => { const el = document.querySelector(sel); return !!el && /ממתין ל|לבדוק את מה ש|ממתין לפרסום/.test(el.innerText); }, `#ob-step-${stepId} .ty-now`, { timeout: 45000 }).catch(() => {});
    const nowTxt = (await text(nowBox(w))).replace(/\s+/g, ' ');
    const laterTxt = (await text(w.locator('.ty-later'))).replace(/\s+/g, ' ');
    ok(/ממתין ל/.test(nowTxt) || (/להשלים במשרד/.test(nowTxt) && /ממתין ל/.test(laterTxt)), `[${tag}] 254 · בלי «הוסף שאלות» ובלי «פרסם»: «${nowTxt.slice(0, 40)}…» ו«ממתין ל${env.clientName}»`, nowTxt.slice(0, 200) + ' | ' + laterTxt.slice(0, 120));
    ok(await w.locator('[data-ty-publish]').count() === 0 && await w.getByRole('button', { name: /^הוסף .*לבקשה «השלמת מידע»$/ }).count() === 0, `[${tag}] אין כפתור «פרסם» ואין «הוסף שאלות» בשורת הקליטה`);
    ok(await page.locator('.rl-name', { hasText: /^↳/ }).count() === 0 && await page.locator('.rl-name', { hasText: 'השלמת פרטים לתיק המס' }).count() === 0, `[${tag}] שורה אחת: אין שורת «↳ השלמת פרטים לתיק המס»`);
    const rs = row.locator('[data-request-steps]');
    const rsTxt = (await text(rs)).replace(/\s+/g, ' ');
    // ‼ 19.10.2026 (261): יישור קו אינו צעד בבקשה — כלי בתיק המס. בשורה שני צעדים: תשובות הלקוח · לתיק
    ok(await rs.locator('[data-rs-step]').count() === 2 && /תשובות הלקוח/.test(rsTxt) && !/יישור קו ברשויות/.test(rsTxt) && /לתיק/.test(rsTxt), `[${tag}] שני הצעדים בשורה: תשובות הלקוח · לתיק (בלי יישור קו)`, rsTxt.slice(0, 200));
    ok(/ממתין לאישורך/.test(rsTxt), `[${tag}] הצעד «לתיק» — «ייכנס כ«ממתין לאישורך»»`, rsTxt.slice(0, 200));
    let chip = (await text(row.locator('.rl-line .rl-state'))).replace(/\s+/g, ' ').trim();
    if (/ממתין לפרסום/.test(chip)) {
      // שער הדף (clientPageGate): לקוח שהדף שלו עוד לא פורסם — «פרסם בדף» בכרטיס «הדף של …», רק לפרסם (בלי מייל)
      const pageBtn = page.locator('button', { hasText: /^פרסם בדף$/ }).first();
      if (await pageBtn.count()) { await pageBtn.click(); const only = page.locator('button, [role=button]', { hasText: /^רק לפרסם/ }).first(); await only.waitFor({ timeout: 8000 }).catch(() => {}); if (await only.count()) await only.click(); await page.waitForTimeout(3000); }
      chip = (await text(row.locator('.rl-line .rl-state'))).replace(/\s+/g, ' ').trim();
      ok(true, `[${tag}] הדף טרם פורסם — «פרסם בדף» (רק לפרסם) בכרטיס הדף`);
    }
    ok(/אצל .+ · 0 מתוך \d+/.test(chip), `[${tag}] שבב המצב בשורה הסגורה: «${chip}»`);
    const askedN = Number((chip.match(/מתוך (\d+)/) ?? [0, '0'])[1]);
    ok(askedN > 0, `[${tag}] ${askedN} שאלות בדף של הלקוח — בלי פעולה של המשרד`);
    if (TARGET === 'staging') {
      const c = (await env.sql(`select count(*) filter (where state = 'draft')::int d, count(*) filter (where state = 'published')::int p from public.tax_info_asks where client_id = '${env.clientId}'`))[0];
      ok(c.d === 0 && c.p === askedN, `[${tag}] staging: ${c.p} שאלות מפורסמות, ${c.d} בטיוטה — ensure_tax_file_intake (254) פרסמה בעצמה`, JSON.stringify(c));
      const hist = (await env.sql(`select payload->'history' h from public.onboarding_steps where id = '${stepId}'`))[0]?.h ?? [];
      ok(hist.some(x => x.what === 'questions_published'), `[${tag}] staging: בהיסטוריית הבקשה «השאלות פורסמו»`, JSON.stringify(hist).slice(0, 200));
    }
    const mails = await env.emailsFor?.();
    if (TARGET === 'staging') ok(mails === 0, `[${tag}] staging: אין שורה ב-email_messages ללקוח (${mails})`);
    await shot(page, `03-published-${tag}`, false, [[`#ob-step-${stepId} [data-request-steps]`, 'שלושת הצעדים בשורה'], [`#ob-step-${stepId} .rl-state`, 'שבב המצב'], [`#ob-step-${stepId} .ty-now`, 'ממתין ללקוח — בלי «הוסף»/«פרסם»']]);
    // השורה הסגורה: הצעדים גלויים גם בלי לפתוח
    await row.locator('.rl-chev').click(); await page.waitForTimeout(400);
    ok(await row.locator('[data-ty-inline]').count() === 0 && await row.locator('[data-request-steps]').count() === 1, `[${tag}] בשורה סגורה: שלושת הצעדים גלויים, העבודה מקופלת`);
    await shot(page, `03b-closed-row-${tag}`, false, [[`#ob-step-${stepId}`, 'השורה הסגורה עם שלושת הצעדים']]);
    await row.locator('.rl-chev').click(); await page.waitForTimeout(400);

    // 4 · הלקוח בדף האישי
    const { flow } = await openPortalItem(page, 'השלמת פרטים לתיק המס');
    ok(await flow.count() > 0, `[${tag}] הלקוח פותח את «השלמת פרטים לתיק המס» בדף האישי`);
    if (width < 700) ok(await noHScroll(page), `[${tag}] טלפון: השאלון בדף האישי בלי גלילה הצידה`);
    await shot(page, `04-portal-question-${tag}`, false, [['.ty-flow .ty-q', 'שאלה אחת למסך']]);
    const log = await answerFlow(page, [
      ['תעודת הזהות שלך', 'file'], ['תעודת הזהות של', 'unavailable'], ['מחוץ לישראל', 'who:none'], ['קריפטו', 'yes'],
      ['עצמאי', 'who:none'], ['כשכיר', 'who:none'], ['זה מה שידוע', 'confirm'], ['לאיזה חשבון בנק', 'bankForeign'], ['פרטי העסק', 'bizRecord'], ['שם העסק', 'bizRecord'],
    ]);
    ok(log.some(x => x.done) && log.every(x => !x.err), `[${tag}] הלקוח השלים (${log.length - 1} תשובות) — «תודה»`, JSON.stringify(log.filter(x => x.err)));
    await shot(page, `05-portal-done-${tag}`);

    // 5 · המשרד — קישור ישיר לשורה (‎#/client/<id>/journey/<stepId>‎)
    if (TARGET === 'staging') {
      // 254 · קישור לבן («השלמת מידע» — למשל מהדף האישי) נוחת בשורת ההורה; לבן אין שורה
      const [child] = await env.sql(`select id from public.onboarding_steps where client_id = '${env.clientId}' and step_type = 'info_collection' and payload->>'parentStepId' = '${stepId}' limit 1`);
      if (child?.id) {
        await go(page, keepUrl(`journey/${child.id}`));
        const parentRow = page.locator(`#ob-step-${stepId}`);
        await parentRow.locator('[data-ty-inline] .ty-label').first().waitFor({ timeout: 40000 }).catch(() => {});
        ok(await parentRow.locator('[data-ty-inline]').count() > 0 && await page.locator(`#ob-step-${child.id}`).count() === 0, `[${tag}] קישור ל«השלמת מידע» (הבן) נחת בשורת ההורה — לבן אין שורה`);
      } else ok(false, `[${tag}] לא נמצא בן info_collection לקליטה`);
    }
    await go(page, keepUrl(`journey/${stepId}`));
    const row2 = page.locator(`#ob-step-${stepId}`);
    await row2.locator('[data-ty-inline] .ty-label').first().waitFor({ timeout: 40000 });
    ok(true, `[${tag}] קישור ישיר ‎#/client/…/journey/<stepId>‎ — השורה נפתחה במקום`);
    w = row2.locator('[data-ty-inline]');
    ok(/לבדוק את מה ש/.test(await text(nowBox(w))), `[${tag}] בשורה: «לבדוק את מה ש${env.clientName} מסר»`, (await text(nowBox(w))).slice(0, 200));
    // עץ השאלון
    const tree = w.locator('[data-q-tree]');
    const treeTxt = await text(tree);
    ok(await tree.locator('[data-q-area]').count() > 1 && /לבדיקת משרד|נענה|חסר/.test(treeTxt), `[${tag}] עץ השאלון: תחומים ← פריטים (${await tree.locator('[data-q-area]').count()} תחומים)`, treeTxt.slice(0, 200));
    ok(await tree.locator('[data-q-mark="review"], [data-q-mark="docArrived"]').count() > 0, `[${tag}] בעץ: פריטים «לבדיקת משרד» / «מסמך הגיע»`);
    await shot(page, `06-review-in-row-${tag}`, false, [[`#ob-step-${stepId} .ty-now`, 'לבדוק את מה שנמסר'], [`#ob-step-${stepId} [data-q-tree]`, 'עץ השאלון']]);
    // בדיקה: «אשר את כולם», «החזר ללקוח» אחד, ואישור השאר
    const bulk = nowBox(w).getByRole('button', { name: 'אשר את כולם' });
    if (await bulk.count()) { await bulk.first().click(); await waitIdle(w); ok(true, `[${tag}] «אשר את כולם» ל«אין שינוי»`); }
    const crypto = nowBox(w).locator('.ty-row', { hasText: 'מטבעות דיגיטליים' }).first();
    if (await crypto.count()) {
      await crypto.getByRole('button', { name: 'החזר ללקוח' }).click();
      await crypto.locator('input[aria-label="מה צריך לתקן"]').fill('נא לפרט באיזו זירה');
      await crypto.getByRole('button', { name: /^החזר$/ }).click(); await waitIdle(w);
      // 254 · הטיוטה עם התיקון מתפרסמת לבד — בלי «פרסם», בלי מייל (ההודעה מצטרפת ל«הוחזר ל…»)
      await page.waitForFunction(sel => { const el = document.querySelector(sel); return !!el && /בדף של/.test(el.innerText); }, `#ob-step-${stepId} .ty-ok`, { timeout: 30000 }).catch(() => {});
      const okTxt = (await text(w.locator('.ty-ok'))).replace(/\s+/g, ' ');
      ok(/בדף של .* — בלי מייל/.test(okTxt) && await w.locator('[data-ty-publish]').count() === 0, `[${tag}] «החזר ללקוח לתיקון» מתוך השורה — והתיקון פורסם לבד: «${okTxt.slice(0, 90)}»`, okTxt || await text(w.locator('.ty-err, .ty-now')));
    } else ok(false, `[${tag}] שורת «מטבעות דיגיטליים» לבדיקה לא נמצאה`, (await text(nowBox(w))).slice(0, 300));
    const doc = nowBox(w).locator('.ty-row', { hasText: 'תעודת זהות' }).first();
    if (await doc.count()) {
      const sels = doc.locator('select');
      if (await sels.count() >= 2) { await sels.nth(0).selectOption('match'); await sels.nth(1).selectOption('match'); }
      await doc.getByRole('button', { name: 'אשר מסמך' }).click(); await waitIdle(w);
      ok(true, `[${tag}] מסמך שהגיע — נבדק ואושר`);
    }
    ok(await w.locator('[data-ty-publish]').count() === 0, `[${tag}] 254 · אחרי הבדיקה — עדיין אין «פרסם» בשורת הקליטה`);
    if (TARGET === 'staging') {
      const c = (await env.sql(`select count(*) filter (where state = 'draft')::int d from public.tax_info_asks where client_id = '${env.clientId}'`))[0];
      ok(c.d === 0, `[${tag}] staging: 0 טיוטות אחרי «החזר ללקוח»`, JSON.stringify(c));
    }
    // 6 · אישור לתיק — כל תשובה: «אשר» או «אשר ועדכן בתיק» (הצעה שמוחלת מיד, עם הערך הקודם, המקור וההיסטוריה)
    let plain = 0, toCard = 0, cardMsg = '';
    for (let k = 0; k < 40; k++) {
      const btn = w.locator('.ty-now button:not([disabled])', { hasText: /^(אשר ועדכן בתיק|אשר את כולם|אשר)$/ }).first();
      if (!(await btn.count())) break;
      const label = (await text(btn)).trim();
      await btn.click(); await waitIdle(w);
      if (label.includes('עדכן')) { toCard++; cardMsg = await text(w.locator('.ty-ok')); } else plain++;
    }
    ok(toCard > 0 && /עודכן בתיק/.test(cardMsg), `[${tag}] אישור לתיק: ${toCard} × «אשר ועדכן בתיק» ו-${plain} × «אשר» — «${cardMsg.trim().slice(0, 60)}»`, (await text(w.locator('.ty-err'))) || cardMsg || (await text(w.locator('.ty-now'))).slice(0, 300));
    const leftReview = await w.locator('[data-q-tree] [data-q-mark="review"]').count();
    ok(leftReview === 0, `[${tag}] בעץ השאלון אין יותר פריטים «לבדיקת משרד» (נשארו ${leftReview})`);
    await shot(page, `07-after-review-${tag}`, false, [[`#ob-step-${stepId} .ty-ok`, 'עודכן בתיק']]);
    // תיק המס: «דוחות והצהרות» מוביל לשורה (לא למסך שלישי)
    await go(page, keepUrl('taxfile'));
    await page.waitForSelector('[data-rp-status]', { timeout: 40000 });
    const workLink = page.locator('[data-tf-open-work]').first();
    await workLink.waitFor({ timeout: 15000 }).catch(() => {});
    if (await workLink.count()) {
      const wid = await workLink.getAttribute('data-tf-open-work');
      const done = await workLink.locator('xpath=..').locator('.ty-chip', { hasText: 'הושלם' }).count() > 0;
      ok((await text(workLink)).includes('לבקשה'), `[${tag}] «דוחות והצהרות»: כל שורה «לבקשה ←»`);
      const histBefore = await page.evaluate(() => history.length);
      await workLink.click();
      const target = page.locator(`#ob-step-${wid}`);
      await target.locator('[data-ty-inline] .ty-label, [data-ty-inline] .ty-note').first().waitFor({ timeout: 30000 }).catch(() => {});
      ok(await target.locator('[data-ty-inline]').count() > 0 && await page.locator('.ty-overlay').count() === 0,
        `[${tag}] «לבקשה ←» נחת בשורה של העבודה הזו ב«בקשות», פתוחה${done ? ' — גם כשהיא ב«הושלמו» (הקבוצה נפרשה)' : ''}`);
      if (done) ok(await page.locator('.rl-fold-head[aria-expanded="true"]').count() > 0, `[${tag}] עבודה שהושלמה: «הושלמו» נפרש והשורה נגללה לתצוגה`);
      await shot(page, `08-annual-or-estimate-row-${tag}`, false, [[`#ob-step-${wid}`, done ? 'עבודה שהושלמה — בתוך «הושלמו»' : 'העבודה בשורה']]);
      if (await target.locator('.ty-inline-head', { hasText: 'חתך' }).count()) {
        const est = await text(target.locator('[data-ty-inline]'));
        ok(/הערכ|מקדמות|סיכום/.test(est), `[${tag}] הערכת מס: הסיכום וההמלצות נגישים מהשורה`, est.slice(0, 160));
      }
      // «אחורה» מהבקשה הממוקדת — חוזר ל«תיק מס» (רשומה אחת נוספה בהיסטוריה, לא אפס ולא שתיים)
      await page.waitForTimeout(800);
      const histAfter = await page.evaluate(() => history.length);
      ok(histAfter === histBefore + 1, `[${tag}] «לבקשה ←» הוסיף רשומה אחת בהיסטוריה (${histBefore} ← ${histAfter})`);
      await page.goBack();
      await page.locator('[data-rp-status]').first().waitFor({ timeout: 15000 }).catch(() => {});
      ok(await page.locator('[data-rp-status]').count() > 0, `[${tag}] «אחורה» מהבקשה חוזר ל«תיק מס»`);
    }
    // «אחורה» מבקשה שנפתחה מ«מס» (סקירה ← ‎#/client/…/journey/<stepId>‎) — חוזר לסקירה, לא מדלג מעליה
    {
      const taxUrl = TARGET === 'demo' ? `${BASE}/?office-app#/tax/work` : `${BASE}/#/tax/work`;
      await go(page, taxUrl);
      await page.waitForFunction(() => location.hash.startsWith('#/tax'), null, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2500);
      const h0 = await page.evaluate(() => history.length);
      await page.evaluate((h) => { location.hash = h; }, `#/client/${env.clientId}/journey/${stepId}`);
      await page.locator(`#ob-step-${stepId}`).first().waitFor({ timeout: 40000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const h1 = await page.evaluate(() => history.length);
      const hashNow = await page.evaluate(() => location.hash);
      ok(h1 === h0 + 1 && hashNow === `#/client/${env.clientId}/journey`, `[${tag}] מ«מס» לבקשה: רשומה אחת נוספה, והפוקוס נוקה בהחלפה (${h0} ← ${h1}, ${hashNow})`);
      await page.goBack();
      await page.waitForFunction(() => location.hash.startsWith('#/tax'), null, { timeout: 15000 }).catch(() => {});
      ok((await page.evaluate(() => location.hash)).startsWith('#/tax'), `[${tag}] «אחורה» מהבקשה חוזר ל«מס» (${await page.evaluate(() => location.hash)})`);
    }

    // 7 · הסרה — דרך ⋯ של השורה
    await go(page, keepUrl(`journey/${stepId}`));
    const row3 = page.locator(`#ob-step-${stepId}`);
    await row3.waitFor({ timeout: 40000 });
    await row3.locator('[data-row-actions]').first().click();
    await row3.locator('[data-remove-action="tax_work"]').click();
    const dlg = page.locator('[data-remove-work]');
    await dlg.waitFor({ timeout: 10000 });
    await shotEl(dlg, `09-remove-dialog-${tag}`);
    await dlg.locator('[data-rw-confirm]').click();
    await page.waitForTimeout(2500);
    const still = await page.locator(`#ob-step-${stepId}`).count();
    const toast = await text(page.locator('.tw-toast'));
    ok(still === 0 || /בוטל|הוסר|נמחק/.test(toast), `[${tag}] «הסר…» מה-⋯: הקליטה ירדה מ«בקשות» (${toast.trim().slice(0, 70)})`, `still=${still}`);
    await shot(page, `10-after-remove-${tag}`);
    // החזרה — מתיק המס («דוחות והצהרות» ← «בוטלו»), כי «מס › עבודות לקוחות» הוא עכשיו סקירה בלבד
    await go(page, keepUrl('taxfile'));
    await page.waitForSelector('[data-rp-status]', { timeout: 40000 });
    const canc = page.locator('[data-tf-cancelled]');
    await canc.waitFor({ timeout: 15000 }).catch(() => {});
    if (await canc.count()) {
      await canc.locator('summary').click();
      await canc.locator('[data-tf-restore]').first().click();
      const rd = page.locator('[data-remove-work]'); await rd.waitFor({ timeout: 10000 });
      await rd.locator('[data-rw-confirm]').click(); await page.waitForTimeout(2000);
      ok(/הוחזרה/.test(await text(page.locator('.ty-ok'))), `[${tag}] «בוטלו» ← «החזר…» בתיק המס — העבודה חזרה לרשימה הפעילה`, await text(page.locator('.ty-ok, .ty-err, [data-remove-work]')));
    } else ok(false, `[${tag}] אין «בוטלו» בדוחות והצהרות אחרי ההסרה`);


    // 8 · הספרייה — עמוד אחד
    if (env.libraryUrl) {
      await go(page, env.libraryUrl());
      await page.waitForSelector('[data-shelf]', { timeout: 30000 });
      ok(await page.locator('[data-shelf]').count() === 3 && await page.locator('.lb-toolbar .of-seg').count() === 0, `[${tag}] ספרייה: «בקשות / מסמכים / פגישות» — מקטעים בעמוד אחד, לא לשוניות`);
      ok(await page.locator('.lr-group.is-open').count() === 0, `[${tag}] ספרייה: הקבוצות מקופלות`);
      const multi = await page.$$eval('.lr', rs => rs.filter(r => r.querySelectorAll(':scope > .lr-line .lr-side button').length > 1).length);
      ok(multi === 0, `[${tag}] ספרייה: פעולה אחת גלויה בכל שורה (השם = «צפייה»)`, String(multi));
      await page.locator('[data-shelf="documents"] .lb-shelf-btn').click();
      await page.waitForSelector('.cdx-row, .cdx-empty, .of-empty', { timeout: 15000 }).catch(() => {});
      ok(await page.locator('[data-shelf="documents"] .lb-shelf-btn[aria-expanded="true"]').count() === 1, `[${tag}] ספרייה: «מסמכים» נפתח באותו עמוד`);
      if (width < 700) ok(await noHScroll(page), `[${tag}] טלפון: הספרייה בלי גלילה הצידה`);
      await shot(page, `11-library-${tag}`, false, [['[data-shelf="requests"]', 'בקשות'], ['[data-shelf="documents"]', 'מסמכים'], ['[data-shelf="meetings"]', 'פגישות']]);
    }
  } catch (e) {
    ok(false, `[${tag}] המסלול נעצר`, e.stack ?? e);
    await shot(page, `zz-stopped-${tag}`, true);
  } finally { await ctx.close(); }
}

// ── דמי לידה (16.10.2026): דוח שנתי 2023 ← שלושה סבבי שאלות ← שני תאריכים ← הצעת החלוקה במשרד (דוגמת גיא) ──
async function maternityFlow(width) {
  const tag = `${width}-mat`;
  console.log(`\n▶ דמי לידה — ${width}px`);
  const { ctx, page } = await newCtx(width);
  try {
    await go(page, env.officeUrl(env.clientId));
    await page.waitForSelector('[data-rp-status]', { timeout: 40000 });
    await page.locator('[data-tf-add-work]').click();
    const dlg = page.locator('[data-add-work]');
    await dlg.waitFor({ timeout: 15000 });
    await dlg.locator('select').first().selectOption('2023');
    await dlg.getByRole('button', { name: /^המשך לבדיקה/ }).click();
    await dlg.locator('[data-aw-create]').click();
    const row = page.locator('.rl-row.is-open', { has: page.locator('.rl-name', { hasText: 'דוח שנתי 2023' }) }).first();
    // ‼ 19.10.2026 · דוח שנתי: דף הסיכום למעלה (AnnualSummary); «הכן ופרסם בדף» מהסיכום — בלי לפתוח את «פירוט מלא»
    await row.locator('[data-ty-inline] [data-annual-summary]').first().waitFor({ timeout: 40000 });
    const stepId = ((await row.getAttribute('id')) ?? '').replace('ob-step-', '');
    ok(!!stepId, `[${tag}] דוח שנתי 2023 נפתח ונחת בשורה שלו`);
    const round = async (n, expect) => {
      if (n > 1) {
        await go(page, keepUrl(`journey/${stepId}`));
        await page.locator(`#ob-step-${stepId} [data-annual-summary]`).first().waitFor({ timeout: 40000 });
      }
      const w = page.locator(`#ob-step-${stepId} [data-ty-inline]`);
      const more = w.locator('[data-annual-more] button');
      await more.first().waitFor({ timeout: 20000 }).catch(() => {});
      const moreText = await text(w.locator('[data-annual-more]'));
      ok(await more.count() > 0, `[${tag}] סבב ${n}: בסיכום «עוד שאלות ל…» עם «הכן ופרסם בדף»`, moreText);
      if (await more.count()) {
        await more.first().click();
        await page.waitForFunction(() => /פורסם בדף/.test(document.querySelector('.ty-ok')?.textContent ?? ''), null, { timeout: 20000 }).catch(() => {});
      }
      const flash = await text(w.locator('.ty-ok'));
      if (!/פורסם/.test(flash)) await shot(page, `zz-mat-round${n}-${width}`, true);
      ok(/פורסם בדף/.test(flash) && /בלי מייל/.test(flash), `[${tag}] סבב ${n}: פורסם בדף — בלי מייל`, flash);
      if (expect) ok(true, `[${tag}] סבב ${n}: (השאלות נבדקות אצל הלקוח: ${expect.join(', ')})`);
      return w;
    };
    // סבב 1: «כספים מביטוח לאומי» — כן, לדוד
    await round(1);
    const l1 = await answerFlow((await openPortalItem(page, 'הדוח השנתי 2023'), page), [['מה היה לכם', 'tiles:niBenefits.received'], ['תגמולי מילואים', `who:client`]]);
    ok(l1.some(x => x.done), `[${tag}] סבב 1: הלקוח ענה «כן» לכספים מביטוח לאומי`, JSON.stringify(l1.filter(x => x.err)));
    // סבב 2: «דמי לידה» — נשאל רק אחרי ה«כן»
    await round(2, ['דמי לידה']);
    await openPortalItem(page, 'הדוח השנתי 2023');
    await shot(page, `30-mat-question-${width}`, false, [['.ty-flow .ty-q', 'דמי לידה — נשאל רק אחרי «כן»']]);
    const l2 = await answerFlow(page, [['דמי לידה מביטוח לאומי', 'who:client'], ['מתוך זה', 'yes']]);
    ok(l2.some(x => x.done) && l2.some(x => /דמי לידה/.test(x.title ?? '')), `[${tag}] סבב 2: הלקוח נשאל וסימן «קיבל דמי לידה»`, JSON.stringify(l2));
    // סבב 3: תקופה (שני תאריכים), סכום ומס, ההודעה של ב״ל
    await round(3, ['מאיזה תאריך', 'כמה דמי לידה']);
    await openPortalItem(page, 'הדוח השנתי 2023');
    let shotTaken = false;
    const l3 = [];
    for (let k = 0; k < 8; k++) {
      const part = await answerFlow(page, [['מאיזה תאריך', 'stop'], ['כמה דמי לידה', 'stop']]);
      l3.push(...part.filter(x => x.act !== 'stop'));
      const stop = part.find(x => x.act === 'stop');
      if (!stop) break;
      const flow = page.locator('.ty-flow');
      if (stop.title.includes('מאיזה תאריך')) {
        const from = flow.getByLabel('מתאריך'), to = flow.getByLabel('עד תאריך');
        ok(await from.count() === 1 && await to.count() === 1 && (await from.getAttribute('type')) === 'date' && (await to.getAttribute('type')) === 'date',
          `[${tag}] התקופה — שני שדות תאריך ייעודיים (לא 105 קבוע, לא טקסט חופשי)`);
        await from.fill('2023-12-08'); await to.fill('2024-03-21');
        if (!shotTaken) { await shot(page, `31-mat-period-${width}`, false, [['.ty-flow .ty-q', 'שני תאריכים מההודעה של ביטוח לאומי']]); shotTaken = true; }
        l3.push({ title: stop.title, act: 'period' });
      } else {
        await flow.getByLabel('כמה שולם (₪)').fill('39942'); await flow.getByLabel('כמה מס נוכה (₪)').fill('256');
        l3.push({ title: stop.title, act: 'amounts' });
      }
      await flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).click();
      await page.waitForFunction((t) => (document.querySelector('.ty-flow .ty-q')?.textContent ?? '') !== t, stop.title, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
    ok(l3.some(x => x.done) && l3.some(x => x.act === 'period') && l3.some(x => x.act === 'amounts'), `[${tag}] סבב 3: הלקוח מסר תאריכים, סכום ומס`, JSON.stringify(l3.filter(x => x.err)));
    // המשרד: פריט «פריסה בין שנות המס» מופיע (התקופה חוצה את 31.12), עם החלוקה של גיא
    await go(page, keepUrl(`journey/${stepId}`));
    const w = page.locator(`#ob-step-${stepId} [data-ty-inline]`);
    // ‼ 19.10.2026 · מהסיכום: «השלמות במשרד» ⇒ «להשלים עכשיו» פותח את «פירוט מלא» על הפריטים של המשרד
    await w.locator('[data-annual-office] button').first().waitFor({ timeout: 40000 });
    await w.locator('[data-annual-office] button').first().click();
    await page.waitForTimeout(400);
    const line = w.locator('[data-maternity-spread]');
    await line.waitFor({ timeout: 15000 }).catch(() => {});
    const t = (await text(line)).replace(/\s+/g, ' ');
    ok(await line.count() > 0, `[${tag}] פריט המשרד «פריסה בין שנות המס» הופיע — התקופה חוצה את 31.12`, (await text(nowBox(w))).slice(0, 300));
    ok(/105 ימים/.test(t) && /24 ב-2023/.test(t) && /81 ב-2024/.test(t), `[${tag}] 105 ימים: 24 ב-2023, 81 ב-2024`, t.slice(0, 200));
    const tbl = (await text(line.locator('[data-mat-split]'))).replace(/\s+/g, ' ');
    ok(/9,129\.6/.test(tbl) && /30,812\.4/.test(tbl) && /58\.5/.test(tbl) && /197\.5/.test(tbl), `[${tag}] חלוקה יחסית: 9,129.6 / 30,812.4 ₪, מס 58.5 / 197.5 (דוגמת גיא)`, tbl);
    await shot(page, `32-mat-spread-${width}`, false, [[`#ob-step-${stepId} [data-maternity-spread]`, 'הצעת חלוקה לפי ימים — החלטת המשרד']]);
    await line.locator('[data-mat-116c]').selectOption('withReturn');
    await line.locator('[data-mat-save]').click(); await waitIdle(w);
    const msg = await text(w.locator('.ty-ok'));
    ok(/לבדיקה גם בדוח של 2024/.test(msg), `[${tag}] ההחלטה נשמרה לשתי השנים: «${msg.trim().slice(0, 70)}»`, msg + ' ' + (await text(w.locator('.ty-err'))));
    if (width < 700) ok(await noHScroll(page), `[${tag}] טלפון: בלי גלילה הצידה`);
  } catch (e) { ok(false, `[${tag}] מסלול דמי הלידה נעצר`, e.stack ?? e); await shot(page, `zz-mat-stopped-${width}`, true); }
  finally { await ctx.close(); }
}

// ── מצב כהה: תיק המס, שורת הבקשה, הספרייה ──────────────────────────────────────
async function darkPass(width) {
  const tag = `${width}-dark`;
  console.log(`
▶ מצב כהה — ${width}px`);
  const { ctx, page } = await newCtx(width, { dark: true });
  try {
    // ‼ הצבע המחושב יכול להגיע כ-oklab()/color-mix — ממירים דרך canvas ל-RGB לפני חישוב הניגודיות (WCAG)
    const lum = (sel) => page.locator(sel).first().evaluate(el => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
      const rgb = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return { v: [d[0], d[1], d[2]], a: d[3] }; };
      let e = el; let bg = null;
      while (e) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.a > 200) { bg = c.v; break; } e = e.parentElement; }
      bg ??= rgb(getComputedStyle(document.body).backgroundColor).v;
      const fg = rgb(getComputedStyle(el).color).v;
      const L = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0);
      const lb = L(bg), lf = L(fg);
      return { bg: lb, ratio: (Math.max(lb, lf) + 0.05) / (Math.min(lb, lf) + 0.05) };
    });
    await go(page, (TARGET === 'demo' ? env.officeUrl(env.clientId) : keepUrl('taxfile')));
    await page.waitForSelector('[data-rp-status]', { timeout: 40000 });
    const t = await lum('[data-rp-status]');
    ok(t.bg < 0.2 && t.ratio >= 4.5, `[${tag}] תיק המס במצב כהה: רקע כהה, ניגודיות ${t.ratio.toFixed(1)}:1`, JSON.stringify(t));
    await shot(page, `21-dark-taxfile-${tag}`, false, [['[data-tax-file-top]', 'זהות ורשויות — מצב כהה']]);
    await page.locator('[data-intake-open]').click();
    const row = page.locator('.rl-row.is-open [data-ty-inline]').first();
    await row.locator('.ty-label, .ty-note').first().waitFor({ timeout: 30000 }).catch(() => {});
    if (await row.count()) {
      const r = await lum('.rl-row.is-open .ty-now h3, .rl-row.is-open .ty-label');
      ok(r.bg < 0.2 && r.ratio >= 4.5, `[${tag}] שורת הבקשה במצב כהה: ניגודיות ${r.ratio.toFixed(1)}:1`, JSON.stringify(r));
      const rsl = await lum('.rl-row.is-open [data-request-steps] .rs-line');
      ok(rsl.bg < 0.2 && rsl.ratio >= 4.5, `[${tag}] שלושת הצעדים במצב כהה: ניגודיות ${rsl.ratio.toFixed(1)}:1`, JSON.stringify(rsl));
      await shot(page, `22-dark-request-row-${tag}`, false, [['.rl-row.is-open .ty-now', 'העבודה בשורה — מצב כהה']]);
    } else ok(false, `[${tag}] שורת הבקשה לא נפתחה במצב כהה`);
    if (env.libraryUrl) {
      await go(page, env.libraryUrl());
      await page.waitForSelector('[data-shelf]', { timeout: 30000 });
      const l = await lum('.lb-shelf-title');
      ok(l.bg < 0.2 && l.ratio >= 4.5, `[${tag}] הספרייה במצב כהה: ניגודיות ${l.ratio.toFixed(1)}:1`, JSON.stringify(l));
      await shot(page, `23-dark-library-${tag}`);
    }
    if (width < 700) ok(await noHScroll(page), `[${tag}] טלפון: בלי גלילה הצידה במצב כהה`);
  } catch (e) { ok(false, `[${tag}] מצב כהה נעצר`, e.stack ?? e); await shot(page, `zz-dark-stopped-${tag}`, true); }
  finally { await ctx.close(); }
}

// ── ממתי המצב המשפחתי (16.10.2026): «טרם נרשם» בתיק עם מענה במקום, עריכה לפי המצב, ושאלה ללקוח בקליטה ──
const familyRow = (page) => page.locator('.txf-row', { has: page.locator('.txf-row-name', { hasText: 'משפחה ובן/בת זוג' }) }).first();
async function familyYearFlow(width) {
  const tag = `${width}-fy`;
  console.log(`\n▶ ממתי המצב המשפחתי — ${width}px`);
  const { ctx, page } = await newCtx(width);
  try {
    // א · הקליטה: השאלה ללקוח (לפני שהשנה נרשמה בתיק)
    await go(page, env.officeUrl(env.clientId));
    await page.waitForSelector('[data-rp-status]', { timeout: 40000 });
    const fam = familyRow(page);
    const sum = (await text(fam.locator('.txf-row-sum'))).replace(/\s+/g, ' ').trim();
    ok(/נשוי\/אה · ממתי\? טרם נרשם/.test(sum), `[${tag}] תיק המס, השורה הסגורה: «${sum}»`);
    await page.locator('[data-intake-open]').click();
    const row = workRow(page, 'קליטה והשלמת תיק המס');
    await row.locator('[data-ty-inline] .ty-label').first().waitFor({ timeout: 30000 });
    const stepId = ((await row.getAttribute('id')) ?? '').replace('ob-step-', '');
    const w = row.locator('[data-ty-inline]');
    const legacy = w.locator('[data-legacy-intake]');
    await legacy.waitFor({ timeout: 5000 }).catch(() => {});
    if (await legacy.count()) { await legacy.getByRole('button', { name: 'החלף בקליטה' }).click(); await waitIdle(w); }
    // 254 · השאלון נשלח לבד; «באיזו שנה התחתנתם?» בעץ השאלון של השורה (רק השנה של המצב)
    await page.waitForFunction(sel => { const el = document.querySelector(sel); return !!el && /ממתין ל|ממתין לפרסום/.test(el.innerText); }, `#ob-step-${stepId} .ty-now`, { timeout: 45000 }).catch(() => {});
    const chipFy = (await text(row.locator('.rl-line .rl-state'))).trim();
    if (/ממתין לפרסום/.test(chipFy)) {
      const pageBtn = page.locator('button', { hasText: /^פרסם בדף$/ }).first();
      if (await pageBtn.count()) { await pageBtn.click(); const only = page.locator('button, [role=button]', { hasText: /^רק לפרסם/ }).first(); await only.waitFor({ timeout: 8000 }).catch(() => {}); if (await only.count()) await only.click(); await page.waitForTimeout(3000); }
    }
    const titles = TARGET === 'staging'
      ? (await env.sql(`select prompt->>'title' t from public.tax_info_asks where client_id = '${env.clientId}' and state in ('published','answered','unavailable')`)).map(r => r.t)
      : await page.evaluate(() => { try { const s = JSON.parse(localStorage.getItem('pivo-fake-taxyear-v2') ?? '{}'); return (s.tax_info_asks ?? []).filter(a => ['published', 'answered', 'unavailable'].includes(a.state)).map(a => a.prompt?.title ?? ''); } catch { return []; } });
    const plan = titles.join(' | ');
    ok(titles.length > 0 && /באיזו שנה התחתנתם/.test(plan) && !/התגרשתם/.test(plan) && !/נפטר\/ה/.test(plan), `[${tag}] בשאלון שנשלח לבד (${titles.length} שאלות): «באיזו שנה התחתנתם?» — רק השנה של המצב`, plan.slice(0, 300));
    ok(await w.locator('[data-ty-publish]').count() === 0, `[${tag}] 254 · בלי «פרסם» — השאלון כבר בדף`);
    await openPortalItem(page, 'השלמת פרטים לתיק המס');
    let shotTaken = false;
    const log = [];
    for (let k = 0; k < 4; k++) {
      const part = await answerFlow(page, [['באיזו שנה התחתנתם', 'stop'], ['תעודת הזהות', 'unavailable'], ['מחוץ לישראל', 'who:none'], ['עצמאי', 'who:none'], ['כשכיר', 'who:none'], ['זה מה שידוע', 'confirm'], ['לאיזה חשבון בנק', 'bankForeign']]);
      log.push(...part.filter(x => x.act !== 'stop'));
      const stop = part.find(x => x.act === 'stop');
      if (!stop) break;
      const flow = page.locator('.ty-flow');
      const inp = flow.getByLabel('שנה');
      ok(await inp.count() === 1, `[${tag}] הלקוח: שדה «שנה» אחד (לא טקסט חופשי)`);
      await inp.fill('20');
      await flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).click();
      await page.waitForTimeout(400);
      ok(/ארבע ספרות/.test(await text(flow)), `[${tag}] «20» — «שנה בארבע ספרות», לא נשלח`);
      await inp.fill('2015');
      if (!shotTaken) { await shot(page, `41-fy-question-${width}`, false, [['.ty-flow .ty-q', 'שאלה בשפת הלקוח — שנה בלבד']]); shotTaken = true; }
      log.push({ title: stop.title, act: 'year' });
      await flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).click();
      await page.waitForFunction((t) => (document.querySelector('.ty-flow .ty-q')?.textContent ?? '') !== t, stop.title, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
    ok(log.some(x => x.done) && log.some(x => x.act === 'year'), `[${tag}] הלקוח ענה 2015 והשלים`, JSON.stringify(log.filter(x => x.err)));
    // ב · המשרד: «אשר ועדכן בתיק» — הצעה עם הערך הקודם (כמו כל עובדת כרטיס)
    await go(page, keepUrl(`journey/${stepId}`));
    const w2 = page.locator(`#ob-step-${stepId} [data-ty-inline]`);
    await w2.locator('.ty-label').first().waitFor({ timeout: 40000 });
    const yr = nowBox(w2).locator('.ty-row', { hasText: 'שנת הנישואין' }).first();
    await yr.waitFor({ timeout: 15000 }).catch(() => {});
    const yrTxt = (await text(yr)).replace(/\s+/g, ' ');
    ok(/שנת הנישואין: — ← 2015/.test(yrTxt) && await yr.locator('[data-approve-update]', { hasText: 'אשר ועדכן בתיק' }).count() === 1, `[${tag}] במשרד: «שנת הנישואין: — ← 2015» עם «אשר ועדכן בתיק»`, yrTxt.slice(0, 200));
    await shot(page, `42-fy-review-${width}`, false, [[`#ob-step-${stepId} .ty-row:has-text("שנת הנישואין")`, 'אשר ועדכן בתיק — עם הערך הקודם']]);
    await yr.locator('[data-approve-update]').click(); await waitIdle(w2);
    ok(/עודכן בתיק/.test(await text(w2.locator('.ty-ok'))), `[${tag}] «${(await text(w2.locator('.ty-ok'))).trim().slice(0, 60)}»`, await text(w2.locator('.ty-err')));
    ok(!/לרשום בתיק המס/.test(await text(w2)), `[${tag}] אין משימת «לרשום בתיק» — הכרטיס כבר עודכן`);
    // ג · תיק המס מציג את השנה (מעבר בתוך האפליקציה)
    await page.locator('.cw-tab', { hasText: 'תיק מס' }).first().click();
    await page.waitForSelector('[data-rp-status]', { timeout: 40000 });
    const sum2 = (await text(familyRow(page).locator('.txf-row-sum'))).replace(/\s+/g, ' ').trim();
    ok(/נשוי\/אה · מ-2015/.test(sum2), `[${tag}] תיק המס אחרי האישור: «${sum2}»`);
    if (TARGET === 'staging') {
      const [c] = await env.sql(`select marriage_year, field_meta->'marriageYear' meta, (select count(*)::int from public.tax_fact_changes where client_id = '${env.clientId}' and field_key = 'marriageYear' and status = 'accepted') ch from public.clients where id = '${env.clientId}'`);
      ok(c.marriage_year === 2015 && c.ch === 1 && !!c.meta, `[${tag}] staging: במסד marriage_year = 2015, שורת היסטוריה אחת בתיק, ומקור ב-field_meta`, JSON.stringify(c));
      await env.sql(`update public.clients set marriage_year = null where id = '${env.clientId}'`); // ‼ לחלק ד׳ — לקוח הבדיקה שלי בלבד
    }

    // ד · תיק המס: «טרם נרשם» עם מענה במקום — לקוח בלי שנה (בהדגמה: איפוס; ב-staging: השנה נוקתה למעלה)
    await go(page, TARGET === 'demo' ? env.officeUrl(env.clientId) : keepUrl('taxfile'));
    await page.waitForSelector('[data-rp-status]', { timeout: 40000 });
    const fam2 = familyRow(page);
    await fam2.locator('.txf-row-head').click();
    const unk = fam2.locator('[data-family-year-unknown]');
    await unk.waitFor({ timeout: 8000 }).catch(() => {});
    ok(await unk.count() === 1 && /שנת הנישואין/.test(await text(unk)) && /טרם נרשם/.test(await text(unk)) && (await text(fam2.locator('[data-field="familyStatus"]'))).trim().endsWith('נשוי/אה'),
      `[${tag}] פתוח: «מצב משפחתי: נשוי/אה» + «ממתי? · שנת הנישואין — טרם נרשם» (פעם אחת, לא ריק שקט)`, (await text(fam2)).slice(0, 200));
    await shot(page, `40-fy-unknown-${width}`, false, [['[data-family-year-unknown]', 'ממתי? טרם נרשם — עם מענה במקום']]);
    await unk.locator('[data-family-year-answer]').click();
    const inp = fam2.locator('[data-field="marriageYear"] input');
    await inp.waitFor({ timeout: 8000 });
    await inp.fill(String(new Date().getFullYear() + 1));
    ok(/שנה עתידית/.test(await text(fam2.locator('[data-field="marriageYear"]'))), `[${tag}] שנה עתידית — מסומנת מיד`);
    await fam2.locator('.txf-editor-actions button', { hasText: /^שמור$/ }).click();
    await page.waitForTimeout(500);
    ok(/שנה עתידית/.test(await text(fam2.locator('.txf-editor-err'))), `[${tag}] ולא נשמרת: «${(await text(fam2.locator('.txf-editor-err'))).trim()}»`);
    await inp.fill('2016');
    await fam2.locator('.txf-editor-actions button', { hasText: /^שמור$/ }).click();
    await fam2.locator('[data-field="marriageYear"] input').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
    const v = (await text(fam2.locator('[data-field="familyStatus"]'))).replace(/\s+/g, ' ');
    ok(/נשוי\/אה · מ-2016/.test(v) && await fam2.locator('[data-family-year-unknown]').count() === 0, `[${tag}] נשמר באותה שורה: «${v.trim()}»`);
    // ה · עריכה: שינוי המצב מחליף את שדה השנה (אלמן/ה ⇒ שנת הפטירה), באותה שורה
    await fam2.locator('.txf-srcline button', { hasText: /^ערוך$/ }).click();
    const sel = fam2.locator('[data-field="familyStatus"] select');
    await sel.waitFor({ timeout: 8000 });
    ok((await text(fam2.locator('[data-field="marriageYear"] .k'))).includes('שנת הנישואין') && (await fam2.locator('[data-field="marriageYear"] input').inputValue()) === '2016', `[${tag}] עריכה: «שנת הנישואין» 2016 ליד המצב`);
    await sel.selectOption('widowed');
    await fam2.locator('[data-field="widowhoodYear"]').waitFor({ timeout: 5000 }).catch(() => {});
    ok(await fam2.locator('[data-field="widowhoodYear"]').count() === 1 && await fam2.locator('[data-field="marriageYear"]').count() === 0 && /ממתי\? טרם נרשם/.test(await text(fam2.locator('[data-field="widowhoodYear"]'))),
      `[${tag}] אלמן/ה ⇒ «שנת הפטירה» עם «ממתי? טרם נרשם»`);
    await shot(page, `43-fy-edit-${width}`, false, [['[data-field="widowhoodYear"]', 'השנה של המצב שנבחר — באותה שורה']]);
    await fam2.locator('.txf-editor-actions button', { hasText: /^ביטול$/ }).click();
    if (width < 700) ok(await noHScroll(page), `[${tag}] טלפון: בלי גלילה הצידה`);
    // ‼ בסוף: טעינה מחדש (ב-staging כרום ללא-ראש נפל על לחיצות אחרי טעינה חוזרת)
    if (TARGET === 'staging') {
      const [c] = await env.sql(`select marriage_year from public.clients where id = '${env.clientId}'`);
      await go(page, keepUrl('taxfile'));
      await page.waitForSelector('[data-rp-status]', { timeout: 40000 });
      const sum3 = (await text(familyRow(page).locator('.txf-row-sum'))).replace(/\s+/g, ' ').trim();
      ok(c.marriage_year === 2016 && /מ-2016/.test(sum3), `[${tag}] staging: נשמר במסד (2016) ונשאר אחרי טעינה מחדש: «${sum3}»`, JSON.stringify(c));
    }
  } catch (e) { ok(false, `[${tag}] מסלול «ממתי» נעצר`, e.stack ?? e); await shot(page, `zz-fy-stopped-${width}`, true); }
  finally { await ctx.close(); }
}

const ONLY = ['--only-dark', '--only-maternity', '--only-family'].find(f => process.argv.includes(f));
if (!ONLY) for (const wdt of WIDTHS) await run(wdt);
// ‼ דמי לידה — בהדגמה (מסד מדומה), במחשב ובטלפון 390
if (TARGET === 'demo' && !process.argv.includes('--no-maternity') && (!ONLY || ONLY === '--only-maternity')) for (const wdt of WIDTHS.filter(x => x === 1280 || x === 390)) await maternityFlow(wdt);
// ‼ ממתי המצב המשפחתי — בהדגמה, במחשב ובטלפון 390
if (!process.argv.includes('--no-family') && (TARGET === 'demo' ? !ONLY || ONLY === '--only-family' : ONLY === '--only-family')) for (const wdt of WIDTHS.filter(x => x === 1280 || x === 390)) await familyYearFlow(wdt);
if (DARK && (!ONLY || ONLY === '--only-dark')) for (const wdt of WIDTHS) await darkPass(wdt);
let left = null;
if (TARGET === 'staging' && KEEP) {
  // ‼ לבקשת הסשן המנהל: לקוח הבדיקה נשאר ב-staging עם עובדה מאושרת — לבדיקת מפת הטופס (סשן ג׳). הלקוח השני נמחק.
  const ids = `'${env.otherClientId}'`;
  await env.sql(`delete from public.onboarding_events where step_id in (select id from public.onboarding_steps where client_id in (${ids}));
    delete from public.onboarding_steps where client_id in (${ids}); delete from public.clients where id in (${ids});`);
  const facts = await env.sql(`select item_key, subject_role, tax_year, value from public.tax_year_facts where client_id = '${env.clientId}' and status = 'accepted' order by created_at desc limit 5`);
  ok(facts.length > 0, `נשאר ב-staging: לקוח ${env.clientId} עם ${facts.length} עובדות מאושרות (הראשונה: ${facts[0]?.item_key ?? '—'})`);
  if (SHOTS) writeFileSync(join(SHOTS, 'kept-client.json'), JSON.stringify({ clientId: env.clientId, facts }, null, 1));
  console.log('  נשאר:', env.clientId, JSON.stringify(facts.slice(0, 3)));
} else {
  try { left = (await env.cleanup())?.left ?? null; } catch (e) { ok(false, 'ניקוי staging נכשל', e.stack ?? e); }
}
if (TARGET === 'staging' && !KEEP) ok(left === 0, `ניקוי: 0 שאריות ללקוח הבדיקה (${left})`);
ok(blocked.length === 0, 'אין פנייה לייצור או למארח זר', blocked.slice(0, 5).join(' | '));
ok(consoleErrors.length === 0, 'אין שגיאות קונסול', consoleErrors.slice(0, 6).join(' | '));
await browser.close();
console.log(`\n${pass} עברו, ${fail} נכשלו`);
if (SHOTS) writeFileSync(join(SHOTS, 'results.json'), JSON.stringify({ target: TARGET, base: BASE, widths: WIDTHS, pass, fail, results, at: new Date().toISOString() }, null, 1));
process.exit(fail ? 1 : 0);
