import {
  Client,
  TaxCalcInput,
  TaxCalcResult,
  TaxYearData,
  CreditPointLine,
  BracketLine,
} from '../types';
import { getSettlementById } from '../data/settlements';

const fmt = (n: number) =>
  n.toLocaleString('he-IL', { maximumFractionDigits: 0 });

function getChildAge(birthYear: number, taxYear: number): number {
  return taxYear - birthYear;
}

// ─────────────────────────────────────────────────────────────────────────────
// נקודות זיכוי
// ─────────────────────────────────────────────────────────────────────────────

export function calcCreditPoints(
  client: Client,
  year: number,
  cpValue: number
): CreditPointLine[] {
  const lines: CreditPointLine[] = [];
  const add = (description: string, legalBasis: string, points: number) => {
    if (points > 0) lines.push({ description, legalBasis, points, valueNIS: points * cpValue });
  };

  // 1. בסיסי לכל תושב
  add('נקודת זיכוי בסיסית לתושב ישראל', 'סעיף 34', 2.25);

  // 2. תוספת לאישה
  if (client.gender === 'female') {
    add('תוספת נקודת זיכוי לאישה', 'סעיף 34(א)', 0.5);
  }

  // 3. הורה יחיד
  if (client.familyStatus === 'singleParent') {
    add('הורה יחיד', 'סעיף 35', 1.0);
  }

  // 4. ילדים — לפי גיל בשנת המס
  for (const child of client.children) {
    const age = getChildAge(child.birthYear, year);
    if (age < 0 || age > 18) continue;
    let pts = 0, desc = '';
    if (age === 0)              { pts = 1.5; desc = `ילד/ה (${child.birthYear}) — שנת לידה`; }
    else if (age <= 5)          { pts = 2.5; desc = `ילד/ה (${child.birthYear}) גיל ${age} — 1–5`; }
    else if (age <= 12)         { pts = 2.0; desc = `ילד/ה (${child.birthYear}) גיל ${age} — 6–12`; }
    else if (age <= 17)         { pts = 1.0; desc = `ילד/ה (${child.birthYear}) גיל ${age} — 13–17`; }
    else if (age === 18)        { pts = 0.5; desc = `ילד/ה (${child.birthYear}) גיל 18`; }
    add(desc, 'סעיף 40', pts);
    if (child.hasDisability && child.disabilityPercentage) {
      const dp = child.disabilityPercentage;
      const dPts = dp >= 90 ? 2 : dp >= 60 ? 1 : dp >= 30 ? 0.5 : 0;
      add(`ילד עם נכות ${dp}% (${child.birthYear})`, 'סעיף 45ב', dPts);
    }
  }

  // 5. עולה חדש
  if (client.isNewImmigrant && client.aliyahYear > 0) {
    const diff = year - client.aliyahYear;
    if (diff === 0 || diff === 1) add(`עולה חדש — שנה ${diff + 1} מאז עלייה`, 'סעיף 35א', 3.0);
    else if (diff === 2) add('עולה חדש — שנה שלישית', 'סעיף 35א', 2.0);
    else if (diff === 3) add('עולה חדש — שנה רביעית', 'סעיף 35א', 1.0);
  }

  // 6. תושב חוזר
  if (client.isReturningResident && client.returningYear > 0) {
    const diff = year - client.returningYear;
    if (diff === 0) add('תושב חוזר ותיק — שנת חזרה', 'סעיף 35ב', 2.0);
    else if (diff === 1) add('תושב חוזר — שנה ראשונה', 'סעיף 35ב', 1.0);
  }

  // 7. נכות
  if (client.disabilityPercentage > 0) {
    const dp = client.disabilityPercentage;
    let pts = 0, desc = '';
    if (dp >= 90) { pts = 4.0; desc = `נכות ${dp}% (90%+)`; }
    else if (dp >= 60) { pts = 2.5; desc = `נכות ${dp}% (60%–89%)`; }
    else if (dp >= 30) { pts = 1.5; desc = `נכות ${dp}% (30%–59%)`; }
    else if (dp >= 10) { pts = 0.5; desc = `נכות ${dp}% (10%–29%)`; }
    add(desc, 'סעיפים 45, 66–68', pts);
  }

  // 8. תואר אקדמי — שנת הסיום בלבד
  if (client.hasAcademicDegree && client.academicDegreeYear === year) {
    const label = client.academicDegreeType === 'bachelor' ? 'תואר ראשון'
                : client.academicDegreeType === 'master' ? 'תואר שני' : 'דוקטורט';
    add(`סיום ${label} (${year})`, 'סעיף 40(ב)', 1.0);
  }

  // 9. שחרור מצבא
  if (client.completedIDF && client.idfReleaseYear > 0) {
    const diff = year - client.idfReleaseYear;
    if (diff === 0) add('שחרור צה"ל — שנת השחרור', 'סעיף 41', 2.0);
    else if (diff === 1) add('שחרור צה"ל — שנה לאחר השחרור', 'סעיף 41', 1.0);
  }

  // 10. שירות לאומי
  if (client.completedNationalService && client.nationalServiceYear > 0) {
    if (year === client.nationalServiceYear) {
      add('סיום שירות לאומי/אזרחי', 'סעיף 41א', 0.5);
    }
  }

  // 11. ישוב מזכה
  if (client.qualifyingSettlementId) {
    const settlement = getSettlementById(client.qualifyingSettlementId);
    const pts = client.qualifyingSettlementCreditPoints || settlement?.creditPoints || 0.5;
    const name = settlement?.name ?? client.qualifyingSettlementId;
    add(`ישוב מזכה: ${name}`, 'תקנה 11 לתקנות מ"ה', pts);
  }

  return lines;
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

function calcNI(input: TaxCalcInput, taxData: TaxYearData): {
  niEmployee: number;
  healthEmployee: number;
  niSE_insurance: number;    // רכיב הביטוח בלבד (להיוון הניכוי)
  niSE_health: number;
  breakdown: string[];
} {
  const breakdown: string[] = [];
  let niEmployee = 0, healthEmployee = 0;
  let niSE_insurance = 0, niSE_health = 0;

  const threshold60A = taxData.niThreshold60Monthly * 12;
  const maxA = taxData.niMaxIncomeMonthly * 12;
  const type = input.client.niType;

  // ── שכיר ──────────────────────────────────────────────────────────────
  const salary = input.grossSalary;
  if (salary > 0 && (type === 'employee' || type === 'employeeAndSE')) {
    const insured = Math.min(salary, maxA);
    const low = Math.min(insured, threshold60A);
    const high = Math.max(0, insured - threshold60A);
    niEmployee = low * (taxData.employeeNI.lowRate / 100) + high * (taxData.employeeNI.highRate / 100);
    healthEmployee = low * (taxData.employeeNI.healthLowRate / 100) + high * (taxData.employeeNI.healthHighRate / 100);
    breakdown.push(
      `ביטוח לאומי שכיר: ${taxData.employeeNI.lowRate}% × ₪${fmt(Math.round(low))} (עד סף 60%) + ${taxData.employeeNI.highRate}% × ₪${fmt(Math.round(high))} = ₪${fmt(Math.round(niEmployee))}`
    );
    breakdown.push(
      `מס בריאות שכיר: ${taxData.employeeNI.healthLowRate}% × ₪${fmt(Math.round(low))} + ${taxData.employeeNI.healthHighRate}% × ₪${fmt(Math.round(high))} = ₪${fmt(Math.round(healthEmployee))}`
    );
  }

  // ── עצמאי ──────────────────────────────────────────────────────────────
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
        `ניכוי ב"ל ממס הכנסה (סעיף 17(5)): 52% × ₪${fmt(Math.round(niSE_insurance))} = ₪${fmt(Math.round(deductible))} — יופחת מהכנסה החייבת`
      );
    }
  }

  // ── עוסק שאינו עונה להגדרה ──────────────────────────────────────────
  if (type === 'nonQualifying') {
    const flat = taxData.nonQualifyingMonthlyNI * 12;
    const allInc = (input.grossSalary + seNet + input.rentalIncome + input.otherIncome);
    const hlth = allInc * (taxData.employeeNI.healthLowRate / 100);
    niSE_insurance = flat;
    niSE_health = hlth;
    breakdown.push(`עוסק שאינו עונה להגדרה: ב"ל מינימלי ₪${fmt(taxData.nonQualifyingMonthlyNI)}/חודש = ₪${fmt(flat)}/שנה`);
    breakdown.push(`מס בריאות: ${taxData.employeeNI.healthLowRate}% על כלל ההכנסה ₪${fmt(allInc)} = ₪${fmt(Math.round(hlth))}`);
  }

  // ── פסיבי / שכירות בלבד ──────────────────────────────────────────────
  if (type === 'passive') {
    const rentalNet = Math.max(0, input.rentalIncome - input.rentalExpenses);
    if (rentalNet > 0) {
      const hlth = rentalNet * (taxData.employeeNI.healthLowRate / 100);
      niSE_health = hlth;
      breakdown.push(`הכנסה פסיבית/שכירות: אינה חייבת בביטוח לאומי. מס בריאות ${taxData.employeeNI.healthLowRate}% = ₪${fmt(Math.round(hlth))}`);
    }
  }

  // ── פנסיונר ────────────────────────────────────────────────────────────
  if (type === 'pensioner') {
    breakdown.push('פנסיונר: אינו חייב בדמי ביטוח לאומי על פנסיה. מס בריאות בלבד.');
    const pension = input.grossSalary + input.otherIncome;
    const hlth = pension * (taxData.employeeNI.healthLowRate / 100);
    niSE_health = hlth;
    breakdown.push(`מס בריאות פנסיונר: ${taxData.employeeNI.healthLowRate}% × ₪${fmt(pension)} = ₪${fmt(Math.round(hlth))}`);
  }

  return { niEmployee, healthEmployee, niSE_insurance, niSE_health, breakdown };
}

// ─────────────────────────────────────────────────────────────────────────────
// חישוב ראשי
// ─────────────────────────────────────────────────────────────────────────────

export function calculateTax(input: TaxCalcInput, taxData: TaxYearData): TaxCalcResult {
  const { client } = input;
  const deductionBreakdown: string[] = [];
  const type = client.incomeTaxType;

  // ── א. הכנסות ──────────────────────────────────────────────────────────
  const grossSalary = Math.max(0, input.grossSalary);
  const seGross = Math.max(0, input.selfEmployedGrossIncome);
  const seExpenses = Math.max(0, input.recognizedExpenses);
  const seNet = Math.max(0, seGross - seExpenses);

  // ── ב. ביטוח לאומי (מחושב על ההכנסה הגולמית — לפני ניכוי ב"ל) ─────────
  const niCalc = calcNI(input, taxData);

  // ניכוי 52% מרכיב הביטוח לאומי לעצמאי (סעיף 17(5))
  const niDeductionSE = niCalc.niSE_insurance * 0.52;
  if (niDeductionSE > 0) {
    deductionBreakdown.push(
      `ניכוי ביטוח לאומי לעצמאי (52% × ₪${fmt(Math.round(niCalc.niSE_insurance))}): ₪${fmt(Math.round(niDeductionSE))} — סעיף 17(5) לפקודה`
    );
  }

  // ניכוי פנסיה שכיר (עד 7%)
  let pensionDeductionEmp = 0;
  if (grossSalary > 0 && input.employeePensionPct > 0) {
    pensionDeductionEmp = grossSalary * (Math.min(input.employeePensionPct, 7) / 100);
    deductionBreakdown.push(`ניכוי פנסיה שכיר (${Math.min(input.employeePensionPct, 7)}%): ₪${fmt(Math.round(pensionDeductionEmp))} (סעיף 47)`);
  }

  // ניכוי פנסיה עצמאי (עד 16.5%)
  let pensionDeductionSE = 0;
  if (seNet > 0 && input.selfEmployedPensionAmount > 0) {
    const max = seNet * 0.165;
    pensionDeductionSE = Math.min(input.selfEmployedPensionAmount, max);
    deductionBreakdown.push(`ניכוי פנסיה עצמאי: ₪${fmt(Math.round(pensionDeductionSE))} (מוגבל ל-16.5%, סעיפים 47, 47א)`);
  }

  // ניכוי קרן השתלמות עצמאי (עד 4.5%)
  let krenDeduction = 0;
  if ((type === 'selfEmployed' || type === 'both') && input.krenHashtalmutSE > 0) {
    const max = seNet * 0.045;
    krenDeduction = Math.min(input.krenHashtalmutSE, max);
    deductionBreakdown.push(`ניכוי קרן השתלמות עצמאי: ₪${fmt(Math.round(krenDeduction))} (עד 4.5%, סעיף 17(5א))`);
  }

  if (seExpenses > 0) deductionBreakdown.push(`הוצאות מוכרות מהכנסת עסק: ₪${fmt(seExpenses)}`);

  // ── ג. הכנסה חייבת ────────────────────────────────────────────────────
  const taxableSalary = Math.max(0, grossSalary - pensionDeductionEmp);
  const taxableSE = Math.max(0, seNet - pensionDeductionSE - krenDeduction - niDeductionSE);

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
      } else {
        const excess = rentalIncome - exemptMonthly * 12;
        const reducedExempt = Math.max(0, exemptMonthly * 12 - excess);
        taxableRental = rentalIncome - reducedExempt;
        rentalExplanation = `שכירות — פטור חלקי: חריגה מהתקרה → חייב ₪${fmt(Math.round(taxableRental))}.`;
      }
    } else if (input.rentalTaxTrack === 'flat10') {
      taxableRental = 0;
      rentalExplanation = `שכירות 10% (מחושב בנפרד): ₪${fmt(rentalIncome)} × 10% = ₪${fmt(Math.round(rentalIncome * 0.1))}.`;
    } else {
      taxableRental = Math.max(0, rentalIncome - rentalExp);
      rentalExplanation = `שכירות מסלול רגיל: ₪${fmt(rentalIncome)} − הוצאות ₪${fmt(rentalExp)} = ₪${fmt(Math.round(taxableRental))}.`;
    }
  }

  const otherIncome = Math.max(0, input.otherIncome);
  const taxableIncome = taxableSalary + taxableSE + taxableRental + otherIncome;
  const grossIncome = grossSalary + seGross + rentalIncome + otherIncome;
  const totalDeductions = grossIncome - taxableIncome;

  // ── ד. מדרגות מס ───────────────────────────────────────────────────────
  const { bracketLines, totalTax: taxBeforeCredit } = calcBrackets(taxableIncome, taxData);

  // ── ה. נקודות זיכוי ─────────────────────────────────────────────────────
  const creditPointLines = input.overrideCreditPoints
    ? [{ description: 'נקודות זיכוי — הזנה ידנית', legalBasis: '', points: input.manualCreditPoints, valueNIS: input.manualCreditPoints * taxData.creditPointValue }]
    : calcCreditPoints(client, input.year, taxData.creditPointValue);

  const totalCreditPoints = creditPointLines.reduce((s, l) => s + l.points, 0);
  const totalCreditValue = totalCreditPoints * taxData.creditPointValue;
  const taxWithoutCredits = taxBeforeCredit;

  // ── ו. זיכוי תרומות (35%) ────────────────────────────────────────────────
  let donationCredit = 0;
  if (input.donationsSection46 > 0) {
    donationCredit = input.donationsSection46 * 0.35;
    deductionBreakdown.push(`זיכוי תרומות מוכרות (35%): ₪${fmt(Math.round(donationCredit))} (סעיף 46)`);
  }

  // ── ז. מס הכנסה ──────────────────────────────────────────────────────────
  const incomeTax = Math.max(0, taxBeforeCredit - totalCreditValue - donationCredit);
  const rentalFlat10 = input.rentalTaxTrack === 'flat10' ? rentalIncome * 0.1 : 0;

  // היטל יסף 3%
  let surtax = 0;
  if (taxableIncome > taxData.surtaxThreshold) {
    surtax = (taxableIncome - taxData.surtaxThreshold) * 0.03;
  }

  const totalIncomeTax = incomeTax + rentalFlat10 + surtax;
  const marginalBracket = taxData.incomeTaxBrackets.find(b => taxableIncome <= b.upTo);
  const marginalRate = marginalBracket?.rate ?? 50;
  const effectiveIncomeTaxRate = taxableIncome > 0 ? (totalIncomeTax / taxableIncome) * 100 : 0;

  // ── ח. ניתוח נוסף ─────────────────────────────────────────────────────────
  const unusedCreditValue = Math.max(0, totalCreditValue - taxBeforeCredit);
  const remainingFreeIncomeCapacity = unusedCreditValue > 0
    ? unusedCreditValue / (marginalRate / 100)
    : 0;

  // מרחק למדרגה הבאה
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

  // ── ט. ביטוח לאומי סיכום ─────────────────────────────────────────────────
  const totalNI = niCalc.niEmployee + niCalc.healthEmployee + niCalc.niSE_insurance + niCalc.niSE_health;

  // ── י. סיכום ─────────────────────────────────────────────────────────────
  const totalTaxBurden = totalIncomeTax + totalNI;
  const netAnnualIncome = grossIncome - totalTaxBurden;
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
    incomeTax,
    surtax,
    totalIncomeTax,
    marginalRate,
    effectiveIncomeTaxRate,
    niEmployee: niCalc.niEmployee,
    healthEmployee: niCalc.healthEmployee,
    niSelfEmployed: niCalc.niSE_insurance,
    healthSelfEmployed: niCalc.niSE_health,
    niDeductionFromIncomeTax: niDeductionSE,
    totalNI,
    niBreakdown: niCalc.breakdown,
    unusedCreditValue,
    remainingFreeIncomeCapacity,
    distanceToNextBracket,
    nextBracketRate,
    taxWithoutCredits,
    totalTaxBurden,
    netAnnualIncome,
    effectiveTotalRate,
    deductionBreakdown,
    rentalExplanation,
  };
}
