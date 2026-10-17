#!/usr/bin/env node
/**
 * return-engine-s1.mjs — שלב 1 של תוכנית הליווי (17.10.2026) מול המסד האמיתי של staging, בדפדפן.
 *
 *   STAGING_ENV_DIR=<תיקייה עם .env.staging ו-.env.local> node scripts/e2e/return-engine-s1.mjs --base=http://localhost:5397 [--vp=desktop|mobile] [--shots=<dir>] [--dark]
 *
 * המסלול: בקשת «דוח שנתי 2025» ב«בקשות» ⇒ שורת הבקשה נפתחת עם הדוח ⇒ «מסמכים ושורות מקור»: הזנה מהנייר של 106 ×2, רו״ה ואישור ב״ל
 * ⇒ «לאן זה הלך» (158 / 172 / 042 / 170 / 239 / 089) ⇒ «טיוטת 1301 לפי קודים»: 042 = 19,979 ⇒ «ממה זה מורכב» = שתי שורות 106 ⇒ בקרה
 * «שדה בלי מקור» תקינה ⇒ «שמור טיוטה» (233: גרסה 1) ⇒ «פתח במפת הטופס»: ערכי הדוח על הטופס, איתור 158 מראה «בדוח: 152,855 ₪» ו«ממה זה מורכב».
 * ‼ לקוח בדיקה חדש לכל ריצה (staging-session.mjs), נמחק בסוף. בלי מיילים. כל פנייה שאינה ל-staging/localhost נחסמת.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d);
const BASE = arg('base', 'http://localhost:5397');
const VP = arg('vp', 'desktop');
const SHOTS = arg('shots', '');
const DARK = process.argv.includes('--dark');
const STAGING = 'evdfxjqrkgugssfrdoxd';
const ROOT = resolve(process.cwd());
createRequire(join(ROOT, 'package.json'));
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
const OFFICE = 'ca158d52-5ad7-47f5-b228-4b7703978b84';
const asOffice = async (expr) => (await sql(`begin; set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"${OFFICE}","role":"authenticated"}', true);
  select (${expr}) as r; commit;`))[0]?.r;

// ── הלקוח: נשוי מ-2015, מעסיק לכל אחד (e1 / e2 של רחל), עסק של רחל ⇒ 089/170/239 מתקבלים; בלי מסמכים — הכול «מהנייר» ──
await sql(`update public.clients set marriage_year = 2015, id_number = '000000018', spouse = '{"firstName":"רחל","lastName":"QA","gender":"female","birthDate":"1987-02-02"}'::jsonb,
  businesses = '[{"id":"b1","name":"סטודיו רחל — עיצוב","belongsToSpouse":true}]'::jsonb where id = '${A}'`);
const req = await asOffice(`public.ensure_tax_year_request('${A}', 'annual', 2025, null)`);
ok(req?.ok && req.stepId, 'בקשת «דוח שנתי 2025» נפתחה', JSON.stringify(req));
const STEP = req.stepId;

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false, args: ['--headless=new'] });
const consoleErrors = [], blocked = [];
const mobile = VP !== 'desktop';
const vpSize = VP === 'mobile' ? { width: 390, height: 844 } : VP === 'narrow' ? { width: 360, height: 780 } : { width: 1280, height: 900 };
const ctx = await browser.newContext({ viewport: vpSize, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'he-IL', colorScheme: DARK ? 'dark' : 'light' });
await env.initContext(ctx);
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
const MARK_SELECTORS = ['#ar-title', '[data-ar-sources] > summary', '[data-ar-pick]', '[data-ar-editor]', '[data-ar-line="106.gross"]', '[data-ar-save]', '[data-ar-landed]',
  '[data-ar-field="042"]', '[data-ar-breakdown]', '[data-ar-open-map]', '.fm-ctx', '[data-fm-find]', '[data-fm-hit-value]', '[data-fm-return-value]', '#ar-annexes > summary', '[data-ar-doc="form106"]'];
const shot = async (name, full = false) => {
  if (!SHOTS) return;
  await page.screenshot({ path: join(SHOTS, `${name}-${tag}.png`), fullPage: full }).catch(() => {});
  const boxes = await page.evaluate(([sels, f]) => {
    const out = {}; const sy = f ? window.scrollY : 0; const sx = f ? window.scrollX : 0;
    for (const sel of sels) { const el = document.querySelector(sel); if (!el) continue; const r = el.getBoundingClientRect(); if (r.width && r.height) out[sel] = { x: r.left + sx, y: r.top + sy, w: r.width, h: r.height }; }
    return { vw: window.innerWidth, vh: f ? document.documentElement.scrollHeight : window.innerHeight, dpr: window.devicePixelRatio, boxes: out };
  }, [MARK_SELECTORS, full]).catch(() => null);
  if (boxes) writeFileSync(join(SHOTS, `${name}-${tag}.json`), JSON.stringify(boxes));
};
const text = (sel) => page.locator(sel).first().innerText().catch(() => '');
/** «לאן זה הלך» מתעדכן אחרי שהעובדות נטענות מחדש — מחכים לטקסט, לא לנראות */
const waitLanded = async (re) => { await page.waitForFunction((src) => new RegExp(src).test(document.querySelector('[data-ar-landed]')?.textContent ?? ''), re.source, { timeout: 30000 }).catch(() => {}); return text('[data-ar-landed]'); };
const openDetails = async (id) => { const d = page.locator(id); if (!(await d.evaluate(e => e.open).catch(() => false))) await d.locator('> summary').click(); };

try {
  // ── 1. שורת הבקשה נפתחת עם הדוח ──
  await page.goto(`${BASE}/#/client/${A}/journey/${STEP}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#ar-title', { timeout: 45000 });
  ok(true, 'הדוח השנתי נפתח בתוך שורת הבקשה ב«בקשות»');
  // בת הזוג נכללת בדוח רק כשיש לה הכנסה בתיק וכרטיס בן/בת זוג; בלקוח הבדיקה יש רק שם ⇒ מסמנים אותה ב«מי בדוח»
  await openDetails('#ar-persons');
  await page.locator('#ar-persons label.te-radio').filter({ hasText: 'רחל' }).locator('input').check();
  await page.waitForFunction(() => /רחל/.test(document.querySelector('.te-head')?.textContent ?? ''), null, { timeout: 10000 });
  const head = await text('.te-head');
  ok(/דוח 2025/.test(head) && /רחל/.test(head), 'כותרת: דוח 2025 · דוד ורחל (בת הזוג נכללת — יש לה הכנסה בתיק)', head);
  ok(/חסרים נתוני הכנסה|חסר/.test(await text('.te-result')), 'לפני הזנה — «חסר», לא אפס');
  await shot('panel-open');

  // ── 2. הזנה מהנייר: 106 של דוד ──
  const enter = async (kind, who, entity, values, expectLanded) => {
    await openDetails('#ar-sources');
    await page.selectOption('[data-ar-pick]', kind);
    await page.click('[data-ar-paper]');
    await page.waitForSelector(`[data-ar-editor="${kind}"]`);
    if (who) await page.selectOption('[data-ar-who]', who);
    if (entity) await page.selectOption('[data-ar-entity]', entity);
    for (const [k, v] of Object.entries(values)) await page.fill(`[data-ar-line="${k}"] input`, String(v));
    const disabled = await page.locator('[data-ar-save]').isDisabled();
    ok(!disabled, `${kind}: הטופס תקין — «שמור שורות מקור» פעיל`, await text('[data-ar-problems]'));
    await page.click('[data-ar-save]');
    const landed = await waitLanded(new RegExp(expectLanded[0]));
    ok(expectLanded.every(x => landed.includes(x)), `${kind}: «לאן זה הלך» — ${expectLanded.join(' · ')}`, landed);
    return landed;
  };
  // אימות בזמן ההזנה: מס גדול מההכנסה ⇒ חסום
  await openDetails('#ar-sources');
  await page.selectOption('[data-ar-pick]', 'form106'); await page.click('[data-ar-paper]'); await page.waitForSelector('[data-ar-editor="form106"]');
  await page.selectOption('[data-ar-entity]', 'e1');
  await page.fill('[data-ar-line="106.gross"] input', '1000'); await page.fill('[data-ar-line="106.withheld"] input', '5000');
  ok(await page.locator('[data-ar-save]').isDisabled() && /גדול מההכנסה/.test(await text('[data-ar-problems]')), 'אימות: מס שנוכה גדול מההכנסה ⇒ השמירה חסומה עם הסבר', await text('[data-ar-problems]'));
  await page.fill('[data-ar-line="106.gross"] input', '152855'); await page.fill('[data-ar-line="106.withheld"] input', '15000'); await page.fill('[data-ar-line="106.insured"] input', '140000');
  await shot('entry-106');
  await page.click('[data-ar-save]');
  let landed = await waitLanded(/244/);
  ok(landed.includes('158') && landed.includes('152,855') && landed.includes('244'), '106 של דוד ⇒ 158 ← 152,855 · 244 ← 140,000', landed);
  await shot('landed-106');
  // 106 של רחל, רו״ה של רחל, אישור ב״ל של רחל
  await enter('form106', 'spouse', 'e2', { '106.gross': 60075, '106.withheld': 4979 }, ['172', '60,075', '042', '19,979']);
  await enter('annualPnl', 'spouse', 'b1', { 'pnl.turnover': 152023, 'pnl.profit': 123629 }, ['170', '123,629', '239', '152,023']);
  await enter('niAnnualCert', 'spouse', null, { 'ni.paid': 11676, 'ni.health': 5144 }, ['089', '11,676']);
  await page.waitForFunction(() => /4 מסמכים/.test(document.querySelector('#ar-sources > summary')?.textContent ?? ''), null, { timeout: 20000 }).catch(() => {});
  const docsLine = await text('#ar-sources > summary');
  ok(/4 מסמכים/.test(docsLine) && /4 הוזנו/.test(docsLine), 'סיכום: 4 מסמכים · 4 הוזנו', docsLine);
  await openDetails('#ar-fields');
  const fieldsText = (await page.locator('[data-ar-field]').allInnerTexts()).join(' | ');
  ok(/5,144/.test(await text('[data-ar-doc="niAnnualCert"]')) && !fieldsText.includes('5,144'), 'בריאות (5,144) נשמרה כשורה במסמך ואינה מופיעה בשום שדה בדוח', fieldsText.slice(0, 200));
  await shot('docs-entered');

  // ── 3. טיוטת 1301: 042 וממה הוא מורכב ──
  await openDetails('#ar-fields');
  const row042 = page.locator('[data-ar-field="042"]');
  ok(/19,979/.test(await row042.innerText()), '042 (מס שנוכה ממשכורת) = 19,979 — סכום שני ה-106', await row042.innerText());
  await row042.locator('[data-ar-breakdown-btn]').click();
  await page.waitForSelector('[data-ar-breakdown]');
  const bd = await text('[data-ar-breakdown]');
  const nLines = await page.locator('[data-ar-breakdown] .ar-line').count();
  ok(nLines === 2 && /טופס 106/.test(bd) && /15,000/.test(bd) && /4,979/.test(bd) && /רחל/.test(bd) && /סה״כ השורות: 19,979/.test(bd), '«ממה זה מורכב»: שתי שורות 106 (דוד 15,000 · רחל 4,979), עם המסמך, האדם והסה״כ', bd);
  await page.locator('[data-ar-field="042"]').scrollIntoViewIfNeeded();
  await shot('breakdown-042');
  // ── 4. בקרות ──
  await openDetails('#ar-annexes');
  const controls = await text('#ar-annexes');
  ok(/✓ שדה בלי מקור/.test(controls) && /✓ סכום שורות המקור = השדה/.test(controls), 'בקרות: «שדה בלי מקור» ו«Σ שורות = שדה» תקינות', controls.slice(0, 600));
  // ── 5. 233: שמירת טיוטה — גרסה 1 ──
  await page.getByRole('button', { name: 'שמור טיוטה' }).click();
  await page.waitForFunction(() => /נפתחה גרסה 1/.test(document.body.innerText), null, { timeout: 20000 });
  const ar = await one(`select count(*)::int n, max(version) v, max(jsonb_array_length(input_facts)) nf from public.annual_returns where request_id = '${STEP}'`);
  ok(ar.n === 1 && ar.v === 1 && ar.nf >= 8, '233: גרסה 1 נשמרה עם העובדות שנכנסו (input_facts)', JSON.stringify(ar));
  const facts = await one(`select count(*)::int n, count(distinct evidence_id)::int docs, count(*) filter (where entered_by = '${OFFICE}')::int mine from public.tax_year_facts where client_id = '${A}' and line_key is not null and status = 'accepted'`);
  ok(facts.n === 9 && facts.docs === 4 && facts.mine === 9, '257: 9 שורות מקור מאושרות מ-4 מסמכים, כולן עם «מי הזין»', JSON.stringify(facts));
  const ev = await one(`select count(*)::int n, count(*) filter (where review = 'accepted' and extraction = 'office_entered' and received_via = 'office')::int okn from public.tax_evidence where client_id = '${A}'`);
  ok(ev.n === 4 && ev.okn === 4, 'המסמכים נרשמו מאושרים, «הוזן במשרד»', JSON.stringify(ev));
  // עריכה חוזרת של 106 של דוד: הסכום משתנה ⇒ 158 מתעדכן, השורה הישנה «הוחלפה»
  await openDetails('#ar-sources');
  await page.locator('[data-ar-doc="form106"]').filter({ hasText: 'דוד' }).locator('[data-ar-enter]').first().click();
  await page.waitForSelector('[data-ar-editor="form106"]');
  await page.fill('[data-ar-line="106.gross"] input', '152900');
  await page.click('[data-ar-save]');
  await waitLanded(/152,900/);
  await page.waitForFunction(() => /152,900/.test(document.querySelector('[data-ar-field="158"]')?.textContent ?? ''), null, { timeout: 20000 });
  const sup = await one(`select count(*) filter (where status = 'superseded')::int s, count(*) filter (where status = 'accepted')::int a from public.tax_year_facts where client_id = '${A}' and line_key is not null`);
  ok(sup.a === 9 && sup.s === 3, 'שמירה חוזרת: שורות המסמך הוחלפו (3 «הוחלפו», 9 חיות)', JSON.stringify(sup));
  ok(/152,900/.test(await page.locator('[data-ar-field="158"]').innerText()), '158 מתעדכן ל-152,900 מיד');

  // ── 6. מפת הטופס עם ערכי הלקוח ──
  await page.click('[data-ar-open-map]');
  await page.waitForFunction(() => location.hash.includes('map1301'), null, { timeout: 15000 });
  await page.waitForFunction(() => /ערכי הדוח/.test(document.querySelector('.fm-ctx')?.textContent ?? ''), null, { timeout: 30000 });
  ok(true, 'המפה נפתחה מהבקשה עם הלקוח כהקשר, וערכי הדוח עליה');
  await page.fill('[data-fm-find]', '158');
  await page.waitForSelector('[data-fm-hit-value]', { timeout: 15000 });
  ok(/152,900/.test(await text('[data-fm-hit-value]')), 'איתור שדה 158 ⇒ «בדוח: 152,900 ₪»', await text('[data-fm-hit-value]'));
  await page.locator('.fm-hit').first().click();
  await page.waitForSelector('[data-fm-return-value]', { timeout: 15000 });
  const fmBd = await text('[data-fm-return-value]');
  ok(/152,900/.test(fmBd) && /טופס 106/.test(fmBd), 'כרטיס השדה במפה: «בדוח 2025: 152,900 ₪» + ממה זה מורכב (טופס 106)', fmBd);
  const valMarks = await page.locator('.fm-mk.has-val').count();
  ok(valMarks >= 3, `סימוני «יש סכום בדוח» על העמוד הנוכחי של הטופס: ${valMarks}`);
  await shot('map-158');
  ok(blocked.length === 0, 'אין פנייה מחוץ ל-staging/localhost', blocked.slice(0, 3).join(' | '));
  ok(consoleErrors.length === 0, 'אין שגיאות קונסול', consoleErrors.slice(0, 3).join(' | '));
  ok((await one(`select count(*)::int n from public.email_messages where client_id = '${A}'`)).n === 0, '0 מיילים');
} catch (e) {
  fail++; console.log('  ✗ שגיאה:', String(e).slice(0, 600));
  await page.screenshot({ path: join(SHOTS || '.', `error-${tag}.png`), fullPage: true }).catch(() => {});
} finally {
  await browser.close().catch(() => {});
  const r = await env.cleanup();
  ok(r.left === 0 && r.storageLeft === 0, `ניקוי: 0 שאריות (${r.files} קבצים)`, JSON.stringify(r));
  console.log(`\n${pass} עברו · ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
}
