#!/usr/bin/env node
/**
 * id-upload-flex.mjs — העלאת תעודת זהות גמישה (16.10.2026) מול המסד האמיתי של staging, בדפדפן.
 *
 *   STAGING_ENV_DIR=<תיקייה עם .env.staging ו-.env.local> node scripts/e2e/id-upload-flex.mjs --base=http://localhost:5327 [--vp=desktop|mobile] [--shots=<dir>] [--dark]
 *
 * המסלול: הדף האישי של הלקוח («צילום תעודת זהות» ⇒ «העלאה»): קדמי בלבד ⇒ «עוד חסר: אחורי, ספח» והאישור כבוי;
 * קדמי+ספח ואחורי ⇒ שלם ⇒ «אישור ושליחה» ⇒ הפריט נסגר; בן/בת הזוג: תמונה אחת של הכול ⇒ שלם. בשרת: מסמך אחד לכל אדם
 * עם ההרכב בהערה, הרישום על בקשת הייצוג (238), ובניית ה-PDF ברקע (211) מגיעה ל«מוכן». טופס הייצוג (?onboard=) של
 * לקוח שני: אותו בוחר, ההרכב נשמר על הרשומה. במשרד: מרכז הייצוג מציע את אותה העלאה (צילום למדריך, גם כהה).
 * ‼ לקוחות בדיקה חדשים לכל ריצה (staging-session.mjs), נמחקים בסוף. בלי מיילים. כל פנייה שאינה ל-staging/localhost נחסמת.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d);
const BASE = arg('base', 'http://localhost:5327');
const VP = arg('vp', 'desktop');
const SHOTS = arg('shots', '');
const DARK = process.argv.includes('--dark');
const STAGING = 'evdfxjqrkgugssfrdoxd';
const ROOT = resolve(process.cwd());
const { PDFDocument } = createRequire(join(ROOT, 'package.json'))('pdf-lib');
const { chromium } = createRequire('C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json')('playwright-core');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(info).slice(0, 400)}` : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const env = await (await import('./staging-session.mjs')).prepare();
const { sql, clientId: A, otherClientId: B } = env;
const one = async (q) => (await sql(q))[0];
const tag = `${VP}${DARK ? '-dark' : ''}`;
const OFFICE = 'ca158d52-5ad7-47f5-b228-4b7703978b84';
console.log(`לקוחות בדיקה: ${env.run} (${A.slice(0, 8)}… / ${B.slice(0, 8)}…) · ${tag}`);

// ── תמונות דמה: PNG קטן בצבע אחיד — לא צילום אמיתי ──
const png = (name, rgb) => {
  const zlib = createRequire(import.meta.url)('node:zlib');
  const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const W = 120, H = 76;
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(W * 3, 0).map((_, i) => rgb[i % 3])]);
  return { name, mimeType: 'image/png', buffer: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: H }, () => row)))), chunk('IEND', Buffer.alloc(0))]) };
};

// ── נתוני הבדיקה: בקשת ייצוג לכל לקוח (הבנייה ברקע ו-238 נשענות עליה) + פריט «צילום תעודת זהות» בדף של A ──
const RUN = env.run.toLowerCase();
const REQ_A = `idflex-${RUN}-a`, REQ_B = `idflex-${RUN}-b`;
const TOK_B = `idflex-tok-${RUN}-${Math.random().toString(36).slice(2, 10)}`;
const lit = (v) => `$q$${typeof v === 'string' ? v : JSON.stringify(v)}$q$`;
await sql(`
  insert into public.representation_requests
    (id, user_id, linked_client_id, client_name, client_email, authorities, status, onboarding_token, onboarding_status, signers, scope, prefill, identification)
  values
    ('${REQ_A}', '${OFFICE}', '${A}', 'דוד ${env.run}-A', 'delivered@resend.dev', '{incomeTax}', 'pending_fill', 'idflex-tok-${RUN}-a', 'pending',
     '[{"id":"client","role":"client","name":"דוד","email":"delivered@resend.dev","signStatus":"pending","signToken":"idflex-sign-${RUN}-a"}]'::jsonb,
     '{"incomeTax":{"status":"primary"}}'::jsonb, '{}'::jsonb, '{}'::jsonb),
    ('${REQ_B}', '${OFFICE}', '${B}', 'דוד ${env.run}-B', 'delivered@resend.dev', '{incomeTax}', 'pending_fill', '${TOK_B}', 'pending',
     '[{"id":"client","role":"client","name":"דוד","email":"delivered@resend.dev","signStatus":"pending","signToken":"idflex-sign-${RUN}-b"}]'::jsonb,
     '{"incomeTax":{"status":"primary"}}'::jsonb, '{"firstName":"דוד","lastName":"${env.run}-B"}'::jsonb,
     ${lit({ draft: { step: 3, values: { firstName: 'דוד', lastName: `${env.run}-B`, idNumber: '000000018', birthDate: '1980-01-01', secondaryType: 'parentId', secondaryValue: '000000026', familyStatus: 'single' } } })}::jsonb);
  update public.clients set family_status = 'single', spouse_first_name = null where id = '${B}';
  insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values ('${OFFICE}', '${A}', 'client_documents', 'tools', 'person', 'waiting_client', 'client',
    ${lit({ checklist: [
      { key: 'id_card', label: 'צילום תעודת זהות', done: false },
      { key: 'id_card_spouse', label: 'צילום תעודת זהות של רחל', done: false },
    ] })}::jsonb, now());`);
const docsStepId = (await one(`select id from public.onboarding_steps where client_id = '${A}' and step_type = 'client_documents'`)).id;
ok(!!docsStepId, 'פריטי «צילום תעודת זהות» (לקוח ובת זוג) פורסמו בדף של A', docsStepId);

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false, args: ['--headless=new'] });
const consoleErrors = [], blocked = [];
let curPage = null;
const mobile = VP !== 'desktop';
const vpSize = mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 };
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
  curPage = page;
  page.on('console', m => { if (m.type() === 'error' && !/favicon|ResizeObserver|401|JWT|PGRST303/.test(m.text())) consoleErrors.push(`${tag}: ${m.text().slice(0, 240)}`); });
  page.on('request', r => { if (r.url().includes('/functions/v1/')) console.log(`    ↳ ${new Date().toISOString().slice(11,19)} יוצא: ${r.url().split('/functions/v1/')[1]}`); });
  page.on('response', async r => { if (r.url().includes('/functions/v1/')) console.log(`    ↳ ${new Date().toISOString().slice(11,19)} ${r.request().method()} ${r.url().split('/functions/v1/')[1]} → ${r.status()} ${(await r.text().catch(() => '')).slice(0, 300)}`); });
  page.on('requestfailed', r => { if (r.url().includes('/functions/v1/')) console.log(`    ↳ נכשל: ${r.url().split('/functions/v1/')[1]} ${r.failure()?.errorText}`); });
  page.on('pageerror', e => consoleErrors.push(`${tag} pageerror: ${String(e).slice(0, 240)}`));
  return { ctx, page };
}
// ‼ לצד כל צילום נשמרים מיקומי האלמנטים המסומנים במדריך (JSON, פיקסלים של הצילום) — הסימונים נמדדים, לא נאמדים בעין
const MARK_SELECTORS = ['[data-testid="id-flex-picker"] .idf-lead', '[data-testid="id-flex-picker"] .idf-add', '[data-testid="id-flex-picker"] .idf-files',
  '[data-testid="idf-tag"]', '[data-testid="idf-missing"]', '[data-testid="idf-complete"]', '[data-testid="id-confirm"]', '[data-testid="id-flex-picker"] .idf-kind',
  '[data-testid="identity-doc-attach"]', '[data-testid="rc-doc-id"] .rc-doc-line', '.idf-file:nth-of-type(1) select', '.idf-file:nth-of-type(2) select'];
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
const picker = (page) => page.locator('[data-testid="id-flex-picker"]').first();
const tagsOf = (page) => page.locator('[data-testid="idf-tag"]').evaluateAll(els => els.map(e => e.value));
const confirmDisabled = (page) => page.locator('[data-testid="id-confirm"]').isDisabled();
const scrollTo = async (page, loc) => { await loc.scrollIntoViewIfNeeded().catch(() => {}); await sleep(150); };

try {
  // ═══ 1 · הדף האישי של A — הלקוח ═══
  const { ctx: pctx, page } = await newContext(true);
  await page.goto(env.portalUrl(), { waitUntil: 'networkidle' });
  // «מסמכים שביקשנו» מקופל בדף — «המשך העלאה» פותח את הרשימה
  const expand = page.getByText(/המשך העלאה|להעלאה/).first();
  if (await expand.waitFor({ timeout: 15000 }).then(() => true).catch(() => false)) await expand.click();
  const idItem = page.locator('li', { hasText: 'צילום תעודת זהות' }).filter({ hasNot: page.locator('text=של רחל') }).first();
  await idItem.waitFor({ timeout: 30000 });
  ok(true, '1 הדף האישי נפתח עם «צילום תעודת זהות»');
  await idItem.getByRole('button', { name: 'העלאה' }).click();
  await picker(page).waitFor({ timeout: 10000 });
  ok(/צלמו או העלו איך שנוח/.test(await picker(page).locator('.idf-lead').textContent()), '1 הבוחר נפתח: «צלמו או העלו איך שנוח…»');
  ok((await page.locator('.idf-kind button').allTextContents()).join('|') === 'תעודת זהות|רישיון נהיגה', '1 בחירה «תעודת זהות / רישיון נהיגה» (הפריט מקבל את שניהם)');
  ok(await confirmDisabled(page), '1 בלי תמונות — «אישור ושליחה» כבוי');
  await shot(page, 'portal-empty');

  // קדמי בלבד
  await page.locator('[data-testid="idf-file"]').setInputFiles(png('front.png', [200, 90, 90]));
  await page.locator('[data-testid="idf-missing"]').waitFor({ timeout: 5000 });
  ok((await tagsOf(page)).join(',') === 'front', '1 תמונה ראשונה — ברירת המחדל «צד קדמי»');
  ok((await page.locator('[data-testid="idf-missing"]').textContent()).trim() === 'עוד חסר: אחורי, ספח', '1 קדמי בלבד ⇒ «עוד חסר: אחורי, ספח»');
  ok(await confirmDisabled(page), '1 קדמי בלבד — האישור עדיין כבוי');
  await scrollTo(page, picker(page));
  await shot(page, 'portal-missing');

  // קדמי+ספח ואחורי: מחליפים את התג של הראשונה ומוסיפים אחורי
  await page.locator('[data-testid="idf-tag"]').first().selectOption('frontAppendix');
  ok((await page.locator('[data-testid="idf-missing"]').textContent()).trim() === 'עוד חסר: אחורי', '1 «קדמי + ספח יחד» ⇒ נשאר רק אחורי');
  await page.locator('[data-testid="idf-file"]').setInputFiles(png('back.png', [90, 90, 200]));
  await page.locator('[data-testid="idf-complete"]').waitFor({ timeout: 5000 });
  ok((await tagsOf(page)).join(',') === 'frontAppendix,back', '1 התמונה השנייה קיבלה «צד אחורי» (מה שחסר)');
  ok(/הסט שלם: קדמי, אחורי וספח/.test(await page.locator('[data-testid="idf-complete"]').textContent()), '1 קדמי+ספח ואחורי ⇒ «הסט שלם»');
  ok(!(await confirmDisabled(page)), '1 הסט שלם — «אישור ושליחה» פעיל');
  ok(await page.locator('[data-testid="idf-missing"]').count() === 0, '1 אין יותר שבב «עוד חסר»');
  await scrollTo(page, picker(page));
  await shot(page, 'portal-complete');

  // הסרה מחזירה את החוסר
  await page.locator('.idf-file').nth(1).getByRole('button', { name: 'הסרה' }).click();
  ok((await page.locator('[data-testid="idf-missing"]').textContent().catch(() => '')).trim() === 'עוד חסר: אחורי', '1 הסרת האחורי ⇒ «עוד חסר: אחורי» חוזר');
  await page.locator('[data-testid="idf-file"]').setInputFiles(png('back2.png', [90, 90, 200]));
  await page.locator('[data-testid="idf-complete"]').waitFor({ timeout: 5000 });

  // אישור ושליחה ⇒ PDF אחד ⇒ הפריט נסגר
  const docsBefore = (await one(`select count(*)::int n from public.documents where client_id = '${A}'`)).n;
  const t0 = Date.now();
  console.log(`    ↳ ${new Date().toISOString().slice(11,19)} לחיצה על «אישור ושליחה»`);
  await page.locator('[data-testid="id-confirm"]').click();
  const doneA = await page.waitForFunction(() => { const li = [...document.querySelectorAll('li')].find(l => /צילום תעודת זהות/.test(l.textContent ?? '') && !/של רחל/.test(l.textContent ?? '')); return li && !li.querySelector('[data-testid="id-flex-picker"]') && /✓/.test(li.textContent ?? ''); }, null, { timeout: 180000 }).then(() => true).catch(() => false);
  ok(doneA, `1 הפריט נסגר בדף אחרי האישור (${((Date.now() - t0) / 1000).toFixed(1)} שנ׳)`);
  await sleep(800);
  const docsA = await sql(`select file_name, file_type, notes, category from public.documents where client_id = '${A}' order by uploaded_at`);
  ok(docsA.length === docsBefore + 1, '1 מסמך אחד נוסף לתיק (PDF אחד, לא שתי תמונות)', JSON.stringify(docsA));
  const d1 = docsA[docsA.length - 1] ?? {};
  ok(d1.file_type === 'application/pdf' && /\.pdf$/.test(d1.file_name ?? ''), '1 הקובץ שנשמר הוא PDF', JSON.stringify(d1));
  ok(/עמודים: קדמי\+ספח · אחורי/.test(d1.notes ?? ''), '1 ההרכב נשמר ליד המסמך: «עמודים: קדמי+ספח · אחורי»', d1.notes);
  ok(d1.category === 'id_card', '1 הקטגוריה: תעודה מזהה', d1.category);
  const chk = (await one(`select payload->'checklist' as c from public.onboarding_steps where id = '${docsStepId}'`)).c;
  ok(chk?.find(x => x.key === 'id_card')?.done === true, '1 הפריט «צילום תעודת זהות» נסגר בדף', JSON.stringify(chk));
  ok(await idItem.locator('[data-testid="id-flex-picker"]').count() === 0, '1 בדף: הבוחר נסגר אחרי ההעלאה');
  await shot(page, 'portal-done');

  // ═══ 2 · בת הזוג — תמונה אחת של הכול ═══
  const spItem = page.locator('li', { hasText: 'צילום תעודת זהות של רחל' }).first();
  await spItem.getByRole('button', { name: 'העלאה' }).click();
  await picker(page).waitFor({ timeout: 10000 });
  await page.locator('[data-testid="idf-file"]').setInputFiles(png('all.png', [120, 180, 120]));
  await page.locator('[data-testid="idf-missing"]').waitFor({ timeout: 5000 });
  await page.locator('[data-testid="idf-tag"]').first().selectOption('all');
  await page.locator('[data-testid="idf-complete"]').waitFor({ timeout: 5000 });
  ok(!(await confirmDisabled(page)), '2 תמונה אחת מתויגת «הכול יחד» ⇒ הסט שלם, האישור פעיל');
  await scrollTo(page, picker(page));
  await shot(page, 'portal-all-in-one');
  await page.locator('[data-testid="id-confirm"]').click();
  const t1 = Date.now();
  // ‼ אחרי הפריט האחרון הבקשה כולה מושלמת — הדף מציג «2 מתוך 2 התקבלו» (או ✓ על הפריט), והבוחר נעלם
  const doneS = await page.waitForFunction(() => { if (document.querySelector('[data-testid="id-flex-picker"]')) return false; const t = document.body.innerText; return /2 מתוך 2 התקבלו|שכבר הושלם|שכבר הושלמו/.test(t) || [...document.querySelectorAll('li')].some(l => /צילום תעודת זהות של רחל/.test(l.textContent ?? '') && /✓/.test(l.textContent ?? '')); }, null, { timeout: 60000 }).then(() => true).catch(() => false);
  ok(doneS, `2 פריט בת הזוג נסגר אחרי האישור (${((Date.now() - t1) / 1000).toFixed(1)} שנ׳)`);
  if (!doneS && SHOTS) await page.screenshot({ path: join(SHOTS, `fail-spouse-${tag}.png`), fullPage: true }).catch(() => {});
  if (!doneS) console.log('  · טקסט הדף:', (await page.innerText('body').catch(() => '')).replace(/s+/g, ' ').slice(0, 900));
  await sleep(800);
  const d2 = await one(`select notes from public.documents where client_id = '${A}' order by uploaded_at desc limit 1`);
  ok(/עמודים: הכול יחד/.test(d2?.notes ?? ''), '2 ההרכב של בת הזוג: «עמודים: הכול יחד»', d2?.notes);
  const stepRow = await one(`select status, ball from public.onboarding_steps where id = '${docsStepId}'`);
  ok(stepRow?.status === 'completed' && stepRow?.ball === 'me', '2 שני הפריטים התקבלו ⇒ הבקשה הושלמה והכדור חזר למשרד', JSON.stringify(stepRow));

  // ═══ 3 · בשרת: הרישום על בקשת הייצוג (238), והקובץ שנשמר הוא PDF תקין שהבנייה ברקע (211) מקבלת כמות שהוא ═══
  const idd = (await one(`select identity_docs from public.representation_requests where id = '${REQ_A}'`)).identity_docs ?? {};
  ok((idd.client ?? []).length === 1 && (idd.spouse ?? []).length === 1, '3 הצילומים נרשמו על בקשת הייצוג — אחד לכל אדם', JSON.stringify(idd).slice(0, 300));
  ok(!!idd.client?.[0]?.clientConfirmedAt && !!idd.spouse?.[0]?.clientConfirmedAt, '3 העלאה של הלקוח = האישור שלו (238)');
  // ‼ 211: PDF יחיד לאדם הוא עצמו המסמך — אין בנייה נוספת ברקע (sync_document_pdf_builds מדלג). בודקים שהבחירה
  //   לשע״ם מוצאת אותו, שהוא «בר-המרה», ושהקובץ באחסון הוא PDF אמיתי עם מספר העמודים הנכון (2 ואז 1).
  const sel = (person) => one(`select public.shaam_identity_documents_for('${A}', '${person}', 'idOrLicense') as s, public._shaam_docs_convertible(public.shaam_identity_documents_for('${A}', '${person}', 'idOrLicense')) as c`);
  const selC = await sel('client'), selS = await sel('spouse');
  ok(selC?.s?.documents?.length === 1 && selC.c === true, '3 הבחירה לשע״ם (לקוח): מסמך אחד, בר-המרה', JSON.stringify(selC));
  ok(selS?.s?.documents?.length === 1 && selS.c === true, '3 הבחירה לשע״ם (בת זוג): מסמך אחד, בר-המרה', JSON.stringify(selS));
  await sql(`select public.sync_document_pdf_builds('${REQ_A}')`);
  const builds = await sql(`select person, status from public.document_pdf_builds where request_id = '${REQ_A}'`);
  ok(builds.length === 0, '3 הבנייה ברקע (211) מקבלת את ה-PDF כמות שהוא — אין בנייה נוספת', JSON.stringify(builds));
  const pages = async (path) => {
    const r = await fetch(`${env.storageUrl}/object/client-documents/${path}`, { headers: env.serviceHeaders });
    const buf = Buffer.from(await r.arrayBuffer());
    const head = buf.subarray(0, 5).toString('latin1');
    if (SHOTS) writeFileSync(join(SHOTS, `dump-${path.split('/').pop()}.pdf`), buf);
    // ‼ ספירת עמודים עם pdf-lib (הטקסט הגולמי דחוס — חיפוש «/Type /Page» לא מוצא כלום)
    let n = -1, err = '';
    try { n = (await PDFDocument.load(buf, { ignoreEncryption: true })).getPageCount(); } catch (e) { err = String(e?.message ?? e).slice(0, 120); }
    return { ok: r.ok, head, n, bytes: buf.length, ...(err ? { err } : {}) };
  };
  const pC = await pages(selC.s.documents[0].storagePath), pS = await pages(selS.s.documents[0].storagePath);
  ok(pC.ok && pC.head === '%PDF-' && pC.n === 2, '3 הקובץ של הלקוח: PDF אמיתי עם 2 עמודים (קדמי+ספח, אחורי)', JSON.stringify(pC));
  ok(pS.ok && pS.head === '%PDF-' && pS.n === 1, '3 הקובץ של בת הזוג: PDF אמיתי עם עמוד אחד (הכול יחד)', JSON.stringify(pS));
  await pctx.close();

  // ═══ 4 · טופס הייצוג (?onboard=) של B — צעד «צילום התעודות» ═══
  const { ctx: octx, page: op } = await newContext(true);
  await op.goto(`${BASE}/?onboard=${TOK_B}`, { waitUntil: 'networkidle' });
  await op.getByText('צילום התעודות').first().waitFor({ timeout: 30000 });
  ok(true, '4 טופס הייצוג נפתח בצעד «צילום התעודות»');
  await picker(op).waitFor({ timeout: 10000 });
  await op.locator('[data-testid="idf-file"]').setInputFiles([png('f.png', [200, 90, 90]), png('b.png', [90, 90, 200]), png('s.png', [120, 180, 120])]);
  await op.locator('[data-testid="idf-complete"]').waitFor({ timeout: 5000 });
  ok((await tagsOf(op)).join(',') === 'front,back,appendix', '4 שלוש תמונות יחד ⇒ קדמי, אחורי, ספח לפי הסדר');
  await scrollTo(op, picker(op));
  await shot(op, 'onboard-complete');
  await op.locator('[data-testid="id-confirm"]').click();
  await op.locator('text=/✓ .*\\.pdf/').first().waitFor({ timeout: 60000 }).catch(() => {});
  await sleep(500);
  const iddB = (await one(`select identity_docs from public.representation_requests where id = '${REQ_B}'`)).identity_docs ?? {};
  const eB = iddB.client?.[0];
  ok(!!eB?.documentId, '4 הצילום נרשם על בקשת הייצוג של B', JSON.stringify(iddB).slice(0, 200));
  ok(Array.isArray(eB?.parts) && eB.parts.map(p => p.tag).join(',') === 'front,back,appendix', '4 ההרכב נשמר על הרשומה: קדמי, אחורי, ספח', JSON.stringify(eB?.parts));
  const dB = await one(`select notes, file_type from public.documents where client_id = '${B}' order by uploaded_at desc limit 1`);
  ok(dB?.file_type === 'application/pdf' && /עמודים: קדמי · אחורי · ספח/.test(dB?.notes ?? ''), '4 מסמך PDF אחד עם ההרכב בהערה', JSON.stringify(dB));
  await shot(op, 'onboard-done');
  await octx.close();

  // ═══ 5 · המשרד: מרכז ביצוע הייצוג של A (‎#/request/<id>‎) — ההרכב מוצג ליד הקובץ (צילום למדריך) ═══
  // ‼ מרכז הייצוג מוצג אחרי שהלקוח מילא את הטופס — מדמים את זה בשרת (המסמכים כבר רשומים על הבקשה)
  await sql(`update public.representation_requests set status = 'awaiting_accountant', onboarding_status = 'submitted',
    identification = '{"firstName":"דוד","lastName":"${env.run}-A","idNumber":"000000018","birthDate":"1980-01-01","secondaryType":"parentId","secondaryValue":"000000026"}'::jsonb where id = '${REQ_A}';
    update public.clients set representation_request_id = '${REQ_A}', representation_status = 'awaiting_accountant' where id = '${A}'`);
  const { ctx: wctx, page: wp } = await newContext(false);
  await wp.goto(`${BASE}/#/request/${REQ_A}`, { waitUntil: 'networkidle' });
  const line = wp.locator('[data-testid="rc-doc-id"] .rc-doc-line').first();
  const hasLine = await line.waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
  const lineText = hasLine ? await line.textContent().catch(() => '') : '';
  ok(hasLine && lineText.includes('קדמי+ספח · אחורי'), '5 במרכז הייצוג: «צילום · קדמי+ספח · אחורי» ליד הקובץ של דוד', hasLine ? lineText : 'אין שורה');
  const line2 = wp.locator('[data-testid="rc-doc-id"] .rc-doc-line').nth(1);
  const t2 = await line2.textContent().catch(() => '');
  ok(/הכול יחד/.test(t2), '5 במרכז הייצוג: «צילום · הכול יחד» ליד הקובץ של רחל', t2);
  if (!hasLine) console.log('  · טקסט הדף:', (await wp.innerText('body').catch(() => '')).replace(/s+/g, ' ').slice(0, 700));
  await scrollTo(wp, line);
  await shot(wp, 'office-composition');
  await wctx.close();
  // ═══ 6 · ערכת המשרד הכהה: דף הבדיקה הפנימי (?test-id-flex) — הבוחר עם תמונות, ללא שליחה ═══
  const dctx = await browser.newContext({ viewport: vpSize, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'he-IL', colorScheme: 'dark' });
  await dctx.addInitScript(() => { try { localStorage.setItem('pivo_theme', 'dark'); } catch { /* */ } });
  await dctx.route('**/*', (route) => { const u = route.request().url(); const host = new URL(u).hostname;
    if (/fonts.(googleapis|gstatic).com/.test(u)) return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
    if (host === 'localhost' || host === `${STAGING}.supabase.co` || u.startsWith('data:') || u.startsWith('blob:')) return route.continue(); blocked.push(u); return route.abort(); });
  const dp = await dctx.newPage();
  await dp.goto(`${BASE}/?test-id-flex=1`, { waitUntil: 'networkidle' });
  const first = dp.locator('[data-kind="idOrLicense"] [data-testid="id-flex-picker"]');
  await first.waitFor({ timeout: 20000 });
  await first.locator('[data-testid="idf-file"]').setInputFiles([png('d-front.png', [200, 90, 90]), png('d-back.png', [90, 90, 200])]);
  await first.locator('[data-testid="idf-missing"]').waitFor({ timeout: 5000 });
  const bg = await dp.evaluate(() => getComputedStyle(document.querySelector('.idf-file')).backgroundColor);
  const ink = await dp.evaluate(() => getComputedStyle(document.querySelector('.idf-lead')).color);
  const lum = (c) => { const m = c.match(/[0-9]+/g) ?? [0, 0, 0]; return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
  ok(lum(bg) < 0.3 && lum(ink) > 0.5, `6 ערכה כהה: כרטיס התמונה כהה (${bg}) וטקסט בהיר (${ink})`);
  ok((await first.locator('[data-testid="idf-missing"]').textContent()).trim() === 'עוד חסר: ספח', '6 ערכה כהה: קדמי ואחורי ⇒ «עוד חסר: ספח»');
  await scrollTo(dp, first);
  await dp.screenshot({ path: SHOTS ? join(SHOTS, `office-dark-${tag}.png`) : undefined }).catch(() => {});
  await dctx.close();
} catch (e) {
  ok(false, `חריגה: ${e?.message ?? e}`);
  if (curPage && !curPage.isClosed()) {
    console.log('  · כתובת:', curPage.url());
    console.log('  · טקסט הדף:', (await curPage.innerText('body').catch(() => '')).replace(/s+/g, ' ').slice(0, 1500));
    if (SHOTS) await curPage.screenshot({ path: join(SHOTS, `fail-${tag}.png`), fullPage: true }).catch(() => {});
  }
} finally {
  await browser.close();
  ok(consoleErrors.length === 0, 'אין שגיאות קונסול', consoleErrors.join(' | '));
  ok(blocked.length === 0, 'אף פנייה לא יצאה מחוץ ל-staging/localhost', blocked.slice(0, 3).join(' | '));
  // ניקוי: הבקשות והבניות (אין להן client_id ישיר), ואז הניקוי הכללי של staging-session
  await sql(`delete from public.document_pdf_builds where request_id in ('${REQ_A}','${REQ_B}');
    delete from public.representation_requests where id in ('${REQ_A}','${REQ_B}');
    delete from public.document_organize_log where folder_client_id in ('${A}','${B}') or doc_id in (select id from public.documents where client_id in ('${A}','${B}'));
    delete from public.document_folders where client_id in ('${A}','${B}');`).catch(e => console.log('  ! ניקוי בקשות:', e.message));
  const left = await env.cleanup();
  ok(left.left === 0 && left.storageLeft === 0, `ניקוי: 0 שאריות (${left.files} קבצים נמחקו מהאחסון)`, JSON.stringify(left));
  console.log(`\n${pass} עברו, ${fail} נכשלו · ${tag}`);
  process.exit(fail ? 1 : 0);
}
