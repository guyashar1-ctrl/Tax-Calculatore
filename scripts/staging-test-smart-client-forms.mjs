#!/usr/bin/env node
/**
 * staging-test-smart-client-forms.mjs — טפסים שהלקוח ממלא וחותם בדף (247) מול staging.
 *
 * מה נבדק: פתיחה מ«בקשות» (אידמפוטנטי, נשוי בלבד ל-4440, יחיד בלבד ל-821), שורה ב«בקשות» עם הכדור
 * אצל הלקוח, הפריט בדף האישי, שער הפרסום, «מה בכרטיס» מהשרת, תשובה שיש לה בית בכרטיס ⇒ נכתבת
 * לכרטיס עם field_meta ו-tax_fact_changes, תשובה בלי בית ⇒ על ההגשה, זהות שבכרטיס לא משתנה מהדף,
 * עברית בכתובת, חובה חסרה חוסמת הכנה, טביעה בשרת, חתימה על תוכן אחר נדחית, תשובה אחרי הכנה
 * מחזירה לטיוטה, חתימה ⇒ «נחתם» + הודעה לרו"ח, אחרי חתימה אין שינוי, מילוי במשרד, עסק וחשבון בנק
 * נוצרים בכרטיס (821), טוקן של לקוח אחר לא נכנס, וביטול.
 *
 * ‼ לקוחות סינתטיים בלבד (id 'scf-…'), נמחקים בסוף — כולל כל טבלה שמפנה אליהם.
 *   node scripts/staging-test-smart-client-forms.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { loadEnv, writeStaging } from './staging-lib.mjs';

const env = loadEnv('.env.staging');
const opts = { auth: { autoRefreshToken: false, persistSession: false } };
const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, opts);

async function signIn(email, password) {
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, opts);
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error || !data?.session) throw new Error(`signIn ${email}: ${error?.message}`);
  return { id: data.session.user.id, db: createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { ...opts, global: { headers: { Authorization: `Bearer ${data.session.access_token}` } } }) };
}

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`✓ ${name}`); }
  else { fail++; console.log(`✗ ${name}${detail ? ' — ' + JSON.stringify(detail).slice(0, 400) : ''}`); }
};
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const rpc = async (db, fn, args) => { const { data, error } = await db.rpc(fn, args); return error ? { ok: false, error: error.message, pgError: true } : data; };

const TAG = Date.now().toString(36);
const C1 = `scf-${TAG}-a`;   // נשוי, בלי כתובת ובלי ת.ז. בן/בת הזוג — 4440
const C2 = `scf-${TAG}-b`;   // רווק — 4440 נחסם; 821 בלי עסק ובלי בנק
const C3 = `scf-${TAG}-c`;   // חברה — 821 נחסם
const TOK1 = `scftok${TAG}a${'0'.repeat(24)}`, TOK2 = `scftok${TAG}b${'0'.repeat(24)}`;
const PNG = 'data:image/png;base64,' + 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='.repeat(4);
const office = await signIn(env.VITE_DEV_USER_EMAIL, env.VITE_DEV_USER_PASSWORD);
const ids = [C1, C2, C3].map(q).join(',');

async function cleanup() {
  await writeStaging(`
    delete from public.accountant_notifications where client_id in (${ids});
    delete from public.tax_fact_changes where client_id in (${ids});
    delete from public.email_messages where client_id in (${ids});
    delete from public.client_notices where client_id in (${ids});
    delete from public.onboarding_events where step_id in (select id from public.onboarding_steps where client_id in (${ids}));
    delete from public.smart_form_filings where client_id in (${ids});
    delete from public.documents where client_id in (${ids});
    delete from public.onboarding_steps where client_id in (${ids});
    delete from public.engagements where client_id in (${ids});
    delete from public.clients where id in (${ids});`);
}

try {
  await writeStaging(`
    insert into public.clients (id, user_id, first_name, last_name, id_number, gender, family_status, phone, email, city, address, lifecycle_stage,
                                spouse_first_name, spouse_last_name, spouse_id_number, portal_token, type)
    values
     (${q(C1)}, ${q(office.id)}, 'דוד', 'בדיקת-תצהיר', '012345674', 'male', 'married', '0524491120', 'delivered@resend.dev', null, null, 'active',
      'רות', 'בדיקת-תצהיר', null, ${q(TOK1)}, 'individual'),
     (${q(C2)}, ${q(office.id)}, 'נועה', 'בדיקת-עוסק', '000000018', 'female', 'single', '0501234567', 'delivered@resend.dev', 'חיפה', 'הרצל 12', 'active',
      null, null, null, ${q(TOK2)}, 'individual'),
     (${q(C3)}, ${q(office.id)}, 'חברה', 'בדיקה', '000000026', null, 'single', null, null, null, null, 'active', null, null, null, null, 'company');`);

  // ── פתיחה ──
  const s1 = await rpc(office.db, 'smart_form_client_start', { p_client_id: C1, p_template_key: 'ita-4440', p_published: true });
  ok('4440: נפתחה בקשה', s1?.ok && s1.filingId && s1.stepId && s1.existing === false, s1);
  const s1b = await rpc(office.db, 'smart_form_client_start', { p_client_id: C1, p_template_key: 'ita-4440', p_published: true });
  ok('4440: פתיחה שנייה מחזירה את הקיימת', s1b?.ok && s1b.existing === true && s1b.filingId === s1.filingId, s1b);
  const notMarried = await rpc(office.db, 'smart_form_client_start', { p_client_id: C2, p_template_key: 'ita-4440', p_published: true });
  ok('4440: לא נשוי ⇒ נחסם', notMarried?.error === 'not_married', notMarried);
  const company = await rpc(office.db, 'smart_form_client_start', { p_client_id: C3, p_template_key: 'vat-821', p_published: true });
  ok('821: חברה ⇒ נחסם', company?.error === 'individual_only', company);
  const via6101 = await rpc(office.db, 'smart_form_start', { p_client_id: C1, p_template_key: 'ita-4440', p_subject_role: 'client', p_purposes: [] });
  ok('נתיב 6101 לא פותח טופס לקוח', via6101?.error === 'use_client_start', via6101);
  const anonStart = await rpc(anon, 'smart_form_client_start', { p_client_id: C1, p_template_key: 'ita-4440', p_published: true });
  ok('anon לא פותח בקשה', anonStart?.ok !== true, anonStart);
  const F1 = s1.filingId, S1 = s1.stepId;

  const [st] = await writeStaging(`select step_type, ball, status, published_at is not null pub, payload->'smartForm' sf, payload ? 'messageOnly' mo from public.onboarding_steps where id = ${q(S1)}`);
  ok('«בקשות»: custom_request, הכדור אצל הלקוח, «ממתין ללקוח»', st?.step_type === 'custom_request' && st.ball === 'client' && st.status === 'waiting_client'
    && st.sf?.clientFill === true && /ממתין ללקוח/.test(st.sf?.stateLabel ?? '') && !st.mo && st.pub, st);

  // ── הדף האישי ──
  const portal = await rpc(anon, 'get_client_portal', { p_token: TOK1 });
  const item = (portal?.items ?? []).find(i => i.kind === 'smart_form');
  ok('הדף האישי: פריט «למילוי וחתימה» תחת «מה צריך ממך»', item?.bucket === 'action' && item.actionValue === S1 && item.cta === 'למילוי וחתימה', portal?.items);
  const g = await rpc(anon, 'portal_smart_form_get', { p_token: TOK1, p_step_id: S1 });
  ok('הדף: «מה בכרטיס» מהשרת (שם, ת.ז., בן/בת הזוג)', g?.ok && g.card?.idNumber === '012345674' && g.card?.spouseFirstName === 'רות' && !g.card?.homeStreet, g);
  const otherTok = await rpc(anon, 'portal_smart_form_get', { p_token: TOK2, p_step_id: S1 });
  ok('טוקן של לקוח אחר לא פותח את הבקשה', otherTok?.ok === false && otherTok.error === 'step_not_found', otherTok);

  // ── שמירה: כרטיס / הגשה / הגנות ──
  const idChange = await rpc(anon, 'portal_smart_form_save', { p_token: TOK1, p_step_id: S1, p_values: { idNumber: '000000018' } });
  ok('זהות שכבר בכרטיס לא משתנה מהדף', idChange?.error === 'identity_in_card', idChange);
  const latin = await rpc(anon, 'portal_smart_form_save', { p_token: TOK1, p_step_id: S1, p_values: { homeStreet: 'Herzl' } });
  ok('כתובת לועזית נדחית', latin?.error === 'hebrew_only', latin);
  const foreign = await rpc(anon, 'portal_smart_form_save', { p_token: TOK1, p_step_id: S1, p_values: { bankAccount: '123' } });
  ok('מפתח שלא שייך לטופס נדחה', foreign?.error === 'field_not_allowed', foreign);
  const early = await rpc(anon, 'portal_smart_form_prepare', { p_token: TOK1, p_step_id: S1 });
  ok('הכנה לחתימה עם חובה חסרה נחסמת', early?.error === 'missing' && early.missing?.includes('separationDate') && early.missing?.includes('spouseIdNumber'), early);

  const sv = await rpc(anon, 'portal_smart_form_save', { p_token: TOK1, p_step_id: S1, p_values: {
    homeStreet: 'הנביאים', homeHouse: '5', homeCity: 'חיפה', homeZip: '3303912', spouseIdNumber: '003456787',
    marriageDate: '2012-05-20', separationDate: '2025-02-01', spouseAddress: 'הגפן 3, עכו', incSalary: '1', incomeYear: '2025' } });
  ok('שמירה מהדף', sv?.ok && sv.saved?.cardChanged?.length >= 4, sv);
  const [c1] = await writeStaging(`select address, city, zip_code, spouse_id_number, marriage_year, field_meta->'address' fa, field_meta->'spouseIdNumber' fs from public.clients where id = ${q(C1)}`);
  ok('כרטיס: כתובת, יישוב, מיקוד, ת.ז. בן/בת הזוג ושנת הנישואין נשמרו', c1?.address === 'הנביאים 5' && c1.city === 'חיפה' && c1.zip_code === '3303912'
    && c1.spouse_id_number === '003456787' && c1.marriage_year === 2012, c1);
  ok('כרטיס: field_meta מציין את הטופס ואת הלקוח', c1?.fa?.via === 'ita-4440' && c1.fa.by === 'client' && c1.fs?.via === 'ita-4440', c1);
  const [h] = await writeStaging(`select count(*)::int n, max(source) src, max(new_value->'values'->>'address') a from public.tax_fact_changes where client_id = ${q(C1)} and field_key = 'smartForm:ita-4440'`);
  ok('היסטוריה: שורת tax_fact_changes עם לפני/אחרי', h?.n === 1 && h.src === 'prerequisite' && h.a === 'הנביאים 5', h);
  const [rv] = await writeStaging(`select values->'answers' a from public.smart_form_revisions where filing_id = ${q(F1)}`);
  ok('הגשה: רק תשובות בלי בית בכרטיס', rv?.a?.separationDate === '2025-02-01' && rv.a.spouseAddress === 'הגפן 3, עכו' && !('homeStreet' in rv.a) && !('spouseIdNumber' in rv.a), rv);

  // ── הכנה, טביעה, חתימה ──
  const p1 = await rpc(anon, 'portal_smart_form_prepare', { p_token: TOK1, p_step_id: S1 });
  ok('הכנה: נעול עם טביעה מהשרת והצילום כולל את הכרטיס והתשובות', p1?.ok && p1.revisionState === 'locked' && /^[0-9a-f]{64}$/.test(p1.contentSha256)
    && p1.data?.homeStreet === 'הנביאים' && p1.data?.separationDate === '2025-02-01' && /^\d{4}-\d{2}-\d{2}$/.test(p1.data?.signDate ?? ''), p1);
  const [st2] = await writeStaging(`select ball, status, payload->'smartForm'->>'stateLabel' l from public.onboarding_steps where id = ${q(S1)}`);
  ok('«בקשות»: ממתין לחתימת הלקוח', st2?.l === 'ממתין לחתימת הלקוח' && st2.ball === 'client', st2);
  const wrong = await rpc(anon, 'portal_smart_form_sign', { p_token: TOK1, p_step_id: S1, p_png: PNG, p_content_sha256: '0'.repeat(64), p_consent: true });
  ok('חתימה על תוכן אחר נדחית', wrong?.error === 'content_changed', wrong);
  const noConsent = await rpc(anon, 'portal_smart_form_sign', { p_token: TOK1, p_step_id: S1, p_png: PNG, p_content_sha256: p1.contentSha256, p_consent: false });
  ok('חתימה בלי אישור ההצהרה נדחית', noConsent?.error === 'consent_required', noConsent);

  // תשובה אחרי ההכנה ⇒ חוזרים לטיוטה, והטביעה הישנה כבר לא תקפה
  const edit = await rpc(anon, 'portal_smart_form_save', { p_token: TOK1, p_step_id: S1, p_values: { spIncSalary: '1' } });
  ok('תיקון אחרי הכנה: חזרה לטיוטה', edit?.ok && edit.revisionState === 'draft' && edit.saved?.unlocked === true, edit);
  const oldHash = await rpc(anon, 'portal_smart_form_sign', { p_token: TOK1, p_step_id: S1, p_png: PNG, p_content_sha256: p1.contentSha256, p_consent: true });
  ok('חתימה על הטביעה הישנה נדחית', oldHash?.ok === false, oldHash);
  const p2 = await rpc(anon, 'portal_smart_form_prepare', { p_token: TOK1, p_step_id: S1 });
  ok('הכנה מחדש: טביעה חדשה', p2?.ok && p2.contentSha256 && p2.contentSha256 !== p1.contentSha256, p2);
  const sg = await rpc(anon, 'portal_smart_form_sign', { p_token: TOK1, p_step_id: S1, p_png: PNG, p_content_sha256: p2.contentSha256, p_consent: true });
  ok('חתימה', sg?.ok && sg.allSigned === true, sg);
  const [st3] = await writeStaging(`select f.state, s.ball, s.status, s.payload->'smartForm'->>'stateLabel' l,
    (select count(*)::int from public.accountant_notifications n where n.client_id = ${q(C1)} and n.kind = 'client_request_completed') notes
    from public.smart_form_filings f join public.onboarding_steps s on s.id = f.step_id where f.id = ${q(F1)}`);
  ok('אחרי חתימה: «נחתם», הכדור אצל המשרד, הודעה לרו"ח', st3?.state === 'signed' && st3.ball === 'me' && /נחתם/.test(st3.l) && st3.notes >= 1, st3);
  const again = await rpc(anon, 'portal_smart_form_sign', { p_token: TOK1, p_step_id: S1, p_png: PNG, p_content_sha256: p2.contentSha256, p_consent: true });
  ok('חתימה כפולה — כבר נחתם, בלי שינוי', again?.ok && again.alreadySigned === true, again);
  const after = await rpc(anon, 'portal_smart_form_save', { p_token: TOK1, p_step_id: S1, p_values: { spouseAddress: 'אחרת' } });
  ok('אחרי חתימה אין שינוי מהדף', after?.ok === false && ['already_signed', 'not_editable'].includes(after.error), after);
  const portal2 = await rpc(anon, 'get_client_portal', { p_token: TOK1 });
  const item2 = (portal2?.items ?? []).find(i => i.key === `sform_${S1}`);
  ok('הדף האישי: «נחתם · המשרד מגיש למס הכנסה» תחת המשרד', item2?.bucket === 'office' && /נחתם · המשרד מגיש למס הכנסה/.test(item2.sub ?? ''), item2);
  const view = await rpc(office.db, 'smart_form_client_view', { p_filing_id: F1 });
  ok('המשרד: תצוגה עם החתימה והצילום', view?.ok && view.revisionState === 'signed' && view.signatures?.client?.startsWith('data:image/png') && view.data?.signDate, view?.error);
  const anonView = await rpc(anon, 'smart_form_client_view', { p_filing_id: F1 });
  ok('anon לא רואה את תצוגת המשרד', anonView?.ok !== true, anonView);

  // ── 821: עסק ובנק נוצרים בכרטיס; מילוי במשרד ──
  const s2 = await rpc(office.db, 'smart_form_client_start', { p_client_id: C2, p_template_key: 'vat-821', p_published: false });
  ok('821: נפתחה כטיוטה (לא מפורסם)', s2?.ok, s2);
  const S2 = s2.stepId, F2 = s2.filingId;
  const hidden = await rpc(anon, 'portal_smart_form_get', { p_token: TOK2, p_step_id: S2 });
  ok('טיוטה לא נפתחת ללקוח', hidden?.error === 'not_published', hidden);
  const portalHidden = await rpc(anon, 'get_client_portal', { p_token: TOK2 });
  ok('טיוטה לא מופיעה בדף', !(portalHidden?.items ?? []).some(i => i.key === `sform_${S2}`), portalHidden?.items);
  const fill = await rpc(office.db, 'smart_form_client_fill', { p_filing_id: F2, p_values: { businessName: 'נועה עיצובים', bankCode: '12', bankName: 'בנק הפועלים', bankBranch: '600', bankAccount: '123456' } });
  ok('מילוי במשרד', fill?.ok, fill);
  const pub = await rpc(office.db, 'publish_case_changes', { p_client_id: C2 });
  ok('פרסום הבקשה', pub?.ok !== false, pub);
  const s2save = await rpc(anon, 'portal_smart_form_save', { p_token: TOK2, p_step_id: S2, p_values: {
    activity: 'עיצוב גרפי', industry: 'M', bizAtHome: 'yes', bizStreet: 'הרצל', bizHouse: '12', bizCity: 'חיפה', openDate: '2026-11-15', employees: '1', turnover: '120000', dealerKind: 'exempt',
    propExists: 'yes', propKind: 'other', propKindOther: 'דירת מגורים', propTenure: 'owned', propParty: 'נועה בדיקת-עוסק', mailSame: 'yes' } });
  ok('821: שמירה מהדף', s2save?.ok, s2save);
  const [c2] = await writeStaging(`select business_name, business_description, businesses, bank_accounts, dealer_type, field_meta->'businesses'->>'by' bby, field_meta->'bankAccounts'->>'by' kby from public.clients where id = ${q(C2)}`);
  const biz = (c2?.businesses ?? [])[0] ?? {};
  ok('כרטיס: עסק נוצר עם תיאור, כתובת, ענף, תאריך פתיחה מלא ושנה', c2?.business_name === 'נועה עיצובים' && biz.description === 'עיצוב גרפי' && biz.address?.street === 'הרצל'
    && biz.startYear === 2026 && biz.startDate === '2026-11-15' && biz.industry === 'M' && c2.business_description === 'עיצוב גרפי' && c2.bby === 'client', c2);
  ok('251: סוג העוסק לפי המחזור — עוסק פטור בעסק שהטופס יצר, ו-dealer_type הושלם', biz.kind === 'osek_patur' && c2?.dealer_type === 'exempt', { kind: biz.kind, dt: c2?.dealer_type });
  const g2 = await rpc(anon, 'portal_smart_form_get', { p_token: TOK2, p_step_id: S2 });
  ok('251: «מה בכרטיס» מחזיר openDate ו-industry מכרטיס העסק', g2?.card?.openDate === '2026-11-15' && g2.card?.industry === 'M', g2?.card);
  const badInd = await rpc(anon, 'portal_smart_form_save', { p_token: TOK2, p_step_id: S2, p_values: { industry: 'Z' } });
  ok('251: ענף שאינו ברשימה נדחה', badInd?.error === 'bad_choice', badInd);
  const farDate = await rpc(anon, 'portal_smart_form_save', { p_token: TOK2, p_step_id: S2, p_values: { openDate: '2099-01-01' } });
  ok('251: תאריך פתיחה רחוק מדי נדחה; עתיד קרוב מותר', farDate?.error === 'bad_date', farDate);
  // מחזור גדול ⇒ מורשה (העסק נוצר ע"י הטופס ⇒ עוקב)
  const big = await rpc(anon, 'portal_smart_form_save', { p_token: TOK2, p_step_id: S2, p_values: { turnover: '400000', dealerKind: 'licensed' } });
  const [c2b] = await writeStaging(`select businesses->0->>'kind' k, dealer_type from public.clients where id = ${q(C2)}`);
  ok('251: מחזור שעלה מעל התקרה ⇒ העסק עוסק מורשה; dealer_type לא נדרס', big?.ok && c2b?.k === 'osek_morshe' && c2b.dealer_type === 'exempt', c2b);
  // «לא קיים נכס» ⇒ הכנה עוברת בלי פרטי נכס
  const noProp = await rpc(anon, 'portal_smart_form_save', { p_token: TOK2, p_step_id: S2, p_values: { propExists: 'no', propKind: '', propTenure: '', propParty: '', propKindOther: '' } });
  ok('251: «לא קיים נכס» נשמר', noProp?.ok && noProp.data?.propExists === 'no' && !noProp.data?.propKind, noProp?.data);
  const p3a = await rpc(anon, 'portal_smart_form_prepare', { p_token: TOK2, p_step_id: S2 });
  ok('251: הכנה לחתימה עוברת בלי פרטי נכס כש«לא קיים נכס»', p3a?.ok && p3a.revisionState === 'locked', p3a);
  const back = await rpc(anon, 'portal_smart_form_save', { p_token: TOK2, p_step_id: S2, p_values: { propExists: 'yes' } });
  const p3b = await rpc(anon, 'portal_smart_form_prepare', { p_token: TOK2, p_step_id: S2 });
  ok('251: «קיים נכס» בלי פרטים ⇒ ההכנה נחסמת על propKind/propTenure', back?.ok && p3b?.error === 'missing' && p3b.missing?.includes('propKind') && p3b.missing?.includes('propTenure'), p3b);
  const fix = await rpc(anon, 'portal_smart_form_save', { p_token: TOK2, p_step_id: S2, p_values: { propKind: 'other', propKindOther: 'דירת מגורים', propTenure: 'owned', propParty: 'נועה בדיקת-עוסק' } });
  ok('251: השלמת פרטי הנכס', fix?.ok, fix);
  const bank = (c2?.bank_accounts ?? [])[0] ?? {};
  ok('כרטיס: חשבון בנק ראשי (מהמשרד)', bank.bankCode === '12' && bank.branchNumber === '600' && bank.accountNumber === '123456' && bank.isPrimary === true && c2.kby === 'office', c2?.bank_accounts);
  const p3 = await rpc(anon, 'portal_smart_form_prepare', { p_token: TOK2, p_step_id: S2 });
  ok('821: הכנה לחתימה', p3?.ok && p3.data?.bankAccount === '123456' && p3.data?.businessName === 'נועה עיצובים' && p3.data?.turnover === '400000' && p3.data?.openDate === '2026-11-15', p3);
  const cancel = await rpc(office.db, 'smart_form_advance', { p_filing_id: F2, p_action: 'cancel', p_detail: { reason: 'בדיקה' } });
  ok('ביטול בקשה לפני חתימה', cancel?.ok, cancel);
  const portal3 = await rpc(anon, 'get_client_portal', { p_token: TOK2 });
  ok('אחרי ביטול: לא בדף', !(portal3?.items ?? []).some(i => i.key === `sform_${S2}`), portal3?.items);
  const cancelledGet = await rpc(anon, 'portal_smart_form_get', { p_token: TOK2, p_step_id: S2 });
  ok('אחרי ביטול: הטופס לא נפתח', cancelledGet?.ok === false, cancelledGet);

  // ── תצוגה לדוגמה («צפייה» בקטלוג) — אותו פריט מהיטל בלבד ──
  const sample = await rpc(office.db, 'preview_request_sample', { p_request: { samples: [{ key: 'a', stepType: 'custom_request', status: 'waiting_client', ball: 'client', owner: 'client',
    payload: { clientTitle: 'רישום העסק במע״מ (טופס 821)', requirements: [], smartForm: { templateKey: 'vat-821', state: 'awaiting_signatures', clientFill: true, authority: 'vat' } } }] } });
  const sItem = (sample?.items ?? sample?.data?.items ?? []).find?.(i => i.kind === 'smart_form');
  ok('«צפייה» בקטלוג: הפריט נבנה מההיטל', !!sItem && sItem.sub === 'הטופס מוכן · נשאר לעבור עליו ולחתום', sample);
} catch (e) {
  fail++; console.log('✗ חריגה:', e.message);
} finally {
  await cleanup();
  const [left] = await writeStaging(`select (select count(*) from public.clients where id in (${ids}))::int c, (select count(*) from public.smart_form_filings where client_id in (${ids}))::int f`);
  ok('ניקוי: לא נשארו לקוחות/הגשות בדיקה', left?.c === 0 && left.f === 0, left);
  console.log(`\n${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
}
