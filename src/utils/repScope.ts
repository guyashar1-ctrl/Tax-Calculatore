// ─── היקף הייצוג: איזו רשות, ועבור מי ────────────────────────────────────────
//
// עד כה הייצוג נשאל "אילו רשויות לתא המשפחתי". זה מספיק למס הכנסה (תיק אחד
// למשק הבית) אבל לא למע"מ ולניכויים, שבהם התיק שייך לאדם: ייתכן שרק לבן/בת
// הזוג יש תיק מע"מ, וייתכן שלשניהם — ואז אלה שתי הגשות נפרדות בשע״ם.
//
// ‼ כלל התאימות היחיד, ובמקום אחד: **היעדר `targets` פירושו `['client']`**.
// זו בדיוק המשמעות של כל בקשה שנוצרה עד היום, ולא פרשנות חדשה שמושתלת בהן.
// כל מסך קורא מכאן, כדי שלא תיווצר גרסה שנייה של הכלל.

import type {
  Client, AuthorityRepresentations, RepAuthorityKind, RepTarget, RepresentationRequest,
} from '../types';
import { REP_AUTHORITY_ORDER, REP_AUTHORITY_LABELS, REP_AUTHORITIES_WITH_TARGETS } from '../types';
import { clientDisplayName, spouseDisplayName, hasRegisteredSpouseChoice } from '../features/annualReport/profile';

/** האם לרשות הזאת יש בכלל שאלת "עבור מי". */
export function authorityHasTargets(a: RepAuthorityKind): boolean {
  return REP_AUTHORITIES_WITH_TARGETS.includes(a);
}

/**
 * עבור מי התבקש הייצוג ברשות. מחזיר תמיד לפחות אדם אחד.
 * ‼ חסר ⇒ `['client']` (ראה כותרת הקובץ).
 */
export function targetsOf(areas: AuthorityRepresentations | undefined, a: RepAuthorityKind): RepTarget[] {
  const rec = areas?.[a];
  if (!rec) return [];
  if (!authorityHasTargets(a)) return ['client'];
  const t = rec.targets;
  return t && t.length ? t : ['client'];
}

/**
 * מי שני בני הזוג ואיך קוראים להם. מנותק מ-`Client` בכוונה: חלון הפתיחה
 * מחזיק את השמות ב-state מקומי ועדיין חייב לדבר באותו דקדוק בדיוק.
 */
export interface ScopePeople {
  married: boolean;
  clientName: string;
  /** ריק ⇒ מוצגת התווית הניטרלית «בן/בת הזוג». */
  spouseName: string;
}

export function peopleFromClient(client: Client | undefined | null): ScopePeople {
  if (!client) return { married: false, clientName: 'הלקוח/ה', spouseName: '' };
  return {
    married: hasRegisteredSpouseChoice(client),
    clientName: clientDisplayName(client),
    spouseName: client.spouseName?.trim() ? spouseDisplayName(client) : '',
  };
}

/** השם להצגה של אדם. בן/בת זוג שטרם נמסרו פרטיו ⇒ התווית הניטרלית. */
export function targetName(people: ScopePeople, t: RepTarget): string {
  if (t === 'spouse') return people.spouseName.trim() || 'בן/בת הזוג';
  return people.clientName.trim() || 'הלקוח/ה';
}

export interface ScopeLine {
  authority: RepAuthorityKind;
  /** "מס הכנסה" */
  authorityLabel: string;
  /** "משק הבית" / "מיכל סלע" / "יאיר סלע + מיכל סלע" */
  whoLabel: string;
  /** משק בית = מ"ה. משנה את הצבע/המשקל בתצוגה. */
  household: boolean;
  targets: RepTarget[];
}

/**
 * שורות "מה ביקשנו, ולמי" — הדקדוק האחיד שמלווה את הבקשה מהפתיחה ועד הביצוע.
 *
 * ‼ `areas` הוא ההיקף ההיסטורי מהבקשה; `client` משמש **רק לשמות**, כדי
 * ש"בן/בת הזוג" יתחלף בשם האמיתי אחרי הקליטה. ההיקף עצמו לעולם אינו נגזר
 * מהכרטיס או מהתיקים.
 */
export function scopeLines(
  areas: AuthorityRepresentations | undefined,
  people: ScopePeople,
): ScopeLine[] {
  const out: ScopeLine[] = [];
  for (const a of REP_AUTHORITY_ORDER) {
    const rec = areas?.[a];
    if (!rec || rec.status === 'none') continue;
    if (a === 'incomeTax') {
      // תיק אחד לתא המשפחתי. אצל רווק אין למה לקרוא "משק בית".
      const married = people.married;
      out.push({
        authority: a, authorityLabel: REP_AUTHORITY_LABELS[a],
        whoLabel: married ? 'משק הבית' : targetName(people, 'client'),
        household: married, targets: ['client'],
      });
      continue;
    }
    if (a === 'nationalInsurance') {
      const both = !!rec.coversSpouse && people.married;
      const targets: RepTarget[] = both ? ['client', 'spouse'] : ['client'];
      out.push({
        authority: a, authorityLabel: REP_AUTHORITY_LABELS[a],
        whoLabel: targets.map(t => targetName(people, t)).join(' + '),
        household: false, targets,
      });
      continue;
    }
    const targets = targetsOf(areas, a);
    out.push({
      authority: a, authorityLabel: REP_AUTHORITY_LABELS[a],
      whoLabel: targets.map(t => targetName(people, t)).join(' + '),
      household: false, targets,
    });
  }
  return out;
}

/**
 * ההיקף שיוצג בעמוד הבקשה. הבקשה קודמת תמיד; מרשם הכרטיס הוא נפילה-לאחור
 * לבקשות שנוצרו לפני שההיקף נשמר עליהן.
 */
export function requestScope(
  request: Pick<RepresentationRequest, 'scope'>,
  client: Client | undefined | null,
): AuthorityRepresentations | undefined {
  return request.scope ?? client?.authorityRepresentations;
}

/**
 * כל אדם שנדרש ממנו משהו בבקשה — הבסיס לדרישות הזיהוי המצולם.
 *
 * ‼ לפי אדם ולא לפי רשות: מי שמופיע בשלוש רשויות לא יתבקש להעלות שלוש פעמים
 * את אותה תעודה. מס הכנסה אצל זוג נשוי מכניס את שניהם — שניהם חותמים על
 * טופס 2279.
 */
export function peopleInScope(
  areas: AuthorityRepresentations | undefined,
  people: ScopePeople,
): RepTarget[] {
  const married = people.married;
  const set = new Set<RepTarget>();
  for (const a of REP_AUTHORITY_ORDER) {
    const rec = areas?.[a];
    if (!rec || rec.status === 'none') continue;
    if (a === 'incomeTax') {
      set.add('client');
      if (married) set.add('spouse');   // שני בני הזוג חותמים על ייפוי הכוח
      continue;
    }
    if (a === 'nationalInsurance') {
      set.add('client');
      if (rec.coversSpouse && married) set.add('spouse');
      continue;
    }
    for (const t of targetsOf(areas, a)) {
      if (t === 'spouse' && !married) continue;
      set.add(t);
    }
  }
  return (['client', 'spouse'] as RepTarget[]).filter(t => set.has(t));
}

/**
 * ההגשות בפועל בשע״ם: רשות × אדם. מ"ה הוא הגשה אחת למשק הבית; מע"מ/ניכויים
 * הגשה לכל אדם שביקשנו עבורו. ב"ל אינו כאן — מסלול נפרד לגמרי.
 */
export interface ShaamSubmission {
  key: string;                    // 'incomeTax' | 'vat:spouse' …
  authority: RepAuthorityKind;
  target: RepTarget;
  authorityLabel: string;
  /** "מס הכנסה · משק הבית" / "מע\"מ · מיכל סלע" */
  title: string;
}

export function shaamSubmissions(
  areas: AuthorityRepresentations | undefined,
  people: ScopePeople,
): ShaamSubmission[] {
  const out: ShaamSubmission[] = [];
  const married = people.married;
  for (const a of ['incomeTax', 'vat', 'withholding'] as RepAuthorityKind[]) {
    const rec = areas?.[a];
    if (!rec || rec.status === 'none') continue;
    if (a === 'incomeTax') {
      out.push({
        key: 'incomeTax', authority: a, target: 'client',
        authorityLabel: REP_AUTHORITY_LABELS[a],
        title: married ? 'מס הכנסה · משק הבית' : REP_AUTHORITY_LABELS[a],
      });
      continue;
    }
    for (const t of targetsOf(areas, a)) {
      if (t === 'spouse' && !married) continue;
      out.push({
        key: `${a}:${t}`, authority: a, target: t,
        authorityLabel: REP_AUTHORITY_LABELS[a],
        // אצל רווק אין למי להשוות, ולכן השם רק מוסיף רעש
        title: married ? `${REP_AUTHORITY_LABELS[a]} · ${targetName(people, t)}` : REP_AUTHORITY_LABELS[a],
      });
    }
  }
  return out;
}
