// ─── הדוח של שנה שעברה כנקודת פתיחה (19.10.2026) ────────────────────────────────────────────────────────────
// ‼ מה נעול כאן (ההמחשה: docs/proposals/2026-10-19-simple-annual-questionnaire.html, לשונית «לפני השליחה»):
//   · קריאה = הצעה: מה שיש לו מקום בכרטיס נכנס רק אחרי סימון, הצעה אחת לכל שדה; מה שאין לו מקום — אריח מסומן מראש.
//   · «של מי» ושם ניתנים לתיקון, וההתאמה לכרטיס סובלת שיבוש (שני סטים אמיתיים, 19.10: שמות שובשו, צד התהפך).
//   · מה שכבר בכרטיס — «כבר בתיק», לא מוצע שוב; הכרטיס לא נדרס.
//   · אלמן/ה בשנת הדוח — אריח האירוע מסומן ופותח ישר את ענף הפטירה (בלי «מה קרה?»), כולל 106 של בן/בת הזוג.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { buildYearPicture } from '../picture';
import { buildAskPlan, ANNUAL_GRID_KEY } from '../asks';
import { isPriorReturnDoc, priorReturnApply, priorReturnRows, sameBody, type PriorReading } from '../priorReturn';
import type { MultiFollowUp, MultiOption } from '../types';

const client = (p: Partial<Client> = {}): Client => ({
  id: 'c1', firstName: 'ישראל', lastName: 'ישראלי', familyStatus: 'married', spouseFirstName: 'ישראלה', gender: 'male',
  children: [], employers: [], businesses: [], properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], fieldMeta: {}, ...p,
} as unknown as Client);

/** בצורה של הקריאה האמיתית של 2024 — שמות דוגמה. */
const READING: PriorReading = {
  taxYear: 2024, registered: { firstName: 'ישראל', lastName: 'ישראלי' }, spouse: { firstName: 'ישראלה רות', lastName: 'ישראלי' }, familyStatus: 'married',
  employers: [{ name: 'משרד ממשלתי לדוגמה - מורים', side: 'spouse', evidence: 'טופס 106 עמוד 7' }, { name: 'ישראלי רובוטיקס בע"מ', side: 'registered', evidence: 'טופס 106 עמוד 10' }],
  pensions: [{ payer: 'מינהלת הגמלאות', side: 'spouse', survivors: false }],
  disability: [{ side: 'spouse', percent: 100 }],
  accounts: [{ institution: 'בנק יהב לעובדי המדינה בע"מ', side: 'joint' }, { institution: 'בנק לאומי', side: 'joint' }],
  lifeInsurance: [{ insurer: 'איילון חברה לביטוח בע"מ', side: 'registered' }],
  pensionDeposits: [], rental: false, foreign: false, capitalGains: true, donations: false, niBenefits: [],
};
const SRC = { year: 2024, fileName: 'סט שהוגש 2024.pdf' };

const planFor = (c: Client, lastYear?: Parameters<typeof buildAskPlan>[1]['lastYear']) => {
  const p = buildYearPicture({ client: c, taxYear: 2025, purpose: 'annual', today: '2026-10-19', facts: [], evidence: [], asks: [] });
  return buildAskPlan([...p.toConfirm, ...p.toAsk], { client: c, taxYear: 2025, purpose: 'annual', lastYear });
};
const gridOf = (c: Client, lastYear?: Parameters<typeof planFor>[1]) => {
  const g = planFor(c, lastYear).find(e => e.itemKey === ANNUAL_GRID_KEY);
  if (!g || g.prompt.input.kind !== 'multi') throw new Error('אין מסך רשת');
  return g.prompt.input.options;
};
const fus = (o?: MultiOption): MultiFollowUp[] => [...(o?.followUp ? [o.followUp] : []), ...(o?.followUps ?? [])];

export const TESTS: TestCase[] = [
  test('התאמה סובלנית: «היפגר פד רובוטיקס בע״מ» = «הייפר פוד רובוטיקס»; «בנק לאומי» ≠ «בנק יהב»', () => {
    assert(sameBody('היפגר פד רובוטיקס בע"מ', 'הייפר פוד רובוטיקס'), 'שיבוש לא זוהה');
    assert(sameBody('בנק יהב לובדי המדינה בע"מ', 'בנק יהב'), 'קיצור לא זוהה');
    assert(!sameBody('בנק לאומי', 'בנק יהב'), 'שני בנקים זוהו כאחד');
    assert(!sameBody('הפניקס', 'איילון'), 'שני מבטחים זוהו כאחד');
  }),
  test('כרטיס ריק: מעסיקים, חשבונות וביטוח חיים — לכרטיס, הצעה אחת לכל שדה; קצבה ונכות של בן/בת הזוג — אריחים', () => {
    const c = client();
    const rows = priorReturnRows(c, READING);
    equal(rows.filter(r => r.on).length, rows.length);
    const { proposals, hints } = priorReturnApply(c, rows, READING, SRC);
    equal(proposals.map(p => p.fieldKey).sort().join(','), 'employers,hasLifeInsurance,investmentAccounts');
    const emps = (proposals.find(p => p.fieldKey === 'employers')!.newValue.patch as { employers: { name: string; belongsToSpouse?: boolean }[] }).employers;
    equal(emps.map(e => `${e.name}${e.belongsToSpouse ? '·בז' : ''}`).join(' | '), 'משרד ממשלתי לדוגמה - מורים·בז | ישראלי רובוטיקס בע"מ');
    equal(Object.keys(hints.tiles).sort().join(','), 'pension.received,special.disability');
    assert(hints.tiles['pension.received'].includes('מינהלת הגמלאות') && hints.tiles['pension.received'].includes('ישראלה'), hints.tiles['pension.received']);
    assert(proposals.every(p => (p.note ?? '').includes('2024')), 'הצעה בלי מקור');
  }),
  test('מה שכבר בכרטיס (גם בשיבוש) — «כבר בתיק», בלי תיבה ובלי הצעה; הכרטיס לא נדרס', () => {
    const c = client({ employers: [{ id: 'e1', name: 'ישראלי רובוטיקס' }] as Client['employers'], hasLifeInsurance: true,
      investmentAccounts: [{ id: 'i1', institutionName: 'בנק לאומי' }] as Client['investmentAccounts'] });
    const rows = priorReturnRows(c, READING);
    assert(!!rows.find(r => r.kind === 'employer' && r.person === 'client')?.inCard, 'המעסיק שבכרטיס הוצע שוב');
    assert(!!rows.find(r => r.kind === 'lifeInsurance')?.inCard, 'ביטוח חיים שמסומן בכרטיס הוצע שוב');
    const { proposals } = priorReturnApply(c, rows, READING, SRC);
    const emps = (proposals.find(p => p.fieldKey === 'employers')!.newValue.patch as { employers: { id: string }[] }).employers;
    equal(emps.length, 2); equal(emps[0].id, 'e1');
    const accts = (proposals.find(p => p.fieldKey === 'investmentAccounts')!.newValue.patch as { investmentAccounts: { institutionName: string }[] }).investmentAccounts;
    equal(accts.map(a => a.institutionName).join(','), 'בנק לאומי,בנק יהב לעובדי המדינה בע"מ');
    assert(!proposals.some(p => p.fieldKey === 'hasLifeInsurance'), 'ביטוח חיים נדרס');
  }),
  test('המשרד מתקן: שורה שלא סומנה לא נכנסת; שם ו«של מי» שתוקנו — הם שנכנסים', () => {
    const c = client();
    const rows = priorReturnRows(c, READING).map(r => r.kind === 'account' && r.name.includes('לאומי') ? { ...r, on: false }
      : r.kind === 'employer' && r.person === 'client' ? { ...r, name: 'ישראלי רובוטיקס', person: 'spouse' as const } : r);
    const { proposals } = priorReturnApply(c, rows, READING, SRC);
    const emps = (proposals.find(p => p.fieldKey === 'employers')!.newValue.patch as { employers: { name: string; belongsToSpouse?: boolean }[] }).employers;
    assert(emps.every(e => e.belongsToSpouse), 'התיקון ל«של מי» לא נכנס');
    assert(emps.some(e => e.name === 'ישראלי רובוטיקס'), 'השם המתוקן לא נכנס');
    const accts = (proposals.find(p => p.fieldKey === 'investmentAccounts')!.newValue.patch as { investmentAccounts: { institutionName: string }[] }).investmentAccounts;
    equal(accts.length, 1);
  }),
  test('«רשום» בדוח הוא בן/בת הזוג בכרטיס ⇒ הצדדים מתהפכים', () => {
    const rows = priorReturnRows(client({ firstName: 'ישראלה', spouseFirstName: 'ישראל' }),
      { ...READING, registered: { firstName: 'ישראל' }, spouse: { firstName: 'ישראלה' } });
    equal(rows.find(r => r.kind === 'disability')?.person, 'client');
    equal(rows.find(r => r.kind === 'employer' && r.name.includes('רובוטיקס'))?.person, 'spouse');
  }),
  test('בשאלון: אריח שהיה בדוח הקודם — מסומן מראש, עם «ב-2024: …»', () => {
    const c = client();
    const { hints } = priorReturnApply(c, priorReturnRows(c, READING), READING, SRC);
    const o = gridOf(c, hints).find(x => x.key === 'pension.received');
    assert(!!o?.preset, 'לא מסומן מראש');
    assert(!!o?.note?.startsWith('ב-2024: מינהלת הגמלאות'), o?.note ?? '');
    assert(!gridOf(c, hints).find(x => x.key === 'donations.given')?.preset, 'אריח שלא היה סומן');
  }),
  test('אלמן/ה מ-2025 בכרטיס: אריח הפטירה מסומן ופותח ישר את הענף (בלי «מה קרה?»); 106 של בן/בת הזוג פעם אחת; השם מהדוח הקודם', () => {
    const c = client({ familyStatus: 'widowed', widowhoodYear: 2025, spouseFirstName: undefined,
      employers: [{ id: 'e1', name: 'ישראלי רובוטיקס' }, { id: 'e2', name: 'משרד ממשלתי לדוגמה', belongsToSpouse: true }] as Client['employers'] });
    const o = gridOf(c, { year: 2024, tiles: {}, spouseName: 'ישראלה' }).find(x => x.key === 'household.familyChange');
    assert(!!o?.preset, 'אריח האירוע לא מסומן');
    equal(o?.label, 'ישראלה נפטרה'); // 20.10.2026 · בלי לוכסנים (gender.ts)
    const f = fus(o);
    equal(f.map(x => x.itemKey).join(','), 'family.death,family.deathIncome,family.deathPayouts,family.survivorPensions,family.deathDocs');
    const inc = f.find(x => x.itemKey === 'family.deathIncome');
    const salary = inc?.prompt.input.kind === 'multi' ? inc.prompt.input.options.find(x => x.key === 'family.deathGotSalary') : undefined;
    equal(fus(salary).length, 0); // המעסיק שלה בכרטיס — ה-106 נשאל לפי הישות
    equal(planFor(c).filter(e => e.itemKey === 'salary.form106' && e.subjectRole === 'spouse').length, 1);
    assert(!planFor(c).some(e => e.itemKey === 'household.familyEvent'), '«מה קרה?» נשאל');
  }),
  test('נשוי/אה בלי אירוע בכרטיס — «מה קרה?» כמו קודם, בלי סימון מראש', () => {
    const o = gridOf(client()).find(x => x.key === 'household.familyChange');
    assert(!o?.preset, 'סומן מראש');
    equal(fus(o)[0]?.itemKey, 'household.familyEvent');
  }),
  test('איתור הסט: שנה קודמת בלבד; תווית «סט שהוגש», קטגוריה 1301 או שם קובץ', () => {
    assert(isPriorReturnDoc({ fileName: 'x.pdf', year: '2024', label: 'סט שהוגש למס הכנסה' }, 2025), 'תווית');
    assert(isPriorReturnDoc({ fileName: 'דוח מס 2024.pdf', year: 2024 }, 2025), 'שם קובץ');
    assert(!isPriorReturnDoc({ fileName: 'דוח מס 2023.pdf', year: '2023', label: 'סט שהוגש למס הכנסה' }, 2025), 'שנה אחרת');
    assert(!isPriorReturnDoc({ fileName: 'תלוש.pdf', year: '2024', label: 'תלושי שכר' }, 2025), 'מסמך אחר');
  }),
];
