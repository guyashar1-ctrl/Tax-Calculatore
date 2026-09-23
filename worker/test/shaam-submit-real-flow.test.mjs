// ─── שידור טופס 2279 חתום — הזרימה האמיתית (23.09.2026) ─────────────────────
// ‼ מקור האמת: צילומי המסך של הבקשה של הדסה סלע (2026538930), אחרי שהניסיון
// החי הראשון נעצר ברשימה, לפני כל לחיצה:
//   רשימה → שורת מס הכנסה → חץ «טעינת מסמכים» → «פרטי התקשרות למיוצג
//   034605212 - סלע הדסה» (מספר בקשה מוצג) → «המשך» → «טעינת מסמכים למיוצג
//   034605212 - סלע הדסה» → «+» של «טופס ייפוי כוח» → PDF → תיבת בן/ת הזוג
//   (רק אם הוכחה) → «המשך» אחד → שלב 5.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  pickUploadDocumentsControl, openedRequestIdentity, documentsStepPlan,
} from '../src/shaamRepresentationSession.mjs';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const HANDLER = src('../src/handlers/shaamSubmitPoa.mjs');
const SESSION = src('../src/shaamRepresentationSession.mjs');
const fnBody = (s, sig) => { const i = s.indexOf(sig); assert.ok(i >= 0, sig); return s.slice(i, s.indexOf('\n}', i)); };

/** עמודת «פעולות» בשורת מס הכנסה של הדסה — PDF, מחיקה, פירוט, וחץ ההעלאה. */
const ACTIONS = [
  { attrText: 'צפייה בקובץ PDF', classText: 'fa fa-file-pdf-o', tooltip: '' },
  { attrText: 'מחיקת בקשה', classText: 'fa fa-times', tooltip: '' },
  { attrText: 'פירוט', classText: 'fa fa-file-text-o', tooltip: '' },
  { attrText: '', classText: 'fa fa-upload', tooltip: 'טעינת מסמכים' },
];

// ── 1 · הפקד הנכון בשורה ────────────────────────────────────────────────────

test('1 · חץ «טעינת מסמכים» נבחר — לא PDF, לא מחיקה, לא פירוט', () => {
  const r = pickUploadDocumentsControl(ACTIONS);
  assert.equal(r.ok, true);
  assert.equal(r.index, 3);
});

test('1ב · הכרזה ב-title (בלי ריחוף) — אותו פקד', () => {
  const r = pickUploadDocumentsControl([ACTIONS[0], { attrText: 'טעינת מסמכים', classText: 'icon', tooltip: '' }]);
  assert.deepEqual([r.ok, r.index], [true, 1]);
});

test('1ג · אף פקד לא מכריז «טעינת מסמכים» ⇒ עצירה; שניים ⇒ עצירה', () => {
  assert.equal(pickUploadDocumentsControl(ACTIONS.slice(0, 3)).reason, 'upload_action_not_found');
  const two = [...ACTIONS, { attrText: '', classText: 'k-i-upload', tooltip: 'טעינת מסמכים' }];
  assert.equal(pickUploadDocumentsControl(two).reason, 'upload_action_ambiguous');
});

test('1ד · tooltip «טעינת מסמכים» שדלף לפקד מחיקה/PDF — לא נבחר', () => {
  const leaked = [
    { attrText: 'מחיקת בקשה', classText: 'fa fa-times', tooltip: 'טעינת מסמכים' },
    { attrText: 'צפייה בקובץ PDF', classText: 'fa-file-pdf-o', tooltip: 'טעינת מסמכים' },
  ];
  assert.equal(pickUploadDocumentsControl(leaked).ok, false);
});

// ── 2/3/11 · הבקשה שנפתחה: זהות + מספר בקשה ─────────────────────────────────

const CONTACT_SCREEN = 'בקשה לרישום ייפוי כוח חדש מספר בקשה: 2026538930 פרטי התקשרות למיוצג 034605212 - סלע הדסה טלפון נייד';
const WHO = { entityId: '034605212', expectedClientName: 'הדסה סלע' };

test('2/3 · המסך שנפתח — ת.ז. ושם מאומתים, ומספר הבקשה נקרא ממנו', () => {
  const r = openedRequestIdentity(CONTACT_SCREEN, WHO);
  assert.equal(r.ok, true);
  assert.equal(r.requestNumber, '2026538930');
});

test('11 · לקוח/תיק אחר במסך שנפתח ⇒ עצירה', () => {
  assert.equal(openedRequestIdentity('מספר בקשה: 2026495063 פרטי התקשרות למיוצג 312359193 - לזימי שמעון', WHO).ok, false);
  // ‼ שם נכון בלי ת.ז. (או ת.ז. בלי שם) אינו מספיק לפעולה משנה.
  assert.equal(openedRequestIdentity('פרטי התקשרות למיוצג - סלע הדסה', WHO).ok, false);
  assert.equal(openedRequestIdentity('פרטי התקשרות למיוצג 034605212', WHO).ok, false);
});

test('3 · בלי מספר בקשה במסך שנפתח ⇒ לא ממשיכים (עוגן הזהות היחיד של הבקשה)', () => {
  const fn = fnBody(SESSION, 'export async function openRequestForDocuments');
  assert.ok(fn.includes("reason: 'request_number_not_on_screen'"));
  assert.ok(fn.includes("reason: 'opened_wrong_request'"), 'מספר ידוע שאינו תואם ⇒ עצירה');
});

// ── 4 · פרטי התקשרות → «המשך», בלי לשנות דבר ───────────────────────────────

test('4 · שלב 3: «המשך» — ובלי מילוי שדות או לחיצה על «שמירה»', () => {
  const fn = fnBody(SESSION, 'export async function openRequestForDocuments');
  const step3 = fn.slice(fn.indexOf('if (step === 3)'), fn.indexOf('if (step !== 4)'));
  assert.ok(step3.includes("clickExact(page, 'המשך')"));
  for (const forbidden of ['setValue', 'fillContactDetails', "'שמירה'", 'setInputFiles', '.check(']) {
    assert.ok(!step3.includes(forbidden), `שלב פרטי ההתקשרות אינו משנה דבר (${forbidden})`);
  }
  assert.ok(fn.indexOf('openedRequestIdentity(') < fn.indexOf('if (step === 3)'), 'הזהות נבדקת לפני «המשך»');
});

// ── 5/6/8/9/13 · מסך טעינת המסמכים ──────────────────────────────────────────

const DOCS_OK = { identityOk: true, poaRows: 1, poaHasFile: false, plusControls: 1, spouseCheckboxes: 1 };

test('5/6 · «טופס ייפוי כוח» אחד, «+» אחד ⇒ ממשיכים', () => {
  assert.deepEqual(documentsStepPlan({ ...DOCS_OK, spouseCheckboxes: 0 }), { ok: true, checkSpouse: false });
  assert.equal(documentsStepPlan({ ...DOCS_OK, poaRows: 0 }).reason, 'poa_row_not_found');
  assert.equal(documentsStepPlan({ ...DOCS_OK, poaRows: 2 }).reason, 'poa_row_ambiguous');
  assert.equal(documentsStepPlan({ ...DOCS_OK, plusControls: 0 }).reason, 'upload_opener_not_found');
  assert.equal(documentsStepPlan({ ...DOCS_OK, plusControls: 2 }).reason, 'upload_opener_ambiguous');
  assert.equal(documentsStepPlan({ ...DOCS_OK, identityOk: false }).reason, 'documents_screen_identity_unverified');
});

test('8 · נשואים + חתימות הוכחו ⇒ התיבה תסומן', () => {
  assert.deepEqual(documentsStepPlan(DOCS_OK, { spouseSignatureConfirmed: true }), { ok: true, checkSpouse: true });
});

test('9 · התיבה מוצגת ו-PIVO לא הוכיחה חתימת בן/בת זוג ⇒ עצירה לפני העלאה', () => {
  assert.equal(documentsStepPlan(DOCS_OK, { spouseSignatureConfirmed: false }).reason, 'spouse_signature_not_proven');
  assert.equal(documentsStepPlan(DOCS_OK, {}).reason, 'spouse_signature_not_proven');
  assert.equal(documentsStepPlan({ ...DOCS_OK, spouseCheckboxes: 2 }, { spouseSignatureConfirmed: true }).reason, 'spouse_checkbox_ambiguous');
});

test('13 · כבר מופיע קובץ בשורת «טופס ייפוי כוח» ⇒ לא מעלים שוב', () => {
  assert.equal(documentsStepPlan({ ...DOCS_OK, poaHasFile: true }, { spouseSignatureConfirmed: true }).reason, 'poa_already_uploaded');
});

test('8ב · התיבה מסומנת רק בנתיב שבו התוכנית אישרה, ורק אחרי שהקובץ מופיע', () => {
  const fn = fnBody(SESSION, 'export async function confirmDocumentsStep');
  assert.ok(fn.indexOf("reason: 'no_file_listed'") < fn.indexOf('if (checkSpouse)'), 'קודם הקובץ בשורה');
  assert.ok(fn.indexOf('if (checkSpouse)') < fn.indexOf("clickExact(page, 'המשך')"), 'התיבה לפני «המשך»');
  assert.ok(HANDLER.includes('checkSpouse: plan.checkSpouse'), 'הדגל מגיע מהתוכנית בלבד');
});

// ── 7/12/14 · גבול הנגיעה, קובץ אחד, «המשך» אחד, «נשלח» רק על ראיה ─────────

test('7 · הקובץ שנטען הוא המסמך החתום שהתבקש — משיכה אחת, העלאה אחת', () => {
  assert.equal((HANDLER.match(/await getDocument\(/g) || []).length, 1);
  assert.ok(HANDLER.includes('getDocument(ctx.workerId, ctx.job.id, documentId)'));
  assert.ok(HANDLER.includes('buffer: doc.buffer'));
  const up = fnBody(SESSION, 'export async function uploadSignedForm');
  assert.equal((up.match(/setInputFiles\(/g) || []).length, 1);
  assert.ok(up.includes("'file_input_ambiguous'"), 'שדה קובץ אחד בלבד');
});

test('12 · סדר: זהות ותוכנית → סימן נגיעה → «+»/העלאה → «המשך» אחד; כשל אחרי הנגיעה = לא ידוע', () => {
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
  const conf = fnBody(SESSION, 'export async function confirmDocumentsStep');
  assert.equal((conf.match(/clickExact\(page, 'המשך'\)/g) || []).length, 1, '«המשך» אחד בלבד');
});

test('14 · submitted=true רק אחרי ראיית שלב 5, במקום אחד', () => {
  assert.equal((HANDLER.match(/submitted: true,/g) || []).length, 1);
  assert.ok(HANDLER.lastIndexOf('submitted: true,') > HANDLER.indexOf('await confirmDocumentsStep('));
  const conf = fnBody(SESSION, 'export async function confirmDocumentsStep');
  assert.ok(conf.includes('if (step !== 5)'));
});

test('3ב · מספר הבקשה שנקרא נשמר ב-progress לפני כל עצירה, ומוחזר בתוצאה', () => {
  const save = HANDLER.indexOf('progress.set({ requestNumber: opened.requestNumber })');
  assert.ok(save > 0 && save < HANDLER.indexOf('if (!opened.ok)'), 'נשמר גם כשעוצרים');
  assert.ok(HANDLER.includes('requestNumber: opened.requestNumber || requestNumber'));
});

test('15 · הדסה סלע: שורת מס הכנסה של בקשה 2026538930, תיק 034605212', () => {
  const fn = fnBody(SESSION, 'export async function openRequestForDocuments');
  assert.ok(fn.includes("systemLabel = 'מס הכנסה'"), 'השורה שנלחצת היא של מס הכנסה');
  assert.ok(fn.includes('singleAttributedRequest(found.rows)'), 'בקשה אחת בלבד לאדם');
  const r = openedRequestIdentity(
    'טעינת מסמכים למיוצג 034605212 - סלע הדסה יש לטעון את המסמכים הבאים: טופס ייפוי כוח מספר בקשה: 2026538930', WHO);
  assert.deepEqual([r.ok, r.requestNumber], [true, '2026538930']);
});

// ── 16 · ה-DOM החי של עמודת «פעולות» (נקרא ב-23.09.2026, שורת מס הכנסה של הדסה) ──
// ‼ הניסיון השני נעצר כאן: החץ הוא <input type="button">, והתווית שלו בתכונה
// k-content — לא a/button/img ולא title. הרשימה כאן היא בדיוק מה שנמצא בתא.
import { wizardStepFromText } from '../src/shaamRepresentationSession.mjs';

const LIVE_ACTIONS = [
  { attrText: "'אירועים קודמים'", classText: 'col-sm-1 icon details_icon ng-scope', hidden: false, tooltip: '' },
  { attrText: "'ביטול הבקשה'", classText: 'col-sm-1 icon xmark ng-scope', hidden: false, tooltip: '' },
  { attrText: '', classText: 'col-sm-1 icon ng-hide', hidden: true, tooltip: '' },
  { attrText: "'טעינת מסמכים'", classText: 'col-sm-1 icon upload ng-scope', hidden: false, tooltip: '' },
  { attrText: "'שחזור בקשה/PDF'", classText: 'col-sm-1 icon adobe_pdf ng-scope', hidden: false, tooltip: '' },
  { attrText: "'ניתן לשחזר את הטופס רק לאחר מילוי פרטי התקשרות'", classText: 'col-sm-1 noclick icon adobe_pdf ng-scope ng-hide', hidden: true, tooltip: '' },
  { attrText: "'הצגת מסמכים'", classText: 'col-sm-1 icon powerp ng-scope ng-hide', hidden: true, tooltip: '' },
];

test('16 · ה-DOM החי: נבחר <input class="icon upload"> — לא «ביטול הבקשה», לא PDF, לא «אירועים קודמים»', () => {
  const r = pickUploadDocumentsControl(LIVE_ACTIONS);
  assert.deepEqual([r.ok, r.index], [true, 3]);
});

test('16ב · פקד מוסתר (ng-hide) אינו מועמד, גם אם הוא אומר «טעינת מסמכים»', () => {
  const hiddenOnly = LIVE_ACTIONS.map((c, i) => (i === 3 ? { ...c, hidden: true } : c));
  assert.equal(pickUploadDocumentsControl(hiddenOnly).reason, 'upload_action_not_found');
});

test('16ג · המועמדים נקראים גם מ-input/div עם type=button, והתווית גם מ-k-content', () => {
  const line = SESSION.split('\n').find((l) => l.startsWith('export const ACTION_CANDIDATES = ')) ?? '';
  for (const sel of ['input[type=button]', '[type=button]', '[kendo-tooltip]']) {
    assert.ok(line.includes(sel), `חסר ${sel} ברשימת המועמדים`);
  }
  const d = fnBody(SESSION, 'export async function describeActionCandidates');
  assert.ok(d.includes("'k-content'"), 'התווית של Kendo');
  assert.ok(d.includes('ng-hide'), 'גלויות בלבד');
  const fn = fnBody(SESSION, 'export async function openRequestForDocuments');
  assert.ok(fn.includes('describeActionCandidates(rowLoc)') && fn.includes('locator(ACTION_CANDIDATES).nth(pick.index)'), 'הזרימה משתמשת באותו קורא');
});

// ── 17 · שלב האשף: רצועת השלבים אינה כותרת ──────────────────────────────────

const STRIP = '1 אימות ישות 2 בקשת ייפוי כוח 3 פרטי התקשרות 4 טעינת מסמכים 5 השהייה וסיום';
const DOCS_PAGE = `בקשה לרישום ייפוי כוח חדש מספר בקשה: 2026538930 ${STRIP} טעינת מסמכים למיוצג 034605212 - סלע הדסה יש לטעון את המסמכים הבאים: * טופס ייפוי כוח + אני מאשר את חתימת בן\ת הזוג על טופס ייפוי הכוח המשך חזרה`;
const CONTACT_PAGE = `בקשה לרישום ייפוי כוח חדש מספר בקשה: 2026538930 ${STRIP} פרטי התקשרות למיוצג 034605212 - סלע הדסה המשך חזרה`;

test('17 · מסך טעינת המסמכים האמיתי ⇒ שלב 4 (לא 1 בגלל «אימות ישות» ברצועה)', () => {
  assert.equal(wizardStepFromText(DOCS_PAGE, STRIP), 4);
  assert.equal(wizardStepFromText(CONTACT_PAGE, STRIP), 3);
});

test('17ב · «השהייה וסיום» נחשב שלב 5 רק מחוץ לרצועה — אחרת «לא ידוע», לעולם לא «נשלח»', () => {
  assert.equal(wizardStepFromText(`${STRIP} שגיאה כללית`, STRIP), 0);
  assert.equal(wizardStepFromText(`${STRIP} שגיאה כללית`, ''), null);
  assert.equal(wizardStepFromText(`${STRIP} השהייה וסיום למיוצג 034605212 - סלע הדסה`, STRIP), 5);
  // בלי רצועה שהוסרה בפועל — לא מכריזים על 5.
  assert.notEqual(wizardStepFromText('השהייה וסיום', ''), 5);
});

test('17ג · תיבת בן/ת הזוג כפי שמופיעה במסך (לוכסן הפוך) נתפסת — הביטוי נלקח מהקוד עצמו', () => {
  // ‼ לא משכפלים את הביטוי: מוציאים אותו מהמקור, כך שהבדיקה בודקת את מה שרץ.
  const found = SESSION.match(/\/מאשר[^\n]*?הזוג\/(?=\.test)/g) || [];
  assert.equal(found.length, 3, 'אותו ביטוי: קריאה, סימון, וזיהוי הטקסט במסך');
  assert.ok(found.every((x) => x === found[0]), 'אין שתי גרסאות של אותו ביטוי');
  const re = new RegExp(found[0].slice(1, -1));
  const screenLabel = String.raw`אני מאשר את חתימת בן\ת הזוג על טופס ייפוי הכוח`;
  assert.ok(screenLabel.includes('\\'), 'הלייבל כולל לוכסן הפוך, כמו בצילום');
  assert.ok(re.test(screenLabel));
  assert.ok(re.test('אני מאשר את חתימת בן/ת הזוג על טופס ייפוי הכוח'));
  assert.ok(!re.test('אני מאשר את פרטי ההתקשרות'));
});

test('17ד · המסך מבקש לאשר את חתימת בן/ת הזוג והתיבה לא נמצאה ⇒ עצירה לפני העלאה', () => {
  const r = documentsStepPlan({ ...DOCS_OK, spouseCheckboxes: 0, spouseLabelOnScreen: true }, { spouseSignatureConfirmed: true });
  assert.equal(r.reason, 'spouse_checkbox_not_found');
});

test('17ה · שורת «טופס ייפוי כוח» נמצאת מהתווית עצמה ועולה עד ה-«+» — פונקציה אחת לקריאה, ללחיצה ולאישור', () => {
  assert.ok(SESSION.includes('function poaRowProbe(mode)'));
  assert.equal((SESSION.match(/page\.evaluate\(poaRowProbe, 'read'\)/g) || []).length, 2, 'קריאה לפני הנגיעה + אישור אחריה');
  assert.equal((SESSION.match(/page\.evaluate\(poaRowProbe, 'clickPlus'\)/g) || []).length, 1, 'לחיצה אחת בלבד');
  const probe = fnBody(SESSION, 'function poaRowProbe(mode)');
  assert.ok(probe.includes("if (out.plusControls !== 1) return { ...out, clicked: false };"), 'לא לוחצים כש-«+» אינו יחיד');
});
