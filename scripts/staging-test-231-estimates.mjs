#!/usr/bin/env node
/**
 * staging-test-231-estimates.mjs — גרסאות הערכת מס (231) על staging, על לקוחות בדיקה מלאכותיים בלבד.
 * ‼ רק אחרי אישור גיא להחלת 231 על staging. בלי מיילים, בלי רשויות. ניקוי מלא בסוף (גם בכשל).
 *   שימוש (מתיקייה שיש בה .env.local עם SUPABASE_ACCESS_TOKEN, ו-.env.staging):
 *     node scripts/staging-test-231-estimates.mjs
 */
import { STAGING_REF, writeStaging } from './staging-lib.mjs';

const OFFICE = 'ca158d52-5ad7-47f5-b228-4b7703978b84';   // staging@pivo.test
const OTHER = 'e20269af-09f1-4cdf-bef9-63f12ee17554';    // qa-meetings@pivo.test
const RUN = `QAES${Date.now().toString(36).toUpperCase()}`;
let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(info).slice(0, 300)}` : ''}`); };
const lit = (v) => `$q$${typeof v === 'string' ? v : JSON.stringify(v)}$q$`;
const rows = async (q) => (await writeStaging(q)) ?? [];
const one = async (q) => (await rows(q))[0];
async function asUser(uid, expr) {
  try {
    return (await one(`begin; set local role authenticated; select set_config('request.jwt.claims', ${lit({ sub: uid, role: 'authenticated' })}, true); select (${expr}) as r; commit;`))?.r;
  } catch (e) { await writeStaging('rollback;').catch(() => {}); return { thrown: e.message }; }
}
const office = (e) => asUser(OFFICE, e), other = (e) => asUser(OTHER, e);
const created = [];
const newClient = async (first, family = 'single') => {
  const id = (await one(`insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
    values (replace(gen_random_uuid()::text,'-',''), '${OFFICE}', '${first}', '${RUN}', 'delivered@resend.dev', 'active', '${family}', 'licensed') returning id`)).id;
  created.push(id); return id;
};
try {
  console.log(`יעד: ${STAGING_REF} · ריצה ${RUN}`);
  const A = await newClient('דוד', 'married'), B = await newClient('יעל');
  const req = await office(`public.ensure_tax_year_request('${A}', 'estimate', 2026, 9)`);
  ok(req?.ok, 'בקשת הערכה 2026 נפתחה', JSON.stringify(req));
  const D = (x = {}) => ({ cutoffMonth: 9, preparedOn: '2026-10-11', lines: [{ id: 'b1', person: 'client', source: 'business', chosen: 'office' }, { id: 's2', person: 'spouse', source: 'salary', chosen: 'office' }], reconciliations: [], ...x });
  const O = (b = [], x = {}) => ({ taxYear: 2026, blockers: b, rulesetVersion: 'qa', nextAction: 'x', ...x });
  const save = (step, d, o, base, facts = []) => office(`public.save_tax_estimate('${step}', ${lit(d)}::jsonb, ${lit(o)}::jsonb, ${lit(facts)}::jsonb, ${lit(base)}::jsonb)`);
  const approve = (id, rev) => office(`public.approve_tax_estimate('${id}', ${rev})`);

  // שמירה, פתיחה מחדש, עריכה במקביל ולחיצה כפולה
  const s1 = await save(req.stepId, D(), O([{ code: 'missing_actual', text: 'חסר' }]), { latestVersion: 0 });
  ok(s1?.ok && s1.version === 1 && s1.revision === 1, 'טיוטה 1 נשמרה', JSON.stringify(s1));
  const s1b = await save(req.stepId, D({ note: 'פתיחה מחדש' }), O([{ code: 'missing_actual', text: 'חסר' }]), { draftId: s1.id, revision: 1 });
  ok(s1b?.revision === 2 && (await one(`select draft->>'note' n from public.tax_estimates where id = '${s1.id}'`)).n === 'פתיחה מחדש', 'פתיחה מחדש מחזירה את מה שנשמר');
  const stale = await save(req.stepId, D({ note: 'חלון ישן' }), O(), { draftId: s1.id, revision: 1 });
  ok(stale?.error === 'conflict' && (await one(`select draft->>'note' n from public.tax_estimates where id = '${s1.id}'`)).n === 'פתיחה מחדש', 'עריכה במקביל — «conflict», בלי דריסה', JSON.stringify(stale));
  const [d1, d2] = await Promise.all([save(req.stepId, D({ note: 'כפול' }), O(), { draftId: s1.id, revision: 2 }), save(req.stepId, D({ note: 'כפול' }), O(), { draftId: s1.id, revision: 2 })]);
  ok([d1, d2].filter(x => x?.ok).length === 1 && [d1, d2].filter(x => x?.error === 'conflict').length === 1, 'שתי שמירות בו־זמנית עם אותו בסיס — אחת נשמרת, השנייה «conflict»', JSON.stringify([d1, d2]));
  ok((await save(req.stepId, D(), O([], { taxYear: 2025 }), { draftId: s1.id, revision: 3 }))?.error === 'year_mismatch', 'תוצאה של שנה אחרת — נדחית');

  // אישור — שומר נתונים, הנחות, מקורות, כללים
  await save(req.stepId, D(), O([{ code: 'missing_actual', text: 'חסר' }]), { draftId: s1.id, revision: 3 });
  ok((await approve(s1.id, 4))?.error === 'has_blockers', 'אישור עם חוסם — נדחה');
  const full = D({ assumptions: 'קצב חודשי', catchUps: [{ id: 'cu', authority: 'it', person: 'client', justification: 'דרישה', approvedAt: '2026-10-11' }], lines: [{ id: 'b1', person: 'client', source: 'business', chosen: 'office', actualSource: { note: 'רו״ה · QA' } }, { id: 's2', person: 'spouse', source: 'salary', chosen: 'office' }] });
  const s3 = await save(req.stepId, full, O([], { household: { annualLiability: 65168 }, usedRules: [{ ruleId: 'core.creditPoint', basis: 'primary', taxYear: 2026 }] }), { draftId: s1.id, revision: 4 }, [{ id: 'f1', value: 100 }]);
  ok(s3?.revision === 5, 'טיוטה מלאה נשמרה', JSON.stringify(s3));
  ok((await other(`public.approve_tax_estimate('${s1.id}', 5)`))?.thrown, 'משרד אחר — אסור לאשר');
  ok((await approve(s1.id, 4))?.error === 'conflict', 'אישור של עדכון ישן — «conflict»');
  ok((await approve(s1.id, 5))?.ok, 'גרסה 1 אושרה');
  const e1 = await one(`select status, approved_by, draft, outputs, input_facts, ruleset_version from public.tax_estimates where id = '${s1.id}'`);
  ok(e1.status === 'approved' && e1.approved_by === OFFICE && e1.draft.assumptions === 'קצב חודשי' && e1.draft.lines[0].actualSource.note === 'רו״ה · QA'
    && e1.draft.lines[1].person === 'spouse' && e1.outputs.usedRules[0].basis === 'primary' && e1.input_facts[0].value === 100 && e1.ruleset_version === 'qa',
  'הגרסה המאושרת שומרת נתונים, מקורות, הנחות, השלמות, בעל ההכנסה, כללים וגרסת המרשם');
  let blocked = false;
  try { await writeStaging(`update public.tax_estimates set outputs = '{}'::jsonb where id = '${s1.id}'`); } catch (e) { blocked = /tax_estimate_approved/.test(e.message); }
  ok(blocked, 'גרסה מאושרת אינה נערכת (טריגר)');

  // שינוי תחזית אחרי אישור ⇒ גרסה חדשה; הישנה נשמרת
  const s2 = await save(req.stepId, D({ note: 'תחזית חדשה' }), O(), { latestVersion: 1 });
  ok(s2?.created && s2.version === 2, 'שינוי אחרי אישור ⇒ גרסה 2', JSON.stringify(s2));
  ok((await save(req.stepId, D({ note: 'חלון שני' }), O(), { latestVersion: 1 }))?.error === 'conflict', 'חלון שני שפותח גרסה במקביל — «conflict»');
  await approve(s2.id, 1);
  const st = await rows(`select version, status, draft->>'note' note from public.tax_estimates where request_id = '${req.stepId}' order by version`);
  ok(st[0]?.status === 'superseded' && st[0].note === null && st[1]?.status === 'approved', 'גרסה 1 «הוחלפה» ונשמרה כפי שאושרה', JSON.stringify(st));

  // בלי ערבוב: לקוח אחר, שנה אחרת
  const r25 = await office(`public.ensure_tax_year_request('${A}', 'estimate', 2025, 12)`);
  const rB = await office(`public.ensure_tax_year_request('${B}', 'estimate', 2026, 9)`);
  const x25 = await save(r25.stepId, D({ cutoffMonth: 12 }), O([], { taxYear: 2025 }), { latestVersion: 0 });
  const xB = await save(rB.stepId, D(), O(), { latestVersion: 0 });
  ok(x25?.version === 1 && xB?.version === 1, 'שנה אחרת ולקוח אחר — כל אחד בגרסה 1 משלו', JSON.stringify([x25, xB]));
  ok((await save(rB.stepId, D(), O(), { draftId: s2.id, revision: 1 }))?.error === 'conflict', 'בסיס של בקשה אחרת — לא נשמר');
  const mix = await rows(`select client_id, tax_year, count(*)::int n from public.tax_estimates where client_id in ('${A}','${B}') group by 1, 2`);
  ok(mix.length === 3, 'כל גרסה שייכת ללקוח ולשנה שלה', JSON.stringify(mix));
  const vis = await asUser(OTHER, `(select count(*) from public.tax_estimates where client_id in ('${A}','${B}'))`);
  ok(Number(vis) === 0, 'משרד אחר לא רואה את הגרסאות (RLS)', JSON.stringify(vis));
} catch (e) { fail++; console.error('✗ תקלה:', e.message); }
finally {
  for (const A of created) {
    await writeStaging(`delete from public.tax_estimates where client_id = '${A}';
      delete from public.onboarding_events where step_id in (select id from public.onboarding_steps where client_id = '${A}');
      delete from public.onboarding_steps where client_id = '${A}'; delete from public.clients where id = '${A}';`).catch(e => { fail++; console.error('✗ ניקוי:', e.message); });
  }
  if (created.length) ok((await one(`select (select count(*)::int from public.tax_estimates where client_id in (${created.map(c => `'${c}'`).join(',')})) + (select count(*)::int from public.clients where id in (${created.map(c => `'${c}'`).join(',')})) n`)).n === 0, 'ניקוי: אין שאריות');
  console.log(`\n${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
}
