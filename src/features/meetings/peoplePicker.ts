// ─── «עם מי?» בחלון הפגישה — ההחלטות הטהורות (סבב 3, הדמיה מאושרת 07.10.2026) ───
// ‼ גיא: «לא ברור איפה מכניסים את המייל ואת השם». מכאן: חיפוש אחד על כל מי שכבר ב-PIVO
//   (לקוחות, בני זוג, לידים, אנשים בפנייה, אנשי קשר), ו«+ אדם חדש» עם שם, מייל ושאלה אחת —
//   «מי זה?»: לקוח פוטנציאלי (ליד), איש מקצוע (אנשי קשר), או רק מוזמן (לא נשמר).
// ‼ סוג הפגישה נבחר לבד לפי האדם הראשון — לקוח או איש קשר ⇒ פגישת עבודה; ליד או לקוח
//   פוטנציאלי ⇒ שיחת היכרות (הצילום של גיא: לקוח קיים קיבל «שיחת היכרות»). אפשר לשנות.
// ‼ מה שהשרת עושה עם «מי זה?» — matchPeople ב-_shared/meetingCore.ts. כאן רק מה שהמסך מראה,
//   באותם כללים: אדם נוסף בשיחת היכרות של ליד נשמר בפנייה שלו; אחרת — ליד משלו.

import type { Client } from '../../types';
import type { Lead } from '../../types/quotations';
import { squash } from '../../utils/identity';
import { contactSubtitle, type Contact } from '../contacts/contactModel';
import {
  COMPANION_RELATION_LABELS, DEFAULT_COMPANION_RELATION, type CompanionRelation, type SaveAs,
} from '../../../supabase/functions/_shared/meetingCore';
import {
  extractEmails, suggestNameFromWhatsApp, MEETING_KIND_LABELS, type MeetingKind,
} from '../../../supabase/functions/_shared/meetingInvite';

export type Who = SaveAs;

export const WHO_OPTIONS: readonly { who: Who; label: string; hint: string }[] = [
  { who: 'lead', label: 'לקוח פוטנציאלי', hint: 'נשמר כליד. משם הצעת מחיר והפיכה ללקוח' },
  { who: 'contact', label: 'איש מקצוע', hint: 'רו״ח, עו״ד, יועץ… נשמר באנשי קשר' },
  { who: 'none', label: 'רק מוזמן', hint: 'לא נשמר ב-PIVO' },
];

/** מי זה ב-PIVO — לפי מייל. */
export interface Known {
  type: 'client' | 'spouse' | 'lead' | 'companion' | 'contact';
  name: string;
  /** תגית קצרה ליד השם: «לקוח», «ליד», «בפנייה של אבי פרץ», «איש קשר · רו״ח». */
  tag: string;
  clientId?: string;
  leadId?: string;
  contactId?: string;
  /** ליד סגור — בשיחת היכרות הוא נפתח מחדש (השרת, 226). */
  closedLead?: boolean;
}

export interface Person {
  email: string;
  name: string;
  known?: Known;
  /** «מי זה?» — רק לאדם חדש. */
  who?: Who;
  role?: string;
  organization?: string;
  relation?: CompanionRelation;
}

const lower = (s?: string | null) => (s ?? '').trim().toLowerCase();
const clientName = (c: Client) => `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();

/** כל מי שיש לו מייל ב-PIVO. ‼ לקוח גובר על ליד, וליד על איש קשר — כמו בשרת. */
export function buildDirectory(clients: Client[], leads: Lead[], contacts: Contact[]): Map<string, Known> {
  const m = new Map<string, Known>();
  const put = (email: string | undefined | null, k: Known) => { if (email && !m.has(lower(email))) m.set(lower(email), k); };
  for (const c of clients) {
    put(c.email, { type: 'client', name: clientName(c), tag: 'לקוח', clientId: c.id });
    put(c.spouseEmail, { type: 'spouse', name: c.spouseName ?? '', tag: `בן/בת הזוג של ${clientName(c)}`, clientId: c.id });
  }
  const open = leads.filter(l => !l.convertedClientId && l.status !== 'converted');
  for (const l of open) put(l.email, { type: 'lead', name: l.fullName, tag: 'ליד', leadId: l.id, closedLead: l.status === 'closed' });
  for (const l of open) {
    for (const c of l.companions ?? []) {
      put(c.email, {
        type: 'companion', name: c.name ?? '', leadId: l.id, closedLead: l.status === 'closed',
        tag: `${COMPANION_RELATION_LABELS[c.relation] ?? ''} בפנייה של ${l.fullName}`.trim(),
      });
    }
  }
  for (const c of contacts) {
    const sub = contactSubtitle(c);
    put(c.email, { type: 'contact', name: c.fullName, tag: `איש קשר${sub ? ` · ${sub}` : ''}`, contactId: c.id });
  }
  return m;
}

/** התגית בפגישה הזו: ליד סגור נפתח מחדש רק בשיחת היכרות. */
export function knownTag(k: Known, kind: MeetingKind): string {
  if (!k.closedLead) return k.tag;
  return kind === 'intro' ? `${k.tag} · סגור, ייפתח מחדש` : `${k.tag} · סגור`;
}

/** חיפוש לפי שם, תגית או מייל — מי שכבר בפגישה לא מוצע שוב. */
export function searchDirectory(dir: Map<string, Known>, query: string, exclude: Set<string>, limit = 6): { email: string; k: Known }[] {
  const q = squash(query.trim());
  if (q.length < 2) return [];
  const ql = lower(query);
  return [...dir.entries()]
    .filter(([email, k]) => !exclude.has(email) && (squash(k.name).includes(q) || squash(k.tag).includes(q) || email.includes(ql)))
    .slice(0, limit)
    .map(([email, k]) => ({ email, k }));
}

/** לקוח פוטנציאלי: ליד קיים / אדם בפנייה, או אדם חדש שסומן «לקוח פוטנציאלי». */
export function isLeadish(p?: Person): boolean {
  if (!p) return false;
  if (p.known) return p.known.type === 'lead' || p.known.type === 'companion';
  return p.who === 'lead';
}

/** סוג הפגישה לפי האדם הראשון. */
export function autoKind(first?: Person): MeetingKind {
  if (!first) return 'intro';
  return isLeadish(first) ? 'intro' : 'work';
}

/** «(לקוח קיים)» — למה נבחר הסוג. */
export function kindReason(first: Person): string {
  if (first.known) {
    switch (first.known.type) {
      case 'client': return 'לקוח קיים';
      case 'spouse': return 'בן/בת זוג של לקוח';
      case 'contact': return 'איש קשר';
      default: return 'ליד';
    }
  }
  return first.who === 'lead' ? 'לקוח פוטנציאלי' : first.who === 'contact' ? 'איש מקצוע' : 'מוזמן';
}

export function kindWhyLine(first: Person): string {
  const who = first.name || first.email;
  return `נבחר לבד לפי ${who} (${kindReason(first)}) ⇒ ${MEETING_KIND_LABELS[autoKind(first)]}. אפשר לשנות.`;
}

/** אדם חדש שסומן «לקוח פוטנציאלי» נשמר בפנייה של הראשון — כמו companionsFrom בשרת. */
export function isCompanion(people: Person[], i: number, kind: MeetingKind): boolean {
  const p = people[i];
  return i > 0 && !!p && !p.known && p.who === 'lead' && kind === 'intro' && isLeadish(people[0]);
}

/** מה יקרה לאדם החדש — שורה אחת בכרטיס שלו. */
export function newPersonFate(people: Person[], i: number, kind: MeetingKind): string {
  const p = people[i];
  if (p.who === 'contact') return 'יישמר באנשי קשר';
  if (p.who === 'none') return 'לא יישמר — רק מוזמן';
  if (isCompanion(people, i, kind)) return `יישמר בפנייה של ${people[0].name || 'הפונה הראשון'}`;
  return 'יישמר כליד';
}

/** «מי זה?» שמוצע לאדם חדש: ליד, אלא אם הראשון לקוח או איש קשר (אז לרוב איש מקצוע). */
export function defaultWho(people: Person[]): Who {
  const first = people[0];
  if (!first || isLeadish(first)) return 'lead';
  return 'contact';
}

/** מה חסר לפני שליחה — במשפט שאפשר לפעול לפיו. */
export function peopleProblems(people: Person[]): string[] {
  const out: string[] = [];
  if (people.length === 0) out.push('בחרו עם מי — חיפוש לפי שם או מייל, או «+ אדם חדש».');
  for (const p of people) {
    if (p.known || p.name.trim()) continue;
    if (p.who === 'lead') out.push(`כתבו שם ל-${p.email} — כך הוא יישמר כליד.`);
    if (p.who === 'contact') out.push(`כתבו שם ל-${p.email} — כך הוא יישמר באנשי הקשר.`);
  }
  return out;
}

/** המוזמנים כפי שהשרת מקבל אותם (parseCreate). */
export function guestsPayload(people: Person[], kind: MeetingKind): Record<string, unknown>[] {
  return people.map((p, i) => ({
    email: p.email,
    ...(p.name.trim() ? { name: p.name.trim() } : {}),
    ...(!p.known && p.who ? { saveAs: p.who } : {}),
    ...(!p.known && p.who === 'contact' ? { contact: { role: (p.role ?? '').trim(), organization: (p.organization ?? '').trim() } } : {}),
    ...(isCompanion(people, i, kind) ? { relation: p.relation ?? DEFAULT_COMPANION_RELATION } : {}),
  }));
}

/** אדם מהספרייה — עם השם שלו. */
export function personFromKnown(email: string, k: Known): Person {
  return { email: lower(email), name: k.name, known: k };
}

/**
 * כל המיילים מהודעת וואטסאפ שהודבקה. מוכר ⇒ מהספרייה; חדש ⇒ אדם חדש, עם השם מההודעה לראשון.
 * ‼ מי שכבר בפגישה לא נוסף שוב.
 */
export function peopleFromPaste(text: string, dir: Map<string, Known>, existing: Person[]): Person[] {
  const have = new Set(existing.map(p => p.email));
  const suggested = suggestNameFromWhatsApp(text);
  const out: Person[] = [];
  const all = [...existing];
  for (const email of extractEmails(text)) {
    if (have.has(email)) continue;
    have.add(email);
    const k = dir.get(email);
    const p: Person = k ? personFromKnown(email, k) : {
      email, name: out.length === 0 && existing.length === 0 ? suggested ?? '' : '', who: defaultWho(all),
    };
    out.push(p);
    all.push(p);
  }
  return out;
}
