// ─── אנשי קשר — מי שאינו לקוח ואינו ליד (224) ───────────────────────────────
// רו״ח אחר, עו״ד, יועץ פנסיוני, מנהל/ת חשבונות… שם, תפקיד, איפה עובד/ת, מייל וטלפון.
// ‼ מטרה אחת (גיא, 07.10.2026): «בפעם הבאה אוכל לקבוע איתו פגישה הרבה יותר מהר».
//   לכן: מייל אחד = איש קשר אחד (אינדקס ייחודי בשרת), חיפוש לפי שם/תפקיד/מקום עבודה,
//   ו«קבע פגישה» מכל איש קשר. הקישור ללקוחות (SPEC §2.3) — בהמשך, לא כאן.

import { squash, normalizePhone, normalizeEmail } from '../../utils/identity';

export interface Contact {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  role?: string;
  organization?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** מגירה של איש קשר חדש — חיה בכתובת (‎#/clients/p/new-contact‎) כמו כל תצוגה מהירה. */
export const NEW_CONTACT_ID = 'new-contact';

/** הצעות לתפקיד — טקסט חופשי, כמו «אנשי קשר נוספים» בכרטיס הלקוח. */
export const CONTACT_ROLE_SUGGESTIONS = [
  'רו״ח', 'עו״ד', 'יועץ/ת מס', 'מנהל/ת חשבונות', 'יועץ/ת פנסיוני/ת', 'סוכן/ת ביטוח', 'בנקאי/ת', 'שמאי/ת',
] as const;

export function contactFromDb(r: Record<string, any>): Contact {
  return {
    id: r.id,
    fullName: r.full_name ?? '',
    email: r.email ?? undefined,
    phone: r.phone ?? undefined,
    role: r.role ?? undefined,
    organization: r.organization ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at ?? undefined,
    updatedAt: r.updated_at ?? undefined,
  };
}

/** ‼ ריק ⇒ NULL מפורש, כדי שניקוי שדה בטופס באמת יימחק (כמו leadToDb). מייל — באותיות קטנות. */
export function contactToDb(c: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const put = (k: string, v: string | undefined) => { out[k] = v && v.trim() ? v.trim() : null; };
  if ('fullName' in c) out.full_name = (c.fullName ?? '').trim();
  if ('email' in c) out.email = c.email && c.email.trim() ? normalizeEmail(c.email) : null;
  if ('phone' in c) put('phone', c.phone);
  if ('role' in c) put('role', c.role);
  if ('organization' in c) put('organization', c.organization);
  if ('notes' in c) put('notes', c.notes);
  return out;
}

/** «רו״ח · אברהם ושות׳» — שורת המשנה בכל מקום שאיש קשר מופיע. */
export function contactSubtitle(c: Pick<Contact, 'role' | 'organization'>): string {
  return [c.role?.trim(), c.organization?.trim()].filter(Boolean).join(' · ');
}

export function contactInitials(name: string): string {
  const w = name.split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? '') + (w[1]?.[0] ?? '')) || '?';
}

/** חיפוש לפי שם, תפקיד, מקום עבודה, מייל או טלפון — אותה השוואה כמו ברשימת האנשים. */
export function searchContacts(list: Contact[], query: string): Contact[] {
  const q = query.trim();
  const sorted = [...list].sort((a, b) => a.fullName.localeCompare(b.fullName, 'he'));
  if (!q) return sorted;
  const n = squash(q);
  const phone = normalizePhone(q);
  return sorted.filter(c => {
    const hay = [c.fullName, c.role, c.organization, c.email, c.notes].map(squash);
    return hay.some(h => h.includes(n)) || (phone.length >= 3 && normalizePhone(c.phone).includes(phone));
  });
}

/** איש קשר אחר עם אותו מייל — לפני שמירה, כדי לומר «כבר שמור» ולא ליפול על השרת. */
export function duplicateContact(list: Contact[], email: string | undefined, exceptId?: string): Contact | undefined {
  const e = normalizeEmail(email);
  if (!e) return undefined;
  return list.find(c => c.id !== exceptId && normalizeEmail(c.email) === e);
}
