#!/usr/bin/env node
/**
 * annual-one-round.mjs — «סבב אחד» (20.10.2026, 264): שאלון הדוח השנתי נגמר בסבב אחד, בדפדפן מול staging.
 *
 *   זוג נשוי עם ביטוח חיים, חשבון בנק בלי תאריך פתיחה ומעסיק בכרטיס → «＋ בקשה חדשה» ← «דוח שנתי 2025» → הלקוח בדף:
 *   «זה מה שידוע — נכון» ⇒ האישור השנתי מחברת הביטוח נפתח מיד; «החשבון היה קיים כל השנה» ⇒ ה-867 נפתח מיד;
 *   אריח ביטוח לאומי ⇒ «מה שולם?» באותו סבב (20.10.2026: בלי «דמי לידה?» לבד) → «שליחה למשרד» → המסמכים בסוף כוללים את שניהם
 *   → בסוף אין לאף אחד מה לפרסם: בסיכום אין «עוד שאלות».
 *
 *   STAGING_ENV_DIR=<תיקייה עם .env.staging ו-.env.local> node scripts/e2e/annual-one-round.mjs --base=http://localhost:5361 [--widths=1280,390] [--shots=<dir>]
 *
 * ‼ כל פנייה לייצור נחסמת ומכשילה. בסוף — ניקוי וסריקת שאריות. בלי מיילים.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { prepare } from './staging-session.mjs';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d);
const BASE = arg('base', 'http://localhost:5361');
const WIDTHS = arg('widths', '1280,390').split(',').map(Number);
const SHOTS = arg('shots', '');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const { chromium } = createRequire(process.env.PW_CORE ?? 'C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json')('playwright-core');
const PROD = 'uoweoqtuiettozagwgdw', STAGING = 'evdfxjqrkgugssfrdoxd';

let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(info).slice(0, 400)}` : ''}`); };
const text = async (loc) => ((await loc.count().catch(() => 0)) ? loc.first().innerText({ timeout: 5000 }).catch(() => '') : '');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/D/Ft6HmVAAAAAElFTkSuQmCC', 'base64');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });

/** עונה על השאלון בדף עד «תודה». מחזיר את כותרות השאלות לפי הסדר. */
async function answerAll(pp, ticks) {
  const flow = pp.locator('.ty-flow');
  const seen = [];
  for (let step = 0; step < 60; step++) {
    // ‼ 20.10.2026 · השאלון החדש: «רגע לפני ששולחים» ⇒ «שליחה למשרד» ⇒ המסמכים בסוף (AnnualFlow.tsx)
    if (await pp.locator('.ty-flow[data-annual-docs]').count()) { seen.push(`DOCS:${(await text(pp.locator('.ty-flow[data-annual-docs]'))).replace(/\s+/g, ' ')}`); seen.push('DONE'); break; }
    if ((await pp.locator('.ty-flow').getAttribute('data-screen')) === 'review') { await flow.locator('[data-annual-send]').click(); await pp.locator('.ty-flow[data-annual-docs]').waitFor({ timeout: 40000 }); continue; }
    // ‼ 21.10.2026 · סבב 2: «זה עדיין נכון?» — «נכון» בכל שורה; מסכי ריבועים לכל אדם; «הבא» = הכפתור הראשי
    const scr2 = await pp.locator('.ty-flow').getAttribute('data-screen');
    if (scr2 === 'confirmAll' || scr2 === 'grid') {
      const t0 = (await text(flow.locator('.ty-q').first())).trim(); seen.push(t0);
      if (scr2 === 'confirmAll') {
        for (let n = 0; n < 20; n++) { const b = flow.locator('.ty-krow-card .ty-seg button', { hasText: /^נכון$/ }).first(); if (!(await b.count())) break; await b.click(); }
      } else {
      for (const k of ticks) { const t = flow.locator(`.ty-tile2-main[data-tile="${k}"]`); if (await t.count() && (await t.getAttribute('aria-pressed')) !== 'true') { await t.click(); await pp.waitForTimeout(120); } }
      }
      const p0 = await flow.getAttribute('data-person');
      await flow.locator('.ty-nav .btn-primary').click();
      await pp.waitForFunction(([t, pr]) => { const f = document.querySelector('.ty-flow'); return !!f?.hasAttribute('data-annual-docs') || (f?.querySelector('.ty-q')?.textContent ?? '') !== t || f?.getAttribute('data-person') !== pr; }, [t0, p0], { timeout: 40000 }).catch(() => {});
      await pp.waitForTimeout(300); continue;
    }
    if ((await pp.locator('.ty-flow').getAttribute('data-screen')) === 'group') {
      const t0 = (await text(flow.locator('.ty-q').first())).trim(); seen.push(t0);
      for (const c of await flow.locator('.ty-group-card').all()) await c.locator('[data-tile="none"]').click();
      await flow.locator('.ty-nav .btn-primary').click(); await pp.waitForTimeout(600); continue;
    }
    if (await flow.locator('.ty-done-mark').count()) { await flow.locator('.ty-nav .btn-primary').click(); await pp.waitForTimeout(300); continue; }
    const title = (await text(flow.locator('.ty-q').first())).trim();
    seen.push(title);
    const next = async () => {
      await flow.locator('.ty-nav .btn-primary').click();
      await pp.waitForFunction((t) => (document.querySelector('.ty-flow .ty-q')?.textContent ?? '') !== t || !!document.querySelector('.ty-flow .ty-err'), title, { timeout: 20000 }).catch(() => {});
      await pp.waitForTimeout(250);
    };
    if (await flow.getByRole('button', { name: 'כן, הכול נכון' }).count()) {
      await flow.getByRole('button', { name: 'כן, הכול נכון' }).click();
      // אישור יחיד: «כן, הכול נכון» היא בחירה, ואז «הבא»; במסך המקובץ — הכפתור כבר שולח
      if ((await pp.locator('.ty-flow').getAttribute('data-screen')) !== 'confirmAll') { await next(); continue; }
      await pp.waitForFunction((t) => (document.querySelector('.ty-flow .ty-q')?.textContent ?? '') !== t, title, { timeout: 20000 }).catch(() => {});
      await pp.waitForTimeout(300); continue;
    }
    if (await flow.locator('.ty-tile[data-tile="none"]').count()) {
      let hit = false;
      for (const k of ticks) { const t = flow.locator(`.ty-tile[data-tile="${k}"]`); if (await t.count()) { hit = true; if ((await t.getAttribute('aria-pressed')) !== 'true') { await t.click(); await pp.waitForTimeout(120); } } }
      // ‼ סבב 2: מסך בחירה של אדם אחד («מה שולם מביטוח לאומי?») — בלי סימון ⇒ «אף אחד מאלה»
      if (!hit) await flow.locator('.ty-tile[data-tile="none"]').click();
      await next(); continue;
    }
    // תחולה של ישות («היה קיים / בבעלותכם») — כן; כל שאר הכן/לא ו«מי מכם?» — לא (כדי לא להעמיק בפרטים שלא נבדקים כאן)
    if (/היה קיים|היה בבעלות/.test(title) && await flow.locator('button', { hasText: /^כן — / }).count()) { await flow.locator('button', { hasText: /^כן — / }).first().click(); await next(); continue; }
    if (await flow.locator('input[type="file"]').count()) {
      await flow.locator('.ty-choice', { hasText: 'עוד לא קיבלתי את המסמך' }).first().click();
      await next(); continue;
    }
    if (/להעביר החזר/.test(title)) {
      await flow.locator('button', { hasText: 'חשבון בחו״ל' }).first().click();
      await flow.getByLabel('מדינה').fill('ארה״ב'); await flow.getByLabel('שם הבנק').fill('Chase'); await flow.getByLabel('IBAN או מספר חשבון').fill('US00TEST');
      await flow.locator('[role=radiogroup], [role=group]', { hasText: 'על שם מי החשבון' }).locator('button').first().click();
      await next(); continue;
    }
    if (await flow.locator('.ty-choice', { hasText: /^לא$/ }).count()) { await flow.locator('.ty-choice', { hasText: /^לא$/ }).first().click(); await next(); continue; }
    const first = flow.locator('.ty-choice').first();
    if (await first.count()) { await first.click(); await next(); continue; }
    if (await flow.locator('input[type="number"]').count()) { await flow.locator('input[type="number"]').first().fill('0'); await next(); continue; }
    if (await flow.locator('textarea').count()) { await flow.locator('textarea').first().fill('בדיקה'); await next(); continue; }
    seen.push(`STUCK: ${title}`); break;
  }
  return seen;
}

async function runWidth(width) {
  console.log(`\n▶ סבב אחד — ${width}px`);
  const env = await prepare();
  const blocked = [], consoleErrors = [];
  const id = env.clientId;
  try {
    await env.sql(`update public.clients set has_life_insurance = true, properties = '[]'::jsonb,
      investment_accounts = '[{"id":"a1","institutionName":"בנק לאומי","kind":"other"}]'::jsonb where id = '${id}'`);
    // ‼ הלקוח של staging-session נולד עם שאלון קליטה ישן פתוח — כלל «שאלון פתוח אחד» (263) היה חוסם את הדוח. כאן בודקים סבב אחד.
    await env.sql(`delete from public.onboarding_steps where client_id = '${id}' and step_type = 'intake_questionnaire'`);
    const mobile = width < 700;
    const ctx = await browser.newContext({ viewport: { width, height: mobile ? 800 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'he-IL' });
    await env.initContext(ctx);
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.includes(PROD)) { blocked.push(u); return route.abort(); }
      if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
      const host = new URL(u).hostname;
      if (host === 'localhost' || host === '127.0.0.1' || u.startsWith('data:') || u.startsWith('blob:') || host.includes(STAGING)) return route.continue();
      blocked.push(u); return route.abort();
    });
    const page = await ctx.newPage();
    const onErr = (p, tag) => { p.on('console', m => { if (m.type() === 'error' && !/favicon|ResizeObserver|Failed to load resource/.test(m.text())) consoleErrors.push(`${tag}: ${m.text().slice(0, 200)}`); }); p.on('pageerror', e => consoleErrors.push(`${tag} pageerror: ${String(e).slice(0, 200)}`)); };
    onErr(page, 'office');

    // 1 · המשרד: דוח שנתי בלחיצה אחת (אין דוח קודם ⇒ השאלון יוצא מיד)
    await page.goto(env.officeUrl(id, 'journey'), { waitUntil: 'domcontentloaded' });
    const addBtn = page.getByRole('button', { name: /＋ בקשה חדשה/ }).first();
    await addBtn.waitFor({ timeout: 40000 }); await addBtn.click();
    await page.locator('[data-tax-file-toggle]').click(); // «תיק המס» נפתחת; דוח שנתי מסומן מראש
    await page.locator('[data-annual-one-click]').click();
    await page.locator('[data-annual-summary]').first().waitFor({ timeout: 40000 }).catch(async (e) => {
      console.log('    [debug] ' + (await page.locator('body').innerText()).replace(/s+/g, ' ').slice(0, 1500));
      if (SHOTS) await page.screenshot({ path: join(SHOTS, 'stuck-' + width + '.png') });
      throw e;
    });
    const asks0 = await env.sql(`select item_key, prompt from public.tax_info_asks where client_id = '${id}' and state = 'published'`);
    const ins = asks0.find(a => a.item_key === 'savings.insurance');
    ok(asks0.length > 0, `השאלון יצא (${asks0.length} שאלות)`);
    ok((ins?.prompt?.onYes ?? []).some(f => f.itemKey === 'savings.insuranceCert'), 'אישור ביטוח החיים נושא מראש את האישור השנתי (onYes)', JSON.stringify(ins?.prompt?.onYes ?? null).slice(0, 200));
    const per = asks0.find(a => a.item_key === 'period.account');
    ok((per?.prompt?.onYes ?? []).some(f => f.itemKey === 'capital.form867'), '«החשבון היה קיים?» נושא מראש את ה-867', JSON.stringify(per?.prompt?.onYes ?? null).slice(0, 200));

    // 2 · הלקוח עונה בדף — הכול בסבב אחד
    const pp = await ctx.newPage(); onErr(pp, 'portal');
    await pp.goto(env.portalUrl(), { waitUntil: 'domcontentloaded' });
    await pp.waitForFunction(() => document.body.innerText.includes('הדוח השנתי 2025'), null, { timeout: 30000 });
    const card = pp.locator('.pp-item', { has: pp.getByText('הדוח השנתי 2025', { exact: true }) }).first();
    await card.getByRole('button', { name: /^(להשלמת המידע|להעלאת המסמכים)$/ }).click();
    await pp.locator('.ty-flow').waitFor({ timeout: 15000 });
    const seen = await answerAll(pp, ['niBenefits.received']);
    ok(seen.includes('DONE'), 'הלקוח הגיע ל«תודה»', seen.slice(-3).join(' | '));
    const docsLine = seen.find(t => t.startsWith('DOCS:')) ?? '';
    ok(/ביטוח החיים|חברת הביטוח|ביטוח חיים/.test(docsLine), 'האישור השנתי מחברת הביטוח — ברשימת המסמכים של אותו סבב', docsLine.slice(0, 300));
    ok(/867|בנק לאומי|בית השקעות/.test(docsLine), 'ה-867 של בנק לאומי — ברשימת המסמכים של אותו סבב', docsLine.slice(0, 300));
    ok(seen.some(t => /מה שולם מביטוח לאומי/.test(t)) && !seen.some(t => /האם מתוך זה/.test(t)), '«מה שולם מביטוח לאומי?» באותו סבב — בלי «דמי לידה?» לבד', seen.join(' | ').slice(0, 300));
    if (SHOTS) await pp.screenshot({ path: join(SHOTS, `portal-done-${width}.png`) }).catch(() => {});

    // 3 · המשרד: אין «עוד שאלות» לפרסם
    const left = await env.sql(`select count(*)::int n from public.tax_info_asks where client_id = '${id}' and state = 'published' and prompt->'input'->>'kind' <> 'file'`); // מסמכים — בסוף, עד שמועלים
    ok(left[0].n === 0, 'בשרת: אין שאלה שמחכה ללקוח', `published=${left[0].n}`);
    const [st] = await env.sql(`select id from public.onboarding_steps where client_id = '${id}' and step_type = 'annual_return'`);
    await page.goto(env.officeUrl(id, `journey/${st.id}`), { waitUntil: 'domcontentloaded' });
    await page.locator('[data-annual-summary]').first().waitFor({ timeout: 40000 });
    await page.waitForTimeout(1500);
    const more = await text(page.locator('[data-annual-more]'));
    ok(!more, 'בסיכום אין «עוד שאלות … הכן ופרסם» — השאלון נגמר בסבב אחד', more);
    if (SHOTS) await page.locator('[data-annual-summary]').first().screenshot({ path: join(SHOTS, `office-summary-${width}.png`) }).catch(() => {});
    ok((await env.sql(`select count(*)::int n from public.email_messages where client_id = '${id}'`))[0].n === 0, 'לא יצא מייל');
    await ctx.close();
  } catch (e) {
    ok(false, 'המסלול נעצר', String(e?.message ?? e).split('\n').slice(0, 3).join(' '));
  } finally {
    ok(blocked.length === 0, 'אין פנייה לייצור או למארח זר', blocked.slice(0, 3).join(' '));
    ok(consoleErrors.length === 0, 'בלי שגיאות בדפדפן', consoleErrors.slice(0, 3).join(' | '));
    const left = await env.cleanup().catch(e => ({ left: -1, err: String(e) }));
    ok(left.left === 0, 'ניקוי: לא נשארו שורות של לקוחות הבדיקה', JSON.stringify(left));
  }
}

for (const w of WIDTHS) await runWidth(w);
await browser.close();
console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
