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
  /**
   * ‼ 234: רק תעודה מהסוג הזה מספקת את הדרישה (ערכת עסק חדש: ת.ז. וגם רישיון).
   * בלי הדגל — כל צילום של האדם מספק, כמו קודם.
   */
  exact?: boolean;
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
/**
 * ‼ 234 (גיא, 12.10.2026): עסק חדש שהמשרד פותח ⇒ מבעל העסק צילום תעודת זהות **וגם**
 * רישיון נהיגה — אלא אם סימן במפורש «אין לי רישיון נהיגה». בן/בת הזוג — כמו קודם.
 */
export interface IdentityKitOptions {
  newBusinessKit?: boolean;
  noLicense?: Partial<Record<RepTarget, boolean>>;
}

export function identityRequirements(
  areas: AuthorityRepresentations | undefined,
  people: ScopePeople,
  secondaryByPerson: Partial<Record<RepTarget, OnboardingSecondaryType>>,
  kit?: IdentityKitOptions,
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
  const base = (['client', 'spouse'] as RepTarget[])
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
  if (!kit?.newBusinessKit) return base;
  return base.flatMap((r): IdentityRequirement[] => r.person !== 'client' ? [r] : [
    { ...r, kind: 'idCard', prompt: `צילום ${IDENTITY_DOC_LABELS.idCard}`, exact: true },
    ...(kit.noLicense?.client ? [] : [{ ...r, kind: 'driverLicense' as const, prompt: `צילום ${IDENTITY_DOC_LABELS.driverLicense}`, exact: true }]),
  ]);
}

/**
 * ערכת עסק חדש מצד המשרד. ‼ הכרטיס הוא המקור: «עסק חדש - אנחנו פותחים» = businessTransfer false
 * (המחולל מעתיק לשם את מה שסומן בליד). הטופס עצמו מקבל את אותה הכרעה מהשרת (prefill.newBusiness).
 */
export function identityKitFor(
  request: { identification?: { noDriverLicense?: Partial<Record<RepTarget, boolean>> } | null },
  client: { businessTransfer?: boolean } | null | undefined,
): IdentityKitOptions {
  return { newBusinessKit: client?.businessTransfer === false, noLicense: request.identification?.noDriverLicense ?? {} };
}

/** שם הדרישה לשורת משרד: בערכה — גם איזו תעודה («יוסי - רישיון נהיגה»). */
export const identityReqName = (r: IdentityRequirement): string =>
  r.exact ? `${r.personName} - ${IDENTITY_DOC_LABELS[r.kind]}` : r.personName;

/** מפתח יציב לדרישה — אדם + סוג (בערכת עסק חדש יש שתי דרישות לאותו אדם). */
export const identityReqKey = (r: Pick<IdentityRequirement, 'person' | 'kind'>): string => `${r.person}:${r.kind}`;

/** מה שהועלה ומספק את הדרישה הזו. */
export function docsForRequirement(r: IdentityRequirement, uploaded: IdentityDocsMap | undefined) {
  const all = uploaded?.[r.person] ?? [];
  return r.exact ? all.filter(d => d.docKind === r.kind) : all;
}

/** מה שכבר הועלה, לפי אדם. */
export type IdentityDocsMap = Partial<Record<RepTarget, { documentId: string; docKind: string; fileName?: string }[]>>;

export function missingIdentity(
  reqs: IdentityRequirement[],
  uploaded: IdentityDocsMap | undefined,
): IdentityRequirement[] {
  return reqs.filter(r => docsForRequirement(r, uploaded).length === 0);
}
