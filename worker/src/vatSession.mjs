// vatSession.mjs — מערכת הגבייה של מע״מ: «פרטי עוסק», קריאה בלבד.
//
// ‼ נצפה חי (25.10.2026) על ארבעה עוסקים מיוצגים, ומשם כל עוגן כאן:
//   · תפריט ראשי: /emhanmainmenu/MainMenu.aspx. «פרטי עוסק» עצמו יושב תחת
//     /EMHANOSEK/ — נתיב אחר באותו origin, ובאותו סשן.
//   · שדה מספר העוסק והחץ הכחול יושבים בראש **כל** מסך, עם אותם מזהים.
//     הזנת מספר ממסך פנימי משאירה אותך **באותה לשונית** — לא חוזרת לראשונה.
//   · שלוש לשוניות, שלושה דפים (WebForms, postback):
//       PirteyOsekPirteyIsum.aspx       פרטי רישום   — סוג תיק, תאריך פתיחה, ענף ראשי
//       PirteyOsekMeafyeneyDivuah.aspx  מאפייני דיווח — דיווח תקופתי, דוח אחרון שהוגש
//       PirteyOsekKtovot.aspx           מידע נוסף    — הרשאה (לחיוב חשבון)
//     שורת היתרות (סך זכות / סך חוב / סך יתרה) בראש כל אחת מהן.
//   · עוסק שאינו קיים / אינו מיוצג: «העוסק לא קיים בקובץ מע"מ» ב-LblError.
//   · כל מעבר לוקח 10–35 שניות, ולפעמים בלי אירוע ניווט (UpdatePanel) —
//     ולכן ממתינים ל**תוכן** (מספר העוסק בכותרת), לא לניווט ולא לשעון.
//   · click של Playwright נתקע על הקישורים האלה (המתנה ל«יציב» שלא מגיעה);
//     click של ה-DOM מפעיל אותו postback בדיוק.
import { settlePage, snapPage, VAT_URL, VAT_ANY_PATH } from './browserSession.mjs';

const OSEK_INPUT = 'HstTikim1_EmTwbCtlHstTikim_TxtMisOsek';
const OSEK_SUBMIT = 'HstTikim1_EmTwbCtlHstTikim_BtnSubmit';
const OSEK_ERROR = 'HstTikim1_EmTwbCtlHstTikim_LblError';
const TITLE_OSEK = 'PirteyOsekTitle1_EmTwbCtlPirteyOsekTitle_TdMisOsek';

/** שלוש הלשוניות — מזהה הקישור, הדף שנוחתים בו, ומה נקרא בו. */
export const VAT_TABS = [
  { link: 'LinkButton0', page: 'PirteyOsekPirteyIsum.aspx', fields: { fileType: 'lblSugTik', openingDate: 'lblTPticha', primaryIndustry: 'lblAnafRashi' } },
  { link: 'LinkButton1', page: 'PirteyOsekMeafyeneyDivuah.aspx', fields: { reportingFrequency: 'lblDivuahTkufati', lastReport: 'lblDohAharon' } },
  // «מייצג ראשי: 314667346 ישר גיא» — ו-userName בראש כל מסך: «ישר גיא 25/10/2026 CB4».
  { link: 'LinkButton2', page: 'PirteyOsekKtovot.aspx', fields: { debitAuthorization: 'lblHrsha', mainRepresentativeRaw: 'lblMyzg1', loggedInUser: 'userName' } },
];
const BALANCE_FIELDS = { balanceTotal: 'lblYitra', balanceDebit: 'lblSachHovot', balanceCredit: 'lblSachHehzerim' };

/** «314667346 ישר גיא» / «ישר גיא 25/10/2026 CB4» ⇒ «ישר גיא» — השם בלבד. */
export function personName(raw) {
  return String(raw ?? '').split(/\s+/).filter(w => w && !/\d/.test(w) && !/^[A-Z]{1,3}\d*$/.test(w)).join(' ');
}

const STEP_TIMEOUT_MS = 60000;

/**
 * לשונית מע״מ שכבר פתוחה — ואם אין, הלשונית שקיבלנו מנווטת לתפריט.
 * ‼ לא פותחים לשונית שנייה: מערכות הגבייה של שע״ם חד-סשן, ולשונית
 * נוספת על אותה מערכת מפילה את הראשונה (ראה reuseOpenSystemPage).
 */
export async function openVatWorkPage(page) {
  const found = await findOrOpenVat(page);
  if (!found.ok || OSEK_DETAILS_PATH.test(found.pathname)) return found;
  // ‼ בתפריט הראשי הזנת מספר נשארת בתפריט (אין לשוניות) — נכנסים קודם
  // ל«פרטי עוסק» דרך הקישור של התפריט עצמו (נצפה 25.10.2026: מפנה ל-
  // /EMHANOSEK/PirteyOsekPirteyIsum.aspx). בלי עוסק נבחר נוחתים במסך ריק,
  // ו-openOsek יודע להתחיל משם.
  await found.page.goto(OSEK_DETAILS_URL, { waitUntil: 'commit', timeout: STEP_TIMEOUT_MS }).catch(() => {});
  const deadline = Date.now() + STEP_TIMEOUT_MS;
  let st = null;
  while (Date.now() < deadline) {
    await found.page.waitForTimeout(700);
    st = await screenState(found.page);
    if (st?.hasPassword) return { ok: false, reason: 'login_required', pathname: st.pathname };
    if (st?.complete && OSEK_DETAILS_PATH.test(st.pathname) && (await found.page.$('#' + OSEK_INPUT))) {
      return { ...found, pathname: st.pathname };
    }
  }
  return { ok: false, reason: 'osek_details_timeout', pathname: st?.pathname };
}

const OSEK_DETAILS_URL = 'https://shaam.taxes.gov.il/emhanmainmenu/EmTwbMavarPage.aspx?cur=2&KodMaarecet=60000000&KodPage=100';
const OSEK_DETAILS_PATH = /^\/emhanosek\//i;

async function findOrOpenVat(page) {
  for (const p of page.context().pages()) {
    let path;
    try { path = new URL(p.url()).pathname; } catch { continue; }
    if (!VAT_ANY_PATH.test(path)) continue;
    const s = await snapPage(p);
    if (!s.hasPasswordField && (await p.$('#' + OSEK_INPUT))) return { ok: true, page: p, reused: true, pathname: s.pathname };
  }
  // ‼ לשונית על מסכי הכניסה = הרו"ח באמצע התחברות (או שצריך להתחבר). לא
  // מנווטים: בקשה לשרת בזמן מסך הקוד החד-פעמי מחזירה אותו להתחלה.
  for (const p of page.context().pages()) {
    try { if (new URL(p.url()).pathname.startsWith('/taxes-login/')) return { ok: false, reason: 'login_required', pathname: new URL(p.url()).pathname }; } catch { /* about:blank */ }
  }
  await page.goto(VAT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  const s = await settlePage(page);
  if (!VAT_ANY_PATH.test(s.pathname)) return { ok: false, reason: 'unexpected_destination', pathname: s.pathname };
  if (s.hasPasswordField) return { ok: false, reason: 'login_required', pathname: s.pathname };
  if (!(await page.$('#' + OSEK_INPUT))) return { ok: false, reason: 'osek_input_missing', pathname: s.pathname };
  return { ok: true, page, reused: false, pathname: s.pathname };
}

/** מה מוצג עכשיו: מספר העוסק בכותרת, שגיאה, והדף. */
async function screenState(page) {
  return page.evaluate((ids) => {
    const t = (id) => { const e = document.getElementById(id); return e ? (e.innerText ?? '').trim() : null; };
    return {
      pathname: location.pathname,
      osek: t(ids.title),
      error: t(ids.error) || null,
      // ‼ סשן שפג מפנה את הלשונית למסך הכניסה (/taxes-login/…/otpCts, נצפה
      // 25.10.2026) — זה «צריך להתחבר», לא תקלה במסך.
      hasPassword: !!document.querySelector('input[type=password]') || !new RegExp(ids.vatPath, 'i').test(location.pathname),
      complete: document.readyState === 'complete',
      // ‼ «פרטי עוסק» ריק: אין עוסק בכותרת, אין שגיאה, והשדה ריק. נצפה
      // (25.10.2026) כשהלשונית עמדה פתוחה לילה שלם: ה-postback הראשון רק
      // «מאפס» את המסך, והשני כבר פותח את העוסק.
      blank: !t(ids.title) && !t(ids.error) && !(document.getElementById(ids.input)?.value ?? '').trim(),
    };
  }, { title: TITLE_OSEK, error: OSEK_ERROR, input: OSEK_INPUT, vatPath: VAT_ANY_PATH.source }).catch(() => null);
}

/** מפעיל postback בלחיצת DOM, וממתין עד שהתנאי על המסך מתקיים. */
async function postbackAndWait(page, elementId, until) {
  await page.evaluate((id) => document.getElementById(id)?.click(), elementId).catch(() => {});
  const deadline = Date.now() + STEP_TIMEOUT_MS;
  let s = null;
  while (Date.now() < deadline) {
    await page.waitForTimeout(700);
    s = await screenState(page);
    // ‼ דף שעוד נטען כבר מציג את הכותרת אבל לא את הלשוניות — רק דף שלם.
    if (s && (s.hasPassword || (s.complete && until(s)))) return s;
  }
  return s;
}

/**
 * פותח את «פרטי עוסק» של מספר העוסק הזה. ‼ מספר שכבר מוצג בכותרת לא נשלח
 * שוב — אבל נבדק שהוא **בדיוק** המספר, ולא נשאר מהעוסק הקודם.
 */
export async function openOsek(page, osekNumber) {
  const before = await screenState(page);
  if (before?.osek === osekNumber && !before.error && /\/emhanosek\//i.test(before.pathname)) {
    return { ok: true, state: before, reused: true };
  }
  let s = null;
  let prev = before;
  // ‼ לכל היותר שתי הגשות: השנייה רק כשהראשונה נחתה על מסך ריק (ראה blank).
  for (let round = 0; round < 2; round++) {
    const set = await page.evaluate(({ id, v }) => {
      const el = document.getElementById(id);
      if (!el) return null;
      el.value = v;
      return el.value;
    }, { id: OSEK_INPUT, v: osekNumber }).catch(() => null);
    if (set !== osekNumber) {
      const now = await screenState(page);
      return { ok: false, reason: now?.hasPassword ? 'login_required' : 'osek_value_not_applied' };
    }
    // ‼ שגיאה ישנה («לא קיים») עלולה להישאר על המסך עד שהתשובה מגיעה —
    // מכריעים רק לפי מספר שהשתנה או שגיאה במסך שכבר אינו המסך הקודם.
    const was = prev;
    s = await postbackAndWait(page, OSEK_SUBMIT, (st) =>
      st.osek === osekNumber || st.blank
      || (!!st.error && (st.osek !== was?.osek || st.pathname !== was?.pathname || !was?.error)));
    if (!s?.blank || s.hasPassword) break;
    prev = s;
  }
  if (!s) return { ok: false, reason: 'no_screen' };
  if (s.hasPassword) return { ok: false, reason: 'login_required' };
  if (s.osek === osekNumber && !s.error) return { ok: true, state: s, reused: false };
  if (s.error) return { ok: false, reason: 'osek_not_found', detail: s.error };
  return { ok: false, reason: 'osek_screen_timeout', detail: JSON.stringify(s).slice(0, 160) };
}

/** קורא את המזהים של הלשונית שעל המסך + שורת היתרות. null ⇒ לא קיים בדף. */
async function readIds(page, ids) {
  return page.evaluate((map) => {
    const out = {};
    for (const [k, id] of Object.entries(map)) {
      const e = document.getElementById(id);
      out[k] = e ? (e.innerText ?? '').replace(/\s+/g, ' ').trim() : null;
    }
    return out;
  }, ids);
}

/**
 * קורא את שלוש הלשוניות של העוסק שכבר פתוח. מתחיל מהלשונית שעל המסך (אין
 * מעבר מיותר), ועובר רק לאלה שחסרות. ‼ לפני כל קריאה — מספר העוסק בכותרת
 * חייב להיות המספר שביקשנו.
 */
export async function readOsekTabs(page, osekNumber, note = () => {}) {
  const raw = {};
  let balance = null;
  const onPage = (st, tab) => st.pathname.toLowerCase().endsWith('/' + tab.page.toLowerCase());
  let state = await screenState(page);
  const order = [...VAT_TABS].sort((a, b) => (onPage(state, b) ? 1 : 0) - (onPage(state, a) ? 1 : 0));
  for (const tab of order) {
    if (!onPage(state, tab)) {
      if (!(await page.$('#' + tab.link))) return { ok: false, reason: 'tab_missing', detail: tab.link };
      const t0 = Date.now();
      state = await postbackAndWait(page, tab.link, (st) => st.blank || (onPage(st, tab) && st.osek === osekNumber));
      note(`לשונית ${tab.page} · ${Math.round((Date.now() - t0) / 1000)} ש׳`);
      if (!state) return { ok: false, reason: 'no_screen' };
      if (state.hasPassword) return { ok: false, reason: 'login_required' };
      // ‼ השרת «שכח» את העוסק (ראה blank) — פותחים אותו שוב פעם אחת; הזנה
      // מתוך לשונית נשארת באותה לשונית.
      if (state.blank) {
        const again = await openOsek(page, osekNumber);
        if (!again.ok) return { ok: false, reason: again.reason, detail: again.detail };
        state = again.state;
        note(`העוסק נפתח מחדש אחרי מסך ריק · ${state.pathname}`);
        if (!onPage(state, tab)) {
          state = await postbackAndWait(page, tab.link, (st) => onPage(st, tab) && st.osek === osekNumber);
          if (!state) return { ok: false, reason: 'no_screen' };
          if (state.hasPassword) return { ok: false, reason: 'login_required' };
        }
      }
      if (!onPage(state, tab)) return { ok: false, reason: 'tab_timeout', detail: tab.page };
    }
    if (state.osek !== osekNumber) return { ok: false, reason: 'osek_mismatch', detail: state.osek };
    Object.assign(raw, await readIds(page, tab.fields));
    if (!balance) balance = await readIds(page, BALANCE_FIELDS);
  }
  return { ok: true, raw: { ...raw, ...(balance ?? {}) }, pathname: state.pathname };
}
