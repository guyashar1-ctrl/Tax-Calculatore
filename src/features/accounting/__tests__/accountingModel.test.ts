import { test, equal, assert, deepEqual, type TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import type { Engagement } from '../../../types/onboarding';
import { accountingAgreement } from '../accountingModel';
import { bookkeepingAgentPrompt, rulesFingerprint } from '../bookkeepingPrompt';
import { OFFICE_HANDBOOK } from '../../bookkeeping/handbookData';
import { formatAreaPath, parseAreaPath } from '../../taxArea/areaModel';

const a = { id: 'a', firstName: 'לקוח', lastName: 'ראשון', spouseClientId: 'b' } as Client;
const b = { id: 'b', firstName: 'לקוח', lastName: 'שני' } as Client;
const agreement = (clientId: string, extra: Partial<Engagement> = {}) => ({ id: 'e-' + clientId, clientId, status: 'active', effectiveFrom: '2025-01-01', monthlyTotal: 500, ...extra }) as Engagement;
export const TESTS: TestCase[] = [
  test('contract gross uses its signed rate, never a new assumed VAT rate', () => {
    equal(accountingAgreement(a, [a, b], [agreement('a', { vatRateAtSigning: 17 })]).withVat, 585);
    equal(accountingAgreement(a, [a, b], [agreement('a')]).withVat, null);
    equal(accountingAgreement(a, [a, b], [agreement('a', { monthlyTotalWithVat: 0 })]).withVat, 0);
  }),
  test('shared spouse contract is identified for a single billing owner', () => {
    const shared = accountingAgreement(a, [a, b], [agreement('b')]);
    equal(shared.shared, true); equal(shared.ownerId, 'b');
    const own = accountingAgreement(a, [a, b], [agreement('a'), agreement('b')]);
    equal(own.shared, false); equal(own.ownerId, 'a');
  }),
  test('missing contract is unknown, not zero due or paid', () => {
    const row = accountingAgreement(a, [a, b], []);
    equal(row.beforeVat, null); equal(row.withVat, null); equal(row.ownerId, undefined);
  }),
  test('agent prompt: only the selected clients, with the run time and rules version', () => {
    const prompt = bookkeepingAgentPrompt({ clients: [a], preparedAt: new Date('2026-10-30T08:35:00Z') });
    assert(prompt.includes('לקוח ראשון'), 'selected client included'); assert(!prompt.includes('לקוח שני'), 'unselected client excluded');
    assert(prompt.includes(OFFICE_HANDBOOK.date) && prompt.includes(rulesFingerprint()), 'rules version stated');
    assert(prompt.includes('30.10.2026'), 'prepared time stated in Israel time');
    assert(prompt.includes('תוכנות ושירותים') && prompt.includes('3680'), 'canonical table embedded');
  }),
  test('agent prompt: proposal-only, separate execution approval, safe execution protocol', () => {
    const p = bookkeepingAgentPrompt({ clients: [a], preparedAt: new Date() });
    for (const must of ['אין שום כתיבה בפייפרלס', 'אישור ביצוע נפרד ומפורש', 'לא מבקשים סיסמה', 'ודא שהמסמך והשדות לא השתנו', 'תוצאה לא ודאית', 'לא ייקלט פעמיים', 'מה נשמר בפועל'])
      assert(p.includes(must), 'missing: ' + must);
  }),
  test('agent prompt: live office-wide pending check, all pages, nothing inferred', () => {
    const p = bookkeepingAgentPrompt({ clients: [a], preparedAt: new Date() });
    for (const must of ['כל הממתינים', 'עמודים נוספים', 'שעת הבדיקה', 'בדיקה חלקית', 'אינו הוכחה ל־0', 'לפני ה־6 בחודש'])
      assert(p.includes(must), 'missing: ' + must);
  }),
  test('agent prompt: cases not seen in the live test — mixed invoice, foreign software, missing setting', () => {
    const p = bookkeepingAgentPrompt({ clients: [a], preparedAt: new Date() });
    for (const must of ['חשבונית מעורבת', 'מסתכמים בדיוק למקור', 'תוכנה מחו״ל', 'גם כשהחיוב בשקלים', 'הגדרה חסרה', 'חסר אינו אפס', 'חשד לכפילות'])
      assert(p.includes(must), 'missing: ' + must);
  }),
  test('agent prompt: amounts and dates are kept apart — no invented payment, no full tax recognition by default', () => {
    const p = bookkeepingAgentPrompt({ clients: [a], preparedAt: new Date() });
    for (const must of ['סכום המקור', 'החלק העסקי', 'מס תשומות מוכר', 'ההכרה למס', 'רישום מלא אינו הכרה מלאה למס', 'תאריך התשלום', 'אל תמציא', 'הפרש אגורה'])
      assert(p.includes(must), 'missing: ' + must);
  }),
  test('agent prompt: permanent instructions carry no test-run specifics', () => {
    const p = bookkeepingAgentPrompt({ clients: [b], preparedAt: new Date() });
    for (const banned of ['פיילוט', 'יובל', 'אילן', 'גרוסמן', 'סימנטוב']) assert(!p.includes(banned), 'leaked: ' + banned);
  }),
  test('new navigation roundtrips and retains the existing annual route', () => {
    for (const path of ['billing', 'work/bookkeeping', 'learn/handbook', 'work/annual']) equal(formatAreaPath(parseAreaPath(path)), path);
    deepEqual(parseAreaPath('work/bookkeeping'), { mode: 'work', section: 'bookkeeping' });
  }),
];

