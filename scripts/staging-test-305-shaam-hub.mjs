#!/usr/bin/env node
/**
 * staging-test-305-shaam-hub.mjs — רשימות שע״ם (305) על staging, על לקוחות בדיקה בלבד.
 *
 * ‼ מחיל את supabase/305-shaam-hub-decisions.sql על staging (בטוח להחלה חוזרת), ובודק:
 *   1  שורה מזוהה נכתבת מיד; לא מזוהה ⇒ «לבדיקה» בלי לקוח
 *   2  חובה פתוחה חדשה ⇒ בקשה פנימית אחת (דוח שנתי) דרך upsert_tax_work; בן/בת הזוג באותה שנה ⇒ מקושר לאותה בקשה;
 *      הצהרת הון ⇒ לא נפתחת (חסר יום הצהרה); ייבוא חוזר ⇒ בלי בקשה שנייה
 *   3  הבקשה לא בדף האישי (build_client_portal), אין מייל ואין הודעה ללקוח, אין שאלון שפורסם
 *   4  ביטול העלאה: עדכון חוזר לערכים הקודמים; חובות שנוצרו נמחקות; בקשה שלא נגעו בה מבוטלת; קריאה שנייה — already
 *   5  בקשה שעבדו עליה / שורה שהמשרד שייך — נשארות, ומדווחות
 *   6  154 מהשרת: משימה שהסתיימה ⇒ חובה + בקשה; אותה אצווה כמו batchFromGmf154 (TS); קליטה מהדפדפן של אותה ריצה ⇒ בלי כפילות
 *   7  הרשאות: anon חסום, משרד אחר — לא מוצא את המקור
 *   8  rollback-305 מחזיר את הגופים של 250 ומוריד את החדשות; החלה מחדש של 305
 *
 *   הרצה:  node scripts/staging-test-305-shaam-hub.mjs   (‏.env.local + .env.staging; PIVO_CONFIG_ROOT לעותק אחר)
 */
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { ROOT, STAGING_REF, PROD_REF, writeStaging, loadEnv } from './staging-lib.mjs';

const envStaging = loadEnv('.env.staging');
const URL = envStaging.VITE_SUPABASE_URL, ANON = envStaging.VITE_SUPABASE_ANON_KEY;
if (!URL?.includes(STAGING_REF) || URL.includes(PROD_REF)) { console.error('✋ .env.staging אינו staging'); process.exit(1); }

const OFFICE = 'ca158d52-5ad7-47f5-b228-4b7703978b84';   // staging@pivo.test
const OTHER = 'e20269af-09f1-4cdf-bef9-63f12ee17554';    // qa-meetings@pivo.test — משרד אחר
const RUN = Date.now().toString(36).toUpperCase();
const LAST = `QA305${RUN}`;
const MIG = readFileSync(resolve(ROOT, 'supabase/305-shaam-hub-decisions.sql'), 'utf8');
const RB = readFileSync(resolve(ROOT, 'scripts/sql/305/rollback-305.sql'), 'utf8');
const SQL250 = readFileSync(resolve(ROOT, 'supabase/250-shaam-filing-obligations.sql'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 500)}` : ''}`); };
const lit = (v) => `$q$${typeof v === 'string' ? v : JSON.stringify(v)}$q$`;
const rows = async (q) => (await writeStaging(q)) ?? [];
const one = async (q) => (await rows(q))[0];
async function asUser(uid, expr) {
  try {
    const r = await one(`begin; set local role authenticated;
      select set_config('request.jwt.claims', ${lit({ sub: uid, role: 'authenticated' })}, true);
      select (${expr}) as r; commit;`);
    return r?.r;
  } catch (e) { await writeStaging('rollback;').catch(() => {}); return { thrown: e.message }; }
}
async function anonRpc(fn, args) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
}
const bodyMd5 = (txt, fn) => { const i = txt.indexOf(`function public.${fn}(`); const s = txt.indexOf('$$', i) + 2; return createHash('md5').update(txt.slice(s, txt.indexOf('$$', s))).digest('hex'); };

// ── batchFromGmf154 מה-TS עצמו (esbuild, כמו run-unit-tests) — לבדיקת התאמה מול _shaam_gmf154_batch ──
async function loadTs() {
  const tmp = mkdtempSync(join(tmpdir(), 'pivo-305-'));
  try {
    const out = join(tmp, 'gmf.mjs');
    await build({ entryPoints: [resolve(ROOT, 'src/features/shaamFiling/fromGmf154.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
    return await import(pathToFileURL(out).href);
  } finally { setTimeout(() => rmSync(tmp, { recursive: true, force: true }), 2000); }
}

const clients = [], jobs = [];
const base = String(Math.floor(Math.random() * 9e6) + 1e6);   // 7 ספרות לריצה
let seq = 0;
const fileNo = () => `8${base}${String(++seq).padStart(1, '0')}`.padStart(9, '0').slice(0, 9);
async function newClient(first, extra = {}) {
  const r = await one(`insert into public.clients (user_id, first_name, last_name, email, lifecycle_stage, family_status, spouse_first_name, spouse_last_name,
      spouse_id_number, tax_files, portal_token)
    values ('${OFFICE}', '${first}', '${LAST}', 'delivered@resend.dev', 'active', ${extra.spouse ? `'married'` : 'null'},
      ${extra.spouse ? `'${extra.spouse}'` : 'null'}, ${extra.spouse ? `'${LAST}'` : 'null'}, ${extra.spouseId ? `'${extra.spouseId}'` : 'null'},
      ${extra.file ? lit([{ authority: 'income_tax', fileNumber: extra.file }]) + '::jsonb' : `'[]'::jsonb`}, 'qa305${RUN.toLowerCase()}${clients.length}${Math.random().toString(36).slice(2, 14)}${Math.random().toString(36).slice(2, 14)}')
    returning id`);
  clients.push(r.id);
  return r.id;
}
const annualRow = (key, file, year, o = {}) => ({ sourceKey: key, page: 1, line: o.line ?? 1, fileNumber: file, name: o.name ?? LAST, yearShown: String(year),
  required: o.required ?? true, legalDue: o.due, legalDueRaw: o.due ? o.due.split('-').reverse().join('/') : undefined, filedOn: o.filed, filedOnRaw: o.filed ? o.filed.split('-').reverse().join('/') : undefined, problems: [] });
const src = (key, sha, kind, producedOn, group) => ({ key, method: 'pdf', fileName: `בדיקה ${LAST} ${key}.pdf`, sha256: sha, kind, group, producedOn, status: 'ok', pages: [] });
const importAs = (batch, uid = OFFICE) => asUser(uid, `public.shaam_filing_import(${lit(batch)}::jsonb)`);
const ob = async (file, year, kind = 'annual') => one(`select * from public.shaam_filing_obligations where user_id = '${OFFICE}' and kind = '${kind}' and file_number = '${file}' and year_shown = '${year}'`);
const stepsOf = async (cid, type = 'annual_return') => rows(`select id, status, ball, track, published_at, payload from public.onboarding_steps where client_id = '${cid}' and step_type = '${type}' order by created_at`);

async function cleanup() {
  const ids = clients.map(c => `'${c}'`).join(',') || `''`;
  await writeStaging(`
    delete from public.automation_jobs where id in (${jobs.map(j => `'${j}'`).join(',') || `''`});
    delete from public.shaam_filing_obligations where user_id = '${OFFICE}' and (client_id in (${ids}) or name_captured like '%${LAST}%');
    delete from public.shaam_filing_sources where user_id = '${OFFICE}' and (file_name like '%${LAST}%' or content_sha256 like 'qa305-${RUN}%'
      or content_sha256 in (select 'gmf154:' || j || ':' || k from unnest(array[${jobs.map(j => `'${j}'`).join(',') || `''`}]) j, unnest(array['annual','wealth']) k));
    delete from public.tax_info_asks where parent_step_id in (select id from public.onboarding_steps where client_id in (${ids}));
    delete from public.onboarding_events where step_id in (select id from public.onboarding_steps where client_id in (${ids}));
    delete from public.client_notice_items where step_id in (select id from public.onboarding_steps where client_id in (${ids}));
    delete from public.client_step_notice_state where step_id in (select id from public.onboarding_steps where client_id in (${ids}));
    delete from public.client_notices where client_id in (${ids});
    delete from public.accountant_notifications where client_id in (${ids});
    delete from public.onboarding_steps where client_id in (${ids});
    delete from public.clients where id in (${ids});`);
  const [left] = await rows(`select (select count(*) from public.clients where last_name = '${LAST}')::int c,
    (select count(*) from public.shaam_filing_obligations where name_captured like '%${LAST}%')::int o,
    (select count(*) from public.shaam_filing_sources where file_name like '%${LAST}%')::int s`);
  console.log(left.c + left.o + left.s === 0 ? '  ✓ ניקוי — לא נשארו שאריות' : `  ✗ שאריות: ${JSON.stringify(left)}`);
  if (left.c || left.o || left.s) fail++;
}

console.log(`סביבה: ${STAGING_REF} · ריצה ${RUN}\n`);
try {
  console.log('0 · החלת 305 על staging');
  await writeStaging(MIG);
  ok(true, '305 הוחלה');

  const FA = fileNo(), FS = fileNo(), FB = fileNo(), FX = fileNo(), FC = fileNo(), FR = fileNo(), FD = fileNo();
  const A = await newClient('דוד', { file: FA, spouse: 'רותי', spouseId: FS });
  const B = await newClient('משה', { file: FB });
  const C = await newClient('יעל', { file: FC });
  const D = await newClient('נועה', { file: FD });

  // ── 1+2 · ייבוא ראשון ──
  console.log('1 · נכתב מיד / לבדיקה');
  const S1 = `qa305-${RUN}-1`;
  const batch1 = {
    sources: [src('a', S1, 'annual', '2026-10-20'), src('w', `${S1}w`, 'wealth', '2026-10-20', 'unfiled_no_fine')],
    rows: [
      annualRow('a', FA, 2024, { due: '2025-05-31', line: 1 }),
      annualRow('a', FS, 2024, { due: '2025-05-31', line: 2, name: 'רותי' }),          // ת.ז. בן/בת הזוג ⇒ role spouse
      annualRow('a', FX, 2024, { due: '2025-05-31', line: 3 }),                         // לא מזוהה
      annualRow('a', FB, 2023, { due: '2024-05-31', filed: '2024-05-10', line: 4 }),    // הוגש ⇒ היסטוריה
      annualRow('a', FB, 2025, { due: '2026-11-30', line: 5 }),                         // פתוחה ⇒ בקשה
      { sourceKey: 'w', line: 1, fileNumber: FA, name: LAST, yearShown: '2024', legalDue: '2026-12-31', legalDueRaw: 'דרישה', problems: [] },
    ],
  };
  const r1 = await importAs(batch1);
  ok(r1?.ok === true, 'shaam_filing_import ⇒ ok', r1);
  const sum = r1?.summary ?? {};
  ok(sum.written === 5 && sum.review === 1, `נכתבו לתיקים 5 · לבדיקה 1 (קיבלנו ${sum.written} · ${sum.review})`, sum);
  ok(sum.opened === 2 && sum.needDay === 1 && sum.openFailed === 0, `נפתחו 2 בקשות · הון ממתין ליום הצהרה 1 (קיבלנו ${sum.opened} · ${sum.needDay})`, r1);
  const oA = await ob(FA, 2024), oS = await ob(FS, 2024), oX = await ob(FX, 2024), oB23 = await ob(FB, 2023), oB25 = await ob(FB, 2025), oW = await ob(FA, 2024, 'wealth');
  ok(oA?.client_id === A && oA.state === 'open' && oA.subject_role === 'client', 'מזוהה לפי תיק ⇒ נכתב לתיק A, פתוח', oA);
  ok(oS?.client_id === A && oS.subject_role === 'spouse', 'ת.ז. בן/בת הזוג ⇒ תיק A, נושא spouse (תפקיד)', oS);
  ok(oX?.state === 'needs_review' && !oX.client_id && oX.review_reason === 'unmatched', 'לא מזוהה ⇒ «לבדיקה», בלי לקוח', oX);
  ok(oB23?.state === 'history' && !oB23.step_id, 'הוגש ⇒ היסטוריה, בלי בקשה', oB23);
  ok(oW?.state === 'open' && !oW.step_id, 'הצהרת הון פתוחה ⇒ בלי בקשה (חסר יום הצהרה)', oW);

  console.log('2 · בקשה פנימית לבד');
  const stA = await stepsOf(A), stB = await stepsOf(B);
  ok(stA.length === 1 && stA[0].payload.taxYear == 2024 && stA[0].track === 'internal' && stA[0].ball === 'me' && stA[0].status === 'in_progress', 'A: בקשת «דוח שנתי 2024» אחת, פנימית, אצל המשרד', stA);
  ok(oA.step_id === stA[0]?.id && oS.step_id === stA[0]?.id, 'החובה של הלקוח ושל בן/בת הזוג מקושרות לאותה בקשה', { a: oA.step_id, s: oS.step_id });
  ok(stA[0]?.payload?.work?.source === 'portal' && stA[0]?.payload?.work?.deadline?.status === 'reported' && stA[0]?.payload?.work?.deadline?.due === '2025-05-31',
    'פרטי העבודה כמו «פתח בקשה»: מקור מסך המייצגים, מועד «נמסר» 31.05.2025', stA[0]?.payload?.work);
  ok(stB.length === 1 && oB25.step_id === stB[0].id, 'B: בקשת 2025 אחת, מקושרת', stB);
  const r1b = await importAs(batch1);
  ok(r1b?.ok && r1b.summary.opened === 0 && r1b.summary.linked === 0, 'ייבוא חוזר של אותו קובץ ⇒ 0 בקשות חדשות', r1b?.summary);
  ok((await stepsOf(A)).length === 1 && (await stepsOf(B)).length === 1, 'ייבוא חוזר ⇒ עדיין בקשה אחת לכל לקוח');
  const [srcCount] = await rows(`select count(*)::int n from public.shaam_filing_sources where user_id = '${OFFICE}' and content_sha256 = '${S1}'`);
  ok(srcCount.n === 1, 'ייבוא חוזר ⇒ אותו מקור (לא נוצר מקור שני)', srcCount);

  console.log('3 · לא בדף, בלי מייל');
  const portal = (await one(`select public.build_client_portal('${A}', 'live')::text as t`)).t;
  ok(!portal.includes(stA[0].id) && !portal.includes('דוח שנתי 2024'), 'build_client_portal(A) — הבקשה לא מופיעה', portal.slice(0, 300));
  const [mail] = await rows(`select (select count(*) from public.email_messages where client_id in ('${A}','${B}'))::int m,
    (select count(*) from public.client_notice_items where step_id in (select id from public.onboarding_steps where client_id in ('${A}','${B}')))::int n,
    (select count(*) from public.onboarding_steps where client_id in ('${A}','${B}') and step_type = 'info_collection')::int i,
    (select count(*) from public.tax_info_asks where parent_step_id in (select id from public.onboarding_steps where client_id in ('${A}','${B}')))::int q`);
  ok(mail.m === 0 && mail.n === 0, 'אין שורת מייל ואין הודעה ללקוח', mail);
  ok(mail.i === 0 && mail.q === 0, 'אין שאלון ואין שאלות (טיוטה או פרסום)', mail);

  // ── 4 · ביטול: עדכון ואז מקור ראשון ──
  console.log('4 · ביטול העלאה');
  const S2 = `qa305-${RUN}-2`;
  const before = await ob(FA, 2024);
  const r2 = await importAs({ sources: [src('a', S2, 'annual', '2026-10-22')], rows: [annualRow('a', FA, 2024, { due: '2025-06-30' })] });
  const afterUpd = await ob(FA, 2024);
  ok(r2?.ok && r2.counts.updated === 1 && afterUpd.legal_due === '2025-06-30', 'העלאה שנייה מעדכנת מועד', { c: r2?.counts, d: afterUpd?.legal_due });
  const src2 = (await one(`select id from public.shaam_filing_sources where user_id = '${OFFICE}' and content_sha256 = '${S2}'`)).id;
  const src1 = (await one(`select id from public.shaam_filing_sources where user_id = '${OFFICE}' and content_sha256 = '${S1}'`)).id;
  const src1w = (await one(`select id from public.shaam_filing_sources where user_id = '${OFFICE}' and content_sha256 = '${S1}w'`)).id;
  const blocked = await asUser(OFFICE, `public.undo_shaam_filing_source('${src1}')`);
  ok(blocked?.ok && blocked.kept.some(k => k.obligationId === oA.id && k.reason === 'newer_upload'), 'ביטול הראשון לפני השני ⇒ השורה שהשנייה אישרה נשמרת (newer_upload)', blocked);
  // ‼ הביטול למעלה כבר רץ; בונים מחדש תרחיש נקי לביטול מלא בהמשך (A ו-B)
  const u2 = await asUser(OFFICE, `public.undo_shaam_filing_source('${src2}')`);
  const back = await ob(FA, 2024);
  ok(u2?.ok && u2.restored === 1 && back?.legal_due === before.legal_due && back.history.length === before.history.length,
    `ביטול השנייה ⇒ המועד חזר ל-${before.legal_due}, ההיסטוריה כמו קודם`, { u2, d: back?.legal_due });
  const u2b = await asUser(OFFICE, `public.undo_shaam_filing_source('${src2}')`);
  ok(u2b?.ok && u2b.already === true, 'ביטול שני של אותו מקור ⇒ already, בלי שינוי', u2b);

  // הביטול החוסם של S1 כבר סימן את כל השפעות S1 — מה נמחק ומה נשאר:
  ok(blocked.deleted >= 3 && blocked.cancelledRequests === 1, `ביטול S1: נמחקו ${blocked.deleted} · בקשה בוטלה ${blocked.cancelledRequests} (B 2025)`, blocked);
  ok(!(await ob(FX, 2024)) && !(await ob(FB, 2023)) && !(await ob(FB, 2025)), 'החובות שנוצרו (לבדיקה · היסטוריה · B 2025) נמחקו');
  const stB2 = await stepsOf(B);
  ok(stB2.length === 1 && stB2[0].status === 'cancelled' && stB2[0].payload.removal, 'בקשת B שלא נגעו בה ⇒ בוטלה (נשמרת בהיסטוריה, ניתנת להחזרה)', stB2);
  ok((await stepsOf(A))[0]?.status === 'in_progress' && blocked.keptRequests.length === 0, 'בקשת A נשארה — החובה שלה נשמרה (newer_upload); בן/בת הזוג נמחק', blocked.keptRequests);
  const uW = await asUser(OFFICE, `public.undo_shaam_filing_source('${src1w}')`);
  ok(uW?.ok && uW.deleted === 1 && !(await ob(FA, 2024, 'wealth')), 'ביטול מקור ההון ⇒ החובה נמחקה', uW);
  const u1again = await asUser(OFFICE, `public.undo_shaam_filing_source('${src1}')`);
  ok(u1again?.ok && u1again.already === true, 'ביטול S1 שוב ⇒ already', u1again);
  const list = await asUser(OFFICE, `public.shaam_filing_list(null)`);
  const s1row = list?.sources?.find(s => s.id === src1);
  ok(s1row && s1row.canUndo === false && s1row.undoneAt && s1row.undo?.deleted >= 3, 'shaam_filing_list: המקור מסומן «בוטל», בלי «ביטול» נוסף', s1row);

  // ── 5 · נגעו בבקשה / המשרד שייך ──
  console.log('5 · מה שאדם עשה — נשאר');
  const S3 = `qa305-${RUN}-3`;
  const r3 = await importAs({ sources: [src('a', S3, 'annual', '2026-10-23')], rows: [annualRow('a', FC, 2024, { due: '2025-05-31' }), annualRow('a', FR, 2024, { due: '2025-05-31', line: 2 })] });
  ok(r3?.ok && r3.summary.opened === 1 && r3.summary.review === 1, 'C: בקשה נפתחה; שורה לא מזוהה ⇒ לבדיקה', r3?.summary);
  const oC = await ob(FC, 2024), oR = await ob(FR, 2024);
  await writeStaging(`insert into public.onboarding_events (user_id, step_id, type, actor, note) values ('${OFFICE}', '${oC.step_id}', 'note', 'accountant', 'המשרד התחיל לעבוד')`);
  const rs = await asUser(OFFICE, `public.resolve_shaam_obligation('${oR.id}', '${D}', 'client')`);
  ok(rs?.ok, 'המשרד שייך את השורה שבבדיקה ל-D', rs);
  const src3 = (await one(`select id from public.shaam_filing_sources where user_id = '${OFFICE}' and content_sha256 = '${S3}'`)).id;
  const u3 = await asUser(OFFICE, `public.undo_shaam_filing_source('${src3}')`);
  ok(u3?.ok && u3.keptRequests.some(k => k.stepId === oC.step_id && k.reason === 'worked_on'), 'בקשה שעבדו עליה ⇒ נשארת, מדווחת (worked_on)', u3);
  ok((await stepsOf(C))[0]?.status === 'in_progress' && !!(await ob(FC, 2024)), 'הבקשה והחובה של C במקומן');
  ok(u3.kept.some(k => k.obligationId === oR.id && k.reason === 'office_changed') && (await ob(FR, 2024))?.client_id === D, 'שורה שהמשרד שייך אחרי ההעלאה ⇒ נשארת (office_changed)', u3.kept);

  // ── 6 · 154 מהשרת ──
  console.log('6 · 154 — משימה שהסתיימה');
  const ts = await loadTs();
  const filing = {
    years: [
      { year: 2025, page: 1, required: 'required', requiredRaw: 'ח', filedOn: null, filedRaw: null, legalDue: '2026-04-30', legalDueRaw: '30/04/2026', extension: null, extensionRaw: null, extensionSource: null, section: '00', sectionText: null },
      { year: 2024, page: 1, required: 'required', requiredRaw: 'ח', filedOn: null, filedRaw: null, legalDue: '2025-04-30', legalDueRaw: '30/04/2025', extension: '2025-08-31', extensionRaw: '31/08/2025', extensionSource: 'הכנה', section: '00', sectionText: null },
      { year: 2023, page: 1, required: 'required', requiredRaw: 'ח', filedOn: '2024-05-01', filedRaw: '01/05/2024', legalDue: '2024-04-30', legalDueRaw: '30/04/2024', extension: null, extensionRaw: null, extensionSource: null, section: '00', sectionText: null },
      { year: 2022, page: 2, required: 'not_required', requiredRaw: '', filedOn: null, filedRaw: null, legalDue: null, legalDueRaw: null, extension: null, extensionRaw: null, extensionSource: null, section: null, sectionText: null },
    ],
    wealth: [{ year: 2024, text: 'דרישה עד 31/12/2026', due: '2026-12-31', passed: false }, { year: 2019, text: 'הענות 22/07/2020', due: '2020-07-22', passed: true }],
    pagesRead: 2, complete: true, name: `נועה ${LAST}`,
  };
  const job = (await one(`insert into public.automation_jobs (user_id, client_id, action_type, input, status, claimed_by, claimed_at, attempts)
    values ('${OFFICE}', '${D}', 'shaam.sync_income_tax_file', ${lit({ fileNumber: FD })}::jsonb, 'running', 'qa305', now(), 1) returning id`)).id;
  jobs.push(job);
  const sqlBatch = (await one(`select public._shaam_gmf154_batch('${OFFICE}', '${D}', ${lit(filing)}::jsonb, '${FD}', '${job}', '2026-10-26') as b`)).b;
  const tsBatch = ts.batchFromGmf154(filing, { fileNumber: FD, runId: job, producedOn: '2026-10-26', knownAnnualYears: new Set(), listWealthYears: new Set() });
  const norm = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, y]) => y !== undefined).sort(([a], [b]) => a.localeCompare(b))) : v));
  ok(norm(sqlBatch) === norm(tsBatch), '_shaam_gmf154_batch = batchFromGmf154 (TS) — אותה אצווה בדיוק', { sql: sqlBatch, ts: tsBatch });
  await writeStaging(`update public.automation_jobs set status = 'succeeded', finished_at = now(), result = ${lit({ filing })}::jsonb where id = '${job}'`);
  const d24 = await ob(FD, 2024), d25 = await ob(FD, 2025), dw = await ob(FD, 2024, 'wealth'), dw19 = await ob(FD, 2019, 'wealth');
  ok(d24?.client_id === D && d24.state === 'open' && d24.legal_due === '2025-08-31' && d24.step_id, '154 ⇒ D 2024 פתוחה (מועד הארכה), עם בקשה — בלי שאיש פתח את התיק', d24);
  ok(d25?.state === 'open' && d25.step_id && d25.step_id !== d24.step_id, '154 ⇒ D 2025 פתוחה, בקשה נפרדת לשנה אחרת', d25);
  ok(dw?.state === 'open' && !dw.step_id && dw19?.state === 'history', 'הון 2024 פתוחה בלי בקשה; «הענות» 2019 ⇒ הוגשה', { dw: dw?.state, dw19: dw19?.state });
  const stD = await stepsOf(D);
  const sources154 = await rows(`select id from public.shaam_filing_sources where user_id = '${OFFICE}' and content_sha256 like 'gmf154:${job}:%'`);
  const again = await importAs(tsBatch);
  ok(again?.ok && again.summary.opened === 0 && (await stepsOf(D)).length === stD.length, 'קליטה מהדפדפן של אותה ריצה ⇒ בלי בקשה נוספת', again?.summary);
  const sources154b = await rows(`select id from public.shaam_filing_sources where user_id = '${OFFICE}' and content_sha256 like 'gmf154:${job}:%'`);
  ok(sources154.length === 2 && sources154b.length === 2, 'אותה ריצה ⇒ אותם שני מקורות (שנתי + הון)', sources154b);
  const [jobRow] = await rows(`select status from public.automation_jobs where id = '${job}'`);
  ok(jobRow.status === 'succeeded', 'סיום המשימה לא הושפע מהקליטה');

  // ── 7 · הרשאות ──
  console.log('7 · הרשאות');
  const anonUndo = await anonRpc('undo_shaam_filing_source', { p_source_id: src3 });
  ok(anonUndo.status >= 400, `anon לא מריץ undo (HTTP ${anonUndo.status})`, anonUndo.body);
  const anonInner = await anonRpc('_shaam_filing_import', { p_uid: OFFICE, p_batch: batch1 });
  ok(anonInner.status >= 400, `anon לא מריץ את הקליטה הפנימית (HTTP ${anonInner.status})`, anonInner.body);
  const authInner = await asUser(OFFICE, `public._shaam_filing_import('${OFFICE}', '{}'::jsonb)`);
  ok(/permission denied|42501/.test(authInner?.thrown ?? ''), 'authenticated לא מריץ את הקליטה הפנימית ישירות', authInner);
  const foreign = await asUser(OTHER, `public.undo_shaam_filing_source('${src3}')`);
  ok(foreign?.ok === false && foreign.error === 'not_found', 'משרד אחר ⇒ not_found', foreign);
  const [acl] = await rows(`select has_function_privilege('anon', 'public.undo_shaam_filing_source(uuid)', 'execute') a,
    has_function_privilege('authenticated', 'public._shaam_auto_open(uuid,uuid)', 'execute') b,
    has_table_privilege('authenticated', 'public.shaam_filing_source_effects', 'select') c`);
  ok(!acl.a && !acl.b && !acl.c, 'ACL: anon בלי undo; authenticated בלי עזרים פנימיים ובלי טבלת ההשפעות', acl);

  // ── 8 · rollback ──
  console.log('8 · rollback-305');
  await writeStaging(RB);
  const [fns] = await rows(`select md5(p.prosrc) m from pg_proc p where p.proname = 'shaam_filing_import'`);
  const [lst] = await rows(`select md5(p.prosrc) m from pg_proc p where p.proname = 'shaam_filing_list'`);
  const [gone] = await rows(`select count(*)::int n from pg_proc where proname in ('undo_shaam_filing_source','_shaam_filing_import','_shaam_auto_open','_shaam_gmf154_batch','_shaam_filing_from_gmf154_job','_shaam_auto_request_untouched')`);
  const [trg] = await rows(`select count(*)::int n from pg_trigger where tgname = 'trg_shaam_filing_from_gmf154_job'`);
  ok(fns.m === bodyMd5(SQL250, 'shaam_filing_import') && lst.m === bodyMd5(SQL250, 'shaam_filing_list'), 'אחרי rollback: shaam_filing_import ו-shaam_filing_list = הגוף של 250', { fns, lst });
  ok(gone.n === 0 && trg.n === 0, 'אחרי rollback: הפונקציות והטריגר של 305 ירדו', { gone, trg });
  await writeStaging(MIG);
  const [back305] = await rows(`select count(*)::int n from pg_proc where proname in ('undo_shaam_filing_source','_shaam_filing_import','_shaam_gmf154_batch')`);
  ok(back305.n === 3, '305 הוחלה מחדש (staging נשאר עם 305)');
} catch (e) {
  fail++; console.error('✗ שגיאה:', e.message);
} finally {
  await cleanup().catch(e => { fail++; console.error('✗ ניקוי נכשל:', e.message); });
}
console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
