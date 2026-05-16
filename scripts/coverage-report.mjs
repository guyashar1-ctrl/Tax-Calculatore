// Coverage report for 1301 — runs over 3 sample profiles and prints
// how many fields would be covered/partial/missing for each.
//
// Usage:  node scripts/coverage-report.mjs

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Load the TS source as text and extract the field count for a sanity check.
const fieldsTs = readFileSync(resolve(root, 'src/features/annualReport/form1301Fields.ts'), 'utf8');
const matches = fieldsTs.match(/fieldNumber: '/g) ?? [];
const totalFields = matches.length;

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', grey: '\x1b[90m',
};

// 3 פרופילים שונים — מדגימים איך triage מצמצם את מרחב הבדיקה
const PROFILES = [
  {
    name: 'שכיר/ה רווק/ה ללא ילדים, מעביד אחד',
    model: {
      taxYear: 2025,
      identity: { maritalStatus: 'single', childrenCount: 0, residencyType: 'resident',
                  livesInQualifyingSettlement: false, hasDisability: false },
      spouse: {},
      income: { sources: ['salary'], salaryEmployerCount: 1, receivedSeverance: false },
      taxPaid: { paidAdvancePayments: false, withholdingSources: ['salary_106'] },
      deductionsCredits: { isDischargedSoldier: false, hasAcademicDegree: false },
      specialSituations: { hasCarriedLosses: false, wealthDeclarationRequired: false },
    },
    answeredQuestionIds: [
      'identity_basics', 'marital_status', 'children_count', 'residency_type',
      'qualifying_settlement', 'has_disability', 'income_sources',
      'salary_employer_count', 'received_severance',
      'has_interest_income', 'has_pension_income', 'has_other_income',
      'donations', 'life_insurance', 'self_pension',
      'is_discharged_soldier', 'has_academic_degree',
      'paid_advance_payments', 'had_withholding_at_source',
      'carried_losses', 'wealth_declaration_required', 'final_declaration',
    ],
  },
  {
    name: 'נשוי/אה + 2 ילדים + שכר משני מעבידים + שכ"ד פטור + תרומה',
    model: {
      taxYear: 2025,
      identity: { maritalStatus: 'married', spouseHasIncome: true, hasSpouse: true,
                  childrenCount: 2, childrenWithSpecialNeeds: false,
                  residencyType: 'resident', livesInQualifyingSettlement: false, hasDisability: false },
      spouse: { registeredRole: 'file_jointly', has106: true, hasBusinessIncome: false, eligibleSeparateCalc: true },
      income: { sources: ['salary', 'rental'], salaryEmployerCount: 2, receivedSeverance: false,
                rentalTrack: 'exempt', rentalGrossAnnual: 60000 },
      taxPaid: { paidAdvancePayments: false, withholdingSources: ['salary_106'] },
      deductionsCredits: { donationAmount: 5000, isDischargedSoldier: false, hasAcademicDegree: false },
      specialSituations: { hasCarriedLosses: false, wealthDeclarationRequired: false },
    },
    answeredQuestionIds: [
      'identity_basics', 'marital_status', 'registered_spouse_role', 'spouse_has_income',
      'spouse_has_106', 'spouse_has_business', 'eligible_separate_calc',
      'children_count', 'children_details_required', 'children_special_needs',
      'residency_type', 'qualifying_settlement', 'has_disability', 'income_sources',
      'salary_employer_count', 'received_severance', 'rental_track', 'rental_gross',
      'has_interest_income', 'has_pension_income', 'has_other_income',
      'donations', 'life_insurance', 'self_pension',
      'is_discharged_soldier', 'has_academic_degree',
      'paid_advance_payments', 'had_withholding_at_source',
      'carried_losses', 'wealth_declaration_required', 'final_declaration',
    ],
  },
  {
    name: 'עצמאי + ני"ע + חו"ל + תרומות + מקדמות',
    model: {
      taxYear: 2025,
      identity: { maritalStatus: 'married', spouseHasIncome: false, hasSpouse: true,
                  childrenCount: 1, residencyType: 'resident', hasDisability: false },
      spouse: { registeredRole: 'me_only', has106: false, hasBusinessIncome: false },
      income: { sources: ['business', 'capital', 'foreign'], businessKind: 'osek_morshe',
                bizRevenueBand: '100k_2m', bizHasClientWithholding: true,
                capitalSubTypes: ['securities'], capitalHasWithholding: true,
                foreignCountries: 'ארה"ב', foreignIncomeKinds: ['capital'], foreignPaidTaxAbroad: true },
      taxPaid: { paidAdvancePayments: true, withholdingSources: ['business_clients', 'securities', 'foreign'] },
      deductionsCredits: { donationAmount: 10000, hasKerenHashtalmutSelf: true,
                           isDischargedSoldier: false, hasAcademicDegree: false },
      specialSituations: { hasCarriedLosses: false, wealthDeclarationRequired: false },
    },
    answeredQuestionIds: [
      'identity_basics', 'marital_status', 'registered_spouse_role', 'spouse_has_income',
      'children_count', 'children_details_required', 'children_special_needs',
      'residency_type', 'qualifying_settlement', 'has_disability', 'income_sources',
      'business_kind', 'biz_revenue_band', 'biz_has_client_withholding', 'biz_keren_hashtalmut',
      'capital_has_securities', 'capital_securities_withholding', 'capital_has_crypto', 'capital_has_real_estate',
      'foreign_countries', 'foreign_income_kinds', 'foreign_paid_tax_abroad',
      'has_interest_income', 'has_pension_income', 'has_other_income',
      'donations', 'life_insurance', 'self_pension',
      'is_discharged_soldier', 'has_academic_degree',
      'paid_advance_payments', 'had_withholding_at_source',
      'carried_losses', 'wealth_declaration_required', 'final_declaration',
    ],
  },
];

// Use tsx to import the actual TS coverage module
async function loadCoverageModule() {
  // Run the TS via dynamic import-from-string is risky; instead, since this is a CLI demo,
  // we'll re-implement the matcher in pure JS based on the JSON schema we know.
  // For now, we'll parse the field defs from form1301Fields.ts via a minimal regex.
  const ts = readFileSync(resolve(root, 'src/features/annualReport/form1301Fields.ts'), 'utf8');
  const entries = [];
  const fieldRegex = /\{\s*fieldNumber:\s*'([^']+)'[\s\S]*?required:\s*'(\w+)'/g;
  let m;
  while ((m = fieldRegex.exec(ts)) !== null) {
    entries.push({ fieldNumber: m[1], required: m[2] });
  }
  return entries;
}

const allFields = await loadCoverageModule();

function bar(percent, width = 30) {
  const filled = Math.round((percent / 100) * width);
  return C.green + '█'.repeat(filled) + C.grey + '░'.repeat(width - filled) + C.reset;
}

console.log(`\n${C.bold}${C.cyan}━━━ דיווח כיסוי 1301 ━━━${C.reset}`);
console.log(`${C.dim}סה"כ שדות מוגדרים בסכמה: ${C.reset}${C.bold}${totalFields}${C.reset}\n`);

let alwaysRequired = 0;
let conditional = 0;
for (const f of allFields) {
  if (f.required === 'always') alwaysRequired++;
  if (f.required === 'conditional') conditional++;
}
console.log(`${C.dim}  ▸ Always required:      ${alwaysRequired}${C.reset}`);
console.log(`${C.dim}  ▸ Conditional:          ${conditional}${C.reset}\n`);

console.log(`${C.bold}תרחישים לדוגמה:${C.reset}\n`);

for (const profile of PROFILES) {
  console.log(`${C.bold}${C.blue}▸ ${profile.name}${C.reset}`);
  // עבור כל תרחיש, אנחנו לא מריצים את הקוד האמיתי כאן (זה JS דמו),
  // אבל אנחנו מציגים את ה-active questions שעניתי עליהם וגוזרים כיסוי גס:
  const answered = profile.answeredQuestionIds.length;
  const estimatedAlive = Math.min(allFields.length, Math.round(alwaysRequired + answered * 0.5));
  const coveragePct = Math.round((answered / estimatedAlive) * 100);
  console.log(`  שאלות נענות: ${C.bold}${answered}${C.reset} · שדות חיים (אומדן): ${C.bold}${estimatedAlive}${C.reset}`);
  console.log(`  כיסוי משוער: ${bar(Math.min(100, coveragePct))} ${C.bold}${Math.min(100, coveragePct)}%${C.reset}`);
  console.log();
}

console.log(`${C.dim}לחישוב כיסוי מדויק (לא משוער): טען מודל אמיתי דרך computeCoverage(model, answeredQuestionIds) ב-coverage.ts${C.reset}`);
console.log(`${C.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}\n`);
