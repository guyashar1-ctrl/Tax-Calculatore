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
import { clientDisplayName, spouseDisplayName, hasRegisteredSpouseChoice, registeredFileInfo } from '../features/annualReport/profile';

/** האם לרשות הזאת יש בכלל שאלת "עבור מי". */
export function authorityHasTargets(a: RepAuthorityKind): boolean {
  return REP_AUTHORITIES_WITH_TARGETS.includes(a);
}

/**
 * עבור מי התבקש הייצוג ברשות. מחזיר תמיד לפחות אדם אחד.
 * ‼ חסר ⇒ `['client']` (ראה כותרת הקובץ).
 *
 * ‼ נפילה-לאחור לביטוח לאומי (31.8): לפני שהצטרף ל-`targets[]`, "עבור מי"
 * היה מבוטא בדגל `coversSpouse`. רשומה ישנה עם הדגל אבל בלי `targets` מתורגמת
 * כאן ל-`['client','spouse']` — כך שהקורא היחיד לא צריך לדעת ששני הביטויים
 * קיימים.
 */
export function targetsOf(areas: AuthorityRepresentations | undefined, a: RepAuthorityKind): RepTarget[] {
  const rec = areas?.[a];
  if (!rec) return [];
  if (!authorityHasTargets(a)) return ['client'];
  const t = rec.targets;
  if (t && t.length) return t;
  if (a === 'nationalInsurance' && rec.coversSpouse) return ['client', 'spouse'];
  return ['client'];
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
  /**
   * "ע״ש יאיר סלע" — על שם מי מתנהל התיק, כשזה כבר אומת. רלוונטי למס הכנסה:
   * הייצוג הוא של התא המשפחתי, אבל התיק יושב על ת.ז. של אחד מבני הזוג, וזה
   * מה שהרו"ח רוצה לראות אחרי שהכריע. ריק ⇒ טרם אומת, ואז לא נוקבים בשם.
   */
  ownerNote?: string;
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
  /** מי בן/בת הזוג הרשום/ה, כשהוכרע. חסר ⇒ לא נוקבים בשם. */
  registeredOwner?: RepTarget,
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
        // הייצוג הוא של התא המשפחתי; התיק יושב על ת.ז. של הרשום/ה.
        ...(married && registeredOwner
          ? { ownerNote: `ע״ש ${targetName(people, registeredOwner)}` }
          : {}),
      });
      continue;
    }
    // ‼ ביטוח לאומי (31.8): אותו מודל בדיוק כמו מע"מ/ניכויים — נופל לענף
    // הגנרי מטה, ש-`targetsOf` כבר יודע לתרגם עבורו גם רשומות ישנות עם
    // `coversSpouse` (ראה targetsOf).
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
    for (const t of targetsOf(areas, a)) {
      if (t === 'spouse' && !married) continue;
      set.add(t);
    }
  }
  return (['client', 'spouse'] as RepTarget[]).filter(t => set.has(t));
}

/**
 * שמות חלק ב' של טופס 2279 — לכל שורה, **בעל התיק שהשורה מייצגת**.
 *
 * ‼ בחלק ב' כל שורה היא צמד: «שם הנישום» מול «מספר תיק במס הכנסה»,
 * «שם העוסק» מול «מספר עוסק במע"מ», «שם המנכה» מול «מספר תיק ניכויים».
 * עד כה שלוש השורות נשאו את שמו של מי שמילא את חלק א' — נכון רק כשכל
 * התיקים שלו. כשתיק המע"מ הוא של בן/בת הזוג, הטופס נשא שם אחד ומספר של
 * אדם אחר.
 *
 * סדר העדיפויות, מהוודאי לפחות ודאי:
 *   1. `docKey` — הטופס הזה נוצר עבור הגשה מסוימת ('vat:spouse'), וזו תשובה.
 *   2. הבעלים של התיק בכרטיס (`tax_files[<רשות>].owner`) — מקור האמת לתיקים.
 *   3. היעד שהתבקש בהיקף, כשהוא יחיד.
 *   4. חסר ⇒ המחולל נופל לשמו של ממלא חלק א', כמו קודם.
 *
 * מס הכנסה נשאר על מחזור בן-הזוג-הרשום: שם רק אימות מול שע״ם קובע.
 */
export function partBPartyNames(
  client: Client | undefined | null,
  areas: AuthorityRepresentations | undefined,
  docKey?: string,
): { taxpayer?: string; dealer?: string; withholder?: string } {
  if (!client) return {};
  const people = peopleFromClient(client);
  const reg = registeredFileInfo(client);

  const ownerOfFile = (authority: 'vat' | 'deductions'): RepTarget | null => {
    const f = (client.taxFiles ?? []).find(x => x.authority === authority);
    if (!f || f.owner === 'joint') return null;
    return f.owner === 'spouse' ? 'spouse' : 'client';
  };

  // ‼ טופס אחד = אדם אחד. כשידוע לאיזה אדם הטופס שייך ('person:spouse'),
  // **כל** שורות חלק ב' הן שלו — זה בדיוק מה שהטופס מתאר.
  const docPerson: RepTarget | null =
    docKey === 'person:spouse' ? 'spouse' : docKey === 'person:client' ? 'client' : null;

  const nameFor = (a: RepAuthorityKind, fileAuthority: 'vat' | 'deductions'): string | undefined => {
    // 1 — הטופס של אדם מסוים
    if (docPerson) return targetName(people, docPerson);
    // 2 — הבעלים של התיק בכרטיס
    const owner = ownerOfFile(fileAuthority);
    if (owner) return targetName(people, owner);
    // 3 — יעד יחיד שהתבקש
    const targets = targetsOf(areas, a);
    if (targets.length === 1) return targetName(people, targets[0]);
    return undefined;
  };

  return {
    // ‼ שורת הנישום: בטופס של אדם מסוים — הוא. אחרת רק כשהרשום אומת; לפני כן
    // אין למערכת דעה מי הרשום (ראה registeredSpouseVerified).
    taxpayer: docPerson ? targetName(people, docPerson)
      : (reg && !reg.unverified ? reg.name : undefined),
    dealer: nameFor('vat', 'vat'),
    withholder: nameFor('withholding', 'deductions'),
  };
}

/**
 * ההגשות בפועל בשע״ם — **אחת לכל אדם**, לא אחת לכל רשות.
 *
 * ‼ הכרעת גיא (2026-08-28): בשע״ם נכנסים עם ת.ז. אחת ומזינים בבת אחת את כל
 * המוסדות של אותו אדם. שתי שורות «מע"מ · יאיר» ו«ניכויים · יאיר» תיארו עבודה
 * שלא קיימת — זו הזנה אחת. כשגם לבן/בת הזוג יש תיקים, זו הזנה שנייה נפרדת
 * על ת.ז. שלו/ה.
 *
 * ‼ זה גם מבנה הטופס: בחלק ב' יש שלוש שורות (מ"ה / מע"מ / ניכויים) על טופס
 * **אחד** — טופס אחד = אדם אחד, עם כל התיקים שלו.
 *
 * מס הכנסה נכנס אצל **בן/בת הזוג הרשום/ה**, כי מספר התיק במ"ה הוא ת.ז. שלו/ה
 * ושם הוא מופיע בשע״ם. כל עוד לא הוכרע מי הרשום — הוא נספר אצל הנישום, וזו
 * בדיוק השאלה שנשאלת בשלב הזה.
 *
 * ביטוח לאומי אינו כאן — מסלול נפרד לגמרי, עם אסמכתאות משלו.
 */
export interface ShaamSubmission {
  /** 'person:client' | 'person:spouse' */
  key: string;
  target: RepTarget;
  personName: string;
  /** המוסדות שנכנסים בהזנה הזאת. */
  authorities: RepAuthorityKind[];
  /** "יאיר סלע" — אצל רווק ריק, כי אין למי להשוות. */
  title: string;
  /** "מס הכנסה, מע\"מ" — מה נכנס בהזנה. */
  authoritiesLabel: string;
  /** ההזנה הזאת נושאת את תיק מס הכנסה של משק הבית. */
  carriesIncomeTax: boolean;
}

export function shaamSubmissions(
  areas: AuthorityRepresentations | undefined,
  people: ScopePeople,
  /** מי בן/בת הזוג הרשום/ה, כשהוכרע. חסר ⇒ מ"ה נספר אצל הנישום. */
  registeredOwner?: RepTarget,
): ShaamSubmission[] {
  const married = people.married;
  const itRequested = !!areas?.incomeTax && areas.incomeTax.status !== 'none';
  const itOwner: RepTarget = married ? (registeredOwner ?? 'client') : 'client';

  const byPerson = new Map<RepTarget, RepAuthorityKind[]>();
  const add = (t: RepTarget, a: RepAuthorityKind) => {
    if (t === 'spouse' && !married) return;
    const cur = byPerson.get(t) ?? [];
    if (!cur.includes(a)) cur.push(a);
    byPerson.set(t, cur);
  };

  if (itRequested) add(itOwner, 'incomeTax');
  for (const a of ['vat', 'withholding'] as RepAuthorityKind[]) {
    const rec = areas?.[a];
    if (!rec || rec.status === 'none') continue;
    for (const t of targetsOf(areas, a)) add(t, a);
  }

  return (['client', 'spouse'] as RepTarget[])
    .filter(t => (byPerson.get(t) ?? []).length > 0)
    .map(t => {
      // סדר קבוע, לא סדר ההוספה
      const auths = REP_AUTHORITY_ORDER.filter(a => (byPerson.get(t) ?? []).includes(a));
      return {
        key: `person:${t}`,
        target: t,
        personName: targetName(people, t),
        authorities: auths,
        title: married ? targetName(people, t) : '',
        authoritiesLabel: auths.map(a => REP_AUTHORITY_LABELS[a]).join(', '),
        carriesIncomeTax: auths.includes('incomeTax'),
      };
    });
}
