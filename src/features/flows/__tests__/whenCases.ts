// ‼ מקרי תנאים משותפים: רצים כאן (בדיקת יחידה של whenMatches) וגם מול השרת
// (scripts/staging-test-flow-conditions.mjs ⇒ flow_when_matches). שני המימושים
// חייבים להחזיר אותה תשובה לכל מקרה — אחרת «מה יקרה» במסך אינו מה שיקרה.
import type { ClientFacts, When } from '../types';

export interface WhenCase { name: string; when: When | null; facts: ClientFacts; expect: boolean }

export const WHEN_CASES: WhenCase[] = [
  { name: 'ריק ⇒ חל', when: null, facts: { kind: 'company' }, expect: true },
  { name: 'אובייקט ריק ⇒ חל', when: {}, facts: { kind: 'company' }, expect: true },
  { name: 'סוג ברשימה', when: { kinds: ['company', 'licensed_dealer'] }, facts: { kind: 'company' }, expect: true },
  { name: 'סוג לא ברשימה', when: { kinds: ['exempt_dealer'] }, facts: { kind: 'company' }, expect: false },
  { name: 'סוג לא ידוע ורשימה לא ריקה', when: { kinds: ['company'] }, facts: {}, expect: false },
  { name: 'רשימת סוגים ריקה ⇒ חל', when: { kinds: [] }, facts: {}, expect: true },
  { name: 'עובדה נכונה', when: { facts: [{ key: 'married', is: true }] }, facts: { married: true }, expect: true },
  { name: 'עובדה חסרה = false', when: { facts: [{ key: 'married', is: true }] }, facts: {}, expect: false },
  { name: 'שלילה על עובדה חסרה', when: { facts: [{ key: 'has_prev', is: false }] }, facts: {}, expect: true },
  { name: 'כל העובדות חייבות', when: { facts: [{ key: 'monthly', is: true }, { key: 'paperless', is: true }] },
    facts: { monthly: true, paperless: false }, expect: false },
  { name: 'סוג ועובדה יחד', when: { kinds: ['licensed_dealer'], facts: [{ key: 'rep', is: true }] },
    facts: { kind: 'licensed_dealer', rep: true }, expect: true },
  { name: 'סוג נכון, עובדה לא', when: { kinds: ['licensed_dealer'], facts: [{ key: 'rep', is: true }] },
    facts: { kind: 'licensed_dealer', rep: false }, expect: false },
];
