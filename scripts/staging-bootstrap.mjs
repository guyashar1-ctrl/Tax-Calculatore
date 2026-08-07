#!/usr/bin/env node
/**
 * staging-bootstrap.mjs — יוצר את המשתמש והפרופיל של סביבת הבדיקות, וכותב
 * .env.staging עם המפתחות שלה.
 *
 * ‼ שום סוד מהפרודקשן אינו מועתק. סיסמת המשתמש נוצרת כאן באקראי, והמפתחות
 * נשלפים מפרויקט הבדיקות עצמו. הפרופיל הוא משרד בדיוני — לא הפרטים של גיא.
 *
 * ‼ בלי שורה פעילה ב-authorized_users כל מסך יעלה ריק: כלל ההרשאה המגביל
 * (require_authorized) חוסם כל טבלה. זה נראה כמו באג במסך והוא לא.
 */
import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ROOT, STAGING_REF, writeStaging, api } from './staging-lib.mjs';

const EMAIL = 'staging@pivo.test';
const PASSWORD = randomBytes(18).toString('base64url');

console.log(`סביבת בדיקות: ${STAGING_REF}`);

// ── מפתחות הפרויקט (של ה-staging בלבד) ──────────────────────────────────────
const keys = await api(`/projects/${STAGING_REF}/api-keys?reveal=true`);
const pick = (...names) => {
  for (const n of names) {
    const k = keys.find((x) => x.name === n || x.type === n);
    if (k?.api_key) return k.api_key;
  }
  return null;
};
const ANON = pick('anon', 'publishable');
const SERVICE = pick('service_role', 'secret');
if (!ANON || !SERVICE) {
  console.error('✋ לא נמצאו מפתחות. שמות שהוחזרו:', keys.map((k) => `${k.name}/${k.type}`).join(', '));
  process.exit(1);
}
const URL_BASE = `https://${STAGING_REF}.supabase.co`;

// ── המשתמש ──────────────────────────────────────────────────────────────────
const res = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
});
const body = await res.json();
let userId = body?.id;
if (!res.ok) {
  // כבר קיים — משנים לו סיסמה כדי ש-.env.staging יהיה תקף.
  const list = await fetch(`${URL_BASE}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  }).then((r) => r.json());
  const found = (list?.users || []).find((u) => u.email === EMAIL);
  if (!found) { console.error('✋ יצירת המשתמש נכשלה:', JSON.stringify(body).slice(0, 300)); process.exit(1); }
  userId = found.id;
  await fetch(`${URL_BASE}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD, email_confirm: true }),
  });
  console.log('· המשתמש כבר היה קיים — הסיסמה עודכנה.');
} else {
  console.log('· משתמש נוצר.');
}

// ── רשימת המורשים והפרופיל ──────────────────────────────────────────────────
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
await writeStaging(`
  insert into public.authorized_users (email, role, active, note)
  values (${q(EMAIL)}, 'owner', true, 'משתמש סביבת הבדיקות')
  on conflict (email) do update set active = true;`);

// ‼ משרד בדיוני. שם המשרד, המייל והטלפון אינם של גיא — סביבת הבדיקות לא
//   אמורה להכיל את זהותו יותר מששהיא מכילה את זהות הלקוחות.
await writeStaging(`
  insert into public.profiles (id, email, full_name, firm_name, legal_name, phone, address,
                               representative_number, representative_type, branding, communication, settings)
  values ('${userId}', ${q(EMAIL)}, 'רו״ח בדיקה', 'משרד בדיקות PIVO', 'משרד בדיקות PIVO בע״מ',
          '03-0000000', 'רחוב הבדיקה 1, תל אביב', '000000000', 'accountant',
          '{}'::jsonb,
          jsonb_build_object('senderEmail','delivered@resend.dev','replyTo','delivered@resend.dev'),
          '{}'::jsonb)
  on conflict (id) do update set
    email = excluded.email, firm_name = excluded.firm_name,
    communication = excluded.communication;`);
console.log('· פרופיל ורשימת מורשים מוכנים.');

// ── .env.staging ────────────────────────────────────────────────────────────
const envPath = resolve(ROOT, '.env.staging');
writeFileSync(envPath, [
  '# סביבת הבדיקות בלבד. הקובץ אינו נכנס לגיט.',
  '# נוצר ע"י scripts/staging-bootstrap.mjs — אין כאן שום סוד מהפרודקשן.',
  `VITE_SUPABASE_URL=${URL_BASE}`,
  `VITE_SUPABASE_ANON_KEY=${ANON}`,
  `SUPABASE_SERVICE_ROLE_KEY=${SERVICE}`,
  'VITE_DEV_AUTO_LOGIN=true',
  `VITE_DEV_USER_EMAIL=${EMAIL}`,
  `VITE_DEV_USER_PASSWORD=${PASSWORD}`,
  '# ‼ ריק בכוונה: אין להזריק לקוחות דמה מעל נתוני ה-staging.',
  'VITE_DEV_BYPASS_AUTHZ=',
  '',
].join('\n'), 'utf8');
console.log(`· נכתב ${envPath}`);

writeFileSync(resolve(ROOT, 'STAGING_USER_ID'), userId, 'utf8');
console.log(`\n✓ מוכן. מזהה המשתמש נשמר ל-STAGING_USER_ID (זמני, לא בגיט).`);
if (!existsSync(resolve(ROOT, '.env.staging'))) process.exit(1);
