#!/usr/bin/env node
/**
 * setup-test-env.mjs — מקור האמת היחיד לסביבת הבדיקות (E2E).
 *
 * אחראי על: יצירת משתמש הבדיקה, שחזורו במקרה הצורך, והכנת ה-.env.local להתחברות.
 *
 * עקרונות:
 *  - DEV בלבד. מסרב לרוץ עם NODE_ENV=production.
 *  - ה-service_role נקרא אך ורק מ-.env.local ולעולם לא מודפס/נרשם.
 *  - idempotent: ניתן להריץ שוב ושוב. בודק קודם אם המשתמש קיים, יוצר רק אם לא.
 *  - פועל אך ורק על משתמש הבדיקה הייעודי (TEST_EMAIL). פעולות מחיקה מוגבלות
 *    לשורות של אותו משתמש בלבד, ודורשות אישור מפורש (--yes).
 *
 * שימוש:
 *   node scripts/setup-test-env.mjs              # ודא/שחזר משתמש בדיקה + כתוב פרטי כניסה
 *   node scripts/setup-test-env.mjs --status     # דווח אם המשתמש קיים
 *   node scripts/setup-test-env.mjs --reset-data --yes   # מחק את נתוני משתמש הבדיקה בלבד
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = resolve(ROOT, '.env.local');

// משתמש בדיקה ייעודי ומסומן בבירור — מבודד מהנתונים האמיתיים ע"י RLS (user_id משלו).
const TEST_EMAIL = 'e2e-test@firm.local';

// סדר מחיקה בטוח-FK (ילדים קודם). רק טבלאות עם user_id.
const E2E_TABLES = ['document_task_links', 'tasks', 'representation_requests', 'documents', 'cases', 'employees', 'clients'];

const args = process.argv.slice(2);
const has = (f) => args.includes(f);

function die(msg) { console.error('✋ ' + msg); process.exit(1); }

// ── הגנות ──
if (process.env.NODE_ENV === 'production') die('NODE_ENV=production — הסקריפט הזה ל-DEV בלבד.');
if (!existsSync(ENV_PATH)) die('.env.local לא נמצא: ' + ENV_PATH);

function parseEnv(text) {
  const map = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) map[m[1]] = m[2];
  }
  return map;
}

const env = parseEnv(readFileSync(ENV_PATH, 'utf8'));
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) die('VITE_SUPABASE_URL חסר ב-.env.local');
if (!SERVICE_ROLE) die('SUPABASE_SERVICE_ROLE_KEY חסר ב-.env.local — הדבק אותו מ-Supabase → Project Settings → API → service_role.');

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });

function genPassword() {
  return 'E2e-' + randomBytes(24).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 24) + '!';
}

async function findTestUser() {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email === TEST_EMAIL);
    if (u) return u;
    if (data.users.length < 200) return null;
  }
}

function upsertEnvVars(vars) {
  let text = readFileSync(ENV_PATH, 'utf8');
  for (const [k, v] of Object.entries(vars)) {
    const re = new RegExp('^' + k + '=.*$', 'm');
    if (re.test(text)) text = text.replace(re, `${k}=${v}`);
    else text = text.replace(/\s*$/, '') + `\n${k}=${v}`;
  }
  if (!text.endsWith('\n')) text += '\n';
  writeFileSync(ENV_PATH, text);
}

async function ensureUser() {
  console.log(`• פרויקט יעד: ${SUPABASE_URL}`);
  console.log(`• משתמש בדיקה: ${TEST_EMAIL}`);
  const existing = await findTestUser();
  const password = genPassword();
  let user;
  if (existing) {
    console.log('• המשתמש קיים → שחזור (אישור מייל + סנכרון סיסמה)');
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
    if (error) throw error;
    user = data.user;
  } else {
    console.log('• המשתמש לא קיים → יצירה');
    const { data, error } = await admin.auth.admin.createUser({ email: TEST_EMAIL, password, email_confirm: true, user_metadata: { e2e: true } });
    if (error) throw error;
    user = data.user;
  }
  upsertEnvVars({ VITE_DEV_AUTO_LOGIN: 'true', VITE_DEV_USER_EMAIL: TEST_EMAIL, VITE_DEV_USER_PASSWORD: password });
  console.log('✓ משתמש הבדיקה מוכן. פרטי הכניסה נכתבו ל-.env.local (הסיסמה לא מודפסת).');
  return user;
}

async function resetData(userId) {
  if (!has('--yes')) die('--reset-data הוא הרסני. הרץ שוב עם --yes לאישור (נמחקות רק שורות של משתמש הבדיקה).');
  for (const table of E2E_TABLES) {
    const { error, count } = await admin.from(table).delete({ count: 'exact' }).eq('user_id', userId);
    if (error) console.warn(`  ! ${table}: ${error.message}`);
    else console.log(`  - ${table}: נמחקו ${count ?? 0}`);
  }
  console.log('✓ נתוני משתמש הבדיקה אופסו.');
}

async function status() {
  const u = await findTestUser();
  console.log(u
    ? `✓ משתמש הבדיקה קיים (${TEST_EMAIL}, id ${u.id}, מאושר: ${!!u.email_confirmed_at})`
    : `✗ משתמש הבדיקה חסר (${TEST_EMAIL}) — הרץ ללא דגלים כדי ליצור.`);
}

try {
  if (has('--status')) { await status(); process.exit(0); }
  const user = await ensureUser();
  if (has('--reset-data')) await resetData(user.id);
  process.exit(0);
} catch (e) {
  console.error('✖ ההקמה נכשלה:', e?.message || e);
  process.exit(1);
}
