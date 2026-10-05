#!/usr/bin/env node
/**
 * staging-test-219-ni-income.mjs — רשימת ההכנסות בב"ל (219) מול המסד, דרך PostgREST.
 *
 * מה נבדק, כמשתמש המשרד (JWT אמיתי, לא service role):
 *   · שאילתת ההיסטוריה של האתר (fetchSucceededJobsPage): הכינוי persons:result->persons,
 *     סדר מהחדשה לישנה, עמודים של 5 בלי כפילות/השמטה, בידוד מלקוח אחר.
 *   · propose_tax_facts → accept_tax_fact_change → טעינה מחדש: niIncomeList ללקוח,
 *     spouseNiIncomeList לבן/בת הזוג — כל אחד בעמודה שלו; ניקוי niIncomeBasisMonthly
 *     ל-NULL; רשימה ריקה; field_meta.source='automation'; יומן עם הערך הקודם.
 *   · הגנה: update_client_fields ו-UPDATE ישיר לא כותבים לעמודות המנוהלות;
 *     stale_conflict לא דורס ערך שהשתנה מאז ההצעה.
 *
 * ‼ לקוחות סינתטיים בלבד ('niinc-…'), נמחקים בסוף.
 *   node scripts/staging-test-219-ni-income.mjs            — בדיקה מלאה + ניקוי
 *   node scripts/staging-test-219-ni-income.mjs --keep     — משאיר לקוח לבדיקת דפדפן (מדפיס את המזהה)
 *   node scripts/staging-test-219-ni-income.mjs --cleanup  — מוחק את כל 'niinc-%'
 */
import { createClient } from '@supabase/supabase-js';
import { loadEnv, writeStaging } from './staging-lib.mjs';

const env = loadEnv('.env.staging');
const opts = { auth: { autoRefreshToken: false, persistSession: false } };
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
/** השוואת JSON בלי תלות בסדר המפתחות (jsonb ממיין אותם). */
const sameJson = (a, b) => { const n = (x) => (x && typeof x === 'object' && !Array.isArray(x)) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, n(x[k])])) : Array.isArray(x) ? x.map(n) : x; return JSON.stringify(n(a)) === JSON.stringify(n(b)); };

async function cleanup() {
  const rows = await writeStaging(`select id from public.clients where id like 'niinc-%'`);
  for (const r of rows) {
    await writeStaging(`delete from public.automation_jobs where client_id = ${q(r.id)};
      delete from public.tax_fact_changes where client_id = ${q(r.id)};
      delete from public.clients where id = ${q(r.id)};`);
  }
  console.log(`ניקוי: ${rows.length} לקוחות סינתטיים נמחקו`);
}
if (process.argv.includes('--cleanup')) { await cleanup(); process.exit(0); }

async function signIn(email, password) {
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, opts);
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error || !data?.session) throw new Error(`signIn ${email}: ${error?.message}`);
  return {
    id: data.session.user.id,
    db: createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
      ...opts, global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    }),
  };
}

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`✓ ${name}`); }
  else { fail++; console.log(`✗ ${name}${detail ? ' — ' + JSON.stringify(detail).slice(0, 400) : ''}`); }
};
const rpc = async (db, fn, args) => {
  const { data, error } = await db.rpc(fn, args);
  return error ? { ok: false, error: error.message, pgError: true } : data;
};

const TAG = Date.now().toString(36);
const A = `niinc-${TAG}-a`;   // לקוח: שומה שנרשמה בעבר «47,800 לחודש»; בן/בת זוג: הצהרה 16,500
const B = `niinc-${TAG}-b`;   // לקוח אחר — בידוד
const office = await signIn(env.VITE_DEV_USER_EMAIL, env.VITE_DEV_USER_PASSWORD);
const AUTO = (at) => ({ source: 'automation', syncedAt: at });

const DECL = { year: 2025, fromMonth: 6, toMonth: 6, infoSource: 'הצהרה', incomeSource: 'עצמאי', amount: 16500, receivedDate: '2025-06-15', status: 'תקף' };
const ASSESS = { year: 2025, fromMonth: 1, toMonth: 12, infoSource: 'שומה עצמי', incomeSource: 'עצמאי', amount: 47800, receivedDate: '2026-09-05', status: 'תקף' };
const complete = (records) => ({ ok: true, value: null, records, rows: records.length, omitted: 0, candidatesComplete: true });

try {
  // ── לקוחות סינתטיים (כמו אחרי קריאה שלפני 219) ──
  await writeStaging(`
    insert into public.clients (id, user_id, first_name, last_name, family_status, spouse_first_name, spouse_id_number,
        ni_income_basis_monthly, spouse_ni_income_basis_monthly, ni_insurance_basis, field_meta)
    values (${q(A)}, ${q(office.id)}, 'בדיקה', 'NIINC-לקוח', 'married', 'בת-זוג', '300000007',
        47800, 16500,
        ${q(JSON.stringify({ year: 2026, fromMonth: 10, toMonth: 12, months: 3, periodBasis: 16708, advanceMonthly: 429, category: 'עצמאי' }))}::jsonb,
        ${q(JSON.stringify({ niIncomeBasisMonthly: AUTO('2026-09-23T10:00:00Z'), spouseNiIncomeBasisMonthly: AUTO('2026-09-23T10:00:00Z'), niInsuranceBasis: AUTO('2026-09-23T10:00:00Z') }))}::jsonb),
      (${q(B)}, ${q(office.id)}, 'אחר', 'NIINC-לקוח', 'single', null, null, null, null, null, '{}'::jsonb);`);

  // ── היסטוריית קריאות: 12 משימות שהצליחו ללקוח A + 1 ל-B ──
  // j1 (הכי ישנה) — הצהרה תקפה ללקוח; j2 — קריאה שלמה סותרת (רק שומה); j3..j12 — לא קשורות/חלקיות.
  const jobs = [];
  const job = async (client, minute, persons) => {
    const id = `niinc-${TAG}-j${jobs.length + 1}`;
    jobs.push({ id, client, minute });
    await writeStaging(`
      insert into public.automation_jobs (id, user_id, client_id, action_type, input, status)
      values (${q(id)}, ${q(office.id)}, ${q(client)}, 'btl.sync_file', '{}'::jsonb, 'running');
      update public.automation_jobs set status = 'succeeded',
        finished_at = ${q(`2026-10-05T08:${String(minute).padStart(2, '0')}:00Z`)}::timestamptz,
        result = ${q(JSON.stringify({ system: 'btl', area: 'insured_file', persons }))}::jsonb
      where id = ${q(id)};`);
  };
  await job(A, 1, [{ role: 'client', ok: true, sections: { directIncome: complete([DECL]) } }]);
  await job(A, 2, [{ role: 'client', ok: true, sections: { directIncome: complete([ASSESS]) } },
                   { role: 'spouse', ok: true, sections: { directIncome: complete([DECL]) } }]);
  for (let m = 3; m <= 12; m++) {
    await job(A, m, m % 2
      ? [{ role: 'spouse', ok: true, sections: { directIncome: complete([DECL]) } }]
      : [{ role: 'client', ok: true, sections: { directIncome: { ok: false, reason: 'table_not_found' } } }]);
  }
  await job(B, 30, [{ role: 'client', ok: true, sections: { directIncome: complete([]) } }]);

  // ── שאילתת ההיסטוריה של האתר — אותה שאילתה בדיוק (src/lib/automationJobs.ts) ──
  const page = async (clientId, offset, limit) => {
    const { data, error } = await office.db.from('automation_jobs')
      .select('id, finished_at, updated_at, persons:result->persons')
      .eq('client_id', clientId).eq('action_type', 'btl.sync_file').eq('status', 'succeeded')
      .order('finished_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false })
      .range(offset, offset + limit - 1);
    return { data, error };
  };
  const pages = [];
  for (let off = 0; ; off += 5) {
    const r = await page(A, off, 5);
    if (r.error) { ok('היסטוריה: עמוד נקרא', false, r.error); break; }
    pages.push(r.data);
    if (r.data.length < 5) break;
  }
  const seen = pages.flat();
  ok('היסטוריה: 3 עמודים (5+5+2)', pages.map(p => p.length).join('+') === '5+5+2', pages.map(p => p.length));
  ok('היסטוריה: 12 משימות, בלי כפילות', seen.length === 12 && new Set(seen.map(s => s.id)).size === 12);
  ok('היסטוריה: מהחדשה לישנה', seen.every((s, i) => i === 0 || seen[i - 1].finished_at >= s.finished_at));
  ok('היסטוריה: הכינוי persons מחזיר את מערך האנשים', Array.isArray(seen[0].persons) && seen[0].persons[0]?.role,
    seen[0]);
  ok('היסטוריה: אין משימה של לקוח אחר', !seen.some(s => jobs.find(j => j.id === s.id)?.client !== A));
  // הקריאה השלמה האחרונה של הלקוח היא j2 (סותרת) — מעבר ל-10 משימות לא קשורות.
  const firstCompleteClient = seen.find(s => s.persons?.some(p => p.role === 'client' && p.ok && p.sections?.directIncome?.candidatesComplete));
  ok('היסטוריה: הקריאה השלמה האחרונה של הלקוח היא הסותרת (j2), מעבר לעמוד הראשון',
    firstCompleteClient?.id === `niinc-${TAG}-j2`, firstCompleteClient?.id);

  if (process.argv.includes('--keep')) {
    console.log(`\nנשאר לבדיקת דפדפן: לקוח ${A} (ולקוח ${B}). למחוק: --cleanup`);
    console.log(`\n${pass} עברו, ${fail} נכשלו`);
    process.exit(fail ? 1 : 0);
  }

  // ── propose → accept → טעינה מחדש ──
  const before = (await writeStaging(`select ni_income_basis_monthly, spouse_ni_income_basis_monthly from public.clients where id = ${q(A)}`))[0];
  const items = [
    { field_key: 'niIncomeList', label: 'niIncomeList',
      old_value: { display: '—', patch: { niIncomeList: null } },
      new_value: { display: 'שומה עצמי · ינואר–דצמבר 2025: 47,800 ₪ לשנה', patch: { niIncomeList: { declaration: null, assessment: ASSESS } } },
      note: 'ביטוח לאומי: עיסוקים והכנסות → רשימת הכנסות' },
    { field_key: 'niIncomeBasisMonthly', label: 'niIncomeBasisMonthly',
      old_value: { display: '47,800 ₪ לחודש', patch: { niIncomeBasisMonthly: 47800 } },
      new_value: { display: 'אין הצהרה חודשית — השדה יתרוקן', patch: { niIncomeBasisMonthly: null } },
      note: 'ביטוח לאומי: רשימת הכנסות · אין הצהרה תקפה · שומה עצמי · ינואר–דצמבר 2025' },
    { field_key: 'spouseNiIncomeList', label: 'spouseNiIncomeList',
      old_value: { display: '—', patch: { spouseNiIncomeList: null } },
      new_value: { display: 'הצהרה · יוני 2025: 16,500 ₪ לחודש', patch: { spouseNiIncomeList: { declaration: DECL, assessment: null } } } },
  ];
  const prop = await rpc(office.db, 'propose_tax_facts', { p_client_id: A, p_source: 'automation', p_source_ref: 'btl.sync_file', p_items: items });
  ok('propose_tax_facts (automation) — 3 הצעות', prop?.ok === true, prop);
  const pending = await writeStaging(`select id, field_key from public.tax_fact_changes where client_id = ${q(A)} and status = 'pending' order by field_key`);
  ok('3 הצעות ממתינות', pending.length === 3, pending);
  for (const p of pending) {
    const r = await rpc(office.db, 'accept_tax_fact_change', { p_change_id: p.id });
    ok(`accept ${p.field_key}`, r?.ok === true, r);
  }
  const { data: row, error: rowErr } = await office.db.from('clients')
    .select('ni_income_basis_monthly, spouse_ni_income_basis_monthly, ni_income_list, spouse_ni_income_list, field_meta').eq('id', A).single();
  ok('טעינה מחדש דרך PostgREST', !rowErr, rowErr);
  ok('הלקוח: niIncomeBasisMonthly נוקה ל-NULL (לא 0, לא 3,983)', row?.ni_income_basis_monthly === null, row?.ni_income_basis_monthly);
  ok('הלקוח: השומה נשמרה כלשונה', row?.ni_income_list?.assessment?.amount === 47800 && row?.ni_income_list?.declaration === null, row?.ni_income_list);
  ok('בן/בת הזוג: ההצהרה בעמודה שלו/ה בלבד', row?.spouse_ni_income_list?.declaration?.amount === 16500
    && row?.ni_income_list?.declaration === null, row?.spouse_ni_income_list);
  ok('בן/בת הזוג: 16,500 לא נגעו', Number(row?.spouse_ni_income_basis_monthly) === 16500 && Number(before.spouse_ni_income_basis_monthly) === 16500);
  ok('field_meta: automation לשלושת השדות', ['niIncomeList', 'niIncomeBasisMonthly', 'spouseNiIncomeList']
    .every(k => row?.field_meta?.[k]?.source === 'automation'), row?.field_meta);
  const audit = await writeStaging(`select field_key, status, old_value, new_value, note, decided_at is not null decided
    from public.tax_fact_changes where client_id = ${q(A)} order by field_key`);
  const aScalar = audit.find(a => a.field_key === 'niIncomeBasisMonthly');
  ok('יומן: שלוש הצעות accepted עם מועד החלטה', audit.length === 3 && audit.every(a => a.status === 'accepted' && a.decided), audit.map(a => [a.field_key, a.status]));
  ok('יומן: הערך הקודם 47,800 והראיה נשמרו', aScalar?.old_value?.patch?.niIncomeBasisMonthly === 47800 && /שומה עצמי/.test(aScalar?.note ?? ''), aScalar);

  // ── רשימה ריקה (קריאה שלמה בלי שורה תקפה) ──
  const empty = { declaration: null, assessment: null };
  const p2 = await rpc(office.db, 'propose_tax_facts', { p_client_id: A, p_source: 'automation', p_source_ref: 'btl.sync_file', p_items: [
    { field_key: 'niIncomeList', label: 'niIncomeList',
      old_value: { display: 'שומה…', patch: { niIncomeList: { declaration: null, assessment: ASSESS } } },
      new_value: { display: 'אין הצהרה או שומה תקפה של עצמאי', patch: { niIncomeList: empty } } }] });
  const pend2 = await writeStaging(`select id from public.tax_fact_changes where client_id = ${q(A)} and status = 'pending'`);
  const acc2 = pend2[0] ? await rpc(office.db, 'accept_tax_fact_change', { p_change_id: pend2[0].id }) : null;
  const row2 = (await writeStaging(`select ni_income_list from public.clients where id = ${q(A)}`))[0];
  ok('רשימה ריקה נשמרת כאובייקט', p2?.ok && acc2?.ok && sameJson(row2.ni_income_list, empty), [p2, acc2, row2]);

  // ── הגנה: כתיבה ישירה לעמודה מנוהלת ──
  const ucf = await rpc(office.db, 'update_client_fields', { p_client_id: A, p_patch: { ni_income_list: { declaration: DECL, assessment: null } } });
  ok('update_client_fields דוחה ni_income_list (governed_field)', ucf?.ok === false && /governed/.test(JSON.stringify(ucf)), ucf);
  const ucf2 = await rpc(office.db, 'update_client_fields', { p_client_id: A, p_patch: { spouse_ni_income_list: empty } });
  ok('update_client_fields דוחה spouse_ni_income_list', ucf2?.ok === false, ucf2);
  // ‼ קדם-קיים, לא של 219: למשרד יש הרשאת UPDATE ישירה על השורות שלו בטבלה (RLS
  // clients_update_own), כולל כל עמודה מנוהלת. ההגנה היא בנתיב של האפליקציה
  // (update_client_fields). כאן מוודאים שהעמודות החדשות במצב **זהה** לעמודה מנוהלת קיימת.
  const directNew = await office.db.from('clients').update({ ni_income_list: empty }).eq('id', A).select('id');
  const directOld = await office.db.from('clients').update({ ni_insurance_basis: null }).eq('id', A).select('id');
  ok('UPDATE ישיר: אותה התנהגות כמו עמודה מנוהלת קיימת (ni_insurance_basis) — קדם-קיים',
    !!directNew.error === !!directOld.error && (directNew.data?.length ?? 0) === (directOld.data?.length ?? 0),
    { newCol: [directNew.error?.message, directNew.data?.length], oldCol: [directOld.error?.message, directOld.data?.length] });

  // ── stale_conflict: ההצעה נשענת על ערך שכבר אינו בכרטיס ──
  const p3 = await rpc(office.db, 'propose_tax_facts', { p_client_id: A, p_source: 'automation', p_source_ref: 'btl.sync_file', p_items: [
    { field_key: 'spouseNiIncomeBasisMonthly', label: 'spouseNiIncomeBasisMonthly',
      old_value: { display: '9,000 ₪', patch: { spouseNiIncomeBasisMonthly: 9000 } },
      new_value: { display: '—', patch: { spouseNiIncomeBasisMonthly: null } } }] });
  const pend3 = await writeStaging(`select id from public.tax_fact_changes where client_id = ${q(A)} and status = 'pending'`);
  const acc3 = pend3[0] ? await rpc(office.db, 'accept_tax_fact_change', { p_change_id: pend3[0].id }) : null;
  const row4 = (await writeStaging(`select spouse_ni_income_basis_monthly from public.clients where id = ${q(A)}`))[0];
  ok('stale_conflict: ערך שהשתנה מאז ההצעה לא נדרס', p3?.ok && acc3?.ok === false && acc3?.error === 'stale_conflict'
    && Number(row4.spouse_ni_income_basis_monthly) === 16500, [acc3, row4]);

  // ── בידוד: לקוח B לא קיבל דבר ──
  const rowB = (await writeStaging(`select ni_income_list, field_meta from public.clients where id = ${q(B)}`))[0];
  ok('בידוד: הלקוח האחר לא נגע', rowB.ni_income_list === null && JSON.stringify(rowB.field_meta) === '{}', rowB);
} finally {
  if (!process.argv.includes('--keep')) await cleanup();
}
console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
