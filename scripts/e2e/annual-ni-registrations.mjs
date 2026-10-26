#!/usr/bin/env node
/**
 * annual-ni-registrations.mjs — מה שרשום בביטוח לאומי בשאלון השנתי (26.10.2026), בדפדפן מול staging.
 *
 *   לקוח כמו יובל (סטודנט 10.2023–09.2026, עצמאי מ-06.2025, בלי עסק בכרטיס) ⇒ אצל הלקוח: «עסק או חשבוניות» מסומן מראש
 *   בלי מקור, «סיום התואר» ⇒ «מתי סיימת את התואר?» ⇒ במשרד: «רווח והפסד מפייפרלס» עם «לפי ביטוח לאומי: עצמאי מ-06.2025»,
 *   ו«לבדוק מול ביטוח לאומי» (סיים תואר ב-2025 ועדיין רשום כסטודנט) ⇒ «בורר».
 *
 *   STAGING_ENV_DIR=<…> node scripts/e2e/annual-ni-registrations.mjs --base=http://localhost:<port> [--widths=1280,390] [--shots=<dir>]
 *
 * ‼ כל פנייה לייצור נחסמת ומכשילה. בסוף — ניקוי. בלי מיילים.
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
const SEEN = {};
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
      // רישום בביטוח לאומי: «עסק» מסומן מראש (בלי מקור); «סיום התואר» — מסמנים כדי לפתוח את מסך הלימודים
      if ((await flow.getAttribute('data-person')) === 'client') {
        const biz = flow.locator('.ty-tile2-main[data-tile="business.started"]');
        if (await biz.count()) { SEEN.bizPreset = (await biz.getAttribute('aria-pressed')) === 'true'; SEEN.bizText = (await text(biz.locator('xpath=..'))).replace(/\s+/g, ' '); }
        const stu = flow.locator('.ty-tile2-main[data-tile="household.creditChanges"]');
        if (await stu.count()) { SEEN.studyLabel = (await text(stu.locator('b, .ty-tile2-label').first())).trim() || (await text(stu)).split('\n')[0].trim(); if ((await stu.getAttribute('aria-pressed')) !== 'true') await stu.click(); }
      }
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
    if (title === 'מתי סיימת את התואר?') {
      SEEN.studyTitle = title; SEEN.studyScreen = (await text(flow)).replace(/\s+/g, ' ');
      const sel = flow.locator('select').first(); if (await sel.count()) await sel.selectOption('2025');
      await pp.waitForTimeout(300);
      const no = flow.locator('.rec-seg-btn', { hasText: /^לא$/ }); if (await no.count()) await no.first().click();
      await pp.waitForTimeout(300);
      await flow.locator('.ty-nav .btn-primary').click();
      await pp.waitForFunction((t) => (document.querySelector('.ty-flow .ty-q')?.textContent ?? '') !== t || !!document.querySelector('.ty-flow .ty-err'), title, { timeout: 20000 }).catch(() => {});
      if (await flow.locator('.ty-err').count()) {
        if (SHOTS) await pp.screenshot({ path: join(SHOTS, `ni-study-stuck-${Date.now()}.png`) }).catch(() => {});
        return { done: false, uploaded, stuck: `studies: ${await text(flow.locator('.ty-err'))}` };
      }
      continue;
    }
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
  console.log(`\n▶ רישום בביטוח לאומי בשאלון — ${width}px`);
  const env = await prepare();
  const blocked = [], consoleErrors = [];
  const id = env.clientId;
  const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}-${width}.png`), fullPage: false }).catch(() => {}); };
  try {
    await env.sql(`delete from public.onboarding_steps where client_id = '${id}' and step_type = 'intake_questionnaire'`);
    // ‼ כמו יובל: סטודנט 10.2023–09.2026 ועצמאי מ-06.2025 בביטוח לאומי, בלי עסק בכרטיס
    const occ = [{ id: 'o1', type: 'student', source: 'btl_portal', sourceLabel: 'תלמיד להשכלה גבוהה', fromDate: '2023-10-01', toDate: '2026-09-30' },
      { id: 'o2', type: 'self_employed', source: 'btl_portal', sourceLabel: 'עצמאי', fromDate: '2025-06-01' }];
    await env.sql(`update public.clients set ni_occupations = $q$${JSON.stringify(occ)}$q$::jsonb, businesses = '[]'::jsonb where id = '${id}'`);
    const mobile = width < 700;
    const ctx = await browser.newContext({ viewport: { width, height: mobile ? 820 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'he-IL' });
    await env.initContext(ctx);
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.includes(PROD)) { blocked.push(u); return route.abort(); }
      if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
      const host = new URL(u).hostname;
      if (host === 'localhost' || host === '127.0.0.1' || /^(data|blob|about|chrome|chrome-extension):/.test(u) || host.includes(STAGING)) return route.continue();
      blocked.push(u); return route.abort();
    });
    const onErr = (p, tag) => { p.on('console', m => { if (m.type() === 'error' && !/favicon|ResizeObserver|Failed to load resource/.test(m.text())) consoleErrors.push(`${tag}: ${m.text().slice(0, 200)}`); }); p.on('pageerror', e => consoleErrors.push(`${tag} pageerror: ${e.message.slice(0, 200)}`)); };
    const page = await ctx.newPage(); onErr(page, 'office');

    await page.goto(env.officeUrl(id, 'journey'), { waitUntil: 'domcontentloaded' });
    const addBtn = page.getByRole('button', { name: /＋ בקשה חדשה/ }).first();
    await addBtn.waitFor({ timeout: 40000 }); await addBtn.click();
    await page.locator('[data-tax-file-toggle]').click();
    await page.locator('[data-annual-one-click]').click();
    const ws = page.locator('[data-annual-workspace]').first();
    await ws.waitFor({ timeout: 40000 });
    const [st] = await env.sql(`select id from public.onboarding_steps where client_id = '${id}' and step_type = 'annual_return' and status <> 'cancelled'`);

    await page.locator('[data-testid="rl-page-more"]').click();
    const [pp] = await Promise.all([ctx.waitForEvent('page'), page.locator('[data-testid="rl-page"] [data-annual-as-client]').click()]);
    onErr(pp, 'portal');
    await pp.waitForFunction(() => document.body.innerText.includes('הדוח השנתי 2025'), null, { timeout: 30000 });
    const card = pp.locator('.pp-item', { has: pp.getByText('הדוח השנתי 2025', { exact: true }) }).first();
    await card.getByRole('button', { name: /^(להשלמת המידע|להעלאת המסמכים)$/ }).click();
    await pp.locator('.ty-flow').waitFor({ timeout: 15000 });
    const res = await answerAll(pp);
    ok(res.done, 'הלקוח שלח את השאלון', JSON.stringify(res));
    ok(SEEN.bizPreset === true, '«עסק או חשבוניות» מסומן מראש אצל הלקוח', JSON.stringify(SEEN));
    ok(SEEN.bizText && !/ביטוח לאומי|עצמאי מ-/.test(SEEN.bizText), 'בלי מקור אצל הלקוח (לא «ביטוח לאומי»)', SEEN.bizText);
    ok(SEEN.studyLabel === 'סיום התואר', 'הריבוע של הלימודים: «סיום התואר»', SEEN.studyLabel);
    ok(SEEN.studyTitle === 'מתי סיימת את התואר?', 'מסך הלימודים: «מתי סיימת את התואר?»', SEEN.studyTitle);
    ok(!/ביטוח לאומי|סטודנט/.test(SEEN.studyScreen ?? ''), 'מסך הלימודים — בלי «ביטוח לאומי» ובלי «סטודנט»', (SEEN.studyScreen ?? '').slice(0, 200));
    await uploadAll(pp);
    await pp.close();

    // המשרד: המקור ו«לבדוק מול ביטוח לאומי»
    await page.goto(env.officeUrl(id, `journey/${st.id}`), { waitUntil: 'domcontentloaded' }); await page.reload({ waitUntil: 'domcontentloaded' });
    await ws.waitFor({ timeout: 40000 });
    let pend = 1;
    for (let k = 0; k < 25 && pend > 0; k++) { await page.waitForTimeout(1000); pend = (await env.sql(`select count(*)::int n from public.tax_year_facts where client_id='${id}' and request_id='${st.id}' and status='pending' and source='portal'`))[0].n; }
    await page.waitForTimeout(1500);
    const pnl = await text(ws.locator('[data-aw-mat="annualPnl"]'));
    ok(/לפי ביטוח לאומי: עצמאי מ-06\.2025/.test(pnl), 'במשרד: «רווח והפסד מפייפרלס» עם «לפי ביטוח לאומי: עצמאי מ-06.2025»', pnl);
    const chk = ws.locator('[data-aw-ni-check="niStudent-client"]');
    ok(await chk.count() === 1 && /לבדוק מול ביטוח לאומי/.test(await text(chk)), 'במשרד: «לבדוק מול ביטוח לאומי» — סיים תואר ועדיין רשום כסטודנט', await text(ws.locator('[data-who="mine"]')));
    await shot(page, 'ni-office');
    if (await chk.count()) {
      await chk.getByRole('button', { name: 'בורר' }).click();
      await page.waitForFunction(() => !document.querySelector('[data-aw-ni-check="niStudent-client"]'), null, { timeout: 20000 }).catch(() => {});
      ok(!(await chk.count()), '«בורר» — השורה יורדת');
    }
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'בלי גלילה לרוחב');
    await ctx.close();
  } catch (e) {
    ok(false, 'המסלול נעצר', e.stack ?? e);
  } finally {
    ok(blocked.length === 0, 'אין פנייה לייצור או למארח זר', blocked.slice(0, 4).join(' | '));
    ok(consoleErrors.length === 0, 'בלי שגיאות בדפדפן', consoleErrors.slice(0, 4).join(' | '));
    const c = await env.cleanup().catch(e => ({ left: -1, err: e.message }));
    ok(c.left === 0, 'ניקוי: לא נשארו שורות של לקוחות הבדיקה', JSON.stringify(c));
  }
}

for (const w of WIDTHS) await runWidth(w);
await browser.close();
console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
