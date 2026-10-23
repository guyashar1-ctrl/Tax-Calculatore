#!/usr/bin/env node
/**
 * annual-r2.mjs — שאלון הדוח השנתי, סבב 2 (21.10.2026; docs/proposals/2026-10-21-annual-questionnaire-fixes.html), בדפדפן מול staging.
 *
 *   זוג נשוי: לדוד תואר ראשון 2022 בכרטיס, לרחל שחרור 2023; בלי מעסיק בכרטיס; חשבון בנק בכרטיס.
 *   «זה עדיין נכון?» (חסר ⇒ «חסר כאן» בלי הודעה למטה; «נכון» מקפל; ילדים «השתנה» ⇒ «נולד ילד» בתוך השורה)
 *   → «מאיפה נכנס לך כסף ב-2025?» (שם, «?», «הכנסה אחרת» ⇐ «משהו אחר» — בלי טקסט חופשי) → ההמשך → «מה יכול להוריד לך מס?»
 *   → המסכים של רחל (ריק ⇒ «לא היה כלום — הבא») → «לימודים וצבא» אחד לשניהם (התמחות · חודש שחרור) → «שליחה למשרד»
 *   → המסמכים לפי אדם: 106, אישור זכאות, אישור התמחות, תעודת שחרור, ספח — ו«ביטוח לאומי — אנחנו מוציאים».
 *   בשרת: עובדות לכל אדם, «משהו אחר» כעובדה (income.unlisted) ⇒ «לברר עם דוד» אצל המשרד, המסמכים נפתחו מ-onValue / onChanged (271).
 *   סבב 2.1 (22.10): בדף — הבקשה פעם אחת (בלי כרטיס «הדבר הבא» נפרד), «רק מה שהשתנה» (287); «איפה רחל עבדה ב-2025?».
 *
 *   STAGING_ENV_DIR=<תיקייה עם .env.staging ו-.env.local> node scripts/e2e/annual-r2.mjs --base=http://localhost:5371 [--widths=1280,390,360] [--shots=<dir>]
 *
 * ‼ כל פנייה לייצור נחסמת ומכשילה. בסוף — ניקוי וסריקת שאריות. בלי מיילים.
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
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });

async function runWidth(width) {
  console.log(`\n▶ סבב 2 — ${width}px`);
  const env = await prepare();
  const blocked = [], consoleErrors = [];
  const id = env.clientId;
  const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}-${width}.png`), fullPage: false }).catch(() => {}); };
  try {
    await env.sql(`update public.clients set employers = '[]'::jsonb, properties = '[]'::jsonb, investment_accounts = '[]'::jsonb, gender = 'male', marriage_year = 2023,
      children = '[{"id":"k1","firstName":"נוי","birthYear":2019}]'::jsonb, city = 'חיפה', address = 'הרצל 12',
      has_academic_degree = true, academic_degree_year = 2022, academic_degree_type = 'bachelor',
      spouse = '{"firstName":"רחל","completedIdf":true,"idfReleaseYear":2023}'::jsonb,
      bank_accounts = '[{"id":"b1","bankName":"לאומי","bankCode":"10","branchNumber":"800","accountNumber":"4821","isPrimary":true}]'::jsonb
      where id = '${id}'`);
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

    // 1 · המשרד: «בקשה חדשה» ← «תיק המס» ← דוח שנתי
    await page.goto(env.officeUrl(id, 'journey'), { waitUntil: 'domcontentloaded' });
    const addBtn = page.getByRole('button', { name: /＋ בקשה חדשה/ }).first();
    await addBtn.waitFor({ timeout: 40000 }); await addBtn.click();
    await page.locator('[data-tax-file-toggle]').waitFor({ timeout: 15000 });
    await page.locator('[data-tax-file-toggle]').click();
    await page.locator('[data-annual-one-click]').click();
    await page.locator('[data-annual-summary]').first().waitFor({ timeout: 40000 });
    const asks0 = await env.sql(`select item_key, subject_role from public.tax_info_asks where client_id = '${id}' and state = 'published'`);
    const grids = asks0.filter(a => a.item_key === 'annual.whatHappened' || a.item_key === 'annual.lessTax').map(a => `${a.item_key}@${a.subject_role}`).sort();
    ok(grids.join(',') === 'annual.lessTax@client,annual.lessTax@spouse,annual.whatHappened@client,annual.whatHappened@spouse', 'מסכי ריבועים לכל אדם (כסף · מס)', grids.join(','));
    ok(asks0.filter(a => a.item_key === 'household.studies').map(a => a.subject_role).sort().join(',') === 'client,spouse', '«לימודים וצבא» מהתיק — לשניהם');
    ok(!asks0.some(a => ['household.degree', 'household.release', 'household.familyChange'].includes(a.item_key)), 'בלי שורת תואר/שחרור ובלי ריבוע «שינוי במשפחה»');

    // 2 · הלקוח
    const pp = await ctx.newPage(); onErr(pp, 'portal');
    await pp.goto(env.portalUrl(), { waitUntil: 'domcontentloaded' });
    await pp.waitForFunction(() => document.body.innerText.includes('הדוח השנתי 2025'), null, { timeout: 30000 });
    const page0 = await text(pp.locator('.pp-card'));
    ok(page0.split('הדוח השנתי 2025').length - 1 === 1 && !/הדבר הבא/.test(page0) && !(await pp.locator('[data-testid="portal-next"]').count()), 'בדף: הבקשה פעם אחת, בלי כרטיס נפרד', page0.slice(0, 400));
    ok(/רק מה שהשתנה · אפשר לעצור ולהמשיך/.test(page0), 'בדף: «רק מה שהשתנה» (287), לא «N שאלות»', page0.slice(0, 400));
    await shot(pp, 'portal');
    const card = pp.locator('.pp-item', { has: pp.getByText('הדוח השנתי 2025', { exact: true }) }).first();
    await card.getByRole('button', { name: /^(להשלמת המידע|להעלאת המסמכים)$/ }).click();
    const flow = pp.locator('.ty-flow');
    await flow.waitFor({ timeout: 15000 });
    const scr = async () => (await flow.getAttribute('data-screen')) ?? '';
    const q = async () => (await text(flow.locator('.ty-q').first())).trim();
    const navBtn = () => flow.locator('.ty-nav .btn-primary');
    const next = async () => { const t = await q(); const s = await scr(); const pr = await flow.getAttribute('data-person'); await navBtn().click(); await pp.waitForFunction(([t0, s0, p0]) => { const f = document.querySelector('.ty-flow'); return (f?.querySelector('.ty-q')?.textContent ?? '') !== t0 || f?.getAttribute('data-screen') !== s0 || f?.getAttribute('data-person') !== p0 || !!f?.querySelector('.is-bad'); }, [t, s, pr], { timeout: 10000 }).catch(() => {}); await pp.waitForTimeout(200); };

    // «זה עדיין נכון?»
    ok(await scr() === 'confirmAll' && (await q()) === 'זה עדיין נכון?', 'מסך ראשון: «זה עדיין נכון?»', `${await scr()} · ${await q()}`);
    const rows0 = await text(flow.locator('.ty-krows'));
    ok(/חשבון להחזר מס/.test(rows0) && /4821/.test(rows0), 'חשבון להחזר מהתיק — שורה ממולאת', rows0.slice(0, 400));
    ok(/כתובת/.test(rows0) && /חיפה/.test(rows0), 'כתובת — שורה', rows0.slice(0, 300));
    ok(!/לימודים/.test(rows0), 'לימודים — לא כאן (מסך משלו בסוף)', rows0.slice(0, 300));
    await navBtn().click(); await pp.waitForTimeout(500);
    ok(await flow.locator('.ty-krow-card.is-bad').count() > 0 && /חסר כאן/.test(await text(flow)) && !(await flow.locator('.ty-err').count()), '«הבא» כשחסר ⇒ «חסר כאן» על השורה, בלי הודעה למטה');
    await shot(pp, 'known-missing');
    const rowCard = (k) => flow.locator(`[data-confirm="${k}"]`);
    for (const k of ['household.maritalAtYearEnd', 'household.address', 'filing.refundAccount']) {
      if (await rowCard(k).count()) await rowCard(k).locator('.ty-seg button', { hasText: 'נכון' }).click();
    }
    ok(await flow.locator('.ty-krow.is-done').count() >= 3, '«נכון» מקפל את השורה ל-✓', String(await flow.locator('.ty-krow.is-done').count()));
    // ילדים: «השתנה» ⇒ «נולד ילד» בתוך השורה ⇒ שורה חדשה ברשימה
    await rowCard('household.children').locator('.ty-seg button', { hasText: 'השתנה' }).click();
    await rowCard('household.children').locator('.ty-chip', { hasText: 'נולד ילד' }).click();
    ok(!(await rowCard('household.children').locator('.rec-field').count()), '«נולד ילד» — רק שם ותאריך, לא כל רשימת הילדים');
    await rowCard('household.children').locator('.ty-kid input').first().fill('תום');
    await rowCard('household.children').locator('.ty-kid input[type="date"]').fill('2025-05-01');
    for (const k of await flow.locator('[data-confirm]').evaluateAll(els => els.filter(e => e.querySelector('.ty-seg') && !e.querySelector('[aria-pressed="true"]')).map(e => e.getAttribute('data-confirm')))) {
      await rowCard(k).locator('.ty-seg button', { hasText: 'נכון' }).click();
    }
    await shot(pp, 'known');
    await next();

    // 290 · בן/בת הזוג בלי מין/תאריך לידה בכרטיס ⇒ שאלה אחת מוקדמת (בלי זה הזיכויים שלה לא מחושבים)
    ok((await q()).includes('רחל') && await flow.locator('.rec-seg-btn', { hasText: 'אישה' }).count() > 0, 'פרטי בן/בת הזוג — אישה או גבר, תאריך לידה (290)', await q());
    await flow.locator('.rec-seg-btn', { hasText: 'אישה' }).first().click();
    await flow.locator('input[type="date"]').first().fill('1988-04-12');
    await shot(pp, 'spouse-basics');
    await next();

    // המסכים של דוד
    ok(await scr() === 'grid' && (await flow.getAttribute('data-person')) === 'client', 'המסך הבא: הריבועים של דוד', await scr());
    ok((await q()) === 'מאיפה נכנס לך כסף ב-2025?', 'הכותרת אומרת «כסף»', await q());
    ok(/דוד/.test(await text(flow.locator('.ty-person'))), 'שם האדם מעל הכותרת');
    ok(!(await flow.locator('[data-tile="household.familyChange"]').count()), 'אין ריבוע «שינוי במשפחה»');
    ok((await flow.locator('[data-tile="capital.newAccount"]').count()) === 1 && (await flow.locator('[data-tile="savings.withdrawal"]').count()) === 1, 'יש «חיסכון או מניות בבנק» ו«משיכה מקופה»');
    ok(/לא היה כלום/.test(await text(navBtn())), 'בלי סימון — הכפתור אומר «לא היה כלום — הבא»', await text(navBtn()));
    await flow.locator('[data-tile="pension.received"]').locator('xpath=..').locator('.ty-tile2-q').click();
    ok(/סכום חד-פעמי/.test(await text(flow.locator('.ty-tile2-help'))), '«?» פותח שורת הסבר', await text(flow.locator('.ty-tile2-help')));
    for (const k of ['salary.worked', 'niBenefits.received']) await flow.locator(`[data-tile="${k}"]`).click();
    ok((await text(navBtn())).trim() === 'הבא', 'אחרי סימון — «הבא»');
    ok(!(await flow.locator('.ty-other-link, .ty-other, textarea').count()), 'בלי טקסט חופשי במסך הריבועים');
    await flow.locator('[data-tile="income.other"]').click();
    await shot(pp, 'grid-client');
    await next();

    const seen = [];
    const walkTo = async (until) => {
      for (let s = 0; s < 25 && !(await until()); s++) {
        const t = await q(); seen.push(`${await scr()}:${t}`);
        if (await flow.locator('select').count() && await flow.locator('input[type="text"], input:not([type])').count()) {
          await flow.locator('input').first().fill('המדינה');
          await flow.locator('select').first().selectOption('03');
          await next(); continue;
        }
        if (await flow.locator('.ty-tile[data-tile]').count()) {
          const t0 = flow.locator('.ty-tile[data-tile="niBenefits.kindReserve"], .ty-tile[data-tile="income.unlisted"]');
          if (await t0.count()) await t0.click(); else await flow.locator('.ty-tile[data-tile="none"]').click();
          await next(); continue;
        }
        if (await flow.locator('input[type="number"]').count()) { await flow.locator('input[type="number"]').first().fill('500'); await next(); continue; }
        if (await flow.locator('.ty-choice', { hasText: /^לא$/ }).count()) { await flow.locator('.ty-choice', { hasText: /^לא$/ }).first().click(); await next(); continue; }
        const first = flow.locator('.ty-choice').first();
        if (await first.count()) { await first.click(); await next(); continue; }
        await next();
      }
    };
    await walkTo(async () => (await scr()) === 'grid');
    ok((await q()) === 'מה יכול להוריד לך מס?' && (await flow.getAttribute('data-person')) === 'client', '«מה יכול להוריד לך מס?» — של דוד', await q());
    ok(!(await flow.locator('[data-tile="household.creditChanges"]').count()), 'לדוד יש תואר בתיק — בלי ריבוע «סיום לימודים» כפול');
    await flow.locator('[data-tile="donations.given"]').click();
    await shot(pp, 'grid-client-less');
    await next();

    // המסכים של רחל
    await walkTo(async () => (await scr()) === 'grid' && (await flow.getAttribute('data-person')) === 'spouse');
    ok((await q()) === 'מאיפה נכנס לרחל כסף ב-2025?', 'המסך של רחל — בשמה', await q());
    await flow.locator('[data-tile="salary.worked"]').click();
    await shot(pp, 'grid-spouse');
    await next();
    await walkTo(async () => (await scr()) === 'grid' && /להוריד/.test(await q()));
    ok((await q()) === 'מה יכול להוריד לרחל מס?', '«מה יכול להוריד לרחל מס?»', await q());
    ok(/לא היה כלום/.test(await text(navBtn())), 'ריק ⇒ «לא היה כלום — הבא»');
    await next();
    ok(seen.some(t => t.endsWith(':מה הייתה ההכנסה?')), '«הכנסה אחרת» ⇒ «מה הייתה ההכנסה?» (בחירה)', seen.join(' | '));
    ok(seen.some(t => t.endsWith(':איפה רחל עבדה ב-2025?')), 'מקום עבודה: «איפה רחל עבדה ב-2025?»', seen.join(' | '));

    // «לימודים וצבא» — מסך אחד לשניהם, ממולא מהתיק
    await walkTo(async () => /לימודים וצבא/.test(await q()));
    ok(/לימודים וצבא/.test(await q()) && (await flow.locator('.ty-group-card').count()) === 2, '«לימודים וצבא» — מסך אחד, כרטיס לכל אחד', `${await q()} · ${await flow.locator('.ty-group-card').count()}`);
    ok(/מהתיק/.test(await text(flow.locator('.ty-group-card').nth(0))), 'מה שבתיק מסומן «מהתיק»');
    ok(/שליחה למשרד/.test(await text(navBtn())), 'המסך האחרון — «שליחה למשרד»', await text(navBtn()));
    const c0 = flow.locator('.ty-group-card').nth(0), c1 = flow.locator('.ty-group-card').nth(1);
    ok(/ואז התמחות/.test(await text(c0)), 'לתואר 2022 — «ואז התמחות?»', (await text(c0)).slice(0, 200));
    await c0.locator('.rec-seg-btn', { hasText: /^כן$/ }).click();
    await c0.locator('select').nth(1).selectOption('2023');
    await c0.locator('select').nth(2).selectOption('2024');
    await navBtn().click(); await pp.waitForTimeout(600);
    ok(await flow.locator('.ty-group-card.is-bad').count() === 1 || await c1.locator('.has-err').count() > 0, 'חסר חודש השחרור ⇒ מסומן, לא נשלח');
    ok(!(await flow.locator('[data-annual-docs]').count()), 'לא נשלח כשחסר');
    await c1.locator('select').first().selectOption('08');
    await shot(pp, 'studies');
    await navBtn().click();
    await pp.locator('.ty-flow[data-annual-docs]').waitFor({ timeout: 60000 }).catch(async (e) => { console.log('    [debug] ' + (await text(flow)).replace(/\s+/g, ' ').slice(0, 1200)); await shot(pp, 'send-stuck'); throw e; });
    await pp.waitForTimeout(800);
    const docs = await text(flow);
    ok(/קיבלנו\. עכשיו המסמכים/.test(docs), '«קיבלנו. עכשיו המסמכים»', docs.slice(0, 200));
    ok(/\d+ מתוך \d+/.test(docs), 'מונה מסמכים', docs.slice(0, 300));
    ok(await flow.locator('.ty-docs-person .ty-person').count() >= 2, 'המסמכים לפי אדם');
    for (const [re, m] of [[/אישור זכאות לתואר/, 'אישור זכאות לתואר (דוד)'], [/אישור סיום ההתמחות/, 'אישור התמחות'], [/תעודת השחרור/, 'תעודת שחרור (רחל)'], [/ספח/, 'ספח עם הילד החדש'], [/טופס 106/, 'טופס 106']])
      ok(re.test(docs), `מסמך: ${m}`, docs.slice(0, 500));
    ok(/ביטוח לאומי — אנחנו מוציאים/.test(await text(flow.locator('[data-ours]'))), '«ביטוח לאומי — אנחנו מוציאים.»');
    await shot(pp, 'docs');

    // 3 · בשרת
    const facts = await env.sql(`select item_key, subject_role, answer, value from public.tax_year_facts where client_id = '${id}' and source = 'portal'`);
    ok(facts.some(f => f.item_key === 'salary.worked' && f.subject_role === 'client' && f.answer === 'value') && facts.some(f => f.item_key === 'salary.worked' && f.subject_role === 'spouse' && f.answer === 'value'), 'משכורת — עובדה לכל אדם');
    ok(facts.some(f => f.item_key === 'donations.given' && f.subject_role === 'client' && f.answer === 'value') && facts.some(f => f.item_key === 'donations.given' && f.subject_role === 'spouse' && f.answer === 'no'), 'תרומות — של דוד בלבד');
    const st = facts.filter(f => f.item_key === 'household.studies');
    ok(st.some(f => f.subject_role === 'client' && JSON.stringify(f.value).includes('"intern":"yes"') && JSON.stringify(f.value).includes('2024')), 'לימודים של דוד — עם ההתמחות', JSON.stringify(st).slice(0, 300));
    ok(st.some(f => f.subject_role === 'spouse' && JSON.stringify(f.value).includes('"month":"08"')), 'שחרור של רחל — עם החודש', JSON.stringify(st).slice(0, 300));
    ok(facts.some(f => f.item_key === 'income.unlisted' && f.subject_role === 'client' && f.answer === 'value'), '«משהו אחר» — עובדה לדוד (לא טקסט)', JSON.stringify(facts.filter(f => f.item_key.startsWith('income.'))));
    const note = await env.sql(`select count(*)::int n from public.tax_info_asks where client_id = '${id}' and office_note is not null`);
    ok(note[0].n === 0, 'אין הערות בטקסט חופשי', JSON.stringify(note));
    const opened = await env.sql(`select item_key, subject_role from public.tax_info_asks where client_id = '${id}' and item_key in ('household.childChange','household.newChildDocs','household.internshipDocs','household.releaseDocs','household.degreeDocs')`);
    ok(['household.childChange', 'household.newChildDocs', 'household.internshipDocs', 'household.releaseDocs', 'household.degreeDocs'].every(k => opened.some(a => a.item_key === k)), 'השרת פתח את ההמשך (onChanged / onValue)', JSON.stringify(opened));
    const pub = await env.sql(`select item_key from public.tax_info_asks where client_id = '${id}' and state = 'published' and prompt->'input'->>'kind' <> 'file'`);
    ok(pub.length === 0, 'אחרי השליחה — אין שאלה פתוחה (רק מסמכים)', JSON.stringify(pub));

    // 4 · המשרד: הפירוט עם שמות
    const [stp] = await env.sql(`select id from public.onboarding_steps where client_id = '${id}' and step_type = 'annual_return'`);
    await page.goto(env.officeUrl(id, `journey/${stp.id}`), { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-annual-summary]').first().waitFor({ timeout: 40000 });
    await page.waitForTimeout(1500);
    const sum = await text(page.locator('[data-annual-summary]'));
    ok(/מה עליך לעשות/.test(sum), 'אצלך: «מה עליך לעשות»', sum.slice(0, 200));
    ok(/לברר עם דוד: הכנסה אחרת/.test(sum) && (await page.locator('[data-as-unlisted="client"]').count()) === 1, 'אצלך: «לברר עם דוד: הכנסה אחרת»', sum.slice(0, 600));
    ok(!(await page.locator('[data-annual-more]').count()), 'סבב אחד: אחרי השליחה אין «עוד שאלות» לפרסם', await text(page.locator('[data-annual-more]')));
    if (await page.locator('[data-annual-answers] > button').count()) {
      await page.locator('[data-annual-answers] > button').click();
      const det = await text(page.locator('[data-annual-answers]'));
      ok(/משכורת \(דוד\)/.test(det) && /משכורת \(רחל\)/.test(det), '«פירוט»: כל ריבוע עם שם האדם', det.slice(0, 400));
    }
    await shot(page, 'office');
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
