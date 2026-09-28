// ─── «הזן ייפוי כוח בשע״ם» — שלבים 1–3 נעוצים בקוד האמיתי של שע״ם ────────────
// ‼ 28.09.2026 · הגרסה הקודמת נבנתה מהקלטות מסך ולא הייתה עוברת את שלב 1:
// לא לחצה «המשך» אחרי מספר הישות, הזינה תאריך בלי '/', חיפשה «רשיון» בכתיב
// שגוי, וחיפשה טבלה שלא קיימת בשלב 2. כאן כל עוגן של העובד נבדק מול התבניות
// והבקרים ששע״ם עצמה מריצה (fixtures/shaam-src-2026-09-28). שינוי אצלם ⇒
// הבדיקה נופלת כאן, לא העובד מול לקוח.
//
//   node --test worker/test/shaam-create-steps.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SECONDARY_LABELS, SHAAM_SYSTEM_ROWS, SHAAM_KNOWN_DIALOGS, classifyShaamDialog,
  shaamBirthDateText, shaamEntityId, splitShaamPhone, shaamEmailValid,
} from '../src/shaamRepresentationSession.mjs';

const SRC = new URL('./fixtures/shaam-src-2026-09-28/', import.meta.url);
const read = (p) => readFileSync(new URL(p, SRC), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');
const IMUT = flat(read('imut.template.html'));
const IMUT_CTRL = read('imut.controller.js');
const HAZ = flat(read('hazanatBakasha.template.html'));
const HAZ_CTRL = read('hazanatBakasha.controller.js');
const PIR = flat(read('pirteyHitkashrut.template.html'));
const PIR_CTRL = read('pirteyHitkashrut.controller.js');
const CONSTS = read('JSconstsAndEnum.js');
const FUNCS = read('JSGeneralFuncs.js');
const UI = (n) => flat(read(`shaam-ui/${n}`));

// ── שלב 1 ────────────────────────────────────────────────────────────────────

test('1 · שלושת אמצעי הזיהוי הם בדיוק הטקסט של כפתורי הרדיו במסך', () => {
  for (const label of Object.values(SECONDARY_LABELS)) {
    assert.ok(IMUT.includes(`shaam-radio-buttons btntype="${label}"`), label);
  }
  // ‼ הכתיב שהיה בקוד הקודם — ואינו במסך.
  assert.ok(!IMUT.includes('btntype="מספר רשיון נהיגה"'));
  // הרדיו יושב בתוך <label> — מוצאים אותו לפי הטקסט של ה-label.
  assert.match(UI('shaam-radio-buttons.html'), /<label> <input type="radio"[^>]*>\{\{vm\.radioBtnName\}\} <\/label>/);
});

test('1 · שני שלבים: «המשך» הראשון = checkYeshut, ורק אחריו אימות (checkImut)', () => {
  assert.match(IMUT_CTRL, /v\.imut==!1\?g\(\)/, 'המשך ראשון ⇒ g() ⇒ checkYeshut');
  assert.match(IMUT_CTRL, /NewRequest\/checkYeshut/);
  assert.match(IMUT_CTRL, /v\.showToshavIsrael=!0;v\.imut=!0/, 'קוד 4 ⇒ שאלות האימות מופיעות');
  assert.match(IMUT_CTRL, /case n\.kayamimIzugimPeilim:v\.showErr=!1;o\.go\("hazanatBakasha"\)/, 'קוד 0 ⇒ דילוג לשלב 2 בלי אימות');
  assert.match(IMUT_CTRL, /misProgram=misProgram\.checkImut/);
  assert.ok(IMUT.includes('id="divZehut"') && IMUT.includes('name="yeshut"'));
  assert.ok(IMUT.includes('<div id="imutToshavIsrael" ng-show="vm.showToshavIsrael">'));
  assert.ok(IMUT.includes('btntype="hemshech"'));
});

test('1 · תאריך הלידה נקרא כ-DD/MM/YYYY — ולכן העובד מזין עם לוכסנים', () => {
  assert.match(FUNCS, /function checkDateIsValid\(n\)\{var t=n\.split\("\/"\)/);
  assert.match(IMUT_CTRL, /var n=v\.taarichLeda\.split\("\/"\)/);
  assert.equal(shaamBirthDateText('15031980'), '15/03/1980');
  assert.equal(shaamBirthDateText('1/3/80'), null);
  assert.ok(IMUT.includes('shaam-date-picker'));
  assert.match(UI('shaam-date-picker.html'), /kendo-date-picker/);
});

test('1 · שדה ת.ז. נקלט במודל רק ב-blur — העובד שולח blur ובודק את המודל', () => {
  assert.match(UI('shaam-id-textBox.html'), /ng-model-options="\{ updateOn: 'blur' \}"/);
});

test('1 · הודעות שהמסך מציג לפני שפנה לשרת ≠ «אין התאמה בנתונים»', () => {
  assert.match(CONSTS, /einHathamatNetunim="אין התאמה בנתונים"/);
  assert.match(CONSTS, /tarLedaChaser="יש למלא תאריך לידה"/);
  assert.match(CONSTS, /darconRishTzChaser="יש למלא דרכון, רישיון/);
  assert.match(CONSTS, /tipulMateErr="לא ניתן להמשיך בתהליך האימות עם ישות זו/);
  assert.match(HAZ_CTRL, /u\.getTipulMateErr\(\)==!0&&u\.getKodSibaHashayatMate\(\)!=kodSibaHashayatMate\.myzgChashud&&\(h\.showAttention=!0,h\.attention=tipulMateErr\)/);
});

test('1 · מספר ישות: 9 ספרות עם אפסים מובילים', () => {
  assert.equal(shaamEntityId('34605212'), '034605212');
  assert.equal(shaamEntityId('034-605-212'), '034605212');
  assert.equal(shaamEntityId(''), '');
});

// ── שלב 2 ────────────────────────────────────────────────────────────────────

test('2 · שורות המערכים: הטקסט והשדות במודל — כמו בתבנית', () => {
  for (const [label, f] of Object.entries(SHAAM_SYSTEM_ROWS)) {
    assert.ok(HAZ.includes(`<p>${label}</p>`), label);
    assert.ok(HAZ.includes(`btn-checked="vm.${f.checked}"`), `${label}: ${f.checked}`);
    assert.ok(HAZ.includes(`selected-num="vm.${f.file}"`), `${label}: ${f.file}`);
    assert.ok(HAZ.includes(`selected-val-ddl="vm.${f.repType}.Key"`), `${label}: ${f.repType}`);
  }
  assert.ok(!/<table/i.test(HAZ), 'אין טבלה בשלב 2 — שורות div');
  assert.match(UI('shaam-ddl.html'), /<select kendo-drop-down-list/);
  assert.match(UI('num-only.html'), /ng-model="vm\.selectedNum"/);
});

test('2 · «אישור» רק בודק ופותח «לידיעתך,»; «אישור» בחלונית הוא שיוצר את הבקשה', () => {
  assert.match(HAZ_CTRL, /NewRequest\/checkTikeyMas/);
  assert.ok(HAZ_CTRL.includes('n.respCode==0&&(n.isBzNiftar==1'), 'רק קוד 0 פותח את החלונית');
  assert.ok(HAZ_CTRL.includes('h.isWindowOpen=!0,h.lsAttentionMsgForDialog=n.lsAttentionMsgForDialog'));
  assert.match(HAZ_CTRL, /h\.btok=function\(\)\{[^}]*w\(\)/, 'OK בחלונית ⇒ w()');
  assert.match(HAZ_CTRL, /NewRequest\/createNewIpkRec/);
  assert.ok(HAZ.includes('name="dialogMsgBeforeSave" shaam-window-open'));
  assert.match(UI('shaam-window-open.html'), /btntype="ishur"/);
});

test('2 · החלונית מזוהה לפי הטקסט הקבוע שלה בתבנית', () => {
  const step2 = SHAAM_KNOWN_DIALOGS.find((d) => d.id === 'step2_notice');
  const fixed = ['בהמשך תתבקש לצרף', 'נא לוודא שאלו הנתונים שהנך רוצה להזין'];
  for (const a of fixed) {
    assert.ok(step2.anchors.includes(a), a);
    assert.ok(HAZ.includes(a), `בתבנית: ${a}`);
  }
  const shown = '× לידיעתך, שים לב, ממועד טעינת המסמכים תקלט הבקשה בהמשך תתבקש לצרף: טופס ייפוי כוח חתום נא לוודא שאלו הנתונים שהנך רוצה להזין. אישור ביטול';
  assert.equal(classifyShaamDialog(shown).id, 'step2_notice');
});

test('2 · סוג ייצוג «ראשי» נרשם רק כשהמפתח הוא המחרוזת "1" (switch קפדני)', () => {
  assert.match(HAZ_CTRL, /l=function\(n,t,i,r\)\{switch\(n\)\{case"1":/);
});

// ── שלב 3 ────────────────────────────────────────────────────────────────────

test('3 · טלפון מיוצג: קידומת מהרשימה + 7 ספרות; חובה כשאין מאומת', () => {
  assert.ok(PIR.includes('<p class="required"> טלפון מיוצג:</p>'));
  assert.match(PIR_CTRL, /!a\.isPhoneMeumat&&\(a\.pirteyHitkashrut\.telephoneMeuzag\.length!=7\|\|a\.pirteyHitkashrut\.kidomet=="נא לבחור"\)/);
  assert.match(UI('shaam-ddl-kidometnumber.html'), /<input kendo-drop-down-list/);
  assert.deepEqual(splitShaamPhone('050-1234567'), { prefix: '050', number: '1234567' });
  assert.deepEqual(splitShaamPhone('+972 52 440 9230'), { prefix: '052', number: '4409230' });
  assert.deepEqual(splitShaamPhone('02-6543210'), { prefix: '02', number: '6543210' });
  for (const bad of ['', '05', '524409230', '050123456789']) assert.equal(splitShaamPhone(bad), null, bad);
});

test('3 · טלפון בן/ת זוג: מוצג לפי netuneiBz, חובה רק בחתימה משותפת', () => {
  assert.ok(PIR.includes('<p>טלפון בן\\ת זוג:</p>') && PIR.includes('<p class="required"> טלפון בן\\ת זוג:</p>'));
  assert.match(PIR_CTRL, /case n\.bzKayamChovatChatima:a\.bz\.hatzagatBz=!0;a\.bz\.chovatChatimatBz=!0/);
  assert.match(PIR_CTRL, /!a\.isPhoneBZMeumat&&a\.bz\.chovatChatimatBz==!0&&a\.pirteyHitkashrut\.telephoneBz==""/);
});

test('3 · ההסכמה היא חלק מהשמירה, ו«שמירה» פותחת את הטופס ב-window.open', () => {
  assert.ok(PIR.includes("btntype='הלקוח מאשר קבלת הודעות מרשות המסים באמצעות מסרון או דואר אלקטרוני'"));
  assert.match(PIR_CTRL, /a\.cbIshur==!1\)\{a\.err="חובה לסמן שהלקוח מאשר קבלת הודעות"/);
  assert.match(PIR_CTRL, /NewRequest\/updatePirteyHitkashrut/);
  assert.match(PIR_CTRL, /getUrlToDisplayPDF\(o\.CreateAsmachtaReport,t\);window\.open\(i\)/);
  assert.match(read('shaam-pdf-viewer.js'), /\/ShaamPdfStreamerApi\/api\/getpdftoview\?isFileTypeFromApi=/);
  assert.ok(PIR.includes('btntype="shmira"'));
});

test('3 · דוא"ל: אותו ביטוי כמו בשע״ם; לא תקין ⇒ לא ממלאים (השדה רשות)', () => {
  assert.equal(shaamEmailValid('client@example.co.il'), true);
  assert.equal(shaamEmailValid('bad@'), false);
  assert.equal(shaamEmailValid(''), false);
});

test('menu · «בקשה חדשה» = #/imut', () => {
  const m = JSON.parse(read('menu.json'));
  assert.equal(m.menuSons.find((x) => x.name === 'בקשה חדשה')?.url, '#/imut');
});
