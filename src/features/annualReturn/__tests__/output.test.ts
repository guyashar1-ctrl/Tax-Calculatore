// הפקת טיוטת 1301: הקובץ והגיליון נפתחים מחדש לאותם ערכים; סימונים, עברית וסטטוס.
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import type { YearFact } from '../../taxYear/types';
import { computeReturn } from '../engine';
import { fileFromHtml, parseReturnFile, returnFile, returnHtml, verifyReopened } from '../output';

const f = (itemKey: string, value: unknown, entityRef?: string): YearFact => ({ id: `x-${itemKey}-${entityRef ?? ''}`, clientId: 'c1', taxYear: 2025, itemKey, subjectRole: 'client', entityRef, periodKind: 'year',
  periodFrom: '2025-01-01', periodTo: '2025-12-31', answer: 'value', value, basis: 'final', source: 'office', status: 'accepted', createdAt: '2026-02-01T10:00:00Z' });
const client = { id: 'c1', firstName: 'דוד', lastName: 'כהן', gender: 'male', familyStatus: 'single', birthDate: '1985-05-01', children: [], employers: [{ id: 'em1', name: 'חברה' }], businesses: [{ id: 'bz1', name: 'ייעוץ' }],
  properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], fieldMeta: {}, spouse: null } as unknown as Client;
const out = () => computeReturn({ client, draft: { taxYear: 2025, preparedOn: '2026-03-01', persons: ['client'], completions: [], adjustments: [], decisions: [], micro: { bz1: { track: 'micro', registeredAtYearStart: true, reporting: 'full' } } },
  facts: [f('salary.amounts', { gross: 50_000, withheld: 1_000 }, 'em1'), f('business.profit', { profit: 40_000, turnover: 80_000 }, 'bz1')], evidence: [] });

export const TESTS: TestCase[] = [
  test('קובץ הנתונים נפתח מחדש לאותם קודים, סכומים וסימונים', () => {
    const o = out();
    const text = JSON.stringify(returnFile(o, { clientName: 'דוד כהן', version: 1, approved: false }));
    equal(verifyReopened(o, parseReturnFile(text)).length, 0);
    const tampered = JSON.parse(text); tampered.fields.find((x: { amount?: number }) => x.amount != null).amount = 1;
    assert(verifyReopened(o, tampered).some(x => x.includes('סכום שונה')), 'שינוי סכום מתגלה');
  }),
  test('הגיליון: עברית RTL, קודים בסדר חלקים, סימון «בעל עסק זעיר», מקור לכל סכום, סטטוס, ונפתח מחדש מתוך ה-HTML', () => {
    const o = out();
    const html = returnHtml(o, { clientName: 'דוד כהן', version: 2, approved: false });
    assert(html.startsWith('<!doctype html><html lang="he" dir="rtl">'), 'RTL');
    assert(html.includes('טיוטה פנימית — חסרים נתונים'), 'סטטוס טיוטה (לא אושר)');
    assert(html.includes('☒ מסומן') && html.includes('הנני בעל עסק זעיר'), 'סימון הזעיר');
    assert(html.includes('<td class="c">158</td>') && html.includes('<td class="c">150</td>'), 'קודים');
    assert((html.match(/class="s"/g) ?? []).length === o.fields.length, 'מקור לכל שורה');
    equal(verifyReopened(o, fileFromHtml(html)).length, 0);
    const ready = returnHtml(o, { clientName: 'דוד כהן', version: 2, approved: true });
    assert(ready.includes('טיוטה פנימית') && !ready.includes('מוכן להגשה —'), 'אישור על טיוטה אינו «מוכן להגשה»');
    const filed = returnHtml(o, { clientName: 'דוד כהן', version: 2, approved: true, filed: { at: '15.04.2026', ref: '12345' } });
    assert(filed.includes('הוגש בפועל (נרשם ידנית)') && filed.includes('12345'), 'הוגש בפועל');
  }),
  test('שם עם תווים מיוחדים לא שובר את הגיליון ולא את הנתונים המוטמעים', () => {
    const o = out();
    const html = returnHtml(o, { clientName: 'דוד <כהן> "בע״מ"', version: 1, approved: false });
    assert(!html.includes('<כהן>'), 'מוברח ב-HTML');
    equal(fileFromHtml(html).client, 'דוד <כהן> "בע״מ"');
  }),
];
