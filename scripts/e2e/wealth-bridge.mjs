#!/usr/bin/env node
/**
 * wealth-bridge.mjs — הצהרת הון: הגישור (27.10.2026, הדמיה מאושרת docs/proposals/2026-10-27-wealth-declaration.html).
 *   הצהרת המשך (31.12.2020 ← 31.12.2025): השאלון עם «רמת חיים», «מה נכנס» ו«מה יצא» (ריבועים וסכומים) ⇒ המשרד: סכומים
 *   לסעיפים, הכנסה ומס לכל שנה ⇒ «הפער שלא מוסבר» כמספר, עם הגישור לפי לוח רשות המסים ⇒ «שאל את …».
 *
 *   STAGING_ENV_DIR=<…> node scripts/e2e/wealth-bridge.mjs --base=http://localhost:<port> [--widths=1280,390] [--shots=<dir>]
 *
 * ‼ כל פנייה לייצור נחסמת ומכשילה. בסוף — ניקוי. בלי מיילים.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { prepare } from './staging-session.mjs';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d);
const WIDTHS = arg('widths', '1280,390').split(',').map(Number);
const SHOTS = arg('shots', '');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const { chromium } = createRequire(process.env.PW_CORE ?? 'C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json')('playwright-core');
const PROD = 'uoweoqtuiettozagwgdw', STAGING = 'evdfxjqrkgugssfrdoxd';
const AS_OF = '2025-12-31';

let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(info).slice(0, 400)}` : ''}`); };
const text = async (loc) => ((await loc.count().catch(() => 0)) ? loc.first().innerText({ timeout: 5000 }).catch(() => '') : '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pdfBytes = s => Buffer.from(`%PDF-1.4\n% QAE2E ${s}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });

/** השאלון של הצהרת ההון (שאלה במסך): כן/לא — «לא», אישור — נכון, מזומן — 5000, טקסט — «בדיקה», מסמך — קובץ. */
async function answerWealth(page) {
  const log = [];
  let last = '', same = 0;
  for (let step = 0; step < 70; step++) {
    const flow = page.locator('.ty-flow');
    if (await flow.locator('.ty-q', { hasText: /תודה!|התשובות נשלחו למשרד/ }).count()) { log.push({ done: true }); break; }
    const title = (await text(flow.locator('.ty-q').first())).trim();
    if (process.env.E2E_DEBUG) console.log('    [q]', step, title.slice(0, 70));
    same = title === last ? same + 1 : 0; last = title;
    if (same > 3) { log.push({ title, err: 'אותה שאלה ארבע פעמים' }); if (SHOTS) await page.screenshot({ path: join(SHOTS, `wd-stuck-${Date.now()}.png`) }).catch(() => {}); break; }
    if (await flow.locator('.ty-done-mark').count()) { await flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).click(); await sleep(300); continue; }
    if (await flow.locator('input[type="file"]').count()) {
      const single = flow.getByRole('button', { name: 'יש לי קובץ אחד שמכיל הכול' });
      if (await single.count()) { await single.first().click(); await sleep(300); }
      await flow.locator('input[type="file"]').first().setInputFiles({ name: `${title.slice(0, 16)}.pdf`, mimeType: 'application/pdf', buffer: pdfBytes(title.slice(0, 16)) });
      await sleep(800);
      const confirm = flow.locator('[data-testid=dp-confirm]');
      if (await confirm.count() && await confirm.first().isEnabled()) await confirm.first().click().catch(() => {});
      // אחרי ההעלאה — «הבא» אם השאלה לא התחלפה לבד
      await sleep(600);
      if ((await text(flow.locator('.ty-q').first())).trim() === title && await flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).count()) await flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).click().catch(() => {});
      await page.waitForFunction(t => !document.querySelector('.ty-flow .ty-q')?.textContent?.includes(t) || !!document.querySelector('.ty-flow .ty-err'), title, { timeout: 25000 }).catch(() => {});
      log.push({ title, act: 'file', err: await text(flow.locator('.ty-err')) }); continue;
    }
    // ‼ 27.10.2026 · הגישור — המסכים החדשים
    if (await flow.locator('[data-record-life]').count()) {
      await flow.locator('.ws-tile', { hasText: 'אחזקת רכב' }).click();
      await flow.locator('.ws-tile', { hasText: 'אחזקת הדירה' }).click();
      log.push({ title, act: 'life' });
    } else if (await flow.locator('[data-record-flows="in"]').count()) {
      await flow.locator('.ws-gate button', { hasText: /^היה$/ }).click();
      await flow.locator('.ws-chips button', { hasText: '2023' }).first().click();
      log.push({ title, act: 'moneyIn' });
    } else if (await flow.locator('[data-record-flows="out"]').count()) {
      await flow.locator('.ws-gate button', { hasText: 'לא היה' }).click();
      log.push({ title, act: 'moneyOut' });
    }
    if (log[log.length - 1]?.title === title && ['life', 'moneyIn', 'moneyOut'].includes(log[log.length - 1].act)) {
      await sleep(300);
      await flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).click();
      await page.waitForFunction(t => (document.querySelector('.ty-flow .ty-q')?.textContent ?? '') !== t || !!document.querySelector('.ty-flow .ty-err'), title, { timeout: 25000 }).catch(() => {});
      const err = await text(flow.locator('.ty-err'));
      if (err) { log[log.length - 1].err = err; break; }
      continue;
    }
    let act = 'no';
    if (await flow.getByRole('button', { name: 'כן, הכול נכון' }).count()) {
      await flow.getByRole('button', { name: 'כן, הכול נכון' }).click(); act = 'confirm';
      // ‼ «כן, הכול נכון» מתקדם לבד — בלי «הבא» נוסף על המסך הבא
      const moved = await page.waitForFunction(t => (document.querySelector('.ty-flow .ty-q')?.textContent ?? '') !== t, title, { timeout: 8000 }).then(() => true, () => false);
      if (moved) { log.push({ title, act }); await sleep(300); continue; }
    }
    // 290 · מין ותאריך הלידה של בן/בת הזוג
    else if (await flow.locator('.rec-seg-btn', { hasText: 'אישה' }).count() && await flow.locator('input[type="date"]').count()) { await flow.locator('.rec-seg-btn', { hasText: 'אישה' }).first().click(); await flow.locator('input[type="date"]').first().fill('1990-01-01'); act = 'spouse'; }
    else if (await flow.locator('[data-gate="no"]').count()) { await flow.locator('[data-gate="no"]').first().click(); act = 'none'; }
    else if (await flow.locator('.rec-card, .rec-field').count()) {
      // כרטיס (נכס, חשבון…) — מה שבא מהכרטיס כבר ממולא; רק שדה טקסט ריק — ערך לבדיקה
      for (const i of await flow.locator('.rec-field input[type="text"]').all()) if (!(await i.inputValue())) await i.fill('בדיקה').catch(() => {});
      // שדה תאריך חובה שריק (למשל תאריך לידה של בן/בת הזוג) — רק כשהוא מסומן «חסר» אחרי ניסיון; כאן ממלאים מראש רק בכרטיס בלי תאריך קיים
      for (const i of await flow.locator('.rec-field input[type="date"]').all()) if (!(await i.inputValue()) && !(await i.locator('xpath=ancestor::*[contains(@class,"rec-field")][1]').innerText().catch(() => '')).includes('לא חובה')) await i.fill('1990-01-01').catch(() => {});
      // «היה בבעלותכם ביום …?» וכד׳ — «כן»
      for (const g of await flow.locator('.rec-seg').all()) if (!(await g.locator('[aria-pressed="true"], [aria-checked="true"]').count())) await g.locator('button').first().click().catch(() => {});
      act = 'record';
    }
    else if (await flow.locator('input[type="number"]').count()) { await flow.locator('input[type="number"]').first().fill(/מזומן/.test(title) ? '5000' : '0'); act = 'amount'; }
    else if (await flow.locator('.ty-choice', { hasText: /^לא$/ }).count()) await flow.locator('.ty-choice', { hasText: /^לא$/ }).first().click();
    else if (await flow.locator('textarea').count()) { await flow.locator('textarea').first().fill('בדיקה'); act = 'text'; }
    else if (await flow.locator('.ty-choice').count()) { await flow.locator('.ty-choice').first().click(); act = 'choice'; }
    log.push({ title, act });
    await sleep(350); // ‼ הבחירה נקלטת לפני «הבא» (אחרת «נא לבחור תשובה»)
    await flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).click();
    await page.waitForFunction(t => (document.querySelector('.ty-flow .ty-q')?.textContent ?? '') !== t || !!document.querySelector('.ty-flow .ty-err'), title, { timeout: 25000 }).catch(() => {});
    await sleep(250);
    const err = await text(flow.locator('.ty-err'));
    if (err) { log[log.length - 1].err = err; if (SHOTS) await page.screenshot({ path: join(SHOTS, `wd-stuck-${Date.now()}.png`) }).catch(() => {}); break; }
  }
  return log;
}


async function runWidth(width) {
  console.log(`\n▶ הצהרת הון — הגישור — ${width}px`);
  const env = await prepare();
  const blocked = [], consoleErrors = [];
  const id = env.clientId;
  const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}-${width}.png`), fullPage: true }).catch(() => {}); };
  try {
    await env.sql(`update public.onboarding_steps set status='cancelled' where client_id = '${id}' and step_type in ('intake_questionnaire','annual_return','tax_file_intake','info_collection') and status <> 'cancelled'`);
    // ילדים בתיק (נפשות בכל שנה): 2015, 2019
    await env.sql(`update public.clients set children = '[{"id":"k1","firstName":"נועה","birthYear":2015},{"id":"k2","firstName":"איתי","birthYear":2019}]'::jsonb where id = '${id}'`).catch(e => console.log('    (ילדים)', e.message.slice(0, 120)));
    const mobile = width < 700;
    const ctx = await browser.newContext({ viewport: { width, height: mobile ? 820 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'he-IL' });
    await env.initContext(ctx);
    await ctx.route('**/*', route => {
      const u = route.request().url();
      if (u.includes(PROD)) { blocked.push(u); return route.abort(); }
      if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
      const host = new URL(u).hostname;
      if (host === 'localhost' || host === '127.0.0.1' || /^(data|blob|about|chrome|chrome-extension):/.test(u) || host.includes(STAGING)) return route.continue();
      blocked.push(u); return route.abort();
    });
    const onErr = (p, tag) => { p.on('console', m => { if (m.type() === 'error' && !/favicon|ResizeObserver|Failed to load resource/.test(m.text())) consoleErrors.push(`${tag}: ${m.text().slice(0, 200)}`); }); p.on('pageerror', e => consoleErrors.push(`${tag} pageerror: ${e.message.slice(0, 200)}`)); };
    const page = await ctx.newPage(); onErr(page, 'office');

    // 1 · הצהרת הון ⇒ הופכים להצהרת המשך (הקודמת ליום 31.12.2020, הון נטו 1,500,000)
    await page.goto(env.officeUrl(id, 'journey'), { waitUntil: 'domcontentloaded' });
    const addBtn = page.getByRole('button', { name: /＋ בקשה חדשה/ }).first();
    await addBtn.waitFor({ timeout: 40000 }); await addBtn.click();
    await page.locator('[data-tax-file-toggle]').click();
    await page.locator('#ar-taxfile-panel label', { hasText: 'הצהרת הון' }).locator('input[type="radio"]').check();
    await page.locator('#ar-taxfile-panel input[type="date"]').fill(AS_OF);
    await page.locator('#ar-taxfile-panel').getByRole('button', { name: 'פתח' }).click();
    const ws = page.locator('[data-wealth-workspace]').first();
    await ws.waitFor({ timeout: 40000 });
    const [st] = await env.sql(`select id from public.onboarding_steps where client_id = '${id}' and step_type = 'wealth_declaration' and status <> 'cancelled' order by created_at desc limit 1`);
    await env.sql(`update public.onboarding_steps set payload = payload || '{"kind":"followup","previous":{"asOfDate":"2020-12-31","netWorth":1500000}}'::jsonb where id = '${st.id}'`);
    await page.goto(env.officeUrl(id, `journey/${st.id}`), { waitUntil: 'domcontentloaded' }); await page.reload({ waitUntil: 'domcontentloaded' });
    await ws.waitFor({ timeout: 40000 });
    const hero = ws.locator('[data-wb-hero]');
    await hero.waitFor({ timeout: 20000 });
    ok(await hero.getAttribute('data-wb-hero') === 'gap', 'הצהרת המשך: המספר הוא «הפער שלא מוסבר»', await text(hero));
    ok(/יחושב כשיהיה הכול/.test(await text(hero)), 'לפני התשובות — «יחושב כשיהיה הכול», עם מה שחסר', await text(hero));
    ok(await ws.locator('[data-wb-bridge]').count() === 1, 'כרטיס הגישור במסך');
    await shot(page, 'wb-start');

    // 2 · שליחת השאלון ⇒ הלקוח עונה (כולל רמת חיים, מה נכנס, מה יצא)
    await ws.locator('[data-wd-send-q]').click();
    await page.waitForFunction(() => /באמצע השאלון|עוד לא התחיל|ממתין/.test(document.querySelector('[data-wd-status]')?.textContent ?? ''), null, { timeout: 40000 }).catch(() => {});
    const pp = await ctx.newPage(); onErr(pp, 'portal');
    await pp.goto(env.portalUrl(), { waitUntil: 'domcontentloaded' });
    await pp.waitForFunction(() => document.body.innerText.includes('הצהרת הון'), null, { timeout: 30000 });
    await pp.locator('div', { has: pp.getByText(/הצהרת הון/) }).filter({ has: pp.getByRole('button', { name: 'להשלמת המידע' }) }).last().getByRole('button', { name: 'להשלמת המידע' }).click();
    await pp.locator('.ty-flow').waitFor({ timeout: 15000 });
    const log = await answerWealth(pp);
    ok(log.some(x => x.done) && log.every(x => !x.err), `הלקוח השלים את השאלון (${log.length - 1} צעדים)`, JSON.stringify(log.filter(x => x.err).slice(-3)));
    ok(['life', 'moneyIn', 'moneyOut'].every(a => log.some(x => x.act === a)), 'בשאלון: «רמת חיים», «מה נכנס», «מה יצא» — ריבועים וסכומים', JSON.stringify(log.map(x => x.act)));
    ok(!log.some(x => x.act === 'text'), 'בלי טקסט חופשי בשאלון', JSON.stringify(log.filter(x => x.act === 'text').map(x => x.title)));
    await pp.close();
    const life = (await env.sql(`select value from public.tax_year_facts where client_id='${id}' and item_key='wealth.since.living' order by created_at desc limit 1`))[0]?.value;
    ok(!!life?.items?.[0]?.costs?.car, 'רמת החיים נשמרה כרשומה (רכב)', JSON.stringify(life));

    // 3 · המשרד: סכומים לסעיפים, הכנסה ומס לכל שנה ⇒ הפער
    await page.goto(env.officeUrl(id, `journey/${st.id}`), { waitUntil: 'domcontentloaded' }); await page.reload({ waitUntil: 'domcontentloaded' });
    await ws.waitFor({ timeout: 40000 });
    await page.waitForTimeout(2500);
    const sheet = ws.locator('[data-wd-sheet]');
    const AMOUNTS = { '10': '1850000', '30': '186000', '90': '95000', '110': '60000', '130': '421000' };
    for (let k = 0; k < 16; k++) {
      const open = sheet.locator('.wd-sec:not(.is-done)').first();
      if (!(await open.count())) break;
      const code = await open.getAttribute('data-wd-sec');
      if (AMOUNTS[code]) { await open.locator('input').fill(AMOUNTS[code]); await open.locator('[data-wd-save]').click(); }
      else await open.locator('[data-wd-none]').click();
      await page.waitForFunction(c => document.querySelector(`[data-wd-sec="${c}"]`)?.classList.contains('is-done'), code, { timeout: 20000 }).catch(() => {});
    }
    const INC = { 2021: ['300000', '48000'], 2022: ['315000', '51000'], 2023: ['330000', '54000'], 2024: ['345000', '57000'], 2025: ['355000', '60000'] };
    for (const [y, [inc, tax]] of Object.entries(INC)) {
      const row = ws.locator(`[data-wb-income-row="${y}"]`);
      await row.waitFor({ timeout: 20000 });
      await row.locator('input').nth(0).fill(inc); await row.locator('input').nth(1).fill(tax);
      await row.getByRole('button', { name: 'רשום' }).click();
      await page.waitForFunction(yy => !document.querySelector(`[data-wb-income-row="${yy}"]`), y, { timeout: 20000 }).catch(() => {});
    }
    ok(!(await ws.locator('[data-wb-income-row]').count()), 'הכנסה ומס — רשומים לכל חמש השנים');
    const inc = (await env.sql(`select value from public.tax_year_facts where client_id='${id}' and item_key='wealth.bridge.income' and status='accepted' order by created_at desc limit 1`))[0]?.value;
    ok(Object.keys(inc?.years ?? {}).length === 5, 'נשמר כעובדה אחת ליום ההצהרה, לכל השנים', JSON.stringify(inc));
    await page.waitForTimeout(800);
    const gap = await ws.locator('[data-wb-gap]').getAttribute('data-wb-gap');
    ok(gap !== '' && gap != null, `המספר: הפער שלא מוסבר (${gap})`, await text(hero));
    if (!(await ws.locator('[data-wb-living]').count())) await ws.locator('[data-wb-bridge] .wb-lnk', { hasText: 'לפי שנה' }).last().click();
    const living = await text(ws.locator('[data-wb-living]'));
    ok(/2021/.test(living) && /4 נפשות/.test(living) && /קבוצה/.test(living), 'הוצאות מחיה לפי שנה: נפשות וקבוצת הכנסה מהלוח', living.replace(/\s+/g, ' ').slice(0, 300));
    ok(/לוח 2022/.test(living), 'שנה בלי לוח — מסומן «לוח 2022»');
    if (Number(gap) > 0) {
      await ws.locator('[data-wb-ask]').click();
      await page.waitForTimeout(2500);
      const asks = (await env.sql(`select count(*)::int n from public.tax_info_asks where client_id='${id}' and item_key='wealth.since.sources' and state='published'`))[0].n;
      ok(asks >= 1, '«שאל את …» — שאלה מובנית אחת בדף, פורסמה');
    }
    await shot(page, 'wb-office');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'המשרד — בלי גלילה לרוחב');
    const mail = (await env.sql(`select count(*)::int n from public.email_messages where client_id='${id}'`))[0].n;
    ok(mail === 0, 'לא יצא שום מייל');
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

for (const wd of WIDTHS) await runWidth(wd);
await browser.close();
console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
