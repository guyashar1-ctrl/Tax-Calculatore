#!/usr/bin/env node
/**
 * collection-ux-staging.mjs — סבב האיסוף (13.10.2026) מול המסד האמיתי של staging, בבנייה לפרסום (vite build --mode staging).
 *
 *   STAGING_ENV_DIR=<תיקייה עם .env.staging ו-.env.local> node scripts/e2e/collection-ux-staging.mjs --base=http://localhost:4745 [--vp=desktop|mobile] [--shots=<dir>]
 *
 * ‼ לקוח בדיקה חדש לכל ריצה (staging-session.mjs), נמחק בסוף עם סריקת שאריות. כל פנייה שאינה ל-staging או ל-localhost נחסמת.
 * ‼ אין מיילים (לא לוחצים «שלח מייל…», ובסוף נבדק שאין שורות ב-email_messages) ואין פעולות ברשויות.
 * ‼ שגיאות 401: כל תשובה כזו נשמרת עם הגוף, ה-iat של האסימון והשעה בכותרת Date של השרת — כראיה לסיבה.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d);
const BASE = arg('base', 'http://localhost:4745');
const VP = arg('vp', 'desktop');
const SHOTS = arg('shots', '');
const STAGING = 'evdfxjqrkgugssfrdoxd';
const { chromium } = createRequire('C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json')('playwright-core');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const results = [];
const ok = (c, m, info = '') => { c ? pass++ : fail++; results.push({ ok: !!c, m, info: c ? '' : String(info).slice(0, 500) }); console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(info).slice(0, 500)}` : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const env = await (await import('./staging-session.mjs')).prepare();
const { sql, clientId: A, otherClientId: B } = env;
const one = async (q) => (await sql(q))[0];
console.log(`לקוחות בדיקה: ${env.run} (A=${A.slice(0, 8)}…, B=${B.slice(0, 8)}…) · ${VP}`);

// ── נתוני הבדיקה של לקוח A: שני ילדים בלי שם, חשבון בנק להחזרים, כתובת, נכס וחשבון השקעות בלי תאריכים ──
await sql(`update public.clients set
  children = '[{"id":"k1","birthYear":2015,"birthDate":"2015-04-12","hasDisability":false},{"id":"k2","birthYear":2018,"birthDate":"2018-09-03","hasDisability":true}]'::jsonb,
  bank_accounts = '[{"id":"b1","bankName":"בנק לאומי","branchNumber":"902","accountNumber":"0012345","isPrimary":true}]'::jsonb,
  investment_accounts = '[{"id":"a1","institutionName":"מיטב טרייד"}]'::jsonb,
  address = 'הנשיא 5' where id = '${A}'`);

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false, args: ['--headless=new'] });
const consoleErrors = [], blocked = [], http401 = [], httpErrors = [];
let curPage = null, section = '', simulating = false;
async function newPage() {
  const mobile = VP === 'mobile';
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'he-IL' });
  await env.initContext(ctx);
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
    const host = new URL(u).hostname;
    if (host === 'localhost' || host === `${STAGING}.supabase.co` || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    blocked.push(u); return route.abort();
  });
  const attach = (p) => {
    p.on('console', m => { if (m.type() === 'error' && !/favicon|ResizeObserver/.test(m.text())) consoleErrors.push(`${VP}: ${m.text().slice(0, 240)}`); });
    p.on('pageerror', e => consoleErrors.push(`${VP} pageerror: ${String(e).slice(0, 240)}`));
    p.on('response', async (r) => {
      if (!r.url().includes(STAGING)) return;
      if (r.status() === 401) {
        const body = await r.text().catch(() => '');
        const auth = r.request().headers()['authorization'] ?? '';
        let iat = null; try { iat = JSON.parse(Buffer.from(auth.split(' ')[1].split('.')[1], 'base64url').toString()).iat; } catch { /* */ }
        http401.push({ url: r.url().replace(/\?.*/, '').slice(-80), body: body.slice(0, 200), iat, serverDate: r.headers()['date'], at: new Date().toISOString(), t: Date.now(), simulated: simulating && /\/clients$/.test(r.url().replace(/\?.*/, '')) });
      } else if (r.status() < 300) {
        // ‼ התאוששות: אותה כתובת חזרה בהצלחה אחרי ה-401 — בלי רענון
        const path = r.url().replace(/\?.*/, '').slice(-80);
        for (const x of http401) if (x.url === path && x.recoveredMs === undefined) x.recoveredMs = Date.now() - x.t;
      } else if (r.status() >= 400) httpErrors.push(`${r.status()} ${r.url().replace(/\?.*/, '').slice(-80)}`);
    });
  };
  const holder = { cur: await ctx.newPage() };
  attach(holder.cur);
  curPage = holder;
  const page = new Proxy({}, { get(_, k) {
    if (k === 'goto') return async (url, o) => { const np = await ctx.newPage(); attach(np); await holder.cur.close().catch(() => {}); holder.cur = np; return np.goto(url, o); };
    const v = holder.cur[k]; return typeof v === 'function' ? v.bind(holder.cur) : v;
  } });
  return { ctx, page };
}
const shot = async (page, name, full = false) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}-${VP}.png`), fullPage: full }).catch(() => {}); };
const text = async (loc) => ((await loc.count().catch(() => 0)) ? loc.first().innerText({ timeout: 5000 }).catch(() => '') : '');
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const L = (page, sel) => new Proxy({}, { get: (_, k) => { const l = page.locator(sel); const v = l[k]; return typeof v === 'function' ? v.bind(l) : v; } });
const png = (name, rgb) => {
  const zlib = createRequire(import.meta.url)('node:zlib');
  const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(40, 0); ihdr.writeUInt32BE(28, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(40 * 3, 0).map((_, i) => rgb[i % 3])]);
  return { name, mimeType: 'image/png', buffer: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: 28 }, () => row)))), chunk('IEND', Buffer.alloc(0))]) };
};
const officeUrl = (id, tab = 'taxfile') => env.officeUrl(id, tab);
const steps = async (where) => sql(`select id, step_type, status, ball, published_at, payload from public.onboarding_steps where client_id = '${A}' ${where ?? ''} order by created_at`);

/** עונים על כל השאלון; מטפלים מיוחדים קודם, ובשאר — ברירת מחדל שמרנית. */
async function answerAll(page, custom) {
  const scr = L(page, '[data-tax-info-screen]');
  const flow = L(page, '[data-tax-info-screen] .ty-flow');
  for (let step = 0; step < 90; step++) {
    if (await scr.locator('[data-finish]').count()) return true;
    const q = await text(scr.locator('.ty-q'));
    section = section.replace(/ · שאלה:.*$/, '') + ' · שאלה: ' + q.slice(0, 50);
    if (await custom(q, flow)) { await sleep(700); continue; }
    if (await flow.locator('[data-testid="doc-parts-picker"]').count()) { await flow.getByRole('button', { name: 'אעלה בהמשך' }).last().click(); await sleep(900); continue; }
    if (await flow.locator('[data-record]').count() && !(await flow.getByRole('button', { name: 'כן, הכול נכון' }).count())) {
      const rec = flow.locator('[data-record]').first();
      for (const inp of await rec.locator('input[type="text"], input:not([type])').all()) if (!(await inp.inputValue())) await inp.fill('בדיקה');
      for (const g of await rec.locator('[role="radiogroup"]').all()) await g.getByRole('radio').first().click();
    } else for (const name of ['כן, הכול נכון', 'לא']) { const b = flow.getByRole('button', { name, exact: true }); if (await b.count()) { await b.first().click(); break; } }
    const nxt = flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ });
    if (await nxt.count() && !(await nxt.isDisabled())) await nxt.click();
    await sleep(700);
  }
  console.log('    נתקע בשאלה:', (await text(scr.locator('.ty-q'))).slice(0, 120));
  return false;
}
const nextQ = (flow) => flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).click();

try {
  // ═══ 0. כניסה נקייה: סשן חדש, בלי שום מצב קודם — האם יש 401, ומה הסיבה ═══
  {
    console.log('\n▶ כניסה נקייה'); section = 'כניסה נקייה';
    const { ctx, page } = await newPage();
    await page.goto(officeUrl(A), { waitUntil: 'domcontentloaded' });
    await page.locator('[data-tax-file-top]').waitFor({ timeout: 45000 });
    await sleep(2500);
    const first = http401.length;
    ok(true, `כניסה נקייה: התיק נטען (${first} תשובות 401 בטעינה הראשונה)`);
    if (first) console.log('    401:', JSON.stringify(http401.slice(0, 3)));
    await ctx.close();
  }
  // ═══ 0ב. כניסה נקייה + הדמיה של «JWT issued at future» על הבקשה הראשונה — האפליקציה מתאוששת בלי רענון ═══
  {
    const { ctx, page } = await newPage();
    let injected = 0, after = 0;
    simulating = true;
    await ctx.route(/\/rest\/v1\/clients\?/, async (route) => {
      if (!injected) { injected++; return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST303', details: null, hint: null, message: 'JWT issued at future' }) }); }
      after++; return route.continue();
    });
    await page.goto(officeUrl(A), { waitUntil: 'domcontentloaded' });
    const loaded = await page.locator('[data-tax-file-top]').waitFor({ timeout: 45000 }).then(() => true).catch(() => false);
    ok(injected === 1 && after >= 1 && loaded, `«JWT issued at future» מדומה על טעינת הלקוחות: נשלח שוב אוטומטית (${after}) והתיק נטען — בלי רענון`, `injected=${injected} after=${after} loaded=${loaded}`);
    simulating = false;
    await ctx.close();
  }

  // ═══ 1. «עבודת מס»: הוספה מרוכזת ללקוחות A ו-B — טיוטה בלבד ═══
  {
    console.log('\n▶ עבודת מס — הוספה מרוכזת'); section = 'עבודת מס — הוספה מרוכזת';
    const { ctx, page } = await newPage();
    await page.goto(`${BASE}/#/firm/taxWork`, { waitUntil: 'domcontentloaded' });
    const tw = L(page, '[data-tax-work]');
    await tw.waitFor({ timeout: 45000 });
    await tw.locator('[data-tw-add="annual"]').click();
    const dlg = L(page, '[data-add-work]');
    await dlg.waitFor();
    await dlg.getByRole('radio', { name: 'הצהרת הון' }).click();
    await dlg.locator('input[type="date"]').first().fill('2025-12-31');
    await dlg.locator('select').nth(1).selectOption('letter');
    await dlg.getByLabel('תאריך המכתב').fill('2026-09-01');
    await dlg.getByLabel('המועד שבדרישה').fill('2026-12-25');
    await dlg.getByLabel('יעד פנימי של המשרד').fill('2026-12-01');
    for (const last of [`${env.run}-A`, `${env.run}-B`]) { await dlg.getByLabel('חיפוש לקוח').fill(last); await dlg.locator('.aw-client', { hasText: last }).first().locator('input').check(); }
    await dlg.getByLabel('חיפוש לקוח').fill('');
    await dlg.getByRole('button', { name: /המשך לבדיקה/ }).click();
    ok(await dlg.locator('[data-aw-row]').count() === 2, 'הוספה מרוכזת: שורה לכל לקוח לפני האישור');
    await dlg.locator('[data-aw-row]').nth(1).getByLabel('יעד פנימי').fill('2026-12-05');
    await shot(page, 's1-bulk-review', VP === 'mobile');
    await dlg.locator('[data-aw-create]').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-aw-result]').length >= 2, null, { timeout: 45000 });
    ok(await dlg.locator('[data-aw-result="ok"]').count() === 2, 'שתי הצהרות נוצרו', await text(dlg.locator('.aw-rows')));
    const w = await sql(`select client_id, payload->'demand'->>'status' st, payload->>'internalTarget' it, payload->'work'->>'source' src, published_at is not null pub
      from public.onboarding_steps where client_id in ('${A}','${B}') and step_type = 'wealth_declaration' order by client_id = '${A}' desc`);
    const its = Object.fromEntries(w.map(x => [x.client_id, x.it]));
    ok(w.length === 2 && w.every(x => x.st === 'reported' && x.src === 'letter') && its[B] === '2026-12-05', 'בשרת: דרישה «נמסרה» (לא מאומתת), מקור «מכתב», יעד פנימי לכל לקוח לפי התיקון', JSON.stringify(w));
    const info = await sql(`select count(*)::int n, count(*) filter (where published_at is not null)::int pub from public.onboarding_steps where client_id in ('${A}','${B}') and step_type = 'info_collection'`);
    const asks = await one(`select count(*)::int n, count(*) filter (where state <> 'draft')::int notdraft from public.tax_info_asks where client_id in ('${A}','${B}')`);
    ok(info[0].n === 2 && info[0].pub === 0 && asks.n > 0 && asks.notdraft === 0, `בשרת: «השלמת מידע» טיוטה לכל לקוח (${asks.n} שאלות) — לא פורסם דבר`, JSON.stringify([info, asks]));
    await dlg.getByRole('button', { name: 'סיום' }).click();
    // פעם שנייה — אותו לקוח, אותו יום, יעד אחר: מקושרת, לא נדרסת, לא נוצרת שנייה
    await tw.locator('[data-tw-add="annual"]').click();
    await dlg.getByRole('radio', { name: 'הצהרת הון' }).click();
    await dlg.locator('input[type="date"]').first().fill('2025-12-31');
    await dlg.getByLabel('יעד פנימי של המשרד').fill('2026-11-01');
    await dlg.getByLabel('חיפוש לקוח').fill(`${env.run}-A`); await dlg.locator('.aw-client', { hasText: `${env.run}-A` }).first().locator('input').check();
    await dlg.getByRole('button', { name: /המשך לבדיקה/ }).click();
    ok(/כבר קיימת/.test(await text(dlg.locator('[data-aw-row]').first())), 'אותה זהות: «כבר קיימת — תקושר» לפני האישור');
    await dlg.locator('[data-aw-create]').click();
    await dlg.locator('[data-aw-result]').first().waitFor({ timeout: 30000 });
    const again = await sql(`select payload->>'internalTarget' it from public.onboarding_steps where client_id = '${A}' and step_type = 'wealth_declaration'`);
    ok(again.length === 1 && again[0].it === '2026-12-01', 'בשרת: עדיין הצהרה אחת, והיעד שכבר נרשם לא נדרס', JSON.stringify(again));
    await dlg.getByRole('button', { name: 'סיום' }).click();
    if (VP === 'mobile') ok(await noHScroll(page), 'טלפון: עבודת מס בלי גלילה הצידה');
    // הדף האישי של A — אין הצהרת הון (יצירה ≠ פרסום)
    await page.goto(env.portalUrl(), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    ok(!/להצהרת הון/.test(await text(page.locator('body'))), 'בדף האישי: אין שאלות הצהרת הון — יצירה אינה פרסום');
    await ctx.close();
  }

  // ═══ 2. תיק המס: ראש התיק, דוח 2024 מהתיק — אותה עבודה ב«בקשות», טיוטה ═══
  {
    console.log('\n▶ תיק המס — דוח 2024'); section = 'תיק המס — דוח 2024';
    const { ctx, page } = await newPage();
    await page.goto(officeUrl(A), { waitUntil: 'domcontentloaded' });
    const top = L(page, '[data-tax-file-top]');
    await top.waitFor({ timeout: 45000 });
    const tt = await text(top);
    ok(/מהרשויות/.test(tt) && /חסר או לא ברור/.test(tt), 'ראש התיק מוצג');
    const works = L(page, '[data-section="works"]');
    ok(/הצהרת הון/.test(await text(works)), '«דוחות והצהרות»: ההצהרה מ«עבודת מס» מופיעה כאן');
    await works.getByRole('button', { name: /הוסף דוח או הצהרת הון/ }).click();
    const dlg = L(page, '[data-add-work]');
    await dlg.locator('select').first().selectOption('2024');
    await dlg.getByRole('button', { name: /המשך לבדיקה/ }).click();
    await dlg.locator('[data-aw-create]').click();
    const ov = L(page, '.ty-overlay');
    await ov.waitFor({ timeout: 30000 });
    ok((await text(ov.locator('h2'))).includes('דוח שנתי 2024'), 'דוח 2024 נוצר ונפתח');
    await shot(page, 's2-annual-draft');
    const ann = await one(`select s.id, (select count(*)::int from public.tax_info_asks a where a.parent_step_id = s.id) n,
      (select count(*)::int from public.tax_info_asks a where a.parent_step_id = s.id and a.item_key = 'period.property' and a.entity_ref = 'p1') per,
      (select published_at from public.onboarding_steps i where i.step_type = 'info_collection' and i.payload->>'parentStepId' = s.id) pub
      from public.onboarding_steps s where s.client_id = '${A}' and s.step_type = 'annual_return' and s.payload->>'taxYear' = '2024'`);
    ok(ann?.n > 0 && ann.per === 1 && ann.pub === null, `בשרת: ${ann?.n} שאלות טיוטה, כולל שאלת תחולה לנכס בלי תאריך; לא פורסם`, JSON.stringify(ann));
    await ov.getByRole('button', { name: 'סגירה' }).first().click();
    await page.locator('.cw-tab', { hasText: 'בקשות' }).first().click({ timeout: 30000 });
    await page.waitForTimeout(2500);
    const row = await text(page.locator('.rl-row').filter({ hasText: 'השלמת מידע לשנת 2024' }).first());
    ok(/טיוטה/.test(row) && !/ממתין/.test(row), 'ב«בקשות»: «השלמת מידע לשנת 2024» — «טיוטה»', row);
    await shot(page, 's2-requests', true);
    if (VP === 'mobile') ok(await noHScroll(page), 'טלפון: «בקשות» בלי גלילה הצידה');
    await ctx.close();
  }

  // ═══ 3. קליטה: פרסום ← הלקוח עונה (ילדים, כתובת, בנק, תעודה מכמה תמונות) ═══
  {
    console.log('\n▶ קליטה — הלקוח'); section = 'קליטה — הלקוח';
    const { ctx, page } = await newPage();
    await page.goto(officeUrl(A), { waitUntil: 'domcontentloaded' });
    await page.locator('[data-intake-open]').click({ timeout: 45000 });
    const ov = L(page, '.ty-overlay');
    await ov.waitFor({ timeout: 20000 });
    // ‼ ההחלטה «החלף בקליטה» נטענת רגע אחרי החלון — מחכים לה (בלעדיה השאלון לא שואל שוב על פרטים קבועים: ילדים, כתובת…)
    const rep = ov.getByRole('button', { name: 'החלף בקליטה' });
    if (await rep.waitFor({ timeout: 20000 }).then(() => true).catch(() => false)) { await rep.click(); await ov.getByRole('button', { name: 'החלף בקליטה' }).waitFor({ state: 'detached', timeout: 15000 }).catch(() => {}); await sleep(800); }
    await ov.getByRole('button', { name: /^הוסף \d+ שאלות/ }).first().click();
    await ov.locator('h3', { hasText: 'מוכן לדף האישי' }).waitFor({ timeout: 20000 });
    for (let k = 0; k < 3 && !(await text(page.locator('.ty-ok'))).includes('פורסם'); k++) { await ov.getByRole('button', { name: 'פרסם בדף האישי' }).click({ timeout: 8000 }).catch(() => {}); await sleep(2000); }
    ok((await text(page.locator('.ty-ok'))).includes('פורסם'), 'משרד: הקליטה פורסמה בדף האישי (בלי מייל)');
    // הלקוח
    await page.goto(env.portalUrl(), { waitUntil: 'domcontentloaded' });
    await page.locator('.pp-item', { hasText: 'השלמת פרטים לתיק המס' }).getByRole('button', { name: /^להשלמת המידע$/ }).click({ timeout: 45000 });
    const scr = L(page, '[data-tax-info-screen]');
    await scr.locator('.ty-q').first().waitFor({ timeout: 30000 });
    ok(!!(await text(scr.locator('.ty-hint'))), 'הסבר גלוי מתחת לשאלה');
    let idDone = 0;
    const done = await answerAll(page, async (q, flow) => {
      if (/^הילדים/.test(q)) {
        await flow.getByRole('button', { name: 'משהו השתנה' }).click();
        const rec = flow.locator('[data-record="children"]'); await rec.waitFor();
        await rec.locator('.rec-card').nth(1).getByRole('button', { name: /הסרת/ }).click();
        await rec.locator('.rec-card').first().getByLabel('שם פרטי').fill('יואב');
        await rec.getByRole('button', { name: /הוספת ילד/ }).click();
        const card = rec.locator('.rec-card').last(); await card.getByLabel('שם פרטי').fill('נועם'); await card.locator('input[type="date"]').fill('2021-04-12');
        await nextQ(flow); return true;
      }
      if (/^כתובת המגורים|^מה כתובת המגורים/.test(q)) {
        if (await flow.getByRole('button', { name: 'משהו השתנה' }).count()) await flow.getByRole('button', { name: 'משהו השתנה' }).click();
        const rec = flow.locator('[data-record="address"]'); await rec.waitFor();
        await rec.getByLabel('יישוב').fill('רמת גן'); await rec.getByLabel('רחוב').fill('ביאליק'); await rec.getByLabel('מספר בית').fill('7'); await rec.getByLabel('דירה').fill('3');
        await nextQ(flow); return true;
      }
      if (/^(חשבון הבנק|לאיזה חשבון)/.test(q)) {
        if (await flow.getByRole('button', { name: 'משהו השתנה' }).count()) await flow.getByRole('button', { name: 'משהו השתנה' }).click();
        const rec = flow.locator('[data-record="bank"]'); await rec.waitFor();
        const bi = rec.getByRole('textbox', { name: 'בנק', exact: true });
        if (await bi.count()) { await bi.fill('פועלים'); await rec.getByRole('option', { name: /בנק הפועלים/ }).first().click(); }
        else { await rec.getByRole('button', { name: 'שינוי' }).first().click(); await rec.getByRole('textbox', { name: 'בנק', exact: true }).fill('פועלים'); await rec.getByRole('option', { name: /בנק הפועלים/ }).first().click(); }
        await rec.getByRole('textbox', { name: 'סניף', exact: true }).fill('רמת אביב'); await rec.getByRole('option').first().click();
        await rec.getByRole('textbox', { name: 'מספר חשבון' }).fill('0123456');
        await rec.getByRole('radiogroup', { name: 'על שם מי החשבון' }).getByRole('radio').first().click();
        await nextQ(flow); return true;
      }
      if (/תעודת הזהות/.test(q) && await flow.locator('[data-testid="doc-parts-picker"]').count()) {
        const dp = () => page.locator('[data-tax-info-screen] [data-testid="doc-parts-picker"]');
        if (idDone === 1) { ok(await dp().locator('.dp-file').count() === 0, 'תעודה של בן/בת הזוג — ריקה (מסמך נפרד לכל אדם)'); idDone = 2; return false; }
        if (idDone) return false;
        idDone = 1;
        await dp().locator('[data-testid="dp-front-file"]').setInputFiles(png('front.png', [200, 80, 80]));
        await dp().locator('[data-testid="dp-bulk-file"]').setInputFiles([png('appendix-1.png', [80, 200, 80]), png('appendix-2.png', [80, 80, 200]), { name: 'back.png', mimeType: 'image/png', buffer: Buffer.from('לא תמונה') }]);
        await sleep(400);
        for (const [nm, slot] of [['appendix-1.png', 'appendix'], ['appendix-2.png', 'appendix'], ['back.png', 'back']]) await dp().getByLabel(`איזה חלק — ${nm}`).selectOption(slot);
        await dp().getByTestId('dp-confirm').click();
        await dp().locator('[role="alert"]').waitFor({ timeout: 20000 });
        const before = await one(`select count(*)::int n from public.tax_evidence where client_id = '${A}' and doc_kind = 'idCard'`);
        ok(/התמונות שצורפו נשמרו/.test(await text(dp().locator('[role="alert"]'))) && await dp().locator('.dp-file').count() === 4 && before.n === 0, 'כשל באיחוד: הודעה, ארבע התמונות נשארו, ושום דבר לא נשמר בשרת');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('[data-tax-info-screen] .ty-q').first().waitFor({ timeout: 30000 });
        for (let k = 0; k < 25 && !/תעודת הזהות/.test(await text(page.locator('[data-tax-info-screen] .ty-q'))); k++) { const b = page.locator('[data-tax-info-screen] .ty-flow').getByRole('button', { name: /^הבא$/ }); if (await b.count()) await b.click(); await sleep(400); }
        await dp().locator('.dp-file').first().waitFor({ timeout: 15000 }).catch(() => {});
        ok(await dp().locator('.dp-file').count() === 4, 'יציאה וחזרה: החלקים נשמרו במכשיר');
        await dp().locator('[data-slot="back"] .dp-file').getByRole('button', { name: 'הסרה' }).click();
        await dp().getByTestId('dp-confirm').click();
        await page.waitForFunction(() => !/תעודת הזהות/.test(document.querySelector('[data-tax-info-screen] .ty-q')?.textContent ?? '') || !!document.querySelector('[data-finish]'), null, { timeout: 45000 }).catch(() => {});
        await sleep(1500);
        const ev = await sql(`select e.file_name, e.parts, e.document_id, d.storage_path is not null has_file from public.tax_evidence e left join public.documents d on d.id = e.document_id where e.client_id = '${A}' and e.doc_kind = 'idCard'`);
        ok(ev.length === 1 && /\.pdf$/i.test(ev[0].file_name ?? '') && ev[0].has_file, 'בשרת: מסמך אחד (PDF) של הלקוח, עם קובץ באחסון', JSON.stringify(ev));
        ok(JSON.stringify((ev[0]?.parts ?? []).map(p => `${p.page}:${p.name}`)) === JSON.stringify(['1:front.png', '2:appendix-1.png', '3:appendix-2.png']), 'בשרת: עקיבות — קדמי ואז הספח, עם שם כל קובץ מקור', JSON.stringify(ev[0]?.parts));
        return true;
      }
      return false;
    });
    ok(done, 'הלקוח סיים את השאלון');
    const fin = L(page, '[data-finish]');
    const ft = await text(fin);
    ok(/התשובות נשלחו למשרד/.test(ft) && /נשאר(ו)? .*מסמכ.*להשלמה/.test(ft), 'סיום: «התשובות נשלחו למשרד» ו«נשארו N מסמכים להשלמה»', ft.slice(0, 200));
    await shot(page, 's3-finish', VP === 'mobile');
    await scr.getByRole('button', { name: /חזרה לבקשות/ }).first().click();
    await sleep(2500);
    const item = await text(page.locator('.pp-item', { hasText: 'השלמת פרטים לתיק המס' }));
    ok(/נשאר(ו)? .*מסמכ.*להשלמה/.test(item) && await page.locator('.pp-item', { hasText: 'השלמת פרטים לתיק המס' }).getByRole('button', { name: 'להעלאת המסמכים' }).count() === 1,
      'ב«בקשות» של הלקוח: «נשארו N מסמכים להשלמה» ו«להעלאת המסמכים» (מהשרת, 241)', item);
    if (VP === 'mobile') ok(await noHScroll(page), 'טלפון: הדף האישי בלי גלילה הצידה');
    const infoSt = await one(`select status, ball from public.onboarding_steps where client_id = '${A}' and step_type = 'info_collection' and payload->>'parentStepId' = (select id from public.onboarding_steps where client_id = '${A}' and step_type = 'tax_file_intake')`);
    ok(infoSt.status !== 'completed', `האיסוף לא סומן «הושלם» כשחסרים מסמכים (${infoSt.status}/${infoSt.ball})`);
    await ctx.close();
  }

  // ═══ 4. המשרד: אישור ועדכון התיק — השמטה בהכרעה, בנק שנסגר, כתובת עם שינוי במקביל ═══
  {
    console.log('\n▶ אישור ועדכון התיק'); section = 'אישור ועדכון התיק';
    const { ctx, page } = await newPage();
    await page.goto(officeUrl(A), { waitUntil: 'domcontentloaded' });
    await page.locator('[data-intake-open]').click({ timeout: 45000 });
    const ov = L(page, '.ty-overlay');
    await ov.waitFor({ timeout: 20000 });
    const kids = ov.locator('.ty-row', { hasText: 'ילדים' }).filter({ has: page.locator('[data-omitted-list]') }).first();
    await kids.waitFor({ timeout: 30000 });
    const kt = await text(kids);
    ok(/יואב/.test(kt) && /נועם/.test(kt) && /פריט אחד בתיק לא הופיע בתשובה/.test(kt), 'ילדים: התשובה בשורות, והילד שהושמט מוצג', kt.slice(0, 300));
    ok(await kids.locator('[data-approve-update]').isDisabled(), '«אשר ועדכן בתיק» חסום עד הכרעה');
    await kids.locator('[data-omitted] [data-omit-action="error"]').check();
    await shot(page, 's4-kids', VP === 'mobile');
    await kids.locator('[data-approve-update]').click();
    await page.waitForTimeout(3000);
    ok(/אושר ועודכן בתיק/.test(await text(page.locator('.ty-ok'))), 'ילדים: אושר ועודכן', await text(page.locator('.ty-ok, .ty-err')));
    const ch = await one(`select children from public.clients where id = '${A}'`);
    const names = (ch.children ?? []).map(k => `${k.id}:${k.firstName ?? ''}`).join(',');
    ok(ch.children.length === 2 && /^k1:יואב,/.test(names) && /נועם/.test(names) && !names.includes('k2'), 'בשרת: k1 נקרא «יואב», «נועם» נוסף, k2 יצא (נרשם בטעות) — בלי כפילות', names);
    const chHist = await one(`select old_value from public.tax_fact_changes where client_id = '${A}' and field_key = 'children' and status = 'accepted'`);
    ok((chHist?.old_value?.patch?.children ?? []).some(k => k.id === 'k2' && k.hasDisability === true), 'בשרת: הרשימה הקודמת (כולל k2 ונתון הנכות) בהיסטוריה');
    // בנק: החשבון הקודם — «החשבון נסגר» עם תאריך
    const bank = ov.locator('.ty-row', { hasText: 'חשבון בנק' }).filter({ has: page.locator('[data-omitted-list]') }).first();
    await bank.waitFor({ timeout: 20000 });
    await bank.locator('[data-omitted] [data-omit-action="end"]').check();
    await bank.locator('[data-omit-date]').fill('2026-09-30');
    await bank.locator('[data-approve-update]').click();
    await page.waitForTimeout(3000);
    const bk = await one(`select bank_accounts from public.clients where id = '${A}'`);
    const old = bk.bank_accounts.find(b => b.id === 'b1'), nw = bk.bank_accounts.find(b => b.id !== 'b1');
    ok(old?.closedAt === '2026-09-30' && old.isPrimary === false && nw?.isPrimary === true && nw.branchNumber?.length === 3 && nw.accountNumber === '0123456', 'בשרת: החשבון הקודם «נסגר» (נשאר בהיסטוריה), החדש — להחזרים, אפסים מובילים נשמרו', JSON.stringify(bk.bank_accounts));
    // כתובת — שינוי במקביל: מישהו עדכן את הכתובת אחרי שהמסך נטען ⇒ ממתין, לא נדרס
    const addr = ov.locator('.ty-row', { hasText: 'כתובת מגורים' }).first();
    await addr.waitFor({ timeout: 20000 });
    await sql(`update public.clients set address = 'הרצל 99' where id = '${A}'`);
    await addr.locator('[data-approve-update]').click();
    await page.waitForTimeout(3000);
    const ad = await one(`select address, city from public.clients where id = '${A}'`);
    const pend = await sql(`select field_key, status from public.tax_fact_changes where client_id = '${A}' and field_key in ('address','city') order by field_key`);
    const msg = await text(page.locator('.ty-ok, .ty-err'));
    ok(ad.address === 'הרצל 99' && pend.some(p => p.field_key === 'address' && p.status === 'pending') && /השתנה מאז/.test(msg),
      'שינוי במקביל: הכתובת לא נדרסה; העדכון ממתין בתיק המס, וההודעה אומרת זאת', JSON.stringify([ad, pend, msg.slice(0, 120)]));
    ok(pend.some(p => p.field_key === 'city' && p.status === 'accepted') && ad.city === 'רמת גן', 'היישוב (שלא השתנה בינתיים) עודכן', JSON.stringify(pend));
    await shot(page, 's4-review-after', VP === 'mobile');
    if (VP === 'mobile') ok(await noHScroll(page), 'טלפון: מסך הבדיקה בלי גלילה הצידה');
    await ctx.close();
  }

  // ═══ 5. דוח 2024: תחולת הנכס — פרסום, תשובה «בחלק מהשנה, מ-3.2024», «אשר ועדכן תאריכים» ═══
  {
    console.log('\n▶ דוח 2024 — תחולה'); section = 'דוח 2024 — תחולה';
    const { ctx, page } = await newPage();
    await page.goto(officeUrl(A), { waitUntil: 'domcontentloaded' });
    const works = L(page, '[data-section="works"]');
    await works.waitFor({ timeout: 45000 });
    await works.locator('li', { hasText: 'דוח שנתי 2024' }).first().getByRole('button', { name: 'פתח' }).click();
    const ov = L(page, '.ty-overlay');
    await ov.waitFor({ timeout: 20000 });
    for (let k = 0; k < 3 && !(await text(page.locator('.ty-ok'))).includes('פורסם'); k++) { await ov.getByRole('button', { name: 'פרסם בדף האישי' }).click({ timeout: 8000 }).catch(() => {}); await sleep(2000); }
    ok((await text(page.locator('.ty-ok'))).includes('פורסם'), 'דוח 2024: פורסם בדף האישי (בלחיצה, בלי מייל)');
    await page.goto(env.portalUrl(), { waitUntil: 'domcontentloaded' });
    await page.locator('.pp-item', { hasText: 'השלמת מידע לשנת 2024' }).getByRole('button', { name: /^להשלמת המידע$/ }).click({ timeout: 45000 });
    await page.locator('[data-tax-info-screen] .ty-q').first().waitFor({ timeout: 30000 });
    let seen = false;
    const done = await answerAll(page, async (q, flow) => {
      if (await flow.locator('[data-record="period"]').count()) {
        const rec = flow.locator('[data-record="period"]');
        if (/הרצל/.test(q)) {
          seen = true;
          await rec.getByRole('radio', { name: /רק בחלק/ }).click();
          await rec.getByLabel('ממתי — כמה מדויק').selectOption('month');
          await rec.getByLabel('חודש').first().selectOption('3');
          await rec.getByLabel('שנה').first().fill('2024');
          await shot(page, 's5-period', VP === 'mobile');
        } else await rec.getByRole('radio').first().click();
        await nextQ(flow); return true;
      }
      if (/^(חשבון הבנק|לאיזה חשבון)/.test(q)) { // בדוח: «לאיזה חשבון להעביר החזר» — אותו חשבון
        const rec = flow.locator('[data-record="bank"]');
        if (await rec.count()) {
          const bi = rec.getByRole('textbox', { name: 'בנק', exact: true });
          if (await bi.count()) { await bi.fill('פועלים'); await rec.getByRole('option', { name: /בנק הפועלים/ }).first().click(); }
          await rec.getByRole('textbox', { name: 'סניף', exact: true }).fill('רמת אביב'); await rec.getByRole('option').first().click();
          await rec.getByRole('textbox', { name: 'מספר חשבון' }).fill('0123456');
          await rec.getByRole('radiogroup', { name: 'על שם מי החשבון' }).getByRole('radio').first().click();
          await nextQ(flow); return true;
        }
      }
      return false;
    });
    ok(seen, 'שאלת תחולה לנכס בלי תאריך (הרצל 12) — לא מניחים 1 בינואר');
    ok(done, 'הלקוח סיים את שאלון 2024');
    const pf = await one(`select value, period_kind from public.tax_year_facts where client_id = '${A}' and item_key = 'period.property' and entity_ref = 'p1'`);
    ok(pf?.value?.inPeriod === 'part' && pf.value.from?.date === '2024-03-01' && pf.value.from?.precision === 'month' && pf.period_kind === 'year', 'בשרת: תשובת התחולה עם דיוק «חודש»', JSON.stringify(pf));
    await page.goto(officeUrl(A), { waitUntil: 'domcontentloaded' });
    await works.waitFor({ timeout: 45000 });
    await works.locator('li', { hasText: 'דוח שנתי 2024' }).first().getByRole('button', { name: 'פתח' }).click();
    await ov.waitFor({ timeout: 20000 });
    const pRow = ov.locator('.ty-row').filter({ has: page.getByRole('button', { name: 'אשר ועדכן תאריכים' }) }).first();
    await pRow.waitFor({ timeout: 30000 });
    ok(/נרכש 01\.03\.2024/.test(await text(pRow.locator('[data-card-plan]'))), 'משרד: «יעודכן בתיק: נרכש 01.03.2024»');
    await pRow.getByRole('button', { name: 'אשר ועדכן תאריכים' }).click();
    await page.waitForTimeout(3000);
    const pr = await one(`select properties from public.clients where id = '${A}'`);
    const p1 = pr.properties.find(p => p.id === 'p1');
    ok(p1?.purchaseDate === '2024-03-01' && p1.purchasePrecision === 'month' && p1.isRented === true, 'בשרת: לנכס תאריך רכישה בדיוק «חודש», ושאר הפרטים לא נגעו', JSON.stringify(p1));
    await shot(page, 's5-period-approved', VP === 'mobile');
    await ctx.close();
  }
} catch (e) { ok(false, `חריגה ב«${section}»: ${String(e.message).split('\n')[0]}`); if (curPage?.cur) await curPage.cur.screenshot({ path: join(SHOTS || '.', `error-${VP}.png`), fullPage: true }).catch(() => {}); }

// ── סיכום: מיילים, 401, ניקוי ──
const mails = await one(`select count(*)::int n from public.email_messages where client_id in ('${A}','${B}')`);
ok(mails.n === 0, 'אין שורות ב-email_messages ללקוחות הבדיקה (שום מייל לא יצא)');
ok(blocked.length === 0, 'אין פניות מחוץ ל-staging/localhost (ייצור חסום)', blocked.slice(0, 4).join(' | '));
const real401 = http401.filter(x => !x.simulated);
ok(real401.every(x => x.recoveredMs !== undefined), 'כל 401 אמיתי — אותה בקשה הצליחה אחריו, בלי רענון', JSON.stringify(real401.map(x => [x.url.slice(-20), x.recoveredMs])));
ok(consoleErrors.filter(e => !/401|Unauthorized/.test(e)).length === 0, 'אין שגיאות בדפדפן (מלבד 401 — מתועד בנפרד)', consoleErrors.slice(0, 5).join(' | '));
console.log(`\n401: ${http401.length}`); for (const x of http401.slice(0, 8)) console.log('   ', JSON.stringify(x));
console.log('שגיאות HTTP אחרות:', httpErrors.slice(0, 10).join(' | ') || 'אין');
const c = await env.cleanup();
ok(c.left === 0 && c.storageLeft === 0, `ניקוי: לקוחות הבדיקה נמחקו (${c.files} קבצים מהאחסון), 0 שאריות`, JSON.stringify(c));
console.log(`\n${pass} עברו, ${fail} נכשלו (${VP})`);
if (SHOTS) writeFileSync(join(SHOTS, `results-${VP}.json`), JSON.stringify({ pass, fail, results, http401, httpErrors, consoleErrors, blocked }, null, 1));
await browser.close();
process.exit(fail ? 1 : 0);
