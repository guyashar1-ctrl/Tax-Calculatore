// paperlessSession.mjs — החלון הייעודי של פייפרלס, והניווט בו.
// אותו דפוס כמו btlSession.mjs: חלון, פרופיל ופורט ניפוי משלו (9224).
//
// ‼ העובד לא מקליד כאן פרטי כניסה ולא קוד. הכניסה לפייפרלס היא מייל + קוד לנייד,
// והרו"ח עושה אותה בעצמו בחלון הזה. העובד רק מזהה אם החלון מחובר.
//
// ‼ נצפה חי 26.10.2026 (worker/test/fixtures/paperless-2026-10-26/README.md):
//   · שני הקשרים באותו חלון: «המשרד» (רשימת העוסקים, כרטיס עוסק) ו«העסק של
//     המשרד» (עסקאות ← ריטיינר). מעבר = הגדרות ← החלפת משתמש ← הכרטיס ←
//     «המשך» (‎/users/account/loginas/<id>‎), וחזרה = «חזרה».
//   · ‼ דף שאינו שייך להקשר (למשל ‎/admin/retainer‎ בהקשר המשרד) מחזיר 401
//     והאפליקציה **מנתקת את הכניסה**. לכן אין כאן goto לכתובת פנימית — רק
//     ניווט בתפריט, ורענון של דף שכבר נטען באותו הקשר.
//   · הנתונים נקראים מהתשובות שהאפליקציה עצמה מקבלת (page.waitForResponse) —
//     העובד לא נוגע באסימוני הכניסה ולא פונה לשרת בעצמו.

import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
import { findChromeExe } from './browserSession.mjs';

const CDP_URL = 'http://localhost:9224';
const APP_HOST = 'www.paperless.tax';
const API_HOST = 'https://api.paperless.tax';
const LOGIN_URL = 'https://home.paperless.tax/login';

const PROFILE_DIR = resolve(
  process.env.LOCALAPPDATA || process.env.HOME || '.',
  'PIVO', 'paperless-chrome-profile',
);

export function launchDedicatedPaperlessChrome() {
  const exe = findChromeExe();
  if (!exe) return { ok: false, reason: 'chrome_not_found' };
  if (!existsSync(PROFILE_DIR)) mkdirSync(PROFILE_DIR, { recursive: true });
  const child = spawn(exe, [
    '--remote-debugging-port=9224',
    `--user-data-dir=${PROFILE_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    LOGIN_URL,
  ], { detached: true, stdio: 'ignore' });
  child.unref();
  return { ok: true };
}

/** «התנתקות» — רק לפי נתיב הפרופיל, כדי שלעולם לא ייסגר Chrome אחר. */
export function closeDedicatedPaperlessChrome() {
  const ps =
    `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | ` +
    `Where-Object { $_.CommandLine -like '*paperless-chrome-profile*' } | ` +
    `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  try {
    execFileSync('powershell', ['-NoProfile', '-Command', ps], { timeout: 15000, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export async function isPaperlessDebugUp() {
  try {
    const res = await fetch(`${CDP_URL}/json/version`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function attachPaperless() {
  if (!(await isPaperlessDebugUp())) return { ok: false, reason: 'not_running' };
  try {
    const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 5000 });
    const context = browser.contexts()[0];
    if (!context) { await detachPaperless(browser); return { ok: false, reason: 'no_context' }; }
    return { ok: true, browser, context };
  } catch (e) {
    return { ok: false, reason: 'blocked', detail: String(e?.message ?? e).slice(0, 200) };
  }
}

export async function detachPaperless(browser) {
  try { await browser?.close(); } catch { /* כבר נסגר */ }
}

/** הלשונית של האפליקציה; אחרת לשונית הכניסה; אחרת חדשה על מסך הכניסה. */
export async function pickPaperlessPage(context) {
  const pages = context.pages();
  const app = pages.find(p => new URL(p.url(), 'about:blank').host === APP_HOST);
  if (app) return app;
  const login = pages.find(p => p.url().startsWith('https://home.paperless.tax'));
  if (login) return login;
  const page = await context.newPage();
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  return page;
}

/** מחובר = לשונית האפליקציה על ‎/admin/…‎ (לא מסך הכניסה). */
export function classifyPaperlessUrl(href) {
  try {
    const u = new URL(href);
    return { connected: u.host === APP_HOST && u.pathname.startsWith('/admin') };
  } catch {
    return { connected: false };
  }
}

export async function focusPaperlessWindow(page) {
  await page.bringToFront().catch(() => {});
}

// ── קריאת תשובות האפליקציה ──────────────────────────────────────────────────

/** מחכה לתשובת API שהאפליקציה מבקשת בעקבות `action`. מחזיר את ה-JSON. */
export async function apiAfter(page, pathPrefix, action, { timeout = 20000 } = {}) {
  const wait = page.waitForResponse(
    r => r.url().startsWith(`${API_HOST}${pathPrefix}`) && r.request().method() === 'GET',
    { timeout },
  );
  await action();
  const res = await wait;
  if (res.status() === 401) throw Object.assign(new Error('paperless_unauthorized'), { code: 'paperless_unauthorized' });
  return res.json();
}

async function dismissModals(page) {
  for (let i = 0; i < 3 && await page.locator('.modal.show').count(); i++) {
    const x = page.locator('.modal.show button[title="יציאה"]').first();
    if (await x.count()) await x.click().catch(() => {}); else await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
}

/** הפרמטרים של המשתמש הנוכחי — מרענון של הדף הנוכחי (שכבר נטען באותו הקשר). */
export async function readParams(page) {
  await dismissModals(page);
  return apiAfter(page, '/users/get/params', () => page.reload({ waitUntil: 'domcontentloaded' }));
}

/** הקשר המשרד: משתמש מסוג משרד, עם רשימת העסקים שאפשר לעבור אליהם. */
export const isOfficeParams = (p) => Number(p?.iUserType) === 1 && !!p?.dUsers && typeof p.dUsers === 'object';

export async function ensureOffice(page, params) {
  if (isOfficeParams(params)) return params;
  await dismissModals(page);
  const back = page.getByText('חזרה', { exact: false }).first();
  const next = await apiAfter(page, '/users/get/params', () => back.click({ timeout: 8000 }));
  if (!isOfficeParams(next)) throw new Error('paperless_office_context_failed');
  return next;
}

/**
 * מעבר לעסק של המשרד (שם הריטיינר). ‼ פעולת הקשר בלבד — אותה לחיצה שגיא עושה
 * («החלפת משתמש» ← «המשך»); לא משנה נתונים.
 */
export async function ensureBusiness(page, params) {
  if (params && !isOfficeParams(params) && params.sID) return params;
  const office = await ensureOffice(page, params);
  const [bizId, bizName] = Object.entries(office.dUsers)[0] ?? [];
  if (!bizId) throw new Error('paperless_no_business_to_switch');
  await dismissModals(page);
  // מתוך כרטיס עוסק תפריט המשרד מוסתר — חוזרים לרשימת העוסקים (דף של אותו הקשר).
  if (!(await page.getByText('הגדרות', { exact: true }).first().isVisible().catch(() => false))) {
    await page.goto(`https://${APP_HOST}/admin/users`, { waitUntil: 'domcontentloaded' });
    await page.getByText('הגדרות', { exact: true }).first().waitFor({ timeout: 15000 });
  }
  await page.getByText('הגדרות', { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(1200);
  await page.getByText('החלפת משתמש', { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(1200);
  await page.locator('mdb-card-body.pointer', { hasText: String(bizName) }).first().click({ timeout: 8000 });
  await page.locator('.modal.show button', { hasText: 'המשך' }).first().waitFor({ timeout: 8000 });
  const wait = page.waitForResponse(r => r.url().startsWith(`${API_HOST}/users/account/loginas/${bizId}`), { timeout: 20000 });
  const paramsWait = page.waitForResponse(r => r.url().startsWith(`${API_HOST}/users/get/params`), { timeout: 25000 });
  await page.locator('.modal.show button', { hasText: 'המשך' }).first().click();
  await wait;
  const next = await (await paramsWait).json();
  if (isOfficeParams(next)) throw new Error('paperless_business_context_failed');
  return next;
}

// ── הריטיינר (בעסק של המשרד) ────────────────────────────────────────────────

/** פותח את הריטיינר ומחזיר את הלקוחות, החיובים והשורות בטבלה. */
export async function openRetainer(page) {
  await dismissModals(page);
  const onRetainer = new URL(page.url()).pathname.startsWith('/admin/retainer');
  const feesWait = page.waitForResponse(r => r.url().startsWith(`${API_HOST}/fees/get`), { timeout: 25000 });
  const clients = await apiAfter(page, '/clients/all/', async () => {
    if (onRetainer) {
      await page.reload({ waitUntil: 'domcontentloaded' });
    } else {
      await page.getByText('עסקאות', { exact: true }).first().click({ timeout: 8000 });
      await page.waitForTimeout(800);
      await page.getByText('ריטיינר', { exact: true }).first().click({ timeout: 8000 });
    }
  }, { timeout: 25000 });
  const feesRes = await feesWait;
  const fees = (await feesRes.json())?.fees ?? [];
  await page.locator('tr', { hasText: 'סכום לפני מעמ' }).first().waitFor({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  return { clients: Array.isArray(clients) ? clients : [], fees: Array.isArray(fees) ? fees : [] };
}

/** שורת הלקוח בטבלה לפי השם המוצג. שתי שורות באותו שם ⇒ null + ambiguous. */
export async function retainerRow(page, name) {
  const rows = page.locator('tbody tr').filter({ has: page.locator('td:nth-child(2)', { hasText: name }) });
  const n = await rows.count();
  let exact = [];
  for (let i = 0; i < n; i++) {
    const t = (await rows.nth(i).locator('td').nth(1).innerText()).trim();
    if (t === String(name).trim()) exact.push(rows.nth(i));
  }
  if (exact.length !== 1) return { row: null, ambiguous: exact.length > 1 };
  const row = exact[0];
  const cells = row.locator('td');
  return {
    row,
    paymentLabel: (await cells.nth(2).innerText()).trim(),
    withVatText: (await cells.nth(7).innerText()).trim(),
  };
}

/** «משיכת עוסקים» — מוסיף לריטיינר את כל העוסקים של המשרד שעוד לא בו. */
export async function pullDealers(page) {
  const btn = page.locator('a.btn-floating', { has: page.locator('p', { hasText: 'משיכת עוסקים' }) }).first();
  await btn.dispatchEvent('click');
  const ok = page.locator('.modal.show button', { hasText: 'המשך' }).first();
  await ok.waitFor({ timeout: 10000 });
  await ok.click();
  // «נא להמתין במבצלת לסיום הפעולה» ואחר כך הודעת סיום — עד שאין חלון פתוח.
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1000);
    const open = page.locator('.modal.show');
    if (!(await open.count())) break;
    const cont = page.locator('.modal.show button', { hasText: 'המשך' }).first();
    if (await cont.count() && await cont.isVisible().catch(() => false)) await cont.click().catch(() => {});
  }
}

async function confirmModal(page) {
  await page.locator('.modal.show button', { hasText: 'המשך' }).first().click({ timeout: 8000 });
  for (let i = 0; i < 20 && await page.locator('.modal.show').count(); i++) await page.waitForTimeout(500);
  if (await page.locator('.modal.show').count()) throw new Error('paperless_modal_did_not_close');
}

/** אמצעי תשלום ← «סליקת אשראי». */
export async function setCreditPayment(rowHandle) {
  const page = rowHandle.page();
  await rowHandle.locator('td').nth(2).click();
  await page.locator('.modal.show mdb-select [role=listbox]').first().click({ timeout: 8000 });
  await page.locator('mdb-select-dropdown li, .dropdown-content li', { hasText: 'סליקת אשראי' }).first().click({ timeout: 8000 });
  await confirmModal(page);
}

/** «קביעת סכום לגבייה» — לפני מע״מ וכולל מע״מ, כמו בהסכם. */
export async function setRetainerAmount(rowHandle, beforeVat, withVat) {
  const page = rowHandle.page();
  const cell = rowHandle.locator('td').nth(6);
  const span = cell.locator('span[title="עדכון סכום לגבייה"]');
  if (await span.count()) await span.first().click(); else await cell.locator('*').last().click();
  await page.locator('.modal.show #iPriceWO').waitFor({ timeout: 8000 });
  await page.locator('.modal.show #iPriceWO').fill(String(beforeVat));
  await page.locator('.modal.show #iPriceWI').fill(String(withVat));
  await confirmModal(page);
}

// ── העוסק (בהקשר המשרד) ─────────────────────────────────────────────────────

/**
 * רשימת העוסקים של המשרד. ‼ רק בהקשר המשרד (ensureOffice קודם): מתוך כרטיס עוסק
 * תפריט המשרד מוסתר, ואז חוזרים בכתובת הרשימה — דף של אותו הקשר, לא 401.
 */
export async function readDealers(page) {
  await dismissModals(page);
  const list = await apiAfter(page, '/users/get/users', async () => {
    const menu = page.getByText('עוסקים', { exact: true }).first();
    if (new URL(page.url()).pathname === '/admin/users') await page.reload({ waitUntil: 'domcontentloaded' });
    else if (await menu.isVisible().catch(() => false)) await menu.click({ timeout: 8000 });
    else await page.goto(`https://${APP_HOST}/admin/users`, { waitUntil: 'domcontentloaded' });
  });
  return Array.isArray(list) ? list : [];
}

/** פותח כרטיס עוסק מהרשימה ומחזיר את פרטיו (‎/users/get/u2/<id>‎). */
export async function openDealer(page, dealer) {
  const row = page.locator('tbody tr', { has: page.locator('td', { hasText: dealer.sFamilyName }) })
    .filter({ has: page.locator('td', { hasText: dealer.sFirstName }) }).first();
  return apiAfter(page, `/users/get/u2/${dealer.sID}`, () => row.locator('td').nth(1).click({ timeout: 8000 }));
}

/** עורך שדה בכרטיס עוסק («נתונים כלליים»): ‎#sBusinessNumber‎ / ‎#sBusinessName‎. */
export async function editDealerField(page, title, inputId, value) {
  await page.getByText('כרטיס עסק', { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(800);
  await page.getByText('נתונים כלליים', { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(800);
  const card = page.locator('app-info-card', { has: page.locator('mdb-card-title', { hasText: title }) }).first();
  await card.locator('button:has(i.fa-pen)').first().click({ timeout: 8000 });
  const input = page.locator(`.modal.show #${inputId}`);
  await input.waitFor({ timeout: 8000 });
  await input.fill(String(value));
  await confirmModal(page);
  await page.waitForTimeout(800);
  return (await card.innerText()).includes(String(value));
}
