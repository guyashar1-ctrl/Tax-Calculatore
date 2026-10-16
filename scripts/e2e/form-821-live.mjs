#!/usr/bin/env node
/**
 * form-821-live.mjs — טופס 821 חי (16.10.2026) מול המסד האמיתי של staging, בדפדפן.
 *
 *   STAGING_ENV_DIR=<תיקייה עם .env.staging ו-.env.local> node scripts/e2e/form-821-live.mjs --base=http://localhost:5321 [--vp=desktop|mobile|narrow] [--shots=<dir>] [--dark]
 *
 * המסלול: המשרד פותח את הפאנל (סימוני «חסר» על הטופס) ⇒ «מילוי עכשיו» — מה שמוקלד מופיע על הטופס לפני השמירה ⇒ שמירה
 * (כרטיס: ענף, תאריך פתיחה, סוג עוסק לפי המחזור) ⇒ הלקוח בדף האישי: המסכים שנשארו עם הטופס החי לצידם ⇒ סקירה עם
 * «כאן תיכנס החתימה שלך» ⇒ חתימה ⇒ המשרד: הקובץ החתום נשמר, והחתימה יושבת בתיבת «חתימה וחותמת» (נבדק בפיקסלים).
 * גם 4440 נפתח — שלא נשבר.
 * ‼ לקוח בדיקה חדש לכל ריצה (staging-session.mjs), נמחק בסוף. בלי מיילים. כל פנייה שאינה ל-staging/localhost נחסמת.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d);
const BASE = arg('base', 'http://localhost:5321');
const VP = arg('vp', 'desktop');
const SHOTS = arg('shots', '');
const DARK = process.argv.includes('--dark');
const STAGING = 'evdfxjqrkgugssfrdoxd';
const ROOT = resolve(process.cwd());
const require = createRequire(join(ROOT, 'package.json'));
const { chromium } = createRequire('C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json')('playwright-core');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(info).slice(0, 400)}` : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const env = await (await import('./staging-session.mjs')).prepare();
const { sql, clientId: A } = env;
const one = async (q) => (await sql(q))[0];
const tag = `${VP}${DARK ? '-dark' : ''}`;
console.log(`לקוח בדיקה: ${env.run} (${A.slice(0, 8)}…) · ${tag}`);

// ── נתוני הלקוח: יחיד, ת.ז. תקינה, כתובת; בלי עסק ובלי בנק — כדי לראות «חסר» ──
await sql(`update public.clients set last_name = 'בדיקה', id_number = '000000018', phone = '0541234567', address = 'הרצל 12', city = 'חיפה', zip_code = '3303912',
  gender = 'male', dealer_type = null where id = '${A}'`);
const OFFICE = 'ca158d52-5ad7-47f5-b228-4b7703978b84';
const asOffice = async (expr) => (await sql(`begin; set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"${OFFICE}","role":"authenticated"}', true);
  select (${expr}) as r; commit;`))[0]?.r;
const start = await asOffice(`public.smart_form_client_start('${A}', 'vat-821', true)`);
ok(start?.ok && start.filingId, 'בקשת 821 נפתחה ופורסמה', start);
const F = start.filingId, S = start.stepId;

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false, args: ['--headless=new'] });
const consoleErrors = [], blocked = [];
const mobile = VP !== 'desktop';
const vpSize = VP === 'mobile' ? { width: 390, height: 844 } : VP === 'narrow' ? { width: 360, height: 780 } : { width: 1280, height: 900 };
async function newContext(portal = false) {
  const ctx = await browser.newContext({ viewport: vpSize, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'he-IL', colorScheme: DARK ? 'dark' : 'light' });
  if (!portal) await env.initContext(ctx);
  if (DARK) await ctx.addInitScript(() => { try { localStorage.setItem('pivo_theme', 'dark'); } catch { /* */ } });
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
    const host = new URL(u).hostname;
    if (host === 'localhost' || host === `${STAGING}.supabase.co` || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    blocked.push(u); return route.abort();
  });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/favicon|ResizeObserver|401|JWT|PGRST303/.test(m.text())) consoleErrors.push(`${tag}: ${m.text().slice(0, 240)}`); });
  page.on('pageerror', e => consoleErrors.push(`${tag} pageerror: ${String(e).slice(0, 240)}`));
  return { ctx, page };
}
// ‼ לצד כל צילום נשמרים מיקומי האלמנטים המסומנים במדריך (JSON, פיקסלים של הצילום) — הסימונים במדריך נמדדים, לא נאמדים בעין
const MARK_SELECTORS = ['.cf-live-sum', '.cf-live-legend', '.sf-hot.is-sign .sf-hot-tag', '[data-cf-status-note]', '[data-cf-key="businessName"]', '[data-cf-key="industry"]',
  '.sf-hot[data-hot="businessName"]', '.sf-hot[data-hot="openDate"]', '.sf-hot.is-active', '[data-cf-live-mobile] > summary', '.cf-declare', '.cf-pad', '[data-cf-sign-note]',
  '.sf-hot.is-signed .sf-hot-tag', '[data-cf-key="propExists"]', '[data-cf-key="openDate"]', '.sf-hot[data-hot="g:prop.kind"]', '.sf-hot[data-hot="activity.1"]', '.cfp-status', '.cf-live-chip'];
const shot = async (page, name, full = false) => {
  if (!SHOTS) return;
  await page.screenshot({ path: join(SHOTS, `${name}-${tag}.png`), fullPage: full }).catch(() => {});
  const boxes = await page.evaluate(([sels, full]) => {
    const out = {}; const sy = full ? window.scrollY : 0; const sx = full ? window.scrollX : 0;
    for (const sel of sels) { const el = document.querySelector(sel); if (!el) continue; const r = el.getBoundingClientRect(); if (r.width && r.height) out[sel] = { x: r.left + sx, y: r.top + sy, w: r.width, h: r.height }; }
    return { vw: window.innerWidth, vh: full ? document.documentElement.scrollHeight : window.innerHeight, dpr: window.devicePixelRatio, boxes: out };
  }, [MARK_SELECTORS, full]).catch(() => null);
  if (boxes) writeFileSync(join(SHOTS, `${name}-${tag}.json`), JSON.stringify(boxes));
};
const waitPreview = async (page) => { await page.waitForFunction(() => { const c = document.querySelector('.sf-page canvas'); return c && c.width > 300 && !/מעדכן/.test(document.querySelector('.sf-preview-title')?.textContent ?? ''); }, null, { timeout: 30000 }); await sleep(300); };
const markers = (page) => page.evaluate(() => [...document.querySelectorAll('.sf-hot[data-mark]')].map(e => ({ key: e.dataset.hot, mark: e.dataset.mark })));
const summary = (page) => page.evaluate(() => document.querySelector('.cf-live-sum')?.textContent ?? '');
const fillByKey = async (page, key, value) => {
  const el = page.locator(`[data-cf-key="${key}"] input, [data-cf-key="${key}"] textarea, [data-cf-key="${key}"] select`).first();
  const tagName = await el.evaluate(e => e.tagName);
  if (tagName === 'SELECT') await el.selectOption(value); else { await el.fill(value); }
};
const choose = async (page, key, label) => page.locator(`[data-cf-key="${key}"] button`, { hasText: new RegExp(`^${label}$`) }).first().click();

/** פותח את הפאנל של הבקשה שכותרתה תואמת — שורה אחרי שורה, וממתין שהקודם ייסגר לפני הלחיצה הבאה. */
async function openPanel(page, re) {
  const rows = page.getByRole('button', { name: 'פתיחה' });
  await rows.first().waitFor({ timeout: 30000 });
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    await rows.nth(i).click();
    // הכותרת «טופס · …» עד שהתצוגה נטענת מהשרת
    await page.waitForFunction(() => { const t = document.querySelector('#cfp-h')?.textContent ?? ''; return t && !/^טופס ·/.test(t); }, null, { timeout: 15000 });
    const h = await page.locator('#cfp-h').textContent();
    console.log(`    (openPanel) שורה ${i + 1}/${n}: ${h}`);
    if (re.test(h)) return;
    await page.keyboard.press('Escape');
    await page.waitForSelector('#cfp-h', { state: 'detached', timeout: 10000 });
  }
  throw new Error('לא נמצאה בקשה ' + re);
}
let section = '';
try {
  // ════ א · המשרד: הפאנל עם סימוני «חסר», מילוי חי, שמירה ════
  section = 'פאנל המשרד';
  const office = await newContext();
  const page = office.page;
  await page.goto(env.officeUrl(A, 'journey'), { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'פתיחה' }).first().click({ timeout: 30000 });
  await waitPreview(page);
  const m0 = await markers(page);
  const miss0 = m0.filter(m => m.mark === 'missing').map(m => m.key);
  ok(miss0.length >= 12 && ['businessName', 'activity.1', 'turnover', 'openDate', 'employees', 'bank.code', 'g:prop.kind', 'biz.street'].every(k => miss0.includes(k)), `סימוני «חסר» על הטופס (${miss0.length})`, miss0.join(','));
  ok(m0.filter(m => m.mark === 'ok').map(m => m.key).includes('idNumber') && m0.some(m => m.key === 'home.street' && m.mark === 'ok'), 'מה שבכרטיס מסומן ✓ (ת.ז., כתובת המגורים)', m0);
  ok(m0.some(m => m.key === 'signature' && m.mark === 'sign'), 'אזור חתימת הלקוח מסומן');
  const sigTag = await page.locator('.sf-hot.is-sign .sf-hot-tag').first().textContent().catch(() => '');
  ok(/כאן הלקוח חותם/.test(sigTag), 'התווית «כאן הלקוח חותם» על התיבה', sigTag);
  ok(/חסר בטופס · \d+/.test(await summary(page)), 'שורת הסיכום «חסר בטופס»', await summary(page));
  ok(await page.locator('[data-cf-sign-note]').count() === 1, 'הסבר: הלקוח חותם בדף האישי, החתימה נכנסת לתיבה המסומנת');
  await shot(page, 'a1-panel-missing');

  // לחיצה על «חסר» (שם העסק) פותחת את המילוי עם השדה הזה
  await page.locator('.sf-hot[data-hot="businessName"]').first().click();
  await page.waitForSelector('[data-cf-key="businessName"] input', { timeout: 10000 });
  const focused = await page.evaluate(() => document.activeElement?.closest('[data-cf-key]')?.getAttribute('data-cf-key'));
  ok(focused === 'businessName', 'לחיצה על «חסר» על הטופס פותחת את השאלה הנכונה וממקדת אותה', focused);

  // מילוי חי: מקלידים — ועוד לפני שמירה, התיבה מתמלאת ומסומנת ✓
  await fillByKey(page, 'businessName', 'שליחויות אמיר');
  await fillByKey(page, 'industry', 'H');
  await fillByKey(page, 'activity', 'שליחויות ומשלוחים לעסקים באזור חיפה');
  await page.waitForFunction(() => document.querySelector('.sf-hot[data-hot="businessName"]')?.dataset.mark === 'ok', null, { timeout: 15000 });
  await waitPreview(page);
  const m1 = await markers(page);
  ok(m1.some(m => m.key === 'businessName' && m.mark === 'ok') && m1.some(m => m.key === 'activity.1' && m.mark === 'ok'), 'הקלדה ⇒ הטופס מתעדכן מיד (בלי שמירה): שם העסק ותיאור הפעילות ✓');
  const [answersBefore] = await sql(`select values->'answers' a from public.smart_form_revisions where filing_id = '${F}'`);
  const [cardBefore] = await sql(`select business_name, businesses from public.clients where id = '${A}'`);
  ok(!cardBefore.business_name && (answersBefore.a ?? null) && Object.keys(answersBefore.a).length === 0, 'עוד לא נשמר במסד — זו תצוגה חיה בלבד', { cardBefore, answersBefore });
  await shot(page, 'a2-panel-live-typing');

  // «מהבית» מעתיק את כתובת המגורים לעסק — גם בתצוגה החיה
  await choose(page, 'bizAtHome', 'כן');
  await page.waitForFunction(() => document.querySelector('.sf-hot[data-hot="biz.street"]')?.dataset.mark === 'ok', null, { timeout: 15000 });
  ok(true, '«העסק פועל מהבית» ⇒ כתובת העסק על הטופס מיד');
  await choose(page, 'mailSame', 'כן');
  await fillByKey(page, 'openDate', '2026-08-31');
  await fillByKey(page, 'employees', '1');
  await fillByKey(page, 'turnover', '40000');
  await fillByKey(page, 'bankCode', '12');
  await fillByKey(page, 'bankBranch', '600');
  await fillByKey(page, 'bankAccount', '123456');
  await choose(page, 'propExists', 'קיים נכס');
  await choose(page, 'propKind', 'אחר');
  await fillByKey(page, 'propKindOther', 'דירת מגורים');
  await choose(page, 'propTenure', 'בבעלות');
  await page.waitForFunction(() => /כל תיבות החובה/.test(document.querySelector('.cf-live-sum')?.textContent ?? ''), null, { timeout: 20000 });
  await waitPreview(page);
  ok(true, 'אחרי המילוי: «כל תיבות החובה בטופס מלאות» (עדיין לפני שמירה)');
  const openOps = await page.evaluate(() => document.querySelector('.sf-hot[data-hot="openDate"]')?.dataset.mark);
  ok(openOps === 'ok', 'תאריך הפתיחה (31.08.2026) בתיבות חודש/שנה ✓', openOps);
  ok(/לפי המחזור: עוסק פטור/.test(await page.locator('[data-cf-status-note]').textContent().catch(() => '')), 'סוג העוסק לפי המחזור: 40,000 ⇒ עוסק פטור');
  await shot(page, 'a3-panel-all-filled');

  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[data-cf-key="businessName"] input'), null, { timeout: 20000 });
  const [c1] = await sql(`select business_name, businesses, bank_accounts, dealer_type, field_meta->'businesses'->>'via' via from public.clients where id = '${A}'`);
  const b = c1.businesses?.[0] ?? {};
  ok(c1.business_name === 'שליחויות אמיר' && b.industry === 'H' && b.startDate === '2026-08-31' && b.startYear === 2026 && b.kind === 'osek_patur' && c1.dealer_type === 'exempt' && c1.via === 'vat-821',
    'שמירה ⇒ בכרטיס: שם העסק, ענף, תאריך פתיחה מלא, שנה, עוסק פטור, dealer_type', c1);
  const [rv] = await sql(`select values->'answers' a from public.smart_form_revisions where filing_id = '${F}'`);
  ok(rv.a?.propExists === 'yes' && rv.a?.turnover === '40000' && rv.a?.dealerKind === 'exempt' && !('openDate' in rv.a), 'בהגשה: רק מה שאין לו בית בכרטיס (נכס, מחזור, סוג עוסק)', rv.a);
  await waitPreview(page);
  await shot(page, 'a4-panel-saved');

  // 4440 לא נשבר: נפתח, מצייר, מסמן
  section = '4440';
  await sql(`update public.clients set family_status = 'married', spouse_first_name = 'רחל', spouse_last_name = 'בדיקה' where id = '${A}'`);
  const s4 = await asOffice(`public.smart_form_client_start('${A}', 'ita-4440', false)`);
  ok(s4?.ok, '4440: נפתח כטיוטה', s4);
  await page.keyboard.press('Escape');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openPanel(page, /4440/);
  await waitPreview(page);
  const m44 = await markers(page);
  ok(/4440/.test(await page.locator('#cfp-h').textContent()) && m44.some(m => m.mark === 'missing') && m44.some(m => m.key.endsWith('.signature') && m.mark === 'sign'), '4440: הפאנל נפתח עם סימונים וחתימת הלקוח', m44.slice(0, 5));
  await shot(page, 'a5-4440-panel');
  await page.keyboard.press('Escape');
  await office.ctx.close();

  // ════ ב · הלקוח: הדף האישי — המסכים שנשארו עם הטופס החי, סקירה, חתימה ════
  section = 'הדף האישי';
  const client = await newContext(true);
  const cp = client.page;
  await cp.goto(env.portalUrl(), { waitUntil: 'domcontentloaded' });
  await cp.getByRole('button', { name: 'למילוי וחתימה' }).first().click({ timeout: 30000 });
  await cp.waitForSelector('[data-client-form]', { timeout: 20000 });
  await cp.getByRole('button', { name: /^(התחלה|לצפייה בטופס)$/ }).click();
  // המשרד מילא הכול ⇒ נשארו רק מסכי ההצהרה (פתיחת העסק, הנכס) — לצידם הטופס החי
  await cp.waitForSelector('.cf-live-wrap', { timeout: 20000 });
  const sideVisible = await cp.locator('[data-cf-live-side]').isVisible();
  ok(mobile ? !sideVisible : sideVisible, mobile ? 'טלפון: הטופס החי מקופל מתחת לשאלות' : 'מחשב: הטופס החי לצד השאלות');
  if (mobile) {
    await cp.locator('[data-cf-live-mobile] summary').click();
    await cp.waitForSelector('[data-cf-live-mobile] .sf-page canvas', { timeout: 30000 });
  }
  await waitPreview(cp);
  const q = await cp.locator('.ty-q').first().textContent();
  ok(/פתיחת העסק/.test(q ?? ''), 'מסך «פתיחת העסק» (הצהרת הלקוח) עם הערכים שהמשרד מילא', q);
  const turnoverVal = await cp.locator('[data-cf-key="turnover"] input').inputValue();
  ok(turnoverVal === '40000', 'המחזור שהמשרד מילא כבר בשדה', turnoverVal);
  const active = await cp.evaluate(() => document.querySelector('.sf-hot.is-active')?.dataset.hot);
  ok(['turnover', 'openDate', 'employees'].includes(active ?? ''), 'התיבה של השאלה הנוכחית מודגשת על הטופס', active);
  await shot(cp, 'b1-client-screen-live', mobile);
  // הלקוח משנה את המחזור ⇒ הטופס מתעדכן מיד
  await fillByKey(cp, 'turnover', '55000');
  await cp.waitForFunction(() => [...document.querySelectorAll('.sf-page canvas')].length > 0, null, { timeout: 15000 });
  await waitPreview(cp);
  ok(true, 'שינוי בשדה ⇒ הטופס החי מצויר מחדש');
  await cp.getByRole('button', { name: /^(הבא|לצפייה בטופס)$/ }).click();
  // מסך הנכס — אחרי שהשמירה של המסך הקודם הסתיימה והמסך התחלף
  await cp.waitForFunction(() => !/פתיחת העסק/.test(document.querySelector('.ty-q')?.textContent ?? ''), null, { timeout: 30000 });
  const q2 = await cp.locator('.ty-q').first().textContent();
  ok(/המקום שבו העסק פועל/.test(q2 ?? ''), 'מסך הנכס עם «קיים נכס / לא קיים נכס»', q2);
  ok(await cp.locator('[data-cf-key="propExists"] button', { hasText: 'לא קיים נכס' }).count() === 1, 'האפשרות «לא קיים נכס» קיימת');
  await shot(cp, 'b2-client-property', mobile);
  await cp.getByRole('button', { name: /^(הבא|לצפייה בטופס)$/ }).click();
  // סקירה
  await cp.waitForFunction(() => /כפי שיוגש/.test(document.body.textContent ?? ''), null, { timeout: 30000 });
  await waitPreview(cp);
  ok(/כל תיבות החובה/.test(await summary(cp)), 'סקירה: «כל תיבות החובה בטופס מלאות»', await summary(cp));
  const sigTag2 = await cp.locator('.sf-hot.is-sign .sf-hot-tag').first().textContent().catch(() => '');
  ok(/כאן תיכנס החתימה שלך/.test(sigTag2), 'סקירה: «כאן תיכנס החתימה שלך» על תיבת החתימה', sigTag2);
  const [locked] = await sql(`select state, content_sha256 from public.smart_form_revisions where filing_id = '${F}'`);
  ok(locked.state === 'locked' && locked.content_sha256, 'ההכנה נעלה את הגרסה בשרת עם טביעה', locked);
  await shot(cp, 'b3-client-review', mobile);
  // חתימה
  await cp.locator('.cf-declare input').check();
  const pad = cp.locator('.cf-pad canvas');
  const bb = await pad.boundingBox();
  await cp.mouse.move(bb.x + 20, bb.y + bb.height / 2);
  await cp.mouse.down();
  for (let i = 1; i <= 24; i++) await cp.mouse.move(bb.x + 20 + i * ((bb.width - 40) / 24), bb.y + bb.height / 2 + Math.sin(i / 2) * 28, { steps: 2 });
  await cp.mouse.up();
  await cp.getByRole('button', { name: 'חתימה ושליחה למשרד' }).click();
  await cp.waitForFunction(() => /נחתם ונשלח למשרד/.test(document.body.textContent ?? ''), null, { timeout: 30000 });
  ok(true, 'הלקוח חתם');
  await cp.getByRole('button', { name: 'לצפייה בטופס החתום' }).click();
  await waitPreview(cp);
  const signedMark = await cp.evaluate(() => document.querySelector('.sf-hot[data-hot="signature"]')?.dataset.mark);
  ok(signedMark === 'signed', 'הטופס החתום אצל הלקוח: תיבת החתימה מסומנת «נחתם»', signedMark);
  await shot(cp, 'b4-client-signed', mobile);
  await client.ctx.close();

  // ════ ג · המשרד: הקובץ החתום נשמר; החתימה בתיבה הנכונה ════
  section = 'הקובץ החתום';
  const office2 = await newContext();
  const p2 = office2.page;
  await p2.goto(env.officeUrl(A, 'journey'), { waitUntil: 'domcontentloaded' });
  await openPanel(p2, /821/);
  // ‼ החותמת נטענת אסינכרונית: או שהקובץ נשמר, או שמופיע «הפקה בלי החותמת» (ב-staging אין חותמת לפרופיל הבדיקה)
  const noStamp = p2.getByRole('button', { name: 'הפקה בלי החותמת' });
  for (let t = 0; t < 60; t++) {
    if (/הקובץ החתום נשמר במסמכים/.test(await p2.locator('body').textContent())) break;
    if (await noStamp.count()) { await noStamp.click(); ok(true, 'אין חותמת משרד ב-staging ⇒ «הפקה בלי החותמת» (בחירה מפורשת)'); break; }
    await sleep(1000);
  }
  await p2.waitForFunction(() => /הקובץ החתום נשמר במסמכים/.test(document.body.textContent ?? ''), null, { timeout: 90000 });
  const [sd] = await sql(`select r.signed_document_id did, d.storage_path, d.file_name from public.smart_form_revisions r join public.documents d on d.id = r.signed_document_id where r.filing_id = '${F}'`);
  ok(sd?.did && sd.storage_path, 'הקובץ החתום נשמר במסמכי הלקוח', sd);
  await waitPreview(p2);
  await shot(p2, 'c1-office-signed');
  // ‼ הוכחה בפיקסלים: הדיו של החתימה יושב בתוך תיבת «חתימה וחותמת» (52..148 × 164..183 נק׳) — ולא מחוצה לה
  const envS = Object.fromEntries(readFileSync(join(process.env.STAGING_ENV_DIR, '.env.staging'), 'utf8').split(/\r?\n/).map(l => l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
  const dl = await fetch(`${envS.VITE_SUPABASE_URL}/storage/v1/object/client-documents/${sd.storage_path}`, { headers: { apikey: envS.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${envS.SUPABASE_SERVICE_ROLE_KEY}` } });
  ok(dl.ok, 'הורדת הקובץ החתום מהאחסון', dl.status);
  const pdfBytes = new Uint8Array(await dl.arrayBuffer());
  if (SHOTS) writeFileSync(join(SHOTS, `signed-821-${tag}.pdf`), pdfBytes);
  const { createCanvas } = require('@napi-rs/canvas');
  const pdfjs = await import(pathToFileURL(join(ROOT, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
  const render = async (bytes) => {
    const doc = await pdfjs.getDocument({ data: bytes.slice(), standardFontDataUrl: join(ROOT, 'node_modules/pdfjs-dist/standard_fonts/') + '/' }).promise;
    const pg = await doc.getPage(1); const vp = pg.getViewport({ scale: 3 });
    const c = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height)); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: g, viewport: vp, canvas: c }).promise;
    return { data: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height, H: pg.view[3], canvas: c };
  };
  const blank = await render(new Uint8Array(readFileSync(join(ROOT, 'public/templates/vat-821.pdf'))));
  const filled = await render(pdfBytes);
  if (SHOTS) writeFileSync(join(SHOTS, `signed-821-p1-${tag}.png`), filled.canvas.toBuffer('image/png'));
  const box = { x0: 52, x1: 148, y0: 164.1, y1: 183.1 };
  let inside = 0, nearOutside = 0;
  for (let y = 0; y < blank.h; y++) for (let x = 0; x < blank.w; x++) {
    const i = (y * blank.w + x) * 4;
    const d = Math.abs(blank.data[i] - filled.data[i]) + Math.abs(blank.data[i + 1] - filled.data[i + 1]) + Math.abs(blank.data[i + 2] - filled.data[i + 2]);
    if (d < 60) continue;
    const px = x / 3, py = blank.H - y / 3;
    if (px >= box.x0 - 2 && px <= box.x1 + 2 && py >= box.y0 - 2 && py <= box.y1 + 2) inside++;
    // סביבת התיבה (12 נק׳ מסביב, מחוץ לתיבה ומחוץ לתיבות השכנות של תאריך/שם) — דיו שם היה חתימה שגלשה
    else if (px >= box.x0 - 12 && px <= box.x1 + 12 && py >= box.y0 - 12 && py <= box.y1 + 12 && px < 232) nearOutside++;
  }
  ok(inside > 300 && nearOutside === 0, `החתימה בתוך תיבת «חתימה וחותמת» (${inside} פיקסלים בפנים, ${nearOutside} גולשים)`, { inside, nearOutside });
  const [fstate] = await sql(`select f.state, s.payload->'smartForm'->>'stateLabel' l from public.smart_form_filings f join public.onboarding_steps s on s.id = f.step_id where f.id = '${F}'`);
  ok(fstate.state === 'signed' && /נחתם/.test(fstate.l ?? ''), '«בקשות»: נחתם — להגשה למע״מ', fstate);
  await office2.ctx.close();
} catch (e) {
  ok(false, `חריגה ב«${section}»: ${String(e.message).split('\n')[0]}`);
  for (const c of browser.contexts()) for (const p of c.pages()) await p.screenshot({ path: join(SHOTS || '.', `error-${tag}.png`), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  ok(consoleErrors.length === 0, 'אין שגיאות קונסול', consoleErrors.join(' | '));
  ok(blocked.length === 0, 'אין פניות מחוץ ל-staging/localhost', blocked.join(' | '));
  const emails = await one(`select count(*)::int n from public.email_messages where client_id = '${A}'`);
  ok(emails?.n === 0, 'לא נשלחו מיילים', emails);
  const r = await env.cleanup();
  ok(r.left === 0 && r.storageLeft === 0, `ניקוי: 0 שאריות (קבצים: ${r.files})`, r);
  console.log(`\n${pass} עברו, ${fail} נכשלו · ${tag}`);
  process.exit(fail ? 1 : 0);
}
