// ─── «מה עכשיו» לאורך כל המסע — כל מעבר, לא צילום אחד ─────────────────────────
import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { repCenterPlan, type RcInput } from '../repCenterPlan';

const SHAAM = { key: 'person:client', label: 'מס הכנסה, מע"מ, ניכויים', entered: true };
const NI = { role: 'client' as const, name: 'עידן רוקח', prereqMissing: false, entered: true, hasRef: true, delivered: false, final: false };
const base = (over: Partial<RcInput> = {}): RcInput => ({
  status: 'awaiting_accountant', firstName: 'עידן', formReady: true, sent: false, signed: false, stamped: false,
  submitted: false, shaam: [SHAAM], ni: [NI], clientOpenItems: ['לאשר את צילום תעודת הזהות שבתיק'], ...over,
});
const phaseStates = (p: ReturnType<typeof repCenterPlan>) => p.phases.map(x => x.state).join(',');

export const TESTS: TestCase[] = [
  test('הכנה · כלום לא הוזן ⇒ רשימת צעדים, הכדור אצל המשרד', () => {
    const p = repCenterPlan(base({ formReady: false, shaam: [{ ...SHAAM, entered: false }], ni: [{ ...NI, entered: false, hasRef: false }] }));
    equal(p.kind, 'prepare');
    equal(p.ball, 'office');
    equal(p.headline, 'נשארו 4 צעדים לפני השליחה לעידן');
    deepEqual(p.prepare.map(i => i.done), [false, false, false, false]);
    equal(phaseStates(p), 'current,todo,todo,todo');
  }),

  test('הכנה · רק האסמכתא חסרה ⇒ «נשאר צעד אחד»', () => {
    const p = repCenterPlan(base({ ni: [{ ...NI, hasRef: false }] }));
    equal(p.kind, 'prepare');
    equal(p.headline, 'נשאר צעד אחד לפני השליחה לעידן');
    equal(p.prepare.filter(i => !i.done).map(i => i.key).join(), 'ni-ref:client');
  }),

  test('הכנה · תנאי-קדם בב״ל חסרים ⇒ פריט אחד «להשלים פרטים», בלי הזנה/אסמכתא', () => {
    const p = repCenterPlan(base({ ni: [{ ...NI, prereqMissing: true, entered: false, hasRef: false }] }));
    deepEqual(p.prepare.filter(i => i.key.startsWith('ni')).map(i => i.key), ['ni-prereq:client']);
  }),

  test('מוכן לשליחה (עידן היום) ⇒ «מוכן לשליחה לעידן»', () => {
    const p = repCenterPlan(base());
    equal(p.kind, 'send');
    equal(p.headline, 'מוכן לשליחה לעידן');
    assert(p.sub.includes('האסמכתא של ביטוח לאומי'), p.sub);
    equal(phaseStates(p), 'done,current,todo,todo');
  }),

  test('נשלח ⇒ ממתינים לעידן, והמשפט מונה בדיוק את מה שפתוח אצלו', () => {
    const p = repCenterPlan(base({ status: 'pending_signature', sent: true }));
    equal(p.kind, 'waiting_client');
    equal(p.ball, 'client');
    equal(p.sub, 'נשארו 3 דברים אצל עידן. אפשר בכל סדר.');
    // מתי יצא המייל — רק בטור «המייל», ממקור אחד. לא בכותרת (שם הוא סתר את שורת החותם).
    const withDate = repCenterPlan(base({ status: 'pending_signature', sent: true, sentAt: '2026-09-27T20:40:00Z' }));
    assert(!/יצא|נשלח/.test(withDate.sub), withDate.sub);
  }),

  test('נחתם ⇒ החתימה והחותמת של המשרד', () => {
    const p = repCenterPlan(base({ status: 'awaiting_stamp', sent: true, signed: true }));
    equal(p.kind, 'stamp');
    equal(p.ball, 'office');
    equal(phaseStates(p), 'done,done,current,todo');
  }),

  test('מוטבע, הצילום לא אושר ⇒ ממתינים ללקוח, לא «מוכן להגשה»', () => {
    const p = repCenterPlan(base({ status: 'awaiting_stamp', sent: true, signed: true, stamped: true,
      shaam: [{ ...SHAAM, clientDocumentsPending: 'רשות המסים דורשת צילום…' }] }));
    equal(p.kind, 'waiting_docs');
    equal(p.ball, 'client');
  }),

  test('מוטבע, עצירה שהתיקון שלה אצל המשרד ⇒ «השידור נעצר», עם הסיבה', () => {
    const p = repCenterPlan(base({ status: 'awaiting_stamp', sent: true, signed: true, stamped: true,
      shaam: [{ ...SHAAM, documentsBlockedReason: 'לא ניתן לשייך', documentsBlockedOfficeFix: true }] }));
    equal(p.kind, 'blocked');
    equal(p.sub, 'לא ניתן לשייך');
  }),

  test('מוטבע ומאושר ⇒ מוכן להגשה — בלחיצה, לא «אוטומטית» (D2-4)', () => {
    const p = repCenterPlan(base({ status: 'awaiting_stamp', sent: true, signed: true, stamped: true }));
    equal(p.kind, 'submit');
    equal(p.headline, 'מוכן להגשה לשע״ם');
    assert(!/אוטומטי/.test(p.sub), p.sub);
    assert(p.sub.includes('«שלח טופס חתום לשע״ם»'), 'המשפט נוקב בכפתור האמיתי');
  }),

  test('הוגש ⇒ ממתינים לרשויות; לא מבטיח עדכון ברקע — נוקב ב«בדוק קבלת הייצוג» (D2-4)', () => {
    const p = repCenterPlan(base({ status: 'awaiting_authorities', sent: true, signed: true, stamped: true, submitted: true,
      ni: [{ ...NI, delivered: true }], shaam: [SHAAM] }));
    equal(p.kind, 'waiting_authorities');
    equal(p.ball, 'authority');
    equal(p.sub, 'אין פעולה נדרשת ממך עכשיו. PIVO לא בודקת לבד — «בדוק קבלת הייצוג» מעדכן את המצב.');
    assert(!/מתעדכן בכל בדיקה/.test(p.sub), p.sub);
    equal(p.approval, undefined);
    equal(phaseStates(p), 'done,done,done,current');
  }),

  test('הוגש, שע״ם ממתינה לאישור הלקוח ⇒ הכדור אצל הלקוח', () => {
    const p = repCenterPlan(base({ status: 'awaiting_authorities', sent: true, signed: true, stamped: true, submitted: true,
      shaam: [{ ...SHAAM, awaitingClientApproval: true }] }));
    equal(p.ball, 'client');
    equal(p.headline, 'נדרש אישור של עידן ברשות המסים');
    equal(p.approval, 'needed');
  }),

  // ── H2.5a · זוג: האישור שחסר הוא של מי שההגשה שלו ממתינה — לא של בעל הכרטיס ──
  test('זוג, שע״ם ממתינה להגשה של בת הזוג ⇒ הכותרת נוקבת ברחל, לא בדוד', () => {
    const p = repCenterPlan(base({ firstName: 'דוד', status: 'awaiting_authorities', sent: true, signed: true, stamped: true, submitted: true,
      ni: [], clientOpenItems: [], clientApprovalRequiredOpen: true,
      shaam: [
        { ...SHAAM, key: 'person:client', label: 'מע"מ', personName: 'דוד לוי' },
        { ...SHAAM, key: 'person:spouse', label: 'מס הכנסה, מע"מ', personName: 'רחל לוי', awaitingClientApproval: true },
      ] }));
    equal(p.ball, 'client');
    equal(p.headline, 'נדרש אישור של רחל ברשות המסים');
    equal(p.sub, 'רשות המסים ממתינה לאישור הייצוג באזור האישי של רחל. בלי האישור הייצוג לא ייקלט.');
    assert(!p.headline.includes('דוד') && !p.sub.includes('דוד'), 'בעל הכרטיס אינו מי שחסר לו אישור');
  }),

  test('זוג, שניהם ממתינים ⇒ שני השמות, וכל אחד באזור האישי שלו', () => {
    const p = repCenterPlan(base({ firstName: 'דוד', status: 'awaiting_authorities', sent: true, signed: true, stamped: true, submitted: true,
      ni: [], clientOpenItems: [],
      shaam: [
        { ...SHAAM, key: 'person:client', personName: 'דוד לוי', awaitingClientApproval: true },
        { ...SHAAM, key: 'person:spouse', personName: 'רחל לוי', awaitingClientApproval: true },
      ] }));
    equal(p.headline, 'נדרש אישור של דוד ורחל ברשות המסים');
    assert(p.sub.includes('כל אחד באזור האישי שלו'), p.sub);
  }),

  test('השלב סומן כחובה אבל אין קריאה לאדם מסוים ⇒ בעל הכרטיס, כמו קודם', () => {
    const p = repCenterPlan(base({ firstName: 'דוד', status: 'awaiting_authorities', sent: true, signed: true, stamped: true, submitted: true,
      ni: [], clientOpenItems: [], clientApprovalRequiredOpen: true,
      shaam: [{ ...SHAAM, personName: 'רחל לוי' }] }));
    equal(p.headline, 'נדרש אישור של דוד ברשות המסים');
  }),

  // ── H2:X-4 · הלקוח דיווח שאישר — מה שקובע הוא בדיקה בשע״ם אחרי הדיווח ──
  test('דווח, ובבדיקה שאחרי הדיווח שע״ם עדיין ממתינה ⇒ לא מבוי סתום: «עדיין ממתינה», הכדור אצל הלקוח', () => {
    const p = repCenterPlan(base({ firstName: 'דוד', status: 'awaiting_authorities', sent: true, signed: true, stamped: true, submitted: true,
      ni: [], clientOpenItems: [], clientApprovalRequiredOpen: true, clientApprovalDeclaredAt: '2026-09-24T09:12:00.000Z',
      shaam: [
        { ...SHAAM, key: 'person:client', personName: 'דוד לוי', checkedAt: '2026-09-24T10:00:00Z' },
        { ...SHAAM, key: 'person:spouse', personName: 'רחל לוי', awaitingClientApproval: true, checkedAt: '2026-09-24T10:00:00Z' },
      ] }));
    equal(p.approval, 'still_waiting');
    equal(p.ball, 'client');
    equal(p.headline, 'שע״ם עדיין ממתינה לאישור של רחל');
    assert(p.sub.startsWith('לפי דוד האישור כבר ניתן'), p.sub);
    assert(p.sub.includes('המדריך') && p.sub.includes('«בדוק קבלת הייצוג»'), 'הצעד הבא — בפקדים האמיתיים');
  }),

  test('דווח, ואין בדיקה אחרי הדיווח ⇒ «לבדוק בשע״ם», הכדור אצל המשרד', () => {
    const p = repCenterPlan(base({ firstName: 'הדסה', status: 'awaiting_authorities', sent: true, signed: true, stamped: true, submitted: true,
      ni: [], clientOpenItems: [], clientApprovalRequiredOpen: true, clientApprovalDeclaredAt: '2026-09-24T09:12:00.000Z',
      shaam: [{ ...SHAAM, awaitingClientApproval: true, checkedAt: '2026-09-24T07:00:00Z' }] }));
    equal(p.approval, 'declared');
    equal(p.ball, 'office');
    equal(p.headline, 'דווח שהאישור ניתן — לבדוק בשע״ם');
    assert(p.sub.includes('«בדוק קבלת הייצוג»'), p.sub);
  }),

  test('דווח, ובדיקה שאחרי הדיווח כבר לא מציגה «ממתין לאישור לקוח» ⇒ ממתינים לקליטה', () => {
    const p = repCenterPlan(base({ status: 'awaiting_authorities', sent: true, signed: true, stamped: true, submitted: true,
      ni: [], clientOpenItems: [], clientApprovalRequiredOpen: true, clientApprovalDeclaredAt: '2026-09-24T09:12:00.000Z',
      shaam: [{ ...SHAAM, checkedAt: '2026-09-25T08:00:00Z' }] }));
    equal(p.approval, undefined);
    equal(p.ball, 'authority');
    equal(p.headline, 'הוגש — ממתינים לקליטה');
  }),

  test('תאריך דיווח לא תקין ⇒ כאילו לא דווח (לא מסתירים את הבקשה)', () => {
    const p = repCenterPlan(base({ status: 'awaiting_authorities', sent: true, signed: true, stamped: true, submitted: true,
      ni: [], clientOpenItems: [], clientApprovalDeclaredAt: 'לא תאריך',
      shaam: [{ ...SHAAM, awaitingClientApproval: true, checkedAt: '2026-09-25T08:00:00Z' }] }));
    equal(p.approval, 'needed');
  }),

  test('שע״ם נקלטה, ב״ל עוד לא ⇒ לא «פעיל»: נשאר האישור בב״ל', () => {
    const p = repCenterPlan(base({ status: 'active', sent: true, signed: true, stamped: true, submitted: true,
      shaam: [{ ...SHAAM, settled: true }], ni: [{ ...NI, delivered: true }] }));
    equal(p.kind, 'waiting_authorities');
    equal(p.headline, 'נשאר האישור של עידן רוקח בביטוח הלאומי');
  }),

  test('הכול נקלט ⇒ «הייצוג פעיל», כל השלבים הושלמו', () => {
    const p = repCenterPlan(base({ status: 'active', sent: true, signed: true, stamped: true, submitted: true,
      shaam: [{ ...SHAAM, settled: true }], ni: [{ ...NI, delivered: true, final: true }] }));
    equal(p.kind, 'active');
    equal(p.ball, 'none');
    equal(phaseStates(p), 'done,done,done,done');
  }),

  test('רשות הוסרה אחרי שהבקשה נפתחה ⇒ קודם ביטול בשע״ם, גם כשהשאר מוכן', () => {
    const p = repCenterPlan(base({ formReady: false,
      shaam: [{ ...SHAAM, replacementRequestNumber: '2026544926', replacementRemoved: ['ניכויים'] }] }));
    equal(p.kind, 'replacement');
    equal(p.headline, 'צריך לבטל בשע״ם את בקשה 2026544926');
    assert(p.sub.startsWith('ניכויים הוסר'), p.sub);
  }),

  test('בלי ביטוח לאומי ⇒ אין פריטי ב״ל, והמשפט לא מזכיר אסמכתא', () => {
    const p = repCenterPlan(base({ ni: [], clientOpenItems: [] }));
    equal(p.kind, 'send');
    assert(!p.sub.includes('ביטוח לאומי'), p.sub);
    const w = repCenterPlan(base({ ni: [], clientOpenItems: [], sent: true, status: 'pending_signature' }));
    equal(w.sub, 'נשאר דבר אחד אצל עידן. אפשר בכל סדר.');
  }),

  test('זוג בב״ל ⇒ פריט לכל אדם, עם השם', () => {
    const p = repCenterPlan(base({ ni: [NI, { ...NI, role: 'spouse', name: 'מיכל רוקח', hasRef: false }] }));
    const open = p.prepare.filter(i => !i.done);
    equal(open.length, 1);
    equal(open[0].detail, 'מיכל רוקח');
  }),

  test('בלי שם ⇒ «הלקוח», לא מחרוזת ריקה', () => {
    equal(repCenterPlan(base({ firstName: '' })).headline, 'מוכן לשליחה ללקוח');
  }),
];
