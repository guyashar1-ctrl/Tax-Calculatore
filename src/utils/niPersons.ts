// ─── ביטוח לאומי לפי אדם — מי הבעלים של כל שדה בכרטיס הרשות ────────────────
// מקור: docs/PLAN-BTL-PER-PERSON.md §F/§E. עד היום כרטיס ב"ל הציג סט אחד של
// עובדות בלי לומר של מי הן. לזוג נשוי שבו שני בני הזוג מיוצגים — זה אינו
// מספיק. הקובץ הזה הוא הפתרון היחיד: מרכיב "מי שני האנשים בכרטיס הזה, ומה
// העובדות/הקובץ/הייצוג של כל אחד", כדי שרינדור ועריכה לא יצטרכו לפזר את
// אותה החלטה בכמה מקומות.
//
// ‼ פונקציות טהורות בלבד, כמו personRepresentation.ts. שום כתיבה כאן.
// ‼ «אדם» הוא PersonRole ('client'|'spouse') — לא שם, לא מגדר.

import type { Client, NiOccupation, NiTracking, PersonRole, TaxAuthority, TaxFileInfo } from '../types';
import { NI_FACT_KEYS, TAX_FILE_REP_STATUS_LABELS, REP_AREA_STATUS_LABELS } from '../types';
import { targetsOf } from './repScope';
import { resolvePersonAuthority } from './personRepresentation';
import { clientDisplayName, spouseDisplayName } from '../features/annualReport/profile';
import { shortDate } from './clientDerived';

const NI: TaxAuthority = 'national_insurance';

export interface NiPersonFactsValue {
  occupations: NiOccupation[];
  incomeBasisMonthly?: number;
  advanceMonthly?: number;
  balance?: number;
  debitAuthorization?: boolean;
}

export interface NiPerson {
  role: PersonRole;
  /** שם להצגה — לעולם לא "בעל/בת" או מגדר, רק השם או התווית הניטרלית הקיימת. */
  name: string;
  /** ריק = טרם התקבלה ת.ז. — לקריאה/הקשר בלבד, לעולם לא נגזר ממנה מספר תיק. */
  idNumber: string;
  /** מקור הנתונים של האדם הזה: הכרטיס הזה עצמו, או כרטיס בן/בת הזוג המקושר (150). */
  source: { kind: 'own' } | { kind: 'linked'; client: Client };
}

/**
 * שני האנשים שהכרטיס ב"ל צריך להציג. ‼ הלקוח תמיד נוכח. בן/בת הזוג נוכח/ת
 * **רק** כשיש כבר מידע קנוני שמזהה אותו/ה — מצב משפחתי נשוי, בדיוק אותו
 * תנאי שכל שאר תיק המס משתמש בו (`SpouseRelationshipCard`, שורת המשפחה).
 * לא ממציאים בן/בת זוג משדה חסר.
 */
export function niPersons(client: Client, spouseClient?: Client): NiPerson[] {
  const out: NiPerson[] = [
    { role: 'client', name: clientDisplayName(client), idNumber: client.idNumber || '', source: { kind: 'own' } },
  ];
  if (client.familyStatus === 'married') {
    out.push(spouseClient
      ? { role: 'spouse', name: clientDisplayName(spouseClient), idNumber: spouseClient.idNumber || '',
          source: { kind: 'linked', client: spouseClient } }
      : { role: 'spouse', name: spouseDisplayName(client), idNumber: client.spouseIdNumber || '',
          source: { kind: 'own' } });
  }
  return out;
}

/** הכרטיס שבו חמשת השדות התפעוליים של האדם הזה יושבים בפועל, ועם איזה owner. */
function niHome(person: NiPerson, client: Client): { card: Client; owner: 'client' | 'spouse' } {
  if (person.role === 'client') return { card: client, owner: 'client' };
  if (person.source.kind === 'linked') return { card: person.source.client, owner: 'client' };
  return { card: client, owner: 'spouse' };
}

/**
 * חמשת עובדות הב"ל של אדם אחד. ‼ לא מוסק כלום: אדם ללא כרטיס משלו קורא
 * את המפתחות המקבילים על הכרטיס הראשי (`spouseNi*`), ואדם עם כרטיס מקושר
 * קורא **מהכרטיס שלו/ה עצמו/ה** — לא מעתיקים, רק קוראים דרך הקישור, בדיוק
 * כמו תיק מס הכנסה המשותף (`resolveIncomeTaxHousehold`).
 */
export function niFactsOf(person: NiPerson, client: Client): NiPersonFactsValue {
  const { card, owner } = niHome(person, client);
  const keys = NI_FACT_KEYS[owner];
  const c = card as unknown as Record<string, unknown>;
  return {
    occupations: (c[keys.occupations] as NiOccupation[] | undefined) ?? [],
    incomeBasisMonthly: c[keys.incomeBasisMonthly] as number | undefined,
    advanceMonthly: c[keys.advanceMonthly] as number | undefined,
    balance: c[keys.balance] as number | undefined,
    debitAuthorization: c[keys.debitAuthorization] as boolean | undefined,
  };
}

/**
 * מפתחות ה-Client שהעובדות של האדם הזה יושבות בהם. ‼ כתיבה תמיד יעד אחד:
 * העריכה קיימת רק כש-`niEditable` אמת, ואז `niHome` תמיד `client` עצמו
 * (owner='client' ללקוח, owner='spouse' לבן/בת זוג שאינו כרטיס) — אף
 * עריכה כאן לעולם לא כותבת לכרטיס בן/בת הזוג המקושר.
 */
export function niFieldKeys(person: NiPerson, client: Client): Record<keyof NiPersonFactsValue, keyof Client & string> {
  const { owner } = niHome(person, client);
  return NI_FACT_KEYS[owner];
}

/** מספר תיק הב"ל של האדם הזה — נגזר מ-taxFiles[owner], לעולם לא מת.ז. */
export function niFileOf(person: NiPerson, client: Client): TaxFileInfo | undefined {
  const { card, owner } = niHome(person, client);
  return (card.taxFiles ?? []).find(f => f.authority === NI && f.owner === owner);
}

/**
 * האם האדם הזה עורך/ת "כאן" — הלקוח תמיד, בן/בת הזוג רק כשאין כרטיס מקושר.
 * אדם מקושר עורך את עצמו/ה בכרטיס שלו/ה, לא כאן (מקור אמת אחד).
 */
export function niEditable(person: NiPerson): boolean {
  return person.source.kind === 'own';
}

/** מסלולי הביצוע של שני האנשים בבקשת הייצוג — `execution.nationalInsurance`/`.nationalInsuranceSpouse`. */
export interface NiExecutionByRole {
  client?: NiTracking;
  spouse?: NiTracking;
}

export type NiRepresentationKind = 'active' | 'pending' | 'elsewhere' | 'none' | 'unknown';

export interface NiRepresentationLine {
  v: string;
  tone?: 'ok';
  represented: boolean;
  kind: NiRepresentationKind;
  /** פירוט קצר לצירוף לערך (אסמכתא/מועד/"טרם הוזן") — לא שורה נפרדת. */
  detail?: string;
}

const unknownOrNone = (person: NiPerson): NiRepresentationLine =>
  (person.idNumber
    ? { v: 'אין ייצוג', represented: false, kind: 'none' }
    : { v: '—', represented: false, kind: 'unknown' });

/**
 * שורת "ייצוג" של אדם אחד בכרטיס ב"ל. ‼ לא ממציא שדה: משתמש בארבעה
 * מקורות קיימים, לפי הסדר שנקבע ב-docs/PLAN-BTL-ADD-SPOUSE-REPRESENTATION.md §1/§6 —
 *   1. taxFiles[national_insurance, owner=X].repStatus='active' — ראיה
 *      ישירה על הכרטיס-הבית של האדם (`niHome`).
 *   2. מסלול הביצוע של התפקיד הזה (`execution.nationalInsurance[Spouse]`) —
 *      confirmedAt ⇒ פעיל; referenceNumber/enteredAt ⇒ בתהליך, עם פירוט
 *      כן ולא ממציא "ההוראות נשלחו" שלא קרה.
 *   3. taxFiles[...].repStatus='pending' — נוצרה שורה, טרם הוזן בפורטל.
 *   4. authorityRepresentations.nationalInsurance על אותו כרטיס-בית —
 *      ‼ 'active' ברמת-הרשומה נספר כפעיל **רק** כשהיא ממוקדת אדם אחד
 *      בלבד (targets=[owner], בלי עוד יעד). רשומה עם שני יעדים ו-status
 *      'active' אינה ראיה פר-אדם — "מישהו אושר" אינו "האדם הזה אושר".
 *      אותו מקור בלי ראיה ישירה ⇒ "בתהליך", אף פעם לא "פעיל" מנוחש.
 *   5. `resolvePersonAuthority` — כשהייצוג הושג דרך **הכרטיס השני** (בן/בת
 *      הזוג המקושר/ת ביקש/ה גם עבור האדם הזה).
 *   6. `spouseRepresentedElsewhere` — בן/בת זוג עם עסק אצל רו״ח אחר.
 * שישה מקורות שכבר קיימים; הפונקציה הזו רק בוחרת מהם עבור אדם ספציפי
 * במקום "מישהו בכרטיס", ולעולם לא מדלגת ישר ל"פעיל" בלי ראיה ישירה.
 */
export function niRepresentationOf(
  person: NiPerson, client: Client, spouseClient?: Client, niExecution?: NiExecutionByRole,
): NiRepresentationLine {
  const { card, owner } = niHome(person, client);
  const file = (card.taxFiles ?? []).find(f => f.authority === NI && f.owner === owner);

  if (file?.repStatus === 'active') {
    return { v: TAX_FILE_REP_STATUS_LABELS.active, tone: 'ok', represented: true, kind: 'active' };
  }

  const track = person.role === 'spouse' ? niExecution?.spouse : niExecution?.client;
  if (track?.confirmedAt) {
    return { v: TAX_FILE_REP_STATUS_LABELS.active, tone: 'ok', represented: true, kind: 'active' };
  }
  if (track?.referenceNumber) {
    const deadline = track.deadline ? ` · עד ${shortDate(track.deadline)}` : '';
    return { v: 'בתהליך', represented: true, kind: 'pending', detail: `אסמכתא ${track.referenceNumber}${deadline}` };
  }
  if (track?.enteredAt) {
    return { v: 'בתהליך', represented: true, kind: 'pending', detail: 'הוזן בביטוח לאומי · ממתין לאסמכתא' };
  }

  if (file) {
    return {
      v: TAX_FILE_REP_STATUS_LABELS[file.repStatus],
      represented: file.repStatus !== 'none',
      kind: file.repStatus === 'pending' ? 'pending' : 'none',
      detail: file.repStatus === 'pending' ? 'טרם הוזן בביטוח לאומי' : undefined,
    };
  }

  const rec = card.authorityRepresentations?.nationalInsurance;
  const targets = targetsOf(card.authorityRepresentations, 'nationalInsurance');
  if (rec && rec.status !== 'none' && targets.includes(owner)) {
    if (rec.status === 'active' && targets.length === 1) {
      return { v: REP_AREA_STATUS_LABELS.active, tone: 'ok', represented: true, kind: 'active' };
    }
    return { v: 'בתהליך', represented: true, kind: 'pending', detail: 'טרם הוזן בביטוח לאומי' };
  }

  // ‼ הושג דרך הכרטיס השני: ללקוח — דרך spouseClient המקושר; לבן/בת זוג
  // מקושר/ת — דרך client (ההפוך, כמו spousePersonAuthorities).
  const viaOther = person.role === 'client'
    ? resolvePersonAuthority(client, spouseClient ?? null, 'nationalInsurance')
    : person.source.kind === 'linked'
      ? resolvePersonAuthority(person.source.client, client, 'nationalInsurance')
      : null;
  if (viaOther?.represented && viaOther.source === 'spouse') {
    return {
      v: REP_AREA_STATUS_LABELS[viaOther.status], tone: viaOther.status === 'active' ? 'ok' : undefined,
      represented: true, kind: viaOther.status === 'active' ? 'active' : 'pending',
    };
  }

  if (person.role === 'spouse' && person.source.kind === 'own' && client.spouseRepresentedElsewhere) {
    return { v: 'מיוצג/ת אצל רו״ח אחר', represented: false, kind: 'elsewhere' };
  }

  return unknownOrNone(person);
}

export interface NiRepresentationAction {
  kind: 'add' | 'continue';
  label: string;
}

/**
 * הפעולה שמוצעת ליד שורת "ייצוג" — אותה החלטה גם בכרטיס ב"ל וגם בדגל
 * "דורש טיפול" (docs/PLAN-BTL-ADD-SPOUSE-REPRESENTATION.md §6/§10).
 * ‼ 'add' הוא **תיקון ממוקד על הכרטיס בלבד**: מוסיף target + טיוטת
 * taxFiles, לא נוגע בבקשה, לא פותח קליטה כללית, לא יוצר טוקן. זמין רק
 * כשיש כבר בקשת ייצוג ללקוח (`client.representationStatus`) — בלעדיה
 * "להוסיף" אין למה, וזה מקרה אחר (פתיחת ייצוג חדש) שלא נפתר כאן.
 * ‼ אדם מקושר (`!niEditable`) לעולם לא מקבל פעולה — מקור האמת אצלו/ה.
 */
export function niRepresentationAction(
  person: NiPerson, client: Client, line: NiRepresentationLine,
): NiRepresentationAction | null {
  if (!niEditable(person)) return null;
  if (line.kind === 'active' || line.kind === 'elsewhere') return null;
  if (line.represented) return { kind: 'continue', label: 'המשך במרכז הייצוג' };
  if (!client.representationStatus) return null;
  return { kind: 'add', label: 'בקש ייצוג' };
}
