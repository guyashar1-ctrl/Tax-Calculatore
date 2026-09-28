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
  NEVER_CLICK_BTNTYPES, pickUploadFileInput, pickDialogCloseButton, uploadDialogEvidence,
} from '../src/shaamRepresentationSession.mjs';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const HANDLER = src('../src/handlers/shaamSubmitPoa.mjs');
const SESSION = src('../src/shaamRepresentationSession.mjs');
const fnBody = (s, sig) => { const i = s.indexOf(sig); assert.ok(i >= 0, sig); return s.slice(i, s.indexOf('\n}', i)); };
const LIST_ROW = JSON.parse(src('./fixtures/shaam-list-row.live.json'));
const CONTACT = JSON.parse(src('./fixtures/shaam-contact-step.live.json'));
const DIALOG = JSON.parse(src('./fixtures/shaam-upload-dialog.json'));

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
  // ‼ 28.09 · קודם «הבקשה הנוכחית» (מספר שמור, או החיה היחידה) — ורק עליה singleAttributedRequest.
  assert.ok(fn.includes("systemLabel = 'מס הכנסה'") && fn.includes('currentRequestRows(found.rows, { requestNumber: want })') && fn.includes('singleAttributedRequest(current.rows)'));
  assert.ok(fn.includes('request_not_awaiting_documents'), 'לא מחפשים פקד טעינה בבקשה שאינה ממתינה למסמכים');
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
// ‼ 204 · המסך נקרא כשורות (לא רק «טופס ייפוי כוח»), והבעלים נקרא מהכותרת.

const POA_ROW = { label: 'טופס ייפוי כוח', required: true, uploadName: '', hasFile: false, plusControls: 1 };
const ID_ROW = { label: 'תצלום תעודת זהות או רישיון נהיגה', required: true, uploadName: '', hasFile: false, plusControls: 1 };
const DOCS_OK = {
  identityOk: true, headerEntityId: ID, expectedEntityId: ID, rows: [POA_ROW],
  spouseCheckboxes: 1, spouseLabelOnScreen: true, continueButtons: 1,
};

test('שלב 4 · שורה אחת, «+» אחד, «המשך» אחד ⇒ ממשיכים; כל סטייה ⇒ עצירה לפני הנגיעה', () => {
  const ok = documentsStepPlan({ ...DOCS_OK, spouseCheckboxes: 0, spouseLabelOnScreen: false });
  assert.deepEqual([ok.ok, ok.checkSpouse, ok.extraSlots.length, ok.entityId], [true, false, 0, ID]);
  assert.equal(documentsStepPlan({ ...DOCS_OK, rows: [] }).reason, 'poa_row_not_found');
  assert.equal(documentsStepPlan({ ...DOCS_OK, rows: [POA_ROW, POA_ROW] }).reason, 'document_row_ambiguous');
  assert.equal(documentsStepPlan({ ...DOCS_OK, rows: [{ ...POA_ROW, plusControls: 0 }] }, { spouseSignatureConfirmed: true }).reason, 'upload_opener_not_found');
  assert.equal(documentsStepPlan({ ...DOCS_OK, identityOk: false }).reason, 'documents_screen_identity_unverified');
  assert.equal(documentsStepPlan({ ...DOCS_OK, continueButtons: 0 }, { spouseSignatureConfirmed: true }).reason, 'continue_not_found');
});

test('שלב 4 · שע״ם דורשת מסמך נוסף ⇒ התוכנית מזהה את השורה (לא עוצרת כאן) — ההחלטה על המסמך נפרדת', () => {
  const r = documentsStepPlan({ ...DOCS_OK, rows: [POA_ROW, ID_ROW] }, { spouseSignatureConfirmed: true });
  assert.equal(r.ok, true);
  assert.deepEqual(r.extraSlots.map((s) => [s.id, s.kind]), [[2, 'idOrLicense']]);
});

test('שלב 4 · כבר נטען קובץ לשורה ⇒ לא מעלים שוב', () => {
  assert.equal(documentsStepPlan({ ...DOCS_OK, rows: [{ ...POA_ROW, hasFile: true }] }, { spouseSignatureConfirmed: true }).reason, 'poa_already_uploaded');
  assert.equal(documentsStepPlan({ ...DOCS_OK, rows: [POA_ROW, { ...ID_ROW, hasFile: true }] }, { spouseSignatureConfirmed: true }).reason, 'row_already_populated');
});

test('שלב 4 · נשואים + הוכחה ⇒ התיבה תסומן; בלי הוכחה / בלי תיבה / שתי תיבות ⇒ עצירה', () => {
  const ok = documentsStepPlan(DOCS_OK, { spouseSignatureConfirmed: true });
  assert.deepEqual([ok.ok, ok.checkSpouse], [true, true]);
  assert.equal(documentsStepPlan(DOCS_OK, { spouseSignatureConfirmed: false }).reason, 'spouse_signature_not_proven');
  assert.equal(documentsStepPlan({ ...DOCS_OK, spouseCheckboxes: 0 }, { spouseSignatureConfirmed: true }).reason, 'spouse_checkbox_not_found');
  assert.equal(documentsStepPlan({ ...DOCS_OK, spouseCheckboxes: 2 }, { spouseSignatureConfirmed: true }).reason, 'spouse_checkbox_ambiguous');
});

test('שלב 4 · הבוררים לקוחים מהתבנית: .BoxA, input.plus, דיאלוג לפי id, ng-model של התיבה', () => {
  const probe = fnBody(SESSION, 'function docRowsProbe(arg)');
  assert.ok(probe.includes("querySelectorAll('.BoxA')") && probe.includes("input[type=button].plus"));
  assert.ok(probe.includes('.icon.checkmark') && probe.includes("querySelector('u')"), 'V + שם הקובץ = נטען');
  assert.ok(probe.includes("reason: 'row_already_populated'"), 'שורה עם קובץ ⇒ לא לוחצים «+»');
  assert.ok(SESSION.includes("dialog: 'dialogTeinatAsmachta'"));
  const up = fnBody(SESSION, 'export async function uploadIntoSlot');
  assert.equal(up.split('setInputFiles(').length - 1, 1, 'העלאה אחת לשורה');
  assert.ok(up.includes("dialog.locator('input[type=file]').nth(inputIndex)"), 'ה-input שנבחר לפני הנגיעה');
  const conf = fnBody(SESSION, 'export async function confirmDocumentsStep');
  assert.ok(conf.includes('input[type=checkbox][ng-model="vm.isCheckeChatimatBz"]'));
  assert.ok(conf.indexOf("reason: 'no_file_listed'") < conf.indexOf('if (checkSpouse)'));
  assert.ok(conf.indexOf("reason: 'document_rows_changed'") < conf.indexOf('if (checkSpouse)'), 'שורה חדשה שהופיעה ⇒ לא ממשיכים');
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

test('סדר · זהות ותוכנית → מסמכים (שרת) → בדיקת דיאלוגים → שומר → סימן נגיעה → העלאה → «המשך» אחד', () => {
  const at = (needle) => { const i = HANDLER.indexOf(needle); assert.ok(i > 0, `חסר: ${needle}`); return i; };
  const gate = at('assertNotAlreadyAttempted(progress');
  const open = at('await openRequestForDocuments(');
  const report = at('shaamDocuments: {');
  const plan = at('documentsStepPlan(docsState');
  const docs = at('getIdentityDocument(ctx.workerId, ctx.job.id');
  const decide = at('documentsSubmissionDecision(resolved');
  const inspect = at('await inspectSlotDialog(page, x.slot)');
  const guard = at("throw documentsStop('first_live_verification'");
  const poaDlg = at('await openSlotUploadDialog(page, poaSlot)');
  const mark = at("markExternalAttempt('upload_signed_form')");
  const upload = at('await uploadIntoSlot(page, poaSlot');
  const confirm = at('await confirmDocumentsStep(');
  assert.ok(gate < open && open < report && report < plan && plan < docs && docs < decide
    && decide < inspect && inspect < guard && guard < poaDlg && poaDlg < mark && mark < upload && upload < confirm);
  assert.equal((HANDLER.match(/await confirmDocumentsStep\(/g) || []).length, 1);
  // ‼ אין לולאת ניסיונות: הלולאות היחידות עוברות על שורות המסמכים, פעם אחת כל אחת.
  assert.ok(!/while\s*\(|\.retry|attempt\s*\+\+|attempts\s*\+/.test(HANDLER), 'אין לולאת ניסיון חוזר');
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

// ── דיאלוג הטעינה (תבנית shaam-file-upload + צילום המסך) ─────────────────────

test('דיאלוג · שני input[type=file]: myFile (גלוי) נבחר, myFile1 (mode==3, מוסתר) לא — זה מה שעצר את ניסיון 4', () => {
  assert.deepEqual(pickUploadFileInput(DIALOG.beforeSelection.inputs), { ok: true, index: 0 });
  const both = DIALOG.beforeSelection.inputs.map((x) => ({ ...x, containerVisible: true, name: 'myFile' }));
  assert.equal(pickUploadFileInput(both).reason, 'file_input_ambiguous');
  assert.equal(pickUploadFileInput([{ name: 'myFile1', containerVisible: true }]).reason, 'file_input_not_found');
  assert.equal(pickUploadFileInput([{ name: 'myFile', containerVisible: true, disabled: true }]).reason, 'file_input_not_found');
});

test('דיאלוג · «סגירה» הוא כפתור התחתית עם הטקסט — לא ה-×; מוסתר/כפול ⇒ עצירה', () => {
  assert.deepEqual(pickDialogCloseButton(DIALOG.beforeSelection.buttons), { ok: true, index: 1 });
  assert.equal(pickDialogCloseButton([{ text: '×', visible: true }]).reason, 'close_button_not_found');
  assert.equal(pickDialogCloseButton([{ text: 'סגירה', visible: false }]).reason, 'close_button_not_found');
  assert.equal(pickDialogCloseButton([{ text: 'סגירה', visible: true }, { text: 'סגירה', visible: true }]).reason, 'close_button_ambiguous');
});

test('דיאלוג · ראיית העלאה: קובץ PDF אחד ברשימה ⇒ נטען; שגיאה ⇒ נדחה; כלום ⇒ ממתין; שניים ⇒ עצירה', () => {
  assert.equal(uploadDialogEvidence(DIALOG.beforeSelection, 'x.pdf').state, 'pending');
  const up = uploadDialogEvidence(DIALOG.afterUpload, 'הדסה סלע - ייפוי כוח חתום.pdf');
  assert.deepEqual([up.state, up.uploadName, up.sameName], ['uploaded', 'הדסה סלע - ייפוי כוח חתום.pdf', true]);
  assert.equal(uploadDialogEvidence(DIALOG.uploadError, 'x.pdf').state, 'rejected');
  assert.equal(uploadDialogEvidence({ files: ['a.pdf', 'b.pdf'] }, 'a.pdf').state, 'ambiguous');
  assert.equal(uploadDialogEvidence({ files: ['a.docx'] }, 'a.docx').state, 'pending', 'לא PDF אינו «נטען»');
});

test('דיאלוג · הגבול: «+» ופתיחת הדיאלוג לפני הסימן; בחירת הקובץ אחריו; השורה מאומתת אחרי «סגירה»', () => {
  const at = (needle) => { const i = HANDLER.indexOf(needle); assert.ok(i > 0, `חסר: ${needle}`); return i; };
  const plan = at('documentsStepPlan(docsState');
  const open = at('await openSlotUploadDialog(page, poaSlot)');
  const mark = at("markExternalAttempt('upload_signed_form')");
  const upload = at('await uploadIntoSlot(page, poaSlot');
  assert.ok(plan < open && open < mark && mark < upload);
  assert.ok(HANDLER.includes('inputIndex: dlg.inputIndex'));
  const opener = fnBody(SESSION, 'export async function openSlotUploadDialog');
  assert.ok(!opener.includes('setInputFiles'), 'פתיחת הדיאלוג אינה בוחרת קובץ');
  assert.ok(opener.includes('dialogMatchesSlot(d, slot)') && opener.includes('pickUploadFileInput(d.inputs)'));
  assert.ok(opener.includes("'poa_already_uploaded'"), 'קובץ כבר בדיאלוג ⇒ לא מעלים שני');
  const up = fnBody(SESSION, 'export async function uploadIntoSlot');
  assert.ok(up.indexOf('uploadDialogEvidence(') < up.indexOf('closeSlotDialog('), 'קודם ראיה, אחר כך «סגירה»');
  assert.ok(up.includes("reason: 'row_not_updated'") && up.includes("reason: 'row_file_mismatch'"), 'השורה אחרי הסגירה');
});
