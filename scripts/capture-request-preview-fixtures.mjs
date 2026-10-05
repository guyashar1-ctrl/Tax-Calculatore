#!/usr/bin/env node
/**
 * capture-request-preview-fixtures.mjs — לכידת «צפייה» להדגמה (?office-app).
 *
 * ההדגמה רצה על מסד מדומה, ואסור שתצייר בקשה מומצאת. כאן: לכל יעד × בחירה בספריית ההדגמה (src/features/requestPreview/captureCases.ts)
 * נשלחת הבקשה ל-preview_request_sample ב-staging, והתשובה נשמרת לפי מפתח הבקשה ב-src/components/office/__fixtures__/requestPreview.json.
 * ‼ staging בלבד (staging-lib). מסמכי הספרייה של ההדגמה נוספים לפרופיל ב-staging בתוך בקשה שמסתיימת ב-raise — שום דבר לא נשמר.
 *
 * שימוש (שרת ההדגמה רץ — launch.json «request-preview», פורט 5210):
 *   node scripts/capture-request-preview-fixtures.mjs [--base http://localhost:5210/]
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, sql, loadEnv } from './staging-lib.mjs';

const base = process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : 'http://localhost:5210/';
const OUT = resolve(ROOT, 'src/components/office/__fixtures__/requestPreview.json');
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();

function loadPlaywright() {
  for (const f of [resolve(ROOT, 'worker/package.json'), 'C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json']) {
    try { return createRequire(f)('playwright-core'); } catch { /* הבא */ }
  }
  throw new Error('playwright-core לא נמצא');
}

// ── 1 · המקרים — נבנים בדפדפן, מאותו קוד שהמסך משתמש בו ──────────────────────
const { chromium } = loadPlaywright();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await (await browser.newContext()).newPage();
await page.goto(`${base}?office-app`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('body');
const cases = await page.evaluate(async () => {
  const fake = await import('/src/components/office/__fakeBackend.ts');
  const { buildCaptureCases } = await import('/src/features/requestPreview/captureCases.ts');
  return buildCaptureCases(fake.demoLibraryForPreview());
});
await browser.close();
console.log(`מקרים: ${cases.length} (${cases.filter(c => !c.staging).length} בלי דרך ללכוד)`);

// ── 2 · staging ─────────────────────────────────────────────────────────────
const asUser = `with s as (select set_config('request.jwt.claim.sub', '${USER_ID}', true) a,
  set_config('request.jwt.claims', '{"sub":"${USER_ID}","role":"authenticated"}', true) b)`;
const lit = (o) => `$j$${JSON.stringify(o)}$j$::jsonb`;
// ‼ מצטבר: מה שכבר נלכד ולא השתנה (אותו מפתח) לא נשלח שוב — staging מגביל קצב. --force לוכד הכול מחדש.
const prior = process.argv.includes('--force') ? {} : (() => { try { return JSON.parse(readFileSync(OUT, 'utf8')).fixtures ?? {}; } catch { return {}; } })();
const fixtures = {};
const failed = [];

/** ‼ Supabase מגביל קצב — מנסים שוב אחרי המתנה (ThrottlerException). */
async function retrying(fn) {
  for (let i = 0; i < 8; i++) {
    try { return await fn(); } catch (e) {
      if (!/throttl|Too Many/i.test(String(e.message))) throw e;
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw new Error('throttled (8 ניסיונות)');
}
async function plain(c) {
  const rows = await retrying(() => sql(STAGING_REF, `${asUser} select public.preview_request_sample(${lit(c.staging)}) as r from s`));
  return rows[0].r;
}

const plainCases = cases.filter(c => c.staging && !c.needsDocs && !prior[c.key]);
let done = 0;
async function worker(list) {
  for (const c of list) {
    try {
      const r = await plain(c);
      if (r?.ok) fixtures[c.key] = r; else failed.push({ label: c.label, why: JSON.stringify(r).slice(0, 200) });
    } catch (e) { failed.push({ label: c.label, why: String(e.message).slice(0, 200) }); }
    if (++done % 25 === 0) console.log(`  ${done}/${plainCases.length}`);
  }
}
const lanes = [[], []];
plainCases.forEach((c, i) => lanes[i % lanes.length].push(c));
await Promise.all(lanes.map(worker));

// מקרים שתלויים במסמכי הספרייה — בטרנזקציה שמתבטלת (הפרופיל של staging לא משתנה)
const docCases = cases.filter(c => c.staging && c.needsDocs && !prior[c.key]);
if (docCases.length) {
  const docs = [...new Map(docCases.flatMap(c => c.needsDocs).map(d => [d.id, d])).values()];
  const block = `do $cap$
declare uid uuid := '${USER_ID}'; out jsonb := '[]'::jsonb; r jsonb; c jsonb;
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  update public.profiles set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{client_documents}', ${lit(docs)}) where id = uid;
  for c in select value from jsonb_array_elements(${lit(docCases.map(c => ({ key: c.key, req: c.staging })))}) loop
    r := public.preview_request_sample(c->'req');
    out := out || jsonb_build_object('k', c->>'key', 'r', r);
  end loop;
  raise exception 'FIXTURES:%', out::text;
end; $cap$;`;
  // ‼ fetch ישיר: sql() קוטע שגיאות ב-600 תווים, והתוצאות יושבות בשגיאה.
  const body = await retrying(async () => {
    const resp = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${loadEnv().SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: block }),
    });
    const text = await resp.text();
    if (resp.ok) return { ok: true, text };
    if (/Throttler/.test(text)) throw new Error('throttled');
    return { ok: false, text };
  });
  if (body.ok) failed.push({ label: 'מסמכים', why: 'הבקשה הסתיימה בלי raise — ייתכן שנשמר!' });
  else {
    let msg = body.text; try { msg = JSON.parse(body.text).message ?? body.text; } catch { /* טקסט */ }
    const m = msg.match(/FIXTURES:(\[.*\])/s);
    if (!m) failed.push({ label: 'מסמכים', why: msg.slice(0, 300) });
    else for (const x of JSON.parse(m[1].slice(0, m[1].lastIndexOf(']') + 1))) {
      if (x.r?.ok) fixtures[x.k] = x.r; else failed.push({ label: `מסמך ${x.k.slice(0, 40)}`, why: JSON.stringify(x.r).slice(0, 200) });
    }
  }
}

// המיתוג ושם המשרד — של משרד ההדגמה בזמן ההגשה (נתונים, לא נוסח); לא נשמרים כאן.
for (const f of Object.values(fixtures)) { delete f.branding; delete f.firmName; }
const merged = {};
for (const c of cases) { const v = fixtures[c.key] ?? prior[c.key]; if (v) merged[c.key] = v; }
writeFileSync(OUT, JSON.stringify({ capturedAt: new Date().toISOString(), source: `staging ${STAGING_REF}`, fixtures: merged }, null, 1));
console.log(`בקובץ ${Object.keys(merged).length} מתוך ${cases.length} (נלכדו עכשיו ${Object.keys(fixtures).length}) · נכשלו ${failed.length} · בלי דרך ללכוד ${cases.filter(c => !c.staging).length}`);
for (const f of failed.slice(0, 15)) console.log('  ✗', f.label, '—', f.why);
process.exitCode = failed.length ? 1 : 0;
