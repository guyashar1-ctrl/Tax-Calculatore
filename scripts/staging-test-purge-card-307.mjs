#!/usr/bin/env node
/**
 * staging-test-purge-card-307.mjs — «מחק לגמרי» מחזיר גם את הכרטיס (307), מול staging בלבד.
 *
 *   כמו אצל גיא (27.10): השאלון עדכן לבד בעלות חשבון, פרטי בן/בת זוג (פעמיים, ממוזג), סוג תואר; והשאיר הצעה לכתובת
 *   ⇒ «מחק לגמרי» (ספירה בחלון = מה שקורה) ⇒ הכרטיס חוזר למה שהיה, ההצעה נדחית, שדה ששונה מאז נשאר,
 *   עדכון ממקור אחר לא נוגעים בו, field_meta חוזר לעדכון הקודם, העותק הנסתר שומר את הכרטיס שלפני. בסוף — ניקוי.
 *
 *   node scripts/staging-test-purge-card-307.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = f => Object.fromEntries(readFileSync(resolve(ROOT, f), 'utf8').split(/\r?\n/).map(l => l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const STAGING = 'evdfxjqrkgugssfrdoxd';
const TOKEN = env('.env.local').SUPABASE_ACCESS_TOKEN;
const OFFICE = 'ca158d52-5ad7-47f5-b228-4b7703978b84';
if (!TOKEN) { console.error('✋ SUPABASE_ACCESS_TOKEN חסר'); process.exit(1); }

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${STAGING}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  const t = await r.text();
  if (!r.ok) throw new Error(`sql ${r.status}: ${t.slice(0, 400)}`);
  return t ? JSON.parse(t) : [];
}
const lit = v => `$q$${typeof v === 'string' ? v : JSON.stringify(v)}$q$`;
const asOffice = async expr => (await sql(`begin; set local role authenticated; select set_config('request.jwt.claims', ${lit({ sub: OFFICE, role: 'authenticated' })}, true); select (${expr}) as r; commit;`))[0]?.r;

let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 300)}` : ''}`); };

const RUN = `QA307${Date.now().toString(36).toUpperCase()}`;
const BANK = { id: 'b1', owners: 'both', bankCode: '18', bankName: 'בנק לדוגמה', isPrimary: true, branchNumber: '001', accountNumber: '123' };
const SP = { gender: 'female', idNumber: '000000018', lastName: RUN, birthDate: '1999-01-06', firstName: 'רחל' };
let clientId;
try {
  clientId = (await sql(`insert into public.clients (id, user_id, first_name, last_name, family_status, spouse_first_name, spouse_last_name, spouse_id_number, lifecycle_stage, bank_accounts, academic_degree_year, field_meta)
    values (replace(gen_random_uuid()::text,'-',''), '${OFFICE}', 'דוד', '${RUN}', 'married', 'רחל', '${RUN}', '000000018', 'active', ${lit([BANK])}::jsonb, null,
      ${lit({ bankAccounts: { source: 'questionnaire', syncedAt: '2026-10-16T12:41:34.104Z' } })}::jsonb) returning id`))[0].id;
  const stepId = (await sql(`insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, payload)
    values ('${OFFICE}', '${clientId}', 'annual_return', 'tools', 'person', 'pending', '{"taxYear":2025,"purpose":"annual","title":"דוח שנתי 2025"}'::jsonb) returning id`))[0].id;
  const fact = async (req = stepId) => (await sql(`insert into public.tax_year_facts (user_id, client_id, tax_year, item_key, subject_role, period_kind, period_to, answer, value, basis, source, status, request_id)
    values ('${OFFICE}','${clientId}',2025,'donations.amount','client','months','2025-09-30','value','1','actual_to_date','portal','accepted', ${req ? `'${req}'` : 'null'}) returning id`))[0].id;
  const [fBank, fSp1, fSp2, fDeg, fYear, fAddr] = [await fact(), await fact(), await fact(), await fact(), await fact(), await fact()];
  const fOther = await fact(null); // עובדה שלא שייכת לעבודה — העדכון שלה נשאר
  // שאלון קודם (16.10) כבר כתב את החשבון — ממנו field_meta חוזר
  await sql(`insert into public.tax_fact_changes (id, user_id, client_id, field_key, label, old_value, new_value, source, source_ref, status, decided_by, decided_at, created_at)
    values (md5(random()::text), '${OFFICE}', '${clientId}', 'bankAccounts', 'בדיקה', '{"patch":{"bankAccounts":[]}}'::jsonb, ${lit({ patch: { bankAccounts: [BANK] } })}::jsonb, 'questionnaire', 'tax_year_fact:${await fact(null)}', 'accepted',
      '${OFFICE}', '2026-10-16 12:41:34.104+00', '2026-10-16 12:41:34.104+00')`);
  let t = 0;
  const change = async (f, status, oldP, newP, write) => {
    t += 1;
    const at = `'2026-10-25 11:41:${String(t).padStart(2, '0')}+00'`;
    await sql(`insert into public.tax_fact_changes (id, user_id, client_id, field_key, label, old_value, new_value, source, source_ref, status, decided_by, decided_at, created_at)
      values (md5(random()::text), '${OFFICE}', '${clientId}', '${Object.keys(newP)[0]}', 'בדיקה', ${lit({ patch: oldP })}::jsonb, ${lit({ patch: newP })}::jsonb, 'questionnaire', 'tax_year_fact:${f}', '${status}',
        ${status === 'accepted' ? `'${OFFICE}'` : 'null'}, ${status === 'accepted' ? at : 'null'}, ${at})`);
    if (write) await sql(write);
  };
  const meta = k => `field_meta = coalesce(field_meta,'{}'::jsonb) || jsonb_build_object('${k}', jsonb_build_object('source','questionnaire','syncedAt','2026-10-25T11:41:00.000Z'))`;
  // כמו שהשאלון עשה — כל עדכון גם נכתב לכרטיס
  await change(fBank, 'accepted', { bankAccounts: [BANK] }, { bankAccounts: [{ ...BANK, owners: 'client' }] },
    `update public.clients set bank_accounts = ${lit([{ ...BANK, owners: 'client' }])}::jsonb, ${meta('bankAccounts')} where id='${clientId}'`);
  await change(fSp1, 'accepted', { spouse: null }, { spouse: SP }, `update public.clients set spouse = ${lit(SP)}::jsonb, ${meta('spouse')} where id='${clientId}'`);
  await change(fSp2, 'accepted', { spouse: SP }, { spouse: { paysAlimonyToEx: false } }, `update public.clients set spouse = spouse || '{"paysAlimonyToEx":false}'::jsonb where id='${clientId}'`);
  await change(fDeg, 'accepted', { academicDegreeType: null }, { academicDegreeType: 'bachelor' }, `update public.clients set academic_degree_type = 'bachelor', ${meta('academicDegreeType')} where id='${clientId}'`);
  await change(fYear, 'accepted', { academicDegreeYear: null }, { academicDegreeYear: 2020 }, `update public.clients set academic_degree_year = 2020, ${meta('academicDegreeYear')} where id='${clientId}'`);
  await change(fAddr, 'pending', { address: '' }, { address: 'דקלה 25' });
  await change(fOther, 'accepted', { paysAlimonyToEx: null }, { paysAlimonyToEx: false }, `update public.clients set pays_alimony_to_ex = false where id='${clientId}'`);
  // ‼ שנת התואר תוקנה ידנית אחר כך ⇒ לא מוחזרת
  await sql(`update public.clients set academic_degree_year = 2021 where id='${clientId}'`);

  // 1 · החלון — ספירה
  const dry = await asOffice(`public.purge_tax_work('${stepId}', true)`);
  ok(dry?.ok && dry.counts.cardUndo === 4 && dry.counts.cardKept === 1 && dry.counts.cardDropped === 1, 'בחלון: 4 עדכונים יוחזרו, 1 נשאר (שונה מאז), הצעה 1 נמחקת', dry?.counts);
  const still = (await sql(`select academic_degree_type t, spouse from public.clients where id='${clientId}'`))[0];
  ok(still.t === 'bachelor' && still.spouse?.paysAlimonyToEx === false, 'הספירה לא שינתה דבר בכרטיס');

  // 2 · מחיקה
  const res = await asOffice(`public.purge_tax_work('${stepId}', false)`);
  ok(res?.ok && res.counts.cardUndo === 4 && res.counts.cardKept === 1 && res.counts.cardDropped === 1, 'המחיקה: אותה ספירה כמו בחלון', res);
  const c = (await sql(`select bank_accounts, spouse, spouse_first_name, spouse_id_number, academic_degree_type, academic_degree_year, pays_alimony_to_ex, address, field_meta from public.clients where id='${clientId}'`))[0];
  ok(c.bank_accounts?.[0]?.owners === 'both', 'בעלות החשבון חזרה ל«שניהם»', c.bank_accounts);
  ok(c.spouse === null, 'פרטי בן/בת הזוג מהשאלון — הוחזרו (שני העדכונים, מהחדש לישן)', c.spouse);
  ok(c.spouse_first_name === 'רחל' && c.spouse_id_number === '000000018', 'השם והת.ז. של בן/בת הזוג — נשארו בכרטיס');
  ok(c.academic_degree_type === null, 'סוג התואר — הוחזר');
  ok(c.academic_degree_year === 2021, 'שנת התואר ששונתה ידנית מאז — נשארה (2021)', c.academic_degree_year);
  ok(c.pays_alimony_to_ex === false, 'עדכון ממקור שלא נמחק — לא נגעו בו');
  ok(c.address === null, 'הכתובת מההצעה לא נכנסה');
  ok(c.field_meta?.bankAccounts?.syncedAt?.startsWith('2026-10-16T12:41:34') && c.field_meta?.bankAccounts?.source === 'questionnaire', 'field_meta של החשבון — חזר לשאלון הקודם (16.10)', c.field_meta?.bankAccounts);
  ok(!c.field_meta?.spouse && !c.field_meta?.academicDegreeType, 'field_meta של מה שהוחזר בלי עדכון קודם — נמחק («לא נשאל»)', c.field_meta);
  ok(c.field_meta?.academicDegreeYear?.source === 'questionnaire', 'field_meta של שדה שנשאר — לא נגעו');
  const st = (await sql(`select status, count(*)::int n from public.tax_fact_changes where client_id='${clientId}' group by 1 order by 1`));
  const by = Object.fromEntries(st.map(x => [x.status, x.n]));
  ok(by.superseded === 4 && by.rejected === 1 && by.accepted === 3, 'היסטוריה: 4 «הוחזר», הצעה «נדחתה», 3 נשארו מאושרים', by);
  const notes = (await sql(`select string_agg(note, '|') n from public.tax_fact_changes where client_id='${clientId}' and status in ('superseded','rejected')`))[0].n;
  ok(/הוחזר — הדוח נמחק/.test(notes) && /המקור נמחק/.test(notes), 'כל שינוי מוסבר בהערה', notes);
  const trash = (await sql(`select snapshot->'clientBefore'->'spouse' sp, jsonb_array_length(snapshot->'cardChanges') n, counts from public.tax_work_trash where step_id='${stepId}'`))[0];
  ok(trash?.sp?.paysAlimonyToEx === false && trash.n === 6 && trash.counts.cardUndo === 4, 'העותק הנסתר: הכרטיס שלפני וששת העדכונים', trash);
  ok((await sql(`select count(*)::int n from public.onboarding_steps where id='${stepId}'`))[0].n === 0, 'העבודה עצמה נמחקה (266 לא נפגע)');
  const inv = (await sql(`select public.assert_domain_function_invariants() r`))[0].r;
  ok(inv === 'ok', 'כללי הפונקציות בשרת תקינים', inv);
} catch (e) {
  ok(false, 'הבדיקה נעצרה', e.message);
} finally {
  if (clientId) {
    await sql(`delete from public.tax_work_trash where client_id='${clientId}'; delete from public.tax_fact_changes where client_id='${clientId}'; delete from public.tax_year_facts where client_id='${clientId}'; delete from public.onboarding_steps where client_id='${clientId}'; delete from public.clients where id='${clientId}';`).catch(e => console.log('ניקוי נכשל', e.message));
    const left = (await sql(`select count(*)::int n from public.clients where last_name like 'QA307%'`))[0].n;
    ok(left === 0, 'ניקוי: לא נשארו לקוחות בדיקה');
  }
  console.log(`\n${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
}
