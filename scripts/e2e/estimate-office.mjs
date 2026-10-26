#!/usr/bin/env node
/**
 * estimate-office.mjs — הערכת מס (26.10.2026), בדפדפן מול staging: המשרד ⇄ הדף האישי.
 *
 *   «＋ בקשה חדשה» ← הערכת מס ⇒ «השאלון ללקוח עוד לא נשלח» ⇒ «שליחת השאלון» בלחיצה אחת (בלי מייל) ⇒ הלקוח עונה
 *   ⇒ המשרד: התשובות נכנסות לבד (בלי «אשר») ⇒ פאנל ההערכה פתוח עם «הצעד הבא» ⇒ בלי גלילה לרוחב.
 *   (הסיכום ללקוח — שורה תחתונה, «מה מומלץ לעשות», מקורות — נבדק ב-src/features/taxEstimate/__tests__/summary.test.ts)
 *
 *   STAGING_ENV_DIR=<…> node scripts/e2e/estimate-office.mjs --base=http://localhost:<port> [--widths=1280,390] [--shots=<dir>]
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
  console.log(`\n▶ הערכת מס — ${width}px`);
  const env = await prepare();
  const blocked = [], consoleErrors = [];
  const id = env.clientId;
  const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}-${width}.png`), fullPage: false }).catch(() => {}); };
  try {
    await env.sql(`update public.onboarding_steps set status='cancelled' where client_id = '${id}' and step_type in ('intake_questionnaire','annual_return','tax_file_intake','info_collection','wealth_declaration') and status <> 'cancelled'`);
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

    // 1 · «＋ בקשה חדשה» ← תיק המס ← הערכת מס
    await page.goto(env.officeUrl(id, 'journey'), { waitUntil: 'domcontentloaded' });
    const addBtn = page.getByRole('button', { name: /＋ בקשה חדשה/ }).first();
    await addBtn.waitFor({ timeout: 40000 }); await addBtn.click();
    await page.locator('[data-tax-file-toggle]').click();
    await page.locator('#ar-taxfile-panel label', { hasText: 'הערכת מס' }).locator('input[type="radio"]').check();
    await page.locator('#ar-taxfile-panel').getByRole('button', { name: 'פתח' }).click();
    const top = page.locator('[data-te-top]').first();
    await top.waitFor({ timeout: 40000 });
    ok(/עוד לא נשלח/.test(await text(top.locator('[data-te-status]'))), 'המצב: «השאלון ללקוח עוד לא נשלח»', await text(top));
    const [st] = await env.sql(`select id from public.onboarding_steps where client_id = '${id}' and step_type = 'tax_estimate' and status <> 'cancelled' order by created_at desc limit 1`);
    ok(!!st, 'נוצרה בקשת «הערכת מס» אחת');
    await page.locator('.te-panel').first().waitFor({ timeout: 40000 }).catch(() => {});
    ok(await page.locator('.te-panel').count() > 0, 'פאנל ההערכה במסך');
    await shot(page, 'te-start');

    // 2 · שליחה בלחיצה אחת
    ok(await top.locator('[data-te-send-q]').count() === 1, '«שליחת השאלון» בלחיצה אחת');
    await top.locator('[data-te-send-q]').click();
    await page.waitForFunction(() => /באמצע השאלון/.test(document.querySelector('[data-te-status]')?.textContent ?? ''), null, { timeout: 40000 }).catch(() => {});
    ok(/באמצע השאלון/.test(await text(top.locator('[data-te-status]'))), 'נשלח — הלקוח באמצע השאלון', await text(top));
    const sentMail = (await env.sql(`select count(*)::int n from public.email_messages where to_email in (select email from public.clients where id='${id}') and created_at > now() - interval '10 minutes'`))[0].n;
    ok(sentMail === 0, 'לא יצא מייל בשליחה');

    // 3 · הלקוח עונה
    const pp = await ctx.newPage(); onErr(pp, 'portal');
    await pp.goto(env.portalUrl(), { waitUntil: 'domcontentloaded' });
    await pp.waitForFunction(() => document.body.innerText.includes('הערכת מס'), null, { timeout: 30000 });
    const card = pp.locator('div', { has: pp.getByText(/הערכת מס/) }).filter({ has: pp.getByRole('button', { name: 'להשלמת המידע' }) }).last();
    await card.getByRole('button', { name: 'להשלמת המידע' }).click();
    await pp.locator('.ty-flow').waitFor({ timeout: 15000 });
    await shot(pp, 'te-portal-q');
    const log = await answerWealth(pp);
    ok(log.some(x => x.done) && log.every(x => !x.err), `הלקוח השלים את השאלון (${log.length - 1} צעדים)`, JSON.stringify(log.filter(x => x.err || !x.done).slice(-3)));
    ok(await pp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'הדף האישי — בלי גלילה לרוחב');
    await pp.close();

    // 4 · המשרד: התשובות נכנסות לבד
    await page.goto(env.officeUrl(id, `journey/${st.id}`), { waitUntil: 'domcontentloaded' }); await page.reload({ waitUntil: 'domcontentloaded' });
    await top.waitFor({ timeout: 40000 });
    let pend = 1;
    for (let k = 0; k < 25 && pend > 0; k++) { await page.waitForTimeout(1000); pend = (await env.sql(`select count(*)::int n from public.tax_year_facts where client_id='${id}' and request_id='${st.id}' and status='pending' and source='portal'`))[0].n; }
    ok(pend === 0, 'התשובות נכנסו לבד — בלי «אשר»', `pending=${pend}`);
    const portalN = (await env.sql(`select count(*)::int n from public.tax_year_facts where client_id='${id}' and request_id='${st.id}' and source='portal'`))[0].n;
    ok(portalN > 0, `נשמרו תשובות הלקוח (${portalN})`);
    await page.waitForFunction(() => /נכנסו/.test(document.querySelector('[data-te-status]')?.textContent ?? ''), null, { timeout: 20000 }).catch(() => {});
    ok(/נכנסו/.test(await text(top.locator('[data-te-status]'))), 'המצב: «התשובות של הלקוח נכנסו»', await text(top));
    ok(/הצעד הבא/.test(await text(page.locator('.te-next'))), 'פאנל ההערכה: «הצעד הבא» ברור', await text(page.locator('.te-next')));
    await shot(page, 'te-office');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'המשרד — בלי גלילה לרוחב');
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
