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
    equal(p.sub, 'נשארו 3 דברים אצל עידן:');
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

  test('מוטבע ומאושר ⇒ מוכן להגשה', () => {
    const p = repCenterPlan(base({ status: 'awaiting_stamp', sent: true, signed: true, stamped: true }));
    equal(p.kind, 'submit');
    equal(p.headline, 'מוכן להגשה לשע״ם');
  }),

  test('הוגש ⇒ ממתינים לרשויות, עם שורת המצב של שע״ם', () => {
    const p = repCenterPlan(base({ status: 'awaiting_authorities', sent: true, signed: true, stamped: true, submitted: true,
      ni: [{ ...NI, delivered: true }], shaam: [SHAAM], waitingOn: ['לשע״ם (צפי לסיום ההשהייה 3.10.2026)', 'לאישור של עידן בביטוח הלאומי (עד 23.11.2026)'] }));
    equal(p.kind, 'waiting_authorities');
    equal(p.ball, 'authority');
    equal(p.sub, 'ממתינים לשע״ם (צפי לסיום ההשהייה 3.10.2026) ולאישור של עידן בביטוח הלאומי (עד 23.11.2026). בינתיים אין פעולה נדרשת ממך.');
    equal(phaseStates(p), 'done,done,done,current');
  }),

  test('הוגש, שע״ם ממתינה לאישור הלקוח ⇒ הכדור אצל הלקוח', () => {
    const p = repCenterPlan(base({ status: 'awaiting_authorities', sent: true, signed: true, stamped: true, submitted: true,
      shaam: [{ ...SHAAM, awaitingClientApproval: true }] }));
    equal(p.ball, 'client');
    equal(p.headline, 'נדרש אישור של עידן ברשות המסים');
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
    equal(w.sub, 'נשאר דבר אחד אצל עידן:');
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
