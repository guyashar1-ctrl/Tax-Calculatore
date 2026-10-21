// ─── תיק המס: השורה האחת בראש התיק (21.10.2026) ─────────────────────────────
// ‼ 21.10.2026 (גיא, «מה זה זהות ורשויות?»; ההמחשה המאושרת 2026-10-21-office-request-and-tax-file.html):
//   כרטיס המשפט וכרטיס בן/בת הזוג — שורה אחת: «שכיר · נשוי לרחל · תיק משותף, רשום על דוד».
//   ‼ בלי לוכסנים: הניסוח לפי מגדר הכרטיס; מגדר לא ידוע — ניסוח ניטרלי. ‼ בלי «ממתי? טרם נרשם»:
//   שנה חסרה מוצגת «חסר» בסעיף המשפחה, לא במשפט.

import type { Client, FamilyStatus } from '../../types';
import type { IncomeTaxHouseholdState } from '../../utils/personRepresentation';
import { cardDealerKind, DEALER_KIND_LABELS } from './editModel';
import { registeredFileInfo, spouseNameOnCard } from '../annualReport/profile';

type G = 'male' | 'female' | 'neutral';
const genderOf = (c: Pick<Client, 'gender'>): G => (c.gender === 'male' || c.gender === 'female' ? c.gender : 'neutral');

const STATUS: Record<FamilyStatus, Record<G, string>> = {
  married: { male: 'נשוי', female: 'נשואה', neutral: 'בנישואין' },
  single: { male: 'רווק', female: 'רווקה', neutral: 'ללא בן או בת זוג' },
  divorced: { male: 'גרוש', female: 'גרושה', neutral: 'אחרי גירושין' },
  widowed: { male: 'אלמן', female: 'אלמנה', neutral: 'אחרי התאלמנות' },
  singleParent: { male: 'הורה יחיד', female: 'הורה יחידה', neutral: 'הורה יחיד' },
};

const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? '';

/** «נשוי לרחל» · «נשואה» · «רווקה» — בלי לוכסן, בלי שנה. */
export function familyPhrase(c: Pick<Client, 'familyStatus' | 'gender' | 'spouseFirstName' | 'spouseLastName' | 'spouseName' | 'spouse'>): string {
  const word = STATUS[c.familyStatus]?.[genderOf(c)] ?? '';
  if (c.familyStatus !== 'married') return word;
  const name = firstName(c.spouseFirstName?.trim() || spouseNameOnCard(c as Client));
  return name ? `${word} ל${name}` : word;
}

/** סוג ההכנסה — אותו סדר כמו resolve_client_kind בשרת (סוג העוסק קודם). */
export function incomeLead(c: Client): string {
  const kind = cardDealerKind(c);
  if (kind) return `${DEALER_KIND_LABELS[kind]}${c.businessDescription ? ` (${c.businessDescription})` : ''}`;
  return c.incomeTaxType === 'employee' ? 'שכיר'
    : c.incomeTaxType === 'selfEmployed' ? 'עצמאי'
    : c.incomeTaxType === 'both' ? 'שכיר ועצמאי'
    : c.incomeTaxType === 'rentalOnly' ? 'הכנסות משכירות'
    : 'הכנסות פסיביות';
}

/** «תיק משותף, רשום על דוד» · «לרחל רו״ח אחר» · '' */
export function householdPhrase(c: Client, household: IncomeTaxHouseholdState): string {
  if (c.familyStatus !== 'married') return '';
  if (household.represented && household.holderClient) {
    const reg = registeredFileInfo(household.holderClient);
    // ‼ 21.10.2026: «רשום על» רק כשהוכרע — אחרת זה ניחוש על אדם מסוים
    return reg && !reg.unverified && reg.name ? `תיק משותף, רשום על ${firstName(reg.name)}` : 'תיק משותף';
  }
  if (!c.spouseClientId && c.spouseRepresentedElsewhere) {
    const name = firstName(spouseNameOnCard(c));
    return name ? `ל${name} רו״ח אחר` : 'בן או בת הזוג אצל רו״ח אחר';
  }
  return '';
}

export function taxFileHeadline(c: Client, household: IncomeTaxHouseholdState): string {
  return [incomeLead(c), familyPhrase(c), householdPhrase(c, household)].filter(Boolean).join(' · ');
}
