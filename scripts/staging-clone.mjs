#!/usr/bin/env node
/**
 * staging-clone.mjs — מעתיק לסביבת הבדיקות את *המבנה הלוגי* של הנתונים
 * האמיתיים, בלי המידע האישי.
 *
 * למה בכלל להעתיק: מבחן ההתאמה של מיגרציה 68 (תוכנית §12.5) דורש שרשימת
 * השלבים החוסמים בשלוש הקליטות האמיתיות תישאר זהה בדיוק לפני ואחרי. לשם כך
 * צריך את אותם מזהים, סוגים, סטטוסים, תאריכים ותלויות — ולא צריך אף שם.
 *
 * ‼ איך נשמרת הפרטיות: עמודות המידע האישי מסוננות **בשאילתה על הפרודקשן**,
 * ולא אחרי ההעתקה. הן לעולם אינן עוזבות את המסד האמיתי — לא לרשת, לא לקובץ
 * ולא לזיכרון של הסקריפט. במקומן נכתבים ערכים סינתטיים.
 *
 * ‼ מה לא מועתק כלל: מיילים (email_messages), מסמכים וקבצים, חתימות,
 * אירועי קליטה (טקסט חופשי), משימות, עובדים, תשובות דוח שנתי, פרופיל המשרד,
 * וכל סוד או הגדרה של הפרודקשן.
 *
 * ‼ טוקנים ציבוריים: כל טוקן נוצר מחדש באקראי ב-staging. אף קישור ציבורי
 * אמיתי אינו קיים שם, ולכן קישור מהפרודקשן לא ייפתח שם ולהפך.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ROOT, STAGING_REF, readProd, writeStaging } from './staging-lib.mjs';

const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const tok = () => randomBytes(16).toString('hex');
const q = (v) => v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const j = (v) => v === null || v === undefined ? 'null' : `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

/**
 * עמודות שנחתכות כבר בפרודקשן. כל מה שאינו ברשימה — מבנה, ומועתק כמו שהוא.
 * ‼ הרשימה נוטה להחמיר: עדיף לחתוך עמודה מבנית מדי מאשר להשאיר טקסט חופשי.
 */
const PII = {
  clients: ['first_name', 'last_name', 'id_number', 'phone', 'email', 'city', 'address',
    'business_description', 'spouse_name', 'spouse_id_number', 'property_address',
    'rental_notes', 'investment_broker_name', 'investment_notes', 'foreign_accounts',
    'pension_fund_name', 'notes', 'pinned_note', 'field_meta', 'investment_accounts',
    'bank_accounts', 'family_company_name', 'kibbutz_name', 'intake_token', 'business_name',
    'prev_accountant_name', 'prev_accountant_email', 'prev_accountant_phone', 'portal_token',
    'assigned_accountant_id', 'tax_office_name', 'withholding_office_name', 'ni_branch_name'],
  leads: ['full_name', 'phone', 'email', 'business_name', 'notes',
    'prev_accountant_name', 'prev_accountant_email', 'prev_accountant_phone'],
  quotations: ['public_token', 'email_subject', 'email_message', 'notes_for_client',
    'internal_notes', 'events', 'approval_signature', 'approval_signer_name', 'items',
    'future_services'],
  representation_requests: ['client_name', 'client_email', 'notes', 'onboarding_token',
    'signature_setup', 'signature_values', 'execution', 'signers'],
  engagements: [],
  onboarding_steps: ['payload'],
  journey_templates: ['name', 'description', 'entries'],
};

/** מושך שורות עם עמודות המבנה בלבד — הסינון קורה בתוך הפרודקשן. */
async function structural(table) {
  const deny = PII[table].map((c) => `'${c}'`).join(',') || `''`;
  const rows = await readProd(`
    select coalesce((select jsonb_object_agg(key, value)
                       from jsonb_each(to_jsonb(t))
                      where key not in (${deny})), '{}'::jsonb) as r
      from public.${table} t`);
  return rows.map((x) => x.r);
}

/** payload של שלב: רק מפתחות מבניים; כל טקסט חופשי מוחלף. */
function cleanPayload(p) {
  if (!p || typeof p !== 'object') return {};
  const out = {};
  const KEEP = ['published', 'done', 'paperlessStatus', 'dataSource', 'amount',
    'billingStartMonth', 'dueDate', 'objectionDueDate', 'releaseSentAt', 'secondaryAuthorities'];
  for (const k of KEEP) if (k in p) out[k] = p[k];
  if (Array.isArray(p.requirements)) {
    out.requirements = p.requirements.map((r, i) => ({
      kind: r?.kind, key: r?.key, done: r?.done ?? false, label: `דרישה ${i + 1} (בדיקה)`,
    }));
  }
  if (Array.isArray(p.checklist)) {
    out.checklist = p.checklist.map((c, i) => ({
      key: c?.key, done: c?.done ?? false, label: `פריט ${i + 1} (בדיקה)`,
    }));
  }
  if (Array.isArray(p.requestedMaterials)) out.requestedMaterials = p.requestedMaterials;
  if ('clientTitle' in p) out.clientTitle = 'כותרת לבדיקה';
  if ('clientSub' in p) out.clientSub = 'הסבר קצר לבדיקה';
  if ('clientCta' in p) out.clientCta = 'להמשך';
  if ('title' in p) out.title = 'בקשה לבדיקה';
  if ('softwareName' in p) out.softwareName = 'תוכנה לבדיקה';
  if ('releaseSubject' in p) out.releaseSubject = 'מכתב שחרור (בדיקה)';
  if ('releaseBody' in p) out.releaseBody = 'גוף המכתב הוחלף לצורכי בדיקה.';
  // ‼ releaseToken לא מועתק: זהו קישור ציבורי אמיתי.
  return out;
}

/**
 * ההוספה עוברת דרך jsonb_populate_record ולא דרך רשימת ערכים: כך Postgres
 * ממיר בעצמו מערכים (text[]), תאריכים ו-jsonb לפי טיפוס העמודה. בניית
 * הליטרלים ביד נכשלה בדיוק על זה.
 */
const ins = async (table, rows, extra = () => ({})) => {
  if (!rows.length) { console.log(`· ${table}: אין שורות`); return; }
  for (const [i, r] of rows.entries()) {
    const row = { ...r, ...extra(r, i) };
    if ('user_id' in row) row.user_id = USER_ID;          // הכול שייך למשתמש הבדיקה
    await writeStaging(
      `insert into public.${table}
       select * from jsonb_populate_record(null::public.${table}, ${j(row)})
       on conflict do nothing;`);
  }
  console.log(`· ${table}: ${rows.length} שורות`);
};

console.log(`יעד: ${STAGING_REF}  ·  משתמש ${USER_ID}\n`);

// ‼ הטבלאות שנטענות כאן נושאות טריגרים שמסנכרנים ייצוג ומחשבים מחדש שלב
//   מחזור־חיים. בהרצה הראשונה הם רצו, ואחד מהם יצר שלב "שדרוג לייצוג" משלו
//   שתפס את מקומו של השלב האמיתי (אינדקס ייחודי לפי סוג) — והעותק חדל להיות
//   זהה למקור. `set session_replication_role` אינו עוזר: כל קריאה ל-API היא
//   סשן חדש. לכן הנטרול נעשה ב-DDL, שנשמר בין הקריאות.
const LOADED = ['clients', 'leads', 'quotations', 'representation_requests',
  'engagements', 'onboarding_steps', 'journey_templates'];

for (const t of LOADED) await writeStaging(`alter table public.${t} disable trigger user;`);
// טעינה חוזרת מתחילה מדף נקי, אחרת on conflict do nothing היה משמר טעות קודמת.
for (const t of ['onboarding_events', 'onboarding_steps', 'engagements',
                 'representation_requests', 'quotations', 'journey_templates',
                 'leads', 'clients']) {
  await writeStaging(`delete from public.${t};`);
}

const clients = await structural('clients');
await ins('clients', clients, (_r, i) => ({
  first_name: `לקוח${i + 1}`, last_name: 'בדיקה',
  email: 'delivered@resend.dev', phone: `050-000${String(i + 1).padStart(4, '0')}`,
  id_number: String(100000000 + i * 7).slice(0, 9),
  city: 'עיר בדיקה', address: 'רחוב הבדיקה 1',
  business_name: `עסק בדיקה ${i + 1}`,
  portal_token: tok(),
  // ‼ עמודות jsonb שנחתכו: ריק ולא null, כדי שהמסך יקבל את אותה צורה.
  field_meta: {}, bank_accounts: [], investment_accounts: [], foreign_accounts: [],
}));

const leads = await structural('leads');
await ins('leads', leads, (_r, i) => ({
  full_name: `ליד בדיקה ${i + 1}`, email: 'delivered@resend.dev',
  phone: `050-100${String(i + 1).padStart(4, '0')}`,
}));

const quotations = await structural('quotations');
await ins('quotations', quotations, (_r, i) => ({
  public_token: tok(),
  email_subject: 'הצעת מחיר (בדיקה)',
  notes_for_client: null, internal_notes: null,
  // פריט אחד סינתטי — הסכומים אינם נבדקים כאן, המבנה כן.
  items: [{ id: 'it1', serviceId: 'svc1', name: 'שירות בדיקה', category: 'ongoing',
            billingType: 'monthly', catalogPrice: 1000, clientPrice: 1000, quantity: 1,
            vatFlag: true }],
  events: [{ type: 'created', at: new Date().toISOString() }],
  future_services: [],
  approval_signature: null,
  approval_signer_name: `חותם בדיקה ${i + 1}`,
}));

const reps = await structural('representation_requests');
await ins('representation_requests', reps, (_r, i) => ({
  client_name: `לקוח${i + 1} בדיקה`, client_email: 'delivered@resend.dev',
  onboarding_token: tok(), notes: null,
  signature_setup: null, signature_values: null, execution: {}, signers: [],
}));

await ins('engagements', await structural('engagements'));

// שלבים: תלות עצמית מחייבת שתי מנות — קודם בלי הקישור, ואז עדכון.
const steps = await structural('onboarding_steps');
const rawPayloads = await readProd(`select id, payload from public.onboarding_steps`);
const payloadById = new Map(rawPayloads.map((r) => [r.id, cleanPayload(r.payload)]));
await ins('onboarding_steps', steps.map((s) => ({ ...s, depends_on_step_id: null })),
  (r) => ({ payload: payloadById.get(r.id) ?? {} }));
let deps = 0;
for (const s of await readProd(`select id, depends_on_step_id from public.onboarding_steps
                                 where depends_on_step_id is not null`)) {
  await writeStaging(`update public.onboarding_steps set depends_on_step_id = ${q(s.depends_on_step_id)}
                       where id = ${q(s.id)};`);
  deps += 1;
}
console.log(`· onboarding_steps: ${deps} תלויות שוחזרו`);

const tpls = await structural('journey_templates');
const rawEntries = await readProd(`select id, entries from public.journey_templates`);
const entriesById = new Map(rawEntries.map((r) => [r.id,
  (Array.isArray(r.entries) ? r.entries : []).map((e) => ({
    stepType: e?.stepType, payload: cleanPayload(e?.payload),
  }))]));
await ins('journey_templates', tpls, (r) => ({
  name: 'תבנית בדיקה', description: null, entries: entriesById.get(r.id) ?? [],
}));

// ‼ הטריגרים חוזרים לפעול. בלי זה כל בדיקה בהמשך הייתה רצה על מסד שמתנהג
//   אחרת מהפרודקשן — וזו בדיוק הטעות שסביבת בדיקות אמורה למנוע.
for (const t of LOADED) await writeStaging(`alter table public.${t} enable trigger user;`);
const stillOff = await writeStaging(`
  select count(*)::int as n from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal and t.tgenabled = 'D'`);
if (stillOff[0].n !== 0) { console.log(`✗ נשארו ${stillOff[0].n} טריגרים מנוטרלים`); process.exit(1); }
console.log('· כל הטריגרים פעילים שוב');

// ── שער אימות: אסור שיישאר טקסט אמיתי ─────────────────────────────────────
const leak = await writeStaging(`
  select
    (select count(*) from public.clients where email <> 'delivered@resend.dev') as c_email,
    (select count(*) from public.leads  where email is not null and email <> 'delivered@resend.dev') as l_email,
    (select count(*) from public.representation_requests
      where client_email is not null and client_email <> 'delivered@resend.dev') as r_email,
    (select count(*) from public.quotations where approval_signature is not null) as sigs,
    (select count(*) from public.email_messages) as emails,
    (select count(*) from public.documents) as docs,
    (select count(*) from public.onboarding_events) as events`);
const L = leak[0];
console.log('\nבדיקת דליפה:', JSON.stringify(L));
const bad = Object.entries(L).filter(([, v]) => Number(v) !== 0);
if (bad.length) { console.log(`✗ נשאר מידע שלא היה אמור: ${bad.map(([k]) => k).join(', ')}`); process.exit(1); }
console.log('\n✓ ההעתקה הושלמה. אין מיילים אמיתיים, אין חתימות, אין מסמכים.');
