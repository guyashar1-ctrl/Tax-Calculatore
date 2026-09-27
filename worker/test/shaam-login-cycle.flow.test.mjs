// shaam-login-cycle.flow.test.mjs — הזרימה המלאה של ההתחברות לשע״ם, בקוד האמיתי
// של העובד (connectionMonitor, shaamConnect, יישור קו, פרטי תיק, פתיחת מס הכנסה),
// מול שע״ם + Chrome מדומים (fixtures/shaam-sim). בלי דפדפן ובלי חלונות.
//
// הכלל של גיא (27.09.2026):
//   1. login מלא: סיסמה ראשונה ⇒ מיד למסך הסיסמה השנייה ⇒ שם ידני (PIVO לא
//      בוחרת ולא לוחצת) ⇒ אחרי שהרו"ח נכנס — מחובר.
//   2. session קיים: מופיעה רק הסיסמה השנייה ⇒ אוטומטי, והפעולה ממשיכה.
//   3. הסיסמה הראשונה חזרה באמצע ⇒ שוב ידני, עד התחברות מלאה.
//   4. ההגנה מנעילה לא השתנתה: סיסמה שמורה שנדחתה נשלחת פעם אחת בלבד.
//
//   node --test test/shaam-login-cycle.flow.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/shaam-sim/loader.mjs', import.meta.url);

const { world, human, advance, tab } = await import('./fixtures/shaam-sim/world.mjs');
const monitor = await import('../src/connectionMonitor.mjs');
const connect = await import('../src/handlers/shaamConnect.mjs');
const sync = await import('../src/handlers/shaamSyncIncomeTaxFile.mjs');
const openFile = await import('../src/handlers/shaamOpenClientFile.mjs');
const openIncomeTax = await import('../src/handlers/shaamOpenIncomeTax.mjs');
const { shaamLoginCycle, gmfAutoAllowed } = await import('../src/gmfAutoLogin.mjs');
const { NeedsHumanError } = await import('../src/errors.mjs');

const logs = [];
const log = (...a) => logs.push(a.join(' '));
const ctx = () => ({ log, workerId: 'sim', job: { id: 'job', progress: {}, revision: 0 } });
const tick = () => monitor.tickConnectionMonitor('user', 'sim', log);
const fullTick = () => { monitor.invalidateConnectionCache(); return tick(); };
const lastReport = () => world.reports[world.reports.length - 1];
const GMF_LOGIN = '/gmf-main-menu/login';
const gmfGotos = () => world.pivo.gotos.filter((u) => u.includes('/gmf-main-menu')).length;

/** פעולת רו"ח אחרי ms של שעון מדומה. */
function humanAt(ms, fn) {
  let due = null;
  world.humanScript.push(() => {
    due ??= Date.now() + ms;
    if (Date.now() < due) return false;
    fn();
    return true;
  });
}

async function expectNeedsHuman(promise, code) {
  await assert.rejects(promise, (e) => e instanceof NeedsHumanError && e.code === code);
}

test('1 · login מלא: סיסמה ראשונה ⇒ מיד לסיסמה השנייה ⇒ ידני ⇒ מחובר', async () => {
  // הרו"ח לוחץ «שע״ם»: החלון נפתח על האישור הדיגיטלי.
  await expectNeedsHuman(connect.run(ctx()), 'awaiting_shaam_auth');
  assert.equal(world.chrome, 'dialog');
  assert.equal(shaamLoginCycle().state, 'manual');

  await fullTick(); // PIN פתוח ⇒ מנותק
  assert.equal(lastReport().shaam.connected, false);

  // אישור דיגיטלי + PIN + קוד + מספר מעסיק ⇒ דף הבית של הפורטל.
  human.completeFirstPassword();
  const gotosBefore = gmfGotos();
  await advance(2_100);
  await tick(); // ‼ לא fullTick: ההצצה של 2 שניות היא זו שמקדמת, בלי 30 שניות

  assert.equal(tab().path, GMF_LOGIN, 'עברנו מיד למסך הסיסמה השנייה');
  assert.equal(gmfGotos(), gotosBefore + 1);
  assert.equal(tab().pass.focused, true, 'השדה בפוקוס — Chrome מציג את ההצעה לרו"ח');
  assert.equal(world.pivo.picks, 0, 'PIVO לא בחרה את הסיסמה השמורה');
  assert.equal(world.pivo.submits, 0, 'PIVO לא לחצה «כניסה»');
  assert.equal(lastReport().shaam.connected, true);
  assert.equal(lastReport().shaam.bootstrapped, false);

  // המשימה של «שע״ם» מתחדשת; הרו"ח בוחר ולוחץ בעצמו.
  humanAt(1_500, () => human.pickSaved());
  humanAt(3_000, () => human.submit());
  const r = await connect.run(ctx());
  assert.equal(r.result.ready, true);
  assert.equal(gmfGotos(), gotosBefore + 1, 'לא טענו מחדש את מסך הכניסה מתחת לידיים של הרו"ח');
  assert.equal(world.pivo.picks, 0);
  assert.equal(world.pivo.submits, 0, 'גם אחרי שהרו"ח בחר — הוא לחץ «כניסה», לא PIVO');
  assert.equal(world.humanSubmits, 1);

  assert.equal(shaamLoginCycle().state, 'established');
  assert.equal(gmfAutoAllowed(), true);
  await fullTick();
  assert.equal(lastReport().shaam.bootstrapped, true);
});

test('2 · session קיים: רק הסיסמה השנייה ⇒ אוטומטי, ויישור קו ממשיך עד הסוף', async () => {
  // GMF ניתקה לבד (כמו ב-27.09, 2.5 דקות אחרי כניסה) — הפורטל חי.
  world.gmfSession = false;
  tab().go(GMF_LOGIN);
  const picks = world.pivo.picks;
  const submits = world.pivo.submits;
  const humans = world.humanSubmits;

  const r = await sync.run(ctx(), { fileNumber: '123456789' });
  assert.equal(r.result.fields.taxOffice, '26 - רחובות', 'יישור הקו הגיע עד הנתונים');
  assert.equal(world.pivo.picks, picks + 1, 'PIVO בחרה את הסיסמה השמורה');
  assert.equal(world.pivo.submits, submits + 1, 'ולחצה «כניסה» פעם אחת');
  assert.equal(world.humanSubmits, humans, 'בלי הרו"ח');
  assert.equal(shaamLoginCycle().state, 'established');
});

test('2ב · session קיים: פרטי תיק ופתיחת מס הכנסה נכנסים לבד וממשיכים', async () => {
  world.gmfSession = false;
  tab().go(GMF_LOGIN);
  const r1 = await openFile.run(ctx(), { fileNumber: '123456789' });
  assert.equal(r1.result.opened, true);
  assert.equal(r1.result.query, '181');

  world.gmfSession = false;
  tab().go(GMF_LOGIN);
  const r2 = await openIncomeTax.run(ctx());
  assert.equal(r2.result.opened, true);
  assert.ok(r2.result.path.startsWith('/gmf-main-menu'));
  assert.equal(world.humanSubmits, 1, 'עדיין רק הכניסה הידנית של שלב 1');
});

test('3 · הסיסמה הראשונה חזרה באמצע ⇒ ידני שוב, ורק אחרי התחברות מלאה ⇒ אוטומטי', async () => {
  // הפורטל פג בצד השרת; GMF מתנתקת איתו.
  world.portal = false;
  world.gmfSession = false;
  await fullTick();
  assert.equal(shaamLoginCycle().state, 'manual');
  assert.equal(gmfAutoAllowed(), false);

  // הרו"ח לוחץ «שע״ם»: מיד למסך הסיסמה הראשונה (החלון עמד על GMF).
  await expectNeedsHuman(connect.run(ctx()), 'awaiting_shaam_auth');
  assert.ok(tab().path.startsWith('/taxes-login/'), 'הניווט הביא למסך הסיסמה הראשונה');
  assert.equal(world.chrome, 'dialog');

  human.completeFirstPassword();
  await advance(2_100);
  await tick();
  assert.equal(tab().path, GMF_LOGIN, 'שוב — מיד לסיסמה השנייה');
  const picks = world.pivo.picks;
  const submits = world.pivo.submits;

  // יישור קו שנלחץ עכשיו נוחת על הסיסמה השנייה — וממתין לרו"ח, בלי לבחור.
  humanAt(2_000, () => human.pickSaved());
  humanAt(4_000, () => human.submit());
  const r = await sync.run(ctx(), { fileNumber: '123456789' });
  assert.equal(r.result.fields.taxOffice, '26 - רחובות', 'אחרי שהרו"ח נכנס — יישור הקו הושלם');
  assert.equal(world.pivo.picks, picks, 'במחזור חדש PIVO לא בחרה סיסמה');
  assert.equal(world.pivo.submits, submits, 'ולא לחצה «כניסה»');
  assert.equal(shaamLoginCycle().state, 'established', 'ההתחברות המלאה הושלמה');

  // ומכאן — שוב אוטומטי.
  world.gmfSession = false;
  tab().go(GMF_LOGIN);
  await sync.run(ctx(), { fileNumber: '123456789' });
  assert.equal(world.pivo.picks, picks + 1);
  assert.equal(world.pivo.submits, submits + 1);
});

test('4 · סיסמה שמורה שנדחתה ⇒ ניסיון אחד בלבד, גם בפעולה הבאה', async () => {
  world.savedPasswordAccepted = false;
  world.gmfSession = false;
  tab().go(GMF_LOGIN);
  const picks = world.pivo.picks;
  const submits = world.pivo.submits;

  await expectNeedsHuman(sync.run(ctx(), { fileNumber: '123456789' }), 'shaam_gmf_login_required');
  assert.equal(world.pivo.submits, submits + 1);

  // פעולה נוספת: לא שולחים שוב; ממתינים לרו"ח (שלא מגיע) ועוצרים.
  await expectNeedsHuman(sync.run(ctx(), { fileNumber: '123456789' }), 'shaam_gmf_login_required');
  assert.equal(world.pivo.submits, submits + 1, '«כניסה» עם הסיסמה השמורה נשלחה פעם אחת בלבד');
  assert.equal(world.pivo.picks, picks + 1);
  world.savedPasswordAccepted = true;
});

test('היומן מספר את הסיפור', () => {
  const text = logs.join('\n');
  assert.match(text, /שע״ם ביקשה את הסיסמה הראשונה|מחזור התחברות חדש/);
  assert.match(text, /מסך הסיסמה השנייה מוכן לרו"ח/);
  assert.match(text, /התחברות מלאה לשע״ם הושלמה/);
});
