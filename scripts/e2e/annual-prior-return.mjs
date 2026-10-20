#!/usr/bin/env node
/**
 * annual-prior-return.mjs — «הדוח של שנה שעברה כנקודת פתיחה» (19.10.2026), בדפדפן מול staging, במחשב ובטלפון.
 *
 *   לקוח אלמן מ-2025 עם הסט שהוגש ל-2024 במסמכים → «＋ בקשה חדשה» ← «דוח שנתי 2025» → הבקשה נפתחת בלי שאלון,
 *   ובה «לפני השליחה» → «קרא את הדוח» → שורות לבדיקה (מבטלים חשבון, מתקנים שם) → «פרסם» ⇒ מה שסומן נכנס לכרטיס
 *   (מעסיקים, חשבון, ביטוח חיים — עם המקור), והשאלון בדף: אריחים מסומנים מראש «ב-2024: …», ואריח הפטירה פותח ישר
 *   את הענף (בלי «מה קרה?»). בלי מייל.
 *
 *   STAGING_ENV_DIR=<תיקייה עם .env.staging ו-.env.local> node scripts/e2e/annual-prior-return.mjs --base=http://localhost:5351 [--widths=1280,390,360] [--shots=<dir>]
 *
 * ‼ ב-staging אין את קורא המסמכים (אין מפתח AI) — התשובה של ocr-document מוחלפת כאן בקריאה בצורה של קריאה אמיתית
 *   (נבדקה בייצור על שני סטים, 19.10), עם שמות דוגמה. מה שנבדק כאן הוא המסך, הכרטיס והשאלון — לא דיוק הקריאה.
 * ‼ כל פנייה לייצור נחסמת ומכשילה. בסוף — ניקוי וסריקת שאריות.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { prepare } from './staging-session.mjs';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d);
const BASE = arg('base', 'http://localhost:5351');
const WIDTHS = arg('widths', '1280,390,360').split(',').map(Number);
const SHOTS = arg('shots', '');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const { chromium } = createRequire(process.env.PW_CORE ?? 'C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json')('playwright-core');
const PROD = 'uoweoqtuiettozagwgdw', STAGING = 'evdfxjqrkgugssfrdoxd';
const YEAR = 2025;

let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(info).slice(0, 400)}` : ''}`); };
const text = async (loc) => ((await loc.count().catch(() => 0)) ? loc.first().innerText({ timeout: 5000 }).catch(() => '') : '');

/** בצורה של הקריאה האמיתית של סט 2024 (שמות דוגמה): הצדדים, השמות והישויות כמו שחזרו. */
const READING = {
  taxYear: 2024, registered: { firstName: 'דוד', lastName: 'בדיקה' }, spouse: { firstName: 'רחל שרה', lastName: 'בדיקה' }, familyStatus: 'married',
  children: [], businesses: [], pensionDeposits: [], niBenefits: [],
  employers: [{ name: 'משרד החינוך - מורים', side: 'spouse', evidence: 'טופס 106 עמוד 7' }, { name: 'חברת הייטק בע"מ', side: 'registered', evidence: 'טופס 106 עמוד 10' }],
  pensions: [{ payer: 'מינהלת הגמלאות', side: 'spouse', survivors: false, evidence: 'אישור קצבה עמוד 9' }],
  disability: [{ side: 'spouse', percent: 100, evidence: 'מכתב פקיד שומה עמוד 14' }],
  accounts: [{ institution: 'בנק יהב לעובדי המדינה בע"מ', side: 'joint', evidence: 'טופס 867 עמוד 11' }, { institution: 'בנק לאומי', side: 'joint', evidence: 'טופס 867 עמוד 12' }],
  lifeInsurance: [{ insurer: 'איילון חברה לביטוח בע"מ', side: 'registered', evidence: 'אישור ביטוח עמוד 13' }],
  rental: false, foreign: false, capitalGains: true, donations: false,
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });

async function runWidth(width) {
  console.log(`\n▶ הדוח הקודם כנקודת פתיחה — ${width}px`);
  const env = await prepare();
  const blocked = [], consoleErrors = [];
  let ocrCalls = 0;
  const id = env.clientId;
  try {
    // ── הלקוח: אלמן מ-2025, כרטיס ריק, והסט של 2024 במסמכים ──
    await env.sql(`update public.clients set family_status = 'widowed', widowhood_year = ${YEAR}, spouse_first_name = null,
      employers = '[]'::jsonb, properties = '[]'::jsonb, investment_accounts = '[]'::jsonb, has_life_insurance = false where id = '${id}'`);
    const [lab] = await env.sql(`select id from public.document_labels where user_id = (select user_id from public.clients where id = '${id}') limit 1`);
    await env.sql(`insert into public.documents (user_id, client_id, storage_path, file_name, file_type, file_size, category, year, label_id)
      select user_id, id, 'qa/prior-return-none.pdf', 'סט שהוגש למס הכנסה 2024.pdf', 'application/pdf', 1048576, 'form_1301', '2024', '${lab.id}' from public.clients where id = '${id}'`);

    const mobile = width < 700;
    const ctx = await browser.newContext({ viewport: { width, height: mobile ? 800 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'he-IL' });
    await env.initContext(ctx);
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.includes(PROD)) { blocked.push(u); return route.abort(); }
      if (u.includes('/functions/v1/ocr-document')) {
        ocrCalls++;
        const body = JSON.parse(route.request().postData() ?? '{}');
        const okBody = body.docType === 'prior_return' && typeof body.documentId === 'string' && !body.base64;
        return route.fulfill({ status: okBody ? 200 : 400, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify(okBody ? { success: true, reading: READING, summary: 'הדוח נקרא' } : { success: false, error: 'bad_request_shape' }) });
      }
      if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
      const host = new URL(u).hostname;
      if (host === 'localhost' || host === '127.0.0.1' || u.startsWith('data:') || u.startsWith('blob:') || host.includes(STAGING)) return route.continue();
      blocked.push(u); return route.abort();
    });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error' && !/favicon|ResizeObserver|Failed to load resource/.test(m.text())) consoleErrors.push(m.text().slice(0, 240)); });
    page.on('pageerror', e => consoleErrors.push(`pageerror: ${String(e).slice(0, 240)}`));
    const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const shot = async (name, loc) => { if (SHOTS) await (loc ? loc.screenshot({ path: join(SHOTS, `${name}-${width}.png`) }) : page.screenshot({ path: join(SHOTS, `${name}-${width}.png`) })).catch(() => {}); };

    // 1 · «＋ בקשה חדשה» ← «דוח שנתי 2025»
    await page.goto(env.officeUrl(id, 'journey'), { waitUntil: 'domcontentloaded' });
    const addBtn = page.getByRole('button', { name: /＋ בקשה חדשה/ }).first();
    await addBtn.waitFor({ timeout: 40000 });
    await addBtn.click();
    const one = page.locator('[data-annual-one-click]');
    await one.waitFor({ timeout: 15000 });
    ok((await text(one)).includes(`דוח שנתי ${YEAR}`) && (await text(one)).includes('קודם מבט שלך'), 'הכפתור «דוח שנתי 2025» אומר שכשיש דוח קודם — קודם מבט שלך', await text(one));

    // 1א · 263 «לקוח אחד = שאלון אחד פתוח»: ל-prepare() יש שאלון קליטה ישן שפורסם ⇒ הבקשה לא נפתחת, ההודעה והקישור לשורה שלו
    await one.click();
    const qOpen = page.locator('[data-questionnaire-open]');
    await qOpen.waitFor({ timeout: 20000 });
    const qText = await text(qOpen);
    ok(qText.includes('יש לדוד שאלון פתוח: «עדכון סטטוס מס» — קודם מסיימים אותו'), 'שאלון ישן פתוח ⇒ «יש לדוד שאלון פתוח: «עדכון סטטוס מס» — קודם מסיימים אותו»', qText);
    const annualRows = (await env.sql(`select count(*)::int n from public.onboarding_steps where client_id = '${id}' and step_type in ('annual_return','info_collection')`))[0].n;
    ok(annualRows === 0, 'שום בקשה לא נוצרה (אין דוח שנתי ריק)', `rows=${annualRows}`);
    ok(await noHScroll(), 'בלי גלילה הצידה — הודעת השאלון הפתוח');
    await shot('00-questionnaire-open', qOpen);
    await qOpen.locator('[data-questionnaire-open-go]').click();
    ok(!(await page.locator('[data-annual-one-click]').count()), '«לבקשה ←» סוגר את החלון ומוביל לשורה ב«בקשות»');
    // הלקוח סיים את השאלון הישן ⇒ אפשר לפתוח את הדוח
    await env.sql(`update public.onboarding_steps set status = 'completed', completed_at = now() where client_id = '${id}' and step_type = 'intake_questionnaire'`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await addBtn.waitFor({ timeout: 40000 });
    await addBtn.click();
    await one.waitFor({ timeout: 15000 });
    await one.click();
    const prep = page.locator('[data-prior-prep]');
    await prep.waitFor({ timeout: 40000 });
    const asks0 = (await env.sql(`select count(*)::int n from public.tax_info_asks where client_id = '${id}'`))[0].n;
    ok(asks0 === 0, 'יש דוח קודם ⇒ הבקשה נפתחה, ושום שאלה עוד לא יצאה ללקוח', `asks=${asks0}`);
    await page.waitForFunction(() => document.querySelector('[data-prior-prep]')?.textContent?.includes('סט שהוגש למס הכנסה 2024.pdf'), null, { timeout: 20000 }).catch(() => {});
    ok((await text(prep)).includes('סט שהוגש למס הכנסה 2024.pdf'), '«לפני השליחה» מצא במסמכים את הסט של 2024', await text(prep));
    ok(await noHScroll(), 'בלי גלילה הצידה — «לפני השליחה»');
    await shot('01-prep-found', prep);

    // 2 · קריאה ← שורות
    await prep.locator('[data-prior-read]').first().click();
    await prep.locator('[data-prior-row]').first().waitFor({ timeout: 20000 });
    const kinds = await prep.locator('[data-prior-row]').evaluateAll(els => els.map(e => e.getAttribute('data-prior-row')));
    ok(ocrCalls === 1, 'הקריאה נשלחה פעם אחת, לפי מזהה המסמך (בלי הקובץ דרך הדפדפן)', `calls=${ocrCalls}`);
    ok(['employer', 'employer', 'account', 'account', 'lifeInsurance', 'pension', 'disability'].every(k => kinds.filter(x => x === k).length >= ['employer', 'employer', 'account', 'account', 'lifeInsurance', 'pension', 'disability'].filter(x => x === k).length),
      'השורות: שני מעסיקים, שני חשבונות, ביטוח חיים, קצבה, פטור נכות', kinds.join(','));
    const pText = await text(prep);
    ok(pText.includes('ייכנס לכרטיס') && pText.includes('מסומן מראש'), 'כל שורה אומרת מה יקרה — «ייכנס לכרטיס» או «מסומן מראש» בשאלון', pText.slice(0, 300));
    ok(await noHScroll(), 'בלי גלילה הצידה — שורות הקריאה');
    await shot('02-prep-rows', prep);

    // 3 · המשרד מתקן: מבטל את לאומי, מתקן את שם המעסיק של בת הזוג
    const leumi = prep.locator('[data-prior-row="account"]', { has: page.locator('input[value="בנק לאומי"]') }).first();
    await leumi.locator('input[type="checkbox"]').uncheck();
    // ‼ אחרי התיקון השם בתיבה משתנה — השורה נתפסת לפי מיקום, לא לפי הערך
    const empIdx = await prep.locator('[data-prior-row]').evaluateAll(els => els.findIndex(e => e.querySelector('input.as-prep-name')?.value === 'משרד החינוך - מורים'));
    const spouseEmp = prep.locator('[data-prior-row]').nth(empIdx);
    await spouseEmp.locator('.as-prep-name').fill('משרד החינוך');
    ok(await spouseEmp.locator('select').inputValue() === 'spouse', '«של מי» של מעסיק בת הזוג — בת הזוג (ניתן לשינוי)', await spouseEmp.locator('select').inputValue());
    await prep.locator('[data-prior-publish]').click();
    await page.waitForFunction(() => /פורסם בדף/.test(document.querySelector('.ty-ok')?.textContent ?? ''), null, { timeout: 30000 }).catch(() => {});
    const flash = await text(page.locator('.ty-ok'));
    ok(/פורסם בדף/.test(flash) && /בלי מייל/.test(flash), 'פורסם בדף — בלי מייל', flash);

    // 4 · הכרטיס והשאלון במסד
    const [c] = await env.sql(`select employers, investment_accounts, has_life_insurance from public.clients where id = '${id}'`);
    const emps = (c.employers ?? []).map(e => `${e.name}${e.belongsToSpouse ? '·בז' : ''}`).sort().join(' | ');
    ok(emps === 'חברת הייטק בע"מ | משרד החינוך·בז', 'בכרטיס: שני המעסיקים, בשם המתוקן ובצד הנכון', emps);
    ok((c.investment_accounts ?? []).map(a => a.institutionName).join(',') === 'בנק יהב לעובדי המדינה בע"מ', 'בכרטיס: רק החשבון שנשאר מסומן', JSON.stringify(c.investment_accounts));
    ok(c.has_life_insurance === true, 'בכרטיס: ביטוח חיים');
    const changes = await env.sql(`select field_key, status, source, note from public.tax_fact_changes where client_id = '${id}' order by field_key`);
    ok(changes.length === 3 && changes.every(x => x.source === 'import' && /מהדוח שהוגש ל-2024/.test(x.note ?? '')), 'כל שינוי בכרטיס נשמר בהיסטוריה עם המקור («מהדוח שהוגש ל-2024»)', JSON.stringify(changes));
    const asks = await env.sql(`select item_key, state, prompt from public.tax_info_asks where client_id = '${id}' and state <> 'cancelled'`);
    const grid = asks.find(a => a.item_key === 'annual.whatHappened');
    const opts = grid?.prompt?.input?.options ?? [];
    const o = (k) => opts.find(x => x.key === k);
    ok(asks.length > 0 && asks.every(a => a.state === 'published'), `השאלון פורסם (${asks.length} שאלות)`, asks.map(a => `${a.item_key}:${a.state}`).join(','));
    ok(!!o('pension.received')?.preset && /^ב-2024: מינהלת הגמלאות/.test(o('pension.received')?.note ?? ''), 'אריח «קצבה» מסומן מראש — «ב-2024: מינהלת הגמלאות · רחל»', JSON.stringify(o('pension.received')));
    ok(!!o('special.disability')?.preset, 'אריח «נכות» מסומן מראש (פטור הנכות של בת הזוג)', JSON.stringify(o('special.disability')));
    const fam = o('household.familyChange');
    ok(!!fam?.preset && fam.label === 'רחל נפטר/ה' && (fam.followUps ?? []).map(f => f.itemKey)[0] === 'family.death', 'אריח הפטירה: מסומן, בשם מהדוח, ופותח ישר את הענף', JSON.stringify(fam).slice(0, 300));
    ok(!asks.some(a => a.item_key === 'household.familyEvent'), 'בלי «מה קרה?» — האירוע ידוע מהתיק');
    // ‼ חשבון מהדוח הקודם — קודם «היה פתוח ב-2025?» (period.account), ואחריו ה-867; מעסיק — ה-106 מיד, לכל אחד
    ok(asks.filter(a => a.item_key === 'salary.form106').length === 2 && asks.some(a => a.item_key === 'period.account'), 'מה שנכנס לכרטיס כבר נשאל: 106 לכל מעסיק, והחשבון — «עדיין היה פתוח?»', asks.map(a => a.item_key).join(','));
    ok((await env.emailsFor?.() ?? (await env.sql(`select count(*)::int n from public.email_messages where client_id = '${id}'`))[0].n) === 0, 'לא יצא מייל ללקוח');

    // 5 · הדף של הלקוח
    const pp = await ctx.newPage();
    pp.on('pageerror', e => consoleErrors.push(`portal pageerror: ${String(e).slice(0, 240)}`));
    await pp.goto(env.portalUrl(), { waitUntil: 'domcontentloaded' });
    await pp.waitForFunction(() => document.body.innerText.includes(`הדוח השנתי 2025`), null, { timeout: 30000 });
    const card = pp.locator('.pp-item', { has: pp.getByText('הדוח השנתי 2025', { exact: true }) }).first();
    await card.getByRole('button', { name: /^(להשלמת המידע|להעלאת המסמכים)$/ }).click();
    const flow = pp.locator('.ty-flow');
    await flow.waitFor({ timeout: 15000 });
    for (let i = 0; i < 8 && !(await flow.locator('.ty-tile').count()); i++) {
      const confirm = flow.getByRole('button', { name: 'כן, הכול נכון' });
      if (await confirm.count()) { const t = await text(flow.locator('.ty-q')); await confirm.click(); await pp.waitForFunction((x) => (document.querySelector('.ty-flow .ty-q')?.textContent ?? '') !== x, t, { timeout: 20000 }).catch(() => {}); continue; }
      break;
    }
    const pressed = async (k) => (await flow.locator(`.ty-tile[data-tile="${k}"]`).getAttribute('aria-pressed').catch(() => null)) === 'true';
    ok(await pressed('pension.received') && await pressed('special.disability') && await pressed('household.familyChange'), 'בדף: האריחים מהדוח הקודם ואריח הפטירה כבר מסומנים');
    ok((await text(flow.locator('.ty-tile[data-tile="pension.received"] .ty-tile-note'))).startsWith('ב-2024:'), 'בדף: מתחת לאריח — «ב-2024: …»', await text(flow.locator('.ty-tile[data-tile="pension.received"]')));
    ok(!(await pressed('donations.given')), 'בדף: אריח שלא היה בדוח הקודם — לא מסומן');
    ok(await pp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'בדף: בלי גלילה הצידה — מסך הרשת');
    await (SHOTS ? flow.screenshot({ path: join(SHOTS, `03-portal-grid-${width}.png`) }) : Promise.resolve()).catch(() => {});
    const gridTitle = await text(flow.locator('.ty-q'));
    await flow.getByRole('button', { name: /^(הבא|שליחה למשרד)$/ }).click();
    await pp.waitForFunction((x) => (document.querySelector('.ty-flow .ty-q')?.textContent ?? '') !== x, gridTitle, { timeout: 20000 }).catch(() => {});
    const next = await text(flow.locator('.ty-q'));
    const hint = await text(flow);
    ok(/נפטר/.test(next) && hint.includes('משתתפים בצערך'), 'אחרי הרשת — ישר שאלת הפטירה, עם משפט ההשתתפות (בלי «מה קרה?»)', next);
    await (SHOTS ? flow.screenshot({ path: join(SHOTS, `04-portal-death-${width}.png`) }) : Promise.resolve()).catch(() => {});
    await ctx.close();
  } catch (e) {
    ok(false, 'המסלול נעצר', String(e?.message ?? e).split('\n').slice(0, 3).join(' '));
  } finally {
    ok(blocked.length === 0, 'אין פנייה לייצור או למארח זר', blocked.slice(0, 3).join(' '));
    ok(consoleErrors.length === 0, 'בלי שגיאות בדפדפן', consoleErrors.slice(0, 3).join(' | '));
    const left = await env.cleanup().catch(e => ({ left: -1, err: String(e) }));
    ok(left.left === 0, 'ניקוי: לא נשארו שורות של לקוחות הבדיקה', JSON.stringify(left));
  }
}

for (const w of WIDTHS) await runWidth(w);
await browser.close();
console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
