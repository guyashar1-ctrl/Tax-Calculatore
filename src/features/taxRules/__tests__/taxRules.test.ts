// ─── בדיקות: מרשם הכללים, השער והחישובים (10.10.2026) ──────────────────────
// ‼ מה נעול כאן:
//   · הדוגמאות הרשמיות ממדריך 2025 ומדף ב״ל יוצאות בדיוק — אם ערך במרשם זז,
//     הדוגמה נשברת ומישהו צריך להסביר למה.
//   · ערך משני, ערך של שנה אחרת, כלל לא מאומת או כלל שאינו לחישוב — לא הופכים
//     לבסיס חישוב בשקט. בהמחשה מותר רק משני / שנה קודמת, ותמיד מסומן.
//   · כל כלל שנושא ידע מפנה אליו קיים, ולכל ערך יש מקור מוכר.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { gate, ruleView, weakestBasis, RULESET_VERSION } from '../registry';
import { ALL_RULES, RULES } from '../rules';
import { SOURCES, ALL_SOURCES, EXPECTED_PUBLICATIONS } from '../sources';
import { ruleUsage, reviewNeeded, reviewSeverity } from '../impact';
import { studyFundLimit, pensionTrackA, niSelfEmployedQuarter, wealthDeadline, beneficialMember, CALC_RULES } from '../calc';
import { TOPICS } from '../../taxKnowledge/topics';
import { buildMaintenancePrompt } from '../../taxKnowledge/maintenancePrompt';
import SF_BODY from '../../taxKnowledge/topics/StudyFundBody.tsx?raw';
import PEN_BODY from '../../taxKnowledge/topics/PensionBody.tsx?raw';
import NI_BODY from '../../taxKnowledge/topics/NiBody.tsx?raw';
import MP_BODY from '../../taxKnowledge/topics/MandatoryPensionBody.tsx?raw';
import ADV_BODY from '../../taxKnowledge/topics/AdvancesBody.tsx?raw';
import WEALTH_BODY from '../../taxKnowledge/topics/WealthBody.tsx?raw';
import MICRO_BODY from '../../taxKnowledge/topics/MicroBusinessBody.tsx?raw';
import ANNUAL_BODY from '../../taxKnowledge/topics/AnnualReturnBody.tsx?raw';
import F6111_BODY from '../../taxKnowledge/topics/Form6111Body.tsx?raw';
import MATERNITY_BODY from '../../taxKnowledge/topics/MaternityBody.tsx?raw';
import DEALER_BODY from '../../taxKnowledge/topics/DealerTypeBody.tsx?raw';

export const TESTS: TestCase[] = [
  test('קרן השתלמות, שכיר־עצמאי: דוגמת המדריך 104,853 → 4,718', () => {
    const r = studyFundLimit({ year: 2025, businessIncome: 150_000, employerDeterminingSalary: 188_544, deposit: 20_000 });
    assert(r.ok, JSON.stringify(r.problems));
    equal(r.value!.cap, 104_853);
    equal(r.value!.maxDeduction, 4_718);
    equal(r.value!.deducted, 4_718);
    assert(r.usedRules.some(u => u.ruleId === 'sf.mixed.formula'), 'נוסחת השכיר־עצמאי נרשמה כנכנסת');
  }),

  test('קרן השתלמות, עצמאי בלבד: ההכנסה מתחת לתקרה היא הבסיס', () => {
    const r = studyFundLimit({ year: 2025, businessIncome: 200_000, employerDeterminingSalary: 0 });
    assert(r.ok, 'ok');
    equal(r.value!.cap, 200_000);
    equal(r.value!.maxDeduction, 9_000);
    assert(!r.usedRules.some(u => u.ruleId === 'sf.mixed.formula'), 'בלי משכורת — בלי נוסחת השכיר־עצמאי');
  }),

  test('פנסיה מסלול א׳: דוגמאות המדריך 10,000 → 7,000 ו-14,500 → 9,500', () => {
    const scenario = { noWorkIncome: true, under50: true, notBeneficialMember: true };
    const a = pensionTrackA({ year: 2025, nonWorkIncome: 100_000, deposits: 10_000, scenario });
    assert(a.ok, JSON.stringify(a.problems));
    equal(a.value!.deduction, 7_000);
    equal(a.value!.toCredit, 3_000);
    const b = pensionTrackA({ year: 2025, nonWorkIncome: 100_000, deposits: 14_500, scenario });
    equal(b.value!.deduction, 9_500);
  }),

  test('פנסיה מסלול א׳: בלי לדעת שאין הכנסת עבודה — אין תוצאה', () => {
    const r = pensionTrackA({ year: 2025, nonWorkIncome: 100_000, deposits: 10_000, scenario: { under50: true } });
    equal(r.ok, false);
    assert(r.problems.some(p => p.kind === 'unknownScenario'), 'הבעיה: תרחיש לא ידוע');
    const m = pensionTrackA({ year: 2025, nonWorkIncome: 100_000, deposits: 10_000, scenario: { noWorkIncome: true, under50: true, beneficialMember: true } });
    equal(m.ok, false, 'עמית מוטב = מסלול ב׳, שלא מומש');
  }),

  test('ב״ל לעצמאי 2026: דוגמת ב״ל 12,000 לחודש → בסיס 34,690 ו-3,864 לרבעון', () => {
    const r = niSelfEmployedQuarter({ year: 2026, quarterlyIncome: 36_000 });
    assert(r.ok, JSON.stringify(r.problems));
    equal(r.value!.base, 34_690);
    equal(r.value!.total, 3_864);
  }),

  test('ב״ל לעצמאי: מתחת לסף — בסיס = הכנסה ÷ (1 + מופחת×0.52), לא הנוסחה של מעל הסף', () => {
    const r = niSelfEmployedQuarter({ year: 2026, quarterlyIncome: 18_000 });
    assert(r.ok, JSON.stringify(r.problems));
    equal(r.value!.base, 17_591);
    equal(r.value!.regularPart, 0);
    // הבסיס פלוס הניכוי (52% מדמי הביטוח הלאומי) מחזיר את ההכנסה
    const back = r.value!.base + r.value!.ni * 0.52;
    assert(Math.abs(back - 18_000) < 2, String(back));
    // בדיוק על הסף שתי הנוסחאות נפגשות — אין קפיצה
    const at = niSelfEmployedQuarter({ year: 2026, quarterlyIncome: 36_000 });
    assert(at.value!.base >= r.value!.base, 'מונוטוני');
  }),

  test('הצהרת הון: 120 יום מהמאוחר מבין הדרישה והיום הקובע', () => {
    const r = wealthDeadline({ demandDate: '2026-09-14', asOfDate: '2025-12-31' });
    assert(r.ok, 'ok');
    equal(r.value, '2027-01-12');
    equal(wealthDeadline({ demandDate: '2025-10-01', asOfDate: '2025-12-31' }).value, '2026-04-30');
  }),

  test('ערך משני חוסם חישוב ומותר בהמחשה, מסומן; ערך רשמי או נגזר עובר', () => {
    // כל כלל לחישוב שיש לו ערך משני לשנה מדויקת — נחסם בחישוב ומותר בהמחשה.
    const weak = ALL_RULES.flatMap(r => r.computable ? r.values.filter(v => v.basis === 'secondary').map(v => ({ r, v })) : []);
    for (const { r, v } of weak) {
      const scenario = Object.fromEntries((r.scope ?? []).map(t => [t, true]));
      assert(gate([r.id], v.taxYear, scenario).hard.some(p => p.kind === 'weakBasis'), `${r.id}/${v.taxYear} נחסם`);
      equal(gate([r.id], v.taxYear, scenario, 'illustration').hard.length, 0, `${r.id}/${v.taxYear} מותר בהמחשה`);
    }
    // קרן השתלמות 2026: השיעור נגזר מנוסח רשמי + אין תיקון; התקרה רשמית — עובר.
    const sf = studyFundLimit({ year: 2026, businessIncome: 200_000, employerDeterminingSalary: 0 });
    assert(sf.ok, JSON.stringify(sf.problems));
    equal(sf.value?.maxDeduction, 9_000);
    assert(sf.usedRules.every(u => u.basis === 'primary' || u.basis === 'derived'), 'נכנס רק ביסוס רשמי או נגזר');
    const ben = beneficialMember({ year: 2026, pensionDeposits: 30_000 });
    assert(ben.ok, 'רף 2026 רשמי');
    equal(ben.value?.threshold, 26_436);
  }),

  test('ערך של שנה קודמת: חסום בחישוב, מסומן כשנה אחרת בהמחשה', () => {
    const v = ruleView('sf.se.ceiling', 2027)!;
    equal(v.exactYear, false);
    assert(v.entry && v.entry.taxYear < 2027, 'שנה קודמת');
    const calc = studyFundLimit({ year: 2027, businessIncome: 100_000, employerDeterminingSalary: 0 });
    equal(calc.ok, false);
    assert(calc.problems.some(p => p.kind === 'noValueForYear' && p.nearestYear !== undefined), 'noValueForYear');
    const ill = studyFundLimit({ year: 2027, businessIncome: 100_000, employerDeterminingSalary: 0 }, 'illustration');
    assert(ill.ok && ill.illustrative, 'illustrative');
    assert(ill.usedRules.every(u => u.taxYear < 2027), 'נרשמה שנת הערך שנכנס בפועל, לא השנה שביקשו');
    equal(weakestBasis(['sf.se.ceiling'], 2027), 'secondary');
  }),

  test('כלל לא מאומת וכלל שאינו לחישוב נחסמים תמיד, גם בהמחשה', () => {
    const unverified = ALL_RULES.filter(r => r.values.some(v => v.basis === 'unverified'));
    assert(unverified.length > 0, 'יש במרשם כללים לא מאומתים (למשל תחילת הוותק בקרן)');
    for (const r of unverified) {
      const y = r.values.find(v => v.basis === 'unverified')!.taxYear;
      const { hard } = gate([r.id], y, {}, 'illustration');
      assert(hard.length > 0, `${r.id} נחסם בהמחשה`);
    }
    const nc = gate(['sf.se.maxDeduction'], 2025, {}, 'illustration');
    assert(nc.hard.some(p => p.kind === 'notComputable'), 'notComputable');
    assert(gate(['no.such.rule'], 2025, {}).hard.some(p => p.kind === 'missingRule'), 'missingRule');
  }),

  test('כל כלל שנושא מפנה אליו קיים, ולכל ערך מקור מוכר ומועד בדיקה', () => {
    for (const t of TOPICS) for (const id of t.ruleIds) assert(RULES[id], `${t.id} → ${id}`);
    for (const r of ALL_RULES) for (const v of r.values) {
      assert(SOURCES[v.sourceId], `${r.id}/${v.taxYear}: מקור ${v.sourceId}`);
      assert(/^(\d{2}\.)?\d{2}\.\d{4}$/.test(v.checkedAt), `${r.id}/${v.taxYear}: checkedAt ${v.checkedAt}`);
    }
  }),

  test('אין נושא «מלא» כשנשארו פערים', () => {
    for (const t of TOPICS) {
      if (t.status === 'research') assert(t.gaps.length > 0, `${t.id}: נושא במחקר מציג מה חסר`);
      assert(['usable', 'research'].includes(t.status), t.id);
    }
  }),

  test('פרומפט התחזוקה: מחקר, עדכון, בדיקת השפעה ודוח — לא רק «אומת»', () => {
    const all = buildMaintenancePrompt({ kind: 'all' });
    for (const must of ['דוח', 'השפעה', 'נדרשת בדיקה', 'הערכות מאושרות', 'נספח', 'הוראות', 'מיפוי', 'revisions', 'supersedes', 'שנת הפרסום', 'תחולה', 'גרסה']) assert(all.includes(must), `חסר: ${must}`);
    assert(all.includes(RULESET_VERSION), 'גרסת המרשם הנוכחית בפרומפט');
    const one = buildMaintenancePrompt({ kind: 'topic', topicId: 'studyFund' });
    assert(one.includes('sf.se.ceiling'), 'פרומפט נושא מפרט את כללי הנושא');
    assert(!one.includes('ni.se.highRateNi'), 'ובלי כללים של נושא אחר');
  }),

  test('אין טווח מספרים עם מקף בטקסט עברי (מתהפך ב-RTL)', () => {
    const texts = [
      ...ALL_RULES.flatMap(r => [r.label, r.law ?? '', ...r.values.flatMap(v => [typeof v.value === 'string' ? v.value : '', v.locator, v.note ?? ''])]),
      ...TOPICS.flatMap(t => [t.lead, ...t.gaps, ...t.form1301.map(f => `${f.section} ${f.fields}`)]),
    ];
    for (const s of texts.filter((x): x is string => typeof x === 'string')) assert(!/\d[–-]\d/.test(s.replace(/\d{4}-\d{2}-\d{2}/g, '')), `טווח מקפי: ${s}`);
  }),

  test('שנת המס של ערך אינה נגזרת משנת המסמך — הבדל מחייב הסבר', () => {
    for (const r of ALL_RULES) for (const v of r.values) {
      const src = SOURCES[v.sourceId];
      if (src?.refersToTaxYear && src.refersToTaxYear !== v.taxYear) {
        assert(!!v.note, `${r.id}/${v.taxYear}: המסמך ${src.id} מתאר את ${src.refersToTaxYear} — חסר הסבר למה הערך שייך ל-${v.taxYear}`);
      }
    }
    for (const s of ALL_SOURCES) {
      assert(s.docKind, `${s.id}: סוג מסמך`);
      if (s.publishedAt) assert(/^\d{4}-\d{2}-\d{2}$/.test(s.publishedAt), `${s.id}: publishedAt`);
      if (s.supersedes) assert(SOURCES[s.supersedes], `${s.id}: הגרסה הקודמת נשמרת ברשימה`);
    }
    // פרסום מאוחר: דוח 2026 מחכה ברשימת החיפוש כמסמך של 2026, לא של 2027.
    const f2026 = EXPECTED_PUBLICATIONS.find(p => p.docKind === 'form' && p.refersToTaxYear === 2026);
    assert(f2026 && f2026.usuallyPublished.includes('2027'), 'טופס 2026 צפוי ב-2027 ומשויך ל-2026');
  }),

  test('כל חישוב רשום ב-CALC_RULES עם הכללים שהוא שומר', () => {
    const runs: Record<string, { usedRules: { ruleId: string }[] }> = {
      studyFundLimit: studyFundLimit({ year: 2025, businessIncome: 150_000, employerDeterminingSalary: 188_544 }),
      beneficialMember: beneficialMember({ year: 2025, pensionDeposits: 10_000 }),
      niSelfEmployedQuarter: niSelfEmployedQuarter({ year: 2026, quarterlyIncome: 36_000 }),
      wealthDeadline: wealthDeadline({ demandDate: '2026-09-14', asOfDate: '2025-12-31' }),
      pensionTrackA: pensionTrackA({ year: 2025, nonWorkIncome: 100_000, deposits: 10_000, scenario: { noWorkIncome: true, under50: true, notBeneficialMember: true } }),
    };
    for (const [id, r] of Object.entries(runs)) {
      assert(CALC_RULES[id], `${id} רשום`);
      for (const u of r.usedRules) assert(CALC_RULES[id].ruleIds.includes(u.ruleId), `${id}: ${u.ruleId} חסר ב-CALC_RULES`);
    }
    for (const c of Object.values(CALC_RULES)) for (const id of c.ruleIds) assert(RULES[id], `CALC_RULES → ${id}`);
  }),

  test('השפעה: כלל → נושאים, חישובים ושדות 1301', () => {
    const u = ruleUsage('sf.se.ceiling');
    assert(u.topics.some(t => t.id === 'studyFund'), 'נושא קרן השתלמות');
    assert(u.calcs.some(c => c.id === 'studyFundLimit'), 'החישוב');
    assert(u.form1301.some(f => f.section === '51'), 'סעיף 51 בטופס');
  }),

  test('תוצאה שמורה: אין שינוי ⇒ אין בדיקה; ערך שהשתנה ⇒ «נדרשת בדיקה» בלי לגעת בתוצאה', () => {
    const r = studyFundLimit({ year: 2025, businessIncome: 150_000, employerDeterminingSalary: 188_544 });
    const saved = r.usedRules.map(u => ({ ...u }));
    equal(reviewNeeded(saved).length, 0);
    const stale = saved.map(u => u.ruleId === 'sf.se.ceiling' ? { ...u, value: 290_000 } : u);
    const reasons = reviewNeeded(stale);
    equal(reasons.length, 1);
    equal(reasons[0].kind, 'valueChanged');
    assert(reasons[0].text.includes('290') && reasons[0].text.includes('293'), `\u05d4\u05d4\u05e1\u05d1\u05e8 \u05de\u05e6\u05d9\u05d2 \u05dc\u05e4\u05e0\u05d9 \u05d5\u05d0\u05d7\u05e8\u05d9: ${reasons[0].text}`);
    equal(reviewSeverity(reasons), 'review');
    equal(stale.find(u => u.ruleId === 'sf.se.ceiling')!.value, 290_000, 'הרשומה השמורה לא שונתה');
    const basis = reviewNeeded(saved.map(u => u.ruleId === 'sf.se.rate' ? { ...u, basis: 'secondary' as const } : u));
    equal(basis[0].kind, 'basisChanged');
    equal(reviewSeverity(basis), 'info');
  }),

  test('תוצאה שנשמרה על ערך של שנה קודמת ⇒ «יש עכשיו ערך לשנה עצמה»', () => {
    const saved = [{ ruleId: 'pen.beneficial.threshold', requestedYear: 2026, taxYear: 2025, basis: 'primary' as const, value: 24_069, sourceId: 'itaGuide2025' }];
    const reasons = reviewNeeded(saved);
    equal(reasons[0]?.kind, 'exactYearPublished');
    equal(reviewSeverity(reasons), 'review');
    equal(reviewNeeded([{ ...saved[0], ruleId: 'gone.rule' }])[0].kind, 'ruleRemoved');
  }),

  test('קרן השתלמות: משכורת 120,000 והכנסה 250,000 → בסיס 173,397, ניכוי 7,803', () => {
    const r = studyFundLimit({ year: 2025, businessIncome: 250_000, employerDeterminingSalary: 120_000 });
    equal(r.value?.cap, 173_397);
    equal(r.value?.maxDeduction, 7_803);
  }),

  test('טקסט נושא לא מעתיק ערך מהמרשם — הערך נשלף, כדי שעדכון לא ישאיר מספר ישן', () => {
    const bodies: Record<string, string> = { studyFund: SF_BODY, pensionSE: PEN_BODY, niSelfEmployed: NI_BODY, mandatoryPension: MP_BODY, advances: ADV_BODY, wealth: WEALTH_BODY, microBusiness: MICRO_BODY, annualReturn: ANNUAL_BODY, form6111: F6111_BODY, maternity: MATERNITY_BODY, dealerType: DEALER_BODY };
    for (const t of TOPICS) {
      const src = bodies[t.id];
      assert(src !== undefined, `${t.id}: יש גוף נושא`);
      for (const id of t.ruleIds) for (const v of RULES[id]?.values ?? []) {
        if (typeof v.value !== 'number' || v.value < 1000) continue;
        for (const lit of [v.value.toLocaleString('en-US'), String(v.value).replace(/\B(?=(\d{3})+(?!\d))/g, '_')]) {
          assert(!src.includes(lit), `${t.id}: «${lit}» (${id}/${v.taxYear}) כתוב בטקסט במקום להישלף מהמרשם`);
        }
      }
    }
  }),

  test('מקדמות: חודש החתך ומועד תחילת השינוי נפרדים; אין מסקנה גורפת על חודשים שעברו', () => {
    assert(ADV_BODY.includes('const [effective, setEffective]'), 'בורר נפרד למועד תחילת השינוי');
    assert(!ADV_BODY.includes('i < cutoff - 1'), 'הרצועות לא נשענות על חודש החתך');
    assert(ADV_BODY.includes('unknownretro'), 'חודשים שעברו במס הכנסה — «לא אומת»');
    assert(!ADV_BODY.includes('חודשים שעברו לא מחויבים מחדש'), 'אין קביעה מוחלטת בטקסט');
    const v = RULES['it.advances.voluntaryIncreaseRetro'].values.find(x => x.taxYear === 2026)!;
    // 14.10.2026 (research/advances-topup-charges): השלמה מרצון הוכרעה; הגדלה לפי 180(ב) — נשארה פתוחה, ובמפורש
    assert(String(v.value).startsWith('השלמה מרצון') && String(v.value).includes('פתוח: הגדלה בידי פקיד השומה (180(ב))'), 'מה שהוכרע — מוכרע; מה שפתוח — כתוב');
    assert((v.revisions ?? []).length >= 2, 'הגרסאות הקודמות נשמרו');
  }),

  test('דוגמה מהמשרד אינה הכרעה כללית — לא כתוב «תכריע» בכללים ובנושאים', () => {
    const all = JSON.stringify(ALL_RULES) + JSON.stringify(TOPICS.map(t => t.gaps)) + ADV_BODY;
    assert(!all.includes('תכריע'), 'נמצא «תכריע»');
  }),
];
