// ─── «בקשות בתהליך» — הכללים שנלמדו מהמערכת החיה (28.09.2026) ──────────────
// הנתונים: shaam-requests-grid-2026-09-28.json — ה-dataSource האמיתי של הטבלה,
// אחרי החלפת שמות/ת.ז./מספרי בקשה בערכים בדויים. הקודים, התאריכים והמבנה אמיתיים.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  filterEchoMatches, gridItemsToRows, classifyRequestGroup, requestGroupsOf, currentRequestRows,
  createPreflightDecision, attributeRows, rowSystemStateCode,
} from '../src/shaamRepresentationSession.mjs';
import { reportedRows, allRowsAccepted } from '../src/handlers/shaamCheckRepresentation.mjs';

const GRID = JSON.parse(readFileSync(new URL('./fixtures/shaam-requests-grid-2026-09-28.json', import.meta.url), 'utf8'));
const ROWS = gridItemsToRows(GRID.rows);
const of = (entity) => ROWS.filter((r) => r.detail.entityId === entity);
// הדמויות (בדויות) לפי מה שהיה בשורות האמיתיות:
const SUSPENDED = '500000013'; // מ"ה+מע"מ+ניכויים בהשהייה עד 06/10/2026 (ניכויים בלי תיק)
const SETTLED = '500011127';   // מ"ה+מע"מ נקלטו, ניכויים ממתין לפתיחת תיק שלא קיים
const APPROVAL = '500033345';  // מ"ה 7 «ממתין:91-לאישור לקוח…», צפי = «ממתין לאישור לקוח»
const TWO_REQS = '500055561';  // בקשה אחת נקלטה, בקשת ניכויים נפרדת נדחתה ובוטלה
const JOINT = '500088893';     // מ"ה על תיק בן/בת הזוג (misTik אחר), מע"מ על עצמו

test('טבלה · הקודים והמבנה נשמרו (23 שורות, 8 בעמוד)', () => {
  assert.equal(GRID.rows.length, 23);
  assert.equal(GRID.pageSize, 8);
  for (const f of ['asmachta', 'misMuzag', 'statusBakashaKod', 'statusTikKod', 'kodMaarach', 'isBehamtana', 'bitulKod', 'dateTzefiSyumHashaya']) {
    assert.ok(f in GRID.rows[0], f);
  }
});

test('סינון · «סינון לפי» חייב להיות בדיוק מה שביקשנו — צירוף עם שדה שנשאר נדחה', () => {
  assert.equal(filterEchoMatches('סינון לפי : מספר ישות', 'מספר ישות'), true);
  assert.equal(filterEchoMatches('סינון לפי : מספר בקשה', 'מספר בקשה'), true);
  // ‼ נצפה חי: השדה «ישות מיוצג» נשאר מהחיפוש הקודם ⇒ סינון כפול ⇒ «לא נמצאו» שקרי.
  assert.equal(filterEchoMatches('סינון לפי : מספר ישות + מספר בקשה', 'מספר בקשה'), false);
  assert.equal(filterEchoMatches(null, 'מספר ישות'), false);
  assert.equal(filterEchoMatches('', 'מספר ישות'), false);
});

test('שורות · מספר בקשה, ת.ז. (9 ספרות), קודים, «אין תיק» וסיבת ביטול — מהנתונים, לא מהטקסט', () => {
  const r = of(SUSPENDED).find((x) => x.codes.system === 5);
  assert.equal(r.detail.requestNumber, '2026900000');
  assert.equal(r.detail.entityId, SUSPENDED);
  assert.deepEqual([r.codes.requestState, r.codes.systemState], [2, 2]);
  assert.equal(r.noFile, true, 'ניכויים בלי תיק (isBehamtana=1, 000000000)');
  assert.equal(r.detail.suspensionEnds, '06/10/2026');
  assert.equal(r.date, '23/09/2026');
  const cancelled = of(TWO_REQS).find((x) => x.codes.systemState === 6);
  assert.equal(cancelled.cancelReason, 'אי טעינת מסמכים במועד');
});

test('מצב בקשה · settled = כל מה שיש לו תיק נקלט והשאר ממתינים לתיק שלא קיים (הכרעת גיא)', () => {
  assert.equal(classifyRequestGroup(of(SETTLED)), 'settled');
  assert.equal(classifyRequestGroup(of(SUSPENDED)), 'live');
  assert.equal(classifyRequestGroup(of(APPROVAL)), 'live');
  // «ממתין לפתיחת התיק» כשיש תיק (לא noFile) — אינו settled.
  const withFile = of(SETTLED).map((r) => (r.codes.system === 5 ? { ...r, noFile: false } : r));
  assert.equal(classifyRequestGroup(withFile), 'live');
});

test('כמה בקשות לאותו אדם · בוחרים בקשה אחת, ולא מערבבים שורות של שתיים', () => {
  const groups = requestGroupsOf(of(TWO_REQS));
  assert.equal(groups.size, 2);
  const cur = currentRequestRows(of(TWO_REQS));
  assert.equal(cur.ok, true);
  assert.equal(cur.requestNumber, '2026900035', 'הבקשה שנקלטה, לא זו שבוטלה');
  assert.deepEqual(cur.others, ['2026900042']);
  // מספר שמור ⇒ רק השורות שלו.
  const pinned = currentRequestRows(of(TWO_REQS), { requestNumber: '2026900042' });
  assert.equal(pinned.rows.length, 1);
  // שתי בקשות חיות ⇒ לא בוחרים.
  const twoLive = [...of(SUSPENDED), ...of(SUSPENDED).map((r) => ({ ...r, detail: { ...r.detail, requestNumber: '2026999999' } }))];
  assert.equal(currentRequestRows(twoLive).reason, 'ambiguous_request');
});

test('לפני יצירה · «לא נמצאו רשומות» (עם סינון מאומת) ⇒ none; בקשה חיה/נקלטה ⇒ existing; רק בוטלו ⇒ none', () => {
  // עידן רוקח (אמיתי): אין לו שורה — המסך הציג «לא נמצאו רשומות מתאימות».
  assert.deepEqual(createPreflightDecision({ ok: true, rows: [], total: 0, listed: { count: 0, noRecords: true, filter: 'סינון לפי : מספר ישות' } }).decision, 'none');
  const ex = createPreflightDecision({ ok: true, rows: of(APPROVAL), total: 1 });
  assert.deepEqual([ex.decision, ex.requestNumber], ['existing', '2026900021']);
  assert.equal(createPreflightDecision({ ok: true, rows: of(SETTLED), total: 3 }).decision, 'existing', 'כבר מיוצג — לא יוצרים');
  const onlyCancelled = of(TWO_REQS).filter((r) => r.codes.systemState === 6);
  const pre = createPreflightDecision({ ok: true, rows: onlyCancelled, total: 1 });
  assert.deepEqual([pre.decision, pre.priorTerminal], ['none', ['2026900042']]);
  // ‼ «לא נקרא» נשאר «לא ידוע» — לא «אין».
  assert.equal(createPreflightDecision({ ok: false, reason: 'search_filter_mismatch' }).decision, 'unreadable');
  assert.equal(createPreflightDecision({ ok: true, rows: [], total: 0, listed: { count: null, noRecords: false } }).decision, 'unreadable');
});

test('שיוך · ת.ז. מדויקת בכל שורה מספיקה (גם בלי שם); ת.ז. אחרת ⇒ identity_mismatch', () => {
  const a = attributeRows(of(APPROVAL), { entityId: APPROVAL, searchedBy: 'entityId' });
  assert.equal(a.ok, true);
  assert.equal(a.rows.length, 1);
  // אפס מוביל — אותה ישות.
  assert.equal(attributeRows(of(APPROVAL), { entityId: '0' + APPROVAL, searchedBy: 'entityId' }).ok, true);
  const bad = attributeRows(of(APPROVAL), { entityId: SETTLED, searchedBy: 'entityId' });
  assert.equal(bad.reason, 'identity_mismatch');
  // שם בסדר אחר בשע״ם אינו מפיל שיוך לפי ת.ז.
  assert.equal(attributeRows(of(APPROVAL), { entityId: APPROVAL, searchedBy: 'entityId', expectedClientName: 'שם אחר לגמרי' }).rows.length, 1);
});

test('דיווח · השורה ל-PIVO נושאת קודים, ת.ז., «אין תיק» וסיבת ביטול', () => {
  const rep = reportedRows(of(SUSPENDED));
  const w = rep.find((r) => r.systemCode === 5);
  assert.deepEqual([w.requestStateCode, w.systemStateCode, w.entityId, w.noFile, w.requestNumber], [2, 2, SUSPENDED, true, '2026900000']);
  const c = reportedRows(of(TWO_REQS)).find((r) => r.systemStateCode === 6);
  assert.equal(c.cancelReason, 'אי טעינת מסמכים במועד');
  // allAccepted לפי קוד: 5 בכל השורות.
  assert.equal(allRowsAccepted(reportedRows(of(TWO_REQS).filter((r) => r.codes.systemState === 5))), true);
  assert.equal(allRowsAccepted(reportedRows(of(SETTLED))), false, 'ניכויים בלי תיק אינו «נקלט»');
});

test('תיק משותף · מ"ה על תיק בן/בת הזוג — הישות (המיוצג) היא עדיין האדם שהוזן', () => {
  const rows = of(JOINT);
  const it = rows.find((r) => r.codes.system === 1);
  assert.notEqual(it.fileNumber, JOINT, 'התיק אינו ת.ז. המיוצג');
  assert.ok(rows.every((r) => r.detail.entityId === JOINT));
});

test('קוד 7 · «ממתין:91-לאישור לקוח,כל השאר-לפתיחת התיק» הוא קוד אחד — ההבחנה מהפירוט, לא מהטקסט', () => {
  const r = of(APPROVAL)[0];
  assert.equal(r.codes.systemState, 7);
  assert.equal(rowSystemStateCode(r), 7);
  assert.equal(r.detail.suspensionEnds, 'ממתין לאישור לקוח');
});

// ── מול קוד המסך של שע״ם עצמה (צילום 28.09.2026) ─────────────────────────────
const SRC = (f) => readFileSync(new URL(`./fixtures/shaam-src-2026-09-28/${f}`, import.meta.url), 'utf8');

test('קוד שע״ם · «סינון לפי» נבנה מכל שדה מלא — לכן שדה שנשאר מהחיפוש הקודם הוא סינון נוסף', () => {
  const c = SRC('process-controller.js');
  assert.ok(c.includes('s.sinunBy+=s.misYeshut!=""?" מספר ישות + ":""'));
  assert.ok(c.includes('s.sinunBy+=s.asmachta!=""?" מספר בקשה + ":""'));
  // «ניקוי» מאפס את שני השדות.
  assert.ok(/s\.misYeshut="";s\.asmachta=""/.test(c));
  // מה שנשלח לשרת: הישות והאסמכתא כשדות נפרדים.
  assert.ok(c.includes('misMuzag:s.misYeshut') && c.includes('asmahta:s.asmachta'));
  // 80 בקשות לשליפה — מעבר לזה «בקשות נוספות».
  assert.ok(c.includes('s.startIndexlIsn*80+81'));
  assert.equal(filterEchoMatches('סינון לפי : ' + ' מספר ישות + '.slice(1, -2), 'מספר ישות'), true, 'אותו חיתוך כמו chackSinunim');
});

test('קוד שע״ם · «לא נמצאו רשומות» הוא טקסט מהשרת (txtNoResultes), והסינון מוצג ב-p.fontbold', () => {
  const h = SRC('process.html');
  assert.ok(h.includes('txt-no-resultes="vm.txtNoResultes"'));
  assert.ok(h.includes('<p ng-show="vm.isShowSinunBy" class="fontbold">סינון לפי : {{vm.sinunBy}}</p>'));
});
