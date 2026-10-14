// ─── בדיקות: טפסי מס — גרסאות, מוכנות שדה, בקשות ממוקדות ואימות מילוי ──────
// ‼ מה נעול כאן:
//   · שינוי מספר שדה בלבד אינו פונה ללקוח; שינוי משמעות בודק את התשובה הקיימת
//     ושומר אותה; שדה שהוסר — התשובה עוברת לארכיון, לא נמחקת.
//   · «לא»/0 בכרטיס בלי מקור מתועד = לא ידוע. ערך מהכרטיס (מצב עדכני) = «לאמת לשנה».
//   · שדה שמשמעותו לא אומתה לא «מוכן» לעולם.
//   · אימות מילוי מבחין בין ריק, 0, «לא» ו«לא רלוונטי», מזהה עברית הפוכה, נספח
//     חסר, גרסה שגויה, ושינוי אחרי פתיחה מחדש.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { diffFormVersions, followUpsForChange, fieldReadiness } from '../engine';
import { verifyFilledForm, verifyReopened } from '../fillVerification';
import { FIELDS_1301_2025, FIELDS_1301_2024, FORM_VERSIONS, FIELDS_BY_VERSION, ANNEXES_1301_2025 } from '../form1301';
import { buildMaintenancePrompt } from '../../taxKnowledge/maintenancePrompt';
import { SOURCES } from '../../taxRules/sources';
import { RULES } from '../../taxRules/rules';
import type { FieldAnswer, FieldContext, FormField } from '../types';

const base: FormField = {
  key: 'x.deposit', formVersionId: 'T@2025', part: 'א', section: '1', codes: { registered: '100', spouse: '101' },
  label: 'הפקדה', kind: 'amount', meaning: 'סכום ששולם', relevantWhen: 'יש הפקדה', relevance: c => (c.facts.dep ? 'yes' : 'unknown'),
  sources: ['document'], evidence: ['אישור שנתי'], fillCheck: '—', basis: 'primary', sourceId: 'itaGuide2025', checkedAt: '10.10.2026',
};
const v2 = (over: Partial<FormField>): FormField => ({ ...base, formVersionId: 'T@2026', ...over });
const ctx = (facts: Record<string, unknown>, meta: FieldContext['fieldMeta'] = {}, taxYear = 2026): FieldContext => ({ facts, fieldMeta: meta, taxYear });
const ans = (over: Partial<FieldAnswer>): FieldAnswer => ({ fieldKey: 'x.deposit', taxYear: 2026, formVersionId: 'T@2025', state: { kind: 'value', value: 5000 }, source: 'document', sourceLabel: 'אישור הקרן', answeredAt: '2027-02-01', ...over });

export const TESTS: TestCase[] = [
  test('השוואת גרסאות: נוסף, הוסר, מספר זז, משמעות השתנתה', () => {
    const removed: FormField = { ...base, key: 'x.old', label: 'ישן' };
    const added = v2({ key: 'x.new', label: 'חדש' });
    const ch = diffFormVersions([base, removed], [v2({ codes: { registered: '200', spouse: '201' }, meaning: 'סכום ששולם, כולל דמי ניהול' }), added]);
    const kinds = ch.map(c => `${c.fieldKey}:${c.kind}`).sort();
    equal(kinds.join(' '), ['x.deposit:codeChanged', 'x.deposit:meaningChanged', 'x.new:added', 'x.old:removed'].sort().join(' '));
  }),

  test('שינוי מספר בלבד ⇒ עדכון מיפוי, בלי פנייה ללקוח, והתשובה נשארת', () => {
    const next = v2({ codes: { registered: '200', spouse: '201' } });
    const changes = diffFormVersions([base], [next]);
    const fu = followUpsForChange(changes, [next], ctx({ dep: true }), [ans({})]);
    equal(fu.length, 1);
    equal(fu[0].kind, 'mappingOnly');
    equal(fu[0].who, undefined);
    equal(fu[0].keptAnswer?.state.kind, 'value');
    // ואותה תשובה עדיין «מוכנה» מול הגרסה החדשה — לא מבקשים שוב.
    equal(fieldReadiness(next, ctx({ dep: true }), [ans({})], FIELDS_BY_TEST).status, 'ready');
  }),

  test('שינוי משמעות ⇒ בדיקת התשובה הקיימת, שנשמרת לצד הבקשה', () => {
    const next = v2({ meaning: 'סכום ששולם, כולל דמי ניהול' });
    const fu = followUpsForChange(diffFormVersions([base], [next]), [next], ctx({ dep: true }), [ans({})]);
    equal(fu[0].kind, 'verifyExisting');
    equal(fu[0].who, 'document');
    equal((fu[0].keptAnswer?.state as { value: number }).value, 5000);
    const r = fieldReadiness(next, ctx({ dep: true }), [ans({})], FIELDS_BY_TEST);
    equal(r.status, 'verify');
    assert(r.answer !== undefined, 'התשובה הקודמת מוצגת, לא נמחקת');
  }),

  test('שדה שהוסר ⇒ התשובה לארכיון; שדה חדש שחל ⇒ בקשה ממוקדת', () => {
    const added = v2({ key: 'x.new', label: 'חדש', relevance: () => 'yes' });
    const fu = followUpsForChange(diffFormVersions([base], [added]), [added], ctx({}), [ans({})]);
    const byKind = Object.fromEntries(fu.map(f => [f.kind, f]));
    assert(byKind.archiveAnswer?.keptAnswer, 'התשובה נשמרת');
    equal(byKind.ask?.fieldKey, 'x.new');
    equal(byKind.ask?.who, 'document');
  }),

  test('«לא»/0 בכרטיס בלי מקור = לא ידוע; עם מקור = לא חל', () => {
    const f = FIELDS_1301_2025.find(x => x.key === 'sf.selfEmployedDeposit')!;
    const noMeta = fieldReadiness(f, ctx({ incomeTaxType: 'selfEmployed', krenHashtalmutSE: 0 }, {}, 2025), []);
    equal(noMeta.status, 'unknownApplicability');
    const withMeta = fieldReadiness(f, ctx({ incomeTaxType: 'selfEmployed', krenHashtalmutSE: 0 }, { krenHashtalmutSE: { source: 'questionnaire' } }, 2025), []);
    equal(withMeta.status, 'notApplicable');
  }),

  test('ערך בכרטיס הוא מצב עדכני ⇒ «לאמת לשנה» מול האסמכתה, לא «מוכן»', () => {
    const f = FIELDS_1301_2025.find(x => x.key === 'sf.selfEmployedDeposit')!;
    const r = fieldReadiness(f, ctx({ incomeTaxType: 'selfEmployed', krenHashtalmutSE: 12_000 }, {}, 2025), []);
    equal(r.status, 'verify');
    assert(r.reason.includes('לא של שנה מסוימת') && r.reason.includes('אישור שנתי'), r.reason);
    equal(r.ask?.who, 'document');
  }),

  test('תשובה לשנה ולגרסה ⇒ מוכן; «לא רלוונטי» כשהתיק אומר שחל ⇒ להכריע', () => {
    const f = FIELDS_1301_2025.find(x => x.key === 'sf.selfEmployedDeposit')!;
    const a = ans({ fieldKey: f.key, taxYear: 2025, formVersionId: '1301@2025', state: { kind: 'zero' } });
    equal(fieldReadiness(f, ctx({ incomeTaxType: 'selfEmployed', krenHashtalmutSE: 9_000 }, {}, 2025), [a]).status, 'ready');
    const na = ans({ fieldKey: f.key, taxYear: 2025, formVersionId: '1301@2025', state: { kind: 'notApplicable', reason: 'לא הפקיד' } });
    equal(fieldReadiness(f, ctx({ incomeTaxType: 'selfEmployed', krenHashtalmutSE: 9_000 }, {}, 2025), [na]).status, 'verify');
    // תשובה לשנה אחרת אינה תשובה לשנה הזו
    const other = ans({ fieldKey: f.key, taxYear: 2024, formVersionId: '1301@2025' });
    equal(fieldReadiness(f, ctx({ incomeTaxType: 'selfEmployed', krenHashtalmutSE: 9_000 }, {}, 2025), [other]).status, 'verify');
  }),

  test('שדה שמשמעותו לא אומתה לא «מוכן» לעולם', () => {
    for (const f of FIELDS_1301_2025.filter(x => x.basis !== 'primary')) {
      const a = ans({ fieldKey: f.key, taxYear: 2025, formVersionId: f.formVersionId });
      equal(fieldReadiness(f, ctx({ incomeTaxType: 'both' }, {}, 2025), [a]).status, 'verify', f.key);
    }
  }),

  test('נתוני 1301: גרסה קיימת, מקורות קיימים, קודים לא כפולים, כללי חישוב קיימים', () => {
    const versions = new Set(FORM_VERSIONS.map(v => v.id));
    const codes = new Set<string>();
    for (const v of FORM_VERSIONS) for (const s of v.sourceIds) assert(SOURCES[s], `${v.id}: מקור ${s}`);
    for (const f of FIELDS_1301_2025) {
      assert(versions.has(f.formVersionId), `${f.key}: גרסה`);
      assert(SOURCES[f.sourceId], `${f.key}: מקור`);
      assert(f.relevance, `${f.key}: תנאי רלוונטיות`);
      for (const c of [f.codes.registered, f.codes.spouse]) if (c) { assert(!codes.has(c), `קוד ${c} כפול`); codes.add(c); }
      for (const id of f.calculation?.ruleIds ?? []) assert(RULES[id], `${f.key}: כלל ${id}`);
      assert(f.fillCheck.length > 5, `${f.key}: בדיקת מילוי`);
    }
  }),

  test('אימות מילוי: סכום עם פסיקים, אפס, «לא רלוונטי» שנכתב, תיבה, עברית הפוכה', () => {
    const fields: FormField[] = [
      base,
      { ...base, key: 'x.zero', label: 'אפס' },
      { ...base, key: 'x.na', label: 'לא חל' },
      { ...base, key: 'x.box', label: 'תיבה', kind: 'checkbox' },
      { ...base, key: 'x.name', label: 'שם', kind: 'text' },
    ];
    const a = (k: string, state: FieldAnswer['state']) => ans({ fieldKey: k, formVersionId: 'T@2025', state });
    const answers = [a('x.deposit', { kind: 'value', value: 12500 }), a('x.zero', { kind: 'zero' }), a('x.na', { kind: 'notApplicable', reason: '—' }), a('x.box', { kind: 'value', value: true }), a('x.name', { kind: 'value', value: 'דוד כהן' })];
    const good = verifyFilledForm({ versionId: 'T@2025', fileVersionId: 'T@2025', fields, answers, extracted: [
      { fieldKey: 'x.deposit', text: '12,500 ₪' }, { fieldKey: 'x.zero', text: '0' }, { fieldKey: 'x.na', text: '' }, { fieldKey: 'x.box', checked: true }, { fieldKey: 'x.name', text: '‏דוד  כהן' },
    ] });
    assert(good.ok, JSON.stringify(good.problems));
    const bad = verifyFilledForm({ versionId: 'T@2025', fileVersionId: 'T@2025', fields, answers, extracted: [
      { fieldKey: 'x.deposit', text: '1,250' }, { fieldKey: 'x.zero', text: '' }, { fieldKey: 'x.na', text: '0' }, { fieldKey: 'x.box', checked: false }, { fieldKey: 'x.name', text: 'ןהכ דוד' },
    ], calculations: [{ fieldKey: 'x.deposit', expected: 12_500 }], annexesExpected: ['1320'], annexesPresent: [] });
    const codes = bad.problems.map(p => p.code).sort().join(' ');
    equal(codes, ['annexMissing', 'calculationMismatch', 'checkboxMismatch', 'filledButNotApplicable', 'hebrewReversed', 'valueMismatch', 'valueMissing'].sort().join(' '));
  }),

  test('אימות מילוי: גרסה שגויה ותשובה חסרה חוסמות; פתיחה מחדש משווה לקובץ שהופק', () => {
    equal(verifyFilledForm({ versionId: 'T@2025', fileVersionId: 'T@2024', fields: [base], answers: [], extracted: [] }).problems[0].code, 'wrongVersion');
    equal(verifyFilledForm({ versionId: 'T@2025', fileVersionId: 'T@2025', fields: [base], answers: [], extracted: [] }).problems[0].code, 'answerMissing');
    equal(verifyReopened([{ fieldKey: 'a', text: '5' }, { fieldKey: 'b', checked: true }], [{ fieldKey: 'a', text: '5' }, { fieldKey: 'b', checked: true }]).length, 0);
    equal(verifyReopened([{ fieldKey: 'a', text: '5' }, { fieldKey: 'b', checked: true }], [{ fieldKey: 'a', text: '' }]).length, 2);
  }),

  test('1301 בפועל: 2024 ← 2025 — רק מספרי סעיפים זזו; עדכון מיפוי בלי פנייה, ותשובה מ-2024 לא נשאלת שוב', () => {
    const ch = diffFormVersions(FIELDS_1301_2024, FIELDS_1301_2025);
    const moved = FIELDS_1301_2025.filter(f => FIELDS_1301_2024.find(o => o.key === f.key)!.section !== f.section).length;
    assert(moved > 0 && ch.length === moved, `שינוי לכל שדה שזז: ${ch.length} מתוך ${moved}`);
    assert(ch.every(c => c.kind === 'sectionChanged'), 'רק מספור');
    equal(ch.find(c => c.fieldKey === 'sf.selfEmployedDeposit')?.before, 'סעיף 48');
    const c = ctx({ incomeTaxType: 'selfEmployed', krenHashtalmutSE: 9_000 }, {}, 2025);
    const prior = ans({ fieldKey: 'sf.selfEmployedDeposit', taxYear: 2025, formVersionId: '1301@2024', state: { kind: 'value', value: 9_000 } });
    const fu = followUpsForChange(ch, FIELDS_1301_2025, c, [prior]);
    assert(fu.every(x => x.kind === 'mappingOnly' || x.kind === 'ask'), 'אין archive/verify על מספור');
    equal(fu.find(x => x.fieldKey === 'sf.selfEmployedDeposit')?.kind, 'mappingOnly');
    const f = FIELDS_1301_2025.find(x => x.key === 'sf.selfEmployedDeposit')!;
    equal(fieldReadiness(f, c, [prior], FIELDS_BY_VERSION).status, 'ready', 'תשובה תקפה לא נשאלת שוב');
  }),

  test('נספחים: נספח א׳ נדרש לבעל עסק; ברירת המחדל «לא ידוע», לא «לא נדרש»', () => {
    const a1320 = ANNEXES_1301_2025.find(a => a.formId === '1320')!;
    equal(a1320.relevance?.(ctx({ incomeTaxType: 'selfEmployed' })), 'yes');
    const unknown = ANNEXES_1301_2025.filter(a => !a.relevance).length;
    assert(unknown > 0, 'יש נספחים בלי תנאי מול התיק');
    for (const a of ANNEXES_1301_2025) assert(SOURCES[a.sourceId], `${a.formId}: מקור`);
  }),

  test('פרומפט התחזוקה מוביל ללימוד הטופס עצמו', () => {
    const p = buildMaintenancePrompt({ kind: 'all' });
    for (const must of ['diffFormVersions', 'followUpsForChange', 'verifyFilledForm', 'verifyReopened', 'תיבת סימון', 'לא ממציאים', '1301@2025', 'נספחים', 'smartForms', 'readScope', 'catalog.json', 'מפת הכיסוי', 'annex-info', 'שלוש שכבות', 'שאלונים', 'utils/taxCalculations.ts', 'לפני ואחרי', 'openItems.ts', 'מה המערכת עושה בינתיים']) assert(p.includes(must), `חסר: ${must}`);
  }),
];

const FIELDS_BY_TEST = { 'T@2025': [base], ...FIELDS_BY_VERSION };
