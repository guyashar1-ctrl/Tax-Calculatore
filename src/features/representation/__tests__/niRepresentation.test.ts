// ─── בדיקות: ייפוי הכוח בביטוח לאומי ────────────────────────────────────────
// ‼ מה שנבדק כאן הוא החוק שנשבר ב-23.09.2026 (הדסה סלע): **קיומה של בקשה
// בביטוח לאומי אינו אישור**. הראיה החיצונית ('ממתין לאישור') חיה לצד המצב
// העסקי ואינה מזיזה אותו; רק `confirmedAt` — שנכתב בשרת ורק על 'approved'
// (195) — הופך את השורה ל«ייצוג פעיל».
//
// ‼ שכבת הסיווג עצמה (מה נחשב 'approved') נבדקת אצל העובד, שם היא חיה:
// worker/test/btl-tracking.mjs. כאן נבדק מה שהמסך **גוזר** מהעובדות.
//
// ‼ הקובץ עומד בפני עצמו: שלוש פונקציות העזר מוגדרות כאן ולא מיובאות,
// כדי שהמיילסטון של ב"ל לא יהיה תלוי ברתמת בדיקות שנולדת במקביל. הצורה
// (`TESTS` כמערך `{name, fn}`) היא בדיוק מה שמריץ בדיקות היחידה מצפה לו,
// ולכן ברגע שהרתמה המשותפת נכנסת אפשר להחליף את שלוש העזר בייבוא ממנה.

import type { Client, NiTracking } from '../../../types';
import {
  niPersons, niRepresentationOf, niRepresentationAction, niExternalEvidence,
} from '../../../utils/niPersons';

// ── רתמה מינימלית ───────────────────────────────────────────────────────────

export interface TestCase {
  name: string;
  fn: () => void;
}

function test(name: string, fn: () => void): TestCase {
  return { name, fn };
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function equal<T>(actual: T, expected: T, message?: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${message ? message + ' — ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// ── מכונות עזר ──────────────────────────────────────────────────────────────

/** לקוחה עם שורת תיק ב"ל שנוצרה עם בקשת הייצוג — בדיוק כמו בייצור. */
function client(over: Partial<Client> = {}): Client {
  return {
    id: 'c1', firstName: 'הדסה', lastName: 'סלע', idNumber: '034605212',
    birthDate: '1985-10-30', familyStatus: 'single',
    representationStatus: 'pending_signature',
    taxFiles: [{
      id: 'tf-rep-nationalInsurance', authority: 'national_insurance', owner: 'client',
      fileNumber: '034605212', repStatus: 'pending',
    }],
    authorityRepresentations: {
      nationalInsurance: { status: 'in_process', targets: ['client'] },
    },
    ...over,
  } as unknown as Client;
}

const person = (c: Client) => niPersons(c)[0];

/** מסלול הביצוע של הדסה כפי שהוא **אחרי** היישוב מ-23.09.2026. */
const RECONCILED_PENDING: NiTracking = {
  enteredAt: '2026-09-23T09:52:33.656Z',
  referenceNumber: '75165449',
  deadline: '2026-11-22',
  externalState: 'pending',
  rawExternalState: 'ממתין לאישור',
  syncedAt: '2026-09-23T09:52:33.656Z',
  foundExternally: true,
};

const line = (track?: NiTracking) => {
  const c = client();
  return niRepresentationOf(person(c), c, undefined, { client: track });
};
const action = (track?: NiTracking) => {
  const c = client();
  return niRepresentationAction(person(c), c, line(track), track);
};

export const TESTS: TestCase[] = [
  // ── האירוע עצמו ───────────────────────────────────────────────────────────
  test('בקשה קיימת עם «ממתין לאישור» אינה ייצוג פעיל', () => {
    const l = line(RECONCILED_PENDING);
    equal(l.kind, 'pending');
    equal(l.v, 'בתהליך');
    assert(l.tone !== 'ok', 'שורה שממתינה לאישור לא נצבעת כמושלמת');
  }),

  test('האסמכתא והמועד שיושבו מביטוח לאומי מופיעים בשורה', () => {
    const l = line(RECONCILED_PENDING);
    assert(!!l.detail && l.detail.includes('75165449'), `האסמכתא חסרה: ${l.detail}`);
    assert(!!l.detail && l.detail.includes('22.11'), `המועד חסר: ${l.detail}`);
  }),

  test('«ממתין לאישור» מציע לבדוק שוב — ולא מסיים את המסלול', () => {
    const a = action(RECONCILED_PENDING);
    equal(a?.kind, 'check_btl');
    equal(a?.label, 'בדוק קבלת הייצוג');
  }),

  // ── הגבול: רק confirmedAt פותח את המצב הפעיל ─────────────────────────────
  test('externalState «approved» לבדו אינו הופך את השורה לפעילה', () => {
    // ‼ ראיה חיצונית אינה מצב עסקי. ההמרה קורית בשרת (195) וכותבת
    // confirmedAt; עד שהיא קרתה, המסך לא מקדים אותה.
    const l = line({ ...RECONCILED_PENDING, externalState: 'approved', rawExternalState: 'מאושר' });
    equal(l.kind, 'pending');
  }),

  test('confirmedAt — ורק הוא — הופך לייצוג פעיל', () => {
    const l = line({ ...RECONCILED_PENDING, externalState: 'approved', confirmedAt: '2026-10-01T00:00:00.000Z' });
    equal(l.kind, 'active');
    equal(l.tone, 'ok');
    equal(action({ ...RECONCILED_PENDING, confirmedAt: '2026-10-01T00:00:00.000Z' }), null,
      'מסלול שהושלם אינו מציע עוד פעולה');
  }),

  // ── מצבים שאינם אישור ────────────────────────────────────────────────────
  test('מצב לא מזוהה אינו מתגלגל לאישור', () => {
    const l = line({ ...RECONCILED_PENDING, externalState: 'unknown', rawExternalState: 'בהמתנה לאישור המבוטח' });
    equal(l.kind, 'pending');
    equal(action({ ...RECONCILED_PENDING, externalState: 'unknown' })?.kind, 'check_btl');
  }),

  test('«לא נמצא רישום» אינו אישור ואינו מוחק את האסמכתא השמורה', () => {
    const l = line({ ...RECONCILED_PENDING, externalState: 'not_found' });
    equal(l.kind, 'pending');
    assert(!!l.detail && l.detail.includes('75165449'), 'האסמכתא נשארת גלויה לבירור');
  }),

  test('בלי שום ראיה חיצונית — אותה התנהגות כמו לפני 195', () => {
    const before: NiTracking = { enteredAt: '2026-09-23T09:52:33.656Z', referenceNumber: '75165449', deadline: '2026-11-22' };
    equal(line(before).kind, 'pending');
    equal(action(before)?.kind, 'check_btl');
  }),

  test('טרם הוזן דבר — מציע להזין, לא לבדוק', () => {
    equal(action(undefined)?.kind, 'enter_btl');
    equal(action({})?.kind, 'enter_btl');
  }),

  test('הוזן בלי אסמכתא — ממתין לאסמכתא, ואין מה לבדוק', () => {
    const t: NiTracking = { enteredAt: '2026-09-23T09:52:33.656Z' };
    equal(line(t).kind, 'pending');
    equal(action(t)?.kind, 'continue', 'בלי אסמכתא אין מה לשאול את ביטוח לאומי');
  }),

  // ── הראיה שהמסך מציג ─────────────────────────────────────────────────────
  test('אין ראיה חיצונית ⇒ אין שורה להציג', () => {
    equal(niExternalEvidence(undefined), null);
    equal(niExternalEvidence({}), null);
    equal(niExternalEvidence({ referenceNumber: '75165449' }), null);
  }),

  test('«ממתין לאישור» מוצג בשמו, עם מועד הקריאה', () => {
    const e = niExternalEvidence(RECONCILED_PENDING);
    equal(e?.state, 'pending');
    equal(e?.label, 'ממתין לאישור');
    equal(e?.at, '2026-09-23T09:52:33.656Z');
    equal(e?.tone, 'muted');
    equal(e?.raw, undefined, 'כשהמצב מזוהה אין צורך בטקסט הגולמי');
  }),

  test('מצב לא מזוהה מוצג ככזה — עם המילים של ביטוח לאומי', () => {
    const e = niExternalEvidence({ externalState: 'unknown', rawExternalState: 'בהמתנה לאישור המבוטח' });
    equal(e?.label, 'מצב לא מזוהה');
    equal(e?.raw, 'בהמתנה לאישור המבוטח');
    equal(e?.tone, 'warn');
  }),

  test('פג תוקף/בוטל מוצגים כדורשי תשומת לב', () => {
    equal(niExternalEvidence({ externalState: 'expired' })?.label, 'פג תוקף');
    equal(niExternalEvidence({ externalState: 'expired' })?.tone, 'warn');
    equal(niExternalEvidence({ externalState: 'cancelled' })?.label, 'בוטל');
    equal(niExternalEvidence({ externalState: 'cancelled' })?.tone, 'warn');
    equal(niExternalEvidence({ externalState: 'not_found' })?.label, 'לא נמצא רישום');
  }),

  test('מצב עתידי שאינו במפה נקרא «לא מזוהה», לא «מאושר»', () => {
    // ‼ נתון שנכתב בגרסה חדשה יותר של העובד. הגבול היחיד שאסור להיסדק.
    const e = niExternalEvidence({ externalState: 'held_by_btl' as never });
    equal(e?.label, 'מצב לא מזוהה');
  }),
];
