// ─── בדיקות: «ספרייה» — מה השורה אומרת, חיפוש, מיון וקטע הקליטה (3.10.2026) ──
// ‼ מה נעול כאן:
//   · «נוסח מוכן» — מובנית שלא נערכה או עותק זהה; «חזרה לנוסח המוכן» רק כשיש לאן.
//   · מי עושה — במילים של מה שהלקוח עושה, ומשימה של המשרד לא «נראית» ללקוח.
//   · חיפוש סולח על גרשיים («רו"ח» = «רו״ח») ומחפש גם בפריטים.
//   · מיון לפי א״ב שמתעלם ממרכאות בתחילת השם, וקבוצה אחת לכל אות.
//   · (4.10.2026) כל בקשה פעם אחת: נוסח מוכן מסוג קבוע סופר את הפריט בקליטה, והקטע
//     לא מציג אותו שוב; שורה שהנוסח שלה לא מגיע לאף לקוח — «עריכה» בפריט בקליטה.

import { test, equal, deepEqual, assert } from '../../../../../testkit/tinyTest';
import type { TestCase } from '../../../../../testkit/tinyTest';
import type { RequestTemplate } from '../../../../../lib/requestTemplates';
import { mergeOfficeOverrides } from '../../../../../lib/requestTemplates';
import type { OfficeFlow } from '../../../../../features/flows/types';
import {
  actorText, seesText, isPreset, canRevertToPreset, normalizeForSearch, searchTextOf, matchesQuery,
  sortByName, groupByLetter, firstLetter, autoLabel, autoWhenText, gapText, canBeInFlow, autoHintText, autoCountText,
  autoOffText, autoResultText, gapsLineText, systemTypeOf, editsInIntake, kindsNote,
} from '../libraryModel';
import { byLibraryRow, focusOfUse, libraryUses } from '../usedIn';

// ‼ בעלים «המשרד» נשמר בספרייה עם officeTask: true (upsert_library_request, 215) — בלי הסימון
// זו רשומה ישנה, והשרת יוצר ממנה בקשה ללקוח כשיש בה פריטים (_template_entry_owner).
const custom = (id: string, name: string, kinds: string[], owner: 'client' | 'me' = 'client', officeTask = owner === 'me'): RequestTemplate => ({
  id, name, kind: 'request', officeId: 'o1', seedKey: null,
  entries: [{ stepType: 'custom_request', owner, ...(officeTask ? { officeTask: true } : {}), payload: {
    title: name, clientTitle: `${name} (ללקוח)`,
    requirements: kinds.map((kind, i) => ({ key: `r${i}`, kind, label: `פריט ${i + 1}` })),
  } }],
});

const seedDocs: RequestTemplate = {
  id: 's-docs', name: 'מסמכים מהלקוח', kind: 'request', officeId: null, seedKey: 'client_documents',
  entries: [{ stepType: 'client_documents', owner: 'client', payload: { checklist: [{ key: 'a', label: 'צילום תעודת זהות' }, { key: 'b', label: 'אישור ניהול חשבון' }] } }],
};

export const TESTS: TestCase[] = [
  test('נוסח מוכן: מובנית — כן; עותק שנערך — לא, ויש לאן לחזור; בקשה של המשרד — אין', () => {
    equal(isPreset(seedDocs), true);
    equal(canRevertToPreset(seedDocs), false, 'מובנית — אין ממה לחזור');
    const edited: RequestTemplate = { ...seedDocs, id: 'c', officeId: 'o1',
      entries: [{ ...seedDocs.entries[0], payload: { checklist: [{ key: 'a', label: 'צילום תעודת זהות' }] } }] };
    const [c] = mergeOfficeOverrides([seedDocs, edited]);
    equal(isPreset(c), false);
    equal(canRevertToPreset(c), true);
    const same: RequestTemplate = { ...seedDocs, id: 'c2', officeId: 'o1' };
    const [c2] = mergeOfficeOverrides([seedDocs, same]);
    equal(isPreset(c2), true, 'עותק זהה מוצג כנוסח מוכן');
    equal(canRevertToPreset(c2), false);
    const own = custom('x', 'אישור', ['confirm']);
    equal(isPreset(own), false);
    equal(canRevertToPreset(own), false);
  }),

  test('מי עושה — לפי סוג הפריטים, ומשימה של המשרד', () => {
    equal(actorText(custom('a', 'א', ['confirm'])), 'הלקוח מאשר');
    equal(actorText(custom('a', 'א', ['file', 'confirm'])), 'הלקוח מעלה ומאשר\u00A0·\u00A02 פריטים');
    equal(actorText(custom('a', 'א', ['files', 'text', 'confirm'])), 'הלקוח מעלה, ממלא ומאשר\u00A0·\u00A03 פריטים');
    equal(actorText(custom('a', 'א', ['confirm'], 'me')), 'משימה למשרד — הלקוח לא רואה אותה');
    equal(actorText(seedDocs), 'הלקוח מעלה: צילום תעודת זהות, אישור ניהול חשבון');
    equal(seesText(seedDocs), null, 'כותרת נגזרת — לא חוזרים עליה');
    equal(seesText(custom('a', 'א', ['confirm'], 'me')), null, 'משימה של המשרד — אין «הלקוח רואה»');
    // רשומה ישנה: «המשרד» שנגזר מהכדור, עם פריט ללקוח ובלי officeTask — השרת יוצר בקשה ללקוח.
    equal(actorText(custom('a', 'א', ['confirm'], 'me', false)), 'הלקוח מאשר');
    equal(seesText(custom('a', 'שכר טרחה', ['confirm'], 'me', false)), 'הלקוח רואה: שכר טרחה (ללקוח)');
    equal(seesText(custom('a', 'שכר טרחה', ['confirm'])), 'הלקוח רואה: שכר טרחה (ללקוח)');
  }),

  test('אזהרת «אין מה ליצור» — אותו כלל כמו בבונה', () => {
    assert(gapText(custom('a', 'ריקה', [])) !== null, 'בקשה ללקוח בלי פריטים');
    equal(gapText(custom('a', 'משימה', [], 'me')), null, 'משימה של המשרד בלי פריטים — תקינה');
    equal(gapText(seedDocs), null);
  }),

  test('חיפוש: גרשיים, ניקוד, מקפים, ופריטים', () => {
    equal(normalizeForSearch('פרטי הרו״ח הקודם'), 'פרטי הרוח הקודם');
    equal(normalizeForSearch('רו"ח — קודם'), 'רוח קודם');
    const hay = searchTextOf(seedDocs);
    assert(matchesQuery(hay, 'תעודת זהות'), 'מוצא לפי פריט');
    assert(matchesQuery(hay, 'מסמכים  זהות'), 'כל המילים, בכל סדר');
    assert(!matchesQuery(hay, 'פנסיה'), 'לא מוצא מה שאין');
    assert(matchesQuery(hay, ''), 'חיפוש ריק — הכול');
  }),

  test('מיון לפי א״ב, מרכאות בתחילת השם לא מזיזות, קבוצה אחת לכל אות', () => {
    const names = ['תלוש', '«אישור» שנתי', 'דוח', 'אישור בנק', 'ביטוח', 'אישור ניכוי'];
    const sorted = sortByName(names.map(name => ({ name })));
    deepEqual(sorted.slice(3).map(x => x.name), ['ביטוח', 'דוח', 'תלוש']);
    assert(sorted.slice(0, 3).some(x => x.name === '«אישור» שנתי'), 'שם שמתחיל במרכאות ממוין עם ה-א');
    const groups = groupByLetter(sorted);
    deepEqual(groups.map(g => g.letter), ['א', 'ב', 'ד', 'ת']);
    equal(groups[0].items.length, 3);
    equal(firstLetter('1099 טופס'), '#');
    equal(firstLetter('Excel'), 'E');
  }),

  test('קטע הקליטה: אותו שם כמו בפריט במסלול, ומתי נפתחת', () => {
    // ‼ (4.10.2026) בלי שם תיאורי: סוג שיש לו שורה בספרייה לא מופיע בקטע בכלל (systemTypeOf).
    equal(autoLabel('client_documents'), 'מסמכים מהלקוח');
    equal(autoLabel('prev_accountant_details'), 'פרטי הרו״ח הקודם');
    equal(autoLabel('representation'), 'בקשת ייצוג (מההצעה)');
    equal(autoWhenText('release_letter', null), 'כשיש רו״ח קודם · אחרי «פרטי הרו״ח הקודם»');
    equal(autoWhenText('client_documents', ['licensed_dealer', 'company']), 'לכל לקוח חדש — הרשימה לפי מצב הלקוח · רק לעוסק מורשה וחברה');
    equal(autoWhenText('client_documents', ['exempt_dealer', 'licensed_dealer', 'company', 'tax_refund', 'representation_only']),
      'לכל לקוח חדש — הרשימה לפי מצב הלקוח', 'כל הסוגים — בלי «רק ל…»');
    equal(autoWhenText('intake_questionnaire', ['exempt_dealer', 'licensed_dealer', 'company', 'representation_only']),
      'לכל לקוח חדש · לא להחזר מס', 'הרשימה הקצרה — מי לא');
    equal(autoWhenText('paperless_invite', ['exempt_dealer', 'licensed_dealer', 'company']),
      'כשההצעה כוללת שירות חודשי או הנהלת חשבונות · לא להחזר מס ולא לייצוג בלבד');
    equal(autoWhenText('paperless_tax_authority', ['licensed_dealer', 'company']),
      'כשיש פייפרלס — לעוסק מורשה או חברה · אחרי «חיבור לפייפרלס»', 'נקרא בלי הקשר, והסוג כבר נאמר');
  }),

  test('קטע הקליטה: מה מגיע ללקוח — מ«איך מגיע», לא «לבד» בלבד', () => {
    equal(autoHintText('hold'), 'נוצרות לבד כשלקוח מאשר הצעת מחיר · מחכה לאישורך — אחרי הפרסום אתה בוחר אם לשלוח מייל.');
    assert(autoHintText('auto').includes('מייל אחד מרוכז יוצא לבד'), 'אוטומטי — אומרים מתי המייל יוצא');
    equal(autoHintText(null), 'נוצרות לבד כשלקוח מאשר הצעת מחיר. מגדירים במסלול הקליטה.', 'בלי מסלול קליטה — בלי הבטחה על מייל');
  }),

  test('קטע הקליטה: הספירה — רק מה שנפתח באמת; השאר בשורה מקופלת', () => {
    equal(autoCountText({ shown: 10, total: 10, inFlow: 3, searching: false, known: true }), '3');
    equal(autoCountText({ shown: 10, total: 10, inFlow: 10, searching: false, known: true }), '10', 'כולן במסלול');
    equal(autoCountText({ shown: 10, total: 10, inFlow: 0, searching: false, known: false }), '10', 'המסלולים לא נטענו — לא טוענים «לא במסלול»');
    equal(autoCountText({ shown: 2, total: 10, inFlow: 3, searching: true, known: true }), '2 מתוך 10');
    equal(autoOffText(7), 'ועוד 7 שלא במסלול הקליטה');
    equal(autoOffText(1), 'ועוד אחת שלא במסלול הקליטה');
  }),

  test('שורת התוצאה בחיפוש: סופרים רק מה שנפתח; מה שלא במסלול — בנפרד', () => {
    equal(autoResultText(0, 4), 'אין בקשה כזו ברשימה — יש 4 שאפשר להוסיף למסלול הקליטה.', '«פייפרלס»: אף אחת לא נפתחת');
    equal(autoResultText(1, 2), 'אין בקשה כזו ברשימה — יש אחת שנפתחת אוטומטית בקליטה · ועוד 2 שלא במסלול הקליטה.', '«רו"ח»');
    equal(autoResultText(2, 0), 'אין בקשה כזו ברשימה — יש 2 שנפתחות אוטומטית בקליטה.');
    equal(autoResultText(0, 0), null);
    equal(gapsLineText(1), 'בקשה אחת לא תיפתח כמו שהיא');
    equal(gapsLineText(3), '3 בקשות לא ייפתחו כמו שהן');
  }),

  test('כל בקשה פעם אחת: נוסח מוכן מסוג קבוע עומד לבקשת המערכת מאותו סוג', () => {
    equal(systemTypeOf(seedDocs), 'client_documents');
    const copy: RequestTemplate = { ...seedDocs, id: 'c', officeId: 'o1' };
    equal(systemTypeOf(copy), 'client_documents', 'העותק של המשרד — אותו seed_key');
    equal(systemTypeOf({ ...seedDocs, id: 'x', seedKey: null }), null, 'בקשת מסמכים בלי seed_key — לא הפריט בקליטה');
    equal(systemTypeOf(custom('a', 'א', ['confirm'])), null, 'בקשה חופשית');
    const withholding: RequestTemplate = { ...custom('w', 'אישורי ניכוי', ['files']), officeId: null, seedKey: 'withholding' };
    equal(systemTypeOf(withholding), null, 'נוסח מוכן חופשי — אין בקשת מערכת כזו');
  }),

  test('«עריכה» של שורה שהנוסח שלה לא מגיע לאף לקוח — בפריט במסלול הקליטה', () => {
    const prev: RequestTemplate = { ...seedDocs, id: 'p', name: 'פרטי הרו״ח הקודם', seedKey: 'prev_accountant_details',
      entries: [{ stepType: 'prev_accountant_details', owner: 'client', payload: {} }] };
    equal(editsInIntake(prev), true, 'פרטי הרו״ח הקודם: בקליטה הנוסח בפריט, ובכרטיס נוסח קבוע');
    equal(editsInIntake(seedDocs), false, 'מסמכים מהלקוח: הכרטיס ומסלולים חוזרים קוראים את הרשימה כאן');
    equal(editsInIntake(custom('a', 'א', ['confirm'])), false);
    const q: RequestTemplate = { ...prev, id: 'q', entries: [{ stepType: 'intake_questionnaire', payload: {} }] };
    equal(editsInIntake(q), false, '«עדכון סטטוס מס» — הכרטיס קורא את הנוסח כאן');
  }),

  test('לאילו סוגי לקוח — הרשימה הקצרה, וריק כשכולם', () => {
    equal(kindsNote(['company']), 'רק לחברה');
    equal(kindsNote(['exempt_dealer', 'licensed_dealer', 'tax_refund', 'representation_only']), 'לא לחברה');
    equal(kindsNote(['licensed_dealer', 'company']), 'רק לעוסק מורשה וחברה');
    equal(kindsNote(['exempt_dealer', 'licensed_dealer', 'company', 'tax_refund', 'representation_only']), '');
    equal(kindsNote([]), '');
  }),

  test('«בשימוש ב»: נוסח מוכן מסוג קבוע סופר גם את הפריט בקליטה, והקישור נוחת על הפריט', () => {
    const flows = [{
      id: 'f-onb', name: 'קליטת לקוח חדש', trigger: 'quote_approved', status: 'active', currentVersion: 1,
      definition: { stages: [{ key: 's1', name: 'פתיחת התיק', opens: { after: 'start' }, delivery: 'hold', items: [
        { key: 'client_documents', ref: { kind: 'system', stepType: 'client_documents' } },
        { key: 'fee', ref: { kind: 'template', templateId: 'own-a' }, when: { kinds: ['company'] } },
      ] }] },
    }, {
      id: 'f-y', name: 'דוח שנתי', trigger: 'annual', status: 'active', currentVersion: 1,
      definition: { stages: [{ key: 'a1', name: 'איסוף', opens: { after: 'start' }, delivery: 'approve', items: [
        { key: 'docs', ref: { kind: 'template', templateId: 's-docs' } },
      ] }] },
    }] as OfficeFlow[];
    const u = libraryUses(flows, byLibraryRow(seedDocs));
    deepEqual(u.map(x => [x.flowName, x.stageName, x.system]), [['קליטת לקוח חדש', 'פתיחת התיק', true], ['דוח שנתי', 'איסוף', false]]);
    equal(focusOfUse(u[0]), 'flow:f-onb:s1:client_documents', 'בקליטה — על הפריט');
    equal(focusOfUse(u[1]), 'flow:f-y:a1', 'הפניה רגילה — על השלב');
    const own = libraryUses(flows, byLibraryRow(custom('own-a', 'אישור תנאי שכר טרחה', ['confirm'])));
    deepEqual(own.map(x => kindsNote(x.kinds)), ['רק לחברה'], 'שתי שורות באותו שם נבדלות בסוג');
    equal(libraryUses(flows, byLibraryRow({ ...seedDocs, id: 'z', seedKey: null })).length, 0, 'בלי seed_key — לא הפריט בקליטה');
  }),

  test('אפשר לשבץ במסלול: בקשה חופשית ומסמכים — כן; «אחד ללקוח» — רק מהכרטיס', () => {
    equal(canBeInFlow(custom('a', 'א', ['confirm'])), true);
    equal(canBeInFlow(seedDocs), true);
    const prev: RequestTemplate = { ...seedDocs, id: 'p', name: 'פרטי הרו״ח הקודם', seedKey: 'prev_accountant_details',
      entries: [{ stepType: 'prev_accountant_details', owner: 'client', payload: {} }] };
    equal(canBeInFlow(prev), false);
  }),
];
