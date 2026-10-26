// ─── מה שרשום בביטוח לאומי — בשאלון (בלי מקור) ובמשרד (עם המקור) (26.10.2026) ─────────────────────────────────
// ‼ גיא (26.10): «הוא לא צריך לדעת שזה לפי ביטוח לאומי». אצל הלקוח: «עסק או חשבוניות» מסומן מראש למי שרשום כעצמאי
//   בשנת הדוח ואין לו עסק בכרטיס, ומסך הלימודים ממוקד בתואר למי שרשום כסטודנט — בלי מילה על המקור.
//   אצל המשרד: המקור גלוי («לפי ביטוח לאומי: עצמאי מ-06.2025»), ושתי שורות «לברר» כשהתשובה סותרת את הרישום.
// ‼ רישום ברשות הוא תצפית — לא נכתב לכרטיס ולא גובר על תשובת הלקוח (knownClient.ts). רק מה שחופף לשנת הדוח.
import type { Client, NiOccupation } from '../../types';
import type { SubjectRole, YearFact } from './types';
import { niOccupationsInYear } from '../nationalInsurance/niOccupations';

type Person = 'client' | 'spouse';
const occOf = (c: Client, p: Person): NiOccupation[] => (p === 'spouse' ? c.spouseNiOccupations : c.niOccupations) ?? [];
const he = (iso?: string) => (iso ? `${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
const hasBusiness = (c: Client, p: Person) => (c.businesses ?? []).some(b => !b.isClosed && !!b.belongsToSpouse === (p === 'spouse'));

/** רשום/ה כעצמאי/ת בשנת הדוח (ולא «עצמאי שאינו עונה להגדרה»), ואין עסק בכרטיס ⇒ מאיזה תאריך. */
export function niSelfEmployedSince(c: Client, p: Person, year: number): string | undefined {
  if (hasBusiness(c, p)) return undefined;
  const o = niOccupationsInYear(occOf(c, p), year).find(x => x.type === 'self_employed');
  return o ? (o.fromDate ?? '') : undefined;
}

/** רשום/ה כסטודנט/ית בשנת הדוח ⇒ עד מתי (ריק = בלי סוף ידוע). */
export function niStudentUntil(c: Client, p: Person, year: number): string | undefined {
  const o = niOccupationsInYear(occOf(c, p), year).find(x => x.type === 'student');
  return o ? (o.toDate ?? '') : undefined;
}

const roleOf = (r: SubjectRole): Person | null => (r === 'client' ? 'client' : r === 'spouse' ? 'spouse' : null);
const live = (f: YearFact) => f.status !== 'rejected' && f.status !== 'superseded';
const itemsOf = (v: unknown): Record<string, unknown>[] => {
  const x = v as { items?: unknown } | unknown[] | undefined;
  return Array.isArray(x) ? (x as Record<string, unknown>[]) : Array.isArray((x as { items?: unknown })?.items) ? ((x as { items: Record<string, unknown>[] }).items) : [];
};

export interface NiOfficeCheck { key: string; role: Person; title: string; sub: string }

/**
 * ‼ שתי שורות «לברר» במשרד — רק כשהלקוח כבר ענה, ותשובתו סותרת את הרישום:
 *   · רשום/ה כעצמאי/ת, ובריבוע «עסק או חשבוניות» ענה/תה «לא».
 *   · דיווח/ה על סיום תואר עד שנת הדוח, ובביטוח לאומי עדיין רשום/ה כסטודנט/ית אחרי סוף השנה.
 */
export function niOfficeChecks(c: Client, facts: YearFact[], year: number): NiOfficeCheck[] {
  const out: NiOfficeCheck[] = [];
  const name = (p: Person) => (p === 'spouse' ? c.spouseFirstName || c.spouse?.firstName || 'בן/בת הזוג' : c.firstName || 'הלקוח');
  for (const p of ['client', 'spouse'] as Person[]) {
    const se = niSelfEmployedSince(c, p, year);
    const saidNo = facts.some(f => f.itemKey === 'business.started' && roleOf(f.subjectRole) === p && f.taxYear === year && live(f) && (f.answer === 'no' || f.value === false));
    if (se !== undefined && saidNo) out.push({ key: `niSelfEmployed-${p}`, role: p, title: `לברר עם ${name(p)}: עסק`,
      sub: `רשום/ה כעצמאי/ת בביטוח לאומי${se ? ` מ-${he(se)}` : ''}, ובשאלון סימן/ה שלא` });
    const until = niStudentUntil(c, p, year);
    const finished = facts.some(f => f.itemKey === 'household.studies' && roleOf(f.subjectRole) === p && live(f)
      && itemsOf(f.value).some(r => ['ba', 'ma', 'pro'].includes(String(r.kind ?? '')) && Number(r.year) <= year));
    if (until !== undefined && (until === '' || until > `${year}-12-31`) && finished) out.push({ key: `niStudent-${p}`, role: p, title: `לבדוק מול ביטוח לאומי: ${name(p)}`,
      sub: `סיים/ה תואר, ועדיין רשום/ה כסטודנט/ית${until ? ` עד ${he(until)}` : ''}` });
  }
  return out;
}
