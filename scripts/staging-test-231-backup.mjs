// גיבוי שבועי על staging (dryRun — בלי מיילים): גרסת הערכה מלאכותית נכנסת לקובץ, והקובץ משוחזר
// בבידוד (PGlite) — בלי יעד ייצור. ניקוי מלא: הלקוח, הגרסאות, וקבצי הגיבוי שהריצה יצרה (הדלי היה ריק).
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { STAGING_REF, api, writeStaging } from './staging-lib.mjs';

const OFFICE = 'ca158d52-5ad7-47f5-b228-4b7703978b84';
const RUN = `QABK${Date.now().toString(36).toUpperCase()}`;
let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(info).slice(0, 300)}` : ''}`); };
const lit = (v) => `$q$${typeof v === 'string' ? v : JSON.stringify(v)}$q$`;
const one = async (q) => ((await writeStaging(q)) ?? [])[0];
const asOffice = async (expr) => (await one(`begin; set local role authenticated; select set_config('request.jwt.claims', ${lit({ sub: OFFICE, role: 'authenticated' })}, true); select (${expr}) as r; commit;`))?.r;

const keys = await api(`/projects/${STAGING_REF}/api-keys?reveal=true`);
const SERVICE = keys.find(k => k.name === 'service_role')?.api_key;
const URL = `https://${STAGING_REF}.supabase.co`;
// הדלי היה ריק בבדיקה המקדימה; קבצים של היום מהשעה האחרונה הם של הריצה הקודמת שלי (נדרסים ונמחקים בסוף)
const before = (await one(`select count(*)::int n from storage.objects where bucket_id = 'backups' and not (name like '%/backup-' || to_char(now(), 'YYYY-MM-DD') || '.json' and created_at > now() - interval '1 hour')`)).n;
let A, created = [];
try {
  console.log(`יעד: ${STAGING_REF} · ריצה ${RUN} · קבצי גיבוי לפני: ${before}`);
  if (before !== 0) throw new Error('הדלי לא ריק — לא מריצים כדי לא לדרוס גיבוי קיים');
  A = (await one(`insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
    values (replace(gen_random_uuid()::text,'-',''), '${OFFICE}', 'דוד', '${RUN}', 'delivered@resend.dev', 'active', 'single', 'licensed') returning id`)).id;
  const req = await asOffice(`public.ensure_tax_year_request('${A}', 'estimate', 2026, 9)`);
  const draft = { cutoffMonth: 9, preparedOn: '2026-10-11', lines: [{ id: 'b1', person: 'client', source: 'business', chosen: 'office', actualToCutoff: 270000, actualSource: { note: 'רו״ה · QA' } }], reconciliations: [] };
  const outputs = { taxYear: 2026, blockers: [], rulesetVersion: 'qa', household: { annualLiability: 65168 }, nextAction: 'x' };
  const s = await asOffice(`public.save_tax_estimate('${req.stepId}', ${lit(draft)}::jsonb, ${lit(outputs)}::jsonb, '[]'::jsonb, ${lit({ latestVersion: 0 })}::jsonb)`);
  const a = await asOffice(`public.approve_tax_estimate('${s.id}', ${s.revision})`);
  ok(s?.ok && a?.ok, 'גרסה מלאכותית נשמרה ואושרה', JSON.stringify([s, a]));

  // הפונקציה משווה למפתח השירות שבסביבה שלה — מנסים את המפתח הישן ואת החדש (בלי להדפיס אותם)
  let r;
  for (const key of [SERVICE, keys.find(k => k.type === 'secret')?.api_key]) { r = await fetch(`${URL}/functions/v1/weekly-backup`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ dryRun: true }) }); if (r.status !== 401) break; }
  const body = await r.json();
  ok(r.ok, `הפונקציה רצה (dryRun) · ${r.status}`, JSON.stringify(body).slice(0, 300));
  const mine = (body.backups ?? []).find(x => x.userId === OFFICE);
  created = (body.backups ?? []).map(x => x.filename).filter(Boolean);
  ok(mine && mine.counts.tax_estimates >= 1 && !mine.unreadable.length && !mine.uploadError, 'הגיבוי כולל את tax_estimates, בלי טבלה שלא נקראה', JSON.stringify(mine));
  ok((body.backups ?? []).every(x => x.notified === null), 'אין שליחת מייל (dryRun)', JSON.stringify((body.backups ?? []).map(x => x.notified)));
  for (const t of ['tax_year_facts', 'tax_evidence', 'tax_info_asks', 'tax_card_transfers']) ok(mine && t in mine.counts && mine.counts[t] >= 0, `גם ${t} בהיקף`);

  // הורדה ושחזור בבידוד
  const dl = await fetch(`${URL}/storage/v1/object/backups/${mine.filename}`, { headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE } });
  const dump = await dl.json();
  const rowsEst = dump.tables.tax_estimates.filter(x => x.client_id === A);
  ok(rowsEst.length === 1 && rowsEst[0].status === 'approved' && rowsEst[0].draft.lines[0].actualSource.note === 'רו״ה · QA', 'בקובץ: הגרסה המאושרת עם הנתונים והמקור', JSON.stringify(rowsEst).slice(0, 200));
  writeFileSync(join(process.cwd(), 'backup-sample.json'), JSON.stringify({ tax_estimates: rowsEst }));
  const { PGlite } = await import(pathToFileURL(join(process.env.PGLITE_DIR, 'node_modules/@electric-sql/pglite/dist/index.js')).href);
  const db = new PGlite();
  // שחזור לסכמת היעד (רק העמודות של 231, בלי מפתחות זרים — סביבה מבודדת)
  await db.exec(`create table tax_estimates (id text primary key, user_id uuid, client_id text, request_id text, tax_year int, version int, status text, cutoff_month int,
    draft jsonb, outputs jsonb, input_facts jsonb, ruleset_version text, revision int, approved_by uuid, approved_at timestamptz, created_at timestamptz, updated_at timestamptz)`);
  const cols = ['id', 'user_id', 'client_id', 'request_id', 'tax_year', 'version', 'status', 'cutoff_month', 'draft', 'outputs', 'input_facts', 'ruleset_version', 'revision', 'approved_by', 'approved_at', 'created_at', 'updated_at'];
  for (const x of rowsEst) await db.query(`insert into tax_estimates (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})`, cols.map(c => (['draft', 'outputs', 'input_facts'].includes(c) ? JSON.stringify(x[c]) : x[c])));
  const back = (await db.query(`select status, version, revision, draft->'lines'->0->'actualSource'->>'note' src, (outputs->'household'->>'annualLiability')::int liab, approved_at is not null appr from tax_estimates`)).rows[0];
  ok(back && back.status === 'approved' && back.liab === 65168 && back.src === 'רו״ה · QA' && back.appr, 'שוחזר בבידוד: סטטוס, גרסה, מקור, תוצאה ומועד אישור', JSON.stringify(back));
} catch (e) { fail++; console.error('✗ תקלה:', e.message); }
finally {
  if (A) await writeStaging(`delete from public.tax_estimates where client_id = '${A}';
    delete from public.onboarding_events where step_id in (select id from public.onboarding_steps where client_id = '${A}');
    delete from public.onboarding_steps where client_id = '${A}'; delete from public.clients where id = '${A}';`).catch(e => { fail++; console.error('✗ ניקוי:', e.message); });
  if (created.length) {
    const del = await fetch(`${URL}/storage/v1/object/backups`, { method: 'DELETE', headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: created }) });
    ok(del.ok, `קבצי הגיבוי של הריצה נמחקו (${created.length})`);
  }
  const left = await one(`select (select count(*)::int from storage.objects where bucket_id = 'backups') files, (select count(*)::int from public.clients where last_name = '${RUN}') clients`);
  ok(left.files === before && left.clients === 0, 'ניקוי: הדלי חזר למצבו, אין לקוח בדיקה', JSON.stringify(left));
  console.log(`\n${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
}
