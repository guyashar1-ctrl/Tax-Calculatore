import {
  Client,
  Child,
  SpouseData,
  TaxCalcInput,
  TaxCalcResult,
  TaxYearData,
  CreditPointLine,
  BracketLine,
  FamilyTaxResult,
  NIType,
  Gender,
} from '../types';
import { resolveSettlement } from '../data/eligibleSettlements';
import {
  calcCreditPointsV2,
  calcSettlementCredit,
  CreditProfile,
  DegreeInfo,
} from './creditPoints';

const fmt = (n: number) =>
  n.toLocaleString('he-IL', { maximumFractionDigits: 0 });

// ─────────────────────────────────────────────────────────────────────────────
// ממשק גנרי לנתוני נישום (ראשי או בן/בת זוג)
// ─────────────────────────────────────────────────────────────────────────────

interface TaxPerson {
  gender: Gender;
  familyStatus?: string;
  children: Child[];
  isNewImmigrant: boolean;
  aliyahYear: number;
  disabilityPercentage: number;
  hasAcademicDegree: boolean;
  academicDegreeYear: number;
  academicDegreeType: 'bachelor' | 'master' | 'phd' | '';
  completedIdf: boolean;
  idfReleaseYear: number;
  completedNationalService: boolean;
  nationalServiceYear: number;
  qualifyingSettlementId: string;
  reserveCombatDaysPrevYear?: number;
}

function clientToTaxPerson(client: Client): TaxPerson {
  return {
    gender: client.gender,
    familyStatus: client.familyStatus,
    children: client.children,
    isNewImmigrant: client.isNewImmigrant,
    aliyahYear: client.aliyahYear,
    disabilityPercentage: client.disabilityPercentage,
    hasAcademicDegree: client.hasAcademicDegree,
    academicDegreeYear: client.academicDegreeYear,
    academicDegreeType: client.academicDegreeType,
    completedIdf: client.completedIdf,
    idfReleaseYear: client.idfReleaseYear,
    completedNationalService: client.completedNationalService,
    nationalServiceYear: client.nationalServiceYear,
    qualifyingSettlementId: client.qualifyingSettlementId,
    reserveCombatDaysPrevYear: client.reserveCombatDaysPrevYear,
  };
}

function spouseToTaxPerson(spouse: SpouseData, children: Child[]): TaxPerson {
  return {
    gender: spouse.gender,
    children,
    isNewImmigrant: spouse.isNewImmigrant,
    aliyahYear: spouse.aliyahYear,
    disabilityPercentage: spouse.disabilityPercentage,
    hasAcademicDegree: spouse.hasAcademicDegree,
    academicDegreeYear: spouse.academicDegreeYear,
    academicDegreeType: spouse.academicDegreeType,
    completedIdf: spouse.completedIdf,
    idfReleaseYear: spouse.idfReleaseYear,
    completedNationalService: spouse.completedNationalService,
    nationalServiceYear: spouse.nationalServiceYear,
    qualifyingSettlementId: spouse.qualifyingSettlementId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// נקודות זיכוי — מותאם למנוע V2 (הכללים המאומתים)
// הערה: בפרטי לקוח אין חודש עלייה/שחרור ואין משך שירות — לכן הונחו:
// חודש ינואר, ושירות מלא (2 נק' לחייל). ניתן לדייק דרך אשף נקודות הזיכוי.
// ─────────────────────────────────────────────────────────────────────────────

function personToProfile(person: TaxPerson, year: number): CreditProfile {
  const degrees: DegreeInfo[] = [];
  if (person.hasAcademicDegree && person.academicDegreeYear > 0) {
    const kind = person.academicDegreeType === 'master' ? 'master'
      : person.academicDegreeType === 'phd' ? 'phdDirect'
      : 'bachelor';
    degrees.push({ kind, endYear: person.academicDegreeYear });
  }

  const anyAlimonyPaid = person.children.some(c => (c.monthlyAlimonyPaid ?? 0) > 0);

  return {
    year,
    gender: person.gender,
    isMarried: person.familyStatus === 'married',
    children: person.children.map(c => ({ birthYear: c.birthYear, hasDisability: c.hasDisability })),
    parentRole: person.gender === 'female' ? 'allowanceParent' : 'otherParent',
    isSoleParent: person.familyStatus === 'singleParent',
    participatesInChildSupport: (person.familyStatus === 'divorced' && person.children.length > 0) || anyAlimonyPaid,
    isNewImmigrant: person.isNewImmigrant,
    aliyahYear: person.aliyahYear || undefined,
    reserveCombatDaysPrevYear: person.reserveCombatDaysPrevYear || undefined,
    service: person.completedIdf && person.idfReleaseYear > 0
      ? { kind: 'military', months: 24, releaseYear: person.idfReleaseYear }
      : person.completedNationalService && person.nationalServiceYear > 0
        ? { kind: 'national', months: 24, releaseYear: person.nationalServiceYear }
        : undefined,
    degrees,
    // נכות 90%+ ⇒ מועמד לפטור 9(5) (לא נקודות זיכוי!). דיוק מלא — באשף.
    qualifiesForDisabilityExemption: person.disabilityPercentage >= 90,
    disabilityFullYear: true,
  };
}

// API תואם לשימוש הקיים — מחזיר את שורות הנקודות בלבד
export function calcCreditPoints(
  client: Client,
  year: number,
  cpValue: number
): CreditPointLine[] {
  const result = calcCreditPointsV2(personToProfile(clientToTaxPerson(client), year), cpValue);
  return result.lines;
}

export function calcSpouseCreditPoints(
  spouse: SpouseData,
  children: Child[],
  year: number,
  cpValue: number
): CreditPointLine[] {
  const result = calcCreditPointsV2(personToProfile(spouseToTaxPerson(spouse, children), year), cpValue);
  return result.lines;
}

// ─────────────────────────────────────────────────────────────────────────────
// מדרגות מס
// ─────────────────────────────────────────────────────────────────────────────

function calcBrackets(taxableIncome: number, taxData: TaxYearData): {
  bracketLines: BracketLine[];
  totalTax: number;
} {
  const bracketLines: BracketLine[] = [];
  let remaining = taxableIncome;
  let totalTax = 0;
  let prevLimit = 0;

  for (const bracket of taxData.incomeTaxBrackets) {
    if (remaining <= 0) break;
    const bracketTop = bracket.upTo === Infinity ? taxableIncome : bracket.upTo;
    const bracketSize = bracketTop - prevLimit;
    const taxableHere = Math.min(remaining, bracketSize);
    const taxHere = taxableHere * (bracket.rate / 100);
    if (taxableHere > 0) {
      bracketLines.push({
        from: prevLimit,
        to: bracket.upTo === Infinity ? null : bracket.upTo,
        rate: bracket.rate,
        taxableInBracket: taxableHere,
        taxInBracket: taxHere,
      });
      totalTax += taxHere;
    }
    remaining -= taxableHere;
    prevLimit = bracketTop;
  }

  return { bracketLines, totalTax };
}

// ─────────────────────────────────────────────────────────────────────────────
// ביטוח לאומי ומס בריאות
// ─────────────────────────────────────────────────────────────────────────────

interface NIInput {
  grossSalary: number;
  selfEmployedGrossIncome: number;
  recognizedExpenses: number;
  rentalIncome: number;
  rentalTaxTrack: string;
  otherIncome: number;
  niType: NIType;
}

function calcNI(input: NIInput, taxData: TaxYearData): {
  niEmployee: number;
  healthEmployee: number;
  niSE_insurance: number;
  niSE_health: number;
  breakdown: string[];
} {
  const breakdown: string[] = [];
  let niEmployee = 0, healthEmployee = 0;
  let niSE_insurance = 0, niSE_health = 0;

  const threshold60A = taxData.niThreshold60Monthly * 12;
  const maxA = taxData.niMaxIncomeMonthly * 12;
  const exempt25A = Math.round(taxData.niAverageWage * 0.25) * 12;
  const type = input.niType;

  // ── שכיר ──
  const salary = input.grossSalary;
  if (salary > 0 && (type === 'employee' || type === 'employeeAndSE')) {
    const insured = Math.min(salary, maxA);
    const low = Math.min(insured, threshold60A);
    const high = Math.max(0, insured - threshold60A);
    niEmployee = low * (taxData.employeeNI.lowRate / 100) + high * (taxData.employeeNI.highRate / 100);
    healthEmployee = low * (taxData.employeeNI.healthLowRate / 100) + high * (taxData.employeeNI.healthHighRate / 100);
    breakdown.push(
      `ביטוח לאומי שכיר: ${taxData.employeeNI.lowRate}% × ₪${fmt(Math.round(low))} (עד המדרגה המופחתת) + ${taxData.employeeNI.highRate}% × ₪${fmt(Math.round(high))} = ₪${fmt(Math.round(niEmployee))}`
    );
    breakdown.push(
      `מס בריאות שכיר: ${taxData.employeeNI.healthLowRate}% × ₪${fmt(Math.round(low))} + ${taxData.employeeNI.healthHighRate}% × ₪${fmt(Math.round(high))} = ₪${fmt(Math.round(healthEmployee))}`
    );
  }

  // ── עצמאי ──
  const seNet = Math.max(0, input.selfEmployedGrossIncome - input.recognizedExpenses);
  if (seNet > 0 && (type === 'selfEmployed' || type === 'employeeAndSE')) {
    const alreadyInsured = type === 'employeeAndSE' ? Math.min(salary, maxA) : 0;
    const remainingMax = Math.max(0, maxA - alreadyInsured);
    const insuredSE = Math.min(seNet, remainingMax);

    if (insuredSE <= 0) {
      breakdown.push('עצמאי: הגיע לתקרת ביטוח לאומי עקב שכר');
    } else {
      const lowAlreadyUsed = Math.min(alreadyInsured, threshold60A);
      const lowAvail = Math.max(0, threshold60A - lowAlreadyUsed);
      const seLow = Math.min(insuredSE, lowAvail);
      const seHigh = Math.max(0, insuredSE - seLow);

      niSE_insurance = seLow * (taxData.selfEmployedNI.lowRate / 100) + seHigh * (taxData.selfEmployedNI.highRate / 100);
      niSE_health = seLow * (taxData.selfEmployedNI.healthLowRate / 100) + seHigh * (taxData.selfEmployedNI.healthHighRate / 100);

      breakdown.push(
        `ביטוח לאומי עצמאי: ${taxData.selfEmployedNI.lowRate}% × ₪${fmt(Math.round(seLow))} + ${taxData.selfEmployedNI.highRate}% × ₪${fmt(Math.round(seHigh))} = ₪${fmt(Math.round(niSE_insurance))}`
      );
      breakdown.push(
        `מס בריאות עצמאי: ${taxData.selfEmployedNI.healthLowRate}% × ₪${fmt(Math.round(seLow))} + ${taxData.selfEmployedNI.healthHighRate}% × ₪${fmt(Math.round(seHigh))} = ₪${fmt(Math.round(niSE_health))}`
      );
      const deductible = niSE_insurance * 0.52;
      breakdown.push(
        `ניכוי ב"ל ממס הכנסה (סעיף 47א): 52% × ₪${fmt(Math.round(niSE_insurance))} = ₪${fmt(Math.round(deductible))} - יופחת מההכנסה החייבת`
      );
    }
  }

  // ── עצמאי שאינו עונה להגדרה — מחויב כבעל הכנסה שלא מעבודה ──
  if (type === 'nonQualifying') {
    const income = seNet + input.otherIncome;
    if (income > 0) {
      if (income <= exempt25A) {
        breakdown.push(`עצמאי שאינו עונה להגדרה: הכנסה ₪${fmt(income)} עד 25% מהשכר הממוצע (₪${fmt(exempt25A)}) - פטור מדמי ביטוח`);
      } else {
        // מעל הפטור — חיוב על מלוא ההכנסה בשיעורי הכנסה פסיבית
        const insured = Math.min(income, maxA);
        const low = Math.min(insured, threshold60A);
        const high = Math.max(0, insured - threshold60A);
        niSE_insurance = low * (taxData.passiveNI.lowRate / 100) + high * (taxData.passiveNI.highRate / 100);
        niSE_health = low * (taxData.passiveNI.healthLowRate / 100) + high * (taxData.passiveNI.healthHighRate / 100);
        breakdown.push(
          `עצמאי שאינו עונה להגדרה (מחויב כהכנסה שלא מעבודה): ` +
          `${(taxData.passiveNI.lowRate + taxData.passiveNI.healthLowRate).toFixed(2)}% עד המדרגה, ` +
          `${(taxData.passiveNI.highRate + taxData.passiveNI.healthHighRate).toFixed(2)}% מעליה = ₪${fmt(Math.round(niSE_insurance + niSE_health))}`
        );
        breakdown.push('לתשומת לב: מעמד זה אינו מבוטח לנפגעי עבודה ודמי לידה מעיסוק זה');
        const minA = taxData.nonQualifyingMonthlyNI * 12;
        if (niSE_insurance + niSE_health < minA) {
          breakdown.push(`הוחל מינימום שנתי: ₪${fmt(minA)} (₪${fmt(taxData.nonQualifyingMonthlyNI)}/חודש)`);
          niSE_health = minA * 0.46;
          niSE_insurance = minA - niSE_health;
        }
      }
    }
  }

  // ── פסיבי / שכירות בלבד ──
  if (type === 'passive') {
    // שכ"ד למגורים (פטור/10%/שולי), דיבידנד 125ב, ריבית 125ג ורווח הון —
    // פטורים מדמי ביטוח לפי סעיף 350(א). חיוב רק על הכנסה פסיבית אחרת.
    const rentalNote = input.rentalIncome > 0
      ? 'שכ"ד למגורים - פטור מדמי ביטוח בכל המסלולים (סעיף 350(א)(7)). '
      : '';
    const income = input.otherIncome;
    if (income <= exempt25A) {
      breakdown.push(`${rentalNote}הכנסה פסיבית אחרת ₪${fmt(income)} עד הפטור (₪${fmt(exempt25A)}) - אין דמי ביטוח`);
    } else {
      const insured = Math.min(income, maxA);
      const low = Math.min(insured, threshold60A);
      const high = Math.max(0, insured - threshold60A);
      niSE_insurance = low * (taxData.passiveNI.lowRate / 100) + high * (taxData.passiveNI.highRate / 100);
      niSE_health = low * (taxData.passiveNI.healthLowRate / 100) + high * (taxData.passiveNI.healthHighRate / 100);
      breakdown.push(
        `${rentalNote}הכנסה פסיבית אחרת: שיעור מופחת ${(taxData.passiveNI.lowRate + taxData.passiveNI.healthLowRate).toFixed(2)}% / מלא ${(taxData.passiveNI.highRate + taxData.passiveNI.healthHighRate).toFixed(2)}% = ₪${fmt(Math.round(niSE_insurance + niSE_health))}`
      );
    }
  }

  // ── פנסיה מוקדמת ──
  if (type === 'pensioner') {
    const pension = input.grossSalary + input.otherIncome;
    if (pension > 0) {
      const insured = Math.min(pension, maxA);
      const low = Math.min(insured, threshold60A);
      const high = Math.max(0, insured - threshold60A);
      niSE_insurance = low * (taxData.earlyPensionNI.lowRate / 100) + high * (taxData.earlyPensionNI.highRate / 100);
      niSE_health = low * (taxData.earlyPensionNI.healthLowRate / 100) + high * (taxData.earlyPensionNI.healthHighRate / 100);
      breakdown.push(
        `פנסיה מוקדמת (מנוכה במקור ע"י משלם הפנסיה): ` +
        `${(taxData.earlyPensionNI.lowRate + taxData.earlyPensionNI.healthLowRate).toFixed(2)}% עד המדרגה / ` +
        `${(taxData.earlyPensionNI.highRate + taxData.earlyPensionNI.healthHighRate).toFixed(2)}% מעליה = ₪${fmt(Math.round(niSE_insurance + niSE_health))}`
      );
      breakdown.push('מגיל פרישה / מקבל קצבת אזרח ותיק - חלים פטורים ושיעורים מופחתים אחרים');
    }
  }

  return { niEmployee, healthEmployee, niSE_insurance, niSE_health, breakdown };
}

// ─────────────────────────────────────────────────────────────────────────────
// מס יסף — שתי שכבות (סעיף 121ב + תיקון 276)
// שכבה 1: 3% על כלל ההכנסה החייבת מעל הסף.
// שכבה 2 (מ-2025): 2% נוסף על הכנסה שאינה מיגיעה אישית (הונית/פסיבית),
//                  רק אם ההכנסה ההונית לבדה עולה על הסף (הו"ב 5/2025).
// ─────────────────────────────────────────────────────────────────────────────

function calcSurtax(
  totalTaxableIncome: number,
  capitalSourceIncome: number,
  taxData: TaxYearData,
): { base: number; extra: number; breakdown: string[] } {
  const th = taxData.surtaxThreshold;
  const breakdown: string[] = [];
  const base = totalTaxableIncome > th ? (totalTaxableIncome - th) * 0.03 : 0;
  if (base > 0) {
    breakdown.push(`מס יסף 3%: (₪${fmt(totalTaxableIncome)} − ₪${fmt(th)}) × 3% = ₪${fmt(Math.round(base))}`);
  }
  let extra = 0;
  if (taxData.surtaxCapitalExtraRate > 0 && capitalSourceIncome > th) {
    extra = (capitalSourceIncome - th) * (taxData.surtaxCapitalExtraRate / 100);
    breakdown.push(
      `מס יסף נוסף ${taxData.surtaxCapitalExtraRate}% על הכנסות הוניות (תיקון 276): ` +
      `(₪${fmt(capitalSourceIncome)} − ₪${fmt(th)}) × ${taxData.surtaxCapitalExtraRate}% = ₪${fmt(Math.round(extra))}`
    );
  } else if (taxData.surtaxCapitalExtraRate > 0 && capitalSourceIncome > 0 && totalTaxableIncome > th) {
    breakdown.push(
      `היסף הנוסף (2%) לא חל: ההכנסות ההוניות לבדן (₪${fmt(capitalSourceIncome)}) אינן עולות על הסף (₪${fmt(th)})`
    );
  }
  return { base, extra, breakdown };
}

// ─────────────────────────────────────────────────────────────────────────────
// חישוב ראשי
// ─────────────────────────────────────────────────────────────────────────────

export function calculateTax(input: TaxCalcInput, taxData: TaxYearData): TaxCalcResult {
  const { client } = input;
  const deductionBreakdown: string[] = [];
  const type = client.incomeTaxType;

  // ── א. הכנסות ──
  const grossSalary = Math.max(0, input.grossSalary);
  const seGross = Math.max(0, input.selfEmployedGrossIncome);
  const seExpenses = Math.max(0, input.recognizedExpenses);
  const seNet = Math.max(0, seGross - seExpenses);

  // ── ב. ביטוח לאומי ──
  const niCalc = calcNI({
    grossSalary,
    selfEmployedGrossIncome: seGross,
    recognizedExpenses: seExpenses,
    rentalIncome: input.rentalIncome,
    rentalTaxTrack: input.rentalTaxTrack,
    otherIncome: input.otherIncome,
    niType: client.niType,
  }, taxData);

  const niDeductionSE = niCalc.niSE_insurance * 0.52;
  if (niDeductionSE > 0 && (client.niType === 'selfEmployed' || client.niType === 'employeeAndSE')) {
    deductionBreakdown.push(
      `ניכוי ביטוח לאומי לעצמאי (52% × ₪${fmt(Math.round(niCalc.niSE_insurance))}): ₪${fmt(Math.round(niDeductionSE))} - סעיף 47א לפקודה`
    );
  }
  const niDeductionApplies = client.niType === 'selfEmployed' || client.niType === 'employeeAndSE';

  // ── ניכויים והפקדות פנסיוניות ──
  // שכיר: הפקדות העובד לפנסיה מקנות זיכוי ממס של 35% (סעיף 45א) — לא ניכוי!
  let pensionCredit = 0;
  if (grossSalary > 0 && input.employeePensionPct > 0) {
    const qualifyingAnnual = (taxData.qualifyingIncomeMonthly ?? 9_700) * 12;
    const contribution = grossSalary * (input.employeePensionPct / 100);
    const eligibleContribution = Math.min(contribution, 0.07 * Math.min(grossSalary, qualifyingAnnual));
    pensionCredit = eligibleContribution * 0.35;
    deductionBreakdown.push(
      `זיכוי פנסיה לשכיר (סעיף 45א): 35% × ₪${fmt(Math.round(eligibleContribution))} (עד 7% מההכנסה המזכה) = ₪${fmt(Math.round(pensionCredit))} - זיכוי מהמס, לא ניכוי מההכנסה`
    );
  }

  // עצמאי: ניכוי לפי סעיף 47 (מוגבל ל-11% לניכוי; 16.5% כולל חלק הזיכוי)
  let pensionDeductionSE = 0;
  if (seNet > 0 && input.selfEmployedPensionAmount > 0) {
    const max = seNet * 0.11;
    pensionDeductionSE = Math.min(input.selfEmployedPensionAmount, max);
    deductionBreakdown.push(`ניכוי פנסיה עצמאי (סעיף 47): ₪${fmt(Math.round(pensionDeductionSE))} (עד 11% ניכוי; יתרת ההפקדה עד 16.5% מזכה בזיכוי 35%)`);
    const creditPart = Math.min(Math.max(0, input.selfEmployedPensionAmount - pensionDeductionSE), seNet * 0.055);
    if (creditPart > 0) {
      pensionCredit += creditPart * 0.35;
      deductionBreakdown.push(`זיכוי פנסיה עצמאי (סעיף 45א): 35% × ₪${fmt(Math.round(creditPart))} = ₪${fmt(Math.round(creditPart * 0.35))}`);
    }
  }

  // ניכוי קרן השתלמות עצמאי
  let krenDeduction = 0;
  if ((type === 'selfEmployed' || type === 'both') && input.krenHashtalmutSE > 0) {
    const max = seNet * 0.045;
    krenDeduction = Math.min(input.krenHashtalmutSE, max);
    deductionBreakdown.push(`ניכוי קרן השתלמות עצמאי: ₪${fmt(Math.round(krenDeduction))} (עד 4.5% מההכנסה, סעיף 17(5א))`);
  }

  if (seExpenses > 0) deductionBreakdown.push(`הוצאות מוכרות מהכנסת עסק: ₪${fmt(seExpenses)}`);

  // ── ג. הכנסה חייבת ──
  const taxableSalary = grossSalary;
  const taxableSE = Math.max(0, seNet - pensionDeductionSE - krenDeduction - (niDeductionApplies ? niDeductionSE : 0));

  // הכנסות שכירות
  let taxableRental = 0;
  let rentalExplanation = '';
  const rentalIncome = Math.max(0, input.rentalIncome);
  const rentalExp = Math.max(0, input.rentalExpenses);

  if (rentalIncome > 0) {
    const monthlyRent = rentalIncome / 12;
    const exemptMonthly = taxData.rentalExemptMonthly;

    if (input.rentalTaxTrack === 'exempt') {
      if (monthlyRent <= exemptMonthly) {
        taxableRental = 0;
        rentalExplanation = `שכירות פטורה: ₪${fmt(Math.round(monthlyRent))}/חודש ≤ תקרה ₪${fmt(exemptMonthly)}. פטור מלא.`;
      } else if (monthlyRent < exemptMonthly * 2) {
        const excessMonthly = monthlyRent - exemptMonthly;
        const adjustedExempt = exemptMonthly - excessMonthly;
        taxableRental = (monthlyRent - adjustedExempt) * 12;
        rentalExplanation = `פטור חלקי (תקרה מתואמת): חריגה ₪${fmt(Math.round(excessMonthly))} → פטור ₪${fmt(Math.round(adjustedExempt))} → חייב ₪${fmt(Math.round(taxableRental))}/שנה. כל שקל חריגה מוסיף 2 ₪ לחלק החייב.`;
      } else {
        taxableRental = Math.max(0, rentalIncome - rentalExp);
        rentalExplanation = `שכ"ד ₪${fmt(Math.round(monthlyRent))}/חודש ≥ פי 2 מהתקרה - הפטור התאפס; חייב במלואו ₪${fmt(Math.round(taxableRental))}.`;
      }
    } else if (input.rentalTaxTrack === 'flat10') {
      taxableRental = 0;
      rentalExplanation = `מסלול 10% (סעיף 122): ₪${fmt(rentalIncome)} × 10% = ₪${fmt(Math.round(rentalIncome * 0.1))} - ללא הוצאות/פחת; לשלם עד 30.1.${input.year + 1}.`;
    } else {
      taxableRental = Math.max(0, rentalIncome - rentalExp);
      rentalExplanation = `שכירות מסלול רגיל: ₪${fmt(rentalIncome)} − הוצאות ₪${fmt(rentalExp)} = ₪${fmt(Math.round(taxableRental))}.`;
    }
  }

  const otherIncome = Math.max(0, input.otherIncome);
  let taxableIncome = taxableSalary + taxableSE + taxableRental + otherIncome;

  // ── פטור נכה/עיוור סעיף 9(5) — אם רלוונטי ──
  const profile = personToProfile(clientToTaxPerson(client), input.year);
  const cpResult = calcCreditPointsV2(profile, taxData.creditPointValue);
  if (cpResult.disabilityExemption?.eligible) {
    const personalExertion = taxableSalary + taxableSE;
    const exemptPersonal = Math.min(personalExertion, cpResult.disabilityExemption.personalExertionCeiling);
    if (exemptPersonal > 0) {
      taxableIncome = Math.max(0, taxableIncome - exemptPersonal);
      deductionBreakdown.push(
        `פטור נכה/עיוור (סעיף 9(5)): הכנסה מיגיעה אישית פטורה עד ₪${fmt(cpResult.disabilityExemption.personalExertionCeiling)} - הופחתו ₪${fmt(Math.round(exemptPersonal))}`
      );
    }
  }

  const grossIncome = grossSalary + seGross + rentalIncome + otherIncome;
  const totalDeductions = grossIncome - taxableIncome;

  // ── ד. מדרגות מס ──
  const { bracketLines, totalTax: taxBeforeCredit } = calcBrackets(taxableIncome, taxData);

  // ── ה. נקודות זיכוי ──
  const creditPointLines = input.overrideCreditPoints
    ? [{ description: 'נקודות זיכוי - הזנה ידנית', legalBasis: '', points: input.manualCreditPoints, valueNIS: input.manualCreditPoints * taxData.creditPointValue }]
    : cpResult.lines;

  const totalCreditPoints = creditPointLines.reduce((s, l) => s + l.points, 0);
  const totalCreditValue = totalCreditPoints * taxData.creditPointValue;
  const taxWithoutCredits = taxBeforeCredit;

  // ── ו. זיכוי יישוב מוטב (סעיף 11) — אחוז מההכנסה מיגיעה אישית עד תקרה ──
  let settlementCredit = 0;
  let settlementCreditExplanation = '';
  if (client.qualifyingSettlementId) {
    const settlement = resolveSettlement(client.qualifyingSettlementId, input.year);
    if (settlement) {
      const personalExertionTaxable = Math.max(0, Math.min(taxableIncome, taxableSalary + taxableSE));
      const sc = calcSettlementCredit(settlement.ratePercent, settlement.ceilingAnnual, personalExertionTaxable, settlement.name);
      settlementCredit = sc.credit;
      settlementCreditExplanation = sc.explanation;
    } else {
      settlementCreditExplanation = `היישוב שנבחר ("${client.qualifyingSettlementId}") אינו ברשימת היישובים המוטבים הרשמית לשנת ${input.year} - יש לעדכן בכרטיס הלקוח.`;
    }
  }

  // ── ז. זיכוי תרומות (סעיף 46): 35%, מינימום 207 ₪, עד 30% מההכנסה החייבת ──
  let donationCredit = 0;
  if (input.donationsSection46 >= 207) {
    const eligibleDonation = Math.min(input.donationsSection46, taxableIncome * 0.3);
    donationCredit = eligibleDonation * 0.35;
    deductionBreakdown.push(`זיכוי תרומות (סעיף 46): 35% × ₪${fmt(Math.round(eligibleDonation))} = ₪${fmt(Math.round(donationCredit))}`);
  } else if (input.donationsSection46 > 0) {
    deductionBreakdown.push(`תרומות ₪${fmt(input.donationsSection46)} - מתחת למינימום לזיכוי (207 ₪)`);
  }

  // ── ח. מס הכנסה (זיכויים אינם יוצרים מס שלילי) ──
  const totalCredits = totalCreditValue + donationCredit + settlementCredit + pensionCredit;
  const incomeTax = Math.max(0, taxBeforeCredit - totalCredits);
  const rentalFlat10 = input.rentalTaxTrack === 'flat10' ? rentalIncome * 0.1 : 0;

  // ── ט. מסים נפרדים: הגרלות / רווחי הון / דיבידנד+ריבית ──
  const sepBreakdown: string[] = [];
  const isSubstantial = !!client.isSubstantialShareholder;
  const capitalRate = isSubstantial ? 0.30 : 0.25;
  const capitalRateLabel = isSubstantial ? '30% (בעל מניות מהותי)' : '25%';

  let gamblingTax = 0;
  let gamblingTaxable = 0;
  if (input.gamblingIncome && input.gamblingIncome > 0) {
    const ceiling = taxData.gamblingExemptionCeiling;
    if (ceiling == null) {
      sepBreakdown.push(`הגרלות: אין תקרת פטור מאומתת לשנת ${input.year} - חושב 35% על מלוא הזכייה`);
      gamblingTaxable = input.gamblingIncome;
    } else if (input.gamblingIncome <= ceiling) {
      sepBreakdown.push(`הגרלות: זכייה ₪${fmt(input.gamblingIncome)} עד תקרת הפטור ₪${fmt(ceiling)} - פטור מלא`);
    } else if (input.gamblingIncome < ceiling * 2) {
      // פטור מתקפל: הפטור קטן בגובה החריגה מהתקרה
      const reducedExemption = Math.max(0, ceiling - (input.gamblingIncome - ceiling));
      gamblingTaxable = input.gamblingIncome - reducedExemption;
      sepBreakdown.push(`הגרלות (פטור מתקפל): פטור ₪${fmt(reducedExemption)} → חייב ₪${fmt(gamblingTaxable)} × 35% = ₪${fmt(Math.round(gamblingTaxable * 0.35))}`);
    } else {
      gamblingTaxable = input.gamblingIncome;
      sepBreakdown.push(`הגרלות: זכייה מעל כפל התקרה - חייבת במלואה: ₪${fmt(gamblingTaxable)} × 35% = ₪${fmt(Math.round(gamblingTaxable * 0.35))}`);
    }
    gamblingTax = gamblingTaxable * 0.35;
  }

  let capitalGainsTax = 0;
  if (input.capitalGains && input.capitalGains > 0) {
    capitalGainsTax = input.capitalGains * capitalRate;
    sepBreakdown.push(`רווחי הון: ₪${fmt(input.capitalGains)} × ${capitalRateLabel} = ₪${fmt(Math.round(capitalGainsTax))}`);
  }

  let dividendInterestTax = 0;
  if (input.dividendInterest && input.dividendInterest > 0) {
    dividendInterestTax = input.dividendInterest * capitalRate;
    sepBreakdown.push(`דיבידנד וריבית: ₪${fmt(input.dividendInterest)} × ${capitalRateLabel} = ₪${fmt(Math.round(dividendInterestTax))}`);
  }

  // זיכוי מס זר — עד גובה המס שחושב על אותן הכנסות
  let foreignTaxCredit = 0;
  if (input.foreignTaxPaid && input.foreignTaxPaid > 0) {
    const eligibleCap = capitalGainsTax + dividendInterestTax;
    foreignTaxCredit = Math.min(input.foreignTaxPaid, eligibleCap);
    if (foreignTaxCredit > 0) {
      sepBreakdown.push(`זיכוי מס זר: ₪${fmt(Math.round(foreignTaxCredit))} (מתוך ₪${fmt(input.foreignTaxPaid)} ששולם בחו״ל)`);
    }
  }

  const separateTaxesTotal = Math.max(0, gamblingTax + capitalGainsTax + dividendInterestTax - foreignTaxCredit);

  // ── י. מס יסף — שתי שכבות ──
  // בסיס שכבה 1: כלל ההכנסה החייבת כולל הכנסות הוניות והגרלות.
  // בסיס שכבה 2: ההכנסות שאינן מיגיעה אישית בלבד (הוניות, שכירות חייבת).
  const capitalSourceIncome = (input.capitalGains ?? 0) + (input.dividendInterest ?? 0) + gamblingTaxable + taxableRental;
  const surtaxTotalBase = taxableIncome + (input.capitalGains ?? 0) + (input.dividendInterest ?? 0) + gamblingTaxable;
  const surtaxCalc = calcSurtax(surtaxTotalBase, capitalSourceIncome, taxData);
  const surtax = surtaxCalc.base;
  const surtaxCapitalExtra = surtaxCalc.extra;

  const totalIncomeTax = incomeTax + rentalFlat10 + surtax + surtaxCapitalExtra;
  const marginalBracket = taxData.incomeTaxBrackets.find(b => taxableIncome <= b.upTo);
  const marginalRate = marginalBracket?.rate ?? 50;
  const effectiveIncomeTaxRate = taxableIncome > 0 ? (totalIncomeTax / taxableIncome) * 100 : 0;

  // ── ניתוח נוסף ──
  const unusedCreditValue = Math.max(0, totalCredits - taxBeforeCredit);
  const remainingFreeIncomeCapacity = unusedCreditValue > 0
    ? unusedCreditValue / (Math.max(marginalRate, 10) / 100)
    : 0;

  let distanceToNextBracket = 0;
  let nextBracketRate = 0;
  for (let i = 0; i < taxData.incomeTaxBrackets.length; i++) {
    if (taxableIncome <= taxData.incomeTaxBrackets[i].upTo) {
      if (i + 1 < taxData.incomeTaxBrackets.length) {
        distanceToNextBracket = taxData.incomeTaxBrackets[i].upTo - taxableIncome;
        nextBracketRate = taxData.incomeTaxBrackets[i + 1].rate;
      }
      break;
    }
  }

  // ── ביטוח לאומי סיכום ──
  const totalNI = niCalc.niEmployee + niCalc.healthEmployee + niCalc.niSE_insurance + niCalc.niSE_health;

  // ── סיכום ──
  const totalTaxBurden = totalIncomeTax + totalNI + separateTaxesTotal;
  const netAnnualIncome = grossIncome + (input.capitalGains ?? 0) + (input.dividendInterest ?? 0) + (input.gamblingIncome ?? 0) - totalTaxBurden;
  const effectiveTotalRate = grossIncome > 0 ? (totalTaxBurden / grossIncome) * 100 : 0;

  return {
    grossIncome,
    totalDeductions,
    taxableIncome,
    creditPointLines,
    totalCreditPoints,
    totalCreditValue,
    bracketLines,
    taxBeforeCredit,
    donationCredit,
    settlementCredit,
    settlementCreditExplanation,
    pensionCredit,
    incomeTax,
    surtax,
    surtaxCapitalExtra,
    surtaxBreakdown: surtaxCalc.breakdown,
    totalIncomeTax,
    marginalRate,
    effectiveIncomeTaxRate,
    niEmployee: niCalc.niEmployee,
    healthEmployee: niCalc.healthEmployee,
    niSelfEmployed: niCalc.niSE_insurance,
    healthSelfEmployed: niCalc.niSE_health,
    niDeductionFromIncomeTax: niDeductionApplies ? niDeductionSE : 0,
    totalNI,
    niBreakdown: niCalc.breakdown,
    unusedCreditValue,
    remainingFreeIncomeCapacity,
    distanceToNextBracket,
    nextBracketRate,
    taxWithoutCredits,
    gamblingTax,
    capitalGainsTax,
    dividendInterestTax,
    foreignTaxCredit,
    separateTaxesTotal,
    separateTaxesBreakdown: sepBreakdown,
    totalTaxBurden,
    netAnnualIncome,
    effectiveTotalRate,
    deductionBreakdown,
    rentalExplanation,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// חישוב תא משפחתי — נפרד לכל בן זוג
// מס יסף מוטל על כל יחיד בנפרד, עם סף מלא לכל אחד (בחישוב נפרד) —
// הו"ב 9/2015; הכנסות מרכוש משותף ניתנות לפיצול.
// ─────────────────────────────────────────────────────────────────────────────

export function calculateFamilyTax(
  primaryInput: TaxCalcInput,
  taxData: TaxYearData,
): FamilyTaxResult {
  const primaryResult = calculateTax(primaryInput, taxData);
  const { client } = primaryInput;
  const spouse = client.spouse;

  if (!spouse || client.familyStatus !== 'married') {
    return {
      primary: primaryResult,
      spouse: null,
      combinedGrossIncome: primaryResult.grossIncome,
      combinedTaxBurden: primaryResult.totalTaxBurden,
      combinedNetIncome: primaryResult.netAnnualIncome,
      combinedEffectiveRate: primaryResult.effectiveTotalRate,
      combinedSurtax: primaryResult.surtax + primaryResult.surtaxCapitalExtra,
      surtaxSavingVsSeparate: 0,
    };
  }

  // ── בניית קלט מס לבן/בת הזוג ──
  const spouseClient: Client = {
    ...client,
    id: client.id + '_spouse',
    firstName: spouse.firstName,
    lastName: spouse.lastName,
    idNumber: spouse.idNumber,
    birthDate: spouse.birthDate,
    gender: spouse.gender,
    phone: spouse.phone,
    email: '',
    incomeTaxType: spouse.incomeTaxType,
    vatStatus: spouse.vatStatus,
    businessDescription: spouse.businessDescription,
    niType: spouse.niType,
    hasTaxCoordination: false,
    taxCoordinationDetails: '',
    isNewImmigrant: spouse.isNewImmigrant,
    aliyahYear: spouse.aliyahYear,
    isReturningResident: spouse.isReturningResident,
    returningYear: spouse.returningYear,
    disabilityPercentage: spouse.disabilityPercentage,
    disabilityType: spouse.disabilityType,
    hasAcademicDegree: spouse.hasAcademicDegree,
    academicDegreeYear: spouse.academicDegreeYear,
    academicDegreeType: spouse.academicDegreeType,
    completedIdf: spouse.completedIdf,
    idfReleaseYear: spouse.idfReleaseYear,
    completedNationalService: spouse.completedNationalService,
    nationalServiceYear: spouse.nationalServiceYear,
    // ירושת ישוב מוטב מהנישום הראשי אם לא הוגדר בנפרד
    qualifyingSettlementId: spouse.qualifyingSettlementOverride ? spouse.qualifyingSettlementId : client.qualifyingSettlementId,
    qualifyingSettlementOverride: spouse.qualifyingSettlementOverride,
    qualifyingSettlementCreditPoints: 0,
    hasPension: spouse.hasPension,
    pensionFundName: spouse.pensionFundName,
    employeePensionPct: spouse.employeePensionPct,
    employerPensionPct: spouse.employerPensionPct,
    hasKrenHashtalmut: spouse.hasKrenHashtalmut,
    krenHashtalmutMonthly: spouse.krenHashtalmutMonthly,
    spouse: null,
  };

  const spouseInput: TaxCalcInput = {
    client: spouseClient,
    year: primaryInput.year,
    grossSalary: spouse.grossSalary,
    employeePensionPct: spouse.employeePensionPct,
    selfEmployedGrossIncome: spouse.selfEmployedGrossIncome,
    recognizedExpenses: spouse.recognizedExpenses,
    selfEmployedPensionAmount: spouse.selfEmployedPensionAmount,
    rentalIncome: 0,
    rentalExpenses: 0,
    rentalTaxTrack: 'exempt',
    otherIncome: 0,
    donationsSection46: 0,
    krenHashtalmutSE: spouse.krenHashtalmutSE,
    overrideCreditPoints: false,
    manualCreditPoints: 0,
  };

  const spouseResult = calculateTax(spouseInput, taxData);

  // מס יסף — אינדיבידואלי לכל בן זוג (אין "סף משפחתי")
  const combinedSurtax = primaryResult.surtax + primaryResult.surtaxCapitalExtra
    + spouseResult.surtax + spouseResult.surtaxCapitalExtra;

  const combinedGrossIncome = primaryResult.grossIncome + spouseResult.grossIncome;
  const combinedTaxBurden = primaryResult.totalTaxBurden + spouseResult.totalTaxBurden;
  const combinedNetIncome = combinedGrossIncome - combinedTaxBurden;
  const combinedEffectiveRate = combinedGrossIncome > 0
    ? (combinedTaxBurden / combinedGrossIncome) * 100
    : 0;

  return {
    primary: primaryResult,
    spouse: spouseResult,
    combinedGrossIncome,
    combinedTaxBurden,
    combinedNetIncome,
    combinedEffectiveRate,
    combinedSurtax,
    surtaxSavingVsSeparate: 0,
  };
}
