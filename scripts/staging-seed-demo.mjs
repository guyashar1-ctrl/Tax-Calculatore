#!/usr/bin/env node
/**
 * staging-seed-demo.mjs — נתוני ההדגמה של סבב 3 ב-staging (QADEMO). ‼ staging בלבד.
 *
 *   · ספרייה: ארבע בקשות להסתעפות (עוסק פטור / עוסק מורשה וחברה / אחרי המסמכים).
 *   · מסלול הקליטה של המשרד: גרסה חדשה עם הסתעפות לפי סוג לקוח — נשמרת דרך הקוד של
 *     האתר עצמו (compileOnboarding + saveOfficeFlow), כמו שהבונה שומר. דורש ששרת
 *     ההדגמה רץ: http://localhost:5198 (integration-staging).
 *   · ארבעה לידים עם הצעות מחיר וייצוג: שתיים מאושרות כאן (שירה — עוסק פטורה, אבי — חברה)
 *     דרך approve_quotation האמיתי; שתיים ממתינות לאישור בהדגמה (מיכל — פטורה, יוסי — מורשה).
 *   · בסוף: «הרץ את התזמון» פעם אחת — ההודעות למשרד על ההצעות שאושרו נקלטות בספק המדומה.
 *   · תרחישי סבב 4 — כל אחד נוצר במסלול האמיתי, לא בכתיבת התוצאה:
 *       נועה — סוג העוסק לא ידוע: הבקשות שתלויות בסוג מחכות, השאר נפתחות.
 *       רונית — בקשה מהספרייה שרוקנה אחרי שמירת המסלול: שורה אדומה «לא נוצרה»; הספרייה
 *               משוחזרת מיד, אז «צור שוב» מצליח בהדגמה.
 *       דנה — כתובת עם fail-once: ההודעה הראשונה מסתיימת ב«לא ידוע אם יצא» (500 מהספק
 *             המדומה); «שלח שוב (אותו מייל)» יוצא באותו מפתח ומצליח.
 *       מאיה ועומר — זוג שממתין לרשויות: תהליך ייצוג אחד עם ב״ל לכל אחד, וכרטיס אישור
 *             הייצוג בדף האישי עם מה כל אחד מסמן.
 *       תמר — שע״ם ממתינה לאישור הלקוח: הכרטיס הופך לחובה.
 *       גלית — לקוחה חוזרת: התקשרות שהסתיימה, הצעה חדשה שאושרה, קליטה חדשה בלי כפילויות.
 *
 * כל הכתובות @example.test — והמיילים נקלטים בספק המדומה (scripts/staging-fake-email.mjs).
 *   שימוש:  node scripts/staging-seed-demo.mjs            (זורע מחדש)
 *           node scripts/staging-seed-demo.mjs --clean    (מנקה)
 */
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ROOT, loadEnv, writeStaging as sqlq } from './staging-lib.mjs';

const env = loadEnv('.env.staging');
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const opts = { auth: { autoRefreshToken: false, persistSession: false } };
const q = (v) => v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const one = async (s) => (await sqlq(s))[0];
const TAG = 'QADEMO';
const DEMO_URL = 'http://localhost:5198/';

async function clean() {
  await sqlq(`
    delete from public.test_captured_emails where to_emails::text like '%qademo%';
    delete from public.accountant_notifications where client_id in (select id from public.clients where last_name = '${TAG}');
    delete from public.email_messages where client_id in (select id from public.clients where last_name = '${TAG}');
    delete from public.client_notices where client_id in (select id from public.clients where last_name = '${TAG}');
    delete from public.onboarding_events where step_id in (select id from public.onboarding_steps where client_id in (select id from public.clients where last_name = '${TAG}'));
    delete from public.onboarding_events where engagement_id in (select id from public.engagements where client_id in (select id from public.clients where last_name = '${TAG}'));
    delete from public.flow_runs where client_id in (select id from public.clients where last_name = '${TAG}');
    delete from public.representation_requests where linked_client_id in (select id from public.clients where last_name = '${TAG}');
    delete from public.clients where last_name = '${TAG}';
    delete from public.quotations where id like 'qademo-%';
    delete from public.leads where id like 'qademo-lead-%';`);
}
if (process.argv.includes('--clean')) { await clean(); console.log('נוקה (מסלול הקליטה והספרייה נשארים).'); process.exit(0); }
await clean();

const login = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, opts);
const { data: s, error } = await login.auth.signInWithPassword({ email: env.VITE_DEV_USER_EMAIL, password: env.VITE_DEV_USER_PASSWORD });
if (error) { console.error('✋ כניסה למשתמש הבדיקות נכשלה — עוצרים (לא מנסים שוב):', error.message); process.exit(1); }
const user = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { ...opts, global: { headers: { Authorization: `Bearer ${s.session.access_token}` } } });
const pure = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, opts);
const office = (await one(`select office_id from public.profiles where id = '${USER_ID}'`)).office_id;

// ── 1 · ספרייה ─────────────────────────────────────────────────────────────
const tpl = async (name, payload, owner = 'client') => {
  const ex = await one(`select id from public.journey_templates where office_id = '${office}' and kind = 'request' and name = ${q(name)}`);
  const entries = JSON.stringify([{ key: 'e1', stepType: 'custom_request', owner, requiredForClose: true, payload }]);
  if (ex) { await sqlq(`update public.journey_templates set entries = ${q(entries)}::jsonb, description = '${TAG}' where id = ${q(ex.id)}`); return ex.id; }
  return (await one(`insert into public.journey_templates (user_id, office_id, kind, name, description, entries)
    values ('${USER_ID}', '${office}', 'request', ${q(name)}, '${TAG}', ${q(entries)}::jsonb) returning id`)).id;
};
const req = (key, kind, label) => ({ key, kind, label, done: false, required: true });
const tExempt = await tpl('הצהרת מחזור — עוסק פטור', { title: 'הצהרת מחזור — עוסק פטור', clientTitle: 'הצהרת מחזור לשנה האחרונה',
  clientSub: 'כדי לוודא שהמחזור לא עבר את תקרת העוסק הפטור', clientCta: 'למילוי',
  requirements: [req('turnover', 'file', 'דוח הכנסות לשנה האחרונה'), req('cap', 'confirm', 'המחזור השנתי לא עבר את התקרה')] });
const tVat = await tpl('דוחות מע״מ אחרונים', { title: 'דוחות מע״מ אחרונים', clientTitle: 'דוחות מע״מ מהחצי שנה האחרונה',
  clientCta: 'להעלאה', requirements: [req('vat', 'files', 'דוחות מע״מ — 6 חודשים אחרונים')] });
const tBank = await tpl('אישור ניהול חשבון בנק עסקי', { title: 'אישור ניהול חשבון בנק עסקי', clientTitle: 'אישור ניהול חשבון בנק עסקי',
  clientCta: 'להעלאה', requirements: [req('bank', 'file', 'אישור ניהול חשבון מהבנק')] });
const tMeet = await tpl('קביעת פגישת פתיחה', { title: 'קביעת פגישת פתיחה', clientTitle: 'מתי נוח לך להיפגש?',
  clientSub: 'פגישה של חצי שעה, אצלנו או בזום', clientCta: 'לבחירה', requirements: [req('when', 'text', 'ימים ושעות שנוחים לך')] });
const introPayload = { title: 'שאלון היכרות קצר', clientTitle: 'כמה מילים על העסק', clientCta: 'למילוי',
  requirements: [req('about', 'text', 'במה העסק עוסק, ומאיזו שנה')] };
const tIntro = await tpl('שאלון היכרות קצר', introPayload);
console.log('✓ ספרייה');

// ── 2 · מסלול הקליטה עם הסתעפות — דרך הקוד של האתר ─────────────────────────
const flowRow = await one(`select id, current_version from public.office_flows where office_id = '${office}' and seed_key = 'onboarding'`);
const cur = (await one(`select definition from public.office_flow_versions where flow_id = ${q(flowRow.id)} and version = ${flowRow.current_version}`)).definition;
const s1 = cur.stages.find((x) => x.opens?.after === 'start') ?? cur.stages[0];
const def = { stages: [
  // ‼ «בדף מיד, מייל כשתשלח» — המייל המרוכז מחכה במגש עד «שלח».
  { ...s1, name: 'פתיחת התיק', delivery: 'approve' },
  { key: 'qd-exempt', name: 'עוסק פטור', opens: { after: 'start' }, when: { kinds: ['exempt_dealer'] }, delivery: 'approve',
    reminder: { afterDays: 5, max: 2 }, notifyOffice: false, items: [{ key: 'qd-turnover', ref: { kind: 'template', templateId: tExempt } }] },
  { key: 'qd-licensed', name: 'עוסק מורשה וחברה', opens: { after: 'start' }, when: { kinds: ['licensed_dealer', 'company'] }, delivery: 'approve',
    reminder: { afterDays: 5, max: 2 }, notifyOffice: false,
    items: [{ key: 'qd-vat', ref: { kind: 'template', templateId: tVat } }, { key: 'qd-bank', ref: { kind: 'template', templateId: tBank } },
      { key: 'qd-intro', ref: { kind: 'template', templateId: tIntro } }] },
  { key: 'qd-meet', name: 'אחרי שהמסמכים הגיעו', opens: { after: 'item', item: 'client_documents' }, delivery: 'auto',
    reminder: null, notifyOffice: true, items: [{ key: 'qd-meeting', ref: { kind: 'template', templateId: tMeet } }] },
] };
const { chromium } = createRequire('C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json')('playwright-core');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await (await browser.newContext()).newPage();
await page.route('**/*uoweoqtuiettozagwgdw*/**', (r) => r.abort());  // ‼ לעולם לא ייצור
await page.goto(DEMO_URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
const saved = await page.evaluate(async ({ flowId, base, definition }) => {
  const api = await import('/src/features/flows/api.ts');
  const comp = await import('/src/features/flows/compile.ts');
  const rt = await import('/src/lib/requestTemplates.ts');
  const templates = await rt.loadRequestTemplates();
  const lib = {
    template: (id) => {
      const t = rt.templateForRef(templates, id); const e = t?.entries?.[0];
      return t && e ? { name: t.name, stepType: e.stepType || 'custom_request', owner: e.owner, payload: e.payload ?? {}, requiredForClose: e.requiredForClose } : undefined;
    },
    document: () => undefined,
  };
  const issues = comp.validateFlow(definition, { onboarding: true });
  if (issues.length) return { ok: false, issues };
  const compiled = comp.compileOnboarding(definition, lib);
  return api.saveOfficeFlow(flowId, base, definition, { note: 'הדגמה: הסתעפות לפי סוג לקוח, ומייל מרוכז באישורך', compiled });
}, { flowId: flowRow.id, base: flowRow.current_version, definition: def });
await browser.close();
if (!saved?.version) throw new Error('save_office_flow: ' + JSON.stringify(saved));
console.log('✓ מסלול הקליטה — גרסה', saved.version);

// ── 3 · לידים והצעות ───────────────────────────────────────────────────────
const NI = (t) => ({ status: 'in_process', targets: t });
const leads = [
  { n: 1, first: 'שירה', slug: 'shira', dealer: 'exempt', approve: true, rep: { incomeTax: { status: 'in_process', level: 'primary' }, nationalInsurance: NI(['client']) } },
  { n: 2, first: 'אבי', slug: 'avi', dealer: 'company', approve: true, rep: null },
  { n: 3, first: 'מיכל', slug: 'michal', dealer: 'exempt', approve: false, rep: { incomeTax: { status: 'in_process', level: 'primary' }, nationalInsurance: NI(['client']) } },
  { n: 4, first: 'יוסי', slug: 'yossi', dealer: 'licensed', approve: false, rep: null },
  // ── סבב 4 ──
  { n: 5, first: 'נועה', slug: 'noa', dealer: null, approve: true, rep: null, story: 'סוג העוסק לא ידוע — בקשות מחכות לסוג' },
  { n: 6, first: 'רונית', slug: 'ronit', dealer: 'licensed', approve: true, rep: null, breakIntro: true, story: 'בקשה שלא נוצרה — שורה אדומה' },
  { n: 7, first: 'דנה', slug: 'dana.fail-once', dealer: 'exempt', approve: true, rep: null, sendUnknown: true, story: 'מייל ש«לא ידוע אם יצא»' },
  { n: 8, first: 'מאיה', slug: 'maya', dealer: 'licensed', approve: true, spouse: 'עומר', awaiting: 'couple',
    rep: { incomeTax: { status: 'in_process', level: 'primary' }, vat: { status: 'in_process', level: 'primary', targets: ['client', 'spouse'] }, nationalInsurance: NI(['client', 'spouse']) },
    story: 'זוג: תהליך ייצוג אחד עם ב״ל לכל אחד, ואישור הייצוג בדף האישי' },
  { n: 9, first: 'תמר', slug: 'tamar', dealer: 'exempt', approve: true, awaiting: 'required',
    rep: { incomeTax: { status: 'in_process', level: 'primary' } }, story: 'שע״ם ממתינה לאישור הלקוחה — הכרטיס חובה' },
  { n: 10, first: 'גלית', slug: 'galit', dealer: 'exempt', approve: true, rep: null, returning: true, story: 'לקוחה חוזרת — קליטה חדשה בלי כפילויות' },
];
const fullRep = { incomeTax: { status: 'in_process', level: 'primary' }, withholding: { status: 'in_process', level: 'primary' },
  vat: { status: 'in_process', level: 'primary' }, nationalInsurance: NI(['client']) };
const KIND = { exempt: 'עוסק פטור', company: 'חברה', licensed: 'עוסק מורשה' };
const callFn = async (name, body) => {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/${name}`, { method: 'POST',
    headers: { Authorization: `Bearer ${s.session.access_token}`, apikey: env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const portalOf = async (cid) => {
  const { data: tok, error: e } = await user.rpc('mint_portal_token', { p_client_id: cid });
  return e || !tok ? null : `${DEMO_URL}?portal=${tok}`;
};
const quoteRow = (id, L, token, email, clientId = null) => {
  const items = [{ id: 'i1', serviceId: 's1', name: L.dealer === 'exempt' ? 'דוח שנתי לעוסק פטור' : 'הנהלת חשבונות', category: L.dealer === 'exempt' ? 'annual' : 'monthly',
    billingType: L.dealer === 'exempt' ? 'one_time' : 'monthly', catalogPrice: L.dealer === 'exempt' ? 2400 : 1500, clientPrice: L.dealer === 'exempt' ? 2400 : 1500, quantity: 1, vatFlag: true }];
  const representation = { enabled: true, areas: L.rep ?? fullRep, spouse: null,
    prefill: { firstName: L.first, lastName: TAG, email, phone: `050-71000${L.n}0`, ...(L.spouse ? { spouseName: `${L.spouse} ${TAG}` } : {}) } };
  return `insert into public.quotations (id, user_id, lead_id, client_id, quotation_number, status, public_token, items, representation, vat_rate, sent_at)
    values ('${id}', '${USER_ID}', 'qademo-lead-${L.n}', ${q(clientId)}, 'DEMO-${id.slice(7)}', 'sent', ${q(token)}, ${q(JSON.stringify(items))}::jsonb,
            ${q(JSON.stringify(representation))}::jsonb, 18, now());`;
};
const approve = async (token, L) => {
  const { error: apErr } = await pure.rpc('approve_quotation', { p_token: token, p_signature: null, p_signer_name: `${L.first} ${TAG}` });
  if (apErr) throw new Error('approve: ' + apErr.message);
};
const links = [];
for (const L of leads) {
  const email = `${L.slug}.qademo@example.test`;
  const token = randomBytes(16).toString('hex');
  await sqlq(`insert into public.leads (id, user_id, full_name, email, phone, status, has_previous_accountant)
    values ('qademo-lead-${L.n}', '${USER_ID}', ${q(L.first + ' ' + TAG)}, ${q(email)}, '050-71000${L.n}0', 'new', ${L.n % 2 === 0});
    ${quoteRow(`qademo-${L.n}`, L, token, email)}`);
  const { data: ens } = await user.rpc('ensure_client_for_quotation', { p_quotation_id: `qademo-${L.n}` });
  if (ens?.ok === false) throw new Error('ensure_client: ' + JSON.stringify(ens));
  const cid = (await one(`select client_id from public.quotations where id = 'qademo-${L.n}'`)).client_id;
  const spouseSet = L.spouse
    ? `, family_status = 'married', spouse_first_name = ${q(L.spouse)}, spouse_last_name = '${TAG}', id_number = '0${70000000 + L.n}', spouse_id_number = '0${80000000 + L.n}'`
    : '';
  await sqlq(`update public.clients set last_name = '${TAG}', first_name = ${q(L.first)}, dealer_type = ${q(L.dealer)}, email = ${q(email)}${spouseSet}
    where id = ${q(cid)}`);
  const entry = { who: `${L.first}${L.spouse ? ` ו${L.spouse}` : ''} (${L.dealer ? KIND[L.dealer] : 'סוג לא ידוע'})`, story: L.story ?? null,
    client: `${DEMO_URL}#/client/${cid}/journey`, quote: null, portal: null };

  if (L.breakIntro) {
    // ‼ המשרד רוקן את הבקשה בספרייה אחרי ששמר את המסלול ⇒ באישור ההצעה היא לא נוצרת.
    await sqlq(`update public.journey_templates set entries = jsonb_set(entries, '{0,payload,requirements}', '[]'::jsonb) where id = ${q(tIntro)}`);
  }
  if (L.approve) await approve(token, L);
  else entry.quote = `${DEMO_URL}?quote=${token}`;
  if (L.breakIntro) {
    await sqlq(`update public.journey_templates set entries = jsonb_set(entries, '{0,payload}', ${q(JSON.stringify(introPayload))}::jsonb) where id = ${q(tIntro)}`);
    const p = await one(`select count(*)::int n from public.onboarding_steps where client_id = ${q(cid)} and payload ? 'creationProblem' and status not in ('completed','skipped','cancelled')`);
    entry.check = `שורות «לא נוצרה»: ${p.n}`;
  }
  if (L.dealer === null) {
    const h = await one(`select kind_hold from public.engagements where client_id = ${q(cid)} order by created_at desc limit 1`);
    entry.check = `מחכות לסוג: ${(h?.kind_hold?.held ?? []).map((x) => x.title).join(' · ') || '—'}`;
  }
  if (L.spouse) {
    // ב״ל לכל אחד מבני הזוג — אותה פעולה שהמשרד מפעיל מהכרטיס.
    for (const role of ['client', 'spouse']) {
      const { data: ni, error: niErr } = await user.rpc('request_authority_representation',
        { p_client_id: cid, p_authority: 'national_insurance', p_subject_role: role, p_source: 'demo' });
      if (niErr || ni?.ok === false) console.log(`  ב״ל ${role}:`, niErr?.message ?? JSON.stringify(ni));
    }
  }
  if (L.awaiting) {
    // הבקשה נחתמה והוגשה; שע״ם מציגה את הבקשות לכל אדם (קוד 7 + תיק 91 = ממתין לאישור הלקוח).
    const row = (label, code) => ({ systemLabel: label, rawSystemState: 'מושהה - ממתין לאישור לקוח', systemStateCode: 7, tik91: true, systemCode: code });
    const shaam = L.awaiting === 'couple'
      ? { 'person:client': { requestedSystems: ['vat'], systems: [row('מעמ', 2)] },
          'person:spouse': { requestedSystems: ['incomeTax', 'vat'], systems: [row('מס הכנסה', 1), row('מעמ', 2)] } }
      : { 'person:client': { requestedSystems: ['incomeTax'], systems: [row('מס הכנסה', 1)] } };
    const spouseFiles = L.spouse
      ? `update public.clients set registered_spouse_verified = true, tax_files = '[{"authority":"income_tax","owner":"spouse"}]'::jsonb where id = ${q(cid)};`
      : '';
    // ‼ שע״ם מציגה «ממתין לאישור לקוח» (קוד 7 + תיק 91) ⇒ הכרטיס חובה — אותה פונקציה שהבדיקה מול שע״ם מפעילה.
    const fn = 'shaam_require_client_approval';
    await sqlq(`${spouseFiles}
      update public.representation_requests set status = 'awaiting_authorities',
        execution = coalesce(execution, '{}'::jsonb) || jsonb_build_object('shaam', ${q(JSON.stringify(shaam))}::jsonb)
       where id = (select representation_request_id from public.clients where id = ${q(cid)});
      select public.${fn}(${q(cid)});`);
    const ap = await one(`select public._rep_approval_people(${q(cid)}) a`);
    entry.check = `מה מסמנים: ${(ap.a ?? []).map((p) => `${p.name}: ${p.systems.join(', ')}`).join(' · ') || 'כללי'}`;
  }
  if (L.returning) {
    // ההתקשרות הראשונה הסתיימה; הצעה חדשה לאותו כרטיס — ואישורה פותח קליטה חדשה.
    const e1 = await one(`select id from public.engagements where client_id = ${q(cid)} order by created_at desc limit 1`);
    const { data: ended, error: endErr } = await user.rpc('end_engagement', { p_engagement_id: e1.id, p_reason: 'הדגמה: הלקוחה עזבה' });
    if (endErr || ended?.ok === false) throw new Error('end_engagement: ' + (endErr?.message ?? JSON.stringify(ended)));
    const token2 = randomBytes(16).toString('hex');
    await sqlq(quoteRow(`qademo-${L.n}b`, L, token2, email, cid));
    await approve(token2, L);
    const d = await one(`select count(*)::int n from (select step_type from public.onboarding_steps where client_id = ${q(cid)}
      and status not in ('cancelled','skipped','completed','verified') and step_type <> 'custom_request' group by step_type having count(*) > 1) x`);
    const en = await one(`select count(*)::int n from public.engagements where client_id = ${q(cid)}`);
    entry.check = `התקשרויות: ${en.n} · סוגים פתוחים כפולים: ${d.n}`;
  }
  if (L.sendUnknown) {
    // המשרד לוחץ «שלח» — הספק המדומה עונה 500 בניסיון הראשון ⇒ «לא ידוע אם יצא».
    const pv = await callFn('send-process-open-email', { clientId: cid, kind: 'new', preview: true });
    const r = await callFn('send-process-open-email', { clientId: cid, kind: 'new', expectedFingerprint: pv.body?.fingerprint });
    const n = await one(`select status, reason from public.client_notices where client_id = ${q(cid)} order by created_at desc limit 1`);
    entry.check = `תשובת השליחה ${r.status} · ההודעה: ${n?.status ?? '—'}`;
  }
  entry.steps = (await one(`select count(*)::int n from public.onboarding_steps where client_id = ${q(cid)} and status <> 'cancelled'`)).n;
  if (L.approve) entry.portal = await portalOf(cid);
  links.push(entry);
}
console.log('✓ לידים והצעות');

// ── 4 · התזמון פעם אחת (הודעות למשרד על ההצעות שאושרו) ──────────────────────
const { data: kick } = await user.rpc('demo_run_schedule', { p_simulate_day: false });
console.log('✓ תזמון:', JSON.stringify(kick));
writeFileSync(resolve(ROOT, 'docs/evidence/demo-links.json'), JSON.stringify(links, null, 2));
for (const l of links) console.log(`· ${l.who}${l.story ? ` — ${l.story}` : ''}: ${l.steps} בקשות${l.check ? ` · ${l.check}` : ''}\n    כרטיס ${l.client}${l.quote ? `\n    אישור ההצעה (כלקוח) ${l.quote}` : ''}${l.portal ? `\n    הדף האישי ${l.portal}` : ''}`);
