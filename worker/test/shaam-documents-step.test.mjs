// ─── 204 · מסך «טעינת מסמכים» — השורות ששע״ם דורשת, ממי, ומה עושים ─────────
// ‼ מקור האמת: קוד האפליקציה של שע״ם, שמור ב-fixtures/shaam-src-2026-09-23/.
// הבדיקה הראשונה קושרת את SHAAM_DOC_SLOTS לקוד הזה — אם שע״ם תשנה את הרשימה
// ויצלמו מחדש, הבדיקה תיכשל עד שהטבלה תתעדכן.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SHAAM_DOC_SLOTS, slotForLabel, normDocLabel, documentsHeaderEntity,
  documentsStepPlan, documentsSubmissionDecision, dialogMatchesSlot,
} from '../src/shaamRepresentationSession.mjs';
import { EXTRA_DOCUMENT_UPLOAD_LIVE_VERIFIED } from '../src/handlers/shaamSubmitPoa.mjs';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const CONTROLLER = src('./fixtures/shaam-src-2026-09-23/uploadKasafot.controller.js');
const TEMPLATE = src('./fixtures/shaam-src-2026-09-23/uploadKasafot.template.html');
const HANDLER = src('../src/handlers/shaamSubmitPoa.mjs');

const ID = '034605212';
const SPOUSE_ID = '000000273';
const row = (label, over = {}) => ({ label: normDocLabel(label), required: true, uploadName: '', hasFile: false, plusControls: 1, ...over });
const POA = row('טופס ייפוי כוח');
const IDL = row('תצלום תעודת זהות או רישיון נהיגה');
const PASS = row('צילום דרכון');
const INHERIT = row('צו ירושה + מכתב מעו"ד');
const GUARD = row('צו שיפוטי למינוי אפוטרופוס');
const state = (rows, over = {}) => ({
  identityOk: true, headerEntityId: ID, expectedEntityId: ID, rows,
  spouseCheckboxes: 0, spouseLabelOnScreen: false, continueButtons: 1, ...over,
});

// ── הטבלה מול קוד שע״ם ─────────────────────────────────────────────────────

test('SHAAM_DOC_SLOTS תואמת את fileList בקוד שע״ם — מספר, כיתוב וסדר', () => {
  const list = [...CONTROLLER.matchAll(/\{id:(\d),name:(?:"([^"]+)"|'([^']+)')/g)]
    .map((m) => ({ id: Number(m[1]), label: m[2] ?? m[3] }));
  assert.equal(list.length, 5);
  assert.deepEqual(list.map((x) => x.id), SHAAM_DOC_SLOTS.map((s) => s.id));
  for (const x of list) assert.equal(normDocLabel(slotForLabel(x.label)?.label), normDocLabel(x.label), x.label);
});

test('כל שורה פותחת את הדיאלוג שלה — name בתבנית לפי fileList[n]', () => {
  for (const s of SHAAM_DOC_SLOTS) {
    const re = new RegExp(`name="${s.dialog}"[^>]*is-window-open="vm\\.fileList\\[${s.id - 1}\\]\\.isOpenDialog"`);
    assert.ok(re.test(TEMPLATE), s.dialog);
  }
  // ‼ שע״ם מקבלת PDF בלבד — בכל אחד מחמשת הדיאלוגים.
  assert.equal((TEMPLATE.match(/allowed-file-extentions="\['pdf'\]"/g) || []).length, 5);
  // כל שורה גלויה היא חובה.
  assert.ok(/<label class="required">\{\{fl\.name\}\}<\/label>/.test(TEMPLATE));
  assert.ok(/יש לטעון את כל המסמכים/.test(CONTROLLER));
});

test('סיווג לפי כיתוב מדויק בלבד; מרכאות ״/" וכוכבית לא משנים; כיתוב זר ⇒ null', () => {
  assert.equal(slotForLabel('טופס ייפוי כוח').kind, 'poa');
  assert.equal(slotForLabel('* טופס ייפוי כוח *').kind, 'poa');
  assert.equal(slotForLabel('תצלום תעודת זהות או רישיון נהיגה').kind, 'idOrLicense');
  assert.equal(slotForLabel('צו ירושה + מכתב מעו״ד').kind, 'inheritance');
  assert.equal(slotForLabel('צילום דרכון').kind, 'passport');
  assert.equal(slotForLabel('תצלום תעודת זהות'), null, 'לא התאמה חלקית');
  assert.equal(slotForLabel('אישור ניהול חשבון'), null);
  assert.equal(slotForLabel(''), null);
});

// ── בעלים: הת.ז. בכותרת ─────────────────────────────────────────────────────

test('כותרת: ת.ז. אחת אחרי «למיוצג» ⇒ הבעלים; אין / שתיים ⇒ אין ודאות', () => {
  assert.deepEqual(documentsHeaderEntity(`טעינת מסמכים למיוצג ${ID} - סלע הדסה`), { ok: true, entityId: ID });
  assert.equal(documentsHeaderEntity('טעינת מסמכים למיוצג 34605212 - סלע הדסה').entityId, ID, 'אפס מוביל');
  assert.equal(documentsHeaderEntity('טעינת מסמכים').reason, 'header_entity_not_found');
  assert.equal(documentsHeaderEntity(`למיוצג ${ID} ... למיוצג ${SPOUSE_ID}`).reason, 'header_entity_ambiguous');
});

test('תוכנית · הכותרת לא תואמת לת.ז. שבמשימה / לא נקראה ⇒ עצירה לפני נגיעה', () => {
  assert.equal(documentsStepPlan(state([POA], { headerEntityId: SPOUSE_ID })).reason, 'documents_screen_identity_unverified');
  assert.equal(documentsStepPlan(state([POA], { headerEntityId: null })).reason, 'documents_screen_identity_unverified');
});

// ── התוכנית המבנית ─────────────────────────────────────────────────────────

test('תוכנית · טופס בלבד ⇒ אין שורות נוספות', () => {
  const p = documentsStepPlan(state([POA]));
  assert.deepEqual([p.ok, p.extraSlots.length, p.entityId], [true, 0, ID]);
});

test('תוכנית · טופס + ת.ז./רישיון; טופס + דרכון; טופס + שניהם', () => {
  assert.deepEqual(documentsStepPlan(state([POA, IDL])).extraSlots.map((s) => s.kind), ['idOrLicense']);
  assert.deepEqual(documentsStepPlan(state([POA, PASS])).extraSlots.map((s) => s.kind), ['passport']);
  assert.deepEqual(documentsStepPlan(state([POA, IDL, PASS])).extraSlots.map((s) => s.id), [2, 5]);
});

test('תוכנית · צו ירושה / מינוי אפוטרופוס ⇒ unsupported_required_document (לא מעמידים פנים שהם מסמך מזהה)', () => {
  const a = documentsStepPlan(state([POA, INHERIT]));
  assert.deepEqual([a.ok, a.reason, a.slots], [false, 'unsupported_required_document', [3]]);
  assert.equal(documentsStepPlan(state([POA, IDL, GUARD])).reason, 'unsupported_required_document');
});

test('תוכנית · שורה שלא מוכרת לנו ⇒ unknown_document_row', () => {
  const r = documentsStepPlan(state([POA, row('אישור ניהול חשבון')]));
  assert.deepEqual([r.ok, r.reason], [false, 'unknown_document_row']);
});

test('תוכנית · שורה נוספת שכבר יש בה קובץ ⇒ לא נוגעים', () => {
  assert.equal(documentsStepPlan(state([POA, { ...IDL, hasFile: true, uploadName: 'x.pdf' }])).reason, 'row_already_populated');
});

test('תוכנית · «+» חסר בשורה נוספת ⇒ עצירה לפני נגיעה', () => {
  assert.equal(documentsStepPlan(state([POA, { ...IDL, plusControls: 0 }])).reason, 'upload_opener_not_found');
});

// ── ההחלטה אחרי שהשרת ענה מה יש לנו ────────────────────────────────────────

const idSlot = SHAAM_DOC_SLOTS[1];
const passSlot = SHAAM_DOC_SLOTS[4];
const ready = (slot, over = {}) => ({ slot, result: { ok: true, person: 'client', personName: 'הדסה סלע', fileName: 'x.pdf', pageCount: 1, ...over } });
const fail = (slot, error) => ({ slot, result: { ok: false, error } });

test('החלטה · אין שורות נוספות ⇒ ממשיכים (הטופס לבד — אינו מושפע מהשומר)', () => {
  assert.deepEqual(documentsSubmissionDecision([], { extraUploadVerified: false }), { ok: true, uploads: [] });
});

test('החלטה · חסר מסמך ⇒ awaiting_required_documents', () => {
  const d = documentsSubmissionDecision([fail(idSlot, 'missing')], { extraUploadVerified: true });
  assert.deepEqual([d.ok, d.code], [false, 'awaiting_required_documents']);
});

test('החלטה · אי אפשר לשייך גובר על הכול; המרה גוברת על חוסר', () => {
  assert.equal(documentsSubmissionDecision([fail(idSlot, 'missing'), fail(passSlot, 'needs_document_assignment')], { extraUploadVerified: true }).code, 'needs_document_assignment');
  assert.equal(documentsSubmissionDecision([fail(idSlot, 'missing'), fail(passSlot, 'not_pdf_convertible')], { extraUploadVerified: true }).code, 'document_not_pdf_convertible');
});

test('החלטה · תשובה לא צפויה מהשרת ⇒ עוצרים (לא מדלגים על השורה)', () => {
  assert.equal(documentsSubmissionDecision([fail(idSlot, 'download_failed')], { extraUploadVerified: true }).code, 'required_document_unavailable');
});

test('החלטה · הכול מוכן, ושומר המקרה החי הראשון פעיל ⇒ first_live_verification (לא מעלים)', () => {
  const d = documentsSubmissionDecision([ready(idSlot)], { extraUploadVerified: false });
  assert.deepEqual([d.ok, d.code], [false, 'first_live_verification']);
});

test('החלטה · אחרי אימות חי ⇒ מעלים כל שורה (ת.ז./רישיון + דרכון)', () => {
  const d = documentsSubmissionDecision([ready(idSlot), ready(passSlot)], { extraUploadVerified: true });
  assert.equal(d.ok, true);
  assert.deepEqual(d.uploads.map((x) => x.slot.id), [2, 5]);
});

test('השומר פעיל בריצה הזו, ואינו הגדרה — קבוע בקוד', () => {
  assert.equal(EXTRA_DOCUMENT_UPLOAD_LIVE_VERIFIED, false);
  assert.ok(/export const EXTRA_DOCUMENT_UPLOAD_LIVE_VERIFIED = false;/.test(HANDLER));
  assert.ok(!/process\.env[^\n]*EXTRA_DOCUMENT/.test(HANDLER), 'לא ניתן לעקוף בהגדרת סביבה');
});

// ── הדיאלוג ────────────────────────────────────────────────────────────────

test('דיאלוג · בדיוק הדיאלוג של השורה; אחר / שניים / אף אחד / כותרת של שורה אחרת ⇒ עצירה', () => {
  const d = (open, title = '') => ({ exists: true, openModals: open, title });
  assert.equal(dialogMatchesSlot(d(['dialogTeinatTzilumTz'], 'טעינת תצלום תעודת זהות'), idSlot).ok, true);
  assert.equal(dialogMatchesSlot(d(['dialogTeinatTzilumDarkon'], 'טעינת צילום דרכון'), idSlot).reason, 'upload_dialog_mismatch');
  assert.equal(dialogMatchesSlot(d(['dialogTeinatTzilumTz', 'dialogTeinatAsmachta']), idSlot).reason, 'upload_dialog_mismatch');
  assert.equal(dialogMatchesSlot(d([]), idSlot).reason, 'upload_dialog_not_open');
  assert.equal(dialogMatchesSlot(d(['dialogTeinatTzilumTz'], 'טעינת צילום דרכון'), idSlot).reason, 'upload_dialog_mismatch');
  assert.equal(dialogMatchesSlot(d(['dialogTeinatAsmachta'], 'טעינת בקשה/…'), SHAAM_DOC_SLOTS[0]).ok, true, 'הכותרת החיה של שורה 1');
});

// ── המשימה: עצירות על מסמכים מסיימות אותה (לא «דרוש אדם») ─────────────────

test('עצירה על מסמך ⇒ PermanentError (failed, מפנה את המקום) — לפני הסימן', () => {
  const stop = HANDLER.indexOf('function documentsStop(');
  assert.ok(stop > 0 && HANDLER.slice(stop, HANDLER.indexOf('\n}', stop)).includes('new PermanentError('));
  const firstStop = HANDLER.indexOf('throw documentsStop(decision.code');
  assert.ok(firstStop > 0 && firstStop < HANDLER.indexOf("markExternalAttempt('upload_signed_form')"));
  assert.ok(HANDLER.indexOf("throw documentsStop('first_live_verification'") < HANDLER.indexOf("markExternalAttempt('upload_signed_form')"));
  // ‼ הבחירה במסמך בשרת לפי הת.ז. שבכותרת — לא לפי role.
  assert.ok(HANDLER.includes('getIdentityDocument(ctx.workerId, ctx.job.id, { entityId: plan.entityId, slotKind: slot.kind })'));
});
