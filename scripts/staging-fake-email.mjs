#!/usr/bin/env node
/**
 * staging-fake-email.mjs — מתקין ב-staging ספק דואר מדומה שקולט מיילים.
 *
 *   1. מחיל supabase/staging-only/fake-email-provider.sql (טבלת test_captured_emails) ו-demo-schedule.sql
 *      («הרץ את התזמון עכשיו» להדגמה — במקום cron, ש-staging לא מריץ);
 *   2. פורס את fake-email-provider;
 *   3. מגדיר RESEND_API_URL בפרויקט — כל פונקציה ששולחת מייל קוראת אותו דרך
 *      resendEmailsUrl (שמתעלם ממנו בייצור);
 *   4. פורס מחדש את הפונקציות ששולחות מייל (כדי שיקראו את הכתובת).
 *
 * ‼ staging בלבד — היעד קבוע ב-STAGING_REF, אין דגל ייצור.
 *   שימוש:  node scripts/staging-fake-email.mjs [--no-deploy-senders]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, STAGING_REF, loadEnv, writeStaging } from './staging-lib.mjs';

const SENDERS = ['send-process-open-email', 'notify-accountant', 'send-onboarding-email', 'send-step-email',
  'representation-reminders', 'quotation-reminders', 'send-quotation-email', 'send-release-email',
  'send-apply-link-email', 'send-charge-payment-request-email'];
const token = loadEnv().SUPABASE_ACCESS_TOKEN;
const deploy = (fn) => execFileSync(process.execPath, [resolve(ROOT, 'scripts/deploy-edge-function.mjs'), 'staging', fn], { stdio: 'inherit' });

console.log(`יעד: ${STAGING_REF}`);
await writeStaging(readFileSync(resolve(ROOT, 'supabase/staging-only/fake-email-provider.sql'), 'utf8'));
await writeStaging(readFileSync(resolve(ROOT, 'supabase/staging-only/demo-schedule.sql'), 'utf8'));
console.log('✓ טבלת test_captured_emails · demo_run_schedule');
deploy('fake-email-provider');
const url = `https://${STAGING_REF}.supabase.co/functions/v1/fake-email-provider`;
const secretsApi = `https://api.supabase.com/v1/projects/${STAGING_REF}/secrets`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const existing = await (await fetch(secretsApi, { headers })).json();
const secrets = [{ name: 'RESEND_API_URL', value: url }];
// ‼ ל-staging אין מפתח Resend אמיתי. מפתח אקראי — הספק המדומה מזהה בו את הפונקציות
// שלנו, ו-Resend האמיתי היה דוחה אותו ממילא: אין דרך שמייל יצא מכאן לאדם.
if (!existing.some((s) => s.name === 'RESEND_API_KEY')) {
  secrets.push({ name: 'RESEND_API_KEY', value: `fake-staging-${crypto.randomUUID()}` });
}
const r = await fetch(secretsApi, { method: 'POST', headers, body: JSON.stringify(secrets) });
if (!r.ok) { console.error('✗ secrets', r.status, await r.text()); process.exit(1); }
console.log('✓ RESEND_API_URL →', url, secrets.length > 1 ? '· RESEND_API_KEY (מדומה) נוצר' : '');
if (!process.argv.includes('--no-deploy-senders')) for (const fn of SENDERS) deploy(fn);
console.log('✓ מוכן — מיילים ב-staging נקלטים ב-test_captured_emails');
