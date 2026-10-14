// QA ממשק 232 מול staging (שרת הפיתוח של העותק, --mode staging, פורט 5231): המשרד — סיכום, הורדה, פרסום,
// «שלח בקשות» (פתיחה בלבד, בלי שליחה); הלקוח — הדף האישי, צפייה בהערכה. מחשב וטלפון. לקוח בדיקה בלבד, ניקוי מלא.
// ‼ כל בקשה שאינה localhost או staging נחסמת ונכשלת. אין לחיצה על «שלח».
//   node ui-232-staging.mjs <stgroot> <shotsDir> <est.json>
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire('C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json');
const { chromium } = require('playwright-core');
const [root, shots, estPath] = process.argv.slice(2);
mkdirSync(shots, { recursive: true });
process.chdir(root);
const { writeStaging } = await import(pathToFileURL(join(root, 'scripts/staging-lib.mjs')).href);
const EST = JSON.parse(readFileSync(estPath, 'utf8'));
const BASE = 'http://localhost:5231';
const OFFICE = 'ca158d52-5ad7-47f5-b228-4b7703978b84';
const RUN = `QAUI${Date.now().toString(36).toUpperCase()}`;
const TOK = `tok${RUN.toLowerCase()}`;
let pass = 0, fail = 0;
const ok = (c, m, i = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && i ? ` — ${String(i).slice(0, 300)}` : ''}`); };
const lit = (v) => `$q$${typeof v === 'string' ? v : JSON.stringify(v)}$q$`;
const one = async (q) => ((await writeStaging(q)) ?? [])[0];
const asOffice = async (expr) => (await one(`begin; set local role authenticated; select set_config('request.jwt.claims', ${lit({ sub: OFFICE, role: 'authenticated' })}, true); select (${expr}) as r; commit;`))?.r;
const norm = (s) => s.replace(/\s+/g, ' ').trim();
let A;
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const blocked = [];
try {
  A = (await one(`insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type, portal_token)
    values (replace(gen_random_uuid()::text,'-',''), '${OFFICE}', 'דוד', '${RUN}', 'delivered@resend.dev', 'active', 'single', 'licensed', '${TOK}') returning id`)).id;
  const req = await asOffice(`public.ensure_tax_year_request('${A}', 'estimate', 2026, 9)`);
  const s1 = await asOffice(`public.save_tax_estimate('${req.stepId}', ${lit(EST.d1)}::jsonb, ${lit(EST.o1)}::jsonb, '[]'::jsonb, ${lit({ latestVersion: 0 })}::jsonb)`);
  const a1 = await asOffice(`public.approve_tax_estimate('${s1.id}', 1)`);
  ok(s1?.ok && a1?.ok, `לקוח בדיקה ${RUN}: גרסה 1 נשמרה ואושרה (חבות ${EST.o1.household.annualLiability})`);
  let fileV1 = '';
  for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    console.log(`== ${name}`);
    const ctx = await b.newContext({ viewport: vp, acceptDownloads: true, ...(name === 'phone' ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.startsWith(BASE) || u.includes('evdfxjqrkgugssfrdoxd.supabase.co') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
      if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
      blocked.push(u); return route.abort();
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push(m.text()); });
    // ── המשרד ──
    await page.goto(`${BASE}/#/client/${A}/taxfile`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
    const y26 = page.locator('.ty-year', { hasText: '2026' }).first();
    await y26.locator('button', { hasText: /^(התחל|פתח)$/ }).first().click(); await page.waitForTimeout(2500);
    const panel = page.locator('.te-panel');
    ok(await panel.count() === 1, 'המשרד: הערכת המס נפתחה מתיק המס');
    ok((await panel.locator('.te-result').innerText()).includes('גרסה 1 · מאושרת'), 'המשרד: גרסה 1 מאושרת');
    await page.evaluate(() => { const d = document.querySelector('#te-summary'); if (d) d.open = true; }); await page.waitForTimeout(600);
    const frameTxt = norm(await page.frameLocator('#te-summary iframe').locator('body').innerText());
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), panel.locator('#te-summary button', { hasText: 'הורד ללקוח' }).click()]);
    const file = dl ? readFileSync(await dl.path(), 'utf8') : '';
    if (name === 'desktop') fileV1 = file;
    ok(!!dl && /גרסה-1\.html$/.test(dl.suggestedFilename()) && file.includes('גרסה 1 ·'), 'הורדה: קובץ של גרסה 1', dl?.suggestedFilename());
    if (name === 'desktop') {
      await panel.locator('#te-summary button', { hasText: 'פרסם בדף האישי' }).click(); await page.waitForTimeout(1500);
      ok((await panel.locator('#te-summary').innerText()).includes('פורסם בדף האישי'), 'המשרד: «פרסם בדף האישי» — הצליח מול השרת');
    }
    ok((await panel.locator('#te-summary').innerText()).includes('בדף האישי מ-'), 'המשרד: מסומן «בדף האישי»');
    await page.locator('#te-summary').scrollIntoViewIfNeeded(); await page.screenshot({ path: join(shots, `${name}-1-office-summary.png`) });
    // «שלח בקשות» — פתיחה בלבד
    await page.locator('button', { hasText: /^סגירה$/ }).first().click().catch(() => {}); await page.waitForTimeout(800);
    await page.goto(`${BASE}/#/client/${A}`, { waitUntil: 'networkidle' }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(3000);
    const reqTab = page.locator('[role=tab], button', { hasText: /^בקשות/ }).first();
    if (await reqTab.count()) { await reqTab.click(); await page.waitForTimeout(1500); }
    const more = page.locator('button[aria-label="עוד פעולות"]').first();
    if (await more.count()) {
      await more.click(); await page.waitForTimeout(400);
      await page.locator('[role=menuitem]', { hasText: 'שליחת הקישור לדף במייל' }).click(); await page.waitForTimeout(3000);
      const dlg = await page.locator('[role=dialog]').last().innerText().catch(() => '');
      ok(/הערכת (ה)?מס/.test(dlg) && dlg.includes('2026'), '«שלח בקשות»: הפריט «הערכת מס 2026» במגש', dlg.slice(0, 300));
      await page.screenshot({ path: join(shots, `${name}-2-send-tray.png`) });
      await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    } else ok(false, '«שלח בקשות»: תפריט «עוד פעולות» לא נמצא בלשונית הבקשות');
    // ── הלקוח ──
    await page.goto(`${BASE}/?portal=${TOK}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
    const item = page.locator('.pp-item', { hasText: 'הערכת המס לשנת 2026' });
    ok(await item.count() === 1, 'הדף האישי: פריט «הערכת המס לשנת 2026»');
    await item.locator('button', { hasText: 'לצפייה בהערכה' }).click(); await page.waitForTimeout(2500);
    const portalTxt = norm(await item.frameLocator('iframe').locator('body').innerText());
    ok(portalTxt.length > 200 && portalTxt === frameTxt, 'הדף האישי מציג בדיוק את מה שבמסך המשרד ובקובץ (אותה גרסה)', `${portalTxt.slice(0, 120)} ‖ ${frameTxt.slice(0, 120)}`);
    ok(portalTxt.includes('גרסה 1') && !portalTxt.includes('הכרעה') && !portalTxt.includes('rulesetVersion'), 'הדף האישי: גרסה 1, בלי שדות פנימיים');
    await item.scrollIntoViewIfNeeded(); await page.screenshot({ path: join(shots, `${name}-3-portal.png`) });
    const over = await page.evaluate(() => { const vw = innerWidth; return [...document.querySelectorAll('body *')].filter(x => { const r = x.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1) && !x.closest('iframe, table, [style*="overflow"]'); }).length; });
    ok(over === 0, 'הדף האישי: בלי גלילה הצידה', over);
    ok(errs.length === 0, 'בלי שגיאות בדפדפן', errs.join(' | '));
    await ctx.close();
  }
  // ── גרסה חדשה לא משנה בשקט את מה שנמסר ──
  const s2 = await asOffice(`public.save_tax_estimate('${req.stepId}', ${lit(EST.d2)}::jsonb, ${lit(EST.o2)}::jsonb, '[]'::jsonb, ${lit({ latestVersion: 1 })}::jsonb)`);
  await asOffice(`public.approve_tax_estimate('${s2.id}', 1)`);
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route('**/*', (route) => { const u = route.request().url(); if (u.startsWith(BASE) || u.includes('evdfxjqrkgugssfrdoxd.supabase.co') || u.startsWith('data:')) return route.continue(); if (/fonts\./.test(u)) return route.fulfill({ status: 200, body: '' }); blocked.push(u); return route.abort(); });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?portal=${TOK}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  ok(await page.locator('.pp-item', { hasText: 'הערכת המס לשנת 2026' }).count() === 0, 'אחרי אישור גרסה 2 (בלי פרסום): הפריט יורד מהדף — לא מוצג מספר ישן ולא החדש');
  const v1 = await one(`select status, outputs->'household'->>'annualLiability' l from public.tax_estimates where id = '${s1.id}'`);
  ok(v1.status === 'superseded' && Number(v1.l) === EST.o1.household.annualLiability && fileV1.includes(EST.o1.household.annualLiability.toLocaleString('he-IL')), 'גרסה 1 נשמרת כפי שנמסרה; הקובץ שהורד לא השתנה');
  await asOffice(`public.publish_tax_estimate('${s2.id}', true)`);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  const it2 = page.locator('.pp-item', { hasText: 'הערכת המס לשנת 2026' });
  await it2.locator('button', { hasText: 'לצפייה בהערכה' }).click(); await page.waitForTimeout(2500);
  const t2 = await it2.frameLocator('iframe').locator('body').innerText();
  ok(t2.includes('גרסה 2') && t2.includes(EST.o2.household.annualLiability.toLocaleString('he-IL')), 'פרסום גרסה 2: הלקוח רואה 2');
  await page.screenshot({ path: join(shots, `phone-4-portal-v2.png`) });
  await ctx.close();
  ok(blocked.length === 0, 'אין פנייה לשום שרת מחוץ ל-staging/localhost', blocked.slice(0, 3).join(' '));
  const em = await one(`select count(*)::int n from public.email_messages e join public.clients c on c.user_id = e.user_id where c.id = '${A}' and e.created_at > now() - interval '15 minutes' and e.to_email = 'delivered@resend.dev'`);
  ok(em.n === 0, 'לא נשלח מייל (גם לא לכתובת הבדיקה)');
} catch (e) { fail++; console.error('✗ תקלה:', e.message); }
finally {
  await b.close();
  if (A) {
    await writeStaging(`delete from public.tax_estimates where client_id = '${A}'; delete from public.client_notices where client_id = '${A}';
      delete from public.onboarding_events where step_id in (select id from public.onboarding_steps where client_id = '${A}');
      delete from public.onboarding_steps where client_id = '${A}'; delete from public.clients where id = '${A}';`).catch(e => { fail++; console.error('✗ ניקוי:', e.message); });
    ok((await one(`select count(*)::int n from public.clients where last_name = '${RUN}'`)).n === 0, 'ניקוי: אין שאריות');
  }
  console.log(`\n${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
}
