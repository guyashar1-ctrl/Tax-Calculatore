import { describeProblem } from '../features/taxRules/registry';
import { selfEmployedPension, niSelfEmployedBase, niNonWorkIncome } from '../features/taxRules/calc';

// ‼ הנוסחה עצמה במרשם (taxRules/calc) — אותה פונקציה לנושא «ביטוח לאומי לעצמאי» ולמחשבון.
export { niSelfEmployedBase };
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
import { clientForTaxYear } from './familyStatusYear';

const fmt = (n: number) =>
  n.toLocaleString('he-IL', { maximumFractionDigits: 0 });

// ─────────────────────────────────────────────────────────────────────────────
// ממשק גנרי לנתוני נישום (ראשי או בן/בת זוג)
// ─────────────────────────────────────────────────────────────────────────────

// ‼ 290 · מיוצא לבדיקת השמירה (questionnaireCovers.test.ts): כל קלט כאן — עם פריט בשאלון שכותב אותו, או סיבה מפורשת
export interface TaxPerson {
  gender: Gender;
  familyStatus?: string;
  children: Child[];
  isNewImmigrant: boolean;
  aliyahYear: number;
  /** 290 · חודש העלייה (1–12); חסר ⇒ ינואר */
  aliyahMonth?: number;
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
  spouseNoIncomeEligible?: boolean;
  // 288 · חודש השחרור וחודשי השירות (חסר ⇒ ינואר ו-24 — ומסומן בכרטיס כהנחה)
  idfReleaseMonth?: number;
  serviceMonths?: number;
  /** סעיף 40א — משלם/ת מזונות לבן/בת זוג לשעבר */
  paysAlimonyToEx?: boolean;
  /** לנקודת «נער/ה» (16–17) */
  birthYear?: number;
}

const yearOf = (iso?: string) => { const y = Number((iso ?? '').slice(0, 4)); return y > 1900 ? y : undefined; };

export function clientToTaxPerson(client: Client): TaxPerson {
  return {
    gender: client.gender,
    familyStatus: client.familyStatus,
    children: client.children,
    isNewImmigrant: client.isNewImmigrant,
    aliyahYear: client.aliyahYear,
    aliyahMonth: client.aliyahMonth ?? undefined,
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
    spouseNoIncomeEligible: client.spouseNoIncomeEligible,
    idfReleaseMonth: client.idfReleaseMonth ?? undefined,
    serviceMonths: client.serviceMonths ?? undefined,
    paysAlimonyToEx: client.paysAlimonyToEx ?? undefined,
    birthYear: yearOf(client.birthDate),
  };
}

/**
 * סעיף 45 — 2 הנקודות לילד/ה נטול/ת יכולת נזקפות לבני זוג נשואים להורה אחד. disabilityPointsTo נשמר יחסית לכרטיס;
 * בחישוב של בן/בת הזוג מהפכים את נקודת המבט: מה שסומן 'spouse' הוא «אני», וכל השאר — ההורה השני.
 */
export function childrenFromSpouseView(children: Child[]): Child[] {
  return children.map(c => (c.hasDisability ? { ...c, disabilityPointsTo: c.disabilityPointsTo === 'spouse' ? 'client' as const : 'spouse' as const } : c));
}

export function spouseToTaxPerson(spouse: SpouseData, children: Child[]): TaxPerson {
  return {
    gender: spouse.gender,
    familyStatus: 'married',
    children: childrenFromSpouseView(children),
    isNewImmigrant: spouse.isNewImmigrant,
    aliyahYear: spouse.aliyahYear,
    aliyahMonth: spouse.aliyahMonth,
    disabilityPercentage: spouse.disabilityPercentage,
    hasAcademicDegree: spouse.hasAcademicDegree,
    academicDegreeYear: spouse.academicDegreeYear,
    academicDegreeType: spouse.academicDegreeType,
    completedIdf: spouse.completedIdf,
    idfReleaseYear: spouse.idfReleaseYear,
    completedNationalService: spouse.completedNationalService,
    nationalServiceYear: spouse.nationalServiceYear,
    qualifyingSettlementId: spouse.qualifyingSettlementId,
    // ‼ של בן/בת הזוג עצמם — לא של בעל/ת הכרטיס (מילואים, «בן זוג ללא הכנסה»)
    reserveCombatDaysPrevYear: spouse.reserveCombatDaysPrevYear,
    idfReleaseMonth: spouse.idfReleaseMonth,
    serviceMonths: spouse.serviceMonths,
    paysAlimonyToEx: spouse.paysAlimonyToEx,
    birthYear: yearOf(spouse.birthDate),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// נקודות זיכוי — מותאם למנוע V2 (הכללים המאומתים)
// 288: חודש השחרור וחודשי השירות — מהכרטיס. חסר ⇒ ינואר ו-24 חודשים, וכרטיס הזיכויים
// אומר שזו הנחה (creditGaps). 290: חודש העלייה — מהכרטיס; חסר ⇒ ינואר, ומסומן.
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
  // ‼ 288 · סעיף 40(ב): גרוש/ה שהילדים אצלו/ה (custody='self') — נקודות הילדים במסלול הראשון ועוד נקודה
  //   (40(ב)(2)). רק ההורה השני «משתתף בכלכלת ילדיו». קודם כל גרוש/ה עם ילדים קיבל/ה את נקודת ההורה השני.
  const divorcedWithKids = person.familyStatus === 'divorced' && person.children.length > 0;
  const custodial = divorcedWithKids && person.children.some(c => c.custody === 'self');

  return {
    year,
    gender: person.gender,
    isMarried: person.familyStatus === 'married',
    // ‼ סעיף 45: לנשואים — הנקודות להורה אחד בלבד (ברירת המחדל: בעל/ת הכרטיס; בצד בן/בת הזוג — childrenFromSpouseView)
    children: person.children.map(c => ({ birthYear: c.birthYear, hasDisability: c.hasDisability,
      disabilityPointsElsewhere: person.familyStatus === 'married' && c.hasDisability && (c.disabilityPointsTo ?? 'client') !== 'client' })),
    // הילדים אצל ההורה השני (custody='spouse' בכרטיס של גרוש/ה) ⇒ המסלול השני, גם לאם
    parentRole: custodial ? 'allowanceParent'
      : divorcedWithKids && person.children.every(c => c.custody === 'spouse') ? 'otherParent'
      : person.gender === 'female' ? 'allowanceParent' : 'otherParent',
    isSoleParent: person.familyStatus === 'singleParent',
    participatesInChildSupport: (divorcedWithKids && !custodial) || anyAlimonyPaid,
    custodialSeparatedParent: custodial,
    isNewImmigrant: person.isNewImmigrant,
    aliyahYear: person.aliyahYear || undefined,
    aliyahMonth: person.aliyahMonth || undefined,
    reserveCombatDaysPrevYear: person.reserveCombatDaysPrevYear || undefined,
    // ‼ רק לנשואים — סעיף 37 חל על בני זוג בלבד.
    spouseNoIncomeEligible: person.familyStatus === 'married' && person.spouseNoIncomeEligible === true,
    service: person.completedIdf && person.idfReleaseYear > 0
      ? { kind: 'military', months: person.serviceMonths || 24, releaseYear: person.idfReleaseYear, releaseMonth: person.idfReleaseMonth }
      : person.completedNationalService && person.nationalServiceYear > 0
        ? { kind: 'national', months: person.serviceMonths || 24, releaseYear: person.nationalServiceYear, releaseMonth: person.idfReleaseMonth }
        : undefined,
    paysAlimonyToEx: person.familyStatus === 'married' && person.paysAlimonyToEx === true,
    teenBirthYear: person.birthYear,
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
  // ‼ המצב המשפחתי של שנת המס, לא של היום (utils/familyStatusYear.ts)
  const result = calcCreditPointsV2(personToProfile(clientToTaxPerson(clientForTaxYear(client, year)), year), cpValue);
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

export function calcBrackets(taxableIncome: number, taxData: TaxYearData): {
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
  /** הניכוי לקופת גמל לפי סעיף 47 — מקטין את ההכנסה לב״ל (סעיף 345). */
  pensionDeduction?: number;
  /** החלק החייב במס משכר הדירה — חייב בדמי ביטוח כהכנסה שלא מעבודה. */
  taxableRental?: number;
}

/** הגיל ב-1.1 של שנת המס (פנסיה: מגיל 50 — כלל פתוח). */
function ageOnJan1(birth: string | undefined, year: number): number | undefined {
  if (!birth) return undefined;
  const b = new Date(birth + 'T00:00:00Z');
  if (isNaN(b.getTime())) return undefined;
  return year - b.getUTCFullYear() - ((b.getUTCMonth() > 0 || b.getUTCDate() > 1) ? 1 : 0);
}

function calcNI(input: NIInput, taxData: TaxYearData): {
  niEmployee: number;
  healthEmployee: number;
  niSE_insurance: number;
  niSE_health: number;
  niNonWork: number;
  healthNonWork: number;
  breakdown: string[];
} {
  const breakdown: string[] = [];
  let niEmployee = 0, healthEmployee = 0;
  let niSE_insurance = 0, niSE_health = 0;
  let niNonWork = 0, healthNonWork = 0;

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
  const salaryInsured = salary > 0 && (type === 'employee' || type === 'employeeAndSE') ? Math.min(salary, maxA) : 0;

  // ‼ סעיף 345: ההכנסה לב״ל היא לפני פטורים וזיכויים, אחרי 52% מדמי הביטוח הלאומי **ואחרי הניכוי לקופת גמל
  //   שקבע מס הכנסה (סעיף 47)** — דף ב״ל «דוגמה לחישוב דמי ביטוח לעובד עצמאי». הקרן להשתלמות אינה מופחתת.
  const seNet = Math.max(0, input.selfEmployedGrossIncome - input.recognizedExpenses - Math.max(0, input.pensionDeduction ?? 0));
  if ((input.pensionDeduction ?? 0) > 0 && input.selfEmployedGrossIncome > 0) {
    breakdown.push(`ההכנסה לב״ל מעסק הוקטנה בניכוי לקופת גמל (סעיף 47): ₪${fmt(Math.round(input.pensionDeduction!))} — סעיף 345`);
  }

  // ── עצמאי ──
  let seBase = 0;
  if (seNet > 0 && (type === 'selfEmployed' || type === 'employeeAndSE')) {
    const alreadyInsured = type === 'employeeAndSE' ? salaryInsured : 0;
    const remainingMax = Math.max(0, maxA - alreadyInsured);
    // ‼ סעיף 345 + 47א: ההכנסה לב״ל היא ההכנסה אחרי ניכוי 52% מדמי הביטוח הלאומי עצמם — לכן הבסיס
    //   נפתר בנוסחה של ב״ל, ולא ההכנסה ברוטו (שמעריכה ביתר את דמי הביטוח ואת הניכוי).
    const lowAvail0 = Math.max(0, threshold60A - Math.min(alreadyInsured, threshold60A));
    const baseSE = niSelfEmployedBase(seNet, lowAvail0, taxData.selfEmployedNI.lowRate / 100, taxData.selfEmployedNI.highRate / 100);
    const insuredSE = Math.min(baseSE, remainingMax);
    seBase = Math.max(0, insuredSE);

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
        `הכנסה לב״ל מעסק: ₪${fmt(Math.round(insuredSE))} (₪${fmt(Math.round(seNet))} פחות 52% מדמי הביטוח הלאומי — נוסחת ב״ל, סעיף 345)`
      );
      breakdown.push(
        `ביטוח לאומי עצמאי: ${taxData.selfEmployedNI.lowRate}% × ₪${fmt(Math.round(seLow))} + ${taxData.selfEmployedNI.highRate}% × ₪${fmt(Math.round(seHigh))} = ₪${fmt(Math.round(niSE_insurance))}`
      );
      breakdown.push(
        `מס בריאות עצמאי: ${taxData.selfEmployedNI.healthLowRate}% × ₪${fmt(Math.round(seLow))} + ${taxData.selfEmployedNI.healthHighRate}% × ₪${fmt(Math.round(seHigh))} = ₪${fmt(Math.round(niSE_health))}`
      );
      const deductible = niSE_insurance * 0.52;
      breakdown.push(
        `ניכוי ב"ל ממס הכנסה (סעיף 47א): 52% × ₪${fmt(Math.round(niSE_insurance))} = ₪${fmt(Math.round(deductible))} - יופחת מההכנסה החייבת (דמי הבריאות אינם מותרים בניכוי)`
      );
    }
  }

  // ── הכנסה שלא מעבודה ──
  // ‼ שכ"ד: החלק הפטור (פטור / 10%) פטור מדמי ביטוח (350(א)(7)); החלק **החייב** (059 — מסלול רגיל או פטור חלקי) הוא
  //   «הכנסה שלא מעבודה» וחייב (research/rental-realestate §C29). «עצמאי שאינו עונה להגדרה» — כולו הכנסה שלא מעבודה.
  //   פנסיה מוקדמת / אזרח ותיק (351(ב)) — לא מחושב כאן.
  const rentChargeable = Math.max(0, input.taxableRental ?? 0);
  const nonWorkIncome = type === 'pensioner' ? 0
    : rentChargeable + (type === 'nonQualifying' ? seNet + input.otherIncome : type === 'passive' ? input.otherIncome : 0);
  if (type === 'pensioner' && rentChargeable > 0) breakdown.push('שכ"ד חייב אצל מקבל פנסיה / קצבת אזרח ותיק — דמי הביטוח על השכירות לא חושבו כאן (351(ב))');
  if (nonWorkIncome > 0) {
    const usedWork = salaryInsured + seBase;
    const nw = niNonWorkIncome({
      income: nonWorkIncome, exempt: exempt25A,
      lowAvail: Math.max(0, threshold60A - Math.min(usedWork, threshold60A)), maxAvail: Math.max(0, maxA - usedWork),
      lowNi: taxData.passiveNI.lowRate / 100, highNi: taxData.passiveNI.highRate / 100, health: taxData.passiveNI.healthHighRate / 100,
    });
    niNonWork = nw.ni; healthNonWork = nw.health;
    const what = [rentChargeable > 0 ? `שכ"ד חייב ₪${fmt(Math.round(rentChargeable))}` : '', type === 'nonQualifying' && seNet > 0 ? `עסק (עצמאי שאינו עונה להגדרה) ₪${fmt(Math.round(seNet))}` : '',
      (type === 'nonQualifying' || type === 'passive') && input.otherIncome > 0 ? `הכנסה אחרת ₪${fmt(Math.round(input.otherIncome))}` : ''].filter(Boolean).join(' + ');
    if (nw.chargeable <= 0) {
      breakdown.push(`הכנסה שלא מעבודה (${what}): אחרי הפחתת 52% מדמי הביטוח (345) והסכום הפטור ₪${fmt(exempt25A)} לשנה (348) — אין דמי ביטוח`);
    } else {
      breakdown.push(
        `הכנסה שלא מעבודה (${what}): ₪${fmt(Math.round(nw.reduced345))} אחרי הפחתת 52% מדמי הביטוח (345), פחות ₪${fmt(exempt25A)} פטור (348 — הפחתה, לא מצוק) = ₪${fmt(Math.round(nw.chargeable))} חייב`
      );
      breakdown.push(
        `ביטוח לאומי על הכנסה שלא מעבודה: ${taxData.passiveNI.lowRate}% × ₪${fmt(Math.round(nw.lowPart))} + ${taxData.passiveNI.highRate}% × ₪${fmt(Math.round(nw.highPart))} = ₪${fmt(Math.round(niNonWork))} · בריאות ${taxData.passiveNI.healthHighRate}% = ₪${fmt(Math.round(healthNonWork))}`
      );
    }
    if (type === 'nonQualifying') {
      breakdown.push('לתשומת לב: מעמד זה אינו מבוטח לנפגעי עבודה ודמי לידה מעיסוק זה');
      const minA = taxData.nonQualifyingMonthlyNI * 12;
      if (salaryInsured === 0 && niNonWork + healthNonWork < minA) {
        breakdown.push(`הוחל מינימום שנתי: ₪${fmt(minA)} (₪${fmt(taxData.nonQualifyingMonthlyNI)}/חודש)`);
        healthNonWork = minA * 0.46;
        niNonWork = minA - healthNonWork;
      }
    }
    if (type === 'passive' && salaryInsured === 0) breakdown.push(`מי שאינו עובד משלם לפחות ₪${fmt(taxData.nonQualifyingMonthlyNI)} לחודש (למעט אישה נשואה שאינה עובדת מחוץ למשק הבית) — לא נכלל כאן`);
  } else if (input.rentalIncome > 0 && type !== 'pensioner') {
    breakdown.push('שכ"ד למגורים בחלק הפטור (פטור / 10%) — פטור מדמי ביטוח (סעיף 350(א)(7))');
  }

  return { niEmployee, healthEmployee, niSE_insurance, niSE_health, niNonWork, healthNonWork, breakdown };
}

// ─────────────────────────────────────────────────────────────────────────────
// מס יסף — שתי שכבות (סעיף 121ב + תיקון 276)
// שכבה 1: 3% על כלל ההכנסה החייבת מעל הסף.
// שכבה 2 (מ-2025): 2% נוסף על הכנסה שאינה מיגיעה אישית (הונית/פסיבית),
//                  רק אם ההכנסה ההונית לבדה עולה על הסף (הו"ב 5/2025).
// ─────────────────────────────────────────────────────────────────────────────

export function calcSurtax(
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

  // ניכוי קרן השתלמות עצמאי — לפני הפנסיה: ההכנסה המזכה לפנסיה היא אחרי ניכוי הקרן (מדריך 2025, סעיף 53)
  let krenDeduction = 0;
  if ((type === 'selfEmployed' || type === 'both') && input.krenHashtalmutSE > 0) {
    const max = seNet * 0.045;
    krenDeduction = Math.min(input.krenHashtalmutSE, max);
    deductionBreakdown.push(`ניכוי קרן השתלמות עצמאי: ₪${fmt(Math.round(krenDeduction))} (עד 4.5% מההכנסה, סעיף 17(5א))`);
  }

  // עצמאי: ניכוי (סעיף 47) וזיכוי (סעיף 45א) — פונקציה אחת למחשבון, להערכה ולדוח (selfEmployedPension):
  // ‼ לא «11% + 5.5%» גורף — ניכוי 7%, זיכוי עד 5%, תוספת ניכוי רק מעל 12%, מסלול ב׳ לעמית מוטב, תקרה שמשכורת מקטינה.
  let pensionDeductionSE = 0;
  const unverified: string[] = [];
  if ((seNet > 0 || grossSalary > 0) && input.selfEmployedPensionAmount > 0) {
    const pre = input.sePension;
    const r = pre ? undefined : selfEmployedPension({
      year: input.year, nonWorkIncome: Math.max(0, seNet - krenDeduction), businessIncome: seNet, salary: grossSalary,
      insuredSalary: input.insuredSalary ?? (grossSalary > 0 ? (input.employeePensionPct > 0 ? grossSalary : undefined) : 0),
      ownDeposits: input.selfEmployedPensionAmount,
      employeeDeposits: input.employeeDeposits ?? grossSalary * (input.employeePensionPct || 0) / 100,
      employerDeposits: input.employerDeposits ?? grossSalary * (client.employerPensionPct || 0) / 100,
      ageOnJan1: input.ageOnJan1 ?? ageOnJan1(client.birthDate, input.year),
    });
    const v = pre && 'deduction' in pre ? pre : r?.ok ? r.value! : undefined;
    if (v) {
      pensionDeductionSE = Math.min(input.selfEmployedPensionAmount, v.deduction);
      const creditBase = Math.max(0, v.creditBase + ('extraCreditBase' in v ? (v.extraCreditBase ?? 0) : 0));
      deductionBreakdown.push(`ניכוי פנסיה עצמאי (סעיף 47): ₪${fmt(Math.round(pensionDeductionSE))}${v.explain?.length ? ` — ${v.explain.join(' · ')}` : ''}`);
      if (creditBase > 0) {
        pensionCredit += creditBase * 0.35;
        deductionBreakdown.push(`זיכוי פנסיה עצמאי (סעיף 45א): 35% × ₪${fmt(Math.round(creditBase))} = ₪${fmt(Math.round(creditBase * 0.35))}`);
      }
    } else if (!pre && seNet > 0) {
      // ‼ המחשבון הכללי בלי ערך מאומת (שנה בלי ערכים במרשם, או גיל 50 ומעלה שעדיין פתוח — pen.age50Cap):
      // נשאר החישוב שהיה לפני 11.10.2026, מסומן — אחרת הפנסיה נעלמת מהחישוב והמס עולה בלי שהשתנה כלל.
      // הערכה ודוח מעבירים sePension משלהם ונשארים חסומים (הענף הבא).
      const probs = r?.problems ?? [];
      const age = input.ageOnJan1 ?? ageOnJan1(client.birthDate, input.year);
      const why = [
        ...(age != null && age >= 50 ? ['גיל 50 ומעלה ב-1.1 — כלל הפנסיה מגיל 50 עדיין פתוח'] : []),
        ...(probs.some(p => p.kind === 'noValueForYear') ? [`אין במרשם ערכים מאומתים לשנת ${input.year}`] : []),
      ].join(' · ') || probs.map(describeProblem).join(' · ');
      pensionDeductionSE = Math.min(input.selfEmployedPensionAmount, seNet * 0.11);
      unverified.push(`פנסיה לעצמאי חושבה בשיטה הקודמת (11% ניכוי, עד 5.5% זיכוי) — לא מאומת: ${why}`);
      deductionBreakdown.push(`ניכוי פנסיה עצמאי (סעיף 47): ₪${fmt(Math.round(pensionDeductionSE))} — לפי החישוב הקודם (עד 11% ניכוי; עד 16.5% כולל זיכוי), לא מאומת (${why})`);
      const creditPart = Math.min(Math.max(0, input.selfEmployedPensionAmount - pensionDeductionSE), seNet * 0.055);
      if (creditPart > 0) {
        pensionCredit += creditPart * 0.35;
        deductionBreakdown.push(`זיכוי פנסיה עצמאי (סעיף 45א): 35% × ₪${fmt(Math.round(creditPart))} = ₪${fmt(Math.round(creditPart * 0.35))} — לפי החישוב הקודם, לא מאומת`);
      }
    } else if (!pre) {
      deductionBreakdown.push(`הפקדה עצמאית לקופת גמל של שכיר (סעיף 47(ב)(2)): לא חושבה — ${(r?.problems ?? []).map(describeProblem).join(' · ')}`);
    } else {
      const why = 'notComputed' in pre ? pre.notComputed : '';
      deductionBreakdown.push(`פנסיה עצמאי: הניכוי והזיכוי לא חושבו — ${why}`);
    }
  }

  if (seExpenses > 0) deductionBreakdown.push(`הוצאות מוכרות מהכנסת עסק: ₪${fmt(seExpenses)}`);

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
        rentalExplanation = `פטור חלקי (תקרה מתואמת): חריגה ₪${fmt(Math.round(excessMonthly))} ← פטור ₪${fmt(Math.round(adjustedExempt))} ← חייב ₪${fmt(Math.round(taxableRental))}/שנה. כל שקל חריגה מוסיף 2 ₪ לחלק החייב.`;
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

  // ── ב. ביטוח לאומי ──
  const niCalc = calcNI({
    grossSalary,
    selfEmployedGrossIncome: seGross,
    recognizedExpenses: seExpenses,
    rentalIncome: input.rentalIncome,
    rentalTaxTrack: input.rentalTaxTrack,
    otherIncome: input.otherIncome,
    niType: client.niType,
    pensionDeduction: Math.min(pensionDeductionSE, seNet),
    taxableRental,
  }, taxData);

  const niDeductionSE = input.niDeductionSEOverride ?? niCalc.niSE_insurance * 0.52;
  if (niDeductionSE > 0 && (client.niType === 'selfEmployed' || client.niType === 'employeeAndSE')) {
    deductionBreakdown.push(
      input.niDeductionSEOverride != null ? `ניכוי ביטוח לאומי לעצמאי (52% מדמי הביטוח בנוסחת ב״ל): ₪${fmt(Math.round(niDeductionSE))} - סעיף 47א לפקודה` : `ניכוי ביטוח לאומי לעצמאי (52% × ₪${fmt(Math.round(niCalc.niSE_insurance))}): ₪${fmt(Math.round(niDeductionSE))} - סעיף 47א לפקודה`
    );
  }
  const niDeductionApplies = client.niType === 'selfEmployed' || client.niType === 'employeeAndSE';

  // ── ג. הכנסה חייבת ──
  const seAfter = Math.max(0, seNet - krenDeduction - (niDeductionApplies ? niDeductionSE : 0));
  const pensionFromSE = Math.min(pensionDeductionSE, seAfter);
  // ‼ 47(ב)(2): הפקדה כעמית עצמאי של שכיר (גם בלי עסק) — הניכוי שלא נוכה מהעסק יורד מהמשכורת
  const taxableSalary = Math.max(0, grossSalary - (pensionDeductionSE - pensionFromSE));
  const taxableSE = seAfter - pensionFromSE;

  const otherIncome = Math.max(0, input.otherIncome);
  // ‼ 47א: ניכוי 52% גם מדמי הביטוח הלאומי על הכנסה שלא מעבודה (לא מדמי הבריאות), עד ההכנסה החייבת שלא מעבודה
  const nonWorkTaxable = taxableRental + (client.niType === 'nonQualifying' ? taxableSE + otherIncome : client.niType === 'passive' ? otherIncome : 0);
  const niDeductionNonWork = Math.min(niCalc.niNonWork * 0.52, nonWorkTaxable);
  if (niDeductionNonWork > 0) deductionBreakdown.push(`ניכוי ב״ל על הכנסה שלא מעבודה (סעיף 47א): 52% × ₪${fmt(Math.round(niCalc.niNonWork))} = ₪${fmt(Math.round(niDeductionNonWork))}`);
  let taxableIncome = Math.max(0, taxableSalary + taxableSE + taxableRental + otherIncome - niDeductionNonWork);

  // ── פטור נכה/עיוור סעיף 9(5) — אם רלוונטי ──
  const profile = personToProfile(clientToTaxPerson(clientForTaxYear(client, input.year)), input.year);
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
      settlementCreditExplanation = `היישוב שנבחר ("${client.qualifyingSettlementId}") אינו ברשימת היישובים המוטבים הרשמית לשנת ${input.year}.`;
    }
  }

  // ── ז. זיכוי תרומות (סעיף 46): 35% על סך תרומות של יותר מ-207 ₪, עד 30% מההכנסה החייבת ועד 10,354,816 ₪ ──
  // ‼ «יותר מ-207» (מדריך 2025 עמ׳ 72; לוח העזר 2026 עמ׳ 13) — 207 בדיוק אינו מזכה (תוקן 13.10.2026; היה ≥).
  let donationCredit = 0;
  if (input.donationsSection46 > 207) {
    const eligibleDonation = Math.min(input.donationsSection46, taxableIncome * 0.3, 10_354_816);
    donationCredit = eligibleDonation * 0.35;
    deductionBreakdown.push(`זיכוי תרומות (סעיף 46): 35% × ₪${fmt(Math.round(eligibleDonation))} = ₪${fmt(Math.round(donationCredit))}${eligibleDonation < input.donationsSection46 ? ` (מעל 30% מההכנסה החייבת — היתרה עוברת עד 3 שנים)` : ''}`);
  } else if (input.donationsSection46 > 0) {
    deductionBreakdown.push(`תרומות ₪${fmt(input.donationsSection46)} - לא יותר מ-207 ₪ בשנה, ולכן אין זיכוי`);
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
      sepBreakdown.push(`הגרלות (פטור מתקפל): פטור ₪${fmt(reducedExemption)} ← חייב ₪${fmt(gamblingTaxable)} × 35% = ₪${fmt(Math.round(gamblingTaxable * 0.35))}`);
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
  // שיעור שולי אפקטיבי: המדרגה העליונה (47%) ועוד 3% יסף מעל הסף — לא מדרגה נוספת בטבלה.
  const marginalRate = (marginalBracket?.rate ?? 47) + (surtaxTotalBase > taxData.surtaxThreshold ? 3 : 0);
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
  const totalNI = niCalc.niEmployee + niCalc.healthEmployee + niCalc.niSE_insurance + niCalc.niSE_health + niCalc.niNonWork + niCalc.healthNonWork;

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
    niDeductionFromIncomeTax: (niDeductionApplies ? niDeductionSE : 0) + niDeductionNonWork,
    niNonWork: niCalc.niNonWork,
    healthNonWork: niCalc.healthNonWork,
    taxableRental,
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
    unverified,
    rentalExplanation,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// חישוב תא משפחתי — נפרד לכל בן זוג
// מס יסף מוטל על כל יחיד בנפרד, עם סף מלא לכל אחד (בחישוב נפרד) —
// הו"ב 9/2015; הכנסות מרכוש משותף ניתנות לפיצול.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * בן/בת הזוג כ«לקוח» לחישוב נפרד (נקודות זיכוי, סוג מבוטח, יישוב). משמש את calculateFamilyTax
 * ואת הערכת המס (src/features/taxEstimate), שמחשבת לכל אחד את מקורות ההכנסה שלו.
 */
export function spouseAsClient(client: Client): Client | null {
  const spouse = client.spouse;
  // ‼ 288: בלי מין אין חישוב (נקודת אישה, מסלול הילדים) — לא מנחשים
  if (!spouse || !spouse.gender) return null;
  return {
    ...client,
    id: client.id + '_spouse',
    firstName: spouse.firstName,
    lastName: spouse.lastName,
    idNumber: spouse.idNumber,
    children: childrenFromSpouseView(client.children ?? []),
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
    aliyahMonth: spouse.aliyahMonth ?? null,
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
    // ‼ 288: אלה של בן/בת הזוג עצמם. קודם עברו מבעל/ת הכרטיס דרך ...client — ימי המילואים נספרו פעמיים.
    reserveCombatDaysPrevYear: spouse.reserveCombatDaysPrevYear ?? 0,
    spouseNoIncomeEligible: false,
    idfReleaseMonth: spouse.idfReleaseMonth ?? null,
    serviceMonths: spouse.serviceMonths ?? null,
    paysAlimonyToEx: spouse.paysAlimonyToEx ?? null,
    spouse: null,
  };
}

export function calculateFamilyTax(
  primaryInput: TaxCalcInput,
  taxData: TaxYearData,
): FamilyTaxResult {
  const primaryResult = calculateTax(primaryInput, taxData);
  const { client } = primaryInput;
  const spouse = client.spouse;

  // ‼ נשוי/אה בשנת המס — זוג שנישא אחרי השנה מחושב לשנה הזו כיחיד (utils/familyStatusYear.ts)
  if (!spouse || clientForTaxYear(client, primaryInput.year).familyStatus !== 'married') {
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
  const spouseClient = spouseAsClient(client)!;

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
