#!/usr/bin/env node
/**
 * estimate-four-steps.mjs — הערכת מס בארבעה שלבים (27.10.2026), בדפדפן מול staging: המשרד ⇄ הדף האישי.
 *   הדמיה מאושרת: docs/proposals/2026-10-27-tax-estimate.html
 *
 *   שאלון («שלח שאלון» — בלי מייל) ⇒ הלקוח עונה («הכול בפייפרלס?») ⇒ «משוך מפייפרלס» (רו״ה חודשי) ⇒ בקשת הצפי
 *   יוצאת לבד ⇒ הלקוח: «יהיה אחרת» בהכנסות (± לחודש), «נכון» בהוצאות ⇒ המשרד: הצפי של הלקוח בחישוב, טבלת
 *   ההתאמות, ההמלצה «לפחות» ⇒ (כשאין חוסמים) «פרסם בדף» ⇒ «עדכנתי את המקדמות».
 *
 *   STAGING_ENV_DIR=<…> node scripts/e2e/estimate-four-steps.mjs --base=http://localhost:<port> [--widths=1280,390] [--shots=<dir>]
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
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });

// רו״ה חודשי בפורמט של פייפרלס: הכנסות 30,000 לחודש, רכב 1,500, כיבוד 300, קנסות 100 בספטמבר
const M = ['01/26', '02/26', '03/26', '04/26', '05/26', '06/26', '07/26', '08/26', '09/26', '10/26', '11/26', '12/26'];
const row = (label, v, last) => [label, ...M.map((_, i) => (i < 9 ? (typeof v === 'function' ? v(i) : v) : '')), last];
const PNL = [
  ['דוד בדיקה - עוסק מורשה'], ['דוח רווח והפסד לתקופה 01/26 - 12/26'], ['קוד מיון', ...M, 'סכום'], ['הכנסות'],
  row('הכנסות ממתן שירותים בארץ', '30000', '270000'), row('סך הכנסות', '30000', '270000'), ['הוצאות'],
  row('אחזקת רכב', '1500', '13500'), row('כיבוד', '300', '2700'), row('קנסות', i => (i === 8 ? '100' : '0'), '100'),
  row('סך הוצאות', i => String(1800 + (i === 8 ? 100 : 0)), '16300'), row('סך רווח והפסד', i => String(28200 - (i === 8 ? 100 : 0)), '253700'),
].map(r => r.join('\t')).join('\n');

/** השאלון: כן/לא — «לא», אישור — נכון, בחירה — הראשונה, טקסט — «בדיקה»; הצפי — נבחר מבחוץ. */
async function answer(page, onForecast) {
  const log = [];
  let last = '', same = 0;
  for (let step = 0; step < 70; step++) {
    const flow = page.locator('.ty-flow');
    if (await flow.locator('.ty-q', { hasText: /תודה!|התשובות נשלחו למשרד/ }).count()) { log.push({ done: true }); break; }
    const title = (await text(flow.locator('.ty-q').first())).trim();
    same = title === last ? same + 1 : 0; last = title;
    if (same > 3) { log.push({ title, err: 'אותה שאלה ארבע פעמים' }); break; }
    if (await flow.locator('.ty-done-mark').count()) { await flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).click(); await sleep(300); continue; }
    let act = 'no';
    if (await flow.locator('[data-record-forecast]').count()) { await onForecast(flow); act = 'forecast'; }
    else if (await flow.getByRole('button', { name: 'כן, הכול נכון' }).count()) {
      await flow.getByRole('button', { name: 'כן, הכול נכון' }).click(); act = 'confirm';
      const moved = await page.waitForFunction(t => (document.querySelector('.ty-flow .ty-q')?.textContent ?? '') !== t, title, { timeout: 8000 }).then(() => true, () => false);
      if (moved) { log.push({ title, act }); await sleep(300); continue; }
    }
    else if (await flow.locator('.rec-seg-btn', { hasText: 'אישה' }).count() && await flow.locator('input[type="date"]').count()) { await flow.locator('.rec-seg-btn', { hasText: 'אישה' }).first().click(); await flow.locator('input[type="date"]').first().fill('1990-01-01'); act = 'spouse'; }
    else if (await flow.locator('[data-gate="no"]').count()) { await flow.locator('[data-gate="no"]').first().click(); act = 'none'; }
    else if (await flow.locator('.rec-card, .rec-field').count()) {
      for (const i of await flow.locator('.rec-field input[type="text"]').all()) if (!(await i.inputValue())) await i.fill('בדיקה').catch(() => {});
      for (const g of await flow.locator('.rec-seg').all()) if (!(await g.locator('[aria-pressed="true"], [aria-checked="true"]').count())) await g.locator('button').first().click().catch(() => {});
      act = 'record';
    }
    else if (await flow.locator('input[type="number"]').count()) { await flow.locator('input[type="number"]').first().fill('0'); act = 'amount'; }
    else if (await flow.locator('.ty-choice', { hasText: /^לא$/ }).count()) await flow.locator('.ty-choice', { hasText: /^לא$/ }).first().click();
    else if (await flow.locator('textarea').count()) { await flow.locator('textarea').first().fill('בדיקה'); act = 'text'; }
    else if (await flow.locator('.ty-choice').count()) { await flow.locator('.ty-choice').first().click(); act = 'choice'; }
    log.push({ title, act });
    await sleep(350);
    await flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).click();
    await page.waitForFunction(t => (document.querySelector('.ty-flow .ty-q')?.textContent ?? '') !== t || !!document.querySelector('.ty-flow .ty-err'), title, { timeout: 25000 }).catch(() => {});
    await sleep(250);
    const err = await text(flow.locator('.ty-err'));
    if (err) { log[log.length - 1].err = err; break; }
  }
  return log;
}

async function runWidth(width) {
  console.log(`\n▶ הערכת מס בארבעה שלבים — ${width}px`);
  const env = await prepare();
  const blocked = [], consoleErrors = [];
  const id = env.clientId;
  const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}-${width}.png`), fullPage: true }).catch(() => {}); };
  try {
    await env.sql(`update public.onboarding_steps set status='cancelled' where client_id = '${id}' and step_type in ('intake_questionnaire','annual_return','tax_file_intake','info_collection','wealth_declaration') and status <> 'cancelled'`);
    // עסק בכרטיס + מקדמות שנקראו מהרשות (שיעור 5%, ב״ל 1,450)
    await env.sql(`update public.clients set businesses = '[{"id":"b1","name":"ייעוץ בדיקה","startDate":"2020-01-01"}]'::jsonb,
      employers = '[]'::jsonb, properties = '[]'::jsonb, family_status = 'single', spouse_first_name = null,
      pit_advance_percent = 5, pit_advance_frequency = 'monthly', ni_advance_monthly = 1450 where id = '${id}'`).catch(e => console.log('    (עדכון הכרטיס)', e.message.slice(0, 160)));
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
    const ew = page.locator('section.ew');
    const stage = async () => (await ew.getAttribute('data-ew-stage').catch(() => '')) ?? '';
    const waitStage = async (s, ms = 40000) => { await page.waitForFunction(x => document.querySelector('section.ew')?.getAttribute('data-ew-stage') === x, s, { timeout: ms }).catch(() => {}); return stage(); };

    // 1 · «＋ בקשה חדשה» ← הערכת מס ⇒ שלב «שאלון»
    await page.goto(env.officeUrl(id, 'journey'), { waitUntil: 'domcontentloaded' });
    const addBtn = page.getByRole('button', { name: /＋ בקשה חדשה/ }).first();
    await addBtn.waitFor({ timeout: 40000 }); await addBtn.click();
    await page.locator('[data-tax-file-toggle]').click();
    await page.locator('#ar-taxfile-panel label', { hasText: 'הערכת מס' }).locator('input[type="radio"]').check();
    await page.locator('#ar-taxfile-panel').getByRole('button', { name: 'פתח' }).click();
    await ew.waitFor({ timeout: 40000 });
    ok(await waitStage('q') === 'q', 'המסך החדש: שלב «שאלון»', await stage());
    ok(await page.locator('[data-annual-advanced]').evaluate(e => e.hidden).catch(() => false), 'המסך הישן — ב«כלים מתקדמים» (מוסתר)');
    ok(/יופיע אחרי המשיכה מפייפרלס/.test(await text(ew)), 'הכנסות והוצאות — מחכה לפייפרלס');
    const [st] = await env.sql(`select id from public.onboarding_steps where client_id = '${id}' and step_type = 'tax_estimate' and status <> 'cancelled' order by created_at desc limit 1`);
    await shot(page, 'ew-1-start');

    // 2 · שליחת השאלון
    await ew.locator('[data-ew-send]').click();
    ok(await waitStage('waiting') === 'waiting', '«השאלון אצל דוד»', await stage());
    const pp = await ctx.newPage(); onErr(pp, 'portal');
    await pp.goto(env.portalUrl(), { waitUntil: 'domcontentloaded' });
    await pp.waitForFunction(() => document.body.innerText.includes('הערכת מס'), null, { timeout: 30000 });
    const card = pp.locator('div', { has: pp.getByText(/הערכת מס/) }).filter({ has: pp.getByRole('button', { name: 'להשלמת המידע' }) }).last();
    await card.getByRole('button', { name: 'להשלמת המידע' }).click();
    await pp.locator('.ty-flow').waitFor({ timeout: 15000 });
    const log1 = await answer(pp, async () => {});
    ok(log1.some(x => x.done) && log1.every(x => !x.err), `הלקוח השלים את השאלון (${log1.length - 1} צעדים)`, JSON.stringify(log1.filter(x => x.err).slice(-2)));
    ok(log1.some(x => /פייפרלס/.test(x.title ?? '')), 'בשאלון: «כל החשבוניות והקבלות — כבר בפייפרלס?»', JSON.stringify(log1.map(x => x.title).slice(0, 12)));
    ok(!log1.some(x => /לעומת מה שהיה עד עכשיו|חד־פעמי/.test(x.title ?? '')), 'בשאלון אין שאלת צפי ישנה');

    // 3 · המשרד: «משוך מפייפרלס» ⇒ רו״ה ⇒ הצפי יוצא לבד
    await page.goto(env.officeUrl(id, `journey/${st.id}`), { waitUntil: 'domcontentloaded' }); await page.reload({ waitUntil: 'domcontentloaded' });
    await ew.waitFor({ timeout: 40000 });
    ok(await waitStage('answered') === 'answered', 'שלב «פייפרלס»: «השאלון נענה» + «משוך מפייפרלס»', await stage());
    await ew.locator('[data-ew-pull]').click();
    await ew.locator('textarea').first().fill(PNL);
    await ew.getByRole('button', { name: /^קלוט לשורה/ }).click();
    ok(await waitStage('pulled', 60000) === 'pulled', 'אחרי הקליטה: «הצפי אצל דוד»', await stage() + ' ' + (await text(ew.locator('.ty-err'))));
    const adj = await text(ew.locator('[data-ew-adj]'));
    ok(/אחזקת רכב/.test(adj) && /6,075|−6,075/.test(adj) && /כיבוד/.test(adj) && /540/.test(adj) && /קנסות/.test(adj), 'טבלת ההתאמות: רכב 45%, כיבוד 80%, קנסות', adj.replace(/\s+/g, ' ').slice(0, 300));
    const fAsk = (await env.sql(`select state from public.tax_info_asks where client_id='${id}' and item_key='business.forecastMonths'`));
    ok(fAsk.length === 1 && fAsk[0].state === 'published', 'בקשת הצפי נוצרה ופורסמה — אחת', JSON.stringify(fAsk));
    await shot(page, 'ew-2-pulled');

    // 4 · הלקוח: «יהיה אחרת» בהכנסות (+ בדצמבר), «נכון» בהוצאות
    await pp.goto(env.portalUrl(), { waitUntil: 'domcontentloaded' });
    await pp.waitForFunction(() => document.body.innerText.includes('הערכת מס'), null, { timeout: 30000 });
    await pp.locator('div', { has: pp.getByText(/הערכת מס/) }).filter({ has: pp.getByRole('button', { name: 'להשלמת המידע' }) }).last().getByRole('button', { name: 'להשלמת המידע' }).click();
    await pp.locator('.ty-flow').waitFor({ timeout: 15000 });
    const log2 = await answer(pp, async flow => {
      const inc = flow.locator('[data-fm="inc"]'), exp = flow.locator('[data-fm="exp"]');
      ok(await inc.locator('.fm-chart > div').count() === 12, 'בדף: עמודה לכל חודש');
      await inc.getByRole('button', { name: 'יהיה אחרת' }).click();
      for (let k = 0; k < 5; k++) await inc.getByRole('button', { name: 'יותר בדצמבר' }).click();
      await exp.getByRole('button', { name: 'נכון' }).click();
      await shot(pp, 'ew-3-forecast');
      ok(/לפי ההערכה שלך — לכל השנה/.test(await text(inc)), 'בדף: «לפי ההערכה שלך — לכל השנה»');
      ok(await pp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'בדף — בלי גלילה לרוחב');
    });
    ok(log2.some(x => x.act === 'forecast') && log2.some(x => x.done), 'הלקוח שלח את הצפי', JSON.stringify(log2.slice(-3)));
    await pp.close();

    // 5 · המשרד: הצפי של הלקוח בחישוב ⇒ «פרסם»
    await page.goto(env.officeUrl(id, `journey/${st.id}`), { waitUntil: 'domcontentloaded' }); await page.reload({ waitUntil: 'domcontentloaded' });
    await ew.waitFor({ timeout: 40000 });
    const s5 = await waitStage('ready', 40000);
    ok(s5 === 'ready', 'שלב «הערכה והמלצה»', s5);
    const ie = await text(ew.locator('[data-ew-ie]'));
    ok(/370,000/.test(ie) && /שינה/.test(ie), 'הצפי של הלקוח בחישוב: 270,000 + 3×30,000 + 10,000 = 370,000 · «שינה»', ie.replace(/\s+/g, ' ').slice(0, 300));
    const rec = await text(ew.locator('[data-ew-rec="it"]'));
    ok(/לפחות/.test(rec) && /מהמחזור/.test(rec), 'ההמלצה במ״ה: «לפחות X% מהמחזור»', rec);
    const total = await text(ew.locator('[data-ew-total]'));
    ok(/חוב|זכות|מאוזן/.test(total), `המספר: ${total}`);
    const pub = ew.locator('[data-ew-publish]');
    if (await pub.isEnabled()) {
      await pub.click();
      const s6 = await waitStage('published', 40000);
      ok(s6 === 'published' || s6 === 'done', 'פורסם בדף — «עדכנתי את המקדמות»', s6 + ' ' + (await text(ew.locator('.ty-err'))));
      const v = await env.sql(`select status, published_at is not null p from public.tax_estimates where request_id='${st.id}' order by version desc limit 1`);
      ok(v[0]?.status === 'approved' && v[0]?.p, 'גרסה מאושרת ומפורסמת (231/232)', JSON.stringify(v));
      if (s6 === 'published') {
        await ew.locator('[data-ew-applied]').click();
        ok(await waitStage('done') === 'done', '«המקדמות עודכנו»', await stage());
      }
    } else {
      const miss = await text(ew.locator('.ew-missing'));
      ok(miss.length > 0, `«פרסם» חסום עם רשימת «חסר» גלויה (${miss.split('\n').length - 1})`, miss);
    }
    await shot(page, 'ew-4-ready');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'המשרד — בלי גלילה לרוחב');
    const mail = (await env.sql(`select count(*)::int n from public.email_messages where client_id='${id}'`))[0].n;
    ok(mail === 0, 'לא יצא שום מייל');
    await ctx.close();
  } catch (e) {
    ok(false, 'המסלול נעצר', e.stack ?? e);
  } finally {
    ok(blocked.length === 0, 'אין פנייה לייצור או למארח זר', blocked.slice(0, 4).join(' | '));
    ok(consoleErrors.length === 0, 'בלי שגיאות בדפדפן', consoleErrors.slice(0, 4).join(' | '));
    await env.sql(`delete from public.tax_estimates where client_id='${id}'`).catch(() => {});
    const c = await env.cleanup().catch(e => ({ left: -1, err: e.message }));
    ok(c.left === 0, 'ניקוי: לא נשארו שורות של לקוחות הבדיקה', JSON.stringify(c));
  }
}

for (const wd of WIDTHS) await runWidth(wd);
await browser.close();
console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
