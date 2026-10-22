// shaam-sync-154.flow.test.mjs — יישור הקו של מס הכנסה בקוד האמיתי של העובד,
// מול GMF מדומה (fixtures/shaam-sim): 154 קודם, 134 רק כשיש מקדמות פעילות,
// דפדוף אחורה עד עמוד בלי שנים, ונפילה ל-134 כש-154 לא נפתחת.
//   node --test test/shaam-sync-154.flow.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/shaam-sim/loader.mjs', import.meta.url);

const { world, tab, resetWorld, SimPage } = await import('./fixtures/shaam-sim/world.mjs');
const sync = await import('../src/handlers/shaamSyncIncomeTaxFile.mjs');
const { sample154 } = await import('./fixtures/gmf154-sample.mjs');
const { tik134 } = await import('./fixtures/gmf134-sample.mjs');

const logs = [];
const ctx = () => ({ log: (...a) => logs.push(a.join(' ')), workerId: 'sim', job: { id: 'job', progress: {}, revision: 0 } });
const FILE = '123456789';

/** מחובר, הלשונית על תפריט GMF; רושם כל שאילתה שהוגשה מהכותרת. */
function connected(gmf154) {
  resetWorld();
  Object.assign(world, { chrome: 'open', portal: true, gmfSession: true, gmf154 });
  world.pages.push(new SimPage('/gmf-main-menu/main/home'));
  const queries = [];
  const page = tab();
  const fill = page.fill.bind(page);
  page.fill = async (sel, v) => { if (sel === '#mavarShilta' && v) queries.push(v); return fill(sel, v); };
  return queries;
}

test('אין מקדמות פעילות ⇒ 154 בלבד, בלי 134', async () => {
  const queries = connected(sample154({ sugDrisha: 'לא נדרש' }));
  const r = await sync.run(ctx(), { fileNumber: FILE });
  assert.equal(r.result.query, '154');
  assert.deepEqual(queries, ['154']);
  assert.equal(r.result.fields.taxOffice, '26 - רחובות');
  assert.equal(r.result.fields.advanceStatus, 'no_advance');
  assert.equal(r.result.fields.balance, '1000');
  assert.equal(r.result.fields.wealthDemandDue, '2026-12-31');
  assert.equal(r.result.fields.representedByMe, 'yes', 'המשתמש בכותרת GMF = המייצג הראשי');
});

test('דפדוף אחורה עד עמוד שכולו «שנה לא קיימת» — ולא מעבר', async () => {
  connected(sample154());
  const r = await sync.run(ctx(), { fileNumber: FILE });
  assert.equal(world.pivo.pages154, 2, 'עמוד 2 ועמוד 3; עמוד 3 ריק ⇒ עוצרים');
  assert.equal(r.result.filing.pagesRead, 3);
  assert.equal(r.result.filing.complete, true);
  const open = r.result.filing.years.filter((y) => y.required === 'required' && !y.filedOn).map((y) => y.year);
  assert.deepEqual(open, [2023, 2019]);
});

test('מקדמות פעילות ⇒ 154 ואז 134; ראש התיק מ-154', async () => {
  const queries = connected(sample154({ sugDrisha: 'שעור דו' }));
  const r = await sync.run(ctx(), { fileNumber: FILE });
  assert.equal(r.result.query, '154+134');
  assert.deepEqual(queries, ['154', '134']);
  assert.equal(r.result.fields.taxOffice, '26 - רחובות');
  assert.equal(r.result.fields.balance, '1000', 'היתרה מ-154, לא «יתרה» של 134');
  assert.ok(r.result.filing);
});

test('154 לא נפתחת ⇒ 134 כמו קודם, ו«השנים לא נקראו» מדווח', async () => {
  const queries = connected(null);
  const r = await sync.run(ctx(), { fileNumber: FILE });
  assert.equal(r.result.query, '134');
  assert.deepEqual(queries, ['154', '134']);
  assert.equal(r.result.fields.taxOffice, '26 - רחובות');
  assert.equal(r.result.filing, undefined);
  assert.ok(r.result.unavailable.some((u) => u.key === 'taxYears'));
});

test('הפורטל פג והתפריט עוד על המסך ⇒ «החיבור אינו מוכן», לא «מסך לא נמצא»', async () => {
  const queries = connected(sample154());
  Object.assign(world, { gmfApiExpired: true, portal: false });
  await assert.rejects(sync.run(ctx(), { fileNumber: FILE }), (e) => e.code === 'shaam_connection_not_ready');
  assert.deepEqual(queries, ['154'], 'לא ממשיכים ל-134 על סשן שפג');
});

test('תיק אחר במסך של 154 ⇒ נעצר, לא נופל ל-134', async () => {
  const queries = connected(sample154({ fileNumber: '987654321' }));
  await assert.rejects(sync.run(ctx(), { fileNumber: FILE }), (e) => e.code === 'file_mismatch');
  assert.deepEqual(queries, ['154']);
});

test('מקדמות פעילות ⇒ «מצב דיווחים» מ-134: המונה של שע״ם והתקופות', async () => {
  connected(sample154({ sugDrisha: 'שעור דו' }));
  world.gmf134 = tik134({ missing: { 202607: 'לא דווח' } });
  const r = await sync.run(ctx(), { fileNumber: FILE });
  assert.equal(r.result.fields.reportingStatus, 'חסר דיווח: 07-08/2026');
  assert.equal(r.result.advancePeriods.length, 6);
  connected(sample154({ sugDrisha: 'שעור דו' }));
  world.gmf134 = tik134();
  assert.equal((await sync.run(ctx(), { fileNumber: FILE })).result.fields.reportingStatus, 'אין דיווחים חסרים');
});
