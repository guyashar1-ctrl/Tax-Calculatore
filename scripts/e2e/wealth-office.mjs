#!/usr/bin/env node
/**
 * wealth-office.mjs — הצהרת הון עד הסוף (26.10.2026, 300), בדפדפן מול staging: המשרד ⇄ הדף האישי.
 *
 *   «＋ בקשה חדשה» ← הצהרת הון ⇒ המסך החדש (הכלים הקודמים — ב«כלים מתקדמים») ⇒ «שליחת השאלון» בלחיצה אחת ⇒ הלקוח עונה ומעלה
 *   ⇒ המשרד: התשובות נכנסות לבד, סעיף שהלקוח ענה עליו «לא» — «אין» לבד ⇒ סכום לכל סעיף שנשאר ⇒ הון נטו, 1219 עם הסכומים
 *   ⇒ «שליחה לחתימה» ⇒ בדף: «הצהרת ההון ליום … — לחתימה» ⇒ שניהם חותמים ⇒ «שניהם חתמו» ⇒ הקובץ החתום במסמכים («הצהרת הון»).
 *
 *   STAGING_ENV_DIR=<…> node scripts/e2e/wealth-office.mjs --base=http://localhost:<port> [--widths=1280,390] [--shots=<dir>]
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
  console.log(`\n▶ הצהרת הון — ${width}px`);
  const env = await prepare();
  const blocked = [], consoleErrors = [];
  const id = env.clientId;
  const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}-${width}.png`), fullPage: false }).catch(() => {}); };
  try {
    // ‼ לקוח אחד = שאלון אחד פתוח (263) — מורידים את השאלונים שהזריעה פתחה
    await env.sql(`update public.onboarding_steps set status='cancelled' where client_id = '${id}' and step_type in ('intake_questionnaire','annual_return','tax_file_intake','info_collection') and status <> 'cancelled'`);
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

    // 1 · «＋ בקשה חדשה» ← תיק המס ← הצהרת הון ⇒ המסך החדש
    await page.goto(env.officeUrl(id, 'journey'), { waitUntil: 'domcontentloaded' });
    const addBtn = page.getByRole('button', { name: /＋ בקשה חדשה/ }).first();
    await addBtn.waitFor({ timeout: 40000 }); await addBtn.click();
    await page.locator('[data-tax-file-toggle]').click();
    await page.locator('#ar-taxfile-panel label', { hasText: 'הצהרת הון' }).locator('input[type="radio"]').check();
    await page.locator('#ar-taxfile-panel input[type="date"]').fill(AS_OF);
    await page.locator('#ar-taxfile-panel').getByRole('button', { name: 'פתח' }).click();
    const ws = page.locator('[data-wealth-workspace]').first();
    await ws.waitFor({ timeout: 40000 });
    ok(await page.locator('[data-annual-advanced]').first().isHidden(), 'הכלים הקודמים מוסתרים (ב«כלים מתקדמים»)');
    ok(/לא נשלח/.test(await text(ws.locator('[data-wd-status]'))), 'המצב: «השאלון עוד לא נשלח»', await text(ws.locator('[data-wd-status]')));
    const [st] = await env.sql(`select id from public.onboarding_steps where client_id = '${id}' and step_type = 'wealth_declaration' and status <> 'cancelled' order by created_at desc limit 1`);
    ok(!!st, 'נוצרה בקשת «הצהרת הון» אחת');
    await shot(page, 'wd-start');

    // 2 · «שליחת השאלון» בלחיצה אחת
    await ws.locator('[data-wd-send-q]').click();
    await page.waitForFunction(() => /באמצע השאלון|ממתין/.test(document.querySelector('[data-wd-status]')?.textContent ?? ''), null, { timeout: 40000 }).catch(() => {});
    ok(/באמצע השאלון|ממתין/.test(await text(ws.locator('[data-wd-status]'))), 'נשלח בלחיצה אחת — הלקוח באמצע השאלון', await text(ws.locator('[data-wd-status]')));
    const sentMail = (await env.sql(`select count(*)::int n from public.email_messages where to_email in (select email from public.clients where id='${id}') and created_at > now() - interval '10 minutes'`))[0].n;
    ok(sentMail === 0, 'לא יצא מייל בשליחת השאלון');

    // 3 · הלקוח עונה ומעלה
    const pp = await ctx.newPage(); onErr(pp, 'portal');
    await pp.goto(env.portalUrl(), { waitUntil: 'domcontentloaded' });
    await pp.waitForFunction(() => document.body.innerText.includes('הצהרת הון'), null, { timeout: 30000 });
    const card = pp.locator('div', { has: pp.getByText(/הצהרת הון/) }).filter({ has: pp.getByRole('button', { name: 'להשלמת המידע' }) }).last();
    await card.getByRole('button', { name: 'להשלמת המידע' }).click();
    await pp.locator('.ty-flow').waitFor({ timeout: 15000 });
    await shot(pp, 'wd-portal-q');
    const log = await answerWealth(pp);
    ok(log.some(x => x.done) && log.every(x => !x.err), `הלקוח השלים את השאלון (${log.length - 1} צעדים)`, JSON.stringify(log.filter(x => x.err || !x.done).slice(-3)));
    await pp.close();

    // 4 · המשרד: התשובות נכנסות לבד; «אין» לבד מתשובות «לא»
    await page.goto(env.officeUrl(id, `journey/${st.id}`), { waitUntil: 'domcontentloaded' }); await page.reload({ waitUntil: 'domcontentloaded' });
    await ws.waitFor({ timeout: 40000 });
    let pend = 1;
    for (let k = 0; k < 25 && pend > 0; k++) { await page.waitForTimeout(1000); pend = (await env.sql(`select count(*)::int n from public.tax_year_facts where client_id='${id}' and request_id='${st.id}' and status='pending' and source='portal'`))[0].n; }
    ok(pend === 0, 'התשובות נכנסו לבד — בלי «אשר»', `pending=${pend}`);
    await page.waitForTimeout(1200);
    const sheet = ws.locator('[data-wd-sheet]');
    const noneByClient = await sheet.locator('.wd-sec.is-done', { hasText: 'הלקוח ענה «לא»' }).count();
    ok(noneByClient >= 3, `סעיפים שהלקוח ענה עליהם «לא» — «אין» לבד (${noneByClient})`);
    const cash = await text(sheet.locator('[data-wd-sec="50"]'));
    ok(/5,000/.test(cash), 'המזומן מתשובת הלקוח — כבר בסעיף 50', cash);
    ok(await ws.locator('[data-wd-sheet-todo]').count() === 1, '«אצלך»: «סכומים ליום ההצהרה»');
    await shot(page, 'wd-office');

    // 5 · סכום לכל סעיף שנשאר
    const AMOUNTS = { '10': '1500000', '30': '80000', '60': '120000', '110': '40000', '130': '600000' };
    let expectNet = 5000;
    for (let k = 0; k < 16; k++) {
      const open = sheet.locator('.wd-sec:not(.is-done)').first();
      if (!(await open.count())) break;
      const code = await open.getAttribute('data-wd-sec');
      if (AMOUNTS[code]) { await open.locator('input').fill(AMOUNTS[code]); await open.locator('[data-wd-save]').click(); expectNet += (code === '130' ? -1 : 1) * Number(AMOUNTS[code]); }
      else await open.locator('[data-wd-none]').click();
      await page.waitForFunction(c => document.querySelector(`[data-wd-sec="${c}"]`)?.classList.contains('is-done'), code, { timeout: 20000 }).catch(() => {});
    }
    ok(!(await sheet.locator('.wd-sec:not(.is-done)').count()), 'כל הסעיפים רשומים');
    const net = await text(ws.locator('[data-wd-net]'));
    const expectTxt = expectNet.toLocaleString('he-IL');
    ok(net.includes(expectTxt), `הון נטו = מה שנרשם (${expectTxt})`, net);
    const facts = (await env.sql(`select count(*)::int n from public.tax_year_facts where client_id='${id}' and item_key in ('wealth.bank.total','wealth.homeContents.total') and period_kind='as_of' and period_to='${AS_OF}' and status='accepted'`))[0].n;
    ok(facts === 2, 'נשמר כעובדה ליום ההצהרה (as_of), כולל פריט חדש', facts);
    await ws.locator('[data-wd-tab="1219"]').click();
    await ws.locator('[data-wd-form] img').waitFor({ timeout: 15000 });
    ok(/80,000/.test(await text(ws.locator('[data-wd-val="30"]'))), 'בטופס 1219 עצמו — 80,000 בסעיף 30');
    const pages = ws.locator('[data-wd-form] .aw-pages button');
    let p800 = '';
    for (let k = 0; k < await pages.count() && !p800; k++) { await pages.nth(k).click(); await page.waitForTimeout(200); p800 = await text(ws.locator('[data-wd-val="800"]')); }
    ok(p800.includes(expectTxt), '1219 — הון נטו (800)', p800);
    await shot(page, 'wd-1219');

    // 6 · שליחה לחתימה ⇒ שניהם חותמים בדף
    await page.waitForFunction(() => !!document.querySelector('[data-wd-send-sign]'), null, { timeout: 20000 }).catch(() => {});
    ok(await ws.locator('[data-wd-send-sign]').count() === 1, '«שליחה לחתימה» כשהכול מוכן', await text(ws.locator('[data-wd-status]')));
    await ws.locator('[data-wd-send-sign]').click();
    await ws.locator('[data-wd-signer]').first().waitFor({ timeout: 20000 });
    ok(/נשלחה לחתימה/.test(await text(ws.locator('[data-wd-status]'))), 'במשרד: «נשלחה לחתימה»');
    const sp = await ctx.newPage(); onErr(sp, 'portal-sign');
    await sp.goto(env.portalUrl(), { waitUntil: 'domcontentloaded' });
    await sp.waitForFunction(() => /הצהרת ההון ליום 31\.12\.2025 — לחתימה/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
    ok(/הצהרת ההון ליום 31\.12\.2025 — לחתימה/.test(await sp.locator('body').innerText()), 'בדף: «הצהרת ההון ליום 31.12.2025 — לחתימה»');
    await sp.getByRole('button', { name: 'לצפייה וחתימה' }).first().click();
    const scr = sp.locator('[data-annual-sign]');
    await scr.waitFor({ timeout: 20000 });
    ok((await text(scr.locator('.as-bal'))).includes(expectTxt), `בדף: הון נטו ${expectTxt} ₪`, await text(scr.locator('.as-bal')));
    await scr.locator('[data-as-tab="1219"]').click();
    await scr.locator('[data-wd-form] img').waitFor({ timeout: 15000 });
    ok(await scr.locator('[data-wd-val="30"]').count() === 1, 'בדף: הלקוח רואה את 1219 עם הסכומים');
    for (const name of ['דוד', 'רחל']) {
      await scr.locator('.as-sign').waitFor({ timeout: 15000 });
      ok((await text(scr.locator('.as-who'))).includes(name), `בדף: החתימה של ${name}`);
      await scr.locator('[data-as-decl]').check();
      const pad = scr.locator('.as-pad canvas');
      await pad.scrollIntoViewIfNeeded(); await sp.waitForTimeout(300);
      const bb = await pad.boundingBox();
      await sp.mouse.move(bb.x + 30, bb.y + 60); await sp.mouse.down();
      for (let i = 1; i <= 12; i++) await sp.mouse.move(bb.x + 30 + i * 18, bb.y + 60 + Math.sin(i) * 25);
      await sp.mouse.up();
      await scr.locator('[data-as-sign]').click();
      await sp.waitForFunction(n => (document.querySelector('[data-annual-sign] .as-thanks')?.textContent ?? '').includes(n === 'רחל' ? 'נחתם' : `תודה, ${n}`), name, { timeout: 20000 }).catch(() => {});
    }
    ok(/נחתם/.test(await text(scr.locator('.as-thanks'))), 'בדף: «נחתם. תודה!»');
    await shot(sp, 'wd-signed');
    await sp.close();
    await page.goto(env.officeUrl(id, `journey/${st.id}`), { waitUntil: 'domcontentloaded' }); await page.reload({ waitUntil: 'domcontentloaded' });
    await ws.waitFor({ timeout: 40000 });
    await ws.locator('[data-wd-signed-file]').waitFor({ timeout: 60000 }).catch(() => {});
    ok(/שניהם חתמו/.test(await text(ws.locator('[data-wd-status]'))), 'במשרד: «שניהם חתמו»', await text(ws.locator('[data-wd-status]')));
    const doc = (await env.sql(`select l.name label, d.file_type from public.annual_return_signings g join public.documents d on d.id = g.signed_document_id join public.document_labels l on l.id = d.label_id where g.request_id='${st.id}' and g.state='signed'`))[0];
    ok(doc?.label === 'הצהרת הון' && doc.file_type === 'application/pdf', 'הקובץ החתום נשמר במסמכים («הצהרת הון»)', JSON.stringify(doc));
    await shot(page, 'wd-office-done');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'בלי גלילה לרוחב');
    const mails = (await env.sql(`select count(*)::int n from public.email_messages where to_email in (select email from public.clients where id='${id}') and created_at > now() - interval '30 minutes'`))[0].n;
    ok(mails === 0, 'לא יצא מייל');
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
