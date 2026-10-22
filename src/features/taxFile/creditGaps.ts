// ─── 288 · מה חסר כדי לחשב זיכוי — לכל אדם · בלי «אפס בשקט» ─────────────────────
// ‼ הכלל (CLAUDE.md §13): נתון שחסר לחישוב נכתב בכרטיס הזיכויים, ולא נעלם מהסכום בלי הסבר.
//   «נכלל לפי הנחה» (חודשי שירות, חודש שחרור) ≠ «לא נכלל» (שנת תואר, שנת עלייה, מין בן/בת הזוג).
import type { Client, SpouseData } from '../../types';

export interface CreditGap {
  /** מה חסר, קצר */
  text: string;
  /** included = נכלל לפי הנחה; excluded = הזיכוי לא נכלל */
  effect: 'included' | 'excluded';
}

type CreditFacts = Pick<SpouseData, 'completedIdf' | 'idfReleaseYear' | 'completedNationalService' | 'nationalServiceYear'
  | 'hasAcademicDegree' | 'academicDegreeYear' | 'isNewImmigrant' | 'aliyahYear'> & { idfReleaseMonth?: number | null; serviceMonths?: number | null };

/** שירות שחלון 36 החודשים שלו נוגע בשנת המס — רק אז חודש/משך משנים את הסכום. */
const serviceRelevant = (releaseYear: number, year: number) => releaseYear > 0 && releaseYear >= year - 3 && releaseYear <= year;

export function personCreditGaps(p: CreditFacts, year: number): CreditGap[] {
  const out: CreditGap[] = [];
  const ry = p.completedIdf ? p.idfReleaseYear : p.completedNationalService ? p.nationalServiceYear : 0;
  if ((p.completedIdf || p.completedNationalService) && !ry) out.push({ text: 'שירות — חסרה שנת השחרור', effect: 'excluded' });
  if (serviceRelevant(ry, year)) {
    if (!p.serviceMonths) out.push({ text: 'שירות — חודשי השירות לא ידועים (הונחו 24)', effect: 'included' });
    if (!p.idfReleaseMonth) out.push({ text: 'שירות — חודש השחרור לא ידוע (הונח ינואר)', effect: 'included' });
  }
  if (p.hasAcademicDegree && !p.academicDegreeYear) out.push({ text: 'תואר — חסרה שנת הסיום', effect: 'excluded' });
  if (p.isNewImmigrant && !p.aliyahYear) out.push({ text: 'עלייה — חסרה שנת העלייה', effect: 'excluded' });
  return out;
}

export function clientCreditGaps(c: Client, year: number): CreditGap[] {
  const out = personCreditGaps(c, year);
  const kids = c.children ?? [];
  if (c.familyStatus === 'divorced' && kids.length && kids.every(k => !k.custody)) {
    out.push({ text: 'ילדים — לא ידוע אצל מי הם גרים (חושב כהורה המשתתף בכלכלה)', effect: 'included' });
  }
  return out;
}

/** בן/בת הזוג: בלי פרטים או בלי מין — הזיכויים שלהם לא מחושבים בכלל. */
export function spouseCreditGaps(c: Client, year: number): CreditGap[] {
  if (c.familyStatus !== 'married') return [];
  const s = c.spouse;
  if (!s) return [{ text: 'אין פרטי זיכוי של בן/בת הזוג', effect: 'excluded' }];
  if (!s.gender) return [{ text: 'בן/בת הזוג — חסר מין', effect: 'excluded' }];
  return personCreditGaps(s, year);
}
