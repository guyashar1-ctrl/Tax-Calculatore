#!/usr/bin/env node
/**
 * staging-test-p0-security.mjs — שער הרגרסיה של P0-A (הרשאות הרצה על RPC).
 *
 * מה נבדק כאן, ולמה כל בדיקה קיימת:
 *  1  קורא לא מחובר (anon) אינו יכול להריץ אף פונקציה מחוץ לרשימת הדפים
 *     הציבוריים. הרשימה נבדקת כקבוצה — לא פונקציה-פונקציה — כדי שפונקציה
 *     חדשה שתיפתח בטעות תיתפס כאן ולא בפרודקשן.
 *  2  שש הפונקציות המסוכנות ביותר נדחות ל-anon בפועל, בקריאה אמיתית.
 *  3  אותן פונקציות נדחות גם למשתמש **מחובר** — כי אף אחת מהן לא בודקת
 *     בעלות בגופה, ולכן הרשאה לבדה הייתה מספיקה כדי לגעת בנתונים של אחר.
 *  4  הדפים הציבוריים ממשיכים לעבוד: get_quotation עם טוקן אמיתי מחזיר
 *     תשובה כשהוא נקרא כ-anon. זו הבדיקה שמונעת "אבטחנו ושברנו".
 *  5  פונקציה חדשה נולדת סגורה (ה-event trigger של מיגרציה 160).
 *  6  בידוד בין בעלים: משתמש שני אינו יכול להחיל עובדות מס, לרענן שלב
 *     מחזור-חיים או להטביע מזהה התקשרות זר — על לקוח שאינו שלו.
 *
 * ‼ הכול על סביבת הבדיקות בלבד. המשתמש השני והלקוחות שנוצרו כאן נמחקים
 * בסוף הריצה, גם בכישלון.
 *
 * הרצה:  node scripts/staging-test-p0-security.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const U = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];
const q = (v) => v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`;

const AS = (uid) => `select set_config('request.jwt.claims', json_build_object('sub','${uid}','role','authenticated')::text, false);`;
/** קריאה כ-anon אמיתי (התפקיד עצמו, לא רק ה-JWT). */
const asAnon = (sql) => writeStaging(`set role anon; ${sql}`);
const asUser = (uid, sql) => writeStaging(`${AS(uid)} set role authenticated; ${sql}`);

/** מריץ ומחזיר {denied:boolean, message}. הרשאה חסרה = denied. */
async function tryRun(runner, sql) {
  try {
    const r = await runner(sql);
    return { denied: false, value: r };
  } catch (e) {
    const m = String(e.message || '');
    return { denied: /permission denied|must be owner|not authorized/i.test(m), message: m.slice(0, 160) };
  }
}

console.log(`סביבה: ${STAGING_REF}\n`);

// הרשימה הסגורה — חייבת להישאר זהה למיגרציה 160.
const PUBLIC_SURFACE = new Set([
  'get_quotation', 'mark_quotation_viewed', 'approve_quotation',
  'start_intake', 'save_intake_answer', 'get_intake', 'reopen_intake',
  'get_client_portal', 'portal_submit_step',
  'get_onboarding', 'submit_onboarding_full', 'submit_signature',
  'request_spouse_onboarding',
  'get_spouse_onboarding', 'submit_spouse_onboarding',
  'get_release_portal', 'release_portal_set_item', 'release_portal_respond',
  'release_portal_remove_upload', 'release_portal_mark_items',
  // 165 (הסשן המקביל): קישור-משתתף לתנאי-קדם — token מאומת ב-request_participant_links
  // (לא נמצא/בוטל/פג/כבר הוגש), אותו דפוס בדיוק כמו שאר המשטח הציבורי כאן.
  'get_participant_form', 'participant_submit_prerequisites',
  // 191: שמירת שלב בטופס הקליטה ו«הקישור נפתח» — נפתרים מטוקן הקליטה בלבד,
  // כותבים רק identification.draft ורק כל עוד הבקשה ב-pending_fill.
  'save_onboarding_step', 'touch_onboarding',
]);

async function cleanup() {
  await writeStaging(`
    delete from public.onboarding_steps where client_id in (select id from public.clients where last_name = 'P0SEC');
    delete from public.journey_stages where client_id in (select id from public.clients where last_name = 'P0SEC');
    delete from public.engagements where client_id in (select id from public.clients where last_name = 'P0SEC');
    delete from public.tax_fact_changes where client_id in (select id from public.clients where last_name = 'P0SEC');
    delete from public.clients where last_name = 'P0SEC';
    delete from auth.users where email = 'p0sec-other@test.local';`);
}
await cleanup();

try {
  // ─── 1 · אף פונקציה מחוץ לרשימה אינה פתוחה ל-anon ─────────────────────────
  const openRows = await writeStaging(`
    select p.proname from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
       and p.prorettype <> 'trigger'::regtype
       and has_function_privilege('anon', p.oid, 'EXECUTE')
     order by 1;`);
  const open = openRows.map(r => r.proname);
  const strays = open.filter(n => !PUBLIC_SURFACE.has(n));
  ok(`1 אין פונקציה פתוחה ל-anon מחוץ לרשימה (${open.length} פתוחות)`,
    strays.length === 0, strays.join(', '));

  // ─── 2 · דחייה בפועל ל-anon, לא רק בטבלת ההרשאות ──────────────────────────
  const DANGEROUS = [
    ['unlock_dependent_steps', `select public.unlock_dependent_steps('x')`],
    ['generate_onboarding_steps', `select public.generate_onboarding_steps('x', true)`],
    ['close_intake_step_for_client', `select public.close_intake_step_for_client('x')`],
    ['log_onboarding_event', `select public.log_onboarding_event('${U}'::uuid, null, null, 'created')`],
    ['create_engagement_for_quotation', `select public.create_engagement_for_quotation('x', true)`],
    ['apply_due_engagement_transitions', `select public.apply_due_engagement_transitions()`],
    ['domain_consistency_report', `select public.domain_consistency_report()`],
    ['apply_tax_facts', `select public.apply_tax_facts('x','import',null,'[]'::jsonb)`],
  ];
  for (const [name, sql] of DANGEROUS) {
    const r = await tryRun(asAnon, sql);
    ok(`2 anon נדחה — ${name}`, r.denied, r.denied ? '' : 'רץ בלי הרשאה!');
  }

  // ─── 3 · אותן פונקציות נדחות גם למשתמש מחובר ──────────────────────────────
  // ‼ אף אחת מהן אינה בודקת בעלות בגופה, ולכן ההרשאה היא ההגנה היחידה.
  for (const [name, sql] of DANGEROUS.filter(([n]) => n !== 'apply_tax_facts')) {
    const r = await tryRun((s) => asUser(U, s), sql);
    ok(`3 authenticated נדחה — ${name}`, r.denied, r.denied ? '' : 'רץ בלי הרשאה!');
  }

  // ─── 4 · הדף הציבורי ממשיך לעבוד ──────────────────────────────────────────
  const tok = (await one(`
    insert into public.quotations (id, user_id, quotation_number, status, public_token, items, vat_rate)
    values (replace(gen_random_uuid()::text,'-',''), '${U}', 'P0SEC-1', 'sent',
            replace(gen_random_uuid()::text,'-',''), '[]'::jsonb, 18)
    returning public_token;`)).public_token;
  const pub = await tryRun(asAnon, `select public.get_quotation(${q(tok)}) as r`);
  ok('4 anon עדיין קורא הצעת מחיר עם טוקן (הדף הציבורי לא נשבר)',
    !pub.denied && pub.value?.[0]?.r != null, pub.message || 'לא הוחזר מידע');

  const portalTok = (await one(`
    insert into public.clients (id, user_id, first_name, last_name, email, portal_token)
    values (replace(gen_random_uuid()::text,'-',''), '${U}', 'שער', 'P0SEC', 'delivered@resend.dev',
            replace(gen_random_uuid()::text,'-',''))
    returning portal_token;`)).portal_token;
  const portal = await tryRun(asAnon, `select public.get_client_portal(${q(portalTok)}) as r`);
  ok('4 anon עדיין פותח את הדף האישי עם טוקן',
    !portal.denied && portal.value?.[0]?.r != null, portal.message || 'לא הוחזר מידע');

  // ─── 5 · פונקציה חדשה נולדת סגורה ─────────────────────────────────────────
  await writeStaging(`create or replace function public.__p0sec_probe() returns int language sql as $q$ select 1 $q$;`);
  const probe = await one(`select has_function_privilege('anon','public.__p0sec_probe()','EXECUTE') as a,
                                  has_function_privilege('public','public.__p0sec_probe()','EXECUTE') as p;`);
  ok('5 פונקציה חדשה נולדת סגורה ל-anon ול-PUBLIC', probe.a === false && probe.p === false,
    `anon=${probe.a} public=${probe.p}`);
  await writeStaging(`drop function if exists public.__p0sec_probe();`);

  // ─── 6 · בידוד בין בעלים ──────────────────────────────────────────────────
  const other = (await one(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
            'p0sec-other@test.local', '', now(), now(), now())
    returning id;`)).id;

  const mine = (await one(`
    insert into public.clients (id, user_id, first_name, last_name, email, ni_balance)
    values (replace(gen_random_uuid()::text,'-',''), '${U}', 'שלי', 'P0SEC', 'delivered@resend.dev', 0)
    returning id;`)).id;

  const foreignApply = await asUser(other, `
    select public.apply_tax_facts(${q(mine)}, 'institution_alignment', 'p0sec',
      '[{"field_key":"niBalance","label":"יתרה","old_value":{"patch":{"niBalance":0}},"new_value":{"patch":{"niBalance":999}}}]'::jsonb) as r;`);
  ok('6 משתמש זר אינו מחיל עובדות על לקוח של אחר',
    foreignApply[0].r?.ok === false && foreignApply[0].r?.error === 'forbidden',
    JSON.stringify(foreignApply[0].r));

  const balAfter = (await one(`select ni_balance from public.clients where id = ${q(mine)};`)).ni_balance;
  ok('6 והערך בתיק לא זז', Number(balAfter) === 0, `ni_balance=${balAfter}`);

  const foreignRefresh = await asUser(other, `select public.refresh_lifecycle_stage_for(${q(mine)}) as r;`);
  ok('6 משתמש זר אינו מרענן שלב מחזור-חיים של לקוח של אחר',
    foreignRefresh[0].r === null, `החזיר ${foreignRefresh[0].r}`);

  const mineOk = await asUser(U, `select public.refresh_lifecycle_stage_for(${q(mine)}) as r;`);
  ok('6 והבעלים עצמו כן מצליח (לא שברנו את המסלול התקין)', mineOk[0].r !== null, 'הבעלים קיבל null');

  // התקשרות של לקוח אחר — הטבעה חוצת-בעלים
  const otherClient = (await one(`
    insert into public.clients (id, user_id, first_name, last_name, email)
    values (replace(gen_random_uuid()::text,'-',''), '${other}', 'זר', 'P0SEC', 'delivered@resend.dev')
    returning id;`)).id;
  const myEng = (await one(`
    insert into public.engagements (id, user_id, client_id, status, effective_from)
    values (replace(gen_random_uuid()::text,'-',''), '${U}', ${q(mine)}, 'onboarding', current_date)
    returning id;`)).id;
  const stamp = await asUser(other, `
    select public.ensure_institution_alignment_steps(${q(otherClient)}, ${q(myEng)}, false) as r;`);
  ok('6 משתמש זר אינו מטביע מזהה התקשרות של אחר בשלבים שלו',
    stamp[0].r?.ok === false && stamp[0].r?.error === 'engagement_not_found',
    JSON.stringify(stamp[0].r));

  // ─── 7 · הבונה של הדף האישי (164) ─────────────────────────────────────────
  // ‼ מיגרציה 157 פתחה את build_client_portal ל-authenticated, ואין לה בדיקת
  // בעלות — כל משתמש מחובר יכול היה לבנות את הדף של לקוח של משרד אחר.
  {
    const direct = await tryRun((s) => asUser(other, s), `select public.build_client_portal(${q(mine)}, 'live') as r`);
    ok('7 build_client_portal סגורה בפני משתמש מחובר', direct.denied, direct.denied ? '' : 'רץ!');
    const directAnon = await tryRun(asAnon, `select public.build_client_portal(${q(mine)}, 'live') as r`);
    ok('7 build_client_portal סגורה בפני anon', directAnon.denied, directAnon.denied ? '' : 'רץ!');
    const foreignPreview = await asUser(other, `select public.get_client_portal_preview(${q(mine)}, 'preview') as r`);
    ok('7 תצוגה מקדימה של לקוח זר נדחית', foreignPreview[0].r?.ok === false, JSON.stringify(foreignPreview[0].r));
    const ownPreview = await asUser(U, `select public.get_client_portal_preview(${q(mine)}, 'preview') as r`);
    ok('7 הבעלים כן רואה תצוגה מקדימה', ownPreview[0].r?.ok !== false, JSON.stringify(ownPreview[0].r).slice(0, 120));
    const inv = await tryRun((s) => asUser(U, s), 'select public.assert_domain_function_invariants() as r');
    ok('7 שומר הקבועים של פונקציות הדומיין מאשר', !inv.denied && inv.value?.[0]?.r === 'ok', inv.message || JSON.stringify(inv.value));
  }

} finally {
  await cleanup();
  console.log(`\n${pass} עברו · ${fail} נכשלו`);
  process.exit(fail === 0 ? 0 : 1);
}
