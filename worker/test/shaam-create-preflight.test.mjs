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
  clientPhone: '050-1234567',
  clientEmail: 'client@example.test',
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
    startNewRequest: spy('startNewRequest', { ok: true, needsVerification: true }),
    verifyEntity: spy('verifyEntity', { ok: true }),
    readExistingRepresentations: spy('readExistingRepresentations', { activeCount: 0, openRequestCount: 0 }),
    selectRequestedSystems: spy('selectRequestedSystems', { ok: true }),
    confirmSystemsStep: spy('confirmSystemsStep', { ok: true, requestNumber: '2026599999' }),
    fillContactDetailsAndCaptureForm: spy('fillContactDetailsAndCaptureForm', { ok: true, spousePhoneAsked: false, form: { ok: true, buffer: Buffer.from('%PDF-'), source: 'window_open' } }),
    putDocument: spy('putDocument', { ok: true, size: 5 }),
    // ‼ 218 · בדיקת התבנית בדף האתר — מדומה כאן (בלי Chrome ובלי רשת).
    verifyFormLayout: spy('verifyFormLayout', { ok: true, problems: [], numPages: 1 }),
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
  const args = {};
  for (const [k, fn] of Object.entries(deps)) {
    if (typeof fn !== 'function' || k === 'progressTracker') continue;
    deps[k] = async (...a) => { (args[k] ??= []).push(a); return fn(...a); };
  }
  return { calls, progressWrites, args, go: (input = INPUT) => run(ctx, input, deps) };
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

// ── 28.09.2026 · הזרימה שלפני החתימה, לפי קוד שע״ם האמיתי ───────────────────

test('F · זרימה מלאה: האימות מקבל את needsVerification, הרשויות בדיוק מהקלט, והטופס נשמר מול הבקשה', async () => {
  const h = harness(EMPTY);
  const out = await h.go();
  assert.equal(h.args.verifyEntity[0][1].needsVerification, true);
  assert.deepEqual(h.args.selectRequestedSystems[0][1], INPUT.systems, 'בדיוק המערכים שבקלט');
  const contactArgs = h.args.fillContactDetailsAndCaptureForm[0][1];
  assert.deepEqual(contactArgs, { clientPhone: '050-1234567', spousePhone: '', clientEmail: 'client@example.test' });
  assert.equal(h.args.putDocument.length, 1, 'הטופס נשמר פעם אחת');
  const doc = h.args.putDocument[0][2];
  assert.equal(doc.documentId, 'poa-pdf-req-1-person-client');
  assert.equal(doc.linkedTo, 'rep:req-1');
  assert.equal(out.result.formDocumentId, doc.documentId);
  assert.equal(out.result.requestNumber, '2026599999');
  assert.ok(h.progressWrites.some((p) => p.requestNumber === '2026599999'), 'מספר הבקשה נשמר מיד');
  assert.ok(h.calls.indexOf('confirmSystemsStep') < h.calls.indexOf('fillContactDetailsAndCaptureForm'));
});

test('218 · הטופס נבדק מול התבנית מיד אחרי שנשמר, והתוצאה יוצאת לשרת (formLayout)', async () => {
  const h = harness(EMPTY, { verifyFormLayout: async () => ({ ok: false, problems: ['anchor:registered_word'] }) });
  const out = await h.go();
  assert.equal(h.args.verifyFormLayout.length, 1, 'נבדק פעם אחת');
  assert.equal(String(h.args.verifyFormLayout[0][0]), '%PDF-', 'הקובץ שהתקבל משע״ם');
  assert.deepEqual(out.result.formLayout, { ok: false, problems: ['anchor:registered_word'], by: 'worker' });
});

test('218 · בדיקת תבנית שנכשלה בהרצה לא מכשילה את המשימה — ok:null, והמשרד יבדוק', async () => {
  const h = harness(EMPTY, { verifyFormLayout: async () => { throw new Error('converter down'); } });
  const out = await h.go();
  assert.equal(out.result.formDocumentId, 'poa-pdf-req-1-person-client');
  assert.equal(out.result.formLayout.ok, null);
  assert.match(out.result.formLayout.error, /converter down/);
});

test('F · שע״ם דילגה על האימות (יש ייצוג פעיל) ⇒ העובד לא ממציא אימות', async () => {
  const h = harness(EMPTY, { startNewRequest: async () => ({ ok: true, needsVerification: false }) });
  await h.go();
  assert.equal(h.args.verifyEntity[0][1].needsVerification, false);
});

test('F · אימות נדחה ⇒ ניסיון אחד, עצירה לאדם, בלי יצירה ובלי ניסיון נוסף', async () => {
  const h = harness(EMPTY, { verifyEntity: async () => ({ ok: false, reason: 'verification_rejected', detail: 'אין התאמה בנתונים' }) });
  await assert.rejects(h.go(), (e) => e.name === 'NeedsHumanError' && e.code === 'entity_verification_failed' && /אין התאמה/.test(e.message));
  assert.equal(h.args.verifyEntity.length, 1);
  assert.ok(!h.calls.includes('confirmSystemsStep'));
  assert.ok(h.progressWrites.some((p) => p.externalAttempt === 'verify_entity'), 'הנגיעה נרשמה');
});

test('F · המסך לא קיבל את פרטי האימות ⇒ עצירה, האימות לא נוצל', async () => {
  const h = harness(EMPTY, { verifyEntity: async () => ({ ok: false, reason: 'verification_input_rejected_on_screen', detail: 'יש למלא תאריך לידה' }) });
  await assert.rejects(h.go(), (e) => e.code === 'verification_input_rejected');
  assert.ok(!h.calls.includes('confirmSystemsStep'));
});

for (const [reason, code] of [['shaam_manual_handling', 'shaam_manual_handling'], ['entity_rejected', 'entity_rejected']]) {
  test(`F · בדיקת הישות: ${reason} ⇒ עצירה לפני אימות ולפני יצירה`, async () => {
    const h = harness(EMPTY, { startNewRequest: async () => ({ ok: false, reason, detail: 'הודעת שע״ם' }) });
    await assert.rejects(h.go(), (e) => e.code === code);
    for (const forbidden of ['markExternalAttempt', 'verifyEntity', 'confirmSystemsStep']) assert.ok(!h.calls.includes(forbidden), forbidden);
  });
}

test('F · שע״ם דחתה את התיקים ⇒ עצירה, לא נוצרה בקשה', async () => {
  const h = harness(EMPTY, { confirmSystemsStep: async () => ({ ok: false, reason: 'systems_rejected', detail: 'מספר תיק שגוי' }) });
  await assert.rejects(h.go(), (e) => e.code === 'systems_rejected');
  assert.ok(!h.calls.includes('fillContactDetailsAndCaptureForm'));
});

test('F · אחרי «אישור» בחלונית לא הגיע שלב 3 ⇒ «לא ידוע», בלי להמשיך', async () => {
  const h = harness(EMPTY, { confirmSystemsStep: async () => ({ ok: false, reason: 'create_outcome_unknown' }) });
  await assert.rejects(h.go(), (e) => e.code === 'create_outcome_unknown' && /בדוק קבלת הייצוג/.test(e.message));
});

test('F · חסר טלפון בן/בת זוג כששע״ם דורשת ⇒ עצירה שאומרת שהבקשה נפתחה, עם המספר', async () => {
  const h = harness(EMPTY, { fillContactDetailsAndCaptureForm: async () => ({ ok: false, reason: 'spouse_phone_required_but_missing' }) });
  await assert.rejects(h.go(), (e) => e.code === 'missing_spouse_phone' && e.message.includes('2026599999'));
  assert.ok(!h.calls.includes('putDocument'));
});

test('F · הטופס לא הגיע ⇒ עצירה עם המספר, בלי שמירת מסמך', async () => {
  const h = harness(EMPTY, { fillContactDetailsAndCaptureForm: async () => ({ ok: true, form: { ok: false, reason: 'form_not_pdf' } }) });
  await assert.rejects(h.go(), (e) => e.code === 'form_not_captured' && e.message.includes('2026599999'));
  assert.ok(!h.calls.includes('putDocument'));
});

test('F · בלי טלפון תקין ללקוח ⇒ לא מתחילים בכלל (המסך שדורש אותו בא אחרי היצירה)', () => {
  assert.throws(() => validate({ ...INPUT, clientPhone: '' }), (e) => e.code === 'missing_client_phone');
  assert.throws(() => validate({ ...INPUT, clientPhone: '05' }), (e) => e.code === 'missing_client_phone');
  assert.throws(() => validate({ ...INPUT, spousePhone: '12' }), (e) => e.code === 'bad_spouse_phone');
  assert.doesNotThrow(() => validate({ ...INPUT, clientPhone: '+972-50-123-4567' }));
});
