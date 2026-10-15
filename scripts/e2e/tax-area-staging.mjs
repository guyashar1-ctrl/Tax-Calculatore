#!/usr/bin/env node
/**
 * tax-area-staging.mjs — «מס» והסרת עבודת מס (242) מול המסד האמיתי של staging, בבנייה לפרסום (vite build --mode staging).
 *
 *   STAGING_ENV_DIR=<תיקייה עם .env.staging ו-.env.local> node scripts/e2e/tax-area-staging.mjs --base=http://localhost:4747 [--vp=desktop|mobile] [--shots=<dir>]
 *
 * ‼ לקוח בדיקה חדש לכל ריצה (staging-session.mjs), נמחק בסוף עם סריקת שאריות. כל פנייה שאינה ל-staging או ל-localhost נחסמת.
 * ‼ אין מיילים: לא לוחצים «שלח מייל…», ובסוף נבדק שאין שורות ב-email_messages ללקוחות הבדיקה.
 * המסלול (מחשב): מחיקה של טיוטה · פרסום בלי מייל ← תשובת לקוח (אותה פונקציה שהדף האישי קורא לה) ← אישור במשרד בממשק ←
 *   ביטול מדף העבודה (מה נשמר, מה נסגר, הדף האישי) ← «בוטלו» ← החזרה · כפילות: עבודה חדשה לאותה שנה ואז החזרת הישנה ·
 *   עבודה שהושלמה · משתמש אחר · קישורים ישנים. טלפון: כניסה, מחיקה, «בוטלו» והחזרה, בלי גלילה הצידה.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d);
const BASE = arg('base', 'http://localhost:4747');
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
const lit = (v) => `$q$${v}$q$`;
const OFFICE = 'ca158d52-5ad7-47f5-b228-4b7703978b84';
const asUser = async (sub, expr) => (await sql(`begin; set local role authenticated;
  select set_config('request.jwt.claims', ${lit(JSON.stringify({ sub, role: 'authenticated' }))}, true);
  select (${expr}) as r; commit;`))[0]?.r;
const token = new URL(env.portalUrl()).searchParams.get('portal');
console.log(`לקוחות בדיקה: ${env.run} (A=${A.slice(0, 8)}…) · ${VP}`);

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const consoleErrors = [], blocked = [], httpErrors = [], http401 = [];
async function newPage() {
  const mobile = VP === 'mobile';
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'he-IL' });
  await env.initContext(ctx);
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
    const host = new URL(u).hostname;
    if (host === 'localhost' || host === `${STAGING}.supabase.co` || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    blocked.push(u); return route.abort();
  });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/favicon|ResizeObserver/.test(m.text())) consoleErrors.push(m.text().slice(0, 240)); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + String(e).slice(0, 240)));
  page.on('response', async r => {
    if (!r.url().includes(STAGING)) return;
    const path = r.url().replace(/\?.*/, '').slice(-70);
    if (r.status() === 401) http401.push({ path, body: (await r.text().catch(() => '')).slice(0, 160), t: Date.now() });
    else if (r.status() < 300) { for (const x of http401) if (x.path === path && x.recoveredMs === undefined) x.recoveredMs = Date.now() - x.t; }
    if (r.status() >= 400) httpErrors.push(`${r.status()} ${path}`);
  });
  return { ctx, page };
}
const shot = async (page, name, full = false) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}-${VP}.png`), fullPage: full }).catch(() => {}); };
const text = async (loc) => ((await loc.count().catch(() => 0)) ? loc.first().innerText({ timeout: 5000 }).catch(() => '') : '');
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const go = async (page, hash) => {
  await page.goto('about:blank');
  await page.goto(`${BASE}/#${hash}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-tax-area]').waitFor({ timeout: 40000 });
  await page.locator('[data-tax-work] .tw-table, [data-domain], [data-domain-card]').first().waitFor({ timeout: 40000 }).catch(() => {});
  await sleep(1200);
};
const annualOpen = async () => sql(`select id, status, payload from public.onboarding_steps where client_id = '${A}' and step_type = 'annual_return' order by created_at`);
const row = (page) => page.locator('[data-tw-row="annual"]', { hasText: env.run });
const dlg = (page) => page.locator('[data-remove-work]');

async function addAnnual(page) {
  const tw = page.locator('[data-tax-work]');
  await tw.locator('[data-tw-add="annual"]').click();
  const d = page.locator('[data-add-work]');
  await d.waitFor({ timeout: 15000 });
  await d.getByLabel('חיפוש לקוח').fill(env.run + '-A');
  await d.locator('.aw-client', { hasText: env.run + '-A' }).first().locator('input').check();
  await d.getByRole('button', { name: /המשך לבדיקה/ }).click();
  const rv = await text(d.locator('[data-aw-row]'));
  await d.locator('[data-aw-create]').click();
  await d.locator('[data-aw-result]').first().waitFor({ timeout: 30000 });
  const res = await text(d.locator('[data-aw-result]'));
  await d.getByRole('button', { name: 'סיום' }).click();
  await sleep(1500);
  return { review: rv, result: res };
}
async function removeVia(page, opener, { pickCancel = false, reason = '' } = {}) {
  await opener.click();
  await dlg(page).locator('[data-rw-confirm]').waitFor({ timeout: 20000 });
  const t = await text(dlg(page));
  if (pickCancel) await dlg(page).getByText('לבטל ולשמור בהיסטוריה').click();
  if (reason) await dlg(page).getByLabel(/למה/).fill(reason);
  return t;
}
const portalItems = async (page) => {
  await page.goto('about:blank');
  await page.goto(env.portalUrl(), { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  return (await text(page.locator('body'))).split('\n').map(l => l.trim()).filter(l => /2025/.test(l) && /(דוח|השלמת מידע|שאלות)/.test(l));
};

async function desktop() {
  const { ctx, page } = await newPage();
  try {
    // ── 1 · נפתחה בטעות ⇒ מחיקה ──
    await go(page, '/tax/work/annual');
    ok(await page.locator('[data-tax-work][data-section="annual"]').isVisible(), 'staging: «מס ← דוחות שנתיים» נטען');
    const a1 = await addAnnual(page);
    ok(/נוצרה|נוצר|✓/.test(a1.result) || (await annualOpen()).length === 1, 'נוצר דוח שנתי (טיוטה) ללקוח הבדיקה', a1.result);
    const [w1] = await annualOpen();
    const asks1 = (await one(`select count(*)::int n from public.tax_info_asks where parent_step_id = '${w1.id}'`)).n;
    ok(asks1 > 0, `נוצרה טיוטת שאלות (${asks1})`);
    await go(page, '/tax/work/annual');
    const t1 = await removeVia(page, row(page).first().locator('[data-tw-remove]'));
    ok(t1.includes('למחוק') && t1.includes('דבר לא יצא מהמשרד'), 'טיוטה: החלון מציע מחיקה ואומר שדבר לא יצא', t1.slice(0, 300));
    await shot(page, 'st-01-delete');
    await dlg(page).locator('[data-rw-confirm]').click(); await sleep(2000);
    ok(/נמחקה/.test(await text(page.locator('.ty-ok'))), 'אחרי מחיקה: הודעה ברורה', await text(page.locator('.ty-ok')));
    const left1 = await one(`select (select count(*) from public.onboarding_steps where id = '${w1.id}' or payload->>'parentStepId' = '${w1.id}')::int steps,
      (select count(*) from public.tax_info_asks where parent_step_id = '${w1.id}')::int asks`);
    ok(left1.steps === 0 && left1.asks === 0, 'במסד: העבודה, השלמת המידע והשאלות נמחקו', JSON.stringify(left1));

    // ── 2 · פרסום בלי מייל ← תשובת לקוח ← אישור ← ביטול ← החזרה ──
    await go(page, '/tax/work/annual');
    await addAnnual(page);
    const [w2] = await annualOpen();
    await go(page, '/tax/work/annual');
    await row(page).first().getByRole('button', { name: /^פתח/ }).click();
    const ov = page.locator('.ty-overlay');
    await ov.waitFor({ timeout: 30000 });
    // ‼ «פרסם בדף האישי» כבר הפעולה של עכשיו, או אחרי «לפרסם עכשיו» / «הוסף N שאלות»
    await ov.getByRole('button', { name: /^פרסם בדף האישי$|^לפרסם עכשיו$|^הוסף \d+ שאלות/ }).first().waitFor({ timeout: 30000 });
    if (!(await ov.getByRole('button', { name: 'פרסם בדף האישי' }).first().isVisible().catch(() => false))) await ov.getByRole('button', { name: /^לפרסם עכשיו$|^הוסף \d+ שאלות/ }).first().click();
    await ov.getByRole('button', { name: 'פרסם בדף האישי' }).first().waitFor({ timeout: 20000 });
    for (let k = 0; k < 3 && !(await text(ov.locator('.ty-ok'))).includes('פורסם'); k++) { await ov.getByRole('button', { name: 'פרסם בדף האישי' }).first().click().catch(() => {}); await sleep(2000); }
    ok((await text(ov.locator('.ty-ok'))).includes('פורסם'), 'פורסם בדף האישי (בלי מייל)', await text(ov.locator('.ty-ok')));
    await ov.getByRole('button', { name: 'סגירה' }).first().click(); await sleep(800);
    const pub = await one(`select (select published_at is not null from public.onboarding_steps where payload->>'parentStepId' = '${w2.id}' and step_type = 'info_collection') published,
      (select count(*) from public.tax_info_asks where parent_step_id = '${w2.id}' and state = 'published')::int open`);
    ok(pub.published && pub.open > 0, `במסד: השאלון פורסם (${pub.open} שאלות פתוחות)`, JSON.stringify(pub));
    const shown = await portalItems(page);
    ok(shown.length > 0, 'הדף האישי: העבודה מוצגת ללקוח', shown.join(' | '));
    // הלקוח עונה על שאלה אחת — אותה פונקציה שהדף האישי קורא לה (anon + אסימון הלקוח)
    const asks = await sql(`select id from public.tax_info_asks where parent_step_id = '${w2.id}' and state = 'published' order by created_at, id`);
    let answered = null;
    for (const a of asks) {
      const r = (await sql(`begin; set local role anon; select public.portal_submit_tax_info(${lit(token)}, '${a.id}'::uuid, '{"kind":"no"}'::jsonb) as r; commit;`))[0]?.r;
      if (r?.ok) { answered = a.id; break; }
    }
    ok(!!answered, 'הלקוח ענה על שאלה (דרך הדף האישי)');
    // המשרד מאשר בממשק
    await go(page, '/tax/work/annual');
    ok((await text(row(page).first())).includes('לבדוק'), 'ברשימה: «לבדוק פריט שהתקבל»', await text(row(page).first()));
    await row(page).first().getByRole('button', { name: /^פתח/ }).click();
    await ov.waitFor({ timeout: 30000 });
    const approve = ov.getByRole('button', { name: /^אשר$|^אשר את כולם$/ }).first();
    await approve.waitFor({ timeout: 20000 }).catch(() => {});
    if (await approve.count()) { await approve.click(); await sleep(2500); }
    const factsBefore = await one(`select count(*) filter (where status = 'accepted')::int accepted, count(*)::int total from public.tax_year_facts where request_id = '${w2.id}' or ask_id in (select id from public.tax_info_asks where parent_step_id = '${w2.id}')`);
    ok(factsBefore.accepted >= 1, `המשרד אישר את התשובה בממשק — ${factsBefore.accepted} פרט אושר`, JSON.stringify(factsBefore));
    const evBefore = (await one(`select count(*)::int n from public.tax_evidence where client_id = '${A}'`)).n;
    // ביטול מדף העבודה
    await ov.locator('[data-ty-remove]').click();
    await dlg(page).locator('[data-rw-confirm]').waitFor({ timeout: 20000 });
    const t2 = await text(dlg(page));
    ok(!t2.includes('למחוק') && /לא נמחקת/.test(t2) && /אושר/.test(t2) && /שאלות פתוחות נסגרות/.test(t2), 'יצא מהמשרד: רק ביטול; החלון מראה מה שאושר נשמר ושהשאלות הפתוחות נסגרות', t2.slice(0, 500));
    await dlg(page).getByLabel(/למה/).fill(`בדיקת staging ${env.run}`);
    await shot(page, 'st-02-cancel');
    await dlg(page).locator('[data-rw-confirm]').click(); await sleep(2500);
    const c2 = await one(`select (select status from public.onboarding_steps where id = '${w2.id}') parent,
      (select status from public.onboarding_steps where payload->>'parentStepId' = '${w2.id}' and step_type = 'info_collection') info,
      (select count(*) from public.tax_info_asks where parent_step_id = '${w2.id}' and state in ('draft','published','unavailable'))::int open_asks,
      (select count(*) from public.tax_info_asks where parent_step_id = '${w2.id}' and state = 'answered')::int answered,
      (select count(*) filter (where status = 'accepted') from public.tax_year_facts where request_id = '${w2.id}' or ask_id in (select id from public.tax_info_asks where parent_step_id = '${w2.id}'))::int accepted,
      (select count(*) from public.tax_evidence where client_id = '${A}')::int evidence`);
    ok(c2.parent === 'cancelled' && c2.info === 'cancelled' && c2.open_asks === 0, 'במסד: העבודה והשלמת המידע בוטלו, אין שאלה פתוחה', JSON.stringify(c2));
    ok(c2.answered === 1 && c2.accepted === factsBefore.accepted && c2.evidence === evBefore, 'במסד: התשובה, הפרט שאושר והמסמכים נשמרו', JSON.stringify(c2));
    const afterCancel = await portalItems(page);
    ok(shown.every(l => !afterCancel.includes(l)), 'הדף האישי: העבודה שבוטלה לא מוצגת', afterCancel.join(' | '));
    await go(page, '/tax/work/annual');
    await page.locator('[data-tw-state="cancelled"]').click(); await sleep(500);
    const cr = page.locator('[data-tw-bucket="cancelled"]', { hasText: env.run });
    ok(/בדיקת staging/.test(await text(cr)), '«בוטלו»: השורה עם הסיבה', await text(cr));
    await shot(page, 'st-03-cancelled');
    await removeVia(page, cr.first().locator('[data-tw-restore]'));
    await dlg(page).locator('[data-rw-confirm]').click(); await sleep(2500);
    ok(/הוחזרה/.test(await text(page.locator('.ty-ok'))), 'החזרה: הודעה', await text(page.locator('.ty-ok')));
    const r2 = await one(`select (select status from public.onboarding_steps where id = '${w2.id}') parent,
      (select count(*) from public.tax_info_asks where parent_step_id = '${w2.id}' and state = 'published')::int open_asks,
      (select count(*) filter (where status = 'accepted') from public.tax_year_facts where request_id = '${w2.id}' or ask_id in (select id from public.tax_info_asks where parent_step_id = '${w2.id}'))::int accepted`);
    ok(r2.parent !== 'cancelled' && r2.open_asks === pub.open - 1 && r2.accepted === factsBefore.accepted, `במסד: חזרה עם ${r2.open_asks} השאלות שנסגרו; הפרט שאושר נשאר אחד`, JSON.stringify(r2));
    const afterRestore = await portalItems(page);
    ok(shown.every(l => afterRestore.includes(l)), 'הדף האישי: אחרי החזרה העבודה מוצגת שוב', afterRestore.join(' | '));

    // ── 3 · כפילות: ביטול, עבודה חדשה לאותה שנה, ואז ניסיון להחזיר את הישנה ──
    await go(page, '/tax/work/annual');
    await removeVia(page, row(page).first().locator('[data-tw-remove]'), { reason: 'לפני עבודה חדשה' });
    await dlg(page).locator('[data-rw-confirm]').click(); await sleep(2500);
    const a3 = await addAnnual(page);
    ok(!/כבר קיימת/.test(a3.review), 'עבודה שבוטלה לא חוסמת עבודה חדשה לאותה שנה', a3.review);
    await go(page, '/tax/work/annual');
    await page.locator('[data-tw-state="cancelled"]').click(); await sleep(500);
    await removeVia(page, page.locator('[data-tw-bucket="cancelled"]', { hasText: env.run }).first().locator('[data-tw-restore]'));
    await dlg(page).locator('[data-rw-confirm]').click(); await sleep(2500);
    const sup = await text(dlg(page));
    ok(/נפתחה עבודה חדשה לאותה תקופה/.test(sup), 'החזרת הישנה: «נפתחה עבודה חדשה — ממשיכים בחדשה»', sup.slice(0, 300));
    await shot(page, 'st-04-superseded');
    await page.keyboard.press('Escape'); await sleep(300);
    const dup = await one(`select count(*) filter (where status not in ('completed','verified','skipped','cancelled','failed'))::int open_n, count(*)::int all_n from public.onboarding_steps where client_id = '${A}' and step_type = 'annual_return' and payload->>'taxYear' = '2025'`);
    ok(dup.open_n === 1 && dup.all_n === 2, 'במסד: דוח 2025 פתוח אחד בלבד (הישן נשאר מבוטל)', JSON.stringify(dup));
    const askDup = (await one(`select count(*)::int n from (select item_key, subject_role, coalesce(entity_ref,'') e from public.tax_info_asks where client_id = '${A}' and tax_year = 2025 and state in ('draft','published','unavailable') group by 1,2,3 having count(*) > 1) x`)).n;
    ok(askDup === 0, 'במסד: אין שאלה פתוחה כפולה', String(askDup));

    // ── 4 · עבודה שהושלמה ──
    const done = (await one(`insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, payload)
      values ('${OFFICE}', '${A}', 'wealth_declaration', 'internal', 'person', 'completed', 'me', '{"asOfDate":"2024-12-31","kind":"first","title":"הצהרת הון"}'::jsonb) returning id`)).id;
    await go(page, '/tax/work/wealth');
    await page.locator('[data-tw-state="done"]').click(); await sleep(600);
    const dr = page.locator('[data-tw-bucket="done"]', { hasText: env.run });
    ok(await dr.count() === 1 && await dr.first().locator('[data-tw-remove], [data-tw-restore]').count() === 0, 'עבודה שהושלמה: ב«הושלמו», בלי «הסר…»', await text(dr));
    const chk = await asUser(OFFICE, `public.tax_work_removal_check('${done}')`);
    const rm = await asUser(OFFICE, `public.remove_tax_work('${done}', 'cancel', null)`);
    ok(chk?.mode === 'none' && rm?.error === 'completed', 'השרת: עבודה שהושלמה — אין מחיקה ואין ביטול', JSON.stringify({ chk: chk?.mode, rm }));
    await page.goto('about:blank'); await page.goto(env.officeUrl(A, 'taxfile'), { waitUntil: 'domcontentloaded' });
    await page.locator('[data-section="works"]').waitFor({ timeout: 40000 }); await sleep(1500);
    const tf = await text(page.locator('[data-section="works"]'));
    ok(await page.locator('[data-section="works"] li[data-work="annual_return"] [data-tf-remove]').count() === 1
      && await page.locator('[data-section="works"] li[data-work="wealth_declaration"] [data-tf-remove]').count() === 0, 'תיק המס: «הסר…» לעבודה הפתוחה בלבד, לא להצהרה שהושלמה', tf.slice(0, 300));

    // ── 5 · משתמש אחר · קישורים ישנים ──
    const stranger = '00000000-0000-4000-8000-0000000000aa';
    const [cur] = (await annualOpen()).filter(x => !['cancelled', 'completed'].includes(x.status));
    let forb = '';
    try { await asUser(stranger, `public.remove_tax_work('${cur.id}', 'cancel', null)`); } catch (e) { forb = String(e.message); }
    ok(/forbidden|42501|not authorized/i.test(forb) && (await one(`select status from public.onboarding_steps where id = '${cur.id}'`)).status !== 'cancelled', 'משתמש אחר: נדחה, והעבודה לא השתנתה', forb.slice(0, 160));
    for (const [old, want] of [['/reference', '#/tax/learn'], ['/firm/taxWork', '#/tax/work']]) {
      await page.goto('about:blank'); await page.goto(`${BASE}/#${old}`, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-tax-area]').waitFor({ timeout: 40000 }); await sleep(800);
      ok((await page.evaluate(() => location.hash)).startsWith(want), `קישור ישן ‎#${old}‎ ← ‎${want}‎`, await page.evaluate(() => location.hash));
    }
  } catch (e) { ok(false, `desktop: חריגה`, e.message); await shot(page, 'st-error', true); }
  finally { await ctx.close(); }
}

async function mobile() {
  const { ctx, page } = await newPage();
  try {
    await page.goto(`${BASE}/#/tax`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-tax-area]').waitFor({ timeout: 40000 }); await sleep(1200);
    ok(await page.locator('.ta-rail').isVisible() && !(await page.locator('.tax-area .pg-pane').isVisible()), 'טלפון: «מס» נפתח ברשימה');
    await page.locator('[data-rail="work-annual"]').click(); await sleep(1500);
    await addAnnual(page);
    const t = await removeVia(page, row(page).first().locator('[data-tw-remove]'), { pickCancel: true, reason: 'טלפון' });
    ok(t.includes('למחוק'), 'טלפון: חלון ההסרה נפתח');
    ok(await noHScroll(page), 'טלפון: חלון ההסרה בלי גלילה הצידה');
    await shot(page, 'st-m-dialog');
    await dlg(page).locator('[data-rw-confirm]').click(); await sleep(2500);
    await page.locator('[data-tw-state="cancelled"]').click(); await sleep(500);
    const cr = page.locator('[data-tw-bucket="cancelled"]', { hasText: env.run });
    ok(await cr.count() === 1, 'טלפון: ב«בוטלו»');
    await removeVia(page, cr.first().locator('[data-tw-restore]'));
    await dlg(page).locator('[data-rw-confirm]').click(); await sleep(2500);
    ok(/הוחזרה/.test(await text(page.locator('.ty-ok'))), 'טלפון: הוחזרה');
    ok(await noHScroll(page), 'טלפון: הרשימה בלי גלילה הצידה');
    await shot(page, 'st-m-list');
  } catch (e) { ok(false, `mobile: חריגה`, e.message); await shot(page, 'st-m-error', true); }
  finally { await ctx.close(); }
}

try {
  if (VP === 'mobile') await mobile(); else await desktop();
  const em = (await one(`select count(*)::int n from public.email_messages m join public.onboarding_steps s on s.id = replace(m.step_id::text, '-', '') where s.client_id in ('${A}', '${B}')`)).n
    + (await one(`select count(*)::int n from public.email_messages where client_id in ('${A}', '${B}')`).catch(() => ({ n: 0 }))).n;
  ok(em === 0, 'אין מיילים ללקוחות הבדיקה', String(em));
  ok(blocked.length === 0, 'אין פנייה מחוץ ל-staging / localhost', blocked.slice(0, 3).join(' | '));
  // ‼ 401 «JWT issued at future» (PGRST303) — הפרש שעונים ב-staging מיד אחרי כניסה; האפליקציה מנסה שוב פעם אחת (jwtClockSkewRetry).
  //   הדפדפן רושם את ה-401 הראשון גם כשהניסיון החוזר הצליח — נחשב שגיאה רק אם לא התאושש או שהגוף אחר.
  const skewOk = http401.length > 0 && http401.every(x => /PGRST303/.test(x.body) && /issued at future/i.test(x.body) && x.recoveredMs !== undefined);
  if (http401.length) ok(skewOk, `401: ${http401.length} — «JWT issued at future», והבקשה הצליחה בניסיון החוזר`, JSON.stringify(http401));
  const realConsole = consoleErrors.filter(e => !(skewOk && /status of 401/.test(e)));
  ok(realConsole.length === 0, 'בלי שגיאות קונסול (מלבד 401 שהתאושש)', realConsole.slice(0, 3).join(' | '));
  if (httpErrors.length) console.log('   (שגיאות HTTP:', httpErrors.slice(0, 6).join(' | '), ')');
} finally {
  await browser.close();
  const c = await env.cleanup();
  ok(c.left === 0 && c.storageLeft === 0, `ניקוי: לקוחות הבדיקה נמחקו, אין שאריות (${c.files} קבצים)`, JSON.stringify(c));
  console.log(`\n${pass} עברו, ${fail} נכשלו`);
  if (SHOTS) writeFileSync(join(SHOTS, `results-${VP}.json`), JSON.stringify({ pass, fail, results, httpErrors }, null, 1));
  process.exit(fail ? 1 : 0);
}
