#!/usr/bin/env node
/**
 * staging-test-journey-templates.mjs — שער הרגרסיה של תבניות המסע (v2).
 *
 * TT-1 נאמנות מבנה: שלושה שלבי-על בסדר לא-אלפביתי, שיוך משימות, וסדר.
 * TT-2 זהות רשומה: שתי בקשות באותה כותרת — בשלבים שונים ובאותו שלב —
 *      נשמרות ומוחלות כשתי בקשות נפרדות, ותלות מכוונת לאחת מהן בדיוק.
 * TT-3 אידמפוטנטיות: החלה חוזרת אינה מוסיפה דבר ואינה משכפלת.
 * TT-4 תאימות v1: תבנית ישנה (בלי key) מוחלת כמו קודם, לפי כותרת.
 * TT-5 תצורה: דרישות/חובה-רשות/options/maxFiles/אוטומציה/גורם חיצוני שורדים,
 *      והכול נולד כטיוטה בלי חימוש.
 *
 * ‼ הכול על לקוחות דמה בסביבת הבדיקות בלבד, ונמחק בסוף.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];
const AS_USER = `select set_config('request.jwt.claims', json_build_object('sub','${USER_ID}','role','authenticated')::text, false);`;
const jrpc = async (expr) => JSON.parse((await one(`${AS_USER} select (${expr})::text as out;`)).out);

console.log(`סביבה: ${STAGING_REF}\n`);

// ── ניקוי משאריות ריצה קודמת ────────────────────────────────────────────────
await writeStaging(`
  delete from public.clients where last_name in ('TT-מקור','TT-יעד','TT-v1');
  delete from public.journey_templates where name in ('TT · תבנית', 'TT · v1');`);

// ── בניית תיק המקור ─────────────────────────────────────────────────────────
const src = (await one(`
  insert into public.clients (id, user_id, first_name, last_name, email)
  values (replace(gen_random_uuid()::text,'-',''), '${USER_ID}', 'תיק', 'TT-מקור', 'delivered@resend.dev')
  returning id;`)).id;

// ‼ סדר מכוון שאינו אלפביתי (בעברית: אימות < בירור < קליטה), כדי שמיון לפי
// שם ייראה מיד כשגיאה ולא ייבלע.
const stages = {};
for (const [title, order] of [['TT · שלב קליטה', 10], ['TT · שלב אימות', 20], ['TT · שלב בירור', 30]]) {
  stages[title] = (await one(`
    insert into public.journey_stages (user_id, client_id, title, sort_order)
    values ('${USER_ID}', '${src}', '${title}', ${order}) returning id;`)).id;
}

const mk = async (payload, { stage = null, owner = 'client', dependsOn = null } = {}) =>
  (await jrpc(`public.create_onboarding_request('${src}', 'custom_request', '${payload}'::jsonb,
      null, ${dependsOn ? `'${dependsOn}'` : 'null'}, false, true, '${owner}',
      ${stage ? `'${stage}'` : 'null'})`)).stepId;

// ‼ לב הבדיקה: אותה כותרת בדיוק, שלוש פעמים — פעמיים בשלבים שונים ופעם
// נוספת באותו שלב. לפני מיגרציה 86 כל השלוש היו נבלעות לאחת.
const dupA = await mk(`{"title":"TT · מסמכים חסרים","clientTitle":"TT · מסמכים חסרים","requirements":[
    {"key":"r1","kind":"select","label":"סוג","options":["א","ב"],"done":false},
    {"key":"r2","kind":"files","label":"קבצים","maxFiles":2,"required":false,"done":false}]}`,
  { stage: stages['TT · שלב קליטה'] });
const dupB = await mk(`{"title":"TT · מסמכים חסרים","clientTitle":"TT · מסמכים חסרים","autoAction":{"kind":"email"},"requirements":[
    {"key":"r1","kind":"confirm","label":"אישור","done":false}]}`,
  { stage: stages['TT · שלב בירור'] });
const dupC = await mk(`{"title":"TT · מסמכים חסרים","clientTitle":"TT · מסמכים חסרים","requirements":[
    {"key":"r1","kind":"text","label":"הערה","done":false}]}`,
  { stage: stages['TT · שלב קליטה'] });
const ext = await mk(`{"title":"TT · חיצונית","externalParty":{"kind":"prev_accountant"}}`,
  { stage: stages['TT · שלב אימות'], owner: 'external' });
// תלות שמכוונת לאחת מהכפולות בדיוק (dupB) ולעוד שלב אחר — רב-הורים חוצה-שלבים
const dependent = await mk(`{"title":"TT · תלויה","clientTitle":"TT · תלויה","requirements":[
    {"key":"r1","kind":"confirm","label":"אישור","done":false}]}`,
  { stage: stages['TT · שלב בירור'] });
await jrpc(`public.set_onboarding_step_dependencies('${dependent}', array['${dupB}','${ext}'])`);

// ── שמירה והחלה ─────────────────────────────────────────────────────────────
const saved = await jrpc(`public.save_journey_template('${src}', 'TT · תבנית', 'רגרסיית תבניות')`);
ok('TT-1 · התבנית נשמרה עם כל הרשומות', saved.count === 5, JSON.stringify(saved));

const tpl = saved.templateId;
const entries = (await one(`select entries from public.journey_templates where id='${tpl}'`)).entries;
const dupEntries = entries.filter(e => e.payload?.title === 'TT · מסמכים חסרים');
ok('TT-2 · שלוש רשומות באותה כותרת נשמרו בנפרד', dupEntries.length === 3, String(dupEntries.length));
ok('TT-2 · לכל רשומה מפתח יציב וייחודי',
  new Set(entries.map(e => e.key)).size === entries.length && entries.every(e => !!e.key));
const depEntry = entries.find(e => e.payload?.title === 'TT · תלויה');
ok('TT-2 · התלות נשמרה כמפתחות ולא ככותרות',
  Array.isArray(depEntry?.dependsOn) && depEntry.dependsOn.length === 2,
  JSON.stringify(depEntry?.dependsOn));

const dst = (await one(`
  insert into public.clients (id, user_id, first_name, last_name, email)
  values (replace(gen_random_uuid()::text,'-',''), '${USER_ID}', 'תיק', 'TT-יעד', 'delivered@resend.dev')
  returning id;`)).id;

const applied = await jrpc(`public.apply_journey_template('${dst}', '${tpl}')`);
ok('TT-1 · ההחלה יצרה את כל הרשומות', applied.added === 5 && applied.skipped === 0, JSON.stringify(applied));

// ── TT-1 · מבנה השלבים והסדר ────────────────────────────────────────────────
const structure = await writeStaging(`
  select js.title, js.sort_order,
         string_agg(s.payload->>'title', ' | ' order by s.sort_order) as tasks
    from public.journey_stages js
    left join public.onboarding_steps s on s.stage_id = js.id
   where js.client_id = '${dst}'
   group by 1,2 order by js.sort_order;`);
ok('TT-1 · שלושה שלבים, באותו סדר, בלי כפילות',
  structure.length === 3 &&
  structure[0].title === 'TT · שלב קליטה' && structure[0].sort_order === 10 &&
  structure[1].title === 'TT · שלב אימות' && structure[1].sort_order === 20 &&
  structure[2].title === 'TT · שלב בירור' && structure[2].sort_order === 30,
  JSON.stringify(structure.map(r => `${r.sort_order}:${r.title}`)));
ok('TT-2 · שתי הכפולות באותו שלב נשארו שתיים',
  (structure[0].tasks.match(/TT · מסמכים חסרים/g) || []).length === 2, structure[0].tasks);
ok('TT-2 · הכפולה השלישית בשלב האחר', (structure[2].tasks || '').includes('TT · מסמכים חסרים'), structure[2].tasks);

// ── TT-2 · התלות מכוונת לכפולה הנכונה (זו עם האוטומציה, בשלב בירור) ─────────
const depCheck = await one(`
  select count(*)::int as parents,
         bool_or(p.payload ? 'autoAction') as targets_auto_twin,
         bool_and(p.client_id = '${dst}') as ids_are_new,
         string_agg(distinct pjs.title, ' + ') as parent_stages
    from public.onboarding_step_dependencies d
    join public.onboarding_steps ch on ch.id = d.step_id
    join public.onboarding_steps p on p.id = d.depends_on_step_id
    left join public.journey_stages pjs on pjs.id = p.stage_id
   where ch.client_id = '${dst}' and ch.payload->>'title' = 'TT · תלויה';`);
ok('TT-2 · התלות מצביעה על שני הורים, במזהים חדשים',
  depCheck.parents === 2 && depCheck.ids_are_new === true, JSON.stringify(depCheck));
ok('TT-2 · התלות בחרה את התאומה הנכונה (זו עם האוטומציה)',
  depCheck.targets_auto_twin === true, JSON.stringify(depCheck));

// ── TT-5 · תצורה שרדה, והכול טיוטה בלי חימוש ────────────────────────────────
const cfg = await one(`
  select
    (select count(*) from public.onboarding_steps where client_id='${dst}' and published_at is null) as drafts,
    (select count(*) from public.onboarding_steps where client_id='${dst}') as total,
    (select count(*) from public.onboarding_steps where client_id='${dst}' and payload ? 'autoExecutedAt') as armed,
    (select payload->'externalParty'->>'kind' from public.onboarding_steps
      where client_id='${dst}' and payload->>'title'='TT · חיצונית') as ext_kind,
    (select ball from public.onboarding_steps
      where client_id='${dst}' and payload->>'title'='TT · חיצונית') as ext_ball,
    (select (x->'options')::text from public.onboarding_steps s, jsonb_array_elements(s.payload->'requirements') x
      where s.client_id='${dst}' and x->>'kind'='select' limit 1) as options,
    (select x->>'maxFiles' from public.onboarding_steps s, jsonb_array_elements(s.payload->'requirements') x
      where s.client_id='${dst}' and x->>'kind'='files' limit 1) as max_files,
    (select x->>'required' from public.onboarding_steps s, jsonb_array_elements(s.payload->'requirements') x
      where s.client_id='${dst}' and x->>'kind'='files' limit 1) as files_required;`);
ok('TT-5 · הכול נולד כטיוטה', cfg.drafts === cfg.total && cfg.total === 5, JSON.stringify(cfg));
ok('TT-5 · שום אוטומציה לא נחמשה בהחלה', cfg.armed === 0, String(cfg.armed));
ok('TT-5 · גורם חיצוני נשמר', cfg.ext_kind === 'prev_accountant' && cfg.ext_ball === 'prev_accountant');
ok('TT-5 · תצורת הדרישות נשמרה (options / maxFiles / רשות)',
  cfg.options === '["א", "ב"]' && cfg.max_files === '2' && cfg.files_required === 'false',
  JSON.stringify(cfg));

// ── TT-3 · אידמפוטנטיות ─────────────────────────────────────────────────────
const before = (await one(`select count(*)::int as n from public.onboarding_steps where client_id='${dst}'`)).n;
const again = await jrpc(`public.apply_journey_template('${dst}', '${tpl}')`);
const after = (await one(`select count(*)::int as n from public.onboarding_steps where client_id='${dst}'`)).n;
ok('TT-3 · החלה חוזרת אינה מוסיפה דבר', again.added === 0 && again.skipped === 5, JSON.stringify(again));
ok('TT-3 · מספר השורות לא השתנה', before === after, `${before} → ${after}`);
ok('TT-3 · הכפולות לא שוכפלו',
  (await one(`select count(*)::int as n from public.onboarding_steps
               where client_id='${dst}' and payload->>'title'='TT · מסמכים חסרים'`)).n === 3);
ok('TT-3 · שלבי-העל לא שוכפלו',
  (await one(`select count(*)::int as n from public.journey_stages where client_id='${dst}'`)).n === 3);
ok('TT-3 · התלויות לא שוכפלו',
  (await one(`select count(*)::int as n from public.onboarding_step_dependencies d
               join public.onboarding_steps s on s.id = d.step_id where s.client_id='${dst}'`)).n === 2);

// ── TT-4 · תאימות v1 (בלי key — זיהוי לפי כותרת, כמו קודם) ──────────────────
const v1c = (await one(`
  insert into public.clients (id, user_id, first_name, last_name, email)
  values (replace(gen_random_uuid()::text,'-',''), '${USER_ID}', 'תיק', 'TT-v1', 'delivered@resend.dev')
  returning id;`)).id;
const v1tpl = (await one(`
  insert into public.journey_templates (user_id, name, entries) values ('${USER_ID}', 'TT · v1',
   '[{"stepType":"custom_request","requiredForClose":true,
      "payload":{"title":"TT · ישנה","clientTitle":"TT · ישנה","requirements":[{"key":"r1","kind":"text","label":"טקסט","done":false}]}}]'::jsonb)
  returning id;`)).id;
const v1a = await jrpc(`public.apply_journey_template('${v1c}', '${v1tpl}')`);
const v1b = await jrpc(`public.apply_journey_template('${v1c}', '${v1tpl}')`);
ok('TT-4 · תבנית v1 מוחלת', v1a.added === 1, JSON.stringify(v1a));
ok('TT-4 · תבנית v1 נשארת אידמפוטנטית לפי כותרת', v1b.added === 0 && v1b.skipped === 1, JSON.stringify(v1b));
ok('TT-4 · שורת v1 נולדה כטיוטה, בלי חותמת מקור',
  (await one(`select (published_at is null and not (payload ? 'templateOrigin')) as okk
                from public.onboarding_steps where client_id='${v1c}'`)).okk === true);

// ── ניקוי ───────────────────────────────────────────────────────────────────
await writeStaging(`
  delete from public.clients where id in ('${src}','${dst}','${v1c}');
  delete from public.journey_templates where id in ('${tpl}','${v1tpl}');`);
const leftovers = await one(`
  select (select count(*)::int from public.clients where last_name in ('TT-מקור','TT-יעד','TT-v1')) as c,
         (select count(*)::int from public.journey_templates where name like 'TT · %') as t;`);
ok('ניקוי מלא אחרי הבדיקה', leftovers.c === 0 && leftovers.t === 0, JSON.stringify(leftovers));

console.log(`\n${fail === 0 ? '✓' : '✗'} עברו ${pass} · נכשלו ${fail}`);
process.exit(fail === 0 ? 0 : 1);
