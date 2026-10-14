// תיק מלא לבדיקות הדוח השנתי: כרטיס עם פרטים מזהים, תשובות לשאלות הפתיחה, הצהרות בהגשה, פרטים שהכרטיס
// לא מחזיק, חשבון להחזר וספרים לנספח 1320 — כמו שתיק אמיתי נראה אחרי שהמשרד סיים לאסוף.
// ‼ מכאן «גיליון מלא» אמור להיות אפשרי; כל חוסר שנשאר בבדיקה הוא חוסר אמיתי במערכת.
import type { Client } from '../../../types';
import type { YearFact } from '../../taxYear/types';
import type { Books1320, ReturnDraft } from '../types';
import { DECLARATIONS } from '../formFields';
import { BOOK_QUESTIONS } from '../annex1320';

let n = 0;
export function fact(itemKey: string, role: YearFact['subjectRole'], value: unknown, o: { entityRef?: string; answer?: YearFact['answer']; year?: number } = {}): YearFact {
  const id = `fx${++n}`;
  return { id, clientId: 'c1', taxYear: o.year ?? 2025, itemKey, subjectRole: role, entityRef: o.entityRef, periodKind: 'year', periodFrom: '2025-01-01', periodTo: '2025-12-31',
    answer: o.answer ?? 'value', value, basis: 'final', source: 'office', status: 'accepted', createdAt: `2026-02-01T10:00:${String(n % 60).padStart(2, '0')}Z` };
}
const no = (key: string, role: YearFact['subjectRole'] = 'couple') => fact(key, role, undefined, { answer: 'no' });

export const SCREENERS_NO = ['sales.sold', 'foreign.income', 'companies.controlled', 'niBenefits.received', 'special.trust', 'special.partnership', 'special.reportablePosition',
  'special.nonResident', 'special.financialInstitution', 'savings.insurance', 'donations.given', 'special.moneyAbroad'];

export function baseCard(p: Partial<Client> = {}): Client {
  return {
    id: 'c1', firstName: 'דוד', lastName: 'כהן', idNumber: '123456782', birthDate: '1985-05-01', gender: 'male', familyStatus: 'single', children: [],
    address: 'הרצל 10', city: 'תל אביב', zipCode: '6100000', phone: '0501234567', email: 'david@example.com',
    taxFiles: [{ id: 't1', authority: 'income_tax', fileNumber: '123456782', owner: 'client', repStatus: 'active' }, { id: 't2', authority: 'vat', fileNumber: '123456782', owner: 'client', repStatus: 'active' }],
    employers: [], businesses: [], properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], fieldMeta: {}, spouse: null, businessDescription: 'ייעוץ',
    ...p,
  } as unknown as Client;
}

/** עובדות ההגשה: שאלות הפתיחה «לא» (חוץ ממה שיש), הצהרות, פרטים מזהים וחשבון להחזר. */
export function filingFacts(opts: { except?: string[]; married?: boolean; extraDecl?: Record<string, boolean | string> } = {}): YearFact[] {
  const decl: Record<string, boolean | string> = Object.fromEntries(DECLARATIONS.map(d => [d.id, false]));
  Object.assign(decl, { F048: '60', F049: '2', F051: 'חד צידית', F053: 'computer', F194: false, F195: false, F004: false, F005: false, F231: false }, opts.extraDecl ?? {});
  return [
    ...SCREENERS_NO.filter(k => !(opts.except ?? []).includes(k)).map(k => no(k)),
    fact('filing.declarations', 'couple', decl),
    fact('filing.identity', 'couple', { fatherName: 'משה', spouseFatherName: 'אברהם', zip: '6100000' }),
    fact('filing.refundAccount', 'couple', { bank: '12', branch: '345', account: '123456', holder: 'דוד כהן' }),
  ];
}

/** ספרים מלאים לנספח 1320: הכנסות = המחזור, הוצאות משרדיות = המחזור פחות הרווח. */
export function booksFor(turnover: number, profit: number, extra: Partial<Books1320> = {}): Books1320 {
  return { basis: 'cash', lines: { '1': turnover, '9': turnover - profit }, answers: Object.fromEntries(BOOK_QUESTIONS.map(q => [q.key, q.kind === 'yesno' ? q.key === 'basedOnBooks' || q.key === 'receipts' : 'במשרד'])), ...extra };
}

export const draft = (p: Partial<ReturnDraft> = {}): ReturnDraft => ({ taxYear: 2025, preparedOn: '2026-03-01', persons: ['client'], completions: [], adjustments: [], micro: {}, decisions: [], ...p });
