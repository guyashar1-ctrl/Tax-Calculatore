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

    // 2 · «פתח כמו הלקוח» ⇒ הדף האמיתי בחלון חדש — ‼ 21.10.2026 · ב-⋯ של «הדף של {שם}» (לא בסיכום)
    await page.locator('[data-testid="rl-page-more"]').click();
    const btn = page.locator('[data-testid="rl-page"] [data-annual-as-client]');
    ok(await btn.count() === 1 && await btn.isVisible(), '⋯ של «הדף של …»: «פתח כמו … ↗»', await text(page.locator('[data-testid="rl-page"]')));
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

    // 3 · ⋯ ← «הסר…» ← ביטול (ברירת המחדל) — מה שגיא עשה ב-21.10
    await page.goto(env.officeUrl(id, 'journey'), { waitUntil: 'domcontentloaded' });
    const menuOf = () => page.locator('button[aria-label^="פעולות על הבקשה: דוח שנתי"]').first();
    await menuOf().waitFor({ timeout: 40000 }); await menuOf().click();
    await page.locator('.rl-more-menu:not([hidden]) [data-remove-action="tax_work"]').click();
    const dlg = page.locator('[data-remove-work]');
    await dlg.locator('[data-rw-confirm]').waitFor({ timeout: 15000 });
    await dlg.locator('[data-rw-confirm]').click();
    await dlg.waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
    const [old] = await env.sql(`select id from public.onboarding_steps where client_id = '${id}' and step_type = 'annual_return' and status = 'cancelled'`);
    ok(!!old, 'ביטול: הדוח בוטל (התשובות נשמרו)');
    await page.reload({ waitUntil: 'domcontentloaded' }); // כמו משתמש שרואה את השורה יורדת — הרשימה מתרעננת לפני פתיחה מחדש

    // 3א · ‼ 21.10.2026 · דוח חדש אחרי ביטול — שאלון נקי: תשובות שלא אושרו מהדוח שבוטל אינן «ידוע»
    await page.getByRole('button', { name: /＋ בקשה חדשה/ }).first().click();
    await page.locator('[data-tax-file-toggle]').click();
    await page.locator('[data-annual-one-click]').click();
    await page.locator('[data-annual-summary]').first().waitFor({ timeout: 40000 });
    const reopened = await env.sql(`select a.item_key from public.tax_info_asks a join public.onboarding_steps s on s.id = a.parent_step_id where a.client_id = '${id}' and s.status <> 'cancelled'`);
    if (!reopened.some(a => a.item_key === 'annual.whatHappened')) console.log('    [debug] steps', JSON.stringify(await env.sql(`select step_type, status, payload->>'held' held, (select count(*) from public.tax_info_asks x where x.parent_step_id = s.id) n from public.onboarding_steps s where client_id = '${id}' order by created_at`)), 'body:', (await page.locator('body').innerText()).replace(/s+/g, ' ').slice(0, 600));
    ok(reopened.some(a => a.item_key === 'annual.whatHappened'), 'אחרי ביטול ופתיחה מחדש — מסך הריבועים חוזר (לא «השאלון הישן»)', reopened.map(a => a.item_key).join(','));

    // 3ב · תיק המס ← «היסטוריה» ← «מחק» (ישר, בלי לחפש בתוך «החזר…»)
    await page.goto(env.officeUrl(id, 'taxfile'), { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const purgeBtn = page.locator('[data-tf-purge]').first();
    const cancelledBox = page.locator('[data-tf-cancelled] > summary').first();
    await cancelledBox.waitFor({ timeout: 40000 }); await cancelledBox.click(); // «היסטוריה (N)» — מקופל
    await purgeBtn.waitFor({ timeout: 15000 });
    await purgeBtn.click();
    await dlg.locator('[data-rw-purge-list]').waitFor({ timeout: 15000 });
    const list = await text(dlg.locator('[data-rw-purge-list]'));
    ok(/תשובות/.test(list) && /קבצים שהועלו/.test(list) && /הכרטיס/.test(list), '«מחק»: החלון נפתח ישר על המחיקה ומפרט מה נמחק ומה נשאר', list);
    ok(!(await dlg.locator('[data-rw-purge]').count()), '«מחק»: בלי בחירה נוספת — רק מחיקה');
    ok((await text(dlg.locator('[data-rw-confirm]'))).includes('מחק לגמרי'), 'הכפתור: «מחק לגמרי»');
    await dlg.locator('[data-rw-confirm]').click();
    await dlg.waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
    const afterOld = (await env.sql(`select
      (select count(*)::int from public.onboarding_steps where id = '${old.id}') steps,
      (select count(*)::int from public.tax_year_facts where client_id = '${id}' and tax_year = 2025) facts,
      (select count(*)::int from public.tax_evidence where client_id = '${id}') ev,
      (select count(*)::int from public.documents where client_id = '${id}') docs,
      (select count(*)::int from public.tax_work_trash where client_id = '${id}') trash`))[0];
    ok(afterOld.steps === 0 && afterOld.facts === 0 && afterOld.ev === 0 && afterOld.docs === 0, 'במסד: הדוח שבוטל, התשובות, הראיות והקבצים — נמחקו', JSON.stringify(afterOld));
    ok(afterOld.trash === 1, 'נשמר עותק נסתר אחד', JSON.stringify(afterOld));

    // 4 · «בקשות» ← ⋯ ← «מחק לגמרי» (פריט נפרד בתפריט) על הדוח החדש
    await page.goto(env.officeUrl(id, 'journey'), { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await menuOf().waitFor({ timeout: 40000 }); await menuOf().click();
    await page.locator('.rl-more-menu:not([hidden]) [data-remove-action="tax_work_purge"]').click();
    await dlg.locator('[data-rw-confirm]').waitFor({ timeout: 15000 });
    await dlg.locator('[data-rw-confirm]').click();
    await dlg.waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
    const after = (await env.sql(`select
      (select count(*)::int from public.onboarding_steps where client_id = '${id}' and step_type in ('annual_return','info_collection') and payload->>'taxYear' = '2025') steps,
      (select count(*)::int from public.tax_info_asks where client_id = '${id}') asks,
      (select count(*)::int from public.tax_work_trash where client_id = '${id}') trash`))[0];
    ok(after.steps === 0 && after.asks === 0 && after.trash === 2, '⋯ ← «מחק לגמרי»: גם הדוח החדש נמחק, בלי זכר', JSON.stringify(after));
    await page.locator('.rl-name', { hasText: 'דוח שנתי 2025' }).first().waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
    ok(!(await page.locator('.rl-name', { hasText: 'דוח שנתי 2025' }).count()), 'השורה ירדה מ«בקשות»');
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
