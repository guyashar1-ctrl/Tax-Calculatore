// בדיקת מיגרציה 236 (קליטה והשלמת תיק המס) בבידוד: PGlite, על אותה הקמה של בדיקת 229 + 229 + 230 + 236.
//   PGLITE_DIR=<tmp> node scripts/sql/236/test-236-intake.pglite.mjs <tmp>/items.json
// (items.json — מ-scripts/sql/230/items.ts; ראו fill-items.mjs)
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
const { PGlite } = await import(pathToFileURL(join(process.env.PGLITE_DIR ?? '.', 'node_modules/@electric-sql/pglite/dist/index.js')).href);
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const sql229 = readFileSync(WT + 'supabase/229-tax-year-collection.sql', 'utf8');
const sql230 = readFileSync(WT + 'supabase/230-wealth-declaration-collection.sql', 'utf8');
const sql236 = readFileSync(WT + 'supabase/236-tax-file-intake.sql', 'utf8');
const sql222 = readFileSync(WT + 'supabase/222-request-preview.sql', 'utf8').replace(/\r\n/g, '\n');
const psi = sql222.slice(sql222.indexOf('-- >>> GENERATED:portal_step_items'), sql222.indexOf('-- <<< GENERATED:portal_step_items'));
const t229 = readFileSync(WT + 'scripts/sql/229/test-229-tax-year.pglite.mjs', 'utf8');
const OFFICE = '11111111-1111-1111-1111-111111111111', OTHER = '22222222-2222-2222-2222-222222222222';
const setup = t229.slice(t229.indexOf('await db.exec(`') + 'await db.exec(`'.length, t229.indexOf('`);\nawait db.exec(psi);'))
  .replaceAll('${OFFICE}', OFFICE).replaceAll('${OTHER}', OTHER);
const announce = t229.slice(t229.indexOf('await db.exec(`create function public._client_announceable_steps') + 'await db.exec(`'.length, t229.indexOf('$f$;`);') + '$f$;'.length);
const codeItems = JSON.parse(readFileSync(process.argv[2], 'utf8'));

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${info}` : ''}`); };
const q = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => (await q(s, p))[0];
const as = async (uid) => db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`);
const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).r;
const throws = async (s, p) => { try { await db.query(s, p); return null; } catch (e) { return e.message; } };
const throwsExec = async (s) => { try { await db.exec(s); return null; } catch (e) { return e.message; } };
const today = (await one(`select current_date::text d`)).d;

await db.exec(setup);
await db.exec(`create table public.documents (id text primary key, client_id text not null, file_name text);
  create table public.tax_fact_changes (id uuid primary key default gen_random_uuid(), client_id text not null, field_key text not null, source text not null, status text not null);`);
await db.exec(psi);
await db.exec(announce);
await db.exec(readFileSync(WT + 'scripts/sql/236/legacy-stubs.sql', 'utf8'));
// 236 נשען על ההזרקות של 230 — לפני 230 הוא חייב לעצור, לא להזריק חצי
await db.exec(sql229);
const early = await throwsExec(sql236);
ok(!!early && early.includes('230 לפני 236'), '236 לפני 230 — נעצר עם הסבר', early ?? 'לא נעצר');
ok(!(await one(`select to_regprocedure('public.ensure_tax_file_intake(text)') is not null x`)).x, 'אחרי העצירה — שום דבר מ-236 לא הוחל (התנאי נבדק לפני כל שינוי)');
await db.exec(sql230);
await db.exec(sql236);
await db.exec(sql236); // החלה חוזרת
console.log('הוחל: 222 + 229 + 230 + 236 (236 פעמיים)');

// ── 0. ההזרקות — פעם אחת בדיוק ──
const count = async (fn, mark) => (await one(`select (length(prosrc) - length(replace(prosrc, $2, ''))) / length($2) n from pg_proc where proname = $1`, [fn, mark])).n;
ok(await count('add_tax_info_asks', '236 · קליטה') === 1 && await count('portal_submit_tax_info', '236 · קליטה') === 1, 'ההזרקות של 236 — פעם אחת, גם אחרי החלה חוזרת');
const items = (await one(`select public._tax_year_items() m`)).m;
ok(JSON.stringify(Object.keys(items).sort()) === JSON.stringify(Object.keys(codeItems).sort()) && Object.entries(codeItems).every(([k, v]) => items[k] === v),
  `רשימת הפריטים בשרת = הקטלוג בקוד (${Object.keys(items).length})`, JSON.stringify(Object.keys(codeItems).filter(k => !(k in items))));

// ── 1. פתיחה: אחת ללקוח, אידמפוטנטית ──
await as(OFFICE);
await db.query(`insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status) values ($1, 'c1', 'intake_questionnaire', 'internal', 'person', 'waiting_client')`, [OFFICE]);
const i1 = await rpc('ensure_tax_file_intake', ['c1']);
const i1b = await rpc('ensure_tax_file_intake', ['c1']);
ok(i1.ok && i1.created && !i1b.created && i1b.stepId === i1.stepId, 'פתיחה; לחיצה כפולה → אותה קליטה', JSON.stringify([i1, i1b]));
const s1 = await one(`select step_type, payload, ball, status from public.onboarding_steps where id = $1`, [i1.stepId]);
ok(s1.step_type === 'tax_file_intake' && s1.payload.purpose === 'intake' && s1.payload.asOfDate === today && s1.payload.taxYear === Number(today.slice(0, 4))
  && s1.payload.title === 'קליטה והשלמת תיק המס' && s1.ball === 'me', 'payload: תכלית, יום הקליטה, שנה וכותרת; הכדור אצל המשרד', JSON.stringify(s1));
ok(!!s1.payload.legacyStepId, 'השאלון הישן הפתוח מקושר — כדי לא לשאול פעמיים');
const dup = await throws(`insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, payload) values ('${OFFICE}','c1','tax_file_intake','internal','person','in_progress','{}')`);
ok(!!dup && dup.includes('onboarding_steps_tax_file_intake_open_idx'), 'השרת חוסם קליטה פתוחה שנייה', dup);
await as(OTHER);
ok(!!(await throws(`select public.ensure_tax_file_intake('c1')`)), 'משרד אחר — אסור');
await as(OFFICE);

// ── 1ב. השאלון הישן מול הקליטה: המחולל לא יוצר שני, והמשרד מחליף במפורש ──
ok(await count('add_intake_questionnaire_step', '236 · קליטה פתוחה') === 1, 'ההזרקה במחולל — פעם אחת, גם אחרי החלה חוזרת');
const leg0 = await one(`select status from public.onboarding_steps where id = $1`, [s1.payload.legacyStepId]);
ok(leg0.status === 'waiting_client', 'פתיחת הקליטה לא נגעה בשאלון הישן (ההחלפה רק בבחירת המשרד)');
await as(OTHER);
ok(!!(await throws(`select public.replace_legacy_intake('${i1.stepId}')`)), 'משרד אחר — אסור להחליף');
await as(OFFICE);
// ‼ 6 · לשונית שכבר פתוחה: הלקוח פתח את השאלון הישן וענה לפני ההחלפה
await db.query(`update public.clients set intake_token = 'tok-c1' where id = 'c1'`);
const ptok = (await one(`select portal_token from public.clients where id = 'c1'`)).portal_token;
const md5 = async (fn) => (await one(`select md5(pg_get_functiondef($1::regprocedure)) m`, [fn])).m;
console.log('  (md5 בבידוד לפני ההזרקה ≠ ייצור בגלל הסימון; העוגן — אותה שורה)');
const st0 = (await one(`select * from public.start_intake('tok-c1')`));
ok(!!st0?.session_id, 'לפני ההחלפה: השאלון הישן נפתח (start_intake)', JSON.stringify(st0));
const sv0 = await rpc('save_intake_answer', ['tok-c1', st0.session_id, 'q1', JSON.stringify({ v: 1 }), JSON.stringify({ a: 1 }), 'q2', false]);
ok(sv0 === true, 'לפני ההחלפה: תשובה נשמרה');
ok((await rpc('intake_replaced_state', ['tok-c1'])).replaced === false, 'לפני ההחלפה: «לא הוחלף»');
const r1 = await rpc('replace_legacy_intake', [i1.stepId]);
const leg1 = await one(`select status, payload from public.onboarding_steps where id = $1`, [s1.payload.legacyStepId]);
const s1r = await one(`select payload from public.onboarding_steps where id = $1`, [i1.stepId]);
ok(r1.ok && r1.replaced && leg1.status === 'cancelled' && leg1.payload.replacedBy === i1.stepId
  && s1r.payload.legacyReplaced?.stepId === s1.payload.legacyStepId && s1r.payload.history.some(h => h.what === 'legacy_replaced'),
  'החלפה: השאלון הישן מבוטל עם «הוחלף בקליטה», והקליטה רושמת את זה בהיסטוריה', JSON.stringify([r1, leg1, s1r.payload.legacyReplaced]));
const r2 = await rpc('replace_legacy_intake', [i1.stepId]);
ok(r2.ok && r2.replaced === false, 'שוב — אין מה להחליף (אידמפוטנטי)', JSON.stringify(r2));
const g = await rpc('add_intake_questionnaire_step', ['c1']);
ok(g.skipped && g.skipped !== undefined, 'המחולל אחרי ההחלפה — לא יוצר שאלון ישן', JSON.stringify(g));
// ── 6 · אחרי ההחלפה: הקישור הישן מציג «הוחלף», והשרת חוסם כל כתיבה — גם מהלשונית שכבר פתוחה ──
const rs = await rpc('intake_replaced_state', ['tok-c1']);
ok(rs.ok && rs.replaced === true && !!ptok && rs.portalToken === ptok && !!rs.at, 'הקישור הישן: «הוחלף», עם הדרך לדף האישי', JSON.stringify(rs));
ok((await throws(`select * from public.start_intake('tok-c1')`))?.includes('intake_replaced'), 'start_intake נעצר בשרת (intake_replaced)');
const sv1 = await rpc('save_intake_answer', ['tok-c1', st0.session_id, 'q2', JSON.stringify({ v: 2 }), JSON.stringify({ a: 2 }), 'q3', false]);
ok(sv1 === false, 'שמירה מהלשונית שכבר פתוחה — נדחית בשרת');
ok((await rpc('reopen_intake', ['tok-c1'])) === false, '«משהו השתנה? עדכון פרטים» — נדחה בשרת');
const ans = await one(`select count(*)::int n, max(question_id) q from public.annual_report_answers where session_id = $1`, [st0.session_id]);
const sess = await one(`select model, current_question_id from public.annual_report_sessions where id = $1`, [st0.session_id]);
ok(ans.n === 1 && ans.q === 'q1' && sess.model.a === 1 && sess.current_question_id === 'q2', 'התשובות הקודמות וההיסטוריה נשמרו, בלי מילוי כפול', JSON.stringify([ans, sess]));
ok((await rpc('intake_replaced_state', ['no-such-token'])).ok === false, 'טוקן לא קיים — «לא תקין», בלי מידע');
await db.query(`update public.clients set portal_token_expires_at = now() - interval '1 day' where id = 'c1'`);
ok((await rpc('intake_replaced_state', ['tok-c1'])).portalToken == null, 'טוקן דף אישי שפג — לא נמסר');
await db.query(`update public.clients set portal_token_expires_at = null where id = 'c1'`);
const later = (await one(`insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, created_at) values ($1, 'c1', 'intake_questionnaire', 'internal', 'person', 'waiting_client', now() + interval '1 second') returning id`, [OFFICE])).id;
ok((await rpc('intake_replaced_state', ['tok-c1'])).replaced === false && !!(await one(`select * from public.start_intake('tok-c1')`))?.session_id, 'שאלון ישן חדש שהמשרד פתח אחר כך — עובד כרגיל');
await db.query(`delete from public.onboarding_steps where id = $1`, [later]);
ok(await count('start_intake', '236 · שאלון שהוחלף') === 1 && await count('save_intake_answer', '236 · שאלון שהוחלף') === 1 && await count('reopen_intake', '236 · שאלון שהוחלף') === 1, 'השומר בשלוש הפונקציות — פעם אחת, גם אחרי החלה חוזרת');
const g2 = await rpc('add_intake_questionnaire_step', ['c2']);
ok(g2.wouldCreate === true, 'לקוח בלי קליטה — המחולל ממשיך כרגיל', JSON.stringify(g2));

// ── 2. שאלות: פריט קליטה רק בקליטה ──
const P = (title, kind, extra = {}) => ({ title, why: 'למה', input: { kind, ...extra } });
const add = await rpc('add_tax_info_asks', [i1.stepId, JSON.stringify([
  { itemKey: 'intake.employed', subjectRole: 'client', prompt: P('עובד/ת כשכיר/ה?', 'yesno') },
  { itemKey: 'intake.employerDetails', subjectRole: 'client', entityKind: 'employer', entityRef: 'emp-new-client-intake', prompt: P('שם המעסיק', 'text') },
  { itemKey: 'intake.payslip', subjectRole: 'client', entityKind: 'employer', entityRef: 'emp-new-client-intake', prompt: P('תלוש', 'file', { docKind: 'payslipToDate' }) },
  { itemKey: 'intake.idCard', subjectRole: 'client', prompt: P('תעודת זהות', 'file', { docKind: 'idCard' }) },
  { itemKey: 'intake.family', subjectRole: 'couple', prompt: P('מצב משפחתי', 'choice', { options: [{ value: 'single', label: 'רווק/ה' }] }) },
])]);
ok(add.ok && add.added === 5, 'שאלות קליטה נוספו לבקשה', JSON.stringify(add));
const info = await one(`select payload, published_at from public.onboarding_steps where id = $1`, [add.infoStepId]);
ok(info.payload.title === 'השלמת פרטים לתיק המס' && info.payload.purpose === 'intake' && info.published_at === null, 'בקשת־הבת: «השלמת פרטים לתיק המס», טיוטה (לא נספרת ב«שלח בקשות»)', JSON.stringify(info));
const dupAsk = await rpc('add_tax_info_asks', [i1.stepId, JSON.stringify([{ itemKey: 'intake.employed', subjectRole: 'client', prompt: P('שוב', 'yesno') }])]);
ok(dupAsk.ok && dupAsk.added === 0 && dupAsk.skipped === 1, 'אותה שאלה פעמיים — לא נשאלת שוב');
ok((await rpc('add_tax_info_asks', [i1.stepId, JSON.stringify([{ itemKey: 'salary.worked', subjectRole: 'client', prompt: P('x', 'yesno') }])])).error === 'item_purpose_mismatch', 'פריט של שנת מס בתוך קליטה — נדחה');
ok((await rpc('add_tax_info_asks', [i1.stepId, JSON.stringify([{ itemKey: 'wealth.cash', subjectRole: 'couple', prompt: P('x', 'amount') }])])).error === 'item_purpose_mismatch', 'פריט הון בתוך קליטה — נדחה');
const an = await rpc('ensure_tax_year_request', ['c1', 'annual', 2025, null]);
ok((await rpc('add_tax_info_asks', [an.stepId, JSON.stringify([{ itemKey: 'intake.idCard', subjectRole: 'client', prompt: P('x', 'file', { docKind: 'idCard' }) }])])).error === 'item_purpose_mismatch', 'פריט קליטה בתוך דוח שנתי — נדחה');
const anAdd = await rpc('add_tax_info_asks', [an.stepId, JSON.stringify([{ itemKey: 'salary.employerDetails', subjectRole: 'client', entityKind: 'employer', entityRef: 'emp-new-client-2025', prompt: P('פרטי המעסיק החדש', 'text') }])]);
ok(anAdd.ok && anAdd.added === 1, 'הדוח השנתי לא נפגע: פריט חדש של שנת מס (מעסיק חדש) נוסף', JSON.stringify(anAdd));
ok((await one(`select payload->>'title' t from public.onboarding_steps where id = $1`, [anAdd.infoStepId])).t === 'השלמת מידע לשנת 2025', 'הדוח השנתי: הכותרת של בקשת־הבת לא השתנתה');
ok((await rpc('add_tax_info_asks', [i1.stepId, JSON.stringify([{ itemKey: 'intake.nope', subjectRole: 'client', prompt: P('x', 'yesno') }])])).error === 'unknown_item', 'פריט קליטה לא מוכר — נדחה');

// ── 3. הדף האישי: פרסום, תשובות «נכון ליום הקליטה», מסמך ו«אין לי עדיין» ──
const pub = await rpc('publish_tax_info', [add.infoStepId]);
ok(pub.ok && pub.published === 5, 'פרסום בדף האישי');
const v = await rpc('portal_tax_info', ['tok-c1', add.infoStepId]);
ok(v.ok && v.title === 'השלמת פרטים לתיק המס' && v.asks.length === 5, 'הלקוח רואה את השאלות עם הכותרת של הקליטה');
const ask = k => v.asks.find(a => a.itemKey === k).id;
ok((await rpc('portal_tax_info', ['tok-c2', add.infoStepId])).ok === false, 'לקוח אחר (טוקן אחר) — לא רואה');
ok((await rpc('portal_submit_tax_info', ['tok-c2', ask('intake.employed'), JSON.stringify({ kind: 'yes' })])).ok === false, 'לקוח אחר — לא יכול לענות');
await rpc('portal_submit_tax_info', ['tok-c1', ask('intake.employed'), JSON.stringify({ kind: 'yes' })]);
await rpc('portal_submit_tax_info', ['tok-c1', ask('intake.employerDetails'), JSON.stringify({ kind: 'text', text: 'אינטל, מ-2024, מהנדסת' })]);
await rpc('portal_submit_tax_info', ['tok-c1', ask('intake.family'), JSON.stringify({ kind: 'choice', value: 'single' })]);
const f = await one(`select period_kind, period_from, period_to::text pt, basis, tax_year, status, source, request_id from public.tax_year_facts where item_key = 'intake.employed'`);
ok(f.period_kind === 'as_of' && f.period_from === null && f.pt === today && f.basis === 'actual' && f.status === 'pending' && f.source === 'portal' && f.request_id === i1.stepId,
  'תשובה: «נכון ליום הקליטה», ממתינה לאישור, משויכת לבקשה', JSON.stringify(f));
ok((await one(`select entity_ref from public.tax_year_facts where item_key = 'intake.employerDetails'`)).entity_ref === 'emp-new-client-intake', 'פרטי המעסיק החדש — משויכים לישות הזמנית');
await rpc('portal_submit_tax_info', ['tok-c1', ask('intake.payslip'), JSON.stringify({ kind: 'file', fileName: 'תלוש.pdf', documentId: 'd-1' })]);
const ev = await one(`select doc_kind, entity_ref, tax_year, review, ask_id from public.tax_evidence where doc_kind = 'payslipToDate'`);
ok(ev.review === 'needs_review' && ev.entity_ref === 'emp-new-client-intake' && ev.tax_year === Number(today.slice(0, 4)) && ev.ask_id === ask('intake.payslip'), 'תלוש → ראיה ממתינה, על הישות הזמנית, עם השאלה', JSON.stringify(ev));
const un = await rpc('portal_submit_tax_info', ['tok-c1', ask('intake.idCard'), JSON.stringify({ kind: 'unavailable', reason: 'אחפש בבית' })]);
const ua = await one(`select state, unavailable from public.tax_info_asks where id = $1`, [ask('intake.idCard')]);
const plus30 = (await one(`select (current_date + 30)::text d`)).d;
ok(un.ok && ua.state === 'unavailable' && ua.unavailable.followUpOn === plus30, '«אין לי עדיין» לתעודת זהות — מעקב בעוד 30 יום', JSON.stringify(ua));
const st = await one(`select status, ball from public.onboarding_steps where id = $1`, [add.infoStepId]);
ok(st.status === 'in_progress' && st.ball === 'me', 'כשנענה הכול — חזרה למשרד (מסמך «אין עדיין» לא חוסם)', JSON.stringify(st));
const again = await rpc('portal_submit_tax_info', ['tok-c1', ask('intake.employed'), JSON.stringify({ kind: 'no' })]);
ok(again.ok && again.already, 'שליחה חוזרת לשאלה שנענתה — לא כותבת שוב');

// ── 4. הדף האישי: פריט בדף ──
const psi1 = (await one(`select public._portal_step_items(s, c, null::public.profiles, null::public.representation_requests, null) as r
  from public.onboarding_steps s, public.clients c where s.id = $1 and c.id = s.client_id`, [add.infoStepId])).r.items;
ok(psi1.length === 1 && psi1[0].bucket === 'office' && psi1[0].label === 'השלמת פרטים לתיק המס', 'בדף האישי: «מחכים למסמכים» עם הכותרת של הקליטה', JSON.stringify(psi1));
const parentItems = (await one(`select public._portal_step_items(s, c, null::public.profiles, null::public.representation_requests, null) as r
  from public.onboarding_steps s, public.clients c where s.id = $1 and c.id = s.client_id`, [i1.stepId])).r.items;
ok((parentItems ?? []).length === 0, 'הבקשה הראשית (עבודת המשרד) לא מוצגת ללקוח');

// ── 5. המשרד: אישור, תיקון, «החזר ללקוח», ראיה ──
const pend = (await q(`select id, item_key from public.tax_year_facts where status = 'pending' and request_id = $1`, [i1.stepId]));
ok(pend.length === 3, 'שלוש תשובות ממתינות (כן, פרטים, בחירה)', String(pend.length));
const dd = await rpc('decide_tax_year_facts', [pend.filter(x => x.item_key !== 'intake.employerDetails').map(x => x.id), 'accept', null]);
ok(dd.decided === 2, 'אישור מרוכז לרשימה מפורשת');
const detail = pend.find(x => x.item_key === 'intake.employerDetails');
await rpc('decide_tax_year_facts', [[detail.id], 'reject', 'הוחזר ללקוח: חסר ממתי']);
const back = await rpc('add_tax_info_asks', [i1.stepId, JSON.stringify([{ itemKey: 'intake.employerDetails', subjectRole: 'client', entityKind: 'employer', entityRef: 'emp-new-client-intake', prompt: { ...P('שם המעסיק', 'text'), correction: 'חסר ממתי' } }])]);
ok(back.ok && back.added === 1 && back.infoStepId === add.infoStepId, '«החזר ללקוח»: אותה שאלה נוספת שוב לאותה בקשת־בת, עם מה לתקן', JSON.stringify(back));
ok((await one(`select status, note from public.tax_year_facts where id = $1`, [detail.id])).status === 'rejected', 'התשובה הקודמת נשמרה כנדחית — היסטוריה');
const rv = await one(`select id from public.tax_evidence where doc_kind = 'payslipToDate'`);
ok((await rpc('review_tax_evidence', [rv.id, 'match', 'unchecked', 'accepted', null])).error === 'mismatch_cannot_accept', 'אי אפשר לאשר מסמך בלי «של מי» ו«לתקופה»');
ok((await rpc('review_tax_evidence', [rv.id, 'match', 'match', 'accepted', null])).ok, 'אישור מסמך אחרי שתי הבדיקות');
const rec = await rpc('record_tax_year_fact', ['c1', JSON.stringify({ taxYear: Number(today.slice(0, 4)), itemKey: 'intake.authorityAlignment', subjectRole: 'couple', periodKind: 'as_of', periodTo: today, answer: 'value', value: { done: true }, requestId: i1.stepId })]);
ok(rec.ok, 'המשרד מסמן «יישור קו בוצע» כעובדת משרד מאושרת');

// ── 6. סגירה וקליטה חדשה ──
await db.query(`update public.onboarding_steps set status = 'completed' where id = $1`, [i1.stepId]);
const i2 = await rpc('ensure_tax_file_intake', ['c1']);
ok(i2.ok && i2.created && i2.stepId !== i1.stepId, 'אחרי שהקליטה הושלמה — אפשר לפתוח קליטה חדשה (הישנה היסטוריה)');

// ── 7. סדר ההחלה: 229 מחדש מוחק את ההזרקות; 236 לבדו עוצר; 230 → 236 מחזיר ──
await db.exec(sql229);
ok(await count('add_tax_info_asks', '236 · קליטה') === 0, 'החלה חוזרת של 229 איפסה את ההזרקות (כצפוי)');
const e2 = await throwsExec(sql236);
ok(!!e2 && e2.includes('230'), '236 בלי 230 — נעצר ולא מזריק חצי', e2 ?? '');
await db.exec(sql230);
await db.exec(sql236);
ok(await count('add_tax_info_asks', '236 · קליטה') === 1 && await count('portal_submit_tax_info', '236 · קליטה') === 1 && Object.keys((await one(`select public._tax_year_items() m`)).m).length === Object.keys(codeItems).length,
  '229 → 230 → 236: הכול חזר, פעם אחת');

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
