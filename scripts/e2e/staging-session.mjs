/**
 * staging-session.mjs — הכנה לבדיקת הדפדפן מול staging (scripts/e2e/collection-flows.mjs --target=staging).
 *
 * ‼ בלי סיסמה: קישור כניסה חד-פעמי למשתמש הבדיקה של staging (staging@pivo.test) נוצר במפתח השירות של staging,
 *   והסשן נכתב לאחסון הדפדפן לפני שהאפליקציה עולה — כמו אחרי כניסה רגילה. אין כאן הקלדה של סיסמה בשום טופס.
 * ‼ לקוח בדיקה חדש לכל ריצה (QAE2E…), עם בן/בת זוג, מעסיק ונכס מושכר — ולקוח שני לבדיקת בידוד. בסוף: מחיקה מלאה
 *   (כל הטבלאות עם client_id), מחיקת קובצי הבדיקה מהאחסון, וסריקת שאריות.
 * ‼ שער בטיחות: כל פנייה שאינה ל-staging נעצרת. הסודות נקראים מתיקייה מחוץ לריפו (STAGING_ENV_DIR) ולא נכתבים לשום מקום.
 *
 * STAGING_ENV_DIR — תיקייה שיש בה .env.staging (כתובת, מפתח ציבורי, מפתח שירות) ו-.env.local (SUPABASE_ACCESS_TOKEN).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING = 'evdfxjqrkgugssfrdoxd';
const PROD = 'uoweoqtuiettozagwgdw';
const OFFICE = 'ca158d52-5ad7-47f5-b228-4b7703978b84';      // staging@pivo.test
const OFFICE_EMAIL = 'staging@pivo.test';

const readEnv = (file) => Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/)
  .map(l => l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));

export async function prepare() {
  const dir = process.env.STAGING_ENV_DIR;
  if (!dir) throw new Error('STAGING_ENV_DIR חסר — תיקייה עם .env.staging ו-.env.local (מחוץ לריפו)');
  const st = readEnv(join(dir, '.env.staging')), loc = readEnv(join(dir, '.env.local'));
  const URL = st.VITE_SUPABASE_URL, ANON = st.VITE_SUPABASE_ANON_KEY, SERVICE = st.SUPABASE_SERVICE_ROLE_KEY, TOKEN = loc.SUPABASE_ACCESS_TOKEN;
  if (!URL?.includes(STAGING) || URL.includes(PROD)) throw new Error('✋ .env.staging אינו staging');
  const BASE = (process.argv.find(a => a.startsWith('--base='))?.split('=')[1]) ?? 'http://localhost:4744';

  async function sql(query) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${STAGING}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
    const t = await r.text();
    if (!r.ok) throw new Error(`sql ${r.status}: ${t.slice(0, 300)}`);
    return t ? JSON.parse(t) : [];
  }
  const lit = (v) => `$q$${typeof v === 'string' ? v : JSON.stringify(v)}$q$`;
  const asOffice = async (expr) => (await sql(`begin; set local role authenticated;
    select set_config('request.jwt.claims', ${lit({ sub: OFFICE, role: 'authenticated' })}, true);
    select (${expr}) as r; commit;`))[0]?.r;

  // ── לקוחות בדיקה ──
  const RUN = `QAE2E${Date.now().toString(36).toUpperCase()}`;
  const mk = async (last, extra) => (await sql(`insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type,
      spouse_first_name, employers, properties, city)
    values (replace(gen_random_uuid()::text,'-',''), '${OFFICE}', 'דוד', '${last}', 'delivered@resend.dev', 'active', 'married', 'licensed',
      'רחל', ${lit(extra.employers)}::jsonb, ${lit(extra.properties)}::jsonb, 'חיפה') returning id`))[0].id;
  const clientId = await mk(`${RUN}-A`, {
    employers: [{ id: 'e1', name: 'חברת הייטק בע״מ' }, { id: 'e2', name: 'משרד החינוך', belongsToSpouse: true }],
    properties: [{ id: 'p1', address: 'הרצל 12', city: 'חיפה', isRented: true }],
  });
  const otherClientId = await mk(`${RUN}-B`, { employers: [], properties: [] });
  // שאלון הקליטה הישן, פתוח ומפורסם — כמו אצל לקוח שהמחולל יצר לו אותו (לבדיקת «החלף בקליטה»)
  await sql(`insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, payload, published_at)
    values ('${OFFICE}', '${clientId}', 'intake_questionnaire', 'internal', 'person', 'waiting_client', 'client', '{}'::jsonb, now())`);
  // הפרסום טובע לקוח טוקן לשאלון הישן (173) — הקישור שהלקוח קיבל במייל
  const intakeTok = (await sql(`select intake_token from public.clients where id = '${clientId}'`))[0]?.intake_token;
  // שאלון ישן גם ללקוח השני — שלא יוחלף (בודקים שהוא ממשיך לעבוד כרגיל)
  await sql(`insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, payload, published_at)
    values ('${OFFICE}', '${otherClientId}', 'intake_questionnaire', 'internal', 'person', 'waiting_client', 'client', '{}'::jsonb, now())`);
  const intakeTokOther = (await sql(`select intake_token from public.clients where id = '${otherClientId}'`))[0]?.intake_token;
  const token = await asOffice(`public.mint_portal_token('${clientId}')`);
  if (typeof token !== 'string' || token.length < 10) throw new Error(`mint_portal_token נכשל: ${JSON.stringify(token)}`);

  // ── סשן בלי סיסמה: קישור כניסה חד-פעמי (מפתח שירות) → אימות → סשן ──
  const gl = await fetch(`${URL}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email: OFFICE_EMAIL }) });
  const glj = await gl.json();
  const hashed = glj?.properties?.hashed_token ?? glj?.hashed_token;
  if (!hashed) throw new Error(`generate_link: ${gl.status} ${JSON.stringify(glj).slice(0, 200)}`);
  const vr = await fetch(`${URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: hashed }) });
  const session = await vr.json();
  if (!session?.access_token) throw new Error(`verify: ${vr.status} ${JSON.stringify(session).slice(0, 200)}`);
  const storageKey = `sb-${STAGING}-auth-token`;
  const stored = JSON.stringify({ ...session, expires_at: session.expires_at ?? Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600) });

  const tables = async () => (await sql(`select table_name, column_name from information_schema.columns where table_schema='public' and column_name in ('client_id','linked_client_id') and table_name not like 'v\\_%'`));
  async function cleanup() {
    const ids = [clientId, otherClientId].map(c => `'${c}'`).join(',');
    const docs = await sql(`select storage_path from public.documents where client_id in (${ids})`);
    await sql(`
      -- ‼ 17.10.2026 (257): שורות מקור מצביעות למסמך — העובדות לפני הראיות
      delete from public.tax_year_facts where client_id in (${ids});
      delete from public.tax_evidence where client_id in (${ids});
      delete from public.tax_card_transfers where client_id in (${ids});
      delete from public.tax_info_asks where client_id in (${ids});
      delete from public.tax_fact_changes where client_id in (${ids});
      delete from public.accountant_notifications where client_id in (${ids});
      delete from public.onboarding_events where step_id in (select id from public.onboarding_steps where client_id in (${ids}));
      delete from public.client_notice_items where step_id in (select id from public.onboarding_steps where client_id in (${ids}));
      delete from public.client_step_notice_state where step_id in (select id from public.onboarding_steps where client_id in (${ids}));
      delete from public.client_notices where client_id in (${ids});
      delete from public.email_messages where client_id in (${ids});
      delete from public.documents where client_id in (${ids});
      delete from public.annual_report_answers where session_id in (select id from public.annual_report_sessions where client_id in (${ids}));
      delete from public.annual_report_sessions where client_id in (${ids});
      delete from public.onboarding_steps where client_id in (${ids});
      delete from public.clients where id in (${ids});`);
    const paths = docs.map(d => d.storage_path).filter(Boolean);
    let storageLeft = 0;
    if (paths.length) {
      const r = await fetch(`${URL}/storage/v1/object/client-documents`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) });
      if (!r.ok) storageLeft = paths.length;
    }
    let left = 0;
    for (const t of await tables()) {
      const n = (await sql(`select count(*)::int n from public."${t.table_name}" where "${t.column_name}" in (${ids})`).catch(() => [{ n: 0 }]))[0]?.n ?? 0;
      if (n) { left += n; console.log(`    שארית: ${t.table_name}.${t.column_name} = ${n}`); }
      await new Promise(r => setTimeout(r, 120)); // ‼ קצב: ה-API של Supabase מגביל בקשות (ThrottlerException)
    }
    return { left, storageLeft, files: paths.length };
  }

  return {
    clientId, otherClientId, clientName: 'דוד', spouseName: 'רחל', run: RUN,
    officeUrl: (id, tab = 'taxfile') => `${BASE}/#/client/${id}/${tab}`,
    officeUrlKeep: (id, tab = 'taxfile') => `${BASE}/#/client/${id}/${tab}`,
    portalUrl: () => `${BASE}/?portal=${token}`,
    intakeUrl: () => `${BASE}/?intake=${intakeTok}`,
    intakeUrlOther: () => `${BASE}/?intake=${intakeTokOther}`,
    // ‼ פעם אחת לכל פרופיל: הזרקה בכל טעינה החזירה אסימון רענון ישן אחרי שהאפליקציה רעננה — Supabase מזהה שימוש חוזר,
    //   מבטל את הסשן, ומתקבל 401 (נראה כשגיאת אפליקציה ואינו כזה).
    initContext: async (ctx) => { await ctx.addInitScript(([k, v]) => { try { if (!location.search.includes('portal=') && !localStorage.getItem(k)) localStorage.setItem(k, v); } catch { /* */ } }, [storageKey, stored]); },
    cleanup,
    sql,
    // קריאת קובץ מהאחסון בבדיקה (מפתח השירות של staging; לא נכתב לשום מקום)
    storageUrl: `${URL}/storage/v1`,
    serviceHeaders: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  };
}
