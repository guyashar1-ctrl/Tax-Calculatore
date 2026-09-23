// btlInsuredSession.mjs — ניווט וגרידה בתיק המבוטח, «מערכת ייצוג לקוחות».
//
// ‼ המסלול כפי שנצפה בהקלטה (23.09.2026):
//   מיוצגים → תיבת החיפוש בכותרת («חיפוש לפי שם…») עם הת.ז. → «חיפוש
//   מיוצגים» עם שורה אחת → העיפרון בשורה → «ריכוז מידע» של המבוטח, עם
//   כותרת «שם · זהות: … · יתרה: … · הרשאת חיוב: …» שנשארת בכל מסך.
//   בצד — אקורדיון: «פרטים כלליים», «עיסוקים והכנסות» (רשימת עיסוקים,
//   רשימת הכנסות), «הוראות כספיות» (הרשאות לחיוב), «מצב חשבון» (לפי ימי ערך
//   ריאלי).
//
// ‼ קריאה בלבד. הדבר היחיד שמוקלד הוא הת.ז. בתיבת החיפוש.
//
// ‼ קובץ נפרד מ-btlSession.mjs בכוונה: שם יושב ייפוי הכוח (פעולה משנה),
// כאן — קריאה בלבד. כל ההכרעות (איזו טבלה, איזו שורה, מה התאריכים) נעשות
// ב-btlFileSync.mjs על מה שהפונקציות כאן גורדות.

import { snapPage } from './browserSession.mjs';
import { btlState, byExactName, fillFieldByLabel } from './btlSession.mjs';
import { findRepresentedRow, parseInsuredHeader, sameIdNumber } from './btlFileSync.mjs';

/** הסשן נפל באמצע (שער F5 החזיר מסך כניסה). ה-handler עוצר את כל השאר. */
export class BtlSessionLost extends Error {
  constructor() { super('btl_session_lost'); this.name = 'BtlSessionLost'; }
}

async function assertStillConnected(page) {
  const s = await snapPage(page).catch(() => null);
  if (s && !btlState(s).connected) throw new BtlSessionLost();
}

async function settle(page, ms = 600) {
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function bodyText(page) {
  return (await page.evaluate(() => document.body.innerText || '').catch(() => '')).replace(/\s+/g, ' ');
}

/**
 * כל הטבלאות **הפנימיות** בעמוד (טבלה שאין בתוכה טבלה): כותרות, שורות
 * טקסט, והאם יש בשורה פקד לחיץ (עיפרון/זכוכית מגדלת). טקסט בלבד.
 */
export async function scrapeTables(page) {
  return page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const out = [];
    for (const t of document.querySelectorAll('table')) {
      if (out.length >= 40) break;
      if (t.querySelector('table')) continue;
      const rows = [...t.querySelectorAll('tr')];
      if (rows.length === 0) continue;
      const th = rows.findIndex(r => r.querySelector('th'));
      const hi = th >= 0 ? th : 0;
      const body = rows.slice(hi + 1, hi + 501);
      out.push({
        headerCells: [...rows[hi].querySelectorAll('th,td')].map(c => norm(c.textContent)),
        dataRows: body.map(r => [...r.querySelectorAll('td,th')].map(c => norm(c.textContent))),
        rowHasAction: body.map(r => !!r.querySelector('a[href], input[type=image], input[type=button], input[type=submit], .btn-edit, img[onclick], [onclick]')),
      });
    }
    return out;
  });
}

/**
 * זוגות «תווית: ערך» — תווית היא אלמנט קצר שמסתיים בנקודתיים, והערך הוא
 * האח הבא שלה (או האח הבא של ההורה, כשהתווית עטופה). כך בנויים גם «ריכוז
 * מידע» וגם כותרת המבוטח.
 */
export async function scrapePairs(page) {
  return page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const out = [];
    // ‼ נצפה חי (23.09.2026) בריכוז המידע: שורה = div.inputDivRowBlock עם
    // תא כותרת (.inputDivHeaderCell) ותא ערך (.inputDivCell) — והתווית
    // **בלי נקודתיים** (הן מה-CSS). בלי הענף הזה «דמי ביטוח» ו«עיסוק» לא נקראים.
    for (const h of document.querySelectorAll('.inputDivHeaderCell')) {
      const label = norm(h.textContent);
      const v = h.nextElementSibling;
      const value = norm(v?.textContent);
      if (label && label.length <= 30 && value && value.length <= 300) out.push({ label, value });
    }
    for (const el of document.querySelectorAll('td,th,span,label,div,b,strong,a,dt')) {
      if (out.length >= 400) break;
      const t = norm(el.textContent);
      if (!t.endsWith(':') || t.length > 30 || el.querySelector('td,div,table')) continue;
      let v = el.nextElementSibling;
      if (!v || !norm(v.textContent)) v = el.parentElement?.nextElementSibling ?? null;
      const value = norm(v?.textContent);
      if (value && value.length <= 300) out.push({ label: t, value });
    }
    return out;
  });
}

/**
 * מסמן את הפקד הלחיץ בשורה `rowIndex` של הטבלה הפנימית היחידה שכותרותיה
 * כוללות את `headers`, ולוחץ עליו. ‼ סימון DOM ולא «הלחיץ ה-N בעמוד» —
 * כדי שהלחיצה תנחת בשורה שההכרעה בחרה ולא בשורה אחרת.
 */
async function clickRowAction(page, headers, rowIndex) {
  const tag = `r${Date.now()}`;
  const marked = await page.evaluate(({ headers, rowIndex, tag }) => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const hits = [];
    for (const t of document.querySelectorAll('table')) {
      if (t.querySelector('table')) continue;
      const rows = [...t.querySelectorAll('tr')];
      const th = rows.findIndex(r => r.querySelector('th'));
      const hi = th >= 0 ? th : 0;
      const hs = [...(rows[hi]?.querySelectorAll('th,td') ?? [])].map(c => norm(c.textContent));
      if (headers.every(h => hs.includes(h))) hits.push(rows.slice(hi + 1));
    }
    if (hits.length !== 1) return { ok: false, reason: hits.length ? 'ambiguous_table' : 'table_not_found' };
    const target = hits[0][rowIndex]?.querySelector('a[href], input[type=image], input[type=button], input[type=submit], .btn-edit, img[onclick], [onclick]');
    if (!target) return { ok: false, reason: 'row_action_not_found' };
    target.setAttribute('data-pivo-click', tag);
    return { ok: true };
  }, { headers, rowIndex, tag });
  if (!marked.ok) return marked;
  await page.locator(`[data-pivo-click="${tag}"]`).first().click({ timeout: 10000 });
  await settle(page, 800);
  return { ok: true };
}

/** ממתין עד שמופיעה טבלה עם הכותרות האלה, ומחזיר את כל הטבלאות. */
async function waitForTable(page, headers, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tables = await scrapeTables(page).catch(() => []);
    if (tables.some(t => headers.every(h => t.headerCells.includes(h)))) return tables;
    await page.waitForTimeout(500);
  }
  return null;
}

const SEARCH_HEADERS = ['זהות/תיק מעסיק', 'שם', 'סוג', 'תאריך קליטה'];

/**
 * פותח את התיק של המבוטח לפי ת.ז. ומאמת שזה **הוא** — לפני שנקרא ולו ערך
 * אחד. ‼ «לא נמצא ברשימת המיוצגים» אינו תקלה: זו תשובה (אין ייצוג / טרם
 * נקלט), ומוחזרת כך.
 */
export async function openRepresentedInsured(page, idNumber) {
  const steps = [];
  try {
    await byExactName(page, 'מיוצגים').click({ timeout: 10000 });
    steps.push('clicked:מיוצגים');
    await settle(page);
    await assertStillConnected(page);

    const quick = page.getByPlaceholder(/^חיפוש לפי שם/).first();
    if (await quick.isVisible().catch(() => false)) {
      await quick.fill(idNumber, { timeout: 8000 });
      await quick.press('Enter');
      steps.push('quick_search');
    } else {
      // ‼ גיבוי: מסך «חיפוש מיוצגים» עצמו — «מלל לחיפוש» ו«חיפוש».
      const r = await fillFieldByLabel(page, 'מלל לחיפוש:', idNumber);
      if (!r.ok) return { ok: false, reason: 'search_box_not_found', steps };
      await page.getByRole('button', { name: 'חיפוש', exact: true }).first().click({ timeout: 8000 });
      steps.push('search_form');
    }
    await settle(page, 800);
    await assertStillConnected(page);

    // ‼ נצפה חי (23.09.2026): ת.ז. שאינה ברשימת המיוצגים לא מחזירה טבלה
    // ריקה אלא «הודעת שגיאה — אינך מורשה לבצע פעולות עבור המבוטח… או שהזנת
    // פרטים חסרים או שגויים». זו תשובה («לא מיוצג אצלך»), לא תקלה — ומזהים
    // אותה מיד במקום לחכות לטבלה שלא תגיע.
    const NOT_REPRESENTED = /אינך מורשה לבצע פעולות עבור המבוטח|נמצאו\s*0\s*רשומות|לא\s*נמצאו\s*רשומות/;
    let tables = null;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const t = await scrapeTables(page).catch(() => []);
      if (t.some(x => SEARCH_HEADERS.every(h => x.headerCells.includes(h)))) { tables = t; break; }
      if (NOT_REPRESENTED.test(await bodyText(page))) return { ok: false, reason: 'not_found', steps };
      await page.waitForTimeout(500);
    }
    if (!tables) return { ok: false, reason: 'search_results_not_found', steps };
    const row = findRepresentedRow(tables, idNumber);
    if (!row.found) return { ok: false, reason: row.reason, steps };

    const clicked = await clickRowAction(page, SEARCH_HEADERS, row.index);
    if (!clicked.ok) return { ok: false, reason: clicked.reason, steps };
    steps.push('opened_record');
    await assertStillConnected(page);

    // ‼ אימות זהות מכותרת המבוטח — לא לפי URL ולא לפי «זה מה שלחצנו».
    let header = null;
    let pairs = [];
    for (let i = 0; i < 20; i++) {
      pairs = await scrapePairs(page).catch(() => []);
      header = parseInsuredHeader(pairs);
      if (header.idNumber) break;
      await page.waitForTimeout(500);
    }
    if (!header?.idNumber) return { ok: false, reason: 'insured_header_not_found', steps };
    if (!sameIdNumber(header.idNumber, idNumber)) return { ok: false, reason: 'identity_mismatch', steps };
    return { ok: true, steps, pairs, representation: { type: row.type, receivedDate: row.receivedDate } };
  } catch (e) {
    if (e instanceof BtlSessionLost) throw e;
    return { ok: false, reason: 'navigation_failed', detail: (e instanceof Error ? e.message : String(e)).slice(0, 200), steps };
  }
}

/**
 * פריט באקורדיון הצדדי. ‼ כמו openPoaSubScreen: בודקים קודם אם הקישור כבר
 * גלוי — לחיצה על כותרת פתוחה **סוגרת** אותה.
 */
async function openSideLink(page, section, link) {
  try {
    if (!(await byExactName(page, link).isVisible().catch(() => false))) {
      await byExactName(page, section).click({ timeout: 10000 });
      await page.waitForTimeout(500);
    }
    await byExactName(page, link).click({ timeout: 10000 });
    await settle(page, 800);
    await assertStillConnected(page);
    return { ok: true };
  } catch (e) {
    if (e instanceof BtlSessionLost) throw e;
    return { ok: false, reason: 'side_link_failed', detail: `${section} → ${link}: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}` };
  }
}

async function openTableScreen(page, section, link, headers, reason) {
  const nav = await openSideLink(page, section, link);
  if (!nav.ok) return nav;
  const tables = await waitForTable(page, headers);
  return tables ? { ok: true, tables } : { ok: false, reason };
}

export const BTL_OCCUPATION_HEADERS = ['עיסוקים', 'מתאריך', 'עד תאריך'];

/** «פרטים כלליים → ריכוז מידע» — גם המסך שנפתח ראשון אחרי העיפרון. */
export async function readInfoSummary(page) {
  const text = await bodyText(page);
  if (!text.includes('ריכוז מידע')) {
    const nav = await openSideLink(page, 'פרטים כלליים', 'ריכוז מידע');
    if (!nav.ok) return nav;
  }
  return { ok: true, pairs: await scrapePairs(page) };
}

export function openOccupationList(page) {
  return openTableScreen(page, 'עיסוקים והכנסות', 'רשימת עיסוקים', BTL_OCCUPATION_HEADERS, 'occupation_table_not_found');
}

/**
 * פירוט שורת תקופה אחת («עיסוקים בתקופה») וחזרה לרשימה. ‼ החזרה נעשית
 * ב«חזרה» של המסך עצמו, ואם זה נכשל — פתיחה מחדש מהתפריט; לא goBack
 * (postback של ASP.NET עלול להישלח שוב).
 */
export async function drillOccupationSegment(page, rowIndex) {
  const clicked = await clickRowAction(page, BTL_OCCUPATION_HEADERS, rowIndex);
  if (!clicked.ok) return clicked;
  await assertStillConnected(page);
  const tables = await waitForTable(page, BTL_OCCUPATION_HEADERS);
  if (!tables || !(await bodyText(page)).includes('עיסוקים בתקופה')) return { ok: false, reason: 'period_detail_not_found' };

  let returned = false;
  const back = page.getByRole('button', { name: 'חזרה', exact: true })
    .or(page.getByRole('link', { name: 'חזרה', exact: true })).first();
  if (await back.isVisible().catch(() => false)) {
    await back.click({ timeout: 8000 }).catch(() => {});
    await settle(page, 800);
    returned = !!(await waitForTable(page, BTL_OCCUPATION_HEADERS, 10000)) && !(await bodyText(page)).includes('עיסוקים בתקופה');
  }
  if (!returned) returned = (await openOccupationList(page)).ok;
  return { ok: true, tables, returned };
}

/**
 * בסוף ריצה: החלון חוזר לדף «מיוצגים» — בלי מבוטח נבחר בכותרת (נצפה
 * בהקלטה: הכותרת ריקה שם). ‼ כך הרו"ח שחוזר לחלון לא מוצא את עצמו על מצב
 * החשבון של מבוטח שהוא לא פתח. הניסיון בלבד — כשל כאן אינו כשל של הקריאה.
 */
export async function returnToRepresentedHome(page) {
  try {
    await byExactName(page, 'מיוצגים').click({ timeout: 8000 });
    await settle(page, 400);
    return true;
  } catch { return false; }
}

export function openIncomeList(page) {
  return openTableScreen(page, 'עיסוקים והכנסות', 'רשימת הכנסות', ['שנה', 'סכום הכנסה', 'סטטוס'], 'income_table_not_found');
}

export function openDebitAuthorizations(page) {
  return openTableScreen(page, 'הוראות כספיות', 'הרשאות לחיוב', ['מתאריך', 'עד תאריך', 'סטטוס'], 'debit_table_not_found');
}

export function openRealValueLedger(page) {
  return openTableScreen(page, 'מצב חשבון', 'לפי ימי ערך ריאלי', ['יום ערך', 'סכום מצטבר'], 'ledger_table_not_found');
}
