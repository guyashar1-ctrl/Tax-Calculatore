#!/usr/bin/env node
/**
 * intake-closed-lists.mjs — «בקשה אחת לתיק המס» שלב 2 (16.10.2026): השאלון מהתיק, רשימות סגורות, בלי מסמכים.
 *
 *   תיק המס → «השלם עם הלקוח» → שורת הקליטה ב«בקשות» → הכנה ופרסום (מסך הרשת = שאלה אחת) → הלקוח בדף האישי:
 *   «מה שכבר ידוע לנו — נכון?» (יש שינוי בשורה אחת) → התיקון → «סמנו מה יש לכם» → «של מי / איפה» (רשימות עם חיפוש)
 *   → ילדים / חשבון בנק → סיום בלי העלאה אחת → המשרד רואה «של רחל · ארצות הברית» ומאשר.
 *
 *   node scripts/e2e/intake-closed-lists.mjs --target=demo [--base=http://localhost:5243] [--widths=1280,390] [--dark] [--shots=<dir>]
 *   node scripts/e2e/intake-closed-lists.mjs --target=staging --base=http://localhost:4744   (בנייה --mode staging שמוגשת מקומית; 253 חייבת להיות ב-staging)
 *
 * ‼ playwright-core — התלות של העובד (worker/node_modules). ‼ כל בקשה לייצור נחסמת ומכשילה. ב-staging: לקוח בדיקה חדש לכל רוחב, ניקוי בסוף.
 * ‼ העזרים (שורת הבקשה, הכנה ופרסום, הדף האישי) — כמו scripts/e2e/work-as-request.mjs (המסך של master אחרי «כל עבודה היא בקשה»).
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d);
const TARGET = arg('target', 'demo');
const BASE = arg('base', TARGET === 'demo' ? 'http://localhost:5243' : 'http://localhost:4744');
const WIDTHS = arg('widths', '1280,390').split(',').map(Number);
const DARK = process.argv.includes('--dark');
const SHOTS = arg('shots', '');
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PW = process.env.PW_CORE ?? 'C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json';
const { chromium } = createRequire(PW)('playwright-core');
const PROD = 'uoweoqtuiettozagwgdw';
const STAGING = 'evdfxjqrkgugssfrdoxd';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

// staging: רוחב אחד לכל לקוח בדיקה (המסלול משנה את מצב הלקוח) — תהליך נפרד לכל רוחב
if (TARGET === 'staging' && WIDTHS.length > 1 && !process.env.ICL_CHILD) {
  let failed = 0;
  for (const w of WIDTHS) {
    const args = process.argv.slice(2).filter(a => !a.startsWith('--widths=') && !a.startsWith('--shots='));
    if (SHOTS) args.push(`--shots=${join(SHOTS, String(w))}`);
    console.log(`\n══ staging · ${w}px${DARK ? ' · כהה' : ''} · לקוח בדיקה חדש ══`);
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args, `--widths=${w}`], { stdio: 'inherit', env: { ...process.env, ICL_CHILD: '1' } });
    if (r.status !== 0) failed++;
  }
  console.log(`\nstaging: ${WIDTHS.length - failed}/${WIDTHS.length} רוחבות עברו`);
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
  clientId: 'sample-1', clientName: 'דוד', spouseName: 'רחל',
  initContext: async () => {}, cleanup: async () => ({ left: 0 }), emailsFor: async () => 0,
};
if (TARGET === 'staging') env.emailsFor = async () => (await env.sql(`select count(*)::int n from public.email_messages where client_id = '${env.clientId}'`))[0]?.n ?? -1;
const keepUrl = (tail) => env.officeUrlKeep(env.clientId, tail);

const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--headless=new', '--js-flags=--max-old-space-size=4096', '--disable-dev-shm-usage', '--disable-gpu'] });
const consoleErrors = [];
const blocked = [];
const rpcs = [];
async function newCtx(width, { client = false } = {}) {
  const mobile = width < 700;
  const ctx = await browser.newContext({ colorScheme: DARK ? 'dark' : 'light',
    viewport: { width, height: mobile ? 800 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'he-IL',
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  if (!client) await env.initContext(ctx);
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.includes(PROD)) { blocked.push(u); return route.abort(); }
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
    const host = new URL(u).hostname;
    if (/\/rest\/v1\/rpc\//.test(u)) rpcs.push(u.replace(/.*\/rpc\//, '').replace(/\?.*$/, ''));
    if (host === 'localhost' || host === '127.0.0.1' || u.startsWith('data:') || u.startsWith('blob:') || (TARGET === 'staging' && host.includes(STAGING))) return route.continue();
    blocked.push(u); return route.abort();
  });
  const attach = (p) => {
    p.on('console', m => { if (m.type() === 'error' && !/favicon|ResizeObserver|Failed to load resource: net::ERR_FAILED/.test(m.text())) consoleErrors.push(`${width}: ${m.text().slice(0, 240)}`); });
    p.on('pageerror', e => consoleErrors.push(`${width} pageerror: ${String(e).slice(0, 240)}`));
  };
  // לשונית חדשה לכל ניווט (שרת הפיתוח טוען אלפי מודולים; זיכרון מצטבר בלשונית אחת הפיל את הכרום ללא-ראש)
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
const shot = async (page, name, marks = []) => {
  if (!SHOTS) return;
  if (marks.length) await page.locator(marks[0][0]).first().evaluate(e => e.scrollIntoView({ block: 'center' })).catch(() => {});
  if (marks.length) await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false }).catch(() => {});
  if (!marks.length) return;
  const vp = page.viewportSize();
  const boxes = [];
  for (const [sel, label] of marks) { const b = await page.locator(sel).first().boundingBox().catch(() => null); if (b) boxes.push({ label, x: b.x / vp.width, y: b.y / vp.height, w: b.width / vp.width, h: b.height / vp.height }); }
  writeFileSync(join(SHOTS, `${name}.json`), JSON.stringify({ vp, boxes }));
};
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const text = async (loc) => ((await loc.count().catch(() => 0)) ? loc.first().innerText({ timeout: 5000 }).catch(() => '') : '');
async function waitIdle(scope) { await scope.page().waitForTimeout(250); await scope.locator('button[disabled]').first().waitFor({ state: 'detached', timeout: 10000 }).catch(() => {}); await scope.page().waitForTimeout(350); }
async function go(page, url) { await page.goto(url, { waitUntil: 'domcontentloaded' }); }

// ── «בקשות»: שורת הקליטה (כמו work-as-request.mjs) ──
const workRow = (page, name) => page.locator('.rl-row', { has: page.locator('.rl-name', { hasText: name }) }).first();
const nowBox = (w) => w.locator('.ty-now');
async function goLater(w, kind) {
  const label = kind === 'ask' ? 'להכין עכשיו' : kind === 'publish' ? 'לפרסם עכשיו' : 'להשלים עכשיו';
  const b = w.locator('.ty-later').getByRole('button', { name: label });
  if (await b.count()) { await b.first().click(); await waitIdle(w); return true; }
  return false;
}
async function prepareAndPublish(w) {
  let box = nowBox(w);
  await box.waitFor({ timeout: 20000 }).catch(() => {});
  if (!/שאלות? ל|שאלה אחת ל/.test(await text(box))) await goLater(w, 'ask');
  box = nowBox(w);
  const add = box.getByRole('button', { name: /^הוסף .*לבקשה «השלמת מידע»$/ });
  let n = 0;
  const planText = await text(box);
  if (await add.count()) { n = Number(((await text(add)).match(/\d+/) ?? ['1'])[0]); await add.click(); await waitIdle(w); }
  let pub = nowBox(w).locator('[data-ty-publish]');
  await pub.first().waitFor({ timeout: 20000 }).catch(() => {});
  if (!(await pub.count())) { await goLater(w, 'publish'); pub = nowBox(w).locator('[data-ty-publish]'); await pub.first().waitFor({ timeout: 20000 }).catch(() => {}); }
  if (!n) n = Number(((await text(nowBox(w).locator('h3'))).match(/(\d+)\s*שאל/) ?? [0, '1'])[1]);
  await pub.click();
  await w.locator('.ty-ok', { hasText: /פורסם|נשמר כמפורסם/ }).first().waitFor({ timeout: 20000 }).catch(() => {});
  if (!/פורסם|נשמר כמפורסם/.test(await text(w.locator('.ty-ok'))) && await nowBox(w).locator('[data-ty-publish]').count()) {
    await nowBox(w).locator('[data-ty-publish]').click();
    await w.locator('.ty-ok', { hasText: /פורסם|נשמר כמפורסם/ }).first().waitFor({ timeout: 20000 }).catch(() => {});
  }
  const flash = await text(w.locator('.ty-ok'));
  // שער הדף: לקוח שהדף שלו עוד לא פורסם — «פרסם בדף» בכרטיס «הדף של …» (בלי מייל)
  if (/נשמר כמפורסם/.test(flash)) {
    const pageBtn = w.page().locator('button', { hasText: /^פרסם בדף$/ }).first();
    if (await pageBtn.count()) {
      await pageBtn.click();
      const onlyPublish = w.page().locator('button, [role=button]', { hasText: /^רק לפרסם/ }).first();
      await onlyPublish.waitFor({ timeout: 8000 }).catch(() => {});
      if (await onlyPublish.count()) await onlyPublish.click();
      await w.page().waitForTimeout(3000);
    }
  }
  return { n, flash, planText, err: await text(w.locator('.ty-err')) };
}

// ── הלקוח ──
async function openPortalItem(page, label) {
  await go(page, env.portalUrl());
  await page.waitForFunction((l) => document.body.innerText.includes(l), label, { timeout: 30000 });
  const card = page.locator('.pp-item', { has: page.getByText(label, { exact: true }) }).first();
  await card.getByRole('button', { name: /^(להשלמת המידע|להעלאת המסמכים)$/ }).click();
  await page.waitForSelector('.ty-flow', { timeout: 15000 });
  return page.locator('.ty-flow');
}
/** מה להקליד ברשימה (ברירת מחדל לפי הרשימה) — כל תשובה מהרשימה, אף פעם לא טקסט חופשי. */
const LIST_SEARCH = { accounts: 'הפועלים', countries: 'ארצות', crypto: 'Binance', funds: 'הראל', insurers: 'מגדל', allowancePayers: 'ביטוח לאומי', bookkeepers: 'בעצמי', software: 'ירוקה' };
const waitChange = (page, title) => page.waitForFunction((t) => (document.querySelector('.ty-flow .ty-q')?.textContent ?? '') !== t || !!document.querySelector('.ty-flow .ty-err') || !!document.querySelector('.ty-flow[data-finish]'), title, { timeout: 25000 }).catch(() => {});
/**
 * עונה מסך אחרי מסך. כללים: [מילה בכותרת או '@<מסך>', פעולה]. פעולות:
 *   confirmAll[:<מפתח שורה ל«יש שינוי»>] · multi:<מפתח,מפתח> (ריק = «אין לנו אף אחד מאלה») · entity:<who>|<חיפוש> · who:<none|client|spouse|both>
 *   confirm · text:<t> · choice:<l> · record:none|fill · yes · no · notSure · saveExit
 */
async function answerFlow(page, rules, { stopAfter = Infinity } = {}) {
  const log = [];
  for (let step = 0; step < 80 && log.length < stopAfter; step++) {
    const flow = page.locator('.ty-flow');
    if (await page.locator('.ty-flow[data-finish]').count()) { log.push({ done: true }); break; }
    const screen = await flow.getAttribute('data-screen').catch(() => null);
    const title = (await text(flow.locator('.ty-q').first())).trim();
    if (await flow.locator('.ty-done-mark').count()) { await flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).click(); await sleep(300); continue; }
    const rule = rules.find(r => (r[0].startsWith('@') ? screen === r[0].slice(1) : title.includes(r[0])));
    if (process.env.E2E_DEBUG) console.log('    [q]', screen, title.slice(0, 70), '→', rule?.[1] ?? '(ברירת מחדל)');
    const fail = async (entry) => { const err = await text(flow.locator('.ty-err')); if (err) { entry.err = err; return true; } return false; };
    if (screen === 'confirmAll') {
      const act = rule?.[1] ?? 'confirmAll';
      const key = act.split(':')[1];
      const rows = await flow.locator('.ty-confirm-row').count();
      const row = key ? flow.locator(`.ty-confirm-row[data-confirm="${key}"]`) : null;
      if (row && await row.count()) await row.getByRole('button', { name: 'יש שינוי' }).click();
      const entry = { title: 'מה שכבר ידוע לנו — נכון?', screen, act, rows, changed: !!(row && await row.count()) };
      log.push(entry);
      await flow.locator('.ty-nav .btn-primary').click();
      await page.waitForFunction(() => document.querySelector('.ty-flow')?.getAttribute('data-screen') !== 'confirmAll' || !!document.querySelector('.ty-flow .ty-err') || !!document.querySelector('.ty-flow[data-finish]'), null, { timeout: 30000 }).catch(() => {});
      if (await fail(entry)) break;
      continue;
    }
    if (screen === 'multi') {
      const act = rule?.[1] ?? 'multi:';
      const keys = (act.split(':')[1] ?? '').split(',').filter(Boolean);
      const tiles = await flow.locator('.ty-tile:not(.is-wide)').count();
      const picked = [];
      for (const k of keys) { const t = flow.locator(`.ty-tile[data-tile="${k}"]`); if (await t.count()) { await t.click(); picked.push(k); } }
      if (!picked.length) await flow.locator('.ty-tile[data-tile="none"]').click();
      const entry = { title, screen, act, tiles, picked };
      log.push(entry);
      await flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).click();
      await waitChange(page, title);
      await page.waitForTimeout(400);
      if (await fail(entry)) break;
      continue;
    }
    if (screen === 'entity') {
      const act = rule?.[1] ?? 'entity:spouse|';
      const [, whoV = 'spouse', search = ''] = act.match(/^entity:([a-z]*)\|?(.*)$/) ?? [];
      const whoLabel = whoV === 'client' ? env.clientName : whoV === 'both' ? 'שנינו' : env.spouseName;
      const groups = flow.locator('.ty-ent-field');
      const n = await groups.count();
      const filled = [];
      for (let g = 0; g < n; g++) {
        const grp = groups.nth(g);
        const lbl = (await text(grp.locator('.rec-label').first())).trim();
        if (await grp.locator('.ty-list-search').count()) {
          const list = (await grp.getAttribute('data-list')) ?? '';
          const q = search || LIST_SEARCH[list] || '';
          await grp.locator('.ty-list-search').fill(q);
          await grp.locator('.ty-list button[role="option"]').first().click();
          filled.push(`${lbl}=${(await text(grp.locator('.rec-picked'))).trim()}`);
        } else if (await grp.locator('.ty-chip-btn').count()) {
          const target = lbl.includes('של מי') ? grp.locator('.ty-chip-btn', { hasText: whoLabel }) : grp.locator('.ty-chip-btn[aria-pressed="true"]');
          const btn = (await target.count()) ? target.first() : grp.locator('.ty-chip-btn').first();
          await btn.click();
          filled.push(`${lbl}=${(await text(btn)).trim()}`);
        } else if (await grp.locator('input').count()) {
          await grp.locator('input').first().fill('קופת חולים מאוחדת');
          filled.push(`${lbl}=שם`);
        }
      }
      const entry = { title, screen, act, fields: n, filled };
      if (!log.some(x => x.screen === 'entity')) await shot(page, `05b-entity-filled-${page.viewportSize().width}${DARK ? '-dark' : ''}`, [['.ty-ent-card', 'של מי / איפה — מהרשימה']]);
      log.push(entry);
      await flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).click();
      await waitChange(page, title);
      if (await fail(entry)) break;
      continue;
    }
    const firstChoice = (await text(flow.locator('.ty-choice').first())).trim();
    const act = rule ? rule[1]
      : (await flow.locator('input[type="file"]').count()) ? 'file!'
      : (await flow.getByRole('button', { name: 'כן, הכול נכון' }).count()) ? 'confirm'
      : (await flow.locator('.rec').count()) ? 'record:none'
      : (await flow.locator('input[type="number"]').count()) ? 'amount:0'
      : (await flow.locator('.ty-choice', { hasText: /^לא$/ }).count()) ? 'no'
      : (await flow.locator('textarea').count()) ? 'text:בדיקה'
      : firstChoice ? `choice:${firstChoice}` : 'no';
    if (act === 'saveExit') { await flow.getByRole('button', { name: 'שמירה ויציאה' }).click(); await sleep(500); log.push({ title, act, screen }); break; }
    if (act === 'file!') { log.push({ title, act, screen, err: 'מסך העלאת מסמך בהיכרות' }); break; }
    const [kind, val] = act.split(/:(.*)/s);
    if (kind === 'confirm') await flow.getByRole('button', { name: 'כן, הכול נכון' }).click();
    else if (kind === 'yes') await flow.locator('.ty-choice', { hasText: /^כן$/ }).click();
    else if (kind === 'no') await flow.locator('.ty-choice', { hasText: /^לא$/ }).first().click();
    else if (kind === 'notSure') await flow.locator('.ty-choice', { hasText: 'לא בטוח' }).click();
    else if (kind === 'who') { const map = { none: /^לא$/, both: 'כן — שנינו', client: `כן — ${env.clientName}`, spouse: `כן — ${env.spouseName}` }; await flow.locator('.ty-choice', { hasText: map[val] }).first().click(); }
    else if (kind === 'amount') await flow.locator('input[type="number"]').fill(val);
    else if (kind === 'text') await flow.locator('textarea').fill(val);
    else if (kind === 'changed') { const b = flow.getByRole('button', { name: 'משהו השתנה' }); if (await b.count() && (await b.getAttribute('aria-pressed')) !== 'true') await b.click(); await flow.locator('textarea').fill(val); }
    else if (kind === 'choice') await flow.locator('.ty-choice', { hasText: val }).first().click();
    else if (kind === 'record') await fillRecord(flow, val);
    const entry = { title, act, screen };
    log.push(entry);
    await flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).click();
    await waitChange(page, title);
    await page.waitForTimeout(250);
    if (await fail(entry)) break;
  }
  return log;
}
/** רשומה מובנית: «אין …» כשיש (ילדים); חשבון בנק — «חשבון בחו״ל» (שדות ייעודיים, בלי תלות ברשימת הסניפים). */
async function fillRecord(flow, val) {
  const none = flow.locator('.rec .ty-choice').first();
  if (val === 'none' && await none.count()) { await none.click(); return; }
  // «אין» לא קיים (שנת נישואין, כתובת) — ממלאים את השדות
  if (await flow.locator('button', { hasText: 'חשבון בחו״ל' }).count()) {
    await flow.locator('button', { hasText: 'חשבון בחו״ל' }).first().click();
    await flow.getByLabel('מדינה').fill('ארה״ב'); await flow.getByLabel('שם הבנק').fill('Chase'); await flow.getByLabel('IBAN או מספר חשבון').fill('US00TEST');
    await flow.locator('[role=radiogroup], [role=group]', { hasText: 'על שם מי החשבון' }).locator('button').first().click();
    return;
  }
  for (const f of await flow.locator('.rec-field').all()) {
    const radios = f.locator('[role="radio"]');
    if (await radios.count()) { if (!(await f.locator('[role="radio"][aria-checked="true"]').count())) await radios.first().click(); continue; }
    const inp = f.locator('input').first();
    if (!(await inp.count()) || await inp.inputValue()) continue;
    const type = (await inp.getAttribute('type')) ?? 'text';
    const maxLen = Number((await inp.getAttribute('maxlength')) ?? 0);
    if (type === 'date') await inp.fill('2015-04-02'); else if (type === 'number') await inp.fill('100'); else await inp.fill((await inp.getAttribute('inputmode')) === 'numeric' ? (maxLen === 4 ? '2015' : maxLen === 7 ? '3457101' : '123456') : 'בדיקה');
  }
}

// ── המסלול ──
async function run(width) {
  const tag = `${width}${DARK ? '-dark' : ''}`;
  console.log(`\n▶ השלמת תיק המס — השאלון מהתיק, רשימות סגורות, בלי מסמכים — ${width}px${DARK ? ' · כהה' : ''}`);
  const { ctx, page } = await newCtx(width);
  try {
    // 1 · תיק המס → «השלם עם הלקוח» → שורת הקליטה
    await go(page, env.officeUrl(env.clientId));
    await page.waitForSelector('[data-rp-status]', { timeout: 40000 });
    await page.locator('[data-intake-open]').click();
    const row = workRow(page, 'קליטה והשלמת תיק המס');
    await row.locator('[data-ty-inline]').waitFor({ timeout: 30000 });
    const stepId = ((await row.getAttribute('id')) ?? '').replace('ob-step-', '');
    let w = row.locator('[data-ty-inline]');
    await w.locator('.ty-label').first().waitFor({ timeout: 20000 });
    ok(true, `[${tag}] «השלם עם הלקוח» פתח את הקליטה בשורת הבקשה`);
    const legacy = w.locator('[data-legacy-intake]');
    await legacy.waitFor({ timeout: 6000 }).catch(() => {});
    if (await legacy.count()) { await legacy.getByRole('button', { name: 'החלף בקליטה' }).click(); await waitIdle(w); }
    // השאלון המלא — בלי מסמכים
    const sum = w.locator('details.ty-details summary', { hasText: 'השאלון' });
    if (await sum.count()) {
      await sum.first().click();
      await w.locator('.qm').first().waitFor({ timeout: 10000 }).catch(() => {});
      const full = w.locator('.qm-seg').getByRole('button', { name: 'השאלון המלא' });
      if (await full.count()) await full.click();
      const qm = await text(w.locator('.qm'));
      ok(!/תעודת זהות עם הספח|תלוש שכר אחרון|אישור ניהול חשבון/.test(qm), `[${tag}] השאלון המלא של ההיכרות — בלי מסמכים`, qm.slice(0, 160));
      ok(/של מי/.test(qm), `[${tag}] השאלון המלא — פריטי «של מי / איפה»`);
      await sum.first().click();
    }
    // 2 · הכנה ופרסום — מסך הרשת הוא שאלה אחת
    const pub = await prepareAndPublish(w);
    ok(pub.n > 0 && !pub.err, `[${tag}] הוכנו ופורסמו ${pub.n} שאלות («${pub.flash.trim().slice(0, 50)}»)`, pub.err);
    ok(/סמנו מה יש לכם/.test(pub.planText), `[${tag}] ברשימת ההכנה: «סמנו מה יש לכם» — שאלה אחת לכל שאלות הפתיחה`, pub.planText.slice(0, 300));
    ok(!/תעודת זהות|תלוש/.test(pub.planText), `[${tag}] ברשימת ההכנה אין מסמכים`);
    if (TARGET === 'staging') ok(await env.emailsFor() === 0, `[${tag}] staging: אין מייל ללקוח הבדיקה`);
    await shot(page, `01-office-prepared-${tag}`, [[`#ob-step-${stepId} .ty-now`, 'השאלות שהוכנו']]);

    // 3 · הלקוח: «נכון?» → תיקון → מסך הרשת → של מי / איפה → … → סיום
    const t0 = Date.now();
    let flow = await openPortalItem(page, 'השלמת פרטים לתיק המס');
    if (width < 700) ok(await noHScroll(page), `[${tag}] טלפון: השאלון בלי גלילה הצידה`);
    const first = await flow.getAttribute('data-screen');
    ok(first === 'confirmAll', `[${tag}] המסך הראשון: «מה שכבר ידוע לנו — נכון?» — כל אישורי הכרטיס במסך אחד`, first);
    const rows = await flow.locator('.ty-confirm-row').count();
    ok(rows >= 3, `[${tag}] במסך האישור ${rows} שורות`);
    await shot(page, `02-confirm-all-${tag}`, [['.ty-confirm-list', 'מה שכבר ידוע לנו'], ['.ty-seg', 'נכון / יש שינוי']]);
    const rules = [
      ['@confirmAll', 'confirmAll:intake.family'], ['המצב המשפחתי', 'changed:התחתנו ב-2016'],
      ['@multi', 'multi:intake.foreign,intake.crypto,intake.credits,intake.hasInvestments'],
      ['בחו״ל', 'entity:spouse|ארצות'], ['המטבעות', 'entity:both|Binance'], ['תיק ההשקעות', 'entity:spouse|הפועלים'], ['העסק —', 'entity:client|'],
      ['מי מכם', 'who:spouse'], ['הילדים', 'record:none'], ['חשבון בנק', 'record:fill'], ['באיזו שנה', 'record:fill'],
    ];
    const s1 = await answerFlow(page, rules, { stopAfter: 1 });
    ok(s1.length === 1 && !s1[0].err && s1[0].screen === 'confirmAll' && s1[0].changed, `[${tag}] אישור כולל נשלח; «יש שינוי» סומן במצב המשפחתי`, JSON.stringify(s1));
    flow = page.locator('.ty-flow');
    const q2 = await text(flow.locator('.ty-q').first());
    ok(/המצב המשפחתי/.test(q2) && await flow.locator('textarea, .ty-choice').count() > 0, `[${tag}] השורה שסומנה נפתחה לתיקון מיד אחרי האישור`, q2);
    await shot(page, `03-changed-row-${tag}`, [['.ty-q', 'התיקון של השורה שסומנה']]);
    const s2 = await answerFlow(page, rules, { stopAfter: 1 });
    ok(s2.length === 1 && !s2[0].err, `[${tag}] התיקון נשלח`, JSON.stringify(s2));
    flow = page.locator('.ty-flow');
    ok((await flow.getAttribute('data-screen')) === 'multi', `[${tag}] אחרי האישורים — מסך הרשת «סמנו מה יש לכם»`, await flow.getAttribute('data-screen'));
    const tiles = await flow.locator('.ty-tile:not(.is-wide)').count();
    ok(tiles >= 4 && tiles <= 11, `[${tag}] מסך הרשת: ${tiles} אריחים — רק מה שהתיק לא יודע`);
    await shot(page, `04-grid-${tag}`, [['.ty-grid', 'סמנו מה יש לכם'], ['.ty-tile.is-wide', 'אין לנו אף אחד מאלה']]);
    // «שמירה ויציאה» וחזרה — למסך הרשת
    await flow.getByRole('button', { name: 'שמירה ויציאה' }).click().catch(() => {});
    await sleep(700);
    flow = await openPortalItem(page, 'השלמת פרטים לתיק המס');
    ok((await flow.getAttribute('data-screen')) === 'multi', `[${tag}] חזרה מאותו קישור — למסך הרשת, לא מההתחלה`, await flow.getAttribute('data-screen'));
    const s3 = await answerFlow(page, rules, { stopAfter: 1 });
    ok(s3.length === 1 && !s3[0].err && s3[0].picked?.length >= 2, `[${tag}] מסך הרשת נענה — סומנו: ${s3[0]?.picked?.join(', ')}`, JSON.stringify(s3));
    flow = page.locator('.ty-flow');
    const afterGrid = await flow.getAttribute('data-screen');
    ok(afterGrid === 'entity' || afterGrid === 'who', `[${tag}] מה שסומן פתח מיד את שאלת ההמשך — בלי סבב מול המשרד`, afterGrid);
    if (afterGrid === 'entity') {
      await shot(page, `05-entity-${tag}`, [['.ty-ent-card', 'של מי / איפה'], ['.ty-list-search', 'חיפוש ברשימה']]);
      await flow.locator('.ty-list-search').first().fill('זזז').catch(() => {});
      await page.waitForTimeout(500);
      ok(/לא נמצא|אחר/.test(await text(flow.locator('.ty-list'))), `[${tag}] חיפוש שלא מוצא — «אחר» נשאר (אין טקסט חופשי)`);
      await flow.locator('.ty-list-search').first().fill('').catch(() => {});
    }
    const rest = await answerFlow(page, rules);
    const all = [...s1, ...s2, ...s3, ...rest];
    const secs = Math.round((Date.now() - t0) / 1000);
    ok(rest.some(x => x.done) && all.every(x => !x.err), `[${tag}] סיום: «התשובות נשלחו למשרד» — ${all.length - 1} מסכים ב-${secs} שניות`, JSON.stringify(all.filter(x => x.err)));
    ok(!all.some(x => x.act === 'file!' || x.act === 'unavailable'), `[${tag}] אף העלאה — בהיכרות אין מסמכים`);
    ok(!/נשאר/.test(await page.evaluate(() => document.body.innerText)), `[${tag}] בסיום אין «נשארו מסמכים»`);
    const ents = all.filter(x => x.screen === 'entity');
    ok(ents.length >= 2 && ents.every(x => (x.filled ?? []).length > 0), `[${tag}] «של מי / איפה» נענה מהרשימות (${ents.length} מסכים: ${ents.map(x => x.filled.join('; ')).join(' | ').slice(0, 160)})`);
    ok(all.filter(x => x.act?.startsWith('text:') || x.act?.startsWith('changed:')).length <= 1, `[${tag}] טקסט חופשי רק בתיקון של «יש שינוי» (${all.filter(x => x.act?.startsWith('text:') || x.act?.startsWith('changed:')).length})`);
    await shot(page, `06-done-${tag}`);

    // 4 · המשרד: התשובה מהרשימה כטקסט, ואישור
    await go(page, keepUrl(`journey/${stepId}`));
    const row2 = page.locator(`#ob-step-${stepId}`);
    await row2.locator('[data-ty-inline] .ty-label, [data-ty-inline] .ty-note').first().waitFor({ timeout: 40000 });
    w = row2.locator('[data-ty-inline]');
    await nowBox(w).waitFor({ timeout: 20000 }).catch(() => {});
    const box = await text(nowBox(w));
    ok(/לבדוק את מה ש/.test(box), `[${tag}] המשרד: «לבדוק את מה ש… מסר»`, box.slice(0, 120));
    ok(box.includes(`של ${env.spouseName}`) && /ארצות הברית|Binance|בנק הפועלים/.test(box), `[${tag}] התשובה מהרשימה מוצגת למשרד כטקסט («של ${env.spouseName} · ארצות הברית»)`, box.slice(0, 500));
    await shot(page, `07-office-review-${tag}`, [[`#ob-step-${stepId} .ty-now`, 'מה הלקוח מסר — מהרשימות']]);
    const bulk = nowBox(w).getByRole('button', { name: 'אשר את כולם' });
    while (await bulk.count()) { await bulk.first().click(); await waitIdle(w); }
    for (let k = 0; k < 30; k++) { const b = nowBox(w).getByRole('button', { name: /^אשר$/ }); if (!(await b.count())) break; await b.first().click(); await waitIdle(w); }
    ok(!(await nowBox(w).getByRole('button', { name: /^אשר$/ }).count()), `[${tag}] כל התשובות אושרו — מסך הרשת, «של מי / איפה», הילדים והחשבון`);
    if (env.sql) {
      const f = await env.sql(`select item_key, subject_role, answer, value from public.tax_year_facts where client_id = '${env.clientId}' and item_key in ('intake.foreign','intake.crypto','intake.allowances','intake.foreignDetails','intake.cryptoDetails') order by item_key`);
      const fr = f.find(x => x.item_key === 'intake.foreign'), al = f.find(x => x.item_key === 'intake.allowances'), fd = f.find(x => x.item_key === 'intake.foreignDetails');
      ok(fr?.answer === 'value' && fr.subject_role === 'couple' && al?.answer === 'no', `[${tag}] במסד: «כן» למה שסומן ו«לא» למה שלא, בתפקיד משק הבית`, JSON.stringify(f.map(x => [x.item_key, x.subject_role, x.answer])));
      ok(fd?.value?.items?.[0]?.where === 'us' && fd.value.items[0].whereLabel === 'ארצות הברית' && fd.value.items[0].who === 'spouse', `[${tag}] במסד: «איפה» = מזהה מהרשימה + שם; «של מי»`, JSON.stringify(fd?.value));
      const txt = await env.sql(`select item_key from public.tax_year_facts where client_id = '${env.clientId}' and jsonb_typeof(value) = 'string' and item_key like 'intake.%'`);
      ok(txt.every(x => x.item_key === 'intake.family'), `[${tag}] במסד: אף תשובת טקסט חופשי חוץ מתיקון המצב המשפחתי`, JSON.stringify(txt));
      ok(await env.emailsFor() === 0, `[${tag}] staging: עדיין אף מייל`);
      const ids = await env.sql(`select item_key, subject_role, coalesce(entity_ref,'') r, state from public.tax_info_asks where client_id = '${env.clientId}' order by created_at`);
      ok(true, `[${tag}] השאלות במסד: ${ids.map(x => `${x.item_key.replace('intake.','')}:${x.subject_role}${x.r ? ':' + x.r : ''}=${x.state}`).join(' · ')}`);
    }
  } finally { await ctx.close(); }
}

try {
  console.log(`יעד: ${TARGET} · ${BASE}${DARK ? ' · מצב כהה' : ''}`);
  for (const w of WIDTHS) await run(w).catch(e => ok(false, `${w}px נעצר`, e.stack ?? e));
  ok(blocked.length === 0, `אין פנייה לשרת חוץ או לייצור (${blocked.length})`, blocked.slice(0, 5).join(' | '));
  ok(consoleErrors.length === 0, `אין שגיאות בדפדפן (${consoleErrors.length})`, consoleErrors.slice(0, 4).join(' | '));
} finally {
  const cl = await env.cleanup().catch(e => ({ error: String(e) }));
  if (TARGET === 'staging') ok(!cl.error && cl.left === 0, `ניקוי staging: אין שאריות (${JSON.stringify(cl)})`);
  await browser.close();
  if (SHOTS) writeFileSync(join(SHOTS, 'results.json'), JSON.stringify({ target: TARGET, base: BASE, dark: DARK, pass, fail, results, consoleErrors, blocked, rpcs: [...new Set(rpcs)] }, null, 2));
  console.log(`\n${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
}
