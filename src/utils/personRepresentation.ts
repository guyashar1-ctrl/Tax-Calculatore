// ─── בעלות על ייצוג חוצה-כרטיסים ──────────────────────────────────────────
//
// מע"מ, ניכויים וביטוח לאומי שייכים ל**אדם**. מס הכנסה שייך ל**זוג**. כשבן/בת
// הזוג הם כרטיס נפרד (`Client.spouseClientId`), ייצוג שהושג בכרטיס אחד נקרא
// מהשני — לא מועתק, ולא מתבקש שוב. ראה docs/PLAN-PERSON-AND-COUPLE-MODEL.md.
//
// ‼ מקור אמת אחד: הכרטיס שביקש בפועל. הכרטיס השני רק **קורא** אותו דרך
// הקישור. אין כאן שום כתיבה — כל הפונקציות בקובץ הזה טהורות.

import type { Client, RepAuthorityKind } from '../types';
import { targetsOf } from './repScope';
import { registeredFileInfo } from '../features/annualReport/profile';

export interface PersonAuthorityState {
  /** קיים ייצוג (בתהליך או פעיל) לרשות הזאת, עבור האדם הזה. */
  represented: boolean;
  status: 'none' | 'in_process' | 'active';
  /** נמצא על הכרטיס עצמו, או נגזר מכרטיס בן/בת הזוג המקושר. */
  source: 'own' | 'spouse' | 'none';
  /** source==='spouse' — הכרטיס שבו הושג הייצוג בפועל. */
  sourceClient?: Client;
}

/**
 * מצב הייצוג של אדם ברשות ברמת-אדם (מע"מ / ניכויים / ביטוח לאומי).
 *
 * ‼ קודם הכרטיס עצמו — הוא ביקש ישירות עבור עצמו. ורק אם אין, ורק כשמקושר,
 * בודקים אם בן/בת הזוג המקושר ביקש את זה **עבורו/ה**: `targets` על הכרטיס
 * השני כוללים 'spouse' מנקודת המבט שלו — כלומר "גם עבור בן/בת הזוג שלי".
 */
export function resolvePersonAuthority(
  client: Client | undefined | null,
  spouseClient: Client | undefined | null,
  authority: RepAuthorityKind,
): PersonAuthorityState {
  const ownRec = client?.authorityRepresentations?.[authority];
  if (ownRec && ownRec.status !== 'none'
    && targetsOf(client?.authorityRepresentations, authority).includes('client')) {
    return { represented: true, status: ownRec.status, source: 'own' };
  }
  const viaSpouseRec = spouseClient?.authorityRepresentations?.[authority];
  if (viaSpouseRec && viaSpouseRec.status !== 'none'
    && targetsOf(spouseClient?.authorityRepresentations, authority).includes('spouse')) {
    return { represented: true, status: viaSpouseRec.status, source: 'spouse', sourceClient: spouseClient ?? undefined };
  }
  return { represented: false, status: 'none', source: 'none' };
}

export interface IncomeTaxHouseholdState {
  represented: boolean;
  /** מי מהשניים מחזיק את `taxFiles[income_tax]` בפועל. */
  holder: 'own' | 'spouse' | 'none';
  holderClient?: Client;
  registeredName?: string;
  registeredVerified: boolean;
}

/**
 * תיק מס הכנסה של הזוג — אחד, לא אחד לכל כרטיס.
 *
 * ‼ נבדק תמיד קודם על הכרטיס עצמו, כדי שכרטיס שכבר מחזיק את התיק לא ייקרא
 * "רק דרך בן/בת הזוג" — הוא המקור, לא הקורא.
 */
export function resolveIncomeTaxHousehold(
  client: Client | undefined | null,
  spouseClient: Client | undefined | null,
): IncomeTaxHouseholdState {
  if (!client) return { represented: false, holder: 'none', registeredVerified: false };
  const ownFile = (client.taxFiles ?? []).find(f => f.authority === 'income_tax');
  if (ownFile) {
    const reg = registeredFileInfo(client);
    return {
      represented: true, holder: 'own', holderClient: client,
      registeredName: reg?.name, registeredVerified: !!reg && !reg.unverified,
    };
  }
  const spouseFile = (spouseClient?.taxFiles ?? []).find(f => f.authority === 'income_tax');
  if (spouseClient && spouseFile) {
    const reg = registeredFileInfo(spouseClient);
    return {
      represented: true, holder: 'spouse', holderClient: spouseClient,
      registeredName: reg?.name, registeredVerified: !!reg && !reg.unverified,
    };
  }
  return { represented: false, holder: 'none', registeredVerified: false };
}

/** בן/בת הזוג ככרטיס, אם כבר קיים ומקושר. */
export function findSpouseClient(
  client: Client | undefined | null,
  clients: Client[],
): Client | undefined {
  if (!client?.spouseClientId) return undefined;
  return clients.find(c => c.id === client.spouseClientId);
}

/**
 * שדות פתיחה לכרטיס חדש שנוצר עבור מי שהיה עד כה "בן/בת הזוג" בלבד —
 * מזרעים מהנתונים שכבר קיימים על הכרטיס המקורי, כדי שלא יוקלדו פעם שנייה.
 *
 * ‼ לא מזרעים תאריך לידה מדויק משנת לידה בלבד (`spouseBirthYear`) — ניחוש
 * תאריך הוא נתון שגוי במסווה של נתון אמיתי. שדה ריק שמחכה למילוי עדיף. אבל
 * `spouse` (Client.spouse) הוא תאריך מלא שכבר הוזן בעבר לחישוב תא משפחתי —
 * זה לא ניחוש, ומזרעים אותו וגם את שאר סיווגי המס/עסק שכבר נאספו שם.
 * שדות כספיים מחושבים (שכר, זיכויים, פנסיה) לא מועברים בכוונה: הם שייכים
 * לחישוב התא הישן כ"מפרנס/ת שני/ה", וכשהופכים לכרטיס עצמאי הם צריכים
 * דו"ח שנתי משלהם, לא מספרים ישנים שיוצגו כמעודכנים.
 */
export function seedClientFromEmbeddedSpouse(owner: Client): Partial<Client> {
  const embedded = owner.spouse;
  const parts = (owner.spouseName || '').trim().split(/\s+/).filter(Boolean);
  const base: Partial<Client> = {
    firstName: owner.spouseFirstName || embedded?.firstName || parts[0] || '',
    lastName: owner.spouseLastName || embedded?.lastName || parts.slice(1).join(' ') || '',
    idNumber: owner.spouseIdNumber || embedded?.idNumber || '',
    email: owner.spouseEmail || '',
    phone: owner.spousePhone || embedded?.phone || '',
    familyStatus: 'married',
    marriageYear: owner.marriageYear,
    spouseName: `${owner.firstName} ${owner.lastName}`.trim(),
    spouseIdNumber: owner.idNumber,
    spouseFirstName: owner.firstName,
    spouseLastName: owner.lastName,
    spouseEmail: owner.email || undefined,
    spousePhone: owner.phone || undefined,
    spouseClientId: owner.id,
  };
  if (embedded) {
    if (embedded.birthDate) base.birthDate = embedded.birthDate;
    base.gender = embedded.gender;
    base.incomeTaxType = embedded.incomeTaxType;
    base.vatStatus = embedded.vatStatus;
    if (embedded.businessDescription) base.businessDescription = embedded.businessDescription;
    base.niType = embedded.niType;
  }
  return base;
}
