#!/usr/bin/env node
/**
 * estimate-simple.mjs — הערכת מס פשוטה (30.10.2026), בדפדפן מול staging: המשרד ⇄ הדף האישי.
 *   הדמיה מאושרת: docs/proposals/2026-10-30-tax-estimate-simple.html — אנחנו · הלקוח · התוצאה.
 *
 *   א. עסק קיים: קליטת רו״ה ⇒ «פרסם בדף של דוד» (בלי מייל) ⇒ בדף: המשפחה · «מה מתאים לך» · הצפי · «הכנסה נוספת»
 *      (משכורת בערך) ⇒ המשרד: נקודות זיכוי מהשאלון, הצפי, המשכורת, ההמלצה «לפחות».
 *   ב. עסק חדש: יישור קו ⇒ «פרסם» ⇒ בדף: מתי מתחיל וכמה בחודש ⇒ המשרד: «המקדמות לפתיחת התיק» לשנה מלאה ⇒ פרסום.
 *
 *   STAGING_ENV_DIR=<…> node scripts/e2e/estimate-simple.mjs --base=http://localhost:<port> [--widths=1280,390] [--shots=<dir>] [--only=a|b]
 *
 * ‼ כל פנייה לייצור נחסמת ומכשילה. בסוף — ניקוי. בלי מיילים.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { prepare } from './staging-session.mjs';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d);
const WIDTHS = arg('widths', '1280,390').split(',').map(Number);
const ONLY = arg('only', '');
const SHOTS = arg('shots', '');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const { chromium } = createRequire(process.env.PW_CORE ?? 'C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json')('playwright-core');
const PROD = 'uoweoqtuiettozagwgdw', STAGING = 'evdfxjqrkgugssfrdoxd';

let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(info).slice(0, 400)}` : ''}`); };
const text = async (loc) => ((await loc.count().catch(() => 0)) ? loc.first().innerText({ timeout: 5000 }).catch(() => '') : '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });

const M = ['01/26', '02/26', '03/26', '04/26', '05/26', '06/26', '07/26', '08/26', '09/26', '10/26', '11/26', '12/26'];
const row = (label, v, last) => [label, ...M.map((_, i) => (i < 9 ? (typeof v === 'function' ? v(i) : v) : '')), last];
const PNL = [
  ['דוד בדיקה - עוסק מורשה'], ['דוח רווח והפסד לתקופה 01/26 - 12/26'], ['קוד מיון', ...M, 'סכום'], ['הכנסות'],
  row('הכנסות ממתן שירותים בארץ', '30000', '270000'), row('סך הכנסות', '30000', '270000'), ['הוצאות'],
  row('אחזקת רכב', '1500', '13500'), row('כיבוד', '300', '2700'), row('קנסות', i => (i === 8 ? '100' : '0'), '100'),
  row('סך הוצאות', i => String(1800 + (i === 8 ? 100 : 0)), '16300'), row('סך רווח והפסד', i => String(28200 - (i === 8 ? 100 : 0)), '253700'),
].map(r => r.join('\t')).join('\n');

/** הדף האישי: פותח את השאלון ועובר עליו. onForecast — מה עושים במסך הצפי; tiles — אילו ריבועים מסמנים. */
async function walkPortal(pp, { onForecast, tiles = [], shot }) {
  await pp.waitForFunction(() => /הערכת מס|מקדמות/.test(document.body.innerText), null, { timeout: 30000 });
  await pp.getByRole('button', { name: 'להשלמת המידע' }).first().click();
  const flow = pp.locator('.ty-flow');
  await flow.waitFor({ timeout: 15000 });
  const scr = async () => (await flow.getAttribute('data-screen')) ?? '';
  const q = async () => (await text(flow.locator('.ty-q').first())).trim();
  const navBtn = () => flow.locator('.ty-nav .btn-primary');
  const next = async () => {
    const t = await q(), s = await scr(), pr = await flow.getAttribute('data-person');
    await navBtn().click();
    await pp.waitForFunction(([t0, s0, p0]) => { const f = document.querySelector('.ty-flow'); return (f?.querySelector('.ty-q')?.textContent ?? '') !== t0 || f?.getAttribute('data-screen') !== s0 || f?.getAttribute('data-person') !== p0 || !!f?.querySelector('.ty-err'); }, [t, s, pr], { timeout: 12000 }).catch(() => {});
    await pp.waitForTimeout(250);
  };
  const seen = [];
  for (let k = 0; k < 30; k++) {
    if (await pp.locator('.ty-flow[data-annual-docs]').count()) { seen.push('done'); break; }
    const s = await scr(), t = await q();
    seen.push(`${s}:${t}`);
    if (s === 'review') { await shot?.('review'); await navBtn().click(); await pp.locator('.ty-flow[data-annual-docs]').waitFor({ timeout: 60000 }).catch(() => {}); continue; }
    if (await flow.locator('[data-record-forecast]').count()) { await onForecast(flow); await next(); continue; }
    if (await flow.locator('[data-tile]').count()) {
      await shot?.(`grid-${seen.length}`);
      const want = [];
      for (const key of tiles) if (await flow.locator(`[data-tile="${key}"]`).count()) want.push(key);
      if (want.length) for (const key of want) { await flow.locator(`[data-tile="${key}"]`).first().click(); await shot?.(`tile-${key}`); }
      else if (await flow.locator('[data-tile="none"]').count()) await flow.locator('[data-tile="none"]').click();
      await next(); continue;
    }
    if (await flow.locator('.rec-field input[type="number"], input[inputmode="numeric"]').count() && /משכורת/.test(t)) {
      const ins = flow.locator('.rec-field input');
      await ins.nth(0).fill('9000'); await ins.nth(1).fill('12');
      await next(); continue;
    }
    if (await flow.locator('[data-gate="no"]').count()) { await flow.locator('[data-gate="no"]').first().click(); await next(); continue; }
    if (await flow.locator('input[type="number"]').count()) { await flow.locator('input[type="number"]').first().fill('0'); await next(); continue; }
    if (await flow.locator('.rec-seg-btn', { hasText: 'אישה' }).count() && await flow.locator('input[type="date"]').count()) {
      await flow.locator('.rec-seg-btn', { hasText: 'אישה' }).first().click(); await flow.locator('input[type="date"]').first().fill('1990-01-01'); await next(); continue;
    }
    await next();
  }
  return { seen, err: await text(flow.locator('.ty-err')) };
}

async function scenario(width, kind) {
  console.log(`\n▶ הערכת מס פשוטה — ${kind === 'a' ? 'עסק קיים' : 'עסק חדש'} — ${width}px`);
  const env = await prepare();
  const blocked = [], consoleErrors = [];
  const id = env.clientId;
  const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, `${kind}-${name}-${width}.png`), fullPage: true }).catch(() => {}); };
  try {
    await env.sql(`update public.onboarding_steps set status='cancelled' where client_id = '${id}' and step_type in ('intake_questionnaire','annual_return','tax_file_intake','info_collection','wealth_declaration') and status <> 'cancelled'`);
    if (kind === 'a') {
      // עסק בכרטיס, רווק, מקדמות שנקראו משע״ם ומב״ל
      await env.sql(`update public.clients set businesses = '[{"id":"b1","name":"ייעוץ בדיקה","startDate":"2020-01-01"}]'::jsonb,
        employers = '[]'::jsonb, properties = '[]'::jsonb, family_status = 'single', spouse_first_name = null, business_transfer = true,
        pit_advance_percent = 5, pit_advance_frequency = 'monthly', ni_advance_monthly = 1450 where id = '${id}'`);
      await env.sql(`update public.clients set field_meta = coalesce(field_meta, '{}'::jsonb) || '{"pitAdvancePercent":{"source":"shaam","syncedAt":"2026-10-20T08:00:00Z"},"niAdvanceMonthly":{"source":"shaam","syncedAt":"2026-10-20T08:00:00Z"}}'::jsonb where id = '${id}'`)
        .catch(e => console.log('    (field_meta)', e.message.slice(0, 160)));
    } else {
      // עסק חדש: המשרד פותח את התיקים — אין עסק בכרטיס, אין מקדמות
      await env.sql(`update public.clients set businesses = '[]'::jsonb, employers = '[]'::jsonb, properties = '[]'::jsonb, family_status = 'single', spouse_first_name = null,
        business_transfer = false, has_previous_accountant = false, pit_advance_percent = null, pit_advance_frequency = null, ni_advance_monthly = null where id = '${id}'`);
    }
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
    const part = n => ew.locator(`[data-ew-part="${n}"]`);

    // 1 · «＋ בקשה חדשה» ← הערכת מס
    await page.goto(env.officeUrl(id, 'journey'), { waitUntil: 'domcontentloaded' });
    const addBtn = page.getByRole('button', { name: /＋ בקשה חדשה/ }).first();
    await addBtn.waitFor({ timeout: 40000 }); await addBtn.click();
    await page.locator('[data-tax-file-toggle]').click();
    await page.locator('#ar-taxfile-panel label', { hasText: 'הערכת מס' }).locator('input[type="radio"]').check();
    await page.locator('#ar-taxfile-panel').getByRole('button', { name: 'פתח' }).click();
    await ew.waitFor({ timeout: 40000 });
    ok(await waitStage('q') === 'q', 'שלב ראשון: «לא התחיל»', await stage());
    ok(await part('ours').count() === 1 && await part('client').count() === 1 && await part('result').count() === 1, 'שלושה חלקים: אנחנו · הלקוח · התוצאה');
    ok(await page.locator('[data-annual-advanced]').evaluate(e => e.hidden).catch(() => false), 'המסך הישן — מוסתר ב«כלים מתקדמים»');
    ok(/תופיע כש/.test(await text(part('result'))), 'התוצאה: «תופיע כשדוד יענה»');
    const pubQ = ew.locator('[data-ew-publish-q]');
    ok(/^פרסם בדף של /.test((await text(pubQ)).trim()), '«פרסם בדף של דוד» — לא «שלח שאלון»', await text(pubQ));
    ok(await ew.locator('[data-ew-publish-mail]').count() === 1, '«וגם שלח לו מייל» — בבחירה, ליד');
    const [st] = await env.sql(`select id from public.onboarding_steps where client_id = '${id}' and step_type = 'tax_estimate' and status <> 'cancelled' order by created_at desc limit 1`);

    if (kind === 'a') {
      const ours = await text(part('ours'));
      ok(/5% מהמחזור/.test(ours) && /1,450/.test(ours), 'מקדמות מהרשויות: 5% · 1,450 ₪', ours.replace(/\s+/g, ' ').slice(0, 300));
      ok(/⚡ שע״ם/.test(ours), 'מקור: «⚡ שע״ם» (ורוד)');
      await ew.locator('[data-ew-pull]').click();
      await ew.locator('textarea').first().fill(PNL);
      await ew.getByRole('button', { name: /^קלוט לשורה/ }).click();
      await page.waitForFunction(() => /270,000/.test(document.querySelector('[data-ew-part="ours"]')?.textContent ?? ''), null, { timeout: 40000 }).catch(() => {});
      ok(/270,000/.test(await text(part('ours'))), 'רו״ה מפייפרלס: 270,000 הכנסות עד ספטמבר', (await text(part('ours'))).replace(/\s+/g, ' ').slice(0, 300));
    } else {
      ok(await ew.getAttribute('data-ew-new') === '', 'עסק חדש מזוהה (מצב העסק בכרטיס)');
      const ours = await text(part('ours'));
      ok(/יישור קו/.test(ours) && /עוד לא נפתח/.test(ours) && /אין מקדמות/.test(ours) && /עוד לא רשום כעצמאי/.test(ours), 'יישור קו: תיק לא נפתח · אין מקדמות · לא רשום כעצמאי', ours.replace(/\s+/g, ' ').slice(0, 300));
      ok(await ew.locator('[data-ew-pull]').count() === 0, 'בלי «קלוט רו״ה» — אין עדיין הכנסות');
    }
    await shot(page, '1-start');

    // 2 · «פרסם בדף של דוד» — בלי מייל
    await pubQ.click();
    ok(await waitStage('waiting') === 'waiting', '«ממתין לדוד»', await stage() + ' ' + (await text(ew.locator('.ty-err'))));
    for (let k = 0; k < 20 && !(await env.sql(`select 1 from public.tax_info_asks where client_id='${id}' and item_key='business.forecastMonths' and state <> 'cancelled'`)).length; k++) await sleep(1000);
    const asks = await env.sql(`select item_key, subject_role, state from public.tax_info_asks where client_id='${id}' and state <> 'cancelled' order by created_at`);
    const keys = asks.map(a => a.item_key);
    ok(keys.includes('business.forecastMonths') && keys.includes('annual.lessTax'), 'בדף: «מה מתאים לך» והצפי', keys.join(','));
    ok(!keys.some(k => /^(donations|sales|foreign|savings|business\.active|business\.inPaperless)/.test(k)), 'בלי השאלות שיצאו (תרומות, מכירות, חו״ל, חיסכון, «הכול בפייפרלס?»)', keys.join(','));
    ok(asks.length <= 8, `שאלון קצר: ${asks.length} שאלות`, keys.join(','));
    ok(/בדף של/.test(await text(ew.locator('[data-ew-waiting]'))), '«בדף של דוד מ-… · עוד לא ענה/תה»');

    // 3 · הדף האישי
    const pp = await ctx.newPage(); onErr(pp, 'portal');
    await pp.goto(env.portalUrl(), { waitUntil: 'domcontentloaded' });
    const r = await walkPortal(pp, {
      tiles: ['salary.worked'], shot: n => shot(pp, n),
      onForecast: async flow => {
        if (kind === 'a') {
          ok(await flow.locator('[data-fm="inc"] .fm-chart > div').count() === 12, 'בדף: הצפי — עמודה לכל חודש');
          await flow.locator('[data-fm="inc"]').getByRole('button', { name: 'נכון' }).click();
          await flow.locator('[data-fm="exp"]').getByRole('button', { name: 'נכון' }).click();
        } else {
          ok(await flow.locator('[data-fm-new]').count() === 1, 'בדף: «מתי העסק מתחיל» + בחודש');
          await flow.locator('[data-fm-start]').selectOption({ index: 2 });
          const steppers = flow.locator('.fm-step-lg');
          for (let k = 0; k < 15; k++) await steppers.nth(0).getByRole('button', { name: 'יותר' }).click();
          for (let k = 0; k < 6; k++) await steppers.nth(1).getByRole('button', { name: 'יותר' }).click();
          ok(/180,000/.test(await text(flow)) && /36,000/.test(await text(flow)), 'בדף: «שנה מלאה» 180,000 הכנסות · 36,000 הוצאות', (await text(flow)).replace(/\s+/g, ' ').slice(0, 200));
          await shot(pp, 'forecast-new');
        }
        ok(await pp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'בדף — בלי גלילה לרוחב');
      },
    });
    console.log('    [מסכים] ' + r.seen.join(' → '));
    ok(r.seen.includes('done') && !r.err, `הלקוח שלח (${r.seen.length - 1} מסכים)`, JSON.stringify(r.seen) + ' ' + r.err);
    ok(r.seen.some(s => /grid:מה מתאים/.test(s)), 'מסך «מה מתאים לך?»', JSON.stringify(r.seen));
    ok(r.seen.some(s => /grid:יש לך השנה הכנסה נוספת/.test(s)), 'מסך «יש לך השנה הכנסה נוספת?»', JSON.stringify(r.seen));
    ok(r.seen.length - 1 <= 8, `שאלון קצר בדף: ${r.seen.length - 1} מסכים`, JSON.stringify(r.seen));
    await pp.close();

    // 4 · המשרד: התשובות ⇒ התוצאה
    await page.goto(env.officeUrl(id, `journey/${st.id}`), { waitUntil: 'domcontentloaded' }); await page.reload({ waitUntil: 'domcontentloaded' });
    await ew.waitFor({ timeout: 40000 });
    ok(await waitStage('answered', 40000) === 'answered', 'אחרי התשובות: «ענה/תה»', await stage());
    const ans = await text(ew.locator('[data-ew-answers]'));
    ok(/נקודות זיכוי/.test(ans) && /מהשאלון/.test(ans), 'נקודות זיכוי — מהשאלון', ans.replace(/\s+/g, ' ').slice(0, 300));
    if (kind === 'a') {
      ok(/360,000/.test(ans), 'הצפי לכל השנה: 270,000 + 3×30,000 = 360,000', ans.replace(/\s+/g, ' ').slice(0, 300));
      ok(/משכורת 108,000/.test(ans), 'הכנסה נוספת: משכורת 9,000 × 12 = 108,000', ans.replace(/\s+/g, ' ').slice(0, 300));
    } else {
      ok(/צפי לשנה מלאה/.test(ans) && /180,000/.test(ans) && /36,000/.test(ans), 'צפי לשנה מלאה: 180,000 · 36,000', ans.replace(/\s+/g, ' ').slice(0, 300));
    }
    const res = part('result');
    const rec = await text(res.locator('[data-ew-rec="it"]'));
    ok(/לפחות/.test(rec) && /%/.test(rec), `ההמלצה במ״ה: ${rec.replace(/\s+/g, ' ')}`, rec);
    ok(/לפחות/.test(await text(res.locator('[data-ew-rec="ni"]'))), 'ההמלצה בב״ל: «לפחות … לחודש»', await text(res.locator('[data-ew-rec="ni"]')));
    if (kind === 'b') ok(/המקדמות לפתיחת התיק/.test(await text(res)) && /6101/.test(await text(res)), '«המקדמות לפתיחת התיק» — השיעור והטופס 6101', (await text(res)).slice(0, 300));
    await res.locator('summary', { hasText: 'איך חישבנו' }).click();
    ok(/רווח/.test(await text(res.locator('.ew3-how'))), '«איך חישבנו» נפתח');
    if (kind === 'a') ok(/אחזקת רכב/.test(await text(res.locator('[data-ew-adj]'))), 'טבלת ההתאמות — בתוך «איך חישבנו»');
    await shot(page, '2-result');
    const pub = ew.locator('[data-ew-publish]');
    if (await pub.count() && await pub.isEnabled()) {
      await pub.click();
      const s6 = await waitStage('published', 40000);
      ok(s6 === 'published' || s6 === 'done', 'ההמלצה בדף', s6 + ' ' + (await text(ew.locator('.ty-err'))));
      const v = await env.sql(`select status, published_at is not null p, draft->'newBusiness' nb, outputs from public.tax_estimates where request_id='${st.id}' order by version desc limit 1`);
      ok(v[0]?.status === 'approved' && v[0]?.p, 'גרסה מאושרת ומפורסמת', JSON.stringify(v.map(x => ({ s: x.status, p: x.p }))));
      if (kind === 'b') {
        ok(!!v[0]?.nb, 'הגרסה מסומנת «עסק חדש» (לפתיחת התיקים ול-6101)', JSON.stringify(v[0]?.nb));
        const biz = v[0]?.outputs?.persons?.find(p => p.person === 'client')?.businessTaxable;
        ok(Math.round(biz / 12) === 12000, `הכנסה צפויה לחודש לטופס 6101: ${Math.round(biz / 12)} (180,000 − 36,000) ÷ 12`, biz);
      }
    } else {
      const miss = await text(ew.locator('[data-ew-missing]'));
      ok(kind === 'a' && miss.length > 0, `«פרסם» חסום עם «חסר» גלוי${kind === 'b' ? ' — בעסק חדש לא אמור להיות חסום' : ''}`, miss);
    }
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

for (const wd of WIDTHS) for (const k of ['a', 'b']) if (!ONLY || ONLY === k) await scenario(wd, k);
await browser.close();
console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
