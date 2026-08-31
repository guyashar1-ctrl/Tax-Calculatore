// ─── בדיקת כפילות בזמן יצירת אדם ──────────────────────────────────────────────
// שלב 3: אין מיזוג, אין RPC — בדיקה בצד הלקוח מול הרשימה שכבר בזיכרון. זה
// מספיק ליצירה ידנית של רו"ח אחד (לא זירת כתיבה בו-זמנית, לא טופס ציבורי).
// אותם נירמולים כמו החיפוש בספרייה (utils/identity.ts) — כדי ששני המנגנונים
// לעולם לא יחלקו על "האם זה אותו אדם".

import type { Client } from '../types';
import { normalizeIdNumber, normalizePhone, normalizeEmail } from './identity';

export type DuplicateMatch =
  | { kind: 'exact'; client: Client }
  | { kind: 'probable'; client: Client }
  /**
   * הת.ז. שהוקלדה תואמת ל-spouseIdNumber על כרטיס קיים — כלומר האדם שנוצר
   * עכשיו כבר "קיים" כבן/בת זוג של מישהו. לא כפילות במשמעות הרגילה
   * (אין עדיין כרטיס משלו/ה), אלא הזדמנות לקשר. לעולם לא חוסם.
   */
  | { kind: 'spouse_of'; client: Client };

export interface DuplicateCheckInput {
  idNumber?: string;
  phone?: string;
  email?: string;
}

/**
 * ת"ז זהה לכרטיס קיים ⇒ חוסמים (אותו אדם, בטעות פעם שנייה).
 * ת"ז זהה ל-spouseIdNumber על כרטיס קיים ⇒ **לא** חוסמים — מציעים קישור
 * (ראה `spouse_of` למעלה). SPEC.md §"קישור אוטומטי": "לא מחייב — רק מציע".
 * אימייל/טלפון תואמים בלי ת"ז תואמת ⇒ מזהירים בלבד — אפשר שזה בן משפחה
 * על אותו טלפון, או טעות הקלדה.
 */
export function findDuplicateMatch(clients: Client[], input: DuplicateCheckInput): DuplicateMatch | null {
  const id = normalizeIdNumber(input.idNumber);
  if (id) {
    const exact = clients.find(c => normalizeIdNumber(c.idNumber) === id);
    if (exact) return { kind: 'exact', client: exact };
    const asSpouse = clients.find(c => !!c.spouseIdNumber && normalizeIdNumber(c.spouseIdNumber) === id);
    if (asSpouse) return { kind: 'spouse_of', client: asSpouse };
  }
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const probable = clients.find(c =>
    (!!email && normalizeEmail(c.email) === email) ||
    (!!phone && phone.length >= 7 && normalizePhone(c.phone) === phone));
  return probable ? { kind: 'probable', client: probable } : null;
}
