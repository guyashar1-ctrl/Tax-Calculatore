#!/usr/bin/env node
/**
 * staging-test-280-portal-filings.mjs — «הדוחות שלך» בדף האישי (280) על staging, על לקוחות בדיקה בלבד.
 *
 * ‼ הלקוח קורא כמו הדפדפן: HTTP עם המפתח הציבורי (anon) וטוקן הדף. המשרד — ב-SQL בזהות משתמש הבדיקה.
 *   הנתונים (חובות שע״ם, בקשות) נכתבים ישירות ב-SQL ללקוחות הבדיקה של הריצה הזאת. אין מייל, אין רשות.
 * ‼ בסוף: ניקוי מלא (גם בכישלון).
 *
 * מה נבדק:
 *   1  הלקוח רואה רק את השורות שלו (לא של לקוח אחר באותו משרד), לפי שנה, החדשה ראשונה
 *   2  מה לא מגיע לדף: לבדיקה (needs_review), «לא שלנו» (dismissed), הקשר בלי «אין חובה» מפורש
 *   3  המצבים: הוגש · צריך ממך (בקשת-בת אצל הלקוח, עם stepId של הבקשה שבדף) · בהכנה אצלנו · בלי תג · אין חובת הגשה
 *   4  אין בתשובה מספר תיק, קנס, מקור או מצב פנימי
 *   5  בן/בת הזוג — בשם הפרטי מהכרטיס; מצב משפחתי ידוע שאינו «נשוי» ⇒ השורה לא מוצגת
 *   6  מעברים: בקשה שנסגרה ⇒ בלי תג; בקשת-בת שלא פורסמה ⇒ «בהכנה אצלנו»
 *   7  טוקן שגוי / שפג ⇒ {ok:false} בלי נתונים
 *   8  התצוגה במשרד (portal_filings_preview) = אותה תשובה; משרד אחר — forbidden; anon — חסום
 *   9  portal_filings ברשימת anon (assert_domain_function_invariants לא מונה אותה כחריגה)
 *
 *   הרצה:  node scripts/staging-test-280-portal-filings.mjs   (‏.env.local + .env.staging בשורש העותק)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, PROD_REF, writeStaging } from './staging-lib.mjs';

const envStaging = Object.fromEntries(readFileSync(resolve(ROOT, '.env.staging'), 'utf8').split(/\r?\n/)
  .map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const URL = envStaging.VITE_SUPABASE_URL, ANON = envStaging.VITE_SUPABASE_ANON_KEY;
if (!URL?.includes(STAGING_REF) || URL.includes(PROD_REF)) { console.error('✋ .env.staging אינו staging'); process.exit(1); }

const OFFICE = 'ca158d52-5ad7-47f5-b228-4b7703978b84';   // staging@pivo.test
const OTHER = 'e20269af-09f1-4cdf-bef9-63f12ee17554';    // qa-meetings@pivo.test — משרד אחר
const RUN = Date.now().toString(36).toUpperCase();
const LAST = `QAPF${RUN}`;

let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 400)}` : ''}`); };
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
const filings = async (token) => (await anonRpc('portal_filings', { p_token: token })).body;
const itemsOf = (res, year) => res?.years?.find(y => y.year === year)?.items ?? [];

const clients = [], sources = [];
const tok = () => `qa280${RUN.toLowerCase()}${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`;
async function newClient(first, extra = {}) {
  const token = tok();
  const r = await one(`insert into public.clients (user_id, first_name, last_name, email, lifecycle_stage, family_status, spouse_first_name, spouse_last_name, portal_token, portal_token_expires_at)
    values ('${OFFICE}', '${first}', '${LAST}', 'delivered@resend.dev', 'active', ${extra.family ? `'${extra.family}'` : 'null'},
      ${extra.spouse ? `'${extra.spouse}'` : 'null'}, ${extra.spouse ? `'${LAST}'` : 'null'}, '${token}', ${extra.expired ? `now() - interval '1 day'` : 'null'})
    returning id`);
  clients.push(r.id);
  return { id: r.id, token };
}
async function newStep(clientId, type, { status = 'in_progress', ball = 'me', published = true, payload = {} } = {}) {
  const r = await one(`insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, payload, published_at)
    values ('${OFFICE}', '${clientId}', '${type}', '${type === 'info_collection' ? 'tools' : 'internal'}', 'person', '${status}', '${ball}', ${lit(payload)}::jsonb, ${published ? 'now()' : 'null'})
    returning id`);
  return r.id;
}
let fileSeq = 0;
const fileNo = () => `9${String(Date.now() % 1e6).padStart(6, '0')}${String(++fileSeq).padStart(2, '0')}`;
const FILES = [];
async function obligation(clientId, o) {
  const f = fileNo(); FILES.push(f);
  await writeStaging(`insert into public.shaam_filing_obligations (user_id, kind, file_number, year_shown, tax_year, name_captured, required, legal_due, filed_on,
      wealth_group, fine, shaam_status, state, review_reason, client_id, subject_role, match_kind, step_id, source_id)
    values ('${OFFICE}', '${o.kind ?? 'annual'}', '${f}', '${o.year}', ${o.year}, 'שם פנימי ${LAST}', ${o.required ?? 'null'},
      ${o.due ? `'${o.due}'` : 'null'}, ${o.filed ? `'${o.filed}'` : 'null'}, ${o.group ? `'${o.group}'` : 'null'}, ${o.group ? 'true' : 'null'},
      '${o.shaam ?? 'open'}', '${o.state}', ${o.reason ? `'${o.reason}'` : 'null'}, '${clientId}', '${o.role ?? 'client'}', 'tax_file',
      ${o.step ? `'${o.step}'` : 'null'}, '${sources[0]}')`);
  return f;
}

async function cleanup() {
  if (clients.length) {
    const ids = clients.map(c => `'${c}'`).join(',');
    await writeStaging(`
      delete from public.shaam_filing_obligations where client_id in (${ids}) or name_captured = 'שם פנימי ${LAST}';
      delete from public.onboarding_events where step_id in (select id from public.onboarding_steps where client_id in (${ids}));
      delete from public.client_notice_items where step_id in (select id from public.onboarding_steps where client_id in (${ids}));
      delete from public.client_step_notice_state where step_id in (select id from public.onboarding_steps where client_id in (${ids}));
      delete from public.client_notices where client_id in (${ids});
      delete from public.accountant_notifications where client_id in (${ids});
      delete from public.onboarding_steps where client_id in (${ids});
      delete from public.clients where id in (${ids});`);
  }
  if (sources.length) await writeStaging(`delete from public.shaam_filing_sources where id in (${sources.map(s => `'${s}'`).join(',')});`);
  const [left] = await rows(`select (select count(*) from public.clients where last_name = '${LAST}')::int c,
    (select count(*) from public.shaam_filing_obligations where name_captured = 'שם פנימי ${LAST}')::int o`);
  console.log(left.c === 0 && left.o === 0 ? '  ✓ ניקוי — לא נשארו שאריות' : `  ✗ שאריות: ${JSON.stringify(left)}`);
  if (left.c || left.o) fail++;
}

console.log(`סביבה: ${STAGING_REF} · ריצה ${RUN}\n`);
try {
  // ── הכנה ──
  sources.push((await one(`insert into public.shaam_filing_sources (user_id, method, file_name, list_kind, produced_on, status, uploaded_by)
    values ('${OFFICE}', 'manual', 'בדיקה ${LAST}', 'annual', '2026-10-19', 'ok', '${OFFICE}') returning id`)).id);
  const A = await newClient('דוד', { family: 'married', spouse: 'רותי כהן' });
  const B = await newClient('משה');
  const EXP = await newClient('יעל', { expired: true });

  const annual25 = await newStep(A.id, 'annual_return', { payload: { taxYear: '2025', title: 'דוח שנתי 2025' } });
  const info25 = await newStep(A.id, 'info_collection', { status: 'waiting_client', ball: 'client', payload: { taxYear: '2025', title: 'הדוח השנתי 2025', parentStepId: annual25 } });
  const wealth25 = await newStep(A.id, 'wealth_declaration', { payload: { asOfDate: '2025-12-31', title: 'הצהרת הון' } });

  await obligation(A.id, { year: 2025, required: true, due: '2026-11-30', state: 'open', step: annual25 });
  await obligation(A.id, { year: 2025, kind: 'wealth', due: '2026-12-31', state: 'open', step: wealth25, group: 'unfiled_fine' });
  await obligation(A.id, { year: 2025, role: 'spouse', required: false, shaam: 'context', state: 'context' });
  await obligation(A.id, { year: 2024, required: true, due: '2025-05-31', filed: '2025-05-14', shaam: 'filed', state: 'history' });
  await obligation(A.id, { year: 2023, required: true, due: '2024-05-31', state: 'open' });
  await obligation(A.id, { year: 2022, required: true, due: '2023-05-31', state: 'needs_review', reason: 'name_mismatch' });
  await obligation(A.id, { year: 2021, required: true, due: '2022-05-31', state: 'dismissed', reason: 'not_ours' });
  await obligation(A.id, { year: 2020, shaam: 'context', state: 'context' });                // הקשר בלי «אין חובה» מפורש
  await obligation(B.id, { year: 2025, required: true, due: '2026-11-30', state: 'open' });
  await obligation(EXP.id, { year: 2025, required: true, due: '2026-11-30', state: 'open' });

  // ── 1 · רק השורות של A, לפי שנה ──
  console.log('1 · השורות של הלקוח בלבד');
  const a = await filings(A.token);
  ok(a?.ok === true, 'טוקן תקף ⇒ ok', a);
  ok(JSON.stringify(a.years.map(y => y.year)) === JSON.stringify([2025, 2024, 2023]), 'שנים: 2025, 2024, 2023 (החדשה ראשונה)', a.years?.map(y => y.year));
  ok(itemsOf(a, 2025).length === 3, '2025: שלוש שורות (שנתי, הון, בן/בת הזוג)', itemsOf(a, 2025));
  const b = await filings(B.token);
  ok(b?.ok && b.years.length === 1 && itemsOf(b, 2025).length === 1 && itemsOf(b, 2025)[0].person === 'משה', 'לקוח אחר רואה רק את השורה שלו', b);
  const [maxSrc] = await rows(`select to_char(max(coalesce(produced_on, uploaded_at::date)), 'YYYY-MM-DD') d from public.shaam_filing_sources where user_id = '${OFFICE}'`);
  ok(a.sourceDate === maxSrc.d && a.sourceDate >= '2026-10-19', `«לפי שע״ם» = המקור החדש של המשרד (${a.sourceDate})`, a.sourceDate);

  // ── 2 · מה לא מגיע לדף ──
  console.log('2 · מצבי בדיקה לא בדף');
  ok(!a.years.some(y => [2022, 2021, 2020].includes(y.year)), 'needs_review · dismissed · context בלי «אין חובה» — לא בדף', a.years.map(y => y.year));

  // ── 3 · המצבים ──
  console.log('3 · המצבים');
  const y25 = itemsOf(a, 2025);
  const an = y25.find(i => i.kind === 'annual' && i.role === 'client');
  const we = y25.find(i => i.kind === 'wealth');
  const sp = y25.find(i => i.role === 'spouse');
  ok(an?.status === 'client' && an.stepId === info25 && an.legalDue === '2026-11-30', 'דוח שנתי: «צריך ממך» — השאלון שבדף, עם המועד', an);
  ok(we?.status === 'office' && !we.stepId && we.legalDue === '2026-12-31', 'הצהרת הון: «בהכנה אצלנו»', we);
  ok(sp?.status === 'not_required' && sp.required === false && sp.person === 'רותי', 'בן/בת הזוג: «אין חובת הגשה», בשם הפרטי', sp);
  const f24 = itemsOf(a, 2024)[0];
  ok(f24?.status === 'filed' && f24.filedOn === '2025-05-14', '2024: «הוגש» עם תאריך ההגשה', f24);
  const n23 = itemsOf(a, 2023)[0];
  ok(n23?.status === 'none' && n23.legalDue === '2024-05-31', '2023: חובה פתוחה בלי בקשה ⇒ בלי תג, רק המועד', n23);
  ok(an?.person === 'דוד' && an.role === 'client', 'הלקוח — בשם הפרטי', an);
  ok(JSON.stringify(y25.map(i => `${i.role}:${i.kind}`)) === JSON.stringify(['client:annual', 'client:wealth', 'spouse:annual']), 'סדר: הלקוח לפני בן/בת הזוג, שנתי לפני הון', y25.map(i => `${i.role}:${i.kind}`));

  // ── 4 · אין מידע פנימי ──
  console.log('4 · אין מידע פנימי');
  const raw = JSON.stringify(a);
  // (המפתחות נבדקים למטה; כאן — ערכים: מספרי התיק, הקנס/הקבוצה, מצבי בדיקה והשם כפי שנקלט מהרשימה)
  const leaks = [...FILES.filter(f => raw.includes(f)), ...['fine', 'unfiled', 'needs_review', 'dismissed', 'context', 'name_mismatch', 'שם פנימי'].filter(k => raw.includes(k))];
  ok(leaks.length === 0, 'אין מספר תיק, קנס, מקור, מצב פנימי או השם שנקלט', leaks);
  ok(Object.keys(a).sort().join(',') === 'ok,sourceDate,years', 'מפתחות התשובה: ok, sourceDate, years', Object.keys(a));
  const allowed = new Set(['kind', 'person', 'role', 'required', 'legalDue', 'filedOn', 'status', 'stepId']);
  ok(a.years.every(y => y.items.every(i => Object.keys(i).every(k => allowed.has(k)))), 'כל שורה — רק השדות המותרים');

  // ── 5 · מצב משפחתי ──
  console.log('5 · בן/בת הזוג');
  await writeStaging(`update public.clients set family_status = 'divorced' where id = '${A.id}'`);
  ok(!itemsOf(await filings(A.token), 2025).some(i => i.role === 'spouse'), 'גרוש/ה ⇒ שורת בן/בת הזוג לא מוצגת');
  await writeStaging(`update public.clients set family_status = null where id = '${A.id}'`);
  ok(itemsOf(await filings(A.token), 2025).some(i => i.role === 'spouse'), 'מצב משפחתי לא ידוע ⇒ מוצגת');
  await writeStaging(`update public.clients set family_status = 'married' where id = '${A.id}'`);

  // ── 6 · מעברים ──
  console.log('6 · מעברים');
  await writeStaging(`update public.onboarding_steps set published_at = null where id = '${info25}'`);
  ok(itemsOf(await filings(A.token), 2025).find(i => i.kind === 'annual')?.status === 'office', 'השאלון לא פורסם ⇒ «בהכנה אצלנו» (הלקוח לא רואה אותו)');
  await writeStaging(`update public.onboarding_steps set published_at = now() where id = '${info25}'`);
  await writeStaging(`update public.onboarding_steps set status = 'completed', ball = 'me' where id = '${wealth25}'`);
  ok(itemsOf(await filings(A.token), 2025).find(i => i.kind === 'wealth')?.status === 'none', 'הבקשה המקושרת נסגרה, שע״ם עוד לא ⇒ בלי תג');

  // ── 7 · טוקן שגוי / שפג ──
  console.log('7 · טוקן');
  const bad = await filings('not-a-token-' + RUN);
  ok(bad?.ok === false && bad.error === 'invalid' && !bad.years, 'טוקן שגוי ⇒ invalid, בלי נתונים', bad);
  const exp = await filings(EXP.token);
  ok(exp?.ok === false && !exp.years, 'טוקן שפג ⇒ invalid, בלי נתונים', exp);
  const empty = await filings('');
  ok(empty?.ok === false && !empty.years, 'טוקן ריק ⇒ invalid', empty);

  // ── 8 · התצוגה במשרד ──
  console.log('8 · התצוגה במשרד');
  const pv = await asUser(OFFICE, `public.portal_filings_preview('${A.id}')`);
  const live = await filings(A.token);
  ok(JSON.stringify(pv) === JSON.stringify(live), 'portal_filings_preview = מה שהלקוח רואה', { pv, live });
  const foreign = await asUser(OTHER, `public.portal_filings_preview('${A.id}')`);
  ok(/forbidden|42501/.test(foreign?.thrown ?? ''), 'משרד אחר ⇒ forbidden', foreign);
  const anonPv = await anonRpc('portal_filings_preview', { p_client_id: A.id });
  ok(anonPv.status >= 400 && !anonPv.body?.years, `anon לא מריץ את התצוגה במשרד (HTTP ${anonPv.status})`, anonPv.body);
  const anonInner = await anonRpc('_portal_filings', { p_client_id: A.id });
  ok(anonInner.status >= 400 && !anonInner.body?.years, `anon לא מריץ את הבונה הפנימי (HTTP ${anonInner.status})`, anonInner.body);

  // ── 9 · רשימת anon ──
  console.log('9 · רשימת anon');
  let strays = '';
  try { await writeStaging('select public.assert_domain_function_invariants()'); } catch (e) { strays = /מחוץ לרשימה: ([^"\\\n]+)/.exec(String(e.message))?.[1] ?? ''; }
  ok(!/\bportal_filings\b/.test(strays), 'portal_filings אינה חריגה ב-assert_domain_function_invariants', strays);
} catch (e) {
  fail++; console.error('✗ שגיאה:', e.message);
} finally {
  await cleanup().catch(e => { fail++; console.error('✗ ניקוי נכשל:', e.message); });
}
console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
