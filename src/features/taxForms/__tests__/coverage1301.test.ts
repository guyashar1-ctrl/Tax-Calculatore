// ─── בדיקות: מפת הכיסוי של 1301 (10.10.2026, סבב 3) ────────────────────────
// ‼ מה נעול כאן:
//   · הקטלוג שנקרא מהטופס מלא ועקבי: 305 רשומות, מזהים ייחודיים.
//   · כל שדה שמופה במלואו קיים בקטלוג באותו קוד — המיפוי לא ממציא שדות.
//   · כל שדה בכרטיס שמפת הכיסוי מפנה אליו קיים בטיפוס Client.
//   · «בתיק» מוגבל לנתונים שמתאימים ישירות; השאר «חלקי», «חסר», «בהגשה» או «לא נבדק».

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { CATALOG_1301_2025, coverage1301, coverageSummary, ANNEX_CATALOG_2025, ANNEX_FILE_LINKS, ANNEX_INFO_2025, FILL_CAPABILITY } from '../coverage1301';
import { FIELDS_1301_2025 } from '../form1301';
import TYPES_SRC from '../../../types/index.ts?raw';

const clientBlock = TYPES_SRC.slice(TYPES_SRC.indexOf('export interface Client {'), TYPES_SRC.indexOf('\n}', TYPES_SRC.indexOf('export interface Client {')));
const clientHas = (k: string) => new RegExp(`\\n\\s+${k}\\??:`).test(clientBlock);

export const TESTS: TestCase[] = [
  test('הקטלוג: 305 רשומות, מזהים ייחודיים, לכל אחת חלק וסוג', () => {
    equal(CATALOG_1301_2025.length, 305);
    equal(new Set(CATALOG_1301_2025.map(e => e.id)).size, 305);
    for (const e of CATALOG_1301_2025) assert(e.part && e.kind && e.label, e.id);
  }),

  test('כל שדה שמופה במלואו קיים בקטלוג באותו קוד', () => {
    const codes = new Set(CATALOG_1301_2025.map(e => [e.codes?.registered, e.codes?.spouse].filter(Boolean).join('/')));
    for (const f of FIELDS_1301_2025) {
      const c = [f.codes.registered, f.codes.spouse].filter(Boolean).join('/');
      assert(codes.has(c), `${f.key}: קוד ${c} לא נמצא בקטלוג`);
    }
    const rows = coverage1301();
    equal(rows.filter(r => r.read === 'mapped').length, FIELDS_1301_2025.length);
  }),

  test('כל שדה בכרטיס שהמפה מפנה אליו קיים בטיפוס Client', () => {
    const keys = new Set([...coverage1301().flatMap(r => r.fileKeys), ...Object.values(ANNEX_FILE_LINKS).flatMap(l => l.keys)]);
    for (const k of keys) assert(clientHas(k), `Client.${k} לא קיים`);
  }),

  test('סיווג: כל רשומה מסווגת; «בתיק» רק עם שדה בכרטיס; סיכום עקבי', () => {
    const rows = coverage1301();
    const s = coverageSummary(rows);
    equal(Object.values(s.file).reduce((a, b) => a + (b ?? 0), 0), 305);
    for (const r of rows) {
      if (r.file === 'inFile' || r.file === 'partialInFile') assert(r.fileKeys.length > 0, `${r.entry.id}: «${r.file}» בלי שדה בכרטיס`);
    }
    assert((s.file.missingInFile ?? 0) > (s.file.inFile ?? 0), 'רוב השדות השנתיים חסרים בתיק — כצפוי לפני שלב 2');
  }),

  test('נספחים: 11 נספחים נקראו, לכל אחד קישור לתיק', () => {
    equal(ANNEX_CATALOG_2025.length, 11);
    for (const a of ANNEX_CATALOG_2025) assert(ANNEX_FILE_LINKS[a.formId], `${a.formId}: קישור לתיק`);
  }),
  test('מידע לאיסוף בנספחים: לכל נספח שנקרא — פריטי מידע תקינים; שדות בכרטיס קיימים; אין יכולת מילוי (שלב 4)', () => {
    const SRC = new Set(['fileFact', 'document', 'client', 'calculation', 'office']);
    const ST = new Set(['inFile', 'partialInFile', 'missingInFile', 'office']);
    for (const a of ANNEX_CATALOG_2025) {
      const info = ANNEX_INFO_2025.find(x => x.formId === a.formId);
      assert(info && info.items.length > 0, a.formId + ': יש פריטי מידע');
      for (const i of info!.items) {
        assert(SRC.has(i.source) && ST.has(i.fileState), i.key + ': מקור ומצב תקינים');
        assert(i.annexFields.length > 0, i.key + ': מקושר לשדות הנספח');
        for (const k of i.fileKeys) assert(clientHas(k), i.key + ': Client.' + k);
        if (i.fileState === 'inFile' || i.fileState === 'partialInFile') assert(i.fileKeys.length > 0, i.key + ': בתיק בלי שדה');
      }
      equal(FILL_CAPABILITY[a.formId], a.formId === '1320' || a.formId === '1321' ? 'draft' : 'none');
    }
    equal(ANNEX_INFO_2025.reduce((n, a) => n + a.items.length, 0), 131);
  }),
  test('קריאות לא ודאיות: נשארו רק סעיף 65 וב/ס/מ; 1342 נקרא במלואו; 361/362 — שתי ספרות בתיבה אחת', () => {
    const unc = CATALOG_1301_2025.filter(f => f.uncertain).map(f => f.id).sort();
    equal(unc.join(','), 'F231,F293');
    const a1342 = ANNEX_CATALOG_2025.find(a => a.formId === '1342')!;
    equal(a1342.readStatus, 'read');
    for (const id of ['F226', 'F227', 'F228', 'F229']) {
      const f = CATALOG_1301_2025.find(x => x.id === id) as unknown as { encoding?: string };
      assert(!!f.encoding && f.encoding.includes('ספרה שמאלית אפורה'), id + ': חסר קידוד שתי הספרות');
    }
    assert(ANNEX_CATALOG_2025.every(a => a.readStatus === 'read'), 'כל 11 הנספחים נקראו');
  }),
];
