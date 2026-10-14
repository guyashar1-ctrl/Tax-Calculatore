// בדיקת מיגרציה 241 (סבב האיסוף) בבידוד: PGlite, על הגופים החיים של השרת (ייצור או staging) — לא על שחזור מהקבצים.
//   PGLITE_DIR=<tmp>/pgl node scripts/sql/241/test-241.pglite.mjs <items.json> <live-dir> [<232.sql>]
//   <live-dir> — גופי הפונקציות כפי שנקראו מהשרת (קריאה בלבד): _portal_step_items.sql, portal_submit_tax_info.sql…
//   <232.sql>  — אופציונלי: 232 של הצ'אט המקביל, מוזרק אחרי 241 (סדר הפוך מזה של staging) — בודק ששתיהן חיות יחד.
// (items.json — מ-scripts/sql/230/items.ts; ראו fill-items.mjs)
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
const { PGlite } = await import(pathToFileURL(join(process.env.PGLITE_DIR ?? '.', 'node_modules/@electric-sql/pglite/dist/index.js')).href);
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const rd = (p) => readFileSync(WT + p, 'utf8').replace(/\r\n/g, '\n'); // ‼ עותק עם autocrlf — הקבצים בדיסק ב-CRLF
const sql229 = rd('supabase/229-tax-year-collection.sql'), sql230 = rd('supabase/230-wealth-declaration-collection.sql'), sql236 = rd('supabase/236-tax-file-intake.sql');
const sql241 = rd('supabase/241-collection-ux.sql');
const sql222 = rd('supabase/222-request-preview.sql').replace(/\r\n/g, '\n');
const psi = sql222.slice(sql222.indexOf('-- >>> GENERATED:portal_step_items'), sql222.indexOf('-- <<< GENERATED:portal_step_items'));
const t229 = rd('scripts/sql/229/test-229-tax-year.pglite.mjs').replace(/\r\n/g, '\n');
const OFFICE = '11111111-1111-1111-1111-111111111111', OTHER = '22222222-2222-2222-2222-222222222222';
const setup = t229.slice(t229.indexOf('await db.exec(`') + 'await db.exec(`'.length, t229.indexOf('`);\nawait db.exec(psi);'))
  .replaceAll('${OFFICE}', OFFICE).replaceAll('${OTHER}', OTHER);
const announce = t229.slice(t229.indexOf('await db.exec(`create function public._client_announceable_steps') + 'await db.exec(`'.length, t229.indexOf('$f$;`);') + '$f$;'.length);
const codeItems = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const LIVE = resolve(process.argv[3]);
const with232 = process.argv[4];
const live = (fn) => readFileSync(join(LIVE, `${fn}.sql`), 'utf8');

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${info}` : ''}`); };
const q = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => (await q(s, p))[0];
const as = async (uid) => db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`);
const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).r;
const throws = async (s, p) => { try { await db.query(s, p); return null; } catch (e) { return e.message; } };
const throwsExec = async (s) => { try { await db.exec(s); return null; } catch (e) { return e.message; } };
const marks = async (fn, mark) => (await one(`select (length(prosrc) - length(replace(prosrc, $2, ''))) / length($2) n from pg_proc where proname = $1`, [fn, mark])).n;

// ── הקמה: טבלאות 229/230/236 מהקבצים, ואז הגופים החיים של השרת במקום מה שהקבצים יצרו ──
await db.exec(setup);
await db.exec(`create table public.documents (id text primary key, client_id text not null, file_name text);
  create table public.tax_fact_changes (id text primary key default gen_random_uuid()::text, user_id uuid, client_id text not null references public.clients(id), field_key text not null,
    label text, old_value jsonb, new_value jsonb, source text not null, source_ref text, note text, status text not null default 'pending',
    decided_by uuid, decided_at timestamptz, superseded_by text, created_at timestamptz not null default now());
  create unique index tax_fact_changes_one_pending on public.tax_fact_changes (client_id, field_key) where status = 'pending';
  alter table public.clients add column city text, add column address text, add column zip_code text, add column family_status text,
    add column children jsonb default '[]'::jsonb, add column bank_accounts jsonb default '[]'::jsonb, add column employers jsonb default '[]'::jsonb,
    add column field_meta jsonb default '{}'::jsonb;
  insert into public.documents values ('d-c1', 'c1', 'הודעה על מועד.pdf'), ('d-c2', 'c2', 'של לקוח אחר.pdf');`);
await db.exec(psi);
await db.exec(announce);
await db.exec(rd('scripts/sql/236/legacy-stubs.sql'));
await db.exec(sql229); await db.exec(sql230); await db.exec(sql236);
const LIVE_FNS = ['is_hebrew_only', '_tax_year_client', '_tax_year_items', 'add_tax_info_asks', 'portal_submit_tax_info', '_portal_step_items',
  'ensure_tax_year_request', 'ensure_wealth_declaration', 'update_wealth_declaration', '_tax_fact_field_op', 'apply_tax_facts'];
for (const fn of LIVE_FNS) await db.exec(live(fn));
await db.exec(`alter table public.clients add constraint clients_city_hebrew_only check (public.is_hebrew_only(city)),
  add constraint clients_address_hebrew_only check (public.is_hebrew_only(address));`);
const env = live('_portal_step_items').includes("when 'tax_estimate' then") ? 'staging (עם 232)' : 'ייצור (בלי 232)';
console.log(`גופים חיים: ${LIVE} — ${env}`);
const before = Object.fromEntries(await Promise.all(['add_tax_info_asks', 'portal_submit_tax_info', '_portal_step_items', '_tax_fact_field_op']
  .map(async fn => [fn, (await one(`select md5(prosrc) h from pg_proc where proname = $1`, [fn])).h])));

// ── 0. החלה, והחלה חוזרת ──
await db.exec(sql241);
await db.exec(sql241);
for (const [fn, mark] of [['add_tax_info_asks', '241 · רשומה'], ['portal_submit_tax_info', '241 · רשומה'], ['portal_submit_tax_info', '241 · סיבה'], ['_portal_step_items', '241 · מסמכים'], ['_tax_fact_field_op', '241 · כתובת']])
  ok(await marks(fn, mark) === 1, `${fn}: «${mark}» פעם אחת, גם אחרי החלה חוזרת`);
ok(await marks('_portal_step_items', '229 · «השלמת מידע»') === 1, 'הענף של 229 נשאר אחד');
if (env.startsWith('staging')) ok(await marks('_portal_step_items', "when 'tax_estimate' then") === 1, '232 נשארה שלמה');
const items = (await one(`select public._tax_year_items() m`)).m;
ok(JSON.stringify(Object.keys(items).sort()) === JSON.stringify(Object.keys(codeItems).sort()) && Object.entries(codeItems).every(([k, v]) => items[k] === v),
  `רשימת הפריטים בשרת = הקטלוג בקוד (${Object.keys(items).length})`, JSON.stringify(Object.keys(codeItems).filter(k => !(k in items))));
// 229 בהחלה חוזרת (אחרי 241) — מזהה את הענף כגרסה הנוכחית ולא נעצר
{ const e229 = await throwsExec(sql229.slice(sql229.indexOf('do $patch$'), sql229.indexOf('$patch$;') + '$patch$;'.length)); ok(!e229, '229 (סעיף 11) בהחלה חוזרת אחרי 241 — לא נעצרת', e229 ?? ''); }

// ── 1. שאלה מסוג רשומה ──
await as(OFFICE);
await db.query(`update public.clients set children = $1, bank_accounts = $2, city = 'חיפה', address = 'הנשיא 5' where id = 'c1'`,
  [JSON.stringify([{ id: 'k1', firstName: 'אורי', birthDate: '2015-04-02' }, { id: 'k2', firstName: 'מאיה', birthDate: '2018-09-10' }]), JSON.stringify([{ id: 'b1', bankName: 'בנק לאומי', accountNumber: '0012345', isPrimary: true }])]);
const intake = await rpc('ensure_tax_file_intake', ['c1']);
const ask = (key, input, role = 'couple', extra = {}) => ({ itemKey: key, subjectRole: role, prompt: { title: key, input, ...extra } });
const add1 = await rpc('add_tax_info_asks', [intake.stepId, JSON.stringify([
  ask('intake.children', { kind: 'confirm', lines: ['אורי — 2015', 'מאיה — 2018'], edit: { schema: 'children' } }),
  ask('intake.address', { kind: 'record', schema: 'address' }),
  ask('intake.bankAccount', { kind: 'record', schema: 'bank' }),
  ask('intake.idCard', { kind: 'file', docKind: 'idCard' }, 'client'),
  ask('intake.creditDocs', { kind: 'file', docKind: 'pensionReport' }, 'client'),
  ask('intake.insuranceDocs', { kind: 'file', docKind: 'lifeInsurance' }, 'client'),
])]);
ok(add1.ok && add1.added === 6, 'add_tax_info_asks מקבל input מסוג record', JSON.stringify(add1));
ok((await rpc('add_tax_info_asks', [intake.stepId, JSON.stringify([ask('intake.funds', { kind: 'magic' })])])).error === 'bad_prompt', 'סוג קלט לא מוכר — נדחה');
const info = (await one(`select step_id from public.tax_info_asks where parent_step_id = $1 limit 1`, [intake.stepId])).step_id;
const infoRow = await one(`select published_at, status from public.onboarding_steps where id = $1`, [info]);
ok(infoRow.published_at === null, 'הוספת שאלות אינה פרסום');
await db.query(`update public.tax_info_asks set state = 'published' where step_id = $1`, [info]);
await db.query(`update public.onboarding_steps set published_at = now(), status = 'waiting_client', ball = 'client' where id = $1`, [info]);
const askId = async (key) => (await one(`select id from public.tax_info_asks where step_id = $1 and item_key = $2`, [info, key])).id;
const submit = (key, answer) => askId(key).then(id => rpc('portal_submit_tax_info', ['tok-c1', id, JSON.stringify(answer)]));
await as('');

// ── 2. תשובות מובנות ──
const bad = async (key, value, why) => { const r = await submit(key, { kind: 'record', value }); ok(r.error === 'bad_record', `רשומה לא תקינה נדחית: ${why}`, JSON.stringify(r)); };
await bad('intake.address', 'רחוב', 'מחרוזת');
await bad('intake.address', { items: 'x' }, 'items שאינו מערך');
await bad('intake.address', { items: [1, 2] }, 'פריט שאינו אובייקט');
await bad('intake.address', { items: Array.from({ length: 41 }, () => ({})) }, 'יותר מ-40 פריטים');
await bad('intake.address', { city: 'חיפה' }, 'בלי items ובלי inPeriod');
await bad('intake.address', { items: [{ note: 'א'.repeat(21000) }] }, 'גדולה מדי');
const addrV = { items: [{ city: 'חיפה', street: 'מוריה', houseNumber: '12', apartment: '4', zip: '3457101' }] };
const r1 = await submit('intake.address', { kind: 'record', value: addrV });
ok(r1.ok && r1.state === 'answered', 'כתובת מובנית נשמרה', JSON.stringify(r1));
const f1 = await one(`select answer, value, status, client_assertion from public.tax_year_facts where item_key = 'intake.address'`);
const norm = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
ok(f1.status === 'pending' && norm(f1.value) === norm(addrV) && f1.answer === 'value', 'עובדה ממתינה — הרשומה כפי שנשלחה', JSON.stringify(f1));
ok((await one(`select address from public.clients where id = 'c1'`)).address === 'הנשיא 5', 'תשובת לקוח לא כותבת לכרטיס');
// «משהו השתנה» ברשומה: מה שהיה — מהשאלה עצמה, לא ממה שהדפדפן שלח
const r2 = await submit('intake.children', { kind: 'record', assertion: 'changed', was: ['זיוף'], value: { items: [{ id: 'k1', firstName: 'אורי', birthDate: '2015-04-02' }, { firstName: 'נגה', birthDate: '2025-01-20' }] } });
const f2 = await one(`select value, client_assertion from public.tax_year_facts where item_key = 'intake.children'`);
ok(r2.ok && f2.client_assertion === 'changed' && f2.value.changed === true && f2.value.record.items.length === 2 && JSON.stringify(f2.value.was) === JSON.stringify(['אורי — 2015', 'מאיה — 2018']),
  '«משהו השתנה»: רשומה + מה שהיה לפי השאלה (לא לפי הדפדפן)', JSON.stringify(f2));
const r3 = await submit('intake.bankAccount', { kind: 'record', none: true });
ok(r3.ok && (await one(`select answer from public.tax_year_facts where item_key = 'intake.bankAccount'`)).answer === 'no', '«אין» ברשומה ⇒ «לא»');
// תחולה (רשומה בלי items)
await as(OFFICE);
const annual = await rpc('ensure_tax_year_request', ['c1', 'annual', 2025, null]);
await rpc('add_tax_info_asks', [annual.stepId, JSON.stringify([{ itemKey: 'period.property', subjectRole: 'couple', entityKind: 'property', entityRef: 'p1', prompt: { title: 'הנכס', input: { kind: 'record', schema: 'period' } } }])]);
const pInfo = (await one(`select step_id, id from public.tax_info_asks where parent_step_id = $1`, [annual.stepId]));
await db.query(`update public.tax_info_asks set state = 'published' where id = $1`, [pInfo.id]);
await as('');
const r4 = await rpc('portal_submit_tax_info', ['tok-c1', pInfo.id, JSON.stringify({ kind: 'record', value: { inPeriod: 'part', from: { date: '2025-03-01', precision: 'month' } } })]);
const f4 = await one(`select value, period_kind, entity_ref from public.tax_year_facts where item_key = 'period.property'`);
ok(r4.ok && f4.value.inPeriod === 'part' && f4.entity_ref === 'p1' && f4.period_kind === 'year', 'תחולת נכס — לשנה, לנכס', JSON.stringify(f4));

// ── 3. סיבת «אין מסמך» והדף האישי ──
const psi1 = async () => (await one(`select public._portal_step_items(s, c, null::public.profiles, null::public.representation_requests, null) as r
  from public.onboarding_steps s, public.clients c where s.id = $1 and c.id = s.client_id`, [info])).r.items;
await submit('intake.idCard', { kind: 'unavailable', reason: 'אעלה בהמשך', code: 'later' });
await submit('intake.creditDocs', { kind: 'unavailable', reason: '', code: 'hack' });
const u1 = await one(`select unavailable from public.tax_info_asks where item_key = 'intake.idCard'`);
const u2 = await one(`select unavailable from public.tax_info_asks where item_key = 'intake.creditDocs'`);
ok(u1.unavailable.code === 'later' && !('code' in u2.unavailable) && u2.unavailable.reason === 'עוד לא התקבל', 'קוד מוכר נשמר; קוד לא מוכר — לא נשמר (כמו «אין לי עדיין» הישן)', JSON.stringify([u1, u2]));
let it = await psi1();
ok(it.length === 1 && it[0].bucket === 'action' && it[0].sub.startsWith('שאלה אחת'), 'שאלה פתוחה — «שאלה אחת» כמו קודם', JSON.stringify(it));
await submit('intake.insuranceDocs', { kind: 'unavailable', reason: 'אין לי — צריך עזרה', code: 'needHelp' });
it = await psi1();
ok(it.length === 1 && it[0].bucket === 'action' && it[0].sub.startsWith('נשארו 2 מסמכים להשלמה'), 'מסמכים שהלקוח עוד יעלה — «נשארו 2 מסמכים להשלמה» (פעולה שלו, כולל «אין לי עדיין» הישן)', JSON.stringify(it));
ok((await one(`select ball from public.onboarding_steps where id = $1`, [info])).ball === 'me', 'הכדור אצל המשרד (לבדיקת התשובות) — כמו קודם');
await db.query(`update public.tax_info_asks set state = 'answered' where item_key in ('intake.idCard', 'intake.creditDocs') and step_id = $1`, [info]);
it = await psi1();
ok(it.length === 1 && it[0].bucket === 'office' && it[0].sub.includes('ביקשת עזרה במסמך אחד'), '«צריך עזרה» לבד — אצל המשרד', JSON.stringify(it));
await db.query(`update public.tax_info_asks set state = 'answered' where step_id = $1`, [info]);
it = await psi1();
ok(it.length === 1 && it[0].bucket === 'done', 'הכול נענה — «נשלח למשרד»', JSON.stringify(it));

// ── 4. מסמך מכמה קבצים — עקיבות ──
await db.query(`update public.tax_info_asks set state = 'published' where item_key = 'intake.idCard' and step_id = $1`, [info]);
await submit('intake.idCard', { kind: 'file', fileName: 'תעודת זהות.pdf', documentId: 'doc-1' });
const idAsk = await askId('intake.idCard');
const parts = [{ page: 1, part: 'צד קדמי', name: 'front.jpg', type: 'image/jpeg', size: 1200 }, { page: 2, part: 'ספח — כל העמודים', name: 'a1.jpg', type: 'image/jpeg', size: 900, rotation: 90, extra: 'x' }];
const n1 = await rpc('portal_note_tax_evidence_parts', ['tok-c1', idAsk, JSON.stringify(parts)]);
const evp = await one(`select parts, note from public.tax_evidence where ask_id = $1`, [idAsk]);
ok(n1.ok && evp.parts.length === 2 && evp.parts[1].rotation === 90 && !('extra' in evp.parts[1]) && evp.note.includes('נבנה מ-2 קבצים'), 'עקיבות נשמרה: סדר, חלק, שם — בלי שדות זרים', JSON.stringify(evp));
ok((await rpc('portal_note_tax_evidence_parts', ['tok-c2', idAsk, '[]'])).error, 'טוקן של לקוח אחר — אסור');
ok((await rpc('portal_note_tax_evidence_parts', ['tok-c1', idAsk, '{"a":1}'])).error === 'bad_parts', 'לא מערך — נדחה');
await db.query(`update public.tax_evidence set review = 'accepted' where ask_id = $1`, [idAsk]);
ok((await rpc('portal_note_tax_evidence_parts', ['tok-c1', idAsk, JSON.stringify(parts)])).error === 'no_evidence', 'מסמך שכבר נבדק — לא משתנה');

// ── 5. עבודות מס ──
await as(OFFICE);
const steps = async () => (await one(`select count(*)::int n from public.onboarding_steps where client_id = 'c1' and step_type in ('annual_return','wealth_declaration')`)).n;
const s0 = await steps();
const curYear = Number((await one(`select extract(year from current_date)::int y`)).y);
ok((await rpc('upsert_tax_work', ['c1', 'annual', curYear, null, '{}'])).error === 'year_not_ended', 'דוח שנתי לשנה שלא הסתיימה — נדחה');
ok((await rpc('upsert_tax_work', ['c1', 'annual', 2024, null, JSON.stringify({ deadline: { status: 'verified', due: '2025-05-31' } })])).error === 'evidence_required', '«רשמי» בלי בסיס — נדחה');
ok((await rpc('upsert_tax_work', ['c1', 'annual', 2024, null, JSON.stringify({ deadline: { status: 'verified', due: '2025-05-31', evidence: { kind: 'document', documentId: 'd-c2' } } })])).error === 'evidence_not_found', 'מסמך של לקוח אחר אינו בסיס');
ok(await steps() === s0, 'שגיאה בפרטים — שום עבודה לא נוצרה');
const w1 = await rpc('upsert_tax_work', ['c1', 'annual', 2024, null, JSON.stringify({ source: 'client', sourceNote: 'הלקוח סיפר', deadline: { status: 'reported', due: '2025-06-30' }, lastAuthorityCheck: { at: '2026-10-01' }, createdVia: 'bulk' })]);
const ws1 = await one(`select payload, published_at, status, ball from public.onboarding_steps where id = $1`, [w1.stepId]);
ok(w1.ok && w1.created && ws1.payload.work.source === 'client' && ws1.payload.work.deadline.status === 'reported' && ws1.payload.workLog[0].what === 'created', 'דוח שנתי נוצר עם מקור, מועד «נמסר» ויומן', JSON.stringify([w1, ws1.payload.work]));
ok(!(await one(`select count(*)::int n from public.onboarding_steps where client_id = 'c1' and step_type = 'info_collection' and payload->>'parentStepId' = $1`, [w1.stepId])).n, 'יצירת עבודה אינה פותחת שאלות ללקוח (טיוטה — רק כשהמשרד מוסיף)');
const w2 = await rpc('upsert_tax_work', ['c1', 'annual', 2024, null, JSON.stringify({ source: 'letter', deadline: { status: 'verified', due: '2025-05-31', evidence: { kind: 'publication', label: 'הודעת רשות המסים' } }, createdVia: 'tax_file' })]);
const ws2 = await one(`select payload from public.onboarding_steps where id = $1`, [w1.stepId]);
ok(w2.ok && !w2.created && w2.stepId === w1.stepId && JSON.stringify(w2.kept.sort()) === JSON.stringify(['deadline', 'source']) && ws2.payload.work.source === 'client' && ws2.payload.work.createdVia === 'bulk',
  'הוספה חוזרת: אותה עבודה; מה שרשום ושונה — לא נדרס (kept); «איך נוצרה» — הראשונה', JSON.stringify([w2, ws2.payload.work]));
ok(await steps() === s0 + 1, 'אין עבודה שנייה');
const up = await rpc('update_tax_work', [w1.stepId, JSON.stringify({ deadline: { status: 'verified', due: '2025-05-31', evidence: { kind: 'document', documentId: 'd-c1' } } }), 'נמצא מכתב']);
const ws3 = await one(`select payload from public.onboarding_steps where id = $1`, [w1.stepId]);
ok(up.ok && ws3.payload.work.deadline.status === 'verified' && ws3.payload.workLog.at(-1).note === 'נמצא מכתב', 'עריכה: «רשמי» עם מסמך בתיק, ונרשם ביומן', JSON.stringify(ws3.payload.workLog));
ok((await rpc('update_tax_work', [w1.stepId, JSON.stringify({ bogus: 1 })])).error === 'bad_field', 'שדה לא מוכר — נדחה');
// הצהרת הון — דרישה ויעד פנימי במודל של 230
const wl = await rpc('upsert_tax_work', ['c1', 'wealth', null, '2025-12-31', JSON.stringify({ declKind: 'first', source: 'letter', demand: { source: 'letter', letterDate: '2026-09-01', dueInLetter: '2027-01-01' }, internalTarget: '2026-12-01' })]);
const wls = await one(`select payload from public.onboarding_steps where id = $1`, [wl.stepId]);
ok(wl.ok && wl.created && wls.payload.demand?.status === 'reported' && wls.payload.internalTarget === '2026-12-01' && wls.payload.work.source === 'letter' && !('internalTarget' in wls.payload.work),
  'הצהרת הון: דרישה «נמסרה» ויעד פנימי — במודל של 230, לא ב-work', JSON.stringify(wls.payload));
const wl2 = await rpc('upsert_tax_work', ['c1', 'wealth', null, '2025-12-31', JSON.stringify({ demand: { source: 'client', dueInLetter: '2027-02-01' }, internalTarget: '2026-11-15' })]);
const wls2 = await one(`select payload from public.onboarding_steps where id = $1`, [wl.stepId]);
ok(wl2.ok && !wl2.created && wl2.kept.includes('demand') && wl2.kept.includes('internalTarget') && wls2.payload.internalTarget === '2026-12-01' && wls2.payload.demand.dueInLetter === '2027-01-01',
  'הצהרת הון קיימת: דרישה ויעד שכבר רשומים — לא נדרסים', JSON.stringify(wl2));
ok((await rpc('upsert_tax_work', ['c1', 'wealth', null, '2024-12-31', JSON.stringify({ deadline: { status: 'reported', due: '2025-01-01' } })])).error === 'use_wealth_demand', 'הצהרת הון — מועד רק בדרישה');
const sW = await steps();
const rb = await throws(`select public.upsert_tax_work('c1', 'wealth', null, '2023-12-31', $1)`, [JSON.stringify({ demand: { source: 'letter', letterDate: '2026-09-01', dueInLetter: '2026-01-01' } })]);
ok(!!rb && rb.includes('due_before_letter') && await steps() === sW, 'דרישה לא תקינה אחרי היצירה — הכול מתבטל (אין הצהרה חצי-רשומה)', rb ?? 'לא נזרק');
await as(OTHER);
ok(!!(await throws(`select public.upsert_tax_work('c1', 'annual', 2023, null, '{}')`)), 'משרד אחר — אסור');
ok(!!(await throws(`select public.update_tax_work($1, '{}')`, [w1.stepId])), 'משרד אחר — אסור לערוך');
await as(OFFICE);

// ── 6. עדכון הכרטיס מתשובה מאושרת: כתובת, ילדים, סתירה, שינוי במקביל ──
const snap = async () => (await one(`select city, address, zip_code, children, field_meta from public.clients where id = 'c1'`));
const s1 = await snap();
const prop = (k, oldV, newV) => ({ field_key: k, label: k, old_value: { patch: { [k]: oldV } }, new_value: { patch: { [k]: newV } } });
const a1 = await rpc('apply_tax_facts', ['c1', 'questionnaire', 'tax_year_fact:x', JSON.stringify([prop('address', s1.address, 'מוריה 12 דירה 4'), prop('zipCode', s1.zip_code, '3457101')])]);
const s2 = await snap();
ok(a1.ok && a1.applied === 2 && s2.address === 'מוריה 12 דירה 4' && s2.zip_code === '3457101' && s2.field_meta.address?.source === 'questionnaire', 'כתובת עודכנה בכרטיס, עם מקור', JSON.stringify([a1, s2.field_meta]));
const hist = await one(`select old_value, status from public.tax_fact_changes where field_key = 'address'`);
ok(hist.status === 'accepted' && hist.old_value.patch.address === 'הנשיא 5', 'הכתובת הקודמת נשמרה בהיסטוריה');
const heb = await throws(`select public.apply_tax_facts('c1', 'questionnaire', null, $1)`, [JSON.stringify([prop('city', 'חיפה', 'Haifa')])]);
ok(!!heb && /hebrew_only|check/i.test(heb) && (await snap()).city === 'חיפה', 'יישוב שאינו בעברית — נדחה (כמו בכל הכרטיס)', heb ?? 'לא נדחה');
// ילדים: הלקוח השמיט את מאיה; המשרד הכריע «נרשם בטעות» — יוצאת, והרשימה הקודמת בהיסטוריה
const kidsNow = (await snap()).children;
const kidsNext = [kidsNow[0], { id: 'k3', firstName: 'נגה', birthDate: '2025-01-20', birthYear: 2025, hasDisability: false }];
const a2 = await rpc('apply_tax_facts', ['c1', 'questionnaire', 'tax_year_fact:y', JSON.stringify([prop('children', kidsNow, kidsNext)])]);
const ch = await one(`select old_value from public.tax_fact_changes where field_key = 'children' and status = 'accepted'`);
ok(a2.applied === 1 && (await snap()).children.map(k => k.id).join() === 'k1,k3' && ch.old_value.patch.children.some(k => k.firstName === 'מאיה'), 'השמטה בהכרעת משרד: יוצאת מהתיק, והרשימה הקודמת בהיסטוריה');
// שינוי במקביל: שתי הצעות על אותה תמונת מצב — הראשונה חלה, השנייה ממתינה (לא דורסת)
const base = (await snap()).city;
const c1r = await rpc('apply_tax_facts', ['c1', 'questionnaire', 'tab-1', JSON.stringify([prop('city', base, 'עכו')])]);
const c2r = await rpc('apply_tax_facts', ['c1', 'questionnaire', 'tab-2', JSON.stringify([prop('city', base, 'נהריה')])]);
ok(c1r.applied === 1 && c2r.pending === 1 && c2r.results[0].outcome === 'pending_conflict' && (await snap()).city === 'עכו', 'שתי לשוניות: השנייה ממתינה כסתירה — לא נדרסת', JSON.stringify([c1r.results, c2r.results]));
ok((await rpc('apply_tax_facts', ['c1', 'questionnaire', 'again', JSON.stringify([prop('city', base, 'עכו')])])).results[0].outcome === 'already_applied', 'אותו עדכון שוב — «כבר חל», לא שורה שנייה');

// ── 7. הרשאות ──
const can = async (role, fn) => (await one(`select has_function_privilege($1, $2, 'execute') x`, [role, fn])).x;
ok(!(await can('anon', 'public.upsert_tax_work(text, text, int, date, jsonb)')) && await can('authenticated', 'public.upsert_tax_work(text, text, int, date, jsonb)'), 'upsert_tax_work — למשרד בלבד');
ok(!(await can('anon', 'public.update_tax_work(text, jsonb, text)')), 'update_tax_work — למשרד בלבד');
ok(await can('anon', 'public.portal_note_tax_evidence_parts(text, uuid, jsonb)'), 'portal_note_tax_evidence_parts — לדף האישי (לפי טוקן)');
ok(!(await can('anon', 'public._tax_work_apply(jsonb, jsonb, text, text, text)')) && !(await can('authenticated', 'public._tax_work_apply(jsonb, jsonb, text, text, text)')), '_tax_work_apply — פנימית');
ok(!(await can('authenticated', 'public._tax_fact_field_op(text, text, boolean, jsonb, text)')), '_tax_fact_field_op — נשארה פנימית');

// ── 8. 232 אחרי 241 (הסדר ההפוך מזה של staging) ──
if (with232 && existsSync(with232)) {
  const s232 = readFileSync(with232, 'utf8');
  const blk = s232.slice(s232.indexOf('do $p232a$'), s232.indexOf('$p232a$;') + '$p232a$;'.length);
  const e = await throwsExec(blk);
  ok(!e && await marks('_portal_step_items', "when 'tax_estimate' then") === 1 && await marks('_portal_step_items', '241 · מסמכים') === 1, '232 אחרי 241 — שתיהן חיות, בלי התנגשות', e ?? '');
  ok((await psi1()).length === 1, 'הענף של 241 עדיין עובד אחרי 232');
}

// ── 9. גופים ש-241 לא אמורה לגעת בהם ──
for (const fn of ['ensure_tax_year_request', 'ensure_wealth_declaration', 'apply_tax_facts', 'update_wealth_declaration', '_tax_year_client'])
  ok((await one(`select prosrc not like '%241%' x from pg_proc where proname = $1`, [fn])).x, `${fn} — לא שונה ב-241`);

// ── 10. החזרה (rollback-241.sql), והחלה מחדש אחריה ──
await as(OFFICE);
await rpc('add_tax_info_asks', [intake.stepId, JSON.stringify([ask('intake.employers', { kind: 'record', schema: 'employer' }, 'client')])]);
await db.query(`update public.tax_info_asks set state = 'published' where item_key = 'intake.employers'`);
await rpc('apply_tax_facts', ['c1', 'questionnaire', 'tab-3', JSON.stringify([prop('city', 'חיפה', 'צפת')])]); // סתירה ⇒ ממתינה
const rbSql = rd('scripts/sql/241/rollback-241.sql');
const rbErr = await throwsExec(rbSql);
ok(!rbErr, 'ההחזרה רצה', rbErr ?? '');
ok(!(await one(`select count(*)::int n from pg_proc where prosrc like '%241 ·%'`)).n, 'אין סימני 241 באף פונקציה');
for (const fn of ['upsert_tax_work', 'update_tax_work', 'portal_note_tax_evidence_parts', '_tax_work_apply'])
  ok(!(await one(`select count(*)::int n from pg_proc where proname = $1`, [fn])).n, `${fn} — הוסרה`);
const after = Object.fromEntries(await Promise.all(Object.keys(before).map(async fn => [fn, (await one(`select md5(prosrc) h from pg_proc where proname = $1`, [fn])).h])));
for (const fn of Object.keys(before)) {
  if (fn === '_portal_step_items' && with232) { ok(await marks(fn, "when 'tax_estimate' then") === 1, `${fn} — 232 נשארה אחרי ההחזרה (רק 241 הוסרה)`); continue; }
  ok(after[fn] === before[fn], `${fn} — זהה בדיוק לגוף החי לפני 241`);
}
const itemsBack = (await one(`select public._tax_year_items() m`)).m;
const liveItems = JSON.parse(live('_tax_year_items').match(/select '([\s\S]*?)'::jsonb/)[1].replace(/''/g, "'"));
ok(JSON.stringify(Object.keys(itemsBack).sort()) === JSON.stringify(Object.keys(liveItems).sort()), `רשימת הפריטים חזרה לזו של השרת (${Object.keys(liveItems).length})`);
ok((await one(`select state from public.tax_info_asks where item_key = 'intake.employers'`)).state === 'cancelled', 'שאלת רשומה שלא נענתה — בוטלה (הדף הישן לא מציג אותה)');
ok((await one(`select count(*)::int n from public.tax_year_facts where item_key = 'intake.address'`)).n === 1, 'תשובות שנשמרו — לא נמחקו');
ok((await one(`select status from public.tax_fact_changes where source_ref = 'tab-3'`)).status === 'rejected', 'הצעת כתובת ממתינה — נדחתה עם הערה');
ok((await one(`select address from public.clients where id = 'c1'`)).address === 'מוריה 12 דירה 4', 'מה שכבר נכנס לכרטיס — נשאר');
ok(!(await throwsExec(rbSql)), 'החזרה שנייה — לא נכשלת');
const re = await throwsExec(sql241);
ok(!re && await marks('_portal_step_items', '241 · מסמכים') === 1 && await marks('portal_submit_tax_info', '241 · רשומה') === 1, 'החלה מחדש אחרי ההחזרה', re ?? '');

console.log(`\n${pass} עברו, ${fail} נכשלו (${env})`);
process.exit(fail ? 1 : 0);
