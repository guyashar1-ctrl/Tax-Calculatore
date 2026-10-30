#!/usr/bin/env node
/**
 * annual-depreciation.mjs — דוח הפחת (1342) בתוך «אצלך» בדוח השנתי (30.10.2026; docs/proposals/2026-10-30-annual-office-only-three.html), בדפדפן מול staging.
 *
 *   עסק בכרטיס + דוח 2024 עם טבלת פחת ⇒ «דוח שנתי 2025» ⇒ «דוח פחת» ב«אצלך»: הנכס מ-2024 עבר לבד עם הנצבר ⇒ «＋ נכס» ⇒ «שמירה»
 *   ⇒ נשמר בטיוטת הדוח, השורה עוברת לקבוצה של בעל העסק עם פחת השנה. בלי «להשלים במשרד» ובלי הצהרות כמשימה.
 *
 *   STAGING_ENV_DIR=<…> node scripts/e2e/annual-depreciation.mjs --base=http://localhost:5431 [--widths=1280,390] [--shots=<dir>]
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

let pass = 0, fail = 0;
const ok = (c, m, info = "") => { c ? pass++ : fail++; console.log(`${c ? "  ✓" : "  ✗"} ${m}${!c && info ? ` — ${String(info).slice(0, 400)}` : ""}`); };
const text = async (loc) => ((await loc.count().catch(() => 0)) ? loc.first().innerText({ timeout: 5000 }).catch(() => "") : "");
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });

async function runWidth(width) {
  console.log(`\n▶ דוח הפחת — ${width}px`);
  const env = await prepare();
  const blocked = [], consoleErrors = [];
  const id = env.clientId;
  const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}-${width}.png`), fullPage: false }).catch(() => {}); };
  try {
    await env.sql(`update public.onboarding_steps set status='cancelled' where client_id = '${id}' and step_type in ('intake_questionnaire','annual_return','tax_file_intake','info_collection') and status <> 'cancelled'`);
    await env.sql(`update public.clients set businesses = '[{"id":"b1","name":"ייעוץ בדיקה","startDate":"2020-01-01"}]'::jsonb where id = '${id}'`);
    // דוח 2024 מאושר עם טבלת פחת — מחשב שנקנה במרץ 2024 (10 חודשים ב-2024: 12,000 × 33% × 10/12 = 3,300)
    const prev = (await env.sql(`insert into public.onboarding_steps(user_id,client_id,step_type,track,scope,status,payload)
      select user_id,id,'annual_return','tools','person','completed','{"taxYear":2024,"purpose":"annual"}'::jsonb from public.clients where id='${id}' returning id`))[0].id;
    const dep24 = { taxYear: 2024, persons: ['client'], micro: {}, completions: [], adjustments: [], decisions: [],
      depreciation: { b1: { assets: [{ id: 'p1', name: 'מחשב נייד', acquired: '2024-03', cost: 12000, rate: 33, accumulated: 0 }] } } };
    await env.sql(`insert into public.annual_returns (user_id, client_id, request_id, tax_year, version, status, draft)
      select user_id, id, '${prev}', 2024, 1, 'approved', $q$${JSON.stringify(dep24)}$q$::jsonb from public.clients where id='${id}'`);

    const mobile = width < 700;
    const ctx = await browser.newContext({ viewport: { width, height: mobile ? 820 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'he-IL' });
    await env.initContext(ctx);
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.includes(PROD)) { blocked.push(u); return route.abort(); }
      if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
      const host = new URL(u).hostname;
      if (host === 'localhost' || host === '127.0.0.1' || /^(data|blob|about):/.test(u) || host.includes(STAGING)) return route.continue();
      blocked.push(u); return route.abort();
    });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error' && !/favicon|ResizeObserver|Failed to load resource/.test(m.text())) consoleErrors.push(m.text().slice(0, 200)); });
    page.on('pageerror', e => consoleErrors.push(String(e).slice(0, 200)));

    await page.goto(env.officeUrl(id, 'journey'), { waitUntil: 'domcontentloaded' });
    const addBtn = page.getByRole('button', { name: /＋ בקשה חדשה/ }).first();
    await addBtn.waitFor({ timeout: 40000 }); await addBtn.click();
    await page.locator('[data-tax-file-toggle]').click();
    await page.locator('[data-annual-one-click]').click();
    const ws = page.locator('[data-annual-workspace]').first();
    await ws.waitFor({ timeout: 40000 });
    const [st] = await env.sql(`select id from public.onboarding_steps where client_id = '${id}' and step_type = 'annual_return' and status <> 'cancelled' and payload->>'taxYear' = '2025'`);
    ok(/עוד לא התחיל/.test(await text(ws.locator('[data-aw-status]'))), '«נשלח · עוד לא התחיל» מיד אחרי הפתיחה', await text(ws.locator('[data-aw-status]')));

    const row = ws.locator('.aw-minebox [data-aw-dep="b1"]');
    await row.waitFor({ timeout: 30000 });
    ok(/נכס אחד מהשנה הקודמת/.test(await text(row)), '«דוח פחת» ב«אצלך» — נכס אחד מהשנה הקודמת', await text(row));
    ok(!(await ws.locator('[data-aw-mat^="depreciation"], [data-aw-office-rest]').count()), 'בלי «דוח פחת מהספרים» להקלדה ובלי «להשלים במשרד»');
    ok(!/הצהרות ותיבות סימון/.test(await text(ws.locator('.aw-minebox'))), 'הצהרות הטופס אינן משימה');
    await row.locator('button').click();
    const panel = ws.locator('[data-aw-dep-panel]');
    await panel.waitFor({ timeout: 10000 });
    const prior = panel.locator('[data-dp-asset="prior"]:visible').first();
    ok(/מחשב נייד/.test(await text(prior)) && /3,300/.test(await text(prior)) && /3,960/.test(await text(prior)), 'הנכס עבר לבד: נצבר 3,300 (2024), פחת 2025 = 3,960', await text(prior));
    await shot(page, 'dep-open');

    // נכס חדש: כיסא 1,800 ₪ מיולי 2025, 6% ⇒ 54
    await panel.locator('[data-dp-add]').click();
    const nu = panel.locator('[data-dp-asset="new"]:visible').first();
    await nu.locator('input').first().fill('כיסא משרדי');
    await nu.locator('input[type="month"]').fill('2025-07');
    await nu.locator('input[inputmode="numeric"]').first().fill('1800');
    await nu.locator('select').selectOption('6');
    await page.waitForTimeout(300);
    ok(/54/.test(await text(nu)), 'נכס חדש: פחת השנה 54 (1,800 × 6% × 6/12)', await text(nu));
    await shot(page, 'dep-filled');
    await panel.locator('[data-dp-save]').click();
    await page.waitForFunction(() => !document.querySelector('[data-aw-dep-panel]'), null, { timeout: 30000 }).catch(() => {});

    const [saved] = await env.sql(`select draft->'depreciation'->'b1' t from public.annual_returns where request_id = '${st.id}' and status = 'draft'`);
    ok(saved?.t?.assets?.length === 2, 'נשמר בטיוטת הדוח — שני נכסים', JSON.stringify(saved));
    const done = ws.locator('[data-aw-dep="b1"][data-state="done"]');
    ok(await done.count() === 1 && !(await ws.locator('.aw-minebox [data-aw-dep="b1"]').count()), 'השורה יצאה מ«אצלך» ועברה לבעל העסק');
    ok(/פחת השנה ₪4,014/.test(await text(done)), 'פחת השנה 4,014 בשורה', await text(done));
    await shot(page, 'dep-done');

    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'בלי גלילה לרוחב');
    ok(blocked.length === 0, 'אין פנייה לייצור או למארח זר', blocked.slice(0, 3).join(' | '));
    ok(consoleErrors.length === 0, 'בלי שגיאות בדפדפן', consoleErrors.slice(0, 3).join(' | '));
    await ctx.close();
  } finally {
    const left = await env.cleanup().catch(e => ({ left: -1, err: String(e) }));
    ok(left.left === 0, 'ניקוי: לא נשארו שורות של לקוחות הבדיקה', JSON.stringify(left));
  }
}

for (const w of WIDTHS) await runWidth(w);
await browser.close();
console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
