// ─── שידור טופס 2279 חתום — הזרימה האמיתית (23.09.2026) ─────────────────────
// ‼ מקור האמת: ה-DOM החי (נקרא בלי ללחוץ) וקוד האפליקציה של שע״ם (תבניות
// ובקרים שנקראו מהדף הפתוח):
//   רשימה → שורת מס הכנסה → <input class="icon upload" k-content="'טעינת מסמכים'">
//   → state pirteyHitkashrut (שלב 3) → <button btntype="hemshech"> (ניווט בלבד)
//   → state uploadKasafot (שלב 4) → .BoxA «טופס ייפוי כוח» → input.icon.plus
//   → #dialogTeinatAsmachta → input[type=file] → V + שם קובץ בשורה
//   → תיבת vm.isCheckeChatimatBz (רק אם הוכחה) → hemshech (ההגשה)
//   → state returnUpload: «אישור קליטת מסמכים למיוצג <ת.ז.> - <שם>».

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  pickUploadDocumentsControl, openedRequestIdentity, documentsStepPlan,
  wizardStepFromText, wizardStepResolve, pickContinueButton, submissionAcceptedEvidence,
  NEVER_CLICK_BTNTYPES,
} from '../src/shaamRepresentationSession.mjs';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const HANDLER = src('../src/handlers/shaamSubmitPoa.mjs');
const SESSION = src('../src/shaamRepresentationSession.mjs');
const fnBody = (s, sig) => { const i = s.indexOf(sig); assert.ok(i >= 0, sig); return s.slice(i, s.indexOf('\n}', i)); };
const LIST_ROW = JSON.parse(src('./fixtures/shaam-list-row.live.json'));
const CONTACT = JSON.parse(src('./fixtures/shaam-contact-step.live.json'));

const ID = '034605212';
const NAME_ON_SCREEN = 'סלע הדסה';
const WHO = { entityId: ID, expectedClientName: 'הדסה סלע' };
const fill = (s) => String(s).split('{ID}').join(ID).split('{NAME}').join(NAME_ON_SCREEN);

// ── רשימת הבקשות: הפקד הנכון בשורה (fixture חי) ─────────────────────────────

test('רשימה · ה-DOM החי: נבחר <input class="icon upload"> — לא «ביטול הבקשה», לא PDF, לא «אירועים קודמים»', () => {
  const r = pickUploadDocumentsControl(LIST_ROW.candidates);
  assert.deepEqual([r.ok, r.index], [true, LIST_ROW.expectedIndex]);
});

test('רשימה · פקד מוסתר (ng-hide) אינו מועמד, גם אם הוא אומר «טעינת מסמכים»', () => {
  const hiddenOnly = LIST_ROW.candidates.map((c, i) => (i === LIST_ROW.expectedIndex ? { ...c, hidden: true } : c));
  assert.equal(pickUploadDocumentsControl(hiddenOnly).reason, 'upload_action_not_found');
});

test('רשימה · אף פקד או שניים ⇒ עצירה; tooltip שדלף למחיקה/PDF ⇒ לא נבחר', () => {
  assert.equal(pickUploadDocumentsControl(LIST_ROW.candidates.slice(0, 5)).reason, 'upload_action_not_found');
  const two = [...LIST_ROW.candidates, { attrText: '', classText: 'k-i-upload', tooltip: 'טעינת מסמכים' }];
  assert.equal(pickUploadDocumentsControl(two).reason, 'upload_action_ambiguous');
  const leaked = [
    { attrText: "'ביטול הבקשה'", classText: 'icon xmark', tooltip: 'טעינת מסמכים' },
    { attrText: 'PDF', classText: 'icon adobe_pdf', tooltip: 'טעינת מסמכים' },
  ];
  assert.equal(pickUploadDocumentsControl(leaked).ok, false);
});

test('רשימה · המועמדים נקראים מ-input/div עם type=button ו-k-content, והזרימה משתמשת באותו קורא', () => {
  const line = SESSION.split('\n').find((l) => l.startsWith('export const ACTION_CANDIDATES = ')) ?? '';
  for (const sel of ['input[type=button]', '[type=button]', '[kendo-tooltip]']) assert.ok(line.includes(sel), sel);
  const d = fnBody(SESSION, 'export async function describeActionCandidates');
  assert.ok(d.includes("'k-content'") && d.includes('ng-hide'));
  const fn = fnBody(SESSION, 'export async function openRequestForDocuments');
  assert.ok(fn.includes('describeActionCandidates(rowLoc)') && fn.includes('locator(ACTION_CANDIDATES).nth(pick.index)'));
  assert.ok(fn.includes("systemLabel = 'מס הכנסה'") && fn.includes('singleAttributedRequest(found.rows)'));
  // ‼ האיתור תמיד לפי ישות (המסלול שנבדק חי); מספר ידוע רק לאימות.
  assert.ok(fn.includes("findRequestRows(page, { requestNumber: '', entityId, expectedClientName })"));
});

// ── שלב 3: פרטי התקשרות (fixture חי) ───────────────────────────────────────

test('שלב 3 · fixture חי: הנקודה הפעילה ברצועה + הכותרת ⇒ שלב 3 (לא טקסט הרצועה)', () => {
  const dots = CONTACT.dots.filter((d) => /\bactive\b/.test(d.cls) && d.visible).map((d) => d.text);
  assert.deepEqual(dots, ['3']);
  const body = fill(CONTACT.headings.join(' ') + ' ' + CONTACT.strip);
  assert.equal(wizardStepResolve({ dots, body, strip: CONTACT.strip }), 3);
  assert.equal(wizardStepFromText(body, CONTACT.strip), 3, 'הכותרת לבדה מסכימה');
});

test('שלב 3 · נקודה פעילה וכותרת שסותרות ⇒ 0 (לא ממשיכים)', () => {
  const body = fill(`${CONTACT.strip} טעינת מסמכים למיוצג {ID} - {NAME}`);
  assert.equal(wizardStepResolve({ dots: ['3'], body, strip: CONTACT.strip }), 0);
});

test('שלב 3 · fixture חי: «המשך» הוא hemshech — לא «עדכון» ולא «חזרה»; מוסתרים לא נחשבים', () => {
  assert.deepEqual(pickContinueButton(CONTACT.buttons), { ok: true });
  const types = CONTACT.buttons.filter((b) => b.btntype && b.visible).map((b) => b.btntype);
  assert.ok(types.includes('idkun') && types.includes('chazara'), 'עדכון וחזרה גלויים באותו מסך');
  for (const t of NEVER_CLICK_BTNTYPES) assert.equal(pickContinueButton(CONTACT.buttons.filter((b) => b.btntype === t)).ok, false);
  const twoVisible = [...CONTACT.buttons, { btntype: 'hemshech', label: 'המשך', visible: true, disabled: false }];
  assert.equal(pickContinueButton(twoVisible).reason, 'continue_ambiguous');
  const disabled = CONTACT.buttons.map((b) => (b.btntype === 'hemshech' ? { ...b, disabled: true } : b));
  assert.equal(pickContinueButton(disabled).reason, 'continue_not_found');
  const hiddenDup = [...CONTACT.buttons, { btntype: 'hemshech', label: 'המשך', visible: false, disabled: false }];
  assert.deepEqual(pickContinueButton(hiddenDup), { ok: true });
});

test('שלב 3 · fixture חי: «כתובת מייל אינה תקינה» יושב בדיאלוג מוסתר — אינו שגיאה של המסך', () => {
  const e = CONTACT.errors.find((x) => /כתובת מייל/.test(x.text));
  assert.ok(e && e.visible === false && e.inModal === true, 'זה בדיוק מה שעצר את הניסיון השלישי');
  assert.equal(CONTACT.errors.filter((x) => x.visible).length, 0);
  const rse = fnBody(SESSION, 'export async function readScreenError');
  assert.ok(rse.includes('.filter(visible)'), 'רק שגיאות גלויות');
});

test('שלב 3 · זהות + מספר בקשה מהמסך שנפתח; לקוח/תיק אחר ⇒ עצירה', () => {
  const body = fill(CONTACT.headings.join(' '));
  const r = openedRequestIdentity(body, WHO);
  assert.deepEqual([r.ok, r.requestNumber], [true, '2026538930']);
  assert.equal(openedRequestIdentity('מספר בקשה: 2026495063 פרטי התקשרות למיוצג 312359193 - לזימי שמעון', WHO).ok, false);
  assert.equal(openedRequestIdentity('פרטי התקשרות למיוצג - סלע הדסה', WHO).ok, false);
  assert.equal(openedRequestIdentity('פרטי התקשרות למיוצג 034605212', WHO).ok, false);
});

test('שלב 3 · «המשך» דרך clickHemshech בלבד; בלי «עדכון», מילוי שדות או «שמירה»', () => {
  const fn = fnBody(SESSION, 'export async function openRequestForDocuments');
  const step3 = fn.slice(fn.indexOf('if (step === 3)'), fn.indexOf('if (step !== 4)'));
  assert.ok(step3.includes('await clickHemshech(page)'));
  for (const bad of ['idkun', 'setValue', 'fillContactDetails', "'שמירה'", 'setInputFiles', '.check(', "clickExact(page, 'המשך')"]) {
    assert.ok(!step3.includes(bad), bad);
  }
  assert.ok(fn.indexOf('openedRequestIdentity(') < fn.indexOf('if (step === 3)'), 'הזהות לפני «המשך»');
  assert.ok(fn.includes("reason: 'request_number_not_on_screen'") && fn.includes("reason: 'opened_wrong_request'"));
});

// ── שלב 4: טעינת מסמכים (לפי התבנית uploadKasafot.html) ──────────────────────

const DOCS_OK = { identityOk: true, poaRows: 1, otherDocs: [], poaHasFile: false, plusControls: 1, spouseCheckboxes: 1, spouseLabelOnScreen: true, continueButtons: 1 };

test('שלב 4 · שורה אחת, «+» אחד, «המשך» אחד ⇒ ממשיכים; כל סטייה ⇒ עצירה לפני הנגיעה', () => {
  assert.deepEqual(documentsStepPlan({ ...DOCS_OK, spouseCheckboxes: 0, spouseLabelOnScreen: false }), { ok: true, checkSpouse: false });
  assert.equal(documentsStepPlan({ ...DOCS_OK, poaRows: 0 }).reason, 'poa_row_not_found');
  assert.equal(documentsStepPlan({ ...DOCS_OK, poaRows: 2 }).reason, 'poa_row_ambiguous');
  assert.equal(documentsStepPlan({ ...DOCS_OK, plusControls: 0 }, { spouseSignatureConfirmed: true }).reason, 'upload_opener_not_found');
  assert.equal(documentsStepPlan({ ...DOCS_OK, identityOk: false }).reason, 'documents_screen_identity_unverified');
  assert.equal(documentsStepPlan({ ...DOCS_OK, continueButtons: 0 }, { spouseSignatureConfirmed: true }).reason, 'continue_not_found');
});

test('שלב 4 · שע״ם דורשת מסמך נוסף (למשל תצלום ת.ז.) ⇒ לא מתחילים העלאה חלקית', () => {
  const r = documentsStepPlan({ ...DOCS_OK, otherDocs: ['תצלום תעודת זהות או רישיון נהיגה'] }, { spouseSignatureConfirmed: true });
  assert.equal(r.reason, 'other_documents_required');
});

test('שלב 4 · כבר נטען קובץ לשורה ⇒ לא מעלים שוב', () => {
  assert.equal(documentsStepPlan({ ...DOCS_OK, poaHasFile: true }, { spouseSignatureConfirmed: true }).reason, 'poa_already_uploaded');
});

test('שלב 4 · נשואים + הוכחה ⇒ התיבה תסומן; בלי הוכחה / בלי תיבה / שתי תיבות ⇒ עצירה', () => {
  assert.deepEqual(documentsStepPlan(DOCS_OK, { spouseSignatureConfirmed: true }), { ok: true, checkSpouse: true });
  assert.equal(documentsStepPlan(DOCS_OK, { spouseSignatureConfirmed: false }).reason, 'spouse_signature_not_proven');
  assert.equal(documentsStepPlan({ ...DOCS_OK, spouseCheckboxes: 0 }, { spouseSignatureConfirmed: true }).reason, 'spouse_checkbox_not_found');
  assert.equal(documentsStepPlan({ ...DOCS_OK, spouseCheckboxes: 2 }, { spouseSignatureConfirmed: true }).reason, 'spouse_checkbox_ambiguous');
});

test('שלב 4 · הבוררים לקוחים מהתבנית: .BoxA, input.plus, #dialogTeinatAsmachta, ng-model של התיבה', () => {
  const probe = fnBody(SESSION, 'function poaRowProbe(mode)');
  assert.ok(probe.includes("querySelectorAll('.BoxA')") && probe.includes("input[type=button].plus"));
  assert.ok(probe.includes('.icon.checkmark') && probe.includes("querySelector('u')"), 'V + שם הקובץ = נטען');
  assert.ok(probe.includes('if (out.plusControls !== 1 || out.poaHasFile) return { ...out, clicked: false };'));
  assert.ok(SESSION.includes("const POA_DIALOG = '#dialogTeinatAsmachta';"));
  const up = fnBody(SESSION, 'export async function uploadSignedForm');
  assert.ok(up.includes("dialog.locator('input[type=file]')"), 'שדה הקובץ מתוך הדיאלוג הפתוח בלבד');
  assert.ok(up.includes("'upload_dialog_ambiguous'") && up.includes("'file_input_ambiguous'"));
  assert.equal((up.match(/setInputFiles\(/g) || []).length, 1, 'העלאה אחת');
  assert.ok(up.includes('#errDiv'), 'שגיאת טעינה מתוך הדיאלוג');
  const conf = fnBody(SESSION, 'export async function confirmDocumentsStep');
  assert.ok(conf.includes('input[type=checkbox][ng-model="vm.isCheckeChatimatBz"]'));
  assert.ok(conf.indexOf("reason: row.poaHasFile ? undefined : 'no_file_listed'") < conf.indexOf('if (checkSpouse)'));
  assert.ok(conf.indexOf('if (checkSpouse)') < conf.indexOf('await clickHemshech(page)'));
  assert.equal((conf.match(/await clickHemshech\(page\)/g) || []).length, 1, '«המשך» אחד בלבד');
});

test('שלב 4 · תיבת בן\\ת הזוג: הטקסט במסך נתפס עם לוכסן הפוך', () => {
  const found = SESSION.match(/\/מאשר[^\n]*?הזוג\/(?=\.test)/g) || [];
  assert.ok(found.length >= 1);
  const re = new RegExp(found[0].slice(1, -1));
  assert.ok(re.test(String.raw`אני מאשר את חתימת בן\ת הזוג על טופס ייפוי הכוח`));
  assert.ok(re.test('אני מאשר את חתימת בן/ת הזוג על טופס ייפוי הכוח'));
});

// ── שלב 5: returnUpload — הראיה היחידה ל«נשלח» ──────────────────────────────

const RETURN_BODY = fill('בקשה לרישום ייפוי כוח חדש מספר בקשה: 2026538930 אישור קליטת מסמכים למיוצג {ID} - {NAME} עכשיו תורנו... אנחנו בודקים כרגע את הקבצים שצירפת');

test('שלב 5 · returnUpload + «אישור קליטת מסמכים למיוצג» + זהות ⇒ נשלח', () => {
  const r = submissionAcceptedEvidence({ hash: '#/returnUpload', body: RETURN_BODY, statusLines: ['בקשתך תיקלט במערכת ותמתין לסיום השהייה'] }, WHO);
  assert.equal(r.ok, true);
  assert.equal(r.requestNumber, '2026538930');
});

test('שלב 5 · בלי המעבר, בלי הכותרת, או לקוח אחר ⇒ לא «נשלח»', () => {
  assert.equal(submissionAcceptedEvidence({ hash: '#/uploadKasafot', body: RETURN_BODY }, WHO).reason, 'did_not_reach_final_step');
  assert.equal(submissionAcceptedEvidence({ hash: '#/returnUpload', body: fill('עכשיו תורנו {ID} {NAME}') }, WHO).reason, 'final_heading_missing');
  assert.equal(submissionAcceptedEvidence({ hash: '#/returnUpload', body: 'אישור קליטת מסמכים למיוצג 312359193 - לזימי שמעון' }, WHO).reason, 'final_screen_identity_unverified');
  assert.equal(wizardStepFromText(RETURN_BODY, ''), 5, 'גם זיהוי השלב מכיר את כותרת ההצלחה');
});

// ── הגבול, פעם אחת, ו«נשלח» רק על ראיה ─────────────────────────────────────

test('סדר · זהות ותוכנית → סימן נגיעה → «+»/העלאה → «המשך» אחד; כשל אחרי הנגיעה = לא ידוע', () => {
  const at = (needle) => { const i = HANDLER.indexOf(needle); assert.ok(i > 0, `חסר: ${needle}`); return i; };
  const gate = at('assertNotAlreadyAttempted(progress');
  const open = at('await openRequestForDocuments(');
  const plan = at('documentsStepPlan(opened.documents');
  const mark = at("markExternalAttempt('upload_signed_form')");
  const upload = at('await uploadSignedForm(');
  const confirm = at('await confirmDocumentsStep(');
  assert.ok(gate < open && open < plan && plan < mark && mark < upload && upload < confirm);
  assert.equal((HANDLER.match(/await uploadSignedForm\(/g) || []).length, 1);
  assert.equal((HANDLER.match(/await confirmDocumentsStep\(/g) || []).length, 1);
  assert.ok(!/for\s*\(|while\s*\(|\.retry|attempt\s*\+\+/.test(HANDLER), 'אין לולאה ואין מונה ניסיונות');
  assert.ok(HANDLER.slice(mark).includes("'ambiguous_submit_result'"));
  assert.ok(HANDLER.includes('checkSpouse: plan.checkSpouse, entityId, expectedClientName: personName'));
});

test('נשלח · submitted=true במקום אחד, אחרי confirmDocumentsStep; ומספר הבקשה נשמר מיד', () => {
  assert.equal((HANDLER.match(/submitted: true,/g) || []).length, 1);
  assert.ok(HANDLER.lastIndexOf('submitted: true,') > HANDLER.indexOf('await confirmDocumentsStep('));
  const conf = fnBody(SESSION, 'export async function confirmDocumentsStep');
  assert.ok(conf.includes('submissionAcceptedEvidence(state'), 'ההצלחה רק מראיית returnUpload');
  const save = HANDLER.indexOf('progress.set({ requestNumber: opened.requestNumber })');
  assert.ok(save > 0 && save < HANDLER.indexOf('if (!opened.ok)'));
  assert.ok(HANDLER.includes('getDocument(ctx.workerId, ctx.job.id, documentId)') && HANDLER.includes('buffer: doc.buffer'));
});
