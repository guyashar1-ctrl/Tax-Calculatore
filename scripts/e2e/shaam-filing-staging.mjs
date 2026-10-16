// ─── «הפקת דוחות משע״ם והעלאה» מול staging — מסד אמיתי, לקוחות בדיקה משלי, ניקוי מלא (16.10.2026) ────────────
// ‼ staging בלבד: כל בקשה שאינה localhost / evdfxjqrkgugssfrdoxd נחסמת, וכתובת ייצור — כשל. בלי סיסמה (קישור כניסה חד-פעמי
//   במפתח השירות של staging, כמו staging-session.mjs). הסודות נקראים מ-STAGING_ENV_DIR ולא נכתבים לשום מקום.
// ‼ לקוחות QASF… חדשים, מספרי זהות אקראיים שאינם קיימים ב-staging; קבצי PDF סינתטיים. בסוף: מחיקה מלאה + סריקת שאריות.
// מה נבדק: העלאה → תצוגה → שמירה (טבלה, מקור, קובץ בדלי הפרטי) · ייבוא חוזר בלי כפילות · «פתח בקשה» (דוח + הון עם יום
//   הצהרה) — נפתחה, קושרה, השאלות לא פורסמו, אין מייל · קובץ חדש עם הגשה ⇒ «הוגש לפי שע״ם» על הבקשה, בלי סגירה ·
//   היסטוריה ⇒ בקשת עותק לא מפורסמת · שיוך ידני · anon חסום · משתמש לא מורשה חסום.
//   STAGING_ENV_DIR=<תיקייה עם .env.staging ו-.env.local> node scripts/e2e/shaam-filing-staging.mjs [--base=http://localhost:5174] [--shots=dir] [--surface=app|harness]
// ‼ --surface=app (ברירת מחדל): המקומות האמיתיים — «מס › עבודות לקוחות» (‎#/tax/work‎, המקטע בראש הסקירה) ותיק המס
//   (‎#/client/<id>/taxfile‎ ← «דוחות והצהרות»). עובד גם על בניית staging (vite build --mode staging).
//   --surface=harness: מסך הבדיקה ‎/src/features/shaamFiling/__dev/‎ — רק בשרת פיתוח, לפני המיקום.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const STAGING = 'evdfxjqrkgugssfrdoxd', PROD = 'uoweoqtuiettozagwgdw';
const OFFICE = 'ca158d52-5ad7-47f5-b228-4b7703978b84', OFFICE_EMAIL = 'staging@pivo.test';
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d);
const BASE = arg('base', 'http://localhost:5174');
const SHOTS = arg('shots', '');
const SURFACE = arg('surface', 'app');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const dir = process.env.STAGING_ENV_DIR;
if (!dir) throw new Error('STAGING_ENV_DIR חסר');
const readEnv = (f) => Object.fromEntries(readFileSync(f, 'utf8').split(/\r?\n/).map(l => l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const st = readEnv(join(dir, '.env.staging')), loc = readEnv(join(dir, '.env.local'));
const URL_ = st.VITE_SUPABASE_URL, ANON = st.VITE_SUPABASE_ANON_KEY, SERVICE = st.SUPABASE_SERVICE_ROLE_KEY, TOKEN = loc.SUPABASE_ACCESS_TOKEN;
if (!URL_?.includes(STAGING) || URL_.includes(PROD)) throw new Error('✋ .env.staging אינו staging');

async function sql(query) {
  for (let a = 0; a < 4; a++) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${STAGING}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
    const t = await r.text();
    if (r.status === 429 || /Throttler/.test(t)) { await new Promise(res => setTimeout(res, 1500 * (a + 1))); continue; }
    if (!r.ok) throw new Error(`sql ${r.status}: ${t.slice(0, 300)}`);
    return t ? JSON.parse(t) : [];
  }
  throw new Error('sql throttled');
}
const lit = (v) => `$q$${typeof v === 'string' ? v : JSON.stringify(v)}$q$`;
const as = async (uid, expr) => (await sql(`begin; set local role authenticated; select set_config('request.jwt.claims', ${lit({ sub: uid, role: 'authenticated' })}, true); select (${expr}) as r; commit;`))[0]?.r;

let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(info).slice(0, 400)}` : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── לקוחות בדיקה + מספרים אקראיים פנויים ──
const RUN = `QASF${Date.now().toString(36).toUpperCase()}`;
const rnd = () => `9${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const taken = new Set((await sql(`select id_number n from public.clients where id_number is not null union select spouse_id_number from public.clients where spouse_id_number is not null`)).map(r => r.n));
const fresh = () => { let n; do n = rnd(); while (taken.has(n)); taken.add(n); return n; };
const ID = { a: fresh(), aSp: fresh(), b: fresh(), c: fresh(), unknown: fresh() };
const mk = async (first, last, idn, sp) => (await sql(`insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, id_number, spouse_id_number, spouse_first_name, spouse_last_name, spouse_name)
  values (replace(gen_random_uuid()::text,'-',''), '${OFFICE}', '${first}', '${last}', 'delivered@resend.dev', 'active', '${sp ? 'married' : 'single'}', '${idn}', ${sp ? `'${sp}', 'רחל', '${last}', 'רחל ${last}'` : 'null, null, null, null'}) returning id`))[0].id;
const A = await mk('דוד', `${RUN}א`, ID.a, ID.aSp), B = await mk('מיכל', `${RUN}ב`, ID.b), C = await mk('יוסי', `${RUN}ג`, ID.c);
const CLIENTS = [A, B, C];
console.log(`לקוחות בדיקה: ${RUN} (${CLIENTS.length})`);

// ── קבצי PDF סינתטיים ──
const { loadProductCode, makePdf } = await import(pathToFileURL(resolve('scripts/e2e/shaam-filing-pdf.mjs')).href);
const P = await loadProductCode();
const tmp = mkdtempSync(join(tmpdir(), 'shaam-staging-'));
const files = {
  annual: [P.idomPage({ year: 2025, produced: '15/10/2026', rows: [
    { file: ID.a, name: 'דוד ו/או רחל', required: true, due: '31/10/2026', ft: '30', branch: '10', office: '39' },
    { file: ID.b, name: 'מיכל', required: true, due: '30/09/2026', filed: '07/06/2026', section: '00', ft: '52', branch: '01', office: '45' },
    { file: ID.unknown, name: 'יוסי', required: true, due: '30/11/2026', ft: '42', branch: '02', office: '24' },
  ] })],
  wealth: [P.ahzmPage({ group: 'unfiled_no_fine', rows: [{ file: ID.aSp, name: 'רחל ו/או דוד', year: '2025', due: '30.11.2026' }] })],
  filed: [P.ahzmPage({ group: 'filed_fine', rows: [{ file: ID.b, name: 'מיכל', year: '2023', due: '31.05.2024' }] })],
  later: [P.idomPage({ year: 2025, produced: '20/10/2026', rows: [
    { file: ID.a, name: 'דוד ו/או רחל', required: true, due: '31/10/2026', filed: '18/10/2026', section: '00', ft: '30', branch: '10', office: '39' },
  ] })],
};
const paths = {}; const shas = [];
for (const [k, pages] of Object.entries(files)) { const buf = await makePdf(P, pages); paths[k] = join(tmp, `${RUN}-${k}.pdf`); writeFileSync(paths[k], buf); shas.push(createHash('sha256').update(buf).digest('hex')); }

// ── סשן בלי סיסמה ──
const gl = await (await fetch(`${URL_}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: OFFICE_EMAIL }) })).json();
const session = await (await fetch(`${URL_}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: gl?.properties?.hashed_token ?? gl?.hashed_token }) })).json();
if (!session?.access_token) throw new Error('סשן staging לא נוצר');
const storageKey = `sb-${STAGING}-auth-token`;
const stored = JSON.stringify({ ...session, expires_at: session.expires_at ?? Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600) });

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { chromium } = createRequire(process.env.PW_CORE ?? 'C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json')('playwright-core');
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const obl = async () => sql(`select o.*, (select status from public.onboarding_steps s where s.id = o.step_id) step_status from public.shaam_filing_obligations o where o.user_id = '${OFFICE}' and o.file_number in (${Object.values(ID).map(x => `'${x}'`).join(',')}) order by o.file_number, o.year_shown`);

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
  const prodHits = [], blocked = [];
  await ctx.route('**/*', route => {
    const u = route.request().url(); const host = new URL(u).hostname;
    if (u.includes(PROD)) { prodHits.push(u); return route.abort(); }
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
    if (host === 'localhost' || host === `${STAGING}.supabase.co` || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    blocked.push(u); return route.abort();
  });
  await ctx.addInitScript(([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v); } catch { /* */ } }, [storageKey, stored]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const text = async (sel) => (await page.locator(sel).first().innerText().catch(() => '')) ?? '';
  const count = (sel) => page.locator(sel).count();
  const shot = async (n) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `staging-${n}.png`) }); };
  const upload = async (ks) => { await page.setInputFiles('[data-sf-file-input]', ks.map(k => paths[k])); await page.waitForSelector('[data-sf-review]', { timeout: 30000 }); await sleep(800); };
  const save = async () => { await page.click('[data-sf-save]'); await page.waitForSelector('[data-sf-saved], [data-sf-error]', { timeout: 30000 }); await sleep(1200); };

  const openWork = async () => {
    if (SURFACE === 'harness') await page.goto(`${BASE}/src/features/shaamFiling/__dev/index.html?only=${RUN}`);
    else if (!page.url().startsWith(BASE)) await page.goto(`${BASE}/#/tax/work`);
    else await page.evaluate(() => { location.hash = '#/tax/work'; });
    await page.waitForSelector('[data-shaam-filing-panel]', { timeout: 60000 }); await sleep(2500);
  };
  const openClientFile = async (id) => {
    if (SURFACE === 'harness') { await page.selectOption('[data-dev-client-pick]', id); await sleep(2500); return; }
    await page.evaluate((cid) => { location.hash = `#/client/${cid}/taxfile`; }, id);
    await page.waitForSelector('[data-sf-client-rows]', { timeout: 60000 }); await sleep(1000);
    await page.locator('[data-sf-client-rows]').scrollIntoViewIfNeeded();
  };
  await openWork();
  ok(await count('[data-shaam-filing-panel]') === 1, SURFACE === 'app' ? '«מס › עבודות לקוחות»: המקטע בראש הסקירה' : 'מסך הבדיקה עלה');
  if (SURFACE === 'harness') ok((await page.locator('[data-dev-client-pick] option').count()) === 3, 'שלושת לקוחות הבדיקה נטענו (ורק הם)');

  // ── העלאה ושמירה ──
  await upload(['annual', 'wealth']);
  const c1 = await text('[data-sf-counts]');
  ok(/זוהו 3/.test(c1) && /לבדיקה 1/.test(c1) && /חדשים 4/.test(c1), 'תצוגה: זוהו 3 (כולל בת הזוג), לבדיקה 1, חדשים 4', c1 + ' ‖ ' + (await page.locator('[data-sf-plan]').allInnerTexts()).join(' ‖ '));
  ok((await obl()).length === 0, 'התצוגה לא כתבה למסד');
  await shot('01-review');
  await save();
  ok(!(await count('[data-sf-error]')), 'שמירה לתיקים — בלי שגיאה', await text('[data-sf-error]'));
  let o = await obl();
  const oa = o.find(x => x.file_number === ID.a && x.kind === 'annual'), osp = o.find(x => x.file_number === ID.aSp), ob = o.find(x => x.file_number === ID.b), ou = o.find(x => x.file_number === ID.unknown);
  ok(o.length === 4, '4 שורות במסד', String(o.length));
  ok(oa?.client_id === A && oa.state === 'open' && oa.legal_due === '2026-10-31' && oa.match_kind === 'id', 'דוד: דוח 2025 פתוח, 31.10.2026, לפי ת.ז.', JSON.stringify(oa));
  ok(osp?.client_id === A && osp.subject_role === 'spouse' && osp.kind === 'wealth' && osp.year_shown === '2025' && osp.fine === false, 'רחל (בת הזוג): הצהרת הון 2025 בתיק של דוד, לפי ת.ז. בת הזוג');
  ok(ob?.client_id === B && ob.state === 'history' && ob.filed_on === '2026-06-07', 'מיכל: דוח 2025 — הוגש (היסטוריה)');
  ok(ou?.client_id === null && ou.state === 'needs_review' && ou.review_reason === 'unmatched', 'מספר לא מוכר — לבדיקה, בלי לקוח');
  const src = await sql(`select id, storage_path, content_sha256, list_kind, wealth_group, produced_on from public.shaam_filing_sources where user_id = '${OFFICE}' and content_sha256 in (${shas.map(s => `'${s}'`).join(',')})`);
  ok(src.length === 2 && src.every(s => s.storage_path === `${OFFICE}/shaam-filing/${s.content_sha256}.pdf`), 'שני מקורות נשמרו, כל אחד עם קובץ בדלי הפרטי של המשרד', JSON.stringify(src));
  const objs = await sql(`select name from storage.objects where bucket_id = 'office-imports' and name in (${src.map(s => `'${s.storage_path}'`).join(',') || "''"})`);
  ok(objs.length === 2, 'הקבצים קיימים בדלי office-imports');
  const anonGet = await fetch(`${URL_}/storage/v1/object/office-imports/${src[0]?.storage_path}`, { headers: { apikey: ANON } });
  ok(anonGet.status >= 400, 'הקובץ המקורי לא נגיש בלי התחברות', String(anonGet.status));
  ok(oa.evidence?.page === 1 && oa.evidence?.line === 1 && oa.evidence?.sourceId, 'ראיה: מקור, עמוד 1, שורה 1');

  // ── ייבוא חוזר ──
  await upload(['annual', 'wealth']);
  ok(/חדשים 0/.test(await text('[data-sf-counts]')) && /ללא שינוי 4/.test(await text('[data-sf-counts]')), 'אותם קבצים שוב — ללא שינוי 4', await text('[data-sf-counts]'));
  await save();
  ok((await obl()).length === 4 && (await sql(`select count(*)::int n from public.shaam_filing_sources where content_sha256 in (${shas.map(s => `'${s}'`).join(',')})`))[0].n === 2, 'אין כפילות — לא בשורות ולא במקורות');

  // ── «פתח בקשה» — דוח שנתי ──
  await page.locator(`[data-sf-open-one="${oa.id}"]`).click();
  await page.waitForSelector('[data-sf-open-dialog]'); await page.click('[data-sf-open-run]');
  await page.waitForSelector('[data-sf-open-result]', { timeout: 30000 });
  ok(await count('[data-sf-open-result="ok"]') === 1, '«פתח בקשה» לדוח — נפתחה', await text('[data-sf-open-dialog]'));
  await page.getByRole('button', { name: 'סגירה' }).last().click(); await sleep(1500);
  // ── הצהרת הון — עם יום הצהרה ──
  await page.locator(`[data-sf-open-one="${osp.id}"]`).click();
  await page.waitForSelector('[data-sf-open-dialog]');
  ok(await page.locator('[data-sf-open-run]').isDisabled(), 'הון: בלי יום הצהרה — הכפתור כבוי');
  await page.fill(`[data-sf-asof="${osp.id}"]`, '2025-12-31');
  await page.click('[data-sf-open-run]');
  await page.waitForSelector('[data-sf-open-result]', { timeout: 30000 });
  ok(await count('[data-sf-open-result="ok"]') === 1, 'הון — נפתחה ליום 31.12.2025 שנבחר', await text('[data-sf-open-dialog]'));
  await page.getByRole('button', { name: 'סגירה' }).last().click(); await sleep(1500);
  await shot('02-opened');
  o = await obl();
  const oa2 = o.find(x => x.id === oa.id), osp2 = o.find(x => x.id === osp.id);
  const steps = await sql(`select id, step_type, status, published_at, payload from public.onboarding_steps where client_id = '${A}' order by created_at`);
  const ar = steps.find(s => s.step_type === 'annual_return'), wd = steps.find(s => s.step_type === 'wealth_declaration');
  ok(ar && oa2.step_id === ar.id && String(ar.payload.taxYear) === '2025', 'דוח 2025 נפתח וקושר לחובה', JSON.stringify(steps.map(s => [s.step_type, s.status])));
  ok(ar?.payload?.work?.source === 'portal' && ar?.payload?.work?.deadline?.due === '2026-10-31' && ar?.payload?.work?.deadline?.status === 'reported', 'על הבקשה: מקור «מסך המייצגים», מועד 31.10.2026 «נמסר, לא מאומת»', JSON.stringify(ar?.payload?.work));
  ok(wd && osp2.step_id === wd.id && wd.payload.asOfDate === '2025-12-31', 'הצהרת הון ליום 31.12.2025 נפתחה וקושרה');
  const info = steps.filter(s => s.step_type === 'info_collection');
  ok(info.every(s => !s.published_at), 'שאלות הלקוח — טיוטה, לא פורסמו', JSON.stringify(info.map(s => s.published_at)));
  ok((await sql(`select count(*)::int n from public.email_messages where client_id in ('${A}','${B}','${C}')`))[0].n === 0, 'לא יצא שום מייל');
  ok((await sql(`select count(*)::int n from public.onboarding_events where step_id = '${ar.id}' and meta->>'what' = 'shaam_obligation_linked'`))[0].n === 1, 'נרשם על הבקשה: «נפתחה לפי חובה שנקלטה מרשימת שע״ם»');

  // ── קובץ חדש: הוגש ──
  await upload(['later']);
  await save();
  o = await obl();
  const oa3 = o.find(x => x.id === oa.id);
  const ar2 = (await sql(`select status, payload from public.onboarding_steps where id = '${ar.id}'`))[0];
  ok(oa3.state === 'filed_per_shaam' && oa3.filed_on === '2026-10-18' && oa3.history.length === 1, 'קובץ מ-20.10: «הוגש לפי שע״ם» 18.10.2026, הגרסה הקודמת בהיסטוריה');
  ok(ar2.status === ar.status && ar2.payload?.work?.shaamFiled?.filedOn === '2026-10-18', 'הבקשה סומנה «הוגש לפי שע״ם» ולא נסגרה', JSON.stringify([ar.status, ar2.status, ar2.payload?.work?.shaamFiled]));
  ok(o.find(x => x.id === osp.id).state === 'open', 'היעלמות מהרשימה (ההון של רחל לא בקובץ) — לא סגרה דבר');

  // ── היסטוריה ועותק ──
  await upload(['filed']); await save();
  await page.click('[data-sf-history] summary').catch(() => {}); await sleep(500);
  const hb = (await obl()).find(x => x.file_number === ID.b && x.kind === 'wealth');
  ok(hb?.state === 'history' && hb.fine === true && hb.year_shown === '2023', 'הצהרת הון 2023 של מיכל — היסטוריה, «חייב בקנס» כסימון');
  await page.locator(`[data-sf-copy="${hb.id}"]`).click();
  await page.waitForSelector(`[data-sf-history-row="requested"]`, { timeout: 30000 });
  const cp = (await sql(`select s.step_type, s.published_at, s.payload->>'flagKey' fk from public.shaam_filing_obligations o join public.onboarding_steps s on s.id = o.copy_step_id where o.id = '${hb.id}'`))[0];
  ok(cp?.step_type === 'custom_request' && !cp.published_at && cp.fk === `shaam_copy:${hb.id}`, 'בקשת עותק — בקשת מסמך קיימת, לא פורסמה');
  await shot('03-history');

  // ── שיוך ידני ──
  const ur = page.locator('[data-sf-review-row="unmatched"]', { hasText: ID.unknown }).first();
  await ur.locator('input[type=search]').fill(`${RUN}ג`); await sleep(300);
  await ur.locator('select').first().selectOption(C); await sleep(200);
  await ur.getByRole('button', { name: 'שייך לתיק' }).click(); await sleep(2000);
  const ou2 = (await obl()).find(x => x.id === ou.id);
  ok(ou2.client_id === C && ou2.state === 'open' && ou2.match_kind === 'manual', 'שיוך ידני ⇒ פתוחה בתיק של יוסי');

  // ── תיק הלקוח ──
  await openClientFile(A);
  const cr = await text('[data-sf-client-rows]');
  ok(/הוגש לפי שע״ם ב-18\.10\.2026/.test(cr) && /הצהרת הון — שנה כפי שמופיעה בשע״ם: 2025/.test(cr) && /בן\/בת הזוג/.test(cr), SURFACE === 'app' ? 'תיק המס של דוד ← «דוחות והצהרות»: הדוח «הוגש לפי שע״ם», הצהרת ההון של בת הזוג' : 'תיק דוד: הדוח «הוגש לפי שע״ם», הצהרת ההון של בת הזוג', cr);
  await shot('04-client');

  // ── גישה ──
  const anon = await fetch(`${URL_}/rest/v1/rpc/shaam_filing_list`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: '{}' });
  ok(anon.status === 401 || anon.status === 403 || anon.status === 404, 'anon — shaam_filing_list חסום', String(anon.status));
  const anonT = await fetch(`${URL_}/rest/v1/shaam_filing_obligations?select=id`, { headers: { apikey: ANON } });
  const anonRows = anonT.ok ? await anonT.json() : [];
  ok(!anonT.ok || anonRows.length === 0, 'anon — הטבלה לא נגישה', String(anonT.status));
  const stranger = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  let strangerErr = null;
  try { await as(stranger, `public.shaam_filing_list(null)`); } catch (e) { strangerErr = e.message; }
  ok(!!strangerErr && /forbidden|42501/.test(strangerErr), 'משתמש לא מורשה — «forbidden»', strangerErr);
  ok(prodHits.length === 0, 'אפס בקשות לייצור', prodHits.join(' | '));
  ok(blocked.length === 0, 'אין בקשות לכתובות אחרות', blocked.join(' | '));
  ok(errors.filter(e => !/favicon/.test(e)).length === 0, 'בלי שגיאות קונסול', errors.join(' | '));
  await ctx.close();
} catch (e) {
  fail++; console.log(`  ✗ הבדיקה נעצרה: ${String(e?.message ?? e).slice(0, 600)}`);
} finally {
  await browser.close();
  // ── ניקוי ──
  const ids = CLIENTS.map(c => `'${c}'`).join(',');
  const srcs = await sql(`select id, storage_path from public.shaam_filing_sources where user_id = '${OFFICE}' and content_sha256 in (${shas.map(s => `'${s}'`).join(',')})`);
  await sql(`
    delete from public.shaam_filing_obligations where user_id = '${OFFICE}' and file_number in (${Object.values(ID).map(x => `'${x}'`).join(',')});
    delete from public.shaam_filing_sources where id in (${srcs.map(s => `'${s.id}'`).join(',') || "'00000000-0000-0000-0000-000000000000'"});
    delete from public.tax_evidence where client_id in (${ids});
    delete from public.tax_year_facts where client_id in (${ids});
    delete from public.tax_info_asks where client_id in (${ids});
    delete from public.onboarding_events where step_id in (select id from public.onboarding_steps where client_id in (${ids}));
    delete from public.client_notice_items where step_id in (select id from public.onboarding_steps where client_id in (${ids}));
    delete from public.client_step_notice_state where step_id in (select id from public.onboarding_steps where client_id in (${ids}));
    delete from public.client_notices where client_id in (${ids});
    delete from public.email_messages where client_id in (${ids});
    delete from public.onboarding_steps where client_id in (${ids});
    delete from public.clients where id in (${ids});`);
  const filePaths = srcs.map(s => s.storage_path).filter(Boolean);
  if (filePaths.length) await fetch(`${URL_}/storage/v1/object/office-imports`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: filePaths }) });
  let left = 0;
  for (const t of await sql(`select table_name, column_name from information_schema.columns where table_schema='public' and column_name in ('client_id','linked_client_id') and table_name not like 'v\\_%'`)) {
    const n = (await sql(`select count(*)::int n from public."${t.table_name}" where "${t.column_name}" in (${ids})`).catch(() => [{ n: 0 }]))[0]?.n ?? 0;
    if (n) { left += n; console.log(`    שארית: ${t.table_name}.${t.column_name} = ${n}`); }
    await sleep(120);
  }
  const leftObl = (await sql(`select count(*)::int n from public.shaam_filing_obligations where file_number in (${Object.values(ID).map(x => `'${x}'`).join(',')})`))[0].n;
  const leftFiles = filePaths.length ? (await sql(`select count(*)::int n from storage.objects where bucket_id = 'office-imports' and name in (${filePaths.map(p => `'${p}'`).join(',')})`))[0].n : 0;
  ok(left === 0 && leftObl === 0 && leftFiles === 0, `ניקוי: אין שאריות (${CLIENTS.length} לקוחות, ${srcs.length} מקורות, ${filePaths.length} קבצים)`, `${left} ${leftObl} ${leftFiles}`);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${pass} עברו · ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
}
