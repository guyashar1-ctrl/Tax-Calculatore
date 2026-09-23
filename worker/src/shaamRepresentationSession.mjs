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
// עוגני טקסט ייחודיים. כל דיאלוג אחר עוצר את הפעולה — ראה `confirmKnownDialog`.

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
 * אישור הדיאלוג **המוכר בלבד**.
 *
 * ‼ זה הלב של «לא ללחוץ אישור בעיניים עצומות»: הדיאלוג שנצפה אחרי «אישור»
 * בשלב 2 מזוהה לפי צירוף עוגנים ייחודי שלו. דיאלוג אחר — ניסוח שונה,
 * אזהרה חדשה, שגיאת ולידציה — מוחזר כ`unknown_dialog` עם הטקסט שלו,
 * וה-handler עוצר. שינוי ניסוח אצל הרשות ייראה כשינוי, לא כהצלחה.
 */
/**
 * ‼ **רשימה סגורה.** כל דיאלוג שאינו ברשימה עוצר את הפעולה. זו ההגנה
 * מפני «לאשר כל חלונית» — אזהרה חדשה, שגיאת ולידציה או ניסוח שהשתנה
 * חייבים להיראות, לא להיבלע.
 */
export const SHAAM_KNOWN_DIALOGS = [
  {
    /** «לידיעתך» אחרי «אישור» בשלב 2 — נצפה חי בהקלטה (23.09.2026). */
    id: 'step2_notice',
    minMatches: 2,
    anchors: [
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

export async function confirmKnownDialog(page) {
  const dialog = page.locator('[role="dialog"], .modal, .modal-content, .ui-dialog, .k-window').first();
  const appeared = await dialog.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
  if (!appeared) return { ok: true, dialog: 'none' };

  const text = norm(await dialog.innerText().catch(() => ''));
  const verdict = classifyShaamDialog(text);
  if (!verdict.known) {
    return { ok: false, reason: 'unknown_dialog', text: text.slice(0, 400) };
  }
  const confirm = dialog.getByRole('button', { name: /^(אישור|המשך|כן|OK)$/ }).first();
  if (!(await confirm.count())) {
    return { ok: false, reason: 'dialog_confirm_not_found', text: text.slice(0, 400) };
  }
  await confirm.click({ timeout: 8000 }).catch(() => {});
  await settle(page);
  return { ok: true, dialog: verdict.id, text: text.slice(0, 200) };
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

// ── שלב 1: אימות ישות ───────────────────────────────────────────────────────

/** מה שמסך אימות הישות מקבל. אין כאן שום ערך שלא הגיע מ-PIVO. */
const SECONDARY_LABELS = {
  parentId: 'ת.ז הורה',
  driverLicense: 'מספר רשיון נהיגה',
  passport: 'מספר דרכון ישראלי',
};

/**
 * פותח «בקשה חדשה» ומוודא שהישות שעל המסך היא הישות שביקשנו.
 *
 * ‼ הבדיקה הזאת היא ההגנה מפני «פעולה על הלקוח הלא נכון»: אם שדה «מספר
 * הישות» כבר מולא במספר אחר (מסך שנשאר פתוח מהרצה קודמת), עוצרים. לא
 * דורסים, לא מנחשים.
 */
export async function startNewRequest(page, entityId) {
  const tab = await clickExact(page, TAB_NEW_REQUEST);
  if (!tab.ok) return { ...tab, step: 'tab_new_request' };
  await settle(page);

  const filled = await page.evaluate((id) => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const labels = [...document.querySelectorAll('label, span, td, div')]
      .filter((e) => e.children.length === 0 && /^\*?\s*מספר\s+הישות\s*:?$/.test(clean(e.textContent)));
    if (labels.length !== 1) return { ok: false, reason: labels.length ? 'ambiguous_entity_field' : 'entity_field_not_found' };
    const row = labels[0].closest('tr, .row, .form-group, fieldset') || labels[0].parentElement;
    const input = row?.querySelector('input:not([type=hidden])');
    if (!input) return { ok: false, reason: 'entity_input_not_found' };
    const current = clean(input.value).replace(/\D/g, '');
    if (current && current !== id) return { ok: false, reason: 'entity_mismatch', current };
    if (current === id) return { ok: true, mode: 'prefilled' };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    input.focus();
    setter.call(input, id);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
    return { ok: true, mode: 'typed' };
  }, String(entityId).replace(/\D/g, ''));

  if (!filled.ok) return { ...filled, step: 'entity_number' };
  return { ok: true, mode: filled.mode };
}

/**
 * ממלא תאריך לידה + אמצעי הזיהוי הנוסף, ולוחץ «המשך».
 *
 * ‼ **ניסיון אחד בלבד.** דחייה של שע״ם מוחזרת כ-`verification_rejected`
 * ולא מנוסה שוב בשום צורה: ניסיונות חוזרים על אימות זהות מול רשות עלולים
 * לחסום את המשתמש, והמחיר של חסימה גבוה לאין ערוך מהמחיר של עצירה.
 *
 * @param birthDateDDMMYYYY שמונה ספרות, כפי שהשדה מבקש.
 * @param secondary `{ type: 'parentId'|'driverLicense'|'passport', value }`
 */
export async function verifyEntity(page, { birthDateDDMMYYYY, secondary }) {
  const label = SECONDARY_LABELS[secondary?.type];
  if (!label) return { ok: false, reason: 'unsupported_secondary_type', step: 'verify_entity' };

  const fill = await page.evaluate(({ birth, label, value }) => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const setValue = (input, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      input.focus();
      setter.call(input, v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.blur();
    };
    const findByLabel = (re) => {
      const els = [...document.querySelectorAll('label, span, td, div')]
        .filter((e) => e.children.length === 0 && re.test(clean(e.textContent)));
      if (els.length !== 1) return { n: els.length };
      const el = els[0];
      if (el.tagName === 'LABEL' && el.htmlFor) {
        const byFor = document.getElementById(el.htmlFor);
        if (byFor) return { el: byFor, labelEl: el };
      }
      const row = el.closest('tr, .row, .form-group, fieldset') || el.parentElement;
      const input = row?.querySelector('input:not([type=hidden]):not([type=button]):not([type=submit])');
      return input ? { el: input, labelEl: el } : { n: 0 };
    };

    const birthField = findByLabel(/^\*?\s*תאריך\s+לידה\s*:?$/);
    if (!birthField.el) return { ok: false, reason: 'birth_date_field_not_found', n: birthField.n };
    setValue(birthField.el, birth);

    const secField = findByLabel(new RegExp('^\\*?\\s*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:?$'));
    if (!secField.el) return { ok: false, reason: 'secondary_field_not_found', n: secField.n };
    // ‼ שלושת השדות הם בררה עם כפתורי רדיו — יש לסמן את הרדיו של השורה
    // לפני שהשדה נפתח להזנה. הרדיו הוא זה שבאותה שורה עם התווית.
    const row = secField.labelEl.closest('tr, .row, .form-group') || secField.labelEl.parentElement;
    const radio = row?.querySelector('input[type=radio]');
    if (radio && !radio.checked) radio.click();
    setValue(secField.el, value);
    return { ok: true };
  }, { birth: birthDateDDMMYYYY, label, value: String(secondary.value).trim() });

  if (!fill.ok) return { ...fill, step: 'verify_entity' };

  const go = await clickExact(page, 'המשך');
  if (!go.ok) return { ...go, step: 'verify_entity_continue' };
  await settle(page);

  const err = await readScreenError(page);
  const step = await currentWizardStep(page);
  if (step === 2) return { ok: true };
  // ‼ נשארנו על שלב 1 ⇒ האימות נדחה. **לא מנסים שוב.**
  return {
    ok: false,
    reason: 'verification_rejected',
    detail: err || 'שע״ם לא אישרה את פרטי אימות הישות.',
    step: 'verify_entity',
  };
}

// ── שלב 2: בקשות ייפוי כוח ──────────────────────────────────────────────────

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

/**
 * מסמן **אך ורק** את המערכים שהתבקשו, ממלא מספר תיק, ובוחר סוג ייצוג.
 *
 * ‼ הכלל היחיד שחשוב כאן: שורה שלא נמסרה ב-`systems` — לא נוגעים בה.
 * לא מסמנים «כי זה הגיוני», לא משאירים סימון שהיה. השורות מגיעות
 * מ-PIVO בלבד (`חובת ייצוג מול`), וההרחבה הידנית שנעשתה בהדגמה אינה חוק.
 *
 * @param systems `[{ screenLabel: 'מע"מ', fileNumber: '034605212', repType: 'ראשי' }]`
 */
export async function selectRequestedSystems(page, systems) {
  const result = await page.evaluate((wanted) => {
    const clean = (s) => (s || '').replace(/["'״׳]/g, '"').replace(/\s+/g, ' ').trim();
    const setValue = (input, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      input.focus();
      setter.call(input, v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.blur();
    };
    // טבלת «בקשה חדשה לייצוג»: שורה לכל מערך, עם תא שם המערך, צ'קבוקס,
    // שדה מספר תיק ובורר סוג ייצוג.
    const rows = [...document.querySelectorAll('tr')].filter((tr) =>
      tr.querySelector('input[type=checkbox]') && tr.querySelector('select'));
    if (rows.length === 0) return { ok: false, reason: 'systems_table_not_found' };

    const byLabel = new Map();
    for (const tr of rows) {
      const cells = [...tr.querySelectorAll('td, th')].map((td) => clean(td.textContent)).filter(Boolean);
      for (const c of cells) if (c && !byLabel.has(c)) byLabel.set(c, tr);
    }

    const touched = [];
    for (const w of wanted) {
      const key = clean(w.screenLabel);
      const tr = byLabel.get(key);
      if (!tr) return { ok: false, reason: 'system_row_not_found', system: w.screenLabel, seen: [...byLabel.keys()] };
      const box = tr.querySelector('input[type=checkbox]');
      if (!box) return { ok: false, reason: 'system_checkbox_not_found', system: w.screenLabel };
      if (!box.checked) box.click();           // ‼ הסימון פותח את שדות השורה
      const input = tr.querySelector('input[type=text], input:not([type])');
      if (!input) return { ok: false, reason: 'file_number_input_not_found', system: w.screenLabel };
      setValue(input, String(w.fileNumber));
      const select = tr.querySelector('select');
      const option = [...select.options].find((o) => clean(o.textContent) === clean(w.repType));
      if (!option) {
        return { ok: false, reason: 'rep_type_option_not_found', system: w.screenLabel,
                 options: [...select.options].map((o) => clean(o.textContent)) };
      }
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      touched.push(key);
    }

    // ‼ אימות סוגר: אין ולו שורה מסומנת אחת שלא ביקשנו. זה מה שמונע
    // «ניכויים» שנדבק מברירת מחדל או ממצב שנשמר.
    const extra = [];
    for (const tr of rows) {
      const box = tr.querySelector('input[type=checkbox]');
      if (!box?.checked) continue;
      const cells = [...tr.querySelectorAll('td, th')].map((td) => clean(td.textContent)).filter(Boolean);
      if (!cells.some((c) => touched.includes(c))) extra.push(cells[0] ?? '(ללא שם)');
    }
    if (extra.length) return { ok: false, reason: 'unrequested_system_checked', extra };
    return { ok: true, touched };
  }, systems);

  return result;
}

/** «אישור» בשלב 2 + הדיאלוג המוכר שאחריו. מחזיר את מספר הבקשה שנוצר. */
export async function confirmSystemsStep(page) {
  const go = await clickExact(page, 'אישור');
  if (!go.ok) return { ...go, step: 'systems_confirm' };
  const dialog = await confirmKnownDialog(page);
  if (!dialog.ok) return { ...dialog, step: 'systems_confirm' };
  await settle(page);

  const err = await readScreenError(page);
  const step = await currentWizardStep(page);
  if (step !== 3) {
    return { ok: false, reason: 'did_not_reach_contact_step', detail: err || `שלב נוכחי: ${step}`, step: 'systems_confirm' };
  }
  const requestNumber = await readRequestNumber(page);
  if (!requestNumber) {
    return { ok: false, reason: 'request_number_not_found', step: 'systems_confirm' };
  }
  return { ok: true, requestNumber, dialog: dialog.dialog };
}

// ── שלב 3: פרטי התקשרות ─────────────────────────────────────────────────────

/**
 * ממלא את טלפון בן/בת הזוג ומסמן את הסכמת הלקוח לקבלת הודעות.
 *
 * ‼ הטלפון מגיע מ-PIVO בלבד. הקורא כבר וידא שהוא קיים (preflight);
 * כאן, אם השדה מופיע ולא נמסר ערך — עוצרים, ולא מגישים בלעדיו.
 * ‼ ההסכמה מסומנת כי היא **חלק מהבקשה עצמה**: הקישור שהלקוח מקבל במסרון
 * הוא מה שמקצר את ההשהיה, וזו הזרימה שהמוצר מתאר («זירוז אישור הייצוג
 * באזור האישי»). לא מסומנת שום הסכמה אחרת.
 */
export async function fillContactDetails(page, { spousePhone }) {
  const r = await page.evaluate((phone) => {
    const clean = (s) => (s || '').replace(/["'״׳]/g, '"').replace(/\s+/g, ' ').trim();
    const setValue = (input, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      input.focus();
      setter.call(input, v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.blur();
    };
    const labels = [...document.querySelectorAll('label, span, td, div')]
      .filter((e) => e.children.length === 0 && /טלפון\s*בן\s*\\?\s*ת?\s*זוג/.test(clean(e.textContent)));

    let spouseField = null;
    if (labels.length === 1) {
      const row = labels[0].closest('tr, .row, .form-group') || labels[0].parentElement;
      spouseField = {
        input: row?.querySelector('input:not([type=hidden]):not([type=checkbox])') ?? null,
        select: row?.querySelector('select') ?? null,
      };
    }

    if (spouseField?.input) {
      if (!phone) return { ok: false, reason: 'spouse_phone_required_but_missing' };
      const digits = String(phone).replace(/\D/g, '');
      // הקידומת נבחרת בבורר והשאר בשדה — כך נצפה המסך.
      if (spouseField.select) {
        const prefix = digits.slice(0, 3);
        const option = [...spouseField.select.options].find((o) => clean(o.textContent) === prefix);
        if (!option) {
          return { ok: false, reason: 'phone_prefix_not_in_list', prefix,
                   options: [...spouseField.select.options].map((o) => clean(o.textContent)).slice(0, 30) };
        }
        spouseField.select.value = option.value;
        spouseField.select.dispatchEvent(new Event('change', { bubbles: true }));
        setValue(spouseField.input, digits.slice(3));
      } else {
        setValue(spouseField.input, digits);
      }
    }

    // ההסכמה: צ'קבוקס יחיד שהטקסט שלידו מדבר על הודעות מרשות המסים.
    const boxes = [...document.querySelectorAll('input[type=checkbox]')].filter((b) => {
      const row = b.closest('tr, .row, .form-group, label, div');
      return /רשות\s+המסים/.test(clean(row?.textContent)) && /מסרון|דואר\s+אלקטרוני/.test(clean(row?.textContent));
    });
    if (boxes.length !== 1) return { ok: false, reason: boxes.length ? 'ambiguous_consent_checkbox' : 'consent_checkbox_not_found' };
    if (!boxes[0].checked) boxes[0].click();

    return { ok: true, spousePhoneAsked: !!spouseField?.input };
  }, spousePhone ?? '');

  if (!r.ok) return { ...r, step: 'contact_details' };

  const save = await clickExact(page, 'שמירה');
  if (!save.ok) return { ...save, step: 'contact_details_save' };
  await settle(page, { idleMs: 20000 });

  const err = await readScreenError(page);
  if (err) return { ok: false, reason: 'contact_save_error', detail: err, step: 'contact_details_save' };
  return { ok: true, spousePhoneAsked: r.spousePhoneAsked };
}

// ── הטופס שנוצר: הורדה ישירה בתוך הסשן ──────────────────────────────────────

/**
 * לוכד את ה-PDF שמופק אחרי שמירת פרטי ההתקשרות.
 *
 * ‼ **בלי מסלול Desktop.** שני נתיבים, שניהם בתוך הדפדפן:
 *   1. אירוע `download` — כשהדפדפן מוריד את הקובץ.
 *   2. תגובת רשת עם `Content-Type: application/pdf` — כשהוא מציג אותו
 *      בצופה המובנה (מה שנצפה בהקלטה). זה הנתיב שמייתר את חלון «שמירה
 *      בשם» לגמרי.
 * מחזיר Buffer, או `{ok:false}` — לעולם לא «כנראה ירד».
 *
 * @param trigger פונקציה שגורמת להפקה (לחיצה/ניווט), נקראת אחרי שההאזנה הותקנה.
 */
export async function capturePdf(page, trigger, { timeoutMs = 45000 } = {}) {
  let resolved = null;
  const pending = [];

  const onResponse = (res) => {
    const ct = (res.headers()['content-type'] || '').toLowerCase();
    if (!ct.includes('application/pdf')) return;
    pending.push(res.body().then(
      (buf) => { if (!resolved && buf?.length) resolved = { source: 'response', url: res.url(), buffer: buf }; },
      () => {},
    ));
  };
  page.on('response', onResponse);

  const downloadPromise = page.waitForEvent('download', { timeout: timeoutMs }).catch(() => null);
  try {
    await trigger();
    const download = await Promise.race([
      downloadPromise,
      new Promise((r) => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (download && !resolved) {
      const stream = await download.createReadStream().catch(() => null);
      if (stream) {
        const chunks = [];
        for await (const c of stream) chunks.push(c);
        const buffer = Buffer.concat(chunks);
        if (buffer.length) {
          resolved = { source: 'download', url: download.url(), buffer, suggestedFilename: download.suggestedFilename() };
        }
      }
    }
    await Promise.allSettled(pending);
    if (!resolved) return { ok: false, reason: 'pdf_not_captured' };
    return { ok: true, ...resolved };
  } finally {
    page.off('response', onResponse);
  }
}

/**
 * הטופס אחרי «שמירה» בשלב 3. ‼ אם המסך כבר הציג אותו (הצופה המובנה), אין
 * מה ללחוץ — `capturePdf` תפס אותו בדרך. אחרת מחפשים את הפקד שמציג אותו.
 */
export async function fetchGeneratedForm(page, { alreadyCaptured } = {}) {
  if (alreadyCaptured?.ok) return alreadyCaptured;
  const candidates = ['הצגת הטופס', 'הצג טופס', 'טופס ייפוי כוח', 'הדפסה', 'הצגה'];
  for (const label of candidates) {
    const loc = byExactName(page, label);
    if (!(await loc.count().catch(() => 0))) continue;
    const r = await capturePdf(page, () => loc.click({ timeout: 10000 }).catch(() => {}));
    if (r.ok) return r;
  }
  return { ok: false, reason: 'form_control_not_found', tried: candidates };
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
  if (!want && !expectedClientName) {
    return { ok: false, reason: 'cannot_attribute', detail: 'אין מספר בקשה ואין שם לקוח להשוואה' };
  }
  const canAttribute = (r) => {
    const rowReqNum = String(r?.detail?.requestNumber ?? '').replace(/\D/g, '');
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
    return nameMatches(r.clientName, expectedClientName);
  });
  return { ok: true, rows: attributed };
}

/**
 * שורות הבקשה לפי מספר בקשה — הראיה היחידה שמותר להסיק ממנה מצב.
 *
 * ‼ חיפוש לפי מספר הבקשה שנשמר, ולא לפי שם לקוח: שמות חוזרים, מספרים לא.
 * ‼ מחזיר את **כל** שורות המערכים של אותה בקשה, כי לכל מערך מצב משלו.
 */
export async function findRequestRows(page, { requestNumber, entityId, expectedClientName, expandDetails = false } = {}) {
  const tab = await clickExact(page, TAB_IN_PROGRESS);
  if (!tab.ok) return { ...tab, step: 'tab_in_progress' };
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
    if (byNumber && requestNumber) { setValue(byNumber, requestNumber); return { ok: true, by: 'requestNumber' }; }
    const byEntity = fieldByLabel(/^ישות\s+מיוצג\s*:?$/);
    if (byEntity && entityId) { setValue(byEntity, entityId); return { ok: true, by: 'entityId' }; }
    return { ok: false, reason: 'search_field_not_found' };
  }, { requestNumber: requestNumber ?? '', entityId: entityId ?? '' });

  if (!searched.ok) return { ...searched, step: 'list_search' };

  const go = await clickExact(page, 'חיפוש');
  if (!go.ok) return { ...go, step: 'list_search' };
  await settle(page, { idleMs: 20000 });
  // ‼ 23.09.2026 · נכשל בפועל בלי זה: settle (networkidle + "נא להמתין")
  // לא מבטיח שטבלת התוצאות כבר עודכנה — נצפה חי שהתוצאה נקראה ריקה, ורק
  // כמה שניות אחר כך המסך הראה בפועל "מוצגים N תיקים" עם השורות הנכונות.
  // הראיה החזקה ביותר לכך שהחיפוש **סיים לעדכן** את המסך היא הטקסט
  // "מוצגים ... תיקים" עצמו — ממתינים לו, לא רק ל"אין תעבורת רשת".
  await page.waitForFunction(
    () => /מוצגים\s+\d+\s+תיק/.test(document.body.innerText || ''),
    { timeout: 8000 },
  ).catch(() => {}); // ‼ אם לא הופיע — ממשיכים לקרוא בכל זאת; found:false נשאר תוצאה תקפה

  // ‼ 201 · «צפי לסיום השהייה», «מספר בקשה» ו«מספר לקוח» מוצגים רק בפירוט
  // השורה, שנפתח בחץ ההרחבה של Kendo (k-hierarchy-cell / k-i-expand). זו
  // פתיחת תצוגה בלבד — לא ניווט ולא פעולה אצל הרשות. נעשה רק בבדיקה
  // (expandDetails): בשידור, trIndex של השורות משמש ללחיצה, והרחבה הייתה
  // מזיזה אותו.
  if (expandDetails) {
    const expanded = await page.evaluate(() => {
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
    if (expanded > 0) {
      await page.waitForFunction(() => document.querySelectorAll('tr.k-detail-row').length > 0, { timeout: 6000 }).catch(() => {});
      await settle(page, { idleMs: 8000 });
    }
  }

  const rows = await page.evaluate(({ columns, requestNumber }) => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const tables = [...document.querySelectorAll('table')];
    for (const [tableIndex, table] of tables.entries()) {
      // ‼ 23.09.2026 · נכשל בפועל: הטבלה האמיתית (Kendo grid) איחדה שתי
      // שורות שונות תחת `tr:first-child` — שורת הכותרת (ראשונה ב-thead)
      // **וגם** השורה הראשונה בגוף הטבלה (ראשונה ב-tbody), כי כל אחת היא
      // "הראשונה" בתוך ה-parent שלה. האיחוד עם `thead` הכפיל/הזיז את
      // headCells, וכל שורת נתונים אמיתית נראתה "קצרה מדי" ונפסלה — rows
      // חזר ריק על מסך שבו היו בבירור שלוש שורות. thead קודם, ורק אם הוא
      // ריק (טבלה בלי thead מפורש) נופלים ל-tr:first-child.
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
        // שורת הפירוט שנפתחת מתחת — הטקסט נאסף כמו שהוא, והפירוש נעשה
        // מחוץ לדפדפן (parseRequestDetailText), כדי שייבדק בלי דפדפן.
        const text = clean(tr.textContent);
        if (!currentRow || !text) continue;
        currentRow.detailText = `${currentRow.detailText ?? ''} ${text}`.trim().slice(0, 1500);
      }
      // ‼ הייחוס לבקשה לא נעשה כאן אלא ב-attributeRows: זו הכרעת זהות,
      // והיא חייבת להיות ניתנת לבדיקה בלי דפדפן.
      return { ok: true, rows: out, total: out.length };
    }
    return { ok: false, reason: 'list_table_not_found' };
  }, { columns: LIST_COLUMNS, requestNumber: requestNumber ?? '' });

  if (!rows.ok) return { ...rows, step: 'list_read' };
  for (const r of rows.rows) {
    r.detail = parseRequestDetailText(r.detailText);
    delete r.detailText;
  }

  const attributed = attributeRows(rows.rows, {
    requestNumber, entityId, searchedBy: searched.by, expectedClientName,
  });
  if (!attributed.ok) return { ...attributed, step: 'list_read' };
  return { ok: true, rows: attributed.rows, total: rows.total, searchedBy: searched.by };
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

/**
 * שורת «טופס ייפוי כוח» במסך טעינת המסמכים — פונקציה עצמאית שרצה בדף.
 * ‼ לפי התבנית: div.BoxA > label.required{שם} + <u>{קובץ}</u> +
 * input.icon.plus (לפני טעינה) או .icon.replace + .icon.checkmark (אחרי).
 * @param mode 'read' | 'clickPlus'
 */
function poaRowProbe(mode) {
  const clean = (x) => (x || '').replace(/\s+/g, ' ').trim();
  const visible = (e) => !!e && e.offsetParent !== null;
  const boxes = [...document.querySelectorAll('.BoxA')].filter(visible);
  const docName = (b) => clean(b.querySelector('label')?.textContent);
  const poa = boxes.filter((b) => /^\*?\s*טופס\s+ייפוי\s+כוח\s*\*?$/.test(docName(b)));
  const otherBoxes = boxes.filter((b) => !poa.includes(b)).filter((b) => docName(b));
  const others = otherBoxes.map(docName);
  // ‼ 201 · לכל מסמך נוסף — התווית כמו שהיא, והאם שע״ם מסמנת אותו כחובה
  // (label.required או כוכבית). הסיווג לת.ז./דרכון נעשה ב-PIVO.
  const otherDocsDetail = otherBoxes.map((b) => ({
    label: docName(b).replace(/^\*\s*|\s*\*$/g, ''),
    required: !!b.querySelector('label')?.classList?.contains('required') || /\*/.test(docName(b)),
  }));
  const out = { poaRows: poa.length, otherDocs: others, otherDocsDetail, plusControls: 0, poaHasFile: false, uploadName: '', rowText: '' };
  if (poa.length !== 1) return out;
  const row = poa[0];
  const plus = [...row.querySelectorAll('input[type=button].plus, .icon.plus')].filter(visible)
    .filter((e, _, all) => !all.some((o) => o !== e && e.contains(o)));
  out.plusControls = plus.length;
  out.uploadName = clean(row.querySelector('u')?.textContent);
  out.poaHasFile = !!out.uploadName || [...row.querySelectorAll('.icon.checkmark')].some(visible);
  out.rowText = clean(row.textContent).slice(0, 200);
  if (mode === 'clickPlus') {
    if (out.plusControls !== 1 || out.poaHasFile) return { ...out, clicked: false };
    plus[0].click();
    return { ...out, clicked: true };
  }
  return out;
}

/**
 * ההחלטה על מסך «טעינת מסמכים» — לפני שנוגעים בשע״ם. טהורה.
 * ‼ כל עצירה כאן קורית **לפני** סימן הנגיעה ולפני «+».
 */
export function documentsStepPlan(state, { spouseSignatureConfirmed } = {}) {
  if (!state?.identityOk) return { ok: false, reason: 'documents_screen_identity_unverified' };
  if (state.poaRows !== 1) return { ok: false, reason: state.poaRows ? 'poa_row_ambiguous' : 'poa_row_not_found' };
  // ‼ שע״ם דורשת מסמך נוסף (למשל תצלום ת.ז.) — «המשך» ייכשל על «יש לטעון את
  // כל המסמכים», ואין לנו אותו. לא מתחילים העלאה חלקית.
  if ((state.otherDocs ?? []).length) return { ok: false, reason: 'other_documents_required', detail: state.otherDocs.join(', ') };
  // ‼ כבר נטען קובץ לשורה — לא מעלים שני. ההחלטה חוזרת לאדם/לבדיקה.
  if (state.poaHasFile) return { ok: false, reason: 'poa_already_uploaded' };
  if (state.plusControls !== 1) return { ok: false, reason: state.plusControls ? 'upload_opener_ambiguous' : 'upload_opener_not_found' };
  if (state.spouseCheckboxes > 1) return { ok: false, reason: 'spouse_checkbox_ambiguous' };
  // ‼ המסך מבקש את האישור, ואנחנו לא מוצאים את התיבה — עוצרים.
  if (state.spouseLabelOnScreen && state.spouseCheckboxes === 0) return { ok: false, reason: 'spouse_checkbox_not_found' };
  // ‼ התיבה מסומנת רק כש-PIVO הוכיחה את חתימת בן/בת הזוג בטופס הסופי.
  if (state.spouseCheckboxes === 1 && spouseSignatureConfirmed !== true) {
    return { ok: false, reason: 'spouse_signature_not_proven' };
  }
  if (state.continueButtons !== 1) return { ok: false, reason: state.continueButtons ? 'continue_ambiguous' : 'continue_not_found' };
  return { ok: true, checkSpouse: state.spouseCheckboxes === 1 };
}

/** מצב מסך «טעינת מסמכים», קריאה בלבד. */
async function readDocumentsStep(page, { entityId, expectedClientName }) {
  const row = await page.evaluate(poaRowProbe, 'read');
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
  return {
    ...raw, body: undefined,
    poaRows: row.poaRows, otherDocs: row.otherDocs, otherDocsDetail: row.otherDocsDetail ?? [],
    plusControls: row.plusControls, poaHasFile: row.poaHasFile,
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

  const single = singleAttributedRequest(found.rows);
  if (!single.ok) return { ...single, step: 'resume' };
  const norm = (s) => String(s ?? '').replace(/["'״׳]/g, '').replace(/\s+/g, ' ').trim();
  const targetRows = found.rows.filter((r) => norm(r.system) === norm(systemLabel));
  if (targetRows.length !== 1) {
    return { ok: false, reason: 'ambiguous_request', detail: `שורת «${systemLabel}» של הבקשה לא נמצאה בדיוק פעם אחת`, step: 'resume' };
  }
  const target = targetRows[0];

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

const POA_DIALOG = '#dialogTeinatAsmachta';

// ── דיאלוג הטעינה של «טופס ייפוי כוח» — מתוך תבנית shaam-file-upload וה-DOM החי ─────
// ‼ 23.09.2026 · ניסיון 4 פתח את הדיאלוג ועצר על file_input_ambiguous, לפני
// בחירת קובץ: ברכיב יש **שני** input[type=file] חיים — name="myFile" בחלק
// של mode!=3 (הגלוי כאן, mode=1), ו-name="myFile1" בחלק של mode==3 (מוסתר).
// «טעינת קובץ» הוא .k-upload-button של Kendo שעוטף את input[name=myFile];
// לחיצה עליו פותחת את בוחר הקבצים של Windows — ולכן מזינים את הקובץ ישירות
// לאותו input (בדיוק מה שהבוחר עושה). autoUpload מעלה לאחסון זמני, וב-success:
// הקובץ ברשימה (.divbutton2 a = UploadName), הכפתור «החלפת קובץ», ו-
// vm.uploadFile(0) ⇒ בשורה <u>UploadName</u> + .icon.checkmark. שגיאה: #errDiv.
// «סגירה» = הכפתור בתחתית הדיאלוג (shaam-buttons, ng-bind=tranbtn); ה-×
// בכותרת עושה אותו דבר, אבל נלחץ הכפתור «סגירה» כפי שנדרש.

/** טהורה: input הקובץ של «טופס ייפוי כוח» — myFile בחלק הגלוי, בדיוק אחד. */
export function pickPoaFileInput(inputs) {
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

async function readPoaDialog(page) {
  return page.evaluate((sel) => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const visible = (e) => !!e && e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden';
    const dlg = document.querySelector(sel);
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
  }, POA_DIALOG);
}

/**
 * פותח את דיאלוג הטעינה של «טופס ייפוי כוח» ומוודא שהוא הנכון — **לפני**
 * סימן הנגיעה. ‼ «+» הוא onClickTeinatMismachim(1) ⇒ isOpenDialog בלבד (תצוגה);
 * שום דבר לא נשלח לשע״ם עד שנבחר קובץ.
 */
export async function openPoaUploadDialog(page) {
  const step = await currentWizardStep(page);
  if (step !== 4) return { ok: false, reason: 'not_on_documents_step', currentStep: step };

  const probe = await page.evaluate(poaRowProbe, 'clickPlus');
  if (!probe.clicked) {
    return { ok: false, reason: probe.poaHasFile ? 'poa_already_uploaded'
      : probe.poaRows !== 1 ? (probe.poaRows ? 'poa_row_ambiguous' : 'poa_row_not_found')
      : (probe.plusControls ? 'upload_opener_ambiguous' : 'upload_opener_not_found') };
  }
  const opened = await page.locator(POA_DIALOG).waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
  if (!opened) return { ok: false, reason: 'upload_dialog_not_open' };
  await page.waitForTimeout(400);
  const d = await readPoaDialog(page);
  if (d.openModals.length !== 1 || d.openModals[0] !== POA_DIALOG.slice(1)) {
    return { ok: false, reason: 'upload_dialog_ambiguous', detail: d.openModals.join(',') };
  }
  const input = pickPoaFileInput(d.inputs);
  if (!input.ok) return input;
  // ‼ כבר יש קובץ בדיאלוג («החלפת קובץ» / רשימה לא ריקה) ⇒ לא מעלים שני.
  if ((d.files ?? []).length || /החלפת/.test(d.buttonLabel ?? '')) return { ok: false, reason: 'poa_already_uploaded' };
  if (!/טעינת\s+קובץ/.test(d.buttonLabel ?? '')) return { ok: false, reason: 'upload_button_not_found', detail: d.buttonLabel };
  if (!pickDialogCloseButton(d.buttons).ok) return { ok: false, reason: 'close_button_not_found' };
  return { ok: true, inputIndex: input.index };
}

/**
 * מזין את ה-PDF החתום ל-input הקובץ של הדיאלוג, ממתין לראיית העלאה, וסוגר
 * ב«סגירה». ‼ נקראת רק אחרי markExternalAttempt — הבחירה מעלה מיד לאחסון זמני.
 */
export async function uploadSignedForm(page, { fileName, buffer, inputIndex }) {
  const dialog = page.locator(POA_DIALOG);
  const before = await readPoaDialog(page);
  const again = pickPoaFileInput(before.inputs);
  if (!again.ok || again.index !== inputIndex) return { ok: false, reason: 'file_input_changed', step: 'upload' };

  await dialog.locator('input[type=file]').nth(inputIndex).setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer });

  const deadline = Date.now() + 60000;
  let ev = { state: 'pending' };
  while (Date.now() < deadline) {
    await page.waitForTimeout(700);
    ev = uploadDialogEvidence(await readPoaDialog(page), fileName);
    if (ev.state !== 'pending') break;
  }
  if (ev.state === 'rejected') return { ok: false, reason: 'upload_rejected', detail: ev.detail, step: 'upload' };
  if (ev.state !== 'uploaded') return { ok: false, reason: ev.state === 'ambiguous' ? 'upload_ambiguous' : 'upload_not_confirmed', detail: ev.detail, step: 'upload' };

  // «סגירה» בתחתית הדיאלוג — בדיוק כפתור אחד.
  const d = await readPoaDialog(page);
  const close = pickDialogCloseButton(d.buttons);
  if (!close.ok) return { ok: false, reason: close.reason, step: 'upload_close' };
  const closed = await dialog.locator('button').nth(close.index).click({ timeout: 5000 }).then(() => true).catch(() => false);
  if (!closed) return { ok: false, reason: 'close_click_failed', step: 'upload_close' };
  await dialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  await settle(page);

  // ‼ הראיה בשורה אחרי הסגירה: שם הקובץ + V (vm.uploadFile(0)).
  const row = await page.evaluate(poaRowProbe, 'read');
  if (!row.poaHasFile || !row.uploadName) return { ok: false, reason: 'row_not_updated', step: 'upload_close' };
  if (row.uploadName !== ev.uploadName) return { ok: false, reason: 'row_file_mismatch', detail: `${row.uploadName} ≠ ${ev.uploadName}`, step: 'upload_close' };
  return { ok: true, uploadName: row.uploadName, sameName: ev.sameName };
}

/**
 * הראיה שהמסמך נקלט, והמשך **פעם אחת**.
 * ‼ סדר: הקובץ מופיע בשורת «טופס ייפוי כוח» ⇒ (תיבת בן/בת הזוג, רק אם
 * הוכחה) ⇒ «המשך» אחד ⇒ state `returnUpload`: «אישור קליטת מסמכים למיוצג».
 * בלי כל אלה — אין «נשלח».
 */
export async function confirmDocumentsStep(page, { checkSpouse = false, entityId, expectedClientName } = {}) {
  const row = await page.evaluate(poaRowProbe, 'read');
  const attached = row.poaRows !== 1
    ? { ok: false, reason: row.poaRows ? 'poa_row_ambiguous' : 'poa_row_not_found' }
    : { ok: row.poaHasFile, reason: row.poaHasFile ? undefined : 'no_file_listed', text: row.uploadName || row.rowText };
  if (!attached.ok) return { ...attached, step: 'documents_confirm' };

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

  // ‼ ההגשה עצמה (uploadToKasafot/GetFile). ממתינים לאחת משתי ראיות בלבד:
  // מעבר ל-returnUpload, או שגיאה גלויה במסך. שום דבר אחר אינו תוצאה.
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
  return { ok: true, fileLine: attached.text, summary: evidence.summary, statusLines: state.statusLines };
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
