#!/usr/bin/env node
/**
 * annual-v2.mjs — שאלון הדוח השנתי מחדש (20.10.2026; docs/proposals/2026-10-20-annual-questionnaire-v2.html), בדפדפן מול staging.
 *
 *   זוג נשוי בלי מעסיק בכרטיס → «＋ בקשה חדשה» ← «תיק המס» ← «פתח» → הלקוח בדף:
 *   «מה כבר ידוע לנו» → ריבועים עם ציור ודוגמה (משכורת, ביטוח לאומי, תרומות) → מקום עבודה («עדיין שם», חודשים בשנה בלבד)
 *   → «מה שולם מביטוח לאומי?» לשניהם במסך אחד (בלי «דמי לידה?» לבד) → שום דבר לא נשלח באמצע; «הקודם» חוזר לריבועים ואפשר לשנות
 *   → «רגע לפני ששולחים» → «שליחה למשרד» → המסמכים בסוף: «טופס 106 מהמדינה», בלי אישור ב״ל, ו«אנחנו מוציאים…».
 *   המשרד: «מה עליך לעשות» עם אישור ביטוח לאומי.
 *
 *   STAGING_ENV_DIR=<תיקייה עם .env.staging ו-.env.local> node scripts/e2e/annual-v2.mjs --base=http://localhost:5361 [--widths=1280,390] [--shots=<dir>]
 *
 * ‼ כל פנייה לייצור נחסמת ומכשילה. בסוף — ניקוי וסריקת שאריות. בלי מיילים.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { prepare } from './staging-session.mjs';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d);
const BASE = arg('base', 'http://localhost:5361'); void BASE;
const WIDTHS = arg('widths', '1280,390').split(',').map(Number);
const SHOTS = arg('shots', '');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const { chromium } = createRequire(process.env.PW_CORE ?? 'C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json')('playwright-core');
const PROD = 'uoweoqtuiettozagwgdw', STAGING = 'evdfxjqrkgugssfrdoxd';

let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(info).slice(0, 400)}` : ''}`); };
const text = async (loc) => ((await loc.count().catch(() => 0)) ? loc.first().innerText({ timeout: 5000 }).catch(() => '') : '');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });

async function runWidth(width) {
  console.log(`\n▶ שאלון מחדש — ${width}px`);
  const env = await prepare();
  const blocked = [], consoleErrors = [];
  const id = env.clientId;
  const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}-${width}.png`) }).catch(() => {}); };
  try {
    await env.sql(`update public.clients set employers = '[]'::jsonb, properties = '[]'::jsonb, investment_accounts = '[]'::jsonb, gender = 'male', marriage_year = 2023,
      children = '[{"firstName":"נוי","birthYear":2019}]'::jsonb where id = '${id}'`);
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

    // 1 · המשרד: «בקשה חדשה» — שורה אחת «תיק המס», דוח שנתי מסומן מראש
    await page.goto(env.officeUrl(id, 'journey'), { waitUntil: 'domcontentloaded' });
    const addBtn = page.getByRole('button', { name: /＋ בקשה חדשה/ }).first();
    await addBtn.waitFor({ timeout: 40000 }); await addBtn.click();
    await page.locator('[data-tax-file-toggle]').waitFor({ timeout: 15000 });
    ok(!(await page.getByText(/^דוח שנתי 2025$/).count()) || (await page.locator('[data-tax-file-toggle]').count()) === 1, '«בקשה חדשה»: שורה אחת «תיק המס»');
    await shot(page, 'new-request');
    await page.locator('[data-tax-file-toggle]').click();
    await page.locator('[data-annual-one-click]').click();
    await page.locator('[data-annual-summary]').first().waitFor({ timeout: 40000 });
    const asks0 = await env.sql(`select item_key, prompt from public.tax_info_asks where client_id = '${id}' and state = 'published'`);
    ok(asks0.length > 0, `השאלון יצא (${asks0.length} שאלות)`);
    // ‼ 21.10.2026 · כרטיס הבקשה (docs/proposals/2026-10-21-office-request-and-tax-file.html) — «הלקוח ממלא»
    await page.locator('[data-as-filling]').first().waitFor({ timeout: 20000 }).catch(() => {});
    const fillTxt = await text(page.locator('[data-annual-summary]'));
    ok(await page.locator('[data-as-filling]').count() === 1 && !(await page.locator('[data-as-todo]').count()), 'הלקוח ממלא: שורה שקטה אחת, בלי «מה עליך לעשות»', fillTxt.slice(0, 300));
    ok(/נשמר כטיוטה עד/.test(fillTxt), '«השאלון אצל … · נשמר כטיוטה עד …»', fillTxt.slice(0, 200));
    ok(!(await page.locator('[data-request-steps]').count()), 'בשורת הדוח השנתי — בלי כרטיסי «תשובות הלקוח» / «הדוח»');
    ok(!(await page.locator('[data-ty-preview]').count()) && !/נפתחה/.test(fillTxt), 'בלי «מה … רואה» ובלי «דוח לשנת … · נפתחה …»');
    const pageHead = await text(page.locator('[data-testid="rl-page"] .rl-page-head'));
    ok(!(await page.locator('[data-testid="rl-page"] [data-testid="rl-copy-link"]').isVisible()), '«הדף של …»: צפייה / כמו הלקוח / קישור — ב-⋯', pageHead);
    ok(!/מאז השליחה האחרונה|רואים את המייל/.test(await text(page.locator('[data-testid="rl-page"]'))), '«הדף של …»: בלי המשפט «בקשה חדשה מאז…» — מילת מצב', await text(page.locator('[data-testid="rl-page"]')));
    await shot(page, 'office-filling');

    // 2 · הלקוח
    const pp = await ctx.newPage(); onErr(pp, 'portal');
    await pp.goto(env.portalUrl(), { waitUntil: 'domcontentloaded' });
    await pp.waitForFunction(() => document.body.innerText.includes('הדוח השנתי 2025'), null, { timeout: 30000 });
    const card = pp.locator('.pp-item', { has: pp.getByText('הדוח השנתי 2025', { exact: true }) }).first();
    await card.getByRole('button', { name: /^(להשלמת המידע|להעלאת המסמכים)$/ }).click();
    const flow = pp.locator('.ty-flow');
    await flow.waitFor({ timeout: 15000 });
    const scr = async () => (await flow.getAttribute('data-screen')) ?? '';
    const q = async () => (await text(flow.locator('.ty-q').first())).trim();
    const next = async () => { const t = await q(); const s = await scr(); await flow.getByRole('button', { name: /^(הבא|נכון, אפשר להתחיל|כן, הכול נכון|הבא — לתקן מה שהשתנה)$/ }).first().click(); await pp.waitForFunction(([t0, s0]) => { const f = document.querySelector('.ty-flow'); return (f?.querySelector('.ty-q')?.textContent ?? '') !== t0 || f?.getAttribute('data-screen') !== s0 || !!f?.querySelector('.ty-err'); }, [t, s], { timeout: 10000 }).catch(() => {}); await pp.waitForTimeout(150); };

    ok(['known', 'confirmAll'].includes(await scr()), 'מסך ראשון: «מה כבר ידוע לנו»', await scr());
    const known = await text(flow);
    ok(/מ-2023/.test(known) && /5 דקות/.test(known), 'הנישואין מ-2023 מוצגים כידועים — לא נשאלים', known.slice(0, 300));
    ok(!/\/(ה|ת|אה)(?![א-ת])/.test(known), 'בלי לוכסנים במסך הראשון', known.slice(0, 300));
    await shot(pp, 'known');
    await next();
    ok(await scr() === 'multi', 'הריבועים', await scr());
    ok((await flow.locator('.ty-tile-ic').count()) >= 5, 'לכל ריבוע ציור');
    ok(/אבטלה, מילואים, דמי לידה, נכות/.test(await text(flow.locator('[data-tile="niBenefits.received"]'))), 'דוגמה גלויה מתחת ל«תשלום מביטוח לאומי»');
    ok(/שינוי במשפחה ב-2025/.test(await text(flow.locator('[data-tile="household.familyChange"]'))), '«שינוי במשפחה ב-2025»');
    ok((await flow.locator('.ty-grid-h').count()) === 2, 'שתי קבוצות: כסף שנכנס · מה שיכול להקטין את המס');
    for (const k of ['salary.worked', 'niBenefits.received', 'donations.given']) await flow.locator(`[data-tile="${k}"]`).click();
    await shot(pp, 'tiles');
    await next();

    // שאלות ההמשך — עד «רגע לפני ששולחים»
    const seen = [];
    for (let s = 0; s < 30 && (await scr()) !== 'review'; s++) {
      const t = await q(); seen.push(`${await scr()}:${t}`);
      if (await scr() === 'group') {
        ok((await flow.locator('.ty-group-card').count()) === 2, '«מה שולם מביטוח לאומי?» — כרטיס לכל אחד במסך אחד');
        await flow.locator('.ty-group-card').nth(0).locator('[data-tile="niBenefits.kindReserve"]').click();
        await flow.locator('.ty-group-card').nth(1).locator('[data-tile="niBenefits.maternity"]').click();
        await shot(pp, 'ni');
        await next(); continue;
      }
      if (/להעביר החזר/.test(t)) {
        await flow.locator('button', { hasText: 'חשבון בחו״ל' }).first().click();
        await flow.getByLabel('מדינה').fill('ארה״ב'); await flow.getByLabel('שם הבנק').fill('Chase'); await flow.getByLabel('IBAN או מספר חשבון').fill('US00TEST');
        await flow.locator('[role=radiogroup], [role=group]', { hasText: 'על שם מי החשבון' }).locator('button').first().click();
        await next(); continue;
      }
      if (await flow.locator('select').count()) {
        // מקום עבודה: שם, «מתי התחיל» — חודש ב-2025 בלבד, «עד מתי» — «עדיין שם»
        const opts = await flow.locator('select').first().locator('option').allInnerTexts();
        ok(opts.every(o => !/2026/.test(o)) && opts.some(o => /לפני 2025/.test(o)), 'חודשים ב-2025 בלבד, ו«לפני 2025»', opts.join(','));
        const endOpts = await flow.locator('select').nth(1).locator('option').allInnerTexts();
        ok(endOpts[0] === 'עדיין שם', '«עד מתי» — «עדיין שם» כברירת מחדל', endOpts[0]);
        await flow.locator('input').first().fill('המדינה');
        await flow.locator('select').first().selectOption('03');
        await shot(pp, 'employer');
        await next(); continue;
      }
      if (await flow.locator('.ty-tile[data-tile="none"]').count()) { await flow.locator('.ty-tile[data-tile="none"]').click(); await next(); continue; }
      if (await flow.locator('.ty-choice', { hasText: /^לא$/ }).count()) { await flow.locator('.ty-choice', { hasText: /^לא$/ }).first().click(); await next(); continue; }
      const first = flow.locator('.ty-choice').first();
      if (await first.count()) { await first.click(); await next(); continue; }
      if (await flow.locator('textarea').count()) { await flow.locator('textarea').first().fill('בדיקה'); await next(); continue; }
      await next();
    }
    ok(!seen.some(x => /דמי לידה\?|האם מתוך זה/.test(x)), 'אין «דמי לידה?» כשאלה', seen.join(' | ').slice(0, 300));
    ok(!seen.some(x => /^file:/.test(x)), 'אין מסמך באמצע השאלות', seen.join(' | ').slice(0, 300));
    ok(!seen.some(x => /\/(ה|ת|אה)(?![א-ת])/.test(x)), 'בלי לוכסנים בשאלות', seen.join(' | ').slice(0, 300));
    const answeredMid = (await env.sql(`select count(*)::int n from public.tax_info_asks where client_id = '${id}' and state = 'answered'`))[0].n;
    ok(answeredMid === 0, 'עד «שליחה» — שום תשובה לא נשלחה', `answered=${answeredMid}`);
    ok(await scr() === 'review', '«רגע לפני ששולחים»', await scr());
    await shot(pp, 'review');

    // «שינוי» ליד הריבועים — חוזר, לא נעול; מבטלים «תרומות» וחוזרים
    await flow.locator('[data-review-row]', { hasText: 'מה היה לכם' }).getByRole('button', { name: 'שינוי' }).click();
    ok(await scr() === 'multi' && !(await flow.locator('.ty-done-mark').count()), '«שינוי» פותח את הריבועים לעריכה — בלי «נשלח»');
    await flow.locator('[data-tile="donations.given"]').click();
    ok((await flow.locator('[data-tile="donations.given"]').getAttribute('aria-pressed')) === 'false', 'ביטול סימון אחרי שעברנו הלאה');
    for (let s = 0; s < 30 && (await scr()) !== 'review'; s++) await next();
    const review = await text(flow.locator('.ty-review'));
    ok(!/תרומות/.test(review), 'אחרי הביטול — תרומות לא בסיכום', review.slice(0, 200));

    await flow.locator('[data-annual-send]').click();
    await pp.locator('.ty-flow[data-annual-docs]').waitFor({ timeout: 40000 }).catch(async (e) => { console.log('    [debug] ' + (await text(flow)).replace(/s+/g, ' ').slice(0, 1200)); await shot(pp, 'send-stuck'); throw e; });
    await pp.waitForTimeout(500);
    const docs = await text(flow);
    ok(/טופס 106 מהמדינה/.test(docs), 'המסמך בשם המעסיק: «טופס 106 מהמדינה»', docs.slice(0, 300));
    ok((docs.match(/טופס 106/g) ?? []).length === 1, 'טופס 106 אחד — לא כפול', docs.slice(0, 300));
    ok(!/ביטוח לאומי/.test(await text(flow.locator('.ty-owed-list'))), 'אישור ביטוח לאומי לא מתבקש מהלקוח');
    ok(/אנחנו מוציאים בעצמנו: .*ביטוח לאומי/.test(await text(flow.locator('[data-ours]'))), '«אנחנו מוציאים בעצמנו: האישור השנתי מביטוח לאומי»');
    await shot(pp, 'docs');

    // 3 · בשרת
    const facts = await env.sql(`select item_key, subject_role, answer from public.tax_year_facts where client_id = '${id}' and source = 'portal'`);
    ok(facts.some(f => f.item_key === 'niBenefits.maternity' && f.subject_role === 'spouse' && f.answer === 'value'), 'דמי לידה של בת הזוג — עובדה niBenefits.maternity');
    ok(facts.some(f => f.item_key === 'donations.given' && f.answer === 'no'), 'תרומות שבוטלו — «לא»');
    const cert = await env.sql(`select count(*)::int n from public.tax_info_asks where client_id = '${id}' and item_key = 'niBenefits.cert'`);
    ok(cert[0].n === 0, 'אין שאלה ללקוח על אישור ביטוח לאומי');
    const pub = await env.sql(`select count(*)::int n from public.tax_info_asks where client_id = '${id}' and state = 'published' and prompt->'input'->>'kind' <> 'file'`);
    ok(pub[0].n === 0, 'אחרי השליחה — אין שאלה פתוחה (רק מסמכים)', `open=${pub[0].n}`);

    // 4 · המשרד: «מה עליך לעשות»
    const [st] = await env.sql(`select id from public.onboarding_steps where client_id = '${id}' and step_type = 'annual_return'`);
    await page.goto(env.officeUrl(id, `journey/${st.id}`), { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' }); // ‼ שינוי hash בלבד אינו טעינה — בלי זה המסך מציג את מה שנטען לפני השליחה
    await page.locator('[data-annual-summary]').first().waitFor({ timeout: 40000 });
    await page.waitForTimeout(1500);
    const sum = await text(page.locator('[data-annual-summary]'));
    ok(/מה עליך לעשות/.test(sum), 'אצלך: «מה עליך לעשות»', sum.slice(0, 200));
    ok(/ביטוח לאומי/.test(sum), 'אצלך: להוציא אישור מביטוח לאומי', sum.slice(0, 300));
    ok(!(await page.locator('[data-annual-more]').count()), 'סבב אחד: אחרי השליחה אין «עוד שאלה» לפרסם', await text(page.locator('[data-annual-more]')));
    if (SHOTS) await page.locator('[data-annual-summary]').first().screenshot({ path: join(SHOTS, `office-summary-${width}.png`) }).catch(() => {});
    await shot(page, 'office');
    // ‼ 21.10.2026 · «נשלח · חסר מסמך»: עד 4 שורות, כפתור ראשי אחד, בלי «לעדכן בתיק» לפני «אישורך»
    const todoN = await page.locator('[data-as-todo] > li').count();
    ok(todoN > 0 && todoN <= 4, `«מה עליך לעשות» — עד 4 שורות (${todoN})`);
    ok(await page.locator('[data-as-todo] .btn-primary').count() === 1, 'כפתור ראשי אחד', await text(page.locator('[data-as-todo]')));
    ok(!(await page.locator('[data-as-card]').count()), '«לעדכן בתיק» — לא לפני «אישורך»');
    ok(!/השלמות במשרד/.test(sum), '«השלמות במשרד» — בתוך «להכין את הדוח»', sum.slice(0, 300));
    ok(/מסמכים/.test(await text(page.locator('.as-steps .is-now'))), 'פס השלבים: «מסמכים» — עכשיו', await text(page.locator('.as-steps')));
    await page.locator('[data-annual-answers] > button').click();
    const det = await text(page.locator('[data-annual-answers]'));
    if (SHOTS) await page.locator('[data-annual-summary]').first().screenshot({ path: join(SHOTS, 'office-summary-detail-' + width + '.png') }).catch(() => {});
    ok(/היה ב-2025/.test(det) && /לא היה ב-2025: \d+ נושאים|לא היה ב-2025\s+\d+ נושאים/.test(det.replace(/\n/g, ' ')), '«פירוט ▾»: היה · לא היה (שורה אחת)', det.slice(0, 300));
    await page.locator('[data-annual-full-open]').click();
    ok(await page.locator('[data-annual-full]').first().isVisible(), '«החישוב ואיך עושים ביד — פתח» פותח את הפירוט המלא');
    await page.locator('[data-annual-full-close]').first().click();
    ok(!(await page.locator('[data-annual-full]').first().isVisible()), '«סגירה» סוגר אותו');
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
