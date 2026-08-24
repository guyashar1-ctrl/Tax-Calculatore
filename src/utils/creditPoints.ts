// ─────────────────────────────────────────────────────────────────────────────
// מנוע נקודות זיכוי — לפי הדין בתוקף לשנות המס 2025–2026
// מקורות: לוחות העזר הרשמיים של רשות המסים 2025/2026, כל-זכות,
//          חוק סיוע להורים לילדים עד גיל שלוש התשפ"ד-2024 (טבלת הילדים),
//          סעיפים 34, 36, 36א, 39א, 39ב, 40, 40א, 40ג, 40ד, 45, 66 לפקודה.
// אומת מול המקורות ביולי 2026.
// ─────────────────────────────────────────────────────────────────────────────

import { CreditPointLine, Gender } from '../types';

// ─── פרופיל הנישום לצורך נקודות זיכוי ───────────────────────────────────────

export interface CreditChild {
  birthYear: number;
  /** ילד נטול יכולת (סעיף 45) — 2 נקודות, ללא קשר לאחוז נכות */
  hasDisability?: boolean;
}

export type ParentRole =
  | 'allowanceParent'   // ההורה שמקבל קצבת ילדים / הילדים בחזקתו ("מסלול האם")
  | 'otherParent';      // ההורה השני ("מסלול האב")

export type DegreeKind = 'bachelor' | 'master' | 'phdDirect' | 'medicine' | 'vocational';

export interface DegreeInfo {
  kind: DegreeKind;
  /** שנת סיום הלימודים (קבלת הזכאות לתואר/תעודה) */
  endYear: number;
  /** מספר שנות הלימוד בפועל (ברירת מחדל: 3 לתואר ראשון, 2 לשני) */
  studyYears?: number;
}

export interface ServiceInfo {
  kind: 'military' | 'national';
  /** חודשי שירות בפועל */
  months: number;
  /** חודש השחרור בפורמט YYYY-MM. אם ידועה שנה בלבד — הניחו ינואר */
  releaseYear: number;
  releaseMonth?: number; // 1–12, ברירת מחדל 1
}

export interface CreditProfile {
  year: number;
  gender: Gender;
  /** נשוי/אה */
  isMarried?: boolean;

  // ── ילדים ──
  children: CreditChild[];
  parentRole?: ParentRole;
  /** "הורה אחד" — ההורה השני נפטר או אינו רשום (סעיף 40(ב)(1ב)) */
  isSoleParent?: boolean;
  /** גרוש/פרוד המשתתף בכלכלת ילדיו (כולל מזונות לילדים) */
  participatesInChildSupport?: boolean;
  /** נשוי/אה בשנית ומשלם/ת מזונות לבן/בת זוג לשעבר (סעיף 40א) */
  paysAlimonyToEx?: boolean;
  /** אם שדחתה נקודת זיכוי משנת הלידה לשנה שאחריה (טופס 116ד) */
  deferredBirthYearPoint?: boolean;

  // ── עלייה ──
  isNewImmigrant?: boolean;
  aliyahYear?: number;
  aliyahMonth?: number; // 1–12, ברירת מחדל 1

  // ── שירות ──
  service?: ServiceInfo;
  /** ימי מילואים כלוחם בשנה הקודמת (סעיף 39ב, מ-2026) */
  reserveCombatDaysPrevYear?: number;

  // ── השכלה ──
  degrees?: DegreeInfo[];

  // ── בן/בת זוג ──
  /** בן/בת זוג ללא הכנסות, כאשר אחד מבני הזוג בגיל פרישה או עיוור/נכה (סעיף 37) */
  spouseNoIncomeEligible?: boolean;

  // ── נכות (לא נקודות — פטור 9(5), מוחזר בנפרד) ──
  /** עיוור/ת או נכה 100% (או 90%+ משוקלל) לתקופה של 185 ימים ומעלה */
  qualifiesForDisabilityExemption?: boolean;
  /** זכאי תגמול לפי חוק הנכים (צה"ל) או חוק נפגעי פעולות איבה — תקרה מוגדלת */
  isPreferentialDisabled?: boolean;
  /** הנכות נקבעה ל-365 ימים ומעלה (אחרת פטור מוקטן) */
  disabilityFullYear?: boolean;
}

export interface DisabilityExemptionInfo {
  eligible: boolean;
  /** תקרת פטור על הכנסה מיגיעה אישית */
  personalExertionCeiling: number;
  /** תקרת פטור על הכנסה שלא מיגיעה אישית */
  otherIncomeCeiling: number;
  explanation: string;
}

export interface CreditPointsResult {
  lines: CreditPointLine[];
  totalPoints: number;
  totalValueNIS: number;
  /** פטור נכה/עיוור 9(5) — מנגנון נפרד מנקודות זיכוי */
  disabilityExemption?: DisabilityExemptionInfo;
  /** אזהרות מקצועיות (למשל: טפסים נדרשים) */
  notes: string[];
}

// תקרות פטור 9(5) — זהות ב-2025/2026 (הקפאת הצמדה); לוח עזר רשמי
const DISABILITY_CEILING_REGULAR = 445_200;
const DISABILITY_CEILING_PREFERENTIAL = 684_000;
const DISABILITY_CEILING_PARTIAL_YEAR = 81_960;
const DISABILITY_CEILING_OTHER_INCOME = 81_960;

// ─── טבלת ילדים (2024 ואילך — קבוע בפקודה) ─────────────────────────────────
// נקודות לכל הורה לכל ילד, לפי גיל הילד בשנת המס.
function childPoints(age: number, role: ParentRole, deferred: boolean): { pts: number; label: string } | null {
  if (age < 0 || age > 18) return null;
  if (age === 0) return { pts: deferred && role === 'allowanceParent' ? 1.5 : 2.5, label: 'שנת לידה' };
  if (age <= 2) return { pts: 4.5, label: `גיל ${age}` };
  if (age === 3) return { pts: 3.5, label: 'גיל 3' };
  if (age <= 5) return { pts: 2.5, label: `גיל ${age}` };
  if (age <= 17) return { pts: role === 'allowanceParent' ? 2 : 1, label: `גיל ${age}` };
  // גיל 18 — שנת ה-18 בלבד, להורה מקבל הקצבה
  return role === 'allowanceParent' ? { pts: 0.5, label: 'שנת גיל 18' } : null;
}

// ─── עולה חדש (סעיף 35) — נקודות לפי חודשי ותק בשנת המס ────────────────────
// שני מסלולים לפי מועד העלייה.
function immigrantPointsForYear(aliyahYear: number, aliyahMonth: number, taxYear: number): number {
  // מספר סידורי של חודש מאז העלייה: 1 = חודש העלייה עצמו
  const firstMonthOfYear = (taxYear - aliyahYear) * 12 + (1 - aliyahMonth) + 1;
  let pts = 0;
  for (let m = 0; m < 12; m++) {
    const monthIdx = firstMonthOfYear + m; // ותק בחודש הקלנדרי הזה
    if (monthIdx < 1) continue;
    if (aliyahYear >= 2022) {
      // 54 חודשים: 1–12 → 1/12; 13–30 → 1/4; 31–42 → 1/6; 43–54 → 1/12
      if (monthIdx <= 12) pts += 1 / 12;
      else if (monthIdx <= 30) pts += 1 / 4;
      else if (monthIdx <= 42) pts += 1 / 6;
      else if (monthIdx <= 54) pts += 1 / 12;
    } else {
      // 42 חודשים: 1–18 → 1/4; 19–30 → 1/6; 31–42 → 1/12
      if (monthIdx <= 18) pts += 1 / 4;
      else if (monthIdx <= 30) pts += 1 / 6;
      else if (monthIdx <= 42) pts += 1 / 12;
    }
  }
  return Math.round(pts * 100) / 100;
}

// ─── חייל משוחרר (סעיף 39א) ─────────────────────────────────────────────────
// שיעור שנתי (1 או 2 נקודות) למשך 36 חודשים מהחודש שאחרי השחרור,
// יחסית לחודשי הזכאות בשנת המס.
function soldierAnnualRate(s: ServiceInfo, gender: Gender): number {
  if (s.kind === 'national') return s.months >= 24 ? 2 : s.months >= 12 ? 1 : 0;
  const fullThreshold = gender === 'female' ? 22 : 23;
  return s.months >= fullThreshold ? 2 : s.months >= 12 ? 1 : 0;
}

function soldierPointsForYear(s: ServiceInfo, gender: Gender, taxYear: number): number {
  const rate = soldierAnnualRate(s, gender);
  if (rate === 0) return 0;
  const relMonth = s.releaseMonth ?? 1;
  // חלון הזכאות: 36 חודשים החל מהחודש שאחרי השחרור
  const windowStart = s.releaseYear * 12 + (relMonth - 1) + 1; // אינדקס חודש אבסולוטי
  const windowEnd = windowStart + 35;
  const yearStart = taxYear * 12;
  const yearEnd = yearStart + 11;
  const overlap = Math.min(windowEnd, yearEnd) - Math.max(windowStart, yearStart) + 1;
  if (overlap <= 0) return 0;
  return Math.round(rate * (overlap / 12) * 100) / 100;
}

// ─── מילואים — לוחמים (סעיף 39ב, החל מ-2026 בגין השנה הקודמת) ──────────────
function reservePoints(days: number, taxYear: number): number {
  if (taxYear < 2026 || days < 30) return 0;
  if (days < 40) return 0.5;
  if (days < 50) return 0.75;
  // מ-50 ימים: 1 נקודה, +0.25 לכל 5 ימים נוספים, עד 4 נקודות
  const extra = Math.floor((days - 50) / 5) * 0.25;
  return Math.min(4, 1 + extra);
}

// ─── תארים ולימודי מקצוע (סעיפים 40ג, 40ד) ─────────────────────────────────
function degreePointsForYear(d: DegreeInfo, taxYear: number): { pts: number; label: string } | null {
  const since = taxYear - d.endYear; // 1 = השנה שאחרי הסיום
  if (since < 1) return null;
  const isNewRule = d.endYear >= 2023;

  switch (d.kind) {
    case 'bachelor': {
      const years = Math.min(d.studyYears ?? 3, 3);
      if (isNewRule) return since <= years ? { pts: 1, label: `תואר ראשון - שנה ${since} מתוך ${years}` } : null;
      return since <= 1 ? { pts: 1, label: 'תואר ראשון - שנה אחת (מסיימי 2014–2022)' } : null;
    }
    case 'master': {
      if (isNewRule) return since <= 2 ? { pts: 0.5, label: `תואר שני - שנה ${since} מתוך 2` } : null;
      return since <= 1 ? { pts: 0.5, label: 'תואר שני - שנה אחת (מסיימי 2014–2022)' } : null;
    }
    case 'phdDirect': {
      if (isNewRule) return since <= 2 ? { pts: 0.5, label: 'דוקטורט במסלול ישיר' } : null;
      return since <= 1 ? { pts: 0.5, label: 'דוקטורט במסלול ישיר' } : null;
    }
    case 'medicine': {
      if (isNewRule) {
        if (since <= 3) return { pts: 1, label: `רפואה - שנה ${since} (נקודה מלאה)` };
        if (since <= 5) return { pts: 0.5, label: `רפואה - שנה ${since} (חצי נקודה)` };
        return null;
      }
      if (since === 1) return { pts: 1, label: 'רפואה - שנה ראשונה' };
      if (since === 2) return { pts: 0.5, label: 'רפואה - שנה שנייה' };
      return null;
    }
    case 'vocational': {
      const years = Math.min(d.studyYears ?? 1, 3);
      if (isNewRule) return since <= years ? { pts: 1, label: `לימודי מקצוע - שנה ${since}` } : null;
      return since <= 1 ? { pts: 1, label: 'לימודי מקצוע - שנה אחת' } : null;
    }
  }
}

// ─── המנוע הראשי ─────────────────────────────────────────────────────────────

export function calcCreditPointsV2(profile: CreditProfile, cpValue: number): CreditPointsResult {
  const lines: CreditPointLine[] = [];
  const notes: string[] = [];
  const year = profile.year;

  const add = (description: string, legalBasis: string, points: number, explanation?: string) => {
    if (points > 0) lines.push({ description, legalBasis, points, valueNIS: Math.round(points * cpValue), explanation });
  };

  // 1. בסיס — תושב ישראל
  add('תושב/ת ישראל', 'סעיפים 34, 36', 2.25, 'כל תושב ישראל: 2 נקודות בסיס + רבע נקודת נסיעות');

  // 2. אישה
  if (profile.gender === 'female') {
    add('תוספת לאישה', 'סעיף 36א', 0.5);
  }

  // 3. ילדים — לפי הטבלה בתוקף מ-2024 (קבוע)
  const role: ParentRole = profile.parentRole
    ?? (profile.gender === 'female' ? 'allowanceParent' : 'otherParent');
  for (const child of profile.children) {
    const age = year - child.birthYear;
    const cp = childPoints(age, role, !!profile.deferredBirthYearPoint);
    if (cp) {
      add(
        `ילד/ה ${child.birthYear} - ${cp.label}`,
        'סעיפים 40(ב), 66(ג)',
        cp.pts,
        role === 'allowanceParent'
          ? 'מסלול ההורה שמקבל/ת קצבת ילדים'
          : 'מסלול ההורה השני',
      );
    }
    if (child.hasDisability) {
      add(
        `ילד/ה נטול/ת יכולת (${child.birthYear})`,
        'סעיף 45',
        2,
        'נקודות קבועות - אינן תלויות באחוז נכות. נדרש טופס 116א או אישור גמלת ילד נכה',
      );
      notes.push('ילד נטול יכולת: רק אחד ההורים מקבל את הנקודות (לבחירתם); הורים פרודים - כל אחד זכאי. חלופה: זיכוי 35% מהוצאות דיור חוץ-ביתי (סעיף 44).');
    }
  }
  if (profile.deferredBirthYearPoint) {
    add('נקודה שנדחתה משנת הלידה (טופס 116ד)', 'סעיף 66(ג)', 1, 'נקודה אחת משנת הלידה של הילד/ה שנדחתה לשנה הנוכחית');
  }

  // 4. מצבים משפחתיים
  if (profile.isSoleParent && profile.children.length > 0) {
    add('הורה אחד (ההורה השני נפטר/אינו רשום)', 'סעיף 40(ב)(1ב)', 1);
    notes.push('"הורה אחד" זכאי גם לשני מסלולי נקודות הילדים (מסלול האם + מסלול הפעוט) - ודא ששני המסלולים סומנו.');
  }
  if (profile.participatesInChildSupport) {
    add('גרוש/פרוד המשתתף בכלכלת ילדיו', 'סעיף 40(ב)(1)', 1, 'נקודה אחת ללא תלות במספר הילדים; נשללת מההורה המשמורן אם נישא מחדש');
  }
  if (profile.paysAlimonyToEx) {
    add('מזונות לבן/בת זוג לשעבר (נשוי/אה בשנית)', 'סעיף 40א', 1);
  }
  if (profile.spouseNoIncomeEligible) {
    add('בן/בת זוג ללא הכנסות (גיל פרישה / עיוור / נכה)', 'סעיף 37', 1,
      'רק לנשואים, וכאשר אחד מבני הזוג הגיע לגיל פרישה או שהוא עיוור/נכה');
  }

  // 5. עולה חדש
  if (profile.isNewImmigrant && profile.aliyahYear) {
    const pts = immigrantPointsForYear(profile.aliyahYear, profile.aliyahMonth ?? 1, year);
    if (pts > 0) {
      const track = profile.aliyahYear >= 2022 ? '54 חודשים (עלייה מ-2022)' : '42 חודשים (עלייה לפני 2022)';
      add(`עולה חדש - מסלול ${track}`, 'סעיף 35', pts,
        'מחושב לפי חודשי ותק בשנת המס. המניין נעצר בשירות סדיר או לימודים');
    }
    if (profile.aliyahYear >= 2025) {
      notes.push('עולים שהגיעו בין 5.11.2025 ל-31.12.2026 עשויים לזכות גם בפטור ממס על הכנסה מיגיעה אישית בישראל (הוראת שעה "עידוד עלייה", תקרת 2026: 600,000 ₪) - בנוסף לנקודות הזיכוי.');
    }
  }

  // 6. חייל/ת משוחרר/ת ושירות לאומי
  if (profile.service) {
    const pts = soldierPointsForYear(profile.service, profile.gender, year);
    if (pts > 0) {
      const rate = soldierAnnualRate(profile.service, profile.gender);
      add(
        profile.service.kind === 'military' ? 'חייל/ת משוחרר/ת' : 'מסיים/ת שירות לאומי-אזרחי',
        'סעיף 39א',
        pts,
        `${rate} נקודות לשנה למשך 36 חודשים מהחודש שאחרי השחרור - חושב יחסית לחודשי הזכאות בשנה זו`,
      );
    }
  }

  // 7. מילואים — לוחמים (מ-2026)
  if (profile.reserveCombatDaysPrevYear && profile.reserveCombatDaysPrevYear > 0) {
    const pts = reservePoints(profile.reserveCombatDaysPrevYear, year);
    if (pts > 0) {
      add(`לוחם/ת מילואים - ${profile.reserveCombatDaysPrevYear} ימים בשנה הקודמת`, 'סעיף 39ב (תיקון 283)', pts,
        'זיכוי חדש מ-2026, לפי ימי מילואים כלוחם בשנה הקודמת');
    } else if (year < 2026) {
      notes.push('נקודות זיכוי ללוחמי מילואים (סעיף 39ב) חלות רק משנת המס 2026 ואילך.');
    }
  }

  // 8. תארים ולימודי מקצוע
  for (const d of profile.degrees ?? []) {
    const r = degreePointsForYear(d, year);
    if (r) add(r.label, d.kind === 'vocational' ? 'סעיף 40ד' : 'סעיף 40ג', r.pts,
      d.endYear >= 2023
        ? 'מסיימי 2023 ואילך: נקודה לכל שנת לימוד (עד 3 שנים לתואר ראשון)'
        : 'מסיימי 2014–2022: שנה אחת בלבד');
  }
  if ((profile.degrees ?? []).length > 0) {
    notes.push('תואר: נדרש טופס 119 + אישור זכאות. במקצועות עם התמחות (רו"ח, עו"ד, רפואה) ניתן לדחות את תחילת ההטבה לשנה שאחרי ההתמחות.');
  }

  // 9. נכות/עיוורון — פטור, לא נקודות
  let disabilityExemption: DisabilityExemptionInfo | undefined;
  if (profile.qualifiesForDisabilityExemption) {
    const ceiling = profile.disabilityFullYear === false
      ? DISABILITY_CEILING_PARTIAL_YEAR
      : profile.isPreferentialDisabled
        ? DISABILITY_CEILING_PREFERENTIAL
        : DISABILITY_CEILING_REGULAR;
    disabilityExemption = {
      eligible: true,
      personalExertionCeiling: ceiling,
      otherIncomeCeiling: DISABILITY_CEILING_OTHER_INCOME,
      explanation:
        `פטור סעיף 9(5) לעיוור/נכה 100% (או 90%+ משוקלל, 185 ימים ומעלה): ` +
        `הכנסה מיגיעה אישית פטורה עד ${ceiling.toLocaleString('he-IL')} ₪ לשנה` +
        (profile.isPreferentialDisabled ? ' (תקרה מוגדלת לזכאי תגמול לפי חוק הנכים/נפגעי איבה)' : '') +
        `; הכנסה אחרת - עד ${DISABILITY_CEILING_OTHER_INCOME.toLocaleString('he-IL')} ₪. ` +
        'זהו פטור על ההכנסה - לא נקודות זיכוי.',
    };
  }

  const totalPoints = Math.round(lines.reduce((s, l) => s + l.points, 0) * 100) / 100;
  return {
    lines,
    totalPoints,
    totalValueNIS: Math.round(totalPoints * cpValue),
    disabilityExemption,
    notes,
  };
}

// ─── זיכוי יישוב מוטב (סעיף 11) — מנגנון נפרד מנקודות זיכוי ─────────────────

export interface SettlementCreditResult {
  credit: number;
  explanation: string;
}

export function calcSettlementCredit(
  ratePercent: number,
  ceilingAnnual: number,
  personalExertionIncome: number,
  settlementName: string,
): SettlementCreditResult {
  const base = Math.min(Math.max(0, personalExertionIncome), ceilingAnnual);
  const credit = base * (ratePercent / 100);
  return {
    credit,
    explanation:
      `תושב/ת ${settlementName}: זיכוי ${ratePercent}% מההכנסה מיגיעה אישית ` +
      `(עד תקרה ${ceilingAnnual.toLocaleString('he-IL')} ₪) = ` +
      `${ratePercent}% × ${Math.round(base).toLocaleString('he-IL')} ₪ = ${Math.round(credit).toLocaleString('he-IL')} ₪. ` +
      'נדרשים 12 חודשי מגורים רצופים, מרכז חיים ביישוב ואישור תושבות (טופס 1312א).',
  };
}
