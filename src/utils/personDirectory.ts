// ─── ספריית האנשים — שורה אחת לכל אדם ────────────────────────────────────────
// מסך הלקוחות V3.3: אדם הוא המושג הקבוע. כרטיס לקוח וליד-בלי-כרטיס מוצגים
// באותה רשימה, כי מי שמחפש "ישראל כהן" לא אמור לדעת באיזו טבלה הוא יושב.
// המקור החזותי המחייב: docs/prototypes/customers-v3-production-reference.html
//
// ‼ ליד שהומר (convertedClientId) אינו מופיע — הכרטיס שלו כבר ברשימה.
// ‼ ארכיון ולידים סגורים מוסתרים כברירת מחדל אבל נמצאים בחיפוש — היעלמות
//   מוחלטת הייתה הופכת כל חיפוש היסטורי ל"אין תוצאה" שקרית.

import type { Client } from '../types';
import type { Lead } from '../types/quotations';
import type { AdditionalCharge } from '../types/charges';
import { CHARGE_STATUS_LABELS } from '../types/charges';
import { squash, normalizePhone, normalizeEmail, normalizeIdNumber } from './identity';

export type PersonBadgeCls = 'active' | 'rep' | 'quote' | 'new' | 'gray';

export interface PersonRow {
  /** מזהה הרשומה המקורית — משמש גם בכתובת ‎#/clients/p/{id}‎. */
  id: string;
  kind: 'client' | 'lead';
  name: string;
  initials: string;
  idNumber?: string;
  phone?: string;
  email?: string;
  badge: { cls: PersonBadgeCls; label: string };
  /** רמז ההקשר בקצה השורה — פעילות אחרונה, בטקסט שקט. */
  cue: string;
  /** מוסתר מהרשימה הרגילה; מופיע רק כשחיפוש מוצא אותו. */
  hidden: boolean;
  /**
   * התאמה אפשרית ללקוח קיים — רק לידים מקישור ציבורי עם match_client_id.
   * מוצג בשורה ובתצוגה המהירה לרו"ח המחובר בלבד; המגיש הציבורי לא נחשף לזה
   * לעולם (הבדיקה רצה בשרת, בתוך submit-application, לא כאן).
   */
  possibleMatch: boolean;
  /** מזהה הלקוח הקיים שאליו יש התאמה אפשרית — רק כש-possibleMatch. */
  matchClientId?: string;
  client?: Client;
  lead?: Lead;
  /**
   * חיובים נוספים פתוחים של הלקוח, מהישן לחדש (הראשון הוא זה שנשאר "ראשי"
   * עד שהוא מטופל — ראה docs/prototypes/customers-v3-production-reference.html).
   * רק לשורות client; ריק כברירת מחדל.
   */
  charges: AdditionalCharge[];
  /** מחרוזות מנורמלות להשוואה — נבנות פעם אחת. */
  haystack: string[];
}

const clientName = (c: Client) =>
  `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.businessName || c.idNumber || '—';

function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')) || '?';
}

// ─── רמז הפעילות ─────────────────────────────────────────────────────────────

function daysAgo(iso?: string): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

function relativeCue(verb: string, iso?: string): string {
  const d = daysAgo(iso);
  if (d === null) return '';
  if (d <= 0) return `${verb} היום`;
  if (d === 1) return `${verb} אתמול`;
  if (d < 30) return `לפני ${d} ימים`;
  return new Date(iso!).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ─── תגית המצב — ארבע התגיות מהייחוס + מצבים שאין לו דוגמן עבורם ────────────

function clientBadge(c: Client): { cls: PersonBadgeCls; label: string } {
  switch (c.lifecycleStage ?? 'active') {
    case 'lead': return { cls: 'new', label: 'חדש · ממתין לטיפול' };
    case 'quoted': return { cls: 'quote', label: 'הצעה נשלחה' };
    case 'onboarding': return { cls: 'rep', label: 'בקליטה' };
    case 'archived': return { cls: 'gray', label: 'ארכיון' };
    default: return { cls: 'active', label: 'לקוח פעיל' };
  }
}

function leadBadge(l: Lead): { cls: PersonBadgeCls; label: string } {
  if (l.status === 'quoted') return { cls: 'quote', label: 'הצעה נשלחה' };
  if (l.status === 'closed') return { cls: 'gray', label: 'ליד סגור' };
  return { cls: 'new', label: 'חדש · ממתין לטיפול' };
}

// ─── בניית השורות ────────────────────────────────────────────────────────────

function buildHaystack(name: string, idNumber?: string, phone?: string, email?: string,
  city?: string, extra: string[] = []): string[] {
  const words = name.split(/\s+/).filter(Boolean);
  const reversed = words.length > 1 ? [...words].reverse().join('') : '';
  return [
    squash(name),
    reversed.toLowerCase(),
    normalizeIdNumber(idNumber),
    squash(idNumber),
    normalizePhone(phone),
    squash(normalizeEmail(email)),
    squash(city),
    ...extra.map(squash),
  ].filter(Boolean);
}

/** "הצהרת הון · ממתין לתשלום · +1" — הראשון תמיד קובע, השאר נספרים בלבד. */
function chargesCue(charges: AdditionalCharge[]): string | null {
  if (charges.length === 0) return null;
  const first = charges[0];
  const extra = charges.length > 1 ? ` · +${charges.length - 1}` : '';
  return `${first.description} · ${CHARGE_STATUS_LABELS[first.status]}${extra}`;
}

export function buildPersonRows(clients: Client[], leads: Lead[], charges: AdditionalCharge[] = []): PersonRow[] {
  const rows: PersonRow[] = [];

  const chargesByClient = new Map<string, AdditionalCharge[]>();
  for (const ch of charges) {
    const list = chargesByClient.get(ch.clientId);
    if (list) list.push(ch); else chargesByClient.set(ch.clientId, [ch]);
  }
  // מהישן לחדש — מי שנוסף ראשון נשאר "ראשי" בשורה ובתצוגה המהירה עד שהוא
  // מטופל; חיוב חדש רק מגדיל את מונה ה-+N ולא מחליף את מי שכבר מוצג.
  for (const list of chargesByClient.values()) {
    list.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  }

  for (const c of clients) {
    const name = clientName(c);
    const contactBits = (c.additionalContacts ?? []).flatMap(ct =>
      [ct.name, ct.phone, ct.email].filter(Boolean) as string[]);
    const clientCharges = chargesByClient.get(c.id) ?? [];
    rows.push({
      id: c.id,
      kind: 'client',
      name,
      initials: initialsOf(name),
      idNumber: c.idNumber || undefined,
      phone: c.phone || undefined,
      email: c.email || undefined,
      badge: clientBadge(c),
      cue: chargesCue(clientCharges) ?? relativeCue('עודכן', c.updatedAt ?? c.createdAt),
      hidden: c.lifecycleStage === 'archived',
      possibleMatch: false,
      client: c,
      charges: clientCharges,
      haystack: buildHaystack(name, c.idNumber, c.phone, c.email, c.city,
        [c.businessName ?? '', ...contactBits]),
    });
  }

  for (const l of leads) {
    // ‼ 'converted' בלי convertedClientId הוא מצב יתום (למשל עריכה ידנית של
    // סטטוס) — עדיין לא אמור להישאר ברשימה הרגילה כאילו הוא "חדש וממתין".
    if (l.convertedClientId || l.status === 'converted') continue;
    const name = l.fullName?.trim() || l.businessName || '—';
    rows.push({
      id: l.id,
      kind: 'lead',
      name,
      initials: initialsOf(name),
      phone: l.phone || undefined,
      email: l.email || undefined,
      badge: leadBadge(l),
      cue: relativeCue('נוצר', l.createdAt),
      hidden: l.status === 'closed',
      possibleMatch: !!l.matchClientId,
      matchClientId: l.matchClientId,
      lead: l,
      charges: [],
      haystack: buildHaystack(name, undefined, l.phone, l.email, undefined,
        [l.businessName ?? '']),
    });
  }

  return rows;
}

// ─── חיפוש ───────────────────────────────────────────────────────────────────
// שם מלא עובד כי גם השאילתה וגם השורה נמעכות (squash); טלפון עובד בכל
// פורמט כי שני הצדדים עוברים normalizePhone; ת"ז עם או בלי אפס מוביל —
// שני הצדדים מושלמים ל-9 ספרות.

export function searchPersonRows(rows: PersonRow[], query: string): PersonRow[] {
  const q = query.trim();
  if (!q) return rows.filter(r => !r.hidden);

  const needles = [squash(q)];
  const phoneNeedle = normalizePhone(q);
  if (phoneNeedle.length >= 3 && phoneNeedle !== needles[0]) needles.push(phoneNeedle);
  if (/^\d+$/.test(q.replace(/[\s-]/g, ''))) {
    const padded = normalizeIdNumber(q);
    if (padded && !needles.includes(padded)) needles.push(padded);
  }

  return rows.filter(r =>
    needles.some(n => n && r.haystack.some(h => h.includes(n))));
}
