// gmf413Session.mjs — מסך 413 בדפדפן: פתיחה, קריאת מצב, הדפסת העתק, והנפקה.
//
// ‼ נצפה חי 25.10.2026 (ראה gmf413.mjs). הכלל: קוראים מתשובות ה-JSON של המסך עצמו, ולוחצים
// רק על מה שהמסך מציג לאדם. ‼ פנייה לשרת ישירות אינה אפשרית — כל בקשה נושאת אסימון
// (shaam-auth) שהמסך מחשב.
//
// ‼ מה משנה מצב ברשות ומה לא:
//   · כרטיס, «הדפסת העתק אישור», «הנפקת אישור» (פתיחת הטופס), «בדיקה» (Pch/chkIsr) — קריאה בלבד.
//   · «עדכון» בחלונית שאחרי «בדיקה» (Pidk/IdkunIsr) — **ההנפקה עצמה**. לפניו markExternalAttempt.
import { GMF_URL, pickPageOn, settlePage, snapPage, readGmfBlockingModal } from './browserSession.mjs';

export const GMF_413_URL = 'https://shaam.taxes.gov.il/gmf-413/';
const PATH_413 = '/gmf-413';
const ENTRY_PATH = '/gmf-413/main/home';
const MENU_PATH = '/gmf-413/main/TafritHafaka/1';
const FORM_PATH = '/gmf-413/main/Hafaka';
const DONE_PATH = '/gmf-413/main/TafritHafaka/2';
const API_ISHUR = '/gmf413Api/api/Ptik/GetIshur';
const API_ISSUE = '/gmf413Api/api/Pidk/IdkunIsr';
const API_PRINT = '/gmfHdpsIsrApi/api/Phdps/hdpsIsr';
const ENTITY_INPUT = '#mezahe';
const ENTITY_RADIO = '#rbYeshut';
const MENU_ENTRY_LINK = '#menu-link-1';

/** כותרת הכרטיס במסך הכניסה ו-kodPeula שהוא שולח. */
const CARDS = {
  withholding: { title: 'הקטנות', kodPeula: 1 },
  bookkeeping: { title: 'גופים', kodPeula: 2 },
};

const within = (p, ms) => {
  let t;
  return Promise.race([p, new Promise((r) => { t = setTimeout(() => r(null), ms); })]).finally(() => clearTimeout(t));
};
const pathOf = (page) => { try { return new URL(page.url()).pathname; } catch { return '/'; } };

function captureJson(page, path, { timeout = 40000, match } = {}) {
  return page.waitForResponse((r) => {
    try {
      if (new URL(r.url()).pathname !== path) return false;
      return match ? match(r.request().postData() ?? '') : true;
    } catch { return false; }
  }, { timeout })
    .then(async (r) => ({ status: r.status(), body: await r.json().catch(() => null) }))
    .catch(() => null);
}

/** טקסט השגיאה שהמסך מציג (התיבה האדומה), או ''. */
async function errorText(page) {
  return page.evaluate(() => {
    const vis = (e) => !!e && e.offsetParent !== null;
    const boxes = [...document.querySelectorAll('[class*="alert-i--error"], [role="alert"]')].filter(vis);
    return boxes.map((b) => (b.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' · ');
  }).catch(() => '');
}

/** חלונית «כדאי לדעת» (עסק חדש וכו׳) חוסמת לחיצות — סוגרים ב«הבנתי». */
async function dismissInfoModal(page) {
  const btn = page.locator('ngb-modal-window button:has-text("הבנתי")').first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}

/**
 * לשונית ל-413: לשונית שכבר על 413, אחרת **לשונית חדשה** באותו חלון (אותו סשן).
 * ‼ לא מנווטים את לשונית GMF של הקריאה: היא נשארת על 181, וכך הקריאה הבאה חוסכת
 * מעבר אפליקציה (20–35 ש׳). המתקשר סוגר את הלשונית כש-created.
 * ‼ מסך הכניסה של GMF / קוד חד-פעמי ⇒ gmf_not_ready (לא נוגעים ברצף כניסה).
 */
export async function open413(page) {
  const context = page.context();
  let work = await pickPageOn(context, PATH_413, null);
  let created = false;
  if (!work) {
    work = await context.newPage();
    created = true;
    await work.goto(GMF_413_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  }
  if (!pathOf(work).startsWith(ENTRY_PATH)) {
    const link = work.locator(MENU_ENTRY_LINK).first();
    await dismissInfoModal(work);
    if (await link.isVisible().catch(() => false)) await link.click({ timeout: 8000 }).catch(() => {});
    else await work.goto(GMF_413_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  }
  await work.waitForSelector(ENTITY_INPUT, { timeout: 30000 }).catch(() => {});
  const s = await settlePage(work, { idleMs: 10000, watchMs: 1500 });
  if (s.hasPasswordField || !s.pathname.startsWith(PATH_413)) {
    if (created) await work.close().catch(() => {});
    return { ok: false, reason: 'gmf_not_ready', pathname: s.pathname };
  }
  if (!(await work.$(ENTITY_INPUT))) {
    if (created) await work.close().catch(() => {});
    return { ok: false, reason: 'entry_screen_missing', pathname: s.pathname };
  }
  return { ok: true, page: work, created };
}

/**
 * מסך הכניסה ⇒ כרטיס. מחזיר את תשובת GetIshur.
 * ‼ המספר נכתב מחדש ומאומת בכל פעם; התשובה נבדקת שהיא של אותו מספר ושל אותו סוג.
 */
export async function openCard(work, entity, kind) {
  const card = CARDS[kind];
  if (!pathOf(work).startsWith(ENTRY_PATH)) {
    const back = await open413(work);
    if (!back.ok) return back;
  }
  const modal = await readGmfBlockingModal(work);
  if (modal.blocked) return { ok: false, reason: 'blocked_by_modal', modalTitle: modal.title };
  if (!(await work.isChecked(ENTITY_RADIO).catch(() => false))) {
    await work.locator(`label[for="${ENTITY_RADIO.slice(1)}"]`).first().click({ timeout: 5000 })
      .catch(() => work.locator(ENTITY_RADIO).check({ force: true, timeout: 5000 }).catch(() => {}));
  }
  await work.fill(ENTITY_INPUT, '');
  await work.fill(ENTITY_INPUT, entity);
  const got = await work.$eval(ENTITY_INPUT, (e) => e.value).catch(() => null);
  if (got !== entity) return { ok: false, reason: 'entity_not_applied' };

  const resP = captureJson(work, API_ISHUR, {
    match: (post) => post.includes(String(Number(entity))) && new RegExp(`"kodPeula":\\s*${card.kodPeula}\\b`).test(post),
  });
  try {
    await work.locator(`div.divbutton_round:has-text("${card.title}")`).first().click({ timeout: 10000 });
  } catch (e) {
    return { ok: false, reason: 'card_click_blocked', detail: String(e).slice(0, 120) };
  }
  const res = await within(resP, 45000);
  await work.waitForURL((u) => !new URL(u).pathname.startsWith(ENTRY_PATH), { timeout: 15000 }).catch(() => {});
  await settlePage(work, { idleMs: 8000, watchMs: 800 });
  if (pathOf(work).startsWith(ENTRY_PATH)) {
    // ‼ נשארנו במסך הכניסה ⇒ שע״ם סירבה (למשל «לא ניתן להנפיק אישור גופים - לא קיים תיק מע״מ»).
    const text = await errorText(work);
    return { ok: false, reason: text ? 'refused' : 'card_not_opened', text };
  }
  if (!res?.body) return { ok: false, reason: 'data_not_captured' };
  return { ok: true, body: res.body, pathname: pathOf(work) };
}

/** סוגר לשוניות blob שהמסך פתח להדפסה — הן לא שלנו. */
async function closeBlobTabs(context, before) {
  for (const p of context.pages()) {
    if (before.has(p)) continue;
    if (p.url().startsWith('blob:') || p.url() === 'about:blank') await p.close().catch(() => {});
  }
}

/**
 * «הדפסת העתק אישור» — מהתפריט שאחרי הכרטיס (קיים אישור). מחזיר Buffer של PDF.
 * ‼ המסך פותח את ה-PDF בלשונית blob; הקובץ עצמו נלקח מהתשובה (fileContent).
 */
export async function printCopy(work) {
  if (!pathOf(work).startsWith(MENU_PATH)) return { ok: false, reason: 'not_on_menu', pathname: pathOf(work) };
  const before = new Set(work.context().pages());
  const resP = captureJson(work, API_PRINT, { timeout: 45000 });
  try {
    await work.locator('div.divbutton_round:has-text("הדפסת העתק אישור")').first().click({ timeout: 10000 });
  } catch (e) {
    return { ok: false, reason: 'print_click_blocked', detail: String(e).slice(0, 120) };
  }
  const res = await within(resP, 45000);
  await work.waitForTimeout(800);
  await closeBlobTabs(work.context(), before);
  const b64 = res?.body?.fileContent;
  if (!b64) return { ok: false, reason: 'pdf_not_captured' };
  const buffer = Buffer.from(String(b64), 'base64');
  if (buffer.subarray(0, 4).toString('latin1') !== '%PDF') return { ok: false, reason: 'not_a_pdf' };
  return { ok: true, buffer };
}

/**
 * ממלא את טבלת הסעיפים לפי התכנית. ‼ השורות שיש בהן שדה הן הסעיפים שניתנים להקטנה, בסדר
 * lstHkt — מאמתים שכל שורה היא הסעיף שציפינו לו לפי שמו, ואחרת עוצרים.
 */
async function fillRates(work, plan) {
  const rows = work.locator('tbody[formarrayname="hkts"] tr:has(input[formcontrolname="txtAhuzHkt"])');
  const count = await rows.count();
  if (count !== plan.rows.length) return { ok: false, reason: 'form_changed', detail: `rows=${count} plan=${plan.rows.length}` };
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const want = plan.rows[i];
    const text = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (!text.includes(want.section)) return { ok: false, reason: 'form_changed', detail: `row ${i}: ${text.slice(0, 40)}` };
    const cb = row.locator('input[formcontrolname="cbPtorMale"]').first();
    const box = row.locator('input[formcontrolname="txtAhuzHkt"]').first();
    const checked = await cb.isChecked().catch(() => false);
    if (want.exempt) {
      if (!checked) await cb.click({ timeout: 5000 });
    } else {
      if (checked) await cb.click({ timeout: 5000 });
      await box.fill('');
      await box.fill(String(want.rate));
      const v = await box.inputValue().catch(() => null);
      if (v !== String(want.rate)) return { ok: false, reason: 'rate_not_applied', detail: `${want.section}=${v}` };
    }
  }
  return { ok: true };
}

/**
 * פותח את טופס ההנפקה מהתפריט (כשיש אישור קודם) או מגיע אליו ישר.
 */
async function reachForm(work) {
  if (pathOf(work).startsWith(MENU_PATH)) {
    await work.locator('div.divbutton_round:has-text("הנפקת אישור")').first().click({ timeout: 10000 }).catch(() => {});
    await work.waitForURL((u) => new URL(u).pathname.startsWith(FORM_PATH), { timeout: 20000 }).catch(() => {});
  }
  await settlePage(work, { idleMs: 8000, watchMs: 800 });
  if (!pathOf(work).startsWith(FORM_PATH)) return { ok: false, reason: 'form_missing', pathname: pathOf(work) };
  await dismissInfoModal(work);
  return { ok: true };
}

/**
 * «בדיקה» ⇒ (שגיאה | חלונית אישור). קריאה בלבד — ההנפקה היא «עדכון» בחלונית.
 * @returns {{ok:true} | {ok:false, reason:'rejected', text:string} | {ok:false, reason:string}}
 */
async function check(work) {
  const before = await errorText(work);
  try {
    await work.locator('button:has-text("בדיקה")').first().click({ timeout: 10000 });
  } catch (e) {
    return { ok: false, reason: 'check_click_blocked', detail: String(e).slice(0, 120) };
  }
  const confirm = work.locator('ngb-modal-window button:has-text("עדכון")').first();
  for (let i = 0; i < 60; i++) {
    if (await confirm.isVisible().catch(() => false)) return { ok: true };
    const t = await errorText(work);
    if (t && t !== before) return { ok: false, reason: 'rejected', text: t };
    await work.waitForTimeout(500);
  }
  const t = await errorText(work);
  return t ? { ok: false, reason: 'rejected', text: t } : { ok: false, reason: 'no_confirm_dialog' };
}

/**
 * ההנפקה: «עדכון» בחלונית ⇒ Pidk/IdkunIsr. ‼ markExternalAttempt נקרא לפני הלחיצה.
 * @returns {{ok:true} | {ok:false, reason:'refused', text} | {ok:false, reason:'unknown'}}
 */
async function confirmIssue(work, markAttempt) {
  await markAttempt();
  const resP = captureJson(work, API_ISSUE, { timeout: 60000 });
  try {
    await work.locator('ngb-modal-window button:has-text("עדכון")').first().click({ timeout: 10000 });
  } catch (e) {
    // ‼ הלחיצה לא קרתה ⇒ שום דבר לא נשלח. ובכל זאת הסימן נרשם — המתקשר מבחין.
    return { ok: false, reason: 'confirm_click_blocked', detail: String(e).slice(0, 120), sent: false };
  }
  const res = await within(resP, 60000);
  const b = res?.body;
  if (!b) return { ok: false, reason: 'unknown', sent: true };
  if (Number(b.rtCode) !== 0) return { ok: false, reason: 'refused', text: String(b.rtText ?? '').trim(), sent: true };
  if (Number(b.kodIdk) !== 1) return { ok: false, reason: 'refused', text: 'אינך מורשה לעדכן', sent: true };
  await work.waitForURL((u) => new URL(u).pathname.startsWith(DONE_PATH), { timeout: 20000 }).catch(() => {});
  return { ok: true, sent: true };
}

/**
 * הנפקת «הקטנות» עם ירידה לשיעור הנמוך ביותר: בונים תכנית, «בדיקה», ואם שע״ם דוחה עם שיעור
 * מפורש (למשל «…מעבר ל 5%…») — מתקנים לשיעור הזה ובודקים פעם אחת נוספת. «בדיקה» אינה הנפקה,
 * ולכן הניסיון השני אינו פנייה כפולה.
 */
export async function issueWithholding(work, { plan, replan, markAttempt, log = () => {} }) {
  const form = await reachForm(work);
  if (!form.ok) return form;
  let current = plan;
  for (let round = 0; round < 2; round++) {
    const filled = await fillRates(work, current);
    if (!filled.ok) return filled;
    log(`413 הקטנות: ${current.rows.map((r) => `${r.section} ${r.exempt ? 'פטור' : `${r.rate}%`}`).join(' · ')}`);
    const c = await check(work);
    if (c.ok) {
      const done = await confirmIssue(work, markAttempt);
      return { ...done, plan: current };
    }
    if (c.reason !== 'rejected') return c;
    const next = round === 0 ? replan(c.text, current) : null;
    if (!next) return { ...c, plan: current };
    log(`413 דחתה («${c.text}») — מתקן ל-${next.rows.find((r) => !r.exempt)?.rate ?? '?'}%`);
    current = next;
  }
  return { ok: false, reason: 'rejected', text: 'השיעור לא התקבל', plan: current };
}

/** הנפקת «גופים» — אין מה למלא: התוקף מוצע ע״י שע״ם. */
export async function issueBookkeeping(work, { markAttempt }) {
  const form = await reachForm(work);
  if (!form.ok) return form;
  const c = await check(work);
  if (!c.ok) return c;
  return confirmIssue(work, markAttempt);
}

/** חוזרים למסך הכניסה (אחרי הנפקה / בין כרטיסים). */
export async function backToEntry(work) {
  await dismissInfoModal(work);
  return open413(work);
}

export { snapPage, GMF_URL };
