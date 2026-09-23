// ─── בדיקות העובד: ייצוג בשע״ם ───────────────────────────────────────────────
// ‼ מה שנבדק כאן הוא בדיוק מה שמסוכן לשבור בשקט בצד הדפדפן: אילו חלוניות
// מותר לאשר, מה חוסם פנייה חיצונית, ומתי מותר להכריז «הכול נקלט».
// ‼ אין כאן Playwright ואין רשת — רק הפונקציות הטהורות.
//
//   node --test worker/test/shaam-representation.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyShaamDialog, SHAAM_KNOWN_DIALOGS } from '../src/shaamRepresentationSession.mjs';
import { validate } from '../src/handlers/shaamCreateRepresentation.mjs';
import { allRowsAccepted } from '../src/handlers/shaamCheckRepresentation.mjs';
import { attributeRows } from '../src/shaamRepresentationSession.mjs';
import { PermanentError } from '../src/errors.mjs';
import { readFileSync } from 'node:fs';

// ── 13–14: חלוניות ──────────────────────────────────────────────────────────

test('13 · החלונית המוכרת של שלב 2 מאושרת', () => {
  const text = 'לידיעתך, שים לב, הבקשה תקלט רק לאחר פתיחת התיק במשרד או במערכת מפת"ח. '
    + 'בתום חמישים ימי עסקים ממועד טעינת המסמכים תקלט הבקשה. '
    + 'הלקוח יכול לקצר את מועד קליטת ייפוי הכוח, באמצעות לחיצה על הקישור שיקבל במסרון. '
    + 'בהמשך תתבקש לצרף: טופס ייפוי כוח חתום וכן מומלץ להחתים את בן הזוג השני.';
  const r = classifyShaamDialog(text);
  assert.equal(r.known, true);
  assert.equal(r.id, 'step2_notice');
});

test('13ב · אזהרת מע"מ («אינו עוסק מורשה») מאושרת — והיא בלבד', () => {
  const r = classifyShaamDialog('שים לב: הישות אינה רשומה כעוסק מורשה במע"מ.');
  assert.equal(r.known, true);
  assert.equal(r.id, 'vat_not_registered_dealer');
});

test('14 · חלונית שאינה ברשימה — לא מאושרת', () => {
  for (const text of [
    'שגיאה: כתובת מייל אינה תקינה',
    'פג תוקף האימות, יש להזין קוד חד פעמי',
    'האם אתה בטוח שברצונך למחוק את הבקשה?',
    'הודעה חדשה שלא ראינו מעולם',
  ]) {
    assert.equal(classifyShaamDialog(text).known, false, `must not auto-confirm: ${text}`);
  }
});

test('14ב · מילה בודדת מתוך רשימת העוגנים אינה מספיקה', () => {
  assert.equal(classifyShaamDialog('מע"מ').known, false);
  assert.equal(classifyShaamDialog('טופס ייפוי כוח חתום').known, false);
});

test('14ג · טקסט ריק אינו «מוכר»', () => {
  assert.equal(classifyShaamDialog('').known, false);
  assert.equal(classifyShaamDialog(undefined).known, false);
});

test('14ד · הרשימה סגורה ומתועדת', () => {
  assert.ok(SHAAM_KNOWN_DIALOGS.length >= 2);
  for (const d of SHAAM_KNOWN_DIALOGS) {
    assert.ok(d.id && Array.isArray(d.anchors) && d.minMatches >= 2,
      'כל חלונית מוכרת דורשת לפחות שני עוגנים');
  }
});

// ── קלט ליצירת בקשה: עוצרים לפני שנוגעים ברשות ─────────────────────────────

const GOOD = {
  submissionKey: 'person:client',
  role: 'client',
  entityId: '034605212',
  birthDateDDMMYYYY: '30101985',
  secondary: { type: 'parentId', value: '067574996' },
  systems: [{ screenLabel: 'מס הכנסה', fileNumber: '034605212', repType: 'ראשי' }],
};

test('קלט תקין עובר', () => {
  const v = validate(GOOD);
  assert.equal(v.entityId, '034605212');
  assert.equal(v.systems.length, 1);
});

test('11/12 · חסר אמצעי זיהוי או תאריך לידה — עצירה, בלי ניסיון אימות', () => {
  assert.throws(() => validate({ ...GOOD, secondary: null }),
    (e) => e instanceof PermanentError && e.code === 'missing_secondary_identity');
  assert.throws(() => validate({ ...GOOD, birthDateDDMMYYYY: '3010' }),
    (e) => e instanceof PermanentError && e.code === 'missing_birth_date');
});

test('10ה · מערך בלי מספר תיק — לא מזינים, ולא ממציאים אפסים', () => {
  assert.throws(
    () => validate({ ...GOOD, systems: [{ screenLabel: 'ניכויים', fileNumber: '', repType: 'ראשי' }] }),
    (e) => e instanceof PermanentError && e.code === 'missing_file_number');
});

test('אין מערכים כלל — לא פותחים בקשה ריקה', () => {
  assert.throws(() => validate({ ...GOOD, systems: [] }),
    (e) => e instanceof PermanentError && e.code === 'no_systems_requested');
});

test('תפקיד לא מפורש — עצירה (לעולם לא «הראשון ברשימה»)', () => {
  assert.throws(() => validate({ ...GOOD, role: undefined }),
    (e) => e instanceof PermanentError && e.code === 'bad_subject_role');
});

// ── 24–25: «הכול נקלט» ──────────────────────────────────────────────────────

test('24 · כל המערכים נקלטו', () => {
  assert.equal(allRowsAccepted([
    { rawSystemState: 'נקלט בהצלחה' },
    { rawSystemState: 'נקלט בהצלחה' },
  ]), true);
});

test('25 · מערך שממתין לפתיחת תיק אינו «נקלט» — ואינו כישלון', () => {
  assert.equal(allRowsAccepted([
    { rawSystemState: 'נקלט בהצלחה' },
    { rawSystemState: 'ממתין לפתיחת התיק' },
  ]), false);
});

test('25ב · רשימה ריקה לעולם אינה «הכול נקלט»', () => {
  assert.equal(allRowsAccepted([]), false);
  assert.equal(allRowsAccepted(undefined), false);
  assert.equal(allRowsAccepted([{}]), false);
});

// ── 13 · ייחוס שורות לבקשה — «האם זה בכלל הלקוח שלי» ────────────────────────

test('13 · חיפוש לפי מספר בקשה — שורה בלי מספר מפורט היא שלנו', () => {
  const r = attributeRows(
    [{ system: 'מס הכנסה', detail: {} }, { system: 'מעמ', detail: { requestNumber: '2026538930' } }],
    { requestNumber: '2026538930', searchedBy: 'requestNumber' },
  );
  assert.equal(r.ok, true);
  assert.equal(r.rows.length, 2);
});

test('13 · שורה של בקשה אחרת ברשימה שאמורה להיות מסוננת — עצירה', () => {
  const r = attributeRows(
    [{ detail: { requestNumber: '2026495063' } }],
    { requestNumber: '2026538930', searchedBy: 'requestNumber' },
  );
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'identity_mismatch');
});

test('13 · ישות אחרת בשורה — עצירה, גם אם מספר הבקשה תואם', () => {
  const r = attributeRows(
    [{ detail: { requestNumber: '2026538930', entityId: '111111111' } }],
    { requestNumber: '2026538930', entityId: '222222222', searchedBy: 'requestNumber' },
  );
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'identity_mismatch');
});

test('13 · נפילה לחיפוש לפי ישות — שורה בלי מספר אינה ניתנת לייחוס', () => {
  const r = attributeRows(
    [{ detail: { requestNumber: '2026538930' } }, { detail: {} }],
    { requestNumber: '2026538930', searchedBy: 'entityId' },
  );
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'cannot_attribute');
});

test('13 · חיפוש לפי ישות — נשמרות רק השורות של הבקשה שלנו', () => {
  const r = attributeRows(
    [{ detail: { requestNumber: '2026538930' } }, { detail: { requestNumber: '2026495063' } }],
    { requestNumber: '2026538930', searchedBy: 'entityId' },
  );
  assert.equal(r.ok, true);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].detail.requestNumber, '2026538930');
});

// ── 7.4 / 7.11 · שתי ערובות שנבדקות על הקוד עצמו ────────────────────────────
// ‼ בדיקות מקור ולא התנהגות, במכוון: מה שצריך להישמר כאן הוא **היעדר**
// קוד — אין מסלול שני לאימות, ואין שער חיצוני על פעולה קוראת-בלבד.
// התנהגות אי אפשר לבדוק בלי שע״ם; היעדר מסלול — אפשר.

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('7.4 · אמצעי הזיהוי הנוסף נשלח פעם אחת, ואין מסלול חלופי', () => {
  const v = validate(GOOD);
  assert.deepEqual(v.secondary, GOOD.secondary);

  const session = src('../src/shaamRepresentationSession.mjs');
  const fn = session.slice(session.indexOf('export async function verifyEntity'),
                          session.indexOf('export async function readExistingRepresentations'));
  assert.ok(fn.includes("reason: 'verification_rejected'"), 'דחייה חייבת לחזור כדחייה');
  assert.ok(!/for\s*\(|while\s*\(|\.retry|attempt\s*\+\+/.test(fn),
    'אין לולאה ואין מונה ניסיונות באימות הישות');
  assert.ok(!/secondar(y|ies)\s*\[|alternativeSecondary|fallbackSecondary/.test(fn),
    'אין רשימת אמצעי זיהוי חלופיים לנסות אחד אחרי השני');

  const handler = src('../src/handlers/shaamCreateRepresentation.mjs');
  assert.equal((handler.match(/await verifyEntity\(/g) || []).length, 1,
    'קריאה אחת בלבד ל-verifyEntity בכל ההרצה');
  assert.ok(handler.indexOf("markExternalAttempt('verify_entity')") < handler.indexOf('await verifyEntity('),
    'הסימן נרשם לפני האימות, אחרת קריסה בדיוק שם תיראה כ«לא נגענו»');
});

test('7.11 · הבדיקה היא קוראת-בלבד — ולכן אינה חסומה כמסלול היישוב', () => {
  const handler = src('../src/handlers/shaamCheckRepresentation.mjs');
  assert.ok(!handler.includes('assertNotAlreadyAttempted'),
    'שער «כבר נגעת» אסור על הבדיקה — היא הדרך לברר מה קרה');
  assert.ok(!handler.includes('markExternalAttempt'),
    'בדיקה אינה פנייה משנה ואינה מסמנת נגיעה');
  assert.ok(handler.includes('detectBlockingSignal'),
    'ועדיין — סימן חסימה/אבטחה עוצר גם קריאה');
  for (const forbidden of ['uploadSignedForm', 'confirmSystemsStep', 'startNewRequest', 'putDocument']) {
    assert.ok(!handler.includes(forbidden), `בדיקה אינה מבצעת ${forbidden}`);
  }
});

// ── 11 · בקשה קיימת נמצאת ולא נוצרת כפולה; אסמכתא ב"ל לעולם לא בקוד שע״ם ────

test('11 · openRequestCount>0 עוצר לפני יצירה — עוגן קיים במקור', () => {
  const s = src('../src/handlers/shaamCreateRepresentation.mjs');
  const guard = s.slice(s.indexOf('readExistingRepresentations(page)'),
                         s.indexOf('בחירת המערכים'));
  assert.ok(guard.includes('open_request_exists'), 'יש קוד שגיאה ייעודי');
  assert.ok(guard.includes("existing.openRequestCount > 0"), 'הבדיקה חוסמת לפני יצירה');
  assert.ok(guard.includes('לא נפתחת בקשה נוספת'), 'ההודעה אומרת שלא נוצר כלום');
});

test('11 · קוד שע״ם לא קורא/מזכיר «אסמכתא» (זיהוי ב״ל) בשום מקום', () => {
  for (const f of [
    '../src/shaamRepresentationSession.mjs',
    '../src/handlers/shaamCreateRepresentation.mjs',
    '../src/handlers/shaamCheckRepresentation.mjs',
    '../src/handlers/shaamSubmitPoa.mjs',
  ]) {
    const s = src(f);
    assert.ok(!s.includes('אסמכתא'), `${f} מכיל "אסמכתא" — זה מזהה של ב"ל, לא של שע״ם`);
  }
});

// ── 13 · אירוע אמיתי 23.09.2026: חיפוש לפי ישות בלי מספר בקשה כלל ───────────
// ‼ המקרה שבאמת קרה: entityId ידוע, requestNumber ריק לגמרי (לא רק
// searchedBy שגוי). זה בדיוק המסלול שה-`!want` הישן עקף.

test('13 · אין מספר בקשה כלל, ואין שם לקוח — עוצרים, לא מחזירים הכול', () => {
  const r = attributeRows(
    [{ clientName: 'סלע הדסה', detail: {} }, { clientName: 'לזימי שמעון', detail: {} }],
    { requestNumber: '', entityId: '034605212', searchedBy: 'entityId' },
  );
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'cannot_attribute');
});

test('13 · אין מספר בקשה, עם שם לקוח — נשמרות רק שורות התואמות בשם', () => {
  const rows = [
    { clientName: 'סלע הדסה', systemLabel: 'מס הכנסה', detail: {} },
    { clientName: 'סלע הדסה', systemLabel: 'מעמ', detail: {} },
    { clientName: 'לזימי שמעון', systemLabel: 'מס הכנסה', detail: {} },
    { clientName: 'ישר שי', systemLabel: 'מס הכנסה', detail: {} },
  ];
  const r = attributeRows(rows, { requestNumber: '', entityId: '034605212', searchedBy: 'entityId', expectedClientName: 'הדסה סלע' });
  assert.equal(r.ok, true);
  assert.equal(r.rows.length, 2);
  assert.ok(r.rows.every((row) => row.clientName === 'סלע הדסה'));
});

test('13 · שם לא תואם אף שורה — נמצא ריק (תוצאה תקפה), לא שגיאה', () => {
  const rows = [{ clientName: 'לזימי שמעון', detail: {} }];
  const r = attributeRows(rows, { requestNumber: '', entityId: '034605212', searchedBy: 'entityId', expectedClientName: 'הדסה סלע' });
  assert.equal(r.ok, true);
  assert.equal(r.rows.length, 0);
});

test('13 · שורה בלי שם לקוח בכלל (clientName חסר) — עוצרים את כל התוצאה', () => {
  const rows = [{ clientName: 'סלע הדסה', detail: {} }, { detail: {} }];
  const r = attributeRows(rows, { requestNumber: '', entityId: '034605212', searchedBy: 'entityId', expectedClientName: 'הדסה סלע' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'cannot_attribute');
});

test('קלט תקין ל-check: בלי מספר בקשה חייב שם לקוח — מקור נבדק', () => {
  const s = src('../src/handlers/shaamCheckRepresentation.mjs');
  assert.ok(s.includes('missing_attribution_evidence'), 'יש קוד שגיאה ייעודי לחוסר ראיית שיוך');
  const guard = s.slice(s.indexOf('if (!requestNumber && !personName)'), s.indexOf('if (!requestNumber && !personName)') + 300);
  assert.ok(guard.includes('לא ניתן לבסס בבטחה'), 'ההודעה מסבירה למה עוצרים');
});
