// ─── צילום התעודה: ממי, ואיזו ─────────────────────────────────────────────────
//
// הזנת המספר אינה מספיקה — לרשויות צריך את התעודה עצמה. שתי שאלות נפרדות:
//
//   **איזו תעודה** — לפי אמצעי הזיהוי שהאדם בחר בקליטה:
//     רישיון נהיגה ⇒ צילום רישיון · דרכון ⇒ צילום דרכון
//     ת.ז. הורה    ⇒ ת.ז. או רישיון (ברירת המחדל; אין "צילום ת.ז. של הורה")
//
//   **ממי** — לפי היקף הייצוג שהתבקש, ו**לפי אדם ולא לפי רשות**: מי שמופיע
//   בשלוש רשויות מעלה תעודה פעם אחת. אצל זוג נשוי עם ייצוג במס הכנסה נדרשים
//   שניהם — שניהם חותמים על טופס 2279.
//
// ‼ ביטוח לאומי אינו מוסיף דרישה משלו: התהליך שם אינו מבקש היום צילום, ולא
// נמציא חובה חוקית מהיסק. אם ב"ל הוא הרשות היחידה — אין דרישה.

import type { AuthorityRepresentations, OnboardingSecondaryType, RepTarget } from '../types';
import { REP_AUTHORITY_ORDER } from '../types';
import { targetsOf, type ScopePeople } from './repScope';

export type IdentityDocKind = 'idCard' | 'driverLicense' | 'passport';

export const IDENTITY_DOC_LABELS: Record<IdentityDocKind, string> = {
  idCard: 'תעודת זהות',
  driverLicense: 'רישיון נהיגה',
  passport: 'דרכון',
};

/** מה מבקשים לצלם, לפי אמצעי הזיהוי הנוסף שנבחר. */
export function docKindFor(secondary: OnboardingSecondaryType | undefined): IdentityDocKind {
  if (secondary === 'driverLicense') return 'driverLicense';
  if (secondary === 'passport') return 'passport';
  return 'idCard';
}

/** הכיתוב שמופיע ללקוח — "ת.ז. הורה" אינו תעודה שמצלמים, ולכן שם מותר גם רישיון. */
export function docKindPrompt(kind: IdentityDocKind): string {
  return kind === 'idCard' ? 'צילום תעודת זהות או רישיון נהיגה' : `צילום ${IDENTITY_DOC_LABELS[kind]}`;
}

export interface IdentityRequirement {
  person: RepTarget;
  /** "יאיר סלע" / "בן/בת הזוג" */
  personName: string;
  kind: IdentityDocKind;
  prompt: string;
}

/**
 * מי חייב להעלות צילום, ומה. מחזיר רשימה מסודרת — הנישום ואז בן/בת הזוג.
 *
 * ‼ `secondaryByPerson` מגיע מהטופס עצמו. לבן/בת הזוג לא נשאל אמצעי זיהוי
 * נוסף, ולכן הוא נופל ל-`idCard` — התעודה שכל אדם מחזיק.
 */
export function identityRequirements(
  areas: AuthorityRepresentations | undefined,
  people: ScopePeople,
  secondaryByPerson: Partial<Record<RepTarget, OnboardingSecondaryType>>,
): IdentityRequirement[] {
  const need = new Set<RepTarget>();
  for (const a of REP_AUTHORITY_ORDER) {
    const rec = areas?.[a];
    if (!rec || rec.status === 'none') continue;
    // ראה כותרת הקובץ — ב"ל אינו מוליד דרישת צילום.
    if (a === 'nationalInsurance') continue;
    if (a === 'incomeTax') {
      need.add('client');
      if (people.married) need.add('spouse');  // שניהם חותמים על 2279
      continue;
    }
    for (const t of targetsOf(areas, a)) {
      if (t === 'spouse' && !people.married) continue;
      need.add(t);
    }
  }
  return (['client', 'spouse'] as RepTarget[])
    .filter(t => need.has(t))
    .map(t => {
      const kind = docKindFor(secondaryByPerson[t]);
      return {
        person: t,
        personName: t === 'spouse' ? (people.spouseName.trim() || 'בן/בת הזוג') : (people.clientName.trim() || 'הנישום'),
        kind,
        prompt: docKindPrompt(kind),
      };
    });
}

/** מה שכבר הועלה, לפי אדם. */
export type IdentityDocsMap = Partial<Record<RepTarget, { documentId: string; docKind: string; fileName?: string }[]>>;

export function missingIdentity(
  reqs: IdentityRequirement[],
  uploaded: IdentityDocsMap | undefined,
): IdentityRequirement[] {
  return reqs.filter(r => !(uploaded?.[r.person]?.length));
}
