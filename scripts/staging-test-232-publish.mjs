#!/usr/bin/env node
/**
 * staging-test-232-publish.mjs — פרסום הערכת מס מאושרת בדף האישי וב«שלח בקשות» (232), על staging ולקוחות בדיקה בלבד.
 * ‼ בלי מייל: לא נקראת שום פונקציית שליחה; «שלח בקשות» נבדק דרך הרשימה שהשרת מחשב. ניקוי מלא בסוף.
 *   שימוש (מתיקייה עם .env.local ו-.env.staging):  node scripts/staging-test-232-publish.mjs
 */
import { STAGING_REF, writeStaging } from './staging-lib.mjs';

const OFFICE = 'ca158d52-5ad7-47f5-b228-4b7703978b84';   // staging@pivo.test
const OTHER = 'e20269af-09f1-4cdf-bef9-63f12ee17554';    // qa-meetings@pivo.test
const RUN = `QAPB${Date.now().toString(36).toUpperCase()}`;
let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(info).slice(0, 300)}` : ''}`); };
const lit = (v) => `$q$${typeof v === 'string' ? v : JSON.stringify(v)}$q$`;
const rows = async (q) => (await writeStaging(q)) ?? [];
const one = async (q) => (await rows(q))[0];
async function asRole(role, uid, expr) {
  try {
    return (await one(`begin; set local role ${role}; select set_config('request.jwt.claims', ${lit(uid ? { sub: uid, role } : { role })}, true); select (${expr}) as r; commit;`))?.r;
  } catch (e) { await writeStaging('rollback;').catch(() => {}); return { thrown: e.message }; }
}
const office = (e) => asRole('authenticated', OFFICE, e), other = (e) => asRole('authenticated', OTHER, e), anon = (e) => asRole('anon', null, e);
const created = [];
const newClient = async (first, tok) => {
  const id = (await one(`insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type, portal_token)
    values (replace(gen_random_uuid()::text,'-',''), '${OFFICE}', '${first}', '${RUN}', 'delivered@resend.dev', 'active', 'single', 'licensed', '${tok}') returning id`)).id;
  created.push(id); return id;
};
const SECRET = 'הערת-משרד-פנימית-' + RUN;
try {
  console.log(`יעד: ${STAGING_REF} · ריצה ${RUN}`);
  const TA = `tokA${RUN.toLowerCase()}`, TB = `tokB${RUN.toLowerCase()}`;
  const A = await newClient('דוד', TA), B = await newClient('יעל', TB);
  const req = await office(`public.ensure_tax_year_request('${A}', 'estimate', 2026, 9)`);
  const reqB = await office(`public.ensure_tax_year_request('${B}', 'estimate', 2026, 9)`);
  const D = (x = {}) => ({ cutoffMonth: 9, preparedOn: '2026-10-11', lines: [{ id: 'b1', label: 'העסק', person: 'client', source: 'business', chosen: 'office', office: { method: 'runRate', assumption: 'קצב חודשי' }, actualSource: { note: 'פנימי' } }],
    reconciliations: [{ id: 'r', decision: 'books_correct', note: SECRET }], decisions: [{ ruleId: 'x', text: SECRET }], note: SECRET, ...x });
  const O = (liab, x = {}) => ({ taxYear: 2026, blockers: [], rulesetVersion: 'qa', nextAction: SECRET, usedRules: [{ ruleId: 'core.creditPoint' }], household: { annualLiability: liab }, advances: [], persons: [], savings: [], partial: [], limits: [], micro: [], ...x });
  const save = (step, d, o, base) => office(`public.save_tax_estimate('${step}', ${lit(d)}::jsonb, ${lit(o)}::jsonb, '[]'::jsonb, ${lit(base)}::jsonb)`);
  const approve = (id, rev) => office(`public.approve_tax_estimate('${id}', ${rev})`);
  const publish = (id, on) => office(`public.publish_tax_estimate('${id}', ${on})`);
  const portal = (tok, step) => anon(`public.portal_tax_estimate('${tok}', '${step}')`);
  const announce = async (cid) => rows(`select step_id, public._client_step_portal_key(step_id, step_type) k, version, announced_version from public._client_announceable_steps('${cid}') where step_type = 'tax_estimate'`);

  // ── 1. טיוטה — לא מתפרסמת, לא נראית ──
  const s1 = await save(req.stepId, D(), O(65168), { latestVersion: 0 });
  ok((await publish(s1.id, true))?.error === 'not_approved', 'טיוטה — אי אפשר לפרסם');
  ok((await portal(TA, req.stepId))?.ok === false, 'הלקוח לא רואה טיוטה');
  ok((await announce(A)).length === 0, '«שלח בקשות»: אין הערכה לבשר לפני פרסום');

  // ── 2. אישור ופרסום גרסה 1 ──
  await approve(s1.id, 1);
  ok((await portal(TA, req.stepId))?.ok === false, 'מאושרת אבל לא מפורסמת — הלקוח לא רואה');
  ok((await other(`public.publish_tax_estimate('${s1.id}', true)`))?.thrown, 'משרד אחר — אסור לפרסם');
  const cv0 = (await one(`select client_content_version v from public.onboarding_steps where id = '${req.stepId}'`)).v;
  ok((await publish(s1.id, true))?.ok, 'פרסום גרסה 1');
  const st = await one(`select published_at, client_content_version v, payload->>'clientSub' sub from public.onboarding_steps where id = '${req.stepId}'`);
  ok(st.published_at && st.v > cv0 && /^גרסה 1/.test(st.sub), 'הבקשה מפורסמת וגרסת התוכן ללקוח עלתה', JSON.stringify({ cv0, ...st }));
  const v1 = await portal(TA, req.stepId);
  ok(v1?.ok && v1.version === 1 && v1.estimateId === s1.id && v1.outputs.household.annualLiability === 65168, 'הלקוח רואה את גרסה 1 — מאותה שורה', JSON.stringify(v1).slice(0, 200));
  const txt = JSON.stringify(v1);
  ok(!txt.includes(SECRET) && !/usedRules|blockers|reconciliations|decisions|actualSource|"note"/.test(txt), 'לא נחשפים: הערות, הכרעות, יישור, מקורות פנימיים, חוסמים, כללים', txt.slice(0, 300));
  ok((await portal(TB, req.stepId))?.ok === false && (await portal('bad-token', req.stepId))?.error === 'invalid', 'טוקן של לקוח אחר / לא תקין — לא רואה');
  ok((await portal(TA, reqB.stepId))?.ok === false, 'הטוקן של א׳ לא מגיע לבקשה של ב׳');
  const ann = await announce(A);
  ok(ann.length === 1 && ann[0].k === `taxest_${req.stepId}` && ann[0].version > ann[0].announced_version, '«שלח בקשות»: הפריט הנכון, עם מפתח הדף, ממתין לבשורה', JSON.stringify(ann));
  ok((await announce(B)).length === 0, '«שלח בקשות» של לקוח אחר — אין הערכה');
  const page = await anon(`public.get_client_portal('${TA}')`);
  const pageTxt = JSON.stringify(page ?? {});
  ok(pageTxt.includes(`taxest_${req.stepId}`) && pageTxt.includes('הערכת המס לשנת 2026'), 'הדף האישי: פריט «הערכת המס לשנת 2026»', pageTxt.slice(0, 200));
  ok(!pageTxt.includes(SECRET), 'הדף האישי לא מכיל הערות פנימיות');

  // ── 3. גרסה חדשה לא משנה בשקט את מה שנמסר ──
  const s2 = await save(req.stepId, D({ note: 'אחרי שינוי' }), O(70000), { latestVersion: 1 });
  const stillV1 = await portal(TA, req.stepId);
  ok(stillV1?.version === 1 && stillV1.outputs.household.annualLiability === 65168, 'טיוטה של גרסה 2 — הלקוח עדיין רואה בדיוק את גרסה 1');
  await approve(s2.id, 1);
  const after = await portal(TA, req.stepId);
  const v1row = await one(`select status, outputs->'household'->>'annualLiability' l from public.tax_estimates where id = '${s1.id}'`);
  ok(after?.ok === false && v1row.status === 'superseded' && v1row.l === '65168', 'אישור גרסה 2: גרסה 1 נשמרת כפי שהייתה («הוחלפה») והלקוח לא רואה מספר ישן — וגם לא את 2 לפני פרסום', JSON.stringify({ after, v1row }));
  ok(((await rows(`select 1 from public.tax_estimates where request_id = '${req.stepId}' and status = 'approved' and published_at is not null`)).length) === 0, 'אין גרסה מפורסמת עד פרסום מפורש');
  const cv1 = (await one(`select client_content_version v from public.onboarding_steps where id = '${req.stepId}'`)).v;
  await publish(s2.id, true);
  const v2 = await portal(TA, req.stepId);
  const cv2 = (await one(`select client_content_version v, payload->>'clientSub' sub from public.onboarding_steps where id = '${req.stepId}'`));
  ok(v2?.version === 2 && v2.outputs.household.annualLiability === 70000 && cv2.v > cv1 && /^גרסה 2/.test(cv2.sub), 'פרסום גרסה 2 — הלקוח רואה 2, וגרסת התוכן עלתה («שלח בקשות» יבשר שוב)', JSON.stringify({ cv1, cv2 }));

  // ── 4. הסרה ──
  await publish(s2.id, false);
  ok((await portal(TA, req.stepId))?.ok === false && (await announce(A)).length === 0, 'הסרה: יורד מהדף ומ«שלח בקשות»');
  await publish(s2.id, true); // משאירים מפורסם לבדיקת הממשק אם רוצים — מנוקה בסוף
  ok((await rows(`select count(*)::int n from public.email_messages where to_email = 'delivered@resend.dev' and created_at > now() - interval '10 minutes' and meta::text like '%${RUN}%'`))[0].n === 0, 'לא נשלח אף מייל');
} catch (e) { fail++; console.error('✗ תקלה:', e.message); }
finally {
  for (const c of created) {
    await writeStaging(`delete from public.tax_estimates where client_id = '${c}';
      delete from public.client_notices where client_id = '${c}';
      delete from public.onboarding_events where step_id in (select id from public.onboarding_steps where client_id = '${c}');
      delete from public.onboarding_steps where client_id = '${c}'; delete from public.clients where id = '${c}';`).catch(e => { fail++; console.error('✗ ניקוי:', e.message); });
  }
  if (created.length) ok((await one(`select (select count(*)::int from public.clients where last_name = '${RUN}') + (select count(*)::int from public.tax_estimates where client_id in (${created.map(c => `'${c}'`).join(',')})) n`)).n === 0, 'ניקוי: אין שאריות');
  console.log(`\n${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
}
