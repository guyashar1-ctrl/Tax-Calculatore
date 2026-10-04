// ─── בדיקות: «המשרד» — עמודים, טיוטה, ניקוי קבצים, כתובת (1.10.2026) ─────────
// ‼ הבאגים שהבדיקות האלה נועלות:
//   · החלפת לוגו/חתימה/חותמת מחקה את הקובץ הקודם **לפני** השמירה — יציאה בלי
//     שמירה השאירה את הרשומה מצביעה על קובץ שנמחק.
//   · שמירת «בקשות ללקוח חדש» לסוג אחד דרסה טיוטה פתוחה של סוג אחר.
//   · מתג תזכורת הפקיעה (מייל ללקוח) נספר כ«התראות למשרד».
//   · (סבב 3) כתובת שמורה לעמוד שאוחד נפלה על «פרטי המשרד» במקום על החלק הנכון.
//   · (2.10, ספרייה ומסלולים) «בקשות ללקוחות», «מסמכים» ו«תזכורות והתראות» התפרקו —
//     כתובת ישנה חייבת לנחות על העמוד שקיבל את התוכן, לא על «פרטי המשרד».

import { test, equal, deepEqual, includes, excludes } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { FirmProfile } from '../../../types/firmProfile';
import type { DefaultEntry } from '../../../types/journeyDefaults';
import {
  OFFICE_PAGES, resolveOfficePage, resolveOfficeLocation, dirtyPages, dirtyParts,
  assetRefs, refsToDeleteAfterSave, refsToDeleteOnDiscard, assetRef, LOGO_BUCKET,
} from '../officeModel';
import { changedKinds, mergeLoaded, entriesOf } from '../intakeModel';
import { formatRoute, parseHash } from '../../../lib/appRoute';
import { FIRM_PRIVATE_BUCKET } from '../../../utils/firmBuckets';
import { GUIDE_BUCKET } from '../../../lib/clientGuide';

const base = (): FirmProfile => ({
  id: 'f1', email: 'office@x.co.il', firmName: 'משרד',
  branding: { logoPath: 'f1/logo-1.png', logoUrl: 'u1', stampPath: 'f1/stamp-1.png', signaturePath: 'f1/sig-1.png' },
  communication: { replyTo: 'r@x.co.il' },
  settings: {
    accountantNotifications: {},
    client_documents: [{ id: 'd1', label: 'מדריך', path: 'f1/d1-2.pdf', url: 'x', fileName: 'a.pdf', at: '2026-01-01',
      history: [{ path: 'f1/d1-1.pdf', url: 'y', fileName: 'old.pdf', at: '2025-01-01' }] }],
  },
});

const entry = (stepType: string, extra: Partial<DefaultEntry> = {}): DefaultEntry => ({
  key: stepType, stepType, enabled: true, sortIndex: 10, source: 'system',
  requiredForClose: null, dueInDays: null, dependsOn: null, variants: [], ...extra,
});

export const TESTS: TestCase[] = [
  // ── מבנה ─────────────────────────────────────────────────────────────────
  test('שמונה יעדים, כל אחד פעם אחת, וכל אחד עם שורה שאומרת מה יש בו', () => {
    equal(OFFICE_PAGES.length, 8);
    deepEqual(OFFICE_PAGES.map(p => p.id), ['profile', 'team', 'library', 'flows', 'pricing', 'emails', 'automations', 'connections']);
    const ids = OFFICE_PAGES.map(p => p.id);
    equal(new Set(ids).size, ids.length, 'אין עמוד כפול');
    for (const p of OFFICE_PAGES) equal(p.blurb.length > 10, true, `לעמוד ${p.id} יש שורת הסבר`);
  }),

  test('שמות ישנים מקישורים שמורים נוחתים על העמוד החדש — ופותחים את החלק הנכון', () => {
    equal(resolveOfficePage('requests'), 'flows');
    equal(resolveOfficePage('requestDefaults'), 'flows');
    equal(resolveOfficePage('intake'), 'flows');
    equal(resolveOfficePage('guide'), 'flows');
    equal(resolveOfficePage('processes'), 'flows');
    equal(resolveOfficePage('library'), 'library');
    equal(resolveOfficePage('flows'), 'flows');
    deepEqual(resolveOfficeLocation('library'), { page: 'library' });
    deepEqual(resolveOfficeLocation('templates'), { page: 'library', focus: 'requests' });
    deepEqual(resolveOfficeLocation('documents'), { page: 'library', focus: 'documents' });
    deepEqual(resolveOfficeLocation('clientDocs'), { page: 'library', focus: 'documents' });
    equal(resolveOfficePage('quotations'), 'pricing');
    equal(resolveOfficePage('messages'), 'emails');
    equal(resolveOfficePage('automations'), 'automations');
    equal(resolveOfficePage('automation'), 'automations');
    equal(resolveOfficePage('employees'), 'team');
    deepEqual(resolveOfficeLocation('signature'), { page: 'profile', focus: 'signature' });
    deepEqual(resolveOfficeLocation('email'), { page: 'profile', focus: 'sender' });
    deepEqual(resolveOfficeLocation('contact'), { page: 'profile', focus: 'details' });
    deepEqual(resolveOfficeLocation('emailActivity'), { page: 'emails', focus: 'log' });
    deepEqual(resolveOfficeLocation('portalCard'), { page: 'emails', focus: 'rep:portal' });
    deepEqual(resolveOfficeLocation('notifications'), { page: 'automations', focus: 'notifications' });
    deepEqual(resolveOfficeLocation('reminders'), { page: 'automations', focus: 'reminders' });
    deepEqual(resolveOfficeLocation('representation'), { page: 'flows', focus: 'representation' });
    deepEqual(resolveOfficeLocation('shaamWarmup'), { page: 'connections', focus: 'shaam' });
    deepEqual(resolveOfficeLocation('paperless'), { page: 'connections', focus: 'paperless' });
    equal(resolveOfficePage('לא-קיים'), null);
    equal(resolveOfficePage(null), null);
  }),

  test('כתובת · ‎#/firm/<עמוד>‎ נשמרת ונקראת, ובלי עמוד — המשרד בלבד', () => {
    equal(formatRoute({ view: 'firmProfile', officePage: 'flows' }), '/firm/flows');
    deepEqual(parseHash('#/firm/flows'), { view: 'firmProfile', officePage: 'flows' });
    deepEqual(parseHash('#/firm'), { view: 'firmProfile' });
    equal(formatRoute({ view: 'firmProfile' }), '/firm');
  }),

  // ── איזה עמוד שינית ─────────────────────────────────────────────────────
  test('שינוי שם המשרד מסמן רק את «פרטי המשרד»', () => {
    const d = { ...base(), firmName: 'אחר' };
    deepEqual(dirtyPages(d, base()), ['profile']);
    deepEqual(dirtyParts(d, base()).map(p => p.label), ['פרטי המשרד']);
  }),

  test('מתג תזכורת הפקיעה (מייל ללקוח) נספר כ«תזכורות», לא כ«הודעות אליך» — שניהם ב«אוטומציות»', () => {
    const s = base();
    const d = { ...s, settings: { ...s.settings, accountantNotifications: { quotation_expiry_reminder: true } } };
    deepEqual(dirtyParts(d, s), [{ page: 'automations', label: 'תזכורות' }]);
    const d2 = { ...s, settings: { ...s.settings, accountantNotifications: { client_document_uploaded: true } } };
    deepEqual(dirtyParts(d2, s), [{ page: 'automations', label: 'הודעות אליך' }]);
  }),

  test('ייצוג מתחלק בין שלושה עמודים: מסומן מראש (מסלולים), נוסחים, תזכורות (אוטומציות)', () => {
    const s = base();
    const rep = (r: Record<string, unknown>) => ({ ...s, settings: { ...s.settings, representation: r } });
    deepEqual(dirtyParts(rep({ defaults: { niSpouse: false } }), s), [{ page: 'flows', label: 'ייצוג' }]);
    deepEqual(dirtyParts(rep({ templates: { rep_sign: { subject: 'x' } } }), s), [{ page: 'emails', label: 'נוסחי מיילים' }]);
    deepEqual(dirtyParts(rep({ reminders: { sign: { enabled: true } } }), s), [{ page: 'automations', label: 'תזכורות' }]);
  }),

  test('קבצי הספרייה נספרים ב«ספרייה»', () => {
    const s = base();
    const d = { ...s, settings: { ...s.settings, client_documents: [] } };
    deepEqual(dirtyParts(d, s), [{ page: 'library', label: 'מסמכים' }]);
  }),

  test('החלפת חתימה מסמנת «חתימה וחותמת»; לוגו — «לוגו»; הגדרה לא מוכרת — «הגדרות נוספות»', () => {
    const s = base();
    deepEqual(dirtyParts({ ...s, branding: { ...s.branding, signaturePath: 'f1/sig-2.png' } }, s).map(p => p.label), ['חתימה וחותמת']);
    deepEqual(dirtyParts({ ...s, branding: { ...s.branding, logoScale: 1.2 } }, s).map(p => p.label), ['לוגו']);
    deepEqual(dirtyPages({ ...s, branding: { ...s.branding, logoScale: 1.2 }, firmName: 'x' }, s), ['profile']);
    deepEqual(dirtyPages({ ...s, settings: { ...s.settings, somethingNew: 1 } }, s), ['other']);
    deepEqual(dirtyParts({ ...s, settings: { ...s.settings, paperless: { inviteUrl: 'https://x' } } }, s), [{ page: 'connections', label: 'פייפרלס' }]);
  }),

  test('סדר מפתחות שונה (jsonb) אינו שינוי', () => {
    const s = base();
    const reordered: FirmProfile = { ...s, communication: { replyTo: 'r@x.co.il' }, settings: { client_documents: s.settings.client_documents, accountantNotifications: {} } };
    deepEqual(dirtyPages(reordered, s), []);
  }),

  // ── קבצים: מה מוחקים ומתי ────────────────────────────────────────────────
  test('אחרי שמירה: הלוגו הקודם נמחק, החדש נשאר', () => {
    const prev = base();
    const next = { ...prev, branding: { ...prev.branding, logoPath: 'f1/logo-2.png' } };
    const uploaded = new Set([assetRef(LOGO_BUCKET, 'f1/logo-2.png')]);
    deepEqual(refsToDeleteAfterSave(prev, next, uploaded), [assetRef(LOGO_BUCKET, 'f1/logo-1.png')]);
  }),

  test('אחרי שמירה: קובץ שהועלה והוחלף שוב לפני השמירה נמחק גם הוא', () => {
    const prev = base();
    const next = { ...prev, branding: { ...prev.branding, stampPath: 'f1/stamp-3.png' } };
    const uploaded = new Set([assetRef(FIRM_PRIVATE_BUCKET, 'f1/stamp-2.png'), assetRef(FIRM_PRIVATE_BUCKET, 'f1/stamp-3.png')]);
    const del = refsToDeleteAfterSave(prev, next, uploaded);
    includes(del, assetRef(FIRM_PRIVATE_BUCKET, 'f1/stamp-1.png'));
    includes(del, assetRef(FIRM_PRIVATE_BUCKET, 'f1/stamp-2.png'));
    excludes(del, assetRef(FIRM_PRIVATE_BUCKET, 'f1/stamp-3.png'));
  }),

  test('קבצי הספרייה שהיו שמורים לעולם אינם נמחקים — גם כשהמסמך הוסר', () => {
    const prev = base();
    const next = { ...prev, settings: { ...prev.settings, client_documents: [] } };
    const del = refsToDeleteAfterSave(prev, next, new Set());
    excludes(del, assetRef(GUIDE_BUCKET, 'f1/d1-2.pdf'));
    excludes(del, assetRef(GUIDE_BUCKET, 'f1/d1-1.pdf'));
  }),

  test('גרסה קודמת בספרייה נחשבת «בשימוש»', () => {
    const refs = assetRefs(base());
    equal(refs.has(assetRef(GUIDE_BUCKET, 'f1/d1-1.pdf')), true);
  }),

  test('ביטול: נמחק רק מה שהועלה ולא נשמר', () => {
    const saved = base();
    const uploaded = new Set([assetRef(FIRM_PRIVATE_BUCKET, 'f1/sig-9.png'), assetRef(FIRM_PRIVATE_BUCKET, 'f1/sig-1.png')]);
    deepEqual(refsToDeleteOnDiscard(saved, uploaded), [assetRef(FIRM_PRIVATE_BUCKET, 'f1/sig-9.png')]);
  }),

  // ── בקשות ללקוח חדש ─────────────────────────────────────────────────────
  test('טיוטה לכל סוג: רק סוג שנערך ושונה נחשב «לא נשמר»', () => {
    const saved = { licensed_dealer: [entry('a'), entry('b')], company: [entry('a')] };
    const draft = { licensed_dealer: [entry('a')], company: [entry('a')] };
    deepEqual(changedKinds(draft, saved), ['licensed_dealer']);
  }),

  test('טעינה מחדש אחרי שמירת סוג אחד לא דורסת טיוטה פתוחה של סוג אחר', () => {
    const prevSaved = { licensed_dealer: [entry('a'), entry('b')], company: [entry('a'), entry('c')] };
    const draft = { licensed_dealer: [entry('a')], company: [entry('a')] };
    const merged = mergeLoaded(draft, prevSaved);
    deepEqual(Object.keys(merged).sort(), ['company', 'licensed_dealer']);
    const afterSaveOfDealer = mergeLoaded({ company: [entry('a')] }, prevSaved);
    deepEqual(afterSaveOfDealer.company, [entry('a')]);
    equal(afterSaveOfDealer.licensed_dealer, undefined);
  }),

  test('סוג שלא נערך נקרא מהשמור', () => {
    const saved = { company: [entry('x')] };
    deepEqual(entriesOf({}, saved, 'company'), [entry('x')]);
    deepEqual(entriesOf({}, saved, 'tax_refund'), []);
  }),
];
