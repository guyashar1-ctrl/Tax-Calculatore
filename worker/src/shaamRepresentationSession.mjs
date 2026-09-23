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
  'בקשות ייפוי כוח',
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

/**
 * באיזה שלב האשף נמצא. ‼ נקרא מהמסך ולא נזכר בזיכרון: ניסיון חוזר אחרי
 * קריסה חייב לדעת איפה הוא באמת, לא איפה הוא חשב שהוא.
 * מחזיר 1..5, או null כשאין אשף על המסך.
 */
export async function currentWizardStep(page) {
  return page.evaluate((steps) => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    // כל שלב הוא עיגול עם מספר + כותרת. העיגול הפעיל מסומן, אבל הסימון
    // אינו ידוע — ולכן מזהים לפי הכותרת שמופיעה כ"נוכחית" בגוף העמוד:
    // כותרת המסך עצמו נגזרת מהשלב ("טעינת מסמכים למיוצג ...").
    const body = clean(document.body.innerText);
    const headings = [
      { n: 1, re: /אימות\s+(המיוצג|ישות)/ },
      { n: 2, re: /בקשה\s+חדשה\s+לייצוג/ },
      { n: 3, re: /פרטי\s+התקשרות\s+למיוצג/ },
      { n: 4, re: /טעינת\s+מסמכים\s+למיוצג/ },
      { n: 5, re: /השהייה\s+וסיום/ },
    ];
    for (const h of headings) if (h.re.test(body)) return h.n;
    // נפילה-לאחור: קיימת רצועת שלבים בכלל?
    return steps.some((s) => body.includes(s)) ? 0 : null;
  }, WIZARD_STEPS);
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

/**
 * שגיאת ולידציה שהמסך הציג. ‼ נקראת **לפני** שמכריזים הצלחה: מסך שנשאר
 * באותו שלב עם הודעה אדומה אינו «עדיין נטען».
 */
export async function readScreenError(page) {
  return page.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const nodes = [...document.querySelectorAll(
      '.error, .alert-danger, .validation-summary-errors, .field-validation-error, [role="alert"], .text-danger',
    )];
    const msgs = nodes.map((n) => clean(n.textContent)).filter(Boolean);
    return msgs.length ? msgs.join(' · ').slice(0, 300) : null;
  });
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

/**
 * מעלה את טופס ייפוי הכוח החתום בשורה «טופס ייפוי כוח».
 *
 * ‼ הקובץ נמסר כ-Buffer ונכתב ל-`input[type=file]` דרך Playwright —
 * בלי חלון בחירת קבצים של מערכת ההפעלה, ובלי לשמור אותו על הדיסק.
 * ‼ אין כאן הכרזת הצלחה: `confirmDocumentsStep` היא שקוראת את הראיה.
 */
export async function uploadSignedForm(page, { fileName, buffer }) {
  const step = await currentWizardStep(page);
  if (step !== 4) return { ok: false, reason: 'not_on_documents_step', currentStep: step, step: 'upload' };

  // פתיחת מסך הטעינה של השורה — כפתור «+» בשורת «טופס ייפוי כוח».
  const opened = await page.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const rows = [...document.querySelectorAll('tr, .row, li, div')]
      .filter((r) => /^\*?\s*טופס\s+ייפוי\s+כוח\s*$/.test(clean(r.textContent)));
    const row = rows[rows.length - 1];   // הפנימי ביותר
    if (!row) return { ok: false, reason: 'poa_row_not_found' };
    const holder = row.closest('tr') || row.parentElement;
    const btn = [...(holder?.querySelectorAll('a, button, input[type=button], img, i, span') ?? [])]
      .find((e) => /^\+$/.test(clean(e.textContent)) || /הוספ|טעינ|צרף/.test(clean(e.getAttribute?.('title') || e.getAttribute?.('alt') || '')));
    if (!btn) return { ok: false, reason: 'upload_opener_not_found' };
    btn.click();
    return { ok: true };
  });
  if (!opened.ok) return { ...opened, step: 'upload_open' };
  await page.waitForTimeout(800);

  const fileInput = page.locator('input[type=file]').first();
  const present = await fileInput.waitFor({ state: 'attached', timeout: 10000 }).then(() => true).catch(() => false);
  if (!present) return { ok: false, reason: 'file_input_not_found', step: 'upload_open' };

  await fileInput.setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer });
  await settle(page, { idleMs: 25000 });

  const err = await readScreenError(page);
  if (err) return { ok: false, reason: 'upload_rejected', detail: err, step: 'upload' };

  // סוגרים את חלון הטעינה אם נשאר פתוח.
  const close = byExactName(page, 'סגירה');
  if (await close.count().catch(() => 0)) await close.click({ timeout: 5000 }).catch(() => {});
  await settle(page);
  return { ok: true };
}

/**
 * הראיה שהמסמך נקלט: שורת «טופס ייפוי כוח» מציגה שם קובץ, והאשף מתקדם
 * אחרי «המשך».
 *
 * ‼ זו הפונקציה שמכריעה «נשלח לשע״ם». בלי הראיה הזאת — לא נשלח, נקודה.
 */
export async function confirmDocumentsStep(page) {
  const attached = await page.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const rows = [...document.querySelectorAll('tr')]
      .filter((r) => /טופס\s+ייפוי\s+כוח/.test(clean(r.textContent)));
    if (!rows.length) return { ok: false, reason: 'poa_row_not_found' };
    const text = clean(rows[rows.length - 1].textContent);
    const hasFile = /\.pdf/i.test(text);
    return { ok: hasFile, reason: hasFile ? undefined : 'no_file_listed', text: text.slice(0, 200) };
  });
  if (!attached.ok) return { ...attached, step: 'documents_confirm' };

  const go = await clickExact(page, 'המשך');
  if (!go.ok) return { ...go, step: 'documents_confirm' };
  await settle(page, { idleMs: 25000 });

  const err = await readScreenError(page);
  if (err) return { ok: false, reason: 'documents_continue_error', detail: err, step: 'documents_confirm' };

  const step = await currentWizardStep(page);
  if (step !== 5) {
    return { ok: false, reason: 'did_not_reach_final_step', detail: `שלב נוכחי: ${step}`, step: 'documents_confirm' };
  }
  const summary = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 600));
  return { ok: true, fileLine: attached.text, summary };
}

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

  for (const r of list) {
    const rowEntity = String(r?.detail?.entityId ?? '').replace(/\D/g, '');
    if (wantEntity && rowEntity && rowEntity !== wantEntity) {
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
export async function findRequestRows(page, { requestNumber, entityId, expectedClientName } = {}) {
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
        // שורת הפירוט שנפתחת מתחת: זוגות תווית/ערך.
        const text = clean(tr.textContent);
        if (!currentRow || !text) continue;
        const pairs = [
          ['requestNumber', /מספר\s+בקשה\s*([0-9]{6,})/],
          ['systemUpdatedAt', /ת\.?\s*עדכון\s+מערך\s*([0-9/.]{8,10})/],
          ['suspensionEnds', /צפוי\s+לסיום\s+השהייה\s*([^\s].{0,30}?)(?:ישות|שם\s+תיק|$)/],
          ['entityId', /ישות\s+הלקוח\s*([0-9]{5,9})/],
          ['fileName', /שם\s+תיק\s*([^\s].{0,40}?)$/],
        ];
        for (const [key, re] of pairs) {
          const m = re.exec(text);
          if (m) currentRow.detail[key] = clean(m[1]);
        }
      }
      // ‼ הייחוס לבקשה לא נעשה כאן אלא ב-attributeRows: זו הכרעת זהות,
      // והיא חייבת להיות ניתנת לבדיקה בלי דפדפן.
      return { ok: true, rows: out, total: out.length };
    }
    return { ok: false, reason: 'list_table_not_found' };
  }, { columns: LIST_COLUMNS, requestNumber: requestNumber ?? '' });

  if (!rows.ok) return { ...rows, step: 'list_read' };

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

/**
 * פותח בקשה קיימת בשלב «טעינת מסמכים».
 *
 * ‼ שני מסלולים לאיתור, ושניהם נעצרים לפני העלאה אם הזהות אינה מבוססת:
 *   · יש מספר בקשה — השורה שמכילה אותו, והמספר במסך שנפתח חייב להתאים.
 *   · אין מספר (הוא לא מוצג ברשימה) — חיפוש לפי ישות, ייחוס לפי שם,
 *     singleAttributedRequest, לחיצה על **אותה שורה בדיוק** (לפי מיקומה),
 *     ואז openedScreenMatches על המסך שנפתח.
 * כל זה ניווט בלבד. שום דבר לא נטען לשע״ם בפונקציה הזאת.
 */
export async function openRequestForDocuments(page, { requestNumber, entityId, expectedClientName }) {
  const want = String(requestNumber ?? '').replace(/\D/g, '');
  if (!want && !(entityId && expectedClientName)) {
    return { ok: false, reason: 'cannot_attribute', detail: 'אין מספר בקשה, ואין ישות ושם לייחוס', step: 'resume' };
  }
  const found = await findRequestRows(page, { requestNumber: want, entityId, expectedClientName });
  if (!found.ok) return found;
  if (found.rows.length === 0) return { ok: false, reason: 'request_not_found_in_list', step: 'resume' };

  let target = null;
  if (!want) {
    const single = singleAttributedRequest(found.rows);
    if (!single.ok) return { ...single, step: 'resume' };
    target = { tableIndex: single.row.tableIndex, trIndex: single.row.trIndex };
  }

  const clicked = await page.evaluate(({ requestNumber, target }) => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const isResume = (e) => /טעינ|מסמכ|המשך|עדכון/.test(clean(e.getAttribute?.('title') || e.getAttribute?.('alt') || e.textContent || ''));
    if (target) {
      const table = document.querySelectorAll('table')[target.tableIndex];
      const tr = table ? [...table.querySelectorAll('tbody tr, tr')][target.trIndex] : null;
      if (!tr) return { ok: false, reason: 'target_row_gone' };
      const control = [...tr.querySelectorAll('a, button, input[type=button], img')].find(isResume);
      if (!control) return { ok: false, reason: 'resume_control_not_found' };
      control.click();
      return { ok: true, via: 'attributed_row' };
    }
    for (const tr of [...document.querySelectorAll('tr')]) {
      const text = clean(tr.textContent);
      if (!text) continue;
      const sibling = tr.nextElementSibling ? clean(tr.nextElementSibling.textContent) : '';
      if (!text.includes(requestNumber) && !sibling.includes(requestNumber)) continue;
      const control = [...tr.querySelectorAll('a, button, input[type=button], img')].find(isResume);
      if (control) { control.click(); return { ok: true, via: 'row_action' }; }
    }
    return { ok: false, reason: 'resume_control_not_found' };
  }, { requestNumber: want, target });

  if (!clicked.ok) return { ...clicked, step: 'resume' };
  await settle(page, { idleMs: 20000 });

  const step = await currentWizardStep(page);
  const onScreenNumber = await readRequestNumber(page);
  if (want && onScreenNumber && onScreenNumber !== want) {
    return { ok: false, reason: 'opened_wrong_request', detail: onScreenNumber, step: 'resume' };
  }
  if (step !== 4) return { ok: false, reason: 'did_not_reach_documents_step', detail: `שלב נוכחי: ${step}`, step: 'resume' };
  if (!want) {
    const body = await page.evaluate(() => document.body.innerText || '');
    if (!openedScreenMatches(body, { entityId, expectedClientName })) {
      return { ok: false, reason: 'cannot_verify_opened_request', step: 'resume' };
    }
  }
  return { ok: true, requestNumber: want || onScreenNumber || null };
}
