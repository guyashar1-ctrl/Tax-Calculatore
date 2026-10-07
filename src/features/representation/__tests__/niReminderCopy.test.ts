// ─── 224 · תזכורת אישור ב"ל — של מי (07.10.2026) ──────────────────────────────
// ‼ מה נעול כאן: כששני בני הזוג מיוצגים בב"ל (תיבה משותפת), התזכורת אומרת בשם של מי
//   האישור והמספר, ושלכל אחד מספר משלו. לקוח יחיד — הנוסח הקודם, מילה במילה.
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { niReminderCopy } from '../../../../supabase/functions/_shared/repTemplates.ts';

export const TESTS: TestCase[] = [
  test('זוג ⇒ השם בנושא, בכותרת, באישור ובמספר', () => {
    const c = niReminderCopy({ referenceNumber: '75074203', deadline: '15.11.2026', personFirst: 'יאיר', couple: true });
    equal(c.subject, 'תזכורת - אישור ייפוי הכוח של יאיר בביטוח הלאומי עדיין ממתין');
    equal(c.heading, 'תזכורת קטנה, יאיר');
    equal(c.lines[0], 'אישור ייפוי הכוח של יאיר מול הביטוח הלאומי עדיין לא התקבל. מספר האסמכתא של יאיר: 75074203.');
    equal(c.lines[1], 'יש לאשר עד 15.11.2026.');
    assert(c.lines[3].includes('לכל אחד מבני הזוג מספר אסמכתא נפרד'), 'מספר נפרד לכל אחד');
    assert(c.lines[3].includes('תעודת הזהות של יאיר'), 'תעודת הזהות בשמו');
  }),

  test('לקוח יחיד ⇒ הנוסח הקודם, בלי שם', () => {
    const c = niReminderCopy({ referenceNumber: '75165449', deadline: '20.11.2026', personFirst: 'הדסה', couple: false });
    equal(c.subject, 'תזכורת - אישור ייפוי הכוח בביטוח הלאומי עדיין ממתין');
    equal(c.heading, 'תזכורת קטנה');
    equal(c.lines.join('|'), 'אישור ייפוי הכוח מול הביטוח הלאומי עדיין לא התקבל. מספר האסמכתא: 75165449.|יש לאשר עד 20.11.2026.||אפשר לאשר באתר הביטוח הלאומי, או בטלפון 02-5393740.');
  }),

  test('זוג בלי שם ידוע ⇒ הנוסח הקודם (לא «של »)', () => {
    const c = niReminderCopy({ referenceNumber: '1', personFirst: '  ', couple: true });
    equal(c.heading, 'תזכורת קטנה');
    assert(!c.subject.includes('של '), 'בלי «של» ריק');
  }),

  test('בלי מועד ⇒ אין שורת מועד', () => {
    const c = niReminderCopy({ referenceNumber: '1', personFirst: 'יאיר', couple: true });
    assert(!c.lines.some(l => l.startsWith('יש לאשר עד')), 'אין שורת מועד');
  }),
];
