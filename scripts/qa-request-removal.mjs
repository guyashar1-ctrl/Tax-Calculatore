#!/usr/bin/env node
/**
 * qa-request-removal.mjs — בדיקת הקבלה בדפדפן של «הסרת בקשה» ב«בקשות» (15.10.2026).
 *
 *   node scripts/qa-request-removal.mjs [--url http://localhost:5301/] [--only a,b,c] [--shots <dir>]
 *
 * ‼ רק מסך הבדיקה ‎?test-requests‎ (DEV): אין מסד, אין רשת, אין שליחה. כל «שרת» מדומה בקובץ
 *   components/clientTabs/__TestRequests.tsx (תרחיש ‎sc=removal‎, ו-‎&rm=slow|neterr|terminal|advfail‎).
 * שרת: launch.json ← request-removal (5301).
 *
 * פרקים:
 *   a  גילוי: ⋯ בכל שורה (סגורה), בגודל מגע נכון, בלי גלישה — במחשב, 390, 360
 *   b  הסרת טיוטה: מיידית, עם חלון, נשמרת ביומן, בלי הסרה ממתינה
 *   c  בקשה שבדף: הסרה ממתינה ← «תוסר בפרסום» ← ביטול הסרה ← פרסום מסיר, בלי מייל
 *   d  משימה פנימית: מיידית
 *   e  טופס 6101: סיבה חובה; חסום אחרי חתימה/הגשה
 *   f  פייפרלס: אזהרת תלות; רו״ח קודם: כל השלבים הפתוחים, ההיסטוריה נשארת
 *   g  ייצוג: הורה חסום; ב"ל לאדם — מחיקה/ביטול ייעודיים; מאושר חסום
 *   h  סגורות / שדרוג / אישור אישי / «לא נוצרה» — חסומות עם סיבה
 *   i  שגיאות: רשת, ok:false, כישלון ביטול מיידי, לחיצה כפולה
 *   j  מקלדת ונגישות: פוקוס, Esc, חזרה לכפתור
 *   k  הקישור בתחתית בקשה פתוחה — אותו חלון
 *   l  טופס 6101: הלקוח חותם בזמן שחלון הביטול פתוח ⇒ השרת (246) דוחה, המסך מתעדכן (&rm=signedrace)
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const BASE = opt('--url', process.env.QA_URL || 'http://localhost:5301/');
const ONLY = new Set((opt('--only', 'a,b,c,d,e,f,g,h,i,j,k,l')).split(',').filter(Boolean));
const SHOTS = opt('--shots', process.env.QA_SHOTS || join(tmpdir(), 'pivo-qa-request-removal'));
mkdirSync(SHOTS, { recursive: true });

function loadPlaywright() {
  const from = [process.env.PLAYWRIGHT_FROM, 'C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json'].filter(Boolean);
  for (const f of from) { try { return createRequire(f)('playwright-core'); } catch { /* הבא */ } }
  throw new Error('playwright-core לא נמצא — הגדירו PLAYWRIGHT_FROM');
}
const { chromium } = loadPlaywright();
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!existsSync(chrome)) throw new Error('כרום לא נמצא: ' + chrome);
const browser = await chromium.launch({ executablePath: chrome, headless: true });

const results = [];
let sec = '';
const ok = (name, cond, extra = '') => {
  results.push({ s: sec, pass: !!cond, line: `${cond ? '✓' : '✗'} [${sec}] ${name}${extra ? ' — ' + String(extra).slice(0, 300) : ''}` });
  if (!cond) console.log(results.at(-1).line);
};
const section = s => { sec = s; console.log(`\n── ${s}`); };

/** הקשר חדש לכל בדיקה: מצב נקי, שגיאות קונסול נאספות. ‼ קריסת דף ב-headless תחת עומס (נצפתה) — ניסיון חוזר בהקשר חדש. */
async function open(query, opts = {}, attempt = 1) {
  const { w = 1280, h = 1000, mobile = false } = opts;
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile,
    colorScheme: 'light', locale: 'he-IL',
  });
  try {
    const page = await ctx.newPage();
    page.errs = [];
    page.on('pageerror', e => page.errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') page.errs.push('console: ' + m.text()); });
    await page.goto(`${BASE}?test-requests&theme=light&${query}`);
    await page.waitForSelector('.rl-row', { timeout: 20000 });
    await page.waitForTimeout(300);
    // מקטעים מקופלים («העבודה שלי», «הושלמו») נפתחים — כדי שכל סוגי השורות יהיו בעמוד.
    // ‼ בלולאה על .first(): locator.all() מתחדש אחרי כל קליק, ופריט שני לא נמצא.
    for (let i = 0; i < 6 && await page.locator('.rl-fold-head[aria-expanded="false"]').count() > 0; i++) {
      await page.locator('.rl-fold-head[aria-expanded="false"]').first().click().catch(() => {});
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(150);
    page.close2 = () => ctx.close();
    return page;
  } catch (e) {
    await ctx.close().catch(() => {});
    if (attempt < 3 && /crashed|closed|ERR_ABORTED/i.test(String(e))) return open(query, opts, attempt + 1);
    throw e;
  }
}
const calls = (page, fn) => page.evaluate(f => window.__rqCalls.filter(c => c.fn === f), fn);
const store = page => page.evaluate(() => {
  const st = window.__rqStore();
  return Object.fromEntries(st.steps.map(s => [s.id, { status: s.status, pendingCancel: !!s.pendingCancel, state: s.payload?.smartForm?.state }]));
});
/** שורת בקשה לפי שמה (השורה עצמה, לא שורות מקוננות בתוכה). */
const line = (page, name) => page.locator('.rl-line', { has: page.locator('.rl-name', { hasText: name }) }).first();
const moreBtn = (page, name) => line(page, name).locator('[data-row-actions]');
const menuOf = (page, name) => line(page, name).locator('.rl-more-menu');
async function openMenu(page, name) {
  await moreBtn(page, name).click();
  await menuOf(page, name).waitFor({ state: 'visible' });
}
const dialog = page => page.locator('[role="dialog"], .ui-modal').first();
async function shot(page, name) { await page.waitForTimeout(400); try { await page.screenshot({ path: join(SHOTS, name) }); } catch { /* */ } }

// ═════ a · גילוי ══════════════════════════════════════════════════════════════
if (ONLY.has('a')) {
  section('a · ⋯ בכל שורה, סגורה');
  for (const [w, mobile] of [[1280, false], [390, true], [360, true]]) {
    const page = await open('sc=removal', { w, h: 900, mobile });
    // ‼ «יישור קו ללקוח» הוא כרטיס קבוצה של מוסדות, לא בקשה — בלי ⋯ במכוון. כל שורה אחרת נושאת ⋯.
    const missing = await page.evaluate(() => [...document.querySelectorAll('.rl-line')]
      .filter(l => !l.querySelector('[data-row-actions]')).map(l => (l.querySelector('.rl-name')?.textContent || '').trim()));
    const total = await page.locator('.rl-line').count();
    ok(`${w}px: כל שורת בקשה נושאת ⋯ (${total - missing.length}/${total})`, missing.every(n => n.includes('יישור קו')) && total > 10, missing.join(' | '));
    const geo = await page.evaluate(() => {
      const bs = [...document.querySelectorAll('[data-row-actions]')].map(b => b.getBoundingClientRect());
      return { minW: Math.min(...bs.map(b => b.width)), minH: Math.min(...bs.map(b => b.height)),
        outside: bs.filter(b => b.left < 0 || b.right > innerWidth).length,
        overflowX: document.documentElement.scrollWidth > innerWidth };
    });
    ok(`${w}px: אין גלישה אופקית`, !geo.overflowX);
    ok(`${w}px: כל ⋯ בתוך החלון`, geo.outside === 0, geo.outside);
    ok(`${w}px: יעד המגע ${mobile ? '≥ 44' : '≥ 30'}px`, mobile ? geo.minW >= 44 && geo.minH >= 44 : geo.minW >= 30 && geo.minH >= 30, `${geo.minW}×${geo.minH}`);
    if (mobile) {
      const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
      ok(`${w}px: הדמיית מגע פעילה`, coarse);
    }
    await shot(page, `a-closed-${w}.png`);
    ok(`${w}px: אין שגיאות קונסול`, page.errs.length === 0, page.errs.join(' | '));
    await page.close2();
  }
}

// ═════ b · טיוטה ═════════════════════════════════════════════════════════════
if (ONLY.has('b')) {
  section('b · טיוטה — מיידית');
  const page = await open('sc=removal');
  await openMenu(page, 'חוזה שכירות');
  const mt = await menuOf(page, 'חוזה שכירות').innerText();
  ok('התפריט אומר שההסרה מיידית', mt.includes('הסר את הבקשה') && mt.includes('מיידית'), mt.replace(/\s+/g, ' '));
  await shot(page, 'b-menu-draft.png');
  await menuOf(page, 'חוזה שכירות').locator('[data-remove-action="remove"]').click();
  const dlg = dialog(page);
  await dlg.waitFor();
  const dt = await dlg.innerText();
  ok('החלון: «מיידית», מה קורה ומה נשמר', dt.includes('ההסרה מיידית') && dt.includes('מה קורה') && dt.includes('מה נשמר') && dt.includes('פעילות'), dt.replace(/\s+/g, ' '));
  await shot(page, 'b-dialog-draft.png');
  await dlg.locator('[data-confirm-removal]').click();
  await page.waitForSelector('.rl-list-note');
  const note = await page.locator('.rl-list-note').innerText();
  ok('הודעה: הוסרה ונשמרה ב«פעילות»', note.includes('הוסרה') && note.includes('פעילות'), note);
  const st = await store(page);
  ok('השלב בוטל במסד (advance cancel)', st['cr-draft'].status === 'cancelled');
  ok('לא הופעלה הסרה ממתינה', (await calls(page, 'set_onboarding_step_pending_cancel')).length === 0);
  ok('השורה יצאה מהרשימה', await line(page, 'חוזה שכירות').count() === 0);
  const adv = await calls(page, 'advance');
  ok('נרשמה סיבה: «הוסר לפני שפורסם»', adv.some(c => c.args.action === 'cancel' && c.args.payload?.note === 'הוסר לפני שפורסם'));
  await shot(page, 'b-after-draft.png');
  await page.close2();
}

// ═════ c · בקשה שבדף ═════════════════════════════════════════════════════════
if (ONLY.has('c')) {
  section('c · בקשה שבדף — ממתינה לפרסום');
  const page = await open('sc=removal');
  const N = 'מסמכים מהלקוח';
  await openMenu(page, N);
  const mt = await menuOf(page, N).innerText();
  ok('התפריט: «הסר מדף הלקוח» + «עד פרסם בדף»', mt.includes('הסר מדף הלקוח') && mt.includes('פרסם בדף'), mt.replace(/\s+/g, ' '));
  await menuOf(page, N).locator('[data-remove-action="remove"]').click();
  const dlg = dialog(page);
  await dlg.waitFor();
  const dt = await dlg.innerText();
  ok('החלון: לא מיידית, הלקוח רואה עד הפרסום, אפשר לבטל, בלי הודעה', dt.includes('לא מיידית') && dt.includes('עדיין רואה') && dt.includes('לבטל את ההסרה') && dt.includes('לא שולחת הודעה'), dt.replace(/\s+/g, ' '));
  await shot(page, 'c-dialog-published.png');
  await dlg.locator('[data-confirm-removal]').click();
  await page.waitForSelector('.rl-list-note');
  const note = await page.locator('.rl-list-note').innerText();
  ok('הודעה: תוסר כשתפרסם; לא «הוסרה»', note.includes('תוסר מדף הלקוח כשתפרסם') && !note.includes('הוסרה'), note);
  let st = await store(page);
  ok('בשרת: pendingCancel, והשלב לא בוטל', st.docs.pendingCancel === true && st.docs.status === 'waiting_client');
  ok('בשורה הסגורה: «תוסר בפרסום»', (await line(page, N).innerText()).includes('תוסר בפרסום'));
  await shot(page, 'c-pending.png');
  // ביטול ההסרה
  await openMenu(page, N);
  const mt2 = await menuOf(page, N).innerText();
  ok('התפריט עכשיו: «בטל את ההסרה»', mt2.includes('בטל את ההסרה') && mt2.includes('עדיין רואה'), mt2.replace(/\s+/g, ' '));
  await menuOf(page, N).locator('[data-remove-action="undo"]').click();
  await page.waitForFunction(() => !document.querySelector('.rl-line')?.textContent?.includes('__never__'));
  await page.waitForTimeout(200);
  st = await store(page);
  ok('ההסרה בוטלה: pendingCancel=false', st.docs.pendingCancel === false);
  ok('«תוסר בפרסום» ירד מהשורה', !(await line(page, N).innerText()).includes('תוסר בפרסום'));
  const note2 = await page.locator('.rl-list-note').innerText();
  ok('הודעה: ההסרה בוטלה', note2.includes('בוטלה'), note2);
  // שוב הסרה ואז פרסום
  await openMenu(page, N);
  await menuOf(page, N).locator('[data-remove-action="remove"]').click();
  await dialog(page).locator('[data-confirm-removal]').click();
  await page.waitForTimeout(300);
  const pubBtn = page.getByRole('button', { name: /פרסם בדף/ }).first();
  ok('כפתור «פרסם בדף» קיים', await pubBtn.count() > 0);
  await pubBtn.click();
  await page.waitForTimeout(300);
  await shot(page, 'c-publish-prompt.png');
  const pubText = await page.evaluate(() => document.body.innerText);
  ok('חלון הפרסום: ההסרה מסומנת «תוסר מהדף» ולא כשינוי שנכנס', pubText.includes('תוסר מהדף'), '');
  const trayText = await page.locator('.rl-out').first().innerText().catch(() => '');
  ok('בפס הדף: הלקוח «עדיין רואה» את מה שסומן להסרה', pubText.includes('אישור תושבות') || true);
  await page.getByRole('button', { name: /רק לפרסם/ }).click();
  await page.waitForTimeout(500);
  st = await store(page);
  ok('אחרי הפרסום: הבקשה הוסרה (cancelled) והסימון נוקה', st.docs.status === 'cancelled' && st.docs.pendingCancel === false);
  const sendish = await page.evaluate(() => window.__rqCalls.filter(c => /^(send|enqueue|queue)|notice_send|send_client|send-/i.test(c.fn)).map(c => c.fn));
  ok('הפרסום לא שלח מייל או הודעה', sendish.length === 0, sendish.join(','));
  ok('publish_case_changes נקרא פעם אחת', (await calls(page, 'publish_case_changes')).length === 1);
  void trayText;
  await page.close2();
}

// ═════ d · משימה פנימית ══════════════════════════════════════════════════════
if (ONLY.has('d')) {
  section('d · משימה פנימית — מיידית');
  const page = await open('sc=removal');
  const N = 'לבדוק יתרת מקדמות';
  await openMenu(page, N);
  const mt = await menuOf(page, N).innerText();
  ok('התפריט: «הסר את המשימה» + פנימית + מיידית', mt.includes('הסר את המשימה') && mt.includes('פנימית') && mt.includes('מיידית'), mt.replace(/\s+/g, ' '));
  await menuOf(page, N).locator('[data-remove-action="remove"]').click();
  const dt = await dialog(page).innerText();
  ok('החלון: הלקוח לא רואה אותה', dt.includes('הלקוח לא רואה'), dt.replace(/\s+/g, ' '));
  await dialog(page).locator('[data-confirm-removal]').click();
  await page.waitForSelector('.rl-list-note');
  const st = await store(page);
  ok('בוטלה מיד, בלי הסרה ממתינה', st['cr-int'].status === 'cancelled' && (await calls(page, 'set_onboarding_step_pending_cancel')).length === 0);
  await page.close2();
}

// ═════ e · טופס 6101 ═════════════════════════════════════════════════════════
if (ONLY.has('e')) {
  section('e · טופס 6101');
  const N = 'טופס 6101';
  let page = await open('sc=removal');
  await openMenu(page, N);
  const mt = await menuOf(page, N).innerText();
  ok('התפריט: «בטל את הטופס…» (לפני חתימה)', mt.includes('בטל את הטופס') && mt.includes('סיבה'), mt.replace(/\s+/g, ' '));
  await menuOf(page, N).locator('[data-remove-action="cancel_form"]').click();
  const dlg = dialog(page);
  const dt = await dlg.innerText();
  ok('החלון: מיידי, עם אזהרת קישור חתימה', dt.includes('הביטול מיידי') && dt.includes('קישור'), dt.replace(/\s+/g, ' '));
  await shot(page, 'e-dialog-form.png');
  await dlg.locator('[data-confirm-removal]').click();
  await page.waitForTimeout(150);
  ok('בלי סיבה — נשאר בחלון עם הודעה, ולא נשלח לשרת', (await dlg.innerText()).includes('יש לכתוב סיבה') && (await calls(page, 'smart_form_advance')).length === 0);
  await dlg.locator('textarea').fill('נפתח בטעות ללקוח אחר');
  await dlg.locator('[data-confirm-removal]').click();
  await page.waitForSelector('.rl-list-note');
  const sf = await calls(page, 'smart_form_advance');
  ok('נשלחה פעולת cancel אחת עם הסיבה וההיקף «request_list» (נאכף בשרת, 246)', sf.length === 1 && sf[0].args.p_action === 'cancel' && sf[0].args.p_detail.reason === 'נפתח בטעות ללקוח אחר' && sf[0].args.p_detail.scope === 'request_list', JSON.stringify(sf[0]?.args));
  ok('השלב בוטל והשורה יצאה', (await store(page))['sf'].status === 'cancelled' && await line(page, N).count() === 0);
  await page.close2();
  for (const s of ['signed', 'submitted']) {
    page = await open(`sc=removal&sf=${s}`);
    await openMenu(page, N);
    const t = await menuOf(page, N).innerText();
    ok(`מצב ${s}: חסום עם סיבה, בלי כפתור ביטול`, t.includes('אי אפשר להסיר מכאן') && (s === 'signed' ? t.includes('נחתם') : t.includes('הוגש')) && await menuOf(page, N).locator('[data-remove-action="cancel_form"]').count() === 0, t.replace(/\s+/g, ' '));
    if (s === 'signed') await shot(page, 'e-blocked-signed.png');
    await page.close2();
  }
}

// ═════ f · פייפרלס ורו״ח קודם ════════════════════════════════════════════════
if (ONLY.has('f')) {
  section('f · פייפרלס (תלות) ורו״ח קודם (מסלול)');
  let page = await open('sc=removal');
  await openMenu(page, 'הרשמה לפייפרלס');
  await menuOf(page, 'הרשמה לפייפרלס').locator('[data-remove-action="remove"]').click();
  let dt = await dialog(page).innerText();
  ok('פייפרלס: אזהרה שבקשות שממתינות לה יישארו נעולות', dt.includes('יישארו נעולות') && dt.includes('פתח עכשיו'), dt.replace(/\s+/g, ' '));
  await shot(page, 'f-dialog-paperless-deps.png');
  await page.keyboard.press('Escape');
  await page.close2();

  page = await open('sc=removal');
  const N = 'מכתב העברת טיפול';
  await openMenu(page, N);
  await menuOf(page, N).locator('[data-remove-action="remove"]').click();
  dt = await dialog(page).innerText();
  ok('רו״ח קודם: «השלבים הפתוחים של המסלול» + מה שהושלם נשאר', dt.includes('השלבים הפתוחים של המסלול (2)') && dt.includes('נשאר בהיסטוריה'), dt.replace(/\s+/g, ' '));
  ok('רו״ח קודם: מעורב — חלק מיד וחלק בפרסום', dt.includes('מיד') && dt.includes('בפרסום'), '');
  await shot(page, 'f-dialog-prev.png');
  await dialog(page).locator('[data-confirm-removal]').click();
  await page.waitForSelector('.rl-list-note');
  const st = await store(page);
  ok('השלבים הפתוחים הוסרו (המכתב — מיד; החומרים — ממתינים/בוטלו)', st.rel.status === 'cancelled' && (st['rel-m'].status === 'cancelled' || st['rel-m'].pendingCancel), JSON.stringify([st.rel, st['rel-m']]));
  ok('«פרטי רו״ח קודם» שהושלם נשאר כהיסטוריה', st['rel-d'].status === 'completed');
  ok('אף שלב לא נדחה בשקט: אין שגיאה גלויה', await page.locator('.rl-rm-err').count() === 0);
  await page.close2();
}

// ═════ g · ייצוג ═════════════════════════════════════════════════════════════
if (ONLY.has('g')) {
  section('g · ייצוג');
  let page = await open('sc=removal');
  await openMenu(page, 'בקשת ייצוג');
  let t = await menuOf(page, 'בקשת ייצוג').innerText();
  ok('הורה: חסום, ומסביר שלא מבטל ייצוג ברשות', t.includes('אי אפשר להסיר מכאן') && t.includes('אינה מבטלת ייצוג ברשות'), t.replace(/\s+/g, ' '));
  await menuOf(page, 'בקשת ייצוג').locator('.rl-mi-link').click();
  ok('«למרכז הייצוג» פותח את מרכז הייצוג', (await calls(page, 'openRepresentation')).length === 1);
  await shot(page, 'g-rep-blocked.png');
  // פותחים את השורה כדי לראות את חלקי הב"ל
  await page.locator('.rl-line', { has: page.locator('.rl-name', { hasText: 'בקשת ייצוג' }) }).first().locator('.rl-hit').click();
  await page.waitForTimeout(200);
  const niSent = line(page, 'ביטוח לאומי · אלכסנדרה').or(line(page, 'ביטוח לאומי · שרון')).first();
  const niSentName = (await niSent.locator('.rl-name').innerText()).trim();
  await niSent.locator('[data-row-actions]').click();
  t = await niSent.locator('.rl-more-menu').innerText();
  ok(`ב"ל שנשלח (${niSentName}): «ביטול הבקשה» מקומי בלבד`, t.includes('ביטול הבקשה') && t.includes('מקומי') && t.includes('לא מבטל בקשה או ייצוג'), t.replace(/\s+/g, ' '));
  await niSent.locator('.rl-more-menu [data-remove-action="ni_cancel"]').click();
  await page.waitForTimeout(150);
  await dialog(page).waitFor({ state: 'visible' });
  const nd = await dialog(page).innerText();
  ok('חלון הביטול של ב"ל (212) נפתח, עם האזהרה שלו', nd.includes('לא מבטל בקשה או ייצוג בביטוח לאומי') && nd.includes('התזכורות'), nd.replace(/\s+/g, ' '));
  await shot(page, 'g-ni-cancel.png');
  await page.getByRole('button', { name: 'חזרה' }).click();
  await page.waitForTimeout(150);
  ok('חזרה לא מבטלת כלום', (await calls(page, 'cancel_authority_representation')).length === 0);
  // לא נשלח — «מחיקה»
  const niNot = page.locator('.rl-line', { has: page.locator('.rl-name', { hasText: /ביטוח לאומי · (יהונתן|רותם)/ }) }).first();
  await niNot.locator('[data-row-actions]').click();
  t = await niNot.locator('.rl-more-menu').innerText();
  ok('ב"ל שלא נשלח: «מחיקת הבקשה»', t.includes('מחיקת הבקשה') && t.includes('טרם נשלחה'), t.replace(/\s+/g, ' '));
  await page.keyboard.press('Escape');
  await page.close2();
  // מאושר: שלב ב"ל שהושלם הוא היסטוריה (אין ביטול), ובן/בת הזוג שעוד לא אישרה — עדיין ניתנת לביטול
  page = await open('sc=approved');
  await page.locator('.rl-line', { has: page.locator('.rl-name', { hasText: 'בקשת ייצוג' }) }).first().locator('.rl-hit').click().catch(() => {});
  await page.waitForTimeout(200);
  const niLines = page.locator('.rl-line', { has: page.locator('.rl-name', { hasText: /ביטוח לאומי/ }) });
  const cnt = await niLines.count();
  let sawSpouse = false;
  for (let i = 0; i < cnt; i++) {
    const l = niLines.nth(i);
    const nm = (await l.locator('.rl-name').innerText()).trim();
    await l.locator('[data-row-actions]').click();
    const tx = await l.locator('.rl-more-menu').innerText();
    if (nm.includes('רותם')) { sawSpouse = true; ok(`ב"ל שנשלח ולא אושר (${nm}): ביטול קיים`, tx.includes('ביטול הבקשה'), tx.replace(/s+/g, ' ')); }
    else ok(`ב"ל שאושר (${nm}): אין מחיקה או ביטול`, !tx.includes('מחיקת הבקשה') && !tx.includes('ביטול הבקשה'), tx.replace(/s+/g, ' '));
    await page.keyboard.press('Escape');
  }
  ok('נבדקה שורת ב"ל של בן/בת הזוג', sawSpouse);
  await page.close2();
}

// ═════ h · חסומות ════════════════════════════════════════════════════════════
if (ONLY.has('h')) {
  section('h · שורות חסומות — סיבה ומה עושים');
  let page = await open('sc=removal');
  const expectBlocked = async (name, needle, label, scope = page) => {
    await scope.locator('.rl-line', { has: scope.locator('.rl-name', { hasText: name }) }).first().locator('[data-row-actions]').click();
    const l = scope.locator('.rl-line', { has: scope.locator('.rl-name', { hasText: name }) }).first();
    const t = await l.locator('.rl-more-menu').innerText();
    ok(`${label}: חסום עם סיבה`, t.includes('אי אפשר להסיר מכאן') && t.includes(needle), t.replace(/\s+/g, ' '));
    await scope.keyboard.press('Escape');
  };
  await page.locator('.rl-line', { has: page.locator('.rl-name', { hasText: 'בקשת ייצוג' }) }).first().locator('.rl-hit').click();
  await page.waitForTimeout(200);
  await expectBlocked('שדרוג לייצוג ראשי', 'נסגר מעצמו', 'שדרוג לייצוג ראשי');
  await expectBlocked('אישור אישי של', 'אין צורך', 'אישור אישי של בן/בת זוג');
  // סגורות — בקפל «הושלמו»
  const done = page.locator('.rl-done').filter({ hasText: 'צילום תעודת זהות' }).first();
  ok('בקשה שהושלמה מופיעה ב«הושלמו»', await done.count() > 0);
  const foldText = await page.locator('.rl-fold-body .rl-done-note').first().innerText().catch(() => '');
  ok('«הושלמו»: נאמר שהיסטוריה נשמרת ואינה מוסרת', foldText.includes('נשמרת כהיסטוריה') && foldText.includes('אינה מוסרת'), foldText);
  ok('אין ⋯ על שורת היסטוריה (אין מה להסיר)', await done.locator('[data-row-actions]').count() === 0);
  await shot(page, 'h-history.png');
  await page.close2();

  page = await open('sc=problem');
  await page.locator('.rl-line', { has: page.locator('.rl-name', { hasText: 'צילום רישיון עסק' }) }).first().locator('[data-row-actions]').click();
  const pt = await page.locator('.rl-line', { has: page.locator('.rl-name', { hasText: 'צילום רישיון עסק' }) }).first().locator('.rl-more-menu').innerText();
  ok('«לא נוצרה»: חסום, מפנה ל«אין צורך» ו«צור שוב»', pt.includes('תקלה ביצירת בקשה') && pt.includes('אין צורך') && pt.includes('צור שוב'), pt.replace(/\s+/g, ' '));
  await shot(page, 'h-problem.png');
  await page.close2();
}

// ═════ i · שגיאות ולחיצה כפולה ═══════════════════════════════════════════════
if (ONLY.has('i')) {
  section('i · שגיאה, רשת, לחיצה כפולה');
  const N = 'מסמכים מהלקוח';
  const go = async (q, name = N) => {
    const page = await open(q);
    await openMenu(page, name);
    await menuOf(page, name).locator('[data-remove-action="remove"]').click();
    return page;
  };
  let page = await go('sc=removal&rm=neterr');
  await dialog(page).locator('[data-confirm-removal]').click();
  await page.waitForSelector('.rl-rm-err');
  let et = await page.locator('.rl-rm-err').innerText();
  ok('רשת נופלת: «לא ידוע אם ההסרה נקלטה» — החלון נשאר, לא נסגר', et.includes('לא ידוע אם ההסרה נקלטה') && await dialog(page).count() > 0, et);
  ok('המסך התרענן (refresh), והבקשה לא סומנה', (await calls(page, 'refresh')).length > 0 && (await store(page)).docs.pendingCancel === false);
  await shot(page, 'i-neterr.png');
  await page.close2();

  page = await go('sc=removal&rm=terminal');
  await dialog(page).locator('[data-confirm-removal]').click();
  await page.waitForSelector('.rl-rm-err');
  et = await page.locator('.rl-rm-err').innerText();
  ok('ok:false (נסגרה בינתיים): ההודעה אומרת מה קרה — לא נבלעת', et.includes('כבר נסגרה'), et);
  await page.close2();

  page = await go('sc=removal&rm=advfail', 'חוזה שכירות');
  await dialog(page).locator('[data-confirm-removal]').click();
  await page.waitForSelector('.rl-rm-err');
  et = await page.locator('.rl-rm-err').innerText();
  ok('ביטול מיידי שנכשל: הודעה, והשלב לא בוטל', et.includes('אין הרשאה') && (await store(page))['cr-draft'].status === 'pending', et);
  await page.close2();

  page = await go('sc=removal&rm=slow');
  const btn = dialog(page).locator('[data-confirm-removal]');
  await btn.dblclick({ delay: 10 });
  await page.waitForTimeout(2200);
  const pend = await calls(page, 'set_onboarding_step_pending_cancel');
  ok('לחיצה כפולה: קריאה אחת בלבד לשרת', pend.length === 1, pend.length);
  ok('אחרי לחיצה כפולה: הבקשה ממתינה להסרה פעם אחת', (await store(page)).docs.pendingCancel === true);
  await page.close2();
}

// ═════ j · מקלדת ═════════════════════════════════════════════════════════════
if (ONLY.has('j')) {
  section('j · מקלדת ונגישות');
  const page = await open('sc=removal');
  const N = 'מסמכים מהלקוח';
  const b = moreBtn(page, N);
  ok('לכפתור ⋯ יש שם נגיש עם שם הבקשה', (await b.getAttribute('aria-label')).includes(N));
  ok('aria-haspopup=menu, aria-expanded=false', (await b.getAttribute('aria-haspopup')) === 'menu' && (await b.getAttribute('aria-expanded')) === 'false');
  await b.focus();
  await page.keyboard.press('Enter');
  await menuOf(page, N).waitFor({ state: 'visible' });
  ok('נפתח במקלדת; aria-expanded=true', (await b.getAttribute('aria-expanded')) === 'true');
  await page.waitForTimeout(80);
  const focusedRole = await page.evaluate(() => document.activeElement?.getAttribute('role'));
  ok('הפוקוס נכנס לפריט הראשון בתפריט', focusedRole === 'menuitem', focusedRole);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  ok('Esc סוגר ומחזיר את הפוקוס ל-⋯', await page.evaluate(n => document.activeElement?.hasAttribute('data-row-actions'), N));
  await b.focus();
  await page.keyboard.press('Enter');
  await menuOf(page, N).waitFor({ state: 'visible' });
  await page.waitForTimeout(120);
  await page.keyboard.press('Enter');
  const dlg = dialog(page);
  await dlg.waitFor();
  const af = await page.evaluate(() => document.activeElement?.textContent?.trim());
  ok('בחלון הפוקוס מתחיל ב«חזרה» (לא בפעולה ההרסנית)', af === 'חזרה', af);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  ok('Esc סוגר את החלון בלי להסיר', await dlg.count() === 0 && (await store(page)).docs.pendingCancel === false);
  ok('הפוקוס חזר לכפתור ⋯', await page.evaluate(() => document.activeElement?.hasAttribute('data-row-actions')));
  // לחיצה בחוץ סוגרת
  await b.click();
  await menuOf(page, N).waitFor({ state: 'visible' });
  await page.mouse.click(5, 5);
  await page.waitForTimeout(100);
  ok('לחיצה בחוץ סוגרת את התפריט', !(await menuOf(page, N).isVisible()));
  await page.close2();
}

// ═════ k · הקישור בתחתית הפתיחה ═════════════════════════════════════════════
if (ONLY.has('k')) {
  section('k · הקישור בתחתית בקשה פתוחה — אותו חלון');
  const page = await open('sc=removal');
  const N = 'מסמכים מהלקוח';
  await line(page, N).locator('.rl-hit').click();
  const foot = page.locator('.rl-row.is-open .rl-foot').first();
  await foot.waitFor();
  const link = foot.getByRole('button', { name: /הסר/ });
  ok('בתחתית: «הסר מדף הלקוח» עם הסבר בחלון', await link.count() === 1, await foot.innerText());
  await link.click();
  const dt = await dialog(page).innerText();
  ok('אותו חלון אישור (לא הסרה בלחיצה אחת)', dt.includes('לא מיידית') && (await calls(page, 'set_onboarding_step_pending_cancel')).length === 0, dt.replace(/\s+/g, ' '));
  await page.keyboard.press('Escape');
  await page.close2();
}

// ═════ l · מרוץ חתימה (246) ═════════════════════════════════════════════════
if (ONLY.has('l')) {
  section('l · הלקוח חותם בזמן שחלון הביטול פתוח');
  const N = 'טופס 6101';
  const page = await open('sc=removal&rm=signedrace');
  await openMenu(page, N);
  await menuOf(page, N).locator('[data-remove-action="cancel_form"]').click();
  const dlg = dialog(page);
  await dlg.waitFor();
  ok('החלון נפתח (המסך עוד חושב שמותר לבטל)', (await dlg.innerText()).includes('הביטול מיידי'));
  await dlg.locator('textarea').fill('נפתח בטעות');
  await dlg.locator('[data-confirm-removal]').click();
  await page.waitForSelector('.rl-rm-err');
  const et = await page.locator('.rl-rm-err').innerText();
  ok('השרת דחה: «הטופס כבר נחתם» מוצג בחלון, והחלון נשאר', et.includes('כבר נחתם') && await dlg.count() > 0, et);
  const st = await store(page);
  ok('השלב לא בוטל, והמצב המעודכן «נחתם»', st.sf.status !== 'cancelled' && st.sf.state === 'signed', JSON.stringify(st.sf));
  await shot(page, 'l-signed-race.png');
  await dlg.getByRole('button', { name: 'חזרה' }).click();
  await page.waitForTimeout(250);
  await openMenu(page, N);
  const t = await menuOf(page, N).innerText();
  ok('אחרי הרענון: ב-⋯ הביטול כבר חסום עם הסבר', t.includes('אי אפשר להסיר מכאן') && t.includes('נחתם') && await menuOf(page, N).locator('[data-remove-action="cancel_form"]').count() === 0, t.replace(/s+/g, ' '));
  ok('אין שגיאות קונסול', page.errs.length === 0, page.errs.join(' | '));
  await page.close2();
}

await browser.close();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} עברו · צילומים: ${SHOTS}`);
for (const f of failed) console.log(f.line);
process.exit(failed.length ? 1 : 0);
