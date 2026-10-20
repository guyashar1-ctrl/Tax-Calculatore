#!/usr/bin/env node
/**
 * annual-purge.mjs — «פתח כמו הלקוח» + «מחק לגמרי» (20.10.2026, 266), בדפדפן מול staging.
 *
 *   «דוח שנתי 2025» בלחיצה → «פתח כמו הלקוח ↗» פותח את הדף האמיתי → עונים ומעלים קובץ כמו הלקוח → ב«בקשות» ⋯ →
 *   «למחוק לגמרי» (רשימה של מה נמחק) → הבקשה, השאלות, העובדות, הראיות והקבצים נעלמים (ועותק נסתר נשמר) → פותחים שוב:
 *   שאלון נקי, בלי שום זכר לבדיקה. בלי מייל.
 *
 *   STAGING_ENV_DIR=<…> node scripts/e2e/annual-purge.mjs --base=http://localhost:5361 [--widths=1280,390]
 */
import { createRequire } from 'node:module';
import { prepare } from './staging-session.mjs';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d);
const BASE = arg('base', 'http://localhost:5361');
const WIDTHS = arg('widths', '1280,390').split(',').map(Number);
const { chromium } = createRequire(process.env.PW_CORE ?? 'C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json')('playwright-core');
const PROD = 'uoweoqtuiettozagwgdw', STAGING = 'evdfxjqrkgugssfrdoxd';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/D/Ft6HmVAAAAAElFTkSuQmCC', 'base64');

let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(info).slice(0, 400)}` : ''}`); };
const text = async (loc) => ((await loc.count().catch(() => 0)) ? loc.first().innerText({ timeout: 5000 }).catch(() => '') : '');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });

/** עונה עד «תודה»: אישורים — נכון; ברשת — «תרומות»; מסמך — מעלה קובץ; כן/לא — לא. */
async function answerAll(pp) {
  const flow = pp.locator('.ty-flow');
  let uploaded = 0;
  for (let step = 0; step < 50; step++) {
    // ‼ 20.10.2026 · השאלון החדש: «שליחה למשרד» מ«רגע לפני ששולחים», והמסמכים רק בסוף — מעלים אחד משם
    if (await pp.locator('.ty-flow[data-annual-docs]').count()) {
      const item = flow.locator('[data-owed]').first();
      if (await item.count()) {
        await item.getByRole('button', { name: 'העלאה' }).click();
        const single = item.getByRole('button', { name: 'יש לי קובץ אחד שמכיל הכול' });
        if (await single.count()) { await single.first().click(); await pp.waitForTimeout(300); }
        await item.locator('input[type="file"]').first().setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: PNG });
        await pp.waitForTimeout(800);
        const confirm = item.locator('[data-testid=dp-confirm]');
        if (await confirm.count() && await confirm.first().isEnabled()) await confirm.first().click().catch(() => {});
        await pp.locator('.ty-flow [data-done]').first().waitFor({ timeout: 30000 }).catch(() => {});
        uploaded = await flow.locator('[data-done]').count();
      }
      return { done: true, uploaded };
    }
    if ((await pp.locator('.ty-flow').getAttribute('data-screen')) === 'review') {
      if (await flow.locator('[data-annual-send]').isDisabled()) return { done: false, uploaded, stuck: (await text(flow)).replace(/\s+/g, ' ').slice(0, 600) };
      await flow.locator('[data-annual-send]').click(); await pp.locator('.ty-flow[data-annual-docs]').waitFor({ timeout: 40000 }); continue;
    }
    if ((await pp.locator('.ty-flow').getAttribute('data-screen')) === 'group') {
      for (const c of await flow.locator('.ty-group-card').all()) await c.locator('[data-tile="none"]').click();
      await flow.getByRole('button', { name: /^הבא$/ }).click(); await pp.waitForTimeout(400); continue;
    }
    if (await flow.locator('.ty-q', { hasText: /תודה!|התשובות נשלחו למשרד/ }).count()) return { done: true, uploaded };
    if (await flow.locator('.ty-done-mark').count()) { await flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).click(); await pp.waitForTimeout(300); continue; }
    const title = (await text(flow.locator('.ty-q').first())).trim();
    const next = async () => {
      await flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).click();
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
    if (await flow.locator('.ty-choice', { hasText: /^לא$/ }).count()) { await flow.locator('.ty-choice', { hasText: /^לא$/ }).first().click(); await next(); continue; }
    const first = flow.locator('.ty-choice').first();
    if (await first.count()) { await first.click(); await next(); continue; }
    if (await flow.locator('textarea').count()) { await flow.locator('textarea').first().fill('בדיקה'); await next(); continue; }
    return { done: false, uploaded, stuck: title };
  }
  return { done: false, uploaded };
}

async function runWidth(width) {
  console.log(`\n▶ פתח כמו הלקוח + מחק לגמרי — ${width}px`);
  const env = await prepare();
  const blocked = [], consoleErrors = [];
  const id = env.clientId;
  try {
    await env.sql(`delete from public.onboarding_steps where client_id = '${id}' and step_type = 'intake_questionnaire'`);
    const mobile = width < 700;
    const ctx = await browser.newContext({ viewport: { width, height: mobile ? 800 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'he-IL' });
    await env.initContext(ctx);
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.includes(PROD)) { blocked.push(u); return route.abort(); }
      if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
      const host = new URL(u).hostname;
      if (host === 'localhost' || host === '127.0.0.1' || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:') || host.includes(STAGING)) return route.continue();
      blocked.push(u); return route.abort();
    });
    const onErr = (p, tag) => { p.on('console', m => { if (m.type() === 'error' && !/favicon|ResizeObserver|Failed to load resource/.test(m.text())) consoleErrors.push(`${tag}: ${m.text().slice(0, 200)}`); }); p.on('pageerror', e => consoleErrors.push(`${tag} pageerror: ${String(e).slice(0, 200)}`)); };
    const page = await ctx.newPage(); onErr(page, 'office');

    // 1 · דוח שנתי בלחיצה
    await page.goto(env.officeUrl(id, 'journey'), { waitUntil: 'domcontentloaded' });
    const addBtn = page.getByRole('button', { name: /＋ בקשה חדשה/ }).first();
    await addBtn.waitFor({ timeout: 40000 }); await addBtn.click();
    await page.locator('[data-tax-file-toggle]').click(); // «תיק המס» נפתחת; דוח שנתי מסומן מראש
    await page.locator('[data-annual-one-click]').click();
    await page.locator('[data-annual-summary]').first().waitFor({ timeout: 40000 });
    const [st] = await env.sql(`select id from public.onboarding_steps where client_id = '${id}' and step_type = 'annual_return' and status <> 'cancelled'`);
    ok(!!st, 'דוח שנתי נפתח');

    // 2 · «פתח כמו הלקוח» ⇒ הדף האמיתי בחלון חדש
    const btn = page.locator('[data-annual-as-client]');
    ok(await btn.count() === 1, 'בסיכום: «פתח כמו הלקוח ↗»', await text(page.locator('[data-annual-summary]')));
    const [pp] = await Promise.all([ctx.waitForEvent('page'), btn.click()]);
    onErr(pp, 'portal');
    await pp.waitForURL(/\?portal=/, { timeout: 20000 });
    ok(/\?portal=/.test(pp.url()), 'נפתח הדף האישי האמיתי של הלקוח', pp.url());
    await pp.waitForFunction(() => document.body.innerText.includes('הדוח השנתי 2025'), null, { timeout: 30000 });
    const card = pp.locator('.pp-item', { has: pp.getByText('הדוח השנתי 2025', { exact: true }) }).first();
    await card.getByRole('button', { name: /^(להשלמת המידע|להעלאת המסמכים)$/ }).click();
    await pp.locator('.ty-flow').waitFor({ timeout: 15000 });
    const res = await answerAll(pp);
    ok(res.done, 'ענינו עד «תודה» בדף של הלקוח', JSON.stringify(res));
    ok(res.uploaded > 0, `הועלה קובץ (${res.uploaded})`);
    const before = (await env.sql(`select
      (select count(*)::int from public.tax_info_asks where client_id = '${id}') asks,
      (select count(*)::int from public.tax_year_facts where client_id = '${id}' and tax_year = 2025) facts,
      (select count(*)::int from public.tax_evidence where client_id = '${id}') ev,
      (select count(*)::int from public.documents where client_id = '${id}') docs`))[0];
    ok(before.facts > 0 && before.ev > 0 && before.docs > 0, 'במסד: יש תשובות, ראיה וקובץ מהבדיקה', JSON.stringify(before));
    await pp.close();

    // 3 · ⋯ ← «למחוק לגמרי»
    await page.goto(env.officeUrl(id, 'journey'), { waitUntil: 'domcontentloaded' });
    const menu = page.locator('button[aria-label^="פעולות על הבקשה: דוח שנתי"]').first();
    await menu.waitFor({ timeout: 40000 }); await menu.click();
    await page.locator('.rl-more-menu:not([hidden]) [role="menuitem"]').first().click();
    const dlg = page.locator('[data-remove-work]');
    await dlg.waitFor({ timeout: 15000 });
    await dlg.locator('[data-rw-purge]').waitFor({ timeout: 15000 });
    await dlg.locator('[data-rw-purge]').click();
    const list = await text(dlg.locator('[data-rw-purge-list]'));
    ok(/תשובות/.test(list) && /קבצים שהועלו/.test(list) && /הכרטיס/.test(list), 'החלון מפרט מה נמחק ומה נשאר', list);
    ok((await text(dlg.locator('[data-rw-confirm]'))).includes('מחק לגמרי'), 'הכפתור: «מחק לגמרי»');
    await dlg.locator('[data-rw-confirm]').click();
    await dlg.waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
    const after = (await env.sql(`select
      (select count(*)::int from public.onboarding_steps where client_id = '${id}' and step_type in ('annual_return','info_collection') and payload->>'taxYear' = '2025') steps,
      (select count(*)::int from public.tax_info_asks where client_id = '${id}') asks,
      (select count(*)::int from public.tax_year_facts where client_id = '${id}' and tax_year = 2025) facts,
      (select count(*)::int from public.tax_evidence where client_id = '${id}') ev,
      (select count(*)::int from public.documents where client_id = '${id}') docs,
      (select count(*)::int from public.tax_work_trash where client_id = '${id}') trash`))[0];
    ok(after.steps === 0 && after.asks === 0 && after.facts === 0 && after.ev === 0 && after.docs === 0, 'במסד: הבקשה, השאלות, התשובות, הראיות והקבצים — נמחקו', JSON.stringify(after));
    ok(after.trash === 1, 'נשמר עותק נסתר אחד', JSON.stringify(after));
    ok(!(await page.locator('.rl-name', { hasText: 'דוח שנתי 2025' }).count()), 'השורה ירדה מ«בקשות»');

    // 4 · פותחים שוב — שאלון נקי
    await page.getByRole('button', { name: /＋ בקשה חדשה/ }).first().click();
    await page.locator('[data-tax-file-toggle]').click(); // «תיק המס» נפתחת; דוח שנתי מסומן מראש
    await page.locator('[data-annual-one-click]').click();
    await page.locator('[data-annual-summary]').first().waitFor({ timeout: 40000 });
    const fresh = await env.sql(`select item_key, state from public.tax_info_asks where client_id = '${id}'`);
    ok(fresh.length > 0 && fresh.every(a => a.state === 'published') && fresh.some(a => a.item_key === 'annual.whatHappened'),
      'דוח חדש: שאלון נקי — הכול שוב לשאול, כולל מסך הריבועים', fresh.map(a => `${a.item_key}:${a.state}`).join(','));
    ok((await env.sql(`select count(*)::int n from public.email_messages where client_id = '${id}'`))[0].n === 0, 'לא יצא מייל');
    await ctx.close();
  } catch (e) {
    ok(false, 'המסלול נעצר', String(e?.message ?? e).split('\n').slice(0, 3).join(' '));
  } finally {
    ok(blocked.length === 0, 'אין פנייה לייצור או למארח זר', blocked.slice(0, 3).join(' '));
    ok(consoleErrors.length === 0, 'בלי שגיאות בדפדפן', consoleErrors.slice(0, 3).join(' | '));
    await env.sql(`delete from public.tax_work_trash where client_id in ('${env.clientId}', '${env.otherClientId}')`).catch(() => {});
    const left = await env.cleanup().catch(e => ({ left: -1, err: String(e) }));
    ok(left.left === 0, 'ניקוי: לא נשארו שורות של לקוחות הבדיקה', JSON.stringify(left));
  }
}

for (const w of WIDTHS) await runWidth(w);
await browser.close();
console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
