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
    // ‼ גם ערך ריק נכנס: בריכוז המידע תווית ריקה היא «אין» (אכיפה, הסדר) —
    // שונה מתווית שלא נמצאה. pairValues מסנן ריקים, כך שהצרכנים הקיימים לא משתנים.
    for (const h of document.querySelectorAll('.inputDivHeaderCell')) {
      const label = norm(h.textContent);
      const v = h.nextElementSibling;
      const value = norm(v?.textContent);
      if (label && label.length <= 30 && value.length <= 300) out.push({ label, value });
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
    const { found: _found, index: _index, ...representation } = row;
    return { ok: true, steps, pairs, representation };
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

/**
 * «פרטים כלליים → ריכוז מידע». ‼ מזוהה לפי הכתובת (v101_rikuzmedagalash): המילים
 * «ריכוז מידע» מופיעות תמיד גם בתפריט הצד, והפורטל פותח את המסך האחרון שנצפה
 * במבוטח — לא בהכרח את ריכוז המידע (נצפה 28.09.2026).
 */
export async function readInfoSummary(page) {
  if (!SCREEN_URL.summary.test(page.url())) {
    const nav = await openSideLink(page, 'פרטים כלליים', 'ריכוז מידע');
    if (!nav.ok) return nav;
    for (let i = 0; i < 20 && !SCREEN_URL.summary.test(page.url()); i++) await page.waitForTimeout(500);
    if (!SCREEN_URL.summary.test(page.url())) return { ok: false, reason: 'summary_screen_not_reached' };
  }
  return { ok: true, pairs: await scrapePairs(page) };
}

/** זהות המסכים לפי הכתובת — נצפו חי. */
export const SCREEN_URL = {
  summary: /v101_rikuzmedagalash/i,
  income: /v141_reshimathachnasot/i,
  documents: /my_scanimages/i,
  notices: /v311_s611_hodaot/i,
  benefits: /vgimla_s_gimlaot/i,
  contributions: /v241_dmeibituach/i,
  benefitDebt: /v261_chovotgimla/i,
  correspondence: /v842_s_matalot/i,
};

/**
 * מסך רשימה: ניווט, זיהוי המסך לפי הכתובת, והמתנה לטבלה. ‼ «ריק» רק כשהגענו
 * בוודאות למסך הנכון ואין בו רשת נתונים כלל (כך נראה מסך בלי מסמכים/גמלאות —
 * בלי הודעה). רשת שקיימת ולא נקראה ⇒ כשל, לא «ריק».
 */
async function openListScreen(page, section, link, urlRe, headers, { gridOnly = false } = {}) {
  // ‼ הכל בתוך אקורדיון הצד עצמו (a.accAccordion + התוכן שב-aria-controls):
  // «גמלאות» היא גם תווית בריכוז המידע, «התכתבויות» הוא גם קישור בסרגל העליון
  // (של המשרד — לא של המבוטח), ול«דמי ביטוח»/«חוב גמלה» לכותרת ולקישור אותו שם.
  try {
    const exact = new RegExp('^\\s*' + section + '\\s*$');
    const header = page.locator('a.accAccordion').filter({ hasText: exact }).first();
    const panelId = await header.getAttribute('aria-controls', { timeout: 10000 });
    if (!panelId) throw new Error('accordion_panel_missing');
    const target = page.locator('#' + panelId + ' a').filter({ hasText: new RegExp('^\\s*' + link + '\\s*$') }).first();
    if (!(await target.isVisible().catch(() => false))) {
      // ‼ aria-disabled מתהפך ל-true כשהכותרת פתוחה — אצלנו היא סגורה כאן.
      await header.click({ timeout: 10000 });
      await page.waitForTimeout(500);
    }
    await target.click({ timeout: 10000 });
    await settle(page, 800);
    await assertStillConnected(page);
  } catch (e) {
    if (e instanceof BtlSessionLost) throw e;
    return { ok: false, reason: 'side_link_failed', detail: section + ' → ' + link + ': ' + (e instanceof Error ? e.message : String(e)).slice(0, 160) };
  }
  // ‼ «לא נמצאו נתונים» (חוב גמלה, תכתובות) — ריק מפורש, בלי לחכות לסוף הזמן.
  const explicitEmpty = async () => urlRe.test(page.url())
    && /לא נמצאו נתונים/.test(await page.locator('#divMainError').innerText({ timeout: 500 }).catch(() => ''));
  if (gridOnly) {
    const grid = page.locator('#SherutData_GridViewMainList');
    let seen = false;
    for (let i = 0; i < 18 && !seen; i++) {
      seen = await grid.first().isVisible().catch(() => false);
      if (!seen && await explicitEmpty()) return { ok: true, tables: [], empty: true };
      if (!seen) await page.waitForTimeout(500);
    }
    if (seen) return { ok: true, tables: [] };
    if (!urlRe.test(page.url())) return { ok: false, reason: 'screen_not_reached' };
    return { ok: true, tables: [], empty: true };
  }
  const tables = await waitForTable(page, headers, 9000);
  if (tables) return { ok: true, tables };
  if (!urlRe.test(page.url())) return { ok: false, reason: 'screen_not_reached' };
  const grid = await page.locator('#SherutData_GridViewMainList').count().catch(() => 1);
  return grid ? { ok: false, reason: 'table_unreadable' } : { ok: true, tables: [], empty: true };
}

/**
 * «הודעות ואישורים → תיק מסמכים». ‼ נתיב הסריקה של כל שורה מגובב בדף עצמו
 * (SHA-256, 16 תווים) — הנתיב לא יוצא מהדף, ושום מסמך לא נפתח או מורד.
 */
export async function openDocuments(page) {
  const r = await openListScreen(page, 'הודעות ואישורים', 'תיק מסמכים', SCREEN_URL.documents, ['תאור', 'תאריך']);
  if (!r.ok || r.empty) return r;
  const scanRefs = await page.evaluate(async () => {
    const out = [];
    const t = [...document.querySelectorAll('table')].find(x => !x.querySelector('table') && /תאור/.test(x.innerText));
    const rows = t ? [...t.querySelectorAll('tr')].filter(r => r.querySelector('td')) : [];
    for (const r of rows) {
      const m = /path=([^"&')]+)/.exec(r.querySelector('.btn-details')?.getAttribute('onclick') || '');
      if (!m) { out.push(null); continue; }
      const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(m[1]));
      out.push([...new Uint8Array(d)].slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join(''));
    }
    return out;
  }).catch(() => []);
  return { ...r, scanRefs };
}

export function openNotices(page) {
  return openListScreen(page, 'הודעות ואישורים', 'רשימת הודעות', SCREEN_URL.notices, ['תאריך', 'סוג הודעה']);
}

/** «דמי ביטוח → דמי ביטוח» — שורות הטבלה כולל שורת הקבוצות (colspan), טקסט בלבד. */
export async function openAnnualContributions(page) {
  const r = await openListScreen(page, 'דמי ביטוח', 'דמי ביטוח', SCREEN_URL.contributions, null, { gridOnly: true });
  if (!r.ok || r.empty) return r;
  const rows = await page.evaluate(() => {
    const t = document.getElementById('SherutData_GridViewMainList');
    return t ? [...t.querySelectorAll('tr')].map(tr => [...tr.children].map(c => (c.textContent || '').replace(/\s+/g, ' ').trim())) : [];
  });
  return { ok: true, rows };
}

/** מסכים שנקראת בהם רק הספירה (אין דוגמה עם נתונים — אין מיפוי עמודות). */
async function countOnly(page, section, link, urlRe) {
  const r = await openListScreen(page, section, link, urlRe, null, { gridOnly: true });
  if (!r.ok || r.empty) return r;
  const count = await page.evaluate(() => {
    const t = document.getElementById('SherutData_GridViewMainList');
    return t ? [...t.querySelectorAll('tr')].filter(tr => tr.querySelector('td')).length : 0;
  });
  return { ok: true, count };
}

export function openCorrespondence(page) {
  return countOnly(page, 'התכתבויות', 'רשימת תכתובות', SCREEN_URL.correspondence);
}

export function openBenefitDebt(page) {
  return countOnly(page, 'חוב גמלה', 'חוב גמלה', SCREEN_URL.benefitDebt);
}

export function openBenefits(page) {
  return openListScreen(page, 'פרטים כלליים', 'גמלאות', SCREEN_URL.benefits, ['שנה', 'תאור גמלה', 'גמלה ברוטו']);
}

export function openOccupationList(page) {
  return openTableScreen(page, 'עיסוקים והכנסות', 'רשימת עיסוקים', BTL_OCCUPATION_HEADERS, 'occupation_table_not_found');
}

/**
 * «פירוט עיסוק» של שורה אחת במסך «עיסוקים בתקופה», וחזרה לאותו מסך.
 * ‼ קריאה בלבד: כפתורי הרדיו של השעות נעולים בדף. מהטקסט יוצאות רק שורות
 * עם «הגדרה» או «מצב:» — לא שורת «יצירה» (שם הפקיד) ולא שום דבר אחר.
 */
async function readOccupationRecordDetail(page, rowIndex) {
  const clicked = await clickRowAction(page, BTL_OCCUPATION_HEADERS, rowIndex);
  if (!clicked.ok) return clicked;
  await assertStillConnected(page);
  let found = false;
  for (let i = 0; i < 24; i++) {
    const t = await bodyText(page);
    if (t.includes('פירוט עיסוק') && t.includes('הכנסה להגדרה')) { found = true; break; }
    await page.waitForTimeout(500);
  }
  if (!found) return { ok: false, reason: 'record_detail_not_found' };
  const pairs = await scrapePairs(page);
  const extra = await page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const radios = [...document.querySelectorAll('input[type=radio]')]
      .map(r => ({ label: norm(r.labels?.[0]?.textContent), checked: !!r.checked }));
    const lines = (document.body.innerText || '').split('\n').map(norm)
      .filter(l => l && l.length <= 140 && (/הגדרה/.test(l) || /^מצב\s*:/.test(l)));
    const heading = [...document.querySelectorAll('h1,h2,h3,h4,legend,[class*=title],[class*=Title],[class*=header]')]
      .map(e => norm(e.textContent)).find(t => /^עיסוק\s*-\s*\S/.test(t) && t.length < 60) ?? null;
    return { radios, lines, heading };
  });

  let returned = false;
  const back = page.getByRole('button', { name: 'חזרה', exact: true })
    .or(page.getByRole('link', { name: 'חזרה', exact: true })).first();
  if (await back.isVisible().catch(() => false)) {
    await back.click({ timeout: 8000 }).catch(() => {});
    await settle(page, 800);
    returned = !!(await waitForTable(page, BTL_OCCUPATION_HEADERS, 10000))
      && (await bodyText(page)).includes('עיסוקים בתקופה') && !(await bodyText(page)).includes('פירוט עיסוק');
  }
  return { ok: true, pairs, ...extra, returned };
}

/**
 * פירוט שורת תקופה אחת («עיסוקים בתקופה») וחזרה לרשימה. ‼ החזרה נעשית
 * ב«חזרה» של המסך עצמו, ואם זה נכשל — פתיחה מחדש מהתפריט; לא goBack
 * (postback של ASP.NET עלול להישלח שוב).
 */
export async function drillOccupationSegment(page, rowIndex, { detailRows } = {}) {
  const clicked = await clickRowAction(page, BTL_OCCUPATION_HEADERS, rowIndex);
  if (!clicked.ok) return clicked;
  await assertStillConnected(page);
  const tables = await waitForTable(page, BTL_OCCUPATION_HEADERS);
  if (!tables || !(await bodyText(page)).includes('עיסוקים בתקופה')) return { ok: false, reason: 'period_detail_not_found' };

  // ‼ אילו שורות לפתוח — הכרעה של btlFileSync (recordsToDetail), לא של הסשן.
  // פירוט שלא חזר ממנו למסך התקופה עוצר את השאר; החזרה לרשימה למטה מסתדרת
  // גם משם (דרך התפריט).
  const details = [];
  for (const index of (detailRows ? detailRows(tables) : [])) {
    const det = await readOccupationRecordDetail(page, index).catch(e => {
      if (e instanceof BtlSessionLost) throw e;
      return { ok: false, reason: 'record_detail_failed' };
    });
    details.push({ index, ...det });
    if (!det.ok || !det.returned) break;
  }

  let returned = false;
  const back = page.getByRole('button', { name: 'חזרה', exact: true })
    .or(page.getByRole('link', { name: 'חזרה', exact: true })).first();
  if (await back.isVisible().catch(() => false)) {
    await back.click({ timeout: 8000 }).catch(() => {});
    await settle(page, 800);
    returned = !!(await waitForTable(page, BTL_OCCUPATION_HEADERS, 10000)) && !(await bodyText(page)).includes('עיסוקים בתקופה');
  }
  if (!returned) returned = (await openOccupationList(page)).ok;
  return { ok: true, tables, details, returned };
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

/**
 * «רשימת הכנסות». ‼ מבוטח בלי הכנסה רשומה (למשל שכיר) — המסך בלי רשת נתונים;
 * זה «אין» (empty), לא «לא נקרא» (נצפה 28.09.2026).
 */
export function openIncomeList(page) {
  return openListScreen(page, 'עיסוקים והכנסות', 'רשימת הכנסות', SCREEN_URL.income, ['שנה', 'סכום הכנסה', 'סטטוס']);
}

export function openDebitAuthorizations(page) {
  return openTableScreen(page, 'הוראות כספיות', 'הרשאות לחיוב', ['מתאריך', 'עד תאריך', 'סטטוס'], 'debit_table_not_found');
}

export function openRealValueLedger(page) {
  return openTableScreen(page, 'מצב חשבון', 'לפי ימי ערך ריאלי', ['יום ערך', 'סכום מצטבר'], 'ledger_table_not_found');
}
