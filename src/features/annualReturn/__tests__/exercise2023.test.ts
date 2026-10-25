// אורקל התרגיל מהקורס (תוכנית הליווי, נספח א׳): דוח 2023 של «עמרי ונועה ברק» (שמות בדויים מההדמיה) על טופס 2025 —
// מרשם תבניות המסמך (docTemplates) ⇒ שורות מקור (עובדות עם מסמך) ⇒ המנוע ⇒ כל שדה = סכום שורותיו, ו«ממה זה מורכב» עונה.
// ‼ חמשת המסמכים של שלב 1 בלבד: 106 ×2, אישור ב״ל שנתי, 867 ×2, אישורי קופה/ביטוח, רו״ה. אישור האבטלה (194), PayBox (040 «לבדיקה»),
//   משרד הביטחון וילד נכה — שלב 2. מקדמות 16,711 — עובדה רגילה (payments.advances), לא ממסמך.
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import type { Evidence, YearFact } from '../../taxYear/types';
import { ITEM_BY_KEY } from '../../taxYear/catalog';
import { computeReturn, codeMatches } from '../engine';
import { readComponents } from '../facts';
import { DOC_TEMPLATES, entitiesFor, linesToSave, missingRequired, templateFor, type SourceLineInput } from '../docTemplates';
import type { ReturnDraft } from '../types';

const OMRI = 'client', NOA = 'spouse';
const EM1 = { id: 'em1', name: 'חברת תוכנה בע״מ' }, EM2 = { id: 'em2', name: 'סטודיו ליאור', belongsToSpouse: true };
const BIZ = { id: 'bz1', name: 'נועה ברק — עיצוב גרפי', belongsToSpouse: true };
const A1 = { id: 'a1', institutionName: 'בנק הפועלים', accountNumber: '1234' }, A2 = { id: 'a2', institutionName: 'בנק לאומי', accountNumber: '5678' };
const F1 = { id: 'f1', institutionName: 'מנורה', kind: 'pension' };
const barak = (): Client => ({ id: 'c1', firstName: 'עמרי', lastName: 'ברק', gender: 'male', familyStatus: 'married', marriageYear: 2015, birthDate: '1985-05-01',
  children: [{ id: 'k1', firstName: 'נועם', birthDate: '2022-06-01' }], employers: [EM1, EM2], businesses: [BIZ], properties: [], investmentAccounts: [A1, A2], pensionFunds: [F1], foreignAccounts: [], fieldMeta: {},
  spouse: { firstName: 'נועה', lastName: 'ברק', gender: 'female', birthDate: '1987-02-02', grossSalary: 0, selfEmployedGrossIncome: 0, recognizedExpenses: 0, selfEmployedPensionAmount: 0, krenHashtalmutSE: 0, employeePensionPct: 0 },
} as unknown as Client);
const draft = (p: Partial<ReturnDraft> = {}): ReturnDraft => ({ taxYear: 2025, preparedOn: '2026-03-01', persons: ['client', 'spouse'], completions: [], adjustments: [], micro: {}, decisions: [], ...p });

/** «מסמך ⇒ שורות מקור»: מה ש-record_source_lines שומר — ראיה מאושרת + עובדה סופית לכל שורה, עם line_key ו-evidence_id. */
let n = 0;
const docs: Evidence[] = [];
const facts: YearFact[] = [];
function enter(docKind: Parameters<typeof templateFor>[0], role: 'client' | 'spouse', values: Record<string, number>, entityRef?: string, fileName?: string) {
  const { template } = templateFor(docKind, 2025)!;
  assert(missingRequired(template, values).length === 0, `${docKind}: חסר שדה חובה — ${missingRequired(template, values).join(', ')}`);
  assert(template.validate(values).length === 0, `${docKind}: ${template.validate(values).join(' | ')}`);
  const evId = `ev${++n}`;
  docs.push({ id: evId, clientId: 'c1', taxYear: 2025, docKind, subjectRole: role, entityKind: template.entityKind, entityRef, fileName: fileName ?? `${docKind}-${role}.pdf`,
    receivedAt: '2026-02-10T09:00:00Z', receivedVia: 'office', extraction: 'office_entered', identityMatch: 'match', periodMatch: 'match', review: 'accepted' });
  const lines: SourceLineInput[] = linesToSave(template, values, { subjectRole: role, entityRef, taxYear: 2025 });
  for (const l of lines) facts.push({ id: `f${++n}`, clientId: 'c1', taxYear: 2025, itemKey: l.itemKey, subjectRole: l.subjectRole, entityKind: l.entityKind as YearFact['entityKind'], entityRef: l.entityRef,
    periodKind: 'year', periodFrom: '2025-01-01', periodTo: '2025-12-31', answer: 'value', value: l.value, basis: 'final', source: 'document', evidenceId: evId, lineKey: l.lineKey,
    status: 'accepted', decidedBy: 'u-office', decidedAt: '2026-02-10T09:00:00Z', enteredBy: 'u-office', createdAt: `2026-02-10T09:${String(n % 60).padStart(2, '0')}:00Z` });
  return evId;
}
// 106 — עמרי 152,855 (מס 15,000; מבוטחת 140,000) · 106 — נועה 60,075 (מס 4,979; מבוטחת 60,075) ⇒ 042 = 19,979
const ev106a = enter('form106', OMRI, { '106.gross': 152_855, '106.withheld': 15_000, '106.insured': 140_000 }, 'em1', '106-2023-עמרי.pdf');
const ev106b = enter('form106', NOA, { '106.gross': 60_075, '106.withheld': 4_979, '106.insured': 60_075 }, 'em2', '106-2023-נועה.pdf');
// רו״ה — נועה: רווח 123,629, מחזור 152,023
enter('annualPnl', NOA, { 'pnl.turnover': 152_023, 'pnl.profit': 123_629 }, 'bz1');
// אישור ב״ל שנתי — נועה: ב״ל 11,676 / בריאות 5,144 (בריאות — לא לדוח)
const evNi = enter('niAnnualCert', NOA, { 'ni.paid': 11_676, 'ni.health': 5_144 });
// 867 ×2 — עמרי: ריבית 15% 332, מס 50 · נועה: ריבית 15% 83 (ובחשבון שלה גם מס על דיבידנד 12 ⇒ 040)
enter('form867', OMRI, { '867.depositInterest15': 332, '867.withheldDeposit': 50 }, 'a1');
enter('form867', NOA, { '867.depositInterest15': 83, '867.withheldSecurities': 12 }, 'a2');
// קופות — נועה: קצבה 8,400 · ביטוח חיים — עמרי: 556
enter('fundAnnualCert', NOA, { 'fund.pension': 8_400 }, 'f1');
enter('insuranceCert', OMRI, { 'ins.life': 556 });
// מקדמות — נועה 16,711 (עובדה רגילה)
facts.push({ id: 'adv', clientId: 'c1', taxYear: 2025, itemKey: 'payments.advances', subjectRole: 'spouse', periodKind: 'year', periodFrom: '2025-01-01', periodTo: '2025-12-31',
  answer: 'value', value: 16_711, basis: 'final', source: 'office', status: 'accepted', createdAt: '2026-02-11T09:00:00Z' });
facts.push({ id: 'bk', clientId: 'c1', taxYear: 2025, itemKey: 'business.books', subjectRole: 'spouse', entityRef: 'bz1', periodKind: 'year', periodFrom: '2025-01-01', periodTo: '2025-12-31',
  answer: 'value', value: true, basis: 'declared', source: 'office', status: 'accepted', createdAt: '2026-02-11T09:00:00Z' });

const out = computeReturn({ client: barak(), draft: draft(), facts, evidence: docs });
const field = (code: string, person?: string) => out.fields.find(f => f.code === code && (person == null || f.person === person));
const amt = (code: string, person?: string) => field(code, person)?.amount;

export const TESTS: TestCase[] = [
  test('מרשם התבניות: כל שורה מצביעה לפריט קיים בקטלוג, והרכיב שלה נקרא במנוע (ALIASES)', () => {
    for (const t of DOC_TEMPLATES[2025]) for (const l of t.lines) {
      assert(!!ITEM_BY_KEY[l.itemKey], `${t.docKind}/${l.key}: הפריט ${l.itemKey} אינו בקטלוג`);
      const read = readComponents({ id: 'x', clientId: 'c', taxYear: 2025, itemKey: l.itemKey, subjectRole: 'client', periodKind: 'year', answer: 'value', value: { [l.component]: 7 }, basis: 'final', source: 'office', status: 'accepted', createdAt: '' });
      assert(read.length === 1 && read[0].amount === 7, `${t.docKind}/${l.key}: הרכיב ${l.component} לא נקרא`);
    }
    equal(DOC_TEMPLATES[2025].length, 7); // 25.10.2026 · + קבלות על תרומות
    equal(templateFor('form106', 2024)?.year, 2025, 'שנה בלי מרשם — המרשם הקיים (מסומן)');
    equal(entitiesFor(templateFor('form106', 2025)!.template, barak(), 'spouse').map(e => e.id).join(), 'em2', 'המעסיקים של בת הזוג בלבד');
    equal(entitiesFor(templateFor('annualPnl', 2025)!.template, barak(), 'client').length, 0, 'לעמרי אין עסק');
  }),
  test('אורקל התרגיל: משכורות, מס שנוכה, הכנסה מבוטחת, רווח ומחזור, ב״ל, ריבית 15%, 043/040, קופה, ביטוח חיים, מקדמות', () => {
    equal(amt('158'), 152_855); equal(amt('172'), 60_075); equal(amt('042'), 19_979);
    equal(amt('244'), 140_000); equal(amt('245'), 60_075);
    equal(amt('170'), 123_629); equal(amt('239'), 152_023);
    equal(amt('089'), 11_676, '030/089 = דמי ב״ל בלבד');
    assert(!out.fields.some(f => f.amount === 5_144), 'בריאות — לא נכנסת לשום שדה');
    equal(amt('217'), 332); equal(amt('317'), 83);
    equal(amt('043'), 50, '043 = מס שנוכה על ריבית פיקדונות בלבד'); equal(amt('040'), 12, 'מס על דיבידנד/ני״ע ⇒ 040 (C16)');
    equal(amt('180'), 8_400); equal(amt('036'), 556);
    equal(out.household.advancesPaid, 16_711); equal(out.household.withheld, 19_979 + 50 + 12);
    equal(out.persons.length, 2);
  }),
  test('שורות מקור: 042 מורכב משתי שורות — אחת לכל 106 — עם המסמך, האדם, השאלה והמפתח; הסכום = Σ השורות', () => {
    const f = field('042')!;
    const lines = f.source.lines ?? [];
    equal(lines.length, 2);
    equal(lines.reduce((a, l) => a + l.amount, 0), 19_979);
    assert(lines.every(l => l.docKind === 'form106' && l.docLabel === 'טופס 106' && l.itemKey === 'salary.amounts' && l.component === 'withheld' && l.lineKey === '106.withheld' && l.year === 2025 && l.trust === 'verified' && !!l.enteredBy), JSON.stringify(lines));
    equal(lines.map(l => l.evidenceId).sort().join(), [ev106a, ev106b].sort().join());
    equal(lines.map(l => l.person).sort().join(), 'client,spouse');
    assert(f.source.sumIsField === true, 'השדה הוא סכום שורותיו');
    const ni = field('089')!;
    equal(ni.source.lines?.length, 1); equal(ni.source.lines?.[0].evidenceId, evNi); equal(ni.source.lines?.[0].lineKey, 'ni.paid');
    // כל שדה-סכום שמורכב משורות — סכומו = Σ השורות
    for (const x of out.fields.filter(x => x.kind === 'amount' && x.source.lines?.length && x.source.sumIsField !== false)) equal(x.source.lines!.reduce((a, l) => a + l.amount, 0), x.amount, `Σ שורות ≠ ${x.code}`);
  }),
  test('בקרות: «שדה בלי מקור» ו-«Σ שורות = שדה» תקינות; 106 ו-150 מתאימות', () => {
    for (const id of ['sources', 'lines_sum', 'salary_106', 'withheld_106', 'business_150']) assert(out.controls.find(c => c.id === id)?.ok === true, `${id}: ${JSON.stringify(out.controls.find(c => c.id === id))}`);
  }),
  test('אינדקס קודים (N7): כל ההתאמות, לפי טור; «42» = «042»; קוד כפול מסומן ולא נבחר בשקט', () => {
    equal(codeMatches('158')[0].entry.id, 'F111'); equal(codeMatches('158')[0].column, 'registered');
    equal(codeMatches('172')[0].column, 'spouse'); equal(codeMatches('078')[0].column, 'joint');
    equal(codeMatches('42').length, codeMatches('042').length);
    const dup = [...new Set(codeMatches('181').map(m => m.entry.id))];
    assert(dup.length > 1, '181 משמש כמה שדות בקטלוג (קוד תואר / שנה) — כל ההתאמות מוחזרות');
    assert(!out.fields.some(f => f.code === '158' && f.ambiguous), '158 חד-משמעי');
  }),
  test('ערך ידני מעל חישוב (#): השדה משתנה, המחושב נשמר, מנומק, לא «שובר» את בקרת 106 ולא נספר כ«בלי מקור»', () => {
    const o = computeReturn({ client: barak(), draft: draft({ overrides: [{ code: '158', person: 'client', amount: 150_000, justification: 'תיאום ידני מול 106 מתוקן שטרם הגיע', at: '2026-03-01' }, { code: '172', person: 'spouse', amount: 1, justification: '  ' }] }), facts, evidence: docs });
    const f = o.fields.find(x => x.code === '158')!;
    equal(f.amount, 150_000); equal(f.source.kind, 'manual'); equal(f.source.computed, 152_855); assert(f.source.text.startsWith('# '), f.source.text);
    equal(f.source.lines?.length, 1, 'השורות נשמרות לצד הערך הידני');
    equal(o.fields.find(x => x.code === '172')!.amount, 60_075, 'ערך ידני בלי נימוק לא נכנס');
    assert(o.controls.find(c => c.id === 'salary_106')?.ok === true && o.controls.find(c => c.id === 'sources')?.ok === true, JSON.stringify(o.controls.filter(c => c.ok === false)));
    assert(o.limits.some(l => l.startsWith('# 158')) && o.limits.some(l => l.includes('בלי נימוק')), o.limits.join(' | '));
  }),
  test('אישור מתקן מול אישור נוסף: 106 שני לאותו מעסיק מתווסף (שתי שורות); שורה שהוחלפה אינה נספרת', () => {
    const extra: YearFact = { ...facts.find(f => f.lineKey === '106.gross' && f.subjectRole === 'client')!, id: 'x1', evidenceId: 'evX', value: { gross: 10_000 }, createdAt: '2026-02-12T09:00:00Z' };
    const o = computeReturn({ client: barak(), draft: draft(), facts: [...facts, extra], evidence: [...docs, { ...docs[0], id: 'evX', fileName: '106-נוסף.pdf' }] });
    equal(o.fields.find(f => f.code === '158')!.amount, 162_855, 'אישור נוסף — מתווסף');
    equal(o.fields.find(f => f.code === '158')!.source.lines?.length, 2);
    const o2 = computeReturn({ client: barak(), draft: draft(), facts: [...facts.map(f => (f.lineKey === '106.gross' && f.subjectRole === 'client' ? { ...f, status: 'superseded' as const } : f)), extra], evidence: docs });
    equal(o2.fields.find(f => f.code === '158')!.amount, 10_000, 'אישור מתקן — הקודם «הוחלף» ויוצא מהחישוב');
  }),
];
