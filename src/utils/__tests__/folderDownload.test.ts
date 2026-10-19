// ─── בדיקות: מה יורד כשמסמנים מסמכים ותיקיות (19.10.2026) ──────────────────
// ‼ החוזה: תיקייה שנבחרה יורדת עם כל מה שבתוכה, בעומק; מה שכבר בתוך תיקייה נבחרת
// יורד פעם אחת, במקומו; שמות זהים באותה תיקייה מקבלים « (2)»; שמות אסורים ב-Windows מנוקים.

import { test, equal, deepEqual } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import { planDownload, zipPath, type PlanFolder, type PlanDoc } from '../folderDownload';

const F = (id: string, name: string, parentId: string | null = null): PlanFolder => ({ id, name, parentId });
const D = (id: string, fileName: string, folderId: string | null = null): PlanDoc => ({ id, fileName, folderId, uploadedAt: '2026-10-12T10:00:00Z' });

const folders = [F('poa', 'ייפוי כוח'), F('id', 'תעודת זהות - אמיר'), F('sub', 'סרוקים', 'poa'), F('empty', 'ריקה')];
const docs = [
  D('d1', 'ייפוי כוח.pdf', 'poa'), D('d2', 'נספח.pdf', 'sub'), D('d3', 'ת.ז.jpg', 'id'),
  D('d4', 'אישור ניהול חשבון.pdf'), D('d5', 'אישור ניהול חשבון.pdf'), D('d6', 'לא נבחר.pdf'),
];
const paths = (p: ReturnType<typeof planDownload>) => p.files.map(zipPath).sort();

export const TESTS: TestCase[] = [
  test('תיקייה נבחרת יורדת עם כל מה שבתוכה, כולל תת-תיקיות', () => {
    const p = planDownload([folders[0]], [], folders, docs);
    deepEqual(paths(p), ['ייפוי כוח/ייפוי כוח.pdf', 'ייפוי כוח/סרוקים/נספח.pdf']);
    deepEqual(p.dirs.map(d => d.join('/')), ['ייפוי כוח', 'ייפוי כוח/סרוקים']);
  }),
  test('בחירה מעורבת: תיקיות כתת-תיקיות, מסמכים בשורש, ומה שלא נבחר — לא יורד', () => {
    const p = planDownload([folders[0], folders[1]], [docs[3]], folders, docs);
    deepEqual(paths(p), ['אישור ניהול חשבון.pdf', 'ייפוי כוח/ייפוי כוח.pdf', 'ייפוי כוח/סרוקים/נספח.pdf', 'תעודת זהות - אמיר/ת.ז.jpg']);
  }),
  test('מסמך או תיקייה שכבר בתוך תיקייה נבחרת (בחירה מחיפוש) — פעם אחת, במקומם', () => {
    const p = planDownload([folders[0], folders[2]], [docs[1], docs[0]], folders, docs);
    deepEqual(paths(p), ['ייפוי כוח/ייפוי כוח.pdf', 'ייפוי כוח/סרוקים/נספח.pdf']);
  }),
  test('שני מסמכים באותו שם באותה תיקייה — השני מקבל « (2)»', () => {
    const p = planDownload([], [docs[3], docs[4]], folders, docs);
    deepEqual(paths(p), ['אישור ניהול חשבון (2).pdf', 'אישור ניהול חשבון.pdf']);
  }),
  test('תיקייה ריקה: נוצרת כתיקייה, בלי קבצים', () => {
    const p = planDownload([folders[3]], [], folders, docs);
    equal(p.files.length, 0);
    deepEqual(p.dirs, [['ריקה']]);
  }),
  test('שם תיקייה עם תווים שאסורים ב-Windows (רו"ח) — מנוקה, לא נכשל', () => {
    const odd = [F('x', 'רו"ח קודם: 2025')];
    const p = planDownload(odd, [], odd, [D('a', 'מכתב.pdf', 'x')]);
    equal(p.files.length, 1);
    equal(/["<>:|?*\\/]/.test(p.files[0].dir[0]), false, `שם בטוח: ${p.files[0].dir[0]}`);
  }),
];
