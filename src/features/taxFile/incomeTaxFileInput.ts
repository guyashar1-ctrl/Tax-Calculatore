// ─── מספר התיק לקריאה ממס הכנסה ─────────────────────────────────────────────
// בקובץ נפרד מ-authorityAutomation כדי שייבדק בלי לקוח המסד.

import type { Client } from '../../types';
import {
  hasRegisteredSpouseChoice, needsRegisteredSpouseVerification, registeredFileInfo,
} from '../annualReport/profile';

/**
 * ‼ תיק יחיד במס הכנסה = ת.ז. של בן/בת הזוג הרשום/ה, ותהליך הייצוג אינו
 * ממלא את «מספר תיק» — לכן שדה ריק אינו «אין תיק»: נופלים לת.ז. של
 * הרשום/ה. אצל זוג שטרם הוכרע מי רשום — לא מנחשים.
 */
export function incomeTaxFileInput(client: Client): { fileNumber: string } | { blocked: string } {
  const digits = (s: string | undefined) => (s ?? '').replace(/\D/g, '');
  const explicit = digits((client.taxFiles ?? []).find(t => t.authority === 'income_tax')?.fileNumber);
  if (explicit) return { fileNumber: explicit };
  if (hasRegisteredSpouseChoice(client)) {
    const reg = registeredFileInfo(client);
    if (!reg || needsRegisteredSpouseVerification(client)) {
      return { blocked: 'לא סומן מי מבני הזוג רשום במס הכנסה — מסמנים במרכז הייצוג, או ממלאים מספר תיק בכרטיס.' };
    }
    const id = digits(reg.idNumber);
    return id ? { fileNumber: id } : { blocked: `אין מספר תיק במס הכנסה ואין ת.ז. של ${reg.name} בכרטיס.` };
  }
  const id = digits(client.idNumber);
  return id ? { fileNumber: id } : { blocked: 'אין מספר תיק במס הכנסה ואין ת.ז. בכרטיס.' };
}
