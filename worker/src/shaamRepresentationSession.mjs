// ─── «מערכת לרישום ייצוג» בשע״ם — שכבת המסכים ────────────────────────────────
//
// כל מה שכאן הוא ניווט וקריאה בתוך סשן **שכבר מאומת** בחלון שע״ם הייעודי.
// האימות עצמו (אישור דיגיטלי, PIN, סיסמת מערכת הייצוג) נשאר של הרו"ח —
// הקובץ הזה לא נוגע בו, לא ממלא אותו, ולא מנסה לעקוף אותו.
//
// ‼ מקור העוגנים: הקלטות המסך של הרצה ידנית מלאה (23.09.2026 — בקשה
// 2026538930; ו-27.08.2026 — בקשה 2026495063). מה שמעוגן הוא **טקסט
// שנראה על המסך**: כותרות שלבים, תוויות שדות, שמות כפתורים וכותרות עמודות.
// לא מעוגנות כאן קואורדינטות מסך, ולא id/class — אלה לא נצפו, וניחוש שלהם
// היה שביר יותר מהטקסט.
//
// ‼ מה שלא אומת מול ה-DOM החי (אין כאן כרטיס חכם): המיפוי מטקסט לאלמנט.
// לכן **כל** שלב ניווט מחזיר `{ok:false, reason}` מפורש, וה-handler הופך
// אותו לשגיאה קריאה. אין ניסיון חוזר עיוור, ואין «בטח זה הכפתור».
//
// ‼ דיאלוגים: מאושר **רק** הדיאלוג המוכר של שלב 2 («לידיעתך»), לפי צירוף
// עוגני טקסט ייחודיים. כל דיאלוג אחר עוצר את הפעולה — ראה `confirmSystemsStep`.

import { isOnWorkScreen } from './browserSession.mjs';
import { ensureRepresentation } from './warmupManager.mjs';

export const REPRESENTATION_URL = 'https://shaam.taxes.gov.il/srReshMeyuzagim';
export const REPRESENTATION_PATH = '/srReshMeyuzagim';

/** לשוניות העל של המערכת, כפי שהן מופיעות בסרגל. */
const TAB_NEW_REQUEST = 'בקשה חדשה';
const TAB_IN_PROGRESS = 'בקשות בתהליך';

/** כותרות חמשת שלבי האשף — גם האימות שאנחנו במקום הנכון. */
export const WIZARD_STEPS = [
  'אימות ישות',
  'בקשת ייפוי כוח',
  'פרטי התקשרות',
  'טעינת מסמכים',
  'השהייה וסיום',
];

const norm = (s) => (s ?? '').replace(/["'״׳]/g, '"').replace(/\s+/g, ' ').trim();

// ── עזרי DOM כלליים ─────────────────────────────────────────────────────────

/** אלמנט לפי טקסט מדויק — קישור, כפתור או טקסט. אותו דפוס כמו ב-btlSession. */
function byExactName(page, label) {
  return page.getByRole('link', { name: label, exact: true })
    .or(page.getByRole('button', { name: label, exact: true }))
    .or(page.getByText(label, { exact: true }))
    .first();
}

async function clickExact(page, label, timeout = 10000) {
  const loc = byExactName(page, label);
  const visible = await loc.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
  if (!visible) return { ok: false, reason: 'control_not_visible', failedAt: label };
  const clicked = await loc.click({ timeout }).then(() => true).catch(() => false);
  if (!clicked) return { ok: false, reason: 'click_failed', failedAt: label };
  return { ok: true };
}

/**
 * ממתין להתייצבות אחרי postback/ניווט של Angular. ‼ שתי המתנות ולא אחת:
 * חלק מהמסכים כאן מציגים שכבת «נא להמתין…» שנעלמת אחרי ה-networkidle.
 */
async function settle(page, { idleMs = 12000 } = {}) {
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
  await page.waitForLoadState('networkidle', { timeout: idleMs }).catch(() => {});
  await page.locator('text=נא להמתין').first()
    .waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
}



/** «מספר בקשה: N» — המזהה החיצוני, מופיע בכותרת האשף משלב 3 והלאה. */
export async function readRequestNumber(page) {
  return page.evaluate(() => {
    const text = (document.body.innerText || '').replace(/\s+/g, ' ');
    const m = /מספר\s*בקשה\s*:?\s*(\d{6,})/.exec(text);
    return m ? m[1] : null;
  });
}

/**
 * ‼ **רשימה סגורה.** כל דיאלוג שאינו ברשימה עוצר את הפעולה. זו ההגנה
 * מפני «לאשר כל חלונית» — אזהרה חדשה, שגיאת ולידציה או ניסוח שהשתנה
 * חייבים להיראות, לא להיבלע.
 */
export const SHAAM_KNOWN_DIALOGS = [
  {
    /**
     * «לידיעתך,» אחרי «אישור» בשלב 2 — נצפה חי בהקלטה (23.09.2026).
     * ‼ 28.09.2026 · שני המשפטים הראשונים הם **טקסט קבוע בתבנית**
     * (hazanatBakasha.html, #dialogMsgBeforeSave) ולכן מזהים אותה בוודאות;
     * השאר מגיע מהשרת ומשתנה לפי התיק — הוא נשמר כראיה (creationNotice).
     */
    id: 'step2_notice',
    minMatches: 2,
    anchors: [
      'בהמשך תתבקש לצרף',
      'נא לוודא שאלו הנתונים שהנך רוצה להזין',
      'הבקשה תקלט רק לאחר פתיחת התיק',
      'ממועד טעינת המסמכים תקלט הבקשה',
      'טופס ייפוי כוח חתום',
      'הלקוח יכול לקצר את מועד קליטת ייפוי הכוח',
    ],
  },
  {
    /**
     * אזהרת מע"מ: הישות אינה רשומה כעוסק מורשה. ‼ החלטת מוצר מפורשת:
     * **האזהרה הזאת בלבד** מאושרת וממשיכים — התיק ייפתח, וזו בדיוק
     * המשמעות של «ממתין לפתיחת תיק».
     * ‼ הניסוח כאן לא נצפה בשתי ההקלטות שנותחו, ולכן העוגנים רחבים
     * בכוונה ודורשים **שניים** מתוכם: צירוף של «עוסק מורשה» עם «מע"מ»
     * או «לא רשום» אינו מקרי, ומילה אחת לבדה אינה מספיקה כדי לאשר.
     */
    id: 'vat_not_registered_dealer',
    minMatches: 2,
    anchors: ['עוסק מורשה', 'מע"מ', 'אינו רשום', 'לא רשום', 'אינה רשומה'],
  },
];

/**
 * סיווג טקסט של חלונית. פונקציה טהורה — נבדקת ב-worker/test.
 * @returns `{ known: true, id }` או `{ known: false }`.
 */
export function classifyShaamDialog(text) {
  const t = norm(text);
  if (!t) return { known: false, reason: 'empty' };
  for (const d of SHAAM_KNOWN_DIALOGS) {
    const matched = d.anchors.filter((a) => t.includes(norm(a))).length;
    if (matched >= d.minMatches) return { known: true, id: d.id, matched };
  }
  return { known: false, reason: 'not_in_allowlist' };
}

// ── שלב 0: הגעה למערכת ──────────────────────────────────────────────────────

/**
 * מוודא שהדף עומד על מערכת רישום הייצוג ושהיא מוכנה (לא מסך התחברות).
 *
 * ‼ 23.09.2026 · לא בונה סיווג מקביל: מאציל ל-`ensureRepresentation`
 * (warmupManager.mjs) — אותו מנגנון ה-ensure המשותף ש-warm-up ו-ensureCapability
 * כבר עוברים דרכו. שם כבר קיים, נבדק ונחתם: התאוששות תחומה, שער מחזור-חיים
 * (אישור אוטומטי רק אחרי ש-GMF אומתה **במחזור הנוכחי** — חובה 4 במודל
 * המאושר), וניסיון אישור-סיסמה-שמורה **יחיד** דרך `attemptRepresentationLoginConfirm`
 * (חובה 6/7: DOM בלבד, לא URL; קליק אחד, תוצאה לא-חיובית לא מנוסה שוב).
 * שני מימושים מקבילים לאותו סיווג היו מלכודת תחזוקה — סטייה בין השניים
 * הייתה שקטה ולא נבדקת.
 *
 * ‼ הבדיקה שכן שייכת לכאן ולא ל-ensureRepresentation: `isOnWorkScreen`
 * *לפני* הניווט הראשוני — ensureRepresentation בודק אותה רק בתוך
 * ההתאוששות התחומה (אחרי כשל ראשון), לא לפני הניווט הראשון עצמו.
 */
export async function openRepresentationSystem(page) {
  if (await isOnWorkScreen(page)) {
    // ‼ לא חוטפים מסך שהרו"ח פתח. אותו כלל כמו בכל התאוששות אחרת.
    return { ok: false, reason: 'user_work_screen_open' };
  }

  const evidence = await ensureRepresentation(page);
  if (evidence.state === 'ready') return { ok: true };
  if (evidence.state === 'human_required') {
    // ‼ 'bootstrap_required' (מחזור-חיים חדש, GMF טרם אומתה) ו'login_required'
    // (שדה לא מולא/חלונית לאדם/DOM לא מוכר) — שניהם אותה הודעה כלפי הקורא
    // הקיים; הקוד המדויק נשמר ב-detail לאבחון.
    return { ok: false, reason: 'login_required', detail: evidence.reasonCode };
  }
  return { ok: false, reason: 'unexpected_destination', detail: evidence.reasonCode };
}

// ── שלבים 1–3: אימות ישות → בקשה → פרטי התקשרות ─────────────────────────────
//
// ‼ 28.09.2026 · נכתב מחדש מול **קוד האפליקציה של שע״ם עצמה** — התבניות
// (imut / hazanatBakasha / pirteyHitkashrut), הבקרים, ותבניות רכיבי המסך
// (shaam-ui: שדה ת.ז., בורר תאריך, כפתורי רדיו, תיבות סימון, בורר Kendo,
// חלונית). הם נקראו בקריאה בלבד מהדף הפתוח, והקוד כאן הורץ מול **אותו קוד
// אמיתי** במחשב, עם שרת מדומה. מה שלמדנו ממנו ומה שהגרסה הקודמת (שנבנתה
// מהקלטות מסך) פספסה:
//   · שלב 1 הוא שני שלבים: מספר ישות + «המשך» (checkYeshut) — ורק אז מופיעות
//     שאלות האימות (#imutToshavIsrael) + «המשך» שני (checkImut). כשיש כבר ייצוג
//     פעיל, שע״ם מדלגת על האימות ישר לשלב 2.
//   · תאריך הלידה נקרא כ-DD/MM/YYYY (checkDateIsValid מפצל לפי '/').
//   · שדות הטופס מתעדכנים במודל רק ב-blur (ng-model-options updateOn:'blur').
//   · אין טבלה בשלב 2: שורות div, תיבת סימון, שדה תיק ובורר Kendo.
//   · «אישור» בשלב 2 רק בודק (checkTikeyMas) ופותח את «לידיעתך,»; **ה«אישור»
//     שבחלונית** הוא שיוצר את הבקשה (createNewIpkRec).
//   · שלב 3 דורש טלפון מיוצג (קידומת Kendo + 7 ספרות) כשאין לשע״ם טלפון מאומת;
//     הטופס נפתח ב-window.open אחרי «שמירה», לא בחלון הנוכחי.
// ‼ לפני כל לחיצה שפונה לשרת של שע״ם, נקרא בחזרה **המודל של המסך** (Angular) —
// מה שהטופס באמת ישלח — ועוצרים אם הוא לא בדיוק מה שהתכוונו. כך אימות הזהות
// היחיד לעולם לא נשרף על קלט שלא נקלט.

/** אמצעי הזיהוי הנוסף — הטקסט המדויק של כפתור הרדיו בתבנית imut.html. */
export const SECONDARY_LABELS = {
  parentId: 'ת.ז הורה',
  driverLicense: 'מספר רישיון נהיגה',
  passport: 'מספר דרכון ישראלי',
};

/** DDMMYYYY ⇒ DD/MM/YYYY — כך שע״ם קוראת את השדה. טהורה. */
export function shaamBirthDateText(ddmmyyyy) {
  const d = String(ddmmyyyy ?? '').replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : null;
}

/** מספר ישות כפי ששע״ם שומרת אותו — 9 ספרות עם אפסים מובילים. טהורה. */
export function shaamEntityId(id) {
  const d = String(id ?? '').replace(/\D/g, '');
  return d ? d.padStart(9, '0') : '';
}

/**
 * טלפון ישראלי ⇒ { prefix, number } כפי שהמסך מפצל: קידומת מהרשימה + 7 ספרות.
 * ‼ 7 הספרות האחרונות הן המספר; מה שלפניהן הוא הקידומת (050 / 02 / 077).
 * +972 ⇒ 0. טהורה; null כשלא ניתן לפצל.
 */
export function splitShaamPhone(phone) {
  let d = String(phone ?? '').replace(/\D/g, '');
  if (d.startsWith('972')) d = `0${d.slice(3)}`;
  if (!/^0\d{8,9}$/.test(d)) return null;
  return { prefix: d.slice(0, -7), number: d.slice(-7) };
}

/** אותו ביטוי ששע״ם בודקת בו דוא"ל (shaam-validators.js). */
const SHAAM_EMAIL_RE = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
export const shaamEmailValid = (e) => SHAAM_EMAIL_RE.test(String(e ?? '').trim());

/** ממתין עד שבדיקת מצב מחזירה משהו שאינו 'pending'. */
async function waitForScreen(page, probe, arg, { timeoutMs = 25000 } = {}) {
  const until = Date.now() + timeoutMs;
  let last = { state: 'pending' };
  while (Date.now() < until) {
    last = await page.evaluate(probe, arg).catch((e) => ({ state: 'pending', err: String(e).slice(0, 120) }));
    if (last.state !== 'pending') return last;
    await page.waitForTimeout(400);
  }
  return { ...last, state: 'timeout' };
}

/**
 * לוחץ על כפתור שע״ם (shaam-buttons) לפי btntype — **בדיוק אחד גלוי**, ומחוץ
 * לחלונית אלא אם ביקשו חלונית. לחיצת עכבר אמיתית (Playwright), כמו משתמש.
 */
async function clickShaamButton(page, btntype, { inModal = false } = {}) {
  const n = await page.evaluate(({ btntype, inModal }) => {
    const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    for (const e of document.querySelectorAll('[data-pivo-click]')) e.removeAttribute('data-pivo-click');
    const all = [...document.querySelectorAll(`button[btntype="${btntype}"]`)]
      .filter((b) => vis(b) && !b.disabled && !!b.closest('.modal') === inModal);
    if (all.length === 1) all[0].setAttribute('data-pivo-click', '1');
    return all.length;
  }, { btntype, inModal });
  if (n !== 1) return { ok: false, reason: n ? 'button_ambiguous' : 'button_not_found', failedAt: btntype, detail: `גלויים: ${n}` };
  const clicked = await page.locator('[data-pivo-click="1"]').click({ timeout: 8000 }).then(() => true).catch(() => false);
  await page.evaluate(() => { for (const e of document.querySelectorAll('[data-pivo-click]')) e.removeAttribute('data-pivo-click'); }).catch(() => {});
  return clicked ? { ok: true } : { ok: false, reason: 'click_failed', failedAt: btntype };
}

/**
 * פותח «בקשה חדשה», מקליד את מספר הישות ולוחץ «המשך» (checkYeshut — בדיקה,
 * לא אימות זהות). מחזיר אם שע״ם מבקשת אימות (`needsVerification`).
 *
 * ‼ מסך שכבר מכיל ישות אחרת — עוצרים. לא דורסים, לא מנחשים.
 */
export async function startNewRequest(page, entityId) {
  const id = shaamEntityId(entityId);
  const tab = await clickExact(page, TAB_NEW_REQUEST);
  if (!tab.ok) return { ...tab, step: 'tab_new_request' };
  await settle(page);

  const filled = await page.evaluate((id) => {
    const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const box = document.getElementById('divZehut');
    const input = box?.querySelector('input[name="yeshut"]');
    if (!/^#\/imut/.test(location.hash) || !vis(input)) return { ok: false, reason: 'entity_field_not_found' };
    const current = (input.value || '').replace(/\D/g, '');
    if (current && current.padStart(9, '0') !== id) return { ok: false, reason: 'entity_mismatch', current };
    // ‼ שדה נעול = בדיקה כבר רצה על המסך הזה. לא ממשיכים ממצב שלא אנחנו יצרנו.
    if (input.disabled || vis(document.getElementById('imutToshavIsrael'))) return { ok: false, reason: 'new_request_screen_not_fresh' };
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(input, id);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur'));
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    let vm = null;
    try { vm = window.angular.element(box).scope().vm; } catch { vm = null; }
    if (!vm) return { ok: false, reason: 'screen_model_unreadable' };
    const seen = String(vm.misYeshut ?? '').replace(/\D/g, '');
    if (seen.padStart(9, '0') !== id) return { ok: false, reason: 'entity_not_committed', detail: seen };
    return { ok: true };
  }, id);
  if (!filled.ok) return { ...filled, step: 'entity_number' };

  const go = await clickShaamButton(page, 'hemshech');
  if (!go.ok) return { ...go, step: 'entity_continue' };

  const out = await waitForScreen(page, () => {
    const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    if (/^#\/hazanatBakasha/.test(location.hash)) {
      const info = [...document.querySelectorAll('.alert-info')].filter(vis).map((e) => clean(e.textContent)).filter(Boolean);
      return { state: 'systems_step', info };
    }
    if (vis(document.getElementById('imutToshavIsrael'))) return { state: 'verify' };
    if (vis(document.getElementById('imutTaagid'))) return { state: 'corporation' };
    const errs = [...document.querySelectorAll('#divZehut .alert-danger')].filter(vis).map((e) => clean(e.textContent)).filter(Boolean);
    if (errs.length) return { state: 'error', detail: errs.join(' · ') };
    const modal = [...document.querySelectorAll('.modal')].find(vis);
    if (modal) return { state: 'dialog', detail: clean(modal.innerText).slice(0, 300) };
    return { state: 'pending' };
  });

  if (out.state === 'verify') return { ok: true, needsVerification: true };
  if (out.state === 'systems_step') {
    // ‼ «לא ניתן להמשיך בתהליך האימות עם ישות זו… הבקשה תועבר לטיפול מחלקת
    // המייצגים» — שע״ם העבירה לטיפול ידני. לא נוצרה בקשה; לא ממשיכים לבד.
    const manual = (out.info ?? []).find((t) => /לא ניתן להמשיך בתהליך האימות/.test(t));
    if (manual) return { ok: false, reason: 'shaam_manual_handling', detail: manual, step: 'entity_check' };
    return { ok: true, needsVerification: false };
  }
  if (out.state === 'error') return { ok: false, reason: 'entity_rejected', detail: out.detail, step: 'entity_check' };
  if (out.state === 'corporation') return { ok: false, reason: 'entity_is_corporation', step: 'entity_check' };
  if (out.state === 'dialog') return { ok: false, reason: 'unknown_dialog', text: out.detail, step: 'entity_check' };
  return { ok: false, reason: 'entity_check_no_outcome', detail: out.err, step: 'entity_check' };
}

/** הודעות שהמסך מציג **לפני** שפנה לשרת (הבקר עצר) — האימות לא נוצל. */
const CLIENT_SIDE_VERIFY_ERRORS = [
  /יש למלא תאריך לידה/, /יש למלא דרכון, רישיון/, /תאריך לא חוקי/, /התאריך אינו בטווח/,
];

/**
 * ממלא תאריך לידה + אמצעי הזיהוי הנוסף, ולוחץ «המשך» (checkImut).
 *
 * ‼ **ניסיון אחד בלבד.** דחייה של שע״ם מוחזרת כ-`verification_rejected`
 * ולא מנוסה שוב בשום צורה: ניסיונות חוזרים על אימות זהות מול רשות עלולים
 * לחסום את המשתמש, והמחיר של חסימה גבוה לאין ערוך מהמחיר של עצירה.
 * ‼ לפני הלחיצה נקרא המודל של המסך: תאריך, סוג ואמצעי — בדיוק מה שביקשנו.
 * אחרת עוצרים **לפני** הפנייה, והאימות לא נוצל.
 *
 * @param birthDateDDMMYYYY שמונה ספרות.
 * @param secondary `{ type: 'parentId'|'driverLicense'|'passport', value }`
 * @param needsVerification מ-startNewRequest; false ⇒ שע״ם דילגה על האימות.
 */
export async function verifyEntity(page, { birthDateDDMMYYYY, secondary, needsVerification = true }) {
  if (needsVerification === false) return { ok: true, skipped: 'shaam_skipped_verification' };
  const label = SECONDARY_LABELS[secondary?.type];
  if (!label) return { ok: false, reason: 'unsupported_secondary_type', step: 'verify_entity' };
  const birth = shaamBirthDateText(birthDateDDMMYYYY);
  if (!birth) return { ok: false, reason: 'bad_birth_date', step: 'verify_entity' };
  const value = String(secondary.value ?? '').replace(/\s+/g, '').trim();
  const field = { parentId: 'tzHoreYeled', driverLicense: 'rishayon', passport: 'darconToshavIsrael' }[secondary.type];

  const fill = await page.evaluate(({ birth, label, value, field }) => {
    const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const commit = (input, v) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(input, v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new FocusEvent('blur'));
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    };
    const sec = document.getElementById('imutToshavIsrael');
    if (!/^#\/imut/.test(location.hash) || !vis(sec)) return { ok: false, reason: 'verification_section_not_shown' };

    const dates = [...sec.querySelectorAll('input[kendo-date-picker], input[data-role="datepicker"]')].filter(vis);
    if (dates.length !== 1) return { ok: false, reason: 'birth_date_field_not_found', n: dates.length };
    commit(dates[0], birth);

    const radios = [...sec.querySelectorAll('input[type=radio]')]
      .filter((r) => vis(r) && clean(r.closest('label')?.textContent) === label);
    if (radios.length !== 1) return { ok: false, reason: 'secondary_option_not_found', n: radios.length };
    const radio = radios[0];
    if (radio.disabled) return { ok: false, reason: 'secondary_option_disabled' };
    radio.click();
    const row = radio.closest('.row');
    const inputs = [...(row?.querySelectorAll('input:not([type=radio]):not([type=hidden])') ?? [])].filter(vis);
    if (inputs.length !== 1) return { ok: false, reason: 'secondary_field_not_found', n: inputs.length };
    if (inputs[0].disabled) return { ok: false, reason: 'secondary_field_disabled' };
    commit(inputs[0], value);

    let vm = null;
    try { vm = window.angular.element(sec).scope().vm; } catch { vm = null; }
    if (!vm) return { ok: false, reason: 'screen_model_unreadable' };
    const others = ['tzHoreYeled', 'rishayon', 'darconToshavIsrael'].filter((f) => f !== field);
    const seen = {
      taarichLeda: vm.taarichLeda, dateErr: !!vm.isDateValidErr, [field]: vm[field],
      others: others.map((f) => vm[f]).filter((x) => x !== null && x !== undefined && x !== ''),
      groupErr: (vm.tzHoreYeledGroup?.ErrElmList ?? []).length,
      screenErr: vm.isShowImutToshavIsraelErr ? clean(vm.imutToshavIsraelErr) : '',
    };
    if (seen.taarichLeda !== birth || seen.dateErr) return { ok: false, reason: 'birth_date_not_committed', detail: JSON.stringify(seen) };
    if (String(vm[field] ?? '') !== value) return { ok: false, reason: 'secondary_not_committed', detail: JSON.stringify(seen) };
    if (seen.others.length || seen.groupErr || seen.screenErr) return { ok: false, reason: 'verification_form_not_clean', detail: JSON.stringify(seen) };
    return { ok: true };
  }, { birth, label, value, field });
  if (!fill.ok) return { ...fill, step: 'verify_entity' };

  const before = await page.evaluate(() => {
    const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    return [...document.querySelectorAll('#imutToshavIsrael .alert-danger, #divZehut .alert-danger')]
      .filter(vis).map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' · ');
  });
  const go = await clickShaamButton(page, 'hemshech');
  if (!go.ok) return { ...go, step: 'verify_entity_continue' };

  const out = await waitForScreen(page, (before) => {
    const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    if (/^#\/hazanatBakasha/.test(location.hash)) return { state: 'systems_step' };
    const errs = [...document.querySelectorAll('#imutToshavIsrael .alert-danger, #divZehut .alert-danger')]
      .filter(vis).map((e) => clean(e.textContent)).filter(Boolean);
    const now = errs.join(' · ');
    if (now && now !== before) return { state: 'error', detail: now };
    return { state: 'pending' };
  }, before ?? '');

  if (out.state === 'systems_step') return { ok: true };
  if (out.state === 'error') {
    if (CLIENT_SIDE_VERIFY_ERRORS.some((re) => re.test(out.detail))) {
      return { ok: false, reason: 'verification_input_rejected_on_screen', detail: out.detail, step: 'verify_entity' };
    }
    // ‼ «אין התאמה בנתונים» או שגיאה מהשרת — האימות נוצל. **לא מנסים שוב.**
    return { ok: false, reason: 'verification_rejected', detail: out.detail, step: 'verify_entity' };
  }
  return { ok: false, reason: 'verification_no_outcome', detail: out.err, step: 'verify_entity' };
}

// ── שלב 2: בקשה חדשה לייצוג ─────────────────────────────────────────────────

/**
 * מה שכבר קיים אצל הישות הזאת — הבסיס לאידמפוטנטיות לפני יצירה.
 * מחזיר את מוני «ייצוגים פעילים (N)» ו«בקשות(N)» כפי שהם מוצגים.
 */
export async function readExistingRepresentations(page) {
  return page.evaluate(() => {
    const text = (document.body.innerText || '').replace(/\s+/g, ' ');
    const act = /ייצוגים\s*פעילים\s*\((\d+)\)/.exec(text);
    const req = /בקשות\s*\((\d+)\)/.exec(text);
    return {
      activeCount: act ? Number(act[1]) : null,
      openRequestCount: req ? Number(req[1]) : null,
    };
  });
}

/** שורות שלב 2 — הטקסט שליד תיבת הסימון, והשדות במודל של המסך. */
export const SHAAM_SYSTEM_ROWS = Object.freeze({
  'מס הכנסה': { checked: 'isCheckedMa', file: 'tikMasHachnasa', repType: 'sugIzugMaObj' },
  'מע"מ': { checked: 'isCheckedMaam', file: 'tikMaam', repType: 'sugIzugMaamObj' },
  'ניכויים': { checked: 'isCheckedNic', file: 'tikNic1', repType: 'sugIzugNic1Obj' },
});

/**
 * מסמן **אך ורק** את המערכים שהתבקשו, ממלא מספר תיק, ובוחר סוג ייצוג.
 *
 * ‼ הכלל היחיד שחשוב כאן: שורה שלא נמסרה ב-`systems` — לא נוגעים בה.
 * לא מסמנים «כי זה הגיוני», לא משאירים סימון שהיה. השורות מגיעות
 * מ-PIVO בלבד (`חובת ייצוג מול`), וההרחבה הידנית שנעשתה בהדגמה אינה חוק.
 * ‼ לא נוצר כאן דבר בשע״ם: «אישור» (confirmSystemsStep) הוא שבודק ויוצר.
 *
 * @param systems `[{ screenLabel: 'מע"מ', fileNumber: '034605212', repType: 'ראשי' }]`
 */
export async function selectRequestedSystems(page, systems) {
  const wanted = systems.map((s) => ({
    label: String(s.screenLabel).replace(/["'״׳]/g, '"').trim(),
    file: String(s.fileNumber ?? '').replace(/\D/g, '').padStart(9, '0'),
    repType: String(s.repType ?? '').trim(),
  }));
  for (const w of wanted) {
    if (!SHAAM_SYSTEM_ROWS[w.label]) return { ok: false, reason: 'unknown_system', system: w.label };
  }
  // ‼ הבוררים נטענים מהשרת (טבלה 401) ונבנים מחדש כשהם מגיעים — מחכים להם.
  await page.waitForFunction(() => {
    const sels = [...document.querySelectorAll('select[kendo-drop-down-list]')];
    return sels.length >= 3 && sels.every((s) => {
      const w = window.jQuery?.(s).data('kendoDropDownList');
      return w && w.dataSource.data().length > 1;
    });
  }, null, { timeout: 20000 }).catch(() => {});

  const result = await page.evaluate(({ wanted, ROWS }) => {
    const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const clean = (s) => (s || '').replace(/["'״׳]/g, '"').replace(/\s+/g, ' ').trim();
    const commit = (input, v) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(input, v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new FocusEvent('blur'));
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    };
    if (!/^#\/hazanatBakasha/.test(location.hash)) return { ok: false, reason: 'not_on_systems_step' };
    const title = [...document.querySelectorAll('h4')].find((h) => clean(h.textContent) === 'בקשה חדשה לייצוג');
    const box = title?.parentElement?.querySelector('.bluediv');
    if (!box) return { ok: false, reason: 'systems_table_not_found' };
    let vm = null;
    try { vm = window.angular.element(title).scope().vm; } catch { vm = null; }
    if (!vm) return { ok: false, reason: 'screen_model_unreadable' };

    const rowOf = (label) => {
      const ps = [...box.querySelectorAll('p')].filter((p) => clean(p.textContent) === label);
      if (ps.length !== 1) return null;
      let el = ps[0];
      while (el && el !== box) {
        if (el.classList?.contains('row') && el.querySelector('input[type=checkbox]')
          && el.querySelector('input[ng-model="vm.selectedNum"]') && el.querySelector('select[kendo-drop-down-list]')) return el;
        el = el.parentElement;
      }
      return null;
    };

    const touched = [];
    for (const w of wanted) {
      const f = ROWS[w.label];
      const row = rowOf(w.label);
      if (!row) return { ok: false, reason: 'system_row_not_found', system: w.label };
      const box2 = row.querySelector('input[type=checkbox]');
      if (!vis(box2) || box2.disabled) return { ok: false, reason: 'system_checkbox_unavailable', system: w.label };
      if (!vm[f.checked]) box2.click();          // ‼ הסימון פותח את שדות השורה
      if (!vm[f.checked]) return { ok: false, reason: 'system_not_checked', system: w.label };
      const file = row.querySelector('input[ng-model="vm.selectedNum"]');
      if (!file || file.disabled) return { ok: false, reason: 'file_number_input_not_found', system: w.label };
      commit(file, w.file);
      const sel = row.querySelector('select[kendo-drop-down-list]');
      const ddl = window.jQuery?.(sel).data('kendoDropDownList');
      if (!ddl) return { ok: false, reason: 'rep_type_widget_not_found', system: w.label };
      const items = ddl.dataSource.data().map((d) => ({ key: d.Key, text: clean(d.Value) }));
      const item = items.find((d) => d.text === clean(w.repType));
      if (!item) return { ok: false, reason: 'rep_type_option_not_found', system: w.label, options: items.map((d) => d.text) };
      ddl.value(item.key);
      ddl.trigger('change');
      touched.push({ ...w, key: item.key });
    }

    // ‼ קריאה חוזרת מהמודל — מה ש«אישור» ישלח בפועל.
    const problems = [];
    for (const t of touched) {
      const f = ROWS[t.label];
      if (vm[f.checked] !== true) problems.push(`${t.label}: לא מסומן`);
      if (String(vm[f.file] ?? '').replace(/\D/g, '').padStart(9, '0') !== t.file) problems.push(`${t.label}: מספר תיק ${vm[f.file]}`);
      if (String(vm[f.repType]?.Key ?? '') !== String(t.key)) problems.push(`${t.label}: סוג ייצוג ${vm[f.repType]?.Key}`);
    }
    // ‼ אימות סוגר: אין ולו שורה מסומנת אחת שלא ביקשנו.
    const extra = Object.entries(ROWS).filter(([label, f]) => vm[f.checked] && !touched.some((t) => t.label === label)).map(([label]) => label);
    if (vm.isCheckedApotropus) extra.push('קיים אפוטרופוס');
    if (extra.length) return { ok: false, reason: 'unrequested_system_checked', extra };
    const errs = [...box.querySelectorAll('label.errfont')].filter(vis).map((e) => clean(e.textContent)).filter(Boolean);
    if (errs.length) return { ok: false, reason: 'system_row_error', detail: errs.join(' · ') };
    if (problems.length) return { ok: false, reason: 'systems_not_committed', detail: problems.join(' · ') };
    return { ok: true, touched: touched.map((t) => t.label) };
  }, { wanted, ROWS: SHAAM_SYSTEM_ROWS });

  return result;
}

/**
 * «אישור» בשלב 2 ⇒ שע״ם בודקת את התיקים ופותחת «לידיעתך,» ⇒ «אישור» בחלונית
 * **יוצר את הבקשה**. מחזיר את מספר הבקשה מכותרת שלב 3.
 *
 * ‼ שגיאה בשורה (מספר תיק שגוי, «הנך מייצג בתיק זה») ⇒ לא נפתחה חלונית ולא
 * נוצר דבר. חלונית שאינה מוכרת ⇒ לא מאשרים. אחרי «אישור» בחלונית — אם שלב 3
 * לא הגיע, **לא ידוע** אם הבקשה נוצרה (`create_outcome_unknown`).
 */
export async function confirmSystemsStep(page) {
  const go = await clickShaamButton(page, 'ishur');
  if (!go.ok) return { ...go, step: 'systems_confirm' };

  const pre = await waitForScreen(page, () => {
    const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const modal = [...document.querySelectorAll('.modal')].find((m) => vis(m) && m.classList.contains('in'));
    if (modal) {
      // ‼ 28.09.2026 · «בהמשך תתבקש לצרף:» (p.fontbold) ואחריה <p> יחיד או <ul><li> —
      // כך בתבנית hazanatBakasha.html. זו רשימת המסמכים ששע״ם תדרוש לבקשה הזאת.
      const head = [...modal.querySelectorAll('p.fontbold')].find((p) => /בהמשך\s+תתבקש\s+לצרף/.test(clean(p.textContent)));
      const attach = [];
      for (let el = head?.nextElementSibling; el; el = el.nextElementSibling) {
        if (el.tagName === 'UL') attach.push(...[...el.querySelectorAll('li')].map((li) => clean(li.textContent)));
        else if (el.tagName === 'P') attach.push(clean(el.textContent));
      }
      return { state: 'dialog', text: clean(modal.querySelector('.modal-content')?.innerText ?? modal.innerText), attach: attach.filter(Boolean) };
    }
    const errs = [...document.querySelectorAll('label.errfont, .alert-danger')].filter(vis).map((e) => clean(e.textContent)).filter(Boolean);
    if (errs.length) return { state: 'error', detail: errs.join(' · ') };
    return { state: 'pending' };
  });
  if (pre.state === 'error') return { ok: false, reason: 'systems_rejected', detail: pre.detail, step: 'systems_confirm' };
  if (pre.state !== 'dialog') return { ok: false, reason: 'systems_check_no_outcome', step: 'systems_confirm' };

  const attention = await page.evaluate(() => {
    const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    return [...document.querySelectorAll('[id^="attention"]')].filter(vis).map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  }).catch(() => []);
  const verdict = classifyShaamDialog(pre.text);
  if (!verdict.known) return { ok: false, reason: 'unknown_dialog', text: pre.text.slice(0, 400), step: 'systems_confirm' };

  // ‼ הלחיצה הזאת יוצרת את הבקשה בשע״ם (createNewIpkRec).
  const ok = await clickShaamButton(page, 'ishur', { inModal: true });
  if (!ok.ok) return { ...ok, step: 'systems_dialog_confirm' };

  const post = await waitForScreen(page, () => {
    const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    if (/^#\/pirteyHitkashrut/.test(location.hash)) {
      const m = /מספר\s*בקשה\s*:?\s*(\d{6,})/.exec(clean(document.body.innerText));
      return m ? { state: 'contact_step', requestNumber: m[1] } : { state: 'pending' };
    }
    const errs = [...document.querySelectorAll('.alert-danger')].filter(vis).map((e) => clean(e.textContent)).filter(Boolean);
    if (errs.length) return { state: 'error', detail: errs.join(' · ') };
    return { state: 'pending' };
  }, null, { timeoutMs: 40000 });
  if (post.state === 'contact_step') {
    return { ok: true, requestNumber: post.requestNumber, dialog: verdict.id, notice: pre.text.slice(0, 1200), attention, attach: pre.attach ?? [] };
  }
  return { ok: false, reason: 'create_outcome_unknown', detail: post.detail ?? post.state, step: 'systems_dialog_confirm' };
}

// ── שלב 3: פרטי התקשרות + הטופס ─────────────────────────────────────────────

/**
 * ממלא את פרטי ההתקשרות, מסמן את הסכמת הלקוח, לוחץ «שמירה» — ולוכד את טופס
 * 2279 ששע״ם פותחת מיד אחריה.
 *
 * ‼ הטלפונים מגיעים מ-PIVO בלבד. שדה ששע״ם כבר מחזיקה כמאומת מוצג כטקסט —
 * לא נוגעים בו. טלפון מיוצג חסר (ואין מאומת) ⇒ עוצרים; טלפון בן/ת זוג —
 * עוצרים רק כששע״ם מסמנת אותו כחובה (חתימת בן/ת זוג), אחרת ממלאים אם יש.
 * ‼ ההסכמה מסומנת כי היא **חלק מהבקשה עצמה**: בלעדיה שע״ם לא שומרת.
 * ‼ הטופס: «שמירה» ⇒ window.open(כתובת הטופס). העובד תופס את הכתובת במקום
 * לפתוח חלון (חוסם חלונות קופצים היה בולע אותו) ומוריד אותה באותו סשן.
 */
export async function fillContactDetailsAndCaptureForm(page, { clientPhone, spousePhone, clientEmail } = {}, { timeoutMs = 45000 } = {}) {
  const client = splitShaamPhone(clientPhone);
  const spouse = splitShaamPhone(spousePhone);
  const email = shaamEmailValid(clientEmail) ? String(clientEmail).trim().toLowerCase() : '';

  // ‼ בורר הקידומת נבנה רק כשרשימת הקידומות חוזרת מהשרת (k-options) — מחכים לו.
  await page.waitForFunction(() => {
    const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    if (!/^#\/pirteyHitkashrut/.test(location.hash)) return false;
    const boxes = [...document.querySelectorAll('.bluediv [shaam-ddl-kidometnumber]')].filter(vis);
    return boxes.every((b) => {
      const w = window.jQuery?.(b.querySelector('input[kendo-drop-down-list]')).data('kendoDropDownList');
      return w && w.dataSource.data().length > 1;
    });
  }, null, { timeout: 20000 }).catch(() => {});

  const filled = await page.evaluate(({ client, spouse, email }) => {
    const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const commit = (input, v) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(input, v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new FocusEvent('blur'));
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    };
    if (!/^#\/pirteyHitkashrut/.test(location.hash)) return { ok: false, reason: 'not_on_contact_step' };
    const blue = document.querySelector('.bluediv');
    let vm = null;
    try { vm = window.angular.element(blue).scope().vm; } catch { vm = null; }
    if (!vm) return { ok: false, reason: 'screen_model_unreadable' };
    if (vm.isAllMeumat) return { ok: true, allVerified: true, spousePhoneAsked: false };

    // שורת טלפון: <p>טלפון …:</p> + שדה 7 ספרות + בורר קידומת (Kendo).
    const phoneRow = (re) => {
      const ps = [...blue.querySelectorAll('p')].filter((p) => vis(p) && re.test(clean(p.textContent)));
      if (ps.length !== 1) return null;
      let el = ps[0];
      while (el && el !== blue) {
        if (el.querySelector('input[ng-model="vm.selectedNum"]') && el.querySelector('input[kendo-drop-down-list]')) return el;
        el = el.parentElement;
      }
      return null;
    };
    const fillPhone = (row, ph) => {
      const num = [...row.querySelectorAll('input[ng-model="vm.selectedNum"]')].filter(vis);
      const pre = row.querySelector('input[kendo-drop-down-list]');
      const ddl = window.jQuery?.(pre).data('kendoDropDownList');
      if (num.length !== 1 || !ddl) return 'phone_field_not_found';
      const list = ddl.dataSource.data().map((x) => String(x));
      if (!list.includes(ph.prefix)) return 'phone_prefix_not_in_list';
      ddl.value(ph.prefix);
      ddl.trigger('change');
      commit(num[0], ph.number);
      return null;
    };

    const asked = { client: false, spouse: false, spouseRequired: false };
    if (!vm.isPhoneMeumat) {
      asked.client = true;
      if (!client) return { ok: false, reason: 'client_phone_required_but_missing' };
      const row = phoneRow(/^טלפון מיוצג:?$/);
      if (!row) return { ok: false, reason: 'client_phone_field_not_found' };
      const e = fillPhone(row, client);
      if (e) return { ok: false, reason: e, detail: client.prefix };
    }
    if (vm.bz?.hatzagatBz && !vm.isPhoneBZMeumat) {
      asked.spouse = true;
      asked.spouseRequired = !!vm.bz.chovatChatimatBz;
      if (spouse) {
        const row = phoneRow(/^טלפון בן\\?\/?ת זוג:?$/);
        if (!row) return { ok: false, reason: 'spouse_phone_field_not_found' };
        const e = fillPhone(row, spouse);
        if (e) return { ok: false, reason: e, detail: spouse.prefix };
      } else if (asked.spouseRequired) {
        return { ok: false, reason: 'spouse_phone_required_but_missing' };
      }
    }
    if (!vm.isMailMeumat && email) {
      const m = [...blue.querySelectorAll('input[name="mail"]')].filter(vis);
      if (m.length === 1) commit(m[0], email);
    }
    // ההסכמה: התיבה שהתווית שלה «הלקוח מאשר קבלת הודעות מרשות המסים…».
    const consent = [...blue.querySelectorAll('label')]
      .filter((l) => vis(l) && /הלקוח מאשר קבלת הודעות מרשות המסים/.test(clean(l.textContent)))
      .map((l) => l.parentElement?.querySelector('input[type=checkbox]')).filter(Boolean);
    if (consent.length !== 1) return { ok: false, reason: consent.length ? 'ambiguous_consent_checkbox' : 'consent_checkbox_not_found' };
    if (!vm.cbIshur) consent[0].click();

    // ‼ קריאה חוזרת — מה ש«שמירה» ישלח.
    const p = vm.pirteyHitkashrut ?? {};
    const problems = [];
    if (asked.client && (String(p.kidomet) !== client.prefix || String(p.telephoneMeuzag) !== client.number)) problems.push(`טלפון מיוצג: ${p.kidomet}-${p.telephoneMeuzag}`);
    if (asked.spouse && spouse && (String(p.kidometBz) !== spouse.prefix || String(p.telephoneBz) !== spouse.number)) problems.push(`טלפון בן/ת זוג: ${p.kidometBz}-${p.telephoneBz}`);
    if (vm.cbIshur !== true) problems.push('ההסכמה לא סומנה');
    if ((vm.mail?.ErrElmList ?? []).length) problems.push('דוא"ל נדחה במסך');
    if (problems.length) return { ok: false, reason: 'contact_not_committed', detail: problems.join(' · ') };
    return { ok: true, spousePhoneAsked: asked.spouse, spousePhoneRequired: asked.spouseRequired, clientPhoneAsked: asked.client, emailFilled: !!email && !vm.isMailMeumat };
  }, { client, spouse, email });
  if (!filled.ok) return { ...filled, step: 'contact_details' };

  // ‼ לוכדים את window.open של הטופס — לפני הלחיצה.
  await page.evaluate(() => {
    if (window.__pivoOrigOpen) return;
    window.__pivoOrigOpen = window.open;
    window.__pivoOpened = [];
    window.open = function (url) { window.__pivoOpened.push(String(url)); return null; };
  });
  try {
    const save = await clickShaamButton(page, filled.allVerified ? 'hemshech' : 'shmira');
    if (!save.ok) return { ...save, step: 'contact_details_save' };

    const out = await waitForScreen(page, () => {
      const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      if ((window.__pivoOpened ?? []).length) return { state: 'opened', urls: window.__pivoOpened.slice() };
      const errs = [...document.querySelectorAll('.alert-danger')].filter(vis).map((e) => clean(e.textContent)).filter(Boolean);
      if (errs.length) return { state: 'error', detail: errs.join(' · ') };
      return { state: 'pending' };
    }, null, { timeoutMs });
    if (out.state === 'error') return { ok: false, reason: 'contact_save_error', detail: out.detail, step: 'contact_details_save' };
    if (out.state !== 'opened') return { ok: false, reason: 'form_not_opened', step: 'contact_details_save', saved: 'unknown' };

    const url = out.urls[0];
    const got = await page.evaluate(async (url) => {
      try {
        const r = await fetch(url, { credentials: 'include' });
        const buf = new Uint8Array(await r.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        return { status: r.status, type: r.headers.get('content-type') || '', b64: btoa(bin) };
      } catch (e) { return { error: String(e).slice(0, 200) }; }
    }, url);
    const buffer = got?.b64 ? Buffer.from(got.b64, 'base64') : null;
    const isPdf = !!buffer && buffer.subarray(0, 5).toString('latin1') === '%PDF-';
    const form = isPdf
      ? { ok: true, source: 'window_open', url, buffer }
      : { ok: false, reason: 'form_not_pdf', detail: got?.error ?? `${got?.status} ${got?.type}` };
    return {
      ok: true, spousePhoneAsked: filled.spousePhoneAsked, spousePhoneRequired: filled.spousePhoneRequired,
      clientPhoneAsked: filled.clientPhoneAsked, emailFilled: filled.emailFilled, openedCount: out.urls.length, form,
    };
  } finally {
    await page.evaluate(() => {
      if (window.__pivoOrigOpen) { window.open = window.__pivoOrigOpen; delete window.__pivoOrigOpen; }
    }).catch(() => {});
  }
}


// ── שלב 4: טעינת המסמך החתום ────────────────────────────────────────────────



// ── רשימת הבקשות: קריאת מצב ─────────────────────────────────────────────────

// ‼ 23.09.2026 · תוויות נבדקו מול הכותרת האמיתית של הטבלה (Kendo grid):
// "ת.הזנה", לא "תאריך הזנה" המלא. הכל אומת חי מול המסך, לא ניחוש.
const LIST_COLUMNS = {
  date: 'ת.הזנה',
  clientName: 'שם הלקוח',
  requestState: 'מצב בקשה',
  system: 'מערך',
  fileNumber: 'מספר תיק',
  systemState: 'מצב מערך',
  repType: 'סוג ייצוג',
};

/** מנקה שם להשוואה — אותו כלל בדיוק כמו PIVO (shaamRepresentation.ts). */
function normPersonName(text) {
  return (text ?? '').replace(/["'״׳,]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** האם שני חלקי שם (פרטי+משפחה) מופיעים בטקסט, בכל סדר — כמו matchRegisteredPersonName. */
function nameMatches(rowName, expectedFullName) {
  const haystack = normPersonName(rowName);
  const parts = normPersonName(expectedFullName).split(' ').filter((p) => p.length >= 2);
  if (!haystack || parts.length < 2) return false;
  return parts.every((p) => haystack.includes(p));
}

/**
 * פירוט שורה ברשימת «בקשות בתהליך» — טקסט ⇒ שדות. טהורה.
 *
 * ‼ 201 · הניסוח האמיתי (הדסה סלע, 2026538930): «מספר בקשה: 2026538930»,
 * «מספר לקוח: 034605212», «צפי לסיום השהייה: 06/10/2026». הגרסה הקודמת
 * חיפשה «צפוי לסיום», «ישות הלקוח» ומספר בלי נקודתיים — ולכן אף שדה לא
 * נקרא. כאן: נקודתיים אופציונליים, «צפי»/«צפוי», «מספר לקוח»/«ישות הלקוח».
 * ‼ ערך שאינו תאריך ב«צפי לסיום השהייה» נשמר כטקסט — PIVO לא ממציאה תאריך.
 */
export function parseRequestDetailText(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  const out = {};
  if (!t) return out;
  const grab = (re) => { const m = re.exec(t); return m ? m[1].trim() : undefined; };
  const requestNumber = grab(/מספר\s*בקשה\s*:?\s*(\d{6,})/);
  const entityId = grab(/(?:מספר\s*לקוח|ישות\s*(?:ה)?לקוח)\s*:?\s*(\d{5,9})/);
  const systemUpdatedAt = grab(/(?:ת\.?\s*עדכון|תאריך\s*עדכון)\s*(?:מערך|מערכת)?\s*:?\s*(\d{1,2}[/.]\d{1,2}[/.]\d{4})/);
  let suspensionEnds = grab(/צפו?י\s*ל?סיום\s*(?:ה)?השהי+ה\s*:?\s*(\d{1,2}[/.]\d{1,2}[/.]\d{4})/);
  if (!suspensionEnds) {
    const m = /צפו?י\s*ל?סיום\s*(?:ה)?השהי+ה\s*:?\s*(.{1,40}?)\s*(?:מספר\s*בקשה|מספר\s*לקוח|ישות|ת\.?\s*עדכון|תאריך\s*עדכון|שם\s*תיק|$)/.exec(t);
    if (m && m[1].trim()) suspensionEnds = m[1].trim();
  }
  const fileName = grab(/שם\s*תיק\s*:?\s*([^\s].{0,40}?)(?:\s*(?:מספר\s*בקשה|מספר\s*לקוח|צפו?י)|$)/);
  if (requestNumber) out.requestNumber = requestNumber;
  if (entityId) out.entityId = entityId;
  if (systemUpdatedAt) out.systemUpdatedAt = systemUpdatedAt;
  if (suspensionEnds) out.suspensionEnds = suspensionEnds;
  if (fileName) out.fileName = fileName;
  return out;
}

/**
 * מייחס שורות שנקראו מהרשימה לבקשה המבוקשת — או עוצר.
 *
 * ‼ 23.09.2026 · תוקן אחרי אירוע אמיתי: הענף הישן (`if (!want) return
 * {ok:true, rows:list}`) **עקף לגמרי** את כל בדיקת השיוך כשלא היה מספר
 * בקשה — בדיוק המקרה השכיח ביותר (חיפוש לפי ישות בלבד, בלי שום מספר
 * ידוע). התוצאה בשטח: חיפוש לפי ת.ז. של הדסה סלע החזיר גם שורות של שני
 * לקוחות אחרים לגמרי (שמעון לזימי, שי ישר) — ו**נכתבו** לכרטיס שלה עד
 * שהתגלה. הענף הזה הוסר; אין יותר מסלול ש"מחזיר הכול".
 *
 * ‼ הכלל עכשיו: שורה מיוחסת רק כשאפשר **לבסס** את השיוך — ומתברר בפועל
 * ש-`detail.entityId`/`detail.requestNumber` (מפירוט שורה מורחב) לא
 * תמיד נקראים בכלל (רשת Kendo, לא כל שורה נפתחת). לכן **שם הלקוח**
 * (`row.clientName`, עמודה גלויה תמיד) הוא ראיית השיוך השנייה, לא רק
 * גיבוי — ונדרשת בכל חיפוש לפי ישות בלי מספר בקשה ידוע.
 *
 * ‼ שתי התוצאות של טעות כאן חמורות באותה מידה: לשדר טופס חתום לבקשה של
 * אדם אחר, או לסמן ייצוג כפעיל על סמך שורה זרה.
 */
export function attributeRows(rows, { requestNumber, entityId, searchedBy, expectedClientName } = {}) {
  const want = String(requestNumber ?? '').replace(/\D/g, '');
  const wantEntity = String(entityId ?? '').replace(/\D/g, '');
  const list = Array.isArray(rows) ? rows : [];

  // ‼ 201: «מספר לקוח» בפירוט יכול להופיע בלי אפסים מובילים — אותה ישות.
  const bareId = (v) => v.replace(/^0+/, '');
  for (const r of list) {
    const rowEntity = String(r?.detail?.entityId ?? '').replace(/\D/g, '');
    if (wantEntity && rowEntity && bareId(rowEntity) !== bareId(wantEntity)) {
      return { ok: false, reason: 'identity_mismatch', detail: 'ישות הלקוח בשורה אינה הישות המבוקשת' };
    }
  }

  if (want && searchedBy === 'requestNumber') {
    const foreign = list.find((r) => {
      const n = String(r?.detail?.requestNumber ?? '').replace(/\D/g, '');
      return n && n !== want;
    });
    if (foreign) {
      return { ok: false, reason: 'identity_mismatch', detail: 'הרשימה מכילה שורה של בקשה אחרת' };
    }
    // ‼ גם כשהחיפוש היה לפי מספר בקשה — אם יש שם מועמד ידוע, הוא עדיין
    // נבדק (חגורה ושני שלייקס): שורות ששם בהן ידוע ואינו תואם לא נכללות.
    if (expectedClientName) {
      return { ok: true, rows: list.filter((r) => !r.clientName || nameMatches(r.clientName, expectedClientName)) };
    }
    return { ok: true, rows: list };
  }

  // חיפוש לפי ישות (או אין want בכלל) — כל שורה חייבת להיות ניתנת לביסוס:
  // מספר בקשה מפורש בפירוט השורה, או שם לקוח להשוואה. בלי אף אחד
  // מהשניים בכלל — לא מנחשים, לא מתחילים.
  // ‼ 28.09.2026 · נתוני הטבלה נושאים את ת.ז. המיוצג (misMuzag) בכל שורה —
  // שיוך לפי ת.ז. מדויקת הוא הראיה החזקה ביותר, ואינו תלוי בסדר השם.
  const exactEntity = (r) => {
    const rowEntity = String(r?.detail?.entityId ?? '').replace(/\D/g, '');
    return !!wantEntity && !!rowEntity && bareId(rowEntity) === bareId(wantEntity);
  };
  if (!want && !expectedClientName && !(list.length > 0 && list.every(exactEntity))) {
    return { ok: false, reason: 'cannot_attribute', detail: 'אין מספר בקשה ואין שם לקוח להשוואה' };
  }
  const canAttribute = (r) => {
    const rowReqNum = String(r?.detail?.requestNumber ?? '').replace(/\D/g, '');
    if (exactEntity(r)) return true;
    if (want && rowReqNum) return true;
    if (expectedClientName && r.clientName) return true;
    return false;
  };
  // ‼ שורה אחת שאי אפשר לבסס עליה כלום (לא מספר, לא שם) מפילה את כל
  // התוצאה — לא רק אותה שורה. אם יש שם שם המסך התנהג בצורה לא צפויה,
  // עדיף לעצור מאשר לסמוך על החלק שכן "הצליח".
  const unattributable = list.find((r) => !canAttribute(r));
  if (unattributable) {
    return { ok: false, reason: 'cannot_attribute', detail: 'שורה בלי מספר בקשה ובלי שם לקוח להשוואה' };
  }
  const attributed = list.filter((r) => {
    const rowReqNum = String(r?.detail?.requestNumber ?? '').replace(/\D/g, '');
    if (want && rowReqNum) return rowReqNum === want;
    if (exactEntity(r)) return true;
    return nameMatches(r.clientName, expectedClientName);
  });
  return { ok: true, rows: attributed };
}

// ── «בקשות בתהליך» — קריאה מדויקת מנתוני הטבלה (נצפה חי, 28.09.2026) ─────────
//
// ‼ מה שנלמד מהמערכת החיה (קריאה בלבד, בלשונית נפרדת):
//   · טבלת Kendo מחזיקה את **כל** השורות ב-dataSource (הדפדוף הוא בצד הלקוח,
//     8 בעמוד), ולכל שורה קודים מדויקים: asmachta (= «מספר בקשה»), misMuzag
//     (ת.ז. המיוצג), kodMaarach, statusBakashaKod, statusTikKod, isBehamtana
//     (אין עדיין תיק), bitulKod/bitulTeur, dateTzefiSyumHashaya. אלה עדיפים על
//     טקסט מהמסך: שיוך לפי ת.ז. מדויקת, ומצב לפי קוד — לא לפי ניסוח.
//   · «אין תוצאות» נראה כ-div.alert-info «לא נמצאו רשומות מתאימות» (ng-if
//     vm.size==0), בלי טבלה בכלל — ולא «מוצגים 0 תיקים». בגלל זה «הזן» של עידן
//     רוקח (24.09) נעצר על preflight_unreadable, למרות שאין לו בקשה.
//   · טופס החיפוש **זוכר** ערכים מהחיפוש הקודם. חיפוש לפי «מספר בקשה» עם
//     «ישות מיוצג» שנשאר מקודם מסנן לפי שניהם («סינון לפי : מספר ישות + מספר
//     בקשה») ⇒ «לא נמצאו» שקרי. לכן: «ניקוי» קודם, ואז אימות שהסינון שהוצג
//     הוא בדיוק מה שביקשנו — אחרת עוצרים. «לא נמצאו» בלי זה היה נקרא «אין
//     בקשה» ופותח בקשה כפולה.

/** טהורה: «סינון לפי : X» הוא בדיוק הסינון שביקשנו (ולא צירוף עם שדה שנשאר). */
export function filterEchoMatches(echo, expected) {
  const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const m = /^סינון\s+לפי\s*:?\s*(.+)$/.exec(clean(echo));
  return !!m && clean(m[1]) === clean(expected);
}

const digitsOf = (v) => String(v ?? '').replace(/\D/g, '');

/**
 * טהורה: פריטי ה-dataSource של הטבלה ⇒ שורות באותו מבנה כמו הקריאה מה-DOM,
 * ועוד `codes`, `noFile`, `cancelReason`. ‼ ת.ז. מנורמלת ל-9 ספרות.
 */
export function gridItemsToRows(items) {
  const s = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const n = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
  const ddmmyyyy = (v) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s(v));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : s(v);
  };
  return (Array.isArray(items) ? items : []).map((it) => {
    const entity = digitsOf(it?.misMuzag);
    const work = digitsOf(it?.misTikWork);
    const cancel = n(it?.bitulKod);
    return {
      uid: s(it?.uid) || null,
      date: ddmmyyyy(it?.tarHazana),
      clientName: s(it?.shemMuzag),
      requestState: s(it?.statusBakashaTeur),
      system: s(it?.teurMaarac),
      fileNumber: s(it?.misTik),
      systemState: s(it?.statusTikTeur),
      repType: s(it?.sugIzugTeur),
      detail: {
        ...(digitsOf(it?.asmachta) ? { requestNumber: digitsOf(it?.asmachta) } : {}),
        ...(entity ? { entityId: entity.padStart(9, '0') } : {}),
        ...(s(it?.dateTzefiSyumHashaya) ? { suspensionEnds: s(it?.dateTzefiSyumHashaya) } : {}),
        ...(s(it?.shemTik) ? { fileName: s(it?.shemTik) } : {}),
      },
      codes: {
        requestState: n(it?.statusBakashaKod),
        systemState: n(it?.statusTikKod),
        system: n(it?.kodMaarach),
        repType: n(it?.sugIzugKod),
        cancel,
      },
      noFile: Number(it?.isBehamtana) === 1 || (work !== '' && /^0+$/.test(work)),
      cancelReason: cancel && cancel > 0 ? s(it?.bitulTeur) : '',
      isn: n(it?.isn),
      spouseSignature: it?.isChatimatBz === true,
      tableIndex: null,
      trIndex: null,
    };
  });
}

/** מה שבדף: הסינון שהוצג, «לא נמצאו», ונתוני הטבלה (כולל מיקום השורות בעמוד). */
async function readListState(page) {
  return page.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const vis = (e) => !!e && e.offsetParent !== null;
    const echoEl = [...document.querySelectorAll('p, div, span, label')]
      .find((e) => e.children.length === 0 && vis(e) && /^סינון\s+לפי/.test(clean(e.textContent)));
    const emptyAlert = [...document.querySelectorAll('.alert-info, .alert')]
      .some((e) => vis(e) && /לא\s+נמצאו\s+רשומות/.test(clean(e.textContent)));
    const shown = /מוצגים\s+(\d+)\s+תיק/.exec(document.body.innerText || '');
    let grid = null;
    const $ = window.jQuery;
    if ($) {
      for (const g of document.querySelectorAll('[data-role=grid], [kendo-grid]')) {
        if (!vis(g)) continue;
        const w = $(g).data('kendoGrid');
        if (!w || !w.dataSource) continue;
        const fields = (w.columns || []).map((c) => c.field);
        if (!fields.includes('statusBakashaKod') || !fields.includes('statusTikKod')) continue;
        const ds = w.dataSource;
        const raw = ds.data();
        const items = (raw && typeof raw.toJSON === 'function' ? raw.toJSON() : [...(raw || [])]).map((it, i) => ({
          ...it, uid: (raw[i] && raw[i].uid) || it.uid || null,
        }));
        const tables = [...document.querySelectorAll('table')];
        const positions = {};
        for (const tr of g.querySelectorAll('tr[data-uid]')) {
          const table = tr.closest('table');
          const all = [...table.querySelectorAll('tbody tr, tr')];
          positions[tr.getAttribute('data-uid')] = { tableIndex: tables.indexOf(table), trIndex: all.indexOf(tr) };
        }
        const details = {};
        for (const tr of g.querySelectorAll('tr.k-detail-row')) {
          const master = tr.previousElementSibling;
          const uid = master && master.getAttribute('data-uid');
          // ‼ innerText ולא textContent: «תיק החזר מס (91)» קיים ב-DOM גם כשהוא
          // מוסתר (ng-hide) — רק הגלוי הוא ראיה לתיק 91.
          if (uid) details[uid] = clean(tr.innerText);
        }
        grid = { total: typeof ds.total === 'function' ? ds.total() : items.length, items, positions, details };
        break;
      }
    }
    return { echo: echoEl ? clean(echoEl.textContent) : null, emptyAlert, shownCount: shown ? Number(shown[1]) : null, grid };
  }).catch(() => ({ echo: null, emptyAlert: false, shownCount: null, grid: null }));
}

/**
 * שורות הבקשה — הראיה היחידה שמותר להסיק ממנה מצב.
 *
 * ‼ חיפוש לפי מספר הבקשה שנשמר (או לפי ישות), אחרי «ניקוי», ואימות שהסינון
 * שהוצג הוא בדיוק מה שביקשנו. ‼ מחזיר את **כל** שורות המערכים — לכל מערך מצב משלו.
 */
export async function findRequestRows(page, { requestNumber, entityId, expectedClientName, expandDetails = false } = {}) {
  const tab = await clickExact(page, TAB_IN_PROGRESS);
  if (!tab.ok) return { ...tab, step: 'tab_in_progress' };
  await settle(page);

  // ‼ 28.09.2026 · הטופס זוכר את החיפוש הקודם — מנקים לפני כל חיפוש.
  const cleared = await clickExact(page, 'ניקוי');
  if (!cleared.ok) return { ...cleared, step: 'list_clear' };
  await settle(page);

  const searched = await page.evaluate(({ requestNumber, entityId }) => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const setValue = (input, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      input.focus();
      setter.call(input, v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.blur();
    };
    const fieldByLabel = (re) => {
      const els = [...document.querySelectorAll('label, span, td, div')]
        .filter((e) => e.children.length === 0 && re.test(clean(e.textContent)));
      if (els.length !== 1) return null;
      const row = els[0].closest('tr, .row, .form-group') || els[0].parentElement;
      return row?.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=button])') ?? null;
    };
    const byNumber = fieldByLabel(/^מספר\s+בקשה\s*:?$/);
    const byEntity = fieldByLabel(/^ישות\s+מיוצג\s*:?$/);
    // ‼ גם אחרי «ניקוי» — שדה שנשאר מלא הוא סינון נוסף שלא ביקשנו.
    const leftover = [byNumber, byEntity].filter((f) => f && clean(f.value));
    if (leftover.length) return { ok: false, reason: 'search_form_not_cleared' };
    // ‼ 28.09.2026 · נצפה חי: חיפוש לפי «מספר בקשה» מוצא רק בקשות מ~30 הימים
    // האחרונים (הדסה 23/09 נמצאה; דן רכס 12/08 — «לא נמצאו רשומות», אף שהבקשה
    // קיימת). חיפוש לפי ישות מוצא את כל ההיסטוריה. לכן: ישות קודם, והמספר מסנן
    // אחר כך (attributeRows). מספר בלבד — רק כשאין ת.ז.
    if (byEntity && entityId) { setValue(byEntity, entityId); return { ok: true, by: 'entityId' }; }
    if (byNumber && requestNumber) { setValue(byNumber, requestNumber); return { ok: true, by: 'requestNumber' }; }
    return { ok: false, reason: 'search_field_not_found' };
  }, { requestNumber: requestNumber ?? '', entityId: entityId ?? '' });

  if (!searched.ok) return { ...searched, step: 'list_search' };

  const go = await clickExact(page, 'חיפוש');
  if (!go.ok) return { ...go, step: 'list_search' };
  await settle(page, { idleMs: 20000 });
  // ‼ 23.09.2026 · settle לא מבטיח שהטבלה כבר עודכנה. ממתינים לראיה שהחיפוש
  // הסתיים: «מוצגים N תיקים», או (28.09, נצפה חי) «לא נמצאו רשומות מתאימות».
  await page.waitForFunction(
    () => /מוצגים\s+\d+\s+תיק|לא\s+נמצאו\s+רשומות/.test(document.body.innerText || ''),
    { timeout: 8000 },
  ).catch(() => {});

  const expectEcho = searched.by === 'requestNumber' ? 'מספר בקשה' : 'מספר ישות';
  let state = await readListState(page);
  if (!filterEchoMatches(state.echo, expectEcho)) {
    return { ok: false, reason: 'search_filter_mismatch', detail: state.echo ?? 'no_filter_echo', step: 'list_search' };
  }
  if (state.emptyAlert && (!state.grid || state.grid.total === 0)) {
    return {
      ok: true, rows: [], total: 0, searchedBy: searched.by, source: 'empty_alert',
      listed: { count: 0, noRecords: true, filter: state.echo },
    };
  }

  if (state.grid) {
    // ‼ 201 · הפירוט (צפי לסיום השהייה, «תיק החזר מס (91)») נפתח רק בבדיקה.
    // פתיחת תצוגה בלבד — לא פעולה אצל הרשות.
    if (expandDetails) {
      const expanded = await expandVisibleRows(page);
      if (expanded > 0) {
        await page.waitForFunction(() => document.querySelectorAll('tr.k-detail-row').length > 0, { timeout: 6000 }).catch(() => {});
        await settle(page, { idleMs: 8000 });
        state = await readListState(page);
      }
    }
    const rows = gridItemsToRows(state.grid?.items ?? []);
    for (const r of rows) {
      const pos = r.uid ? state.grid.positions[r.uid] : null;
      if (pos && pos.tableIndex >= 0 && pos.trIndex >= 0) { r.tableIndex = pos.tableIndex; r.trIndex = pos.trIndex; }
      const detailText = r.uid ? state.grid.details[r.uid] : '';
      if (detailText) {
        const parsed = parseRequestDetailText(detailText);
        r.detail = { ...parsed, ...r.detail, ...(parsed.systemUpdatedAt ? { systemUpdatedAt: parsed.systemUpdatedAt } : {}) };
        r.tik91 = /תיק\s*החזר\s*מס\s*\(91\)/.test(detailText);
      }
    }
    const attributed = attributeRows(rows, {
      requestNumber, entityId, searchedBy: searched.by, expectedClientName,
    });
    if (!attributed.ok) return { ...attributed, step: 'list_read' };
    return {
      ok: true, rows: attributed.rows, total: rows.length, searchedBy: searched.by, source: 'grid',
      listed: { count: state.grid.total, noRecords: state.grid.total === 0, filter: state.echo },
    };
  }

  // ── נפילה לקריאה מה-DOM (טבלה בלי נתוני Kendo) — כמו קודם ──────────────────
  const listed = { count: state.shownCount, noRecords: false, filter: state.echo };
  if (expandDetails) {
    const expanded = await expandVisibleRows(page);
    if (expanded > 0) {
      await page.waitForFunction(() => document.querySelectorAll('tr.k-detail-row').length > 0, { timeout: 6000 }).catch(() => {});
      await settle(page, { idleMs: 8000 });
    }
  }

  const rows = await page.evaluate(({ columns }) => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const tables = [...document.querySelectorAll('table')];
    for (const [tableIndex, table] of tables.entries()) {
      // ‼ 23.09.2026 · thead קודם, ורק אם הוא ריק נופלים ל-tr:first-child.
      let headEls = [...table.querySelectorAll('thead th, thead td')];
      if (headEls.length === 0) headEls = [...table.querySelectorAll('tr:first-child th, tr:first-child td')];
      const headCells = headEls.map((c) => clean(c.textContent));
      const index = {};
      for (const [key, label] of Object.entries(columns)) {
        const i = headCells.findIndex((h) => h === label);
        if (i >= 0) index[key] = i;
      }
      if (index.requestState === undefined || index.system === undefined) continue;

      const out = [];
      let currentRow = null;
      for (const [trIndex, tr] of [...table.querySelectorAll('tbody tr, tr')].entries()) {
        const cells = [...tr.querySelectorAll('td')].map((c) => clean(c.textContent));
        if (cells.length >= headCells.length - 1 && cells.length > 3) {
          currentRow = { tableIndex, trIndex };
          for (const [key, i] of Object.entries(index)) currentRow[key] = cells[i] ?? '';
          currentRow.detail = {};
          out.push(currentRow);
          continue;
        }
        // ‼ 28.09 · innerText (גלוי בלבד) — ראה readListState.
        const text = clean(tr.innerText);
        if (!currentRow || !text) continue;
        currentRow.detailText = `${currentRow.detailText ?? ''} ${text}`.trim().slice(0, 1500);
      }
      return { ok: true, rows: out, total: out.length };
    }
    return { ok: false, reason: 'list_table_not_found' };
  }, { columns: LIST_COLUMNS });

  if (!rows.ok) return { ...rows, step: 'list_read' };
  for (const r of rows.rows) {
    r.detail = parseRequestDetailText(r.detailText);
    if (r.detailText) r.tik91 = /תיק\s*החזר\s*מס\s*\(91\)/.test(r.detailText);
    delete r.detailText;
  }

  const attributed = attributeRows(rows.rows, {
    requestNumber, entityId, searchedBy: searched.by, expectedClientName,
  });
  if (!attributed.ok) return { ...attributed, step: 'list_read' };
  return { ok: true, rows: attributed.rows, total: rows.total, searchedBy: searched.by, source: 'dom', listed };
}

/** פותח את פירוט השורות הגלויות (חץ Kendo). תצוגה בלבד. */
async function expandVisibleRows(page) {
  return page.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const forbidden = /ביטול|מחיק|מחק|הדפס|טעינת|pdf|delete|cancel|upload/i;
    let clicked = 0;
    for (const tr of document.querySelectorAll('tr.k-master-row')) {
      const icon = [...tr.querySelectorAll('td.k-hierarchy-cell a, a.k-i-expand, .k-icon.k-i-expand, a.k-plus, .k-i-plus')]
        .find((e) => e.offsetParent !== null
          && (e.closest('td.k-hierarchy-cell') || /k-i-expand|k-plus|k-i-plus/.test(String(e.className || '')))
          && !/k-i-collapse|k-minus/.test(String(e.className || ''))
          && !forbidden.test(`${clean(e.textContent)} ${e.getAttribute('title') || ''} ${e.getAttribute('aria-label') || ''}`));
      if (!icon) continue;
      icon.click();
      clicked++;
    }
    return clicked;
  }).catch(() => 0);
}

// ── כמה בקשות לאותו אדם ─────────────────────────────────────────────────────
// ‼ נצפה חי: לאותו אדם יכולות להיות שתי בקשות (גרוסמן — מ"ה+מע"מ שנקלטו,
// וניכויים שבוטלה «אי טעינת מסמכים במועד»). הכרעה על «הבקשה» מתוך ערבוב של
// שתיהן הייתה מסמנת ייצוג לפי שורה של בקשה אחרת.

/** טהורה: מצב של מערך אחד לפי קוד (עדיף) או טקסט. */
export function rowSystemStateCode(row) {
  const c = row?.codes?.systemState;
  if (Number.isInteger(c)) return c;
  const t = String(row?.systemState ?? row?.rawSystemState ?? '').replace(/\s+/g, ' ');
  if (/נקלט/.test(t)) return 5;
  if (/בוטל/.test(t)) return 6;
  if (/השהיית\s*מטה/.test(t)) return 3;
  if (/לאישור\s*(ה)?לקוח/.test(t)) return 7;
  if (/לפתיחת\s*(ה)?תיק/.test(t)) return 1;
  if (/השהי/.test(t)) return 2;
  return null;
}

function rowRequestStateCode(row) {
  const c = row?.codes?.requestState;
  if (Number.isInteger(c)) return c;
  const t = String(row?.requestState ?? row?.rawRequestState ?? '').replace(/\s+/g, ' ');
  if (/כשל/.test(t)) return 6;
  if (/המתנה\s*למסמכים|ממתין\s*למסמכים/.test(t)) return 1;
  if (/נדח/.test(t)) return 4;
  if (/בטעינה/.test(t)) return 5;
  if (/אושרו/.test(t)) return 3;
  if (/התקבלו/.test(t)) return 2;
  return null;
}

/**
 * טהורה: מצב בקשה אחת (כל שורות המערכים שלה).
 *   terminal · כל המערכים בוטלו/הבקשה נדחתה — אין בה עוד מה לחכות.
 *   settled  · כל מה שיש לו תיק נקלט, והשאר ממתינים לפתיחת תיק שלא קיים
 *              (הכרעת גיא, 28.09: «פעיל לפי רשות»).
 *   live     · כל השאר.
 */
export function classifyRequestGroup(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return 'unknown';
  const sys = list.map(rowSystemStateCode);
  const req = list.map(rowRequestStateCode);
  if (list.every((r, i) => sys[i] === 6 || req[i] === 4)) return 'terminal';
  const accepted = sys.filter((c) => c === 5).length;
  const waitingNoFile = list.filter((r, i) => sys[i] === 1 && r.noFile === true).length;
  if (accepted > 0 && accepted + waitingNoFile === list.length) return 'settled';
  return 'live';
}

/** טהורה: השורות לפי מספר בקשה. שורה בלי מספר נכנסת לקבוצה ''. */
export function requestGroupsOf(rows) {
  const groups = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const key = digitsOf(r?.detail?.requestNumber);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return groups;
}

/**
 * טהורה: «הבקשה» של האדם מתוך השורות שנמצאו.
 * ‼ מספר בקשה שמור ⇒ רק השורות שלו. אחרת ⇒ הבקשה החיה האחרונה; אם אין חיה ⇒
 * האחרונה בכלל. שתי בקשות חיות ⇒ לא בוחרים (ambiguous).
 */
export function currentRequestRows(rows, { requestNumber } = {}) {
  const want = digitsOf(requestNumber);
  const groups = requestGroupsOf(rows);
  if (want) {
    const mine = groups.get(want) ?? [];
    return { ok: true, requestNumber: want, rows: mine, others: [...groups.keys()].filter((k) => k && k !== want) };
  }
  if (groups.size <= 1) {
    const [key, list] = [...groups.entries()][0] ?? ['', []];
    return { ok: true, requestNumber: key || null, rows: list, others: [] };
  }
  const toTime = (d) => { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(String(d ?? '')); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : 0; };
  const entries = [...groups.entries()].map(([key, list]) => ({
    key, list, kind: classifyRequestGroup(list), at: Math.max(...list.map((r) => toTime(r.date))),
  }));
  if (entries.some((e) => e.key === '')) return { ok: false, reason: 'cannot_attribute', detail: 'שורה בלי מספר בקשה בין כמה בקשות' };
  const live = entries.filter((e) => e.kind === 'live');
  if (live.length > 1) return { ok: false, reason: 'ambiguous_request', detail: 'לאדם הזה יותר מבקשה פתוחה אחת בשע״ם' };
  const pick = live[0] ?? entries.sort((a, b) => b.at - a.at)[0];
  return { ok: true, requestNumber: pick.key, rows: pick.list, others: entries.filter((e) => e !== pick).map((e) => e.key) };
}

/**
 * «הזן ייפוי כוח בשע״ם» — מה עושים אחרי הבדיקה שלפני היצירה. טהורה.
 *
 * ‼ 24.09.2026 · הבדיקה (קריאה בלבד, ברשימת «בקשות בתהליך» לפי ישות) היא
 * תנאי-קדם **בתוך** פעולת ההזנה, לא כפתור נפרד. רק 'none' מתיר להתחיל את
 * הפנייה החיצונית (אימות הישות ואילך). כל השאר עוצר לפני כל נגיעה:
 *   existing   · נמצאה בקשה של האדם הזה ⇒ לא יוצרים; מדווחים אותה כמו בדיקה.
 *   ambiguous  · יש שורות לישות שאי אפשר לבסס שהן שלו (או סתירה) ⇒ עצירה.
 *   unreadable · הרשימה לא נקראה, או «ריק» בלי ראיה שהיא ריקה ⇒ עצירה.
 * ‼ «ריק» = אפס שורות **וגם** המסך אומר שאין (מוצגים 0 / אין רשומות). אפס
 * שורות בלי אחד מהם הוא היעדר ידיעה, ולא פותחים עליו בקשה.
 */
export function createPreflightDecision(found) {
  if (!found?.ok) {
    if (found?.reason === 'identity_mismatch' || found?.reason === 'cannot_attribute') {
      return { decision: 'ambiguous', reason: found.reason };
    }
    return { decision: 'unreadable', reason: found?.reason ?? 'unknown' };
  }
  const rows = Array.isArray(found.rows) ? found.rows : [];
  const total = Number.isInteger(found.total) ? found.total : rows.length;
  if (rows.length > 0) {
    // ‼ 28.09.2026 · בקשות קודמות שכולן בוטלו/נדחו (נצפה: «אי טעינת מסמכים
    // במועד») אינן «בקשה קיימת» — אפשר לפתוח חדשה. הבדיקה של שע״ם עצמה בשלב 2
    // («הנך בתהליכי בקשת ייפויי כוח לתיק זה») עדיין חוסמת כפילות אמיתית.
    const groups = requestGroupsOf(rows);
    if (!groups.has('') && [...groups.values()].every((g) => classifyRequestGroup(g) === 'terminal')) {
      return { decision: 'none', priorTerminal: [...groups.keys()] };
    }
    const current = currentRequestRows(rows);
    if (!current.ok) return { decision: 'ambiguous', reason: current.reason };
    return { decision: 'existing', rows: current.rows, requestNumber: current.requestNumber, others: current.others };
  }
  // שורות לישות הזאת שלא יוחסו לשם שלה — ייתכן שזו אותה בקשה בשם אחר.
  if (total > 0) return { decision: 'ambiguous', reason: 'unattributed_rows_for_entity' };
  if (found.listed?.count === 0 || found.listed?.noRecords === true) return { decision: 'none' };
  return { decision: 'unreadable', reason: 'empty_list_unconfirmed' };
}

/**
 * השורות שיוחסו מתארות **בקשה אחת** — או שעוצרים.
 *
 * ‼ 23.09.2026 · הבקשה של הדסה סלע נמצאה בשע״ם, אבל מספר הבקשה לא מוצג
 * ברשימה. בלי מספר, «זו הבקשה» נשען על שלושה דברים יחד: השורות יוחסו לאדם
 * (attributeRows, לפי שם), כולן מאותו יום הזנה ובאותו מצב בקשה, ואף מערך
 * לא מופיע פעמיים. מערך כפול פירושו שתי בקשות פתוחות לאותו אדם — ואז
 * לחיצה על «הראשונה» היא ניחוש. טהורה, כדי שתיבדק בלי דפדפן.
 */
export function singleAttributedRequest(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return { ok: false, reason: 'request_not_found_in_list' };
  const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
  const numbers = new Set(list.map((r) => String(r?.detail?.requestNumber ?? '').replace(/\D/g, '')).filter(Boolean));
  if (numbers.size > 1) return { ok: false, reason: 'ambiguous_request', detail: 'השורות שייכות ליותר ממספר בקשה אחד' };
  const dates = new Set(list.map((r) => clean(r.date)));
  const states = new Set(list.map((r) => clean(r.requestState)));
  if (dates.size !== 1 || [...dates][0] === '') {
    return { ok: false, reason: 'ambiguous_request', detail: 'לשורות של האדם הזה תאריכי הזנה שונים (או חסרים)' };
  }
  if (states.size !== 1) return { ok: false, reason: 'ambiguous_request', detail: 'לשורות של האדם הזה מצבי בקשה שונים' };
  const systems = list.map((r) => clean(r.system));
  if (systems.some((x) => !x) || new Set(systems).size !== systems.length) {
    return { ok: false, reason: 'ambiguous_request', detail: 'אותו מערך מופיע יותר מפעם אחת — ייתכן שיש שתי בקשות פתוחות' };
  }
  if (list.some((r) => !Number.isInteger(r.trIndex) || !Number.isInteger(r.tableIndex))) {
    return { ok: false, reason: 'ambiguous_request', detail: 'מיקום השורה בטבלה לא נקרא' };
  }
  return { ok: true, row: list[0], requestNumber: [...numbers][0] ?? null };
}

/**
 * המסך שנפתח שייך לאדם שלנו? נבדק **אחרי** הפתיחה ו**לפני** כל העלאה.
 * ‼ ראיה חיובית בלבד: הת.ז. של הישות, או שם הלקוח המלא, מופיעים במסך.
 * «לא סותר» אינו מספיק — מסך שלא מראה אף אחד מהשניים עוצר.
 */
export function openedScreenMatches(bodyText, { entityId, expectedClientName }) {
  const text = String(bodyText ?? '').replace(/\s+/g, ' ');
  const id = String(entityId ?? '').replace(/\D/g, '');
  if (id) {
    const bare = id.replace(/^0+/, '');
    const digits = text.match(/\d{5,9}/g) ?? [];
    if (digits.some((d) => d === id || (bare && d.replace(/^0+/, '') === bare))) return true;
  }
  return !!expectedClientName && nameMatches(text, expectedClientName);
}

// ── המשך בקשה קיימת: רשימה → «טעינת מסמכים» → פרטי התקשרות → מסמכים ──────
//
// ‼ 23.09.2026 · נבנה מחדש לפי המסכים האמיתיים (צילומי מסך של גיא, בקשה
// 2026538930 של הדסה סלע), אחרי שהניסיון החי הראשון נעצר ברשימה עצמה —
// לפני כל לחיצה ולפני כל העלאה:
//   1. ברשימת «בקשות בתהליך», בעמודת «פעולות» של השורה, יש כמה סמלים:
//      PDF, מחיקה (X), פירוט — וחץ העלאה שהריחוף עליו אומר «טעינת מסמכים».
//      רק החץ הזה. הקוד הישן חיפש רק a/button/img עם title, ולא מצא.
//   2. הלחיצה פותחת «בקשה לרישום ייפוי כוח חדש» בשלב **3** («פרטי
//      התקשרות למיוצג <ת.ז.> - <שם>»), לא בשלב 4. מספר הבקשה **מוצג** כאן
//      («מספר בקשה: 2026538930») — גם כשהרשימה לא הציגה אותו.
//   3. «המשך» בלי לשנות דבר ⇒ שלב 4, «טעינת מסמכים למיוצג <ת.ז.> - <שם>»,
//      שורת «טופס ייפוי כוח» עם «+», ותיבת «אני מאשר את חתימת בן/ת הזוג על
//      טופס ייפוי הכוח».

const UPLOAD_ACTION_RE = /טעינת\s*מסמכים/;
/** סמלים אחרים באותה עמודה — לעולם לא נלחצים בזרימה הזאת. */
const FORBIDDEN_ACTION_RE = /pdf|delete|remove|trash|close|times|cancel|מחיק|מחק|ביטול|הדפס|print|צפי|view|info|details|פירוט/i;

/**
 * בוחר את פקד «טעינת מסמכים» מבין הפקדים בעמודת הפעולות — או עוצר.
 * ‼ טהורה. כל מועמד מתואר בטקסט שלו: תכונות (title/aria/alt/...), מחלקות,
 * ו-tooltip שהופיע בריחוף. בדיוק מועמד אחד שמכריז «טעינת מסמכים», ואינו
 * נושא סימן של פעולה אחרת (PDF/מחיקה/פירוט). אפס או יותר מאחד ⇒ עצירה.
 */
export function pickUploadDocumentsControl(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  // ‼ פקד מוסתר (ng-hide) קיים ב-DOM ואינו גלוי — לעולם אינו מועמד.
  const says = (c) => !c?.hidden && UPLOAD_ACTION_RE.test(`${c?.attrText ?? ''} ${c?.tooltip ?? ''}`);
  const forbidden = (c) => FORBIDDEN_ACTION_RE.test(`${c?.attrText ?? ''} ${c?.classText ?? ''}`)
    && !UPLOAD_ACTION_RE.test(c?.attrText ?? '');
  const hits = list.map((c, i) => ({ c, i })).filter(({ c }) => says(c) && !forbidden(c));
  if (hits.length === 0) return { ok: false, reason: 'upload_action_not_found' };
  if (hits.length > 1) return { ok: false, reason: 'upload_action_ambiguous' };
  return { ok: true, index: hits[0].i };
}

/**
 * המסך שנפתח שייך לאדם שלנו — **גם** ת.ז. **וגם** שם מלא.
 * ‼ לפעולה משנה, קשוח יותר מ-openedScreenMatches: כותרת המסך האמיתית היא
 * «פרטי התקשרות למיוצג 034605212 - סלע הדסה», ושני הרכיבים חייבים להופיע.
 */
export function openedRequestIdentity(bodyText, { entityId, expectedClientName }) {
  const text = String(bodyText ?? '').replace(/\s+/g, ' ');
  const id = String(entityId ?? '').replace(/\D/g, '');
  const bare = id.replace(/^0+/, '');
  const digits = text.match(/\d{5,9}/g) ?? [];
  const idOk = !!id && digits.some((d) => d === id || (bare && d.replace(/^0+/, '') === bare));
  const nameOk = !!expectedClientName && nameMatches(text, expectedClientName);
  const m = /מספר\s*בקשה\s*:?\s*(\d{6,})/.exec(text);
  return { ok: idOk && nameOk, idOk, nameOk, requestNumber: m ? m[1] : null };
}




// ‼ 23.09.2026 · נקרא מה-DOM החי: החץ הוא <input type="button" class="icon
// upload" k-content="'טעינת מסמכים'">, והשאר <div type="button" ...>
// («אירועים קודמים», «ביטול הבקשה» ‼, סמל ה-PDF). ה-tooltip של
// Kendo יושב בתכונה k-content. פקדים עם ng-hide נמצאים ב-DOM ואינם גלויים.
export const ACTION_CANDIDATES = 'a, button, input[type=button], input[type=image], [type=button], [role=button], [kendo-tooltip], img, i, svg, span[class*="icon"], span[class*="fa-"], span[class*="k-i-"]';
/**
 * מתאר את הפקדים בשורה — קריאה בלבד (בלי לחיצה, בלי ריחוף). מיוצא כדי
 * שאפשר יהיה לבדוק אותו מול השורה החיה בלי להריץ את הזרימה.
 */
export async function describeActionCandidates(rowLoc) {
  return rowLoc.locator(ACTION_CANDIDATES).evaluateAll((els) => els.map((e) => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const attrText = ['k-content', 'title', 'aria-label', 'alt', 'value', 'data-title', 'data-original-title', 'data-tooltip',
      'ng-reflect-title', 'ng-reflect-message', 'mattooltip', 'kendotooltip', 'tooltip', 'src', 'href']
      .map((a) => e.getAttribute(a) || '').join(' ');
    const svgUse = e.querySelector?.('use')?.getAttribute('href') || e.querySelector?.('use')?.getAttribute('xlink:href') || '';
    return {
      attrText: clean(`${attrText} ${svgUse}`),
      classText: String(e.className?.baseVal ?? e.className ?? ''),
      nested: [...els].some((o) => o !== e && e.contains(o)),
      hidden: e.offsetParent === null || /(^|\s)ng-hide(\s|$)/.test(String(e.className?.baseVal ?? e.className ?? '')),
      tooltip: '',
    };
  }));
}

// ── הזרימה, לפי קוד האפליקציה של שע״ם (נקרא 23.09.2026, בלי לנווט) ────────
//
// ‼ מקור האמת כאן אינו ניחוש ולא צילום מסך בלבד: התבניות והבקרים של
// «מערכת לרישום ייצוג» נקראו מתוך הדף הפתוח (GET לקבצים סטטיים/$templateCache):
//   · שלב 3 — state `pirteyHitkashrut`. הכפתורים הם <button btntype="hemshech"
//     btnclick="vm.hemshech()">, <button btntype="idkun"> («עדכון» — **שומר**
//     לשרת, updatePir…), <button btntype="chazara">. hemshech() = ניווט בלבד
//     ($state.go('uploadKasafot')) — בלי כתיבה לשרת.
//   · שלב 4 — state `uploadKasafot`. fileList[0] = {id:1,"טופס ייפוי כוח"}.
//     השורה: div.BoxA > label.required + <u>{{UploadName}}</u> + input.icon.plus
//     (ng-hide=isAdded); אחרי טעינה: .icon.replace + .icon.checkmark.
//     «+» פותח את #dialogTeinatAsmachta (shaam-window-open-close) ובו
//     shaam-file-upload: input[name=myFile][type=file] של Kendo, autoUpload
//     לאחסון זמני (GDUploadAPI/UploadFile), וב-success ⇒ vm.uploadFile(0) ⇒
//     isAdded. שגיאת טעינה: #errDiv.alert-warning בתוך הדיאלוג.
//     תיבת בן/ת הזוג: input[type=checkbox][ng-model="vm.isCheckeChatimatBz"],
//     בשתי גרסאות (חובה/רשות) — רק אחת גלויה.
//     «המשך» = vm.hemshech(): בודק שכל המסמכים נטענו ושהתיבה סומנה כשהיא
//     חובה, ושולח **את הכול לבקשה** (uploadToKasafot/GetFile). זו ההגשה.
//     הצלחה ⇒ $state.go('returnUpload'); כישלון ⇒ .alert-danger גלוי במסך.
//   · שלב 5 — state `returnUpload`: «אישור קליטת מסמכים למיוצג <ת.ז.> -
//     <שם>», סימן V ירוק, «עכשיו תורנו...», «אנחנו בודקים כרגע את הקבצים
//     שצירפת», ושורת מצב לפי statusBakasha.
//   · השלב הנוכחי מסומן ברצועה: .bs-wizard-dot עם המחלקה active.

const HEMSHECH = 'button[btntype="hemshech"]';

/**
 * שגיאה גלויה במסך. ‼ 23.09.2026 · הניסיון השלישי נעצר על «כתובת מייל אינה
 * תקינה» — div#divMasterErr.alert-danger בתוך הדיאלוג **המוסתר** «שליחת פניה
 * במקרה של תקלה». אלמנט שאינו מוצג אינו שגיאה של המסך.
 */
export async function readScreenError(page) {
  return page.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const visible = (e) => e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden';
    const nodes = [...document.querySelectorAll(
      '.error, .alert-danger, .validation-summary-errors, .field-validation-error, [role="alert"], .text-danger',
    )].filter(visible);
    const msgs = nodes.map((n) => clean(n.textContent)).filter(Boolean);
    return msgs.length ? msgs.join(' · ').slice(0, 300) : null;
  });
}

/**
 * השלב מתוך טקסט המסך — טהורה, כדי שתיבדק מול המסכים האמיתיים.
 * ‼ רצועת השלבים מוצגת בכל מסך של האשף; מסירים אותה לפני שמחפשים כותרת.
 * שלב 5 (ההצלחה) מזוהה לפי כותרת המסך שלו — «אישור קליטת מסמכים למיוצג» —
 * או «השהייה וסיום» רק מחוץ לרצועה שהוסרה בפועל.
 */
export function wizardStepFromText(body, strip) {
  const clean = (x) => String(x ?? '').replace(/\s+/g, ' ').trim();
  let text = clean(body);
  if (strip) text = text.split(clean(strip)).join(' ');
  const headings = [
    { n: 5, re: /אישור\s+קליטת\s+מסמכים\s+למיוצג/ },
    { n: 4, re: /טעינת\s+מסמכים\s+למיוצג/ },
    { n: 3, re: /פרטי\s+התקשרות\s+למיוצג/ },
    { n: 2, re: /בקשה\s+חדשה\s+לייצוג/ },
    { n: 5, re: /השהייה\s+וסיום/, needsStrip: true },
    { n: 1, re: /אימות\s+(המיוצג|ישות)/, needsStrip: true },
  ];
  for (const h of headings) {
    if (h.needsStrip && !strip) continue;
    if (h.re.test(text)) return h.n;
  }
  return strip ? 0 : null;
}

/**
 * השלב הנוכחי: הנקודה הפעילה ברצועה (.bs-wizard-dot.active), ובנוסף כותרת
 * המסך. ‼ שני המקורות חייבים להסכים; אם אין נקודה פעילה אחת — הכותרת לבדה.
 */
export async function currentWizardStep(page) {
  const r = await page.evaluate(() => {
    const clean = (x) => (x || '').replace(/\s+/g, ' ').trim();
    const dots = [...document.querySelectorAll('.bs-wizard-dot.active')].filter((e) => e.offsetParent !== null);
    const labels = [/אימות\s+ישות/, /פרטי\s+התקשרות/, /טעינת\s+מסמכים/, /השהייה\s+וסיום/];
    const strip = [...document.querySelectorAll('body *')]
      .filter((e) => { const t = clean(e.textContent); return t.length < 200 && labels.every((re) => re.test(t)); })
      .sort((a, b) => clean(a.textContent).length - clean(b.textContent).length)[0];
    return {
      dots: dots.map((d) => clean(d.textContent)),
      body: document.body.innerText || '',
      strip: strip ? strip.innerText : '',
    };
  });
  return wizardStepResolve(r);
}

/** טהורה: הנקודה הפעילה + הכותרת ⇒ שלב, או 0 כשהם סותרים. */
export function wizardStepResolve({ dots, body, strip }) {
  const byText = wizardStepFromText(body, strip);
  const d = (dots ?? []).map((x) => Number(String(x).trim())).filter((n) => n >= 1 && n <= 5);
  if (d.length !== 1) return byText;
  if (byText && byText !== d[0]) return 0;
  return d[0];
}

/**
 * «המשך» — טהורה: בדיוק כפתור אחד, גלוי ופעיל, לפי btntype="hemshech" ועם
 * הטקסט «המשך». ‼ «עדכון» (idkun, שומר לשרת) ו«חזרה» (chazara) לעולם לא.
 * @param buttons [{btntype, label, visible, disabled}]
 */
export function pickContinueButton(buttons) {
  const list = Array.isArray(buttons) ? buttons : [];
  const live = list.filter((b) => b.btntype === 'hemshech' && b.visible && !b.disabled);
  if (live.length !== 1) {
    const total = list.filter((b) => b.btntype === 'hemshech').length;
    return { ok: false, reason: live.length ? 'continue_ambiguous' : 'continue_not_found', detail: `גלויים: ${live.length}/${total}` };
  }
  if (String(live[0].label ?? '').trim() !== 'המשך') return { ok: false, reason: 'continue_label_mismatch', detail: live[0].label };
  return { ok: true };
}

async function clickHemshech(page) {
  const buttons = await page.evaluate(() => [...document.querySelectorAll('button[btntype]')].map((b) => ({
    btntype: b.getAttribute('btntype'),
    label: (b.textContent || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(),
    visible: b.offsetParent !== null && getComputedStyle(b).visibility !== 'hidden',
    disabled: !!b.disabled,
  })));
  const pick = pickContinueButton(buttons);
  if (!pick.ok) return pick;
  const clicked = await page.locator(`${HEMSHECH}:visible`).click({ timeout: 8000 }).then(() => true).catch(() => false);
  return clicked ? { ok: true } : { ok: false, reason: 'continue_click_failed' };
}

/**
 * פקדים שאינם «המשך» ושאסור ללחוץ עליהם בזרימה הזאת, כדי שבדיקה תוכל לוודא
 * שהבורר לא תופס אותם: «עדכון» שומר פרטי התקשרות לשרת, «חזרה» חוזר לרשימה.
 */
export const NEVER_CLICK_BTNTYPES = ['idkun', 'chazara'];

// ── שלב 4: «טעינת מסמכים» — חמש השורות הקבועות של שע״ם (204) ──────────────
//
// ‼ מקור האמת: קוד האפליקציה של שע״ם, שמור ב-worker/test/fixtures/shaam-src-2026-09-23/.
// `fileList` שם הוא רשימה **קבועה** של חמש שורות, ושע״ם מציגה כל שורה לפי
// `mismachimNidrashim` שמגיע מהשרת שלה. הכיתוב של כל שורה קבוע, ולכל שורה
// דיאלוג טעינה משלה עם `id` קבוע. כל שורה גלויה היא חובה (`label.required`,
// ו-«המשך» נכשל על «יש לטעון את כל המסמכים»). שע״ם מקבלת PDF בלבד.
// ‼ שורה 1 נצפתה חיה (הדסה סלע, 23.09.2026). שורות 2–5 נגזרות מהקוד — ולכן
// העלאה של מסמך נוסף נעצרת במקרה החי הראשון (EXTRA_DOCUMENT_UPLOAD_LIVE_VERIFIED
// ב-handlers/shaamSubmitPoa.mjs).
export const SHAAM_DOC_SLOTS = Object.freeze([
  Object.freeze({ id: 1, label: 'טופס ייפוי כוח', dialog: 'dialogTeinatAsmachta', titleHint: 'טעינת בקשה', kind: 'poa', supported: true }),
  Object.freeze({ id: 2, label: 'תצלום תעודת זהות או רישיון נהיגה', dialog: 'dialogTeinatTzilumTz', titleHint: 'תעודת זהות', kind: 'idOrLicense', supported: true }),
  Object.freeze({ id: 3, label: 'צו ירושה + מכתב מעו"ד', dialog: 'dialogTeinatTzavY', titleHint: 'צו ירושה', kind: 'inheritance', supported: false }),
  Object.freeze({ id: 4, label: 'צו שיפוטי למינוי אפוטרופוס', dialog: 'dialogTeinatIpkH', titleHint: 'ייפויי כוח', kind: 'guardianship', supported: false }),
  Object.freeze({ id: 5, label: 'צילום דרכון', dialog: 'dialogTeinatTzilumDarkon', titleHint: 'דרכון', kind: 'passport', supported: true }),
]);

/** כיתוב לנרמול השוואה: רווחים, כוכבית החובה, ומרכאות (״/" ו-׳/'). */
export function normDocLabel(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim()
    .replace(/^\*+\s*|\s*\*+$/g, '')
    .replace(/[״”“]/g, '"').replace(/[׳’‘]/g, "'")
    .trim();
}

/** השורה הקבועה לפי הכיתוב — התאמה מדויקת בלבד. כיתוב אחר ⇒ null, לא ניחוש. */
export function slotForLabel(label) {
  const n = normDocLabel(label);
  if (!n) return null;
  return SHAAM_DOC_SLOTS.find((s) => normDocLabel(s.label) === n) ?? null;
}

/**
 * ת.ז. המיוצג מכותרת המסך: «טעינת מסמכים למיוצג <ת.ז.> - <שם>».
 * ‼ זה האדם שהבקשה בשע״ם שייכת לו — ולכן גם בעל כל מסמך ששע״ם דורשת במסך
 * הזה (שורות המסמכים עצמן אינן נושאות שם). ת.ז. אחת בדיוק אחרי «למיוצג»;
 * אפס או יותר מאחת ⇒ אין ודאות, ולא מנחשים.
 */
export function documentsHeaderEntity(bodyText) {
  const text = String(bodyText ?? '').replace(/\s+/g, ' ');
  const ids = [...text.matchAll(/למיוצג\s*:?\s*(\d{5,9})(?!\d)/g)].map((m) => m[1].padStart(9, '0'));
  const unique = [...new Set(ids)];
  if (unique.length !== 1) {
    return { ok: false, reason: unique.length ? 'header_entity_ambiguous' : 'header_entity_not_found', ids: unique };
  }
  return { ok: true, entityId: unique[0] };
}

/**
 * שורות המסמכים במסך — פונקציה עצמאית שרצה בדף (page.evaluate).
 * ‼ לפי התבנית: div.BoxA > label.required{שם} + <u>{קובץ}</u> +
 * input.icon.plus (לפני טעינה) או .icon.replace + .icon.checkmark (אחרי).
 * @param arg {{ mode?: 'read' | 'clickPlus', label?: string }}
 */
function docRowsProbe(arg) {
  const mode = arg && arg.mode ? arg.mode : 'read';
  const clean = (x) => (x || '').replace(/\s+/g, ' ').trim();
  const norm = (x) => clean(x).replace(/^\*+\s*|\s*\*+$/g, '')
    .replace(/[״”“]/g, '"').replace(/[׳’‘]/g, "'").trim();
  const visible = (e) => !!e && e.offsetParent !== null;
  const boxes = [...document.querySelectorAll('.BoxA')].filter(visible);
  const pluses = (b) => [...b.querySelectorAll('input[type=button].plus, .icon.plus')].filter(visible)
    .filter((e, _, all) => !all.some((o) => o !== e && e.contains(o)));
  const describe = (b) => {
    const lab = b.querySelector('label');
    const uploadName = clean(b.querySelector('u')?.textContent);
    return {
      label: norm(lab?.textContent),
      required: !!lab?.classList?.contains('required') || /\*/.test(lab?.textContent || ''),
      uploadName,
      hasFile: !!uploadName || [...b.querySelectorAll('.icon.checkmark')].some(visible),
      plusControls: pluses(b).length,
      text: clean(b.textContent).slice(0, 200),
    };
  };
  const rows = boxes.map(describe).filter((r) => r.label);
  if (mode !== 'clickPlus') return { rows };
  const want = norm(arg && arg.label);
  const hits = boxes.filter((b) => norm(b.querySelector('label')?.textContent) === want);
  if (hits.length !== 1) {
    return { rows, clicked: false, reason: hits.length ? 'document_row_ambiguous' : 'document_row_not_found' };
  }
  const row = describe(hits[0]);
  if (row.hasFile) return { rows, clicked: false, reason: 'row_already_populated' };
  const p = pluses(hits[0]);
  if (p.length !== 1) return { rows, clicked: false, reason: p.length ? 'upload_opener_ambiguous' : 'upload_opener_not_found' };
  p[0].click();
  return { rows, clicked: true };
}

/**
 * ההחלטה המבנית על מסך «טעינת מסמכים» — לפני שנוגעים בשע״ם. טהורה.
 * ‼ כל עצירה כאן קורית **לפני** סימן הנגיעה ולפני כל «+».
 * ‼ לא מחליטה אם יש לנו את המסמכים הנוספים — רק מה המסך דורש ושהוא בר-ביצוע.
 * @returns {{ ok: true, checkSpouse: boolean, entityId: string, extraSlots: object[] }
 *   | { ok: false, reason: string, detail?: string, slots?: number[] }}
 */
export function documentsStepPlan(state, { spouseSignatureConfirmed } = {}) {
  if (!state?.identityOk) return { ok: false, reason: 'documents_screen_identity_unverified' };
  // ‼ הבעלים של הדרישות = הת.ז. שבכותרת. בלי ת.ז. אחת ודאית — אין את מי לשייך.
  if (!state.headerEntityId) {
    return { ok: false, reason: 'documents_screen_identity_unverified', detail: 'ת.ז. המיוצג לא נקראה בוודאות מכותרת המסך' };
  }
  if (state.expectedEntityId && state.headerEntityId !== state.expectedEntityId) {
    return { ok: false, reason: 'documents_screen_identity_unverified', detail: `בכותרת ${state.headerEntityId}` };
  }
  const rows = state.rows ?? [];
  const unknown = rows.filter((r) => !slotForLabel(r.label));
  if (unknown.length) return { ok: false, reason: 'unknown_document_row', detail: unknown.map((r) => r.label).join(', ') };
  const slotIds = rows.map((r) => slotForLabel(r.label).id);
  if (new Set(slotIds).size !== slotIds.length) return { ok: false, reason: 'document_row_ambiguous' };

  const poa = rows.filter((r) => slotForLabel(r.label).kind === 'poa');
  if (poa.length !== 1) return { ok: false, reason: poa.length ? 'poa_row_ambiguous' : 'poa_row_not_found' };
  // ‼ כבר נטען קובץ לשורה — לא מעלים שני. ההחלטה חוזרת לאדם/לבדיקה.
  if (poa[0].hasFile) return { ok: false, reason: 'poa_already_uploaded' };
  const extras = rows.filter((r) => r !== poa[0]);
  const populated = extras.filter((r) => r.hasFile);
  if (populated.length) return { ok: false, reason: 'row_already_populated', detail: populated.map((r) => r.label).join(', ') };
  // ‼ צו ירושה / מינוי אפוטרופוס — אינם מסמך מזהה, ולא מעמידים פנים שהם כן.
  const unsupported = extras.map((r) => slotForLabel(r.label)).filter((s) => !s.supported);
  if (unsupported.length) {
    return { ok: false, reason: 'unsupported_required_document', detail: unsupported.map((s) => s.label).join(', '), slots: unsupported.map((s) => s.id) };
  }
  if (poa[0].plusControls !== 1) return { ok: false, reason: poa[0].plusControls ? 'upload_opener_ambiguous' : 'upload_opener_not_found' };
  const badOpener = extras.find((r) => r.plusControls !== 1);
  if (badOpener) {
    return { ok: false, reason: badOpener.plusControls ? 'upload_opener_ambiguous' : 'upload_opener_not_found', detail: badOpener.label };
  }
  if (state.spouseCheckboxes > 1) return { ok: false, reason: 'spouse_checkbox_ambiguous' };
  // ‼ המסך מבקש את האישור, ואנחנו לא מוצאים את התיבה — עוצרים.
  if (state.spouseLabelOnScreen && state.spouseCheckboxes === 0) return { ok: false, reason: 'spouse_checkbox_not_found' };
  // ‼ התיבה מסומנת רק כש-PIVO הוכיחה את חתימת בן/בת הזוג בטופס הסופי.
  if (state.spouseCheckboxes === 1 && spouseSignatureConfirmed !== true) {
    return { ok: false, reason: 'spouse_signature_not_proven' };
  }
  if (state.continueButtons !== 1) return { ok: false, reason: state.continueButtons ? 'continue_ambiguous' : 'continue_not_found' };
  return {
    ok: true,
    checkSpouse: state.spouseCheckboxes === 1,
    entityId: state.headerEntityId,
    extraSlots: extras.map((r) => slotForLabel(r.label)),
  };
}

/**
 * טהורה: מה עושים עם השורות הנוספות, אחרי שהשרת ענה מה יש לנו לכל אחת.
 * ‼ סדר העדיפות: אי אפשר לשייך ⇒ אי אפשר להמיר ⇒ חסר ⇒ עצירת אימות ראשון.
 * כל אחד מאלה עוצר **לפני** נגיעה. רק כשלכל שורה יש PDF מאומת — ממשיכים.
 * @param resolved [{ slot, result: { ok, error?, person?, fileName?, pageCount?, sourceDocumentIds? } }]
 */
export function documentsSubmissionDecision(resolved, { extraUploadVerified } = {}) {
  const list = Array.isArray(resolved) ? resolved : [];
  const by = (err) => list.filter((x) => !x.result?.ok && x.result?.error === err);
  const bad = list.filter((x) => !x.result?.ok);
  // ‼ 208 · not_confirmed — יש בתיק צילום, אבל הלקוח עוד לא אישר שהוא שלו: ממתינים כמו למסמך חסר.
  const unexpected = bad.filter((x) => !['needs_document_assignment', 'not_pdf_convertible', 'missing', 'not_confirmed'].includes(x.result?.error));
  if (unexpected.length) return { ok: false, code: 'required_document_unavailable', slots: unexpected };
  if (by('needs_document_assignment').length) return { ok: false, code: 'needs_document_assignment', slots: by('needs_document_assignment') };
  if (by('not_pdf_convertible').length) return { ok: false, code: 'document_not_pdf_convertible', slots: by('not_pdf_convertible') };
  const waiting = [...by('missing'), ...by('not_confirmed')];
  if (waiting.length) return { ok: false, code: 'awaiting_required_documents', slots: waiting };
  if (list.length && extraUploadVerified !== true) return { ok: false, code: 'first_live_verification', slots: list };
  return { ok: true, uploads: list };
}

/** מצב מסך «טעינת מסמכים», קריאה בלבד. */
export async function readDocumentsStep(page, { entityId, expectedClientName }) {
  const probe = await page.evaluate(docRowsProbe, { mode: 'read' });
  const raw = await page.evaluate((sel) => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const visible = (e) => e.offsetParent !== null;
    const spouseBoxes = [...document.querySelectorAll('input[type=checkbox][ng-model="vm.isCheckeChatimatBz"]')].filter(visible);
    return {
      body: document.body.innerText || '',
      spouseCheckboxes: spouseBoxes.length,
      spouseChecked: spouseBoxes.length === 1 ? spouseBoxes[0].checked : null,
      spouseLabelOnScreen: [...document.querySelectorAll('p')].filter(visible)
        .some((p) => /מאשר\s+את\s+חתימת\s+בן\s*[\/\\]?\s*ת?\s*הזוג/.test(clean(p.textContent))),
      continueButtons: [...document.querySelectorAll(sel)].filter((b) => visible(b) && !b.disabled).length,
    };
  }, HEMSHECH);
  const id = openedRequestIdentity(raw.body, { entityId, expectedClientName });
  const header = documentsHeaderEntity(raw.body);
  const expected = String(entityId ?? '').replace(/\D/g, '');
  return {
    ...raw, body: undefined,
    rows: probe.rows ?? [],
    headerEntityId: header.ok ? header.entityId : null,
    headerEntityReason: header.ok ? undefined : header.reason,
    expectedEntityId: expected ? expected.padStart(9, '0') : null,
    identityOk: id.ok, requestNumber: id.requestNumber,
  };
}

/**
 * פותח בקשה קיימת עד מסך «טעינת מסמכים», ומחזיר את מספר הבקשה שנקרא מהמסך.
 *
 * ‼ ניווט בלבד. «המשך» בשלב 3 הוא $state.go (נקרא מהבקר), לא שמירה; «עדכון»
 * — ששומר — לעולם לא נלחץ. שום קובץ אינו נטען כאן. כל עצירה ⇒ «שום דבר לא
 * נשלח». ‼ האיתור ברשימה תמיד לפי ישות + שם (המסלול שנבדק חי); מספר בקשה
 * ידוע משמש לאימות הבקשה שנפתחה, לא לחיפוש.
 */
export async function openRequestForDocuments(page, { requestNumber, entityId, expectedClientName, systemLabel = 'מס הכנסה' }) {
  const want = String(requestNumber ?? '').replace(/\D/g, '');
  if (!entityId || !expectedClientName) {
    return { ok: false, reason: 'cannot_attribute', detail: 'אין ת.ז. ושם לאימות הבקשה שנפתחת', step: 'resume' };
  }
  const found = await findRequestRows(page, { requestNumber: '', entityId, expectedClientName });
  if (!found.ok) return found;
  if (found.rows.length === 0) return { ok: false, reason: 'request_not_found_in_list', step: 'resume' };

  // ‼ 28.09.2026 · לאותו אדם יכולות להיות כמה בקשות (ישנה שבוטלה, או שנקלטה).
  // מספר שמור ⇒ רק השורות שלו; אחרת ⇒ הבקשה החיה היחידה.
  const current = currentRequestRows(found.rows, { requestNumber: want });
  if (!current.ok) return { ...current, step: 'resume' };
  if (current.rows.length === 0) return { ok: false, reason: 'request_not_found_in_list', step: 'resume' };
  const single = singleAttributedRequest(current.rows);
  if (!single.ok) return { ...single, step: 'resume' };
  const norm = (s) => String(s ?? '').replace(/["'״׳]/g, '').replace(/\s+/g, ' ').trim();
  const targetRows = current.rows.filter((r) => norm(r.system) === norm(systemLabel));
  if (targetRows.length !== 1) {
    return { ok: false, reason: 'ambiguous_request', detail: `שורת «${systemLabel}» של הבקשה לא נמצאה בדיוק פעם אחת`, step: 'resume' };
  }
  const target = targetRows[0];
  // ‼ «טעינת מסמכים» קיימת רק לבקשה שממתינה למסמכים (1) או שהטעינה נכשלה (6)
  // — לפי ההדרכה של שע״ם. בקשה במצב אחר: לא מחפשים פקד ללחוץ עליו.
  const reqCode = target.codes?.requestState;
  if (Number.isInteger(reqCode) && reqCode !== 1 && reqCode !== 6) {
    return { ok: false, reason: 'request_not_awaiting_documents', detail: target.requestState || String(reqCode), step: 'resume' };
  }

  // ── עמודת «פעולות»: מועמדים, ואז ריחוף רק אם אין הכרזה בתכונות ────────
  const rowLoc = page.locator('table').nth(target.tableIndex).locator('tbody tr, tr').nth(target.trIndex);
  const describe = () => describeActionCandidates(rowLoc);
  let cands = await describe();
  let pick = pickUploadDocumentsControl(cands);
  if (pick.ok && cands[pick.index].hidden) pick = { ok: false, reason: 'upload_action_hidden' };
  if (!pick.ok && pick.reason === 'upload_action_not_found') {
    // ‼ ה-tooltip אינו בתכונות — הוא מצויר בריחוף. ריחוף אינו פעולה אצל
    // הרשות; קוראים את מה שהופיע, ולא לוחצים על שום דבר בזמן החיפוש.
    for (let i = 0; i < cands.length; i++) {
      if (cands[i].nested || cands[i].hidden) continue;
      const ok = await rowLoc.locator(ACTION_CANDIDATES).nth(i).hover({ timeout: 3000 }).then(() => true).catch(() => false);
      if (!ok) continue;
      await page.waitForTimeout(450);
      cands[i].tooltip = await page.evaluate(() => {
        const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
        return [...document.querySelectorAll('[role=tooltip], .tooltip, .k-tooltip, .mat-tooltip, .mdc-tooltip, .cdk-overlay-container, .p-tooltip')]
          .filter((t) => t.offsetParent !== null || getComputedStyle(t).position === 'fixed')
          .map((t) => clean(t.textContent)).join(' ').slice(0, 200);
      });
    }
    await page.mouse.move(0, 0).catch(() => {});
    pick = pickUploadDocumentsControl(cands);
    if (pick.ok && cands[pick.index].hidden) pick = { ok: false, reason: 'upload_action_hidden' };
  }
  if (!pick.ok) return { ...pick, step: 'resume', detail: cands.map((c) => `${c.attrText}|${c.classText}|${c.tooltip}`.slice(0, 80)).join(' ; ').slice(0, 400) };

  const clicked = await rowLoc.locator(ACTION_CANDIDATES).nth(pick.index).click({ timeout: 8000 }).then(() => true).catch(() => false);
  if (!clicked) return { ok: false, reason: 'upload_action_click_failed', step: 'resume' };
  await settle(page, { idleMs: 20000 });

  // ── שלב 3: פרטי התקשרות — אימות זהות, מספר בקשה, «המשך» בלי לשנות דבר ──
  let step = await currentWizardStep(page);
  const firstBody = await page.evaluate(() => document.body.innerText || '');
  const first = openedRequestIdentity(firstBody, { entityId, expectedClientName });
  if (!first.ok) return { ok: false, reason: 'opened_request_identity_mismatch', detail: `ת.ז.: ${first.idOk ? 'תואם' : 'לא נמצא'} · שם: ${first.nameOk ? 'תואם' : 'לא נמצא'}`, step: 'resume' };
  if (!first.requestNumber) return { ok: false, reason: 'request_number_not_on_screen', step: 'resume' };
  if (want && first.requestNumber !== want) {
    return { ok: false, reason: 'opened_wrong_request', detail: first.requestNumber, step: 'resume' };
  }
  const openedNumber = first.requestNumber;

  if (step === 3) {
    const err0 = await readScreenError(page);
    if (err0) return { ok: false, reason: 'contact_step_error', detail: err0, step: 'contact_continue', requestNumber: openedNumber };
    const go = await clickHemshech(page);
    if (!go.ok) return { ...go, step: 'contact_continue', requestNumber: openedNumber };
    await settle(page, { idleMs: 20000 });
    const err = await readScreenError(page);
    if (err) return { ok: false, reason: 'contact_continue_error', detail: err, step: 'contact_continue', requestNumber: openedNumber };
    step = await currentWizardStep(page);
  }
  if (step !== 4) {
    return { ok: false, reason: 'did_not_reach_documents_step', detail: `שלב נוכחי: ${step}`, step: 'resume', requestNumber: openedNumber };
  }
  const docs = await readDocumentsStep(page, { entityId, expectedClientName });
  if (docs.requestNumber && docs.requestNumber !== openedNumber) {
    return { ok: false, reason: 'opened_wrong_request', detail: docs.requestNumber, step: 'documents', requestNumber: openedNumber };
  }
  return { ok: true, requestNumber: openedNumber, documents: docs };
}

// ── דיאלוג הטעינה של שורה — מתוך תבנית shaam-file-upload וה-DOM החי ─────────
// ‼ 23.09.2026 · ניסיון 4 פתח את הדיאלוג ועצר על file_input_ambiguous, לפני
// בחירת קובץ: ברכיב יש **שני** input[type=file] חיים — name="myFile" בחלק
// של mode!=3 (הגלוי כאן, mode=1), ו-name="myFile1" בחלק של mode==3 (מוסתר).
// «טעינת קובץ» הוא .k-upload-button של Kendo שעוטף את input[name=myFile];
// לחיצה עליו פותחת את בוחר הקבצים של Windows — ולכן מזינים את הקובץ ישירות
// לאותו input (בדיוק מה שהבוחר עושה). autoUpload מעלה לאחסון זמני, וב-success:
// הקובץ ברשימה (.divbutton2 a = UploadName), הכפתור «החלפת קובץ», ו-
// vm.uploadFile(n) ⇒ בשורה <u>UploadName</u> + .icon.checkmark. שגיאה: #errDiv.
// «סגירה» = הכפתור בתחתית הדיאלוג (shaam-buttons, ng-bind=tranbtn).
// ‼ 204 · לכל שורה דיאלוג משלה (`id="{{vm.name}}"` בתבנית shaam-window-open-close),
// ולכן הבדיקה היא שהדיאלוג **היחיד** שנפתח הוא בדיוק זה של השורה שנלחצה.

/** טהורה: input הקובץ של הדיאלוג — myFile בחלק הגלוי, בדיוק אחד. */
export function pickUploadFileInput(inputs) {
  const list = Array.isArray(inputs) ? inputs : [];
  const live = list.map((x, i) => ({ ...x, i })).filter((x) => x.name === 'myFile' && x.containerVisible && !x.disabled);
  if (live.length !== 1) return { ok: false, reason: live.length ? 'file_input_ambiguous' : 'file_input_not_found', detail: list.map((x) => `${x.name}:${x.containerVisible ? 'גלוי' : 'מוסתר'}`).join(',') };
  return { ok: true, index: live[0].i };
}

/** טהורה: «סגירה» בתחתית הדיאלוג — כפתור גלוי אחד עם הטקסט «סגירה» (לא ה-×). */
export function pickDialogCloseButton(buttons) {
  const live = (Array.isArray(buttons) ? buttons : []).map((b, i) => ({ ...b, i }))
    .filter((b) => b.visible && String(b.text ?? '').trim() === 'סגירה');
  if (live.length !== 1) return { ok: false, reason: live.length ? 'close_button_ambiguous' : 'close_button_not_found' };
  return { ok: true, index: live[0].i };
}

/**
 * טהורה: מה הדיאלוג אומר על ההעלאה.
 * ‼ «נטען» רק כשברשימת הדיאלוג יש בדיוק קובץ PDF אחד ואין שגיאה. שגיאה ⇒
 * נדחה. שום דבר ⇒ עדיין לא (או לא ידוע, אם נגמר הזמן).
 */
export function uploadDialogEvidence({ files, err, buttonLabel } = {}, fileName) {
  if (err) return { state: 'rejected', detail: err };
  const list = (files ?? []).map((f) => String(f).trim()).filter(Boolean);
  if (list.length === 1 && /\.pdf$/i.test(list[0])) {
    return { state: 'uploaded', uploadName: list[0], sameName: list[0] === String(fileName ?? '').trim(), buttonLabel };
  }
  if (list.length > 1) return { state: 'ambiguous', detail: list.join(', ') };
  return { state: 'pending' };
}

/**
 * טהורה: האם הדיאלוג הפתוח הוא בדיוק זה של השורה.
 * ‼ דיאלוג אחר, או יותר מאחד פתוח ⇒ עצירה. כותרת שקיימת ואינה של השורה ⇒ עצירה.
 */
export function dialogMatchesSlot(d, slot) {
  if (!d?.exists) return { ok: false, reason: 'upload_dialog_not_open' };
  const open = d.openModals ?? [];
  if (open.length === 0) return { ok: false, reason: 'upload_dialog_not_open' };
  if (open.length !== 1 || open[0] !== slot.dialog) {
    return { ok: false, reason: 'upload_dialog_mismatch', detail: open.join(',') };
  }
  if (d.title && !normDocLabel(d.title).includes(normDocLabel(slot.titleHint))) {
    return { ok: false, reason: 'upload_dialog_mismatch', detail: d.title };
  }
  return { ok: true };
}

async function readUploadDialog(page, dialogId) {
  return page.evaluate((id) => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const visible = (e) => !!e && e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden';
    const dlg = document.getElementById(id);
    const openModals = [...document.querySelectorAll('.modal')]
      .filter((m) => visible(m) || getComputedStyle(m).display === 'block').map((m) => m.id);
    if (!dlg) return { exists: false, openModals };
    const err = dlg.querySelector('#errDiv');
    return {
      exists: true,
      openModals,
      title: clean(dlg.querySelector('.modal-title')?.textContent),
      inputs: [...dlg.querySelectorAll('input[type=file]')].map((f) => ({
        name: f.getAttribute('name') || '',
        containerVisible: visible(f.closest('.k-upload-button') || f.parentElement),
        disabled: !!f.disabled,
      })),
      buttonLabel: clean([...dlg.querySelectorAll('.k-upload-button span')].filter(visible).map((s) => s.textContent).join(' ')),
      files: [...dlg.querySelectorAll('.divbutton2 a')].filter(visible).map((a) => clean(a.textContent)),
      err: err && visible(err) ? clean(err.textContent) : null,
      buttons: [...dlg.querySelectorAll('button')].map((b) => ({ text: clean(b.textContent), visible: visible(b), cls: String(b.className) })),
    };
  }, dialogId);
}

/**
 * פותח את דיאלוג הטעינה של שורה ומוודא שהוא הנכון — **לפני** בחירת קובץ.
 * ‼ «+» הוא onClickTeinatMismachim(id) ⇒ isOpenDialog בלבד (תצוגה); שום דבר
 * לא נשלח לשע״ם עד שנבחר קובץ.
 */
export async function openSlotUploadDialog(page, slot) {
  const step = await currentWizardStep(page);
  if (step !== 4) return { ok: false, reason: 'not_on_documents_step', currentStep: step };

  const probe = await page.evaluate(docRowsProbe, { mode: 'clickPlus', label: slot.label });
  if (!probe.clicked) {
    return { ok: false, reason: probe.reason === 'row_already_populated' && slot.kind === 'poa' ? 'poa_already_uploaded' : (probe.reason ?? 'upload_opener_not_found') };
  }
  // ‼ ממתינים לדיאלוג **כלשהו** ורק אז בודקים שהוא של השורה — כדי שדיאלוג
  // שגוי ייתפס כשגוי, ולא ייראה כמו «לא נפתח».
  await page.waitForFunction(() => [...document.querySelectorAll('.modal')]
    .some((m) => getComputedStyle(m).display === 'block'), null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
  const d = await readUploadDialog(page, slot.dialog);
  const match = dialogMatchesSlot(d, slot);
  if (!match.ok) return match;
  const input = pickUploadFileInput(d.inputs);
  if (!input.ok) return input;
  // ‼ כבר יש קובץ בדיאלוג («החלפת קובץ» / רשימה לא ריקה) ⇒ לא מעלים שני.
  if ((d.files ?? []).length || /החלפת/.test(d.buttonLabel ?? '')) {
    return { ok: false, reason: slot.kind === 'poa' ? 'poa_already_uploaded' : 'row_already_populated' };
  }
  if (!/טעינת\s+קובץ/.test(d.buttonLabel ?? '')) return { ok: false, reason: 'upload_button_not_found', detail: d.buttonLabel };
  if (!pickDialogCloseButton(d.buttons).ok) return { ok: false, reason: 'close_button_not_found' };
  return { ok: true, inputIndex: input.index, title: d.title };
}

/** «סגירה» בתחתית הדיאלוג של השורה, והמתנה להיעלמותו. */
export async function closeSlotDialog(page, slot) {
  const d = await readUploadDialog(page, slot.dialog);
  const close = pickDialogCloseButton(d.buttons);
  if (!close.ok) return close;
  const dialog = page.locator(`#${slot.dialog}`);
  const clicked = await dialog.locator('button').nth(close.index).click({ timeout: 5000 }).then(() => true).catch(() => false);
  if (!clicked) return { ok: false, reason: 'close_click_failed' };
  await dialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  await settle(page, { idleMs: 3000 });
  return { ok: true };
}

/**
 * בדיקת הדיאלוג של שורה נוספת — **תצוגה בלבד**: פותח, מוודא שהוא הנכון, סוגר.
 * ‼ לפני סימן הנגיעה: «+» ו«סגירה» אינם שולחים דבר לשע״ם (isOpenDialog בלבד).
 * כך דיאלוג שגוי נתפס לפני שהטופס עלה, ולא באמצע ההעלאה.
 */
export async function inspectSlotDialog(page, slot) {
  const opened = await openSlotUploadDialog(page, slot);
  if (!opened.ok) return opened;
  const closed = await closeSlotDialog(page, slot);
  if (!closed.ok) return { ...closed, reason: closed.reason ?? 'close_failed' };
  const { rows } = await page.evaluate(docRowsProbe, { mode: 'read' });
  const row = rows.find((r) => r.label === normDocLabel(slot.label));
  if (!row || row.hasFile) return { ok: false, reason: 'row_changed_after_inspect' };
  return { ok: true, dialog: slot.dialog, title: opened.title ?? '' };
}

/**
 * מזין PDF ל-input הקובץ של הדיאלוג הפתוח, ממתין לראיית העלאה, סוגר ב«סגירה»
 * ומוודא את השורה. ‼ נקראת רק אחרי markExternalAttempt — הבחירה מעלה מיד
 * לאחסון זמני של שע״ם.
 */
export async function uploadIntoSlot(page, slot, { fileName, buffer, inputIndex }) {
  const dialog = page.locator(`#${slot.dialog}`);
  const before = await readUploadDialog(page, slot.dialog);
  const again = pickUploadFileInput(before.inputs);
  if (!again.ok || again.index !== inputIndex) return { ok: false, reason: 'file_input_changed', step: 'upload' };
  if (!dialogMatchesSlot(before, slot).ok) return { ok: false, reason: 'upload_dialog_mismatch', step: 'upload' };

  await dialog.locator('input[type=file]').nth(inputIndex).setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer });

  const deadline = Date.now() + 60000;
  let ev = { state: 'pending' };
  while (Date.now() < deadline) {
    await page.waitForTimeout(700);
    ev = uploadDialogEvidence(await readUploadDialog(page, slot.dialog), fileName);
    if (ev.state !== 'pending') break;
  }
  if (ev.state === 'rejected') return { ok: false, reason: 'upload_rejected', detail: ev.detail, step: 'upload' };
  if (ev.state !== 'uploaded') return { ok: false, reason: ev.state === 'ambiguous' ? 'upload_ambiguous' : 'upload_not_confirmed', detail: ev.detail, step: 'upload' };

  const closed = await closeSlotDialog(page, slot);
  if (!closed.ok) return { ok: false, reason: closed.reason, step: 'upload_close' };

  // ‼ הראיה בשורה אחרי הסגירה: שם הקובץ + V (vm.uploadFile(n)).
  const { rows } = await page.evaluate(docRowsProbe, { mode: 'read' });
  const row = rows.find((r) => r.label === normDocLabel(slot.label));
  if (!row || !row.hasFile || !row.uploadName) return { ok: false, reason: 'row_not_updated', step: 'upload_close' };
  if (row.uploadName !== ev.uploadName) return { ok: false, reason: 'row_file_mismatch', detail: `${row.uploadName} ≠ ${ev.uploadName}`, step: 'upload_close' };
  return { ok: true, uploadName: row.uploadName, sameName: ev.sameName };
}

/**
 * הראיה שכל המסמכים נקלטו, והמשך **פעם אחת**.
 * ‼ סדר: כל שורה גלויה נושאת קובץ, והשורות הן בדיוק אלה שתוכננו ⇒ (תיבת בן/בת
 * הזוג, רק אם הוכחה) ⇒ «המשך» אחד ⇒ state `returnUpload`: «אישור קליטת מסמכים
 * למיוצג». בלי כל אלה — אין «נשלח».
 */
export async function confirmDocumentsStep(page, { checkSpouse = false, entityId, expectedClientName, expectedSlotIds = [1] } = {}) {
  const { rows } = await page.evaluate(docRowsProbe, { mode: 'read' });
  const seen = rows.map((r) => slotForLabel(r.label)?.id ?? null);
  if (seen.includes(null)) return { ok: false, reason: 'unknown_document_row', step: 'documents_confirm' };
  const want = [...expectedSlotIds].sort().join(',');
  if ([...seen].sort().join(',') !== want) {
    return { ok: false, reason: 'document_rows_changed', detail: `${seen.join(',')} ≠ ${want}`, step: 'documents_confirm' };
  }
  const empty = rows.filter((r) => !r.hasFile);
  if (empty.length) return { ok: false, reason: 'no_file_listed', text: empty.map((r) => r.label).join(', '), step: 'documents_confirm' };

  if (checkSpouse) {
    const box = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('input[type=checkbox][ng-model="vm.isCheckeChatimatBz"]')]
        .filter((b) => b.offsetParent !== null);
      if (boxes.length !== 1) return { ok: false, reason: boxes.length ? 'spouse_checkbox_ambiguous' : 'spouse_checkbox_not_found' };
      // ‼ element.click() ולא שינוי checked ישיר — כך ng-model רואה את השינוי.
      if (!boxes[0].checked) boxes[0].click();
      return { ok: boxes[0].checked, reason: boxes[0].checked ? undefined : 'spouse_checkbox_not_checked' };
    });
    if (!box.ok) return { ...box, step: 'documents_confirm' };
  }

  const go = await clickHemshech(page);
  if (!go.ok) return { ...go, step: 'documents_confirm' };

  // ‼ ההגשה עצמה (uploadToKasafot/GetFile) — כל הקבצים בקריאה אחת. ממתינים
  // לאחת משתי ראיות בלבד: מעבר ל-returnUpload, או שגיאה גלויה במסך.
  const deadline = Date.now() + 45000;
  let state = null;
  while (Date.now() < deadline) {
    await page.waitForTimeout(800);
    state = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const visible = (e) => e.offsetParent !== null;
      const err = [...document.querySelectorAll('.alert-danger')].filter(visible).map((e) => clean(e.textContent)).filter(Boolean).join(' · ');
      return {
        hash: location.hash,
        body: document.body.innerText || '',
        err,
        statusLines: [...document.querySelectorAll('strong')].filter(visible).map((e) => clean(e.textContent)).filter(Boolean).slice(0, 6),
      };
    });
    if (/returnUpload/.test(state.hash) || state.err) break;
  }
  if (!state) return { ok: false, reason: 'no_result', step: 'documents_confirm' };
  if (state.err && !/returnUpload/.test(state.hash)) {
    return { ok: false, reason: 'documents_continue_error', detail: state.err.slice(0, 300), step: 'documents_confirm' };
  }
  const evidence = submissionAcceptedEvidence(state, { entityId, expectedClientName });
  if (!evidence.ok) return { ok: false, reason: evidence.reason, detail: evidence.detail, step: 'documents_confirm' };
  const poaRow = rows.find((r) => slotForLabel(r.label)?.kind === 'poa');
  return {
    ok: true,
    fileLine: poaRow?.uploadName || poaRow?.text || '',
    documents: rows.map((r) => ({ slotId: slotForLabel(r.label).id, label: r.label, uploadName: r.uploadName })),
    summary: evidence.summary, statusLines: state.statusLines,
  };
}

/**
 * טהורה: האם המסך אחרי «המשך» הוא אישור הקליטה של **הבקשה הזאת**.
 * ‼ שלושה יחד: state returnUpload, הכותרת «אישור קליטת מסמכים למיוצג», וזהות
 * (ת.ז. + שם). חסר אחד מהם ⇒ לא «נשלח».
 */
export function submissionAcceptedEvidence({ hash, body, statusLines }, { entityId, expectedClientName }) {
  if (!/returnUpload/.test(String(hash ?? ''))) return { ok: false, reason: 'did_not_reach_final_step', detail: String(hash ?? '') };
  const text = String(body ?? '').replace(/\s+/g, ' ');
  if (!/אישור\s+קליטת\s+מסמכים\s+למיוצג/.test(text)) return { ok: false, reason: 'final_heading_missing' };
  const id = openedRequestIdentity(text, { entityId, expectedClientName });
  if (!id.ok) return { ok: false, reason: 'final_screen_identity_unverified' };
  const summary = [...(statusLines ?? [])].join(' · ').slice(0, 400);
  return { ok: true, requestNumber: id.requestNumber, summary };
}
