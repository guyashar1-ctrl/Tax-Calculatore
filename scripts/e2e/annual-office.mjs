#!/usr/bin/env node
/**
 * annual-office.mjs — הדוח השנתי במשרד: «חומרים» ליד «הדוח» (25.10.2026; docs/proposals/2026-10-25-annual-office-return.html), בדפדפן מול staging.
 *
 *   «דוח שנתי 2025» בלחיצה ⇒ המסך החדש (הסיכום הקודם — ב«כלים מתקדמים») ⇒ הלקוח עונה ומעלה מסמכים ⇒ המשרד פותח:
 *   התשובות נכנסות לבד (בלי «אשר») ⇒ «הזנה» ב-106: המסמך ליד השדות ⇒ «שמירה» ⇒ הסכום בסיכום ובטופס 1301 עצמו ⇒ הסט.
 *
 *   STAGING_ENV_DIR=<…> node scripts/e2e/annual-office.mjs --base=http://localhost:5391 [--widths=1280,390] [--shots=<dir>]
 *
 * ‼ כל פנייה לייצור נחסמת ומכשילה. בסוף — ניקוי וסריקת שאריות. בלי מיילים.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { prepare } from "./staging-session.mjs";

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=") ?? d);
const WIDTHS = arg("widths", "1280,390").split(",").map(Number);
const SHOTS = arg("shots", "");
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const { chromium } = createRequire(process.env.PW_CORE ?? "C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json")("playwright-core");
const PROD = "uoweoqtuiettozagwgdw", STAGING = "evdfxjqrkgugssfrdoxd";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/D/Ft6HmVAAAAAElFTkSuQmCC", "base64");

let pass = 0, fail = 0;
const ok = (c, m, info = "") => { c ? pass++ : fail++; console.log(`${c ? "  ✓" : "  ✗"} ${m}${!c && info ? ` — ${String(info).slice(0, 400)}` : ""}`); };
const text = async (loc) => ((await loc.count().catch(() => 0)) ? loc.first().innerText({ timeout: 5000 }).catch(() => "") : "");
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });

/** עונה עד «תודה»: אישורים — נכון; ברשת — «תרומות»; מסמך — מעלה קובץ; כן/לא — לא. */
async function answerAll(pp) {
  const flow = pp.locator('.ty-flow');
  let uploaded = 0;
  for (let step = 0; step < 50; step++) {
    // ‼ 20.10.2026 · השאלון החדש: «שליחה למשרד» מ«רגע לפני ששולחים», והמסמכים רק בסוף — מעלים אחד משם
    if (await pp.locator('.ty-flow[data-annual-docs]').count()) return { done: true, uploaded };
    if ((await pp.locator('.ty-flow').getAttribute('data-screen')) === 'review') {
      if (await flow.locator('[data-annual-send]').isDisabled()) return { done: false, uploaded, stuck: (await text(flow)).replace(/\s+/g, ' ').slice(0, 600) };
      await flow.locator('[data-annual-send]').click(); await pp.locator('.ty-flow[data-annual-docs]').waitFor({ timeout: 40000 }); continue;
    }
    // ‼ 21.10.2026 · סבב 2: «זה עדיין נכון?» — «נכון» בכל שורה; מסכי ריבועים לכל אדם; «הבא» = הכפתור הראשי
    const scr2 = await pp.locator('.ty-flow').getAttribute('data-screen');
    if (scr2 === 'confirmAll' || scr2 === 'grid') {
      const t0 = (await text(flow.locator('.ty-q').first())).trim();
      if (scr2 === 'confirmAll') {
        for (let n = 0; n < 20; n++) { const b = flow.locator('.ty-krow-card .ty-seg button', { hasText: /^נכון$/ }).first(); if (!(await b.count())) break; await b.click(); }
      } else {
      for (const k of ['donations.given']) { const t = flow.locator(`.ty-tile2-main[data-tile="${k}"]`); if (await t.count() && (await t.getAttribute('aria-pressed')) !== 'true') await t.click(); }
      }
      const p0 = await flow.getAttribute('data-person');
      await flow.locator('.ty-nav .btn-primary').click();
      await pp.waitForFunction(([t, pr]) => { const f = document.querySelector('.ty-flow'); return !!f?.hasAttribute('data-annual-docs') || (f?.querySelector('.ty-q')?.textContent ?? '') !== t || f?.getAttribute('data-person') !== pr; }, [t0, p0], { timeout: 40000 }).catch(() => {});
      await pp.waitForTimeout(300); continue;
    }
    // 22.10.2026 · סבב 2.1: מסך סימון (כן/לא של אותו נושא) — «אף אחד מאלה — הבא»
    if ((await pp.locator('.ty-flow').getAttribute('data-screen')) === 'checklist') {
      const t0 = (await text(flow.locator('.ty-q').first())).trim();
      await flow.locator('.ty-nav .btn-primary').click();
      await pp.waitForFunction((t) => { const f = document.querySelector('.ty-flow'); return !!f?.hasAttribute('data-annual-docs') || (f?.querySelector('.ty-q')?.textContent ?? '') !== t; }, t0, { timeout: 40000 }).catch(() => {});
      await pp.waitForTimeout(300); continue;
    }
    if ((await pp.locator('.ty-flow').getAttribute('data-screen')) === 'group') {
      for (const c of await flow.locator('.ty-group-card').all()) await c.locator('[data-tile="none"]').click();
      await flow.locator('.ty-nav .btn-primary').click(); await pp.waitForTimeout(600); continue;
    }
    if (await flow.locator('.ty-q', { hasText: /תודה!|התשובות נשלחו למשרד/ }).count()) return { done: true, uploaded };
    if (await flow.locator('.ty-done-mark').count()) { await flow.locator('.ty-nav .btn-primary').click(); await pp.waitForTimeout(300); continue; }
    const title = (await text(flow.locator('.ty-q').first())).trim();
    const next = async () => {
      await flow.locator('.ty-nav .btn-primary').click();
      await pp.waitForFunction((t) => (document.querySelector('.ty-flow .ty-q')?.textContent ?? '') !== t || !!document.querySelector('.ty-flow .ty-err'), title, { timeout: 20000 }).catch(() => {});
      await pp.waitForTimeout(250);
    };
    if (await flow.getByRole('button', { name: 'כן, הכול נכון' }).count()) {
      await flow.getByRole('button', { name: 'כן, הכול נכון' }).click();
      if ((await pp.locator('.ty-flow').getAttribute('data-screen')) !== 'confirmAll') { await next(); continue; }
      await pp.waitForFunction((t) => (document.querySelector('.ty-flow .ty-q')?.textContent ?? '') !== t, title, { timeout: 20000 }).catch(() => {});
      await pp.waitForTimeout(300); continue;
    }
    if (await flow.locator('.ty-tile[data-tile="none"]').count()) {
      const t = flow.locator('.ty-tile[data-tile="donations.given"]');
      if (await t.count()) await t.click(); else await flow.locator('.ty-tile[data-tile="none"]').click();
      await next(); continue;
    }
    if (await flow.locator('input[type="file"]').count()) {
      const single = flow.getByRole('button', { name: 'יש לי קובץ אחד שמכיל הכול' });
      if (await single.count()) { await single.first().click(); await pp.waitForTimeout(300); }
      await flow.locator('input[type="file"]').first().setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: PNG });
      await pp.waitForTimeout(800);
      const confirm = flow.locator('[data-testid=dp-confirm]');
      if (await confirm.count() && await confirm.first().isEnabled()) await confirm.first().click().catch(() => {});
      await pp.waitForFunction((t) => !document.querySelector('.ty-flow .ty-q')?.textContent?.includes(t) || !!document.querySelector('.ty-flow .ty-err'), title, { timeout: 30000 }).catch(() => {});
      uploaded++; continue;
    }
    if (/להעביר החזר/.test(title)) {
      await flow.locator('button', { hasText: 'חשבון בחו״ל' }).first().click();
      await flow.getByLabel('מדינה').fill('ארה״ב'); await flow.getByLabel('שם הבנק').fill('Chase'); await flow.getByLabel('IBAN או מספר חשבון').fill('US00TEST');
      await flow.locator('[role=radiogroup], [role=group]', { hasText: 'על שם מי החשבון' }).locator('button').first().click();
      await next(); continue;
    }
    if (/היה קיים|היה בבעלות/.test(title) && await flow.locator('button', { hasText: /^כן — / }).count()) { await flow.locator('button', { hasText: /^כן — / }).first().click(); await next(); continue; }
    if (await flow.locator('input[type="number"]').count()) { await flow.locator('input[type="number"]').first().fill('500'); await next(); continue; }
    // 290 · מין ותאריך הלידה של בן/בת הזוג (פותח את הפרק שלו/ה)
    if (await flow.locator('.rec-seg-btn', { hasText: 'אישה' }).count() && await flow.locator('input[type="date"]').count()) { await flow.locator('.rec-seg-btn', { hasText: 'אישה' }).first().click(); await flow.locator('input[type="date"]').first().fill('1988-04-12'); await next(); continue; }
    // 25.10.2026 · «יש / אין» לפני הכרטיסים (ילדים, מעסיקים) — «אין»
    if (await flow.locator('.rec-gate [data-gate="no"]').count()) { await flow.locator('.rec-gate [data-gate="no"]').first().click(); await next(); continue; }
    // 30.10.2026 · 315 · «מה שם האב של …?» — שדה טקסט אחד
    if (/שם האב/.test(title) && await flow.locator('input:not([type]), input[type="text"]').count()) { await flow.locator('input:not([type]), input[type="text"]').first().fill('משה'); await next(); continue; }
    if (await flow.locator('.ty-choice', { hasText: /^לא$/ }).count()) { await flow.locator('.ty-choice', { hasText: /^לא$/ }).first().click(); await next(); continue; }
    const first = flow.locator('.ty-choice').first();
    if (await first.count()) { await first.click(); await next(); continue; }
    if (await flow.locator('textarea').count()) { await flow.locator('textarea').first().fill('בדיקה'); await next(); continue; }
    return { done: false, uploaded, stuck: title };
  }
  return { done: false, uploaded };
}


async function uploadAll(pp) {
  const flow = pp.locator('.ty-flow');
  for (let n = 0; n < 8; n++) {
    const item = flow.locator('[data-owed]').first();
    if (!(await item.count())) break;
    await item.getByRole('button', { name: 'העלאה' }).click();
    const single = item.getByRole('button', { name: 'יש לי קובץ אחד שמכיל הכול' });
    if (await single.count()) { await single.first().click(); await pp.waitForTimeout(300); }
    await item.locator('input[type="file"]').first().setInputFiles({ name: `doc${n}.png`, mimeType: 'image/png', buffer: PNG });
    await pp.waitForTimeout(800);
    const confirm = item.locator('[data-testid=dp-confirm]');
    if (await confirm.count() && await confirm.first().isEnabled()) await confirm.first().click().catch(() => {});
    await pp.waitForFunction((k) => document.querySelectorAll('.ty-flow [data-done]').length > k, n, { timeout: 30000 }).catch(() => {});
  }
  return flow.locator('[data-done]').count();
}

async function runWidth(width) {
  console.log(`\n▶ הדוח השנתי במשרד — ${width}px`);
  const env = await prepare();
  const blocked = [], consoleErrors = [];
  const id = env.clientId;
  const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}-${width}.png`), fullPage: false }).catch(() => {}); };
  try {
    await env.sql(`delete from public.onboarding_steps where client_id = '${id}' and step_type = 'intake_questionnaire'`);
    const mobile = width < 700;
    const ctx = await browser.newContext({ viewport: { width, height: mobile ? 820 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'he-IL' });
    await env.initContext(ctx);
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.includes(PROD)) { blocked.push(u); return route.abort(); }
      if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
      const host = new URL(u).hostname;
      // ‼ מציג ה-PDF המובנה של כרום (המסמך ליד ההזנה) — משאבים פנימיים של הדפדפן, לא מארח זר
      if (host === 'localhost' || host === '127.0.0.1' || /^(data|blob|about|chrome|chrome-extension):/.test(u) || host.includes(STAGING)) return route.continue();
      blocked.push(u); return route.abort();
    });
    const onErr = (p, tag) => { p.on('console', m => { if (m.type() === 'error' && !/favicon|ResizeObserver|Failed to load resource/.test(m.text())) consoleErrors.push(`${tag}: ${m.text().slice(0, 200)}`); }); p.on('pageerror', e => consoleErrors.push(`${tag} pageerror: ${String(e).slice(0, 200)}`)); };
    const page = await ctx.newPage(); onErr(page, 'office');

    // 1 · דוח שנתי בלחיצה ⇒ המסך החדש
    await page.goto(env.officeUrl(id, 'journey'), { waitUntil: 'domcontentloaded' });
    const addBtn = page.getByRole('button', { name: /＋ בקשה חדשה/ }).first();
    await addBtn.waitFor({ timeout: 40000 }); await addBtn.click();
    await page.locator('[data-tax-file-toggle]').click();
    await page.locator('[data-annual-one-click]').click();
    const ws = page.locator('[data-annual-workspace]').first();
    await ws.waitFor({ timeout: 40000 });
    ok(await page.locator('[data-annual-summary]').first().isHidden(), 'הסיכום הקודם מוסתר (ב«כלים מתקדמים»)');
    ok(/באמצע השאלון|עוד לא התחיל|ממתין/.test(await text(ws.locator('[data-aw-status]'))), 'המצב: הלקוח באמצע השאלון', await text(ws.locator('[data-aw-status]')));
    const [st] = await env.sql(`select id from public.onboarding_steps where client_id = '${id}' and step_type = 'annual_return' and status <> 'cancelled'`);

    // 2 · הלקוח עונה ומעלה את המסמכים
    await page.locator('[data-testid="rl-page-more"]').click();
    const [pp] = await Promise.all([ctx.waitForEvent('page'), page.locator('[data-testid="rl-page"] [data-annual-as-client]').click()]);
    onErr(pp, 'portal');
    await pp.waitForFunction(() => document.body.innerText.includes('הדוח השנתי 2025'), null, { timeout: 30000 });
    const card = pp.locator('.pp-item', { has: pp.getByText('הדוח השנתי 2025', { exact: true }) }).first();
    await card.getByRole('button', { name: /^(להשלמת המידע|להעלאת המסמכים)$/ }).click();
    await pp.locator('.ty-flow').waitFor({ timeout: 15000 });
    const res = await answerAll(pp);
    ok(res.done, 'הלקוח שלח את השאלון', JSON.stringify(res));
    const up = await uploadAll(pp);
    ok(up >= 1, `הלקוח העלה מסמכים (${up})`);
    await pp.close();
    const pend0 = (await env.sql(`select count(*)::int n from public.tax_year_facts where client_id='${id}' and request_id='${st.id}' and status='pending' and source='portal'`))[0].n;
    // ‼ אם שורת הבקשה פתוחה אצל המשרד בזמן שהלקוח שולח — התשובות כבר נכנסו לבד; בודקים שיש תשובות מהלקוח לבקשה
    const portal0 = (await env.sql(`select count(*)::int n from public.tax_year_facts where client_id='${id}' and request_id='${st.id}' and source='portal'`))[0].n;
    ok(portal0 > 0, `הגיעו תשובות מהלקוח (${portal0}; ממתינות ${pend0})`);

    // 3 · המשרד פותח ⇒ התשובות נכנסות לבד
    await page.goto(env.officeUrl(id, `journey/${st.id}`), { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ws.waitFor({ timeout: 40000 });
    let pend = pend0;
    for (let k = 0; k < 20 && pend > 0; k++) { await page.waitForTimeout(1000); pend = (await env.sql(`select count(*)::int n from public.tax_year_facts where client_id='${id}' and request_id='${st.id}' and status='pending' and source='portal'`))[0].n; }
    ok(pend === 0, 'התשובות נכנסו לבד — בלי לחיצה על «אשר»', `pending=${pend}`);
    // 315 · שם האב נענה בשאלון — לכל אחד מבני הזוג, ונכנס לבד (לא «אצלך»)
    const fathers = await env.sql(`select subject_role, value->'items'->0->>'name' n from public.tax_year_facts where client_id='${id}' and item_key='filing.fatherName' and status='accepted' order by subject_role`);
    ok(fathers.map(r => `${r.subject_role}:${r.n}`).join(',') === 'client:משה,spouse:משה', 'שם האב מהשאלון — לשניהם', JSON.stringify(fathers));
    ok(!(await ws.getByRole('button', { name: /^אשר/ }).count()), 'אין כפתור «אשר» במסך');
    await page.waitForTimeout(1500);
    await shot(page, 'office-main');
    const mats = await ws.locator('[data-aw-mat]').count();
    ok(mats >= 1, `חומרים: ${mats} שורות`);
    const enter = ws.locator('[data-aw-mat="form106"] [data-aw-enter]').first();
    ok(await enter.count() === 1, '106 שהגיע — «הזנה»', await text(ws.locator('.aw-mats')));

    // 4 · «הזנה» ⇒ המסמך ליד השדות ⇒ «שמירה» ⇒ בדוח
    await enter.click();
    const panel = page.locator('[data-aw-panel="form106"]');
    await panel.waitFor({ timeout: 10000 });
    await panel.locator('.aw-doc img, .aw-doc iframe').first().waitFor({ timeout: 20000 }).catch(() => {});
    ok(await panel.locator('.aw-doc img, .aw-doc iframe').count() === 1, 'המסמך עצמו מוצג ליד השדות');
    ok(await panel.locator('[data-aw-save]').isDisabled(), 'בלי ערכים — «שמירה» כבויה');
    await panel.locator('[data-aw-line="106.gross"] input').fill('96400');
    await panel.locator('[data-aw-line="106.withheld"] input').fill('8120');
    const sel = panel.locator('.aw-fl select');
    if (await sel.count()) await sel.first().selectOption({ index: 1 });
    await shot(page, 'office-entry');
    await panel.locator('[data-aw-save]').click();
    await panel.waitFor({ state: 'detached', timeout: 20000 });
    const facts106 = await env.sql(`select f.status, f.value from public.tax_year_facts f where f.client_id='${id}' and f.line_key='106.gross' and f.status='accepted'`);
    ok(facts106.length === 1 && JSON.stringify(facts106[0].value).includes('96400'), 'נשמר כשורת מקור מאושרת — בלי אישור נוסף', JSON.stringify(facts106));
    await ws.locator('[data-aw-code="158"], [data-aw-code="172"]').first().waitFor({ timeout: 15000 }).catch(() => {});
    const sumTxt = await text(ws.locator('.aw-sum'));
    ok(/96,400/.test(sumTxt), 'הסכום בסיכום הדוח', sumTxt.slice(0, 300));
    await ws.locator('[data-aw-tab="1301"]').click();
    await ws.locator('[data-aw-form="1301"] img').waitFor({ timeout: 15000 });
    const pagesBtns = ws.locator('.aw-pages button');
    let found = 0;
    for (let k = 0; k < Math.max(1, await pagesBtns.count()) && !found; k++) {
      if (await pagesBtns.count()) await pagesBtns.nth(k).click();
      await page.waitForTimeout(300);
      found = await ws.locator('[data-aw-val="158"], [data-aw-val="172"]').count();
    }
    ok(found > 0 && /96,400/.test(await text(ws.locator('[data-aw-val="158"], [data-aw-val="172"]'))), 'בטופס 1301 עצמו — 96,400 בשדה');
    await shot(page, 'office-form');
    // 4ב · עמוד 1: הפרטים מהכרטיס בתאים (שם, שם משפחה); מצב משפחתי — רק כשהוא ידוע לשנה (25.10)
    await pagesBtns.nth(0).click();
    await page.waitForTimeout(300);
    const p1 = { F059: await text(ws.locator('[data-aw-val="F059"]')), F058: await text(ws.locator('[data-aw-val="F058"]')), F067: await text(ws.locator('[data-aw-val="F067"]')) };
    ok(p1.F059.includes('דוד') && p1.F058.length > 0 && (p1.F067 === '' || p1.F067 === 'X'), 'עמוד 1: שם ושם משפחה בתאים', JSON.stringify(p1));
    // ‼ 27.10: כל ערך נכנס לתא שלו — בלי חיתוך ובלי גלישה (גודל האות לפי התא בעמוד)
    const cut = await ws.locator('.aw-val').evaluateAll(els => els.filter(e => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).map(e => e.dataset.awVal + ':' + e.textContent));
    ok(cut.length === 0, 'עמוד 1: כל ערך נכנס לתא שלו', cut.join(' | '));
    await shot(page, 'office-p1');

    // 5 · «כלים מתקדמים» — המסך הקודם עדיין שם
    await ws.locator('[data-aw-advanced]').click();
    ok(await page.locator('[data-annual-summary]').first().isVisible(), '«כלים מתקדמים» פותח את המסך הקודם');
    await ws.locator('[data-aw-advanced]').click();

    // 6 · משלימים את כל החומרים (הזנה לכל מסמך, «רק אתה יודע», הערות) — עד שהסט נפתח
    for (let k = 0; k < 12; k++) {
      const b = ws.locator('[data-aw-enter]').first();
      if (!(await b.count())) break;
      await b.click();
      const pnl = page.locator('.aw-panel');
      await pnl.waitFor({ timeout: 10000 });
      const inputs = pnl.locator('[data-aw-line] input');
      for (let i = 0; i < await inputs.count(); i++) if (!(await inputs.nth(i).inputValue())) await inputs.nth(i).fill('1000');
      const s2 = pnl.locator('.aw-fl select');
      if (await s2.count() && !(await s2.first().inputValue())) await s2.first().selectOption({ index: 1 });
      if (await pnl.locator('[data-aw-save]').isDisabled()) { console.log('    [debug] לא ניתן לשמור: ' + (await text(pnl)).replace(/\s+/g, ' ').slice(0, 300)); await pnl.getByRole('button', { name: 'ביטול' }).click(); break; }
      await pnl.locator('[data-aw-save]').click();
      await pnl.waitFor({ state: 'detached', timeout: 20000 });
      await page.waitForTimeout(500);
    }
    const oykBtn = ws.locator('[data-aw-oyk] button');
    if (await oykBtn.count() && /הזנה/.test(await text(oykBtn))) {
      await oykBtn.click();
      const ins = ws.locator('.aw-inline input');
      for (let i = 0; i < await ins.count(); i++) { await ins.nth(i).fill('0'); await ins.nth(i).press('Tab'); await page.waitForTimeout(1200); }
    }
    for (let k = 0; k < 6; k++) { const b = ws.locator('[data-aw-note] button, [data-aw-unlisted] button').first(); if (!(await b.count())) break; await b.click(); await page.waitForTimeout(1200); }
    await page.waitForTimeout(1000);
    await shot(page, 'office-done');
    // ‼ 30.10.2026 · בלי «להשלים במשרד» מקובץ: שורה לכל פריט (data-aw-office-item) ו«פרטים לטופס» (data-aw-form-rest)
    const officeItems = async () => (await ws.locator('[data-aw-office-item]').evaluateAll(els => els.map(e => e.getAttribute('data-aw-office-item')))).filter(Boolean);
    ok(!(await ws.locator('[data-aw-office-rest]').count()), 'אין «להשלים במשרד» מקובץ');
    ok(!/הצהרות ותיבות סימון/.test(await text(ws.locator('.aw-minebox'))), 'הצהרות הטופס אינן משימה של המשרד');
    console.log('    [office-items] ' + (await officeItems()).join(',') + ' · [form-rest] ' + (await ws.locator('[data-aw-form-rest]').first().getAttribute('data-aw-form-rest').catch(() => '')));
    console.log('    [status] ' + await text(ws.locator('[data-aw-status]')) + ' · ' + (await text(ws.locator('.aw-mats'))).replace(/\s+/g, ' ').slice(0, 300));

    // 6ב · «להשלים במשרד» — העורכים הקיימים אינם נושא הבדיקה הזו: עובדה מאושרת לכל פריט, כדי להגיע ל«מוכן»
    const rest = (await officeItems()).join(',');
    const formRest = await ws.locator('[data-aw-form-rest]').first().getAttribute('data-aw-form-rest', { timeout: 2000 }).catch(() => null);
    if (formRest) {
      // «פרטים לטופס»: נפתח עם העורכים המובנים (לא «פירוט»), וממלאים דרך המסד כמו שאר הפריטים
      await ws.locator('[data-aw-form-rest] button').click();
      ok(await ws.locator('[data-aw-form-panel] .ar-editor').count() > 0 && !(await ws.locator('[data-aw-form-panel] input[placeholder="פירוט"]').count()), '«פרטים לטופס» — שדות מובנים, בלי «פירוט»');
      await env.sql(`insert into public.tax_year_facts (user_id, client_id, tax_year, item_key, subject_role, period_kind, period_from, period_to, answer, value, basis, source, status, request_id)
        select user_id, id, 2025, k, 'couple', 'year', '2025-01-01', '2025-12-31', 'value', v::jsonb, 'declared', 'office', 'accepted', '${st.id}'
        from public.clients, (values ('filing.identity', '{"fatherName":"משה","spouseFatherName":"אברהם","degreeCode":"3","spouseDegreeCode":"3"}'), ('filing.declarations', '{"F048":"60","F049":"2"}')) x(k, v) where id='${id}'`);
    }
    if (rest || formRest) {
      for (const it of rest ? rest.split(',') : []) {
        const [key, role0, ek, er] = it.split(':');
        // ‼ שורה אחת לנושא — גם כשהוא לשני בני הזוג; ממלאים לשניהם
        for (const role of (role0 === 'client' || role0 === 'spouse') ? ['client', 'spouse'] : [role0])
        await env.sql(`insert into public.tax_year_facts (user_id, client_id, tax_year, item_key, subject_role, entity_kind, entity_ref, period_kind, period_from, period_to, answer, value, basis, source, status, request_id)
          select user_id, id, 2025, '${key}', '${role}', ${ek ? `'${ek}'` : 'null'}, ${er ? `'${er}'` : 'null'}, 'year', '2025-01-01', '2025-12-31', 'value', '"בדיקה"'::jsonb, 'actual', 'office', 'accepted', '${st.id}'
          from public.clients where id='${id}'`);
      }
      await page.goto(env.officeUrl(id, `journey/${st.id}`), { waitUntil: 'domcontentloaded' }); await page.reload({ waitUntil: 'domcontentloaded' });
      await ws.waitFor({ timeout: 40000 });
      await page.waitForTimeout(2500);
    }

    console.log('    [after-seed] ' + ((await officeItems()).join(',') || '(none)') + ' · ' + await text(ws.locator('[data-aw-open]')) + ' · ' + (await text(ws.locator('.aw-mats'))).replace(/s+/g, ' ').slice(0, 400));
    // 6ג · 297 · שליחה לחתימה ⇒ הדף: שניהם חותמים ⇒ «נחתם» והקובץ החתום
    const sendSign = ws.locator('[data-aw-send-sign]');
    if (await sendSign.count()) {
      ok(/שליחה לחתימה/.test(await text(sendSign)), '«שליחה לחתימה» כשהכול מוכן');
      await sendSign.click();
      await ws.locator('[data-aw-signer="client"]').waitFor({ timeout: 20000 });
      ok(/נשלח לחתימה/.test(await text(ws.locator('[data-aw-status]'))) && await ws.locator('[data-aw-signer]').count() === 2, 'במשרד: «נשלח לחתימה» ושני החותמים', await text(ws.locator('[data-aw-status]')));
      await shot(page, 'sign-sent');
      const sp = await ctx.newPage(); onErr(sp, 'portal-sign');
      await sp.goto(env.portalUrl(), { waitUntil: 'domcontentloaded' });
      await sp.waitForFunction(() => document.body.innerText.includes('הדוח השנתי 2025 — לחתימה'), null, { timeout: 40000 });
      const item = sp.locator('.pp-item', { has: sp.getByText('הדוח השנתי 2025 — לחתימה', { exact: true }) }).first();
      ok(/שניכם חותמים/.test(await text(item)), 'בדף: «הדוח השנתי 2025 — לחתימה» · «שניכם חותמים»', await text(item));
      await item.getByRole('button', { name: 'לצפייה וחתימה' }).click();
      const scr = sp.locator('[data-annual-sign]');
      await scr.waitFor({ timeout: 20000 });
      await scr.locator('[data-as-tab="1301"]').click();
      await scr.locator('[data-aw-form="1301"] img').waitFor({ timeout: 20000 });
      ok(await scr.locator('[data-aw-form="1301"] img').count() === 1, 'בדף: הלקוח רואה את 1301 עצמו');
      await shot(sp, 'sign-portal');
      for (const [who, name] of [['client', 'דוד'], ['spouse', 'רחל']]) {
        await scr.locator('[data-as-sign]').waitFor({ timeout: 15000 });
        const whoTxt = await scr.locator('.as-who').first().textContent().catch(() => '');
        ok(new RegExp(`החתימה של ${name}`).test(whoTxt), `בדף: החתימה של ${name}`, whoTxt);
        ok(await scr.locator('[data-as-sign]').isDisabled(), `${name}: בלי הצהרה וחתימה — «חתימה» כבויה`);
        await scr.locator('[data-as-decl]').check();
        const pad = scr.locator('.as-pad canvas');
        await pad.scrollIntoViewIfNeeded(); await sp.waitForTimeout(300);
        const bb = await pad.boundingBox();
        await sp.mouse.move(bb.x + 30, bb.y + 60); await sp.mouse.down();
        for (let i = 1; i <= 12; i++) await sp.mouse.move(bb.x + 30 + i * 18, bb.y + 60 + Math.sin(i) * 25);
        await sp.mouse.up();
        await scr.locator('[data-as-sign]').click();
        await sp.waitForFunction((n) => (document.querySelector('[data-annual-sign] .as-thanks')?.textContent ?? '').includes(n === 'רחל' ? 'נחתם' : `תודה, ${n}`), name, { timeout: 20000 }).catch(() => {});
        if (who === 'client') { const th = await scr.locator('.as-thanks').first().textContent().catch(() => ''); ok(/תודה, דוד/.test(th) && /עכשיו רחל/.test(th), 'אחרי דוד: «תודה, דוד · עכשיו רחל»', th); }
      }
      ok(/נחתם/.test(await text(scr.locator('.as-thanks'))), 'בדף: «נחתם. תודה!»', await text(scr.locator('.as-thanks')));
      await shot(sp, 'sign-done');
      const sg = (await env.sql(`select state, signatures ? 'client' and signatures ? 'spouse' both from public.annual_return_signings where request_id='${st.id}' and state <> 'superseded'`))[0];
      ok(sg?.state === 'signed' && sg.both, 'בשרת: נחתם עם שתי החתימות', JSON.stringify(sg));
      await sp.close();
      // המשרד: «שניהם חתמו», והקובץ החתום נשמר במסמכים לבד
      await page.goto(env.officeUrl(id, `journey/${st.id}`), { waitUntil: 'domcontentloaded' }); await page.reload({ waitUntil: 'domcontentloaded' });
      await ws.waitFor({ timeout: 40000 });
      await ws.locator('[data-aw-signed-file]').waitFor({ timeout: 60000 }).catch(() => {});
      ok(/שניהם חתמו/.test(await text(ws.locator('[data-aw-status]'))), 'במשרד: «שניהם חתמו»', await text(ws.locator('[data-aw-status]')));
      const doc = (await env.sql(`select d.category, d.file_type, d.description from public.annual_return_signings g join public.documents d on d.id = g.signed_document_id where g.request_id='${st.id}' and g.state='signed'`))[0];
      ok(doc?.category === 'form_1301' && doc.file_type === 'application/pdf', 'הקובץ החתום נשמר במסמכים של הלקוח', JSON.stringify(doc));
      ok(await ws.locator('[data-aw-signed-file]').count() === 1, 'במשרד: «הקובץ החתום»');
      await shot(page, 'sign-office-done');
    } else {
      ok(false, '«שליחה לחתימה» לא הופיע', await text(ws.locator('[data-aw-status]')));
    }

    // 7 · הסט (כשמוכן) — או שהכפתור כבוי עם הסיבה
    const printBtn = ws.locator('[data-aw-print]');
    if (await printBtn.isEnabled()) {
      await printBtn.click();
      ok(/עמוד ריכוז/.test(await text(page.locator('.aw-set'))) && /1301/.test(await text(page.locator('.aw-set'))), 'הסט: עמוד ריכוז, 1301…');
      const [pw] = await Promise.all([ctx.waitForEvent('page'), page.locator('[data-aw-do-print]').click()]);
      await pw.waitForFunction(() => !!document.querySelector('.pg.sum'), null, { timeout: 60000 }).catch(() => {});
      ok(await pw.locator('.pg.sum').count() === 1 && await pw.locator('.pg.form').count() >= 1, 'חלון ההדפסה: ריכוז ועמודי הטופס');
      await pw.close().catch(() => {});
    } else {
      ok(!/הכול מוכן/.test(await text(ws.locator('[data-aw-status]'))), 'הסט כבוי — והמצב אומר מה חסר', await text(ws.locator('[data-aw-status]')));
    }
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'בלי גלילה לרוחב');
    ok((await env.sql(`select count(*)::int n from public.email_messages where client_id = '${id}'`))[0].n === 0, 'לא יצא מייל');
    await ctx.close();
  } catch (e) {
    ok(false, 'המסלול נעצר', String(e?.message ?? e).split('\n').slice(0, 3).join(' '));
  } finally {
    ok(blocked.length === 0, 'אין פנייה לייצור או למארח זר', blocked.slice(0, 3).join(' '));
    ok(consoleErrors.length === 0, 'בלי שגיאות בדפדפן', consoleErrors.slice(0, 3).join(' | '));
    if (process.argv.includes('--keep')) { console.log('    [keep] client=' + id); return; }
    const left = await env.cleanup().catch(e => ({ left: -1, err: String(e) }));
    ok(left.left === 0, 'ניקוי: לא נשארו שורות של לקוחות הבדיקה', JSON.stringify(left));
  }
}

for (const w of WIDTHS) await runWidth(w);
await browser.close();
console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
