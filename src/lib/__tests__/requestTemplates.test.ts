// ─── בדיקות: הספרייה — עותק של המשרד מול הנוסח המוכן (3.10.2026) ──────────────
// ‼ מה נעול כאן:
//   · עותק של המשרד מסתיר את המובנית עם אותו מפתח, ונושא את מזהיה ואת הנוסח שלה —
//     בלי זה «חזרה לנוסח המוכן» לא יודעת מה חוזר, ופריט במסלול שמצביע על המובנית
//     לא נמצא (templateForRef).
//   · עותק בלי מובנית קיימת — בקשה רגילה של המשרד (אין לאן לחזור).
//   · עותק שלא שונה בפועל נחשב «נוסח מוכן»; שינוי שם/פריט/בעלים — לא.

import { test, equal, deepEqual, assert } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import { differsFromTemplate, mergeOfficeOverrides, matchesPreset, templateForRef, refersTo, type RequestTemplate } from '../requestTemplates';

const docsEntry = (labels: string[]) => ({
  key: 'e1', stepType: 'client_documents', owner: 'client' as const, requiredForClose: true,
  payload: { checklist: labels.map((label, i) => ({ key: `d${i}`, label, done: false })), clientTitle: `להעלות ${labels.length} מסמכים`, clientCta: 'להעלאה' },
});

const seed: RequestTemplate = {
  id: 'seed-docs', name: 'מסמכים מהלקוח', description: 'מובנית', kind: 'request', officeId: null, seedKey: 'client_documents',
  entries: [docsEntry(['צילום תעודת זהות', 'אישור ניהול חשבון בנק'])],
};
const seedPrev: RequestTemplate = {
  id: 'seed-prev', name: 'פרטי הרו״ח הקודם', kind: 'request', officeId: null, seedKey: 'prev_accountant_details',
  entries: [{ stepType: 'prev_accountant_details', payload: { clientTitle: 'פרטי רואה החשבון הקודם שלך' } }],
};
const copy: RequestTemplate = {
  id: 'copy-docs', name: 'מסמכים מהלקוח', kind: 'request', officeId: 'office-1', seedKey: 'client_documents',
  entries: [docsEntry(['צילום תעודת זהות', 'אישור ניהול חשבון בנק', 'תעודת עוסק'])],
};
const own: RequestTemplate = {
  id: 'own-1', name: 'אישור שכר טרחה', kind: 'request', officeId: 'office-1', seedKey: null,
  entries: [{ stepType: 'custom_request', owner: 'client', payload: { title: 'אישור שכר טרחה', requirements: [{ key: 'r1', kind: 'confirm', label: 'מאשר' }] } }],
};

export const TESTS: TestCase[] = [
  test('עותק של המשרד מסתיר את המובנית ונושא את מזהיה ואת הנוסח שלה', () => {
    const out = mergeOfficeOverrides([seed, seedPrev, copy, own]);
    deepEqual(out.map(t => t.id), ['seed-prev', 'copy-docs', 'own-1']);
    const c = out.find(t => t.id === 'copy-docs')!;
    deepEqual(c.overrides, ['seed-docs']);
    equal(c.preset?.id, 'seed-docs');
    equal(c.preset?.name, 'מסמכים מהלקוח');
  }),

  test('פריט במסלול שמצביע על המובנית מגיע לעותק של המשרד', () => {
    const out = mergeOfficeOverrides([seed, copy]);
    equal(templateForRef(out, 'seed-docs')?.id, 'copy-docs');
    assert(refersTo(out[0], 'seed-docs'), 'העותק «מתייחס» למזהה המובנית');
  }),

  test('מובנית בלי עותק נשארת, ובלי preset', () => {
    const out = mergeOfficeOverrides([seed, seedPrev]);
    deepEqual(out.map(t => t.id), ['seed-docs', 'seed-prev']);
    equal(out[0].preset, undefined);
  }),

  test('עותק בלי מובנית קיימת — בקשה רגילה של המשרד, אין לאן לחזור', () => {
    const orphan: RequestTemplate = { ...copy, id: 'orphan', seedKey: 'gone_seed' };
    const [o] = mergeOfficeOverrides([orphan]);
    deepEqual(o.overrides, []);
    equal(o.preset, undefined);
    equal(matchesPreset(o), false);
  }),

  test('לא משנה את הקלט', () => {
    const rows = [seed, copy];
    mergeOfficeOverrides(rows);
    equal(copy.overrides, undefined);
    equal(copy.preset, undefined);
  }),

  test('עותק זהה לנוסח המוכן — «נוסח מוכן»; שינוי שם, פריט, בעלים או חובה — לא', () => {
    const same: RequestTemplate = { ...copy, entries: seed.entries };
    equal(matchesPreset(mergeOfficeOverrides([seed, same])[0]), true, 'זהה');
    equal(matchesPreset(mergeOfficeOverrides([seed, copy])[0]), false, 'נוסף מסמך');
    equal(matchesPreset(mergeOfficeOverrides([seed, { ...same, name: 'מסמכים לפתיחה' }])[0]), false, 'שם אחר');
    equal(matchesPreset(mergeOfficeOverrides([seed, { ...same, entries: [{ ...seed.entries[0], owner: 'me' }] }])[0]), false, 'בעלים אחר');
    equal(matchesPreset(mergeOfficeOverrides([seed, { ...same, entries: [{ ...seed.entries[0], requiredForClose: false }] }])[0]), false, 'רשות');
  }),

  // ‼ בבקשה חופשית בספרייה title הוא תמיד שם הבקשה — שינוי בכותרת ללקוח בלבד חייב להיראות.
  test('עותק שבו שונתה רק הכותרת ללקוח — לא «נוסח מוכן»', () => {
    const freeEntry = (clientTitle: string) => ({
      key: 'e1', stepType: 'custom_request', owner: 'client' as const, requiredForClose: true,
      payload: { title: 'אישורי ניכוי מס במקור', clientTitle, clientCta: 'להעלאה',
        requirements: [{ key: 'r1', kind: 'files', label: 'אישורי ניכוי במקור', required: true }] },
    });
    const freeSeed: RequestTemplate = { id: 'seed-w', name: 'אישורי ניכוי מס במקור', kind: 'request', officeId: null, seedKey: 'withholding',
      entries: [freeEntry('אישורי ניכוי מס במקור מהלקוחות')] };
    const sameCopy: RequestTemplate = { ...freeSeed, id: 'copy-w', officeId: 'office-1' };
    const titled: RequestTemplate = { ...sameCopy, entries: [freeEntry('אישורי ניכוי מס במקור — מכל משלם')] };
    equal(matchesPreset(mergeOfficeOverrides([freeSeed, sameCopy])[0]), true, 'זהה');
    equal(matchesPreset(mergeOfficeOverrides([freeSeed, titled])[0]), false, 'כותרת ללקוח אחרת');
  }),

  test('הקומפוזר בכרטיס (title בלבד, בלי clientTitle) — נבדק כמו קודם', () => {
    const e = { stepType: 'custom_request', payload: { title: 'אישור', clientTitle: 'אישור ללקוח', requirements: [{ label: 'מאשר', kind: 'confirm' }] } };
    equal(differsFromTemplate(e, { title: 'אישור', requirements: [{ label: 'מאשר', kind: 'confirm', required: true }] }), false);
    equal(differsFromTemplate(e, { title: 'אישור חדש', requirements: [{ label: 'מאשר', kind: 'confirm', required: true }] }), true);
  }),
];
