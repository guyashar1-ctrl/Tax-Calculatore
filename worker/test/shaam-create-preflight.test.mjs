// ─── «הזן ייפוי כוח בשע״ם»: הבדיקה שלפני היצירה ─────────────────────────────
// ‼ 24.09.2026 · לחיצה אחת של הרו"ח = זרימה אחת בעובד: קריאה בלבד של רשימת
// «בקשות בתהליך» ⇒ רק אם הרשימה ריקה בוודאות — פנייה חיצונית ויצירה.
// הבדיקות כאן מריצות את **הזרימה עצמה** (run עם תלויות מדומות) ולא רק
// מחפשות מחרוזות במקור: כמה פעמים נוצרה בקשה, מתי נרשם externalAttempt,
// ומה חוזר כשנמצאה בקשה קיימת.
//
//   node --test worker/test/shaam-create-preflight.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import { run, validate } from '../src/handlers/shaamCreateRepresentation.mjs';
import { createPreflightDecision } from '../src/shaamRepresentationSession.mjs';

const INPUT = {
  submissionKey: 'person:client',
  role: 'client',
  requestId: 'req-1',
  personName: 'עידן רוקח',
  entityId: '039999998',
  birthDateDDMMYYYY: '01011990',
  secondary: { type: 'parentId', value: '067574996' },
  systems: [{ screenLabel: 'מס הכנסה', fileNumber: '039999998', repType: 'ראשי' }],
  spousePhone: '',
  existingRequestNumber: null,
  alreadyFoundInShaam: false,
};

const ROW = (over = {}) => ({
  system: 'מס הכנסה', clientName: 'רוקח עידן', requestState: 'המתנה למסמכים',
  systemState: 'בטיפול', fileNumber: '039999998', repType: 'ראשי', date: '20/09/2026',
  detail: { requestNumber: '2026500001' }, tableIndex: 0, trIndex: 1, ...over,
});

/** עובד מדומה: רושם כל קריאה, ומחזיר מה שהתרחיש קבע. */
function harness(found, over = {}) {
  const calls = [];
  const progressWrites = [];
  const spy = (name, ret) => async (...args) => { calls.push(name); return typeof ret === 'function' ? ret(...args) : ret; };
  const deps = {
    attach: spy('attach', { ok: true, page: {}, browser: {} }),
    detach: spy('detach', undefined),
    detectBlockingSignal: spy('detectBlockingSignal', null),
    openRepresentationSystem: spy('openRepresentationSystem', { ok: true }),
    findRequestRows: spy('findRequestRows', found),
    startNewRequest: spy('startNewRequest', { ok: true, mode: 'typed' }),
    verifyEntity: spy('verifyEntity', { ok: true }),
    readExistingRepresentations: spy('readExistingRepresentations', { activeCount: 0, openRequestCount: 0 }),
    selectRequestedSystems: spy('selectRequestedSystems', { ok: true }),
    confirmSystemsStep: spy('confirmSystemsStep', { ok: true, requestNumber: '2026599999' }),
    fillContactDetails: spy('fillContactDetails', { ok: true }),
    capturePdf: async (_page, trigger) => { calls.push('capturePdf'); await trigger(); return { buffer: Buffer.from('%PDF') }; },
    fetchGeneratedForm: spy('fetchGeneratedForm', { ok: true, buffer: Buffer.from('%PDF'), source: 'captured' }),
    putDocument: spy('putDocument', { ok: true, size: 4 }),
    captureDiagnostics: spy('captureDiagnostics', {}),
    progressTracker: () => {
      const state = {};
      return {
        get: () => state,
        touchedExternal: () => !!state.externalAttempt,
        set: async (p) => { Object.assign(state, p); progressWrites.push({ ...p }); return true; },
        markExternalAttempt: async (stage) => { state.externalAttempt = { stage }; progressWrites.push({ externalAttempt: stage }); calls.push('markExternalAttempt'); },
      };
    },
    ...over,
  };
  const ctx = { workerId: 'w', job: { id: 'job-1', progress: {} }, log: () => {} };
  return { calls, progressWrites, go: () => run(ctx, INPUT, deps) };
}

const EMPTY = { ok: true, rows: [], total: 0, searchedBy: 'entityId', listed: { count: 0, noRecords: false } };

// ── C · אין בקשה ⇒ ממשיכים ליצירה, פעם אחת בדיוק ──────────────────────────

test('C · הרשימה ריקה בוודאות ⇒ נוצרת בקשה אחת, והבדיקה קדמה לכל נגיעה', async () => {
  const h = harness(EMPTY);
  const out = await h.go();
  assert.equal(out.result.requestNumber, '2026599999');
  assert.equal(h.calls.filter(c => c === 'confirmSystemsStep').length, 1, 'יצירה אחת בלבד');
  assert.equal(h.calls.filter(c => c === 'verifyEntity').length, 1);
  const iFind = h.calls.indexOf('findRequestRows');
  assert.ok(iFind >= 0 && iFind < h.calls.indexOf('markExternalAttempt'), 'הבדיקה לפני סימון הנגיעה');
  assert.ok(h.calls.indexOf('markExternalAttempt') < h.calls.indexOf('verifyEntity'));
  assert.ok(iFind < h.calls.indexOf('startNewRequest'));
});

test('C · «ריק» מוכח גם מסימן «אין רשומות» של הטבלה', async () => {
  const h = harness({ ...EMPTY, listed: { count: null, noRecords: true } });
  const out = await h.go();
  assert.equal(out.result.requestNumber, '2026599999');
});

// ── D · נמצאה בקשה קיימת ⇒ אין יצירה, מדווחת כבדיקה ────────────────────────

test('D · נמצאה בקשה של האדם ⇒ שום פנייה משנה, והתוצאה נושאת את השורות', async () => {
  const h = harness({ ok: true, rows: [ROW(), ROW({ system: 'מע"מ' })], total: 2, searchedBy: 'entityId', listed: { count: 2 } });
  const out = await h.go();
  for (const forbidden of ['markExternalAttempt', 'startNewRequest', 'verifyEntity', 'confirmSystemsStep', 'putDocument']) {
    assert.ok(!h.calls.includes(forbidden), `לא נקרא ${forbidden}`);
  }
  assert.equal(h.progressWrites.length, 0, 'קריאה בלבד לא כותבת externalAttempt');
  assert.equal(out.result.preflight, 'existing_found');
  assert.equal(out.result.found, true);
  assert.equal(out.result.rows.length, 2);
  assert.equal(out.result.requestNumber, '2026500001');
  assert.equal(out.result.rows[0].rawRequestState, 'המתנה למסמכים');
  assert.ok(out.result.observedAt, 'מתי נקראה שע״ם — לשומר ההתיישנות בשרת');
  assert.ok(h.calls.includes('detach'), 'החיבור נסגר גם במסלול הזה');
});

// ── E · לא ניתן לבסס / לא ניתן לקרוא ⇒ עצירה לפני כל נגיעה ────────────────

for (const [name, found, code] of [
  ['שורות לישות שלא יוחסו לשם', { ok: true, rows: [], total: 1, listed: { count: 1 } }, 'preflight_ambiguous'],
  ['שורה בלי שם ובלי מספר', { ok: false, reason: 'cannot_attribute' }, 'preflight_ambiguous'],
  ['ישות אחרת בשורה', { ok: false, reason: 'identity_mismatch' }, 'preflight_ambiguous'],
  ['טבלה לא נמצאה', { ok: false, reason: 'list_table_not_found' }, 'preflight_unreadable'],
  ['אפס שורות בלי ראיה שהרשימה ריקה', { ok: true, rows: [], total: 0, listed: { count: null, noRecords: false } }, 'preflight_unreadable'],
]) {
  test(`E · ${name} ⇒ עצירה (${code}), בלי externalAttempt ובלי יצירה`, async () => {
    const h = harness(found);
    await assert.rejects(h.go(), (e) => e.name === 'NeedsHumanError' && e.code === code);
    for (const forbidden of ['markExternalAttempt', 'startNewRequest', 'verifyEntity', 'confirmSystemsStep']) {
      assert.ok(!h.calls.includes(forbidden), `לא נקרא ${forbidden}`);
    }
    assert.equal(h.progressWrites.length, 0);
    assert.ok(h.calls.includes('detach'));
  });
}

// ── שכבות ההגנה הקיימות נשארו ─────────────────────────────────────────────

test('קו ההגנה שאחרי אימות הישות עדיין עוצר («בקשות(N)» > 0)', async () => {
  const h = harness(EMPTY, {
    readExistingRepresentations: async () => ({ activeCount: 0, openRequestCount: 1 }),
  });
  await assert.rejects(h.go(), (e) => e.code === 'open_request_exists');
  assert.ok(!h.calls.includes('confirmSystemsStep'));
});

test('בלי שם האדם אין ראיית שיוך ⇒ לא מתחילים בכלל', () => {
  assert.throws(() => validate({ ...INPUT, personName: '  ' }), (e) => e.code === 'missing_attribution_evidence');
});

// ── ההכרעה עצמה, טהורה ─────────────────────────────────────────────────────

test('createPreflightDecision — טבלת ההכרעות', () => {
  assert.equal(createPreflightDecision({ ok: true, rows: [ROW()], total: 1 }).decision, 'existing');
  assert.equal(createPreflightDecision({ ok: true, rows: [], total: 0, listed: { count: 0 } }).decision, 'none');
  assert.equal(createPreflightDecision({ ok: true, rows: [], total: 0, listed: { noRecords: true } }).decision, 'none');
  assert.equal(createPreflightDecision({ ok: true, rows: [], total: 0, listed: { count: null } }).decision, 'unreadable');
  assert.equal(createPreflightDecision({ ok: true, rows: [], total: 0 }).decision, 'unreadable');
  assert.equal(createPreflightDecision({ ok: true, rows: [], total: 3, listed: { count: 3 } }).decision, 'ambiguous');
  assert.equal(createPreflightDecision({ ok: false, reason: 'identity_mismatch' }).decision, 'ambiguous');
  assert.equal(createPreflightDecision({ ok: false, reason: 'cannot_attribute' }).decision, 'ambiguous');
  assert.equal(createPreflightDecision({ ok: false, reason: 'tab_in_progress' }).decision, 'unreadable');
  assert.equal(createPreflightDecision(null).decision, 'unreadable');
});
