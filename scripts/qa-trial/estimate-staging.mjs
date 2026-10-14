// QA דפדפן — הערכת המס וידע המס בבנייה לפרסום (vite build --mode staging) מול המסד של staging (13.10.2026).
// לקוח בדיקה חדש (staging-session.mjs), מחיקה מלאה וסריקת שאריות בסוף. כל פנייה לייצור נחסמת ומכשילה.
// המסלול: «התחל» הערכה 2026 מהתיק (הרשאת RPC) → שינוי חתך + «שמור טיוטה» → טעינה מחדש (נשמר) → טיוטה מלאה
// (נתוני ההדגמה, דרך save_tax_estimate כמשרד) → אישור → סיכום ומשימות → «ללמוד» וחזרה לאותה הערכה →
// טעינה מחדש (גרסה מאושרת בכרטיס השנה) → הרשאות (משתמש אחר / anon) → העתקת פרומפט תחזוקה → טלפון 390.
//   STAGING_ENV_DIR=<dir> node scripts/qa-trial/estimate-staging.mjs --base=http://localhost:4745 [--shots=<dir>] [--draft=<demo-draft.json>]
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prepare } from '../e2e/staging-session.mjs';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d);
const BASE = arg('base', 'http://localhost:4745');
const SHOTS = arg('shots', 'qa-shots-staging');
const DRAFT = JSON.parse(readFileSync(arg('draft', ''), 'utf8'));
const OFFICE = 'ca158d52-5ad7-47f5-b228-4b7703978b84';
const PROD = 'uoweoqtuiettozagwgdw';
const { chromium } = createRequire('C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json')('playwright-core');
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const ok = (c, m, i = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && i ? ` — ${String(i).slice(0, 400)}` : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const lit = (v) => `$q$${typeof v === 'string' ? v : JSON.stringify(v)}$q$`;

const env = await prepare();
const asUser = (sub, expr) => env.sql(`begin; set local role authenticated;
  select set_config('request.jwt.claims', ${lit({ sub, role: 'authenticated' })}, true);
  select (${expr}) as r; commit;`).then(x => x[0]?.r);
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false, args: ['--headless=new', '--disable-dev-shm-usage'] });
const errs = [], blocked = [], authLog = [], okLog = [];
async function newCtx(phone) {
  const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, locale: 'he-IL',
    ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await ctx.route(`**/*${PROD}*`, r => { blocked.push(r.request().url()); return r.abort(); });
  await env.initContext(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`${phone ? 'phone' : 'desktop'}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errs.push(`${phone ? 'phone' : 'desktop'}: ${m.text()}`); });
  page.on('response', r => { if (r.status() < 400) okLog.push({ t: Date.now(), url: r.url().replace(/\?.*/, '') }); });
  page.on('response', r => { if (r.status() >= 400) errs.push(`[after #${pass + fail}] ${phone ? "phone" : "desktop"}: HTTP ${r.status()} ${r.url().replace(/[?#].*/, '')}`); });
  // ‼ ראיות ל-401 (13.10.2026): מה נשלח (מפתח ציבורי או אסימון משתמש, ותוקפו), גוף התשובה, ומתי ביחס לרענון האסימון
  page.on('requestfinished', async q => {
    const u = q.url();
    if (!u.includes('/auth/v1/')) return;
    const r = await q.response().catch(() => null);
    authLog.push({ t: Date.now(), ctx: phone ? 'phone' : 'desktop', kind: 'auth', url: u.replace(/\?.*/, ''), status: r?.status() });
  });
  page.on('response', async r => {
    if (r.status() !== 401) return;
    const h = r.request().headers();
    const bearer = (h.authorization ?? '').replace(/^Bearer\s+/i, '');
    let claims = {};
    try { claims = JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url').toString()); } catch { /* */ }
    authLog.push({ t: Date.now(), ctx: phone ? 'phone' : 'desktop', kind: '401', url: r.url().replace(/\?.*/, ''), body: (await r.text().catch(() => '')).slice(0, 200),
      role: claims.role, sessionId: claims.session_id ? String(claims.session_id).slice(0, 8) : undefined, expIn: claims.exp ? claims.exp - Math.floor(Date.now() / 1000) : undefined, iatAgo: claims.iat ? Math.floor(Date.now() / 1000) - claims.iat : undefined });
  });
  return { ctx, page };
}
// 14.10.2026 · אחרי 241: «דוחות והצהרות» — שורה לכל עבודה פתוחה (data-work), ו«＋ הערכת מס <שנה>» כשאין הערכה פתוחה
const yearLine = (page) => page.locator('[data-section="works"] li[data-work="tax_estimate"]').first();
async function openOffice(page) {
  await page.goto(env.officeUrl(env.clientId, 'taxfile'), { waitUntil: 'networkidle' }); await sleep(2500);
  // ‼ «תיק מס» — הלשונית לא משנה כתובת בכל מצב (client-tabs-dont-change-url); לוחצים אם צריך
  if (!(await page.locator('[data-section="works"]').count())) { const t = page.getByRole('tab', { name: 'תיק מס' }).first(); if (await t.count()) { await t.click(); await sleep(1500); } }
}
async function openEstimate(page) {
  await openOffice(page);
  await yearLine(page).locator('button:has-text("פתח")').click(); await sleep(2000);
}
const noOverflow = async (page, where) => ok(!(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)), `${where}: בלי גלילה הצידה`);
const estRows = () => env.sql(`select id, version, revision, status, draft->>'cutoffMonth' cut, outputs ? 'cashflow' has_cash, outputs ? 'checks' has_checks, outputs ? 'alignment' has_al
  from public.tax_estimates where client_id = '${env.clientId}' order by version`);

try {
  console.log(`== לקוח בדיקה ${env.run}`);
  // כרטיס כמו שהמשרד ממלא: תאריכי לידה (תקרת הפנסיה תלויה בגיל 50) ופרטי בן/בת הזוג (נקודות זיכוי). נתוני בדיקה.
  await env.sql(`update public.clients set birth_date = '1984-03-10', gender = 'male',
    spouse = ${lit({ firstName: 'רחל', lastName: env.run, idNumber: '', birthDate: '1986-05-01', gender: 'female', phone: '' })}::jsonb
    where id = '${env.clientId}'`);
  const { ctx, page } = await newCtx(false);
  await openOffice(page);
  ok(await page.locator('[data-section="works"]').count() === 1, 'תיק מס נטען בבנייה לפרסום (staging)');
  await page.locator('[data-section="works"] button:has-text("＋ הערכת מס")').first().click(); await sleep(2500);
  ok(await page.locator('.te-panel').count() === 1, '«התחל» הערכת מס 2026 — הבקשה נפתחה (ensure_tax_year_request)');
  const stepId = (await env.sql(`select id from public.onboarding_steps where client_id='${env.clientId}' and step_type='tax_estimate'`))[0]?.id;
  ok(!!stepId, 'שורת בקשה אחת ב«בקשות» (onboarding_steps)', stepId);

  // שמירה וטעינה מחדש
  await page.evaluate(() => { const d = document.querySelector('#te-income'); if (d) d.open = true; });
  await page.locator('#te-income select').first().selectOption('8'); await sleep(500);
  await page.locator('.te-panel button:has-text("שמור טיוטה")').click(); await sleep(2500);
  const saveMsg = await page.locator('.te-panel .ty-ok, .te-panel .ty-err').first().innerText().catch(() => '');
  ok(!/נכשל|error/i.test(saveMsg), 'שמור טיוטה — בלי שגיאה', saveMsg);
  let rows = await estRows();
  ok(rows.length === 1 && rows[0].status === 'draft' && rows[0].cut === '8', 'נשמרה טיוטה אחת עם חתך אוגוסט', JSON.stringify(rows));
  await page.reload({ waitUntil: 'networkidle' }); await sleep(1500);
  await openEstimate(page);
  const r1 = await page.locator('.te-result').innerText().catch(() => '');
  ok(r1.includes('נתוני אמת עד סוף אוגוסט') && !r1.includes('שינויים שלא נשמרו'), 'אחרי טעינה מחדש — החתך שנשמר, בלי «לא נשמרו»', r1.slice(0, 200));

  // טיוטה מלאה (נתוני ההדגמה) כמשרד — אותו RPC שהמסך קורא לו
  const cur = rows[0];
  const sv = await asUser(OFFICE, `public.save_tax_estimate(${lit(stepId)}, ${lit(DRAFT)}::jsonb, null, '{}'::jsonb, ${lit({ draftId: cur.id, revision: cur.revision })}::jsonb)`);
  ok(sv?.ok === true, 'save_tax_estimate כמשרד (טיוטת ההדגמה)', JSON.stringify(sv));
  await page.reload({ waitUntil: 'networkidle' }); await sleep(1500);
  await openEstimate(page);
  const res = await page.locator('.te-result').innerText();
  const blocked0 = /חסר\n/.test(res.split('הצעד הבא')[0]);
  ok(/מס הכנסה לשנה/.test(res) && !blocked0, 'יש חבות ויתרה — לא «חסר»', res.slice(0, 500));
  ok(await page.locator('#te-authorities').count() === 1 && (await page.locator('#te-authorities').innerText()).includes('תזרים ב-60 הימים'), '«מול הרשויות» עם תזרים');
  await page.locator('#te-authorities').scrollIntoViewIfNeeded(); await page.screenshot({ path: join(SHOTS, 'stg-desktop-1-authorities.png') });
  await noOverflow(page, 'הערכה במחשב');

  const approveBtn = page.locator('.te-panel button:has-text("אשר גרסה")').first();
  if (await approveBtn.isDisabled()) {
    const more = page.locator('.te-panel button:has-text("הצג את כל")'); if (await more.count()) await more.click();
    console.log('    [חוסם]', (await page.locator('.te-blockers').innerText().catch(() => '')).replace(/\n/g, ' | '));
  }
  await approveBtn.click({ timeout: 5000 }); await sleep(3000);
  const msg = await page.locator('.te-panel .ty-ok, .te-panel .ty-err').first().innerText().catch(() => '');
  ok(/אושרה/.test(msg), 'אישור גרסה', msg);
  rows = await estRows();
  const ap = rows.find(r => r.status === 'approved');
  ok(!!ap && ap.has_cash && ap.has_checks && ap.has_al, 'במסד: גרסה מאושרת עם תזרים, יישור ובדיקות', JSON.stringify(rows));
  ok(await page.locator('#te-summary').count() === 1 && await page.locator('#te-followups').count() === 1, 'סיכום ללקוח ומשימות המשך');
  const sum = await page.frameLocator('#te-summary iframe').locator('body').evaluate(el => el.textContent ?? '').catch(() => '');
  ok(sum.includes('מה בדקנו בשבילך') && !/המשרד בדק מול הרשות/.test(sum), 'הסיכום: «מה בדקנו», בלי מצב היישור הפנימי');
  await page.locator('#te-followups').scrollIntoViewIfNeeded(); await page.screenshot({ path: join(SHOTS, 'stg-desktop-2-followups.png') });
  await page.locator('#te-followups button:has-text("פתח משימה")').first().click(); await sleep(1000);
  const dlg = page.locator('[role="dialog"]');
  ok(await dlg.count() > 0, '«פתח משימה» פותח טופס משימה (לא נשמר בבדיקה)');
  if (await dlg.count()) { await page.keyboard.press('Escape'); await sleep(600); }
  if (await dlg.count()) { const c = dlg.first().locator('button:has-text("ביטול")'); if (await c.count()) { await c.click(); await sleep(500); } }

  // ── הדף האישי: לפני פרסום לא רואים; אחרי «פרסם בדף האישי» — הגרסה המאושרת, עם החד־פעמי, ההתאמה והיתרות לפי רשות ──
  const portalText = async (phone) => {
    const c = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 900 }, locale: 'he-IL', ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
    await c.route(`**/*${PROD}*`, r => { blocked.push(r.request().url()); return r.abort(); });
    const p = await c.newPage();
    p.on('pageerror', e => errs.push(`portal: ${e.message}`));
    p.on('response', r => { if (r.status() >= 400) errs.push(`portal: HTTP ${r.status()} ${r.url().replace(/[?#].*/, '')}`); });
    await p.goto(env.portalUrl(), { waitUntil: 'networkidle' }); await sleep(2500);
    return { c, p, body: await p.locator('body').innerText() };
  };
  {
    const pre = await portalText(false);
    ok(!pre.body.includes('הערכת המס לשנת 2026'), 'דף הלקוח: מאושרת ולא מפורסמת — לא מופיעה');
    await pre.c.close();
  }
  if (!(await page.locator('.te-panel').count())) await openEstimate(page);
  await page.evaluate(() => { const d = document.querySelector('#te-summary'); if (d && !d.open) d.querySelector('summary').click(); });
  await page.locator('#te-summary button:has-text("פרסם בדף האישי")').click(); await sleep(2500);
  const pubRow = await env.sql(`select published_at is not null as pub, version from public.tax_estimates where client_id = '${env.clientId}' and status = 'approved'`);
  ok(pubRow[0]?.pub === true, 'פרסום בדף האישי — נרשם במסד (בלי מייל)', JSON.stringify(pubRow));
  for (const phone of [false, true]) {
    const post = await portalText(phone);
    const tag = phone ? 'טלפון' : 'מחשב';
    ok(post.body.includes('הערכת המס לשנת 2026'), `דף הלקוח (${tag}): «הערכת המס לשנת 2026» מופיעה`);
    await post.p.locator('button:has-text("לצפייה בהערכה")').first().click(); await sleep(2500);
    const sumC = await post.p.frameLocator('iframe[title^="הערכת המס"]').locator('body').evaluate(el => el.textContent ?? '').catch(() => '');
    ok(sumC.includes('גרסה 1') && sumC.includes('הרצאה בכנס') && sumC.includes('כיבוד') && sumC.includes('ביטוח לאומי בסוף השנה') && sumC.includes('מה בדקנו בשבילך'),
      `דף הלקוח (${tag}): הגרסה המאושרת עם חד־פעמי, התאמה, יתרה לפי רשות ו«מה בדקנו»`, sumC.slice(0, 300));
    ok(!/המשרד בדק מול הרשות|נקרא מהרשות|הכרעת משרד|actualSource/.test(sumC), `דף הלקוח (${tag}): בלי מצב יישור, הכרעות או מקורות פנימיים`);
    if (phone) await post.p.screenshot({ path: join(SHOTS, 'stg-portal-phone.png') });
    else await post.p.locator('iframe[title^="הערכת המס"]').screenshot({ path: join(SHOTS, 'stg-portal-desktop.png') });
    if (phone) ok(!(await post.p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)), 'דף הלקוח (טלפון): בלי גלילה הצידה');
    await post.c.close();
  }
  // לקוח אחר: אותה בקשה עם טוקן של לקוח אחר — לא נגיש
  const otherTok = await asUser(OFFICE, `public.mint_portal_token('${env.otherClientId}')`);
  const stolen = await env.sql(`select public.portal_tax_estimate(${lit(otherTok)}, ${lit(stepId)}) r`).then(x => x[0]?.r);
  ok(stolen?.ok !== true, 'טוקן של לקוח אחר — ההערכה לא נגישה', JSON.stringify(stolen).slice(0, 120));

  // «ללמוד» וחזרה
  if (!(await page.locator('.te-panel').count())) await openEstimate(page);
  await page.evaluate(() => { document.querySelector('#te-checks').open = true; });
  await page.locator('#te-checks button:has-text("ללמוד את הנושא")').first().click(); await sleep(2000);
  ok(await page.locator('.kn-topic').count() === 1, '«ללמוד» פתח נושא בידע המס');
  await page.locator('button:has-text("חזרה לתיק")').first().click();
  // אחרי 241 התיק טוען יותר לפני «דוחות והצהרות» — מחכים לפאנל עצמו, לא לזמן קבוע
  await page.locator('.te-panel').first().waitFor({ timeout: 15000 }).catch(() => {});
  ok(await page.locator('.te-panel').count() === 1, '«חזרה לתיק» — אותה הערכה נפתחה מחדש');

  await page.reload({ waitUntil: 'networkidle' }); await sleep(1500);
  await openOffice(page);
  ok((await yearLine(page).innerText()).includes('גרסה 1'), '«דוחות והצהרות»: «גרסה 1» אחרי טעינה');
  // ── שילוב עם חבילת האיסוף (241), בדיקה 3: שורה אחת להערכה, «＋ הוסף דוח» נשאר, «＋ הערכת מס» לא כפול ──
  {
    const works = page.locator('[data-section="works"]');
    ok(await works.locator('li[data-work="tax_estimate"]').count() === 1, 'שילוב: «דוחות והצהרות» — שורת הערכה אחת, בלי כפילות');
    ok(await works.locator('button:has-text("הוסף דוח או הצהרת הון")').count() === 1 && await works.locator('button:has-text("＋ הערכת מס")').count() === 0,
      'שילוב: «＋ הוסף דוח או הצהרת הון» קיים; «＋ הערכת מס» לא מוצג כשיש הערכה פתוחה');
  }
  // ── בדיקה 4: דף הלקוח עם השלמת מידע והערכה מפורסמת — שני הפריטים, וכל אחד נפתח למסך הנכון ──
  {
    if (!(await page.locator('.ty-overlay').count())) { await yearLine(page).locator('button:has-text("פתח")').click(); await sleep(2500); }
    const ov = page.locator('.ty-overlay');
    const addQ = ov.getByRole('button', { name: /^הוסף \d+ שאלות/ }).first();
    if (await addQ.waitFor({ timeout: 15000 }).then(() => true).catch(() => false)) { await addQ.click(); await sleep(2500); }
    const ready = ov.locator('section, div').filter({ has: page.locator('h3', { hasText: 'מוכן לדף האישי' }) }).last();
    for (let k = 0; k < 3 && !(await page.locator('.ty-ok').innerText().catch(() => '')).includes('פורסם'); k++) { await ready.getByRole('button', { name: 'פרסם בדף האישי' }).first().click({ timeout: 8000 }).catch(() => {}); await sleep(2000); }
    const infoPub = await env.sql(`select count(*) filter (where published_at is not null)::int pub from public.onboarding_steps where client_id = '${env.clientId}' and step_type = 'info_collection'`);
    ok(infoPub[0]?.pub >= 1, 'שילוב: השלמת המידע להערכה פורסמה בדף האישי (בלי מייל)', JSON.stringify(infoPub));
    for (const phone of [false, true]) {
      const tag = phone ? 'טלפון' : 'מחשב';
      const post = await portalText(phone);
      ok(post.body.includes('הערכת המס לשנת 2026') && /השלמת מידע|שאלות/.test(post.body), `שילוב — דף הלקוח (${tag}): שני הפריטים — הערכה והשלמת מידע`, post.body.slice(0, 300));
      await post.p.locator('button:has-text("לצפייה בהערכה")').first().click(); await sleep(2500);
      ok(await post.p.locator('iframe[title^="הערכת המס"]').count() === 1, `שילוב — דף הלקוח (${tag}): «לצפייה בהערכה» פותח את ההערכה`);
      await post.p.goto(env.portalUrl(), { waitUntil: 'networkidle' }); await sleep(2000);
      const infoBtn = post.p.locator('button, a').filter({ hasText: /לשאלות|להשלמת המידע|ענה|התחל/ }).first();
      if (await infoBtn.count()) { await infoBtn.click(); await sleep(2500); }
      const after = await post.p.locator('body').innerText();
      ok(!after.includes('מקדמות — היום והמלצה') && (await post.p.locator('iframe[title^="הערכת המס"]').count()) === 0 && /שאלה|שאלות|הבא|שמור/.test(after),
        `שילוב — דף הלקוח (${tag}): פריט השלמת המידע פותח את השאלון, לא את ההערכה`, after.slice(0, 200));
      if (phone) await post.p.screenshot({ path: join(SHOTS, 'stg-combined-portal-phone.png') });
      await post.c.close();
    }
    await page.reload({ waitUntil: 'networkidle' }); await sleep(1500);
    await openOffice(page);
  }

  // העתקת פרומפט תחזוקה
  await page.goto(`${BASE}/#/reference`, { waitUntil: 'networkidle' }); await sleep(2000);
  for (const back of ['כל הנושאים', 'ידע מס', 'נושאים']) { if (await page.locator('text="עדכניות ותחזוקה" >> visible=true').count()) break; const l = page.locator(`text="${back}" >> visible=true`).first(); if (await l.count()) { await l.click(); await sleep(700); } }
  await page.locator('text="עדכניות ותחזוקה" >> visible=true').first().click(); await sleep(1000);
  await page.locator('button:has-text("העתק פרומפט — טופס")').first().click(); await sleep(600);
  const note = await page.locator('.kn-copy-note').first().innerText().catch(() => '');
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  ok(note.includes('הועתק') && clip.length > 400 && clip.includes('1301'), 'העתקת פרומפט «טופס לשנה חדשה» — הועתק ללוח', `${note} | ${clip.length}`);
  await page.locator('#mt-newform').scrollIntoViewIfNeeded(); await page.screenshot({ path: join(SHOTS, 'stg-desktop-3-maintenance.png') });
  await ctx.close();

  // הרשאות
  const stranger = '00000000-0000-4000-8000-0000000000ab';
  const seen = await asUser(stranger, `(select count(*) from public.tax_estimates where client_id = '${env.clientId}')`);
  ok(Number(seen) === 0, 'משתמש אחר לא רואה את ההערכה (RLS)', seen);
  const steal = await asUser(stranger, `public.save_tax_estimate(${lit(stepId)}, ${lit(DRAFT)}::jsonb, null, '{}'::jsonb, '{}'::jsonb)`).catch(e => ({ ok: false, error: e.message }));
  ok(steal?.ok !== true, 'משתמש אחר לא יכול לשמור הערכה ללקוח', JSON.stringify(steal).slice(0, 200));
  const anon = await env.sql(`begin; set local role anon; select count(*)::int n from public.tax_estimates; commit;`).then(x => x[0]?.n).catch(e => `err:${e.message.slice(0, 80)}`);
  ok(anon === 0 || String(anon).startsWith('err:'), 'anon לא קורא הערכות', anon);
  const other = await env.sql(`select count(*)::int n from public.tax_estimates where client_id = '${env.otherClientId}'`);
  ok(other[0]?.n === 0, 'הלקוח השני לא קיבל דבר (בידוד)');

  // טלפון
  console.log('== טלפון 390');
  const ph = await newCtx(true);
  await openEstimate(ph.page);
  ok(await ph.page.locator('.te-panel').count() === 1, 'טלפון: ההערכה המאושרת נפתחת');
  ok(await ph.page.locator('#te-authorities').count() === 1, 'טלפון: «מול הרשויות»');
  await ph.page.locator('#te-authorities').scrollIntoViewIfNeeded(); await ph.page.screenshot({ path: join(SHOTS, 'stg-phone-1-authorities.png') });
  await noOverflow(ph.page, 'טלפון: הערכה');
  await ph.page.goto(`${BASE}/#/reference`, { waitUntil: 'networkidle' }); await sleep(1500);
  await noOverflow(ph.page, 'טלפון: ידע מס');
  await ph.page.screenshot({ path: join(SHOTS, 'stg-phone-2-knowledge.png') });
  await ph.ctx.close();
} catch (e) {
  ok(false, 'הריצה נעצרה', e.stack ?? e.message);
} finally {
  await browser.close();
  await env.sql(`delete from public.tax_estimates where client_id in ('${env.clientId}','${env.otherClientId}')`).catch(e => console.log('  ✗ מחיקת הערכות', e.message));
  const c = await env.cleanup();
  ok(c.left === 0 && !c.storageLeft, 'ניקוי: אין שאריות של לקוח הבדיקה', JSON.stringify(c));
  ok(blocked.length === 0, 'אין פניות לייצור', blocked.slice(0, 2).join(' | '));
  if (authLog.length) { const t0 = authLog[0].t; console.log('    [ראיות 401/auth]'); for (const a of authLog) console.log('     ', JSON.stringify({ ...a, t: a.t - t0 })); }
  // ‼ 14.10.2026 · PGRST303 «JWT issued at future» — הניסיון החוזר של jwtClockSkewRetry (חבילת האיסוף) אמור להחזיר תשובה תקינה לאותה כתובת
  const skew = authLog.filter(a => a.kind === '401' && /PGRST303|issued at future/.test(a.body ?? ''));
  if (skew.length) ok(skew.every(a => okLog.some(o => o.url === a.url && o.t >= a.t && o.t - a.t < 8000)), `401 שעון (PGRST303) — ${skew.length} מקרים, כולם הוחזרו בניסיון החוזר`, JSON.stringify(skew.map(a => a.url)));
  const skewUrls = new Set(skew.map(a => a.url));
  const realErrs = errs.filter(e => !/favicon/.test(e) && !(skew.length && /Failed to load resource: the server responded with a status of 401/.test(e)) && ![...skewUrls].some(u => e.includes('HTTP 401') && e.includes(u)));
  ok(realErrs.length === 0, 'בלי שגיאות בקונסול', realErrs.slice(0, 4).join(' | '));
  console.log(`\n${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
}
