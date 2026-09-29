#!/usr/bin/env node
/**
 * staging-test-smart-form-6101.mjs — מחזור החיים של הגשת 6101 מול המסד (206).
 *
 * מה נבדק: פתיחה אידמפוטנטית + שורה ב«בקשות», שמירה עם גרסה ישנה נדחית,
 * נעילה עם טביעה מהשרת, חתימה במשרד ומרחוק (טביעה שגויה/קישור חוזר נדחים),
 * קובץ חתום כראיה, גרסה חדשה מבטלת חתימות ושומרת את החתומה, הגשה ותוצאה
 * רק עם ראיה, מעקב כבקשה-בת, ובידוד בין משרדים (משתמש שני מורשה).
 *
 * ‼ רץ על לקוח סינתטי בלבד (id 'sf6101-…') ומוחק אחריו הכול, כולל המשתמש השני.
 *   node scripts/staging-test-smart-form-6101.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { loadEnv, writeStaging } from './staging-lib.mjs';

const env = loadEnv('.env.staging');
const opts = { auth: { autoRefreshToken: false, persistSession: false } };
const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, opts);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);

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
  else { fail++; console.log(`✗ ${name}${detail ? ' — ' + JSON.stringify(detail).slice(0, 300) : ''}`); }
};
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const rpc = async (db, fn, args) => {
  const { data, error } = await db.rpc(fn, args);
  return error ? { ok: false, error: error.message, pgError: true } : data;
};

const TAG = Date.now().toString(36);
const CLIENT = `sf6101-${TAG}`;
const OTHER_EMAIL = `sf6101-other-${TAG}@pivo.test`;
const OTHER_PASS = `Pw-${TAG}-x9!`;
const PNG = 'data:image/png;base64,' + 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='.repeat(4);

const office = await signIn(env.VITE_DEV_USER_EMAIL, env.VITE_DEV_USER_PASSWORD);
let otherId = null;

async function cleanup() {
  await writeStaging(`
    delete from public.smart_form_filings where client_id = ${q(CLIENT)};
    delete from public.documents where client_id = ${q(CLIENT)};
    delete from public.onboarding_steps where client_id = ${q(CLIENT)};
    delete from public.clients where id = ${q(CLIENT)};
    delete from public.authorized_users where email = ${q(OTHER_EMAIL)};`);
  if (otherId) await admin.auth.admin.deleteUser(otherId);
}

try {
  await writeStaging(`
    insert into public.clients (id, user_id, first_name, last_name, id_number, family_status, phone, email, city, address, lifecycle_stage,
                                spouse_first_name, spouse_last_name, spouse_id_number)
    values (${q(CLIENT)}, ${q(office.id)}, 'בדיקה', 'שש-אפס-אחת', '012345674', 'married', '0524491120', 'qa-6101@example.test',
            'חיפה', 'הנביאים 5', 'active', 'בת-זוג', 'שש-אפס-אחת', '003456787');`);

  // ── פתיחה אידמפוטנטית ──
  const s1 = await rpc(office.db, 'smart_form_start', { p_client_id: CLIENT, p_template_key: 'btl-6101', p_subject_role: 'client', p_purposes: ['start', 'spouse_in_business'] });
  ok('פתיחה: נוצרה הגשה', s1?.ok && s1.filingId && s1.existing === false, s1);
  const s2 = await rpc(office.db, 'smart_form_start', { p_client_id: CLIENT, p_template_key: 'btl-6101', p_subject_role: 'client', p_purposes: [] });
  ok('פתיחה שנייה: אותה הגשה (אידמפוטנטי)', s2?.ok && s2.existing === true && s2.filingId === s1.filingId, s2);
  const bad = await rpc(office.db, 'smart_form_start', { p_client_id: CLIENT, p_template_key: 'btl-9999', p_subject_role: 'client', p_purposes: [] });
  ok('תבנית לא רשומה נדחית', bad?.error === 'unknown_template', bad);
  const F = s1.filingId;

  const [step] = await writeStaging(`select step_type, ball, status, required_for_close, published_at is not null as published,
    payload->'smartForm'->>'state' as state, payload->'smartForm'->>'stateLabel' as label from public.onboarding_steps where id = ${q(s1.stepId)}`);
  ok('שורה ב«בקשות»: custom_request של המשרד, לא חלק מסגירת הקליטה', step?.step_type === 'custom_request' && step.ball === 'me'
    && step.required_for_close === false && step.published && step.state === 'draft', step);

  // ── שמירה ──
  const vals = { entered: { startDate: '2026-10-01', hoursBand: '20_plus', monthlyIncome: '9500', spouseFromDate: '2026-10-01', spouseSharePct: '25', spouseWeeklyHours: '12' }, confirmed: {} };
  const sv = await rpc(office.db, 'smart_form_save', { p_filing_id: F, p_revision: 1, p_purposes: ['start', 'spouse_in_business'], p_flags: {}, p_values: vals });
  ok('שמירת טיוטה', sv?.ok, sv);
  const stale = await rpc(office.db, 'smart_form_save', { p_filing_id: F, p_revision: 7, p_purposes: ['start'], p_flags: {}, p_values: vals });
  ok('שמירה עם גרסה ישנה נדחית', stale?.error === 'stale_revision', stale);
  const badPurpose = await rpc(office.db, 'smart_form_save', { p_filing_id: F, p_revision: 1, p_purposes: ['launch_rockets'], p_flags: {}, p_values: vals });
  ok('תרחיש לא מוכר נדחה', badPurpose?.error === 'bad_purpose', badPurpose);

  // ── נעילה ──
  const snap = { data: { idNumber: '012345674', startDate: '2026-10-01', monthlyIncome: '9500' }, blockers: [] };
  const withBlockers = await rpc(office.db, 'smart_form_lock', { p_filing_id: F, p_revision: 1, p_snapshot: { ...snap, blockers: ['x'] }, p_signers: [{ role: 'client', name: 'בדיקה' }] });
  ok('נעילה עם חוסמים נדחית', withBlockers?.error === 'has_blockers', withBlockers);
  const noSpouse = await rpc(office.db, 'smart_form_lock', { p_filing_id: F, p_revision: 1, p_snapshot: snap, p_signers: [{ role: 'client', name: 'בדיקה' }] });
  ok('בן/בת זוג בעסק ⇒ חתימת בן/בת הזוג חובה', noSpouse?.error === 'spouse_signer_required', noSpouse);
  const lk = await rpc(office.db, 'smart_form_lock', { p_filing_id: F, p_revision: 1, p_snapshot: snap,
    p_signers: [{ role: 'client', name: 'בדיקה שש-אפס-אחת', idNumber: '012345674' }, { role: 'spouse', name: 'בת-זוג שש-אפס-אחת', idNumber: '003456787' }] });
  ok('נעילה: טביעת תוכן מהשרת', lk?.ok && /^[0-9a-f]{64}$/.test(lk.contentSha256), lk);
  const H = lk.contentSha256;
  const afterLockSave = await rpc(office.db, 'smart_form_save', { p_filing_id: F, p_revision: 1, p_purposes: ['start'], p_flags: {}, p_values: vals });
  ok('אחרי נעילה אי אפשר לשמור על אותה גרסה', afterLockSave?.error === 'not_editable' || afterLockSave?.error === 'revision_locked', afterLockSave);

  // ── חתימה במשרד ──
  const wrongHash = await rpc(office.db, 'smart_form_capture_signature', { p_filing_id: F, p_revision: 1, p_role: 'client', p_png: PNG, p_content_sha256: '0'.repeat(64), p_attestation: 'נכח/ה' });
  ok('חתימה על תוכן אחר נדחית', wrongHash?.error === 'content_changed', wrongHash);
  const noAttest = await rpc(office.db, 'smart_form_capture_signature', { p_filing_id: F, p_revision: 1, p_role: 'client', p_png: PNG, p_content_sha256: H, p_attestation: '' });
  ok('חתימה במשרד בלי אישור נוכחות נדחית', noAttest?.error === 'attestation_required', noAttest);
  const cs = await rpc(office.db, 'smart_form_capture_signature', { p_filing_id: F, p_revision: 1, p_role: 'client', p_png: PNG, p_content_sha256: H, p_attestation: 'המבוטח/ת נכח/ה, עבר/ה על הטופס וחתם/ה בעצמו/ה' });
  ok('חתימת הלקוח במשרד', cs?.ok && cs.allSigned === false, cs);
  const [st1] = await writeStaging(`select ball, status, payload->'smartForm'->>'waitingOn' as w, payload->'smartForm'->>'stateLabel' as l from public.onboarding_steps where id = ${q(s1.stepId)}`);
  ok('«בקשות»: ממתין לבן/בת הזוג', st1?.w === 'spouse' && st1.ball === 'client' && st1.status === 'waiting_client', st1);

  // ── חתימה מרחוק ──
  const link = await rpc(office.db, 'smart_form_issue_sign_link', { p_filing_id: F, p_revision: 1, p_role: 'spouse', p_days: 7 });
  ok('קישור חתימה לבן/בת הזוג', link?.ok && link.token?.length === 64, link);
  const [tok] = await writeStaging(`select sign_tokens->'spouse' as t from public.smart_form_revisions where filing_id = ${q(F)} and revision = 1`);
  ok('במסד נשמרת טביעת הטוקן בלבד', tok?.t?.hash && !JSON.stringify(tok).includes(link.token), tok);
  const g = await rpc(anon, 'get_smart_form_signing', { p_token: link.token });
  ok('הדף הציבורי: פרטי החותם והתוכן', g?.ok && g.role === 'spouse' && g.contentSha256 === H && g.data?.startDate === '2026-10-01', g);
  const g404 = await rpc(anon, 'get_smart_form_signing', { p_token: 'f'.repeat(64) });
  ok('טוקן לא קיים נדחה', g404?.reason === 'not_found', g404);
  const noConsent = await rpc(anon, 'submit_smart_form_signature', { p_token: link.token, p_png: PNG, p_content_sha256: H, p_consent: false });
  ok('בלי הסכמה מפורשת — נדחה', noConsent?.reason === 'consent_required', noConsent);
  const tamper = await rpc(anon, 'submit_smart_form_signature', { p_token: link.token, p_png: PNG, p_content_sha256: '1'.repeat(64), p_consent: true });
  ok('טביעה שגויה מהדפדפן — נדחה', tamper?.reason === 'content_changed', tamper);
  const sub = await rpc(anon, 'submit_smart_form_signature', { p_token: link.token, p_png: PNG, p_content_sha256: H, p_consent: true });
  ok('חתימת בן/בת הזוג מרחוק ⇒ כל החתימות', sub?.ok && sub.allSigned === true, sub);
  const reuse = await rpc(anon, 'submit_smart_form_signature', { p_token: link.token, p_png: PNG, p_content_sha256: H, p_consent: true });
  ok('הקישור חד-פעמי', reuse?.reason === 'not_found', reuse);
  const anonStart = await rpc(anon, 'smart_form_start', { p_client_id: CLIENT, p_template_key: 'btl-6101', p_subject_role: 'client', p_purposes: [] });
  ok('anon אינו יכול לפתוח הגשה', anonStart?.pgError === true, anonStart);
  const { data: anonRows } = await anon.from('smart_form_filings').select('id').eq('id', F);
  ok('anon אינו קורא הגשות', !anonRows || anonRows.length === 0, anonRows);

  // ── קובץ חתום ──
  const notSubmittable = await rpc(office.db, 'smart_form_advance', { p_filing_id: F, p_action: 'record_submission', p_detail: { channel: 'branch', submittedAt: '2026-09-28' } });
  ok('אין הגשה בלי קובץ חתום שמור', notSubmittable?.error === 'not_ready', notSubmittable);
  const noDoc = await rpc(office.db, 'smart_form_attach_signed_pdf', { p_filing_id: F, p_revision: 1, p_document_id: 'nope', p_pdf_sha256: 'a'.repeat(64) });
  ok('קובץ שאינו של הלקוח נדחה', noDoc?.error === 'document_not_found', noDoc);
  const [lbl] = await writeStaging(`select id from public.document_labels where user_id = ${q(office.id)} limit 1`);
  const DOC1 = `sf6101-${TAG}-r1`;
  await writeStaging(`insert into public.documents (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, label_id)
    values (${q(DOC1)}, ${q(office.id)}, ${q(CLIENT)}, ${q(`${office.id}/${CLIENT}/${DOC1}`)}, '6101-signed.pdf', 'application/pdf', 1234, 'ni_document', ${q(lbl.id)})`);
  const att = await rpc(office.db, 'smart_form_attach_signed_pdf', { p_filing_id: F, p_revision: 1, p_document_id: DOC1, p_pdf_sha256: 'b'.repeat(64) });
  ok('הקובץ החתום נשמר כראיה', att?.ok, att);
  const [st2] = await writeStaging(`select payload->'smartForm'->>'stateLabel' as l from public.onboarding_steps where id = ${q(s1.stepId)}`);
  ok('«בקשות»: נחתם — מוכן להגשה', st2?.l === 'נחתם — מוכן להגשה', st2);

  // ── גרסה חדשה אחרי חתימה ──
  const noReason = await rpc(office.db, 'smart_form_new_revision', { p_filing_id: F, p_reason: '' });
  ok('גרסה חדשה דורשת סיבה', noReason?.error === 'reason_required', noReason);
  const nr = await rpc(office.db, 'smart_form_new_revision', { p_filing_id: F, p_reason: 'תיקון הכנסה חודשית' });
  ok('גרסה חדשה', nr?.ok && nr.revision === 2, nr);
  const revs = await writeStaging(`select revision, state, signed_document_id, signatures = '{}'::jsonb as nosig from public.smart_form_revisions where filing_id = ${q(F)} order by revision`);
  ok('הגרסה החתומה נשמרת כהיסטוריה; החדשה בלי חתימות', revs[0]?.state === 'signed' && revs[0].signed_document_id === DOC1 && revs[1]?.state === 'draft' && revs[1].nosig, revs);

  // ── שוב: נעילה, חתימות, קובץ ──
  await rpc(office.db, 'smart_form_save', { p_filing_id: F, p_revision: 2, p_purposes: ['start'], p_flags: {}, p_values: { entered: { ...vals.entered, monthlyIncome: '9800' } } });
  const lk2 = await rpc(office.db, 'smart_form_lock', { p_filing_id: F, p_revision: 2, p_snapshot: { data: { ...snap.data, monthlyIncome: '9800' }, blockers: [] }, p_signers: [{ role: 'client', name: 'בדיקה' }] });
  ok('גרסה 2: תוכן אחר ⇒ טביעה אחרת', lk2?.ok && lk2.contentSha256 !== H, lk2);
  const cs2 = await rpc(office.db, 'smart_form_capture_signature', { p_filing_id: F, p_revision: 2, p_role: 'client', p_png: PNG, p_content_sha256: lk2.contentSha256, p_attestation: 'נכח/ה וחתם/ה' });
  ok('רק הלקוח נדרש (בלי בן/בת זוג בעסק)', cs2?.ok && cs2.allSigned === true, cs2);
  const DOC2 = `sf6101-${TAG}-r2`;
  await writeStaging(`insert into public.documents (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, label_id)
    values (${q(DOC2)}, ${q(office.id)}, ${q(CLIENT)}, ${q(`${office.id}/${CLIENT}/${DOC2}`)}, '6101-signed-r2.pdf', 'application/pdf', 1234, 'ni_document', ${q(lbl.id)})`);
  await rpc(office.db, 'smart_form_attach_signed_pdf', { p_filing_id: F, p_revision: 2, p_document_id: DOC2, p_pdf_sha256: 'c'.repeat(64) });

  // ── אסמכתאות חובה ──
  await rpc(office.db, 'smart_form_set_attachments', { p_filing_id: F, p_attachments: [{ key: 'vat', label: 'אישור פתיחת תיק במע"מ', required: true }] });
  const needAttach = await rpc(office.db, 'smart_form_advance', { p_filing_id: F, p_action: 'record_submission', p_detail: { channel: 'branch', submittedAt: '2026-09-28' } });
  ok('אסמכתא חובה חסרה ⇒ אין הגשה', needAttach?.error === 'attachments_missing', needAttach);
  await rpc(office.db, 'smart_form_set_attachments', { p_filing_id: F, p_attachments: [{ key: 'vat', label: 'אישור פתיחת תיק במע"מ', required: true, documentId: DOC1 }] });

  // ── הגשה ע"י הלקוח באזור האישי ──
  const ho = await rpc(office.db, 'smart_form_advance', { p_filing_id: F, p_action: 'handoff_to_client', p_detail: { note: 'הלקוח יגיש באזור האישי' } });
  ok('העברה ללקוח להגשה באזור האישי', ho?.ok && ho.state === 'awaiting_client_submission', ho);
  const noEvidence = await rpc(office.db, 'smart_form_advance', { p_filing_id: F, p_action: 'record_submission', p_detail: { channel: 'client_personal_area', submittedAt: '2026-09-29' } });
  ok('«הלקוח הגיש» בלי ראיה — נדחה', noEvidence?.error === 'evidence_required', noEvidence);
  const recSub = await rpc(office.db, 'smart_form_advance', { p_filing_id: F, p_action: 'record_submission', p_detail: { channel: 'client_personal_area', submittedAt: '2026-09-29', reference: 'QA-REF-001' } });
  ok('הגשה נרשמה עם אסמכתא', recSub?.ok && recSub.state === 'submitted', recSub);
  const [st3] = await writeStaging(`select ball, payload->'smartForm'->>'stateLabel' as l from public.onboarding_steps where id = ${q(s1.stepId)}`);
  ok('«בקשות»: הכדור אצל הרשות', st3?.ball === 'authority', st3);
  const lateRev = await rpc(office.db, 'smart_form_new_revision', { p_filing_id: F, p_reason: 'x' });
  ok('אחרי הגשה אין גרסה חדשה', lateRev?.error === 'submitted_is_final', lateRev);

  // ── תשובה רשמית רק עם ראיה ──
  const noEv = await rpc(office.db, 'smart_form_advance', { p_filing_id: F, p_action: 'record_result', p_detail: { status: 'approved', summary: 'אושר' } });
  ok('תוצאה בלי ראיה — נדחית', noEv?.error === 'evidence_required', noEv);
  const res = await rpc(office.db, 'smart_form_advance', { p_filing_id: F, p_action: 'record_result', p_detail: { status: 'approved', summary: 'סווג כעצמאי מ-01/10/2026', reference: 'מכתב 12345' } });
  ok('תוצאה רשמית נרשמה', res?.ok && res.state === 'result_received', res);
  const cl = await rpc(office.db, 'smart_form_advance', { p_filing_id: F, p_action: 'close', p_detail: { followUp: 'reserve_duty_claim', followUpOwner: 'client', followUpTitle: 'תביעת תגמולי מילואים באזור האישי', followUpNote: 'לאחר האישור — להגיש באזור האישי' } });
  ok('סגירה + בקשת-המשך', cl?.ok && cl.state === 'closed' && cl.followUpStepId, cl);
  const [fu] = await writeStaging(`select ball, published_at is null as draft, payload->'requirements'->0->>'kind' as k from public.onboarding_steps where id = ${q(cl.followUpStepId)}`);
  ok('בקשת-ההמשך ללקוח: טיוטה (המשרד מפרסם) ונסגרת בראיה', fu?.ball === 'client' && fu.draft === true && fu.k === 'file', fu);
  const [st4] = await writeStaging(`select status from public.onboarding_steps where id = ${q(s1.stepId)}`);
  ok('«בקשות»: ההגשה הושלמה', st4?.status === 'completed', st4);
  const again = await rpc(office.db, 'smart_form_start', { p_client_id: CLIENT, p_template_key: 'btl-6101', p_subject_role: 'client', p_purposes: ['change'] });
  ok('אחרי סגירה — הגשה חדשה היא שורה חדשה', again?.ok && again.existing === false && again.filingId !== F, again);

  const events = await writeStaging(`select kind from public.smart_form_events where filing_id = ${q(F)} order by id`);
  const kinds = events.map(e => e.kind);
  ok('יומן ביקורת מלא', ['created', 'locked', 'signature_captured', 'sign_link_issued', 'sign_link_opened', 'all_signed', 'signed_pdf_stored', 'new_revision', 'record_submission', 'record_result', 'close'].every(k => kinds.includes(k)), kinds);
  const [noVals] = await writeStaging(`select count(*)::int as n from public.smart_form_events where filing_id = ${q(F)} and detail::text like '%9500%'`);
  ok('היומן אינו מכיל ערכים אישיים', noVals?.n === 0, noVals);

  // ── בידוד בין משרדים ──
  const { data: cu, error: cuErr } = await admin.auth.admin.createUser({ email: OTHER_EMAIL, password: OTHER_PASS, email_confirm: true });
  if (cuErr) throw new Error('createUser: ' + cuErr.message);
  otherId = cu.user.id;
  await writeStaging(`insert into public.authorized_users (email, role, active, note) values (${q(OTHER_EMAIL)}, 'owner', true, 'sf6101 isolation test — temporary')`);
  const other = await signIn(OTHER_EMAIL, OTHER_PASS);
  const { data: oRows } = await other.db.from('smart_form_filings').select('id').eq('client_id', CLIENT);
  ok('משרד אחר אינו רואה את ההגשות', (oRows ?? []).length === 0, oRows);
  const { data: oRevs } = await other.db.from('smart_form_revisions').select('id').eq('filing_id', again.filingId);
  ok('משרד אחר אינו רואה גרסאות/חתימות', (oRevs ?? []).length === 0, oRevs);
  const oStart = await rpc(other.db, 'smart_form_start', { p_client_id: CLIENT, p_template_key: 'btl-6101', p_subject_role: 'client', p_purposes: [] });
  ok('משרד אחר אינו פותח הגשה ללקוח שאינו שלו', oStart?.error === 'forbidden', oStart);
  const oSave = await rpc(other.db, 'smart_form_save', { p_filing_id: again.filingId, p_revision: 1, p_purposes: [], p_flags: {}, p_values: { entered: {} } });
  ok('משרד אחר אינו כותב להגשה', oSave?.error === 'forbidden', oSave);
  const oProfile = await rpc(other.db, 'smart_form_apply_profile_updates', { p_filing_id: again.filingId, p_updates: [{ key: 'zipCode', value: '1234567', expected: null }] });
  ok('משרד אחר אינו מעדכן את הכרטיס', oProfile?.error === 'forbidden', oProfile);

  // ── עדכון כרטיס מההגשה ──
  const pz = await rpc(office.db, 'smart_form_apply_profile_updates', { p_filing_id: again.filingId, p_updates: [{ key: 'zipCode', value: '3303412', expected: null }] });
  ok('עדכון מיקוד בכרטיס', pz?.ok && pz.client?.zip_code === '3303412' && pz.client?.field_meta?.zipCode?.via === 'btl-6101', pz?.error ?? pz?.client?.field_meta?.zipCode);
  const pzStale = await rpc(office.db, 'smart_form_apply_profile_updates', { p_filing_id: again.filingId, p_updates: [{ key: 'zipCode', value: '1111111', expected: null }] });
  ok('עדכון על ערך שהשתנה בינתיים — נדחה (לא דורסים בשקט)', pzStale?.error === 'stale', pzStale);
  const pzBad = await rpc(office.db, 'smart_form_apply_profile_updates', { p_filing_id: again.filingId, p_updates: [{ key: 'idNumber', value: '1', expected: null }] });
  ok('שדה שאינו ברשימה — נדחה', pzBad?.error === 'field_not_allowed', pzBad);

  {
  // ── כללים שמרניים בנעילה: אישור מקצועי והאסמכתאות שנקבעו ──
  const G = again.filingId;
  const svG = await rpc(office.db, 'smart_form_save', { p_filing_id: G, p_revision: 1, p_purposes: ['start', 'end'], p_flags: {}, p_values: { entered: {} } });
  ok('שמירה: התחלה והפסקה באותו טופס', svG?.ok, svG);
  const req = [{ key: 'retro_start', label: 'אסמכתאות לתחילת עיסוק למפרע', required: true }, { key: 'salary_slip', label: 'תלוש שכר', required: false }];
  const snapG = { data: { idNumber: '012345674', startDate: '2025-02-01', endDate: '2026-08-31' }, blockers: [], requiredAttachments: req };
  const signersG = [{ role: 'client', name: 'בדיקה שש-אפס-אחת', idNumber: '012345674' }];
  const noReasonG = await rpc(office.db, 'smart_form_lock', { p_filing_id: G, p_revision: 1, p_snapshot: { ...snapG, professional: { startAndEnd: { reason: '  ' } } }, p_signers: signersG });
  ok('התחלה+הפסקה בלי סיבה ⇒ השרת חוסם את הנעילה', noReasonG?.error === 'professional_confirmation_required', noReasonG);
  const badReq = await rpc(office.db, 'smart_form_lock', { p_filing_id: G, p_revision: 1,
    p_snapshot: { ...snapG, professional: { startAndEnd: { reason: 'בדיקה' } }, requiredAttachments: [{ key: 'x', label: 'y', required: 'yes' }] }, p_signers: signersG });
  ok('אסמכתא בלי required בוליאני ⇒ צילום לא תקין', badReq?.error === 'invalid_snapshot', badReq);
  const lkG = await rpc(office.db, 'smart_form_lock', { p_filing_id: G, p_revision: 1,
    p_snapshot: { ...snapG, professional: { startAndEnd: { reason: 'עבודה עונתית שהתחילה והסתיימה' } } }, p_signers: signersG });
  ok('עם סיבה ⇒ ננעל', lkG?.ok, lkG);
  const [fG] = await writeStaging(`select attachments from public.smart_form_filings where id = ${q(G)}`);
  const att = fG?.attachments ?? [];
  const retro = att.find(a => a.key === 'retro_start');
  ok('האסמכתאות נרשמו על ההגשה בנעילה — חובה ננעלה, מומלצת לא', retro?.required === true && retro?.lockedRequirement === true
    && att.find(a => a.key === 'salary_slip')?.lockedRequirement === false, att);
  const [ev] = await writeStaging(`select detail from public.smart_form_events where filing_id = ${q(G)} and kind = 'locked' order by id desc limit 1`);
  ok('היומן רושם את הסיבה המקצועית ואת האסמכתאות שנדרשו', ev?.detail?.professionalStartAndEnd === 'עבודה עונתית שהתחילה והסתיימה'
    && JSON.stringify(ev?.detail?.requiredAttachments) === '["retro_start"]', ev?.detail);
  const drop = await rpc(office.db, 'smart_form_set_attachments', { p_filing_id: G, p_attachments: [{ key: 'salary_slip', label: 'תלוש שכר', required: false }] });
  ok('אסמכתא שננעלה כחובה אינה יורדת', drop?.error === 'required_attachment_locked', drop);
  const downgrade = await rpc(office.db, 'smart_form_set_attachments', { p_filing_id: G, p_attachments: [{ key: 'retro_start', label: 'אסמכתאות', required: false }] });
  const [fG2] = await writeStaging(`select attachments from public.smart_form_filings where id = ${q(G)}`);
  ok('ניסיון להפוך אותה לרשות — השרת משאיר אותה חובה', downgrade?.ok && fG2?.attachments?.[0]?.required === true && fG2?.attachments?.[0]?.lockedRequirement === true, fG2?.attachments);
  const nullAtt = await rpc(office.db, 'smart_form_set_attachments', { p_filing_id: G, p_attachments: null });
  ok('רשימת אסמכתאות ריקה (null) נדחית ולא מוחקת', nullAtt?.error === 'invalid', nullAtt);

  // ── (209) מיפוי: חותמים רק על מה שמוצג ──
  const mapOf = async (rev) => (await writeStaging(`select mapping_version from public.smart_form_revisions where filing_id = ${q(G)} and revision = ${rev}`))[0]?.mapping_version;
  ok('209: הנעילה רושמת את המיפוי הנוכחי (2)', await mapOf(1) === 2);
  const linkG = await rpc(office.db, 'smart_form_issue_sign_link', { p_filing_id: G, p_revision: 1, p_role: 'client', p_days: 7 });
  ok('209: קישור חתימה נוצר על גרסה במיפוי הנוכחי', linkG?.ok && linkG.token, linkG);
  // הדמיה: גרסה שננעלה לפני 209 (מיפוי 1) — מצוירת אחרת ממה שהקוד מציג היום
  await writeStaging(`update public.smart_form_revisions set mapping_version = 1 where filing_id = ${q(G)} and revision = 1`);
  const capOld = await rpc(office.db, 'smart_form_capture_signature', { p_filing_id: G, p_revision: 1, p_role: 'client', p_png: PNG, p_content_sha256: lkG.contentSha256, p_attestation: 'נכח/ה וחתם/ה' });
  ok('209: חתימה במשרד על גרסה ממיפוי 1 נחסמת', capOld?.error === 'mapping_outdated', capOld);
  const linkOld = await rpc(office.db, 'smart_form_issue_sign_link', { p_filing_id: G, p_revision: 1, p_role: 'client', p_days: 7 });
  ok('209: קישור חתימה חדש על גרסה ממיפוי 1 נחסם', linkOld?.error === 'mapping_outdated', linkOld);
  const subOld = await rpc(anon, 'submit_smart_form_signature', { p_token: linkG.token, p_png: PNG, p_content_sha256: lkG.contentSha256, p_consent: true });
  ok('209: קישור שנשלח לפני כן — חתימה דרכו נחסמת', subOld?.reason === 'mapping_outdated', subOld);
  const nrG = await rpc(office.db, 'smart_form_new_revision', { p_filing_id: G, p_reason: 'עדכון מיקום השדות בטופס (מיפוי 2)' });
  ok('209: גרסה חדשה נפתחת', nrG?.ok, nrG);
  ok('209: הגרסה החדשה במיפוי הנוכחי (לא מועתקת מהקודמת)', await mapOf(2) === 2);
  const lockOldScreen = await rpc(office.db, 'smart_form_lock', { p_filing_id: G, p_revision: 2,
    p_snapshot: { ...snapG, template: { mappingVersion: 1 }, professional: { startAndEnd: { reason: 'עבודה עונתית' } } }, p_signers: signersG });
  ok('209: נעילה ממסך שמציג מיפוי אחר (דפדפן שלא התרענן) נדחית', lockOldScreen?.error === 'mapping_outdated' && lockOldScreen.mappingVersion === 2, lockOldScreen);
  const lockNow = await rpc(office.db, 'smart_form_lock', { p_filing_id: G, p_revision: 2,
    p_snapshot: { ...snapG, template: { mappingVersion: 2 }, professional: { startAndEnd: { reason: 'עבודה עונתית' } } }, p_signers: signersG });
  ok('209: נעילה במיפוי הנוכחי עוברת ונרשמת במיפוי 2', lockNow?.ok && await mapOf(2) === 2, lockNow);
  // קובץ חתום של גרסה ממיפוי אחר (למשל: נחתם בקישור, ואחר כך עלתה גרסה שהזיזה שדות) — לא נשמר
  const csNow = await rpc(office.db, 'smart_form_capture_signature', { p_filing_id: G, p_revision: 2, p_role: 'client', p_png: PNG, p_content_sha256: lockNow.contentSha256, p_attestation: 'נכח/ה וחתם/ה' });
  ok('209: חתימה על גרסה במיפוי הנוכחי', csNow?.ok, csNow);
  await writeStaging(`update public.smart_form_revisions set mapping_version = 1 where filing_id = ${q(G)} and revision = 2`);
  const attOld = await rpc(office.db, 'smart_form_attach_signed_pdf', { p_filing_id: G, p_revision: 2, p_document_id: 'no-such-doc', p_pdf_sha256: 'a'.repeat(64) });
  ok('209: שמירת קובץ חתום של גרסה ממיפוי אחר נחסמת', attOld?.error === 'mapping_outdated', attOld);
  await writeStaging(`update public.smart_form_revisions set mapping_version = 2 where filing_id = ${q(G)} and revision = 2`);
  const attNow = await rpc(office.db, 'smart_form_attach_signed_pdf', { p_filing_id: G, p_revision: 2, p_document_id: 'no-such-doc', p_pdf_sha256: 'a'.repeat(64) });
  ok('209: במיפוי הנוכחי השמירה עוברת את הבדיקה (ונעצרת רק כי אין מסמך כזה)', attNow?.error === 'document_not_found', attNow);
  }
} catch (e) {
  fail++;
  console.error('✗ חריגה:', e.message);
} finally {
  await cleanup();
}

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
