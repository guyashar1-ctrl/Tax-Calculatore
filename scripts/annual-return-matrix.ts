// מטריצת הכיסוי של הדוח השנתי — נגזרת מהקוד: כל תרחיש נתמך רץ על תיק מלא, ולכל קבוצת שדות ונספח נרשם מה קרה.
//   node scripts/annual-return-matrix.mjs  (בונה את הקובץ הזה עם esbuild ומדפיס Markdown)
import type { Client } from '../src/types';
import { computeReturn } from '../src/features/annualReturn/engine';
import { buildFile1301, verifyFile1301 } from '../src/features/annualReturn/file1301';
import { baseCard, booksFor, draft, fact, filingFacts } from '../src/features/annualReturn/__tests__/fixtures';
import type { ReturnOutputs } from '../src/features/annualReturn/types';

const BIZ = { id: 'bz1', name: 'ייעוץ', kind: 'osek_morshe', address: { street: 'הרצל', houseNumber: '10', city: 'תל אביב' } };
const SPOUSE = { firstName: 'רות', lastName: 'כהן', idNumber: '234567891', gender: 'female', birthDate: '1987-02-02' };
const c = (p: object) => baseCard(p as Partial<Client>);
const SCEN: { name: string; run: () => { o: ReturnOutputs; client: Client; d: ReturnType<typeof draft> } }[] = [
  { name: 'עצמאי', run: () => { const client = c({ businesses: [BIZ], children: [{ id: 'k1', birthDate: '2020-03-01', custody: 'self', hasDisability: false }] }); const d = draft({ books: { bz1: booksFor(250_000, 180_000) } });
    return { client, d, o: computeReturn({ client, draft: d, evidence: [], facts: [fact('business.profit', 'client', { profit: 180_000, turnover: 250_000 }, { entityRef: 'bz1' }), fact('payments.niPaid', 'client', 25_000), fact('payments.advances', 'client', 30_000), fact('savings.selfAmounts', 'client', { pension: 15_000, studyFund: 8_000 }), ...filingFacts()] }) }; } },
  { name: 'שכיר-עצמאי', run: () => { const client = c({ businesses: [BIZ], employers: [{ id: 'em1', name: 'חברה' }] }); const d = draft({ books: { bz1: booksFor(200_000, 150_000) } });
    return { client, d, o: computeReturn({ client, draft: d, evidence: [], facts: [fact('salary.amounts', 'client', { gross: 120_000, withheld: 15_000, insured: 120_000, employeePension: 7_200, employerDeposits: 15_000 }, { entityRef: 'em1' }), fact('business.profit', 'client', { profit: 150_000, turnover: 200_000 }, { entityRef: 'bz1' }), fact('payments.niPaid', 'client', 12_000), fact('savings.selfAmounts', 'client', { pension: 20_000 }), ...filingFacts()] }) }; } },
  { name: 'בני זוג', run: () => { const client = c({ familyStatus: 'married', businesses: [BIZ], employers: [{ id: 'em2', name: 'משרד החינוך', belongsToSpouse: true }], spouse: SPOUSE, spouseFirstName: 'רות', spouseLastName: 'כהן', spouseIdNumber: '234567891' }); const d = draft({ persons: ['client', 'spouse'], books: { bz1: booksFor(240_000, 200_000) } });
    return { client, d, o: computeReturn({ client, draft: d, evidence: [], facts: [fact('business.profit', 'client', { profit: 200_000, turnover: 240_000 }, { entityRef: 'bz1' }), fact('payments.niPaid', 'client', 15_000), fact('salary.amounts', 'spouse', { gross: 150_000, withheld: 18_000 }, { entityRef: 'em2' }), ...filingFacts({ married: true })] }) }; } },
  { name: 'כמה מקורות', run: () => { const client = c({ employers: [{ id: 'em1', name: 'חברה' }], properties: [{ id: 'p1', address: 'הרצל 1', isRented: true, rentalTaxTrack: 'exempt' }], investmentAccounts: [{ id: 'a1', institutionName: 'בנק' }] }); const d = draft({ decisions: [{ key: 'capital.rates', text: '25%' }] });
    return { client, d, o: computeReturn({ client, draft: d, evidence: [], facts: [fact('salary.amounts', 'client', { gross: 120_000, withheld: 9_000 }, { entityRef: 'em1' }), fact('rent.income', 'couple', 50_000, { entityRef: 'p1' }), fact('capital.amounts', 'couple', { interest: 10_000, dividend: 5_000, withheld: 3_750 }, { entityRef: 'a1' }), fact('donations.given', 'client', true), fact('donations.amount', 'client', 2_000), ...filingFacts({ except: ['donations.given'] })] }) }; } },
  { name: 'עסק זעיר', run: () => { const client = c({ businesses: [BIZ] }); const d = draft({ micro: { bz1: { track: 'micro', registeredAtYearStart: true, reporting: 'full' } } });
    return { client, d, o: computeReturn({ client, draft: d, evidence: [], facts: [fact('business.profit', 'client', { profit: 60_000, turnover: 100_000 }, { entityRef: 'bz1' }), fact('payments.niPaid', 'client', 6_000), ...filingFacts()] }) }; } },
  { name: 'שכ״ד 10%', run: () => { const client = c({ employers: [{ id: 'em1', name: 'חברה' }], properties: [{ id: 'p1', address: 'הרצל 1', city: 'חיפה', isRented: true, rentalTaxTrack: 'flat10' }] }); const d = draft({ rent1321: { singleApartment: true, props: { p1: { block: '10234', parcel: '56' } } } });
    return { client, d, o: computeReturn({ client, draft: d, evidence: [], facts: [fact('salary.amounts', 'client', { gross: 100_000, withheld: 8_000 }, { entityRef: 'em1' }), fact('rent.income', 'couple', 48_000, { entityRef: 'p1' }), ...filingFacts()] }) }; } },
  { name: 'שכ״ד רגיל (לא נתמך)', run: () => { const client = c({ employers: [{ id: 'em1', name: 'חברה' }], properties: [{ id: 'p1', address: 'הרצל 1', isRented: true, rentalTaxTrack: 'regular' }] }); const d = draft();
    return { client, d, o: computeReturn({ client, draft: d, evidence: [], facts: [fact('salary.amounts', 'client', { gross: 100_000, withheld: 8_000 }, { entityRef: 'em1' }), fact('rent.income', 'couple', 48_000, { entityRef: 'p1' }), ...filingFacts()] }) }; } },
  { name: 'חו״ל (לא נתמך)', run: () => { const client = c({ employers: [{ id: 'em1', name: 'חברה' }] }); const d = draft();
    return { client, d, o: computeReturn({ client, draft: d, evidence: [], facts: [fact('salary.amounts', 'client', { gross: 100_000, withheld: 8_000 }, { entityRef: 'em1' }), fact('foreign.income', 'couple', true), ...filingFacts({ except: ['foreign.income'] })] }) }; } },
];

const GROUPS: { label: string; match: (id: string, part: string, code?: string) => boolean }[] = [
  { label: 'א — פרטים כלליים והצהרות', match: (_, p) => p === 'א' }, { label: 'ב — פרטים אישיים, עסק, חשבון להחזר', match: (_, p) => p === 'ב' },
  { label: 'ג — הכנסות מיגיעה אישית', match: (_, p) => p === 'ג' }, { label: 'ד/ה — שכ״ד, הון, שיעורים מיוחדים', match: (_, p) => p === 'ד' || p === 'ה' },
  { label: 'ז — מחזור', match: (_, p) => p === 'ז' }, { label: 'ח/ט — רווח הון, חו״ל', match: (_, p) => p === 'ח' || p === 'ט' },
  { label: 'י — פטורות', match: (_, p) => p === 'י' }, { label: 'יב — ניכויים (פנסיה, קרן, ב״ל, 106)', match: (_, p) => p === 'יב' },
  { label: 'יג — נקודות זיכוי', match: (_, p) => p === 'יג' }, { label: 'יד — זיכויים', match: (_, p) => p === 'יד' }, { label: 'טו — ניכויים במקור', match: (_, p) => p === 'טו' },
  { label: 'לשימוש המשדר', match: (_, p) => p === 'לשימוש המשדר' },
];
const cell = (o: ReturnOutputs, g: typeof GROUPS[number]) => {
  const rows = o.formCoverage.rows.filter(r => g.match(r.id, r.part, r.code) && (r.need === 'required' || r.need === 'applies'));
  if (!rows.length) return '—';
  const f = rows.filter(r => r.state === 'filled').length, m = rows.filter(r => r.state === 'missing').length, u = rows.filter(r => r.state === 'notSupported').length;
  return u ? `⚠ ${f}/${rows.length} · לא מופק ${u}` : m ? `✗ ${f}/${rows.length} · חסר ${m}` : `✓ ${f}/${rows.length}`;
};
const results = SCEN.map(s => ({ name: s.name, ...s.run() }));
const out: string[] = [];
out.push(`| קבוצה | ${results.map(r => r.name).join(' | ')} |`, `|---|${results.map(() => '---').join('|')}|`);
for (const g of GROUPS) out.push(`| ${g.label} | ${results.map(r => cell(r.o, g)).join(' | ')} |`);
const annexIds = ['1320', '1321', '1322', '1324', '1342', '1343', '1344', '1399י', '119', '6111'];
for (const a of annexIds) out.push(`| נספח ${a} | ${results.map(r => { const x = r.o.formCoverage.annexes.filter(y => y.formId === a); return !x.length ? '—' : x.map(y => (y.need === 'notRelevant' || y.produced === 'notNeeded' ? 'לא נדרש' : y.produced === 'full' ? '✓ מופק' : y.produced === 'partial' ? '⚠ חלקי' : '⚠ לא מופק')).join(', '); }).join(' | ')} |`);
out.push(`| **מצב הדוח** | ${results.map(r => `**${r.o.status === 'completeWorksheet' ? 'גיליון מלא' : r.o.status === 'partialWorksheet' ? 'גיליון חלקי' : 'טיוטה'}**`).join(' | ')} |`);
out.push(`| קובץ 1301 (מבנה 2025) נבנה ונקרא בחזרה | ${results.map(r => { const f = buildFile1301(r.o, { client: r.client, draft: r.d, savedOn: '2026-03-01' }); const i = verifyFile1301(f); return i.length ? `✗ ${i.length} בעיות` : `✓ ${f.codes.length} קודים`; }).join(' | ')} |`);
console.log(out.join('\n'));
for (const r of results) if (r.o.unsupported.length) console.log(`\n**${r.name} — לא מופק:** ${r.o.unsupported.map(u => u.text).join(' · ')}`);
