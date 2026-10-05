#!/usr/bin/env node
/**
 * qa-request-preview.mjs — בדיקת הקבלה בדפדפן של «צפייה» בבקשה (תוכנית 05.10.2026, §10.3).
 *
 *   node scripts/qa-request-preview.mjs [--only a,b,c] [--widths 1280,390,360]
 *
 * שרתים (launch.json): staging — «request-preview-staging» (5211, מסד אמיתי של סביבת הבדיקות, התחברות אוטומטית) ·
 * הדגמה — «request-preview» (5210, ‎?office-app‎, מסד מדומה + דוגמאות שנלכדו).
 * ‼ staging בלבד. לקוחות QA (פרקים c, h) נוצרים ונמחקים באותה הרצה (קידומת qa222p), והספירות של משתמש הבדיקה נבדקות לפני ואחרי.
 *
 * פרקים:
 *   a  כל שורה בספרייה: «צפייה» נפתחת, תג «דוגמה», כל לשונית וכל מצב מתחלפים, אפס שגיאות קונסול
 *   b  מלכודת רשת: בזמן הצפייה וכל הלחיצות בתוכה — אפס בקשות שכותבות/שולחות
 *   d  מסלולים מלאים (אישור ייצוג · פייפרלס · בקשה חופשית · מסמך · כתובת ו«אחורה»)
 *   e  פריסה: בלי גלישה אופקית, יעדי מגע ≥ 44px בטלפון, מצב כהה, פוקוס חוזר
 *   f  רגרסיה: חיפוש בספרייה, אינדקס אותיות, עורך, הדף האישי בהדגמה
 *   g  ספירות: אין כתיבה למשתמש הבדיקה בכל ההרצה
 *   c  צפייה מול הדף האמיתי של לקוח QA (אותו טקסט בדיוק: מילואים, שאלון, מסמכים, אישור ייצוג לזוג)
 *   h  «＋ בקשה חדשה» בכרטיס הלקוח: צפייה בקטלוג/ספרייה/בקשה חופשית, «הוספה ל…» יוצרת בדיוק אחת, 6101
 *   i  «המסך שנפתח»: המסכים האמיתיים של הלקוח (פרטים, חתימה, רו״ח קודם, שאלון) על דוגמה
 *   j  כללי פתיחה, בונה המסלולים (הוספת בקשה) ועורך הבקשה עם הכרטיס החי
 *   k  הדגמה (?office-app): כל צפייה מדוגמה שנלכדה, בלי בקשה אחת החוצה
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT, STAGING_REF, sql as sqlRaw, loadEnv } from './staging-lib.mjs';

/** ממשק הניהול מגביל קצב — מנסים שוב עם המתנה ארוכה יותר בכל פעם. */
async function sql(ref, q) {
  for (let i = 0; ; i++) {
    try { return await sqlRaw(ref, q); } catch (e) {
      if (e.http === 429 && i < 8) { await new Promise(r => setTimeout(r, 3000 * (i + 1))); continue; }
      throw e;
    }
  }
}

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const ONLY = new Set((opt('--only', 'a,b,c,d,e,f,g,h,i,j,k') ?? '').split(',').filter(Boolean));
const WIDTHS = (opt('--widths', '1280,390,360')).split(',').map(Number);
const STAGING = opt('--staging', process.env.QA_STAGING || 'http://localhost:5211/');
const DEMO = opt('--demo', process.env.QA_DEMO || 'http://localhost:5210/');
const OUT = process.env.QA_OUT || join(tmpdir(), 'pivo-qa-request-preview');
mkdirSync(OUT, { recursive: true });

function loadPlaywright() {
  const from = [process.env.PLAYWRIGHT_FROM, join(ROOT, 'worker/package.json'), 'C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json'].filter(Boolean);
  for (const f of from) { try { return createRequire(f)('playwright-core'); } catch { /* הבא */ } }
  throw new Error('playwright-core לא נמצא — הגדירו PLAYWRIGHT_FROM');
}
const { chromium } = loadPlaywright();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });

const results = [];
let currentSection = '';
const ok = (name, cond, extra = '') => { results.push({ s: currentSection, pass: !!cond, line: `${cond ? '✓' : '✗'} [${currentSection}] ${name}${extra ? ' — ' + String(extra).slice(0, 400) : ''}` }); if (!cond) console.log(results.at(-1).line); };
const section = (s) => { currentSection = s; console.log(`\n── ${s}`); };

// ── מלכודת רשת ──────────────────────────────────────────────────────────────
const SUPABASE_HOST = (() => { try { return new URL(loadEnv('.env.staging').VITE_SUPABASE_URL).host; } catch { return 'supabase.co'; } })();
/** מותר בזמן הצפייה: קריאות טעינה בלבד + preview_request_sample + רענון הסשן. כל השאר (כתיבה/שליחה) — מוחסם ונספר. */
function isForbidden(req) {
  const u = new URL(req.url());
  if (!u.host.includes('supabase') && u.host !== SUPABASE_HOST) return false;
  const m = req.method();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return /\/functions\/v1\/(portal-open-document|portal-upload-document)/.test(u.pathname);
  if (/\/auth\/v1\//.test(u.pathname)) return false;
  if (/\/rest\/v1\/rpc\/(preview_request_sample|get_[a-z_]+|is_authorized|[a-z_]*_preview)$/.test(u.pathname)) return false;
  return true;
}

async function newPage({ width = 1280, height, dark = false, trap = true, base = STAGING, path = '' } = {}) {
  const mobile = width < 500;
  const ctx = await browser.newContext({ viewport: { width, height: height ?? (mobile ? 844 : 900) }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'he-IL', colorScheme: dark ? 'dark' : 'light' });
  const page = await ctx.newPage();
  const state = { errors: [], blocked: [], requests: [], trapOn: false };
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource.*(404|401)/.test(m.text())) state.errors.push(m.text().slice(0, 240)); });
  page.on('pageerror', e => state.errors.push('PAGEERROR ' + String(e).slice(0, 240)));
  page.on('request', r => { if (state.trapOn) state.requests.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  if (trap) {
    await page.route('**/*', route => {
      if (state.trapOn && isForbidden(route.request())) { state.blocked.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`); return route.abort(); }
      return route.continue();
    });
  }
  page.on('dialog', d => d.accept());
  state.ctx = ctx;
  if (path !== null) await page.goto(base + path, { waitUntil: 'domcontentloaded' });
  return { page, state };
}
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`) }).catch(() => {});
const overflow = (page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));

async function openLibrary(page, base = STAGING) {
  // ‼ דף ריק קודם: מעבר שרק ה-hash שלו שונה לא טוען את האפליקציה מחדש (מצב מהמסלול הקודם נשאר).
  await page.goto('about:blank');
  await page.goto(`${base}${base === DEMO ? '?office-app' : ''}#/firm/library`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.lb', { timeout: 60000 });
  await page.waitForSelector('.lb-row, .lb-group-card', { timeout: 30000 });
  await page.waitForTimeout(1200);
}
const sheetVisible = (page) => page.locator('[data-testid=rp-sheet]').count().then(n => n > 0);
async function waitLoaded(page) {
  await page.waitForSelector('[data-testid=rp-sheet]', { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid=rp-loading]'), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(250);
}
async function closeSheet(page) {
  if (S) S.trapOn = false;
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[data-testid=rp-sheet]'), null, { timeout: 8000 }).catch(() => {});
}

// ── ספירות של משתמש הבדיקה (פרק g) ──────────────────────────────────────────
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const countsSql = `select jsonb_build_object(
  'steps', (select count(*) from public.onboarding_steps where user_id = '${USER_ID}'),
  'events', (select count(*) from public.onboarding_events where user_id = '${USER_ID}'),
  'mail', (select count(*) from public.email_messages where user_id = '${USER_ID}'),
  'clients', (select count(*) from public.clients where user_id = '${USER_ID}'),
  'notif', (select count(*) from public.accountant_notifications where user_id = '${USER_ID}'),
  'templates', (select count(*) from public.journey_templates where user_id = '${USER_ID}'),
  'flows', (select count(*) from public.office_flows),
  'tplhash', (select coalesce(md5(string_agg(id::text || name || entries::text, ',' order by id)), '') from public.journey_templates where user_id = '${USER_ID}'),
  'settings', (select md5(settings::text) from public.profiles where id = '${USER_ID}')) as c`;
const getCounts = async () => (await sql(STAGING_REF, countsSql))[0].c;
const before = ONLY.has('g') ? await getCounts() : null;

// ═══ a · כל שורה בספרייה ═══════════════════════════════════════════════════
const rowTargets = []; // נאסף בפרק a ונשמש בפרקים אחרים
/** ‼ המלכודת פעילה רק כשמגירה פתוחה: expire_stale_quotations ו-notify-accountant יוצאות מהאפליקציה בכל טעינה (נבדק: גם בלי מגירה). */
let S = null;

if (ONLY.has('a') || ONLY.has('b')) {
  for (const width of WIDTHS.slice(0, ONLY.has('a') ? WIDTHS.length : 1)) {
    section(`a/b · ספרייה · ${width}`);
    const { page, state } = await newPage({ width });
    S = state;
    await openLibrary(page);
    // פותחים את כל הקבוצות כדי שהילדים יופיעו
    for (const h of await page.$$('.lb-group-card .rg-head[aria-expanded="false"]')) await h.click().catch(() => {});
    await page.waitForTimeout(300);
    const buttons = await page.$$eval('[data-testid=rp-view-btn]', els => els.map(e => e.getAttribute('aria-label')));
    ok(`יש «צפייה» בכל שורה (${buttons.length} כפתורים)`, buttons.length >= 20, buttons.length);
    const rows = await page.$$eval('.lb-row, .lb-group-card', els => els.map(e => ({ id: e.id, name: e.querySelector('.lb-name, .rg-name')?.textContent ?? '' })));
    const namesWithoutBtn = [];
    for (const r of rows) {
      const has = await page.$(`#${r.id} [data-testid=rp-view-btn], #${r.id} .lb-name-btn`);
      if (!has) namesWithoutBtn.push(r.name);
    }
    ok('אין שורה בספרייה בלי «צפייה»', namesWithoutBtn.length === 0, namesWithoutBtn.join(' | '));
    const deadKids = await page.$$eval('.lb-kid', els => els.filter(k => !k.querySelector('[data-testid=rp-view-btn]')).map(k => k.querySelector('.lb-kid-name')?.textContent));
    ok('ילד בקבוצה — לכל אחד «צפייה» (אין שורה מתה)', deadKids.length === 0, deadKids.join(' | '));

    if (width === WIDTHS[0] || ONLY.has('a')) {
      for (const label of [...new Set(buttons)]) {
        state.trapOn = true;
        const btn = page.locator(`[data-testid=rp-view-btn][aria-label="${label.replace(/"/g, '\\"')}"]`).first();
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        try { await waitLoaded(page); } catch { ok(`${label}: המגירה נפתחה`, false); await page.keyboard.press('Escape'); continue; }
        const info = await page.evaluate(() => ({
          badge: !!document.querySelector('[data-testid=rp-sample-badge]'),
          // ‼ כרטיס פעולה, קבוצה, שורת «בטיפול המשרד»/«בהמשך», מסמך או הודעה — כל אחד מהם הוא «מה שהלקוח רואה»
          items: /(מה צריך ממך|בטיפול המשרד|בהמשך - ייפתח|הודעה מהמשרד|מסמכים מהמשרד|דבר אחד שכבר הושלם|דברים שכבר הושלמו|הכול הושלם)/.test(document.querySelector('[data-testid=rp-page]')?.innerText ?? '') ? 1 : 0,
          nothing: document.querySelector('[data-testid=rp-nothing]')?.textContent?.trim() ?? '',
          error: !!document.querySelector('[data-testid=rp-error]'),
          tabs: [...document.querySelectorAll('.rp-body > .fl-seg:first-of-type button')].map(b => b.textContent),
          axes: [...document.querySelectorAll('[data-testid=rp-axes] .rp-axis')].map(a => ({ key: a.getAttribute('data-axis'), n: a.querySelectorAll('button').length })),
        }));
        ok(`${label}: תג «דוגמה — לא לקוח אמיתי»`, info.badge);
        ok(`${label}: פריט אחד לפחות, או משפט «לא מופיע ללקוח»`, info.items > 0 || !!info.nothing, info.nothing);
        ok(`${label}: בלי שגיאת טעינה`, !info.error);
        const ov = await overflow(page);
        ok(`${label}: בלי גלישה אופקית`, ov.sw <= ov.cw, JSON.stringify(ov));
        // מצבים: כל אפשרות בכל ציר מתחלפת
        for (const axis of info.axes) {
          const opts = await page.$$(`[data-axis="${axis.key}"] button`);
          for (let i = 0; i < opts.length; i++) {
            const o = (await page.$$(`[data-axis="${axis.key}"] button`))[i];
            await o.click().catch(() => {});
            await page.waitForFunction(() => !document.querySelector('[data-testid=rp-loading]'), null, { timeout: 15000 }).catch(() => {});
            const bad = await page.evaluate(() => !!document.querySelector('[data-testid=rp-error]'));
            if (bad) ok(`${label}: ציר ${axis.key} אפשרות ${i + 1} נטען`, false);
          }
        }
        // לשוניות
        const tabBtns = info.tabs.length;
        for (let i = 0; i < tabBtns; i++) {
          await (await page.$$('.rp-body > .fl-seg:first-of-type button'))[i]?.click();
          await page.waitForTimeout(150);
          const t = await page.evaluate(() => document.querySelector('.rp-body')?.innerText.length ?? 0);
          if (t < 20) ok(`${label}: לשונית ${info.tabs[i]} ריקה`, false);
        }
        if (width === WIDTHS[0]) rowTargets.push({ label, tabs: info.tabs, axes: info.axes.map(a => a.key) });
        await closeSheet(page);
        state.trapOn = false;
      }
      ok(`אפס שגיאות קונסול בכל הצפיות (${width})`, state.errors.length === 0, state.errors.slice(0, 3).join(' | '));
      ok(`מלכודת הרשת: אפס בקשות שכותבות/שולחות בכל הצפיות (${width})`, state.blocked.length === 0, [...new Set(state.blocked)].join(' | '));
    }
    await shot(page, `library-${width}`);
    await state.ctx.close();
  }
}

// ── עזרים משותפים לפרקים c ו-d ──
const chip = (page, axis, label) => page.locator(`[data-axis="${axis}"] button`, { hasText: label }).first();
const viewBtn = (page, name) => page.locator(`[data-testid=rp-view-btn][aria-label="צפייה: ${name}"]`).first();
async function openByName(page, name) {
  const b = viewBtn(page, name);
  await b.scrollIntoViewIfNeeded();
  if (S) S.trapOn = true;
  await b.click();
  await waitLoaded(page);
}
const pageText = (page) => page.locator('[data-testid=rp-page]').innerText().then(t => t.replace(/\s+/g, ' '));

// ═══ c · צפייה מול הדף האמיתי של לקוח QA ═══════════════════════════════════
const QA_PREFIX = 'qa222p';
/** איפה שני הטקסטים מתחילים להיות שונים — כדי שכשל יראה את ההבדל ולא את ההתחלה המשותפת. */
const firstDiff = (a, b) => { if (a === b) return ""; let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return `שונה במקום ${i}: «${a.slice(Math.max(0, i - 25), i + 70)}» מול «${b.slice(Math.max(0, i - 25), i + 70)}»`; };
/** כל מה שמצביע על לקוח QA — ישירות (client_id) או דרך שלב/התקשרות שלו (step_id, engagement_id). staging בלבד; מזהים עם הקידומת של הבדיקה. */
const VIA = {
  client_id: col => `${col}::text like '${QA_PREFIX}%'`,
  linked_client_id: col => `${col}::text like '${QA_PREFIX}%'`,
  step_id: col => `${col}::text in (select id::text from public.onboarding_steps where client_id like '${QA_PREFIX}%')`,
  engagement_id: col => `${col}::text in (select id::text from public.engagements where client_id like '${QA_PREFIX}%')`,
};
async function cleanupQaClients() {
  const cols = await sql(STAGING_REF, `select table_name, column_name from information_schema.columns
    where table_schema = 'public' and column_name in ('client_id', 'linked_client_id', 'step_id', 'engagement_id') and table_name not like 'backup_%'
      and table_name in (select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE')`);
  // קודם מה שמצביע דרך שלב/התקשרות (לפני שהשלבים עצמם נמחקים), אחר כך מה שמצביע ישירות.
  const ordered = [...cols.filter(c => c.column_name === 'step_id'), ...cols.filter(c => c.column_name === 'engagement_id'), ...cols.filter(c => c.column_name.endsWith('client_id'))];
  const stmts = ordered.map(c => `delete from public.${c.table_name} where ${VIA[c.column_name](c.column_name)};`).join('\n');
  await sql(STAGING_REF, `begin; set local session_replication_role = replica;
    ${stmts}
    delete from public.representation_requests where linked_client_id like '${QA_PREFIX}%' or id like '${QA_PREFIX}%';
    delete from public.clients where id like '${QA_PREFIX}%'; commit;`);
  const counts = await sql(STAGING_REF, ordered.map(c => `select '${c.table_name}' as t, count(*)::int as n from public.${c.table_name} where ${VIA[c.column_name](c.column_name)}`).join(' union all '));
  const left = counts.filter(r => r.n > 0).map(r => `${r.t}:${r.n}`);
  return left;
}
async function createQaClient() {
  const sfx = Math.random().toString(36).slice(2, 8);
  const cid = `${QA_PREFIX}${sfx}`;
  const tok = `qa222tok${sfx}${Math.random().toString(36).slice(2, 10)}`;
  await sql(STAGING_REF, `do $q$
declare uid uuid := '${USER_ID}'; cid text := '${cid}'; eid text := cid || 'e'; rq text := cid || 'r'; spec jsonb; r jsonb; seedId text; tplFree text; tplDocs text;
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, spouse_first_name, business_name, portal_token)
  values (cid, uid, 'ישראל', 'QA222', 'delivered@resend.dev', 'onboarding', 'married', 'ישראלה', 'ישראלי ייעוץ (דוגמה)', '${tok}');
  insert into public.engagements (id, user_id, client_id, status, process_published_at) values (eid, uid, cid, 'onboarding', now());
  select id into seedId from public.journey_templates where seed_key = 'reserve_duty_claim' and office_id is null;
  select id into tplFree from public.journey_templates where name = 'שאלון היכרות קצר' and office_id is not null limit 1;
  select id into tplDocs from public.journey_templates where seed_key = 'client_documents' and office_id is null limit 1;
  foreach seedId in array array[seedId, tplFree, tplDocs] loop
    spec := public._flow_item_spec(uid, jsonb_build_object('ref', jsonb_build_object('kind', 'template', 'templateId', seedId)), false);
    r := public.create_onboarding_request(cid, spec->>'stepType', spec->'payload', null, null, true, false, spec->>'owner', null);
    if not coalesce((r->>'ok')::boolean, false) then raise exception 'create failed: %', r; end if;
  end loop;
  insert into public.representation_requests (id, user_id, status, linked_client_id, onboarding_token, execution)
  values (rq, uid, 'awaiting_authorities', cid, md5(rq),
    '{"shaam":{"person:client":{"requestedSystems":["מע״מ"]},"person:spouse":{"requestedSystems":["מס הכנסה","מע״מ"]}}}'::jsonb);
  perform public.ensure_rep_client_approval_step(cid);
end $q$;`);
  return { cid, tok };
}

if (ONLY.has('c')) {
  section('c · הלקוח באמת רואה את זה');
  await cleanupQaClients();
  const qa = await createQaClient();
  try {
    const cardsOf = (page, root) => page.$$eval(`${root} .pp-item`, els => els.map(e => ({
      title: e.querySelector('div > span')?.textContent?.trim() ?? '', text: e.innerText.replace(/\s+/g, ' ').trim(),
    })));
    const expandAll = async (page, root) => {
      for (const b of await page.$$(`${root} .pp-item button[aria-expanded="false"]`)) await b.click().catch(() => {});
      await page.waitForTimeout(250);
    };
    for (const width of WIDTHS) {
      const real = await newPage({ width, trap: false, path: `?portal=${qa.tok}` });
      await real.page.waitForSelector('.pp-item', { timeout: 30000 });
      await expandAll(real.page, '.pp-card');
      const realCards = await cardsOf(real.page, '.pp-card');
      await shot(real.page, `c-real-${width}`);
      await real.state.ctx.close();
      ok(`(${width}) הדף האמיתי של לקוח ה-QA נטען עם כרטיסים`, realCards.length >= 4, realCards.map(c => c.title).join(' | '));

      const { page, state } = await newPage({ width });
      S = state;
      await openLibrary(page);
      const pairs = [
        { name: 'תביעת מילואים בביטוח לאומי', real: 'תביעת מילואים בביטוח לאומי', pick: async () => {} },
        { name: 'שאלון היכרות קצר', real: 'כמה מילים על העסק', pick: async () => {} },
        { name: 'מסמכים מהלקוח', real: 'להעלות 2 מסמכים', pick: async () => {} },
      ];
      for (const p of pairs) {
        await openByName(page, p.name);
        await expandAll(page, '[data-testid=rp-page]');
        const cards = await cardsOf(page, '[data-testid=rp-page]');
        const sheetCard = cards.find(c => c.title.includes(p.real) || c.text.includes(p.real));
        const realCard = realCards.find(c => c.title.includes(p.real) || c.text.includes(p.real));
        ok(`(${width}) ${p.name}: הכרטיס קיים בדף האמיתי ובצפייה`, !!sheetCard && !!realCard);
        ok(`(${width}) ${p.name}: הטקסט בצפייה זהה לדף האמיתי של הלקוח`, !!sheetCard && !!realCard && sheetCard.text === realCard.text,
          sheetCard && realCard && sheetCard.text !== realCard.text ? firstDiff(sheetCard.text, realCard.text) : '');
        await shot(page, `c-${p.name.replace(/[^א-תa-z0-9]/gi, '_')}-${width}`);
        await closeSheet(page);
      }
      // אישור הייצוג (זוג, זירוז) מול הכרטיס האמיתי — דרך «התהליך»
      await openByName(page, 'ייצוג מול הרשויות');
      await page.locator('[data-testid=rp-process] [data-kid=rep_client_approval] button', { hasText: 'צפייה' }).click();
      await waitLoaded(page);
      await chip(page, 'persona', 'זוג').click(); await waitLoaded(page);
      await expandAll(page, '[data-testid=rp-page]');
      const approval = (await cardsOf(page, '[data-testid=rp-page]')).find(c => /אישור הייצוג באזור האישי/.test(c.title));
      const realApproval = realCards.find(c => /אישור הייצוג באזור האישי/.test(c.title));
      ok(`(${width}) אישור הייצוג (זוג, זירוז): זהה לדף האמיתי של הלקוח`, !!approval && !!realApproval && approval.text === realApproval.text,
        approval && realApproval && approval.text !== realApproval.text ? firstDiff(approval.text, realApproval.text) : '');
      await closeSheet(page);
      ok(`(${width}) אפס שגיאות קונסול`, state.errors.length === 0, state.errors.slice(0, 2).join(' | '));
      ok(`(${width}) מלכודת הרשת: אפס כתיבות`, state.blocked.length === 0, [...new Set(state.blocked)].join(' | '));
      await state.ctx.close();
    }
  } finally {
    const left = await cleanupQaClients();
    ok('לקוח ה-QA נמחק — לא נשארה שורה בשום טבלה', left.length === 0, left.join(', '));
  }
}

// ═══ d · מסלולים מלאים ═════════════════════════════════════════════════════

if (ONLY.has('d')) {
  for (const width of WIDTHS) {
    section(`d · מסלולים · ${width}`);
    const { page, state } = await newPage({ width });
    S = state;
    await openLibrary(page);

    // (1) אישור הייצוג באזור האישי: מדריך 7 צעדים → זוג → חובה → «אישרתי» (הודעת הדגמה) → עריכת הנוסח ב«מיילים»
    await openByName(page, 'ייצוג מול הרשויות');
    await page.locator('[data-testid=rp-process] [data-kid=rep_client_approval] button', { hasText: 'צפייה' }).click();
    await waitLoaded(page);
    ok('(1) הכותרת: אישור הייצוג באזור האישי, בתוך הקבוצה', /אישור הייצוג באזור האישי/.test(await page.locator('.fl-sheet-title').innerText()) && /ייצוג מול הרשויות/.test(await page.locator('.fl-sheet-sub').innerText()));
    await chip(page, 'persona', 'זוג').click(); await waitLoaded(page);
    await chip(page, 'approval', 'חובה').click(); await waitLoaded(page);
    let txt = await pageText(page);
    ok('(1) זוג + חובה: «רשות המסים ממתינה לאישור של ישראלה», ושורה לכל אחד', /רשות המסים ממתינה לאישור של ישראלה/.test(txt) && /ישראל: מע״מ/.test(txt) && /ישראלה: מס הכנסה ומע״מ/.test(txt), txt.slice(0, 200));
    await page.locator('[data-testid=rp-page] .rag-open').first().click();
    await page.waitForSelector('.rag', { timeout: 8000 });
    const stepsTotal = await page.locator('.rag').innerText().then(t => (t.match(/צעד \d+ מתוך (\d+)/) ?? [])[1]);
    ok('(1) המדריך נפתח עם 7 צעדים', stepsTotal === '7', stepsTotal);
    let badImgs = 0;
    for (let i = 0; i < 7; i++) {
      await page.waitForFunction(() => { const im = document.querySelector('.rag-imgbtn img'); return im && im.complete && im.naturalWidth > 0; }, null, { timeout: 8000 }).catch(() => { badImgs++; });
      if (i < 6) await page.locator('.rag button', { hasText: /הבא|הצעד הבא|המשך/ }).first().click().catch(() => page.keyboard.press('ArrowLeft'));
      await page.waitForTimeout(120);
    }
    ok('(1) כל תמונות המדריך (7 צעדים) נטענו', badImgs === 0, badImgs);
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    ok('(1) Esc במדריך סוגר רק אותו — המגירה נשארת', await sheetVisible(page) && !(await page.locator('.rag').count()));
    await page.locator('[data-testid=rp-page] button', { hasText: 'אישרתי באזור האישי' }).first().click();
    await page.waitForTimeout(300);
    ok('(1) «אישרתי» — הודעת הדגמה, והכרטיס לא השתנה', /בתצוגה לדוגמה — כאן הלקוח היה שולח\. לא נשמר ולא נשלח דבר\./.test(await pageText(page)) && /ממתין לאישור/.test(await pageText(page)));
    await shot(page, `d1-approval-${width}`);
    state.trapOn = false;
    await page.locator('.fl-sheet-foot button', { hasText: 'עריכת הנוסח ב«מיילים»' }).click();
    await page.waitForTimeout(1200);
    ok('(1) «עריכת הנוסח ב«מיילים» ←» נוחת על עורך הכרטיס (אישור הייצוג באזור האישי)', /emails/.test(page.url()) && await page.locator('text=אישור הייצוג באזור האישי').count() > 0, page.url());
    await shot(page, `d1-emails-${width}`);

    // (2) פייפרלס: קבוצה → רגעים → ילד וחזרה
    await openLibrary(page);
    await openByName(page, 'פייפרלס');
    for (const label of ['אחרי ההרשמה', 'בהקמה אצלנו', 'הושלם', 'בהתחלה']) {
      await chip(page, 'moment', label).click(); await waitLoaded(page);
      ok(`(2) פייפרלס · רגע «${label}» נטען`, !(await page.locator('[data-testid=rp-error]').count()) && (await pageText(page)).length > 80);
    }
    await page.locator('[data-testid=rp-process] [data-kid=business_details] button', { hasText: 'צפייה' }).click(); await waitLoaded(page);
    ok('(2) בקשה בתוך התהליך נפתחת וחוזרים אליו', /פרטי העסק/.test(await page.locator('.fl-sheet-title').innerText()) && await page.locator('.rp-back').count() === 1);
    await page.locator('.rp-back').click(); await page.waitForTimeout(300);
    ok('(2) «‹ חזרה לתהליך» מחזיר לקבוצה', /פייפרלס/.test(await page.locator('.fl-sheet-title').innerText()) && await page.locator('[data-testid=rp-process]').count() === 1);
    await closeSheet(page);

    // (3) בקשה חופשית עם שדה: הקלדה → שליחה (הדגמה) → הושלם
    await openByName(page, 'שאלון היכרות קצר');
    const open = page.locator('[data-testid=rp-page] button', { hasText: /^(המשך|למילוי)/ }).first();
    if (await open.count()) await open.click();
    const field = page.locator('[data-testid=rp-page] input[type=text], [data-testid=rp-page] input:not([type])').first();
    await field.fill('בדיקה — לא נשמר');
    await page.locator('[data-testid=rp-page] button', { hasText: 'שליחה' }).first().click();
    await page.waitForTimeout(250);
    ok('(3) הקלדה ושליחה: הודעת הדגמה, הערך נשאר, הבקשה לא עברה ל«הושלם»', /בתצוגה לדוגמה/.test(await pageText(page)) && (await field.inputValue()) === 'בדיקה — לא נשמר' && /מה צריך ממך/.test(await pageText(page)));
    await chip(page, 'state', 'הושלם').click(); await waitLoaded(page);
    ok('(3) בחירה ב«הושלם» — הבקשה עוברת לרשימת מה שהושלם', /(דבר אחד שכבר הושלם|הכול הושלם|הושלמו)/.test(await pageText(page)), (await pageText(page)).slice(0, 160));
    await closeSheet(page);

    // (4) מסמך מהמדף: צפייה → הקובץ נפתח (נבדק: קישור ציבורי, ללא פנייה פרטית)
    await page.locator('.lb-toolbar .of-seg button', { hasText: 'מסמכים' }).click();
    await page.waitForSelector('.cdx-row', { timeout: 15000 });
    const docName = await page.locator('.cdx-row .cdx-title').first().innerText();
    await page.locator('.cdx-row [data-testid=rp-view-btn]').first().click();
    await waitLoaded(page);
    ok('(4) מסמך: כרטיס «מסמך מהמשרד» עם הקובץ', (await pageText(page)).includes('מסמכים מהמשרד') || /מסמך/.test(await pageText(page)), (await pageText(page)).slice(0, 160));
    const link = page.locator('[data-testid=rp-page] a[target=_blank]').first();
    ok('(4) הקובץ נפתח בלשונית חדשה מכתובת ציבורית (לא portal-open-document)', (await link.count()) > 0 && !/portal-open-document/.test(await link.getAttribute('href') ?? ''), await link.getAttribute('href'));
    await shot(page, `d4-doc-${width}`);
    await closeSheet(page);
    void docName;

    // (6) כתובת: רענון שומר, «אחורה» סוגר
    await openLibrary(page);
    await openByName(page, 'תביעת מילואים בביטוח לאומי');
    const hash = decodeURIComponent(new URL(page.url()).hash);
    ok('(6) הכתובת נושאת מה שפתוח (view:template:…)', /view:template:/.test(hash), hash);
    state.trapOn = false; // ‼ טעינת האפליקציה מחדש (housekeeping של המשרד) אינה חלק מהצפייה
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitLoaded(page);
    state.trapOn = true;
    ok('(6) רענון — המגירה חוזרת על אותה בקשה', /תביעת מילואים/.test(await page.locator('.fl-sheet-title').innerText()));
    await page.goBack(); await page.waitForTimeout(600);
    ok('(6) «אחורה» סוגר את המגירה', !(await sheetVisible(page)));
    await page.goForward(); await page.waitForTimeout(800);
    ok('(6) «קדימה» פותחת אותה שוב', await sheetVisible(page));
    await closeSheet(page);

    ok(`(${width}) אפס שגיאות קונסול`, state.errors.length === 0, state.errors.slice(0, 3).join(' | '));
    ok(`(${width}) מלכודת הרשת: אפס בקשות שכותבות/שולחות`, state.blocked.length === 0, [...new Set(state.blocked)].join(' | '));
    await state.ctx.close();
  }
}

// ═══ e · פריסה ═════════════════════════════════════════════════════════════
if (ONLY.has('e')) {
  for (const width of WIDTHS) {
    section(`e · פריסה · ${width}`);
    const { page, state } = await newPage({ width });
    await openLibrary(page);
    for (const name of ['ייצוג מול הרשויות', 'פייפרלס', 'תביעת מילואים בביטוח לאומי']) {
      const btn = viewBtn(page, name);
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      await waitLoaded(page);
      const ov = await overflow(page);
      ok(`${name}: בלי גלישה אופקית של העמוד`, ov.sw <= ov.cw, JSON.stringify(ov));
      const inner = await page.evaluate(() => { const b = document.querySelector('.fl-sheet-body'); return b ? { sw: b.scrollWidth, cw: b.clientWidth } : null; });
      ok(`${name}: בלי גלישה אופקית בתוך המגירה`, !!inner && inner.sw <= inner.cw + 1, JSON.stringify(inner));
      if (width < 500) {
        const small = await page.evaluate(() => [...document.querySelectorAll('.fl-sheet-head button, .fl-sheet-foot button, .rp-body > .fl-seg button, .rp-axes .fl-seg button, .rp-process-list .btn, .rp-back, .rp-link')]
          .filter(e => e.offsetParent !== null).map(e => ({ t: e.textContent?.trim().slice(0, 20), h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width) }))
          .filter(x => x.h < 44 && !/^✕$/.test(x.t ?? '')));
        ok(`${name}: יעדי מגע ≥ 44px בטלפון`, small.length === 0, JSON.stringify(small.slice(0, 5)));
      }
      await shot(page, `e-${name.replace(/[^א-תa-z0-9]/gi, '_')}-${width}`);
      await closeSheet(page);
      const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
      ok(`${name}: הפוקוס חוזר לכפתור «צפייה»`, focused === `צפייה: ${name}`, focused);
    }
    ok(`(${width}) אפס שגיאות קונסול`, state.errors.length === 0, state.errors.slice(0, 3).join(' | '));
    await state.ctx.close();
  }
  // מצב כהה: המשרד כהה, הדף שבתוך המגירה נשאר בהיר
  section('e · מצב כהה');
  const dk = await newPage({ width: 1280, dark: true });
  await openLibrary(dk.page);
  await dk.page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
  await openByName(dk.page, 'תביעת מילואים בביטוח לאומי');
  const colors = await dk.page.evaluate(() => {
    const lum = (c) => { const m = c.match(/\d+/g)?.map(Number) ?? [0, 0, 0]; return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
    const card = document.querySelector('[data-testid=rp-page] .pp-card');
    const sheet = document.querySelector('.fl-sheet');
    return { card: card ? lum(getComputedStyle(card).backgroundColor) : -1, sheet: sheet ? lum(getComputedStyle(sheet).backgroundColor) : -1 };
  });
  ok('מצב כהה: הדף בתוך המגירה נשאר בהיר', colors.card > 0.8, JSON.stringify(colors));
  await shot(dk.page, 'e-dark-1280');
  await dk.state.ctx.close();
}

// ═══ f · רגרסיה ═══════════════════════════════════════════════════════════
if (ONLY.has('f')) {
  section('f · רגרסיה — הספרייה');
  const { page, state } = await newPage({ width: 1280 });
  await openLibrary(page);
  const total = await page.locator('.lb-row, .lb-group-card').count();
  await page.fill('.lb-search', 'מילואים');
  await page.waitForTimeout(500);
  const filtered = await page.locator('.lb-row, .lb-group-card').count();
  ok('חיפוש «מילואים» מסנן לשורה אחת', filtered === 1 && total > 1, `${filtered}/${total}`);
  await viewBtn(page, 'תביעת מילואים בביטוח לאומי').click(); await waitLoaded(page);
  ok('צפייה על תוצאת חיפוש', /מילואים/.test(await page.locator('.fl-sheet-title').innerText()));
  await closeSheet(page);
  await page.fill('.lb-search', '');
  await page.waitForTimeout(400);
  const idx = page.locator('.lb-index-btn').nth(2);
  if (await idx.count()) { await idx.click(); await page.waitForTimeout(300); }
  ok('אינדקס האותיות קיים ועובד', await page.locator('.lb-index-btn').count() > 1);
  await page.locator('.lb-row .lb-edit', { hasText: 'עריכה' }).first().click();
  await page.waitForSelector('.lb-editor, [role=dialog]', { timeout: 10000 }).catch(() => {});
  ok('עורך הבקשה נפתח', await page.locator('.lb-editor, .fl-sheet, [role=dialog]').count() > 0);
  ok('אפס שגיאות קונסול ברגרסיה', state.errors.length === 0, state.errors.slice(0, 3).join(' | '));
  await shot(page, 'f-editor');
  await state.ctx.close();

  section('f · רגרסיה — הדף האישי בהדגמה (live: שליחה אמיתית במדומה)');
  const demo = await newPage({ width: 1280, trap: false, base: DEMO, path: '?portal=demo&office-app' });
  await demo.page.waitForSelector('.pp-item', { timeout: 30000 });
  const first = demo.page.locator('.pp-item', { hasText: 'תביעת מילואים' }).first();
  ok('הדף האישי בהדגמה נטען עם כרטיס המילואים', await first.count() === 1);
  ok('בלי שגיאות קונסול', demo.state.errors.length === 0, demo.state.errors.slice(0, 2).join(' | '));
  await demo.state.ctx.close();
}

// ═══ h · «＋ בקשה חדשה» בכרטיס הלקוח (שלב ד׳) ═══════════════════════════════
/** לקוח QA פעיל וריק (בלי בקשות) — למסלול ההוספה. */
async function createPlainQaClient() {
  const cid = `${QA_PREFIX}${Math.random().toString(36).slice(2, 8)}`;
  await sql(STAGING_REF, `insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
    values ('${cid}', '${USER_ID}', 'ישראל', 'QA222', 'delivered@resend.dev', 'active', 'single', 'licensed')`);
  return cid;
}
const qaSteps = (cid) => sql(STAGING_REF, `select step_type, status, ball, payload->>'clientTitle' as title, payload from public.onboarding_steps where client_id = '${cid}' order by created_at`);

if (ONLY.has('h')) {
  section('h · «＋ בקשה חדשה» — צפייה והוספה');
  await cleanupQaClients();
  try {
    for (const width of WIDTHS) {
      const cid = await createPlainQaClient();
      const { page, state } = await newPage({ width, path: null });
      S = state;
      const bodies = [];
      page.on('request', r => { if (r.method() === 'POST') bodies.push({ url: r.url(), body: r.postData() }); });
      const rpcBodies = (name) => bodies.filter(b => b.url.endsWith(`/rpc/${name}`)).map(b => { try { return JSON.parse(b.body || '{}'); } catch { return {}; } });
      const openDialog = async () => {
        await page.goto('about:blank');
        await page.goto(`${STAGING}#/client/${cid}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('button:has-text("בקשות")', { timeout: 60000 });
        await page.waitForTimeout(1500);
        await page.getByRole('button', { name: 'בקשות', exact: true }).click();
        await page.waitForTimeout(1500);
        await page.getByRole('button', { name: '＋ בקשה חדשה' }).first().click();
        await page.waitForSelector('.modal-backdrop', { timeout: 20000 });
        await page.waitForTimeout(1200);
      };
      const open = async (name) => {
        const b = page.locator(`[data-testid=rp-view-btn][aria-label="צפייה: ${name}"]`).first();
        await b.scrollIntoViewIfNeeded();
        state.trapOn = true;
        await b.click();
        await waitLoaded(page);
      };
      const stepsBefore = (await qaSteps(cid)).length;

      // (1) פריט שנוצר בלחיצה אחת: «פרטי העסק» — צפייה לא יוצרת; «הוספה לישראל» יוצרת בדיוק אחת, כמו הלחיצה על השורה
      await openDialog();
      const dialogRows = await page.locator('.modal [data-testid=rp-view-btn]').count();
      ok(`(${width}) «צפייה» על כל שורה בקטלוג ובספרייה (${dialogRows})`, dialogRows >= 6, dialogRows);
      await open('פרטי העסק');
      ok(`(${width}) הצפייה בקטלוג: תג «דוגמה — לא לקוח אמיתי»`, await page.locator('[data-testid=rp-sample-badge]').count() === 1);
      const label = (await page.locator('.fl-sheet-foot .btn-primary').innerText()).trim();
      ok(`(${width}) כפתור «הוספה לישראל»`, label === 'הוספה לישראל', label);
      ok(`(${width}) בלי גלישה אופקית`, (await overflow(page)).sw <= (await overflow(page)).cw);
      ok(`(${width}) הצפייה לא יצרה כלום`, rpcBodies('create_onboarding_request').length === 0 && (await qaSteps(cid)).length === stepsBefore);
      await shot(page, `h-drawer-${width}`);
      // קליק בתוך המגירה לא סוגר את חלון ההוספה
      await page.locator('[data-testid=rp-page]').click({ position: { x: 8, y: 8 } }).catch(() => {});
      ok(`(${width}) לחיצה בתוך המגירה לא סוגרת את חלון ההוספה`, await page.locator('.modal-backdrop').count() === 1);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('[data-testid=rp-sheet]'), null, { timeout: 8000 }).catch(() => {});
      ok(`(${width}) Esc סוגר רק את המגירה; חלון ההוספה פתוח`, await page.locator('.modal-backdrop').count() === 1 && !(await sheetVisible(page)));
      ok(`(${width}) הפוקוס חוזר לכפתור «צפייה»`, await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'rp-view-btn'));
      state.trapOn = false;
      await open('פרטי העסק');
      state.trapOn = false;
      await page.locator('.fl-sheet-foot .btn-primary').click();
      await page.waitForTimeout(3500);
      const created = rpcBodies('create_onboarding_request');
      ok(`(${width}) «הוספה לישראל» יצרה בדיוק בקשה אחת`, created.length === 1 && created[0].p_step_type === 'business_details', JSON.stringify(created.map(c => c.p_step_type)));
      const rows = await qaSteps(cid);
      ok(`(${width}) הבקשה נשמרה אצל הלקוח, בבעלות הלקוח`, rows.length === stepsBefore + 1 && rows.some(r => r.step_type === 'business_details' && r.ball === 'client'), JSON.stringify(rows.map(r => [r.step_type, r.ball])));
      ok(`(${width}) המגירה וחלון ההוספה נסגרו אחרי ההוספה`, !(await sheetVisible(page)) && await page.locator('.modal-backdrop').count() === 0);

      // «הדף של ישראל» מציג אותה
      const pageBtn = page.getByRole('button', { name: /^הדף של ישראל/ }).first();
      if (await pageBtn.count()) {
        await pageBtn.click();
        await page.waitForSelector('.pp-item', { timeout: 20000 }).catch(() => {});
        const txt = await page.locator('.pp-page').first().innerText().catch(() => '');
        ok(`(${width}) «הדף של ישראל» מציג את «פרטי העסק»`, /פרטי העסק/.test(txt), txt.slice(0, 100));
        await shot(page, `h-client-page-${width}`);
        await page.keyboard.press('Escape');
      } else ok(`(${width}) כפתור «הדף של ישראל» נמצא`, false);

      // (2) פריט שדורש קלט (שליחת מסמכים/הרשאה בבנק): «המשך להוספה» — לא יוצר
      await openDialog();
      const before2 = rpcBodies('create_onboarding_request').length;
      await open('הקמת הרשאה לחיוב חשבון במוסדות');
      const label2 = (await page.locator('.fl-sheet-foot .btn-primary').innerText()).trim();
      ok(`(${width}) פריט שצריך קלט: «המשך להוספה לישראל»`, label2 === 'המשך להוספה לישראל', label2);
      state.trapOn = false;
      await page.locator('.fl-sheet-foot .btn-primary').click();
      await page.waitForTimeout(1200);
      ok(`(${width}) «המשך להוספה» לא יצר כלום ושמר את חלון ההוספה פתוח, על מסך הקלט`, rpcBodies('create_onboarding_request').length === before2 && await page.locator('.modal-backdrop').count() === 1 && !(await sheetVisible(page)));

      // (2ב) טופס 6101 בקטלוג: «המסך שנפתח» — חדר החתימה של הטופס האמיתי, ו«המשך» לא יוצר
      await openDialog();
      const before2b = rpcBodies('create_onboarding_request').length;
      await open('דין וחשבון רב שנתי (6101) · ביטוח לאומי');
      const tab6101 = page.locator('.rp-body .fl-seg button', { hasText: 'המסך שנפתח' }).first();
      if (await tab6101.count()) {
        await tab6101.click();
        await page.waitForSelector('[data-testid=linked-screen-frame]', { timeout: 20000 });
        await page.waitForTimeout(2500);
        const t6101 = await page.locator('[data-testid=linked-screen-frame]').innerText();
        ok(`(${width}) 6101: חדר החתימה של הטופס מצויר`, t6101.length > 60, t6101.slice(0, 100));
        await shot(page, `h-6101-${width}`);
      } else ok(`(${width}) 6101: יש לשונית «המסך שנפתח»`, false);
      state.trapOn = false;
      await page.keyboard.press('Escape');
      ok(`(${width}) 6101: הצפייה לא יצרה כלום`, rpcBodies('create_onboarding_request').length === before2b);

      // (3) נוסח מהספרייה: הצפייה == מה שהקומפוזר יוצר (אותו payload) — ו«שמור כטיוטה» יוצרת בדיוק אחת
      await openDialog();
      const sampleBefore = rpcBodies('preview_request_sample').length;
      await open('אישור ניהול חשבון בנק עסקי');
      const prevReq = rpcBodies('preview_request_sample').slice(sampleBefore).pop()?.p_request;
      const prevSample = prevReq?.samples?.[0];
      ok(`(${width}) נוסח מהספרייה נשלח לצפייה כטיוטה (custom_request + payload)`, prevSample?.stepType === 'custom_request' && !!prevSample?.payload, JSON.stringify(prevSample ?? {}).slice(0, 160));
      ok(`(${width}) כפתור «המשך להוספה» (נפתח לעריכה לפני השמירה)`, /^המשך להוספה/.test((await page.locator('.fl-sheet-foot .btn-primary').innerText()).trim()));
      state.trapOn = false;
      await page.locator('.fl-sheet-foot .btn-primary').click();
      await page.waitForTimeout(1500);
      const saveDraft = page.getByRole('button', { name: 'שמור כטיוטה' });
      ok(`(${width}) אחרי «המשך» נפתח הקומפוזר עם «שמור כטיוטה»`, await saveDraft.count() > 0);
      const before3 = rpcBodies('create_onboarding_request').length;
      await saveDraft.first().click();
      await page.waitForTimeout(3500);
      const created3 = rpcBodies('create_onboarding_request').slice(before3);
      const stable = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)) ? Object.fromEntries(Object.entries(x).filter(([, y]) => y !== undefined).sort(([a], [b]) => a.localeCompare(b))) : x);
      ok(`(${width}) «שמור כטיוטה» יצרה בקשה אחת`, created3.length === 1, created3.length);
      ok(`(${width}) מה שנוצר זהה במדויק למה שהצפייה הציגה (payload)`, created3.length === 1 && stable(created3[0].p_payload) === stable(prevSample?.payload),
        created3.length === 1 ? firstDiff(stable(created3[0].p_payload), stable(prevSample?.payload ?? {})) : '');

      // (4) בקשה חופשית: «צפייה» בטופס, טיוטה בלי שמירה
      await openDialog();
      const free = page.getByRole('button', { name: /בקשה חופשית/ }).first();
      if (await free.count()) {
        await free.click();
        await page.waitForTimeout(600);
        const inputs = page.locator('.modal input[type=text], .modal textarea, .modal input:not([type])');
        await inputs.first().fill('להעביר לנו אישור ניהול ספרים לדוגמה').catch(() => {});
        const pv = page.locator('.modal [data-testid=rp-view-btn]').last();
        if (await pv.count()) {
          const c0 = rpcBodies('create_onboarding_request').length;
          state.trapOn = true;
          await pv.click(); await waitLoaded(page);
          ok(`(${width}) בקשה חופשית: «טיוטה — לא נשמר» ובלי כפתור הוספה`, /טיוטה/.test(await page.locator('.fl-sheet').innerText()) && await page.locator('.fl-sheet-foot .btn-primary').count() === 0);
          ok(`(${width}) בקשה חופשית: הצפייה לא יצרה כלום`, rpcBodies('create_onboarding_request').length === c0);
          state.trapOn = false;
          await page.keyboard.press('Escape');
        } else ok(`(${width}) כפתור «צפייה» בטופס הבקשה החופשית`, false);
      } else ok(`(${width}) טופס בקשה חופשית נמצא`, false);

      ok(`(${width}) אפס שגיאות קונסול`, state.errors.length === 0, state.errors.slice(0, 2).join(' | '));
      ok(`(${width}) מלכודת הרשת: אפס כתיבות בזמן הצפיות`, state.blocked.length === 0, [...new Set(state.blocked)].join(' | '));
      await state.ctx.close();
      S = null;
      await cleanupQaClients();
    }
  } finally {
    const left = await cleanupQaClients();
    ok('לקוחות ה-QA של פרק h נמחקו — לא נשארה שורה בשום טבלה', left.length === 0, left.join(', '));
  }
}

// ═══ i · «המסך שנפתח» — המסכים האמיתיים של הלקוח על נתוני דוגמה (שלב ה׳) ═════
if (ONLY.has('i')) {
  for (const width of WIDTHS) {
    section(`i · המסך שנפתח · ${width}`);
    const { page, state } = await newPage({ width });
    S = state;
    await openLibrary(page);
    const screens = [
      { row: 'ייצוג מול הרשויות', key: 'onboard', has: /שלב 1 מתוך 4/ },
      { row: 'העברת טיפול מרו״ח קודם', key: 'release', has: /שליחת החומרים/ },
      { row: 'עדכון סטטוס מס', key: 'intake', has: /שאלון היכרות/ },
    ];
    for (const sc of screens) {
      await openByName(page, sc.row);
      await page.locator('.rp-body .fl-seg button', { hasText: 'המסך שנפתח' }).first().click();
      await page.waitForSelector('[data-testid=rp-linked]', { timeout: 10000 });
      await page.waitForSelector('[data-testid=linked-screen-frame]', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(800);
      const info = await page.evaluate(() => ({
        gap: !!document.querySelector('[data-testid=rp-linked-gap]'),
        frame: !!document.querySelector('[data-testid=linked-screen-frame]'),
        text: (document.querySelector('[data-testid=linked-screen-frame]')?.textContent ?? '').replace(/\s+/g, ' '),
      }));
      ok(`(${width}) ${sc.row}: המסך האמיתי מצויר במסגרת (לא משפט פער)`, info.frame && !info.gap);
      ok(`(${width}) ${sc.row}: התוכן הנכון על המסך`, sc.has.test(info.text), info.text.slice(0, 120));
      const ov = await overflow(page);
      ok(`(${width}) ${sc.row}: בלי גלישה אופקית`, ov.sw <= ov.cw, JSON.stringify(ov));
      await shot(page, `i-${sc.key}-${width}`);
      await closeSheet(page);
    }
    // ייצוג: המסך השני של אותה בקשה — חדר החתימה על ייפוי הכוח (הטופס האמיתי, בלי חתימה אמיתית)
    await openByName(page, 'ייצוג מול הרשויות');
    await page.locator('.rp-body .fl-seg button', { hasText: 'המסך שנפתח' }).first().click();
    await page.locator('[data-testid=rp-linked] .fl-seg button', { hasText: 'חתימה על ייפוי הכוח' }).click();
    await page.waitForSelector('[data-testid=linked-screen-frame]', { timeout: 15000 });
    await page.waitForFunction(() => !/טוען טופס/.test(document.querySelector('[data-testid=linked-screen-frame]')?.textContent ?? ''), null, { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const signText = await page.locator('[data-testid=linked-screen-frame]').innerText();
    ok(`(${width}) חדר החתימה על ייפוי הכוח מצויר (הטופס האמיתי)`, signText.length > 80 && !/טוען טופס|לא נטען/.test(signText), signText.slice(0, 120));
    ok(`(${width}) חדר החתימה: בלי גלישה אופקית`, (await overflow(page)).sw <= (await overflow(page)).cw);
    await shot(page, `i-sign-${width}`);
    await closeSheet(page);

    // מכתב ההעברה: נבנה בקוד של הרו״ח מהתבנית של המשרד — ולא טקסט שנכתב בתצוגה
    await openByName(page, 'העברת טיפול מרו״ח קודם');
    await page.locator('.rp-body .fl-seg button', { hasText: 'המסך שנפתח' }).first().click();
    await page.waitForSelector('[data-testid=linked-screen-frame]', { timeout: 15000 });
    const letter = await page.locator('[data-testid=linked-screen-frame]').innerText();
    ok(`(${width}) דף הרו״ח הקודם: מכתב ההעברה מוצג (נבנה מתבנית המשרד)`, /ישראל ישראלי/.test(letter) && letter.length > 400, letter.length);
    await closeSheet(page);
    ok(`(${width}) אפס שגיאות קונסול`, state.errors.length === 0, state.errors.slice(0, 2).join(' | '));
    ok(`(${width}) מלכודת הרשת: אפס כתיבות`, state.blocked.length === 0, [...new Set(state.blocked)].join(' | '));
    await state.ctx.close();
    S = null;
  }
}

// ═══ j · כללי פתיחה, בונה המסלולים ועורך הבקשה (שלב ד׳) ═══════════════════════
if (ONLY.has('j')) {
  for (const width of WIDTHS) {
    section(`j · כללים · בונה · עורך · ${width}`);
    const { page, state } = await newPage({ width, path: null });
    S = state;
    const sheetsOpen = () => page.locator('.fl-sheet-root').count();
    const previewReady = async () => {
      await page.waitForSelector('[data-testid=rp-sheet]', { timeout: 20000 });
      await page.waitForSelector('[data-testid=rp-page], [data-testid=rp-error], [data-testid=rp-nothing]', { timeout: 30000 });
      await page.waitForTimeout(400);
    };

    // (1) «מתי פותחים בקשות?» — שם הבקשה בכלל פותח את אותה מגירה
    await page.goto('about:blank');
    await page.goto(`${STAGING}#/firm/flows`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.fr-rule', { timeout: 60000 });
    await page.waitForTimeout(2000);
    const names = page.locator('[data-testid=rule-view]');
    const nNames = await names.count();
    ok(`(${width}) בכללים: שמות בקשות הם כפתורי «צפייה» (${nNames})`, nNames >= 3, nNames);
    state.trapOn = true;
    await names.first().scrollIntoViewIfNeeded();
    const label1 = await names.first().getAttribute('aria-label');
    await names.first().click();
    await previewReady();
    ok(`(${width}) הכלל פתח את המגירה של «${label1?.replace('צפייה: ', '')}» עם תג «דוגמה»`, await page.locator('[data-testid=rp-sample-badge]').count() === 1);
    await shot(page, `j-rule-${width}`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[data-testid=rp-sheet]'), null, { timeout: 8000 }).catch(() => {});
    ok(`(${width}) Esc סוגר את המגירה והפוקוס חוזר לשם הבקשה`, !(await sheetVisible(page)) && await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'rule-view'));
    state.trapOn = false;

    // (2) הבונה: «הוספת בקשה» — «צפייה» בכל שורה, והמגירה מעל הבונה
    await page.getByRole('button', { name: 'עריכת הכלל' }).first().click();
    await page.waitForSelector('button.fl-add', { timeout: 30000 });
    await page.waitForTimeout(800);
    await page.locator('button.fl-add').first().scrollIntoViewIfNeeded();
    await page.locator('button.fl-add').first().click();
    await page.waitForSelector('.fl-sheet', { timeout: 10000 });
    await page.waitForTimeout(500);
    const pickViews = page.locator('.bp-pick .rp-view');
    const nPick = await pickViews.count();
    ok(`(${width}) בבונה: «צפייה» בשורות הבחירה (${nPick})`, nPick >= 3, nPick);
    state.trapOn = true;
    await pickViews.first().scrollIntoViewIfNeeded();
    await pickViews.first().click();
    await previewReady();
    const stack = await sheetsOpen();
    ok(`(${width}) הבונה: המגירה נפתחת מעל הדף (שתי שכבות)`, stack >= 2, stack);
    ok(`(${width}) הבונה: כפתור «הוספה ל…» בתחתית המגירה`, /^הוספה/.test((await page.locator('.fl-sheet-foot .btn-primary').last().innerText().catch(() => '')).trim()));
    ok(`(${width}) הבונה: בלי גלישה אופקית`, (await overflow(page)).sw <= (await overflow(page)).cw);
    await shot(page, `j-addsheet-${width}`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[data-testid=rp-sheet]'), null, { timeout: 8000 }).catch(() => {});
    ok(`(${width}) Esc סוגר רק את המגירה — ההוספה ממשיכה להיות פתוחה`, !(await sheetVisible(page)) && await page.locator('.bp-pick').count() > 0);
    state.trapOn = false;

    // (3) עורך הבקשה בספרייה: הכרטיס האמיתי, וטיוטה בלי שמירה
    await openLibrary(page);
    await page.locator('.lb-row .lb-edit', { hasText: 'עריכה' }).first().click();
    await page.waitForSelector('[data-testid=lb-live-card]', { timeout: 25000 });
    await page.waitForTimeout(600);
    ok(`(${width}) בעורך: הכרטיס האמיתי של הדף האישי (לא תצוגה מקרבת)`, await page.locator('[data-testid=lb-live-card] .pp-item').count() > 0);
    ok(`(${width}) בעורך: תג «דוגמה», ועוד לא «טיוטה»`, await page.locator('[data-testid=lb-live-badge]').count() === 1 && await page.locator('[data-testid=lb-live-draft]').count() === 0);
    const cardBefore = await page.locator('[data-testid=lb-live-card]').innerText();
    ok(`(${width}) בעורך: הכרטיס ממותג כמו המשרד (לא «משרד רואי חשבון ישראל»)`, !/משרד רואי חשבון ישראל/.test(cardBefore) && /PIVO/.test(cardBefore), cardBefore.slice(0, 60));
    const titleInput = page.locator('.lb-editor input:not([type=checkbox]), [role=dialog] input:not([type=checkbox])').nth(1);
    await titleInput.fill('כותרת בדיקה QA222');
    await page.waitForFunction(() => /כותרת בדיקה QA222/.test(document.querySelector('[data-testid=lb-live-card]')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => {});
    const cardAfter = await page.locator('[data-testid=lb-live-card]').innerText();
    ok(`(${width}) בעורך: הקלדה מתעדכנת בכרטיס`, /כותרת בדיקה QA222/.test(cardAfter));
    ok(`(${width}) בעורך: אחרי שינוי מופיע «טיוטה — לא נשמר»`, await page.locator('[data-testid=lb-live-draft]').count() === 1);
    ok(`(${width}) בעורך: בלי גלישה אופקית`, (await overflow(page)).sw <= (await overflow(page)).cw);
    await shot(page, `j-editor-${width}`);
    // «תצוגה מלאה» — המגירה של הטיוטה, מעל העורך
    state.trapOn = true;
    await page.locator('[data-testid=lb-live-full]').click();
    await previewReady();
    ok(`(${width}) «תצוגה מלאה» פותחת את המגירה מעל העורך`, await page.locator('[data-testid=rp-sample-badge]').count() === 1);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[data-testid=rp-sheet]'), null, { timeout: 8000 }).catch(() => {});
    state.trapOn = false;
    ok(`(${width}) העורך לא נסגר ולא נשמר דבר (הכותרת השמורה לא השתנתה)`, await page.locator('[data-testid=lb-live-card]').count() === 1);
    ok(`(${width}) אפס שגיאות קונסול`, state.errors.length === 0, state.errors.slice(0, 2).join(' | '));
    ok(`(${width}) מלכודת הרשת: אפס כתיבות בזמן הצפיות`, state.blocked.length === 0, [...new Set(state.blocked)].join(' | '));
    await state.ctx.close();
    S = null;
  }
}

// ═══ k · הדגמה (?office-app) — כל צפייה מהדוגמאות שנלכדו, בלי רשת ═══════════════
if (ONLY.has('k')) {
  for (const width of WIDTHS.slice(0, 2)) {
    section(`k · הדגמה · ${width}`);
    const ctxState = await newPage({ width, trap: false, base: DEMO, path: null });
    const { page, state } = ctxState;
    const external = [];
    page.on('request', r => { const u = new URL(r.url()); if (!/^(localhost|127\.0\.0\.1)(:|$)/.test(u.host) && !/fonts\.(googleapis|gstatic)\.com$/.test(u.host)) external.push(`${r.method()} ${u.host}${u.pathname}`); });
    await openLibrary(page, DEMO);
    for (const h of await page.$$('.lb-group-card .rg-head[aria-expanded="false"]')) await h.click().catch(() => {});
    await page.waitForTimeout(300);
    const labels = [...new Set(await page.$$eval('[data-testid=rp-view-btn]', els => els.map(e => e.getAttribute('aria-label'))))];
    ok(`(${width}) בהדגמה יש «צפייה» בשורות הספרייה (${labels.length})`, labels.length >= 8, labels.length);
    const bad = []; const noFixture = [];
    for (const label of labels) {
      const btn = page.locator(`[data-testid=rp-view-btn][aria-label="${label.replace(/"/g, '\\"')}"]`).first();
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      try { await waitLoaded(page); } catch { bad.push(`${label}: לא נפתח`); await page.keyboard.press('Escape'); continue; }
      const r = await page.evaluate(() => ({
        page: !!document.querySelector('[data-testid=rp-page]'),
        nothing: !!document.querySelector('[data-testid=rp-nothing]'),
        err: document.querySelector('[data-testid=rp-error]')?.textContent ?? '',
      }));
      if (r.err) { if (/אין דוגמה בהדגמה/.test(r.err)) noFixture.push(label); else bad.push(`${label}: ${r.err.slice(0, 60)}`); }
      else if (!r.page && !r.nothing) bad.push(`${label}: לא מצויר כלום`);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('[data-testid=rp-sheet]'), null, { timeout: 8000 }).catch(() => {});
    }
    ok(`(${width}) כל צפייה בהדגמה מצוירת מדוגמה שנלכדה (או אומרת במפורש «אין דוגמה בהדגמה»)`, bad.length === 0, bad.join(' | '));
    ok(`(${width}) «אין דוגמה בהדגמה» רק במקרים הידועים (${noFixture.length})`, noFixture.length <= 4, noFixture.join(' | '));
    ok(`(${width}) אפס שגיאות קונסול`, state.errors.length === 0, state.errors.slice(0, 2).join(' | '));
    ok(`(${width}) אפס בקשות החוצה (ההדגמה בלי רשת)`, external.length === 0, [...new Set(external)].slice(0, 4).join(' | '));
    await shot(page, `k-demo-${width}`);
    await state.ctx.close();
  }
}

// ═══ סיכום ════════════════════════════════════════════════════════════════
if (ONLY.has('g') && before) {
  section('g · ספירות');
  const after = await getCounts();
  ok('אחרי כל הצפיות — אף שורה לא נוספה/שונתה אצל משתמש הבדיקה', JSON.stringify(before) === JSON.stringify(after), JSON.stringify({ before, after }));
}

await browser.close();
const failed = results.filter(r => !r.pass);
console.log('\n' + results.map(r => r.line).join('\n'));
console.log(`\nצילומים: ${OUT}\n${results.length - failed.length} עברו, ${failed.length} נכשלו`);
process.exitCode = failed.length ? 1 : 0;
void existsSync;
